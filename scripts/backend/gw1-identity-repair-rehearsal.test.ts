// The GW1 identity repair, rehearsed on a disposable database: the real
// scoped recorder -> plan -> apply -> identity resolution, and the real
// statistics import before and after it (docs/backend/GW1_RECOVERY_PACKAGE_2026-10-01.md).
//
// Why a bun test and not pgTAP: the scripts are owner-run files with their own
// transactions (begin/commit), settings that must survive a rollback, and a
// rehearsal that ends in a deliberate raise; the overlap checks need separate
// connections. The precedent is pepites-editions-concurrency.test.ts.
//
// It writes rows that stay (players, observations), under fresh random ids, and
// switches the Fantasy tick off for its own run (restoring it afterwards). So
// it runs only when GW1_REPAIR_E2E_DB_URL names a DISPOSABLE database, a local
// stack after `supabase db reset`:
//
//   GW1_REPAIR_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres \
//     bun test scripts/backend/gw1-identity-repair-rehearsal.test.ts
//
// CI's database-quality job runs it after the pgTAP suite. Set but unreachable,
// it fails rather than skipping. Never point it at production or staging.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const DB_URL = process.env.GW1_REPAIR_E2E_DB_URL || undefined;
const CONNECT_TIMEOUT_MS = 3_000;
type Row = Record<string, unknown>;
if (!DB_URL) {
  console.info(
    "[gw1-identity-repair-rehearsal] Skipped: it writes rows, so it runs only when " +
      "GW1_REPAIR_E2E_DB_URL names a disposable database (a local stack after `supabase db reset`).",
  );
}

const RECORDER = readFileSync(
  new URL("./record-scoped-player-list-observation.sql", import.meta.url),
  "utf8",
);
const RESOLVER = readFileSync(
  new URL("./diagnose-fixture-identities.sql", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// Fixed provider ids of this scenario (the season and competition ids are the
// ones the functions look for; everything else is synthetic and per-run).
// ---------------------------------------------------------------------------
const BASE = crypto.randomUUID().replaceAll("-", "").slice(0, 7);
const uid = (kind: number, n: number) =>
  `${BASE}${kind}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sqlUid = (kind: number, expression: string) =>
  `('${BASE}${kind}-0000-4000-8000-' || lpad((${expression})::text, 12, '0'))::uuid`;
const COMPETITION = uid(0, 1);
const SEASON = uid(1, 1);
const ROUND = uid(2, 1);
const CLUB_A = uid(3, 1);
const CLUB_B = uid(3, 2);
const FIXTURE = uid(4, 1);
const FANTASY_COMPETITION = uid(5, 1);
const FANTASY_SEASON = uid(5, 2);
const GAMEWEEK = uid(5, 3);
const MANAGER = uid(6, 1);
const FANTASY_TEAM = uid(6, 2);
const P0 = 91_000_000;
const ext = (n: number) => String(P0 + n);
const CLUB_A_EXT = String(P0 + 901);
const CLUB_B_EXT = String(P0 + 902);
const FIXTURE_EXT = String(P0 + 903);
const PLAYER_ID = (n: number) => uid(7, n);
const FANTASY_PLAYER_ID = (n: number) => uid(8, n);

// Players 1-11 start for club A (1 is its goalkeeper), 12-22 for club B (12).
const S_OK = 23; // a substitute already placed correctly
const S_NOMEM = 24; // mapped, with no club record at all
const S_HELD = 25; // mapped, listed at B, held by a Fantasy team; the provider shows him at A
const S_NEW = 26; // the canonical list does not know him
const S_NOPOS = 27; // unknown, and the provider gives no position
const S2_NEW1 = 31; // a second, independent pair, for the atomicity test
const S2_NEW2 = 32;

let a: Bun.SQL | null = null;
let b: Bun.SQL | null = null;
let c: Bun.SQL | null = null;
let tickWasOn: boolean | null = null;

function db(connection: Bun.SQL | null): Bun.SQL {
  if (!connection) throw new Error("not connected");
  return connection;
}
async function connect(): Promise<Bun.SQL> {
  const candidate = new Bun.SQL({ url: DB_URL, max: 1 });
  try {
    await Promise.race([
      candidate`select 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS),
      ),
    ]);
  } catch (error) {
    await candidate.end().catch(() => undefined);
    throw new Error(
      "[gw1-identity-repair-rehearsal] GW1_REPAIR_E2E_DB_URL is set, but its database did not " +
        `answer within ${CONNECT_TIMEOUT_MS}ms (${(error as Error).message}).`,
    );
  }
  return candidate;
}
async function asService(connection: Bun.SQL) {
  await connection`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`;
}
/** The local database runs the scheduled jobs too; a call that must succeed waits for one, as the workflow does. */
async function patiently<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const message = (error as Error).message ?? "";
      const busy =
        message.includes("scheduled_job_running") || message.includes("(pg_cron) job is running");
      if (!busy || attempt >= 200) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
