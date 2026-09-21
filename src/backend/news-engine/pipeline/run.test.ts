import { describe, expect, test } from "bun:test";

import { runPipeline } from "./run";
import { NewsHttpClient, type FetchLike } from "../fetch/http";
import { RobotsCache } from "../fetch/robots";
import { factsSchema } from "../extraction/facts";
import { generatedArticleSchema } from "../generation/compose";
import { contentHash, urlHash } from "../normalization/hashing";
import type { NewsLanguageModel, StructuredRequest, StructuredResult } from "../llm/model";
import type {
  ClusterBundle,
  ClusterCandidate,
  EntityResolution,
  NewsEngineGateway,
  PublishArticleInput,
  PublishArticleResult,
  RecordFailureInput,
} from "../gateway/contracts";
import type { DiscoveredItem, ItemStatus, PendingItem, SourceClaim } from "../contracts";

const RAJA = "11111111-1111-1111-1111-111111111111";
const PLAYER = "22222222-2222-2222-2222-222222222222";

const ARTICLE_PATTERN =
  "^https://news\\.example\\.com/article/([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+)\\.html$";

const SOURCE_BODY =
  "Raja Casablanca have completed the signing of midfielder Ayoub Nasser from Hassania Agadir. " +
  "The club confirmed on Sunday that the 24-year-old has agreed a three-year contract running to 2029. " +
  "He is expected to join training this week ahead of the next Botola Pro fixture. " +
  "Hassania Agadir acknowledged the departure in a short statement of their own. ";

function sourceClaim(overrides: Partial<SourceClaim["source"]> = {}): SourceClaim {
  return {
    source: {
      id: "source-1",
      slug: "example",
      name: "Example",
      hostname: "news.example.com",
      publisherId: "publisher-1",
      sourceKind: "publisher",
      languages: ["fr"],
      discoveryMethod: "news_sitemap",
      discoveryUrl: "https://news.example.com/sitemap.xml",
      articleUrlPattern: ARTICLE_PATTERN,
      allowedMediaHosts: [],
      priority: 10,
      pollIntervalSeconds: 1800,
      rateLimitPerMinute: 120,
      maxConcurrency: 2,
      requestTimeoutMs: 5_000,
      maxRetries: 0,
      parserVersion: "v1",
      articleFetchApproved: true,
      respectRobots: true,
      config: {},
      ...overrides,
    },
    discovery: {
      lastSeenItemKey: null,
      lastSeenPublishedAt: null,
      lastSuccessfulDiscoveryAt: null,
      etag: null,
      lastModified: null,
      consecutiveFailures: 0,
    },
  };
}

interface StoredItem extends PendingItem {
  status: ItemStatus;
}

/**
 * In-memory gateway with the same idempotency contract as the database: a
 * repeated discovery is a duplicate, and one cluster key means one story.
 */
class FakeGateway implements NewsEngineGateway {
  readonly items = new Map<string, StoredItem>();
  readonly clustersByKey = new Map<string, string>();
  readonly clusterItems = new Map<string, Set<string>>();
  readonly publishedByKey = new Map<string, PublishArticleResult>();
  readonly failures: RecordFailureInput[] = [];
  readonly stages: string[] = [];
  private claim: SourceClaim;
  private sequence = 0;

