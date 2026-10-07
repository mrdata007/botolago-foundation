/* 09 PANNEAU — the fourth official's substitution board.
   The card is the board itself: a 16:9 face in a machined frame on a long centred paddle.
   LED text is not a texture: every string is drawn into a cell grid and each LED is on or off
   (PRO uses a 5x7 board font; CHAMPION's finer matrix samples Changa; Arabic is sampled
   from Alexandria at a taller cell count). Viewbox units are "u" (board width = 320u). */
(function () {
  const MC = window.MC;
  const ID = "c09";
  const f = (v) => +(+v).toFixed(2);
  const esc = MC.esc;

  /* ---------- palette: each LED colour has exactly one meaning ---------- */
  const K = {
    panel: "#05080C",
    unlit: "#0F1A26",
    white: "#F2F7FF", // identity
    cyan: "#73EDFA", // the rating, nothing else
    grey: "#5B6472", // the past (previous gameweek)
    muted: "#A9B2BE", // labels
    amber: "#FFC039", // CAP only
    dim: "#323C4A", // idle pager dots
    engrave: "#3A424C",
    rubber: "#1B2433",
    rib: "#2A3442",
    steel: "#8F99A3",
    knurl: "#5F6873",
    band: "#E6EBF0",
    card: "#C8A878",
    cardEdge: "#8A7457",
    marker: "#1A1A1A",
    plate: "#14181D",
    ti: "#8D96A0",
    glass: "#030406",
  };
  const LED_TIERS = { PRO: 1, CHAMPION: 1 };

  /* The LED sampler draws with these faces on a canvas, so start loading them now:
     the gallery and the preview wait for document.fonts.ready before rendering. */
  const FACES = [
    ["800 40px Changa", "0123456789"],
    ["700 40px Changa", "ALI J.0 –"],
    ["600 40px Changa", "J.0 OVR"],
    ["700 40px Changa", "علي"],
    ["700 40px Alexandria", "علي الجولة"],
    ["400 40px Lalezar", "ALI 84 علي"],
    ["700 40px Manrope", "BOT #0"],
    ["800 40px Manrope", "FOUNDER"],
    ["700 40px Noto Sans Arabic", "عضو مؤسس"],
  ];
  try {
    if (document.fonts && document.fonts.load) FACES.forEach(([fo, t]) => document.fonts.load(fo, t).catch(() => {}));
  } catch (e) {
    /* no font loading API: the sampler falls back to whatever face the canvas has */
  }

  /* ---------- 5x7 board font (PRO) ---------- */
  const G57 = {
    A: ".###.|#...#|#...#|#...#|#####|#...#|#...#",
    B: "####.|#...#|#...#|####.|#...#|#...#|####.",
    C: ".###.|#...#|#....|#....|#....|#...#|.###.",
    D: "###..|#..#.|#...#|#...#|#...#|#..#.|###..",
    E: "#####|#....|#....|####.|#....|#....|#####",
    F: "#####|#....|#....|####.|#....|#....|#....",
    G: ".###.|#...#|#....|#.###|#...#|#...#|.####",
    H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    I: "###|.#.|.#.|.#.|.#.|.#.|###",
    J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
    K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
    L: "#....|#....|#....|#....|#....|#....|#####",
    M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
    N: "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
    O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    P: "####.|#...#|#...#|####.|#....|#....|#....",
    Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
    R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    S: ".####|#....|#....|.###.|....#|....#|####.",
    T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
    W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.",
    X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    Y: "#...#|#...#|#...#|.#.#.|..#..|..#..|..#..",
    Z: "#####|....#|...#.|..#..|.#...|#....|#####",
    0: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    1: "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
    2: ".###.|#...#|....#|...#.|..#..|.#...|#####",
    3: "#####|...#.|..#..|...#.|....#|#...#|.###.",
    4: "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
    5: "#####|#....|####.|....#|....#|#...#|.###.",
    6: "..##.|.#...|#....|####.|#...#|#...#|.###.",
    7: "#####|....#|...#.|..#..|.#...|.#...|.#...",
    8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
    9: ".###.|#...#|#...#|.####|....#|...#.|.##..",
    ".": "..|..|..|..|..|##|##",
    "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.",
    "/": "....#|....#|...#.|..#..|.#...|#....|#....",
    "–": ".....|.....|.....|#####|.....|.....|.....",
    "-": "...|...|...|###|...|...|...",
    "·": "..|..|..|##|##|..|..",
    "@": ".###.|#...#|#.###|#.#.#|#.###|#....|.####",
    a: ".....|.....|.###.|....#|.####|#...#|.####",
    l: "##.|.#.|.#.|.#.|.#.|.#.|###",
    i: ".#.|...|##.|.#.|.#.|.#.|###",
    " ": "...|...|...|...|...|...|...",
  };
  /** A string in the 5x7 font as a cell grid. bold doubles every stroke one cell to the right. */
  function bit(str, bold) {
    const cells = new Set();
    let x = 0;
    for (const ch of String(str)) {
      const g = (G57[ch] || G57[ch.toUpperCase()] || G57[" "]).split("|");
      const w = g[0].length;
      g.forEach((row, r) => {
        for (let c = 0; c < w; c++)
          if (row[c] === "#") {
            cells.add(r * 1000 + x + c);
            if (bold) cells.add(r * 1000 + x + c + 1);
          }
      });
      x += w + (bold ? 1 : 0) + 1;
    }
    return { w: Math.max(0, x - 1), h: 7, base: 7, cells: [...cells].map((k) => [k % 1000, Math.floor(k / 1000)]) };
  }
  /** Scales a grid by an integer (fallback 84 when Changa is not available to the sampler). */
  const grow = (g, k) => {
    const cells = [];
    g.cells.forEach(([c, r]) => {
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cells.push([c * k + i, r * k + j]);
    });
    return { w: g.w * k, h: g.h * k, base: g.base * k, cells };
  };

  /* ---------- the sampler: any string, any face, into LED cells ---------- */
  const SC = 8; // canvas pixels per LED cell
  const memo = new Map();
  let cvs = null;
  let g2 = null;
  function sample(text, weight, family, em, opt = {}) {
    const sx = opt.sx || 1;
    const thr = opt.thr || 0.45;
    const key = [text, weight, family, em, sx, thr, opt.above, opt.below].join("|");
    if (memo.has(key)) return memo.get(key);
    if (!g2) {
      cvs = document.createElement("canvas");
      g2 = cvs.getContext("2d", { willReadFrequently: true });
    }
    const px = em * SC;
    const font = `${weight} ${px}px "${family}"`;
    let ready = true;
    try {
      ready = !document.fonts || document.fonts.check(font, text);
    } catch (e) {
      ready = true;
    }
    g2.font = font;
    const m = g2.measureText(text);
    const L = m.actualBoundingBoxLeft;
    const R = m.actualBoundingBoxRight;
    const above = opt.above != null ? opt.above : Math.max(1, Math.round(m.actualBoundingBoxAscent / SC));
    const below = opt.below != null ? opt.below : Math.max(0, Math.round(m.actualBoundingBoxDescent / SC));
    const inkW = (L + R) * sx;
    const cols = Math.max(1, Math.round(inkW / SC));
    const W = (cols + 2) * SC;
    const H = Math.max(1, above + below) * SC;
    cvs.width = W;
    cvs.height = H;
    g2.font = font;
    g2.fillStyle = "#000";
    g2.setTransform(sx, 0, 0, 1, SC + (cols * SC - inkW) / 2 + L * sx, above * SC);
    g2.fillText(text, 0, 0);
    g2.setTransform(1, 0, 0, 1, 0, 0);
    const d = g2.getImageData(0, 0, W, H).data;
    const cells = [];
    for (let r = 0; r < above + below; r++)
      for (let c = 0; c < cols + 2; c++) {
        let s = 0;
        for (let y = r * SC; y < (r + 1) * SC; y++) for (let x = c * SC; x < (c + 1) * SC; x++) s += d[(y * W + x) * 4 + 3];
        if (s / (SC * SC * 255) >= thr) cells.push([c, r]);
      }
    let lo = Infinity;
    let hi = -1;
    cells.forEach(([c]) => {
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    });
    const out = { w: hi >= lo ? hi - lo + 1 : 0, h: above + below, base: above, cells: cells.map(([c, r]) => [c - lo, r]) };
    if (ready) memo.set(key, out);
    return out;
  }
  const isArabic = (s) => /[؀-ۿ]/.test(s);

  /* ---------- LED faces ---------- */
  const LED = {
    PRO: { P: 2.5, cols: 118, rows: 62, X: 12.5, Y: 12.5, s: 4, e: 113, rowsBig: 29 },
    CHAMPION: { P: 2, cols: 148, rows: 78, X: 12, Y: 12, s: 5, e: 142, rowsBig: 37 },
  };
  const Face = (cols, rows) => ({ cols, rows, map: new Map() });
  function put(F, g, c0, r0, colour) {
    let set = F.map.get(colour);
    if (!set) F.map.set(colour, (set = new Set()));
    for (const [c, r] of g.cells) {
      const C = c0 + c;
      const R = r0 + r;
      if (C >= 0 && R >= 0 && C < F.cols && R < F.rows) set.add(R * F.cols + C);
    }
  }
  /** Lays segments left to right on one baseline. x is the left edge, or the right edge with right=true. */
  function line(F, segs, x, base, right) {
    const W = segs.reduce((s, sg, i) => s + sg.g.w + (i < segs.length - 1 ? (sg.gap != null ? sg.gap : 4) : 0), 0);
    let c = right ? x - W + 1 : x;
    segs.forEach((sg) => {
      put(F, sg.g, c, base - sg.g.base, sg.c);
      c += sg.g.w + (sg.gap != null ? sg.gap : 4);
    });
    return W;
  }
  function block(F, c0, r0, w, h, colour) {
    const cells = [];
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) cells.push([i, j]);
    put(F, { cells }, c0, r0, colour);
  }
  /** Text in the board's medium for a tier: 5x7 (PRO), Changa (CHAMPION), Alexandria (Arabic). */
  function tx(tier, role, text) {
    text = String(text);
    if (isArabic(text)) {
      const em = { PRO: { name: 9, tier: 8, lab: 8 }, CHAMPION: { name: 11, tier: 10, lab: 10 } }[tier][role] || 8;
      return sample(text, "700", "Alexandria", em, { thr: 0.42, above: Math.round(0.9 * em), below: Math.round(0.62 * em) });
    }
    if (tier === "PRO") return bit(text, role === "name");
    const spec = { name: ["700", 17], tier: ["600", 12], lab: ["600", 13], val: ["700", 13] }[role] || ["600", 13];
    return sample(text, spec[0], "Changa", spec[1], { thr: 0.45, above: Math.ceil(0.66 * spec[1]), below: Math.round(0.28 * spec[1]) });
  }
  function bigDigits(tier, ovr) {
    const rows = LED[tier].rowsBig;
    const g = sample(String(ovr), "800", "Changa", rows / 0.645, { sx: 0.86, above: rows, below: 0, thr: 0.5 });
    if (g.w > 6) return g;
    return grow(bit(String(ovr), true), Math.max(1, Math.round(rows / 7)));
  }

  /** The front LED content: identity, previous gameweek, this gameweek and the 84, the stat carousel. */
  function ledFront(p, o, tier) {
    const L = LED[tier];
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const mk = () => Face(L.cols, L.rows);
    const base = mk();
    const nameF = mk();
    const holdF = mk();
    const st = MC.STATS.map(mk);
    const gw = "جولة";
    const champ = tier === "CHAMPION";
    const geo = champ ? (ar ? { A: 18, out: 37, body: 61, D: 73 } : { A: 15, out: 28, body: 57, D: 71 }) : ar ? { A: 12, out: 27, body: 47, D: 57 } : { A: 10, out: 22, body: 44, D: 56 };
    const big = bigDigits(tier, p.ovr);
    const num = (s) => (champ ? tx(tier, "lab", s) : bit(s));
    const nm = tx(tier, "name", MC.nameOf(p, o));
    const tr = tx(tier, "tier", S.tiers[p.tier]);
    const ovr = champ ? tx(tier, "lab", S.ovr) : bit(S.ovr);
    const dash = champ ? tx(tier, "lab", "– –") : bit("– –");
    if (!ar) {
      line(nameF, [{ g: nm, c: K.white }], L.s, geo.A);
      line(base, [{ g: tr, c: K.white }], L.e, geo.A, true);
      line(base, [{ g: champ ? tx(tier, "lab", "J.06") : bit("J.06"), c: K.grey, gap: champ ? 7 : 5 }, { g: dash, c: K.grey }], L.s, geo.out);
      line(base, [{ g: champ ? tx(tier, "val", "J.07") : bit("J.07"), c: K.white }], L.s, geo.body);
      const w = line(base, [{ g: big, c: K.cyan }], L.e, geo.body, true);
      line(base, [{ g: ovr, c: K.muted }], L.e - w - (champ ? 5 : 4), geo.body, true);
    } else {
      const lab = tx(tier, "lab", gw);
      line(nameF, [{ g: nm, c: K.white }], L.e, geo.A, true);
      line(base, [{ g: tr, c: K.white }], L.s, geo.A);
      line(base, [{ g: dash, c: K.grey, gap: champ ? 7 : 5 }, { g: num("06"), c: K.grey }, { g: lab, c: K.grey }], L.e, geo.out, true);
      line(base, [{ g: num("07"), c: K.white }, { g: lab, c: K.white }], L.e, geo.body, true);
      const w = line(base, [{ g: big, c: K.cyan }], L.s, geo.body);
      line(base, [{ g: ovr, c: K.muted }], L.s + w + (champ ? 5 : 4), geo.body);
    }
    /* pager: four clusters, the lit one belongs to the stat that is showing */
    const cl = champ ? 3 : 2;
    const pw = 4 * cl + 3 * cl;
    const pc = Math.round(L.cols / 2 - pw / 2);
    const pr = geo.D - (champ ? 6 : 4);
    for (let i = 0; i < 4; i++) block(base, pc + i * 2 * cl, pr, cl, cl, K.dim);
    MC.STATS.forEach((k, i) => {
      const labG = tx(tier, champ ? "lab" : "lab", S.stats[k]);
      const valG = champ ? tx(tier, "val", p.stats[k]) : bit(String(p.stats[k]));
      const labC = k === "CAP" ? K.amber : K.muted;
      if (!ar) line(st[i], [{ g: labG, c: labC, gap: champ ? 6 : 4 }, { g: valG, c: K.white }], L.s, geo.D);
      else line(st[i], [{ g: valG, c: K.white, gap: champ ? 6 : 4 }, { g: labG, c: labC }], L.e, geo.D, true);
      block(st[i], pc + i * 2 * cl, pr, cl, cl, K.white);
    });
    const hold = ar ? tx(tier, "lab", "تثبيت") : champ ? tx(tier, "lab", "HOLD") : bit("HOLD");
    if (!ar) line(holdF, [{ g: hold, c: K.white }], L.e, geo.D, true);
    else line(holdF, [{ g: hold, c: K.white }], L.s, geo.D);
    return [
      { cls: "c09-l-name", face: nameF },
      { cls: "c09-l-base", face: base },
      ...st.map((F, i) => ({ cls: `c09-st c09-st${i}`, face: F })),
      { cls: "c09-hold", face: holdF },
    ];
  }

  /** The back of the board: a season record, all four stats in a grid, the ID line. */
  function ledBack(p, o, tier) {
    const T = tier === "CHAMPION" ? "CHAMPION" : "PRO";
    const L = LED[T];
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const F = Face(L.cols, L.rows);
    const champ = T === "CHAMPION";
    const g = champ
      ? ar
        ? { rec: 4, st: [26, 42], co: 58, meta: 74 }
        : { rec: 4, st: [30, 46], co: 60, meta: 72 }
      : ar
        ? { rec: 3, st: [20, 34], co: 48, meta: 59 }
        : { rec: 3, st: [22, 34], co: 46, meta: 56 };
    /* season record: 30 gameweeks, the sample's first seven lit */
    const bw = champ ? 2 : 1;
    const bh = champ ? 8 : 6;
    const recW = 30 * bw + 29;
    for (let i = 0; i < 30; i++) {
      const lit = i < 7;
      const c0 = ar ? L.e - recW + 1 + (29 - i) * (bw + 1) : L.s + i * (bw + 1);
      block(F, c0, g.rec, bw, bh, lit ? K.white : K.dim);
    }
    const ex = ar ? tx(T, "lab", "مثال") : champ ? tx(T, "lab", "SAMPLE") : bit("SAMPLE");
    if (!ar) line(F, [{ g: ex, c: K.grey }], L.s + recW + 5, g.rec + bh - 1);
    else line(F, [{ g: ex, c: K.grey }], L.e - recW - 5, g.rec + bh - 1, true);
    /* stats: two columns, two rows */
    const half = Math.floor(L.cols / 2);
    MC.STATS.forEach((k, i) => {
      const em = champ ? 9 : 7;
      const labG = ar ? sample(S.stats[k], "700", "Alexandria", em, { thr: 0.42, above: Math.round(0.9 * em), below: Math.round(0.62 * em) }) : tx(T, "lab", S.stats[k]);
      const valG = champ ? tx(T, "val", p.stats[k]) : bit(String(p.stats[k]), !ar);
      const c = k === "CAP" ? K.amber : K.muted;
      const base = g.st[i >> 1];
      const colA = i % 2 === 0;
      if (!ar) {
        const x0 = colA ? L.s : half + 2;
        const x1 = colA ? half - 8 : L.e;
        line(F, [{ g: labG, c }], x0, base);
        line(F, [{ g: valG, c: K.white }], x1, base, true);
      } else {
        /* value and label travel together, so each number sits beside its own label */
        line(F, [{ g: valG, c: K.white, gap: champ ? 5 : 4 }, { g: labG, c }], colA ? L.e : half - 6, base, true);
      }
    });
    const idG = champ ? tx(T, "lab", p.id) : bit(p.id);
    const seG = champ ? tx(T, "lab", p.season) : bit(p.season);
    const coG = isArabic(S.country) || champ ? tx(T, "lab", S.country) : bit(S.country);
    if (!ar) line(F, [{ g: coG, c: K.muted }], L.s, g.co);
    else line(F, [{ g: coG, c: K.muted }], L.e, g.co, true);
    line(F, [{ g: idG, c: K.grey }], L.s, g.meta);
    line(F, [{ g: seG, c: K.grey }], L.e, g.meta, true);
    return [{ cls: "c09-l-base", face: F }];
  }

  /** Cells to one SVG path of squares (horizontal runs merged). */
  function cellsPath(F, set, X, Y, P) {
    const rows = new Map();
    for (const i of set) {
      const r = Math.floor(i / F.cols);
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push(i % F.cols);
    }
    let d = "";
    rows.forEach((cs, r) => {
      cs.sort((a, b) => a - b);
      let s = cs[0];
      let prev = cs[0];
      for (let k = 1; k <= cs.length; k++) {
        const c = cs[k];
        if (c === prev + 1) {
          prev = c;
          continue;
        }
        const w = (prev - s + 1) * P;
        d += `M${f(X + s * P)} ${f(Y + r * P)}h${f(w)}v${P}h${f(-w)}z`;
        s = prev = c;
      }
    });
    return d;
  }
  /** Renders LED layers: unlit field, bloom, lit dots (and a solid-cell fallback for small sizes). */
  function ledRender(u, tier, layers, region = "0 0 320 190") {
    const L = LED[tier];
    const [rx, ry, rw, rh] = region.split(" ");
    const { P, X, Y } = L;
    const W = f(L.cols * P);
    const H = f(L.rows * P);
    const colours = [];
    layers.forEach((l) => l.face.map.forEach((set, c) => set.size && !colours.includes(c) && colours.push(c)));
    let defs =
      `<pattern id="${u}-ul" width="${P}" height="${P}" patternUnits="userSpaceOnUse" x="${X}" y="${Y}"><circle cx="${P / 2}" cy="${P / 2}" r="${f(P * 0.34)}" fill="${K.unlit}"/></pattern>` +
      `<filter id="${u}-b1" filterUnits="userSpaceOnUse" x="${rx}" y="${ry}" width="${rw}" height="${rh}"><feGaussianBlur stdDeviation="${f(P * 0.7)}"/></filter>` +
      `<filter id="${u}-b2" filterUnits="userSpaceOnUse" x="${rx}" y="${ry}" width="${rw}" height="${rh}"><feGaussianBlur stdDeviation="3"/></filter>`;
    colours.forEach((c, i) => {
      defs +=
        `<radialGradient id="${u}-g${i}"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".28" stop-color="${c}"/><stop offset=".75" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".35"/></radialGradient>` +
        `<pattern id="${u}-d${i}" width="${P}" height="${P}" patternUnits="userSpaceOnUse" x="${X}" y="${Y}"><circle cx="${P / 2}" cy="${P / 2}" r="${f(P * 0.43)}" fill="url(#${u}-g${i})"/></pattern>`;
    });
    let html = `<rect class="c09-unlit" x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#${u}-ul)"/>`;
    layers.forEach((l, li) => {
      let bloom = "";
      let lit = "";
      l.face.map.forEach((set, c) => {
        if (!set.size) return;
        const i = colours.indexOf(c);
        const d = cellsPath(l.face, set, X, Y, P);
        const mid = `${u}-m${li}x${i}`;
        defs += `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${X}" y="${Y}" width="${W}" height="${H}"><path d="${d}" fill="#fff"/></mask>`;
        const hero = c === K.cyan && li === 1;
        bloom += `<path class="c09-bloom" d="${d}" fill="${c}" opacity="${hero ? 0.5 : c === K.dim ? 0 : 0.2}" filter="url(#${u}-${hero ? "b2" : "b1"})"/>`;
        lit += `<rect class="c09-dots" x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#${u}-d${i})" mask="url(#${mid})"/><path class="c09-solid" d="${d}" fill="${c}" shape-rendering="crispEdges"/>`;
      });
      html += `<g class="${l.cls}">${bloom}${lit}</g>`;
    });
    return { defs, html };
  }

  /* ---------- shared drawing ---------- */
  const lg = (id, stops, attrs = 'x1="0" y1="0" x2="0" y2="1"') =>
    `<linearGradient id="${id}" ${attrs}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`).join("")}</linearGradient>`;
  const CYL = [
    [0, "#000", 0.6],
    [0.22, "#fff", 0.1],
    [0.38, "#fff", 0.3],
    [0.5, "#fff", 0.08],
    [0.75, "#000", 0.12],
    [1, "#000", 0.65],
  ];
  /** Text with an engraved look: a light lip under a dark cut. */
  function engrave(x, y, txt, o, opt = {}) {
    const ar = isArabic(txt);
    const fam = ar ? "Noto Sans Arabic" : "Manrope";
    const ls = !ar && opt.ls ? ` letter-spacing="${opt.ls}"` : "";
    const a = ` text-anchor="${opt.anchor || "start"}"`;
    const d = ar ? ' direction="rtl"' : "";
    const fs = opt.size || 6.5;
    const w = opt.w || 700;
    const ink = opt.ink || K.engrave;
    const lip = opt.lip == null ? 0.6 : opt.lip;
    const lipC = opt.lipC || "#fff";
    return (
      `<text x="${x}" y="${f(y + 0.45)}" font-family="${fam}" font-weight="${w}" font-size="${fs}"${a}${ls}${d} fill="${lipC}" fill-opacity="${lip}">${esc(txt)}</text>` +
      `<text x="${x}" y="${y}" font-family="${fam}" font-weight="${w}" font-size="${fs}"${a}${ls}${d} fill="${ink}">${esc(txt)}</text>`
    );
  }
  function wordmark(x, y, h, colour, lip) {
    const w = f(h * MC.LOGO_RATIO.wordmark);
    const lipW = lip
      ? `<g transform="translate(${x} ${f(y + 0.45)})" opacity="${lip}">${MC.logo("wordmark", { variant: "mono", color: "#fff", w, h, label: false })}</g>`
      : "";
    return lipW + `<g transform="translate(${x} ${y})">${MC.logo("wordmark", { variant: "mono", color: colour, w, h, label: false })}</g>`;
  }
  /** Deterministic pseudo-random sequence. */
  const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---------- handles and collars ---------- */
  function handle(u, tier, thumb) {
    const cyl = `url(#${u}-cyl)`;
    if (tier === "HOMA") {
      const d = "M152 168V296.6Q160 298.4 168 296.6V168Z";
      return (
        `<path d="${d}" fill="url(#${u}-wood)"/>` +
        (thumb ? "" : `<path d="${d}" fill="#000" filter="url(#${u}-grain)" opacity=".5" style="mix-blend-mode:multiply"/>`) +
        `<path d="${d}" fill="${cyl}" opacity=".7"/>` +
        `<path class="c09-rim" d="M152 176V296.6Q160 298.4 168 296.6V176" fill="none" stroke-width=".8"/>`
      );
    }
    if (tier === "STADE") {
      const d = "M148 182V280a12 12 0 0 0 24 0V182Z";
      return (
        `<path d="${d}" fill="#15191F"/>` +
        `<path d="${d}" fill="url(#${u}-tape)"/>` +
        `<rect x="148" y="182" width="24" height="12" fill="url(#${u}-alu)"/>` +
        `<rect x="147" y="268" width="26" height="5" rx="1" fill="#22272E"/>` +
        `<path d="${d}" fill="${cyl}"/>` +
        `<path class="c09-rim" d="${d}" fill="none" stroke-width=".8"/>`
      );
    }
    if (tier === "CHAMPION") {
      const d = "M146 186V278a14 14 0 0 0 28 0V186Z";
      return (
        `<path d="${d}" fill="url(#${u}-kn)"/>` +
        `<path d="M146 262H174V278a14 14 0 0 1 -28 0Z" fill="url(#${u}-pol)"/>` +
        `<path d="M146 262H174" stroke="#3A424C" stroke-width=".6"/>` +
        `<path d="${d}" fill="${cyl}"/>` +
        `<path class="c09-rim" d="${d}" fill="none" stroke-width=".8"/>`
      );
    }
    if (tier === "LEGEND") {
      const up = "M146 186V246H174V186Z";
      const lo = "M149 251V310a11 11 0 0 0 22 0V251Z";
      return (
        `<path d="${lo}" fill="url(#${u}-tiH)"/>` +
        (thumb ? "" : `<path d="${lo}" fill="#000" filter="url(#${u}-bead)" opacity=".35" style="mix-blend-mode:overlay"/>`) +
        `<path d="${lo}" fill="${cyl}"/>` +
        `<path d="${up}" fill="url(#${u}-tiH)"/>` +
        (thumb ? "" : `<path d="${up}" fill="#000" filter="url(#${u}-bead)" opacity=".35" style="mix-blend-mode:overlay"/>`) +
        `<path d="${up}" fill="${cyl}"/>` +
        `<rect x="144" y="245" width="32" height="7" rx="1.2" fill="url(#${u}-pol)"/>` +
        `<rect x="144" y="245" width="32" height="7" rx="1.2" fill="${cyl}"/>` +
        `<path d="M152.5 190V244" stroke="${K.cyan}" stroke-width="2.2" opacity=".32" filter="url(#${u}-soft)"/>` +
        `<path class="c09-rim" d="${up}M144 245h32v7h-32zM${lo.slice(1)}" fill="none" stroke-width=".7"/>`
      );
    }
    const d = "M146 186V278a14 14 0 0 0 28 0V186Z";
    return (
      `<path d="${d}" fill="${K.rubber}"/>` +
      `<path d="${d}" fill="url(#${u}-rib)"/>` +
      `<path d="${d}" fill="${cyl}"/>` +
      `<path class="c09-rim" d="${d}" fill="none" stroke-width=".9"/>`
    );
  }
  function collar(u, p, o, tier, thumb) {
    if (!p.founder) {
      if (tier === "HOMA") return "";
      if (tier === "STADE") return "";
      if (tier === "LEGEND")
        return `<rect x="144" y="180" width="32" height="8" fill="url(#${u}-tiH)"/><rect x="144" y="180" width="32" height="8" fill="url(#${u}-cyl)"/>`;
      return `<rect x="144" y="180" width="32" height="10" rx="1.5" fill="#232C3A"/><rect x="144" y="180" width="32" height="10" rx="1.5" fill="url(#${u}-cyl)"/><path d="M144 186H176" stroke="#2F3A4A" stroke-width=".8"/>`;
    }
    const y0 = tier === "HOMA" ? 182 : 180;
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const front = S.founderLine;
    const fam = ar ? "Noto Sans Arabic" : "Manrope";
    const ls = ar ? "" : ' letter-spacing=".2"';
    const dir = ar ? ' direction="rtl"' : "";
    const wrapA = ar ? "BOT #004821 ·" : "· " + MC.STR.ar.founder + " ·";
    const wrapB = ar ? "· FOUNDER 2026" : p.id + " ·";
    const band = thumb
      ? ""
      : `<g clip-path="url(#${u}-cc)">` +
        `<text x="160" y="${y0 + 10.5}" font-family="${fam}" font-weight="800" font-size="${ar ? 3.9 : 3.5}" text-anchor="middle"${ls}${dir} fill="${K.engrave}">${esc(front)}</text>` +
        `<text x="${ar ? 143.4 : 142.6}" y="${y0 + 10.5}" font-family="Manrope" font-weight="800" font-size="3.3" text-anchor="end" fill="${K.engrave}" opacity=".8">${esc(wrapB)}</text>` +
        `<text x="177.4" y="${y0 + 10.5}" font-family="${ar ? "Manrope" : "Noto Sans Arabic"}" font-weight="800" font-size="3.3" text-anchor="start" fill="${K.engrave}" opacity=".8">${esc(wrapA)}</text>` +
        `</g>`;
    let clamp = "";
    if (tier === "HOMA") {
      clamp =
        `<rect x="140.5" y="${y0 + 13}" width="39" height="4.6" fill="#B9C1CA"/>` +
        `<rect x="140.5" y="${y0 + 13}" width="39" height="4.6" fill="url(#${u}-slot)"/>` +
        `<rect x="140.5" y="${y0 + 13}" width="39" height="4.6" fill="url(#${u}-cyl)"/>` +
        `<rect x="176.5" y="${y0 + 11.2}" width="9" height="8.2" rx="1" fill="#A3ABB4" stroke="#5F6873" stroke-width=".5"/>` +
        `<circle cx="181" cy="${y0 + 15.3}" r="2.6" fill="#C9D0D7" stroke="#5F6873" stroke-width=".5"/><path d="M179.4 ${y0 + 15.3}h3.2" stroke="#3A424C" stroke-width=".7"/>`;
    }
    return (
      `<g class="c09-collar">` +
      `<clipPath id="${u}-cc"><rect x="142" y="${y0}" width="36" height="18"/></clipPath>` +
      `<rect x="142" y="${y0}" width="36" height="18" fill="url(#${u}-kn)"/>` +
      `<rect x="142" y="${y0 + 6}" width="36" height="6.2" fill="url(#${u}-band)"/>` +
      band +
      `<rect x="142" y="${y0}" width="36" height="18" fill="url(#${u}-cyl)"/>` +
      `<path d="M142 ${y0 + 6}H178M142 ${y0 + 12.2}H178" stroke="#2E353D" stroke-width=".45"/>` +
      `<rect class="c09-rim" x="142" y="${y0}" width="36" height="18" fill="none" stroke-width=".7"/>` +
      `</g>` +
      clamp
    );
  }

  /* ---------- per-render defs ---------- */
  function defs(u, tier, thumb) {
    let d =
      lg(`${u}-cyl`, CYL, 'x1="0" y1="0" x2="1" y2="0"') +
      `<pattern id="${u}-kn" width="2.2" height="2.2" patternUnits="userSpaceOnUse"><rect width="2.2" height="2.2" fill="${K.steel}"/><path d="M0 0L2.2 2.2M2.2 0L0 2.2" stroke="${K.knurl}" stroke-width=".5"/></pattern>` +
      lg(`${u}-band`, [
        [0, "#FFFFFF"],
        [0.45, K.band],
        [1, "#AEB6BF"],
      ]) +
      lg(`${u}-pol`, [
        [0, "#F4F6F8"],
        [0.5, "#B7BFC8"],
        [1, "#7E8791"],
      ]) +
      `<filter id="${u}-soft" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="1.4"/></filter>`;
    if (tier === "PRO")
      d += `<pattern id="${u}-rib" width="28" height="6" patternUnits="userSpaceOnUse" x="146" y="188"><rect width="28" height="1.4" fill="${K.rib}"/><rect y="1.4" width="28" height=".6" fill="#000" opacity=".4"/></pattern>`;
    if (tier === "STADE")
      d +=
        `<pattern id="${u}-tape" width="24" height="7" patternUnits="userSpaceOnUse" x="148" y="190" patternTransform="skewY(-14)"><rect width="24" height="1.1" fill="#2E353E"/><rect y="1.1" width="24" height=".5" fill="#000" opacity=".5"/></pattern>` +
        lg(
          `${u}-alu`,
          [
            [0, "#8D959F"],
            [0.35, "#E6EAEE"],
            [0.6, "#C3CAD2"],
            [1, "#7C848E"],
          ],
          'x1="0" y1="0" x2="1" y2="0"',
        );
    if (tier === "HOMA")
      d +=
        lg(
          `${u}-wood`,
          [
            [0, "#6B4221"],
            [0.3, "#B98451"],
            [0.42, "#D9A873"],
            [0.7, "#9A6738"],
            [1, "#5B381B"],
          ],
          'x1="0" y1="0" x2="1" y2="0"',
        ) +
        `<pattern id="${u}-slot" width="2.4" height="4.6" patternUnits="userSpaceOnUse" x="141" y="0"><rect x=".6" y="1.4" width="1.1" height="1.8" fill="#5F6873"/></pattern>` +
        `<filter id="${u}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9 .025" numOctaves="3" seed="5"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.35"/></filter>`;
    if (tier === "LEGEND")
      d += lg(
        `${u}-tiH`,
        [
          [0, "#7B848E"],
          [0.3, "#A9B1BA"],
          [0.5, "#8D96A0"],
          [1, "#6E7782"],
        ],
        'x1="0" y1="0" x2="1" y2="0"',
      );
    if (!thumb) {
      d +=
        `<filter id="${u}-brush" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".004 .55" numOctaves="3" seed="7"/><feColorMatrix values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/></filter>` +
        `<filter id="${u}-bead" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="3"/><feColorMatrix values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/></filter>`;
    }
    return d;
  }

  /* ---------- the frame (PRO, CHAMPION, LEGEND) ---------- */
  function frame(u, tier, thumb) {
    const L = tier === "LEGEND";
    const C = tier === "CHAMPION";
    const B = L ? 10 : 12;
    const ch = L ? 1.6 : 2.4;
    /* stops are placed against the 180u height so the bezel bands (0–12, 168–180) carry the finish */
    const fr = C
      ? [
          [0, "#E9EDF1"],
          [0.009, "#FAFBFC"],
          [0.016, "#5A636E"],
          [0.045, "#2A3139"],
          [0.5, "#353D46"],
          [0.95, "#232930"],
          [0.984, "#46505B"],
          [0.992, "#D6DCE2"],
          [1, "#7A838E"],
        ]
      : L
        ? [
            [0, "#9CA5AF"],
            [0.012, "#7E8791"],
            [0.06, "#6F7882"],
            [0.94, "#58616B"],
            [1, "#4A535D"],
          ]
        : [
            [0, "#C3CAD2"],
            [0.03, "#E6EAEE"],
            [0.07, "#B9C1CA"],
            [0.93, "#A3ACB6"],
            [1, "#8D959F"],
          ];
    const cham = C ? ["#14181D", "#FFFFFF", "#3C444E", "#E1E6EB"] : L ? ["#363E47", "#A9B1BA", "#4E5761", "#8A939D"] : ["#5F6873", "#F2F5F8", "#8D959F", "#C3CAD2"];
    let s = lg(`${u}-fr`, fr) + `<rect width="320" height="180" fill="url(#${u}-fr)"/>`;
    if (!thumb) {
      if (L) s += `<rect width="320" height="180" fill="#000" filter="url(#${u}-bead)" opacity=".42" style="mix-blend-mode:overlay"/>`;
      else if (C)
        s +=
          `<rect width="320" height="180" fill="#000" filter="url(#${u}-brush)" opacity=".16" style="mix-blend-mode:overlay"/>` +
          `<path d="M226 0H250L190 180H166Z" fill="#fff" opacity=".13"/><path d="M256 0H262L202 180H196Z" fill="#fff" opacity=".18"/>`;
      else
        s +=
          `<rect width="320" height="180" fill="#000" filter="url(#${u}-brush)" opacity=".55" style="mix-blend-mode:overlay"/>` +
          `<pattern id="${u}-ms" width="4" height="1.6" patternUnits="userSpaceOnUse"><rect width="4" height=".7" fill="#fff" opacity=".07"/></pattern><rect width="320" height="180" fill="url(#${u}-ms)"/>`;
    }
    const a = B - ch;
    const b = 320 - B + ch;
    const c = 180 - B + ch;
    s +=
      `<path d="M${a} ${a}H${b}L${320 - B} ${B}H${B}Z" fill="${cham[0]}"/>` +
      `<path d="M${a} ${c}H${b}L${320 - B} ${180 - B}H${B}Z" fill="${cham[1]}"/>` +
      `<path d="M${a} ${a}L${B} ${B}V${180 - B}L${a} ${c}Z" fill="${cham[2]}"/>` +
      `<path d="M${b} ${a}L${320 - B} ${B}V${180 - B}L${b} ${c}Z" fill="${cham[3]}"/>` +
      `<path d="M.6 .6H319.4" stroke="#fff" stroke-opacity=".75" stroke-width="1"/>` +
      `<path d="M.6 179.4H319.4" stroke="#000" stroke-opacity=".35" stroke-width="1"/>` +
      `<rect class="c09-edge" x=".4" y=".4" width="319.2" height="179.2" fill="none" stroke-width=".8"/>` +
      (C || L ? `<rect x="1.3" y="1.3" width="317.4" height="177.4" fill="none" stroke="#DDE2E7" stroke-opacity="${C ? 0.85 : 0.5}" stroke-width="${C ? 1.1 : 0.7}"/>` : "");
    if (C)
      s +=
        `<path d="M3 180H317L315 185H5Z" fill="#3E4650"/><path d="M3 180H317L316 182.4H4Z" fill="#8F99A3"/><path d="M4 182.6H316" stroke="#C3CAD2" stroke-width=".35"/>` +
        `<path class="c09-edge" d="M3 180H317L315 185H5Z" fill="none" stroke-width=".6"/>`;
    return s;
  }

  /** Bezel engravings: country and season on top, the wordmark and ID at the bottom. */
  function bezelText(p, o, tier, thumb) {
    if (thumb) return "";
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const L = tier === "LEGEND";
    const B = L ? 10 : 12;
    const C = tier === "CHAMPION";
    const ink = L ? "#2E353D" : C ? "#B7BFC8" : K.engrave;
    const lip = C ? 0.6 : 0.5;
    const lipC = C ? "#000" : "#fff";
    const yb = 180 - B + (B - 2.4) / 2 + 2.6;
    const wmH = L ? 5.2 : 6.6;
    const wmW = wmH * MC.LOGO_RATIO.wordmark;
    const topY = L ? 7.2 : 8.4;
    const sz = L ? 5 : 5.6;
    let s = "";
    const e = { ink, lip, lipC };
    if (!ar) {
      s += engrave(18, topY, S.country, o, { size: sz, ls: ".9", ...e });
      s += engrave(302, topY, p.season, o, { size: sz, ls: ".6", anchor: "end", ...e });
      s += wordmark(18, f(yb - wmH + 0.4), wmH, ink, C ? 0 : lip);
      s += engrave(302, f(yb), p.id, o, { size: sz + 0.4, ls: ".3", anchor: "end", ...e });
    } else {
      s += engrave(302, topY + 0.4, S.country, o, { size: sz + 0.6, anchor: "start", ...e });
      s += engrave(18, topY, p.season, o, { size: sz, ls: ".6", ...e });
      s += wordmark(f(302 - wmW), f(yb - wmH + 0.4), wmH, ink, C ? 0 : lip);
      s += engrave(18, f(yb), p.id, o, { size: sz + 0.4, ls: ".3", ...e });
    }
    if (L) s += engrave(160, f(yb), S.tiers.LEGEND, o, { size: sz, ls: "1.6", anchor: "middle", ...e });
    return s;
  }

  /** The reflection: the person holding the board, seen in the black glass. */
  function reflection(u, o, tier, strength) {
    const ar = MC.isAr(o);
    const x = ar ? 196 : 24;
    const B = tier === "LEGEND" ? 10 : 12;
    const fig = MC.avatar({ x, y: 40, w: 100, h: 180 - B - 40, torso: "#fff", seam: "#05080C", collar: "#E4E9EF", neck: "#C9D0D8", skin: "#E4E9EF", hair: "#fff" });
    let s =
      lg(`${u}-rfg`, [
        [0, "#fff"],
        [0.55, "#fff", 0.55],
        [1, "#fff", 0],
      ]) +
      `<mask id="${u}-rfm" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="180"><rect x="${B}" y="40" width="${320 - 2 * B}" height="${140 - B}" fill="url(#${u}-rfg)"/></mask>` +
      `<filter id="${u}-rfb" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".6"/></filter>` +
      `<g class="c09-refl" mask="url(#${u}-rfm)" opacity="${strength}" filter="url(#${u}-rfb)">${fig}</g>`;
    if (tier === "LEGEND") {
      const rim = MC.avatar({ x, y: 40, w: 100, h: 130, torso: false, seam: false, collar: false, neck: false, skin: false, hair: false, rim: K.cyan });
      s +=
        lg(
          `${u}-rimg`,
          [
            [0, "#fff", ar ? 0.9 : 0],
            [0.5, "#fff", 0.15],
            [1, "#fff", ar ? 0 : 0.9],
          ],
          'x1="0" y1="0" x2="1" y2="0"',
        ) +
        `<mask id="${u}-rimm" maskUnits="userSpaceOnUse" x="${x}" y="40" width="100" height="130"><rect x="${x}" y="40" width="100" height="130" fill="url(#${u}-rimg)"/></mask>` +
        `<g mask="url(#${u}-rimm)" opacity=".42"><g mask="url(#${u}-rfm)">${rim}</g></g>`;
    }
    return s;
  }

  /** Glass on top of the face: one 4% diagonal band and a soft top sheen. */
  function glass(u, B) {
    return (
      lg(`${u}-sh`, [
        [0, "#fff", 0.07],
        [1, "#fff", 0],
      ]) +
      `<rect x="${B}" y="${B}" width="${320 - 2 * B}" height="34" fill="url(#${u}-sh)"/>` +
      `<path d="M${B + 150} ${B}H${B + 205}L${B + 95} ${180 - B}H${B + 40}Z" fill="#fff" opacity=".04"/>` +
      `<path d="M${B} ${B + 0.4}H${320 - B}" stroke="#fff" stroke-opacity=".1" stroke-width=".6"/>`
    );
  }

  /* ---------- tier bodies ---------- */
  function ledBoard(p, o, u, tier, side, thumb, opt) {
    const B = 12;
    const layers = side === "back" ? ledBack(p, o, tier) : ledFront(p, o, tier);
    const led = ledRender(u, tier, layers);
    const face =
      lg(`${u}-face`, [
        [0, "#080C12"],
        [1, "#030508"],
      ]) + `<rect x="${B}" y="${B}" width="${320 - 2 * B}" height="${180 - 2 * B}" fill="url(#${u}-face)"/>`;
    const refl = side === "back" || thumb ? "" : reflection(u, o, tier, opt.share ? 0.17 : 0.13);
    return (
      frame(u, tier, thumb) +
      face +
      `<defs>${led.defs}<clipPath id="${u}-fc"><rect x="${B}" y="${B}" width="${320 - 2 * B}" height="${180 - 2 * B}"/></clipPath></defs>` +
      refl +
      `<g class="c09-led" clip-path="url(#${u}-fc)">${led.html}</g>` +
      glass(u, B) +
      bezelText(p, o, tier, thumb)
    );
  }

  function legendBoard(p, o, u, side, thumb, opt) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const B = 10;
    const fw = 320 - 2 * B;
    let s = frame(u, "LEGEND", thumb);
    s +=
      lg(`${u}-face`, [
        [0, "#07090C"],
        [0.5, K.glass],
        [1, "#010203"],
      ]) +
      `<rect x="${B}" y="${B}" width="${fw}" height="${180 - 2 * B}" fill="url(#${u}-face)"/>` +
      /* light spilling onto the frame's inner edge, strongest beside the 84 */
      lg(
        `${u}-spill`,
        [
          [0, K.cyan, ar ? 0.34 : 0],
          [0.45, K.cyan, 0.06],
          [1, K.cyan, ar ? 0 : 0.34],
        ],
        'x1="0" y1="0" x2="1" y2="0"',
      ) +
      `<rect x="${B - 1.6}" y="${B - 1.6}" width="${fw + 3.2}" height="${180 - 2 * B + 3.2}" fill="none" stroke="url(#${u}-spill)" stroke-width="3.2"/>`;
    if (side === "back") {
      const lines = MC.STATS.map((k, i) => {
        const y = 52 + i * 26;
        const lab = S.stats[k];
        const c = k === "CAP" ? K.amber : K.muted;
        return ar
          ? `<text x="292" y="${y}" font-family="Changa" font-weight="700" font-size="17" direction="rtl" fill="${c}">${esc(lab)}</text><text x="150" y="${y}" font-family="Changa" font-weight="700" font-size="19" text-anchor="end" fill="${K.white}">${p.stats[k]}</text>`
          : `<text x="28" y="${y}" font-family="Changa" font-weight="600" font-size="17" letter-spacing="1.2" fill="${c}">${esc(lab)}</text><text x="118" y="${y}" font-family="Changa" font-weight="700" font-size="19" fill="${K.white}">${p.stats[k]}</text>`;
      }).join("");
      s += `<g filter="url(#${u}-lg1)">${lines}</g>`;
      s += `<filter id="${u}-lg1" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
      s += `<text x="${ar ? 28 : 292}" y="150" font-family="Manrope" font-weight="700" font-size="9" text-anchor="${ar ? "start" : "end"}" fill="${K.muted}">${esc(p.id)}</text>`;
      return s + glass(u, B) + bezelText(p, o, "LEGEND", thumb);
    }
    if (!thumb) s += reflection(u, o, "LEGEND", opt.share ? 0.2 : 0.16);
    const nameX = ar ? 290 : 30;
    const nm = MC.nameOf(p, o);
    const fam = "Changa";
    s +=
      `<filter id="${u}-g1" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="180"><feGaussianBlur stdDeviation="9"/></filter>` +
      `<filter id="${u}-g2" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="180"><feGaussianBlur stdDeviation="2.6"/></filter>` +
      `<filter id="${u}-g3" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="180"><feGaussianBlur stdDeviation="1.1"/></filter>` +
      lg(`${u}-core`, [
        [0, "#F2FEFF"],
        [0.55, "#C4F8FE"],
        [1, "#8CEFFA"],
      ]);
    const nameAttrs = ar
      ? `x="${nameX}" y="52" font-family="${fam}" font-weight="700" font-size="30" direction="rtl"`
      : `x="${nameX}" y="47" font-family="${fam}" font-weight="700" font-size="30" letter-spacing="1.5"`;
    const tierAttrs = ar
      ? `x="30" y="50" font-family="${fam}" font-weight="600" font-size="15"`
      : `x="290" y="45" font-family="${fam}" font-weight="600" font-size="12" letter-spacing="3" text-anchor="end"`;
    const digX = ar ? 26 : 294;
    const digA = ar ? "start" : "end";
    const dig = `x="${digX}" y="158" font-family="${fam}" font-weight="800" font-size="126" text-anchor="${digA}"`;
    s +=
      `<g class="c09-lg-name">` +
      `<text ${nameAttrs} fill="${K.white}" opacity=".5" filter="url(#${u}-g3)">${esc(nm)}</text>` +
      `<text ${nameAttrs} fill="${K.white}">${esc(nm)}</text>` +
      `<text ${tierAttrs} fill="${K.white}" opacity=".62">${esc(S.tiers.LEGEND)}</text>` +
      `</g>` +
      `<g class="c09-lg-84">` +
      `<text ${dig} fill="${K.cyan}" opacity=".55" filter="url(#${u}-g1)">${p.ovr}</text>` +
      `<text ${dig} fill="${K.cyan}" opacity=".9" filter="url(#${u}-g2)">${p.ovr}</text>` +
      `<text ${dig} fill="url(#${u}-core)" stroke="${K.cyan}" stroke-width=".8" stroke-opacity=".7">${p.ovr}</text>` +
      `</g>`;
    s += glass(u, B);
    /* the dead front: a faint polished edge on the glass */
    s += `<rect x="${B + 0.5}" y="${B + 0.5}" width="${fw - 1}" height="${180 - 2 * B - 1}" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width=".8"/>`;
    return s + bezelText(p, o, "LEGEND", thumb);
  }

  function stadeBoard(p, o, u, side, thumb) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    let s =
      lg(`${u}-sheet`, [
        [0, "#D8DEE4"],
        [0.5, "#C3CAD2"],
        [1, "#AEB6BF"],
      ]) +
      `<rect x=".5" y=".5" width="319" height="179" rx="3.5" fill="url(#${u}-sheet)"/>` +
      (thumb ? "" : `<rect x=".5" y=".5" width="319" height="179" rx="3.5" fill="#000" filter="url(#${u}-brush)" opacity=".5" style="mix-blend-mode:overlay"/>`) +
      `<rect x="2.4" y="2.4" width="315.2" height="175.2" rx="2.4" fill="none" stroke="#F4F6F8" stroke-opacity=".8" stroke-width="1.2"/>` +
      `<rect x="4" y="4" width="312" height="172" rx="2" fill="none" stroke="#7C848E" stroke-opacity=".5" stroke-width=".6"/>` +
      `<rect class="c09-edge" x=".5" y=".5" width="319" height="179" rx="3.5" fill="none" stroke-width=".9"/>`;
    const rivet = (x, y) =>
      `<circle cx="${x}" cy="${y}" r="2.7" fill="#8D959F"/><circle cx="${x - 0.4}" cy="${y - 0.4}" r="2" fill="url(#${u}-pol)"/><circle cx="${x}" cy="${y}" r="2.7" fill="none" stroke="#5F6873" stroke-width=".5"/>`;
    s += rivet(10, 10) + rivet(310, 10) + rivet(10, 170) + rivet(310, 170);
    const paint = (x, y, t, size, w, fill, anchor = "start", extra = "") => {
      const a = isArabic(t);
      return `<text x="${x}" y="${y}" font-family="Changa" font-weight="${w}" font-size="${size}" text-anchor="${anchor}" fill="${fill}"${a ? ' direction="rtl"' : extra}>${esc(t)}</text>`;
    };
    const plate = (x, y, w, h) =>
      `<rect x="${x + 0.8}" y="${y + 1.4}" width="${w}" height="${h}" rx="1.6" fill="#000" opacity=".28"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="${K.plate}"/>` +
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="1.2" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".7"/>`;
    if (side === "back") {
      s += plate(30, 26, 260, 128);
      MC.STATS.forEach((k, i) => {
        const y = 56 + i * 28;
        const lab = S.stats[k];
        const c = k === "CAP" ? K.amber : "#E8EDF2";
        s += ar
          ? paint(270, y, lab, 18, 700, c) + paint(64, y, String(p.stats[k]), 22, 800, "#F4F6F8", "start")
          : paint(50, y, lab, 18, 700, c, "start", ' letter-spacing="1.5"') + paint(270, y, String(p.stats[k]), 22, 800, "#F4F6F8", "end");
      });
      return s;
    }
    /* the shared figure as a large line engraving in the sheet, cropped by its foot */
    const vx = ar ? 150 : 58;
    s +=
      `<pattern id="${u}-hatch" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="2.2" height=".8" fill="#5F6873"/></pattern>` +
      `<g opacity=".5">${MC.avatar({ x: vx, y: 40, w: 112, h: 136, torso: `url(#${u}-hatch)`, seam: "#F4F6F8", collar: `url(#${u}-hatch)`, neck: "none", skin: "none", hair: `url(#${u}-hatch)`, stroke: "#4E5661", strokeWidth: 1.6 })}</g>`;
    /* rails and slide-in number plates */
    const digits = String(p.ovr).split("");
    const pw = 66;
    const px = ar ? [16, 16 + pw + 6] : [320 - 16 - 2 * pw - 6, 320 - 16 - pw];
    const rx0 = Math.min(...px) - 6;
    const rx1 = Math.max(...px) + pw + 6;
    const rail = (y) =>
      `<rect x="${rx0}" y="${y}" width="${rx1 - rx0}" height="5" rx="1" fill="#7C848E"/><rect x="${rx0}" y="${y}" width="${rx1 - rx0}" height="1.6" rx=".8" fill="#5A626C"/><rect x="${rx0}" y="${y + 4.2}" width="${rx1 - rx0}" height=".8" fill="#EEF1F4"/>`;
    s += rail(52) + rail(150);
    digits.forEach((dg, i) => {
      const x = px[i];
      s +=
        `<g class="c09-plate c09-plate${i}">` +
        plate(x, 56, pw, 94) +
        `<text x="${x + pw / 2}" y="${f(103 + 33)}" font-family="Changa" font-weight="800" font-size="104" text-anchor="middle" fill="#F4F6F8" filter="url(#${u}-paint)">${dg}</text>` +
        `<path d="M${x} 103H${x + pw}" stroke="#000" stroke-width="1.4"/><path d="M${x} 104.3H${x + pw}" stroke="#fff" stroke-opacity=".22" stroke-width=".6"/>` +
        `<circle cx="${x + 3.2}" cy="103.6" r="1.1" fill="#8D959F"/><circle cx="${x + pw - 3.2}" cy="103.6" r="1.1" fill="#8D959F"/>` +
        `</g>`;
    });
    s += `<filter id="${u}-paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".9" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    /* name plate, stamped tier, painted labels, the stat plate */
    const nm = MC.nameOf(p, o);
    const tierT = S.tiers[p.tier];
    const emb = (x, y, t, size, anchor) =>
      `<text x="${x}" y="${f(y + 0.6)}" font-family="Changa" font-weight="800" font-size="${size}" text-anchor="${anchor}" fill="#fff" fill-opacity=".8"${isArabic(t) ? ' direction="rtl"' : ' letter-spacing="2.2"'}>${esc(t)}</text>` +
      `<text x="${x}" y="${y}" font-family="Changa" font-weight="800" font-size="${size}" text-anchor="${anchor}" fill="#6E7680"${isArabic(t) ? ' direction="rtl"' : ' letter-spacing="2.2"'}>${esc(t)}</text>`;
    if (!ar) {
      s += plate(16, 16, 96, 32) + paint(26, 41.5, nm, 26, 800, "#F4F6F8", "start", ' letter-spacing="1"');
      s += emb(304, 38, tierT, 15, "end");
      s += paint(18, 72, "J.06  – –", 13, 700, "#7C848E", "start", ' letter-spacing=".5"');
      s += paint(18, 132, "J.07", 15, 800, "#1E242B", "start", ' letter-spacing=".5"');
      s += paint(px[0] - 8, 146, S.ovr, 11, 700, "#4E5661", "end", ' letter-spacing="1"');
      s += plate(16, 142, 74, 24) + paint(24, 159.5, "CAP", 13, 700, K.amber, "start", ' letter-spacing="1"') + paint(82, 159.5, String(p.stats.CAP), 15, 800, "#F4F6F8", "end");
    } else {
      s += plate(208, 16, 96, 34) + paint(294, 42, nm, 26, 800, "#F4F6F8");
      s += emb(18, 40, tierT, 15, "end");
      s += paint(302, 72, "الجولة 06  – –", 13, 700, "#7C848E");
      s += paint(302, 132, "الجولة 07", 15, 800, "#1E242B");
      s += paint(px[1] + pw + 8, 146, S.ovr, 11, 700, "#4E5661", "start", ' letter-spacing="1"');
      s += plate(212, 140, 92, 26) + paint(296, 158.5, S.stats.CAP, 13, 700, K.amber) + paint(220, 159.5, String(p.stats.CAP), 15, 800, "#F4F6F8", "start");
    }
    if (!thumb) {
      const wmH = 6.2;
      const wmW = wmH * MC.LOGO_RATIO.wordmark;
      if (!ar) s += wordmark(f(rx1 - wmW), 160, wmH, "#5F6873", 0.7) + engrave(f(rx1 - wmW - 8), 166, p.id, o, { size: 6, ls: ".3", anchor: "end", ink: "#5F6873", lip: 0.7 });
      else s += wordmark(rx0, 160, wmH, "#5F6873", 0.7) + engrave(f(rx0 + wmW + 8), 166, p.id, o, { size: 6, ls: ".3", ink: "#5F6873", lip: 0.7 });
      s += engrave(ar ? 196 : 124, 10.6, `${S.country}  ${p.season}`, o, { size: 5, ls: ".8", anchor: "middle", ink: "#6E7680", lip: 0.7 });
    }
    return s;
  }

  function homaBoard(p, o, u, side, thumb) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const r = rng(47);
    /* corrugated card with a torn top: the top-end corner is ripped away */
    let top = "M3 176V9";
    const pts = [];
    for (let x = 3; x < 316; x += 3 + r() * 4) {
      let y = 6 + r() * 3.2;
      if (x > 196) y += Math.min(16, (x - 196) * 0.26) + r() * 2.4;
      if (x > 262) y -= Math.min(12, (x - 262) * 0.24);
      pts.push([f(x), f(y)]);
    }
    pts.forEach(([x, y]) => (top += `L${x} ${y}`));
    top += "L317 12V176Z";
    /* where the liner tore off, the flutes show */
    let tear = "";
    const tp = pts.filter(([x]) => x > 186 && x < 300);
    if (tp.length > 2) {
      tear = `M${tp[0][0]} ${tp[0][1]}`;
      tp.forEach(([x, y]) => (tear += `L${x} ${y}`));
      for (let i = tp.length - 1; i >= 0; i--) tear += `L${tp[i][0]} ${f(tp[i][1] + 4 + r() * 3)}`;
      tear += "Z";
    }
    let flutes = "";
    if (tp.length > 2) {
      const x0 = tp[0][0];
      const x1 = tp[tp.length - 1][0];
      for (let x = x0; x < x1; x += 3) flutes += `M${f(x)} 0v30`;
    }
    const markerF = `filter="url(#${u}-mk)"`;
    let s =
      `<filter id="${u}-mk" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".04 .7" numOctaves="2" seed="9" result="s"/><feColorMatrix in="s" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.9 0 0 0 1.32" result="sa"/><feComposite in="d" in2="sa" operator="in"/></filter>` +
      (thumb
        ? ""
        : `<filter id="${u}-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="12"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .24  0 0 0 0 .12  0 0 0 -1.1 .62"/></filter>`) +
      `<pattern id="${u}-flute" width="4" height="10" patternUnits="userSpaceOnUse"><rect width="1.6" height="10" fill="#7A6040" opacity=".09"/><rect x="2" width="1" height="10" fill="#fff" opacity=".07"/></pattern>` +
      `<clipPath id="${u}-cp"><path d="${top}"/></clipPath>` +
      `<g transform="rotate(-1.1 160 176)">` +
      `<path d="${top}" transform="translate(1.2 2.4)" fill="#000" opacity=".22"/>` +
      `<path d="${top}" fill="${K.card}"/>` +
      `<g clip-path="url(#${u}-cp)">` +
      `<rect width="320" height="180" fill="url(#${u}-flute)"/>` +
      (thumb ? "" : `<rect width="320" height="180" filter="url(#${u}-paper)"/>`) +
      (tear ? `<path d="${tear}" fill="#DCC497"/><path d="${flutes}" stroke="#9C7F55" stroke-width=".9" clip-path="url(#${u}-tr)"/><clipPath id="${u}-tr"><path d="${tear}"/></clipPath>` : "") +
      `</g>` +
      `<path d="${top}" fill="none" stroke="${K.cardEdge}" stroke-width="1"/>`;
    const mk = (x, y, t, size, anchor = "start", rot = 0, fill = K.marker, extra = "") => {
      const a = isArabic(t);
      return `<text x="${x}" y="${y}" font-family="Lalezar" font-size="${size}" text-anchor="${anchor}" fill="${fill}"${a ? ' direction="rtl"' : extra}${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""} ${markerF}>${esc(t)}</text>`;
    };
    if (side === "back") {
      MC.STATS.forEach((k, i) => {
        const y = 52 + i * 30;
        s += ar ? mk(290, y, `${S.stats[k]}  ${p.stats[k]}`, 22) : mk(36, y, `${S.stats[k]}  ${p.stats[k]}`, 22, "start", -1);
      });
      s += `</g>`;
      return s;
    }
    const nm = MC.nameOf(p, o);
    if (!ar) {
      s += `<path d="M24 58c20-3 44-4 66-2" fill="none" stroke="${K.marker}" stroke-width="3.2" stroke-linecap="round" ${markerF}/>`;
      s += mk(22, 50, nm, 42, "start", -3);
      s += mk(300, 40, S.tiers[p.tier], 17, "end", 2);
      s += mk(26, 98, "J.07", 15, "start", -2);
      s += mk(26, 116, S.ovr, 12, "start", -2, "#4A4036");
      s += `<path d="M22 152c18-3 40-2 58 1" stroke="${K.amber}" stroke-width="13" stroke-linecap="round" opacity=".62" fill="none"/>`;
      s += mk(26, 158, `${S.stats.CAP} ${p.stats.CAP}`, 17, "start", -1);
      s += mk(304, 160, String(p.ovr), 132, "end", -2.5);
    } else {
      s += `<path d="M296 64c-20-3-40-4-60-2" fill="none" stroke="${K.marker}" stroke-width="3.2" stroke-linecap="round" ${markerF}/>`;
      s += mk(298, 54, nm, 38, "start", 2);
      s += mk(22, 42, S.tiers[p.tier], 18, "end", -2);
      s += mk(296, 102, "الجولة 07", 15, "start", 2);
      s += mk(296, 122, S.ovr, 12, "end", 2, "#4A4036");
      s += `<path d="M298 152c-18-3-44-2-64 1" stroke="${K.amber}" stroke-width="15" stroke-linecap="round" opacity=".62" fill="none"/>`;
      s += mk(294, 160, `${S.stats.CAP} ${p.stats.CAP}`, 17, "start", 1);
      s += mk(16, 160, String(p.ovr), 132, "start", 2.5);
    }
    /* the manager, drawn in marker */
    const dx = ar ? 178 : 84;
    s += `<g ${markerF} opacity=".9">${MC.avatar({ x: dx, y: 70, w: 56, h: 80, torso: "none", seam: "none", collar: "none", neck: "none", skin: "none", hair: K.marker, stroke: K.marker, strokeWidth: 6 })}</g>`;
    /* a BotolaGO sticker and the ID in pencil */
    if (!thumb) {
      const sx = ar ? 134 : 108;
      s +=
        `<g transform="rotate(${ar ? 3 : -4} ${sx + 40} 22)">` +
        `<rect x="${sx}" y="14" width="80" height="20" rx="3" fill="#F6F7F4"/><rect x="${sx}" y="14" width="80" height="20" rx="3" fill="none" stroke="#000" stroke-opacity=".12"/>` +
        `<g transform="translate(${sx + 8} 19)">${MC.logo("wordmark", { variant: "color", w: 64, h: 11.4, label: false })}</g>` +
        `<path d="M${sx + 70} 34l10-8v8z" fill="#E2E3DE"/>` +
        `</g>`;
      s += `<text x="${ar ? 22 : 300}" y="172" font-family="Manrope" font-weight="600" font-size="7" text-anchor="${ar ? "start" : "end"}" fill="#5C5348" opacity=".75" transform="rotate(-1 160 172)">${esc(p.id)}</text>`;
    }
    s += `</g>`;
    /* masking tape over the stick */
    s +=
      `<g opacity=".93">` +
      `<path d="M136 156L183 151L186 174L139 179Z" fill="#E9DDB6"/><path d="M136 156L183 151L186 174L139 179Z" fill="url(#${u}-flute)" opacity=".5"/>` +
      `<path d="M140 168L180 171L178 189L139 186Z" fill="#E4D6AC"/>` +
      `<path d="M136 156L183 151M139 179L186 174M140 168L139 186M180 171L178 189" stroke="#B9A77A" stroke-width=".5" opacity=".7"/>` +
      `</g>`;
    return s;
  }

  /** One complete board in viewBox units: handle, collar, then the board for the tier. */
  function board(p, o, u, side, opt = {}) {
    const tier = p.tier;
    const thumb = !!o.thumb;
    let s = `<defs>${defs(u, tier, thumb)}</defs>`;
    s += `<g class="c09-grip">${handle(u, tier, thumb)}${collar(u, p, o, tier, thumb)}</g>`;
    if (tier === "HOMA") s += homaBoard(p, o, u, side, thumb);
    else if (tier === "STADE") s += stadeBoard(p, o, u, side, thumb);
    else if (tier === "LEGEND") s += legendBoard(p, o, u, side, thumb, opt);
    else s += ledBoard(p, o, u, tier, side, thumb, opt);
    return s;
  }
  const VH = (tier) => (tier === "LEGEND" ? 330 : 300);

  /* ---------- token ---------- */
  function tokenSVG(p, o, s) {
    const tier = p.tier;
    const mini = !!o.mini || s <= 32;
    const v = mini ? 0 : s < 56 ? 1 : 2;
    const u = MC.uid(ID + "t");
    const bw = 60;
    const bh = 34;
    const stem = [18, 18, 26][v];
    const col = v === 0 ? 0 : 4;
    const ext = tier === "LEGEND" ? Math.round(stem * 0.3) : 0;
    const H = bh + col + stem + ext;
    const scale = s / (bh + col + stem);
    const sw = [9, 10, 12][v];
    const sx = (bw - sw) / 2;
    const y0 = bh;
    const rim = [2.8, 2.6, 2.4][v];
    const fs = 30;
    const ty = f(17 + 0.32 * fs);
    const digits = String(p.ovr);
    const band = Math.max(2.2, 2 / scale);
    let back = "";
    let stemS = "";
    let face = "";
    const stemPath = `M${sx} ${y0}V${H - 3}a3 3 0 0 0 3 3h${sw - 6}a3 3 0 0 0 3 -3V${y0}Z`;
    const stemFill = { HOMA: `url(#${u}-w)`, STADE: "#9AA3AD", CHAMPION: `url(#${u}-k)`, LEGEND: "#8D96A0" }[tier];
    back +=
      `<defs>${lg(`${u}-w`, [
        [0, "#6B4221"],
        [0.4, "#C89463"],
        [1, "#6B4221"],
      ], 'x1="0" y1="0" x2="1" y2="0"')}<pattern id="${u}-k" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#9AA3AD"/><path d="M0 0L2 2M2 0L0 2" stroke="#5F6873" stroke-width=".5"/></pattern>` +
      lg(`${u}-al`, [
        [0, "#E6EAEE"],
        [0.5, "#B5BDC6"],
        [1, "#8D959F"],
      ]) +
      `</defs>`;
    if (tier === "HOMA") stemS += `<rect x="${(bw - 8) / 2}" y="${y0 - 4}" width="8" height="${H - y0 + 4}" fill="url(#${u}-w)" stroke="#5B381B" stroke-width=".8"/>`;
    else stemS += stemFill ? `<path d="${stemPath}" fill="${stemFill}"/>` : `<path class="c09-stem" d="${stemPath}"/>`;
    if (tier === "STADE") stemS += `<path d="M${sx} ${y0 + 4}H${bw - sx}" stroke="#15191F" stroke-width="${f((H - y0) * 0.55)}" stroke-dasharray="1.5 1.5" transform="translate(0 ${f((H - y0) * 0.25)})"/>`;
    if (tier === "LEGEND") stemS += `<path d="M${sx + 2.5} ${y0 + 1}V${y0 + stem * 0.7}" stroke="${K.cyan}" stroke-width="1.6" opacity=".55"/>`;
    if (col) stemS += `<rect x="${sx - 2}" y="${y0}" width="${sw + 4}" height="${col}" fill="${p.founder ? `url(#${u}-k)` : tier === "HOMA" ? "none" : "#2A3442"}"/>`;
    if (p.founder) stemS += `<rect x="${sx - (col ? 2 : 1)}" y="${f(y0 + (col ? 1 : 2.2))}" width="${sw + (col ? 4 : 2)}" height="${f(band)}" fill="${K.band}" stroke="#5F6873" stroke-width=".4"/>`;
    const txt = (fill, extra = "") =>
      `<text x="${bw / 2}" y="${ty}" font-family="Changa" font-weight="800" font-size="${fs}" text-anchor="middle" fill="${fill}"${extra}>${digits}</text>`;
    if (tier === "HOMA") {
      const tp = "M0 34V4L8 2.6L15 4.2L24 2.4L34 4L42 6.4L50 10L60 8.6V34Z";
      face +=
        `<path d="${tp}" fill="${K.card}" stroke="${K.cardEdge}" stroke-width="1"/>` +
        `<path d="M45 8.4L50 10L60 8.6V11.6L50 13.4L44 11.2Z" fill="#DCC497"/>` +
        `<text x="${bw / 2}" y="${f(ty + 0.6)}" font-family="Lalezar" font-size="${fs * 1.04}" text-anchor="middle" fill="${K.marker}">${digits}</text>`;
    } else if (tier === "STADE") {
      face +=
        `<rect width="${bw}" height="${bh}" rx="1.4" fill="url(#${u}-al)"/>` +
        `<rect class="c09-edge" x=".4" y=".4" width="${bw - 0.8}" height="${bh - 0.8}" rx="1.2" fill="none" stroke-width=".8"/>` +
        `<rect x="${rim + 1}" y="${rim}" width="${bw - 2 * rim - 2}" height="${bh - 2 * rim}" rx="1" fill="${K.plate}"/>` +
        txt("#F4F6F8") +
        `<path d="M${rim + 1} 17H${bw - rim - 1}" stroke="#000" stroke-width="1.4"/><path d="M${rim + 1} 18.2H${bw - rim - 1}" stroke="#fff" stroke-opacity=".25" stroke-width=".6"/>`;
    } else if (tier === "LEGEND") {
      face +=
        `<filter id="${u}-gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${v === 0 ? 1.6 : 2.2}"/></filter>` +
        `<rect width="${bw}" height="${bh}" rx="1" fill="${K.glass}"/>` +
        `<rect x=".6" y=".6" width="${bw - 1.2}" height="${bh - 1.2}" rx=".8" fill="none" stroke="url(#${u}-sp)" stroke-width="1.2"/>` +
        lg(
          `${u}-sp`,
          [
            [0, K.ti],
            [0.5, K.cyan],
            [1, K.ti],
          ],
          'x1="0" y1="0" x2="1" y2="0"',
        ) +
        txt(K.cyan, ` opacity=".85" filter="url(#${u}-gl)"`) +
        txt("#D9FCFF", ` stroke="${K.cyan}" stroke-width=".6"`);
    } else {
      const champ = tier === "CHAMPION";
      face +=
        `<rect width="${bw}" height="${bh}" rx="1" fill="url(#${u}-al)"/>` +
        `<rect class="c09-edge" x=".4" y=".4" width="${bw - 0.8}" height="${bh - 0.8}" rx=".8" fill="none" stroke-width=".8"/>` +
        `<rect x="${rim}" y="${rim}" width="${bw - 2 * rim}" height="${bh - 2 * rim}" fill="${K.panel}"/>` +
        (champ ? `<rect x="${rim + 1.3}" y="${rim + 1.3}" width="${bw - 2 * rim - 2.6}" height="${bh - 2 * rim - 2.6}" fill="none" stroke="#C3CAD2" stroke-width=".9"/>` : "") +
        (v === 2
          ? `<pattern id="${u}-ul" width="2" height="2" patternUnits="userSpaceOnUse" x="${rim}" y="${rim}"><circle cx="1" cy="1" r=".62" fill="${K.unlit}"/></pattern><rect x="${rim}" y="${rim}" width="${bw - 2 * rim}" height="${bh - 2 * rim}" fill="url(#${u}-ul)"/>`
          : "") +
        `<filter id="${u}-gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2"/></filter>` +
        txt(K.cyan, ` opacity=".45" filter="url(#${u}-gl)"`) +
        txt(K.cyan);
    }
    const W = f(bw * scale);
    const Hp = f(H * scale);
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${MC.s(o).tiers[tier]}${p.founder ? ", " + MC.s(o).founderLine : ""}`;
    return `<span class="c09 c09-tok" data-tier="${tier}" role="img" aria-label="${esc(label)}" style="width:${W}px;height:${s}px"><svg viewBox="0 0 ${bw} ${H}" direction="ltr" width="${W}" height="${Hp}" style="margin-top:${f(s - Hp)}px" aria-hidden="true" focusable="false">${back}${stemS}${face}</svg></span>`;
  }

  /* ---------- share: the board raised over a night stand ---------- */
  function share(p, o) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const u = MC.uid(ID + "s");
    const r = rng(9);
    /* the stand: rows of heads and shoulders, phones raised as torches */
    let crowd = "";
    let torches = "";
    [324, 343, 362, 382, 402, 423].forEach((ry, ri) => {
      const rad = 2.9 + ri * 0.42;
      let d = "";
      let hx = -6 + r() * 6;
      while (hx < 368) {
        const hy = ry + (r() - 0.5) * 2.4;
        d +=
          `M${f(hx - rad * 2)} ${f(hy + rad * 3.4)}Q${f(hx - rad * 2)} ${f(hy + rad * 1.2)} ${f(hx)} ${f(hy + rad * 1.1)}Q${f(hx + rad * 2)} ${f(hy + rad * 1.2)} ${f(hx + rad * 2)} ${f(hy + rad * 3.4)}Z` +
          `M${f(hx + rad)} ${f(hy)}a${f(rad)} ${f(rad)} 0 1 0 ${f(-2 * rad)} 0a${f(rad)} ${f(rad)} 0 1 0 ${f(2 * rad)} 0Z`;
        if (r() > 0.83) {
          const big = r() > 0.55;
          const tx0 = hx + (r() - 0.5) * rad * 2;
          const ty0 = hy - rad * (1.6 + r() * 1.4);
          torches +=
            `<rect x="${f(tx0 - 0.9)}" y="${f(ty0 - 0.2)}" width="1.8" height="3" rx=".4" fill="#0A1426"/>` +
            `<circle cx="${f(tx0)}" cy="${f(ty0)}" r="${f(big ? 1.35 : 0.85)}" fill="#fff" opacity="${f(big ? 0.95 : 0.7)}"${big ? ` filter="url(#${u}-t)"` : ""}/>`;
        }
        hx += rad * 2.7 + r() * rad * 1.3;
      }
      const shade = ["#0A1C3A", "#0B1F40", "#0C2245", "#0D244A", "#0E274F", "#0F2A54"][ri];
      crowd += `<path d="${d}" fill="${shade}"/>`;
    });
    /* perimeter LED strip, white identity, cyan rating, at a 3.4px pitch (>=10px at export) */
    const P = 3.4;
    /* two messages per loop with a blank panel between them, where the arm crosses the strip */
    const dot = { g: bit("·"), c: K.grey, gap: 4 };
    const mkSegs = (arr) => arr.map(([g, c]) => ({ g, c, gap: 4 })).flatMap((sg, i, all) => (i < all.length - 1 ? [sg, dot] : [sg]));
    const nameG = ar ? sample(MC.nameOf(p, o), "700", "Alexandria", 7, { thr: 0.42, above: 7, below: 3 }) : bit(MC.nameOf(p, o), true);
    const tierG = ar ? sample(S.tiers[p.tier], "700", "Alexandria", 7, { thr: 0.42, above: 7, below: 3 }) : bit(S.tiers[p.tier], true);
    const first = ar ? mkSegs([[bit(String(p.ovr), true), K.cyan], [nameG, K.white]]) : mkSegs([[nameG, K.white], [bit(String(p.ovr), true), K.cyan]]);
    const second = ar
      ? mkSegs([[bit(p.id), K.muted], [tierG, K.white], [bit("@ali", true), K.white]])
      : mkSegs([[bit("@ali", true), K.white], [tierG, K.white], [bit(p.id), K.muted]]);
    const wOf = (segs) => segs.reduce((t, sg, i) => t + sg.g.w + (i < segs.length - 1 ? sg.gap : 0), 0);
    const jump = Math.ceil((ar ? 360 - 138 : 240) / P);
    const unit = jump + wOf(second) + 10;
    const F = Face(unit * 3 + 4, 10);
    const X0 = ar ? f(360 - F.cols * P) : 0;
    for (let k = 0; k < 3; k++) {
      if (!ar) {
        line(F, first, k * unit + 3, 8);
        line(F, second, k * unit + jump, 8);
      } else {
        const r0 = F.cols - 1 - k * unit - 3;
        line(F, first, r0, 8, true);
        line(F, second, r0 - jump + 3, 8, true);
      }
    }
    const L = { P, X: X0, Y: 449, cols: F.cols, rows: 10 };
    LED.__share = L;
    const led = ledRender(u, "__share", [{ cls: "c09-strip-l", face: F }], `${X0} 440 ${f(F.cols * P)} 50`);
    delete LED.__share;
    let seams = "";
    for (let sx0 = 72; sx0 < 360; sx0 += 72) seams += `<rect x="${sx0 - 0.6}" y="447" width="1.2" height="38" fill="#000"/><rect x="${sx0 + 0.6}" y="447" width=".5" height="38" fill="#fff" opacity=".08"/>`;
    const shiftPx = f(unit * P);
    /* the board, the arm that raises it */
    const bw = 334;
    const k = bw / 320;
    const bx = 13;
    const by = 122;
    const VHt = VH(p.tier);
    const boardSvg = `<svg x="${bx}" y="${by}" width="${bw}" height="${f(VHt * k)}" viewBox="0 0 320 ${VHt}" overflow="visible">${board(p, o, u + "b", "front", { share: true })}</svg>`;
    const hy = by + (p.tier === "LEGEND" ? 286 : 250) * k;
    const sleeve = `M156 ${f(hy + 26)}C148 ${f(hy + 110)} 166 ${f(hy + 200)} 176 668L306 668C272 ${f(hy + 190)} 224 ${f(hy + 100)} 208 ${f(hy + 24)}Z`;
    const arm =
      lg(
        `${u}-sl`,
        [
          [0, "#081C44"],
          [0.22, "#1A3A74"],
          [0.5, "#0C2552"],
          [1, "#00102E"],
        ],
        'x1="0" y1="0" x2="1" y2="0"',
      ) +
      lg(`${u}-gv`, [
        [0, "#343C4B"],
        [1, "#141924"],
      ]) +
      `<pattern id="${u}-cuff" width="2.6" height="40" patternUnits="userSpaceOnUse"><rect width="1.1" height="40" fill="#22427A" opacity=".8"/></pattern>` +
      /* sleeve */
      `<path d="${sleeve}" fill="url(#${u}-sl)"/>` +
      `<path d="M166 ${f(hy + 74)}Q188 ${f(hy + 90)} 216 ${f(hy + 66)}M170 ${f(hy + 138)}Q202 ${f(hy + 160)} 238 ${f(hy + 128)}M176 ${f(hy + 206)}Q214 ${f(hy + 226)} 258 ${f(hy + 190)}" fill="none" stroke="#000A22" stroke-width="2.4" opacity=".55"/>` +
      `<path d="M166 ${f(hy + 71)}Q188 ${f(hy + 87)} 216 ${f(hy + 63)}M170 ${f(hy + 135)}Q202 ${f(hy + 157)} 238 ${f(hy + 125)}M176 ${f(hy + 203)}Q214 ${f(hy + 223)} 258 ${f(hy + 187)}" fill="none" stroke="#4A6BA6" stroke-width=".9" opacity=".45"/>` +
      `<path d="M205 ${f(hy + 30)}C220 ${f(hy + 110)} 250 ${f(hy + 190)} 286 668" fill="none" stroke="#0151FC" stroke-width="3.2"/>` +
      `<path d="M209 ${f(hy + 30)}C224 ${f(hy + 110)} 254 ${f(hy + 190)} 290 668" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width=".8"/>` +
      `<path d="M156 ${f(hy + 26)}C148 ${f(hy + 110)} 166 ${f(hy + 200)} 176 668" fill="none" stroke="${K.cyan}" stroke-opacity=".4" stroke-width="1.4"/>` +
      `<path d="M208 ${f(hy + 24)}C224 ${f(hy + 100)} 272 ${f(hy + 190)} 306 668" fill="none" stroke="#C9D6EA" stroke-opacity=".32" stroke-width="1.2"/>` +
      /* ribbed cuff */
      `<path d="M153 ${f(hy + 8)}H209L211 ${f(hy + 29)}Q182 ${f(hy + 33)} 155 ${f(hy + 30)}Z" fill="#0B1E46"/>` +
      `<path d="M153 ${f(hy + 8)}H209L211 ${f(hy + 29)}Q182 ${f(hy + 33)} 155 ${f(hy + 30)}Z" fill="url(#${u}-cuff)"/>` +
      `<path d="M153 ${f(hy + 8.6)}H209" stroke="#8FA6CC" stroke-opacity=".55" stroke-width="1"/>` +
      /* a gloved fist round the handle: four fingers wrapped toward us, the thumb over the top */
      `<path d="M157 ${f(hy - 17)}Q157 ${f(hy - 21)} 162 ${f(hy - 21)}H200Q206 ${f(hy - 21)} 206 ${f(hy - 15)}V${f(hy + 6)}Q206 ${f(hy + 11)} 200 ${f(hy + 11)}H162Q157 ${f(hy + 11)} 157 ${f(hy + 6)}Z" fill="url(#${u}-gv)"/>` +
      [0, 1, 2, 3]
        .map((i) => {
          const y = hy - 14 + i * 6.6;
          return `<path d="M158 ${f(y + 6)}Q160 ${f(y)} 166 ${f(y)}H197Q203 ${f(y)} 204 ${f(y + 3.4)}" fill="none" stroke="#58637A" stroke-width="1" opacity=".9"/><path d="M160 ${f(y + 6.3)}H203" stroke="#07090E" stroke-width="1"/>`;
        })
        .join("") +
      `<path d="M155 ${f(hy - 15)}Q164 ${f(hy - 27)} 186 ${f(hy - 24)}Q194 ${f(hy - 23)} 192 ${f(hy - 17)}Q178 ${f(hy - 18)} 160 ${f(hy - 9)}Z" fill="#2A3140"/>` +
      `<path d="M157 ${f(hy - 16)}Q166 ${f(hy - 25)} 186 ${f(hy - 22)}" fill="none" stroke="${K.cyan}" stroke-opacity=".35" stroke-width=".9"/>`;
    const logoW = 118;
    const logo = `<g transform="translate(${ar ? 360 - 22 - logoW : 22} 92)">${MC.logo("wordmark", { variant: "light", w: logoW, h: f(logoW / MC.LOGO_RATIO.wordmark), label: false })}</g>`;
    const handleT = `<text x="${ar ? 22 : 338}" y="107" font-family="Manrope" font-weight="800" font-size="15" text-anchor="${ar ? "start" : "end"}" fill="#fff" direction="ltr">@ali</text>`;
    /* pitch: the splash's perspective stripes */
    let stripes = "";
    for (let i = -8; i < 9; i += 2) stripes += `<path d="M180 330L${180 + i * 60} 640H${180 + (i + 1) * 60}Z" fill="hsl(214 90% 55%)" opacity=".1"/>`;
    const label = MC.label(p, o);
    return (
      `<div class="c09 c09-share" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(label)}">` +
      `<svg viewBox="0 0 360 640" width="360" height="640" direction="ltr" aria-hidden="true" focusable="false">` +
      `<defs>` +
      lg(`${u}-sky`, [
        [0, "#00143A"],
        [0.45, "#001C49"],
        [1, "#04102A"],
      ]) +
      `<radialGradient id="${u}-fl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".35" stop-color="#BFD6FF" stop-opacity=".07"/><stop offset="1" stop-color="#BFD6FF" stop-opacity="0"/></radialGradient>` +
      `<filter id="${u}-t" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      lg(`${u}-st`, [
        [0, "#071833"],
        [1, "#020814"],
      ]) +
      lg(`${u}-pi`, [
        [0, "#05183A"],
        [1, "#010612"],
      ]) +
      `<clipPath id="${u}-pc"><rect x="0" y="494" width="360" height="146"/></clipPath>` +
      `<clipPath id="${u}-sc"><rect x="0" y="449" width="360" height="34"/></clipPath>` +
      led.defs +
      `</defs>` +
      `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
      `<circle cx="20" cy="40" r="190" fill="url(#${u}-fl)"/><circle cx="340" cy="40" r="190" fill="url(#${u}-fl)"/>` +
      `<rect x="0" y="306" width="360" height="140" fill="url(#${u}-st)"/>` +
      crowd +
      torches +
      `<rect x="0" y="494" width="360" height="146" fill="url(#${u}-pi)"/>` +
      `<g clip-path="url(#${u}-pc)">${stripes}</g>` +
      `<path d="M0 497H360" stroke="#fff" stroke-opacity=".35" stroke-width="1.4"/>` +
      `<rect x="0" y="445" width="360" height="42" fill="#05080C"/><rect x="0" y="445" width="360" height="2.2" fill="#9AA3AD"/><rect x="0" y="485" width="360" height="2" fill="#2A3442"/>` +
      `<g clip-path="url(#${u}-sc)"><g class="c09-strip" style="--c09-shift:${ar ? "" : "-"}${shiftPx}px">${led.html}</g></g>` +
      boardSvg +
      arm +
      logo +
      handleT +
      `</svg></div>`
    );
  }

  /* ---------- the concept ---------- */
  const c = {
    id: ID,
    n: 9,
    slug: "09",
    name: "Panneau",
    nameAr: "لوحة التبديل",
    category: "youth",
    philosophy:
      "Your card is the fourth official's substitution board: the one object in football built to show one person's number to the whole stadium, and to show it changing.",
    philosophyAr: "بطاقتك هي لوحة التبديل التي يرفعها الحكم الرابع: الشيء الوحيد في كرة القدم المصنوع ليُظهر رقم شخص واحد للملعب كله، ويُظهر تغيّره.",
    idea: [
      "The card is not a card. It is the handheld substitution board: a 16:9 face in a machined frame on a long, centred paddle handle. Painted solid, it reads as a board held up before a single character is read, at 360px and at 24px. No card game, no profile widget and none of the first exploration's ten owns that outline.",
      "The face keeps the board's own grammar. The top line is identity: ALI and the tier. The dim line is the previous gameweek, shown as two dashes because the app has no previous overall today. The bottom line is this gameweek, and the 84 is the only cyan on the board. One stat shows at a time in a carousel with pager dots; the back of the board carries all four, a season record and the ID line.",
      "The LEDs are computed, not textured. Every string is drawn into a cell grid and each LED is either on or off, with real unlit dots between them. PRO speaks a classic 5×7 board font. CHAMPION's finer matrix samples the brand face, Changa, so the 84 gains curves. Arabic is sampled from Alexandria at a taller cell count, the way Moroccan shop signs run taller modules for Arabic.",
      "The avatar is not a portrait. It is your reflection in the black acrylic, the person holding the board, faint under the dots. Colour has one meaning each: white is identity, cyan is the rating, grey is the past and amber is the captain. Gain green and loss magenta exist only in share images, never on the board.",
    ],
    belonging: [
      "Everyone's board goes up in the same minute at gameweek close, so a group chat compares one moment instead of ten screenshots taken at different times.",
      "A 15-year-old already knows this object from every broadcast and every café TV. 'My number's going up' needs no onboarding.",
      "The tiers are a technology ladder that anyone who played neighbourhood football recognises: a cardboard sign taped to a broom handle, a manual plate paddle, an LED board, a broadcast-grade full matrix, then dead-front glass held highest. You can see who has which from across a leaderboard, without reading.",
      "A bad week is survivable: the old number is small and grey, and the board stays up.",
      "Founders keep the steel collar on every board they will ever hold. It cannot be bought; you could only have been there.",
    ],
    founderMark: [
      "A knurled steel collar where the handle meets the board, 36u wide and wider than the grip, so a founder's outline is physically different from everyone else's.",
      "A polished band runs round it, engraved FOUNDER 2026 on the front, with the Arabic عضو مؤسس and BOT #004821 wrapping out of sight like a real engraving on a cylinder.",
      "The same collar at every tier. At HOMA it is a borrowed part, hose-clamped onto a broom handle, which is the point: it came with you from the first board.",
      "At 24 to 44px the polished band survives as a bright 2px stripe across the stem: the one detail that tells a founder's token apart in a comment thread.",
    ],
    small: [
      "56–80px: the board on its paddle, the 84 solid in Changa 800 cyan with a 1px bloom, the tier carried by the frame, a faint unlit-dot field on the face, the founder band on the stem.",
      "44px: a 16:9 board on a short stub. The stub is what keeps it a board and not a TV.",
      "24–32px: a 30×17 panel on a 6px stub, the 84 at 14px. The frame carries the tier: a card tile with marker digits (HOMA), a hinge line through white plate digits (STADE), one aluminium rim (PRO), a double rim (CHAMPION), rimless glowing glass (LEGEND).",
      "LEGEND's handle is 30% longer in every token and the extra length grows upward, so in a column of rankings the LEGEND board stands visibly higher than the rest.",
      "When an LED would fall under about two device pixels, the matrix switches to solid cells, so tier strips and thumbnails never shimmer.",
    ],
    rtl: [
      "The object never mirrors: frame, paddle and collar are centred and symmetric. The LED content mirrors: علي and the tier swap ends, the 84 moves to the inline end on the left, and the gameweek lines move to the right.",
      "Arabic is drawn into the matrix itself (Alexandria, about 12 rows against 7 for Latin), so علي in LED dots is local rather than translated. No letter-spacing anywhere on Arabic.",
      "Digits stay left to right (06, 07, 84, 91) and come from the same digit set as the Latin board.",
      "Engravings follow the reading direction: the wordmark leads at the right in Arabic and is never mirrored. The founder engraving reads عضو مؤسس 2026 on the front of the band.",
    ],
    tiers: {
      HOMA: "Corrugated card with a torn corner, the flutes showing where the liner ripped. Marker digits, a yellow highlighter swipe on CAP, the manager doodled in marker, a BotolaGO sticker. Taped to a 16u broom handle. No LEDs, no glass.",
      STADE: "A manual aluminium paddle: rivets, rails and two slide-in black plates with the 8 and the 4 painted white in Changa 800, each split by a visible hinge line. Name on a painted plate, tier stamped into the metal, the figure as a navy vinyl sticker, grip-taped tube.",
      PRO: "Brushed-aluminium bezel, black acrylic face, a 2.5u LED matrix in a 5×7 board font, the 84 in cyan with a 2px bloom, your reflection under the dots. Ribbed rubber paddle.",
      CHAMPION: "A full matrix at 2u pitch that samples Changa, so the 84 gains curves. A polished chamfer with a hard specular streak, a visible 4u edge for a double-sided board, a fully knurled steel grip with a polished end. The name row scrolls in once.",
      LEGEND: "Dead-front smoked glass with no visible pixels. The 84 is continuous light spilling cyan onto a bead-blasted titanium frame and down the handle. A telescopic handle 30% longer, so the board is held highest. The carousel is gone: ALI, the 84 and your reflection, rimmed in cyan.",
    },
    legend: [
      "Le panneau se lève. The board rises from below the card's edge on a 420ms spring with the small wobble of a hand.",
      "It sits black for one beat, showing only your reflection in the glass.",
      "Then the 84 fades up out of the glass with a soft bloom. No loop, no count-up, never the old number. Under reduced motion the lit board simply shows.",
      "In every ranking the LEGEND token stands higher than the rest, because its handle is longer.",
    ],
    advantages: [
      "The outline is a board on a paddle at every size down to 24px, and nothing else in the app or in other card games has that silhouette.",
      "A weekly ritual is built into the object: the board exists to show a change, and gameweek close is its moment.",
      "The colour law (cyan means the rating, nothing else) makes the 84 the brightest thing on screen without a badge, chip or ring.",
      "Arabic drawn in LED dots is local, not translated: it is the shop-sign medium every Moroccan street already has.",
      "The tier ladder is physical (card, painted plates, LED, full matrix, glass) and reads without colour, so it survives colour blindness and greyscale screenshots.",
    ],
    risks: [
      "LED on black drifts toward neon gamer. The bloom is held to a 2px halo and the frame is real metal, but motion and marketing need the same restraint.",
      "It promises a change between gameweeks. The app has no previous overall yet, so the OUT line shows dashes until it does, and the reveal ritual depends on that data.",
      "Five boards in a leaderboard can recall a betting-shop odds screen. The rows keep points in the app's own type, never in LED, and that line must hold.",
      "The LED text is computed from fonts at render time (cached per string). Production should ship pre-rendered glyph grids rather than a canvas sampler.",
      "Amber as card artwork (CAP) needs the owner's sign-off, because amber is fill-only in the app UI.",
      "Any reveal must stay under three flashes a second; this one is a single fade.",
      "HOMA's cardboard-and-broom board is affectionate, but some users could read it as mocking the lowest tier. The copy has to frame it as where every board starts.",
    ],
    gridWidth: 252,
    detailWidth: 400,

    full(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const u = MC.uid(ID);
      const tier = p.tier;
      const H = VH(tier);
      const front = `<svg class="c09-face c09-front" direction="ltr" viewBox="0 0 320 ${H}" style="aspect-ratio:320/${H}" aria-hidden="true" focusable="false">${board(p, o, u, "front")}</svg>`;
      const back = o.thumb
        ? ""
        : `<svg class="c09-face c09-back" direction="ltr" viewBox="0 0 320 ${H}" style="aspect-ratio:320/${H}" aria-hidden="true" focusable="false">${board(p, o, MC.uid(ID + "k"), "back")}</svg>`;
      const pitch = tier === "CHAMPION" ? "2" : tier === "PRO" ? "2.5" : "0";
      return (
        `<div class="c09 c09-card${o.thumb ? " is-thumb" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}" data-pitch="${pitch}" data-motion="${o.motion ? 1 : 0}">` +
        `<div class="c09-obj">${front}${back}</div></div>`
      );
    },

    token(p, o = {}) {
      return tokenSVG(p, o, o.size || 44);
    },

    row(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      return (
        `<div class="c09 c09-row${o.me ? " is-me" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" data-tier="${p.tier}">` +
        `<span class="c09-r-rank">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
        `<span class="c09-r-tok">${tokenSVG(p, o, 46)}</span>` +
        `<span class="c09-r-name"><b>${esc(MC.nameOf(p, o))}</b><small>${esc(S.tiers[p.tier])}${p.founder ? `<span class="c09-sr">, ${esc(S.founderLine)}</span>` : ""}</small></span>` +
        `<span class="c09-r-pts"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
        `</div>`
      );
    },

    share(p, o = {}) {
      return share(p, o);
    },

    /* Tap: hold the carousel, tap again to step. Swipe: turn the board over. Long press: raise it. */
    mount(el, o = {}) {
      if (!el || el.__c09 || !el.classList || !el.classList.contains("c09-card")) return;
      el.__c09 = true;
      const front = el.querySelector(".c09-front");
      const stats = front ? [...front.querySelectorAll(".c09-st")] : [];
      const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      let i = 0;
      let held = false;
      const show = (k) => stats.forEach((g, j) => g.classList.toggle("is-on", j === k));
      if (stats.length) {
        el.classList.add("is-js");
        show(0);
        if (o.motion && !reduced) {
          const t = setInterval(() => {
            if (!el.isConnected) return clearInterval(t);
            if (!held) show((i = (i + 1) % stats.length));
          }, 2400);
        }
      }
      el.tabIndex = 0;
      let x0 = 0;
      let lp = null;
      let raised = false;
      const tap = () => {
        if (!stats.length) return;
        if (!held) {
          held = true;
          el.classList.add("is-held");
        } else show((i = (i + 1) % stats.length));
      };
      el.addEventListener("pointerdown", (e) => {
        x0 = e.clientX;
        raised = false;
        lp = setTimeout(() => {
          raised = true;
          el.classList.add("is-raised");
        }, 450);
      });
      const end = (e, cancel) => {
        clearTimeout(lp);
        if (raised) {
          el.classList.remove("is-raised");
          return;
        }
        if (cancel) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 36) el.classList.toggle("is-flipped");
        else tap();
      };
      el.addEventListener("pointerup", (e) => end(e, false));
      el.addEventListener("pointercancel", (e) => end(e, true));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          tap();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") el.classList.toggle("is-flipped");
      });
    },
  };
  MC.register(c);
})();
