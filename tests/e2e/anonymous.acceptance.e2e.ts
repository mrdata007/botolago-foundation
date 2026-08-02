import { test, expect } from "./fixtures";
import {
  expectHealthyDocument,
  expectInteractiveControlsInsideViewport,
  gotoHydrated,
  observePage,
} from "./support";

const routeGroups = {
  "common, home, news, matches, and profile": [
    "/",
    "/news",
    "/news/a0000000-0000-4000-8000-000000000001",
    "/matches",
    "/matches/00000020-0000-4000-8000-000000000001",
    "/profile",
    "/route-that-does-not-exist",
  ],
  authentication: [
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/verify?email=qa%2Bbotolago%40example.com",
    "/auth/profile-setup",
    "/auth/update-password",
    "/auth/callback?next=%2Fprofile",
  ],
  fantasy: [
    "/fantasy",
    "/fantasy/create",
    "/fantasy/team",
    "/fantasy/transfers",
    "/fantasy/points",
    "/fantasy/top-players",
    "/fantasy/rankings",
    "/fantasy/leagues",
    "/fantasy/leagues/lg1",
    "/fantasy/players",
    "/fantasy/players/fp_war_1",
    "/fantasy/fixtures",
    "/fantasy/rules",
  ],
} as const;

for (const [group, routes] of Object.entries(routeGroups)) {
  test(`${group}: every route renders a healthy localized document`, async ({
    guestPage: page,
    language,
  }, testInfo) => {
    const diagnostics = observePage(page, {
      allowResponse: (status, url) =>
        status === 404 && url.pathname === "/route-that-does-not-exist",
      allowConsoleError: (message, url) =>
        url.pathname === "/route-that-does-not-exist" && /failed to load resource/i.test(message),
    });

    for (const route of routes) {
      await test.step(route, async () => {
        await gotoHydrated(page, route, language);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          language === "ar" ? "rtl" : "ltr",
        );
        await expectHealthyDocument(page);
        await expectInteractiveControlsInsideViewport(page);
      });
    }

    await diagnostics.verify(testInfo);
  });
}

const adminRoutes = [
  "/admin",
  "/admin/approvals",
  "/admin/audit",
  "/admin/security",
  "/admin/staff",
  "/admin/staff/qa-regular-user",
] as const;

test("admin routes deny a non-privileged session without rendering privileged data", async ({
  authenticatedPage: page,
  language,
}, testInfo) => {
  const diagnostics = observePage(page);

  for (const route of adminRoutes) {
    await test.step(route, async () => {
      await gotoHydrated(page, route, language);
      await expect
        .poll(() =>
          page.locator("[data-admin-state]").evaluateAll((nodes) => {
            const allowed = new Set([
              "backend_unavailable",
              "unauthenticated",
              "forbidden",
              "revoked",
              "suspended",
            ]);
            const states = nodes
              .map((node) => node.getAttribute("data-admin-state"))
              .filter((state): state is string => Boolean(state) && state !== "loading");
            return states.length > 0 && states.every((state) => allowed.has(state));
          }),
        )
        .toBe(true);
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
      await expect(page.locator('[data-admin-state="authorized"]')).toHaveCount(0);
      await expectHealthyDocument(page);
      await expectInteractiveControlsInsideViewport(page);
    });
  }

  await diagnostics.verify(testInfo);
});
