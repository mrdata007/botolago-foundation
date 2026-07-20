import type { NormalizedNewsArticle, NewsProvider } from "../provider/contracts";

export interface NewsIngestionCounters {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
}

export interface NewsIngestionGateway {
  begin(providerName: string, jobType: string, cursor: string | null): Promise<string>;
  persist(
    runId: string,
    providerName: string,
    article: NormalizedNewsArticle,
  ): Promise<"inserted" | "updated" | "skipped">;
  reject(runId: string, externalId: string | null, code: string, summary: string): Promise<void>;
  complete(
    runId: string,
    status: "succeeded" | "partially_succeeded" | "failed",
    cursor: string | null,
    counters: NewsIngestionCounters,
  ): Promise<void>;
}

export interface NewsIngestionJob<TRaw> {
  readonly provider: NewsProvider<TRaw>;
  readonly jobType: string;
  readonly pageSize: number;
  readonly maxPages: number;
}
