import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sessionAccountId } from "@/auth/second-factor";
import type {
  MyPredictionDto,
  MyPredictionsDto,
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
  applySavedPredictions,
  predictionsKeys,
  awaitingScoring,
  barFor,
  canEditPicks,
  fixturePersonalState,
  nextPick,
  nextSaveBar,
  personalReadState,
  pickIsUnknown,
  scoringMoved,
  seedUpdatedAt,
  shownSaveState,
  stepPick,
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
});

describe("save responses after navigating to another round", () => {
  function cache() {
    const client = new QueryClient();
    for (const number of [1, 2]) {
      client.setQueryData(predictionsKeys.round(number, "fr"), {
        allowed: true,
        round: { number },
        fixtures: [{ id: `fixture-${number}` }],
      });
      for (const owner of ["A", "B"])
        client.setQueryData(predictionsKeys.mine(owner, number), {
          items: [],
          summary: { predicted: 0 },
        });
    }
    return client;
  }
  const result = (number: number) => ({
    fixtureId: `fixture-${number}`,
    home: 2,
    away: 1,
    status: "saved" as const,
    submittedAt: "2026-10-06T12:00:00Z",
  });
  const items = (client: QueryClient, owner: string, number: number) =>
    client.getQueryData<MyPredictionsDto>(predictionsKeys.mine(owner, number))!.items;

  test("a late round-one save updates round one, leaving round two and another account alone", () => {
    const client = cache();
    applySavedPredictions(client, "A", [result(1)]);
    expect(items(client, "A", 1)).toMatchObject([{ fixtureId: "fixture-1", home: 2 }]);
    expect(items(client, "A", 2)).toEqual([]);
    expect(items(client, "B", 1)).toEqual([]);
    client.clear();
  });

  test("one queued batch can update multiple rounds", () => {
    const client = cache();
    applySavedPredictions(client, "A", [result(1), result(2)]);
    expect(items(client, "A", 1).map((item) => item.fixtureId)).toEqual(["fixture-1"]);
    expect(items(client, "A", 2).map((item) => item.fixtureId)).toEqual(["fixture-2"]);
    client.clear();
  });

  test("restored drafts for uncached rounds invalidate the owner's reads without guessing", () => {
    const client = cache();
    applySavedPredictions(client, "A", [result(3)]);
    expect(items(client, "A", 1)).toEqual([]);
    expect(items(client, "A", 2)).toEqual([]);
    expect(client.getQueryState(predictionsKeys.mine("A", 1))?.isInvalidated).toBe(true);
    expect(client.getQueryState(predictionsKeys.mine("B", 1))?.isInvalidated).toBe(false);
    client.clear();
  });

  test("a response after sign-out does not recreate the outgoing account's cache", () => {
    const client = cache();
    client.removeQueries({ queryKey: ["predictions", "mine", "A"] });
    applySavedPredictions(client, "A", [result(1)]);
    expect(client.getQueryData(predictionsKeys.mine("A", 1))).toBeUndefined();
    expect(items(client, "B", 1)).toEqual([]);
    client.clear();
  });
});

