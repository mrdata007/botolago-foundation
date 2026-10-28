import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { I18nProvider } from "@/i18n/provider";
import { isUnavailable } from "@/lib/page-availability";
import { RIVALRIES } from "@/lib/rivalries";
import { rivalryRouteHead, rivalryRouteLoader } from "@/lib/rivalry-route";
import { footballService } from "@/services/football";
import { createAppQueryClient } from "@/services/query-client";
import type { Club, Match } from "@/types/domain";
import { Route as DerbyRoute } from "./derby-casablanca";

/**
 * The derby page, rendered the way the server renders it: the loader warms
 * the rivalry, and the HTML carries the clubs and the matches as links. The
 * football service is stubbed, so nothing reaches a network.
 */

const club = (id: string, slug: string, name: string): Club => ({
  id,
  slug,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: "XXX",
});
const WYDAD = club(
  "11111111-1111-4111-8111-111111111111",
  "wydad-casablanca-aaaaaaaaaaaa",
  "Wydad Casablanca",
);
const RAJA = club(
  "22222222-2222-4222-8222-222222222222",
  "raja-casablanca-bbbbbbbbbbbb",
  "Raja Casablanca",
);

const match = (
  id: string,
  home: Club,
  away: Club,
  kickoff: string,
  status: Match["status"],
  score?: [number, number],
): Match => ({
  id,
  gameweek: 3,
  homeClubId: home.id,
  awayClubId: away.id,
  kickoff,
  status,
  homeScore: score?.[0],
  awayScore: score?.[1],
  venue: { fr: "Stade", ar: "Stade" },
});
const NEXT = match(
  "33333333-3333-4333-8333-333333333333",
  RAJA,
  WYDAD,
  "2099-01-10T20:00:00Z",
  "scheduled",
);
const PAST = match(
  "44444444-4444-4444-8444-444444444444",
  WYDAD,
  RAJA,
  "2025-11-01T20:00:00Z",
  "finished",
  [2, 1],
);

const original = footballService.getRivalry;
const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
const clients: QueryClient[] = [];
afterEach(() => {
  footballService.getRivalry = original;
  for (const created of clients.splice(0)) created.clear();
  // Other test files leave a `window` shim on the shared global (the drafts
  // store reads its storage), so it is put back as it was, not only removed.
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
});

function render(queryClient: QueryClient) {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => <Outlet />,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      DerbyRoute.update({
        id: "/derby-casablanca",
        path: "/derby-casablanca",
        getParentRoute: () => root,
      } as never),
    ]),
    history: createMemoryHistory({ initialEntries: ["/derby-casablanca"] }),
    context: { queryClient },
  });
  return router.load().then(() => ({
    router,
    html: renderToString(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    ),
  }));
}

function appClient() {
  const created = createAppQueryClient();
  clients.push(created);
  return created;
}

describe("/derby-casablanca on the server", () => {
  test("carries the title, both clubs and every match as links", async () => {
    delete globals.window;
    footballService.getRivalry = async () => ({
      clubs: [WYDAD, RAJA],
      upcoming: [NEXT],
      results: [PAST],
    });
    const { html } = await render(appClient());
    expect(html).toContain("<h1");
    expect(html).toContain("Derby Wydad – Raja");
    expect(html).toContain(`href="/clubs/${WYDAD.id}"`);
    expect(html).toContain(`href="/clubs/${RAJA.id}"`);
    expect(html).toContain(`href="/matches/${NEXT.id}"`);
    expect(html).toContain(`href="/matches/${PAST.id}"`);
    expect(html).toContain("1 victoire Wydad Casablanca, 0 nul, 0 victoire Raja Casablanca");
  });

  test("head: self-canonical, title, description and breadcrumb", async () => {
    delete globals.window;
    footballService.getRivalry = async () => ({
      clubs: [WYDAD, RAJA],
      upcoming: [NEXT],
      results: [PAST],
    });
    const client = appClient();
    const loaderData = await rivalryRouteLoader(client, "derby-casablanca");
    const head = rivalryRouteHead("derby-casablanca", loaderData);
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://botolago.com/derby-casablanca" },
    ]);
    expect(head.meta[0]).toEqual({
      title: "Derby de Casablanca : Wydad – Raja, prochain match et résultats | BotolaGO",
    });
    const description = head.meta.find((tag) => "name" in tag && tag.name === "description");
    expect(JSON.stringify(description)).toContain("Prochain match le 10 janv. 2099");
    expect(head.scripts[0].children).toContain('"BreadcrumbList"');
    expect(head.scripts[0].children).toContain("https://botolago.com/derby-casablanca");
  });

  test("a rivalry whose clubs are missing is a 404, a failed read is a 503", async () => {
    delete globals.window;
    footballService.getRivalry = async () => null;
    await expect(rivalryRouteLoader(appClient(), "derby-casablanca")).rejects.toMatchObject({
      isNotFound: true,
    });
    footballService.getRivalry = async () => {
      throw new Error("down");
    };
    expect(isUnavailable(await rivalryRouteLoader(appClient(), "derby-casablanca"))).toBe(true);
  });
});

describe("the rivalry read", () => {
  // The mock repository names the clubs in the language asked for, as the API
  // does: the clubs must still be found when the page is read in Arabic.
  test("finds the clubs by identity in Arabic as in French", async () => {
    const fr = await original(RIVALRIES["classico-wac-far"], "fr");
    const ar = await original(RIVALRIES["classico-wac-far"], "ar");
    expect(fr).not.toBeNull();
    expect(fr?.clubs.map((c) => c.id)).toEqual(ar?.clubs.map((c) => c.id));
    expect(ar?.clubs[0].name.fr).not.toBe(fr?.clubs[0].name.fr);
    expect(ar?.results.length).toBe(fr?.results.length);
  });
});
