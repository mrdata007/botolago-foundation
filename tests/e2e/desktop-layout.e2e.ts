import { expect, test } from "@playwright/test";

import { expectNoClippedMatchCards, initializeLanguage } from "./support";

// Measure the elements themselves: overflow-x: clip can hide a squeezed grid
// or header without ever increasing the document's scrollWidth.
for (const language of ["fr", "ar"] as const) {
  for (const width of [390, 768, 1024, 1280, 1440]) {
    test(`${language} ${width}px: home tracks and shared navigation fit`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await initializeLanguage(page, language);
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("data-lang", language);
      await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: info.outputPath(`home-${language}-${width}.png`),
        fullPage: true,
      });
      await expectNoClippedMatchCards(page);

      const gameweek = page.getByTestId("home-gameweek-band");
      await expect(gameweek).toBeVisible();
      const band = await gameweek.boundingBox();
      await info.attach("gameweek-width", {
        body: JSON.stringify({ language, width, band }),
        contentType: "application/json",
      });
      if (width >= 1024) expect(band!.width).toBeGreaterThanOrEqual(400);

      for (const route of ["/", "/matches", "/profile"]) {
        if (route !== "/") await page.goto(route, { waitUntil: "networkidle" });
        if (route === "/matches" && width === 1440) {
          await page.screenshot({
            path: info.outputPath(`matches-${language}-${width}.png`),
            fullPage: true,
          });
        }
        const header = page.locator("header").first();
        const boxes = await header
          .locator("a:visible, button:visible, input:visible")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect();
              return {
                name: node.textContent || node.getAttribute("aria-label"),
                x: box.x,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
              };
            }),
          );
        for (const box of boxes) {
          expect(box.x, `${route}: ${box.name} inline start`).toBeGreaterThanOrEqual(0);
          expect(box.right, `${route}: ${box.name} inline end`).toBeLessThanOrEqual(width);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!,
              b = boxes[j]!;
            const overlap = Math.min(a.right, b.right) - Math.max(a.x, b.x);
            const sameRow = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
            expect(sameRow && overlap > 1, `${route}: ${a.name} overlaps ${b.name}`).toBe(false);
          }
        }
      }
      if (width === 390) await expect(page.locator('nav[style*="bottom-nav"]')).toBeVisible();
    });
  }

  test(`${language}: desktop search works in compact and inline layouts`, async ({ page }) => {
    await initializeLanguage(page, language);
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "networkidle" });
      if (width === 1024) {
        const search = page.locator("header button[aria-expanded]").first();
        await search.click();
        await expect(search).toHaveAttribute("aria-expanded", "true");
      }
      await expect(
        page.locator("header").getByRole("combobox").filter({ visible: true }),
      ).toBeVisible();
    }
  });

  test(`${language}: desktop home keeps its layout in dark mode`, async ({ page }, info) => {
    await initializeLanguage(page, language);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expectNoClippedMatchCards(page);
    await page.screenshot({
      path: info.outputPath(`home-${language}-1440-dark.png`),
      fullPage: true,
    });
  });
}
