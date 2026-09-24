import { describe, expect, it } from "bun:test";
import {
  DEFAULT_LEAGUE_ID,
  DEFAULT_SEASON_ID,
  handleFootballLiveRefreshRequest,
  liveRefreshEnvironment,
  type LiveRefreshRpcClient,
} from "./football-live-refresh.ts";

const TOKEN = "b".repeat(64);

function request(token = TOKEN, method = "POST"): Request {
  return new Request("https://functions.example/football-live-refresh", {
    method,
    headers: { "content-type": "application/json", "x-botolago-scheduler-token": token },
    body: method === "POST" ? '{"job":"fixtures"}' : undefined,
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
});
