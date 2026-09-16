import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { presentFootballClub, selectFootballDataMode } from "./football";

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

  test("keeps missing match data truthful after full time", () => {
    const route = readFileSync(new URL("../routes/matches.$matchId.tsx", import.meta.url), "utf8");
    const stats = readFileSync(
      new URL("../components/matches/StatComparison.tsx", import.meta.url),
      "utf8",
    );
    const scoreHeader = readFileSync(
      new URL("../components/matches/MatchScoreHeader.tsx", import.meta.url),
      "utf8",
    );
    const timeline = readFileSync(
      new URL("../components/matches/EventTimeline.tsx", import.meta.url),
      "utf8",
    );
    const tabs = readFileSync(
      new URL("../components/matches/MatchTabs.tsx", import.meta.url),
      "utf8",
    );

    expect(route).toContain('isFinished={match.status === "finished"}');
    expect(route).toContain('to="/matches"');
    expect(route).toContain('error.code === "fixture_not_found"');
    expect(stats).toContain('"matches.detail.no_stats_finished"');
    expect(timeline).toContain('"matches.detail.no_events_finished"');
    expect(scoreHeader).toContain("venue && (");
    expect(tabs).not.toContain('{ key: "momentum"');
  });
});
