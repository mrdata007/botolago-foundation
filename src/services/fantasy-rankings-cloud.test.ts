import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import type {
  FantasyGameweekDto,
  FantasyHubDto,
  FantasyLeagueStandingPageDto,
  FantasyOverallStandingDto,
  FantasyOverallStandingPageDto,
} from "@/backend/fantasy/contracts";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { fantasyService } from "./fantasy-runtime";

/**
 * FANT-04 — the cloud rankings, run through the runtime service in the mode
 * production uses, over the repository spied to answer as the server does.
 *
 * What the round tab must do: ask the server for the round's own board (a
 * gameweek id, newest scored round first), skip a round that has no board yet,
 * and hand back the server's order, ranks and previous ranks untouched. What the
 * overall tab must do: ask for the season board (no gameweek id). The
 * browser sorts and ranks nothing.
 *
 * Spies on the real class, undone below, rather than `mock.module`: a module
 * mock is process-wide in Bun (see `fantasy-leagues-step-up.test.ts`).
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-00000000${String(n).padStart(4, "0")}`;
const GW1 = id(101);
const GW2 = id(102);
const GW3 = id(103);
const GW4 = id(104);
const LEAGUE = id(301);

const hub: FantasyHubDto = {
  season: { id: SEASON, name: "2026/2027", status: "active" },
  gameweek: null,
  enrolmentGameweek: null,
  team: null,
  rankingAvailable: true,
};

const gameweek = (
  gwId: string,
  sequence: number,
  status: FantasyGameweekDto["status"],
): FantasyGameweekDto => ({
  id: gwId,
  sequence,
  name: String(sequence),
  deadlineAt: "2026-10-01T00:00:00Z",
  startsAt: "2026-10-01T00:00:00Z",
  endsAt: "2026-10-07T00:00:00Z",
  status,
  pointsState: status === "finalized" ? "final" : "provisional",
});

// Deliberately listed out of order: the service must sort, not trust the list.
const gameweeks = [
  gameweek(GW2, 2, "finalized"),
  gameweek(GW4, 4, "open"),
  gameweek(GW1, 1, "finalized"),
  gameweek(GW3, 3, "live"),
];

const standing = (
  team: number,
  rank: number,
  previousRank: number | null,
  totalPoints: number,
  gameweekPoints: number,
): FantasyOverallStandingDto => ({
  teamId: id(200 + team),
  teamName: `team-${team}`,
  managerName: `manager-${team}`,
  rank,
  previousRank,
  totalPoints,
  gameweekPoints,
  calculatedAt: "2026-10-14T10:00:00Z",
});

/** The boards the "server" holds, keyed by the gameweek id asked for ("season" = null). */
let boards: Record<string, FantasyOverallStandingDto[]> = {};
/** Which board each read asked for, in order. */
const asked: Array<string | null | undefined> = [];
/** What the next league standings read answers with. */
let leaguePage: FantasyLeagueStandingPageDto;

const spies = [
  spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(async () => hub),
  spyOn(SupabaseFantasyRepository.prototype, "getGameweeks").mockImplementation(async () => ({
    items: gameweeks,
    nextCursor: null,
  })),
  spyOn(SupabaseFantasyRepository.prototype, "getOverallStandings").mockImplementation(
    async (input) => {
      asked.push(input.gameweekId);
      const items = boards[input.gameweekId ?? "season"] ?? [];
      // The server's own standing for the caller: the second row of the board.
      const page: FantasyOverallStandingPageDto = {
        seasonId: SEASON,
        gameweekId: input.gameweekId ?? null,
        items,
        nextCursor: null,
        total: items.length,
        myRank: items[1] ?? null,
      };
      return page;
    },
  ),
  spyOn(SupabaseFantasyRepository.prototype, "getLeagueStandings").mockImplementation(
    async () => leaguePage,
  ),
  // No Supabase configuration in the test process: the session lookup says so
  // on the console and the read goes on for an unknown visitor.
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
  asked.length = 0;
  boards = {};
});

const query = (sort: "overall" | "gameweek") => ({ page: 1, pageSize: 50, sort, query: "" });
const shape = (
  rows: ReadonlyArray<{ managerId: string; rank: number; previousRank: number | null }>,
) => rows.map((row) => [row.managerId, row.rank, row.previousRank]);

