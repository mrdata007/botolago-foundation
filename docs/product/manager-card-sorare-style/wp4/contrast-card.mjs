/**
 * Brief, "Contrast from pixels at stage size": every text and mark of the card measured from
 * rasterised pixels (never from the colours in the markup), at rest and with the pointer over the
 * element (the tilted sheen at its worst: the pointer's spot is where the light sits, and on
 * CHAMPION and LEGEND where the diffraction foil is centred).
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/contrast-card.mjs \
 *     [--fx=rated,legend,...] [--langs=fr,ar] [--themes=light,dark] [--widths=390,1440]
 *     [--kinds=number,name,...] [--poses=rest,pointer] [--jobs=2] [--out=<file.json>]
 *
 * The card is the one on the card page (`/curva/carte?mc=<fixture>`): 296 CSS px wide at a 390
 * viewport, 336 from 768. Pictures are taken at 3 device pixels per CSS pixel. Floors (brief):
 *   number     fill against the bare shirt under it            3.0
 *   ovrLabel   « OVR » against its halo                        4.5
 *   statValue, name, tier, statLabel, serial, season, wordmark, sample, initials, founder   4.5
 *   mark       forming marks, filled and empty, against what is behind them   3.0
 *   edge       the card's outermost line against the page, the thickness walls hidden  3.0, at rest
 *              AND with the pointer on the card at five spots (centre and the four 15% / 85% corners),
 *              where the card is turned and its light sits on the edge (round 2 finish: it was read at rest only)
 *   edgeBand, edgeWithWalls   the first 2 CSS px of it, and the silhouette with the seven walls: informative
 *
 * Method: a text element's box is screenshotted and read with the contrast-probe's histogram
 * (`histContrast`: commonest luminance = backdrop, the furthest bin holding >= 0.4 % = ink). The
 * label is read as the 2nd and 98th percentile pair (white on a dark halo, or the reverse). The
 * number is read as the median luminance of its eroded glyph interior against the median luminance
 * of the same pixels with the number layer hidden (the bare shirt), the glyph mask being the pixels
 * the hidden render changes. The edge is read as the first 2.5 CSS px of the card's metal against
 * the page beside it, from a luminance profile across the boundary (see `edgeContrast`).
 */
import { appendFileSync, writeFileSync } from "node:fs";

import {
  ctxFor,
  go,
  histContrast,
  launch,
  lum,
  median,
  percentileContrast,
  ratio,
  raw,
  round2,
  watch,
} from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const FX = flag(
  "fx",
  "forming1,homa,tierDown,rated,tierUp,legend,founder,clubNull,longNameLatin,arabicName",
).split(",");
const LANGS = flag("langs", "fr,ar").split(",");
const THEMES = flag("themes", "light,dark").split(",");
const WIDTHS = flag("widths", "390").split(",").map(Number);
const POSES = flag("poses", "rest,pointer").split(",");
const JOBS = Number(flag("jobs", "2"));
const OUT = flag("out", "");
const ONLY = flag("kinds", "").split(",").filter(Boolean);
const DPR = 3;

const KINDS = [
  { kind: "ovrLabel", sel: "text[data-ovrlabel]", floor: 4.5, how: "percentile" },
  { kind: "statValue", sel: "text[data-stat]", floor: 4.5 },
  { kind: "statLabel", sel: "text[data-label]", floor: 4.5 },
  { kind: "name", sel: "text[data-name]", floor: 4.5 },
  { kind: "tier", sel: "text[data-tier]", floor: 4.5 },
  { kind: "serial", sel: 'text[data-meta="serial"]', floor: 4.5 },
  { kind: "season", sel: 'text[data-meta="season"]', floor: 4.5 },
  { kind: "wordmark", sel: 'text[data-meta="wordmark"]', floor: 4.5 },
  { kind: "sample", sel: 'text[data-meta="sample"]', floor: 4.5 },
  { kind: "initials", sel: 'text[data-meta="initials"]', floor: 4.5 },
  { kind: "founder", sel: 'text[data-meta^="founder"]', floor: 4.5 },
  { kind: "mark", sel: "[data-pip]", floor: 3.0 },
].filter((k) => ONLY.length === 0 || ONLY.includes(k.kind));
const WANT_NUMBER = ONLY.length === 0 || ONLY.includes("number");
const WANT_EDGE = ONLY.length === 0 || ONLY.includes("edge");

/** Box of a locator in CSS px, padded; null when absent or empty. */
async function box(locator, pad = 1) {
  const bb = await locator.boundingBox();
  if (!bb || bb.width < 1 || bb.height < 1) return null;
  return { x: bb.x - pad, y: bb.y - pad, width: bb.width + 2 * pad, height: bb.height + 2 * pad };
}

