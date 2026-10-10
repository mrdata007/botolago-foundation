/**
 * Brief, motion and depth, measured in Chromium on a development server (mock modes, preview on):
 *
 *   reduced   with `prefers-reduced-motion: reduce` (asked for through the context AND
 *             `page.emulateMedia`, then read back through `matchMedia`, because the context option
 *             alone has been seen not to reach pages in this sandbox): after load,
 *             `document.getAnimations()` is empty on every Curva screen; a mouse over the card
 *             writes no light, gives no 3D transform and starts no animation.
 *   beats     every beat of the renderer, applied to the cards it applies to: the longest animation
 *             end (<= 600 ms), the animated parts holding no number / serial / text, and, with every
 *             animation paused at 0, 100, 300 and 599 ms, the number's opacity (itself times its
 *             ancestors') and what `elementFromPoint` returns at its centre.
 *   depth     the computed stack at rest, with a mouse over the card, and 600 ms after it leaves:
 *             transforms, `transform-style`, `will-change`, the rims, the light variables moving
 *             with the pointer, the contact shadow moving, nothing flattening the 3D ancestors.
 *   tilt      frame intervals and long tasks (> 50 ms) while a pointer sweeps the card for 3 s, at
 *             CPU x1 and CPU x4.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/motion.mjs \
 *     [--only=reduced,beats,depth,tilt] [--out=<file.json>]
 */
import { writeFileSync } from "node:fs";

import { ctxFor, go, launch, round2 } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const ONLY = flag("only", "reduced,beats,depth,tilt").split(",");
const OUT = flag("out", "");
const REDUCED_TILT = args.includes("--reduced"); // `--reduced` sweeps the card with reduced motion on: the pointer moves, the card must not
const SELECTOR = flag("selector", ".mc-eclat"); // `--selector=.mc-card` sweeps the incumbent card on a base tree
const result = { reduced: [], beats: [], depth: [], tilt: [] };

const browser = await launch();

/* ------------------------------------------------------------------ reduced motion */
if (ONLY.includes("reduced")) {
  const ROUTES = [
    ["/curva", { signedIn: false, label: "g1 guest" }],
    ["/curva?mc=forming1", {}],
    ["/curva?mc=rated", {}],
    ["/curva?mc=founder", {}],
    ["/curva?mc=legend", {}],
    ["/curva?mc=homa", {}],
    ["/curva?mc=seasonClosed", {}],
    ["/curva?mc=seasonStarted", {}],
    ["/curva?mc=born0Serial", {}],
    ["/curva?mc=tierUp", {}],
    ["/curva?mc=returning", {}],
    ["/curva?mc=launchArrival", {}],
    ["/curva/carte?mc=rated", {}],
    ["/curva/carte?mc=founder", {}],
    ["/curva/les-votres?mc=rated", {}],
    ["/curva/saisons?mc=rated", {}],
    ["/fantasy?mc=rated", {}],
    ["/fantasy/team?mc=born0", {}],
  ];
  for (const lang of ["fr", "ar"])
    for (const [path, opts] of ROUTES) {
      // the hero slot is part of the screen: do not pre-mark the session as having shown its hero
      const ctx = await ctxFor(browser, {
        lang,
        theme: "light",
        width: 390,
        height: 844,
        dpr: 1,
        reduced: true,
        signedIn: opts.signedIn ?? true,
      });
      // init scripts run in the order they were added: the seed set the flag, this removes it again
      await ctx.addInitScript(() => sessionStorage.removeItem("botolago.card.hero_session.v1"));
      const page = await ctx.newPage();
      const row = { lang, path: opts.label ?? path };
      try {
        await go(page, path, lang, { ready: false });
        await page.waitForTimeout(3500);
        const state = await page.evaluate(() => ({
          reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
          animations: document.getAnimations().map((a) => ({
            name: a.animationName ?? a.transitionProperty ?? a.constructor.name,
            on:
              a.effect?.target?.className?.baseVal ??
              a.effect?.target?.className ??
              a.effect?.target?.tagName,
            state: a.playState,
          })),
          running: document.getAnimations().filter((a) => a.playState === "running").length,
          cards: document.querySelectorAll(".mc-eclat").length,
        }));
        Object.assign(row, state, { animationCount: state.animations.length });
        // a mouse over the first card: no light written, no 3D, nothing starts
        const card = page.locator(".mc-eclat").first();
        if (await card.count()) {
          const box = await card.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
            await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 6 });
            await page.waitForTimeout(700);
            Object.assign(
              row,
              await card.evaluate((root) => ({
                lightWritten: root.style.getPropertyValue("--mc-ax") !== "",
                tilt: getComputedStyle(root.querySelector(".mc-eclat__tilt")).transform,
                layers3d: [...root.querySelectorAll(".mc-l:not(.mc-rim)")].filter(
                  (l) => getComputedStyle(l).transform !== "none",
                ).length,
                activeClass: /mc-eclat--(active|idle|settle)/.test(root.className),
                animationsAfter: document.getAnimations().length,
              })),
            );
          }
        }
      } catch (error) {
        row.error = String(error.message).slice(0, 160);
      }
      result.reduced.push(row);
      await ctx.close();
    }
}

