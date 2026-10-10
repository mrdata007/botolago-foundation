/**
 * SofaScore ID bridge, Production V2 rehearsal and apply (pure logic, no I/O).
 *
 * The owner-run package: a committed manifest holds the approved pairing and the
 * counts the owner saw in the read-only dry-run (run 38080678843). The runner
 * (sofascore-id-bridge-production-run.ts) recomputes the plan from fresh reads
 * and refuses on any difference. SQL is built from validated literals only
 * (`quote` from the bridge: a uuid or `[A-Za-z0-9:_.-]{1,64}`), never from free
 * text. Runbook: docs/production/SOFASCORE_ID_BRIDGE_PRODUCTION_RUNBOOK.md.
 */
import { createHash } from "node:crypto";
import {
  SOFASCORE_PROVIDER,
  type BridgeEntityType,
  type BridgePlan,
  type PlannedMapping,
} from "../../src/backend/football/sofascore-id-bridge";
import { PRODUCTION_PROJECT_REF, UUID, orderedRows, quote } from "./sofascore-id-bridge";

export const MANIFEST_PATH =
  "docs/production/manifests/sofascore-id-bridge-2026-10-10.manifest.json";
export const REHEARSE_CONFIRMATION = "REHEARSE_SOFASCORE_ID_BRIDGE_PRODUCTION";
export const APPLY_CONFIRMATION = "APPLY_SOFASCORE_ID_BRIDGE_PRODUCTION";
/** Raised by the rehearsal DO block (and only by it) to roll everything back. */
export const REHEARSAL_MARKER = "SOFASCORE_BRIDGE_REHEARSAL_ROLLBACK";
export const BASELINE_MARKER = "SOFASCORE_BRIDGE_BASELINE_NOT_EMPTY";
export const ENTITY_TYPES: readonly BridgeEntityType[] = [
  "competition",
  "season",
  "round",
  "team",
  "fixture",
];
const SHA256 = /^[0-9a-f]{64}$/;

export interface Manifest {
  readonly schemaVersion: 1;
  readonly projectRef: string;
  readonly provider: string;
  readonly sourceVersion: string;
  readonly competition: { readonly externalId: string; readonly internalId: string };
  readonly season: { readonly externalId: string; readonly internalId: string };
  readonly teams: Readonly<Record<string, string>>;
  readonly expected: {
    readonly toCreate: Readonly<Record<BridgeEntityType, number>>;
    readonly totalRows: number;
    readonly fixturesTotal: number;
    readonly fixturesMatched: number;
    readonly matchedByRound: number;
    readonly postponedOnly: number;
    readonly conflicts: number;
    readonly multiMatch: number;
    readonly repoints: number;
    readonly alreadyMapped: number;
    readonly teamsMissingFromTable: readonly number[];
    readonly roundsMissingInternally: readonly number[];
    readonly eventsSkippedMissingTeam: readonly number[];
    readonly fixturesNoMatch: readonly string[];
  };
  /** Optional pin of the canonical plan hash; the workflow input pins it too. */
  readonly planSha256: string | null;
}

function fail(code: string, detail: string): never {
  throw new Error(`sofascore_production_${code}: ${detail}`);
}

