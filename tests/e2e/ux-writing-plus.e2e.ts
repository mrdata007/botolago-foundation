import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import { MOCK_PAY_CODE } from "../../src/backend/premium/mock-repository";
import { initializeLanguage, observePage } from "./support";

type Language = "fr" | "ar";

async function open(page: Page, path: string, language: Language) {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-lang", language);
  await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
  await page.evaluate(() => document.fonts.ready);
}

/** Measure actual control/text boxes: document overflow alone misses clipped copy. */
async function assertCopyFits(scope: Locator) {
  const problems = await scope.evaluate((root) => {
    const found: string[] = [];
    for (const node of root.querySelectorAll("h1, h2, h3, button, a, input, select")) {
      if (node.closest('[aria-hidden="true"], [inert], svg')) continue;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (!box.width || !box.height || style.visibility === "hidden" || style.display === "none")
        continue;
      // The briefing deck is intentionally swiped on phones. Each card, rather than the
      // viewport, contains its text; the selected card is captured separately below.
      const card = node.closest("[data-card]");
      const frame = card?.getBoundingClientRect();
      const left = frame?.left ?? 0;
      const right = frame?.right ?? document.documentElement.clientWidth;
      const label = (node.textContent ?? "").trim().slice(0, 70);
      if (box.left < left - 2 || box.right > right + 2) found.push(`outside: ${label}`);
      if (!node.matches("button, a, h1, h2, h3")) continue;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (
          !text.textContent?.trim() ||
          text.parentElement?.closest("svg, .sr-only, .plus-sr-only")
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const line of range.getClientRects()) {
          if (line.left < box.left - 2 || line.right > box.right + 2)
            found.push(`text clipped: ${label}`);
        }
      }
    }
    return found;
  });
  expect(problems, "headings and actions keep their rendered text inside their boxes").toEqual([]);
}

async function capture(page: Page, info: TestInfo, name: string, scope?: Locator) {
  const target = scope ?? page.locator("main").first();
  await assertCopyFits(target);
  if (scope)
    await scope.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled" });
  else
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
}

for (const language of ["fr", "ar"] as const) {
  for (const width of [390, 1440]) {
    test.describe(`Plus writing ${language} ${width}`, () => {
      let diagnostics: ReturnType<typeof observePage>;
      test.beforeEach(async ({ page }) => {
        diagnostics = observePage(page);
        await page.setViewportSize({ width, height: 900 });
        await initializeLanguage(page, language);
        await page.addInitScript((lang) => {
          const user = {
            id: "usr_demo",
            email: "demo@botolago.ma",
            displayName: "Rachid Demo",
            username: "rachid_demo",
            language: lang,
            profileComplete: true,
            verified: true,
            provider: "email",
            createdAt: "2026-09-01T00:00:00Z",
            favoriteClubId: "war",
            notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
            passwordDigest: "fixture",
          };
          localStorage.setItem("botolago.auth.users", JSON.stringify([user]));
          localStorage.setItem(
            "botolago.auth.session",
            JSON.stringify({ kind: "user", userId: user.id, createdAt: user.createdAt }),
          );
          localStorage.setItem("botolago.theme", "light");
          sessionStorage.setItem("botolago.card.hero_session.v1", "1");
        }, language);
      });

      test.afterEach(async ({ page }, info) => {
        await expect(page.locator("vite-error-overlay")).toHaveCount(0);
        await diagnostics.verify(info);
      });

      test("style preview names the action and preserves the rating explanation", async ({
        page,
      }, info) => {
        const copy = dictionaries[language];
        await open(page, "/curva/plus?step=1&mc=rated", language);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy["plus.s1.title"]);
        await expect(page.getByText(copy["plus.rule"], { exact: true })).toBeVisible();
        const style = page.getByRole("radio", { name: copy["plus.style.chrome"], exact: true });
        await style.click();
        await expect(style).toHaveAttribute("aria-checked", "true");
        await capture(page, info, "offer-style");
      });

      test("payment opens a prepared WhatsApp message and asks users to attach the receipt", async ({
        page,
      }, info) => {
        const copy = dictionaries[language];
        await open(page, "/curva/plus?step=5&mc=rated", language);
        const action = page.getByTestId("plus-pay-whatsapp");
        await expect(action).toBeVisible();
        await expect(page.getByText(copy["plus.pay.wa_hint"], { exact: true })).toBeVisible();
        const link = new URL((await action.getAttribute("href"))!);
        expect(link.origin).toBe("https://wa.me");
        expect(link.searchParams.get("text")).toContain(MOCK_PAY_CODE);
        expect([...link.searchParams.keys()]).toEqual(["text"]);
        const code = page.getByTestId("plus-pay-code").locator('bdi[dir="ltr"]');
        await expect(code).toHaveText(MOCK_PAY_CODE);
        await expect(code).toHaveCSS("direction", "ltr");
        await capture(page, info, "payment");

        await open(page, "/curva/plus?step=5&plus=nopay&mc=rated", language);
        await expect(page.getByTestId("plus-pay-soon")).toBeVisible();
        await expect(page.getByTestId("plus-pay-whatsapp")).toHaveCount(0);
        await expect(page.getByTestId("plus-pay-soon")).not.toContainText(
          /quelques jours|خلال أيام/,
        );
        await capture(page, info, "payment-unavailable");
      });

      test("members see their recap and briefing with explicit units and no calculation jargon", async ({
        page,
      }, info) => {
        await open(page, "/curva/carte?plus=season&mc=rated", language);
        const recap = page.getByTestId("plus-recap");
        await expect(recap).toBeVisible();
        await expect(recap.getByTestId("plus-recap-body")).toHaveAttribute(
          "data-calculation-version",
          /\d+/,
        );
        await expect(recap).not.toContainText(/Calcul v|الحساب v/);
        await capture(page, info, "member-recap", recap);

        await open(page, "/fantasy/briefing?plus=season&mc=rated", language);
        const briefing = page.getByTestId("plus-briefing");
        await expect(briefing.getByTestId("plus-briefing-deck")).toBeVisible();
        const budget = briefing.locator('[data-card="transfers"]');
        await expect(
          budget.getByText(dictionaries[language]["plus.brief.tr_bank"], { exact: true }),
        ).toHaveCount(1);
        await expect(
          budget
            .locator(".sr-only")
            .filter({ hasText: language === "ar" ? "بالملايين" : "En millions" }),
        ).toHaveCount(1);
        await capture(page, info, "member-briefing", briefing.getByTestId("plus-briefing-board"));
        await capture(page, info, "member-briefing-transfers", budget);
      });

      test("locked previews separate examples from the paid actions", async ({ page }, info) => {
        const copy = dictionaries[language];
        await open(page, "/curva/carte?plus=none&mc=rated", language);
        const locked = page.getByTestId("plus-recap-locked");
        await expect(locked).toBeVisible();
        await expect(locked.locator(".pl-under")).toHaveAttribute("inert", "");
        await expect(locked.locator(".pl-under")).toHaveAttribute("aria-hidden", "true");
        await expect(
          locked.getByRole("link", { name: copy["plus.in.unlock"], exact: true }),
        ).toBeVisible();
        await capture(page, info, "locked-recap", locked);

        await open(page, "/fantasy/briefing?plus=none&mc=rated", language);
        const briefing = page.getByTestId("plus-briefing-locked-page");
        await expect(briefing).toBeVisible();
        await expect(briefing.locator(".pl-under")).toHaveAttribute("inert", "");
        await capture(page, info, "locked-briefing", briefing);
      });
    });
  }
}
