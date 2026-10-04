import { expect, test, type Page } from "@playwright/test";

import { initializeLanguage } from "./support";

/**
 * Retour gives the journey back (mobile UX refinements, batch 1).
 *
 * Each case walks a journey in the browser and presses Retour, because what
 * is being protected is the path through history, not any one function. They
 * run against the development server's mock data, so nothing here touches an
 * account or a real project. Dates are read from the page (the mock calendar's
 * "today" moves with the clock), never written in.
 */

test.use({ viewport: { width: 390, height: 844 } });

const back = (page: Page) => page.getByRole("button", { name: /retour|رجوع/i }).first();
/** The header search field (the season picker is a combobox too). */
const searchField = (page: Page) => page.getByRole("combobox", { name: /rechercher|بحث/i });

/**
 * A day other than the one the calendar opens on, and with matches on it. The
 * mock season has fixtures only on a few days around today, so this steps
 * forward with the date band's arrow until a list shows.
 */
async function pickOtherDayWithMatches(page: Page): Promise<string> {
  // The calendar opens on its default day, which keeps the URL clean.
  expect(new URL(page.url()).searchParams.get("date")).toBeNull();
  const next = page.getByRole("button", { name: /jour suivant|suivant|التالي/i }).first();
  for (let step = 0; step < 4; step += 1) {
    await next.click();
    await expect(page).toHaveURL(/[?&]date=\d{4}-\d{2}-\d{2}/);
    await page.waitForLoadState("networkidle");
    if ((await page.locator('main a[href^="/matches/"]').count()) > 0) {
      return new URL(page.url()).searchParams.get("date")!;
    }
  }
  throw new Error("no day within four days of today has a match");
}

test.describe("calendar", () => {
  test("a day chosen on the calendar survives a match visit and its tabs", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await page.goto("/matches", { waitUntil: "networkidle" });
    const day = await pickOtherDayWithMatches(page);

    // Any match row: from the list, so the entry in history is the calendar's.
    await page.locator('main a[href^="/matches/"]').first().click();
    await expect(page).toHaveURL(/\/matches\/[^/?]+/);
    const entriesBefore = await page.evaluate(() => history.length);

    // Changing tabs replaces the entry: it must not add one.
    const tabs = page.getByRole("tab");
    await tabs.nth(1).click();
    await tabs.nth(2).click();
    expect(await page.evaluate(() => history.length)).toBe(entriesBefore);

    await back(page).click();
    await expect(page).toHaveURL(new RegExp(`/matches\\?.*date=${day}`));
    // The list itself is back, not only the URL.
    await expect(page.locator('main a[href^="/matches/"]').first()).toBeVisible();
  });

  test("the status chip travels with the day", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await page.goto("/matches?status=finished", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /résultats/i, pressed: true })).toBeVisible();
    await page.getByRole("button", { name: /à venir/i }).click();
    await expect(page).toHaveURL(/status=upcoming/);
    await page.getByRole("button", { name: /^tous/i }).click();
    await expect(page).not.toHaveURL(/status=/);
  });

  test("a bad day in the URL opens the calendar on its default day", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await page.goto("/matches?date=2026-02-31&status=nope", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("button", { name: /^tous/i, pressed: true })).toBeVisible();
  });

  test("a match opened cold goes back to the calendar on its own day", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await page.goto("/matches/00000020-0000-4000-8000-000000000001", {
      waitUntil: "networkidle",
    });
    await back(page).click();
    await expect(page).toHaveURL(/\/matches\?.*date=\d{4}-\d{2}-\d{2}/);
  });
});

test.describe("search", () => {
  for (const [query, target, leaves] of [
    ["wyd", /Club|نادي/, /\/clubs\//],
    ["zniti", /Joueur|لاعب/, /\/fantasy\/players\//],
  ] as const) {
    for (const start of ["/", "/matches", "/fantasy"]) {
      test(`${start} → "${query}" → result → Retour keeps the query and its results`, async ({
        page,
      }) => {
        await initializeLanguage(page, "fr");
        await page.goto(start, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /rechercher/i }).click();
        await searchField(page).fill(query);
        const option = page.getByRole("option").filter({ hasText: target }).first();
        await expect(option).toBeVisible();
        // The list answers a press, not a click: the field's blur would close it first.
        await option.dispatchEvent("mousedown");
        await expect(page).toHaveURL(leaves);

        await back(page).click();
        await expect(page).toHaveURL(new RegExp(`${start === "/" ? "/$" : start}$`));
        await expect(searchField(page)).toHaveValue(query);
        await expect(page.getByRole("option").filter({ hasText: target }).first()).toBeVisible();
      });
    }
  }

  test("a fresh visit to the page starts with an empty field", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /rechercher/i }).click();
    await searchField(page).fill("wyd");
    await page.getByRole("option").first().dispatchEvent("mousedown");
    await expect(page).toHaveURL(/\/clubs\//);
    // Not Retour: the wordmark, which is a new entry for Home.
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(searchField(page)).toHaveCount(0);
  });

  test("search is one tap away on every primary screen, whatever the shell's width", async ({
    page,
  }) => {
    await initializeLanguage(page, "fr");
    for (const path of ["/", "/news", "/matches", "/matches/standings", "/fantasy"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /rechercher/i }).click();
      await expect(searchField(page)).toBeFocused();
    }
  });
});

test.describe("player", () => {
  test("a player opened cold goes back to the players list", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await page.goto("/fantasy/players/fp_rca_1", { waitUntil: "networkidle" });
    await back(page).click();
    await expect(page).toHaveURL(/\/fantasy\/players$/);
  });
});

test.describe("club", () => {
  test("Retour from a match opened on the club's Matchs tab returns to that tab", async ({
    page,
  }) => {
    await initializeLanguage(page, "fr");
    await page.goto("/clubs/00000010-0000-4000-8000-000000000001?tab=matches", {
      waitUntil: "networkidle",
    });
    await page.locator('main a[href^="/matches/"]').first().click();
    await expect(page).toHaveURL(/\/matches\/[^/?]+/);
    await back(page).click();
    await expect(page).toHaveURL(/\/clubs\/[^/?]+\?tab=matches/);
  });
});
