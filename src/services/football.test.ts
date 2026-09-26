import { describe, expect, test } from "bun:test";
import type { MatchCardDto, StandingRowDto, TeamSummaryDto } from "@/backend/football/contracts";
import { mapFootballError } from "@/backend/football/errors";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { tableZones } from "@/lib/league-table";
import {
  buildStandings,
  footballService,
  hasLeagueTable,
  inPlayFixtures,
  presentFootballClub,
  selectFootballDataMode,
  toMatch,
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

  test("the match page's payload names its season and reads no table: the tab reads the Classement's", async () => {
    const repository = new MockFootballRepository();
    const [fixture] = await repository.getHomeMatches("fr", 1, context);
    const stored = MockFootballRepository.prototype.getStandings;
    let tableReads = 0;
    MockFootballRepository.prototype.getStandings = function (...args) {
      tableReads += 1;
      return stored.apply(this, args);
    };
    try {
      // Refetched every 30 seconds through a live match: no table in it.
      const detail = await footballService.getMatchDetailPage(fixture!.id, "fr");
      expect(tableReads).toBe(0);
      expect("standings" in detail).toBe(false);
      expect(detail.season).toEqual({
        id: fixture!.seasonId,
        competitionId: fixture!.competition.id,
        competitionType: "league",
      });
      expect(hasLeagueTable(detail.season)).toBe(true);
      // Its season asks for the table the Classement tab shows for that season.
      const season = (await footballService.getSeasons("fr")).find(
        (candidate) => candidate.id === detail.season.id,
      )!;
      expect(await footballService.getStandings(detail.season, "fr")).toEqual(
        await footballService.getStandings(season, "fr"),
      );
    } finally {
      MockFootballRepository.prototype.getStandings = stored;
    }
  });

  test("a match names the kind of competition it is in: only a league's season has a table", async () => {
    const repository = new MockFootballRepository();
    const [fixture] = await repository.getHomeMatches("fr", 1, context);
    const stored = MockFootballRepository.prototype.getMatchDetail;
    for (const type of ["cup", "super_cup", "international", "friendly"] as const) {
      // The same fixture, played in a competition of that kind.
      MockFootballRepository.prototype.getMatchDetail = async function (...args) {
        const detail = await stored.apply(this, args);
        return { ...detail, competition: { ...detail.competition, type } };
      };
      try {
        const detail = await footballService.getMatchDetailPage(fixture!.id, "fr");
        expect(detail.season).toEqual({
          id: fixture!.seasonId,
          competitionId: fixture!.competition.id,
          competitionType: type,
        });
        expect([type, hasLeagueTable(detail.season)]).toEqual([type, false]);
      } finally {
        MockFootballRepository.prototype.getMatchDetail = stored;
      }
    }
    expect(hasLeagueTable({ competitionType: "league" })).toBe(true);
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

describe("club pages", () => {
  test("a club's fixtures come newest first and page backwards from a cursor", async () => {
    const repository = new MockFootballRepository();
    const [club] = await repository.getTeams("fr", 1, context);
    const all = await repository.getTeamFixtures(
      { teamId: club!.id, language: "fr", limit: 100 },
      context,
    );
    expect(all.length).toBeGreaterThan(2);
    expect(all.every((m) => m.homeTeam.id === club!.id || m.awayTeam.id === club!.id)).toBe(true);
    const kickoffs = all.map((m) => Date.parse(m.kickoffAt));
    expect(kickoffs).toEqual([...kickoffs].sort((a, b) => b - a));

    const first = await repository.getTeamFixtures(
      { teamId: club!.id, language: "fr", limit: 2 },
      context,
    );
    const next = await repository.getTeamFixtures(
      {
        teamId: club!.id,
        language: "fr",
        limit: 2,
        before: { kickoffAt: first[1]!.kickoffAt, id: first[1]!.id },
      },
      context,
    );
    expect([...first, ...next].map((m) => m.id)).toEqual(all.slice(0, 4).map((m) => m.id));
  });

  test("a competition's fixtures come oldest first, one season, with a cursor to the next page", async () => {
    const repository = new MockFootballRepository();
    const [season] = await repository.getSeasons("fr", 1, context);
    const page = await repository.getCompetitionFixtures(
      { competitionId: season!.competition.id, seasonId: season!.id, language: "fr", limit: 2 },
      context,
    );
    expect(page.items).toHaveLength(2);
    expect(page.items.every((m) => m.seasonId === season!.id)).toBe(true);
    expect(page.nextCursor).toEqual({ kickoffAt: page.items[1]!.kickoffAt, id: page.items[1]!.id });
  });

  test("a squad lists the club's players, and an unknown club is not found", async () => {
    const repository = new MockFootballRepository();
    const [club] = await repository.getTeams("fr", 1, context);
    const squad = await footballService.getClubSquad(club!.id, null, "fr");
    expect(squad.length).toBeGreaterThan(0);
    expect(squad.every((player) => player.role === "player")).toBe(true);
    await expect(
      repository.getTeamSquad("00000099-0000-4000-8000-000000000099", null, "fr", context),
    ).rejects.toMatchObject({ code: "team_not_found" });
    await expect(
      footballService.getClub("00000099-0000-4000-8000-000000000099", "fr"),
    ).rejects.toMatchObject({ code: "team_not_found" });
  });

  test("a club's season holds only that season's matches, oldest first, each naming the club", async () => {
    const repository = new MockFootballRepository();
    const [club] = await repository.getTeams("fr", 1, context);
    const seasons = await footballService.getSeasons("fr");
    const past = seasons.find((season) => !season.isCurrent)!;
    const page = await footballService.getClubSeasonMatches(club!.id, past, "fr");
    expect(page.matches.length).toBeGreaterThan(0);
    const all = await repository.getTeamFixtures(
      { teamId: club!.id, language: "fr", limit: 100 },
      context,
    );
    expect(page.matches.map((m) => m.id).sort()).toEqual(
      all
        .filter((m) => m.seasonId === past.id)
        .map((m) => m.id)
        .sort(),
    );
    expect(page.matches.every((m) => m.status === "finished")).toBe(true);
    const kickoffs = page.matches.map((m) => Date.parse(m.kickoff));
    expect(kickoffs).toEqual([...kickoffs].sort((a, b) => a - b));
    expect(page.clubs.some((c) => c.id === club!.id)).toBe(true);
  });

  test("a club's played seasons are those with a result for it, the past season among them", async () => {
    const repository = new MockFootballRepository();
    const [club] = await repository.getTeams("fr", 1, context);
    const seasons = await footballService.getSeasons("fr");
    const past = seasons.find((season) => !season.isCurrent)!;
    const played = await footballService.getClubSeasonsPlayed(club!.id, "fr");
    expect(played).toContain(past.id);
    expect(new Set(played).size).toBe(played.length);
    const all = await repository.getTeamFixtures(
      { teamId: club!.id, language: "fr", limit: 100 },
      context,
    );
    const withResult = new Set(
      all
        .filter((m) => m.status === "finished" && m.homeScore !== null && m.awayScore !== null)
        .map((m) => m.seasonId),
    );
    expect([...played].sort()).toEqual([...withResult].sort());
  });

  test("the directory lists the current season's clubs by name", async () => {
    const directory = await footballService.getClubDirectory("fr");
    expect(directory.season?.isCurrent).toBe(true);
    const names = directory.clubs.map((club) => club.name.fr);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
    expect(new Set(directory.clubs.map((club) => club.id)).size).toBe(directory.clubs.length);
  });

  test("the database's TEAM_NOT_FOUND is a not-found, not an outage", () => {
    expect(mapFootballError({ code: "P0002", message: "TEAM_NOT_FOUND" }).code).toBe(
      "team_not_found",
    );
  });
});

describe("a fixture called off", () => {
  test("cancelled and abandoned are called off; postponed and suspended are still to come", async () => {
    const repository = new MockFootballRepository();
    const [club] = await repository.getTeams("fr", 1, context);
    const [fixture] = await repository.getTeamFixtures(
      { teamId: club!.id, language: "fr", limit: 1 },
      context,
    );
    const as = (status: MatchCardDto["status"]) => toMatch({ ...fixture!, status });
    const statuses = ["cancelled", "abandoned", "postponed", "suspended"] as const;
    expect(statuses.map((status) => as(status).calledOff)).toEqual([true, true, false, false]);
    // Called off or not, all four still read as postponed.
    expect(statuses.map((status) => as(status).status)).toEqual([
      "postponed",
      "postponed",
      "postponed",
      "postponed",
    ]);
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
    expect(standings.computed).toBe(false);
  });

  test("a table worked out from the results says so; the provider's does not", async () => {
    const { fixtures } = await completedSeason();
    const fromResults = buildStandings(fixtures, []);
    expect(fromResults.computed).toBe(true);
    expect(buildStandings(fixtures, storedFrom(fixtures, fromResults.overall)).computed).toBe(
      false,
    );
  });
});

/**
 * Audit A04: the same results, read in French and in Arabic, must put the
 * same club at the same position in the same zone. The API translates team
 * names, and the table used to separate level clubs by that translated name.
 */
describe("the season table in both languages", () => {
  const repository = new MockFootballRepository();

  /** Club id → position and zone, in table order: what a reader sees. */
  const reading = (rows: ReturnType<typeof buildStandings>["overall"]) => {
    const zones = tableZones(rows);
    return rows.map((row) => [row.clubId, row.position, zones.get(row.clubId) ?? null]);
  };

  test("the mock season in progress ranks its level clubs the same in French and Arabic", async () => {
    const seasons = await repository.getSeasons("fr", 12, context);
    const current = seasons.find((season) => season.isCurrent)!;
    const [french, arabic] = await Promise.all(
      (["fr", "ar"] as const).map((language) =>
        repository.getSeasonFixtures(current.competition.id, current.id, language, context),
      ),
    );
    // The two responses really do name the clubs differently…
    expect(french![0]!.homeTeam.shortName).not.toBe(arabic![0]!.homeTeam.shortName);
    const fr = buildStandings(french!, []);
    const ar = buildStandings(arabic!, []);
    // …and this season really has clubs level on every figure.
    expect(new Set(fr.overall.map((row) => row.position)).size).toBeLessThan(fr.overall.length);
    expect(reading(ar.overall)).toEqual(reading(fr.overall));
    expect(reading(ar.home)).toEqual(reading(fr.home));
    expect(reading(ar.away)).toEqual(reading(fr.away));
  });

  test("production after the first match: fourteen clubs share 2nd, in both languages, in no zone", async () => {
    // The clubs and names production served on 2026-09-25, when the only
    // result of 2026/27 was Amal Tiznit 1–3 Ittihad Tanger. Sorted by the
    // Arabic name, UTS Rabat (اتحاد تواركة) came 2nd with a Champions League
    // bar; by the French one, CODM Meknès did.
    const names: [slug: string, fr: string, ar: string][] = [
      ["amal-tiznit-1ebd788b9f71", "Amal Tiznit", "أمل تيزنيت"],
      ["codm-mekn-s-8059c0cf8b7b", "CODM Meknès", "المكناسي"],
      ["cr-khemis-zemamra-dc6fb8196f3e", "CR Khemis Zemamra", "نهضة الزمامرة"],
      ["difa-el-jadida-d5d8c59bf7ab", "Difaâ El Jadida", "الدفاع الجديدي"],
      ["far-rabat-fd6ff8ea898c", "FAR Rabat", "الجيش"],
      ["fus-rabat-c499006b2af3", "FUS Rabat", "الفتح"],
      ["hassania-agadir-9f8c170d24ed", "Hassania Agadir", "حسنية أكادير"],
      ["ittihad-tanger-353e19d70a4b", "Ittihad Tanger", "اتحاد طنجة"],
      ["kawkab-marrakech-d60d9d72cb7a", "Kawkab Marrakech", "الكوكب المراكشي"],
      ["maghreb-f-s-0257feb34c16", "Maghreb Fès", "المغرب الفاسي"],
      ["moghreb-t-touan-e3beb52dfbfb", "Moghreb Tétouan", "المغرب التطواني"],
      ["raja-casablanca-3b0f1fc95b29", "Raja Casablanca", "الرجاء"],
      ["rsb-berkane-7b2e23bc450f", "RSB Berkane", "نهضة بركان"],
      ["uts-rabat-b78eaee893af", "UTS Rabat", "اتحاد تواركة"],
      ["widad-t-mara-7d508334d7a9", "Widad Témara", "وداد تمارة"],
      ["wydad-casablanca-80a3fb8202ae", "WCA", "الوداد"],
    ];
    // Any mock fixture, for the fields the table does not read.
    const [template] = await repository.getHomeMatches("fr", 1, context);
    const idOf = (index: number) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const teamsIn = (language: "fr" | "ar"): TeamSummaryDto[] =>
      names.map(([slug, fr, ar], index) => ({
        ...template!.homeTeam,
        id: idOf(index),
        slug,
        name: language === "fr" ? fr : ar,
        shortName: language === "fr" ? fr : ar,
      }));
    // Opening round: Amal Tiznit v Ittihad Tanger played, the rest to come.
    const others = names.map((_, index) => index).filter((index) => index !== 0 && index !== 7);
    const pairs: [number, number][] = [
      [0, 7],
      ...Array.from({ length: 7 }, (_, i): [number, number] => [
        others[2 * i]!,
        others[2 * i + 1]!,
      ]),
    ];
    const seasonIn = (language: "fr" | "ar"): MatchCardDto[] => {
      const teams = teamsIn(language);
      return pairs.map(([home, away], index) => ({
        ...template!,
        id: `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`,
        homeTeam: teams[home]!,
        awayTeam: teams[away]!,
        status: index === 0 ? "finished" : "not_started",
        homeScore: index === 0 ? 1 : null,
        awayScore: index === 0 ? 3 : null,
      }));
    };

    const fr = buildStandings(seasonIn("fr"), []);
    const ar = buildStandings(seasonIn("ar"), []);
    expect(fr.overall).toHaveLength(16);
    expect(reading(ar.overall)).toEqual(reading(fr.overall));

    const [first, ...rest] = reading(fr.overall);
    const last = rest.pop()!;
    expect(first).toEqual([idOf(7), 1, "champions_league"]); // Ittihad Tanger
    expect(last).toEqual([idOf(0), 16, "relegation"]); // Amal Tiznit
    expect(rest).toHaveLength(14);
    for (const [, position, zone] of rest) expect([position, zone]).toEqual([2, null]);
    expect(fr.computed).toBe(true);
  });
});
