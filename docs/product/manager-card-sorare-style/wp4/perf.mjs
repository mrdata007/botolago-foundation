/**
 * Brief, "Performance recorded": `full()` <= 25 ms, `token()` <= 3 ms, G1 data to `data-mc-ready`
 * <= 400 ms at CPU x 4 (Chromium's `Emulation.setCPUThrottlingRate`). (The renderer chunk's size is
 * read from the production build by the final check run, and the tilt's frames and long tasks by
 * `motion.mjs`.)
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/perf.mjs [--only=render,g1] [--runs=5] [--out=<file>]
 *
 * render  the app's own renderer in a page: `full()` for nine cards and `token()` at eight sizes (two
 *         tiers each), batches of 10 calls (the timer's resolution is 0.1 ms) after 10 warm-up calls,
 *         median and 95th percentile of the batches' per-call time, at CPU x 1 and x 4
 * g1      /curva on the page, at CPU x 4: `cold` is a fresh context (empty cache: the renderer
 *         chunk and the card's fonts are fetched), `warm` is a second visit in the same context.
 *         Two stopwatches: `dataToReady` starts when the rating line first exists (the data is on
 *         screen) and ends at `data-mc-ready="1"` on a card, as WP6b measured it; `mountToReady`
 *         starts when the card's box first exists.
 *         A development server serves every module as its own file: these are upper bounds for the
 *         production build, which the Manager Card preview flag cannot be built into (it is
 *         development-only), so no production figure of G1 exists to take.
 */
import { writeFileSync } from "node:fs";

import { ctxFor, go, launch, median, round2 } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const ONLY = flag("only", "render,g1").split(",");
const RUNS = Number(flag("runs", "5"));
const OUT = flag("out", "");
const out = { render: [], g1: [] };
const browser = await launch();

/** Page side: time the renderer's calls. */
async function timings({ lang, calls }) {
  const [{ activeRenderer }, copy, i18n, scope, fixtures, toProfile] = await Promise.all([
    import("/src/components/manager-card/active-renderer.ts"),
    import("/src/components/manager-card/copy.ts"),
    import("/src/i18n/dictionaries.ts"),
    import("/src/components/manager-card/scope-ids.ts"),
    import("/src/backend/manager-card/fixtures.ts"),
    import("/src/components/manager-card/to-profile.ts"),
  ]);
  const renderer = await activeRenderer.load();
  const strings = copy.cardStrings((key) => i18n.dictionaries[lang][key], lang);
  const profile = (id) =>
    id === "guest" ? toProfile.guestProfile() : toProfile.fromMyCard(fixtures.fixtureById(id).card);
  // the timer's resolution is 0.1 ms, a `full()` is shorter: time batches of calls and divide
  const stat = (fn, batches = 20, per = 10) => {
    for (let i = 0; i < 10; i++) fn();
    const t = [];
    for (let i = 0; i < batches; i++) {
      const a = performance.now();
      for (let k = 0; k < per; k++) fn();
      t.push((performance.now() - a) / per);
    }
    t.sort((x, y) => x - y);
    return {
      median: t[Math.floor(t.length / 2)],
      p95: t[Math.floor(t.length * 0.95)],
      max: t[t.length - 1],
    };
  };
  const rows = [];
  for (const c of calls) {
    const p = profile(c.id);
    if (c.kind === "full") {
      rows.push({ ...c, ...stat(() => renderer.full(p, { strings, theme: "dark" })) });
      // the same plus what the page does with it: scoping the ids and parsing the markup
      rows.push({
        ...c,
        kind: "full+insert",
        ...stat(
          () => {
            const host = document.createElement("div");
            host.innerHTML = scope.scopeSvgIds(
              renderer.full(p, { strings, theme: "dark" }),
              scope.newIdScope(),
            );
          },
          10,
          5,
        ),
      });
    } else {
      rows.push({
        ...c,
        ...stat(() => renderer.token(p, { strings, theme: "dark", size: c.size })),
      });
    }
  }
  return rows;
}

if (ONLY.includes("render")) {
  const calls = [
    ...[
      "forming1",
      "homa",
      "tierDown",
      "rated",
      "tierUp",
      "legend",
      "longNameLatin",
      "arabicName",
      "founder",
    ].map((id) => ({ kind: "full", id })),
    ...[80, 64, 56, 48, 44, 32, 28, 24].flatMap((size) =>
      ["rated", "legend"].map((id) => ({ kind: "token", id, size })),
    ),
  ];
  for (const rate of [1, 4]) {
    const ctx = await ctxFor(browser, {
      lang: "fr",
      theme: "dark",
      width: 600,
      height: 900,
      dpr: 1,
      reduced: true,
    });
    const page = await ctx.newPage();
    await go(page, "/curva?mc=forming1", "fr");
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    for (const lang of ["fr", "ar"]) {
      const rows = await page.evaluate(timings, { lang, calls });
      for (const r of rows)
        out.render.push({
          cpu: rate,
          lang,
          ...Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k,
              typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v,
            ]),
          ),
        });
    }
    await ctx.close();
  }
}

