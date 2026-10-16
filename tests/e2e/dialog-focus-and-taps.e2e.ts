import { expect, test, type Locator, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import { gotoHydrated, initializeLanguage } from "./support";

/**
 * Two defects from the 2026-10-16 state sweep (D4, D5), against the mock data
 * a server without a `.env` serves.
 *
 * D5: a dialog opened from state has no trigger, so closing it dropped focus
 * to <body>; the profile's two dialogs now give it back to the button that
 * opened them.
 *
 * D4: three controls were hit by less than 44px. The check is the effective
 * hit area, by `elementFromPoint` along the control's two centre lines, not the
 * painted box (a transparent hit area counts, a clipped one does not).
 */

/** `MOCK_DEMO_EMAIL` / `MOCK_DEMO_PASSWORD` in auth-mock.ts. */
const DEMO = { email: "demo@botolago.ma", password: "demo1234" };

type Language = "fr" | "ar";
type Key = keyof typeof dictionaries.fr;
const copy = (lang: Language, key: Key) => dictionaries[lang][key];

async function signIn(page: Page, lang: Language) {
  await gotoHydrated(page, "/auth/login?next=%2Fprofile", lang);
  await page.locator('input[type="email"]').fill(DEMO.email);
  await page.locator('input[autocomplete="current-password"]').fill(DEMO.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/profile");
  await expect(page.locator("html")).toHaveAttribute("data-lang", lang);
}

/** How far the control answers a tap, along its horizontal and vertical centre lines. */
async function effectiveSize(locator: Locator): Promise<{ width: number; height: number }> {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center" }));
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hits = (x: number, y: number) => {
      const top = document.elementFromPoint(x, y);
      return top !== null && (top === element || element.contains(top));
    };
    const cx = Math.round(box.left + box.width / 2);
    const cy = Math.round(box.top + box.height / 2);
    let left = cx;
    while (hits(left - 1, cy) && cx - left < 200) left -= 1;
    let right = cx;
    while (hits(right + 1, cy) && right - cx < 400) right += 1;
    let up = cy;
    while (hits(cx, up - 1) && cy - up < 100) up -= 1;
    let down = cy;
    while (hits(cx, down + 1) && down - cy < 100) down += 1;
    return { width: right - left + 1, height: down - up + 1 };
  });
}

for (const lang of ["fr", "ar"] as const) {
  test(`${lang}: closing the profile's dialogs gives focus back to the button that opened them`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await initializeLanguage(page, lang);
    await signIn(page, lang);

    const openDelete = page.getByRole("button", { name: copy(lang, "profile.delete_account") });
    const openSignOut = page.getByRole("button", { name: copy(lang, "profile.sign_out") });
    const dialog = page.getByRole("dialog");

    for (const how of ["escape", "cross", "cancel"] as const) {
      await openDelete.scrollIntoViewIfNeeded();
      await openDelete.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      if (how === "escape") await page.keyboard.press("Escape");
      else if (how === "cross") {
        await dialog.getByRole("button", { name: copy(lang, "fpl.close"), exact: true }).click();
      } else {
        await dialog
          .getByRole("button", { name: copy(lang, "profile.delete_cancel_cta"), exact: true })
          .click();
      }
      await expect(dialog).toBeHidden();
      await expect(openDelete, `delete dialog closed by ${how}`).toBeFocused();
    }

    // Opened with a pointer rather than the keyboard: focus still returns.
    await openDelete.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(openDelete).toBeFocused();

    await openSignOut.scrollIntoViewIfNeeded();
    await openSignOut.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(openSignOut, "sign-out dialog closed by Escape").toBeFocused();
  });

  test(`${lang}: the points link and the narrowest filter chips are 44px to hit`, async ({
    page,
  }) => {
    await initializeLanguage(page, lang);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, "/fantasy/points", lang);
    const how = page.getByRole("link", { name: copy(lang, "fantasy.points.how_scored") });
    await expect(how).toBeVisible();
    const link = await effectiveSize(how);
    expect(link.height, "points link, effective height").toBeGreaterThanOrEqual(44);
    expect(link.width, "points link, effective width").toBeGreaterThanOrEqual(44);

    // 320px is where the chips shrink under the kit's 44px width floor.
    await page.setViewportSize({ width: 320, height: 568 });
    for (const path of ["/matches", "/matches/standings"]) {
      await gotoHydrated(page, path, lang);
      const chips = page.locator('[role="group"] button[aria-pressed]');
      await expect(chips.first()).toBeVisible();
      const count = await chips.count();
      expect(count).toBeGreaterThan(1);
      for (let index = 0; index < count; index += 1) {
        const size = await effectiveSize(chips.nth(index));
        const label = (await chips.nth(index).innerText()).trim();
        expect(size.width, `${path} chip "${label}", effective width`).toBeGreaterThanOrEqual(44);
        expect(size.height, `${path} chip "${label}", effective height`).toBeGreaterThanOrEqual(44);
      }
    }
  });
}
