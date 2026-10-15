import { describe, expect, it } from "bun:test";
import {
  buildGlobalRankings,
  pageForRank,
  selectBoardPage,
  selectRankingsPage,
} from "./fantasy-rankings";
import type { LeagueStanding } from "@/types/fantasy";

const standing = (over: Partial<LeagueStanding> & { managerId: string }): LeagueStanding => ({
  managerName: over.managerId,
  teamName: over.managerId,
  rank: 1,
  previousRank: 1,
  gameweekScore: 0,
  totalScore: 0,
  ...over,
});

const base = { page: 1, pageSize: 50, query: "" } as const;

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

  // FANT-04. The round board used to re-sort ties by ASCENDING season total and
  // to replace previousRank with the overall rank, so it showed a tie-break and
  // a movement nobody had computed.
  describe("round scope (FANT-04)", () => {
    const A = standing({
      managerId: "A",
      rank: 1,
      previousRank: 1,
      totalScore: 200,
      gameweekScore: 50,
    });
    const B = standing({
      managerId: "B",
      rank: 2,
      previousRank: 2,
      totalScore: 100,
      gameweekScore: 50,
    });

    it("keeps the board's own order for tied round scores (the audit's two rows)", () => {
      const page = selectRankingsPage([A, B], { ...base, sort: "gameweek" });
      expect(page.rows.map((row) => row.managerId)).toEqual(["A", "B"]);
      expect(page.rows.map((row) => row.rank)).toEqual([1, 2]);
    });

    it("never invents a previous rank when switching from overall to round", () => {
      const page = selectRankingsPage([A, B], { ...base, sort: "gameweek" });
      expect(page.rows.every((row) => row.previousRank === null)).toBe(true);
    });

    it("breaks a three-way tie by the order it was given, whatever the season totals", () => {
      const rows = [
        standing({ managerId: "x", rank: 1, previousRank: 3, totalScore: 300, gameweekScore: 40 }),
        standing({ managerId: "y", rank: 2, previousRank: 1, totalScore: 200, gameweekScore: 40 }),
        standing({ managerId: "z", rank: 3, previousRank: 2, totalScore: 100, gameweekScore: 40 }),
      ];
      const page = selectRankingsPage(rows, { ...base, sort: "gameweek" });
      expect(page.rows.map((row) => row.managerId)).toEqual(["x", "y", "z"]);
    });

    it("still puts a higher round score first, and keeps tied rows in board order", () => {
      const rows = [
        standing({ managerId: "x", rank: 1, totalScore: 300, gameweekScore: 40 }),
        standing({ managerId: "y", rank: 2, totalScore: 200, gameweekScore: 60 }),
        standing({ managerId: "z", rank: 3, totalScore: 100, gameweekScore: 40 }),
      ];
      const page = selectRankingsPage(rows, { ...base, sort: "gameweek" });
      expect(page.rows.map((row) => row.managerId)).toEqual(["y", "x", "z"]);
    });

    it("finds the manager's own round standing in that scope", () => {
      const page = selectRankingsPage([A, B], { ...base, sort: "gameweek", meId: "B" });
      expect(page.myRank?.managerId).toBe("B");
      expect(page.myRank?.rank).toBe(2);
      expect(page.myRank?.previousRank).toBeNull();
    });

    it("keeps the real movement on the overall board", () => {
      const moved = standing({ managerId: "m", rank: 1, previousRank: 4, totalScore: 9 });
      const page = selectRankingsPage([moved], { ...base, sort: "overall" });
      expect(page.rows[0].previousRank).toBe(4);
    });
  });

  // The cloud path hands over a board the server already ordered and ranked.
  describe("selectBoardPage (server-ordered board)", () => {
    const server = [
      standing({ managerId: "p", rank: 1, previousRank: null, totalScore: 10, gameweekScore: 50 }),
      standing({ managerId: "q", rank: 2, previousRank: 5, totalScore: 99, gameweekScore: 50 }),
      standing({ managerId: "r", rank: 3, previousRank: 2, totalScore: 50, gameweekScore: 70 }),
    ];

    it("does not re-sort, re-rank or touch previous ranks", () => {
      const page = selectBoardPage(server, base);
      expect(page.rows).toEqual(server);
      expect(page.total).toBe(3);
    });

    it("pages and searches the given order", () => {
      expect(selectBoardPage(server, { ...base, pageSize: 2, page: 2 }).rows).toEqual([server[2]]);
      expect(selectBoardPage(server, { ...base, query: "q" }).rows).toEqual([server[1]]);
    });

    it("looks the manager up by id without the search filter", () => {
      const page = selectBoardPage(server, { ...base, query: "p", meId: "r" });
      expect(page.myRank).toEqual(server[2]);
      expect(page.podium).toEqual(server);
    });
  });
});
