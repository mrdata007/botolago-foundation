import { expect, test, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import { PRONOSTICS_PROMOTED } from "../../src/lib/feature-flags";
import {
  expectNoHorizontalOverflow,
  expectNothingOffScreen,
  gotoHydrated,
  initializeLanguage,
  observePage,
  reloadHydrated,
} from "./support";

/**
 * BG-0146 — Pronostics, against the mock data a server without a `.env`
 * serves (football, predictions and sign-in all mocked).
 *
 * Journée 14 is current: its first match is live, so locked; the other three
 * are open, the next kicking off two hours after the page loads. Journée 13 is
 * finished (2–0, then 1–2). The fixture ids are the mock match pages' own ids,
 * so a pick is one record wherever it is made.
 */

const LIVE = "00000020-0000-4000-8000-000000000001";
const NEXT = "00000020-0000-4000-8000-000000000002";
const LATER = "00000020-0000-4000-8000-000000000003";
const LAST = "00000020-0000-4000-8000-000000000004";
const FINISHED = "00000020-0000-4000-8000-000000000005";
/** Joins "Les Lions de l'Atlas": `MOCK_INVITE_CODE` in mock-repository.ts. */
const INVITE_CODE = "A1B2C3D4E5F60718293A4B5C6D7E8F90";
/** `MOCK_DEMO_EMAIL` / `MOCK_DEMO_PASSWORD` in auth-mock.ts. */
const DEMO = { email: "demo@botolago.ma", password: "demo1234" };
const GUEST_STORE = "botolago.predictions.guest.v1";

type Language = "fr" | "ar";
type Key = keyof typeof dictionaries.fr;

const copy = (lang: Language, key: Key) => dictionaries[lang][key];
const progress = (lang: Language, done: number, total: number) =>
  copy(lang, "predictions.progress")
    .replace("{done}", String(done))
    .replace("{total}", String(total));

const stepper = (page: Page, fixture: string, side: "home" | "away") =>
  page.getByTestId(`prediction-${fixture}-${side}`);
const valueOf = (page: Page, fixture: string, side: "home" | "away") =>
  page.getByTestId(`prediction-${fixture}-${side}-value`);
// In the DOM − comes before +, whichever way the row is drawn.
const plus = (page: Page, fixture: string, side: "home" | "away") =>
  stepper(page, fixture, side).getByRole("button").last().click();
const minus = (page: Page, fixture: string, side: "home" | "away") =>
  stepper(page, fixture, side).getByRole("button").first().click();

async function guestPickCount(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    const store = raw ? (JSON.parse(raw) as { predictions?: Record<string, unknown> }) : {};
    return Object.keys(store.predictions ?? {}).length;
  }, GUEST_STORE);
}

async function signIn(page: Page, lang: Language, next: string) {
  await gotoHydrated(page, `/auth/login?next=${encodeURIComponent(next)}`, lang);
  await page.locator('input[type="email"]').fill(DEMO.email);
  await page.locator('input[autocomplete="current-password"]').fill(DEMO.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === next.split("?")[0]);
  await expect(page.locator("html")).toHaveAttribute("data-lang", lang);
}

