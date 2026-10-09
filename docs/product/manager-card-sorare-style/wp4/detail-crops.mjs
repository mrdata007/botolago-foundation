/**
 * Brief, "Detail and crispness" and "a close-up crop per tier in the after set": zoomed crops of the
 * card on the card page of the development server, at 3 device pixels per CSS pixel (and 2 for the
 * crispness pair), straight from the page.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/detail-crops.mjs --out=<dir>
 *
 * Files (PNG, converted to WebP by `before/to-webp.py`):
 *   art-<tier>-fr-<theme>.png      the shield window, the jersey and the number of each tier, 296 px card
 *   plate-<tier>-fr-dark.png       the plaque, the name, the stats and the serial of each tier
 *   art-legend-ar-dark.png, plate-legend-ar-dark.png     the same, Arabic
 *   crisp-<tier>-dpr<2|3>-<rest|tilt>.png    a PRO and a LEGEND card whole, at rest and with the pointer
 *                                 over the leading upper part (mid-tilt), at DPR 2 and 3
 * `capture-log-detail.json` records the clip of each picture and the computed transform of the tilt
 * element at the moment it was taken (none at rest, a matrix3d under the pointer).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ctxFor, go, launch, watch } from "./lib.mjs";

const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);
if (!OUT) throw new Error("--out=<dir> is required");
mkdirSync(OUT, { recursive: true });

const TIERS = [
  ["base", "forming1"],
  ["lastreet", "homa"],
  ["stade", "tierDown"],
  ["pro", "rated"],
  ["champion", "tierUp"],
  ["legend", "legend"],
];

const browser = await launch();
const log = [];

async function open(lang, theme, fixture, dpr) {
  const ctx = await ctxFor(browser, { lang, theme, width: 390, height: 1100, dpr, reduced: false });
  const page = await ctx.newPage();
  const problems = watch(page);
  await go(page, `/gradins/carte?mc=${fixture}`, lang, { clock: false });
  await page.waitForTimeout(1800);
  const root = page.getByTestId("gradins-stage").locator(".mc-eclat");
  await root.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.mouse.move(1, 1);
  return { ctx, page, root, problems };
}

for (const theme of ["light", "dark"])
  for (const [tier, fixture] of TIERS) {
    const { ctx, page, root, problems } = await open("fr", theme, fixture, 3);
    const box = await root.boundingBox();
    const art = {
      x: box.x,
      y: box.y + box.height * 0.04,
      width: box.width,
      height: box.height * 0.58,
    };
    await page.screenshot({ path: join(OUT, `art-${tier}-fr-${theme}.png`), clip: art });
    log.push({ name: `art-${tier}-fr-${theme}`, clip: art, problems });
    if (theme === "dark") {
      const plate = {
        x: box.x,
        y: box.y + box.height * 0.64,
        width: box.width,
        height: box.height * 0.36,
      };
      await page.screenshot({ path: join(OUT, `plate-${tier}-fr-dark.png`), clip: plate });
      log.push({ name: `plate-${tier}-fr-dark`, clip: plate });
    }
    await ctx.close();
  }

{
  const { ctx, page, root } = await open("ar", "dark", "legend", 3);
  const box = await root.boundingBox();
  await page.screenshot({
    path: join(OUT, "art-legend-ar-dark.png"),
    clip: { x: box.x, y: box.y + box.height * 0.04, width: box.width, height: box.height * 0.58 },
  });
  await page.screenshot({
    path: join(OUT, "plate-legend-ar-dark.png"),
    clip: { x: box.x, y: box.y + box.height * 0.64, width: box.width, height: box.height * 0.36 },
  });
  log.push({ name: "art-legend-ar-dark" }, { name: "plate-legend-ar-dark" });
  await ctx.close();
}

for (const dpr of [2, 3])
  for (const [tier, fixture] of [
    ["pro", "rated"],
    ["legend", "legend"],
  ]) {
    const { ctx, page, root } = await open("fr", "dark", fixture, dpr);
    const box = await root.boundingBox();
    const clip = {
      x: Math.max(0, box.x - 14),
      y: Math.max(0, box.y - 10),
      width: box.width + 28,
      height: box.height + 34,
    };
    const tiltOf = () =>
      root.evaluate((r) => getComputedStyle(r.querySelector(".mc-eclat__tilt")).transform);
    const rest = await tiltOf();
    await page.screenshot({ path: join(OUT, `crisp-${tier}-dpr${dpr}-rest.png`), clip });
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3, { steps: 5 });
    await page.waitForTimeout(1300);
    const tilt = await tiltOf();
    await page.screenshot({ path: join(OUT, `crisp-${tier}-dpr${dpr}-tilt.png`), clip });
    log.push({
      name: `crisp-${tier}-dpr${dpr}`,
      clip,
      restTransform: rest,
      tiltTransform: tilt.slice(0, 60),
    });
    await ctx.close();
  }
await browser.close();
writeFileSync(
  join(OUT, "capture-log-detail.json"),
  `${JSON.stringify({ base: process.env.BASE, pictures: log }, null, 2)}\n`,
);
console.log(`${log.length} entries`);
for (const l of log.filter((x) => x.restTransform !== undefined))
  console.log(l.name, "rest:", l.restTransform, "| tilt:", l.tiltTransform);
