/**
 * Brief, "No user-visible « HOMA » or «حومة» anywhere": the rendered text (every text node, SVG
 * `<text>` included) and the words a screen reader gets (`aria-label`, `title`, `alt`) of every
 * Gradins and Fantasy screen that shows the card, in French and Arabic, searched for HOMA (any case,
 * as a word) and حومة; and the LASTREET found where the lowest tier is shown, set as a Latin run
 * isolated in Arabic. The internal key `homa` (a data attribute or a class) is not user-visible and is
 * not searched. The share picture's text runs are covered by `card-share-image.draw.test.ts`.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/words.mjs [--out=<file>]
 */
import { writeFileSync } from "node:fs";

import { ctxFor, go, launch, watch } from "./lib.mjs";

const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);
const ROUTES = [
  "/gradins?mc=homa",
  "/gradins?mc=rated",
  "/gradins?mc=forming1",
  "/gradins?mc=tierUp",
  "/gradins?mc=tierDown",
  "/gradins?mc=legend",
  "/gradins?mc=founder",
  "/gradins?mc=seasonClosed",
  "/gradins?mc=returning",
  "/gradins/carte?mc=homa",
  "/gradins/carte?mc=rated",
  "/gradins/carte?mc=tierDown",
  "/gradins/carte?mc=founder",
  "/gradins/les-votres?mc=homa",
  "/gradins/les-votres?mc=rated",
  "/gradins/saisons?mc=homa",
  "/gradins/saisons?mc=rated",
  "/fantasy?mc=homa",
  "/fantasy?mc=rated",
  "/fantasy/team?mc=homa",
  "/fantasy/rankings?mc=homa",
  "/fantasy/leagues/lg1?mc=homa",
  "/profile?mc=homa",
];

const browser = await launch();
const rows = [];
for (const lang of ["fr", "ar"]) {
  const ctx = await ctxFor(browser, {
    lang,
    theme: "light",
    width: 390,
    height: 844,
    dpr: 1,
    reduced: true,
  });
  await ctx.addInitScript(() => sessionStorage.removeItem("botolago.card.hero_session.v1"));
  const page = await ctx.newPage();
  const problems = watch(page);
  for (const path of ROUTES) {
    const row = { lang, path };
    try {
      await go(page, path, lang, { ready: false });
      await page.waitForTimeout(1600);
      Object.assign(
        row,
        await page.evaluate(() => {
          const text = document.body.textContent ?? "";
          const attrs = [...document.querySelectorAll("[aria-label],[title],img[alt]")].flatMap(
            (n) => ["aria-label", "title", "alt"].map((a) => n.getAttribute(a)).filter(Boolean),
          );
          const all = `${text}\n${attrs.join("\n")}`;
          return {
            homa: (all.match(/\bhoma\b/gi) ?? []).length + (all.match(/حومة/g) ?? []).length,
            lastreet: (all.match(/LASTREET/g) ?? []).length,
            textLength: text.length,
            attributes: attrs.length,
            bdiLastreet: [...document.querySelectorAll("bdi[dir=ltr]")].filter((b) =>
              /LASTREET/.test(b.textContent ?? ""),
            ).length,
            // LASTREET inside an Arabic sentence must be isolated: its nearest isolating ancestor is a bdi, a text run with direction=ltr, or the card's own text
            bareInArabic:
              document.documentElement.dir === "rtl"
                ? [...document.querySelectorAll("main *")]
                    .filter(
                      (n) =>
                        n.children.length === 0 &&
                        /LASTREET/.test(n.textContent ?? "") &&
                        !n.closest("bdi") &&
                        !(n.closest("svg") && getComputedStyle(n).direction === "ltr"),
                    )
                    .map((n) => n.tagName).length
                : 0,
          };
        }),
      );
    } catch (error) {
      row.error = String(error.message).slice(0, 160);
    }
    rows.push(row);
  }
  rows.push({ lang, path: "(console)", problems });
  await ctx.close();
}
await browser.close();

const screens = rows.filter((r) => r.path !== "(console)");
const withHoma = screens.filter((r) => r.homa > 0);
console.log(
  `${screens.length} screens (${ROUTES.length} routes x 2 languages): HOMA or حومة found on ${withHoma.length}; errors ${screens.filter((r) => r.error).length}`,
);
console.log(
  `LASTREET shown on ${screens.filter((r) => r.lastreet > 0).length} screens (${screens.filter((r) => r.lastreet > 0 && r.lang === "ar").length} of them in Arabic); isolated in a <bdi dir=ltr> on ${screens.filter((r) => r.bdiLastreet > 0).length}; bare LASTREET text nodes in Arabic outside a bdi or a ltr SVG run: ${screens.reduce((a, r) => a + (r.bareInArabic ?? 0), 0)}`,
);
for (const r of withHoma) console.log("HOMA", r.lang, r.path, r.homa);
for (const r of screens.filter((x) => x.error)) console.log("ERROR", r.lang, r.path, r.error);
for (const r of rows.filter((x) => x.path === "(console)"))
  console.log(
    `console/network problems (${r.lang}): ${r.problems.length}${r.problems.length ? ` ${r.problems.slice(0, 3).join(" | ")}` : ""}`,
  );
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, rows }, null, 1)}\n`);
