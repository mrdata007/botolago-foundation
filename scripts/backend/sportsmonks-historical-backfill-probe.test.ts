import { describe, expect, it } from "bun:test";
import { BOTOLA_PRO_LEAGUE_ID, type ProbeDependencies } from "./sportsmonks-production-probe";
import { runSportsMonksHistoricalBackfillProbe } from "./sportsmonks-historical-backfill-probe";

const TOKEN = "sportsmonks-test-token-1234567890";
const COMMIT = "c".repeat(40);
const NOW = new Date("2026-08-02T12:00:00.000Z");

const completedSeasons = [
  {
    id: 26_027,
    league_id: BOTOLA_PRO_LEAGUE_ID,
    name: "2025/2026",
    is_current: false,
    finished: true,
    pending: false,
    starting_at: "2025-09-12",
    ending_at: "2026-07-05",
  },
  {
    id: 23_636,
    league_id: BOTOLA_PRO_LEAGUE_ID,
    name: "2024/2025",
    is_current: false,
    finished: true,
    pending: false,
    starting_at: "2024-08-30",
    ending_at: "2025-06-15",
  },
  {
    id: 21_644,
    league_id: BOTOLA_PRO_LEAGUE_ID,
    name: "2023/2024",
    is_current: false,
    finished: true,
    pending: false,
    starting_at: "2023-08-25",
    ending_at: "2024-06-20",
  },
];

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
          ...completedSeasons,
        ],
      },
    });
  }
  const seasonId = Number(url.pathname.split("/").at(-1));
  if (url.pathname.includes("/rounds/seasons/")) {
    return json({
      data: Array.from({ length: 30 }, (_, index) => ({ id: seasonId * 100 + index })),
    });
  }
  if (url.pathname.includes("/teams/seasons/")) {
    return json({ data: Array.from({ length: 16 }, (_, index) => ({ id: index + 1 })) });
  }
  if (url.pathname.startsWith("/v3/football/fixtures/between/")) {
    const from = url.pathname.split("/").at(-2);
    const season = completedSeasons.find((candidate) => candidate.starting_at <= (from ?? ""));
    return json({
      data: [
        {
          id: (season?.id ?? 1) * 100,
          league_id: BOTOLA_PRO_LEAGUE_ID,
          season_id: season?.id,
          participants: [{ id: 1 }, { id: 2 }],
          state: { id: 5 },
          scores: [{ id: 10 }, { id: 11 }],
        },
      ],
    });
  }
  return json({}, 404);
}

describe("SportsMonks last-three-completed-seasons probe", () => {
  it("verifies exactly the newest three completed Botola seasons with read-only requests", async () => {
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

    const evidence = await runSportsMonksHistoricalBackfillProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      { fetch: fetcher, now: () => NOW },
    );

    expect(evidence).toMatchObject({
      mode: "read_only_last_three_completed_seasons",
      expectedCommit: COMMIT,
      seasonCount: 3,
      requestCount: 10,
      seasons: completedSeasons.map((season) => ({
        id: season.id,
        name: season.name,
        current: false,
        finished: true,
        verifiedResources: {
          rounds: 30,
          teams: 16,
          fixtureSampleAvailable: true,
        },
      })),
      verdict: "pass",
    });
    expect(requests).toHaveLength(10);
    for (const request of requests) {
      expect(request.url.origin).toBe("https://api.sportmonks.com");
      expect(request.url.href).not.toContain(TOKEN);
      expect(request.method).toBe("GET");
      expect(request.authorization).toBe(TOKEN);
    }
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
  });

  it("fails closed when fewer than three completed seasons are available", async () => {
    await expect(
      runSportsMonksHistoricalBackfillProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          fetch: async () =>
            json({
              data: {
                id: BOTOLA_PRO_LEAGUE_ID,
                name: "Botola Pro",
                active: true,
                seasons: completedSeasons.slice(0, 2),
              },
            }),
          now: () => NOW,
        },
      ),
    ).rejects.toThrow("three_completed_seasons_not_available");
  });

  it("fails closed when a fixture sample escapes its season", async () => {
    await expect(
      runSportsMonksHistoricalBackfillProbe(
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
    ).rejects.toThrow("backfill_fixture_scope_mismatch");
  });
});
