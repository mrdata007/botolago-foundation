/**
 * Captures every Gradins screen and state of WP3 (plan 8.5), at 390 × 844 and 1440 × 900, in
 * French and Arabic, light and dark, against a development server you started yourself:
 *
 *   cd <worktree> && VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock \
 *     VITE_AUTH_MODE=mock VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock \
 *     VITE_PEPITES_DATA_MODE=mock bun run dev -- --host 127.0.0.1 --port 4183 --strictPort
 *   node docs/product/manager-card-section/wp3/capture.mjs [--only g1,g2] [--langs fr,ar]
 *        [--themes light,dark] [--widths 390,1440] [--full] [--scale 2|1] [--out <dir>]
 *
 * Files are `<screen>-<fixture>-<lang>-<theme>-<width>.png`, the first screenful as the reader sees
 * it (the bottom bar is the bar of the screen). `--full` also writes `…-full.png`: the whole page
 * at 390 (a viewport as tall as the page), French and Arabic, light only. Prints one line per picture with any console error, failed
 * request or HTTP 4xx the page produced (there should be none).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { launch, logCollector, newContext, open, patchMock } from "./harness.mjs";
import { STATES } from "./states.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const OUT = flag("out", here);
const ONLY = (flag("only", "") ?? "").split(",").filter(Boolean);
const LANGS = (flag("langs", "fr,ar") ?? "").split(",");
const THEMES = (flag("themes", "light,dark") ?? "").split(",");
const WIDTHS = (flag("widths", "390,1440") ?? "").split(",").map(Number);
const FULL = args.includes("--full");

// `--scale 1` writes the pictures at their CSS size (the committed set); the default is a
// two-pixel-per-pixel phone, which is what a review of details uses.
const PHONE_SCALE = Number(flag("scale", "2"));
const SIZE = { 390: { height: 844, scale: PHONE_SCALE }, 1440: { height: 900, scale: 1 } };

mkdirSync(OUT, { recursive: true });
const browser = await launch();
let pictures = 0;
let problems = 0;

for (const lang of LANGS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const state of STATES) {
        if (ONLY.length && !ONLY.some((prefix) => state.id.startsWith(prefix))) continue;
        if (state.widths && !state.widths.includes(width)) continue;
        const context = await newContext(browser, {
          lang,
          theme,
          width,
          height: SIZE[width].height,
          scale: SIZE[width].scale,
          visitor: state.visitor,
          noTeam: state.noTeam,
        });
        const page = await context.newPage();
        const logs = logCollector(page);
        await patchMock(page, state.patch);
        await open(page, state.path, lang, { settle: 3500 });
        if (state.open === "h2h") {
          await page.locator('[data-testid="gradins-people-open"]').first().click();
          await page.waitForTimeout(1500);
        }
        const base = `${state.id}-${lang}-${theme}-${width}`;
        await page.screenshot({ path: join(OUT, `${base}.png`) });
        if (FULL && width === 390 && theme === "light" && !state.open && !state.widths) {
          // The viewport grows to the page, so the fixed bottom bar sits at the foot of the
          // picture instead of floating in the middle of a stitched full-page capture.
          const total = await page.evaluate(() => document.documentElement.scrollHeight);
          await page.setViewportSize({ width, height: total });
          await page.waitForTimeout(600);
          await page.screenshot({ path: join(OUT, `${base}-full.png`) });
        }
        pictures += 1;
        if (logs.length) problems += 1;
        console.log(`${base} ${logs.length ? logs.join(" | ") : "ok"}`);
        await context.close();
      }
    }
  }
}
await browser.close();
console.log(`${pictures} pictures, ${problems} with a console error or a failed request`);
