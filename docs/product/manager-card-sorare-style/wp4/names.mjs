/**
 * Brief, "Long names (`longNameLatin`, a 24-character single word, `arabicName`) fit their lines
 * without clipping or overlap, measured from text rectangles." The app's own renderer draws each name
 * in a page of the development server and two things are read:
 *   rectangles  the `<text>` boxes (advance width, ascent and descent) against the card's plate
 *               (x 60 to 940) and the rule (1404): nothing is clipped by the card or crosses the rule;
 *   ink         each line drawn alone, on a transparent background, at 4 device pixels per CSS
 *               pixel: the painted box against the name budget (790 units, x 105 to 895), the rule
 *               (the last line's ink >= 14 units above it), the plaque above (1142) and the other
 *               line (>= 12 units between inks). A text box is taller than its ink (an Arabic line's
 *               ascent and descent overlap its neighbour's box without any ink touching), which is
 *               why plan 4 places the lines by ink.
 * Run at the stage widths (296 and 336) and the face-à-face widths (200, 160, 136). The share
 * picture's text is covered by the draw test `card-share-image.draw.test.ts` (not here).
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/names.mjs [--out=<file>]
 */
import { writeFileSync } from "node:fs";

import sharp from "sharp";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);

const NAMES = [
  { id: "longNameLatin (fixture)", fixture: "longNameLatin", lang: "fr" },
  { id: "arabicName (fixture)", fixture: "arabicName", lang: "ar" },
  {
    id: "24-character single word",
    fixture: "rated",
    name: "ABDELRAHMANEBENJELLOUNEL",
    lang: "fr",
  },
  {
    id: "24-character single word, Arabic interface",
    fixture: "rated",
    name: "ABDELRAHMANEBENJELLOUNEL",
    lang: "ar",
  },
  {
    id: "particles (Les Lions du Derb Sidi Maarouf)",
    fixture: "rated",
    name: "Les Lions du Derb Sidi Maarouf",
    lang: "fr",
  },
  {
    id: "long Arabic with ibn (عبد الرحمن بن جلون العلوي)",
    fixture: "rated",
    name: "عبد الرحمن بن جلون العلوي",
    lang: "ar",
  },
  {
    id: "long Arabic name, French interface",
    fixture: "rated",
    name: "عبد الرحمن بن جلون العلوي",
    lang: "fr",
  },
  { id: "long Latin name, Arabic interface", fixture: "longNameLatin", lang: "ar" },
  { id: "one short word (ALI)", fixture: "rated", name: "Ali", lang: "fr" },
  { id: "empty name (guest)", fixture: "rated", name: "", lang: "fr" },
];

