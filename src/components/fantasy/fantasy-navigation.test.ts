import { describe, expect, test } from "bun:test";

import {
  fantasyPrimaryItems,
  fantasySecondaryItems,
  isFantasyRouteActive,
} from "./fantasy-navigation";

describe("Fantasy navigation", () => {
  test("keeps the five core tasks in the primary navigation", () => {
    expect(fantasyPrimaryItems.map((item) => item.to)).toEqual([
      "/fantasy",
      "/fantasy/team",
      "/fantasy/points",
      "/fantasy/transfers",
      "/fantasy/leagues",
    ]);
  });

  test("keeps decision-support routes in the secondary navigation", () => {
    expect(fantasySecondaryItems.map((item) => item.to)).toEqual([
      "/fantasy/top-players",
      "/fantasy/rankings",
      "/fantasy/players",
      "/fantasy/fixtures",
      "/fantasy/rules",
    ]);
  });

  test("contains no duplicate destinations", () => {
    const destinations = [...fantasyPrimaryItems, ...fantasySecondaryItems].map((item) => item.to);
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  test("keeps nested player routes active without activating the hub", () => {
    expect(isFantasyRouteActive("/fantasy/players/player-42", "/fantasy/players")).toBe(true);
    expect(isFantasyRouteActive("/fantasy/players/player-42", "/fantasy")).toBe(false);
  });
});
