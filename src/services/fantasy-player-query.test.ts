import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createAppQueryClient } from "./query-client";
import { fantasyPlayerQuery, fantasyPlayersQuery } from "./fantasy-player-query";
import { fantasyService } from "./fantasy-runtime";
import type { FantasyPlayer } from "@/types/fantasy";

const pool = [{ id: "p1" }, { id: "p2" }] as unknown as FantasyPlayer[];

describe("a player's page reads the player from the season's pool", () => {
  const spies: { mockRestore(): void }[] = [];
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  function countPoolReads() {
    const spy = spyOn(fantasyService, "getPlayers").mockImplementation(async () => pool);
    const single = spyOn(fantasyService, "getPlayer");
    spies.push(spy, single);
    return { spy, single };
  }

  test("opened from the list, the pool already there is used: nothing is read", async () => {
    const { spy, single } = countPoolReads();
    const client = createAppQueryClient();
    await client.fetchQuery(fantasyPlayersQuery());
    expect(spy).toHaveBeenCalledTimes(1);

    const player = await client.ensureQueryData(fantasyPlayerQuery("p2"));
    expect(player).toBe(pool[1]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    client.clear();
  });

  test("opened from a shared link, the pool is read once, as getPlayer did, and kept", async () => {
    const { spy } = countPoolReads();
    const client = createAppQueryClient();
    expect(await client.ensureQueryData(fantasyPlayerQuery("p1"))).toBe(pool[0]);
    expect(spy).toHaveBeenCalledTimes(1);
    // The list and the next player opened find the pool in the cache.
    expect(client.getQueryData(fantasyPlayersQuery().queryKey)).toBe(pool);
    expect(await client.ensureQueryData(fantasyPlayerQuery("p2"))).toBe(pool[1]);
    expect(spy).toHaveBeenCalledTimes(1);
    client.clear();
  });

  test("opened while the list is still loading the pool, joins that read", async () => {
    const { spy } = countPoolReads();
    const client = createAppQueryClient();
    const list = client.fetchQuery(fantasyPlayersQuery());
    expect(await client.ensureQueryData(fantasyPlayerQuery("p2"))).toBe(pool[1]);
    await list;
    expect(spy).toHaveBeenCalledTimes(1);
    client.clear();
  });

  test("a player the pool does not hold is no player, not a failed read", async () => {
    countPoolReads();
    const client = createAppQueryClient();
    expect(await client.ensureQueryData(fantasyPlayerQuery("nobody"))).toBeNull();
    client.clear();
  });
});
