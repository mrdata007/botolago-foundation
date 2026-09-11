import { describe, expect, it } from "bun:test";

import { handleNewsDataRequest, type NewsDataRpcClient } from "./newsdata";

const API_KEY = "pub_newsdata-test-key-1234567890";
const SECRET = "newsdata-trigger-secret-1234567890abcdef";
const NOW = new Date("2026-08-04T02:00:00.000Z");

function environment(): Record<string, string> {
  return {
    NEWSDATA_API_KEY: API_KEY,
    NEWSDATA_COMMERCIAL_USE_APPROVED: "true",
    NEWS_INGESTION_TRIGGER_SECRET: SECRET,
    NEWSDATA_API_ORIGIN: "https://newsdata.io",
    NEWSDATA_QUERY_FR: '"Botola Pro" OR "football marocain"',
    NEWSDATA_QUERY_AR: '"البطولة الاحترافية" OR "كرة القدم المغربية"',
    NEWSDATA_PAGE_SIZE: "10",
    NEWSDATA_TIMEOUT_MS: "10000",
    NEWSDATA_MAX_RETRIES: "2",
  };
}

function request(secret = SECRET, body: unknown = { job: "newsdata" }): Request {
  return new Request("https://example.test/news-ingest-newsdata", {
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
    article_id: `${language}-${suffix}`,
    title:
      language === "fr" ? `Actualité Botola ${suffix}` : `آخر أخبار البطولة الاحترافية ${suffix}`,
    description:
      language === "fr"
        ? "Une mise à jour vérifiée sur le championnat marocain <script>alert(1)</script>."
        : "تحديث موثوق حول منافسات البطولة الاحترافية المغربية.",
    content: "Full provider content must never be copied into BotolaGO.",
    link: `https://publisher.example/${language}/${suffix}?utm_source=newsdata`,
    image_url: "https://publisher.example/licensing-unknown.jpg",
    pubDate: "2026-08-04 00:30:00",
    pubDateTZ: "UTC",
    language: language === "fr" ? "french" : "arabic",
    category: ["sports", "top"],
    datatype: "news",
    duplicate: false,
    source_id: "publisher-example",
    source_name: language === "fr" ? "Publisher Example" : "ناشر تجريبي",
    source_url: "https://publisher.example/",
  };
}

function client(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  outcomes: Array<"inserted" | "updated" | "skipped"> = ["inserted", "updated"],
): NewsDataRpcClient {
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
          return { data: { outcome: outcomes.shift() ?? "skipped" }, error: null };
        }
        return { data: null, error: null };
      },
    }),
  };
}

