import { expect, test } from "@playwright/test";
import {
  expectHealthyDocument,
  expectInteractiveControlsInsideViewport,
  initializeLanguage,
  isDeepFunctionalProject,
  observePage,
  projectLanguage,
} from "./support";

test("first launch keeps background controls inert and persists the selected language", async ({
  page,
}, testInfo) => {
  test.skip(
    !isDeepFunctionalProject(testInfo),
    "Deep first-launch behavior runs in mobile French.",
  );
  const diagnostics = observePage(page);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/");
  await expect(page.getByRole("status")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: /Choisissez votre langue/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Français/i })).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: /Continuer/i })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^Français/i })).toBeFocused();

  await page.getByRole("button", { name: /^العربية/i }).click();
  await page.getByRole("button", { name: /متابعة/i }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectHealthyDocument(page);
  await diagnostics.verify(testInfo);
});

test("welcome paths, language switch, guest conversion, and primary navigation work", async ({
  page,
}, testInfo) => {
  test.skip(!isDeepFunctionalProject(testInfo), "Deep welcome behavior runs in mobile French.");
  const diagnostics = observePage(page);
  await initializeLanguage(page, "fr");
  await page.addInitScript(() => {
    window.localStorage.removeItem("botolago.welcomed");
    window.localStorage.removeItem("botolago.auth.session");
  });
  await page.goto("/");

  await expect(page.getByRole("button", { name: /continuer.*invité/i })).toBeVisible();
  await page.getByRole("button", { name: /continuer.*invité/i }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Accueil/i })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("link", { name: /Actualités/i }).click();
  await expect(page).toHaveURL(/\/news$/);
  await page.getByRole("link", { name: /Matches/i }).click();
  await expect(page).toHaveURL(/\/matches\/?$/);
  await page.getByRole("link", { name: /Profil/i }).click();
  await expect(page).toHaveURL(/\/profile$/);

  const switcher = page.getByRole("button", { name: /^Langue$/i });
  await switcher.click();
  await expect(page.getByRole("menuitem", { name: /العربية/i })).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectHealthyDocument(page);
  await expectInteractiveControlsInsideViewport(page);
  await diagnostics.verify(testInfo);
});

test("all configured projects expose the requested locale and direction", async ({
  page,
}, testInfo) => {
  const language = projectLanguage(testInfo);
  const diagnostics = observePage(page);
  await initializeLanguage(page, language);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
  await expectHealthyDocument(page);
  await diagnostics.verify(testInfo);
});
