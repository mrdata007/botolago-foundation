// Measured acceptance checks for the onboarding screens (ONBOARDING_PLAN.md section 7, criteria
// 1 to 16). Loads onboarding.html for every direction, language and colour scheme, and measures
// each screen and variant with element rectangles, computed styles, text scans, getAnimations()
// and pixel contrast read from rasters (never from tokens). Writes review/onboarding/CHECKS.md.
//
//   PW_CORE=/path/to/node_modules/playwright-core/index.mjs CHROME=/path/to/chrome \
//   node design-lab/manager-cards-claude/tools/check-onboarding.mjs [--base=http://127.0.0.1:4350]
//     [--only=07-v2,01] [--ctx=fr/light,ar/dark] [--cells=S14-founder] [--jobs=4] [--skip-lint]
//     [--out=review/onboarding/CHECKS.md] [--json=<file>]
//
// Without --base the tool serves the lab itself on a free local port. Écharpe (07-v2) is measured
// in French and Arabic, light and dark; the other four directions in French light and Arabic dark.
// Run from the repository root (criterion 15 runs prettier, eslint and build.mjs there). --only,
// --ctx and --cells narrow a run for debugging; a narrowed run's CHECKS.md is not the full report.
//
// CONTRAST (criterion 4, and the "painted" test of criterion 5) is graded by the INK FOOTPRINT, for
// app text and card art alike. A screen is rasterised at device pixel ratio 2 as drawn, and again
// with text hidden: the element's colour goes transparent, SVG text loses its fill and stroke,
// inputs lose their value and placeholder, and transitions are off so nothing moves or fades. The
// pixels that differ between the two rasters are the ink of the glyphs; the same pixels in the
// second raster are the surface directly beneath them. The text colour is the mean of the
// full-coverage ink pixels (those whose difference is within 5% of the largest, at least six); the
// ground is each of those pixels in the bare raster; the grade is the WCAG ratio, the median over
// them. Texts whose padded boxes meet are hidden in different rasters (one raster as drawn plus
// one per group, usually two or three per screen), so a neighbouring text of another colour never
// lands in a box's footprint. The layers of one text (the same string drawn over itself) are hidden
// together. A text on the page with no ink at all (transparent, hidden, covered) fails, unless the
// same string is painted elsewhere in the screen: that is a copy under the object (a cast shadow),
// listed in CHECKS.md and not graded. Card art under 8px is measured and listed, not graded.
// This replaced a 2px ring round each text's line box. The ring samples the wrong ground for card
// art whose line box is taller than the surface it sits on (Touchline's white 84 on #0151FC is
// 5.86:1 and the ring read 2.5 to 2.9; Lucarne's navy bar text is 15.0:1 and read 3.3 to 4.2), and
// a neighbouring text inside the ring or the box skewed the colour of app text too (the muted
// oklch(0.45 0.02 258) = 78,86,97 read as 63,71,82 beside a dark name). The ink method reads that
// muted text as 78,86,97 and the app's placeholder, 4.42:1 by its tokens, as 4.39:1.
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const lab = resolve(here, "..");
const repo = resolve(lab, "../..");
const args = process.argv.slice(2);
const flag = (name) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const outFile = resolve(flag("out") || join(lab, "review/onboarding/CHECKS.md"));
const jobs = Number(flag("jobs") || 4);

const DIRECTIONS = [
  { id: "07-v2", name: "Écharpe v2", q: "c=07&v=v2", full: true },
  { id: "03-v2", name: "Porte-clés v2", q: "c=03&v=v2" },
  { id: "01", name: "Lucarne", q: "c=01" },
  { id: "05-v2", name: "Semelle v2", q: "c=05&v=v2" },
  { id: "t1-touchline", name: "Touchline", q: "c=t1-touchline" },
];
const only = (flag("only") || "").split(",").filter(Boolean);
const cellFilter = (flag("cells") || "").split(",").filter(Boolean); // e.g. --cells=S14-founder (debugging)
const directions = DIRECTIONS.filter((d) => !only.length || only.includes(d.id));
const ctxFilter = (flag("ctx") || "").split(",").filter(Boolean); // e.g. --ctx=fr/light
const contextsOf = (d) =>
  (d.full
    ? [
        ["fr", "light"],
        ["fr", "dark"],
        ["ar", "light"],
        ["ar", "dark"],
      ]
    : [
        ["fr", "light"],
        ["ar", "dark"],
      ]
  ).filter(([l, sc]) => !ctxFilter.length || ctxFilter.includes(`${l}/${sc}`));

