/**
 * SofaScore results sync for Production V2. Owner-run, one poll per invocation.
 *
 *   RAPIDAPI_KEY=… SUPABASE_ACCESS_TOKEN=… SUPABASE_PRODUCTION_PROJECT_REF=… \
 *   SOFASCORE_RESULTS_SYNC_CONFIRMATION=… \
 *     bun scripts/backend/sofascore-results-sync.ts --mode rehearse|apply \
 *       [--poll <n> --of <total>] [--markdown <file>] [--evidence-dir <dir>]
 *
 * Why it exists: SportsMonks stopped (unpaid), so production results stopped
 * arriving. This reads what SofaScore says about Botola (at most TWO RapidAPI
 * requests per poll: the live list and tournaments/get-last-matches page 0 for
 * 937/102220) and writes the difference through the reviewed RPC
 * `api.ingest_football_fixture`, the same call the SportsMonks path makes, with
 * the payload `buildFixtureIngestPlan` builds.
 *
 * What is written: only fixtures that are mapped to a SofaScore event, whose
 * SofaScore state differs from production, and for which the stored
 * (providerUpdatedAt, sourceSequence) is not newer than SofaScore's. Never:
 * blocked_stale, unknown statuses, unmapped events, finished-without-score,
 * and a fixture production already holds as finished/cancelled/abandoned whose
 * status would change (the database trigger forbids it; a correction is the
 * owner's decision). It cannot create a fixture: every call first checks the
 * active fixture mapping still points at the fixture read in the snapshot.
 *
 * The write is ONE `DO` block per poll (one transaction). Rehearsal ends in a
 * deliberate raise that carries the per-fixture results out and rolls back;
 * a re-read proves nothing changed. Apply ends normally; a re-read proves each
 * written fixture now shows SofaScore's status and score. If one call fails in
 * apply, the block rolls back as a whole and is repeated once without the
 * failed fixtures, so one bad row does not hold back the others.
 *
 * Service role: `api.ingest_football_fixture` has no `is_service_request()`
 * guard (supabase/migrations/20260922200000_fixture_finalization_preserved.sql);
 * it is `security definer` with execute granted to service_role, and the
 * Management API session is the database owner. No JWT claim is set.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import {
  buildFixtureIngestPlan,
  collapseReplacedEvents,
  parseSofascoreEvents,
  SOFASCORE_LIVE_EVENTS_PATH,
  BOTOLA_UNIQUE_TOURNAMENT_ID,
  type SofascoreFixtureEvent,
  type SofascoreIngestCall,
} from "../../supabase/functions/_shared/sofascore-fixtures.ts";
import { buildSofascoreMappingLookup } from "../../supabase/functions/_shared/sofascore-mapping-lookup.ts";
import { PRODUCTION_PROJECT_REF } from "./sofascore-id-bridge";
import {
  assertReadOnly,
  eventListPath,
  managementQuery,
  type Query,
} from "./sofascore-id-bridge-fetch";
import {
  compareEvents,
  createCompareClient,
  parseSnapshot,
  PRODUCTION_SNAPSHOT_SQL,
  type ComparisonRow,
  type ProductionFixture,
  type ProductionSnapshot,
} from "./sofascore-live-shadow-compare";

export const REHEARSE_CONFIRMATION = "REHEARSE_SOFASCORE_RESULTS_SYNC";
export const APPLY_CONFIRMATION = "APPLY_SOFASCORE_RESULTS_SYNC";
/** Raised by the rehearsal DO block (and only by it) to roll everything back. */
export const REHEARSAL_MARKER = "SOFASCORE_RESULTS_SYNC_REHEARSAL_ROLLBACK";
/** Raised by the apply DO block when a call failed, rolling the whole poll back. */
export const PARTIAL_MARKER = "SOFASCORE_RESULTS_SYNC_PARTIAL";

export type SyncMode = "rehearse" | "apply";
export type Action = "write" | "skip";

