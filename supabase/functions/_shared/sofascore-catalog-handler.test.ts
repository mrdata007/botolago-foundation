import { describe, expect, test } from "bun:test";
import { handleFootballLiveRefreshRequest } from "./football-live-refresh.ts";
import type { LiveRefreshRpcClient } from "./football-live-refresh.ts";

// The catalog_weekly job through the Edge handler. Synthetic ids only.
const TOKEN = "c".repeat(64);
const request = () =>
  new Request("https://functions.example/football-live-refresh", {
    method: "POST",
    headers: { "content-type": "application/json", "x-botolago-scheduler-token": TOKEN },
    body: '{"job":"catalog_weekly"}',
  });
const environment = { BOTOLAGO_SCHEDULER_TOKEN: TOKEN, RAPIDAPI_KEY: "k" };

function database(source: string) {
  const calls: string[] = [];
  const client = {
    schema() {
      return {
        rpc(name: string) {
          calls.push(name);
          if (name === "football_data_source")
            return Promise.resolve({ data: source, error: null });
          if (name === "football_sofascore_catalog_snapshot") {
            return Promise.resolve({
              data: {
                teams: [{ sofascoreId: "1", crestCurated: false }],
                players: [],
                images: [],
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  return { client, calls };
}

describe("handler: the catalog_weekly job", () => {
  test("with SportsMonks as the source it does nothing and calls no provider", async () => {
    const fake = database("sportsmonks");
    let fetched = 0;
    const response = await handleFootballLiveRefreshRequest(request(), {
      environment,
      client: fake.client,
      fetch: async () => {
        fetched += 1;
        return new Response("{}");
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "skipped" });
    expect(fetched).toBe(0);
    expect(fake.calls).toEqual(["football_data_source"]);
  });

  test("shadow reads one squad per club through RapidAPI and writes nothing", async () => {
    const fake = database("shadow");
    const paths: string[] = [];
    const response = await handleFootballLiveRefreshRequest(request(), {
      environment,
      client: fake.client,
      fetch: async (input) => {
        const url = new URL(String(input));
        paths.push(url.pathname.slice(1) + url.search);
        return Response.json({ players: [] });
      },
    });
    expect(response.status).toBe(200);
    expect(paths).toEqual(["teams/get-squad?teamId=1"]);
    // No football data is written; the one squad request is still counted
    // against the RapidAPI budget (shadow counts too).
    expect(fake.calls).toEqual([
      "football_data_source",
      "service_rapidapi_budget",
      "football_sofascore_catalog_snapshot",
      "service_record_rapidapi_calls",
    ]);
  });
});
