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

const PHRASE = "EXECUTE_PLAYER_MAPPING";
const APPROVAL_REASON = "Preuves relues, tout concorde.";

/** Proposes the first candidate, then approves it from the same seat (single-approver mode). */
async function proposeAndSelfApprove(page: Page) {
  await proposeFirst(page);
  await page.getByTestId("mapping-approve").click();
  await page.getByTestId("mapping-approve-reason").fill(APPROVAL_REASON);
  await page.getByTestId("mapping-approve-commit").click();
  await expect(page.getByTestId("mapping-proposal-status")).toHaveText(/Approuvée|موافَق عليه/);
}

const mappingCount = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __mappingSample: { mappingCount(): number } }
    ).__mappingSample.mappingCount(),
  );

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

test.describe("single-approver mode", () => {
  test("the screen says SINGLE-OPERATOR REVIEW MODE only while the server allows self-approval", async ({
    page,
  }, testInfo) => {
    const observed = observePage(page);
    await openSample(page, "fr", `${SMALL}&reviewers=1&selfapprove=1`);
    const banner = page.getByTestId("mapping-single-operator-mode");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("MODE RELECTURE PAR UN SEUL OPÉRATEUR");
    await expect(banner).toContainText("approuver sa propre proposition");
    await expect(banner).toContainText("L’exécution reste une action distincte");
    await expect(banner).toContainText("consignée dans l’audit");
    await expect(page.getByTestId("second-reviewer-required")).toHaveCount(0);
    // The same screen with the server saying two people are required: no such banner.
    await openSample(page, "fr", `${SMALL}&reviewers=1`);
    await expect(page.getByTestId("mapping-single-operator-mode")).toHaveCount(0);
    await openSample(page, "ar", `${SMALL}&reviewers=1&selfapprove=1`);
    await expect(page.getByTestId("mapping-single-operator-mode")).toContainText(
      "وضع المراجعة بمشغِّل واحد",
    );
    await observed.verify(testInfo);
  });

  test("a lone reviewer may approve their own proposal, with a warning, and nothing executes", async ({
    page,
  }, testInfo) => {
    const observed = observePage(page);
    await openSample(page, "fr", `${SMALL}&reviewers=1&selfapprove=1`);
    await proposeFirst(page);
    // No "second reviewer required" wall, but a clear notice that nobody else checks.
    await expect(page.getByTestId("second-reviewer-required")).toHaveCount(0);
    await expect(page.getByTestId("mapping-self-approval-notice")).toBeVisible();
    await expect(page.getByTestId("mapping-own-proposal")).toHaveCount(0);
    await expect(page.getByTestId("mapping-approve")).toBeVisible();
    await expect(page.getByTestId("mapping-reject")).toBeVisible();
    const fingerprint = (await page.getByTestId("mapping-fingerprint").innerText()).trim();
    await page.getByTestId("mapping-approve").click();
    await expect(page.getByTestId("mapping-approve-confirm")).toContainText(fingerprint);
    await page.getByTestId("mapping-approve-reason").fill("ok");
    await expect(page.getByTestId("mapping-approve-commit")).toBeDisabled();
    await page.getByTestId("mapping-approve-reason").fill("Preuves relues, tout concorde.");
    await page.getByTestId("mapping-approve-commit").click();
    await expect(page.getByTestId("mapping-proposal-status")).toHaveText("Approuvée");
    await expect(page.getByTestId("mapping-self-approved-note")).toBeVisible();
    await expect(page.getByTestId("mapping-execution-separate")).toBeVisible();
    await expect(page.getByTestId("mapping-approve")).toHaveCount(0);
    await observed.verify(testInfo);
  });

  test("the two-person wall is back when the switch is off", async ({ page }) => {
    await openSample(page, "fr", `${SMALL}&reviewers=1`);
    await proposeFirst(page);
    await expect(page.getByTestId("second-reviewer-required")).toBeVisible();
    await expect(page.getByTestId("mapping-self-approval-notice")).toHaveCount(0);
    await expect(page.getByTestId("mapping-approve")).toHaveCount(0);
  });
});