export const EXIT = {
  ok: 0,
  /** Provider or read failure: nothing was written; the next poll may proceed. */
  transient: 1,
  /** Refused before any write: stop the whole run. */
  refused: 2,
  /** Outcome could not be verified: stop and look. */
  unverified: 3,
  /** Apply failed and the re-read shows nothing changed: the next poll may proceed. */
  rolledBack: 4,
  /** Written or rolled back differently than planned: stop and look. */
  needsReview: 5,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "not_started",
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
]);
const PERIODS: ReadonlySet<string> = new Set([
  "pre_match",
  "first_half",
  "half_time",
  "second_half",
  "extra_time",
  "penalties",
  "post_match",
]);
/** A stored fixture in one of these cannot change status (protect_fixture_freshness). */
const LOCKED_STATUSES: ReadonlySet<string> = new Set(["finished", "cancelled", "abandoned"]);
const FIXTURE_KEYS = [
  "competitionId",
  "seasonId",
  "roundId",
  "homeTeamId",
  "awayTeamId",
  "venueId",
  "kickoffAt",
  "status",
  "period",
  "minute",
  "addedTime",
  "homeScore",
  "awayScore",
  "providerUpdatedAt",
  "sourceSequence",
  "sourceVersion",
  "finalizedAt",
] as const;

function invalid(detail: string): never {
  throw new Error(`sofascore_results_sync_payload_invalid: ${detail}`);
}

/**
 * Allow-list validation of one ingest call. Throws unless every key is known
 * and every value has the exact expected type, so the SQL literal built from
 * it can contain nothing but validated tokens.
 */
export function validateIngestCall(call: SofascoreIngestCall): void {
  if (call.p_provider_name !== "sofascore") invalid("provider");
  if (!/^\d{1,12}$/.test(call.p_external_id)) invalid("external id");
  const body = call.p_fixture as unknown as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...FIXTURE_KEYS].sort()))
    invalid(`keys ${keys.join(",")}`);
  const uuid = (name: string, nullable = false) => {
    const value = body[name];
    if (value === null && nullable) return;
    if (typeof value !== "string" || !UUID.test(value)) invalid(name);
  };
  const iso = (name: string, nullable = false) => {
    const value = body[name];
    if (value === null && nullable) return;
    if (typeof value !== "string" || !ISO.test(value) || !Number.isFinite(Date.parse(value)))
      invalid(name);
  };
  const score = (name: string) => {
    const value = body[name];
    if (value === null) return;
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 99) invalid(name);
  };
  for (const name of ["competitionId", "seasonId", "homeTeamId", "awayTeamId"]) uuid(name);
  uuid("roundId", true);
  for (const name of ["venueId", "minute", "addedTime"]) if (body[name] !== null) invalid(name);
  iso("kickoffAt");
  iso("providerUpdatedAt");
  iso("finalizedAt", true);
  if (typeof body.status !== "string" || !STATUSES.has(body.status)) invalid("status");
  if (typeof body.period !== "string" || !PERIODS.has(body.period)) invalid("period");
  score("homeScore");
  score("awayScore");
  if ((body.homeScore === null) !== (body.awayScore === null)) invalid("one score is missing");
  if (
    !Number.isSafeInteger(body.sourceSequence) ||
    (body.sourceSequence as number) < 0 ||
    (body.sourceSequence as number) > Number.MAX_SAFE_INTEGER
  )
    invalid("sourceSequence");
  if (
    typeof body.sourceVersion !== "string" ||
    !new RegExp(`^sofascore:${call.p_external_id}:\\d+$`).test(body.sourceVersion)
  )
    invalid("sourceVersion");
  if (body.finalizedAt !== null && body.status !== "finished")
    invalid("finalizedAt without finished");
}