async function message(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
  } catch (error) {
    return (error as Error).message ?? String(error);
  }
  return "";
}

// ---------------------------------------------------------------------------
// The scenario's database
// ---------------------------------------------------------------------------
function seedSql(): string {
  const starters = (club: string, from: number, to: number, gk: number) => `
    insert into app.players (id, slug, full_name, display_name, position)
    select ${sqlUid(7, "n")}, 'gw1-e2e-${BASE}-' || n, 'Rehearsal Player ' || n, 'R. Player ' || n,
      case when n = ${gk} then 'goalkeeper' when n % 3 = 0 then 'defender' when n % 3 = 1 then 'midfielder'
        else 'forward' end::app.football_position
    from generate_series(${from}, ${to}) n;
    insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active)
    select 'sportsmonks', 'player', (${P0} + n)::text, ${sqlUid(7, "n")}, 'gw1-e2e', statement_timestamp(), true
    from generate_series(${from}, ${to}) n;
    insert into app.team_memberships (player_id, team_id, season_id, valid_from, valid_to, active)
    select ${sqlUid(7, "n")}, '${club}', '${SEASON}', current_date - 90, current_date + 270, true
    from generate_series(${from}, ${to}) n;`;
  const extra = (n: number, name: string, position: string) => `
    insert into app.players (id, slug, full_name, display_name, position)
    values ('${PLAYER_ID(n)}', 'gw1-e2e-${BASE}-${n}', '${name}', '${name}', '${position}');
    insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active)
    values ('sportsmonks', 'player', '${ext(n)}', '${PLAYER_ID(n)}', 'gw1-e2e', statement_timestamp(), true);`;
  return `
    insert into app.competitions (id, slug, name, competition_type)
    values ('${COMPETITION}', 'gw1-e2e-${BASE}', 'GW1 Rehearsal League', 'league');
    insert into app.seasons (id, competition_id, label, starts_on, ends_on, is_current, status)
    values ('${SEASON}', '${COMPETITION}', '2026/2027', current_date - 90, current_date + 270, true, 'active');
    insert into app.rounds (id, season_id, round_number, name, status) values ('${ROUND}', '${SEASON}', 1, 'Round 1', 'active');
    insert into app.teams (id, slug, name, short_name) values
      ('${CLUB_A}', 'gw1-e2e-${BASE}-a', 'Rehearsal Club A', 'RCA'),
      ('${CLUB_B}', 'gw1-e2e-${BASE}-b', 'Rehearsal Club B', 'RCB');
    insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status, period,
      home_score, away_score, provider_updated_at, source_sequence, source_version)
    values ('${FIXTURE}', '${COMPETITION}', '${SEASON}', '${ROUND}', '${CLUB_A}', '${CLUB_B}',
      statement_timestamp() - interval '2 days', 'finished', 'post_match', 0, 0, statement_timestamp(), 1, 'gw1-e2e');
    insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active) values
      ('sportsmonks', 'competition', '860', '${COMPETITION}', 'gw1-e2e', statement_timestamp(), true),
      ('sportsmonks', 'season', '28647', '${SEASON}', 'gw1-e2e', statement_timestamp(), true),
      ('sportsmonks', 'team', '${CLUB_A_EXT}', '${CLUB_A}', 'gw1-e2e', statement_timestamp(), true),
      ('sportsmonks', 'team', '${CLUB_B_EXT}', '${CLUB_B}', 'gw1-e2e', statement_timestamp(), true),
      ('sportsmonks', 'fixture', '${FIXTURE_EXT}', '${FIXTURE}', 'gw1-e2e', statement_timestamp(), true);
    ${starters(CLUB_A, 1, 11, 1)}
    ${starters(CLUB_B, 12, 22, 12)}
    ${extra(S_OK, "Rehearsal Resolved Sub", "midfielder")}
    insert into app.team_memberships (player_id, team_id, season_id, valid_from, valid_to, active)
    values ('${PLAYER_ID(S_OK)}', '${CLUB_A}', '${SEASON}', current_date - 90, current_date + 270, true);
    ${extra(S_NOMEM, "Rehearsal Mapped Nomember", "defender")}
    ${extra(S_HELD, "Rehearsal Held Mover", "midfielder")}
    insert into app.team_memberships (player_id, team_id, season_id, valid_from, valid_to, active)
    values ('${PLAYER_ID(S_HELD)}', '${CLUB_B}', '${SEASON}', current_date - 90, current_date + 270, true);

    insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
    values ('${FANTASY_COMPETITION}', '${COMPETITION}', 'gw1-e2e-${BASE}', 'GW1 Rehearsal Fantasy', true);
    insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
    values ('${FANTASY_SEASON}', '${FANTASY_COMPETITION}', '${SEASON}', 'f6100000-0000-4000-8000-000000000100',
      '2026/2027', 'active', current_date - 30, current_date + 300);
    insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
    values ('${GAMEWEEK}', '${FANTASY_SEASON}', '${ROUND}', 1, 'Gameweek 1',
      statement_timestamp() - interval '3 days', statement_timestamp() - interval '2 days',
      statement_timestamp() + interval '3 days', 'provisional');
    insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
    values ('${FANTASY_PLAYER_ID(S_HELD)}', '${FANTASY_SEASON}', '${PLAYER_ID(S_HELD)}', '${CLUB_B}',
      (select id from app.fantasy_positions where code = 'MID'), 6.5);
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('${MANAGER}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'gw1-e2e-${BASE}@example.test', statement_timestamp(), 'hash', '{}', '{"username":"gw1_e2e_${BASE}"}',
      statement_timestamp(), statement_timestamp());
    insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers)
    values ('${FANTASY_TEAM}', '${MANAGER}', '${FANTASY_SEASON}', '${GAMEWEEK}', 'GW1 Rehearsal XI', 10, 100, 1);
    insert into app.fantasy_squad_memberships (fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id)
    values ('${FANTASY_TEAM}', '${FANTASY_PLAYER_ID(S_HELD)}', 6.5, 6.5, '${GAMEWEEK}');
    update app.fantasy_players set selected_by_count = 1 where id = '${FANTASY_PLAYER_ID(S_HELD)}';
    insert into app_private.fantasy_scoring_snapshots (gameweek_id, calculation_version, input_digest, payload)
    values ('${GAMEWEEK}', 1, repeat('a', 64), '{"rehearsal": true}');
  `;
}

