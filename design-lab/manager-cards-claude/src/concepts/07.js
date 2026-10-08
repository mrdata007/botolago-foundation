/* 07 ÉCHARPE — the card is a supporter scarf still on its knitting needle.
   The live rows on the needle hold the rating; below them the season, one knitted stripe
   per gameweek played (the scarf grows longer as the season goes on); the end knitted first
   holds the figure and the name; the founder's cast-on is white-gold lurex. Every motif is
   rasterised to a stitch grid in JS and drawn as merged colour runs under one
   stitch-texture pattern per gauge. */
(function () {
  const MC = window.MC;
  const PFX = "c07";

  // Faces sampled onto stitch grids by canvas. Asking for them here makes
  // document.fonts.ready wait for them before the lab renders.
  try {
    if (document.fonts && document.fonts.load) {
      ['800 64px "Changa"', '700 64px "Changa"', '700 64px "Reem Kufi"'].forEach((f) =>
        document.fonts.load(f, "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ علي محترف سحيع").catch(() => {}),
      );
    }
  } catch (e) {
    /* rasterising falls back to whatever face is ready */
  }

  /* ---------- yarns (one meaning each) ---------- */
  const YARN = {
    N: "#14305E", // Night: the ground, the jacket
    K: "#0A1D3F", // deep Night: hair
    B: "#0151FC", // Logo Blue: live rows, identity end, gameweeks played
    C: "#EFE8D8", // Cream: letters, figure, bars
    L: "#E8D08A", // white-gold lurex: founder cast-on and LEGEND only
  };
  const INK = "#1E2733";

  /* ---------- geometry (viewBox units) ---------- */
  const VW = 252;
  const X0 = 30;
  const X1 = 222;
  const FW = X1 - X0; // 192
  const NY = 20; // needle centre line
  const ROD = 7; // half the rod's thickness (14u rod)
  const F0 = 36; // first fabric row
  const R = 6; // one logical row
  // Sample season: J.01–J.07 played (labelled sample in the gallery). Only played gameweeks
  // are knitted, so the scarf is as long as the season so far: 7 stripes now, 30 at J.30.
  const PLAYED = 7;
  const MISSED = new Set(); // gameweeks missed would knit as Night/cream marl (none in the sample)
  const SEC = { live: 27, bars: 5, season: PLAYED, label: 11, motif: 16, name: 11, cast: 7 };
  const ORDER = ["live", "bars", "season", "label", "motif", "name", "cast"];
  const Y = {};
  (function () {
    let y = F0;
    for (const k of ORDER) {
      Y[k] = y;
      y += SEC[k] * R;
    }
    Y.end = y;
  })();
  const FRINGE = { HOMA: 26, STADE: 30, PRO: 33, CHAMPION: 36, LEGEND: 51 };
  const vh = (tier) => Y.end + FRINGE[tier] + 14;

  /* gauge = resolution: the tier ladder */
  const GAUGE = {
    HOMA: { cw: 8, ch: 6, sub: 1, kind: "g", gap: 0.46 },
    STADE: { cw: 6, ch: 6, sub: 1, kind: "v", gap: 0.28 }, // machine knit: flatter
    PRO: { cw: 6, ch: 6, sub: 1, kind: "v", gap: 0.42 },
    CHAMPION: { cw: 4, ch: 3, sub: 2, kind: "v", gap: 0.42 },
    LEGEND: { cw: 4, ch: 3, sub: 2, kind: "v", gap: 0.42 },
  };
  /** Jacquard motifs are knitted finer than the body: the figure always gets 4×3 cells. */
  const fineOf = (G) => ({ cw: 4, ch: 3, sub: 2, kind: "v", gap: G.gap });
  const pkey = (G) => `${G.cw}x${G.ch}${G.kind}${Math.round(G.gap * 100)}`;
  const BARS = { HOMA: 0, STADE: 1, PRO: 2, CHAMPION: 3, LEGEND: 3 };
  const TASSELS = { HOMA: 5, STADE: 7, PRO: 9, CHAMPION: 9, LEGEND: 9 };
  // the 84 is sampled from Changa 800 at the tier's own resolution (HOMA keeps its 5×7 bitmap)
  const DROWS = { STADE: 14, PRO: 18, CHAMPION: 34, LEGEND: 34 };

  /* ---------- bitmap type (knitted glyphs) ---------- */
  const F35 = {
    0: ["###", "#.#", "#.#", "#.#", "###"], 1: [".#.", "##.", ".#.", ".#.", "###"], 2: ["###", "..#", "###", "#..", "###"],
    3: ["###", "..#", ".##", "..#", "###"], 4: ["#.#", "#.#", "###", "..#", "..#"], 5: ["###", "#..", "###", "..#", "###"],
    6: ["###", "#..", "###", "#.#", "###"], 7: ["###", "..#", "..#", ".#.", ".#."], 8: ["###", "#.#", "###", "#.#", "###"],
    9: ["###", "#.#", "###", "..#", "###"],
    A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."], C: [".##", "#..", "#..", "#..", ".##"],
    D: ["##.", "#.#", "#.#", "#.#", "##."], E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
    G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
    J: ["..#", "..#", "..#", "#.#", ".#."], K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
    M: ["#.#", "###", "#.#", "#.#", "#.#"], N: ["##.", "#.#", "#.#", "#.#", "#.#"], O: ["###", "#.#", "#.#", "#.#", "###"],
    P: ["##.", "#.#", "##.", "#..", "#.."], Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"],
    S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."], U: ["#.#", "#.#", "#.#", "#.#", "###"],
    V: ["#.#", "#.#", "#.#", "#.#", ".#."], W: ["#.#", "#.#", "###", "###", "#.#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
    "·": [".", ".", "#", ".", "."], " ": ["..", "..", "..", "..", ".."],
  };
  const F57 = {
    0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."], 1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"], 3: ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
    4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."], 5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."], 7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."], 9: [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."], D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"], F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"], H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."], J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"], L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"], N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"], R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."], T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."], V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."], X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."], Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    " ": ["...", "...", "...", "...", "...", "...", "..."],
  };
  /* علي in square Kufic, the grid lettering tradition: ʿayn as a two-pronged cup, lām
     standing, yāʾ turned up with its two dots. Drawn by hand: Arabic at 8 stitch rows
     cannot be sampled from a font without turning to mush (measured). Names without a
     drawn entry knit their initial and carry the full name on the label. */
  const KUFIC = {
    علي: [
      ".......##.....",
      ".......##.....",
      ".......##.####",
      "##.....##.##..",
      "##.....##.##..",
      "##############",
      "..............",
      "..##.##.......",
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
  /** Joins glyphs into one bitmap (rows of '#'/'.'). */
  function word(str, font, gap = 1) {
    const glyphs = [...String(str)].map((ch) => font[ch] || font[ch.toUpperCase()] || font[" "]);
    const h = glyphs[0].length;
    const rows = [];
    for (let r = 0; r < h; r++) rows.push(glyphs.map((g) => g[r]).join(".".repeat(gap)));
    return rows;
  }
  const bw = (bmp) => (bmp.length ? bmp[0].length : 0);
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
  const centreCol = (cols, w) => Math.floor((cols - w) / 2);
  /** Writes a bitmap into the grid; each bitmap pixel covers sx × sy stitches. */
  function stamp(g, bmp, col, row, val, sx = 1, sy = 1) {
    for (let r = 0; r < bmp.length; r++)
      for (let c = 0; c < bmp[r].length; c++) {
        if (bmp[r][c] !== "#") continue;
        for (let yy = 0; yy < sy; yy++)
          for (let xx = 0; xx < sx; xx++) {
            const gr = row + r * sy + yy;
            const gc = col + c * sx + xx;
            if (g[gr] && gc >= 0 && gc < g[gr].length) g[gr][gc] = val;
          }
      }
  }

  /* ---------- canvas rasteriser: shapes and fonts onto a stitch grid ---------- */
  const RCACHE = new Map();
  const fontsReady = (spec) => {
    try {
      return !document.fonts || document.fonts.check(spec);
    } catch (e) {
      return true;
    }
  };
  function raster(key, box, cols, rows, draw, thr = 0.45, cacheable = true) {
    if (RCACHE.has(key)) return RCACHE.get(key);
    const S = 6;
    const cv = document.createElement("canvas");
    cv.width = cols * S;
    cv.height = rows * S;
    const x = cv.getContext("2d");
    x.scale(cv.width / box.w, cv.height / box.h);
    x.translate(-box.x, -box.y);
    draw(x);
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
    if (cacheable) RCACHE.set(key, out);
    return out;
  }
  /** Text sampled from a real face onto `rows` stitch rows (cell aspect cw:ch). */
  function rasterText(text, font, rows, cw, ch, thr = 0.46) {
    const spec = font.replace("{s}", "100px");
    const key = `t|${text}|${font}|${rows}|${cw}|${ch}|${thr}`;
    if (RCACHE.has(key)) return RCACHE.get(key);
    const m = document.createElement("canvas").getContext("2d");
    m.font = spec;
    const mt = m.measureText(text);
    const asc = mt.actualBoundingBoxAscent;
    const hh = asc + mt.actualBoundingBoxDescent;
    const ww = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
    const k = (rows * ch) / hh; // units per font px
    const cols = Math.max(1, Math.round((ww * k) / cw));
    return raster(
      key,
      { x: 0, y: 0, w: ww, h: hh },
      cols,
      rows,
      (x) => {
        x.font = spec;
        x.fillStyle = "#000";
        x.textBaseline = "alphabetic";
        x.textAlign = "left";
        x.fillText(text, mt.actualBoundingBoxLeft, asc);
      },
      thr,
      fontsReady(spec),
    );
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
  /** Font size and origin that put a string's ink box at (cx, top) with height h. */
  function placeInk(text, font, cx, top, h) {
    const m = ink(text, font);
    const fs = (h / (m.asc + m.desc)) * 100;
    const k = fs / 100;
    return { fs: f2(fs), x: f2(cx - ((m.right - m.left) / 2) * k), y: f2(top + m.asc * k) };
  }
  /** The shared avatar (hood up, its default), part by part, onto the stitch grid. Returns a grid of part keys. */
  function rasterAvatar(cols, rows) {
    const key = `av|${cols}|${rows}`;
    if (RCACHE.has(key)) return RCACHE.get(key);
    const A = MC.AVATAR;
    const box = { x: 0, y: 36, w: 200, h: 204 };
    const cellH = box.h / rows;
    const cellW = box.w / cols;
    const part = (name, fn) => raster(`av|${name}|${cols}|${rows}`, box, cols, rows, fn, 0.42);
    const fillP = (d) => (x) => x.fill(new Path2D(d));
    const strokeP = (d, lw) => (x) => {
      x.lineWidth = lw;
      x.stroke(new Path2D(d));
    };
    const layers = A.hood
      ? [
          ["T", part("torso", fillP(A.torso))],
          ["S", part("seam", strokeP(A.seam, cellH * 0.95))],
          ["O", part("hood", fillP(A.hood))],
          ["S", part("hoodSeam", strokeP(A.hoodSeam, cellW * 0.95))],
          ["S", part("hoodRim", strokeP(A.hoodRim, cellH * 0.95))],
        ]
      : [
          ["T", part("torso", fillP(A.torso))],
          ["S", part("seam", strokeP(A.seam, cellH * 0.95))],
          ["O", part("head", fillP(A.head))],
          ["O", part("hair", fillP(A.hair))],
        ];
    const out = grid(cols, rows, ".");
    for (const [k, bmp] of layers) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (bmp[r][c] === "#") out[r][c] = k;
    RCACHE.set(key, out);
    return out;
  }

  /* ---------- the fabric ---------- */
  /** The live rows' art for a tier: the 84 and the knitted tier word. */
  function liveArt(p, tier, G, cols) {
    const ovr = String(p.ovr);
    let d;
    let dsy = 1;
    if (tier === "HOMA") {
      d = word(ovr, F57, 2);
      dsy = 2;
    } else d = trim(rasterText(ovr, '800 {s} "Changa"', DROWS[tier], G.cw, G.ch));
    let w;
    let wsy = G.sub;
    if (tier === "CHAMPION") {
      // the fine gauge can afford real letters: CHAMPION sampled from Changa, curves and all
      w = trim(rasterText("CHAMPION", '700 {s} "Changa"', 10, G.cw, G.ch, 0.44));
      wsy = 1;
    } else {
      w = word(tier, F57, 1);
      if (bw(w) > cols - 1) w = word(tier, F35, 1);
    }
    return { d, dsy, dH: d.length * dsy, w, wsy, wH: w.length * wsy };
  }

  function fabric(p, o) {
    const tier = p.tier;
    const G = GAUGE[tier];
    const ar = MC.isAr(o);
    const cols = FW / G.cw;
    const sub = G.sub;
    const hand = tier === "HOMA";
    const ground = hand ? "N" : "B";
    const bands = [];
    const meta = { nameOnLabel: false };
    const rnd = seeded(hashStr(p.serial + tier));
    const wob = (n) => Array.from({ length: n }, () => (hand ? Math.round(rnd() * 2 - 1) : 0));

    // live rows: the rating, on the needle
    {
      const rows = SEC.live * sub;
      const g = grid(cols, rows, ground);
      const A = liveArt(p, tier, G, cols);
      const free = rows - A.dH - A.wH;
      const gap = Math.max(sub, Math.floor(free / 3));
      const top = Math.ceil((free - gap) / 2);
      stamp(g, A.d, centreCol(cols, bw(A.d)), top, "C", 1, A.dsy);
      const wRow = top + A.dH + gap;
      if (!ar) stamp(g, A.w, centreCol(cols, bw(A.w)), wRow, "C", 1, A.wsy);
      meta.word = { y: Y.live + wRow * G.ch, h: A.wH * G.ch };
      bands.push({ id: "live", y: Y.live, rows, g, G, off: wob(rows) });
    }
    // bars: tier count, still on the live colour
    {
      const rows = SEC.bars * sub;
      const g = grid(cols, rows, ground);
      const at = { 0: [], 1: [2], 2: [1, 3], 3: [0, 2, 4] }[BARS[tier]];
      for (const r of at) for (let s = 0; s < sub; s++) g[r * sub + s].fill("C");
      bands.push({ id: "bars", y: Y.bars, rows, g, G, off: wob(rows) });
    }
    // season: only the gameweeks played are knitted, one stripe each, newest under the needle.
    // Stripes alternate so each one can be counted; J.01 contrasts with the label band.
    {
      const rows = SEC.season * sub;
      const g = grid(cols, rows, "N");
      const odd = hand ? "C" : "N";
      const even = hand ? "N" : "B";
      const edge = ar ? [cols - 1, cols - 2] : [0, 1];
      const mr = seeded(hashStr(p.serial + "marl"));
      meta.stripes = [];
      for (let r = 0; r < SEC.season; r++) {
        const gw = SEC.season - r;
        const col = gw % 2 ? odd : even;
        meta.stripes.push({ gw, y: Y.season + r * R, k: col, missed: MISSED.has(gw) });
        for (let s = 0; s < sub; s++) {
          const row = g[r * sub + s];
          if (MISSED.has(gw)) for (let c = 0; c < cols; c++) row[c] = mr() < 0.4 ? "C" : "N";
          else row.fill(col);
          // tally: a 2-stitch notch on the inline-start selvedge every fifth gameweek
          if (gw % 5 === 0) for (const e of edge) row[e] = col === "C" ? "N" : "C";
        }
      }
      bands.push({ id: "season", y: Y.season, rows, g, G, off: wob(rows) });
    }
    // under the label: plain live colour (the label is sewn on top)
    {
      const rows = SEC.label * sub;
      bands.push({ id: "label", y: Y.label, rows, g: grid(cols, rows, ground), G, off: wob(rows) });
    }
    // the motif panel: the figure on its own finer grid, shoulders seated on the name band.
    // HOMA has no jacquard: its figure is a felt appliqué sewn on afterwards.
    {
      const FG = hand ? G : fineOf(G);
      const rows = SEC.motif * FG.sub;
      const fc = FW / FG.cw;
      const g = grid(fc, rows, ground);
      if (!hand) {
        const figRows = 30;
        let figCols = Math.round(figRows * (200 / 204) * (FG.ch / FG.cw));
        if ((fc - figCols) % 2) figCols += 1;
        const av = rasterAvatar(figCols, figRows);
        const c0 = (fc - figCols) / 2;
        const r0 = rows - figRows;
        const lx = tier === "LEGEND" ? "L" : "C";
        // the shared figure, hood up: a deep-Night hood over a Night bench jacket, its seams
        // (hood centre, hood rim, yoke) knitted in cream, in lurex at LEGEND
        const map = { T: "N", O: "K", S: lx };
        for (let r = 0; r < figRows; r++) for (let c = 0; c < figCols; c++) if (av[r][c] !== ".") g[r0 + r][c0 + c] = map[av[r][c]];
      }
      bands.push({ id: "motif", y: Y.motif, rows, g, G: FG, off: wob(rows) });
    }
    // the name
    {
      const rows = SEC.name * sub;
      const g = grid(cols, rows, ground);
      if (tier === "STADE") for (let s = 0; s < 2 * sub; s++) g[s].fill("C"); // the machine scarf's third yarn: a 2-row stripe
      const name = MC.nameOf(p, o);
      if (ar) {
        const k = KUFIC[name];
        if (k) stamp(g, k, centreCol(cols, bw(k) * sub), 2 * sub, "C", sub, sub);
        else {
          const ini = trim(rasterText([...name][0], '700 {s} "Reem Kufi"', 8 * sub, G.cw, G.ch));
          stamp(g, ini, centreCol(cols, bw(ini)), 2 * sub, "C");
          meta.nameOnLabel = true;
        }
      } else {
        const nm = fitName(name, cols);
        stamp(g, nm.bmp, centreCol(cols, bw(nm.bmp)), (2 + nm.dy) * sub, "C", 1, sub);
        meta.nameOnLabel = nm.cut;
      }
      bands.push({ id: "name", y: Y.name, rows, g, G, off: wob(rows) });
    }
    // cast-on: founders' white-gold rows stay at the chunky first gauge forever.
    // 7 rows: a lurex margin, five glyph rows, a lurex margin. ·26 sits in the inline-end
    // third like a maker's year mark.
    {
      const yr = "·" + String(p.founder || 2026).slice(-2);
      const bmp = word(yr, F35, 1);
      if (p.founder) {
        const CG = GAUGE.HOMA;
        const cc = FW / CG.cw;
        const g = grid(cc, SEC.cast, "L");
        stamp(g, bmp, ar ? 3 : cc - bw(bmp) - 3, 1, "N");
        const r2 = seeded(hashStr(p.serial + "cast"));
        bands.push({ id: "cast", y: Y.cast, rows: SEC.cast, g, G: CG, off: Array.from({ length: SEC.cast }, () => Math.round(r2() * 2 - 1)), lurex: true });
      } else {
        const rows = SEC.cast * sub;
        const g = grid(cols, rows, ground);
        const m = Math.round(cols * 0.1);
        stamp(g, bmp, ar ? m : cols - bw(bmp) * sub - m, sub, "C", sub, sub);
        bands.push({ id: "cast", y: Y.cast, rows, g, G, off: wob(rows) });
      }
    }
    bands.meta = meta;
    return bands;
  }
  /** Picks the knitted name size the way real scarves do: big if it fits, then small, then cut. */
  function fitName(name, cols) {
    const up = name.toUpperCase();
    const big = word(up, F57, 1);
    if (bw(big) <= cols - 2) return { bmp: big, dy: 0, cut: false };
    const small = word(up, F35, 1);
    if (bw(small) <= cols - 2) return { bmp: small, dy: 1, cut: false };
    const parts = up.split(/\s+/);
    let cut = parts.length > 1 ? parts[0][0] + " " + parts[parts.length - 1] : up;
    while (bw(word(cut, F35, 1)) > cols - 2 && cut.length > 1) cut = cut.slice(0, -1);
    return { bmp: word(cut, F35, 1), dy: 1, cut: true };
  }

  /* ---------- SVG building blocks ---------- */
  /** The stitch texture: dark gaps and lit legs over any yarn colour. */
  function stitchPattern(id, G, opt = {}) {
    const w = G.cw;
    const h = G.ch;
    const gid = id + "-lg";
    const gapC = opt.gapC || "#020a1c";
    const gapO = opt.gapO != null ? opt.gapO : G.gap != null ? G.gap : 0.42;
    const legC = opt.legC || "#fff";
    const legO = opt.legO != null ? opt.legO : 0.26;
    const xy = opt.xy || "";
    const grad =
      `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${legC}" stop-opacity="${legO}"/><stop offset=".42" stop-color="${legC}" stop-opacity="${f2(legO * 0.2)}"/>` +
      `<stop offset=".78" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>`;
    if (G.kind === "g") {
      // garter ridges: rows of horizontal bumps in brick bond
      const bumps = [
        [w / 2, h * 0.27],
        [0, h * 0.77],
        [w, h * 0.77],
      ];
      const ell = (cx, cy) => {
        const rx = w * 0.47;
        const ry = h * 0.25;
        return `M${f2(cx - rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx + rx)} ${f2(cy)}A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(cx - rx)} ${f2(cy)}Z`;
      };
      return (
        grad +
        `<pattern id="${id}" width="${f2(w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${xy}>` +
        `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${bumps.map(([x, y]) => ell(x, y)).join("")}" fill="${gapC}" fill-opacity="${gapO}" fill-rule="evenodd"/>` +
        bumps.map(([x, y]) => `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(w * 0.47)}" ry="${f2(h * 0.25)}" fill="url(#${gid})"/>`).join("") +
        `</pattern>`
      );
    }
    // stockinette: each stitch a V of two leaning legs
    const rx = w * 0.25;
    const ry = h * 0.6;
    const legs = [
      [w * 0.29, h * 0.5, -24],
      [w * 0.71, h * 0.5, 24],
    ];
    const ellPath = ([cx, cy, a]) => {
      const t = (a * Math.PI) / 180;
      const ax = ry * Math.sin(-t);
      const ay = ry * Math.cos(t);
      return `M${f2(cx - ax)} ${f2(cy - ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx + ax)} ${f2(cy + ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx - ax)} ${f2(cy - ay)}Z`;
    };
    return (
      grad +
      `<pattern id="${id}" width="${f2(w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${xy}>` +
      `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${legs.map(ellPath).join("")}" fill="${gapC}" fill-opacity="${gapO}" fill-rule="evenodd"/>` +
      legs.map(([cx, cy, a]) => `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(${a} ${f2(cx)} ${f2(cy)})" fill="url(#${gid})"/>`).join("") +
      `</pattern>`
    );
  }
  /** Satin-stitch thread: a 70° hatch of threads and shadow gaps (embroidery, woven figures). */
  function hatch(id, thread, gap, tw = 0.9, gw = 0.5, ang = 20) {
    const p = f2(tw + gw);
    return `<pattern id="${id}" width="${p}" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><rect width="${p}" height="8" fill="${gap}"/><rect width="${tw}" height="8" fill="${thread}"/></pattern>`;
  }

  /** Colour runs for one band, then its stitch texture. HOMA rows wander ±1u (uneven tension). */
  function drawBand(b, ids) {
    const { g, G } = b;
    const rh = G.ch;
    const base = mostCommon(g);
    const pat = ids.pat[pkey(G)];
    let out = "";
    for (let r = 0; r < b.rows; r++) {
      const y = b.y + r * rh;
      const dx = b.off[r] || 0;
      let runs = "";
      let c = 0;
      const row = g[r];
      while (c < row.length) {
        const k = row[c];
        let e = c + 1;
        while (e < row.length && row[e] === k) e++;
        if (k !== base) runs += `<rect x="${X0 + c * G.cw}" y="${f2(y)}" width="${(e - c) * G.cw}" height="${rh}" fill="${YARN[k]}"/>`;
        c = e;
      }
      const rowH = r === b.rows - 1 ? rh : rh + 0.05; // overlap the next row: no hairline seams
      out +=
        `<g${dx ? ` transform="translate(${dx} 0)"` : ""}>` +
        `<rect x="${X0}" y="${f2(y)}" width="${FW}" height="${f2(rowH)}" fill="${YARN[base]}"/>` +
        runs +
        `<rect x="${X0}" y="${f2(y)}" width="${FW}" height="${rh}" fill="url(#${pat})"/>` +
        `</g>`;
    }
    return out;
  }
  /** The founder's cast-on: per-stitch metal ramp, sparkle, ·26 in Night, one specular pass. */
  function drawCast(b, ids, thumb) {
    const { g, G } = b;
    const rh = G.ch;
    let out = "";
    for (let r = 0; r < b.rows; r++) {
      const y = b.y + r * rh;
      const dx = b.off[r] || 0;
      let runs = "";
      let c = 0;
      const row = g[r];
      while (c < row.length) {
        const k = row[c];
        let e = c + 1;
        while (e < row.length && row[e] === k) e++;
        if (k !== "L") {
          const x = X0 + c * G.cw;
          const w = (e - c) * G.cw;
          runs += `<rect x="${x}" y="${y}" width="${w}" height="${rh}" fill="${YARN[k]}"/><rect x="${x}" y="${y}" width="${w}" height="${rh}" fill="url(#${ids.pat[pkey(G)]})"/>`;
        }
        c = e;
      }
      out +=
        `<g${dx ? ` transform="translate(${dx} 0)"` : ""}>` +
        `<rect x="${X0}" y="${y}" width="${FW}" height="${r === b.rows - 1 ? rh : rh + 0.05}" fill="#B8902F"/>` +
        `<rect x="${X0}" y="${y}" width="${FW}" height="${rh}" fill="url(#${ids.lxpat})"/>` +
        (thumb ? "" : `<rect x="${X0}" y="${y}" width="${FW}" height="${rh}" fill="url(#${ids.sparkle})" opacity=".8"/>`) +
        runs +
        `</g>`;
    }
    return `<g class="c07-cast"${thumb ? "" : ` filter="url(#${ids.spec})"`}>${out}</g>`;
  }
  function mostCommon(g) {
    const n = {};
    for (const row of g) for (const k of row) n[k] = (n[k] || 0) + 1;
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  }
  /** Outline that follows every row's wander (the selvedge); PRO cuts its dog-eared corner. */
  function outlinePath(bands, cut) {
    let right = [];
    let left = [];
    for (const b of bands)
      for (let r = 0; r < b.rows; r++) {
        const y = b.y + r * b.G.ch;
        const dx = b.off[r] || 0;
        right.push([X1 + dx, y], [X1 + dx, y + b.G.ch]);
        left.push([X0 + dx, y], [X0 + dx, y + b.G.ch]);
      }
    if (cut) {
      const yc = Y.end - cut.d;
      if (cut.side === "r") {
        right = right.filter(([, y]) => y <= yc);
        right.push([X1 + cut.dx, yc], [X1 - cut.d, Y.end]);
      } else {
        left = left.filter(([, y]) => y <= yc);
        left.push([X0 + cut.dx, yc], [X0 + cut.d, Y.end]);
      }
    }
    const pts = right.concat(left.reverse());
    return "M" + pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join("L") + "Z";
  }

  /** The needle: wood (HOMA), steel, brass (LEGEND). Knob at the inline start, point at the end. */
  function needle(tier, ids) {
    const mat = tier === "HOMA" ? "wood" : tier === "LEGEND" ? "brass" : "steel";
    const grads = {
      steel: ["#5E6876", "#E6EBF0", "#A9B2BE", "#6E7886", "#C6CDD6"],
      wood: ["#6B4A2A", "#E2BE8C", "#B08A5E", "#7A5634", "#C9A06C"],
      brass: ["#6E5018", "#FFF1BE", "#D7B256", "#8C6A22", "#F1D98A"],
    }[mat];
    const g = ids.needle;
    const defs =
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${grads[0]}"/><stop offset=".26" stop-color="${grads[1]}"/>` +
      `<stop offset=".52" stop-color="${grads[2]}"/><stop offset=".85" stop-color="${grads[3]}"/><stop offset="1" stop-color="${grads[4]}"/></linearGradient>` +
      `<radialGradient id="${g}-k" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="${grads[1]}"/><stop offset=".45" stop-color="${grads[2]}"/><stop offset="1" stop-color="${grads[0]}"/></radialGradient>`;
    const t = NY - ROD;
    const b = NY + ROD;
    // 14u rod, a 26u point at the inline end, a 14u-radius knob at the inline start
    const rod = `<path d="M14 ${t}H226L252 ${NY}L226 ${b}H14Z" fill="url(#${g})"/>` + `<path d="M14 ${b - 0.5}H226L250 ${NY + 0.6}" stroke="#2E3540" stroke-opacity=".55" stroke-width="1" fill="none"/>`;
    const grain =
      mat === "wood"
        ? `<path d="M34 ${NY - 3}H110M128 ${NY + 2}H214M64 ${NY + 4}H150M160 ${NY - 3.6}H222" stroke="#6B4A2A" stroke-width=".6" opacity=".55"/>`
        : `<path d="M30 ${NY - 3.2}H226" stroke="#fff" stroke-width="1.2" opacity="${mat === "brass" ? 0.75 : 0.6}" stroke-linecap="round"/>`;
    const collar = mat === "wood" ? "" : `<rect x="25" y="${t - 1.6}" width="5" height="${2 * ROD + 3.2}" rx="1.4" fill="url(#${g})"/>`;
    const knob =
      `<circle cx="14" cy="${NY}" r="14" fill="url(#${g}-k)"/><circle cx="14" cy="${NY}" r="13.5" fill="none" stroke="#2E3540" stroke-opacity=".35" stroke-width="1"/>` +
      (mat === "brass" ? `<circle cx="14" cy="${NY}" r="8.6" fill="none" stroke="#6E5018" stroke-width="1" opacity=".75"/><circle cx="14" cy="${NY}" r="3.2" fill="#FFF1BE" opacity=".85"/>` : "");
    return { defs, body: rod + grain + collar + knob };
  }

  /** Loops of the live row wrapped over the needle. */
  function loops(tier, G) {
    const k = tier === "HOMA" ? "N" : "B";
    let d = "";
    let hl = "";
    const n = FW / G.cw;
    for (let c = 0; c < n; c++) {
      const x1 = X0 + c * G.cw + G.cw * 0.22;
      const x2 = X0 + c * G.cw + G.cw * 0.78;
      d += `M${f2(x1)} ${F0 + 3}C${f2(x1)} ${NY - 19} ${f2(x2)} ${NY - 19} ${f2(x2)} ${F0 + 3}`;
      hl += `M${f2(x1 + 0.4)} ${NY + 3}C${f2(x1 + 0.4)} ${NY - 14} ${f2(x2 - 0.4)} ${NY - 14} ${f2(x2 - 0.4)} ${NY + 3}`;
    }
    const sw = G.cw * 0.42;
    return (
      `<path d="${d}" fill="none" stroke="#020a1c" stroke-opacity=".55" stroke-width="${f2(sw + 1)}" stroke-linecap="round"/>` +
      `<path d="${d}" fill="none" stroke="${YARN[k]}" stroke-width="${f2(sw)}" stroke-linecap="round"/>` +
      `<path d="${hl}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="${f2(sw * 0.4)}" stroke-linecap="round"/>`
    );
  }

  /** Fringe: tassels of mixed yarn (cream reads on night grounds, night on day grounds). */
  function fringe(p, o, ids, thumb) {
    const tier = p.tier;
    const ar = MC.isAr(o);
    const n = TASSELS[tier];
    const rnd = seeded(hashStr(p.serial + "fringe" + tier));
    let span = [X0 + 8, X1 - 8];
    if (tier === "PRO") span = ar ? [X0 + 26, X1 - 8] : [X0 + 8, X1 - 26]; // clear of the dog-ear
    const base = FRINGE[tier];
    const top = Y.end + 1.5;
    let out = "";
    let knots = "";
    for (let i = 0; i < n; i++) {
      const x = span[0] + ((span[1] - span[0]) * i) / (n - 1);
      const len = base + (rnd() * 6 - 3);
      const bot = top + len;
      const sway = rnd() * 3 - 1.5;
      if (tier === "LEGEND") {
        // bullion: two coiled gold threads twisted round each other
        const strand = (side, ph) => {
          let d = "";
          const steps = 26;
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const cx = x + sway * Math.sin(t * Math.PI) + side * 1.5 * Math.cos(t * Math.PI * 3 + ph);
            d += `${k ? "L" : "M"}${f2(cx)} ${f2(top + t * len)}`;
          }
          return d;
        };
        for (const [side, ph] of [
          [1, 0],
          [-1, 0],
        ]) {
          const d = strand(side, ph);
          out +=
            `<path d="${d}" stroke="#4A3510" stroke-width="3.4" fill="none" stroke-linecap="round"/>` +
            `<path d="${d}" stroke="url(#${ids.gold})" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
            (thumb ? "" : `<path d="${d}" stroke="#7A5A1C" stroke-width="2.6" fill="none" stroke-dasharray=".6 1" opacity=".9"/>`) +
            (thumb ? "" : `<path d="${d}" stroke="#FFF6D8" stroke-width=".6" fill="none" opacity=".7" transform="translate(-.6 0)"/>`);
        }
        knots += `<ellipse cx="${f2(x)}" cy="${Y.end + 3}" rx="3.6" ry="2.8" fill="url(#${ids.gold})" stroke="#4A3510" stroke-width=".7"/>`;
        continue;
      }
      if (tier === "CHAMPION") {
        // twisted: two plies spiralling
        const ply = (ph) => {
          let d = "";
          const steps = Math.round(len / 1.2);
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const cx = x + sway * Math.sin(t * Math.PI) + 0.8 * Math.sin(t * len * 0.9 + ph);
            d += `${k ? "L" : "M"}${f2(cx)} ${f2(top + t * len)}`;
          }
          return d;
        };
        out +=
          `<path d="${ply(0)}" stroke="#0A1D3F" stroke-width="4.4" fill="none" stroke-linecap="round" opacity=".55"/>` +
          `<path d="${ply(Math.PI)}" stroke="${YARN.N}" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
          `<path d="${ply(0)}" stroke="${YARN.C}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
        knots += `<ellipse cx="${f2(x)}" cy="${Y.end + 3}" rx="3" ry="2.4" fill="#DCE2E9" stroke="#020a1c" stroke-opacity=".4" stroke-width=".6"/>`;
        continue;
      }
      const strands = tier === "HOMA" ? 5 : 6;
      for (let s = 0; s < strands; s++) {
        const k = (s + i) % 2 === 0 ? "C" : "N";
        const spread = (s - (strands - 1) / 2) * 1.25;
        const l = len - rnd() * 4;
        out += `<path d="M${f2(x + spread * 0.35)} ${top}C${f2(x + spread * 0.6 + sway)} ${f2(top + l * 0.5)} ${f2(x + spread + sway)} ${f2(top + l * 0.75)} ${f2(x + spread * 1.3 + sway)} ${f2(top + l)}" stroke="${YARN[k]}" stroke-width="${tier === "HOMA" ? 2.2 : 1.8}" fill="none" stroke-linecap="round"/>`;
      }
      // the knot that ties the tassel on, under the cast-on edge
      knots += `<ellipse cx="${f2(x)}" cy="${Y.end + 3}" rx="${tier === "HOMA" ? 3.4 : 2.8}" ry="2.4" fill="${p.founder ? YARN.L : YARN.C}" stroke="#020a1c" stroke-opacity=".4" stroke-width=".6"/>`;
    }
    return out + knots;
  }

  /** The woven label: maker's mark, composition (the four ratings), ID, country, founder line. */
  function label(p, o, ids, thumb, meta) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tier = p.tier;
    const legend = tier === "LEGEND";
    const extra = meta.nameOnLabel ? 11 : 0;
    const h = (ar ? 70 : 62) + extra;
    const y = Y.label + (SEC.label * R - h) / 2;
    const w = 166;
    // sewn at the inline-end selvedge; its folded end sticks out of the edge: the tab
    const x = ar ? X0 : X1 - w;
    const tabX = ar ? X0 - 14 : X1;
    const thread = legend ? "#C9A54C" : tier === "CHAMPION" ? "#AEB8C4" : "#C9C2B0";
    const cloth = legend ? "#14305E" : tier === "HOMA" ? "#ECE5D4" : "#FAF8F2";
    let s = "";
    s += `<rect x="${x + (ar ? -1 : 1.4)}" y="${y + 2}" width="${w}" height="${h}" fill="#020a1c" opacity=".38" filter="url(#${ids.soft})"/>`;
    s += `<rect x="${tabX}" y="${y + 10}" width="14" height="${h - 20}" rx="1.4" fill="url(#${ids.tab})"/>`;
    s += `<path d="M${ar ? tabX + 3 : tabX + 11} ${y + 13}V${y + h - 13}" stroke="${thread}" stroke-width=".8" stroke-dasharray="1.6 1.2"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${cloth}"/>`;
    if (legend) s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ids.damask})"/>`;
    if (tier !== "HOMA") s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ids.weave})"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ids.sheen})" opacity="${tier === "HOMA" ? 0.35 : legend ? 0.22 : 1}"/>`;
    if (tier !== "HOMA") s += `<rect x="${x + 3.2}" y="${y + 3.2}" width="${w - 6.4}" height="${h - 6.4}" fill="none" stroke="${thread}" stroke-width="${legend ? 1.3 : 0.9}"/>`;
    s += `<rect x="${x + 1.3}" y="${y + 1.3}" width="${w - 2.6}" height="${h - 2.6}" fill="none" stroke="${tier === "HOMA" ? "#8F877A" : legend ? "#E8D08A" : YARN.N}" stroke-width=".7" stroke-dasharray="2.2 1.6" opacity=".5"/>`;
    s += `<rect x="${ar ? X0 - 0.5 : X1 - 1.5}" y="${y}" width="2" height="${h}" fill="#020a1c" opacity=".2"/>`;
    if (thumb) {
      const ix = ar ? x + w - 66 : x + 12;
      const ph = legend ? "#E8D08A" : YARN.N;
      s += `<rect x="${ix}" y="${y + 12}" width="54" height="8" fill="${ph}" opacity=".85"/><rect x="${x + 12}" y="${y + 30}" width="${w - 24}" height="9" fill="${legend ? "#E8D08A" : INK}" opacity=".45"/>`;
      return s;
    }
    const L = x + 11;
    const Rr = x + w - 11;
    const start = ar ? Rr : L;
    const end = ar ? L : Rr;
    const aStart = ar ? "end" : "start"; // for LTR strings at the inline start
    const aEnd = ar ? "start" : "end";
    const lt = (tx, ty, str, anchor, cls) => `<text x="${f2(tx)}" y="${f2(ty)}" text-anchor="${anchor}" direction="ltr" class="c07-lb ${cls}">${esc(str)}</text>`;
    // RTL strings: anchor "start" puts the right edge at x
    const rt = (tx, ty, str, anchor, cls) => `<text x="${f2(tx)}" y="${f2(ty)}" text-anchor="${anchor}" direction="rtl" class="c07-lb c07-lb-ar ${cls}">${esc(str)}</text>`;
    // row 1: the maker's mark and the season
    const lw = 56;
    const lh = lw / MC.LOGO_RATIO.wordmark;
    const lx = ar ? Rr - lw : L;
    s += `<svg x="${f2(lx)}" y="${f2(y + 8.6)}" width="${lw}" height="${f2(lh)}" viewBox="${window.MC_BRAND.wordmark.viewBox}" overflow="visible">${window.MC_BRAND.wordmark.paths
      .map((pp) => `<path d="${pp.d}" fill="${legend ? "#E8D08A" : YARN.N}"/>`)
      .join("")}</svg>`;
    s += lt(end, y + 17.4, p.season, aEnd, "c07-lb-season");
    s += `<path d="M${L} ${y + 22}H${Rr}" stroke="${thread}" stroke-width=".6"/>`;
    // row 2: composition, set like a fibre content line (value first, no % sign)
    if (!ar) {
      const colW = (Rr - L) / 4;
      MC.STATS.forEach((k, i) => {
        s += `<text x="${f2(L + colW * i)}" y="${f2(y + 35.6)}" direction="ltr" class="c07-lb c07-lb-comp"><tspan class="c07-lb-v">${p.stats[k]}</tspan><tspan class="c07-lb-k" dx="2.2">${esc(S.stats[k])}</tspan></text>`;
      });
      s += lt(start, y + 46, p.id, aStart, "c07-lb-meta");
      s += lt(end, y + 46, S.country, aEnd, "c07-lb-meta");
      if (p.founder) s += `<path d="M${L} ${y + 49.6}H${Rr}" stroke="${thread}" stroke-width=".4" opacity=".7"/>` + lt(start, y + 56.4, S.founderLine, aStart, "c07-lb-gold");
      if (extra) s += lt(start, y + h - 7, MC.nameOf(p, o), aStart, "c07-lb-name");
    } else {
      const colW = (Rr - L) / 2;
      MC.STATS.forEach((k, i) => {
        const cx = Rr - colW * (i % 2);
        const ty = y + 33.2 + Math.floor(i / 2) * 10.8;
        s += lt(cx, ty, String(p.stats[k]), "end", "c07-lb-v");
        s += rt(cx - 15, ty, S.stats[k], "start", "c07-lb-k");
      });
      s += lt(start, y + 53.4, p.id, aStart, "c07-lb-meta");
      s += rt(end, y + 53.4, S.country, "end", "c07-lb-meta");
      if (p.founder)
        s +=
          `<path d="M${L} ${y + 56.4}H${Rr}" stroke="${thread}" stroke-width=".4" opacity=".7"/>` +
          rt(Rr, y + 63.6, S.founder, "start", "c07-lb-gold") +
          lt(Rr - 46, y + 63.6, String(p.founder), "end", "c07-lb-gold");
      if (extra) s += rt(Rr, y + h - 6, MC.nameOf(p, o), "start", "c07-lb-name");
    }
    return s;
  }

  /** HOMA's figure: the shared avatar (hood up) cut from cream felt and blanket-stitched onto the knit. */
  function applique(ids, thumb) {
    const A = MC.AVATAR;
    const H = 88;
    const W = (H * 200) / 204;
    const k = W / 200;
    const x = VW / 2 - W / 2;
    const y = Y.name - H; // shoulders seated on the name band
    const st = `stroke="#0A1D3F" stroke-width="${f2(1.4 / k)}" stroke-dasharray="${f2(2 / k)} ${f2(1.6 / k)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    const run = `stroke="#0A1D3F" stroke-width="${f2(1.1 / k)}" stroke-dasharray="${f2(1.6 / k)} ${f2(2 / k)}" stroke-linecap="round" fill="none"`;
    const pieces = A.hood
      ? `<path d="${A.torso}" fill="#ECE4D1"/><path d="${A.hood}" fill="#D8CCB0"/>`
      : `<path d="${A.torso}" fill="#ECE4D1"/><path d="${A.head}" fill="#D8CCB0"/><path d="${A.hair}" fill="#D8CCB0"/>`;
    const edges = A.hood ? `<path d="${A.torso}"/><path d="${A.hood}"/>` : `<path d="${A.torso}"/><path d="${A.hair}"/>`;
    const seams = A.hood ? `<path d="${A.seam}"/><path d="${A.hoodSeam}"/><path d="${A.hoodRim}"/>` : `<path d="${A.seam}"/>`;
    return (
      `<svg x="${f2(x)}" y="${f2(y)}" width="${f2(W)}" height="${H}" viewBox="0 36 200 204" overflow="visible" aria-hidden="true">` +
      `<g${thumb ? "" : ` filter="url(#${ids.felt})"`}>${pieces}</g>` +
      (thumb ? "" : `<g ${st}>${edges}</g><g ${run}>${seams}</g>`) +
      `</svg>`
    );
  }

  /** PRO's dog-ear: the bottom inline-end corner folded over, showing the reverse face. */
  function dogEar(ar, ids, d, dx) {
    const xc = (ar ? X0 : X1) + dx;
    const sg = ar ? 1 : -1; // inward
    const yb = Y.end;
    const A = [ar ? X0 + d : X1 - d, yb];
    const B = [xc, yb - d];
    const Cp = [A[0], yb - d];
    const tri = (a, b, c) => `M${f2(a[0])} ${f2(a[1])}L${f2(b[0])} ${f2(b[1])}L${f2(c[0])} ${f2(c[1])}Z`;
    const flap = tri(A, B, Cp);
    return (
      `<path d="${tri([A[0], A[1] + 0.6], [B[0] + sg * 0.6, B[1]], [Cp[0] + sg * 1.6, Cp[1] - 1.2])}" fill="#020a1c" opacity=".6" filter="url(#${ids.fold})"/>` +
      `<path d="${flap}" fill="${YARN.C}"/>` +
      `<path d="${flap}" fill="url(#${ids.rev})"/>` +
      `<path d="${flap}" fill="url(#${ids.pat["6x6v42"]})"/>` +
      `<path d="${flap}" fill="url(#${ids.foldShade})"/>` +
      `<path d="M${f2(A[0])} ${f2(A[1])}L${f2(B[0])} ${f2(B[1])}" stroke="#fff" stroke-opacity=".55" stroke-width=".9"/>`
    );
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tier = p.tier;
    const G = GAUGE[tier];
    const thumb = !!o.thumb;
    const u = MC.uid(PFX);
    const H = vh(tier);
    const ids = {
      pat: {},
      lxpat: u + "-lp",
      spec: u + "-sc",
      needle: u + "-nd",
      clip: u + "-cl",
      curl: u + "-cu",
      top: u + "-tp",
      grain: u + "-gr",
      sparkle: u + "-sp",
      shine: u + "-sh",
      weave: u + "-wv",
      damask: u + "-dm",
      sheen: u + "-sn",
      tab: u + "-tb",
      soft: u + "-sf",
      gold: u + "-gd",
      bind: u + "-bd",
      felt: u + "-fe",
      emb: u + "-eb",
      embGold: u + "-eg",
      embSh: u + "-es",
      fold: u + "-fo",
      foldShade: u + "-fs",
      rev: u + "-rv",
    };
    const bands = fabric(p, o);
    const meta = bands.meta;
    const gauges = {};
    for (const b of bands) gauges[pkey(b.G)] = b.G;
    if (tier === "PRO") gauges["6x6v42"] = GAUGE.PRO;
    let defs = "";
    for (const k of Object.keys(gauges)) {
      ids.pat[k] = `${u}-p${k}`;
      defs += stitchPattern(ids.pat[k], gauges[k]);
    }
    const nd = needle(tier, ids);
    defs += nd.defs;
    const castBand = bands.find((b) => b.id === "cast");
    const ch = SEC.cast * R;
    defs +=
      // lurex: a per-stitch metal ramp (dark gaps, bright legs) on an old-gold base
      stitchPattern(ids.lxpat, GAUGE.HOMA, { gapC: "#4A3510", gapO: 0.55, legC: "#FFF1BE", legO: 0.7 }) +
      `<pattern id="${ids.sparkle}" width="11" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".55" fill="#fff"/><circle cx="7.5" cy="6.2" r=".45" fill="#FFF6D8"/><circle cx="9.6" cy="1.4" r=".3" fill="#fff"/></pattern>` +
      `<filter id="${ids.spec}" filterUnits="userSpaceOnUse" x="${X0 - 4}" y="${Y.cast - 2}" width="${FW + 8}" height="${ch + 4}" color-interpolation-filters="sRGB">` +
      `<feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="h"/>` +
      `<feSpecularLighting in="h" surfaceScale="1.6" specularConstant=".95" specularExponent="28" lighting-color="#FFF6D8" result="s"><feDistantLight azimuth="235" elevation="40"/></feSpecularLighting>` +
      `<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0"/></filter>` +
      `<linearGradient id="${ids.shine}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".07" stop-color="#000" stop-opacity=".08"/>` +
      `<stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>` +
      `<linearGradient id="${ids.top}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".12" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>` +
      `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="${hashStr(p.serial) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .02  0 0 0 0 .04  0 0 0 0 .1  0 0 0 2.4 -1.02"/></filter>` +
      `<pattern id="${ids.weave}" width="2" height="1.6" patternUnits="userSpaceOnUse"><rect width="2" height=".7" fill="#000" opacity=".045"/><rect x="1" y=".8" width="1" height=".8" fill="#000" opacity=".03"/></pattern>` +
      `<pattern id="${ids.damask}" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M6 1.2L10.8 6L6 10.8L1.2 6Z" fill="none" stroke="#27508F" stroke-width=".8"/><path d="M6 3.6L8.4 6L6 8.4L3.6 6Z" fill="#1E4380"/><path d="M0 0L1.4 1.4M12 0L10.6 1.4M0 12L1.4 10.6M12 12L10.6 10.6" stroke="#27508F" stroke-width=".6"/></pattern>` +
      `<linearGradient id="${ids.sheen}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".42" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient>` +
      (tier === "LEGEND"
        ? `<linearGradient id="${ids.tab}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ar ? "#24467F" : "#0A1D3F"}"/><stop offset=".5" stop-color="#1A3A6E"/><stop offset="1" stop-color="${ar ? "#0A1D3F" : "#24467F"}"/></linearGradient>`
        : `<linearGradient id="${ids.tab}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ar ? "#F4F1EA" : "#BDB6A6"}"/><stop offset=".5" stop-color="#E9E4D8"/><stop offset="1" stop-color="${ar ? "#BDB6A6" : "#F4F1EA"}"/></linearGradient>`) +
      `<filter id="${ids.soft}" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      `<linearGradient id="${ids.gold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset=".22" stop-color="#F0D78E"/><stop offset=".5" stop-color="#C9A24A"/><stop offset=".6" stop-color="#A8822F"/><stop offset=".8" stop-color="#E7C873"/><stop offset="1" stop-color="#FFF0BF"/></linearGradient>` +
      `<linearGradient id="${ids.bind}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${tier === "LEGEND" ? "#8C6A22" : "#7F8995"}"/><stop offset=".45" stop-color="${tier === "LEGEND" ? "#FFF1BE" : "#F2F5F8"}"/><stop offset="1" stop-color="${tier === "LEGEND" ? "#B8902F" : "#AEB8C4"}"/></linearGradient>` +
      // embroidery: satin-stitch hatch, split-stitch outline, a small drop shadow
      hatch(ids.emb, YARN.C, "#B3A88F") +
      hatch(ids.embGold, "#F1D98A", "#8C6A22", 0.8, 0.6) +
      `<filter id="${ids.embSh}" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy=".6" stdDeviation=".35" flood-color="#020a1c" flood-opacity=".75"/></filter>`;
    if (tier === "HOMA")
      defs +=
        `<filter id="${ids.felt}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="b"/>` +
        `<feDiffuseLighting in="b" surfaceScale="4" diffuseConstant="1.3" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="52"/></feDiffuseLighting>` +
        `<feComposite in="d" in2="SourceAlpha" operator="in" result="d2"/><feBlend in="SourceGraphic" in2="d2" mode="multiply" result="m"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="7" result="t"/>` +
        `<feColorMatrix in="t" type="matrix" values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .22  0 0 0 1.6 -.75" result="t2"/>` +
        `<feComposite in="t2" in2="SourceAlpha" operator="in" result="t3"/>` +
        `<feDropShadow in="SourceAlpha" dx="1.5" dy="3" stdDeviation="2.2" flood-color="#020a1c" flood-opacity=".55" result="sh"/>` +
        `<feMerge><feMergeNode in="sh"/><feMergeNode in="m"/><feMergeNode in="t3"/></feMerge></filter>`;
    if (tier === "PRO")
      defs +=
        `<filter id="${ids.fold}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation=".8"/></filter>` +
        `<pattern id="${ids.rev}" width="12" height="12" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="6" height="6" fill="${YARN.B}"/><rect x="6" y="6" width="6" height="6" fill="${YARN.B}"/></pattern>` +
        `<linearGradient id="${ids.foldShade}" x1="${ar ? 0 : 1}" y1="1" x2="${ar ? 1 : 0}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>`;

    let fab = "";
    for (const b of bands) {
      if (b.id === "cast") continue;
      if (tier === "LEGEND" && (b.id === "live" || b.id === "bars") && !o.motion) continue;
      fab += drawBand(b, ids);
    }
    fab += castBand.lurex ? drawCast(castBand, ids, thumb) : drawBand(castBand, ids);
    // LEGEND carries its gold down the scarf: a lurex ply knitted through every played stripe
    let ply = "";
    if (tier === "LEGEND")
      for (const st of meta.stripes) if (!st.missed) ply += `<path d="M${X0} ${st.y + R / 2}H${X1}" stroke="${YARN.L}" stroke-width="1" stroke-dasharray="2.2 .8" opacity=".9"/>`;
    // founder lurex: one specular band across the gold rows only (moves only in motion)
    let lux = "";
    if (castBand.lurex) {
      const cy = castBand.y;
      lux = `<g class="c07-shine"><rect x="${X0 + 128}" y="${cy - 4}" width="22" height="${ch + 8}" fill="url(#${ids.shine})" transform="translate(${X0 + 139} ${cy + ch / 2}) skewX(-28) translate(${-(X0 + 139)} ${-(cy + ch / 2)})" style="mix-blend-mode:screen" opacity=".55"/></g>`;
    }
    // CHAMPION and LEGEND: satin binding along both long edges
    let binding = "";
    if (tier === "CHAMPION" || tier === "LEGEND") {
      const yb = tier === "LEGEND" ? Y.season : F0;
      binding =
        `<rect x="${X0 - 1.2}" y="${yb}" width="4.4" height="${Y.cast - yb}" fill="url(#${ids.bind})"/>` +
        `<rect x="${X1 - 3.2}" y="${yb}" width="4.4" height="${Y.cast - yb}" fill="url(#${ids.bind})"/>`;
    }
    // LEGEND: the live rows woven as HD jacquard, the 84 in gold thread
    const jacq = tier === "LEGEND" ? legendJacquard(p, o, ids, u, thumb, meta) : "";

    let cut = null;
    if (tier === "PRO") {
      const d = 18;
      const ri = Math.floor((Y.end - d - castBand.y) / castBand.G.ch);
      cut = { side: ar ? "l" : "r", d, dx: castBand.off[Math.min(ri, castBand.rows - 1)] || 0 };
    }
    const outline = outlinePath(bands, cut);
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;
    const shade =
      `<g pointer-events="none">` +
      `<rect x="${X0 - 2}" y="${F0}" width="${FW + 4}" height="${Y.end - F0}" fill="url(#${ids.curl})"/>` +
      `<rect x="${X0 - 2}" y="${F0}" width="${FW + 4}" height="${Y.end - F0}" fill="url(#${ids.top})"/>` +
      (thumb ? "" : `<rect x="${X0 - 2}" y="${F0}" width="${FW + 4}" height="${Y.end - F0}" filter="url(#${ids.grain})" opacity=".55"/>`) +
      `</g>`;
    const rim = `<path class="c07-rim" d="${outline}" fill="none" stroke-width="1.1"/>`;
    const needleG = `<g${ar ? ` transform="matrix(-1 0 0 1 ${VW} 0)"` : ""}>${nd.body}</g>`;
    const top = tier === "LEGEND" ? "" : loops(tier, G);
    // Arabic tier word: satin-stitch embroidery over the knit (curves a stitch grid cannot hold)
    let embroidery = "";
    if (ar && tier !== "LEGEND") embroidery = embroider(S.tiers[tier], meta.word, ids.emb, "#CFC4AC", ids.embSh, thumb);
    const fig = tier === "HOMA" ? applique(ids, thumb) : "";
    const ear = cut ? dogEar(ar, ids, cut.d, cut.dx) : "";

    const svg =
      `<svg class="c07-svg" viewBox="0 0 ${VW} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      `<g class="c07-sway">` +
      `<g class="c07-fringe">${fringe(p, o, ids, thumb)}</g>` +
      `<g class="c07-fabric" clip-path="url(#${ids.clip})">${fab}${ply}${lux}${binding}${shade}${jacq}</g>` +
      rim +
      fig +
      ear +
      embroidery +
      label(p, o, ids, thumb, meta) +
      `</g>` +
      needleG +
      top +
      `</svg>`;
    const cls = `c07 c07--${tier.toLowerCase()}${thumb ? " c07--thumb" : ""}${o.motion ? " c07--motion" : ""}`;
    return `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}">${svg}</div>`;
  }

  /** Arabic tier word as satin-stitch embroidery, centred on the knitted word's slot. */
  function embroider(text, slot, fill, outline, shadow, thumb) {
    const fs = 25;
    const cy = slot.y + slot.h / 2;
    const by = f2(cy + fs * 0.22);
    return (
      `<g${thumb ? "" : ` filter="url(#${shadow})"`}>` +
      `<text x="${VW / 2}" y="${by}" text-anchor="middle" direction="rtl" class="c07-emb" font-size="${fs}" fill="url(#${fill})" stroke="${outline}" stroke-width="2" stroke-dasharray="1.5 .5" stroke-linejoin="round" paint-order="stroke">${esc(text)}</text>` +
      `</g>`
    );
  }

  /** LEGEND: HD woven jacquard over the live rows; the 84, the word and the bars in gold thread. */
  function legendJacquard(p, o, ids, u, thumb, meta) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const yb = Y.season; // the jacquard replaces the live rows and the bars
    const yt = NY - ROD - 3;
    const defs =
      `<defs><pattern id="${u}-tw" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-63)"><rect width="1.2" height="1.2" fill="#163563"/><rect width="1.2" height=".6" fill="#284A83"/></pattern>` +
      `<linearGradient id="${u}-jl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>` +
      `<linearGradient id="${u}-sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A1A3A"/><stop offset=".38" stop-color="#3A64AE"/><stop offset=".62" stop-color="#16346A"/><stop offset="1" stop-color="#0B1F45"/></linearGradient>` +
      `<linearGradient id="${u}-lu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>` +
      `<filter id="${u}-ws" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy=".6" stdDeviation=".4" flood-color="#020a1c" flood-opacity=".7"/></filter></defs>`;
    const goldFill = thumb ? `url(#${ids.gold})` : `url(#${ids.embGold})`;
    const body =
      `<path d="M${X0} ${yt + 5}Q${X0} ${yt} ${X0 + 5} ${yt}H${X1 - 5}Q${X1} ${yt} ${X1} ${yt + 5}V${yb}H${X0}Z" fill="#163563"/>` +
      (thumb ? "" : `<rect x="${X0}" y="${yt}" width="${FW}" height="${yb - yt}" fill="url(#${u}-tw)"/>`) +
      `<rect x="${X0}" y="${yt}" width="${FW}" height="${yb - yt}" fill="url(#${u}-jl)"/>` +
      // the rolled hem around the needle
      `<rect x="${X0}" y="${yt}" width="${FW}" height="${F0 - yt}" rx="5" fill="url(#${u}-sl)"/>` +
      (thumb ? "" : `<rect x="${X0}" y="${yt}" width="${FW}" height="${F0 - yt}" rx="5" fill="url(#${u}-tw)" opacity=".5"/>`) +
      `<path d="M${X0 + 2} ${F0 + 0.8}H${X1 - 2}" stroke="${YARN.L}" stroke-width=".8" stroke-dasharray="2 1.6" opacity=".85"/>`;
    // the 84 woven in gold thread, centred on its measured ink box
    const t = placeInk(String(p.ovr), '800 {s} "Changa"', VW / 2, F0 + 9, 110);
    const num =
      `<g${thumb ? "" : ` filter="url(#${u}-ws)"`}><text x="${t.x}" y="${t.y}" direction="ltr" class="c07-legend-ovr" font-size="${t.fs}" fill="${goldFill}">${p.ovr}</text></g>` +
      (thumb ? "" : `<text x="${t.x}" y="${t.y}" direction="ltr" class="c07-legend-ovr" font-size="${t.fs}" fill="url(#${u}-lu)">${p.ovr}</text>`);
    // the tier word: woven pixels (Latin) or satin-stitch gold embroidery (Arabic)
    let wd = "";
    const slot = { y: F0 + 125, h: 28 };
    if (ar) wd = embroider(S.tiers.LEGEND, slot, ids.embGold, "#B8902F", ids.embSh, thumb);
    else {
      const bmp = word("LEGEND", F57, 1);
      const cw = 4;
      const x0 = VW / 2 - (bw(bmp) * cw) / 2;
      let rs = "";
      for (let r = 0; r < bmp.length; r++) {
        let c = 0;
        while (c < bmp[r].length) {
          if (bmp[r][c] !== "#") {
            c++;
            continue;
          }
          let e = c;
          while (e < bmp[r].length && bmp[r][e] === "#") e++;
          rs += `<rect x="${x0 + c * cw}" y="${slot.y + r * 4}" width="${(e - c) * cw}" height="4"/>`;
          c = e;
        }
      }
      wd = `<g fill="${goldFill}"${thumb ? "" : ` filter="url(#${u}-ws)"`}>${rs}</g>`;
    }
    // three woven gold bars in place of the knitted ones
    let bars = "";
    for (let i = 0; i < 3; i++) bars += `<rect x="${X0}" y="${Y.bars + 6 + i * 8}" width="${FW}" height="3.4" fill="${goldFill}"/>`;
    const seam = `<path d="M${X0} ${yb}H${X1}" stroke="#020a1c" stroke-opacity=".5" stroke-width="1.4"/><path d="M${X0 + 1} ${yb - 0.4}H${X1 - 1}" stroke="${YARN.L}" stroke-width=".8" stroke-dasharray="2.4 1.6"/>`;
    const bind =
      `<rect x="${X0 - 1.2}" y="${yt + 4}" width="4.4" height="${yb - yt - 4}" fill="url(#${ids.bind})"/>` +
      `<rect x="${X1 - 3.2}" y="${yt + 4}" width="4.4" height="${yb - yt - 4}" fill="url(#${ids.bind})"/>`;
    return `<g class="c07-jacq">${defs}${body}${bars}${num}${wd}${seam}${bind}</g>`;
  }

  /* ---------- token: a scarf-end swatch on its needle ---------- */
  function token(p, o = {}) {
    const s = Math.max(20, Math.round(o.size || 44));
    const mini = !!o.mini || s <= 32;
    const tier = p.tier;
    const legend = tier === "LEGEND";
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const u = MC.uid(PFX + "t");
    const nt = Math.max(2, Math.round(s * 0.08)); // rod thickness
    const knobR = 1.2 * nt;
    const pointL = 1.6 * nt;
    const cy = Math.ceil(knobR); // rod centre line; the swatch hangs from it
    const fh = Math.round(s * 0.3); // fringe: 30% of the height
    const sh = s - fh - cy;
    const fl = p.founder ? (mini ? 1.5 : Math.max(2, Math.round(s * 0.045))) : 0;
    const free = sh - Math.ceil(nt / 2) - fl;
    // portrait swatch; the 84 in whole-pixel figures
    let sw = mini ? 16 : Math.round(sh * 0.72);
    const cw = mini ? 2 : Math.max(2, Math.floor((sw - 3) / 7));
    const chh = mini ? (free >= 17 ? 3 : 2) : Math.max(2, Math.min(Math.round(cw * 1.5), Math.floor((free - 2) / 5)));
    const dw = 7 * cw;
    const dh = 5 * chh;
    sw = Math.max(sw, dw + 2);
    if ((sw - dw) % 2) sw += 1;
    const oL = Math.max(Math.ceil(2 * knobR) + 1, Math.round(sw * 0.22));
    const oR = Math.max(Math.ceil(pointL) + 2, Math.round(sw * 0.22));
    const W = oL + sw + oR;
    const sx = oL;
    const y0 = cy;
    const yb = y0 + sh; // swatch bottom
    const dx = sx + (sw - dw) / 2;
    const dy = Math.round(cy + nt / 2 + (free - dh) / 2);
    const gold = `url(#${u}-gd)`;
    const ground = legend ? "#163563" : tier === "HOMA" ? YARN.N : YARN.B;
    const ear = tier === "PRO" && s >= 32 ? Math.max(3, Math.round(sw * 0.2)) : 0;
    const mat = tier === "HOMA" ? ["#8C6640", "#E2BE8C", "#7A5634", "#5A3E22"] : legend ? ["#9C7A2C", "#FFF1BE", "#8C6A22", "#5E4614"] : ["#8A94A2", "#C6CDD6", "#6E7886", "#4E5661"];
    let defs =
      `<linearGradient id="${u}-gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset=".5" stop-color="#E2BF62"/><stop offset=".62" stop-color="#B8902F"/><stop offset="1" stop-color="#FFF0BF"/></linearGradient>` +
      `<linearGradient id="${u}-nd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mat[0]}"/><stop offset=".35" stop-color="${mat[1]}"/><stop offset="1" stop-color="${mat[2]}"/></linearGradient>` +
      `<radialGradient id="${u}-kn" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="${mat[1]}"/><stop offset=".5" stop-color="${mat[0]}"/><stop offset="1" stop-color="${mat[2]}"/></radialGradient>`;
    // stitch texture once a stitch is 3px or more; flat yarn fields below that
    const tex = !mini && cw >= 3;
    if (tex) {
      if (legend) defs += `<pattern id="${u}-tx" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(-63)"><rect width="2" height="1" fill="#2A4C86"/></pattern>`;
      else {
        const G = tier === "HOMA" ? { cw: cw * 1.34, ch: chh, kind: "g", gap: 0.46 } : { cw, ch: chh, kind: "v", gap: tier === "STADE" ? 0.28 : 0.42 };
        defs += stitchPattern(`${u}-tx`, G, { xy: ` x="${f2(dx)}" y="${dy}"` });
      }
    }
    let b = "";
    // fringe: the tier lives in the fringe and the rod (wood ×3, steel ×4, steel ×5, twisted silver, gold bullion)
    const nTick = { HOMA: 3, STADE: 4, PRO: 5, CHAMPION: 5, LEGEND: 5 }[tier];
    const st = Math.max(1, Math.round(s * 0.025));
    const fx0 = sx + 2;
    const fx1 = sx + sw - 2 - (ar ? 0 : ear);
    const fxa = sx + 2 + (ar ? ear : 0);
    for (let i = 0; i < nTick; i++) {
      const x = f2(fxa + ((fx1 - (ar ? sx + 2 : fx0) - (ar ? ear : 0)) * i) / (nTick - 1));
      const len = fh - 1 - (i % 2) - (tier === "HOMA" ? 2 : 0);
      const y1 = yb - 1;
      const y2 = yb + len;
      if (legend) {
        b += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#5E4614" stroke-width="${st * 2 + 1}" stroke-linecap="round"/>`;
        b += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${gold}" stroke-width="${st * 2}"/>`;
        if (!mini) b += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#7A5A1C" stroke-width="${st * 2}" stroke-dasharray="1 1"/>`;
      } else if (tier === "CHAMPION") {
        b += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#4E5661" stroke-width="${st * 2 + (mini ? 0 : 1)}"/>`;
        b += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#E6EBF0" stroke-width="${st * 2}" stroke-dasharray="${mini ? "1 1" : "1.4 1"}"/>`;
      } else if (mini) {
        b += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${i % 2 ? YARN.N : YARN.C}" stroke-width="1"${i % 2 ? "" : ` class="c07-tk-c"`}/>`;
      } else {
        const k = tier === "HOMA" ? 1.5 : 1;
        b += `<line x1="${f2(x - (st * k) / 2)}" y1="${y1}" x2="${f2(x - (st * k) / 2 - 0.4)}" y2="${y2}" stroke="${YARN.C}" stroke-width="${f2(st * k)}" class="c07-tk-c"/>`;
        b += `<line x1="${f2(x + (st * k) / 2)}" y1="${y1}" x2="${f2(x + (st * k) / 2 + 0.4)}" y2="${y2 - 1}" stroke="${YARN.N}" stroke-width="${f2(st * k)}"/>`;
      }
    }
    // the swatch (PRO: its bottom inline-end corner dog-eared)
    const sp = ear
      ? `M${sx} ${y0}H${sx + sw}V${yb - ear}L${sx + sw - ear} ${yb}H${sx}Z`
      : `M${sx} ${y0}H${sx + sw}V${yb}H${sx}Z`;
    b += `<path class="c07-tk-sw" d="${sp}" fill="${ground}"/>`;
    if (tex) b += `<path d="${sp}" fill="url(#${u}-tx)"/>`;
    if (tier === "CHAMPION" || legend) {
      const bb = mini ? 1 : Math.max(1.5, Math.round(s * 0.03));
      const bc = legend ? gold : "#DCE2E9";
      b += `<rect x="${sx}" y="${y0}" width="${bb}" height="${sh}" fill="${bc}"/><rect x="${sx + sw - bb}" y="${y0}" width="${bb}" height="${sh}" fill="${bc}"/>`;
    }
    // founder: the lurex line above the fringe
    if (p.founder) b += `<rect x="${sx}" y="${yb - fl}" width="${sw - (ear ? ear * (fl / ear) : 0)}" height="${fl}" fill="#E8D08A"/>`;
    if (ear) {
      const ex = sx + sw - ear;
      b += `<path d="M${ex} ${yb}L${sx + sw} ${yb - ear}L${ex} ${yb - ear}Z" fill="${YARN.C}"/><path d="M${ex} ${yb}L${sx + sw} ${yb - ear}" stroke="#020a1c" stroke-opacity=".35" stroke-width=".8"/>`;
      if (ear >= 5) b += `<rect x="${ex + 1}" y="${yb - ear + 1}" width="${f2(ear * 0.35)}" height="${f2(ear * 0.35)}" fill="${YARN.B}"/>`;
    }
    // loops over the rod, only where a loop can be seen (64px and up)
    if (s >= 64 && !legend) {
      let d = "";
      for (let x = sx + cw / 2; x < sx + sw - 1; x += cw) d += `M${f2(x - cw * 0.25)} ${f2(cy + nt / 2 + 1)}C${f2(x - cw * 0.25)} ${f2(cy - nt)} ${f2(x + cw * 0.25)} ${f2(cy - nt)} ${f2(x + cw * 0.25)} ${f2(cy + nt / 2 + 1)}`;
      b += `<path d="${d}" fill="none" stroke="${ground}" stroke-width="${f2(cw * 0.35)}"/>`;
    }
    // the needle on top: knob r = 1.2 × rod, a real point 1.6 × rod long, a dark underside
    b += `<path d="M${f2(knobR)} ${f2(cy - nt / 2)}H${f2(W - pointL)}L${W} ${cy}L${f2(W - pointL)} ${f2(cy + nt / 2)}H${f2(knobR)}Z" fill="url(#${u}-nd)"/>`;
    b += `<path d="M${f2(knobR)} ${f2(cy + nt / 2 - 0.5)}H${f2(W - pointL)}L${W - 0.5} ${cy}" stroke="${mat[3]}" stroke-width="1" fill="none"/>`;
    b += `<circle cx="${f2(knobR)}" cy="${cy}" r="${f2(knobR)}" fill="url(#${u}-kn)" stroke="${mat[3]}" stroke-width=".8"/>`;
    // the 84 in whole-pixel figures (never mirrored)
    const bmp = word(String(p.ovr), F35, 1);
    let dg = "";
    for (let r = 0; r < 5; r++) {
      const line = bmp[r];
      let c = 0;
      while (c < line.length) {
        if (line[c] !== "#") {
          c++;
          continue;
        }
        let e = c;
        while (e < line.length && line[e] === "#") e++;
        dg += `<rect x="${f2(dx + c * cw)}" y="${dy + r * chh}" width="${(e - c) * cw}" height="${chh}"/>`;
        c = e;
      }
    }
    const digits = `<g fill="${legend ? gold : YARN.C}" shape-rendering="crispEdges"${ar ? ` transform="matrix(-1 0 0 1 ${f2(2 * dx + dw)} 0)"` : ""}>${dg}</g>`;
    const body = ar ? `<g transform="matrix(-1 0 0 1 ${W} 0)">${b}${digits}</g>` : b + digits;
    return (
      `<span class="c07-tk c07-tk--${tier.toLowerCase()}${mini ? " c07-tk--mini" : ""}" role="img" aria-label="${esc(`${MC.nameOf(p, o)}, ${p.ovr} ${S.ovr}, ${S.tiers[tier]}`)}" style="width:${W}px;height:${s}px">` +
      `<svg width="${W}" height="${s}" viewBox="0 0 ${W} ${s}" aria-hidden="true" focusable="false"><defs>${defs}</defs>${body}</svg></span>`
    );
  }

  /** A stitch tile as a CSS background layer (rows and HTML surfaces). */
  const KNIT = {};
  function knitLayer(tier) {
    if (tier === "LEGEND") return "none";
    if (KNIT[tier]) return KNIT[tier];
    const G = tier === "HOMA" ? { cw: 4, ch: 3, kind: "g", gap: 0.46 } : tier === "CHAMPION" ? { cw: 2, ch: 2, kind: "v", gap: 0.42 } : { cw: 3, ch: 3, kind: "v", gap: tier === "STADE" ? 0.28 : 0.42 };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${G.cw}" height="${G.ch}"><defs>${stitchPattern("k", G)}</defs><rect width="${G.cw}" height="${G.ch}" fill="url(#k)"/></svg>`;
    KNIT[tier] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / ${G.cw}px ${G.ch}px`;
    return KNIT[tier];
  }

  /* ---------- row: the scarf turned sideways ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const tier = p.tier;
    const u = MC.uid(PFX + "r");
    const legend = tier === "LEGEND";
    // the knitted figure block beside the needle, at the tier's own resolution:
    // HOMA's 5×7 bitmap, Changa sampled at 12/14 rows (STADE/PRO) or 21 fine rows (CHAMPION),
    // woven gold thread at LEGEND
    let bmp;
    let cell = 3;
    let sy = 1;
    if (tier === "HOMA") {
      bmp = word(String(p.ovr), F57, 2);
      sy = 2;
    } else if (tier === "STADE") bmp = trim(rasterText(String(p.ovr), '800 {s} "Changa"', 12, 3, 3));
    else if (tier === "PRO") bmp = trim(rasterText(String(p.ovr), '800 {s} "Changa"', 14, 3, 3));
    else if (tier === "CHAMPION") {
      bmp = trim(rasterText(String(p.ovr), '800 {s} "Changa"', 21, 2, 2));
      cell = 2;
    }
    let digits = "";
    let blockW = 56;
    if (bmp) {
      const w = bw(bmp) * cell;
      blockW = Math.max(56, w + 16);
      const ox = Math.round((blockW - w) / 2);
      const h = bmp.length * cell * sy;
      const oy = Math.round((52 - h) / 2);
      let rs = "";
      for (let r = 0; r < bmp.length; r++) {
        let c = 0;
        while (c < bmp[r].length) {
          if (bmp[r][c] !== "#") {
            c++;
            continue;
          }
          let e = c;
          while (e < bmp[r].length && bmp[r][e] === "#") e++;
          rs += `<rect x="${ox + c * cell}" y="${oy + r * cell * sy}" width="${(e - c) * cell}" height="${cell * sy}"/>`;
          c = e;
        }
      }
      digits = `<svg class="c07-row-ovr" width="${blockW}" height="52" viewBox="0 0 ${blockW} 52" aria-hidden="true"><g fill="${YARN.C}" shape-rendering="crispEdges">${rs}</g></svg>`;
    } else {
      blockW = 64;
      const t = placeInk(String(p.ovr), '800 {s} "Changa"', blockW / 2, 9, 34);
      digits =
        `<svg class="c07-row-ovr" width="${blockW}" height="52" viewBox="0 0 ${blockW} 52" aria-hidden="true">` +
        `<defs>${hatch(u + "-h", "#F1D98A", "#8C6A22", 1.2, 0.8)}<filter id="${u}-s" x="-5%" y="-5%" width="110%" height="120%"><feDropShadow dx="0" dy=".8" stdDeviation=".5" flood-color="#020a1c" flood-opacity=".8"/></filter></defs>` +
        `<text x="${t.x}" y="${t.y}" direction="ltr" class="c07-row-gold" font-size="${t.fs}" fill="url(#${u}-h)" filter="url(#${u}-s)">${p.ovr}</text></svg>`;
    }
    const bars = legend ? 3 : BARS[tier];
    const fringeSvg = rowFringe(tier, u, p);
    return (
      `<div class="c07-row c07-row--${tier.toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}">` +
      `<span class="c07-row-rank">${MC.ltr(o.rank)}</span>` +
      `<div class="c07-row-scarf" style="--c07-knit:${knitLayer(tier).replace(/"/g, "&quot;")}">` +
      `<span class="c07-row-needle" aria-hidden="true"></span>` +
      `<span class="c07-row-live" style="width:${blockW}px">${digits}</span>` +
      `<span class="c07-row-bars" aria-hidden="true">${"<i></i>".repeat(bars)}</span>` +
      `<span class="c07-row-name"><b>${esc(MC.nameOf(p, o))}</b><small>${esc(S.tiers[tier])}</small></span>` +
      `<span class="c07-row-pts">${MC.ltr(o.pts)}<small>${esc(S.pts)}</small></span>` +
      (p.founder ? `<span class="c07-row-cast" aria-label="${esc(S.founderLine)}"></span>` : `<span class="c07-row-cast c07-row-cast--plain" aria-hidden="true"></span>`) +
      `<span class="c07-row-fringe" aria-hidden="true">${fringeSvg}</span>` +
      `</div></div>`
    );
  }
  function rowFringe(tier, u, p) {
    const n = 5;
    let out = "";
    const rnd = seeded(hashStr(p.serial + "rf"));
    for (let i = 0; i < n; i++) {
      const y = 6 + (40 * i) / (n - 1);
      const len = 12 + rnd() * 4 - (tier === "HOMA" ? 3 : 0);
      if (tier === "LEGEND") {
        out += `<path d="M0 ${f2(y - 1)}H${f2(len)}M0 ${f2(y + 1)}H${f2(len - 1)}" stroke="#5E4614" stroke-width="2.6" stroke-linecap="round"/><path d="M0 ${f2(y - 1)}H${f2(len)}M0 ${f2(y + 1)}H${f2(len - 1)}" stroke="url(#${u}-g)" stroke-width="1.9" stroke-linecap="round"/><path d="M0 ${f2(y - 1)}H${f2(len)}M0 ${f2(y + 1)}H${f2(len - 1)}" stroke="#7A5A1C" stroke-width="1.9" stroke-dasharray=".6 1"/>`;
        continue;
      }
      if (tier === "CHAMPION") {
        out += `<path d="M0 ${f2(y)}H${f2(len)}" stroke="#0A1D3F" stroke-width="4.4" stroke-linecap="round"/><path d="M0 ${f2(y)}H${f2(len)}" stroke="${YARN.C}" stroke-width="3.4" stroke-linecap="round"/><path d="M1 ${f2(y)}H${f2(len)}" stroke="${YARN.N}" stroke-width="3.4" stroke-dasharray="1.2 1.8" opacity=".85"/>`;
        continue;
      }
      out += `<path d="M0 ${f2(y - 0.8)}C${f2(len * 0.5)} ${f2(y - 1.2)} ${f2(len * 0.8)} ${f2(y - 1.6)} ${f2(len)} ${f2(y - 2)}" stroke="${YARN.C}" stroke-width="1.5" fill="none" stroke-linecap="round" class="c07-rf-c"/>`;
      out += `<path d="M0 ${f2(y + 0.8)}C${f2(len * 0.5)} ${f2(y + 1.2)} ${f2(len * 0.8)} ${f2(y + 1.6)} ${f2(len - 1)} ${f2(y + 2)}" stroke="${YARN.N}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    }
    return `<svg width="18" height="52" viewBox="0 0 18 52"><defs><linearGradient id="${u}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset=".5" stop-color="#D7B256"/><stop offset="1" stop-color="#F1D98A"/></linearGradient></defs>${out}</svg>`;
  }

  /* ---------- share: the scarf on a terrace barrier under a floodlight ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid(PFX + "s");
    const cap = ar ? ["موسمي", "صفًّا بعد صف"] : ["MY", "SEASON,", "ROW BY", "ROW."];
    const sw = 238; // scarf width
    const k = sw / VW;
    const railY = 80;
    const scarfTop = f2(railY - NY * k);
    // floodlight head: a 4×3 lamp grid on a lattice mast, top inline-end
    const hx = 262;
    const hy = 12;
    let lamps = "";
    let bloom = "";
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) {
        const cx = hx + 12 + c * 20;
        const cy = hy + 10 + r * 15;
        bloom += `<circle cx="${cx}" cy="${cy}" r="9" fill="#DCEBFF"/>`;
        lamps += `<rect x="${cx - 8}" y="${cy - 6}" width="16" height="12" rx="2" fill="#0A1426"/><circle cx="${cx}" cy="${cy}" r="5.2" fill="#F6FAFF"/><circle cx="${cx}" cy="${cy}" r="5.2" fill="none" stroke="#9CB8E0" stroke-width="1"/>`;
      }
    let lattice = "";
    for (let i = 0; i < 9; i++) {
      const y = 62 + i * 18;
      lattice += `M314 ${y}L334 ${y + 18}M334 ${y}L314 ${y + 18}`;
    }
    // terrace steps in perspective (lower third): treads lit from the floodlight side
    let steps = "";
    const ys = [418, 436, 457, 482, 512, 548, 592, 646];
    for (let i = 0; i < ys.length - 1; i++) {
      const a = ys[i];
      const b2 = ys[i + 1];
      const tread = a + (b2 - a) * 0.36;
      steps +=
        `<path d="M0 ${a + 10}L360 ${a}V${tread}L0 ${tread + 10}Z" fill="url(#${u}-tr)" opacity="${f2(0.5 + i * 0.06)}"/>` +
        `<path d="M0 ${tread + 10}L360 ${tread}V${b2}L0 ${b2 + 10}Z" fill="#020A1C" opacity=".55"/>` +
        `<path d="M0 ${a + 10}L360 ${a}" stroke="#7FA2D8" stroke-opacity="${f2(0.16 + i * 0.03)}" stroke-width="1.2"/>`;
    }
    const bg =
      `<svg class="c07-sh-bg" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true"${ar ? ` style="transform:scaleX(-1)"` : ""}>` +
      `<defs><linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#062457"/><stop offset=".55" stop-color="#001C49"/><stop offset="1" stop-color="#000F2C"/></linearGradient>` +
      `<radialGradient id="${u}-h" cx=".84" cy=".06" r=".75"><stop offset="0" stop-color="#CFE6FF" stop-opacity=".42"/><stop offset=".22" stop-color="#7FA8E8" stop-opacity=".16"/><stop offset=".6" stop-color="#2A4F9A" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${u}-tr" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#2D5596"/><stop offset=".6" stop-color="#173A73"/><stop offset="1" stop-color="#0E2A58"/></linearGradient>` +
      `<linearGradient id="${u}-mast" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FA3BF"/><stop offset="1" stop-color="#8FA3BF" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E6876"/><stop offset=".3" stop-color="#E6EBF0"/><stop offset=".6" stop-color="#A9B2BE"/><stop offset="1" stop-color="#4E5661"/></linearGradient>` +
      `<linearGradient id="${u}-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4E5661"/><stop offset=".4" stop-color="#C6CDD6"/><stop offset="1" stop-color="#5E6876"/></linearGradient>` +
      `<filter id="${u}-bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>` +
      `<filter id="${u}-n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="11"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept=".5"/></feComponentTransfer></filter></defs>` +
      `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
      `<rect width="360" height="640" fill="url(#${u}-h)"/>` +
      steps +
      // mast lattice, fading into the haze
      `<g stroke="url(#${u}-mast)" fill="none"><path d="M314 58V230M334 58V230" stroke-width="2.4"/><path d="${lattice}" stroke-width="1.1"/></g>` +
      `<g filter="url(#${u}-bl)" opacity=".75">${bloom}</g>` +
      `<rect x="${hx - 2}" y="${hy - 4}" width="88" height="50" rx="3" fill="#0A1426" stroke="#3A4C68" stroke-width="1.2"/>` +
      lamps +
      // the crowd barrier: lit steel rail on uprights
      `<rect x="252" y="${railY}" width="7" height="560" fill="url(#${u}-post)"/><rect x="${352}" y="${railY}" width="7" height="560" fill="url(#${u}-post)"/>` +
      `<path d="M259 ${railY + 40}L352 ${railY + 120}" stroke="#7D8794" stroke-width="3"/>` +
      `<rect x="0" y="${railY - 5}" width="360" height="10" rx="5" fill="url(#${u}-st)"/>` +
      `<rect width="360" height="640" filter="url(#${u}-n)" style="mix-blend-mode:overlay" opacity=".3"/>` +
      `</svg>`;
    // two floodlight beams crossing the scarf (in front of it, screen-blended)
    const beams =
      `<svg class="c07-sh-beams" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true"${ar ? ` style="transform:scaleX(-1)"` : ""}>` +
      `<defs><linearGradient id="${u}-bm" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6F1FF" stop-opacity=".9"/><stop offset=".55" stop-color="#9CC0F5" stop-opacity=".35"/><stop offset="1" stop-color="#9CC0F5" stop-opacity="0"/></linearGradient>` +
      `<filter id="${u}-bb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter></defs>` +
      `<g filter="url(#${u}-bb)"><path d="M282 26L300 40L60 470L0 410Z" fill="url(#${u}-bm)" opacity=".18"/><path d="M318 40L338 52L180 640L104 640Z" fill="url(#${u}-bm)" opacity=".13"/></g>` +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "light", w: "100%" });
    const lurexStrip =
      `<svg class="c07-sh-lx" viewBox="0 0 96 18" aria-hidden="true"><defs>${stitchPattern(u + "-lx", { cw: 6, ch: 4.5, kind: "g", gap: 0.46 }, { gapC: "#4A3510", gapO: 0.55, legC: "#FFF1BE", legO: 0.7 })}</defs>` +
      `<rect width="96" height="18" fill="#B8902F"/><rect width="96" height="18" fill="url(#${u}-lx)"/></svg>`;
    return (
      `<div class="c07-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c07-sh-logo">${logo}</div>` +
      `<div class="c07-sh-scarf" style="top:${scarfTop}px;width:${sw}px">${full(p, { ...o, motion: false, thumb: false })}</div>` +
      beams +
      `<div class="c07-sh-col">` +
      `<p class="c07-sh-cap">${cap.map((l) => `<span>${esc(l)}</span>`).join("")}</p>` +
      `<div class="c07-sh-who"><b class="c07-sh-name">${esc(MC.nameOf(p, o))}</b>` +
      `<span class="c07-sh-ovr">${MC.ltr(p.ovr)}</span>` +
      `<span class="c07-sh-sub"><span dir="ltr">${esc(S.ovr)}</span> · ${esc(S.tiers[p.tier])}</span>` +
      `<span class="c07-sh-meta">${MC.ltr(p.id)}</span><span class="c07-sh-meta">${MC.ltr(p.season)}</span>` +
      (p.founder ? `<span class="c07-sh-founder">${lurexStrip}<span>${ar ? `${esc(S.founder)} ${MC.ltr(p.founder)}` : esc(S.founderLine)}</span></span>` : "") +
      `</div></div></div>`
    );
  }

  /* ---------- the sway: drag the scarf and it swings from its needle ---------- */
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
      g.setAttribute("transform", `rotate(${f2(a)} ${VW / 2} ${NY})`);
      if (Math.abs(a) > 0.02 || Math.abs(v) > 0.02) raf = requestAnimationFrame(step);
      else {
        g.removeAttribute("transform");
        raf = 0;
      }
    };
    el.addEventListener("pointermove", (e) => {
      if (lastX !== null) v += Math.max(-0.6, Math.min(0.6, (e.clientX - lastX) * -0.02));
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
    philosophy: "Your card is a supporter scarf still on its needle: the 84 is the row being knitted, and the scarf is as long as the season you have actually played.",
    philosophyAr: "بطاقتك وشاحُ مشجّعٍ ما زال على إبرته: الرقم 84 هو الصفّ الذي يُحاك الآن، وطول الوشاح هو الموسم الذي لعبته فعلًا.",
    idea: [
      "The card is not a card. It is a double-face jacquard scarf hanging from its own knitting needle, the object Moroccan supporters buy at the stadium gate and hold up together at kick-off. A thick needle crosses the top and overhangs both sides, a round knob at the inline start and a long point at the inline end; tassels hang at the bottom; the folded end of a woven care label sticks out of one long edge.",
      "The scarf is read from the needle down. The live rows on the needle hold the 84, knitted big, because it is the only part still changing. Under them, cream bars count the tier. Then the season: only the gameweeks actually played are knitted, one stripe each, alternating Night and Logo Blue like the bars of a real scarf, newest under the needle, with a cream tally notch on the selvedge every fifth gameweek. Unplayed weeks are not empty rows waiting: they do not exist yet, so the scarf gets longer as the season goes on, from 7 stripes at J.07 to 30 at J.30. A missed week knits as a Night and cream marl stripe.",
      "The end knitted first holds the figure, the shared manager seen from behind, knitted as a jacquard motif on its own finer grid (dark hair, cream ears and nape, a Night bench jacket with a cream collar and yoke seam) and seated on the name. Below it, the cast-on rows.",
      "Every motif is sampled to a boolean stitch grid in JS (Changa for the figures, the avatar's own paths for the figure) and drawn as merged colour runs under one stitch-texture pattern per gauge: dark gaps and lit legs, an edge curl, fibre grain. Thousands of stitches in a few hundred nodes.",
      "The four ratings live on the woven care label, set the way a label lists fibre content: 91 CAP, 82 SEL, 86 TRF, 78 CON, no % sign. The BotolaGO wordmark sits there as the maker's mark, which is where a scarf carries its brand.",
    ],
    belonging: [
      "No two scarves are alike, because the scarf is the season you actually played: its length is your gameweeks, its stripes can be counted, a missed week shows as a marl stripe. That is the strongest 'this is MY card' argument in the slate, and it uses no invented data: stripes count participation, never points.",
      "A 15-year-old wants the finer gauge, the satin binding, the twisted fringe and finally the gold. Friends hold their scarves up together: a league is a wall of scarves, which is a picture people already take in every stadium.",
      "It has a season ritual. At the end of 2026/27 the needle comes off, the scarf is cast off with a second fringe and goes in your drawer; next season you cast on a new one. Your collection is your seasons, and their lengths tell how faithful you were.",
      "Screenshot value comes from the object, not from a number badge: a knitted 84 reads as something made, and the woven 'composition' label is a joke people repeat.",
    ],
    founderMark: [
      "Founders' scarves are cast on in white-gold lurex: the first seven rows ever knitted, just above the fringe, each stitch lit like metal thread (dark gaps, bright legs, one specular pass), with ·26 knitted in Night yarn in the inline-end third like a maker's year mark.",
      "Those rows are never re-knitted. They stay at the chunky first gauge even inside a LEGEND scarf, like a preserved patch, so a 2026 founder carries the same gold rows at the end of every scarf they will ever own.",
      "They catch light: sparkle points and one specular band across the gold only, which drifts when motion is on. The woven label adds FOUNDER 2026 in gold thread for anyone who does not know the code. Later cohorts cast on in plain yarn with their own year in cream; lurex is reserved, by rule, for the founders and for LEGEND.",
      "At 24 to 32px the whole mark survives as one gold line above the fringe.",
    ],
    small: [
      "44–80px: a portrait swatch hanging from a needle stub that overhangs both sides, with a real knob and a real point; the 84 in whole-pixel figures; a fringe that is 30% of the height. The tier is carried by the object, not by bars: wooden rod and three chunky tassels (HOMA), steel rod with four or five tassels (STADE, PRO, which also keeps its dog-ear), twisted silver fringe and binding (CHAMPION), a navy jacquard swatch with gold figures, brass rod and gold bullion (LEGEND). The steel is dark enough, with a dark underside, to hold 3:1 on the light ground.",
      "24–32px: the same silhouette, rod, swatch and fringe, with 2px figures. Fringe strands alternate cream and Night so the fringe reads on both grounds; the founder survives as a 1.5px gold line.",
      "Rows turn the scarf sideways: needle at the inline start, the knitted 84 beside it, name and points on the Night body, gold cast-on and five tassels at the inline end. Five rows in a table read as a wall of scarves.",
    ],
    rtl: [
      "The scarf mirrors, since it is a textile with no logo rule: the needle knob moves to the right (the inline start), the point to the left, the label tab to the left edge, the tally notches to the right selvedge and the ·26 mark and PRO's dog-ear to the left. The BotolaGO wordmark stays Latin and unmirrored on the label.",
      "علي is knitted in square Kufic, the Arabic grid-lettering tradition, drawn by hand on an 8-row grid (a font sampled at that size turns to mush; it was measured). A name without a drawn entry knits its initial and carries the full name on the label. The Arabic tier name is satin-stitch embroidery over the knit (cream thread hatch, split-stitch outline), gold thread at LEGEND. No letter-spacing on Arabic anywhere.",
      "Knitted figures and every number stay left-to-right (direction=ltr in SVG, bdi in HTML). The label's composition switches to a 2×2 grid so the Arabic labels are never squeezed.",
    ],
    tiers: {
      HOMA: "Hand-knitted chunky garter in two yarns only: ridges instead of Vs, 24 stitches across, uneven tension so every row wanders by a unit. The 84 in a 5×7 bitmap, the season in whole cream and Night stripes, and the figure is a felt appliqué blanket-stitched on, because a hand-knitter does not chart a jacquard. Wooden needle, five short tassels, no bars, a printed cotton label.",
      STADE: "Machine knit at 32 stitches, flatter stitches, three yarns: the 84 is sampled from Changa at 14 rows, the figure is a jacquard motif on a finer grid, a 2-row cream stripe under the figure, one bar, seven tassels, a steel needle and a woven satin label.",
      PRO: "Double-face jacquard: the 84 is sampled from Changa at 18 rows, big; the bottom inline-end corner is dog-eared to show the reverse face (cream ground, blue stitches), which changes the outline. Two bars, nine tassels, steel needle with a collar.",
      CHAMPION: "Fine gauge at 48 stitches: the 84 is sampled from Changa at 34 rows and gains curves, the word CHAMPION is sampled too, silver satin binding runs down both long edges, the fringe is twisted, three bars, silver-thread label border.",
      LEGEND: "The live rows become HD woven jacquard (a fine navy twill) on a brass needle, with a rolled hem where the loops were; the 84, the word and three bars are woven in gold thread. The gold carries down the scarf: a lurex ply through every played stripe, gold binding the whole length, a lurex collar and yoke on the figure, a navy damask label woven in gold, and bullion fringe a third longer with two coils per tassel. The season, the figure and the cast-on stay hand-knitted, because your history stays hand-made.",
    },
    legend: [
      "LEGEND is the only tier whose top changes material: the scalloped loops on the needle become one rolled jacquard hem on a brass rod, and the fringe becomes long double-coiled gold bullion, so the silhouette gets longer and smoother.",
      "The moment, with motion on: starting at the needle, each row pulls tight in turn, the knitted 84 underneath is covered by the woven jacquard and the gold-thread figures resolve. It never loops; with reduced motion the finished jacquard simply shows.",
      "Underneath, the scarf stays knitted but carries the gold: a lurex ply in every gameweek stripe, the figure's collar and yoke in lurex, the label woven in gold on navy damask. The most desirable object in the set keeps its history.",
    ],
    advantages: [
      "It is the supporter's own object, not the state's, the federation's or a game's: nothing about it reads as FUT, a bank card or an NFT.",
      "The scarf is real history with honest data (gameweeks played, never invented points): its length and its countable stripes are the season, so every scarf is different and grows as the season goes on.",
      "A seasonal ritual is built in (cast off, cast on), and a league becomes a wall of scarves: a natural group image for sharing.",
      "The silhouette (thick rod with knob and point, strip, fringe) holds at 24px on both grounds, and the knit gauge gives a tier ladder that is material, not colour.",
      "Arabic is part of the object, not a translation: علي is knitted in square Kufic and the tier word is embroidered.",
    ],
    risks: [
      "It sits close to ultras culture. It must never carry slogans, group-like names or banner vocabulary, and moderation would be needed if names became free text.",
      "The card's height changes through the season (about 1:2.3 at J.07, 1:3 by J.30). Galleries and detail sheets need to accept a growing object, and late in the season it needs scrolling on a phone.",
      "Knitted type limits name length: long names fall back to the small font or an initial plus surname, and Arabic names without a hand-drawn Kufic entry knit only their initial, with the full name on the label. Some users will dislike that.",
      "At 24px the knit becomes a pixel badge: what survives is the silhouette, the rod material, the fringe and the gold line, not the textile.",
      "Stripes count participation only. If the owner later wants stripes to show points, that needs a rule they approve, and it would make bad weeks visible forever.",
      "Three cream bars can recall a sportswear brand's stripes; they stay horizontal and full-width to avoid it.",
      "The composition line (ratings set like fibre content, value first) is a joke that has to survive translation; the Arabic stat labels and عضو مؤسس need MSA review before anything ships.",
    ],
    gridWidth: 150,
    detailWidth: 250,
    full,
    token,
    row,
    share,
    mount,
  };
  MC.register(c);
})();
