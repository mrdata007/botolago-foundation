import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
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

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { MATCH_TIME_ZONE, matchDayFromKey, matchDayKey } from "@/lib/match-kickoff";
import { SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";
import { footballService, type FootballSeason } from "@/services/football";
import { createAppQueryClient } from "@/services/query-client";
import type { Club, Match } from "@/types/domain";
import { Route as MatchesRoute } from "./matches.index";

/**
 * /matches rendered for real, the way the server renders it and the way the
 * browser's first render then draws it from what the server handed over
 * (audit 2026-09-25, A10). The football service is stubbed with one season
 * and one fixture on whatever day is asked for, so nothing reaches a network.
 */

const club = (id: string, name: string, code: string): Club => ({
  id,
  name: { fr: name, ar: name },
  shortName: { fr: code, ar: code },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const HOME = club("club-wac", "Wydad AC", "WAC");
const AWAY = club("club-rca", "Raja CA", "RCA");

const SEASON: FootballSeason = {
  id: "season-current",
  competitionId: "botola",
  label: "2026/27",
  // Wide enough that "today", whenever the test runs, is inside it.
  startsOn: "2000-07-01",
  endsOn: "2099-06-30",
  status: "active",
  isCurrent: true,
  firstMatchDate: "2000-08-01",
  lastMatchDate: "2099-06-01",
  competitionName: "Botola Pro",
};

const asked: string[] = [];
const original = {
  getSeasons: footballService.getSeasons,
  getMatchDay: footballService.getMatchDay,
  getLiveMatches: footballService.getLiveMatches,
};
function stubFootball() {
  footballService.getSeasons = async () => [SEASON];
  footballService.getMatchDay = async (date) => {
    const day = matchDayKey(date);
    asked.push(day);
    const match: Match = {
      id: "7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      gameweek: 3,
      homeClubId: HOME.id,
      awayClubId: AWAY.id,
      // Evening in Casablanca on the day asked for: 20:00 most of the year,
      // 19:00 while Morocco keeps UTC for Ramadan.
      kickoff: `${day}T19:00:00Z`,
      status: "scheduled",
      venue: { fr: "Stade Mohammed V", ar: "Stade Mohammed V" },
    };
    return { matches: [match], clubs: [HOME, AWAY], standings: [] };
  };
  footballService.getLiveMatches = async () => ({ matches: [], clubs: [], standings: [] });
}

const globals = globalThis as { window?: unknown; document?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
const clients: QueryClient[] = [];

afterEach(() => {
  Object.assign(footballService, original);
  asked.length = 0;
  for (const created of clients.splice(0)) created.clear();
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
  delete globals.document;
  setSystemTime();
});

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
});
const routeTree = rootRoute.addChildren([
  MatchesRoute.update({
    id: "/matches/",
    path: "/matches/",
    getParentRoute: () => rootRoute,
  } as never),
  createRoute({ getParentRoute: () => rootRoute, path: "/news", component: () => null }),
]);

function matchesRouter(queryClient: QueryClient, isServer?: boolean) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/matches"] }),
    context: { queryClient },
    isServer,
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

/**
 * Loads /matches, then renders it. Between the two, `handover` sees the
 * cache as the router's dehydrate step does in production: TanStack Start
 * dehydrates after the loaders and before the render (`createStartHandler`).
 */
async function renderMatches(
  queryClient: QueryClient,
  handover: (router: AnyRouter) => void = () => {},
): Promise<string> {
  const router = matchesRouter(queryClient);
  await router.load();
  handover(router);
  return renderRouter(queryClient, router);
}

/**
 * What TanStack Start writes into the page for the browser's router
 * (`window.$_TSR.router`): each match's id, status, time and loader data, in
 * the shape router-core's `dehydrateMatch` gives them. The browser's router
 * takes its first state from this (`hydrate` in `ssr/client`), not from its
 * own run of the loaders.
 */
function routerHandover(router: AnyRouter) {
  const matches = router.state.matches.map((match) => ({
    i: match.id.replaceAll("/", "\0"),
    u: match.updatedAt,
    s: match.status,
    l: match.loaderData,
  }));
  return JSON.parse(
    JSON.stringify({ router: { matches, lastMatchId: matches.at(-1)?.i }, buffer: [] }),
  ) as unknown;
}

/** The date band's day, as the page names it. */
const heading = (html: string) => /<h2 class="[^"]*">([^<]*)<\/h2>/.exec(html)?.[1];

function appClient() {
  const created = createAppQueryClient();
  clients.push(created);
  return created;
}

describe("/matches in the server's HTML", () => {
  test("carries today's fixtures, and the browser's first render is the same page", async () => {
    stubFootball();
    delete globals.window;
    const server = appClient();
    let handover: unknown;
    const serverHtml = await renderMatches(server, () => {
      handover = JSON.parse(JSON.stringify(dehydrate(server, SSR_DEHYDRATE_OPTIONS)));
    });

    // The day the loader asked for is the competition's today.
    expect(asked).toEqual([matchDayKey(new Date())]);
    // The fixture row itself, not the loading skeleton.
    expect(serverHtml).toContain("/matches/7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
    expect(serverHtml).toContain("WAC");
    expect(serverHtml).toContain("RCA");

    // The browser: nothing fetched of its own, only what the server handed over.
    globals.window = {};
    const browser = appClient();
    hydrate(browser, handover);
    const browserHtml = await renderMatches(browser);
    expect(asked).toHaveLength(1);
    expect(browserHtml).toBe(serverHtml);
  });

  test("a read that fails leaves the page to load in the browser, with its skeleton", async () => {
    stubFootball();
    footballService.getMatchDay = async () => {
      throw new Error("statement timeout");
    };
    delete globals.window;
    const server = appClient();
    let handover: ReturnType<typeof dehydrate> | undefined;
    const serverHtml = await renderMatches(server, () => {
      handover = JSON.parse(JSON.stringify(dehydrate(server, SSR_DEHYDRATE_OPTIONS)));
    });
    expect(serverHtml).not.toContain("/matches/7b1f2c3d");
    // The seasons still go over; the day is the browser's to load.
    expect(handover?.queries.map((query) => query.queryKey)).toEqual([
      ["football", "seasons", "fr"],
    ]);

    globals.window = {};
    const browser = appClient();
    hydrate(browser, handover);
    expect(await renderMatches(browser)).toBe(serverHtml);
  });

  test("the browser opens on the server's day, even when midnight falls between the two", async () => {
    stubFootball();
    delete globals.window;
    // 23:59:30 on Saturday 26 September in Casablanca (UTC+1).
    setSystemTime(new Date("2026-09-26T22:59:30Z"));
    const server = appClient();
    let queries: unknown;
    let routes: unknown;
    const serverHtml = await renderMatches(server, (router) => {
      queries = JSON.parse(JSON.stringify(dehydrate(server, SSR_DEHYDRATE_OPTIONS)));
      routes = routerHandover(router);
    });
    expect(asked).toEqual(["2026-09-26"]);

    // The page reaches the browser a minute later: Sunday there.
    setSystemTime(new Date("2026-09-26T23:00:30Z"));
    globals.window = { $_TSR: routes };
    // All `hydrate` asks of the document is the CSP nonce. It stays for the
    // render: a hydrated router with a document renders no Suspense boundary
    // of its own, as it does in a browser, so the two trees can be compared
    // whole.
    globals.document = { querySelector: () => null };
    const browser = appClient();
    hydrate(browser, queries);
    const router = matchesRouter(browser);
    await hydrateRouter(router);
    const browserHtml = renderRouter(browser, router);

    expect(router.state.matches.at(-1)?.loaderData).toEqual({ today: "2026-09-26" });
    expect(heading(browserHtml)).toBe(heading(serverHtml));
    expect(heading(browserHtml)).toBe("Samedi 26 septembre");
    expect(browserHtml).toContain("/matches/7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
    // Saturday's fixtures, from the handover: nothing asked for Sunday.
    expect(asked).toEqual(["2026-09-26"]);
    // The whole page, not only its day: the date band still calls Saturday
    // "today" and offers no way back to it. Reading the browser's own clock,
    // it called Saturday "yesterday" and added the "Today" button, and React
    // threw the server's tree away.
    expect(browserHtml).toBe(serverHtml);
  });

  test("a reader who comes back after midnight opens on the new day, not the last visit's", async () => {
    stubFootball();
    globals.window = {};
    // The loader runs again before the page shows, not behind a render of
    // the last visit's day: in the browser it fetches nothing, so waiting
    // on it costs nothing.
    expect((MatchesRoute.options.loader as { staleReloadMode?: string }).staleReloadMode).toBe(
      "blocking",
    );
    setSystemTime(new Date("2026-09-26T22:50:00Z"));
    const router = matchesRouter(appClient(), false);
    await router.load();
    const today = () =>
      router.state.matches.find((match) => match.routeId === "/matches/")?.loaderData;
    expect(today()).toEqual({ today: "2026-09-26" });

    await router.navigate({ to: "/news" });
    setSystemTime(new Date("2026-09-26T23:10:00Z"));
    await router.navigate({ to: "/matches" } as never);
    expect(today()).toEqual({ today: "2026-09-27" });
  });
});

describe("/matches rows and the live strip (A05)", () => {
  /**
   * The row's accessible name: what the list says about the match. The
   * strip, higher on the page, links to the same match; the row is the last.
   */
  const rowLabel = (html: string) =>
    [...html.matchAll(/<a aria-label="([^"]*)" href="\/matches\/7b1f2c3d[^"]*"/g)].at(-1)?.[1];

  test("a row shows the strip's newer reading of its match, and the day's when that is newer", async () => {
    stubFootball();
    globals.window = {};
    const today = matchDayKey(new Date());
    const day = await footballService.getMatchDay(new Date(`${today}T12:00:00Z`), "fr");
    const [scheduled] = day.matches;
    // The row's kick-off time as the match card formats it, in the
    // competition's zone: "20:00" does not hold during Ramadan, when this
    // runs on the real day.
    const kickoffTime = new Intl.DateTimeFormat("fr-FR", {
      timeZone: MATCH_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(scheduled!.kickoff));
    expect(["20:00", "19:00"]).toContain(kickoffTime);
    const inPlay = {
      matches: [{ ...scheduled!, status: "live" as const, minute: 12, homeScore: 1, awayScore: 0 }],
      clubs: [HOME, AWAY],
      standings: [],
    };
    const dayKey = ["football", "matches", today, SEASON.id, "fr"];
    const liveKey = ["football", "live-matches", "fr"];

    const client = appClient();
    client.setQueryData(["football", "seasons", "fr"], [SEASON]);
    client.setQueryData(dayKey, day, { updatedAt: 1_000 });
    client.setQueryData(liveKey, inPlay, { updatedAt: 2_000 });
    const fromStrip = rowLabel(await renderMatches(client));
    expect(fromStrip).toContain("Wydad AC 1, Raja CA 0");
    expect(fromStrip).toContain("12");
    expect(fromStrip).not.toContain(kickoffTime);

    const older = appClient();
    older.setQueryData(["football", "seasons", "fr"], [SEASON]);
    older.setQueryData(dayKey, day, { updatedAt: 3_000 });
    older.setQueryData(liveKey, inPlay, { updatedAt: 2_000 });
    const fromDay = rowLabel(await renderMatches(older));
    expect(fromDay).toContain(kickoffTime);
    expect(fromDay).not.toContain("Wydad AC 1");
  });

  // The list refreshes every 30 seconds through a live match, the hour a
  // loaded database is likeliest to time out one of those reads.
  test("a refresh that fails keeps the day's rows, with no error card over them", async () => {
    stubFootball();
    globals.window = {};
    const today = matchDayKey(new Date());
    const day = await footballService.getMatchDay(matchDayFromKey(today), "fr");
    const dayKey = ["football", "matches", today, SEASON.id, "fr"];

    const client = appClient();
    client.setQueryData(["football", "seasons", "fr"], [SEASON]);
    client.setQueryData(dayKey, day);
    await client
      .fetchQuery({
        queryKey: dayKey,
        queryFn: () => Promise.reject(new Error("statement timeout")),
        retry: false,
        staleTime: 0,
      })
      .catch(() => undefined);
    expect(client.getQueryState(dayKey)).toMatchObject({ status: "error", data: day });

    const html = await renderMatches(client);
    expect(rowLabel(html)).toContain("Wydad AC");
    expect(html).not.toContain(dictionaries.fr["state.error"]);
  });
});