  constructor(claim = sourceClaim()) {
    this.claim = claim;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  async beginRun(): Promise<string> {
    return "run-1";
  }
  async completeRun(): Promise<void> {}
  async recordStage(input: { stage: string }): Promise<void> {
    this.stages.push(input.stage);
  }
  async claimSource(): Promise<SourceClaim> {
    return this.claim;
  }

  async recordDiscovery(input: {
    items: readonly DiscoveredItem[];
  }): Promise<{ discovered: number; duplicates: number; invalid: number; itemIds: string[] }> {
    let discovered = 0;
    let duplicates = 0;
    const itemIds: string[] = [];
    for (const item of input.items) {
      const existing = [...this.items.values()].find(
        (stored) => stored.sourceUrl === item.sourceUrl,
      );
      if (existing) {
        duplicates += 1;
        continue;
      }
      const id = this.nextId("item");
      this.items.set(id, {
        id,
        sourceId: "source-1",
        sourceSlug: "example",
        sourceName: "Example",
        sourceArticleId: item.sourceArticleId,
        sourceUrl: item.sourceUrl,
        sourceLanguage: item.sourceLanguage,
        sourceTitle: item.sourceTitle,
        sourcePublishedAt: item.sourcePublishedAt,
        sourceUpdatedAt: item.sourceUpdatedAt,
        contentHash: null,
        etag: null,
        lastModified: null,
        metadata: item.metadata,
        attemptCount: 0,
        clusterId: null,
        articleFetchApproved: true,
        parserVersion: "v1",
        requestTimeoutMs: 5_000,
        maxRetries: 0,
        rateLimitPerMinute: 120,
        allowedMediaHosts: [],
        text: null,
        status: "discovered",
      });
      discovered += 1;
      itemIds.push(id);
    }
    return { discovered, duplicates, invalid: 0, itemIds };
  }

  async recordDiscoveryFailure(): Promise<void> {}

  async pendingItems(input: { status: ItemStatus; limit: number }): Promise<PendingItem[]> {
    return [...this.items.values()]
      .filter((item) => item.status === input.status)
      .slice(0, input.limit);
  }

  async recordFetch(input: {
    itemId: string;
    contentHash: string;
    normalizedText: string;
    sourceTitle?: string | null;
  }): Promise<{ itemId: string; outcome: "fetched" | "skipped"; contentHash: string }> {
    const item = this.items.get(input.itemId);
    if (!item) throw new Error("missing item");
    if (item.contentHash === input.contentHash && item.status !== "discovered") {
      return { itemId: item.id, outcome: "skipped", contentHash: input.contentHash };
    }
    this.items.set(item.id, {
      ...item,
      contentHash: input.contentHash,
      text: input.normalizedText,
      sourceTitle: input.sourceTitle ?? item.sourceTitle,
      status: "fetched",
    });
    return { itemId: item.id, outcome: "fetched", contentHash: input.contentHash };
  }

  async recordRelevance(input: { itemId: string; relevant: boolean }): Promise<void> {
    const item = this.items.get(input.itemId);
    if (!item) return;
    this.items.set(item.id, { ...item, status: input.relevant ? "parsed" : "irrelevant" });
  }

  async resolveEntities(input: {
    kind: string;
    mentions: readonly string[];
  }): Promise<EntityResolution[]> {
    return input.mentions.map((mention) => {
      const lowered = mention.toLowerCase();
      if (input.kind === "team" && lowered.includes("raja")) {
        return { mention, normalized: lowered, entityId: RAJA, confidence: 1 };
      }
      if (input.kind === "player" && lowered.includes("ayoub")) {
        return { mention, normalized: lowered, entityId: PLAYER, confidence: 1 };
      }
      return { mention, normalized: lowered, entityId: null, confidence: null };
    });
  }

  async recordFacts(input: { itemId: string }): Promise<string> {
    const item = this.items.get(input.itemId);
    if (item) this.items.set(item.id, { ...item, status: "extracted" });
    return this.nextId("facts");
  }

  async matchClusters(): Promise<ClusterCandidate[]> {
    return [];
  }

  async assignCluster(input: {
    itemId: string;
    clusterKey: string;
  }): Promise<{ clusterId: string; clusterKey: string; created: boolean; storyId: string | null }> {
    let clusterId = this.clustersByKey.get(input.clusterKey);
    const created = !clusterId;
    if (!clusterId) {
      clusterId = this.nextId("cluster");
      this.clustersByKey.set(input.clusterKey, clusterId);
      this.clusterItems.set(clusterId, new Set());
    }
    this.clusterItems.get(clusterId)?.add(input.itemId);
    const item = this.items.get(input.itemId);
    if (item) this.items.set(item.id, { ...item, status: "clustered", clusterId });
    return { clusterId, clusterKey: input.clusterKey, created, storyId: null };
  }

  async flagClusterConflict(): Promise<void> {}

  async clusterBundle(clusterId: string): Promise<ClusterBundle> {
    const key = [...this.clustersByKey.entries()].find(([, id]) => id === clusterId)?.[0] ?? "k";
    const memberIds = [...(this.clusterItems.get(clusterId) ?? [])];
    return {
      cluster: {
        id: clusterId,
        clusterKey: key,
        eventType: "official_signing",
        eventDate: "2026-09-21",
        status: "clustered",
        storyId: null,
        bestClaimStatus: "official",
        itemCount: memberIds.length,
        sourceCount: 1,
        hasConflict: false,
        conflictSummary: null,
      },
      competition: null,
      teams: [
        {
          id: RAJA,
          slug: "raja",
          name: "Raja Casablanca",
          shortName: "RCA",
          code: "RCA",
          aliases: [],
        },
      ],
      players: [
        {
          id: PLAYER,
          slug: "ayoub",
          fullName: "Ayoub Nasser",
          displayName: "Ayoub Nasser",
          position: "midfielder",
        },
      ],
      items: memberIds.map((id) => {
        const item = this.items.get(id);
        return {
          itemId: id,
          sourceSlug: "example",
          sourceName: "Example",
          sourceKind: "publisher",
          sourceUrl: item?.sourceUrl ?? "",
          sourceTitle: item?.sourceTitle ?? null,
          sourceLanguage: "fr",
          sourcePublishedAt: item?.sourcePublishedAt ?? null,
          sourceText: item?.text ?? null,
          facts: {
            eventType: "official_signing",
            eventDate: "2026-09-21",
            score: null,
            claims: [
              {
                text: "Raja Casablanca signed Ayoub Nasser from Hassania Agadir.",
                status: "official",
              },
              { text: "The contract runs for three years to 2029.", status: "official" },
            ],
            quotes: [],
            unresolved: [],
            bestClaimStatus: "official",
            confidence: 0.9,
          },
        };
      }),
      policy: {
        eventType: "official_signing",
        minimumClaimStatus: "official",
        minimumSourceCount: 1,
        autoPublish: true,
        requireResolvedEntities: true,
      },
      attempts: [],
    };
  }

  async recordGeneration(): Promise<{
    attemptId: string;
    attemptNumber: number;
    verdict: "passed";
  }> {
    return { attemptId: this.nextId("attempt"), attemptNumber: 1, verdict: "passed" };
  }

  async resolveHeroAsset(): Promise<{ assetId: string | null; origin: string }> {
    return { assetId: null, origin: "botolago_editorial_graphic" };
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    // Mirrors the database's (cluster, language) idempotency.
    const key = `${input.clusterId}:${input.language}`;
    const existing = this.publishedByKey.get(key);
    const result: PublishArticleResult = {
      outcome: existing ? "updated" : "inserted",
      storyId: existing?.storyId ?? this.nextId("story"),
      articleId: existing?.articleId ?? this.nextId("article"),
      slug: input.slug,
      language: input.language,
      status: input.publish ? "published" : "draft",
      published: input.publish,
    };
    this.publishedByKey.set(key, result);
    return result;
  }

  async recordFailure(input: RecordFailureInput): Promise<string> {
    this.failures.push(input);
    return this.nextId("failure");
  }

  async status(): Promise<Record<string, unknown>> {
    return {};
  }
}

/** Deterministic model: no network, no key, same output every run. */
class StubModel implements NewsLanguageModel {
  readonly name = "stub-model";
  calls = 0;

