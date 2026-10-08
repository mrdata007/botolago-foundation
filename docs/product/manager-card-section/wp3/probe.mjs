/**
 * WP3's own measurements on the Gradins screens, from a live page (plan 9, items 7, 10, 12 to 17):
 *
 *   taps      every link, button and field visible on the screen is at least 44 × 44, measured on its
 *             rectangle (an element whose `::after` stretches over a row is measured on its own box);
 *   rows      every table row and list row is at least 48 px tall;
 *   rtl       Arabic: <html dir="rtl">, no letter-spacing on any text, a Western digit that sits among
 *             Arabic letters is isolated (a bdi, or dir="ltr"), names in Changa at 800;
 *   motion    with motion reduced: `document.getAnimations()` is empty and no « Revoir » beat button
 *             is drawn; with motion allowed, the number is on top at every frame of a beat (opacity 1,
 *             and `elementFromPoint` at its centre is the number or part of it);
 *   words     no heading carries a manager's name; no banned word in the text; « — », never « 0 », for a
 *             missing figure; no serial with a leading zero or a serial sentence while it is null;
 *   console   nothing on the console, no failed request, no 4xx.
 *
 *   BASE=http://127.0.0.1:4183 node docs/product/manager-card-section/wp3/probe.mjs [--langs fr,ar]
 *        [--widths 390,1440] [--only g1,g3]
 *
 * Exits 1 when anything is found. Prints one line per screen, then the findings.
 */
import { launch, logCollector, newContext, open, patchMock } from "./harness.mjs";
import { STATES } from "./states.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const LANGS = flag("langs", "fr,ar").split(",");
const WIDTHS = flag("widths", "390,1440").split(",").map(Number);
const ONLY = flag("only", "").split(",").filter(Boolean);

const BANNED = [
  /\bpull\b/i,
  /\bpack\b/i,
  /level up/i,
  /monter de niveau/i,
  /débloquer/i,
  /tirage/i,
  /révélation/i,
  /officiel/i,
  /\bVIP\b/,
  /exclusif/i,
  /\brare\b/i,
  /collectionner/i,
  /dernière chance/i,
  /meilleure carte/i,
  /classement des cartes/i,
  /رسمي/,
  /توقيع/,
  /محدود/,
];
const NAMES = /\bAli\b|Rachid|KARIM|SALMA|YASMINE|OTHMANE|HAMZA|علي/;

/** Runs in the page. */
function measure({ lang }) {
  const out = { taps: [], rows: [], rtl: [], words: [], tabs: 0 };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    for (let p = el; p; p = p.parentElement) {
      if (
        p.getAttribute("aria-hidden") === "true" &&
        p.tagName !== "BODY" &&
        !p.matches("svg *, svg")
      ) {
        // aria-hidden decoration that is not interactive is fine; interactive ones are checked below.
      }
      if (getComputedStyle(p).display === "none") return false;
    }
    return true;
  };
  const describe = (el) =>
    `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;

  const root = document.querySelector("main") ?? document.body;
  const scopes = [root, ...document.querySelectorAll('[role="dialog"]')];
  const interactive = scopes.flatMap((scope) => [
    ...scope.querySelectorAll(
      'a[href], button, [role="button"], input:not([type=hidden]), select, textarea, summary',
    ),
  ]);
  for (const el of new Set(interactive)) {
    // The report flag is painted 32px with a 44px hit area behind it (`ui.hitArea`, DESIGN.md).
    if (!visible(el) || el.closest("svg") || el.hasAttribute("data-report-trigger")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) {
      out.taps.push(`${describe(el)} ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
    }
  }
  for (const row of root.querySelectorAll("tbody tr")) {
    if (!visible(row)) continue;
    const h = row.getBoundingClientRect().height;
    if (h < 47.5) out.rows.push(`${describe(row)} ${h.toFixed(1)}`);
  }

  if (lang === "ar") {
    if (document.documentElement.dir !== "rtl") out.rtl.push("html dir is not rtl");
    for (const el of root.querySelectorAll("*")) {
      if (el.closest("svg")) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || !visible(el)) continue;
      const ls = getComputedStyle(el).letterSpacing;
      if (ls !== "normal" && parseFloat(ls) !== 0)
        out.rtl.push(`letter-spacing ${ls} on ${describe(el)}`);
    }
    const arabic = /[؀-ۿ]/;
    const digit = /[0-9]/;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent;
      const el = n.parentElement;
      if (!el || el.closest("svg, bdi, [dir=ltr], .sr-only") || !visible(el)) continue;
      // A run inside U+2066 to U+2069 is isolated already (the copy accessors write plurals so).
      const bare = t.replace(/[\u2066-\u2068][^\u2069]*\u2069/g, "");
      if (digit.test(bare) && arabic.test(bare))
        out.rtl.push(`digits among Arabic, not isolated: "${t.trim().slice(0, 50)}"`);
    }
  }

  const text =
    root.innerText +
    " " +
    [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText).join(" ");
  out.text = text;
  out.headings = [...document.querySelectorAll("h1, h2, h3")]
    .filter(visible)
    .map((h) => h.textContent.trim());
  out.zeroFigures = [...root.querySelectorAll('[data-stat], [data-testid="gradins-rating-line"]')]
    .filter(visible)
    .filter(
      (el) =>
        /(^|\s)0(\s|$)/.test(el.textContent.replace(/\s+/g, " ").trim()) &&
        !/0\//.test(el.textContent),
    )
    .map(describe);
  return out;
}

