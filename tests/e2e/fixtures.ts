import { expect, test as base, type Page } from "@playwright/test";
import { gotoHydrated, initializeLanguage, projectLanguage } from "./support";

type Language = "fr" | "ar";

type FrontendFixtures = {
  language: Language;
  anonymousPage: Page;
  guestPage: Page;
  authenticatedPage: Page;
};

async function initializeSession(page: Page, language: Language, kind: "anonymous" | "guest") {
  await initializeLanguage(page, language);
  await page.addInitScript((sessionKind) => {
    if (window.localStorage.getItem("botolago.e2e.session-initialized") === "1") return;
    window.localStorage.removeItem("botolago.auth.session");
    window.localStorage.removeItem("botolago.auth.guest");
    if (sessionKind === "guest") {
      window.localStorage.setItem(
        "botolago.auth.session",
        JSON.stringify({ kind: "guest", createdAt: "2026-01-01T00:00:00.000Z" }),
      );
      window.localStorage.setItem("botolago.auth.guest", "1");
    }
    window.localStorage.setItem("botolago.e2e.session-initialized", "1");
  }, kind);
}

export const test = base.extend<FrontendFixtures>({
  language: async ({}, use, testInfo) => {
    await use(projectLanguage(testInfo));
  },
  anonymousPage: async ({ page, language }, use) => {
    await initializeSession(page, language, "anonymous");
    await use(page);
  },
  guestPage: async ({ page, language }, use) => {
    await initializeSession(page, language, "guest");
    await use(page);
  },
  authenticatedPage: async ({ page, language }, use) => {
    await initializeSession(page, language, "anonymous");
    await gotoHydrated(page, "/auth/login", language);
    await expect(page.getByText(/demo@botolago\.ma/i)).toBeVisible({ timeout: 5_000 });
    await page.getByLabel(/e-?mail|البريد/i).fill("demo@botolago.ma");
    await page.locator('input[autocomplete="current-password"]').fill("demo1234");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith("/auth/login"));
    await use(page);
  },
});

export { expect } from "@playwright/test";
