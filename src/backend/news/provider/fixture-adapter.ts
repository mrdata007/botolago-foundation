import { NewsProviderError, type NewsProvider, type NewsProviderPage } from "./contracts";
import { fixtureProviderArticleSchema, normalizedNewsArticleSchema } from "./schemas";

export type FixtureNewsArticle = ReturnType<typeof fixtureProviderArticleSchema.parse>;

export class FixtureNewsProvider implements NewsProvider<unknown> {
  readonly name = "fixture";

  constructor(private readonly fixtures: readonly unknown[]) {}

  async fetchArticles(
    request: { cursor?: string | null; limit: number },
    signal: AbortSignal,
  ): Promise<NewsProviderPage<unknown>> {
    if (signal.aborted)
      throw new NewsProviderError("provider_timeout", "Fixture request aborted.", true);
    const start = request.cursor ? Number.parseInt(request.cursor, 10) : 0;
    if (!Number.isSafeInteger(start) || start < 0)
      throw new NewsProviderError("invalid_provider_payload", "Invalid fixture cursor.", false);
    const items = this.fixtures.slice(start, start + request.limit);
    const next = start + items.length;
    return {
      items,
      nextCursor: next < this.fixtures.length ? String(next) : null,
      quota: { limit: null, remaining: null, resetsAt: null },
      fetchedAt: new Date(0).toISOString(),
    };
  }

  normalize(payload: unknown) {
    const parsed = fixtureProviderArticleSchema.safeParse(payload);
    if (!parsed.success)
      throw new NewsProviderError(
        "invalid_provider_payload",
        "Fixture news payload is invalid.",
        false,
        null,
        parsed.error,
      );
    const { fixtureSequence: _ignored, ...canonical } = parsed.data;
    return normalizedNewsArticleSchema.parse(canonical);
  }
}
