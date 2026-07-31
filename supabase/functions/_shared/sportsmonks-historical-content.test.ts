import { describe, expect, it } from "bun:test";

import {
  handleSportsMonksHistoricalContentRequest,
  type ContentRpcClient,
} from "./sportsmonks-historical-content";

const TOKEN = "sportsmonks-test-token-1234567890";
const SECRET = "gate3b-trigger-secret-1234567890abcdef";
const NOW = new Date("2026-07-31T20:30:00.000Z");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function environment(): Record<string, string> {
  return {
    SPORTSMONKS_API_TOKEN: TOKEN,
    FOOTBALL_INGESTION_TRIGGER_SECRET: SECRET,
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    FOOTBALL_SPORTSMONKS_SEASON_ID: "26027",
    FOOTBALL_SPORTSMONKS_TEAM_IDS: "306,2846",
    FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "2",
  };
}

function request(secret = SECRET): Request {
  return new Request("https://example.test/football-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-botolago-ingestion-key": secret,
    },
    body: JSON.stringify({ job: "historical_content" }),
  });
}

function squad(teamId: number): Response {
  const classified = teamId === 2_846;
  return json({
    data: [
      {
        id: teamId + 1_000,
        player_id: teamId + 2_000,
        team_id: teamId,
        season_id: 26_027,
        position_id: classified ? 25 : null,
        jersey_number: classified ? 5 : null,
        player: {
          id: teamId + 2_000,
          name: `Player ${teamId}`,
          display_name: `P. ${teamId}`,
          firstname: "Player",
          lastname: String(teamId),
          date_of_birth: classified ? "1998-01-02" : null,
          last_played_at: "2026-07-05 18:00:00",
        },
        position: classified ? { id: 25, developer_name: "DEFENDER" } : null,
      },
    ],
  });
}

function detail(id: number, typeId: number, developerName: string, value: number) {
  return {
    id,
    type_id: typeId,
    value,
    type: { id: typeId, developer_name: developerName },
  };
}

function standing(teamId: number, rank: number) {
  const points = rank === 1 ? 65 : 60;
  const won = rank === 1 ? 20 : 18;
  const drawn = rank === 1 ? 5 : 6;
  const lost = rank === 1 ? 5 : 6;
  const goalsFor = rank === 1 ? 50 : 44;
  const goalsAgainst = rank === 1 ? 20 : 24;
  return {
    id: 10_000 + teamId,
    participant_id: teamId,
    season_id: 26_027,
    position: rank,
    points,
    participant: { id: teamId, name: `Team ${teamId}` },
    details: [
      detail(1 + teamId, 129, "OVERALL_MATCHES", 30),
      detail(2 + teamId, 130, "OVERALL_WINS", won),
      detail(3 + teamId, 131, "OVERALL_DRAWS", drawn),
      detail(4 + teamId, 132, "OVERALL_LOST", lost),
      detail(5 + teamId, 133, "OVERALL_SCORED", goalsFor),
      detail(6 + teamId, 134, "OVERALL_CONCEDED", goalsAgainst),
      detail(7 + teamId, 135, "OVERALL_GOAL_DIFFERENCE", goalsFor - goalsAgainst),
      detail(8 + teamId, 136, "TOTAL_POINTS", points),
    ],
  };
}

function rpcClient(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): ContentRpcClient {
  return {
    schema: () => ({
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "begin_football_ingestion") {
          return {
            data:
              args.p_job_type === "squads"
                ? "11111111-1111-4111-8111-111111111111"
                : "22222222-2222-4222-8222-222222222222",
            error: null,
          };
        }
        if (name === "ingest_football_squad") {
          const memberships = args.p_memberships as unknown[];
          return {
            data: {
              playersInserted: memberships.length,
              playersUpdated: 0,
              playersSkipped: 0,
              membershipsInserted: memberships.length,
              membershipsUpdated: 0,
            },
            error: null,
          };
        }
        if (name === "ingest_football_standings") {
          const rows = args.p_rows as unknown[];
          return { data: { inserted: rows.length, updated: 0 }, error: null };
        }
        return { data: null, error: null };
      },
    }),
  };
}