/* ---------- a small static server, so the tool needs nothing else running ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
let server = null;
let base = flag("base");
if (!base) {
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    const file = join(lab, path === "/" || path === "\\" ? "index.html" : path);
    if (!file.startsWith(lab) || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (statSync(file).isDirectory()) {
      // onboarding.html reads a directory listing to find which screen files exist
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        readdirSync(file)
          .map((n) => `<a href="${n}">${n}</a>`)
          .join("\n"),
      );
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
}

/* ---------- the in-page library (serialised by Playwright, so it takes nothing from outside) ---------- */
function installChecks() {
  const MC = window.MC;
  const ONB = MC.ONB;
  const SKIP = "script,style,template,noscript,title,desc,defs,mask,clipPath,pattern,symbol,marker";
  const arRe = /[؀-ۿ]/;

  const effOpacity = (el, stop) => {
    let o = 1;
    for (let n = el; n && n !== stop.parentElement; n = n.parentElement)
      o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const shown = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility === "visible";
  };
  const hiddenByAncestor = (el, stop) => {
    for (let n = el; n && n !== stop.parentElement; n = n.parentElement)
      if (getComputedStyle(n).display === "none") return true;
    return false;
  };
  const clipsOf = (el, stop) => {
    const out = [];
    for (let n = el.parentElement; n && n !== stop.parentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const clip = (v) => v !== "visible";
      if (clip(cs.overflowX) || clip(cs.overflowY)) out.push(n.getBoundingClientRect());
    }
    return out;
  };
  const inter = (a, b) => {
    const l = Math.max(a.left, b.left);
    const r = Math.min(a.right, b.right);
    const t = Math.max(a.top, b.top);
    const bt = Math.min(a.bottom, b.bottom);
    return r > l && bt > t ? { left: l, right: r, top: t, bottom: bt } : null;
  };
  const textNodes = (root) => {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement;
      if (!p || p.closest(SKIP)) continue;
      // SVG masks and defs are not painted where they sit; punctuation alone is not copy to grade
      out.push(n);
    }
    return out;
  };
  const strip = (s) => s.replace(/[ً-ٰٟ‎‏⁦-⁩]/g, "");
  // The rendered text of a root and every accessible name or title in it, for the text scans.
  const allText = (root) => {
    const parts = textNodes(root).map((n) => n.nodeValue.replace(/\s+/g, " ").trim());
    root.querySelectorAll("[aria-label],[title],[alt],[placeholder]").forEach((e) => {
      for (const a of ["aria-label", "title", "alt", "placeholder"])
        if (e.getAttribute(a)) parts.push(e.getAttribute(a));
    });
    root.querySelectorAll("title,desc").forEach((e) => parts.push(e.textContent));
    return parts.join(" • ");
  };
  // A card that can turn (Lucarne) keeps its back face in the page with backface-visibility hidden:
  // what is on a face turned away is not on screen, and it must not block a hit test either.
  const markBack = (slot) => {
    if (!document.getElementById("chk-back")) {
      const st = document.createElement("style");
      st.id = "chk-back";
      st.textContent =
        ".onbp-slot [data-chk-back],.onbp-slot [data-chk-back] *{pointer-events:none!important}";
      document.head.appendChild(st);
    }
    slot.querySelectorAll("*").forEach((e) => {
      if (e.hasAttribute("data-chk-back")) return;
      const cs = getComputedStyle(e);
      if (cs.backfaceVisibility !== "hidden") return;
      const m = /^matrix3d\((.+)\)$/.exec(cs.transform);
      if (m && Number(m[1].split(",")[10]) < 0) e.setAttribute("data-chk-back", "");
    });
  };
  const slotOf = (shot) => document.querySelector(`.onbp-cell[data-shot="${shot}"] .onbp-slot`);
  // Every element that carries text to grade gets a number, so the node side can ask for exactly
  // those elements to be hidden in one raster (see inkOff).
  let unitSeq = 0;
  const unitOf = (el) => {
    if (!el.hasAttribute("data-chk-u")) el.setAttribute("data-chk-u", String(++unitSeq));
    return Number(el.getAttribute("data-chk-u"));
  };

  const cells = () =>
    [...document.querySelectorAll(".onbp-cell")].map((c) => {
      const shot = c.dataset.shot;
      const i = shot.indexOf("-");
      const id = shot.slice(0, i);
      const def = ONB.get(id);
      const variant = def.variants.find((v) => v.key === shot.slice(i + 1));
      const fx = ONB.FIX[variant.fixture];
      const p = { ...fx.profile, ...(variant.profile || {}) };
      const ctx = { ...fx.ctx, ...(variant.ctx || {}) };
      return {
        shot,
        id,
        variant: variant.key,
        fixture: variant.fixture,
        ovr: p.ovr,
        serial: p.serial,
        provisional: !!p.provisional,
        founder: p.founder,
        statsNull: Object.values(p.stats || {}).some((v) => v == null),
        names: [p.name && p.name.lat, p.name && p.name.ar].filter(Boolean),
        feature: ctx.feature !== false,
        desktop: !!def.desktop,
      };
    });

  /* Criteria 1 to 4, 6 to 11, 13 and 14 for one cell, from the DOM. Returns raw findings. */
  const collect = (shot, cfg) => {
    const cell = cells().find((c) => c.shot === shot);
    const slot = slotOf(shot);
    const root = slot.querySelector(".onb");
    const rootRect = root.getBoundingClientRect();
    const ar = cfg.lang === "ar";
    const res = { cell, shot };
    markBack(slot);
    const text = allText(slot);
    res.text = text;

    // 1: placeholders, missing directions
    res.missing = [...slot.querySelectorAll(".onb-missing")].map((e) => e.textContent.trim());
    res.unresolved = [...new Set(text.match(/\{[a-z_]+\}/gi) || [])];

    // 2: elements whose box leaves the frame, unless an ancestor clips them
    const escapes = [];
    let measured = 0;
    slot.querySelectorAll("*").forEach((e) => {
      if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") return;
      if (e.closest(".onbp-tag")) return;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      measured++;
      if (r.right <= rootRect.right + 1 && r.left >= rootRect.left - 1) return;
      const clipped = clipsOf(e, root).some(
        (c) => c.right <= rootRect.right + 1 && c.left >= rootRect.left - 1,
      );
      if (clipped) return;
      escapes.push(
        `${e.tagName.toLowerCase()}.${String(e.className && e.className.baseVal != null ? e.className.baseVal : e.className).split(" ")[0]} ${Math.round(r.left - rootRect.left)}..${Math.round(r.right - rootRect.left)} of ${Math.round(rootRect.width)}`,
      );
    });
    res.escapes = escapes.slice(0, 8);
    res.escapeCount = escapes.length;
    res.measured = measured;

    // 3: controls at least 44 x 44
    const controls = [];
    slot
      .querySelectorAll(
        'button,a[href],[role="button"],[role="link"],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])',
      )
      .forEach((e) => {
        if (e.closest("svg") || e.closest(".onbp-tag")) return;
        let r = e.getBoundingClientRect();
        if (!r.width && !r.height) return;
        if (!shown(e) || hiddenByAncestor(e, slot)) return;
        // a native checkbox or radio inside a label is operated through the label's box
        const wrap = /^(checkbox|radio)$/.test(e.type || "") && e.closest("label");
        if (wrap) r = wrap.getBoundingClientRect();
        controls.push({
          label: (e.getAttribute("aria-label") || e.textContent || e.className || e.tagName)
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 40),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        });
      });
    res.controls = controls;

    // 4: the text boxes to read the pixels of
    const slotRect = slot.getBoundingClientRect();
    const boxes = [];
    textNodes(slot).forEach((n) => {
      const el = n.parentElement;
      if (el.closest(".onbp-tag") || !shown(el) || hiddenByAncestor(el, slot)) return;
      if (el.closest("[data-chk-back]")) return;
      if (!/[\p{L}\p{N}\u2014]/u.test(n.nodeValue)) return;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
      if (!rects.length) return;
      let box = {
        left: Math.min(...rects.map((r) => r.left)),
        right: Math.max(...rects.map((r) => r.right)),
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      };
      const area = (b) => (b.right - b.left) * (b.bottom - b.top);
      for (const c of clipsOf(el, slot)) {
        const i = inter(box, c);
        if (!i) return;
        box = i;
      }
      const full = area({
        left: Math.min(...rects.map((r) => r.left)),
        right: Math.max(...rects.map((r) => r.right)),
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      });
      if (area(box) < full * 0.6 || area(box) < 6) return;
      const cx = (box.left + box.right) / 2;
      const cy = (box.top + box.bottom) / 2;
      const hit = document.elementFromPoint(cx, cy);
      const svg = el.closest("svg");
      const covered = !(
        hit &&
        (el.contains(hit) || hit.contains(el) || (svg && svg.contains(hit)))
      );
      if (covered) return;
      const cs = getComputedStyle(el);
      let px = parseFloat(cs.fontSize);
      if (svg && el.getScreenCTM) {
        const m = el.getScreenCTM();
        if (m) px *= Math.hypot(m.a, m.b);
      }
      const weight = Number(cs.fontWeight) || 400;
      boxes.push({
        x: box.left - slotRect.left,
        y: box.top - slotRect.top,
        w: box.right - box.left,
        h: box.bottom - box.top,
        text: n.nodeValue.replace(/\s+/g, " ").trim().slice(0, 36),
        px: Math.round(px * 10) / 10,
        weight,
        large: px >= 24 || (px >= 18.66 && weight >= 700),
        u: unitOf(el),
        card: !!el.closest("[data-onb-card]"),
        // the number a card shows (two or three digits, or the dash) is the display number
        display:
          !!el.closest("[data-onb-card]") && px >= 8 && /^(\d{2,3}|—)$/.test(n.nodeValue.trim()),
        op: Math.round(effOpacity(el, slot) * 100) / 100,
      });
    });
    // text fields: the value, or the placeholder, is not a text node, so it is read from its box
    slot
      .querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden])")
      .forEach((inp) => {
        if (!shown(inp) || hiddenByAncestor(inp, slot)) return;
        const txt = (inp.value || inp.getAttribute("placeholder") || "").trim();
        if (!txt) return;
        const cs = getComputedStyle(inp);
        const r = inp.getBoundingClientRect();
        const side = (n) => parseFloat(cs[`padding${n}`]) + parseFloat(cs[`border${n}Width`]);
        const c2d = document.createElement("canvas").getContext("2d");
        c2d.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const fs = parseFloat(cs.fontSize);
        const w = Math.min(c2d.measureText(txt).width, r.width - side("Left") - side("Right"));
        const rtl = cs.direction === "rtl";
        const x = rtl ? r.right - side("Right") - w : r.left + side("Left");
        boxes.push({
          x: x - slotRect.left,
          y: r.top + r.height / 2 - fs * 0.6 - slotRect.top,
          w,
          h: fs * 1.2,
          text: txt.slice(0, 36),
          px: fs,
          weight: Number(cs.fontWeight) || 400,
          large: false,
          u: unitOf(inp),
          card: false,
          display: false,
          op: 1,
          field: inp.value ? "field value" : "placeholder",
        });
      });
    res.boxes = boxes;

    // 6: a null number is a dash, never a 0, and is spoken as « pas encore de note »
    const cards = [...slot.querySelectorAll("[data-onb-card]")];
    res.zeroInCard = cards.filter((c) =>
      textNodes(c).some((n) => n.nodeValue.trim() === "0"),
    ).length;
    res.zeroText = textNodes(slot)
      .filter((n) => n.nodeValue.trim() === "0")
      .map((n) => n.parentElement.className.baseVal || n.parentElement.className || "text");
    const phrase = ar ? "لا تقييم بعد" : "pas encore de note";
    res.cards = cards.map((c) => {
      const named = [c, ...c.querySelectorAll("[aria-label]")].some((e) =>
        (e.getAttribute("aria-label") || "").includes(phrase),
      );
      const names = [c, ...c.querySelectorAll("[aria-label]")]
        .map((e) => e.getAttribute("aria-label") || "")
        .filter(Boolean)
        .slice(0, 2);
      return { kind: c.dataset.onbCard, named, label: names.join(" | ") };
    });
    res.dashCarrier = textNodes(slot).some((n) => n.nodeValue.trim() === "—");

    // 7: every surface that shows the number carries the provisional word
    const provWord = ar ? "مبدئي" : "Provisoire";
    const surfaces = [];
    if (cell.ovr != null && cell.provisional) {
      const surfaceSel =
        ".onb-surface,.onb-hero,.onb-panel,.onb-sheet,.onb-list,.onb-listrow,.m56-row,.app-rank-row,.m49-block,.m23-hub,.m12-block,.onb-card--share,section,li";
      const seen = new Set();
      textNodes(slot).forEach((n) => {
        if (n.nodeValue.trim() !== String(cell.ovr)) return;
        const el = n.parentElement;
        if (!shown(el) || hiddenByAncestor(el, slot)) return;
        let s = el.closest(surfaceSel) || root;
        // the share image is one surface: its own art plus the message under it
        const share = el.closest(".onb-card--share");
        if (share) s = share.closest(".onb-sheet,.onb-overlay") || share;
        if (seen.has(s)) return;
        seen.add(s);
        surfaces.push({
          surface: (s.className && s.className.baseVal != null
            ? s.className.baseVal
            : s.className || s.tagName
          )
            .toString()
            .split(" ")
            .slice(0, 2)
            .join("."),
          ok: strip(allText(s)).includes(strip(provWord)),
        });
      });
    }
    res.surfaces = surfaces;

    // 8: banned words, locks, question marks
    res.plain = strip(text).replace(/•/g, " ");
    const iconHits = [];
    // A lock on a password field is the app's form chrome; the ban is on the card and its blocks.
    slot.querySelectorAll("path").forEach((p) => {
      if (p.closest(".m1-box,label,input")) return;
      const d = p.getAttribute("d") || "";
      if (d.startsWith("M7 11V7a5 5 0 0 1 10 0v4")) iconHits.push("lock icon path");
      if (d.includes("M9.09 9a3 3 0 0 1 5.83 1")) iconHits.push("question-mark icon path");
    });
    slot.querySelectorAll("[class],[id],[data-icon],[aria-label],[title]").forEach((e) => {
      const toks = [
        ...String(
          (e.className && e.className.baseVal != null ? e.className.baseVal : e.className) || "",
        ).split(/\s+/),
        e.id || "",
        e.dataset.icon || "",
      ]
        .join(" ")
        .split(/[\s_]+/)
        .filter(Boolean);
      const bad = toks.find(
        (t) =>
          /^(lock|unlock|padlock|sealed|cadenas)$/i.test(t) || /-(lock|padlock|sealed)$/i.test(t),
      );
      if (bad) iconHits.push(`class/id "${bad}"`);
    });
    res.icons = [...new Set(iconHits)];
    res.questionInCard = cards.some((c) => /[?؟]/.test(allText(c)));

    // 9: serials
    res.serialLeadingZero = (text.match(/(?:BOT\s*#?\s*|#)0\d{4,}/g) || []).slice(0, 3);
    res.serialMentions = (text.match(/BOT\s*#?\s*\d+|\b\d{6}\b/g) || []).slice(0, 3);
    res.serialWords = ar ? /(^|[^؀-ۿ])رقم/.test(text) : /\bnum[ée]ro\b/i.test(text);

    // 10: headings
    res.headings = [...slot.querySelectorAll('h1,h2,h3,[role="heading"]')].map((h) => ({
      text: h.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
      hasName: cell.names.some((nm) =>
        arRe.test(nm)
          ? new RegExp(`(^|[^\\u0600-\\u06FF])${nm}([^\\u0600-\\u06FF]|$)`).test(h.textContent)
          : new RegExp(`(^|[^\\p{L}])${nm}([^\\p{L}]|$)`, "iu").test(h.textContent),
      ),
    }));

    // 11: Arabic
    res.roots = [...slot.querySelectorAll(".onb")].map((r) => r.getAttribute("dir"));
    const arabicNodes = textNodes(slot).filter((n) => arRe.test(n.nodeValue));
    res.letterSpacing = arabicNodes
      .map((n) => ({
        t: n.nodeValue.trim().slice(0, 24),
        ls: getComputedStyle(n.parentElement).letterSpacing,
      }))
      .filter((x) => x.ls !== "normal" && parseFloat(x.ls) !== 0);
    res.indicDigits = (text.match(/[٠-٩۰-۹]/g) || []).length;
    const blockOf = (el) => {
      let n = el;
      while (n && n !== slot) {
        const d = getComputedStyle(n).display;
        if (d !== "inline" && d !== "contents") return n;
        n = n.parentElement;
      }
      return slot;
    };
    const unisolated = [];
    if (ar) {
      textNodes(slot).forEach((n) => {
        const t = n.nodeValue;
        if (!/\d/.test(t) || arRe.test(t) === true) {
          // a digit run inside the same text node as Arabic letters is only fine between isolates
          if (/\d/.test(t) && arRe.test(t) && !/[⁦-⁨][^⁩]*\d[^⁩]*⁩/.test(t))
            unisolated.push(t.trim().slice(0, 40));
          return;
        }
        const el = n.parentElement;
        const iso = el.closest("bdi,[dir='ltr'],[dir='rtl']");
        const isolated =
          (iso && (iso.tagName === "BDI" || iso.getAttribute("dir") === "ltr")) ||
          ["isolate", "isolate-override", "embed"].includes(getComputedStyle(el).unicodeBidi) ||
          /[⁦-⁨]/.test(t) ||
          (el.closest("svg") &&
            (el.closest("[direction='ltr']") || getComputedStyle(el).direction === "ltr"));
        if (isolated) return;
        const block = blockOf(el);
        const rest = [...textNodes(block)]
          .filter((m) => m !== n)
          .map((m) => m.nodeValue)
          .join("");
        // a bare digit run sitting beside Arabic letters in one line is not isolated
        if (arRe.test(rest) && block !== slot && !el.closest("svg"))
          unisolated.push(t.trim().slice(0, 40));
      });
    }
    res.unisolated = unisolated.slice(0, 6);
    res.latinLabels = ar
      ? [
          ...new Set(
            strip(text).match(
              /(?<![A-Za-z])(CAP|SEL|TRF|CON|HOMA|STADE|PRO|CHAMPION|LEGEND)(?![A-Za-z])/g,
            ) || [],
          ),
        ]
      : [];
    res.names = ar
      ? textNodes(slot)
          .filter(
            (n) =>
              n.parentElement.closest("[data-onb-card]") && cell.names.includes(n.nodeValue.trim()),
          )
          .map((n) => {
            const cs = getComputedStyle(n.parentElement);
            return {
              t: n.nodeValue.trim(),
              weight: Number(cs.fontWeight),
              family: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
            };
          })
      : [];

    // 13: expanded heroes and panels
    res.heroes = slot.querySelectorAll("section.onb-hero").length;
    // 14: the founder mark
    res.founderMark = /·\s?26|·\s?٢٦|Fondateur|FOUNDER|عضو مؤسس/i.test(text);
    return res;
  };

  /* Criterion 12 for the current page: running animations, shown replay beat buttons. */
  const motionState = () => {
    const running = document
      .getAnimations()
      .filter((a) => a.playState === "running" || a.playState === "pending")
      .map((a) =>
        `${a.animationName || a.transitionProperty || "animation"} on ${a.effect && a.effect.target ? (a.effect.target.className && a.effect.target.className.baseVal != null ? a.effect.target.className.baseVal : a.effect.target.className || a.effect.target.tagName) : "?"}`.slice(
          0,
          80,
        ),
      );
    const beats = [...document.querySelectorAll("[data-m49-replay],[data-m12-replay]")].filter(
      (b) => b.getBoundingClientRect().width > 0,
    ).length;
    const revoir = [...document.querySelectorAll("button")].filter(
      (b) =>
        b.getBoundingClientRect().width > 0 && /^(revoir|إعادة العرض)$/i.test(b.textContent.trim()),
    ).length;
    return { running, beats, revoir };
  };

  /* Criterion 5: the cell's number carriers at t = 0, with the animations rewound and paused. */
  const rewind = () => {
    if (!document.getElementById("chk-hit")) {
      // Decorative layers set pointer-events: none; the hit test must see everything that paints.
      const st = document.createElement("style");
      st.id = "chk-hit";
      st.textContent = ".onbp-slot *{pointer-events:auto!important}";
      document.head.appendChild(st);
    }
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
  };
  // Run every animation to its end state (infinite ones are left alone).
  const settle = () =>
    document.getAnimations().forEach((a) => {
      try {
        a.finish();
      } catch {
        /* infinite */
      }
    });
  const carriers = (shot) => {
    const cell = cells().find((c) => c.shot === shot);
    const slot = slotOf(shot);
    const slotRect = slot.getBoundingClientRect();
    markBack(slot);
    const overlay = slot.querySelector(".onb-overlay");
    const out = [];
    const want = (node) => {
      const s = node.nodeValue.trim();
      if (cell.ovr != null && s === String(cell.ovr)) return "ovr";
      if (cell.serial && s.includes(cell.serial)) return "serial";
      if (cell.ovr == null && s === "—") {
        const el = node.parentElement;
        if (el.closest(".m12-ovr")) return "dash";
        // a card's own dash, not the stat dashes (those are 4px copy)
        if (el.closest("[data-onb-card='full'],[data-onb-card='row']")) {
          let px = parseFloat(getComputedStyle(el).fontSize);
          const m = el.closest("svg") && el.getScreenCTM && el.getScreenCTM();
          if (m) px *= Math.hypot(m.a, m.b);
          if (px >= 12) return "dash";
        }
      }
      return null;
    };
    textNodes(slot).forEach((n) => {
      const kind = want(n);
      const el = n.parentElement;
      if (!kind || hiddenByAncestor(el, slot) || el.closest("template,[data-chk-back]")) return;
      // the page under a sheet is dimmed by its scrim: not the surface in view
      if (overlay && !overlay.contains(el)) return;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((q) => q.width > 1 && q.height > 1);
      if (!rects.length) return;
      let r = {
        left: Math.min(...rects.map((q) => q.left)),
        right: Math.max(...rects.map((q) => q.right)),
        top: Math.min(...rects.map((q) => q.top)),
        bottom: Math.max(...rects.map((q) => q.bottom)),
      };
      const area = (b) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
      const full = area(r);
      for (const c of clipsOf(el, slot))
        r = inter(r, c) || { left: 0, right: 0, top: 0, bottom: 0 };
      if (area(r) < full * 0.6) return; // scrolled out of view
      const cs = getComputedStyle(el);
      let blur = false;
      let clipped = false;
      for (let a = el; a && a !== slot.parentElement; a = a.parentElement) {
        const c = getComputedStyle(a);
        if (/blur/.test(c.filter) || /blur/.test(c.backdropFilter || "")) blur = true;
        if (c.clipPath !== "none" || c.maskImage !== "none") clipped = true;
      }
      const w = r.right - r.left;
      const h = r.bottom - r.top;
      const pts = [0.5, 0.25, 0.75].flatMap((fx) =>
        [0.5, 0.3, 0.7].map((fy) => [r.left + w * fx, r.top + h * fy]),
      );
      const same = (t) =>
        t.tagName === el.tagName &&
        t.closest("svg") === el.closest("svg") &&
        t.textContent.trim() === n.nodeValue.trim();
      const hit = pts.some(([x, y]) => {
        const t = document.elementFromPoint(x, y);
        // the numeral may be drawn as stacked layers (fill, outline): another layer of it is not a cover
        return t && (el.contains(t) || t.contains(el) || same(t));
      });
      out.push({
        kind,
        text: n.nodeValue.trim().slice(0, 20),
        opacity: Math.round(effOpacity(el, slot) * 100) / 100,
        visibility: cs.visibility,
        display: cs.display,
        blur,
        clipped,
        hit,
        u: unitOf(el),
        box: { x: r.left - slotRect.left, y: r.top - slotRect.top, w, h },
      });
    });
    return out;
  };

  /* Ink-footprint contrast (the method is described at the top of the tool). `inkOff(shot, units)`
     hides the text of the numbered elements of one slot without moving anything (colour and text
     shadow go transparent, SVG text loses its fill and stroke, inputs lose their value and
     placeholder, transitions are off so nothing fades); `inkOn` puts everything back. The caller
     rasterises the slot before and after. */
  const INK_STYLE_ID = "chk-ink";
  const inkOff = (shot, units) => {
    const slot = slotOf(shot);
    const want = new Set(units);
    slot.querySelectorAll("[data-chk-u]").forEach((e) => {
      if (want.has(Number(e.getAttribute("data-chk-u")))) e.setAttribute("data-chk-ink", "");
    });
    const st = document.createElement("style");
    st.id = INK_STYLE_ID;
    st.textContent =
      ".onbp-slot *,.onbp-slot *::before,.onbp-slot *::after{transition:none!important}" +
      ".onbp-slot [data-chk-ink]{color:transparent!important}" +
      ".onbp-slot text[data-chk-ink],.onbp-slot tspan[data-chk-ink],.onbp-slot textPath[data-chk-ink]{fill:transparent!important;stroke:transparent!important}" +
      ".onbp-slot input[data-chk-ink]::placeholder{color:transparent!important}";
    document.head.appendChild(st);
  };
  const inkOn = () => {
    document.querySelectorAll("[data-chk-ink]").forEach((e) => e.removeAttribute("data-chk-ink"));
    void document.body.offsetHeight; // the colours return while transitions are still off
    const st = document.getElementById(INK_STYLE_ID);
    if (st) st.remove();
  };

  /* The ink method. `drawn` is the raster as drawn; `bare[g]` is the same raster with the text of
     group g hidden, and a box says which group hid it. For each text box the pixels that differ
     are the ink, and the same pixels in the bare raster are the ground under it. Returns, per
     box: ink (the pixel count; fewer than 3 means nothing was painted), fg (the mean colour of the
     full-coverage ink pixels), bg (the median colour of the ground under them) and ratio (fg
     against the ground, the median over those pixels). */
  const analyze = async (drawn, bare, boxes, dpr) => {
    const load = async (b64) => {
      const img = await createImageBitmap(
        await (await fetch("data:image/png;base64," + b64)).blob(),
      );
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return { ctx, w: img.width, h: img.height };
    };
    const A = await load(drawn);
    const Bs = [];
    for (const b64 of bare) Bs.push(await load(b64));
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const med = (arr) => {
      arr.sort((x, y) => x - y);
      return arr[arr.length >> 1];
    };
    return boxes.map((bx) => {
      const B = Bs[bx.g];
      const pad = Math.ceil(dpr); // one CSS pixel round the line box (diacritics, overshoot)
      const x0 = Math.max(0, Math.floor(bx.x * dpr) - pad);
      const y0 = Math.max(0, Math.floor(bx.y * dpr) - pad);
      const x1 = Math.min(A.w, Math.ceil((bx.x + bx.w) * dpr) + pad);
      const y1 = Math.min(A.h, Math.ceil((bx.y + bx.h) * dpr) + pad);
      if (!B || x1 - x0 < 2 || y1 - y0 < 2) return { ratio: null, tiny: true, ink: 0 };
      const da = A.ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const db = B.ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const ink = [];
      let max = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
        );
        if (d < 5) continue;
        ink.push([i, d]);
        if (d > max) max = d;
      }
      if (ink.length < 3) return { ratio: null, ink: ink.length };
      // full coverage: the pixels whose difference is within 5% of the largest (at least six)
      const core = ink
        .sort((p, q) => q[1] - p[1])
        .filter(([, d], n) => d >= max * 0.95 || n < 6)
        .map(([i]) => i);
      const fg = [0, 1, 2].map((k) => core.reduce((s, i) => s + da[i + k], 0) / core.length);
      const lf = lum(...fg);
      const per = core.map((i) => ratio(lf, lum(db[i], db[i + 1], db[i + 2])));
      return {
        ratio: Math.round(med(per) * 100) / 100,
        ink: ink.length,
        fg: fg.map(Math.round),
        bg: [0, 1, 2].map((k) => med(core.map((i) => db[i + k]))),
      };
    });
  };

  // the plural helper for 1, 2, 3, 5 and 11
  const plurals = () => [1, 2, 3, 5, 11].map((n) => ONB.roundsText(n, "ar"));

  window.__chk = {
    cells,
    collect,
    motionState,
    rewind,
    settle,
    carriers,
    inkOff,
    inkOn,
    analyze,
    plurals,
  };
}

/* ---------- running the measurements ---------- */
const pw = await import(process.env.PW_CORE || "playwright-core");
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
const results = []; // { c, dir, lang, scheme, cell, item, ok, detail }
const notes = [];
const micro = []; // card art text under 8px: measured, not graded
const rasterCounts = []; // bare rasters taken per screen by the ink method
const unpainted = []; // texts with no ink whose string is painted elsewhere in the screen: listed
const contextsSeen = [];
// Each job collects into its own sink, committed only when the job completes (a job that times
// out is run again from the start, so a retry never double-counts).
const add = (c, ctx, cell, item, ok, detail = "") =>
  ctx.sink.push({ c, dir: ctx.dir.id, lang: ctx.lang, scheme: ctx.scheme, cell, item, ok, detail });

const BANNED = [
  ["pull", /(?<![\p{L}])pull(?![\p{L}])/iu],
  ["pack", /(?<![\p{L}])packs?(?![\p{L}])/iu],
  ["level up", /level[ -]?up/i],
  ["monter de niveau", /monter de niveau/i],
  ["débloquer", /d[ée]bloqu/i],
  ["tirage", /tirage/i],
  ["chance", /(?<![\p{L}])chance/iu],
  ["révélation", /r[ée]v[ée]lation/i],
  ["officiel", /officiel/i],
  ["signature", /signature/i],
  ["confirmée", /confirm[ée]e?s?(?![\p{L}])/iu],
  ["jouées", /jou[ée]es?(?![\p{L}])/iu],
  ["رسمي", /رسمي/],
  ["توقيع", /توقيع/],
  ["مؤكد", /مؤكد/],
  ["مؤقت", /مؤقت/],
];
const GRID = (d, lang, scheme, extra = "") =>
  `${base}/onboarding.html?${d.q}&lang=${lang}&scheme=${scheme}${extra}`;

async function openGrid(ctxDef, { reduced, motion, dpr }) {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 900 },
    deviceScaleFactor: dpr,
    reducedMotion: reduced ? "reduce" : "no-preference",
    colorScheme: ctxDef.scheme,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    else if (m.type() === "warning" && m.text().startsWith("[onboarding]"))
      errors.push(`console.warn: ${m.text()}`);
  });
  await page.goto(GRID(ctxDef.dir, ctxDef.lang, ctxDef.scheme, motion ? "&motion=1" : ""), {
    waitUntil: "load",
  });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, {
    timeout: 30000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(installChecks);
  return { page, errors };
}