type Member = {
  externalPlayerId: string;
  teamExternalId: string;
  fullName: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  position: string | null;
  shirtNumber: number | null;
};
function member(n: number, team: string, name: string | null, position: string | null): Member {
  const display = name ?? `R. Player ${n}`;
  return {
    externalPlayerId: ext(n),
    teamExternalId: team,
    fullName: name,
    displayName: display,
    firstName: null,
    lastName: null,
    dateOfBirth: name ? "2000-01-01" : null,
    position,
    shirtNumber: null,
  };
}
/** What the provider shows for the fixture: every starter (placed), and the scenario's players. */
function lineup(extraMembers: Member[]): Member[] {
  const starters: Member[] = [];
  for (let n = 1; n <= 22; n += 1)
    starters.push(
      member(
        n,
        n <= 11 ? CLUB_A_EXT : CLUB_B_EXT,
        `Rehearsal Player ${n}`,
        n === 1 || n === 12 ? "goalkeeper" : "midfielder",
      ),
    );
  return [
    ...starters,
    member(S_OK, CLUB_A_EXT, "Rehearsal Resolved Sub", "midfielder"),
    member(S_NOMEM, CLUB_A_EXT, "Rehearsal Mapped Nomember", "defender"),
    // Listed at B in our data, in A's lineup at the provider: a move.
    member(S_HELD, CLUB_A_EXT, "Rehearsal Held Mover", "midfielder"),
    ...extraMembers,
  ];
}
const NEW1 = member(S_NEW, CLUB_A_EXT, "Rehearsal New Forward", "forward");
const NOPOS = member(S_NOPOS, CLUB_A_EXT, "Rehearsal No Position", null);
function observation(members: Member[], observedAt = new Date()): Record<string, unknown> {
  return {
    providerName: "sportsmonks",
    seasonExternalId: "28647",
    observedAt: observedAt.toISOString(),
    clubs: [CLUB_A_EXT, CLUB_B_EXT].map((team) => ({
      teamExternalId: team,
      source: "season-squad",
      players: members
        .filter((m) => m.teamExternalId === team && m.externalPlayerId !== ext(S_NOPOS))
        .map(({ teamExternalId: _team, ...rest }) => rest),
    })),
    lineups: [{ fixtureExternalId: FIXTURE_EXT, players: members }],
  };
}
/** Records an observation as the workflow does (fresh), and returns its id. */
async function record(doc: Record<string, unknown>): Promise<string> {
  const rows = await patiently(
    async () =>
      await db(
        a,
      )`select (api.service_record_current_player_list(${JSON.stringify(doc)}::text::jsonb) ->> 'observationId') as id`,
  );
  return String((rows as Array<{ id: string }>)[0]!.id);
}
/** Stores an observation as it was some time ago (the record function refuses an old one, so it goes in directly). */
async function storeOld(doc: Record<string, unknown>, ageMinutes: number): Promise<string> {
  const rows = await db(a)`
    insert into app_private.current_player_list_observations (season_id, provider_name, observed_at, observation_digest, observations)
    values (${SEASON}, 'sportsmonks', statement_timestamp() - make_interval(mins => ${ageMinutes}),
      encode(extensions.digest(${JSON.stringify(doc)}, 'sha256'), 'hex'), ${JSON.stringify(doc)}::text::jsonb)
    returning id`;
  return String((rows as Array<{ id: string }>)[0]!.id);
}

