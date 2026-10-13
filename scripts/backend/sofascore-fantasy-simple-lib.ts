/**
 * SofaScore-only Fantasy ingestion: the pure parts (selection, report, plan hash,
 * SQL text). No I/O here. The runner is sofascore-fantasy-simple-ingest.ts and
 * the design is docs/backend/SOFASCORE_FANTASY_SIMPLE.md.
 *
 * SQL is built from validated literals only: uuids, numeric SofaScore ids, and
 * one JSON request per fixture inside a dollar-quote whose tag the text cannot
 * contain.
 */
import { createHash } from "node:crypto";
import type {
  PreparedSofascoreObservation,
  SofascoreObservationRequest,
} from "../../src/backend/fantasy/sofascore-fantasy";

export const PRODUCTION_PROJECT_REF = "tkewgajrljbwgwedqsxn";
export const REHEARSE_CONFIRMATION = "REHEARSE_SOFASCORE_FANTASY_PRODUCTION";
export const APPLY_CONFIRMATION = "APPLY_SOFASCORE_FANTASY_PRODUCTION";
export const REHEARSAL_MARKER = "SOFASCORE_FANTASY_REHEARSAL_ROLLBACK";
/** One transaction, one request body: a round is at most this many fixtures. */
export const MAX_WRITE_FIXTURES = 12;
export const WRAPPER_SIGNATURE =
  "api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const uuidLiteral = (value: string): string => {
  if (!UUID.test(value)) throw new Error("sofascore_fantasy_literal_invalid: not a uuid");
  return `'${value}'::uuid`;
};

// ---------------------------------------------------------------------------
// Reads (single SELECTs)
// ---------------------------------------------------------------------------

/** What the database has, so the report says what is missing instead of failing. */
export const SCHEMA_SQL = `select jsonb_build_object(
  'adaptiveSchema', to_regclass('app_private.fantasy_adaptive_policy') is not null,
  'linksTable', to_regclass('app_private.football_provider_fixture_links') is not null,
  'wrapper', to_regprocedure('${WRAPPER_SIGNATURE}') is not null,
  'observationsTable', to_regclass('app_private.fantasy_fixture_observations') is not null
) as state`;

export interface SchemaState {
  adaptiveSchema: boolean;
  linksTable: boolean;
  wrapper: boolean;
  observationsTable: boolean;
}

export function candidatesSql(seasonId: string, schema: SchemaState): string {
  const adaptive = schema.adaptiveSchema ? `app_private.fantasy_adaptive_enabled(g.id)` : `false`;
  const observations = schema.observationsTable
    ? `(select count(*) from app_private.fantasy_fixture_observations o where o.fixture_id = f.id)`
    : `0`;
  const linked = schema.linksTable
    ? `exists(select 1 from app_private.football_provider_fixture_links l where l.provider_name = 'sofascore' and l.fixture_id = f.id)`
    : `false`;
  return `select jsonb_build_object(
  'fixtures', (select coalesce(jsonb_agg(jsonb_build_object(
      'fixtureId', f.id, 'sofascoreEventId', m.external_id,
      'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id,
      'status', f.status, 'finalized', f.finalized_at is not null,
      'homeScore', f.home_score, 'awayScore', f.away_score,
      'round', r.round_number, 'gameweek', g.sequence_number, 'gameweekStatus', g.status,
      'adaptiveEnabled', coalesce(${adaptive}, false),
      'observations', ${observations}, 'linked', ${linked}) order by r.round_number, f.kickoff_at, f.id), '[]'::jsonb)
    from app.fixtures f
    join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
      and m.entity_type = 'fixture' and m.internal_entity_id = f.id and m.active
    left join app.rounds r on r.id = f.round_id
    left join lateral (select g2.* from app.fantasy_fixture_assignments a
      join app.fantasy_gameweeks g2 on g2.id = a.gameweek_id
      where a.fixture_id = f.id and a.superseded_at is null limit 1) g on true
    where f.season_id = ${uuidLiteral(seasonId)}),
  'players', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'externalId', external_id, 'appPlayerId', internal_entity_id,
      'active', active, 'reviewed', manually_corrected, 'version', source_version,
      'updatedAt', updated_at) order by external_id), '[]'::jsonb)
    from app_private.football_provider_mappings
    where provider_name = 'sofascore' and entity_type = 'player')
) as snapshot`;
}

export interface Candidate {
  fixtureId: string;
  sofascoreEventId: string;
  homeTeamId: string;
  awayTeamId: string;
  status: string;
  finalized: boolean;
  homeScore: number | null;
  awayScore: number | null;
  round: number | null;
  gameweek: number | null;
  gameweekStatus: string | null;
  adaptiveEnabled: boolean;
  observations: number;
  linked: boolean;
}