/* The slot rasterised for the ink method: once as drawn, and once more for each group of texts.
   A text's ink footprint is read where that text alone was hidden, so a text of another colour
   next to it (the line above, a label touching a number) cannot land in it. The layers of one
   text (the same string drawn again over itself: fill, outline, shadow) are hidden together, as
   one text; texts whose padded boxes meet go to different groups. */
function inkGroups(boxes) {
  const PAD = 1.5;
  const meet = (a, b) =>
    a.x - PAD < b.x + b.w &&
    b.x - PAD < a.x + a.w &&
    a.y - PAD < b.y + b.h &&
    b.y - PAD < a.y + a.h;
  const overlap = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0;
  };
  // layers of one text: the same string, boxes that overlap by more than half of the smaller
  const root = boxes.map((_, i) => i);
  const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  boxes.forEach((a, i) =>
    boxes.forEach((b, j) => {
      if (j > i && a.text === b.text && overlap(a, b) > 0.5) root[find(j)] = find(i);
    }),
  );
  const clusters = new Map();
  boxes.forEach((b, i) => {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(b);
  });
  const groups = [];
  for (const bs of clusters.values()) {
    let g = groups.find((o) => !o.boxes.some((x) => bs.some((b) => b.u !== x.u && meet(b, x))));
    if (!g) groups.push((g = { units: new Set(), boxes: [] }));
    bs.forEach((b) => g.units.add(b.u));
    g.boxes.push(...bs);
    bs.forEach((b) => (b.g = groups.indexOf(g)));
  }
  return groups.map((g) => ({ ...g, units: [...g.units] }));
}
async function rasters(page, shot, boxes) {
  const slot = page.locator(`.onbp-cell[data-shot="${shot}"] .onbp-slot`);
  const drawn = (await slot.screenshot({ type: "png" })).toString("base64");
  const bare = [];
  for (const g of inkGroups(boxes)) {
    await page.evaluate(([s, u]) => window.__chk.inkOff(s, u), [shot, g.units]);
    bare.push((await slot.screenshot({ type: "png" })).toString("base64"));
    await page.evaluate(() => window.__chk.inkOn());
  }
  return [drawn, bare];
}

