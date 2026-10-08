/* 08 LSAQ (youth). A cluster of die-cut vinyl stickers slapped on top of each other: your
   rating on the big one, the print layers under it, and at the very bottom the first slip
   BotolaGO ever gave you. One fixed die for everyone (a superellipse slab with the logo-ball
   tab fused to it), slapped at -6deg. One SVG in a 300 x 360 box; every selector in 08.css
   sits under .c08. */
(function () {
  const MC = window.MC;
  const INK = "#14161A";
  const INK2 = "#4D535C"; // secondary print on white vinyl (7.9:1)
  const BLUE = "#0151FC"; // Logo Blue: the tab only
  const SILVER = "#C9CED4"; // LEGEND retroreflective sheeting
  const PAPER = "#F8F7F2"; // HOMA: new paper stock
  const VW = 300;
  const VH = 360;
  const SLAP = -6;
  const SA = 100; // slab half-width (superellipse n=4, 200 x 150)
  const SB = 75; // slab half-height
  const TAB = { cx: 86, cy: 71, hw: 18, hh: 11, r: 6 }; // 36 x 22, fused at the bottom-end corner as an ear
  const KEY = 12; // white keyline round slab and tab
  const LAYERS = { HOMA: 0, STADE: 1, PRO: 2, CHAMPION: 3, LEGEND: 3 }; // the print run
  const SCREEN = { HOMA: 4.4, STADE: 3.6, PRO: 3.1, CHAMPION: 3.1, LEGEND: 2.6 }; // halftone pitch
  // Changa 800 digit advances per 1000 (fallback before the face is measurable).
  const ADV = { 0: 623, 1: 435, 2: 550, 3: 501, 4: 574, 5: 530, 6: 564, 7: 467, 8: 580, 9: 564 };
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const esc = MC.esc;
  const RAD = Math.PI / 180;
  const tierOf = (p) => (LAYERS[p.tier] != null ? p.tier : "PRO");
  const clubOf = (p) => ({ c: (p.club && p.club.primary) || "#3b4a5e", on: (p.club && p.club.secondary) || "#e9e4d6" });
  const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const deepen = (h, f) => toHex(hex2(h).map((v) => v * (1 - f)));
  const mix = (a, b, t) => {
    const A = hex2(a);
    const B = hex2(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  };

  /** What the slab is made of at each tier: face, digit ink and (where the face is not the club colour) a club band. */
  function slabInk(p, tier) {
    const C = clubOf(p);
    if (tier === "HOMA") return { face: PAPER, ink: INK, band: C.c };
    if (tier === "LEGEND") return { face: SILVER, ink: INK, band: C.c };
    if (tier === "CHAMPION") return { face: deepen(C.c, 0.15), ink: C.on };
    return { face: C.c, ink: C.on };
  }

  /* Faces used in measured layout: start loading them now so fonts.ready waits for them. */
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('800 100px "Changa"', "0123456789 ALI علي");
      document.fonts.load('800 100px "Manrope"', "PRO CAP 91");
      document.fonts.load('700 100px "Manrope"', "BOT #004821 2026/27 MOROCCO");
      document.fonts.load('700 100px "Noto Sans Arabic"', "القائد التشكيلة المغرب");
    }
  } catch (e) {
    /* layout falls back to estimates */
  }
  let g2d = null;
  /** Text width in the given face at `size` units; falls back to an em estimate if the face is not ready. */
  function measure(txt, family, weight, size, em) {
    const font = `${weight} 100px ${family}`;
    try {
      if (document.fonts && document.fonts.check(font, txt)) {
        g2d = g2d || document.createElement("canvas").getContext("2d");
        g2d.font = font;
        return (g2d.measureText(txt).width * size) / 100;
      }
    } catch (e) {
      /* estimate below */
    }
    return String(txt).length * em * size;
  }
  const digitW = (s, fs) => {
    const est = (String(s).split("").reduce((a, ch) => a + (ADV[ch] || 560), 0) * fs) / 1000;
    const m = measure(String(s), '"Changa"', 800, fs, 0);
    return m > 0 ? m : est;
  };

  const fitFs = (ovr) => Math.min(140, Math.round(140 * Math.min(1, 168 / digitW(ovr, 140))));

  /* ---------- geometry: the fixed die ---------- */
  function sePath(a, b, N) {
    let d = "";
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI;
      const c = Math.cos(t);
      const s = Math.sin(t);
      d += (i ? "L" : "M") + r2(a * Math.sign(c) * Math.sqrt(Math.abs(c))) + " " + r2(b * Math.sign(s) * Math.sqrt(Math.abs(s)));
    }
    return d + "Z";
  }
  // Signed distances (first-order for the superellipse; exact for the rounded box).
  function sdSE(x, y, a, b) {
    const u = Math.abs(x) / a;
    const v = Math.abs(y) / b;
    const s4 = u ** 4 + v ** 4;
    if (s4 < 1e-9) return -Math.min(a, b);
    const g = Math.pow(s4, -0.75) * Math.sqrt(u ** 6 / (a * a) + v ** 6 / (b * b));
    return (Math.pow(s4, 0.25) - 1) / g;
  }
  function sdBox(x, y, hw, hh, r) {
    const qx = Math.abs(x) - hw + r;
    const qy = Math.abs(y) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }
  /** World point -> the local frame of something rotated by `deg` about (cx, cy). */
  function toLocal(x, y, cx, cy, deg) {
    const a = -deg * RAD;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = x - cx;
    const dy = y - cy;
    return [dx * c - dy * s, dx * s + dy * c];
  }
  const dieFace = (x, y) => smin(sdSE(x, y, SA, SB), sdBox(x - TAB.cx, y - TAB.cy, TAB.hw, TAB.hh, TAB.r), 9);

  /** Marching squares: the zero contour of f over a box, as point loops. */
  function contour(f, x0, y0, x1, y1, st) {
    const nx = Math.floor((x1 - x0) / st) + 1;
    const ny = Math.floor((y1 - y0) / st) + 1;
    const V = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[j * nx + i] = f(x0 + i * st, y0 + j * st);
    const P = new Map();
    const adj = new Map();
    const pos = (id) => {
      if (P.has(id)) return;
      const k = id >> 1;
      const i = k % nx;
      const j = (k - i) / nx;
      const va = V[k];
      const vert = id & 1;
      const vb = vert ? V[k + nx] : V[k + 1];
      const t = va / (va - vb);
      const xa = x0 + i * st;
      const ya = y0 + j * st;
      P.set(id, vert ? [xa, ya + st * t] : [xa + st * t, ya]);
    };
    const link = (a, b) => {
      pos(a);
      pos(b);
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
    };
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        const a = V[k];
        const b = V[k + 1];
        const c = V[k + nx + 1];
        const d = V[k + nx];
        const code = (a < 0 ? 8 : 0) | (b < 0 ? 4 : 0) | (c < 0 ? 2 : 0) | (d < 0 ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const T = k * 2;
        const R = (k + 1) * 2 + 1;
        const B = (k + nx) * 2;
        const L = k * 2 + 1;
        const mid = (a + b + c + d) / 4 < 0;
        switch (code) {
          case 1: case 14: link(L, B); break;
          case 2: case 13: link(B, R); break;
          case 3: case 12: link(L, R); break;
          case 4: case 11: link(T, R); break;
          case 6: case 9: link(T, B); break;
          case 7: case 8: link(T, L); break;
          case 5: if (mid) { link(T, L); link(B, R); } else { link(T, R); link(L, B); } break;
          case 10: if (mid) { link(T, R); link(L, B); } else { link(T, L); link(B, R); } break;
        }
      }
    }
    const seen = new Set();
    const loops = [];
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let prev = -1;
      let cur = start;
      while (cur !== undefined && !seen.has(cur)) {
        seen.add(cur);
        loop.push(P.get(cur));
        const nb = adj.get(cur);
        const nxt = nb[0] !== prev ? nb[0] : nb[1];
        prev = cur;
        cur = nxt;
      }
      loops.push(loop);
    }
    return loops;
  }
  function rdp(pts, tol) {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0];
    const [bx, by] = pts[pts.length - 1];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let dmax = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
    const A = rdp(pts.slice(0, idx + 1), tol);
    return A.slice(0, -1).concat(rdp(pts.slice(idx), tol));
  }
  function loopPath(loops, tol) {
    const loop = loops.reduce((a, b) => (b.length > a.length ? b : a), []);
    if (loop.length < 4) return "";
    const m = loop.length >> 1;
    const A = rdp(loop.slice(0, m + 1), tol);
    const B = rdp(loop.slice(m).concat([loop[0]]), tol);
    const pts = A.slice(0, -1).concat(B.slice(0, -1));
    return "M" + pts.map((q) => r1(q[0]) + " " + r1(q[1])).join("L") + "Z";
  }
  // The die (slab + tab + 12u keyline, with a fillet where the tab meets the slab): the same for everyone.
  let DIE = null;
  const dieOutline = () => DIE || (DIE = loopPath(contour((x, y) => dieFace(x, y) - KEY, -118, -94, 118, 104, 1.25), 0.09));
  const SEP = sePath(SA, SB, 120);
  const SEP_S = sePath(SA, SB, 48);
  const kissCache = new Map();

  /* ---------- the logo's ball (LOGO_BALL path), used only as a clean knockout ---------- */
  let BALL;
  const ballD = () => {
    if (BALL !== undefined) return BALL;
    const B = window.MC_BRAND && window.MC_BRAND.mark;
    BALL = B ? B.paths.filter((q) => q.part === "ball").sort((a, b) => b.d.length - a.d.length)[0].d : null;
    return BALL;
  };
  const ballAt = (cx, cy, d, fill) =>
    ballD()
      ? `<path d="${ballD()}" fill="${fill}" transform="translate(${r2(cx)} ${r2(cy)}) scale(${(d / 193.687).toFixed(5)}) translate(-1502.743 -168.369)"/>`
      : `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(d / 2)}" fill="${fill}"/>`;

  /* ---------- filters ---------- */
  // Every sticker: a ~1px outer hairline (#858D99 on the mist ground; a dark separator on the dark
  // ground, where the white keyline is the edge) and a 0 1.5px 2px drop shadow.
  const stickerFilter = (id) =>
    `<filter id="${id}" x="-12%" y="-12%" width="124%" height="130%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation=".9" result="b0"/>` +
    `<feComponentTransfer in="b0" result="d"><feFuncA type="linear" slope="5"/></feComponentTransfer>` +
    `<feFlood class="c08-fh" result="hc"/><feComposite in="hc" in2="d" operator="in" result="hair"/>` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/><feOffset in="b" dy="1.5" result="bo"/>` +
    `<feFlood class="c08-fs" result="sc"/><feComposite in="sc" in2="bo" operator="in" result="sh"/>` +
    `<feMerge><feMergeNode in="sh"/><feMergeNode in="hair"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  // A lit edge: the shape minus itself shifted toward the lower end, flooded with the second ink.
  const edgeLight = (id, dx, dy, color, op = 1) =>
    `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feOffset in="SourceAlpha" dx="${r2(dx)}" dy="${r2(dy)}" result="o"/>` +
    `<feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>` +
    `<feFlood flood-color="${color}" flood-opacity="${op}"/><feComposite in2="e" operator="in"/></filter>`;
  const blurFilter = (id, s) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${s}"/></filter>`;
  // CHAMPION flock: a fine velvet nap, light and dark fibres (full size only).
  const flockFilter = (id) =>
    `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="13" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .9 0 0 0 -.38" result="w"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.9 0 0 0 .34" result="k"/>` +
    `<feMerge><feMergeNode in="k"/><feMergeNode in="w"/></feMerge></filter>`;

  /* ---------- the avatar disc: a two-colour halftone screen print of the shared figure ---------- */
  // The manager from behind, hood up, cropped off-centre: the head and one shoulder enter from
  // the disc's bottom-start. Ink 1 is the figure; ink 2 (the club's second colour, or the paper
  // itself at HOMA) is a halftone light from the top-start plus a rim light on the upper-start edge.
  function discArt(u, p, c) {
    const { tier, thumb, sg, ar, S, flat } = c;
    const { x: cx, y: cy, R } = c.disc;
    const home = tier === "HOMA";
    const C = clubOf(p);
    const ground = home ? PAPER : tier === "CHAMPION" ? deepen(C.c, 0.15) : C.c;
    const hi = home ? PAPER : C.on;
    const s = (0.6 * R) / 52; // close crop: the hood's crown runs off the top, the shoulders off the bottom
    const hx = cx - sg * 0.2 * R;
    const top = cy - 1.06 * R;
    const pos = { x: r1(hx - 100 * s), y: r1(top - 44 * s), w: r1(200 * s), h: r1(240 * s) };
    const fig = (q) => MC.avatar({ ...pos, rim: "none", ...q });
    const box = `x="${r1(cx - R)}" y="${r1(cy - R)}" width="${2 * R}" height="${2 * R}"`;
    let defs = `<clipPath id="${u}-cd"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>`;
    let face = `<rect ${box} fill="${ground}"/>`;
    if (thumb) {
      face += fig({ torso: mix(INK, hi, 0.4), hoodFill: INK, seam: ground, rim: hi });
    } else {
      const P = SCREEN[tier];
      const lit = sg > 0 ? { x1: 20, y1: 40, x2: 175, y2: 236 } : { x1: 180, y1: 40, x2: 25, y2: 236 };
      defs +=
        `<radialGradient id="${u}-dot"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${hi}" stop-opacity="0"/></radialGradient>` +
        `<pattern id="${u}-ht" width="${P}" height="${P}" patternUnits="userSpaceOnUse" patternTransform="rotate(${home ? 45 : 22.5})"><rect width="${P}" height="${P}" fill="url(#${u}-dot)"/></pattern>` +
        `<filter id="${u}-thr" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="12" intercept="-2.6"/></feComponentTransfer></filter>` +
        `<linearGradient id="${u}-tone" gradientUnits="userSpaceOnUse" x1="${lit.x1}" y1="${lit.y1}" x2="${lit.x2}" y2="${lit.y2}"><stop offset="0" stop-color="#fff"/><stop offset=".22" stop-color="#9a9a9a"/><stop offset=".46" stop-color="#2e2e2e"/><stop offset=".6" stop-color="#000"/></linearGradient>` +
        `<radialGradient id="${u}-pool" gradientUnits="userSpaceOnUse" cx="${r1(cx - sg * 0.75 * R)}" cy="${r1(cy - 0.85 * R)}" r="${r1(1.25 * R)}"><stop offset="0" stop-color="#9a9a9a"/><stop offset=".5" stop-color="#3a3a3a"/><stop offset="1" stop-color="#000"/></radialGradient>` +
        `<mask id="${u}-mpool" maskUnits="userSpaceOnUse" ${box}><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${u}-pool)"/></mask>` +
        // the jacket gets its own screen (lighter at the shoulders, solid where the country is printed), so it reads apart from the hood
        `<linearGradient id="${u}-tt" gradientUnits="userSpaceOnUse" x1="${sg > 0 ? 60 : 140}" y1="172" x2="${sg > 0 ? 80 : 120}" y2="206"><stop offset="0" stop-color="#d8d8d8"/><stop offset=".5" stop-color="#6a6a6a"/><stop offset="1" stop-color="#000"/></linearGradient>` +
        `<mask id="${u}-mfig" maskUnits="userSpaceOnUse" ${box}>${fig({ torso: `url(#${u}-tt)`, hoodFill: `url(#${u}-tone)`, seam: false })}</mask>` +
        edgeLight(`${u}-rl`, sg * 1.7, 1.7, hi);
      face += `<g filter="url(#${u}-thr)"><rect ${box} fill="url(#${u}-ht)" mask="url(#${u}-mpool)"/></g>`;
      face += fig({ torso: INK, seam: false });
      face += `<g filter="url(#${u}-thr)"><rect ${box} fill="url(#${u}-ht)" mask="url(#${u}-mfig)"/></g>`;
      face += fig({ torso: false, seam: ground });
      face += `<g filter="url(#${u}-rl)">${fig({ torso: "#000", seam: false })}</g>`;
      // the country, set straight across the lower chord: printed on the back of the jacket
      face += ar
        ? `<text x="${cx}" y="${r1(cy + 0.8 * R)}" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="9" fill="${hi}" direction="rtl">${esc(S.country)}</text>`
        : `<text x="${r1(cx + 0.4)}" y="${r1(cy + 0.79 * R)}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="8" letter-spacing=".8" fill="${hi}" direction="ltr">${esc(S.country)}</text>`;
    }
    const keyl = flat ? "" : `<g filter="url(#${u}-stk)"><circle cx="${cx}" cy="${cy}" r="${R + 9}" class="${home ? "c08-paper" : "c08-white"}"/></g>`;
    return { defs, body: keyl + `<g clip-path="url(#${u}-cd)">${face}</g>`, lam: `<circle cx="${cx}" cy="${cy}" r="${R + 9}" fill="#fff"/>` };
  }

  /* ---------- the number slab (local frame: centre of the slab, before the -6deg slap) ---------- */
  function slabArt(u, p, c) {
    const { tier, thumb, flat } = c;
    const SI = slabInk(p, tier);
    const home = tier === "HOMA";
    const legend = tier === "LEGEND";
    const stock = home ? "c08-paper" : "c08-white";
    const ovr = String(p.ovr);
    const fs = fitFs(ovr); // a three-digit number prints smaller, inside the same die
    const base = r1(0.314 * fs);
    const digits = (attrs) => `<text x="0" y="${base}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${fs}" direction="ltr" ${attrs}>${esc(ovr)}</text>`;
    let defs =
      `<path id="${u}-die" d="${dieOutline()}"/><path id="${u}-se" d="${SEP}"/>` +
      `<clipPath id="${u}-sec"><use href="#${u}-se"/></clipPath>` +
      `<mask id="${u}-tbm" maskUnits="userSpaceOnUse" x="60" y="52" width="52" height="42"><rect x="${TAB.cx - TAB.hw}" y="${TAB.cy - TAB.hh}" width="${2 * TAB.hw}" height="${2 * TAB.hh}" rx="${TAB.r}" fill="#fff"/>${ballAt(TAB.cx + 1, TAB.cy, 15.5, "#000")}</mask>`;
    let face = `<use href="#${u}-se" fill="${SI.face}"/>`;
    if (SI.band) face += `<g clip-path="url(#${u}-sec)"><rect x="-${SA}" y="-${SB}" width="${2 * SA}" height="25" fill="${SI.band}"/></g>`;
    if (home) face += `<use href="#${u}-se" fill="none" stroke="${INK}" stroke-opacity=".16" stroke-width=".8"/>`;
    let dig = digits(`fill="${SI.ink}"`);
    if (tier === "CHAMPION" && !thumb) {
      // flocked vinyl: fibres, and the velvet's lighter nap at every edge (slab and digits)
      defs += flockFilter(`${u}-flk`) + blurFilter(`${u}-b4`, 4) + blurFilter(`${u}-b1`, 0.7) + `<mask id="${u}-dm" maskUnits="userSpaceOnUse" x="-110" y="-90" width="220" height="180">${digits('fill="#fff"')}</mask>`;
      face +=
        `<g clip-path="url(#${u}-sec)"><use href="#${u}-se" fill="none" stroke="${mix(SI.face, "#ffffff", 0.28)}" stroke-width="16" filter="url(#${u}-b4)"/>` +
        `<rect x="-${SA}" y="-${SB}" width="${2 * SA}" height="${2 * SB}" fill="#000" filter="url(#${u}-flk)" opacity=".5"/></g>`;
      dig =
        digits(`fill="${mix(SI.ink, "#000000", 0.1)}"`) +
        `<g mask="url(#${u}-dm)">${digits(`fill="none" stroke="${mix(SI.ink, "#ffffff", 0.6)}" stroke-width="3" filter="url(#${u}-b1)"`)}</g>`;
    }
    if (legend && !thumb) {
      // retroreflective sheeting: glass beads, and a sheen that answers the light (tilt or flash)
      const lx = c.sg > 0 ? -45 : 45;
      defs +=
        `<pattern id="${u}-bead" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="2" r=".6" fill="#fff"/><circle cx="4.6" cy="5.3" r=".6" fill="#fff"/><circle cx="5.8" cy="1.1" r=".5" fill="#7E8791"/><circle cx="2.7" cy="5.9" r=".5" fill="#7E8791"/></pattern>` +
        `<radialGradient id="${u}-shn" gradientUnits="userSpaceOnUse" cx="${lx}" cy="-40" r="150"><stop offset="0" stop-color="#F4F8FF"/><stop offset=".45" stop-color="#E6ECF5" stop-opacity=".75"/><stop offset="1" stop-color="#E6ECF5" stop-opacity="0"/></radialGradient>`;
      face += `<g clip-path="url(#${u}-sec)"><rect class="c08-sheen" x="-${SA}" y="-${SB}" width="${2 * SA}" height="${2 * SB}" fill="url(#${u}-shn)"/><rect x="-${SA}" y="-${SB}" width="${2 * SA}" height="${2 * SB}" fill="url(#${u}-bead)" opacity=".55"/></g>`;
    }
    const tab =
      `<g class="c08-tab"><rect x="${TAB.cx - 22}" y="${TAB.cy - 22}" width="44" height="44" fill="none" pointer-events="all"/>` +
      `<circle cx="${TAB.cx + 1}" cy="${TAB.cy}" r="7.6" class="c08-white"/>` +
      `<rect x="${TAB.cx - TAB.hw}" y="${TAB.cy - TAB.hh}" width="${2 * TAB.hw}" height="${2 * TAB.hh}" rx="${TAB.r}" fill="${BLUE}" mask="url(#${u}-tbm)"/></g>`;
    const keyl = flat ? "" : `<g filter="url(#${u}-stk)"><use href="#${u}-die" class="${stock}"/></g>`;
    // what the peel shows: the layer under the slab (last week's slab; '– –' with no history)
    const under = flat
      ? ""
      : `<g class="c08-under"><use href="#${u}-die" class="${stock}"/><use href="#${u}-se" fill="${mix(SI.face, "#ffffff", 0.5)}"/>` +
        `<g class="c08-ex0">${digits(`fill="${SI.ink}" fill-opacity=".45"`).replace(`>${esc(ovr)}<`, ">– –<")}</g>` +
        `<g class="c08-ex1">${digits(`fill="${SI.ink}" fill-opacity=".6"`).replace(`>${esc(ovr)}<`, ">81<")}<text x="0" y="66" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="9" fill="${SI.ink}">${c.ar ? "مثال" : "Exemple"}</text></g></g>`;
    const front = `<g class="c08-front" clip-path="url(#${u}-pc)"><g class="c08-skin">${keyl}${face}${dig}</g>${tab}</g>`;
    const flap = flat ? "" : `<g class="c08-flap" clip-path="url(#${u}-pc)" style="display:none"><use href="#${u}-die" fill="url(#${u}-bk)" filter="url(#${u}-stk)"/></g>`;
    defs +=
      `<clipPath id="${u}-pc" clipPathUnits="userSpaceOnUse"><polygon points="-2000,-2000 2000,-2000 2000,2000 -2000,2000"/></clipPath>` +
      `<linearGradient id="${u}-bk" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="60" y2="0"><stop offset="0" stop-color="#A9B1BC"/><stop offset=".35" stop-color="#DDE2E8"/><stop offset="1" stop-color="#F3F5F8"/></linearGradient>`;
    const peel = { x: TAB.cx + TAB.hw + 6, y: TAB.cy + TAB.hh + 6 };
    const body =
      `<g class="c08-num" transform="translate(${c.slab.x} ${c.slab.y}) rotate(${SLAP})" data-cx="${peel.x}" data-cy="${peel.y}">` + under + front + flap + `</g>`;
    return { defs, body };
  }

  /* ---------- the whole cluster ---------- */
  function art(p, o, u, lay = {}) {
    const ar = MC.isAr(o);
    const rtl = ar;
    const S = MC.s(o);
    const tier = tierOf(p);
    const thumb = !!o.thumb;
    const home = tier === "HOMA";
    const legend = tier === "LEGEND";
    const sg = rtl ? -1 : 1;
    const X = (x) => (rtl ? VW - x : x);
    const stock = home ? "c08-paper" : "c08-white";
    const c = { tier, ar, rtl, thumb, sg, S, o, flat: legend };
    c.disc = { x: X(64), y: 64, R: 52 };
    c.slab = { x: X(170), y: 176 };
    let defs = stickerFilter(`${u}-stk`);
    let body = "";
    const lam = [];

    /* the name strip's content decides its width (and so where the founder slip sits) */
    const nm = MC.nameOf(p, o);
    let nfs = 28;
    let nW = measure(nm, '"Changa"', 800, nfs, ar ? 0.5 : 0.62);
    const idW = thumb ? 0 : Math.max(measure(p.id, '"Manrope"', 700, 9, 0.62), measure(p.season, '"Manrope"', 700, 9, 0.62)) + 2;
    const fixed = 14 + (thumb ? 0 : 10 + idW) + 14;
    const maxNW = 236 - fixed;
    if (nW > maxNW) {
      nfs = Math.max(20, (nfs * maxNW) / nW);
      nW = measure(nm, '"Changa"', 800, nfs, ar ? 0.5 : 0.62);
    }
    const squeeze = nW > maxNW;
    if (squeeze) nW = maxNW;
    const sw = r1(fixed + nW);
    const sH = ar ? 48 : 40;
    const strip = { x: X(22), y: 292, rot: 2 };
    /* the stat strip: one row, the tier word first */
    const statTxt = [S.tiers[tier]].concat(MC.STATS.map((k) => `${S.stats[k]} ${p.stats[k]}`)).join(" · ");
    let tW = ar ? measure(statTxt, '"Noto Sans Arabic"', 700, 12, 0.5) : measure(statTxt, '"Manrope"', 800, 12.5, 0.6) * 1.03;
    const tFit = tW > 250;
    if (tFit) tW = 250;
    const stw = r1(tW + 22);
    const stats = { x: X(26), y: 334, rot: -1 };
    const slipC = { x: sg * (sw + 6), y: 1, rot: -5 };

    /* LEGEND: the whole cluster kiss-cut as one sticker, one smooth outer die line */
    if (legend) {
      const fans = [1, 2, 3].map((k) => ({ x: c.slab.x + sg * 7 * k, y: c.slab.y - 6 * k, a: SLAP + 2 * k }));
      const key = [rtl ? 1 : 0, sw, stw, p.founder ? 1 : 0].join("|");
      let KP = kissCache.get(key);
      if (!KP) {
        const f = (x, y) => {
          // the slab and its layers overlap, so they join with a plain min; the smooth joins are
          // only between groups (repeated smooth joins of near-equal distances would bloat the die)
          let dz = Infinity;
          for (const s of [{ ...c.slab, a: SLAP }, ...fans]) {
            const [lx, ly] = toLocal(x, y, s.x, s.y, s.a);
            dz = Math.min(dz, dieFace(lx, ly));
          }
          let d = smin(Math.hypot(x - c.disc.x, y - c.disc.y) - c.disc.R, dz, 30);
          let [lx, ly] = toLocal(x, y, strip.x, strip.y, strip.rot);
          d = smin(d, sdBox(lx - (sg * sw) / 2, ly, sw / 2, sH / 2, 3), 30);
          if (p.founder) {
            const [qx, qy] = toLocal(lx, ly, slipC.x, slipC.y, slipC.rot);
            d = smin(d, sdBox(qx, qy, 17, 17, 3), 18);
          }
          [lx, ly] = toLocal(x, y, stats.x, stats.y, stats.rot);
          d = smin(d, sdBox(lx - (sg * stw) / 2, ly, stw / 2, 14, 3), 22);
          return d - KEY;
        };
        KP = loopPath(contour(f, -16, -16, VW + 16, VH + 16, 2), 0.12);
        kissCache.set(key, KP);
      }
      defs += `<path id="${u}-kiss" d="${KP}"/>`;
      body += `<g filter="url(#${u}-stk)"><use href="#${u}-kiss" class="c08-white"/></g>`;
    } else {
      /* the print layers under the slab, fanned toward the top-end, keylines only */
      for (let k = LAYERS[tier]; k >= 1; k--) {
        body += `<g transform="translate(${c.slab.x + sg * 7 * k} ${c.slab.y - 6 * k}) rotate(${SLAP + 2 * k})"><use href="#${u}-die" class="${stock}" filter="url(#${u}-stk)"/></g>`;
        lam.push(`<use href="#${u}-die" fill="#fff" transform="translate(${c.slab.x + sg * 7 * k} ${c.slab.y - 6 * k}) rotate(${SLAP + 2 * k})"/>`);
      }
      /* the share's edge view: the stack's thickness under the slab */
      for (let k = lay.edges || 0; k >= 1; k--) {
        body += `<g transform="translate(${r1(c.slab.x - sg * 0.6 * k)} ${r1(c.slab.y + 2.6 * k)}) rotate(${SLAP})"><use href="#${u}-die" class="${stock}" filter="url(#${u}-stk)"/></g>`;
      }
    }

    /* the number slab, slapped at -6deg (the same die in both directions) */
    const N = slabArt(u, p, c);
    defs += N.defs;
    body += N.body;
    lam.push(`<use href="#${u}-die" fill="#fff" transform="translate(${c.slab.x} ${c.slab.y}) rotate(${SLAP})"/>`);

    /* the avatar disc, slapped over the slab's top-start corner */
    const D = discArt(u, p, c);
    defs += D.defs;
    body += D.body;
    lam.push(D.lam);

    /* the name strip, with the founder slip slapped under its inline end */
    const ink = INK;
    let st = `<g class="c08-strip" transform="translate(${strip.x} ${strip.y}) rotate(${strip.rot})">`;
    if (p.founder) {
      const yy = String(p.founder).slice(-2);
      st +=
        `<g transform="translate(${slipC.x} ${slipC.y}) rotate(${slipC.rot})"><g class="c08-slip">` +
        (legend ? "" : `<g filter="url(#${u}-stk)"><rect x="-20" y="-20" width="40" height="40" rx="5" class="c08-white"/></g>`) +
        `<rect x="-17" y="-17" width="34" height="34" rx="3" fill="${INK}"/>` +
        `<text x="${r1(sg * 5.6)}" y="6.4" text-anchor="middle" font-family="Changa" font-weight="800" font-size="18" fill="#fff" direction="ltr">${esc(yy)}</text></g></g>`;
    }
    const sx = rtl ? -sw : 0;
    st += legend
      ? `<rect x="${sx}" y="${-sH / 2}" width="${sw}" height="${sH}" rx="3" class="c08-white" stroke="${INK}" stroke-opacity=".14" stroke-width=".7"/>`
      : `<g filter="url(#${u}-stk)"><rect x="${sx}" y="${-sH / 2}" width="${sw}" height="${sH}" rx="3" class="${stock}"/></g>`;
    const fit = squeeze ? ` textLength="${r1(nW)}" lengthAdjust="spacingAndGlyphs"` : "";
    st += ar
      ? `<text x="-14" y="${r1(nfs * 0.36)}" text-anchor="start" font-family="Changa" font-weight="800" font-size="${r1(nfs)}" fill="${ink}" direction="rtl"${fit}>${esc(nm)}</text>`
      : `<text x="14" y="${r1(nfs * 0.315)}" font-family="Changa" font-weight="800" font-size="${r1(nfs)}" fill="${ink}" direction="ltr"${fit}>${esc(nm)}</text>`;
    if (!thumb) {
      // the BotolaGO ID and the season, printed on the strip
      const ix = rtl ? -(14 + nW + 10) : 14 + nW + 10;
      const anchor = rtl ? "end" : "start";
      st +=
        `<text x="${r1(ix)}" y="-1.8" text-anchor="${anchor}" font-family="Manrope" font-weight="700" font-size="9" fill="${INK2}" direction="ltr" style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>` +
        `<text x="${r1(ix)}" y="9.4" text-anchor="${anchor}" font-family="Manrope" font-weight="700" font-size="9" fill="${INK2}" direction="ltr" style="font-variant-numeric:tabular-nums">${esc(p.season)}</text>`;
    }
    st += `</g>`;
    body += st;

    /* the stat strip */
    let ss = `<g class="c08-stats" transform="translate(${stats.x} ${stats.y}) rotate(${stats.rot})">`;
    const tx0 = rtl ? -stw : 0;
    ss += legend
      ? `<rect x="${tx0}" y="-14" width="${stw}" height="28" rx="3" class="c08-white" stroke="${INK}" stroke-opacity=".14" stroke-width=".7"/>`
      : `<g filter="url(#${u}-stk)"><rect x="${tx0}" y="-14" width="${stw}" height="28" rx="3" class="${stock}"/></g>`;
    if (!thumb) {
      const tf = tFit ? ` textLength="${r1(tW)}" lengthAdjust="spacingAndGlyphs"` : "";
      ss += ar
        ? `<text x="-11" y="4.6" text-anchor="start" font-family="Noto Sans Arabic" font-weight="700" font-size="12" fill="${ink}" direction="rtl"${tf}>${esc(statTxt)}</text>`
        : `<text x="11" y="4.5" font-family="Manrope" font-weight="800" font-size="12.5" fill="${ink}" direction="ltr" style="font-variant-numeric:tabular-nums"${tf}>${esc(statTxt)}</text>`;
    }
    ss += `</g>`;
    body += ss;

    /* PRO: gloss laminate, one specular band at 35deg over every sticker but the founder slip */
    if (tier === "PRO") {
      const slipMask = p.founder ? `<g transform="translate(${strip.x} ${strip.y}) rotate(${strip.rot}) translate(${slipC.x} ${slipC.y}) rotate(${slipC.rot})"><rect x="-20" y="-20" width="40" height="40" fill="#000"/></g>` : "";
      lam.push(slipMask);
      lam.push(`<rect x="${sx}" y="${-sH / 2}" width="${sw}" height="${sH}" fill="#fff" transform="translate(${strip.x} ${strip.y}) rotate(${strip.rot})"/>`);
      lam.push(`<rect x="${tx0}" y="-14" width="${stw}" height="28" fill="#fff" transform="translate(${stats.x} ${stats.y}) rotate(${stats.rot})"/>`);
      // the band's centre line runs through (150,168) at 35deg; the gradient runs across it
      const nx = sg * 0.574;
      const ny = 0.819;
      const g0 = [X(150) - nx * 60, 168 - ny * 60];
      const g1 = [X(150) + nx * 60, 168 + ny * 60];
      defs +=
        `<linearGradient id="${u}-lg" gradientUnits="userSpaceOnUse" x1="${r1(g0[0])}" y1="${r1(g0[1])}" x2="${r1(g1[0])}" y2="${r1(g1[1])}">` +
        `<stop offset=".283" stop-color="#fff" stop-opacity="0"/><stop offset=".284" stop-color="#fff" stop-opacity=".6"/><stop offset=".29" stop-color="#fff" stop-opacity=".6"/>` +
        `<stop offset=".291" stop-color="#fff" stop-opacity=".26"/><stop offset=".42" stop-color="#fff" stop-opacity=".15"/><stop offset=".717" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<mask id="${u}-lm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${VW + 40}" height="${VH + 40}">${lam.join("")}</mask>`;
      body += `<g mask="url(#${u}-lm)" class="c08-lam"><rect class="c08-lammove" x="0" y="0" width="${VW}" height="${VH}" fill="url(#${u}-lg)"/></g>`;
    }

    /* LEGEND moment hooks: the die line that the cutter traces, and one flash frame */
    if (legend) {
      body +=
        `<use href="#${u}-kiss" class="c08-cut" fill="none" stroke="${INK}" stroke-width="2.6" pathLength="1"/>` +
        `<use href="#${u}-kiss" class="c08-flashf" fill="#fff"/>`;
    }
    return { defs, body };
  }

  /* ---------- token (44-80px) and mini (24-32px): the slab, its print layers seen edge-on ---------- */
  function token(p, o = {}) {
    const h = o.size || 44;
    const mini = !!o.mini || h <= 32;
    const u = MC.uid("c08t");
    const rtl = MC.isAr(o);
    const S = MC.s(o);
    const tier = tierOf(p);
    const legend = tier === "LEGEND";
    const home = tier === "HOMA";
    const big = !mini && h >= 64;
    const SI = slabInk(p, tier);
    const C = clubOf(p);
    const n = LAYERS[tier];
    const kp = mini ? (h <= 24 ? 1.5 : 2) : Math.min(3, Math.max(1.75, h / 26)); // keyline, px
    const ep = mini ? 1.05 : h >= 64 ? 1.6 : 1.35; // edge-line pitch, px
    const hp = 0.8; // hairline, px
    const s = (h - 2 * kp - 3 * ep - 2 * hp - 0.6 - (big ? 0.04 * h : 0)) / 160; // px per die unit
    const k = 1 / s; // die units per px
    const halfW = 101 * s + kp + hp;
    const halfH = 80 * s + kp + hp;
    const slipPx = mini ? (h <= 24 ? 5.4 : 6) : 34 * s + 1.2;
    const dd = 0.35 * h; // disc diameter at 64-80px
    let W;
    let cx;
    let cy;
    let disc = null;
    if (big) {
      const Ro = dd / 2;
      disc = { x: Ro + 0.5, y: Ro + 0.5, R: Ro - 0.75 * kp - hp };
      cx = disc.x + 0.12 * Ro + halfW;
      cy = h - halfH - 3 * ep - 0.4;
      W = Math.ceil(cx + halfW + 0.6);
    } else {
      cx = halfW + slipPx * 0.42;
      cy = h - halfH - 3 * ep - 0.3;
      W = Math.ceil(cx + halfW + 0.6);
    }
    if (rtl) {
      // the die is never mirrored; the disc moves to the top-right
      if (disc) {
        disc.x = W - disc.x;
        cx = W - cx;
      }
    }
    const place = (dy) => `translate(${r2(cx)} ${r2(cy + dy)}) rotate(${SLAP}) scale(${r2(s * 1000) / 1000})`;
    // LEGEND: slab and tab merge into one smooth kiss-cut pill (the outline change)
    const PILL = { x: 4, y: 2, hw: 112, hh: 82 };
    const pill = (attrs, m) =>
      `<rect x="${r1(PILL.x - PILL.hw - m)}" y="${r1(PILL.y - PILL.hh - m)}" width="${r1(2 * PILL.hw + 2 * m)}" height="${r1(2 * PILL.hh + 2 * m)}" rx="${r1(PILL.hh + m)}" ${attrs}/>`;
    const faceShapes = legend
      ? (attrs, m) => pill(attrs, m)
      : (attrs, m) =>
          `<path d="${SEP_S}" ${attrs} stroke-width="${r2(2 * m)}" stroke-linejoin="round"/>` +
          `<rect x="${TAB.cx - TAB.hw}" y="${TAB.cy - TAB.hh}" width="${2 * TAB.hw}" height="${2 * TAB.hh}" rx="${TAB.r}" ${attrs} stroke-width="${r2(2 * m)}" stroke-linejoin="round"/>`;
    const stockVar = home ? "var(--c08-paper)" : "var(--c08-white)";
    const paint = (v) => `style="fill:${v};stroke:${v}"`;
    const fillV = (v) => `style="fill:${v}"`;
    const layer = (dy) =>
      `<g transform="${place(dy)}">` +
      faceShapes(paint("var(--c08-hair)"), (kp + hp) * k) +
      faceShapes(paint(stockVar), kp * k) +
      `</g>`;
    let svg = "";
    let defs = `<clipPath id="${u}-sec"><path d="${SEP_S}"/></clipPath>`;
    // FOUNDER 2026: the first slip, a black square peeking from under the bottom-start of the stack
    if (p.founder) {
      const sc0 = cx - halfW + slipPx * 0.35;
      const sy0 = cy + halfH * 0.5 + 3 * ep * 0.4;
      const kk = mini ? 0.7 : 0.9;
      svg +=
        `<g transform="translate(${r2(sc0)} ${r2(sy0)}) rotate(-4)"><rect x="${r2(-slipPx / 2 - kk - hp)}" y="${r2(-slipPx / 2 - kk - hp)}" width="${r2(slipPx + 2 * kk + 2 * hp)}" height="${r2(slipPx + 2 * kk + 2 * hp)}" rx="1" ${fillV("var(--c08-hair)")}/>` +
        `<rect x="${r2(-slipPx / 2 - kk)}" y="${r2(-slipPx / 2 - kk)}" width="${r2(slipPx + 2 * kk)}" height="${r2(slipPx + 2 * kk)}" rx=".8" ${fillV("var(--c08-white)")}/>` +
        `<rect x="${r2(-slipPx / 2)}" y="${r2(-slipPx / 2)}" width="${r2(slipPx)}" height="${r2(slipPx)}" rx=".5" fill="${INK}"/></g>`;
    }
    let discSvg = "";
    if (disc) {
      const R = disc.R;
      const sA = (0.6 * R) / 52;
      const hx = disc.x - (rtl ? -1 : 1) * 0.2 * R;
      const top = disc.y - 1.06 * R;
      defs += `<clipPath id="${u}-cd"><circle cx="${r2(disc.x)}" cy="${r2(disc.y)}" r="${r2(R)}"/></clipPath>`;
      discSvg +=
        `<circle cx="${r2(disc.x)}" cy="${r2(disc.y)}" r="${r2(R + 0.75 * kp + hp)}" ${fillV("var(--c08-hair)")}/>` +
        `<circle cx="${r2(disc.x)}" cy="${r2(disc.y)}" r="${r2(R + 0.75 * kp)}" ${fillV(stockVar)}/>` +
        `<g clip-path="url(#${u}-cd)"><rect x="${r2(disc.x - R)}" y="${r2(disc.y - R)}" width="${r2(2 * R)}" height="${r2(2 * R)}" fill="${home ? PAPER : C.c}"/>` +
        (() => {
          // flat at this size: a cream rim light on the upper-start edge (the figure offset over itself), hood in ink, jacket a shade lighter
          const at = (dx, dy, q) => MC.avatar({ x: r2(hx - 100 * sA + dx), y: r2(top - 44 * sA + dy), w: r2(200 * sA), h: r2(240 * sA), seam: false, ...q });
          const lit = home ? INK : C.on;
          const off = rtl ? -0.9 : 0.9;
          return at(0, 0, { torso: lit, hoodFill: lit }) + at(off, 0.9, { torso: mix(INK, home ? "#9a9a9a" : C.on, 0.4), hoodFill: home ? "#3a3a3a" : INK });
        })() +
        `</g>`;
    }
    for (let i = n; i >= 1; i--) svg += layer(i * ep);
    // the slab itself
    svg += `<g transform="${place(0)}">`;
    svg += faceShapes(paint("var(--c08-hair)"), (kp + hp) * k) + faceShapes(paint(stockVar), kp * k);
    if (legend) {
      defs += `<clipPath id="${u}-pl">${pill("", 0)}</clipPath>`;
      svg += pill(`fill="${SI.face}"`, 0) + `<g clip-path="url(#${u}-pl)"><rect x="-120" y="-90" width="240" height="${r1(90 - SB + 27)}" fill="${SI.band}"/></g>`;
    } else {
      svg += `<path d="${SEP_S}" fill="${SI.face}"/>`;
      if (SI.band) svg += `<g clip-path="url(#${u}-sec)"><rect x="-${SA}" y="-${SB}" width="${2 * SA}" height="27" fill="${SI.band}"/></g>`;
    }
    const ovr = String(p.ovr);
    const fs = fitFs(ovr);
    svg += `<text x="0" y="${r1(0.314 * fs)}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${fs}" fill="${SI.ink}" direction="ltr">${esc(ovr)}</text>`;
    // the Logo-Blue tab with the logo's ball knocked out (a plain white dot below 64px, none on the mini)
    const tabR = legend ? `x="58" y="49" width="30" height="17" rx="5"` : `x="${TAB.cx - TAB.hw}" y="${TAB.cy - TAB.hh}" width="${2 * TAB.hw}" height="${2 * TAB.hh}" rx="${TAB.r}"`;
    const tb = legend ? { x: 73, y: 57.5, d: 12 } : { x: TAB.cx + 1, y: TAB.cy, d: 16 };
    if (big) {
      defs += `<mask id="${u}-tbm" maskUnits="userSpaceOnUse" x="60" y="52" width="52" height="42"><rect ${tabR} fill="#fff"/>${ballAt(tb.x, tb.y, tb.d, "#000")}</mask>`;
      svg += `<circle cx="${tb.x}" cy="${tb.y}" r="${tb.d / 2}" ${fillV("var(--c08-white)")}/><rect ${tabR} fill="${BLUE}" mask="url(#${u}-tbm)"/>`;
    } else {
      svg += `<rect ${tabR} fill="${BLUE}"/>`;
      if (!mini) svg += `<circle cx="${tb.x}" cy="${tb.y}" r="${r1(Math.min(tb.d / 2 + 1, Math.max(5.5, 1.4 * k)))}" fill="#fff"/>`;
    }
    svg += `</g>` + discSvg;
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${S.tiers[tier]}${p.founder ? ", " + S.founderLine : ""}`;
    return (
      `<span class="c08 c08-tk${mini ? " c08-tk--mini" : ""}" data-tier="${tier}" style="width:${W}px;height:${h}px" role="img" aria-label="${esc(label)}">` +
      `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" aria-hidden="true" focusable="false"><defs>${defs}</defs>${svg}</svg></span>`
    );
  }

  /* ---------- registration ---------- */
  const c = {
    id: "c08",
    n: 8,
    slug: "08",
    name: "Lsaq",
    nameAr: "ملصق",
    category: "youth",
    philosophy:
      "Your number is a die-cut sticker slapped on top of the stack: one fixed die for everyone, the print layers under it, and under everything the first slip BotolaGO ever gave you.",
    philosophyAr: "رقمك ملصق مقصوص يُلصق فوق الكومة: قالب واحد ثابت للجميع، وطبقات الطباعة تحته، وتحت كل شيء أول ملصق أعطاك إياه BotolaGO.",
    idea: [
      "Not a card but a cluster of die-cut vinyl stickers slapped on top of each other. The number sits on one fixed die that is the same for every manager: a 200 × 150 superellipse slab with a Logo-Blue tab fused to its bottom-end corner, a 12-unit white keyline round both, slapped at −6°. The 84 is printed on it in Changa 800, and a 71 or a 47 gets exactly the same outline. The tab carries the logo's own ball, knocked out of the blue as a clean hole, so the brand sits on the die without being redrawn.",
      "Around the slab: a round avatar sticker at the top-start, printed as a two-colour halftone of the shared hooded manager seen from behind (head and one shoulder entering from the bottom-start, rim-lit, the country printed straight across the back of the jacket); a white name strip at +2° that carries the name, the BotolaGO ID and the season; and one stat strip at −1° that reads the tier word first, then the four stats. Depth comes only from overlap, a 1px hairline and a small drop shadow.",
      "What stays constant, and therefore what BotolaGO owns: the −6° slap, the fused ball tab, the disc bump at the top-start, and the fanned keyline edges of the layers under the slab. The slab is the club's colour with its second colour as ink, so the club the user chose is the biggest colour on the object.",
    ],
    belonging: [
      "It is the only identity in the set you can literally send: the slab, the 26 slip and the name strip are already stickers, which is how Moroccan group chats answer 'what's your number?'. A WhatsApp sticker export (512 × 512, your own stickers only, never random, never called a pack) is proposed, not built.",
      "The print run is something teens can trade on: paper, matte vinyl, gloss, flock, reflective. Each tier adds a print layer under the slab, so a CHAMPION stack is visibly thicker than a STADE one, at every size.",
      "'ALI ·26' is the founder flex nobody can get later: the year after the name, the way supporter groups carry their founding year, made from a sticker rather than a badge.",
      "Under the slab is last week's slab: peel the ball tab and it shows. That turns weekly OVR history into something you touch, without ever hiding the current number.",
    ],
    founderMark: [
      "The first slap. Every founder cluster starts with the same small square sticker, slapped down before anything else existed: 34 × 34, matte ink black, a white '26' in Changa 800 on its visible two-thirds, a 3-unit white keyline. It sits under the name strip's inline end, so the strip reads 'ALI ·26' at arm's length.",
      "It never takes the laminate, the flock or the reflective finish; flat matte black beside a glossy or velvet stack is the tell. Later cohorts' first slips would be round and carry their own year, so 2026 stays the only square one. At 24–80px it is a black square peeking from under the bottom-start of the stack, never smaller than 4.6px.",
      "Its issue ceremony, 'le premier collage', is optional and replayable: the slip slaps down in 120ms with a 2° overshoot. Everything else is applied on top of it.",
    ],
    small: [
      "64–80px (hub team card, head-to-head): the slab at −6° with its club colour and the 84, a 3px keyline, the tab with the logo's ball, the avatar disc peeking at the top-start, the print layers as stacked edges under the slab, and the founder slip.",
      "44–56px (the 'My position' row): the slab, the tab with a white dot, the layers and the slip. The club colour fills the slab (HOMA and LEGEND carry it as a printed band).",
      "24–32px (inside the ranking row's name cell): the same slab with the number at about 15px, a 2px keyline, a 3px blue tab and the 26 slip as a black square. The tier is the number of 1px edge lines under the slab (HOMA 0, STADE 1, PRO 2, CHAMPION 3); LEGEND alone turns slab and tab into one smooth lozenge.",
    ],
    rtl: [
      "The die is never mirrored: the slab keeps its −6° slap and the tab stays at its bottom-right corner, and the digits stay left-to-right. The avatar disc moves to the top-right, the fanned layers to the top-left, and the strips reflow from the right edge with the founder slip under the name strip's inline end (the left), so it reads '·26 علي' in visual order.",
      "علي is set in Changa 800 at 28 units in a 48-unit strip. The stat strip is Noto Sans Arabic 700 with the product's own labels (محترف · القائد 91 · التشكيلة 82 · الانتقالات 86 · الثبات 78), and المغرب runs across the back of the jacket. No letter-spacing on Arabic anywhere.",
    ],
    tiers: {
      HOMA: "A new paper sticker, matte, crisp and cleanly cut, with toner-black digits on white paper and the club colour printed as a band across the top of the slab. The avatar is a coarse one-ink halftone. Full outline, no print layers.",
      STADE: "Matte vinyl with a clean die-cut: the slab in the club colour, the digits in the club's second colour, a finer two-ink halftone. One print layer under the slab.",
      PRO: "Gloss laminate: one specular band at 35° with a crisp upper edge runs across every sticker except the founder slip. Two print layers.",
      CHAMPION: "Flocked vinyl: the club colour deepened 15%, a fine velvet nap and the lighter edge velvet catches, velvet digits. Deep and matte. Three print layers.",
      LEGEND: "Retroreflective sheeting: a silver slab with ink digits and glass-bead grain that blazes when the phone tilts toward the light or the tab is tapped (the flash). The whole cluster is kiss-cut as one sticker with one smooth outer die line round disc, slab, layers and strips, which changes the black-and-white outline. Nothing glows on its own; the stats stay on the front.",
    },
    legend: [
      "On the first open after the tier-up, and replayable: a cutting line traces the one smooth die round the whole cluster (600ms), the cluster lifts as one piece and slaps down (2° overshoot), and one flash frame at 30% shows the reflective blaze once. The 84 is visible the whole time.",
      "The adult desire has to come from restraint: one material (reflective silver), one outline change, no gold and no chrome.",
    ],
    advantages: [
      "One fixed die: the outline is identical for every manager and every rating, so the silhouette is ownable and the 1-bit test holds from the full card down to 24px.",
      "The mini is the object itself, not a code: the slab, the tab and the 26 slip survive at 24px, and the tier reads as print layers.",
      "Native to how teenagers talk (stickers in group chats, sticker-bombed binders, the Panini packet from the hanout) without zellige, flags or ultras imagery.",
      "A print-run ladder built from materials, not colours: paper, matte, gloss, flock, reflective.",
      "The club the user chose is the slab's colour, the biggest colour on the object.",
    ],
    risks: [
      "Stickers can read childish to users over 35; LEGEND's reflective restraint has to carry adult desire, and that is unproven.",
      "Nobody shares a 52: the share needs testing with an OVR of 47.",
      "The layers under the slab need per-gameweek OVR history to be honest about 'last week' (display only); the lab shows '– –' and a labelled Exemple.",
      "Every app has stickers, so ownership rests on the ball tab and the −6° slap.",
      "PRO and CHAMPION differ by finish and one layer; at 28px that is a one-line difference.",
      "The concept name is Darija and needs the owner's sign-off (Arabic name: ملصق).",
    ],
    gridWidth: 236,
    detailWidth: 380,

    full(p, o = {}) {
      const u = MC.uid("c08");
      const S = MC.s(o);
      const { defs, body } = art(p, o, u);
      return (
        `<div class="c08 c08-card${o.motion ? " c08--motion" : ""}${o.thumb ? " c08--thumb" : ""}" data-tier="${esc(tierOf(p))}" data-u="${u}" dir="${S.dir}"${MC.isAr(o) ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
        `<svg class="c08-art" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false"><defs>${defs}</defs><g class="c08-cluster">${body}</g></svg></div>`
      );
    },

    token,

    // The "My position" compact card: rank, the 48px token, the name, points. No tier column.
    row(p, o = {}) {
      const S = MC.s(o);
      const tier = tierOf(p);
      return (
        `<div class="c08 c08-row${o.me ? " is-me" : ""}" data-tier="${tier}" dir="${S.dir}">` +
        `<span class="c08-rk">${MC.ltr(o.rank)}</span>` +
        `<span class="c08-rtk">${token(p, { ...o, size: 48, mini: false })}</span>` +
        `<span class="c08-rn">${esc(MC.nameOf(p, o))}</span>` +
        `<span class="c08-rp"><b>${MC.ltr(o.pts)}</b><small>${esc(S.pts)}</small></span>` +
        `</div>`
      );
    },

    // 'Le classeur': your fresh cluster slapped across a school ring binder's cover.
    share(p, o = {}) {
      const u = MC.uid("c08s");
      const ar = MC.isAr(o);
      const S = MC.s(o);
      const { defs, body } = art(p, { ...o, thumb: false }, u + "a", { edges: 3 });
      const sc = 150 / 140; // the 84 at 150px
      const tx = r1(180 - (sc * VW) / 2);
      const ty = 112;
      const L = (x) => (ar ? 360 - x : x);
      const faded = (x, y, rot, shape, fill) =>
        `<g transform="translate(${L(x)} ${y}) rotate(${ar ? -rot : rot})" filter="url(#${u}-fstk)">${shape.replace("FILL", fill)}</g>`;
      const svg =
        `<svg class="c08-sh-art" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>${defs}` +
        `<filter id="${u}-peb" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="3" result="n"/>` +
        `<feDiffuseLighting in="n" surfaceScale=".75" lighting-color="#ffffff" result="l"><feDistantLight azimuth="${ar ? 315 : 225}" elevation="60"/></feDiffuseLighting>` +
        `<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.08" k2="0" k3="0" k4="0"/></filter>` +
        `<clipPath id="${u}-cov"><path d="${ar ? "M360 0V640H28Q14 640 14 626V14Q14 0 28 0Z" : "M0 0H332Q346 0 346 14V626Q346 640 332 640H0Z"}"/></clipPath>` +
        `<filter id="${u}-fstk" x="-15%" y="-15%" width="130%" height="135%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation=".8" result="b"/><feOffset in="b" dy=".8" result="o"/><feFlood flood-color="#5a4300" flood-opacity=".22"/><feComposite in2="o" operator="in" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
        `<linearGradient id="${u}-lit" x1="${ar ? 1 : 0}" y1="0" x2="${ar ? 0 : 1}" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#3a2a00" stop-opacity=".22"/></linearGradient>` +
        `<linearGradient id="${u}-spine" x1="${ar ? 1 : 0}" y1="0" x2="${ar ? 0 : 1}" y2="0"><stop offset="0" stop-color="#3a2a00" stop-opacity=".28"/><stop offset="1" stop-color="#3a2a00" stop-opacity="0"/></linearGradient>` +
        `</defs>` +
        // the desk, then the cover: yellow polypropylene, pebbled, hinged at the start edge, its end edge rounded
        `<rect width="360" height="640" fill="#2A2E35"/>` +
        `<rect x="${ar ? 12 : 0}" y="3" width="348" height="640" rx="14" fill="#000" fill-opacity=".35"/>` +
        `<g clip-path="url(#${u}-cov)"><rect width="360" height="640" fill="#E9B41E" filter="url(#${u}-peb)"/>` +
        `<rect x="${ar ? 324 : 0}" width="36" height="640" fill="url(#${u}-spine)"/>` +
        `<rect x="${L(34) - (ar ? 1.4 : 0)}" width="1.4" height="640" fill="#5a4300" fill-opacity=".35"/><rect x="${L(35.6) - (ar ? 1 : 0)}" width="1" height="640" fill="#fff" fill-opacity=".35"/>` +
        `<rect x="${L(42) - (ar ? 1.4 : 0)}" width="1.4" height="640" fill="#5a4300" fill-opacity=".3"/><rect x="${L(43.6) - (ar ? 1 : 0)}" width="1" height="640" fill="#fff" fill-opacity=".3"/>` +
        `<rect width="360" height="640" fill="url(#${u}-lit)"/>` +
        // the spine's label pocket: a blank card under clear plastic
        `<g transform="translate(${L(17)} 330)"><rect x="-11" y="-92" width="22" height="184" rx="3" fill="#F7F4EA"/><rect x="-11" y="-92" width="22" height="184" rx="3" fill="none" stroke="#5a4300" stroke-opacity=".3"/><rect x="${ar ? 2 : -9}" y="-88" width="7" height="176" rx="2" fill="#fff" fill-opacity=".45"/></g>` +
        // a few blank, sun-faded stickers from before
        faded(300, 92, 12, `<circle r="30" fill="#F3F0E6"/><circle r="25" fill="FILL"/>`, "#CFE2E2") +
        faded(314, 300, -9, `<rect x="-26" y="-36" width="52" height="72" rx="6" fill="#F3F0E6"/><rect x="-21" y="-31" width="42" height="62" rx="3" fill="FILL"/>`, "#EBD9D5") +
        faded(54, 548, -14, `<rect x="-40" y="-24" width="80" height="48" rx="24" fill="#F3F0E6"/><rect x="-35" y="-19" width="70" height="38" rx="19" fill="FILL"/>`, "#DCD9EA") +
        faded(300, 596, 7, `<circle r="22" fill="#F3F0E6"/><circle r="18" fill="FILL"/>`, "#F1E7C8") +
        // your fresh cluster, slapped across it
        `</g>` +
        `<g transform="translate(${tx} ${ty}) scale(${r2(sc * 1000) / 1000})">${body}</g>` +
        `</svg>`;
      const ex = ar ? "مثال" : "Exemple";
      const gw = ar ? "الجولة 7" : "J.07";
      const handle = "@" + String(p.name.lat).toLowerCase();
      return (
        `<div class="c08 c08-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
        svg +
        `<div class="c08-sh-logo">${MC.logo("wordmark", { variant: "color", w: "100%" })}</div>` +
        `<div class="c08-sh-strip"><span>${MC.ltr(handle)}</span><i>·</i><span>${MC.ltr(p.id)}</span><i>·</i><span>${ar ? esc(gw) : MC.ltr(gw)}</span><i>·</i><em>${esc(ex)}</em></div>` +
        `</div>`
      );
    },

    /* Peel: drag the ball tab and the slab folds back over itself to show the layer under it
       (last week's slab; '– –' with no history, a double-click shows a labelled Exemple).
       Release and it slaps back in 90ms. Under reduced motion a tap toggles that layer.
       LEGEND is kiss-cut as one sticker: tapping the tab fires the reflective flash instead. */
    mount(el) {
      if (!el || !el.classList || !el.classList.contains("c08-card") || el.dataset.c08m) return;
      el.dataset.c08m = "1";
      const u = el.dataset.u;
      const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        const tx = (e.clientX - r.left) / r.width - 0.5;
        const ty = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--c08-tx", tx.toFixed(3));
        el.style.setProperty("--c08-ty", ty.toFixed(3));
        el.style.setProperty("--c08-lit", Math.max(0, 1 - Math.hypot(tx, ty) * 2.2).toFixed(3));
      });
      el.addEventListener("pointerleave", () => {
        ["--c08-tx", "--c08-ty", "--c08-lit"].forEach((k) => el.style.removeProperty(k));
      });
      el.addEventListener("dblclick", () => el.classList.toggle("c08-ex"));
      const tab = el.querySelector(".c08-tab");
      if (!tab) return;
      tab.style.cursor = "pointer";
      if (el.dataset.tier === "LEGEND") {
        let t = 0;
        tab.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          el.classList.add("c08-flash");
          clearTimeout(t);
          t = setTimeout(() => el.classList.remove("c08-flash"), reduce ? 1600 : 900);
        });
        return;
      }
      const num = el.querySelector(".c08-num");
      const front = el.querySelector(".c08-front");
      const skin = el.querySelector(".c08-skin");
      const flap = el.querySelector(".c08-flap");
      const flapUse = flap && flap.querySelector("use");
      const poly = el.querySelector(`[id="${u}-pc"] polygon`);
      const grad = el.querySelector(`[id="${u}-bk"]`);
      if (!num || !front || !flap || !flapUse || !poly) return;
      const C = { x: +num.dataset.cx, y: +num.dataset.cy };
      const BIG = 2000;
      const rest = () => {
        poly.setAttribute("points", `-${BIG},-${BIG} ${BIG},-${BIG} ${BIG},${BIG} -${BIG},${BIG}`);
        flap.style.display = "none";
        el.classList.remove("c08-peeling");
      };
      const fold = (P) => {
        const dx = C.x - P.x;
        const dy = C.y - P.y;
        const L = Math.hypot(dx, dy);
        if (L < 2) return rest();
        const nx = dx / L;
        const ny = dy / L;
        const mx = (C.x + P.x) / 2;
        const my = (C.y + P.y) / 2;
        const tx = -ny;
        const ty = nx;
        const pts = [
          [mx + tx * BIG, my + ty * BIG],
          [mx - tx * BIG, my - ty * BIG],
          [mx - tx * BIG - nx * BIG, my - ty * BIG - ny * BIG],
          [mx + tx * BIG - nx * BIG, my + ty * BIG - ny * BIG],
        ];
        poly.setAttribute("points", pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" "));
        const d = mx * nx + my * ny;
        const a = 1 - 2 * nx * nx;
        const b = -2 * nx * ny;
        const e = 1 - 2 * ny * ny;
        flapUse.setAttribute("transform", `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${b.toFixed(4)} ${e.toFixed(4)} ${(2 * d * nx).toFixed(2)} ${(2 * d * ny).toFixed(2)})`);
        if (grad) {
          grad.setAttribute("x1", mx.toFixed(1));
          grad.setAttribute("y1", my.toFixed(1));
          grad.setAttribute("x2", (mx + nx * 70).toFixed(1));
          grad.setAttribute("y2", (my + ny * 70).toFixed(1));
        }
        flap.style.display = "";
        el.classList.add("c08-peeling");
      };
      const local = (e) => {
        const m = num.getScreenCTM();
        if (!m) return null;
        return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      };
      let drag = false;
      let P = null;
      let shown = false;
      tab.style.cursor = "grab";
      tab.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (reduce) {
          shown = !shown;
          (skin || front).style.visibility = shown ? "hidden" : "";
          el.classList.toggle("c08-peeling", shown);
          return;
        }
        drag = true;
        try {
          tab.setPointerCapture(e.pointerId);
        } catch (err) {
          /* capture is optional */
        }
      });
      tab.addEventListener("pointermove", (e) => {
        if (!drag) return;
        P = local(e);
        if (P) fold(P);
      });
      const end = () => {
        if (!drag) return;
        drag = false;
        if (!P) return rest();
        const from = { x: P.x, y: P.y };
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / 90);
          fold({ x: from.x + (C.x - from.x) * k, y: from.y + (C.y - from.y) * k });
          if (k < 1) requestAnimationFrame(step);
          else rest();
        };
        requestAnimationFrame(step);
        P = null;
      };
      tab.addEventListener("pointerup", end);
      tab.addEventListener("pointercancel", end);
    },
  };
  MC.register(c);
})();
