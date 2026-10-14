import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { MatchVoteInput, MatchVotesDto } from "@/backend/predictions/contracts";
import type { GuestVotesState } from "@/backend/predictions/guest-votes";
import type { ClaimGuestPredictionsDto, ClaimStatus } from "@/backend/predictions/contracts";
import {
  emptyGuestStore,
  GuestPredictionStore,
  type GuestPrediction,
  type KeyValueStorage,
} from "@/backend/predictions/guest-store";
import {
  claimHeldFixtures,
  claimRetryable,
  claimStatusFor,
  staleAfterImport,
  createGuestClaimController,
  sendGuestVotesOnSignIn,
  type GuestClaimServices,
  type GuestClaimSummary,
  type GuestVoteImportServices,
} from "./guest-claim";

const FIRST = "00000020-0000-4000-8000-000000000001";
const SECOND = "00000020-0000-4000-8000-000000000002";

function phone(initialAccount: string | null = "A") {
  let account = initialAccount;
  let release: () => void = () => undefined;
  const firstAnswer = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: { account: string | null; item: MatchVoteInput }[] = [];
  const remaining: GuestVotesState = {
    [FIRST]: { winner: "home" },
    [SECOND]: { winner: "away" },
  };
  const services: GuestVoteImportServices = {
    accountId: () => account,
    read: () => remaining,
    forget: (items) => {
      for (const item of items) delete remaining[item.fixtureId];
    },
    send: async (item) => {
      sent.push({ account, item });
      if (sent.length === 1) await firstAnswer;
      return {} as MatchVotesDto;
    },
  };
  return {
    services,
    sent,
    remaining,
    release,
    becomes: (next: string | null) => {
      account = next;
    },
  };
}

describe("guest vote import belongs to the account that began it", () => {
  for (const nextAccount of ["B", null]) {
    test(`stops after the pending answer when A becomes ${nextAccount ?? "signed out"}`, async () => {
      const device = phone();
      const client = new QueryClient();
      const importing = sendGuestVotesOnSignIn(client, device.services);
      expect(device.sent).toHaveLength(1);
      device.becomes(nextAccount);
      device.release();
      await importing;
      expect(device.sent.map(({ account }) => account)).toEqual(["A"]);
      expect(Object.keys(device.remaining)).toEqual([SECOND]);
      // The unsent vote is still available when the original account returns.
      device.becomes("A");
      await sendGuestVotesOnSignIn(client, device.services);
      expect(device.sent.map(({ account }) => account)).toEqual(["A", "A"]);
      expect(device.remaining).toEqual({});
      client.clear();
    });
  }

  test("sends every vote once when the account stays the same", async () => {
    const device = phone();
    const client = new QueryClient();
    const importing = sendGuestVotesOnSignIn(client, device.services);
    const duplicate = sendGuestVotesOnSignIn(client, device.services);
    expect(duplicate).toBe(importing);
    device.release();
    await importing;
    expect(device.sent.map(({ account }) => account)).toEqual(["A", "A"]);
    expect(device.remaining).toEqual({});
    client.clear();
  });

  test("does not consume a guest's votes before authentication", async () => {
    const device = phone(null);
    const client = new QueryClient();
    await sendGuestVotesOnSignIn(client, device.services);
    expect(device.sent).toEqual([]);
    expect(Object.keys(device.remaining)).toEqual([FIRST, SECOND]);
    client.clear();
  });
});

const SEASON = "00000030-0000-4000-8000-000000000001";
const fx = (n: number) => `00000031-0000-4000-8000-00000000000${n}`;
const team = (n: number) => `00000032-0000-4000-8000-00000000000${n}`;

function guestPick(n: number): GuestPrediction {
  return {
    fixtureId: fx(n),
    home: 2,
    away: 2,
    homeTeamId: team(1),
    awayTeamId: team(2),
    roundNumber: 1,
    kickoffAt: `2026-11-0${n}T18:00:00.000Z`,
    savedAt: "2026-10-30T10:00:00.000Z",
  };
}

const answer = (statuses: Record<string, ClaimStatus>): ClaimGuestPredictionsDto => ({
  serverTime: "2026-11-01T10:00:00.000Z",
  imported: Object.values(statuses).filter((status) => status === "imported").length,
  keptExisting: Object.values(statuses).filter((status) => status === "kept").length,
  started: Object.values(statuses).filter((status) => status === "started").length,
  invalid: 0,
  results: Object.entries(statuses).map(([fixtureId, status]) => ({ fixtureId, status })),
});