async function pointerTo(page, b) {
  // come in from outside the card so the tilt starts from rest, then rest on the element's centre
  await page.mouse.move(Math.max(2, b.x - 60), Math.max(2, b.y - 60));
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.waitForTimeout(900);
}

/** The five places the pointer is put to read the outer edge: the centre and the 15% / 85% corners. */
const EDGE_SPOTS = [
  ["centre", 0.5, 0.5],
  ["top-left", 0.15, 0.15],
  ["top-right", 0.85, 0.15],
  ["bottom-left", 0.15, 0.85],
  ["bottom-right", 0.85, 0.85],
];

/** Back to rest first (the settle is 450 ms), then onto (x, y): every spot starts from the flat card. */
async function pointerAt(page, x, y) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(700);
  await page.mouse.move(x, y, { steps: 6 });
  await page.waitForTimeout(900);
}

/** Median fill luminance against the median bare-shirt luminance under the glyph interior. */
async function numberContrast(page, stage, b) {
  const clip = { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 };
  const shot = await page.screenshot({ clip });
  const withNumber = await raw(shot);
  const alt = await histContrast(shot); // the probe's histogram on the same box, as a second opinion
  await page
    .addStyleTag({ content: ".mc-l--num{visibility:hidden !important}" })
    .then(async (tag) => {
      withNumber.tag = tag;
    });
  const bare = await raw(await page.screenshot({ clip }));
  await withNumber.tag.evaluate((n) => n.remove());
  const { width, height } = withNumber;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const d = Math.max(
      Math.abs(withNumber.data[3 * i] - bare.data[3 * i]),
      Math.abs(withNumber.data[3 * i + 1] - bare.data[3 * i + 1]),
      Math.abs(withNumber.data[3 * i + 2] - bare.data[3 * i + 2]),
    );
    mask[i] = d > 12 ? 1 : 0;
  }
  // erode by 2.5 CSS px so the keyline, the twill ring and the shadow are not counted as fill
  const k = Math.round(2.5 * DPR);
  const erode = (src, horizontal) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let all = 1;
        for (let d = -k; d <= k && all; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height || !src[yy * width + xx]) all = 0;
        }
        out[y * width + x] = all;
      }
    return out;
  };
  const inner = erode(erode(mask, true), false);
  const ink = [];
  const shirt = [];
  for (let i = 0; i < width * height; i++) {
    if (!inner[i]) continue;
    ink.push(lum(withNumber.data[3 * i], withNumber.data[3 * i + 1], withNumber.data[3 * i + 2]));
    shirt.push(lum(bare.data[3 * i], bare.data[3 * i + 1], bare.data[3 * i + 2]));
  }
  if (ink.length < 40) return { value: null, note: `interior ${ink.length} px` };
  const med = ratio(median(ink), median(shirt));
  // the worst pixel pair of the interior's tails: the dimmest fill against the brightest shirt (or the reverse)
  const sortedInk = [...ink].sort((a, b2) => a - b2);
  const sortedShirt = [...shirt].sort((a, b2) => a - b2);
  const q = (s, p) => s[Math.floor(p * (s.length - 1))];
  const worst = Math.min(
    ratio(q(sortedInk, 0.1), q(sortedShirt, 0.9)),
    ratio(q(sortedInk, 0.9), q(sortedShirt, 0.1)),
    med,
  );
  return { value: round2(med), worst: round2(worst), pixels: ink.length, alt };
}

/**
 * The card's outer edge against the page, read from a luminance profile across the boundary on the
 * left, the right and the top (not the bottom, where the contact shadow lies). The page is the
 * median over 8 to 12 CSS px outside; the card starts where the profile leaves the page (a ratio of
 * 1.5 or more against it). Two readings of the card's outermost line, both against that page:
 *   hair  the most contrasting of the first four device pixels (1.3 CSS px) inside the silhouette:
 *         the theme edge, a 3-unit stroke in the tier's `edge` colour, with the lip of the metal
 *         beside it (plan 3.2); this is the line that separates the card from the page
 *   band  the median of the first 2 CSS px, which mixes that line with the metal under it
 * With `rims: false` the seven walls of the card's thickness are hidden, which reads the frame's own
 * edge; with `rims: true` it reads the silhouette including the walls (darkest at the back).
 * The picture is cut around the card's layout box, `out` CSS px beyond it and `inn` inside (12 and 8 at
 * rest; 12 and 14 with the pointer on the card): a turned card's edge moves several CSS px from its
 * layout box (perspective takes the far side inwards), and with 8 inside the far side's edge fell at the
 * end of the profile, where only the first pixel of its ramp was read. Outside stays 12: the page's own
 * content lies a little above the card, and a wider window reads it as the card.
 */
