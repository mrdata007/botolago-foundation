import { describe, expect, it } from "bun:test";
import { buildGlobalRankings, pageForRank, selectRankingsPage } from "./fantasy-rankings";

describe("fantasy global rankings", () => {
  it("builds a deterministic board", () => {
    const a = buildGlobalRankings(50);
    const b = buildGlobalRankings(50);
    expect(a).toEqual(b);
    expect(a).toHaveLength(50);
  });

  it("ranks by descending total score", () => {
    const rows = buildGlobalRankings(30);
    expect(rows[0].rank).toBe(1);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].totalScore).toBeLessThan(rows[i - 1].totalScore);
      expect(rows[i].rank).toBe(i + 1);
    }
  });

  it("paginates within bounds and clamps out-of-range pages", () => {
    const all = buildGlobalRankings(120);
    const first = selectRankingsPage(all, {
      page: 1,
      pageSize: 50,
      sort: "overall",
      query: "",
    });
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0].rank).toBe(1);
    expect(first.total).toBe(120);

    const last = selectRankingsPage(all, {
      page: 3,
      pageSize: 50,
      sort: "overall",
      query: "",
    });
    expect(last.rows).toHaveLength(20);

    const overflow = selectRankingsPage(all, {
      page: 99,
      pageSize: 50,
      sort: "overall",
      query: "",
    });
    expect(overflow.rows).toEqual(last.rows);
  });

  it("filters by manager or team name", () => {
    const all = buildGlobalRankings(200);
    const target = all[42];
    const result = selectRankingsPage(all, {
      page: 1,
      pageSize: 50,
      sort: "overall",
      query: target.teamName,
      meId: target.managerId,
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.teamName === target.teamName)).toBe(true);
    // Podium and myRank ignore the search filter.
    expect(result.podium).toHaveLength(3);
    expect(result.myRank?.managerId).toBe(target.managerId);
  });

  it("re-ranks when sorting by gameweek", () => {
    const all = buildGlobalRankings(100);
    const gw = selectRankingsPage(all, {
      page: 1,
      pageSize: 100,
      sort: "gameweek",
      query: "",
    });
    for (let i = 1; i < gw.rows.length; i += 1) {
      expect(gw.rows[i].gameweekScore).toBeLessThanOrEqual(gw.rows[i - 1].gameweekScore);
    }
    expect(gw.rows[0].rank).toBe(1);
  });

  it("maps a rank to its page", () => {
    expect(pageForRank(1, 50)).toBe(1);
    expect(pageForRank(50, 50)).toBe(1);
    expect(pageForRank(51, 50)).toBe(2);
    expect(pageForRank(0, 50)).toBe(1);
  });
});