if (ONLY.includes("g1")) {
  const OBS = () => {
    const m = (window.__mc = {});
    const look = () => {
      const now = performance.now();
      const line = document.querySelector('[data-testid="curva-rating-line"]');
      const card = document.querySelector(".mc-card, .mc-eclat");
      if (line && !m.data) m.data = now;
      if (card && !m.mount) m.mount = now;
      if (document.querySelector('[data-mc-ready="1"]') && !m.ready) {
        m.ready = now;
        // two frames later: the card is on screen (round 3: the first paint after `ready`)
        requestAnimationFrame(() => requestAnimationFrame(() => (m.painted = performance.now())));
      }
    };
    new MutationObserver(look).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-mc-ready"],
    });
  };
  for (const [path, signedIn, lang] of [
    ["/curva?mc=rated", true, "fr"],
    ["/curva?mc=rated", true, "ar"],
    ["/curva?mc=forming1", true, "fr"],
    ["/curva?mc=legend", true, "fr"],
    ["/curva", false, "fr"],
  ]) {
    const rows = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await ctxFor(browser, {
        lang,
        theme: "light",
        width: 390,
        height: 844,
        dpr: 2,
        reduced: true,
        signedIn,
      });
      await ctx.addInitScript(OBS);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const visit = async () => {
        await page.goto(`${process.env.BASE.replace(/\/$/, "")}${path}`, { waitUntil: "load" });
        await page.waitForFunction((l) => document.documentElement.dataset.lang === l, lang, {
          timeout: 60000,
        });
        await page.waitForSelector('[data-mc-ready="1"]', { timeout: 60000, state: "attached" });
        await page.waitForTimeout(400);
        return page.evaluate(() => ({ ...window.__mc }));
      };
      const cold = await visit();
      const warm = await visit();
      rows.push({
        coldDataToReady: Math.round((cold.ready ?? NaN) - (cold.data ?? cold.mount)),
        coldMountToReady: Math.round(cold.ready - cold.mount),
        warmDataToReady: Math.round((warm.ready ?? NaN) - (warm.data ?? warm.mount)),
        warmMountToReady: Math.round(warm.ready - warm.mount),
        coldReadyAbs: Math.round(cold.ready),
        warmReadyAbs: Math.round(warm.ready),
        coldPaintedAbs: Math.round(cold.painted),
        warmPaintedAbs: Math.round(warm.painted),
        dataSeen: cold.data != null,
      });
      await ctx.close();
    }
    out.g1.push({ path, lang, signedIn, cpu: 4, rows });
  }
}
await browser.close();

if (out.render.length) {
  console.log("RENDERER (per call, from batches of 10: median / p95 ms)");
  for (const rate of [1, 4]) {
    const rs = out.render.filter((r) => r.cpu === rate);
    const fulls = rs.filter((r) => r.kind === "full");
    const toks = rs.filter((r) => r.kind === "token");
    const ins = rs.filter((r) => r.kind === "full+insert");
    const w = (a) => a.reduce((m, r) => (r.median > m.median ? r : m));
    const f = w(fulls);
    const t = w(toks);
    const wp = (a) => a.reduce((m, r) => (r.p95 > m.p95 ? r : m));
    console.log(
      `  CPU x${rate}: full() worst median ${f.median} ms (${f.id} ${f.lang}), worst p95 ${wp(fulls).p95} ms; full()+insert worst median ${w(ins).median} ms; token() worst median ${t.median} ms (${t.id} ${t.size} px ${t.lang}), worst p95 ${wp(toks).p95} ms`,
    );
  }
}
if (out.g1.length) {
  console.log(
    "G1, CPU x4, development server (ms): cold = fresh context, warm = second visit; data = rating line present",
  );
  for (const g of out.g1) {
    const col = (k) => g.rows.map((r) => r[k]);
    console.log(
      `  ${g.path} ${g.lang}${g.signedIn ? "" : " (guest)"}: cold data->ready ${JSON.stringify(col("coldDataToReady"))} (median ${median(col("coldDataToReady"))}), warm ${JSON.stringify(col("warmDataToReady"))} (median ${median(col("warmDataToReady"))}); mount->ready cold median ${median(col("coldMountToReady"))}, warm median ${median(col("warmMountToReady"))}; navigation to ready: cold median ${median(col("coldReadyAbs"))}, warm ${median(col("warmReadyAbs"))}; to painted: cold ${median(col("coldPaintedAbs"))}, warm ${median(col("warmPaintedAbs"))}; rating line seen ${g.rows.every((r) => r.dataSeen)}`,
    );
  }
}
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, ...out }, null, 1)}\n`);
