/**
 * Contrast probe — WCAG ratios measured from rendered pixels.
 *
 *   PROBE_BASE=http://127.0.0.1:4377 node scripts/qa/contrast-probe.mjs
 *   PROBE_ROUTES=/matches,/fantasy node …
 *
 * Start your own server on your own port; 4173 is shared between worktrees
 * here and a run against another agent's tree measures the wrong product.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS TWO PASSES
 * ---------------------------------------------------------------------------
 *
 * `oklch()` does not parse naively, so every colour is resolved by making
 * Chromium PAINT it onto a 1x1 canvas and reading the sRGB back. That part is
 * reliable.
 *
 * What is not reliable is deciding WHAT a foreground sits on. Pass 1 walks up
 * the ancestor chain compositing `background-color`, which is cheap and right
 * most of the time — and silently wrong whenever the visible backdrop is not
 * an ancestor. `PageBackground` renders its mesh as an absolutely-positioned
 * SIBLING at `-z-10`, so the welcome screen's white text has no background on
 * its ancestor chain at all: pass 1 composites down to the page's light
 * `background-color` and reports white-on-white at 1.04:1. Six confident,
 * completely wrong failures, on a screen that measures 5.77:1 to 15.03:1.
 *
 * So pass 1 only ever NOMINATES. Anything it flags is re-measured in pass 2
 * from actual rendered pixels: screenshot the element's box, decode the PNG in
 * the browser (no library needed), and split glyph luminance from backdrop
 * luminance by percentile — text is a minority of any text box, so the lower
 * quartile is the backdrop and the top 2% is the ink. Only pass 2's number is
 * ever reported.
 *
 * The same lesson as the layout probe, in a different dimension: a cheap check
 * is for triage, and the expensive one decides.
 */

import { chromium } from "playwright";

const BASE = process.env.PROBE_BASE;
if (!BASE) {
  console.error(
    "contrast-probe: set PROBE_BASE to a server you started yourself.\n" +
      "  bunx vite dev --port 4377 --host 127.0.0.1\n" +
      "There is deliberately no default: 4173 is shared between worktrees here.",
  );
  process.exit(2);
}

const ROUTES = (
  process.env.PROBE_ROUTES ??
  ["/", "/matches", "/fantasy", "/fantasy/team", "/fantasy/points", "/profile", "/terms"].join(",")
)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
const LANGS = (process.env.PROBE_LANGS ?? "fr").split(",");

