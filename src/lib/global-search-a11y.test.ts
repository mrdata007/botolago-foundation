// Audit MOB-02 (Phase C, lane C4): the header search is a combobox whose
// active option is named by id, and whose list changes are announced. The
// pure parts: the option ids, the active descendant, the announcement.
import { describe, expect, test } from "bun:test";

import {
  activeDescendantId,
  searchAnnouncement,
  searchEntries,
  searchOptionId,
  searchPanelState,
  type SearchEntry,
} from "./global-search";

const entries: SearchEntry[] = [
  { kind: "club", id: "wac", label: "Wydad AC", hint: "Casablanca" },
  { kind: "club", id: "rca", label: "Raja CA", hint: "Casablanca" },
  { kind: "player", id: "p2", label: "Rayan Wadi", hint: "Wydad AC" },
];

describe("option ids", () => {
  test("come from the option itself, so they survive a reorder", () => {
    const before = searchEntries(entries, "ra").map((entry) => searchOptionId(":r1:", entry));
    const after = searchEntries(entries, "rayan").map((entry) => searchOptionId(":r1:", entry));
    // The player is second in "ra" and first in "rayan": same option, same id.
    expect(before.indexOf(":r1:-player-p2")).toBe(1);
    expect(after.indexOf(":r1:-player-p2")).toBe(0);
  });
  test("a club and a player with the same id do not collide", () => {
    expect(searchOptionId("l", { kind: "club", id: "7" })).not.toBe(
      searchOptionId("l", { kind: "player", id: "7" }),
    );
  });
  test("never contain whitespace, which would end an id reference", () => {
    expect(searchOptionId("l", { kind: "club", id: "a b\tc" })).not.toMatch(/\s/);
  });
});

describe("aria-activedescendant", () => {
  const shown = searchEntries(entries, "ra");
  test("names the active option while the list is on screen", () => {
    const id = activeDescendantId({ listId: "l", results: shown, active: 1, panelVisible: true });
    expect(id).toBe(searchOptionId("l", shown[1]!));
  });
  test("is absent when the list is shut (after Escape)", () => {
    expect(
      activeDescendantId({ listId: "l", results: shown, active: 0, panelVisible: false }),
    ).toBeUndefined();
  });
  test("is absent when nothing is listed or the index is not an option", () => {
    expect(
      activeDescendantId({ listId: "l", results: [], active: -1, panelVisible: true }),
    ).toBeUndefined();
    expect(
      activeDescendantId({ listId: "l", results: shown, active: 9, panelVisible: true }),
    ).toBeUndefined();
  });
});

describe("what the live region announces", () => {
  const ok = { pending: false, failed: false };
  const panelFor = (count: number, sources = [ok, ok]) =>
    searchPanelState({ resultCount: count, sources });

  test("the number of results while the panel is open", () => {
    expect(searchAnnouncement({ panelVisible: true, panel: panelFor(3), resultCount: 3 })).toEqual({
      kind: "results",
      count: 3,
    });
  });
  test("searching, and no result, are told too", () => {
    expect(
      searchAnnouncement({
        panelVisible: true,
        panel: panelFor(0, [{ pending: true, failed: false }, ok]),
        resultCount: 0,
      }),
    ).toEqual({ kind: "loading" });
    expect(searchAnnouncement({ panelVisible: true, panel: panelFor(0), resultCount: 0 })).toEqual({
      kind: "empty",
    });
  });
  test("nothing while the panel is shut", () => {
    expect(
      searchAnnouncement({ panelVisible: false, panel: panelFor(3), resultCount: 3 }),
    ).toBeNull();
  });
  test("nothing for a failed catalog: its own note is the status", () => {
    const failed = { pending: false, failed: true };
    expect(
      searchAnnouncement({
        panelVisible: true,
        panel: panelFor(0, [failed, failed]),
        resultCount: 0,
      }),
    ).toBeNull();
  });
});
