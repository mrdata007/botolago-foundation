import { expect, test, type Locator, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import { initializeLanguage, observePage } from "./support";

/**
 * A fresh account, rather than the completed demo account used by the Curva suite.
 * Run against an isolated development server with the mock data modes and
 * VITE_MANAGER_CARD_PREVIEW=1; no real accounts or database writes are involved.
 */
test.skip(process.env.E2E_CURVA_PREVIEW !== "1", "requires the Curva mock preview server");

const evidence = "docs/review/evidence/2026-10-20-signup-curva";

async function tokenFace(token: Locator): Promise<string[]> {
  return token
    .locator('linearGradient[id*="-face-"] stop')
    .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("stop-color") ?? ""));
}

async function registerAndVerify(page: Page, lang: "fr" | "ar") {
  const copy = dictionaries[lang];
  await expect(page.locator("html")).toHaveAttribute("data-lang", lang);
  // French is also the server's language. Wait for the submit handler before typing.
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form && Object.keys(form).some((key) => key.startsWith("__reactProps$"));
  });
  await page.getByLabel(copy["auth.register.full_name"], { exact: true }).fill("Karim Test");
  await page.getByLabel(copy["auth.register.username"], { exact: true }).fill("karim_signup");
  await page.getByLabel(copy["auth.email"], { exact: true }).fill("karim-signup@example.test");
  await page.getByLabel(copy["auth.password"], { exact: true }).fill("CardSignup2026!");
  await page
    .getByLabel(copy["auth.register.confirm_password"], { exact: true })
    .fill("CardSignup2026!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: copy["auth.register.cta"], exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/verify/);
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form && Object.keys(form).some((key) => key.startsWith("__reactProps$"));
  });
  await page.locator("#verify-code").fill("123456");
  await page.getByRole("button", { name: copy["auth.verify.cta"], exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/profile-setup/);
  await expect(page.locator("#displayName")).toHaveValue("Karim Test");
}

