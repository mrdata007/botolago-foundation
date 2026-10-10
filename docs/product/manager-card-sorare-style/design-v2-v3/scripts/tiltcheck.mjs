import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
const [mock] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const p = await (
  await b.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  })
).newPage();
await p.goto("file://" + mock);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1000);
const el = p.locator("#full .mc-eclat--legend");
await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
const st = () =>
  el.evaluate((n) => ({
    cls: n.className.replace(/mc-eclat--(legend|light|dark)|mc-holo|mc-eclat /g, "").trim(),
    t: getComputedStyle(n).getPropertyValue("--mc-t"),
    tilt: getComputedStyle(n.querySelector(".mc-eclat__tilt")).transform.slice(0, 40),
    frameZ: getComputedStyle(n.querySelector(".mc-l--frame")).transform.slice(0, 50),
    style: getComputedStyle(n.querySelector(".mc-eclat__tilt")).transformStyle,
  }));
console.log("rest", JSON.stringify(await st()));
const bb = await el.boundingBox();
await p.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
await p.mouse.move(bb.x + bb.width * 0.85, bb.y + bb.height * 0.15, { steps: 8 });
await p.waitForTimeout(700);
console.log("active", JSON.stringify(await st()));
await p.mouse.move(5, 5, { steps: 3 });
await p.waitForTimeout(150);
console.log("settling", JSON.stringify(await st()));
await p.waitForTimeout(800);
console.log("after settle", JSON.stringify(await st()));
console.log("animations", await p.evaluate(() => document.getAnimations().length));
await b.close();
