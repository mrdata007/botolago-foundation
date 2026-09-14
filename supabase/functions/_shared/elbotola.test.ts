import { describe, expect, it } from "bun:test";

import { handleElbotolaRequest, parseElbotolaHomepage, type ElbotolaRpcClient } from "./elbotola";

const SECRET = "elbotola-trigger-secret-1234567890abcdef";
const NOW = new Date("2026-08-03T22:00:00.000Z");

function environment(): Record<string, string> {
  return {
    ELBOTOLA_INGESTION_TRIGGER_SECRET: SECRET,
    ELBOTOLA_SYNDICATION_APPROVED: "true",
    ELBOTOLA_ORIGIN: "https://www.elbotola.com",
    ELBOTOLA_PAGE_SIZE: "10",
    ELBOTOLA_TIMEOUT_MS: "10000",
    ELBOTOLA_MAX_RETRIES: "1",
  };
}

function request(secret = SECRET, body: unknown = { job: "elbotola" }): Request {
  return new Request("https://example.test/news-ingest-elbotola", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-botolago-ingestion-key": secret,
    },
    body: JSON.stringify(body),
  });
}

function articleHtml(
  id: string,
  heading = "خبر موثوق عن البطولة &quot;الاحترافية&quot;",
  timestamp = "2026-08-03 20:18 +0000",
): string {
  return `<a href="https://www.elbotola.com/article/${id}.html"><time data-value="${timestamp}"></time><span>metadata only</span><h3>${heading}</h3></a>`;
}

function articleImage(
  id: string,
  image = "//images2.elbotola.com/article/6a7108717a2769642ab813ee_default.jpg",
): string {
  return `<a href="/article/${id}.html"><img src="${image}" alt="صورة الخبر" /></a>`;
}

function homepage(...articles: string[]): string {
  return `<!doctype html><html lang="ar"><body>${articles.join("\n")}</body></html>`;
}

function response(body: string, status = 200, contentType = "text/html; charset=utf-8"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function client(calls: Array<{ name: string; args: Record<string, unknown> }>): ElbotolaRpcClient {
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
          return { data: { outcome: "inserted" }, error: null };
        }
        return { data: null, error: null };
      },
    }),
  };
}

