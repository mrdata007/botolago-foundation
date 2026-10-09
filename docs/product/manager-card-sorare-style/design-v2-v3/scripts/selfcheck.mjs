// usage: node selfcheck.mjs <mock.html> <rev2-mock.html>  -> prints JSON results
import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
import sharp from "/home/user/botolago-app/node_modules/sharp/lib/index.js";
const [mock, rev2, rev3pre] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: { server: process.env.HTTPS_PROXY },
});
const R = { console: {}, overflow: {}, number: [], tokens32: [], contrast: [], counts: {} };
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
async function open(width, theme, reduced = true, dpr = 2, file = mock) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: dpr,
    colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on(
    "console",
    (m) =>
      (m.type() === "error" || m.type() === "warning") && errs.push(m.type() + ": " + m.text()),
  );
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("file://" + file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  return { ctx, page, errs };
}
async function raw(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// 1+2: console errors and overflow (element rectangles against the viewport)
for (const theme of ["light", "dark"])
  for (const w of [1440, 390, 320]) {
    const { ctx, page, errs } = await open(w, theme);
    const ov = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      let worst = null,
        maxR = 0,
        minL = 1e9;
      for (const e of document.querySelectorAll("body *")) {
        const r = e.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        if (r.right > maxR) {
          maxR = r.right;
        }
        if (r.left < minL) minL = r.left;
        if (r.right > vw + 0.5 || r.left < -0.5)
          worst = worst || e.tagName + "." + (e.className.baseVal ?? e.className);
      }
      // text inside each card's own box: names, tier word, stats, serial within the card root rect
      const inside = [];
      for (const c of document.querySelectorAll(".mc-eclat")) {
        const cr = c.getBoundingClientRect();
        for (const t of c.querySelectorAll(".mc-l--frame text")) {
          const r = t.getBoundingClientRect();
          if (r.left < cr.left - 1 || r.right > cr.right + 1)
            inside.push(t.textContent.slice(0, 20));
        }
      }
      // name lines in viewBox units (fit budget x 100-900)
      const names = [...document.querySelectorAll("text[data-name]")].map((t) => {
        const b = t.getBBox();
        return [t.textContent, +b.x.toFixed(1), +(b.x + b.width).toFixed(1)];
      });
      const nameOut = names.filter(([, a, b]) => a < 99.5 || b > 900.5);
      return {
        vw,
        maxRight: +maxR.toFixed(1),
        minLeft: +minL.toFixed(1),
        firstEscaping: worst,
        textOutsideCard: inside,
        names: names.length,
        nameOutsideBudget: nameOut,
      };
    });
    R.console[`${theme} ${w}`] = errs;
    R.overflow[`${theme} ${w}`] = ov;
    await ctx.close();
  }

