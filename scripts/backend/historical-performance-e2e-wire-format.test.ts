// BG-0011 option B: end-to-end wire-format test.
//
// Why this file exists: every other test for this task either (a) mocks the Supabase RPC client
// and asserts with `toMatchObject` (a subset match, so a MISSING key in the real payload never
// fails it), or (b) calls the real SQL RPCs directly with hand-built JSONB literals that a human
// wrote (always including every expected key). Neither ever proves that the ACTUAL object
// `normalizeHistoricalFixture` produces is accepted by the ACTUAL SQL RPCs when sent as-is. A real
// bug slipped through exactly that gap: the accept-path `coverage` object was missing
// `identifiedStarterRows` (only the quarantine path's diagnostic copy had it added), which would
// have made every single accepted historical fixture ingest call fail outright with
// INVALID_PROVIDER_PAYLOAD -- a total regression of this task's entire purpose. This file closes
// that gap by taking the REAL return value of the REAL `normalizeHistoricalFixture` and feeding it,
// completely unmodified, into the REAL `api.ingest_historical_player_fixture_performance` /
// `api.quarantine_historical_player_fixture_performance` RPCs running in a REAL local Postgres.
//
// There is no existing precedent in this repo for a bun:test file that talks to a running local
// Supabase/Postgres instance directly (every other *.test.ts either mocks its dependencies or is a
// pgTAP .test.sql file run via `supabase test db`). This file bridges TS application code and a
// live local Postgres itself, using Bun's built-in `Bun.SQL` client (no new dependency) pointed at
// the local stack's direct Postgres port (`supabase/config.toml`'s `[db] port`, 55322 by default).
// It requires `supabase db start` (or `db reset --local`) to already be running locally; if it
// cannot connect within a short timeout, every test in this file is skipped with a clear console
// message rather than failing the suite outright -- so this file is safe to leave in the repo for
// contributors without a local Supabase stack running, but it MUST actually run (not skip) as part
// of this task's own verification.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  HistoricalPerformanceRuntimeError,
  normalizeHistoricalFixture,
  type NormalizedHistoricalFixture,
} from "../../supabase/functions/_shared/sportsmonks-historical-player-performance";

const DB_URL =
  process.env.BG0011_E2E_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:55322/postgres";
const SEASON_ID = 26_027;
const CONNECT_TIMEOUT_MS = 3_000;

let sql: Bun.SQL | null = null;
let reachable = false;