describe("ElBotola metadata ingestion runtime", () => {
  it("does not accept a shared GNews trigger as ElBotola runtime configuration", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await handleElbotolaRequest(request(), {
      environment: {
        ...environment(),
        ELBOTOLA_INGESTION_TRIGGER_SECRET: undefined,
        NEWS_INGESTION_TRIGGER_SECRET: SECRET,
      },
      client: client(calls),
      fetch: async () => {
        throw new Error("No network request is permitted without the dedicated trigger");
      },
    });
    expect(result.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("fails closed before network or database work without recorded syndication approval", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let fetched = false;
    const result = await handleElbotolaRequest(request(), {
      environment: { ...environment(), ELBOTOLA_SYNDICATION_APPROVED: "false" },
      client: client(calls),
      fetch: async () => {
        fetched = true;
        return response("");
      },
    });

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: "service_unavailable" });
    expect(fetched).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("fetches only robots and the homepage and persists Arabic link metadata", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const fetched: URL[] = [];
    const first = articleHtml("2026-08-03-20-42-503");
    const second = articleHtml(
      "2026-08-03-19-32-411",
      "يحيى جبران سعيد بالعودة إلى فريق الوداد الرياضي",
      "2026-08-03 19:31 +0000",
    );
    const result = await handleElbotolaRequest(request(), {
      environment: environment(),
      client: client(calls),
      now: () => NOW,
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        fetched.push(url);
        expect(url.origin).toBe("https://www.elbotola.com");
        expect(new Headers(init?.headers).get("User-Agent")).toContain("BotolaGO-NewsMetadata");
        expect(init?.redirect).toBe("error");
        if (url.pathname === "/robots.txt") return response("not found", 404, "text/plain");
        expect(url.pathname).toBe("/");
        return response(
          homepage(
            articleImage("2026-08-03-20-42-503"),
            articleImage(
              "2026-08-03-19-32-411",
              "https://images2.elbotola.com/article/6a7108717a2769642ab813ef_thumb.webp",
            ),
            first,
            first,
            second,
          ),
        );
      },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      provider: "elbotola",
      languages: ["ar"],
      counters: { fetched: 2, validated: 2, inserted: 2, rejected: 0 },
    });
    expect(fetched.map((url) => url.pathname)).toEqual(["/robots.txt", "/"]);

    const persisted = calls.filter((call) => call.name === "news_ingest_provider_article");
    expect(persisted).toHaveLength(2);
    expect(persisted[0].args).toMatchObject({
      p_provider_slug: "elbotola",
      p_language: "ar",
      p_source_name: "ElBotola",
      p_source_url: "https://www.elbotola.com/",
      p_sanitizer_version: "elbotola-link-v1",
    });
    expect(persisted[0].args.p_title).toBe('خبر موثوق عن البطولة "الاحترافية"');
    expect(String(persisted[0].args.p_body_html)).toContain("اقرأ المقال الأصلي على البطولة");
    expect(String(persisted[0].args.p_body_html)).not.toContain("metadata only");

    const attached = calls.filter((call) => call.name === "news_attach_elbotola_hero");
    expect(attached).toHaveLength(2);
    expect(attached[0].args).toEqual({
      p_external_id: "2026-08-03-20-42-503",
      p_source_url: "https://images2.elbotola.com/article/6a7108717a2769642ab813ee_default.jpg",
      p_alt_text: 'خبر موثوق عن البطولة "الاحترافية"',
    });
  });

  it("ignores non-allowlisted or credential-bearing image URLs", () => {
    const parsed = parseElbotolaHomepage(
      homepage(
        articleImage("2026-08-03-20-42-503", "https://copy.example/article/stolen.jpg"),
        articleImage(
          "2026-08-03-19-32-411",
          "https://images2.elbotola.com/article/photo.jpg?signature=secret",
        ),
        articleHtml("2026-08-03-20-42-503"),
        articleHtml("2026-08-03-19-32-411"),
      ),
      10,
      NOW,
    );

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.heroSourceUrl === undefined)).toBe(true);
  });

  it("honors a robots rule that disallows homepage collection", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let fetched = 0;
    const result = await handleElbotolaRequest(request(), {
      environment: environment(),
      client: client(calls),
      fetch: async () => {
        fetched += 1;
        return response("User-agent: *\nDisallow: /\n", 200, "text/plain");
      },
    });

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: "source_crawling_disallowed" });
    expect(fetched).toBe(1);
    expect(calls.find((call) => call.name === "news_complete_ingestion_run")).toMatchObject({
      args: { p_status: "failed", p_error_code: "source_crawling_disallowed" },
    });
  });

  it("retries one transient homepage failure without fetching any article page", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let homepageAttempts = 0;
    const result = await handleElbotolaRequest(request(), {
      environment: environment(),
      client: client(calls),
      now: () => NOW,
      sleep: async () => undefined,
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === "/robots.txt") return response("not found", 404, "text/plain");
        homepageAttempts += 1;
        if (homepageAttempts === 1) return response("temporary", 503);
        return response(homepage(articleHtml("2026-08-03-20-42-503")));
      },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ counters: { retries: 1, inserted: 1 } });
    expect(homepageAttempts).toBe(2);
  });

  it("quarantines malformed homepage metadata and completes the valid links", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await handleElbotolaRequest(request(), {
      environment: environment(),
      client: client(calls),
      now: () => NOW,
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.pathname === "/robots.txt") return response("not found", 404, "text/plain");
        return response(
          homepage(
            articleHtml("2026-08-03-20-42-503"),
            articleHtml("2026-08-03-19-32-411", "عنوان صالح لكن التاريخ تالف", "not-a-date"),
          ),
        );
      },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      counters: { fetched: 2, validated: 1, inserted: 1, rejected: 1 },
    });
    expect(calls.find((call) => call.name === "news_record_ingestion_rejection")).toMatchObject({
      args: {
        p_external_id: "2026-08-03-19-32-411",
        p_reason: "invalid_payload",
        p_error_code: "invalid_provider_payload",
      },
    });
    expect(calls.at(-1)).toMatchObject({
      name: "news_complete_ingestion_run",
      args: { p_status: "partially_succeeded" },
    });
  });

  it("rejects malformed article metadata while preserving valid items", () => {
    const parsed = parseElbotolaHomepage(
      homepage(
        articleHtml("2026-08-03-20-42-503"),
        articleHtml("2026-08-03-19-32-411", "<script>unsafe</script>", "not-a-date"),
      ),
      10,
      NOW,
    );

    expect(parsed.items).toHaveLength(1);
    expect(parsed.rejectedExternalIds).toEqual(["2026-08-03-19-32-411"]);
  });

  it("rejects unauthorized requests before fetching ElBotola", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let fetched = false;
    const result = await handleElbotolaRequest(request("wrong"), {
      environment: environment(),
      client: client(calls),
      fetch: async () => {
        fetched = true;
        return response("");
      },
    });
    expect(result.status).toBe(401);
    expect(fetched).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
