// Screenshot helper for the lab. Needs playwright-core and a Chromium.
//   PW_CORE=/path/to/node_modules/playwright-core/index.mjs CHROME=/path/to/chrome \
//   node tools/capture.mjs <url> <out.png> [width=1440] [--section=<data-shot>] [--el=<css selector>] [--dpr=2] [--height=900] [--viewport]
// Waits for <html data-ready="1">, settles fonts, disables animation, then captures
// the full page (default), the viewport only (--viewport), a preview section, or one element.
const args = process.argv.slice(2);
const [url, out, widthArg] = args.filter((a) => !a.startsWith("--"));
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const pw = await import(process.env.PW_CORE || "playwright-core");
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
const width = Number(widthArg || 1440);
const page = await browser.newPage({
  viewport: { width, height: Number(flag("height") || 900) },
  deviceScaleFactor: Number(flag("dpr") || 2),
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 15000 }).catch(() => {});
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}" });
await page.waitForTimeout(250);
const section = flag("section");
const el = flag("el");
if (section) await page.locator(`[data-shot="${section}"]`).first().screenshot({ path: out });
else if (el) await page.locator(el).first().screenshot({ path: out });
else await page.screenshot({ path: out, fullPage: !args.includes("--viewport") });
// Overflow report: elements whose box escapes the page width (measured, not scrollWidth).
const overflow = await page.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const bad = [];
  for (const n of document.querySelectorAll("body *")) {
    const r = n.getBoundingClientRect();
    if (r.width && (r.right > w + 1 || r.left < -1)) bad.push(`${n.tagName.toLowerCase()}.${String(n.className?.baseVal ?? n.className).split(" ")[0]} ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (bad.length > 12) break;
  }
  return bad;
});
console.log(JSON.stringify({ out, width, errors, overflow }));
await browser.close();
