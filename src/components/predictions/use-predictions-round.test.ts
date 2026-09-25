import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sessionAccountId } from "@/auth/second-factor";
import type {
  MyPredictionDto,
  PredictionFixtureDto,
  PredictionInput,
  PredictionsRoundDto,
  SavePredictionsDto,
} from "@/backend/predictions/contracts";
import type { PredictionsErrorCode } from "@/backend/predictions/errors";
import { PredictionSaveQueue } from "@/backend/predictions/save-queue";
import type { AuthSession, AuthUser } from "@/services/auth-types";
import {
  accountSaveQueue,
  awaitingScoring,
  barFor,
  nextSaveBar,
  scoringMoved,
  seedUpdatedAt,
  shownSaveState,
  type SaveQueueServices,
} from "./use-predictions-round";

const closed = (mode: "off" | "testers"): PredictionsRoundDto => ({
  schemaVersion: 1,
  mode,
  allowed: false,
  serverTime: "2026-09-24T20:00:00.000Z",
});

describe("seedUpdatedAt: the journée the server rendered, in the browser", () => {
  test("a testers-only refusal is asked again at once, with the reader's session", () => {
    // The server renders as a visitor; the owner testing in Stage 3 is not one.
    expect(seedUpdatedAt({ data: closed("testers"), updatedAt: 1_000 })).toBe(0);
  });

  test("a game switched off stays off: the answer is everyone's", () => {
    expect(seedUpdatedAt({ data: closed("off"), updatedAt: 1_000 })).toBe(1_000);
  });
});

const fixture = (id: string, flags: { final: boolean; void?: boolean }) =>
  ({ id, final: flags.final, void: flags.void ?? false }) as PredictionFixtureDto;
const saved = (fixtureId: string, resultKind: MyPredictionDto["resultKind"]): MyPredictionDto => ({
  fixtureId,
  home: 1,
  away: 0,
  submittedAt: "2026-09-24T19:00:00.000Z",
  points: resultKind === null ? null : 0,
  resultKind,
});

describe("awaitingScoring: keep asking until a finished match is scored", () => {
  test("a pick on a final match without points waits for the scoring job", () => {
    const mine = new Map([["a", saved("a", null)]]);
    expect(awaitingScoring([fixture("a", { final: true })], mine)).toBe(true);
  });

  test("a scored pick, an unfinished match, a void match or no pick do not", () => {
    expect(
      awaitingScoring([fixture("a", { final: true })], new Map([["a", saved("a", "miss")]])),
    ).toBe(false);
    expect(
      awaitingScoring([fixture("a", { final: false })], new Map([["a", saved("a", null)]])),
    ).toBe(false);
    expect(
      awaitingScoring(
        [fixture("a", { final: true, void: true })],
        new Map([["a", saved("a", null)]]),
      ),
    ).toBe(false);
    expect(awaitingScoring([fixture("a", { final: true })], new Map())).toBe(false);
  });
});

describe("scoringMoved: when a player's points must be read again", () => {
  test("a rise for the same player and journée", () => {
    expect(scoringMoved({ key: "u:14", version: 2 }, { key: "u:14", version: 3 })).toBe(true);
  });

  test("not the first sighting, not an unchanged version, not another journée or player", () => {
    expect(scoringMoved(null, { key: "u:14", version: 3 })).toBe(false);
    expect(scoringMoved({ key: "u:14", version: 3 }, { key: "u:14", version: 3 })).toBe(false);
    expect(scoringMoved({ key: "u:13", version: 2 }, { key: "u:14", version: 5 })).toBe(false);
    expect(scoringMoved({ key: "u:14", version: 2 }, { key: "v:14", version: 5 })).toBe(false);
  });
});

