import { afterEach, describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type RouteComponent,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { I18nProvider } from "@/i18n/provider";
import { Route as FantasyRoute } from "./fantasy";

/**
 * The Fantasy layout as the server renders it. It sets the reader's own title
 * after mount (`src/lib/fantasy-meta.ts`), which the server never does, so
 * its HTML must be exactly what the layout rendered before it did anything:
 * the page beneath it, and nothing of its own.
 */

const FantasyLayout = FantasyRoute.options.component!;
const BareLayout: RouteComponent = () => <Outlet />;

// The server has no window. Test files share one process, and one may leave
// a `window` behind, so each render takes it away and this puts back what
// was there.
const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
afterEach(() => {
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
});

/** A small tree with the layout's real component and two pages beneath it. */
function renderFantasy(layout: RouteComponent, path: string): Promise<string> {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const fantasy = createRoute({
    getParentRoute: () => rootRoute,
    path: "/fantasy",
    component: layout,
  });
  const routeTree = rootRoute.addChildren([
    fantasy.addChildren([
      createRoute({
        getParentRoute: () => fantasy,
        path: "/rules",
        component: () => <h1>Règles du jeu</h1>,
      }),
      createRoute({
        getParentRoute: () => fantasy,
        path: "/players/$playerId",
        loader: () => ({ player: { name: { fr: "Ayoub El Kaabi", ar: "أيوب الكعبي" } } }),
        component: () => <h1>Ayoub El Kaabi</h1>,
      }),
    ]),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return router.load().then(() =>
    renderToString(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    ),
  );
}

describe("the Fantasy layout in the server's HTML", () => {
  test.each(["/fantasy/rules", "/fantasy/players/p7"])(
    "%s renders exactly as it did before the layout set a title",
    async (path) => {
      delete globals.window;
      const html = await renderFantasy(FantasyLayout, path);
      expect(html).toBe(await renderFantasy(BareLayout, path));
      expect(html).toContain(path.endsWith("rules") ? "Règles du jeu" : "Ayoub El Kaabi");
    },
  );
});
