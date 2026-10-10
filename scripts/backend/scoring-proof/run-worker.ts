/**
 * Scoring proof: run the REAL Fantasy worker (`runFantasyLifecycle`, the code the
 * production workflow runs) on the proof gameweek. Every durable step is one of the
 * worker's own guarded database RPCs, called as the service role.
 *
 *   local:  bun scripts/backend/scoring-proof/run-worker.ts --psql "<psql connection args>"
 *   staging (one call at a time, through an operator's SQL connection):
 *           bun scripts/backend/scoring-proof/run-worker.ts --replay calls.json
 *
 * `--replay` replays the answers already recorded in calls.json, in order, and checks
 * each recorded call is exactly the one the worker makes now. At the first call with
 * no answer it writes that call's SQL to calls.json.next.sql and exits with code 10;
 * the operator runs that SQL ONCE, appends its answer, and starts the script again.
 * A call is therefore executed once even though the worker is restarted.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  rpcFailure,
  runFantasyLifecycle,
  type FantasyWorkerGateway,
} from "../fantasy-lifecycle-runner";

export const PROOF_GAMEWEEK = "fb5c0000-0000-4000-8000-c00000000007";

const literal = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("scoring_proof_number_invalid");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const quoted = `'${text.replace(/'/g, "''")}'`;
  return typeof value === "string" ? quoted : `${quoted}::jsonb`;
};

/** One statement: the service claim, then the RPC, returning its JSON as text. */
export function callSql(name: string, args: Record<string, unknown>): string {
  if (!/^service_[a-z_]+$/.test(name)) throw new Error("scoring_proof_rpc_not_service");
  const named = Object.entries(args)
    .map(([key, value]) => {
      if (!/^p_[a-z_]+$/.test(key)) throw new Error("scoring_proof_arg_invalid");
      return `${key} => ${literal(value)}`;
    })
    .join(", ");
  return `select set_config('request.jwt.claims', '{"role":"service_role"}', true);\nselect api.${name}(${named})::text as answer;`;
}

/** Postgres raises the worker's codes as the message (e.g. `stale_update`). */
const failureOf = (text: string) => {
  const code = /ERROR:\s+([a-z_]{3,80})\b/.exec(text)?.[1] ?? "scoring_proof_rpc_failed";
  return rpcFailure(code, undefined);
};

export function psqlGateway(connection: readonly string[]): FantasyWorkerGateway {
  return {
    async rpc(name, args) {
      try {
        const out = execFileSync(
          "psql",
          ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", ...connection],
          {
            input: `begin;\n${callSql(name, args)}\ncommit;\n`,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        const lines = out.trim().split("\n");
        return JSON.parse(lines[lines.length - 1] ?? "null");
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        throw failureOf(stderr);
      }
    },
  };
}

export interface RecordedCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  /** The RPC's JSON answer, or the error code it raised. */
  readonly answer?: unknown;
  readonly error?: string;
}

export class NeedsCall extends Error {
  constructor(readonly sql: string) {
    super("scoring_proof_needs_call");
  }
}

export function replayGateway(
  recorded: RecordedCall[],
): FantasyWorkerGateway & { used: () => number } {
  let index = 0;
  return {
    used: () => index,
    async rpc(name, args) {
      const call = recorded[index];
      if (!call) {
        recorded.push({ name, args });
        throw new NeedsCall(callSql(name, args));
      }
      if (call.name !== name || JSON.stringify(call.args) !== JSON.stringify(args))
        throw new Error(`scoring_proof_replay_diverged at call ${index + 1} (${name})`);
      index++;
      if (call.error) throw rpcFailure(call.error, undefined);
      if (!("answer" in call)) throw new NeedsCall(callSql(name, args));
      return call.answer;
    },
  };
}

async function main() {
  const at = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const options = { gameweekId: PROOF_GAMEWEEK, calculationVersion: 1, batchSize: 100 };
  if (at("--psql")) {
    const result = await runFantasyLifecycle(
      psqlGateway((at("--psql") as string).split(" ")),
      options,
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const file = at("--replay");
  if (!file) throw new Error("--psql <args> or --replay <calls.json> is required");
  const recorded: RecordedCall[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const pendingAnswer = recorded.findIndex((c) => !("answer" in c) && !c.error);
  if (pendingAnswer >= 0) {
    console.error(
      `Call ${pendingAnswer + 1} (${recorded[pendingAnswer]!.name}) has no answer yet.`,
    );
    process.exit(10);
  }
  try {
    const result = await runFantasyLifecycle(replayGateway(recorded), options);
    console.log(JSON.stringify({ calls: recorded.length, result }, null, 2));
  } catch (error) {
    if (!(error instanceof NeedsCall)) throw error;
    writeFileSync(file, JSON.stringify(recorded, null, 1));
    writeFileSync(`${file}.next.sql`, `${error.sql}\n`);
    console.error(
      `Call ${recorded.length} (${recorded[recorded.length - 1]!.name}): run ${file}.next.sql once, then record its answer.`,
    );
    process.exit(10);
  }
}

if (import.meta.main) await main();
