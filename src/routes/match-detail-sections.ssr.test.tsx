import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import type { MatchCardDto } from "@/backend/football/contracts";
import { FootballError } from "@/backend/football/errors";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { createAppQueryClient } from "@/services/query-client";
import { Route as MatchRoute } from "./matches.$matchId";

/**
 * The match page with one optional section down (audit 2026-10-14, DATA-02),
 * rendered for real through the route's loader: the score and the healthy
 * sections stay, the failed section says so with a retry, and a section the
 * provider simply has nothing for does not.
 */

const fr = dictionaries.fr;
const context = { actorId: null, requestId: "test" } as const;
const repository = MockFootballRepository.prototype;

let fixture: MatchCardDto;
beforeAll(async () => {
  [fixture] = (await new MockFootballRepository().getHomeMatches(
    "fr",
    1,
    context,
  )) as MatchCardDto[];
});

const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
const clients: QueryClient[] = [];
const stored = new Map<string, unknown>();

function down(method: "getPressure" | "getHeadToHead" | "getTimeline" | "getLineups") {
  stored.set(method, repository[method]);
  (repository as never)[method] = async () => {
    throw new FootballError("data_unavailable", `${method} is down`);
  };
}

afterEach(() => {
  for (const [method, original] of stored) (repository as never)[method] = original;
  stored.clear();
  for (const created of clients.splice(0)) created.clear();
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
});

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  ),
});
const routeTree = rootRoute.addChildren([
  MatchRoute.update({
    id: "/matches/$matchId",
    path: "/matches/$matchId",
    getParentRoute: () => rootRoute,
  } as never),
  createRoute({ getParentRoute: () => rootRoute, path: "/matches", component: () => null }),
]);

async function open(tab?: "stats" | "lineups" | "h2h"): Promise<string> {
  globals.window = {};
  const queryClient = createAppQueryClient();
  clients.push(queryClient);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/matches/${fixture.id}${tab ? `?tab=${tab}` : ""}`],
    }),
    context: { queryClient },
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const retryButton = `>${fr["state.retry"]}</button>`;
const hasPage = (html: string, tab: string) => html.includes(`aria-labelledby="match-tab-${tab}"`);

describe("the match page", () => {
  test("with every section read shows no failure", async () => {
    const html = await open("stats");
    expect(hasPage(html, "stats")).toBe(true);
    expect(html).not.toContain(fr["matches.detail.section_failed.pressure"]);
    expect(html).not.toContain(retryButton);
  });

  test("with pressure down keeps the page and the statistics, and says the pressure failed", async () => {
    down("getPressure");
    const html = await open("stats");

    // The page, not "not found" nor the page-level error.
    expect(hasPage(html, "stats")).toBe(true);
    expect(html).not.toContain(fr["matches.detail.not_found_title"]);
    // The score box is on the page: the match is live, so it is the live region.
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(fr["matches.detail.section_failed.pressure"]);
    expect(html).toContain(retryButton);
  });

  test("with head to head down, the tab says the meetings failed, not that there are none", async () => {
    down("getHeadToHead");
    const html = await open("h2h");

    expect(hasPage(html, "h2h")).toBe(true);
    expect(html).toContain(fr["matches.detail.section_failed.h2h"]);
    expect(html).toContain(retryButton);
    expect(html).not.toContain(fr["matches.detail.no_h2h"]);
  });

  test("with the timeline down, the summary says so and the lineups tab is untouched", async () => {
    down("getTimeline");
    const summary = await open();
    expect(hasPage(summary, "summary")).toBe(true);
    expect(summary).toContain(fr["matches.detail.section_failed.timeline"]);
    expect(summary).toContain(retryButton);

    const lineups = await open("lineups");
    expect(hasPage(lineups, "lineups")).toBe(true);
    expect(lineups).not.toContain(fr["matches.detail.section_failed.timeline"]);
    expect(lineups).not.toContain(fr["matches.detail.section_failed.lineups"]);
  });

  test("with the lineups down, that tab says the lineups failed, not that none are published", async () => {
    down("getLineups");
    const html = await open("lineups");
    expect(hasPage(html, "lineups")).toBe(true);
    expect(html).toContain(fr["matches.detail.section_failed.lineups"]);
    expect(html).toContain(retryButton);
    expect(html).not.toContain(fr["matches.detail.no_lineups"]);
  });
});
