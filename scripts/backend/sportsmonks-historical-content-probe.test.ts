import { describe, expect, it } from "bun:test";

import {
  HISTORICAL_SEASON_ID,
  HISTORICAL_TEAM_IDS,
  runSportsMonksHistoricalContentProbe,
} from "./sportsmonks-historical-content-probe";

const TOKEN = "sportsmonks-test-token-1234567890";
const COMMIT = "b".repeat(40);
const NOW = new Date("2026-07-31T20:00:00.000Z");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function squadResponse(teamId: number): Response {
  return json({
    data: [
      {
        id: teamId + 500_000,
        player_id: teamId + 600_000,
        team_id: teamId,
        season_id: HISTORICAL_SEASON_ID,
        position_id: teamId === 306 ? null : 25,
        jersey_number: 10,
        player: {
          id: teamId + 600_000,
          display_name: `Player ${teamId}`,
          date_of_birth: "1998-01-02",
          nationality_id: 153,
        },
        position: teamId === 306 ? null : { id: 25, developer_name: "MIDFIELDER" },
      },
    ],
  });
}

function standingsResponse(): Response {
  return json({
    data: HISTORICAL_TEAM_IDS.map((teamId, index) => ({
      id: 700_000 + index,
      participant_id: teamId,
      season_id: HISTORICAL_SEASON_ID,
      position: index + 1,
      points: 50 - index,
      participant: { id: teamId, name: `Team ${teamId}` },
      details: [
        {
          id: 800_000 + index,
          type_id: 129,
          value: 30,
          type: { id: 129, developer_name: "OVERALL_MATCHES_PLAYED" },
        },
        {
          id: 900_000 + index,
          type_id: 130,
          value: 15,
          type: { id: 130, developer_name: "OVERALL_WON" },
        },
      ],
    })),
  });
}

describe("SportsMonks historical content coverage probe", () => {
  it("makes only the 17 pinned read-only requests and emits aggregate evidence", async () => {
    const requests: Array<{
      url: URL;
      method: string;
      authorization: string | null;
    }> = [];

    const evidence = await runSportsMonksHistoricalContentProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        now: () => NOW,
        fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          const headers = new Headers(init?.headers);
          requests.push({
            url,
            method: init?.method ?? "GET",
            authorization: headers.get("Authorization"),
          });
          if (url.pathname === `/v3/football/standings/seasons/${HISTORICAL_SEASON_ID}`) {
            return standingsResponse();
          }
          const match = /^\/v3\/football\/squads\/seasons\/(\d+)\/teams\/(\d+)$/.exec(url.pathname);
          if (!match) return json({}, 404);
          expect(Number(match[1])).toBe(HISTORICAL_SEASON_ID);
          return squadResponse(Number(match[2]));
        },
      },
    );

    expect(evidence).toEqual({
      schemaVersion: 1,
      provider: "sportsmonks",
      mode: "read_only_historical_content_coverage",
      expectedCommit: COMMIT,
      observedAt: NOW.toISOString(),
      seasonId: HISTORICAL_SEASON_ID,
      teamScope: { expected: 16, withSquad: 16, empty: 0 },
      squads: {
        memberships: 16,
        uniquePlayers: 16,
        namedPlayers: 16,
        playersWithDateOfBirth: 16,
        playersWithNationality: 16,
        membershipsWithJerseyNumber: 16,
        membershipsWithPosition: 15,
        duplicateMemberships: 0,
      },
      standings: {
        rows: 16,
        uniqueTeams: 16,
        rankedRows: 16,
        detailRecords: 32,
        unknownParticipants: 0,
        detailDeveloperNames: ["OVERALL_MATCHES_PLAYED", "OVERALL_WON"],
      },
      requestCount: 17,
      verdict: "pass",
    });

    expect(requests).toHaveLength(17);
    for (const request of requests) {
      expect(request.url.origin).toBe("https://api.sportmonks.com");
      expect(request.url.href).not.toContain(TOKEN);
      expect(request.method).toBe("GET");
      expect(request.authorization).toBe(TOKEN);
    }
    expect(requests.filter((request) => request.url.pathname.includes("/squads/"))).toHaveLength(
      16,
    );
    expect(
      requests
        .find((request) => request.url.pathname.includes("/squads/"))
        ?.url.searchParams.get("include"),
    ).toBe("player;position");
    expect(
      requests
        .find((request) => request.url.pathname.includes("/standings/"))
        ?.url.searchParams.get("include"),
    ).toBe("participant;details.type");
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
    expect(JSON.stringify(evidence)).not.toContain("Player ");
  });

  it("fails closed when a squad response escapes the pinned team scope", async () => {
    await expect(
      runSportsMonksHistoricalContentProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          now: () => NOW,
          fetch: async () =>
            json({
              data: [
                {
                  id: 1,
                  player_id: 2,
                  team_id: 999_999,
                  season_id: HISTORICAL_SEASON_ID,
                  position_id: 25,
                  player: { id: 2, display_name: "Wrong scope" },
                  position: { id: 25, developer_name: "MIDFIELDER" },
                },
              ],
            }),
        },
      ),
    ).rejects.toThrow("squad_scope_mismatch");
  });
});
