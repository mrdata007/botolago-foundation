/**
 * SofaScore-only Fantasy ingestion for finished fixtures
 * (docs/backend/SOFASCORE_FANTASY_SIMPLE.md).
 *
 *   bun scripts/backend/sofascore-fantasy-simple-ingest.ts --mode report|rehearse|apply \
 *     [--round <n>] [--fixtures <uuid,uuid>] [--include-observed] [--plan-sha256 <hex>] \
 *     [--out <file>]
 *
 * - report (default): READ ONLY. Reads production with single SELECTs, fetches
 *   SofaScore lineups, incidents and statistics (3 requests per fixture), builds
 *   the observations and prints counts, the mapping worklist (SofaScore ids and
 *   shirt numbers, no names) and the plan hash. It never writes and never calls
 *   the database function, not even as a dry run (a rolled-back call still takes
 *   locks).
 * - rehearse: one DO block that calls the database function for every ready
 *   fixture and ends in a deliberate raise, then re-reads to prove the rollback.
 * - apply: the same block, ending normally. Needs the plan hash the owner
 *   approved from the report/rehearsal.
 *
 * Environment: RAPIDAPI_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_PRODUCTION_PROJECT_REF;
 * rehearse/apply also SOFASCORE_FANTASY_CONFIRMATION and EVIDENCE_DIR.
 * Exit codes: 0 ok, 2 refused before any write, 3 outcome unverified, 4 apply
 * failed and rolled back, 5 needs review.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalJson,
  sha256Hex,
} from "../../src/backend/football/identity/bulk-mapping/canonical";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import { SofascorePerformanceProvider } from "../../src/backend/football/provider/sofascore-adapter";
import {
  prepareSofascoreObservation,
  type PreparedSofascoreObservation,
  type SofascoreMatchData,
} from "../../src/backend/fantasy/sofascore-fantasy";
import {
  buildReviewedIdentitySnapshot,
  type MappingRowInput,
  type ReviewedIdentitySnapshot,
} from "../../src/backend/fantasy/reviewed-identities";
import {
  APPLY_CONFIRMATION,
  MAX_WRITE_FIXTURES,
  PRODUCTION_PROJECT_REF,
  REHEARSE_CONFIRMATION,
  appliedProblems,
  buildDoBlock,
  buildReport,
  candidatesSql,
  extractRehearsalResult,
  planSha256,
  resultProblems,
  selectFixtures,
  stateSql,
  writerProblems,
  SCHEMA_SQL,
  type Candidate,
  type PlanItem,
  type SchemaState,
  type Selection,
  type WriteState,
} from "./sofascore-fantasy-simple-lib";

const HOST = "sofascore.p.rapidapi.com";
const MANIFEST = "docs/production/manifests/sofascore-id-bridge-2026-10-10.manifest.json";
const API = "https://api.supabase.com";

class Refused extends Error {}

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

export interface FetchedMatch {
  readonly data: SofascoreMatchData;
  readonly digest: string;
}

/** The summary comes from the database (status and final score); SofaScore is asked for the other three. */
export function summaryOf(c: Candidate): SofascoreMatchData["summary"] {
  return {
    provider: "sofascore",
    externalId: c.sofascoreEventId,
    kickoffAt: "",
    finished: c.status === "finished",
    homeName: "",
    awayName: "",
    homeScore: c.homeScore,
    awayScore: c.awayScore,
    round: c.round,
  };
}

export async function fetchMatch(
  provider: Pick<SofascorePerformanceProvider, "getLineups" | "getIncidents" | "getStatistics">,
  c: Candidate,
): Promise<FetchedMatch> {
  const lineups = await provider.getLineups(c.sofascoreEventId);
  const incidents = await provider.getIncidents(c.sofascoreEventId);
  const statistics = await provider.getStatistics(c.sofascoreEventId);
  return {
    data: { summary: summaryOf(c), lineups, incidents, statistics },
    digest: await sha256Hex(canonicalJson({ lineups, incidents, statistics })),
  };
}

export async function prepareAll(
  selected: readonly Candidate[],
  fetched: ReadonlyMap<string, FetchedMatch>,
  snapshot: ReviewedIdentitySnapshot,
  observedAt: string,
) {
  const out: { candidate: Candidate; result: PreparedSofascoreObservation }[] = [];
  for (const candidate of selected) {
    const match = fetched.get(candidate.fixtureId);
    if (!match) throw new Refused(`no SofaScore data for fixture ${candidate.fixtureId}`);
    out.push({
      candidate,
      result: await prepareSofascoreObservation({
        observedAt,
        match: match.data,
        snapshot,
        binding: {
          appFixtureId: candidate.fixtureId,
          homeTeamId: candidate.homeTeamId,
          awayTeamId: candidate.awayTeamId,
        },
        payloadDigest: match.digest,
      }),
    });
  }
  return out;
}

export function planItems(
  prepared: readonly { candidate: Candidate; result: PreparedSofascoreObservation }[],
): PlanItem[] {
  return prepared.flatMap(({ candidate, result }) =>
    result.request && result.expectedMode
      ? [
          {
            fixtureId: candidate.fixtureId,
            request: result.request,
            expectedMode: result.expectedMode,
          },
        ]
      : [],
  );
}

