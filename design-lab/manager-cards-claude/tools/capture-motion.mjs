// Motion proof for the onboarding screens: one screen at t = 0 with the card beat switched on
// (prefers-reduced-motion: no-preference, motion=1, every animation rewound to 0 and paused), or
// the same screen under reduced motion. The capture shows the number and the serial already there
// in the first painted frame. Prints JSON: the animations paused at 0, and the opacity and
// visibility of every OVR and serial carrier it found.
//   PW_CORE=/path/to/playwright-core/index.mjs CHROME=/path/to/chrome \
//   node tools/capture-motion.mjs "<onboarding.html url without motion>" <out.png> [--reduced] [--dpr=1]
const args = process.argv.slice(2);
const [url, out] = args.filter((a) => !a.startsWith("--"));
const reduced = args.includes("--reduced");
const dpr = Number((args.find((a) => a.startsWith("--dpr=")) || "--dpr=1").split("=")[1]);
const pw = await import(process.env.PW_CORE || "playwright-core");
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
const scheme = /scheme=dark/.test(url) ? "dark" : "light";
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: dpr,
  reducedMotion: reduced ? "reduce" : "no-preference",
  colorScheme: scheme,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url + (url.includes("?") ? "&" : "?") + "motion=1", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, {
  timeout: 15000,
});
await page.evaluate(() => document.fonts.ready);
// Rewind to the first frame and hold it: an animation with a delay shows its first keyframe.
const info = await page.evaluate(() => {
  const anims = document.getAnimations();
  anims.forEach((a) => {
    a.pause();
    a.currentTime = 0;
  });
  const opacity = (el) => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.trim();
    if (!/^(\d{2}|—)$/.test(t) && !/BOT #\d{6}/.test(t)) continue;
    const el = n.parentElement;
    if (el.closest("template, .onbp-label")) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    found.push({
      text: t.slice(0, 24),
      opacity: Math.round(opacity(el) * 100) / 100,
      visibility: getComputedStyle(el).visibility,
    });
  }
  return { paused: anims.length, found };
});
await page.waitForTimeout(150);
await page.screenshot({ path: out });
console.log(JSON.stringify({ out, mode: reduced ? "reduced" : "motion t=0", errors, ...info }));
await browser.close();
