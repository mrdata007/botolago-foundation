/**
 * Brief, "Arabic: layout mirrored (tab and rail at the right, capsule and the cut corner at the left,
 * text right-aligned, stats CAP first at the right); digits Western and LTR; LASTREET isolated and
 * set in the Latin face, computed letter-spacing 0 on every Arabic run", read from computed styles
 * and element rectangles in Chromium, French beside Arabic, on the card page of the development
 * server (the app's own stylesheet, so its `html[dir="rtl"] * { letter-spacing: normal }` is in play).
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/rtl.mjs [--out=<file>]
 *
 * x positions are fractions of the card's width, 0 at its left edge.
 */
import { writeFileSync } from "node:fs";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const OUT = process.argv
  .slice(2)
  .find((a) => a.startsWith("--out="))
  ?.slice(6);
const FIXTURES = [
  "rated",
  "founder",
  "legend",
  "homa",
  "forming1",
  "arabicName",
  "longNameLatin",
  "clubNull",
];

const browser = await launch();
const rows = [];

for (const width of [390, 1440])
  for (const fixture of FIXTURES) {
    const read = {};
    for (const lang of ["fr", "ar"]) {
      const ctx = await ctxFor(browser, {
        lang,
        theme: "light",
        width,
        height: 1100,
        dpr: 2,
        reduced: true,
      });
      const page = await ctx.newPage();
      await go(page, `/curva/carte?mc=${fixture}`, lang);
      await page.waitForTimeout(900);
      read[lang] = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="curva-stage"]');
        const card = stage.querySelector(".mc-eclat");
        const base = card.querySelector("svg.mc-l--base").getBoundingClientRect();
        const fx = (n) => {
          const r = n.getBoundingClientRect();
          return (r.left + r.width / 2 - base.left) / base.width;
        };
        const all = [...card.querySelectorAll("text")];
        const ARABIC = /[؀-ۿ]/;
        const spacing = all.map((t) => {
          const cs = getComputedStyle(t);
          const ls = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing);
          return {
            text: (t.textContent ?? "").trim().slice(0, 16),
            arabic: ARABIC.test(t.textContent ?? ""),
            ls: Number.isNaN(ls) ? 0 : ls,
            dir: cs.direction,
            family: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
            weight: cs.fontWeight,
            kind:
              t.dataset.meta ??
              (t.dataset.tier
                ? "tier"
                : t.dataset.name
                  ? "name"
                  : t.dataset.stat
                    ? "stat"
                    : t.dataset.label
                      ? "label"
                      : t.hasAttribute("data-ovrlabel")
                        ? "ovrlabel"
                        : t.closest('[data-mc="ovr"]')
                          ? "number"
                          : "other"),
          };
        });
        const stats = [...card.querySelectorAll("text[data-stat]")].map(fx);
        const labels = [...card.querySelectorAll("text[data-label]")].map((n) => ({
          x: fx(n),
          text: n.textContent.trim(),
        }));
        const initials = card.querySelector('text[data-meta="initials"]');
        const founder = card.querySelector('text[data-meta^="founder"]');
        const season = card.querySelector('text[data-meta="season"]');
        const tier = card.querySelector("text[data-tier]");
        const sample = card.querySelector('text[data-meta="sample"]');
        return {
          htmlDir: document.documentElement.dir,
          cardDir: card.getAttribute("dir"),
          cardW: Math.round(base.width),
          initialsX: initials ? fx(initials) : null,
          seasonX: season ? fx(season) : null,
          sampleX: sample ? fx(sample) : null,
          founderX: founder ? fx(founder) : null,
          statsX: stats,
          labelsX: labels,
          tierX: tier ? fx(tier) : null,
          tierText: tier?.textContent.trim() ?? null,
          tierDir: tier ? getComputedStyle(tier).direction : null,
          tierFamily: tier
            ? getComputedStyle(tier).fontFamily.split(",")[0].replace(/["']/g, "")
            : null,
          tierLs: tier ? getComputedStyle(tier).letterSpacing : null,
          texts: spacing,
          // the chrome's isolation of LASTREET (rating line, ladder): a bdi dir=ltr round the word
          bdi: [...document.querySelectorAll("bdi[dir=ltr]")].filter((b) =>
            /LASTREET/.test(b.textContent),
          ).length,
          plainLastreet: [...document.querySelectorAll("main *")].filter(
            (n) =>
              n.children.length === 0 &&
              /LASTREET/.test(n.textContent ?? "") &&
              !n.closest("bdi") &&
              !n.closest("svg") &&
              !n.closest("[aria-label]"),
          ).length,
        };
      });
      await ctx.close();
    }
    const fr = read.fr;
    const ar = read.ar;
    const mirrored = (a, b) => a == null || b == null || (a < 0.5 && b > 0.5);
    const checks = {
      htmlDir: ar.htmlDir === "rtl" && fr.htmlDir !== "rtl",
      cardDir: ar.cardDir === "rtl" && fr.cardDir === "ltr",
      tab: mirrored(fr.initialsX, ar.initialsX) && mirrored(fr.seasonX, ar.seasonX),
      sample: fr.sampleX == null || Math.abs(fr.sampleX + ar.sampleX - 1) < 0.02,
      founder:
        fr.founderX == null ||
        mirrored(fr.founderX, ar.founderX) ||
        mirrored(ar.founderX, fr.founderX),
      statsOrder:
        ar.statsX.length === 4 &&
        fr.statsX.length === 4 &&
        ar.statsX.every((x, i, a) => i === 0 || x < a[i - 1]) &&
        fr.statsX.every((x, i, a) => i === 0 || x > a[i - 1]),
      statsMirrorOfFr: ar.statsX.every((x, i) => Math.abs(x - (1 - fr.statsX[i])) < 0.02),
      arabicRunsNoSpacing: ar.texts.filter((t) => t.arabic).every((t) => t.ls === 0),
      latinTrackedInArabic: ar.texts
        .filter((t) => ["tier", "serial", "ovrlabel", "wordmark"].includes(t.kind) && !t.arabic)
        .every((t) => t.ls > 0 || (t.kind === "tier" && t.ls >= 0)),
      digitsWestern: ar.texts
        .filter((t) => ["stat", "number", "serial", "season"].includes(t.kind))
        .every((t) => !/[٠-٩۰-۹]/.test(t.text)),
      digitsLtr: ar.texts
        .filter((t) => ["stat", "number", "serial", "season"].includes(t.kind))
        .every((t) => t.dir === "ltr"),
      lastreetLatinLtr:
        ar.tierText !== "LASTREET" || (ar.tierDir === "ltr" && !/[؀-ۿ]/.test(ar.tierText)),
    };
    rows.push({
      width,
      fixture,
      checks,
      ok: Object.values(checks).every(Boolean),
      fr: {
        initialsX: round2(fr.initialsX),
        founderX: round2(fr.founderX),
        statsX: fr.statsX.map(round2),
        cardW: fr.cardW,
      },
      ar: {
        initialsX: round2(ar.initialsX),
        founderX: round2(ar.founderX),
        statsX: ar.statsX.map(round2),
        labels: ar.labelsX.map((l) => l.text),
        tier: ar.tierText,
        tierDir: ar.tierDir,
        tierFamily: ar.tierFamily,
        tierLs: ar.tierLs,
        bdiLastreet: ar.bdi,
        plainLastreet: ar.plainLastreet,
        cardW: ar.cardW,
        arabicRuns: ar.texts
          .filter((t) => t.arabic)
          .map((t) => `${t.kind}:${t.text}:${t.family}/${t.weight}/ls${t.ls}`),
      },
    });
  }