export function parseManifest(value: unknown): Manifest {
  const m = value as Manifest;
  if (m?.schemaVersion !== 1) fail("manifest_invalid", "schemaVersion must be 1");
  if (m.projectRef !== PRODUCTION_PROJECT_REF) fail("manifest_invalid", "projectRef");
  if (m.provider !== SOFASCORE_PROVIDER) fail("manifest_invalid", "provider");
  quote(m.sourceVersion);
  for (const part of [m.competition, m.season]) {
    quote(part?.externalId);
    if (!UUID.test(part.internalId)) fail("manifest_invalid", "internal id is not a uuid");
  }
  const teamEntries = Object.entries(m.teams ?? {});
  if (teamEntries.length === 0) fail("manifest_invalid", "teams is empty");
  const internal = new Set<string>();
  for (const [key, uuid] of teamEntries) {
    if (!/^\d+$/.test(key) || !UUID.test(uuid)) fail("manifest_invalid", `team ${key}`);
    internal.add(uuid);
  }
  if (internal.size !== teamEntries.length) fail("manifest_invalid", "two teams share an uuid");
  const e = m.expected;
  const counts = ENTITY_TYPES.map((t) => e?.toCreate?.[t]);
  if (counts.some((n) => !Number.isInteger(n) || (n as number) < 0))
    fail("manifest_invalid", "toCreate counts");
  if (counts.reduce((a, b) => (a as number) + (b as number), 0) !== e.totalRows)
    fail("manifest_invalid", "totalRows is not the sum of toCreate");
  for (const id of e.fixturesNoMatch) if (!UUID.test(id)) fail("manifest_invalid", "noMatch id");
  if (m.planSha256 !== null && !SHA256.test(m.planSha256))
    fail("manifest_invalid", "planSha256 must be null or 64 hex");
  return m;
}

export function manifestTeams(manifest: Manifest): Map<number, string> {
  return new Map(Object.entries(manifest.teams).map(([k, v]) => [Number(k), v]));
}

const flagsOf = (row: PlannedMapping) => [...row.flags].sort();

/** Rows in the one canonical order the hash and the SQL both use. */
export function canonicalRows(rows: readonly PlannedMapping[]) {
  return orderedRows(rows)
    .map((r) => ({
      entityType: r.entityType,
      externalId: r.externalId,
      internalId: r.internalId,
      flags: flagsOf(r),
    }))
    .sort(
      (a, b) =>
        ENTITY_TYPES.indexOf(a.entityType) - ENTITY_TYPES.indexOf(b.entityType) ||
        a.externalId.localeCompare(b.externalId, "en") ||
        a.internalId.localeCompare(b.internalId, "en"),
    );
}

/** Fixed key order, no whitespace: the same plan always serialises identically. */
export function canonicalPlanJson(plan: BridgePlan, manifest: Manifest): string {
  return JSON.stringify({
    contractVersion: "sofascore-id-bridge-v1",
    projectRef: manifest.projectRef,
    provider: manifest.provider,
    sourceVersion: manifest.sourceVersion,
    rows: canonicalRows(plan.rows),
    repoints: plan.repoints.map((r) => [r.fixtureId, r.fromExternalId, r.toExternalId]).sort(),
    fixturesNoMatch: [...plan.report.fixturesNoMatch].sort(),
  });
}

export const planSha256 = (plan: BridgePlan, manifest: Manifest) =>
  createHash("sha256").update(canonicalPlanJson(plan, manifest)).digest("hex");

