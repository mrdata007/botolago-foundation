import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
const [mock, out, sel, theme = "dark"] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  proxy: { server: process.env.HTTPS_PROXY },
});
const p = await (
  await b.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: "reduce",
  })
).newPage();
await p.goto("file://" + mock);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1000);
await p.locator(sel).screenshot({ path: out });
await b.close();
