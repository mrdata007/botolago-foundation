/**
 * Brief, "The number inside the shirt": for OVR 1 to 99 and « — » (and for every fixture, both
 * languages, both themes), the painted ink of the `[data-mc="ovr"]` group, with its outlines, lies
 * inside the chest box (card space x 316.3 to 683.7, y 447.1 to 805.5) and inside the shirt path.
 * Measured from pixels in Chromium: the card is drawn by the app's own renderer in a page of the
 * development server, everything but the number group is made invisible, the picture is taken on a
 * transparent background at 4 device pixels per CSS pixel, and the ink box is the box of the
 * pixels that are not transparent. The shirt test is `isPointInFill` of the shirt path on the box's
 * four corners (as `eclat/number.test.ts` does from the committed ink metrics).
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/number-ink.mjs [--out=<file>]
 */
import { writeFileSync } from "node:fs";

import sharp from "sharp";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const args = process.argv.slice(2);
const OUT = args.find((a) => a.startsWith("--out="))?.slice(6);
const DPR = 4;
const CARD_PX = 296;

/** Runs in the page: draws one profile with only its number visible; returns the card's rect. */
async function draw({ lang, theme, fixture, ovr, px }) {
  const [{ activeRenderer }, copy, i18n, scope, fixtures, toProfile] = await Promise.all([
    import("/src/components/manager-card/active-renderer.ts"),
    import("/src/components/manager-card/copy.ts"),
    import("/src/i18n/dictionaries.ts"),
    import("/src/components/manager-card/scope-ids.ts"),
    import("/src/backend/manager-card/fixtures.ts"),
    import("/src/components/manager-card/to-profile.ts"),
  ]);
  const tierFor = (n) =>
    n >= 92 ? "legend" : n >= 88 ? "champion" : n >= 84 ? "pro" : n >= 70 ? "stade" : "homa";
  const renderer = await activeRenderer.load();
  const dictionary = i18n.dictionaries[lang];
  const strings = copy.cardStrings((key) => dictionary[key], lang);
  const base = toProfile.fromMyCard(fixtures.fixtureById(fixture).card);
  const profile =
    ovr === undefined
      ? base
      : { ...base, ovr, tier: ovr === null ? null : tierFor(ovr), provisional: false };
  document.getElementById("ink-root")?.remove();
  if (!document.getElementById("ink-style")) {
    const style = document.createElement("style");
    style.id = "ink-style";
    // only the number group paints; its hit rectangle, its « OVR » label and everything else is invisible
    style.textContent = `
      html, body { background: transparent !important; }
      body > *:not(#ink-root):not(style):not(svg) { display: none !important; }
      #ink-root, #ink-root * { background: transparent !important; box-shadow: none !important; }
      #ink-root .mc-l, #ink-root .mc-l *, #ink-root .mc-eclat__shadow, #ink-root .mc-eclat__foil { visibility: hidden !important; }
      #ink-root [data-mc="ovr"], #ink-root [data-mc="ovr"] * { visibility: visible !important; }
      #ink-root [data-mc="ovr"] > rect, #ink-root [data-ovrlabel] { visibility: hidden !important; }
    `;
    document.head.append(style);
  }
  const root = document.createElement("div");
  root.id = "ink-root";
  root.style.cssText = `position:fixed;top:10px;left:10px;z-index:2147483000;width:${px}px;direction:ltr;`;
  root.innerHTML = `<div class="mc-card" style="width:${px}px"><div>${scope.scopeSvgIds(renderer.full(profile, { strings, theme }), scope.newIdScope())}</div></div>`;
  document.body.append(root);
  await document.fonts.ready;
  const r = root.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
    tier: profile.tier,
    ovr: profile.ovr,
  };
}

/** Runs in the page: is a card-space point inside the shirt? */
async function inShirt(points) {
  const geometry = await import("/src/components/manager-card/eclat/geometry.ts");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", geometry.SHIRT);
  svg.append(path);
  svg.style.cssText = "position:absolute;width:0;height:0";
  document.body.append(svg);
  const out = points.map(([x, y]) =>
    path.isPointInFill(new DOMPoint((x + 60) / 1.12, (y + 86) / 1.12)),
  );
  svg.remove();
  return out;
}

const CHEST = {
  x0: 336 * 1.12 - 60,
  x1: 664 * 1.12 - 60,
  y0: 476 * 1.12 - 86,
  y1: 796 * 1.12 - 86,
};

