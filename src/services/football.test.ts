import { describe, expect, test } from "bun:test";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import {
  footballService,
  inPlayFixtures,
  presentFootballClub,
  selectFootballDataMode,
} from "./football";

const context = { actorId: null, requestId: "test" } as const;

describe("Football frontend repository cutover", () => {
  test("fails closed when production mode is not configured", () => {
    expect(() => selectFootballDataMode(undefined, true)).toThrow(
      "VITE_FOOTBALL_DATA_MODE=supabase",
    );
    expect(() => selectFootballDataMode("mock", true)).toThrow("VITE_FOOTBALL_DATA_MODE=supabase");
    expect(selectFootballDataMode(undefined, false)).toBe("mock");
    expect(selectFootballDataMode("supabase", true)).toBe("supabase");
  });

  test("preserves deterministic mock and bilingual DTO contracts", async () => {
    const repository = new MockFootballRepository();
    const french = await repository.getHomeMatches("fr", 3, context);
    const arabic = await repository.getHomeMatches("ar", 3, context);
    expect(french).toHaveLength(3);
    expect(french[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(french[0]?.homeTeam.name).not.toBe(arabic[0]?.homeTeam.name);
    expect(french[0]?.status).toBe("live_second_half");
  });

  test("supports match detail and head-to-head without scanning in route components", async () => {
    const repository = new MockFootballRepository();
    const matches = await repository.getHomeMatches("fr", 3, context);
    const detail = await repository.getMatchDetail(matches[0]!.id, "fr", context);
    const headToHead = await repository.getHeadToHead(detail.id, "fr", 5, context);
    expect(detail.id).toBe(matches[0]!.id);
    expect(Array.isArray(headToHead)).toBe(true);
  });

  test("browses current and historical seasons with season-scoped match dates", async () => {
    const repository = new MockFootballRepository();
    const seasons = await repository.getSeasons("fr", 12, context);
    expect(seasons).toHaveLength(4);
    expect(seasons[0]?.isCurrent).toBe(true);

    const historical = seasons[1]!;
    expect(historical.lastMatchDate).not.toBeNull();
    const page = await repository.getMatchesByDate(
      {
        date: historical.lastMatchDate!,
        language: "fr",
        seasonId: historical.id,
        limit: 100,
      },
      context,
    );

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((match) => match.seasonId === historical.id)).toBe(true);
    expect(page.items.every((match) => match.status === "finished")).toBe(true);
  });

  test("maps football crest storage into the club presentation model", async () => {
    const repository = new MockFootballRepository();
    const matches = await repository.getHomeMatches("fr", 1, context);
    const team = matches[0]!.homeTeam;
    const club = presentFootballClub(
      { ...team, crestUrl: null, crestPath: "football/teams/1001/crest.png" },
      "https://botolago-test.supabase.co",
    );

    expect(club.crestUrl).toBe(
      "https://botolago-test.supabase.co/storage/v1/object/public/football-media/football/teams/1001/crest.png",
    );
    expect(club.crestPlaceholder).toBe(team.code);
  });

  test("match detail page exposes lineups without fabricating data when the provider has none", async () => {
    const repository = new MockFootballRepository();
    const matches = await repository.getHomeMatches("fr", 1, context);
    const detail = await footballService.getMatchDetailPage(matches[0]!.id, "fr");

    // The mock provider has not published lineups yet — the page must say
    // so via an empty array rather than inventing a line-up.
    expect(Array.isArray(detail.lineups)).toBe(true);
    expect(detail.lineups).toHaveLength(0);
    expect(detail.match.id).toBe(matches[0]!.id);
  });

  test("standings rows expose full W/D/L/form so the table never needs invented stats", async () => {
    const repository = new MockFootballRepository();
    const seasons = await repository.getSeasons("fr", 12, context);
    const current = seasons.find((s) => s.isCurrent)!;
    const standings = await repository.getStandings(current.id, "fr", context);

    expect(standings.length).toBeGreaterThan(0);
    for (const row of standings) {
      expect(row.played).toBe(row.won + row.drawn + row.lost);
      expect(typeof row.form === "string" || row.form === null).toBe(true);
    }
  });
});

describe("the live strip's fixtures", () => {
  test("keeps only fixtures in play: delayed and suspended ones are not live", () => {
    const fixtures = [
      { id: "a", status: "live_first_half" },
      { id: "b", status: "delayed" },
      { id: "c", status: "half_time" },
      { id: "d", status: "suspended" },
      { id: "e", status: "live_second_half" },
      { id: "f", status: "penalties" },
    ] as const;
    expect(inPlayFixtures(fixtures).map((fixture) => fixture.id)).toEqual(["a", "c", "e", "f"]);
  });
});
