import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
// usage: node g4widths.mjs <mock.html> <out dir>  -> per G4 card: rendered width and its smallest text run in CSS px
// (font size × screen CTM), console messages and scrollWidth, at 1440 / 320 / 390; G4 row and two card crops as PNG
const [mock, out = "."] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
for (const [w, theme] of [
  [1440, "dark"],
  [320, "dark"],
  [390, "light"],
]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => ["error", "warning"].includes(m.type()) && errs.push(m.text()));
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto("file://" + mock);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1200);
  const g4 = p.locator("#g4");
  await g4.scrollIntoViewIfNeeded();
  await g4.screenshot({ path: `${out}/g4-${w}-${theme}.png` });
  if (w === 1440) {
    const c = p.locator("#full figure").nth(0);
    await c.screenshot({ path: `${out}/base-${theme}.png` });
    await p
      .locator("#full figure")
      .nth(3)
      .screenshot({ path: `${out}/pro-${theme}.png` });
  }
  const r = await p.evaluate(() =>
    [...document.querySelectorAll("#g4 .mc-eclat")].map((c) => {
      const W = c.getBoundingClientRect().width;
      const t = [...c.querySelectorAll(".mc-l--frame text, .mc-l--num text:not(.mc-numtxt)")].map(
        (t) => {
          const ctm = t.getScreenCTM();
          return [
            t.textContent.slice(0, 12),
            +(+t.getAttribute("font-size") * Math.hypot(ctm.a, ctm.b)).toFixed(2),
          ];
        },
      );
      return {
        W: +W.toFixed(1),
        min: t.reduce((m, x) => (x[1] < m[1] ? x : m), ["", 99]),
        n: t.length,
      };
    }),
  );
  console.log(
    w,
    theme,
    "errs",
    errs,
    JSON.stringify(r),
    await p.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]),
  );
  await ctx.close();
}
await b.close();