  constructor(private readonly overrides: { body?: string; throwOnGenerate?: boolean } = {}) {}

  async complete<TSchema extends Parameters<NewsLanguageModel["complete"]>[0]["schema"]>(
    request: StructuredRequest<TSchema>,
  ): Promise<StructuredResult<unknown>> {
    this.calls += 1;
    if (request.schemaName === "extracted_facts") {
      return {
        value: factsSchema.parse({
          event_type: "official_signing",
          event_date: "2026-09-21",
          competition: null,
          clubs: ["Raja Casablanca", "Hassania Agadir"],
          players: ["Ayoub Nasser"],
          score: null,
          claims: [
            {
              text: "Raja Casablanca signed Ayoub Nasser from Hassania Agadir.",
              status: "official",
              confidence: 0.95,
            },
          ],
          quotes: [],
          summary: "Raja Casablanca signed Ayoub Nasser on a three-year deal.",
        }),
        model: this.name,
        inputTokens: 10,
        outputTokens: 10,
        cachedInputTokens: 0,
      };
    }
    if (this.overrides.throwOnGenerate) throw new Error("model unavailable");
    return {
      value: generatedArticleSchema.parse({
        headline: "Ayoub Nasser rejoint le Raja Casablanca",
        slug_hint: "ayoub-nasser-rejoint-raja",
        excerpt:
          "Le milieu de terrain arrive en provenance du Hassania Agadir et s'est engage pour trois saisons.",
        body_html:
          this.overrides.body ??
          "<p>Ayoub Nasser est un joueur du Raja Casablanca. Le club casablancais a officiellement annonce l'arrivee du milieu de terrain en provenance du Hassania Agadir.</p><p>L'accord porte sur trois saisons et court jusqu'en 2029. Le joueur de 24 ans est attendu a l'entrainement dans les prochains jours.</p><p>Du cote d'Agadir, la direction a pris acte du depart par un communique bref publie sur ses propres canaux.</p>",
        category: "transfers",
        tags: ["official-announcement"],
        seo_title: "Ayoub Nasser signe au Raja Casablanca",
        meta_description:
          "Le Raja Casablanca a officialise l'arrivee du milieu Ayoub Nasser en provenance du Hassania Agadir pour trois saisons.",
        og_title: "Ayoub Nasser signe au Raja Casablanca",
        og_description:
          "Le Raja Casablanca a officialise l'arrivee du milieu Ayoub Nasser en provenance du Hassania Agadir pour trois saisons.",
      }),
      model: this.name,
      inputTokens: 10,
      outputTokens: 10,
      cachedInputTokens: 0,
    };
  }
}

function articlePage(body: string): string {
  return `<!doctype html><html lang="fr"><head><script type="application/ld+json">${JSON.stringify({
    "@type": "NewsArticle",
    headline: "Raja signe Ayoub Nasser",
    datePublished: "2026-09-21T15:00:00Z",
    inLanguage: "fr",
    articleBody: body,
  })}</script></head><body></body></html>`;
}

function stubFetch(options: { articleStatus?: number; body?: string } = {}): FetchLike {
  return async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      return new Response("User-agent: *\nAllow: /", { status: 200 });
    }
    if (url.includes("sitemap")) {
      return new Response(
        `<urlset><url><loc>https://news.example.com/article/2026-09-21-1.html</loc><lastmod>2026-09-21</lastmod></url></urlset>`,
        { status: 200, headers: { "content-type": "application/xml" } },
      );
    }
    if (options.articleStatus && options.articleStatus !== 200) {
      return new Response("nope", { status: options.articleStatus });
    }
    return new Response(articlePage(options.body ?? SOURCE_BODY.repeat(2)), { status: 200 });
  };
}