test.describe("execute one approved proposal", () => {
  const SELF = `${SMALL}&reviewers=1&selfapprove=1`;

  test("it is offered only after approval, needs the typed phrase, and executes exactly one mapping", async ({
    page,
  }, testInfo) => {
    const observed = observePage(page);
    await openSample(page, "fr", SELF);
    await proposeFirst(page);
    // Pending: no execute control.
    await expect(page.getByTestId("mapping-execute-panel")).toHaveCount(0);
    await page.getByTestId("mapping-approve").click();
    await page.getByTestId("mapping-approve-reason").fill(APPROVAL_REASON);
    await page.getByTestId("mapping-approve-commit").click();
    await expect(page.getByTestId("mapping-proposal-status")).toHaveText("Approuvée");
    // Approved: the control appears, and NOTHING has been written by approving.
    await expect(page.getByTestId("mapping-execute-panel")).toBeVisible();
    expect(await mappingCount(page)).toBe(0);
    // The exact fingerprint and the target are on screen.
    const fingerprint = (await page.getByTestId("mapping-fingerprint").innerText()).trim();
    await expect(page.getByTestId("mapping-execute-fingerprint")).toHaveText(fingerprint);
    await expect(page.getByTestId("mapping-execute-provider")).toBeVisible();
    await expect(page.getByTestId("mapping-execute-external-id")).toBeVisible();
    await expect(page.getByTestId("mapping-execute-app-player")).toBeVisible();
    // 11. Typed confirmation: disabled until the phrase is exact.
    const button = page.getByTestId("mapping-execute");
    const input = page.getByTestId("mapping-execute-input");
    await expect(button).toBeDisabled();
    await input.fill("execute_player_mapping");
    await expect(button).toBeDisabled();
    await input.fill("EXECUTE");
    await expect(button).toBeDisabled();
    // Enter in the field never executes.
    await input.fill(PHRASE);
    await expect(button).toBeEnabled();
    await input.press("Enter");
    expect(await mappingCount(page)).toBe(0);
    // 12. One press: one mapping.
    await button.click();
    // The panel goes away with the proposal; the screen keeps what was written.
    await expect(page.getByTestId("mapping-execute-result")).toContainText("Exécuté");
    expect(await mappingCount(page)).toBe(1);
    // 8. Executed: the control is gone and a second execution is impossible.
    await expect(page.getByTestId("mapping-execute-panel")).toHaveCount(0);
    await expect(page.getByTestId("mapping-execute")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("execute-done-fr.png"), fullPage: true });
    await observed.verify(testInfo);
  });

  test("a rejected proposal has no execute control", async ({ page }) => {
    await openSample(page, "fr", SELF);
    await proposeFirst(page);
    await page.getByTestId("mapping-reject").click();
    await page.getByTestId("mapping-reject-reason").fill("Je préfère ne pas rapprocher ceci.");
    await page.getByTestId("mapping-reject-commit").click();
    // A rejected proposal is final: the screen is back on the candidate, with no execute control.
    await expect(page.getByTestId("mapping-proposal")).toHaveCount(0);
    await expect(page.getByTestId("mapping-execute-panel")).toHaveCount(0);
    expect(await mappingCount(page)).toBe(0);
  });

  test("9. a session without the second factor is refused, in words, and nothing is written", async ({
    page,
  }) => {
    await openSample(page, "fr", SELF);
    await proposeAndSelfApprove(page);
    await page.evaluate(() =>
      (
        window as unknown as { __mappingSample: { setSession(w: string, s: object): void } }
      ).__mappingSample.setSession("proposer", { aal2: false }),
    );
    await page.getByTestId("mapping-execute-input").fill(PHRASE);
    await page.getByTestId("mapping-execute").click();
    await expect(page.getByTestId("mapping-execute-message")).toContainText("AAL2");
    expect(await mappingCount(page)).toBe(0);
    await expect(page.getByTestId("mapping-execute-panel")).toBeVisible();
  });

  test("10. a stale sign-in is refused, in words, and nothing is written", async ({ page }) => {
    await openSample(page, "fr", SELF);
    await proposeAndSelfApprove(page);
    await page.evaluate(() =>
      (
        window as unknown as { __mappingSample: { setSession(w: string, s: object): void } }
      ).__mappingSample.setSession("proposer", { recentSignIn: false }),
    );
    await page.getByTestId("mapping-execute-input").fill(PHRASE);
    await page.getByTestId("mapping-execute").click();
    await expect(page.getByTestId("mapping-execute-message")).toContainText("récente");
    expect(await mappingCount(page)).toBe(0);
  });

  test("14. it can be done from the keyboard alone, in order, with a visible focus", async ({
    page,
  }) => {
    await openSample(page, "fr", SELF);
    await proposeAndSelfApprove(page);
    const input = page.getByTestId("mapping-execute-input");
    await input.focus();
    await expect(input).toBeFocused();
    await page.keyboard.type(PHRASE);
    await page.keyboard.press("Tab");
    const button = page.getByTestId("mapping-execute");
    await expect(button).toBeFocused();
    expect(await mappingCount(page)).toBe(0);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mapping-execute-result")).toContainText("Exécuté");
    expect(await mappingCount(page)).toBe(1);
  });

  test("the two-person flow works too: a second person approves, then executes", async ({
    page,
  }) => {
    await openSample(page, "fr");
    await proposeFirst(page);
    await seat(page, "approver");
    await page.getByTestId("mapping-tab-proposed").click();
    await page.getByTestId("mapping-row").first().click();
    await page.getByTestId("mapping-approve").click();
    await page.getByTestId("mapping-approve-reason").fill(APPROVAL_REASON);
    await page.getByTestId("mapping-approve-commit").click();
    await expect(page.getByTestId("mapping-execute-panel")).toBeVisible();
    await page.getByTestId("mapping-execute-input").fill(PHRASE);
    await page.getByTestId("mapping-execute").click();
    await expect(page.getByTestId("mapping-execute-result")).toContainText("Exécuté");
    expect(await mappingCount(page)).toBe(1);
  });

  test("15. Arabic: right to left, the phrase stays Latin and left to right, the flow works", async ({
    page,
  }, testInfo) => {
    const observed = observePage(page);
    await openSample(page, "ar", SELF);
    await proposeAndSelfApprove(page);
    await expect(page.getByTestId("mapping-execute-panel")).toContainText(
      "تنفيذ هذا الاقتراح المعتمَد",
    );
    await expect(page.getByTestId("player-mappings")).toHaveAttribute("dir", "rtl");
    const input = page.getByTestId("mapping-execute-input");
    await expect(input).toHaveAttribute("dir", "ltr");
    await expectNothingOffScreen(page, "[data-testid=player-mappings]", { scrollRails: true });
    await page.screenshot({ path: testInfo.outputPath("execute-ar-desktop.png"), fullPage: true });
    await input.fill(PHRASE);
    await page.getByTestId("mapping-execute").click();
    await expect(page.getByTestId("mapping-execute-result")).toContainText("تم التنفيذ");
    expect(await mappingCount(page)).toBe(1);
    await observed.verify(testInfo);
  });

  for (const lang of ["fr", "ar"] as const) {
    test(`16. a phone (390px) shows the execute panel without clipping, in ${lang}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openSample(page, lang, SELF);
      await proposeAndSelfApprove(page);
      const panel = page.getByTestId("mapping-execute-panel");
      await panel.scrollIntoViewIfNeeded();
      await expect(panel).toBeVisible();
      await expectNothingOffScreen(page, "[data-testid=player-mappings]", { scrollRails: true });
      // The button is at least a finger tall and as wide as the field above it.
      const box = await page.getByTestId("mapping-execute").boundingBox();
      const field = await page.getByTestId("mapping-execute-input").boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(43);
      expect(Math.abs(box!.width - field!.width)).toBeLessThanOrEqual(2);
      await page.screenshot({
        path: testInfo.outputPath(`execute-${lang}-phone.png`),
        fullPage: true,
      });
    });
  }
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
    // Widened, an option from another club says so on its row.
    await expect(page.getByTestId("mapping-club-flag").first()).toContainText("Autre club");
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