beforeAll(async () => {
  const candidate = new Bun.SQL({ url: DB_URL });
  try {
    await Promise.race([
      candidate`select 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS),
      ),
    ]);
    sql = candidate;
    reachable = true;
  } catch (error) {
    reachable = false;
    console.warn(
      `[historical-performance-e2e-wire-format] Skipping: could not reach a local Postgres at ${DB_URL} ` +
        `within ${CONNECT_TIMEOUT_MS}ms (${(error as Error).message}). Run \`npx supabase db start\` ` +
        `(or \`db reset --local\`) first to exercise this file for real.`,
    );
    try {
      await candidate.end();
    } catch {
      // already unreachable; nothing to close
    }
  }
});

afterAll(async () => {
  if (sql && reachable) {
    // Clean up so re-running this file against the same local stack (e.g. iterating on this test
    // itself) is idempotent rather than colliding with the previous run's seed rows.
    try {
      await sql`delete from app.player_fixture_performances where fixture_id in (${IDS.acceptedFixture}, ${IDS.quarantinedFixture})`;
      await sql`delete from app_private.historical_performance_fixture_coverage where fixture_id in (${IDS.acceptedFixture}, ${IDS.quarantinedFixture})`;
      await sql`delete from app_private.football_provider_mappings where source_version like 'sportsmonks:e2e-wire-format-%'`;
      await sql`delete from app.team_memberships where season_id = ${IDS.season}`;
      await sql`delete from app.players where slug like 'e2e-wire-format-player-%'`;
      await sql`delete from app.fixtures where id in (${IDS.acceptedFixture}, ${IDS.quarantinedFixture})`;
      await sql`delete from app.teams where id in (${IDS.homeTeam}, ${IDS.awayTeam})`;
      await sql`delete from app.seasons where id = ${IDS.season}`;
      await sql`delete from app.competitions where id = ${IDS.competition}`;
      await sql`delete from app.countries where id = ${IDS.country}`;
    } catch (error) {
      console.warn(
        `[historical-performance-e2e-wire-format] Cleanup failed (non-fatal; run \`supabase db reset --local\` to fully reset): ${(error as Error).message}`,
      );
    }
  }
  if (sql) await sql.end();
});

/** One raw SportsMonks-shaped lineup row, matching what the real provider payload looks like. */
function lineupRow(
  fixtureId: number,
  index: number,
  options: { anonymous?: boolean; started: boolean; teamExternalId: number; minutes: number },
): Record<string, unknown> {
  return {
    id: fixtureId * 100 + index,
    fixture_id: fixtureId,
    player_id: options.anonymous ? null : fixtureId * 1_000 + index + 1,
    team_id: options.anonymous ? null : options.teamExternalId,
    type_id: options.started ? 11 : 12,
    details: [
      { type_id: 119, data: { value: options.minutes } },
      ...(options.anonymous ? [] : [{ type_id: 118, data: { value: 6.8 } }]),
    ],
  };
}

/**
 * Builds a realistic full SportsMonks fixture payload: exactly 22 raw starters (some possibly
 * anonymous) plus a bench, shaped exactly like the real provider response
 * `normalizeHistoricalFixture` parses (`{ data: { id, league_id, season_id, lineups } }`).
 */
function fixturePayload(fixtureId: number, anonymousStarters: number, benchCount: number) {
  const lineups: Record<string, unknown>[] = [];
  for (let index = 0; index < 22; index += 1) {
    const anonymous = index < anonymousStarters;
    lineups.push(
      lineupRow(fixtureId, index, {
        anonymous,
        started: true,
        teamExternalId: index < 11 ? 500 : 600,
        minutes: 90,
      }),
    );
  }
  for (let index = 0; index < benchCount; index += 1) {
    lineups.push(
      lineupRow(fixtureId, 22 + index, {
        started: false,
        teamExternalId: index < benchCount / 2 ? 500 : 600,
        minutes: 12,
      }),
    );
  }
  return { data: { id: fixtureId, league_id: 860, season_id: SEASON_ID, lineups } };
}

const ACCEPTED_FIXTURE_ID = 88_000_001;
const ACCEPTED_FIXTURE_ANONYMOUS_STARTERS = 3; // within the tolerated cap (0-4)
const ACCEPTED_FIXTURE_BENCH = 6;

const QUARANTINED_FIXTURE_ID = 88_000_002;
const QUARANTINED_FIXTURE_ANONYMOUS_STARTERS = 6; // over the tolerated cap of 4
const QUARANTINED_FIXTURE_BENCH = 6;

/** UUIDs for the seed rows this file creates, isolated from any other test's fixtures by prefix. */
const IDS = {
  country: "e2e00000-0000-4000-8000-0000000000c1",
  competition: "e2e00000-0000-4000-8000-0000000000c2",
  season: "e2e00000-0000-4000-8000-0000000000c3",
  homeTeam: "e2e00000-0000-4000-8000-0000000000c4",
  awayTeam: "e2e00000-0000-4000-8000-0000000000c5",
  acceptedFixture: "e2e00000-0000-4000-8000-0000000000c6",
  quarantinedFixture: "e2e00000-0000-4000-8000-0000000000c7",
} as const;

const ACCEPTED_FIXTURE_EXTERNAL_ID = "88100001";
const QUARANTINED_FIXTURE_EXTERNAL_ID = "88100002";
const SEASON_EXTERNAL_ID = "88200001";
const HOME_TEAM_EXTERNAL_ID = "88300001";
const AWAY_TEAM_EXTERNAL_ID = "88300002";

/** The number of identified players (starters + bench) the accepted fixture needs mapped. */
const ACCEPTED_IDENTIFIED_COUNT = 22 - ACCEPTED_FIXTURE_ANONYMOUS_STARTERS + ACCEPTED_FIXTURE_BENCH;

async function seed(db: Bun.SQL): Promise<void> {
  await db`insert into app.countries (id, iso_alpha2, iso_alpha3) values (${IDS.country}, 'MA', 'MAR')`;
  await db`insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
    values (${IDS.competition}, 'e2e-wire-format-league', 'E2E Wire Format League', 'E2EWF', 'league', ${IDS.country})`;
  await db`insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
    values (${IDS.season}, ${IDS.competition}, '2024/25', '2024-09-01', '2025-06-30', 'completed', false)`;
  await db`insert into app.teams (id, slug, name, short_name, code, country_id) values
    (${IDS.homeTeam}, 'e2e-wire-format-home', 'E2E Wire Format Home', 'E2EH', 'E2H', ${IDS.country}),
    (${IDS.awayTeam}, 'e2e-wire-format-away', 'E2E Wire Format Away', 'E2EA', 'E2A', ${IDS.country})`;
  await db`insert into app.fixtures (
      id, competition_id, season_id, home_team_id, away_team_id,
      kickoff_at, status, period, home_score, away_score,
      provider_updated_at, source_sequence, source_version, finalized_at
    ) values
    (${IDS.acceptedFixture}, ${IDS.competition}, ${IDS.season}, ${IDS.homeTeam}, ${IDS.awayTeam},
      '2025-01-10T18:00:00Z', 'finished', 'post_match', 2, 1,
      '2025-01-10T20:00:00Z', 1, 'sportsmonks:e2e-wire-format-accepted:v1', '2025-01-10T20:00:00Z'),
    (${IDS.quarantinedFixture}, ${IDS.competition}, ${IDS.season}, ${IDS.homeTeam}, ${IDS.awayTeam},
      '2025-01-17T18:00:00Z', 'finished', 'post_match', 0, 0,
      '2025-01-17T20:00:00Z', 1, 'sportsmonks:e2e-wire-format-quarantined:v1', '2025-01-17T20:00:00Z')`;
  await db`insert into app.players (id, slug, full_name, display_name, position)
    select md5('e2e-wire-format-player-' || n)::uuid, 'e2e-wire-format-player-' || n,
      'E2E Wire Format Player ' || n, 'EWF ' || n,
      case
        when n <= 2 then 'goalkeeper'::app.football_position
        when n <= 10 then 'defender'::app.football_position
        when n <= 18 then 'midfielder'::app.football_position
        else 'forward'::app.football_position
      end
    from generate_series(1, ${ACCEPTED_IDENTIFIED_COUNT}) n`;
  await db`insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, valid_to, active)
    select md5('e2e-wire-format-player-' || n)::uuid,
      case when n <= 11 then ${IDS.homeTeam}::uuid else ${IDS.awayTeam}::uuid end,
      ${IDS.season}, n, '2024-09-01', '2025-06-30', true
    from generate_series(1, ${ACCEPTED_IDENTIFIED_COUNT}) n`;
  await db`insert into app_private.football_provider_mappings
      (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active)
    values
      ('sportsmonks', 'season', ${SEASON_EXTERNAL_ID}, ${IDS.season}, 'sportsmonks:e2e-wire-format-season:v1', statement_timestamp(), true),
      ('sportsmonks', 'team', ${HOME_TEAM_EXTERNAL_ID}, ${IDS.homeTeam}, 'sportsmonks:e2e-wire-format-home:v1', statement_timestamp(), true),
      ('sportsmonks', 'team', ${AWAY_TEAM_EXTERNAL_ID}, ${IDS.awayTeam}, 'sportsmonks:e2e-wire-format-away:v1', statement_timestamp(), true),
      ('sportsmonks', 'fixture', ${ACCEPTED_FIXTURE_EXTERNAL_ID}, ${IDS.acceptedFixture}, 'sportsmonks:e2e-wire-format-accepted-fixture:v1', statement_timestamp(), true),
      ('sportsmonks', 'fixture', ${QUARANTINED_FIXTURE_EXTERNAL_ID}, ${IDS.quarantinedFixture}, 'sportsmonks:e2e-wire-format-quarantined-fixture:v1', statement_timestamp(), true)`;
  // The provider player ids used by the accepted fixture's payload are
  // ACCEPTED_FIXTURE_ID*1000 + index + 1 for index 0..(ACCEPTED_IDENTIFIED_COUNT-1) (see lineupRow
  // above, applied to the non-anonymous rows only -- but since normalizeHistoricalFixture strips
  // anonymous rows before we ever see them, we only need mappings for the identified ones, which
  // for this synthetic payload are indices ACCEPTED_FIXTURE_ANONYMOUS_STARTERS..21 (starters) and
  // 22..22+bench-1 (bench). We map every possible index 0..ACCEPTED_IDENTIFIED_COUNT+3 generously
  // to the same pool of players by external id, so exact index arithmetic doesn't have to match
  // player numbering 1:1 -- what matters is that every identified externalPlayerId the real
  // payload produces resolves to a mapped player.
  await db`insert into app_private.football_provider_mappings
      (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active)
    select 'sportsmonks', 'player', (${ACCEPTED_FIXTURE_ID}::bigint * 1000 + n)::text,
      md5('e2e-wire-format-player-' || n)::uuid,
      'sportsmonks:e2e-wire-format-player-' || n || ':v1', statement_timestamp(), true
    from generate_series(1, ${ACCEPTED_IDENTIFIED_COUNT}) n`;
}

describe("BG-0011 option B: end-to-end TS -> real Postgres wire-format", () => {
  it("the ACCEPT path's real normalizeHistoricalFixture output is accepted, unmodified, by the real ingest RPC", async () => {
    if (!reachable || !sql) {
      console.warn(
        "[historical-performance-e2e-wire-format] SKIPPED (no local Postgres reachable).",
      );
      return;
    }
    const db = sql;
    await seed(db);

    // The player id numbering in fixturePayload/lineupRow is ACCEPTED_FIXTURE_ID*1000+index+1;
    // remap external player ids in the payload to the small mapped pool (1..22) by their position
    // among identified rows, so every identified row this produces has a mapping.
    const rawPayload = fixturePayload(
      ACCEPTED_FIXTURE_ID,
      ACCEPTED_FIXTURE_ANONYMOUS_STARTERS,
      ACCEPTED_FIXTURE_BENCH,
    );
    const lineups = (rawPayload.data as { lineups: Record<string, unknown>[] }).lineups;
    let identifiedSeen = 0;
    for (const row of lineups) {
      if (row.player_id === null) continue;
      identifiedSeen += 1;
      row.player_id = ACCEPTED_FIXTURE_ID * 1_000 + identifiedSeen;
    }

    // This is the REAL function under test, called for real, with no mocking.
    const normalized: NormalizedHistoricalFixture = await normalizeHistoricalFixture(
      rawPayload,
      ACCEPTED_FIXTURE_ID,
      SEASON_ID,
    );
    expect(normalized.coverage.anonymousStarterRows).toBe(ACCEPTED_FIXTURE_ANONYMOUS_STARTERS);
    // The exact bug this file exists to catch: assert the REAL coverage object actually carries
    // identifiedStarterRows before it is ever sent anywhere. If this line is removed and the bug
    // reappears, this assertion (not just the RPC call below) already fails.
    expect((normalized.coverage as Record<string, unknown>).identifiedStarterRows).toBe(
      22 - ACCEPTED_FIXTURE_ANONYMOUS_STARTERS,
    );

    const rows = normalized.rows.map((row) => ({ ...row }));
    for (const row of rows) {
      row.externalTeamId =
        row.externalTeamId === "500" ? HOME_TEAM_EXTERNAL_ID : AWAY_TEAM_EXTERNAL_ID;
    }

    // The decisive call: the REAL RPC, given the REAL (unmodified except for the team-id remap
    // above, which stands in for provider->BotolaGO team mapping) coverage/rows objects that
    // normalizeHistoricalFixture actually produced.
    const result = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.role', 'service_role', true)`;
      return tx`select api.ingest_historical_player_fixture_performance(
        'sportsmonks', ${SEASON_EXTERNAL_ID}, ${ACCEPTED_FIXTURE_EXTERNAL_ID},
        ${normalized.sourceVersion}, ${rows}::jsonb, ${normalized.coverage}::jsonb,
        statement_timestamp()
      ) as result`;
    });

    expect(result[0].result).toMatchObject({
      active: rows.length,
      anonymousStarterRows: ACCEPTED_FIXTURE_ANONYMOUS_STARTERS,
      identifiedStarterRows: 22 - ACCEPTED_FIXTURE_ANONYMOUS_STARTERS,
      reconciled: true,
    });
  });

  it("the QUARANTINE path's real diagnostic coverage is accepted, unmodified, by the real quarantine RPC", async () => {
    if (!reachable || !sql) {
      console.warn(
        "[historical-performance-e2e-wire-format] SKIPPED (no local Postgres reachable).",
      );
      return;
    }
    const db = sql;
    // seed() is idempotent-enough per fixture id used here (quarantine never touches app.players
    // beyond what accept already seeded); re-running it would violate unique constraints if the
    // accept test already ran in this same process, so only seed if it hasn't been.
    const existing = await db`select 1 from app.fixtures where id = ${IDS.quarantinedFixture}`;
    if (existing.length === 0) await seed(db);

    const rawPayload = fixturePayload(
      QUARANTINED_FIXTURE_ID,
      QUARANTINED_FIXTURE_ANONYMOUS_STARTERS,
      QUARANTINED_FIXTURE_BENCH,
    );

    let thrown: HistoricalPerformanceRuntimeError | undefined;
    try {
      await normalizeHistoricalFixture(rawPayload, QUARANTINED_FIXTURE_ID, SEASON_ID);
    } catch (error) {
      thrown = error as HistoricalPerformanceRuntimeError;
    }
    expect(thrown).toBeInstanceOf(HistoricalPerformanceRuntimeError);
    expect(thrown!.code).toBe("historical_fixture_anonymous_starters_exceeded");
    const diagnostic = thrown!.diagnostic as {
      sourceVersion: string;
      coverage: Record<string, unknown>;
    };
    expect(diagnostic.coverage.identifiedStarterRows).toBe(
      22 - QUARANTINED_FIXTURE_ANONYMOUS_STARTERS,
    );

    const result = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.role', 'service_role', true)`;
      return tx`select api.quarantine_historical_player_fixture_performance(
        'sportsmonks', ${SEASON_EXTERNAL_ID}, ${QUARANTINED_FIXTURE_EXTERNAL_ID},
        ${diagnostic.sourceVersion}, ${diagnostic.coverage}::jsonb, statement_timestamp()
      ) as result`;
    });

    expect(result[0].result).toMatchObject({
      coverageOutcome: "quarantined",
      quarantineReason: "anonymous_starter_rows_exceeded",
      anonymousStarterRows: QUARANTINED_FIXTURE_ANONYMOUS_STARTERS,
      identifiedStarterRows: 22 - QUARANTINED_FIXTURE_ANONYMOUS_STARTERS,
    });
  });
});
