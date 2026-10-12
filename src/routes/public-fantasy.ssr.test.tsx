import { afterEach, expect, test, spyOn } from "bun:test";
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  isNotFound,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { AuthProvider } from "@/auth/AuthProvider";
import { I18nProvider } from "@/i18n/provider";
import { FantasyOwnedProvider } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";
import { UNAVAILABLE, unavailableHeaders } from "@/lib/page-availability";
import { Route as Players } from "./fantasy.players";
import { Route as Player } from "./fantasy.players.$playerId";
import { Route as Rankings } from "./fantasy.rankings";
import { Route as Help } from "./fantasy.help";

const clients: QueryClient[] = [];
const restorers: Array<{ mockRestore(): void }> = [];
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
  restorers.splice(0).forEach((s) => s.mockRestore());
});
function client() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  clients.push(c);
  return c;
}
type Load = (input: {
  context: { queryClient: QueryClient };
  location: { pathname: string };
  params: { playerId?: string };
  deps: Record<string, unknown>;
}) => Promise<unknown>;
function load(route: { options: unknown }, c: QueryClient, pathname: string, playerId?: string) {
  return (route.options as { loader: Load }).loader({
    context: { queryClient: c },
    location: { pathname },
    params: { playerId },
    deps: {},
  });
}
async function render(
  route: typeof Players | typeof Rankings | typeof Help,
  path: string,
  c: QueryClient,
) {
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => (
      <AuthProvider>
        <FantasyOwnedProvider>
          <Outlet />
        </FantasyOwnedProvider>
      </AuthProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path,
    component: route.options.component,
    validateSearch: () => ({}),
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    context: { queryClient: c },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={c}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

test("directory data becomes real HTML and survives transfer to a fresh browser cache", async () => {
  const c = client();
  await load(Players, c, "/fantasy/players");
  const players = c.getQueryData<Awaited<ReturnType<typeof fantasyService.getPlayers>>>([
    "fantasy-players",
  ])!;
  expect(players.length).toBeGreaterThan(0);
  const html = await render(Players, "/fantasy/players", c);
  expect(html).toContain("/fantasy/players/");
  expect(html).not.toContain("Chargement…");
  const browser = client();
  hydrate(browser, dehydrate(c, SSR_DEHYDRATE_OPTIONS));
  expect(browser.getQueryData(["fantasy-players"])).toEqual(players);
  expect(await render(Players, "/fantasy/players", browser)).toBe(html);
});

test("directory loader does not duplicate the pool request for a nested player", async () => {
  const spy = spyOn(fantasyService, "getPlayers");
  restorers.push(spy);
  await load(Players, client(), "/fantasy/players/p1");
  expect(spy).not.toHaveBeenCalled();
});

test("failed directory reads mark a 503 instead of an empty successful page", async () => {
  restorers.push(spyOn(fantasyService, "getPlayers").mockRejectedValue(new Error("offline")));
  const data = await load(Players, client(), "/fantasy/players");
  expect(data).toEqual(UNAVAILABLE);
  expect(unavailableHeaders(data)?.["Retry-After"]).toBe("120");
});

test("unknown player is notFound; an unavailable player read is not a 404", async () => {
  const spy = spyOn(fantasyService, "getPlayer").mockResolvedValue(undefined);
  restorers.push(spy);
  let thrown: unknown;
  try {
    await load(Player, client(), "/fantasy/players/missing", "missing");
  } catch (e) {
    thrown = e;
  }
  expect(isNotFound(thrown)).toBe(true);
  spy.mockRejectedValue(new Error("offline"));
  expect(await load(Player, client(), "/fantasy/players/missing", "missing")).toEqual(UNAVAILABLE);
});
