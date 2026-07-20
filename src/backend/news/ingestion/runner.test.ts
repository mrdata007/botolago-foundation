import { describe, expect, test } from "bun:test";
import { FixtureNewsProvider } from "../provider/fixture-adapter";
import type { NewsIngestionGateway } from "./contracts";
import { runNewsIngestion } from "./runner";

const valid = {
  externalId: "fixture-1",
  canonicalUrl: "https://publisher.test/fixture-1",
  language: "fr",
  title: "Titre déterministe de fixture",
  subtitle: null,
  summary: "Résumé déterministe suffisamment long pour ingestion.",
  bodyHtml: "<p>Corps déterministe suffisamment long pour ingestion.</p>",
  authorName: null,
  publishedAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:01:00Z",
  heroUrl: null,
  categorySlugs: [],
  topicSlugs: [],
  tagSlugs: [],
  providerVersion: "1",
  fixtureSequence: 1,
};

describe("news ingestion runner", () => {
  test("continues after a quarantined payload and completes partially", async () => {
    const completions: string[] = [];
    const gateway: NewsIngestionGateway = {
      begin: async () => "run-1",
      persist: async () => "inserted",
      reject: async () => undefined,
      complete: async (_id, status) => void completions.push(status),
    };
    const counts = await runNewsIngestion(
      {
        provider: new FixtureNewsProvider([valid, { broken: true }]),
        jobType: "sync_articles",
        pageSize: 10,
        maxPages: 2,
      },
      gateway,
    );
    expect(counts).toEqual({
      fetched: 2,
      validated: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      rejected: 1,
    });
    expect(completions).toEqual(["partially_succeeded"]);
  });
});
