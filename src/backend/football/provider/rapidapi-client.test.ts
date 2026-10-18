import { describe, expect, test } from "bun:test";
import { FootballError } from "../errors";
import { FlashscorePerformanceProvider } from "./flashscore-adapter";
import { RapidApiClient } from "./rapidapi-client";
import { createFlashscorePerformanceProvider } from "./rapidapi-config.server";
import { SofascorePerformanceProvider } from "./sofascore-adapter";

const KEY = "fake-rapidapi-key-for-tests";
const runtime = { sleep: async () => undefined, random: () => 0 };

function reply(status: number, body: unknown, remaining = "400") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "x-ratelimit-requests-limit": "500",
      "x-ratelimit-requests-remaining": remaining,
    },
  });
}

function client(responses: Response[], seen: { url: string; init?: RequestInit }[] = []) {
  return new RapidApiClient({
    host: "sofascore.p.rapidapi.com",
    key: KEY,
    runtime,
    fetch: async (url, init) => {
      seen.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("unexpected extra request");
      return next;
    },
  });
}

describe("RapidAPI client", () => {
  test("sends the key in headers only, never in the URL", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    await client([reply(200, { ok: true })], seen).getJson("matches/detail?matchId=1");
    expect(seen[0]?.url).toBe("https://sofascore.p.rapidapi.com/matches/detail?matchId=1");
    expect(seen[0]?.url).not.toContain(KEY);
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers["x-rapidapi-key"]).toBe(KEY);
    expect(headers["x-rapidapi-host"]).toBe("sofascore.p.rapidapi.com");
  });

  test("refuses a URL that carries a key", async () => {
    await expect(client([]).getJson("matches/detail?key=abc")).rejects.toBeInstanceOf(
      FootballError,
    );
  });

  test("reads the quota from the headers and counts requests", async () => {
    const api = client([reply(200, {}, "399")]);
    expect(api.quota()).toEqual({ limit: null, remaining: null });
    await api.getJson("x");
    expect(api.quota()).toEqual({ limit: 500, remaining: 399 });
    expect(api.requestsSent()).toBe(1);
  });

  test("stops sending once the quota is below the floor", async () => {
    const seen: { url: string }[] = [];
    const api = client([reply(200, {}, "99")], seen);
    await api.getJson("x");
    await expect(api.getJson("y")).rejects.toMatchObject({ code: "provider_rate_limited" });
    expect(seen).toHaveLength(1);
  });

  test("a 404 or 422 is not retried: failed calls still cost quota", async () => {
    const seen: { url: string }[] = [];
    await expect(client([reply(404, {})], seen).getJson("x")).rejects.toMatchObject({
      code: "data_unavailable",
    });
    await expect(client([reply(422, {})], seen).getJson("x")).rejects.toMatchObject({
      code: "invalid_provider_payload",
    });
    expect(seen).toHaveLength(2);
  });

  test("a 401 is not retried", async () => {
    const seen: { url: string }[] = [];
    await expect(client([reply(401, {})], seen).getJson("x")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(seen).toHaveLength(1);
  });

  test("a 429 and a 5xx are retried, then succeed", async () => {
    const seen: { url: string }[] = [];
    const api = client([reply(429, {}), reply(503, {}), reply(200, { ok: true })], seen);
    expect(await api.getJson("x")).toEqual({ ok: true });
    expect(seen).toHaveLength(3);
  });

  test("errors never carry the key or the response body", async () => {
    const api = client([reply(422, { echo: KEY, secret: "body-text" })]);
    try {
      await api.getJson("x");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(KEY);
      expect((error as Error).message).not.toContain("body-text");
    }
  });

  test("rejects a missing key or a malformed host", () => {
    expect(() => new RapidApiClient({ host: "h.example", key: " ", fetch: fetch })).toThrow();
    expect(() => new RapidApiClient({ host: "h/evil?x=", key: KEY, fetch: fetch })).toThrow();
  });
});

describe("providers", () => {
  test("a match id is checked before any request is sent", async () => {
    const seen: { url: string }[] = [];
    const sofascore = new SofascorePerformanceProvider(client([], seen));
    await expect(sofascore.getLineups("1; DROP")).rejects.toBeInstanceOf(FootballError);
    const flashscore = new FlashscorePerformanceProvider(client([], seen));
    await expect(flashscore.getIncidents("../x")).rejects.toBeInstanceOf(FootballError);
    expect(seen).toHaveLength(0);
  });

  test("the Flashscore host and the key must be configured", () => {
    expect(() => createFlashscorePerformanceProvider({ RAPIDAPI_KEY: KEY })).toThrow(FootballError);
    expect(() =>
      createFlashscorePerformanceProvider({ FLASHSCORE_RAPIDAPI_HOST: "flashlive.example" }),
    ).toThrow(FootballError);
    expect(
      createFlashscorePerformanceProvider({
        RAPIDAPI_KEY: KEY,
        FLASHSCORE_RAPIDAPI_HOST: "flashlive.example",
      }),
    ).toBeInstanceOf(FlashscorePerformanceProvider);
  });
});