async function staticPass(ctxDef) {
  const { page, errors } = await openGrid(ctxDef, { reduced: true, motion: false, dpr: 2 });
  const cfg = { lang: ctxDef.lang };
  const cells = (await page.evaluate(() => window.__chk.cells())).filter(
    (c) => c.id !== "S00" && (!cellFilter.length || cellFilter.includes(c.shot)),
  );
  const ctx = ctxDef;
  add(1, ctx, "(page)", "console", errors.length === 0, errors.slice(0, 3).join(" | "));
  ctx.seen.push(`${ctx.dir.id} ${ctx.lang}/${ctx.scheme}: ${cells.length} cells`);
  const ms = await page.evaluate(() => window.__chk.motionState());
  add(
    12,
    ctx,
    "(page)",
    "reduced motion, motion off: running animations",
    ms.running.length === 0,
    ms.running.slice(0, 3).join("; "),
  );
  if (ctxDef.lang === "ar") {
    const pl = await page.evaluate(() => window.__chk.plurals());
    const want = ["جولة واحدة", "جولتان", "3 جولات", "5 جولات", "11 جولة"];
    add(
      11,
      ctx,
      "(plurals)",
      "1, 2, 3, 5, 11",
      want.every((w, i) => pl[i] === w),
      pl.join(" / "),
    );
  }
  for (const cell of cells) {
    const shot = cell.shot;
    await page.evaluate((s) => {
      document.querySelector(`.onbp-cell[data-shot="${s}"]`).scrollIntoView({ block: "center" });
    }, shot);
    const r = await page.evaluate(([s, c]) => window.__chk.collect(s, c), [shot, cfg]);
    const [drawn, bare] = await rasters(page, shot, r.boxes);
    ctx.rsink.push(bare.length);
    const meas = await page.evaluate(
      ([a, b, boxes]) => window.__chk.analyze(a, b, boxes, window.devicePixelRatio),
      [drawn, bare, r.boxes],
    );
    // 1
    add(
      1,
      ctx,
      shot,
      "renders",
      !r.missing.length && !r.unresolved.length,
      [...r.missing, ...r.unresolved.map((u) => `unresolved ${u}`)].join("; "),
    );
    // 2
    add(
      2,
      ctx,
      shot,
      `${r.measured} elements inside the frame`,
      r.escapeCount === 0,
      r.escapes.join("; "),
    );
    // 3
    for (const k of r.controls)
      add(3, ctx, shot, `${k.label}`, k.w >= 43.9 && k.h >= 43.9, `${k.w} x ${k.h}`);
    // 4
    const painted = new Set(
      r.boxes.filter((_, i) => meas[i] && meas[i].ratio != null).map((b) => b.text),
    );
    r.boxes.forEach((b, i) => {
      const m = meas[i];
      if (!m || m.tiny) return;
      const need = b.large || b.display ? 3 : 4.5;
      const item = `${b.field ? b.field : b.card ? "card art" : "screen"} "${b.text}" ${b.px}px/${b.weight}${b.display ? " display number" : b.large ? " large" : ""}`;
      // Card art under 8px is texture, not copy: measured and listed, not graded.
      if (b.card && !b.display && b.px < 8) {
        if (m.ratio == null) return;
        ctx.msink.push({
          lang: ctx.lang,
          scheme: ctx.scheme,
          dir: ctx.dir.id,
          cell: shot,
          text: b.text,
          px: b.px,
          ratio: m.ratio,
        });
        return;
      }
      // No ink at all: the text is on the page and not on the raster. If the same string is painted
      // elsewhere in the screen this is a copy under the object (the cast shadow of a charm, a layer
      // under another): listed, not graded. If it is painted nowhere, it is not readable at any ratio.
      if (m.ratio == null) {
        if (b.op < 0.05) return;
        if (painted.has(b.text))
          ctx.nsink.push({
            dir: ctx.dir.id,
            lang: ctx.lang,
            scheme: ctx.scheme,
            cell: shot,
            text: b.text,
          });
        else
          add(
            4,
            ctx,
            shot,
            item,
            false,
            "no glyph pixels painted (transparent, hidden or covered)",
          );
        return;
      }
      add(
        4,
        ctx,
        shot,
        item,
        m.ratio >= need,
        `${m.ratio}:1 (needs ${need}) fg ${m.fg} on ${m.bg}`,
      );
    });
    // 6
    const nullFx = cell.ovr == null && cell.feature;
    add(6, ctx, shot, "no standalone 0 in any card", r.zeroInCard === 0, `${r.zeroInCard} cards`);
    if (nullFx && r.cards.length)
      for (const c of r.cards)
        add(6, ctx, shot, `${c.kind} card is spoken as no rating`, c.named, c.label);
    if (cell.statsNull || cell.ovr == null)
      add(
        6,
        ctx,
        shot,
        "no standalone 0 in the screen",
        r.zeroText.length === 0,
        r.zeroText.join(", "),
      );
    // 7
    for (const s of r.surfaces)
      add(7, ctx, shot, `surface ${s.surface}`, s.ok, s.ok ? "" : "no « Provisoire » / «مبدئي»");
    // 8
    const hit = BANNED.filter(([, re]) => re.test(r.plain)).map(([w]) => w);
    add(8, ctx, shot, "banned words", hit.length === 0, hit.join(", "));
    add(
      8,
      ctx,
      shot,
      "no lock, padlock, sealed or question-mark icon",
      !r.icons.length && !r.questionInCard,
      [...r.icons, r.questionInCard ? "question mark inside a card" : ""]
        .filter(Boolean)
        .join("; "),
    );
    // 9
    add(
      9,
      ctx,
      shot,
      "no serial with a leading zero",
      r.serialLeadingZero.length === 0,
      r.serialLeadingZero.join(", "),
    );
    if (cell.serial == null)
      add(
        9,
        ctx,
        shot,
        "no serial sentence while the serial is null",
        r.serialMentions.length === 0 && !r.serialWords,
        [...r.serialMentions, r.serialWords ? (ctx.lang === "ar" ? "« رقم »" : "« numéro »") : ""]
          .filter(Boolean)
          .join(", "),
      );
    // 10
    for (const h of r.headings)
      add(10, ctx, shot, `heading "${h.text}"`, !h.hasName, "contains the manager's name");
    // 11
    if (ctx.lang === "ar") {
      add(
        11,
        ctx,
        shot,
        'dir="rtl" on every .onb root',
        r.roots.length > 0 && r.roots.every((d) => d === "rtl"),
        r.roots.join(","),
      );
      add(
        11,
        ctx,
        shot,
        "letter-spacing 0 on Arabic text",
        r.letterSpacing.length === 0,
        r.letterSpacing
          .map((x) => `"${x.t}" ${x.ls}`)
          .slice(0, 3)
          .join("; "),
      );
      add(
        11,
        ctx,
        shot,
        "Western digits only",
        r.indicDigits === 0,
        `${r.indicDigits} Arabic-Indic digits`,
      );
      add(
        11,
        ctx,
        shot,
        "digit runs isolated (bdi, dir=ltr or U+2068)",
        r.unisolated.length === 0,
        r.unisolated.map((t) => `"${t}"`).join("; "),
      );
      add(
        11,
        ctx,
        shot,
        "kit labels, no Latin stat or tier words",
        r.latinLabels.length === 0,
        r.latinLabels.join(", "),
      );
      for (const n of r.names)
        add(
          11,
          ctx,
          shot,
          `name "${n.t}" in a card is Changa 800`,
          n.weight >= 800 && /changa/i.test(n.family),
          `${n.family} ${n.weight}`,
        );
    } else
      add(
        11,
        ctx,
        shot,
        'dir="ltr" on every .onb root (French)',
        r.roots.every((d) => d === "ltr"),
        r.roots.join(","),
      );
    // 13
    const heroScreens = new Set(["S05", "S08", "S13-tierUp", "S14", "S15-closed"]);
    const expected = heroScreens.has(cell.id) || heroScreens.has(shot);
    add(
      13,
      ctx,
      shot,
      expected ? "exactly one hero or panel" : "at most one hero or panel",
      expected ? r.heroes === 1 : r.heroes <= 1,
      `${r.heroes} found`,
    );
    // 14
    if (cell.fixture === "founder")
      add(14, ctx, shot, "founder mark present in the founder fixture", r.founderMark, "");
    else add(14, ctx, shot, "no ·26 and no founder part", !r.founderMark, "founder mark found");
    // 12 (static): beat buttons hidden under reduced motion
  }
  const ms2 = await page.evaluate(() => window.__chk.motionState());
  add(
    12,
    ctx,
    "(page)",
    "no « Revoir » beat button shown (reduced motion)",
    ms2.beats === 0 && ms2.revoir === 0,
    `${ms2.beats} beat buttons, ${ms2.revoir} « Revoir » buttons`,
  );
  await page.close();
}

