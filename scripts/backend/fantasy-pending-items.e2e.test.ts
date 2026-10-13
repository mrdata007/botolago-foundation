/**
 * End-to-end contract test for Fantasy pending items (docs/backend/FANTASY_PENDING_ITEMS.md).
 *
 * A real SofaScore match (fixture 17132481, tests/fixtures/providers/sofascore) with ONE synthetic
 * change: the away goal is moved to the minute of a home double substitution, which the builder
 * must turn into four players with unknown goals conceded / clean sheet and nothing else. Then,
 * through the real code and the real local database:
 *
 *   builder (prepareSofascoreObservation)  ->  api.service_record_sofascore_fantasy_observation
 *   -> runFantasyLifecycle (the real runner: snapshot, calculateSnapshotResults, persist)
 *   -> api.get_my_fantasy_points / api.service_begin_fantasy_finalization
 *
 * It talks ONLY to a local database: it refuses any URL whose host is not 127.0.0.1. Everything
 * runs inside one transaction that is rolled back, so the database is left as it was.
 *
 * Run (the local Supabase must be started, `bun run backend:db:start`):
 *   FANTASY_PENDING_E2E=1 FANTASY_PENDING_E2E_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     bun test scripts/backend/fantasy-pending-items.e2e.test.ts
 * Without FANTASY_PENDING_E2E=1 the test is skipped (it needs a database).
 */
import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { providerFixture } from "../../src/backend/football/provider/performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "../../src/backend/football/provider/sofascore-adapter";
import { buildReviewedIdentitySnapshot } from "../../src/backend/fantasy/reviewed-identities";
import {
  prepareSofascoreObservation,
  type SofascoreMatchData,
} from "../../src/backend/fantasy/sofascore-fantasy";
import { runFantasyLifecycle, type FantasyWorkerGateway } from "./fantasy-lifecycle-runner";

const enabled = process.env.FANTASY_PENDING_E2E === "1";
const dbUrl = process.env.FANTASY_PENDING_E2E_DB_URL ?? "";

/** Only the local development database is acceptable. */
export function assertLocalDatabase(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("e2e_requires_local_database");
  }
  if (host !== "127.0.0.1") throw new Error("e2e_requires_local_database");
}

