import { describe, expect, it } from "bun:test";
import {
  BOTOLA_PRO_LEAGUE_ID,
  boundedFixtureWindow,
  requestSportsMonksJson,
  requireSportsMonksToken,
  runSportsMonksProductionProbe,
} from "./sportsmonks-production-probe";

const TOKEN = "sportsmonks-test-token-1234567890";
const COMMIT = "a".repeat(40);
const NOW = new Date("2026-07-31T12:00:00.000Z");

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function providerResponse(url: URL): Response {
  if (url.pathname === `/v3/football/leagues/${BOTOLA_PRO_LEAGUE_ID}`) {
    return json({
      data: {
        id: BOTOLA_PRO_LEAGUE_ID,
        name: "Botola Pro",
        active: true,
        currentseason: {
          id: 25_555,
          league_id: BOTOLA_PRO_LEAGUE_ID,
          name: "2025/2026",
          is_current: true,
          starting_at: "2025-08-20",
          ending_at: "2026-06-30",
        },
      },
    });
  }
  if (url.pathname === "/v3/football/rounds/seasons/25555") {
    return json({ data: [{ id: 1 }, { id: 2 }] });
  }
  if (url.pathname === "/v3/football/teams/seasons/25555") {
    return json({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  }
  if (url.pathname.startsWith("/v3/football/fixtures/between/")) {
    return json({
      data: [
        {
          id: 99,
          league_id: BOTOLA_PRO_LEAGUE_ID,
          season_id: 25_555,
          participants: [{ id: 1 }, { id: 2 }],
          state: { id: 5, short_name: "FT" },
          scores: [{ id: 10 }, { id: 11 }],
        },
      ],
    });
  }
  return json({}, 404);
}

describe("SportsMonks production access probe", () => {
  it("rejects missing, short, or whitespace-bearing credentials", () => {
    expect(() => requireSportsMonksToken(undefined)).toThrow("invalid_sportsmonks_token");
    expect(() => requireSportsMonksToken("short")).toThrow("invalid_sportsmonks_token");
    expect(() => requireSportsMonksToken(`${TOKEN}\n`)).toThrow("invalid_sportsmonks_token");
  });

  it("keeps the fixture range within the provider's 100-day maximum", () => {
    expect(boundedFixtureWindow("2025-08-20", "2026-06-30", NOW)).toEqual({
      from: "2026-03-23",
      to: "2026-06-30",
      inclusiveDays: 100,
    });
  });

  it("uses four read-only, fixed-origin requests and produces sanitized evidence", async () => {
    const requests: Array<{ url: URL; method: string; authorization: string | null }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const headers = new Headers(init?.headers);
      requests.push({
        url,
        method: init?.method ?? "GET",
        authorization: headers.get("Authorization"),
      });
      return providerResponse(url);
    };

    const evidence = await runSportsMonksProductionProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      { fetch: fetcher, now: () => NOW },
    );

    expect(evidence).toMatchObject({
      provider: "sportsmonks",
      mode: "read_only",
      expectedCommit: COMMIT,
      league: { id: BOTOLA_PRO_LEAGUE_ID, name: "Botola Pro", active: true },
      season: { id: 25_555, leagueId: BOTOLA_PRO_LEAGUE_ID, current: true },
      verifiedResources: { rounds: 2, teams: 3 },
      fixtureSample: {
        available: true,
        leagueMatches: true,
        seasonMatches: true,
        participants: 2,
        statePresent: true,
        scores: 2,
      },
      requestCount: 4,
      verdict: "pass",
    });
    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(request.url.origin).toBe("https://api.sportmonks.com");
      expect(request.url.href).not.toContain(TOKEN);
      expect(request.method).toBe("GET");
      expect(request.authorization).toBe(TOKEN);
    }
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
  });

  it("honors Retry-After and keeps retries bounded", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await requestSportsMonksJson("/v3/football/leagues/860", {}, TOKEN, {
      fetch: async () => {
        calls += 1;
        if (calls < 3) return json({ message: "rate limited" }, 429, { "retry-after": "2" });
        return json({ data: { id: 860 } });
      },
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      now: () => NOW,
    });
    expect(result).toEqual({ data: { id: 860 } });
    expect(calls).toBe(3);
    expect(delays).toEqual([2_000, 2_000]);
  });

  it("fails closed when the provider does not identify a current season", async () => {
    await expect(
      runSportsMonksProductionProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          fetch: async () =>
            json({ data: { id: BOTOLA_PRO_LEAGUE_ID, name: "Botola Pro", active: true } }),
          now: () => NOW,
        },
      ),
    ).rejects.toThrow("current_season_missing");
  });

  it("fails closed when a returned fixture escapes the verified league", async () => {
    await expect(
      runSportsMonksProductionProbe(
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
                  league_id: 999,
                  season_id: 25_555,
                  participants: [{ id: 1 }, { id: 2 }],
                  state: { id: 5 },
                  scores: [],
                },
              ],
            });
          },
          now: () => NOW,
        },
      ),
    ).rejects.toThrow("fixture_sample_scope_mismatch");
  });
});
