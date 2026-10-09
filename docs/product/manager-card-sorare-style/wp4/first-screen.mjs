/**
 * What the larger collectible (296 x 479 px on a phone) leaves on G1's first screen: for each state, the
 * bottom of the card, of the rating line (`gradins-identity-line`) and of the next-round line
 * (`gradins-glance`, the 44 px line the e2e spec asserts on the forming card) against the top of the
 * bottom bar, at 390 x 844 and 360 x 740, French and Arabic. A negative margin is under the bar.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/first-screen.mjs [--out=<file>]
 */
import { writeFileSync } from "node:fs";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);
const STATES = [
  "forming1",
  "rated",
  "founder",
  "legend",
  "homa",
  "clubNull",
  "arabicName",
  "longNameLatin",
  "tierUp",
  "seasonClosed",
];
const browser = await launch();
const rows = [];
for (const [width, height] of [
  [390, 844],
  [360, 740],
])
  for (const lang of ["fr", "ar"]) {
    const ctx = await ctxFor(browser, {
      lang,
      theme: "light",
      width,
      height,
      dpr: 1,
      reduced: true,
    });
    const page = await ctx.newPage();
    for (const fx of STATES) {
      await go(page, `/gradins?mc=${fx}`, lang, { ready: false });
      await page.waitForTimeout(1600);
      // a hero, if one arrives, is dismissed first (as the capture does): not needed, the session flag keeps heroes away
      const r = await page.evaluate(() => {
        const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        const nav = [...document.querySelectorAll("nav")]
          .map((n) => n.getBoundingClientRect())
          .filter((b) => b.width > 200 && b.bottom >= innerHeight - 2)
          .sort((a, b) => b.top - a.top)[0];
        const card = rect('[data-testid="gradins-stage"] .mc-eclat');
        const ident = rect('[data-testid="gradins-identity-line"]');
        const glance = rect('[data-testid="gradins-glance"]');
        return {
          navTop: nav?.top ?? null,
          cardBottom: card?.bottom ?? null,
          identBottom: ident?.bottom ?? null,
          glanceBottom: glance?.bottom ?? null,
        };
      });
      rows.push({
        width,
        height,
        lang,
        fx,
        ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : round2(v)])),
        marginIdentity: r.identBottom == null ? null : round2(r.navTop - r.identBottom),
        marginGlance: r.glanceBottom == null ? null : round2(r.navTop - r.glanceBottom),
      });
    }
    await ctx.close();
  }
await browser.close();
for (const [width, height] of [
  [390, 844],
  [360, 740],
]) {
  console.log(
    `${width} x ${height}: margin above the bottom bar (px, negative = under it): identity line / next-round line`,
  );
  for (const fx of STATES) {
    const f = rows.find((r) => r.width === width && r.fx === fx && r.lang === "fr");
    const a = rows.find((r) => r.width === width && r.fx === fx && r.lang === "ar");
    console.log(
      `  ${fx.padEnd(14)} fr ${String(f.marginIdentity).padStart(7)} / ${String(f.marginGlance).padStart(7)}   ar ${String(a.marginIdentity).padStart(7)} / ${String(a.marginGlance).padStart(7)}`,
    );
  }
}
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, rows }, null, 1)}\n`);
