import { describe, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { readFileSync } from "node:fs";

import { predictionsKeys, refreshAfterScoring } from "./use-predictions-round";

const A = "10000000-0000-4000-8000-00000000000a";

/** Watches one query the way a mounted screen does; counts the reads it makes. */
function watch(client: QueryClient, queryKey: readonly unknown[]) {
  const state = { reads: 0 };
  const observer = new QueryObserver(client, {
    queryKey,
    staleTime: 5 * 60_000,
    queryFn: async () => ({ read: ++state.reads }),
  });
  const unsubscribe = observer.subscribe(() => {});
  return { state, observer, unsubscribe };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("QA-08: a mounted ranking is read again when the journée is scored again", () => {
  test("the round board, the season board and the player's own picks are read again", async () => {
    const client = new QueryClient();
    const roundBoard = watch(client, predictionsKeys.board("round", 14, A));
    const seasonBoard = watch(client, predictionsKeys.board("season", 14, A));
    const mine = watch(client, predictionsKeys.mine(A, 14));
    await settle();
    expect([roundBoard.state.reads, seasonBoard.state.reads, mine.state.reads]).toEqual([1, 1, 1]);

    refreshAfterScoring(client, A, 14);
    await settle();

    // Both boards have been fresh for five minutes: only an invalidation
    // makes them ask again.
    expect(roundBoard.state.reads).toBe(2);
    expect(seasonBoard.state.reads).toBe(2);
    expect(mine.state.reads).toBe(2);
    for (const one of [roundBoard, seasonBoard, mine]) one.unsubscribe();
  });

  test("a visitor's board and a private league's standings are read again too", async () => {
    const client = new QueryClient();
    const board = watch(client, predictionsKeys.board("round", 14, null));
    const league = watch(client, [...predictionsKeys.leagues, "l1", "standings", A]);
    await settle();

    refreshAfterScoring(client, null, 14);
    await settle();

    expect(board.state.reads).toBe(2);
    expect(league.state.reads).toBe(2);
    board.unsubscribe();
    league.unsubscribe();
  });

  test("it marks only the queries that depend on the points, and leaves every other one fresh", async () => {
    const client = new QueryClient();
    const keys = {
      board: predictionsKeys.board("round", 14, A),
      mine: predictionsKeys.mine(A, 14),
      // Another journée's picks, another player's picks, the journée itself, one fixture's read.
      mineOtherRound: predictionsKeys.mine(A, 13),
      mineOtherPlayer: predictionsKeys.mine("someone-else", 14),
      round: predictionsKeys.round(14, "fr"),
      fixture: predictionsKeys.fixture(A, "f1"),
    };
    for (const key of Object.values(keys)) client.setQueryData(key, { cached: true });

    refreshAfterScoring(client, A, 14);

    const stale = Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        client.getQueryState(key)?.isInvalidated ?? false,
      ]),
    );
    expect(stale).toEqual({
      board: true,
      mine: true,
      mineOtherRound: false,
      mineOtherPlayer: false,
      round: false,
      fixture: false,
    });
  });

  test("the page asks for the refresh whenever the journée's scoring version rises, signed in or not", () => {
    const hook = readFileSync("src/components/predictions/use-predictions-round.ts", "utf8");
    expect(hook).toMatch(/refreshAfterScoring\(\s*queryClient,\s*uid,\s*resolvedNumber\s*\)/);
    // The old guard `if (!uid || ...)` kept visitors' boards out of it.
    expect(hook).toMatch(/if \(resolvedNumber === null \|\| scoringVersion === null\) return;/);
  });
});