/** Replaces one `set_config('botolago.<name>', '...', false)` value, as the owner does by hand. */
function withSetting(script: string, name: string, value: string): string {
  const pattern = new RegExp(`(set_config\\('botolago\\.${name}',\\s*)'[^']*'`);
  if (!pattern.test(script)) throw new Error(`no setting ${name}`);
  return script.replace(pattern, `$1'${value.replaceAll("'", "''")}'`);
}
type Scope = {
  source: string;
  players: number[];
  fixtures?: string[];
  ackHeld?: number[];
  ackFantasy?: boolean;
  dryRun?: boolean;
  rehearseApply?: boolean;
};
function recorderScript(scope: Scope): string {
  let script = RECORDER;
  script = withSetting(script, "scope_source_observation", scope.source);
  script = withSetting(script, "scope_fixtures", (scope.fixtures ?? [FIXTURE_EXT]).join(","));
  script = withSetting(script, "scope_players", scope.players.map(ext).join(","));
  script = withSetting(script, "scope_ack_held_moves", (scope.ackHeld ?? []).map(ext).join(","));
  script = withSetting(script, "scope_ack_fantasy_additions", scope.ackFantasy ? "true" : "false");
  script = withSetting(
    script,
    "scope_rehearse_apply",
    scope.rehearseApply === false ? "false" : "true",
  );
  script = withSetting(script, "scope_dry_run", scope.dryRun === false ? "false" : "true");
  return script;
}
async function runRecorder(scope: Scope): Promise<{ error: string; rows: unknown }> {
  let rows: unknown = null;
  const error = await message(async () => {
    rows = await patiently(async () => await db(a).unsafe(recorderScript(scope)));
  });
  // A script that stopped inside its transaction leaves the session aborted; end it, as the owner would.
  await db(a)
    .unsafe("rollback")
    .catch(() => undefined);
  await asService(db(a));
  return { error, rows };
}
interface Report {
  listedPlayers: number;
  summary: { changes: number };
  skipped: Array<{ externalPlayerId: string }>;
  listedPlayersWithNoPlanChange: string[];
  rehearsedApply: { changes: number } | null;
  ineligibleAfterRehearsedApply: string[] | null;
  heldFantasyMoves: Array<{ externalPlayerId: string }>;
  fantasyCatalogAdditions: Array<{ externalPlayerId: string }>;
}
function rehearsalReport(error: string): Report {
  const marker = "REHEARSAL, nothing saved: ";
  const at = error.indexOf(marker);
  if (at < 0) throw new Error(`not a rehearsal result: ${error.slice(0, 400)}`);
  return JSON.parse(error.slice(at + marker.length));
}

/** A multi-statement script answers with one result per statement; this is the one that carries `key`. */
function resultWith(results: unknown, key: string): Row[] {
  const sets = (Array.isArray(results) ? results : []) as Row[][];
  return sets.find((rows) => Array.isArray(rows) && rows.some((row) => row && key in row)) ?? [];
}

/** Rows that must not change under a rehearsal, a refusal, or a rolled-back failure. */
async function counts(): Promise<Record<string, number>> {
  const rows = await db(c)`
    select
      (select count(*) from app.players) players,
      (select count(*) from app_private.football_provider_mappings where entity_type = 'player') player_mappings,
      (select count(*) from app.team_memberships) memberships,
      (select count(*) from app.fantasy_players) fantasy_players,
      (select count(*) from app.fantasy_player_price_history) price_history,
      (select count(*) from app_private.fantasy_initial_price_evidence) price_evidence,
      (select count(*) from app_private.current_player_list_observations) observations,
      (select count(*) from app_private.current_player_list_updates) updates`;
  return Object.fromEntries(Object.entries((rows as Row[])[0]!).map(([k, v]) => [k, Number(v)]));
}
/**
 * What an apply must NOT touch: the squads, the held player's price and position, every existing
 * canonical player's name and position, and the scoring snapshot. (His Fantasy club does change,
 * deliberately, and is asserted on its own.)
 */
async function protectedState(): Promise<string> {
  const rows = (await db(c).unsafe(`
    select md5(
      coalesce((select string_agg(m::text, '|' order by m.id) from app.fantasy_squad_memberships m
        where fantasy_team_id = '${FANTASY_TEAM}'), '')
      || '#' || (select fp.price::text || ':' || fp.position_id::text from app.fantasy_players fp
        where fp.id = '${FANTASY_PLAYER_ID(S_HELD)}')
      || '#' || coalesce((select string_agg(p.id::text || ':' || p.position::text || ':' || p.full_name, '|' order by p.id)
        from app.players p where p.id in (select ${sqlUid(7, "n")} from generate_series(1, 25) n)), '')
      || '#' || coalesce((select string_agg(s::text, '|') from app_private.fantasy_scoring_snapshots s
        where gameweek_id = '${GAMEWEEK}'), '')) as h`)) as Row[];
  return String(rows[0].h);
}

