// Live scores, end to end: provider -> ingestion -> database -> RPC -> screen.
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

import { matchCardSchema } from "../../src/backend/football/contracts";
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
} as const;
// SportsMonks ids: Botola Pro and its 2026/27 season (the handler's defaults),
// and two club ids no real mapping uses.
const PROVIDER = { league: 860, season: 28647, fixture: 990_000_001, home: 990_001, away: 990_002 };

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

async function refresh(tx: Tx, token: string, row: Record<string, unknown>, now: Date) {
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
        expect(url.pathname).toContain("/fixtures/between/");
        return Response.json({ data: [row], pagination: { has_more: false } });
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

        // 1. In play, 2-1 in the second half.
        const live = await refresh(
          tx,
          token,
          {
            ...providerFixture("INPLAY_2ND_HALF", 2, 1, kickoffProvider),
            last_processed_at: providerTime(at(70)),
          },
          at(70),
        );
        expect(live).toMatchObject({ status: 200 });
        expect((live.body.jobs as { fixtures: { inserted: number } }).fixtures.inserted).toBe(1);

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

        // 2. Full time, 3-1.
        const finalObserved = at(115);
        const final = await refresh(
          tx,
          token,
          {
            ...providerFixture("FT", 3, 1, kickoffProvider),
            last_processed_at: providerTime(finalObserved),
          },
          finalObserved,
        );
        expect(final.status).toBe(200);
        expect((final.body.jobs as { fixtures: { updated: number } }).fixtures.updated).toBe(1);

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
        const stale = await refresh(
          tx,
          token,
          {
            ...providerFixture("INPLAY_2ND_HALF", 2, 1, kickoffProvider),
            last_processed_at: providerTime(at(60)),
          },
          at(60),
        );
        expect(stale.status).not.toBe(200);
        expect(await readCard()).toMatchObject({ status: "finished", homeScore: 3, awayScore: 1 });

        throw new Rollback("leave nothing behind");
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
