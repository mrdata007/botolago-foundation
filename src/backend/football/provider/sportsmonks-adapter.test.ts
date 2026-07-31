import { describe, expect, test } from "bun:test";
import { FootballError } from "../errors";
import { SportsmonksFootballProvider, type SportsmonksProviderConfig } from "./sportsmonks-adapter";
import { createSportsmonksFootballProvider } from "./sportsmonks-config.server";

const TOKEN = "test_sportsmonks_token_123456";
const NOW = new Date("2026-07-31T12:00:00.000Z");

function config(fetch: SportsmonksProviderConfig["fetch"]): SportsmonksProviderConfig {
  return {
    token: TOKEN,
    leagueId: 860,
    seasonId: 23_636,
    countryCode: "MA",
    competitionType: "league",
    seasonStartsOn: "2025-08-01",
    seasonEndsOn: "2026-06-30",
    fixtureFrom: "2026-01-01",
    fixtureTo: "2026-06-30",
    timeoutMs: 1_000,
    maxRetries: 0,
    retryBaseMs: 10,
    circuitFailureThreshold: 5,
    circuitResetMs: 30_000,
    now: () => NOW,
    fetch,
  };
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fixturePayload(state = "FT") {
  return {
    data: [
      {
        id: 19_100_001,
        league_id: 860,
        season_id: 23_636,
        round_id: 12,
        venue_id: 77,
        starting_at: "2026-02-14 17:00:00",
        last_processed_at: "2026-02-14 19:02:11",
        state: { developer_name: state, state: "Finished", name: "Finished" },
        participants: [
          { id: 101, meta: { location: "home" } },
          { id: 202, meta: { location: "away" } },
        ],
        scores: [
          { description: "CURRENT", score: { goals: 2, participant: "home" } },
          { description: "CURRENT", score: { goals: 1, participant: "away" } },
        ],
      },
    ],
    pagination: {
      count: 1,
      per_page: 50,
      current_page: 1,
      next_page: null,
      has_more: false,
    },
  };
}

describe("SportsmonksFootballProvider", () => {
  test("keeps the token out of the URL and normalizes the configured competition", async () => {
    let requestedUrl = "";
    let authorization = "";
    const provider = new SportsmonksFootballProvider(
      config(async (input, init) => {
        requestedUrl = String(input);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return jsonResponse({
          data: { id: 860, name: "Botola Pro", short_code: "BPL" },
        });
      }),
    );

    const page = await provider.listCompetitions({ limit: 10 });

    expect(authorization).toBe(TOKEN);
    expect(requestedUrl).toBe("https://api.sportmonks.com/v3/football/leagues/860");
    expect(requestedUrl).not.toContain(TOKEN);
    expect(requestedUrl).not.toContain("api_token");
    expect(page.items).toEqual([
      expect.objectContaining({
        externalId: "860",
        name: "Botola Pro",
        shortName: "BPL",
        type: "league",
        countryCode: "MA",
      }),
    ]);
  });

  test("normalizes a fixture with UTC kickoff, participants, status, and paired current score", async () => {
    let requestedUrl = "";
    const provider = new SportsmonksFootballProvider(
      config(async (input) => {
        requestedUrl = String(input);
        return jsonResponse(fixturePayload(), 200, {
          "x-ratelimit-limit": "3000",
          "x-ratelimit-remaining": "2999",
        });
      }),
    );

    const page = await provider.listFixtures({ limit: 100 });
    const url = new URL(requestedUrl);

    expect(url.pathname).toBe("/v3/football/fixtures/between/2026-01-01/2026-06-30");
    expect(url.searchParams.get("filters")).toBe("fixtureLeagues:860");
    expect(url.searchParams.get("include")).toBe("participants;state;scores");
    expect(url.searchParams.get("timezone")).toBe("UTC");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        externalId: "19100001",
        homeTeamExternalId: "101",
        awayTeamExternalId: "202",
        kickoffAt: "2026-02-14T17:00:00.000Z",
        status: "finished",
        period: "post_match",
        homeScore: 2,
        awayScore: 1,
      }),
    );
    expect(page.rateLimit).toEqual(expect.objectContaining({ limit: 3000, remaining: 2999 }));
  });

  test("uses an opaque resource-bound cursor for SportsMonks pagination", async () => {
    const requestedPages: string[] = [];
    const provider = new SportsmonksFootballProvider(
      config(async (input) => {
        const page = new URL(String(input)).searchParams.get("page") ?? "";
        requestedPages.push(page);
        return jsonResponse({
          data: [
            {
              id: page === "1" ? 101 : 202,
              name: page === "1" ? "Raja Club Athletic" : "Wydad AC",
            },
          ],
          pagination: {
            has_more: page === "1",
            next_page: page === "1" ? 2 : null,
          },
        });
      }),
    );

    const first = await provider.listTeams({ limit: 1 });
    const second = await provider.listTeams({
      limit: 1,
      cursor: first.nextCursor,
    });

    expect(first.nextCursor).toBe("sm:v1:teams:2");
    expect(second.nextCursor).toBeNull();
    expect(requestedPages).toEqual(["1", "2"]);
    await expect(
      provider.listTeams({ limit: 1, cursor: "sm:v1:fixtures:2" }),
    ).rejects.toBeInstanceOf(FootballError);
  });

  test("retries 429 using Retry-After and returns sanitized rate-limit metadata", async () => {
    let calls = 0;
    const waits: number[] = [];
    const provider = new SportsmonksFootballProvider({
      ...config(async () => {
        calls += 1;
        if (calls === 1)
          return jsonResponse({ message: "rate limit" }, 429, {
            "retry-after": "2",
          });
        return jsonResponse({
          data: { id: 860, name: "Botola Pro", short_code: "BPL" },
        });
      }),
      maxRetries: 1,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    await provider.listCompetitions({ limit: 1 });

    expect(calls).toBe(2);
    expect(waits).toEqual([2_000]);
  });

  test("maps every actionable state in the current SportsMonks state reference", async () => {
    const cases = [
      ["NS", "not_started", "pre_match"],
      ["INPLAY_1ST_HALF", "live_first_half", "first_half"],
      ["HT", "half_time", "half_time"],
      ["BREAK", "extra_time", "extra_time"],
      ["FT", "finished", "post_match"],
      ["INPLAY_ET", "extra_time", "extra_time"],
      ["AET", "finished", "post_match"],
      ["FT_PEN", "finished", "post_match"],
      ["INPLAY_PENALTIES", "penalties", "penalties"],
      ["POSTPONED", "postponed", "pre_match"],
      ["SUSPENDED", "suspended", "pre_match"],
      ["CANCELLED", "cancelled", "pre_match"],
      ["TBA", "scheduled", "pre_match"],
      ["WO", "finished", "post_match"],
      ["ABANDONED", "abandoned", "post_match"],
      ["DELAYED", "delayed", "pre_match"],
      ["AWARDED", "finished", "post_match"],
      ["INTERRUPTED", "suspended", "pre_match"],
      ["DELETED", "cancelled", "pre_match"],
      ["EXTRA_TIME_BREAK", "extra_time", "extra_time"],
      ["PEN_BREAK", "penalties", "penalties"],
    ] as const;

    for (const [state, status, period] of cases) {
      const provider = new SportsmonksFootballProvider(
        config(async () => jsonResponse(fixturePayload(state))),
      );
      const page = await provider.listFixtures({ limit: 1 });
      expect(page.items[0]).toEqual(expect.objectContaining({ status, period }));
    }

    const scheduled = new SportsmonksFootballProvider(
      config(async () => jsonResponse(fixturePayload("NS"))),
    );
    const finished = new SportsmonksFootballProvider(
      config(async () => jsonResponse(fixturePayload("FT"))),
    );
    expect((await scheduled.listFixtures({ limit: 1 })).items[0]?.freshness.provisional).toBe(true);
    expect((await finished.listFixtures({ limit: 1 })).items[0]?.freshness.provisional).toBe(false);
  });

  test("fails closed for an unknown state and for Gate 2B-only capabilities", async () => {
    const provider = new SportsmonksFootballProvider(
      config(async () => jsonResponse(fixturePayload("NEW_UNKNOWN_STATE"))),
    );

    await expect(provider.listFixtures({ limit: 1 })).rejects.toMatchObject({
      code: "invalid_provider_payload",
    });
    await expect(provider.listLineups({ limit: 1 })).rejects.toMatchObject({
      code: "data_unavailable",
    });

    for (const state of ["AWAITING_UPDATES", "PENDING"]) {
      const awaitingProvider = new SportsmonksFootballProvider(
        config(async () => jsonResponse(fixturePayload(state))),
      );
      await expect(awaitingProvider.listFixtures({ limit: 1 })).rejects.toMatchObject({
        code: "provider_unavailable",
      });
    }
  });
});

