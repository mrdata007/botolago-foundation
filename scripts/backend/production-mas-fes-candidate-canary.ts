/**
 * ONE-CLUB production candidate/observation canary: Maghreb Fès (MAS Fès) only.
 *
 * Collects the club's squad from Sofascore (teams/get-squad) and Flashscore
 * (v1/teams/squad) with the approved read-only collector, normalizes it in
 * memory, validates every item against the recorder contract, and (write mode
 * only) makes exactly ONE call to the trusted recorder
 * api.football_mapping_record_observations as the service role.
 *
 *   MODE=dry-run  collect + validate + print sanitized counts; writes nothing.
 *   MODE=write    the same, then ONE recorder call (never retried), then a fresh
 *                 read of production that classifies the outcome.
 *
 * It writes only through the recorder: no proposal, no mapping, no audit row,
 * no Fantasy row, no schedule. It never prints a name, a date of birth, a
 * provider id or a raw payload: counts and states only.
 */
import { createHash } from "node:crypto";
import { collectSquads, type FetchJson } from "../../src/backend/football/identity/collector";
import { CLUB_PROVIDER_TEAMS } from "../../src/backend/football/identity/club-registry";
import {
  groupCandidates,
  toObservationRecords,
  type ObservationRecord,
} from "../../src/backend/football/identity/candidate-builder";
import { probe } from "./provider-probe";

export const PROJECT_REF = "tkewgajrljbwgwedqsxn";
const STAGING_REF = "srdrflfrfpwixsllveid";
const API = "https://api.supabase.com";
export const CLUB_KEY = "maghreb-fes";
/** app.teams id of Maghreb Fès, read from production: a signal on the observation, never a filter. */
export const APP_TEAM_ID = "0257feb3-4c16-431d-a58b-5faf060576ad";
const GUARDED_RESOLVER_MD5 = "c4c7253284afa52aea055f74e3806d73";
const RECORDER = "football_mapping_record_observations";

export const OUT_OK = "MAS_FES_CANDIDATE_CANARY_APPLIED_AND_VERIFIED";
export const OUT_REFUSED = "CANDIDATE_CANARY_REFUSED_NO_WRITE";
export const OUT_REVIEW = "CANDIDATE_CANARY_NEEDS_REVIEW";

const DOB_STATES = [
  "valid",
  "missing",
  "not_provided",
  "unparseable",
  "future",
  "age_below_minimum",
  "age_above_maximum",
];

// ---------------------------------------------------------------------------
// Contract validation: mirrors the recorder's and the tables' own rules, so a
// malformed item stops the run before anything is written.
// ---------------------------------------------------------------------------
export function validateRecord(record: ObservationRecord): string[] {
  const problems: string[] = [];
  const text = (value: string, max: number) =>
    value === value.trim() && value.length >= 1 && value.length <= max;
  if (record.provider !== "sofascore" && record.provider !== "flashscore")
    problems.push("provider");
  if (!text(record.externalPlayerId, 200)) problems.push("externalPlayerId");
  if (!text(record.providerTeamId, 100)) problems.push("providerTeamId");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(record.clubKey)) problems.push("clubKey");
  if (record.appTeamId !== null && !/^[0-9a-f-]{36}$/.test(record.appTeamId))
    problems.push("appTeamId");
  if (!["COMPLETE", "INCOMPLETE_PROVIDER_SQUAD"].includes(record.squadCompleteness))
    problems.push("squadCompleteness");
  if (
    record.shirtNumber !== null &&
    !(Number.isInteger(record.shirtNumber) && record.shirtNumber >= 0 && record.shirtNumber <= 99)
  )
    problems.push("shirtNumber");
  if (record.positionSignal !== null && !["G", "D", "M", "F"].includes(record.positionSignal))
    problems.push("positionSignal");
  if (!DOB_STATES.includes(record.dobState)) problems.push("dobState");
  const dateOk =
    record.birthDate !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.birthDate) &&
    !Number.isNaN(Date.parse(record.birthDate));
  if ((record.dobState === "valid") !== dateOk) problems.push("birthDate");
  if (record.dobJanuary1 && record.dobState !== "valid") problems.push("dobJanuary1");
  if (
    record.heightCm !== null &&
    !(Number.isInteger(record.heightCm) && record.heightCm >= 120 && record.heightCm <= 230)
  )
    problems.push("heightCm");
  if (
    record.nationalitySignal !== null &&
    !/^(alpha2:[A-Z]{2}|flag:[0-9]{1,6})$/.test(record.nationalitySignal)
  )
    problems.push("nationalitySignal");
  if (record.registeredTeamId !== null && record.registeredTeamId.length === 0)
    problems.push("registeredTeamId");
  if (record.displayName !== null && !text(record.displayName, 200)) problems.push("displayName");
  if (typeof record.registeredTeamDisagreement !== "boolean")
    problems.push("registeredTeamDisagreement");
  return problems;
}

