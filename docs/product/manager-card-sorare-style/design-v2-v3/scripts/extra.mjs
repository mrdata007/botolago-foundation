// usage: node extra.mjs <mock.html> <rev2.html> <rev3-pre.html>  -> JSON
import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
import sharp from "/home/user/botolago-app/node_modules/sharp/lib/index.js";
const [mock, rev2, rev3pre] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const lumc = (r, g, b) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [a, b].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
async function open(file, { theme = "dark", dpr = 2, reduced = true, width = 1440 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: dpr,
    colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto("file://" + file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  return { ctx, page };
}
async function raw(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const R = {};
const { ctx, page } = await open(mock);
// 1. geometry read from the DOM in viewBox units
R.layout = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll(".mc-eclat").forEach((c) => {
    const fr = c.querySelector(".mc-l--frame");
    const sec = c.closest(".row").id;
    const lines = [...fr.querySelectorAll("text[data-name]")];
    const rule = +fr.querySelector("[data-rule]").getAttribute("y");
    const ink = lines.map((l) => {
      const m = inkOf(l);
      const y = +l.getAttribute("y");
      return {
        t: l.textContent,
        size: +l.getAttribute("font-size"),
        y,
        top: +(y - m.a).toFixed(1),
        bottom: +(y + m.d).toFixed(1),
        tl: l.getAttribute("textLength"),
      };
    });
    const vals = [...fr.querySelectorAll("text[data-stat]")].map((t) => {
      const b = t.getBBox();
      return [b.x, b.x + b.width, b.y, b.y + b.height];
    });
    const labels = [...fr.querySelectorAll("text[data-label]")].map((t) => {
      const b = t.getBBox();
      return [+b.x.toFixed(1), +(b.x + b.width).toFixed(1), +t.getAttribute("font-size")];
    });
    const centres = vals.map((v) => (v[0] + v[1]) / 2);
    const tier = [...c.classList]
      .find((k) => /^mc-eclat--(base|homa|stade|pro|champion|legend)$/.test(k))
      .slice(10);
    const word = fr.querySelector("text[data-tier]");
    // founder capsule clearance: capsule = segment centre (872,1482) ± 40 along (cos -45°, sin -45°), radius 24 (mirrored in Arabic)
    let capsule = null;
    if (fr.querySelector("g[data-meta=founder]")) {
      const ar = c.getAttribute("dir") === "rtl";
      const cx = ar ? 128 : 872,
        cy = 1482,
        dx = ar ? -Math.SQRT1_2 : Math.SQRT1_2,
        dy = -Math.SQRT1_2;
      const dist = (px, py) => {
        let t = (px - cx) * dx + (py - cy) * dy;
        t = Math.max(-40, Math.min(40, t));
        const qx = cx + t * dx,
          qy = cy + t * dy;
        return Math.hypot(px - qx, py - qy) - 24;
      };
      let min = 1e9;
      for (const el of fr.querySelectorAll(
        "text[data-stat], text[data-label], text[data-meta=serial]",
      )) {
        const b = el.getBBox();
        for (let x = b.x; x <= b.x + b.width; x += 2)
          for (const y of [b.y, b.y + b.height]) min = Math.min(min, dist(x, y));
        for (let y = b.y; y <= b.y + b.height; y += 2)
          for (const x of [b.x, b.x + b.width]) min = Math.min(min, dist(x, y));
      }
      capsule = +min.toFixed(1);
    }
    out.push({
      sec,
      tier,
      dir: c.getAttribute("dir"),
      name: ink,
      rule,
      nameLastToRule: ink.length ? +(rule - ink[ink.length - 1].bottom).toFixed(1) : null,
      lineGap: ink.length === 2 ? +(ink[1].top - ink[0].bottom).toFixed(1) : null,
      fromTop: ink.length ? +(ink[0].top - (word ? 1142 : 1056)).toFixed(1) : null,
      statCentreMean: +(centres.reduce((a, b) => a + b, 0) / 4).toFixed(1),
      statCentres: centres.map((v) => +v.toFixed(1)),
      labels,
      capsuleClearance: capsule,
    });
  });
  return out;
});
// 2. computed transforms at rest (reduced motion and, below, motion allowed)
R.transformsReduced = await page.evaluate(() => {
  const c = document.querySelector("#full .mc-eclat--pro");
  return {
    tilt: getComputedStyle(c.querySelector(".mc-eclat__tilt")).transform,
    frame: getComputedStyle(c.querySelector(".mc-l--frame")).transform,
    rim1: getComputedStyle(c.querySelector(".mc-rim")).transform,
    style: getComputedStyle(c.querySelector(".mc-eclat__tilt")).transformStyle,
  };
});
// 3. G4 200 px: every text run's size in CSS px
R.g4 = await page.evaluate(() =>
  [...document.querySelectorAll("#g4 .mc-eclat")].map((c) => {
    const w = c.getBoundingClientRect().width;
    return [...c.querySelectorAll(".mc-l--frame text, .mc-l--num text:not(.mc-numtxt)")].map(
      (t) => ({
        t: t.textContent.slice(0, 16),
        px: +((+t.getAttribute("font-size") * w) / 1000).toFixed(1),
      }),
    );
  }),
);
// 4. pips: non-text contrast against the shirt (pip shown vs hidden)
R.pips = [];
{
  const root = page.locator("#full .mc-eclat--base").first();
  await root.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  const pips = root.locator("[data-pip]");
  for (let i = 0; i < (await pips.count()); i++) {
    const el = pips.nth(i);
    const b = await el.boundingBox();
    const clip = { x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4 };
    const on = await raw(await page.screenshot({ clip }));
    // background = the shirt with every pip and its glow hidden
    await root.evaluate((n) =>
      n
        .querySelectorAll(".mc-l--num rect[y='686'], .mc-l--num rect[y='688']")
        .forEach((r) => (r.style.visibility = "hidden")),
    );
    const off = await raw(await page.screenshot({ clip }));
    await root.evaluate((n) =>
      n.querySelectorAll(".mc-l--num rect").forEach((r) => (r.style.visibility = "")),
    );
    const ch = [],
      bg = [];
    for (let j = 0; j < on.data.length; j += 4) {
      const a = lumc(on.data[j], on.data[j + 1], on.data[j + 2]),
        c = lumc(off.data[j], off.data[j + 1], off.data[j + 2]);
      if (Math.abs(a - c) > 0.01) {
        ch.push(a);
        bg.push(c);
      }
    }
    // the pip's stroke (ring) and fill: report the contrast of the outer ring against the shirt and of the fill against the ring
    ch.sort((p, q) => p - q);
    bg.sort((p, q) => p - q);
    const lo = ch[Math.floor(ch.length * 0.02)],
      hi = ch[Math.floor(ch.length * 0.98)],
      shirt = bg[bg.length >> 1];
    R.pips.push({
      state: await el.getAttribute("data-pip"),
      brightPartVsShirt: +ratio(hi, shirt).toFixed(2),
      darkPartVsShirt: +ratio(lo, shirt).toFixed(2),
      heightCssPx: +b.height.toFixed(1),
    });
  }
}
await ctx.close();
// 5. sharpness: mean luminance step across the name's glyph edges, motion allowed, no pointer (rest) — new vs revision 3 before the fix
R.sharp = {};
for (const [label, file] of [
  ["rev3-pre", rev3pre],
  ["rev3b", mock],
]) {
  for (const dpr of [2, 3]) {
    const { ctx, page } = await open(file, { reduced: false, dpr });
    const t = page.locator("#full .mc-eclat--pro text[data-name]").first();
    await t.evaluate((n) => n.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    const b = await t.boundingBox();
    const img = await raw(await page.screenshot({ clip: b }));
    let sum = 0,
      n = 0;
    for (let y = 0; y < img.h; y++)
      for (let x = 1; x < img.w; x++) {
        const i = (y * img.w + x) * 4,
          j = i - 4;
        const d =
          Math.abs(
            img.data[i] +
              img.data[i + 1] +
              img.data[i + 2] -
              img.data[j] -
              img.data[j + 1] -
              img.data[j + 2],
          ) / 3;
        if (d > 8) {
          sum += d;
          n++;
        }
      }
    // flat reference: same page with every transform removed
    await page.addStyleTag({
      content: ".mc-eclat__tilt,.mc-l,.mc-eclat__foil{transform:none!important}",
    });
    await page.waitForTimeout(300);
    const img2 = await raw(await page.screenshot({ clip: b }));
    let sum2 = 0,
      n2 = 0;
    for (let y = 0; y < img2.h; y++)
      for (let x = 1; x < img2.w; x++) {
        const i = (y * img2.w + x) * 4,
          j = i - 4;
        const d =
          Math.abs(
            img2.data[i] +
              img2.data[i + 1] +
              img2.data[i + 2] -
              img2.data[j] -
              img2.data[j + 1] -
              img2.data[j + 2],
          ) / 3;
        if (d > 8) {
          sum2 += d;
          n2++;
        }
      }
    R.sharp[`${label} dpr${dpr}`] = { rest: +(sum / n).toFixed(1), flat: +(sum2 / n2).toFixed(1) };
    await ctx.close();
  }
}
// 6. background texture density (Sobel) in background-only regions of the six main cards, rev2 / rev3 / rev3b
R.texture = {};
for (const [label, file] of [
  ["rev2", rev2],
  ["rev3", rev3pre],
  ["rev3b", mock],
]) {
  const { ctx, page } = await open(file);
  const rows = [];
  for (const t of ["base", "homa", "stade", "pro", "champion", "legend"]) {
    const el = page.locator(`#full .mc-eclat--${t}`).first();
    await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(150);
    const b = await el.boundingBox();
    const img = await raw(await page.screenshot({ clip: b }));
    const S = img.w / 1000;
    const g = (x, y) => {
      const i = (Math.round(y) * img.w + Math.round(x)) * 4;
      return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    };
    const regions = [
      [90, 40, 910, 190],
      [72, 600, 150, 800],
      [850, 600, 928, 800],
      [330, 960, 670, 1010],
    ];
    let strong = 0,
      fine = 0,
      n = 0;
    for (const [x0, y0, x1, y1] of regions)
      for (let y = y0 * S + 1; y < y1 * S - 1; y++)
        for (let x = x0 * S + 1; x < x1 * S - 1; x++) {
          const gx =
            g(x + 1, y - 1) +
            2 * g(x + 1, y) +
            g(x + 1, y + 1) -
            g(x - 1, y - 1) -
            2 * g(x - 1, y) -
            g(x - 1, y + 1);
          const gy =
            g(x - 1, y + 1) +
            2 * g(x, y + 1) +
            g(x + 1, y + 1) -
            g(x - 1, y - 1) -
            2 * g(x, y - 1) -
            g(x + 1, y - 1);
          const m = Math.hypot(gx, gy);
          n++;
          if (m > 120) strong++;
          else if (m > 24) fine++;
        }
    rows.push({
      tier: t,
      strongPct: +((100 * strong) / n).toFixed(2),
      finePct: +((100 * fine) / n).toFixed(2),
    });
  }
  R.texture[label] = rows;
  await ctx.close();
}
// 7. tokens: sleeve tips inside the silhouette at 48 and 32 (shirt-coloured pixels near both sides at sleeve height)
{
  const { ctx, page } = await open(mock, { dpr: 4 });
  R.tokens = await page.evaluate(() => {
    const o = [];
    document
      .querySelectorAll("#tokens .mc-tok")
      .forEach((t) =>
        o.push([t.className, t.getBoundingClientRect().width, t.getBoundingClientRect().height]),
      );
    return o.slice(0, 5);
  });
  await ctx.close();
}
console.log(JSON.stringify(R, null, 1));
await browser.close();