describe("collection transport safeguards (mock HTTP responses)", () => {
  test("access denial opens a circuit across later events, without retry or body leakage", async () => {
    const seen: { url: string }[] = [];
    const api = client([reply(403, { reason: "challenge", echo: KEY })], seen);
    await expect(api.getJson("matches/detail?matchId=1")).rejects.toMatchObject({
      reason: "access_denied",
      httpStatus: 403,
    });
    await expect(api.getJson("matches/detail?matchId=2")).rejects.toMatchObject({
      reason: "access_denied",
    });
    expect(api.requestsSent()).toBe(1);
    expect(JSON.stringify(api.stoppedReason())).not.toContain(KEY);
  });
  test("budget applies inside a retry sequence", async () => {
    const api = new RapidApiClient({
      host: "sofascore.p.rapidapi.com",
      key: KEY,
      maxRequests: 1,
      runtime,
      fetch: async () => reply(503, {}),
    });
    await expect(api.getJson("x")).rejects.toMatchObject({ reason: "request_budget" });
    expect(api.requestsSent()).toBe(1);
  });
  test("quota is checked again before retries, including a zero reserve", async () => {
    for (const floor of [0, 100]) {
      const api = new RapidApiClient({
        host: "sofascore.p.rapidapi.com",
        key: KEY,
        minRemaining: floor,
        runtime,
        fetch: async () => reply(429, {}, String(floor)),
      });
      await expect(api.getJson("x")).rejects.toMatchObject({ reason: "quota_floor" });
      expect(api.requestsSent()).toBe(1);
    }
  });
  test("honors Retry-After seconds and dates; long waits stop further calls", async () => {
    for (const value of ["2", "Sun, 18 Oct 2026 12:00:02 GMT"]) {
      const sleeps: number[] = [];
      const responses = [
        new Response("{}", { status: 429, headers: { "retry-after": value } }),
        reply(200, {}),
      ];
      const api = new RapidApiClient({
        host: "sofascore.p.rapidapi.com",
        key: KEY,
        now: () => Date.parse("2026-10-18T12:00:00Z"),
        runtime: {
          sleep: async (ms) => {
            sleeps.push(ms);
          },
          random: () => 0,
        },
        fetch: async () => responses.shift()!,
      });
      await api.getJson("x");
      expect(sleeps).toEqual([2000]);
    }
    const api = new RapidApiClient({
      host: "sofascore.p.rapidapi.com",
      key: KEY,
      runtime,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "120" } }),
    });
    await expect(api.getJson("x")).rejects.toMatchObject({
      reason: "rate_limited",
      retryAfterMs: 120000,
    });
    await expect(api.getJson("y")).rejects.toMatchObject({ reason: "rate_limited" });
    expect(api.requestsSent()).toBe(1);
  });
  test("timeouts include response body consumption", async () => {
    const api = new RapidApiClient({
      host: "sofascore.p.rapidapi.com",
      key: KEY,
      policy: { timeoutMs: 10, maxRetries: 0 },
      fetch: async () => new Response(new ReadableStream({ start() {} })),
    });
    await expect(api.getJson("x")).rejects.toMatchObject({ reason: "timeout" });
  });
  test("network errors are retried and sanitized, cancellation does not send", async () => {
    let calls = 0;
    const api = new RapidApiClient({
      host: "sofascore.p.rapidapi.com",
      key: KEY,
      runtime,
      fetch: async () => {
        if (++calls < 2) throw new Error(KEY);
        return reply(200, {});
      },
    });
    await api.getJson("x");
    expect(calls).toBe(2);
    await expect(api.getJson("y", AbortSignal.abort())).rejects.toMatchObject({
      reason: "cancelled",
    });
    expect(calls).toBe(2);
  });
  test("missing data inside HTTP 200 is distinct from malformed JSON and bad endpoints", async () => {
    await expect(client([reply(200, { error: { code: 404 } })]).getJson("x")).rejects.toMatchObject(
      { reason: "upstream_missing", httpStatus: 200 },
    );
    await expect(client([new Response("bad")]).getJson("x")).rejects.toMatchObject({
      reason: "invalid_json",
    });
    await expect(client([reply(422, {})]).getJson("x")).rejects.toMatchObject({
      reason: "endpoint_rejected",
      httpStatus: 422,
    });
  });
  test("transient failures trip the breaker and redirects cannot forward credentials", async () => {
    let init: RequestInit | undefined;
    const api = new RapidApiClient({
      host: "sofascore.p.rapidapi.com",
      key: KEY,
      policy: { maxRetries: 0, circuitFailureThreshold: 1 },
      fetch: async (_url, options) => {
        init = options;
        return reply(503, {});
      },
    });
    await expect(api.getJson("x")).rejects.toMatchObject({ reason: "provider_error" });
    await expect(api.getJson("y")).rejects.toMatchObject({ reason: "circuit_open" });
    expect(api.requestsSent()).toBe(1);
    expect(init?.redirect).toBe("error");
  });
});
