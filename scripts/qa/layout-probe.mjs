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
 * 4b. `starved` — the ellipsis that excuse let through. A truncation is only a
 *    design while enough of the word survives to be read, and "Sélectionné
 *    par" in a 40px box is "SÉLE…": four characters of fifteen, reported by a
 *    reader, invisible to every assertion here. Reported when less than
 *    `PROBE_STARVED` (0.6) of the text's own width is shown.
 *
 * 4c. `spill` — the inverse, and the one they all miss: a text leaf that
 *    outgrows its PARENT while nothing clips it. In a `flex-col` box a child
 *    with `white-space: nowrap` and no `max-width` sizes to its own content,
 *    so `scrollWidth === clientWidth`, a `truncate` on it never fires, and the
 *    text simply lies across its neighbours. Found on /fantasy/rankings only
 *    because a reader looked: a 103px tile carrying a 140px label.
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

/**
 * How much of a string has to survive its ellipsis before the truncation
 * counts as designed rather than broken. 0.6 keeps "Sélectionné par" at 40px
 * of 112 (36%) on the report list and lets an ordinary tail-trim pass.
 */
const STARVED = Number(process.env.PROBE_STARVED ?? 0.6);

// `PROBE` is serialised into the page, so it closes over nothing on this side:
// every value it needs arrives as its argument.
const PROBE = ({ starved }) => {
  const vw = document.documentElement.clientWidth;
  const out = {
    scroll: document.documentElement.scrollWidth - vw,
    past: [],
    decorative: [],
    clipW: [],
    clipH: [],
    clipHFontBox: [],
    spill: [],
    starved: [],
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

  /**
   * Does the element's GLYPH INK escape its content box, or only the font's
   * declared box?
   *
   * `scrollHeight` on a text leaf reflects the inline box, which is sized from
   * the font's declared ascent and descent — room reserved for the tallest
   * glyph the face can draw, not for the glyphs actually on screen. Once
   * line-height sits between the real ink height and that declared box,
   * `scrollHeight > clientHeight` keeps reporting while nothing is visibly
   * cut. That is exactly where the Arabic ramp lands: at 34px the hero's
   * declared box is 72px against a 66px line box, and the ink of "فانتازي"
   * spans 15.1 to 60.1 — comfortably inside.
   *
   * So the ink is measured directly. Canvas gives actualBoundingBox*, the ink
   * extents of this exact string in this exact face, and the baseline is
   * reconstructed the way the browser places it: half-leading above the
   * font's ascent. Only ink crossing the content box is a defect.
   */
  const inkEscapes = (el, cs) => {
    const ctx2d = document.createElement("canvas").getContext("2d");
    if (!ctx2d) return true; // cannot measure: report it rather than hide it
    ctx2d.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx2d.measureText((el.textContent || "").trim());
    const lineHeight = parseFloat(cs.lineHeight);
    if (!Number.isFinite(lineHeight)) return true; // `normal`: no arithmetic to do
    const fontBox = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    const baseline = (lineHeight - fontBox) / 2 + m.fontBoundingBoxAscent;
    const top = baseline - m.actualBoundingBoxAscent;
    const bottom = baseline + m.actualBoundingBoxDescent;
    return top < -0.5 || bottom > el.clientHeight + 0.5;
  };

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

    /**
     * Text that outgrows its own PARENT while nothing clips it.
     *
     * The inverse of every assertion above, and the one they all miss. In a
     * `flex-col` box a child with `white-space: nowrap` and no `max-width`
     * sizes itself to its text, so `scrollWidth === clientWidth` — the element
     * fits the content it was asked to clip — and a `truncate` on it is inert.
     * `clipW` cannot fire, the page does not scroll, nothing crosses the
     * viewport, and the label simply lies across its neighbours. Found on
     * /fantasy/rankings only because a reader looked: a 103.3px tile carrying
     * a 140.4px label, overlapping the next tile by 8.4px.
     *
     * A parent that DOES clip is excluded — that is `clipW`'s business, and
     * being clipped is a different defect from spilling.
     */
    const parent = el.parentElement;
    if (
      el.children.length === 0 &&
      (el.textContent || "").trim().length > 0 &&
      parent &&
      cs.position !== "absolute" &&
      cs.position !== "fixed" &&
      !srOnly(el) &&
      !inSvg(el)
    ) {
      const pb = parent.getBoundingClientRect();
      const ps = getComputedStyle(parent);
      const over = Math.max(r.right - pb.right, pb.left - r.left);
      if (over > 1 && pb.width > 1 && !hides(ps.overflowX)) {
        out.spill.push(
          `<${el.tagName.toLowerCase()}> "${(el.textContent || "").trim().slice(0, 30)}"` +
            ` ${Math.round(r.width)}px in a ${Math.round(pb.width)}px parent (+${over.toFixed(1)}px)` +
            `${hides(cs.overflowX) && el.scrollWidth <= el.clientWidth + 1 ? " — truncate is inert here" : ""}`,
        );
      }
    }

    const isTextLeaf = el.children.length === 0 && (el.textContent || "").trim().length > 0;
    if (isTextLeaf && !srOnly(el) && !inSvg(el)) {
      const label = (el.textContent || "").trim().slice(0, 30);
      if (hides(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        const line = `<${el.tagName.toLowerCase()}> "${label}" ${el.scrollWidth}>${el.clientWidth}`;
        if (cs.textOverflow !== "ellipsis") {
          out.clipW.push(line);
        } else if (el.clientWidth / el.scrollWidth < starved) {
          /**
           * An ellipsis is a designed truncation, so `clipW` excuses it — and
           * that excuse hid "Sélectionné par" rendering as "SÉLE…" in a 40px
           * box, four characters of fifteen, until a reader reported it. An
           * ellipsis is only a design while enough of the word survives to be
           * read; past that it is a defect wearing a "…".
           *
           * The threshold is a fraction of the text's own width, not a pixel
           * count, so it means the same thing at every font size and in both
           * languages.
           */
          out.starved.push(
            `${line} (${Math.round((el.clientWidth / el.scrollWidth) * 100)}% shown)`,
          );
        }
      }
      if (hides(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        const line =
          `<${el.tagName.toLowerCase()}> "${label}" ${el.scrollHeight}>${el.clientHeight}` +
          ` (+${el.scrollHeight - el.clientHeight}px) fs=${cs.fontSize} lh=${cs.lineHeight}`;
        out[inkEscapes(el, cs) ? "clipH" : "clipHFontBox"].push(line);
      }
    }
  }
  for (const k of ["past", "decorative", "clipW", "clipH", "clipHFontBox", "spill", "starved"])
    out[k] = [...new Set(out[k])];
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
      const r = await page.evaluate(PROBE, { starved: STARVED });
      if (
        r.scroll > 1 ||
        r.past.length ||
        r.decorative.length ||
        r.clipW.length ||
        r.clipH.length ||
        r.clipHFontBox.length ||
        r.spill.length ||
        r.starved.length
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
    ` · decorative ${total("decorative")}` +
    ` · clipH-fontbox ${total("clipHFontBox")} (neither a defect)` +
    ` · spill ${total("spill")} · starved ${total("starved")}\n`,
);

for (const kind of [
  "scroll",
  "past",
  "clipW",
  "clipH",
  "spill",
  "starved",
  "decorative",
  "clipHFontBox",
]) {
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
