import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  initializeLanguage,
  observePage,
} from "./support";

const viewports = [
  { name: "mobile-320", width: 320, height: 700 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const routes = ["/", "/news", "/matches", "/fantasy/rules", "/profile"] as const;

for (const language of ["fr", "ar"] as const) {
  for (const viewport of viewports) {
    test(`${language} ${viewport.name}: anonymous critical routes`, async ({ page }, testInfo) => {
      const diagnostics = observePage(page);
      await page.setViewportSize(viewport);
      await initializeLanguage(page, language);

      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
        await expect(page.locator("body")).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }

      await diagnostics.verify(testInfo);
    });
  }
}
