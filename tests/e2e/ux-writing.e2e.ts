import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import {
  expectNoHorizontalOverflow,
  expectNothingOffScreen,
  initializeLanguage,
  observePage,
} from "./support";

type Language = "fr" | "ar";
const EMAIL = "supporter.botola+verification@example.com";

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expectNoHorizontalOverflow(page);
  await expectNothingOffScreen(page);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

async function open(page: Page, path: string, language: Language) {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-lang", language);
  await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
}

for (const language of ["fr", "ar"] as const) {
  for (const width of [390, 1440]) {
    test.describe(`${language} ${width}: task-specific writing`, () => {
      let diagnostics: ReturnType<typeof observePage>;
      test.beforeEach(async ({ page }) => {
        diagnostics = observePage(page);
        await page.setViewportSize({ width, height: 900 });
        await initializeLanguage(page, language);
      });

      test.afterEach(async ({ page }, info) => {
        await expect(page.locator("vite-error-overlay")).toHaveCount(0);
        await diagnostics.verify(info);
      });

      test("resending an email code confirms delivery and restarts the translated cooldown", async ({
        page,
      }, info) => {
        const copy = dictionaries[language];
        await page.addInitScript((email) => {
          localStorage.setItem(
            "botolago.auth.pending",
            JSON.stringify({ email, code: "123456", expiresAt: Date.now() + 600_000, draft: {} }),
          );
        }, EMAIL);
        await page.clock.install();
        await open(page, `/auth/verify?email=${encodeURIComponent(EMAIL)}`, language);

        await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy["auth.verify.title"]);
        const email = page.locator('main bdi[dir="ltr"]');
        await expect(email).toHaveText(EMAIL);
        await expect(email).toHaveCSS("direction", "ltr");
        await expect(page.locator("#verify-code")).toHaveAttribute("aria-describedby", "otp-err");

        const countdown = page.getByRole("button").filter({ hasText: /\d+.*(?:s|ث)$/ });
        await expect(countdown).toBeDisabled();
        const before = await countdown.innerText();
        expect(before).toContain(language === "ar" ? "ث" : " s");
        expect(before).toContain("\u2068");
        expect(before).toContain("\u2069");
        await capture(page, info, "verify-cooldown");

        // Run the real interval callbacks without waiting thirty wall-clock seconds.
        await page.clock.runFor(31_000);
        const resend = page.getByRole("button", { name: copy["auth.verify.resend"], exact: true });
        await expect(resend).toBeEnabled();
        await resend.click();
        await page.clock.runFor(1_000);
        await expect(
          page.getByText(copy["auth.verify.resend_sent"], { exact: true }),
        ).toBeVisible();
        await expect(countdown).toBeDisabled();
        await expect(
          page.getByRole("button", { name: copy["auth.verify.resend"], exact: true }),
        ).toHaveCount(0);
      });

      test("registration names the action without a completion-time promise", async ({
        page,
      }, info) => {
        const copy = dictionaries[language];
        await open(page, "/auth/register", language);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          copy["auth.register.title"],
        );
        await expect(page.getByText(copy["auth.register.subtitle"], { exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByRole("button", { name: copy["auth.register.cta"], exact: true }),
        ).toBeVisible();
        await capture(page, info, "register");
      });

      for (const complete of [false, true]) {
        test(`${complete ? "editing" : "onboarding"} a profile describes the current task and save action`, async ({
          page,
        }, info) => {
          const copy = dictionaries[language];
          await page.addInitScript(
            ({ lang, profileComplete }) => {
              const user = {
                id: "usr_ux_writing",
                email: "ux-writing@example.com",
                displayName: "Supporter Botola",
                username: "supporter_botola",
                language: lang,
                profileComplete,
                verified: true,
                provider: "email",
                createdAt: "2026-10-01T00:00:00Z",
                notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
                passwordDigest: "fixture",
              };
              localStorage.setItem("botolago.auth.users", JSON.stringify([user]));
              localStorage.setItem(
                "botolago.auth.session",
                JSON.stringify({ kind: "user", userId: user.id, createdAt: user.createdAt }),
              );
            },
            { lang: language, profileComplete: complete },
          );
          await open(page, "/auth/profile-setup?step=3", language);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            complete ? copy["auth.setup.edit_title"] : copy["auth.setup.title"],
          );
          await expect(page.getByText(copy["auth.setup.subtitle"], { exact: true })).toHaveCount(0);
          await expect(
            page.getByRole("button", {
              name: complete ? copy["auth.setup.save"] : copy["auth.setup.finish"],
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", { name: copy["auth.setup.skip"], exact: true }),
          ).toBeVisible();
          await capture(page, info, complete ? "profile-edit" : "profile-onboarding");
        });
      }
    });
  }
}