for (const lang of ["fr", "ar"] as const) {
  for (const width of [360, 390, 430] as const) {
    test(`${lang} ${width}: a visitor predicts, and every tab fits the screen`, async ({
      page,
    }, testInfo) => {
      const diagnostics = observePage(page);
      await page.setViewportSize({ width, height: 860 });
      await initializeLanguage(page, lang);
      await gotoHydrated(page, "/pronostics", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expect(page.getByTestId("predictions-round")).toContainText("14");

      // The live match is locked; the three still to play are open.
      await expect(page.getByTestId(`prediction-${LIVE}`)).toBeVisible();
      await expect(stepper(page, LIVE, "home")).toHaveCount(0);
      for (const fixture of [NEXT, LATER, LAST]) {
        await expect(stepper(page, fixture, "home")).toBeVisible();
      }

      // One tap on "+" is a whole prediction: 1–0.
      await expect(valueOf(page, NEXT, "home")).toHaveText("–");
      await plus(page, NEXT, "home");
      await expect(valueOf(page, NEXT, "home")).toHaveText("1");
      await expect(valueOf(page, NEXT, "away")).toHaveText("0");
      await expect(page.getByTestId("predictions-bar")).toContainText(progress(lang, 1, 4));

      // Thumb-sized buttons, and the row reads the page's way: home first.
      for (const button of await stepper(page, NEXT, "home").getByRole("button").all()) {
        const box = await button.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      const home = await stepper(page, NEXT, "home").boundingBox();
      const away = await stepper(page, NEXT, "away").boundingBox();
      expect(home && away && (lang === "ar" ? home.x > away.x : home.x < away.x)).toBe(true);

      await expectNoHorizontalOverflow(page);
      await expectNothingOffScreen(page);
      await expectNothingOffScreen(page, '[data-testid="predictions-bar"]');

      await page.getByRole("tab", { name: copy(lang, "predictions.tab.board") }).click();
      await expect(page).toHaveURL(/tab=classement/);
      // The journée is ranked from its first final whistle; the season, already.
      await expect(page.locator("main")).toContainText(copy(lang, "predictions.board.empty"));
      await page.getByRole("tab", { name: copy(lang, "predictions.board.season") }).click();
      await expect(page.locator("tbody tr").first()).toBeVisible();
      await expectNothingOffScreen(page);

      await page.getByRole("tab", { name: copy(lang, "predictions.tab.leagues") }).click();
      await expect(page).toHaveURL(/tab=ligues/);
      await expect(page.getByTestId("predictions-leagues-signed-out")).toBeVisible();
      await expectNothingOffScreen(page);

      await diagnostics.verify(testInfo);
    });
  }

  test(`${lang}: a visitor's picks stay on the phone, then move to the account at sign-in`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/pronostics", lang);

    await plus(page, NEXT, "home"); // 1–0
    await minus(page, LATER, "home"); // "−" on an empty match: 0–0
    await plus(page, LAST, "away"); // 0–1
    await expect(valueOf(page, LATER, "home")).toHaveText("0");
    await expect(valueOf(page, LAST, "away")).toHaveText("1");
    await expect(page.getByTestId("predictions-bar")).toContainText(progress(lang, 3, 4));
    await expect(page.getByTestId("predictions-bar")).toContainText(
      copy(lang, "predictions.guest.cta_button"),
    );
    // Three picks in: the page suggests an account.
    await expect(page.getByTestId("predictions-guest-cta")).toBeVisible();
    expect(await guestPickCount(page)).toBe(3);

    // Kept across a reload.
    await reloadHydrated(page, lang);
    await expect(valueOf(page, NEXT, "home")).toHaveText("1");
    await expect(valueOf(page, LAST, "away")).toHaveText("1");

    // A finished journée: final scores, nothing to change.
    await page.getByRole("button", { name: copy(lang, "predictions.round.previous") }).click();
    await expect(page).toHaveURL(/journee=13/);
    await expect(page.getByTestId(`prediction-${FINISHED}`)).toContainText(
      copy(lang, "predictions.result.final"),
    );
    await expect(stepper(page, FINISHED, "home")).toHaveCount(0);

    // The rules.
    await page.getByRole("button", { name: copy(lang, "predictions.rules.title") }).click();
    const rules = page.getByRole("dialog");
    await expect(rules).toContainText(copy(lang, "predictions.rules.exact"));
    await expect(rules).toContainText(copy(lang, "predictions.rules.lock"));
    await page.keyboard.press("Escape");
    await expect(rules).toBeHidden();

    // Signing in takes the picks to the account and off the phone.
    await signIn(page, lang, "/pronostics");
    await expect.poll(() => guestPickCount(page)).toBe(0);
    await expect(valueOf(page, NEXT, "home")).toHaveText("1");
    await expect(valueOf(page, LATER, "away")).toHaveText("0");
    await expect(valueOf(page, LAST, "away")).toHaveText("1");
    await expect(page.getByTestId("predictions-guest-cta")).toHaveCount(0);

    await diagnostics.verify(testInfo);
  });

  test(`${lang}: a signed-in player's change is saved to the account`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await signIn(page, lang, "/pronostics");

    await plus(page, NEXT, "away");
    await plus(page, NEXT, "away"); // 0–2
    const bar = page.getByTestId("predictions-bar");
    await expect(bar).toContainText(copy(lang, "predictions.save.saved"));
    await expect(bar).toContainText(progress(lang, 1, 4));

    await reloadHydrated(page, lang);
    await expect(valueOf(page, NEXT, "home")).toHaveText("0");
    await expect(valueOf(page, NEXT, "away")).toHaveText("2");
    expect(await guestPickCount(page)).toBe(0);

    // The mock account arrives with journée 13 predicted: 2–0 was exact, 0–1
    // for a 1–2 had the winner. The share text counts it, "6/8" kept whole.
    await page.getByRole("button", { name: copy(lang, "predictions.round.previous") }).click();
    await expect(page.getByTestId(`prediction-${FINISHED}`)).toContainText("+3");
    await page.getByRole("button", { name: copy(lang, "predictions.share.title") }).click();
    await expect(page.getByRole("dialog")).toContainText(
      copy(lang, "predictions.share.after_exact_one")
        .replace("{n}", "⁨13⁩")
        .replace("{score}", "⁨2/2⁩"),
    );

    await diagnostics.verify(testInfo);
  });

  test(`${lang}: join a league by code, leave it, create one and open its invite link`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await signIn(page, lang, "/pronostics?tab=ligues");

    // Typed the way people type a code: lower case, with a space.
    await page
      .getByTestId("predictions-join-code")
      .fill(`${INVITE_CODE.slice(0, 8).toLowerCase()} ${INVITE_CODE.slice(8)}`);
    await page
      .getByRole("button", { name: copy(lang, "predictions.leagues.join_button"), exact: true })
      .click();
    await page.waitForURL(/\/pronostics\/ligues\/[0-9a-f-]{36}$/);
    const standings = page.getByTestId("predictions-league-standings");
    await expect(standings).toContainText(copy(lang, "predictions.board.empty"));
    await standings.getByRole("tab", { name: copy(lang, "predictions.board.season") }).click();
    await expect(standings.locator("tbody tr").first()).toBeVisible();
    await expectNothingOffScreen(page);

    await page.getByRole("button", { name: copy(lang, "predictions.leagues.leave") }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: copy(lang, "predictions.leagues.leave") })
      .click();
    await page.waitForURL(/tab=ligues/);

    // A new league shows its code once, with the link to share.
    await page.getByTestId("predictions-create-name").fill("Les Amis du Derby");
    await page
      .getByRole("button", { name: copy(lang, "predictions.leagues.create_button"), exact: true })
      .click();
    const code = (await page.getByTestId("predictions-invite-code").innerText()).trim();
    expect(code).toMatch(/^[0-9A-F]{32}$/);
    await expect(page.getByTestId("predictions-invite-share")).toBeVisible();
    await expectNothingOffScreen(page);

    // The link keeps the code after "#", and the page takes it out of sight.
    await page.goto(`/pronostics/ligues/rejoindre#code=${code}`);
    await page.waitForURL(/\/pronostics\/ligues\/[0-9a-f-]{36}$/);
    expect(page.url()).not.toContain("#");
    await expect(page.getByTestId("predictions-league-standings")).toBeVisible();

    await diagnostics.verify(testInfo);
  });

  test(`${lang}: an invite link opened before signing up keeps the code for this tab only`, async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, lang);
    await page.goto(`/pronostics/ligues/rejoindre#code=${INVITE_CODE}`);
    await expect(page.locator("html")).toHaveAttribute("data-lang", lang);
    await expect(page.getByTestId("predictions-invite")).toContainText(
      copy(lang, "predictions.leagues.invite_signup"),
    );
    expect(new URL(page.url()).hash).toBe("");
    expect(
      await page.evaluate(() => window.sessionStorage.getItem("botolago.predictions.invite")),
    ).toBe(INVITE_CODE);
    await expectNothingOffScreen(page);

    await diagnostics.verify(testInfo);
  });
}

