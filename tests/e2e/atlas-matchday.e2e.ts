import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  gotoHydrated,
  initializeLanguage,
  observePage,
  reloadHydrated,
} from "./support";

async function signInToCreate(page: import("@playwright/test").Page, language: "fr" | "ar") {
  await gotoHydrated(page, "/fantasy/create", language);
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Ffantasy%2Fcreate/);
  await page.getByLabel(/e-?mail|البريد/i).fill("demo@botolago.ma");
  await page.locator('input[type="password"]').fill("demo1234");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/fantasy\/create\/?$/);
}

test("Atlas Matchday mobile onboarding persists, creates, then opens team management", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const diagnostics = observePage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await initializeLanguage(page, "fr");
  await signInToCreate(page, "fr");

  await page.getByLabel("Nom de l'équipe").fill("Atlas Mobile QA");
  await page.getByRole("checkbox").check();
  await reloadHydrated(page, "fr");
  await expect(page.getByLabel("Nom de l'équipe")).toHaveValue("Atlas Mobile QA");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.getByAltText("BotolaGO").last()).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();

  for (let index = 0; index < 15; index += 1) {
    await page
      .getByRole("button", { name: /^Ajouter / })
      .first()
      .click();
    const selectable = page
      .locator('[data-testid="atlas-player-row"][data-player-selectable="true"]')
      .first();
    await expect(selectable).toBeVisible();
    await selectable.click();
    await page.getByTestId("atlas-player-add").click();
  }
  await expect(page.getByText("15 / 15")).toBeVisible();
  await page.getByRole("button", { name: "Vérifier l'équipe" }).click();
  await expect(page).toHaveURL(/\/fantasy\/create\/review$/);
  await page.getByRole("button", { name: "Créer mon équipe" }).click();

  const success = page.getByTestId("atlas-creation-success");
  await expect(success).toBeVisible();
  await expect(success.getByText("Atlas Mobile QA")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("botolago.fantasy.team");
        if (!raw) return 0;
        return (JSON.parse(raw) as { squad?: unknown[] }).squad?.length ?? 0;
      }),
    )
    .toBe(15);
  await success.getByRole("button", { name: "Voir mon équipe" }).click();
  await expect(page).toHaveURL(/\/fantasy\/team$/);
  await expect(page.getByText("Atlas Mobile QA")).toBeVisible();

  await page.getByRole("button", { name: "Modifier la composition" }).click();
  await page.getByRole("button", { name: /Formation.*4-4-2/ }).click();
  await page.getByRole("button", { name: "3-4-3", exact: true }).click();
  await expect(page.getByRole("button", { name: /Formation.*3-4-3/ })).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("button", { name: /Formation.*4-4-2/ })).toBeVisible();

  await page.goto("/fantasy/transfers");
  await expect(page.getByRole("heading", { name: "Transferts" })).toBeVisible();
  await page.getByRole("button", { name: "Transferts", exact: true }).first().click();
  const transferCandidate = page
    .locator('[data-testid="atlas-player-row"][data-player-selectable="true"]')
    .first();
  await expect(transferCandidate).toBeVisible();
  await transferCandidate.click();
  await page.getByTestId("atlas-player-add").click();
  const reviewTransfers = page.getByRole("button", { name: "Vérifier", exact: true });
  await expect(reviewTransfers).toBeEnabled();
  await reviewTransfers.click();
  await expect(page.getByRole("heading", { name: "Résumé des transferts" })).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Résumé des transferts" })).toHaveCount(0);
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).first().click();
  await expect(reviewTransfers).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await diagnostics.verify(testInfo);
});

test("Atlas identity and recurring routes preserve Arabic RTL at desktop width", async ({
  page,
}, testInfo) => {
  const diagnostics = observePage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await initializeLanguage(page, "ar");
  await signInToCreate(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByAltText("BotolaGO").last()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await diagnostics.verify(testInfo);
});
