import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
const D = process.argv[2];
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const ctx = await browser.newContext({
  viewport: { width: 1000, height: 1600 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  reducedMotion: "reduce",
});
const page = await ctx.newPage();
await page.goto("file://" + D + "/rev3.html");
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);
const out = {};
for (let i = 0; i < 6; i++) {
  for (const mode of ["rest", "flat", "norims"]) {
    await page.evaluate(
      ([i, mode]) => {
        document.body.innerHTML = `<div id="big" style="width:900px;margin:20px">${card(CARDS[i].p, { theme: "dark" })}</div>`;
        document.body.style.background = "#0b1020";
        fit(document);
        const el = document.querySelector("#big .mc-eclat");
        if (mode !== "rest") {
          el.style.setProperty("--mc-ax", "0");
          el.style.setProperty("--mc-ay", "0");
        }
        if (mode === "norims")
          document.querySelectorAll(".mc-rim").forEach((r) => (r.style.display = "none"));
      },
      [i, mode],
    );
    await page.waitForTimeout(300);
    const b = await page.locator("#big .mc-eclat").boundingBox();
    await page.screenshot({
      path: `${D}/big-${i}-${mode}.png`,
      clip: { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 },
    });
  }
  // shirt-only layer for geometry and shading measurement (flat)
  await page.evaluate(() => {
    document
      .querySelectorAll("#big .mc-l, #big .mc-eclat__foil, #big .mc-eclat__shadow")
      .forEach((n) => {
        if (!n.classList.contains("mc-l--shirt")) n.style.visibility = "hidden";
      });
    document.body.style.background = "#ff00ff";
  });
  await page.waitForTimeout(200);
  const b = await page.locator("#big .mc-eclat").boundingBox();
  await page.screenshot({
    path: `${D}/shirtonly-${i}.png`,
    clip: { x: b.x, y: b.y, width: b.width, height: b.height },
  });
}
await browser.close();
