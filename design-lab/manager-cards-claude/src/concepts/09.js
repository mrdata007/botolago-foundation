/* 09 PANNEAU — the fourth official's board, held up in your own hand.
   The card is the board: a 16:9 face in a frame, a collar, a long centred paddle and your fist on it.
   Units are viewBox units ("u"): the board is 320u wide, the whole object 320 x 340u.
   LED text is computed, not textured: every string becomes a grid of cells and each LED is on or off.
   Names and the 84 are Changa 800 sampled into the grid (Arabic too: its em is sized so the dots of ي
   stay separate cells); labels use a 5x7 and a 3x5 board font on PRO's 3u pitch, and sampled Changa
   with three brightness levels on CHAMPION's 2u pitch. Arabic labels are solid Handjet: the lab's copy
   of Handjet has no element axes, so a dot mask would merge its dots. */
(function () {
  const MC = window.MC;
  const ID = "c09";
  const f = (v) => +(+v).toFixed(2);
  const esc = MC.esc;
  const TIERS = MC.TIERS;
  const H_ = 'x1="0" y1="0" x2="1" y2="0"';

  /* ---------- palette: one colour, one meaning ---------- */
  const K = {
    face: "#0A0C0F", // the black acrylic face
    unlit: "#0F1A26", // an LED that is off
    warm: "#F4EDE0", // identity and figures (warm-white LEDs)
    cyan: "#73EDFA", // the 2u "your number is on" strip, nothing else
    tung: "#FFD9A0", // tungsten: founder only
    engrave: "#2A3038",
    steel: "#8F99A3",
    knurl: "#5F6873",
    band: "#E6EBF0",
    cuff: "#2B2F35",
    ti: "#8D96A0",
    glass: "#030405",
    light: "#FFF7EA", // LEGEND's figures: the white-hot core of continuous light
    paint: "#0E1013", // HOMA's new black enamel
    paintW: "#F2EEE6", // sign-writer's white
    card: "#141619", // STADE's flip cards
    skin: "#b98463", // MC.avatar's skin token
    skinDk: "#7f543b",
    skinLt: "#dcab87",
  };
  const clubOf = (p) => ({
    primary: (p.club && p.club.primary) || "#1B2433",
    secondary: (p.club && p.club.secondary) || "#C3CAD2",
  });
  const yearOf = (p) => (p.founder ? String(p.founder).slice(2) : "");
  const isArabic = (s) => /[؀-ۿ]/.test(s);

  /* The sampler and the measurements draw with these faces on a canvas, so start loading them now:
     the gallery and the preview wait for document.fonts.ready before rendering. */
  const FACES = [
    ["800 40px Changa", "0123456789"],
    ["700 40px Changa", "ALI CAP·26"],
    ["600 40px Changa", "OVR SEL TRF CON"],
    ["800 40px Changa", "علي"],
    ["700 40px Changa", "القائد التشكيلة"],
    ["400 40px Handjet", "علي القائد 0123"],
    ["400 40px Handjet", "ABC 0123"],
    ["700 40px Manrope", "BOT #0"],
    ["800 40px Manrope", "26"],
    ["700 40px Noto Sans Arabic", "المغرب"],
  ];
  try {
    if (document.fonts && document.fonts.load)
      FACES.forEach(([fo, t]) => document.fonts.load(fo, t).catch(() => {}));
  } catch (e) {
    /* no font loading API: the canvas uses whatever face it has */
  }

  /* ---------- board fonts ---------- */
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
    V: "#...#|#...#|#...#|.#.#.|.#.#.|..#..|..#..",
    W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.",
    X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    Y: "#...#|#...#|#...#|.#.#.|..#..|..#..|..#..",
    Z: "#####|....#|...#.|..#..|.#...|#....|#####",
    0: ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
    1: "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
    2: ".###.|#...#|....#|...#.|..#..|.#...|#####",
    3: "#####|...#.|..#..|...#.|....#|#...#|.###.",
    4: "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
    5: "#####|#....|####.|....#|....#|#...#|.###.",
    6: "..##.|.#...|#....|####.|#...#|#...#|.###.",
    7: "#####|....#|...#.|..#..|.#...|.#...|.#...",
    8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
    9: ".###.|#...#|#...#|.####|....#|...#.|.##..",
    "·": "..|..|..|##|##|..|..",
    "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.",
    "/": "....#|....#|...#.|..#..|.#...|#....|#....",
    ".": "..|..|..|..|..|##|##",
    " ": "...|...|...|...|...|...|...",
  };
  const F35 = {
    A: ".#.|#.#|###|#.#|#.#",
    B: "##.|#.#|##.|#.#|##.",
    C: ".##|#..|#..|#..|.##",
    D: "##.|#.#|#.#|#.#|##.",
    E: "###|#..|##.|#..|###",
    F: "###|#..|##.|#..|#..",
    G: ".##|#..|#.#|#.#|.##",
    H: "#.#|#.#|###|#.#|#.#",
    I: "###|.#.|.#.|.#.|###",
    J: "..#|..#|..#|#.#|.#.",
    K: "#.#|#.#|##.|#.#|#.#",
    L: "#..|#..|#..|#..|###",
    M: "#...#|##.##|#.#.#|#...#|#...#",
    N: "#...#|##..#|#.#.#|#..##|#...#",
    O: ".#.|#.#|#.#|#.#|.#.",
    P: "##.|#.#|##.|#..|#..",
    Q: ".#.|#.#|#.#|##.|.##",
    R: "##.|#.#|##.|#.#|#.#",
    S: ".##|#..|.#.|..#|##.",
    T: "###|.#.|.#.|.#.|.#.",
    U: "#.#|#.#|#.#|#.#|###",
    V: "#...#|#...#|.#.#.|.#.#.|..#..",
    W: "#...#|#...#|#.#.#|##.##|#...#",
    X: "#.#|#.#|.#.|#.#|#.#",
    Y: "#.#|#.#|.#.|.#.|.#.",
    Z: "###|..#|.#.|#..|###",
    0: "###|#.#|#.#|#.#|###",
    1: ".#.|##.|.#.|.#.|###",
    2: "###|..#|###|#..|###",
    3: "###|..#|.##|..#|###",
    4: "#.#|#.#|###|..#|..#",
    5: "###|#..|##.|..#|##.",
    6: ".##|#..|###|#.#|###",
    7: "###|..#|.#.|.#.|.#.",
    8: "###|#.#|###|#.#|###",
    9: "###|#.#|###|..#|##.",
    "#": ".#.#.|#####|.#.#.|#####|.#.#.",
    "/": "..#|..#|.#.|#..|#..",
    ".": ".|.|.|.|#",
    "·": ".|.|#|.|.",
    " ": "..|..|..|..|..",
  };
  /** A string in a board font as a cell grid: { w, h, base, cells: [[col, row, level]] }. */
  function bit(str, font, bold) {
    const set = new Set();
    const h = font === F35 ? 5 : 7;
    let x = 0;
    for (const ch of String(str)) {
      const g = (font[ch] || font[ch.toUpperCase()] || font[" "]).split("|");
      const w = g[0].length;
      g.forEach((row, r) => {
        for (let c = 0; c < w; c++)
          if (row[c] === "#") {
            set.add(r * 1000 + x + c);
            if (bold) set.add(r * 1000 + x + c + 1);
          }
      });
      x += w + (bold ? 1 : 0) + 1;
    }
    return {
      w: Math.max(0, x - 1),
      h,
      base: h,
      cells: [...set].map((k) => [k % 1000, Math.floor(k / 1000), 1]),
    };
  }

  /* ---------- the canvas: measuring, and sampling any face into LED cells ---------- */
  const SC = 8; // canvas pixels per LED cell
  let cv = null;
  let g2 = null;
  const ctx = () => {
    if (!g2) {
      cv = document.createElement("canvas");
      g2 = cv.getContext("2d", { willReadFrequently: true });
    }
    return g2;
  };
  const ready = (font, t) => {
    try {
      return !document.fonts || document.fonts.check(font, t);
    } catch (e) {
      return true;
    }
  };
  const ratios = new Map();
  /** Height of a reference glyph as a share of the em (cap height for "H", figure height for "8"). */
  function capOf(weight, family, ref) {
    const k = weight + family + ref;
    if (ratios.has(k)) return ratios.get(k);
    const g = ctx();
    const font = `${weight} 100px "${family}"`;
    g.font = font;
    const r = g.measureText(ref).actualBoundingBoxAscent / 100 || 0.7;
    if (ready(font, ref)) ratios.set(k, r);
    return r;
  }
  /** Advance width of a string in viewBox units. */
  function textW(t, size, weight, family) {
    const g = ctx();
    g.font = `${weight} ${size * SC}px "${family}"`;
    return g.measureText(String(t)).width / SC;
  }
  const memo = new Map();
  /** Samples a string into cells whose reference glyph is `rows` cells tall. aa: three brightness levels.
      desc: rows kept below the baseline. em: set the em in cells instead, and keep the string's own measured
      ascent and descent (Arabic: Changa's ي runs half an em below the baseline, with its dots under it). */
  function sample(text, weight, family, rows, opt = {}) {
    const ref = opt.ref || "H";
    const sx = opt.sx || 1;
    const aa = !!opt.aa;
    const over = opt.over != null ? opt.over : 1;
    const key = [text, weight, family, rows, sx, aa, ref, over, opt.desc, opt.em, opt.thr].join(
      "|",
    );
    if (memo.has(key)) return memo.get(key);
    const em = opt.em || rows / capOf(weight, family, ref);
    const g = ctx();
    const font = `${weight} ${em * SC}px "${family}"`;
    g.font = font;
    const m = g.measureText(text);
    const L = m.actualBoundingBoxLeft;
    const R = m.actualBoundingBoxRight;
    const above = opt.em ? Math.ceil(m.actualBoundingBoxAscent / SC + 0.25) : rows + over;
    const desc = opt.em ? Math.ceil(m.actualBoundingBoxDescent / SC + 0.25) : opt.desc || 0;
    const tall = above + desc;
    const cols = Math.max(1, Math.ceil(((L + R) * sx) / SC)) + 2;
    const W = cols * SC;
    const H = tall * SC;
    cv.width = W;
    cv.height = H;
    g.font = font;
    g.fillStyle = "#000";
    g.setTransform(sx, 0, 0, 1, SC + L * sx, above * SC);
    g.fillText(text, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const cells = [];
    let lo = Infinity;
    let hi = -1;
    for (let r = 0; r < tall; r++)
      for (let c = 0; c < cols; c++) {
        let s = 0;
        for (let y = r * SC; y < (r + 1) * SC; y++)
          for (let x = c * SC; x < (c + 1) * SC; x++) s += d[(y * W + x) * 4 + 3];
        s /= SC * SC * 255;
        const a = aa
          ? s >= 0.5
            ? 1
            : s >= 0.3
              ? 0.75
              : s >= 0.15
                ? 0.4
                : 0
          : s >= (opt.thr || 0.5)
            ? 1
            : 0;
        if (a) {
          cells.push([c, r, a]);
          lo = Math.min(lo, c);
          hi = Math.max(hi, c);
        }
      }
    const out = {
      w: hi >= lo ? hi - lo + 1 : 0,
      h: tall,
      base: above,
      cells: cells.map(([c, r, a]) => [c - lo, r, a]),
    };
    if (ready(font, text)) memo.set(key, out);
    return out;
  }
  /** The neutral crest (MC.CREST) as an LED outline, `rows` cells tall. */
  function crestCells(rows, aa) {
    const key = "crest|" + rows + "|" + aa;
    if (memo.has(key)) return memo.get(key);
    const g = ctx();
    const k = (rows * SC) / 48;
    const cols = Math.ceil((40 * k) / SC) + 1;
    cv.width = cols * SC;
    cv.height = rows * SC + SC;
    g.setTransform(k, 0, 0, k, SC / 2, SC / 2);
    g.strokeStyle = "#000";
    g.lineJoin = "round";
    g.lineWidth = 3.4;
    g.stroke(new Path2D(MC.CREST.shield));
    g.stroke(new Path2D("M9 13L31 37"));
    g.beginPath();
    g.arc(20, 22, 5.4, 0, Math.PI * 2);
    g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const W = cv.width;
    const d = g.getImageData(0, 0, W, cv.height).data;
    const cells = [];
    for (let r = 0; r < rows + 1; r++)
      for (let c = 0; c < cols; c++) {
        let s = 0;
        for (let y = r * SC; y < (r + 1) * SC; y++)
          for (let x = c * SC; x < (c + 1) * SC; x++) s += d[(y * W + x) * 4 + 3];
        s /= SC * SC * 255;
        const a = aa ? (s >= 0.5 ? 1 : s >= 0.28 ? 0.75 : s >= 0.14 ? 0.4 : 0) : s >= 0.38 ? 1 : 0;
        if (a) cells.push([c, r, a]);
      }
    const out = { w: cols, h: rows + 1, base: rows + 1, cells };
    memo.set(key, out);
    return out;
  }

  /** The shared figure (MC.AVATAR, hood up) as LED cells in a box `cols` x `rows` (200:240): its outline lit
      like a rim, the hood seam and hem at half light, the body a faint glow, so it never reads as a solid bust. */
  function avatarCells(cols, rows) {
    const key = "av|" + cols + "|" + rows;
    if (memo.has(key)) return memo.get(key);
    const A = MC.AVATAR;
    const g = ctx();
    const W = cols * SC;
    const H = rows * SC;
    const kx = W / 200;
    const ky = H / 240;
    const layer = (draw) => {
      cv.width = W;
      cv.height = H;
      g.setTransform(kx, 0, 0, ky, 0, 0);
      g.fillStyle = g.strokeStyle = "#000";
      g.lineJoin = g.lineCap = "round";
      draw();
      g.setTransform(1, 0, 0, 1, 0, 0);
      return g.getImageData(0, 0, W, H).data;
    };
    const body = layer(() => {
      g.fill(new Path2D(A.torso));
      g.fill(new Path2D(A.hood));
    });
    const seam = layer(() => {
      g.lineWidth = (SC * 0.9) / kx;
      [A.hoodSeam, A.hoodRim, A.seam].forEach((d) => g.stroke(new Path2D(d)));
    });
    const cov = (d, c, r) => {
      let s = 0;
      for (let y = r * SC; y < (r + 1) * SC; y++)
        for (let x = c * SC; x < (c + 1) * SC; x++) s += d[(y * W + x) * 4 + 3];
      return s / (SC * SC * 255);
    };
    const inn = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) inn[r * cols + c] = cov(body, c, r) >= 0.45 ? 1 : 0;
    const at = (c, r) => (r >= rows ? 1 : c < 0 || c >= cols || r < 0 ? 0 : inn[r * cols + c]);
    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (!at(c, r)) continue;
        const edge = !at(c - 1, r) || !at(c + 1, r) || !at(c, r - 1) || !at(c, r + 1);
        cells.push([c, r, edge ? 0.85 : cov(seam, c, r) >= 0.3 ? 0.45 : 0.13]);
      }
    const out = { w: cols, h: rows, base: rows, cells };
    memo.set(key, out);
    return out;
  }

  /* ---------- LED faces: a grid of cells, grouped by role (lit, lamp) and by colour ---------- */
  const Face = (cols, rows) => ({ cols, rows, groups: new Map() });
  function put(F, g, c0, r0, colour, a, cls) {
    let grp = F.groups.get(cls);
    if (!grp) F.groups.set(cls, (grp = new Map()));
    for (const [c, r, lv] of g.cells) {
      const C = c0 + c;
      const R = r0 + r;
      if (C < 0 || R < 0 || C >= F.cols || R >= F.rows) continue;
      const k = colour + "|" + f(lv * a);
      let set = grp.get(k);
      if (!set) grp.set(k, (set = new Set()));
      set.add(R * F.cols + C);
    }
  }
  /** Lays glyphs on one baseline row. align: start (x = first col), end (x = last col), center. */
  function line(F, segs, x, base, align) {
    const gap = (sg, i) => (i < segs.length - 1 ? (sg.gap != null ? sg.gap : 3) : 0);
    const W = segs.reduce((s, sg, i) => s + sg.g.w + gap(sg, i), 0);
    let c = align === "end" ? x - W + 1 : align === "center" ? Math.round(x - W / 2) : x;
    const c0 = c;
    segs.forEach((sg, i) => {
      put(F, sg.g, c, base - sg.g.base, sg.c, sg.a != null ? sg.a : 1, sg.cls || "lit");
      c += sg.g.w + gap(sg, i);
    });
    return { c0, W };
  }
  function block(F, c0, r0, w, h, colour, a, cls) {
    const cells = [];
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) cells.push([i, j, 1]);
    put(F, { cells }, c0, r0, colour, a, cls || "lit");
  }
  /** Cells to one SVG path of squares (horizontal runs merged). */
  function cellsPath(cols, set, X, Y, P) {
    const rows = new Map();
    for (const i of set) {
      const r = Math.floor(i / cols);
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r).push(i % cols);
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
  /** Draws a face: the field of unlit LEDs, then each lit colour as round dots (and as solid cells for small sizes). */
  function ledRender(u, L, F, extra = {}, solidOnly = false) {
    const { P, X, Y } = L;
    const dotR = L.dotR || 0.46;
    const core = L.core || 0.34;
    const rimStop = L.rimStop || 0.78;
    const rimOp = L.rimOp || 0.35;
    const W = f(F.cols * P);
    const H = f(F.rows * P);
    let defs = "";
    let html = "";
    if (!solidOnly) {
      defs += `<pattern id="${u}-ul" width="${P}" height="${P}" patternUnits="userSpaceOnUse" x="${X}" y="${Y}"><circle cx="${P / 2}" cy="${P / 2}" r="${f(P * 0.34)}" fill="${K.unlit}"/></pattern>`;
      html += `<rect class="c09-unlit" x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#${u}-ul)"/>`;
    }
    const pats = new Map();
    let n = 0;
    const done = new Set();
    F.groups.forEach((grp, cls) => {
      let g = "";
      grp.forEach((set, key) => {
        if (!set.size) return;
        const [colour, a] = key.split("|");
        const d = cellsPath(F.cols, set, X, Y, P);
        const op = +a < 1 ? ` opacity="${a}"` : "";
        if (!solidOnly) {
          if (!pats.has(colour)) {
            const i = pats.size;
            pats.set(colour, i);
            defs +=
              `<radialGradient id="${u}-r${i}"><stop offset="0" stop-color="#fff" stop-opacity="${L.coreOp || 0.9}"/><stop offset="${core}" stop-color="${colour}"/><stop offset="${rimStop}" stop-color="${colour}"/><stop offset="1" stop-color="${colour}" stop-opacity="${rimOp}"/></radialGradient>` +
              `<pattern id="${u}-p${i}" width="${P}" height="${P}" patternUnits="userSpaceOnUse" x="${X}" y="${Y}"><circle cx="${P / 2}" cy="${P / 2}" r="${f(P * dotR)}" fill="url(#${u}-r${i})"/></pattern>`;
          }
          const cid = `${u}-c${n++}`;
          defs += `<clipPath id="${cid}"><path d="${d}"/></clipPath>`;
          g += `<rect class="c09-dots" x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#${u}-p${pats.get(colour)})" clip-path="url(#${cid})"${op}/>`;
        }
        g += `<path class="c09-solid" d="${d}" fill="${colour}"${op}/>`;
      });
      html += `<g class="c09-${cls}">${g}${extra[cls] || ""}</g>`;
      done.add(cls);
    });
    Object.keys(extra).forEach((cls) => {
      if (!done.has(cls) && extra[cls]) html += `<g class="c09-${cls}">${extra[cls]}</g>`;
    });
    return { defs, html };
  }

  /* LED geometry. PRO runs the founder lamp's own 3u pitch: a 4u grid cannot hold the four-stat line.
     nameRows: the Latin name's cap height in cells; nameAr / arEm: the Arabic name's baseline row and em in cells. */
  const LEDT = {
    PRO: {
      P: 3,
      X: 13,
      Y: 17,
      cols: 98,
      rows: 50,
      m: 2,
      name: 9,
      nameRows: 7,
      nameAr: 10,
      arEm: 11,
      big: 36,
      stat: 46,
      bigRows: 20,
    },
    /* the full matrix: fatter dots with a larger white core, so its light is the brightest of the LED tiers */
    CHAMPION: {
      P: 2,
      X: 12,
      Y: 17,
      cols: 148,
      rows: 75,
      m: 4,
      name: 14,
      nameRows: 11,
      nameAr: 14,
      arEm: 15,
      big: 55,
      stat: 69,
      bigRows: 30,
      dotR: 0.55,
      core: 0.45,
      coreOp: 1,
      rimStop: 0.86,
      rimOp: 0.8,
    },
    /* the share: 3.4u dots (10.7px at export), the 84 on 36 rows (20% of the story), the stats on the stand's ribbon board */
    SHARE: {
      P: 3.4,
      X: 12.1,
      Y: 17,
      cols: 87,
      rows: 44,
      m: 2,
      name: 7,
      nameRows: 7,
      nameAr: 7,
      arEm: 10,
      big: 44,
      stat: 0,
      bigRows: 36,
    },
  };
  const xOf = (L, col) => L.X + col * L.P;
  const yOf = (L, row) => L.Y + row * L.P;
  const rowsFor = (n, rows) => (String(n).length > 2 ? Math.round(rows * 0.82) : rows);
  /** The board's type for a tier: PRO speaks the 5x7 board font; CHAMPION's full matrix samples Changa with grey levels. */
  function TX(kind, aa) {
    if (aa)
      return {
        name: (t) => sample(t, "800", "Changa", LEDT[kind].nameRows, { aa: true }),
        nameAr: (t) => sample(t, "800", "Changa", 0, { aa: true, em: LEDT[kind].arEm }),
        tier: (t) => sample(t, "600", "Changa", kind === "SHARE" ? 6 : 8, { aa: true }),
        small: (t) => sample(t, "600", "Changa", 6, { aa: true, sx: 0.94 }),
        unit: (t) => sample(t, "600", "Changa", kind === "SHARE" ? 6 : 8, { aa: true }),
        lamp: (t) => sample(t, "700", "Changa", kind === "SHARE" ? 6 : 8, { aa: true, ref: "2" }),
        val: (t) => sample(t, "700", "Changa", 10, { aa: true, ref: "8", over: 0 }),
        big: (n) =>
          sample(n, "800", "Changa", rowsFor(n, LEDT[kind].bigRows), {
            aa: true,
            ref: "8",
            over: 0,
            sx: 0.92,
          }),
        sp: 3,
        grp: 9,
        lampGap: 4,
        unitGap: 5,
      };
    return {
      name: (t) => sample(t, "800", "Changa", LEDT[kind].nameRows, { thr: 0.42 }),
      nameAr: (t) => sample(t, "800", "Changa", 0, { em: LEDT[kind].arEm, thr: 0.34 }),
      tier: (t) => bit(t, G57),
      small: (t) => bit(t, F35),
      unit: (t) => (kind === "SHARE" ? bit(t, G57) : bit(t, F35)),
      lamp: (t) => bit(t, F35),
      val: (t) => bit(t, G57, true),
      big: (n) =>
        sample(n, "800", "Changa", rowsFor(n, LEDT[kind].bigRows), { ref: "8", over: 0, sx: 0.9 }),
      sp: 2,
      grp: 4,
      lampGap: 3,
      unitGap: 3,
    };
  }
  /** Solid Handjet (Arabic on the LED tiers), thickened by a same-colour stroke. */
  function hj(x, y, t, size, anchor, op = 1, fill = K.warm) {
    const o = op < 1 ? ` fill-opacity="${op}" stroke-opacity="${op}"` : "";
    return `<text x="${f(x)}" y="${f(y)}" font-family="Handjet" font-size="${f(size)}" text-anchor="${anchor}" fill="${fill}" stroke="${fill}" stroke-width="${f(size * 0.035)}" stroke-linejoin="round" paint-order="stroke"${o}>${esc(t)}</text>`;
  }

  /** The front: row A identity, row B the 84 with its unit inline, row C all four stats on one fixed line. */
  function ledFront(p, o, kind, aa) {
    const L = LEDT[kind];
    const T = TX(kind, aa);
    const F = Face(L.cols, L.rows);
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const extra = { lit: "", lamp: "" };
    const endC = L.cols - 1 - L.m;
    const mid = Math.round((L.cols - 1) / 2);
    const yr = yearOf(p);
    const nm = MC.nameOf(p, o);
    if (!ar) {
      const r = line(F, [{ g: T.name(nm), c: K.warm }], L.m, L.name, "start");
      if (yr)
        line(
          F,
          [{ g: T.lamp("·" + yr), c: K.tung, cls: "lamp" }],
          r.c0 + r.W + T.lampGap,
          L.name,
          "start",
        );
      line(F, [{ g: T.tier(S.tiers[p.tier]), c: K.warm }], endC, L.name, "end");
    } else {
      const r = line(F, [{ g: T.nameAr(nm), c: K.warm }], endC, L.nameAr, "end");
      if (yr)
        line(
          F,
          [{ g: T.lamp(yr + "·"), c: K.tung, cls: "lamp" }],
          r.c0 - T.lampGap - 1,
          L.nameAr,
          "end",
        );
      extra.lit += hj(
        xOf(L, L.m),
        yOf(L, L.nameAr),
        S.tiers[p.tier],
        kind === "SHARE" ? 21 : 21,
        "start",
      );
    }
    line(
      F,
      [
        { g: T.big(String(p.ovr)), c: K.warm, gap: T.unitGap },
        { g: T.unit(S.ovr), c: K.warm, a: 0.62 },
      ],
      mid,
      L.big,
      "center",
    );
    if (L.stat) {
      if (!ar) {
        const segs = [];
        MC.STATS.forEach((k) => {
          segs.push({ g: T.small(S.stats[k]), c: K.warm, a: 0.55, gap: T.sp });
          segs.push({ g: T.small(String(p.stats[k])), c: K.warm, gap: T.grp });
        });
        line(F, segs, mid, L.stat, "center");
      } else
        extra.lit += statsText(p, o, {
          cx: 160,
          y: yOf(L, L.stat),
          size: 16.5,
          family: "Handjet",
          weight: 400,
          fill: K.warm,
          labOp: 0.6,
          maxW: 278,
          handjet: true,
        });
    }
    return { F, extra };
  }

  /** The back: a four-row stat column and the season record at the start; the shared figure, hood up and
      cropped by the bezel, in the end half with a small club crest; the sample is labelled. */
  function ledBack(p, o, kind, aa) {
    const L = LEDT[kind];
    const T = TX(kind, aa);
    const F = Face(L.cols, L.rows);
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const extra = { lit: "" };
    const champ = kind === "CHAMPION";
    const lineH = champ ? 13 : 9;
    const first = champ ? 12 : 8;
    const colW = champ ? 58 : 40;
    MC.STATS.forEach((k, i) => {
      const base = first + i * lineH;
      const val = T.val(String(p.stats[k]));
      if (!ar) {
        line(F, [{ g: T.small(S.stats[k]), c: K.warm, a: 0.55 }], L.m, base, "start");
        line(F, [{ g: val, c: K.warm }], L.m + colW, base, "end");
      } else {
        extra.lit += hj(xOf(L, L.cols - L.m), yOf(L, base), S.stats[k], 16, "end", 0.6);
        line(F, [{ g: val, c: K.warm }], L.cols - 1 - L.m - colW, base, "start");
      }
    });
    /* the figure: off-centre in the end half, its hood lit at the rim, cut by the bezel at the bottom and the end */
    const aw = champ ? 60 : 35;
    const ah = (aw * 6) / 5;
    const aTop = champ ? 12 : 11;
    const ax = ar ? (champ ? -6 : -4) : L.cols - aw + (champ ? 6 : 4);
    put(F, avatarCells(aw, ah), ax, aTop, K.warm, 1, "lit");
    const crest = crestCells(champ ? 21 : 14, aa);
    line(
      F,
      [{ g: crest, c: K.warm, a: 0.8 }],
      ar ? L.m : L.cols - 1 - L.m,
      champ ? 23 : 16,
      ar ? "start" : "end",
    );
    /* season record: thirty gameweeks, the sample's first seven lit, labelled above */
    const recBase = L.rows - (champ ? 3 : 1);
    const mh = champ ? 7 : 5;
    for (let i = 0; i < 30; i++) {
      const c0 = ar ? L.cols - L.m - (i + 1) * 2 + 1 : L.m + i * 2;
      block(F, c0, recBase - mh, 1, mh, K.warm, i < 7 ? 1 : 0.16);
    }
    const exBase = recBase - mh - (champ ? 4 : 2);
    if (!ar) line(F, [{ g: T.small("EXEMPLE"), c: K.warm, a: 0.3 }], L.m, exBase, "start");
    else extra.lit += hj(xOf(L, L.cols - L.m), yOf(L, exBase), "مثال", 15, "end", 0.5);
    return { F, extra };
  }

  /** Four stats on one line, in any face (Arabic order reads from the right). */
  function statsText(p, o, c) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const wt = c.weight || 600;
    const build = (size) => {
      const lv = size * 0.32;
      const gg = size * 1.05;
      const groups = (c.keys || MC.STATS)
        .map((k) => ({ lab: S.stats[k], val: String(p.stats[k]) }))
        .map((g) => ({
          ...g,
          lw: textW(g.lab, size, wt, c.family),
          vw: textW(g.val, size, c.valWeight || wt, c.family),
        }));
      const W = groups.reduce(
        (s, g, i) => s + g.lw + lv + g.vw + (i < groups.length - 1 ? gg : 0),
        0,
      );
      return { groups, W, lv, gg };
    };
    let size = c.size;
    let m = build(size);
    if (m.W > c.maxW) {
      size = (size * c.maxW) / m.W;
      m = build(size);
    }
    let x = c.cx - m.W / 2;
    const seq = ar ? [...m.groups].reverse() : m.groups;
    const t = (xx, s, op, w) =>
      c.handjet
        ? hj(xx, c.y, s, size, "start", op, c.fill)
        : `<text x="${f(xx)}" y="${f(c.y)}" font-family="${c.family}" font-weight="${w}" font-size="${f(size)}" fill="${c.fill}"${op < 1 ? ` fill-opacity="${op}"` : ""}>${esc(s)}</text>`;
    let s = "";
    seq.forEach((g, i) => {
      if (!ar) {
        s += t(x, g.lab, c.labOp, wt);
        x += g.lw + m.lv;
        s += t(x, g.val, c.valOp || 1, c.valWeight || wt);
        x += g.vw;
      } else {
        s += t(x, g.val, c.valOp || 1, c.valWeight || wt);
        x += g.vw + m.lv;
        s += t(x, g.lab, c.labOp, wt);
        x += g.lw;
      }
      if (i < seq.length - 1) x += m.gg;
    });
    return s;
  }

  /* ---------- shared drawing ---------- */
  const lg = (id, stops, attrs = 'x1="0" y1="0" x2="0" y2="1"') =>
    `<linearGradient id="${id}" ${attrs}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`).join("")}</linearGradient>`;
  const CYL = [
    [0, "#000", 0.55],
    [0.2, "#fff", 0.08],
    [0.36, "#fff", 0.32],
    [0.5, "#fff", 0.06],
    [0.78, "#000", 0.14],
    [1, "#000", 0.6],
  ];
  function commonDefs(u) {
    return (
      lg(`${u}-cyl`, CYL, H_) +
      `<pattern id="${u}-kn" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><rect width="2.4" height="2.4" fill="${K.steel}"/><path d="M0 0L2.4 2.4M2.4 0L0 2.4" stroke="${K.knurl}" stroke-width=".55"/></pattern>` +
      lg(`${u}-band`, [
        [0, "#FFFFFF"],
        [0.5, K.band],
        [1, "#AEB6BF"],
      ]) +
      lg(`${u}-pol`, [
        [0, "#F4F6F8"],
        [0.5, "#B7BFC8"],
        [1, "#7E8791"],
      ]) +
      lg(
        `${u}-tiv`,
        [
          [0, "#5F6873"],
          [0.3, "#B7BFC8"],
          [0.55, "#8D96A0"],
          [1, "#5A636E"],
        ],
        H_,
      )
    );
  }
  /** An engraved line: a dark cut over a light lip. Digits keep Manrope inside Arabic lines. */
  function engrave(x, y, txt, opt = {}) {
    const ar = isArabic(txt);
    const fam = `Manrope, 'Noto Sans Arabic', sans-serif`;
    const ls = !ar && opt.ls ? ` letter-spacing="${opt.ls}"` : "";
    const a = ` text-anchor="${opt.anchor || "start"}"`;
    const d = ar ? ' direction="rtl"' : "";
    const fs = opt.size || 7.5;
    const w = opt.w || 700;
    const lip = opt.lip == null ? 0.55 : opt.lip;
    return (
      (lip
        ? `<text x="${f(x)}" y="${f(y + 0.5)}" font-family="${fam}" font-weight="${w}" font-size="${fs}"${a}${ls}${d} fill="${opt.lipC || "#fff"}" fill-opacity="${lip}">${esc(txt)}</text>`
        : "") +
      `<text x="${f(x)}" y="${f(y)}" font-family="${fam}" font-weight="${w}" font-size="${fs}"${a}${ls}${d} fill="${opt.ink || K.engrave}"${opt.op ? ` fill-opacity="${opt.op}"` : ""}>${esc(txt)}</text>`
    );
  }
  const idLine = (p, o) => {
    const S = MC.s(o);
    return (MC.isAr(o) ? [S.country, p.season, p.id] : [p.id, p.season, S.country]).join("  ·  ");
  };

  /* ---------- the paddle: club-colour grip with one rib per tier step, the collar, your hand ---------- */
  function gripSVG(u, p, tier, y0) {
    const LG = tier === "LEGEND";
    const club = clubOf(p);
    const gTop = LG ? 240 : 196;
    const end = LG ? 330 : 300;
    const d = `M146 ${gTop}V${end - 8}a14 8 0 0 0 28 0V${gTop}Z`;
    let s = "";
    if (LG)
      s +=
        `<rect x="149.5" y="190" width="21" height="52" fill="url(#${u}-tiv)"/>` +
        `<path d="M152 192V240" stroke="#fff" stroke-opacity=".45" stroke-width=".8"/>` +
        `<rect class="c09-rim" x="149.5" y="190" width="21" height="52" fill="none" stroke-width=".8"/>`;
    s += `<path d="${d}" fill="${club.primary}"/><path d="${d}" fill="url(#${u}-cyl)"/>`;
    const n = TIERS.indexOf(tier);
    const fb = y0 + 50;
    const step = n ? Math.min(7, (end - 8 - fb - 4) / n) : 0;
    for (let i = 0; i < n; i++) {
      const y = f(fb + 3 + i * step);
      s += `<rect x="144.6" y="${y}" width="30.8" height="3.2" rx="1.6" fill="${club.secondary}"/><rect x="144.6" y="${y}" width="30.8" height="3.2" rx="1.6" fill="url(#${u}-cyl)"/>`;
    }
    s += `<path class="c09-rim" d="${d}" fill="none" stroke-width=".8"/>`;
    if (LG)
      s += `<rect x="145" y="235" width="30" height="7" rx="1.4" fill="url(#${u}-pol)"/><rect x="145" y="235" width="30" height="7" rx="1.4" fill="url(#${u}-cyl)"/>`;
    return s;
  }
  /** Founders: a knurled steel collar, 40u against the 28u grip, so the outline itself changes. */
  function collarSVG(u, p, o, thumb) {
    const club = clubOf(p);
    if (!p.founder)
      return (
        `<rect x="146" y="180" width="28" height="22" fill="${club.primary}"/><rect x="146" y="180" width="28" height="22" fill="#000" opacity=".25"/>` +
        `<rect x="146" y="180" width="28" height="22" fill="url(#${u}-cyl)"/><path d="M146 201.5H174" stroke="#000" stroke-opacity=".4" stroke-width=".8"/>` +
        `<path class="c09-rim" d="M146 180V202M174 180V202" fill="none" stroke-width=".8"/>`
      );
    const S = MC.s(o);
    let s = `<g class="c09-collar"><rect x="140" y="180" width="40" height="22" fill="url(#${u}-kn)"/><rect x="140" y="185" width="40" height="12" fill="url(#${u}-band)"/>`;
    if (!thumb) {
      const fam = `Manrope, 'Noto Sans Arabic', sans-serif`;
      s +=
        `<clipPath id="${u}-cc"><rect x="140" y="185" width="40" height="12"/></clipPath><g clip-path="url(#${u}-cc)">` +
        engrave(160, 194.6, yearOf(p), { size: 10.5, w: 800, anchor: "middle", lip: 0.7 }) +
        `<text x="152.2" y="192.8" font-family="${fam}" font-weight="800" font-size="3.1" text-anchor="end" fill="${K.engrave}" fill-opacity=".7">${esc(S.founder)}</text>` +
        `<text x="167.8" y="192.8" font-family="${fam}" font-weight="800" font-size="3.1" fill="${K.engrave}" fill-opacity=".7">${esc(p.id)}</text>` +
        `</g>`;
    }
    s +=
      `<rect x="140" y="180" width="40" height="22" fill="url(#${u}-cyl)"/>` +
      `<path d="M140 185H180M140 197H180" stroke="#2E353D" stroke-width=".5"/>` +
      `<rect class="c09-rim" x="140" y="180" width="40" height="22" fill="none" stroke-width=".8"/></g>`;
    return s;
  }
  /** A sleeve as a tapered tube from the wrist (c0) out of frame (c1): ribbed cuff, a zip along the top. */
  function sleeveSVG(u, c0, c1, w0, w1) {
    const dx = c1[0] - c0[0];
    const dy = c1[1] - c0[1];
    const len = Math.hypot(dx, dy);
    const d = [dx / len, dy / len];
    const n = [d[1], -d[0]];
    const at = (c, a) => [c[0] + d[0] * a, c[1] + d[1] * a];
    const side = (c, t, w) => [c[0] + n[0] * w * t, c[1] + n[1] * w * t];
    const pt = (q) => `${f(q[0])} ${f(q[1])}`;
    const U0 = side(c0, 1, w0);
    const D0 = side(c0, -1, w0);
    const U1 = side(c1, 1, w1);
    const D1 = side(c1, -1, w1);
    const tip = at(c0, -5);
    const body = `M${pt(U0)}L${pt(U1)}L${pt(D1)}L${pt(D0)}Q${pt(tip)} ${pt(U0)}Z`;
    const wAt = (a) => w0 + ((w1 - w0) * a) / len;
    let knit = "";
    for (let a = 1.4; a < 12; a += 1.6) {
      const c = at(c0, a);
      knit += `M${pt(side(c, 0.97, wAt(a)))}L${pt(side(c, -0.97, wAt(a)))}`;
    }
    const seam = at(c0, 12.6);
    const zA = at(c0, 13);
    const zip = `M${pt(side(zA, 0.5, wAt(13)))}L${pt(side(c1, 0.5, w1))}`;
    const pull = side(at(c0, 18), 0.5, wAt(18));
    return (
      `<linearGradient id="${u}-sl" gradientUnits="userSpaceOnUse" x1="${f(U0[0])}" y1="${f(U0[1])}" x2="${f(D0[0])}" y2="${f(D0[1])}"><stop offset="0" stop-color="#4C525A"/><stop offset=".28" stop-color="${K.cuff}"/><stop offset="1" stop-color="#17191C"/></linearGradient>` +
      `<path d="${body}" fill="url(#${u}-sl)"/>` +
      `<path d="${knit}" stroke="#15171A" stroke-width=".7" opacity=".85"/>` +
      `<path d="M${pt(side(seam, 1, wAt(12.6)))}L${pt(side(seam, -1, wAt(12.6)))}" stroke="#4A5058" stroke-width="1"/>` +
      `<path d="${zip}" stroke="#9AA3AD" stroke-width="1" stroke-dasharray="1 .7"/>` +
      `<circle cx="${f(pull[0])}" cy="${f(pull[1])}" r="1.6" fill="#C3CAD2"/>` +
      `<path class="c09-cuffrim" d="${body}" fill="none" stroke-width="1"/>`
    );
  }
  /** Your own fist on the grip: four finger rolls, the thumb over the top, the bench-jacket cuff leaving the frame. */
  function handSVG(u, y0, opt = {}) {
    let s =
      lg(`${u}-sk`, [
        [0, K.skinLt],
        [0.42, K.skin],
        [1, K.skinDk],
      ]) +
      lg(
        `${u}-pm`,
        [
          [0, K.skin],
          [1, K.skinDk],
        ],
        H_,
      ) +
      lg(`${u}-ao`, [
        [0, "#000", 0.45],
        [1, "#000", 0],
      ]);
    s += `<rect x="146" y="${y0 + 47}" width="28" height="9" fill="url(#${u}-ao)"/>`;
    s += `<path d="M164 ${y0 + 3}C180 ${y0 - 2} 195 ${y0 + 5} 198 ${y0 + 20}L201 ${y0 + 42}C202 ${y0 + 54} 194 ${y0 + 62} 182 ${y0 + 64}L166 ${y0 + 58}Z" fill="url(#${u}-pm)"/>`;
    for (let i = 3; i >= 0; i--) {
      const t = y0 + 1 + i * 11.4;
      const h = i === 3 ? 10.4 : 12;
      const x0 = i === 3 ? 143 : i === 0 ? 140.5 : 139.5;
      const x1 = 190 - i * 1.5;
      s +=
        `<rect x="${x0}" y="${f(t)}" width="${f(x1 - x0)}" height="${h}" rx="${h / 2}" fill="url(#${u}-sk)"/>` +
        `<path d="M${x0 + 4} ${f(t + h - 0.5)}H${f(x1 - 5)}" stroke="${K.skinDk}" stroke-width=".9" opacity=".75"/>` +
        `<ellipse cx="${f(x1 - 9)}" cy="${f(t + 3.4)}" rx="4.2" ry="1.5" fill="#fff" opacity=".18"/>`;
    }
    s +=
      `<g transform="rotate(-6 170 ${y0})">` +
      `<rect x="146" y="${y0 - 6}" width="46" height="11" rx="5.5" fill="url(#${u}-sk)"/>` +
      `<ellipse cx="152.6" cy="${y0 - 2.6}" rx="4" ry="2.4" fill="#fff" opacity=".24"/>` +
      `<path d="M151 ${y0 + 4.5}H186" stroke="${K.skinDk}" stroke-width=".8" opacity=".6"/></g>`;
    if (!opt.noSleeve) s += sleeveSVG(u, [190, y0 + 62], [268, y0 + 146], 13, 19);
    return s;
  }

  /* ---------- frames ---------- */
  const bezel = (tier) => (tier === "LEGEND" ? 3 : tier === "HOMA" ? 8 : 12);
  function frameSVG(u, tier, thumb) {
    const B = bezel(tier);
    const stops = {
      HOMA: [
        [0, "#DDE2E6"],
        [0.05, "#BCC3CA"],
        [0.5, "#B2BAC2"],
        [0.95, "#A3ABB4"],
        [1, "#8C959F"],
      ],
      STADE: [
        [0, "#C3CAD2"],
        [0.04, "#E6EAEE"],
        [0.09, "#B9C1CA"],
        [0.5, "#A9B1BA"],
        [0.92, "#9AA3AD"],
        [0.97, "#C3CAD2"],
        [1, "#8D959F"],
      ],
      CHAMPION: [
        [0, "#F7F9FB"],
        [0.16, "#C9D0D7"],
        [0.3, "#6E7782"],
        [0.335, "#F2F5F8"],
        [0.5, "#AEB6BF"],
        [0.66, "#5F6873"],
        [0.7, "#E6EBF0"],
        [0.86, "#B7BFC8"],
        [1, "#7E8791"],
      ],
      LEGEND: [
        [0, "#F4F6F8"],
        [0.02, "#B7BFC8"],
        [0.5, K.ti],
        [0.98, "#5F6873"],
        [1, "#3A424C"],
      ],
    };
    const st = stops[tier] || stops.STADE;
    const attrs = tier === "CHAMPION" ? 'x1="0" y1="0" x2=".32" y2="1"' : undefined;
    let s = lg(`${u}-fr`, st, attrs) + `<rect width="320" height="180" fill="url(#${u}-fr)"/>`;
    if (!thumb && (tier === "PRO" || tier === "STADE"))
      s += `<pattern id="${u}-ms" width="6" height="1.6" patternUnits="userSpaceOnUse"><rect width="6" height=".7" fill="#fff" opacity=".06"/><rect y=".8" width="6" height=".4" fill="#000" opacity=".04"/></pattern><rect width="320" height="180" fill="url(#${u}-ms)"/>`;
    if (!thumb && tier === "HOMA")
      s += `<pattern id="${u}-zn" width="9" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><rect width="4.6" height="3.4" fill="#fff" opacity=".07"/><rect x="4.6" y="3.4" width="4.4" height="3.6" fill="#000" opacity=".04"/></pattern><rect width="320" height="180" fill="url(#${u}-zn)"/>`;
    const ch = tier === "LEGEND" ? 1.1 : tier === "HOMA" ? 1.2 : 2.4;
    const cham =
      tier === "CHAMPION"
        ? ["#1A1F25", "#FFFFFF", "#3C444E", "#E9EDF1"]
        : tier === "LEGEND"
          ? ["#3A424C", "#F2F5F8", "#4A535D", "#D0D6DC"]
          : tier === "HOMA"
            ? ["#6E7782", "#E6EAEE", "#7E8791", "#D0D6DC"]
            : ["#5F6873", "#F2F5F8", "#8D959F", "#C3CAD2"];
    const a = B - ch;
    const b = 320 - B + ch;
    const c = 180 - B + ch;
    s +=
      `<path d="M${a} ${a}H${b}L${320 - B} ${B}H${B}Z" fill="${cham[0]}"/>` +
      `<path d="M${a} ${c}H${b}L${320 - B} ${180 - B}H${B}Z" fill="${cham[1]}"/>` +
      `<path d="M${a} ${a}L${B} ${B}V${180 - B}L${a} ${c}Z" fill="${cham[2]}"/>` +
      `<path d="M${b} ${a}L${320 - B} ${B}V${180 - B}L${b} ${c}Z" fill="${cham[3]}"/>` +
      `<path d="M.6 .6H319.4" stroke="#fff" stroke-opacity=".8" stroke-width="1"/>` +
      `<path d="M.6 179.4H319.4" stroke="#000" stroke-opacity=".3" stroke-width="1"/>`;
    if (tier === "CHAMPION")
      s +=
        `<path d="M2 180H318L316 185H4Z" fill="#3E4650"/><path d="M2 180H318L317 182.2H3Z" fill="#9AA3AD"/><path d="M4 184.6H316" stroke="#000" stroke-opacity=".4" stroke-width=".6"/>` +
        `<path class="c09-edge" d="M2 180H318L316 185H4Z" fill="none" stroke-width=".6"/>` +
        `<rect x="1.3" y="1.3" width="317.4" height="177.4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".8"/>`;
    if (tier === "HOMA")
      [
        [4, 4],
        [316, 4],
        [4, 176],
        [316, 176],
      ].forEach(
        ([x, y]) =>
          (s += `<circle cx="${x}" cy="${y}" r="2.1" fill="url(#${u}-pol)"/><circle cx="${x}" cy="${y}" r="2.1" fill="none" stroke="#6E7782" stroke-width=".5"/>`),
      );
    s += `<rect class="c09-edge" x=".4" y=".4" width="319.2" height="179.2" fill="none" stroke-width=".8"/>`;
    return s;
  }
  /** The logo printed on the top rail, unmodified, and the ID line engraved into the bottom rail. */
  function railsSVG(p, o, tier, thumb) {
    if (thumb || tier === "LEGEND") return "";
    const B = bezel(tier);
    let s = "";
    if (tier !== "HOMA") {
      const h = B === 12 ? 6.2 : 4.6;
      const w = h * MC.LOGO_RATIO.wordmark;
      s += `<g transform="translate(${f(160 - w / 2)} ${f((B - h) / 2)})">${MC.logo("wordmark", { variant: "color", w: f(w), h: f(h), label: false })}</g>`;
    }
    if (tier !== "LEGEND")
      s += engrave(160, f(180 - B / 2 + (B === 12 ? 2.7 : 2)), idLine(p, o), {
        size: B === 12 ? 7.5 : 5.6,
        w: B === 12 ? 700 : 800,
        anchor: "middle",
        ls: ".3",
      });
    return s;
  }
  /** Black acrylic: one 4% diagonal band and a faint top sheen. */
  function glassSVG(u, x0, y0, w, h) {
    return (
      lg(`${u}-sh`, [
        [0, "#fff", 0.06],
        [1, "#fff", 0],
      ]) +
      `<rect x="${x0}" y="${y0}" width="${w}" height="${f(h * 0.24)}" fill="url(#${u}-sh)"/>` +
      `<path d="M${f(x0 + w * 0.54)} ${y0}H${f(x0 + w * 0.7)}L${f(x0 + w * 0.38)} ${y0 + h}H${f(x0 + w * 0.22)}Z" fill="#fff" opacity=".04"/>` +
      `<rect x="${x0}" y="${y0}" width="${w}" height="1.2" fill="#000" opacity=".55"/>`
    );
  }
  const onStrip = (x, y, w) =>
    `<rect class="c09-on" x="${x}" y="${y}" width="${w}" height="2" fill="${K.cyan}"/>`;

  /* ---------- vector rows (painted, printed or lit as continuous light) ---------- */
  function nameRow(p, o, c) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const nm = MC.nameOf(p, o);
    const yr = yearOf(p);
    const nw = textW(nm, c.size, 800, "Changa");
    const tierT = S.tiers[p.tier];
    const lsT = ar || !c.tierLs ? "" : ` letter-spacing="${c.tierLs}"`;
    const tOp = c.tierOp && c.tierOp < 1 ? ` fill-opacity="${c.tierOp}"` : "";
    const ys = f(c.size * 0.58);
    let lit = "";
    let lamp = "";
    const out = () => {
      if (!c.shade) return { lit, lamp };
      /* the sign-writer's drop shade: the same letters in grey, a brush-width down and to the right */
      const sh = (str) =>
        `<g transform="translate(1.5 1.5)">${str.replace(/fill="[^"]+"/g, `fill="${c.shade}"`)}</g>`;
      return { lit: sh(lit) + lit, lamp: sh(lamp) + lamp };
    };
    if (!ar) {
      lit += `<text x="${c.x0}" y="${c.y}" font-family="Changa" font-weight="800" font-size="${c.size}" fill="${c.ink}">${esc(nm)}</text>`;
      if (yr)
        lamp += `<text x="${f(c.x0 + nw + c.size * 0.1)}" y="${c.y}" font-family="Changa" font-weight="800" font-size="${ys}" fill="${c.lamp}">·${yr}</text>`;
      lit += `<text x="${c.x1}" y="${c.y}" font-family="Changa" font-weight="${c.tierW || 700}" font-size="${c.tierSize}" text-anchor="end"${lsT} fill="${c.ink}"${tOp}>${esc(tierT)}</text>`;
    } else {
      lit += `<text x="${c.x1}" y="${c.y}" font-family="Changa" font-weight="800" font-size="${c.size}" text-anchor="end" fill="${c.ink}">${esc(nm)}</text>`;
      if (yr)
        lamp += `<text x="${f(c.x1 - nw - c.size * 0.1)}" y="${c.y}" font-family="Changa" font-weight="800" font-size="${ys}" text-anchor="end" fill="${c.lamp}">${yr}·</text>`;
      lit += `<text x="${c.x0}" y="${c.y}" font-family="Changa" font-weight="${c.tierW || 700}" font-size="${f(c.tierSize * 1.15)}" fill="${c.ink}"${tOp}>${esc(tierT)}</text>`;
    }
    return out();
  }
  function bigRow(p, o, c) {
    const S = MC.s(o);
    const n = String(p.ovr);
    const sz = n.length > 2 ? c.size * 0.82 : c.size;
    const w = textW(n, sz, 800, "Changa");
    const uw = textW(S.ovr, c.unitSize, 600, "Changa");
    const gap = c.unitSize * 0.3;
    const x = c.cx - (w + gap + uw) / 2;
    const t = (ink) =>
      `<text x="${f(x)}" y="${c.y}" font-family="Changa" font-weight="800" font-size="${f(sz)}" fill="${ink}">${n}</text>` +
      `<text x="${f(x + w + gap)}" y="${c.y}" font-family="Changa" font-weight="600" font-size="${c.unitSize}" fill="${ink}"${c.shade ? "" : ` fill-opacity="${c.unitOp}"`}>${esc(S.ovr)}</text>`;
    return c.shade ? `<g transform="translate(2.2 2.2)">${t(c.shade)}</g>` + t(c.ink) : t(c.ink);
  }
  /** The back of a painted, printed or glass board: stat column and season record at the start; the shared
      figure, hood up, rim-lit and cut by the bezel, in the end half with a small crest; the sample is labelled.
      c.fig: the figure's colours in this tier's medium; c.clip: the face it is cut by. */
  function vecBack(p, o, c) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    let s = "";
    MC.STATS.forEach((k, i) => {
      const y = f(c.y0 + 23 + i * 24);
      s += ar
        ? `<text x="${c.x1}" y="${y}" font-family="Changa" font-weight="700" font-size="16" text-anchor="end" fill="${c.ink}" fill-opacity="${c.labOp}">${esc(S.stats[k])}</text><text x="${c.x1 - 122}" y="${y}" font-family="Changa" font-weight="800" font-size="21" fill="${c.ink}">${p.stats[k]}</text>`
        : `<text x="${c.x0}" y="${y}" font-family="Changa" font-weight="700" font-size="16" letter-spacing="1" fill="${c.ink}" fill-opacity="${c.labOp}">${esc(S.stats[k])}</text><text x="${c.x0 + 112}" y="${y}" font-family="Changa" font-weight="800" font-size="21" text-anchor="end" fill="${c.ink}">${p.stats[k]}</text>`;
    });
    /* the figure, off-centre in the end half; it runs past the face and the bezel cuts it */
    const fw = 118;
    const fh = (fw * 6) / 5;
    const fx = ar ? c.cl.x - 12 : c.cl.x + c.cl.w - fw + 12;
    const fy = c.cl.y + c.cl.h + 4 - fh;
    s += `<clipPath id="${c.u}-fc"><rect x="${c.cl.x}" y="${c.cl.y}" width="${c.cl.w}" height="${c.cl.h}"/></clipPath>`;
    s += `<g clip-path="url(#${c.u}-fc)">${MC.avatar({ x: f(fx), y: f(fy), w: fw, h: f(fh), hood: true, ...c.fig })}</g>`;
    const cw = 24;
    s += `<g transform="translate(${ar ? c.x0 : c.x1 - cw} ${c.y0 + 6})" opacity=".85">${MC.crest({ mono: c.ink, w: cw, h: 29 })}</g>`;
    const ry = c.y1 - 24;
    const mw = 3;
    const mg = 2.2;
    for (let i = 0; i < 30; i++) {
      const x = ar ? c.x1 - (i + 1) * mw - i * mg : c.x0 + i * (mw + mg);
      s += `<rect x="${f(x)}" y="${ry}" width="${mw}" height="10" fill="${c.ink}" fill-opacity="${i < 7 ? 1 : 0.18}"/>`;
    }
    s += ar
      ? `<text x="${c.x1}" y="${ry - 7}" font-family="Changa" font-weight="600" font-size="11" text-anchor="end" fill="${c.ink}" fill-opacity=".55">مثال</text>`
      : `<text x="${c.x0}" y="${ry - 7}" font-family="Manrope" font-weight="700" font-size="8" letter-spacing=".8" fill="${c.ink}" fill-opacity=".55">EXEMPLE</text>`;
    return s;
  }

  /* ---------- tier bodies ---------- */
  /** PRO and CHAMPION: warm LEDs behind black acrylic. */
  function ledBoard(p, o, u, tier, side, thumb, opt) {
    const kind = opt.share ? "SHARE" : tier;
    const aa = tier === "CHAMPION";
    const L = LEDT[kind];
    const { F, extra } = side === "back" ? ledBack(p, o, tier, aa) : ledFront(p, o, kind, aa);
    const led = ledRender(u, L, F, extra, thumb);
    return (
      frameSVG(u, tier, thumb) +
      `<rect x="12" y="12" width="296" height="156" fill="${K.face}"/>` +
      `<defs>${led.defs}</defs>` +
      led.html +
      onStrip(14, 14, 292) +
      glassSVG(u, 12, 12, 296, 156) +
      railsSVG(p, o, tier, thumb)
    );
  }
  /** LEGEND: frameless dead-front smoked glass, edge to edge inside a 3u polished titanium lip.
      Everything on it is continuous light: a white-hot core, a tight bloom and a wide one. */
  function legendBoard(p, o, u, side, thumb, opt) {
    let s = frameSVG(u, "LEGEND", thumb);
    s +=
      lg(`${u}-gf`, [
        [0, "#08090B"],
        [0.5, K.glass],
        [1, "#010102"],
      ]) + `<rect x="3" y="3" width="314" height="174" fill="url(#${u}-gf)"/>`;
    s +=
      `<filter id="${u}-bl" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="180" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      `<filter id="${u}-bw" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="180" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="5.6"/></filter>`;
    s += `<radialGradient id="${u}-pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${K.warm}" stop-opacity=".17"/><stop offset=".6" stop-color="${K.warm}" stop-opacity=".05"/><stop offset="1" stop-color="${K.warm}" stop-opacity="0"/></radialGradient>`;
    if (side !== "back")
      s += `<ellipse cx="160" cy="${opt.share ? 112 : 100}" rx="156" ry="${opt.share ? 76 : 62}" fill="url(#${u}-pool)"/>`;
    if (side === "back") {
      s += vecBack(p, o, {
        u,
        x0: 22,
        x1: 298,
        y0: 10,
        y1: 172,
        ink: K.warm,
        labOp: 0.55,
        cl: { x: 3, y: 3, w: 314, h: 174 },
        fig: { torso: "#17191D", seam: "rgba(244,237,224,.36)", rim: K.warm },
      });
    } else {
      const nr = opt.share
        ? nameRow(p, o, {
            x0: 20,
            x1: 300,
            y: 36,
            size: 22,
            ink: K.light,
            lamp: K.tung,
            tierSize: 11,
            tierLs: 2.2,
            tierW: 600,
            tierOp: 0.72,
          })
        : nameRow(p, o, {
            x0: 20,
            x1: 300,
            y: 46,
            size: 28,
            ink: K.light,
            lamp: K.tung,
            tierSize: 13,
            tierLs: 2.4,
            tierW: 600,
            tierOp: 0.72,
          });
      const br = opt.share
        ? bigRow(p, o, {
            cx: 160,
            y: 168,
            size: f(121 / capOf("800", "Changa", "8")),
            unitSize: 22,
            unitOp: 0.72,
            ink: K.light,
          })
        : bigRow(p, o, { cx: 160, y: 131, size: 96, unitSize: 18, unitOp: 0.72, ink: K.light });
      const st = opt.share
        ? ""
        : statsText(p, o, {
            cx: 160,
            y: 159,
            size: 15,
            family: "Changa",
            weight: 600,
            valWeight: 700,
            fill: K.warm,
            labOp: 0.55,
            valOp: 0.95,
            maxW: 284,
          });
      /* the light: a wide warm halo under a tight bloom under the white-hot figures */
      const glow = (str, op) =>
        str
          .replace(/fill="[^"]+"/g, `fill="${K.warm}"`)
          .replace(/fill-opacity="[^"]+"/g, `fill-opacity="${op}"`);
      const bloom = thumb
        ? ""
        : `<g filter="url(#${u}-bw)" opacity=".35">${glow(nr.lit + br, 1)}</g><g filter="url(#${u}-bl)" opacity=".9">${glow(nr.lit + br, 1)}</g>`;
      s +=
        `<g class="c09-lit">${bloom}${nr.lit}${br}${st}</g>` +
        `<g class="c09-lamp">${thumb ? "" : `<g filter="url(#${u}-bl)" opacity=".8">${nr.lamp}</g>`}${nr.lamp}</g>`;
    }
    s += onStrip(5, 5, 310) + glassSVG(u, 3, 3, 314, 174);
    /* the logo is printed on the glass, as supplied (light), the only mark above the name */
    if (!thumb) {
      const w = 32;
      s += `<g transform="translate(${160 - w / 2} 10)">${MC.logo("wordmark", { variant: "light", w, h: f(w / MC.LOGO_RATIO.wordmark), label: false })}</g>`;
    }
    /* the glass edge: polished, lit at the top, and warm where the light inside spills onto its foot */
    s +=
      `<path d="M3.5 176.5V3.5H316.5" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/><path d="M316.5 3.5V176.5H3.5" fill="none" stroke="#000" stroke-opacity=".6" stroke-width=".8"/>` +
      (side !== "back"
        ? lg(
            `${u}-sp`,
            [
              [0, K.warm, 0],
              [0.5, K.warm, 0.6],
              [1, K.warm, 0],
            ],
            H_,
          ) + `<rect x="40" y="175.4" width="240" height="1.6" fill="url(#${u}-sp)"/>`
        : "");
    /* the ID is laser-etched into the glass, frosted, along its foot */
    if (!thumb) {
      const ar = MC.isAr(o);
      const back = side === "back";
      /* on the back it starts at the reading edge, clear of the figure (an Arabic line runs right to left, so its start is the right) */
      s += engrave(back ? (ar ? 298 : 22) : 160, 172.4, idLine(p, o), {
        size: 6.2,
        w: 600,
        anchor: back ? "start" : "middle",
        ink: "#9AA3AD",
        lip: 0,
        ls: ".3",
      });
    }
    return s;
  }
  /** HOMA: a new steel board, black enamel, digits painted by a sign-writer; a bare galvanised hem. */
  function homaBoard(p, o, u, side, thumb, opt) {
    let s = frameSVG(u, "HOMA", thumb);
    s +=
      `<rect x="8" y="8" width="304" height="164" fill="${K.paint}"/>` +
      lg(`${u}-gl`, [
        [0, "#fff", 0.09],
        [0.3, "#fff", 0.02],
        [1, "#fff", 0],
      ]) +
      `<rect x="8" y="8" width="304" height="164" fill="url(#${u}-gl)"/>` +
      (thumb
        ? ""
        : `<pattern id="${u}-bs" width="58" height="2.6" patternUnits="userSpaceOnUse"><rect width="34" height=".7" fill="#fff" opacity=".028"/><rect x="30" y="1.4" width="28" height=".6" fill="#fff" opacity=".02"/></pattern><rect x="8" y="8" width="304" height="164" fill="url(#${u}-bs)"/>`) +
      `<rect x="8" y="8" width="304" height="164" fill="none" stroke="#000" stroke-opacity=".6" stroke-width=".8"/>`;
    const brush = thumb ? "" : ` filter="url(#${u}-br)"`;
    if (!thumb)
      s += `<filter id="${u}-br" x="-2%" y="-6%" width="104%" height="112%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".55 .9" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".9" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    if (side === "back") {
      s += `<g${brush}>${vecBack(p, o, { u, x0: 24, x1: 296, y0: 10, y1: 170, ink: K.paintW, labOp: 0.6, cl: { x: 8, y: 8, w: 304, h: 164 }, fig: { torso: "#30353C", seam: "#6B737D", rim: K.paintW } })}</g>`;
      return s + railsSVG(p, o, "HOMA", thumb);
    }
    const shade = "#4A535D";
    const nr = opt.share
      ? nameRow(p, o, {
          x0: 20,
          x1: 300,
          y: 38,
          size: 22,
          ink: K.paintW,
          lamp: K.tung,
          tierSize: 12,
          tierLs: 1.4,
          shade,
        })
      : nameRow(p, o, {
          x0: 22,
          x1: 298,
          y: 48,
          size: 29,
          ink: K.paintW,
          lamp: K.tung,
          tierSize: 14,
          tierLs: 1.4,
          shade,
        });
    /* in the share the 84 is 20% of the story's height: 121u of digit on this 336px board */
    const br = opt.share
      ? bigRow(p, o, {
          cx: 160,
          y: 166,
          size: f(121 / capOf("800", "Changa", "8")),
          unitSize: 22,
          unitOp: 0.75,
          ink: K.paintW,
          shade,
        })
      : bigRow(p, o, {
          cx: 160,
          y: 127,
          size: 90,
          unitSize: 17,
          unitOp: 0.75,
          ink: K.paintW,
          shade,
        });
    const st = opt.share
      ? ""
      : statsText(p, o, {
          cx: 160,
          y: 157,
          size: 15,
          family: "Changa",
          weight: 700,
          valWeight: 800,
          fill: K.paintW,
          labOp: 0.6,
          maxW: 278,
        });
    s += `<g class="c09-lit"${brush}>${nr.lit}${br}${st}</g><g class="c09-lamp"${brush}>${nr.lamp}</g>`;
    /* a fresh BotolaGO decal, the logo exactly as supplied */
    if (!thumb) {
      const w = 50;
      const h = w / MC.LOGO_RATIO.wordmark;
      s +=
        `<rect x="${160 - w / 2 - 5}" y="17" width="${w + 10}" height="${f(h + 7)}" rx="2" fill="#FAFAF7"/>` +
        `<g transform="translate(${160 - w / 2} 20.5)">${MC.logo("wordmark", { variant: "color", w, h: f(h), label: false })}</g>`;
    }
    return s + railsSVG(p, o, "HOMA", thumb);
  }
  /** STADE: number cards on rings, flipped by hand inside an aluminium frame. */
  function stadeBoard(p, o, u, side, thumb, opt) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    let s = frameSVG(u, "STADE", thumb);
    s +=
      lg(`${u}-bp`, [
        [0, "#8D959F"],
        [0.12, "#A3ACB6"],
        [1, "#B9C1CA"],
      ]) +
      `<rect x="12" y="12" width="296" height="156" fill="url(#${u}-bp)"/>` +
      (thumb ? "" : `<rect x="12" y="12" width="296" height="156" fill="url(#${u}-ms)"/>`) +
      `<rect x="12" y="12" width="296" height="3" fill="#000" opacity=".22"/>`;
    const card = (x, y, w, h, hinge) =>
      `<rect x="${f(x + 0.8)}" y="${f(y + 1.6)}" width="${f(w)}" height="${f(h)}" rx="2" fill="#000" opacity=".3"/>` +
      `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="2" fill="${K.card}"/>` +
      `<rect x="${f(x + 0.5)}" y="${f(y + 0.5)}" width="${f(w - 1)}" height="${f(h - 1)}" rx="1.6" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width=".7"/>` +
      (hinge
        ? `<path d="M${f(x)} ${f(y + h / 2)}H${f(x + w)}" stroke="#000" stroke-width="1.4"/><path d="M${f(x)} ${f(y + h / 2 + 1)}H${f(x + w)}" stroke="#fff" stroke-opacity=".16" stroke-width=".6"/>`
        : "");
    const ring = (x, y) =>
      `<path d="M${f(x - 2.4)} ${f(y + 2)}A2.4 3.2 0 1 1 ${f(x + 2.4)} ${f(y + 2)}" fill="none" stroke="url(#${u}-pol)" stroke-width="1.6"/>`;
    if (side === "back") {
      s +=
        card(18, 18, 284, 144, false) +
        vecBack(p, o, {
          u,
          x0: 30,
          x1: 290,
          y0: 14,
          y1: 166,
          ink: K.paintW,
          labOp: 0.6,
          cl: { x: 18, y: 18, w: 284, h: 144 },
          fig: { torso: "#2C3036", seam: "#5E666F", rim: K.paintW },
        });
      return s + railsSVG(p, o, "STADE", thumb);
    }
    const nm = MC.nameOf(p, o);
    const yr = yearOf(p);
    const nSize = 21;
    const nw = textW(nm, nSize, 800, "Changa");
    const yw = yr ? textW("·" + yr, 13, 800, "Changa") + 2 : 0;
    const ncw = nw + yw + 16;
    const tierT = S.tiers[p.tier];
    const tSize = ar ? 14 : 12;
    const tcw = textW(tierT, tSize, 700, "Changa") + (ar ? 0 : tierT.length * 1.2) + 14;
    const nx = ar ? 300 - ncw : 20;
    const tx = ar ? 20 : 300 - tcw;
    let lit = card(nx, 21, ncw, 28, false) + card(tx, 24, tcw, 22, false);
    let lamp = "";
    if (!ar) {
      lit += `<text x="${nx + 8}" y="42" font-family="Changa" font-weight="800" font-size="${nSize}" fill="${K.paintW}">${esc(nm)}</text>`;
      if (yr)
        lamp += `<text x="${f(nx + 8 + nw + 2)}" y="42" font-family="Changa" font-weight="800" font-size="13" fill="${K.tung}">·${yr}</text>`;
      lit += `<text x="${tx + 7}" y="39.5" font-family="Changa" font-weight="700" font-size="${tSize}" letter-spacing="1.2" fill="${K.paintW}">${esc(tierT)}</text>`;
    } else {
      lit += `<text x="${nx + ncw - 8}" y="43" font-family="Changa" font-weight="800" font-size="${nSize}" text-anchor="end" fill="${K.paintW}">${esc(nm)}</text>`;
      if (yr)
        lamp += `<text x="${f(nx + ncw - 8 - nw - 2)}" y="43" font-family="Changa" font-weight="800" font-size="13" text-anchor="end" fill="${K.tung}">${yr}·</text>`;
      lit += `<text x="${tx + 7}" y="40" font-family="Changa" font-weight="700" font-size="${tSize}" fill="${K.paintW}">${esc(tierT)}</text>`;
    }
    /* the number cards hang from a rail on rings; OVR is a small card on the same baseline */
    const digits = String(p.ovr).split("");
    const big = opt.share;
    const cw = big ? 74 : 50;
    const chh = big ? 112 : 70;
    const cy = big ? 54 : 58;
    const ow = 34;
    const gw = digits.length * cw + (digits.length - 1) * 5 + 6 + ow;
    const x0 = 160 - gw / 2;
    s += `<rect x="${f(x0 - 6)}" y="${cy - 3.4}" width="${f(digits.length * cw + (digits.length - 1) * 5 + 12)}" height="2.6" rx="1.3" fill="url(#${u}-pol)"/>`;
    digits.forEach((dg, i) => {
      const x = x0 + i * (cw + 5);
      lit +=
        card(x, cy, cw, chh, true) +
        `<text x="${f(x + cw / 2)}" y="${f(cy + chh * 0.86)}" font-family="Changa" font-weight="800" font-size="${f(chh * 1.12)}" text-anchor="middle" fill="${K.paintW}">${dg}</text>` +
        `<path d="M${f(x)} ${f(cy + chh / 2)}H${f(x + cw)}" stroke="${K.card}" stroke-width="1.2"/><path d="M${f(x)} ${f(cy + chh / 2 + 0.9)}H${f(x + cw)}" stroke="#fff" stroke-opacity=".14" stroke-width=".5"/>` +
        ring(x + cw * 0.28, cy - 3) +
        ring(x + cw * 0.72, cy - 3);
    });
    const ox = x0 + digits.length * cw + (digits.length - 1) * 5 + 6;
    lit +=
      card(ox, cy + chh - 18, ow, 18, false) +
      `<text x="${f(ox + ow / 2)}" y="${f(cy + chh - 5.2)}" font-family="Changa" font-weight="600" font-size="11" text-anchor="middle" fill="${K.paintW}" fill-opacity=".75">${esc(S.ovr)}</text>`;
    /* four stat cards along the foot */
    if (!opt.share) {
      /* card widths follow their content in Arabic (الانتقالات is long); Latin cards are equal */
      const sg = 7;
      const lab11 = (k) => textW(S.stats[k], 11, 700, "Changa");
      const val14 = (k) => textW(String(p.stats[k]), 14, 800, "Changa");
      let ws = MC.STATS.map((k) => (ar ? Math.max(56, lab11(k) + val14(k) + 20) : 66));
      const room = 284 - 3 * sg;
      const tot = ws.reduce((a2, b2) => a2 + b2, 0);
      const fit = tot > room ? room / tot : 1;
      ws = ws.map((w) => w * fit);
      let xx = 160 - (ws.reduce((a2, b2) => a2 + b2, 0) + 3 * sg) / 2;
      const xs = [];
      (ar ? [3, 2, 1, 0] : [0, 1, 2, 3]).forEach((i) => {
        xs[i] = xx;
        xx += ws[i] + sg;
      });
      MC.STATS.forEach((k, i) => {
        const x = f(xs[i]);
        const sw = f(ws[i]);
        const lab = S.stats[k];
        const lsz = ar ? f(Math.min(11, (11 * (sw - 20 - val14(k))) / lab11(k))) : 10.5;
        lit += card(x, 137, sw, 21, false);
        lit += ar
          ? `<text x="${f(x + sw - 6)}" y="152" font-family="Changa" font-weight="700" font-size="${lsz}" text-anchor="end" fill="${K.paintW}" fill-opacity=".62">${esc(lab)}</text><text x="${f(x + 6)}" y="152.6" font-family="Changa" font-weight="800" font-size="14" fill="${K.paintW}">${p.stats[k]}</text>`
          : `<text x="${f(x + 7)}" y="152" font-family="Changa" font-weight="700" font-size="${lsz}" letter-spacing=".8" fill="${K.paintW}" fill-opacity=".62">${esc(lab)}</text><text x="${f(x + sw - 7)}" y="152.6" font-family="Changa" font-weight="800" font-size="14" text-anchor="end" fill="${K.paintW}">${p.stats[k]}</text>`;
      });
    }
    s += `<g class="c09-lit">${lit}</g><g class="c09-lamp">${lamp}</g>`;
    return s + railsSVG(p, o, "STADE", thumb);
  }

  /** One complete object in viewBox units: grip, collar, board, then the hand that holds it. */
  function board(p, o, u, side, opt = {}) {
    const tier = p.tier;
    const thumb = !!o.thumb;
    const y0 = tier === "LEGEND" ? 250 : 220;
    let s = `<defs>${commonDefs(u)}</defs>`;
    s += `<g class="c09-paddle">${gripSVG(u, p, tier, y0)}${collarSVG(u, p, o, thumb)}</g>`;
    s += `<g class="c09-board">`;
    if (tier === "HOMA") s += homaBoard(p, o, u, side, thumb, opt);
    else if (tier === "STADE") s += stadeBoard(p, o, u, side, thumb, opt);
    else if (tier === "LEGEND") s += legendBoard(p, o, u, side, thumb, opt);
    else s += ledBoard(p, o, u, tier, side, thumb, opt);
    /* the power-on scan (a replay only): a bright line runs down over a face that is already lit */
    if (side === "front" && !thumb && !opt.share) {
      const B = bezel(tier);
      s +=
        lg(`${u}-scn`, [
          [0, K.warm, 0],
          [0.7, K.warm, 0.22],
          [1, "#fff", 0.85],
        ]) +
        `<g class="c09-scan" style="--c09-scan-h:${180 - 2 * B - 10}px"><rect x="${B}" y="${B}" width="${320 - 2 * B}" height="10" fill="url(#${u}-scn)"/></g>`;
    }
    s += `</g>`;
    const hand = handSVG(u, y0, opt);
    s += `<g class="c09-hand">${side === "back" ? `<g transform="matrix(-1 0 0 1 320 0)">${hand}</g>` : hand}</g>`;
    return s;
  }

  /* ---------- token: the board on its paddle, drawn in device pixels ---------- */
  function tokenSVG(p, o, s) {
    const tier = p.tier;
    const ti = TIERS.indexOf(tier);
    const LG = tier === "LEGEND";
    const mini = !!o.mini || s <= 32;
    const v = mini ? 0 : s < 56 ? 1 : 2;
    const u = MC.uid(ID + "t");
    const club = clubOf(p);
    const ph = Math.round(s * (v === 1 ? 0.54 : 0.5));
    const pw = Math.round(ph * (v === 0 ? 1.85 : 16 / 9));
    const col = v === 0 ? 0 : v === 1 ? 3 : 4;
    /* the telescope: LEGEND's board stands this much higher than the rest; at 24–32px it is 45% longer, so the step shows in a column */
    const ext = Math.max(2, Math.round((s - ph - col) * (v === 0 ? 0.36 : 0.23)));
    const top = LG ? 0 : ext;
    const by = top + ph;
    const gw = v === 0 ? (s >= 32 ? 5 : 4) : v === 1 ? 5 : s >= 72 ? 7 : 6;
    const gx = (pw - gw) / 2;
    const gTop = LG ? ph + col + ext : by;
    const rim = v === 0 ? 1 : v === 1 ? 1.5 : 2;
    const endR = v === 0 ? 1 : gw / 2;
    let d = `<defs>${lg(`${u}-c`, CYL, H_)}${lg(`${u}-al`, [
      [0, "#E6EAEE"],
      [0.5, "#B5BDC6"],
      [1, "#8D959F"],
    ])}${lg(`${u}-po`, [
      [0, "#FFFFFF"],
      [0.3, "#8D959F"],
      [0.36, "#F2F5F8"],
      [0.7, "#7E8791"],
      [1, "#DDE2E7"],
    ])}</defs>`;
    /* the grip, club colour, one rib per tier step */
    const gp = `M${gx} ${gTop}V${s - endR}a${f(gw / 2)} ${endR} 0 0 0 ${gw} 0V${gTop}Z`;
    let g = `<path d="${gp}" fill="${club.primary}"/><path d="${gp}" fill="url(#${u}-c)"/>`;
    if (LG) {
      const tw = Math.max(2, gw - 2);
      g += `<rect x="${(pw - tw) / 2}" y="${by}" width="${tw}" height="${gTop - by}" fill="${K.ti}"/><rect x="${(pw - tw) / 2}" y="${by}" width="${tw}" height="${gTop - by}" fill="url(#${u}-c)"/>`;
    }
    const bulge = p.founder ? (v === 0 ? 3 : col) : 0;
    const rt = v === 0 ? 1 : v === 1 ? 1.2 : 1.6;
    const rs = v === 0 ? 2 : v === 1 ? 2.6 : 3.4;
    const r0 = (LG ? gTop : by + bulge) + (v === 0 ? 1 : 1.5);
    const r1 = s - endR - 0.5;
    const step = ti ? Math.min(rs, (r1 - r0 - rt) / Math.max(1, ti - 1)) : 0;
    for (let i = 0; i < ti; i++)
      g += `<rect x="${gx - (v ? 0.5 : 0)}" y="${f(r0 + i * step)}" width="${gw + (v ? 1 : 0)}" height="${rt}" fill="${club.secondary}"/>`;
    g += `<path class="c09-rim" d="${gp}" fill="none" stroke-width=".6"/>`;
    /* the founder's collar: wider than the grip, bright band */
    if (p.founder) {
      const cw = v === 0 ? gw + 2 : v === 1 ? 8 : 11;
      const ch = v === 0 ? 3 : col;
      g +=
        `<rect x="${(pw - cw) / 2}" y="${by}" width="${cw}" height="${ch}" fill="${K.steel}"/>` +
        `<rect x="${(pw - cw) / 2}" y="${f(by + ch * 0.25)}" width="${cw}" height="${f(Math.max(1, ch * 0.5))}" fill="${K.band}"/>` +
        `<rect x="${(pw - cw) / 2}" y="${by}" width="${cw}" height="${ch}" fill="url(#${u}-c)" opacity=".7"/>` +
        `<rect x="${(pw - cw) / 2}" y="${by}" width="${cw}" height="${ch}" fill="none" stroke="#4A535D" stroke-width=".5"/>`;
    } else if (v)
      g += `<rect x="${gx}" y="${by}" width="${gw}" height="${col}" fill="#000" opacity=".25"/>`;
    /* the board */
    const frameFill = {
      HOMA: "#BCC3CA",
      STADE: `url(#${u}-al)`,
      PRO: `url(#${u}-al)`,
      CHAMPION: `url(#${u}-po)`,
      LEGEND: K.ti,
    }[tier];
    const fr = tier === "LEGEND" ? 1 : tier === "HOMA" ? Math.max(1, rim * 0.75) : rim;
    const fx = fr;
    const fy = top + fr;
    const fw = pw - 2 * fr;
    const fh = ph - 2 * fr;
    const faceFill = {
      HOMA: K.paint,
      STADE: "#A3ACB6",
      PRO: K.face,
      CHAMPION: K.face,
      LEGEND: K.glass,
    }[tier];
    let b = `<rect x="0" y="${top}" width="${pw}" height="${ph}" fill="${frameFill}"/><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="${faceFill}"/>`;
    const fs = f(ph * (v === 0 ? 0.74 : 0.66));
    const ink = tier === "HOMA" || tier === "STADE" ? K.paintW : K.warm;
    const cap = capOf("800", "Changa", "8") * fs;
    const ty = f(fy + fh / 2 + cap / 2 + (v === 0 ? 0.2 : 0));
    const digits = String(p.ovr);
    if (tier === "STADE") {
      if (v === 0) b += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="${K.card}"/>`;
      else {
        const dw = textW(digits[0], fs, 800, "Changa");
        const cwid = f(dw + 3);
        const gap = 1.2;
        const tot = digits.length * cwid + (digits.length - 1) * gap;
        for (let i = 0; i < digits.length; i++)
          b += `<rect x="${f(pw / 2 - tot / 2 + i * (cwid + gap))}" y="${f(fy + 1)}" width="${cwid}" height="${f(fh - 2)}" rx=".8" fill="${K.card}"/>`;
      }
    }
    if (v && (tier === "PRO" || tier === "CHAMPION" || tier === "LEGEND"))
      b += `<rect x="${fx + 0.6}" y="${fy + 0.6}" width="${fw - 1.2}" height="${v === 1 ? 0.8 : 1.1}" fill="${K.cyan}"/>`;
    if (tier === "CHAMPION" && v)
      b += `<rect x="${fx + 0.5}" y="${fy + 0.5}" width="${fw - 1}" height="${fh - 1}" fill="none" stroke="#F2F5F8" stroke-opacity=".55" stroke-width=".6"/>`;
    if (v === 2 && (tier === "PRO" || tier === "CHAMPION"))
      b += `<pattern id="${u}-ul" width="${tier === "PRO" ? 2 : 1.5}" height="${tier === "PRO" ? 2 : 1.5}" patternUnits="userSpaceOnUse" x="${fx}" y="${fy}"><circle cx=".75" cy=".75" r=".5" fill="${K.unlit}"/></pattern><rect x="${fx}" y="${fy + 1.4}" width="${fw}" height="${fh - 1.4}" fill="url(#${u}-ul)"/>`;
    /* LEGEND's figures are light, not paint: a warm bloom from 44px up, a white-hot core */
    if (LG && v >= 1)
      b += `<filter id="${u}-gl" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${v === 2 ? 1.3 : 0.9}"/></filter><text x="${pw / 2}" y="${ty}" font-family="Changa" font-weight="800" font-size="${fs}" text-anchor="middle" fill="${K.warm}" opacity=".85" filter="url(#${u}-gl)">${digits}</text>`;
    b += `<text x="${pw / 2}" y="${ty}" font-family="Changa" font-weight="800" font-size="${fs}" text-anchor="middle" fill="${LG ? K.light : ink}">${digits}</text>`;
    if (tier === "STADE" && v)
      b += `<path d="M${fx} ${f(fy + fh / 2)}H${fx + fw}" stroke="#000" stroke-opacity=".7" stroke-width=".6"/>`;
    b += `<rect class="c09-edge" x=".3" y="${top + 0.3}" width="${pw - 0.6}" height="${ph - 0.6}" fill="none" stroke-width=".6"/>`;
    const S = MC.s(o);
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${S.tiers[tier]}${p.founder ? ", " + S.founderLine : ""}`;
    return `<span class="c09 c09-tok" data-tier="${tier}" role="img" aria-label="${esc(label)}" style="width:${pw}px;height:${s}px"><svg viewBox="0 0 ${pw} ${s}" width="${pw}" height="${s}" aria-hidden="true" focusable="false">${d}${g}${b}</svg></span>`;
  }

  /* ---------- share: at pitch level, the board held up at the touchline ---------- */
  function share(p, o) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const u = MC.uid(ID + "s");
    const k = 336 / 320;
    const bx = 12;
    const by = 130;
    const X = (x) => +f(bx + x * k);
    const Y = (y) => +f(by + y * k);
    const y0 = p.tier === "LEGEND" ? 250 : 220;
    const boardSvg = `<svg x="${bx}" y="${by}" width="336" height="${f(340 * k)}" viewBox="0 0 320 340" overflow="visible">${board(p, o, u + "b", "front", { share: true, noSleeve: true })}</svg>`;
    /* the ribbon board along the stand's fascia carries all four stats on one line, at a 10px export pitch */
    const P = 3.4;
    const cols = 104;
    const F = Face(cols, 5);
    const ribY = 72;
    const Lp = { P, X: f(180 - (cols * P) / 2), Y: ribY + 5.5 };
    const extra = { lit: "" };
    if (!ar) {
      const segs = [];
      MC.STATS.forEach((key, i) => {
        segs.push({ g: bit(S.stats[key], F35), c: K.warm, a: 0.55, gap: 2 });
        segs.push({ g: bit(String(p.stats[key]), F35), c: K.warm, gap: i < 3 ? 6 : 0 });
      });
      line(F, segs, Math.round((cols - 1) / 2), 5, "center");
    } else
      extra.lit += statsText(p, o, {
        cx: 180,
        y: ribY + 20.5,
        size: 16,
        family: "Handjet",
        weight: 400,
        fill: K.warm,
        labOp: 0.6,
        maxW: 320,
        handjet: true,
      });
    const led = ledRender(u + "p", Lp, F, extra);
    /* mowing bands, wider as they come towards the camera */
    const g0 = 364;
    let bands = "";
    for (let i = 0, N = 7; i < N; i++) {
      const a = g0 + (640 - g0) * Math.pow(i / N, 1.45);
      const b = g0 + (640 - g0) * Math.pow((i + 1) / N, 1.45);
      bands += `<rect y="${f(a)}" width="360" height="${f(b - a + 0.5)}" fill="${i % 2 ? "#17482B" : "#123B23"}"/>`;
    }
    let steps = "";
    for (let y = 106; y < 352; y += 8)
      steps += `<path d="M0 ${y}H360" stroke="#1B1F25" stroke-width="1.2"/>`;
    /* you, from behind and off-centre: the shared figure, hood up, rim-lit by the floodlights, its shoulders in frame.
       It is placed as an image so the frame's start edge crops it (300 x 360 at 1.3x, 60px of it off the frame). */
    const figSvg = MC.avatar({
      hood: true,
      torso: "#262A30",
      seam: "#3E444C",
      rim: "rgba(244,237,224,.75)",
      preserve: "xMaxYMin slice",
    }).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const fig = `<image x="0" y="340" width="200" height="312" preserveAspectRatio="xMaxYMin slice" href="data:image/svg+xml,${encodeURIComponent(figSvg)}"/>`;
    /* the raised arm: shoulder, elbow out to the side, forearm up to the fist (the cuff meets the hand on the grip) */
    const W = [X(190), Y(y0 + 62)];
    const E = [258, 522];
    const Sh = [158, 590];
    const tube = (a, b, wa, wb) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy);
      const n = [dy / l, -dx / l];
      const q = (c, w, t) => `${f(c[0] + n[0] * w * t)} ${f(c[1] + n[1] * w * t)}`;
      return {
        d: `M${q(a, wa, 1)}L${q(b, wb, 1)}L${q(b, wb, -1)}L${q(a, wa, -1)}Z`,
        top: `M${q(a, wa, 1)}L${q(b, wb, 1)}`,
      };
    };
    const up = tube(Sh, E, 22, 17.5);
    const arm =
      lg(`${u}-ua`, [
        [0, "#33383F"],
        [0.5, "#262A30"],
        [1, "#1A1D21"],
      ]) +
      `<path d="${up.d}" fill="url(#${u}-ua)"/>` +
      `<path d="${up.top}" stroke="rgba(244,237,224,.6)" stroke-width="2" stroke-linecap="round"/>` +
      `<circle cx="${E[0]}" cy="${E[1]}" r="17.5" fill="#262A30"/>` +
      `<path d="M${E[0] - 12} ${E[1] - 12.6}A17.5 17.5 0 0 1 ${E[0] + 17.3} ${E[1] + 2.5}" fill="none" stroke="rgba(244,237,224,.6)" stroke-width="2" stroke-linecap="round"/>` +
      sleeveSVG(u, W, E, f(13 * k), 16.5);
    const logoW = 116;
    const logo = `<g transform="translate(${ar ? 360 - 22 - logoW : 22} 28)">${MC.logo("wordmark", { variant: "light", w: logoW, h: f(logoW / MC.LOGO_RATIO.wordmark), label: false })}</g>`;
    const handle = `<text x="${ar ? 22 : 338}" y="45" font-family="Manrope" font-weight="800" font-size="15" text-anchor="${ar ? "start" : "end"}" fill="#fff">@ali</text>`;
    const yr = yearOf(p);
    const nm = MC.nameOf(p, o);
    const tierT = S.tiers[p.tier];
    /* one caption line at the bottom end: the name with its year, the tier, and the sample label (the ID is on the board) */
    const cy = 618;
    let caption;
    if (!ar) {
      caption = `<text x="338" y="${cy}" font-family="Changa" font-weight="800" font-size="19" text-anchor="end" fill="${K.warm}">${esc(nm)}${yr ? `<tspan fill="${K.tung}" font-size="13"> ·${yr}</tspan>` : ""}<tspan fill-opacity=".72" font-weight="600" font-size="14">  ${esc(tierT)}  ·  Exemple</tspan></text>`;
    } else {
      const nw = textW(nm, 19, 800, "Changa");
      const yw = yr ? textW(yr + "·", 13, 800, "Changa") + 4 : 0;
      const tw = textW(tierT, 15, 600, "Changa");
      caption =
        `<text x="338" y="${cy}" font-family="Changa" font-weight="800" font-size="19" text-anchor="end" fill="${K.warm}">${esc(nm)}</text>` +
        (yr
          ? `<text x="${f(338 - nw - 4)}" y="${cy}" font-family="Changa" font-weight="800" font-size="13" text-anchor="end" fill="${K.tung}">${yr}·</text>`
          : "") +
        `<text x="${f(338 - nw - yw - 10)}" y="${cy}" font-family="Changa" font-weight="600" font-size="15" text-anchor="end" fill="${K.warm}" fill-opacity=".72">${esc(tierT)}</text>` +
        `<text x="${f(338 - nw - yw - tw - 16)}" y="${cy}" font-family="Changa" font-weight="600" font-size="13" text-anchor="end" fill="${K.warm}" fill-opacity=".72">مثال  ·</text>`;
    }
    return (
      `<div class="c09 c09-share" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg viewBox="0 0 360 640" width="360" height="640" direction="ltr" aria-hidden="true" focusable="false">` +
      `<defs>` +
      lg(`${u}-sky`, [
        [0, "#050608"],
        [1, "#12161B"],
      ]) +
      `<radialGradient id="${u}-fl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${K.warm}" stop-opacity=".2"/><stop offset=".4" stop-color="${K.warm}" stop-opacity=".06"/><stop offset="1" stop-color="${K.warm}" stop-opacity="0"/></radialGradient>` +
      lg(`${u}-gr`, [
        [0, "#000", 0.5],
        [0.25, "#000", 0.08],
        [0.75, "#000", 0.12],
        [1, "#000", 0.6],
      ]) +
      led.defs +
      `</defs>` +
      `<rect width="360" height="${g0}" fill="url(#${u}-sky)"/>` +
      `<circle cx="${ar ? 40 : 320}" cy="10" r="230" fill="url(#${u}-fl)"/>` +
      /* the stand: its fascia ribbon board, then the terrace steps down to the perimeter wall */
      `<rect y="${ribY - 6}" width="360" height="${352 - ribY + 6}" fill="#0E1114"/>${steps}` +
      `<rect y="${ribY}" width="360" height="28" fill="#050607"/><rect y="${ribY}" width="360" height="1.4" fill="#3A4048"/><rect y="${ribY + 26.6}" width="360" height="1.4" fill="#1B1F24"/>` +
      led.html +
      `<rect y="352" width="360" height="12" fill="#07090B"/><rect y="352" width="360" height="1" fill="#2A3038"/>` +
      `<rect y="${g0}" width="360" height="${640 - g0}" fill="#143D25"/>${bands}<rect y="${g0}" width="360" height="${640 - g0}" fill="url(#${u}-gr)"/>` +
      `<path d="M0 482L360 476V479.4L0 485.6Z" fill="#E9ECE6" opacity=".85"/>` +
      /* the dugout's edge at the end of the frame: its curved roof and its glass */
      `<g transform="matrix(-1 0 0 1 360 36)">` +
      `<rect x="0" y="372" width="56" height="148" fill="#0C0E11"/>` +
      `<rect x="2" y="420" width="17" height="24" rx="3" fill="#2E343B"/><rect x="24" y="420" width="17" height="24" rx="3" fill="#2E343B"/><rect x="0" y="444" width="52" height="5" fill="#22272D"/>` +
      `<path d="M0 330C30 331 52 344 58 372L62 520L0 520Z" fill="#DDE6EE" opacity=".09"/>` +
      `<path d="M8 338C30 342 46 356 50 380" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M0 322C36 323 62 338 68 370L72 522H62L58 372C52 344 30 331 0 330Z" fill="#2A2F35"/>` +
      `<path d="M0 322C36 323 62 338 68 370L72 522" fill="none" stroke="#C3CAD2" stroke-opacity=".45" stroke-width="1"/></g>` +
      boardSvg +
      `<g>${fig}</g>` +
      arm +
      logo +
      handle +
      caption +
      `</svg></div>`
    );
  }

  /* ---------- the concept ---------- */
  const c = {
    id: ID,
    n: 9,
    slug: "09",
    name: "Panneau",
    nameAr: "لوحة الحكم الرابع",
    category: "youth",
    philosophy:
      "Your card is the board the fourth official raises, held up in your own hand: the one object in football whose job is to show one number to the whole stadium at once.",
    philosophyAr:
      "بطاقتك هي اللوحة التي يرفعها الحكم الرابع، وأنت من يمسكها: الشيء الوحيد في كرة القدم الذي وُجد ليُري الملعب كله رقمًا واحدًا في لحظة واحدة.",
    idea: [
      "The card is the board the fourth official raises, held in your own hand: a 16:9 face in a frame, a collar, a long centred paddle and your fist round the grip, with the cuff of a bench jacket leaving the frame at the bottom corner. Painted solid, it reads as a board held up before a single character is read. The board never mirrors.",
      "Every tier uses the same three rows. Row A is identity: the name, the founder's ·26 and the tier at the end. Row B is the 84 with OVR beside it on the same baseline. Row C is all four stats on one fixed line, so a screenshot always carries the whole card. There is no previous-gameweek row: the app has no previous overall yet, so that line appears only once two real values exist.",
      "On the LED tiers the light is computed, not textured: every string becomes a grid of cells, and each LED is on or off over a field of unlit LEDs. The name and the 84 are Changa 800 sampled into the grid, in Latin and in Arabic. PRO sets its labels in a 5×7 and a 3×5 board font on a 3u grid, the founder lamp's own pitch; a 4u grid cannot hold the four-stat line. CHAMPION's full matrix samples everything at 2u with three brightness levels, so its curves survive. Where a dot would fall under two device pixels, the cells turn solid.",
      "Each colour has one meaning. Warm-white LEDs carry identity and figures. Tungsten carries the founder year and nothing else. Cyan appears only as the 2u strip that says the board is on. No amber, no navy, and no glow below LEGEND.",
      "Swipe and the board turns over. The back carries the four stats as a column and a thirty-gameweek season record whose first seven marks are the labelled sample (EXEMPLE / مثال). Its end half holds the shared figure, hood up, rim-lit and cut by the bezel, made in the tier's medium: painted on HOMA, printed on STADE's card, drawn in LED cells on PRO and CHAMPION, lit on LEGEND's glass. A small club crest sits beside it.",
    ],
    belonging: [
      "Your number's going up. Every board in the league goes up in the same minute at gameweek close, so a group chat compares one moment.",
      "A 15-year-old knows this object from every broadcast. The tiers form a technology ladder anyone can read from across a leaderboard: painted steel, flip cards, LED, a brighter full matrix, then frameless lit glass held highest.",
      "The fist is yours. In the share you stand at the touchline, seen from behind with your hood up, your arm bent up to hold the board beside your head, the four stats running on the stand's ribbon board behind.",
      "The founder lamp is the first light on the board and it never goes out. The year sits after the name, the way supporter groups carry theirs: ALI ·26.",
      "A screenshot always shows the whole card: name, year, tier, 84 and all four stats on the front.",
    ],
    founderMark: [
      "A knurled steel collar where the grip meets the board. It is 40u wide against the 28u grip, so a founder's outline differs from everyone else's. Its polished band carries 26 laser-engraved at 10.5u on the front, with FOUNDER and the BOT number wrapping round the cylinder.",
      "On the face, ·26 follows the name, readable at arm's length. It is a tungsten lamp on the LED tiers that the power-on scan never touches. HOMA paints it, STADE prints it on the name card, and LEGEND lights it in the glass.",
      "At 24–32px the collar survives as a 3px steel bulge, wider than the stem, directly under the panel. In rows the name reads ALI ·26.",
      "Later cohorts get a plain rubber collar flush with the grip and no tungsten cell.",
    ],
    small: [
      "56–80px: the board on its club-colour paddle. The 84 is solid Changa 800 in warm white. PRO and CHAMPION add the cyan on-strip and a faint field of unlit LEDs. Founders get the steel collar, and the stem carries one rib per tier step.",
      "44–52px (row(), the My position card): the same board on a shorter grip. The club colour is the grip itself, and the club's second colour forms its ribs. From 44px up, LEGEND's 84 is white-hot with a warm bloom, the only token that glows.",
      "24–32px, inside a ranking row's name cell: a panel 22×12 to 30×16 with a 1px rim, the 84 in solid Changa 800, and a stem at least 60% of the panel height, so it does not read as a monitor. The tier is the rib count on the stem: none for HOMA, one to three for STADE to CHAMPION, four for LEGEND. LEGEND also stands on a narrower telescopic segment, so in any column its board sits higher and its stem steps in.",
      "Thumbnails drop engravings, dots and filters and keep the whole outline, hand included.",
    ],
    rtl: [
      "The object never mirrors: frame, collar, grip and your right hand stay put. The content does: the name and its 26· sit at the right, the tier at the left, the stats read from the right, the season record fills from the right, and the figure on the back moves to the left half.",
      "On the LED tiers, علي is Changa 800 sampled into the grid like the Latin name, sized so the two dots of ي stay separate cells. The Arabic tier, stat labels and sample label are solid Handjet, thickened by a hairline stroke: the lab's copy of Handjet has no element axes, so in dots they would merge. HOMA, STADE, LEGEND, the share and every row set علي in Changa 800.",
      "The 84 OVR group stays centred and left to right. Digits are Western and run left to right everywhere. No letter-spacing on Arabic.",
      "The bottom rail reads المغرب · 2026/27 · BOT #004821, with Manrope supplying the digits; on LEGEND the same line is etched into the glass. The sample record on the back says مثال.",
    ],
    tiers: {
      HOMA: "A new steel board in black enamel with a visible brush direction, a bare galvanised hem and four rivets. Every figure is hand-painted by a sign-writer in white Changa with a grey drop shade, and the founder year in tungsten paint. A fresh BotolaGO decal sits at the top, and the ID is stamped into the hem. Full outline, 0 ribs.",
      STADE:
        "Flip cards. Black number cards hang on rings from a polished rail inside a brushed aluminium frame, each split by its hinge line. The name, the tier, OVR and the four stats are smaller cards. 1 rib.",
      PRO: "Warm-white LEDs behind black acrylic in a brushed aluminium frame on a 3u grid: the name and the 84 sampled from Changa 800 (the 84 on 20 rows), the labels and stats in a 5×7 and a 3×5 board font, one 4% reflection band and the cyan on-strip. 2 ribs.",
      CHAMPION:
        "A double-sided full matrix on a 2u pitch with three brightness levels, so the brand face keeps its curves. Its dots are larger, overlap and carry a white core, so it is measurably brighter than PRO. A mirror-polished frame with a bright chamfer, and a 5u visible edge under the board. 3 ribs.",
      LEGEND:
        "Frameless dead-front smoked glass, running almost edge to edge inside a 3u polished titanium lip: the only board without a frame. No pixels: the name and the 84 are white-hot light inside a tight warm bloom and a wide one, a pool of light sits on the glass, light spills onto its foot, and the stats line stays. The logo is printed on the glass, as supplied, and the ID is etched into its foot. A telescopic titanium extension makes the handle 30% longer. 4 ribs.",
    },
    legend: [
      "On the first open after reaching LEGEND, with motion on, your fist raises the board from below on a 420ms spring with a hand's wobble. The tungsten 26 is already lit. Then one 300ms power-on scan: a bright line runs down the glass while the face, already lit, rises from 60% to full brightness.",
      "The 84 is never hidden and no gesture is needed to see it: the scan plays by itself, and a tap only replays it. Under reduced motion the lit board simply shows. There is one scan and no flashing.",
      "In every ranking the LEGEND board stands higher than the rest, because its handle is longer, and the stats line stays on its front.",
    ],
    advantages: [
      "The outline, a 16:9 board on a long centred paddle, survives from 400px to 24px, and nothing else in this slate or in card games has it.",
      "A built-in weekly ritual: the object exists to show one number at one moment.",
      "Every stat is on the front at every tier, so a screenshot is complete.",
      "The tiers are physical technologies (paint, cards, LED, matrix, glass) plus a rib count on the stem, so they read in greyscale and without colour.",
      "Arabic in a shop-sign medium is local, not translated. The colour law (warm figures, tungsten founder, one cyan on-strip) fits the app.",
    ],
    risks: [
      "The board belongs to the substitution, so 'remplaçant' teasing is possible. Copy has to frame the IN ('ton numéro entre').",
      "A sign on a stick in a raised hand can read as a placard. The guard is the pitch-level share with the touchline and the dugout, and the share never shows a crowd.",
      "On the LED tiers the Arabic labels and stats are solid Handjet, because the lab's font has no element axes. Production should vendor the full Handjet and set them in dots too.",
      "LED text is sampled from fonts at render time and cached per string. Production should ship pre-built cell grids.",
      "Handjet is not a brand face. The card shows the shared figure's hand in one skin tone only: skin-tone and gloved variants are specified but not built.",
      "Several features are specified but not built: a previous-gameweek row and the 'Changement' share, which need a previous overall that does not exist yet; the collar ceremony; and a friend's board raised beside yours.",
      "Several boards in a list could recall an odds screen. Rows therefore carry the board only as a small token, with points in the app's own type.",
    ],
    gridWidth: 252,
    detailWidth: 400,

    full(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const u = MC.uid(ID);
      const tier = p.tier;
      const svg = (cls, inner) =>
        `<svg class="c09-face ${cls}" direction="ltr" viewBox="0 0 320 340" style="aspect-ratio:320/340" aria-hidden="true" focusable="false">${inner}</svg>`;
      const front = svg("c09-front", board(p, o, u, "front"));
      const back = o.thumb ? "" : svg("c09-back", board(p, o, MC.uid(ID + "k"), "back"));
      const pitch = tier === "CHAMPION" ? "2" : tier === "PRO" ? "3" : "0";
      return (
        `<div class="c09 c09-card${o.thumb ? " is-thumb" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}" data-pitch="${pitch}" data-motion="${o.motion ? 1 : 0}">` +
        `<div class="c09-obj">${front}${back}</div></div>`
      );
    },

    token(p, o = {}) {
      return tokenSVG(p, o, o.size || 44);
    },

    /* the "My position" compact card: the 52px board token, the name with its year, points */
    row(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const yr = yearOf(p);
      return (
        `<div class="c09 c09-row${o.me ? " is-me" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" data-tier="${p.tier}">` +
        `<span class="c09-r-rank">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
        `<span class="c09-r-tok">${tokenSVG(p, o, 52)}</span>` +
        `<span class="c09-r-name"><b>${esc(MC.nameOf(p, o))}${yr ? ` <i aria-hidden="true">${MC.ltr(ar ? yr + "·" : "·" + yr)}</i><span class="c09-sr">${esc(S.founderLine)}</span>` : ""}</b><small>${esc(S.tiers[p.tier])}</small></span>` +
        `<span class="c09-r-pts"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
        `</div>`
      );
    },

    share(p, o = {}) {
      return share(p, o);
    },

    /* Swipe turns the board over, a long press raises it, a tap replays the power-on scan. */
    mount(el, o = {}) {
      if (!el || el.__c09 || !el.classList || !el.classList.contains("c09-card")) return;
      el.__c09 = true;
      el.tabIndex = 0;
      let x0 = 0;
      let lp = null;
      let raised = false;
      const replay = () => {
        el.classList.remove("is-replay");
        void el.offsetWidth;
        el.classList.add("is-replay");
        setTimeout(() => el.classList.remove("is-replay"), 900);
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
        if (Math.abs(e.clientX - x0) > 36) el.classList.toggle("is-flipped");
        else replay();
      };
      el.addEventListener("pointerup", (e) => end(e, false));
      el.addEventListener("pointercancel", (e) => end(e, true));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          replay();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight")
          el.classList.toggle("is-flipped");
      });
    },
  };
  MC.register(c);
})();