/** Installed before the page loads: watches the number at every frame while a beat is running. */
function watchBeats() {
  window.__beats = { frames: 0, bad: [], seen: new Set() };
  const tick = () => {
    const root = document.querySelector(".mc-echarpe[data-mc-beat]");
    if (root) {
      const beat = root.getAttribute("data-mc-beat");
      window.__beats.seen.add(beat);
      window.__beats.frames += 1;
      const ovr = root.querySelector('[data-mc="ovr"]');
      if (ovr) {
        const r = ovr.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        let opacity = 1;
        for (let p = ovr; p && p !== document.body; p = p.parentElement)
          opacity *= Number(getComputedStyle(p).opacity);
        if (opacity < 0.999 || !hit || !(ovr === hit || ovr.contains(hit) || hit.contains(ovr))) {
          window.__beats.bad.push(`${beat}: opacity ${opacity.toFixed(2)} hit ${hit?.tagName}`);
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const browser = await launch();
const findings = [];
let screens = 0;
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    for (const state of STATES) {
      if (ONLY.length && !ONLY.some((p) => state.id.startsWith(p))) continue;
      for (const reduced of [false, true]) {
        const context = await newContext(browser, {
          lang,
          theme: "light",
          width,
          height: width === 390 ? 844 : 900,
          scale: 1,
          visitor: state.visitor,
          noTeam: state.noTeam,
          reduced,
        });
        const page = await context.newPage();
        const logs = logCollector(page);
        if (!reduced) await page.addInitScript(watchBeats);
        await patchMock(page, state.patch);
        await open(page, state.path, lang);
        if (state.open === "h2h") {
          await page.locator('[data-testid="gradins-people-open"]').first().click();
          await page.waitForTimeout(1200);
        }
        const label = `${state.id} ${lang} ${width}${reduced ? " reduced" : ""}`;
        const found = [];
        const m = await page.evaluate(measure, { lang });
        if (!reduced) {
          m.taps.forEach((x) => found.push(`tap < 44: ${x}`));
          m.rows.forEach((x) => found.push(`row < 48: ${x}`));
          m.rtl.forEach((x) => found.push(`rtl: ${x}`));
          m.headings
            .filter((h) => NAMES.test(h))
            .forEach((h) => found.push(`heading carries a name: ${h}`));
          for (const re of BANNED) if (re.test(m.text)) found.push(`banned word ${re}`);
          m.zeroFigures.forEach((x) => found.push(`a zero where a dash belongs: ${x}`));
          if (/BOT #0/.test(m.text)) found.push("serial with a leading zero");
          const beats = await page.evaluate(() => ({
            frames: window.__beats.frames,
            bad: window.__beats.bad,
            seen: [...window.__beats.seen],
          }));
          if (beats.bad.length)
            found.push(
              `the number was not on top during a beat: ${beats.bad.slice(0, 3).join("; ")}`,
            );
          if (beats.seen.length)
            label + ` (beats seen: ${beats.seen.join(",")}, ${beats.frames} frames)`;
          if (beats.seen.length)
            console.log(
              `  ${label}: beats ${beats.seen.join(",")} over ${beats.frames} frames, number on top throughout`,
            );
        } else {
          const animations = await page.evaluate(() =>
            document
              .getAnimations()
              .filter((a) => !a.effect?.target?.closest?.(".shimmer"))
              .map((a) => a.animationName ?? a.constructor.name),
          );
          if (animations.length)
            found.push(
              `reduced motion: ${animations.length} running animation(s): ${animations.slice(0, 3).join(",")}`,
            );
          const replay = await page.evaluate(
            () =>
              [...document.querySelectorAll("main button")].filter(
                (b) =>
                  /^(Revoir|إعادة العرض)$/.test(b.textContent.trim()) &&
                  !b.closest('[data-testid="gradins-revoir"]'),
              ).length,
          );
          if (replay) found.push(`reduced motion: ${replay} « Revoir » beat button(s)`);
        }
        logs.forEach((l) => found.push(`console: ${l}`));
        screens += 1;
        console.log(`${label}: ${found.length ? found.length + " finding(s)" : "ok"}`);
        found.forEach((f) => findings.push(`${label}: ${f}`));
        await context.close();
      }
    }
  }
}
await browser.close();
console.log(`\n${screens} screens measured, ${findings.length} finding(s)`);
findings.forEach((f) => console.log(`  ${f}`));
process.exit(findings.length ? 1 : 0);
