// Live scores and match details, end to end: provider -> ingestion ->
// database -> RPC -> screen.
//
// Every other live-refresh test mocks one side: the Edge Function tests mock
// the database, the pgTAP suites hand-write the rows. This file takes a
// SportsMonks-shaped reply, runs it through the REAL Edge Function handler
// (`handleFootballLiveRefreshRequest`, scheduler-token check included), lets
// that handler write through the REAL ingestion RPCs of a local Postgres, then
// reads the match back through the same public RPCs the site calls, parses
// it with the site's own contract and maps it with the site's own `toMatch`.
//
// Like historical-performance-e2e-wire-format.test.ts it needs the local stack
// (`supabase db start` or `db reset --local`) and skips with a message when it
// cannot reach it. Everything runs in one transaction that is rolled back, so
// it leaves nothing behind, even when it fails.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  lineupSchema,
  matchCardSchema,
  matchStatisticSchema,
  timelineItemSchema,
} from "../../src/backend/football/contracts";
import { toMatch } from "../../src/services/football";
import {
  handleFootballLiveRefreshRequest,
  type LiveRefreshRpcClient,
} from "../../supabase/functions/_shared/football-live-refresh";

const DB_URL =
  process.env.LIVE_REFRESH_E2E_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:55322/postgres";
const CONNECT_TIMEOUT_MS = 3_000;

const IDS = {
  country: "f6000000-0000-4000-8000-000000000001",
  competition: "f6100000-0000-4000-8000-000000000001",
  season: "f6200000-0000-4000-8000-000000000001",
  home: "f6400000-0000-4000-8000-000000000001",
  away: "f6400000-0000-4000-8000-000000000002",
  homeStriker: "f6600000-0000-4000-8000-000000000001",
  homeWinger: "f6600000-0000-4000-8000-000000000002",
  awayStriker: "f6600000-0000-4000-8000-000000000003",
  awayMaker: "f6600000-0000-4000-8000-000000000004",
} as const;
// SportsMonks ids: Botola Pro and its 2026/27 season (the handler's defaults),
// and two club ids no real mapping uses.
const PROVIDER = {
  league: 860,
  season: 28647,
  fixture: 990_000_001,
  home: 990_001,
  away: 990_002,
  homeStriker: 990_101,
  homeWinger: 990_102,
  awayStriker: 990_201,
  awayMaker: 990_202,
};

let sql: Bun.SQL | null = null;

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
  } catch (error) {
    console.warn(
      `[football-live-refresh-e2e] Skipping: no local Postgres at ${DB_URL} (${(error as Error).message}). ` +
        "Run `supabase db start` (or `db reset --local`) to exercise this file.",
    );
    await candidate.end().catch(() => undefined);
  }
});

afterAll(async () => {
  await sql?.end();
});

function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

type Tx = Parameters<Parameters<Bun.SQL["begin"]>[0]>[0];

/**
 * The handler's `client.schema("api").rpc(...)`, over one transaction. Each
 * call runs alone inside a savepoint, so an expected refusal (the first
 * look-up of a new fixture raises MAPPING_NOT_FOUND) does not abort the rest.
 */