type Reply = ClaimGuestPredictionsDto | Error;

/** A phone with two guest picks, a scripted server, and timers that wait to be fired by hand. */
function claimPhone(replies: Reply[], initialAccount: string | null = "A") {
  let account = initialAccount;
  const memory = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  };
  const store = new GuestPredictionStore(storage);
  store.upsert(SEASON, guestPick(1));
  store.upsert(SEASON, guestPick(2));
  const sent: { account: string | null; ids: string[] }[] = [];
  const reports: GuestClaimSummary[] = [];
  const waits: { ms: number; fire: () => void; cancelled: boolean }[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const services: GuestClaimServices = {
    enabled: true,
    accountId: () => account,
    pending: () => store.forClaim(SEASON),
    send: async (items) => {
      sent.push({ account, ids: items.map((item) => item.fixtureId) });
      if (hold) {
        hold = false;
        await new Promise<void>((resolve) => (release = resolve));
      }
      const reply = replies.shift();
      if (!reply) throw new Error("no scripted reply");
      if (reply instanceof Error) throw reply;
      return reply;
    },
    apply: (result) => void store.applyClaim(result.results),
    now: () => 1_000,
    report: (summary) => void reports.push(summary),
    schedule: (run, ms) => {
      const wait = { ms, fire: run, cancelled: false };
      waits.push(wait);
      return () => {
        wait.cancelled = true;
      };
    },
  };
  return {
    services,
    store,
    sent,
    reports,
    waits,
    becomes: (next: string | null) => {
      account = next;
    },
    holdNextSend: () => {
      hold = true;
    },
    releaseSend: () => release?.(),
    stored: () => Object.keys(store.read().predictions).sort(),
    fireLastWait: () => waits.at(-1)?.fire(),
  };
}