/** The payload as one jsonb SQL literal; nothing unvalidated can reach it. */
export function jsonbLiteral(call: SofascoreIngestCall): string {
  validateIngestCall(call);
  const json = JSON.stringify(call.p_fixture);
  if (/['\\]/.test(json)) invalid("quote or backslash in payload");
  return `'${json}'::jsonb`;
}

export interface PlannedWrite {
  readonly call: SofascoreIngestCall;
  /** The internal fixture id the active sofascore fixture mapping must still point at. */
  readonly fixtureId: string;
}

function uuidLiteral(id: string): string {
  if (!UUID.test(id)) invalid("fixture id is not a uuid");
  return `'${id}'::uuid`;
}

/**
 * The single DO block of one poll (one statement, one transaction). Every call
 * runs in its own sub-block so a failure is recorded, not fatal; after the loop
 * a failure raises PARTIAL (apply) or the results ride out in the rehearsal
 * raise. Rehearsal always raises, so it can never commit.
 */
export function buildDoBlock(mode: SyncMode, writes: readonly PlannedWrite[]): string {
  if (writes.length === 0) invalid("nothing to write");
  const calls = writes
    .map(({ call, fixtureId }) => {
      const ext = `'${call.p_external_id}'`;
      return `  begin
    select internal_entity_id into v_id from app_private.football_provider_mappings
     where provider_name = 'sofascore' and entity_type = 'fixture' and external_id = ${ext} and active;
    if v_id is distinct from ${uuidLiteral(fixtureId)} then
      raise exception 'SOFASCORE_SYNC_MAPPING_CHANGED' using errcode = 'P0001';
    end if;
    perform api.ingest_football_fixture('sofascore', ${ext}, ${jsonbLiteral(call)});
    select * into v_row from app.fixtures where id = v_id;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'externalId', ${ext}, 'status', v_row.status::text, 'period', v_row.period::text,
      'homeScore', v_row.home_score, 'awayScore', v_row.away_score,
      'providerUpdatedAt', v_row.provider_updated_at, 'finalizedAt', v_row.finalized_at));
  exception when others then
    v_failed := v_failed || jsonb_build_array(jsonb_build_object(
      'externalId', ${ext}, 'sqlstate', sqlstate, 'message', sqlerrm));
  end;`;
    })
    .join("\n");
  const ending =
    mode === "rehearse"
      ? `  -- Deliberate: this raise rolls the whole transaction back and carries the
  -- computed results out in its message. Only the rehearsal contains it.
  raise exception '${REHEARSAL_MARKER} %', v_result::text using errcode = 'P0001';
`
      : `  if jsonb_array_length(v_failed) > 0 then
    raise exception '${PARTIAL_MARKER} %', v_result::text using errcode = 'P0001';
  end if;
  -- Apply: the block ends normally, which commits exactly once.
`;
  return `do $sofascore_sync$
declare
  v_id uuid;
  v_row app.fixtures%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
  v_result jsonb;
begin
${calls}
  v_result := jsonb_build_object(
    'planned', ${writes.length},
    'results', v_results,
    'failed', v_failed
  );
${ending}end
$sofascore_sync$`;
}

export interface BlockResult {
  planned: number;
  results: Array<{
    externalId: string;
    status: string;
    period: string;
    homeScore: number | null;
    awayScore: number | null;
    providerUpdatedAt: string;
    finalizedAt: string | null;
  }>;
  failed: Array<{ externalId: string; sqlstate: string; message: string }>;
}

/** Pulls the JSON a marker raise carried out of a Management API error body. */
export function extractBlockResult(body: string, marker: string): BlockResult | null {
  let text = body;
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    text = String(parsed.message ?? parsed.error ?? body);
  } catch {
    /* not JSON: search as is */
  }
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = text.indexOf("{", at);
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as BlockResult;
    return Array.isArray(value.results) && Array.isArray(value.failed) ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Production state (read only)

/** Settings and a digest of the mapped fixtures outside the write set. */
export function stateSql(excludeFixtureIds: readonly string[]): string {
  for (const id of excludeFixtureIds) if (!UUID.test(id)) invalid("excluded id is not a uuid");
  const not = excludeFixtureIds.length
    ? ` and m.internal_entity_id not in (${excludeFixtureIds.map((id) => `'${id}'::uuid`).join(", ")})`
    : "";
  return `select jsonb_build_object(
  'live_refresh_enabled', (select football_live_refresh_enabled from app_private.notification_email_settings where id),
  'email_mode', (select mode from app_private.notification_email_settings where id),
  'lifecycle_tick_enabled', (select lifecycle_tick_enabled from app_private.fantasy_automation_settings where id),
  'mapped_fixtures', (select count(*) from app_private.football_provider_mappings m where m.provider_name = 'sofascore' and m.entity_type = 'fixture' and m.active),
  'others_digest', (select md5(coalesce(string_agg(f::text, '|' order by f.id), '')) from app.fixtures f where f.id in (select m.internal_entity_id from app_private.football_provider_mappings m where m.provider_name = 'sofascore' and m.entity_type = 'fixture' and m.active${not})),
  'mappings_digest', (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m where m.provider_name = 'sofascore' and m.entity_type = 'fixture'${not})
) as state`;
}

export interface DbState {
  live_refresh_enabled: boolean | null;
  email_mode: string | null;
  lifecycle_tick_enabled: boolean | null;
  mapped_fixtures: number | string;
  others_digest: string;
  mappings_digest: string;
}

async function readState(query: Query, exclude: readonly string[]): Promise<DbState> {
  const rows = await query(stateSql(exclude));
  const state = rows[0]?.state as DbState | undefined;
  if (!state || typeof state.others_digest !== "string")
    throw new Error("sofascore_results_sync_state_invalid");
  return state;
}

/** Refusals that stop a poll before it writes. Empty means clear to write. */
export function writerProblems(state: DbState): string[] {
  const problems: string[] = [];
  if (state.live_refresh_enabled !== false)
    problems.push(
      "the SportsMonks football live refresh is switched on (football_live_refresh_enabled is " +
        `${String(state.live_refresh_enabled)}): two writers would touch fixtures. Switch it off ` +
        "(see the runbook) and dispatch again",
    );
  return problems;
}

// ---------------------------------------------------------------------------
// Plan

export interface SyncRow {
  readonly comparison: ComparisonRow;
  readonly action: Action;
  readonly reason: string;
  readonly write?: PlannedWrite;
}

const productionScoreIsEmpty = (row: ComparisonRow) => row.production?.score === "-";

/** Decide, per Botola event, whether it is written and why not otherwise. */
export function decide(
  rows: readonly ComparisonRow[],
  calls: ReadonlyMap<string, SofascoreIngestCall>,
  production: ReadonlyMap<string, ProductionFixture>,
): SyncRow[] {
  return rows.map((comparison) => {
    const skip = (reason: string): SyncRow => ({ comparison, action: "skip", reason });
    switch (comparison.wouldChange) {
      case "no":
        return skip("identical to production");
      case "not_mapped":
        return skip("not mapped to a production fixture");
      case "rejected":
        return skip("finished without a score");
      case "blocked_stale":
        return skip("production is newer than SofaScore (providerUpdatedAt/sequence)");
      case "yes":
        break;
    }
    const call = calls.get(comparison.eventId);
    const fixture = production.get(comparison.eventId);
    if (!call || !fixture) return skip("no ingest call or production fixture");
    const statusChanges = comparison.differences.includes("status");
    if (LOCKED_STATUSES.has(fixture.status) && statusChanges)
      return skip(`production holds ${fixture.status}: a status change is a manual correction`);
    if (
      LOCKED_STATUSES.has(fixture.status) &&
      comparison.differences.includes("score") &&
      !productionScoreIsEmpty(comparison)
    )
      return skip(`production already holds a final score: a correction is a manual decision`);
    return {
      comparison,
      action: "write",
      reason: `differs: ${comparison.differences.join(", ")}`,
      write: { call, fixtureId: fixture.id },
    };
  });
}

export interface PollDependencies {
  readonly client: Pick<RapidApiClient, "getJson" | "quota" | "requestsSent">;
  readonly query: Query;
  /** Sends one write statement to production; resolves with the HTTP outcome. */
  readonly execute: (sql: string) => Promise<{ status: number; body: string }>;
  readonly now?: () => Date;
}

export interface PollOutcome {
  readonly exit: (typeof EXIT)[keyof typeof EXIT];
  readonly outcome: string;
  readonly observedAt: string;
  readonly rows: readonly SyncRow[];
  /** Production fixture after the poll, by SofaScore event id (apply only). */
  readonly after: ReadonlyMap<string, ProductionFixture>;
  readonly rehearsal: BlockResult | null;
  readonly problems: readonly string[];
  readonly notes: readonly string[];
  readonly unknownStatus: readonly string[];
  readonly unmapped: readonly string[];
  readonly requestsSent: number;
}

const scoreText = (home: number | null, away: number | null) =>
  home === null || away === null ? "-" : `${home}-${away}`;

/** True when production now shows exactly what the call carried. */
function matchesCall(fixture: ProductionFixture | undefined, call: SofascoreIngestCall): boolean {
  if (!fixture) return false;
  const body = call.p_fixture;
  return (
    fixture.status === body.status &&
    fixture.period === body.period &&
    scoreText(fixture.homeScore, fixture.awayScore) === scoreText(body.homeScore, body.awayScore) &&
    Date.parse(fixture.providerUpdatedAt) === Date.parse(body.providerUpdatedAt)
  );
}

const byEvent = (snapshot: ProductionSnapshot) =>
  new Map(snapshot.fixtures.map((f) => [f.externalId, f]));

/** One poll. Throws only before any write (a provider or read failure). */
export async function runPoll(mode: SyncMode, deps: PollDependencies): Promise<PollOutcome> {
  const observedAt = (deps.now ?? (() => new Date()))();
  const options = { uniqueTournamentId: BOTOLA_UNIQUE_TOURNAMENT_ID };

  // 1. SofaScore: the live list and last-matches page 0 (two requests, no retries).
  const live = parseSofascoreEvents(await deps.client.getJson(SOFASCORE_LIVE_EVENTS_PATH), options);
  const recent = parseSofascoreEvents(
    await deps.client.getJson(eventListPath("get-last-matches", 0)),
    options,
  );
  const liveIds = new Set(live.events.map((e) => e.sofascoreEventId));
  const tagged: Array<{ event: SofascoreFixtureEvent; source: "live" | "last_matches" }> = [
    ...live.events.map((event) => ({ event, source: "live" as const })),
    ...recent.events
      .filter((event) => !liveIds.has(event.sofascoreEventId))
      .map((event) => ({ event, source: "last_matches" as const })),
  ];
  const unknownStatus = [...live.unknownStatus, ...recent.unknownStatus].map(
    (u) => `${u.sofascoreEventId} ${u.rawStatusType}/${u.rawStatusCode}`,
  );
  const requestsSent = deps.client.requestsSent();

  // 2. Production snapshot, read immediately before planning.
  const snapshot = parseSnapshot(await deps.query(PRODUCTION_SNAPSHOT_SQL));
  const mapping = buildSofascoreMappingLookup(snapshot.mappings);
  const collapsed = collapseReplacedEvents(tagged.map((t) => t.event));
  const kept = new Set(collapsed.events.map((e) => e.sofascoreEventId));
  const events = tagged.filter((t) => kept.has(t.event.sofascoreEventId));
  const plan = buildFixtureIngestPlan(
    events.map((t) => t.event),
    mapping.lookup,
    observedAt,
  );
  const comparisons = compareEvents({ events, plan, production: snapshot.fixtures });
  const productionByEvent = byEvent(snapshot);
  const decided = decide(
    comparisons,
    new Map(plan.calls.map((c) => [c.p_external_id, c])),
    productionByEvent,
  );
  const writes = decided.flatMap((row) => (row.write ? [row.write] : []));
  const base = {
    observedAt: observedAt.toISOString(),
    rows: decided,
    unknownStatus,
    unmapped: plan.unmapped.map((u) => `${u.sofascoreEventId} missing ${u.missing.join("+")}`),
    requestsSent,
  };
  const done = (
    exit: PollOutcome["exit"],
    outcome: string,
    extra: Partial<PollOutcome> = {},
  ): PollOutcome => ({
    ...base,
    exit,
    outcome,
    after: new Map(),
    rehearsal: null,
    problems: [],
    notes: [],
    ...extra,
  });

  if (writes.length === 0) return done(EXIT.ok, "SOFASCORE_SYNC_NOTHING_TO_WRITE");

  // 3. One-writer check and baseline, immediately before the write.
  const ids = writes.map((w) => w.fixtureId);
  const before = await readState(deps.query, ids);
  const refusals = writerProblems(before);
  if (refusals.length > 0)
    return done(EXIT.refused, "SOFASCORE_SYNC_REFUSED_BEFORE_WRITE", { problems: refusals });

  // 4. The DO block, sent once; an apply that failed in part is repeated once without the failures.
  const notes: string[] = [];
  let toWrite = writes;
  let attempt = await deps.execute(buildDoBlock(mode, toWrite));
  let partial: BlockResult | null = null;
  if (mode === "apply" && attempt.status >= 400) {
    partial = extractBlockResult(attempt.body, PARTIAL_MARKER);
    if (partial && partial.failed.length > 0 && partial.failed.length < toWrite.length) {
      const failedIds = new Set(partial.failed.map((f) => f.externalId));
      notes.push(
        `rolled back, then repeated without: ${partial.failed
          .map((f) => `${f.externalId} (${f.sqlstate} ${f.message})`)
          .join("; ")}`,
      );
      toWrite = toWrite.filter((w) => !failedIds.has(w.call.p_external_id));
      attempt = await deps.execute(buildDoBlock(mode, toWrite));
    }
  }

  // 5. Whatever the client reported, classify from a fresh read.
  let after: DbState;
  let afterSnapshot: ProductionSnapshot;
  try {
    after = await readState(deps.query, ids);
    afterSnapshot = parseSnapshot(await deps.query(PRODUCTION_SNAPSHOT_SQL));
  } catch (error) {
    return done(EXIT.unverified, "SOFASCORE_SYNC_OUTCOME_UNVERIFIED", {
      problems: [`the re-read failed: ${error instanceof Error ? error.message : String(error)}`],
      notes,
    });
  }
  const afterByEvent = byEvent(afterSnapshot);
  const othersUntouched =
    after.others_digest === before.others_digest &&
    after.mappings_digest === before.mappings_digest;
  const targetUnchanged = writes.every((w) =>
    sameFixtureState(
      productionByEvent.get(w.call.p_external_id),
      afterByEvent.get(w.call.p_external_id),
    ),
  );

  if (mode === "rehearse") {
    const result = extractBlockResult(attempt.body, REHEARSAL_MARKER);
    const problems = [
      ...(attempt.status < 400 ? ["the rehearsal returned success: the raise did not run"] : []),
      ...(result ? [] : ["the rehearsal did not return its computed state"]),
      ...(result && result.failed.length > 0
        ? result.failed.map((f) => `call ${f.externalId} failed: ${f.sqlstate} ${f.message}`)
        : []),
      ...(result && result.results.length !== writes.length - (result?.failed.length ?? 0)
        ? ["the rehearsal result count differs from the plan"]
        : []),
      ...(targetUnchanged ? [] : ["rollback did not hold: a target fixture changed"]),
      ...(othersUntouched
        ? []
        : ["other mapped fixtures or mappings changed during the rehearsal"]),
    ];
    return done(
      problems.length > 0 ? EXIT.needsReview : EXIT.ok,
      problems.length > 0
        ? "SOFASCORE_SYNC_REHEARSAL_NEEDS_REVIEW"
        : "SOFASCORE_SYNC_REHEARSAL_ROLLED_BACK_AND_VERIFIED",
      { rehearsal: result, problems, notes, after: afterByEvent },
    );
  }

  // Apply. Nothing changed anywhere: the DO block rolled back as a whole.
  if (targetUnchanged && othersUntouched && attempt.status >= 400) {
    return done(EXIT.rolledBack, "SOFASCORE_SYNC_APPLY_FAILED_ROLLED_BACK", {
      problems: [`HTTP ${attempt.status}: ${attempt.body.slice(0, 300)}`],
      notes,
      after: afterByEvent,
    });
  }
  const problems = [
    ...toWrite
      .filter((w) => !matchesCall(afterByEvent.get(w.call.p_external_id), w.call))
      .map((w) => `fixture of event ${w.call.p_external_id} does not show SofaScore's state`),
    ...(othersUntouched ? [] : ["other mapped fixtures or mappings changed"]),
  ];
  return done(
    problems.length > 0 ? EXIT.needsReview : EXIT.ok,
    problems.length > 0
      ? "SOFASCORE_SYNC_COMMITTED_NEEDS_REVIEW"
      : "SOFASCORE_SYNC_APPLIED_AND_VERIFIED",
    { problems, notes, after: afterByEvent },
  );
}

function sameFixtureState(a: ProductionFixture | undefined, b: ProductionFixture | undefined) {
  if (!a || !b) return a === b;
  return (
    a.status === b.status &&
    a.period === b.period &&
    a.homeScore === b.homeScore &&
    a.awayScore === b.awayScore &&
    Date.parse(a.providerUpdatedAt) === Date.parse(b.providerUpdatedAt) &&
    String(a.sourceSequence) === String(b.sourceSequence) &&
    a.finalizedAt === b.finalizedAt
  );
}

// ---------------------------------------------------------------------------
// Report

const cell = (text: string) => text.replace(/\|/g, "/").replace(/\s+/g, " ");

export function renderMarkdown(
  mode: SyncMode,
  outcome: PollOutcome,
  poll?: { n: number; of: number },
): string {
  const lines: string[] = [];
  lines.push(
    `### ${mode === "apply" ? "Apply" : "Rehearsal"}${poll ? ` ${poll.n} of ${poll.of}` : ""}, ${outcome.observedAt}`,
  );
  lines.push("");
  lines.push(`Outcome: **${outcome.outcome}**. RapidAPI requests: ${outcome.requestsSent}.`);
  lines.push("");
  if (outcome.rows.length === 0) {
    lines.push("No Botola event in the SofaScore responses.");
  } else {
    lines.push(
      "| Event | Rd | From | SofaScore | Production before | Written | Production after | Reason |",
    );
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const row of outcome.rows) {
      const c = row.comparison;
      const after = outcome.after.get(c.eventId);
      const rehearsed = outcome.rehearsal?.results.find((r) => r.externalId === c.eventId);
      let written = "no";
      if (row.action === "write" && outcome.exit === EXIT.refused) written = "no (refused)";
      else if (row.action === "write") {
        if (outcome.outcome === "SOFASCORE_SYNC_APPLIED_AND_VERIFIED") written = "yes";
        else if (rehearsed) written = "rolled back (rehearsal)";
        else written = "no (see problems)";
      }
      const afterText = rehearsed
        ? `would be ${rehearsed.status} ${scoreText(rehearsed.homeScore, rehearsed.awayScore)}`
        : after && mode === "apply" && row.action === "write"
          ? `${after.status} ${scoreText(after.homeScore, after.awayScore)}`
          : "-";
      lines.push(
        `| ${c.eventId} | ${c.round ?? "-"} | ${c.source} | ${c.sofascore.status} ${c.sofascore.score} | ` +
          `${c.production ? `${c.production.status} ${c.production.score}` : "not mapped"} | ${written} | ${afterText} | ${cell(row.reason)} |`,
      );
    }
  }
  const list = (title: string, items: readonly string[]) => {
    lines.push("");
    lines.push(`${title}: ${items.length === 0 ? "none" : items.join("; ")}`);
  };
  list("Unknown status (left out)", outcome.unknownStatus);
  list("Unmapped", outcome.unmapped);
  list("Notes", outcome.notes);
  list("Problems", outcome.problems);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

class Refused extends Error {}

function managementExecute(ref: string, token: string): PollDependencies["execute"] {
  return async (sql) => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: false }),
    });
    return { status: response.status, body: await response.text() };
  };
}