describe("the reader's own picks are read apart from the journée (QA-01)", () => {
  const read = (over: Partial<Parameters<typeof personalReadState>[0]> = {}) =>
    personalReadState({
      signedIn: true,
      roundResolved: true,
      hasData: false,
      hasError: false,
      ...over,
    });

  test("a signed-in reader is loading until their picks arrive, not 'ready with none'", () => {
    expect(read()).toBe("loading");
    expect(read({ hasData: true })).toBe("ready");
  });

  test("a failed first read is 'failed', never 'ready' or 'absent'", () => {
    expect(read({ hasError: true })).toBe("failed");
  });

  test("picks already read stay known while read again, and when that second read fails", () => {
    expect(read({ hasData: true, hasError: true })).toBe("ready");
  });

  test("an account switch starts unknown again: the new account has no data yet", () => {
    // The query key carries the account, so B starts with hasData false.
    expect(read({ hasData: true })).toBe("ready");
    expect(read({ hasData: false })).toBe("loading");
  });

  test("a visitor, or a screen with no journée yet, has nothing to wait for", () => {
    expect(read({ signedIn: false })).toBe("not_needed");
    expect(read({ roundResolved: false })).toBe("not_needed");
  });

  test("editing waits for loading and failed, and only those", () => {
    expect(canEditPicks("loading")).toBe(false);
    expect(canEditPicks("failed")).toBe(false);
    expect(canEditPicks("ready")).toBe(true);
    expect(canEditPicks("not_needed")).toBe(true);
  });

  test("a missing pick is unknown while the read is open or failed, absent once it is ready", () => {
    expect(pickIsUnknown("loading", null)).toBe(true);
    expect(pickIsUnknown("failed", null)).toBe(true);
    expect(pickIsUnknown("ready", null)).toBe(false);
    expect(pickIsUnknown("not_needed", null)).toBe(false);
    // A draft the reader already typed is a pick, not an unknown.
    expect(pickIsUnknown("failed", { home: 1, away: 0 })).toBe(false);
  });

  test("one tap from an unseen 2-2 cannot become 1-0 while the read is unresolved", () => {
    // The old behaviour: with the saved 2-2 unread, the missing pick starts at 0-0.
    expect(nextPick(null, "home", 1)).toEqual({ home: 1, away: 0 });
    for (const state of ["loading", "failed"] as const) {
      expect(stepPick(state, null, "home", 1)).toBeNull();
      expect(stepPick(state, null, "away", -1)).toBeNull();
      // Not even a pending draft the reader typed is stepped over unseen picks.
      expect(stepPick(state, { home: 1, away: 0 }, "home", 1)).toBeNull();
    }
  });

  test("once the read has resolved, a tap steps from the real saved score", () => {
    expect(stepPick("ready", { home: 2, away: 2 }, "home", 1)).toEqual({ home: 3, away: 2 });
    expect(stepPick("ready", null, "home", 1)).toEqual({ home: 1, away: 0 });
    expect(stepPick("not_needed", null, "away", 1)).toEqual({ home: 0, away: 1 });
  });
});

describe("a session still loading is not a visitor (QA-01 review)", () => {
  const base = { signedIn: false, roundResolved: true, hasData: false, hasError: false };

  test("while auth is loading, picks are unknown and editing is off, signed in or not yet", () => {
    // Every page load, and while one account replaces another, uid is null.
    expect(personalReadState({ ...base, authLoading: true })).toBe("loading");
    expect(canEditPicks(personalReadState({ ...base, authLoading: true }))).toBe(false);
    // Even with a previous account's data in hand.
    expect(personalReadState({ ...base, signedIn: true, hasData: true, authLoading: true })).toBe(
      "loading",
    );
  });

  test("once the session has settled as signed out, the visitor edits their phone's picks", () => {
    expect(personalReadState({ ...base, authLoading: false })).toBe("not_needed");
    expect(canEditPicks(personalReadState({ ...base }))).toBe(true);
  });

  test("while the account's picks are read again after the guest import, editing waits", () => {
    const signedIn = { ...base, signedIn: true, hasData: true };
    expect(personalReadState({ ...signedIn, staleAfterImport: true })).toBe("loading");
    expect(personalReadState({ ...signedIn, staleAfterImport: false })).toBe("ready");
  });
});

describe("a match the guest import may still change is unknown (QA-01/QA-05 review)", () => {
  const held = new Set(["fx-held"]);

  test("a held match is loading even when the screen's picks are ready", () => {
    expect(fixturePersonalState("ready", held, "fx-held")).toBe("loading");
    expect(fixturePersonalState("ready", held, "fx-other")).toBe("ready");
  });

  test("it cannot be stepped, so one tap cannot write 1-0 over a guest 2-2 the server may keep", () => {
    expect(stepPick(fixturePersonalState("ready", held, "fx-held"), null, "home", 1)).toBeNull();
    expect(stepPick(fixturePersonalState("ready", held, "fx-other"), null, "home", 1)).toEqual({
      home: 1,
      away: 0,
    });
  });

  test("the save guard in setPick is this same gate", () => {
    const writable = (state: Parameters<typeof canEditPicks>[0], id: string) =>
      canEditPicks(fixturePersonalState(state, held, id));
    expect(writable("ready", "fx-held")).toBe(false);
    expect(writable("failed", "fx-other")).toBe(false);
    expect(writable("loading", "fx-other")).toBe(false);
    expect(writable("ready", "fx-other")).toBe(true);
    expect(writable("not_needed", "fx-other")).toBe(true);
  });
});
