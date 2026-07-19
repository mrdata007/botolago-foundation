// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  clearOwnedFantasyCache,
  isOwnedFantasyKey,
  scopedFantasyKey,
  selectFantasyDataSource,
} from "./fantasy-data-source";

describe("selectFantasyDataSource", () => {
  it("returns cloud only when supabase mode and authenticated", () => {
    expect(selectFantasyDataSource({ authMode: "supabase", isAuthenticated: true })).toBe("cloud");
  });
  it("returns local for guest supabase mode", () => {
    expect(selectFantasyDataSource({ authMode: "supabase", isAuthenticated: false })).toBe("local");
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