const offline = () => new TypeError("Failed to fetch");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a failed guest import is visible, bounded and retryable (QA-05)", () => {
  test("a network failure is reported with how many picks remain, and nothing leaves the phone", async () => {
    const phone = claimPhone([offline()]);
    const claim = createGuestClaimController(phone.services, [1_000, 4_000]);
    await claim.start();
    expect(claim.getStatus()).toMatchObject({
      phase: "failed",
      owner: "A",
      remaining: 2,
      code: "network",
    });
    // The phone still holds both picks: nothing is dropped before the server confirms.
    expect(phone.stored()).toEqual([fx(1), fx(2)]);
    expect(phone.reports).toEqual([]);
  });

  test("it tries again by itself after a wait, and the retry imports and clears the phone", async () => {
    const phone = claimPhone([offline(), answer({ [fx(1)]: "imported", [fx(2)]: "imported" })]);
    const claim = createGuestClaimController(phone.services, [1_000, 4_000]);
    await claim.start();
    expect(claim.getStatus()).toMatchObject({ phase: "failed", retrying: true });
    expect(phone.waits.map((wait) => wait.ms)).toEqual([1_000]);
    phone.fireLastWait();
    await settle();
    expect(claim.getStatus()).toMatchObject({ phase: "done", imported: 2, started: 0 });
    expect(phone.stored()).toEqual([]);
    expect(phone.reports).toEqual([{ imported: 2, keptExisting: 0, started: 0 }]);
  });

  test("automatic attempts are bounded; after them only the reader's retry sends again", async () => {
    const phone = claimPhone([
      offline(),
      offline(),
      offline(),
      answer({ [fx(1)]: "imported", [fx(2)]: "imported" }),
    ]);
    const claim = createGuestClaimController(phone.services, [1_000, 4_000]);
    await claim.start();
    phone.fireLastWait();
    await settle();
    phone.fireLastWait();
    await settle();
    // Three requests, a 1s then a 4s wait, and then it stops by itself.
    expect(phone.sent).toHaveLength(3);
    expect(phone.waits.map((wait) => wait.ms)).toEqual([1_000, 4_000]);
    expect(claim.getStatus()).toMatchObject({ phase: "failed", remaining: 2, retrying: false });
    expect(phone.stored()).toEqual([fx(1), fx(2)]);
    // The reader's "Réessayer".
    await claim.start();
    expect(phone.sent).toHaveLength(4);
    expect(claim.getStatus()).toMatchObject({ phase: "done", imported: 2 });
    expect(phone.stored()).toEqual([]);
  });

  test("a refusal that asking again cannot change is not retried by itself", async () => {
    for (const message of ["account_banned", "predictions_unavailable", "validation_failed"]) {
      const phone = claimPhone([new Error(message)]);
      const claim = createGuestClaimController(phone.services, [1_000, 4_000]);
      await claim.start();
      expect(claim.getStatus()).toMatchObject({ phase: "failed", code: message, retrying: false });
      expect(phone.waits).toEqual([]);
      expect(phone.stored()).toEqual([fx(1), fx(2)]);
    }
    expect(claimRetryable("network")).toBe(true);
    expect(claimRetryable("data_unavailable")).toBe(true);
    expect(claimRetryable("account_banned")).toBe(false);
    expect(claimRetryable("mfa_required")).toBe(false);
  });

  test("a match that had started is reported and never imported late; the others are saved", async () => {
    const phone = claimPhone([answer({ [fx(1)]: "imported", [fx(2)]: "started" })]);
    const claim = createGuestClaimController(phone.services);
    await claim.start();
    expect(claim.getStatus()).toMatchObject({ phase: "done", imported: 1, started: 1 });
    expect(phone.reports).toEqual([{ imported: 1, keptExisting: 0, started: 1 }]);
    // The started pick stays on the phone, marked, and is not sent again.
    expect(phone.stored()).toEqual([fx(2)]);
    expect(phone.store.read().notCounted).toEqual([fx(2)]);
    await claim.start();
    expect(phone.sent).toHaveLength(1);
  });

  test("an existing account pick is kept by the server; the guest copy goes, nothing else is sent", async () => {
    const phone = claimPhone([answer({ [fx(1)]: "kept", [fx(2)]: "imported" })]);
    const claim = createGuestClaimController(phone.services);
    await claim.start();
    expect(phone.reports).toEqual([{ imported: 1, keptExisting: 1, started: 0 }]);
    // Only the guest picks go out (latest match first), under the signed-in account.
    expect(phone.sent).toEqual([{ account: "A", ids: [fx(2), fx(1)] }]);
    expect(phone.stored()).toEqual([]);
  });

  test("asking twice while an import is under way sends once", async () => {
    const phone = claimPhone([answer({ [fx(1)]: "imported", [fx(2)]: "imported" })]);
    phone.holdNextSend();
    const claim = createGuestClaimController(phone.services);
    const first = claim.start();
    const second = claim.start();
    expect(second).toBe(first);
    phone.releaseSend();
    await first;
    expect(phone.sent).toHaveLength(1);
  });

  test("a retry the reader asks for replaces a waiting automatic one", async () => {
    const phone = claimPhone([offline(), answer({ [fx(1)]: "imported", [fx(2)]: "imported" })]);
    const claim = createGuestClaimController(phone.services, [1_000, 4_000]);
    await claim.start();
    const waiting = phone.waits[0]!;
    await claim.start();
    expect(waiting.cancelled).toBe(true);
    expect(phone.sent).toHaveLength(2);
    expect(claim.getStatus()).toMatchObject({ phase: "done" });
  });

  test("a waiting attempt for an account that has left is dropped, never sent to the next one", async () => {
    const phone = claimPhone([offline(), answer({ [fx(1)]: "imported", [fx(2)]: "imported" })]);
    const claim = createGuestClaimController(phone.services, [1_000, 4_000]);
    await claim.start();
    phone.becomes("B");
    phone.fireLastWait();
    await settle();
    expect(phone.sent).toHaveLength(1);
    expect(claim.getStatus()).toEqual({ phase: "idle" });
    expect(phone.stored()).toEqual([fx(1), fx(2)]);
    // B's own sign-in starts B's import.
    await claim.start();
    expect(phone.sent.map((entry) => entry.account)).toEqual(["A", "B"]);
  });

  test("the account that signs in while another's import is under way gets its own afterwards", async () => {
    const phone = claimPhone([answer({ [fx(1)]: "imported" }), answer({ [fx(2)]: "imported" })]);
    phone.holdNextSend();
    const claim = createGuestClaimController(phone.services);
    const first = claim.start();
    phone.becomes("B");
    const second = claim.start();
    expect(second).not.toBe(first);
    phone.releaseSend();
    await first;
    await second;
    expect(phone.sent.map((entry) => entry.account)).toEqual(["A", "B"]);
    expect(phone.stored()).toEqual([]);
  });

  test("signed out, or with nothing on the phone, it sends nothing", async () => {
    const signedOut = claimPhone([], null);
    await createGuestClaimController(signedOut.services).start();
    expect(signedOut.sent).toEqual([]);
    const empty = claimPhone([]);
    empty.store.clear();
    await createGuestClaimController(empty.services).start();
    expect(empty.sent).toEqual([]);
  });

  test("the screen only reads a status about the account that is signed in", () => {
    const failed = {
      phase: "failed",
      owner: "A",
      remaining: 2,
      code: "network",
      retrying: false,
    } as const;
    expect(claimStatusFor(failed, "A")).toBe(failed);
    expect(claimStatusFor(failed, "B")).toEqual({ phase: "idle" });
    expect(claimStatusFor(failed, null)).toEqual({ phase: "idle" });
  });
});

