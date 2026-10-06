import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import type { FantasyPlayer } from "@/types/domain";
import { forgetSharedFantasyHub } from "./fantasy-hub-share";
import {
  fantasyPlayersQuery,
  topPlayersOfWeekQuery,
  trendingPlayersQuery,
} from "./fantasy-player-query";
import { fantasyService } from "./fantasy-runtime";
import { createAppQueryClient } from "./query-client";

/**
 * Home's trending players and the top players' rows are the gameweek's top
 * five joined with the season's player pool. Each used to read the whole pool
 * again inside its own read (nine reads in a row); they now take the cached
 * pool. Cloud mode, as production runs: the repository is spied on, not
 * replaced (a module mock would outlive this file).
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const GW3 = "00000000-0000-4000-8000-000000000103";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const MISSING = "00000000-0000-4000-8000-0000000000ff";

const pool = [
  { id: P1, price: 7.5, ownership: 12.5, form: 4.2, totalPoints: 30 },
  { id: P2, price: 9, ownership: 40, form: null, totalPoints: 52 },
] as unknown as FantasyPlayer[];

const hub = {
  season: { id: SEASON, name: "2026/2027", status: "in_progress" },
  gameweek: { id: GW3, sequence: 3, name: "3", status: "live", pointsState: "provisional" },
} as unknown as FantasyHubDto;

const top = [
  { fantasyPlayerId: P2, points: 11, minutesPlayed: 90, state: "final" as const },
  { fantasyPlayerId: MISSING, points: 9, minutesPlayed: 80, state: "final" as const },
  { fantasyPlayerId: P1, points: 7, minutesPlayed: 60, state: "final" as const },
];

const repository = SupabaseFantasyRepository.prototype;
const reads = {
  hub: spyOn(repository, "getHub").mockImplementation(async () => hub),
  gameweeks: spyOn(repository, "getGameweeks").mockImplementation(async () => ({
    items: [
      {
        id: GW3,
        sequence: 3,
        name: "3",
        deadlineAt: "2026-10-03T13:30:00Z",
        startsAt: "2026-10-03T15:00:00Z",
        endsAt: "2026-10-05T21:00:00Z",
        status: "live" as const,
        pointsState: "provisional" as const,
      },
    ],
    nextCursor: null,
  })),
  top: spyOn(repository, "getTopPlayers").mockImplementation(async () => top),
  poolPages: spyOn(repository, "getPlayerPool").mockImplementation(async () => {
    throw new Error("the pool must come from the cache");
  }),
  seasonStats: spyOn(repository, "getPlayerSeasonStats").mockImplementation(async () => {
    throw new Error("the pool must come from the cache");
  }),
};
// No Supabase configuration in tests: asked whose session a read carries, the
// client says so on the console. Not this file's concern.
const quiet = spyOn(console, "error").mockImplementation(() => {});

const MODE = "VITE_FANTASY_DATA_MODE";
const modeBefore = process.env[MODE];
beforeAll(() => {
  process.env[MODE] = "supabase";
});
afterAll(() => {
  if (modeBefore === undefined) delete process.env[MODE];
  else process.env[MODE] = modeBefore;
  for (const spy of Object.values(reads)) spy.mockRestore();
  quiet.mockRestore();
});

const spies: { mockRestore(): void }[] = [];
afterEach(() => {
  forgetSharedFantasyHub();
  for (const spy of Object.values(reads)) spy.mockClear();
  for (const spy of spies.splice(0)) spy.mockRestore();
});

function withCachedPool() {
  const client = createAppQueryClient();
  client.setQueryData(fantasyPlayersQuery().queryKey, pool);
  return client;
}

describe("the top players of a gameweek", () => {
  test("take the cached pool: the pool is not read again", async () => {
    const client = withCachedPool();
    const rows = await client.fetchQuery(topPlayersOfWeekQuery(3));
    expect(reads.poolPages).not.toHaveBeenCalled();
    expect(reads.seasonStats).not.toHaveBeenCalled();
    expect(reads.top).toHaveBeenCalledTimes(1);
    client.clear();

    // The same rows as before: points and minutes from the gameweek's read,
    // price, ownership and form from the pool, unknown counts left unknown,
    // a player missing from the pool kept with 0, 0 and no form.
    expect(rows).toEqual([
      {
        playerId: P2,
        rank: 1,
        gameweek: 3,
        weeklyPoints: 11,
        goals: null,
        assists: null,
        cleanSheets: null,
        minutes: 90,
        price: 9,
        ownershipPercent: 40,
        form: null,
      },
      {
        playerId: MISSING,
        rank: 2,
        gameweek: 3,
        weeklyPoints: 9,
        goals: null,
        assists: null,
        cleanSheets: null,
        minutes: 80,
        price: 0,
        ownershipPercent: 0,
        form: null,
      },
      {
        playerId: P1,
        rank: 3,
        gameweek: 3,
        weeklyPoints: 7,
        goals: null,
        assists: null,
        cleanSheets: null,
        minutes: 60,
        price: 7.5,
        ownershipPercent: 12.5,
        form: 4.2,
      },
    ]);
  });

  test("with no pool yet, two gameweeks and the list share one pool read", async () => {
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => pool);
    spies.push(getPlayers);
    const client = createAppQueryClient();
    await Promise.all([
      client.fetchQuery(fantasyPlayersQuery()),
      client.fetchQuery(topPlayersOfWeekQuery(3)),
      client.fetchQuery(topPlayersOfWeekQuery(4)),
    ]);
    expect(getPlayers).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

describe("Home's trending players", () => {
  test("take the cached pool, with the gameweek's points, in its order", async () => {
    const client = withCachedPool();
    const players = await client.fetchQuery(trendingPlayersQuery());
    expect(reads.poolPages).not.toHaveBeenCalled();
    expect(reads.seasonStats).not.toHaveBeenCalled();
    expect(players).toEqual([
      { ...pool[1], totalPoints: 11 },
      { ...pool[0], totalPoints: 7 },
    ] as FantasyPlayer[]);
    // The cached pool itself is left as it was.
    expect(client.getQueryData<FantasyPlayer[]>(fantasyPlayersQuery().queryKey)).toEqual(pool);
    expect(pool[1].totalPoints).toBe(52);
    client.clear();
  });

  test("a failing pool is asked twice, not four times: one retry in all", async () => {
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      throw new Error("statement timeout");
    });
    spies.push(getPlayers);
    const client = createAppQueryClient();
    await expect(client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 0 })).rejects.toThrow(
      "statement timeout",
    );
    expect(getPlayers).toHaveBeenCalledTimes(2);
    client.clear();
  });
});

describe("the mock mode", () => {
  test("keeps its own trending list and never asks for the pool it is handed", async () => {
    process.env[MODE] = "mock";
    try {
      let asked = 0;
      const players = await fantasyService.getTrendingPlayers(async () => {
        asked += 1;
        return [];
      });
      expect(asked).toBe(0);
      expect(players).toEqual(await fantasyService.getTrendingPlayers());
    } finally {
      process.env[MODE] = "supabase";
    }
  });
});
