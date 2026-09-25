import { describe, it, expect } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  belongsToFantasyScope,
  clearOtherOwnersFantasyCache,
  clearOwnedFantasyCache,
  isOwnedFantasyKey,
  scopedFantasyKey,
  selectFantasyDataSource,
} from "./fantasy-data-source";

describe("selectFantasyDataSource", () => {
  it("returns cloud only when supabase mode and authenticated", () => {
    expect(selectFantasyDataSource({ authMode: "supabase", isAuthenticated: true })).toBe("cloud");
  });
  it("returns a non-local guest source for anonymous Supabase mode", () => {
    expect(selectFantasyDataSource({ authMode: "supabase", isAuthenticated: false })).toBe("guest");
  });
  it("returns local for mock mode regardless of auth", () => {
    expect(selectFantasyDataSource({ authMode: "mock", isAuthenticated: true })).toBe("local");
    expect(selectFantasyDataSource({ authMode: "mock", isAuthenticated: false })).toBe("local");
  });
});

describe("scoped fantasy query keys", () => {
  it("differ across source and owner", () => {
    const a = scopedFantasyKey({ source: "cloud", owner: "u1" }, "team");
    const b = scopedFantasyKey({ source: "cloud", owner: "u2" }, "team");
    const c = scopedFantasyKey({ source: "local", owner: "__local__" }, "team");
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });
  it("recognizes owned keys", () => {
    expect(isOwnedFantasyKey(scopedFantasyKey({ source: "local", owner: "x" }, "y"))).toBe(true);
    expect(isOwnedFantasyKey(["not-owned", "team"])).toBe(false);
    expect(isOwnedFantasyKey(null)).toBe(false);
  });
});

describe("clearOwnedFantasyCache", () => {
  it("removes only owned keys, leaving others intact", () => {
    const qc = new QueryClient();
    qc.setQueryData(scopedFantasyKey({ source: "cloud", owner: "u1" }, "team"), { x: 1 });
    qc.setQueryData(scopedFantasyKey({ source: "local", owner: "__local__" }, "team"), { x: 2 });
    qc.setQueryData(["public", "articles"], [{ id: 1 }]);
    clearOwnedFantasyCache(qc);
    expect(
      qc.getQueryData(scopedFantasyKey({ source: "cloud", owner: "u1" }, "team")),
    ).toBeUndefined();
    expect(
      qc.getQueryData(scopedFantasyKey({ source: "local", owner: "__local__" }, "team")),
    ).toBeUndefined();
    expect(qc.getQueryData(["public", "articles"])).toEqual([{ id: 1 }]);
  });
});

describe("clearOtherOwnersFantasyCache (identity change)", () => {
  const previous = { source: "cloud", owner: "u1" } as const;
  const current = { source: "cloud", owner: "u2" } as const;

  it("removes the previous owner's entries and keeps the current owner's", () => {
    const qc = new QueryClient();
    qc.setQueryData(scopedFantasyKey(previous, "snapshot"), { team: "old" });
    qc.setQueryData(scopedFantasyKey({ source: "guest", owner: "__local__" }, "snapshot"), {});
    qc.setQueryData(scopedFantasyKey(current, "snapshot"), { team: "mine" });
    qc.setQueryData(["public", "articles"], [{ id: 1 }]);
    clearOtherOwnersFantasyCache(qc, current);
    expect(qc.getQueryData(scopedFantasyKey(previous, "snapshot"))).toBeUndefined();
    expect(
      qc.getQueryData(scopedFantasyKey({ source: "guest", owner: "__local__" }, "snapshot")),
    ).toBeUndefined();
    expect(qc.getQueryData(scopedFantasyKey(current, "snapshot"))).toEqual({ team: "mine" });
    expect(qc.getQueryData(["public", "articles"])).toEqual([{ id: 1 }]);
  });

  it("knows whose a key is", () => {
    expect(belongsToFantasyScope(scopedFantasyKey(current, "snapshot"), current)).toBe(true);
    expect(belongsToFantasyScope(scopedFantasyKey(previous, "snapshot"), current)).toBe(false);
    expect(
      belongsToFantasyScope(scopedFantasyKey({ source: "guest", owner: "u2" }, "x"), current),
    ).toBe(false);
    expect(belongsToFantasyScope(["public", "u2"], current)).toBe(false);
  });

  // The 2026-09-24 bug, reproduced with the real query library: the provider's
  // identity effect runs after the render that started the new owner's first
  // snapshot read. Removing that query cancels the read and strands its
  // observer; keeping it lets the read finish.
  async function firstReadAfterCleanup(cleanup: (qc: QueryClient) => void) {
    const qc = new QueryClient();
    let resolve!: (value: { team: string }) => void;
    const observer = new QueryObserver(qc, {
      queryKey: scopedFantasyKey(current, "snapshot"),
      queryFn: () => new Promise<{ team: string }>((r) => (resolve = r)),
    });
    const unsubscribe = observer.subscribe(() => {});
    cleanup(qc);
    resolve({ team: "mine" });
    await new Promise((r) => setTimeout(r, 10));
    const result = observer.getCurrentResult();
    unsubscribe();
    return { status: result.status, data: result.data };
  }

  it("lets the current owner's first read finish", async () => {
    expect(await firstReadAfterCleanup((qc) => clearOtherOwnersFantasyCache(qc, current))).toEqual({
      status: "success",
      data: { team: "mine" },
    });
  });

  it("(clearing every owner, as before, left that read pending for good)", async () => {
    expect((await firstReadAfterCleanup((qc) => clearOwnedFantasyCache(qc))).status).toBe(
      "pending",
    );
  });
});
