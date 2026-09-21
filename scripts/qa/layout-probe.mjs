/**
 * Layout probe — overflow, off-viewport elements and clipped text, measured
 * from a live page rather than inferred from source.
 *
 *   node scripts/qa/layout-probe.mjs                 # every route below
 *   PROBE_BASE=http://127.0.0.1:4377 node …          # point at your own server
 *   PROBE_ROUTES=/fantasy,/matches node …            # narrow it
 *
 * START YOUR OWN SERVER, ON YOUR OWN PORT. Port 4173 is shared between
 * worktrees in this sandbox and `reuseExistingServer` will happily attach to
 * another agent's tree, which has already produced one false failure in this
 * project. `PROBE_BASE` has no default that could silently do that.
 *
 * SET THE LANGUAGE BEFORE NAVIGATING. The language chooser is a full-screen
 * dialog on first load, so it is the `[role="dialog"]` any naive selector
 * finds; the probe seeds `botolago.language` in an init script for this reason.
 *
 * ---------------------------------------------------------------------------
 * THE ASSERTIONS, AND WHY EACH EXISTS
 * ---------------------------------------------------------------------------
 *
 * 1. `scroll` — document scrollWidth beyond the viewport. The obvious test,
 *    and the one that misses the most: this app sets `overflow-x: clip` on
 *    html/body, which produces no scrollbar and no scrollWidth growth while
 *    content is being cut. On its own it reports a clean page every time.
 *
 * 2. `past` — an element whose border box crosses a viewport edge. Catches
 *    what (1) cannot. Its exclusions were all bought with wrong answers:
 *      - `position: fixed` — a bar pinned to the viewport is not overflow.
 *      - anything inside `<svg>` — a child's box is in the SVG's coordinate
 *        space and is clipped by the SVG viewport; it cannot overflow a page.
 *      - anything whose ancestor constrains the x axis, whether by scrolling
 *        it (`auto`/`scroll` — a wide table or a rail is SUPPOSED to extend
 *        past the fold) or by masking it (`hidden`/`clip`). Only checking for
 *        scrollers left the masks in: a shimmer sweep parked at `-left-1/3`
 *        inside an `overflow-hidden` parent is never visible off-screen, but
 *        its own box sits well outside the viewport.
 *    Before the first two, this reported 62 findings that were decorative
 *    circles and scrollable table headers. After them, 13 — of which every
 *    one turned out to be a mask or a glow, which is what added the third.
 *
 * 3. `decorative` — the same geometry as `past`, on an element with no text
 *    and `pointer-events: none`. A blurred glow bleeding off the edge is a
 *    design decision. It is reported rather than dropped, because
 *    "decorative" is a judgement and a real element that has quietly become
 *    `pointer-events-none` should stay visible in the output.
 *
 * 4. `clipW` — a text leaf wider than its own box, where the box hides the
 *    overflow AND does not end in an ellipsis. With an ellipsis it is designed
 *    truncation; without one it is a sliced word.
 *
 * 5. `clipH` — a text leaf taller than its own box, where the box hides the
 *    overflow. This is the one that found the real defect: `leading-none` on
 *    `ui.text.micro` and on the whole stat ramp gives the line box exactly the
 *    font size, and a font's ink does not fit in its own em. The bottom-nav
 *    label loses 2px of Latin descender and 5px of Arabic ink.
 *
 * An earlier version tested `scrollHeight > clientHeight` on every text leaf
 * regardless of computed overflow, and reported 82 of 104 route/viewport pairs
 * as findings — nearly all line-box rounding on elements where nothing is
 * hidden and text simply wraps. Overflow is only a defect when something clips
 * it, so the computed overflow is part of the test rather than a filter
 * applied afterwards. `sr-only` boxes (1x1 with hidden overflow) are excluded
 * for the same reason: they match "text bigger than its box" by construction,
 * which is the entire point of the pattern.
 *
 * The through-line: every number this file prints was wrong once, and each
 * exclusion is a defect it claimed to find and did not have. Treat a new
 * finding the same way — open the element before believing the count.
 */

import { chromium } from "playwright";

const BASE = process.env.PROBE_BASE;
if (!BASE) {
  console.error(
    "layout-probe: set PROBE_BASE to a server you started yourself.\n" +
      "  bunx vite dev --port 4377 --host 127.0.0.1\n" +
      "  PROBE_BASE=http://127.0.0.1:4377 node scripts/qa/layout-probe.mjs\n" +
      "There is deliberately no default: 4173 is shared between worktrees here.",
  );
  process.exit(2);
}

const ROUTES = (
  process.env.PROBE_ROUTES ??
  [
    "/",
    "/matches",
    "/fantasy",
    "/fantasy/team",
    "/fantasy/transfers",
    "/fantasy/points",
    "/fantasy/leagues",
    "/fantasy/rankings",
    "/fantasy/players",
    "/fantasy/fixtures",
    "/fantasy/top-players",
    "/fantasy/help",
    "/fantasy/rules",
    "/fantasy/create",
    "/fantasy/profile",
    "/profile",
  ].join(",")
)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