const EVENT = "17132481";
const OBSERVED = "2026-10-13T12:00:00.000Z";
const id = (prefix: string, n: number) =>
  `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const POSITION = { G: "goalkeeper", D: "defender", M: "midfielder", F: "forward" } as const;

function loadMatch(): SofascoreMatchData {
  const f = (name: string) => providerFixture("sofascore", `${EVENT}.${name}`);
  return {
    summary: parseSofascoreDetail(f("detail")),
    lineups: parseSofascoreLineups(f("lineups")),
    incidents: parseSofascoreIncidents(f("incidents")),
    statistics: parseSofascoreStatistics(f("statistics")),
  };
}

/** The same match with the away goal on the minute of the home double substitution (77). */
function withSameMomentGoal(match: SofascoreMatchData): SofascoreMatchData {
  const awayGoal = match.incidents.find((i) => i.kind === "goal" && i.side === "away")!;
  return {
    ...match,
    incidents: match.incidents.map((i) => (i === awayGoal ? { ...i, minute: 77 } : i)),
  };
}

// The four home players changed at 77: 919329 and 1096751 off (60 or more minutes, so their clean
// sheet and goals conceded are in doubt), 1140935 and 1140961 on (13 minutes: under 60 in every
// version, so only goals conceded is unknown and it cannot matter).
const TAKEN_OFF = ["919329", "1096751"];
// Team A: starters (one goalkeeper, 4 defenders, 4 midfielders, 2 forwards) then the bench.
const TEAM_A = [
  "1140820",
  "1004523",
  "1004426",
  "970766",
  "1103558",
  "919329",
  "1545316",
  "544156",
  "1096751",
  "895127",
  "1939981",
  "1845576",
  "1182110",
  "1140935",
  "2776312",
];
const CAPTAIN = "895127";
const VICE = "1545316";

class Rollback extends Error {}

describe.skipIf(!enabled)("Fantasy pending items, end to end (local database only)", () => {
  test("a same-moment goal leaves four players' goals conceded pending; everything else is published", async () => {
    assertLocalDatabase(dbUrl);
    const sql = new SQL(dbUrl, { max: 1 });
    const match = loadMatch();
    const lineup = match.lineups.players;
    let proved = false;
    try {
      await sql.begin(async (tx: any) => {
        const run = (text: string, params: unknown[] = []) =>
          tx.unsafe(text, params) as Promise<any[]>;
        const asService = () =>
          run(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        await run(`select set_config('app.environment', 'test', true)`);
        await asService();

        // ---- the world: a finished match, its players, a Fantasy season with two squads ----
        const [country] = await run(`select id from app.countries where iso_alpha2 = 'MA'`);
        const countryId = country?.id ?? id("c0", 1);
        if (!country)
          await run(
            `insert into app.countries (id, iso_alpha2, iso_alpha3) values ($1, 'MA', 'MAR')`,
            [countryId],
          );
        const S = {
          comp: id("c0", 2),
          season: id("c0", 3),
          round: id("c0", 7),
          home: id("c1", 1),
          away: id("c1", 2),
          fixture: id("f0", 1),
          fcomp: id("c0", 4),
          fseason: id("c0", 5),
          gw: id("c0", 6),
        };
        await run(
          `insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
          values ($1, 'pending-e2e', 'Pending E2E', 'PE', 'league', $2)`,
          [S.comp, countryId],
        );
        await run(
          `insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
          values ($1, $2, '2026/2027', '2026-08-01', '2027-06-30', 'active', false)`,
          [S.season, S.comp],
        );
        await run(
          `insert into app.rounds (id, season_id, round_number, name, status) values ($1, $2, 1, 'Round 1', 'completed')`,
          [S.round, S.season],
        );
        await run(
          `insert into app.teams (id, slug, name, short_name, code, country_id) values
          ($1, 'pe-home', $3, 'PEH', 'PEH', $5), ($2, 'pe-away', $4, 'PEA', 'PEA', $5)`,
          [S.home, S.away, match.summary.homeName, match.summary.awayName, countryId],
        );
        const playerId = (externalId: string) => id("a1", Number(externalId));
        for (const p of lineup) {
          const position = POSITION[(p.position ?? "F") as keyof typeof POSITION];
          await run(
            `insert into app.players (id, slug, full_name, display_name, position)
            values ($1, $2, $3, $3, $4::app.football_position)`,
            [playerId(p.externalId), `pe-${p.externalId}`, p.name, position],
          );
          await run(
            `insert into app.team_memberships (player_id, team_id, season_id, valid_from, shirt_number)
            values ($1, $2, $3, '2026-08-01', $4)`,
            [playerId(p.externalId), p.side === "home" ? S.home : S.away, S.season, p.shirtNumber],
          );
        }
        await run(
          `insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
          home_score, away_score, provider_updated_at, source_sequence, finalized_at)
          values ($1, $2, $3, $4, $5, $6, '2026-09-27 18:00Z', 'finished', $7, $8, '2026-09-27 20:00Z', 10, '2026-09-27 20:00Z')`,
          [
            S.fixture,
            S.comp,
            S.season,
            S.round,
            S.home,
            S.away,
            match.summary.homeScore,
            match.summary.awayScore,
          ],
        );
        await run(
          `insert into app.fantasy_competitions (id, football_competition_id, slug, name, active) values ($1, $2, 'pe', 'Pending E2E', true)`,
          [S.fcomp, S.comp],
        );
        await run(
          `insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
          values ($1, $2, $3, 'f6100000-0000-4000-8000-000000000100', '2026/2027', 'active', '2026-08-01', '2027-06-30')`,
          [S.fseason, S.fcomp, S.season],
        );
        await run(
          `insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
          values ($1, $2, $3, 1, 'GW1', '2026-09-27 16:00Z', '2026-09-27 17:00Z', '2026-09-29 12:00Z', 'provisional')`,
          [S.gw, S.fseason, S.round],
        );
        await run(
          `insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
          original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
          values ($1, $2, $3, $3, '2026-09-27 18:00Z', '2026-09-27 18:00Z', '2026-09-27 16:00Z', 1)`,
          [S.fseason, S.fixture, S.gw],
        );
        for (const p of lineup) {
          await run(
            `insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
            select $1, $2, $3, $4, pos.id, 6 from app.fantasy_positions pos
            where pos.code = case $5 when 'G' then 'GK' when 'D' then 'DEF' when 'M' then 'MID' else 'FWD' end`,
            [
              id("fa", Number(p.externalId)),
              S.fseason,
              playerId(p.externalId),
              p.side === "home" ? S.home : S.away,
              p.position ?? "F",
            ],
          );
        }
        // Reviewed identities, by the automatic exact-name proof the database accepts.
        for (const p of lineup) {
          const mappingId = id("b0", Number(p.externalId));
          const logId = id("b1", Number(p.externalId));
          await run(
            `insert into app_private.football_provider_mappings (id, provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
            values ($1, 'sofascore', 'player', $2, $3, $4, now())`,
            [
              mappingId,
              p.externalId,
              playerId(p.externalId),
              `sofascore-auto-map:exact-name:${logId}`,
            ],
          );
          await run(
            `insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id, player_id)
            values ($1, 'exact-name', $2, $3, $4)`,
            [logId, mappingId, p.externalId, playerId(p.externalId)],
          );
        }
        await run(
          `insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
          values ('sofascore', 'fixture', $1, $2, 'test', now())`,
          [EVENT, S.fixture],
        );
        // Two owners with a signed-in, verified session.
        for (const n of [1, 2]) {
          await run(
            `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'hash', now(), '{}', $3::text::jsonb, now(), now())`,
            [id("e1", n), `pe-${n}@example.test`, JSON.stringify({ username: `pe_${n}` })],
          );
          await run(
            `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
            values ($1, $2, 'TOTP', 'totp', 'verified', now(), now())`,
            [id("e3", n), id("e1", n)],
          );
          await run(`insert into auth.sessions (id, user_id, created_at) values ($1, $2, now())`, [
            id("e2", n),
            id("e1", n),
          ]);
        }
        // Team B holds none of the four players changed at 77.
        const teamB = [
          "1140820",
          "1004523",
          "1004426",
          "970766",
          "1103558",
          "1545316",
          "544156",
          "2150417",
          "1919299",
          "895127",
          "1939981",
          "1845576",
          "1182110",
          "2161842",
          "2776312",
        ];
        for (const [n, squad] of [
          [1, TEAM_A],
          [2, teamB],
        ] as const) {
          await run(
            `insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers)
            values ($1, $2, $3, $4, $5, 10, 90, 1)`,
            [id("b2", n), id("e1", n), S.fseason, S.gw, `Team ${n}`],
          );
          await run(
            `insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
            values ($1, $2, $3, 1, '2026-09-27 16:00Z')`,
            [id("b3", n), id("b2", n), S.gw],
          );
          for (const [ord, ext] of squad.entries())
            await run(
              `insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
              values ($1, $2, $3::app.fantasy_lineup_slot, $4, $5, $6, 6)`,
              [
                id("b3", n),
                id("fa", Number(ext)),
                ord < 11 ? "starter" : "bench",
                ord < 11 ? ord + 1 : ord - 10,
                ext === CAPTAIN,
                ext === VICE,
              ],
            );
        }
        const [audit] = await run(
          `select api.service_adaptive_scoring_audit($1)->>'activationDigest' as digest`,
          [S.gw],
        );
        await run(`select api.service_activate_adaptive_scoring($1, 1, $2)`, [
          S.fseason,
          audit.digest,
        ]);
        await run(
          `insert into app_private.fantasy_live_scoring_policy (season_id, enabled) values ($1, true)`,
          [S.fseason],
        );

        // ---- the real builder -> the real wrapper ----------------------------------------
        const mappingRows =
          await run(`select m.id, m.external_id, m.internal_entity_id, m.active, m.source_version, m.updated_at,
          (app_private.football_mapping_supporting_state(m.id)->>'reviewed')::boolean as reviewed
          from app_private.football_provider_mappings m where m.provider_name = 'sofascore' and m.entity_type = 'player'`);
        expect(mappingRows.every((m) => m.reviewed === true)).toBe(true);
        const snapshot = await buildReviewedIdentitySnapshot(
          mappingRows.map((m) => ({
            mappingId: m.id,
            provider: "sofascore" as const,
            externalId: m.external_id,
            appPlayerId: m.internal_entity_id,
            active: m.active,
            reviewed: m.reviewed,
            version: m.source_version,
            updatedAt: new Date(m.updated_at).toISOString(),
          })),
          OBSERVED,
        );
        const binding = { appFixtureId: S.fixture, homeTeamId: S.home, awayTeamId: S.away };

        const pending = await prepareSofascoreObservation({
          observedAt: OBSERVED,
          match: withSameMomentGoal(match),
          snapshot,
          binding,
        });
        expect(pending.blockers).toEqual([]);
        expect(pending.request).not.toBeNull();
        expect(pending.unknownFields).toEqual({ cleanSheet: 2, goalsConceded: 4 });
        expect(pending.expectedMode).toBe("simple");

        const [recorded] = await run(
          `select api.service_record_sofascore_fantasy_observation($1, $2::text::jsonb, false) as r`,
          [S.fixture, JSON.stringify(pending.request)],
        );
        expect(recorded.r.created).toBe(true);
        expect(recorded.r.simpleReady).toBe(true);
        expect(recorded.r.fullReady).toBe(false);
        expect(recorded.r.pendingItems).toBe(6);

        // ---- the real runner: snapshot, scorer, persist -----------------------------------
        const callLog: string[] = [];
        const argType = (name: string, value: unknown): string => {
          if (name === "p_calculation_version" || name === "p_expected_lock_version")
            return "bigint";
          if (name === "p_batch_size" || name === "p_limit") return "integer";
          if (name === "p_input_digest") return "text";
          if (name.endsWith("_id")) return "uuid";
          return typeof value === "object" && value !== null ? "jsonb" : "text";
        };
        const gateway: FantasyWorkerGateway = {
          async rpc(name, args) {
            callLog.push(name);
            const keys = Object.keys(args);
            const text = `select api.${name}(${keys.map((k, i) => `${k} => $${i + 1}::${argType(k, args[k]) === "jsonb" ? "text::jsonb" : argType(k, args[k])}`).join(", ")}) as r`;
            const params = keys.map((k) =>
              argType(k, args[k]) === "jsonb" ? JSON.stringify(args[k]) : args[k],
            );
            const rows = await run(text, params);
            return rows[0]?.r;
          },
        };
        const outcome = (await runFantasyLifecycle(gateway, {
          gameweekId: S.gw,
          calculationVersion: 1,
        })) as any;
        expect(outcome.outcome).toBe("points_published");
        expect(outcome.reason).toBe("pending_items");
        expect(callLog).toContain("service_persist_fantasy_scoring_results");
        expect(callLog).not.toContain("service_begin_fantasy_finalization");

        // The pending categories: only goals conceded (and the clean sheet of the two taken off).
        const snap = (
          await run(`select api.service_get_fantasy_scoring_snapshot($1, $2, null, 100) as s`, [
            S.gw,
            outcome.calculationVersion,
          ])
        )[0].s;
        const pendingRows = snap.playerFixtures.filter(
          (p: any) => (p.pendingCategories ?? []).length > 0,
        );
        expect(pendingRows.map((p: any) => String(p.playerId)).sort()).toEqual(
          TAKEN_OFF.map(playerId).sort(),
        );
        for (const p of pendingRows)
          expect(p.pendingCategories).toEqual(["clean_sheet", "goals_conceded"]);
        expect(snap.pendingPlayerIds).toEqual([]);

        // Everything else is published.
        const events = await run(
          `select fantasy_player_id, category, points from app.fantasy_player_point_events
          where gameweek_id = $1 and superseded_at is null`,
          [S.gw],
        );
        const cats = (ext: string) =>
          events
            .filter((e) => e.fantasy_player_id === id("fa", Number(ext)))
            .map((e) => e.category);
        expect(cats("919329")).toContain("appearance");
        expect(cats("919329")).not.toContain("goals_conceded");
        expect(cats("919329")).not.toContain("clean_sheet");
        // On at 77: under 60 minutes in every version, so nothing is pending and both score (as 0).
        expect(cats("1140935")).toEqual(expect.arrayContaining(["clean_sheet", "goals_conceded"]));
        expect(cats("1545316")).toEqual(
          expect.arrayContaining(["appearance", "clean_sheet", "goals_conceded"]),
        );
        const [team] = await run(
          `select provisional_score from app.fantasy_team_gameweek_results where fantasy_team_id = $1 and gameweek_id = $2`,
          [id("b2", 1), S.gw],
        );
        expect(team.provisional_score).not.toBeNull();

        // ---- the read contract --------------------------------------------------------------
        await run(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({
            sub: id("e1", 1),
            role: "authenticated",
            aal: "aal2",
            session_id: id("e2", 1),
          }),
        ]);
        const [mine] = await run(`select api.get_my_fantasy_points($1, $2) as r`, [
          id("b2", 1),
          S.gw,
        ]);
        const player = (ext: string) =>
          mine.r.players.find((p: any) => p.fantasyPlayerId === id("fa", Number(ext)));
        expect(player("919329").pendingItems.map((i: any) => i.category)).toEqual([
          "clean_sheet",
          "goals_conceded",
        ]);
        expect(player("919329").pendingItems[0]).toMatchObject({
          fixtureId: S.fixture,
          reason: "timeline_same_moment",
        });
        expect(player("919329").pointsStatus).toBe("provisional");
        expect(player("1140935").pendingItems).toEqual([]);
        expect(player("1545316").pendingItems).toEqual([]);
        expect(mine.r.result.pendingItemCount).toBe(2 + 2); // 919329 and 1096751, two each
        await asService();

        // ---- finalization is refused while it is pending ------------------------------------
        await run(`savepoint before_finalization`);
        let refusal = "";
        try {
          await run(`select api.service_begin_fantasy_finalization($1, $2, $3)`, [
            S.gw,
            outcome.calculationVersion,
            snap.inputDigest,
          ]);
        } catch (error) {
          refusal = (error as Error).message;
        }
        await run(`rollback to savepoint before_finalization`);
        expect(refusal).toContain("fantasy_pending_items_unresolved");

        // ---- the doubt is resolved: the same match, the goal at its real minute ------------------
        const resolved = await prepareSofascoreObservation({
          observedAt: OBSERVED,
          match,
          snapshot,
          binding,
        });
        expect(resolved.unknownFields).toEqual({});
        const [again] = await run(
          `select api.service_record_sofascore_fantasy_observation($1, $2::text::jsonb, false) as r`,
          [S.fixture, JSON.stringify(resolved.request)],
        );
        expect(again.r.created).toBe(true);
        expect(again.r.pendingItems).toBe(0);
        const before = await run(
          `select fantasy_player_id, provisional_points from app.fantasy_player_gameweek_points where gameweek_id = $1`,
          [S.gw],
        );
        const second = (await runFantasyLifecycle(gateway, {
          gameweekId: S.gw,
          calculationVersion: 1,
        })) as any;
        expect(second.outcome).toBe("finalized");
        const after = await run(
          `select fantasy_player_id, provisional_points, final_points from app.fantasy_player_gameweek_points where gameweek_id = $1`,
          [S.gw],
        );
        const pointsOf = (rows: any[], ext: string) =>
          rows.find((r) => r.fantasy_player_id === id("fa", Number(ext)));
        // 919329 was taken off at 77 with the goal after 77 under the original clock: no longer in doubt.
        expect(pointsOf(after, "919329").final_points).not.toBeNull();
        expect(pointsOf(before, "1545316").provisional_points).toBe(
          pointsOf(after, "1545316").provisional_points,
        );
        expect(
          (
            await run(
              `select count(*)::int as n from app_private.fantasy_player_gameweek_pending where gameweek_id = $1`,
              [S.gw],
            )
          )[0].n,
        ).toBe(0);
        proved = true;
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    } finally {
      await sql.close();
    }
    expect(proved).toBe(true);
  }, 120000);
});

describe("local database guard", () => {
  test("only 127.0.0.1 is accepted", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:x@127.0.0.1:54322/postgres"),
    ).not.toThrow();
    for (const url of [
      "postgresql://postgres:x@db.tkewgajrljbwgwedqsxn.supabase.co:5432/postgres",
      "postgresql://postgres:x@localhost:54322/postgres",
      "postgresql://postgres:x@10.0.0.1:5432/postgres",
      "not a url",
      "",
    ])
      expect(() => assertLocalDatabase(url)).toThrow("e2e_requires_local_database");
  });
});
