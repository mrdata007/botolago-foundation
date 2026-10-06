import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createAppQueryClient } from "./query-client";
import { fantasyPlayerQuery, fantasyPlayersQuery } from "./fantasy-player-query";
import { fantasyService } from "./fantasy-runtime";
import type { FantasyPlayer } from "@/types/domain";

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

  test("opened from a shared link, the pool is read once, as getPlayer did", async () => {
    const { spy } = countPoolReads();
    const client = createAppQueryClient();
    const [a, b] = await Promise.all([
      client.ensureQueryData(fantasyPlayerQuery("p1")),
      client.ensureQueryData(fantasyPlayerQuery("p2")),
    ]);
    expect([a, b]).toEqual([pool[0], pool[1]]);
    expect(spy).toHaveBeenCalledTimes(1);
    // The list opened next finds the pool in the cache.
    expect(client.getQueryData(fantasyPlayersQuery().queryKey)).toBe(pool);
    client.clear();
  });

  test("a player the pool does not hold is no player, not a failed read", async () => {
    countPoolReads();
    const client = createAppQueryClient();
    expect(await client.ensureQueryData(fantasyPlayerQuery("nobody"))).toBeNull();
    client.clear();
  });
});