describe("what the guest import holds back on screen (review)", () => {
  const guestState = (ids: string[], notCounted: string[] = []) => ({
    ...emptyGuestStore(SEASON),
    predictions: Object.fromEntries(ids.map((id, i) => [id, guestPick(i + 1)])),
    notCounted,
  });
  const failed = {
    phase: "failed",
    owner: "A",
    remaining: 2,
    code: "network",
    retrying: false,
  } as const;
  const pending = { phase: "pending", owner: "A", attempt: 1, remaining: 2 } as const;

  test("while pending or failed, the phone's importable picks are held; started ones are not", () => {
    const state = guestState([fx(1), fx(2)], [fx(2)]);
    expect([...claimHeldFixtures(pending, state)]).toEqual([fx(1)]);
    expect([...claimHeldFixtures(failed, state)]).toEqual([fx(1)]);
  });

  test("nothing is held when idle or done", () => {
    const state = guestState([fx(1)]);
    expect(claimHeldFixtures({ phase: "idle" }, state).size).toBe(0);
    const done = {
      phase: "done",
      owner: "A",
      imported: 1,
      keptExisting: 0,
      started: 0,
      appliedAt: 5,
    } as const;
    expect(claimHeldFixtures(done, state).size).toBe(0);
  });

  test("reads older than the import's answer are stale only while being read again", () => {
    const done = {
      phase: "done",
      owner: "A",
      imported: 1,
      keptExisting: 0,
      started: 0,
      appliedAt: 5_000,
    } as const;
    expect(staleAfterImport(done, 4_000, true)).toBe(true);
    // Fresh read, or no read running (a failed one): back to normal, never stuck.
    expect(staleAfterImport(done, 6_000, true)).toBe(false);
    expect(staleAfterImport(done, 4_000, false)).toBe(false);
    // Nothing changed on the account: nothing to wait for.
    expect(staleAfterImport({ ...done, imported: 0, keptExisting: 0 }, 4_000, true)).toBe(false);
    expect(staleAfterImport({ phase: "idle" }, 0, true)).toBe(false);
  });

  test("a partial answer that names none of the sent matches stops the run: one request, not five", async () => {
    const phone = claimPhone([
      answer({ [fx(9)]: "imported" }),
      answer({ [fx(9)]: "imported" }),
      answer({ [fx(9)]: "imported" }),
    ]);
    const claim = createGuestClaimController(phone.services);
    await claim.start();
    expect(phone.sent).toHaveLength(1);
    expect(claim.getStatus()).toMatchObject({ phase: "failed", remaining: 2, retrying: false });
    expect(phone.stored()).toEqual([fx(1), fx(2)]);
  });

  test("a partial answer that does name some of them goes on with the rest", async () => {
    const phone = claimPhone([answer({ [fx(2)]: "imported" }), answer({ [fx(1)]: "imported" })]);
    const claim = createGuestClaimController(phone.services);
    await claim.start();
    expect(phone.sent.map((entry) => entry.ids)).toEqual([[fx(2), fx(1)], [fx(1)]]);
    expect(claim.getStatus()).toMatchObject({ phase: "done", imported: 2 });
  });
});
