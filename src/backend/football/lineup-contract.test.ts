import { describe, expect, test } from "bun:test";
import { lineupSchema } from "./contracts";

/**
 * `api.football_match_lineups` lists catalogue players in `players` and, from
 * 20260925170000, the players the catalogue does not know in
 * `unlistedPlayers`, by the provider's name. The page reads one list.
 */

const team = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "amal-tiznit",
  name: "Amal Tiznit",
  shortName: "Tiznit",
  code: "AMT",
  city: null,
  countryCode: "MA",
  crestUrl: null,
  crestPath: null,
  primaryColor: null,
  secondaryColor: null,
  active: true,
};
const known = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "mehdi-el-jourbaoui",
  displayName: "Mehdi El Jourbaoui",
  slot: "starting",
  position: "goalkeeper",
  shirtNumber: 1,
  order: 1,
  captain: false,
};
const payload = {
  id: "33333333-3333-4333-8333-333333333333",
  team,
  formation: "4-3-3",
  confirmed: true,
  publishedAt: null,
  players: [known],
};

describe("lineupSchema", () => {
  test("reads a lineup from before the unlisted players, unchanged", () => {
    expect(lineupSchema.parse(payload).players).toEqual([known]);
  });

  test("puts the unlisted players in the one list, in the provider's order, without a page", () => {
    const lineup = lineupSchema.parse({
      ...payload,
      unlistedPlayers: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          displayName: "Anonymous Sub",
          slot: "bench",
          position: null,
          shirtNumber: null,
          order: 1,
          captain: false,
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          displayName: "Soufiane El Azhari",
          slot: "starting",
          position: "forward",
          shirtNumber: 9,
          order: 2,
          captain: false,
        },
      ],
    });
    expect(lineup.players.map((player) => [player.displayName, player.slot, player.slug])).toEqual([
      ["Mehdi El Jourbaoui", "starting", "mehdi-el-jourbaoui"],
      ["Soufiane El Azhari", "starting", null],
      ["Anonymous Sub", "bench", null],
    ]);
    expect(lineup).not.toHaveProperty("unlistedPlayers");
  });

  test("still refuses a malformed unlisted player", () => {
    expect(() =>
      lineupSchema.parse({ ...payload, unlistedPlayers: [{ ...known, displayName: "" }] }),
    ).toThrow();
  });
});
