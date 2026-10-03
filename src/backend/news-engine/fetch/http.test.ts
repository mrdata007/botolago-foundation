import { describe, expect, test } from "bun:test";

import { MAX_RESPONSE_BYTES, NewsHttpClient, RateLimiter, type FetchLike } from "./http";
import { isAllowed, parseRobots, PERMISSIVE_POLICY } from "./robots";

function client(fetchImpl: FetchLike, sleeps: number[] = []): NewsHttpClient {
  return new NewsHttpClient({
    fetch: fetchImpl,
    sleep: async (milliseconds) => void sleeps.push(milliseconds),
    jitter: () => 0.5,
  });
}

const base = {
  url: "https://news.example.com/a.html",
  expectedHostname: "news.example.com",
  timeoutMs: 5_000,
  maxRetries: 2,
};

describe("news engine http client", () => {
  test("refuses a non-https url", async () => {
    await expect(
      client(async () => new Response("x")).request({ ...base, url: "http://news.example.com/a" }),
    ).rejects.toThrow("Only https sources are permitted.");
  });

  test("refuses a url outside the configured source host", async () => {
    await expect(
      client(async () => new Response("x")).request({ ...base, url: "https://other.example/a" }),
    ).rejects.toThrow("does not match the configured source host");
  });

  test("refuses a redirect that leaves the source host", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(null, { status: 302, headers: { location: "https://evil.example/a" } });
    await expect(client(fetchImpl).request(base)).rejects.toThrow(
      "left the configured source host",
    );
  });

  test("follows a same-host redirect", async () => {
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      call += 1;
      if (call === 1) {
        return new Response(null, {
          status: 301,
          headers: { location: "https://news.example.com/b.html" },
        });
      }
      return new Response("ok", { status: 200 });
    };
    const result = await client(fetchImpl).request(base);
    expect(result.body).toBe("ok");
    expect(result.finalUrl).toBe("https://news.example.com/b.html");
  });

  test("treats 304 as not-modified, not as a redirect", async () => {
    const fetchImpl: FetchLike = async () => new Response(null, { status: 304 });
    const result = await client(fetchImpl).request({ ...base, etag: '"v1"' });
    expect(result.notModified).toBe(true);
    expect(result.etag).toBe('"v1"');
  });

  test("sends conditional headers when validators are known", async () => {
    let seen: Headers | undefined;
    const fetchImpl: FetchLike = async (_input, init) => {
      seen = new Headers(init?.headers);
      return new Response("ok", { status: 200 });
    };
    await client(fetchImpl).request({
      ...base,
      etag: '"v1"',
      lastModified: "Mon, 21 Sep 2026 10:00:00 GMT",
    });
    expect(seen?.get("if-none-match")).toBe('"v1"');
    expect(seen?.get("if-modified-since")).toBe("Mon, 21 Sep 2026 10:00:00 GMT");
  });

  test("does not retry a refusal", async () => {
    // A 403 is a final answer. Retrying it is both useless and rude.
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return new Response("no", { status: 403 });
    };
    await expect(client(fetchImpl).request(base)).rejects.toThrow(
      "refused the request with status 403",
    );
    expect(calls).toBe(1);
  });

  test("retries a 503 with exponential backoff and then gives up", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return new Response("later", { status: 503 });
    };
    await expect(client(fetchImpl, sleeps).request(base)).rejects.toThrow("status 503");
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0] as number);
  });

  test("recovers when a retry succeeds", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return calls === 1
        ? new Response("later", { status: 503 })
        : new Response("ok", { status: 200 });
    };
    const result = await client(fetchImpl).request(base);
    expect(result.body).toBe("ok");
    expect(calls).toBe(2);
  });

  test("abandons an oversized response instead of buffering it", async () => {
    const huge = "x".repeat(MAX_RESPONSE_BYTES + 1_024);
    const fetchImpl: FetchLike = async () => new Response(huge, { status: 200 });
    await expect(client(fetchImpl).request(base)).rejects.toThrow("exceeded the size cap");
  });

  test("returns response validators for the next conditional request", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response("ok", {
        status: 200,
        headers: { etag: '"v2"', "last-modified": "Mon, 21 Sep 2026 12:00:00 GMT" },
      });
    const result = await client(fetchImpl).request(base);
    expect(result.etag).toBe('"v2"');
    expect(result.lastModified).toBe("Mon, 21 Sep 2026 12:00:00 GMT");
  });
});

describe("rate limiter", () => {
  test("paces requests at the configured rate", async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const limiter = new RateLimiter(
      60,
      async (milliseconds) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
      () => clock,
    );
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    // 60/minute is one per second.
    expect(sleeps).toEqual([1_000, 1_000]);
  });

  test("applies a server-requested pause to later requests", async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const limiter = new RateLimiter(
      120,
      async (milliseconds) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
      () => clock,
    );
    limiter.backOff(5_000);
    await limiter.acquire();
    expect(sleeps[0]).toBe(5_000);
  });
});

describe("robots.txt", () => {
  test("longest matching rule wins and allow breaks a tie", () => {
    const policy = parseRobots(
      "User-agent: *\nDisallow: /article/\nAllow: /article/public/",
      "bot",
    );
    expect(isAllowed(policy, "https://a.example/article/x")).toBe(false);
    expect(isAllowed(policy, "https://a.example/article/public/x")).toBe(true);
  });

  test("an empty Disallow means nothing is disallowed", () => {
    const policy = parseRobots("User-agent: *\nDisallow:", "bot");
    expect(isAllowed(policy, "https://a.example/anything")).toBe(true);
  });

  test("a group naming our agent outranks the wildcard group", () => {
    const policy = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: botolago\nAllow: /article/",
      "BotolaGO-NewsEngine/1.0",
    );
    expect(isAllowed(policy, "https://a.example/article/x")).toBe(true);
  });

  test("supports wildcards and end anchors", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /*.pdf$", "bot");
    expect(isAllowed(policy, "https://a.example/a/b.pdf")).toBe(false);
    expect(isAllowed(policy, "https://a.example/a/b.html")).toBe(true);
  });

  test("reads a crawl delay", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 5", "bot").crawlDelaySeconds).toBe(5);
  });

  test("ignores comments and blank lines", () => {
    const policy = parseRobots("# comment\n\nUser-agent: *\nDisallow: /x # trailing", "bot");
    expect(isAllowed(policy, "https://a.example/x")).toBe(false);
  });

  test("an absent robots file permits ordinary public access", () => {
    expect(isAllowed(PERMISSIVE_POLICY, "https://a.example/anything")).toBe(true);
  });

  test("matches the real ElBotola directives", () => {
    // Taken from the live file: article paths are allowed, search and user
    // areas are not.
    const policy = parseRobots(
      "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /user/\nDisallow: /search\nDisallow: /fr/search",
      "BotolaGO-NewsEngine/1.0",
    );
    expect(isAllowed(policy, "https://www.elbotola.com/article/2026-09-21-15-00-907.html")).toBe(
      true,
    );
    expect(isAllowed(policy, "https://www.elbotola.com/search?q=raja")).toBe(false);
    expect(isAllowed(policy, "https://www.elbotola.com/api/x")).toBe(false);
  });
});
