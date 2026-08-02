import { describe, expect, it } from "bun:test";

import {
  HISTORICAL_PERFORMANCE_FIXTURES,
  historicalPerformanceFailureEvidence,
  runHistoricalPerformanceProbe,
} from "./sportsmonks-historical-performance-probe";

const TOKEN = "sportsmonks-test-token-1234567890";
const COMMIT = "a".repeat(40);
const NOW = new Date("2026-08-02T15:00:00.000Z");

function fixtureResponse(fixtureId: number, withDetails = true): Response {
  const fixture = HISTORICAL_PERFORMANCE_FIXTURES.find((item) => item.fixtureId === fixtureId);
  if (!fixture) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    data: {
      id: fixture.fixtureId,
      league_id: 860,
      season_id: fixture.seasonId,
      lineups: [
        {
          player_id: fixture.fixtureId + 1,
          team_id: 100,
          position_id: 24,
          type_id: 11,
          details: withDetails
            ? [
                { type_id: 118, data: { value: 7.5 } },
                { type_id: 119, data: { value: 90 } },
              ]
            : [],
        },
        {
          player_id: fixture.fixtureId + 2,
          team_id: 200,
          position_id: 27,
          type_id: 12,
          details: [],
        },
      ],
      events: [{ type_id: 14, player_id: fixture.fixtureId + 1 }],
    },
  });
}

describe("SportsMonks historical performance coverage probe", () => {
  it("uses six fixed read-only requests and records only aggregate coverage", async () => {
    const requests: URL[] = [];
    const evidence = await runHistoricalPerformanceProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        now: () => NOW,
        fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          requests.push(url);
          expect(init?.method).toBe("GET");
          expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
          expect(url.searchParams.get("include")).toBe("lineups.details;events");
          const fixtureId = Number(url.pathname.split("/").at(-1));
          return fixtureResponse(fixtureId);
        },
      },
    );

    expect(requests).toHaveLength(6);
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      provider: "sportsmonks",
      mode: "read_only_historical_player_performance_coverage",
      expectedCommit: COMMIT,
      leagueId: 860,
      requestCount: 6,
      usableForPreseasonDerivation: true,
      verdict: "pass",
      seasons: [
        {
          seasonId: 26027,
          sampledFixtures: 3,
          fixturesWithLineups: 3,
          fixturesWithPlayerDetails: 3,
          fixturesWithFantasyDetails: 3,
          totalLineups: 6,
          totalDetails: 6,
          totalEvents: 3,
          usableForPreseasonDerivation: true,
        },
        {
          seasonId: 24319,
          sampledFixtures: 3,
          fixturesWithLineups: 3,
          fixturesWithPlayerDetails: 3,
          fixturesWithFantasyDetails: 3,
          usableForPreseasonDerivation: true,
        },
      ],
    });
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
    expect(JSON.stringify(evidence)).not.toContain("player_id");
  });

  it("reports unavailable detail coverage without pretending the probe failed", async () => {
    const evidence = await runHistoricalPerformanceProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        now: () => NOW,
        fetch: async (input) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          return fixtureResponse(Number(url.pathname.split("/").at(-1)), false);
        },
      },
    );
    expect(evidence.usableForPreseasonDerivation).toBe(false);
    expect(evidence.seasons[0]).toMatchObject({
      fixturesWithLineups: 3,
      fixturesWithPlayerDetails: 0,
      fixturesWithFantasyDetails: 0,
      usableForPreseasonDerivation: false,
    });
  });

  it("fails closed when a provider fixture escapes its reviewed season", async () => {
    await expect(
      runHistoricalPerformanceProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          now: () => NOW,
          fetch: async (input) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            const fixtureId = Number(url.pathname.split("/").at(-1));
            const response = await fixtureResponse(fixtureId).json();
            return Response.json({
              ...response,
              data: { ...(response as { data: object }).data, season_id: 99999 },
            });
          },
        },
      ),
    ).rejects.toThrow("fixture_scope_mismatch");
  });

  it("creates bounded sanitized failure evidence", () => {
    const evidence = historicalPerformanceFailureEvidence(
      new Error(`${TOKEN}: provider exploded`),
      COMMIT,
      NOW,
    );
    expect(evidence).toEqual({
      schemaVersion: 1,
      provider: "sportsmonks",
      mode: "read_only_historical_player_performance_coverage",
      expectedCommit: COMMIT,
      observedAt: NOW.toISOString(),
      verdict: "fail",
      errorCode: "unexpected_historical_performance_probe_failure",
    });
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
  });
});