/* ------------------------------------------------------------------ beats */
if (ONLY.includes("beats")) {
  const ctx = await ctxFor(browser, {
    lang: "fr",
    theme: "light",
    width: 600,
    height: 900,
    dpr: 1,
    reduced: false,
  });
  const page = await ctx.newPage();
  await go(page, "/curva/carte?mc=rated", "fr", { clock: false });
  await page.waitForTimeout(1500);
  const cases = [];
  const BEATS = ["make", "tick", "first", "tier", "legend", "founder", "castoff"];
  const FIXTURES = ["rated", "forming1", "legend", "tierUp", "founder"];
  for (const lang of ["fr", "ar"])
    for (const theme of ["light", "dark"])
      for (const beat of BEATS)
        for (const fixture of FIXTURES) cases.push({ lang, theme, beat, fixture });
  for (const c of cases) {
    const r = await page.evaluate(async ({ lang, theme, beat, fixture }) => {
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
      const profile = toProfile.fromMyCard(fixtures.fixtureById(fixture).card);
      document.getElementById("beat-root")?.remove();
      const root = document.createElement("div");
      root.id = "beat-root";
      root.dir = lang === "ar" ? "rtl" : "ltr";
      root.style.cssText =
        "position:fixed;top:10px;left:10px;width:296px;z-index:2147483000;background:#fff";
      root.innerHTML = `<div class="mc-card" style="width:296px"><div>${scope.scopeSvgIds(renderer.full(profile, { strings, theme, beat }), scope.newIdScope())}</div></div>`;
      document.body.append(root);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const card = root.querySelector(".mc-eclat");
      const applied =
        card.className.includes(`mc-eclat--beat-${beat}`) ||
        card.className.includes("mc-eclat--pulse");
      const declared = renderer.beatMs(beat);
      const anims = document
        .getAnimations()
        .filter((a) => root.contains(a.effect?.target) || a.effect?.target === root);
      const names = [...new Set(anims.map((a) => a.animationName))];
      const ends = anims.map((a) => a.effect.getComputedTiming().endTime);
      const longest = ends.length ? Math.max(...ends) : 0;
      // which parts animate: none may hold the number, a text or the serial
      const animatedHoldText = anims.filter((a) => {
        const t = a.effect?.target;
        return (
          t instanceof Element &&
          (t.matches('[data-mc="ovr"]') ||
            t.closest?.('[data-mc="ovr"]') ||
            t.querySelector?.('text, [data-mc="ovr"]'))
        );
      }).length;
      // freeze every animation at chosen times and read the number
      const num = card.querySelector('[data-mc="ovr"]');
      const samples = [];
      if (num) {
        for (const t of [0, 100, 300, 599]) {
          for (const a of anims) {
            a.pause();
            a.currentTime = t;
          }
          await new Promise((r) => requestAnimationFrame(r));
          let opacity = 1;
          for (let n = num; n && n !== document.body; n = n.parentElement)
            opacity *= Number(getComputedStyle(n).opacity);
          const rect = num.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          samples.push({ t, opacity, hit: !!hit && (hit === num || num.contains(hit)) });
        }
      }
      for (const a of anims) a.cancel();
      root.remove();
      return {
        applied,
        declared,
        animationCount: anims.length,
        names,
        longest: Math.round(longest * 10) / 10,
        animatedHoldText,
        samples,
      };
    }, c);
    result.beats.push({ ...c, ...r });
  }
  await ctx.close();
}