describe("cloud round board (FANT-04)", () => {
  it("reads the newest scored round and returns the server's order, ranks and previous ranks untouched", async () => {
    // Round 3 has a board. The server put team 2 first on a tie with team 1
    // (which has far more season points); the browser must not reorder them.
    boards[GW3] = [
      standing(2, 1, null, 10, 50),
      standing(1, 2, 3, 200, 50),
      standing(3, 3, 1, 5, 20),
    ];
    const page = await fantasyService.getGlobalRankings(query("gameweek"));

    expect(asked).toEqual([GW3]);
    expect(shape(page.rows)).toEqual([
      [id(202), 1, null],
      [id(201), 2, 3],
      [id(203), 3, 1],
    ]);
    expect(page.total).toBe(3);
    // The signed-in manager's standing is the round's own, as the server gave it.
    expect(page.myRank?.managerId).toBe(id(201));
    expect(page.myRank?.rank).toBe(2);
    expect(page.myRank?.previousRank).toBe(3);
  });

  it("skips an empty live round and reads the previous round, newest first", async () => {
    boards[GW2] = [
      standing(2, 1, null, 10, 50),
      standing(1, 2, 3, 200, 50),
      standing(3, 3, 1, 5, 20),
    ];
    const page = await fantasyService.getGlobalRankings(query("gameweek"));

    // GW4 is only open and is never asked for; GW3 is empty; GW2 answers.
    expect(asked).toEqual([GW3, GW2]);
    expect(shape(page.rows)).toEqual([
      [id(202), 1, null],
      [id(201), 2, 3],
      [id(203), 3, 1],
    ]);
  });

  it("tries at most three scored rounds, then answers with an empty page", async () => {
    const page = await fantasyService.getGlobalRankings(query("gameweek"));

    expect(asked).toEqual([GW3, GW2, GW1]);
    expect(page).toEqual({ rows: [], total: 0, podium: [] });
  });

  it("pages and searches the round board in the server's order", async () => {
    boards[GW3] = [
      standing(1, 1, null, 1, 9),
      standing(2, 2, null, 2, 9),
      standing(3, 3, null, 3, 9),
    ];
    const second = await fantasyService.getGlobalRankings({
      ...query("gameweek"),
      pageSize: 2,
      page: 2,
    });
    expect(shape(second.rows)).toEqual([[id(203), 3, null]]);
    const found = await fantasyService.getGlobalRankings({ ...query("gameweek"), query: "team-2" });
    expect(shape(found.rows)).toEqual([[id(202), 2, null]]);
  });
});

describe("cloud overall board (FANT-04)", () => {
  it("asks for the season board, with no gameweek", async () => {
    boards["season"] = [standing(1, 1, null, 200, 50), standing(2, 2, 5, 100, 50)];
    const page = await fantasyService.getGlobalRankings(query("overall"));

    expect(asked).toEqual([null]);
    // Real movement is kept; an unknown earlier rank is null, not the current rank.
    expect(shape(page.rows)).toEqual([
      [id(201), 1, null],
      [id(202), 2, 5],
    ]);
  });
});

describe("cloud league standings (FANT-04)", () => {
  it("passes an unknown earlier rank through as null", async () => {
    leaguePage = {
      league: { id: LEAGUE, name: "Amis", visibility: "private", memberCount: 2 },
      items: [
        {
          teamId: id(201),
          teamName: "team-1",
          managerName: "manager-1",
          rank: 1,
          previousRank: null,
          totalPoints: 20,
          gameweekPoints: 5,
          calculatedAt: "2026-10-14T10:00:00Z",
        },
        {
          teamId: id(202),
          teamName: "team-2",
          managerName: "manager-2",
          rank: 2,
          previousRank: 4,
          totalPoints: 10,
          gameweekPoints: 5,
          calculatedAt: "2026-10-14T10:00:00Z",
        },
      ],
    };
    const rows = await fantasyService.getLeagueStandings(LEAGUE);
    expect(shape(rows)).toEqual([
      [id(201), 1, null],
      [id(202), 2, 4],
    ]);
  });
});
