import { expect, test, type Page } from "@playwright/test";
import { expectNothingOffScreen, gotoHydrated, initializeLanguage, observePage } from "./support";

/**
 * The player-mapping reviewer screen, driven in a real browser on SAMPLE data.
 *
 * It opens /dev/player-mappings-sample, which exists only on a development
 * server and serves invented players from memory: no database, no Supabase
 * client, no network, and no real proposal can come of anything here. What it
 * measures is what a reviewer meets: keyboard use, the two-person rule, the
 * second-reviewer-required state, and a right-to-left layout that is actually
 * on the screen (not just `dir="rtl"` in the markup).
 */
const SMALL = "scale=small&writes=1";
const REASON = "Même numéro, même poste, même club d’après les deux sources.";

async function openSample(page: Page, language: "fr" | "ar", query = SMALL) {
  await initializeLanguage(page, language);
  await gotoHydrated(page, `/dev/player-mappings-sample?lang=${language}&${query}`, language);
  await expect(page.getByTestId("mapping-queue")).toBeVisible();
  await expect(page.getByTestId("mapping-row").first()).toBeVisible();
}

async function seat(page: Page, who: "proposer" | "approver" | "reader") {
  await page.getByTestId(`sample-seat-${who}`).click();
  await expect(page.getByTestId("mapping-queue")).toBeVisible();
}

/** Proposes the first candidate against its best-ranked option, from the open comparison. */
async function proposeFirst(page: Page) {
  await page.getByTestId("mapping-row").first().click();
  await expect(page.getByTestId("mapping-comparison")).toBeVisible();
  await expect(page.getByTestId("mapping-option").first()).toBeVisible();
  await page.getByTestId("mapping-option-select").first().click();
  await page.getByTestId("mapping-propose-trigger").click();
  await page.getByTestId("mapping-propose-action-reason").fill(REASON);
  await page.getByTestId("mapping-propose-action-commit").click();
  await expect(page.getByTestId("mapping-propose-message")).toBeVisible();
}