async function motionPass(ctxDef) {
  const ctx = ctxDef;
  const { page, errors } = await openGrid(ctxDef, { reduced: false, motion: true, dpr: 2 });
  add(1, ctx, "(page, motion on)", "console", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.evaluate(() => window.__chk.rewind());
  const cells = (await page.evaluate(() => window.__chk.cells())).filter(
    (c) => c.id !== "S00" && (!cellFilter.length || cellFilter.includes(c.shot)),
  );
  for (const cell of cells) {
    if (cell.desktop) continue;
    await page.evaluate((s) => {
      document.querySelector(`.onbp-cell[data-shot="${s}"]`).scrollIntoView({ block: "center" });
    }, cell.shot);
    await page.evaluate(() => window.__chk.rewind());
    const found = await page.evaluate((s) => window.__chk.carriers(s), cell.shot);
    if (!found.length) continue;
    const boxes = found.map((f) => ({ ...f.box, u: f.u, text: f.text }));
    const [drawn, bare] = await rasters(page, cell.shot, boxes);
    const meas = await page.evaluate(
      ([a, b, boxes]) => window.__chk.analyze(a, b, boxes, window.devicePixelRatio),
      [drawn, bare, boxes],
    );
    // the same carriers once every animation has run to its end: an opacity that is the same at
    // both ends is the material's own (a moulded numeral), not a number held back
    await page.evaluate(() => window.__chk.settle());
    const final = await page.evaluate((s) => window.__chk.carriers(s), cell.shot);
    // a number may be drawn as stacked layers (fill, outline) or as two faces of the object at
    // the same place: it is held back only if no layer of it is shown
    const groups = new Map();
    found.forEach((f, i) => {
      const end = final.length === found.length ? final[i] : null;
      const staticOpacity = f.opacity < 0.99 && end && f.opacity >= end.opacity - 0.01;
      const okDom =
        (f.opacity >= 0.99 || staticOpacity) &&
        f.visibility === "visible" &&
        f.display !== "none" &&
        !f.blur &&
        !f.clipped &&
        // the hit test is for the rating itself; the serial line sits under the card's texture layer
        (f.hit || f.kind === "serial");
      const px = meas[i] && meas[i].ratio != null ? meas[i].ratio : null;
      // no ink at all is a number that is not on the raster; a box too small to read is not graded
      const noInk = !!meas[i] && !meas[i].tiny && px == null;
      const ok = okDom && !noInk && (px == null || px >= 1.5);
      const detail = `opacity ${f.opacity}${staticOpacity ? " (the material's own, same at the end)" : ""}, ${f.visibility}${f.blur ? ", blurred" : ""}${f.clipped ? ", clipped" : ""}${f.hit ? "" : f.kind === "serial" ? ", under the texture layer" : ", covered"}, ${noInk ? "no glyph pixels painted" : `painted contrast ${px}:1`}`;
      const near = [...groups.values()].find(
        (g) =>
          g.kind === f.kind &&
          g.text === f.text &&
          Math.abs(g.x - f.box.x) < 4 &&
          Math.abs(g.y - f.box.y) < 4,
      );
      if (!near)
        groups.set(groups.size, { kind: f.kind, text: f.text, ok, detail, x: f.box.x, y: f.box.y });
      else if (ok && !near.ok) Object.assign(near, { ok, detail });
    });
    for (const g of groups.values())
      add(5, ctx, cell.shot, `${g.kind} "${g.text}" at t = 0`, g.ok, g.detail);
  }
  await page.close();
}

async function reducedMotionPass(ctxDef) {
  const ctx = ctxDef;
  const { page } = await openGrid(ctxDef, { reduced: true, motion: true, dpr: 1 });
  const ms = await page.evaluate(() => window.__chk.motionState());
  add(
    12,
    ctx,
    "(page)",
    "reduced motion with motion=1: running animations",
    ms.running.length === 0,
    ms.running.slice(0, 3).join("; "),
  );
  add(
    12,
    ctx,
    "(page)",
    "reduced motion with motion=1: no « Revoir » beat button",
    ms.beats === 0 && ms.revoir === 0,
    `${ms.beats} beat buttons, ${ms.revoir} « Revoir » buttons`,
  );
  await page.close();
}

/* a pool of concurrent jobs */
const queue = [];
for (const d of directions)
  for (const [lang, scheme] of contextsOf(d)) {
    for (const pass of [staticPass, motionPass, reducedMotionPass])
      queue.push(async () => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const ctx = { dir: d, lang, scheme, sink: [], msink: [], nsink: [], rsink: [], seen: [] };
          try {
            await pass(ctx);
            results.push(...ctx.sink);
            micro.push(...ctx.msink);
            unpainted.push(...ctx.nsink);
            rasterCounts.push(...ctx.rsink);
            contextsSeen.push(...ctx.seen);
            return;
          } catch (e) {
            notes.push(
              `${pass.name} ${d.id} ${lang}/${scheme} attempt ${attempt}: ${e.message.split("\n")[0]}`,
            );
          }
        }
      });
  }
