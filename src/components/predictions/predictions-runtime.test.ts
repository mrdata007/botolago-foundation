import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { leagueStandingsQuery } from "./leagues/league-queries";
import { forgetAccountPredictions } from "./predictions-runtime";

describe("account-specific Pronostics answers", () => {
  test("a private league's ranking is kept per account", () => {
    const one = leagueStandingsQuery("league-1", null, "account-1").queryKey;
    const two = leagueStandingsQuery("league-1", null, "account-2").queryKey;
    expect(one).not.toEqual(two);
    // Invalidating a league by its prefix still reaches every account's copy.
    expect(one.slice(0, 3)).toEqual(["predictions", "league", "league-1"]);
  });

  test("a change of account forgets every Pronostics answer, and nothing else", () => {
    const client = new QueryClient();
    client.setQueryData(leagueStandingsQuery("league-1", null, "account-1").queryKey, {
      members: ["someone"],
    });
    client.setQueryData(["predictions", "mine", "account-1", 14], { items: [] });
    client.setQueryData(["predictions", "round", "current", "fr"], { allowed: true });
    client.setQueryData(["fantasy", "public", "players"], { players: [] });

    forgetAccountPredictions(client);

    expect(client.getQueryCache().findAll({ queryKey: ["predictions"] })).toHaveLength(0);
    expect(client.getQueryData(["fantasy", "public", "players"])).toEqual({ players: [] });
  });
});
