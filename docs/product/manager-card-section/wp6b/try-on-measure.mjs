/**
 * WP6b item 4: where the club discs of the guest's try-on sit, at several widths, French and Arabic.
 * The development football data has eight clubs; the real list has sixteen, so the list is padded to
 * sixteen in the page (copies of the first eight) before measuring. Every disc must lie inside the
 * window and be at least 44 x 44.
 *
 *   BASE=http://127.0.0.1:4186 node docs/product/manager-card-section/wp6b/try-on-measure.mjs
 */
const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const base = process.env.BASE ?? "http://127.0.0.1:4186";
const pw = await import(PW_CORE);
const browser = await pw.chromium.launch({ executablePath: CHROME });
let bad = 0;
for (const width of [320, 360, 375, 390, 430, 768, 1440])
  for (const lang of ["fr", "ar"]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.addInitScript((lang) => {
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.language", lang);
      sessionStorage.setItem("botolago.splashShown", "1");
    }, lang);
    await page.goto(`${base}/gradins`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="gradins-try-on"] li', { timeout: 25000 });
    await page.waitForTimeout(800);
    const found = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="gradins-try-on"] ul');
      while (list.children.length < 16)
        list.appendChild(list.children[list.children.length % 8].cloneNode(true));
      const boxes = [...list.querySelectorAll("button")].map((button) =>
        button.getBoundingClientRect(),
      );
      const tops = [...new Set(boxes.map((box) => Math.round(box.top)))];
      return {
        count: boxes.length,
        left: Math.round(Math.min(...boxes.map((box) => box.left))),
        right: Math.round(Math.max(...boxes.map((box) => box.right))),
        minW: Math.round(Math.min(...boxes.map((box) => box.width))),
        minH: Math.round(Math.min(...boxes.map((box) => box.height))),
        rows: tops.map((top) => boxes.filter((box) => Math.round(box.top) === top).length),
        viewport: innerWidth,
      };
    });
    const ok =
      found.left >= 0 && found.right <= found.viewport && found.minW >= 44 && found.minH >= 44;
    if (!ok) bad += 1;
    console.log(width, lang, JSON.stringify(found), ok ? "OK" : "CUT OR SMALL");
    await context.close();
  }
await browser.close();
process.exit(bad ? 1 : 0);
