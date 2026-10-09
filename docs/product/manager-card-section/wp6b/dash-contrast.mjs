/**
 * WP6b item 3: the unknown-number dash on the Écharpe card, measured from rasterised pixels.
 * For the signed-out guest (undyed wool) and a forming card (a club's ground) it screenshots the card
 * at 3 pixels per CSS pixel, finds the dash's and the number carrier's rectangles from the page, and
 * writes `dash-<tag>.json`; `dash-contrast.py <tag>` then reads the pictures and prints the dash's
 * colour, the rib's two column shades and the contrast of the dash against each.
 *
 *   BASE=http://127.0.0.1:4186 TAG=after OUT=/tmp/dash node docs/product/manager-card-section/wp6b/dash-contrast.mjs
 *   (cd /tmp/dash && python3 <repo>/docs/product/manager-card-section/wp6b/dash-contrast.py after)
 */
import { mkdirSync, writeFileSync } from "node:fs";

const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const base = process.env.BASE ?? "http://127.0.0.1:4186";
const tag = process.env.TAG ?? "now";
const OUT = process.env.OUT ?? ".";
mkdirSync(OUT, { recursive: true });
const only = process.env.ONLY;
const pw = await import(PW_CORE);
const DEMO_USER = (lang) => ({
  id: "usr_demo",
  email: "demo@botolago.ma",
  displayName: "Rachid Demo",
  username: "rachid_demo",
  language: lang,
  notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  profileComplete: true,
  createdAt: "2026-09-01T00:00:00Z",
  verified: true,
  provider: "email",
  favoriteClubId: "war",
  passwordDigest: "x",
});
const cases = [
  ["guest", "/gradins", false],
  ["forming1", "/gradins?mc=forming1", true],
].filter(([name]) => !only || only.split(",").includes(name));
const browser = await pw.chromium.launch({ executablePath: CHROME });
const res = [];
for (const [name, route, signedIn] of cases)
  for (const lang of ["fr", "ar"])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.addInitScript(
        ([lang, demo, theme, signedIn]) => {
          localStorage.setItem("botolago.prizes.welcome.v1", "1");
          localStorage.setItem("botolago.welcomed", "1");
          localStorage.setItem("botolago.language", lang);
          localStorage.setItem("botolago.theme", theme);
          sessionStorage.setItem("botolago.splashShown", "1");
          sessionStorage.setItem("botolago.card.hero_session.v1", "1");
          if (signedIn) {
            localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
            localStorage.setItem(
              "botolago.auth.session",
              JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
            );
          }
        },
        [lang, DEMO_USER(lang), theme, signedIn],
      );
      await page.goto(`${base}${route}`, { waitUntil: "load" });
      await page.waitForSelector('[data-mc="ovr"]', { timeout: 25000 });
      await page.waitForTimeout(3500);
      const geometry = await page.evaluate(() => {
        const ovr = [...document.querySelectorAll('[data-mc="ovr"]')].find(
          (node) => node.getBoundingClientRect().width > 100,
        );
        const hit = ovr.querySelector(".mc-ovr-hit").getBoundingClientRect();
        const rects = [...ovr.querySelectorAll("g[fill] rect")].map((rect) =>
          rect.getBoundingClientRect(),
        );
        const x0 = Math.min(...rects.map((r) => r.left));
        const x1 = Math.max(...rects.map((r) => r.right));
        const y0 = Math.min(...rects.map((r) => r.top));
        const y1 = Math.max(...rects.map((r) => r.bottom));
        return {
          hit: [hit.left, hit.top, hit.width, hit.height],
          dash: [x0, y0, x1 - x0, y1 - y0],
          fill: ovr.querySelector("g[fill]").getAttribute("fill"),
          dpr: devicePixelRatio,
        };
      });
      const file = `${OUT}/dash-${tag}-${name}-${lang}-${theme}.png`;
      await page.screenshot({ path: file });
      res.push({ name, lang, theme, file, ...geometry });
      console.log(name, lang, theme, geometry.fill);
      await context.close();
    }
await browser.close();
writeFileSync(`${OUT}/dash-${tag}.json`, JSON.stringify(res));