/** Page side: draw one name at one width and return the rectangles, in card units (1000 wide). */
async function draw({ fixture, name, lang, px, compact, theme }) {
  const [{ activeRenderer }, copy, i18n, scope, fixtures, toProfile] = await Promise.all([
    import("/src/components/manager-card/active-renderer.ts"),
    import("/src/components/manager-card/copy.ts"),
    import("/src/i18n/dictionaries.ts"),
    import("/src/components/manager-card/scope-ids.ts"),
    import("/src/backend/manager-card/fixtures.ts"),
    import("/src/components/manager-card/to-profile.ts"),
  ]);
  const renderer = await activeRenderer.load();
  const strings = copy.cardStrings((key) => i18n.dictionaries[lang][key], lang);
  const base = toProfile.fromMyCard(fixtures.fixtureById(fixture).card);
  const profile = name === undefined ? base : { ...base, name };
  document.getElementById("name-root")?.remove();
  const root = document.createElement("div");
  root.id = "name-root";
  root.dir = lang === "ar" ? "rtl" : "ltr";
  root.style.cssText = `position:absolute;top:0;left:0;width:${px}px;`;
  root.innerHTML = `<div class="mc-card" style="width:${px}px"><div>${scope.scopeSvgIds(renderer.full(profile, { strings, theme, compact }), scope.newIdScope())}</div></div>`;
  document.body.append(root);
  await document.fonts.ready;
  const base0 = root.querySelector("svg.mc-l--base").getBoundingClientRect();
  const k = 1000 / base0.width;
  const u = (r) => ({
    x0: (r.left - base0.left) * k,
    x1: (r.right - base0.left) * k,
    y0: (r.top - base0.top) * k,
    y1: (r.bottom - base0.top) * k,
  });
  const lines = [...root.querySelectorAll("text[data-name]")].map((t) => ({
    kind: t.dataset.name,
    text: t.textContent.trim(),
    ...u(t.getBoundingClientRect()),
    size: Number(t.getAttribute("font-size")),
  }));
  const tier = root.querySelector("text[data-tier]");
  const marks = [...root.querySelectorAll("g[data-pip]")].map((g) => u(g.getBoundingClientRect()));
  const r0 = root.querySelector("svg.mc-l--base").getBoundingClientRect();
  const out = {
    box: { x: r0.left, y: r0.top, width: r0.width, height: r0.height },
    lines,
    tierBottom: tier ? u(tier.getBoundingClientRect()).y1 : null,
    markBottom: marks.length ? Math.max(...marks.map((m) => m.y1)) : null,
  };
  return out; // the root stays for the ink pictures; the next draw replaces it
}

/** Page side: show only the i-th name line (all else invisible, the page behind it hidden). */
async function isolate(i) {
  if (!document.getElementById("iso-style")) {
    const style = document.createElement("style");
    style.id = "iso-style";
    style.textContent = `
      html, body { background: transparent !important; }
      body > *:not(#name-root):not(style):not(svg) { display: none !important; }
      #name-root, #name-root * { background: transparent !important; box-shadow: none !important; }
      #name-root svg *, #name-root .mc-eclat__shadow, #name-root .mc-eclat__foil { visibility: hidden !important; }
      #name-root text[data-iso] { visibility: visible !important; }
    `;
    document.head.append(style);
  }
  document
    .querySelectorAll("#name-root text[data-iso]")
    .forEach((t) => t.removeAttribute("data-iso"));
  document.querySelectorAll("#name-root text[data-name]")[i]?.setAttribute("data-iso", "1");
}

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

const RULE = 1404;
const PLAQUE_BOTTOM = 1142;
const BUDGET = { x0: 105, x1: 895 };