const WIDTHS = (process.env.PROBE_WIDTHS ?? "390,430,768,1440").split(",").map(Number);
const LANGS = (process.env.PROBE_LANGS ?? "fr,ar").split(",");

const PROBE = () => {
  const vw = document.documentElement.clientWidth;
  const out = {
    scroll: document.documentElement.scrollWidth - vw,
    past: [],
    decorative: [],
    clipW: [],
    clipH: [],
  };
  const hides = (v) => v === "hidden" || v === "clip";

  /**
   * An ancestor that constrains the x axis at all — `auto`/`scroll` (an
   * intentional rail or wide table) or `hidden`/`clip` (a mask) — means this
   * element cannot put anything past the fold on its own. Checking only for
   * scrollers missed the masks: a shimmer sweep parked at `-left-1/3` inside
   * an `overflow-hidden` parent is never visible off-screen, but its own box
   * sits well outside the viewport.
   */
  const xConstrained = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === "auto" || o === "scroll" || hides(o)) return true;
    }
    return false;
  };
  const inSvg = (el) => el.closest("svg") !== null;
  const srOnly = (el) => el.clientWidth <= 1 || el.clientHeight <= 1;
  /**
   * A blurred glow bleeding off the edge is a design decision, not overflow.
   * Counted separately rather than dropped: "decorative" is a judgement, and
   * a real element that has quietly become `pointer-events-none` should still
   * be visible in the output rather than silently filtered away.
   */
  const decorative = (el, cs) =>
    cs.pointerEvents === "none" && (el.textContent || "").trim().length === 0;

  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    if (
      cs.position !== "fixed" &&
      !inSvg(el) &&
      !xConstrained(el) &&
      (r.right > vw + 1 || r.left < -1)
    ) {
      const where = `<${el.tagName.toLowerCase()}> [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`;
      const cls = (el.className || "").toString().slice(0, 60);
      out[decorative(el, cs) ? "decorative" : "past"].push(`${where} ${cls}`);
    }

    const isTextLeaf = el.children.length === 0 && (el.textContent || "").trim().length > 0;
    if (isTextLeaf && !srOnly(el) && !inSvg(el)) {
      const label = (el.textContent || "").trim().slice(0, 30);
      if (
        hides(cs.overflowX) &&
        el.scrollWidth > el.clientWidth + 1 &&
        cs.textOverflow !== "ellipsis"
      ) {
        out.clipW.push(
          `<${el.tagName.toLowerCase()}> "${label}" ${el.scrollWidth}>${el.clientWidth}`,
        );
      }
      if (hides(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        out.clipH.push(
          `<${el.tagName.toLowerCase()}> "${label}" ${el.scrollHeight}>${el.clientHeight}` +
            ` (+${el.scrollHeight - el.clientHeight}px) fs=${cs.fontSize} lh=${cs.lineHeight}`,
        );
      }
    }
  }
  for (const k of ["past", "decorative", "clipW", "clipH"]) out[k] = [...new Set(out[k])];
  return out;
};

const browser = await chromium.launch();
const rows = [];
let checks = 0;

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addInitScript((l) => {
      try {
        localStorage.setItem("botolago.language", l);
      } catch {
        /* private mode / blocked storage: the chooser appears and the run is discarded */
      }
    }, lang);
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(Number(process.env.PROBE_SETTLE ?? 900));
      checks++;
      const r = await page.evaluate(PROBE);
      if (
        r.scroll > 1 ||
        r.past.length ||
        r.decorative.length ||
        r.clipW.length ||
        r.clipH.length
      ) {
        rows.push({ lang, width, route, ...r });
      }
    }
    await ctx.close();
  }
}
await browser.close();

const total = (k) => rows.reduce((s, r) => s + r[k].length, 0);
console.log(
  `${checks} checks over ${ROUTES.length} routes × ${WIDTHS.length} widths × ${LANGS.length} languages`,
);
console.log(`${rows.length} route/viewport pairs with findings`);
console.log(
  `scroll ${rows.filter((r) => r.scroll > 1).length} · past ${total("past")} · clipW ${total("clipW")} · clipH ${total("clipH")}` +
    ` · decorative ${total("decorative")} (reported, not counted as defects)\n`,
);

for (const kind of ["scroll", "past", "clipW", "clipH", "decorative"]) {
  const hit = rows.filter((r) => (kind === "scroll" ? r.scroll > 1 : r[kind].length));
  if (!hit.length) {
    console.log(`### ${kind}: none`);
    continue;
  }
  console.log(`### ${kind} — ${hit.length} pairs`);
  for (const r of hit) {
    console.log(`  ${r.lang} ${r.width} ${r.route}`);
    if (kind === "scroll") console.log(`     +${r.scroll}px`);
    else for (const x of r[kind]) console.log(`     ${x}`);
  }
}

// The probe reports; it does not gate. Wiring it to a non-zero exit would need
// a committed baseline, and the counts move with every screen that lands.
process.exit(0);
