import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import type {
  FantasyHubDto,
  FantasyLeagueStandingPageDto,
  FantasyOverallStandingDto,
  FantasyOverallStandingPageDto,
} from "@/backend/fantasy/contracts";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import * as identity from "./fantasy-identity";
import { forgetBoardReaders, fantasyService } from "./fantasy-runtime";
import { mergeLeagueStandingsPages, type LeagueStandingsPage } from "./fantasy-league-pages";

/**
 * FANT-03 and FANT-05 — a league and the global board reach every manager, the
 * totals are the server's, and a page turn does not read the board again.
 *
 * The repository is spied (not module-mocked: a module mock is process-wide in
 * Bun) to answer as the RPCs do: at most 100 rows, a keyset position on
 * (rank, team id), the board's real total and the caller's own standing.
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const LEAGUE = "00000000-0000-4000-8000-000000000301";
const teamId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const hub: FantasyHubDto = {
  season: { id: SEASON, name: "2026/2027", status: "active" },
  gameweek: null,
  enrolmentGameweek: null,
  team: null,
  rankingAvailable: true,
};

const standing = (rank: number): FantasyOverallStandingDto => ({
  teamId: teamId(rank),
  teamName: `team-${rank}`,
  managerName: `manager-${rank}`,
  rank,
  previousRank: null,
  totalPoints: 1_000_000 - rank,
  gameweekPoints: 10,
  calculatedAt: "2026-10-14T10:00:00Z",
});

/** The board the stand-in server holds, and the rank it reports for the caller. */
let boardSize = 0;
let mineRank = 2;
const boardReads: Array<{ rank: number | null; limit: number | undefined }> = [];
/** The league the stand-in server holds. */
let leagueSize = 0;
const leagueReads: Array<{ rank: number | null }> = [];

const spies = [
  spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(async () => hub),
  spyOn(SupabaseFantasyRepository.prototype, "getOverallStandings").mockImplementation(
    async (input) => {
      const after = input.cursor?.rank ?? 0;
      boardReads.push({ rank: input.cursor?.rank ?? null, limit: input.limit });
      const limit = input.limit ?? 50;
      if (limit < 1 || limit > 100) throw new Error("validation_failed");
      const items: FantasyOverallStandingDto[] = [];
      for (let rank = after + 1; rank <= boardSize && items.length < limit; rank += 1) {
        items.push(standing(rank));
      }
      const last = items[items.length - 1];
      const page: FantasyOverallStandingPageDto = {
        seasonId: SEASON,
        gameweekId: null,
        items,
        nextCursor: last && last.rank < boardSize ? { rank: last.rank, teamId: last.teamId } : null,
        total: boardSize,
        myRank: boardSize >= mineRank ? standing(mineRank) : null,
      };
      return page;
    },
  ),
  spyOn(SupabaseFantasyRepository.prototype, "getLeagueStandings").mockImplementation(
    async (_league, _gameweek, _context, cursor) => {
      const after = cursor?.rank ?? 0;
      leagueReads.push({ rank: cursor?.rank ?? null });
      const items: FantasyLeagueStandingPageDto["items"] = [];
      for (let rank = after + 1; rank <= leagueSize && items.length < 100; rank += 1) {
        items.push({
          teamId: teamId(rank),
          teamName: `team-${rank}`,
          managerName: `manager-${rank}`,
          rank,
          previousRank: null,
          totalPoints: 5_000 - rank,
          gameweekPoints: 10,
          calculatedAt: "2026-10-14T10:00:00Z",
        });
      }
      return {
        league: { id: LEAGUE, name: "Amis", visibility: "private", memberCount: leagueSize },
        items,
      };
    },
  ),
  // A stable account, so the held reads are shared as they are in a browser.
  spyOn(identity, "hubIdentity").mockImplementation(async () => "anonymous"),
  spyOn(console, "error").mockImplementation(() => {}),
];

const MODE = "VITE_FANTASY_DATA_MODE";
const modeBefore = process.env[MODE];
beforeAll(() => {
  process.env[MODE] = "supabase";
});
afterAll(() => {
  if (modeBefore === undefined) delete process.env[MODE];
  else process.env[MODE] = modeBefore;
  for (const spy of spies) spy.mockRestore();
});
beforeEach(() => {
  forgetBoardReaders();
  boardReads.length = 0;
  leagueReads.length = 0;
  mineRank = 2;
});

const ask = (page: number, query = "", pageSize = 25) =>
  fantasyService.getGlobalRankings({ page, pageSize, sort: "overall", query });

