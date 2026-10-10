import { describe, expect, it } from "bun:test";
import {
  buildGlobalRankings,
  pageForRank,
  selectGlobalRankingsPage,
  selectRankingsPage,
  type RankingsQuery,
} from "./fantasy-rankings";
import type { LeagueStanding } from "@/types/fantasy";

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

/**
 * The rankings route reads the whole board once per owner and cuts its pages
 * in the browser. The selection is the one the board's read used to apply to
 * every page it fetched; these pin that it did not change.
 */
describe("a page cut from the season board", () => {
  const me: LeagueStanding = {
    managerId: "me",
    managerName: "Moi",
    teamName: "Mon équipe",
    rank: 0,
    previousRank: 0,
    gameweekScore: 5,
    totalScore: 10_000,
  };
  const query = (over: Partial<RankingsQuery> = {}): RankingsQuery => ({
    page: 1,
    pageSize: 25,
    sort: "overall",
    query: "",
    ...over,
  });

  it("the mock board takes the reader's row in by score, as before", () => {
    const rows = buildGlobalRankings(120);
    const board = { rows, authoritative: false };
    expect(selectGlobalRankingsPage(board, query({ me }))).toEqual(
      selectRankingsPage(rows, query({ me })),
    );
    expect(selectGlobalRankingsPage(board, query({ me })).myRank?.managerId).toBe("me");
  });

  it("the server's board ignores the reader's own row: it already holds it once ranked", () => {
    const rows = buildGlobalRankings(120);
    const page = selectGlobalRankingsPage({ rows, authoritative: true }, query({ me }));
    expect(page.rows.some((row) => row.managerId === "me")).toBe(false);
    expect(page.myRank).toBeUndefined();
    expect(page).toEqual(selectRankingsPage(rows, query()));
  });

  it("prefers the board's re-ranked copy of the reader's row, so Jump to me lands on it", () => {
    const rows = buildGlobalRankings(120);
    const mine = rows[40];
    const server = { ...mine, rank: mine.rank };
    const page = selectGlobalRankingsPage(
      { rows, myRank: server, authoritative: true },
      query({ sort: "gameweek" }),
    );
    const sorted = selectRankingsPage(rows, query({ sort: "gameweek", meId: mine.managerId }));
    expect(page.myRank).toEqual(sorted.myRank);
    expect(page.myRank).not.toBe(server);
  });

  it("falls back to the server's answer when the reader's row is not on the board read", () => {
    const rows = buildGlobalRankings(30);
    const offBoard = { ...rows[0], managerId: "far-down", rank: 4_210 };
    const page = selectGlobalRankingsPage({ rows, myRank: offBoard, authoritative: true }, query());
    expect(page.myRank).toBe(offBoard);
  });

  it("search and paging are cut from the same board, with no read", () => {
    const rows = buildGlobalRankings(120);
    const board = { rows, authoritative: true };
    const name = rows[57].managerName;
    const found = selectGlobalRankingsPage(board, query({ query: name, page: 3 }));
    expect(
      found.rows.every((row) => row.managerName.includes(name) || row.teamName.includes(name)),
    ).toBe(true);
    expect(selectGlobalRankingsPage(board, query({ page: 2 })).rows[0].rank).toBe(26);
  });
});
