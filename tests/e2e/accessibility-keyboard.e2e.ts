import { expect, test, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import { gotoHydrated, initializeLanguage, observePage } from "./support";

/**
 * Audit MOB-02, MOB-03, MOB-05 (Phase C, lane C4), against the mock data a
 * server without a `.env` serves: the skip link, the 44px carousel dots and
 * the search's active-option relation, measured from the rendered page.
 */

const NEXT = "00000020-0000-4000-8000-000000000002";
type Language = "fr" | "ar";

const activeElement = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    const rect = el?.getBoundingClientRect();
    return {
      tag: el?.tagName,
      id: el?.id,
      text: el?.textContent?.trim(),
      rect: rect && { x: rect.x, y: rect.y, w: rect.width, h: rect.height, right: rect.right },
      viewport: innerWidth,
    };
  });

for (const lang of ["fr", "ar"] as const satisfies readonly Language[]) {
  test.describe(`${lang}: skip to content (MOB-05)`, () => {
    for (const [path, width] of [
      ["/matches", 390],
      ["/fantasy", 390],
      ["/auth/login", 390],
      ["/matches", 1440],
    ] as const) {
      test(`${path} at ${width}px: first Tab shows the link, Enter lands on main`, async ({
        page,
      }, testInfo) => {
        const diagnostics = observePage(page, { allowExpectedResourceConsoleError: true });
        await page.setViewportSize({ width, height: 800 });
        await initializeLanguage(page, lang);
        await gotoHydrated(page, path, lang);
        const historyBefore = await page.evaluate(() => history.length);

        await page.keyboard.press("Tab");
        const link = await activeElement(page);
        expect(link.tag).toBe("A");
        expect(link.text).toBe(dictionaries[lang]["nav.skip_to_content"]);
        // Shown, on the 44px floor, at the leading edge of the screen.
        expect(link.rect!.h).toBeGreaterThanOrEqual(44);
        expect(link.rect!.w).toBeGreaterThan(44);
        if (lang === "fr") expect(link.rect!.x).toBeLessThan(24);
        else expect(link.viewport - link.rect!.right).toBeLessThan(24);

        await page.keyboard.press("Enter");
        const target = await activeElement(page);
        expect(target.tag).toBe("MAIN");
        expect(target.id).toBe("main-content");
        // A skip is not a navigation: no hash, no history entry.
        expect(page.url()).not.toContain("#");
        expect(await page.evaluate(() => history.length)).toBe(historyBefore);
        await diagnostics.verify(testInfo);
      });
    }
  });
}

