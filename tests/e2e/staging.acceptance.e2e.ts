import { expect, test, type Page } from "@playwright/test";
import {
  expectHealthyDocument,
  expectNoHorizontalOverflow,
  gotoHydrated,
  initializeLanguage,
  observePage,
  reloadHydrated,
} from "./support";

const shouldRun = process.env.E2E_RUN_AUTH === "1";
const requirePrimaryCredentials = process.env.E2E_REQUIRE_AUTH_CREDENTIALS === "1";
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

const firstEmail = process.env.E2E_STAGING_FIRST_EMAIL;
const firstPassword = process.env.E2E_STAGING_FIRST_PASSWORD;
const secondEmail = process.env.E2E_STAGING_SECOND_EMAIL;
const secondPassword = process.env.E2E_STAGING_SECOND_PASSWORD;
const hasStagingUsers = !!firstEmail && !!firstPassword && !!secondEmail && !!secondPassword;

test.describe("@auth live Supabase acceptance", () => {
  test.skip(
    !shouldRun || (!requirePrimaryCredentials && (!email || !password)),
    "Run `bun run test:e2e:auth` with the ignored primary credentials to opt in.",
  );

  test.beforeAll(() => {
    if (!email || !password) {
      throw new Error(
        "Authenticated E2E credentials are missing. Add E2E_TEST_EMAIL and E2E_TEST_PASSWORD to the ignored .env.e2e.local file.",
      );
    }
  });

  async function login(page: Page) {
    await initializeLanguage(page, "fr");
    await gotoHydrated(page, "/auth/login", "fr");
    await page.getByLabel(/e-?mail/i).fill(email!);
    await page.locator('input[autocomplete="current-password"]').fill(password!);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith("/auth/login"));
    if (page.url().includes("/auth/profile-setup")) {
      await page.getByRole("button", { name: /Passer/i }).click();
      await page.waitForURL((url) => !url.pathname.includes("/auth/profile-setup"));
    }
  }

  test("regular account can sign in and is denied by every Admin route", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await login(page);
    await gotoHydrated(page, "/profile", "fr");
    await expect(page.getByRole("button", { name: "Se déconnecter", exact: true })).toBeVisible();

    for (const route of [
      "/admin",
      "/admin/approvals",
      "/admin/audit",
      "/admin/security",
      "/admin/staff",
      "/admin/staff/00000000-0000-4000-8000-000000000001",
    ]) {
      await gotoHydrated(page, route, "fr");
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
      await expect(page.locator('[data-admin-state="authorized"]')).toHaveCount(0);
      await expectHealthyDocument(page);
    }

    await gotoHydrated(page, "/profile", "fr");
    await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Se déconnecter ?" })
      .getByRole("button", {
        name: "Conserver les données",
      })
      .click();
    await diagnostics.verify(testInfo);
  });

  for (const provider of ["Google", "Apple"] as const) {
    test(`${provider} control hands off to the configured provider`, async ({ page }) => {
      await initializeLanguage(page, "fr");
      await gotoHydrated(page, "/auth/login", "fr");
      await page.getByRole("button", { name: provider }).click();
      await page.waitForURL(
        (url) => url.origin !== new URL(test.info().project.use.baseURL!).origin,
      );
      const target = new URL(page.url());
      if (provider === "Google") {
        expect(target.hostname).toMatch(/google|supabase/i);
      } else {
        expect(target.hostname).toMatch(/apple|supabase/i);
      }
    });
  }
});

async function loginStaging(page: Page, identity: string, secret: string, language: "fr" | "ar") {
  await initializeLanguage(page, language);
  await gotoHydrated(page, "/auth/login", language);
  await page.getByLabel(/e-?mail|البريد/i).fill(identity);
  await page.locator('input[autocomplete="current-password"]').fill(secret);
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

test.describe("@auth staging-backed cloud ownership journeys", () => {
  test.skip(!shouldRun || !hasStagingUsers, "Protected synthetic staging users were not injected.");

  test("invalid credentials are localized and terminate loading", async ({ page }, testInfo) => {
    const diagnostics = observePage(page, {
      allowResponse: (status, url) => status === 400 && url.pathname.includes("/auth/v1/token"),
      allowExpectedResourceConsoleError: true,
    });
    await initializeLanguage(page, "fr");
    await gotoHydrated(page, "/auth/login", "fr");
    await page.getByLabel(/e-?mail/i).fill(firstEmail!);
    await page.locator('input[autocomplete="current-password"]').fill(`${firstPassword!}-invalid`);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await diagnostics.verify(testInfo);
  });

  test("first-time user creates a cloud team and refreshes authoritative state", async ({
    page,
  }, testInfo) => {
    const diagnostics = observePage(page);
    await loginStaging(page, firstEmail!, firstPassword!, "fr");
    await gotoHydrated(page, "/fantasy/create", "fr");
    const welcome = page.getByRole("dialog", { name: "Bienvenue sur Fantasy BotolaGO" });
    if (await welcome.isVisible()) {
      await welcome.getByRole("button", { name: "Passer" }).click();
    }
    const importPrompt = page.getByRole("dialog", { name: "Équipe locale détectée" });
    if (await importPrompt.isVisible()) {
      await importPrompt.getByRole("button", { name: "Commencer une nouvelle équipe" }).click();
    }
    await page.getByLabel("Nom de l'équipe").fill("QA Acceptance FC");
    await page.getByRole("button", { name: "Compléter automatiquement" }).click();
    await expect(page.getByText("15 / 15")).toBeVisible();
    const save = page.locator('button[aria-label="Enregistrer mon équipe"]');
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
    await loginStaging(page, secondEmail!, secondPassword!, "ar");
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
