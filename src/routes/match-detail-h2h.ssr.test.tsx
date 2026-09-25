import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { dehydrate, hydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRouter,
} from "@tanstack/react-router";
import { hydrate as hydrateRouter } from "@tanstack/react-router/ssr/client";
import { renderToString } from "react-dom/server";

import type { MatchCardDto } from "@/backend/football/contracts";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";
import { buildStandings, footballService, type FootballSeason } from "@/services/football";
import { createAppQueryClient } from "@/services/query-client";
import { Route as MatchRoute } from "./matches.$matchId";

/**
 * The match page's "Face à face" tab, rendered for real (audit 2026-09-25,
 * follow-up to A04). Its table used to come in the detail payload as the
 * provider's stored rows, the one table in the product that the standings
 * code did not make. It is now the Classement tab's query, read while the tab
 * is open. The football service runs on its mock repository; only the table
 * and the season list are counted, so a read of either shows.
 */

const fr = dictionaries.fr;
const context = { actorId: null, requestId: "test" } as const;

let fixture: MatchCardDto;
let season: FootballSeason;
let seasonFixtures: readonly MatchCardDto[];
beforeAll(async () => {
  const repository = new MockFootballRepository();
  [fixture] = (await repository.getHomeMatches("fr", 1, context)) as MatchCardDto[];
  season = (await footballService.getSeasons("fr")).find(
    (candidate) => candidate.id === fixture.seasonId,
  )!;
  seasonFixtures = await repository.getSeasonFixtures(
    season.competitionId,
    season.id,
    "fr",
    context,
  );
});

const reads = { standings: 0, seasons: 0 };
const original = {
  getStandings: footballService.getStandings,
  getSeasons: footballService.getSeasons,
};
function countTableReads() {
  footballService.getStandings = async (...args) => {
    reads.standings += 1;
    return original.getStandings(...args);
  };
  footballService.getSeasons = async (...args) => {
    reads.seasons += 1;
    return original.getSeasons(...args);
  };
}

const globals = globalThis as { window?: unknown; document?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
const clients: QueryClient[] = [];

afterEach(() => {
  Object.assign(footballService, original);
  reads.standings = 0;
  reads.seasons = 0;
  for (const created of clients.splice(0)) created.clear();
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
  delete globals.document;
});

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
});
const routeTree = rootRoute.addChildren([
  MatchRoute.update({
    id: "/matches/$matchId",
    path: "/matches/$matchId",
    getParentRoute: () => rootRoute,
  } as never),
  createRoute({ getParentRoute: () => rootRoute, path: "/matches", component: () => null }),
]);

function matchRouter(queryClient: QueryClient, path: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  });
}

