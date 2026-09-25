import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { BackendError } from "@/backend/errors";
import { FootballError } from "@/backend/football/errors";
import { NewsError } from "@/backend/news/errors";
import {
  createAppQueryClient,
  MAX_QUERY_RETRIES,
  queryRetryDelay,
  SEASON_CATALOG_STALE_MS,
  shouldRetryQuery,
} from "./query-client";

describe("app query cache defaults", () => {
  const clients: ReturnType<typeof createAppQueryClient>[] = [];

  afterEach(() => {
    for (const client of clients.splice(0)) client.clear();
  });

  test("reuses fresh data for quick navigation but refetches after invalidation", async () => {
    const client = createAppQueryClient();
    clients.push(client);
    let calls = 0;
    const query = { queryKey: ["football", "matches"], queryFn: async () => ++calls };

    expect(await client.fetchQuery(query)).toBe(1);
    expect(await client.fetchQuery(query)).toBe(1);
    expect(calls).toBe(1);

    await client.invalidateQueries({ queryKey: query.queryKey });
    expect(await client.fetchQuery(query)).toBe(2);
    expect(calls).toBe(2);
  });
});

describe("retries", () => {
  test("a failing request is asked once more, then the page shows its error", async () => {
    const client = createAppQueryClient();
    let calls = 0;
    const failing = client.fetchQuery({
      queryKey: ["football", "matches", "down"],
      queryFn: async () => {
        calls += 1;
        throw new Error("upstream 500");
      },
      retryDelay: 0,
    });
    await expect(failing).rejects.toThrow("upstream 500");
    expect(calls).toBe(2);
    client.clear();
  });

  test("server trouble is retried once; what a retry cannot change is not", () => {
    expect(shouldRetryQuery(0, new Error("TimeoutError: signal timed out"))).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, new Error("upstream 500"))).toBe(false);
    expect(shouldRetryQuery(0, new FootballError("data_unavailable", "down"))).toBe(true);
    expect(shouldRetryQuery(0, new FootballError("fixture_not_found", "gone"))).toBe(false);
    expect(shouldRetryQuery(0, new NewsError("article_not_found", "gone"))).toBe(false);
    expect(shouldRetryQuery(0, new NewsError("data_unavailable", "down"))).toBe(true);
    expect(shouldRetryQuery(0, { code: "unauthorized" })).toBe(false);
    expect(
      shouldRetryQuery(0, new BackendError("internal", "boom", { status: 500, retryable: false })),
    ).toBe(true);
    expect(
      shouldRetryQuery(0, new BackendError("forbidden", "no", { status: 403, retryable: false })),
    ).toBe(false);
  });

  test("the retry waits about a second, spread so tabs do not retry together", () => {
    expect(queryRetryDelay(0, () => 0)).toBe(500);
    expect(queryRetryDelay(0, () => 0.999)).toBe(1_499);
    expect(queryRetryDelay(10, () => 0.5)).toBe(8_000);
  });
});

describe("the season list", () => {
  afterEach(() => setSystemTime());

  test("is kept for a visit instead of fifteen seconds", async () => {
    const client = createAppQueryClient();
    const calls = { seasons: 0, matches: 0 };
    const seasons = {
      queryKey: ["football", "seasons", "fr"],
      queryFn: async () => ++calls.seasons,
    };
    const matches = {
      queryKey: ["football", "matches", "2026-09-24"],
      queryFn: async () => ++calls.matches,
    };
    setSystemTime(new Date("2026-09-24T20:00:00Z"));
    await client.fetchQuery(seasons);
    await client.fetchQuery(matches);

    // A minute later, as a visitor goes from Home to Matches.
    setSystemTime(new Date("2026-09-24T20:01:00Z"));
    await client.fetchQuery(seasons);
    await client.fetchQuery(matches);
    expect(calls).toEqual({ seasons: 1, matches: 2 });

    // After ten minutes the list is read again.
    setSystemTime(new Date("2026-09-24T20:10:01Z"));
    await client.fetchQuery(seasons);
    expect(calls.seasons).toBe(2);
    expect(SEASON_CATALOG_STALE_MS).toBe(600_000);
    client.clear();
  });
});
