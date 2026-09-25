import { describe, expect, it } from "bun:test";
import {
  DEFAULT_LEAGUE_ID,
  DEFAULT_SEASON_ID,
  handleFootballLiveRefreshRequest,
  liveRefreshEnvironment,
  type LiveRefreshRpcClient,
} from "./football-live-refresh.ts";

const TOKEN = "b".repeat(64);

function request(token = TOKEN, method = "POST", body = '{"job":"fixtures"}'): Request {
  return new Request("https://functions.example/football-live-refresh", {
    method,
    headers: { "content-type": "application/json", "x-botolago-scheduler-token": token },
    body: method === "POST" ? body : undefined,
  });
}

function client(tokenValid: boolean): { client: LiveRefreshRpcClient; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    client: {
      schema() {
        return {
          rpc(name: string) {
            calls.push(name);
            if (name === "service_verify_scheduler_token") {
              return Promise.resolve({ data: tokenValid, error: null });
            }
            return Promise.resolve({ data: null, error: { message: "unexpected" } });
          },
        };
      },
    } as unknown as LiveRefreshRpcClient,
  };
}

describe("football live refresh", () => {
  it("covers yesterday to tomorrow for Botola Pro's current season", () => {
    const environment = liveRefreshEnvironment(
      { SPORTSMONKS_API_TOKEN: "token" },
      new Date("2026-09-26T21:40:00Z"),
      "c".repeat(64),
    );
    expect(environment.FOOTBALL_SPORTSMONKS_FIXTURE_FROM).toBe("2026-09-25");
    expect(environment.FOOTBALL_SPORTSMONKS_FIXTURE_TO).toBe("2026-09-27");
    expect(environment.FOOTBALL_SPORTSMONKS_LEAGUE_ID).toBe(DEFAULT_LEAGUE_ID);
    expect(environment.FOOTBALL_SPORTSMONKS_SEASON_ID).toBe(DEFAULT_SEASON_ID);
    expect(environment.FOOTBALL_PROVIDER).toBe("sportsmonks");
    expect(environment.SPORTSMONKS_API_TOKEN).toBe("token");
  });

  it("lets the season be overridden, but only with a numeric id", () => {
    const now = new Date("2027-08-20T12:00:00Z");
    expect(
      liveRefreshEnvironment({ FOOTBALL_LIVE_SEASON_ID: "30001" }, now, "c")
        .FOOTBALL_SPORTSMONKS_SEASON_ID,
    ).toBe("30001");
    expect(
      liveRefreshEnvironment({ FOOTBALL_LIVE_SEASON_ID: "1; drop" }, now, "c")
        .FOOTBALL_SPORTSMONKS_SEASON_ID,
    ).toBe(DEFAULT_SEASON_ID);
  });

  it("refuses anything but a POST carrying the scheduler token the database accepts", async () => {
    const rejected = client(false);
    const neverFetch = async () => {
      throw new Error("provider must not be called");
    };
    expect(
      (
        await handleFootballLiveRefreshRequest(request(TOKEN, "GET"), {
          environment: {},
          client: rejected.client,
          fetch: neverFetch,
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await handleFootballLiveRefreshRequest(request("short"), {
          environment: {},
          client: rejected.client,
          fetch: neverFetch,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await handleFootballLiveRefreshRequest(request(), {
          environment: {},
          client: rejected.client,
          fetch: neverFetch,
        })
      ).status,
    ).toBe(401);
    expect(rejected.calls).toEqual(["service_verify_scheduler_token"]);
  });

  it("hands an authorised call to the shared fixture handler", async () => {
    const accepted = client(true);
    // No SportsMonks token configured: the shared handler refuses before any
    // provider call, which proves the request reached it with our window.
    const response = await handleFootballLiveRefreshRequest(request(), {
      environment: {},
      client: accepted.client,
      fetch: async () => {
        throw new Error("provider must not be called");
      },
      now: () => new Date("2026-09-26T21:40:00Z"),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "invalid_runtime_configuration" });
  });

  it("refuses a job it does not know", async () => {
    const accepted = client(true);
    const response = await handleFootballLiveRefreshRequest(
      request(TOKEN, "POST", '{"job":"everything"}'),
      { environment: {}, client: accepted.client },
    );
    expect(response.status).toBe(400);
    expect(accepted.calls).toEqual(["service_verify_scheduler_token"]);
  });
});

/** The parts of a live refresh reply these tests read. */
interface LiveBody {
  readonly jobs: { readonly fixtures: { readonly updated: number } };
  readonly matchDetails: Record<string, unknown>;
}

describe("football live refresh, match details", () => {
  const environment = { SPORTSMONKS_API_TOKEN: "sportsmonks-test-token-0123456789" };
  const now = () => new Date("2026-09-24T21:50:00Z");

  /** Scores for one live fixture that the database already knows. */
  const between = {
    data: [
      {
        id: 7001,
        league_id: 860,
        season_id: 28647,
        round_id: null,
        starting_at: "2026-09-24 20:00:00",
        last_processed_at: "2026-09-24 21:49:00",
        state: { developer_name: "INPLAY_2ND_HALF" },
        participants: [
          { id: 1001, meta: { location: "home" } },
          { id: 1002, meta: { location: "away" } },
        ],
        scores: [
          { description: "CURRENT", score: { participant: "home", goals: 1 } },
          { description: "CURRENT", score: { participant: "away", goals: 2 } },
        ],
      },
    ],
    pagination: { has_more: false },
  };
  const single = {
    data: {
      ...between.data[0],
      events: [
        {
          id: 1,
          type_id: 14,
          participant_id: 1002,
          player_id: 501,
          player_name: "Away Scorer",
          minute: 12,
          result: "0-1",
        },
      ],
    },
  };

  function database(order: string[], due: unknown[]): LiveRefreshRpcClient {
    return {
      schema() {
        return {
          rpc(name: string) {
            order.push(name);
            const data: Record<string, unknown> = {
              service_verify_scheduler_token: true,
              begin_football_ingestion: "50000000-0000-4000-8000-000000000001",
              resolve_football_mapping: "60000000-0000-4000-8000-000000000001",
              ingest_football_fixture: "60000000-0000-4000-8000-000000000001",
              service_football_match_details_due: due,
              ingest_football_match_details: {
                outcome: "stored",
                events: 1,
                statistics: 0,
                lineupPlayers: 0,
                unmappedPlayers: 0,
              },
            };
            return Promise.resolve({ data: data[name] ?? null, error: null });
          },
        };
      },
    } as unknown as LiveRefreshRpcClient;
  }

  it("stores the scores first, then the details of the matches that are due", async () => {
    const order: string[] = [];
    const paths: string[] = [];
    const response = await handleFootballLiveRefreshRequest(request(), {
      environment,
      now,
      client: database(order, [{ externalId: "7001", status: "live_second_half" }]),
      fetch: async (input) => {
        const url = new URL(String(input));
        paths.push(url.pathname);
        return Response.json(url.pathname.includes("/between/") ? between : single);
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as LiveBody;
    expect(body.jobs.fixtures.updated).toBe(1);
    expect(body.matchDetails).toMatchObject({ scope: "live", due: 1, stored: 1, events: 1 });
    expect(paths).toEqual([
      "/v3/football/fixtures/between/2026-09-23/2026-09-25",
      "/v3/football/fixtures/7001",
    ]);
    expect(order.indexOf("ingest_football_fixture")).toBeLessThan(
      order.indexOf("service_football_match_details_due"),
    );
  });

  it("keeps the scores when the details fail", async () => {
    const order: string[] = [];
    const response = await handleFootballLiveRefreshRequest(request(), {
      environment,
      now,
      client: database(order, [{ externalId: "7001", status: "live_second_half" }]),
      fetch: async (input) =>
        String(input).includes("/between/")
          ? Response.json(between)
          : new Response("forbidden", { status: 403 }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as LiveBody;
    expect(body.jobs.fixtures.updated).toBe(1);
    expect(body.matchDetails).toMatchObject({
      stored: 0,
      rejected: 1,
      errors: ["provider_unavailable"],
    });
  });

  it("does not try the details when the provider failed the scores", async () => {
    const order: string[] = [];
    const response = await handleFootballLiveRefreshRequest(request(), {
      environment,
      now,
      client: database(order, []),
      fetch: async () => new Response("down", { status: 503 }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "provider_unavailable" });
    expect(order).not.toContain("service_football_match_details_due");
  });

  it("runs the one-off backfill without touching the scores", async () => {
    const order: string[] = [];
    const paths: string[] = [];
    const response = await handleFootballLiveRefreshRequest(
      request(TOKEN, "POST", '{"job":"match_details_backfill"}'),
      {
        environment,
        now,
        client: database(order, [{ externalId: "7001", status: "finished" }]),
        fetch: async (input) => {
          paths.push(new URL(String(input)).pathname);
          return Response.json(single);
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "sportsmonks",
      jobs: { matchDetails: { scope: "backfill", due: 1, stored: 1 } },
    });
    expect(paths).toEqual(["/v3/football/fixtures/7001"]);
    expect(order).not.toContain("ingest_football_fixture");
  });
});
