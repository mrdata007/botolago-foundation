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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import { AdminFunctionalLoading } from "@/backend/admin/functional-route";
import type { AdminRouteState } from "@/backend/admin/route-access";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import { AdminRecentAuthPrompt } from "@/components/admin/AdminReconnect";
import { IDLE_DESTRUCTIVE_ACTION } from "@/components/admin/destructive-action";
import { I18nProvider } from "@/i18n/provider";
import { Route as AdminRoute } from "./admin";

/**
 * The admin safety lane's screens as the server renders them. The console
 * itself needs a staff session with a second factor, which these tests do not
 * create: they render the real components inside a small router, with the
 * access state handed in, and read the HTML.
 */

const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
afterEach(() => {
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
});

/** `path` rendered under a root route, `/admin` carrying `access` as its loader data. */
async function render(path: string, access: AdminRouteState, page?: ReactNode): Promise<string> {
  delete globals.window;
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const admin = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    loader: () => access,
    component: AdminRoute.options.component as RouteComponent,
  });
  const routeTree = rootRoute.addChildren([
    admin.addChildren([
      createRoute({ getParentRoute: () => admin, path: "news/$", component: () => <>{page}</> }),
    ]),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/elsewhere/$",
      component: () => <>{page}</>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}

const ARTICLE = "/admin/news/00000000-0000-4000-8000-000000000000";

describe("the signed-out admin panel", () => {
  test("asks a visitor who never signed in to sign in, and comes back to the page asked for", async () => {
    const html = await render(ARTICLE, { state: "unauthenticated", reason: "missing_token" });
    expect(html).toContain("Authentification requise");
    expect(html).toContain(">Se connecter<");
    expect(html).not.toContain("Se réauthentifier");
    // Back to the article, not to the dashboard.
    expect(html).toContain(`href="/auth/login?next=${encodeURIComponent(ARTICLE)}"`);
    // No raw reference chip for a stranger.
    expect(html).not.toContain("admin-state-reference");
    expect(html).not.toContain("unauthenticated/missing_token");
  });

  test("keeps 'Se réauthentifier' and the reference where it is a re-authentication", async () => {
    const html = await render("/admin", { state: "recent_auth_required" });
    expect(html).toContain(">Se réauthentifier<");
    expect(html).toContain('data-testid="admin-state-reference"');
    expect(html).toContain("recent_auth_required");
  });

  test("says 'Se reconnecter' when the session expired", async () => {
    const html = await render("/admin", {
      state: "unauthenticated",
      reason: "invalid_token",
      detail: "expired",
    });
    expect(html).toContain(">Se reconnecter<");
    expect(html).toContain("unauthenticated/invalid_token/expired");
  });
});

describe("the stale sign-in prompt under a refused action", () => {
  const USER = "/elsewhere/users/11111111-1111-4111-8111-111111111111";

  test("offers 'Se reconnecter' to the sign-in page, back to this page, and says the motive is kept", async () => {
    const html = await render(
      USER,
      { state: "forbidden" },
      <AdminRecentAuthPrompt rtl={false} testId="admin-user-ban-reauth" />,
    );
    expect(html).toContain('data-testid="admin-user-ban-reauth"');
    expect(html).toContain('data-testid="admin-reconnect"');
    expect(html).toContain(`href="/auth/login?next=${encodeURIComponent(USER)}"`);
    expect(html).toContain("Se reconnecter");
    expect(html).toContain("Votre motif est conservé");
    expect(html).toContain("15 minutes");
  });

  test("is in Arabic for an Arabic reader", async () => {
    const html = await render(USER, { state: "forbidden" }, <AdminRecentAuthPrompt rtl />);
    expect(html).toContain("إعادة تسجيل الدخول");
    expect(html).toContain("السبب الذي كتبته محفوظ");
  });
});

describe("the confirm step", () => {
  const props = {
    actionKey: "ban:u1",
    dispatch: () => {},
    minimumReasonLength: 8,
    rtl: false,
    triggerLabel: "Bannir ce compte",
    confirmPrompt: "Bannir Fan ?",
    confirmLabel: "Confirmer le bannissement",
    onConfirm: () => undefined,
    triggerTestId: "admin-user-ban",
    testId: "admin-user-ban",
  };

  test("still takes its own press: at rest it is only the trigger", () => {
    const html = renderToString(
      <AdminDestructiveAction {...props} state={IDLE_DESTRUCTIVE_ACTION} />,
    );
    expect(html).toContain('data-admin-action="idle"');
    expect(html).not.toContain("admin-user-ban-reason");
    expect(html).not.toContain("admin-reconnect");
  });

  test("armed, shows the motive typed for this action and no other", () => {
    const armed = renderToString(
      <AdminDestructiveAction
        {...props}
        state={{ armed: "ban:u1", reason: "Insultes répétées", running: null }}
      />,
    );
    expect(armed).toContain('data-admin-action="armed"');
    expect(armed).toContain('value="Insultes répétées"');
    const other = renderToString(
      <AdminDestructiveAction
        {...props}
        state={{ armed: "ban:u2", reason: "Insultes répétées", running: null }}
      />,
    );
    expect(other).not.toContain("Insultes répétées");
  });
});

describe("the loading panel", () => {
  test("is named in the reader's language, not 'Loading'", () => {
    const html = renderToString(
      <I18nProvider>
        <AdminFunctionalLoading />
      </I18nProvider>,
    );
    expect(html).toContain('aria-label="Chargement de la page"');
    expect(html).not.toContain('aria-label="Loading"');
  });
});

describe("the article editor's status moves", () => {
  const source = readFileSync(join(import.meta.dir, "admin.news.$articleEditionId.tsx"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  test("no status move runs straight from a press, and no native prompt guards it", () => {
    expect(code).not.toContain("void transition(next)");
    expect(code).toContain("onClick={() => requestTransition(next)}");
    expect(code).toContain("onClick={() => requestTransition(toolbarForward)}");
    // The native prompt that published the last saved text is gone from the
    // status flow (the revision restore keeps its own, out of this scope).
    expect(code).not.toContain("Modifications non enregistrées. Continuer ?");
    expect(code).toContain("<EditorialMoveDialog");
  });

  test("with unsaved edits, saves first and moves only if the save went through", () => {
    expect(code).toMatch(/if \(dirty && !\(await save\(\)\)\) return;\s*await transition\(/);
  });

  test("keeps the server call exactly as it was", () => {
    expect(code).toContain(
      "{ articleEditionId: article.id, targetStatus, scheduledAt: scheduledAtIso }",
    );
    expect(code).toContain("transitionAndReload(");
  });

  test("appends no raw code to its messages", () => {
    expect(code).not.toMatch(
      /\(\$\{mapped\.code\}\)|\(\$\{mapNewsError\(error as Error\)\.code\}\)/,
    );
    expect(code).not.toMatch(/: \$\{mapNewsError\(error as Error\)\.code\}`/);
  });
});