/** The box of the non-transparent pixels, in card units (1000 wide). */
async function inkBox(buf, widthPx) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width,
    y0 = info.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[4 * (y * info.width + x) + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const k = 1000 / widthPx;
  return { x0: x0 * k, x1: (x1 + 1) * k, y0: y0 * k, y1: (y1 + 1) * k };
}

const browser = await launch();
const results = [];
const FIXTURES = [
  "forming1",
  "homa",
  "tierDown",
  "rated",
  "tierUp",
  "legend",
  "founder",
  "clubNull",
  "longNameLatin",
  "arabicName",
  "born0",
];

for (const [lang, theme] of [
  ["fr", "light"],
  ["fr", "dark"],
  ["ar", "light"],
  ["ar", "dark"],
]) {
  const ctx = await ctxFor(browser, {
    lang,
    theme,
    width: 600,
    height: 900,
    dpr: DPR,
    reduced: true,
  });
  const page = await ctx.newPage();
  await go(page, "/gradins?mc=forming1", lang);
  await page.waitForTimeout(800);
  const jobs = FIXTURES.map((fixture) => ({ fixture, label: `fixture ${fixture}` }));
  if (lang === "fr" && theme === "light") {
    for (let n = 1; n <= 99; n++) jobs.push({ fixture: "rated", ovr: n, label: `ovr ${n}` });
  }
  jobs.push({ fixture: "rated", ovr: null, label: "ovr dash" });
  for (const job of jobs) {
    const rect = await page.evaluate(draw, {
      lang,
      theme,
      fixture: job.fixture,
      ovr: job.ovr,
      px: CARD_PX,
    });
    const buf = await page.screenshot({
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      omitBackground: true,
    });
    const ink = await inkBox(buf, rect.width * DPR);
    if (!ink) {
      results.push({ lang, theme, label: job.label, error: "no ink" });
      continue;
    }
    const corners = [
      [ink.x0, ink.y0],
      [ink.x1, ink.y0],
      [ink.x0, ink.y1],
      [ink.x1, ink.y1],
    ];
    const inside = await page.evaluate(inShirt, corners);
    const margins = {
      left: ink.x0 - CHEST.x0,
      right: CHEST.x1 - ink.x1,
      top: ink.y0 - CHEST.y0,
      bottom: CHEST.y1 - ink.y1,
    };
    const inChest = Object.values(margins).every((m) => m >= -0.5); // half a device pixel of a 1000-wide card at 296 x 4
    results.push({
      lang,
      theme,
      label: job.label,
      tier: rect.tier,
      ovr: rect.ovr,
      ink: Object.fromEntries(Object.entries(ink).map(([k, v]) => [k, round2(v)])),
      margins: Object.fromEntries(Object.entries(margins).map(([k, v]) => [k, round2(v)])),
      inChest,
      inShirt: inside.every(Boolean),
    });
  }
  await ctx.close();
}
await browser.close();

const bad = results.filter((r) => r.error || !r.inChest || !r.inShirt);
const numeric = results.filter((r) => /^ovr \d/.test(r.label));
const minMargin = Math.min(
  ...results.filter((r) => r.margins).map((r) => Math.min(...Object.values(r.margins))),
);
const widest = results
  .filter((r) => r.ink)
  .reduce(
    (a, r) =>
      r.ink.x1 - r.ink.x0 > a.w
        ? { w: r.ink.x1 - r.ink.x0, label: `${r.lang} ${r.theme} ${r.label}` }
        : a,
    { w: 0 },
  );
console.log(
  `${results.length} drawings: ${numeric.length} numbers 1 to 99, the dash in 4 variants, ${FIXTURES.length} fixtures x 4 language/theme pairs`,
);
console.log(
  `ink inside the chest box and the shirt: ${results.length - bad.length} of ${results.length}; outside: ${bad.length}`,
);
console.log(
  `smallest margin to the chest box: ${round2(minMargin)} card units (1000 = card width); widest ink ${round2(widest.w)} units (${widest.label}) against a ${round2(CHEST.x1 - CHEST.x0)} box`,
);
for (const r of bad) console.log("OUTSIDE", JSON.stringify(r));
if (OUT)
  writeFileSync(
    OUT,
    `${JSON.stringify({ base: process.env.BASE, chest: CHEST, results }, null, 1)}\n`,
  );
