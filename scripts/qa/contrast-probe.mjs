/**
 * Contrast probe — WCAG ratios measured from rendered pixels.
 *
 *   PROBE_BASE=http://127.0.0.1:4377 node scripts/qa/contrast-probe.mjs
 *   PROBE_ROUTES=/matches,/fantasy node …
 *   PROBE_LANGS=fr,ar PROBE_WIDTHS=390,1440 node …
 *   PROBE_THEME=system node …    # dark through the phone setting (see below)
 *   PROBE_ALL=1 node …           # measure EVERY visible text from pixels, not
 *                                # only what pass 1 nominates (slower, noisier)
 *   PROBE_MAX_SCREENS=12 node …  # how far down a long page to scroll (default 12)
 *   PROBE_LIST_HIDDEN=1 node …   # also list the texts skipped as covered
 *
 * Behind a CA-terminating proxy (this sandbox), pass the proxy CA's SPKI pin
 * so the page's own Supabase calls succeed instead of measuring a page that
 * has only its server-rendered data:
 *
 *   PROBE_CHROMIUM_SPKI_ALLOW=<base64 sha256 of the CA's SubjectPublicKeyInfo>
 *
 * It mirrors E2E_CHROMIUM_SPKI_ALLOW in playwright.config.ts: exactly that
 * key is trusted and verification stays on for every other authority. Never
 * `--ignore-certificate-errors`.
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
 * from actual rendered pixels: screenshot the viewport, decode the PNG in the
 * browser (no library needed), and split glyph luminance from backdrop
 * luminance inside the text's box by histogram (see VERIFY_MANY). Only pass
 * 2's number is ever reported.
 *
 * The same lesson as the layout probe, in a different dimension: a cheap check
 * is for triage, and the expensive one decides.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT LOOKS AT (BG-0149)
 * ---------------------------------------------------------------------------
 *
 * A clean result is only as good as its coverage, and the first version's
 * coverage had three holes, found when an independent all-text probe was run
 * beside it on the dark theme:
 *
 *   1. LEAF ELEMENTS ONLY. It skipped any element with child elements, so a
 *      button or link with an icon beside its label was never measured. It
 *      now walks TEXT NODES and measures each one's own box (a Range), with
 *      the colour of the element that holds it.
 *   2. ABOVE THE FOLD ONLY. A suspect below the first screen was clipped to
 *      nothing by the viewport screenshot and silently dropped, though it was
 *      counted as checked. It now scrolls the page a screen at a time
 *      (`PROBE_MAX_SCREENS`) and measures what is fully in view at each stop.
 *   3. TEXT NOBODY CAN SEE. The club crest's fallback initials ("AMA") sit
 *      UNDER the crest image, which covers them with an opaque plate. Pass 2
 *      measured the image and reported 1.82:1 and 1.27:1 — four failures on
 *      text that is never on screen. A text now counts only if the topmost
 *      element at the centre of its first line is its own element, one of its
 *      descendants or one of its ancestors (hit-tested with pointer-events
 *      forced on, so a `pointer-events: none` label is not mistaken for
 *      hidden), and only if `checkVisibility()` passes (no `opacity: 0` or
 *      `visibility: hidden` anywhere above it). Text covered by a sticky bar
 *      at one stop is tried again at the next.
 *
 * Horizontally scrolled rails are measured only as far as they are on screen.
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
const WIDTHS = (process.env.PROBE_WIDTHS ?? "390").split(",").map(Number);
const ALL = process.env.PROBE_ALL === "1";
const LIST_HIDDEN = process.env.PROBE_LIST_HIDDEN === "1";
const MAX_SCREENS = Number(process.env.PROBE_MAX_SCREENS ?? 12);
const DPR = 2;

/**
 * Pass 1, run in-page at one scroll stop: nominate suspects by compositing
 * ancestor background-colours, over every visible text node fully in view.
 */