export interface Selection {
  readonly selected: readonly Candidate[];
  readonly skipped: readonly {
    fixtureId: string;
    sofascoreEventId: string;
    reason: string;
  }[];
}

export interface SelectOptions {
  readonly round?: number;
  readonly fixtureIds?: readonly string[];
  /** Include fixtures that already have an observation (re-checks; the database dedupes). */
  readonly includeObserved?: boolean;
}

/** Which finished, unscored fixtures to fetch, and why each of the others is left out. */
export function selectFixtures(
  candidates: readonly Candidate[],
  options: SelectOptions,
): Selection {
  const selected: Candidate[] = [];
  const skipped: {
    fixtureId: string;
    sofascoreEventId: string;
    reason: string;
  }[] = [];
  for (const c of candidates) {
    if (options.round !== undefined && c.round !== options.round) continue;
    if (options.fixtureIds && !options.fixtureIds.includes(c.fixtureId)) continue;
    const why =
      c.status !== "finished"
        ? "not_finished"
        : !c.finalized
          ? "not_finalized"
          : c.homeScore === null || c.awayScore === null
            ? "score_missing"
            : c.gameweek === null
              ? "no_gameweek_assignment"
              : !c.adaptiveEnabled
                ? "adaptive_not_enabled_for_gameweek"
                : ["finalizing", "finalized", "corrected"].includes(c.gameweekStatus ?? "")
                  ? `gameweek_${c.gameweekStatus}`
                  : c.observations > 0 && !options.includeObserved
                    ? "already_has_observation"
                    : null;
    if (why)
      skipped.push({
        fixtureId: c.fixtureId,
        sofascoreEventId: c.sofascoreEventId,
        reason: why,
      });
    else selected.push(c);
  }
  return { selected, skipped };
}

// ---------------------------------------------------------------------------
// Report (no player names anywhere)
// ---------------------------------------------------------------------------

export interface FixtureReportLine {
  readonly fixtureId: string;
  readonly sofascoreEventId: string;
  readonly round: number | null;
  readonly status: "ready" | "blocked";
  readonly coverage: "full" | "limited";
  readonly expectedMode: "full" | "simple" | null;
  readonly playersScored: number;
  readonly unknownFields: Readonly<Record<string, number>>;
  readonly blockers: readonly {
    code: string;
    message: string;
    side?: string;
    shirtNumber?: number | null;
    sofascoreId?: string;
  }[];
  readonly requestDigest: string | null;
}

export interface UnmappedLine {
  readonly sofascoreId: string;
  readonly side: string;
  readonly shirtNumber: number | null;
  readonly started: boolean;
  readonly position: string | null;
  readonly fixtures: readonly string[];
}

export function buildReport(
  selection: Selection,
  prepared: readonly {
    candidate: Candidate;
    result: PreparedSofascoreObservation;
  }[],
) {
  const lines: FixtureReportLine[] = prepared.map(({ candidate, result }) => ({
    fixtureId: candidate.fixtureId,
    sofascoreEventId: candidate.sofascoreEventId,
    round: candidate.round,
    status: result.request ? "ready" : "blocked",
    coverage: result.coverage,
    expectedMode: result.expectedMode,
    playersScored: result.request ? result.rows : 0,
    unknownFields: result.unknownFields,
    blockers: result.blockers.map((b) => ({ ...b })),
    requestDigest: result.requestDigest,
  }));
  // The mapping review worklist: one line per SofaScore player, with the fixtures he held back.
  const worklist = new Map<string, UnmappedLine & { fixtures: string[] }>();
  for (const { candidate, result } of prepared) {
    for (const u of result.unmapped) {
      const line = worklist.get(u.sofascoreId) ?? {
        sofascoreId: u.sofascoreId,
        side: u.side,
        shirtNumber: u.shirtNumber,
        started: u.started,
        position: u.position,
        fixtures: [] as string[],
      };
      line.fixtures.push(candidate.sofascoreEventId);
      worklist.set(u.sofascoreId, line);
    }
  }
  const ready = lines.filter((l) => l.status === "ready");
  return {
    totals: {
      fixturesSelected: selection.selected.length,
      fixturesSkipped: selection.skipped.length,
      ready: ready.length,
      blocked: lines.length - ready.length,
      readyFullMode: ready.filter((l) => l.expectedMode === "full").length,
      readySimpleMode: ready.filter((l) => l.expectedMode === "simple").length,
      playersScored: ready.reduce((n, l) => n + l.playersScored, 0),
      unmappedPlayers: worklist.size,
    },
    skipped: selection.skipped,
    fixtures: lines,
    unmappedWorklist: [...worklist.values()].sort(
      (a, b) => b.fixtures.length - a.fixtures.length || a.sofascoreId.localeCompare(b.sofascoreId),
    ),
  };
}

