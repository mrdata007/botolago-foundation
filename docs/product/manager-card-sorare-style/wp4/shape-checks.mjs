/**
 * Brief, "The jersey's dimensions" and "Shield and silhouette", read from the app's geometry in
 * Chromium (`getBBox` of the real paths):
 *
 *   - `getBBox` of the shirt in jersey space is 190, 300, 810, 899.8; length / pit-to-pit is 1.40 to
 *     1.50 and sleeve span / length 0.95 to 1.10 (the unit test's definitions: pit-to-pit is
 *     708 - 292 jersey units); the shirt is symmetric about x 500; the token shirt's box is 276, 300,
 *     724, 897;
 *   - the outline path is byte-identical to revision 2's (the tab and the cut corner), read from
 *     `git show 470beb0e:docs/product/manager-card-sorare-style/mock.html`, and to the revision 3
 *     preview's (`../mock.html`); the shield window is the one of plan 3.2 and the preview's.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/shape-checks.mjs [--out=<file>]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../../..");
const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);

const rev2 = execFileSync(
  "git",
  ["show", "470beb0e:docs/product/manager-card-sorare-style/mock.html"],
  { cwd: repo, encoding: "utf8", maxBuffer: 1 << 26 },
);
const rev3 = readFileSync(join(here, "..", "mock.html"), "utf8");
const pick = (html, name) =>
  new RegExp(`const ${name} =\\s*\\n?\\s*"([^"]+)"`).exec(html)?.[1] ?? null;

const browser = await launch();
const ctx = await ctxFor(browser, {
  lang: "fr",
  theme: "light",
  width: 600,
  height: 900,
  dpr: 1,
  reduced: true,
});
const page = await ctx.newPage();
await go(page, "/gradins?mc=forming1", "fr");
const geo = await page.evaluate(async () => {
  const g = await import("/src/components/manager-card/eclat/geometry.ts");
  const ns = "http://www.w3.org/2000/svg";
  const box = (d) => {
    const svg = document.createElementNS(ns, "svg");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
    document.body.append(svg);
    const b = path.getBBox();
    svg.remove();
    return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
  };
  return {
    outline: g.OUTLINE,
    window: g.WINDOW,
    shirt: box(g.SHIRT),
    shirtToken: box(g.SHIRT_TOKEN),
    sleeveL: box(g.SLEEVE_L),
    sleeveR: box(g.SLEEVE_R),
    chest: g.CHEST,
  };
});
await ctx.close();
await browser.close();

const s = geo.shirt;
const length = s.y1 - s.y0;
const pit = 708 - 292;
const span = s.x1 - s.x0;
const result = {
  shirtBBox: [s.x0, s.y0, s.x1, s.y1].map(round2),
  lengthOverPit: round2(length / pit),
  spanOverLength: round2(span / length),
  centre: round2((s.x0 + s.x1) / 2),
  tokenShirtBBox: [geo.shirtToken.x0, geo.shirtToken.y0, geo.shirtToken.x1, geo.shirtToken.y1].map(
    round2,
  ),
  outlineEqualsRevision2: pick(rev2, "OUTLINE") === geo.outline,
  outlineEqualsRevision3Preview: pick(rev3, "OUTLINE") === geo.outline,
  windowEqualsRevision3Preview: pick(rev3, "WINDOW") === geo.window,
  windowDiffersFromRevision2: pick(rev2, "WINDOW") !== geo.window,
  revision2Outline: pick(rev2, "OUTLINE")?.slice(0, 60),
};
console.log(JSON.stringify(result, null, 1));
const ok =
  result.shirtBBox.join() === "190,300,810,899.8" &&
  result.lengthOverPit > 1.4 &&
  result.lengthOverPit < 1.5 &&
  result.spanOverLength > 0.95 &&
  result.spanOverLength < 1.1 &&
  Math.abs(result.centre - 500) < 0.5 &&
  result.tokenShirtBBox.join() === "276,300,724,897" &&
  result.outlineEqualsRevision2 &&
  result.outlineEqualsRevision3Preview &&
  result.windowEqualsRevision3Preview;
console.log(ok ? "SHAPES: as the brief says" : "SHAPES: DIFFERENT FROM THE BRIEF");
if (OUT)
  writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, ...result, ok }, null, 1)}\n`);
process.exitCode = ok ? 0 : 1;