/** Every difference between the fresh plan and the manifest; empty means no drift. */
export function comparePlanToManifest(plan: BridgePlan, manifest: Manifest): string[] {
  const problems: string[] = [];
  const r = plan.report;
  const e = manifest.expected;
  const same = (name: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      problems.push(`${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };
  const byType = Object.fromEntries(ENTITY_TYPES.map((t) => [t, 0])) as Record<
    BridgeEntityType,
    number
  >;
  for (const row of plan.rows) byType[row.entityType] += 1;
  same("toCreate", byType, e.toCreate);
  same("totalRows", plan.rows.length, e.totalRows);
  same("fixturesTotal", r.fixturesTotal, e.fixturesTotal);
  same("fixturesMatched", r.fixturesMatched.length, e.fixturesMatched);
  same(
    "matchedByRound",
    r.fixturesMatched.filter((m) => m.flags.includes("matched_by_round")).length,
    e.matchedByRound,
  );
  same(
    "postponedOnly",
    r.fixturesMatched.filter((m) => m.flags.includes("postponed_only")).length,
    e.postponedOnly,
  );
  same("conflicts", r.conflicts.length, e.conflicts);
  same("multiMatch", r.fixturesMultiMatch.length, e.multiMatch);
  same("repoints", plan.repoints.length, e.repoints);
  same("alreadyMapped", r.alreadyMapped.length, e.alreadyMapped);
  same("teamsMissingFromTable", r.teamsMissingFromTable, e.teamsMissingFromTable);
  same("roundsMissingInternally", r.roundsMissingInternally, e.roundsMissingInternally);
  same("eventsSkippedMissingTeam", r.eventsSkippedMissingTeam, e.eventsSkippedMissingTeam);
  same("fixturesNoMatch", [...r.fixturesNoMatch].sort(), [...e.fixturesNoMatch].sort());
  // The rows themselves must be the manifest's entities, not just the same number of them.
  for (const row of plan.rows) {
    if (row.entityType === "competition")
      same(
        "competition row",
        [row.externalId, row.internalId],
        [manifest.competition.externalId, manifest.competition.internalId],
      );
    if (row.entityType === "season")
      same(
        "season row",
        [row.externalId, row.internalId],
        [manifest.season.externalId, manifest.season.internalId],
      );
    if (row.entityType === "team" && manifest.teams[row.externalId] !== row.internalId)
      problems.push(`team row ${row.externalId} is not the approved pairing`);
  }
  const hash = planSha256(plan, manifest);
  if (manifest.planSha256 !== null && manifest.planSha256 !== hash)
    problems.push(`planSha256: manifest pins ${manifest.planSha256}, computed ${hash}`);
  return problems;
}

/** Throws unless the owner-approved hash equals the computed one. */
export function assertApprovedHash(approved: string | undefined, computed: string): void {
  if (!approved || !SHA256.test(approved))
    fail("hash_missing", "plan_sha256 must be the 64-hex hash printed by the rehearsal");
  if (approved !== computed)
    fail("hash_mismatch", `approved ${approved} but the fresh plan hashes to ${computed}`);
}

/** An internal id must be a real uuid: the bridge's `quote` also accepts plain tokens. */
const uuidQuote = (id: string) => {
  if (!UUID.test(id))
    throw new Error("sofascore_bridge_literal_invalid: refusing to build SQL from this value");
  return quote(id);
};
const uuidList = (ids: readonly string[]) => ids.map((id) => `${uuidQuote(id)}::uuid`).join(", ");

export const mappingCall = (
  row: Pick<PlannedMapping, "entityType" | "externalId" | "internalId">,
  sourceVersion: string,
) =>
  `perform api.resolve_football_mapping(${quote(SOFASCORE_PROVIDER)}, ${quote(row.entityType)}, ` +
  `${quote(row.externalId)}, ${uuidQuote(row.internalId)}::uuid, ${quote(sourceVersion)});`;

export type RunMode = "rehearse" | "apply";

/**
 * The single DO block sent to production (one statement, one transaction).
 * Both modes: baseline must be empty, internal rows must exist, every planned
 * row goes through api.resolve_football_mapping, then the written state is
 * read back inside the transaction and must equal the plan. Rehearsal ends in a
 * deliberate raise carrying the computed counts out, which rolls everything
 * back; apply ends normally, which commits.
 */
export function buildDoBlock(mode: RunMode, plan: BridgePlan, manifest: Manifest): string {
  const rows = canonicalRows(plan.rows);
  const byType = (t: BridgeEntityType) => rows.filter((r) => r.entityType === t);
  const comp = manifest.competition.internalId;
  const season = manifest.season.internalId;
  const typeList = ENTITY_TYPES.map((t) => quote(t)).join(", ");
  const provider = quote(SOFASCORE_PROVIDER);
  const expectedRows = rows
    .map((r) => `(${quote(r.entityType)}, ${quote(r.externalId)}, ${uuidQuote(r.internalId)})`)
    .join(",\n      ");
  const exists = (label: string, table: string, extra: string, ids: readonly string[]) =>
    `  select count(*) into v_n from ${table} where id in (${uuidList(ids)})${extra};\n` +
    `  if v_n <> ${ids.length} then\n` +
    `    raise exception 'SOFASCORE_BRIDGE_INTERNAL_ROW_MISSING: ${label} % of ${ids.length}', v_n using errcode = 'P0001';\n` +
    `  end if;\n`;
  const calls = ENTITY_TYPES.flatMap((t) =>
    byType(t).map((r) => `  ${mappingCall(r, manifest.sourceVersion)}`),
  ).join("\n");
  const total = rows.length;

  const ending =
    mode === "rehearse"
      ? `  -- Deliberate: the raise below rolls the whole transaction back and carries the\n` +
        `  -- computed state out in its message. Only the rehearsal contains it.\n` +
        `  raise exception '${REHEARSAL_MARKER} %', v_result::text using errcode = 'P0001';\n`
      : `  -- Apply: the block ends normally, which commits exactly once.\n`;

  return `do $sofascore_bridge$
declare
  v_n bigint;
  v_active bigint;
  v_matching bigint;
  v_by_type jsonb;
  v_result jsonb;
begin
  -- 1. Baseline: no sofascore mapping of these entity types exists (active or not).
  select count(*) into v_n from app_private.football_provider_mappings
   where provider_name = ${provider} and entity_type in (${typeList});
  if v_n <> 0 then
    raise exception '${BASELINE_MARKER}: % row(s)', v_n using errcode = 'P0001';
  end if;

  -- 2. Every internal row the plan points at exists and belongs to the season.
${exists("competition", "app.competitions", "", [comp])}${exists("season", "app.seasons", ` and competition_id = ${uuidQuote(comp)}::uuid`, [season])}${exists(
    "team",
    "app.teams",
    "",
    byType("team").map((r) => r.internalId),
  )}${exists(
    "round",
    "app.rounds",
    ` and season_id = ${uuidQuote(season)}::uuid`,
    byType("round").map((r) => r.internalId),
  )}${exists(
    "fixture",
    "app.fixtures",
    ` and season_id = ${uuidQuote(season)}::uuid`,
    byType("fixture").map((r) => r.internalId),
  )}
  -- 3. Writes: only through the reviewed resolver, parents first.
${calls}

  -- 4. Read back inside the transaction: exactly the plan, nothing more.
  select count(*) into v_active from app_private.football_provider_mappings
   where provider_name = ${provider} and entity_type in (${typeList}) and active;
  select count(*) into v_matching
    from app_private.football_provider_mappings m
    join (values
      ${expectedRows}
    ) as v(entity_type, external_id, internal_id)
      on m.entity_type = v.entity_type::app_private.football_entity_type
     and m.external_id = v.external_id
     and m.internal_entity_id = v.internal_id::uuid
   where m.provider_name = ${provider} and m.active;
  select coalesce(jsonb_object_agg(s.entity_type, s.c), '{}'::jsonb) into v_by_type
    from (select entity_type::text as entity_type, count(*) as c
            from app_private.football_provider_mappings
           where provider_name = ${provider} and entity_type in (${typeList}) and active
           group by 1) s;
  v_result := jsonb_build_object(
    'baselineRows', 0,
    'planned', ${total},
    'activeAfter', v_active,
    'matchingPlan', v_matching,
    'byType', v_by_type
  );
  if v_active <> ${total} or v_matching <> ${total} then
    raise exception 'SOFASCORE_BRIDGE_READBACK_MISMATCH %', v_result::text using errcode = 'P0001';
  end if;
${ending}end
$sofascore_bridge$`;
}

/** Read-only state read before and after: the rollback or commit is proven from this. */
export const STATE_SQL = `select jsonb_build_object(
  'sofascore_rows', (select count(*) from app_private.football_provider_mappings where provider_name = 'sofascore'),
  'sofascore_active_rows', (select count(*) from app_private.football_provider_mappings where provider_name = 'sofascore' and active),
  'other_mapping_rows', (select count(*) from app_private.football_provider_mappings where provider_name <> 'sofascore'),
  'other_mapping_digest', (select md5(coalesce(string_agg(concat_ws(':', m.id, m.provider_name, m.entity_type, m.external_id, m.internal_entity_id, m.active), '|' order by m.id), '')) from app_private.football_provider_mappings m where m.provider_name <> 'sofascore'),
  'sofascore_rows_detail', (select coalesce(jsonb_agg(jsonb_build_object('entityType', entity_type, 'externalId', external_id, 'internalId', internal_entity_id) order by entity_type, external_id), '[]'::jsonb) from app_private.football_provider_mappings where provider_name = 'sofascore' and active),
  'email_mode', (select mode from app_private.notification_email_settings where id),
  'live_refresh_enabled', (select football_live_refresh_enabled from app_private.notification_email_settings where id),
  'lifecycle_tick_enabled', (select lifecycle_tick_enabled from app_private.fantasy_automation_settings where id),
  'finalizing_gameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing'),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)'))
) as state`;

export interface DbState {
  sofascore_rows: number;
  sofascore_active_rows: number;
  other_mapping_rows: number;
  other_mapping_digest: string;
  sofascore_rows_detail: { entityType: string; externalId: string; internalId: string }[];
  email_mode: string | null;
  live_refresh_enabled: boolean | null;
  lifecycle_tick_enabled: boolean | null;
  finalizing_gameweeks: number;
  busy_sessions: number;
}

/** One-writer pre-checks from the database side: refuse unless the crons are paused. */
export function writerProblems(state: DbState): string[] {
  const problems: string[] = [];
  if (state.email_mode !== "off")
    problems.push(`notification_email mode is ${state.email_mode}, not off`);
  if (state.live_refresh_enabled !== false)
    problems.push("football live refresh is not switched off");
  if (state.lifecycle_tick_enabled !== false)
    problems.push("the Fantasy lifecycle tick is not switched off");
  if (state.finalizing_gameweeks !== 0)
    problems.push(`${state.finalizing_gameweeks} gameweek(s) are finalizing`);
  if (state.busy_sessions !== 0)
    problems.push(`${state.busy_sessions} other database session(s) busy`);
  return problems;
}

/** Pulls the JSON the rehearsal raise carried out of a Management API error body. */
export function extractRehearsalResult(body: string): Record<string, unknown> | null {
  let text = body;
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    text = String(parsed.message ?? parsed.error ?? body);
  } catch {
    /* body is not JSON: search it as is */
  }
  const at = text.indexOf(REHEARSAL_MARKER);
  if (at < 0) return null;
  const start = text.indexOf("{", at);
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The rehearsal result must equal the plan, exactly. */
export function rehearsalResultProblems(
  result: Record<string, unknown> | null,
  manifest: Manifest,
): string[] {
  if (!result) return ["the rehearsal did not return its computed state"];
  const e = manifest.expected;
  const problems: string[] = [];
  const same = (name: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      problems.push(`${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };
  same("baselineRows", result.baselineRows, 0);
  same("planned", result.planned, e.totalRows);
  same("activeAfter", result.activeAfter, e.totalRows);
  same("matchingPlan", result.matchingPlan, e.totalRows);
  const got = (result.byType ?? {}) as Record<string, number>;
  same(
    "byType",
    ENTITY_TYPES.map((t) => got[t]),
    ENTITY_TYPES.map((t) => e.toCreate[t]),
  );
  return problems;
}

/** Post-apply: the active sofascore rows are exactly the plan's rows. */
export function appliedRowsProblems(
  detail: DbState["sofascore_rows_detail"],
  plan: BridgePlan,
  manifest: Manifest,
): string[] {
  const key = (r: { entityType: string; externalId: string; internalId: string }) =>
    `${r.entityType}|${r.externalId}|${r.internalId}`;
  const want = canonicalRows(plan.rows).map(key).sort();
  const got = detail.map(key).sort();
  const problems: string[] = [];
  if (got.length !== manifest.expected.totalRows)
    problems.push(
      `expected ${manifest.expected.totalRows} active sofascore mappings, found ${got.length}`,
    );
  if (JSON.stringify(got) !== JSON.stringify(want))
    problems.push("the active sofascore mappings are not exactly the planned rows");
  return problems;
}