function rpcClient(tx: Tx): LiveRefreshRpcClient {
  let queue: Promise<unknown> = Promise.resolve();
  const call = async (name: string, args: Record<string, unknown>) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected rpc name ${name}`);
    const named = Object.entries(args)
      .map(([key, value]) => `${key} => ${literal(value)}`)
      .join(", ");
    await tx.unsafe("savepoint live_rpc");
    try {
      const rows = (await tx.unsafe(`select api.${name}(${named}) as result`)) as Array<{
        result: unknown;
      }>;
      await tx.unsafe("release savepoint live_rpc");
      return { data: rows[0]?.result ?? null, error: null };
    } catch (error) {
      await tx.unsafe("rollback to savepoint live_rpc");
      const failure = error as { message?: string; errno?: string };
      return { data: null, error: { message: failure.message, code: failure.errno } };
    }
  };
  return {
    schema: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        const next = queue.then(() => call(name, args));
        queue = next.catch(() => undefined);
        return next;
      },
    }),
  } as unknown as LiveRefreshRpcClient;
}

/** One SportsMonks fixture row as `/fixtures/between` returns it. */
function providerFixture(state: string, home: number, away: number, kickoffUtc: string) {
  return {
    id: PROVIDER.fixture,
    league_id: PROVIDER.league,
    season_id: PROVIDER.season,
    round_id: null,
    starting_at: kickoffUtc,
    state: { developer_name: state },
    participants: [
      { id: PROVIDER.home, meta: { location: "home" } },
      { id: PROVIDER.away, meta: { location: "away" } },
    ],
    scores: [
      { description: "CURRENT", score: { participant: "home", goals: home } },
      { description: "CURRENT", score: { participant: "away", goals: away } },
    ],
  };
}

/** One SportsMonks event as `/fixtures/{id}` returns it with `events.type`. */
function providerEvent(
  id: number,
  developerName: string,
  typeId: number,
  team: number,
  player: number,
  minute: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    type_id: typeId,
    type: { id: typeId, developer_name: developerName },
    participant_id: team,
    player_id: player,
    related_player_id: null,
    player_name: `Provider ${player}`,
    minute,
    extra_minute: null,
    ...extra,
  };
}

/** The same fixture as `/fixtures/{id}` returns it with the match-details includes. */
function providerDetails(row: Record<string, unknown>, events: unknown[]) {
  const stat = (typeId: number, name: string, team: number, value: number) => ({
    type_id: typeId,
    type: { id: typeId, developer_name: name },
    participant_id: team,
    data: { value },
  });
  const lineup = (
    team: number,
    player: number,
    typeId: number,
    position: number,
    order: number | null,
  ) => ({
    team_id: team,
    player_id: player,
    type_id: typeId,
    position_id: position,
    formation_position: order,
    jersey_number: order,
  });
  return {
    data: {
      ...row,
      events,
      statistics: [
        stat(45, "BALL_POSSESSION", PROVIDER.home, 55),
        stat(45, "BALL_POSSESSION", PROVIDER.away, 45),
        stat(42, "SHOTS_TOTAL", PROVIDER.home, 10),
        stat(42, "SHOTS_TOTAL", PROVIDER.away, 7),
      ],
      lineups: [
        lineup(PROVIDER.home, PROVIDER.homeStriker, 11, 27, 10),
        lineup(PROVIDER.home, PROVIDER.homeWinger, 11, 27, 11),
        lineup(PROVIDER.away, PROVIDER.awayStriker, 11, 27, 9),
        lineup(PROVIDER.away, PROVIDER.awayMaker, 12, 26, null),
      ],
      formations: [
        { participant_id: PROVIDER.home, formation: "4-4-2", location: "home" },
        { participant_id: PROVIDER.away, formation: "4-3-3", location: "away" },
      ],
    },
  };
}

async function refresh(
  tx: Tx,
  token: string,
  row: Record<string, unknown>,
  now: Date,
  details?: Record<string, unknown>,
) {
  const response = await handleFootballLiveRefreshRequest(
    new Request("https://functions.local/football-live-refresh", {
      method: "POST",
      headers: { "content-type": "application/json", "x-botolago-scheduler-token": token },
      body: '{"job":"fixtures"}',
    }),
    {
      environment: { SPORTSMONKS_API_TOKEN: "sportsmonks-test-token-0123456789" },
      client: rpcClient(tx),
      now: () => now,
      fetch: async (input) => {
        const url = new URL(String(input instanceof Request ? input.url : input));
        expect(url.origin).toBe("https://api.sportmonks.com");
        if (url.pathname.includes("/fixtures/between/")) {
          return Response.json({ data: [row], pagination: { has_more: false } });
        }
        // The details of a match that is on: asked for by id, after the scores.
        expect(url.pathname).toBe(`/v3/football/fixtures/${PROVIDER.fixture}`);
        return details ? Response.json(details) : new Response("unexpected", { status: 404 });
      },
    },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function asVisitor<T>(tx: Tx, read: () => Promise<T>): Promise<T> {
  await tx.unsafe("set local role anon");
  await tx.unsafe(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  try {
    return await read();
  } finally {
    await tx.unsafe("set local role service_role");
    await tx.unsafe(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  }
}

class Rollback extends Error {}

describe("live scores, provider to screen", () => {
  it("a goal and the final whistle reach the site's match card", async () => {
    if (!sql) return;
    await sql
      .begin(async (tx) => {
        // Catalogue and provider mappings, as the season import leaves them.
        await tx.unsafe(`
          insert into app.countries (id, iso_alpha2, iso_alpha3) values ('${IDS.country}', 'ZZ', 'ZZZ');
          insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
          values ('${IDS.competition}', 'live-e2e', 'Live E2E League', 'LE2E', 'league', '${IDS.country}');
          insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
          values ('${IDS.season}', '${IDS.competition}', 'Live E2E', current_date - 30, current_date + 200, 'active', false);
          insert into app.teams (id, slug, name, short_name, code, country_id) values
            ('${IDS.home}', 'live-e2e-home', 'Live Home', 'Home', 'LEH', '${IDS.country}'),
            ('${IDS.away}', 'live-e2e-away', 'Live Away', 'Away', 'LEA', '${IDS.country}');
          delete from app_private.football_provider_mappings
          where provider_name = 'sportsmonks' and (entity_type, external_id) in
            (('competition', '${PROVIDER.league}'), ('season', '${PROVIDER.season}'));
          insert into app_private.football_provider_mappings
            (provider_name, entity_type, external_id, internal_entity_id, last_seen_at) values
            ('sportsmonks', 'competition', '${PROVIDER.league}', '${IDS.competition}', now()),
            ('sportsmonks', 'season', '${PROVIDER.season}', '${IDS.season}', now()),
            ('sportsmonks', 'team', '${PROVIDER.home}', '${IDS.home}', now()),
            ('sportsmonks', 'team', '${PROVIDER.away}', '${IDS.away}', now());
          insert into app.players (id, slug, full_name, display_name, position) values
            ('${IDS.homeStriker}', 'live-e2e-home-striker', 'Home Striker', 'H. Striker', 'forward'),
            ('${IDS.homeWinger}', 'live-e2e-home-winger', 'Home Winger', 'H. Winger', 'forward'),
            ('${IDS.awayStriker}', 'live-e2e-away-striker', 'Away Striker', 'A. Striker', 'forward'),
            ('${IDS.awayMaker}', 'live-e2e-away-maker', 'Away Maker', 'A. Maker', 'midfielder');
          insert into app_private.football_provider_mappings
            (provider_name, entity_type, external_id, internal_entity_id, last_seen_at) values
            ('sportsmonks', 'player', '${PROVIDER.homeStriker}', '${IDS.homeStriker}', now()),
            ('sportsmonks', 'player', '${PROVIDER.homeWinger}', '${IDS.homeWinger}', now()),
            ('sportsmonks', 'player', '${PROVIDER.awayStriker}', '${IDS.awayStriker}', now()),
            ('sportsmonks', 'player', '${PROVIDER.awayMaker}', '${IDS.awayMaker}', now());
        `);
        const [{ token }] = (await tx.unsafe(
          "select app_private.scheduler_token() as token",
        )) as Array<{ token: string }>;
        await tx.unsafe("set local role service_role");
        await tx.unsafe(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);

        // A wrong scheduler token never reaches the provider.
        const refused = await refresh(
          tx,
          "0".repeat(64),
          providerFixture("NS", 0, 0, "2026-09-26 20:00:00"),
          new Date(),
        );
        expect(refused.status).toBe(401);

        // Kick-off 130 minutes ago; the provider is read 70 minutes in, then
        // at full time 115 minutes in (both in the past, in that order).
        const kickoff = new Date(Date.now() - 130 * 60_000);
        kickoff.setUTCSeconds(0, 0);
        const at = (minutes: number) => new Date(kickoff.getTime() + minutes * 60_000);
        const providerTime = (date: Date) => date.toISOString().slice(0, 19).replace("T", " ");
        const kickoffProvider = providerTime(kickoff);

        // 1. In play, 2-1 in the second half, with the goals so far.
        const liveRow = {
          ...providerFixture("INPLAY_2ND_HALF", 2, 1, kickoffProvider),
          last_processed_at: providerTime(at(70)),
        };
        const goalsSoFar = [
          providerEvent(1, "GOAL", 14, PROVIDER.away, PROVIDER.awayStriker, 12, {
            related_player_id: PROVIDER.awayMaker,
            result: "0-1",
          }),
          providerEvent(2, "GOAL", 14, PROVIDER.home, PROVIDER.homeStriker, 30, { result: "1-1" }),
          providerEvent(3, "PENALTY", 16, PROVIDER.home, PROVIDER.homeWinger, 60, {
            result: "2-1",
          }),
          providerEvent(4, "YELLOWCARD", 19, PROVIDER.away, PROVIDER.awayMaker, 65),
        ];
        const live = await refresh(
          tx,
          token,
          liveRow,
          at(70),
          providerDetails(liveRow, goalsSoFar),
        );
        expect(live).toMatchObject({ status: 200 });
        expect((live.body.jobs as { fixtures: { inserted: number } }).fixtures.inserted).toBe(1);
        expect(live.body.matchDetails).toMatchObject({
          scope: "live",
          due: 1,
          stored: 1,
          rejected: 0,
          events: 4,
          statistics: 4,
          lineupPlayers: 4,
          unmappedPlayers: 0,
        });

        // The mapping the ingestion created (read as the owner: it is private).
        await tx.unsafe("reset role");
        const [{ id: fixtureId }] = (await tx.unsafe(`
          select internal_entity_id as id from app_private.football_provider_mappings
          where provider_name = 'sportsmonks' and entity_type = 'fixture'
            and external_id = '${PROVIDER.fixture}'`)) as Array<{ id: string }>;
        await tx.unsafe("set local role service_role");
        const readCard = () =>
          asVisitor(tx, async () => {
            const [{ result }] = (await tx.unsafe(
              `select api.football_match_detail(${literal(fixtureId)}::uuid, 'fr') as result`,
            )) as Array<{ result: unknown }>;
            return matchCardSchema.parse(result);
          });

        const liveCard = await readCard();
        expect(liveCard).toMatchObject({
          status: "live_second_half",
          period: "second_half",
          homeScore: 2,
          awayScore: 1,
          finalizedAt: null,
        });
        expect(Date.parse(liveCard.kickoffAt)).toBe(kickoff.getTime());
        expect(toMatch(liveCard)).toMatchObject({ status: "live", homeScore: 2, awayScore: 1 });
        const liveStrip = () =>
          asVisitor(tx, async () => {
            const [{ result }] = (await tx.unsafe(
              "select api.football_live_matches(p_limit => 100, p_language => 'fr') as result",
            )) as Array<{ result: Array<{ id: string }> }>;
            return result.map((match) => match.id);
          });
        expect(await liveStrip()).toContain(fixtureId);

        // The three tabs, read as a visitor through the site's own RPCs and
        // contracts: Résumé, Stats, Compos.
        const readTab = <T>(rpcName: string, schema: { parse: (value: unknown) => T }) =>
          asVisitor(tx, async () => {
            const [{ result }] = (await tx.unsafe(
              `select api.${rpcName}(${literal(fixtureId)}::uuid, 'fr') as result`,
            )) as Array<{ result: unknown }>;
            return schema.parse(result);
          });
        const timeline = () => readTab("football_match_timeline", timelineItemSchema.array());
        const liveTimeline = await timeline();
        expect(liveTimeline.map((event) => [event.type, event.teamId, event.minute])).toEqual([
          ["goal", IDS.away, 12],
          ["goal", IDS.home, 30],
          ["penalty_goal", IDS.home, 60],
          ["yellow_card", IDS.away, 65],
        ]);
        expect(liveTimeline[0]).toMatchObject({
          playerId: IDS.awayStriker,
          relatedPlayerId: IDS.awayMaker,
          detail: "A. Striker",
        });
        const stats = await readTab("football_match_statistics", matchStatisticSchema.array());
        expect(stats.map((stat) => [stat.code, stat.homeValue, stat.awayValue])).toEqual([
          ["possession", 55, 45],
          ["shots", 10, 7],
        ]);
        const lineups = await readTab("football_match_lineups", lineupSchema.array());
        expect(
          lineups.map((lineup) => [
            lineup.team.id,
            lineup.formation,
            lineup.players.map((player) => [player.displayName, player.slot, player.order]),
          ]),
        ).toEqual([
          [
            IDS.home,
            "4-4-2",
            [
              ["H. Striker", "starting", 1],
              ["H. Winger", "starting", 2],
            ],
          ],
          [
            IDS.away,
            "4-3-3",
            [
              ["A. Striker", "starting", 1],
              ["A. Maker", "bench", 1],
            ],
          ],
        ]);

        // 2. Full time, 3-1.
        const finalObserved = at(115);
        const finalRow = {
          ...providerFixture("FT", 3, 1, kickoffProvider),
          last_processed_at: providerTime(finalObserved),
        };
        // A late goal, and the yellow card withdrawn.
        const fullTime = [
          ...goalsSoFar.slice(0, 3),
          { ...goalsSoFar[3], rescinded: true },
          providerEvent(5, "GOAL", 14, PROVIDER.home, PROVIDER.homeStriker, 88, { result: "3-1" }),
        ];
        const final = await refresh(
          tx,
          token,
          finalRow,
          finalObserved,
          providerDetails(finalRow, fullTime),
        );
        expect(final.status).toBe(200);
        expect((final.body.jobs as { fixtures: { updated: number } }).fixtures.updated).toBe(1);
        expect(final.body.matchDetails).toMatchObject({ stored: 1, events: 4 });
        const finalTimeline = await timeline();
        expect(finalTimeline.map((event) => [event.type, event.minute])).toEqual([
          ["goal", 12],
          ["goal", 30],
          ["penalty_goal", 60],
          ["goal", 88],
        ]);
        // The same goals are the same rows: the page's goal takeover is keyed
        // on the id, so a refresh must not make an old goal look new.
        expect(finalTimeline.slice(0, 3).map((event) => event.id)).toEqual(
          liveTimeline.slice(0, 3).map((event) => event.id),
        );

        const finalCard = await readCard();
        expect(finalCard).toMatchObject({
          status: "finished",
          period: "post_match",
          homeScore: 3,
          awayScore: 1,
        });
        expect(finalCard.finalizedAt).not.toBeNull();
        expect(Date.parse(finalCard.providerUpdatedAt)).toBe(
          Date.parse(`${finalObserved.toISOString().slice(0, 19)}Z`),
        );
        expect(toMatch(finalCard)).toMatchObject({
          status: "finished",
          homeScore: 3,
          awayScore: 1,
        });
        expect(await liveStrip()).not.toContain(fixtureId);

        // 3. A late, older reply cannot put the finished match back in play.
        const staleRow = {
          ...providerFixture("INPLAY_2ND_HALF", 2, 1, kickoffProvider),
          last_processed_at: providerTime(at(60)),
        };
        const stale = await refresh(
          tx,
          token,
          staleRow,
          at(60),
          providerDetails(staleRow, goalsSoFar),
        );
        expect(stale.status).not.toBe(200);
        expect(await readCard()).toMatchObject({ status: "finished", homeScore: 3, awayScore: 1 });
        // Nor put its details back: the finished match is still due (it was
        // finalized minutes ago), and the older read is refused as stale.
        expect(stale.body.matchDetails).toMatchObject({ due: 1, stored: 0, stale: 1 });
        expect((await timeline()).map((event) => event.id)).toEqual(
          finalTimeline.map((event) => event.id),
        );

        throw new Rollback("leave nothing behind");
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
