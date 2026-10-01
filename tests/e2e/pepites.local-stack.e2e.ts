import { createHmac } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import { gotoHydrated, initializeLanguage, observePage } from "./support";
import { moroccoParts } from "../../src/lib/morocco-time";

/**
 * Pépites against a LOCAL Supabase stack with real data: the ranking engine's
 * own runs, published through the editions functions
 * (scripts/backend/pepites-local-preview-seed.sql, then
 * scripts/backend/pepites-local-fantasy-seed.sql, optionally
 * scripts/backend/pepites-local-preview-photos.ts). Skipped unless
 * E2E_PEPITES_LOCAL_STACK=1, and run against a development server started
 * with the local stack's URL and keys, the preview switch on and every
 * Pépites, Fantasy, football and sign-in read in `supabase` mode:
 *
 *   E2E_PEPITES_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:4174 \
 *     bunx playwright test tests/e2e/pepites.local-stack.e2e.ts
 *
 * It writes to that local database (the week 7 edition, a preference, a
 * report), so reseed before running it again.
 */

test.skip(process.env.E2E_PEPITES_LOCAL_STACK !== "1", "needs the seeded local stack");
test.describe.configure({ mode: "serial" });

const STAFF = { email: "staff@pepites.local", password: "pepites-preview" };
const FAN = { email: "fan@pepites.local", password: "pepites-preview" };
/** The staff member's TOTP secret in the seed (base32). */
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

const fr = dictionaries.fr;

/**
 * The local stack runs without Supabase's image-resizing service, so the
 * resized photo URLs fail there; production has it. Serve the original file
 * in their place, as the service would a resized copy.
 */
async function withoutLocalResizing(page: Page) {
  await page.route("**/storage/v1/render/image/public/**", (route) =>
    route.continue({
      url: route.request().url().replace("/render/image/", "/object/").split("?")[0],
    }),
  );
}

function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, ""))
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[hash.length - 1]! & 0xf;
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

async function signIn(page: Page, account: { email: string; password: string }, next: string) {
  await gotoHydrated(page, `/auth/login?next=${encodeURIComponent(next)}`, "fr");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[autocomplete="current-password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
}

async function staffPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  await withoutLocalResizing(page);
  await initializeLanguage(page, "fr");
  await signIn(page, STAFF, "/admin/pepites");
  await page.waitForURL(/\/auth\/mfa-challenge/);
  // A fresh window, so the code is not about to expire as it is typed.
  const wait = 30_000 - (Date.now() % 30_000);
  if (wait < 5_000) await page.waitForTimeout(wait + 500);
  await page.locator("#mfa-challenge-code").fill(totp(TOTP_SECRET));
  await page.getByRole("button", { name: fr["auth.mfa_challenge.cta"] }).click();
  await page.waitForURL(/\/admin\/pepites/);
  await gotoHydrated(page, "/admin/pepites", "fr");
  return page;
}

/**
 * "YYYY-MM-DDTHH:mm" in Morocco time, `minutes` from now. Uses the
 * application's own rule: this runner's `Intl` may carry older time-zone data
 * than the page under test (they differ from 2026-09-20).
 */
function casablancaLocal(minutes: number): string {
  const p = moroccoParts(new Date(Date.now() + minutes * 60_000));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}

