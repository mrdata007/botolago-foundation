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
