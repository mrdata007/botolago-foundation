import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";
import { Route as AuthIndexRoute } from "./auth.index";

/**
 * The bare `/auth` address (audit SOL-04). `/auth` is the layout parent of the
 * sign-in screens and renders only an `Outlet`, so on its own it showed an
 * empty page. These load the real route tree at each address and read where
 * the router ends up, the same step the browser's first navigation takes.
 */
async function landing(address: string) {
  const history = createMemoryHistory({ initialEntries: [address] });
  const router = createRouter({
    routeTree,
    history,
    isServer: false,
    origin: "http://localhost",
  } as never);
  await router.load();
  const { pathname, search } = router.state.location;
  return { pathname, search: search as Record<string, unknown>, history };
}

describe("the bare /auth address", () => {
  test("goes to the sign-in screen", async () => {
    const { pathname, search } = await landing("/auth");
    expect(pathname).toBe("/auth/login");
    expect(search.next).toBeUndefined();
  });

  test("keeps a same-site next", async () => {
    const { pathname, search } = await landing("/auth?next=%2Fpronostics");
    expect(pathname).toBe("/auth/login");
    expect(search.next).toBe("/pronostics");
  });

  test("keeps the query and anchor of a same-site next", async () => {
    const { pathname, search } = await landing(
      `/auth?next=${encodeURIComponent("/pronostics?journee=12&tab=ligues")}`,
    );
    expect(pathname).toBe("/auth/login");
    expect(search.next).toBe("/pronostics?journee=12&tab=ligues");
  });

  for (const offSite of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ]) {
    test(`drops the off-site next ${JSON.stringify(offSite)}`, async () => {
      const { pathname, search } = await landing(`/auth?next=${encodeURIComponent(offSite)}`);
      expect(pathname).toBe("/auth/login");
      expect(search.next).toBeUndefined();
    });
  }

  test("is the index route only, so the child routes are not touched", async () => {
    for (const child of ["/auth/login", "/auth/register", "/auth/forgot-password"]) {
      const { pathname } = await landing(child);
      expect(pathname).toBe(child);
    }
  });

  test("runs the shared next sanitiser, with no check of its own, and redirects with replace: true (source-level guard)", () => {
    const source = readFileSync(new URL("./auth.index.tsx", import.meta.url), "utf8");
    expect(source).toContain("authNextSearch(s.next)");
    expect(source).toContain('to: "/auth/login"');
    // A source-level guard only: a memory history cannot show the difference.
    expect(source).toContain("replace: true");
    // Whatever the route is given goes through the validator; nothing reads the raw address.
    expect(source).not.toMatch(/location\.|window\./);
    const validate = (AuthIndexRoute.options as { validateSearch: (s: unknown) => unknown })
      .validateSearch;
    expect(validate({ next: "https://evil.example" })).toEqual({ next: undefined });
  });
});
