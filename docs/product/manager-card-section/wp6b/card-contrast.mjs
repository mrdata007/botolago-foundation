/**
 * Plan 9, item 11, for the card's own labels: the knitted number (or its dash), the knitted name
 * and the patch's figures, codes and footer, measured from rasterised pixels at the stage's size.
 * For each card state it screenshots the page at three pixels per CSS pixel, finds the boxes of
 * the card's text and of the number from the page, and writes `card-contrast-<tag>.json`;
 * `card-contrast.py <tag>` then reads the pictures (backdrop = the commonest colour on the ring
 * around a box, ink = the colour furthest from it that occurs at least three times inside) and
 * prints the contrast of each against the 3:1 floor of large figures and the 4.5:1 of small text.
 *
 *   BASE=http://127.0.0.1:4186 TAG=run OUT=/tmp/cc node docs/product/manager-card-section/wp6b/card-contrast.mjs
 *   (cd /tmp/cc && python3 <repo>/docs/product/manager-card-section/wp6b/card-contrast.py run)
 */
import { mkdirSync, writeFileSync } from "node:fs";

const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const base = process.env.BASE ?? "http://127.0.0.1:4186";
const tag = process.env.TAG ?? "run";
const OUT = process.env.OUT ?? ".";
mkdirSync(OUT, { recursive: true });
const pw = await import(PW_CORE);
const DEMO = (lang) => ({
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
// the card page shows one full card at the stage's size and no hero
const FIXTURES = (
  process.env.FIXTURES ??
  "rated,forming1,founder,legend,clubNull,longNameLatin,arabicName,homa,tierUp"
).split(",");
const browser = await pw.chromium.launch({ executablePath: CHROME });
const res = [];
for (const fixture of FIXTURES)
  for (const lang of ["fr", "ar"])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 1000 },
        deviceScaleFactor: 3,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.addInitScript(
        ([lang, demo, theme]) => {
          localStorage.setItem("botolago.prizes.welcome.v1", "1");
          localStorage.setItem("botolago.welcomed", "1");
          localStorage.setItem("botolago.language", lang);
          localStorage.setItem("botolago.theme", theme);
          sessionStorage.setItem("botolago.splashShown", "1");
          localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
          localStorage.setItem(
            "botolago.auth.session",
            JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
          );
        },
        [lang, DEMO(lang), theme],
      );
      await page.goto(`${base}/gradins/carte?mc=${fixture}`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="gradins-stage"][data-mc-ready="1"]', {
        timeout: 30000,
      });
      await page.waitForTimeout(1500);
      const found = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="gradins-stage"]');
        const svg = stage.querySelector("svg");
        const box = (node) => {
          const r = node.getBoundingClientRect();
          return [r.left + scrollX, r.top + scrollY, r.width, r.height];
        };
        const texts = [...svg.querySelectorAll("text")]
          .filter(
            (node) => (node.textContent ?? "").trim() && node.getBoundingClientRect().width > 2,
          )
          .map((node) => ({
            kind: "text",
            label: (node.textContent ?? "").trim().slice(0, 24),
            size: Math.round(node.getBoundingClientRect().height * 10) / 10,
            box: box(node),
          }));
        const ovr = svg.querySelector('[data-mc="ovr"] g[fill]');
        const number = ovr
          ? [
              {
                kind: "number",
                label: "number",
                size: Math.round(ovr.getBoundingClientRect().height),
                box: box(ovr),
                fill: ovr.getAttribute("fill"),
              },
            ]
          : [];
        return {
          items: [...number, ...texts],
          scale: devicePixelRatio,
          width: Math.round(svg.getBoundingClientRect().width),
        };
      });
      const file = `${OUT}/cc-${tag}-${fixture}-${lang}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      res.push({ fixture, lang, theme, file, ...found });
      console.log(fixture, lang, theme, found.items.length, "boxes, card", found.width, "px wide");
      await context.close();
    }
await browser.close();
writeFileSync(`${OUT}/card-contrast-${tag}.json`, JSON.stringify(res));
