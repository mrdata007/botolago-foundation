/**
 * Desktop check for G1 and G2: the stage column stays in view while the rest of the page scrolls
 * (plan 4.1, « la carte reste accrochée »). Measured on element rectangles, never `scrollWidth`:
 * the column's top edge at scroll 0 and after scrolling the page, in French and Arabic, light.
 *
 *   BASE=http://127.0.0.1:4183 node docs/product/manager-card-section/wp3/sticky.mjs
 *
 * Exits 1 when, scrolled to the foot, the column is not at its sticky offset inside the window.
 */
import { launch, newContext, open } from "./harness.mjs";

const browser = await launch();
let failed = 0;
for (const [lang, path] of [
  ["fr", "/gradins?mc=rated"],
  ["ar", "/gradins?mc=rated"],
  ["fr", "/gradins/carte?mc=rated"],
  ["ar", "/gradins/carte?mc=rated"],
]) {
  const context = await newContext(browser, {
    lang,
    theme: "light",
    width: 1440,
    height: 900,
    scale: 1,
    reduced: true,
  });
  const page = await context.newPage();
  await open(page, path, lang);
  const measure = () =>
    page.evaluate(() => {
      const stage = document.querySelector('[data-testid="gradins-stage"]');
      const column = stage?.closest(".md\\:sticky");
      const r = column?.getBoundingClientRect();
      return {
        top: r ? Math.round(r.top) : null,
        bottom: r ? Math.round(r.bottom) : null,
        pageHeight: Math.round(document.documentElement.scrollHeight),
        viewport: innerHeight,
        scrollY: Math.round(scrollY),
        stickyTop: column ? parseFloat(getComputedStyle(column).top) : null,
      };
    });
  const before = await measure();
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(400);
  const during = await measure();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const after = await measure();
  // Scrolled to the foot of the page the column rests at its sticky offset, inside the window, and
  // it never moved down on the way (a hero above it may keep it lower at the start).
  const scrolled = during.scrollY > 100;
  const rests =
    after.top !== null &&
    Math.abs(after.top - after.stickyTop) <= 1 &&
    after.bottom <= after.viewport + 1;
  const neverDown = during.top <= before.top && after.top <= during.top;
  const ok = scrolled && rests && neverDown;
  if (!ok) failed += 1;
  console.log(
    `${lang} ${path}: top ${before.top} -> ${during.top} -> ${after.top} (scrolled ${during.scrollY}, page ${before.pageHeight}px): ${ok ? "ok" : "FAIL"}`,
  );
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
