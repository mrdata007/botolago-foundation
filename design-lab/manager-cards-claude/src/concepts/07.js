/* 07 ÉCHARPE — the card is your supporter's scarf, knotted over the steel crowd-barrier rail.
   Read from the rail down: the 84 knitted in your club's colours; the tier word; the season,
   one band per gameweek actually played (one yarn, told apart by stitch texture, so the
   scarf grows longer as the season goes on); a woven label sewn on the front with the four
   ratings and the ID; the knitted name; the founder's cream cable cast-on with 2026; the
   fringe, whose tassel count is the tier. LEGEND lifts the scarf off the rail: held taut
   overhead between two fists, the card turns landscape.
   Motifs are rasterised once onto stitch grids (Changa 800 for every knitted glyph) and drawn
   as merged colour runs under one stitch-texture pattern per gauge. */
(function () {
  const MC = window.MC;
  const PFX = "c07";

  // Faces sampled onto stitch grids by canvas. Asking for them here makes
  // document.fonts.ready wait for them before the lab renders.
  try {
    if (document.fonts && document.fonts.load) {
      ['800 64px "Changa"', '700 64px "Changa"', '800 64px "Manrope"', '700 64px "Manrope"', '700 64px "Noto Sans Arabic"'].forEach((f) =>
        document.fonts.load(f, "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ علي على محترف حومة ملعب بطل أسطورة المغرب").catch(() => {}),
      );
    }
  } catch (e) {
    /* rasterising falls back to whatever face is ready */
  }

  /* ---------- yarns and materials (one meaning each) ---------- */
  const CREAM = "#F2EEE4"; // selvedge, founder cast-on
  const BLUE = "#0151FC"; // the one fixed brand place: the end-edge selvedge
  const WOOL = "#E8E1D0"; // undyed wool: the ground when no club is chosen
  const CHAR = "#2B2B2B"; // charcoal: the letters on undyed wool
  const SATIN = "#FAF8F2"; // woven label
  const SATIN_EDGE = "#C9C2B0";
  const LABEL_INK = "#2B2B2B";
  const LABEL_SOFT = "#5C564C"; // 6.6:1 on the satin
  const SKIN = "#b98463"; // the shared avatar's skin
  const SKIN_DK = "#8d5f45";
  const SKIN_LT = "#d2a17f";
  const SLEEVE = "#2f343c"; // the bench jacket, in graphite (the shared avatar's figure, recoloured)
  const SLEEVE_LT = "#4f5763";
  const PLAYED = 7; // sample season: J.01–J.07, labelled Exemple on the label

  /* ---------- geometry (viewBox units) ---------- */
  const VW = 240;
  const X0 = 24;
  const X1 = 216;
  const FW = X1 - X0; // 192
  const RAIL_Y = 8; // the steel tube y8–20
  const RAIL_H = 12;
  const FT = 3; // fabric top: the fold over the rail
  const CAST = { cw: 6, ch: 7, rows: 5 }; // the founder cast-on keeps one gauge at every tier
  const LABEL_W = 108;
  const TASSELS = { HOMA: 2, STADE: 3, PRO: 4, CHAMPION: 5, LEGEND: 3 }; // LEGEND: three at each end

  /* gauge: the tier ladder is the knit itself */
  const GAUGE = {
    HOMA: { cw: 8, ch: 8, kind: "g", gap: 0.5, leg: 0.3 }, // hand-knitted chunky garter
    STADE: { cw: 6, ch: 6, kind: "v", gap: 0.24, leg: 0.16 }, // machine jacquard: flat stitches
    PRO: { cw: 6, ch: 6, kind: "v", gap: 0.42, leg: 0.26 }, // double-face jacquard: plump stitches
    CHAMPION: { cw: 4, ch: 5, kind: "v", gap: 0.4, leg: 0.24 }, // finest gauge
  };
  const LG = { cw: 9, ch: 9, kind: "v", gap: 0.46, leg: 0.3 }; // LEGEND: the heaviest gauge

  /* ---------- bitmap type (hand-knitted and cast-on glyphs) ---------- */
  const F35 = {
    0: ["###", "#.#", "#.#", "#.#", "###"],
    1: [".#.", "##.", ".#.", ".#.", "###"],
    2: ["###", "..#", "###", "#..", "###"],
    3: ["###", "..#", ".##", "..#", "###"],
    4: ["#.#", "#.#", "###", "..#", "..#"],
    5: ["###", "#..", "###", "..#", "###"],
    6: ["###", "#..", "###", "#.#", "###"],
    7: ["###", "..#", "..#", ".#.", ".#."],
    8: ["###", "#.#", "###", "#.#", "###"],
    9: ["###", "#.#", "###", "..#", "###"],
    " ": ["..", "..", "..", "..", ".."],
  };
  // HOMA's hand-knitted figures: a bold 5×7 chart with two-pixel stems. Each pixel is two rows
  // high; the columns are 1-2-2-2-1 stitches wide, so a stem is three stitches (the ink weight of
  // STADE's sampled figures) and a counter two.
  const F57B = {
    0: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    1: ["..##.", ".###.", "..##.", "..##.", "..##.", "..##.", ".####"],
    2: [".###.", "##.##", "...##", "..##.", ".##..", "##...", "#####"],
    3: ["####.", "...##", "...##", ".###.", "...##", "...##", "####."],
    4: ["##.##", "##.##", "##.##", "#####", "...##", "...##", "...##"],
    5: ["#####", "##...", "####.", "...##", "...##", "##.##", ".###."],
    6: [".###.", "##...", "##...", "####.", "##.##", "##.##", ".###."],
    7: ["#####", "...##", "...##", "..##.", "..##.", ".##..", ".##.."],
    8: [".###.", "##.##", "##.##", ".###.", "##.##", "##.##", ".###."],
    9: [".###.", "##.##", "##.##", ".####", "...##", "...##", ".###."],
  };
  const F57B_COLS = [1, 2, 2, 2, 1];
  // hand-charted tier words on 5 rows, variable width (an M needs five stitches to be an M)
  const F5H = {
    H: ["#..#", "#..#", "####", "#..#", "#..#"],
    O: [".##.", "#..#", "#..#", "#..#", ".##."],
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    A: [".##.", "#..#", "####", "#..#", "#..#"],
    C: [".##", "#..", "#..", "#..", ".##"],
    P: ["###.", "#..#", "###.", "#...", "#..."],
    R: ["###.", "#..#", "###.", "#.#.", "#..#"],
    I: ["###", ".#.", ".#.", ".#.", "###"],
    N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
    L: ["#..", "#..", "#..", "#..", "###"],
    E: ["###", "#..", "##.", "#..", "###"],
    G: [".##", "#..", "#.#", "#.#", ".##"],
    D: ["##.", "#.#", "#.#", "#.#", "##."],
    " ": ["..", "..", "..", "..", ".."],
  };
  // PRO's tier word: a bold 7-row chart with two-stitch stems. The R has a square shoulder and a
  // kicked leg, so it can never be read as an A.
  const F7B = {
    P: ["####.", "##.##", "##.##", "####.", "##...", "##...", "##..."],
    R: ["####.", "##.##", "##.##", "####.", "##.#.", "##.##", "##.##"],
    O: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
  };

  /* ---------- small utilities ---------- */
  const esc = MC.esc;
  const f2 = (n) => Math.round(n * 100) / 100;
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function hex(c) {
    const h = c.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  function mix(a, b, t) {
    const A = hex(a);
    const B = hex(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function lum(c) {
    const [r, g, b] = hex(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  /** Joins glyphs into one bitmap (rows of '#'/'.'). */
  function word(str, font, gap = 1) {
    const glyphs = [...String(str)].map((ch) => font[ch] || font[ch.toUpperCase()] || font[" "]);
    const h = glyphs[0].length;
    const rows = [];
    for (let r = 0; r < h; r++) rows.push(glyphs.map((g) => g[r]).join(".".repeat(gap)));
    return rows;
  }
  const bw = (bmp) => (bmp.length ? bmp[0].length : 0);
  /** Scales a bitmap: each pixel becomes sx stitches by sy rows. */
  function scaleBmp(bmp, sx, sy) {
    const out = [];
    for (const row of bmp) {
      const line = [...row].map((ch) => ch.repeat(sx)).join("");
      for (let i = 0; i < sy; i++) out.push(line);
    }
    return out;
  }
  /** Scales a bitmap with a width (in stitches) per source column and sy rows per source row. */
  function scaleCols(bmp, widths, sy) {
    const out = [];
    for (const row of bmp) {
      const line = [...row].map((ch, i) => ch.repeat(widths[i % widths.length])).join("");
      for (let i = 0; i < sy; i++) out.push(line);
    }
    return out;
  }
  /** Crops a bitmap to its ink, so it can be centred on what is actually knitted. */
  function trim(bmp) {
    let t = 0;
    let b = bmp.length - 1;
    while (t <= b && bmp[t].indexOf("#") < 0) t++;
    while (b >= t && bmp[b].indexOf("#") < 0) b--;
    const rows = bmp.slice(t, b + 1);
    if (!rows.length) return bmp;
    let l = Infinity;
    let r = -1;
    for (const row of rows) {
      const i = row.indexOf("#");
      if (i >= 0) {
        l = Math.min(l, i);
        r = Math.max(r, row.lastIndexOf("#"));
      }
    }
    return rows.map((row) => row.slice(l, r + 1));
  }
  function grid(cols, rows, fill) {
    return Array.from({ length: rows }, () => new Array(cols).fill(fill));
  }
  /** Writes a bitmap into the grid. */
  function stamp(g, bmp, col, row, val) {
    for (let r = 0; r < bmp.length; r++)
      for (let c = 0; c < bmp[r].length; c++) {
        if (bmp[r][c] !== "#") continue;
        const gr = row + r;
        const gc = col + c;
        if (g[gr] && gc >= 0 && gc < g[gr].length) g[gr][gc] = val;
      }
  }
  /** Merged rectangles for the '#' cells of a bitmap. */
  function bmpRects(bmp, x0, y0, cw, ch) {
    let s = "";
    for (let r = 0; r < bmp.length; r++) {
      let c = 0;
      while (c < bmp[r].length) {
        if (bmp[r][c] !== "#") {
          c++;
          continue;
        }
        let e = c;
        while (e < bmp[r].length && bmp[r][e] === "#") e++;
        s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch)}"/>`;
        c = e;
      }
    }
    return s;
  }

  /* ---------- canvas rasteriser: real glyphs onto a stitch grid ---------- */
  const RCACHE = new Map();
  const fontsReady = (spec) => {
    try {
      return !document.fonts || document.fonts.check(spec);
    } catch (e) {
      return true;
    }
  };
  /** Text sampled from a real face onto `rows` stitch rows (cell aspect cw:ch). */
  function rasterText(text, font, rows, cw, ch, thr = 0.46, opt = {}) {
    const spec = font.replace("{s}", "100px");
    const sq = opt.sq || 1; // horizontal squash (condensed knitted lettering)
    const ls = opt.ls || "0px"; // letter-spacing, so knitted letters never fuse
    const key = `t|${text}|${font}|${rows}|${cw}|${ch}|${thr}|${sq}|${ls}`;
    if (RCACHE.has(key)) return RCACHE.get(key);
    const m = document.createElement("canvas").getContext("2d");
    m.font = spec;
    m.letterSpacing = ls;
    const mt = m.measureText(text);
    const asc = mt.actualBoundingBoxAscent;
    const hh = asc + mt.actualBoundingBoxDescent;
    const ww = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
    const k = (rows * ch) / hh;
    const cols = Math.max(1, Math.round((ww * k * sq) / cw));
    const S = 8;
    const cv = document.createElement("canvas");
    cv.width = cols * S;
    cv.height = rows * S;
    const x = cv.getContext("2d");
    x.scale(cv.width / ww, cv.height / hh);
    x.font = spec;
    x.letterSpacing = ls;
    x.fillStyle = "#000";
    x.textBaseline = "alphabetic";
    x.textAlign = "left";
    x.fillText(text, mt.actualBoundingBoxLeft, asc);
    const d = x.getImageData(0, 0, cv.width, cv.height).data;
    const out = [];
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let c = 0; c < cols; c++) {
        let a = 0;
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) a += d[((r * S + yy) * cv.width + c * S + xx) * 4 + 3];
        line += a / (S * S * 255) > thr ? "#" : ".";
      }
      out.push(line);
    }
    if (fontsReady(spec)) RCACHE.set(key, out);
    return out;
  }
  /** Ink box of a string at 100px (for centring real glyphs on what they print). */
  const MCACHE = new Map();
  function ink(text, font) {
    const spec = font.replace("{s}", "100px");
    const key = text + "|" + spec;
    if (MCACHE.has(key)) return MCACHE.get(key);
    const m = document.createElement("canvas").getContext("2d");
    m.font = spec;
    const t = m.measureText(text);
    const r = { asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent, left: t.actualBoundingBoxLeft, right: t.actualBoundingBoxRight };
    if (fontsReady(spec)) MCACHE.set(key, r);
    return r;
  }
  /** Font size and origin that put a string's ink box centred on (cx, cy) with ink height h. */
  function placeInk(text, font, cx, cy, h) {
    const m = ink(text, font);
    const fs = (h / (m.asc + m.desc)) * 100;
    const k = fs / 100;
    return { fs: f2(fs), x: f2(cx - ((m.right + m.left) / 2) * k + m.left * k), y: f2(cy - ((m.asc + m.desc) / 2) * k + m.asc * k), w: (m.right + m.left) * k };
  }

  /* ---------- the knitted motifs ---------- */
  const CHANGA = '800 {s} "Changa"';
  /** The 84: HOMA's bold hand chart; otherwise Changa 800 sampled at the tier's own
      resolution, condensed until it sits inside the selvedges with a margin. */
  function digitArt(ovr, tier, G, cols, hU) {
    const s2 = String(ovr);
    if (tier === "HOMA") {
      // two figures: 8 stitches each with a two-stitch gap; three figures drop to single-stitch columns
      const three = s2.length > 2;
      const g2 = [...s2].map((ch) => scaleCols(F57B[ch] || F57B[0], three ? [1] : F57B_COLS, 2));
      return g2[0].map((_, r) => g2.map((gl) => gl[r]).join(three ? "." : ".."));
    }
    const rows = Math.round((hU || (s2.length > 2 ? 86 : 108)) / G.ch);
    const max = cols - 2 - 2 * Math.ceil(14 / G.cw);
    let b = null;
    for (let sq = 1; sq >= 0.66; sq -= 0.04) {
      b = trim(rasterText(s2, CHANGA, rows, G.cw, G.ch, 0.5, { sq: f2(sq), ls: "0.02em" }));
      if (bw(b) <= max) break;
    }
    return b;
  }
  /** The tier word (Latin): sampled from Changa at 7 rows for STADE; hand-charted elsewhere:
      HOMA on 5 rows, PRO on a bold 7-row chart, CHAMPION's eight letters on 5 rows doubled,
      LEGEND on 5 rows. */
  function tierWordArt(tier, G, cols) {
    if (tier === "HOMA") return word("HOMA", F5H, 1);
    if (tier === "PRO") return word("PRO", F7B, 1);
    if (tier === "CHAMPION") return scaleBmp(word("CHAMPION", F5H, 1), 1, 2);
    if (tier === "LEGEND") return word("LEGEND", F5H, 1);
    const rows = Math.round(42 / G.ch);
    let b = null;
    for (let sq = 1; sq >= 0.7; sq -= 0.05) {
      b = trim(rasterText(tier, CHANGA, rows, G.cw, G.ch, 0.44, { sq: f2(sq), ls: "0.06em" }));
      if (bw(b) <= cols - 8) break;
    }
    return b;
  }
  /** The knitted name: 5 letters or fewer at 9 rows, 6–8 at 7 rows, 9+ as the initial only.
      Arabic: a final yā is knitted without its dots and the two dots are hand-placed as single
      stitch cells, so علي never reads as على. */
  function nameArt(p, o, G, cols, hU = 54) {
    const ar = MC.isAr(o);
    const name = MC.nameOf(p, o);
    const n = [...name.replace(/\s+/g, "")].length;
    let text = ar ? name : name.toUpperCase();
    let onLabel = false;
    let rows = Math.round(hU / G.ch);
    if (n >= 9) {
      text = [...text][0];
      onLabel = true;
    } else if (n >= 6) rows = Math.round((hU * 7) / 9 / G.ch);
    let dots = false;
    if (ar && text.endsWith("ي")) {
      text = text.slice(0, -1) + "ى";
      dots = true;
    }
    const opt = ar ? {} : { ls: "0.07em" };
    let bmp = trim(rasterText(text, CHANGA, rows, G.cw, G.ch, 0.46, opt));
    // keep the name inside the strip
    while (bw(bmp) > cols - 4 && rows > 4) {
      rows--;
      bmp = trim(rasterText(text, CHANGA, rows, G.cw, G.ch, 0.46, opt));
    }
    if (dots) {
      // the bowl of the final yā is the lowest ink at the left; the dots sit one row under it
      const w = bw(bmp);
      const last = bmp[bmp.length - 1];
      let l = last.indexOf("#");
      let r = last.lastIndexOf("#");
      if (l < 0) {
        l = 0;
        r = Math.min(w - 1, 6);
      }
      const mid = Math.round((l + r) / 2);
      const d = [mid - 2, mid + 1].map((c) => Math.max(0, Math.min(w - 1, c)));
      const blank = ".".repeat(w);
      const dotRow = [...blank].map((ch, i) => (d.includes(i) ? "#" : ".")).join("");
      bmp = bmp.concat([blank, dotRow]);
    }
    return { bmp, onLabel };
  }

  /* ---------- colours from the profile ---------- */
  function palette(p) {
    const club = p.club && p.club.primary;
    const G = club ? p.club.primary : WOOL;
    const L = club ? p.club.secondary || CREAM : CHAR;
    // the cast-on year is knitted in whichever of the two club yarns stands out on cream
    const Y = lum(G) < lum(L) ? G : L;
    return { G, L, C: CREAM, B: BLUE, Y, wool: !club, Gdk: mix(G, "#000000", 0.28), Glt: mix(G, "#ffffff", 0.16) };
  }

  /* ---------- SVG building blocks ---------- */
  /** Stitch texture over any yarn colour: stockinette Vs ("v"), garter ridges ("g") or 1×1 rib ("r"). */
  function stitchPattern(id, G, opt = {}) {
    const w = G.cw;
    const h = G.ch;
    const gapC = opt.gapC || "#020a1c";
    const gapO = opt.gapO != null ? opt.gapO : G.gap;
    const legC = opt.legC || "#ffffff";
    const legO = opt.legO != null ? opt.legO : G.leg;
    const tf = opt.transform ? ` patternTransform="${opt.transform}"` : "";
    const gid = id + "-lg";
    const grad =
      `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${legC}" stop-opacity="${legO}"/><stop offset=".45" stop-color="${legC}" stop-opacity="${f2(legO * 0.2)}"/>` +
      `<stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>`;
    const vLegs = (ox) => {
      const rx = w * 0.25;
      const ry = h * 0.6;
      return [
        [ox + w * 0.29, h * 0.5, -24, rx, ry],
        [ox + w * 0.71, h * 0.5, 24, rx, ry],
      ];
    };
    const ellPath = ([cx, cy, a, rx, ry]) => {
      const t = (a * Math.PI) / 180;
      const ax = ry * Math.sin(-t);
      const ay = ry * Math.cos(t);
      return `M${f2(cx - ax)} ${f2(cy - ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx + ax)} ${f2(cy + ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx - ax)} ${f2(cy - ay)}Z`;
    };
    const legEls = (legs) =>
      legs.map(([cx, cy, a, rx, ry]) => `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(${a} ${f2(cx)} ${f2(cy)})" fill="url(#${gid})"/>`).join("");
    if (G.kind === "g") {
      // garter: continuous horizontal ridges with dark troughs between them; the bumps of each
      // ridge sit half a stitch off the row below (never ringed, so it never reads as scales)
      let rows = "";
      for (let r = 0; r < 2; r++) {
        const y0 = r * h;
        const off = r ? w / 2 : 0;
        rows +=
          `<rect y="${f2(y0 + h * 0.7)}" width="${f2(w)}" height="${f2(h * 0.3)}" fill="${gapC}" fill-opacity="${gapO}"/>` +
          `<rect y="${f2(y0)}" width="${f2(w)}" height="${f2(h * 0.12)}" fill="${gapC}" fill-opacity="${f2(gapO * 0.4)}"/>` +
          [off - w / 2, off + w / 2].map((cx) => `<ellipse cx="${f2(cx)}" cy="${f2(y0 + h * 0.4)}" rx="${f2(w * 0.5)}" ry="${f2(h * 0.28)}" fill="url(#${gid})"/>`).join("") +
          `<rect x="${f2(off - 0.3)}" y="${f2(y0 + h * 0.18)}" width=".6" height="${f2(h * 0.45)}" fill="${gapC}" fill-opacity="${f2(gapO * 0.45)}"/>`;
      }
      return grad + `<pattern id="${id}" width="${f2(w)}" height="${f2(2 * h)}" patternUnits="userSpaceOnUse"${tf}>${rows}</pattern>`;
    }
    if (G.kind === "r") {
      // 1×1 rib: a raised knit column, then a sunken purl column
      const legs = vLegs(0);
      return (
        grad +
        `<pattern id="${id}" width="${f2(2 * w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${tf}>` +
        `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${legs.map(ellPath).join("")}" fill="${gapC}" fill-opacity="${f2(gapO * 0.8)}" fill-rule="evenodd"/>` +
        legEls(legs) +
        `<rect x="${f2(w)}" width="${f2(w)}" height="${f2(h)}" fill="${gapC}" fill-opacity="${f2(Math.min(0.5, gapO + 0.04))}"/>` +
        `<ellipse cx="${f2(1.5 * w)}" cy="${f2(h * 0.5)}" rx="${f2(w * 0.36)}" ry="${f2(h * 0.2)}" fill="${legC}" fill-opacity="${f2(legO * 0.35)}"/>` +
        `</pattern>`
      );
    }
    const legs = vLegs(0);
    return (
      grad +
      `<pattern id="${id}" width="${f2(w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${tf}>` +
      `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${legs.map(ellPath).join("")}" fill="${gapC}" fill-opacity="${gapO}" fill-rule="evenodd"/>` +
      legEls(legs) +
      `</pattern>`
    );
  }
  /** Satin-stitch thread: a slanted hatch of threads and shadow gaps (embroidery). */
  function hatch(id, thread, gap, tw = 0.9, gw = 0.5, ang = 20) {
    const p = f2(tw + gw);
    return `<pattern id="${id}" width="${p}" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><rect width="${p}" height="8" fill="${gap}"/><rect width="${tw}" height="8" fill="${thread}"/></pattern>`;
  }
  /** Colour runs of a stitch grid (only cells that differ from `base`). */
  function gridRuns(g, P, x0, y0, cw, ch, base) {
    let s = "";
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      let c = 0;
      while (c < row.length) {
        const k = row[c];
        let e = c + 1;
        while (e < row.length && row[e] === k) e++;
        if (k !== base) s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch + 0.04)}" fill="${P[k]}"/>`;
        c = e;
      }
    }
    return s;
  }
  /** Same, with rows and columns swapped (LEGEND: the grid is drawn along the length). */
  function steelGrad(id, vertical = true) {
    return (
      `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">` +
      `<stop offset="0" stop-color="#5E6876"/><stop offset=".18" stop-color="#E6EBF0"/><stop offset=".42" stop-color="#C6CDD6"/>` +
      `<stop offset=".7" stop-color="#A9B2BE"/><stop offset="1" stop-color="#4E5661"/></linearGradient>`
    );
  }

  /** One tassel: a bundle of strands under a wrap; CHAMPION and LEGEND tie an overhand knot. */
  function tassel(x, top, len, w, P, opt) {
    const rnd = opt.rnd;
    const n = 9;
    const knot = opt.knotted;
    const hang = opt.hang || 0; // horizontal drift at the bottom (LEGEND's fringe swings out)
    let s = "";
    const strands = [];
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) / ((n - 1) / 2);
      const x0 = x + t * w * 0.22;
      const x1 = x + t * w * 0.5 + hang + (rnd() * 2 - 1) * 0.8;
      const l = len - rnd() * 4;
      const kink = knot ? 9 : 4;
      strands.push({ i, d: `M${f2(x0)} ${f2(top + kink)}C${f2(x0 + hang * 0.1)} ${f2(top + l * 0.45)} ${f2(x1 - hang * 0.25)} ${f2(top + l * 0.75)} ${f2(x1)} ${f2(top + l)}` });
    }
    const yarnW = f2(Math.max(1.3, (w / n) * 1.05));
    for (const st of strands) {
      const light = st.i === 2 || st.i === 6; // the two strand lines in the letter yarn
      s += `<path d="${st.d}" stroke="${P.Gdk}" stroke-width="${f2(yarnW * 1.5)}" fill="none" stroke-linecap="round" opacity=".55"/>`;
      s += `<path d="${st.d}" stroke="${light ? P.L : P.G}" stroke-width="${yarnW}" fill="none" stroke-linecap="round"/>`;
    }
    // the wrap that ties it on, or a knot
    if (knot) {
      s += `<ellipse cx="${f2(x)}" cy="${f2(top + 6)}" rx="${f2(w * 0.36)}" ry="4.2" fill="${P.G}" stroke="${P.Gdk}" stroke-width="1"/>`;
      s += `<path d="M${f2(x - w * 0.28)} ${f2(top + 5)}C${f2(x - 2)} ${f2(top + 2.4)} ${f2(x + 2)} ${f2(top + 9)} ${f2(x + w * 0.3)} ${f2(top + 6)}" stroke="${P.Glt}" stroke-width="1" fill="none" opacity=".8"/>`;
    } else s += `<rect x="${f2(x - w * 0.26)}" y="${f2(top + 1)}" width="${f2(w * 0.52)}" height="3.2" rx="1.2" fill="${P.Gdk}"/>`;
    return s;
  }

  /** The woven label's geometry at scale k (1 on the hanging scarf). `stack` sets the foot on one
      line per field, for a narrow label. Returns the y offsets of every line and the height. */
  function labelLayout(w, k, stack, nameOnLabel) {
    const pad = 9 * k;
    const lw = Math.min(w - 2 * pad, 62 * k);
    const lh = lw / MC.LOGO_RATIO.wordmark;
    const logoY = 9 * k;
    const ruleY = logoY + lh + 6 * k;
    const sp = 14.6 * k;
    const stats = [0, 1, 2, 3].map((i) => ruleY + 16 * k + i * sp);
    const rule2 = stats[3] + 7 * k;
    const mfs = Math.min(8 * k, 9.4);
    const nfs = Math.min(6.6 * k, 8);
    const lp = mfs * 1.32;
    const foot = [rule2 + 4 * k + mfs];
    for (let i = 1; i < (stack ? 3 : 2); i++) foot.push(foot[i - 1] + lp);
    const note = foot[foot.length - 1] + nfs * 1.45;
    const nameY = nameOnLabel ? note + lp : null;
    const h = Math.ceil((nameY || note) + 7 * k);
    return { pad, lw, lh, logoY, ruleY, stats, rule2, mfs, nfs, foot, note, nameY, h };
  }

  /** The woven label sewn on the front: the brand header, the four ratings in a column, and the
      ID's carrier (ID, country, season) woven into its foot. */
  function wovenLabel(p, o, x, y, w, k, thumb, ids, nameOnLabel, stack) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const Lt = labelLayout(w, k, stack, nameOnLabel);
    const h = Lt.h;
    const L = x + Lt.pad;
    const R = x + w - Lt.pad;
    let s = "";
    // sewn: a soft shadow, the satin, a woven border, the sewing stitches at the edges
    s += `<rect x="${f2(x + 0.8)}" y="${f2(y + 1.6)}" width="${w}" height="${h}" fill="#020a1c" opacity=".35" filter="url(#${ids.soft})"/>`;
    s += `<rect x="${f2(x)}" y="${f2(y)}" width="${w}" height="${h}" fill="${SATIN}"/>`;
    if (!thumb) s += `<rect x="${f2(x)}" y="${f2(y)}" width="${w}" height="${h}" fill="url(#${ids.weave})"/>`;
    s += `<rect x="${f2(x + 0.5)}" y="${f2(y + 0.5)}" width="${w - 1}" height="${h - 1}" fill="none" stroke="${SATIN_EDGE}" stroke-width="1"/>`;
    s += `<rect x="${f2(x + 3)}" y="${f2(y + 3)}" width="${w - 6}" height="${h - 6}" fill="none" stroke="#8A8170" stroke-width=".7" stroke-dasharray="2.2 1.6" opacity=".55"/>`;
    // header: the BotolaGO wordmark, unmodified (colour variant on the satin)
    const lx = ar ? R - Lt.lw : L;
    s += MC.logo("wordmark", { variant: "color", w: f2(Lt.lw), h: f2(Lt.lh), label: false }).replace("<svg ", `<svg x="${f2(lx)}" y="${f2(y + Lt.logoY)}" `);
    const rule = (yy) => `<path d="M${f2(L)} ${f2(yy)}H${f2(R)}" stroke="${SATIN_EDGE}" stroke-width="${f2(0.8 * Math.min(k, 1.3))}"/>`;
    s += rule(y + Lt.ruleY);
    const tx = (xx, yy, str, anchor, cls, fs, dir = "ltr") =>
      `<text x="${f2(xx)}" y="${f2(yy)}" text-anchor="${anchor}" direction="${dir}" font-size="${f2(fs)}" class="c07-lb ${cls}">${esc(str)}</text>`;
    if (thumb) {
      Lt.stats.forEach((b) => {
        const yy = y + b - 9 * k;
        s += `<rect x="${f2(ar ? R - 30 * k : L)}" y="${f2(yy + 2 * k)}" width="${f2(30 * k)}" height="${f2(6 * k)}" fill="${LABEL_SOFT}" opacity=".5"/><rect x="${f2(ar ? L : R - 16 * k)}" y="${f2(yy)}" width="${f2(16 * k)}" height="${f2(9 * k)}" fill="${LABEL_INK}" opacity=".7"/>`;
      });
      return s;
    }
    // the four ratings (the Arabic names shrink until each line fits beside its figure)
    let akfs = 11.5 * k;
    if (ar) {
      const vw = ((ink("88", '800 {s} "Manrope"').right + ink("88", '800 {s} "Manrope"').left) * 13 * k) / 100;
      const kw = Math.max(...MC.STATS.map((key) => { const m = ink(S.stats[key], '700 {s} "Noto Sans Arabic"'); return m.left + m.right; }));
      akfs = Math.min(akfs, ((R - L - vw - 6 * k) / kw) * 100);
    }
    MC.STATS.forEach((key, i) => {
      const yy = y + Lt.stats[i];
      if (ar) {
        s += tx(R, yy, S.stats[key], "start", "c07-lb-k c07-lb-ar", akfs, "rtl");
        s += tx(L, yy, String(p.stats[key]), "start", "c07-lb-v", 13 * k);
      } else {
        s += tx(L, yy, S.stats[key], "start", "c07-lb-k", 10.5 * k);
        s += tx(R, yy, String(p.stats[key]), "end", "c07-lb-v", 13 * k);
      }
    });
    s += rule(y + Lt.rule2);
    // the ID's physical carrier: woven into the label's foot, with the country and the season.
    // An RTL string anchored at the left edge ends there ("end"); at the right edge it starts there.
    const F = Lt.foot.map((b) => y + b);
    const mfs = Lt.mfs;
    const note = ar ? "مثال · J.01–J.07" : "J.01–J.07 · Exemple";
    if (ar) {
      s += tx(R, F[0], p.id, "end", "c07-lb-meta", mfs);
      s += tx(R, F[1], S.country, "start", "c07-lb-meta c07-lb-ar", mfs + 0.6, "rtl");
      s += stack ? tx(R, F[2], p.season, "end", "c07-lb-meta", mfs) : tx(L, F[1], p.season, "start", "c07-lb-meta", mfs);
      s += tx(R, y + Lt.note, note, "start", "c07-lb-note c07-lb-ar", Lt.nfs + 0.4, "rtl");
    } else {
      s += tx(L, F[0], p.id, "start", "c07-lb-meta", mfs);
      s += tx(L, F[1], S.country, "start", "c07-lb-meta", mfs);
      s += stack ? tx(L, F[2], p.season, "start", "c07-lb-meta", mfs) : tx(R, F[1], p.season, "end", "c07-lb-meta", mfs);
      s += tx(L, y + Lt.note, note, "start", "c07-lb-note", Lt.nfs);
    }
    if (nameOnLabel) s += tx(ar ? R : L, y + Lt.nameY, MC.nameOf(p, o), "start", "c07-lb-meta" + (ar ? " c07-lb-ar" : ""), mfs, ar ? "rtl" : "ltr");
    return s;
  }

  /** The founder's cast-on: five rows of cream, two cable twists flanking 2026 knitted in a club yarn.
      Latin x positions only; digits are never mirrored. Non-founders cast on plain, in the ground yarn. */
  function castOn(p, P, ids, y, ar, thumb, motion) {
    const cols = FW / CAST.cw;
    const h = CAST.rows * CAST.ch;
    const founder = !!p.founder;
    const base = founder ? CREAM : P.G;
    let s = "";
    const rows = [];
    // 2026: 3×5 bitmap, one stitch per pixel, centred
    const yr = founder ? word(String(p.founder), F35, 1) : null;
    for (let r = 0; r < CAST.rows; r++) {
      let row = `<rect x="${X0}" y="${f2(y + r * CAST.ch)}" width="${FW}" height="${CAST.ch + 0.04}" fill="${base}"/>`;
      if (yr) {
        const c0 = Math.floor((cols - bw(yr)) / 2) + (ar ? 0 : 1);
        row += `<g fill="${P.Y}">${bmpRects([yr[r]], X0 + c0 * CAST.cw, y + r * CAST.ch, CAST.cw, CAST.ch)}</g>`;
      }
      // the selvedges continue through the cast-on
      row += `<rect x="${ar ? X0 : X1 - CAST.cw}" y="${f2(y + r * CAST.ch)}" width="${CAST.cw}" height="${CAST.ch + 0.04}" fill="${BLUE}"/>`;
      if (!founder) row += `<rect x="${ar ? X1 - CAST.cw : X0}" y="${f2(y + r * CAST.ch)}" width="${CAST.cw}" height="${CAST.ch + 0.04}" fill="${CREAM}"/>`;
      rows.push(row);
    }
    s += rows.map((r, i) => `<g class="c07-co-row" style="--i:${i}">${r}</g>`).join("");
    // the texture, cables and cast-on edge arrive once the rows are knitted (motion only)
    s += `<g class="c07-co-after">`;
    s += `<rect x="${X0}" y="${y}" width="${FW}" height="${h}" fill="url(#${ids.cast})"/>`;
    if (founder && !thumb) {
      // two cable twists flanking the year (a rope of two strands crossing twice)
      const c0 = Math.floor((cols - 15) / 2) + (ar ? 0 : 1);
      const cx = [(X0 + CAST.cw + X0 + c0 * CAST.cw) / 2, (X0 + (c0 + 15) * CAST.cw + X1 - CAST.cw) / 2].map(Math.round);
      for (const c of cx) {
        const a = `M${c - 4} ${y}C${c - 4} ${y + 7} ${c + 4} ${y + 10} ${c + 4} ${y + 17.5}C${c + 4} ${y + 25} ${c - 4} ${y + 28} ${c - 4} ${y + 35}`;
        const b = `M${c + 4} ${y}C${c + 4} ${y + 7} ${c - 4} ${y + 10} ${c - 4} ${y + 17.5}C${c - 4} ${y + 25} ${c + 4} ${y + 28} ${c + 4} ${y + 35}`;
        s += `<rect x="${c - 10}" y="${y}" width="20" height="${h}" fill="#8A8170" opacity=".22"/>`;
        s += `<path d="${b}" stroke="#A39A86" stroke-width="7.4" fill="none"/><path d="${b}" stroke="${CREAM}" stroke-width="5.2" fill="none"/>`;
        s += `<path d="${a}" stroke="#A39A86" stroke-width="7.4" fill="none"/><path d="${a}" stroke="${CREAM}" stroke-width="5.2" fill="none"/>`;
        s += `<path d="${a}" stroke="#fff" stroke-width="1.2" fill="none" opacity=".75" transform="translate(-1 -.6)"/>`;
      }
    }
    // the cast-on edge: a chain of small loops along the bottom
    if (!thumb) {
      let d = "";
      for (let x = X0 + 3; x < X1; x += CAST.cw) d += `M${x - 2.2} ${y + h - 0.6}a2.2 1.8 0 0 0 4.4 0`;
      s += `<path d="${d}" stroke="${founder ? "#A39A86" : P.Gdk}" stroke-width="1" fill="none"/>`;
    }
    s += `</g>`;
    void motion;
    return `<g class="c07-cast${founder ? " c07-cast--founder" : ""}">${s}</g>`;
  }

  /* ---------- full card: hanging tiers (HOMA → CHAMPION) ---------- */
  function fullHanging(p, o) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tier = p.tier;
    const G = GAUGE[tier];
    const P = palette(p);
    const thumb = !!o.thumb;
    const u = MC.uid(PFX);
    const ids = { base: u + "-pb", rib: u + "-pr", alt: u + "-pa", ridge: u + "-rg", cast: u + "-pc", knot: u + "-pk", clip: u + "-cl", curl: u + "-cu", fold: u + "-fo", grain: u + "-gr", soft: u + "-sf", weave: u + "-wv", rail: u + "-rl", knotG: u + "-kg", emb: u + "-em", embSh: u + "-es", ear: u + "-ea" };
    const cols = FW / G.cw;
    const sc = ar ? cols - 1 : 0; // cream selvedge (inline start)
    const ec = ar ? 0 : cols - 1; // Logo Blue selvedge (inline end)
    const rowsOf = (v) => Math.max(1, Math.round(v / G.ch));

    // motifs
    const dg = digitArt(p.ovr, tier, G, cols);
    const wd = ar ? null : tierWordArt(tier, G, cols);
    const nm = nameArt(p, o, G, cols);
    // rows, from the rail down. HOMA's chunky cells round its gaps down, so it is never the
    // tallest scarf in a leaderboard.
    const gapRows = (v) => (tier === "HOMA" ? Math.max(1, Math.floor(v / G.ch)) : rowsOf(v));
    const L = {};
    let r = Math.ceil((46 - FT) / G.ch);
    L.digits = r;
    r += dg.length;
    // STADE: a two-row club-secondary stripe above and below the 84, one ground row from it.
    // PRO: the 84 panel is knitted double-face reversed (secondary ground, primary figures).
    if (tier === "STADE") {
      L.stripes = [L.digits - 3, r + 1];
      r += 3;
    }
    if (tier === "PRO") {
      L.panel = [L.digits - 2, r + 2];
      r += 2;
    }
    r += gapRows(10);
    L.word = r;
    const wRows = wd ? wd.length : rowsOf(40);
    r += wRows;
    r += gapRows(14);
    L.season = r;
    const bandRows = 2;
    r += PLAYED * bandRows;
    r += gapRows(14);
    // the name sits above the label, so the label always stands between the name and the
    // founder year: never the supporter-group "name + year" lockup
    L.name = r;
    r += nm.bmp.length;
    r += gapRows(14);
    L.label = r;
    const lh = labelLayout(LABEL_W, 1, false, nm.onLabel).h;
    r += Math.ceil(lh / G.ch);
    r += gapRows(12);
    L.rows = r;
    const yOf = (row) => FT + row * G.ch;
    const yFab = yOf(L.rows); // fabric bottom = cast-on top
    const yCast = yFab + CAST.rows * CAST.ch;
    const fringeLen = { HOMA: 32, STADE: 34, PRO: 36, CHAMPION: 40 }[tier];
    const H = Math.ceil(yCast + fringeLen + 8);

    // the grid
    const g = grid(cols, L.rows, "G");
    const centre = (bmp) => (ar ? Math.floor : Math.ceil)((cols - bw(bmp)) / 2);
    const fillRows = (a, b, v) => {
      for (let i = a; i < b; i++) for (let c = 0; c < cols; c++) g[i][c] = v;
    };
    if (L.panel) fillRows(L.panel[0], L.panel[1], "L");
    if (L.stripes) for (const a of L.stripes) fillRows(a, a + 2, "L");
    stamp(g, dg, centre(dg), L.digits, L.panel ? "G" : "L");
    if (wd) stamp(g, wd, centre(wd), L.word, "L");
    stamp(g, nm.bmp, centre(nm.bmp), L.name, "L");
    for (let i = 0; i < L.rows; i++) {
      g[i][sc] = "C";
      g[i][ec] = "B";
    }
    // the season: newest band under the tier word; every fifth gameweek a cream notch on the start selvedge
    const bands = [];
    for (let k = 0; k < PLAYED; k++) {
      const gw = PLAYED - k;
      const row0 = L.season + k * bandRows;
      bands.push({ gw, y0: yOf(row0), y1: yOf(row0 + bandRows), rib: gw % 2 === 0 });
      if (gw % 5 === 0) for (let s2 = 0; s2 < bandRows; s2++) g[row0 + s2][ar ? sc - 1 : sc + 1] = "C";
    }

    // defs
    const base = { ...G };
    const rib = { ...G, kind: "r" };
    // the season's two textures: rib, and garter (or stockinette where the ground is already garter)
    const alt = { ...G, kind: G.kind === "g" ? "v" : "g", gap: Math.max(G.gap, 0.4), leg: Math.max(G.leg, 0.26) };
    let defs =
      stitchPattern(ids.base, base) +
      stitchPattern(ids.rib, rib) +
      stitchPattern(ids.alt, alt) +
      `<pattern id="${ids.ridge}" width="${G.cw}" height="4" patternUnits="userSpaceOnUse" y="${FT}"><rect y="2.8" width="${G.cw}" height="1.2" fill="#000" opacity=".42"/><ellipse cx="${G.cw / 2}" cy="1.7" rx="${f2(G.cw * 0.48)}" ry="1.4" fill="#fff" opacity=".26"/></pattern>` +
      stitchPattern(ids.cast, { cw: CAST.cw, ch: CAST.ch, kind: "v", gap: 0.18, leg: 0.3 }, { gapC: "#5A4E36" }) +
      steelGrad(ids.rail) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".06" stop-color="#000" stop-opacity=".06"/>` +
      `<stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>` +
      // the fold over the tube: lit on top, a shadow where the scarf turns down
      `<linearGradient id="${ids.fold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".22" stop-color="#fff" stop-opacity=".08"/>` +
      `<stop offset=".5" stop-color="#000" stop-opacity=".22"/><stop offset=".72" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${ids.knotG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/><stop offset=".7" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>` +
      `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.4"/></filter>` +
      `<pattern id="${ids.weave}" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><rect width="1.6" height=".7" fill="#000" opacity=".04"/><rect x=".8" y=".8" width=".8" height=".8" fill="#000" opacity=".03"/></pattern>`;
    if (!thumb)
      defs += `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(p.serial) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;
    if (ar) defs += hatch(ids.emb, P.L, mix(P.L, P.G, 0.45)) + `<filter id="${ids.embSh}" x="-10%" y="-20%" width="120%" height="150%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy=".7" stdDeviation=".4" flood-color="#020a1c" flood-opacity=".7"/></filter>`;

    // outline: the fold over the rail, rib bands pulling the edges in, PRO's dog-ear
    const pinch = 1.6;
    const right = [[X1, FT + 6]];
    const left = [[X0, FT + 6]];
    for (const b of bands) {
      if (!b.rib) continue;
      right.push([X1, b.y0 - 1], [X1 - pinch, b.y0 + 2], [X1 - pinch, b.y1 - 2], [X1, b.y1 + 1]);
      left.push([X0, b.y0 - 1], [X0 + pinch, b.y0 + 2], [X0 + pinch, b.y1 - 2], [X0, b.y1 + 1]);
    }
    const ear = tier === "PRO" ? 18 : 0;
    const endSide = ar ? left : right;
    const startSide = ar ? right : left;
    const ex = ar ? X0 : X1;
    const sg = ar ? 1 : -1;
    if (ear) endSide.push([ex, yCast - ear], [ex + sg * ear, yCast]);
    else endSide.push([ex, yCast]);
    startSide.push([ar ? X1 : X0, yCast]);
    const pts = (arr) => arr.map(([x, y]) => `${f2(x)} ${f2(y)}`).join("L");
    const outline = `M${X0} ${FT + 6}Q${X0} ${FT} ${X0 + 6} ${FT}H${X1 - 6}Q${X1} ${FT} ${X1} ${FT + 6}L${pts(right)}L${pts(left.slice().reverse())}Z`;
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;

    // fabric: ground, colour runs, stitch texture (base, with rib on even gameweeks)
    let fab = `<rect x="${X0}" y="${FT}" width="${FW}" height="${yFab - FT}" fill="${P.G}"/>` + gridRuns(g, P, X0, FT, G.cw, G.ch, "G");
    const segs = [];
    const sorted = bands.slice().sort((a, c) => a.y0 - c.y0);
    segs.push([FT, sorted[0].y0, ids.base]);
    for (const b of sorted) segs.push([b.y0, b.y1, b.rib ? ids.rib : ids.alt]);
    segs.push([sorted[sorted.length - 1].y1, yFab, ids.base]);
    for (const [a, b, id] of segs) if (b > a) fab += `<rect x="${X0}" y="${f2(a)}" width="${FW}" height="${f2(b - a)}" fill="url(#${id})"/>`;
    // a purl ridge between gameweeks: every band is closed by a raised row, so seven read as seven
    {
      const edges = bands.map((b) => b.y0).concat([bands[bands.length - 1].y1]);
      for (const y of edges) fab += `<rect x="${X0}" y="${f2(y - 2)}" width="${FW}" height="4" fill="url(#${ids.ridge})"/>`;
    }
    fab += castOn(p, P, ids, yFab, ar, thumb, o.motion);
    // shading: edge curl, the fold over the tube, fibre grain
    fab +=
      `<g pointer-events="none"><rect x="${X0}" y="${FT}" width="${FW}" height="${yCast - FT}" fill="url(#${ids.curl})"/>` +
      `<rect x="${X0}" y="${FT}" width="${FW}" height="34" fill="url(#${ids.fold})"/>` +
      (thumb ? "" : `<rect x="${X0}" y="${FT}" width="${FW}" height="${yCast - FT}" filter="url(#${ids.grain})" opacity=".5"/>`) +
      `</g>`;

    // PRO: the bottom end corner folded over, showing the double face's reverse (colours swapped)
    let earSvg = "";
    if (ear) {
      const A = [ex + sg * ear, yCast];
      const B = [ex, yCast - ear];
      const Cc = [ex + sg * ear, yCast - ear];
      const tri = (a, b, c) => `M${f2(a[0])} ${f2(a[1])}L${f2(b[0])} ${f2(b[1])}L${f2(c[0])} ${f2(c[1])}Z`;
      const flap = tri(A, B, Cc);
      earSvg =
        `<path d="${tri([A[0], A[1] + 0.8], [B[0] + sg * 0.8, B[1]], [Cc[0] + sg * 2, Cc[1] - 1.4])}" fill="#020a1c" opacity=".55" filter="url(#${ids.soft})"/>` +
        `<path d="${flap}" fill="${P.G}"/>` +
        `<path d="${flap}" fill="url(#${ids.base})"/>` +
        `<path d="M${f2(A[0])} ${f2(A[1])}L${f2(B[0])} ${f2(B[1])}" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>`;
    }

    // fringe: the tassel count is the tier
    const n = TASSELS[tier];
    const rnd = seeded(hashStr(p.serial + "fringe" + tier));
    const tw = tier === "HOMA" ? 20 : tier === "CHAMPION" ? 15 : 17;
    let fringe = "";
    for (let i = 0; i < n; i++) {
      let x = X0 + (FW * (i + 0.5)) / n;
      if (ear && ((!ar && x > X1 - ear - 6) || (ar && x < X0 + ear + 6))) x += ar ? 10 : -10;
      fringe += tassel(x, yCast - 3, fringeLen + (rnd() * 6 - 3), tw, P, { rnd, knotted: tier === "CHAMPION" });
    }

    // the rail and the knot (the asymmetric feature, on the inline-start side)
    const rail =
      `<rect x="0" y="${RAIL_Y}" width="${VW}" height="${RAIL_H}" rx="${RAIL_H / 2}" fill="url(#${ids.rail})"/>` +
      `<rect x=".5" y="${RAIL_Y + 0.5}" width="${VW - 1}" height="${RAIL_H - 1}" rx="${RAIL_H / 2 - 0.5}" fill="none" stroke="#4E5661" stroke-width="1" class="c07-rail-edge"/>` +
      `<path d="M6 ${RAIL_Y + 3}H${VW - 6}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
    const knot = knotSvg(P, ids, ar, thumb, rnd);
    const rim = `<path class="c07-rim" d="${outline}" fill="none" stroke-width="1"/>`;

    // Arabic tier word: satin-stitch embroidery over the knit (a stitch grid cannot hold its curves)
    let emb = "";
    if (ar) {
      const t = placeInk(S.tiers[tier], '700 {s} "Changa"', VW / 2, yOf(L.word) + (wRows * G.ch) / 2, 30);
      emb =
        `<g${thumb ? "" : ` filter="url(#${ids.embSh})"`}><text x="${t.x}" y="${t.y}" direction="ltr" class="c07-emb" font-size="${t.fs}" fill="${thumb ? P.L : `url(#${ids.emb})`}" stroke="${mix(P.L, P.G, 0.3)}" stroke-width="1.6" stroke-dasharray="1.4 .6" paint-order="stroke">${esc(S.tiers[tier])}</text></g>`;
    }
    const label = wovenLabel(p, o, VW / 2 - LABEL_W / 2, yOf(L.label), LABEL_W, 1, thumb, ids, nm.onLabel, false);

    const svg =
      `<svg class="c07-svg" viewBox="0 0 ${VW} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      (o._noRail ? "" : rail) +
      `<g class="c07-sway">` +
      `<g class="c07-fringe">${fringe}</g>` +
      `<g class="c07-fabric" clip-path="url(#${ids.clip})">${fab}</g>` +
      rim +
      earSvg +
      emb +
      label +
      `</g>` +
      knot +
      `</svg>`;
    const cls = `c07 c07--${tier.toLowerCase()}${thumb ? " c07--thumb" : ""}${o.motion ? " c07--motion" : ""}${P.wool ? " c07--wool" : ""}`;
    return `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}" data-cast="${f2(yCast)}">${svg}</div>`;
  }

  /** The knot: the scarf's own tail, wrapped once round the rail on the inline-start side and
      hanging down the overhang, with its cream and Logo Blue selvedges and two tassels at its end.
      It makes the outline asymmetric at every size. Drawn in LTR units, mirrored for Arabic. */
  const TAIL = { x0: 1.5, x1: 19.5, y1: 90 };
  function knotSvg(P, ids, ar, thumb, rnd) {
    const { x0, x1, y1 } = TAIL;
    const top = RAIL_Y + RAIL_H - 1;
    const sel = 3.6;
    const strip = `M${x0} ${top}H${x1}C${x1 + 0.4} ${top + 26} ${x1 - 0.2} ${y1 - 24} ${x1 - 0.6} ${y1}H${x0 + 0.8}C${x0 + 0.4} ${y1 - 26} ${x0 - 0.4} ${top + 24} ${x0} ${top}Z`;
    const clip = ids.knot;
    let g = `<clipPath id="${clip}"><path d="${strip}"/></clipPath>`;
    // the tail, hanging
    g += `<path d="${strip}" fill="#020a1c" opacity=".4" filter="url(#${ids.soft})" transform="translate(1.6 1.4)"/>`;
    g += `<g clip-path="url(#${clip})"><rect x="${x0 - 1}" y="${top}" width="${x1 - x0 + 2}" height="${y1 - top}" fill="${P.G}"/>`;
    if (!thumb) g += `<rect x="${x0 - 1}" y="${top}" width="${x1 - x0 + 2}" height="${y1 - top}" fill="url(#${ids.base})"/>`;
    g += `<rect x="${x0 - 1}" y="${top}" width="${sel + 1}" height="${y1 - top}" fill="${CREAM}"/><rect x="${x1 - sel}" y="${top}" width="${sel + 1}" height="${y1 - top}" fill="${BLUE}"/>`;
    g += `<rect x="${x0 - 1}" y="${top}" width="${x1 - x0 + 2}" height="${y1 - top}" fill="url(#${ids.curl})"/>`;
    g += `<rect x="${x0 - 1}" y="${top}" width="${x1 - x0 + 2}" height="10" fill="#000" opacity=".28"/></g>`;
    g += `<path d="${strip}" fill="none" stroke="${P.Gdk}" stroke-width=".8"/>`;
    // two tassels at its cast-off end
    g += `<g class="c07-fringe">${tassel(x0 + 5, y1 - 2, 17, 7, P, { rnd })}${tassel(x1 - 5, y1 - 2, 19, 7, P, { rnd })}</g>`;
    // the wrap round the tube: lit on top, in shadow underneath
    const wy = RAIL_Y - 3;
    const wh = RAIL_H + 6;
    g += `<rect x="${x0 - 1.2}" y="${wy}" width="${x1 - x0 + 2.4}" height="${wh}" rx="4.5" fill="${P.G}"/>`;
    if (!thumb) g += `<rect x="${x0 - 1.2}" y="${wy}" width="${x1 - x0 + 2.4}" height="${wh}" rx="4.5" fill="url(#${ids.base})"/>`;
    g += `<rect x="${x0 - 1.2}" y="${wy}" width="${sel}" height="${wh}" rx="1.5" fill="${CREAM}"/><rect x="${x1 + 1.2 - sel}" y="${wy}" width="${sel}" height="${wh}" rx="1.5" fill="${BLUE}"/>`;
    g += `<rect x="${x0 - 1.2}" y="${wy}" width="${x1 - x0 + 2.4}" height="${wh}" rx="4.5" fill="url(#${ids.knotG})"/>`;
    g += `<rect x="${x0 - 1.2}" y="${wy}" width="${x1 - x0 + 2.4}" height="${wh}" rx="4.5" fill="none" stroke="${P.Gdk}" stroke-width=".8"/>`;
    return `<g class="c07-knot"${ar ? ` transform="matrix(-1 0 0 1 ${VW} 0)"` : ""}>${g}</g>`;
  }

  /* ---------- full card: LEGEND, the scarf raised overhead ---------- */
  /** 'Écharpe levée': the scarf lifted off the rail and held taut overhead between two fists, arms
      rising from the bottom edge. The band across the top third carries the name with LEGEND
      knitted under it, a cream bar, and the 84 knitted big. Each end drapes down from its fist:
      the start end carries the season's ridges and the woven label, the other end the founder's
      cast-on; both end in the longest hand-knotted fringe. Composed in LTR units; Arabic mirrors
      the order (the figures stay left-to-right). */
  function fullLegend(p, o) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const P = palette(p);
    const thumb = !!o.thumb;
    const u = MC.uid(PFX);
    const ids = { base: u + "-pb", flap: u + "-pf", cast: u + "-pc", clip: u + "-cl", curl: u + "-cu", soft: u + "-sf", weave: u + "-wv", grain: u + "-gr", cuff: u + "-cf", sleeve: u + "-sl", fist: u + "-fi", dA: u + "-da", dB: u + "-db", arms: u + "-ar", emb: u + "-em", embSh: u + "-es" };
    const C = LG.cw; // the heaviest gauge: 9u stitches
    const rowsN = 17; // stitches across the band, selvedges included
    const BH = rowsN * C; // 153
    const BY = 20;
    const mid = BY + BH / 2;
    const DB = 394; // the ends' cast-off / cast-on edge
    const H = 476;
    // the knitted motifs
    const three = String(p.ovr).length > 2;
    const dg = trim(rasterText(String(p.ovr), CHANGA, three ? 11 : 13, C, C, 0.5, { sq: 0.86, ls: "0.03em" }));
    const nm = nameArt(p, o, { cw: C, ch: C }, 40, (ar ? 7 : 8) * C);
    const wd = ar ? null : tierWordArt("LEGEND", LG, 40);
    const emb = ar ? placeInk(S.tiers.LEGEND, '700 {s} "Changa"', 0, 0, 30) : null;
    const blockW = Math.max(bw(nm.bmp) * C, wd ? bw(wd) * C : emb.w + 8);
    const blockRows = nm.bmp.length + (wd ? 1 + wd.length : 5);
    const barZone = 6 * C; // two ground stitches, the two-stitch cream bar, two ground stitches
    const contentW = Math.ceil((blockW + barZone + bw(dg) * C) / C) * C;
    const gather = 46; // from the fist to where the band is at full width
    const outer = 114; // room outside each fist for the drape
    const fa = outer;
    const xs = fa + gather;
    const fb = xs + contentW + gather;
    const W = fb + outer;
    // logical x (reading order) to drawn x: Arabic mirrors inside the band
    const X = (x, w) => (ar ? fa + fb - x - w : x);

    // the band's stitch grid: columns along the length
    const cols = Math.round((fb - fa) / C);
    const g = grid(cols, rowsN, "G");
    for (let c = 0; c < cols; c++) {
      g[0][c] = "C"; // the start selvedge runs along the top edge
      g[rowsN - 1][c] = "B"; // Logo Blue along the bottom edge
    }
    const colOf = (x) => Math.round((x - fa) / C);
    const inner = rowsN - 2;
    const blockX = X(xs, blockW);
    const bRow = 1 + Math.floor((inner - blockRows) / 2);
    const nmX = blockX + (blockW - bw(nm.bmp) * C) / 2;
    stamp(g, nm.bmp, colOf(nmX), bRow, "L");
    if (wd) stamp(g, wd, colOf(blockX + (blockW - bw(wd) * C) / 2), bRow + nm.bmp.length + 1, "L");
    const barX = X(xs + blockW + 2 * C, 2 * C);
    for (let r = 1; r < rowsN - 1; r++) for (const c of [colOf(barX), colOf(barX) + 1]) g[r][c] = "C";
    const dgW = bw(dg) * C;
    const dgX = X(xs + contentW - dgW, dgW);
    stamp(g, dg, colOf(dgX), 1 + Math.round((inner - dg.length) / 2), "L");

    let defs =
      stitchPattern(ids.base, LG, { transform: "rotate(-90)" }) +
      stitchPattern(ids.flap, LG) +
      stitchPattern(ids.cast, { cw: CAST.cw, ch: CAST.ch, kind: "v", gap: 0.18, leg: 0.3 }, { gapC: "#5A4E36" }) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".86" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>` +
      `<linearGradient id="${ids.sleeve}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(SLEEVE, "#000000", 0.35)}"/><stop offset=".45" stop-color="${SLEEVE_LT}"/><stop offset="1" stop-color="${mix(SLEEVE, "#000000", 0.45)}"/></linearGradient>` +
      `<linearGradient id="${ids.fist}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKIN_LT}"/><stop offset=".55" stop-color="${SKIN}"/><stop offset="1" stop-color="${SKIN_DK}"/></linearGradient>` +
      `<pattern id="${ids.cuff}" width="4" height="10" patternUnits="userSpaceOnUse"><rect width="4" height="10" fill="${SLEEVE_LT}"/><rect width="1.6" height="10" fill="${mix(SLEEVE, "#000000", 0.3)}"/></pattern>` +
      `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      `<pattern id="${ids.weave}" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><rect width="1.6" height=".7" fill="#000" opacity=".04"/></pattern>` +
      `<clipPath id="${ids.arms}"><rect width="${W}" height="${H}"/></clipPath>`;
    if (!thumb)
      defs += `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(p.serial) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;
    if (ar) defs += hatch(ids.emb, P.L, mix(P.L, P.G, 0.45)) + `<filter id="${ids.embSh}" x="-10%" y="-20%" width="120%" height="150%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy=".7" stdDeviation=".4" flood-color="#020a1c" flood-opacity=".7"/></filter>`;

    // the band, taut between the fists and gathered into each of them
    const gat = 24;
    const top = BY;
    const bot = BY + BH;
    const outline =
      `M${fa} ${mid - gat}C${fa + 22} ${mid - gat} ${fa + 28} ${top} ${fa + gather} ${top}` +
      `H${fb - gather}C${fb - 28} ${top} ${fb - 22} ${mid - gat} ${fb} ${mid - gat}` +
      `V${mid + gat}C${fb - 22} ${mid + gat} ${fb - 28} ${bot} ${fb - gather} ${bot}` +
      `H${fa + gather}C${fa + 28} ${bot} ${fa + 22} ${mid + gat} ${fa} ${mid + gat}Z`;
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;
    const len = fb - fa;
    let fab = `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="${P.G}"/>` + gridRuns(g, P, fa, BY, C, C, "G");
    fab += `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.base})"/>`;
    fab +=
      `<g pointer-events="none"><rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.curl})"/>` +
      (thumb ? "" : `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" filter="url(#${ids.grain})" opacity=".5"/>`) +
      `</g>`;
    // gathered folds running out of each fist
    let folds = "";
    for (const [f, dir] of [
      [fa, 1],
      [fb, -1],
    ])
      for (const dy of [-20, -8, 4, 16]) folds += `<path d="M${f2(f + dir * 10)} ${f2(mid + dy * 0.7)}C${f2(f + dir * 24)} ${f2(mid + dy)} ${f2(f + dir * 36)} ${f2(mid + dy * 2.4)} ${f2(f + dir * 54)} ${f2(mid + dy * 3.4)}" stroke="#000" stroke-opacity=".3" stroke-width="1.6" fill="none"/>`;
    // Arabic: أسطورة in satin stitch under the knitted name
    let embSvg = "";
    if (ar) {
      const cy = BY + (bRow + nm.bmp.length) * C + 22;
      const t = placeInk(S.tiers.LEGEND, '700 {s} "Changa"', blockX + blockW / 2, cy, 30);
      embSvg = `<g${thumb ? "" : ` filter="url(#${ids.embSh})"`}><text x="${t.x}" y="${t.y}" direction="ltr" class="c07-emb" font-size="${t.fs}" fill="${thumb ? P.L : `url(#${ids.emb})`}" stroke="${mix(P.L, P.G, 0.3)}" stroke-width="1.6" stroke-dasharray="1.4 .6" paint-order="stroke">${esc(S.tiers.LEGEND)}</text></g>`;
    }

    // the ends, draping from each fist to the cast-off edge (side -1: left, +1: right)
    const rnd = seeded(hashStr(p.serial + "fringe-legend"));
    const dw = 108; // an end, hanging, at its foot
    const drape = (side, kind, clipId) => {
      const f = side < 0 ? fa : fb;
      const o2 = side; // outward
      const inX = f - o2 * 4; // inner edge at the foot
      const outX = inX + o2 * dw;
      const d =
        `M${f2(f + o2 * 10)} ${mid + 6}C${f2(f + o2 * 40)} ${mid + 14} ${f2(outX - o2 * 4)} ${mid + 50} ${f2(outX)} ${mid + 96}` +
        `L${f2(outX + o2 * 2)} ${DB}H${f2(inX)}L${f2(inX + o2 * 1)} ${mid + 96}C${f2(inX)} ${mid + 60} ${f2(f - o2 * 16)} ${mid + 30} ${f2(f - o2 * 14)} ${mid + 14}Z`;
      const xL = Math.min(inX, outX);
      let s2 = `<clipPath id="${clipId}"><path d="${d}"/></clipPath>`;
      s2 += `<path d="${d}" fill="#020a1c" opacity=".38" filter="url(#${ids.soft})" transform="translate(${2 * o2} 3)"/>`;
      s2 += `<g clip-path="url(#${clipId})"><rect x="${f2(xL - 30)}" y="${mid}" width="${dw + 60}" height="${DB - mid}" fill="${P.G}"/>`;
      if (!thumb) s2 += `<rect x="${f2(xL - 30)}" y="${mid}" width="${dw + 60}" height="${DB - mid}" fill="url(#${ids.flap})"/>`;
      // the selvedges follow the long edges: cream outside, Logo Blue inside
      s2 += `<path d="M${f2(f + o2 * 10)} ${mid + 6}C${f2(f + o2 * 40)} ${mid + 14} ${f2(outX - o2 * 4)} ${mid + 50} ${f2(outX)} ${mid + 96}L${f2(outX + o2 * 2)} ${DB}" stroke="${CREAM}" stroke-width="${C * 1.6}" fill="none"/>`;
      s2 += `<path d="M${f2(inX)} ${DB}L${f2(inX + o2 * 1)} ${mid + 96}C${f2(inX)} ${mid + 60} ${f2(f - o2 * 16)} ${mid + 30} ${f2(f - o2 * 14)} ${mid + 14}" stroke="${BLUE}" stroke-width="${C * 1.6}" fill="none"/>`;
      if (kind === "cast") {
        // the founder's cast-on (or a plain one): five rows above the fringe, 2026 across them
        const cy0 = DB - CAST.rows * CAST.ch;
        const founder = !!p.founder;
        s2 += `<rect x="${f2(xL - 2)}" y="${cy0}" width="${dw + 6}" height="${CAST.rows * CAST.ch}" fill="${founder ? CREAM : P.G}"/>`;
        if (founder) {
          const yr = word(String(p.founder), F35, 1);
          const yx = xL + (dw + 2 - bw(yr) * CAST.cw) / 2;
          s2 += `<g fill="${P.Y}">${bmpRects(yr, yx, cy0, CAST.cw, CAST.ch)}</g>`;
        }
        if (!thumb) s2 += `<rect x="${f2(xL - 2)}" y="${cy0}" width="${dw + 6}" height="${CAST.rows * CAST.ch}" fill="url(#${ids.cast})"/>`;
        if (!thumb) {
          let lp = "";
          for (let x = xL + 1; x < xL + dw + 2; x += CAST.cw) lp += `M${f2(x)} ${DB - 0.6}a2.2 1.8 0 0 0 4.4 0`;
          s2 += `<path d="${lp}" stroke="${founder ? "#A39A86" : P.Gdk}" stroke-width="1" fill="none"/>`;
        }
      } else {
        // the season so far: one raised ridge per gameweek played, beside the label
        for (let k = 0; k < PLAYED; k++) {
          const y = mid + 50 + k * 5.4;
          s2 += `<rect x="${f2(xL - 20)}" y="${f2(y)}" width="${dw + 40}" height="2.4" fill="#fff" opacity=".2"/><rect x="${f2(xL - 20)}" y="${f2(y + 2.4)}" width="${dw + 40}" height="1.6" fill="#000" opacity=".42"/>`;
        }
      }
      s2 += `<rect x="${f2(xL - 30)}" y="${mid}" width="${dw + 60}" height="${DB - mid}" fill="url(#${ids.curl})" opacity=".6"/></g>`;
      s2 += `<path d="${d}" fill="none" stroke="${P.Gdk}" stroke-width="1"/>`;
      if (kind === "label") {
        const lw = 98;
        const k = 1.28;
        const lh = labelLayout(lw, k, true, nm.onLabel).h;
        const lx = xL + (dw - lw) / 2 + o2 * 2;
        s2 += wovenLabel(p, o, f2(lx), f2(DB - 8 - lh), lw, k, thumb, ids, nm.onLabel, true);
      }
      let fr = "";
      for (let i = 0; i < TASSELS.LEGEND; i++) {
        const x = xL + (dw * (i + 0.5)) / TASSELS.LEGEND + o2 * 1.5;
        fr += tassel(x, DB - 3, 56 + rnd() * 8, 17, P, { rnd, knotted: true, hang: o2 * 2.5 });
      }
      return `<g class="c07-fringe">${fr}</g><g class="c07-end">${s2}</g>`;
    };
    // the forearms, in bench-jacket sleeves, rising from the bottom edge (lean inward toward the head)
    const forearm = (cx, side) => {
      const lean = -side * 62;
      const t = mid + 32;
      const d = `M${f2(cx - 25)} ${t}L${f2(cx + 25)} ${t}L${f2(cx + lean + 36)} ${H + 2}L${f2(cx + lean - 36)} ${H + 2}Z`;
      let a = `<path d="${d}" fill="#020a1c" opacity=".35" filter="url(#${ids.soft})" transform="translate(2 3)"/>`;
      a += `<path d="${d}" fill="url(#${ids.sleeve})"/>`;
      a += `<path d="M${f2(cx + side * 6)} ${t + 30}L${f2(cx + lean + side * 12)} ${H + 2}" stroke="${mix(SLEEVE, "#000000", 0.4)}" stroke-width="1.6"/>`;
      a += `<path d="M${f2(cx - side * 20)} ${t + 24}L${f2(cx + lean - side * 28)} ${H + 2}" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/>`;
      a += `<path d="${d}" fill="none" class="c07-rim" stroke-width="1.2"/>`;
      return a;
    };
    // two fists: four fingers curled round the gathered scarf, the thumb folded across them
    const fist = (cx, dir) => {
      let g2 = `<rect x="${cx - 14}" y="${mid + 10}" width="28" height="16" fill="${SKIN_DK}"/>`;
      g2 += `<rect x="${cx - 21}" y="${mid + 19}" width="42" height="15" rx="4" fill="url(#${ids.cuff})" stroke="${mix(SLEEVE, "#000000", 0.45)}" stroke-width="1"/>`;
      g2 += `<g filter="url(#${ids.soft})" opacity=".45" transform="translate(1.5 2.5)"><rect x="${cx - 19}" y="${mid - 19}" width="38" height="36" rx="11" fill="#020a1c"/></g>`;
      g2 += `<rect x="${cx - 19}" y="${mid - 12}" width="38" height="29" rx="10" fill="url(#${ids.fist})" stroke="${SKIN_DK}" stroke-width="1"/>`;
      for (let i = 0; i < 4; i++) {
        const fx = cx - 19 + i * 9.5;
        const ft = mid - 19 - (i === 1 || i === 2 ? 1 : 0);
        g2 += `<path d="M${f2(fx)} ${f2(mid + 1)}V${f2(ft + 5)}Q${f2(fx)} ${f2(ft)} ${f2(fx + 4.75)} ${f2(ft)}Q${f2(fx + 9.5)} ${f2(ft)} ${f2(fx + 9.5)} ${f2(ft + 5)}V${f2(mid + 1)}Z" fill="url(#${ids.fist})" stroke="${SKIN_DK}" stroke-width="1"/>`;
        g2 += `<path d="M${f2(fx + 2.6)} ${f2(ft + 3.2)}Q${f2(fx + 4.75)} ${f2(ft + 1.8)} ${f2(fx + 6.9)} ${f2(ft + 3.2)}" stroke="#fff" stroke-opacity=".4" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
        g2 += `<path d="M${f2(fx + 1.6)} ${f2(mid - 6)}Q${f2(fx + 4.75)} ${f2(mid - 4.4)} ${f2(fx + 7.9)} ${f2(mid - 6)}" stroke="${SKIN_DK}" stroke-width=".8" fill="none" opacity=".75"/>`;
      }
      const ix = cx - dir * 19;
      g2 += `<path d="M${ix} ${mid + 12}C${ix - dir * 2} ${mid + 4} ${ix + dir * 2} ${mid} ${ix + dir * 9} ${mid}H${ix + dir * 25}C${ix + dir * 30} ${mid} ${ix + dir * 30} ${mid + 8} ${ix + dir * 25} ${mid + 8}H${ix + dir * 12}C${ix + dir * 8} ${mid + 8} ${ix + dir * 6} ${mid + 11} ${ix + dir * 5} ${mid + 15}Z" fill="${SKIN}" stroke="${SKIN_DK}" stroke-width="1"/>`;
      g2 += `<path d="M${ix + dir * 12} ${mid + 2.2}H${ix + dir * 24}" stroke="#fff" stroke-opacity=".3" stroke-width="1.2" stroke-linecap="round"/>`;
      return `<g class="c07-fist" transform="translate(${cx} ${mid}) scale(1.5) rotate(${dir * 4}) translate(${-cx} ${-mid})">${g2}</g>`;
    };
    // the start end (label) hangs on the reading-start side; the cast-on end on the other
    const startSide = ar ? 1 : -1;
    const rim = `<path class="c07-rim" d="${outline}" fill="none" stroke-width="1.2"/>`;
    const svg =
      `<svg class="c07-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      `<g clip-path="url(#${ids.arms})"><g class="c07-fists">${forearm(fa, -1)}${forearm(fb, 1)}</g></g>` +
      `<g class="c07-raise">` +
      `<g class="c07-fabric" clip-path="url(#${ids.clip})">${fab}${folds}</g>` +
      rim +
      embSvg +
      `</g>` +
      `<g class="c07-fists">${drape(startSide, "label", ids.dA)}${drape(-startSide, "cast", ids.dB)}${fist(fa, -1)}${fist(fb, 1)}</g>` +
      `</svg>`;
    const cls = `c07 c07--legend${thumb ? " c07--thumb" : ""}${o.motion ? " c07--motion" : ""}${P.wool ? " c07--wool" : ""}`;
    return `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="LEGEND">${svg}</div>`;
  }

  function full(p, o = {}) {
    return p.tier === "LEGEND" ? fullLegend(p, o) : fullHanging(p, o);
  }

  /* ---------- token: a hanging segment (44–80px) and the integer-cell mini (24–32px) ---------- */
  function token(p, o = {}) {
    const s = Math.max(20, Math.round(o.size || 44));
    const mini = !!o.mini || s <= 32;
    const tier = p.tier;
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const P = palette(p);
    const label = `${MC.nameOf(p, o)}, ${p.ovr} ${S.ovr}, ${S.tiers[tier]}${p.founder ? ", " + S.founderLine : ""}`;
    const body = tier === "LEGEND" ? (mini ? miniLegend(p, P) : tokenLegend(p, P, s)) : mini ? miniHanging(p, P, tier, ar) : tokenHanging(p, P, tier, s, ar);
    const k = mini ? s / 24 : 1;
    const W = f2(body.w * k);
    const inner = ar && !body.noMirror ? `<g transform="matrix(-1 0 0 1 ${body.w} 0)">${body.art}</g>${body.digits}` : body.art + body.digits;
    return (
      `<span class="c07-tk c07-tk--${tier.toLowerCase()}${mini ? " c07-tk--mini" : ""}" role="img" aria-label="${esc(label)}" style="width:${W}px;height:${s}px">` +
      `<svg width="${W}" height="${s}" viewBox="0 0 ${body.w} ${body.h}" aria-hidden="true" focusable="false">${body.art && body.defs ? `<defs>${body.defs}</defs>` : ""}${inner}</svg></span>`
    );
  }
  /** Solid Changa 800 figures centred on (cx, cy), ink height h, never wider than maxW. */
  function solidDigits(ovr, cx, cy, h, fill, maxW) {
    let t = placeInk(String(ovr), CHANGA, cx, cy, h);
    if (maxW && t.w > maxW) t = placeInk(String(ovr), CHANGA, cx, cy, (h * maxW) / t.w);
    return `<text x="${t.x}" y="${t.y}" direction="ltr" class="c07-tk-ovr" font-size="${t.fs}" fill="${fill}">${ovr}</text>`;
  }
  /** Tassels as yarn ticks: ground yarn with a letter-yarn strand, so they read on both grounds. */
  function ticks(n, x0, x1, y, len, w, P, knotted) {
    let s = "";
    for (let i = 0; i < n; i++) {
      const x = f2(n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1));
      s += `<rect x="${f2(x - w / 2)}" y="${y}" width="${w}" height="${len}" fill="${P.G}" class="c07-tk-tassel"/>`;
      if (w >= 3) s += `<rect x="${f2(x - 0.5)}" y="${y}" width="1" height="${len}" fill="${P.L}" opacity=".85"/>`;
      if (knotted) s += `<rect x="${f2(x - w / 2 - 0.5)}" y="${y}" width="${f2(w + 1)}" height="${f2(Math.max(1, len * 0.22))}" fill="${P.Gdk}"/>`;
    }
    return s;
  }
  /** 44–80px: a hanging segment. Rail, the scarf's tail wrapped round it on the start side, the
      club-colour swatch with the 84, selvedges, the founder band and the tassels (the tier). Drawn
      in LTR units; the caller mirrors the art for Arabic, so the figures are placed for `ar`. */
  function tokenHanging(p, P, tier, s, ar) {
    const t = Math.max(3, Math.round(s * 0.075)); // rail
    const sw = Math.round(s * 0.6); // swatch
    const ohS = Math.max(8, Math.round(s * 0.2)); // start overhang: the tail hangs here
    const ohE = Math.max(6, Math.round(s * 0.15));
    const W = sw + ohS + ohE;
    const tl = Math.max(7, Math.round(s * 0.2)); // tassels
    const fb = p.founder ? Math.max(3, Math.round(s * 0.07)) : 0;
    const ry = Math.max(2, Math.round(s * 0.05));
    const sx = ohS;
    const st = ry - 1; // the swatch folds over the rail
    const sb = s - tl - 1; // swatch bottom
    const edge = Math.max(1, Math.round(s * 0.028));
    const ear = tier === "PRO" ? Math.max(4, Math.round(sw * 0.2)) : 0;
    let a = "";
    // rail
    a += `<rect x="0" y="${ry}" width="${W}" height="${t}" rx="${t / 2}" fill="#A9B2BE"/><rect x="1" y="${ry}" width="${W - 2}" height="${f2(t * 0.38)}" rx="${f2(t * 0.19)}" fill="#E6EBF0"/><rect x="0" y="${f2(ry + t - 1)}" width="${W}" height="1" fill="#4E5661"/>`;
    // swatch (PRO: the end corner dog-eared, the reverse showing)
    const sp = ear ? `M${sx} ${st}H${sx + sw}V${sb - ear}L${sx + sw - ear} ${sb}H${sx}Z` : `M${sx} ${st}H${sx + sw}V${sb}H${sx}Z`;
    a += `<path d="${sp}" fill="${P.G}" class="c07-tk-sw"/>`;
    // fold shading over the rail
    a += `<rect x="${sx}" y="${st}" width="${sw}" height="${f2(t * 0.6)}" fill="#fff" opacity=".14"/><rect x="${sx}" y="${f2(ry + t)}" width="${sw}" height="${Math.max(1, Math.round(t * 0.5))}" fill="#000" opacity=".22"/>`;
    // selvedges: cream at the start, Logo Blue at the end
    a += `<rect x="${sx}" y="${st}" width="${edge}" height="${sb - st}" fill="${CREAM}"/><rect x="${sx + sw - edge}" y="${st}" width="${edge}" height="${sb - st - ear}" fill="${BLUE}"/>`;
    const digitsBottom = sb - fb - Math.max(2, Math.round(s * 0.05));
    // founder: the cream cast-on band
    if (fb) a += `<rect x="${sx}" y="${sb - fb}" width="${sw - (ear ? ear * (fb / ear) : 0)}" height="${fb}" fill="${CREAM}" class="c07-tk-cast"/>`;
    if (ear) {
      const ex = sx + sw - ear;
      a += `<path d="M${ex} ${sb}L${sx + sw} ${sb - ear}L${ex} ${sb - ear}Z" fill="${P.L}"/><path d="M${ex} ${sb}L${sx + sw} ${sb - ear}" stroke="#020a1c" stroke-opacity=".4" stroke-width=".8"/>`;
    }
    // the knot: the scarf's own tail, wrapped round the rail and hanging down the overhang
    const tw = Math.max(3, Math.round(s * 0.12));
    const tx0 = f2(sx - Math.max(1.5, s * 0.035) - tw);
    const th = f2((sb - st) * 0.45);
    const te = Math.max(0.8, f2(tw * 0.22));
    a += `<rect x="${tx0}" y="${f2(ry + t - 0.5)}" width="${tw}" height="${th}" fill="${P.G}" class="c07-tk-sw"/>`;
    if (s >= 40) a += `<rect x="${tx0}" y="${f2(ry + t - 0.5)}" width="${te}" height="${th}" fill="${CREAM}"/><rect x="${f2(tx0 + tw - te)}" y="${f2(ry + t - 0.5)}" width="${te}" height="${th}" fill="${BLUE}"/>`;
    a += `<rect x="${f2(tx0 - 0.6)}" y="${f2(ry - 1)}" width="${f2(tw + 1.2)}" height="${t + 2}" rx="1" fill="${P.G}" stroke="${P.Gdk}" stroke-width=".6"/>`;
    // tassels: the count is the tier
    const n = TASSELS[tier];
    const tsw = Math.max(2, Math.round(s * 0.05));
    const mx = Math.max(tsw, Math.round(sw * 0.14));
    a += ticks(n, sx + mx, sx + sw - mx - (ear ? ear * 0.6 : 0), sb, tl, tsw, P, tier === "CHAMPION");
    // the 84 in solid Changa 800
    const top = ry + t + Math.max(2, Math.round(s * 0.04));
    const h = Math.min(Math.round((sw - 2 * edge - 4) * 0.62), digitsBottom - top - 1);
    const cx = sx + sw / 2;
    const d = solidDigits(p.ovr, ar ? W - cx : cx, (top + digitsBottom) / 2, h, P.L, sw - 2 * edge - 3);
    return { w: W, h: s, art: a, digits: d, defs: "" };
  }
  /** 24–32px: integer cells on a 22×24 grid, scaled whole. Rail, the tail (a 2×6 column), a 14-cell
      club-colour swatch with its Logo Blue end selvedge, the cream founder band, and 1-cell tassels
      counting the tier, snapped to whole cells. */
  function miniHanging(p, P, tier, ar) {
    const sb = p.founder ? 15 : 17;
    let a = "";
    a += `<rect x="0" y="1" width="22" height="2" rx="1" fill="#A9B2BE"/><rect x="0" y="2.5" width="22" height=".5" fill="#4E5661"/>`;
    a += `<rect x="4" y="0" width="14" height="${sb}" fill="${P.G}" class="c07-tk-sw"/><rect x="17" y="0" width="1" height="${sb}" fill="${BLUE}"/>`;
    if (p.founder) a += `<rect x="4" y="15" width="14" height="3" fill="${CREAM}" class="c07-tk-cast"/><rect x="17" y="15" width="1" height="3" fill="${BLUE}"/>`;
    // the tail, wrapped round the rail on the start side
    a += `<rect x="1" y="0" width="2" height="6" fill="${P.G}" class="c07-tk-sw"/>`;
    const n = TASSELS[tier];
    const xs = { 2: [7, 15], 3: [6, 11, 16], 4: [5, 9, 13, 17], 5: [5, 8, 11, 14, 17] }[n];
    for (const x of xs) a += `<rect x="${x}" y="18" width="1" height="5" fill="${P.G}" class="c07-tk-tassel"/>`;
    // the 84, centred on the swatch between the rail and the founder band (or the swatch foot)
    const cx = ar ? 22 - 10.5 : 10.5;
    const d = solidDigits(p.ovr, cx, (3 + sb) / 2, 9, P.L, 12.4);
    return { w: 22, h: 24, art: a, digits: d, defs: "" };
  }
  function tokenLegend(p, P, s) {
    // raised: a horizontal swatch held by two fists, arms from below, fringe beyond each fist
    const bh = Math.round(s * 0.44);
    const fw = Math.max(4, Math.round(s * 0.15)); // fist width
    const sw = Math.round(s * 1.05);
    const fr = Math.max(4, Math.round(s * 0.12));
    const W = sw + 2 * fr;
    const by = Math.round(s * 0.06);
    const sx = fr;
    const edge = Math.max(1, Math.round(s * 0.028));
    let a = "";
    // fringe hanging from both ends
    const tl = Math.round(s * 0.3);
    for (const [x, dir] of [
      [sx, -1],
      [sx + sw, 1],
    ])
      for (let i = 0; i < 3; i++) {
        const y = by + bh * (0.2 + i * 0.3);
        a += `<path d="M${x} ${f2(y)}q${f2(dir * fr * 0.7)} ${f2(tl * 0.3)} ${f2(dir * fr * 0.8)} ${tl}" stroke="${P.G}" stroke-width="${Math.max(1.5, Math.round(s * 0.04))}" fill="none" class="c07-tk-tassel-s"/>`;
      }
    a += `<rect x="${sx}" y="${by}" width="${sw}" height="${bh}" rx="${f2(edge)}" fill="${P.G}" class="c07-tk-sw"/>`;
    a += `<rect x="${sx}" y="${by}" width="${sw}" height="${edge}" fill="${CREAM}"/><rect x="${sx}" y="${by + bh - edge}" width="${sw}" height="${edge}" fill="${BLUE}"/>`;
    // founder: the cast-on as a cream band across the scarf near its end
    if (p.founder) a += `<rect x="${sx + sw - fw - Math.max(3, Math.round(s * 0.07)) - 1}" y="${by}" width="${Math.max(3, Math.round(s * 0.07))}" height="${bh}" fill="${CREAM}" class="c07-tk-cast"/>`;
    // arms and fists
    for (const [cx, dir] of [
      [sx + fw * 0.7, -1],
      [sx + sw - fw * 0.7, 1],
    ]) {
      a += `<path d="M${f2(cx - fw * 0.42)} ${f2(by + bh * 0.62)}L${f2(cx + fw * 0.42)} ${f2(by + bh * 0.62)}L${f2(cx + fw * 0.55 + dir * s * 0.05)} ${s}L${f2(cx - fw * 0.55 + dir * s * 0.05)} ${s}Z" fill="${SLEEVE}" class="c07-tk-arm"/>`;
      a += `<rect x="${f2(cx - fw * 0.5)}" y="${f2(by + bh * 0.62)}" width="${fw}" height="${f2(Math.max(2, s * 0.05))}" fill="${SLEEVE_LT}"/>`;
      a += `<rect x="${f2(cx - fw / 2)}" y="${f2(by + bh * 0.08)}" width="${fw}" height="${f2(bh * 0.6)}" rx="${f2(fw * 0.32)}" fill="${SKIN}" stroke="${SKIN_DK}" stroke-width="${s >= 56 ? 1 : 0.6}"/>`;
    }
    const d = solidDigits(p.ovr, sx + sw / 2 - (p.founder ? s * 0.03 : 0), by + bh / 2, Math.round(bh * 0.56), P.L);
    return { w: W, h: s, art: a, digits: d, defs: "" };
  }
  function miniLegend(p, P) {
    // the swatch turns horizontal (24×12), fists at both ends, arms down: the outline change
    let a = "";
    a += `<rect x="0" y="5" width="24" height="11" fill="${P.G}" class="c07-tk-sw"/><rect x="0" y="5" width="24" height="1" fill="${CREAM}"/><rect x="0" y="15" width="24" height="1" fill="${BLUE}"/>`;
    if (p.founder) a += `<rect x="18" y="5" width="2" height="11" fill="${CREAM}" class="c07-tk-cast"/>`;
    for (const [x, dir] of [
      [1.5, -1],
      [22.5, 1],
    ]) {
      a += `<path d="M${x - 1.5} 13L${x + 1.5} 13L${x + 1.5 + dir} 24L${x - 1.5 + dir} 24Z" fill="${SLEEVE}" class="c07-tk-arm"/>`;
      a += `<rect x="${x - 1.8}" y="6.5" width="3.6" height="6.5" rx="1.2" fill="${SKIN}"/>`;
    }
    const d = solidDigits(p.ovr, p.founder ? 10.5 : 12, 10.5, 6.6, P.L);
    return { w: 24, h: 24, art: a, digits: d, defs: "", noMirror: false };
  }

  /* ---------- row: the "My position" card, your scarf on a stretch of barrier ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const tier = p.tier;
    const tk = token(p, { ...o, size: 56, mini: false });
    const sub = `${esc(S.tiers[tier])}${p.founder ? ` <span class="c07-row-founder">${o.lang === "ar" ? `${esc(S.founder)} ${MC.ltr(p.founder)}` : esc(S.founderLine)}</span>` : ""}`;
    return (
      `<div class="c07-row c07-row--${tier.toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}">` +
      `<span class="c07-row-rail" aria-hidden="true"></span>` +
      `<span class="c07-row-rank">${MC.ltr(o.rank)}</span>` +
      `<span class="c07-row-token">${tk}</span>` +
      `<span class="c07-row-name"><b>${esc(MC.nameOf(p, o))}</b><small>${sub}</small></span>` +
      `<span class="c07-row-pts">${MC.ltr(o.pts)}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- share: "Sur la barrière", the scarf knotted on a barrier rail at night ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid(PFX + "s");
    const railY = 92;
    const card = full(p, { ...o, motion: false, thumb: false, _noRail: true });
    const vb = (card.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/) || [0, VW, 600]).map(Number);
    const legend = p.tier === "LEGEND";
    // the whole scarf, fringe included, between the rail and the frame's foot
    const k = legend ? 336 / vb[1] : Math.min(0.98, (634 - railY) / (vb[2] - (RAIL_Y + RAIL_H / 2)));
    const sw = Math.round(vb[1] * k);
    const top = legend ? 150 : f2(railY - (RAIL_Y + RAIL_H / 2) * k);
    const bg =
      `<svg class="c07-sh-bg" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true">` +
      `<defs>` +
      `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080F"/><stop offset=".4" stop-color="#0A1220"/><stop offset="1" stop-color="#04070D"/></linearGradient>` +
      `<radialGradient id="${u}-fl" cx="${ar ? 0.12 : 0.88}" cy=".02" r=".75"><stop offset="0" stop-color="#EAF2FF" stop-opacity=".46"/><stop offset=".2" stop-color="#9DB8E6" stop-opacity=".16"/><stop offset=".6" stop-color="#2A3F66" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${u}-pitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E2416" stop-opacity="0"/><stop offset=".25" stop-color="#173A22"/><stop offset=".7" stop-color="#1F4A2B"/><stop offset="1" stop-color="#0B1A10"/></linearGradient>` +
      `<filter id="${u}-bl" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="9"/></filter>` +
      steelGrad(u + "-st") +
      `<linearGradient id="${u}-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4E5661"/><stop offset=".4" stop-color="#C6CDD6"/><stop offset="1" stop-color="#5E6876"/></linearGradient>` +
      `</defs>` +
      `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
      // the pitch beyond, out of focus: mown bands and a touchline
      `<g filter="url(#${u}-bl)" opacity=".9"><rect x="-20" y="290" width="400" height="260" fill="url(#${u}-pitch)"/>` +
      `<path d="M-20 352H380M-20 424H380M-20 500H380" stroke="#2C6239" stroke-width="22" opacity=".45"/><path d="M-20 308H380" stroke="#DDE8DF" stroke-width="3" opacity=".5"/></g>` +
      // the floodlight's glow
      `<rect width="360" height="640" fill="url(#${u}-fl)"/>` +
      `<g filter="url(#${u}-bl)" opacity=".3"><ellipse cx="${ar ? 30 : 330}" cy="-6" rx="70" ry="18" fill="#F4F8FF"/></g>` +
      // the crowd barrier: top rail, uprights, a lower rail behind the scarf
      (legend
        ? ""
        : `<rect x="${ar ? 360 - 8 - sw - 16 : 8 + sw + 9}" y="${railY}" width="7" height="560" fill="url(#${u}-post)"/>` +
          `<rect x="0" y="${railY + 270}" width="360" height="9" rx="4.5" fill="url(#${u}-st)" opacity=".7"/>` +
          `<rect x="0" y="${railY - 6}" width="360" height="12" rx="6" fill="url(#${u}-st)"/>` +
          `<path d="M0 ${railY - 3}H360" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>`) +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "light", w: "100%" });
    const cap = ar ? ["موسمي", "صفًّا بعد صف"] : ["Ma saison,", "rang par rang"];
    const yr = p.founder ? `·${String(p.founder).slice(-2)}` : "";
    return (
      `<div class="c07-share${legend ? " c07-share--legend" : ""}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c07-sh-logo">${logo}</div>` +
      `<p class="c07-sh-cap">${cap.map((l) => `<span>${esc(l)}</span>`).join("")}</p>` +
      `<div class="c07-sh-scarf" style="top:${top}px;${ar ? "right" : "left"}:${legend ? 12 : 8}px;width:${sw}px">${card}</div>` +
      `<div class="c07-sh-id"><b class="c07-sh-name">${esc(MC.nameOf(p, o))} <span dir="ltr">${esc(yr)}</span></b>` +
      `<span class="c07-sh-tier">${esc(S.tiers[p.tier])}</span>` +
      `<span class="c07-sh-sub"><span dir="ltr">@ali</span> · ${ar ? "مثال" : "Exemple"}</span></div>` +
      `</div>`
    );
  }

  /* ---------- the sway: drag the scarf and it swings from the rail ---------- */
  function mount(el) {
    if (!el || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const g = el.querySelector(".c07-sway");
    if (!g) return;
    let a = 0;
    let v = 0;
    let lastX = null;
    let raf = 0;
    const step = () => {
      v += -a * 0.06;
      v *= 0.9;
      a += v;
      g.setAttribute("transform", `rotate(${f2(a)} ${VW / 2} ${RAIL_Y + RAIL_H / 2})`);
      if (Math.abs(a) > 0.02 || Math.abs(v) > 0.02) raf = requestAnimationFrame(step);
      else {
        g.removeAttribute("transform");
        raf = 0;
      }
    };
    el.addEventListener("pointermove", (e) => {
      if (lastX !== null) v += Math.max(-0.5, Math.min(0.5, (e.clientX - lastX) * -0.02));
      lastX = e.clientX;
      if (!raf) raf = requestAnimationFrame(step);
    });
    el.addEventListener("pointerleave", () => (lastX = null));
  }

  const c = {
    id: "c07",
    n: 7,
    slug: "07",
    name: "Écharpe",
    nameAr: "الوشاح",
    category: "youth",
    philosophy: "Your card is your supporter's scarf, knotted over the barrier rail: the 84 at the top in your club's colours, and below it only the gameweeks you have actually played, so the scarf grows with your season.",
    philosophyAr: "بطاقتك وشاحُ المشجّع معقودًا على حاجز المدرّج: الرقم 84 في أعلاه بألوان ناديك، وتحته الجولات التي لعبتها فعلًا فقط، فيطول الوشاح مع موسمك.",
    idea: [
      "The card is a knitted supporter scarf knotted over a steel crowd-barrier rail. The silhouette is the rail overhanging both sides, the knot on the inline-start side (a bundle tied with a strip of the same knit, its two cream selvedges showing), the strip, and the fringe at the foot. A cream selvedge runs down the start edge and a Logo Blue one down the end edge: that blue column is the one fixed brand place. The ground is the user's club primary and the letters its secondary; the lab's placeholder club gives a slate ground (#3b4a5e) with cream letters (#e9e4d6). With no club chosen, the scarf is undyed wool (#E8E1D0) with charcoal letters.",
      "It reads from the rail down. The 84 is knitted big at the top, the part that hangs in front of you, sampled from Changa 800 at the tier's own gauge and condensed until it sits inside the selvedges. There is no OVR in the artwork; the accessible label carries '84 OVR'. The tier word is knitted under it.",
      "Then the season: one band of two rows per gameweek actually played, all in the ground yarn, told apart by stitch alone: garter ridges, then 1×1 rib, alternating, with a raised purl ridge closing every band, the rib bands pulling the edges in slightly, and a cream notch on the start selvedge every fifth gameweek. Unplayed gameweeks are not knitted and there is never an empty row, so the scarf is as long as the season so far. The sample has seven bands, labelled 'J.01–J.07 · Exemple' on the label.",
      "Below the season, the name is knitted in Changa 800, letter-spaced so the letters never fuse. Under it is the woven label sewn on the front: the BotolaGO wordmark (colour version, unmodified), the four ratings in a column (Manrope 800, tabular), and BOT #004821, MOROCCO and 2026/27 woven into its foot. Last come the founder's cream cable cast-on with 2026, and the fringe.",
      "Every motif is rasterised once by canvas onto a stitch grid and drawn as merged colour runs, under one stitch-texture pattern per gauge. The fold over the tube, the edge curl and the fibre grain appear at full size only. Tokens and rows use flat yarn fields and solid figures, with no filters.",
    ],
    belonging: [
      "The body of the scarf is the season you actually played, so no two scarves are alike and nothing is invented: bands count gameweeks played, never points. You watch your scarf grow every week.",
      "Status lives in the knit itself. It runs from a chunky hand-knitted garter scarf at HOMA, through machine jacquard and double-face, to the finest gauge at CHAMPION. At LEGEND you lift it off the rail and hold it up. The tassels count the tier, so friends compare at a glance in any leaderboard: two, three, four, five.",
      "It has a seasonal ritual. At season end the scarf is cast off and goes in the drawer, and next season you knot a new one. A collection is your seasons, and their lengths show how faithful you were.",
      "It is screenshot-worthy as an object rather than a number badge. The share image hangs it on a barrier at night with the pitch blurred beyond, and a league of scarves on one rail is a picture fans already take at every stadium.",
    ],
    founderMark: [
      "The cast-on: the first five rows ever knitted, just above the fringe, are cream, with two cable twists flanking 2026 knitted in the darker club yarn. They keep the same gauge at every tier and form the bright band at the scarf's foot, readable at arm's length.",
      "The year is never knitted next to the name. The woven label always sits between the knitted name and the cast-on, so the scarf never shows the supporter-group 'name + year' lockup. Written forms elsewhere use 'ALI ·26' (the share image) or 'FOUNDER 2026' (the row).",
      "Non-founders cast on plain, in the ground yarn, with no year.",
      "At 24px the founder mark is a 3px cream band above the tassels, edged on the light ground so it reads as knit and not as a gap. At LEGEND it becomes a vertical cream band near the end of the raised scarf.",
      "Ceremony 'la première maille' (motion on, replayable): the five cast-on rows knit across in turn, 120ms each, and the cables then appear. The 84 stays visible throughout; reduced motion shows the finished state.",
    ],
    small: [
      "44–80px token: a hanging segment. It has a steel rail with an overhang, the knot bump on the start side, and a club-colour swatch carrying the 84 in solid Changa 800. The swatch has a cream start selvedge and a Logo Blue end selvedge, the cream cast-on band for founders, and the tassels: two, three or four, five knotted at CHAMPION. PRO keeps its dog-eared corner. Flat fields only, with no textures or filters.",
      "24–32px mini, as it leads the name cell of the ranking card: an integer 22×24 grid scaled whole. It has a 2px rail, the knot bump, a 14px club-colour swatch with the 84 in Changa 800, a 3px cream founder band and 1px tassels counting the tier. LEGEND turns horizontal (24×11), held by two fists with arms below: the outline change.",
      "Row (the 'My position' card): the steel rail runs along the top of the card and the 56px token hangs from it. Beside it are the name in Changa 800, the tier with FOUNDER 2026, and the points. Five rows read as stretches of barrier, each with its scarf.",
    ],
    rtl: [
      "The scarf is a textile with no logo rule, so the layout mirrors. The knot moves to the right; the Logo Blue selvedge goes to the left edge; the cream selvedge and the fifth-gameweek notches go to the right; PRO's dog-ear moves to the bottom left. At LEGEND the reading order reverses, with the name at the right. The BotolaGO wordmark stays Latin and unmirrored.",
      "علي is sampled from Changa 800 at 9 stitch rows. Its final yā is knitted without dots and the two dots are hand-placed as single stitch cells, so it never reads as على.",
      "The Arabic tier word is satin-stitch embroidery over the knit (a thread hatch with a split-stitch outline), because Arabic does not hold at 7 stitch rows.",
      "The label is set in Noto Sans Arabic 700, right-aligned, with المغرب in its foot. Knitted figures and every number stay left-to-right, and there is no letter-spacing on Arabic.",
    ],
    tiers: {
      HOMA: "Hand-knitted chunky garter (8u stitches, 24 across) in continuous horizontal ridges: new yarn, even tension, a clean outline. The 84 is a hand-charted 5×7 bitmap (each pixel two stitches by two rows) and the word HOMA is hand-charted too. The season alternates stockinette and rib. Full silhouette, 2 tassels.",
      STADE: "Machine jacquard at 32 stitches with flat, shallow stitches. The 84 is sampled from Changa 800 at 18 rows and the word STADE at 7. 3 tassels.",
      PRO: "Double-face jacquard with plump stitches and the 84 at 18 rows. The bottom inline-end corner is dog-eared, showing the reverse face with its colours swapped, which changes the outline. 4 tassels.",
      CHAMPION: "The finest gauge (4×5u, 48 stitches across): the 84 is sampled at 22 rows and gains its curves, and CHAMPION is hand-charted on 10 rows. 5 knotted tassels.",
      LEGEND: "'Écharpe levée': lifted off the rail and held taut overhead between two fists in bench-jacket cuffs, so the card turns landscape. Heaviest gauge (9u stitches). It reads along the length: the name, the 84, the season as vertical bands, then the label (ratings 2×2, the tier word woven beside the brand). The cast-on is turned with the scarf, so 2026 reads upward. The ends drape down beside the wrists with the longest hand-knotted fringe. No gold, satin or lurex.",
    },
    legend: [
      "The outline changes from hanging (rail, strip, fringe) to raised (a band held by two fists, arms from below). It is visible at 24px, where the mini turns into a horizontal swatch with two fists.",
      "The moment (motion on, replayable, the 84 visible throughout): the fists come up from below, the scarf lifts and settles taut in 420ms, and the fringe swings once. Reduced motion shows the raised final state.",
      "Its richness comes from the object's own physics: the heaviest gauge, the ridged gameweek bands, the long knotted fringe and the gesture itself. There is no precious metal anywhere.",
    ],
    advantages: [
      "It is the supporter's own object, in your club's colours. Nothing about it reads as FUT, Sorare, an NFT or a bank card.",
      "Honest history: the body is the gameweeks you played, so it grows with the season and every scarf is different.",
      "The tier ladder is the knit and the tassel count, built from the object's own parts. It reads down to 24px on both grounds.",
      "LEGEND is the stadium gesture of raising your scarf: unmistakably Moroccan terrace culture without slogans, flags or zellige.",
      "The ratings are always on the front (the woven label), and the ID has a physical carrier woven into the label's foot.",
    ],
    risks: [
      "It sits close to ultras culture: no slogans or group-like names ever, the year is never knitted beside the name, and free-text names would need moderation.",
      "The card's height changes through the season: about 1:2.5 at J.07 (1:2.7 for HOMA's chunky gauge) and about 1:3.7 by J.30. The landscape LEGEND is about 3.8:1, so in a fixed-width slot it is small: at 360px wide it is about 94px tall, and its label figures are 7–8px.",
      "Knitted type limits names. Nine letters or more knit only the initial, with the full name on the label. Arabic names other than علي are sampled the same way but were not hand-checked.",
      "At 24px it is a pixel badge. The knot reads as a knot only from about 44px; below that it is a bump.",
      "The placeholder club colour is a slate close to navy. Real club colours will change the whole look, and they need contrast rules (and red with green only when the club's own data says so).",
      "Scarves overlap the empty-leagues and season-prize art, which needs the owner's sign-off. The fists use the shared avatar's single skin tone.",
      "Not built yet: the league share 'Le mur des écharpes', the band that knits on at gameweek close, long-press on the label, and the multi-segment sway (the drag sway is a single pendulum from the rail). The share's knitted 84 is about 15% of the frame height, short of the 18% target.",
      "The Arabic strings (embroidered tier words, مثال, the caption) need MSA review.",
    ],
    gridWidth: 150,
    detailWidth: 260,
    full,
    token,
    row,
    share,
    mount,
  };
  MC.register(c);
})();