let nextJob = 0;
const t0 = Date.now();
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (nextJob < queue.length) {
      await queue[nextJob++]();
    }
  }),
);
await browser.close();
if (server) server.close();

/* ---------- 15: format, lint, build (from the repository root) ---------- */
const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { cwd: repo, encoding: "utf8", shell: false });
  return {
    ok: r.status === 0,
    full: `${r.stdout || ""}${r.stderr || ""}`.trim(),
    out: `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").slice(-6).join("\n"),
  };
};
const lint = [];
if (!args.includes("--skip-lint")) {
  lint.push([
    "npx prettier --check design-lab/manager-cards-claude",
    run("npx", ["prettier", "--check", "design-lab/manager-cards-claude"]),
  ]);
  lint.push([
    'npx prettier --check "design-lab/manager-cards-claude/**/*.{js,mjs}" (the scripts, as the repository lint checks them)',
    run("npx", ["prettier", "--check", "design-lab/manager-cards-claude/**/*.{js,mjs}"]),
  ]);
  lint.push([
    "npx eslint design-lab/manager-cards-claude",
    run("npx", ["eslint", "design-lab/manager-cards-claude"]),
  ]);
  lint.push([
    "node design-lab/manager-cards-claude/build.mjs",
    run("node", ["design-lab/manager-cards-claude/build.mjs"]),
  ]);
}

/* ---------- CHECKS.md ---------- */
// Who can fix a failure: the lab (this tool's owner), a direction module (src/concepts is final:
// reported, not edited), or the app's own token that the lab mirrors on purpose.
const ownerOf = (f) =>
  /^placeholder /.test(f.item)
    ? "app"
    : /card art/.test(f.item) || /عضو مؤسس/.test(f.detail)
      ? "direction"
      : "lab";
const CRITERIA = {
  1: [
    "No console error, no placeholder box, no unresolved {placeholder}",
    "A page load per direction and context; every console error, page error and `[onboarding]` warning is collected, and every screen is searched for `.onb-missing` boxes and `{name}` leftovers.",
  ],
  2: [
    "Nothing escapes the 390px frame",
    "Every element's `getBoundingClientRect` against its screen root; an element inside a clipping ancestor that stays in the frame does not count; SVG internals are skipped (the SVG's own box is measured).",
  ],
  3: [
    "Every button and link is at least 44 x 44",
    "`getBoundingClientRect` of every `button`, `a[href]`, `[role=button]`, input and tabbable element that is displayed.",
  ],
  4: [
    "Text contrast: 4.5:1, or 3:1 for large text (24px, or 18.66px bold)",
    "The ink footprint, for app text and card art alike. Each screen is rasterised at dpr 2 as drawn and again with its text hidden (colour transparent, SVG text without fill and stroke, inputs without value and placeholder, transitions off). The pixels that differ are the glyphs' ink and the same pixels in the bare raster are the surface directly beneath them; the text colour is the mean of the full-coverage ink pixels, the ground is those pixels in the bare raster, and the grade is the WCAG ratio, the median over them. Texts whose padded boxes meet are hidden in separate rasters, so a neighbouring text never counts as ink; the layers of one text are hidden together. A text with no ink at all fails, unless the same string is painted elsewhere in the screen (a copy under the object, such as a cast shadow: listed, not graded). Text under a scrim or off screen is skipped. Text drawn inside a direction's card art is listed as `card art`; under 8px it is texture, measured and listed, not graded.",
  ],
  5: [
    "The number is never held back (motion on, t = 0)",
    "`motion=1`, animations rewound to 0 and paused. For every OVR, serial and dash carrier: effective opacity 1, visible, no blur, no clip or mask, a hit test that lands on it, and glyphs painted in the raster: the ink footprint (criterion 4) must exist, at least 1.5:1 against the surface beneath it.",
  ],
  6: [
    "A null number is a dash, never 0, and is spoken as no rating",
    "No standalone `0` text in any card, or on any screen with a null number or stat; each card on a null-number screen has an `aria-label` with « pas encore de note » / «لا تقييم بعد».",
  ],
  7: [
    "« Provisoire » / «مبدئي» wherever a provisional number shows",
    "For every screen with a provisional fixture, each surface (block, row, sheet, share image) that prints the number must contain the word.",
  ],
  8: [
    "No banned word, no lock, padlock, sealed or question-mark icon",
    "Rendered text plus every accessible name and title, diacritics stripped, against the plan's section 5 list and the build brief's list; SVG paths and class names against the lock and help glyphs; question marks inside card art.",
  ],
  9: [
    "No serial with a leading zero; no serial sentence when the serial is null",
    "A search of the rendered text for `BOT #0…`; on serial-null fixtures, for any `BOT #`, six-digit number or the word « numéro » / «رقم».",
  ],
  10: [
    "No heading contains the manager's name",
    "`h1`–`h3` and `[role=heading]` against the fixture's name in both scripts (word match).",
  ],
  11: [
    "Arabic: rtl, letter-spacing 0, isolated Western digits, Changa 800 names, kit labels, plurals",
    "`dir` on every `.onb` root; computed letter-spacing of every Arabic text node; Arabic-Indic digits; digit runs beside Arabic letters must sit in `bdi`, `dir=ltr`, an isolate or U+2068; manager names inside card art must compute to Changa at weight 800; no Latin stat or tier words; the plural helper for 1, 2, 3, 5 and 11.",
  ],
  12: [
    "Reduced motion: no running animation, no « Revoir » beat button",
    "`prefers-reduced-motion: reduce`, with and without `motion=1`: `document.getAnimations()` filtered to running or pending, and the replay buttons' boxes.",
  ],
  13: [
    "Exactly one expanded hero or panel per screen",
    "`section.onb-hero` count per screen: one on the hero screens (S05, S08, S13 tierUp, S14, S15 closed), at most one everywhere; `coalesced` is one hero.",
  ],
  14: [
    "·26 and the founder part only in the founder fixture",
    "A search of rendered text and accessible names for `·26`, « Fondateur », FOUNDER, «عضو مؤسس».",
  ],
};