export async function snapshotFrom(
  rows: readonly {
    id: string;
    externalId: string;
    appPlayerId: string;
    active: boolean;
    reviewed: boolean;
    version: string | null;
    updatedAt: string;
  }[],
  capturedAt: string,
) {
  const mapped: MappingRowInput[] = rows.map((r) => ({
    mappingId: r.id,
    provider: "sofascore",
    externalId: r.externalId,
    appPlayerId: r.appPlayerId,
    active: r.active,
    reviewed: r.reviewed,
    version: r.version,
    updatedAt: r.updatedAt,
  }));
  return buildReviewedIdentitySnapshot(mapped, capturedAt);
}

// ---------------------------------------------------------------------------
// Management API (production)
// ---------------------------------------------------------------------------

async function post(token: string, sql: string, readOnly: boolean) {
  const response = await fetch(`${API}/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  return { status: response.status, body: await response.text() };
}

/** Every read goes through here: one SELECT, sent read-only. */
async function readJson<T>(token: string, sql: string, column: string): Promise<T> {
  if (!/^select\b/i.test(sql.trim())) throw new Refused("read_not_select");
  const { status, body } = await post(token, sql, true);
  if (status !== 200 && status !== 201) throw new Refused(`read_failed: HTTP ${status}`);
  const value = (JSON.parse(body) as Array<Record<string, unknown>>)[0]?.[column];
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

async function main(): Promise<number> {
  const mode = (arg("--mode") ?? "report") as "report" | "rehearse" | "apply";
  if (!["report", "rehearse", "apply"].includes(mode))
    throw new Refused("--mode must be report, rehearse or apply");
  const key = process.env.RAPIDAPI_KEY?.trim() ?? "";
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? "";
  if (!key || !token) throw new Refused("RAPIDAPI_KEY and SUPABASE_ACCESS_TOKEN are required");
  if (process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim() !== PRODUCTION_PROJECT_REF)
    throw new Refused("production project-ref guard failed");
  if (mode !== "report") {
    const phrase = mode === "apply" ? APPLY_CONFIRMATION : REHEARSE_CONFIRMATION;
    if (process.env.SOFASCORE_FANTASY_CONFIRMATION !== phrase)
      throw new Refused(`confirmation must be ${phrase}`);
  }
  const round = arg("--round") === undefined ? undefined : Number(arg("--round"));
  if (round !== undefined && !Number.isInteger(round))
    throw new Refused("--round must be a number");
  const fixtureIds = arg("--fixtures")?.split(",").filter(Boolean);
  if (mode !== "report" && round === undefined && !fixtureIds)
    throw new Refused("a write run needs --round or --fixtures");
  const season = (JSON.parse(readFileSync(MANIFEST, "utf8")) as { season: { internalId: string } })
    .season.internalId;
  const selectOptions = {
    ...(round !== undefined ? { round } : {}),
    ...(fixtureIds ? { fixtureIds } : {}),
    includeObserved: process.argv.includes("--include-observed"),
  };

  // 1. Reads.
  const schema = await readJson<SchemaState>(token, SCHEMA_SQL, "state");
  const snapshotJson = await readJson<{
    fixtures: Candidate[];
    players: Parameters<typeof snapshotFrom>[0];
  }>(token, candidatesSql(season, schema), "snapshot");
  const capturedAt = new Date().toISOString();
  const snapshot = await snapshotFrom(snapshotJson.players, capturedAt);
  const selection: Selection = selectFixtures(snapshotJson.fixtures, selectOptions);
  if (mode !== "report" && selection.selected.length > MAX_WRITE_FIXTURES)
    throw new Refused(`a write run takes at most ${MAX_WRITE_FIXTURES} fixtures`);

  // 2. SofaScore: three requests per selected fixture.
  const client = new RapidApiClient({ host: HOST, key });
  const provider = new SofascorePerformanceProvider(client);
  const fetched = new Map<string, FetchedMatch>();
  for (const c of selection.selected) fetched.set(c.fixtureId, await fetchMatch(provider, c));

  const prepared = await prepareAll(selection.selected, fetched, snapshot, capturedAt);
  const items = planItems(prepared);
  const hash = items.length > 0 ? planSha256(items) : null;
  const report = {
    mode,
    project: PRODUCTION_PROJECT_REF,
    schema,
    mappingSnapshot: {
      digest: snapshot.digest,
      sofascorePlayerMappings: snapshot.entries.length,
      excluded: snapshot.excluded,
    },
    rapidApi: { requests: client.requestsSent(), quota: client.quota() },
    ...buildReport(selection, prepared),
    planSha256: hash,
  };
  const text = JSON.stringify(report, null, 2);
  if (arg("--out")) writeFileSync(arg("--out") as string, text);
  console.log(text);

  const missing = [
    ...(schema.wrapper ? [] : ["migration 20261011110000 is not applied (no database function)"]),
    ...(schema.linksTable
      ? []
      : ["migration 20261003180000 is not applied (no fixture links table)"]),
    ...(schema.adaptiveSchema ? [] : ["the adaptive scoring migration is not applied"]),
  ];
  if (mode === "report") {
    missing.forEach((m) => console.log(`NOT READY TO WRITE: ${m}`));
    return 0;
  }

  // 3. Write modes.
  if (missing.length > 0) throw new Refused(missing.join("; "));
  if (items.length === 0 || hash === null)
    throw new Refused("no fixture is ready: nothing to write");
  if (mode === "apply") {
    const approved = arg("--plan-sha256");
    if (!approved || !/^[0-9a-f]{64}$/.test(approved))
      throw new Refused("plan_sha256 must be the 64-hex hash the owner approved");
    if (approved !== hash)
      throw new Refused(`approved ${approved} but the fresh plan hashes to ${hash}`);
  } else if (arg("--plan-sha256") && arg("--plan-sha256") !== hash) {
    throw new Refused(`approved ${arg("--plan-sha256")} but the fresh plan hashes to ${hash}`);
  }
  const evidenceDir = process.env.EVIDENCE_DIR ?? join(".", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const evidence: Record<string, unknown> = {
    mode,
    planSha256: hash,
    fixtures: items.map((i) => i.fixtureId),
  };
  const save = (outcome: string) => {
    evidence.outcome = outcome;
    writeFileSync(
      join(evidenceDir, `sofascore-fantasy-${mode}-evidence.json`),
      JSON.stringify(evidence, null, 2),
    );
    console.log(outcome);
  };

  // Fresh read immediately before the write: same selection, same plan.
  const fresh = await readJson<{
    fixtures: Candidate[];
    players: Parameters<typeof snapshotFrom>[0];
  }>(token, candidatesSql(season, schema), "snapshot");
  const freshSnapshot = await snapshotFrom(fresh.players, capturedAt);
  const freshSelection = selectFixtures(fresh.fixtures, selectOptions);
  const freshHash = planSha256(
    planItems(await prepareAll(freshSelection.selected, fetched, freshSnapshot, capturedAt)),
  );
  if (freshHash !== hash)
    throw new Refused(`production changed since the fetch (fresh plan ${freshHash})`);

  const ids = items.map((i) => i.fixtureId);
  const before = await readJson<WriteState>(token, stateSql(ids), "state");
  evidence.before = { ...before, forFixtures: before.forFixtures.length };
  const writer = writerProblems(before);
  if (writer.length > 0)
    throw new Refused(
      `one-writer checks failed (pause the crons first):\n - ${writer.join("\n - ")}`,
    );
  console.log("Pre-state verified: crons paused, no busy session.");

  // The one DO block, sent once and never retried.
  const call = await post(token, buildDoBlock(mode, items), false);
  evidence.httpStatus = call.status;
  console.log(`DO block: HTTP ${call.status}`);

  let after: WriteState;
  try {
    after = await readJson<WriteState>(token, stateSql(ids), "state");
  } catch (error) {
    evidence.afterReadError = String(error);
    save(`SOFASCORE_FANTASY_${mode.toUpperCase()}_OUTCOME_UNVERIFIED`);
    return 3;
  }
  evidence.after = { ...after, forFixtures: after.forFixtures.length };
  const unchanged =
    after.observations === before.observations &&
    after.links === before.links &&
    after.otherDigest === before.otherDigest &&
    after.forFixtures.length === before.forFixtures.length;

  if (mode === "rehearse") {
    const result = extractRehearsalResult(call.body);
    evidence.rehearsalResult = result;
    const problems = [
      ...(call.status === 200 || call.status === 201
        ? ["the rehearsal returned success: the deliberate raise did not run"]
        : []),
      ...resultProblems(result, items),
      ...(unchanged ? [] : ["rollback did not hold: observations or links changed"]),
    ];
    evidence.problems = problems;
    if (problems.length > 0) {
      problems.forEach((p) => console.log(" -", p));
      save("SOFASCORE_FANTASY_REHEARSAL_NEEDS_REVIEW");
      return 5;
    }
    console.log(`Rehearsal computed state: ${JSON.stringify(result)}`);
    console.log("Re-read after rollback: observations and links unchanged.");
    console.log(`Approve this exact hash for the apply: ${hash}`);
    save("SOFASCORE_FANTASY_REHEARSAL_ROLLED_BACK_AND_VERIFIED");
    return 0;
  }

  if (unchanged) {
    evidence.callBody = call.body.slice(0, 500);
    save("SOFASCORE_FANTASY_APPLY_FAILED_ROLLED_BACK");
    return 4;
  }
  const problems = appliedProblems(before, after, items, null);
  evidence.problems = problems;
  if (problems.length > 0) {
    problems.forEach((p) => console.log(" -", p));
    save("SOFASCORE_FANTASY_COMMITTED_NEEDS_REVIEW");
    return 5;
  }
  console.log(`Verified: ${items.length} observation(s) recorded, nothing else changed.`);
  save("SOFASCORE_FANTASY_APPLIED_AND_VERIFIED");
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.log(
      `SOFASCORE_FANTASY_REFUSED_BEFORE_WRITE: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 2;
  }
}
