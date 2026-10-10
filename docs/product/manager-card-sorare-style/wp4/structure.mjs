/**
 * Brief criteria that are about what the markup contains, read from the app's own renderer in
 * Chromium (not from the unit tests' stand-in DOM): clutter, banned elements, layers, tokens and the
 * face-à-face card.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/structure.mjs [--out=<file>]
 *
 *   full card   drawn shapes (path, rect, circle, ellipse, line, polygon, polyline and text outside
 *               defs, masks, patterns, clip paths, gradients and filters; the rims are not counted),
 *               markup size, `<image>`, `feTurbulence`, `will-change`, class or id names of the
 *               removed decorations, layers and rims, the holographic layer per tier
 *   tokens      80, 64, 56, 48, 44, 32, 28, 24 px: texts, patterns, masks, filters, the 2 px ring,
 *               and for 80, 64, 48 and 32 the painted height of a two-digit number measured from
 *               pixels (the number alone, 8 device pixels per CSS pixel)
 *   G4 card     200, 160, 136 px: which texts are absent, the smallest text in CSS px
 */
import { writeFileSync } from "node:fs";

import sharp from "sharp";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const args = process.argv.slice(2);
const OUT = args.find((a) => a.startsWith("--out="))?.slice(6);

/** Page side: the full-card facts for one profile. */
async function inspectFull({ lang, theme, fixture }) {
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
  const profile = toProfile.fromMyCard(fixtures.fixtureById(fixture).card);
  const markup = scope.scopeSvgIds(renderer.full(profile, { strings, theme }), scope.newIdScope());
  const host = document.createElement("div");
  host.innerHTML = markup;
  const SHAPES = "path,rect,circle,ellipse,line,polygon,polyline,text";
  const NOT_DRAWN = "defs,mask,pattern,clipPath,linearGradient,radialGradient,filter,symbol";
  const layers = [...host.querySelectorAll("svg.mc-l")];
  const body = layers.filter((s) => !s.classList.contains("mc-rim"));
  const drawn = body.reduce(
    (n, svg) => n + [...svg.querySelectorAll(SHAPES)].filter((el) => !el.closest(NOT_DRAWN)).length,
    0,
  );
  const names = [...markup.matchAll(/\b(?:class|id)="([^"]*)"/g)].map((m) => m[1]).join(" ");
  const removed =
    /(^|[-_])(rivet|guilloche|micro|sparkle|glitch|pixel|ribbon|seal|stamp|caption|tube|diffraction-grid)/i;
  const texts = [...host.querySelectorAll("text")].map(
    (t) =>
      t.dataset.meta ??
      (t.dataset.tier
        ? "tier"
        : t.dataset.name
          ? "name"
          : t.dataset.stat
            ? "stat"
            : t.dataset.label
              ? "label"
              : t.hasAttribute("data-ovrlabel")
                ? "ovrlabel"
                : "other"),
  );
  const root = host.querySelector(".mc-eclat");
  return {
    tier: profile.tier,
    markupBytes: markup.length,
    drawn,
    image: /<image\b/i.test(markup),
    feTurbulence: /feTurbulence/i.test(markup),
    willChange: /will-change/i.test(markup),
    removedNames: names.split(/\s+/).filter((n) => removed.test(n)),
    layers: body.map((s) => s.className.baseVal.replace("mc-l mc-l--", "")),
    rims: layers.length - body.length,
    holoLayer: !!host.querySelector("svg.mc-l--holo"),
    holoClass: root.classList.contains("mc-holo"),
    textKinds: texts.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {}),
    hasFounder: texts.includes("founder") || texts.includes("founder-year"),
  };
}

