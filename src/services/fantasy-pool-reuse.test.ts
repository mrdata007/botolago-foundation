import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import type { FantasyPlayer } from "@/types/fantasy";
import { forgetSharedFantasyHub } from "./fantasy-hub-share";
import {
  fantasyPlayerQuery,
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
const GW4 = "00000000-0000-4000-8000-000000000104";
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
    items: [3, 4].map((sequence) => ({
      id: sequence === 3 ? GW3 : GW4,
      sequence,
      name: String(sequence),
      deadlineAt: "2026-10-03T13:30:00Z",
      startsAt: "2026-10-03T15:00:00Z",
      endsAt: "2026-10-05T21:00:00Z",
      status: "live" as const,
      pointsState: "provisional" as const,
    })),
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
    // The pool read is held open until both gameweeks' reads have reached it,
    // so each of them joins the read on its way rather than finding it done.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      await held;
      return pool;
    });
    spies.push(getPlayers);
    const client = createAppQueryClient();
    const reading = Promise.all([
      client.fetchQuery(fantasyPlayersQuery()),
      client.fetchQuery(topPlayersOfWeekQuery(3)),
      client.fetchQuery(topPlayersOfWeekQuery(4)),
    ]);
    while (reads.top.mock.calls.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    release();
    const [, week3, week4] = await reading;
    expect(getPlayers).toHaveBeenCalledTimes(1);
    expect(week3[0]?.price).toBe(9);
    expect(week4[0]?.price).toBe(9);
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
});

/**
 * The one-retry rule (`@/services/query-client`) holds for the pool whoever
 * reads it: a failing pool is read twice in all, every screen keeps its one
 * retry, and a read's own failure is still retried once.
 */
