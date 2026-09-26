import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { FantasyRuntimeService } from "@/services/fantasy-runtime";
import type { FantasyPlayer } from "@/types/fantasy";
import {
  FANTASY_POOL_STALE_MS,
  fantasyFixtureDifficultyQuery,
  fantasyPlayersQuery,
  loadFantasyPlayer,
  loadFantasyPlayers,
} from "./fantasy-queries";

const pool = [{ id: "p1" }, { id: "p2" }] as FantasyPlayer[];

/** The runtime, reduced to the pool read, counted: each call is up to 20 pages. */
function countedService() {
  const calls = { pool: 0 };
  const service = {
    getPlayers: async () => {
      calls.pool += 1;
      return pool;
    },
    getFixtureDifficulty: async () => [],
  } as unknown as FantasyRuntimeService;
  return { calls, service };
}

describe("one player pool for every screen", () => {
  test("a player page, the home trending card and the top players read the pool once", async () => {
    const qc = new QueryClient();
    const { calls, service } = countedService();
    expect(await loadFantasyPlayer(qc, "p2", service)).toEqual({ id: "p2" } as FantasyPlayer);
    expect(await loadFantasyPlayer(qc, "p1", service)).toEqual({ id: "p1" } as FantasyPlayer);
    await loadFantasyPlayers(qc, service); // trending / top players' pool
    await qc.fetchQuery(fantasyPlayersQuery(service)); // the players list
    expect(calls.pool).toBe(1);
    expect(await loadFantasyPlayer(qc, "missing", service)).toBeUndefined();
    qc.clear();
  });

  test("is kept for five minutes, under the one key the screens share", () => {
    expect(fantasyPlayersQuery().queryKey).toEqual(["fantasy-players"]);
    expect(fantasyPlayersQuery().staleTime).toBe(FANTASY_POOL_STALE_MS);
    expect(FANTASY_POOL_STALE_MS).toBe(300_000);
    // Pick Team, the fixtures board and the player page: one key, not two.
    expect(fantasyFixtureDifficultyQuery().queryKey).toEqual(["fantasy-fixture-difficulty"]);
  });
});
