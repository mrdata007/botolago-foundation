/**
 * Finding 1 of the index: which headings on G1 (`/gradins?mc=rated`) are cut by an ellipsis at 768, 1024, 1280 and
 * 1440 px, in French and Arabic (`heading.scrollWidth > heading.clientWidth`). The result of the run that was made is
 * `results/heading-truncation.txt`.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/heading-truncation.mjs
 */
import { ctxFor, go, launch } from "./lib.mjs";
const b = await launch();
for (const lang of ["fr", "ar"])
  for (const width of [768, 1024, 1280, 1440]) {
    const ctx = await ctxFor(b, { lang, width, height: 900, dpr: 1, reduced: true });
    const page = await ctx.newPage();
    await go(page, "/gradins?mc=rated", lang, { ready: false });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const out = [];
      for (const h of document.querySelectorAll("main h2, main h3")) {
        const cs = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        out.push({
          text: h.textContent.trim().slice(0, 24),
          w: Math.round(r.width),
          scrollW: h.scrollWidth,
          ellipsis: cs.textOverflow === "ellipsis",
          truncated: h.scrollWidth > h.clientWidth + 1,
        });
      }
      return out;
    });
    console.log(
      lang,
      width,
      JSON.stringify(r.filter((x) => x.truncated)),
      "of",
      r.length,
      "headings",
    );
    await ctx.close();
  }
await b.close();
