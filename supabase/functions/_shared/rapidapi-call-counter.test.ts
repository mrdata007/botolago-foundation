import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRapidApiCallCounter, type RapidApiCountClient } from "./rapidapi-call-counter.ts";
import { RapidApiClient, endpointOf, type RapidApiRequestEvent } from "./rapidapi-client.ts";

const HOST = "sofascore.p.rapidapi.com";
const runtime = { sleep: async () => {}, random: () => 0 };

describe("endpointOf", () => {
  test("keeps the path and drops the query values and the leading slash", () => {
    expect(endpointOf("matches/get-incidents?matchId=123")).toBe("matches/get-incidents");
    expect(endpointOf("/tournaments/get-live-events?sport=football")).toBe(
      "tournaments/get-live-events",
    );
    expect(endpointOf("tournaments/get-last-matches?tournamentId=937&seasonId=1&pageIndex=0")).toBe(
      "tournaments/get-last-matches",
    );
  });
});

describe("RapidApiClient onRequest", () => {
  function client(
    responses: (Response | Error)[],
    onRequest: (event: RapidApiRequestEvent) => void,
  ) {
    let i = 0;
    return new RapidApiClient({
      host: HOST,
      key: "k",
      runtime,
      onRequest,
      fetch: async () => {
        const next = responses[i++];
        if (next instanceof Error) throw next;
        return next;
      },
    });
  }

  test("counts one request per attempt, retries and failures included, query values never", async () => {
    const seen: RapidApiRequestEvent[] = [];
    const rapid = client(
      [new Error("network"), new Response("{}", { status: 503 }), Response.json({ ok: true })],
      (event) => seen.push(event),
    );
    await rapid.getJson("matches/get-incidents?matchId=99");
    expect(seen).toEqual([
      { endpoint: "matches/get-incidents", statusCode: 0 },
      { endpoint: "matches/get-incidents", statusCode: 503 },
      { endpoint: "matches/get-incidents", statusCode: 200 },
    ]);
    expect(rapid.requestsSent()).toBe(3);
  });

  test("a 404 and a 429 are requests too", async () => {
    const seen: number[] = [];
    const notFound = client([new Response("", { status: 404 })], (e) => seen.push(e.statusCode));
    await expect(notFound.getJson("matches/get-lineups?matchId=1")).rejects.toThrow();
    const limited = client([new Response("", { status: 429 })], (e) => seen.push(e.statusCode));
    await expect(limited.getJson("matches/get-lineups?matchId=1")).rejects.toThrow();
    expect(seen).toEqual([404, 429]);
  });

  test("a request refused by the quota floor is not sent, so not counted", async () => {
    const seen: RapidApiRequestEvent[] = [];
    const rapid = new RapidApiClient({
      host: HOST,
      key: "k",
      runtime,
      minRemaining: 100,
      onRequest: (e) => seen.push(e),
      fetch: async () => Response.json({}, { headers: { "x-ratelimit-requests-remaining": "50" } }),
    });
    await rapid.getJson("a/b");
    await expect(rapid.getJson("a/b")).rejects.toThrow();
    expect(seen).toHaveLength(1);
  });

  test("a throwing counter never breaks the request", async () => {
    const rapid = client([Response.json({ ok: true })], () => {
      throw new Error("counter broke");
    });
    const result = await rapid.getJson("a/b?x=1");
    expect(result.data).toEqual({ ok: true });
  });
});

describe("createRapidApiCallCounter", () => {
  function database(behaviour: "ok" | "error" | "throw" | "hang" = "ok") {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const client: RapidApiCountClient = {
      schema() {
        return {
          rpc(name, args) {
            calls.push({ name, args });
            if (behaviour === "throw") throw new Error("down");
            if (behaviour === "hang") return new Promise(() => {});
            return Promise.resolve({ error: behaviour === "error" ? { message: "nope" } : null });
          },
        };
      },
    };
    return { client, calls };
  }

  test("adds requests up by endpoint and status and writes them in one call", async () => {
    const db = database();
    const counter = createRapidApiCallCounter({
      client: db.client,
      job: "fixtures",
      log: () => {},
    });
    counter.record({ endpoint: "tournaments/get-live-events", statusCode: 200 });
    counter.record({ endpoint: "matches/get-incidents", statusCode: 200 });
    counter.record({ endpoint: "matches/get-incidents", statusCode: 200 });
    counter.record({ endpoint: "matches/get-incidents", statusCode: 503 });
    expect(counter.pending()).toBe(4);
    await counter.flush();
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].name).toBe("service_record_rapidapi_calls");
    expect(db.calls[0].args.p_job).toBe("fixtures");
    expect(db.calls[0].args.p_calls).toEqual([
      { endpoint: "tournaments/get-live-events", status: 200, calls: 1 },
      { endpoint: "matches/get-incidents", status: 200, calls: 2 },
      { endpoint: "matches/get-incidents", status: 503, calls: 1 },
    ]);
    expect(counter.pending()).toBe(0);
    await counter.flush(); // nothing new: no second write
    expect(db.calls).toHaveLength(1);
  });

  test("writes nothing when nothing was sent", async () => {
    const db = database();
    await createRapidApiCallCounter({ client: db.client, job: "fixtures" }).flush();
    expect(db.calls).toEqual([]);
  });

  test("a database error, a throw or a hang is logged and never throws or waits long", async () => {
    for (const behaviour of ["error", "throw", "hang"] as const) {
      const db = database(behaviour);
      const lines: string[] = [];
      const counter = createRapidApiCallCounter({
        client: db.client,
        job: "season_fixtures",
        timeoutMs: 20,
        log: (line) => lines.push(line),
      });
      counter.record({ endpoint: "a/b", statusCode: 200 });
      const started = Date.now();
      await counter.flush();
      expect(Date.now() - started).toBeLessThan(500);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        event: "rapidapi_count_failed",
        job: "season_fixtures",
        lostCalls: 1,
      });
    }
  });
});

describe("the migration agrees with the client", () => {
  const sql = readFileSync(
    new URL("../../migrations/20261013110000_rapidapi_call_budget.sql", import.meta.url),
    "utf8",
  );
  test("thresholds and the permission", () => {
    expect(sql).toContain("v_calls >= 9500 then 'fail' when v_calls >= 8000 then 'warn'");
    expect(sql).toContain("admin_assert_permission('football.read_operations')");
    expect(sql).toContain("'rapidapi_budget'");
  });
});
