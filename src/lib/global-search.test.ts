import { describe, expect, test } from "bun:test";

import { highlightParts, searchEntries, type SearchEntry } from "./global-search";

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

describe("highlightParts", () => {
  test("picks out the letters typed, ignoring capitals and accents", () => {
    expect(highlightParts("Élouasti", "elo")).toEqual([
      { text: "Élo", match: true },
      { text: "uasti", match: false },
    ]);
  });

  test("finds a match in the middle of a name", () => {
    expect(highlightParts("Wydad AC", "dad")).toEqual([
      { text: "Wy", match: false },
      { text: "dad", match: true },
      { text: " AC", match: false },
    ]);
  });

  test("gives the label whole when the query is not in it, or is empty", () => {
    expect(highlightParts("Raja CA", "zzz")).toEqual([{ text: "Raja CA", match: false }]);
    expect(highlightParts("Raja CA", "  ")).toEqual([{ text: "Raja CA", match: false }]);
  });

  test("works for Arabic names", () => {
    const parts = highlightParts("الوداد", "ود");
    expect(parts.some((part) => part.match && part.text === "ود")).toBe(true);
    expect(parts.map((part) => part.text).join("")).toBe("الوداد");
  });

  test("always gives back the label unchanged when joined", () => {
    for (const [label, query] of [
      ["Mohamed Ali", "ali"],
      ["Étoile", "TOI"],
      ["Wydad", "d"],
    ] as const) {
      expect(
        highlightParts(label, query)
          .map((part) => part.text)
          .join(""),
      ).toBe(label);
    }
  });
});
