// the number's fill and the « OVR » label against the shirt under them, from pixels:
// fill pixels located by repainting the fill magenta; shirt = the same pixels with the whole number layer hidden
import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
import sharp from "/home/user/botolago-app/node_modules/sharp/lib/index.js";
const [mock, theme = "dark"] = process.argv.slice(2);
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
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: theme,
  reducedMotion: "reduce",
});
const page = await ctx.newPage();
await page.goto("file://" + mock);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);
const raw = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width };
};
const out = [];
const cards = page.locator(".mc-eclat");
for (let i = 0; i < (await cards.count()); i++) {
  const c = cards.nth(i);
  const meta = await c.evaluate((n) => ({
    sec: n.closest(".row").id,
    tier: [...n.classList]
      .find((k) => /^mc-eclat--(base|homa|stade|pro|champion|legend)$/.test(k))
      .slice(10),
    label: n.getAttribute("aria-label").slice(0, 40),
  }));
  for (const [kind, sel] of [
    ["number", ".mc-l--num g[data-mc=ovr] > text:nth-of-type(3)"],
    ["ovrLabel", ".mc-l--num text[data-ovrlabel]"],
  ]) {
    const el = c.locator(sel).first();
    if (!(await el.count())) continue;
    await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(120);
    const b = await el.boundingBox();
    const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
    const shot = await raw(await page.screenshot({ clip }));
    const keep = await el.evaluate((n) => [n.getAttribute("fill"), n.getAttribute("stroke")]);
    await el.evaluate((n) => {
      n.setAttribute("fill", "#ff00ff");
      n.removeAttribute("stroke");
    });
    // hide the overlays painted on top of the fill so the magenta is exact
    await c.evaluate((n) =>
      n
        .querySelectorAll(
          ".mc-l--num g[data-mc=ovr] > text:nth-of-type(n+4), .mc-l--num g[clip-path], .mc-l--frame, .mc-l--holo, .mc-eclat__foil",
        )
        .forEach((e) => (e.style.visibility = "hidden")),
    );
    const mag = await raw(await page.screenshot({ clip }));
    await c.evaluate((n) => (n.querySelector(".mc-l--num").style.visibility = "hidden"));
    const bg = await raw(await page.screenshot({ clip }));
    await c.evaluate((n) => n.querySelectorAll("*").forEach((e) => (e.style.visibility = "")));
    await el.evaluate((n, k) => {
      n.setAttribute("fill", k[0]);
      if (k[1]) n.setAttribute("stroke", k[1]);
    }, keep);
    const T = [],
      B = [];
    for (let j = 0; j < mag.data.length; j += 4)
      if (mag.data[j] > 245 && mag.data[j + 1] < 10 && mag.data[j + 2] > 245) {
        T.push(lumc(shot.data[j], shot.data[j + 1], shot.data[j + 2]));
        B.push(lumc(bg.data[j], bg.data[j + 1], bg.data[j + 2]));
      }
    T.sort((p, q) => p - q);
    B.sort((p, q) => p - q);
    const tm = T[T.length >> 1],
      bm = B[B.length >> 1];
    out.push({
      ...meta,
      kind,
      px: T.length,
      fillVsShirt: +ratio(tm, bm).toFixed(2),
      worst10: +ratio(
        T[Math.floor(T.length * (tm > bm ? 0.1 : 0.9))],
        B[Math.floor(B.length * (tm > bm ? 0.9 : 0.1))],
      ).toFixed(2),
    });
  }
}
console.log(JSON.stringify(out));
await browser.close();
