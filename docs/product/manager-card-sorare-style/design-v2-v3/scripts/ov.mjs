import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
const [mock] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
for (const theme of ["light", "dark"])
  for (const w of [320, 390, 1440]) {
    const p = await (
      await b.newContext({
        viewport: { width: w, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: "reduce",
      })
    ).newPage();
    const errs = [];
    p.on("console", (m) => ["error", "warning"].includes(m.type()) && errs.push(m.text()));
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto("file://" + mock);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1000);
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      let maxR = 0,
        minL = 1e9,
        first = null;
      for (const e of document.querySelectorAll("body *")) {
        const r = e.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        maxR = Math.max(maxR, r.right);
        minL = Math.min(minL, r.left);
        if ((r.right > vw + 0.5 || r.left < -0.5) && !first) first = e.outerHTML.slice(0, 160);
      }
      return {
        vw,
        scrollW: document.documentElement.scrollWidth,
        maxR: +maxR.toFixed(1),
        minL: +minL.toFixed(1),
        first,
      };
    });
    console.log(theme, w, JSON.stringify(r), "console:", errs.length);
  }
await b.close();