/* ------------------------------------------------------------------ depth */
if (ONLY.includes("depth")) {
  for (const [lang, fixture] of [
    ["fr", "rated"],
    ["ar", "rated"],
    ["fr", "legend"],
    ["fr", "tierUp"],
    ["fr", "homa"],
    ["fr", "forming1"],
    ["ar", "legend"],
  ]) {
    const ctx = await ctxFor(browser, {
      lang,
      theme: "dark",
      width: 1280,
      height: 900,
      dpr: 2,
      reduced: false,
    });
    const page = await ctx.newPage();
    await go(page, `/curva/carte?mc=${fixture}`, lang, { clock: false });
    await page.waitForTimeout(1800);
    const root = page.getByTestId("curva-stage").locator(".mc-eclat");
    const read = () =>
      root.evaluate((card) => {
        const cs = (n) => (n ? getComputedStyle(n) : null);
        const tilt = card.querySelector(".mc-eclat__tilt");
        const shadow = card.querySelector(".mc-eclat__shadow");
        const layers = [...card.querySelectorAll(".mc-l:not(.mc-rim)")];
        const z = (t) => {
          const m = /^matrix3d\((.*)\)$/.exec(t ?? "");
          return m ? Number(m[1].split(",")[14]) : null;
        };
        // what could flatten the 3D tree: filter, opacity, clip-path, overflow other than visible, on the tilt element's ancestors up to the card root
        const flatteners = [];
        for (let n = tilt; n && n !== card.parentElement; n = n.parentElement) {
          const s = getComputedStyle(n);
          const bad = [];
          if (s.filter !== "none") bad.push(`filter ${s.filter}`);
          if (s.opacity !== "1") bad.push(`opacity ${s.opacity}`);
          if (s.clipPath !== "none") bad.push(`clip-path ${s.clipPath}`);
          if (s.overflow !== "visible" && n !== card) bad.push(`overflow ${s.overflow}`);
          if (bad.length) flatteners.push(`${n.className}: ${bad.join(", ")}`);
        }
        const rims = [...card.querySelectorAll(".mc-rim")];
        const sh = shadow.getBoundingClientRect();
        return {
          layerCount: layers.length,
          layerNames: layers.map((l) => l.className.baseVal.replace("mc-l mc-l--", "")),
          rimCount: rims.length,
          foilOverlay: !!card.querySelector(".mc-eclat__foil"),
          tilt: cs(tilt).transform === "none" ? "none" : cs(tilt).transform.slice(0, 12),
          tiltStyle: cs(tilt).transformStyle,
          willChangeTilt: cs(tilt).willChange,
          willChangeLayers: [...new Set(layers.map((l) => cs(l).willChange))],
          layerTransforms3d: layers.filter((l) => cs(l).transform !== "none").length,
          layerZ: layers.map((l) => z(cs(l).transform)),
          rimFirst: rims[0] ? cs(rims[0]).transform.slice(0, 22) : null,
          ax: card.style.getPropertyValue("--mc-ax"),
          ay: card.style.getPropertyValue("--mc-ay"),
          cls: card.className.replace(/mc-eclat--(\w+) /g, "").slice(-40),
          shadowX: Math.round(sh.left * 10) / 10,
          shadowY: Math.round(sh.top * 10) / 10,
          flatteners,
        };
      });
    const row = { lang, fixture };
    row.rest = await read();
    const box = await root.boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3, { steps: 4 });
    await page.waitForTimeout(1200);
    row.overA = await read();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 6 });
    await page.waitForTimeout(1200);
    row.overB = await read();
    await page.mouse.move(2, 2, { steps: 3 });
    await page.waitForTimeout(600);
    row.after600 = await read();
    await page.waitForTimeout(3000);
    row.afterSettled = await read();
    row.animationsAfterSettled = await page.evaluate(() => document.getAnimations().length);
    result.depth.push(row);
    await ctx.close();
  }
}

/* ------------------------------------------------------------------ tilt frames and long tasks */
if (ONLY.includes("tilt")) {
  // `control` is the same pointer sweep over a page with no card (/matches): what this headless Chromium
  // (software rasteriser, no GPU) and the harness's mouse calls cost by themselves
  for (const [rate, fixture] of [
    [1, "control"],
    [1, "rated"],
    [1, "legend"],
    [4, "control"],
    [4, "rated"],
    [4, "legend"],
  ]) {
    const ctx = await ctxFor(browser, {
      lang: "fr",
      theme: "dark",
      width: 1280,
      height: 900,
      dpr: 2,
      reduced: REDUCED_TILT,
    });
    const page = await ctx.newPage();
    await go(page, fixture === "control" ? "/matches" : `/curva/carte?mc=${fixture}`, "fr", {
      clock: false,
      ready: fixture !== "control",
    });
    await page.waitForTimeout(1800);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.evaluate(() => {
      window.__lt = [];
      window.__fr = [];
      new PerformanceObserver((list) =>
        window.__lt.push(...list.getEntries().map((e) => Math.round(e.duration))),
      ).observe({ type: "longtask", buffered: false });
      let last = performance.now();
      const tick = (now) => {
        window.__fr.push(now - last);
        last = now;
        window.__raf = requestAnimationFrame(tick);
      };
      window.__raf = requestAnimationFrame(tick);
    });
    const box =
      fixture === "control"
        ? { x: 336, y: 174, width: 336, height: 544 }
        : await page.locator(SELECTOR).first().boundingBox();
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 3000) {
      const a = ((i++ % 60) / 60) * Math.PI * 2;
      await page.mouse.move(
        box.x + box.width * (0.5 + 0.4 * Math.cos(a)),
        box.y + box.height * (0.5 + 0.4 * Math.sin(a)),
      );
      await page.waitForTimeout(16);
    }
    const stats = await page.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      const f = window.__fr.slice(5);
      const sorted = [...f].sort((a, b) => a - b);
      return {
        frames: f.length,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        over20: f.filter((x) => x > 20).length,
        over33: f.filter((x) => x > 33).length,
        longTasks: window.__lt,
      };
    });
    result.tilt.push({
      cpu: rate,
      fixture,
      ...Object.fromEntries(
        Object.entries(stats).map(([k, v]) => [k, typeof v === "number" ? round2(v) : v]),
      ),
    });
    await ctx.close();
  }
}
await browser.close();