test("with the game switched off, the page says it is coming and takes no pick", async ({
  page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await page.setViewportSize({ width: 390, height: 860 });
  await initializeLanguage(page, "fr");
  // The mock's switch lives in this tab, out of the server render's sight, so
  // the journée is reached the way a tap reaches it: in the browser.
  await gotoHydrated(page, "/pronostics?journee=13", "fr");
  await page.evaluate(() => window.sessionStorage.setItem("botolago.e2e.predictions-mode", "off"));
  await page.getByRole("button", { name: copy("fr", "predictions.round.next") }).click();
  await expect(page).toHaveURL(/journee=14/);
  await expect(page.getByTestId("predictions-coming-soon")).toContainText(
    copy("fr", "predictions.state.coming_soon"),
  );
  await expect(page.locator('[data-testid^="prediction-"]')).toHaveCount(0);

  await diagnostics.verify(testInfo);
});

test.describe("before promotion", () => {
  test.skip(PRONOSTICS_PROMOTED, "PRONOSTICS_PROMOTED is on: the entry points are meant to show");

  test("no entry point leads to the game, and the page is not indexed", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 860 });
    await initializeLanguage(page, "fr");

    await gotoHydrated(page, "/", "fr");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId("home-predictions-card")).toHaveCount(0);
    await expect(page.locator('a[href^="/pronostics"]')).toHaveCount(0);

    await gotoHydrated(page, "/matches", "fr");
    await expect(page.getByRole("tab").first()).toBeVisible();
    await expect(
      page.getByRole("tab", { name: copy("fr", "matches.tab.predictions") }),
    ).toHaveCount(0);

    await gotoHydrated(page, `/matches/${NEXT}`, "fr");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId("match-prediction")).toHaveCount(0);

    await gotoHydrated(page, "/pronostics", "fr");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

    await diagnostics.verify(testInfo);
  });
});

