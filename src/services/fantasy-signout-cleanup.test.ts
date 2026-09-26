import { describe, it, expect, beforeEach } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import "./__test-shim";
import { cleanupOwnedFantasyOnSignOut } from "./fantasy-signout-cleanup";
import { fantasyDraftsStore } from "./fantasy-drafts-store";
import { OWNED_FANTASY_KEY_ROOT, scopedFantasyKey } from "./fantasy-data-source";

function seed(qc: QueryClient) {
  // Owned (user-scoped) cache entries.
  qc.setQueryData(scopedFantasyKey({ source: "cloud", owner: "u1" }, "snapshot"), { v: 1 });
  qc.setQueryData(scopedFantasyKey({ source: "cloud", owner: "u1" }, "summary"), { v: 3 });
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

  it("removes the outgoing owner's Fantasy queries only, preserves every other entry", () => {
    cleanupOwnedFantasyOnSignOut({ qc, uid: "u1" });
    // The outgoing owner's removed, every one of them.
    const owners = qc
      .getQueryCache()
      .getAll()
      .filter((q) => q.queryKey[0] === OWNED_FANTASY_KEY_ROOT)
      .map((q) => q.queryKey[2]);
    expect(owners).not.toContain("u1");
    // An entry of no account (the visitor's, `__local__`) is not the outgoing
    // owner's: FantasyOwnedProvider drops it once another owner takes over.
    expect(
      qc.getQueryData(scopedFantasyKey({ source: "local", owner: "__local__" }, "snapshot")),
    ).toEqual({ v: 2 });
    // Public survives.
    expect(qc.getQueryData(["news", "latest"])).toEqual([{ id: "n1" }]);
    expect(qc.getQueryData(["players", "public"])).toEqual([{ id: "p1" }]);
    expect(qc.getQueryData(["gameweeks"])).toEqual({ current: 14 });
  });

  // Security review of 2026-09-25: this ran from AuthProvider's effect, after
  // the render that switched accounts had built the next owner's queries and
  // started their reads, and it removed every owned entry. Each read was
  // cancelled and its screen stayed on the loading placeholder for good.
  it("lets the next owner's first reads finish: the incoming account's, and the visitor's", async () => {
    const next = [
      scopedFantasyKey({ source: "cloud", owner: "u2" }, "snapshot"),
      scopedFantasyKey({ source: "guest", owner: "__local__" }, "rankings", "overall", 1),
    ];
    const answers: Array<(value: { owner: unknown }) => void> = [];
    const observers = next.map(
      (queryKey) =>
        new QueryObserver(qc, {
          queryKey,
          queryFn: () => new Promise<{ owner: unknown }>((resolve) => answers.push(resolve)),
        }),
    );
    const stops = observers.map((observer) => observer.subscribe(() => {}));
    expect(answers).toHaveLength(2);

    cleanupOwnedFantasyOnSignOut({ qc, uid: "u1" });

    answers.forEach((answer, index) => answer({ owner: next[index]![2] }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      observers.map((observer) => {
        const { status, data } = observer.getCurrentResult();
        return { status, data };
      }),
    ).toEqual([
      { status: "success", data: { owner: "u2" } },
      { status: "success", data: { owner: "__local__" } },
    ]);
    stops.forEach((stop) => stop());
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
