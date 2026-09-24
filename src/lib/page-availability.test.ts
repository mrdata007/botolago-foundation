import { describe, expect, test } from "bun:test";

import { FootballError } from "@/backend/football/errors";
import { NewsError } from "@/backend/news/errors";
import {
  isMissingContent,
  RETRY_AFTER_SECONDS,
  UNAVAILABLE,
  UNAVAILABLE_HEADER,
  unavailableHeaders,
  withPageStatus,
} from "./page-availability";

describe("page availability", () => {
  test("only 'no such public thing' counts as missing", () => {
    expect(isMissingContent(new NewsError("article_not_found", "gone"))).toBe(true);
    expect(isMissingContent(new FootballError("fixture_not_found", "gone"))).toBe(true);
    expect(isMissingContent(new FootballError("team_not_found", "gone"))).toBe(true);
    expect(isMissingContent(new NewsError("data_unavailable", "down"))).toBe(false);
    expect(isMissingContent(new FootballError("data_unavailable", "down"))).toBe(false);
    expect(isMissingContent(new Error("TimeoutError: signal timed out"))).toBe(false);
  });

  test("a page marked unavailable answers 503 with Retry-After and is not cached", async () => {
    const headers = unavailableHeaders(UNAVAILABLE)!;
    const page = withPageStatus(new Response("<html>article</html>", { status: 200, headers }));
    expect(page.status).toBe(503);
    expect(page.headers.get("retry-after")).toBe(String(RETRY_AFTER_SECONDS));
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get(UNAVAILABLE_HEADER)).toBeNull();
    expect(await page.text()).toBe("<html>article</html>");
  });

  test("any other page keeps the router's status", () => {
    expect(unavailableHeaders({ article: {} })).toBeUndefined();
    expect(unavailableHeaders(null)).toBeUndefined();
    expect(withPageStatus(new Response("ok", { status: 200 })).status).toBe(200);
    expect(withPageStatus(new Response("missing", { status: 404 })).status).toBe(404);
  });
});