const browser = await launch();
const rows = [];
const ctx = await ctxFor(browser, {
  lang: "fr",
  theme: "light",
  width: 700,
  height: 1000,
  dpr: 4,
  reduced: true,
});
const page = await ctx.newPage();
await go(page, "/gradins?mc=forming1", "fr");
await page.waitForTimeout(800);
for (const n of NAMES)
  for (const [px, compact] of [
    [336, false],
    [296, false],
    [200, true],
    [160, true],
    [136, true],
  ])
    for (const theme of ["light", "dark"]) {
      const r = await page.evaluate(draw, {
        fixture: n.fixture,
        name: n.name,
        lang: n.lang,
        px,
        compact,
        theme,
      });
      const lines = r.lines;
      const problems = [];
      const tol = 1; // one card unit
      // rectangles: nothing clipped by the card's plate, nothing across the rule
      for (const l of lines) {
        if (l.x0 < 60 - tol || l.x1 > 940 + tol)
          problems.push(
            `rectangle of "${l.text}" spans ${round2(l.x0)} to ${round2(l.x1)}, outside the plate (60 to 940)`,
          );
        if (l.y1 > RULE + tol)
          problems.push(
            `rectangle of "${l.text}" reaches ${round2(l.y1)}, past the rule at ${RULE}`,
          );
      }
      // ink, line by line
      const inks = [];
      if (theme === "light") {
        for (let i = 0; i < lines.length; i++) {
          await page.evaluate(isolate, i);
          const buf = await page.screenshot({ clip: r.box, omitBackground: true });
          inks.push(await inkBox(buf, r.box.width * 4));
        }
        for (const [i, ink] of inks.entries()) {
          if (!ink) {
            problems.push(`line ${i + 1} "${lines[i].text}" painted nothing`);
            continue;
          }
          if (ink.x0 < BUDGET.x0 - tol || ink.x1 > BUDGET.x1 + tol)
            problems.push(
              `ink of "${lines[i].text}" spans ${round2(ink.x0)} to ${round2(ink.x1)}, outside ${BUDGET.x0} to ${BUDGET.x1}`,
            );
          if (ink.y0 < PLAQUE_BOTTOM - tol)
            problems.push(
              `ink of "${lines[i].text}" starts at ${round2(ink.y0)}, into the plaque (bottom ${PLAQUE_BOTTOM})`,
            );
        }
        const last = inks.filter(Boolean).at(-1);
        if (last && RULE - last.y1 < 14 - tol)
          problems.push(`last line's ink ends ${round2(RULE - last.y1)} above the rule (needs 14)`);
        if (inks.length === 2 && inks[0] && inks[1] && inks[1].y0 - inks[0].y1 < 12 - tol)
          problems.push(
            `the two lines' inks are ${round2(inks[1].y0 - inks[0].y1)} apart (needs 12)`,
          );
      }
      rows.push({
        name: n.id,
        lang: n.lang,
        px,
        theme,
        lines: lines.map(
          (l) =>
            `${l.text} [${round2(l.x0)}-${round2(l.x1)}] y ${round2(l.y0)}-${round2(l.y1)} size ${l.size}`,
        ),
        inks: inks.map((k) =>
          k ? `[${round2(k.x0)}-${round2(k.x1)}] y ${round2(k.y0)}-${round2(k.y1)}` : null,
        ),
        widestRect: round2(Math.max(0, ...lines.map((l) => l.x1 - l.x0))),
        widestInk: round2(Math.max(0, ...inks.filter(Boolean).map((k) => k.x1 - k.x0))),
        ruleGapInk: inks.filter(Boolean).length
          ? round2(RULE - Math.max(...inks.filter(Boolean).map((k) => k.y1)))
          : null,
        lineGapInk:
          inks.length === 2 && inks[0] && inks[1] ? round2(inks[1].y0 - inks[0].y1) : null,
        problems,
      });
    }
await ctx.close();
await browser.close();

const bad = rows.filter((r) => r.problems.length);
console.log(
  `${rows.length} drawings (${NAMES.length} names x 5 widths x 2 themes; ink read in the light theme): ${rows.length - bad.length} fit, ${bad.length} do not`,
);
for (const n of NAMES) {
  const rs = rows.filter((r) => r.name === n.id);
  const inkRows = rs.filter((r) => r.theme === "light");
  const r336 = rs.find((r) => r.px === 336 && r.theme === "light");
  console.log(
    `  ${n.id.padEnd(52)} widest ink ${String(Math.max(...inkRows.map((r) => r.widestInk))).padStart(7)} (budget 790), widest rect ${String(Math.max(...rs.map((r) => r.widestRect))).padStart(7)}; ink gap to the rule >= ${Math.min(...inkRows.filter((r) => r.ruleGapInk != null).map((r) => r.ruleGapInk))}, between lines >= ${Math.min(...inkRows.filter((r) => r.lineGapInk != null).map((r) => r.lineGapInk), Infinity)}; at 336 ink ${r336.inks.join(" / ") || "none"}`,
  );
}
for (const r of bad.slice(0, 30))
  console.log("PROBLEM", r.name, r.px, r.theme, r.problems.join("; "));
if (OUT)
  writeFileSync(
    OUT,
    `${JSON.stringify({ base: process.env.BASE, rule: RULE, budget: BUDGET, rows }, null, 1)}\n`,
  );
