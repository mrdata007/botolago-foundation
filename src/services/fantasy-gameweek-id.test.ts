import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import type { FantasyPlayer } from "@/types/fantasy";
import { forgetSharedFantasyHub } from "./fantasy-hub-share";
import { fantasyService } from "./fantasy-runtime";

/**
 * A read about one gameweek (the top players, the points, a recap) needs the
 * gameweek's id. The hub already names the current one, so asking about it
 * no longer reads the season's list of gameweeks; another gameweek still does,
 * and gets the same id it always did. Cloud mode, as production runs: the
 * repository is spied on, not replaced.
 */

const SEASON = "00000000-0000-4000-8000-000000000001";
const GW3 = "00000000-0000-4000-8000-000000000103";
const GW4 = "00000000-0000-4000-8000-000000000104";
const TEAM = "00000000-0000-4000-8000-0000000000e1";

const hub = {
  season: { id: SEASON, name: "2026/2027", status: "in_progress" },
  gameweek: { id: GW3, sequence: 3, name: "3", status: "live", pointsState: "provisional" },
} as unknown as FantasyHubDto;
const hubWithTeam = { ...hub, team: { id: TEAM } } as unknown as FantasyHubDto;

const repository = SupabaseFantasyRepository.prototype;
const reads = {
  hub: spyOn(repository, "getHub").mockImplementation(async () => hub),
  gameweeks: spyOn(repository, "getGameweeks").mockImplementation(async () => ({
    items: [3, 4].map((sequence) => ({
      id: sequence === 3 ? GW3 : GW4,
      sequence,
      name: String(sequence),
      deadlineAt: "2026-10-03T13:30:00Z",
      startsAt: "2026-10-03T15:00:00Z",
      endsAt: "2026-10-05T21:00:00Z",
      status: "live" as const,
      pointsState: "provisional" as const,
    })),
    nextCursor: null,
  })),
  top: spyOn(repository, "getTopPlayers").mockImplementation(async () => []),
  points: spyOn(repository, "getPoints").mockImplementation(
    async () => ({ result: null, players: [], autoSubstitutions: [] }) as never,
  ),
  summary: spyOn(repository, "getGameweekSummary").mockImplementation(async () => null as never),
  recap: spyOn(repository, "getMyGameweekRecapPublication").mockImplementation(
    async () => ({ publishEnabled: false, publication: null }) as never,
  ),
  publish: spyOn(repository, "publishGameweekRecap").mockImplementation(async () => ({}) as never),
};
const quiet = spyOn(console, "error").mockImplementation(() => {});
const noPool = async () => [] as FantasyPlayer[];

const MODE = "VITE_FANTASY_DATA_MODE";
const modeBefore = process.env[MODE];
beforeAll(() => {
  process.env[MODE] = "supabase";
});
afterAll(() => {
  if (modeBefore === undefined) delete process.env[MODE];
  else process.env[MODE] = modeBefore;
  for (const spy of Object.values(reads)) spy.mockRestore();
  quiet.mockRestore();
});
afterEach(() => {
  forgetSharedFantasyHub();
  for (const spy of Object.values(reads)) spy.mockClear();
});

describe("the top players of a gameweek", () => {
  test("of the current gameweek: its id from the hub, no list of gameweeks", async () => {
    await fantasyService.getTopPlayersOfWeek(3, noPool);
    expect(reads.gameweeks).not.toHaveBeenCalled();
    expect(reads.top).toHaveBeenCalledTimes(1);
    expect(reads.top.mock.calls[0][0]).toBe(GW3);
  });

  test("of another gameweek: the list is read once, for the same id as before", async () => {
    await fantasyService.getTopPlayersOfWeek(4, noPool);
    expect(reads.gameweeks).toHaveBeenCalledTimes(1);
    expect(reads.gameweeks.mock.calls[0][0]).toBe(SEASON);
    expect(reads.top.mock.calls[0][0]).toBe(GW4);
  });

  test("of a gameweek the season does not have: none, and no top-five read", async () => {
    expect(await fantasyService.getTopPlayersOfWeek(9, noPool)).toEqual([]);
    expect(reads.gameweeks).toHaveBeenCalledTimes(1);
    expect(reads.top).not.toHaveBeenCalled();
  });

  test("before the season's first gameweek (no current one): the list as before", async () => {
    reads.hub.mockImplementationOnce(async () => ({ ...hub, gameweek: null }) as never);
    await fantasyService.getTopPlayersOfWeek(3, noPool);
    expect(reads.gameweeks).toHaveBeenCalledTimes(1);
    expect(reads.top.mock.calls[0][0]).toBe(GW3);
  });
});

describe("a team's points and recap for a gameweek", () => {
  test("of the current gameweek: read for the hub's gameweek, no list", async () => {
    reads.hub.mockImplementation(async () => hubWithTeam);
    try {
      await fantasyService.getGameweekResult(3);
      expect(reads.gameweeks).not.toHaveBeenCalled();
      expect(reads.points.mock.calls[0].slice(0, 2)).toEqual([TEAM, GW3]);
      expect(reads.summary.mock.calls[0][0]).toBe(GW3);

      await fantasyService.getMyRecapPublication(3);
      expect(reads.gameweeks).not.toHaveBeenCalled();
      expect(reads.recap.mock.calls[0].slice(0, 2)).toEqual([TEAM, GW3]);
    } finally {
      reads.hub.mockImplementation(async () => hub);
    }
  });

  test("of another gameweek: the list is read, for the same id as before", async () => {
    reads.hub.mockImplementation(async () => hubWithTeam);
    try {
      await fantasyService.getGameweekResult(4);
      expect(reads.gameweeks).toHaveBeenCalledTimes(1);
      expect(reads.points.mock.calls[0].slice(0, 2)).toEqual([TEAM, GW4]);

      forgetSharedFantasyHub();
      await fantasyService.getMyRecapPublication(4);
      expect(reads.gameweeks).toHaveBeenCalledTimes(2);
      expect(reads.recap.mock.calls[0].slice(0, 2)).toEqual([TEAM, GW4]);
    } finally {
      reads.hub.mockImplementation(async () => hub);
    }
  });

  test("publishing a recap names the gameweek asked for, current or not", async () => {
    reads.hub.mockImplementation(async () => hubWithTeam);
    try {
      await fantasyService.publishRecap(3, " Alias ");
      expect(reads.gameweeks).not.toHaveBeenCalled();
      expect(reads.publish.mock.calls[0].slice(0, 3)).toEqual([TEAM, GW3, "Alias"]);

      forgetSharedFantasyHub();
      await fantasyService.publishRecap(4, "Alias");
      expect(reads.gameweeks).toHaveBeenCalledTimes(1);
      expect(reads.publish.mock.calls[1].slice(0, 3)).toEqual([TEAM, GW4, "Alias"]);

      forgetSharedFantasyHub();
      await expect(fantasyService.publishRecap(9, "Alias")).rejects.toThrow(
        "fantasy_gameweek_not_found",
      );
      expect(reads.publish).toHaveBeenCalledTimes(2);
    } finally {
      reads.hub.mockImplementation(async () => hub);
    }
  });

  test("of a gameweek the season does not have: nothing, and no points read", async () => {
    reads.hub.mockImplementation(async () => hubWithTeam);
    try {
      expect(await fantasyService.getGameweekResult(9)).toBeUndefined();
      expect(reads.points).not.toHaveBeenCalled();
    } finally {
      reads.hub.mockImplementation(async () => hub);
    }
  });
});
