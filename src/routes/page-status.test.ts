import { describe, expect, test } from "bun:test";
import { isNotFound } from "@tanstack/react-router";

import { FootballError } from "@/backend/football/errors";
import { NewsError } from "@/backend/news/errors";
import { UNAVAILABLE, UNAVAILABLE_HEADER } from "@/lib/page-availability";
import { Route as ArticleRoute } from "./news.$articleId";
import { Route as ClubRoute } from "./clubs.$clubId";
import { Route as MatchRoute } from "./matches.$matchId";

/**
 * The public detail pages' loaders, run with a query cache that fails the
 * way production failed (audit 2026-09-24, P1-3): a missing article must be
 * a 404, a slow database a 503 that keeps the page indexed, never a 200 with
 * `noindex` or a "Chargement…" shell.
 */
const ID = "8b630afa-bf52-42f8-9ec0-f4d27fffe04b";

type Loader = (ctx: { params: Record<string, string>; context: unknown }) => Promise<unknown>;
type Head = (ctx: { params: Record<string, string>; loaderData: unknown }) => {
  meta?: Array<Record<string, string>>;
};
type Headers = (ctx: { loaderData: unknown }) => Record<string, string> | undefined;

function failingCache(error: unknown) {
  return {
    queryClient: {
      ensureQueryData: async () => {
        throw error;
      },
      getQueryState: () => undefined,
    },
  };
}

async function outcome(
  route: { options: unknown },
  params: Record<string, string>,
  error: unknown,
) {
  const loader = (route.options as { loader: Loader }).loader;
  try {
    return { data: await loader({ params, context: failingCache(error) }) };
  } catch (thrown) {
    return { thrown };
  }
}

function robotsOf(
  route: { options: unknown },
  params: Record<string, string>,
  loaderData: unknown,
) {
  const head = (route.options as { head: Head }).head({ params, loaderData });
  return head.meta?.find((tag) => tag.name === "robots")?.content;
}

describe("detail pages tell crawlers the truth", () => {
  test("an article that does not exist is a 404", async () => {
    const result = await outcome(
      ArticleRoute,
      { articleId: ID },
      new NewsError("article_not_found", "gone"),
    );
    expect(isNotFound(result.thrown)).toBe(true);
  });

  test("an article the database could not read is a 503, still indexable", async () => {
    const result = await outcome(
      ArticleRoute,
      { articleId: ID },
      new NewsError("data_unavailable", "statement timeout"),
    );
    expect(result.data).toEqual(UNAVAILABLE);
    const headers = (ArticleRoute.options as { headers: Headers }).headers({
      loaderData: result.data,
    });
    expect(headers?.[UNAVAILABLE_HEADER]).toBe("1");
    expect(robotsOf(ArticleRoute, { articleId: ID }, result.data)).toBeUndefined();
  });

  test("a match id that is not a fixture's, or an unknown fixture, is a 404", async () => {
    expect(
      isNotFound(
        (await outcome(MatchRoute, { matchId: "not-a-match" }, new Error("unused"))).thrown,
      ),
    ).toBe(true);
    expect(
      isNotFound(
        (await outcome(MatchRoute, { matchId: ID }, new FootballError("fixture_not_found", "gone")))
          .thrown,
      ),
    ).toBe(true);
  });

  test("a match the database could not read is a 503", async () => {
    const result = await outcome(
      MatchRoute,
      { matchId: ID },
      new FootballError("data_unavailable", "statement timeout"),
    );
    expect(result.data).toEqual(UNAVAILABLE);
    const head = (MatchRoute.options as { head: Head }).head({
      params: { matchId: ID },
      loaderData: result.data,
    });
    expect(head.meta?.find((tag) => "title" in tag)?.title).toBe("Match Botola Pro — BotolaGO");
  });

  test("a club id that is not a club's, or an unknown club, is a 404; a failed read a 503", async () => {
    expect(
      isNotFound((await outcome(ClubRoute, { clubId: "999999" }, new Error("unused"))).thrown),
    ).toBe(true);
    expect(
      isNotFound(
        (await outcome(ClubRoute, { clubId: ID }, new FootballError("team_not_found", "gone")))
          .thrown,
      ),
    ).toBe(true);
    expect(
      (await outcome(ClubRoute, { clubId: ID }, new Error("TimeoutError: signal timed out"))).data,
    ).toEqual(UNAVAILABLE);
  });
});

describe("the match page's address", () => {
  type Validate = (search: Record<string, unknown>) => { tab?: string };
  const validate = (MatchRoute.options as unknown as { validateSearch: Validate }).validateSearch;

  test("the summary is the plain URL, so an old ?tab=summary link redirects to it", () => {
    const raw = { tab: "summary" };
    expect({ ...raw, ...validate(raw) }.tab).toBeUndefined();
    expect(validate({}).tab).toBeUndefined();
  });

  test("other tabs keep their address; an unknown one is dropped, not inherited", () => {
    expect(validate({ tab: "stats" }).tab).toBe("stats");
    const raw = { tab: "<script>" };
    expect({ ...raw, ...validate(raw) }.tab).toBeUndefined();
  });
});
