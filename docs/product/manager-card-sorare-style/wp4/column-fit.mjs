/**
 * Brief, "No element escapes 390 px (rectangles, not `scrollWidth`); the card never overflows its
 * column at 320 px either." For every card (`.mc-eclat`) and token (`.mc-tok`, `.mc-token`) on the
 * Curva and Fantasy screens that draw one, at 320, 360, 390, 768 and 1440 px, in French and Arabic:
 * its rectangle against the window and against the rectangle of its nearest ancestor that clips or
 * scrolls (a card in a column that cuts it would be cut), and the width it is drawn at. The page's
 * own overflow is the repository probe's job (`run-probes.sh`, layout).
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/column-fit.mjs [--out=<file>]
 */
import { writeFileSync } from "node:fs";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);
const ROUTES = [
  "/curva?mc=rated",
  "/curva?mc=forming1",
  "/curva?mc=founder",
  "/curva?mc=longNameLatin",
  "/curva?mc=arabicName",
  "/curva?mc=homa",
  "/curva",
  "/curva/carte?mc=rated",
  "/curva/carte?mc=founder",
  "/curva/les-votres?mc=rated",
  "/curva/saisons?mc=rated",
  "/curva?mc=born0Serial",
  "/fantasy?mc=rated",
  "/fantasy?mc=legend",
  "/fantasy/team?mc=born0",
  "/fantasy/rankings?mc=rated",
  "/fantasy/leagues/lg1?mc=rated",
];
const WIDTHS = [320, 360, 390, 768, 1440];

const browser = await launch();
const rows = [];
for (const lang of ["fr", "ar"])
  for (const width of WIDTHS) {
    const ctx = await ctxFor(browser, {
      lang,
      theme: "light",
      width,
      height: 900,
      dpr: 1,
      reduced: true,
      signedIn: true,
    });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      const visitor = route === "/curva";
      const row = { lang, width, route };
      try {
        if (visitor) {
          // the signed-out page: a second context without the demo account
          const vctx = await ctxFor(browser, {
            lang,
            theme: "light",
            width,
            height: 900,
            dpr: 1,
            reduced: true,
            signedIn: false,
          });
          const vpage = await vctx.newPage();
          await go(vpage, route, lang, { ready: false });
          await vpage.waitForTimeout(1500);
          Object.assign(row, await vpage.evaluate(measure));
          await vctx.close();
        } else {
          await go(page, route, lang, { ready: false });
          await page.waitForTimeout(1500);
          Object.assign(row, await page.evaluate(measure));
        }
      } catch (error) {
        row.error = String(error.message).slice(0, 160);
      }
      rows.push(row);
    }
    await ctx.close();
  }
await browser.close();

/** Page side. */
function measure() {
  const vw = document.documentElement.clientWidth;
  const out = { vw, items: 0, outside: [], clipped: [], widths: {} };
  const clipper = (el) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (["hidden", "clip", "auto", "scroll"].includes(s.overflowX) && n !== document.body)
        return n;
    }
    return null;
  };
  for (const el of document.querySelectorAll(".mc-eclat, .mc-tok")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.items += 1;
    const kind = el.classList.contains("mc-tok") ? `token${Math.round(r.height)}` : "card";
    (out.widths[kind] ??= new Set()).add(Math.round(r.width));
    if (r.left < -0.5 || r.right > vw + 0.5)
      out.outside.push(`${kind} ${Math.round(r.left)}..${Math.round(r.right)}`);
    const c = clipper(el);
    if (c) {
      const cr = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      // a scroller (auto/scroll) may extend its content past its box on purpose; a clip must not cut a card
      if (
        ["hidden", "clip"].includes(cs.overflowX) &&
        (r.left < cr.left - 0.5 || r.right > cr.right + 0.5)
      )
        out.clipped.push(
          `${kind} ${Math.round(r.left)}..${Math.round(r.right)} in ${c.tagName}.${String(c.className).slice(0, 30)} ${Math.round(cr.left)}..${Math.round(cr.right)}`,
        );
    }
  }
  out.widths = Object.fromEntries(
    Object.entries(out.widths).map(([k, v]) => [k, [...v].sort((a, b) => a - b)]),
  );
  return out;
}

const bad = rows.filter(
  (r) => r.error || (r.outside?.length ?? 0) > 0 || (r.clipped?.length ?? 0) > 0,
);
const cards = rows
  .filter((r) => r.widths?.card)
  .flatMap((r) => r.widths.card.map((w) => ({ w, width: r.width, route: r.route })));
console.log(
  `${rows.length} screens (${ROUTES.length} routes x ${WIDTHS.length} widths x 2 languages), ${rows.reduce((a, r) => a + (r.items ?? 0), 0)} cards and tokens measured: outside the window ${rows.filter((r) => r.outside?.length).length} screens, cut by a clipping ancestor ${rows.filter((r) => r.clipped?.length).length}, errors ${rows.filter((r) => r.error).length}`,
);
for (const width of WIDTHS) {
  const ws = [...new Set(cards.filter((c) => c.width === width).map((c) => c.w))].sort(
    (a, b) => a - b,
  );
  console.log(`  viewport ${String(width).padStart(4)}: card widths drawn ${ws.join(", ") || "-"}`);
}
for (const r of bad.slice(0, 25))
  console.log(
    "PROBLEM",
    r.lang,
    r.width,
    r.route,
    JSON.stringify({ outside: r.outside, clipped: r.clipped, error: r.error }),
  );
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, rows }, null, 1)}\n`);