const NOMINATE = (all) => {
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

  // What counts as "seen" survives between scroll stops, so a text is
  // measured once per page, at the first stop where it is fully on screen
  // and uncovered.
  const seen = (window.__contrastProbeSeen ??= new WeakSet());
  // Covered texts, and what covered them; HIDDEN reads it once the page is
  // done and keeps the ones no stop ever uncovered.
  const covered = (window.__contrastProbeCovered ??= new Map());
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const where = (el) => {
    const parts = [];
    for (let a = el; a && a !== document.body && parts.length < 3; a = a.parentElement) {
      let part = a.tagName.toLowerCase();
      if (a.id) part += `#${a.id}`;
      const testid = a.getAttribute("data-testid");
      if (testid) part += `[data-testid=${testid}]`;
      const label = a.getAttribute("aria-label");
      if (label) part += `[aria-label=${label.slice(0, 24)}]`;
      parts.unshift(part);
    }
    return parts.join(" > ");
  };
  // Hit-test with pointer-events forced on: a label drawn with
  // `pointer-events: none` over something else is visible, but
  // elementFromPoint would look straight through it.
  const force = document.createElement("style");
  force.textContent = "*, *::before, *::after { pointer-events: auto !important; }";
  document.head.append(force);

  const suspects = [];
  let unresolved = 0;
  let inView = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || "").trim();
    if (!text || seen.has(node)) continue;
    const el = node.parentElement;
    if (!el || el.closest("script, style, noscript, template, title")) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 4);
    const box = range.getBoundingClientRect();
    if (!lines.length || box.width < 4 || box.height < 4) continue;
    // Fully on screen at this stop, or wait for a later one.
    if (box.top < 0 || box.left < 0 || box.bottom > vh || box.right > vw) continue;
    const first = lines[0];
    const hit = document.elementFromPoint(
      first.left + first.width / 2,
      first.top + first.height / 2,
    );
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
      // Covered: under an image, a sticky bar, a sheet. Not seen yet, so a
      // later stop that uncovers it still measures it.
      if (!covered.has(node)) covered.set(node, `"${text.slice(0, 26)}" under ${where(hit ?? el)}`);
      continue;
    }
    seen.add(node);
    inView++;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const floor = large ? 3 : 4.5;
    const item = {
      text: text.slice(0, 26),
      where: where(el),
      floor,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
    const bg = backdrop(el);
    // A gradient anywhere above means pass 1 cannot answer. Nominate it rather
    // than drop it: unmeasurable-by-this-method is not the same as passing.
    if (bg === null) {
      unresolved++;
      suspects.push({ ...item, reason: "gradient backdrop" });
      continue;
    }
    if (ratio(px(cs.color, bg), px(bg)) < floor) {
      suspects.push({ ...item, reason: "pass 1 below floor" });
    } else if (all) {
      suspects.push({ ...item, reason: "PROBE_ALL" });
    }
  }
  force.remove();
  return { suspects, unresolved, inView };
};

/** After the last stop: the texts that were covered at every stop. */
const HIDDEN = () =>
  [...(window.__contrastProbeCovered ?? new Map())]
    .filter(([node]) => !window.__contrastProbeSeen?.has(node))
    .map(([, description]) => description);

/**
 * Pass 2, run in-page: decode the viewport PNG once, then for each suspect
 * separate ink from backdrop inside its box.
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
const VERIFY_MANY = async ({ src, boxes, dpr }) => {
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
  const L = (bin) => (bin + 0.5) / BINS;
  // One screenshot per scroll stop; each text's box is cut out of it here.
  return boxes.map((b) => {
    const x0 = Math.max(0, Math.floor(b.x * dpr));
    const y0 = Math.max(0, Math.floor(b.y * dpr));
    const x1 = Math.min(c.width, Math.ceil((b.x + b.width) * dpr));
    const y1 = Math.min(c.height, Math.ceil((b.y + b.height) * dpr));
    const hist = new Array(BINS).fill(0);
    let total = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * c.width + x) * 4;
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

    const [hi, lo] = [L(ink), L(mode)].sort((a, b2) => b2 - a);
    return (hi + 0.05) / (lo + 0.05);
  });
};

/**
 * PROBE_THEME picks the theme measured.
 *
 *   light   (default) the light theme.
 *   system  the phone set to dark (`colorScheme: "dark"`), nothing stored —
 *           the path a visitor actually takes since dark mode shipped
 *           (BG-0149): the inline head script applies the theme before first
 *           paint. The run asserts `<html>` carries `dark` after load.
 *   dark    adds the class by hand AFTER hydration. Kept for a build with
 *           DARK_MODE_ENABLED off, where only the token set can be measured.
 *
 * Why "dark" adds the class after hydration and not in an init script: an
 * init script that adds `dark` to <html> looks like it works and does not —
 * the server sends `<html class="">`, hydration replaces the attribute, and
 * the class is gone by the time anything is painted. Measured that way the
 * dark theme came back "27 measurements, 0 below AA", a clean bill of health
 * for a theme that was never applied.
 *
 * Either dark mode ASSERTS that a token actually changed value (`--ui-page`
 * against the same page with the class off); a run that cannot prove the
 * theme is on exits rather than reporting a false pass.
 */
const THEME = ["dark", "system"].includes(process.env.PROBE_THEME)
  ? process.env.PROBE_THEME
  : "light";

