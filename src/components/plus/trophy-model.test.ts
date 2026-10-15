import { describe, expect, it } from "bun:test";

import { mockTrophies } from "@/backend/trophies/mock";

import { buildShelves, figureOf, framesToEarn, newestWithin, shortDate } from "./trophy-model";

const cabinet = mockTrophies("founder_2026", true);

describe("the shelves", () => {
  const shelves = buildShelves(cabinet, "fr");
  it("hold one shelf per family, in the design's order, lit plaques first", () => {
    expect(shelves.map((s) => s.family)).toEqual([
      "paliers",
      "journees",
      "decisions",
      "ligue",
      "carte",
    ]);
    const paliers = shelves[0]!;
    expect(paliers.plaques.map((p) => `${p.state}:${p.code}`)).toEqual([
      "earned:first_rating",
      "earned:first_stade",
      "todo:first_pro",
      "todo:first_champion",
      "todo:first_legend",
    ]);
    expect(paliers.earned).toBe(2);
    expect(paliers.total).toBe(5);
  });
  it("show the league podium and champion as in progress mid-season, never as earned", () => {
    const ligue = shelves.find((s) => s.family === "ligue")!;
    expect(ligue.plaques.map((p) => `${p.state}:${p.code}`)).toEqual([
      "todo:league_podium",
      "todo:league_leader",
    ]);
    expect(ligue.earned).toBe(0);
    expect(ligue.plaques[0]).toMatchObject({ progress: { have: 3, need: 3, unit: "rank" } });
  });
  it("show the podium as waiting when the season is over and the last journée is not published", () => {
    const waiting = {
      ...cabinet,
      pending: [
        { code: "league_podium", gameweekSeq: 34, reason: "ratings_not_published" as const },
      ],
    };
    const ligue = buildShelves(waiting, "fr").find((s) => s.family === "ligue")!;
    expect(ligue.plaques.map((p) => `${p.state}:${p.code}`)).toEqual([
      "pending:league_podium",
      "todo:league_leader",
    ]);
  });
  it("leave the founding trophy off the card shelf for anyone who does not hold it", () => {
    const without = { ...cabinet, earned: cabinet.earned.filter((e) => e.code !== "founder_2026") };
    expect(buildShelves(without, "fr").some((s) => s.family === "carte")).toBe(false);
  });
  it("name the plaques in the reader's language", () => {
    expect(buildShelves(cabinet, "ar")[2]!.plaques[0]!.label).toBe("انتقال رابح");
  });
  it("keep a trophy on the shelf whatever the current figures say (nothing is withdrawn)", () => {
    // the calculation now says: no rating, no points. The cabinet still lists what was earned.
    const corrected = { ...cabinet, journeesPlayed: 0, progress: [] };
    const earned = buildShelves(corrected, "fr")
      .flatMap((s) => s.plaques)
      .filter((p) => p.state === "earned");
    expect(earned).toHaveLength(6);
  });
});

describe("the figure of a trophy", () => {
  const byCode = (code: string) => cabinet.earned.find((e) => e.code === code)!;
  it("reads from the facts stored when it was earned", () => {
    expect(figureOf(byCode("first_rating"))).toEqual({ kind: "number", big: "62", unit: "rating" });
    expect(figureOf(byCode("gw_80"))).toEqual({ kind: "number", big: "81", unit: "pts" });
    expect(figureOf(byCode("winning_transfer"))).toEqual({
      kind: "number",
      big: "+11",
      unit: "pts",
    });
    expect(figureOf(byCode("ten_gameweeks"))).toEqual({
      kind: "number",
      big: "10",
      unit: "gameweeks",
    });
    expect(figureOf(byCode("founder_2026"))).toEqual({ kind: "year", big: "2026" });
  });
  it("never shows a fallback number as a rating", () => {
    const noRating = { ...byCode("first_rating"), facts: {} };
    expect(figureOf(noRating)).toEqual({ kind: "number", big: "", unit: "rating" });
  });
});

describe("dates, newness and frames", () => {
  it("writes the day a result was published in Morocco's time", () => {
    expect(shortDate("2026-10-03T23:30:00+00:00", "fr")).toBe("4 oct.");
    expect(shortDate("2026-10-03T09:00:00+00:00", "ar")).toContain("3");
  });
  it("marks the newest trophy only within a week", () => {
    expect(newestWithin(cabinet, new Date("2026-10-15T08:00:00Z"))).toBe("ten_gameweeks");
    expect(newestWithin(cabinet, new Date("2026-12-01T08:00:00Z"))).toBeNull();
  });
  it("lists the frames still to earn with the server's own counts", () => {
    const todo = framesToEarn(cabinet).map((t) => t.frame.code);
    expect(todo).toContain("first_pro");
    expect(todo).toContain("thirty_gameweeks");
    expect(framesToEarn(cabinet).find((t) => t.frame.code === "first_pro")!.progress).toMatchObject(
      {
        have: 72,
        need: 84,
      },
    );
  });
});