// ---------------------------------------------------------------------------
// Plan hash: what the owner approves
// ---------------------------------------------------------------------------

/** A request without the evidence timestamps, which change on every fetch. */
export function stableRequestJson(request: SofascoreObservationRequest): string {
  const strip = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(strip)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .filter(([k]) => k !== "observedAt")
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, v]) => [k, strip(v)]),
          )
        : value;
  return JSON.stringify(strip(request));
}

export interface PlanItem {
  readonly fixtureId: string;
  readonly request: SofascoreObservationRequest;
  readonly expectedMode: "full" | "simple";
}

export function planSha256(items: readonly PlanItem[]): string {
  const rows = [...items]
    .sort((a, b) => (a.fixtureId < b.fixtureId ? -1 : 1))
    .map((i) => [
      i.fixtureId,
      i.request.sofascoreEventId,
      i.expectedMode,
      createHash("sha256").update(stableRequestJson(i.request)).digest("hex"),
    ]);
  return createHash("sha256")
    .update(JSON.stringify({ contract: "sofascore-fantasy-simple-v1", rows }))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Write: one DO block per run
// ---------------------------------------------------------------------------

export type RunMode = "rehearse" | "apply";

export function buildDoBlock(mode: RunMode, items: readonly PlanItem[]): string {
  if (items.length === 0 || items.length > MAX_WRITE_FIXTURES)
    throw new Error(`sofascore_fantasy_plan_size: 1 to ${MAX_WRITE_FIXTURES} fixtures per run`);
  const calls = [...items]
    .sort((a, b) => (a.fixtureId < b.fixtureId ? -1 : 1))
    .map((item) => {
      const json = JSON.stringify(item.request);
      if (json.includes("$sfq$"))
        throw new Error("sofascore_fantasy_literal_invalid: request contains the quote tag");
      return `  v_res := api.service_record_sofascore_fantasy_observation(${uuidLiteral(item.fixtureId)}, $sfq$${json}$sfq$::jsonb, false);
  v_out := v_out || jsonb_build_array(v_res || jsonb_build_object('fixtureId', '${item.fixtureId}'));`;
    })
    .join("\n");
  const ending =
    mode === "rehearse"
      ? `  -- Deliberate: the raise rolls the whole transaction back and carries the computed\n  -- state out in its message. Only the rehearsal contains it.\n  raise exception '${REHEARSAL_MARKER} %', v_out::text using errcode = 'P0001';\n`
      : `  -- Apply: the block ends normally, which commits exactly once.\n`;
  return `do $sofascore_fantasy$
declare
  v_res jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  -- The wrapper is service-only; this block runs as the owner-approved operator,
  -- so it presents the service role to the function's own check.
  perform set_config('request.jwt.claim.role', 'service_role', true);
${calls}
${ending}end
$sofascore_fantasy$`;
}

/** Read before and after: the rollback or the commit is proven from this. */
export function stateSql(fixtureIds: readonly string[]): string {
  const ids = fixtureIds.map(uuidLiteral).join(", ");
  return `select jsonb_build_object(
  'observations', (select count(*) from app_private.fantasy_fixture_observations),
  'otherDigest', (select md5(coalesce(string_agg(o.id::text || o.digest, '|' order by o.id), '')) from app_private.fantasy_fixture_observations o where o.fixture_id not in (${ids})),
  'links', (select count(*) from app_private.football_provider_fixture_links),
  'forFixtures', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'fixtureId', o.fixture_id, 'digest', o.digest, 'source', o.source,
      'fullReady', o.full_ready, 'simpleReady', o.simple_ready) order by o.fixture_id, o.id), '[]'::jsonb)
    from app_private.fantasy_fixture_observations o where o.fixture_id in (${ids})),
  'emailMode', (select mode from app_private.notification_email_settings where id),
  'liveRefreshEnabled', (select football_live_refresh_enabled from app_private.notification_email_settings where id),
  'lifecycleTickEnabled', (select lifecycle_tick_enabled from app_private.fantasy_automation_settings where id),
  'finalizingGameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing'),
  'busySessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)'))
) as state`;
}

export interface WriteState {
  observations: number;
  otherDigest: string;
  links: number;
  forFixtures: {
    id: number;
    fixtureId: string;
    digest: string;
    source: string;
    fullReady: boolean;
    simpleReady: boolean;
  }[];
  emailMode: string | null;
  liveRefreshEnabled: boolean | null;
  lifecycleTickEnabled: boolean | null;
  finalizingGameweeks: number;
  busySessions: number;
}

/** One-writer pre-checks from the database side: refuse unless the crons are paused. */
export function writerProblems(state: WriteState): string[] {
  const problems: string[] = [];
  if (state.emailMode !== "off")
    problems.push(`notification_email mode is ${state.emailMode}, not off`);
  if (state.liveRefreshEnabled !== false)
    problems.push("football live refresh is not switched off");
  if (state.lifecycleTickEnabled !== false)
    problems.push("the Fantasy lifecycle tick is not switched off");
  if (state.finalizingGameweeks !== 0)
    problems.push(`${state.finalizingGameweeks} gameweek(s) are finalizing`);
  if (state.busySessions !== 0)
    problems.push(`${state.busySessions} other database session(s) busy`);
  return problems;
}

export interface RehearsalItem {
  fixtureId: string;
  digest?: string;
  created?: boolean;
  simpleReady?: boolean;
  fullReady?: boolean;
  latest?: boolean;
  reviewedOverride?: boolean;
}

/** Pulls the JSON array the rehearsal raise carried out of a Management API error body. */
export function extractRehearsalResult(body: string): RehearsalItem[] | null {
  let text = body;
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    text = String(parsed.message ?? parsed.error ?? body);
  } catch {
    /* not JSON: search as is */
  }
  const at = text.indexOf(REHEARSAL_MARKER);
  if (at < 0) return null;
  const start = text.indexOf("[", at);
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as RehearsalItem[];
  } catch {
    return null;
  }
}