test("the week 7 draft: edited, late, published; an open page shows it without a reload", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const diagnostics = observePage(page);

  // Staff open the draft, move the second player up and write a line.
  const staff = await staffPage(browser);
  const editor = staff.getByTestId("admin-pepites-editor");
  await expect(editor).toContainText("Semaine 7");
  const entries = editor.getByTestId("admin-pepites-entry");
  await expect(entries).toHaveCount(10);
  const second = (await entries.nth(1).locator("p").first().innerText()).trim();
  await entries.nth(1).getByRole("button", { name: "Monter" }).click();
  await expect(entries.nth(0).locator("p").first()).toHaveText(second);
  await entries
    .nth(0)
    .getByLabel("Ligne en français")
    .fill("Le patron de la défense cette semaine.");
  await entries.nth(0).getByLabel("Ligne en arabe").fill("قائد الدفاع هذا الأسبوع.");
  await staff.getByTestId("admin-pepites-save").click();
  await expect(staff.getByText("C'est fait.")).toBeVisible();
  // Both lines are required for every player (Figma A1): scheduling waits
  // until all twenty are written.
  await expect(staff.getByTestId("admin-pepites-schedule")).toBeDisabled();
  await expect(staff.getByTestId("admin-pepites-schedule-hint")).toContainText("Il manque 18");
  for (let index = 1; index < 10; index += 1) {
    await entries
      .nth(index)
      .getByLabel("Ligne en français")
      .fill(`Ligne ${index + 1}.`);
    await entries
      .nth(index)
      .getByLabel("Ligne en arabe")
      .fill(`السطر ${index + 1}.`);
  }
  await staff.getByTestId("admin-pepites-save").click();
  await expect(staff.getByText("C'est fait.")).toBeVisible();

  // Scheduled three minutes in the past: the edition is late at once.
  await staff.getByTestId("admin-pepites-schedule-at").fill(casablancaLocal(-3));
  await staff.getByTestId("admin-pepites-schedule").click();
  await expect(editor).toContainText("Programmée");
  await expect(staff.getByTestId("admin-pepites-reader-state")).toContainText("en retard");

  // A visitor arrives while it is late: last week's list, and the band.
  await withoutLocalResizing(page);
  await initializeLanguage(page, "fr");
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__pepitesPoll = {
      countdownMs: 1_000,
      delayedMs: 1_000,
      jitter: 0,
    };
  });
  await gotoHydrated(page, "/pepites", "fr");
  await expect(page.getByTestId("pepites-reveal-delayed")).toBeVisible();
  await expect(page.getByTestId("pepites-edition-title")).toHaveText("Top 10 · Semaine 6");
  await expect(page.getByTestId("pepites-top-entry")).toHaveCount(10);
  await page.evaluate(() => {
    (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
  });
  // It keeps checking and stays on week 6 while nothing is published.
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("pepites-reveal-delayed")).toBeVisible();

  // Published now: the open page shows week 7, with the new order and line.
  await staff.getByTestId("admin-pepites-publish").click();
  await staff.getByTestId("admin-pepites-publish-commit").click();
  await expect(editor).toContainText("Publiée");
  await expect(page.getByTestId("pepites-edition-title")).toHaveText("Top 10 · Semaine 7", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("pepites-reveal-delayed")).toHaveCount(0);
  await expect(page.getByTestId("pepites-top-entry").first()).toContainText(second);
  await expect(page.getByTestId("pepites-top-entry").first()).toContainText(
    "Le patron de la défense cette semaine.",
  );
  expect(
    await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
  ).toBe(true);
  await staff.context().close();
  await diagnostics.verify(testInfo);
});

test("a fan turns the weekly email on and reports an error the data desk then lists", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 860 });
  const diagnostics = observePage(page);
  await withoutLocalResizing(page);
  await initializeLanguage(page, "fr");
  await signIn(page, FAN, "/pepites");
  await page.waitForURL((url) => url.pathname === "/pepites");
  const toggle = page.getByTestId("pepites-email-switch");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  const playerPath = await page.getByTestId("pepites-top-entry").first().getAttribute("href");
  expect(playerPath).toMatch(/^\/pepites\/joueur\//);
  await gotoHydrated(page, playerPath!, "fr");
  await expect(page.getByTestId("pepites-player-name")).toBeVisible();
  const name = (await page.getByTestId("pepites-player-name").innerText()).trim();
  const follow = page.getByTestId("pepites-follow");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await gotoHydrated(page, "/pepites/classement?suivis=1", "fr");
  await expect(page.getByTestId("pepites-ranking-row")).toHaveCount(1);
  await gotoHydrated(page, playerPath!, "fr");
  await page.getByRole("tab", { name: fr["pepites.player.tab_stats"] }).click();
  await expect(page.getByTestId("pepites-player-stats")).toContainText(fr["pepites.stats.minutes"]);
  await page.getByTestId("pepites-player-compare").click();
  await page.getByTestId("pepites-compare-pick-b").click();
  await page.getByTestId("pepites-compare-option").first().click();
  await expect(page.getByTestId("pepites-compare-card")).toBeVisible();
  await gotoHydrated(page, playerPath!, "fr");
  await page.getByTestId("pepites-report").click();
  await page.getByLabel(fr["pepites.report.field_label"]).selectOption("height_cm");
  await page.getByTestId("pepites-report-message").fill("Il mesure 1,84 m selon le club.");
  await page.getByTestId("pepites-report-send").click();
  await expect(page.getByText(fr["pepites.report.sent"])).toBeVisible();

  const staff = await staffPage(browser);
  // A stale edition link says why it cannot open, rather than loading forever.
  await staff.goto("/admin/pepites?edition=00000000-0000-4000-8000-000000000000");
  await expect(staff.getByTestId("admin-pepites-editor-error")).toBeVisible();
  await staff.goto("/admin/pepites/donnees");
  const issue = staff.getByTestId("admin-pepites-issue").filter({ hasText: name });
  await expect(issue.first()).toContainText("Il mesure 1,84 m selon le club.");
  await staff.context().close();
  await diagnostics.verify(testInfo);
});