// 3: the number's ink (with outlines) inside the chest box, pixel scan at 1 unit = 1 px
{
  const { ctx, page } = await open(1000, "dark", true, 1);
  await page.setViewportSize({ width: 1000, height: 1618 });
  const RAJA = { initials: "RCA", name: "Raja CA", primary: "#0a8f3a", secondary: "#ffffff" };
  for (const ovr of [8, 11, 44, 88, 99, null]) {
    const info = await page.evaluate(
      ({ ovr, RAJA }) => {
        const html = card(
          {
            name: "Test",
            ovr,
            tier: ovr == null ? null : "pro",
            season: "2026/27",
            serial: "1",
            club: RAJA,
            stats: [1, 2, 3, 4],
          },
          {},
        );
        const d = document.createElement("div");
        d.innerHTML = html;
        const g = d.querySelector(".mc-l--num g[data-mc=ovr]").cloneNode(true);
        g.querySelector("rect").remove();
        g.querySelectorAll("text").forEach((t) => {
          t.removeAttribute("opacity");
          if (t.getAttribute("fill") !== "none") t.setAttribute("fill", "#ff0000");
          if (t.getAttribute("stroke")) t.setAttribute("stroke", "#ff0000");
          t.removeAttribute("stroke-opacity");
        });
        document.body.innerHTML = `<svg id="probe" width="1000" height="1618" viewBox="0 0 1000 1618" style="position:fixed;left:0;top:0;background:#000;direction:ltr"><g id="wrap"></g><path id="shirt" d="${SHIRT}" fill="none"/></svg>`;
        document.getElementById("wrap").appendChild(g);
        return {
          CHEST,
          num: ovr == null ? "—" : String(ovr),
          fit: ovr == null ? null : fitNumber(String(ovr), CHEST, OUTLINE_HALF, 300).size,
        };
      },
      { ovr, RAJA },
    );
    await page.waitForTimeout(100);
    const { data, w, h } = await raw(
      await page.screenshot({ clip: { x: 0, y: 0, width: 1000, height: 1618 } }),
    );
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i] > 60 && data[i + 1] < 40) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    const C = info.CHEST;
    const box = ovr == null ? { x0: 380, x1: 620, y0: 556, y1: 644 } : C;
    const inBox = x0 >= box.x0 && x1 + 1 <= box.x1 && y0 >= box.y0 && y1 + 1 <= box.y1;
    const inShirt = await page.evaluate(
      ([a, b, c, d]) => {
        const s = document.getElementById("shirt");
        const sv = document.getElementById("probe");
        const P = (x, y) => {
          const p = sv.createSVGPoint();
          p.x = x;
          p.y = y;
          return s.isPointInFill(p);
        };
        return P(a, b) && P(c, b) && P(a, d) && P(c, d);
      },
      [x0, y0, x1 + 1, y1 + 1],
    );
    const T = (x, y) => [+(1.12 * x - 60).toFixed(1), +(1.12 * y - 86).toFixed(1)];
    R.number.push({
      ovr: info.num,
      size: info.fit && +info.fit.toFixed(1),
      ink_jersey: [x0, y0, x1 + 1, y1 + 1],
      box_jersey: [box.x0, box.y0, box.x1, box.y1],
      ink_card: [...T(x0, y0), ...T(x1 + 1, y1 + 1)],
      insideBox: inBox,
      insideShirt: inShirt,
    });
  }
  // 32 px token: the number's ink height in CSS px (canvas ink metrics of the drawn size)
  await page.goto("file://" + mock);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  for (const ovr of [8, 11, 44, 88, 99])
    for (const size of [80, 64, 48, 32]) {
      const r = await page.evaluate(
        ({ ovr, size }) => {
          const html = token(
            {
              name: "T",
              ovr,
              tier: "pro",
              club: { primary: "#0a8f3a", secondary: "#ffffff", initials: "RCA" },
            },
            size,
            {},
          );
          const d = document.createElement("div");
          d.innerHTML = html;
          const t = d.querySelector("g[data-mc=ovr] text:last-child");
          const fs = +t.getAttribute("font-size");
          const m = ink(String(ovr), fs);
          const k = size / 1618;
          return {
            ovr,
            size,
            inkHeightPx: +((m.a + m.d) * k).toFixed(2),
            inkWidthPx: +((m.l + m.r) * k).toFixed(2),
            cardWidthPx: Math.round(size * 0.618),
          };
        },
        { ovr, size },
      );
      R.tokens32.push(r);
    }
  await ctx.close();
}