async function main(): Promise<number> {
  const mode = arg("--mode") as SyncMode | undefined;
  if (mode !== "rehearse" && mode !== "apply")
    throw new Refused("--mode must be rehearse or apply");
  const key = process.env.RAPIDAPI_KEY?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim();
  if (!key || !token || !ref)
    throw new Refused("RAPIDAPI_KEY, SUPABASE_ACCESS_TOKEN and ref are required");
  if (ref !== PRODUCTION_PROJECT_REF) throw new Refused("the ref is not the production project");
  const phrase = mode === "apply" ? APPLY_CONFIRMATION : REHEARSE_CONFIRMATION;
  if (process.env.SOFASCORE_RESULTS_SYNC_CONFIRMATION !== phrase)
    throw new Refused(`confirmation must be ${phrase}`);

  const read = managementQuery(ref, token);
  const query: Query = async (sql) => {
    assertReadOnly(sql);
    return read(sql);
  };
  const n = Number(arg("--poll") ?? "1");
  const of = Number(arg("--of") ?? "1");
  let outcome: PollOutcome;
  try {
    outcome = await runPoll(mode, {
      client: createCompareClient(key),
      query,
      execute: managementExecute(ref, token),
    });
  } catch (error) {
    // Raised before any write: a provider or read failure.
    console.log(
      `SOFASCORE_SYNC_POLL_FAILED_BEFORE_WRITE: ${error instanceof Error ? error.message : error}`,
    );
    return EXIT.transient;
  }
  const markdown = renderMarkdown(mode, outcome, { n, of });
  const markdownFile = arg("--markdown");
  if (markdownFile) writeFileSync(markdownFile, `${markdown}\n`);
  const evidenceDir = arg("--evidence-dir");
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, `sofascore-results-sync-${mode}-${n}.json`),
      JSON.stringify(
        {
          mode,
          outcome: outcome.outcome,
          observedAt: outcome.observedAt,
          rows: outcome.rows.map((r) => ({
            eventId: r.comparison.eventId,
            action: r.action,
            reason: r.reason,
            sofascore: r.comparison.sofascore,
            production: r.comparison.production,
          })),
          rehearsal: outcome.rehearsal,
          problems: outcome.problems,
          notes: outcome.notes,
        },
        null,
        2,
      ),
    );
  }
  console.log(markdown);
  console.log(outcome.outcome);
  return outcome.exit;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.log(
      `SOFASCORE_SYNC_REFUSED_BEFORE_WRITE: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = EXIT.refused;
  }
}
