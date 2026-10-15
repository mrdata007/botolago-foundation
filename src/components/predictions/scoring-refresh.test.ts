import { describe, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { readFileSync } from "node:fs";

import type { AuthSession, AuthUser } from "@/services/auth-types";
import type { PredictionInput } from "@/backend/predictions/contracts";
import {
  accountSaveQueue,
  predictionsKeys,
  refreshAfterScoring,
  type SaveQueueServices,
} from "./use-predictions-round";

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
    const roundBoard = watch(client, ["predictions", "board", "round", 14, A]);
    const seasonBoard = watch(client, ["predictions", "board", "season", "season", A]);
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
    roundBoard.unsubscribe();
    seasonBoard.unsubscribe();
    mine.unsubscribe();
  });

  test("a visitor's board is read again too, and nothing else is touched", async () => {
    const client = new QueryClient();
    const board = watch(client, ["predictions", "board", "round", 14, null]);
    const round = watch(client, predictionsKeys.round(14, "fr"));
    const other = watch(client, ["predictions", "league", "l1", "standings"]);
    await settle();

    refreshAfterScoring(client, null, 14);
    await settle();

    expect(board.state.reads).toBe(2);
    // The journée itself is what told us; the leagues have their own refresh.
    expect(round.state.reads).toBe(1);
    expect(other.state.reads).toBe(1);
    board.unsubscribe();
    round.unsubscribe();
    other.unsubscribe();
  });

  test("the refresh leaves the reader's unsent picks where they were", async () => {
    const pick: PredictionInput = { fixtureId: "f1", home: 2, away: 1 };
    const drafts = new Map<string, readonly PredictionInput[]>();
    const services: SaveQueueServices = {
      session: () => ({ user: { id: A } as AuthUser, status: "authenticated" }) as AuthSession,
      save: async () => {
        throw new Error("nothing may be sent by a refresh");
      },
      drafts: (uid) => ({
        load: () => drafts.get(uid) ?? [],
        save: (items) => void drafts.set(uid, items),
      }),
    };
    const queue = accountSaveQueue(
      A,
      { timers: { setTimeout: () => 1, clearTimeout: () => {} } },
      services,
    );
    queue.set(pick);

    const client = new QueryClient();
    const board = watch(client, ["predictions", "board", "round", 14, A]);
    await settle();
    refreshAfterScoring(client, A, 14);
    await settle();

    expect(board.state.reads).toBe(2);
    expect(queue.pendingValue("f1")).toEqual({ home: 2, away: 1 });
    queue.dispose();
    board.unsubscribe();
  });

  test("the page asks for the refresh whenever the journée's scoring version rises, signed in or not", () => {
    const hook = readFileSync("src/components/predictions/use-predictions-round.ts", "utf8")
      .replace(/\s+/g, " ")
      .trim();
    expect(hook).toContain("refreshAfterScoring(queryClient, uid, resolvedNumber)");
    // The old guard `if (!uid || ...)` kept visitors' boards out of it.
    expect(hook).toContain("if (resolvedNumber === null || scoringVersion === null) return;");
  });
});
