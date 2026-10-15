import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { useAuthReturnSearch } from "@/auth/use-auth-return";
import { authLanding, authNextSearch, authReturnTarget } from "@/lib/auth-callback";

/**
 * Audit UX-005: signing in lost the page the reader was on. The prompt built
 * its `next` from the pathname alone (`/pronostics`, not
 * `/pronostics?journee=12&tab=ligues`), the inbox and profile links carried no
 * `next` at all, and the pages that land on `next` handed it to the router as
 * a bare path, which cannot hold a query. The safety of `next` is not
 * touched: every value still goes through `sanitizeAuthCallbackNext`.
 */

describe("the next a sign-in link carries for the page the reader is on", () => {
  test.each([
    [{ pathname: "/pronostics" }, "/pronostics"],
    [
      { pathname: "/pronostics", searchStr: "?journee=12&tab=ligues" },
      "/pronostics?journee=12&tab=ligues",
    ],
    [{ pathname: "/notifications", searchStr: "" }, "/notifications"],
    [{ pathname: "/profile", searchStr: "", hash: "security" }, "/profile#security"],
    [{ pathname: "/profile", searchStr: "", hash: "#security" }, "/profile#security"],
    [
      { pathname: "/fantasy/players", searchStr: "?pos=DEF&page=2", hash: "" },
      "/fantasy/players?pos=DEF&page=2",
    ],
  ])("%j returns to %s", (location, expected) => {
    expect(authReturnTarget(location)).toBe(expected);
  });

  test("the home page needs no next", () => {
    expect(authReturnTarget({ pathname: "/" })).toBeUndefined();
    expect(authReturnTarget({ pathname: "/", searchStr: "" })).toBeUndefined();
  });

  // The same disguises the sanitiser table refuses, reached through a
  // location instead of a raw string: none may become a next.
  test.each([
    [{ pathname: "//attacker.invalid" }],
    [{ pathname: "/\\attacker.invalid" }],
    [{ pathname: "/.//attacker.invalid" }],
    [{ pathname: "/a/..//attacker.invalid", searchStr: "?x=1" }],
    [{ pathname: "/%2e//attacker.invalid" }],
    [{ pathname: "https://attacker.invalid" }],
    [{ pathname: "javascript:alert(1)" }],
    [{ pathname: "/\t/attacker.invalid" }],
    [{ pathname: "/news", searchStr: "?q=a\r\nb" }],
  ])("%j is refused", (location) => {
    expect(authReturnTarget(location)).toBeUndefined();
  });

  test("what it builds survives the auth pages' own validation unchanged", () => {
    const next = authReturnTarget({
      pathname: "/pronostics",
      searchStr: "?journee=12&tab=ligues",
    });
    expect(authNextSearch(next)).toEqual({ next });
  });
});

describe("landing on next after sign-in", () => {
  function routerAt(path: string) {
    const root = createRootRoute();
    const home = createRoute({ getParentRoute: () => root, path: "/" });
    const pronostics = createRoute({
      getParentRoute: () => root,
      path: "/pronostics",
      validateSearch: (search: Record<string, unknown>) => ({
        journee: search.journee === undefined ? undefined : String(search.journee),
        tab: typeof search.tab === "string" ? search.tab : undefined,
      }),
    });
    return createRouter({
      routeTree: root.addChildren([home, pronostics]),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
  }

  test("a next with a query lands on that page with its search", async () => {
    const router = routerAt("/");
    await router.load();
    const location = router.buildLocation(authLanding("/pronostics?journee=12&tab=ligues#top"));
    expect(location.pathname).toBe("/pronostics");
    expect(location.search).toEqual({ journee: 12, tab: "ligues" });
    expect(location.hash).toBe("top");
  });

  test("the bare-path form it replaces could not: the query became part of the path", async () => {
    const router = routerAt("/");
    await router.load();
    const location = router.buildLocation({ to: "/pronostics?journee=12" as never });
    expect(location.pathname).not.toBe("/pronostics");
  });

  test("it replaces the sign-in entry, so Back does not return to a finished form", () => {
    expect(authLanding("/pronostics?journee=12").replace).toBe(true);
  });

  test("it sanitises again where it is used, as every landing does", () => {
    expect(authLanding("https://attacker.invalid").href).toBe("/");
    expect(authLanding("//attacker.invalid").href).toBe("/");
    expect(authLanding("/.//attacker.invalid").href).toBe("/");
    expect(authLanding("javascript:alert(1)").href).toBe("/");
    expect(authLanding("/fantasy/team?x=1").href).toBe("/fantasy/team?x=1");
  });
});

describe("the sign-in links read the page the reader is on", () => {
  function Probe() {
    return <span data-next={JSON.stringify(useAuthReturnSearch())} />;
  }

  async function nextAt(path: string): Promise<unknown> {
    const root = createRootRoute({ component: Probe });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    const html = renderToString(<RouterProvider router={router} />);
    const match = /data-next="([^"]*)"/.exec(html);
    return JSON.parse((match?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }

  test("a selected round and tab are in it", async () => {
    expect(await nextAt("/pronostics?journee=12&tab=ligues")).toEqual({
      next: "/pronostics?journee=12&tab=ligues",
    });
  });

  test("the inbox returns to the inbox, not to Home", async () => {
    expect(await nextAt("/notifications")).toEqual({ next: "/notifications" });
  });

  test("the home page carries nothing", async () => {
    expect(await nextAt("/")).toEqual({});
  });
});

describe("every sign-in entry point uses the shared return target", () => {
  const read = (file: string) => readFileSync(join(import.meta.dir, "..", file), "utf8");

  test.each([
    "components/auth/AuthPromptDialog.tsx",
    "components/pepites/PepitesFollowButton.tsx",
    "routes/notifications.tsx",
    "routes/profile.tsx",
  ])("%s", (file) => {
    const source = read(file);
    expect(source).toContain("useAuthReturnSearch");
    // The shape that dropped the query.
    expect(source).not.toMatch(/search: \{ next: pathname \}/);
  });

  test("the inbox and profile sign-in links carry the search", () => {
    for (const file of ["routes/notifications.tsx", "routes/profile.tsx"]) {
      const source = read(file);
      expect(source).toMatch(/to="\/auth\/register"\s+search=\{returnSearch\}/);
      expect(source).toMatch(/to="\/auth\/login"\s+search=\{returnSearch\}/);
    }
  });

  test("the pages that land on next hand the router a location, not a bare path", () => {
    for (const file of [
      "routes/auth.callback.tsx",
      "routes/auth.register.tsx",
      "routes/auth.profile-setup.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("authLanding(");
      expect(source).not.toMatch(/navigate\(\{ to: next \}\)/);
    }
  });
});
