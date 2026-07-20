import { NewsProviderError } from "../provider/contracts";
import { withNewsProviderResilience } from "../provider/resilience";
import type { NewsIngestionCounters, NewsIngestionGateway, NewsIngestionJob } from "./contracts";

export async function runNewsIngestion<TRaw>(
  job: NewsIngestionJob<TRaw>,
  gateway: NewsIngestionGateway,
  startCursor: string | null = null,
): Promise<NewsIngestionCounters> {
  const runId = await gateway.begin(job.provider.name, job.jobType, startCursor);
  const counters: NewsIngestionCounters = {
    fetched: 0,
    validated: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
  };
  let cursor = startCursor;
  try {
    for (let pageNumber = 0; pageNumber < job.maxPages; pageNumber += 1) {
      const page = await withNewsProviderResilience((signal) =>
        job.provider.fetchArticles({ cursor, limit: job.pageSize }, signal),
      );
      counters.fetched += page.items.length;
      for (const raw of page.items) {
        let externalId: string | null = null;
        try {
          const article = job.provider.normalize(raw);
          externalId = article.externalId;
          counters.validated += 1;
          const outcome = await gateway.persist(runId, job.provider.name, article);
          counters[outcome] += 1;
        } catch (error) {
          counters.rejected += 1;
          const code = error instanceof NewsProviderError ? error.code : "invalid_provider_payload";
          await gateway.reject(
            runId,
            externalId,
            code,
            "Article rejected; inspect correlated server logs.",
          );
        }
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    const status = counters.rejected > 0 ? "partially_succeeded" : "succeeded";
    await gateway.complete(runId, status, cursor, counters);
    return counters;
  } catch (error) {
    await gateway.complete(runId, "failed", cursor, counters);
    throw error;
  }
}
