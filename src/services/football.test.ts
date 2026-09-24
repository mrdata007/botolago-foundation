import { describe, expect, test } from "bun:test";
import type { MatchCardDto, StandingRowDto } from "@/backend/football/contracts";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import {
  buildStandings,
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

describe("the season table", () => {
  const repository = new MockFootballRepository();

  /** A completed mock season: every fixture finished, with a score. */
  async function completedSeason() {
    const seasons = await repository.getSeasons("fr", 12, context);
    const season = seasons.find((candidate) => candidate.status === "completed")!;
    const fixtures = await repository.getSeasonFixtures(
      season.competition.id,
      season.id,
      "fr",
      context,
    );
    return { season, fixtures };
  }

  /** The table `rows` describe, as the provider would store it. */
  function storedFrom(
    fixtures: readonly MatchCardDto[],
    rows: ReturnType<typeof buildStandings>["overall"],
  ): StandingRowDto[] {
    const teams = new Map(
      fixtures.flatMap((fixture) => [
        [fixture.homeTeam.id, fixture.homeTeam],
        [fixture.awayTeam.id, fixture.awayTeam],
      ]),
    );
    return rows.map((row, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      rank: row.position,
      team: teams.get(row.clubId)!,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
      form: null,
      qualificationCode: null,
      providerUpdatedAt: "2026-07-06T00:00:00+00:00",
    }));
  }

  test("reads a whole season's fixtures, in kickoff order", async () => {
    const { fixtures } = await completedSeason();
    expect(fixtures.length).toBeGreaterThan(0);
    const kickoffs = fixtures.map((fixture) => fixture.kickoffAt);
    expect(kickoffs).toEqual([...kickoffs].sort());
  });

  test("with no stored table, works the table out from the finished results", async () => {
    const { fixtures } = await completedSeason();
    const standings = buildStandings(fixtures, []);
    const clubs = new Set(fixtures.flatMap((f) => [f.homeTeam.id, f.awayTeam.id]));

    expect(standings.overall).toHaveLength(clubs.size);
    expect(standings.overall.map((row) => row.position)).toEqual(
      standings.overall.map((_, index) => index + 1),
    );
    const sum = (key: "won" | "lost" | "goalsFor" | "goalsAgainst") =>
      standings.overall.reduce((total, row) => total + row[key], 0);
    expect(sum("won")).toBe(sum("lost"));
    expect(sum("goalsFor")).toBe(sum("goalsAgainst"));
    for (const row of standings.overall) expect(row.points).toBe(row.won * 3 + row.drawn);
    expect(standings.rounds).toBeGreaterThan(0);
    expect(standings.home.length).toBe(clubs.size);
    expect(standings.away.length).toBe(clubs.size);
  });

  test("keeps a stored table covering as many matches, and adds the form from the results", async () => {
    const { fixtures } = await completedSeason();
    const computed = buildStandings(fixtures, []).overall;
    // The provider's order differs from the results' — as a points deduction would make it.
    const deducted = storedFrom(fixtures, computed).map((row) =>
      row.rank === 1 ? { ...row, rank: 2 } : row.rank === 2 ? { ...row, rank: 1 } : row,
    );
    const standings = buildStandings(fixtures, deducted);

    expect(standings.overall.slice(0, 2).map((row) => row.clubId)).toEqual([
      computed[1]!.clubId,
      computed[0]!.clubId,
    ]);
    expect(standings.overall[0]!.form).toEqual(computed[1]!.form);
  });

  test("drops a stored table that covers fewer matches than the results", async () => {
    const { fixtures } = await completedSeason();
    const computed = buildStandings(fixtures, []).overall;
    const stale = storedFrom(fixtures, computed)
      .reverse()
      .map((row, index) => ({ ...row, rank: index + 1, played: 1 }));

    expect(buildStandings(fixtures, stale).overall.map((row) => row.clubId)).toEqual(
      computed.map((row) => row.clubId),
    );
  });

  test("has no table before the first result, and counts only finished matches with a score", async () => {
    const { fixtures } = await completedSeason();
    const upcoming = fixtures.map((fixture) => ({
      ...fixture,
      status: "not_started" as const,
      homeScore: null,
      awayScore: null,
    }));
    const empty = buildStandings(upcoming, []);
    expect([empty.overall, empty.home, empty.away, empty.rounds]).toEqual([[], [], [], 0]);
    expect(empty.clubs.length).toBeGreaterThan(0);

    const [first, ...rest] = upcoming;
    const scoreless = { ...first!, status: "finished" as const };
    const postponed = { ...fixtures[1]!, status: "postponed" as const };
    expect(buildStandings([scoreless, postponed, ...rest.slice(1)], []).overall).toEqual([]);
  });

  test("the service reads the season's fixtures and its stored table together", async () => {
    const seasons = await footballService.getSeasons("fr");
    const current = seasons.find((season) => season.isCurrent)!;
    expect(current.competitionId).toMatch(/^[0-9a-f-]{36}$/);
    const standings = await footballService.getStandings(current, "fr");
    // The mock provider's table covers more matches than the mock results.
    expect(standings.overall.length).toBeGreaterThan(0);
    expect(standings.rounds).toBe(Math.max(...standings.overall.map((row) => row.played)));
  });
});