await browser.close();

const bad = rows.filter((r) => !r.ok);
console.log(
  `${rows.length} card pairs (French then Arabic, ${FIXTURES.length} fixtures x 390 and 1440): mirrored and typographic checks all hold on ${rows.length - bad.length}, fail on ${bad.length}`,
);
const names = Object.keys(rows[0].checks);
for (const n of names)
  console.log(`  ${n.padEnd(22)} ${rows.filter((r) => r.checks[n]).length} of ${rows.length}`);
const sample = rows.find((r) => r.fixture === "rated" && r.width === 390);
console.log(
  `rated at 390: initials x fr ${sample.fr.initialsX} / ar ${sample.ar.initialsX}; stats x fr ${sample.fr.statsX.join(" ")} / ar ${sample.ar.statsX.join(" ")}; Arabic labels ${sample.ar.labels.join(" ")}`,
);
const founder = rows.find((r) => r.fixture === "founder" && r.width === 390);
console.log(`founder at 390: capsule x fr ${founder.fr.founderX} / ar ${founder.ar.founderX}`);
const homa = rows.find((r) => r.fixture === "homa" && r.width === 390);
console.log(
  `homa at 390 (Arabic): tier word "${homa.ar.tier}", direction ${homa.ar.tierDir}, face ${homa.ar.tierFamily}, letter-spacing ${homa.ar.tierLs}; <bdi dir=ltr>LASTREET</bdi> in the chrome ${homa.ar.bdiLastreet}, bare LASTREET text nodes ${homa.ar.plainLastreet}`,
);
const arabicName = rows.find((r) => r.fixture === "arabicName" && r.width === 390);
console.log(`arabicName at 390 (Arabic runs): ${arabicName.ar.arabicRuns.join(" | ")}`);
for (const r of bad)
  console.log(
    "FAIL",
    r.width,
    r.fixture,
    JSON.stringify(Object.fromEntries(Object.entries(r.checks).filter(([, v]) => !v))),
  );
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, rows }, null, 1)}\n`);