describe("a pool read that fails, or is shared", () => {
  /** No waiting between attempts, in this test only; the pool keeps its other defaults. */
  function quickRetries() {
    const client = createAppQueryClient();
    const key = fantasyPlayersQuery().queryKey;
    client.setQueryDefaults(key, { ...client.getQueryDefaults(key), retryDelay: 0 });
    return client;
  }
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  function held<T>() {
    let settle!: { resolve: (value: T) => void; reject: (error: unknown) => void };
    const promise = new Promise<T>((resolve, reject) => {
      settle = { resolve, reject };
    });
    return { promise, ...settle };
  }
  function failingPool() {
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      throw new Error("statement timeout");
    });
    spies.push(getPlayers);
    return getPlayers;
  }

  test("is read twice in all, not four times, by every read that takes it", async () => {
    for (const reader of [
      trendingPlayersQuery(),
      topPlayersOfWeekQuery(3),
      fantasyPlayerQuery(P1),
    ] as const) {
      const getPlayers = failingPool();
      const client = quickRetries();
      await expect(client.fetchQuery({ ...reader, retryDelay: 0 })).rejects.toThrow(
        "statement timeout",
      );
      expect([reader.queryKey, getPlayers.mock.calls.length]).toEqual([reader.queryKey, 2]);
      client.clear();
      for (const spy of spies.splice(0)) spy.mockRestore();
    }
  });

  test("is still read twice in all when the top five failed first and was retried", async () => {
    // The top five fails at once while the read's own pool read is on its
    // way; the retry reads the pool once more: two pool reads in all.
    const getPlayers = failingPool();
    reads.top.mockImplementationOnce(async () => {
      throw new Error("connection reset");
    });
    const client = quickRetries();
    await expect(client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 25 })).rejects.toThrow(
      "statement timeout",
    );
    expect(reads.top).toHaveBeenCalledTimes(2);
    expect(getPlayers).toHaveBeenCalledTimes(2);
    client.clear();
  });

  test("read by a screen keeps that screen's retry, and a read joining it shares it", async () => {
    // The players list is loading the pool when Home's trending players ask
    // for it: they join that read. Its first attempt drops; the list's retry
    // succeeds, and both get the players, with one retry in all.
    const first = held<FantasyPlayer[]>();
    let calls = 0;
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? first.promise : pool;
    });
    spies.push(getPlayers);
    const client = quickRetries();
    const screen = client.fetchQuery(fantasyPlayersQuery());
    const home = client.fetchQuery(trendingPlayersQuery());
    while (reads.top.mock.calls.length < 1) await tick();
    first.reject(new Error("connection reset"));
    expect(await screen).toBe(pool);
    expect(await home).toHaveLength(2);
    expect(getPlayers).toHaveBeenCalledTimes(2);
    expect(client.getQueryState(trendingPlayersQuery().queryKey)?.fetchFailureCount).toBe(0);
    client.clear();
  });

  test("is read again by a waiting read when the screen's read failed without its retry", async () => {
    // A pool read's retry is dropped when its last screen closes: one attempt
    // only. The read that joined it retries, and reads the pool itself.
    let calls = 0;
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("connection reset");
      return pool;
    });
    spies.push(getPlayers);
    const client = quickRetries();
    const key = fantasyPlayersQuery().queryKey;
    void client.fetchQuery({ ...fantasyPlayersQuery(), retry: false }).catch(() => {});
    expect(await client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 0 })).toHaveLength(2);
    expect(getPlayers).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(key)).toBe(pool);
    client.clear();
  });

  test("read by Home's trending players does not take a screen's retry away", async () => {
    // Home's read of the pool is on its way when the Fantasy tab opens: the
    // tab's own read keeps its retry (its first attempt drops, the retry
    // succeeds) and Home's read takes the result.
    const homeRead = held<FantasyPlayer[]>();
    let calls = 0;
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return homeRead.promise;
      if (calls === 2) throw new Error("connection reset");
      return pool;
    });
    spies.push(getPlayers);
    const client = quickRetries();
    const home = client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 0 });
    while (getPlayers.mock.calls.length < 1) await tick();
    const screen = client.fetchQuery(fantasyPlayersQuery());
    expect(await screen).toBe(pool);
    homeRead.reject(new Error("connection reset"));
    expect(await home).toHaveLength(2);
    client.clear();
  });

  test("read by several reads at once, missing or stale, is read once for all", async () => {
    // Player pages loaded ahead as a finger scrolls the list, and a gameweek's
    // top five, all asking while no screen is reading the pool.
    for (const updatedAt of [null, Date.now() - 6 * 60_000]) {
      const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
        await tick();
        return pool;
      });
      spies.push(getPlayers);
      const client = createAppQueryClient();
      if (updatedAt !== null) {
        client.setQueryData(fantasyPlayersQuery().queryKey, pool, { updatedAt });
      }
      const [a, b, top] = await Promise.all([
        client.ensureQueryData(fantasyPlayerQuery(P1)),
        client.ensureQueryData(fantasyPlayerQuery(P2)),
        client.fetchQuery(topPlayersOfWeekQuery(3)),
      ]);
      expect([a, b]).toEqual([pool[0], pool[1]]);
      expect(top).toHaveLength(3);
      expect([updatedAt, getPlayers.mock.calls.length]).toEqual([updatedAt, 1]);
      client.clear();
      for (const spy of spies.splice(0)) spy.mockRestore();
    }
  });

  test("failing for several reads at once, is read twice in all, not twice each", async () => {
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      await tick();
      throw new Error("statement timeout");
    });
    spies.push(getPlayers);
    const client = quickRetries();
    const results = await Promise.allSettled([
      client.fetchQuery({ ...fantasyPlayerQuery(P1), retryDelay: 0 }),
      client.fetchQuery({ ...fantasyPlayerQuery(P2), retryDelay: 0 }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(getPlayers).toHaveBeenCalledTimes(2);
    client.clear();
  });

  test("a minute old, is still fresh: not read again", async () => {
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => pool);
    spies.push(getPlayers);
    const client = createAppQueryClient();
    client.setQueryData(fantasyPlayersQuery().queryKey, pool, { updatedAt: Date.now() - 60_000 });
    await client.fetchQuery(trendingPlayersQuery());
    expect(getPlayers).not.toHaveBeenCalled();
    client.clear();
  });

  test("marked out of date, is read again however recent", async () => {
    const fresh = pool.map((player) => ({ ...player, price: player.price + 0.5 }));
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => fresh);
    spies.push(getPlayers);
    const client = createAppQueryClient();
    client.setQueryData(fantasyPlayersQuery().queryKey, pool);
    await client.invalidateQueries({
      queryKey: fantasyPlayersQuery().queryKey,
      refetchType: "none",
    });
    const rows = await client.fetchQuery(topPlayersOfWeekQuery(3));
    expect(getPlayers).toHaveBeenCalledTimes(1);
    expect(rows[0]?.price).toBe(9.5);
    client.clear();
  });

  test("read by a read is not stored over a newer copy a screen brought in meanwhile", async () => {
    const own = held<FantasyPlayer[]>();
    const newer = pool.map((player) => ({ ...player, price: player.price + 1 }));
    let calls = 0;
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? own.promise : newer;
    });
    spies.push(getPlayers);
    const client = createAppQueryClient();
    const key = fantasyPlayersQuery().queryKey;
    const player = client.fetchQuery(fantasyPlayerQuery(P1));
    while (getPlayers.mock.calls.length < 1) await tick();
    await tick();
    expect(await client.fetchQuery(fantasyPlayersQuery())).toBe(newer);
    own.resolve(pool);
    // The page takes the newer copy too, so it agrees with the list.
    expect(await player).toBe(newer[0]);
    expect(client.getQueryData(key)).toBe(newer);
    client.clear();
  });

  test("older than five minutes, is read again", async () => {
    const fresh = pool.map((player) => ({ ...player, price: player.price + 0.5 }));
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => fresh);
    spies.push(getPlayers);
    const client = createAppQueryClient();
    client.setQueryData(fantasyPlayersQuery().queryKey, pool, {
      updatedAt: Date.now() - 6 * 60_000,
    });
    const rows = await client.fetchQuery(topPlayersOfWeekQuery(3));
    expect(getPlayers).toHaveBeenCalledTimes(1);
    expect(rows[0]?.price).toBe(9.5);
    client.clear();
  });

  test("with no pool and no read on its way, is read once by the read asking and kept", async () => {
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => pool);
    spies.push(getPlayers);
    const client = createAppQueryClient();
    expect(await client.fetchQuery(trendingPlayersQuery())).toHaveLength(2);
    expect(client.getQueryData(fantasyPlayersQuery().queryKey)).toBe(pool);
    expect(await client.fetchQuery(topPlayersOfWeekQuery(3))).toHaveLength(3);
    expect(getPlayers).toHaveBeenCalledTimes(1);
    client.clear();
  });

  test("cancelled under a waiting read, hands it to the new read", async () => {
    // A screen refetches a stale pool while Home's read waits on the read in
    // progress: React Query cancels that read and starts another, which
    // Home's read takes, with no failure and no retry of its own.
    const first = held<FantasyPlayer[]>();
    let calls = 0;
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? first.promise : pool;
    });
    spies.push(getPlayers);
    const client = quickRetries();
    const key = fantasyPlayersQuery().queryKey;
    client.setQueryData(key, pool, { updatedAt: 1 });
    const poolQuery = client.getQueryCache().find({ queryKey: key })!;
    void poolQuery.fetch(fantasyPlayersQuery()).catch(() => {});
    const home = client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 0 });
    while (reads.top.mock.calls.length < 1) await tick();
    void poolQuery.fetch(fantasyPlayersQuery(), { cancelRefetch: true });
    expect(await home).toHaveLength(2);
    expect(client.getQueryState(trendingPlayersQuery().queryKey)).toMatchObject({
      status: "success",
      fetchFailureCount: 0,
    });
    expect(reads.top).toHaveBeenCalledTimes(1);
    // The cancelled read and the new one: Home's read took the new one
    // rather than reading the pool itself.
    expect(getPlayers).toHaveBeenCalledTimes(2);
    client.clear();
  });

  test("cancelled again and again, falls back to its own read instead of chasing them", async () => {
    const reads1 = held<FantasyPlayer[]>();
    const reads2 = held<FantasyPlayer[]>();
    let calls = 0;
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return reads1.promise;
      if (calls === 2) return reads2.promise;
      return pool;
    });
    spies.push(getPlayers);
    const client = quickRetries();
    const key = fantasyPlayersQuery().queryKey;
    client.setQueryData(key, pool, { updatedAt: 1 });
    const poolQuery = client.getQueryCache().find({ queryKey: key })!;
    void poolQuery.fetch(fantasyPlayersQuery()).catch(() => {});
    const home = client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 0 });
    while (reads.top.mock.calls.length < 1) await tick();
    void poolQuery.fetch(fantasyPlayersQuery(), { cancelRefetch: true }).catch(() => {});
    await tick();
    void poolQuery.fetch(fantasyPlayersQuery(), { cancelRefetch: true }).catch(() => {});
    expect(await home).toHaveLength(2);
    // Two reads cancelled, the screen's third, and Home's own after two
    // hand-overs.
    expect(getPlayers).toHaveBeenCalledTimes(4);
    client.clear();
  });

  test("joined, and failing after the screen's retry, costs the read one more pool read", async () => {
    // The list's pool read fails both its attempts while Home's trending
    // players wait on it; Home's retry reads the pool once itself: three in
    // all, not four.
    const getPlayers = spyOn(fantasyService, "getPlayers").mockImplementation(async () => {
      await tick();
      throw new Error("statement timeout");
    });
    spies.push(getPlayers);
    const client = quickRetries();
    const screen = client.fetchQuery(fantasyPlayersQuery()).catch(() => null);
    const home = client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 0 });
    await expect(home).rejects.toThrow("statement timeout");
    await screen;
    expect(getPlayers).toHaveBeenCalledTimes(3);
    client.clear();
  });

  test("of the top five itself is still retried once", async () => {
    reads.top.mockImplementationOnce(async () => {
      throw new Error("connection reset");
    });
    const client = withCachedPool();
    expect(await client.fetchQuery({ ...trendingPlayersQuery(), retryDelay: 0 })).toHaveLength(2);
    expect(reads.top).toHaveBeenCalledTimes(2);
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
