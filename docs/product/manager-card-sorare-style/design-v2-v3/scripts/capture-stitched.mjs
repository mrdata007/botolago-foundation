// usage: node capture-stitched.mjs <mock.html> <outdir>
// The whole-page pictures (full-{1440,390}-{light,dark}.png), made by stitching viewport-sized
// screenshots instead of one `fullPage` screenshot. Why: revision 3's cards are 3D (preserve-3d) layers,
// and in a one-shot full-page capture Chromium (headless, software raster) draws the ones below the first
// viewport only in part (blocks of flat colour, see INDEX.md "Full-page captures"). Scrolled into the
// viewport, the same cards are drawn whole. Each step scrolls one viewport, waits for the raster, and
// takes a viewport screenshot; the last step is clipped to what the previous one did not cover.
import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
import sharp from "/home/user/botolago-app/node_modules/sharp/lib/index.js";
import fs from "node:fs";
const [mock, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const DPR = 2;
const VH = 900;
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const log = [];
for (const theme of ["light", "dark"]) {
  for (const w of [1440, 390]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: VH },
      deviceScaleFactor: DPR,
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto("file://" + mock);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const tiles = [];
    for (let y = 0; y < height; y += VH) {
      const top = Math.min(y, Math.max(0, height - VH));
      await page.evaluate((t) => window.scrollTo(0, t), top);
      await page.waitForTimeout(350);
      const sy = await page.evaluate(() => Math.round(window.scrollY));
      const png = await page.screenshot();
      // keep only the rows this tile adds (the last tile overlaps the one before it)
      const skip = (y - sy) * DPR;
      const rows = Math.min(VH, height - y) * DPR;
      tiles.push({
        input: await sharp(png)
          .extract({ left: 0, top: skip, width: w * DPR, height: rows - 0 })
          .toBuffer(),
        top: y * DPR,
        left: 0,
      });
    }
    const file = `${out}/full-${w}-${theme}.png`;
    await sharp({
      create: {
        width: w * DPR,
        height: height * DPR,
        channels: 3,
        background: theme === "dark" ? "#0b1020" : "#f4f6f9",
      },
    })
      .composite(tiles)
      .png({ palette: true, quality: 92 })
      .toFile(file);
    log.push(
      `${theme} ${w}: ${tiles.length} viewport screenshots, ${w * DPR}x${height * DPR} px, console errors ${errs.length ? errs.join(" | ") : "none"}`,
    );
    await ctx.close();
  }
}
fs.writeFileSync(`${out}/capture-stitched-log.txt`, log.join("\n") + "\n");
console.log(log.join("\n"));
await browser.close();