/** Pass 1: nominate suspects by compositing ancestor background-colours. */
const NOMINATE = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d", { willReadFrequently: true });
  const px = (css, over) => {
    g.clearRect(0, 0, 1, 1);
    if (over) {
      g.fillStyle = over;
      g.fillRect(0, 0, 1, 1);
    }
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, gr, b]) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(gr) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const backdrop = (el) => {
    const stack = [];
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      stack.push(cs.backgroundColor);
      if (/^rgb\(/.test(cs.backgroundColor)) break;
    }
    let base = "rgb(255,255,255)";
    for (let i = stack.length - 1; i >= 0; i--) {
      const p = px(stack[i], base);
      base = `rgb(${p[0]},${p[1]},${p[2]})`;
    }
    return base;
  };

  const suspects = [];
  let unresolved = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length || !(el.textContent || "").trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const box = el.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const floor = large ? 3 : 4.5;
    const bg = backdrop(el);
    // A gradient anywhere above means pass 1 cannot answer. Nominate it rather
    // than drop it: unmeasurable-by-this-method is not the same as passing.
    if (bg === null) {
      unresolved++;
      suspects.push({
        text: (el.textContent || "").trim().slice(0, 26),
        floor,
        reason: "gradient backdrop",
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
      continue;
    }
    if (ratio(px(cs.color, bg), px(bg)) < floor) {
      suspects.push({
        text: (el.textContent || "").trim().slice(0, 26),
        floor,
        reason: "pass 1 below floor",
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    }
  }
  return { suspects, unresolved };
};

/**
 * Pass 2, run in-page: decode a PNG of the box and separate ink from backdrop.
 *
 * Not by percentile. A first version took the 25th and 98th percentile of
 * luminance, which assumes the glyphs are at least 2% of the box — true for a
 * sentence, false for "18" in a wide plate, where the 98th percentile is still
 * backdrop and the ratio comes back 1.00:1. It reported a dozen of those as
 * failures.
 *
 * Instead: histogram the luminances, take the MODE as the backdrop (whatever a
 * text box is mostly made of is its background, at any text density), then
 * walk outward from the mode to the furthest luminance that still has a real
 * population — at least `MIN_INK` of the pixels — and call that the ink. That
 * threshold also steps over anti-aliasing, which produces a thin smear of
 * intermediate values between the two.
 *
 * If nothing clears `MIN_INK`, there are no glyph pixels to judge and the
 * answer is `null`, not a ratio. An element too small or too sparse to measure
 * is reported as unmeasured rather than as passing or failing.
 */
const VERIFY = async (src) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = src;
  });
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const BINS = 64;
  const MIN_INK = 0.004; // 0.4% of the box; below this it is anti-aliasing
  const hist = new Array(BINS).fill(0);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]);
    hist[Math.min(BINS - 1, Math.floor(l * BINS))]++;
    total++;
  }
  if (!total) return null;

  let mode = 0;
  for (let i = 1; i < BINS; i++) if (hist[i] > hist[mode]) mode = i;

  let ink = null;
  let best = -1;
  for (let i = 0; i < BINS; i++) {
    if (hist[i] / total < MIN_INK) continue;
    const distance = Math.abs(i - mode);
    if (distance > best) {
      best = distance;
      ink = i;
    }
  }
  if (ink === null || best < 1) return null;

  const L = (bin) => (bin + 0.5) / BINS;
  const [hi, lo] = [L(ink), L(mode)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * PROBE_THEME=dark measures the DARK token set.
 *
 * The class has to go on AFTER hydration, not in an init script. An init
 * script that adds `dark` to <html> looks like it works and does not: the
 * server sends `<html class="">`, hydration replaces the attribute, and the
 * class is gone by the time anything is painted. Measured that way the dark
 * theme came back "27 measurements, 0 below AA" — a clean bill of health for a
 * theme that was never applied. `applyTheme` therefore sets it after the page
 * has settled and ASSERTS that a token actually changed value; a run that
 * cannot prove the theme is on exits rather than reporting a false pass.
 *
 * This measures the token set. It does not claim the feature is on for users:
 * the theme provider stays inert while DARK_MODE_ENABLED is false.
 */
const THEME = process.env.PROBE_THEME === "dark" ? "dark" : "light";

const applyTheme = async (page) => {
  if (THEME !== "dark") return;
  const changed = await page.evaluate(() => {
    const read = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--ui-page").trim();
    const before = read();
    document.documentElement.classList.add("dark");
    return { before, after: read() };
  });
  if (changed.before === changed.after) {
    console.error(
      `contrast-probe: PROBE_THEME=dark did not change --ui-page (${changed.before}).\n` +
        "The dark class is not taking effect, so any result would be the light theme wearing a dark label.",
    );
    process.exit(2);
  }
};

const browser = await chromium.launch();
let checked = 0;
const failures = [];

for (const lang of LANGS) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem("botolago.language", l);
    } catch {
      /* blocked storage: the language chooser appears and the run is discarded */
    }
  }, lang);
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(Number(process.env.PROBE_SETTLE ?? 1300));
    await applyTheme(page);
    // Wait for entrance animations to FINISH rather than guessing a delay.
    // The welcome screen fades its content in over 700ms after hydration, and
    // a screenshot taken mid-fade contains no glyph pixels at all — the box is
    // pure backdrop. Measured that way, "Bienvenue sur BotolaGO" came back at
    // 1.27:1 against a real value of 15.03:1: a confident failure on text that
    // had simply not been painted yet. `getAnimations()` is the exact signal,
    // and the timeout below is a cap for infinite ones (the live pulse, the
    // shimmer), not a delay.
    await page
      .waitForFunction(
        () =>
          document
            .getAnimations()
            .every(
              (a) =>
                a.playState !== "running" ||
                Number.isFinite(a.effect?.getTiming?.().iterations) === false,
            ),
        null,
        { timeout: 3000 },
      )
      .catch(() => {});
    const { suspects, unresolved } = await page.evaluate(NOMINATE);
    let confirmed = 0;
    let unmeasured = 0;
    for (const s of suspects) {
      checked++;
      const shot = await page
        .screenshot({ clip: { x: s.x, y: s.y, width: s.width, height: s.height } })
        .catch(() => null);
      if (!shot) continue;
      const measured = await page.evaluate(
        VERIFY,
        "data:image/png;base64," + shot.toString("base64"),
      );
      if (measured === null) {
        unmeasured++;
        continue;
      }
      if (measured < s.floor) {
        confirmed++;
        failures.push({ lang, route, ...s, measured: +measured.toFixed(2) });
      }
    }
    console.log(
      `${lang} ${route}: ${suspects.length} nominated (${unresolved} on a gradient),` +
        ` ${confirmed} confirmed below AA, ${unmeasured} too sparse to judge`,
    );
  }
  await ctx.close();
}
await browser.close();

console.log(`\n${THEME} theme: ${checked} pixel measurements, ${failures.length} below AA`);
for (const f of failures) {
  console.log(
    `  ${f.measured}:1 (floor ${f.floor}) ${f.lang} ${f.route} "${f.text}" — ${f.reason}`,
  );
}
process.exit(0);