for (const lang of ["fr", "ar"] as const) {
  for (const width of [390, 1440]) {
    test(`${lang} ${width}: first signup recolours the card, keeps the preferred team, and leaves Curva`, async ({
      page,
    }, info) => {
      test.setTimeout(90_000);
      const diagnostics = observePage(page);
      const copy = dictionaries[lang];
      await page.setViewportSize({ width, height: 900 });
      await initializeLanguage(page, lang);
      await page.addInitScript(() => {
        // The local Fantasy adapter otherwise starts with a complete sample squad.
        localStorage.setItem("botolago.fantasy.team", JSON.stringify({ squad: [] }));
        localStorage.setItem("botolago.theme", "light");
      });
      await page.goto("/auth/register?next=%2Ffantasy%2Fcreate");
      await registerAndVerify(page, lang);
      const token = page.getByTestId("auth-card-row").locator(".mc-token");
      await expect(token).toHaveAttribute("data-mc-ready", "1");
      const neutral = await tokenFace(token);
      expect(neutral.length).toBeGreaterThan(0);
      await page.getByRole("button", { name: copy["auth.setup.next"], exact: true }).click();

      const wydad = page
        .locator("button[data-club]")
        .filter({ hasText: lang === "fr" ? "Wydad" : "الوداد" });
      const raja = page
        .locator("button[data-club]")
        .filter({ hasText: lang === "fr" ? "Raja" : "الرجاء" });
      await wydad.click();
      await expect(wydad).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => tokenFace(token)).not.toEqual(neutral);
      const red = await tokenFace(token);
      await raja.click();
      await expect(raja).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => tokenFace(token)).not.toEqual(red);
      const green = await tokenFace(token);
      expect(green).not.toEqual(neutral);
      // Skipping the club removes the choice and restores the neutral preview.
      await page.getByRole("button", { name: copy["auth.setup.skip"], exact: true }).last().click();
      await page.getByRole("button", { name: copy["auth.setup.previous"], exact: true }).click();
      await expect.poll(() => tokenFace(token)).toEqual(neutral);
      await expect(page.locator('button[data-club][aria-pressed="true"]')).toHaveCount(0);
      await raja.click();
      await expect.poll(() => tokenFace(token)).toEqual(green);
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await page.screenshot({
        path: `${evidence}/after-setup-${lang}-${width}.png`,
        fullPage: true,
      });

      await page.getByRole("button", { name: copy["auth.setup.next"], exact: true }).click();
      await page.getByRole("button", { name: copy["auth.setup.finish"], exact: true }).click();
      await expect(page).toHaveURL(/\/fantasy\/create/);
      const favoriteClubId = await page.evaluate(() => {
        const users = JSON.parse(localStorage.getItem("botolago.auth.users") ?? "[]");
        return users.find((user: { username: string }) => user.username === "karim_signup")
          ?.favoriteClubId;
      });
      expect(favoriteClubId).toBeTruthy();

      // Follow the app's own navigation after signup, without reloading or reseeding auth.
      await page
        .getByRole("navigation", { name: copy["nav.primary"] })
        .getByRole("link", { name: copy["nav.curva"], exact: true })
        .click();
      await expect(page.getByTestId("curva-no-team")).toBeVisible();
      const card = page.getByTestId("curva-stage").locator(".mc-shield").first();
      await expect(card).toBeVisible();
      await expect(card).toContainText(lang === "fr" ? "Raja" : "الرجاء");
      const preferredFace = await card.evaluate((node) =>
        (node as HTMLElement).style.getPropertyValue("--sh-face"),
      );
      expect(preferredFace).toBeTruthy();
      const tryOn = page.getByTestId("curva-try-on");
      await expect(
        tryOn.getByRole("button", { name: lang === "fr" ? /Raja/ : /الرجاء/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await tryOn.getByRole("button", { name: lang === "fr" ? /Wydad/ : /الوداد/ }).click();
      await expect
        .poll(() =>
          card.evaluate((node) => (node as HTMLElement).style.getPropertyValue("--sh-face")),
        )
        .not.toBe(preferredFace);
      // Trying a different club never overwrites the favourite saved at signup.
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-lang", lang);
      await expect(card).toBeVisible();
      await expect
        .poll(() =>
          card.evaluate((node) => (node as HTMLElement).style.getPropertyValue("--sh-face")),
        )
        .toBe(preferredFace);
      await expect(
        tryOn.getByRole("button", { name: lang === "fr" ? /Raja/ : /الرجاء/ }),
      ).toHaveAttribute("aria-pressed", "true");
      const exit = page.getByTestId("curva-continue");
      await expect(exit).toBeVisible();
      await expect(exit).toHaveAttribute("href", "/");
      await exit.scrollIntoViewIfNeeded();
      const box = await exit.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await page.screenshot({ path: `${evidence}/after-curva-${lang}-${width}.png` });
      const outside = await page
        .locator("main a, main button, main h1, main h2, [data-testid='curva-stage']")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return (
                rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1)
              );
            })
            .map((node) => node.textContent?.trim().slice(0, 80)),
        );
      expect(outside, "card, controls and headings stay inside the viewport").toEqual([]);
      await exit.click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId("curva-no-team")).toHaveCount(0);
      await diagnostics.verify(info);
    });
  }

  test(`${lang} 390: signing up from Curva returns to the preferred card and continues home`, async ({
    page,
  }, info) => {
    const copy = dictionaries[lang];
    const diagnostics = observePage(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await initializeLanguage(page, lang);
    await page.addInitScript(() => {
      localStorage.setItem("botolago.fantasy.team", JSON.stringify({ squad: [] }));
    });
    await page.goto("/curva");
    const signup = page.getByTestId("curva-lock-register");
    await expect(signup).toHaveAttribute("href", "/auth/register?next=%2Fcurva");
    await signup.click();
    await registerAndVerify(page, lang);
    await page.getByRole("button", { name: copy["auth.setup.next"], exact: true }).click();
    const wydad = page
      .locator("button[data-club]")
      .filter({ hasText: lang === "fr" ? "Wydad" : "الوداد" });
    await wydad.click();
    await page.getByRole("button", { name: copy["auth.setup.next"], exact: true }).click();
    await page.getByRole("button", { name: copy["auth.setup.finish"], exact: true }).click();
    await expect(page).toHaveURL(/\/curva$/);
    const hero = page.getByTestId("curva-no-team");
    await expect(hero).toBeVisible();
    await expect(hero.locator(".mc-shield").first()).toContainText(
      lang === "fr" ? "Wydad" : "الوداد",
    );
    await expect(
      page
        .getByTestId("curva-try-on")
        .getByRole("button", { name: lang === "fr" ? /Wydad/ : /الوداد/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("curva-continue").click();
    await expect(page).toHaveURL(/\/$/);
    await diagnostics.verify(info);
  });
}
