import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { dictionaries } from "../../src/i18n/dictionaries";
import { STUB_SUPABASE_ORIGIN } from "./built-output-env";
import {
  expectNoClippedMatchCards,
  expectNoHorizontalOverflow,
  expectNothingOffScreen,
  initializeLanguage,
  observePage,
} from "./support";

/**
 * The production bundle: the Worker module and assets in `.output`, served
 * under Bun with the binding Cloudflare gives it (built-output-serve.ts says
 * what that leaves out) (audit 2026-09-25, A09). Every other browser suite
 * here runs against the Vite development server, so a fault that exists only
 * once the site is built -- the server entry's wrapper, minified CSS, the SSR
 * bundle, static files -- had nothing to catch it before a deploy.
 *
 * Data comes from the local stub backend (stub-supabase.ts), never from the
 * production project: the bundle is built against the stub, and every request
 * that leaves 127.0.0.1 is answered or refused here in the browser.
 *
 *   bun tests/e2e/built-output-build.ts
 *   E2E_BUILT_OUTPUT=1 bunx playwright test tests/e2e/built-output.smoke.e2e.ts
 */

test.skip(
  process.env.E2E_BUILT_OUTPUT !== "1",
  "Needs the production build: set E2E_BUILT_OUTPUT=1 after bun tests/e2e/built-output-build.ts.",
);

test.use({ viewport: { width: 390, height: 844 } });

type Language = "fr" | "ar";
type Copy = (typeof dictionaries)[Language];

/**
 * A match card: a link to one match. Not the static "Classement" tab or
 * "view all" link, which also start with `/matches/` and render with no data.
 */
const MATCH_CARD = 'main a[href^="/matches/"]:not([href^="/matches/standings"])';

/**
 * Each page, and what on it only renders once its data has: never a static
 * link or heading that an empty or failed page shows as well.
 */
const PAGES: ReadonlyArray<{
  path: string;
  nav: boolean;
  content: (page: Page, copy: Copy) => Locator;
}> = [
  { path: "/", nav: true, content: (page) => page.locator(MATCH_CARD) },
  { path: "/news", nav: true, content: (page) => page.locator('main a[href^="/news/"]') },
  { path: "/matches", nav: true, content: (page) => page.locator(MATCH_CARD) },
  { path: "/matches/standings", nav: true, content: (page) => page.locator("main table tbody tr") },
  { path: "/clubs", nav: true, content: (page) => page.locator('main a[href^="/clubs/"]') },
  // The gameweek band, named "Journée 1", comes from `fantasy_hub`; the hub's
  // shortcut tiles and rule links are there whatever the hub answered.
  {
    path: "/fantasy",
    nav: true,
    content: (page, copy) =>
      page.getByRole("main").getByRole("region", { name: `${copy["fpl.gameweek"]} 1` }),
  },
  {
    path: "/auth/login",
    nav: false,
    content: (page) => page.locator('main input[type="password"]'),
  },
];

/** What a page shows in place of its data when a read failed. */
const ERROR_COPY = ["state.error", "fpl.error.title"] as const;

/**
 * Third-party files the pages load. Answered empty so the run is offline and
 * the same every time; the measurement script sends nothing off botolago.com
 * in any case.
 */
const THIRD_PARTY: Readonly<Record<string, string>> = {
  "fonts.googleapis.com": "text/css",
  "fonts.gstatic.com": "font/woff2",
  "cdn.seline.com": "application/javascript",
};

/** Keeps the browser on this machine; returns what tried to leave it. */
async function keepOffline(context: BrowserContext): Promise<string[]> {
  const unexpected: string[] = [];
  await context.route(
    (url) => url.hostname !== "127.0.0.1",
    (route) => {
      const url = new URL(route.request().url());
      const contentType = THIRD_PARTY[url.hostname];
      if (contentType) return route.fulfill({ status: 200, contentType, body: "" });
      unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    },
  );
  return unexpected;
}

/**
 * RPCs the stub had no answer for since the last call: what to add to
 * stub-supabase.ts. Read and cleared, so each test answers for its own pages.
 */
async function unansweredStubCalls(page: Page): Promise<string[]> {
  const response = await page.request.delete(`${STUB_SUPABASE_ORIGIN}/__stub/unhandled`);
  return (await response.json()) as string[];
}

for (const language of ["fr", "ar"] as const satisfies readonly Language[]) {
  test(`${language}: the built pages serve, hydrate and render their data`, async ({
    page,
    context,
  }, testInfo) => {
    const leftTheMachine = await keepOffline(context);
    const diagnostics = observePage(page);
    const copy = dictionaries[language];
    await initializeLanguage(page, language);
    await unansweredStubCalls(page);

    for (const { path, nav, content } of PAGES) {
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status(), `${path}: HTTP status`).toBe(200);
      // Set by src/server.ts: this is the site's own server entry answering.
      expect(response?.headers()["x-botolago-release"], `${path}: release header`).toBeTruthy();

      // The chosen language is the browser's, so these only hold once the
      // client has hydrated and taken over from the server's HTML.
      const html = page.locator("html");
      await expect(html, path).toHaveAttribute("lang", language);
      await expect(html, path).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
      await expect(html, path).toHaveAttribute("data-lang", language);

      await expect(page.locator("header").first(), `${path}: header`).toBeVisible();
      await expect(page.getByRole("main"), `${path}: main`).toBeVisible();
      await expect(page.locator("h1"), `${path}: one h1`).toHaveCount(1);
      if (nav) await expect(page.getByRole("navigation").first(), `${path}: nav`).toBeVisible();
      await expect(content(page, copy).first(), `${path}: rendered data`).toBeVisible();
      // A read that failed renders its error state and no console error, so
      // the diagnostics below would not see it. The login form mounts its
      // field alerts empty, ahead of any message, so only one that says
      // something counts.
      const main = page.getByRole("main");
      await expect(
        main.getByRole("alert").filter({ hasText: /\S/ }),
        `${path}: error alert`,
      ).toHaveCount(0);
      for (const key of ERROR_COPY) {
        await expect(main.getByText(copy[key]), `${path}: "${copy[key]}"`).toHaveCount(0);
      }

      // `html, body { overflow-x: clip }` hides overflow from the scroll
      // width, so the boxes are measured too; a rail's cards are reached by
      // swiping it, so only the rail has to fit.
      await expectNoHorizontalOverflow(page);
      await expectNothingOffScreen(page, "main", { scrollRails: true });
      await expectNoClippedMatchCards(page);
      // BG-0035 again, on minified CSS: the Arabic font must survive the build.
      const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      if (language === "ar") expect(bodyFont, path).toContain("Noto Sans Arabic");
      else expect(bodyFont, path).toContain("Manrope");
    }

    expect(leftTheMachine, "requests that tried to leave 127.0.0.1").toEqual([]);
    expect(await unansweredStubCalls(page), "RPCs the stub backend could not answer").toEqual([]);
    await diagnostics.verify(testInfo);
  });
}

test("robots.txt, sitemap.xml and an unknown address", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain("Sitemap: https://botolago.com/sitemap");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  const xml = await sitemap.text();
  expect(xml).toMatch(/^<\?xml[^>]*>\s*<(urlset|sitemapindex)\b/);
  expect(xml).toContain("<loc>https://botolago.com/");

  const missing = await request.get("/no-such-page");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("text/html");
});