// ---------------------------------------------------------------------------
// The statistics import, for real: the same RPC the importer calls.
// ---------------------------------------------------------------------------
type IngestRow = Record<string, unknown>;
function ingestRow(m: Member, index: number): IngestRow {
  const starter = index < 22;
  // The database decides by the canonical position; only the two goalkeepers need explicit saves.
  const goalkeeper = m.externalPlayerId === ext(1) || m.externalPlayerId === ext(12);
  return {
    externalPlayerId: m.externalPlayerId,
    externalTeamId: m.teamExternalId,
    started: starter,
    appeared: starter,
    minutes: starter ? 90 : 0,
    goals: 0,
    assists: 0,
    cleanSheets: starter ? 1 : 0,
    goalsConceded: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    secondYellowDismissals: 0,
    ownGoals: 0,
    saves: goalkeeper ? 0 : null,
    penaltiesSaved: goalkeeper ? 0 : null,
  };
}
function ingestCall(members: Member[]) {
  const rows = members.map(ingestRow);
  const coverage = {
    lineupRowsSeen: rows.length,
    validPlayerRows: rows.length,
    excludedIncompleteRows: 0,
    starterRows: 22,
    identifiedStarterRows: 22,
    anonymousStarterRows: 0,
    teamCount: 2,
    detailRows: 66,
    invalidDetailRows: 0,
    missingStatisticRows: 0,
    scoringStatisticsComplete: true,
    cleanSheetSource: "official_minutes_and_on_pitch_goals_conceded",
    goalkeeperStatistics: "explicit_value_or_null_canonical_position_checked_in_database",
  };
  return { rows, coverage };
}
async function ingest(members: Member[]): Promise<string> {
  const { rows, coverage } = ingestCall(members);
  return await message(async () => {
    await db(b)`select api.ingest_current_player_fixture_performance(
      'sportsmonks', '28647', ${FIXTURE_EXT}, ${JSON.stringify(rows)}::text::jsonb, ${JSON.stringify(coverage)}::text::jsonb, statement_timestamp())`;
  });
}

// ---------------------------------------------------------------------------
const describeDb = DB_URL ? describe : describe.skip;