const fmt = (n) => n.toLocaleString("en-US");
const lines = [];
const P = (s = "") => lines.push(s);
const now = new Date().toISOString().slice(0, 10);
P("# Onboarding checks");
P();
P(
  `Generated by \`tools/check-onboarding.mjs\` on ${now}. Do not edit by hand: run the tool again.`,
);
P();
P(
  "Method: every screen and variant of `onboarding.html` for each direction, measured in a real Chromium (390px phone frames, desktop D1 at 1440): Écharpe v2 in French and Arabic, light and dark; Porte-clés v2, Lucarne, Semelle v2 and Touchline in French light and Arabic dark. Element rectangles, computed styles, text scans, `getAnimations()` and pixel contrast by the ink footprint (criterion 4: the text's own pixels against the surface beneath them, found by rasterising each screen with and without its text). Nothing here is asserted from tokens or hex values. S00 (the foundation's kit demo, not one of the plan's screens) is left out: 54 phone variants (S01 to S18) and the 2 desktop D1 variants, 56 in all.",
);
P();
P(`Contexts measured: ${contextsSeen.length} (${contextsSeen.sort().join("; ")}).`);
if (notes.length) {
  P();
  P(`**Tool notes:** ${notes.join("; ")}`);
}
P();
P("## Summary");
P();
P("| # | Criterion | Checked | Pass | Fail | of which lab / direction / app |");
P("|---|---|---:|---:|---:|---|");
const byC = (c) => results.filter((r) => r.c === c);
for (let c = 1; c <= 14; c++) {
  const rs = byC(c);
  const fail = rs.filter((r) => !r.ok).length;
  P(
    `| ${c} | ${CRITERIA[c][0]} | ${fmt(rs.length)} | ${fmt(rs.length - fail)} | ${fail ? `**${fmt(fail)}**` : "0"} | ${["lab", "direction", "app"].map((o) => rs.filter((r) => !r.ok && ownerOf(r) === o).length).join(" / ")} |`,
  );
}
const lintOk = lint.length ? lint.every(([, r]) => r.ok) : null;
P(
  `| 15 | Prettier, lint and the gallery build | ${lint.length} | ${lint.filter(([, r]) => r.ok).length} | ${lint.filter(([, r]) => !r.ok).length} | see section 15 |`,
);
P("| 16 | The judges' fixes hold (Appendix A) | reviewer | - | - | - |");
P();
P(
  "Failures are tagged **[lab]** (this tool's owner fixes them), **[direction]** (the card objects in `src/concepts/` are final: reported here, not edited) or **[app]** (the app's own token, mirrored on purpose and listed for the owner).",
);
P();

