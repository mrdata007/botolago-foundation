import { describe, expect, test } from "bun:test";

import { outputsFor, readFootballDataSource } from "./read-football-data-source";

describe("read-football-data-source", () => {
  test("only sofascore and shadow skip SportsMonks", () => {
    expect(outputsFor("sofascore")).toEqual({ source: "sofascore", skipSportsMonks: true });
    expect(outputsFor("shadow")).toEqual({ source: "shadow", skipSportsMonks: true });
    expect(outputsFor("sportsmonks")).toEqual({ source: "sportsmonks", skipSportsMonks: false });
  });

  test("anything unreadable fails safe to today's behaviour", async () => {
    for (const raw of [null, undefined, "", "other", 3, { source: "sofascore" }])
      expect(outputsFor(raw)).toEqual({ source: "unknown", skipSportsMonks: false });
    expect(await readFootballDataSource(undefined, "key")).toBeNull();
    expect(await readFootballDataSource("https://x.supabase.co", "")).toBeNull();
  });
});
