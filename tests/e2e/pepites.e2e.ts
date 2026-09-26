import { expect, test, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import {
  expectNoHorizontalOverflow,
  expectNothingOffScreen,
  gotoHydrated,
  initializeLanguage,
  observePage,
} from "./support";

/**
 * Pépites against the sample data a development server serves without a
 * `.env` (src/backend/pepites/mock-repository.ts), with the local preview
 * switch on: `VITE_PEPITES_PREVIEW=1 bun run dev`. Week 15 is current; week
 * 16 exists but is published only when a test says so, through
 * `window.__pepitesMock` (development builds only).
 *
 * The reveal (architecture §7, Gate A condition 1): a scheduled edition
 * counts down, runs late without publishing, keeps being checked, and shows
 * the moment it is published, without a reload.
 */

type Language = "fr" | "ar";
type Key = keyof typeof dictionaries.fr;
const copy = (lang: Language, key: Key) => dictionaries[lang][key];
const weekTitle = (lang: Language, week: number) =>
  copy(lang, "pepites.home.week_title").replace("{n}", String(week));
/** `DEMO` in auth-mock.ts, as the Pronostics journeys use it. */
const DEMO = { email: "demo@botolago.ma", password: "demo1234" };

async function setMock(page: Page, value: Record<string, unknown>) {
  await page.evaluate((next) => {
    const holder = window as unknown as { __pepitesMock?: Record<string, unknown> };
    holder.__pepitesMock = { ...(holder.__pepitesMock ?? {}), ...next };
  }, value);
}

for (const lang of ["fr", "ar"] as const) {
  test(`${lang}: the delayed reveal keeps checking and shows the new Top 10 without a reload`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    // A countdown ending in four seconds, and short timers for the test.
    await page.addInitScript(() => {
      const holder = window as unknown as Record<string, unknown>;
      holder.__pepitesMock = {
        state: "countdown",
        nextRevealAt: new Date(Date.now() + 4_000).toISOString(),
      };
      holder.__pepitesPoll = { countdownMs: 500, delayedMs: 1_000, jitter: 0 };
    });
    await gotoHydrated(page, "/pepites", lang);

    await expect(page.getByTestId("pepites-reveal-countdown")).toBeVisible();
    await expect(page.getByTestId("pepites-edition-title")).toHaveText(weekTitle(lang, 15));
    await expect(page.getByTestId("pepites-top-entry")).toHaveCount(10);
    // Marks this document: a reload would lose it.
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    // The time passes and nothing is published: the server says "delayed".
    await page.waitForTimeout(4_500);
    await setMock(page, { state: "delayed", nextRevealAt: null });
    await expect(page.getByTestId("pepites-reveal-delayed")).toBeVisible();
    await expect(page.getByTestId("pepites-reveal-countdown")).toHaveCount(0);
    await expect(page.getByText(copy(lang, "pepites.reveal.delayed_title"))).toBeVisible();
    // Still last week's list while it is late.
    await expect(page.getByTestId("pepites-edition-title")).toHaveText(weekTitle(lang, 15));

    // Stays delayed across several checks, then the edition is published.
    await page.waitForTimeout(2_500);
    await expect(page.getByTestId("pepites-reveal-delayed")).toBeVisible();
    await setMock(page, { publishNext: true });
    await expect(page.getByTestId("pepites-edition-title")).toHaveText(weekTitle(lang, 16), {
      timeout: 5_000,
    });
    await expect(page.getByTestId("pepites-reveal-delayed")).toHaveCount(0);
    await expect(page.getByTestId("pepites-top-entry")).toHaveCount(10);
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
    ).toBe(true);
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: the reveal keeps checking through an outage and shows the new Top 10 after it`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await page.addInitScript(() => {
      const holder = window as unknown as Record<string, unknown>;
      holder.__pepitesMock = { state: "delayed", nextRevealAt: null };
      holder.__pepitesPoll = { countdownMs: 500, delayedMs: 1_000, jitter: 0 };
    });
    await gotoHydrated(page, "/pepites", lang);
    await expect(page.getByTestId("pepites-reveal-delayed")).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    // The version read fails for several checks (each with its one retry):
    // the page keeps last week's list and keeps checking.
    await setMock(page, { offline: true });
    await page.waitForTimeout(5_000);
    await expect(page.getByTestId("pepites-edition-title")).toHaveText(weekTitle(lang, 15));

    // Back online, and published: shown without a reload or a focus event.
    await setMock(page, { offline: false, publishNext: true });
    await expect(page.getByTestId("pepites-edition-title")).toHaveText(weekTitle(lang, 16), {
      timeout: 8_000,
    });
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
    ).toBe(true);
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: a visitor reads the Top 10, the ranking, a player and the method at 390px`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites", lang);

    // The Top 10: ten players, lines in the reader's language, arrows.
    await expect(page.getByTestId("pepites-edition-title")).toHaveText(weekTitle(lang, 15));
    const entries = page.getByTestId("pepites-top-entry");
    await expect(entries).toHaveCount(10);
    await expect(page.getByTestId("pepites-reveal-countdown")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    // The chips under the band scroll sideways, as the Figma draws them.
    await expectNothingOffScreen(page, "main", { scrollRails: true });

    // The full ranking: twenty, then more, then filtered by position.
    await page.getByTestId("pepites-full-ranking").click();
    await expect(page).toHaveURL(/\/pepites\/classement$/);
    const rows = page.getByTestId("pepites-ranking-row");
    await expect(rows).toHaveCount(20);
    await page.getByTestId("pepites-load-more").click();
    await expect(rows).toHaveCount(30);
    await page.getByTestId("pepites-filter-MID").click();
    await expect(page).toHaveURL(/poste=mid/);
    await expect(rows.first()).toContainText(copy(lang, "pepites.position.mid"));
    await expectNoHorizontalOverflow(page);
    await expectNothingOffScreen(page, "main", { scrollRails: true });

    // A player: overview, then the match log, then back.
    await rows.first().click();
    await expect(page).toHaveURL(/\/pepites\/joueur\//);
    await expect(page.getByTestId("pepites-player-name")).toBeVisible();
    await expect(page.getByTestId("pepites-player-components")).toBeVisible();
    await expect(page.getByText(copy(lang, "pepites.player.not_set")).first()).toBeVisible();
    await expectNothingOffScreen(page);
    await page.getByRole("tab", { name: copy(lang, "pepites.player.tab_matches") }).click();
    await expect(page).toHaveURL(/onglet=matchs/);
    await expect(page.getByTestId("pepites-player-matches").locator("li").first()).toBeVisible();
    await expectNothingOffScreen(page);

    // The method, with the data coverage.
    await gotoHydrated(page, "/pepites/methode", lang);
    await expect(page.getByTestId("pepites-method")).toContainText(
      copy(lang, "pepites.method.who_title"),
    );
    await expect(page.getByTestId("pepites-coverage")).toBeVisible();
    await expectNothingOffScreen(page);

    // An earlier week, from its own address.
    await gotoHydrated(page, "/pepites/semaine/14", lang);
    await expect(page.getByTestId("pepites-edition-title")).toHaveText(weekTitle(lang, 14));
    await expect(page.getByTestId("pepites-top-entry")).toHaveCount(10);
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: Top 10 chips filter in place and both detail routes return to Pépites`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites", lang);

    const entries = page.getByTestId("pepites-top-entry");
    const playerNumbers = async () =>
      entries.evaluateAll((links) =>
        links.map((link) => Number(link.getAttribute("href")?.slice(-12))),
      );
    await expect(entries).toHaveCount(10);
    for (const [filter, expected] of [
      ["FWD", [1, 5, 9]],
      ["MID", [2, 6]],
      ["DEF", [3, 7, 11]],
      ["GK", [4, 8]],
      ["age", [2, 1, 3, 6, 7, 11, 8]],
    ] as const) {
      const chip = page.getByTestId(`pepites-home-filter-${filter}`);
      await chip.click();
      await expect(page).toHaveURL(/\/pepites$/);
      await expect(chip).toHaveAttribute("aria-pressed", "true");
      expect(await playerNumbers()).toEqual(expected);
    }

    await page.getByTestId("pepites-home-filter-all").click();
    await expect(page.getByTestId("pepites-home-filter-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(entries).toHaveCount(10);
    await entries.first().click();
    await expect(page).toHaveURL(/\/pepites\/joueur\//);
    await page.getByTestId("pepites-back").first().click();
    await expect(page).toHaveURL(/\/pepites$/);

    await page.getByTestId("pepites-full-ranking").click();
    await expect(page).toHaveURL(/\/pepites\/classement$/);
    await page.getByTestId("pepites-ranking-back").first().click();
    await expect(page).toHaveURL(/\/pepites$/);
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: the share image is drawn on the phone for the published week`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites", lang);
    await page.getByTestId("pepites-share").click();
    const image = page.getByTestId("pepites-share-image");
    await expect(image).toBeVisible();
    const size = await image.evaluate(async (node) => {
      const img = node as HTMLImageElement;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    });
    expect(size).toEqual([1080, 1350]);
    await expect(page.getByTestId("pepites-share-download")).toHaveAttribute(
      "download",
      "pepites-semaine-15.png",
    );
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: the reveal walks the Top 10 from N°10 to N°1, then back to the list`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites", lang);
    const leader = (await page.getByTestId("pepites-top-entry").first().innerText()).trim();
    await page.getByTestId("pepites-reveal-play").click();
    await expect(page).toHaveURL(/\/pepites\/revelation$/);
    await expect(page.getByTestId("pepites-reveal-name")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    for (let rank = 9; rank >= 1; rank -= 1) {
      await page.getByTestId("pepites-reveal-next").click();
      await expect(page).toHaveURL(new RegExp(`n=${rank}$`));
    }
    // N°1 is the leader of the Top 10 page, and the story ends there.
    expect(leader).toContain((await page.getByTestId("pepites-reveal-name").innerText()).trim());
    await expect(page.getByTestId("pepites-reveal-next")).toHaveCount(0);
    await page.getByTestId("pepites-reveal-done").click();
    await expect(page).toHaveURL(/\/pepites$/);
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: a player's story card is drawn at 1080×1920`, async ({ page }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites", lang);
    await page.getByTestId("pepites-top-entry").first().click();
    await expect(page.getByTestId("pepites-player-name")).toBeVisible();
    await page.getByTestId("pepites-player-share").click();
    const image = page.getByTestId("pepites-share-image");
    await expect(image).toBeVisible();
    const size = await image.evaluate(async (node) => {
      const img = node as HTMLImageElement;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    });
    expect(size).toEqual([1080, 1920]);
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: the weekly email is off until a signed-in reader turns it on`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites", lang);
    const card = page.getByTestId("pepites-email-card");
    await expect(card).toContainText(copy(lang, "pepites.email.sign_in"));
    await expect(card.getByRole("switch")).toHaveCount(0);

    await gotoHydrated(page, `/auth/login?next=${encodeURIComponent("/pepites")}`, lang);
    await page.locator('input[type="email"]').fill(DEMO.email);
    await page.locator('input[autocomplete="current-password"]').fill(DEMO.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname === "/pepites");
    const toggle = page.getByTestId("pepites-email-switch");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: Follow, Stats, Percée and Compare work on the player page`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites", lang);
    await page.getByTestId("pepites-top-entry").first().click();
    await expect(page.getByTestId("pepites-breakthrough")).toBeVisible();
    await page.getByTestId("pepites-follow").click();
    await expect(page.getByRole("dialog")).toContainText(
      copy(lang, "pepites.follow.create_account"),
    );
    await page.getByRole("dialog").press("Escape");
    await page.getByRole("tab", { name: copy(lang, "pepites.player.tab_stats") }).click();
    await expect(page).toHaveURL(/onglet=stats/);
    await expect(page.getByTestId("pepites-player-stats")).toContainText(
      copy(lang, "pepites.stats.minutes"),
    );
    await page.getByTestId("pepites-player-compare").click();
    await expect(page).toHaveURL(/\/pepites\/comparer\?a=/);
    await page.getByTestId("pepites-compare-pick-b").click();
    await page.getByTestId("pepites-compare-option").first().click();
    await expect(page.getByTestId("pepites-compare-card")).toBeVisible();
    await expect(page.getByTestId("pepites-compare-cards")).toBeVisible();
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: desktop ranking and player use the wide layout`, async ({ page }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pepites/classement", lang);
    await expect(page.getByTestId("pepites-desktop-podium")).toBeVisible();
    await expect(page.getByTestId("pepites-desktop-table")).toBeVisible();
    await expect(page.getByTestId("pepites-desktop-filters")).toBeVisible();
    await page.getByTestId("pepites-desktop-table").getByRole("link").first().click();
    await expect(page.getByTestId("pepites-desktop-player-hero")).toBeVisible();
    await expect(page.getByTestId("pepites-desktop-player-body")).toBeVisible();
    await expect(page.getByTestId("pepites-desktop-rating-trend")).toBeVisible();
    await expect(page.getByTestId("pepites-desktop-face-to-face")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("pepites-desktop-player-hero").getByTestId("pepites-back").click();
    await expect(page).toHaveURL(/\/pepites$/);
    await page.getByTestId("pepites-full-ranking").click();
    await page.getByTestId("pepites-ranking-back").last().click();
    await expect(page).toHaveURL(/\/pepites$/);
    await diagnostics.verify(testInfo);
  });
}

test("signed-in Follow can toggle, and +Fantasy carries the mapped player", async ({
  page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await page.setViewportSize({ width: 390, height: 860 });
  await initializeLanguage(page, "fr");
  await gotoHydrated(page, `/auth/login?next=${encodeURIComponent("/pepites")}`, "fr");
  await page.locator('input[type="email"]').fill(DEMO.email);
  await page.locator('input[autocomplete="current-password"]').fill(DEMO.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/pepites");
  const playerPath = await page.getByTestId("pepites-top-entry").first().getAttribute("href");
  expect(playerPath).toMatch(/^\/pepites\/joueur\//);
  await gotoHydrated(page, playerPath!, "fr");
  const follow = page.getByTestId("pepites-follow");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("pepites-back").first().click();
  await expect(page).toHaveURL(/\/pepites$/);
  await page.getByTestId("pepites-full-ranking").click();
  await page.getByTestId("pepites-ranking-followed").click();
  await expect(page.getByTestId("pepites-ranking-row")).toHaveCount(1);
  await expect(page.getByTestId("pepites-ranking-followed")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("pepites-ranking-row").first().click();
  const followAgain = page.getByTestId("pepites-follow");
  await expect(followAgain).toHaveAttribute("aria-pressed", "true");
  await followAgain.click();
  await expect(followAgain).toHaveAttribute("aria-pressed", "false");
  const fantasy = page.getByTestId("pepites-fantasy-link");
  await expect(fantasy).toHaveAttribute("href", /\/fantasy\/transfers\?player=/);
  await fantasy.click();
  await expect(page).toHaveURL(/\/fantasy\/transfers/);
  await expect(page.getByRole("status").filter({ hasText: "Joueur exemple 2" })).toBeVisible();
  await expect(page.getByText(/Joueur entrant: Joueur exemple 2/)).toBeVisible();
  await expect(
    page.getByText("Touchez le joueur du même poste à remplacer.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Reda Jaadi/ }).click();
  await expect(page.getByRole("button", { name: /Suivant/ })).toBeEnabled();
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.getByText("Joueur exemple 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("button", { name: /Joueur exemple 2/ })).toBeVisible();
  await diagnostics.verify(testInfo);
});

test("with Pépites switched off, every page says it is coming and shows no player", async ({
  page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await initializeLanguage(page, "fr");
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__pepitesMock = { closed: true };
  });
  for (const path of [
    "/pepites",
    "/pepites/classement",
    "/pepites/methode",
    "/pepites/semaine/14",
  ]) {
    await gotoHydrated(page, path, "fr");
    await expect(page.getByTestId("pepites-coming-soon")).toBeVisible();
    await expect(page.getByTestId("pepites-top-entry")).toHaveCount(0);
    await expect(page.getByTestId("pepites-ranking-row")).toHaveCount(0);
  }
  await diagnostics.verify(testInfo);
});
