import { test, expect, type Page } from "@playwright/test";

import { gotoHydrated, initializeLanguage, reloadHydrated } from "./support";

// BG-0149 — dark mode is ON (owner decision, 2026-10-05), following the
// phone's setting. DARK_MODE_ENABLED stays the one-line rollback switch, and
// this suite is what tells a rollback from a regression: with the flag on,
// every case below must hold.
//
// The default choice is "system", so the case that matters most is a visitor
// who never opened Profile: a dark phone must get dark from the first paint,
// with no flash of light and no hydration error, and a stored choice must beat
// the phone either way.
//
// (The file keeps its old name so the CI workflow that runs it needs no edit.)

const STORAGE_KEY = "botolago.theme";

type Probe = Record<string, unknown>;

/**
 * Records whether <html> carried `dark` at two moments the page cannot fake
 * after the fact: when <body> first appears (everything in <head>, including
 * the inline theme script, has run; nothing has painted), and at
 * DOMContentLoaded.
 */
async function recordEarlyTheme(page: Page) {
  await page.addInitScript(() => {
    // Init scripts run before the parser has created <html>, so read it late.
    const record = (key: string) => {
      (window as unknown as Probe)[key] =
        document.documentElement?.classList.contains("dark") ?? null;
    };
    const observer = new MutationObserver(() => {
      if (document.body) {
        record("__darkAtBody");
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => record("__darkAtDomContentLoaded"), {
      once: true,
    });
  });
}

const early = (page: Page) =>
  page.evaluate(() => {
    const probe = window as unknown as Probe;
    return { body: probe.__darkAtBody, domContentLoaded: probe.__darkAtDomContentLoaded };
  });

async function storeTheme(page: Page, value: "light" | "dark") {
  await page.addInitScript(
    ([key, theme]) => {
      try {
        window.localStorage.setItem(key, theme);
      } catch {
        /* private mode */
      }
    },
    [STORAGE_KEY, value] as const,
  );
}

/** React's hydration failures, in development wording and as minified codes. */
function watchHydration(page: Page) {
  const errors: string[] = [];
  const hydration = /#418|#423|hydrat|did not match|didn't match/i;
  page.on("console", (message) => {
    if (message.type() === "error" && hydration.test(message.text())) {
      errors.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => {
    if (hydration.test(error.message)) errors.push(error.message.slice(0, 300));
  });
  return errors;
}

const htmlIsDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains("dark"));

test.describe("a dark phone with nothing stored", () => {
  test.use({ colorScheme: "dark" });

  for (const path of ["/", "/profile", "/fantasy", "/matches"] as const) {
    test(`${path} is dark from the first paint, with no hydration error`, async ({ page }) => {
      await initializeLanguage(page, "fr");
      await recordEarlyTheme(page);
      const hydrationErrors = watchHydration(page);
      await gotoHydrated(page, path, "fr");
      await page.waitForLoadState("load");

      expect(await early(page)).toEqual({ body: true, domContentLoaded: true });
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      // The browser's own controls follow too.
      expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
      expect(hydrationErrors).toEqual([]);
    });
  }
});

test.describe("a stored choice beats the phone", () => {
  test.describe("stored dark on a light phone", () => {
    test.use({ colorScheme: "light" });

    test("is dark", async ({ page }) => {
      await initializeLanguage(page, "fr");
      await storeTheme(page, "dark");
      await recordEarlyTheme(page);
      await gotoHydrated(page, "/", "fr");
      expect(await early(page)).toEqual({ body: true, domContentLoaded: true });
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    });
  });

  test.describe("stored light on a dark phone", () => {
    test.use({ colorScheme: "dark" });

    test("is light", async ({ page }) => {
      await initializeLanguage(page, "fr");
      await storeTheme(page, "light");
      await recordEarlyTheme(page);
      await gotoHydrated(page, "/", "fr");
      expect(await early(page)).toEqual({ body: false, domContentLoaded: false });
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    });
  });
});

const COPY = {
  fr: { group: "Apparence", light: "Clair", dark: "Sombre", system: "Système" },
  ar: { group: "المظهر", light: "فاتح", dark: "داكن", system: "النظام" },
} as const;

test.describe("Profil > Apparence", () => {
  test.use({ colorScheme: "light" });

  for (const lang of ["fr", "ar"] as const) {
    test(`${lang}: the radio group is there, and choosing dark is applied and kept`, async ({
      page,
    }) => {
      const copy = COPY[lang];
      await initializeLanguage(page, lang);
      await gotoHydrated(page, "/profile", lang);

      const group = page.getByRole("radiogroup", { name: copy.group });
      await expect(group).toHaveCount(1);
      await expect(group.getByRole("radio")).toHaveCount(3);
      // Nothing stored: the default is "follow the phone".
      await expect(group.getByRole("radio", { name: copy.system })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

      await group.getByRole("radio", { name: copy.dark }).click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBe(
        "dark",
      );

      await reloadHydrated(page, lang);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expect(
        page.getByRole("radiogroup", { name: copy.group }).getByRole("radio", { name: copy.dark }),
      ).toHaveAttribute("aria-checked", "true");
    });

    test(`${lang}: one tab stop, and the arrows move the choice in reading order`, async ({
      page,
    }) => {
      const copy = COPY[lang];
      await initializeLanguage(page, lang);
      await gotoHydrated(page, "/profile", lang);
      const group = page.getByRole("radiogroup", { name: copy.group });
      const system = group.getByRole("radio", { name: copy.system });
      await expect(system).toHaveAttribute("aria-checked", "true");

      // Only the chosen option is in the tab order.
      await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
      await expect(system).toHaveAttribute("tabindex", "0");

      // ArrowLeft goes back in French (Système -> Sombre) and forward in
      // Arabic, where the row reads right to left (wrapping to Clair).
      await system.focus();
      await page.keyboard.press("ArrowLeft");
      const option = group.getByRole("radio", { name: lang === "fr" ? copy.dark : copy.light });
      await expect(option).toHaveAttribute("aria-checked", "true");
      await expect(option).toBeFocused();
      await expect(option).toHaveAttribute("tabindex", "0");
      await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
      if (lang === "fr") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    });
  }

  test("with Système chosen, the phone switching theme is followed without a reload", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await initializeLanguage(page, "fr");
    await gotoHydrated(page, "/profile", "fr");
    await expect(
      page.getByRole("radiogroup", { name: COPY.fr.group }).getByRole("radio", {
        name: COPY.fr.system,
      }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    // A marker on this document: a reload would drop it.
    await page.evaluate(() => {
      (window as unknown as Probe).__sameDocument = true;
    });

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => htmlIsDark(page)).toBe(false);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => htmlIsDark(page)).toBe(true);

    expect(await page.evaluate(() => (window as unknown as Probe).__sameDocument)).toBe(true);
  });
});