function renderRouter(queryClient: QueryClient, router: AnyRouter): string {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function appClient() {
  const created = createAppQueryClient();
  clients.push(created);
  return created;
}

/** The "Face à face" tab of the mock season's live match. */
const h2hPath = () => `/matches/${fixture.id}?tab=h2h`;

/** Each row of the tab's table, as printed: its rank cell and its points. */
const tableRows = (html: string) =>
  (html.split("<tbody")[1]?.split("</tbody>")[0] ?? "")
    .split("<tr")
    .slice(1)
    .map((row) => {
      // Past the row's own tag, the text of each cell.
      const cells = row
        .slice(row.indexOf(">") + 1)
        .split("</td>")
        .map((cell) => cell.replace(/<[^>]*>/g, ""));
      return { rank: cells[0], points: cells[2] };
    });

describe("the Face-à-face tab's table", () => {
  test("is the Classement tab's, read from the cache entry the two share", async () => {
    globals.window = {};
    const client = appClient();
    // What the Classement tab left in the cache: the season worked out from
    // its two results so far.
    const classement = buildStandings(seasonFixtures, []);
    expect(classement.computed).toBe(true);
    client.setQueryData(["football", "standings", season.id, "fr"], classement);
    client.setQueryData(["football", "seasons", "fr"], [season]);

    const router = matchRouter(client, h2hPath());
    await router.load();
    const html = renderRouter(client, router);

    // The two clubs' rows of that table, as the Classement tab ranks them…
    const clubs = [fixture.homeTeam.id, fixture.awayTeam.id];
    const expected = classement.overall
      .filter((row) => clubs.includes(row.clubId))
      .map((row) => ({ rank: String(row.position), points: String(row.points) }));
    expect(html).toContain(fr["matches.detail.table_context"]);
    expect(tableRows(html)).toEqual(expected);
    // …not the provider's stored rows, which the detail payload used to carry.
    const stored = await new MockFootballRepository().getStandings(season.id, "fr", context);
    expect(
      stored.filter((row) => clubs.includes(row.team.id)).map((row) => String(row.points)),
    ).not.toEqual(expected.map((row) => row.points));
    // And what a table worked out from the results cannot claim.
    expect(html).toContain(fr["standings.provisional"]);
  });

  test("is left to the browser: server and first render agree while it loads", async () => {
    countTableReads();
    delete globals.window;
    const server = appClient();
    const serverRouter = matchRouter(server, h2hPath());
    await serverRouter.load();
    const queries = JSON.parse(JSON.stringify(dehydrate(server, SSR_DEHYDRATE_OPTIONS)));
    // What TanStack Start writes into the page for the browser's router: each
    // match's loader data (see matches-calendar.ssr.test.tsx).
    const matches = serverRouter.state.matches.map((match) => ({
      i: match.id.replaceAll("/", "\0"),
      u: match.updatedAt,
      s: match.status,
      l: match.loaderData,
    }));
    const routes = JSON.parse(
      JSON.stringify({ router: { matches, lastMatchId: matches.at(-1)?.i }, buffer: [] }),
    ) as unknown;
    const serverHtml = renderRouter(server, serverRouter);

    // The detail is in the HTML, the table's place is held, and the loader
    // read no table for it. (A render never fetches: this is the loader.)
    expect(serverHtml).toContain(fr["matches.detail.head_to_head"]);
    expect(serverHtml).toContain('<section aria-busy="true">');
    expect(serverHtml).not.toContain("<table");
    expect(reads).toEqual({ standings: 0, seasons: 0 });

    globals.window = { $_TSR: routes };
    globals.document = { querySelector: () => null };
    const browser = appClient();
    hydrate(browser, queries);
    const browserRouter = matchRouter(browser, h2hPath());
    await hydrateRouter(browserRouter);
    expect(renderRouter(browser, browserRouter)).toBe(serverHtml);
  });

  test("is asked for by that tab alone: the other three make no table or season query", async () => {
    globals.window = {};
    const opened = async (tab?: "stats" | "lineups" | "h2h") => {
      const client = appClient();
      const router = matchRouter(client, `/matches/${fixture.id}${tab ? `?tab=${tab}` : ""}`);
      await router.load();
      const html = renderRouter(client, router);
      const cache = client.getQueryCache();
      return {
        // The page itself, on that tab, not its loading or error state.
        panel: html.includes(`aria-labelledby="match-tab-${tab ?? "summary"}"`),
        table: cache.findAll({ queryKey: ["football", "standings"] }).length,
        seasons: cache.findAll({ queryKey: ["football", "seasons"] }).length,
      };
    };
    const none = { panel: true, table: 0, seasons: 0 };
    expect(await opened()).toEqual(none);
    expect(await opened("stats")).toEqual(none);
    expect(await opened("lineups")).toEqual(none);
    expect(await opened("h2h")).toEqual({ panel: true, table: 1, seasons: 1 });
  });

  test("that could not be read says so in its place, with a retry", async () => {
    globals.window = {};
    const client = appClient();
    // A render runs no fetch, so the failed read is made beforehand, and kept
    // from the retry a tab mounting in a browser would make first.
    client.setQueryDefaults(["football", "standings"], { retryOnMount: false });
    await client.prefetchQuery({
      queryKey: ["football", "standings", season.id, "fr"],
      queryFn: () => Promise.reject(new Error("offline")),
      retry: false,
    });
    client.setQueryData(["football", "seasons", "fr"], [season]);

    const router = matchRouter(client, h2hPath());
    await router.load();
    const html = renderRouter(client, router);

    // Not a season without a table: the table's heading, what went wrong and
    // the way to try again, then the meetings.
    const heading = html.indexOf(fr["matches.detail.table_context"]);
    expect(heading).toBeGreaterThan(-1);
    expect(html.indexOf(fr["state.error"])).toBeGreaterThan(heading);
    expect(html).toContain(`>${fr["state.retry"]}</button>`);
    expect(html.indexOf(fr["matches.detail.head_to_head"])).toBeGreaterThan(
      html.indexOf(fr["state.error"]),
    );
    expect(html).not.toContain("<table");
    expect(html).not.toContain('aria-busy="true"');
  });
});