describe("SportsMonks historical content runtime", () => {
  it("persists classified squad rows and a complete mapped standings table", async () => {
    const requests: URL[] = [];
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleSportsMonksHistoricalContentRequest(request(), {
      environment: environment(),
      client: rpcClient(calls),
      now: () => NOW,
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        requests.push(url);
        expect(init?.method).toBe("GET");
        expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
        expect(url.href).not.toContain(TOKEN);
        if (url.pathname.endsWith("/standings/seasons/26027")) {
          expect(url.searchParams.get("include")).toBe("participant;details.type");
          return json({ data: [standing(306, 1), standing(2_846, 2)] });
        }
        const match = /\/squads\/seasons\/26027\/teams\/(\d+)$/.exec(url.pathname);
        if (!match) return json({}, 404);
        expect(url.searchParams.get("include")).toBe("player;position");
        return squad(Number(match[1]));
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      provider: "sportsmonks",
      seasonId: 26_027,
      jobs: {
        squads: {
          fetched: 2,
          validated: 1,
          inserted: 1,
          updated: 0,
          skipped: 1,
          rejected: 0,
          retries: 0,
          uniquePlayers: 1,
          playersInserted: 1,
          playersUpdated: 0,
          playersSkipped: 0,
        },
        standings: {
          fetched: 2,
          validated: 2,
          inserted: 2,
          updated: 0,
          skipped: 0,
          rejected: 0,
          retries: 0,
        },
      },
    });
    expect(requests).toHaveLength(3);
    expect(requests.every((url) => url.origin === "https://api.sportmonks.com")).toBe(true);
    expect(calls.filter((call) => call.name === "ingest_football_squad")).toHaveLength(2);
    expect(calls.filter((call) => call.name === "ingest_football_standings")).toHaveLength(1);
    const persisted = calls.find(
      (call) => call.name === "ingest_football_squad" && call.args.p_team_external_id === "2846",
    );
    expect(persisted?.args.p_memberships).toEqual([
      {
        externalPlayerId: "4846",
        fullName: "Player 2846",
        displayName: "P. 2846",
        firstName: "Player",
        lastName: "2846",
        dateOfBirth: "1998-01-02",
        position: "defender",
        preferredFoot: "unknown",
        shirtNumber: 5,
        freshness: {
          updatedAt: "2026-07-05T18:00:00.000Z",
          sourceSequence: 1_783_274_400_000,
          sourceVersion: "sportsmonks:4846:1783274400000",
        },
      },
    ]);
  });

  it("rejects requests without the one-time trigger secret before external work", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let fetched = false;
    const response = await handleSportsMonksHistoricalContentRequest(request("wrong"), {
      environment: environment(),
      client: rpcClient(calls),
      fetch: async () => {
        fetched = true;
        return json({});
      },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(fetched).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("drops malformed optional player metadata without rejecting the squad membership", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleSportsMonksHistoricalContentRequest(request(), {
      environment: {
        ...environment(),
        FOOTBALL_SPORTSMONKS_TEAM_IDS: "2846",
      },
      client: rpcClient(calls),
      now: () => NOW,
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname.endsWith("/standings/seasons/26027")) {
          return json({ data: [standing(2_846, 1)] });
        }
        return json({
          data: [
            {
              id: 3_846,
              player_id: 4_846,
              team_id: 2_846,
              season_id: 26_027,
              position_id: 25,
              jersey_number: 120,
              player: {
                id: 4_846,
                name: "Player 2846",
                display_name: "P. 2846",
                firstname: { malformed: true },
                lastname: 2_846,
                date_of_birth: "0000-00-00",
                last_played_at: "not-a-timestamp",
                updated_at: "2026-07-01 12:00:00",
              },
              position: { id: 25, developer_name: "DEFENDER" },
            },
          ],
        });
      },
    });

    expect(response.status).toBe(200);
    const persisted = calls.find((call) => call.name === "ingest_football_squad");
    expect(persisted?.args.p_memberships).toEqual([
      {
        externalPlayerId: "4846",
        fullName: "Player 2846",
        displayName: "P. 2846",
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        position: "defender",
        preferredFoot: "unknown",
        shirtNumber: null,
        freshness: {
          updatedAt: "2026-07-01T12:00:00.000Z",
          sourceSequence: 1_782_907_200_000,
          sourceVersion: "sportsmonks:4846:1782907200000",
        },
      },
    ]);
  });

  it("quarantines an inconsistent required player identity and continues standings", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleSportsMonksHistoricalContentRequest(request(), {
      environment: {
        ...environment(),
        FOOTBALL_SPORTSMONKS_TEAM_IDS: "2846",
      },
      client: rpcClient(calls),
      now: () => NOW,
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname.endsWith("/standings/seasons/26027")) {
          return json({ data: [standing(2_846, 1)] });
        }
        return json({
          data: [
            {
              id: 3_846,
              player_id: 4_846,
              team_id: 2_846,
              season_id: 26_027,
              position_id: 25,
              jersey_number: 5,
              player: {
                id: 999_999,
                name: "Mismatched player",
                display_name: "Mismatched player",
              },
              position: { id: 25, developer_name: "DEFENDER" },
            },
          ],
        });
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobs.squads).toMatchObject({
      fetched: 1,
      validated: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      rejected: 1,
    });
    expect(body.jobs.standings).toMatchObject({
      fetched: 1,
      validated: 1,
      inserted: 1,
      rejected: 0,
    });
    expect(
      calls.some(
        (call) =>
          call.name === "record_football_ingestion_rejection" &&
          call.args.p_external_id === "4846",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.name === "complete_football_ingestion" &&
          call.args.p_status === "partial" &&
          call.args.p_error_code === "invalid_provider_payload",
      ),
    ).toBe(true);
  });

  it("rejects mutable request scope instead of accepting caller-supplied team IDs", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const mutableRequest = new Request("https://example.test/football-ingest", {
      method: "POST",
      headers: { "x-botolago-ingestion-key": SECRET },
      body: JSON.stringify({ job: "historical_content", teamIds: [999] }),
    });
    const response = await handleSportsMonksHistoricalContentRequest(mutableRequest, {
      environment: environment(),
      client: rpcClient(calls),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(calls).toHaveLength(0);
  });
});
