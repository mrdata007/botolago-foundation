import { describe, it, expect, beforeEach } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import "./__test-shim";
import { cleanupOwnedFantasyOnSignOut } from "./fantasy-signout-cleanup";
import { fantasyDraftsStore } from "./fantasy-drafts-store";
import { OWNED_FANTASY_KEY_ROOT, scopedFantasyKey } from "./fantasy-data-source";

function seed(qc: QueryClient) {
  // Owned (user-scoped) cache entries: the outgoing account, an older one, and
  // the guest snapshot the signed-out screen has just started.
  qc.setQueryData(scopedFantasyKey({ source: "cloud", owner: "u1" }, "snapshot"), { v: 1 });
  qc.setQueryData(scopedFantasyKey({ source: "cloud", owner: "u0" }, "snapshot"), { v: 0 });
  qc.setQueryData(scopedFantasyKey({ source: "guest", owner: "__local__" }, "snapshot"), { v: 2 });
  // Public / unrelated cache entries — MUST survive.
  qc.setQueryData(["news", "latest"], [{ id: "n1" }]);
  qc.setQueryData(["players", "public"], [{ id: "p1" }]);
  qc.setQueryData(["gameweeks"], { current: 14 });
}

const owners = (qc: QueryClient) =>
  qc
    .getQueryCache()
    .findAll({ predicate: (q) => q.queryKey[0] === OWNED_FANTASY_KEY_ROOT })
    .map((q) => q.queryKey[2]);

describe("cleanupOwnedFantasyOnSignOut", () => {
  let qc: QueryClient;
  beforeEach(() => {
    fantasyDraftsStore.__resetAll();
    qc = new QueryClient();
    seed(qc);
  });

  it("removes every other owner's Fantasy queries, preserves public caches", () => {
    cleanupOwnedFantasyOnSignOut({ qc, uid: "u1", keepOwner: "__local__" });
    // Owned: only the incoming guest's entry is left.
    expect(owners(qc)).toEqual(["__local__"]);
    // Public survives.
    expect(qc.getQueryData(["news", "latest"])).toEqual([{ id: "n1" }]);
    expect(qc.getQueryData(["players", "public"])).toEqual([{ id: "p1" }]);
    expect(qc.getQueryData(["gameweeks"])).toEqual({ current: 14 });
  });

  it("clears the outgoing UID's drafts only", () => {
    fantasyDraftsStore.save({ uid: "u1", teamId: "new", baseVersion: 0, kind: "team" }, { a: 1 });
    fantasyDraftsStore.save({ uid: "u2", teamId: "new", baseVersion: 0, kind: "team" }, { b: 2 });
    cleanupOwnedFantasyOnSignOut({ qc, uid: "u1", keepOwner: "__local__" });
    expect(fantasyDraftsStore.listForUid("u1")).toEqual([]);
    expect(fantasyDraftsStore.listForUid("u2").length).toBe(1);
  });

  it("with null uid: still clears other owners' caches, does not touch any drafts", () => {
    fantasyDraftsStore.save({ uid: "u1", teamId: "new", baseVersion: 0, kind: "team" }, { a: 1 });
    cleanupOwnedFantasyOnSignOut({ qc, uid: null, keepOwner: "__local__" });
    // Every account's cache gone.
    expect(owners(qc)).toEqual(["__local__"]);
    // Drafts intact (no UID to target).
    expect(fantasyDraftsStore.listForUid("u1").length).toBe(1);
  });
});
