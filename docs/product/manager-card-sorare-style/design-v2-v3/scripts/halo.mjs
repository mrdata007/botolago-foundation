import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
import sharp from "/home/user/botolago-app/node_modules/sharp/lib/index.js";
const [mock] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
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
const page = await (
  await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    reducedMotion: "reduce",
  })
).newPage();
await page.goto("file://" + mock);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);
const raw = async (buf) => {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
};
const els = page.locator("text[data-ovrlabel]");
const res = [];
for (let i = 0; i < (await els.count()); i++) {
  const el = els.nth(i);
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(100);
  const b = await el.boundingBox();
  const clip = { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 };
  const shot = await raw(await page.screenshot({ clip }));
  const k = await el.evaluate((n) => {
    const k = [n.getAttribute("fill"), n.getAttribute("stroke")];
    n.setAttribute("fill", "#ff00ff");
    n.setAttribute("stroke", "#00ff00");
    n.closest(".mc-eclat")
      .querySelectorAll(".mc-l--frame,.mc-l--holo,.mc-eclat__foil")
      .forEach((e) => (e.style.visibility = "hidden"));
    return k;
  });
  const m = await raw(await page.screenshot({ clip }));
  await el.evaluate((n, k) => {
    n.setAttribute("fill", k[0]);
    n.setAttribute("stroke", k[1]);
    n.closest(".mc-eclat")
      .querySelectorAll("*")
      .forEach((e) => (e.style.visibility = ""));
  }, k);
  const F = [],
    H = [];
  for (let j = 0; j < m.length; j += 4) {
    const L = lumc(shot[j], shot[j + 1], shot[j + 2]);
    if (m[j] > 245 && m[j + 1] < 10 && m[j + 2] > 245) F.push(L);
    else if (m[j] < 10 && m[j + 1] > 245 && m[j + 2] < 10) H.push(L);
  }
  F.sort((p, q) => p - q);
  H.sort((p, q) => p - q);
  res.push({
    card: await el.evaluate((n) => n.closest(".mc-eclat").getAttribute("aria-label").slice(17, 45)),
    fillVsHalo: +ratio(F[F.length >> 1], H[H.length >> 1]).toFixed(2),
  });
}
console.log(JSON.stringify(res));
await browser.close();
