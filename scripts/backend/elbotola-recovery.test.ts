import { describe, expect, test } from "bun:test";
import {
  createRecoveryClients,
  observedClient,
  prepareSource,
  runtimeGuard,
  validateCanaryRun,
  validateCounters,
  validateStandDownFeed,
  type ObservedArticle,
} from "./elbotola-recovery";
import type { ElbotolaRpcClient } from "../../supabase/functions/_shared/elbotola";

const PROJECT = "tkewgajrljbwgwedqsxn";
const ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-14T18:00:00Z");
const ARTICLE: ObservedArticle = {
  id: ID,
  canonicalUrl: "https://www.elbotola.com/article/2026-09-14-17-45-891.html",
  publishedAt: "2026-09-14T17:38:00Z",
};
const item = () => ({
  id: ID,
  language: "ar",
  publisher: { slug: "elbotola" },
  publishedAt: ARTICLE.publishedAt,
  hero: { sourceUrl: "https://images2.elbotola.com/article/abc_default.jpg" },
});
const env = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  GITHUB_REPOSITORY: "mrdata007/botolago-foundation",
  GITHUB_REF: "refs/heads/main",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_SHA: "a".repeat(40),
  EXPECTED_COMMIT: "a".repeat(40),
  CONFIRMATION: "RUN_ELBOTOLA_RECOVERY",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR: "mrdata007",
  ELBOTOLA_RECOVERY_MODE: "canary",
  SUPABASE_PRODUCTION_PROJECT_REF: PROJECT,
  SUPABASE_PRODUCTION_PROJECT_NAME: "BotolaGO Production V2",
  SUPABASE_PRODUCTION_URL: `https://${PROJECT}.supabase.co`,
  SUPABASE_SECRET_KEY: "test-service-credential",
  SUPABASE_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_test",
  ...overrides,
});
const result = (overrides: Record<string, unknown> = {}) => ({
  provider: "elbotola",
  languages: ["ar"],
  counters: {
    fetched: 1,
    validated: 1,
    inserted: 1,
    updated: 0,
    skipped: 0,
    rejected: 0,
    retries: 0,
    ...overrides,
  },
});
function client(data: unknown, error: { code: string } | null = null): ElbotolaRpcClient {
  const value =
    data && typeof data === "object" ? { websiteUrl: "https://www.elbotola.com/", ...data } : data;
  return { schema: () => ({ rpc: async () => ({ data: value, error }) }) };
}

