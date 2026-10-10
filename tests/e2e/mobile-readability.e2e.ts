import { expect, test, type Page } from "@playwright/test";

import { initializeLanguage } from "./support";

/**
 * Phone readability (mobile UX refinements, batches 2 and 3), measured in the
 * browser on the development server's mock data: where things land in the
 * first screen, and that nothing is cut, overlapped or pushed sideways. Both
 * languages at the two phone widths the audit used.
 */

const MATCH = "/matches/00000020-0000-4000-8000-000000000001";
const FINISHED = "/matches/00000020-0000-4000-8000-000000000005";
const CLUB = "/clubs/00000010-0000-4000-8000-000000000001";

const sizes = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
] as const;

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const language of ["fr", "ar"] as const) {
  for (const size of sizes) {
    test.describe(`${language} ${size.width}px`, () => {
      test.use({ viewport: size });

      for (const [label, path] of [
        ["live", MATCH],
        ["finished", FINISHED],
      ] as const) {
        test(`the ${label} match page shows four tabs and the start of the panel in the first screen`, async ({
          page,
        }) => {
          await initializeLanguage(page, language);
          await page.goto(path, { waitUntil: "networkidle" });
          const tabs = page.getByRole("tab");
          await expect(tabs).toHaveCount(4);
          const boxes = await tabs.evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect()),
          );
          for (const box of boxes) expect(box.bottom).toBeLessThanOrEqual(size.height);
          for (const box of boxes) expect(box.left).toBeGreaterThanOrEqual(-1);
          for (const box of boxes) expect(box.right).toBeLessThanOrEqual(size.width + 1);
          const panel = await page.getByRole("tabpanel").boundingBox();
          // The panel starts inside the first screen, with room to read.
          expect(panel!.y).toBeLessThan(size.height * 0.6);
          await noSidewaysScroll(page);
        });

        test(`the ${label} match page's club names stay whole words on at most two lines`, async ({
          page,
        }) => {
          await initializeLanguage(page, language);
          await page.goto(path, { waitUntil: "networkidle" });
          const names = page.locator(
            "section[aria-labelledby] .relative.flex > div > p:first-of-type",
          );
          await expect(names).toHaveCount(2);
          for (const name of await names.all()) {
            const { lines, wider } = await name.evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                lines: Math.round(node.scrollHeight / parseFloat(style.lineHeight)),
                wider: node.scrollWidth > node.clientWidth + 1,
              };
            });
            expect(lines).toBeLessThanOrEqual(2);
            expect(wider).toBe(false);
          }
        });
      }

      test("home is the first club in the header, in either direction", async ({ page }) => {
        await initializeLanguage(page, language);
        await page.goto(MATCH, { waitUntil: "networkidle" });
        const halves = page.locator("section[aria-labelledby] .relative.flex > div[data-club]");
        const [home, away] = await halves.evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().left),
        );
        // Home at the inline start: the left in French, the right in Arabic.
        if (language === "fr") expect(home).toBeLessThan(away!);
        else expect(home).toBeGreaterThan(away!);
      });

      test("the standings keep five columns on a phone and open the rest on request", async ({
        page,
      }) => {
        await initializeLanguage(page, language);
        await page.goto("/matches/standings", { waitUntil: "networkidle" });
        const head = page.locator("thead th");
        const visible = await head.evaluateAll(
          (nodes) => nodes.filter((node) => getComputedStyle(node).display !== "none").length,
        );
        // Rank, club, played, goal difference, points.
        expect(visible).toBe(5);
        await noSidewaysScroll(page);

        // The control right under the table; its words change once it is open.
        const toggle = page.locator("table + button[aria-controls]");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        // Every club now carries its won, drawn and lost under its name.
        const rows = await page.locator("tbody tr").count();
        const lines = await page.locator("tbody tr a span.sm\\:hidden").count();
        expect(lines).toBe(rows);
        await noSidewaysScroll(page);
      });

      test("every fixture on a club's Matchs tab says its day", async ({ page }) => {
        await initializeLanguage(page, language);
        await page.goto(`${CLUB}?tab=matches`, { waitUntil: "networkidle" });
        const rows = page.locator('main a[href^="/matches/"]');
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);
        for (let index = 0; index < count; index += 1) {
          // A day is a figure and a month, in either language.
          await expect(rows.nth(index)).toContainText(/\d{1,2}/);
          const text = await rows.nth(index).innerText();
          expect(text).toMatch(/\d{2}\s+\S+/);
        }
        await noSidewaysScroll(page);
      });

      test("search results lead with the name and put what it is underneath", async ({ page }) => {
        await initializeLanguage(page, language);
        await page.goto("/", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /rechercher|بحث/i }).click();
        await page
          .getByRole("combobox", { name: /rechercher|بحث/i })
          .fill(language === "fr" ? "mohamed" : "محمد");
        const option = page.getByRole("option").first();
        await expect(option).toBeVisible();
        const [name, meta] = await option
          .locator("> span")
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
        // Stacked: the metadata starts below the name, and the name has the row's width.
        expect(meta!.top).toBeGreaterThanOrEqual(name!.bottom - 1);
        const row = await option.boundingBox();
        expect(name!.width).toBeGreaterThan(row!.width * 0.7);
        await noSidewaysScroll(page);
      });
    });
  }
}