/** What the database reported must be what the builder predicted, fixture by fixture. */
export function resultProblems(
  result: readonly RehearsalItem[] | null,
  items: readonly PlanItem[],
): string[] {
  if (!result) return ["the database did not return its computed state"];
  const problems: string[] = [];
  if (result.length !== items.length)
    problems.push(`expected ${items.length} results, got ${result.length}`);
  for (const item of items) {
    const got = result.find((r) => r.fixtureId === item.fixtureId);
    if (!got) {
      problems.push(`fixture ${item.fixtureId}: no result`);
      continue;
    }
    if (got.reviewedOverride)
      problems.push(`fixture ${item.fixtureId}: a reviewed correction is in force`);
    if (got.created !== true) problems.push(`fixture ${item.fixtureId}: nothing new was recorded`);
    if (got.latest === false)
      problems.push(`fixture ${item.fixtureId}: a newer observation exists`);
    if (got.simpleReady !== true) problems.push(`fixture ${item.fixtureId}: not simple-ready`);
    if ((got.fullReady === true) !== (item.expectedMode === "full"))
      problems.push(
        `fixture ${item.fixtureId}: database says ${got.fullReady ? "full" : "simple"}, the builder expected ${item.expectedMode}`,
      );
  }
  return problems;
}

/** After an apply: the new rows are exactly the plan's, nothing else moved. */
export function appliedProblems(
  before: WriteState,
  after: WriteState,
  items: readonly PlanItem[],
  result: readonly RehearsalItem[] | null,
): string[] {
  const problems: string[] = [];
  const created = result ? result.filter((r) => r.created === true).length : items.length;
  if (after.otherDigest !== before.otherDigest)
    problems.push("observations of other fixtures changed");
  if (after.observations !== before.observations + created)
    problems.push(`observations: ${before.observations} before, ${after.observations} after`);
  for (const item of items) {
    const previous = before.forFixtures.filter((r) => r.fixtureId === item.fixtureId);
    const rows = after.forFixtures.filter((r) => r.fixtureId === item.fixtureId);
    for (const old of previous) {
      const kept = rows.find((r) => r.id === old.id);
      if (
        !kept ||
        kept.digest !== old.digest ||
        kept.source !== old.source ||
        kept.fullReady !== old.fullReady ||
        kept.simpleReady !== old.simpleReady
      )
        problems.push(`fixture ${item.fixtureId}: historical observation ${old.id} changed`);
    }
    const previousIds = new Set(previous.map((r) => r.id));
    const added = rows.filter((r) => !previousIds.has(r.id));
    if (added.length !== 1)
      problems.push(`fixture ${item.fixtureId}: expected one new observation, got ${added.length}`);
    for (const r of added) {
      if (r.source !== "provider-reconciled")
        problems.push(`fixture ${item.fixtureId}: unexpected source ${r.source}`);
      if (!r.simpleReady)
        problems.push(`fixture ${item.fixtureId}: observation is not simple-ready`);
    }
  }
  return problems;
}
