import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { focusManager, QueryObserver } from "@tanstack/react-query";
import { onMfaStepUpRequired } from "@/backend/auth/step-up";
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

describe("a return to the tab", () => {
  test("does not ask again for what the page holds, unless the query opts in", async () => {
    const client = createAppQueryClient();
    client.mount();
    const calls = { hub: 0, live: 0 };
    const stop = [
      new QueryObserver(client, {
        queryKey: ["fantasy", "availability"],
        queryFn: async () => ++calls.hub,
        staleTime: 0,
      }).subscribe(() => {}),
      new QueryObserver(client, {
        queryKey: ["football", "live-matches", "fr"],
        queryFn: async () => ++calls.live,
        staleTime: 0,
        refetchOnWindowFocus: true,
      }).subscribe(() => {}),
    ];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual({ hub: 1, live: 1 });

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual({ hub: 1, live: 2 });

    focusManager.setFocused(undefined);
    for (const unsubscribe of stop) unsubscribe();
    client.unmount();
    client.clear();
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

// Since 20260926003100 the database refuses an enrolled account's reads, not
// only its writes, to a session that has not entered its one-time code. A page
// read refused that way showed its generic error, and nothing sent the reader
// to the code unless the domain's mapper happened to report it.
describe("a read refused for want of the one-time code", () => {
  const stepUp = { code: "PT403", message: "mfa_required", details: null, hint: null };

  function countReports() {
    const reports = { count: 0 };
    const off = onMfaStepUpRequired(() => reports.count++);
    return { reports, off };
  }

  test("is not retried: a second attempt is refused the same way", () => {
    expect(shouldRetryQuery(0, stepUp)).toBe(false);
    // The same, wrapped by a mapper that does not report it.
    expect(shouldRetryQuery(0, new NewsError("data_unavailable", "News down", stepUp))).toBe(false);
    // Another 403 keeps its own rule.
    expect(shouldRetryQuery(0, { code: "PT403", message: "account_banned" })).toBe(true);
  });

  test("goes to the auth layer, as a refused write does, from any domain", async () => {
    const { reports, off } = countReports();
    const client = createAppQueryClient();
    try {
      let calls = 0;
      const refused = client.fetchQuery({
        queryKey: ["news", "saved", "someone"],
        queryFn: async () => {
          calls += 1;
          throw new NewsError("data_unavailable", "News data is temporarily unavailable.", stepUp);
        },
        retryDelay: 0,
      });
      await expect(refused).rejects.toBeInstanceOf(NewsError);
      expect(calls).toBe(1);
      expect(reports.count).toBe(1);
    } finally {
      off();
      client.clear();
    }
  });

  test("other failures are not reported", async () => {
    const { reports, off } = countReports();
    const client = createAppQueryClient();
    try {
      await expect(
        client.fetchQuery({
          queryKey: ["football", "matches", "down"],
          queryFn: async () => {
            throw new Error("upstream 500");
          },
          retryDelay: 0,
        }),
      ).rejects.toThrow("upstream 500");
      // Another 403 is its own screen's to explain.
      await expect(
        client.fetchQuery({
          queryKey: ["account", "standing"],
          queryFn: async () => {
            throw { code: "PT403", message: "account_banned" };
          },
          retry: false,
        }),
      ).rejects.toEqual({ code: "PT403", message: "account_banned" });
      expect(reports.count).toBe(0);
    } finally {
      off();
      client.clear();
    }
  });
});
