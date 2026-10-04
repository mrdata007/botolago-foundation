import { expect, test } from "@playwright/test";

import { initializeLanguage } from "./support";

/**
 * An empty calendar day leads on (mobile UX refinements, batch 4), in the
 * browser, on the development server's mock data: a few fixtures around
 * today, results a few days back.
 */

test.use({ viewport: { width: 390, height: 844 } });

for (const language of ["fr", "ar"] as const) {
  test(`${language}: a day with nothing on it offers the latest results, and they lead somewhere`, async ({
    page,
  }) => {
    await initializeLanguage(page, language);
    await page.goto("/matches", { waitUntil: "networkidle" });
    // Step back from today until a day is empty (the mock's results are older).
    const previous = page.getByRole("button", {
      name: language === "fr" ? /jour précédent/i : /اليوم السابق/,
    });
    const results = page.getByRole("button", {
      name: language === "fr" ? /derniers résultats/i : /آخر النتائج/,
    });
    for (let step = 0; step < 3 && (await results.count()) === 0; step += 1) {
      await previous.first().click();
      await page.waitForLoadState("networkidle");
    }
    await expect(results).toBeVisible();
    // Nothing failed, so there is no retry on the panel.
    await expect(page.getByRole("button", { name: /réessayer|إعادة المحاولة/i })).toHaveCount(0);
    const emptyDay = new URL(page.url()).searchParams.get("date");

    await results.click();
    await expect(page).toHaveURL(/[?&]date=\d{4}-\d{2}-\d{2}/);
    expect(new URL(page.url()).searchParams.get("date")).not.toBe(emptyDay);
    // The day it leads to has results on it.
    await expect(page.locator('main a[href^="/matches/"]').first()).toBeVisible();
  });
}
