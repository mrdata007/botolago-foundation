/**
 * G1's first screen across phone sizes (round 2): the card's width and how far the next-round line
 * (`gradins-glance`) ends above the top of the bottom bar (negative = under it), the owner stage in French
 * and Arabic, and the page's `scrollWidth` (which must equal the viewport). The card on G1 follows the
 * phone's height, 232 to 296 px (plan D16 round 2); below about 730 px of height the line cannot clear the
 * bar with a card that is still legible.
 *
 *   BASE=http://127.0.0.1:4440 node docs/product/manager-card-sorare-style/wp4/first-screen-sizes.mjs [--out=<file>]
 */
import { writeFileSync } from "node:fs";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);
const SIZES = [
  [390, 932],
  [412, 915],
  [390, 844],
  [393, 852],
  [375, 812],
  [390, 780],
  [390, 760],
  [390, 750],
  [390, 740],
  [375, 667],
  [360, 780],
  [360, 740],
  [360, 640],
  [320, 568],
];
const b = await launch();
const rows = [];
for (const lang of ["fr", "ar"]) {
  for (const [width, height] of SIZES) {
    const ctx = await ctxFor(b, { lang, width, height, dpr: 1, reduced: true });
    const page = await ctx.newPage();
    await go(page, "/gradins?mc=rated", lang, { ready: false });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const bar = [...document.querySelectorAll("nav")]
        .map((n) => n.getBoundingClientRect())
        .filter((box) => box.width > 200 && box.bottom >= innerHeight - 2)
        .sort((a, c) => c.top - a.top)[0];
      const glance = document
        .querySelector('[data-testid="gradins-glance"]')
        .getBoundingClientRect();
      const stage = document.querySelector('[data-testid="gradins-stage"]').getBoundingClientRect();
      return {
        card: stage.width,
        margin: bar.top - glance.bottom,
        scrollW: document.documentElement.scrollWidth,
        innerW: innerWidth,
      };
    });
    rows.push({
      lang,
      width,
      height,
      card: round2(r.card),
      margin: round2(r.margin),
      scrollW: r.scrollW,
      innerW: r.innerW,
    });
    await ctx.close();
  }
}
await b.close();
const lines = ["size       fr card  fr line     ar card  ar line   scrollWidth = viewport"];
for (const [width, height] of SIZES) {
  const f = rows.find((r) => r.lang === "fr" && r.width === width && r.height === height);
  const a = rows.find((r) => r.lang === "ar" && r.width === width && r.height === height);
  const same = f.scrollW === f.innerW && a.scrollW === a.innerW;
  lines.push(
    `${width}x${height}`.padEnd(9),
    `${String(f.card).padStart(7)} ${String(f.margin).padStart(8)}   ${String(a.card).padStart(7)} ${String(a.margin).padStart(8)}   ${same ? "yes" : `NO ${f.scrollW}/${a.scrollW} in ${f.innerW}`}`,
  );
}
// each size on one line
const out = [lines[0]];
for (let i = 1; i < lines.length; i += 2) out.push(`${lines[i]} ${lines[i + 1]}`);
console.log(out.join("\n"));
if (OUT) writeFileSync(OUT, JSON.stringify({ base: process.env.BASE, rows }, null, 2));
