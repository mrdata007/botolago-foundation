import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, initializeLanguage, observePage } from "./support";

const viewports = [
  { name: "mobile-320", width: 320, height: 700 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const criticalRoutes = [
  "/",
  "/news",
  "/matches",
  "/fantasy",
  "/fantasy/rules",
  "/profile",
  "/terms",
  "/privacy",
] as const;

const fullRouteMatrix = [
  ...criticalRoutes,
  "/news/preview-a1",
  "/news/does-not-exist",
  "/matches/does-not-exist",
  "/fantasy/create",
  "/fantasy/create/squad",
  "/fantasy/create/review",
  "/fantasy/team",
  "/fantasy/points",
  "/fantasy/transfers",
  "/fantasy/leagues",
  "/fantasy/leagues/lg1",
  "/fantasy/fixtures",
  "/fantasy/players",
  "/fantasy/players/fp_war_1",
  "/fantasy/top-players",
  "/fantasy/rankings",
  "/auth",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/verify",
  "/auth/profile-setup",
  "/auth/update-password",
  "/admin",
  "/admin/approvals",
  "/admin/audit",
  "/admin/security",
  "/admin/staff",
  "/admin/staff/demo",
] as const;

for (const language of ["fr", "ar"] as const) {
  for (const viewport of viewports) {
    test(`${language} ${viewport.name}: anonymous critical routes`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const diagnostics = observePage(page);
      await page.setViewportSize(viewport);
      await initializeLanguage(page, language);
      const routes =
        viewport.name === "mobile-390" || viewport.name === "desktop"
          ? fullRouteMatrix
          : criticalRoutes;

      for (const route of routes) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          language === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator("body")).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }

      await diagnostics.verify(testInfo);
    });
  }
}
