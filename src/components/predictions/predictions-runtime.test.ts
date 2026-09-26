import { describe, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

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
    // A visitor's board, fetched while account-1's session was still being
    // read: the key names nobody, the answer has account-1's line in it.
    client.setQueryData(["predictions", "board", "round", 14, null], { me: { rank: 3 } });
    client.setQueryData(["fantasy", "public", "players"], { players: [] });

    forgetAccountPredictions(client, "account-1");

    // The account's own entries are gone...
    expect(
      client.getQueryCache().findAll({ predicate: (q) => q.queryKey.includes("account-1") }),
    ).toHaveLength(0);
    // ...and no Pronostics answer is left anywhere: the entries that name no
    // account stay (their observers may be the next session's) but empty.
    const left = client.getQueryCache().findAll({ queryKey: ["predictions"] });
    expect(left.map((q) => q.queryKey)).toEqual([
      ["predictions", "round", "current", "fr"],
      ["predictions", "board", "round", 14, null],
    ]);
    expect(left.map((q) => q.state.data)).toEqual([undefined, undefined]);
    expect(client.getQueryData(["fantasy", "public", "players"])).toEqual({ players: [] });
  });

  // Security review of 2026-09-25: every Pronostics entry was removed, the
  // ones the render that switched accounts had just built for the next
  // session included. Their reads were cancelled and the screens stayed on
  // their loading placeholders.
  test("the next session's screens get their answers: nothing they observe is removed", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // What the last account's screens had.
    client.setQueryData(["predictions", "round", "current", "fr"], { allowed: true, by: "A" });
    client.setQueryData(["predictions", "mine", "account-1", 14], { items: ["A's pick"] });

    // The next session's screens, already asking.
    const keys = [
      ["predictions", "round", "current", "fr"],
      ["predictions", "board", "round", 14, null],
      ["predictions", "mine", "account-2", 14],
    ];
    const asked: string[] = [];
    const answers = new Map<string, (value: unknown) => void>();
    const observers = keys.map(
      (queryKey) =>
        new QueryObserver(client, {
          queryKey,
          staleTime: Infinity,
          queryFn: () => {
            asked.push(JSON.stringify(queryKey));
            return new Promise((resolve) => answers.set(JSON.stringify(queryKey), resolve));
          },
        }),
    );
    const seen: unknown[] = [];
    const stops = observers.map((observer) =>
      observer.subscribe((result) => seen.push(result.data)),
    );

    forgetAccountPredictions(client, "account-1");

    // The journée is asked again with the session current now; the others go
    // on (or start over) and settle.
    expect(asked).toContain(JSON.stringify(keys[0]));
    for (const [key, answer] of answers) answer({ for: "the next session", key });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(observers.map((observer) => observer.getCurrentResult().status)).toEqual([
      "success",
      "success",
      "success",
    ]);
    // The last account's journée was never shown to the next session again.
    expect(JSON.stringify(seen)).not.toContain('"by":"A"');
    expect(client.getQueryData(["predictions", "mine", "account-1", 14])).toBeUndefined();
    stops.forEach((stop) => stop());
  });
});
