import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRoute,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";

import { Route as ProfileSetupRoute } from "./auth.profile-setup";
import { Route as RegisterRoute } from "./auth.register";

/**
 * The account path of the manager card (plan M1c), rendered by the server as the real routes draw
 * it: the register hint under « Nom complet » and profile setup's name hint and card row. Each
 * surface is rendered with the switch off (the default, and what ships) and live; the live state
 * is the section's own status hook, replaced here for the length of this file.
 */

const fr = dictionaries.fr;
const status = { live: false };
const original = { ...(await import("@/services/manager-card-status")) };

beforeAll(() => {
  mock.module("@/services/manager-card-status", () => ({
    ...original,
    useManagerCardLive: () => status.live,
  }));
});
afterAll(() => {
  mock.module("@/services/manager-card-status", () => original);
});
afterEach(() => {
  status.live = false;
});

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

/** The route's own component, in a one-page tree at the route's own address. */
async function renderRoute(route: AnyRoute, path: string): Promise<string> {
  const routePath = path.split("?", 1)[0]!;
  const options = route.options as {
    component: () => unknown;
    validateSearch: (search: Record<string, unknown>) => Record<string, unknown>;
  };
  const root = createRootRoute({
    component: () => (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: routePath,
    component: options.component as never,
    validateSearch: options.validateSearch,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("register: the hint under « Nom complet »", () => {
  const hint = escapeHtml(fr["card.onboarding.m1.register.hint"]);

  it("is not there with the switch off, and the field keeps its reserved error line", async () => {
    const html = await renderRoute(RegisterRoute, "/auth/register");
    expect(html).not.toContain(hint);
    expect(html).not.toContain("-hint");
    // The kit's own reserved line: first in the DOM after the field, still announcing politely.
    expect(html).toMatch(/<p id="[^"]+-error" role="alert" aria-live="polite"/);
  });

  it("sits right under the field box, before the reserved error line, when live", async () => {
    status.live = true;
    const html = await renderRoute(RegisterRoute, "/auth/register");
    const box = html.indexOf('autoComplete="name"');
    const at = html.indexOf(hint);
    const errorLine = html.search(/<p id="[^"]+-error" role="alert" aria-live="polite"/);
    // The order in the markup is the order on screen: the box, the hint, then the error line.
    expect(box).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(box);
    expect(errorLine).toBeGreaterThan(at);
    // The error line is the field's own, mounted and announced, and the field names both.
    const nameInput = /<input[^>]*autoComplete="name"[^>]*>/.exec(html)![0];
    expect(nameInput).toMatch(/aria-describedby="([^"]+)-error [^"]+-hint"/);
    expect(nameInput).not.toContain("aria-invalid");
  });

  it("changes nothing else on the page", async () => {
    const off = await renderRoute(RegisterRoute, "/auth/register");
    status.live = true;
    const live = await renderRoute(RegisterRoute, "/auth/register");
    const strip = (html: string) =>
      html
        .replace(/ id="[^"]*"/g, "")
        .replace(/ aria-describedby="[^"]*"/g, "")
        .replace(/ for="[^"]*"/g, "");
    // The four other fields, the consent row, the button and the footer are the same markup.
    const tail = (html: string) => strip(html.slice(html.indexOf('autoComplete="username"') - 400));
    expect(tail(live)).toBe(tail(off));
  });
});

describe("profile setup: the card row and the name hint", () => {
  const nameHint = escapeHtml(fr["card.onboarding.m1.setup.name_hint"]);
  const fromBuilder = "/auth/profile-setup?next=/fantasy/create";

  it("renders nothing of the card with the switch off, from the builder or not", async () => {
    for (const path of [fromBuilder, "/auth/profile-setup"]) {
      const html = await renderRoute(ProfileSetupRoute, path);
      expect(html).not.toContain(nameHint);
      expect(html).not.toContain("auth-card-row");
      expect(html).not.toContain("mc-token");
    }
    const stepTwo = await renderRoute(
      ProfileSetupRoute,
      "/auth/profile-setup?next=/fantasy/create&step=2",
    );
    expect(stepTwo).toContain('class="grid max-h-72 gap-2 overflow-y-auto pe-1"');
  });

  it("puts the name hint on the name field and holds the card row's place, live from the builder", async () => {
    status.live = true;
    const html = await renderRoute(ProfileSetupRoute, fromBuilder);
    expect(html).toContain(nameHint);
    const field = /<input[^>]*id="displayName"[^>]*>/.exec(html)![0];
    expect(field).toContain('aria-describedby="displayName-hint"');
    // The row's code loads on demand: the server draws the fallback that keeps its 64px + 16px.
    expect(html).toContain('class="mb-4 h-16" aria-hidden="true"');
  });

  it("shortens the club list by the row's height on step 2, so « Suivant » stays where it was", async () => {
    status.live = true;
    const html = await renderRoute(
      ProfileSetupRoute,
      "/auth/profile-setup?next=/fantasy/create&step=2",
    );
    expect(html).toContain('class="grid max-h-52 gap-2 overflow-y-auto pe-1"');
    expect(html).not.toContain("max-h-72");
    // The row is for steps 1 and 2 only: step 3 has none.
    const stepThree = await renderRoute(
      ProfileSetupRoute,
      "/auth/profile-setup?next=/fantasy/create&step=3",
    );
    expect(stepThree).not.toContain("mb-4 h-16");
  });

  it("shows nothing of the card live when the guest did not come from the builder", async () => {
    status.live = true;
    for (const path of ["/auth/profile-setup", "/auth/profile-setup?next=/fantasy/team"]) {
      const html = await renderRoute(ProfileSetupRoute, path);
      expect(html).not.toContain(nameHint);
      expect(html).not.toContain("mb-4 h-16");
    }
  });
});