test.describe("entry points, once promoted", () => {
  test.skip(!PRONOSTICS_PROMOTED, "PRONOSTICS_PROMOTED is off: the entry points are hidden");

  for (const lang of ["fr", "ar"] as const) {
    test(`${lang}: Home, Matches and the match page lead to the same prediction`, async ({
      page,
    }, testInfo) => {
      const diagnostics = observePage(page);
      await page.setViewportSize({ width: 390, height: 860 });
      await initializeLanguage(page, lang);

      await gotoHydrated(page, "/", lang);
      await expect(page.getByTestId("home-predictions-card")).toBeVisible();
      await expectNothingOffScreen(page);

      await gotoHydrated(page, "/matches", lang);
      await page.getByRole("tab", { name: copy(lang, "matches.tab.predictions") }).click();
      await page.waitForURL(/\/pronostics/);
      await expect(page.getByTestId("predictions-round")).toBeVisible();

      // A pick on the match page is the pick on /pronostics.
      await gotoHydrated(page, `/matches/${NEXT}`, lang);
      const card = page.getByTestId("match-prediction");
      await expect(card).toBeVisible();
      await card.getByTestId(`prediction-${NEXT}-home`).getByRole("button").last().click();
      await expect(card.getByTestId(`prediction-${NEXT}-home-value`)).toHaveText("1");
      await expectNothingOffScreen(page);
      await gotoHydrated(page, "/pronostics?journee=14", lang);
      await expect(valueOf(page, NEXT, "home")).toHaveText("1");

      await diagnostics.verify(testInfo);
    });
  }
});
