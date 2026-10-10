/**
 * WP6b pictures: the screens the finish-review fixes touch, at 390 x 844 (and 1440 x 900 where
 * stated), French and Arabic, motion reduced and the card settled.
 *
 *   BASE=http://127.0.0.1:4186 node docs/product/manager-card-section/wp6b/capture.mjs [--only g1,guest,tryon,club,g2]
 *   python3 docs/product/manager-card-section/wp6b/shrink-pictures.py
 *
 * Files: `after/<name>-<fr|ar>-<light|dark>-<390|1440>[-full].png`. The dev server must run with the
 * preview on and the mock modes (see INDEX.md). Signing in is done through storage, as WP3's harness.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const base = process.env.BASE ?? "http://127.0.0.1:4186";
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, process.env.OUT ?? "after");
mkdirSync(out, { recursive: true });
const only = process.argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice(7)
  .split(",");

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

/** group, picture name, route, signed in, widths, full page too, extra steps. */
const SHOTS = [
  ["g1", "g1-forming1", "/gradins?mc=forming1", true, [390], true],
  ["g1", "g1-rated", "/gradins?mc=rated", true, [390], false],
  ["g1", "g1-seasonClosed", "/gradins?mc=seasonClosed", true, [390], false],
  ["guest", "g1-guest", "/gradins", false, [390], false],
  ["tryon", "g1-guest-tryon", "/gradins", false, [390], false, "tryon"],
  ["club", "g1-club-block", "/gradins?mc=forming1", true, [390], false, "club"],
  ["g2", "g2-rated", "/gradins/carte?mc=rated", true, [390], true],
  ["g2", "g6-rated", "/gradins/saisons?mc=rated", true, [390], true],
];

const pw = await import(PW_CORE);
const browser = await pw.chromium.launch({ executablePath: CHROME });
for (const [group, name, route, signedIn, widths, full, step] of SHOTS) {
  if (only && !only.includes(group)) continue;
  for (const lang of ["fr", "ar"]) {
    for (const theme of ["light", "dark"]) {
      if (theme === "dark" && !["g1-forming1", "g1-guest-tryon", "g2-rated"].includes(name))
        continue;
      for (const width of widths) {
        const context = await browser.newContext({
          viewport: { width, height: width === 1440 ? 900 : 844 },
          deviceScaleFactor: 1,
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
            if (signedIn) {
              localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
              localStorage.setItem(
                "botolago.auth.session",
                JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
              );
            }
          },
          [lang, DEMO(lang), theme, signedIn],
        );
        await page.goto(`${base}${route}`, { waitUntil: "load" });
        await page.waitForTimeout(5000);
        if (step === "tryon") {
          await page
            .getByTestId("gradins-try-on")
            .scrollIntoViewIfNeeded()
            .catch(() => {});
          await page.waitForTimeout(300);
        }
        if (step === "club") {
          await page
            .getByTestId("gradins-club")
            .scrollIntoViewIfNeeded()
            .catch(() => {});
          await page.waitForTimeout(300);
        }
        const file = `${name}-${lang}-${theme}-${width}`;
        await page.screenshot({ path: join(out, `${file}.png`) });
        if (full && theme === "light") {
          await page.setViewportSize({
            width,
            height: Math.min(
              6000,
              await page.evaluate(() => document.documentElement.scrollHeight),
            ),
          });
          await page.waitForTimeout(500);
          await page.screenshot({ path: join(out, `${file}-full.png`) });
        }
        await context.close();
        console.log(file);
      }
    }
  }
}
await browser.close();
