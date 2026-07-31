import { describe, expect, it } from "bun:test";
import { BOTOLA_PRO_LEAGUE_ID, type ProbeDependencies } from "./sportsmonks-production-probe";
import { runSportsMonksHistoricalSeasonProbe } from "./sportsmonks-historical-season-probe";

const TOKEN = "sportsmonks-test-token-1234567890";
const COMMIT = "b".repeat(40);
const NOW = new Date("2026-07-31T12:00:00.000Z");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerResponse(url: URL): Response {
  if (url.pathname === `/v3/football/leagues/${BOTOLA_PRO_LEAGUE_ID}`) {
    return json({
      data: {
        id: BOTOLA_PRO_LEAGUE_ID,
        name: "Botola Pro",
        active: true,
        seasons: [
          {
            id: 28_647,
            league_id: BOTOLA_PRO_LEAGUE_ID,
            name: "2026/2027",
            is_current: true,
            finished: false,
            pending: true,
            starting_at: "2026-09-12",
            ending_at: "2027-07-05",
          },
          {
            id: 27_001,
            league_id: BOTOLA_PRO_LEAGUE_ID,
            name: "2025/2026",
            is_current: false,
            finished: true,
            pending: false,
            starting_at: "2025-09-01",
            ending_at: "2026-06-30",
          },
          {
            id: 26_001,
            league_id: BOTOLA_PRO_LEAGUE_ID,
            name: "2024/2025",
            is_current: false,
            finished: true,
            pending: false,
            starting_at: "2024-08-30",
            ending_at: "2025-06-15",
          },
        ],
      },
    });
  }
  if (url.pathname === "/v3/football/rounds/seasons/27001") return json({ data: [] });
  if (url.pathname === "/v3/football/teams/seasons/27001") {
    return json({ data: Array.from({ length: 16 }, (_, index) => ({ id: index + 1 })) });
  }
  if (url.pathname === "/v3/football/rounds/seasons/26001") {
    return json({ data: Array.from({ length: 30 }, (_, index) => ({ id: index + 1 })) });
  }
  if (url.pathname === "/v3/football/teams/seasons/26001") {
    return json({ data: Array.from({ length: 16 }, (_, index) => ({ id: index + 1 })) });
  }
  if (url.pathname.startsWith("/v3/football/fixtures/between/")) {
    return json({
      data: [
        {
          id: 99,
          league_id: BOTOLA_PRO_LEAGUE_ID,
          season_id: 26_001,
          participants: [{ id: 1 }, { id: 2 }],
          state: { id: 5 },
          scores: [{ id: 10 }, { id: 11 }],
        },
      ],
    });
  }
  return json({}, 404);
}

describe("SportsMonks historical season probe", () => {
  it("selects the newest populated completed season using bounded read-only requests", async () => {
    const requests: Array<{ url: URL; method: string; authorization: string | null }> = [];
    const fetcher: NonNullable<ProbeDependencies["fetch"]> = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requests.push({
        url,
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      return providerResponse(url);
    };

    const evidence = await runSportsMonksHistoricalSeasonProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      { fetch: fetcher, now: () => NOW },
    );

    expect(evidence).toMatchObject({
      mode: "read_only_historical_discovery",
      expectedCommit: COMMIT,
      league: { id: BOTOLA_PRO_LEAGUE_ID, name: "Botola Pro", active: true },
      selectedSeason: {
        id: 26_001,
        name: "2024/2025",
        current: false,
        finished: true,
      },
      verifiedResources: {
        rounds: 30,
        teams: 16,
        fixtureSampleAvailable: true,
      },
      candidatesChecked: 2,
      requestCount: 6,
      verdict: "pass",
    });
    expect(requests).toHaveLength(6);
    for (const request of requests) {
      expect(request.url.origin).toBe("https://api.sportmonks.com");
      expect(request.url.href).not.toContain(TOKEN);
      expect(request.method).toBe("GET");
      expect(request.authorization).toBe(TOKEN);
    }
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
  });

  it("fails closed when no completed historical season is available", async () => {
    await expect(
      runSportsMonksHistoricalSeasonProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          fetch: async () =>
            json({
              data: {
                id: BOTOLA_PRO_LEAGUE_ID,
                name: "Botola Pro",
                active: true,
                seasons: [
                  {
                    id: 28_647,
                    league_id: BOTOLA_PRO_LEAGUE_ID,
                    name: "2026/2027",
                    is_current: true,
                    finished: false,
                    pending: true,
                    starting_at: "2026-09-12",
                    ending_at: "2027-07-05",
                  },
                ],
              },
            }),
          now: () => NOW,
        },
      ),
    ).rejects.toThrow("historical_season_not_available");
  });

  it("fails closed when the fixture sample escapes the selected season", async () => {
    await expect(
      runSportsMonksHistoricalSeasonProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          fetch: async (input) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            const response = providerResponse(url);
            if (!url.pathname.startsWith("/v3/football/fixtures/between/")) return response;
            return json({
              data: [
                {
                  id: 99,
                  league_id: BOTOLA_PRO_LEAGUE_ID,
                  season_id: 999,
                  participants: [{ id: 1 }, { id: 2 }],
                },
              ],
            });
          },
          now: () => NOW,
        },
      ),
    ).rejects.toThrow("historical_fixture_scope_mismatch");
  });
});
