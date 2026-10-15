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

    // Nothing to point at once the list is shut.
    await input.evaluate((element) =>
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    await expect.poll(async () => (await read()).activeId).toBeNull();
    expect((await read()).expanded).toBe("false");
    // ArrowDown opens it again, where it was.
    await input.press("ArrowDown");
    await expect.poll(async () => (await read()).expanded).toBe("true");
    expect((await read()).activeId).not.toBeNull();

    await input.fill("zzzzqq");
    await expect.poll(async () => (await read()).live).toBe(dictionaries[lang]["nav.search.empty"]);
    expect((await read()).activeId).toBeNull();
  });
}