async function edgeContrast(page, rootBox, { rims, out = 12, inn = 8 }) {
  const tag = rims ? null : await page.addStyleTag({ content: ".mc-rim{display:none !important}" });
  const clip = {
    x: rootBox.x - out,
    y: rootBox.y - out,
    width: rootBox.width + 2 * out,
    height: rootBox.height + out + inn,
  };
  const { data, width, height } = await raw(await page.screenshot({ clip }));
  if (tag) await tag.evaluate((n) => n.remove());
  const L = (x, y) =>
    lum(data[3 * (y * width + x)], data[3 * (y * width + x) + 1], data[3 * (y * width + x) + 2]);
  const hair = {};
  const band = {};
  for (const side of ["left", "right", "top"]) {
    const hs = [];
    const bs = [];
    for (const f of [0.35, 0.45, 0.55, 0.65]) {
      const line = [];
      const n = Math.round((out + inn) * DPR);
      for (let k = 0; k < n; k++) {
        if (side === "left") line.push(L(k, Math.round(f * height)));
        else if (side === "right") line.push(L(width - 1 - k, Math.round(f * height)));
        else line.push(L(Math.round(f * width), k));
      }
      const pageL = median(line.slice(Math.round(2 * DPR), Math.round(7 * DPR)));
      const at = line.findIndex((v, idx) => idx > Math.round(2 * DPR) && ratio(v, pageL) >= 1.5);
      if (at < 0) continue;
      hs.push(Math.max(...line.slice(at, at + 4).map((v) => ratio(v, pageL))));
      bs.push(ratio(median(line.slice(at, at + Math.round(2 * DPR))), pageL));
    }
    hair[side] = hs.length ? round2(median(hs)) : null;
    band[side] = bs.length ? round2(median(bs)) : null;
  }
  const lowest = (o) => {
    const v = Object.values(o).filter((x) => x != null);
    return v.length ? Math.min(...v) : null;
  };
  return { hair, band, value: lowest(hair), bandValue: lowest(band) };
}

async function one({ browser, fx, lang, theme, width }) {
  const ctx = await ctxFor(browser, { lang, theme, width, height: 1100, dpr: DPR, reduced: false });
  const page = await ctx.newPage();
  const problems = watch(page);
  const rows = [];
  try {
    // no fixed clock: the tilt eases with `Date.now()`, and a frozen clock would leave it flat under the pointer
    await go(page, `/curva/carte?mc=${fx}`, lang, { clock: false });
    await page.waitForTimeout(1800);
    const stage = page.locator('[data-testid="curva-stage"]');
    await stage.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    const root = stage.locator(".mc-eclat").first();
    const rootBox = await box(root, 0);
    const cardWidth = Math.round(rootBox.width);
    const push = (pose, kind, label, floor, value, extra = {}) =>
      rows.push({
        fx,
        lang,
        theme,
        width,
        cardWidth,
        pose,
        kind,
        label,
        floor,
        value,
        pass: value == null || extra.informative ? null : value >= floor,
        ...extra,
      });
    for (const pose of POSES) {
      if (pose === "rest") await page.mouse.move(1, 1);
      if (WANT_EDGE) {
        // at rest once; with the pointer at five spots (the tilt turns the card and moves the light onto its edge)
        const spots = pose === "rest" ? [["rest", 0, 0]] : EDGE_SPOTS;
        for (const [spot, fxp, fyp] of spots) {
          const win = pose === "pointer" ? { out: 12, inn: 14 } : {};
          if (pose === "pointer") {
            await pointerAt(
              page,
              rootBox.x + fxp * rootBox.width,
              rootBox.y + fyp * rootBox.height,
            );
          }
          const at = pose === "rest" ? "" : ` [pointer ${spot}]`;
          const e = await edgeContrast(page, rootBox, { rims: false, ...win });
          push(
            pose,
            "edge",
            `outermost line of the frame vs page (walls hidden)${at}`,
            3.0,
            e.value,
            {
              sides: e.hair,
              spot,
            },
          );
          push(
            pose,
            "edgeBand",
            `first 2 CSS px of the frame vs page (walls hidden)${at}`,
            3.0,
            e.bandValue,
            { sides: e.band, informative: true, spot },
          );
          const w = await edgeContrast(page, rootBox, { rims: true, ...win });
          push(
            pose,
            "edgeWithWalls",
            `outermost line of the silhouette with the thickness walls vs page${at}`,
            3.0,
            w.value,
            { sides: w.hair, informative: true, spot },
          );
        }
      }
      if (WANT_NUMBER) {
        const num = stage.locator('[data-mc="ovr"]').first();
        let b = (await num.count()) ? await box(num, 0) : null;
        if (b) {
          if (pose === "pointer") {
            await pointerTo(page, b);
            b = (await box(num, 0)) ?? b; // the tilt moved it: clip where it is now
          }
          const r = await numberContrast(page, stage, b);
          push(pose, "number", "OVR figure vs shirt", 3.0, r.value, {
            worst: r.worst,
            alt: r.alt,
            pixels: r.pixels,
            note: r.note,
          });
        }
      }
      for (const k of KINDS) {
        const loc = stage.locator(k.sel);
        const n = await loc.count();
        for (let i = 0; i < n; i++) {
          const el = loc.nth(i);
          const pad = k.kind === "mark" ? 2 : 1;
          let b = await box(el, pad);
          if (!b) continue;
          const label =
            ((await el.textContent()) ?? "").trim().slice(0, 18) ||
            (await el.getAttribute("data-pip")) ||
            k.kind;
          if (pose === "pointer") {
            await pointerTo(page, b);
            b = (await box(el, pad)) ?? b; // the tilt moved it: clip where it is now
          }
          const buf = await page.screenshot({ clip: b });
          const value =
            k.how === "percentile" ? await percentileContrast(buf) : await histContrast(buf);
          push(pose, k.kind, label, k.floor, value);
        }
      }
    }
  } catch (error) {
    rows.push({ fx, lang, theme, width, error: String(error.message).slice(0, 200) });
  }
  await ctx.close();
  return { rows, problems };
}

