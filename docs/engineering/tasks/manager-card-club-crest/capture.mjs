/**
 * Before/after screenshots of the Manager Card's tab disc (the club crest change), on the card page
 * of a development server started in the mock data modes (no database is read or written):
 *
 *   BASE=http://127.0.0.1:4377 node docs/engineering/tasks/manager-card-club-crest/capture.mjs \
 *     --phase=before|after [--crest=ok|broken] [--fixture=rated] [--themes=light,dark]
 *
 * The mock football catalogue has no crest images, so for these screenshots only the browser's copy
 * of the mock repository is given a crest URL per club (`https://crest.test/<club>.png`) and that
 * URL is answered with `test-crest.png`, an invented shield marked « TEST » (`--crest=ok`), or with
 * a 404 (`--crest=broken`, the fallback). Nothing in the app is changed for this.
 *
 * Writes `screenshots/<phase>-<crest>-<fixture>-<width>-<lang>-<theme>.png` (the stage) and
 * `…-tab.png` (the tab, enlarged), and prints what was found on each card.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ctxFor, go, launch } from "../../../product/manager-card-sorare-style/wp4/lib.mjs";

const arg = (name, fallback) =>
  process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const PHASE = arg("phase", "after");
const CREST = arg("crest", "ok");
const FIXTURE = arg("fixture", "rated");
const THEMES = arg("themes", "light").split(",");
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const crestPng = readFileSync(here("./test-crest.png"));

const browser = await launch();
const report = [];
for (const width of [390, 1440])
  for (const theme of THEMES)
    for (const lang of ["fr", "ar"]) {
      const ctx = await ctxFor(browser, {
        lang,
        theme,
        width,
        height: 1100,
        dpr: 2,
        reduced: true,
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
      await page.route("**/src/backend/football/mock-repository.ts*", async (route) => {
        const response = await route.fetch();
        const body = (await response.text()).replace(
          /crestUrl: null/g,
          "crestUrl: `https://crest.test/${source.id}.png`",
        );
        await route.fulfill({ response, body });
      });
      await page.route("https://crest.test/**", (route) =>
        CREST === "ok"
          ? route.fulfill({ status: 200, contentType: "image/png", body: crestPng })
          : route.fulfill({ status: 404, body: "" }),
      );
      await go(page, `/curva/carte?mc=${FIXTURE}`, lang);
      await page.waitForTimeout(1500);
      const stage = page.locator('[data-testid="curva-stage"]').first();
      const found = await stage.evaluate((el) => {
        const card = el.querySelector(".mc-eclat");
        const crest = card?.querySelector('image[data-meta="crest"]');
        const initials = card?.querySelector('text[data-meta="initials"]');
        const box = card?.getBoundingClientRect();
        const c = crest?.getBoundingClientRect();
        return {
          crest: crest ? crest.getAttribute("href") : null,
          crestBox: c
            ? {
                cx: Math.round(((c.left + c.width / 2 - box.left) / box.width) * 1000) / 1000,
                w: Math.round(c.width * 10) / 10,
              }
            : null,
          initials: initials?.textContent ?? null,
          cardWidth: box ? Math.round(box.width) : null,
        };
      });
      const name = `${PHASE}-${CREST}-${FIXTURE}-${width}-${lang}-${theme}`;
      await stage.screenshot({ path: here(`./screenshots/${name}.png`) });
      const card = page.locator('[data-testid="curva-stage"] .mc-eclat').first();
      const r = await card.boundingBox();
      if (r) {
        const w = r.width * 0.36;
        const h = r.width * 0.32;
        await page.screenshot({
          path: here(`./screenshots/${name}-tab.png`),
          clip: { x: lang === "ar" ? r.x + r.width - w : r.x, y: r.y, width: w, height: h },
        });
      }
      report.push({ name, ...found, errors });
      await ctx.close();
    }
await browser.close();
console.log(JSON.stringify(report, null, 2));
