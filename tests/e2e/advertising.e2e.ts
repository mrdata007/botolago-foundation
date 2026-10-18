import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { initializeLanguage, gotoHydrated, expectNothingOffScreen } from "./support";

const baseline = process.env.ADS_BASELINE === "1";
for (const lang of ["fr", "ar"] as const) {
  for (const width of [320, 390, 768, 1280]) {
    test(`${lang} ${width}: ad placements preserve the reading flow`, async ({
      page,
    }, testInfo) => {
      const evidence =
        process.env.ADS_EVIDENCE_DIR ?? testInfo.outputPath(baseline ? "before" : "after");
      await initializeLanguage(page, lang);
      await page.setViewportSize({ width, height: 900 });
      const googleRequests: string[] = [];
      page.on("request", (request) => {
        if (/googlesyndication|doubleclick/.test(request.url())) googleRequests.push(request.url());
      });
      await mkdir(evidence, { recursive: true });
      for (const [name, path, placement] of [
        ["home", "/", "homeFeed"],
        ["news", "/news", "newsFeed"],
      ] as const) {
        await gotoHydrated(page, path, lang);
        await expect(page.locator("main")).toBeVisible();
        if (!baseline) {
          const slot = page.locator(`[data-ad-placement="${placement}"]`);
          await expect(slot).toBeVisible();
          await slot.scrollIntoViewIfNeeded();
          await expectNothingOffScreen(page, `[data-ad-placement="${placement}"]`);
          const size = await slot.locator("[data-ad-surface]").boundingBox();
          expect(size?.height).toBe(100);
          expect(size!.width).toBeLessThanOrEqual(width);
          await page.evaluate(() => document.documentElement.classList.add("dark"));
          await page.screenshot({ path: `${evidence}/${name}-${lang}-${width}-dark.png` });
          await page.evaluate(() => document.documentElement.classList.remove("dark"));
        }
        await page.screenshot({ path: `${evidence}/${name}-${lang}-${width}.png`, fullPage: true });
      }
      const first = page.locator('a[href^="/news/"]').first();
      await expect(first).toBeVisible();
      await first.click();
      await expect(page.locator("h1")).toBeVisible();
      if (!baseline) {
        const slot = page.locator('[data-ad-placement="articleEnd"]');
        await expect(slot).toBeAttached();
        await slot.scrollIntoViewIfNeeded();
        await expectNothingOffScreen(page, '[data-ad-placement="articleEnd"]');
        expect((await slot.locator("[data-ad-surface]").boundingBox())?.height).toBe(250);
      }
      await page.screenshot({ path: `${evidence}/article-${lang}-${width}.png`, fullPage: true });
      expect(googleRequests).toEqual([]);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    });
  }
}

test("unconfigured ads.txt publishes no fabricated account", async ({ request }) => {
  const response = await request.get("/ads.txt");
  expect(response.status()).toBe(404);
  expect(await response.text()).toBe("");
  expect(response.headers()["content-type"]).toContain("text/plain");
});