const browser = await launch();
const jobs = [];
for (const fx of FX)
  for (const lang of LANGS)
    for (const theme of THEMES)
      for (const width of WIDTHS) jobs.push({ browser, fx, lang, theme, width });
const results = [];
const LINES = OUT ? `${OUT}l` : ""; // one JSON line per finished context, so a hung browser loses one context, not the run
if (LINES) writeFileSync(LINES, "");
const withTimeout = (promise, ms, what) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms} ms: ${what}`)), ms),
    ),
  ]);
let next = 0;
await Promise.all(
  Array.from({ length: JOBS }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      let r;
      try {
        r = await withTimeout(one(job), 240000, `${job.fx} ${job.lang} ${job.theme} ${job.width}`);
      } catch (error) {
        r = {
          rows: [
            {
              fx: job.fx,
              lang: job.lang,
              theme: job.theme,
              width: job.width,
              error: String(error.message).slice(0, 200),
            },
          ],
          problems: [],
        };
      }
      results.push(...r.rows);
      if (LINES) appendFileSync(LINES, `${JSON.stringify(r.rows)}\n`);
      const bad = r.rows.filter((x) => x.pass === false).length;
      console.log(
        `${job.fx} ${job.lang} ${job.theme} ${job.width}: ${r.rows.length} readings, ${bad} below floor${r.rows.some((x) => x.error) ? ", ERROR" : ""}${r.problems.length ? `, PROBLEMS ${r.problems.join(" | ")}` : ""}`,
      );
    }
  }),
);
await browser.close().catch(() => {});

// summary: the lowest reading of each kind and pose, and every reading under its floor
const lines = [];
const kinds = [...new Set(results.map((r) => r.kind).filter(Boolean))];
for (const pose of POSES)
  for (const kind of kinds) {
    const rs = results.filter((r) => r.pose === pose && r.kind === kind && r.value != null);
    if (!rs.length) continue;
    const lowest = rs.reduce((a, b) => (b.value < a.value ? b : a));
    const sub = rs.filter((r) => r.value < r.floor).length;
    lines.push(
      `${pose.padEnd(8)} ${kind.padEnd(10)} n=${String(rs.length).padStart(4)}  lowest ${lowest.value.toFixed(2).padStart(6)} (floor ${lowest.floor})  at ${lowest.fx} ${lowest.lang} ${lowest.theme} ${lowest.width} "${lowest.label}"  under floor: ${sub}`,
    );
  }
const errors = results.filter((r) => r.error);
console.log("\n" + lines.join("\n"));
console.log(
  `\n${results.length} readings, ${results.filter((r) => r.pass === false).length} below their floor, ${errors.length} errors`,
);
for (const r of results.filter((x) => x.pass === false)) console.log("BELOW", JSON.stringify(r));
for (const r of errors) console.log("ERROR", JSON.stringify(r));
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, results }, null, 1)}\n`);
process.exit(0); // a browser that hung and was given up on must not keep the run alive
