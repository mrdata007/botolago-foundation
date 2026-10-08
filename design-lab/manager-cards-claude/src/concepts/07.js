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
  const SLEEVE = "#1d2f4a"; // the shared avatar's bench jacket
  const SLEEVE_LT = "#34507a";
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
  const LABEL_H = 128;
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
  // HOMA's hand-knitted figures: a 5×7 bitmap, each pixel two stitches by two rows
  const F57 = {
    0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    3: ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
    4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    9: [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  };
  // hand-charted tier words on 5 rows, variable width (an M needs five stitches to be an M)
  const F5H = {
    H: ["#..#", "#..#", "####", "#..#", "#..#"],
    O: [".##.", "#..#", "#..#", "#..#", ".##."],
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    A: [".##.", "#..#", "####", "#..#", "#..#"],
    C: [".##", "#..", "#..", "#..", ".##"],
    P: ["###.", "#..#", "###.", "#...", "#..."],
    I: ["###", ".#.", ".#.", ".#.", "###"],
    N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
    " ": ["..", "..", "..", "..", ".."],
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
  /** The 84: HOMA's hand-charted 5×7 bitmap; otherwise Changa 800 sampled at the tier's own
      resolution, condensed until it sits inside the selvedges with a margin. */
  function digitArt(ovr, tier, G, cols, hU) {
    const s2 = String(ovr);
    if (tier === "HOMA") return scaleBmp(word(s2, F57, 1), 2, 2);
    const rows = Math.round((hU || (s2.length > 2 ? 86 : 108)) / G.ch);
    const max = cols - 2 - 2 * Math.ceil(14 / G.cw);
    let b = null;
    for (let sq = 1; sq >= 0.66; sq -= 0.04) {
      b = trim(rasterText(s2, CHANGA, rows, G.cw, G.ch, 0.46, { sq: f2(sq), ls: "0.02em" }));
      if (bw(b) <= max) break;
    }
    return b;
  }
  /** The tier word (Latin): sampled from Changa at 7 rows where it fits (STADE, PRO);
      hand-charted on 5 rows for HOMA and for CHAMPION's eight letters (doubled rows). */
  function tierWordArt(tier, G, cols) {
    if (tier === "HOMA") return word("HOMA", F5H, 1);
    if (tier === "CHAMPION") return scaleBmp(word("CHAMPION", F5H, 1), 1, 2);
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
      // garter: horizontal ridges in brick bond
      const bumps = [
        [w / 2, h * 0.27],
        [0, h * 0.77],
        [w, h * 0.77],
      ];
      const rx = w * 0.47;
      const ry = h * 0.24;
      const ell = (cx, cy) => `M${f2(cx - rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx + rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx - rx)} ${f2(cy)}Z`;
      return (
        grad +
        `<pattern id="${id}" width="${f2(w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${tf}>` +
        `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${bumps.map(([x, y]) => ell(x, y)).join("")}" fill="${gapC}" fill-opacity="${gapO}" fill-rule="evenodd"/>` +
        bumps.map(([x, y]) => `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="url(#${gid})"/>`).join("") +
        `</pattern>`
      );
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

  /** The woven label sewn on the front: the brand header, the four ratings, the ID's carrier.
      mode "tall" (hanging tiers): a column of four lines. mode "wide" (LEGEND): a 2×2 grid, set larger. */
  function wovenLabel(p, o, x, y, w, h, mode, thumb, ids, nameOnLabel) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const wide = mode === "wide";
    const pad = wide ? 11 : 9;
    const L = x + pad;
    const R = x + w - pad;
    let s = "";
    // sewn: a soft shadow, the satin, a woven border, the sewing stitches at the edges
    s += `<rect x="${f2(x + 0.8)}" y="${f2(y + 1.6)}" width="${w}" height="${h}" fill="#020a1c" opacity=".35" filter="url(#${ids.soft})"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${SATIN}"/>`;
    if (!thumb) s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ids.weave})"/>`;
    s += `<rect x="${f2(x + 0.5)}" y="${f2(y + 0.5)}" width="${w - 1}" height="${h - 1}" fill="none" stroke="${SATIN_EDGE}" stroke-width="1"/>`;
    s += `<rect x="${f2(x + 3)}" y="${f2(y + 3)}" width="${w - 6}" height="${h - 6}" fill="none" stroke="#8A8170" stroke-width=".7" stroke-dasharray="2.2 1.6" opacity=".55"/>`;
    // header: the BotolaGO wordmark, unmodified (colour variant on the satin)
    const lw = wide ? 66 : Math.min(w - 2 * pad, 62);
    const lh = lw / MC.LOGO_RATIO.wordmark;
    const lx = ar ? R - lw : L;
    s += MC.logo("wordmark", { variant: "color", w: f2(lw), h: f2(lh), label: false }).replace("<svg ", `<svg x="${f2(lx)}" y="${f2(y + 9)}" `);
    const rule = (yy) => `<path d="M${f2(L)} ${f2(yy)}H${f2(R)}" stroke="${SATIN_EDGE}" stroke-width=".8"/>`;
    const ruleY = y + 9 + lh + 6;
    s += rule(ruleY);
    const tx = (xx, yy, str, anchor, cls, fs, dir = "ltr") =>
      `<text x="${f2(xx)}" y="${f2(yy)}" text-anchor="${anchor}" direction="${dir}" font-size="${fs}" class="c07-lb ${cls}">${esc(str)}</text>`;
    if (wide && !thumb) s += tx(ar ? L : R, y + 9 + lh - 1, S.tiers[p.tier], "end", "c07-lb-tier" + (ar ? " c07-lb-ar" : ""), ar ? 12 : 10.5, ar ? "rtl" : "ltr");
    const footY = y + h - (wide ? 26 : 33);
    if (thumb) {
      for (let i = 0; i < 4; i++) {
        const yy = ruleY + 6 + i * ((footY - ruleY - 10) / 4);
        s += `<rect x="${f2(ar ? R - 30 : L)}" y="${f2(yy + 2)}" width="30" height="6" fill="${LABEL_SOFT}" opacity=".5"/><rect x="${f2(ar ? L : R - 16)}" y="${f2(yy)}" width="16" height="9" fill="${LABEL_INK}" opacity=".7"/>`;
      }
      return s;
    }
    // the four ratings
    if (wide) {
      const colW = (R - L) / 2;
      MC.STATS.forEach((key, i) => {
        const cx = ar ? R - colW * (i % 2) : L + colW * (i % 2);
        const yy = ruleY + 26 + Math.floor(i / 2) * 27;
        if (ar) {
          s += tx(cx, yy, S.stats[key], "start", "c07-lb-k c07-lb-ar", 10.5, "rtl");
          s += tx(cx - colW + 6, yy, String(p.stats[key]), "start", "c07-lb-v", 21);
        } else {
          s += tx(cx, yy, S.stats[key], "start", "c07-lb-k", 10);
          s += tx(cx + colW - 8, yy, String(p.stats[key]), "end", "c07-lb-v", 22);
        }
      });
    } else {
      const step = (footY - 8 - ruleY - 4) / 4;
      MC.STATS.forEach((key, i) => {
        const yy = ruleY + 4 + step * (i + 1) - 2;
        if (ar) {
          s += tx(R, yy, S.stats[key], "start", "c07-lb-k c07-lb-ar", 11.5, "rtl");
          s += tx(L, yy, String(p.stats[key]), "start", "c07-lb-v", 13);
        } else {
          s += tx(L, yy, S.stats[key], "start", "c07-lb-k", 10.5);
          s += tx(R, yy, String(p.stats[key]), "end", "c07-lb-v", 13);
        }
      });
    }
    s += rule(footY - 8);
    // the ID's physical carrier: woven into the label's foot, with the season and the country
    const f1 = footY + 3;
    const f2y = footY + 13;
    const f3 = footY + 22;
    const mfs = wide ? 8.6 : 8;
    // an RTL string anchored at the left edge ends there ("end"); at the right edge it starts there
    const note = ar ? "مثال · J.01–J.07" : "J.01–J.07 · Exemple";
    if (wide) {
      if (ar) {
        s += tx(R, f1, p.id, "end", "c07-lb-meta", mfs);
        s += tx(L, f1, p.season, "start", "c07-lb-meta", mfs);
        s += tx(R, f2y, S.country, "start", "c07-lb-meta c07-lb-ar", mfs + 0.6, "rtl");
        s += tx(L, f2y, note, "end", "c07-lb-note c07-lb-ar", 7, "rtl");
      } else {
        s += tx(L, f1, p.id, "start", "c07-lb-meta", mfs);
        s += tx(R, f1, p.season, "end", "c07-lb-meta", mfs);
        s += tx(L, f2y, S.country, "start", "c07-lb-meta", mfs);
        s += tx(R, f2y, note, "end", "c07-lb-note", 6.8);
      }
    } else if (ar) {
      s += tx(R, f1, p.id, "end", "c07-lb-meta", mfs);
      s += tx(R, f2y, S.country, "start", "c07-lb-meta c07-lb-ar", mfs + 0.6, "rtl");
      s += tx(L, f2y, p.season, "start", "c07-lb-meta", mfs);
      s += tx(R, f3, note, "start", "c07-lb-note c07-lb-ar", 7, "rtl");
    } else {
      s += tx(L, f1, p.id, "start", "c07-lb-meta", mfs);
      s += tx(L, f2y, S.country, "start", "c07-lb-meta", mfs);
      s += tx(R, f2y, p.season, "end", "c07-lb-meta", mfs);
      s += tx(L, f3, note, "start", "c07-lb-note", 6.6);
    }
    if (nameOnLabel) s += tx(ar ? R : L, y + h - 3, MC.nameOf(p, o), "start", "c07-lb-meta" + (ar ? " c07-lb-ar" : ""), 8, ar ? "rtl" : "ltr");
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
    const ids = { base: u + "-pb", rib: u + "-pr", ridge: u + "-rg", cast: u + "-pc", knot: u + "-pk", clip: u + "-cl", curl: u + "-cu", fold: u + "-fo", grain: u + "-gr", soft: u + "-sf", weave: u + "-wv", rail: u + "-rl", knotG: u + "-kg", emb: u + "-em", embSh: u + "-es", ear: u + "-ea" };
    const cols = FW / G.cw;
    const sc = ar ? cols - 1 : 0; // cream selvedge (inline start)
    const ec = ar ? 0 : cols - 1; // Logo Blue selvedge (inline end)
    const rowsOf = (v) => Math.max(1, Math.round(v / G.ch));

    // motifs
    const dg = digitArt(p.ovr, tier, G, cols);
    const wd = ar ? null : tierWordArt(tier, G, cols);
    const nm = nameArt(p, o, G, cols);
    // rows, from the rail down
    const L = {};
    let r = rowsOf(46 - FT);
    L.digits = r;
    r += dg.length;
    r += rowsOf(10);
    L.word = r;
    const wRows = wd ? wd.length : rowsOf(40);
    r += wRows;
    r += rowsOf(14);
    L.season = r;
    const bandRows = 2;
    r += PLAYED * bandRows;
    r += rowsOf(14);
    // the name sits above the label, so the label always stands between the name and the
    // founder year: never the supporter-group "name + year" lockup
    L.name = r;
    r += nm.bmp.length;
    r += rowsOf(14);
    L.label = r;
    const lh = LABEL_H + (nm.onLabel ? 10 : 0);
    r += Math.ceil(lh / G.ch);
    r += rowsOf(12);
    L.rows = r;
    const yOf = (row) => FT + row * G.ch;
    const yFab = yOf(L.rows); // fabric bottom = cast-on top
    const yCast = yFab + CAST.rows * CAST.ch;
    const fringeLen = { HOMA: 32, STADE: 34, PRO: 36, CHAMPION: 40 }[tier];
    const H = Math.ceil(yCast + fringeLen + 8);

    // the grid
    const g = grid(cols, L.rows, "G");
    const centre = (bmp) => Math.round((cols - bw(bmp)) / 2);
    stamp(g, dg, centre(dg), L.digits, "L");
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
    let defs =
      stitchPattern(ids.base, base) +
      stitchPattern(ids.rib, rib) +
      `<pattern id="${ids.ridge}" width="${G.cw}" height="4" patternUnits="userSpaceOnUse" y="${FT}"><rect y="2.6" width="${G.cw}" height="1.4" fill="#000" opacity=".34"/><ellipse cx="${G.cw / 2}" cy="1.7" rx="${f2(G.cw * 0.47)}" ry="1.5" fill="#fff" opacity=".2"/><rect width="${G.cw}" height=".6" fill="#000" opacity=".18"/></pattern>` +
      stitchPattern(ids.cast, { cw: CAST.cw, ch: CAST.ch, kind: "v", gap: 0.18, leg: 0.3 }, { gapC: "#5A4E36" }) +
      stitchPattern(ids.knot, { ...G, kind: "v" }, { transform: "rotate(-28)" }) +
      steelGrad(ids.rail) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".06" stop-color="#000" stop-opacity=".06"/>` +
      `<stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>` +
      // the fold over the tube: lit on top, a shadow where the scarf turns down
      `<linearGradient id="${ids.fold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".22" stop-color="#fff" stop-opacity=".08"/>` +
      `<stop offset=".5" stop-color="#000" stop-opacity=".22"/><stop offset=".72" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<radialGradient id="${ids.knotG}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>` +
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
    let yy = FT;
    for (const b of bands.slice().sort((a, c) => a.y0 - c.y0)) {
      if (!b.rib) continue;
      segs.push([yy, b.y0, ids.base], [b.y0, b.y1, ids.rib]);
      yy = b.y1;
    }
    segs.push([yy, yFab, ids.base]);
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
    const knot = knotSvg(P, ids, ar, thumb);
    const rim = `<path class="c07-rim" d="${outline}" fill="none" stroke-width="1"/>`;

    // Arabic tier word: satin-stitch embroidery over the knit (a stitch grid cannot hold its curves)
    let emb = "";
    if (ar) {
      const t = placeInk(S.tiers[tier], '700 {s} "Changa"', VW / 2, yOf(L.word) + (wRows * G.ch) / 2, 30);
      emb =
        `<g${thumb ? "" : ` filter="url(#${ids.embSh})"`}><text x="${t.x}" y="${t.y}" direction="ltr" class="c07-emb" font-size="${t.fs}" fill="${thumb ? P.L : `url(#${ids.emb})`}" stroke="${mix(P.L, P.G, 0.3)}" stroke-width="1.6" stroke-dasharray="1.4 .6" paint-order="stroke">${esc(S.tiers[tier])}</text></g>`;
    }
    const label = wovenLabel(p, o, VW / 2 - LABEL_W / 2, yOf(L.label), LABEL_W, lh, "tall", thumb, ids, nm.onLabel);

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
    return `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}">${svg}</div>`;
  }

  /** The knot: the scarf's tail wrapped round the rail and tied, on the inline-start side.
      A lump, a tucked lobe under it, and the tie: a strip of the same knit crossing the lump,
      its two cream selvedges showing that it is the scarf wrapped round itself. */
  function knotSvg(P, ids, ar, thumb) {
    const ell = (cx, cy, rx, ry, a) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${cx} ${cy})"`;
    const lump = [22, 25, 19, 15, -18];
    const lobe = [14, 44, 9, 12, 12];
    const tie = "M5 11C15 12 29 21 42 31L37 42C25 32 13 26 2 23Z";
    const shade = (e) => `${ell(...e)} fill="url(#${ids.knotG})"/>`;
    const tex = (e) => (thumb ? "" : `${ell(...e)} fill="url(#${ids.knot})"/>`);
    let g = "";
    g += `<g filter="url(#${ids.soft})" opacity=".45" transform="translate(1.5 2.5)">${ell(...lump)} fill="#020a1c"/>${ell(...lobe)} fill="#020a1c"/></g>`;
    g += `${ell(...lobe)} fill="${P.G}" stroke="${P.Gdk}" stroke-width=".9"/>` + tex(lobe) + shade(lobe);
    g += `${ell(...lump)} fill="${P.G}" stroke="${P.Gdk}" stroke-width=".9"/>` + tex(lump) + shade(lump);
    g += `<path d="${tie}" fill="${P.G}"/>` + (thumb ? "" : `<path d="${tie}" fill="url(#${ids.knot})"/>`) + `<path d="${tie}" fill="#000" opacity=".12"/>`;
    g += `<path d="M5 11C15 12 29 21 42 31" stroke="${CREAM}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    g += `<path d="M2 23C13 26 25 32 37 42" stroke="${CREAM}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    g += `<path d="M2 23C13 26 25 32 37 42" stroke="#000" stroke-opacity=".25" stroke-width="1" fill="none" transform="translate(0 2)"/>`;
    return `<g class="c07-knot"${ar ? ` transform="matrix(-1 0 0 1 ${VW} 0)"` : ""}>${g}</g>`;
  }

  /* ---------- full card: LEGEND, the scarf raised overhead ---------- */
  function fullLegend(p, o) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const P = palette(p);
    const thumb = !!o.thumb;
    const u = MC.uid(PFX);
    const ids = { base: u + "-pb", rib: u + "-pr", cast: u + "-pc", clip: u + "-cl", curl: u + "-cu", soft: u + "-sf", weave: u + "-wv", grain: u + "-gr", cuff: u + "-cf", sleeve: u + "-sl", fist: u + "-fi" };
    const C = LG.cw; // cell along the length
    const BH = 14 * C; // band height: 14 stitches across (selvedges included)
    const BY = 30;
    const rowsN = 14;
    // knitted motifs, set along the length (the way a terrace scarf carries its words)
    const dg = trim(rasterText(String(p.ovr), CHANGA, 10, C, C, 0.46));
    const nm = nameArt(p, o, { cw: C, ch: C }, 20, 54);
    // sections along the length, in cells (Latin order: name, 84, season, label, cast-on)
    const seasonW = PLAYED * 14;
    const castW = CAST.rows * CAST.ch; // 35: the cast-on keeps its gauge, so its rows run across the band
    const fistZone = 80;
    const fr = 34; // fringe reach beyond the ends
    const parts = [
      { k: "endA", w: fistZone },
      { k: "name", w: bw(nm.bmp) * C },
      { k: "gap", w: 22 },
      { k: "digits", w: bw(dg) * C },
      { k: "gap", w: 22 },
      { k: "season", w: seasonW },
      { k: "gap", w: 16 },
      { k: "label", w: 170 },
      { k: "gap", w: 12 },
      { k: "cast", w: castW },
      { k: "endB", w: fistZone },
    ];
    const len = parts.reduce((a, b) => a + b.w, 0);
    const xs = fr;
    const W = Math.ceil(len + 2 * fr);
    const H = 250;
    // positions (mirrored in Arabic: the reading starts at the right)
    let acc = xs;
    const pos = {};
    for (const pt of parts) {
      const x = ar ? W - acc - pt.w : acc;
      if (pt.k !== "gap") pos[pt.k] = { x, w: pt.w };
      acc += pt.w;
    }
    const xa = xs;
    const xb = xs + len;
    // the grid covers the whole band; cell columns along x
    const cols = Math.ceil(len / C);
    const g = grid(cols, rowsN, "G");
    for (let c = 0; c < cols; c++) {
      g[0][c] = "C"; // the start selvedge runs along the top edge
      g[rowsN - 1][c] = "B"; // Logo Blue along the bottom edge
    }
    const colOf = (x) => Math.round((x - xa) / C);
    stamp(g, nm.bmp, colOf(pos.name.x), Math.round((rowsN - nm.bmp.length) / 2), "L");
    stamp(g, dg, colOf(pos.digits.x), Math.round((rowsN - dg.length) / 2), "L");

    let defs =
      stitchPattern(ids.base, LG, { transform: "rotate(-90)" }) +
      stitchPattern(ids.rib, { ...LG, kind: "r" }, { transform: "rotate(-90)" }) +
      stitchPattern(ids.cast, { cw: CAST.cw, ch: CAST.ch, kind: "v", gap: 0.18, leg: 0.3 }, { gapC: "#5A4E36", transform: "rotate(-90)" }) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".86" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>` +
      `<linearGradient id="${ids.sleeve}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(SLEEVE, "#000", 0.35)}"/><stop offset=".45" stop-color="${SLEEVE_LT}"/><stop offset="1" stop-color="${mix(SLEEVE, "#000", 0.45)}"/></linearGradient>` +
      `<linearGradient id="${ids.fist}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKIN_LT}"/><stop offset=".55" stop-color="${SKIN}"/><stop offset="1" stop-color="${SKIN_DK}"/></linearGradient>` +
      `<pattern id="${ids.cuff}" width="3" height="10" patternUnits="userSpaceOnUse"><rect width="3" height="10" fill="${SLEEVE_LT}"/><rect width="1.3" height="10" fill="${mix(SLEEVE, "#000", 0.25)}"/></pattern>` +
      `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      `<pattern id="${ids.weave}" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><rect width="1.6" height=".7" fill="#000" opacity=".04"/></pattern>`;
    if (!thumb)
      defs += `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(p.serial) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;

    // outline: taut along the length, gathered into each fist
    const fa = ar ? xb - 30 : xa + 30; // fist centres
    const fb = ar ? xa + 30 : xb - 30;
    const fl = Math.min(fa, fb);
    const fr2 = Math.max(fa, fb);
    const top = BY;
    const bot = BY + BH;
    const gat = 26; // half-height where the fist gathers it
    const mid = BY + BH / 2;
    const outline =
      `M${xa} ${mid - 40}` +
      `C${xa + 8} ${mid - 46} ${fl - 18} ${mid - gat} ${fl} ${mid - gat}` +
      `C${fl + 18} ${mid - gat} ${fl + 26} ${top} ${fl + 44} ${top}` +
      `H${fr2 - 44}C${fr2 - 26} ${top} ${fr2 - 18} ${mid - gat} ${fr2} ${mid - gat}` +
      `C${fr2 + 18} ${mid - gat} ${xb - 8} ${mid - 46} ${xb} ${mid - 40}` +
      `V${mid + 40}C${xb - 8} ${mid + 46} ${fr2 + 18} ${mid + gat} ${fr2} ${mid + gat}` +
      `C${fr2 - 18} ${mid + gat} ${fr2 - 26} ${bot} ${fr2 - 44} ${bot}` +
      `H${fl + 44}C${fl + 26} ${bot} ${fl + 18} ${mid + gat} ${fl} ${mid + gat}` +
      `C${fl - 18} ${mid + gat} ${xa + 8} ${mid + 46} ${xa} ${mid + 40}Z`;
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;

    // fabric: ground, runs (the grid is drawn with x along columns)
    let fab = `<rect x="${xa}" y="${BY}" width="${len}" height="${BH}" fill="${P.G}"/>`;
    // the grid's columns run along x: draw its runs row by row
    fab += gridRuns(g, P, xa, BY, C, C, "G");
    // season bands: one per gameweek played, alternating stockinette and rib, a notch every fifth
    const bands = [];
    for (let k = 0; k < PLAYED; k++) {
      const gw = k + 1;
      const x = ar ? pos.season.x + pos.season.w - (k + 1) * 14 : pos.season.x + k * 14;
      bands.push({ gw, x, rib: gw % 2 === 0 });
    }
    // texture: base everywhere, rib over the even bands
    fab += `<rect x="${xa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.base})"/>`;
    for (const b of bands) {
      if (b.rib) fab += `<rect x="${b.x}" y="${BY}" width="14" height="${BH}" fill="${P.G}"/><rect x="${b.x}" y="${BY}" width="14" height="${C}" fill="${CREAM}"/><rect x="${b.x}" y="${BY + BH - C}" width="14" height="${C}" fill="${BLUE}"/><rect x="${b.x}" y="${BY}" width="14" height="${BH}" fill="url(#${ids.rib})"/>`;
      fab += `<path d="M${b.x} ${BY}V${BY + BH}" stroke="#000" stroke-opacity=".16" stroke-width=".8"/>`;
      if (b.gw % 5 === 0) fab += `<rect x="${b.x}" y="${BY + C}" width="14" height="${C}" fill="${CREAM}"/>`;
    }
    // the cast-on, turned with the scarf: its rows run across the band, 2026 reads upward
    {
      const cx = pos.cast.x;
      const founder = !!p.founder;
      fab += `<rect x="${cx}" y="${BY}" width="${castW}" height="${BH}" fill="${founder ? CREAM : P.G}"/>`;
      fab += `<rect x="${cx}" y="${BY + BH - C}" width="${castW}" height="${C}" fill="${BLUE}"/>`;
      if (founder) {
        const yr = word(String(p.founder), F35, 1); // 5 rows × 15 stitches
        const yw = bw(yr) * CAST.cw; // 90 along the band's height
        const y0 = BY + (BH - yw) / 2;
        // rotate the bitmap: rows become columns, reading bottom to top
        let rs = "";
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < yr[r].length; c++) if (yr[r][c] === "#") rs += `<rect x="${f2(cx + r * CAST.ch)}" y="${f2(y0 + yw - (c + 1) * CAST.cw)}" width="${CAST.ch + 0.04}" height="${CAST.cw + 0.04}"/>`;
        fab += `<g fill="${P.Y}">${rs}</g>`;
      }
      fab += `<rect x="${cx}" y="${BY}" width="${castW}" height="${BH}" fill="url(#${ids.cast})"/>`;
    }
    fab +=
      `<g pointer-events="none"><rect x="${xa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.curl})"/>` +
      (thumb ? "" : `<rect x="${xa}" y="${BY}" width="${len}" height="${BH}" filter="url(#${ids.grain})" opacity=".5"/>`) +
      `</g>`;
    // gathered folds into each fist
    let folds = "";
    for (const f of [fa, fb]) {
      const dir = f === fl ? 1 : -1;
      for (const dy of [-22, -10, 2, 14]) folds += `<path d="M${f2(f + dir * 4)} ${f2(mid + dy * 0.5)}C${f2(f + dir * 18)} ${f2(mid + dy * 0.9)} ${f2(f + dir * 30)} ${f2(mid + dy * 1.9)} ${f2(f + dir * 46)} ${f2(mid + dy * 2.6)}" stroke="#000" stroke-opacity=".28" stroke-width="1.4" fill="none"/>`;
    }

    // the long hand-knotted fringe hangs from both ends
    const rnd = seeded(hashStr(p.serial + "fringe-legend"));
    let fringe = "";
    for (const [x, dir] of [
      [xa, -1],
      [xb, 1],
    ])
      for (let i = 0; i < TASSELS.LEGEND; i++) {
        const ty = mid - 28 + i * 26;
        fringe += tassel(x + dir * 4, ty, 62 + rnd() * 8, 11, P, { rnd, knotted: true, hang: dir * 14 });
      }

    // two fists in bench-jacket cuffs, arms raised from below: four fingers side by side round
    // the gathered scarf, the thumb closing over them from the inner side
    const fist = (cx, dir) => {
      const tilt = dir * 6;
      const top = mid - 30;
      const sleeveD = `M${cx - 20} ${mid + 24}L${cx + 20} ${mid + 24}L${cx + 29 + dir * 18} ${H + 4}L${cx - 29 + dir * 18} ${H + 4}Z`;
      let g2 = `<path d="${sleeveD}" fill="#020a1c" opacity=".35" filter="url(#${ids.soft})" transform="translate(2 3)"/>`;
      g2 += `<path d="${sleeveD}" fill="url(#${ids.sleeve})"/>`;
      g2 += `<path d="M${cx + dir * 6} ${mid + 40}L${cx + dir * 14} ${H + 4}" stroke="${mix(SLEEVE, "#000", 0.35)}" stroke-width="1.4"/>`;
      // the back of the hand and the wrist
      g2 += `<path d="M${cx - 19} ${mid - 6}H${cx + 19}V${mid + 14}C${cx + 19} ${mid + 22} ${cx + 12} ${mid + 26} ${cx} ${mid + 26}C${cx - 12} ${mid + 26} ${cx - 19} ${mid + 22} ${cx - 19} ${mid + 14}Z" fill="url(#${ids.fist})" stroke="${SKIN_DK}" stroke-width="1"/>`;
      // the cuff: a ribbed knit band
      g2 += `<rect x="${cx - 21}" y="${mid + 20}" width="42" height="15" rx="4" fill="url(#${ids.cuff})" stroke="${mix(SLEEVE, "#000", 0.4)}" stroke-width="1"/>`;
      // fingers, curled over the front of the scarf
      for (let i = 0; i < 4; i++) {
        const fx = cx - 19 + i * 9.6;
        const fh = 30 - Math.abs(i - 1.5) * 2.4;
        g2 += `<rect x="${f2(fx)}" y="${f2(top + (30 - fh) * 0.5)}" width="9.4" height="${f2(fh)}" rx="4.6" fill="url(#${ids.fist})" stroke="${SKIN_DK}" stroke-width="1"/>`;
        g2 += `<path d="M${f2(fx + 2.6)} ${f2(top + (30 - fh) * 0.5 + 5)}V${f2(top + (30 - fh) * 0.5 + fh * 0.55)}" stroke="${SKIN_LT}" stroke-width="1.3" stroke-linecap="round" opacity=".75"/>`;
        g2 += `<path d="M${f2(fx + 1.6)} ${f2(top + fh * 0.62)}H${f2(fx + 7.8)}" stroke="${SKIN_DK}" stroke-width=".8" opacity=".7"/>`;
      }
      // the thumb, from the inner side across the lower knuckles
      const ix = cx - dir * 19;
      g2 += `<path d="M${ix} ${mid + 12}C${ix - dir * 4} ${mid + 2} ${ix - dir * 2} ${mid - 6} ${ix + dir * 6} ${mid - 6}C${ix + dir * 16} ${mid - 6} ${ix + dir * 24} ${mid - 3} ${ix + dir * 26} ${mid + 1}C${ix + dir * 27} ${mid + 5} ${ix + dir * 20} ${mid + 7} ${ix + dir * 12} ${mid + 6}C${ix + dir * 8} ${mid + 6} ${ix + dir * 6} ${mid + 10} ${ix + dir * 4} ${mid + 14}Z" fill="${SKIN}" stroke="${SKIN_DK}" stroke-width="1"/>`;
      return `<g class="c07-fist" transform="rotate(${tilt} ${cx} ${mid})">${g2}</g>`;
    };
    const label = wovenLabel(p, o, pos.label.x, BY + 6, pos.label.w, BH - 12, "wide", thumb, ids, nm.onLabel);
    const rim = `<path class="c07-rim" d="${outline}" fill="none" stroke-width="1.2"/>`;
    const svg =
      `<svg class="c07-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      `<g class="c07-raise">` +
      `<g class="c07-fringe">${fringe}</g>` +
      `<g class="c07-fabric" clip-path="url(#${ids.clip})">${fab}${folds}</g>` +
      rim +
      label +
      `</g>` +
      `<g class="c07-fists">${fist(fa, ar ? 1 : -1)}${fist(fb, ar ? -1 : 1)}</g>` +
      `</svg>`;
    const cls = `c07 c07--legend${thumb ? " c07--thumb" : ""}${o.motion ? " c07--motion" : ""}`;
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
    const body = tier === "LEGEND" ? (mini ? miniLegend(p, P) : tokenLegend(p, P, s)) : mini ? miniHanging(p, P, tier) : tokenHanging(p, P, tier, s);
    const k = mini ? s / 24 : 1;
    const W = f2(body.w * k);
    const inner = ar && !body.noMirror ? `<g transform="matrix(-1 0 0 1 ${body.w} 0)">${body.art}</g>${body.digits}` : body.art + body.digits;
    return (
      `<span class="c07-tk c07-tk--${tier.toLowerCase()}${mini ? " c07-tk--mini" : ""}" role="img" aria-label="${esc(label)}" style="width:${W}px;height:${s}px">` +
      `<svg width="${W}" height="${s}" viewBox="0 0 ${body.w} ${body.h}" aria-hidden="true" focusable="false">${body.art && body.defs ? `<defs>${body.defs}</defs>` : ""}${inner}</svg></span>`
    );
  }
  /** Solid Changa 800 figures centred on (cx, cy), ink height h. */
  function solidDigits(ovr, cx, cy, h, fill) {
    const t = placeInk(String(ovr), CHANGA, cx, cy, h);
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
  function tokenHanging(p, P, tier, s) {
    const t = Math.max(3, Math.round(s * 0.075)); // rail
    const sw = Math.round(s * 0.6); // swatch
    const oh = Math.max(6, Math.round(s * 0.17)); // rail overhang
    const W = sw + 2 * oh;
    const tl = Math.max(7, Math.round(s * 0.2)); // tassels
    const fb = p.founder ? Math.max(3, Math.round(s * 0.07)) : 0;
    const ry = Math.max(2, Math.round(s * 0.05));
    const sx = oh;
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
    // the label's edge, sewn under the figures (from 56px)
    const digitsBottom = sb - fb - (s >= 56 ? Math.round(s * 0.1) : Math.round(s * 0.05));
    if (s >= 56) {
      const lw = Math.round(sw * 0.5);
      const lh2 = Math.max(3, Math.round(s * 0.055));
      a += `<rect x="${f2(sx + (sw - lw) / 2)}" y="${sb - fb - lh2 - Math.round(s * 0.03)}" width="${lw}" height="${lh2}" fill="${SATIN}"/><rect x="${f2(sx + (sw - lw) / 2 + 2)}" y="${sb - fb - lh2 - Math.round(s * 0.03) + 1}" width="${Math.round(lw * 0.45)}" height="1" fill="${BLUE}"/>`;
    }
    // founder: the cream cast-on band
    if (fb) a += `<rect x="${sx}" y="${sb - fb}" width="${sw - (ear ? ear * (fb / ear) : 0)}" height="${fb}" fill="${CREAM}" class="c07-tk-cast"/>`;
    if (ear) {
      const ex = sx + sw - ear;
      a += `<path d="M${ex} ${sb}L${sx + sw} ${sb - ear}L${ex} ${sb - ear}Z" fill="${P.L}"/><path d="M${ex} ${sb}L${sx + sw} ${sb - ear}" stroke="#020a1c" stroke-opacity=".4" stroke-width=".8"/>`;
    }
    // knot: the bump on the start side, over the rail
    const kr = Math.max(3, Math.round(s * 0.11));
    a += `<ellipse cx="${f2(sx + kr * 0.15)}" cy="${f2(ry + t * 0.7)}" rx="${kr}" ry="${f2(kr * 0.9)}" fill="${P.G}" stroke="${P.Gdk}" stroke-width=".8"/><path d="M${f2(sx - kr * 0.75)} ${f2(ry + t * 0.7 + kr * 0.3)}Q${f2(sx - kr * 0.2)} ${f2(ry + t * 0.7 + kr * 0.95)} ${f2(sx + kr * 0.6)} ${f2(ry + t * 0.7 + kr * 0.7)}" stroke="${CREAM}" stroke-width="${f2(Math.max(1, kr * 0.28))}" fill="none"/>`;
    // tassels: the count is the tier
    const n = TASSELS[tier];
    const tw = Math.max(2, Math.round(s * 0.05));
    const mx = Math.max(tw, Math.round(sw * 0.14));
    a += ticks(n, sx + mx, sx + sw - mx - (ear ? ear * 0.6 : 0), sb, tl, tw, P, tier === "CHAMPION");
    // the 84 in solid Changa 800
    const top = ry + t + Math.max(2, Math.round(s * 0.04));
    const h = Math.min(Math.round((sw - 2 * edge - 4) * 0.62), digitsBottom - top - 1);
    const d = solidDigits(p.ovr, sx + sw / 2, (top + digitsBottom) / 2, h, P.L);
    return { w: W, h: s, art: a, digits: d, defs: "" };
  }
  function miniHanging(p, P, tier) {
    // integer cells on a 22×24 grid, scaled whole: rail, knot, 14×14 swatch, cast-on band, tassels
    let a = "";
    a += `<rect x="0" y="1" width="22" height="2" rx="1" fill="#A9B2BE"/><rect x="0" y="2.5" width="22" height=".5" fill="#4E5661"/>`;
    a += `<rect x="4" y="0" width="14" height="${p.founder ? 15 : 17}" fill="${P.G}" class="c07-tk-sw"/>`;
    a += `<rect x="4" y="0" width="1" height="${p.founder ? 15 : 17}" fill="${CREAM}"/><rect x="17" y="0" width="1" height="${p.founder ? 15 : 17}" fill="${BLUE}"/>`;
    if (p.founder) a += `<rect x="4" y="15" width="14" height="3" fill="${CREAM}" class="c07-tk-cast"/><rect x="17" y="15" width="1" height="3" fill="${BLUE}"/>`;
    // the knot bump on the start side
    a += `<circle cx="4" cy="2.6" r="2.6" fill="${P.G}" stroke="${P.Gdk}" stroke-width=".5"/>`;
    const n = TASSELS[tier];
    const xs = { 2: [7, 14], 3: [6, 10.5, 15], 4: [5.5, 9, 12.5, 16], 5: [5.5, 8, 10.5, 13, 15.5] }[n];
    for (const x of xs) a += `<rect x="${x - 0.5}" y="18" width="1" height="${tier === "CHAMPION" ? 5 : 5}" fill="${P.G}" class="c07-tk-tassel"/>${tier === "CHAMPION" ? `<rect x="${x - 1}" y="18" width="2" height="1" fill="${P.Gdk}"/>` : ""}`;
    const d = solidDigits(p.ovr, 11, 8.6, 7.4, P.L);
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
    const railY = 128;
    const scale = 0.98;
    const sw = Math.round(VW * scale);
    const sx = ar ? 360 - 20 - sw : 20;
    const scarfTop = f2(railY - (RAIL_Y + RAIL_H / 2) * scale);
    const bg =
      `<svg class="c07-sh-bg" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true">` +
      `<defs>` +
      `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080F"/><stop offset=".4" stop-color="#0A1220"/><stop offset="1" stop-color="#04070D"/></linearGradient>` +
      `<radialGradient id="${u}-fl" cx="${ar ? 0.12 : 0.88}" cy=".02" r=".7"><stop offset="0" stop-color="#EAF2FF" stop-opacity=".5"/><stop offset=".18" stop-color="#9DB8E6" stop-opacity=".18"/><stop offset=".6" stop-color="#2A3F66" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${u}-pitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E2416" stop-opacity="0"/><stop offset=".25" stop-color="#173A22"/><stop offset=".7" stop-color="#1F4A2B"/><stop offset="1" stop-color="#0B1A10"/></linearGradient>` +
      `<filter id="${u}-bl" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="9"/></filter>` +
      steelGrad(u + "-st") +
      `<linearGradient id="${u}-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4E5661"/><stop offset=".4" stop-color="#C6CDD6"/><stop offset="1" stop-color="#5E6876"/></linearGradient>` +
      `</defs>` +
      `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
      // the pitch beyond, out of focus: mown bands, a touchline
      `<g filter="url(#${u}-bl)" opacity=".9"><rect x="-20" y="300" width="400" height="240" fill="url(#${u}-pitch)"/>` +
      `<path d="M-20 360H380M-20 430H380M-20 505H380" stroke="#2C6239" stroke-width="22" opacity=".45"/><path d="M-20 318H380" stroke="#DDE8DF" stroke-width="3" opacity=".5"/></g>` +
      // floodlight glow and the far stand's lights
      `<rect width="360" height="640" fill="url(#${u}-fl)"/>` +
      `<g filter="url(#${u}-bl)" opacity=".55"><ellipse cx="${ar ? 40 : 320}" cy="22" rx="46" ry="16" fill="#F4F8FF"/></g>` +
      // the crowd barrier: top rail, uprights, a lower rail behind the scarf
      `<rect x="${ar ? 334 : 20}" y="${railY}" width="7" height="520" fill="url(#${u}-post)"/>` +
      `<rect x="${ar ? 20 : 334}" y="${railY}" width="7" height="520" fill="url(#${u}-post)" opacity=".85"/>` +
      `<rect x="0" y="${railY + 250}" width="360" height="9" rx="4.5" fill="url(#${u}-st)" opacity=".75"/>` +
      `<rect x="0" y="${railY - 7}" width="360" height="14" rx="7" fill="url(#${u}-st)"/>` +
      `<path d="M0 ${railY - 3.5}H360" stroke="#fff" stroke-opacity=".7" stroke-width="1.4"/>` +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "light", w: "100%" });
    const cap = ar ? "موسمي صفًّا بعد صف" : "Ma saison, rang par rang";
    const yr = p.founder ? ` ·${String(p.founder).slice(-2)}` : "";
    return (
      `<div class="c07-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c07-sh-head">` +
      `<div class="c07-sh-logo">${logo}</div>` +
      `<p class="c07-sh-cap">${esc(cap)}</p>` +
      `</div>` +
      `<div class="c07-sh-id"><b class="c07-sh-name">${esc(MC.nameOf(p, o))}<span dir="ltr">${esc(yr)}</span></b>` +
      `<span class="c07-sh-sub">${esc(S.tiers[p.tier])} · <span dir="ltr">@ali</span> · ${ar ? "مثال" : "Exemple"}</span></div>` +
      `<div class="c07-sh-scarf" style="top:${scarfTop}px;left:${sx}px;width:${sw}px">${full(p, { ...o, motion: false, thumb: false, _noRail: true })}</div>` +
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
    philosophy: "",
    philosophyAr: "",
    idea: [],
    belonging: [],
    founderMark: [],
    small: [],
    rtl: [],
    tiers: {},
    legend: [],
    advantages: [],
    risks: [],
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
