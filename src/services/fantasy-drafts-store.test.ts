import { describe, it, expect, beforeEach } from "bun:test";
import "./__test-shim";
import { fantasyDraftsStore, flattenDraftKey, type FantasyDraftKey } from "./fantasy-drafts-store";

beforeEach(() => {
  fantasyDraftsStore.__resetAll();
});

function k(over: Partial<FantasyDraftKey> = {}): FantasyDraftKey {
  return { uid: "u1", teamId: "new", baseVersion: 0, kind: "team", ...over };
}

describe("fantasyDraftsStore — key scoping", () => {
  it("flattenDraftKey is deterministic and unique across fields", () => {
    const a = flattenDraftKey(k());
    const b = flattenDraftKey(k({ uid: "u2" }));
    const c = flattenDraftKey(k({ teamId: "team-42" }));
    const d = flattenDraftKey(k({ baseVersion: 3 }));
    const e = flattenDraftKey(k({ kind: "transfers" }));
    expect(new Set([a, b, c, d, e]).size).toBe(5);
  });

  it("saves and reads round-trip", () => {
    fantasyDraftsStore.save(k(), { formation: "4-3-3", note: "wip" });
    const e = fantasyDraftsStore.read<{ formation: string; note: string }>(k());
    expect(e).not.toBeNull();
    expect(e!.payload.formation).toBe("4-3-3");
    expect(e!.payload.note).toBe("wip");
  });

  it("returns null for a different UID (isolation)", () => {
    fantasyDraftsStore.save(k({ uid: "u1" }), { x: 1 });
    expect(fantasyDraftsStore.read(k({ uid: "u2" }))).toBeNull();
  });

  it("returns null for a different baseVersion (version-scoped)", () => {
    fantasyDraftsStore.save(k({ baseVersion: 0 }), { x: 1 });
    expect(fantasyDraftsStore.read(k({ baseVersion: 1 }))).toBeNull();
  });

  it("returns null for a different kind (team vs transfers)", () => {
    fantasyDraftsStore.save(k({ kind: "team" }), { x: 1 });
    expect(fantasyDraftsStore.read(k({ kind: "transfers" }))).toBeNull();
  });

  it("save with empty uid is a no-op", () => {
    fantasyDraftsStore.save(k({ uid: "" }), { x: 1 });
    expect(fantasyDraftsStore.listForUid("")).toEqual([]);
  });
});

describe("fantasyDraftsStore — malformed handling", () => {
  it("ignores malformed stored entries safely on read", () => {
    // Manually corrupt storage.
    (globalThis as any).window.localStorage.setItem(
      "botolago.fantasy.drafts",
      JSON.stringify({
        badkey: { garbage: true },
        alsoBad: { key: { uid: 42 }, payload: null, updatedAt: "nope" },
      }),
    );
    expect(fantasyDraftsStore.read(k())).toBeNull();
    expect(fantasyDraftsStore.listForUid("u1")).toEqual([]);
  });

  it("ignores non-object storage payloads", () => {
    (globalThis as any).window.localStorage.setItem(
      "botolago.fantasy.drafts",
      JSON.stringify(["not", "a", "map"]),
    );
    expect(fantasyDraftsStore.read(k())).toBeNull();
  });
});

describe("fantasyDraftsStore — clear semantics", () => {
  it("remove(key) clears only that draft", () => {
    fantasyDraftsStore.save(k(), { a: 1 });
    fantasyDraftsStore.save(k({ kind: "transfers" }), { b: 2 });
    fantasyDraftsStore.remove(k());
    expect(fantasyDraftsStore.read(k())).toBeNull();
    expect(fantasyDraftsStore.read(k({ kind: "transfers" }))).not.toBeNull();
  });

  it("clearForUid removes only that user's drafts", () => {
    fantasyDraftsStore.save(k({ uid: "u1" }), { a: 1 });
    fantasyDraftsStore.save(k({ uid: "u1", kind: "transfers" }), { b: 2 });
    fantasyDraftsStore.save(k({ uid: "u2" }), { c: 3 });
    fantasyDraftsStore.clearForUid("u1");
    expect(fantasyDraftsStore.listForUid("u1")).toEqual([]);
    expect(fantasyDraftsStore.listForUid("u2").length).toBe(1);
  });

  it("clearForUid('') is a no-op", () => {
    fantasyDraftsStore.save(k({ uid: "u1" }), { a: 1 });
    fantasyDraftsStore.clearForUid("");
    expect(fantasyDraftsStore.listForUid("u1").length).toBe(1);
  });
});
