// Audit SOL-03 and UX-007 (Phase B, lane B4): the header search's keyboard
// state and its failure state, as pure functions.
import { describe, expect, test } from "bun:test";

import {
  clampActiveIndex,
  committableEntry,
  moveActiveIndex,
  searchEntries,
  searchPanelState,
  type SearchEntry,
} from "./global-search";

const entries: SearchEntry[] = [
  { kind: "club", id: "wac", label: "Wydad AC", hint: "Casablanca" },
  { kind: "club", id: "rca", label: "Raja CA", hint: "Casablanca" },
  { kind: "player", id: "p2", label: "Rayan Wadi", hint: "Wydad AC" },
];

describe("the active option always points at a visible one (SOL-03)", () => {
  test("no options: nothing is active, whatever was stored", () => {
    expect(clampActiveIndex(0, 0)).toBe(-1);
    expect(clampActiveIndex(5, 0)).toBe(-1);
    expect(moveActiveIndex(0, "down", 0)).toBe(-1);
    expect(moveActiveIndex(-1, "down", 0)).toBe(-1);
  });
  test("ArrowDown on an empty list never leaves -1 behind for later results", () => {
    // The old code kept Math.min(1, -1) = -1; once results arrived nothing was active.
    const afterEmptyArrow = moveActiveIndex(0, "down", 0);
    expect(clampActiveIndex(afterEmptyArrow, 3)).toBe(0);
  });
  test("a stored index past the end of a shorter list is pulled back", () => {
    expect(clampActiveIndex(7, 3)).toBe(2);
    expect(clampActiveIndex(-4, 3)).toBe(0);
  });
  test("arrows stay inside the list", () => {
    expect(moveActiveIndex(0, "up", 3)).toBe(0);
    expect(moveActiveIndex(1, "down", 3)).toBe(2);
    expect(moveActiveIndex(2, "down", 3)).toBe(2);
    // A stale index counts as the last option, so Up lands on the one before it.
    expect(moveActiveIndex(9, "up", 3)).toBe(1);
  });
  test("Enter commits only a shown, in-range option", () => {
    const shown = searchEntries(entries, "wy");
    expect(committableEntry(shown, 0, true)?.id).toBe("wac");
    // Escape closed the list: the result is still computed but is not on screen.
    expect(committableEntry(shown, 0, false)).toBeUndefined();
    expect(committableEntry(shown, 4, true)).toBeUndefined();
    expect(committableEntry(shown, -1, true)).toBeUndefined();
    expect(committableEntry(shown, 0.5, true)).toBeUndefined();
    expect(committableEntry([], 0, true)).toBeUndefined();
  });
});

describe("search tells a failed catalog from no match (UX-007)", () => {
  const ok = { pending: false, failed: false };
  const failed = { pending: false, failed: true };
  const pending = { pending: true, failed: false };

  test("both catalogs loaded and nothing matches: the empty state", () => {
    expect(searchPanelState({ resultCount: 0, sources: [ok, ok] })).toEqual({ kind: "empty" });
  });
  test("both catalogs failed: unavailable, never 'no result'", () => {
    expect(searchPanelState({ resultCount: 0, sources: [failed, failed] })).toEqual({
      kind: "unavailable",
    });
  });
  test("only the players failed and no club matches: unavailable, not empty", () => {
    expect(searchPanelState({ resultCount: 0, sources: [ok, failed] })).toEqual({
      kind: "unavailable",
    });
  });
  test("a catalog still loading: loading, even if the other one failed", () => {
    expect(searchPanelState({ resultCount: 0, sources: [pending, ok] })).toEqual({
      kind: "loading",
    });
    expect(searchPanelState({ resultCount: 0, sources: [pending, failed] })).toEqual({
      kind: "loading",
    });
  });
  test("results from the club list are kept when the players failed, and flagged partial", () => {
    expect(searchPanelState({ resultCount: 2, sources: [ok, failed] })).toEqual({
      kind: "results",
      partial: true,
    });
  });
  test("complete results carry no warning", () => {
    expect(searchPanelState({ resultCount: 2, sources: [ok, ok] })).toEqual({
      kind: "results",
      partial: false,
    });
  });
});
