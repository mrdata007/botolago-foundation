/**
 * Owner-run SofaScore ID bridge on Production V2: rehearsal (never commits) and
 * apply (commits once).
 *
 *   bun scripts/backend/sofascore-id-bridge-production-run.ts \
 *     --mode rehearse|apply --dir <fetch output dir> [--plan-sha256 <hex>]
 *
 * Inputs: the fetch script's events.json and snapshot.json (read from
 * production), the committed manifest, and from the environment
 * SUPABASE_ACCESS_TOKEN, SUPABASE_PRODUCTION_PROJECT_REF and
 * SOFASCORE_ID_BRIDGE_PRODUCTION_CONFIRMATION. Exit codes: 0 verified,
 * 2 refused before any write, 3 outcome could not be verified, 5 needs review.
 * Never retries. Evidence goes to EVIDENCE_DIR (counts and ids only).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planSofascoreIdBridge } from "../../src/backend/football/sofascore-id-bridge";
import {
  PRODUCTION_PROJECT_REF,
  SOFASCORE_COMPETITION_ID,
  SOFASCORE_SEASON_ID,
  parseEvents,
  parseSnapshot,
} from "./sofascore-id-bridge";
import { snapshotSql } from "./sofascore-id-bridge-fetch";
import {
  APPLY_CONFIRMATION,
  MANIFEST_PATH,
  REHEARSE_CONFIRMATION,
  STATE_SQL,
  appliedRowsProblems,
  assertApprovedHash,
  buildDoBlock,
  comparePlanToManifest,
  extractRehearsalResult,
  manifestTeams,
  parseManifest,
  planSha256,
  rehearsalResultProblems,
  writerProblems,
  type DbState,
  type Manifest,
  type RunMode,
} from "./sofascore-id-bridge-production";

const API = "https://api.supabase.com";

class Refused extends Error {}

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

async function post(token: string, sql: string, readOnly: boolean) {
  const response = await fetch(`${API}/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  return { status: response.status, body: await response.text() };
}

async function readJsonColumn<T>(token: string, sql: string, column: string): Promise<T> {
  const { status, body } = await post(token, sql, true);
  if (status !== 200 && status !== 201) throw new Refused(`read_failed: HTTP ${status}`);
  const value = (JSON.parse(body) as Array<Record<string, unknown>>)[0]?.[column];
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function planFrom(manifest: Manifest, dir: string, snapshotValue: unknown) {
  return planSofascoreIdBridge({
    events: parseEvents(JSON.parse(readFileSync(join(dir, "events.json"), "utf8"))),
    competition: {
      externalId: SOFASCORE_COMPETITION_ID,
      internalId: manifest.competition.internalId,
    },
    season: {
      externalId: SOFASCORE_SEASON_ID,
      internalId: manifest.season.internalId,
    },
    teams: manifestTeams(manifest),
    rounds: parseSnapshot(snapshotValue).rounds,
    fixtures: parseSnapshot(snapshotValue).fixtures,
    existing: parseSnapshot(snapshotValue).existing,
  });
}

async function main(): Promise<number> {
  const mode = arg("--mode") as RunMode | undefined;
  if (mode !== "rehearse" && mode !== "apply")
    throw new Refused("--mode must be rehearse or apply");
  const dir = arg("--dir");
  if (!dir) throw new Refused("--dir is required");
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? "";
  if (!token) throw new Refused("missing SUPABASE_ACCESS_TOKEN");
  if (process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim() !== PRODUCTION_PROJECT_REF)
    throw new Refused("production project-ref guard failed");
  const phrase = mode === "apply" ? APPLY_CONFIRMATION : REHEARSE_CONFIRMATION;
  if (process.env.SOFASCORE_ID_BRIDGE_PRODUCTION_CONFIRMATION !== phrase)
    throw new Refused(`confirmation must be ${phrase}`);

  const manifest = parseManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
  const evidenceDir = process.env.EVIDENCE_DIR ?? join(dir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const evidence: Record<string, unknown> = { mode, manifest: MANIFEST_PATH };
  const save = (outcome: string) => {
    evidence.outcome = outcome;
    writeFileSync(
      join(evidenceDir, `sofascore-id-bridge-${mode}-evidence.json`),
      JSON.stringify(evidence, null, 2),
    );
    console.log(outcome);
  };

  // 1. Plan from the fetched files, compared with the manifest: no drift.
  const fetched = JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf8"));
  const ids = JSON.parse(readFileSync(join(dir, "ids.json"), "utf8")) as {
    competitionId: string;
    seasonId: string;
  };
  if (
    ids.competitionId !== manifest.competition.internalId ||
    ids.seasonId !== manifest.season.internalId
  )
    throw new Refused("the fetched competition/season are not the manifest's");
  const plan = planFrom(manifest, dir, fetched);
  const hash = planSha256(plan, manifest);
  evidence.planSha256 = hash;
  console.log(`Plan sha256: ${hash}`);
  const drift = comparePlanToManifest(plan, manifest);
  if (drift.length > 0)
    throw new Refused(`plan differs from the manifest:\n - ${drift.join("\n - ")}`);
  // Apply needs the owner-approved hash; a rehearsal checks it only when given.
  if (mode === "apply" || arg("--plan-sha256")) assertApprovedHash(arg("--plan-sha256"), hash);

  // 2. Fresh read immediately before the write: same plan, same hash.
  const fresh = await readJsonColumn<unknown>(
    token,
    snapshotSql(manifest.season.internalId),
    "snapshot",
  );
  const freshHash = planSha256(planFrom(manifest, dir, fresh), manifest);
  if (freshHash !== hash)
    throw new Refused(`production changed since the fetch (fresh plan ${freshHash})`);

  // 3. Baseline and one-writer checks from the database side.
  const before = await readJsonColumn<DbState>(token, STATE_SQL, "state");
  evidence.before = { ...before, sofascore_rows_detail: undefined };
  if (before.sofascore_rows !== 0)
    throw new Refused(
      `baseline: ${before.sofascore_rows} SofaScore bridge mapping row(s) already exist; ` +
        (mode === "apply"
          ? "this one-shot apply has already run or a partial state exists"
          : "nothing to rehearse"),
    );
  const writer = writerProblems(before);
  if (writer.length > 0)
    throw new Refused(
      `one-writer checks failed (pause the crons first):\n - ${writer.join("\n - ")}`,
    );
  console.log("Pre-state verified: 0 SofaScore bridge rows, crons paused, no busy session.");

  // 4. The one DO block, sent once and never retried.
  const sql = buildDoBlock(mode, plan, manifest);
  const call = await post(token, sql, false);
  evidence.httpStatus = call.status;
  console.log(`DO block: HTTP ${call.status}`);

  // 5. Whatever the client reported, classify from a fresh read.
  let after: DbState;
  try {
    after = await readJsonColumn<DbState>(token, STATE_SQL, "state");
  } catch (error) {
    evidence.afterReadError = String(error);
    save(
      mode === "apply"
        ? "SOFASCORE_BRIDGE_APPLY_OUTCOME_UNVERIFIED"
        : "SOFASCORE_BRIDGE_REHEARSAL_OUTCOME_UNVERIFIED",
    );
    return 3;
  }
  evidence.after = { ...after, sofascore_rows_detail: undefined };
  const untouched =
    after.other_mapping_rows === before.other_mapping_rows &&
    after.other_mapping_digest === before.other_mapping_digest;

  if (mode === "rehearse") {
    const result = extractRehearsalResult(call.body);
    evidence.rehearsalResult = result;
    const problems = [
      ...(call.status === 200 || call.status === 201
        ? ["the rehearsal returned success: the deliberate raise did not run"]
        : []),
      ...rehearsalResultProblems(result, manifest),
      ...(after.sofascore_rows !== 0
        ? [`rollback did not hold: ${after.sofascore_rows} SofaScore bridge rows remain`]
        : []),
      ...(untouched ? [] : ["non-target mappings (including SofaScore players) changed"]),
    ];
    evidence.problems = problems;
    if (problems.length > 0) {
      problems.forEach((p) => console.log(" -", p));
      save("SOFASCORE_BRIDGE_REHEARSAL_NEEDS_REVIEW");
      return 5;
    }
    console.log(`Rehearsal computed state: ${JSON.stringify(result)}`);
    console.log(
      "Re-read after rollback: 0 SofaScore bridge mappings; non-target mappings (including SofaScore players) unchanged.",
    );
    console.log(`Approve this exact hash for the apply: ${hash}`);
    save("SOFASCORE_BRIDGE_REHEARSAL_ROLLED_BACK_AND_VERIFIED");
    return 0;
  }

  if (after.sofascore_rows === 0 && untouched) {
    evidence.callBody = call.body.slice(0, 500);
    save("SOFASCORE_BRIDGE_APPLY_FAILED_ROLLED_BACK");
    return 4;
  }
  const problems = [
    ...appliedRowsProblems(after.sofascore_rows_detail, plan, manifest),
    ...(after.sofascore_rows !== manifest.expected.totalRows
      ? [`SofaScore bridge rows (any state): ${after.sofascore_rows}`]
      : []),
    ...(untouched ? [] : ["non-target mappings (including SofaScore players) changed"]),
  ];
  evidence.problems = problems;
  if (problems.length > 0) {
    problems.forEach((p) => console.log(" -", p));
    save("SOFASCORE_BRIDGE_COMMITTED_NEEDS_REVIEW");
    return 5;
  }
  console.log(
    `Verified: ${after.sofascore_active_rows} active SofaScore bridge mappings, exactly the plan.`,
  );
  save("SOFASCORE_BRIDGE_PRODUCTION_APPLIED_AND_VERIFIED");
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.log(
      `SOFASCORE_BRIDGE_REFUSED_BEFORE_WRITE: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 2;
  }
}
