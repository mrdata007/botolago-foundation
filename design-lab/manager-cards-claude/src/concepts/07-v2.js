/* 07 ÉCHARPE v2 — the supporter's scarf, refined.
   Default state (grids, detail, tier strip): the scarf draped over the steel crowd-barrier rail,
   its front drop showing a face of about 1:1.6 and the rest hanging behind it (the back drop
   shows as an offset edge and a second fringe). Read from the rail down, each element on its own
   colour band: the 84 (100%), ALI ·26 (62%), a narrow tier band set in the stripes (38%), the
   woven jacquard patch with the ratings, the founder's cream cast-on with 2026, the fringe.
   Every knitted glyph comes from a hand-cleaned chart on an integer stitch grid (no live
   rasterising): digits 9 stitches by 13 rows, Latin capitals on 8 rows, tier words on 5 rows,
   علي and the five Arabic tier words hand-charted with connected joins.
   The full-length scarf (o.long) carries the season, one stripe per gameweek played; the share
   image uses it. LEGEND lifts the scarf off the rail and holds it overhead. */
(function () {
  const MC = window.MC;
  const PFX = "c07v2";

  try {
    if (document.fonts && document.fonts.load) {
      ['800 64px "Changa"', '700 64px "Manrope"', '600 64px "Manrope"', '600 64px "Noto Sans Arabic"', '700 64px "Noto Sans Arabic"'].forEach((f) =>
        document.fonts.load(f, "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ علي محترف حومة ملعب بطل أسطورة المغرب القائد التشكيلة الانتقالات الثبات").catch(() => {}),
      );
    }
  } catch (e) {
    /* the fallback rasteriser uses whatever face is ready */
  }

  /* ---------- yarns and materials ---------- */
  const CREAM = "#F2EEE4"; // undyed cream: selvedge, PRO's panel, the cast-on when the club's second colour is dark
  const BLUE = "#0151FC"; // Logo Blue: the end-edge selvedge (the one fixed brand thread)
  const WOOL = "#E8E1D0"; // undyed wool: the ground when no club is chosen
  const CHAR = "#2B2B2B";
  const PATCH_FALLBACK = "#ECE6D8"; // the patch ground when the club's second colour is dark
  const INK = "#23252A";
  const INK_SOFT = "#4F4A42";
  const SLEEVE = "#2f343c"; // bench-jacket sleeve (graphite)
  const SLEEVE_LT = "#4f5763";
  const PLAYED = 7; // sample season: J.01–J.07, labelled Exemple

  /* ---------- geometry (viewBox units) ---------- */
  const VW = 264;
  const X0 = 26;
  const X1 = 250;
  const FW = X1 - X0; // 224: 28 stitches at HOMA, 32 at STADE, 35 at PRO, 40 at CHAMPION
  const RAIL_Y = 8;
  const RAIL_H = 14;
  const FT = 2; // the fabric's top, turned over the tube
  const CAST = { c: 7, rows: 5 }; // the founder's cast-on keeps one gauge at every tier
  const BACK = { dx: 12 }; // the back drop: offset to the inline start, shorter than the front
  const TASSELS = { HOMA: 2, STADE: 3, PRO: 4, CHAMPION: 5, LEGEND: 3 };

  /* gauge: HOMA chunky acrylic → STADE machine jacquard → PRO fine (0.8× HOMA) → CHAMPION double-knit */
  const GAUGE = {
    HOMA: { c: 8, gap: 0.5, leg: 0.34, ridge: true },
    STADE: { c: 7, gap: 0.3, leg: 0.2 },
    PRO: { c: 6.4, gap: 0.4, leg: 0.27 },
    CHAMPION: { c: 5.6, gap: 0.5, leg: 0.36, plump: true },
  };

  /* ---------- hand-cleaned knit charts ('#' = stitch) ---------- */
  // Digits, 9 stitches by 13 rows: three-stitch stems, two-row bars, open three-stitch counters.
  // Drawn from Changa 800 (flat-topped 1 with a slab base, flag-less 4 with a spur, straight-stemmed
  // 7) and cleaned stitch by stitch, so no counter carries a stray stitch.
  const D913 = {
    0: [".#######.", "#########", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "###...###", "#########", ".#######."],
    1: [".#####...", "######...", "...###...", "...###...", "...###...", "...###...", "...###...", "...###...", "...###...", "...###...", "...###...", "#########", "#########"],
    2: [".#######.", "#########", "###...###", "......###", "......###", ".....####", "...#####.", "..####...", ".####....", "####.....", "###......", "#########", "#########"],
    3: [".#######.", "#########", "###...###", "......###", "......###", "..#######", "..#######", "......###", "......###", "......###", "###...###", "#########", ".#######."],
    4: ["###..###.", "###..###.", "###..###.", "###..###.", "###..###.", "###..###.", "###..###.", "#########", "#########", ".....###.", ".....###.", ".....###.", ".....###."],
    5: ["#########", "#########", "###......", "###......", "###......", "########.", "#########", "......###", "......###", "......###", "###...###", "#########", ".#######."],
    6: [".########", "#########", "###......", "###......", "###......", "########.", "#########", "###...###", "###...###", "###...###", "###...###", "#########", ".#######."],
    7: ["#########", "#########", "......###", "......###", ".....####", "....####.", "....###..", "...####..", "...###...", "...###...", "..####...", "..###....", "..###...."],
    8: [".#######.", "#########", "###...###", "###...###", "###...###", ".#######.", ".#######.", "###...###", "###...###", "###...###", "###...###", "#########", ".#######."],
    9: [".#######.", "#########", "###...###", "###...###", "###...###", "###...###", "#########", ".########", "......###", "......###", "......###", "#########", "########."],
  };
  // Latin capitals for names, 8 rows: two-stitch stems, two-row bars.
  const N8 = {
    A: [".####.", "######", "##..##", "##..##", "######", "######", "##..##", "##..##"],
    B: ["#####.", "######", "##..##", "#####.", "#####.", "##..##", "######", "#####."],
    C: [".#####", "######", "##....", "##....", "##....", "##....", "######", ".#####"],
    D: ["#####.", "######", "##..##", "##..##", "##..##", "##..##", "######", "#####."],
    E: ["######", "######", "##....", "#####.", "#####.", "##....", "######", "######"],
    F: ["######", "######", "##....", "#####.", "#####.", "##....", "##....", "##...."],
    G: [".#####", "######", "##....", "##.###", "##.###", "##..##", "######", ".#####"],
    H: ["##..##", "##..##", "##..##", "######", "######", "##..##", "##..##", "##..##"],
    I: ["##", "##", "##", "##", "##", "##", "##", "##"],
    J: ["....##", "....##", "....##", "....##", "....##", "##..##", "######", ".####."],
    K: ["##..##", "##.##.", "####..", "###...", "####..", "##.##.", "##..##", "##..##"],
    L: ["##...", "##...", "##...", "##...", "##...", "##...", "#####", "#####"],
    M: ["##....##", "###..###", "########", "##.##.##", "##....##", "##....##", "##....##", "##....##"],
    N: ["##...##", "###..##", "####.##", "##.####", "##..###", "##...##", "##...##", "##...##"],
    O: [".####.", "######", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    P: ["#####.", "######", "##..##", "##..##", "######", "#####.", "##....", "##...."],
    Q: [".####.", "######", "##..##", "##..##", "##..##", "##.###", "######", ".#####"],
    R: ["#####.", "######", "##..##", "##..##", "#####.", "##.##.", "##..##", "##..##"],
    S: [".#####", "######", "##....", "#####.", ".#####", "....##", "######", "#####."],
    T: ["######", "######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
    U: ["##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    V: ["##..##", "##..##", "##..##", "##..##", "##..##", ".####.", ".####.", "..##.."],
    W: ["##....##", "##....##", "##....##", "##.##.##", "##.##.##", "########", "###..###", "##....##"],
    X: ["##..##", "##..##", ".####.", "..##..", "..##..", ".####.", "##..##", "##..##"],
    Y: ["##..##", "##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##.."],
    Z: ["######", "######", "...##.", "..##..", ".##...", "##....", "######", "######"],
    "-": ["....", "....", "....", "####", "####", "....", "....", "...."],
    " ": ["..", "..", "..", "..", "..", "..", "..", ".."],
  };
  // Tier words (and long names), 5 rows, one-stitch strokes.
  const T5 = {
    A: [".##.", "#..#", "####", "#..#", "#..#"],
    B: ["###.", "#..#", "###.", "#..#", "###."],
    C: [".###", "#...", "#...", "#...", ".###"],
    D: ["###.", "#..#", "#..#", "#..#", "###."],
    E: ["###", "#..", "##.", "#..", "###"],
    F: ["###", "#..", "##.", "#..", "#.."],
    G: [".###", "#...", "#.##", "#..#", ".###"],
    H: ["#..#", "#..#", "####", "#..#", "#..#"],
    I: ["#", "#", "#", "#", "#"],
    J: ["..#", "..#", "..#", "#.#", ".#."],
    K: ["#..#", "#.#.", "##..", "#.#.", "#..#"],
    L: ["#..", "#..", "#..", "#..", "###"],
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
    O: [".##.", "#..#", "#..#", "#..#", ".##."],
    P: ["###.", "#..#", "###.", "#...", "#..."],
    Q: [".##.", "#..#", "#..#", "#.##", ".###"],
    R: ["###.", "#..#", "###.", "#.#.", "#..#"],
    S: [".###", "#...", ".##.", "...#", "###."],
    T: ["###", ".#.", ".#.", ".#.", ".#."],
    U: ["#..#", "#..#", "#..#", "#..#", ".##."],
    V: ["#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
    X: ["#..#", "#..#", ".##.", "#..#", "#..#"],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
    Z: ["####", "..#.", ".#..", "#...", "####"],
    "-": ["...", "...", "###", "...", "..."],
    " ": [".", ".", ".", ".", "."],
  };
  // Condensed 3-wide variants, used when a tier word would not sit inside the bound edges.
  const T5C = {
    A: [".#.", "#.#", "###", "#.#", "#.#"],
    C: [".##", "#..", "#..", "#..", ".##"],
    H: ["#.#", "#.#", "###", "#.#", "#.#"],
    O: [".#.", "#.#", "#.#", "#.#", ".#."],
    P: ["##.", "#.#", "##.", "#..", "#.."],
    D: ["##.", "#.#", "#.#", "#.#", "##."],
    G: [".##", "#..", "#.#", "#.#", ".##"],
    N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  };
  // Small figures, 3×5: the year after the name (·26) and the cast-on's 2026.
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
  };
  // Token figures, 5×7 with two-stitch stems (24–28px minis, HOMA's chunky token).
  const F57 = {
    0: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    1: ["..##.", ".###.", "..##.", "..##.", "..##.", "..##.", ".####"],
    2: [".###.", "##.##", "...##", "..##.", ".##..", "##...", "#####"],
    3: ["####.", "...##", "...##", ".###.", "...##", "...##", "####."],
    4: ["##.##", "##.##", "##.##", "#####", "...##", "...##", "...##"],
    5: ["#####", "##...", "####.", "...##", "...##", "##.##", ".###."],
    6: [".###.", "##...", "####.", "##.##", "##.##", "##.##", ".###."],
    7: ["#####", "...##", "...##", "..##.", "..##.", ".##..", ".##.."],
    8: [".###.", "##.##", "##.##", ".###.", "##.##", "##.##", ".###."],
    9: [".###.", "##.##", "##.##", ".####", "...##", "...##", ".###."],
  };
  // Arabic, hand-charted from Changa's geometric Arabic and joined on the baseline. Charts are
  // in visual order (left to right on the page), so they are never mirrored.
  // علي: 17 × 12, two-stitch strokes like the Latin names; baseline rows 5–6; the yā's two dots
  // are 2×2 blocks one row under its bowl.
  const AR_NAME = {
    علي: [
      "........##.......",
      "........##.......",
      "........##..#####",
      "........##.##....",
      "##......##.##....",
      "##..#############",
      "##..#############",
      "#######..........",
      "#######..........",
      ".................",
      ".##.##...........",
      ".##.##...........",
    ],
  };
  const AR_NAME_BASE = { علي: 6 }; // the baseline's last row (figures sit on it)
  // Tier words, 8 rows, one-stitch strokes, baseline row 5.
  const AR_TIER = {
    HOMA: ["...............", "#.#............", "............###", "###.###..###..#", "#.#.#.#..#.#..#", "#######..######", "..........#....", ".........#....."],
    STADE: ["............#....", "............#....", "........###.#....", "#.....#.#.#.#.###", "#.....#.#.#.#.#.#", "#################", ".................", "...#............."],
    PRO: ["....#...............", "..........#.#.......", ".............###....", "#..###.....#...#.###", "#..#.#.....#...#.#.#", "######...###########", "........#...........", ".......#............"],
    CHAMPION: ["....#..#......", "....#..#......", "....#..#......", "....#..####..#", "#...#..#..#..#", "#...##########", "#...#.........", "#####........#"],
    LEGEND: [
      "...........#...........##",
      "#.#........#.............",
      "...........#...........#.",
      "###..#.###.####.#.#.#..#.",
      "#.#..#.#.#.#..#.#.#.#..#.",
      "###..#.##############..#.",
      ".....#..#................",
      "....#..#.................",
    ],
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
  const contrast = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const bw = (bmp) => (bmp.length ? bmp[0].length : 0);
  /** Joins glyphs side by side (all the same height) with `gap` blank columns. */
  function word(str, font, gap = 1) {
    const glyphs = [...String(str)].map((ch) => font[ch] || font[ch.toUpperCase()] || font[" "] || font[0]);
    const h = glyphs[0].length;
    const rows = [];
    for (let r = 0; r < h; r++) rows.push(glyphs.map((g) => g[r]).join(".".repeat(gap)));
    return rows;
  }
  /** Replaces '#' with another mark (so several colours can live in one bitmap). */
  const tint = (bmp, ch) => bmp.map((r) => r.replace(/#/g, ch));
  /** Puts bitmaps side by side, aligned on a shared bottom row (`base` = rows from the top of
      each part to its baseline's last row; defaults to its height − 1). */
  function hjoin(parts, gaps) {
    const above = Math.max(...parts.map((p) => (p.base != null ? p.base : p.bmp.length - 1)));
    const below = Math.max(...parts.map((p) => p.bmp.length - 1 - (p.base != null ? p.base : p.bmp.length - 1)));
    const H = above + below + 1;
    const rows = Array.from({ length: H }, () => "");
    parts.forEach((p, i) => {
      const b = p.base != null ? p.base : p.bmp.length - 1;
      const off = above - b;
      const w = bw(p.bmp);
      for (let r = 0; r < H; r++) {
        const src = r - off;
        rows[r] += src >= 0 && src < p.bmp.length ? p.bmp[src] : ".".repeat(w);
        if (i < parts.length - 1) rows[r] += ".".repeat(gaps[i] != null ? gaps[i] : 1);
      }
    });
    return { bmp: rows, base: above };
  }
  function grid(cols, rows, fill) {
    return Array.from({ length: rows }, () => new Array(cols).fill(fill));
  }
  /** Writes a bitmap into the grid; `map` turns each mark into a yarn key. */
  function stamp(g, bmp, col, row, map) {
    for (let r = 0; r < bmp.length; r++)
      for (let c = 0; c < bmp[r].length; c++) {
        const v = map[bmp[r][c]];
        if (!v) continue;
        const gr = row + r;
        const gc = col + c;
        if (g[gr] && gc >= 0 && gc < g[gr].length) g[gr][gc] = v;
      }
  }
  /** Merged rectangles for the cells of a bitmap that carry `mark`. */
  function bmpRects(bmp, x0, y0, cw, ch, mark = "#") {
    let s = "";
    for (let r = 0; r < bmp.length; r++) {
      let c = 0;
      while (c < bmp[r].length) {
        if (bmp[r][c] !== mark) {
          c++;
          continue;
        }
        let e = c;
        while (e < bmp[r].length && bmp[r][e] === mark) e++;
        s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch)}"/>`;
        c = e;
      }
    }
    return s;
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
        if (k !== base && P[k]) s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch + 0.04)}" fill="${P[k]}"/>`;
        c = e;
      }
    }
    return s;
  }
  /** Rects for every cell of the grid holding key `k` (used to clip textures to a motif). */
  function keyRects(g, k, x0, y0, cw, ch) {
    let s = "";
    for (let r = 0; r < g.length; r++) {
      let c = 0;
      while (c < g[r].length) {
        if (g[r][c] !== k) {
          c++;
          continue;
        }
        let e = c;
        while (e < g[r].length && g[r][e] === k) e++;
        s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch + 0.04)}"/>`;
        c = e;
      }
    }
    return s;
  }

  /* ---------- fallback: a name with no chart (other Arabic names) sampled from Changa 800 ---------- */
  const RCACHE = new Map();
  function rasterText(text, rows, thr = 0.5) {
    const spec = '800 100px "Changa"';
    const key = `${text}|${rows}|${thr}`;
    if (RCACHE.has(key)) return RCACHE.get(key);
    const m = document.createElement("canvas").getContext("2d");
    m.font = spec;
    const mt = m.measureText(text);
    const asc = mt.actualBoundingBoxAscent;
    const hh = asc + mt.actualBoundingBoxDescent;
    const ww = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
    const cols = Math.max(1, Math.round((ww * rows) / hh));
    const S = 10;
    const cv = document.createElement("canvas");
    cv.width = cols * S;
    cv.height = rows * S;
    const x = cv.getContext("2d");
    x.scale(cv.width / ww, cv.height / hh);
    x.font = spec;
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
    let ok = true;
    try {
      ok = !document.fonts || document.fonts.check(spec, text);
    } catch (e) {
      ok = true;
    }
    if (ok) RCACHE.set(key, out);
    return out;
  }

  /* ---------- colours from the profile ---------- */
  function palette(p) {
    const club = p.club && p.club.primary;
    const G = club ? p.club.primary : WOOL;
    const L = club ? p.club.secondary || CREAM : CHAR;
    const lightG = lum(G) > 0.42;
    const N = lightG ? CHAR : CREAM; // the knitted name
    // the year (·26): the club's second colour, unless it would vanish on the ground
    const Y = contrast(L, G) >= 2.4 ? L : N;
    // the founder's cast-on: the club's second colour when it is light enough to read as cream
    const cast = lum(L) > 0.55 ? L : CREAM;
    const castInk = [G, L, CHAR].find((c) => contrast(c, cast) >= 3.2) || CHAR;
    const patch = lum(L) > 0.55 ? L : PATCH_FALLBACK;
    // HOMA's single-colour relief: a lit tint, or a shade on a light ground (whichever reads)
    const tintC = mix(G, "#ffffff", 0.42);
    const shadeC = mix(G, "#000000", 0.42);
    const R = contrast(tintC, G) >= contrast(shadeC, G) ? tintC : shadeC;
    const R2 = R === tintC ? mix(G, "#ffffff", 0.62) : mix(G, "#000000", 0.62); // the relief at 24–32px
    // the stripe yarn: the second colour, or cream when the second colour is too close to the ground
    const S = contrast(L, G) >= 1.8 ? L : CREAM;
    // the knitted drop shadow behind CHAMPION's and LEGEND's figures: a third, near-black yarn
    const D = lightG ? mix(G, "#000000", 0.45) : mix(G, "#000000", 0.62);
    // PRO's figures on the cream panel: the ground yarn, or the second yarn when the ground is too pale
    const K = contrast(G, CREAM) >= 2.6 ? G : contrast(L, CREAM) >= 2.6 ? L : CHAR;
    // CHAMPION's and LEGEND's cream figures, or the second yarn on a pale ground
    const F = contrast(CREAM, G) >= 2.6 ? CREAM : contrast(L, G) >= 2.6 ? L : CHAR;
    return { G, L, C: CREAM, B: BLUE, N, Y, R, R2, S, D, K, F, cast, castInk, patch, wool: !club, Gdk: mix(G, "#000000", 0.3), Gxd: mix(G, "#000000", 0.5), Glt: mix(G, "#ffffff", 0.18) };
  }

  /* ---------- textures ---------- */
  /** Stockinette (Vs) or garter (ridges) over any yarn colour. */
  function stitchPattern(id, c, opt = {}) {
    const w = c;
    const h = opt.h || c;
    const gapC = opt.gapC || "#020a1c";
    const gapO = opt.gap != null ? opt.gap : 0.4;
    const legO = opt.leg != null ? opt.leg : 0.26;
    const tf = opt.transform ? ` patternTransform="${opt.transform}"` : "";
    const gid = id + "-lg";
    const grad =
      `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="${legO}"/><stop offset=".45" stop-color="#fff" stop-opacity="${f2(legO * 0.2)}"/>` +
      `<stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>`;
    if (opt.garter) {
      // garter: continuous horizontal ridges, the bumps of each ridge half a stitch off the row below
      let rows = "";
      for (let r = 0; r < 2; r++) {
        const y0 = r * h;
        const off = r ? w / 2 : 0;
        rows +=
          `<rect y="${f2(y0 + h * 0.68)}" width="${f2(w)}" height="${f2(h * 0.32)}" fill="${gapC}" fill-opacity="${gapO}"/>` +
          [off - w / 2, off + w / 2].map((cx) => `<ellipse cx="${f2(cx)}" cy="${f2(y0 + h * 0.38)}" rx="${f2(w * 0.5)}" ry="${f2(h * 0.28)}" fill="url(#${gid})"/>`).join("") +
          `<rect x="${f2(off - 0.3)}" y="${f2(y0 + h * 0.16)}" width=".6" height="${f2(h * 0.45)}" fill="${gapC}" fill-opacity="${f2(gapO * 0.45)}"/>`;
      }
      return grad + `<pattern id="${id}" width="${f2(w)}" height="${f2(2 * h)}" patternUnits="userSpaceOnUse"${tf}>${rows}</pattern>`;
    }
    const rx = w * 0.25;
    const ry = h * 0.6;
    const legs = [
      [w * 0.29, h * 0.5, -24],
      [w * 0.71, h * 0.5, 24],
    ];
    const ell = ([cx, cy, a]) => {
      const t = (a * Math.PI) / 180;
      const ax = ry * Math.sin(-t);
      const ay = ry * Math.cos(t);
      return `M${f2(cx - ax)} ${f2(cy - ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx + ax)} ${f2(cy + ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx - ax)} ${f2(cy - ay)}Z`;
    };
    return (
      grad +
      `<pattern id="${id}" width="${f2(w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${tf}>` +
      `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${legs.map(ell).join("")}" fill="${gapC}" fill-opacity="${gapO}" fill-rule="evenodd"/>` +
      legs.map(([cx, cy, a]) => `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(${a} ${f2(cx)} ${f2(cy)})" fill="url(#${gid})"/>`).join("") +
      `</pattern>`
    );
  }
  /** Satin-stitch thread: a slanted hatch of threads and shadow gaps. */
  function hatch(id, thread, gap, tw = 0.8, gw = 0.45, ang = 62) {
    const p = f2(tw + gw);
    return `<pattern id="${id}" width="${p}" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><rect width="${p}" height="6" fill="${gap}"/><rect width="${tw}" height="6" fill="${thread}"/></pattern>`;
  }
  /** Brushed steel for the barrier rail. */
  function steelGrad(id) {
    return (
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#5E6876"/><stop offset=".18" stop-color="#E6EBF0"/><stop offset=".42" stop-color="#C6CDD6"/>` +
      `<stop offset=".7" stop-color="#A9B2BE"/><stop offset="1" stop-color="#4E5661"/></linearGradient>`
    );
  }

  /* ---------- tassels ---------- */
  /** One tassel. Bundled strands under a wrap; CHAMPION twists two plies; LEGEND knots them. */
  function tassel(x, top, len, w, P, opt) {
    const rnd = opt.rnd;
    const hang = opt.hang || 0;
    let s = "";
    if (opt.twisted) {
      // a two-ply cord: the ground yarn twisted with the second yarn, ending in a brushed tip
      const cw = w * 0.46;
      const y0 = top + 3;
      const y1 = top + len - 11;
      const xb = x + hang;
      s += `<path d="M${f2(x)} ${f2(y0)}L${f2(xb)} ${f2(y1)}" stroke="${P.Gxd}" stroke-width="${f2(cw + 1.6)}" stroke-linecap="round" opacity=".55"/>`;
      s += `<path d="M${f2(x)} ${f2(y0)}L${f2(xb)} ${f2(y1)}" stroke="${P.G}" stroke-width="${f2(cw)}" stroke-linecap="round"/>`;
      let tw = "";
      for (let y = y0 + 2.5; y < y1 - 1; y += 4.6) {
        const xx = x + (hang * (y - y0)) / (y1 - y0);
        tw += `M${f2(xx - cw * 0.42)} ${f2(y + 1.6)}L${f2(xx + cw * 0.42)} ${f2(y - 1.6)}`;
      }
      s += `<path d="${tw}" stroke="${P.S}" stroke-width="1.7" stroke-linecap="round" fill="none"/>`;
      s += `<path d="M${f2(x - cw * 0.18)} ${f2(y0 + 2)}L${f2(xb - cw * 0.18)} ${f2(y1 - 1)}" stroke="#fff" stroke-opacity=".16" stroke-width="1" fill="none"/>`;
      for (let i = 0; i < 6; i++) {
        const t = (i - 2.5) / 2.5;
        s += `<path d="M${f2(xb + t * cw * 0.35)} ${f2(y1 - 1)}Q${f2(xb + t * cw * 0.6)} ${f2(y1 + 5)} ${f2(xb + t * cw * 0.85 + (rnd() - 0.5))} ${f2(y1 + 11 - rnd() * 2.5)}" stroke="${i % 2 ? P.S : P.G}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      }
      s += `<rect x="${f2(x - w * 0.3)}" y="${f2(top + 1)}" width="${f2(w * 0.6)}" height="3.4" rx="1.4" fill="${P.Gdk}"/>`;
      return s;
    }
    const n = 9;
    const knot = opt.knotted;
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) / ((n - 1) / 2);
      const x0 = x + t * w * 0.22;
      const x1 = x + t * w * 0.5 + hang + (rnd() * 2 - 1) * 0.8;
      const l = len - rnd() * 4;
      const kink = knot ? 9 : 4;
      const d = `M${f2(x0)} ${f2(top + kink)}C${f2(x0 + hang * 0.1)} ${f2(top + l * 0.45)} ${f2(x1 - hang * 0.25)} ${f2(top + l * 0.75)} ${f2(x1)} ${f2(top + l)}`;
      const yarnW = f2(Math.max(1.3, (w / n) * 1.05));
      const light = i === 2 || i === 6;
      s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(yarnW * 1.5)}" fill="none" stroke-linecap="round" opacity=".55"/>`;
      s += `<path d="${d}" stroke="${light ? P.S : P.G}" stroke-width="${yarnW}" fill="none" stroke-linecap="round"/>`;
    }
    if (knot) {
      s += `<ellipse cx="${f2(x)}" cy="${f2(top + 6)}" rx="${f2(w * 0.36)}" ry="4.2" fill="${P.G}" stroke="${P.Gdk}" stroke-width="1"/>`;
      s += `<path d="M${f2(x - w * 0.28)} ${f2(top + 5)}C${f2(x - 2)} ${f2(top + 2.4)} ${f2(x + 2)} ${f2(top + 9)} ${f2(x + w * 0.3)} ${f2(top + 6)}" stroke="${P.Glt}" stroke-width="1" fill="none" opacity=".8"/>`;
    } else s += `<rect x="${f2(x - w * 0.26)}" y="${f2(top + 1)}" width="${f2(w * 0.52)}" height="3.2" rx="1.2" fill="${P.Gdk}"/>`;
    return s;
  }

  /* ---------- the woven jacquard patch ---------- */
  /** A woven patch sewn on the knit: club-secondary ground, a satin-stitch border, a 1u thickness
      shadow, the unmodified colour logo at the top, the ratings in Manrope 700 (tabular) under
      600 caps labels, and the ID, season and country woven along the bottom edge.
      opts.keys: which ratings; opts.cols: 4 (one row) or 1 (a column of two); opts.head: "logo" | "season";
      opts.foot: lines woven along the bottom edge. Returns { svg, h }. */
  function patch(p, o, x, y, w, ids, P, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const k = opts.k || 1;
    const keys = opts.keys || MC.STATS;
    const ncol = opts.cols || keys.length;
    const nrow = Math.ceil(keys.length / ncol);
    const bdr = 2 * k; // satin border
    const pad = 5.6 * k;
    const L = x + bdr + pad;
    const R = x + w - bdr - pad;
    const iw = R - L;
    const lw = Math.min(iw * (ncol > 1 ? 0.32 : 0.78), 58 * k);
    const lh = lw / MC.LOGO_RATIO.wordmark;
    const headY = y + bdr + pad * 0.85;
    const headH = opts.head === "logo" ? lh : 7 * k;
    const figFs = (ncol > 1 ? 14.5 : 15) * k * (opts.figScale || 1);
    const labFs = ar ? 8.4 * k : 7.6 * k;
    const cellH = labFs * 1.25 + figFs * 1.02;
    const stat0 = headY + headH + 6 * k;
    const footFs = (opts.footFs || 5.6) * k;
    const footLines = opts.foot || [];
    const ruleY = stat0 + nrow * cellH + (nrow - 1) * 4 * k + 5 * k;
    const footY0 = ruleY + footFs * 1.45;
    const h = Math.ceil((footLines.length ? footY0 + (footLines.length - 1) * footFs * 1.4 + footFs * 0.55 : ruleY) + pad * 0.7 + bdr - y);
    const thumb = !!opts.thumb;
    let s = "";
    // thickness: a soft shadow, then a 1u hard edge below and to the inline end
    s += `<rect x="${f2(x + 0.6)}" y="${f2(y + 1.6)}" width="${f2(w)}" height="${h}" fill="#020a1c" opacity=".3" filter="url(#${ids.soft})"/>`;
    s += `<rect x="${f2(x + (ar ? -1 : 1) * k)}" y="${f2(y + 1 * k)}" width="${f2(w)}" height="${h}" fill="${mix(P.patch, "#000000", 0.45)}"/>`;
    s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" fill="${P.patch}"/>`;
    if (!thumb) {
      s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" fill="url(#${ids.weave})"/>`;
      // the satin-stitch border (a merrowed edge): threads over the edge, in the club's dark yarn
      s += `<path d="M${f2(x)} ${f2(y)}h${f2(w)}v${h}h${f2(-w)}Z M${f2(x + bdr)} ${f2(y + bdr)}v${f2(h - 2 * bdr)}h${f2(w - 2 * bdr)}v${f2(-(h - 2 * bdr))}Z" fill="url(#${ids.satin})" fill-rule="evenodd"/>`;
      s += `<rect x="${f2(x + bdr + 0.25)}" y="${f2(y + bdr + 0.25)}" width="${f2(w - 2 * bdr - 0.5)}" height="${f2(h - 2 * bdr - 0.5)}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width=".5"/>`;
    } else s += `<path d="M${f2(x)} ${f2(y)}h${f2(w)}v${h}h${f2(-w)}Z M${f2(x + bdr)} ${f2(y + bdr)}v${f2(h - 2 * bdr)}h${f2(w - 2 * bdr)}v${f2(-(h - 2 * bdr))}Z" fill="${P.Gdk}" fill-rule="evenodd"/>`;
    const tx = (xx, yy, str, anchor, cls, fs, dir = "ltr", extra = "") =>
      `<text x="${f2(xx)}" y="${f2(yy)}" text-anchor="${anchor}" direction="${dir}" font-size="${f2(fs)}" class="c07v2-pt ${cls}"${extra}>${esc(str)}</text>`;
    // header: the logo (unmodified, colour) at the inline start; the sample note at the end
    if (opts.head === "logo") {
      const lx = ar ? R - lw : L;
      s += MC.logo("wordmark", { variant: "color", w: f2(lw), h: f2(lh), label: false }).replace("<svg ", `<svg x="${f2(lx)}" y="${f2(headY)}" `);
    }
    if (thumb) {
      keys.forEach((key, i) => {
        const cx = L + (iw / ncol) * ((ar ? ncol - 1 - (i % ncol) : i % ncol) + 0.5);
        const cy = stat0 + Math.floor(i / ncol) * (cellH + 4 * k);
        s += `<rect x="${f2(cx - 7 * k)}" y="${f2(cy)}" width="${f2(14 * k)}" height="${f2(labFs * 0.8)}" fill="${INK_SOFT}" opacity=".45"/><rect x="${f2(cx - 9 * k)}" y="${f2(cy + labFs * 1.2)}" width="${f2(18 * k)}" height="${f2(figFs * 0.72)}" fill="${INK}" opacity=".75"/>`;
      });
      return { svg: s, h };
    }
    // the sample note sits at the inline end of the header (an RTL run anchored at the left edge ends there)
    if (opts.note) s += tx(ar ? L : R, headY + headH * 0.78, opts.note, "end", "c07v2-pt-note" + (ar ? " c07v2-pt-ar" : ""), 5.4 * k, ar ? "rtl" : "ltr");
    if (opts.head === "season") s += tx(ar ? R : L, headY + headH * 0.86, opts.headText || p.season, ar ? "end" : "start", "c07v2-pt-meta", 6.2 * k);
    // the ratings: label (600 caps) over the figure (700, tabular), centred in each column
    keys.forEach((key, i) => {
      const col = i % ncol;
      const rowI = Math.floor(i / ncol);
      const vis = ar ? ncol - 1 - col : col;
      const cx = L + (iw / ncol) * (vis + 0.5);
      const top = stat0 + rowI * (cellH + 4 * k);
      if (ar) s += tx(cx, top + labFs * 0.95, S.stats[key], "middle", "c07v2-pt-k c07v2-pt-ar", labFs, "rtl");
      else s += tx(cx, top + labFs * 0.9, S.stats[key], "middle", "c07v2-pt-k", labFs);
      s += tx(cx, top + labFs * 1.25 + figFs * 0.86, String(p.stats[key]), "middle", "c07v2-pt-v", figFs);
      if (ncol > 1 && col > 0) {
        const sx = L + (iw / ncol) * vis + (ar ? iw / ncol : 0);
        s += `<path d="M${f2(sx)} ${f2(top + 1.5 * k)}V${f2(top + cellH - 1 * k)}" stroke="${mix(P.patch, "#000000", 0.2)}" stroke-width="${f2(0.6 * k)}"/>`;
      }
    });
    // the woven bottom edge: a rule, then the ID's physical carrier
    if (footLines.length) {
      s += `<path d="M${f2(L)} ${f2(ruleY)}H${f2(R)}" stroke="${mix(P.patch, "#000000", 0.22)}" stroke-width="${f2(0.7 * k)}"/>`;
      footLines.forEach((ln, i) => {
        s += `<text x="${f2((L + R) / 2)}" y="${f2(footY0 + i * footFs * 1.4)}" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" font-size="${f2(footFs)}" class="c07v2-pt c07v2-pt-foot${ar ? " c07v2-pt-ar" : ""}">${ln}</text>`;
      });
    }
    // the weave over everything woven (the text reads as floats of thread, not print)
    s += `<rect x="${f2(x + bdr)}" y="${f2(y + bdr)}" width="${f2(w - 2 * bdr)}" height="${f2(h - 2 * bdr)}" fill="url(#${ids.weft})"/>`;
    return { svg: s, h };
  }
  /** The ID's carrier line, woven along the patch's foot (spans so the ID stays left-to-right). */
  function footLine(p, o) {
    const S = MC.s(o);
    if (MC.isAr(o)) return `<tspan direction="ltr" unicode-bidi="embed">${esc(p.id)}</tspan> · <tspan direction="ltr" unicode-bidi="embed">${esc(p.season)}</tspan> · ${esc(S.country)}`;
    return `${esc(p.id)} · ${esc(p.season)} · ${esc(S.country)}`;
  }
  const NOTE = (o) => (MC.isAr(o) ? "J.01–J.07 · مثال" : "J.01–J.07 · Exemple");

  /* ---------- the knitted motifs ---------- */
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
  /** The 84: two 9×13 figures, two stitches apart. */
  const digitsArt = (ovr) => word(String(ovr), D913, 2);
  /** The name with the supporter year after it (ALI ·26): name marks '#', year marks '*'.
      Latin names use the 8-row capitals; when they do not fit, the 5-row ones; then the initial
      (the whole name is then woven into the patch). The year is 5 rows (about 60% of the name),
      sitting on the name's baseline. Arabic reads right to left, so on the page the year comes
      first: 26· علي, the dot between the year and the name. */
  function nameArt(p, o, inner) {
    const ar = MC.isAr(o);
    const name = MC.nameOf(p, o);
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    const dot = { bmp: [".", ".", "*", ".", "."] };
    const yrDigits = yr ? { bmp: tint(word(yr, F35, 1), "*") } : null;
    const attempts = [];
    if (ar) {
      if (AR_NAME[name]) attempts.push({ bmp: AR_NAME[name], base: AR_NAME_BASE[name] });
      else {
        const b = trim(rasterText(name, 9));
        attempts.push({ bmp: b, base: b.length - 1 });
      }
    } else {
      const up = name.toUpperCase();
      attempts.push({ bmp: word(up, N8, 1), base: 7 });
      attempts.push({ bmp: word(up, T5, 1), base: 4 });
    }
    for (const a of attempts) {
      if (!yr) {
        if (bw(a.bmp) <= inner) return { bmp: a.bmp, base: a.base, onPatch: false };
        continue;
      }
      for (const g of [2, 1]) {
        const j = ar ? hjoin([yrDigits, dot, a], [1, g]) : hjoin([a, dot, yrDigits], [g, 1]);
        if (bw(j.bmp) <= inner) return { bmp: j.bmp, base: j.base, onPatch: false };
      }
    }
    // the initial only; the whole name is woven into the patch
    const ini = ar ? trim(rasterText([...name][0], 9)) : N8[name[0].toUpperCase()] || N8.A;
    const a = { bmp: ini, base: ar ? ini.length - 1 : 7 };
    const j = yr ? (ar ? hjoin([yrDigits, dot, a], [1, 2]) : hjoin([a, dot, yrDigits], [2, 1])) : a;
    return { bmp: j.bmp, base: j.base, onPatch: true };
  }
  /** The tier word: Latin on 5 rows; Arabic hand-charted on 8. */
  function tierArt(tier, o, inner = 99) {
    if (MC.isAr(o)) return AR_TIER[tier];
    const w = word(MC.STR.lat.tiers[tier], T5, 1);
    return bw(w) <= inner ? w : word(MC.STR.lat.tiers[tier], { ...T5, ...T5C }, 1);
  }

  /* ---------- full card: the scarf over the rail (HOMA → CHAMPION) ---------- */
  function fullHanging(p, o) {
    const ar = MC.isAr(o);
    const tier = p.tier;
    const Gg = GAUGE[tier];
    const c = Gg.c;
    const P = palette(p);
    const thumb = !!o.thumb;
    const long = !!o.long;
    const u = MC.uid(PFX);
    const id = (k) => `${u}-${k}`;
    const ids = { base: id("pb"), garter: id("pg"), cast: id("pc"), clip: id("cl"), bclip: id("bc"), curl: id("cu"), fold: id("fo"), grain: id("gr"), soft: id("sf"), weave: id("wv"), weft: id("wf"), satin: id("st"), rail: id("rl"), tape: id("tp"), back: id("bk") };
    const cols = Math.round(FW / c);
    const at = (lc) => (ar ? cols - 1 - lc : lc); // logical column (from the inline start) → grid column
    const binding = tier === "CHAMPION";
    const selv = tier === "STADE" || tier === "PRO";
    const reserve = binding ? 4 : selv ? 2 : 1; // stitches taken by selvedges or the bound edges
    const inner = cols - reserve - 2;

    // motifs
    const dg = digitsArt(p.ovr);
    const nm = nameArt(p, o, inner);
    const tw = tierArt(tier, o, inner);
    const twRows = tw.length;

    // rows, from the rail down
    const L = {};
    const keys = []; // a ground-colour override per row ('' = the ground)
    let r = Math.ceil((RAIL_Y + RAIL_H + 3 - FT) / c);
    const push = (n, k = "") => {
      for (let i = 0; i < n; i++) keys.push(k);
      r += n;
    };
    for (let i = 0; i < r; i++) keys.push("");
    // the 84
    if (tier === "PRO") {
      L.digits = r + 1;
      push(15, "C"); // PRO: a cream panel behind the 84
    } else {
      L.digits = r;
      push(tier === "CHAMPION" ? 14 : 13);
      push(1);
    }
    // between the 84 and the name: STADE one stripe, CHAMPION a stripe trio
    if (tier === "STADE") {
      push(2, "S");
      push(1);
    } else if (tier === "CHAMPION") {
      push(2, "S");
      push(1);
    } else if (tier === "PRO") push(1);
    // the name band
    L.name = r + 1;
    push(nm.bmp.length + 2);
    // the tier band, set in the stripes
    const strip = { HOMA: "", STADE: "S", PRO: "", CHAMPION: "" }[tier];
    // STADE has one band (the stripe under its 84; its tier strip is that band's yarn); PRO and
    // CHAMPION frame the tier strip with a stripe on each side
    const stripes = { HOMA: [], STADE: [""], PRO: ["S", ""], CHAMPION: ["S", ""] }[tier];
    const st = stripes;
    for (const k of st) push(1, k);
    L.band = [r, r + twRows + 2];
    L.tier = r + 1;
    push(twRows + 2, strip);
    for (const k of st.slice().reverse()) push(1, k);
    // the season (full length only): one stripe per gameweek played, every fifth in cream
    if (long) {
      push(2);
      L.season = r;
      // every fifth gameweek is a double stripe, so the tally can be counted by fives
      for (let gw = 1; gw <= PLAYED; gw++) {
        push(gw % 5 === 0 ? 2 : 1, "S");
        push(3);
      }
    }
    // the patch, sewn on with a stitch of ground around it
    const pw = FW - 4 * c;
    const px = X0 + 2 * c;
    // a name too long to knit is woven in full along the patch's foot
    const foot = nm.onPatch ? [esc(MC.nameOf(p, o)), footLine(p, o)] : [footLine(p, o)];
    const dry = patch(p, o, 0, 0, pw, ids, P, { head: "logo", foot, note: NOTE(o), thumb });
    push(1);
    L.patch = r;
    push(Math.ceil((dry.h + 2) / c));
    push(1);
    L.rows = r;
    const yOf = (row) => FT + row * c;
    const yFab = yOf(L.rows);
    const yCast = yFab + CAST.rows * CAST.c;
    const fringeLen = { HOMA: 34, STADE: 37, PRO: 39, CHAMPION: 43 }[tier];
    const H = Math.ceil(yCast + fringeLen + 8);

    // the stitch grid
    const g = grid(cols, L.rows, "G");
    keys.forEach((k, i) => {
      if (k && g[i]) for (let cc = 0; cc < cols; cc++) g[i][cc] = k;
    });
    // centre on the stitches between the selvedges (or the bound edges)
    const resStart = binding ? 2 : selv ? 1 : 0;
    const resEnd = binding ? 2 : 1;
    const lo = ar ? resEnd : resStart;
    const hi = cols - (ar ? resStart : resEnd);
    const centre = (bmp) => lo + Math.round((hi - lo - bw(bmp)) / 2);
    // the 84
    const dKey = { HOMA: "R", STADE: "L", PRO: "K", CHAMPION: "F" }[tier];
    const dc = centre(dg);
    if (tier === "CHAMPION") stamp(g, dg, dc + (ar ? -1 : 1), L.digits + 1, { "#": "D" }); // a one-stitch knitted drop shadow
    stamp(g, dg, dc, L.digits, { "#": dKey });
    // the name and its year
    stamp(g, nm.bmp, centre(nm.bmp), L.name, tier === "HOMA" ? { "#": "R", "*": "Y" } : { "#": "N", "*": "Y" });
    // the tier word
    const tKey = { HOMA: "R", STADE: "G", PRO: "S", CHAMPION: "F" }[tier];
    stamp(g, tw, centre(tw), L.tier, { "#": tKey });
    // selvedges: cream at the inline start, Logo Blue at the inline end (HOMA: blue only)
    for (let i = 0; i < L.rows; i++) {
      g[i][at(cols - 1)] = "B";
      if (selv) g[i][at(0)] = "C";
    }
    const PK = { G: P.G, L: P.L, C: P.C, B: P.B, N: P.N, Y: P.Y, R: P.R, S: P.S, D: P.D, K: P.K, F: P.F };

    // defs
    let defs =
      stitchPattern(ids.base, c, { gap: Gg.gap, leg: Gg.leg }) +
      stitchPattern(ids.garter, c, { garter: true, gap: 0.42, leg: 0.3 }) +
      stitchPattern(ids.cast, CAST.c, { gap: 0.18, leg: 0.3, gapC: "#5A4E36" }) +
      steelGrad(ids.rail) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".06" stop-color="#000" stop-opacity=".06"/>` +
      `<stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>` +
      `<linearGradient id="${ids.fold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".25" stop-color="#fff" stop-opacity=".08"/>` +
      `<stop offset=".55" stop-color="#000" stop-opacity=".26"/><stop offset=".78" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.3"/></filter>` +
      `<pattern id="${ids.weave}" width="1.4" height="1.4" patternUnits="userSpaceOnUse"><rect width="1.4" height=".6" fill="#000" opacity=".05"/><rect x=".7" y=".7" width=".7" height=".7" fill="#fff" opacity=".08"/></pattern>` +
      `<pattern id="${ids.weft}" width="3" height="1.1" patternUnits="userSpaceOnUse"><rect width="3" height=".35" fill="${P.patch}" opacity=".32"/></pattern>` +
      hatch(ids.satin, P.Glt, P.Gxd);
    if (binding)
      defs += `<pattern id="${ids.tape}" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="2.2" fill="${P.L}"/><rect width="1" height="2.2" fill="#000" opacity=".12"/></pattern>`;
    if (!thumb)
      defs += `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(p.serial) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;

    // the front drop's outline: the fold over the tube, straight edges, the cast-on edge
    const outline = `M${X0} ${FT + 7}Q${X0} ${FT} ${X0 + 7} ${FT}H${X1 - 7}Q${X1} ${FT} ${X1} ${FT + 7}V${yCast}H${X0}Z`;
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;

    // fabric
    let fab = `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yFab - FT + 0.6)}" fill="${P.G}"/>`;
    if (tier === "HOMA") fab += `<g transform="translate(${f2(c * 0.2)} ${f2(c * 0.3)})" fill="#020a1c" opacity=".38">${keyRects(g, "R", X0, FT, c, c)}</g>`;
    fab += gridRuns(g, PK, X0, FT, c, c, "G");
    fab += `<rect x="${X0}" y="${FT}" width="${FW}" height="${yFab - FT}" fill="url(#${ids.base})"/>`;
    if (tier === "HOMA") {
      // single-colour acrylic: the motifs are knitted in relief (purl ridges), the tier band is a garter strip
      const gx = ar ? X0 + c : X0;
      const gh = f2((L.band[1] - L.band[0]) * c);
      fab += `<rect x="${gx}" y="${f2(yOf(L.band[0]))}" width="${FW - c}" height="${gh}" fill="${P.G}"/><rect x="${gx}" y="${f2(yOf(L.band[0]))}" width="${FW - c}" height="${gh}" fill="url(#${ids.garter})"/>`;
      fab += `<g fill="${P.R}">${keyRects(g, "R", X0, FT, c, c)}</g><g fill="url(#${ids.garter})">${keyRects(g, "R", X0, FT, c, c)}</g>`;
      fab += `<g fill="${P.Y}">${keyRects(g, "Y", X0, FT, c, c)}</g><g fill="url(#${ids.base})">${keyRects(g, "Y", X0, FT, c, c)}</g>`;
    }
    // the cast-on (founders: cream with 2026 and two cables; otherwise plain, in the ground)
    fab += castOn(p, P, ids, yFab, ar, thumb);
    // shading: edge curl, the fold over the tube, fibre grain
    fab +=
      `<g pointer-events="none"><rect x="${X0}" y="${FT}" width="${FW}" height="${yCast - FT}" fill="url(#${ids.curl})"/>` +
      `<rect x="${X0}" y="${FT}" width="${FW}" height="36" fill="url(#${ids.fold})"/>` +
      (thumb ? "" : `<rect x="${X0}" y="${FT}" width="${FW}" height="${yCast - FT}" filter="url(#${ids.grain})" opacity=".5"/>`) +
      `</g>`;

    // CHAMPION: a woven tape bound over both long edges, a Logo Blue thread down the end-side tape
    let bind = "";
    if (binding) {
      const tw2 = f2(c * 1.5);
      for (const side of [0, 1]) {
        const x = side ? X1 - tw2 : X0;
        const endSide = ar ? side === 0 : side === 1;
        bind += `<rect x="${f2(x - (side ? 0 : 0.6))}" y="${FT + 3}" width="${f2(+tw2 + 0.6)}" height="${f2(yCast - FT - 3)}" fill="url(#${ids.tape})"/>`;
        bind += `<rect x="${f2(x)}" y="${FT + 3}" width="${tw2}" height="${f2(yCast - FT - 3)}" fill="url(#${ids.curl})" opacity=".6"/>`;
        if (endSide) bind += `<rect x="${f2(x + tw2 / 2 - 0.9)}" y="${FT + 3}" width="1.8" height="${f2(yCast - FT - 3)}" fill="${BLUE}"/>`;
        const sx = side ? x + 0.8 : x + tw2 - 0.8;
        bind += `<path d="M${f2(sx)} ${FT + 6}V${f2(yCast - 2)}" stroke="${P.Gxd}" stroke-width=".7" stroke-dasharray="2.2 1.6" opacity=".7"/>`;
        bind += `<path d="M${f2(side ? x : x + tw2)} ${FT + 3}V${f2(yCast)}" stroke="#000" stroke-opacity=".28" stroke-width=".8"/>`;
      }
    }

    // the back drop: the rest of the scarf hangs behind the rail, swung a little toward the inline
    // start, so it shows as a wedge of knit beside the front drop; it ends above the cast-on, so its
    // fringe never adds to the tassel count
    let back = "";
    if (!long) {
      const sg = ar ? 1 : -1; // toward the inline start
      const yb = yOf(L.patch) + c * 3;
      const edgeTop = ar ? X1 + 1 : X0 - 1;
      const edgeBot = edgeTop + sg * 15;
      const inner = ar ? X1 - 30 : X0 + 30;
      const bOutline = `M${f2(edgeTop)} ${FT + 10}L${f2(edgeBot)} ${f2(yb - 10)}Q${f2(edgeBot + 0.5 * sg)} ${f2(yb + 2)} ${f2(edgeBot - sg * 12)} ${f2(yb + 1)}L${f2(inner)} ${f2(yb - 4)}V${FT + 10}Z`;
      back += `<clipPath id="${ids.bclip}"><path d="${bOutline}"/></clipPath>`;
      const bx = Math.min(edgeBot, inner) - 2;
      const bwid = Math.abs(inner - edgeBot) + 4;
      back += `<g clip-path="url(#${ids.bclip})"><rect x="${f2(bx)}" y="${FT}" width="${f2(bwid)}" height="${yb - FT + 4}" fill="${P.Gdk}"/>`;
      back += `<rect x="${f2(bx)}" y="${FT}" width="${f2(bwid)}" height="${yb - FT + 4}" fill="url(#${ids.base})"/>`;
      for (const yy of [yb - 5 * c, yb - 3 * c]) back += `<rect x="${f2(bx)}" y="${f2(yy)}" width="${f2(bwid)}" height="${f2(c)}" fill="${mix(P.S, "#000000", 0.42)}"/>`;
      back += `<rect x="${f2(bx)}" y="${FT}" width="${f2(bwid)}" height="${yb - FT + 4}" fill="#000" opacity=".2"/></g>`;
      back += `<path d="${bOutline}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".8"/><path d="${bOutline}" fill="none" class="c07v2-rim" stroke-width=".8"/>`;
    }

    // the fringe: the tassel count is the tier
    const n = TASSELS[tier];
    const rnd = seeded(hashStr(p.serial + "fringe" + tier));
    const tsw = { HOMA: 22, STADE: 17, PRO: 15, CHAMPION: 13 }[tier];
    let fringe = "";
    const tx = (i) => X0 + (FW * (i + 0.5)) / n;
    for (let i = 0; i < n; i++) fringe += tassel(tx(i), yCast - 3, fringeLen + (rnd() * 6 - 3), tsw, P, { rnd, twisted: binding });

    // the rail
    const rail =
      `<rect x="1" y="${RAIL_Y}" width="${VW - 2}" height="${RAIL_H}" rx="${RAIL_H / 2}" fill="url(#${ids.rail})"/>` +
      `<rect x="1.5" y="${RAIL_Y + 0.5}" width="${VW - 3}" height="${RAIL_H - 1}" rx="${RAIL_H / 2 - 0.5}" fill="none" stroke="#4E5661" stroke-width="1"/>` +
      `<path d="M8 ${RAIL_Y + 3.4}H${VW - 8}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
    const rim = `<path class="c07v2-rim" d="${outline}" fill="none" stroke-width="1"/>`;
    const pt = patch(p, o, px, yOf(L.patch) + 1, pw, ids, P, { head: "logo", foot, note: NOTE(o), thumb });

    const svg =
      `<svg class="c07v2-svg" viewBox="0 0 ${VW} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      `<g class="c07v2-back">${back}</g>` +
      (o._noRail ? "" : rail) +
      `<g class="c07v2-sway">` +
      `<g class="c07v2-fringe">${fringe}</g>` +
      `<g class="c07v2-fabric" clip-path="url(#${ids.clip})">${fab}</g>` +
      bind +
      rim +
      pt.svg +
      `</g>` +
      `</svg>`;
    const cls = `c07v2 c07v2--${tier.toLowerCase()}${thumb ? " c07v2--thumb" : ""}${o.motion ? " c07v2--motion" : ""}${P.wool ? " c07v2--wool" : ""}${long ? " c07v2--long" : ""}`;
    return `<div class="${cls}" dir="${MC.s(o).dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}" data-cast="${f2(yCast)}">${svg}</div>`;
  }

  /** The founder's cast-on: five cream rows with 2026 knitted between two cable twists.
      Non-founders cast on plain, in the ground yarn. Digits are never mirrored. */
  function castOn(p, P, ids, y, ar, thumb) {
    const cc = CAST.c;
    const cols = Math.round(FW / cc);
    const h = CAST.rows * cc;
    const founder = !!p.founder;
    const base = founder ? P.cast : P.G;
    let s = "";
    const yr = founder ? word(String(p.founder), F35, 1) : null;
    const c0 = yr ? Math.round((cols - bw(yr)) / 2) : 0;
    for (let r = 0; r < CAST.rows; r++) {
      let row = `<rect x="${X0}" y="${f2(y + r * cc)}" width="${FW}" height="${cc + (r < CAST.rows - 1 ? 0.6 : 0)}" fill="${base}"/>`;
      if (yr) row += `<g fill="${P.castInk}">${bmpRects([yr[r]], X0 + c0 * cc, y + r * cc, cc, cc)}</g>`;
      row += `<rect x="${ar ? X0 : X1 - cc}" y="${f2(y + r * cc)}" width="${cc}" height="${cc + (r < CAST.rows - 1 ? 0.6 : 0)}" fill="${BLUE}"/>`;
      s += `<g class="c07v2-co-row" style="--c07v2-i:${r}">${row}</g>`;
    }
    s += `<g class="c07v2-co-after">`;
    s += `<rect x="${X0}" y="${y}" width="${FW}" height="${h}" fill="url(#${ids.cast})"/>`;
    if (founder && !thumb) {
      const ink = mix(P.cast, "#000000", 0.32);
      const cx = [(X0 + cc + X0 + c0 * cc) / 2, (X0 + (c0 + bw(yr)) * cc + X1 - cc) / 2].map(Math.round);
      for (const x of cx) {
        const a = `M${x - 4} ${y}C${x - 4} ${y + 7} ${x + 4} ${y + 10} ${x + 4} ${y + 17.5}C${x + 4} ${y + 25} ${x - 4} ${y + 28} ${x - 4} ${y + 35}`;
        const b = `M${x + 4} ${y}C${x + 4} ${y + 7} ${x - 4} ${y + 10} ${x - 4} ${y + 17.5}C${x - 4} ${y + 25} ${x + 4} ${y + 28} ${x + 4} ${y + 35}`;
        s += `<rect x="${x - 10}" y="${y}" width="20" height="${h}" fill="${ink}" opacity=".2"/>`;
        s += `<path d="${b}" stroke="${ink}" stroke-width="7.4" fill="none"/><path d="${b}" stroke="${P.cast}" stroke-width="5.2" fill="none"/>`;
        s += `<path d="${a}" stroke="${ink}" stroke-width="7.4" fill="none"/><path d="${a}" stroke="${P.cast}" stroke-width="5.2" fill="none"/>`;
        s += `<path d="${a}" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7" transform="translate(-1 -.6)"/>`;
      }
    }
    if (!thumb) {
      let d = "";
      for (let x = X0 + 3.5; x < X1; x += cc) d += `M${x - 2.4} ${y + h - 0.6}a2.4 1.9 0 0 0 4.8 0`;
      s += `<path d="${d}" stroke="${founder ? mix(P.cast, "#000000", 0.32) : P.Gdk}" stroke-width="1" fill="none"/>`;
    }
    s += `</g>`;
    return `<g class="c07v2-cast${founder ? " c07v2-cast--founder" : ""}">${s}</g>`;
  }

  /* ---------- full card: LEGEND, the scarf raised overhead ---------- */
  /** 'Écharpe levée': lifted off the rail and held taut overhead, its ends wound round two fists,
      the forearms in bench-jacket sleeves with club-colour ribbed cuffs rising from the bottom
      edge. The raised span carries the same three bands as the hanging scarf, at the same
      legibility: the 84 (13 rows), ALI ·26, and the LEGEND strip. The two ends hang in front of
      the forearms with woven patches: CAP and SEL on the reading-start end (with the logo),
      TRF and CON on the other, above the founder's cast-on. Drawn in LTR units; Arabic mirrors
      the structure, never the knitted words. */
  const LGC = 8;
  function fullLegend(p, o) {
    const ar = MC.isAr(o);
    const P = palette(p);
    const thumb = !!o.thumb;
    const u = MC.uid(PFX);
    const id = (k) => `${u}-${k}`;
    const ids = { base: id("pb"), flap: id("pf"), cast: id("pc"), clip: id("cl"), curl: id("cu"), soft: id("sf"), weave: id("wv"), weft: id("wf"), satin: id("st"), grain: id("gr"), sleeve: id("sl"), rib: id("rb"), dA: id("da"), dB: id("db"), arms: id("ar") };
    const c = LGC;
    const dg = digitsArt(p.ovr);
    const nm = nameArt(p, o, 34);
    const tw = tierArt("LEGEND", o);
    const content = Math.max(bw(dg), bw(nm.bmp), bw(tw));
    // the band's rows (across the scarf): cream selvedge, the 84, the name, the tier strip, Logo Blue selvedge
    const keys = [];
    const R = {};
    const push = (n, k = "") => {
      for (let i = 0; i < n; i++) keys.push(k);
    };
    push(1, "C");
    push(1);
    R.digits = keys.length;
    push(14);
    push(1);
    R.name = keys.length;
    push(nm.bmp.length);
    push(1);
    R.strip = keys.length;
    push(tw.length + 2, "S");
    push(1, "B");
    const nRows = keys.length;
    const BH = nRows * c;
    const BY = 16;
    const mid = BY + BH / 2;
    const top = BY;
    const bot = BY + BH;
    const gather = 18;
    const endW = 80;
    const pad = 6;
    const fa = pad + endW + 4;
    const xs = fa + gather;
    const bandCols = content + 4;
    const xe = xs + bandCols * c;
    const fb = xe + gather;
    const W = fb + 4 + endW + pad;
    // the grid runs from fist to fist; the words sit on the full-width part
    const cols = Math.round((fb - fa) / c);
    const g = grid(cols, nRows, "G");
    keys.forEach((k, i) => {
      if (k) for (let cc = 0; cc < cols; cc++) g[i][cc] = k;
    });
    const c0 = Math.round((xs - fa) / c);
    const place = (bmp) => c0 + Math.round((bandCols - bw(bmp)) / 2);
    stamp(g, dg, place(dg) + (ar ? -1 : 1), R.digits + 1, { "#": "D" }); // the knitted drop shadow, as at CHAMPION
    stamp(g, dg, place(dg), R.digits, { "#": "F" });
    stamp(g, nm.bmp, place(nm.bmp), R.name, { "#": "N", "*": "Y" });
    stamp(g, tw, place(tw), R.strip + 1, { "#": "G" });
    const PK = { G: P.G, L: P.L, C: P.C, B: P.B, N: P.N, Y: P.Y, S: P.S, D: P.D, F: P.F };

    // the ends: patches, the founder's cast-on, the fringe
    const pk = 1.08;
    const pw = endW - 14;
    const S = MC.s(o);
    const optA = { k: pk, head: "logo", keys: ["CAP", "SEL"], cols: 1, foot: nm.onPatch ? [esc(MC.nameOf(p, o)), NOTE(o)] : [NOTE(o)], thumb, footFs: 4.8 };
    const optB = { k: pk, head: "season", keys: ["TRF", "CON"], cols: 1, foot: [esc(p.id), esc(S.country)], thumb, footFs: 4.8 };
    const ph = Math.max(patch(p, o, 0, 0, pw, ids, P, optA).h, patch(p, o, 0, 0, pw, ids, P, optB).h);
    const endTop = mid + 20;
    const patchY = mid + 44;
    const LCAST = { c: 5, rows: 5 };
    const castTop = patchY + ph + 10;
    const yEnd = castTop + LCAST.rows * LCAST.c;
    const fringeLen = 54;
    const H = Math.ceil(yEnd + fringeLen + 10);

    let defs =
      stitchPattern(ids.base, c, { gap: 0.48, leg: 0.34, transform: "rotate(-90)" }) +
      stitchPattern(ids.flap, c, { gap: 0.46, leg: 0.32 }) +
      stitchPattern(ids.cast, LCAST.c, { gap: 0.18, leg: 0.3, gapC: "#5A4E36" }) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>` +
      `<linearGradient id="${ids.sleeve}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(SLEEVE, "#000000", 0.35)}"/><stop offset=".45" stop-color="${SLEEVE_LT}"/><stop offset="1" stop-color="${mix(SLEEVE, "#000000", 0.45)}"/></linearGradient>` +
      `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.5"/></filter>` +
      `<pattern id="${ids.weave}" width="1.4" height="1.4" patternUnits="userSpaceOnUse"><rect width="1.4" height=".6" fill="#000" opacity=".05"/><rect x=".7" y=".7" width=".7" height=".7" fill="#fff" opacity=".08"/></pattern>` +
      `<pattern id="${ids.weft}" width="3" height="1.1" patternUnits="userSpaceOnUse"><rect width="3" height=".35" fill="${P.patch}" opacity=".32"/></pattern>` +
      hatch(ids.satin, P.Glt, P.Gxd) +
      `<clipPath id="${ids.arms}"><rect width="${W}" height="${H}"/></clipPath>`;
    if (!thumb)
      defs += `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(p.serial) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;

    // the band, taut between the fists and gathered into each of them
    const gat = 24;
    const outline =
      `M${fa} ${mid - gat}C${fa + 10} ${mid - gat} ${fa + 12} ${top} ${xs} ${top}` +
      `H${xe}C${fb - 12} ${top} ${fb - 10} ${mid - gat} ${fb} ${mid - gat}` +
      `V${mid + gat}C${fb - 10} ${mid + gat} ${fb - 12} ${bot} ${xe} ${bot}` +
      `H${xs}C${fa + 12} ${bot} ${fa + 10} ${mid + gat} ${fa} ${mid + gat}Z`;
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;
    const len = fb - fa;
    let fab = `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="${P.G}"/>` + gridRuns(g, PK, fa, BY, c, c, "G");
    fab += `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.base})"/>`;
    fab += `<g pointer-events="none"><rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.curl})"/>` + (thumb ? "" : `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" filter="url(#${ids.grain})" opacity=".5"/>`) + `</g>`;
    let folds = "";
    for (const [f, dir] of [
      [fa, 1],
      [fb, -1],
    ])
      for (const dy of [-1, -0.45, 0.1, 0.65]) {
        const y1 = mid + dy * gat * 0.8;
        const y2 = mid + dy * BH * 0.46;
        folds += `<path d="M${f2(f + dir * 6)} ${f2(y1)}C${f2(f + dir * 14)} ${f2(y1)} ${f2(f + dir * 18)} ${f2(y2)} ${f2(f + dir * (gather + 14))} ${f2(y2)}" stroke="#000" stroke-opacity=".28" stroke-width="1.6" fill="none"/>`;
      }

    // the ends hang outside the fists, in front of the forearms
    const rnd = seeded(hashStr(p.serial + "fringe-legend"));
    const startSide = ar ? 1 : -1;
    const drape = (side, kind, clipId) => {
      const f = side < 0 ? fa : fb;
      const xL = side < 0 ? f - 4 - endW : f + 4;
      const xT = xL - side * 6; // the top tucks back under the fist
      const d = `M${f2(xT + 8)} ${endTop}H${f2(xT + endW - 8)}C${f2(xT + endW)} ${endTop + 10} ${f2(xL + endW)} ${endTop + 26} ${f2(xL + endW)} ${endTop + 46}V${yEnd}H${f2(xL)}V${endTop + 46}C${f2(xL)} ${endTop + 26} ${f2(xT)} ${endTop + 10} ${f2(xT + 8)} ${endTop}Z`;
      let s = `<clipPath id="${clipId}"><path d="${d}"/></clipPath>`;
      s += `<path d="${d}" fill="#020a1c" opacity=".4" filter="url(#${ids.soft})" transform="translate(${2 * side} 3)"/>`;
      s += `<g clip-path="url(#${clipId})"><rect x="${f2(xL - 12)}" y="${endTop}" width="${endW + 24}" height="${yEnd - endTop}" fill="${P.G}"/>`;
      if (!thumb) s += `<rect x="${f2(xL - 12)}" y="${endTop}" width="${endW + 24}" height="${yEnd - endTop}" fill="url(#${ids.flap})"/>`;
      // the selvedges run down the long edges: cream on the outer edge, Logo Blue on the inner
      const outerX = side < 0 ? xL - 4 : xL + endW - c;
      const innerX = side < 0 ? xL + endW - c : xL - 4;
      s += `<rect x="${f2(outerX)}" y="${endTop}" width="${c + 4}" height="${yEnd - endTop}" fill="${P.C}"/>`;
      s += `<rect x="${f2(innerX)}" y="${endTop}" width="${c + 4}" height="${yEnd - endTop}" fill="${BLUE}"/>`;
      // two stripes under the fist
      for (const yy of [endTop + 10, endTop + 20]) s += `<rect x="${f2(xL - 12)}" y="${yy}" width="${endW + 24}" height="${c - 3}" fill="${P.S}"/>`;
      if (kind === "cast") {
        const founder = !!p.founder;
        s += `<rect x="${f2(xL - 4)}" y="${castTop}" width="${endW + 8}" height="${LCAST.rows * LCAST.c}" fill="${founder ? P.cast : P.G}"/>`;
        if (founder) {
          const yr = word(String(p.founder), F35, 1);
          const yx = xL + Math.round((endW - bw(yr) * LCAST.c) / 2);
          s += `<g fill="${P.castInk}">${bmpRects(yr, yx, castTop, LCAST.c, LCAST.c)}</g>`;
        }
        if (!thumb) s += `<rect x="${f2(xL - 4)}" y="${castTop}" width="${endW + 8}" height="${LCAST.rows * LCAST.c}" fill="url(#${ids.cast})"/>`;
      } else for (const yy of [castTop + 4, castTop + 14]) s += `<rect x="${f2(xL - 4)}" y="${yy}" width="${endW + 8}" height="${c - 3}" fill="${P.S}"/>`;
      s += `<rect x="${f2(xL - 12)}" y="${endTop}" width="${endW + 24}" height="${yEnd - endTop}" fill="url(#${ids.curl})" opacity=".5"/></g>`;
      s += `<path d="${d}" fill="none" stroke="${P.Gdk}" stroke-width="1"/><path d="${d}" fill="none" class="c07v2-rim" stroke-width="1"/>`;
      s += patch(p, o, xL + (endW - pw) / 2, patchY, pw, ids, P, kind === "cast" ? optB : optA).svg;
      let fr = "";
      for (let i = 0; i < TASSELS.LEGEND; i++) {
        const x = xL + (endW * (i + 0.5)) / TASSELS.LEGEND;
        fr += tassel(x, yEnd - 3, fringeLen + rnd() * 8, 17, P, { rnd, knotted: true, hang: side * 2.5 });
      }
      return `<g class="c07v2-fringe">${fr}</g><g class="c07v2-end">${s}</g>`;
    };
    // the forearms, in bench-jacket sleeves, rising from the bottom edge to the fists behind the band
    const forearm = (cx, side) => {
      const lean = -side * 46;
      const t = mid;
      const d = `M${f2(cx - 22)} ${t}L${f2(cx + 22)} ${t}L${f2(cx + lean + 32)} ${H + 2}L${f2(cx + lean - 32)} ${H + 2}Z`;
      let a = `<path d="${d}" fill="#020a1c" opacity=".35" filter="url(#${ids.soft})" transform="translate(2 3)"/>`;
      a += `<path d="${d}" fill="url(#${ids.sleeve})"/>`;
      a += `<path d="M${f2(cx + side * 6)} ${t + 60}L${f2(cx + lean + side * 12)} ${H + 2}" stroke="${mix(SLEEVE, "#000000", 0.4)}" stroke-width="1.6"/>`;
      a += `<path d="M${f2(cx - side * 14)} ${t + 40}L${f2(cx + lean - side * 22)} ${H + 2}" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`;
      a += `<path d="${d}" fill="none" class="c07v2-rim" stroke-width="1.2"/>`;
      return a;
    };
    // the fists: the scarf's end wound round each hand, so no hand and no skin tone shows
    const fist = (cx, dir) => {
      const fw = 50;
      const fh = 60;
      const x = cx - fw / 2;
      const y = mid - fh / 2 - 2;
      let s = `<g filter="url(#${ids.soft})" opacity=".45" transform="translate(${dir * 2} 3)"><rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="18" fill="#020a1c"/></g>`;
      s += `<rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="18" fill="${P.G}"/>`;
      if (!thumb) s += `<rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="18" fill="url(#${ids.flap})"/>`;
      // three turns of the scarf, each edged by a selvedge
      [y + 15, y + 30, y + 45].forEach((yy, i) => {
        const sl = dir * (i - 1) * 2.5;
        s += `<path d="M${x} ${f2(yy + sl)}Q${cx} ${f2(yy - 6)} ${x + fw} ${f2(yy - sl)}" stroke="#000" stroke-opacity=".4" stroke-width="2.2" fill="none"/>`;
        s += `<path d="M${x + 1} ${f2(yy + sl + 2.6)}Q${cx} ${f2(yy - 3.2)} ${x + fw - 1} ${f2(yy - sl + 2.6)}" stroke="${i === 1 ? BLUE : P.C}" stroke-width="2.4" fill="none"/>`;
      });
      s += `<rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="18" fill="none" stroke="${P.Gxd}" stroke-width="1.2"/>`;
      s += `<rect x="${x}" y="${y}" width="${fw}" height="${fh}" rx="18" fill="none" class="c07v2-rim" stroke-width="1"/>`;
      s += `<path d="M${x + 10} ${y + 5}Q${cx} ${y - 1} ${x + fw - 10} ${y + 5}" stroke="#fff" stroke-opacity=".28" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      return `<g class="c07v2-fist">${s}</g>`;
    };
    const rim = `<path class="c07v2-rim" d="${outline}" fill="none" stroke-width="1.2"/>`;
    const svg =
      `<svg class="c07v2-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      `<g clip-path="url(#${ids.arms})"><g class="c07v2-arms">${forearm(fa, -1)}${forearm(fb, 1)}</g></g>` +
      `<g class="c07v2-raise">` +
      `<g class="c07v2-fabric" clip-path="url(#${ids.clip})">${fab}${folds}</g>` +
      rim +
      `</g>` +
      `<g class="c07v2-arms">${drape(startSide, "label", ids.dA)}${drape(-startSide, "cast", ids.dB)}${fist(fa, -1)}${fist(fb, 1)}</g>` +
      `</svg>`;
    const cls = `c07v2 c07v2--legend${thumb ? " c07v2--thumb" : ""}${o.motion ? " c07v2--motion" : ""}${P.wool ? " c07v2--wool" : ""}`;
    return `<div class="${cls}" dir="${MC.s(o).dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="LEGEND">${svg}</div>`;
  }

  function full(p, o = {}) {
    return p.tier === "LEGEND" ? fullLegend(p, o) : fullHanging(p, o);
  }

  /* ---------- token (44–80px) and mini (24–32px): whole pixels, no filters ---------- */
  /** A precomputed knit texture: one chevron per stitch, `pc` px wide (the gauge). */
  function chevron(id, pc) {
    const h = Math.max(2, Math.round(pc * 0.9));
    return `<pattern id="${id}" width="${pc}" height="${h}" patternUnits="userSpaceOnUse"><path d="M0 ${f2(h * 0.12)}L${f2(pc / 2)} ${f2(h * 0.78)}L${pc} ${f2(h * 0.12)}" stroke="#000" stroke-opacity=".26" stroke-width="${f2(Math.max(0.5, pc * 0.26))}" fill="none"/><path d="M0 ${f2(h * 0.55)}L${f2(pc / 2)} ${f2(h * 1.2)}" stroke="#fff" stroke-opacity=".1" stroke-width="${f2(Math.max(0.4, pc * 0.18))}" fill="none"/></pattern>`;
  }
  /** Tassels for tokens: a wrapped head, a bundle that swells a little, then tapers to a soft
      point; n of them hang from y, splaying slightly outward. Whole-pixel tops. */
  function points(n, x0, x1, y, len, w, fill, cls, splay, wrap) {
    let s = "";
    for (let i = 0; i < n; i++) {
      const x = Math.round(n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1));
      const sp = (i - (n - 1) / 2) * splay;
      const hw = w / 2;
      const bulge = Math.max(hw, hw * 1.18);
      const tip = Math.max(0.45, w * 0.12);
      const ym = y + len * 0.42;
      s += `<path d="M${f2(x - hw * 0.8)} ${y}H${f2(x + hw * 0.8)}L${f2(x + bulge + sp * 0.4)} ${f2(ym)}L${f2(x + tip + sp)} ${f2(y + len)}H${f2(x - tip + sp)}L${f2(x - bulge + sp * 0.4)} ${f2(ym)}Z" fill="${fill}" class="${cls}"/>`;
      if (wrap && w >= 4) s += `<rect x="${f2(x - hw * 0.85)}" y="${f2(y + Math.max(1, len * 0.1))}" width="${f2(w * 0.85)}" height="${f2(Math.max(1, len * 0.08))}" fill="${wrap}"/>`;
    }
    return s;
  }
  function token(p, o = {}) {
    const s = Math.max(20, Math.round(o.size || 44));
    const mini = !!o.mini || s <= 32;
    const tier = p.tier;
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const P = palette(p);
    const yr = p.founder ? ` ·${String(p.founder).slice(-2)}` : "";
    const label = `${MC.nameOf(p, o)}${yr}, ${p.ovr} ${S.ovr}, ${S.tiers[tier]}${p.founder ? ", " + S.founderLine : ""}`;
    const u = MC.uid(PFX + "t");
    const b = tier === "LEGEND" ? tokenLegend(p, P, s, mini, u, ar) : tokenHanging(p, P, tier, s, mini, u, ar);
    // the art is drawn left to right and mirrored for Arabic; figures are placed on top, never mirrored
    const mx = (x, w) => (ar ? b.w - x - w : x);
    let figs = `<g transform="translate(${mx(b.dx, b.dw)} ${b.dy})">${b.figs}</g>`;
    if (b.year) figs += `<g fill="${b.year.fill}" transform="translate(${mx(b.year.x, b.year.w)} ${b.year.y})" shape-rendering="crispEdges">${bmpRects(b.year.bmp, 0, 0, 1, 1)}</g>`;
    const art = ar ? `<g transform="matrix(-1 0 0 1 ${b.w} 0)">${b.art}</g>` : b.art;
    return (
      `<span class="c07v2-tk c07v2-tk--${tier.toLowerCase()}${mini ? " c07v2-tk--mini" : ""}" role="img" aria-label="${esc(label)}" style="width:${b.w}px;height:${s}px">` +
      `<svg width="${b.w}" height="${s}" viewBox="0 0 ${b.w} ${s}" aria-hidden="true" focusable="false"><defs>${b.defs}</defs>${art}${figs}</svg></span>`
    );
  }
  /** The 84 for a token, on whole pixels: the 9×13 chart where it fits, else the bold 5×7.
      HOMA keeps the coarse 5×7 at a larger cell, so its gauge reads even at 80px. */
  function tokenFigures(p, tier, avail, mini, s) {
    let chart = F57;
    let k = 1;
    if (tier === "HOMA") k = mini ? 1 : Math.max(1, Math.min(3, Math.floor(avail / 8)));
    else {
      const k13 = Math.floor(avail / 13);
      if (k13 >= 1 && (!mini || s >= 32)) {
        chart = D913;
        k = Math.min(k13, mini ? 1 : 2);
      }
    }
    const bmp = word(String(p.ovr), chart, chart === D913 ? 2 : 1);
    return { bmp, k, w: bw(bmp) * k, h: bmp.length * k };
  }
  function tokenHanging(p, P, tier, s, mini, u, ar) {
    const ry = mini ? 2 : Math.max(2, Math.round(s * 0.06));
    const t = mini ? 2 : Math.max(3, Math.round(s * 0.075));
    const railB = ry + t;
    const tl = mini ? (s >= 32 ? 9 : s >= 28 ? 8 : 7) : Math.round(s * 0.26);
    const sb = s - tl; // the swatch's foot
    const fb = p.founder ? (mini ? 3 : Math.max(3, Math.round(s * 0.08))) : 0;
    const pro = tier === "PRO" && !mini; // PRO's cream panel from 44px
    const champ = tier === "CHAMPION";
    const shadow = champ && !mini;
    const top = railB + 1;
    const bottom = sb - fb - 1;
    const F = tokenFigures(p, tier, bottom - top - (shadow ? 1 : 0) - (pro ? 2 : 0), mini, s);
    const k = F.k;
    const blue = mini ? 1 : Math.max(1, Math.round(s * 0.03));
    const bind = champ ? (mini ? 1 : Math.max(1, Math.round(s * 0.035))) : 0;
    const pin = pro ? Math.max(1, Math.round(s * 0.035)) : 0; // the club colour framing PRO's panel
    const m = mini ? 1 : pin + k + 1;
    const sw = F.w + 2 * m + blue + 2 * bind + (shadow ? k : 0);
    const oh = mini ? 3 : Math.max(4, Math.round(s * 0.11));
    const sx = oh;
    const W = sx + sw + oh;
    const n = TASSELS[tier];
    const pc = { HOMA: mini ? 2 : s >= 64 ? 4 : 3, STADE: mini ? 2 : 3, PRO: 2, CHAMPION: 2 }[tier];
    const defs = chevron(u + "-cv", pc);
    const tw = mini ? 2 : Math.max(3, Math.round(s * 0.085));
    const splay = mini ? 0.45 : s * 0.014;
    const fy = top + Math.round((bottom - top - F.h - (shadow ? k : 0)) / 2);
    let a = "";
    // the rail, rounded at both ends
    a += `<rect x="0" y="${ry}" width="${W}" height="${t}" rx="${f2(t / 2)}" fill="#A9B2BE"/><rect x="${f2(t / 3)}" y="${ry}" width="${f2(W - (2 * t) / 3)}" height="${f2(t * 0.4)}" rx="${f2(t * 0.2)}" fill="#E6EBF0"/><rect x="${f2(t / 2)}" y="${f2(ry + t - 1)}" width="${f2(W - t)}" height="1" fill="#4E5661"/>`;
    // the drop, turned over the tube
    const y0 = Math.max(0, ry - (mini ? 1 : 2));
    a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${sb - y0}" fill="${P.G}" class="c07v2-tk-sw"/>`;
    if (pro) {
      const py0 = Math.max(railB + 1, fy - k);
      a += `<rect x="${sx + pin}" y="${py0}" width="${sw - blue - 2 * pin}" height="${Math.min(bottom, fy + F.h + k) - py0}" fill="${P.C}"/>`;
    }
    a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${sb - y0}" fill="url(#${u}-cv)"/>`;
    a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${Math.max(1, ry + Math.round(t / 2) - y0)}" fill="#fff" opacity=".16"/><rect x="${sx}" y="${railB}" width="${sw}" height="${mini ? 1 : Math.max(1, Math.round(t * 0.45))}" fill="#000" opacity=".24"/>`;
    // the Logo Blue selvedge at the end, CHAMPION's bound edges in the second yarn
    a += `<rect x="${sx + sw - blue - bind}" y="${y0}" width="${blue}" height="${sb - y0}" fill="${BLUE}"/>`;
    if (bind) a += `<rect x="${sx}" y="${y0}" width="${bind}" height="${sb - y0}" fill="${P.S}"/><rect x="${sx + sw - bind}" y="${y0}" width="${bind}" height="${sb - y0}" fill="${P.S}"/>`;
    // the founder's cast-on: a cream band at the foot (with 2026 knitted in it from 64px)
    let year = null;
    if (fb) {
      a += `<rect x="${sx}" y="${sb - fb}" width="${sw}" height="${fb}" fill="${P.cast}" class="c07v2-tk-cast"/>`;
      if (fb >= 5) {
        const yb = word(String(p.founder), F35, 1);
        year = { bmp: yb, w: bw(yb), x: sx + Math.round((sw - bw(yb)) / 2), y: sb - fb + Math.floor((fb - 5) / 2), fill: P.castInk };
      }
    }
    // the fringe: tapered tassels, the count is the tier
    const tm = Math.max(tw, Math.round(sw * 0.16));
    a += points(n, sx + tm, sx + sw - tm, sb, tl, tw, P.G, "c07v2-tk-tassel", splay, P.Gxd);
    // the figures (placed by the caller, never mirrored); CHAMPION's carry a knitted drop shadow
    const fx = sx + bind + m + (shadow && ar ? k : 0);
    const key = { HOMA: mini ? P.R2 : P.R, STADE: P.L, PRO: mini ? P.L : P.K, CHAMPION: P.F }[tier];
    let figs = "";
    if (shadow) figs += `<g fill="${P.D}" transform="translate(${ar ? -k : k} ${k})">${bmpRects(F.bmp, 0, 0, k, k)}</g>`;
    figs += `<g fill="${key}">${bmpRects(F.bmp, 0, 0, k, k)}</g>`;
    return { w: W, h: s, art: a, defs, figs: `<g shape-rendering="crispEdges">${figs}</g>`, dx: fx, dy: fy, dw: F.w, year };
  }
  function tokenLegend(p, P, s, mini, u, ar) {
    // raised: the band held overhead, its ends wound round two fists; the forearms rise from the
    // bottom edge and meet like a V; each end hangs outside its fist and ends in a tassel
    const F = tokenFigures(p, "LEGEND", mini ? 9 : s >= 72 ? 26 : 13, mini, s);
    const k = F.k;
    const sel = mini ? 1 : Math.max(1, Math.round(s * 0.03));
    const m = mini ? 1 : k + 1;
    const bh = F.h + 2 * m + 2 * sel + (mini ? 0 : k);
    const by = mini ? 2 : Math.max(2, Math.round(s * 0.05));
    const fw = mini ? 4 : Math.max(5, Math.round(s * 0.12));
    const fh = Math.round(bh * 0.72);
    const ew = mini ? 2 : Math.max(3, Math.round(s * 0.075));
    const bwid = F.w + 2 * (m + 1) + (mini ? 0 : k);
    const x0 = ew + 1 + Math.round(fw / 2);
    const W = x0 + bwid + Math.round(fw / 2) + ew + 1;
    const fy = by + Math.round((bh - fh) / 2);
    const tl = mini ? 5 : Math.round(s * 0.2);
    const defs = chevron(u + "-cv", 2);
    let a = "";
    // the forearms: from each fist down and inward, meeting the bottom edge like a V
    const aw = mini ? 3 : Math.max(4, Math.round(s * 0.1));
    for (const [cx, dir] of [
      [x0, -1],
      [x0 + bwid, 1],
    ]) {
      const lean = -dir * Math.round(bwid * 0.3);
      a += `<path d="M${cx - aw / 2} ${fy + fh - 1}H${cx + aw / 2}L${f2(cx + aw * 0.42 + lean)} ${s}H${f2(cx - aw * 0.42 + lean)}Z" fill="${SLEEVE}" class="c07v2-tk-arm"/>`;
      // the end hanging outside the fist, with its tassel
      const ex = dir < 0 ? cx - fw / 2 - ew + 1 : cx + fw / 2 - 1;
      const eh = Math.round(s - tl - fy - 1);
      a += `<rect x="${ex}" y="${fy + 1}" width="${ew}" height="${eh}" fill="${P.G}" class="c07v2-tk-sw"/>`;
      const cb = mini ? 2 : Math.max(2, Math.round(s * 0.06));
      if (p.founder && dir > 0) a += `<rect x="${ex}" y="${fy + 1 + eh - cb}" width="${ew}" height="${cb}" fill="${P.cast}" class="c07v2-tk-cast"/>`;
      a += points(1, ex + ew / 2, ex + ew / 2, fy + 1 + eh, tl, Math.max(2, ew), P.G, "c07v2-tk-tassel", 0);
    }
    // the raised band
    a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${bh}" fill="${P.G}" class="c07v2-tk-sw"/>`;
    a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${bh}" fill="url(#${u}-cv)"/>`;
    a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${sel}" fill="${P.C}"/><rect x="${x0}" y="${by + bh - sel}" width="${bwid}" height="${sel}" fill="${BLUE}"/>`;
    // the fists: rounded bundles of the scarf
    for (const cx of [x0, x0 + bwid]) {
      a += `<rect x="${cx - fw / 2}" y="${fy}" width="${fw}" height="${fh}" rx="${f2(fw * 0.42)}" fill="${P.G}" stroke="${P.Gxd}" stroke-width="${mini ? 0.6 : 1}" class="c07v2-tk-fist"/>`;
      if (!mini) a += `<path d="M${cx - fw / 2 + 1} ${fy + Math.round(fh * 0.5)}H${cx + fw / 2 - 1}" stroke="${P.C}" stroke-width="${Math.max(1, Math.round(s * 0.02))}"/>`;
    }
    const dy = by + sel + m;
    const dx = x0 + Math.round((bwid - F.w - (mini ? 0 : k)) / 2) + (ar && !mini ? k : 0);
    const figs = `<g shape-rendering="crispEdges">${mini ? "" : `<g fill="${P.D}" transform="translate(${ar ? -k : k} ${k})">${bmpRects(F.bmp, 0, 0, k, k)}</g>`}<g fill="${P.F}">${bmpRects(F.bmp, 0, 0, k, k)}</g></g>`;
    return { w: W, h: s, art: a, defs, figs, dx, dy, dw: F.w };
  }

  /* ---------- row: the "My position" card, your scarf on a stretch of barrier ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tier = p.tier;
    const tk = token(p, { ...o, size: 56, mini: false });
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    const year = yr ? (ar ? ` <bdi dir="ltr" class="c07v2-row-yr">${yr}·</bdi>` : ` <span class="c07v2-row-yr">·${yr}</span>`) : "";
    return (
      `<div class="c07v2-row c07v2-row--${tier.toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}">` +
      `<span class="c07v2-row-rail" aria-hidden="true"></span>` +
      `<span class="c07v2-row-rank">${MC.ltr(o.rank)}</span>` +
      `<span class="c07v2-row-token">${tk}</span>` +
      `<span class="c07v2-row-name"><b>${esc(MC.nameOf(p, o))}${year}</b><small>${esc(S.tiers[tier])} · ${MC.ltr(p.ovr + " " + S.ovr)}</small></span>` +
      `<span class="c07v2-row-pts">${MC.ltr(o.pts)}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- share: "Sur la barrière", the whole scarf on the barrier at night ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid(PFX + "s");
    const legend = p.tier === "LEGEND";
    const card = full(p, { ...o, motion: false, thumb: false, long: true, _noRail: true });
    const vb = (card.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/) || [0, VW, 600]).map(Number);
    const M = 24; // the safe margin round the whole scarf
    const railY = 112;
    let k;
    let left;
    let top;
    if (legend) {
      k = Math.min((360 - 2 * M) / vb[1], (640 - railY - M) / vb[2]);
      left = (360 - vb[1] * k) / 2;
      top = railY;
    } else {
      // from the rail to the fringe's tips, inside the margin
      k = (640 - M - railY) / (vb[2] - (RAIL_Y + RAIL_H / 2));
      left = (360 - FW * k) / 2 - X0 * k;
      top = railY - (RAIL_Y + RAIL_H / 2) * k;
    }
    const sw = vb[1] * k;
    const postX = ar ? M + 6 : 360 - M - 14;
    const bg =
      `<svg class="c07v2-sh-bg" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true">` +
      `<defs>` +
      `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080F"/><stop offset=".45" stop-color="#0A1220"/><stop offset="1" stop-color="#04070D"/></linearGradient>` +
      `<radialGradient id="${u}-fl" cx="${ar ? 0.15 : 0.85}" cy=".04" r=".8"><stop offset="0" stop-color="#EAF2FF" stop-opacity=".42"/><stop offset=".22" stop-color="#9DB8E6" stop-opacity=".14"/><stop offset=".6" stop-color="#2A3F66" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${u}-pitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E2416" stop-opacity="0"/><stop offset=".25" stop-color="#173A22"/><stop offset=".7" stop-color="#1F4A2B"/><stop offset="1" stop-color="#0B1A10"/></linearGradient>` +
      `<filter id="${u}-bl" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="9"/></filter>` +
      steelGrad(u + "-st") +
      `<linearGradient id="${u}-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4E5661"/><stop offset=".4" stop-color="#C6CDD6"/><stop offset="1" stop-color="#5E6876"/></linearGradient>` +
      `</defs>` +
      `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
      // the pitch beyond, out of focus (no stands, no steps)
      `<g filter="url(#${u}-bl)" opacity=".9"><rect x="-20" y="330" width="400" height="330" fill="url(#${u}-pitch)"/>` +
      `<path d="M-20 400H380M-20 480H380M-20 566H380" stroke="#2C6239" stroke-width="24" opacity=".45"/><path d="M-20 350H380" stroke="#DDE8DF" stroke-width="3" opacity=".5"/></g>` +
      `<rect width="360" height="640" fill="url(#${u}-fl)"/>` +
      // the crowd barrier: top rail, an upright on the far side, a lower rail behind the scarf
      (legend
        ? ""
        : `<rect x="${postX}" y="${railY}" width="8" height="${300}" fill="url(#${u}-post)"/>` +
          `<rect x="0" y="${railY + 296}" width="360" height="9" rx="4.5" fill="url(#${u}-st)" opacity=".7"/>` +
          `<rect x="-8" y="${railY - 7}" width="376" height="14" rx="7" fill="url(#${u}-st)"/>` +
          `<path d="M0 ${railY - 3.6}H360" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>`) +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "light", w: "100%" });
    const cap = ar ? ["موسمي،", "صفًّا بعد صف"] : ["Ma saison,", "rang par rang"];
    return (
      `<div class="c07v2-share${legend ? " c07v2-share--legend" : ""}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c07v2-sh-logo">${logo}</div>` +
      `<p class="c07v2-sh-cap">${cap.map((l) => `<span>${esc(l)}</span>`).join("")}</p>` +
      `<p class="c07v2-sh-sub"><span dir="ltr">@ali</span> · ${ar ? "مثال" : "Exemple"}</p>` +
      `<div class="c07v2-sh-scarf" style="top:${f2(top)}px;left:${f2(left)}px;width:${f2(sw)}px">${card}</div>` +
      `</div>`
    );
  }

  /* ---------- the sway: drag the scarf and it swings from the rail ---------- */
  function mount(el) {
    if (!el || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const g = el.querySelector(".c07v2-sway");
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
    id: "c07-v2",
    n: 7,
    slug: "07",
    refinedFrom: "c07",
    name: "Écharpe",
    nameAr: "الوشاح",
    category: "youth",
    philosophy: "Your card is your supporter's scarf, draped over the barrier rail in your club's colours: the 84 knitted big, then ALI ·26, then the tier, each on its own band, so the eye steps down the scarf the way it reads a terrace.",
    philosophyAr: "بطاقتك وشاحُ المشجّع مُلقًى على حاجز المدرّج بألوان ناديك: الرقم 84 محبوكًا كبيرًا، ثم «علي 26·»، ثم الرتبة، كلٌّ على شريطه، فتنزل العين على الوشاح كما تقرأ المدرّج.",
    idea: [
      "The card is a knitted supporter scarf draped over a steel crowd-barrier rail. By default (grids, the detail sheet, the tier strip) it is folded: the front drop shows a face of about 1:1.6 (1:1.6 to 1:1.7 for the whole card with its fringe in Latin, 1:1.8 to 1:1.9 in Arabic, whose name and tier word need more rows), and the rest of the scarf hangs behind the rail. That back drop shows as a wedge of knit swung toward the inline start, ending above the cast-on so its fringe never adds to the tassel count. The silhouette is the rail overhanging both sides, the drape, and the fringe.",
      "It reads from the rail down, each element on its own colour band: the 84 (13 rows, 100%), then ALI ·26 (8 rows, about 62% of the 84), then a narrow tier strip set in the stripes (5 rows, about 38%), then the woven patch, then the founder's cast-on and the fringe. Weight steps down with size: the figures have three-stitch stems, the name two, the tier word one.",
      "Every knitted glyph comes from a hand-cleaned chart on an integer stitch grid, drawn from Changa 800 and cleaned stitch by stitch, with nothing rasterised live: figures 9 stitches by 13 rows with open three-stitch counters, Latin capitals on 8 rows with two-stitch stems, tier words on 5 rows, and علي and the five Arabic tier words hand-charted with joins on the baseline. The 8 has two clean counters, and no glyph carries a stray stitch.",
      "The stats sit on a woven jacquard patch sewn on two stitches in from the scarf's edges. The patch has a club-secondary ground (#e9e4d6 for the placeholder club), a 2u satin-stitch border in the club's dark yarn and a 1u thickness edge. The unmodified colour BotolaGO wordmark sits at the top, with the sample note 'J.01–J.07 · Exemple' opposite. The four ratings run in a row: Manrope 700 tabular figures under 600 caps labels at 70% ink. BOT #004821 · 2026/27 · MOROCCO is woven along the bottom edge, and a weft texture lies over everything woven.",
      "The ground is the user's club primary and the second yarn its secondary; the placeholder club gives slate (#3b4a5e) and cream (#e9e4d6). A Logo Blue selvedge runs down the inline-end edge at every tier, as the one fixed brand thread. The module computes contrast for any pair of club colours (relief tint or shade, cast-on colour, patch ground, stripe yarn). Two unbranded proof colourways, teal and cream and orange and black, are exposed as `colourways` and labelled Exemple.",
      "The full-length scarf (o.long) is kept for the share image. It adds the season under the tier strip: one stripe per gameweek played, with every fifth a double stripe, so the scarf grows with the season.",
    ],
    belonging: [
      "It is the object the Moroccan terrace already lives by: a scarf in your club's colours, knitted with your number, your name and your founding year, hung on the barrier.",
      "Status lives in the knit itself and in the fringe. A chunky single-colour HOMA scarf becomes STADE's two-colour jacquard, PRO's fine gauge with a cream panel, and CHAMPION's double-knit with bound edges and twisted cords. At LEGEND you lift it off the rail and hold it up. Friends compare tassels at a glance: two, three, four, five.",
      "ALI ·26 is the supporter-group form of a founding year, so a founder's scarf says 'I was here from the start' the way a curva's banner does.",
      "It is screenshot-worthy as an object, not a number badge. The share image hangs the whole scarf on a barrier at night under 'Ma saison, rang par rang'.",
    ],
    founderMark: [
      "Written into the name band: ALI ·26, with the year knitted in the club's second colour at 5 rows, about 60% of the name's 8 rows, on the name's baseline. In Arabic it reads 26· علي, the dot between the year and the name. On HOMA's single-colour scarf, the ·26 is the one place duplicate-stitched in the second colour.",
      "The craft mark: the first five rows ever knitted, just above the fringe, are a cream cable cast-on with 2026 knitted between two cable twists. They keep one gauge at every tier and read at arm's length. Non-founders cast on plain, in the ground yarn.",
      "At 24px the founder mark is a 3px cast-on stripe at the foot of the mini, in the club's second colour when it is light (cream for the placeholder), edged on the light ground. From 64px, 2026 is knitted into that stripe on whole pixels. The row writes ALI ·26 and never 'FOUNDER 2026'.",
      "Ceremony 'la première maille' (motion on, replayable): the five cast-on rows knit across in turn, then the cables appear. The 84 stays visible throughout; reduced motion shows the finished state.",
    ],
    small: [
      "44–80px token: a hanging segment. It has a steel rail with rounded end caps overhanging both sides, and the club-primary drop turned over the tube, filled with a precomputed chevron knit pattern (an SVG pattern, no filters) whose stitch size is the gauge: 4px at HOMA from 64px, 3px at STADE, 2px at PRO and CHAMPION. The 84 is on whole pixels: the 9×13 chart at 2px from 56px and at 1px at 44px; HOMA keeps a bold 5×7 at 2–3px cells, so its coarse gauge reads at 80px. It also has the Logo Blue selvedge, the founder's cast-on stripe, and tapered tassels, about 30% longer than v1's, with a wrapped head. PRO keeps its cream panel framed in the club colour; CHAMPION keeps its bound edges and the knitted shadow.",
      "24–32px mini, inside the ranking row's name cell: the same object on a 1px grid. A 2px rail with rounded caps, the club-primary drop, the 84 at 1px (the 9×13 chart at 32px, a bold 5×7 at 24–28px), the 3px cast-on stripe for founders, and tapered points counting the tier (2, 3, 4, 5). LEGEND changes the outline: a raised band held by two fists on a V of forearms.",
      "Row (the 'My position' card): the barrier rail runs along the top of the card and the 56px token hangs from it. Beside it are ALI ·26 in Changa 800 (the year at 68% in the muted ink), then the tier with '84 OVR', then the points.",
    ],
    rtl: [
      "The scarf is a textile with no logo rule, so its structure mirrors: the Logo Blue selvedge goes to the left edge, the back drop swings to the right, and the patch's ratings run right to left from CAP. The knitted words are charted in visual order and never mirrored, and the BotolaGO wordmark stays Latin.",
      "علي is hand-charted on 17 stitches by 12 rows, with two-stitch strokes like the Latin capitals. The ain opens to the left of a short stem, the lam rises from the baseline, and the yā's bowl hangs below it with its two dots as 2×2 blocks one row under the bowl. حومة, ملعب, محترف, بطل and أسطورة are hand-charted on 8 rows with one-stitch strokes, joined on the baseline. Other Arabic names fall back to Changa 800 sampled at 9 rows, and those have not been hand-checked.",
      "The patch sets Arabic in Noto Sans Arabic 600 with no letter-spacing. Figures, BOT #004821 and 2026/27 stay left to right. In the row the year is a left-to-right run (26·) after علي, so the dot sits between them; the name cell keeps line-height 1.7 so the yā's dots are never clipped.",
    ],
    tiers: {
      HOMA: "Chunky single-colour acrylic: 8u stitches, 28 across. The 84, the name and the tier word are knitted in relief, in raised purl ridges with a lit tint and a cast shadow, on the one yarn. The tier strip is a garter band, and ·26 is duplicate-stitched in the second colour. The full outline is kept, with the Logo Blue selvedge and 2 tassels.",
      STADE: "Two-colour jacquard at 7u (32 across): the 84 in the second colour on the ground, then one two-row stripe, the name band, and the tier word on a strip of the second yarn. 3 tassels.",
      PRO: "A finer gauge, 6.4u (0.8× HOMA, 35 across). The 84 is knitted in the ground colour on a cream panel, and the tier word in the second colour between two stripes. 4 tassels.",
      CHAMPION: "Double-knit at 5.6u (40 across), with plumper stitches. The cream 84 carries a knitted one-stitch drop shadow in a third, near-black yarn. A woven tape in the club's second colour binds both long edges, with a Logo Blue thread down the end-side tape. 5 two-ply twisted cords end in brushed tips.",
      LEGEND: "'Écharpe levée': lifted off the rail and held overhead, its ends wound round two fists in the scarf itself (no hand and no skin tone shows), with the forearms in graphite bench-jacket sleeves rising from the bottom edge. The raised span carries the same three bands at the same chart sizes: the 84 with its drop shadow, ALI ·26, and the LEGEND strip. The two ends hang outside the fists with woven patches: CAP and SEL with the logo on the reading-start end, and TRF and CON with the ID and country on the other, above the founder's cast-on. About 1.13:1 (456×404u).",
    },
    legend: [
      "The outline changes from hanging (rail, drape, fringe) to raised (a wide band held by two fists on a V of forearms, with the ends hanging beside them). It is visible at 24px.",
      "The stats stay on the front, on the two hanging ends. The 84 is knitted from the same 13-row chart as every other tier and spans about 35% of the card's width (48% on the hanging card).",
      "Its richness comes from the object's physics and the gesture: the drop-shadowed 84, the long hand-knotted fringe, and the scarf wound round the fists. There is no precious metal anywhere.",
      "The moment (motion on, replayable, the 84 visible throughout): the forearms come up, the band lifts and settles taut, and the fringe swings once. Reduced motion shows the raised final state.",
    ],
    advantages: [
      "It is the supporter's own object, in your club's colours, and reads as neither FUT, Sorare, an NFT nor a bank card.",
      "The tier ladder is physical: gauge, colour count, panel, binding, cord and finally the gesture. The tassel count makes it readable down to 24px on both grounds.",
      "The type is clean: hand-cleaned stitch charts for figures, Latin capitals, tier words and the Arabic, with three sizes and three stroke weights making a clear hierarchy.",
      "The ratings are always on the front, on a patch that reads as textile, and the ID has a physical carrier woven into the patch's edge.",
      "The folded state brings the grid aspect to about 1:1.6 to 1:1.7, while the full-length scarf stays available for the share.",
    ],
    risks: [
      "It sits near ultras culture and near Codex's Terrace theme. ALI ·26 is the supporter-group form by design, so free-text names need moderation, and the share keeps stands and steps out of the background.",
      "LEGEND is roughly square (about 1.13:1), so in a fixed-width slot it is shorter than the hanging tiers. Its 84 is about 73% of PRO's width in the same slot.",
      "Arabic cards are taller (about 1:1.8 to 1:1.9), because the hand-charted علي needs 12 rows and the Arabic tier words 8. Only علي and the five tier words are hand-charted; other Arabic names use a sampled fallback.",
      "Latin names longer than the 8-row capitals allow drop to the 5-row capitals, and then to the initial with the full name woven into the patch's foot.",
      "The placeholder club colour is a slate close to navy, so the sample still reads cool. The module's contrast logic has been rendered for the two proof colourways, not for real club palettes, and red with green should appear only when a club's own data says so.",
      "Not built: the band that knits on at gameweek close, a league 'mur des écharpes' share, long-press on the patch, and the multi-segment sway (the drag sway is a single pendulum from the rail).",
      "The Arabic strings (the caption, مثال and the charted tier words) need review by a native MSA reader.",
    ],
    refinementNotes: [
      {
        title: "Knit typography",
        items: [
          "Replaced every live-rasterised glyph with hand-cleaned stitch charts drawn from Changa 800: figures 9×13 with three-stitch stems and open counters (the '+' in the 8, the blob and the A's star artefacts are gone), Latin capitals on 8 rows, and tier words on 5 rows.",
          "Hand-charted علي with joins on the baseline and the yā's dots as 2×2 blocks one row under the bowl. Knitted all five Arabic tier words (v1 embroidered them).",
          "Token and mini figures snap to whole pixels: the same 9×13 chart at 1–2px, with a bold 5×7 at 24–28px.",
        ],
      },
      {
        title: "Hierarchy",
        items: [
          "Sizes now step down: 84 (13 rows), ALI ·26 (8 rows, about 62%), tier strip (5 rows, about 38%), then the patch. Stroke weight steps down with them (three, two and one stitches).",
          "Each element has its own colour band (PRO: cream panel, ground name band, framed tier strip), so the eye steps down the scarf.",
        ],
      },
      {
        title: "Founder mark",
        items: [
          "ALI ·26 is knitted into the name band, with ·26 in the club's second colour at about 60% of the name height. The cream cable cast-on with 2026 stays as the craft mark.",
          "The row and the 44px token no longer write 'PRO FOUNDER 2026'. The row shows ALI ·26, and the token and mini carry a cast-on stripe at least 3px tall at 24px (with 2026 knitted in from 64px).",
        ],
      },
      {
        title: "Stats patch",
        items: [
          "The white UI-like label is now a woven jacquard patch: club-secondary ground, a 2u satin-stitch border, a 1u thickness edge, two stitches in from the scarf's edges, and a weft texture over the text.",
          "The unmodified colour logo is at the top, the ratings in a row (Manrope 700 tabular, 600 caps labels at 70% ink), and BOT #004821 · 2026/27 · MOROCCO woven along the bottom edge. 'J.01–J.07 · Exemple' stays labelled.",
        ],
      },
      {
        title: "Tier physics and LEGEND",
        items: [
          "HOMA: single-colour chunky relief. STADE: two-colour jacquard with one band. PRO: 0.8× gauge and a cream panel. CHAMPION: double-knit, a woven binding tape and twisted cords. The change in gauge shows in the token's chevrons at 80px.",
          "LEGEND is recomposed at full legibility. The raised span carries the 84, ALI ·26 and the LEGEND strip from the same charts; CAP and SEL hang on one end and TRF and CON on the other; the fists are wound in the scarf, so no skin tone shows.",
        ],
      },
      {
        title: "Silhouette and small sizes",
        items: [
          "The new default is a folded state over the rail, about 1:1.6 to 1:1.7 in Latin against v1's 1:2.7, with the back drop shown as a swung wedge. The full-length scarf is kept for the share.",
          "Token and mini: a chevron knit fill in club primary (an SVG pattern, no filters), tapered tassels with a wrapped head, about 30% longer, and a rail with rounded end caps. The tier cue is tassel count, and the raised V at LEGEND.",
          "Share: the whole scarf sits inside a 24px safe margin (fringe and cast-on no longer cropped), centred on the barrier, with no stands in the background.",
        ],
      },
    ],
    colourways: [
      { label: "Exemple", labelAr: "مثال", primary: "#0f6b67", secondary: "#efe6cf" },
      { label: "Exemple", labelAr: "مثال", primary: "#e4570f", secondary: "#151515" },
    ],
    gridWidth: 210,
    detailWidth: 340,
    full,
    token,
    row,
    share,
    mount,
  };
  MC.register(c);
})();