/* ------------------------------------------------------------------ report */
if (result.reduced.length) {
  const bad = result.reduced.filter(
    (r) =>
      r.error ||
      r.reduced !== true ||
      r.animationCount > 0 ||
      r.lightWritten ||
      (r.tilt && r.tilt !== "none") ||
      r.layers3d > 0 ||
      r.activeClass ||
      r.animationsAfter > 0,
  );
  console.log(
    `REDUCED MOTION: ${result.reduced.length} screens (${ONLY.length && "fr and ar"}), matchMedia read back true on ${result.reduced.filter((r) => r.reduced).length}; with animations after load: ${result.reduced.filter((r) => r.animationCount > 0).length}; light written / 3D / animation with a mouse over the card: ${result.reduced.filter((r) => r.lightWritten || r.layers3d > 0 || r.animationsAfter > 0).length}; cards seen ${result.reduced.reduce((a, r) => a + (r.cards ?? 0), 0)}; problems ${bad.length}`,
  );
  for (const r of bad) console.log("  PROBLEM", JSON.stringify(r).slice(0, 400));
}
if (result.beats.length) {
  const applied = result.beats.filter((r) => r.applied);
  const worst = Math.max(...applied.map((r) => r.longest));
  const num = applied.flatMap((r) => r.samples);
  console.log(
    `BEATS: ${result.beats.length} (beat x card) combinations tried, ${applied.length} apply; per beat longest animation end:`,
  );
  for (const beat of ["make", "tick", "first", "tier", "legend", "founder", "castoff"]) {
    const rs = applied.filter((r) => r.beat === beat);
    console.log(
      `  ${beat.padEnd(8)} applies on ${rs.length ? [...new Set(rs.map((r) => r.fixture))].join(",") : "-"}  declared ${[...new Set(rs.map((r) => r.declared))].join("/")} ms  measured longest ${rs.length ? Math.max(...rs.map((r) => r.longest)) : "-"} ms  animations ${rs.length ? Math.max(...rs.map((r) => r.animationCount)) : "-"}`,
    );
  }
  console.log(
    `  longest of all: ${worst} ms (cap 600); animations touching the number or a text: ${applied.reduce((a, r) => a + r.animatedHoldText, 0)}; number samples ${num.length}: min opacity ${Math.min(...num.map((s) => s.opacity))}, elementFromPoint returned the number ${num.filter((s) => s.hit).length} of ${num.length}`,
  );
}
if (result.depth.length) {
  console.log("DEPTH (computed styles)");
  for (const r of result.depth)
    console.log(
      `  ${r.lang} ${r.fixture}: layers ${r.rest.layerCount} (${r.rest.layerNames.join("+")}) + foil overlay ${r.rest.foilOverlay} + rims ${r.rest.rimCount}; rest tilt ${r.rest.tilt}, 3D layers ${r.rest.layerTransforms3d}, rim ${r.rest.rimFirst}, will-change ${r.rest.willChangeTilt}/${r.rest.willChangeLayers.join(",")}; over: ${r.overA.tilt} ${r.overA.tiltStyle}, layer z ${JSON.stringify(r.overA.layerZ)}, ax ${r.overA.ax} -> ${r.overB.ax}, shadow ${r.overA.shadowX},${r.overA.shadowY} -> ${r.overB.shadowX},${r.overB.shadowY}, will-change ${r.overA.willChangeTilt}; 600 ms after: ${r.after600.tilt}, 3D layers ${r.after600.layerTransforms3d}; settled ${r.afterSettled.tilt}, animations ${r.animationsAfterSettled}; flatteners ${r.rest.flatteners.length + r.overA.flatteners.length}`,
    );
}
if (result.tilt.length) {
  console.log("TILT while a pointer circles the card for 3 s");
  for (const r of result.tilt)
    console.log(
      `  CPU x${r.cpu} ${r.fixture}: ${r.frames} frames, median ${r.medianMs} ms, p95 ${r.p95Ms} ms, > 20 ms: ${r.over20}, > 33 ms: ${r.over33}, long tasks (> 50 ms): ${r.longTasks.length} ${JSON.stringify(r.longTasks)}`,
    );
}
if (OUT) writeFileSync(OUT, `${JSON.stringify({ base: process.env.BASE, ...result }, null, 1)}\n`);
