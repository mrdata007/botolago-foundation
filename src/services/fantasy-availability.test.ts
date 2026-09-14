import { describe, expect, it } from "bun:test";
import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { FantasyError } from "@/backend/fantasy/errors";
import { dictionaries } from "@/i18n/dictionaries";
import { fantasyRouteUnavailableReason, readFantasyAvailability } from "./fantasy-availability";

const now = Date.parse("2026-09-14T12:00:00Z");
const activeHub: FantasyHubDto = {
  season: { id: "00000000-0000-4000-8000-000000000001", name: "2026/27", status: "active" },
  gameweek: {
    id: "00000000-0000-4000-8000-000000000002",
    sequence: 1,
    name: "Journée 1",
    deadlineAt: "2026-09-15T12:00:00Z",
    status: "open",
    pointsState: "provisional",
  },
  team: null,
  rankingAvailable: false,
};

describe("Fantasy availability", () => {
  it("treats the production PT404 season-closed response as an expected empty state", async () => {
    const loadHub = async (): Promise<FantasyHubDto> => {
      throw { code: "PT404", message: "fantasy_season_closed", details: null };
    };
    expect(await readFantasyAvailability(loadHub, now)).toEqual({ status: "season_closed" });
  });

  it("recognizes the repository's typed season-closed error", async () => {
    expect(
      await readFantasyAvailability(async () => {
        throw new FantasyError(
          "fantasy_season_closed",
          "The Fantasy operation could not be completed.",
        );
      }, now),
    ).toEqual({ status: "season_closed" });
  });

  it("preserves permission, network, malformed-data and unrelated missing-resource failures", async () => {
    for (const error of [
      new TypeError("Failed to fetch"),
      { code: "42501", message: "permission denied" },
      { code: "PT404", message: "league_not_found" },
      new FantasyError("data_unavailable", "The Fantasy API returned an invalid DTO."),
    ]) {
      await expect(
        readFantasyAvailability(async () => {
          throw error;
        }, now),
      ).rejects.toBe(error);
    }
  });

  it("keeps planned seasons and missing gameweeks unavailable without creating substitute IDs", async () => {
    expect(
      await readFantasyAvailability(async () => ({ ...activeHub, gameweek: null }), now),
    ).toEqual({ status: "awaiting_gameweek" });
    expect(
      await readFantasyAvailability(
        async () => ({
          ...activeHub,
          season: { ...activeHub.season, status: "planned" },
        }),
        now,
      ),
    ).toEqual({ status: "season_closed" });
  });

  it("allows real open-season routes and only closes creation after the deadline", async () => {
    const open = await readFantasyAvailability(async () => activeHub, now);
    expect(open).toEqual({ status: "ready", canCreate: true });
    expect(fantasyRouteUnavailableReason(open, "/fantasy/create")).toBeNull();

    const expired = await readFantasyAvailability(
      async () => activeHub,
      Date.parse(activeHub.gameweek!.deadlineAt),
    );
    expect(expired).toEqual({ status: "ready", canCreate: false });
    expect(fantasyRouteUnavailableReason(expired, "/fantasy/create/")).toBe("registration_closed");
    expect(fantasyRouteUnavailableReason(expired, "/fantasy/points")).toBeNull();
    expect(fantasyRouteUnavailableReason(expired, "/fantasy/leagues")).toBeNull();
  });

  it("does not permit creation in a locked gameweek even with a future deadline", async () => {
    expect(
      await readFantasyAvailability(
        async () => ({
          ...activeHub,
          gameweek: { ...activeHub.gameweek!, status: "locked" },
        }),
        now,
      ),
    ).toEqual({ status: "ready", canCreate: false });
  });

  it("reopens automatically when an activated season becomes available", async () => {
    let activated = false;
    const loadHub = async () => {
      if (!activated) throw new FantasyError("fantasy_season_closed", "Closed");
      return { ...activeHub, season: { ...activeHub.season, status: "registration_open" } };
    };
    expect((await readFantasyAvailability(loadHub, now)).status).toBe("season_closed");
    activated = true;
    expect(await readFantasyAvailability(loadHub, now)).toEqual({
      status: "ready",
      canCreate: true,
    });
  });

  it("gates every Fantasy route when the season is unavailable", () => {
    for (const route of [
      "",
      "/create",
      "/players",
      "/team",
      "/points",
      "/transfers",
      "/leagues",
      "/rankings",
      "/rules",
      "/fixtures",
      "/top-players",
    ]) {
      expect(fantasyRouteUnavailableReason({ status: "season_closed" }, `/fantasy${route}`)).toBe(
        "season_closed",
      );
    }
  });

  it("provides French and Arabic copy for each expected unavailable state", () => {
    for (const reason of ["season_closed", "awaiting_gameweek", "registration_closed"] as const) {
      for (const field of ["title", "body"] as const) {
        const key = `fantasy.availability.${reason}.${field}` as const;
        expect(dictionaries.fr[key].length).toBeGreaterThan(0);
        expect(dictionaries.ar[key]).toMatch(/[\u0600-\u06ff]/);
      }
    }
  });
});
