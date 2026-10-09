// usage: node capture.mjs <mock.html> <outdir>
import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
import fs from "node:fs";
const [mock, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const TIERS = [
  ["base", "base"],
  ["homa", "lastreet"],
  ["stade", "stade"],
  ["pro", "pro"],
  ["champion", "champion"],
  ["legend", "legend"],
];
const log = [];
async function open(width, theme, reduced = true) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("file://" + mock);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}
async function crop(page, sel, file, pad = 20) {
  const el = page.locator(sel).first();
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  const b = await el.boundingBox();
  const sy = await page.evaluate(() => scrollY);
  await page.screenshot({
    path: file,
    fullPage: true,
    clip: {
      x: Math.max(0, b.x - pad),
      y: Math.max(0, b.y + sy - pad),
      width: b.width + 2 * pad,
      height: b.height + 2 * pad,
    },
  });
}
for (const theme of ["light", "dark"]) {
  for (const w of [1440, 390]) {
    const { ctx, page, errs } = await open(w, theme);
    await page.screenshot({ path: `${out}/full-${w}-${theme}.png`, fullPage: true });
    if (w === 1440) {
      for (const [cls, name] of TIERS)
        await crop(page, `#full .mc-eclat--${cls}`, `${out}/tier-${name}-${theme}.png`);
      await crop(page, "#tokens", `${out}/tokens-${theme}.png`, 8);
      await crop(page, "#arabic", `${out}/arabic-${theme}.png`, 0);
    }
    log.push(`${theme} ${w}: console errors ${errs.length ? errs.join(" | ") : "none"}`);
    await ctx.close();
  }
}
// pointer-tilted crops (motion allowed): pointer at the top-trailing area of the card
for (const [cls, name] of [
  ["pro", "pro"],
  ["legend", "legend"],
]) {
  for (const theme of ["dark"]) {
    const { ctx, page } = await open(1440, theme, false);
    const el = page.locator(`#full .mc-eclat--${cls}`).first();
    await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
    const b = await el.boundingBox();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await page.mouse.move(b.x + b.width * 0.86, b.y + b.height * 0.18, { steps: 8 });
    await page.waitForTimeout(700);
    const nb = await el.boundingBox();
    await page.screenshot({
      path: `${out}/tilt-${name}-${theme}.png`,
      clip: { x: nb.x - 28, y: nb.y - 28, width: nb.width + 56, height: nb.height + 56 },
    });
    await ctx.close();
  }
}
fs.writeFileSync(`${out}/capture-log.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
await browser.close();
