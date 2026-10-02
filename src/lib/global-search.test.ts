import { describe, expect, test } from "bun:test";

import { searchEntries, type SearchEntry } from "./global-search";

const entries: SearchEntry[] = [
  { kind: "club", id: "wac", label: "Wydad AC", hint: "Casablanca" },
  { kind: "club", id: "rca", label: "Raja CA", hint: "Casablanca" },
  { kind: "player", id: "p1", label: "Ayoub Élouasti", hint: "CODM" },
  { kind: "player", id: "p2", label: "Rayan Wadi", hint: "Wydad AC" },
];

describe("searchEntries", () => {
  test("nothing typed finds nothing", () => {
    expect(searchEntries(entries, "  ")).toEqual([]);
  });
  test("ignores accents and capitals", () => {
    expect(searchEntries(entries, "elouasti").map((e) => e.id)).toEqual(["p1"]);
  });
  test("a name that starts with the text comes before one that only contains it", () => {
    expect(searchEntries(entries, "wy").map((e) => e.id)).toEqual(["wac"]);
  });
  test("a word inside the name beats a match in the middle of a word", () => {
    expect(searchEntries(entries, "wa").map((e) => e.id)).toEqual(["p2"]);
  });
  test("a later word can match", () => {
    expect(searchEntries(entries, "ac").map((e) => e.id)).toContain("wac");
  });
  test("respects the limit", () => {
    expect(searchEntries(entries, "a", 2)).toHaveLength(2);
  });
});