describe("shownSaveState: a code owed is not a failed save", () => {
  // The server's refusal of a password-only session of an account with a
  // second factor, as supabase-js hands it back.
  const stepUp = { code: "PT403", message: "mfa_required", details: null, hint: null };
  const saved = (items: readonly { fixtureId: string; home: number; away: number }[]) =>
    ({
      serverTime: "2026-09-25T20:00:00+00:00",
      results: items.map((item) => ({
        ...item,
        status: "saved",
        submittedAt: "2026-09-25T20:00:00+00:00",
      })),
    }) as SavePredictionsDto;

  test("the queue's stop on that refusal reads as step_up; the picks wait, and go on a retry", async () => {
    let refuse = true;
    let failure: PredictionsErrorCode | null = null;
    const queue = new PredictionSaveQueue({
      timers: { setTimeout: () => 0, clearTimeout: () => {} },
      // What the page's hook keeps from each refusal.
      onError: (error) => {
        failure = error.code;
      },
      send: async (items) => {
        if (refuse) throw stepUp;
        return saved(items);
      },
    });
    queue.set({ fixtureId: "f1", home: 2, away: 1 });
    await queue.flush();
    expect(queue.state).toBe("error");
    expect(shownSaveState(queue.state, failure)).toBe("step_up");
    expect(queue.pendingIds).toEqual(["f1"]);

    // The code is in: "Réessayer" sends them.
    refuse = false;
    await queue.retry();
    expect(shownSaveState(queue.state, failure)).toBe("saved");
    expect(queue.pendingIds).toEqual([]);
  });

  test("every other refusal the queue stops on is still a failed save", () => {
    const others: (PredictionsErrorCode | null)[] = [
      "data_unavailable",
      "account_banned",
      "predictions_unavailable",
      "predictions_unauthenticated",
      "predictions_invalid_payload",
      "validation_failed",
      null,
    ];
    for (const failure of others) {
      expect({ failure, shown: shownSaveState("error", failure) }).toEqual({
        failure,
        shown: "error",
      });
    }
  });

  test("a step-up already behind does not colour the states that follow it", () => {
    for (const state of ["idle", "pending", "saving", "saved", "offline"] as const) {
      expect(shownSaveState(state, "mfa_required")).toBe(state);
    }
  });
});