describe("createSportsmonksFootballProvider", () => {
  const environment = {
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    SPORTSMONKS_API_TOKEN: TOKEN,
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
    FOOTBALL_SPORTSMONKS_SEASON_ID: "23636",
    FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
    FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
    FOOTBALL_SPORTSMONKS_SEASON_START: "2025-08-01",
    FOOTBALL_SPORTSMONKS_SEASON_END: "2026-06-30",
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: "2026-01-01",
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: "2026-06-30",
    FOOTBALL_PROVIDER_TIMEOUT_MS: "10000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "3",
    FOOTBALL_PROVIDER_RETRY_BASE_MS: "250",
    FOOTBALL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD: "5",
    FOOTBALL_PROVIDER_CIRCUIT_RESET_MS: "30000",
  } as const;

  test("accepts only the official API origin and complete bounded server-only settings", () => {
    const provider = createSportsmonksFootballProvider(environment, {
      fetch: async () => jsonResponse({ data: [] }),
    });
    expect(provider.name).toBe("sportsmonks");

    expect(() =>
      createSportsmonksFootballProvider(
        {
          ...environment,
          FOOTBALL_PROVIDER_BASE_URL: "https://attacker.invalid",
        },
        { fetch: async () => jsonResponse({ data: [] }) },
      ),
    ).toThrow(FootballError);
    expect(() =>
      createSportsmonksFootballProvider(
        { ...environment, SPORTSMONKS_API_TOKEN: "" },
        { fetch: async () => jsonResponse({ data: [] }) },
      ),
    ).toThrow(FootballError);
  });
});