// 4: contrast from rasterised pixels (text shot vs the same shot with the text hidden)
async function contrastRun(theme, pointer) {
  const { ctx, page } = await open(1440, theme, !pointer, 2);
  const tiers = ["base", "homa", "stade", "pro", "champion", "legend"];
  const out = [];
  for (const sec of ["full", "arabic", "names", "g4"])
    for (const t of tiers) {
      const roots = page.locator(`#${sec} .mc-eclat--${t}`);
      for (let ri = 0; ri < (await roots.count()); ri++) {
        const root = roots.nth(ri);
        await root.evaluate((n) => n.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(150);
        const groups = {
          name: "text[data-name]",
          tier: "text[data-tier]",
          statValue: "text[data-stat]",
          statLabel: "text[data-label]",
          ovr: ".mc-l--num g[data-mc=ovr] text:nth-of-type(3)",
          ovrLabel: "text[data-ovrlabel]",
          meta: "text[data-meta], g[data-meta] text",
        };
        if (pointer) {
          const nb = await root
            .locator(pointer === "ovr" ? ".mc-l--num g[data-mc=ovr] rect" : "text[data-name]")
            .first()
            .boundingBox();
          if (nb) {
            await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2, { steps: 6 });
            await page.waitForTimeout(400);
          }
        }
        for (const [kind, sel] of Object.entries(groups)) {
          const els = root.locator(sel);
          const n = await els.count();
          for (let i = 0; i < n; i++) {
            const el = els.nth(i);
            const b = await el.boundingBox();
            if (!b || b.width < 1) continue;
            const sy = await page.evaluate(() => scrollY);
            const clip = { x: b.x, y: b.y + sy, width: b.width, height: b.height };
            const on = await raw(await page.screenshot({ clip, fullPage: true }));
            const hideSel = kind === "ovr" ? ".mc-l--num" : null;
            await el.evaluate((n, h) => {
              const t = h ? n.closest(h) : n;
              t.style.visibility = "hidden";
            }, hideSel);
            const off = await raw(await page.screenshot({ clip, fullPage: true }));
            await el.evaluate((n, h) => {
              const t = h ? n.closest(h) : n;
              t.style.visibility = "";
            }, hideSel);
            const px = [];
            for (let j = 0; j < on.data.length; j += 4) {
              const a = lumc(on.data[j], on.data[j + 1], on.data[j + 2]),
                c = lumc(off.data[j], off.data[j + 1], off.data[j + 2]);
              px.push([Math.abs(a - c), a, c]);
            }
            px.sort((p, q) => q[0] - p[0]);
            const top = px
              .slice(0, Math.max(3, Math.floor(px.length * 0.04)))
              .map((p) => p[1])
              .sort((p, q) => p - q);
            const textL = top[Math.floor(top.length / 2)];
            const bg = px.map((p) => p[2]).sort((p, q) => p - q);
            const med = bg[Math.floor(bg.length / 2)],
              p10 = bg[Math.floor(bg.length * 0.1)],
              p90 = bg[Math.floor(bg.length * 0.9)];
            const worstBg = Math.abs(p10 - textL) < Math.abs(p90 - textL) ? p10 : p90;
            // local ring: unchanged pixels within 3 device px of a changed pixel (the glyph's own surround)
            const W = on.w,
              H = on.h,
              thr = 0.02;
            const ch = new Uint8Array(W * H);
            for (let q = 0; q < W * H; q++) {
              const j = q * 4;
              ch[q] =
                Math.abs(
                  lumc(on.data[j], on.data[j + 1], on.data[j + 2]) -
                    lumc(off.data[j], off.data[j + 1], off.data[j + 2]),
                ) > thr
                  ? 1
                  : 0;
            }
            const ring = [];
            for (let y = 0; y < H; y++)
              for (let x = 0; x < W; x++) {
                const q = y * W + x;
                if (ch[q]) continue;
                let near = false;
                for (let dy = -3; dy <= 3 && !near; dy++)
                  for (let dx = -3; dx <= 3; dx++) {
                    const yy = y + dy,
                      xx = x + dx;
                    if (yy >= 0 && yy < H && xx >= 0 && xx < W && ch[yy * W + xx]) {
                      near = true;
                      break;
                    }
                  }
                if (near) {
                  const j = q * 4;
                  ring.push(lumc(on.data[j], on.data[j + 1], on.data[j + 2]));
                }
              }
            ring.sort((p, q) => p - q);
            const rMed = ring[Math.floor(ring.length / 2)],
              r05 = ring[Math.floor(ring.length * 0.05)],
              r95 = ring[Math.floor(ring.length * 0.95)];
            const rWorst = Math.abs(r05 - textL) < Math.abs(r95 - textL) ? r05 : r95;
            out.push({
              sec,
              tier: t,
              card: ri,
              kind,
              i,
              text: (await el.textContent()).slice(0, 18),
              median: +ratio(textL, med).toFixed(2),
              worst: +ratio(textL, worstBg).toFixed(2),
              ringMedian: ring.length ? +ratio(textL, rMed).toFixed(2) : null,
              ringWorst5: ring.length ? +ratio(textL, rWorst).toFixed(2) : null,
              px: [Math.round(b.width), Math.round(b.height)],
            });
          }
        }
        if (pointer) await page.mouse.move(2, 2);
      }
    }
  await ctx.close();
  return out;
}
for (const theme of ["light", "dark"])
  R.contrast.push({ theme, pose: "rest", rows: await contrastRun(theme, false) });
R.contrast.push({
  theme: "dark",
  pose: "pointer over the name",
  rows: await contrastRun("dark", "name"),
});
R.contrast.push({
  theme: "dark",
  pose: "pointer over the number",
  rows: await contrastRun("dark", "ovr"),
});

// 5: drawn elements per full card, revision 2 vs revision 3
for (const [label, file] of [
  ["rev2", rev2],
  ["rev3", rev3pre],
  ["rev3b", mock],
]) {
  const { ctx, page } = await open(1440, "dark", true, 1, file);
  R.counts[label] = await page.evaluate(() =>
    [...document.querySelectorAll("#full .mc-eclat")].map((c) => {
      const all = [
        ...c.querySelectorAll(
          "svg:not(.mc-rim) :is(path,rect,circle,ellipse,text,line,polygon,polyline)",
        ),
      ].filter((e) => !e.closest("defs,mask,pattern,clipPath"));
      return {
        tier: [...c.classList]
          .find((k) => /^mc-eclat--(base|homa|stade|pro|champion|legend)$/.test(k))
          .slice(10),
        drawn: all.length,
        text: all.filter((e) => e.tagName === "text").length,
        bytes: c.outerHTML.length,
      };
    }),
  );
  await ctx.close();
}
console.log(JSON.stringify(R, null, 1));
await browser.close();
