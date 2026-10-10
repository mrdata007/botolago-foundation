import { describe, expect, test } from "bun:test";
import {
  createRapidApiClient,
  RapidApiClient,
  RapidApiError,
  SOFASCORE_RAPIDAPI_HOST,
} from "./rapidapi-client.ts";

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

type Seen = { url: string; init?: RequestInit };

function client(responses: Array<Response | Error>, seen: Seen[] = [], minRemaining?: number) {
  return new RapidApiClient({
    host: SOFASCORE_RAPIDAPI_HOST,
    key: KEY,
    runtime,
    minRemaining,
    fetch: async (url, init) => {
      seen.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("unexpected extra request");
      if (next instanceof Error) throw next;
      return next;
    },
  });
}

describe("Edge RapidAPI client", () => {
  test("sends the key in headers only and returns data with the quota", async () => {
    const seen: Seen[] = [];
    const result = await client([reply(200, { ok: true }, "399")], seen).getJson(
      "/matches/detail?matchId=1",
    );
    expect(seen[0]?.url).toBe("https://sofascore.p.rapidapi.com/matches/detail?matchId=1");
    expect(seen[0]?.url).not.toContain(KEY);
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers["x-rapidapi-key"]).toBe(KEY);
    expect(headers["x-rapidapi-host"]).toBe(SOFASCORE_RAPIDAPI_HOST);
    expect(result).toEqual({
      data: { ok: true },
      quota: { limit: 500, remaining: 399 },
      requestsSent: 1,
    });
  });

  test("refuses a path that carries a key, without sending", async () => {
    const seen: Seen[] = [];
    await expect(client([], seen).getJson("x?api_key=abc")).rejects.toBeInstanceOf(RapidApiError);
    expect(seen).toHaveLength(0);
  });

  test("stops sending once the quota is below the floor", async () => {
    const seen: Seen[] = [];
    const api = client([reply(200, {}, "99")], seen);
    await api.getJson("x");
    await expect(api.getJson("y")).rejects.toMatchObject({ code: "provider_rate_limited" });
    expect(seen).toHaveLength(1);
  });

  test("the floor is configurable", async () => {
    const api = client([reply(200, {}, "50"), reply(200, {}, "49")], [], 50);
    await api.getJson("x");
    await api.getJson("y");
    await expect(api.getJson("z")).rejects.toMatchObject({ code: "provider_rate_limited" });
  });

  test("404, 422 and 401 are not retried", async () => {
    const seen: Seen[] = [];
    await expect(client([reply(404, {})], seen).getJson("x")).rejects.toMatchObject({
      code: "data_unavailable",
    });
    await expect(client([reply(422, {})], seen).getJson("x")).rejects.toMatchObject({
      code: "invalid_provider_payload",
    });
    await expect(client([reply(401, {})], seen).getJson("x")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(seen).toHaveLength(3);
  });

  test("429, 5xx and network errors are retried, then succeed", async () => {
    const seen: Seen[] = [];
    const api = client(
      [reply(429, {}), new TypeError("network down"), reply(200, { ok: 1 })],
      seen,
    );
    expect((await api.getJson("x")).data).toEqual({ ok: 1 });
    expect(seen).toHaveLength(3);
    expect(api.requestsSent()).toBe(3);
  });

  test("gives up after 2 retries", async () => {
    const seen: Seen[] = [];
    await expect(
      client([reply(503, {}), reply(503, {}), reply(503, {}), reply(200, {})], seen).getJson("x"),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(seen).toHaveLength(3);
  });

  test("a hung request times out and is retried", async () => {
    const seen: Seen[] = [];
    const api = new RapidApiClient({
      host: SOFASCORE_RAPIDAPI_HOST,
      key: KEY,
      runtime,
      timeoutMs: 5,
      maxRetries: 1,
      fetch: (url, init) => {
        seen.push({ url, init });
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    });
    await expect(api.getJson("x")).rejects.toThrow("The provider request timed out.");
    expect(seen).toHaveLength(2);
  });

  test("errors never carry the key or the response body", async () => {
    const failures = [reply(422, { echo: KEY, secret: "body-text" }), new Error(`boom ${KEY}`)];
    for (const fail of failures) {
      try {
        await client([fail, fail, fail]).getJson("x");
        throw new Error("should have thrown");
      } catch (error) {
        expect((error as Error).message).not.toContain(KEY);
        expect((error as Error).message).not.toContain("body-text");
        expect(String((error as Error).cause ?? "")).not.toContain(KEY);
      }
    }
  });

  test("rejects a missing key, a malformed host and a host off the allow-list", () => {
    expect(() => new RapidApiClient({ host: SOFASCORE_RAPIDAPI_HOST, key: " " })).toThrow();
    expect(() => new RapidApiClient({ host: "h/evil?x=", key: KEY })).toThrow();
    expect(() => new RapidApiClient({ host: "evil.example", key: KEY })).toThrow();
    expect(
      new RapidApiClient({
        host: "flashlive.example",
        key: KEY,
        allowedHosts: [SOFASCORE_RAPIDAPI_HOST, "flashlive.example"],
      }),
    ).toBeInstanceOf(RapidApiClient);
  });
});

describe("createRapidApiClient", () => {
  test("needs the key, and the Flashscore host for Flashscore", () => {
    expect(() => createRapidApiClient("sofascore", {})).toThrow(RapidApiError);
    expect(() => createRapidApiClient("flashscore", { RAPIDAPI_KEY: KEY })).toThrow(RapidApiError);
    expect(createRapidApiClient("sofascore", { RAPIDAPI_KEY: KEY })).toBeInstanceOf(RapidApiClient);
    expect(
      createRapidApiClient("flashscore", {
        RAPIDAPI_KEY: KEY,
        FLASHSCORE_RAPIDAPI_HOST: "flashlive.example",
      }),
    ).toBeInstanceOf(RapidApiClient);
  });

  test("SOFASCORE_MIN_REMAINING sets the floor, default 100, invalid values refused", async () => {
    const make = (min?: string) =>
      createRapidApiClient(
        "sofascore",
        { RAPIDAPI_KEY: KEY, SOFASCORE_MIN_REMAINING: min },
        { fetch: async () => reply(200, {}, "150") },
      );
    const defaulted = make();
    await defaulted.getJson("x");
    await defaulted.getJson("y");
    const strict = make("200");
    await strict.getJson("x");
    await expect(strict.getJson("y")).rejects.toMatchObject({ code: "provider_rate_limited" });
    expect(() => make("abc")).toThrow(RapidApiError);
    expect(() => make("-1")).toThrow(RapidApiError);
  });
});