for (const lang of ["fr", "ar"] as const satisfies readonly Language[]) {
  test(`${lang}: the prediction deck's dots are 44px targets (MOB-03)`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, `/matches/${NEXT}`, lang);
    const dots = await page.evaluate(() => {
      const row = document.querySelector(
        '[data-testid="match-prediction-deck"]',
      )!.lastElementChild!;
      return [...row.querySelectorAll("button")].map((button) => {
        const box = button.getBoundingClientRect();
        const dot = button.firstElementChild!.getBoundingClientRect();
        return {
          w: box.width,
          h: box.height,
          left: box.left,
          right: box.right,
          dot: [dot.width, dot.height],
          viewport: innerWidth,
        };
      });
    });
    expect(dots).toHaveLength(4);
    for (const dot of dots) {
      expect(dot.w).toBeGreaterThanOrEqual(44);
      expect(dot.h).toBeGreaterThanOrEqual(44);
      // The painted dot did not grow.
      expect(dot.dot).toEqual([10, 10]);
      expect(dot.left).toBeGreaterThanOrEqual(0);
      expect(dot.right).toBeLessThanOrEqual(dot.viewport);
    }
    // The deck announces itself in the reader's language.
    const roles = await page.evaluate(() => [
      document
        .querySelector('[data-testid="match-prediction-deck"]')!
        .getAttribute("aria-roledescription"),
      document
        .querySelector('[data-testid="match-prediction-deck"] [role="group"]')!
        .getAttribute("aria-roledescription"),
    ]);
    expect(roles).toEqual([
      dictionaries[lang]["predictions.votes.role"],
      dictionaries[lang]["predictions.votes.slide_role"],
    ]);
  });

  test(`${lang}: the search names its active option and announces results (MOB-02)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/", lang);
    const input = page.locator('input[role="combobox"]').first();
    await input.focus();
    await input.fill(lang === "fr" ? "a" : "ا");

    const read = () =>
      page.evaluate(() => {
        const field = document.querySelector('input[role="combobox"]')!;
        const id = field.getAttribute("aria-activedescendant");
        const option = id ? document.getElementById(id) : null;
        return {
          expanded: field.getAttribute("aria-expanded"),
          controls: field.getAttribute("aria-controls"),
          listbox: document
            .getElementById(field.getAttribute("aria-controls") ?? "")
            ?.getAttribute("role"),
          activeId: id,
          optionRole: option?.getAttribute("role"),
          optionSelected: option?.getAttribute("aria-selected"),
          optionText: option?.textContent?.trim(),
          selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
          live: document.querySelector('[role="status"][aria-live="polite"]')?.textContent,
        };
      });

    await expect.poll(async () => (await read()).optionRole).toBe("option");
    const first = await read();
    expect(first.expanded).toBe("true");
    expect(first.listbox).toBe("listbox");
    expect(first.optionSelected).toBe("true");
    expect(first.selected).toBe(1);
    expect(first.live).toMatch(/\d/);

    await input.press("ArrowDown");
    const second = await read();
    expect(second.activeId).not.toBe(first.activeId);
    expect(second.optionText).not.toBe(first.optionText);
    expect(second.selected).toBe(1);

    // A real Escape: the list is shut and nothing is pointed at. Chromium and
    // WebKit also empty a search field on Escape, so there is no text left to
    // reopen the list with (Firefox keeps it).
    await input.press("Escape");
    await expect.poll(async () => (await read()).activeId).toBeNull();
    expect((await read()).expanded).toBe("false");
    expect((await read()).controls).toBeNull();
    await expect(input).toHaveValue("");
    // ArrowDown with nothing typed opens nothing.
    await input.press("ArrowDown");
    expect((await read()).expanded).toBe("false");
    expect((await read()).activeId).toBeNull();

    // Typing again opens it again.
    await input.fill(lang === "fr" ? "a" : "ا");
    await expect.poll(async () => (await read()).expanded).toBe("true");
    expect((await read()).activeId).not.toBeNull();

    // No result: the line says so and the field does not claim to be expanded.
    await input.fill("zzzzqq");
    await expect.poll(async () => (await read()).live).toBe(dictionaries[lang]["nav.search.empty"]);
    expect((await read()).activeId).toBeNull();
    expect((await read()).expanded).toBe("false");
  });
}

// The hub pages draw their title, chips and tabs in a band above the content
// column; a skip must land before them, not after.
const HUBS = [
  "/news",
  "/matches",
  "/matches/standings",
  "/pronostics",
  "/pepites",
  "/clubs",
  "/profile",
  "/notifications",
] as const;

for (const lang of ["fr", "ar"] as const satisfies readonly Language[]) {
  test(`${lang}: on every hub the skip target holds the page title (MOB-05)`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await initializeLanguage(page, lang);
    for (const path of HUBS) {
      await gotoHydrated(page, path, lang);
      const structure = await page.evaluate(() => {
        const main = document.getElementById("main-content");
        const h1 = document.querySelector("h1");
        return {
          mains: document.querySelectorAll("main").length,
          targets: document.querySelectorAll("#main-content").length,
          mainIsMain: main?.tagName === "MAIN",
          h1InMain: !!(main && h1 && main.contains(h1)),
          h1: h1?.textContent?.trim() ?? null,
        };
      });
      expect(structure, path).toMatchObject({ mains: 1, targets: 1, mainIsMain: true });
      expect(structure.h1, path).not.toBeNull();
      expect(structure.h1InMain, path).toBe(true);

      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      const landed = await page.evaluate(() => {
        const main = document.getElementById("main-content")!;
        const h1 = document.querySelector("h1")!;
        return {
          onMain: document.activeElement === main,
          // Nothing of the page's own content is above the place focus landed.
          h1Below: h1.getBoundingClientRect().top >= main.getBoundingClientRect().top - 1,
        };
      });
      expect(landed, path).toEqual({ onMain: true, h1Below: true });
    }
  });
}