describe("the global board reaches every manager (FANT-05)", () => {
  it("shows the 2,001st manager and the real total of a 2,500-manager board", async () => {
    boardSize = 2_500;

    const page = await ask(81);

    expect(page.total).toBe(2_500);
    expect(page.rows[0]?.rank).toBe(2_001);
    expect(page.rows[0]?.managerId).toBe(teamId(2_001));
    expect(page.searchLimit).toBeUndefined();
  });

  it("reaches the last manager of a 5,000-manager board without reading 50 blocks", async () => {
    boardSize = 5_000;

    const page = await ask(200);

    expect(page.rows.at(-1)?.rank).toBe(5_000);
    expect(page.total).toBe(5_000);
    expect(boardReads.length).toBeLessThanOrEqual(2);
  });

  it("jumps to the caller's own page wherever they stand, with no search", async () => {
    boardSize = 4_000;
    mineRank = 3_333;

    const first = await ask(1);
    const mine = first.myRank!;
    const onTheirPage = await ask(Math.ceil(mine.rank / 25));

    expect(mine.rank).toBe(3_333);
    expect(onTheirPage.rows.map((row) => row.rank)).toContain(3_333);
  });

  it("turning pages does not read the board again", async () => {
    boardSize = 2_500;

    await ask(1);
    await ask(2);
    await ask(3);
    await ask(4);
    await ask(3);
    expect(boardReads).toHaveLength(1);

    await ask(5);
    expect(boardReads).toHaveLength(2);
    // The second block starts where the first ended, not from the top.
    expect(boardReads[1]?.rank).toBe(100);
  });

  it("never asks for more than the server's page limit", async () => {
    boardSize = 2_500;
    await ask(1);
    await ask(80);
    for (const read of boardReads) expect(read.limit).toBeLessThanOrEqual(100);
  });

  it("states that a search covered only the first managers when the board is larger", async () => {
    boardSize = 2_500;

    const page = await ask(1, "team-77");

    expect(page.rows.map((row) => row.rank)).toEqual([
      77, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779,
    ]);
    expect(page.searchLimit).toEqual({ scanned: 2_000, total: 2_500 });
    // The scan is read once: a second search and a page turn cost nothing.
    const reads = boardReads.length;
    await ask(1, "team-88");
    await ask(2, "team-7");
    expect(boardReads).toHaveLength(reads);
  });

  it("does not claim a limit when the whole board was searched", async () => {
    boardSize = 180;

    const page = await ask(1, "team-17");

    expect(page.rows.map((row) => row.rank)).toEqual([
      17, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179,
    ]);
    expect(page.searchLimit).toBeUndefined();
  });
});

describe("a league reaches every member (FANT-03)", () => {
  it("shows the 101st member of a 250-member league through the next page", async () => {
    leagueSize = 250;

    const first = await fantasyService.getLeagueStandingsPage(LEAGUE, null);
    expect(first.rows).toHaveLength(100);
    expect(first.memberCount).toBe(250);
    expect(first.nextCursor).toEqual({ rank: 100, teamId: teamId(100) });

    const second = await fantasyService.getLeagueStandingsPage(LEAGUE, first.nextCursor);
    expect(second.rows[0]?.rank).toBe(101);
    expect(second.rows).toHaveLength(100);
    expect(second.nextCursor).not.toBeNull();

    const third = await fantasyService.getLeagueStandingsPage(LEAGUE, second.nextCursor);
    expect(third.rows).toHaveLength(50);
    expect(third.rows.at(-1)?.rank).toBe(250);
    expect(third.nextCursor).toBeNull();

    const merged = mergeLeagueStandingsPages([first, second, third]);
    expect(merged.rows).toHaveLength(250);
    expect(merged.nextCursor).toBeNull();
    expect(leagueReads.map((read) => read.rank)).toEqual([null, 100, 200]);
  });

  it("keeps the first-page reads (Curva, after joining) on one read", async () => {
    leagueSize = 250;

    const rows = await fantasyService.getLeagueStandings(LEAGUE);

    expect(rows).toHaveLength(100);
    expect(leagueReads).toHaveLength(1);
  });

  it("ends a league of exactly 100 after one more, empty, read", async () => {
    leagueSize = 100;
    const first = await fantasyService.getLeagueStandingsPage(LEAGUE, null);
    const next = await fantasyService.getLeagueStandingsPage(LEAGUE, first.nextCursor);
    expect(next.rows).toHaveLength(0);
    expect(mergeLeagueStandingsPages([first, next]).nextCursor).toBeNull();
  });
});

describe("merging league pages", () => {
  const row = (n: number) => ({
    managerId: teamId(n),
    managerName: `m${n}`,
    teamName: `t${n}`,
    rank: n,
    previousRank: null,
    gameweekScore: 0,
    totalScore: 0,
  });
  const page = (ranks: number[], next: LeagueStandingsPage["nextCursor"]): LeagueStandingsPage => ({
    rows: ranks.map(row),
    memberCount: 9,
    nextCursor: next,
  });

  it("drops a team repeated by an overlapping page, in the server's order", () => {
    const merged = mergeLeagueStandingsPages([
      page([1, 2, 3], { rank: 3, teamId: teamId(3) }),
      page([3, 4, 5], null),
    ]);
    expect(merged.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("stops asking when a page adds nobody new", () => {
    const merged = mergeLeagueStandingsPages([
      page([1, 2, 3], { rank: 3, teamId: teamId(3) }),
      page([2, 3], { rank: 3, teamId: teamId(3) }),
    ]);
    expect(merged.nextCursor).toBeNull();
  });

  it("offers the next position while the last page added rows and named one", () => {
    const cursor = { rank: 6, teamId: teamId(6) };
    const merged = mergeLeagueStandingsPages([
      page([1, 2, 3], { rank: 3, teamId: teamId(3) }),
      page([4, 5, 6], cursor),
    ]);
    expect(merged.nextCursor).toEqual(cursor);
  });
});
