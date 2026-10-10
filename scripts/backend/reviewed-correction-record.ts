/**
 * Reviewed corrections, step 3 of 3: record the approved proposals committed
 * under PROPOSAL_DIR (one JSON file per fixture, merged to main by the owner).
 *
 * MODE=dry-run runs every database guard for every proposal and rolls back.
 * MODE=record first dry-runs them all and writes nothing unless every one
 * passes; then records them one at a time and reads each back.
 *
 *   SUPABASE_ACCESS_TOKEN=… PROPOSAL_DIR=docs/production/reviewed-corrections/gw3 \
 *   MODE=dry-run REVIEWER=… REASON=… bun scripts/backend/reviewed-correction-record.ts
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { observationPayload, type Proposal } from "./reviewed-correction";
import {
  dryRunSql,
  managementQuery,
  PRODUCTION_PROJECT_REF,
  readDryRun,
  recordSql,
} from "./reviewed-correction-db";

async function main(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  const dir = process.env.PROPOSAL_DIR ?? "";
  const mode = process.env.MODE;
  const reviewer = (process.env.REVIEWER ?? "").trim();
  const reason = (process.env.REASON ?? "").trim();
  if (!token || !dir) throw new Error("SUPABASE_ACCESS_TOKEN and PROPOSAL_DIR are required");
  if (mode !== "dry-run" && mode !== "record") throw new Error("MODE must be dry-run or record");
  if (reviewer.length < 3 || reviewer.length > 200)
    throw new Error("REVIEWER must be 3-200 characters");
  if (reason.length < 8 || reason.length > 500) throw new Error("REASON must be 8-500 characters");
  const query = (sql: string) =>
    managementQuery(sql, { token, projectRef: PRODUCTION_PROJECT_REF });

  const files = (await readdir(dir)).filter((name) => /^[1-9]\d{0,14}\.json$/.test(name)).sort();
  if (files.length === 0) throw new Error(`no proposals in ${dir}`);
  const proposals = await Promise.all(
    files.map(async (name) => JSON.parse(await readFile(resolve(dir, name), "utf8")) as Proposal),
  );

  // Every guard first, for every fixture. Nothing is written if one fails.
  let allPass = true;
  const payloads = new Map<string, Record<string, unknown>>();
  for (const proposal of proposals) {
    if (proposal.blockers.length) {
      allPass = false;
      console.log(
        `::error::fixture ${proposal.fixtureExternalId}: proposal has ${proposal.blockers.length} blocker(s)`,
      );
      continue;
    }
    const payload = observationPayload(proposal, reviewer, reason);
    payloads.set(proposal.fixtureExternalId, payload);
    let outcome;
    try {
      await query(dryRunSql(proposal.fixtureId, payload));
      outcome = { ok: false as const, code: "dry_run_did_not_roll_back" };
    } catch (error) {
      outcome = readDryRun(error);
    }
    if (outcome.ok) {
      console.log(
        `::notice::fixture ${proposal.fixtureExternalId}: dry run OK simpleReady=${String(outcome.result.simpleReady)} fullReady=${String(outcome.result.fullReady)}`,
      );
      if (outcome.result.simpleReady !== true) {
        allPass = false;
        console.log(
          `::error::fixture ${proposal.fixtureExternalId}: would be stored but not scorable (simpleReady false)`,
        );
      }
    } else {
      allPass = false;
      console.log(
        `::error::fixture ${proposal.fixtureExternalId}: dry run refused ${outcome.code}`,
      );
    }
  }
  if (!allPass) throw new Error("dry_run_failed_nothing_written");
  if (mode === "dry-run") {
    console.log("REVIEWED_CORRECTION_DRY_RUN_PASS");
    return;
  }

  for (const proposal of proposals) {
    const rows = await query(
      recordSql(proposal.fixtureId, payloads.get(proposal.fixtureExternalId)),
    );
    const result = (rows[0] as { result?: Record<string, unknown> } | undefined)?.result ?? {};
    const check = await query(
      `select source, digest, simple_ready from app_private.fantasy_fixture_observations
       where fixture_id = '${proposal.fixtureId}'::uuid order by observed_at desc, id desc limit 1`,
    );
    const latest = check[0] as
      | { source?: string; digest?: string; simple_ready?: boolean }
      | undefined;
    const stored = latest?.source === "reviewed-correction" && latest.digest === result.digest;
    console.log(
      `::${stored ? "notice" : "error"}::fixture ${proposal.fixtureExternalId}: ${stored ? "recorded" : "NOT confirmed"} observation=${String(result.observationId)} simpleReady=${String(latest?.simple_ready)}`,
    );
    if (!stored) throw new Error(`record_not_confirmed ${proposal.fixtureExternalId}`);
  }
  console.log("REVIEWED_CORRECTION_RECORDED");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      `REVIEWED_CORRECTION_FAILED ${error instanceof Error ? error.message : "unknown"}`,
    );
    process.exit(1);
  });
}
