import { describe, expect, it } from "bun:test";

import { handleGnewsRequest, type NewsRpcClient } from "./gnews";

const API_KEY = "gnews-test-key-1234567890";
const SECRET = "gnews-trigger-secret-1234567890abcdef";
const NOW = new Date("2026-07-31T22:00:00.000Z");

function environment(): Record<string, string> {
  return {
    GNEWS_API_KEY: API_KEY,
    NEWS_INGESTION_TRIGGER_SECRET: SECRET,
    GNEWS_API_ORIGIN: "https://gnews.io",
    GNEWS_QUERY_FR: '"Botola Pro" OR "football maroc"',
    GNEWS_QUERY_AR: '"البطولة الاحترافية" OR "كرة القدم المغربية"',
    GNEWS_PAGE_SIZE: "10",
    GNEWS_TIMEOUT_MS: "10000",
    GNEWS_MAX_RETRIES: "2",
  };
}

function request(secret = SECRET, body: unknown = { job: "gnews" }): Request {
  return new Request("https://example.test/news-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-botolago-ingestion-key": secret,
    },
    body: JSON.stringify(body),
  });
}

function response(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function article(language: "fr" | "ar", suffix: string) {
  return {
    id: `${language}-${suffix}`,
    title:
      language === "fr" ? `Actualité Botola ${suffix}` : `آخر أخبار البطولة الاحترافية ${suffix}`,
    description:
      language === "fr"
        ? "Une mise à jour vérifiée sur le championnat marocain <script>alert(1)</script>."
        : "تحديث موثوق حول منافسات البطولة الاحترافية المغربية.",
    content: "This provider content must never be copied into the article body.",
    url: `https://publisher.example/${language}/${suffix}?utm_source=gnews`,
    image: "https://publisher.example/image.jpg",
    publishedAt: "2026-07-31T20:30:00Z",
    lang: language,
    source: {
      id: "publisher-example",
      name: language === "fr" ? "Publisher Example" : "ناشر تجريبي",
      url: "https://publisher.example/",
      country: "ma",
    },
  };
}

function client(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  outcomes: Array<"inserted" | "updated" | "skipped"> = ["inserted", "updated"],
): NewsRpcClient {
  return {
    schema: () => ({
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "news_begin_provider_ingestion") {
          return {
            data: {
              runId: "11111111-1111-4111-8111-111111111111",
              publisherId: "22222222-2222-4222-8222-222222222222",
            },
            error: null,
          };
        }
        if (name === "news_ingest_provider_article") {
          return {
            data: { outcome: outcomes.shift() ?? "skipped" },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    }),
  };
}

describe("GNews ingestion runtime", () => {
  it("fetches both languages with header authentication and persists safe excerpt articles", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const requests: URL[] = [];
    const result = await handleGnewsRequest(request(), {
      environment: environment(),
      client: client(calls),
      now: () => NOW,
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        requests.push(url);
        expect(url.origin).toBe("https://gnews.io");
        expect(url.pathname).toBe("/api/v4/search");
        expect(url.href).not.toContain(API_KEY);
        expect(url.searchParams.has("country")).toBe(false);
        expect(url.searchParams.get("max")).toBe("10");
        expect(new Headers(init?.headers).get("X-Api-Key")).toBe(API_KEY);
        expect(init?.redirect).toBe("error");
        const language = url.searchParams.get("lang") as "fr" | "ar";
        return response({
          totalArticles: 1,
          articles: [article(language, "one")],
        });
      },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      provider: "gnews",
      languages: ["fr", "ar"],
      counters: {
        fetched: 2,
        validated: 2,
        inserted: 1,
        updated: 1,
        skipped: 0,
        rejected: 0,
        retries: 0,
      },
    });
    expect(requests).toHaveLength(2);
    const persisted = calls.filter((call) => call.name === "news_ingest_provider_article");
    expect(persisted).toHaveLength(2);
    expect(persisted[0].args.p_canonical_url).toBe("https://publisher.example/fr/one");
    expect(String(persisted[0].args.p_body_html)).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(String(persisted[0].args.p_body_html)).not.toContain("provider content");
    expect(persisted[0].args.p_sanitizer_version).toBe("gnews-excerpt-v1");
    expect(calls.at(-1)).toMatchObject({
      name: "news_complete_ingestion_run",
      args: { p_status: "succeeded", p_fetched: 2, p_validated: 2 },
    });
  });

  it("rejects a wrong trigger before external or database work", async () => {
    let fetched = false;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await handleGnewsRequest(request("wrong"), {
      environment: environment(),
      client: client(calls),
      fetch: async () => {
        fetched = true;
        return response({});
      },
    });
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "unauthorized" });
    expect(fetched).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("quarantines one malformed article and completes the remaining batch", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await handleGnewsRequest(request(), {
      environment: environment(),
      client: client(calls, ["inserted", "inserted"]),
      now: () => NOW,
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const language = url.searchParams.get("lang") as "fr" | "ar";
        const rows =
          language === "fr"
            ? [article("fr", "valid"), { ...article("fr", "bad"), url: "http://unsafe.example" }]
            : [article("ar", "valid")];
        return response({ totalArticles: rows.length, articles: rows });
      },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      counters: { fetched: 3, validated: 2, inserted: 2, rejected: 1 },
    });
    expect(calls.filter((call) => call.name === "news_record_ingestion_rejection")).toHaveLength(1);
    expect(calls.at(-1)).toMatchObject({
      name: "news_complete_ingestion_run",
      args: { p_status: "partially_succeeded" },
    });
  });

  it("retries a rate-limited request without leaking the key", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let attempts = 0;
    const result = await handleGnewsRequest(request(), {
      environment: { ...environment(), GNEWS_MAX_RETRIES: "1" },
      client: client(calls, ["skipped", "skipped"]),
      now: () => NOW,
      sleep: async () => undefined,
      fetch: async (input) => {
        attempts += 1;
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (attempts === 1)
          return response({ errors: ["rate_limited"] }, 429, {
            "retry-after": "0",
          });
        const language = url.searchParams.get("lang") as "fr" | "ar";
        return response({
          totalArticles: 1,
          articles: [article(language, "retry")],
        });
      },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      counters: { retries: 1, skipped: 2 },
    });
    expect(attempts).toBe(3);
  });
});
