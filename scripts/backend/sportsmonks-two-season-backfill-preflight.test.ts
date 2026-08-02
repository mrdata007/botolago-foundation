import { describe, expect, it } from "bun:test";
import { BOTOLA_PRO_LEAGUE_ID, type ProbeDependencies } from "./sportsmonks-production-probe";
import {
  TWO_SEASON_BACKFILL_SCOPE,
  buildFixtureWindows,
  runTwoSeasonBackfillPreflight,
} from "./sportsmonks-two-season-backfill-preflight";

const TOKEN = "sportsmonks-test-token-1234567890";
const COMMIT = "d".repeat(40);

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

function providerResponse(url: URL): Response {
  if (url.pathname === `/v3/football/leagues/${BOTOLA_PRO_LEAGUE_ID}`) {
    return json({
      data: {
        id: BOTOLA_PRO_LEAGUE_ID,
        name: "Botola Pro",
        active: true,
        seasons: TWO_SEASON_BACKFILL_SCOPE.map((season) => ({
          id: season.id,
          league_id: BOTOLA_PRO_LEAGUE_ID,
          name: season.name,
          is_current: false,
          finished: true,
          pending: false,
          starting_at: season.startingAt,
          ending_at: season.endingAt,
        })),
      },
    });
  }
  const seasonId = Number(url.pathname.split("/").at(-1));
  if (url.pathname.includes("/rounds/seasons/")) {
    return json({ data: Array.from({ length: 30 }, (_, index) => ({ id: seasonId + index })) });
  }
  if (url.pathname.includes("/teams/seasons/")) {
    return json({ data: Array.from({ length: 16 }, (_, index) => ({ id: seasonId + index })) });
  }
  if (url.pathname.startsWith("/v3/football/fixtures/between/")) {
    const from = url.pathname.split("/").at(-2) ?? "";
    const season = TWO_SEASON_BACKFILL_SCOPE.find(
      (candidate) => candidate.startingAt <= from && from <= candidate.endingAt,
    );
    return json({
      data: [
        {
          id: Number(`${season?.id ?? 1}1`),
          league_id: BOTOLA_PRO_LEAGUE_ID,
          season_id: season?.id,
          participants: [{ id: 1 }, { id: 2 }],
        },
      ],
    });
  }
  return json({});
}

describe("two-season production backfill preflight", () => {
  it("partitions both pinned seasons into complete consecutive <=100-day windows", () => {
    expect(buildFixtureWindows("2025-09-12", "2026-07-05")).toEqual([
      { from: "2025-09-12", to: "2025-12-20", inclusiveDays: 100 },
      { from: "2025-12-21", to: "2026-03-30", inclusiveDays: 100 },
      { from: "2026-03-31", to: "2026-07-05", inclusiveDays: 97 },
    ]);
    expect(buildFixtureWindows("2024-08-30", "2025-05-12")).toEqual([
      { from: "2024-08-30", to: "2024-12-07", inclusiveDays: 100 },
      { from: "2024-12-08", to: "2025-03-17", inclusiveDays: 100 },
      { from: "2025-03-18", to: "2025-05-12", inclusiveDays: 56 },
    ]);
  });

  it("verifies the exact provider scope with eleven read-only requests", async () => {
    const requests: URL[] = [];
    const fetcher: NonNullable<ProbeDependencies["fetch"]> = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
      requests.push(url);
      return providerResponse(url);
    };

    const result = await runTwoSeasonBackfillPreflight(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      { fetch: fetcher, now: () => new Date("2026-08-02T12:00:00.000Z") },
    );

    expect(result).toMatchObject({
      mode: "read_only_two_season_backfill_preflight",
      expectedCommit: COMMIT,
      seasonCount: 2,
      requestCount: 11,
      verdict: "pass",
    });
    expect(result.seasons.map((season) => season.id)).toEqual([26_027, 24_319]);
    expect(result.seasons.every((season) => season.teamIds.length === 16)).toBe(true);
    expect(requests).toHaveLength(11);
    expect(requests.every((url) => url.origin === "https://api.sportmonks.com")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("fails closed if the provider changes a pinned season boundary", async () => {
    await expect(
      runTwoSeasonBackfillPreflight(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          fetch: async (input) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            const response = providerResponse(url);
            if (url.pathname !== `/v3/football/leagues/${BOTOLA_PRO_LEAGUE_ID}`) return response;
            const body = await response.json();
            body.data.seasons[1].ending_at = "2025-05-13";
            return json(body);
          },
        },
      ),
    ).rejects.toThrow("backfill_season_scope_mismatch_24319");
  });
});
