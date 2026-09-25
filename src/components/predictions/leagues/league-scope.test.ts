import { describe, expect, test } from "bun:test";

import { leagueScope } from "./league-scope";

describe("leagueScope", () => {
  test("shows the season while there is no journée", () => {
    expect(leagueScope(null, null)).toBe("season");
  });

  test("moves to the journée once it arrives, when nothing was picked", () => {
    // The Fantasy league tab mounts before its journée has loaded.
    const atMount = leagueScope(null, null);
    const afterLoad = leagueScope(1, null);
    expect(atMount).toBe("season");
    expect(afterLoad).toBe("round");
  });

  test("keeps the player's pick", () => {
    expect(leagueScope(1, "season")).toBe("season");
    expect(leagueScope(1, "round")).toBe("round");
  });

  test("falls back to the season when the journée goes away, whatever was picked", () => {
    expect(leagueScope(null, "round")).toBe("season");
  });
});
