import { describe, it, expect, beforeEach } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import "./__test-shim";
import { cleanupOwnedFantasyOnSignOut } from "./fantasy-signout-cleanup";
import { fantasyDraftsStore } from "./fantasy-drafts-store";
import { OWNED_FANTASY_KEY_ROOT, scopedFantasyKey } from "./fantasy-data-source";

function seed(qc: QueryClient) {
  // Owned (user-scoped) cache entries.
  qc.setQueryData(scopedFantasyKey({ source: "cloud", owner: "u1" }, "snapshot"), { v: 1 });
  qc.setQueryData(scopedFantasyKey({ source: "local", owner: "__local__" }, "snapshot"), { v: 2 });
  // Public / unrelated cache entries — MUST survive.
  qc.setQueryData(["news", "latest"], [{ id: "n1" }]);
  qc.setQueryData(["players", "public"], [{ id: "p1" }]);
  qc.setQueryData(["gameweeks"], { current: 14 });
}

describe("cleanupOwnedFantasyOnSignOut", () => {
  let qc: QueryClient;
  beforeEach(() => {
    fantasyDraftsStore.__resetAll();
    qc = new QueryClient();
    seed(qc);
  });

  it("removes owned Fantasy queries only, preserves public caches", () => {
    cleanupOwnedFantasyOnSignOut({ qc, uid: "u1" });
    // Owned removed.
    for (const q of qc.getQueryCache().getAll()) {
      const k = q.queryKey;
      expect(Array.isArray(k) && k[0] === OWNED_FANTASY_KEY_ROOT).toBe(false);
    }
    // Public survives.
    expect(qc.getQueryData(["news", "latest"])).toEqual([{ id: "n1" }]);
    expect(qc.getQueryData(["players", "public"])).toEqual([{ id: "p1" }]);
    expect(qc.getQueryData(["gameweeks"])).toEqual({ current: 14 });
  });

  it("clears the outgoing UID's drafts only", () => {
    fantasyDraftsStore.save({ uid: "u1", teamId: "new", baseVersion: 0, kind: "team" }, { a: 1 });
    fantasyDraftsStore.save({ uid: "u2", teamId: "new", baseVersion: 0, kind: "team" }, { b: 2 });
    cleanupOwnedFantasyOnSignOut({ qc, uid: "u1" });
    expect(fantasyDraftsStore.listForUid("u1")).toEqual([]);
    expect(fantasyDraftsStore.listForUid("u2").length).toBe(1);
  });

  it("with null uid: still clears owned caches, does not touch any drafts", () => {
    fantasyDraftsStore.save({ uid: "u1", teamId: "new", baseVersion: 0, kind: "team" }, { a: 1 });
    cleanupOwnedFantasyOnSignOut({ qc, uid: null });
    // Owned caches gone.
    expect(
      qc.getQueryCache().findAll({ predicate: (q) => q.queryKey[0] === OWNED_FANTASY_KEY_ROOT })
        .length,
    ).toBe(0);
    // Drafts intact (no UID to target).
    expect(fantasyDraftsStore.listForUid("u1").length).toBe(1);
  });
});
