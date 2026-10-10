import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: { server: process.env.HTTPS_PROXY },
});
for (const [label, file] of [
  ["rev2", process.argv[2]],
  ["rev3", process.argv[3]],
]) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto("file://" + file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const el = page.locator("#full .mc-eclat--legend");
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  const b = await el.boundingBox();
  // full() cost: time to build the six cards' markup
  const build = await page.evaluate(() => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) CARDS.forEach((c) => card(c.p, {}));
    return (performance.now() - t0) / 120;
  });
  await page.evaluate(() => {
    window.__f = [];
    let last = performance.now();
    const loop = (t) => {
      window.__f.push(t - last);
      last = t;
      if (window.__f.length < 400) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  for (let i = 0; i < 90; i++) {
    const a = (i / 89) * Math.PI * 2;
    await page.mouse.move(
      b.x + b.width * (0.5 + 0.45 * Math.cos(a)),
      b.y + b.height * (0.5 + 0.45 * Math.sin(a)),
    );
    await page.waitForTimeout(16);
  }
  const f = await page.evaluate(() => window.__f.slice(5));
  f.sort((x, y) => x - y);
  console.log(
    label,
    "card() ms",
    build.toFixed(2),
    "frames",
    f.length,
    "median ms",
    f[Math.floor(f.length / 2)].toFixed(1),
    "p95",
    f[Math.floor(f.length * 0.95)].toFixed(1),
    "max",
    f[f.length - 1].toFixed(1),
  );
  await page.close();
}
await browser.close();
