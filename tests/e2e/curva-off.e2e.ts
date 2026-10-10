import { expect, test, type Page } from "@playwright/test";

import { dictionaries } from "../../src/i18n/dictionaries";
import { gotoHydrated, initializeLanguage, observePage } from "./support";

/**
 * Curva with the switch OFF: the build as it ships (`MANAGER_CARD_ENABLED = false`, no preview).
 * The section must not exist for anyone: the bar is today's, the four addresses go back to Fantasy,
 * and no page makes a request, writes a storage key or draws an element that belongs to it
 * (plan sections 3.7 and 9, items 1 to 4; the pixel and server-HTML comparisons against the base
 * tree are `docs/product/manager-card-section/wp1/compare-off.mjs`).
 *
 * Runs against any server that was NOT started with `VITE_MANAGER_CARD_PREVIEW=1`: the default
 * development server (`bun run dev`) or the production build (`E2E_BUILT_OUTPUT=1`). Against a
 * preview server it is skipped, since that server shows the section on purpose.
 */
test.skip(
  process.env.E2E_CURVA_PREVIEW === "1",
  "this is the switch-off run; the server was started with the Curva preview on",
);

type Language = "fr" | "ar";

const ROUTES = ["/curva", "/curva/carte", "/curva/les-votres", "/curva/saisons"] as const;
/** Today's bar, in order: the fifth slot is Pépites. */
const TODAY: Record<Language, string[]> = {
  fr: ["Accueil", "Actualités", "Fantasy", "Matches", "Pépites"],
  ar: ["الرئيسية", "الأخبار", "فانتازي", "المباريات", "جواهر"],
};
const primary = (lang: Language) => dictionaries[lang]["nav.primary"];

async function barLabels(page: Page, lang: Language): Promise<string[]> {
  const bar = page.getByRole("navigation", { name: primary(lang) });
  return bar
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("aria-label") ?? (link.textContent ?? "").trim()),
    );
}

for (const path of ROUTES) {
  test(`${path} answers with the Fantasy hub`, async ({ page }) => {
    await initializeLanguage(page, "fr");
    await page.goto(path);
    await expect(page).toHaveURL(/\/fantasy\/?$/);
    await expect(page.locator("html")).toHaveAttribute("data-lang", "fr");
  });
}

for (const lang of ["fr", "ar"] as const) {
  test(`${lang}: the bar is today's and Pépites is lit on its own pages`, async ({
    page,
  }, testInfo) => {
    // The production build's stub backend (E2E_BUILT_OUTPUT=1) has no Pépites RPCs and answers
    // `pepites_version` with a 404, as it does for the base tree; that is the stub, not the section.
    const diagnostics = observePage(page, {
      allowExpectedResourceConsoleError: true,
      allowResponse: (_status, url) => url.pathname.endsWith("/rpc/pepites_version"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/", lang);
    expect(await barLabels(page, lang)).toEqual(TODAY[lang]);
    await expect(page.locator("html")).not.toHaveAttribute("data-curva", /.*/);

    for (const path of ["/pepites", "/pepites/classement"]) {
      await gotoHydrated(page, path, lang);
      const bar = page.getByRole("navigation", { name: primary(lang) });
      await expect(
        bar.getByRole("link", { name: dictionaries[lang]["nav.pepites"] }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        bar.getByRole("link", { name: dictionaries[lang]["nav.fantasy"] }),
      ).not.toHaveAttribute("aria-current", "page");
    }
    await diagnostics.verify(testInfo);
  });

  test(`${lang}: the desktop top bar is today's too`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await initializeLanguage(page, lang);
    await gotoHydrated(page, "/", lang);
    expect(await barLabels(page, lang)).toEqual(TODAY[lang]);
  });
}

test("no page makes a request, writes a storage key or draws an element that belongs to the section", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.setViewportSize({ width: 390, height: 844 });
  await initializeLanguage(page, "fr");

  const keysOf = (target: Page) =>
    target.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));

  for (const path of ["/", "/fantasy", "/pepites", "/matches"]) {
    await gotoHydrated(page, path, "fr");
    await page.waitForLoadState("networkidle");
    const keys = await keysOf(page);
    const owned = [...keys.local, ...keys.session].filter((key) =>
      /^botolago\.(card\.|curva\.|mc\.)/.test(key),
    );
    expect(owned, `storage keys written by the section on ${path}`).toEqual([]);
    for (const testId of [
      "hub-card-block",
      "fantasy-hub-pepites-tile",
      "card-born-panel",
      "curva-owner",
      "curva-guest",
    ]) {
      await expect(page.getByTestId(testId), `${testId} on ${path}`).toHaveCount(0);
    }
    // Pépites keeps its own home band, without the way back to Fantasy while the section is off.
    if (path === "/pepites") await expect(page.getByTestId("pepites-back")).toHaveCount(0);
  }
  // A development server serves each source file under /src; a build serves hashed chunks under
  // /assets. Either way nothing of the card, its data layer or the screens may be asked for. The one
  // module every page may load is `fixture-selection.ts`: a dozen lines that read nothing unless a
  // development URL carries `?mc=` (the status read's own import), and a build folds it into the entry.
  const touched = requests
    .filter((pathname) => !pathname.endsWith("/backend/manager-card/fixture-selection.ts"))
    .filter((pathname) =>
      /\/src\/(components\/(curva|manager-card)\/|backend\/manager-card\/|services\/manager-card\.ts)|\/assets\/[^/]*(curva|manager-card|eclat)/i.test(
        pathname,
      ),
    );
  expect(touched, "requests for a module or chunk of the section").toEqual([]);
});
