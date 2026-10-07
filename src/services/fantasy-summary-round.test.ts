import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import type { FantasyHistoryPageDto, FantasyHubDto } from "@/backend/fantasy/contracts";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { forgetSharedFantasyHub } from "./fantasy-hub-share";
import { fantasyService } from "./fantasy-runtime";
import { gameweekResults } from "@/mocks/fantasy-data";

/**
 * BG-0155 (2) — the summary says which round its points belong to.
 *
 * `gameweekPoints` is the current gameweek's result, or else the latest one
 * the team has, and the hub used to print it under "Points de la journée"
 * beside this round's deadline: last round's 58 read as this round's.
 * `pointsGameweek` is the `sequence` of the very history row the figure is
 * read from, and `null` when there is no row (the figure is then a 0 that
 * means "nothing yet"). This runs the runtime service in the mode production
 * runs, over the repository spied to answer as the database would.
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const GW13 = "00000000-0000-4000-8000-000000000113";
const GW14 = "00000000-0000-4000-8000-000000000114";
const TEAM = "00000000-0000-4000-8000-000000000201";

const hub: FantasyHubDto = {
  season: { id: SEASON, name: "2026/2027", status: "active" },
  gameweek: {
    id: GW14,
    sequence: 14,
    name: "14",
    deadlineAt: "2099-10-02T14:30:00Z",
    status: "open",
    pointsState: "provisional",
  },
  enrolmentGameweek: null,
  team: {
    id: TEAM,
    seasonId: SEASON,
    currentGameweekId: GW14,
    name: "Atlas XI",
    bank: 1.4,
    teamValue: 100.3,
    freeTransfers: 1,
    version: 3,
    status: "active",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    squad: [],
    lineup: [],
    chips: { active: null, activeCancellable: false, used: [] },
  },
  rankingAvailable: true,
};

type HistoryRow = FantasyHistoryPageDto["items"][number];
const row = (gameweekId: string, sequence: number, score: number): HistoryRow => ({
  gameweekId,
  sequence,
  name: String(sequence),
  score,
  state: "final",
  transferHit: 0,
  chipType: null,
  rank: 4_129,
  overallRank: 12_483,
  teamValue: 100.3,
  bank: 1.4,
});

/** What `get_my_fantasy_history` answers next: most recent round first. */
let history: HistoryRow[] = [];

const spies = [
  spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(async () => hub),
  spyOn(SupabaseFantasyRepository.prototype, "getHistory").mockImplementation(async () => ({
    items: history,
    nextCursor: null,
  })),
  // The test process has no Supabase configuration: asked whose session a
  // read carries, the client says so on the console. Not this file's concern.
  spyOn(console, "error").mockImplementation(() => {}),
];

// The runtime reads its mode on every call; production runs `supabase`.
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
  forgetSharedFantasyHub();
});

describe("getSummary names the round its points belong to", () => {
  it("the current round's result: its figure and its sequence", async () => {
    history = [row(GW14, 14, 37), row(GW13, 13, 58)];
    const summary = await fantasyService.getSummary();
    expect(summary?.gameweekPoints).toBe(37);
    expect(summary?.pointsGameweek).toBe(14);
    expect(summary?.totalPoints).toBe(95);
  });

  it("no result yet for the current round: the latest round's figure, and that round", async () => {
    // The sample's state: round 14 is open, the 58 points are round 13's.
    history = [row(GW13, 13, 58)];
    const summary = await fantasyService.getSummary();
    expect(summary?.gameweekPoints).toBe(58);
    expect(summary?.pointsGameweek).toBe(13);
  });

  it("an empty history: no round, and the 0 it carries is not a score", async () => {
    history = [];
    const summary = await fantasyService.getSummary();
    expect(summary?.pointsGameweek).toBeNull();
    // Unchanged for the screens that read it (Home's card), which is why the
    // hub checks `pointsGameweek` before it prints the figure.
    expect(summary?.gameweekPoints).toBe(0);
    expect(summary?.gameweekRank).toBeNull();
  });
});

describe("the sample (mock mode)", () => {
  it("carries round 13 for round 13's own total, while its current round is 14", async () => {
    process.env[MODE] = "mock";
    try {
      const [summary, gameweek] = await Promise.all([
        fantasyService.getSummary(),
        fantasyService.getCurrentGameweek(),
      ]);
      // The hub's figure and the Points screen it opens agree in the sample.
      const round13 = gameweekResults.find((result) => result.gameweek === 13);
      expect(round13?.breakdown.length).toBeGreaterThan(0);
      expect(summary?.gameweekPoints).toBe(round13?.totalPoints);
      expect(summary?.pointsGameweek).toBe(13);
      expect(gameweek.number).toBe(14);
    } finally {
      process.env[MODE] = "supabase";
    }
  });
});
