/* 07 ÉCHARPE — the card is a supporter scarf still on its knitting needle.
   The live rows on the needle hold the rating; the body below is the season, one knitted
   row per gameweek; the end knitted first holds the figure and the name; the founder's
   cast-on is white-gold lurex. Every motif is rasterised to a stitch grid in JS and drawn
   as merged colour runs under one stitch-texture pattern per gauge. */
(function () {
  const MC = window.MC;
  const PFX = "c07";

  // Faces sampled onto stitch grids by canvas. Asking for them here makes
  // document.fonts.ready wait for them before the lab renders.
  try {
    if (document.fonts && document.fonts.load) {
      ['800 64px "Changa"', '700 64px "Changa"', '700 64px "Reem Kufi"'].forEach((f) =>
        document.fonts.load(f, "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ علي محترف").catch(() => {}),
      );
    }
  } catch (e) {
    /* rasterising falls back to whatever face is ready */
  }

  /* ---------- yarns (four yarns, one meaning each) ---------- */
  const YARN = {
    N: "#14305E", // Night: the ground
    K: "#0A1D3F", // deep Night: hair and collar on the blue blocks
    B: "#0151FC", // Logo Blue: live rows, identity end, gameweeks played
    C: "#EFE8D8", // Cream: letters, figure, bars
    L: "#E8D08A", // white-gold lurex: founder cast-on and LEGEND only
  };
  const INK = "#1E2733";
  const MUTED = "#4E5661";

  /* ---------- geometry (viewBox units) ---------- */
  const VW = 240;
  const X0 = 24;
  const X1 = 216;
  const FW = X1 - X0;
  const NY = 16; // needle centre line
  const F0 = 30; // first fabric row
  const R = 6; // one logical row
  const SEC = { live: 23, bars: 5, season: 30, label: 11, ident: 25, cast: 5 };
  const Y = {};
  (function () {
    let y = F0;
    for (const k of ["live", "bars", "season", "label", "ident", "cast"]) {
      Y[k] = y;
      y += SEC[k] * R;
    }
    Y.end = y; // 624
  })();
  const VH = Y.end + 46; // fringe below

  /* gauge = resolution: the tier ladder */
  const GAUGE = {
    HOMA: { cw: 8, ch: 6, sub: 1, kind: "g" },
    STADE: { cw: 6, ch: 6, sub: 1, kind: "v" },
    PRO: { cw: 6, ch: 6, sub: 1, kind: "v" },
    CHAMPION: { cw: 4, ch: 3, sub: 2, kind: "v" },
    LEGEND: { cw: 4, ch: 3, sub: 2, kind: "v" },
  };
  const BARS = { HOMA: 0, STADE: 1, PRO: 2, CHAMPION: 3, LEGEND: 3 };
  const TASSELS = { HOMA: 5, STADE: 7, PRO: 9, CHAMPION: 9, LEGEND: 9 };
  const PLAYED = 7; // sample season: J.01–J.07 played (labelled sample in the gallery)

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
    M: ["#.#", "###", "###", "#.#", "#.#"], N: ["##.", "#.#", "#.#", "#.#", "#.#"], O: [".#.", "#.#", "#.#", "#.#", ".#."],
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
  /* bold 6×7 figures with two-stitch strokes (PRO) */
  const D67 = {
    0: [".####.", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."], 1: ["..##..", ".###..", "..##..", "..##..", "..##..", "..##..", ".####."],
    2: [".####.", "##..##", "....##", "...##.", "..##..", ".##...", "######"], 3: [".####.", "##..##", "....##", "..###.", "....##", "##..##", ".####."],
    4: ["##..##", "##..##", "##..##", "######", "....##", "....##", "....##"], 5: ["######", "##....", "#####.", "....##", "....##", "##..##", ".####."],
    6: [".####.", "##....", "##....", "#####.", "##..##", "##..##", ".####."], 7: ["######", "....##", "...##.", "..##..", "..##..", "..##..", "..##.."],
    8: [".####.", "##..##", "##..##", ".####.", "##..##", "##..##", ".####."], 9: [".####.", "##..##", "##..##", ".#####", "....##", "....##", ".####."],
  };
  /* علي in square Kufic, the grid lettering tradition: ʿayn as a two-pronged cup, lām
     standing, yāʾ turned up with its two dots. Drawn by hand: Arabic at 8 stitch rows
     cannot be sampled from a font without turning to mush (measured). */
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
  function grid(cols, rows, fill) {
    return Array.from({ length: rows }, () => new Array(cols).fill(fill));
  }
  /** Writes a bitmap into the grid; each bitmap pixel covers sx × sy stitches. */
  function stamp(g, bmp, col, row, val, sx = 1, sy = 1) {
    for (let r = 0; r < bmp.length; r++)
      for (let c = 0; c < bmp[r].length; c++) {
        if (bmp[r][c] !== "#") continue;
        for (let yy = 0; yy < sy; yy++)
          for (let xx = 0; xx < sx; xx++) {
            const gr = row + r * sy + yy;
            const gc = col + c * sx + xx;
            if (g[gr] && gc >= 0 && gc < g[gr].length) g[gr][gc] = typeof val === "function" ? val(r, c) : val;
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
  function rasterText(text, font, rows, cw, ch) {
    const spec = font.replace("{s}", "100px");
    const key = `t|${text}|${font}|${rows}|${cw}|${ch}`;
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
      0.46,
      fontsReady(spec),
    );
  }
  /** The shared avatar, part by part, onto the stitch grid. Returns a grid of part keys. */
  function rasterAvatar(cols, rows) {
    const key = `av|${cols}|${rows}`;
    if (RCACHE.has(key)) return RCACHE.get(key);
    const A = MC.AVATAR;
    const box = { x: 0, y: 36, w: 200, h: 204 };
    const cellH = box.h / rows;
    const part = (name, fn) => raster(`av|${name}|${cols}|${rows}`, box, cols, rows, fn, 0.42);
    const fillP = (d) => (x) => x.fill(new Path2D(d));
    const layers = [
      ["T", part("torso", fillP(A.torso))],
      ["S", part("seam", (x) => {
        x.lineWidth = cellH * 0.95;
        x.stroke(new Path2D(A.seam));
      })],
      ["E", part("neck", fillP(A.neck))],
      ["K", part("collar", fillP(A.collar))],
      ["E", part("ears", fillP(A.ears))],
      ["E", part("head", fillP(A.head))],
      ["H", part("hair", fillP(A.hair))],
    ];
    const out = grid(cols, rows, ".");
    for (const [k, bmp] of layers) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (bmp[r][c] === "#") out[r][c] = k;
    RCACHE.set(key, out);
    return out;
  }

  /* ---------- the fabric ---------- */
  function fabric(p, o) {
    const tier = p.tier;
    const G = GAUGE[tier];
    const ar = MC.isAr(o);
    const cols = FW / G.cw;
    const sub = G.sub;
    const ground = tier === "HOMA" ? "N" : "B";
    const bands = [];
    const rnd = seeded(hashStr(p.serial + tier));
    const wobble = (n) => Array.from({ length: n }, () => (tier === "HOMA" ? Math.round(rnd() * 2 - 1) : 0));

    // live rows: the rating, on the needle
    {
      const rows = SEC.live * sub;
      const g = grid(cols, rows, ground);
      if (tier === "HOMA" || tier === "STADE") {
        const bmp = word(String(p.ovr), F57, 2);
        stamp(g, bmp, Math.floor((cols - bw(bmp)) / 2), 1, "C", 1, 2);
      } else if (tier === "PRO") {
        const bmp = word(String(p.ovr), D67, 2);
        stamp(g, bmp, Math.floor((cols - bw(bmp)) / 2), 1, "C", 1, 2);
      } else {
        const bmp = rasterText(String(p.ovr), '700 {s} "Changa"', 28, G.cw, G.ch);
        stamp(g, bmp, Math.floor((cols - bw(bmp)) / 2), 2, "C");
      }
      if (!ar) {
        let tw = word(p.tier, F57, 1);
        if (bw(tw) > cols - 2) tw = word(p.tier, F35, 1);
        const rowsW = tw.length;
        stamp(g, tw, Math.floor((cols - bw(tw)) / 2), (SEC.live - rowsW) * sub - (rowsW === 5 ? sub : 0), "C", 1, sub);
      }
      bands.push({ id: "live", y: Y.live, rows, g, G, off: wobble(rows) });
    }
    // bars: tier count
    {
      const rows = SEC.bars * sub;
      const g = grid(cols, rows, "N");
      const at = { 0: [], 1: [2], 2: [1, 3], 3: [0, 2, 4] }[BARS[tier]];
      for (const r of at) for (let s = 0; s < sub; s++) g[r * sub + s].fill(tier === "LEGEND" ? "L" : "C");
      bands.push({ id: "bars", y: Y.bars, rows, g, G, off: wobble(rows) });
    }
    // season body: one row per gameweek, J.30 at the top, J.01 at the bottom
    {
      const rows = SEC.season * sub;
      const g = grid(cols, rows, "N");
      const edge = ar ? cols - 1 : 0;
      for (let r = 0; r < SEC.season; r++) {
        const gw = SEC.season - r;
        const played = gw <= PLAYED;
        for (let s = 0; s < sub; s++) {
          if (played) {
            if (tier === "HOMA") for (let c2 = 0; c2 < cols; c2++) g[r * sub + s][c2] = c2 % 2 ? "N" : "C"; // two-colour corrugated rib
            else g[r * sub + s].fill("B");
          }
          if (gw % 5 === 0) g[r * sub + s][edge] = played && tier === "HOMA" ? "N" : "C";
        }
      }
      bands.push({ id: "season", y: Y.season, rows, g, G, off: wobble(rows) });
    }
    // under the label
    {
      const rows = SEC.label * sub;
      bands.push({ id: "label", y: Y.label, rows, g: grid(cols, rows, "N"), G, off: wobble(rows) });
    }
    // identity end: the figure and the name
    {
      const rows = SEC.ident * sub;
      const g = grid(cols, rows, ground);
      const figRows = 15 * sub;
      let figCols = Math.round(figRows * (200 / 204) * (G.ch / G.cw));
      if ((cols - figCols) % 2) figCols += 1;
      const av = rasterAvatar(figCols, figRows);
      const c0 = (cols - figCols) / 2;
      const r0 = (ar ? 0 : 1) * sub;
      // the yoke seam is one stitch row: only the fine gauges can afford it
      const seam = sub === 2 ? "B" : "C";
      const map = tier === "HOMA" ? { T: "C", S: "C", E: "C", K: "N", H: "C" } : { T: "C", S: seam, E: "K", K: "C", H: "K" };
      for (let r = 0; r < figRows; r++) for (let c = 0; c < figCols; c++) if (av[r][c] !== ".") g[r0 + r][c0 + c] = map[av[r][c]];
      // the name
      const name = MC.nameOf(p, o);
      const nr0 = (ar ? 16 : 17) * sub;
      if (ar) {
        const k = KUFIC[name];
        if (k) {
          const sx = sub === 2 ? 2 : 1;
          stamp(g, k, Math.floor((cols - bw(k) * sx) / 2), nr0, "C", sx, sub);
        } else {
          const bmp = rasterText(name, '700 {s} "Reem Kufi"', 8 * sub, G.cw, G.ch);
          stamp(g, bmp, Math.floor((cols - bw(bmp)) / 2), nr0, "C");
        }
      } else {
        const nm = fitName(name, cols, sub);
        stamp(g, nm.bmp, Math.floor((cols - bw(nm.bmp)) / 2), nr0 + nm.dy, "C", 1, nm.sy);
      }
      bands.push({ id: "ident", y: Y.ident, rows, g, G, off: wobble(rows) });
    }
    // cast-on: founders' white-gold rows stay at the chunky first gauge forever
    {
      const yr = "·" + String(p.founder || 2026).slice(-2);
      if (p.founder) {
        const CG = GAUGE.HOMA;
        const cc = FW / CG.cw;
        const g = grid(cc, SEC.cast, "L");
        const bmp = word(yr, F35, 1);
        stamp(g, bmp, Math.ceil((cc - bw(bmp)) / 2), 0, "N");
        const r2 = seeded(hashStr(p.serial + "cast"));
        bands.push({ id: "cast", y: Y.cast, rows: SEC.cast, g, G: CG, off: Array.from({ length: SEC.cast }, () => Math.round(r2() * 2 - 1)), lurex: true });
      } else {
        const rows = SEC.cast * sub;
        const g = grid(cols, rows, "N");
        const bmp = word(yr, F35, 1);
        stamp(g, bmp, Math.ceil((cols - bw(bmp)) / 2), 0, "C", 1, sub);
        bands.push({ id: "cast", y: Y.cast, rows, g, G, off: wobble(rows) });
      }
    }
    return bands;
  }
  /** Picks the knitted name size the way real scarves do: big if it fits, then small, then cut. */
  function fitName(name, cols, sub) {
    const up = name.toUpperCase();
    const big = word(up, F57, 1);
    if (bw(big) <= cols - 2) return { bmp: big, sy: sub, dy: 0 };
    const small = word(up, F35, 1);
    if (bw(small) <= cols - 2) return { bmp: small, sy: sub, dy: sub };
    const parts = up.split(/\s+/);
    let cut = parts.length > 1 ? parts[0][0] + " " + parts[parts.length - 1] : up;
    while (bw(word(cut, F35, 1)) > cols - 2 && cut.length > 1) cut = cut.slice(0, -1);
    return { bmp: word(cut, F35, 1), sy: sub, dy: sub };
  }

  /* ---------- SVG building blocks ---------- */
  /** The stitch texture: dark gaps and lit legs over any yarn colour. */
  function stitchPattern(id, G) {
    const w = G.cw;
    const h = G.ch;
    const gid = id + "-lg";
    const grad =
      `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".42" stop-color="#fff" stop-opacity=".05"/>` +
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
        `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">` +
        `<path d="M0 0H${w}V${h}H0Z${bumps.map(([x, y]) => ell(x, y)).join("")}" fill="#020a1c" fill-opacity=".46" fill-rule="evenodd"/>` +
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
      `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">` +
      `<path d="M0 0H${w}V${h}H0Z${legs.map(ellPath).join("")}" fill="#020a1c" fill-opacity=".42" fill-rule="evenodd"/>` +
      legs.map(([cx, cy, a]) => `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(${a} ${f2(cx)} ${f2(cy)})" fill="url(#${gid})"/>`).join("") +
      `</pattern>`
    );
  }

  /** Colour runs for one band, then its stitch texture. HOMA rows wander ±1u (uneven tension). */
  function drawBand(b, ids, opts = {}) {
    const { g, G } = b;
    const rh = G.ch;
    const base = g[0][0] === "L" ? "L" : mostCommon(g);
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
        if (k !== base) runs += `<rect x="${X0 + c * G.cw}" y="${y}" width="${(e - c) * G.cw}" height="${rh}" fill="${YARN[k]}"/>`;
        c = e;
      }
      const fillBase = b.lurex ? `url(#${ids.lurex})` : YARN[base];
      const rowH = r === b.rows - 1 ? rh : rh + 0.05; // overlap the next row: no hairline seams
      out +=
        `<g${dx ? ` transform="translate(${dx} 0)"` : ""}>` +
        `<rect x="${X0}" y="${y}" width="${FW}" height="${rowH}" fill="${fillBase}"/>` +
        runs +
        (opts.flat ? "" : `<rect x="${X0}" y="${y}" width="${FW}" height="${rh}" fill="url(#${ids.pat[G.cw + "x" + G.ch]})"/>`) +
        `</g>`;
    }
    return out;
  }
  function mostCommon(g) {
    const n = {};
    for (const row of g) for (const k of row) n[k] = (n[k] || 0) + 1;
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  }
  /** Outline that follows every row's wander (the selvedge). */
  function outlinePath(bands) {
    const right = [];
    const left = [];
    for (const b of bands)
      for (let r = 0; r < b.rows; r++) {
        const y = b.y + r * b.G.ch;
        const dx = b.off[r] || 0;
        right.push(`L${X1 + dx} ${y}L${X1 + dx} ${y + b.G.ch}`);
        left.unshift(`L${X0 + dx} ${y + b.G.ch}L${X0 + dx} ${y}`);
      }
    return `M${X0} ${F0}` + right.join("") + left.join("") + "Z";
  }

  /** The needle: wood (HOMA), steel, brass (LEGEND). Knob at the inline start, point at the end. */
  function needle(tier, ids) {
    const mat = tier === "HOMA" ? "wood" : tier === "LEGEND" ? "brass" : "steel";
    const grads = {
      steel: ["#6E7886", "#E6EBF0", "#A9B2BE", "#7D8794", "#C6CDD6"],
      wood: ["#7A5634", "#E2BE8C", "#B08A5E", "#8C6640", "#C9A06C"],
      brass: ["#7A5A1C", "#FFF1BE", "#D7B256", "#9C7A2C", "#F1D98A"],
    }[mat];
    const g = ids.needle;
    const defs =
      `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${grads[0]}"/><stop offset=".26" stop-color="${grads[1]}"/>` +
      `<stop offset=".52" stop-color="${grads[2]}"/><stop offset=".85" stop-color="${grads[3]}"/><stop offset="1" stop-color="${grads[4]}"/></linearGradient>` +
      `<radialGradient id="${g}-k" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="${grads[1]}"/><stop offset=".45" stop-color="${grads[2]}"/><stop offset="1" stop-color="${grads[0]}"/></radialGradient>`;
    const rod = `<path d="M14 ${NY - 5.6}H219L240 ${NY}L219 ${NY + 5.6}H14Z" fill="url(#${g})"/>`;
    const grain =
      mat === "wood"
        ? `<path d="M30 ${NY - 2}H98M120 ${NY + 1.5}H200M60 ${NY + 3}H140M150 ${NY - 2.6}H214" stroke="#6B4A2A" stroke-width=".5" opacity=".55"/>`
        : `<path d="M16 ${NY - 2.4}H219" stroke="#fff" stroke-width=".9" opacity="${mat === "brass" ? 0.75 : 0.6}" stroke-linecap="round"/>`;
    const collar = mat === "wood" ? "" : `<rect x="15" y="${NY - 6.8}" width="4.4" height="13.6" rx="1.2" fill="url(#${g})"/>`;
    const knob =
      `<circle cx="10.5" cy="${NY}" r="${mat === "wood" ? 9.5 : 10.5}" fill="url(#${g}-k)"/>` +
      (mat === "brass" ? `<circle cx="10.5" cy="${NY}" r="6.4" fill="none" stroke="#7A5A1C" stroke-width=".8" opacity=".75"/><circle cx="10.5" cy="${NY}" r="2.4" fill="#FFF1BE" opacity=".85"/>` : "");
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
      d += `M${f2(x1)} ${F0 + 3}C${f2(x1)} ${NY - 16} ${f2(x2)} ${NY - 16} ${f2(x2)} ${F0 + 3}`;
      hl += `M${f2(x1 + 0.4)} ${NY + 2}C${f2(x1 + 0.4)} ${NY - 11} ${f2(x2 - 0.4)} ${NY - 11} ${f2(x2 - 0.4)} ${NY + 2}`;
    }
    const sw = G.cw * 0.42;
    return (
      `<path d="${d}" fill="none" stroke="#020a1c" stroke-opacity=".55" stroke-width="${f2(sw + 1)}" stroke-linecap="round"/>` +
      `<path d="${d}" fill="none" stroke="${YARN[k]}" stroke-width="${f2(sw)}" stroke-linecap="round"/>` +
      `<path d="${hl}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="${f2(sw * 0.4)}" stroke-linecap="round"/>`
    );
  }

  /** Fringe: tassels of mixed yarn (cream reads on night grounds, night on day grounds). */
  function fringe(p, ids, thumb) {
    const tier = p.tier;
    const n = TASSELS[tier];
    const rnd = seeded(hashStr(p.serial + "fringe" + tier));
    const span = [X0 + 8, X1 - 8];
    const base = { HOMA: 26, STADE: 30, PRO: 33, CHAMPION: 36, LEGEND: 38 }[tier];
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = span[0] + ((span[1] - span[0]) * i) / (n - 1);
      const len = base + (rnd() * 6 - 3);
      const top = Y.end - 2;
      const bot = top + len;
      const sway = rnd() * 3 - 1.5;
      if (tier === "LEGEND") {
        // bullion: coiled gold thread
        const d = `M${f2(x)} ${top}C${f2(x + sway)} ${f2(top + len * 0.4)} ${f2(x - sway)} ${f2(top + len * 0.7)} ${f2(x + sway * 0.6)} ${f2(bot)}`;
        out +=
          `<path d="${d}" stroke="#5E4614" stroke-width="5.2" fill="none" stroke-linecap="round"/>` +
          `<path d="${d}" stroke="url(#${ids.gold})" stroke-width="4.2" fill="none" stroke-linecap="round"/>` +
          (thumb ? "" : `<path d="${d}" stroke="#7A5A1C" stroke-width="4.2" fill="none" stroke-dasharray=".7 1.3" opacity=".9"/>`) +
          `<path d="${d}" stroke="#FFF6D8" stroke-width=".9" fill="none" opacity=".75" transform="translate(-1 0)"/>`;
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
        continue;
      }
      const strands = tier === "HOMA" ? 5 : 6;
      for (let s = 0; s < strands; s++) {
        const k = (s + i) % 2 === 0 ? "C" : "N";
        const spread = (s - (strands - 1) / 2) * 1.25;
        const l = len - rnd() * 4;
        out += `<path d="M${f2(x + spread * 0.35)} ${top}C${f2(x + spread * 0.6 + sway)} ${f2(top + l * 0.5)} ${f2(x + spread + sway)} ${f2(top + l * 0.75)} ${f2(x + spread * 1.3 + sway)} ${f2(top + l)}" stroke="${YARN[k]}" stroke-width="${tier === "HOMA" ? 2.2 : 1.8}" fill="none" stroke-linecap="round"/>`;
      }
      // the knot that ties the tassel through the cast-on
      out += `<ellipse cx="${f2(x)}" cy="${top + 2.4}" rx="${tier === "HOMA" ? 3.4 : 2.8}" ry="2.4" fill="${p.founder ? YARN.L : YARN.C}" stroke="#020a1c" stroke-opacity=".35" stroke-width=".6"/>`;
    }
    return out;
  }

  /** The woven label: maker's mark, composition (the four ratings), ID, country, founder line. */
  function label(p, o, ids, thumb) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tier = p.tier;
    const h = ar ? 70 : 62;
    const y = Y.label + (SEC.label * R - h) / 2;
    const w = 166;
    // sewn at the inline-end selvedge; its folded end sticks out of the edge: the tab
    const x = ar ? X0 : X1 - w;
    const tabX = ar ? X0 - 14 : X1;
    const thread = tier === "LEGEND" ? "#C9A54C" : tier === "CHAMPION" ? "#AEB8C4" : "#C9C2B0";
    const cloth = tier === "HOMA" ? "#ECE5D4" : "#FAF8F2";
    let s = "";
    s += `<rect x="${x + (ar ? -1 : 1.4)}" y="${y + 2}" width="${w}" height="${h}" fill="#020a1c" opacity=".38" filter="url(#${ids.soft})"/>`;
    s += `<rect x="${tabX}" y="${y + 10}" width="14" height="${h - 20}" rx="1.4" fill="url(#${ids.tab})"/>`;
    s += `<path d="M${ar ? tabX + 3 : tabX + 11} ${y + 13}V${y + h - 13}" stroke="${thread}" stroke-width=".8" stroke-dasharray="1.6 1.2"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${cloth}"/>`;
    if (tier !== "HOMA") s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ids.weave})"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ids.sheen})" opacity="${tier === "HOMA" ? 0.35 : 1}"/>`;
    if (tier !== "HOMA") s += `<rect x="${x + 3.2}" y="${y + 3.2}" width="${w - 6.4}" height="${h - 6.4}" fill="none" stroke="${thread}" stroke-width="${tier === "LEGEND" ? 1.3 : 0.9}"/>`;
    s += `<rect x="${x + 1.3}" y="${y + 1.3}" width="${w - 2.6}" height="${h - 2.6}" fill="none" stroke="${tier === "HOMA" ? "#8F877A" : YARN.N}" stroke-width=".7" stroke-dasharray="2.2 1.6" opacity=".5"/>`;
    s += `<rect x="${ar ? X0 - 0.5 : X1 - 1.5}" y="${y}" width="2" height="${h}" fill="#020a1c" opacity=".2"/>`;
    if (thumb) {
      const ix = ar ? x + w - 66 : x + 12;
      s += `<rect x="${ix}" y="${y + 12}" width="54" height="8" fill="${YARN.N}" opacity=".85"/><rect x="${x + 12}" y="${y + 30}" width="${w - 24}" height="9" fill="${INK}" opacity=".45"/>`;
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
      .map((pp) => `<path d="${pp.d}" fill="${tier === "LEGEND" ? "#8C6A22" : YARN.N}"/>`)
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
    }
    return s;
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tier = p.tier;
    const G = GAUGE[tier];
    const thumb = !!o.thumb;
    const u = MC.uid(PFX);
    const ids = {
      pat: {},
      lurex: u + "-lx",
      needle: u + "-nd",
      clip: u + "-cl",
      curl: u + "-cu",
      top: u + "-tp",
      grain: u + "-gr",
      sparkle: u + "-sp",
      shine: u + "-sh",
      weave: u + "-wv",
      sheen: u + "-sn",
      tab: u + "-tb",
      soft: u + "-sf",
      gold: u + "-gd",
      satin: u + "-sa",
      twill: u + "-tw",
      emboss: u + "-em",
      bind: u + "-bd",
    };
    const bands = fabric(p, o);
    const gauges = {};
    for (const b of bands) gauges[b.G.cw + "x" + b.G.ch] = b.G;
    let defs = "";
    for (const k of Object.keys(gauges)) {
      ids.pat[k] = `${u}-p${k}`;
      defs += stitchPattern(ids.pat[k], gauges[k]);
    }
    const nd = needle(tier, ids);
    defs += nd.defs;
    defs +=
      // lurex: a metallic ground that the stitch texture sits on
      `<linearGradient id="${ids.lurex}" x1="0" y1="0" x2="1" y2=".25"><stop offset="0" stop-color="#C29A3E"/><stop offset=".22" stop-color="#FBEDB8"/>` +
      `<stop offset=".4" stop-color="#D6B460"/><stop offset=".6" stop-color="#F7E4A4"/><stop offset=".8" stop-color="#BF963C"/><stop offset="1" stop-color="#F2DC94"/></linearGradient>` +
      `<pattern id="${ids.sparkle}" width="11" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".55" fill="#fff"/><circle cx="7.5" cy="6.2" r=".45" fill="#FFF6D8"/><circle cx="9.6" cy="1.4" r=".3" fill="#fff"/></pattern>` +
      `<linearGradient id="${ids.shine}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<clipPath id="${ids.clip}"><path d="${outlinePath(bands)}"/></clipPath>` +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".07" stop-color="#000" stop-opacity=".08"/>` +
      `<stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset=".93" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>` +
      `<linearGradient id="${ids.top}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".12" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>` +
      `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="${hashStr(p.serial) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .02  0 0 0 0 .04  0 0 0 0 .1  0 0 0 2.4 -1.02"/></filter>` +
      `<pattern id="${ids.weave}" width="2" height="1.6" patternUnits="userSpaceOnUse"><rect width="2" height=".7" fill="#000" opacity=".045"/><rect x="1" y=".8" width="1" height=".8" fill="#000" opacity=".03"/></pattern>` +
      `<linearGradient id="${ids.sheen}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".42" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient>` +
      `<linearGradient id="${ids.tab}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ar ? "#F4F1EA" : "#BDB6A6"}"/><stop offset=".5" stop-color="#E9E4D8"/><stop offset="1" stop-color="${ar ? "#BDB6A6" : "#F4F1EA"}"/></linearGradient>` +
      `<filter id="${ids.soft}" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      `<linearGradient id="${ids.gold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset=".22" stop-color="#F0D78E"/><stop offset=".5" stop-color="#C9A24A"/><stop offset=".6" stop-color="#A8822F"/><stop offset=".8" stop-color="#E7C873"/><stop offset="1" stop-color="#FFF0BF"/></linearGradient>` +
      `<linearGradient id="${ids.bind}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${tier === "LEGEND" ? "#8C6A22" : "#7F8995"}"/><stop offset=".45" stop-color="${tier === "LEGEND" ? "#FFF1BE" : "#F2F5F8"}"/><stop offset="1" stop-color="${tier === "LEGEND" ? "#B8902F" : "#AEB8C4"}"/></linearGradient>`;

    let fab = "";
    for (const b of bands) {
      if (tier === "LEGEND" && (b.id === "live" || b.id === "bars") && !o.motion) continue;
      fab += drawBand(b, ids);
    }
    const castBand = bands.find((b) => b.id === "cast");
    // founder lurex: sparkle and one specular band across the gold rows only
    let lux = "";
    if (castBand.lurex) {
      const cy = castBand.y;
      const ch = SEC.cast * R;
      lux =
        `<g clip-path="url(#${ids.clip})">` +
        (thumb ? "" : `<rect x="${X0 - 2}" y="${cy}" width="${FW + 4}" height="${ch}" fill="url(#${ids.sparkle})" opacity=".85"/>`) +
        `<g class="c07-shine"><rect x="${X0 + 128}" y="${cy - 4}" width="22" height="${ch + 8}" fill="url(#${ids.shine})" transform="translate(${X0 + 139} ${cy + ch / 2}) skewX(-28) translate(${-(X0 + 139)} ${-(cy + ch / 2)})" style="mix-blend-mode:screen" opacity=".55"/></g>` +
        `</g>`;
    }
    // CHAMPION and LEGEND: satin binding along both long edges
    let binding = "";
    if (tier === "CHAMPION" || tier === "LEGEND") {
      const yb = tier === "LEGEND" ? Y.season : F0;
      binding =
        `<rect x="${X0 - 1.2}" y="${yb}" width="4.4" height="${Y.cast - yb}" fill="url(#${ids.bind})"/>` +
        `<rect x="${X1 - 3.2}" y="${yb}" width="4.4" height="${Y.cast - yb}" fill="url(#${ids.bind})"/>`;
    }
    // LEGEND: the live rows pulled tight into woven satin, the 84 woven in lurex
    let satin = "";
    if (tier === "LEGEND") satin = legendSatin(p, o, ids, u, thumb);

    const outline = outlinePath(bands);
    const shade =
      `<g clip-path="url(#${ids.clip})" pointer-events="none">` +
      `<rect x="${X0 - 2}" y="${F0}" width="${FW + 4}" height="${Y.end - F0}" fill="url(#${ids.curl})"/>` +
      `<rect x="${X0 - 2}" y="${F0}" width="${FW + 4}" height="${Y.end - F0}" fill="url(#${ids.top})"/>` +
      (thumb ? "" : `<rect x="${X0 - 2}" y="${F0}" width="${FW + 4}" height="${Y.end - F0}" filter="url(#${ids.grain})" opacity=".55"/>`) +
      `</g>`;
    const rim = `<path class="c07-rim" d="${outline}" fill="none" stroke-width="1.1"/>`;
    const needleG = `<g${ar ? ` transform="matrix(-1 0 0 1 ${VW} 0)"` : ""}>${nd.body}</g>`;
    const top = tier === "LEGEND" ? "" : loops(tier, G);
    // Arabic tier word: embroidered over the knit (curves that a coarse stitch grid cannot hold)
    let embroidery = "";
    if (ar && tier !== "LEGEND") {
      const ty = Y.live + (SEC.live - 3) * R - 1;
      embroidery =
        `<text x="${VW / 2}" y="${ty}" text-anchor="middle" direction="rtl" class="c07-emb" stroke="#0A1D3F" stroke-width="2.6" stroke-linejoin="round">${esc(S.tiers[tier])}</text>` +
        `<text x="${VW / 2}" y="${ty}" text-anchor="middle" direction="rtl" class="c07-emb" fill="${YARN.C}">${esc(S.tiers[tier])}</text>`;
    }

    const svg =
      `<svg class="c07-svg" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      `<g class="c07-sway">` +
      `<g class="c07-fringe">${fringe(p, ids, thumb)}</g>` +
      `<g class="c07-fabric">${fab}${lux}${binding}${shade}${satin}${rim}</g>` +
      embroidery +
      label(p, o, ids, thumb) +
      `</g>` +
      needleG +
      top +
      `</svg>`;
    const cls = `c07 c07--${tier.toLowerCase()}${thumb ? " c07--thumb" : ""}${o.motion ? " c07--motion" : ""}`;
    return `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}">${svg}</div>`;
  }

  /** LEGEND: woven satin over the live rows, a smooth sleeve on a brass needle, the 84 in lurex. */
  function legendSatin(p, o, ids, u, thumb) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const yb = Y.season; // the satin replaces the live rows and the bars
    const yt = NY - 9;
    const defs =
      `<defs><linearGradient id="${ids.satin}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1F45"/><stop offset=".3" stop-color="#173873"/>` +
      `<stop offset=".44" stop-color="#2D5AA8"/><stop offset=".52" stop-color="#15336C"/><stop offset=".78" stop-color="#0E2550"/><stop offset="1" stop-color="#1B3E7C"/></linearGradient>` +
      `<pattern id="${ids.twill}" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-62)"><rect width="3" height=".8" fill="#fff" opacity=".07"/></pattern>` +
      `<linearGradient id="${u}-sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A1A3A"/><stop offset=".35" stop-color="#3561AE"/><stop offset=".6" stop-color="#14306A"/><stop offset="1" stop-color="#0B1F45"/></linearGradient>` +
      `<filter id="${ids.emboss}" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="b"/>` +
      `<feSpecularLighting in="b" surfaceScale="3.2" specularConstant=".95" specularExponent="16" lighting-color="#FFF6D8" result="s"><feDistantLight azimuth="235" elevation="44"/></feSpecularLighting>` +
      `<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".8" k4="0"/></filter>` +
      `<pattern id="${u}-gw" width="2" height="1.4" patternUnits="userSpaceOnUse"><rect width="2" height=".6" fill="#5E4614" opacity=".22"/></pattern></defs>`;
    const body =
      `<path d="M${X0} ${yt + 4}Q${X0} ${yt} ${X0 + 4} ${yt}H${X1 - 4}Q${X1} ${yt} ${X1} ${yt + 4}V${yb}H${X0}Z" fill="url(#${ids.satin})"/>` +
      `<rect x="${X0}" y="${yt}" width="${FW}" height="${yb - yt}" fill="url(#${ids.twill})"/>` +
      // the rolled sleeve around the needle
      `<rect x="${X0}" y="${yt}" width="${FW}" height="${F0 - yt}" rx="4" fill="url(#${u}-sl)"/>` +
      `<path d="M${X0 + 2} ${F0 + 0.6}H${X1 - 2}" stroke="${YARN.L}" stroke-width=".7" stroke-dasharray="2 1.6" opacity=".8"/>`;
    // the 84, woven in lurex; centred on its own measured box
    const fs = 128;
    const by = Y.live + R + 86;
    const num =
      `<g filter="url(#${ids.emboss})">` +
      `<text x="${VW / 2}" y="${by}" text-anchor="middle" direction="ltr" class="c07-legend-ovr" font-size="${fs}" fill="url(#${ids.gold})" stroke="#5E4614" stroke-width=".9" paint-order="stroke">${p.ovr}</text>` +
      `</g>` +
      (thumb ? "" : `<text x="${VW / 2}" y="${by}" text-anchor="middle" direction="ltr" class="c07-legend-ovr" font-size="${fs}" fill="url(#${u}-gw)">${p.ovr}</text>`);
    const word = ar
      ? `<text x="${VW / 2}" y="${Y.live + 148}" text-anchor="middle" direction="rtl" class="c07-legend-word c07-legend-word-ar" fill="url(#${ids.gold})">${esc(S.tiers.LEGEND)}</text>`
      : `<text x="${VW / 2 + 2.5}" y="${Y.live + 144}" text-anchor="middle" direction="ltr" class="c07-legend-word" fill="url(#${ids.gold})">${esc(S.tiers.LEGEND)}</text>`;
    // three woven gold bars in place of the knitted ones
    let bars = "";
    for (let i = 0; i < 3; i++) bars += `<rect x="${X0}" y="${Y.bars + 6 + i * 7}" width="${FW}" height="3" fill="url(#${ids.bind})"/>`;
    const seam = `<path d="M${X0} ${yb}H${X1}" stroke="#020a1c" stroke-opacity=".5" stroke-width="1.4"/><path d="M${X0 + 1} ${yb - 0.4}H${X1 - 1}" stroke="${YARN.L}" stroke-width=".8" stroke-dasharray="2.4 1.6"/>`;
    const bind =
      `<rect x="${X0 - 1.2}" y="${yt + 3}" width="4.4" height="${yb - yt - 3}" fill="url(#${ids.bind})"/>` +
      `<rect x="${X1 - 3.2}" y="${yt + 3}" width="4.4" height="${yb - yt - 3}" fill="url(#${ids.bind})"/>`;
    return `<g class="c07-satin">${defs}${body}${bars}${num}${word}${seam}${bind}</g>`;
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
    const nt = Math.max(2, Math.round(s * 0.075)); // needle thickness
    const fh = Math.max(4, Math.round(s * 0.17)); // fringe
    const y0 = Math.round(nt / 2); // the swatch hangs from the needle's centre line
    const sh = s - y0 - fh; // swatch height
    const cell = Math.max(2, Math.floor((sh * 0.5) / 5));
    const dw = 7 * cell;
    const dh = 5 * cell;
    let sw = Math.max(dw + 4 * cell, Math.round(sh * 0.92));
    if ((sw - dw) % 2) sw += 1;
    const ov = Math.max(2, Math.round(s * 0.08));
    const W = sw + 2 * ov;
    const sx = ov;
    const nBars = legend ? 0 : BARS[tier];
    const bt = mini ? 1 : Math.max(1, Math.round(cell * 0.6));
    const founderH = p.founder ? (mini ? 1.5 : Math.max(2, Math.round(cell * 0.7))) : 0;
    const barsTop = y0 + Math.ceil(nt / 2) + bt;
    const barsH = nBars ? nBars * bt * 2 : 0;
    const dx = sx + (sw - dw) / 2;
    const free = y0 + sh - founderH - (barsTop + barsH);
    const dy = Math.round(barsTop + barsH + (free - dh) / 2);
    const ground = legend ? `url(#${u}-sat)` : tier === "HOMA" ? YARN.N : YARN.B;
    const gold = `url(#${u}-gd)`;
    let defs =
      `<linearGradient id="${u}-gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset=".5" stop-color="#E2BF62"/><stop offset=".62" stop-color="#B8902F"/><stop offset="1" stop-color="#FFF0BF"/></linearGradient>`;
    if (legend)
      defs += `<linearGradient id="${u}-sat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1F45"/><stop offset=".45" stop-color="#2D5AA8"/><stop offset=".55" stop-color="#15336C"/><stop offset="1" stop-color="#0B1F45"/></linearGradient>`;
    const mat = tier === "HOMA" ? ["#7A5634", "#E2BE8C", "#B08A5E"] : legend ? ["#8C6A22", "#FFF1BE", "#D7B256"] : ["#6E7886", "#E6EBF0", "#A9B2BE"];
    defs += `<linearGradient id="${u}-nd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mat[0]}"/><stop offset=".35" stop-color="${mat[1]}"/><stop offset="1" stop-color="${mat[2]}"/></linearGradient>`;
    // stitch texture once a stitch is 3px or more; flat yarn fields below that
    const tex = !mini && cell >= 3;
    if (tex) {
      if (legend) defs += `<pattern id="${u}-tx" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-62)"><rect width="3" height=".9" fill="#fff" opacity=".09"/></pattern>`;
      else {
        const G = tier === "HOMA" ? { cw: cell * 1.34, ch: cell, kind: "g" } : tier === "CHAMPION" ? { cw: cell * 0.67, ch: cell * 0.5, kind: "v" } : { cw: cell, ch: cell, kind: "v" };
        defs += stitchPattern(`${u}-tx`, G).replace(`patternUnits="userSpaceOnUse"`, `patternUnits="userSpaceOnUse" x="${sx}" y="${y0}"`);
      }
    }
    let b = "";
    // fringe ticks, alternating yarns so the fringe reads on both grounds
    const nTick = mini ? 4 : { HOMA: 3, STADE: 4, PRO: 5, CHAMPION: 5, LEGEND: 5 }[tier];
    const tw = Math.max(1, Math.round(s * 0.045));
    for (let i = 0; i < nTick; i++) {
      const x = sx + 1 + ((sw - 2 - tw) * i) / (nTick - 1) + tw / 2;
      const len = fh - (i % 2 ? 1 : 0) - (tier === "HOMA" ? 1 : 0);
      const col = legend ? gold : i % 2 ? YARN.N : YARN.C;
      b += `<line x1="${f2(x)}" y1="${y0 + sh - 1}" x2="${f2(x)}" y2="${y0 + sh + len}" stroke="${col}" stroke-width="${tw}"${!legend && i % 2 === 0 ? ` class="c07-tk-c"` : ""}/>`;
      if ((tier === "CHAMPION" || legend) && !mini)
        b += `<line x1="${f2(x)}" y1="${y0 + sh}" x2="${f2(x)}" y2="${y0 + sh + len}" stroke="${legend ? "#7A5A1C" : YARN.N}" stroke-width="${tw}" stroke-dasharray="1 1.2" opacity=".75"/>`;
    }
    // swatch, texture, binding
    b += `<rect class="c07-tk-sw" x="${sx}" y="${y0}" width="${sw}" height="${sh}" fill="${ground}"/>`;
    if (tex) b += `<rect x="${sx}" y="${y0}" width="${sw}" height="${sh}" fill="url(#${u}-tx)"/>`;
    for (let i = 0; i < nBars; i++) b += `<rect x="${sx}" y="${barsTop + bt * 2 * i}" width="${sw}" height="${bt}" fill="${YARN.C}"/>`;
    if (tier === "CHAMPION" || legend) {
      const bb = mini ? 1 : Math.max(1.5, Math.round(cell * 0.6));
      const bc = legend ? gold : "#DCE2E9";
      b += `<rect x="${sx}" y="${y0}" width="${bb}" height="${sh}" fill="${bc}"/><rect x="${sx + sw - bb}" y="${y0}" width="${bb}" height="${sh}" fill="${bc}"/>`;
    }
    // founder: the lurex line above the fringe
    if (p.founder) b += `<rect x="${sx}" y="${y0 + sh - founderH}" width="${sw}" height="${founderH}" fill="#E8D08A"/>`;
    // needle on top (knob at the inline start), with loops from 44px
    const knobR = Math.max(1.5, nt * 0.95);
    b += `<rect x="${f2(knobR)}" y="0" width="${f2(W - knobR - 0.5)}" height="${nt}" rx="${nt / 2}" fill="url(#${u}-nd)"/>`;
    b += `<circle cx="${f2(knobR)}" cy="${nt / 2}" r="${f2(knobR)}" fill="url(#${u}-nd)"/>`;
    if (!mini && !legend) {
      let d = "";
      const step = Math.max(3, cell);
      for (let x = sx + step / 2; x < sx + sw - 1; x += step) d += `M${f2(x - step * 0.22)} ${y0 + 2}V${f2(nt * 0.15)}M${f2(x + step * 0.22)} ${y0 + 2}V${f2(nt * 0.15)}`;
      b += `<path d="${d}" stroke="${tier === "HOMA" ? YARN.N : YARN.B}" stroke-width="${f2(Math.max(1, step * 0.3))}"/>`;
    }
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
        dg += `<rect x="${dx + c * cell}" y="${dy + r * cell}" width="${(e - c) * cell}" height="${cell}"/>`;
        c = e;
      }
    }
    const digits = `<g fill="${legend ? gold : YARN.C}" shape-rendering="crispEdges"${ar ? ` transform="matrix(-1 0 0 1 ${2 * dx + dw} 0)"` : ""}>${dg}</g>`;
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
    const G = tier === "HOMA" ? { cw: 4, ch: 3, kind: "g" } : tier === "CHAMPION" ? { cw: 2, ch: 2, kind: "v" } : { cw: 3, ch: 3, kind: "v" };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${G.cw}" height="${G.ch}"><defs>${stitchPattern("k", G)}</defs><rect width="${G.cw}" height="${G.ch}" fill="url(#k)"/></svg>`;
    KNIT[tier] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / ${G.cw}px ${G.ch}px`;
    return KNIT[tier];
  }

  /* ---------- row: the scarf turned sideways ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tier = p.tier;
    const u = MC.uid(PFX + "r");
    const legend = tier === "LEGEND";
    // the knitted figure block beside the needle: 3px stitches with rows doubled, or a
    // 2px fine gauge sampled from Changa at CHAMPION, or woven lurex at LEGEND
    let bmp;
    let cell = 3;
    let sy = 2;
    if (tier === "PRO") bmp = word(String(p.ovr), D67, 2);
    else if (tier === "CHAMPION") {
      bmp = rasterText(String(p.ovr), '700 {s} "Changa"', 21, 2, 2);
      cell = 2;
      sy = 1;
    } else if (!legend) bmp = word(String(p.ovr), F57, 2);
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
      digits =
        `<svg class="c07-row-ovr" width="${blockW}" height="52" viewBox="0 0 ${blockW} 52" aria-hidden="true">` +
        `<defs><linearGradient id="${u}-og" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset=".45" stop-color="#E2BF62"/><stop offset=".6" stop-color="#B8902F"/><stop offset="1" stop-color="#FFF0BF"/></linearGradient></defs>` +
        `<text x="${blockW / 2}" y="44" text-anchor="middle" direction="ltr" class="c07-row-gold" fill="url(#${u}-og)" stroke="#5E4614" stroke-width=".6" paint-order="stroke">${p.ovr}</text></svg>`;
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
        out += `<path d="M0 ${f2(y)}H${f2(len)}" stroke="#5E4614" stroke-width="3.6" stroke-linecap="round"/><path d="M0 ${f2(y)}H${f2(len)}" stroke="url(#${u}-g)" stroke-width="2.8" stroke-linecap="round"/><path d="M0 ${f2(y)}H${f2(len)}" stroke="#7A5A1C" stroke-width="2.8" stroke-dasharray=".6 1.1"/>`;
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

  /* ---------- share: the scarf on the terrace rail under floodlights ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid(PFX + "s");
    const cap = ar ? ["موسمي", "صفًّا", "بعد صف"] : ["MY", "SEASON,", "ROW BY", "ROW."];
    const bg =
      `<svg class="c07-sh-bg" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true"${ar ? ` style="transform:scaleX(-1)"` : ""}>` +
      `<defs><radialGradient id="${u}-h" cx=".16" cy=".02" r=".9"><stop offset="0" stop-color="#CFE6FF" stop-opacity=".38"/><stop offset=".25" stop-color="#7FA8E8" stop-opacity=".16"/><stop offset=".6" stop-color="#2A4F9A" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${u}-c" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#E6F1FF" stop-opacity=".22"/><stop offset=".55" stop-color="#9CC0F5" stop-opacity=".05"/><stop offset="1" stop-color="#9CC0F5" stop-opacity="0"/></linearGradient>` +
      `<filter id="${u}-b"><feGaussianBlur stdDeviation="6"/></filter>` +
      `<filter id="${u}-n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="11"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept=".5"/></feComponentTransfer></filter></defs>` +
      `<rect width="360" height="640" fill="#001C49"/>` +
      `<rect width="360" height="640" fill="url(#${u}-h)"/>` +
      // the floodlight bank, top inline-end, and its beam across the scarf
      `<path d="M30 14L400 470L250 640L6 26Z" fill="url(#${u}-c)" filter="url(#${u}-b)"/>` +
      `<g transform="translate(18 12)"><rect x="-2" y="-2" width="50" height="22" rx="2" fill="#0A1D3F"/>` +
      [0, 1, 2, 3].map((i) => [0, 1].map((j) => `<circle cx="${6 + i * 12}" cy="${5 + j * 10}" r="3.6" fill="#F4F9FF"/><circle cx="${6 + i * 12}" cy="${5 + j * 10}" r="7" fill="#CFE6FF" opacity=".25"/>`).join("")).join("") +
      `</g>` +
      // terrace steps below, in the dark
      [0, 1, 2, 3, 4, 5].map((i) => `<rect x="0" y="${520 + i * 22}" width="360" height="2" fill="#2A4F9A" opacity="${0.18 - i * 0.02}"/>`).join("") +
      `<rect x="0" y="66" width="360" height="5" fill="#A9B2BE" opacity=".5"/><rect x="0" y="66" width="360" height="1.4" fill="#E6EBF0" opacity=".7"/>` +
      `<rect width="360" height="640" filter="url(#${u}-n)" style="mix-blend-mode:overlay" opacity=".35"/>` +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "light", w: "100%" });
    return (
      `<div class="c07-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c07-sh-scarf">${full(p, { ...o, motion: false, thumb: false })}</div>` +
      `<div class="c07-sh-col">` +
      `<div class="c07-sh-logo">${logo}</div>` +
      `<p class="c07-sh-cap">${cap.map((l) => `<span>${esc(l)}</span>`).join("")}</p>` +
      `<div class="c07-sh-who"><b>${esc(MC.nameOf(p, o))}</b><span class="c07-sh-ovr">${MC.ltr(p.ovr)}<small>${esc(S.ovr)}</small></span>` +
      `<span class="c07-sh-meta">${esc(S.tiers[p.tier])}</span><span class="c07-sh-meta">${MC.ltr(p.id)}</span><span class="c07-sh-meta">${MC.ltr(p.season)}</span>` +
      (p.founder ? `<span class="c07-sh-founder">${ar ? `${esc(S.founder)} ${MC.ltr(p.founder)}` : esc(S.founderLine)}</span>` : "") +
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
    philosophy: "Your card is a supporter scarf still on its needle: the 84 is the row being knitted, the body is the season you actually played.",
    philosophyAr: "بطاقتك وشاحُ مشجّعٍ ما زال على إبرته: الرقم 84 هو الصفّ الذي يُحاك الآن، وجسم الوشاح هو الموسم الذي لعبته فعلًا.",
    idea: [
      "The card is not a card. It is a double-face jacquard scarf hanging from its own knitting needle, the object Moroccan supporters buy at the stadium gate and hold up together at kick-off. The needle crosses the top and overhangs both sides, a knob at the inline start and a point at the inline end; nine tassels hang at the bottom; the folded end of a woven care label sticks out of one long edge.",
      "The scarf is read from the needle down. The live rows on the needle hold the 84, knitted big, because it is the only part still changing. Under them, cream bars count the tier. The body is the season: thirty rows, one per gameweek, J.30 at the top and J.01 at the bottom; the gameweeks the manager actually played are knitted in Logo Blue and the rest stay plain yarn, with a cream tally stitch on the selvedge every five rows. The end knitted first holds the figure (the shared manager seen from behind, rasterised onto the stitch grid like the motif on a club scarf) and the name. Below it, the cast-on rows.",
      "Every motif is sampled to a boolean stitch grid in JS (bitmap figures for coarse gauges, Changa for fine ones, the avatar's own paths for the figure) and drawn as merged colour runs under one stitch-texture pattern per gauge: dark gaps and lit legs, an edge curl, fibre grain. Thousands of stitches in a few hundred nodes.",
      "The four ratings live on the woven care label, set the way a label lists fibre content: 91 CAP, 82 SEL, 86 TRF, 78 CON, no % sign. The BotolaGO wordmark sits there as the maker's mark, which is where a scarf carries its brand.",
    ],
    belonging: [
      "No two scarves are alike, because the body is the season you actually played. Miss three gameweeks and there are three plain rows in your blue. That is the strongest 'this is MY card' argument in the slate, and it uses no invented data: rows count participation, never points.",
      "A 15-year-old wants the finer gauge, the satin binding, the twisted fringe and finally the gold. Friends hold their scarves up together: a league is a wall of scarves, which is a picture people already take in every stadium.",
      "It has a season ritual. At the end of 2026/27 the needle comes off, the scarf is cast off with a second fringe and goes in your drawer; next season you cast on a new one. Your collection is your seasons.",
      "Screenshot value comes from the object, not from a number badge: a knitted 84 reads as something made, and the woven 'composition' label is a joke people repeat.",
    ],
    founderMark: [
      "Founders' scarves are cast on in white-gold lurex: the first five rows ever knitted, just above the fringe, with ·26 knitted into them in Night yarn (the supporters' name-plus-year form, without any group vocabulary).",
      "Those rows are never re-knitted. They stay at the chunky first gauge even inside a LEGEND scarf, like a preserved patch, so a 2026 founder carries the same gold rows at the end of every scarf they will ever own.",
      "They catch light: sparkle points and one specular band across the gold only, which drifts when motion is on. The woven label adds FOUNDER 2026 in gold thread for anyone who does not know the code. Later cohorts cast on in plain yarn with their own year in cream; lurex is reserved, by rule, for the founders and for LEGEND.",
      "At 24 to 32px the whole mark survives as one gold line above the fringe ticks.",
    ],
    small: [
      "44–80px: a scarf-end swatch hanging from a needle stub (knob included), with the 84 in whole-pixel 3×5 figures, tier bars under the needle, fringe ticks below and the gold line for founders. From 3px per stitch the knit texture shows; below that it drops to flat yarn fields, scaling the cell and never reflowing.",
      "24–32px: the same silhouette, rod, swatch and fringe, with 2px figures (6×10 each). Fringe ticks alternate cream and Night so the fringe reads on both grounds. The material survives as colour: wood, steel or brass needle; Night garter, Logo Blue jacquard, silver binding, or LEGEND's satin with gold figures.",
      "Rows turn the scarf sideways: needle at the inline start, knitted 84 beside it, name and points on the Night body, gold cast-on and five tassels at the inline end. Five rows in a table read as a wall of scarves.",
    ],
    rtl: [
      "The scarf mirrors, since it is a textile with no logo rule: the needle knob moves to the right (the inline start), the point to the left, the label tab to the left edge and the tally stitches to the right selvedge. The BotolaGO wordmark stays Latin and unmirrored on the label.",
      "علي is knitted in square Kufic, the Arabic grid-lettering tradition, drawn by hand on an 8-row grid (a font sampled at that size turns to mush; it was measured). The Arabic tier name is embroidered in Changa over the knit, because its curves need more than a stitch grid. No letter-spacing on Arabic anywhere.",
      "Knitted figures and every number stay left-to-right (direction=ltr in SVG, bdi in HTML). The label's composition switches to a 2×2 grid so the Arabic labels are never squeezed.",
    ],
    tiers: {
      HOMA: "Hand-knitted chunky garter in two yarns only: ridges instead of Vs, 24 stitches across, uneven tension so every row wanders by a unit and the selvedge is visibly hand-made. A wooden needle, five short tassels, no bars, a printed cotton label.",
      STADE: "Machine jacquard in three yarns at 32 stitches: the blocks turn Logo Blue, the 84 is a condensed 5×7 figure, one bar, seven tassels, a steel needle and a woven satin label.",
      PRO: "Double-face jacquard: the 84 is set in bold two-stitch figures at double height, two bars, nine tassels, steel needle with a collar.",
      CHAMPION: "Fine gauge at 48 stitches: the 84 is sampled from Changa and gains curves, the figure gains detail, silver satin binding runs down both long edges, the fringe is twisted, three bars, silver-thread label border.",
      LEGEND: "The live rows are pulled tight into woven navy satin on a brass needle, with a smooth sleeve where the loops were; the 84 is woven in embossed lurex, three gold bars, gold binding and bullion fringe. The season body, the figure and the cast-on stay hand-knitted, because your history stays hand-made.",
    },
    legend: [
      "LEGEND is the only tier whose silhouette changes at the top: the scalloped loops on the needle become one smooth satin sleeve on a brass rod, and the fringe becomes coiled gold bullion.",
      "The moment, with motion on: starting at the needle, each row pulls tight in turn, the knitted 84 underneath is covered by woven satin and the gold figures resolve. It never loops; with reduced motion the finished satin simply shows.",
      "Underneath the satin the scarf stays knitted: the gameweeks, the figure and the founder's gold rows are still visibly made by hand, so the most desirable object in the set keeps its history.",
    ],
    advantages: [
      "It is the supporter's own object, not the state's, the federation's or a game's: nothing about it reads as FUT, a bank card or an NFT.",
      "The body is real history with honest data (gameweeks played, never invented points), so every scarf is different and gets more personal as the season goes on.",
      "A seasonal ritual is built in (cast off, cast on), and a league becomes a wall of scarves: a natural group image for sharing.",
      "The silhouette (rod, strip, fringe) holds at 24px on both grounds, and the knit gauge gives a tier ladder that is material, not colour.",
      "Arabic is part of the object, not a translation: علي is knitted in square Kufic.",
    ],
    risks: [
      "It sits close to ultras culture. It must never carry slogans, group-like names or banner vocabulary, and moderation would be needed if names became free text.",
      "A tall 1:2.8 object is awkward in a portrait grid and needs scrolling in a detail sheet on a phone.",
      "Knitted type limits name length: long names fall back to the small font or an initial plus surname, as real scarves do, and some users will dislike that.",
      "At 24px the knit becomes a pixel badge: what survives is the silhouette and the gold line, not the textile.",
      "Rows count participation only. If the owner later wants rows to show points, that needs a rule they approve, and it would make bad weeks visible forever.",
      "Three cream bars can recall a sportswear brand's stripes; they stay horizontal and full-width to avoid it.",
      "The composition line (ratings set like fibre content, value first) is a joke that has to survive translation; the Arabic stat labels and عضو مؤسس need MSA review before anything ships.",
      "The figure is honest but crude at the coarse gauges: at HOMA to PRO the manager is a dark head on cream shoulders, and only the fine gauges can afford the jacket's yoke seam.",
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
