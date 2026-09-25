import { expect, test } from "@playwright/test";
import {
  expectNoClippedMatchCards,
  expectNoHorizontalOverflow,
  initializeLanguage,
  observePage,
} from "./support";

const viewports = [
  { name: "mobile-320", width: 320, height: 700 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const routes = ["/", "/news", "/matches", "/fantasy/rules", "/profile", "/pronostics"] as const;

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
        await expectNoClippedMatchCards(page);

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

// The launch splash is in the server HTML and shown by an inline head script,
// so it is on screen before any app code has run. It used to mount after
// hydration: the page showed first and the splash landed on top of it. And
// against this dev server it never showed at all, because StrictMode's second
// run of a mount effect read the "seen" flag the first run had just written.
test.describe("launch splash", () => {
  test("a first visit opens on the splash, once, then the language chooser", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    // Nothing is seeded: a first visit in a new tab. From the first frame
    // with anything in <body>, record each change in whether the splash is up.
    await page.addInitScript(() => {
      const changes: boolean[] = [];
      Object.assign(window, { __splash: changes });
      const tick = () => {
        if (document.body?.firstElementChild) {
          const splash = document.querySelector(".launch-splash");
          const up = !!splash && getComputedStyle(splash).display !== "none";
          if (changes[changes.length - 1] !== up) changes.push(up);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const splashChanges = () =>
      page.evaluate(() => (window as unknown as { __splash: boolean[] }).__splash);

    await page.goto("/");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await splashChanges()).toEqual([true, false]);

    // Once per tab: a reload goes straight to the page.
    await page.reload();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await splashChanges()).toEqual([false]);

    await diagnostics.verify(testInfo);
  });

  test("the splash does not wait for the app's code, nor stay up without it", async ({ page }) => {
    await page.route("**/*", (route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue(),
    );
    await page.goto("/");
    const splash = page.locator(".launch-splash");
    await expect(splash.getByRole("img", { name: "BotolaGO" })).toBeVisible();
    // Nothing but the head script's own failsafe can take it down here.
    await expect(splash).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("main")).toBeVisible();
  });
});