test.describe("keyboard", () => {
  test("rows are reached with Tab and moved through with the arrow keys, Home and End", async ({
    page,
  }, testInfo) => {
    const observed = observePage(page);
    await openSample(page, "fr");
    const rows = page.getByTestId("mapping-row");
    await rows.first().focus();
    const activeIndex = () =>
      page.evaluate(() => document.activeElement?.getAttribute("data-row-index"));
    expect(await activeIndex()).toBe("0");
    await page.keyboard.press("ArrowDown");
    expect(await activeIndex()).toBe("1");
    await page.keyboard.press("ArrowDown");
    expect(await activeIndex()).toBe("2");
    await page.keyboard.press("ArrowUp");
    expect(await activeIndex()).toBe("1");
    await page.keyboard.press("End");
    expect(await activeIndex()).toBe(String((await rows.count()) - 1));
    await page.keyboard.press("Home");
    expect(await activeIndex()).toBe("0");
    // Enter opens the comparison; closing it returns focus to the row that was open.
    await page.keyboard.press("ArrowDown");
    const openedId = await page.evaluate(() => document.activeElement?.getAttribute("data-row-id"));
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mapping-comparison")).toBeVisible();
    await page.getByTestId("mapping-comparison-close").click();
    await expect(page.getByTestId("mapping-queue")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-row-id")))
      .toBe(openedId);
    await observed.verify(testInfo);
  });

  test("the view tabs move with the arrow keys and every control has a name", async ({ page }) => {
    await openSample(page, "fr");
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(6);
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(tabs.nth(5)).toHaveAttribute("aria-selected", "true");
    // Every button and field in the queue has an accessible name.
    const unnamed = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "[data-testid=player-mappings] button, [data-testid=player-mappings] select, [data-testid=player-mappings] input",
        ),
      ]
        .filter((el) => {
          const label =
            el.getAttribute("aria-label") ||
            (el.textContent ?? "").trim() ||
            (el as HTMLInputElement).labels?.[0]?.textContent?.trim();
          return !label;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
  });

  test("a proposal can be made from the keyboard alone", async ({ page }) => {
    await openSample(page, "fr");
    await page.getByTestId("mapping-row").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mapping-option").first()).toBeVisible();
    const select = page.getByTestId("mapping-option-select").first();
    await select.focus();
    await page.keyboard.press("Space");
    await expect(select).toHaveAttribute("aria-pressed", "true");
    const trigger = page.getByTestId("mapping-propose-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    // The confirm step takes focus into its reason field.
    const reason = page.getByTestId("mapping-propose-action-reason");
    await expect(reason).toBeFocused();
    await page.keyboard.type(REASON);
    await page.getByTestId("mapping-propose-action-commit").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mapping-propose-message")).toContainText("Proposition créée");
  });
});

test.describe("the two-person rule", () => {
  test("a proposer cannot approve; a different reviewer can; approval executes nothing", async ({
    page,
  }, testInfo) => {
    const observed = observePage(page);
    await openSample(page, "fr");
    const proposed = page.getByTestId("mapping-tab-proposed");
    await expect(proposed).toContainText("(0)");
    await proposeFirst(page);

    // The proposer's own view: waiting, no approve, no reject, a way to withdraw.
    await expect(page.getByTestId("mapping-proposal")).toBeVisible();
    await expect(page.getByTestId("mapping-own-proposal")).toBeVisible();
    await expect(page.getByTestId("mapping-approve")).toHaveCount(0);
    await expect(page.getByTestId("mapping-reject")).toHaveCount(0);
    await expect(page.getByTestId("mapping-cancel")).toBeVisible();
    const fingerprint = (await page.getByTestId("mapping-fingerprint").innerText()).trim();
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);

    // A different reviewer sees the same exact fingerprint, and may decide.
    await seat(page, "approver");
    await page.getByTestId("mapping-tab-proposed").click();
    await page.getByTestId("mapping-row").first().click();
    await expect(page.getByTestId("mapping-fingerprint")).toHaveText(fingerprint);
    await expect(page.getByTestId("mapping-approve")).toBeVisible();
    await expect(page.getByTestId("mapping-reject")).toBeVisible();
    await expect(page.getByTestId("mapping-cancel")).toHaveCount(0);
    await page.getByTestId("mapping-approve").click();
    // The confirm prompt names the exact fingerprint being approved.
    await expect(page.getByTestId("mapping-approve-confirm")).toContainText(fingerprint);
    // A short reason is not enough to confirm.
    await page.getByTestId("mapping-approve-reason").fill("ok");
    await expect(page.getByTestId("mapping-approve-commit")).toBeDisabled();
    await page.getByTestId("mapping-approve-reason").fill("Preuves relues, tout concorde.");
    await page.getByTestId("mapping-approve-commit").click();
    await expect(page.getByTestId("mapping-proposal-status")).toHaveText("Approuvée");
    await expect(page.getByTestId("mapping-execution-separate")).toBeVisible();
    await expect(page.getByTestId("mapping-approve")).toHaveCount(0);
    await expect(page.getByTestId("mapping-proposal-message")).toBeVisible();
    await observed.verify(testInfo);
  });

  test("a reviewer who can only read sees the queue and no write control", async ({ page }) => {
    await openSample(page, "fr");
    await seat(page, "reader");
    await expect(page.getByTestId("mapping-row").first()).toBeVisible();
    await page.getByTestId("mapping-row").first().click();
    await expect(page.getByTestId("mapping-option").first()).toBeVisible();
    await expect(page.getByTestId("mapping-option-select")).toHaveCount(0);
    await expect(page.getByTestId("mapping-propose-trigger")).toHaveCount(0);
    await expect(page.getByText("football.manage_mappings requis").first()).toBeVisible();
  });

  test("with the proposal switch off, the screen only reads", async ({ page }) => {
    await openSample(page, "fr", "scale=small");
    await expect(page.getByTestId("mapping-read-only")).toBeVisible();
    await page.getByTestId("mapping-row").first().click();
    await expect(page.getByTestId("mapping-option").first()).toBeVisible();
    await expect(page.getByTestId("mapping-option-select")).toHaveCount(0);
    await expect(page.getByTestId("mapping-propose-trigger")).toHaveCount(0);
    await expect(page.getByTestId("mapping-writes-disabled").first()).toBeVisible();
  });

  test("with one qualified reviewer: SECOND RELECTEUR QUALIFIÉ REQUIS, and no approve anywhere", async ({
    page,
  }) => {
    await openSample(page, "fr", `${SMALL}&reviewers=1`);
    await proposeFirst(page);
    const banner = page.getByTestId("second-reviewer-required");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("SECOND RELECTEUR QUALIFIÉ REQUIS");
    await expect(page.getByTestId("mapping-approve")).toHaveCount(0);
    // The queue lists it as waiting for a second reviewer.
    await page.getByTestId("mapping-comparison-close").click();
    await page.getByTestId("mapping-tab-waiting_second").click();
    await expect(page.getByTestId("mapping-proposal-row")).toHaveCount(1);
  });
});

test.describe("the comparison", () => {
  test("every app player of the club is listed; a position disagreement is flagged, never hidden", async ({
    page,
  }) => {
    await openSample(page, "fr");
    // A candidate that carries a position, so a disagreement is possible.
    await page.getByTestId("mapping-filter-provider").selectOption("sofascore");
    await page.getByTestId("mapping-filter-evidence").selectOption("rich");
    await page.getByTestId("mapping-row").first().click();
    await expect(page.getByTestId("mapping-provider-evidence")).toBeVisible();
    await page.getByTestId("mapping-options-toggle").click();
    const options = page.getByTestId("mapping-option");
    // The sample club has 38 app players: all 38 are on the list.
    await expect(options).toHaveCount(38);
    await expect(page.locator('[data-position-conflict="true"]').first()).toContainText(
      "Poste différent : à vérifier",
    );
    // Missing evidence is "sans signal", not a penalty.
    await expect(page.getByText("Sans signal").first()).toBeVisible();
    await expect(page.getByTestId("mapping-preview")).toContainText("aperçu, pas une décision");
  });

  test("the club scope can be widened to every app player", async ({ page }) => {
    await openSample(page, "fr");
    await page.getByTestId("mapping-row").first().click();
    await expect(page.getByTestId("mapping-option").first()).toBeVisible();
    await page.getByTestId("mapping-scope-all").click();
    await page.getByTestId("mapping-options-toggle").click();
    await expect(page.getByTestId("mapping-option")).toHaveCount(200);
  });

  test("filters and search narrow the queue", async ({ page }) => {
    await openSample(page, "fr");
    const count = page.getByTestId("mapping-result-count");
    const before = await count.innerText();
    await page.getByTestId("mapping-filter-provider").selectOption("flashscore");
    await expect(count).not.toHaveText(before);
    await page.getByTestId("mapping-filter-flag").selectOption("INCOMPLETE_PROVIDER_SQUAD");
    await expect(count).toContainText(/^\d+ sur \d+ candidats$/);
    await page.getByTestId("mapping-filter-clear").click();
    await expect(count).toHaveText(before);
    await page.getByTestId("mapping-filter-search").fill("Exemple 0003");
    await expect(page.getByTestId("mapping-row")).toHaveCount(1);
  });
});

test.describe("right-to-left", () => {
  test("Arabic is laid out right to left on the screen, and nothing runs off it", async ({
    page,
  }, testInfo) => {
    const observed = observePage(page);
    await openSample(page, "ar");
    const root = page.getByTestId("player-mappings");
    await expect(root).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("mapping-tab-unmapped")).toContainText("غير مطابَقين");
    // The first thing in a row (the provider badge) sits at the inline START: the right edge.
    const row = page.getByTestId("mapping-row").first();
    const sides = await row.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const first = node.querySelector("span span")!.getBoundingClientRect();
      return { fromStart: box.right - first.right, fromEnd: first.left - box.left };
    });
    expect(sides.fromStart).toBeLessThan(sides.fromEnd);
    await expectNothingOffScreen(page, "[data-testid=player-mappings]", { scrollRails: true });
    await page.screenshot({ path: testInfo.outputPath("queue-ar-desktop.png"), fullPage: false });

    await row.click();
    await expect(page.getByTestId("mapping-option").first()).toBeVisible();
    await expectNothingOffScreen(page, "[data-testid=player-mappings]", { scrollRails: true });
    await page.screenshot({ path: testInfo.outputPath("comparison-ar-desktop.png") });
    await observed.verify(testInfo);
  });

  for (const lang of ["fr", "ar"] as const) {
    test(`a phone (390px) shows the queue and the comparison without clipping, in ${lang}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openSample(page, lang);
      await expectNothingOffScreen(page, "[data-testid=player-mappings]", { scrollRails: true });
      await page.screenshot({ path: testInfo.outputPath(`queue-${lang}-phone.png`) });
      await page.getByTestId("mapping-row").first().click();
      await expect(page.getByTestId("mapping-option").first()).toBeVisible();
      await expectNothingOffScreen(page, "[data-testid=player-mappings]", { scrollRails: true });
      await page.screenshot({
        path: testInfo.outputPath(`comparison-${lang}-phone.png`),
        fullPage: true,
      });
    });
  }

  test("French desktop screenshots, for the record", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await openSample(page, "fr");
    await page.screenshot({ path: testInfo.outputPath("queue-fr-desktop.png") });
    await page.getByTestId("mapping-row").first().click();
    await expect(page.getByTestId("mapping-option").first()).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("comparison-fr-desktop.png"),
      fullPage: true,
    });
  });
});

test.describe("the sample page is development-only", () => {
  test("the production routes never serve it (a development server does, only here)", async ({
    request,
    baseURL,
  }) => {
    test.skip(
      process.env.E2E_BUILT_OUTPUT === "1",
      "The built bundle answers not-found, which is the point.",
    );
    const response = await request.get(`${baseURL}/dev/player-mappings-sample`);
    expect(response.status()).toBeLessThan(500);
  });
});
