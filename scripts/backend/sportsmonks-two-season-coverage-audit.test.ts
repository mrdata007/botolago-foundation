import { describe, expect, it } from "bun:test";

import { BOTOLA_PRO_LEAGUE_ID, type ProbeDependencies } from "./sportsmonks-production-probe";
import {
  TWO_SEASON_BACKFILL_SCOPE,
  buildFixtureWindows,
} from "./sportsmonks-two-season-backfill-preflight";
import { runTwoSeasonCoverageAudit } from "./sportsmonks-two-season-coverage-audit";

const TOKEN = "sportsmonks-coverage-audit-test-token-1234567890";
const COMMIT = "e".repeat(40);

function json(data: unknown): Response {
  return Response.json(data);
}

function fixtureId(seasonId: number, windowIndex: number, index: number): number {
  return seasonId * 1_000 + windowIndex * 100 + index + 1;
}

function lineupFixture(id: number, seasonId: number, incompleteStarter: boolean) {
  const lineups = Array.from({ length: 40 }, (_, index) => ({
    id: id * 100 + index,
    fixture_id: id,
    player_id: incompleteStarter && index === 10 ? null : id * 1_000 + index + 1,
    team_id: index < 20 ? 500 : 600,
    type_id: index < 11 || (index >= 20 && index < 31) ? 11 : 12,
    details: [
      { type_id: 119, data: { value: index < 11 || (index >= 20 && index < 31) ? 90 : 0 } },
      { type_id: 118, data: { value: 6.5 } },
    ],
  }));
  return {
    id,
    league_id: BOTOLA_PRO_LEAGUE_ID,
    season_id: seasonId,
    lineups,
  };
}

describe("SportsMonks two-season historical fixture coverage audit", () => {
  it("audits all 480 provider fixtures without Supabase and preserves bounded failures", async () => {
    const fixtureSeasons = new Map<number, number>();
    const requests: URL[] = [];
    const badFixtureId = fixtureId(26_027, 0, 0);
    const fetcher: NonNullable<ProbeDependencies["fetch"]> = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
      expect(url.href).not.toContain(TOKEN);
      requests.push(url);

      if (url.pathname.startsWith("/v3/football/fixtures/between/")) {
        const [, from, to] = url.pathname.match(/fixtures\/between\/([^/]+)\/([^/]+)$/) ?? [];
        const season = TWO_SEASON_BACKFILL_SCOPE.find((candidate) =>
          buildFixtureWindows(candidate.startingAt, candidate.endingAt).some(
            (window) => window.from === from && window.to === to,
          ),
        );
        if (!season) return json({ data: [], pagination: { has_more: false } });
        const windowIndex = buildFixtureWindows(season.startingAt, season.endingAt).findIndex(
          (window) => window.from === from && window.to === to,
        );
        const page = Number(url.searchParams.get("page"));
        const start = page === 1 ? 0 : 50;
        const count = page === 1 ? 50 : 30;
        const data = Array.from({ length: count }, (_, offset) => {
          const id = fixtureId(season.id, windowIndex, start + offset);
          fixtureSeasons.set(id, season.id);
          return { id, league_id: BOTOLA_PRO_LEAGUE_ID, season_id: season.id };
        });
        return json({ data, pagination: { has_more: page === 1 } });
      }

      const id = Number(url.pathname.split("/").at(-1));
      const seasonId = fixtureSeasons.get(id);
      if (seasonId) {
        expect(url.searchParams.get("include")).toBe("lineups.details");
        expect(url.searchParams.get("filters")).toContain("lineupDetailTypes:52");
        return json({ data: lineupFixture(id, seasonId, id === badFixtureId) });
      }
      return json({});
    };

    const evidence = await runTwoSeasonCoverageAudit(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      { fetch: fetcher, now: () => new Date("2026-08-02T21:30:00.000Z") },
    );

    expect(evidence).toMatchObject({
      mode: "read_only_two_season_historical_fixture_coverage_audit",
      expectedCommit: COMMIT,
      providerPayloadIncluded: false,
      supabaseAccess: false,
      databaseWrites: false,
      requestCount: 492,
      fixturesAudited: 480,
      failedFixtures: 1,
      verdict: "fail",
    });
    expect(evidence.seasons).toHaveLength(2);
    expect(evidence.seasons[0]).toMatchObject({
      id: 26_027,
      fixturesDiscovered: 240,
      requests: 246,
      counts: {
        fixturesWithCoverage: 240,
        lineupRowsSeen: 9_600,
        validPlayerRows: 9_599,
        excludedIncompleteRows: 1,
        starterRows: 5_279,
        minimumStarterRows: 21,
        maximumStarterRows: 22,
      },
      failedFixtures: 1,
      failures: [
        {
          fixtureId: badFixtureId,
          errorCode: "historical_fixture_coverage_incomplete",
          diagnostic: {
            lineupRowsSeen: 40,
            validPlayerRows: 39,
            excludedIncompleteRows: 1,
            starterRows: 21,
            teamCount: 2,
            invalidDetailRows: 0,
            failures: ["starter_rows_mismatch"],
          },
          incompleteRows: {
            starterRows: 1,
            benchRows: 0,
            unknownTypeRows: 0,
            rowsWithTeamId: 1,
          },
        },
      ],
    });
    expect(evidence.seasons[1]).toMatchObject({
      id: 24_319,
      fixturesDiscovered: 240,
      requests: 246,
      counts: {
        fixturesWithCoverage: 240,
        lineupRowsSeen: 9_600,
        validPlayerRows: 9_600,
        excludedIncompleteRows: 0,
        starterRows: 5_280,
        minimumStarterRows: 22,
        maximumStarterRows: 22,
      },
      failedFixtures: 0,
      failures: [],
    });
    expect(evidence.seasons.every((season) => /^[0-9a-f]{64}$/.test(season.fixtureIdsSha256))).toBe(
      true,
    );
    expect(requests).toHaveLength(492);
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
  });
});
