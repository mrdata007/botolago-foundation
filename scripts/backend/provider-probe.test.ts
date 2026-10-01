import { describe, expect, test } from "bun:test";
import { enumsOf, probe, readQuota, rowsOf, shapeOf, valuesAt } from "./provider-probe";

// Synthetic data only: nothing here comes from a provider.
const incidents = {
  incidents: [
    { incidentType: "period", text: "FT" },
    { incidentType: "goal", incidentClass: "regular", time: 12, player: { id: 1 } },
    { incidentType: "goal", incidentClass: "penalty", time: 70, assist1: { id: 2 } },
    { incidentType: "card", incidentClass: "yellow", time: 21 },
  ],
};

describe("shapeOf", () => {
  test("merges every list item and counts how often a field appears", () => {
    const lines = shapeOf(incidents);
    expect(lines).toContain("$.incidents: array len 4-4 x1");
    expect(lines).toContain("$.incidents[].incidentType: string x4");
    expect(lines).toContain("$.incidents[].assist1.id: number x1");
    expect(lines).toContain("$.incidents[].player.id: number x1");
  });

  test("lists types, not values", () => {
    const text = shapeOf({ name: "SECRET-NAME", n: 5, none: null }).join("\n");
    expect(text).not.toContain("SECRET-NAME");
    expect(text).toContain("$.name: string x1");
    expect(text).toContain("$.none: null x1");
  });

  test("skips noisy subtrees", () => {
    const lines = shapeOf({ a: 1, playerColor: { primary: "#fff" } });
    expect(lines.join("\n")).not.toContain("playerColor");
  });
});

describe("enumsOf", () => {
  test("lists the distinct values of a small field, with counts", () => {
    expect(enumsOf(incidents, ["$.incidents[].incidentType"])).toEqual([
      'ENUM $.incidents[].incidentType: "period" x1, "goal" x2, "card" x1',
    ]);
  });

  test("reports only a count for a field with many values (names, free text)", () => {
    const many = { items: Array.from({ length: 20 }, (_, i) => ({ name: `Player ${i}` })) };
    const [line] = enumsOf(many, ["$.items[].name"]);
    expect(line).toBe("ENUM $.items[].name: 20 distinct values over 20 (not listed)");
    expect(line).not.toContain("Player");
  });

  test("the limit can be raised, but only up to 80", () => {
    const many = { items: Array.from({ length: 20 }, (_, i) => ({ key: `stat${i}` })) };
    expect(enumsOf(many, ["$.items[].key"], 30)[0]).toContain('"stat19" x1');
    const huge = { items: Array.from({ length: 100 }, (_, i) => ({ key: `k${i}` })) };
    expect(enumsOf(huge, ["$.items[].key"], 1000)[0]).toContain("100 distinct values");
  });

  test("never prints an object, and says nothing for a missing path", () => {
    expect(enumsOf(incidents, ["$.incidents[].player"])).toEqual([]);
    expect(enumsOf(incidents, ["$.nope[].x"])).toEqual([]);
  });
});

describe("valuesAt", () => {
  test("an index picks one item of a list", () => {
    const data = { DATA: [{ n: "first" }, { n: "second" }] };
    expect(valuesAt(data, "$.DATA[1].n")).toEqual(["second"]);
    expect(valuesAt(data, "$.DATA[5].n")).toEqual([]);
  });

  test("walks keys and lists", () => {
    expect(valuesAt(incidents, "$.incidents[].time")).toEqual([12, 70, 21]);
  });
});

describe("rowsOf", () => {
  const data = {
    DATA: [
      { EVENTS: [{ EVENT_ID: "a1", HOME: "Alpha", SCORE: 2, NESTED: { x: 1 } }] },
      { EVENTS: [{ EVENT_ID: "b2", HOME: "Beta" }] },
    ],
  };

  test("prints one line per entry with only the named fields", () => {
    expect(rowsOf(data, "$.DATA[].EVENTS[]:EVENT_ID,HOME,SCORE")).toEqual([
      "ROW 0 | a1 | Alpha | 2",
      "ROW 1 | b2 | Beta | -",
    ]);
  });

  test("never prints an object, and an index picks one list item", () => {
    expect(rowsOf(data, "$.DATA[0].EVENTS[]:EVENT_ID,NESTED")).toEqual(["ROW 0 | a1 | (object)"]);
  });

  test("caps the rows", () => {
    const big = { list: Array.from({ length: 500 }, (_, i) => ({ id: i })) };
    expect(rowsOf(big, "$.list[]:id")).toHaveLength(120);
  });
});

describe("readQuota", () => {
  test("reads the rate-limit headers and nothing else", () => {
    const headers = new Headers({
      "x-ratelimit-requests-limit": "500",
      "x-ratelimit-requests-remaining": "461",
      authorization: "never-read",
    });
    expect(readQuota(headers)).toEqual({ limit: 500, remaining: 461 });
    expect(readQuota(new Headers())).toEqual({ limit: null, remaining: null });
  });
});

describe("probe", () => {
  test("refuses a key in the URL before any request is made", async () => {
    process.env.RAPIDAPI_KEY = "test-value-not-a-real-key";
    await expect(probe("sofascore", "matches/detail?matchId=1&key=abc")).rejects.toThrow(
      "Never put a key in the URL",
    );
  });
});