export interface DryRunCounts {
  readonly sofascoreSquadPlayers: number;
  readonly flashscoreSquadPlayers: number;
  readonly observationsToSubmit: number;
  readonly uniqueIdentities: { readonly sofascore: number; readonly flashscore: number };
  readonly duplicateIdsWithinProvider: { readonly sofascore: number; readonly flashscore: number };
  readonly multiSquadIds: number;
  readonly squadStatus: Record<string, string>;
  readonly dobStates: Record<string, number>;
  readonly positionSignals: Record<string, number>;
  readonly registeredTeamDisagreements: number;
  readonly malformedItems: number;
}

export function dryRunCounts(
  records: readonly ObservationRecord[],
  squads: readonly {
    provider: string;
    status: string;
    completeness: { state: string };
    players: readonly unknown[];
    diagnostics: { duplicateIds: readonly string[] };
  }[],
): DryRunCounts {
  const bump = (map: Record<string, number>, key: string) => {
    map[key] = (map[key] ?? 0) + 1;
  };
  const dobStates: Record<string, number> = {};
  const positions: Record<string, number> = {};
  for (const record of records) {
    bump(dobStates, record.dobState);
    bump(positions, record.positionSignal ?? "none");
  }
  const candidates = groupCandidates(records);
  const identities = (provider: string) => candidates.filter((c) => c.provider === provider).length;
  const squadOf = (provider: string) => squads.find((s) => s.provider === provider);
  return {
    sofascoreSquadPlayers: squadOf("sofascore")?.players.length ?? 0,
    flashscoreSquadPlayers: squadOf("flashscore")?.players.length ?? 0,
    observationsToSubmit: records.length,
    uniqueIdentities: { sofascore: identities("sofascore"), flashscore: identities("flashscore") },
    duplicateIdsWithinProvider: {
      sofascore: squadOf("sofascore")?.diagnostics.duplicateIds.length ?? 0,
      flashscore: squadOf("flashscore")?.diagnostics.duplicateIds.length ?? 0,
    },
    multiSquadIds: candidates.filter((c) => c.flags.includes("MULTI_SQUAD_OBSERVATION")).length,
    squadStatus: Object.fromEntries(
      squads.map((s) => [s.provider, `${s.status}/${s.completeness.state}`]),
    ),
    dobStates,
    positionSignals: positions,
    registeredTeamDisagreements: records.filter((r) => r.registeredTeamDisagreement).length,
    malformedItems: records.filter((r) => validateRecord(r).length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Production reads (Management API, read-only queries)
// ---------------------------------------------------------------------------
const FANTASY_COUNTS = `(select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint) from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%')`;
export const SNAPSHOT_SQL = `
select jsonb_build_object(
  'new_history_rows', (select count(*) from supabase_migrations.schema_migrations where version in ('20261001150000','20261001160000','20261001161000')),
  'providers', (select string_agg(name, ',' order by name) from app_private.football_providers),
  'candidates', (select count(*) from app_private.football_player_mapping_candidates),
  'candidates_sofascore', (select count(*) from app_private.football_player_mapping_candidates where provider_name = 'sofascore'),
  'candidates_flashscore', (select count(*) from app_private.football_player_mapping_candidates where provider_name = 'flashscore'),
  'duplicate_candidate_identities', (select count(*) from (select 1 from app_private.football_player_mapping_candidates group by provider_name, external_id having count(*) > 1) d),
  'multi_squad_candidates', (select count(*) from (select 1 from app_private.football_player_mapping_observations group by candidate_id having count(*) > 1) d),
  'observations', (select count(*) from app_private.football_player_mapping_observations),
  'observations_sofascore', (select count(*) from app_private.football_player_mapping_observations o join app_private.football_player_mapping_candidates c on c.id = o.candidate_id where c.provider_name = 'sofascore'),
  'observations_flashscore', (select count(*) from app_private.football_player_mapping_observations o join app_private.football_player_mapping_candidates c on c.id = o.candidate_id where c.provider_name = 'flashscore'),
  'candidates_with_status_other_than_unmapped', (select count(*) from app_private.football_player_mapping_candidates where status <> 'unmapped'),
  'proposals', (select count(*) from app_private.football_player_mapping_proposals),
  'mapping_rows', (select count(*) from app_private.football_provider_mappings),
  'reviewed_provider_mapping_rows', (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore','flashscore')),
  'mapping_identity_digest', (select md5(coalesce(string_agg(concat_ws(':', m.id, m.provider_name, m.entity_type, m.external_id, m.internal_entity_id, m.active), '|' order by m.id), '')) from app_private.football_provider_mappings m),
  'constraint_digest', (select md5(string_agg(conname || ':' || pg_get_constraintdef(oid) || ':' || condeferrable::text, '|' order by conname)) from pg_constraint where conrelid = 'app_private.football_provider_mappings'::regclass),
  'resolver_md5', (select md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamp with time zone)'::regprocedure))),
  'cron_jobs', (select count(*) from cron.job),
  'cron_digest', (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job),
  'sched_football_mapping', (select count(*) from cron.job where command ~* 'football_mapping'),
  'audit_events', (select count(*) from app_private.admin_audit_events),
  'idempotency_keys', (select count(*) from app_private.admin_idempotency_keys),
  'fantasy_table_counts', ${FANTASY_COUNTS},
  'gameweek_digest', (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g),
  'automation_digest', (select md5(coalesce(string_agg(s::text, '|' order by s::text), '')) from app_private.fantasy_automation_settings s),
  'player_count', (select count(*) from app.players),
  'fixture_count', (select count(*) from app.fixtures),
  'app_team_exists', (select count(*) from app.teams where id = '${APP_TEAM_ID}'),
  'new_table_api_grants', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace, (values ('anon'),('authenticated'),('service_role')) r(role) where n.nspname = 'app_private' and c.relname like 'football_player_mapping%' and c.relkind = 'r' and has_table_privilege(r.role, c.oid, 'select,insert,update,delete,truncate,references,trigger')),
  'busy_sessions', (select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and state in ('active','idle in transaction','idle in transaction (aborted)')),
  'finalizing_gameweeks', (select count(*) from app.fantasy_gameweeks where status = 'finalizing'),
  'lifecycle_tick_enabled', (select count(*) from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
) as snapshot`;

export type Snapshot = Record<string, unknown>;

export async function snapshot(token: string): Promise<Snapshot> {
  const response = await fetch(`${API}/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: SNAPSHOT_SQL, read_only: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`snapshot_http_${response.status}`);
  const rows = (await response.json()) as { snapshot: Snapshot | string }[];
  const value = rows[0]?.snapshot;
  return typeof value === "string" ? (JSON.parse(value) as Snapshot) : (value as Snapshot);
}

export const PRE_EXPECT: Record<string, unknown> = {
  new_history_rows: 3,
  providers: "fixture,flashscore,sofascore,sportsmonks",
  candidates: 0,
  observations: 0,
  proposals: 0,
  reviewed_provider_mapping_rows: 0,
  sched_football_mapping: 0,
  resolver_md5: GUARDED_RESOLVER_MD5,
  constraint_digest: "84d45fbd1c71c689561c39afe04094c9",
  new_table_api_grants: 0,
  app_team_exists: 1,
  busy_sessions: 0,
  finalizing_gameweeks: 0,
  lifecycle_tick_enabled: 0,
};

/** What must be identical before and after the single recorder call. */
export const UNCHANGED_KEYS = [
  "mapping_rows",
  "reviewed_provider_mapping_rows",
  "mapping_identity_digest",
  "constraint_digest",
  "resolver_md5",
  "cron_jobs",
  "cron_digest",
  "sched_football_mapping",
  "audit_events",
  "idempotency_keys",
  "fantasy_table_counts",
  "gameweek_digest",
  "automation_digest",
  "player_count",
  "fixture_count",
  "proposals",
  "new_table_api_grants",
];

export function postWriteProblems(
  before: Snapshot,
  after: Snapshot,
  expected: {
    candidates: { sofascore: number; flashscore: number };
    observations: { sofascore: number; flashscore: number };
    multiSquad: number;
  },
): string[] {
  const problems = UNCHANGED_KEYS.filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  ).map((k) => `changed:${k}`);
  const want: Record<string, unknown> = {
    candidates: expected.candidates.sofascore + expected.candidates.flashscore,
    candidates_sofascore: expected.candidates.sofascore,
    candidates_flashscore: expected.candidates.flashscore,
    observations: expected.observations.sofascore + expected.observations.flashscore,
    observations_sofascore: expected.observations.sofascore,
    observations_flashscore: expected.observations.flashscore,
    duplicate_candidate_identities: 0,
    multi_squad_candidates: expected.multiSquad,
    candidates_with_status_other_than_unmapped: 0,
    proposals: 0,
    reviewed_provider_mapping_rows: 0,
  };
  for (const [key, value] of Object.entries(want))
    if (after[key] !== value)
      problems.push(`expected:${key}=${String(value)} got ${String(after[key])}`);
  return problems;
}

// ---------------------------------------------------------------------------
// The one recorder call
// ---------------------------------------------------------------------------
export type RecorderResult =
  | { ok: true; summary: Record<string, number> }
  | { ok: false; status: number | null; code: string };

/** Error text can echo a value; only a stable one-word code is ever printed. */
export function safeCode(body: unknown, status: number | null): string {
  const message =
    typeof (body as { message?: unknown } | null)?.message === "string"
      ? (body as { message: string }).message
      : "";
  if (/^[a-z_]{3,60}$/.test(message)) return message;
  const code =
    typeof (body as { code?: unknown } | null)?.code === "string"
      ? (body as { code: string }).code
      : "";
  return /^[A-Z0-9]{3,10}$/.test(code)
    ? `sqlstate_${code}`
    : status === null
      ? "no_response"
      : `http_${status}`;
}

export async function callRecorderOnce(
  serviceKey: string,
  records: readonly ObservationRecord[],
): Promise<RecorderResult> {
  let response: Response;
  try {
    response = await fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/rpc/${RECORDER}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        "content-profile": "api",
      },
      body: JSON.stringify({ p_observations: records }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return { ok: false, status: null, code: "no_response" };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    return { ok: false, status: response.status, code: safeCode(body, response.status) };
  const summary = body as Record<string, number> | null;
  if (!summary || typeof summary.observationsSeen !== "number")
    return { ok: false, status: response.status, code: "invalid_summary" };
  return { ok: true, summary };
}

// ---------------------------------------------------------------------------
async function main(): Promise<number> {
  const mode = process.env.MODE;
  if (mode !== "dry-run" && mode !== "write") throw new Error("MODE must be dry-run or write");
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!token) throw new Error("missing SUPABASE_ACCESS_TOKEN");
  if (process.env.SUPABASE_PRODUCTION_PROJECT_REF !== PROJECT_REF || PROJECT_REF === STAGING_REF)
    throw new Error("production project-ref guard failed");
  if (!process.env.RAPIDAPI_KEY || !process.env.FLASHSCORE_RAPIDAPI_HOST)
    throw new Error("the provider credentials are not available to this job");
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? "";
  if (mode === "write" && !serviceKey) throw new Error("missing SUPABASE_SECRET_KEY");
  const expectedMappingRows = Number(process.env.EXPECTED_MAPPING_ROWS ?? "1541");

  // 1. Pre-flight.
  const before = await snapshot(token);
  const drift = Object.entries(PRE_EXPECT)
    .filter(([k, v]) => before[k] !== v)
    .map(([k]) => k);
  if (before.mapping_rows !== expectedMappingRows) drift.push("mapping_rows");
  if (drift.length > 0) {
    console.log(`PREFLIGHT_REFUSED_NO_WRITE: ${drift.join(", ")}`);
    return 2;
  }
  console.log(
    "Pre-flight verified:",
    JSON.stringify({
      candidates: 0,
      observations: 0,
      proposals: 0,
      mappingRows: before.mapping_rows,
      reviewedMappingRows: 0,
      migrations: 3,
      resolverGuarded: true,
    }),
  );

  // 2. Collect MAS Fès only (2 requests), normalize in memory.
  const club = CLUB_PROVIDER_TEAMS.find((c) => c.clubKey === CLUB_KEY);
  if (!club) throw new Error("club not in the registry");
  const fetchJson: FetchJson = async (provider, path) => {
    const response = await probe(provider, path);
    let body: unknown = null;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };
  const collection = await collectSquads({ fetchJson, now: new Date(), clubs: [club] });
  const records = toObservationRecords(collection, {
    appTeamIdByClubKey: { [CLUB_KEY]: APP_TEAM_ID },
  });
  const counts = dryRunCounts(records, collection.squads);
  console.log("Collector requests:", JSON.stringify(collection.requests));
  console.log("Dry-run counts:", JSON.stringify(counts));
  const failedSquads = collection.squads.filter((s) => s.status !== "ok");
  if (failedSquads.length > 0 || counts.malformedItems > 0 || records.length === 0) {
    console.log(
      `DRY_RUN_NOT_CLEAN: failedSquads=${failedSquads.length} malformed=${counts.malformedItems} observations=${records.length}`,
    );
    return 3;
  }
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(records.map((r) => [r.provider, r.externalPlayerId, r.providerTeamId]).sort()),
    )
    .digest("hex")
    .slice(0, 16);
  console.log(
    `DRY_RUN_CLEAN observations=${records.length} candidates=${counts.uniqueIdentities.sofascore + counts.uniqueIdentities.flashscore} shape=${fingerprint}`,
  );
  if (mode === "dry-run") return 0;

  // 3. Write mode: the dry-run numbers must match what was reviewed.
  const wantObservations = Number(process.env.EXPECTED_OBSERVATIONS ?? "");
  const wantCandidates = Number(process.env.EXPECTED_CANDIDATES ?? "");
  if (
    wantObservations !== records.length ||
    wantCandidates !== counts.uniqueIdentities.sofascore + counts.uniqueIdentities.flashscore
  ) {
    console.log(
      `WRITE_REFUSED_NO_WRITE: the collected counts differ from the reviewed dry-run (${records.length}/${counts.uniqueIdentities.sofascore + counts.uniqueIdentities.flashscore})`,
    );
    return 4;
  }

  // 4. ONE recorder call. Never retried.
  const result = await callRecorderOnce(serviceKey, records);
  console.log(
    "Recorder:",
    JSON.stringify(
      result.ok
        ? { ok: true, summary: result.summary }
        : { ok: false, status: result.status, code: result.code },
    ),
  );

  // 5. Fresh read decides the outcome, whatever the call reported.
  let after: Snapshot;
  try {
    after = await snapshot(token);
  } catch {
    console.log(OUT_REVIEW, "- production could not be read afterwards");
    return 5;
  }
  if (!result.ok) {
    const nothingChanged =
      after.candidates === 0 &&
      after.observations === 0 &&
      UNCHANGED_KEYS.every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
    console.log(
      nothingChanged ? OUT_REFUSED : OUT_REVIEW,
      nothingChanged
        ? "- the recorder refused and nothing was written"
        : "- the recorder reported failure but production changed",
    );
    return nothingChanged ? 6 : 5;
  }
  const problems = postWriteProblems(before, after, {
    candidates: counts.uniqueIdentities,
    observations: {
      sofascore: records.filter((r) => r.provider === "sofascore").length,
      flashscore: records.filter((r) => r.provider === "flashscore").length,
    },
    multiSquad: counts.multiSquadIds,
  });
  console.log(
    "After:",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(after).filter(([k]) => !["fantasy_table_counts"].includes(k)),
      ),
    ),
  );
  if (problems.length > 0) {
    console.log(OUT_REVIEW);
    for (const problem of problems) console.log(" -", problem);
    return 5;
  }
  console.log(OUT_OK);
  return 0;
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      // A stable one-line message only: never a response body.
      console.error(`Canary stopped: ${error instanceof Error ? error.message : "error"}`);
      process.exit(2);
    });
}
