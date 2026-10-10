/**
 * Captures what a reader gets from a running build of the app, for the "off means identical"
 * comparison of the Manager Card section (plan 3.7 and 9.1 to 9.4).
 *
 *   node docs/product/manager-card-section/wp1/capture-off.mjs <baseUrl> <outDir> [--motion]
 *
 * Run it against the base tree and against the branch with the build switch off, each on its own
 * server, then `compare-off.mjs`. For every page, language, theme and width it saves
 *   - the viewport screenshot (`<page>-<lang>-<theme>-<width>.png`, 390 x 844 at 2x and 1440 x 900
 *     at 1x, the sizes of docs/product/manager-card-section/before/),
 *   - a screenshot of the navigation bar alone,
 *   - the server's HTML for the page (`html/<page>.html`),
 * and in `report.json` the set of requests the page made (method and path, hashes in file names
 * normalised), the localStorage and sessionStorage keys after load, and every console error.
 *
 * The clock is fixed at one instant, so a countdown reads the same in every capture, and motion is
 * reduced unless `--motion`, so nothing is mid-animation. The language, the splash and the
 * welcome dialogs are seeded as `tests/e2e/support.ts` does. START YOUR OWN SERVER ON YOUR OWN
 * PORT: another worktree's server on a shared port measures the wrong tree.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const [baseUrl, outDir, ...flags] = process.argv.slice(2);
if (!baseUrl || !outDir) throw new Error("usage: capture-off.mjs <baseUrl> <outDir> [--motion]");
const motion = flags.includes("--motion");
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FIXED_TIME = new Date(process.env.CAPTURE_TIME ?? "2026-10-08T20:00:00Z");

// `home` is what a first-time visitor sees (the landing page, as in the owner's reference set);
// `home-returning` is Home for someone who has been welcomed already.
const PAGES = [
  { slug: "home", path: "/", welcomed: false },
  { slug: "home-returning", path: "/" },
  { slug: "fantasy", path: "/fantasy" },
  { slug: "pepites", path: "/pepites" },
];
const HTML_ONLY = [{ slug: "matches", path: "/matches" }];
const SIZES = [
  { width: 390, height: 844, scale: 2 },
  { width: 1440, height: 900, scale: 1 },
];
const COMBOS = [
  ["fr", "light"],
  ["ar", "light"],
  ["fr", "dark"],
];

/** `/assets/BottomNav-DXPT8rjA.js` -> `/assets/BottomNav-#.js`: a rebuilt file keeps its name. */
const normalisePath = (pathname) =>
  pathname.replace(/([-_.])[A-Za-z0-9_-]{8}(\.(?:m?js|css|woff2?|webp|png|svg|json))$/, "$1#$2");

mkdirSync(join(outDir, "html"), { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM });
const report = { baseUrl, motion, pages: {} };

async function visit({ slug, path, welcomed = true }, lang, theme, size, { shoot }) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    locale: lang === "ar" ? "ar" : "fr-FR",
    colorScheme: theme,
    reducedMotion: motion ? "no-preference" : "reduce",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(
    ([l, t, w]) => {
      if (w) localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.language", l);
      localStorage.setItem("botolago.theme", t);
      sessionStorage.setItem("botolago.splashShown", "1");
    },
    [lang, theme, welcomed],
  );
  const requests = new Set();
  const errors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    requests.add(`${request.method()} ${normalisePath(url.pathname)}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.slice(0, 300)}`));
  const response = await page.goto(baseUrl + path, { waitUntil: "networkidle" });
  await page.waitForSelector(`html[data-lang="${lang}"]`);
  await page.waitForTimeout(motion ? 2500 : 1200);
  const name = `${slug}-${lang}-${theme}-${size.width}`;
  if (shoot) {
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    const nav = page.locator("nav[aria-label]:visible").last();
    if ((await nav.count()) > 0) await nav.screenshot({ path: join(outDir, `nav-${name}.png`) });
  }
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  }));
  const html = await (await context.request.get(baseUrl + path)).text();
  if (lang === "fr" && theme === "light" && size.width === 390) {
    writeFileSync(join(outDir, "html", `${slug}.html`), html);
  }
  await context.close();
  return {
    status: response?.status() ?? 0,
    finalPath: new URL(page.url()).pathname,
    requests: [...requests].sort(),
    storage,
    errors,
  };
}

for (const entry of PAGES) {
  for (const size of SIZES) {
    for (const [lang, theme] of COMBOS) {
      // The owner's reference set has Fantasy dark at 390 only; Home and Pépites dark add nothing.
      if (theme === "dark" && !(entry.slug === "fantasy" && size.width === 390 && lang === "fr"))
        continue;
      report.pages[`${entry.slug}-${lang}-${theme}-${size.width}`] = await visit(
        entry,
        lang,
        theme,
        size,
        {
          shoot: true,
        },
      );
    }
  }
}
for (const entry of HTML_ONLY) {
  report.pages[`${entry.slug}-fr-light-390`] = await visit(entry, "fr", "light", SIZES[0], {
    shoot: false,
  });
}

// The section's own addresses: with the switch off they all go to Fantasy.
const redirects = {};
const probe = await browser.newContext();
for (const path of ["/curva", "/curva/carte", "/curva/les-votres", "/curva/saisons"]) {
  const response = await probe.request.get(baseUrl + path, { maxRedirects: 0 });
  redirects[path] = { status: response.status(), location: response.headers()["location"] ?? null };
}
await probe.close();
report.redirects = redirects;

await browser.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`Captured ${Object.keys(report.pages).length} page states into ${outDir}`);