test("+Fantasy replaces the mapped player in the real squad and survives reload", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const diagnostics = observePage(page);
  await initializeLanguage(page, "fr");
  await withoutLocalResizing(page);
  const playerPath = "/pepites/joueur/7e030000-0000-4000-8000-000000000186";
  await signIn(page, FAN, playerPath);
  await page.waitForURL((url) => url.pathname === playerPath);
  const fantasy = page.getByTestId("pepites-fantasy-link");
  await expect(fantasy).toHaveAttribute(
    "href",
    "/fantasy/transfers?player=7e600000-0000-4000-8000-000000000186",
  );
  await fantasy.click();
  await expect(page.getByRole("status").filter({ hasText: "Achraf V." })).toBeVisible();
  await page.getByRole("button", { name: /Othmane F\./ }).click();
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page.getByText("Achraf V.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("button", { name: /Achraf V\./ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Achraf V\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Othmane F\./ })).toHaveCount(0);
  await gotoHydrated(page, playerPath, "fr");
  await page.getByTestId("pepites-fantasy-link").click();
  await expect(page.getByText(fr["fantasy.transfers.incoming_owned"])).toBeVisible();
  await gotoHydrated(page, "/fantasy/transfers?player=00000000-0000-4000-8000-000000000000", "fr");
  await expect(page.getByText(fr["fantasy.transfers.incoming_unavailable"])).toBeVisible();
  await gotoHydrated(page, "/fantasy/transfers?player=7e600000-0000-4000-8000-000000000004", "fr");
  await page.getByRole("button", { name: /Walid I\./ }).click();
  await expect(page.getByText(fr["fpl.club_limit"], { exact: true })).toBeVisible();
  await gotoHydrated(page, "/fantasy/transfers?player=7e600000-0000-4000-8000-000000000188", "fr");
  await page.getByRole("button", { name: /Ismail X\./ }).click();
  await expect(page.getByText(fr["fpl.budget_exceeded"], { exact: true })).toBeVisible();
  await diagnostics.verify(testInfo);
});

test("Fantasy sign-in preserves the incoming player deep link", async ({ page }) => {
  await initializeLanguage(page, "fr");
  const next = "/fantasy/transfers?player=7e600000-0000-4000-8000-000000000186";
  await gotoHydrated(page, next, "fr");
  const login = page.locator('a[href*="/auth/login"]').first();
  await expect(login).toBeVisible();
  const href = await login.getAttribute("href");
  expect(new URL(href!, "http://localhost").searchParams.get("next")).toBe(next);
  await login.click();
  await page.locator('input[type="email"]').fill(FAN.email);
  await page.locator('input[autocomplete="current-password"]').fill(FAN.password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(fr["fantasy.transfers.incoming_owned"])).toBeVisible();
});

test("Compare retries initial and later-page outages without losing its options", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await initializeLanguage(page, "fr");
  let failInitial = true;
  let failLater = true;
  await page.route("**/rest/v1/rpc/pepites_ranking", async (route) => {
    const offset = route.request().postDataJSON().p_offset ?? 0;
    if ((offset === 0 && failInitial) || (offset > 0 && failLater)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "XX000", message: "test outage" }),
      });
    } else await route.continue();
  });
  await gotoHydrated(page, "/pepites/comparer", "fr");
  await page.getByTestId("pepites-compare-pick-a").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("pepites-error")).toBeVisible();
  failInitial = false;
  await sheet.getByRole("button", { name: fr["pepites.state.retry"] }).click();
  await expect(page.getByTestId("pepites-compare-option")).toHaveCount(25);
  await sheet.getByRole("button", { name: fr["pepites.ranking.load_more"] }).click();
  await expect(sheet.getByTestId("pepites-error")).toBeVisible();
  await expect(page.getByTestId("pepites-compare-option")).toHaveCount(25);
  failLater = false;
  await sheet.getByRole("button", { name: fr["pepites.state.retry"] }).click();
  await expect(page.getByTestId("pepites-compare-option")).toHaveCount(50);
  await expect(sheet.getByTestId("pepites-error")).toHaveCount(0);
});

test("Follow read failure shows no placeholder and recovers the existing followed state", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 860 });
  await initializeLanguage(page, "fr");
  const path = "/pepites/joueur/7e030000-0000-4000-8000-000000000186";
  await signIn(page, FAN, path);
  await page.waitForURL((url) => url.pathname === path);
  const follow = page.getByTestId("pepites-follow");
  await expect(follow).toBeEnabled();
  if ((await follow.getAttribute("aria-pressed")) !== "true") await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  let fail = true;
  await page.route("**/rest/v1/rpc/pepites_follow_state", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "XX000", message: "test outage" }),
      });
    else await route.continue();
  });
  await page.reload();
  await expect(page.getByTestId("pepites-follow-retry")).toBeVisible();
  await expect(follow).not.toContainText("{n}");
  await expect(follow).toBeDisabled();
  await expect(follow).not.toHaveAttribute("aria-pressed", "false");
  fail = false;
  await page.getByTestId("pepites-follow-retry").click();
  await expect(follow).toBeEnabled();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pepites-follow-retry")).toHaveCount(0);
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
});
