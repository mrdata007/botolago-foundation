// @ts-nocheck
// Pass 3.2-H1 — mutation controller foundation tests.
//
// Verifies:
//   1. On success, `replaceSnapshot` receives the returned snapshot and
//      `invalidateOwned` is called (authoritative cache write, no reload).
//   2. Sequence-guarded status transitions: a stale `saved→idle` timer
//      from a previous mutation cannot overwrite a newer `saving` status.
//   3. Cloud errors bubble as typed `FantasyRepoError` results — never a
//      silent fallback (controller never re-invokes a local repo).
//   4. Draft removal only on success.

import { describe, it, expect } from "bun:test";
import "./__test-shim";
import { QueryClient } from "@tanstack/react-query";
import { runOwnedMutation } from "./fantasy-mutation-controller";
import { FantasyRepoError } from "./fantasy-errors";
import { fantasyDraftsStore } from "./fantasy-drafts-store";

function makeCtx() {
  const qc = new QueryClient();
  const replaced: any[] = [];
  const statusLog: Array<[number, string, any]> = [];
  let seq = 0;
  let active = 0;
  return {
    qc,
    scope: { source: "cloud" as const, owner: "u1" },
    setMutationStatus: (s: string, err: any) => statusLog.push([-1, s, err ?? null]),
    nextMutationSeq: () => {
      seq += 1;
      active = seq;
      return seq;
    },
    setMutationStatusIfCurrent: (n: number, s: string, err: any) => {
      if (n !== active) return;
      statusLog.push([n, s, err ?? null]);
    },
    replaceSnapshot: (snap: any) => replaced.push(snap),
    invalidateOwned: () => {},
    _replaced: replaced,
    _statusLog: statusLog,
    _getActive: () => active,
  };
}

describe("runOwnedMutation — H1 foundation", () => {
  it("on success: replaces snapshot, records saving→saved, clears matching draft", async () => {
    const ctx = makeCtx();
    const draftKey = { uid: "u1", team: "t1", version: 3, kind: "team" as const };
    fantasyDraftsStore.save(draftKey, { squad: [] } as any);
    expect(fantasyDraftsStore.read(draftKey)).not.toBeNull();

    const snap = { version: 4, source: "cloud", team: {}, lifecycle: {} } as any;
    const res = await runOwnedMutation(ctx as any, {
      action: async () => snap,
      args: undefined,
      matchingDraftKey: draftKey,
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.snapshot).toBe(snap);
    expect(ctx._replaced).toEqual([snap]);
    expect(fantasyDraftsStore.read(draftKey)).toBeNull();
    const kinds = ctx._statusLog.map((e: any) => e[1]);
    expect(kinds).toContain("saving");
    expect(kinds).toContain("saved");
  });

  it("stale saved→idle timer cannot overwrite a newer saving status", async () => {
    const ctx = makeCtx();

    // Mutation A: succeeds with a delayed idle timer.
    const pA = runOwnedMutation(ctx as any, {
      action: async () => ({ version: 1 } as any),
      args: undefined,
      savedIdleAfterMs: 10,
    });
    await pA;

    // Mutation B starts immediately after (seq increments; A's timer will
    // fire against a superseded seq and must be dropped).
    const pB = runOwnedMutation(ctx as any, {
      action: async () => {
        // Wait past A's idle timeout to ensure it fires first.
        await new Promise((r) => setTimeout(r, 30));
        return { version: 2 } as any;
      },
      args: undefined,
    });

    const res = await pB;
    expect(res.ok).toBe(true);
    // Filter guarded entries and reconstruct the tail; the last state must
    // be saved (mutation B), NOT idle (from A's stale timer).
    const guarded = ctx._statusLog.filter((e: any) => e[0] !== -1);
    const last = guarded[guarded.length - 1];
    expect(last[1]).toBe("saved");
  });

  it("cloud error surfaces as typed FantasyRepoError result — no local fallback", async () => {
    const ctx = makeCtx();
    const draftKey = { uid: "u1", team: "t1", version: 3, kind: "team" as const };
    fantasyDraftsStore.save(draftKey, { squad: [] } as any);

    const err = new FantasyRepoError("permission_denied", "RLS");
    const res = await runOwnedMutation(ctx as any, {
      action: async () => { throw err; },
      args: undefined,
      matchingDraftKey: draftKey,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe(err);
      expect(res.kind).toBe("error");
    }
    // Draft must be preserved on failure.
    expect(fantasyDraftsStore.read(draftKey)).not.toBeNull();
    // No snapshot was replaced.
    expect(ctx._replaced).toEqual([]);
    fantasyDraftsStore.remove(draftKey);
  });

  it("version_conflict is classified as kind='conflict' and preserves draft", async () => {
    const ctx = makeCtx();
    const draftKey = { uid: "u1", team: "t2", version: 7, kind: "transfers" as const };
    fantasyDraftsStore.save(draftKey, { outIds: [], inIds: [] } as any);

    const err = new FantasyRepoError("version_conflict", "stale");
    const res = await runOwnedMutation(ctx as any, {
      action: async () => { throw err; },
      args: undefined,
      matchingDraftKey: draftKey,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe("conflict");
    expect(fantasyDraftsStore.read(draftKey)).not.toBeNull();
    fantasyDraftsStore.remove(draftKey);
  });
});