/** Page side: a token's facts, and (when `isolate`) draw it alone for the ink measurement. */
async function inspectToken({ lang, theme, fixture, size, ovr, isolate, ring }) {
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
  const strings = copy.cardStrings((key) => i18n.dictionaries[lang][key], lang);
  const base = toProfile.fromMyCard(fixtures.fixtureById(fixture).card);
  const profile =
    ovr === undefined ? base : { ...base, ovr, tier: tierFor(ovr), provisional: false };
  const markup = scope.scopeSvgIds(
    renderer.token(profile, { strings, theme, size }),
    scope.newIdScope(),
  );
  const box = renderer.tokenBox(profile, size);
  const host = document.createElement("div");
  host.innerHTML = markup;
  const facts = {
    tier: profile.tier,
    width: box.width,
    height: box.height,
    texts: host.querySelectorAll("text").length,
    textsOutsideNumber: [...host.querySelectorAll("text")].filter(
      (t) => !t.closest('[data-mc="ovr"]'),
    ).length,
    patterns: host.querySelectorAll("pattern").length,
    masks: host.querySelectorAll("mask").length,
    filters: host.querySelectorAll("filter").length,
    images: host.querySelectorAll("image").length,
    ringStroke: [...host.querySelectorAll("path[fill=none]")]
      .map((p) => p.getAttribute("stroke-width"))
      .filter(Boolean),
    svgCount: host.querySelectorAll("svg").length,
  };
  if (!isolate) return facts;
  document.getElementById("tok-root")?.remove();
  if (!document.getElementById("tok-style")) {
    const style = document.createElement("style");
    style.id = "tok-style";
    style.textContent = `
      html, body { background: transparent !important; }
      body > *:not(#tok-root):not(style):not(svg) { display: none !important; }
      #tok-root, #tok-root * { background: transparent !important; box-shadow: none !important; }
      #tok-root svg * { visibility: hidden !important; }
      #tok-root [data-mc="ovr"], #tok-root [data-mc="ovr"] * { visibility: visible !important; }
    `;
    document.head.append(style);
  }
  const root = document.createElement("div");
  root.id = "tok-root";
  root.style.cssText = "position:fixed;top:10px;left:10px;z-index:2147483000;direction:ltr;";
  root.innerHTML = `<span class="mc-token inline-block" style="width:${box.width}px;height:${box.height}px"><span class="block">${markup}</span></span>`;
  document.body.append(root);
  await document.fonts.ready;
  const r = root.firstElementChild.getBoundingClientRect();
  return { ...facts, rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
}

/** Page side: the G4 card's facts at one width. */
async function inspectCompact({ lang, theme, fixture, px }) {
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
  const profile = toProfile.fromMyCard(fixtures.fixtureById(fixture).card);
  const markup = scope.scopeSvgIds(
    renderer.full(profile, { strings, theme, compact: true }),
    scope.newIdScope(),
  );
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;left:0;top:0;width:${px}px;direction:${lang === "ar" ? "rtl" : "ltr"}`;
  host.innerHTML = `<div class="mc-card" style="width:${px}px"><div>${markup}</div></div>`;
  document.body.append(host);
  await document.fonts.ready;
  const svgBox = host.querySelector("svg.mc-l--base").getBoundingClientRect();
  const scale = svgBox.width / 1000;
  const texts = [...host.querySelectorAll("text")].map((t) => ({
    kind:
      t.dataset.meta ??
      (t.dataset.tier
        ? "tier"
        : t.dataset.name
          ? "name"
          : t.dataset.stat
            ? "stat"
            : t.dataset.label
              ? "label"
              : t.hasAttribute("data-ovrlabel")
                ? "ovrlabel"
                : "other"),
    text: (t.textContent ?? "").trim().slice(0, 14),
    cssPx: Math.round(Number(t.getAttribute("font-size")) * scale * 100) / 100,
  }));
  host.remove();
  return { texts, card: Math.round(svgBox.width) };
}

async function inkHeight(buf, dpr) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let y0 = info.height,
    y1 = -1,
    x0 = info.width,
    x1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[4 * (y * info.width + x) + 3] > 24) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
  if (y1 < 0) return null;
  return {
    h: (y1 - y0 + 1) / dpr,
    w: (x1 - x0 + 1) / dpr,
    box: [x0 / dpr, y0 / dpr, (x1 + 1) / dpr, (y1 + 1) / dpr],
  };
}

const browser = await launch();
const out = { full: [], tokens: [], digits: [], compact: [] };
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
  "insufficient3",
];

const ctx = await ctxFor(browser, {
  lang: "fr",
  theme: "light",
  width: 700,
  height: 900,
  dpr: 8,
  reduced: true,
});
const page = await ctx.newPage();
await go(page, "/curva?mc=forming1", "fr");
await page.waitForTimeout(800);

for (const lang of ["fr", "ar"])
  for (const theme of ["light", "dark"])
    for (const fixture of FIXTURES)
      out.full.push({
        lang,
        theme,
        fixture,
        ...(await page.evaluate(inspectFull, { lang, theme, fixture })),
      });

for (const size of [80, 64, 56, 48, 44, 32, 28, 24])
  for (const fixture of ["rated", "legend", "tierUp", "homa", "forming1"])
    for (const theme of ["light", "dark"])
      out.tokens.push({
        size,
        fixture,
        theme,
        ...(await page.evaluate(inspectToken, { lang: "fr", theme, fixture, size })),
      });

// the painted height of two-digit numbers on tokens: the smallest over 10..99
for (const size of [80, 64, 48, 32]) {
  const heights = [];
  for (let ovr = 10; ovr <= 99; ovr++) {
    const t = await page.evaluate(inspectToken, {
      lang: "fr",
      theme: "light",
      fixture: "rated",
      size,
      ovr,
      isolate: true,
    });
    const buf = await page.screenshot({ clip: t.rect, omitBackground: true });
    const ink = await inkHeight(buf, 8);
    if (ink)
      heights.push({
        ovr,
        h: ink.h,
        w: ink.w,
        inBox:
          ink.box[0] >= 0 &&
          ink.box[1] >= 0 &&
          ink.box[2] <= t.rect.width &&
          ink.box[3] <= t.rect.height,
      });
  }
  const min = heights.reduce((a, b) => (b.h < a.h ? b : a));
  out.digits.push({
    size,
    minHeight: round2(min.h),
    at: min.ovr,
    maxHeight: round2(Math.max(...heights.map((x) => x.h))),
    allInsideBox: heights.every((x) => x.inBox),
    n: heights.length,
  });
}

await page.evaluate(() => {
  document.getElementById("tok-root")?.remove();
  document.getElementById("tok-style")?.remove();
});
for (const px of [200, 160, 136])
  for (const [lang, fixture] of [
    ["fr", "rated"],
    ["fr", "founder"],
    ["fr", "longNameLatin"],
    ["fr", "forming1"],
    ["fr", "tierUp"],
    ["ar", "arabicName"],
    ["ar", "rated"],
  ]) {
    const r = await page.evaluate(inspectCompact, { lang, theme: "dark", fixture, px });
    out.compact.push({ px, lang, fixture, ...r });
  }
await ctx.close();
await browser.close();

/* ------------------------------------------------------------------ report */
const TIERS = ["base", "homa", "stade", "pro", "champion", "legend"];
console.log("FULL CARD (app renderer, Chromium)");
console.log(
  "tier       fixtures  drawn min..max   markup kB min..max   holoLayer  holoClass  image feTurb willChange removedNames layers/rims",
);
for (const tier of TIERS) {
  const rs = out.full.filter((r) => (r.tier ?? "base") === tier);
  if (!rs.length) continue;
  const d = rs.map((r) => r.drawn);
  const k = rs.map((r) => r.markupBytes / 1000);
  console.log(
    `${tier.padEnd(10)} ${String(rs.length).padStart(4)}      ${Math.min(...d)}..${Math.max(...d)}`.padEnd(
      40,
    ) +
      `${Math.min(...k).toFixed(1)}..${Math.max(...k).toFixed(1)}`.padEnd(20) +
      `${rs.every((r) => r.holoLayer)}/${rs.some((r) => r.holoLayer)}`.padEnd(14) +
      `${rs.every((r) => r.holoClass)}/${rs.some((r) => r.holoClass)}`.padEnd(14) +
      `${rs.some((r) => r.image)}  ${rs.some((r) => r.feTurbulence)}  ${rs.some((r) => r.willChange)}  ${[...new Set(rs.flatMap((r) => r.removedNames))].join(",") || "none"}  ${[...new Set(rs.map((r) => `${r.layers.join("+")}/${r.rims}`))].join(" ; ")}`,
  );
}
const allDrawn = out.full.map((r) => r.drawn);
console.log(
  `drawn elements over ${out.full.length} cards: min ${Math.min(...allDrawn)}, max ${Math.max(...allDrawn)} (brief: <= 140; revision 2: 205 to 284)`,
);
console.log(
  `markup size over ${out.full.length} cards: ${(Math.min(...out.full.map((r) => r.markupBytes)) / 1000).toFixed(1)} to ${(Math.max(...out.full.map((r) => r.markupBytes)) / 1000).toFixed(1)} kB`,
);
console.log(
  `<image>: ${out.full.filter((r) => r.image).length}, feTurbulence: ${out.full.filter((r) => r.feTurbulence).length}, will-change in markup: ${out.full.filter((r) => r.willChange).length}, removed-decoration names: ${out.full.filter((r) => r.removedNames.length).length}`,
);
console.log(
  `holo layer on: ${[...new Set(out.full.filter((r) => r.holoLayer).map((r) => r.tier))].join(", ")} only; other tiers have it: ${out.full.filter((r) => r.holoLayer && !["champion", "legend"].includes(r.tier)).length}`,
);
console.log("\nTOKENS");
for (const size of [80, 64, 56, 48, 44, 32, 28, 24]) {
  const rs = out.tokens.filter((r) => r.size === size);
  console.log(
    `${String(size).padStart(3)} px  texts ${[...new Set(rs.map((r) => r.texts))].join("/")} (outside the number: ${rs.reduce((a, r) => a + r.textsOutsideNumber, 0)})  patterns ${rs.reduce((a, r) => a + r.patterns, 0)}  masks ${rs.reduce((a, r) => a + r.masks, 0)}  filters ${rs.reduce((a, r) => a + r.filters, 0)}  images ${rs.reduce((a, r) => a + r.images, 0)}  svgs ${[...new Set(rs.map((r) => r.svgCount))].join("/")}  ring stroke(units) ${[...new Set(rs.flatMap((r) => r.ringStroke))].join(",") || "-"}  box ${[...new Set(rs.map((r) => `${r.width}x${r.height}`))].join(",")}`,
  );
}
console.log("\nTWO-DIGIT NUMBER on a token, painted height from pixels (OVR 10 to 99)");
for (const d of out.digits)
  console.log(
    `${String(d.size).padStart(3)} px  smallest ${d.minHeight} CSS px (OVR ${d.at}), largest ${d.maxHeight}, all inside the token box: ${d.allInsideBox}  (n=${d.n})`,
  );
console.log("\nFACE-A-FACE CARD, smallest text in CSS px and what is absent");
for (const px of [200, 160, 136]) {
  const rs = out.compact.filter((r) => r.px === px);
  const all = rs.flatMap((r) => r.texts.map((t) => ({ ...t, fixture: r.fixture, lang: r.lang })));
  const min = all.reduce((a, b) => (b.cssPx < a.cssPx ? b : a));
  const kinds = [...new Set(all.map((t) => t.kind))].sort();
  console.log(
    `${px} px  card ${[...new Set(rs.map((r) => r.card))].join("/")}  smallest ${min.cssPx} (${min.kind} "${min.text}", ${min.fixture} ${min.lang})  text kinds present: ${kinds.join(",")}`,
  );
}
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, ...out }, null, 1)}\n`);