describe("ElBotola protected runner", () => {
  test("requires existing service and public credentials and exact owner-reviewed main", () => {
    expect(runtimeGuard(env()).mode).toBe("canary");
    for (const change of [
      { GITHUB_ACTOR: "another" },
      { EXPECTED_COMMIT: "b".repeat(40) },
      { GITHUB_RUN_ATTEMPT: "2" },
      { GITHUB_REF: "refs/heads/preview" },
      { CONFIRMATION: "" },
      { SUPABASE_PRODUCTION_PROJECT_REF: "wrong-project" },
      { SUPABASE_SECRET_KEY: "" },
      { SUPABASE_PRODUCTION_PUBLISHABLE_KEY: "" },
    ]) {
      expect(() => runtimeGuard(env(change))).toThrow();
    }
  });
  test("public feed verification uses the publishable identity while writes use service identity", async () => {
    const requests: Array<{ url: string; key: string | null }> = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), key: new Headers(init?.headers).get("apikey") });
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const { writer, reader } = createRecoveryClients(runtimeGuard(env()), fetcher);
    await writer.schema("api").rpc("service_elbotola_source_status", {});
    await reader.schema("api").rpc("news_feed", { p_language: "ar", p_limit: 50 });
    await reader.schema("api").rpc("news_article_detail", { p_language: "ar", p_identifier: ID });
    expect(requests.map((request) => request.key)).toEqual([
      "test-service-credential",
      "sb_publishable_test",
      "sb_publishable_test",
    ]);
    expect(requests[1].url).toContain("/rpc/news_feed");
    expect(requests[2].url).toContain("/rpc/news_article_detail");
  });
  test("scheduled runs require opt-in and cannot activate a canary", () => {
    expect(
      runtimeGuard(
        env({
          GITHUB_EVENT_NAME: "schedule",
          ELBOTOLA_RECOVERY_MODE: "refresh",
          ELBOTOLA_SCHEDULE_ENABLED: "true",
        }),
      ).mode,
    ).toBe("refresh");
    expect(() => runtimeGuard(env({ GITHUB_EVENT_NAME: "schedule" }))).toThrow();
    expect(() => runtimeGuard(env({ GITHUB_EVENT_NAME: "push" }))).toThrow();
  });
  test("canary provenance rejects wrong actor, workflow, branch, failure and reruns", () => {
    const run = {
      path: ".github/workflows/news-elbotola-recovery.yml",
      event: "workflow_dispatch",
      conclusion: "success",
      head_branch: "main",
      run_attempt: 1,
      repository: { full_name: "mrdata007/botolago-foundation" },
      actor: { login: "mrdata007" },
      head_sha: "a".repeat(40),
    };
    expect(validateCanaryRun(run)).toBe(run.head_sha);
    for (const change of [
      { actor: { login: "another" } },
      { path: "other.yml" },
      { conclusion: "failure" },
      { run_attempt: 2 },
      { event: "schedule" },
      { head_branch: "preview" },
    ])
      expect(() => validateCanaryRun({ ...run, ...change })).toThrow();
  });
  test("zero-rejection bounded counts must reconcile exactly", () => {
    expect(validateCounters(result()).inserted).toBe(1);
    for (const change of [
      { fetched: 0, validated: 0, inserted: 0 },
      { fetched: 11, validated: 11, inserted: 11 },
      { inserted: 0 },
      { rejected: 1 },
      { validated: 0 },
      { fetched: true },
    ])
      expect(() => validateCounters(result(change))).toThrow();
  });
  // BG-0073 News stand-down: ingestion lands editions as draft/private, so no
  // observed article ID may appear in the public Arabic feed. This is the
  // inverse of the pre-stand-down contract, and it is what proves a scheduled
  // or dispatched run cannot put third-party link-outs back in front of readers.
  test("no observed article ID may be reachable in the public Arabic feed", () => {
    expect(validateStandDownFeed({ items: [] }, [ARTICLE], NOW)).toMatchObject({
      ingestedArticles: 1,
      publicFeedItems: 0,
      reachableAfterStandDown: 0,
    });
    // An unrelated, already-public article does not fail the check.
    expect(
      validateStandDownFeed({ items: [{ ...item(), id: "other-id" }] }, [ARTICLE], NOW),
    ).toMatchObject({ ingestedArticles: 1, publicFeedItems: 1 });
    // The ingested article surfacing publicly is exactly the regression to catch.
    expect(() => validateStandDownFeed({ items: [item()] }, [ARTICLE], NOW)).toThrow(
      "ingested_article_public_after_stand_down",
    );
    expect(() => validateStandDownFeed({ items: [] }, [], NOW)).toThrow();
    expect(() => validateStandDownFeed({ items: [] }, [ARTICLE, ARTICLE], NOW)).toThrow();
    expect(() => validateStandDownFeed({}, [ARTICLE], NOW)).toThrow();
  });
  test("stale provider content cannot pass just because it was persisted", () => {
    expect(() =>
      validateStandDownFeed(
        { items: [] },
        [{ ...ARTICLE, publishedAt: "2026-07-28T10:00:00Z" }],
        NOW,
      ),
    ).toThrow("news_still_stale");
  });
  test("publisher control cannot be bypassed in refresh and blocked status is rejected", async () => {
    await expect(
      prepareSource(
        client({ active: true, trustStatus: "trusted", websiteUrl: "https://wrong.example" }),
        "refresh",
      ),
    ).rejects.toThrow("blocked");
    expect(
      await prepareSource(client({ active: false, trustStatus: "review_required" }), "canary"),
    ).toBe(false);
    expect(await prepareSource(client({ active: true, trustStatus: "trusted" }), "refresh")).toBe(
      true,
    );
    await expect(
      prepareSource(client({ active: false, trustStatus: "trusted" }), "refresh"),
    ).rejects.toThrow("not_active");
    await expect(
      prepareSource(client({ active: true, trustStatus: "blocked" }), "canary"),
    ).rejects.toThrow("blocked");
    await expect(prepareSource(client(null, { code: "42501" }), "canary")).rejects.toThrow(
      "unavailable",
    );
  });
  test("only acknowledged database writes contribute to observed run evidence", async () => {
    const evidence: Record<string, unknown> = {};
    const articles: ObservedArticle[] = [];
    await observedClient(client({ runId: ID }), evidence, articles)
      .schema("api")
      .rpc("news_begin_provider_ingestion", {});
    expect(evidence.ingestionRunId).toBe(ID);
    await observedClient(client({ articleId: ID }), evidence, articles)
      .schema("api")
      .rpc("news_ingest_provider_article", {
        p_canonical_url: ARTICLE.canonicalUrl,
        p_source_published_at: ARTICLE.publishedAt,
      });
    expect(articles).toEqual([ARTICLE]);
    await observedClient(client(null, { code: "42501" }), evidence, articles)
      .schema("api")
      .rpc("news_complete_ingestion_run", { p_status: "succeeded" });
    expect(evidence.databaseCompletion).toBeUndefined();
  });
});