const dirName = (id) => (DIRECTIONS.find((d) => d.id === id) || { name: id }).name;
for (let c = 1; c <= 14; c++) {
  const rs = byC(c);
  P(`## ${c}. ${CRITERIA[c][0]}`);
  P();
  P(`*Method.* ${CRITERIA[c][1]}`);
  P();
  P("| Direction | Contexts | Checked | Pass | Fail |");
  P("|---|---|---:|---:|---:|");
  for (const d of directions) {
    const dr = rs.filter((r) => r.dir === d.id);
    const ctxs = [...new Set(dr.map((r) => `${r.lang} ${r.scheme}`))];
    const fail = dr.filter((r) => !r.ok).length;
    P(
      `| ${dirName(d.id)} (\`${d.id}\`) | ${ctxs.join(", ") || "-"} | ${fmt(dr.length)} | ${fmt(dr.length - fail)} | ${fail || 0} |`,
    );
  }
  P();
  const fails = rs.filter((r) => !r.ok);
  if (!fails.length) P("No failures.");
  else {
    P(`**Failures (${fmt(fails.length)}).** Identical items across contexts are merged.`);
    P();
    const groups = new Map();
    for (const f of fails) {
      const key = `${f.dir}|${f.cell}|${f.item}`;
      if (!groups.has(key)) groups.set(key, { f, ctx: [] });
      groups.get(key).ctx.push(`${f.lang}/${f.scheme}${f.detail ? ` ${f.detail}` : ""}`);
    }
    for (const { f, ctx } of groups.values())
      P(`- **[${ownerOf(f)}]** \`${f.dir}\` ${f.cell} · ${f.item} · ${ctx.join(" ; ")}`);
    if (fails.some((f) => ownerOf(f) === "app")) {
      const pairs = [
        ...new Set(
          fails
            .filter((f) => ownerOf(f) === "app")
            .map((f) => f.detail.replace(/^[\d.]+:1 \(needs [\d.]+\) /, "")),
        ),
      ];
      P();
      P(
        `The **[app]** items are the app's own colour for an input's placeholder (${pairs.join("; ")}), mirrored on purpose: the lab does not change it, and lists it for the owner.`,
      );
    }
  }
  P();
  if (c === 4) {
    if (rasterCounts.length)
      P(
        `*Rasters.* The ink method took ${fmt(rasterCounts.length)} screens, each as drawn plus one raster per group of texts hidden: ${(rasterCounts.reduce((a, b) => a + b, 0) / rasterCounts.length).toFixed(1)} per screen on average, at most ${Math.max(...rasterCounts)}.`,
      );
    P();
    P(
      "**Card art under 8px, measured and not graded.** The card objects print copy this small (the",
    );
    P(
      "stat codes, the « Exemple » stamp, the serial line) as texture at card sizes of 125 to 200px.",
    );
    P();
    P("| Direction | Texts | Under 3:1 | Under 4.5:1 | Lowest |");
    P("|---|---:|---:|---:|---:|");
    for (const d of directions) {
      const m = micro.filter((x) => x.dir === d.id);
      if (!m.length) continue;
      const low = Math.min(...m.map((x) => x.ratio));
      P(
        `| ${dirName(d.id)} | ${fmt(m.length)} | ${m.filter((x) => x.ratio < 3).length} | ${m.filter((x) => x.ratio < 4.5).length} | ${low}:1 |`,
      );
    }
    P();
    P(
      "**Copies with no ink, listed and not graded.** A text on the page whose footprint is empty,",
    );
    P(
      "while the same string is painted elsewhere in the screen: a layer or a cast-shadow copy under",
    );
    P("the object that the object covers. A string painted nowhere in its screen fails above.");
    P();
    if (!unpainted.length) P("None.");
    else {
      P("| Direction | Copies | Where (screen, text) |");
      P("|---|---:|---|");
      for (const d of directions) {
        const u = unpainted.filter((x) => x.dir === d.id);
        if (!u.length) continue;
        const where = [...new Set(u.map((x) => `${x.cell} "${x.text}"`))];
        P(
          `| ${dirName(d.id)} | ${fmt(u.length)} | ${where.slice(0, 6).join(", ")}${where.length > 6 ? `, and ${where.length - 6} more` : ""} |`,
        );
      }
    }
    P();
  }
}

P("## 15. Prettier, lint and the gallery build");
P();
if (!lint.length)
  P("Skipped (`--skip-lint`). Run the three commands below from the repository root.");
else {
  P("| Command | Result |");
  P("|---|---|");
  for (const [cmd, r] of lint) P(`| \`${cmd}\` | ${r.ok ? "pass" : "**fail**"} |`);
  for (const [cmd, r] of lint) {
    if (r.ok) continue;
    if (/^npx prettier --check design-lab/.test(cmd)) {
      const files = (r.full.match(/^\[warn\] (\S+)$/gm) || []).map((l) => l.slice(7));
      const final = (f) =>
        /\/src\/concepts\//.test(f) ||
        /\/(BACKEND_HANDOFF|CONTRACT|CRITIQUE|DIRECTIONS|ONBOARDING_PLAN|ONBOARDING|BRIEF)\.md$/.test(
          f,
        );
      P(
        `\nThe whole-folder check lists ${files.length} files. ${files.filter(final).length} are card directions (\`src/concepts/*\`) and plan documents that this pass may not edit; they were not Prettier-formatted before it either (the repository's lint, \`eslint .\`, only reads the scripts). Lab-owned and still unformatted: ${
          files
            .filter((f) => !final(f))
            .map((f) => `\`${f.replace(/^design-lab\/manager-cards-claude\//, "")}\``)
            .join(", ") || "none"
        }.`,
      );
      P(
        `\n<details><summary>Not formatted (${files.length})</summary>\n\n${files.map((f) => `- ${f}`).join("\n")}\n\n</details>`,
      );
    } else P(`\n\`${cmd}\` output:\n\n\`\`\`\n${r.out}\n\`\`\``);
  }
}
P();
P("## 16. The judges' fixes hold (ONBOARDING_PLAN.md Appendix A)");
P();
P("For the reviewer: tick each row against the captures in `review/onboarding/` (see `INDEX.md`).");
P();
const plan = readFileSync(join(lab, "ONBOARDING_PLAN.md"), "utf8");
const appendix = plan.slice(plan.indexOf("## Appendix A"), plan.indexOf("## Appendix B"));
const rows = appendix
  .split("\n")
  .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l) && !/^\|\s*Finding/.test(l))
  .map((l) =>
    l
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((s) => s.trim()),
  );
for (const [finding, concept, judge, handled] of rows)
  P(`- [ ] **${finding}** (${concept}, judge ${judge}) → ${handled}`);
P();
P(`Run time ${Math.round((Date.now() - t0) / 1000)}s.`);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join("\n") + "\n");
// the repository formats Markdown with Prettier: leave the report in that style (best effort)
spawnSync("npx", ["--no-install", "prettier", "--write", outFile], { cwd: repo });

if (flag("json")) writeFileSync(resolve(flag("json")), JSON.stringify(results));
const total = results.length;
const failed = results.filter((r) => !r.ok).length;
console.log(
  JSON.stringify({
    out: outFile,
    checked: total,
    failed,
    byCriterion: Object.fromEntries(
      Array.from({ length: 14 }, (_, i) => [
        i + 1,
        [byC(i + 1).length, byC(i + 1).filter((r) => !r.ok).length],
      ]),
    ),
    lint: lint.map(([c, r]) => [c, r.ok]),
    lintOk,
  }),
);
