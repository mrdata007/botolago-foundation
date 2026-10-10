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
for (let i = 0; i < 6; i++) {
  await page.evaluate((i) => {
    document.body.innerHTML = `<div id="big" style="width:900px;margin:20px">${card(CARDS[i].p, { theme: "dark" })}</div>`;
    document.body.style.background = "#ff00ff";
    fit(document);
    const el = document.querySelector("#big .mc-eclat");
    el.style.setProperty("--mc-ax", "0");
    el.style.setProperty("--mc-ay", "0");
    el.querySelector(".mc-eclat__shadow").style.display = "none";
    el.querySelectorAll(".mc-l").forEach((n) => {
      if (n.classList.contains("mc-l--shirt")) return;
      if (n.classList.contains("mc-l--base")) {
        [...n.children].forEach((c) => {
          if (c.tagName !== "defs") c.style.display = "none";
        });
        return;
      }
      n.style.opacity = "0";
    });
    el.querySelector(".mc-eclat__foil").style.display = "none";
  }, i);
  await page.waitForTimeout(300);
  const b = await page.locator("#big .mc-eclat").boundingBox();
  await page.screenshot({
    path: `${D}/shirtonly-${i}.png`,
    clip: { x: b.x, y: b.y, width: b.width, height: b.height },
  });
}
await browser.close();
