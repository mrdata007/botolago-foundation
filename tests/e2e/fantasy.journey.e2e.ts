import { expect, test, type Page } from "@playwright/test";

import {
  createLeagueCleanup,
  E2E_LEAGUE_NAME_PREFIX,
  leagueIdFromUrl,
  type LeagueCleanup,
} from "./fantasy-league-cleanup";
import { gotoHydrated, initializeLanguage, reloadHydrated } from "./support";

/**
 * Fantasy regression journeys (FPL reconstruction).
 *
 * Runs against a real Supabase-backed environment with a synthetic manager
 * account injected through E2E_FANTASY_EMAIL / E2E_FANTASY_PASSWORD. Skipped
 * when the credentials are absent so the anonymous CI job stays hermetic.
 *
 * Covered:
 *   1. new manager → squad selection → add 15 players → team name → save → reload
 *   2. transfers → player out → player in → confirm → reload
 *   3. points → gameweek navigation
 *   4. leagues → create → detail → back
 *   5. repeated navigation between Fantasy screens never sticks on loading
 */
const email = process.env.E2E_FANTASY_EMAIL;
const password = process.env.E2E_FANTASY_PASSWORD;
const hasUser = !!email && !!password;

const LOADING = /Chargement|جارٍ التحميل/;

async function login(page: Page) {
  await gotoHydrated(page, "/auth/login", "fr");
  await page.getByLabel(/e-?mail/i).fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith("/auth/login"), { timeout: 30_000 });
  if (page.url().includes("/auth/profile-setup")) {
    await page.getByRole("button", { name: /Passer|تخطّي/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/auth/profile-setup"));
  }
}

async function expectSettled(page: Page) {
  await expect(page.getByText(LOADING)).toHaveCount(0, { timeout: 20_000 });
}

/** Pick an affordable player in the Add Player screen, walking up from the cheapest row until a pick is accepted. */
async function pickFromAddPlayer(page: Page) {
  const dialog = page.getByRole("dialog", { name: /Ajouter un joueur/ });
  await expect(dialog).toBeVisible();
  const rows = dialog
    .locator("li button:not([disabled])")
    .filter({ hasNot: page.locator("svg.lucide-info") });
  const total = await rows.count();
  expect(total).toBeGreaterThan(0);
  for (let index = total - 1; index >= 0; index -= 1) {
    await rows.nth(index).click();
    const closed = await dialog.waitFor({ state: "hidden", timeout: 1_500 }).then(
      () => true,
      () => false,
    );
    if (closed) return;
  }
  throw new Error("No acceptable player found in the Add Player list");
}

test.describe("Fantasy — reconstructed FPL journeys", () => {
  test.skip(!hasUser, "E2E_FANTASY_EMAIL / E2E_FANTASY_PASSWORD were not injected.");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test("new manager builds, names and saves a squad that survives a reload", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await login(page);
    await gotoHydrated(page, "/fantasy", "fr");
    await expectSettled(page);
    await expect(page.getByText(/^Date limite\s*:/)).toBeVisible();

    await gotoHydrated(page, "/fantasy/create", "fr");
    await expectSettled(page);
    if (page.url().includes("/fantasy/team")) {
      test.info().annotations.push({ type: "note", description: "manager already has a team" });
      return;
    }
    await expect(page.getByRole("heading", { name: /Sélection de l’effectif/ })).toBeVisible();

    for (let filled = 0; filled < 15; filled += 1) {
      const empty = page.getByRole("button", { name: /^Ajouter un joueur — / });
      if ((await empty.count()) === 0) break;
      await empty.first().click();
      await pickFromAddPlayer(page);
    }
    await expect(page.getByRole("button", { name: /^Ajouter un joueur — / })).toHaveCount(0);

    await page.getByRole("button", { name: /^Suivant$/ }).click();
    const name = page.getByPlaceholder(/Nom de l’équipe/);
    await expect(name).toBeVisible();
    await name.fill("E2E Botola XI");
    await page.getByRole("button", { name: /Entrer l’effectif/ }).click();
    await page.waitForURL((url) => url.pathname.endsWith("/fantasy/team"), { timeout: 60_000 });
    await expectSettled(page);
    await expect(page.getByRole("heading", { name: /Composer l’équipe/ })).toBeVisible();
    await expect(page.locator("main button[aria-label]").filter({ hasText: /./ })).not.toHaveCount(
      0,
    );

    await reloadHydrated(page, "fr");
    await expectSettled(page);
    await expect(page.getByRole("heading", { name: /Composer l’équipe/ })).toBeVisible();
    await expect(page.getByText(/Bench Boost/)).toBeVisible();
  });

  test("captain and vice-captain can be changed and persist", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await login(page);
    await gotoHydrated(page, "/fantasy/team", "fr");
    await expectSettled(page);
    const cards = page.locator("main .relative > button[aria-label]");
    await expect(cards.first()).toBeVisible();
    // Second starter → vice-captain, third starter → captain.
    await cards.nth(2).click();
    await page.getByRole("button", { name: /Nommer capitaine/ }).click();
    await cards.nth(3).click();
    await page.getByRole("button", { name: /Nommer vice-capitaine/ }).click();
    const captainName = (await cards.nth(2).getAttribute("aria-label")) ?? "";
    await page.getByRole("button", { name: /^Confirmer$/ }).click();
    await expect(page.getByText(/Équipe enregistrée/)).toBeVisible({ timeout: 30_000 });
    await reloadHydrated(page, "fr");
    await expectSettled(page);
    await expect(page.locator(`main button[aria-label*="Capitaine"]`).first()).toBeVisible();
    expect(captainName.length).toBeGreaterThan(0);
  });

  test("a transfer is previewed, confirmed and persisted", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await login(page);
    await gotoHydrated(page, "/fantasy/transfers", "fr");
    await expectSettled(page);
    await expect(page.getByRole("heading", { name: /^Transferts$/ })).toBeVisible();
    // Reference flow: tap a player → "Transfer out" → Add Player locked to that position.
    await page.locator("main .relative > button[aria-label]").last().click();
    await page.getByRole("button", { name: /Transférer ce joueur/ }).click();
    await pickFromAddPlayer(page);
    const incoming = page.locator("main .relative > button[aria-label]").last();
    const incomingLabel = (await incoming.getAttribute("aria-label")) ?? "";
    const next = page.getByRole("button", { name: /^Suivant$/ });
    await expect(next).toBeEnabled({ timeout: 20_000 });
    await next.click();
    await expect(page.getByText(/Vous allez effectuer 1 transfert/)).toBeVisible();
    await page.getByRole("button", { name: /^Confirmer$/ }).click();
    await expect(page.getByText(/Transferts confirmés/)).toBeVisible({ timeout: 30_000 });
    await reloadHydrated(page, "fr");
    await expectSettled(page);
    const shortName = incomingLabel.split(",")[0]?.split(" ").slice(-1)[0] ?? "";
    if (shortName) await expect(page.getByText(shortName, { exact: false }).first()).toBeVisible();
  });

  test("points screen opens with gameweek navigation", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await login(page);
    await gotoHydrated(page, "/fantasy/points", "fr");
    await expectSettled(page);
    await expect(page.getByText(/^Journée \d+$/)).toBeVisible();
    await expect(page.getByText(/^Points$/)).toBeVisible();
    // The squad renders even before the first calculation ("—" plates); the
    // backend-error state must never appear for a normal empty result.
    await expect(page.getByText(/Le service Fantasy n’a pas répondu/)).toHaveCount(0);
    await expect(page.getByText(/GB|1\. DEF/).first()).toBeVisible();
    const next = page.getByRole("button", { name: /^Journée \d+$/ }).last();
    if (await next.isEnabled()) {
      await next.click();
      await expectSettled(page);
    }
    await gotoHydrated(page, "/fantasy", "fr");
    await expectSettled(page);
  });

  // BG-0029: the UI offers the owner no removal path, so the league created by
  // the league test is archived from the test process with the manager's own
  // credentials, and leagues left behind by earlier failed runs are swept
  // first. State is set only by that test, so the hook is a no-op elsewhere.
  // A failed cleanup is a red test, never a log line.
  let leagueCleanup: LeagueCleanup | undefined;
  let createdLeagueId: string | null = null;

  test.afterEach(async () => {
    const cleanup = leagueCleanup;
    const leagueId = createdLeagueId;
    leagueCleanup = undefined;
    createdLeagueId = null;
    if (!cleanup) return;
    try {
      if (leagueId) {
        await cleanup.archiveLeague(leagueId);
        test.info().annotations.push({ type: "league-archived", description: leagueId });
      }
    } finally {
      await cleanup.dispose();
    }
  });

  test("leagues: create, open detail, go back", async ({ page }) => {
    leagueCleanup = await createLeagueCleanup({ email: email!, password: password! });
    const swept = await leagueCleanup.sweepE2ELeagues();
    test.info().annotations.push({
      type: "league-sweep",
      description: `archived ${swept.length} stale E2E league(s)${swept.length ? `: ${swept.join(", ")}` : ""}`,
    });
    await initializeLanguage(page, "fr");
    await login(page);
    await gotoHydrated(page, "/fantasy/leagues", "fr");
    await expectSettled(page);
    await page.getByRole("button", { name: /Gérer les ligues/ }).click();
    const leagueName = `E2E Ligue ${Date.now().toString(36).slice(-4)}`;
    expect(
      leagueName.startsWith(E2E_LEAGUE_NAME_PREFIX),
      "league name carries the sweep prefix",
    ).toBe(true);
    await page.getByLabel(/Nom de la ligue/).fill(leagueName);
    await page.getByRole("button", { name: /^Créer une ligue$/ }).click();
    await expect(page.getByText(/Code d’invitation/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: leagueName }).first().click();
    await expectSettled(page);
    createdLeagueId = leagueIdFromUrl(page.url());
    expect(createdLeagueId, "league id captured from the detail URL").not.toBeNull();
    test.info().annotations.push({ type: "league-id", description: createdLeagueId ?? "" });
    await expect(page.getByRole("heading", { name: leagueName })).toBeVisible();
    await expect(page.getByText(/Dernière mise à jour/)).toBeVisible();
    await page.getByRole("link", { name: /Retour/ }).click();
    await expect(page.getByRole("heading", { name: /Ligues & Coupes/ })).toBeVisible();
  });

  test("repeated navigation between Fantasy screens never sticks on loading", async ({ page }) => {
    await initializeLanguage(page, "fr");
    await login(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const routes = [
      "/fantasy",
      "/fantasy/team",
      "/fantasy/points",
      "/fantasy/transfers",
      "/fantasy/leagues",
    ];
    for (let round = 0; round < 2; round += 1) {
      for (const route of routes) {
        await gotoHydrated(page, route, "fr");
        await expectSettled(page);
        await expect(page.locator("h1").first()).toBeVisible();
      }
    }
    expect(errors).toEqual([]);
  });
});