const applyTheme = async (page) => {
  if (THEME === "light") return;
  const changed = await page.evaluate((theme) => {
    const root = document.documentElement;
    const read = () => getComputedStyle(root).getPropertyValue("--ui-page").trim();
    if (theme === "system") {
      // The head script put the class there; prove it, then prove it matters.
      const applied = root.classList.contains("dark");
      root.classList.remove("dark");
      const before = read();
      root.classList.add("dark");
      return { applied, before, after: read() };
    }
    const before = read();
    root.classList.add("dark");
    return { applied: true, before, after: read() };
  }, THEME);
  if (!changed.applied) {
    console.error(
      "contrast-probe: PROBE_THEME=system, but <html> has no `dark` class on a dark phone.\n" +
        "The pre-paint theme script did not apply the theme (is DARK_MODE_ENABLED on?).",
    );
    process.exit(2);
  }
  if (changed.before === changed.after) {
    console.error(
      `contrast-probe: PROBE_THEME=${THEME} did not change --ui-page (${changed.before}).\n` +
        "The dark class is not taking effect, so any result would be the light theme wearing a dark label.",
    );
    process.exit(2);
  }
};

const SPKI = process.env.PROBE_CHROMIUM_SPKI_ALLOW;
const browser = await chromium.launch(
  SPKI ? { args: [`--ignore-certificate-errors-spki-list=${SPKI}`] } : {},
);
let checked = 0;
const failures = [];

for (const lang of LANGS)
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      // 2x at every width: small glyphs (an 11px shirt number) rendered at
      // 1x have too few solid ink pixels for pass 2 to find, and come back as
      // false failures.
      deviceScaleFactor: DPR,
      colorScheme: THEME === "system" ? "dark" : "light",
    });
    await ctx.addInitScript((l) => {
      try {
        localStorage.setItem("botolago.language", l);
        // Past the welcome screen, the prize welcome and the launch splash,
        // as tests/e2e/support.ts does, so the route itself is measured.
        localStorage.setItem("botolago.welcomed", "1");
        localStorage.setItem("botolago.prizes.welcome.v1", "1");
        sessionStorage.setItem("botolago.splashShown", "1");
      } catch {
        /* blocked storage: the language chooser appears and the run is discarded */
      }
    }, lang);
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
      // Hydrated (the i18n provider writes data-lang), then a settle for data.
      await page
        .waitForFunction((l) => document.documentElement.dataset.lang === l, lang, {
          timeout: 30_000,
        })
        .catch(() => {});
      // The data, not a guess at how long it takes: at 1300ms /fantasy/players
      // was still an empty 900px page and the probe measured eight texts.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
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
      // A screen at a time down the page (80% steps, so a text cut by the
      // bottom edge at one stop is whole at the next), until the bottom or
      // PROBE_MAX_SCREENS.
      let nominated = 0;
      let unresolved = 0;
      let inView = 0;
      let confirmed = 0;
      let unmeasured = 0;
      let screens = 0;
      let truncated = false;
      for (let y = 0; ; ) {
        await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
        await page.waitForTimeout(screens === 0 ? 0 : 350);
        screens++;
        const found = await page.evaluate(NOMINATE, ALL);
        nominated += found.suspects.length;
        unresolved += found.unresolved;
        inView += found.inView;

        if (found.suspects.length) {
          const shot = await page.screenshot({ animations: "disabled" });
          const measured = await page.evaluate(VERIFY_MANY, {
            src: "data:image/png;base64," + shot.toString("base64"),
            boxes: found.suspects,
            dpr: DPR,
          });
          found.suspects.forEach((s, i) => {
            checked++;
            const m = measured[i];
            if (m === null) {
              unmeasured++;
              return;
            }
            if (m < s.floor) {
              confirmed++;
              failures.push({ lang, viewport: width, route, ...s, measured: +m.toFixed(2) });
            }
          });
        }
        const { top, height, view } = await page.evaluate(() => ({
          top: window.scrollY,
          height: document.documentElement.scrollHeight,
          view: window.innerHeight,
        }));
        if (top + view >= height - 1) break;
        if (screens >= MAX_SCREENS) {
          truncated = true;
          break;
        }
        y = top + Math.round(view * 0.8);
      }
      const hidden = await page.evaluate(HIDDEN);
      if (LIST_HIDDEN) for (const h of hidden) console.log(`  hidden: ${h}`);
      console.log(
        `${lang} ${width} ${route}: ${inView} texts in view over ${screens} screen(s)` +
          `${truncated ? " (page continues)" : ""}, ${hidden.length} hidden under something,` +
          ` ${nominated} nominated (${unresolved} on a gradient),` +
          ` ${confirmed} confirmed below AA, ${unmeasured} too sparse to judge`,
      );
    }
    await ctx.close();
  }
await browser.close();

console.log(`\n${THEME} theme: ${checked} pixel measurements, ${failures.length} below AA`);
for (const f of failures) {
  console.log(
    `  ${f.measured}:1 (floor ${f.floor}) ${f.lang} ${f.viewport} ${f.route} "${f.text}" — ${f.reason} @ ${f.where}`,
  );
}
process.exit(0);
