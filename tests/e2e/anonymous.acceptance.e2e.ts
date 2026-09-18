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

const routes = ["/", "/news", "/matches", "/fantasy/rules", "/profile"] as const;

for (const language of ["fr", "ar"] as const) {
  for (const viewport of viewports) {
    test(`${language} ${viewport.name}: anonymous critical routes`, async ({ page }, testInfo) => {
      const diagnostics = observePage(page);
      await page.setViewportSize(viewport);
      await initializeLanguage(page, language);

      for (const route of routes) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          language === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator("body")).toBeVisible();
        await expectNoHorizontalOverflow(page);

        // BG-0035 regression: @layer base's `body { font-family: var(--font-sans) }`
        // must not defeat the html[dir=rtl] Arabic font switch.
        const bodyFontFamily = await page.evaluate(
          () => getComputedStyle(document.body).fontFamily,
        );
        if (language === "ar") {
          expect(bodyFontFamily).toContain("Noto Sans Arabic");
        } else {
          expect(bodyFontFamily).not.toContain("Noto Sans Arabic");
          expect(bodyFontFamily).toContain("Manrope");
        }
      }

      await diagnostics.verify(testInfo);
    });
  }
}