describe("the save bar is one account's (nextSaveBar, barFor)", () => {
  const A = "10000000-0000-4000-8000-00000000000a";
  const B = "10000000-0000-4000-8000-00000000000b";
  // A's queue stopped on a code owed: its refusal, then its state.
  const owedByA = nextSaveBar(nextSaveBar(null, A, { failure: "mfa_required" }), A, {
    state: "error",
  });

  test("the render after a switch says nothing yet, not the last account's 'Code requis'", () => {
    expect(barFor(owedByA, A)).toBe("step_up");
    // B's first render comes before the effect that makes B's queue.
    expect(barFor(owedByA, B)).toBe("idle");
    expect(barFor(null, B)).toBe("idle");
  });

  test("a queue moves its own account's bar on, and nothing of another's comes with it", () => {
    expect(nextSaveBar(owedByA, B, { state: "error" })).toEqual({
      uid: B,
      state: "error",
      failure: null,
    });
    // Within one account the last refusal stays until the next, as before.
    expect(nextSaveBar(owedByA, A, { state: "saving" })).toEqual({
      uid: A,
      state: "saving",
      failure: "mfa_required",
    });
  });

  test("a replaced queue's last flush does not speak for the bar", () => {
    // Its answer lands after the next queue has started the bar clean: the
    // hook's callbacks only write while their queue is the page's.
    const hook = readFileSync(join(import.meta.dir, "use-predictions-round.ts"), "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(hook).toContain('setSave({ uid, state: "idle", failure: null }); let speaking = true;');
    expect(hook).toContain("if (speaking) setSave((last) => nextSaveBar(last, uid, { state }));");
    expect(hook).toContain(
      "if (speaking) setSave((last) => nextSaveBar(last, uid, { failure: error.code }));",
    );
    expect(hook).toMatch(/return \(\) => \{ speaking = false;[^}]*void queue\.flush\(\);/);
    // Nothing else writes the bar.
    expect(hook.match(/setSave\(/g)).toHaveLength(3);
  });
});

describe("a queue sends its account's picks to that account only (accountSaveQueue)", () => {
  const A = "10000000-0000-4000-8000-00000000000a";
  const B = "10000000-0000-4000-8000-00000000000b";
  const signedIn = (id: string): AuthSession => ({
    user: { id } as AuthUser,
    status: "authenticated",
  });
  const pick: PredictionInput = { fixtureId: "f1", home: 2, away: 1 };

  /** One device: the session the auth service holds, the save, each account's drafts. */
  function device(initial: AuthSession) {
    let session = initial;
    const saves: Array<{ account: string | null; items: PredictionInput[] }> = [];
    const drafts = new Map<string, readonly PredictionInput[]>();
    const services: SaveQueueServices = {
      session: () => session,
      // As `predictionsService.save`: for whoever's session is current when it runs.
      save: async (items) => {
        saves.push({ account: sessionAccountId(session), items: [...items] });
        return {
          serverTime: "2026-09-25T20:00:00+00:00",
          results: items.map((item) => ({
            ...item,
            status: "saved",
            submittedAt: "2026-09-25T20:00:00+00:00",
          })),
        } as SavePredictionsDto;
      },
      drafts: (uid) => ({
        load: () => drafts.get(uid) ?? [],
        save: (items) => void drafts.set(uid, items),
      }),
    };
    return {
      services,
      saves,
      draftOf: (uid: string) => drafts.get(uid) ?? [],
      becomes: (next: AuthSession) => void (session = next),
    };
  }

  /** Timers run by hand: `due()` runs whatever has been scheduled. */
  function timersByHand() {
    const scheduled = new Map<number, () => void>();
    let next = 0;
    return {
      setTimeout: (handler: () => void) => {
        scheduled.set(++next, handler);
        return next;
      },
      clearTimeout: (handle: unknown) => void scheduled.delete(handle as number),
      due: () => {
        const handlers = [...scheduled.values()];
        scheduled.clear();
        for (const handler of handlers) handler();
      },
    };
  }

  /** The hook's effect cleanup, when the page moves to another account or away. */
  async function replace(queue: PredictionSaveQueue) {
    await queue.flush();
    queue.dispose();
  }

  test("A's unsent picks never reach another session: they stay A's draft", async () => {
    for (const other of [
      signedIn(B),
      // B, signed in but still owing its code: the token is B's all the same.
      { user: null, status: "mfa_required", pendingAccountId: B } satisfies AuthSession,
      { user: null, status: "anonymous" } satisfies AuthSession,
    ]) {
      const timers = timersByHand();
      const phone = device(signedIn(A));
      const queue = accountSaveQueue(A, { timers }, phone.services);
      queue.set(pick);
      // The session moves on (B signs in from another tab, say) before the
      // second's wait is over: the wait comes due, then the page replaces A's
      // queue.
      phone.becomes(other);
      timers.due();
      await replace(queue);
      expect({ other: other.status, saves: phone.saves, draft: phone.draftOf(A) }).toEqual({
        other: other.status,
        saves: [],
        draft: [pick],
      });
    }
  });

  test("B's queue holds none of A's picks, and A's next visit sends them, to A", async () => {
    const timers = timersByHand();
    const phone = device(signedIn(A));
    const first = accountSaveQueue(A, { timers }, phone.services);
    first.set(pick);
    phone.becomes(signedIn(B));
    await replace(first);

    const forB = accountSaveQueue(B, { timers }, phone.services);
    timers.due();
    expect(forB.pendingValue(pick.fixtureId)).toBeNull();
    await replace(forB);
    expect(phone.saves).toEqual([]);
    expect(phone.draftOf(B)).toEqual([]);

    phone.becomes(signedIn(A));
    const back = accountSaveQueue(A, { timers }, phone.services);
    timers.due();
    await back.flush();
    expect(phone.saves).toEqual([{ account: A, items: [pick] }]);
    expect(phone.draftOf(A)).toEqual([]);
  });

  test("the same account's picks go as before: on the page's last flush, and while its code is owed", async () => {
    for (const same of [
      signedIn(A),
      // Owing its code is still the account (`sessionAccountId`): the token is
      // A's, and whatever the server answers is A's to hear.
      { user: null, status: "mfa_required", pendingAccountId: A } satisfies AuthSession,
    ]) {
      const phone = device(signedIn(A));
      const queue = accountSaveQueue(A, { timers: timersByHand() }, phone.services);
      queue.set(pick);
      phone.becomes(same);
      // Leaving the page, or the page hidden: the flush sends at once.
      await replace(queue);
      expect({ same: same.status, saves: phone.saves, draft: phone.draftOf(A) }).toEqual({
        same: same.status,
        saves: [{ account: A, items: [pick] }],
        draft: [],
      });
    }
  });

  test("a save's results land in the picks of the account whose queue sent them", () => {
    // They can land after the page has moved to another account: the queue's
    // own account travels with them, never the page's.
    const hook = readFileSync(join(import.meta.dir, "use-predictions-round.ts"), "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(hook).toContain("const queue = accountSaveQueue(uid, {");
    expect(hook).toContain("applyResultsRef.current(uid, results);");
    expect(hook).toContain("(owner: string, results: readonly SaveResultDto[]) => {");
    expect(hook).toContain("predictionsKeys.mine(owner, resolvedNumber)");
    expect(hook).toContain("predictionsKeys.fixture(owner, result.fixtureId)");
    // The page's own `uid` is not in the writer at all.
    const writer = hook.slice(
      hook.indexOf("const applyResults = useCallback("),
      hook.indexOf("const applyResultsRef"),
    );
    expect(writer).not.toMatch(/\buid\b/);
  });
});