describeDb("GW1 identity repair, rehearsed on a disposable database", () => {
  let sourceId = "";
  let scopedId = "";
  let planDigest = "";
  const everything = lineup([NEW1, NOPOS]);
  const unresolved = [S_NOMEM, S_HELD, S_NEW, S_NOPOS];

  beforeAll(async () => {
    a = await connect();
    b = await connect();
    c = await connect();
    await asService(db(a));
    await asService(db(b));
    const existing = await db(c)`select count(*) n from app_private.football_provider_mappings
      where provider_name = 'sportsmonks' and entity_type = 'season' and external_id = '28647'`;
    if (Number((existing as Row[])[0]!.n) !== 0)
      throw new Error("this database already has a SportsMonks season 28647: it is not disposable");
    const tick = await db(
      c,
    )`select lifecycle_tick_enabled t from app_private.fantasy_automation_settings`;
    tickWasOn = Boolean((tick as Row[])[0]?.t);
    await db(c)`select app_private.fantasy_automation_configure(false)`;
    await db(c).unsafe(seedSql());
    sourceId = await record(observation(everything));
  });
  afterAll(async () => {
    if (tickWasOn)
      await db(c)`select app_private.fantasy_automation_configure(true)`.catch(() => undefined);
    for (const connection of [a, b, c]) await connection?.end().catch(() => undefined);
  });

  // -- Before any repair ------------------------------------------------------
  it("the real import refuses the unplaced players, by the two refusals the importer reported", async () => {
    // Row order decides which comes first: the importer stops at the first.
    const membershipFirst = [...lineup([NEW1, NOPOS])];
    expect(await ingest(membershipFirst)).toContain("PLAYER_MEMBERSHIP_NOT_FOUND");
    const mappingFirst = [
      ...lineup([]).slice(0, 22),
      member(S_NEW, CLUB_A_EXT, "Rehearsal New Forward", "forward"),
      ...lineup([]).slice(22),
    ];
    expect(await ingest(mappingFirst)).toContain("PLAYER_MAPPING_NOT_FOUND");
  });
  it("the read-only resolver lists exactly the unplaced players, with their classes", async () => {
    const before = await counts();
    const script = withSetting(
      withSetting(RESOLVER, "identity_fixture", FIXTURE_EXT),
      "identity_observation",
      sourceId,
    );
    const rows = resultWith(await db(c).unsafe(script), "provider_player_id");
    const byId = Object.fromEntries(rows.map((r) => [r.provider_player_id, r.class]));
    expect(byId).toEqual({
      [ext(S_NOMEM)]: "MAPPED_NO_MEMBERSHIP_FOR_TEAM",
      [ext(S_HELD)]: "MAPPED_NO_MEMBERSHIP_FOR_TEAM",
      [ext(S_NEW)]: "NO_MAPPING",
      [ext(S_NOPOS)]: "NO_MAPPING",
    });
    expect(Number(rows[0].lineup_players)).toBe(everything.length);
    expect(await counts()).toEqual(before);
    // A fixture or lineup that is not found is an input problem, never "everyone resolved".
    const missing = resultWith(
      await db(c).unsafe(
        withSetting(
          withSetting(RESOLVER, "identity_fixture", "999999999"),
          "identity_observation",
          sourceId,
        ),
      ),
      "provider_player_id",
    );
    expect(missing[0].class).toBe("INPUT_PROBLEM");
  });

  // -- Refusals leave nothing behind -------------------------------------------
  describe("a wrong scope or an unexpected change fails safely", () => {
    const cases: Array<[string, () => Scope | Promise<Scope>, string]> = [
      [
        "a listed player is already placed",
        () => ({
          source: sourceId,
          players: [...unresolved, S_OK],
          ackHeld: [S_HELD],
          ackFantasy: true,
        }),
        "Listed but placed already",
      ],
      [
        "an unplaced player is not listed",
        () => ({
          source: sourceId,
          players: [S_NOMEM, S_HELD, S_NOPOS],
          ackHeld: [S_HELD],
          ackFantasy: true,
        }),
        "Unplaced but not listed",
      ],
      [
        "a fixture the observation did not cover",
        () => ({ source: sourceId, players: unresolved, fixtures: ["999999999"] }),
        "not in the observation",
      ],
      [
        "a Fantasy move of a held player without the explicit guard",
        () => ({ source: sourceId, players: unresolved, ackFantasy: true }),
        "that Fantasy teams hold",
      ],
      [
        "Fantasy catalog additions nobody accepted",
        () => ({ source: sourceId, players: unresolved, ackHeld: [S_HELD] }),
        "ADDS",
      ],
      [
        "a source observation older than 30 minutes",
        async () => ({
          source: await storeOld(observation(everything, new Date(Date.now() - 31 * 60_000)), 31),
          players: unresolved,
          ackHeld: [S_HELD],
          ackFantasy: true,
        }),
        "Observe again",
      ],
    ];
    for (const [name, scope, expected] of cases) {
      it(name, async () => {
        const scoped = await scope();
        const before = await counts();
        const guard = await protectedState();
        const { error } = await runRecorder(scoped);
        expect(error).toContain("stop:");
        expect(error).toContain(expected);
        expect(await counts()).toEqual(before);
        expect(await protectedState()).toBe(guard);
      });
    }
    it("the apply refuses an observation older than 24 hours", async () => {
      const old = await storeOld(
        observation(everything, new Date(Date.now() - 25 * 3_600_000)),
        25 * 60,
      );
      const digest = "0".repeat(64);
      expect(
        await message(
          async () =>
            await db(b)`select api.service_apply_current_player_list(${old}::uuid, ${digest})`,
        ),
      ).toContain("player_list_observation_stale");
    });
  });

  // -- The rehearsal ------------------------------------------------------------
  it("a rehearsal applies and verifies inside its transaction, and leaves no persistent change", async () => {
    const before = await counts();
    const guard = await protectedState();
    const { error } = await runRecorder({
      source: sourceId,
      players: unresolved,
      ackHeld: [S_HELD],
      ackFantasy: true,
    });
    const report = rehearsalReport(error);
    expect(report.listedPlayers).toBe(4);
    // The plan changes the three that can be placed; the one without a position is skipped.
    expect(report.summary.changes).toBe(3);
    expect(report.skipped.map((s) => s.externalPlayerId)).toEqual([ext(S_NOPOS)]);
    expect(report.listedPlayersWithNoPlanChange).toEqual([ext(S_NOPOS)]);
    // The stronger check: after the rehearsed apply, the import's own questions.
    expect(report.rehearsedApply.changes).toBe(3);
    expect(report.ineligibleAfterRehearsedApply).toEqual([ext(S_NOPOS)]);
    expect(report.heldFantasyMoves.map((m) => m.externalPlayerId)).toEqual([ext(S_HELD)]);
    expect(report.fantasyCatalogAdditions.map((m) => m.externalPlayerId).sort()).toEqual(
      [ext(S_NEW), ext(S_NOMEM)].sort(),
    );
    expect(await counts()).toEqual(before);
    expect(await protectedState()).toBe(guard);
  });
  it("without the rehearsed apply the report says only what the plan touches, and claims no eligibility", async () => {
    const { error } = await runRecorder({
      source: sourceId,
      players: unresolved,
      ackHeld: [S_HELD],
      ackFantasy: true,
      rehearseApply: false,
    });
    const report = rehearsalReport(error);
    expect(report.ineligibleAfterRehearsedApply).toBeNull();
    expect(report.rehearsedApply).toBeNull();
    expect(report.listedPlayersWithNoPlanChange).toEqual([ext(S_NOPOS)]);
    expect("stillUnplacedAfterApply" in report).toBe(false);
  });

  // -- The real record, then the apply -------------------------------------------
  it("the real run records exactly one scoped observation and changes nothing else", async () => {
    const before = await counts();
    const { error, rows } = await runRecorder({
      source: sourceId,
      players: unresolved,
      ackHeld: [S_HELD],
      ackFantasy: true,
      dryRun: false,
    });
    expect(error).toBe("");
    const result = resultWith(rows, "observation_id")[0];
    scopedId = String(result.observation_id);
    planDigest = String(result.plan_digest);
    expect(planDigest).toMatch(/^[0-9a-f]{64}$/);
    const after = await counts();
    expect(after).toEqual({ ...before, observations: before.observations + 1 });
    const scoped = await db(c)`select observations -> 'reviewScope' ->> 'sourceObservationId' s,
      jsonb_array_length(observations -> 'lineups' -> 0 -> 'players') n from app_private.current_player_list_observations where id = ${scopedId}`;
    expect((scoped as Row[])[0]!.s).toBe(sourceId);
    expect(Number((scoped as Row[])[0]!.n)).toBe(4);
  });
  it("the apply waits for a transfer holding the squads lock (and nothing is changed while it waits)", async () => {
    const before = await counts();
    await db(b)`begin`;
    await db(
      b,
    )`select pg_advisory_xact_lock_shared(hashtextextended(${"fantasy:squads:" + FANTASY_SEASON}, 0))`;
    const outcome = await message(
      async () =>
        await db(a)`select api.service_apply_current_player_list(${scopedId}::uuid, ${planDigest})`,
    );
    await db(b)`rollback`;
    await db(a)
      .unsafe("rollback")
      .catch(() => undefined);
    await asService(db(a));
    expect(outcome).toContain("lock timeout");
    expect(await counts()).toEqual(before);
  }, 30_000);
  it("two applies at once give one applied update and no duplicate player", async () => {
    const guard = await protectedState();
    const before = await counts();
    const results = await Promise.all([
      message(
        async () =>
          await patiently(
            async () =>
              await db(
                a,
              )`select api.service_apply_current_player_list(${scopedId}::uuid, ${planDigest})`,
          ),
      ),
      message(
        async () =>
          await patiently(
            async () =>
              await db(
                b,
              )`select api.service_apply_current_player_list(${scopedId}::uuid, ${planDigest})`,
          ),
      ),
    ]);
    expect(results.filter((r) => r === "")).toHaveLength(1);
    expect(
      results.filter((r) => r.includes("player_list_observation_already_applied")),
    ).toHaveLength(1);
    const after = await counts();
    expect(after.updates).toBe(before.updates + 1);
    expect(after.players).toBe(before.players + 1); // only the one the canonical list did not know
    expect(after.fantasy_players).toBe(before.fantasy_players + 2); // the new player and the member without a club: the existing apply adds them to the Fantasy catalog
    const same = await db(
      c,
    )`select count(*) n from app.players where full_name = 'Rehearsal New Forward'`;
    expect(Number((same as Row[])[0]!.n)).toBe(1);
    // Squads, prices, existing positions and the scoring snapshot are as they were; the moved player's price too.
    expect(await protectedState()).toBe(guard);
  }, 30_000);
  it("the repair left the required mapping and dated membership, and nothing else of the held player changed", async () => {
    const rows = (await db(c)`
      select p.full_name, p.position::text pos, p.date_of_birth::text dob, m.external_id,
        tm.valid_from::text vf, tm.valid_to::text vt, t.slug team, tm.active
      from app_private.football_provider_mappings m join app.players p on p.id = m.internal_entity_id
      join app.team_memberships tm on tm.player_id = p.id and tm.season_id = ${SEASON}
      join app.teams t on t.id = tm.team_id
      where m.provider_name = 'sportsmonks' and m.entity_type = 'player' and m.active
        and m.external_id in (${ext(S_NEW)}, ${ext(S_NOMEM)}, ${ext(S_HELD)})
      order by m.external_id`) as Row[];
    expect(rows).toHaveLength(3); // one club record each: no duplicate, the held player's old one removed
    const season = (await db(
      c,
    )`select starts_on::text s, ends_on::text e from app.seasons where id = ${SEASON}`) as Row[];
    for (const row of rows) {
      expect(row.vf).toBe(season[0].s);
      expect(row.vt).toBe(season[0].e);
      expect(row.team).toBe(`gw1-e2e-${BASE}-a`);
      expect(row.active).toBe(true);
    }
    expect(rows.find((r) => r.external_id === ext(S_NEW))).toMatchObject({
      full_name: "Rehearsal New Forward",
      pos: "forward",
      dob: "2000-01-01",
    });
    const held = (await db(c)`select fp.football_team_id::text team, fp.price::text price,
      (select count(*) from app.fantasy_squad_memberships s where s.fantasy_player_id = fp.id and s.sold_at is null) held
      from app.fantasy_players fp where fp.id = ${FANTASY_PLAYER_ID(S_HELD)}`) as Row[];
    expect(held[0]).toEqual({ team: CLUB_A, price: "6.50", held: expect.anything() });
    expect(Number(held[0].held)).toBe(1);
  });
  it("the import's own identity checks pass for everyone but the player with no position", async () => {
    const script = withSetting(
      withSetting(RESOLVER, "identity_fixture", FIXTURE_EXT),
      "identity_observation",
      sourceId,
    );
    const rows = resultWith(await db(c).unsafe(script), "provider_player_id");
    expect(rows.map((r) => [r.provider_player_id, r.class])).toEqual([
      [ext(S_NOPOS), "NO_MAPPING"],
    ]);
  });
  it("the real import still refuses the unmapped lineup member, and accepts the lineup without him", async () => {
    expect(await ingest(everything)).toContain("PLAYER_MAPPING_NOT_FOUND");
    const without = everything.filter((m) => m.externalPlayerId !== ext(S_NOPOS));
    expect(await ingest(without)).toBe("");
    const stored = await db(
      c,
    )`select count(*) n from app.player_fixture_performances where fixture_id = ${FIXTURE} and active`;
    expect(Number((stored as Row[])[0]!.n)).toBe(without.length);
  });

  // -- Retry, atomicity -----------------------------------------------------------
  it("retrying the apply or the record cannot duplicate players or corrupt memberships", async () => {
    const before = await counts();
    expect(
      await message(
        async () =>
          await db(
            b,
          )`select api.service_apply_current_player_list(${scopedId}::uuid, ${planDigest})`,
      ),
    ).toContain("player_list_observation_already_applied");
    const again = await runRecorder({
      source: sourceId,
      players: unresolved,
      ackHeld: [S_HELD],
      ackFantasy: true,
      dryRun: false,
    });
    expect(again.error).toContain("stop:"); // what is left unplaced no longer equals the list
    expect(await counts()).toEqual(before);
    const dup = await db(
      c,
    )`select count(*) n from (select player_id, team_id, season_id, valid_from from app.team_memberships
      where season_id = ${SEASON} group by 1, 2, 3, 4 having count(*) > 1) d`;
    expect(Number((dup as Row[])[0]!.n)).toBe(0);
  });
  it("a failure part-way through the apply rolls all of it back, and the apply can then be retried", async () => {
    const pair = [
      member(S2_NEW1, CLUB_A_EXT, "Rehearsal Second One", "defender"),
      member(S2_NEW2, CLUB_B_EXT, "Rehearsal Second Two", "forward"),
    ];
    const second = await record(
      observation([...everything.filter((m) => m.externalPlayerId !== ext(S_NOPOS)), ...pair]),
    );
    const recorded = await runRecorder({
      source: second,
      players: [S2_NEW1, S2_NEW2],
      ackFantasy: true,
      dryRun: false,
    });
    expect(recorded.error).toBe("");
    const row = (await db(
      c,
    )`select id::text id, app_private.current_player_list_plan(id) ->> 'digest' digest
      from app_private.current_player_list_observations where observations -> 'reviewScope' ->> 'sourceObservationId' = ${second}`) as Row[];
    const before = await counts();
    // The price history is written last of all: a failure there comes after the players, mappings and club records.
    await db(c)
      .unsafe(`create function public.gw1_e2e_fail() returns trigger language plpgsql as $f$ begin raise exception 'injected failure'; end $f$;
      create trigger gw1_e2e_inject before insert on app.fantasy_player_price_history for each row execute function public.gw1_e2e_fail()`);
    const failed = await message(
      async () =>
        await patiently(
          async () =>
            await db(
              b,
            )`select api.service_apply_current_player_list(${row[0].id}::uuid, ${row[0].digest})`,
        ),
    );
    await db(c).unsafe(
      `drop trigger gw1_e2e_inject on app.fantasy_player_price_history; drop function public.gw1_e2e_fail()`,
    );
    expect(failed).toContain("injected failure");
    expect(await counts()).toEqual(before);
    const ok = await message(
      async () =>
        await patiently(
          async () =>
            await db(
              b,
            )`select api.service_apply_current_player_list(${row[0].id}::uuid, ${row[0].digest})`,
        ),
    );
    expect(ok).toBe("");
    const after = await counts();
    expect(after.players).toBe(before.players + 2);
    expect(after.updates).toBe(before.updates + 1);
  }, 30_000);
});