function dependencies(gateway: NewsEngineGateway, model: NewsLanguageModel, fetchImpl: FetchLike) {
  const http = new NewsHttpClient({
    fetch: fetchImpl,
    sleep: async () => undefined,
    jitter: () => 0.5,
  });
  return { gateway, model, http, robots: new RobotsCache(http, "BotolaGO-NewsEngine/1.0") };
}

const baseOptions = {
  sourceSlug: "example",
  jobType: "incremental",
  triggerKind: "manual" as const,
  limit: 10,
  languages: ["fr"] as const,
  dryRun: false,
  reviewOnly: false,
  allowPublish: true,
};

describe("news engine pipeline", () => {
  test("carries one article from discovery through to publication", async () => {
    const gateway = new FakeGateway();
    const report = await runPipeline(
      dependencies(gateway, new StubModel(), stubFetch()),
      baseOptions,
    );

    expect(report.status).toBe("succeeded");
    expect(report.counters.discovered).toBe(1);
    expect(report.counters.fetched).toBe(1);
    expect(report.counters.relevant).toBe(1);
    expect(report.counters.extracted).toBe(1);
    expect(report.counters.clustered).toBe(1);
    expect(report.counters.generated).toBe(1);
    expect(report.publishedArticles).toHaveLength(1);
    expect(report.publishedArticles[0]?.published).toBe(true);
    // Every stage reported.
    expect(gateway.stages).toEqual(["discovery", "fetch", "relevance", "extraction", "generation"]);
  });

  test("running the same import ten times produces one article", async () => {
    // The whole point of the idempotency work: repeated runs must not
    // multiply public content.
    const gateway = new FakeGateway();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await runPipeline(dependencies(gateway, new StubModel(), stubFetch()), baseOptions);
    }
    expect(gateway.items.size).toBe(1);
    expect(gateway.clustersByKey.size).toBe(1);
    expect(gateway.publishedByKey.size).toBe(1);
  });

  test("a failed article fetch does not end the batch", async () => {
    const gateway = new FakeGateway();
    const report = await runPipeline(
      dependencies(gateway, new StubModel(), stubFetch({ articleStatus: 403 })),
      baseOptions,
    );
    expect(report.status).toBe("partially_succeeded");
    expect(gateway.failures.some((failure) => failure.failureCode === "FETCH_FAILED")).toBe(true);
    // The run completed rather than throwing.
    expect(report.counters.failed).toBeGreaterThan(0);
  });

  test("an irrelevant article is dropped with a stored reason", async () => {
    const gateway = new FakeGateway();
    const irrelevant =
      "The Premier League champions completed the signing of a midfielder in a record deal. ".repeat(
        6,
      );
    await runPipeline(
      dependencies(gateway, new StubModel(), stubFetch({ body: irrelevant })),
      baseOptions,
    );
    const item = [...gateway.items.values()][0];
    expect(item?.status).toBe("irrelevant");
    expect(gateway.publishedByKey.size).toBe(0);
  });

  test("a copied draft is never published", async () => {
    // Similarity gate: the generator returns the source text verbatim.
    const gateway = new FakeGateway();
    // Long enough to satisfy the schema's minimum body length, so the draft
    // actually reaches the gate rather than failing validation first.
    const copied = `<p>${SOURCE_BODY}</p><p>${SOURCE_BODY}</p>`;
    const report = await runPipeline(
      dependencies(gateway, new StubModel({ body: copied }), stubFetch()),
      baseOptions,
    );
    expect(gateway.publishedByKey.size).toBe(0);
    expect(report.counters.published).toBe(0);
    expect(gateway.failures.some((failure) => failure.failureCode === "SIMILARITY_TOO_HIGH")).toBe(
      true,
    );
  });

  test("review-only holds the article as a draft", async () => {
    const gateway = new FakeGateway();
    const report = await runPipeline(dependencies(gateway, new StubModel(), stubFetch()), {
      ...baseOptions,
      reviewOnly: true,
      allowPublish: false,
    });
    expect(report.counters.published).toBe(0);
    expect(report.counters.review).toBe(1);
    expect(report.publishedArticles[0]?.published).toBe(false);
  });

  test("a dry run writes nothing", async () => {
    const gateway = new FakeGateway();
    const report = await runPipeline(dependencies(gateway, new StubModel(), stubFetch()), {
      ...baseOptions,
      dryRun: true,
    });
    expect(gateway.items.size).toBe(0);
    expect(gateway.publishedByKey.size).toBe(0);
    expect(gateway.clustersByKey.size).toBe(0);
    expect(gateway.failures).toHaveLength(0);
    expect(report.runId).toBeNull();
  });

  test("a dry run still runs the whole pipeline, model calls included", async () => {
    // A dry run that stopped after discovery would exercise only the crawler,
    // which is the part that needs verifying least. This is what makes the
    // pre-activation dry run a real check of the model path and the gates.
    const gateway = new FakeGateway();
    const model = new StubModel();
    const report = await runPipeline(dependencies(gateway, model, stubFetch()), {
      ...baseOptions,
      dryRun: true,
    });
    expect(report.counters.discovered).toBe(1);
    expect(report.counters.fetched).toBe(1);
    expect(report.counters.relevant).toBe(1);
    expect(report.counters.extracted).toBe(1);
    expect(report.counters.clustered).toBe(1);
    expect(report.counters.generated).toBe(1);
    // One extraction call plus one composition call.
    expect(model.calls).toBe(2);
    // And still nothing persisted.
    expect(report.counters.published).toBe(0);
    expect(gateway.publishedByKey.size).toBe(0);
  });

  test("a dry run drops an irrelevant article before spending a model call", async () => {
    const gateway = new FakeGateway();
    const model = new StubModel();
    const irrelevant =
      "The Premier League champions completed the signing of a midfielder in a record deal. ".repeat(
        6,
      );
    await runPipeline(dependencies(gateway, model, stubFetch({ body: irrelevant })), {
      ...baseOptions,
      dryRun: true,
    });
    expect(model.calls).toBe(0);
  });

  test("refuses to read article pages when the source is not approved for it", async () => {
    const gateway = new FakeGateway(sourceClaim({ articleFetchApproved: false }));
    const report = await runPipeline(
      dependencies(gateway, new StubModel(), stubFetch()),
      baseOptions,
    );
    expect(report.status).toBe("failed");
    expect(gateway.publishedByKey.size).toBe(0);
  });

  test("a model failure is isolated to its stage", async () => {
    const gateway = new FakeGateway();
    const report = await runPipeline(
      dependencies(gateway, new StubModel({ throwOnGenerate: true }), stubFetch()),
      baseOptions,
    );
    expect(report.status).toBe("partially_succeeded");
    expect(gateway.failures.some((failure) => failure.stage === "generation")).toBe(true);
    // Discovery, fetch and extraction still did their work.
    expect(report.counters.extracted).toBe(1);
  });

  test("records provenance hashes that match the canonical helpers", async () => {
    const gateway = new FakeGateway();
    await runPipeline(dependencies(gateway, new StubModel(), stubFetch()), baseOptions);
    const item = [...gateway.items.values()][0];
    expect(item?.contentHash).toBe(
      contentHash({ title: "Raja signe Ayoub Nasser", text: item?.text ?? "" }),
    );
    expect(urlHash(item?.sourceUrl ?? "")).toMatch(/^[a-f0-9]{64}$/u);
  });
});
