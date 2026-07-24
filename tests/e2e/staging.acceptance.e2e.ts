import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  gotoHydrated,
  initializeLanguage,
  observePage,
  reloadHydrated,
} from "./support";

const firstEmail = process.env.E2E_STAGING_FIRST_EMAIL;
const firstPassword = process.env.E2E_STAGING_FIRST_PASSWORD;
const secondEmail = process.env.E2E_STAGING_SECOND_EMAIL;
const secondPassword = process.env.E2E_STAGING_SECOND_PASSWORD;
const hasStagingUsers = !!firstEmail && !!firstPassword && !!secondEmail && !!secondPassword;

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  language: "fr" | "ar",
) {
  await gotoHydrated(page, "/auth/login", language);
  await page.getByLabel(/e-?mail|البريد/i).fill(email);
  await page.locator('input[type="password"]').fill(password);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/auth/v1/token") &&
      response.url().includes("grant_type=password"),
  );
  await page.locator('form button[type="submit"]').click();
  const response = await responsePromise;
  let code = "unknown";
  try {
    const body = (await response.json()) as { error_code?: unknown; code?: unknown };
    code = String(body.error_code ?? body.code ?? "unknown").replaceAll(/[^a-z0-9_-]/gi, "_");
  } catch {
    code = "non_json";
  }
  expect(response.status(), `login_http_${response.status()}_${code}`).toBe(200);
  await page.waitForURL((url) => !url.pathname.endsWith("/auth/login"));
  if (page.url().includes("/auth/profile-setup")) {
    await page.getByRole("button", { name: /Passer|تخطّي/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/auth/profile-setup"));
  }
}

test.describe("staging-backed critical journeys", () => {
  test.skip(!hasStagingUsers, "Protected synthetic staging users were not injected.");

  test("invalid credentials are localized and terminate loading", async ({ page }, testInfo) => {
    const diagnostics = observePage(page, {
      allowResponse: (status, url) => status === 400 && url.pathname.includes("/auth/v1/token"),
      allowExpectedResourceConsoleError: true,
    });
    await initializeLanguage(page, "fr");
    await gotoHydrated(page, "/auth/login", "fr");
    await page.getByLabel(/e-?mail/i).fill(firstEmail!);
    await page.locator('input[type="password"]').fill(`${firstPassword!}-invalid`);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await diagnostics.verify(testInfo);
  });

  test("first-time user creates a cloud team and refreshes authoritative state", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await initializeLanguage(page, "fr");
    await login(page, firstEmail!, firstPassword!, "fr");
    await gotoHydrated(page, "/fantasy/create", "fr");
    await page.getByLabel("Nom de l'équipe").fill("QA Acceptance FC");
    await page.getByRole("button", { name: "Compléter automatiquement" }).click();
    await expect(page.getByText("15 / 15")).toBeVisible();
    const save = page.getByRole("button", { name: "Enregistrer mon équipe" });
    await expect(save).toBeEnabled();
    await save.click();
    await page.waitForURL(/\/fantasy\/team$/);
    await reloadHydrated(page, "fr");
    await expect(page.getByText("QA Acceptance FC")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await diagnostics.verify(testInfo);
  });

  test("team follows persist while a second user remains isolated", async ({ page }, testInfo) => {
    const diagnostics = observePage(page);
    await initializeLanguage(page, "ar");
    await login(page, secondEmail!, secondPassword!, "ar");
    await gotoHydrated(page, "/news", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const follow = page.getByRole("button", { name: /^تابع$/ }).first();
    if (await follow.isVisible()) {
      await follow.click();
      await reloadHydrated(page, "ar");
      await expect(page.getByRole("button", { name: "متابَع" }).first()).toBeVisible();
    }
    await gotoHydrated(page, "/fantasy/team", "ar");
    await expect(page.getByText("QA Acceptance FC")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await diagnostics.verify(testInfo);
  });
});
