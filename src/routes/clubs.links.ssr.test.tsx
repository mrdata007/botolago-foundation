import { afterEach, describe, expect, test } from "bun:test";
import { dehydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { I18nProvider } from "@/i18n/provider";
import { SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";
import { footballService, type FootballSeason } from "@/services/football";
import { newsService } from "@/services/news";
import { createAppQueryClient } from "@/services/query-client";
import type { Article, Club, Match } from "@/types/domain";
import { Route as ClubRoute } from "./clubs.$clubId";

/**
 * /clubs/<id> rendered the way the server renders it: the first HTML holds
 * the links to the club's matches and stories (they used to appear only after
 * the browser's queries ran), and a failed extra read neither fails nor
 * changes the status of the page. The services are stubbed; no network.
 */

const CLUB_ID = "0257feb3-4c16-431d-a58b-5faf060576ad";
const MATCH_ID = "7b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ARTICLE_ID = "9b2f0c1e-0000-4000-8000-000000000001";

const club = (id: string, name: string, code: string): Club => ({
  id,
  name: { fr: name, ar: name },
  shortName: { fr: code, ar: code },
  city: { fr: "Casablanca", ar: "Casablanca" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const HOME = club(CLUB_ID, "Wydad AC", "WAC");
const AWAY = club("club-rca", "Raja CA", "RCA");

const SEASON: FootballSeason = {
  id: "season-current",
  competitionId: "botola",
  label: "2026/27",
  startsOn: "2000-07-01",
  endsOn: "2099-06-30",
  status: "active",
  isCurrent: true,
  firstMatchDate: "2000-08-01",
  lastMatchDate: "2099-06-01",
  competitionName: "Botola Pro",
};

const MATCH: Match = {
  id: MATCH_ID,
  gameweek: 3,
  homeClubId: HOME.id,
  awayClubId: AWAY.id,
  kickoff: "2020-10-01T20:00:00Z",
  status: "finished",
  homeScore: 2,
  awayScore: 1,
  venue: { fr: "Stade Mohammed V", ar: "Stade Mohammed V" },
};

const ARTICLE = {
  id: ARTICLE_ID,
  language: "fr",
  title: { fr: "Le Wydad s'impose", ar: "Le Wydad s'impose" },
  excerpt: { fr: "Résumé", ar: "Résumé" },
  category: "latest",
  clubIds: [CLUB_ID],
  authorName: { fr: "BotolaGO", ar: "BotolaGO" },
  publishedAt: "2026-10-26T10:00:00.000Z",
  readMinutes: 2,
  heroGradient: "linear-gradient(red, blue)",
} as unknown as Article;

const original = {
  getClub: footballService.getClub,
  getSeasons: footballService.getSeasons,
  getClubSeasonMatches: footballService.getClubSeasonMatches,
  getStandings: footballService.getStandings,
  getArticles: newsService.getArticles,
};
const asked: string[] = [];
function stub() {
  footballService.getClub = async () => HOME;
  footballService.getSeasons = async () => [SEASON];
  footballService.getClubSeasonMatches = async () => {
    asked.push("matches");
    return { matches: [MATCH], clubs: [HOME, AWAY], standings: [] };
  };
  newsService.getArticles = async () => {
    asked.push("news");
    return [ARTICLE];
  };
}

const globals = globalThis as { window?: unknown; document?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
const clients: QueryClient[] = [];

afterEach(() => {
  Object.assign(footballService, original);
  newsService.getArticles = original.getArticles;
  asked.length = 0;
  for (const created of clients.splice(0)) created.clear();
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
  delete globals.document;
});

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // As in `__root.tsx`: the follow button reads the session.
  component: () => (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  ),
});
const routeTree = rootRoute.addChildren([
  ClubRoute.update({
    id: "/clubs/$clubId",
    path: "/clubs/$clubId",
    getParentRoute: () => rootRoute,
  } as never),
  createRoute({ getParentRoute: () => rootRoute, path: "/clubs", component: () => null }),
]);

async function renderClub(queryClient: QueryClient, handover: () => void = () => {}) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/clubs/${CLUB_ID}`] }),
    context: { queryClient },
  });
  await router.load();
  handover();
  const html = renderToString(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  const page = router.state.matches.find((match) => match.routeId === "/clubs/$clubId");
  return { html, page };
}

const appClient = () => {
  const created = createAppQueryClient();
  clients.push(created);
  return created;
};

describe("/clubs/<id> in the server's HTML", () => {
  test("links the club's matches and stories in the first render", async () => {
    stub();
    delete globals.window;
    const server = appClient();
    let keys: unknown[] = [];
    const { html } = await renderClub(server, () => {
      keys = dehydrate(server, SSR_DEHYDRATE_OPTIONS).queries.map((query) => query.queryKey);
    });
    expect(html).toContain(`href="/matches/${MATCH_ID}`);
    expect(html).toContain(`href="/news/${ARTICLE_ID}`);
    // Handed to the browser, so its first render is the same page.
    expect(keys).toContainEqual(["football", "club-matches", CLUB_ID, SEASON.id, "fr"]);
    expect(keys).toContainEqual(["news", "club", CLUB_ID, "fr"]);
  });

  test("a failed extra read leaves the page a plain 200, loaded on the client", async () => {
    stub();
    footballService.getClubSeasonMatches = async () => {
      throw new Error("statement timeout");
    };
    newsService.getArticles = async () => {
      throw new Error("statement timeout");
    };
    delete globals.window;
    const { html, page } = await renderClub(appClient());
    expect(page?.status).toBe("success");
    expect(page?.loaderData).toMatchObject({ club: { id: CLUB_ID } });
    expect(page?.loaderData).not.toHaveProperty("unavailable");
    expect(html).toContain("Wydad AC");
    expect(html).not.toContain(`href="/matches/${MATCH_ID}`);
    expect(html).not.toContain(`href="/news/${ARTICLE_ID}`);
  });

  test("the browser fetches nothing extra in its loader", async () => {
    stub();
    globals.window = {};
    await renderClub(appClient());
    expect(asked).toEqual([]);
  });
});