describe("NewsData.io metadata ingestion runtime", () => {
  it("fails closed before network or database work without recorded commercial approval", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let fetched = false;
    const result = await handleNewsDataRequest(request(), {
      environment: { ...environment(), NEWSDATA_COMMERCIAL_USE_APPROVED: "false" },
      client: client(calls),
      fetch: async () => {
        fetched = true;
        return response({});
      },
    });

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: "service_unavailable" });
    expect(fetched).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("fetches French and Arabic metadata and persists only safe excerpts and attribution", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const requests: URL[] = [];
    const result = await handleNewsDataRequest(request(), {
      environment: environment(),
      client: client(calls),
      now: () => NOW,
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        requests.push(url);
        expect(url.origin).toBe("https://newsdata.io");
        expect(url.pathname).toBe("/api/1/latest");
        expect(url.searchParams.get("apikey")).toBe(API_KEY);
        expect(url.searchParams.get("category")).toBe("sports");
        expect(url.searchParams.get("size")).toBe("10");
        expect(init?.redirect).toBe("error");
        expect(init?.referrerPolicy).toBe("no-referrer");
        const language = url.searchParams.get("language") as "fr" | "ar";
        return response({
          status: "success",
          totalResults: 1,
          results: [article(language, "one")],
          nextPage: null,
        });
      },
    });

    expect(result.status).toBe(200);
    const serialized = await result.text();
    expect(serialized).not.toContain(API_KEY);
    expect(JSON.parse(serialized)).toEqual({
      provider: "newsdata",
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
    expect(persisted[0].args).toMatchObject({
      p_provider_slug: "newsdata",
      p_canonical_url: "https://publisher.example/fr/one",
      p_source_url: "https://publisher.example/",
      p_sanitizer_version: "newsdata-excerpt-v1",
    });
    expect(String(persisted[0].args.p_body_html)).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(String(persisted[0].args.p_body_html)).not.toContain("Full provider content");
    expect(JSON.stringify(persisted)).not.toContain("image_url");
    expect(JSON.stringify(persisted)).not.toContain(API_KEY);
  });

  it("skips provider-marked duplicate rows without creating canonical records", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await handleNewsDataRequest(request(), {
      environment: environment(),
      client: client(calls, ["inserted"]),
      now: () => NOW,
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const language = url.searchParams.get("language") as "fr" | "ar";
        return response({
          status: "success",
          results:
            language === "fr"
              ? [{ ...article("fr", "duplicate"), duplicate: true }]
              : [article("ar", "unique")],
        });
      },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      counters: { fetched: 2, validated: 1, inserted: 1, skipped: 1, rejected: 0 },
    });
    expect(calls.filter((call) => call.name === "news_ingest_provider_article")).toHaveLength(1);
  });

  it("quarantines wrong-language and non-sports rows while preserving valid metadata", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await handleNewsDataRequest(request(), {
      environment: environment(),
      client: client(calls, ["inserted", "inserted"]),
      now: () => NOW,
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        const language = url.searchParams.get("language") as "fr" | "ar";
        const valid = article(language, "valid");
        const invalid =
          language === "fr"
            ? { ...article("fr", "wrong-language"), language: "english" }
            : { ...article("ar", "wrong-category"), category: ["politics"] };
        return response({ status: "success", results: [valid, invalid] });
      },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      counters: { fetched: 4, validated: 2, inserted: 2, rejected: 2 },
    });
    expect(calls.filter((call) => call.name === "news_record_ingestion_rejection")).toHaveLength(2);
    expect(calls.at(-1)).toMatchObject({
      name: "news_complete_ingestion_run",
      args: { p_status: "partially_succeeded" },
    });
  });

  it("retries a rate-limited request without exposing the API key", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let attempts = 0;
    const result = await handleNewsDataRequest(request(), {
      environment: { ...environment(), NEWSDATA_MAX_RETRIES: "1" },
      client: client(calls, ["skipped", "skipped"]),
      now: () => NOW,
      sleep: async () => undefined,
      fetch: async (input) => {
        attempts += 1;
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (attempts === 1) {
          return response(
            { status: "error", results: { message: `rate limited ${API_KEY}` } },
            429,
            {
              "retry-after": "0",
            },
          );
        }
        const language = url.searchParams.get("language") as "fr" | "ar";
        return response({ status: "success", results: [article(language, "retry")] });
      },
    });

    expect(result.status).toBe(200);
    const serialized = await result.text();
    expect(serialized).not.toContain(API_KEY);
    expect(JSON.parse(serialized)).toMatchObject({ counters: { retries: 1, skipped: 2 } });
    expect(attempts).toBe(3);
  });

  it("returns only stable sanitized provider failures", async () => {
    const cases = [
      [400, "provider_invalid_request", 503],
      [401, "provider_unauthorized", 503],
      [403, "provider_forbidden", 503],
      [429, "provider_rate_limited", 429],
      [500, "provider_unavailable", 503],
    ] as const;

    for (const [providerStatus, expectedCode, expectedStatus] of cases) {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const result = await handleNewsDataRequest(request(), {
        environment: { ...environment(), NEWSDATA_MAX_RETRIES: "0" },
        client: client(calls),
        fetch: async () =>
          response(
            { status: "error", results: { message: `sensitive provider detail ${API_KEY}` } },
            providerStatus,
          ),
      });

      expect(result.status).toBe(expectedStatus);
      const serialized = await result.text();
      expect(JSON.parse(serialized)).toEqual({ error: expectedCode });
      expect(serialized).not.toContain(API_KEY);
      expect(calls.find((call) => call.name === "news_complete_ingestion_run")).toMatchObject({
        args: {
          p_status: "failed",
          p_error_code: expectedCode,
          p_error_summary: "News ingestion failed; inspect correlated server logs.",
        },
      });
    }
  });

  it("rejects an invalid trigger before external or database work", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let fetched = false;
    const result = await handleNewsDataRequest(request("wrong"), {
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
});
