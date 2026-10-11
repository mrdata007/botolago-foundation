/* 02 TIR — the shot.
   BotolaGO's own ball in flight, made into one object. The ball flies to the top-end of a
   300×420 portrait footprint with no frame; its trail falls diagonally to the bottom-start
   and carries everything that is yours: the club band at its root, your name, your 84 on
   its thick end, and your four decisions as four equal lanes. You stand where the shot
   began, pointing at it. The ball carries only its rim panels, the founder strike and its
   printed code. The comet never mirrors: the ball always flies to the right. */
(function () {
  const MC = window.MC;
  const PFX = "c02";
  const r2 = (n) => Math.round(n * 100) / 100;
  const P = (p) => `${r2(p[0])} ${r2(p[1])}`;
  const esc = MC.esc;

  /* ---------- measuring (canvas; the faces are requested up front so render can use them) ---------- */
  try {
    [
      ['800 60px "Changa"', "84 ALI"],
      ['800 30px "Changa"', "علي"],
      ['800 12px "Manrope"', "CAP 91 PRO"],
      ['700 8px "Manrope"', "BOT #004821"],
      ['700 11px "Noto Sans Arabic"', "القائد محترف"],
    ].forEach(([f, t]) => document.fonts && document.fonts.load(f, t).catch(() => {}));
  } catch (e) {
    /* no FontFaceSet: measuring falls back to estimates */
  }
  let ctx2d = null;
  function measure(str, font, px, track = 0) {
    const s = String(str);
    try {
      ctx2d = ctx2d || document.createElement("canvas").getContext("2d");
      ctx2d.font = font.replace("{px}", "100px");
      const m = ctx2d.measureText(s);
      const k = px / 100;
      const extra = track * px * s.length;
      return {
        w: m.width * k + extra,
        l: (m.actualBoundingBoxLeft || 0) * k,
        r: (m.actualBoundingBoxRight != null ? m.actualBoundingBoxRight * k : m.width * k) + extra,
        a: m.actualBoundingBoxAscent != null ? m.actualBoundingBoxAscent * k : px * 0.7,
        d: (m.actualBoundingBoxDescent || 0) * k,
      };
    } catch (e) {
      const w = s.length * px * 0.62;
      return { w, l: 0, r: w, a: px * 0.7, d: 0 };
    }
  }
  const textW = (str, font, px, track = 0) => measure(str, font, px, track).w;
  const F_NUM = '800 {px} "Changa"';
  const F_LAB = '800 {px} "Manrope"';
  const F_AR = '700 {px} "Noto Sans Arabic"';
  /** Changa digits are proportional: centre the ink box, not the advance, on (cx, cy). */
  function numText(str, cx, cy, px, cls, extra = "") {
    const m = measure(String(str), F_NUM, px);
    const x = cx - (m.r - m.l) / 2;
    const y = cy + (m.a - m.d) / 2;
    return `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(px)}" class="c02-t-num ${cls}" direction="ltr"${extra}>${esc(String(str))}</text>`;
  }
  const pent = (cx, cy, R, rot = -90) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = ((rot + i * 72) * Math.PI) / 180;
      return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
  const polar = (cx, cy, r, deg) => [
    cx + r * Math.cos((deg * Math.PI) / 180),
    cy + r * Math.sin((deg * Math.PI) / 180),
  ];
  const poly = (pts) => "M" + pts.map(P).join("L") + "Z";
  /** The user's club colours (the lab's placeholder club; white when no club is set). */
  const clubOf = (p) => ({
    a: (p.club && p.club.primary) || "#FFFFFF",
    b: (p.club && p.club.secondary) || "#FFFFFF",
  });

  /* ================= the full card: one comet, rising diagonally (viewBox 300×420) ================= */
  const VB = { w: 300, h: 420 };
  const C = { x: 224, y: 94, r: 70 };
  const AL = Math.hypot(0.547, 0.837);
  const AX = [-0.547 / AL, 0.837 / AL]; // the chord, from the ball toward the tip (bottom-start), 56.8°
  const AX_DEG = (Math.atan2(AX[1], AX[0]) * 180) / Math.PI;
  const unit = (v) => {
    const m = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / m, v[1] / m];
  };
  /** The shot's arc from the ball centre to `tip`: the chord bowed `sag` toward the upper-start side,
      so the ball arrives flatter than it left. s runs from 0 (ball centre) to S (the tip). */
  function makeAxis(tip, sag) {
    const S = Math.hypot(tip[0] - C.x, tip[1] - C.y);
    const ax = [(tip[0] - C.x) / S, (tip[1] - C.y) / S];
    const nm = [ax[1], -ax[0]]; // across the chord, toward the trail's lower-end edge
    const qc = [(C.x + tip[0]) / 2 - nm[0] * 2 * sag, (C.y + tip[1]) / 2 - nm[1] * 2 * sag];
    const d0 = unit([qc[0] - C.x, qc[1] - C.y]);
    const d1 = unit([tip[0] - qc[0], tip[1] - qc[1]]);
    function axis(s) {
      if (s <= 0) return { p: [C.x + d0[0] * s, C.y + d0[1] * s], d: d0 };
      if (s >= S) return { p: [tip[0] + d1[0] * (s - S), tip[1] + d1[1] * (s - S)], d: d1 };
      const t = s / S;
      const u = 1 - t;
      const p = [
        u * u * C.x + 2 * u * t * qc[0] + t * t * tip[0],
        u * u * C.y + 2 * u * t * qc[1] + t * t * tip[1],
      ];
      const d = unit([
        2 * u * (qc[0] - C.x) + 2 * t * (tip[0] - qc[0]),
        2 * u * (qc[1] - C.y) + 2 * t * (tip[1] - qc[1]),
      ]);
      return { p, d };
    }
    const at = (s, off = 0) => {
      const a = axis(s);
      return [a.p[0] + a.d[1] * off, a.p[1] - a.d[0] * off];
    };
    const ang = (s) => {
      const d = axis(s).d;
      return (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    };
    return { S, at, ang };
  }
  /* The trail. Base: the chord to (24,400), bowed 13u (48° at the ball, 66° at the tip), with
     w(s) = 128 − 124·(s−36)/329, s measured from the ball centre.
     LEGEND (full card): its own blade, reaching the bottom-start corner at (10,414) on a stronger
     bow (26u), fuller in the body and tapering to a 4u point, so the outline change is designed,
     not a crop. The tokens keep the literal 30% extension (see swoosh()). */
  const GEO = (legend) => {
    const A = legend
      ? makeAxis([10, 414], 26)
      : makeAxis([C.x + AX[0] * 365, C.y + AX[1] * 365], 13);
    const sTip = A.S;
    const L = sTip - 36;
    const w = legend
      ? (s) => {
          const t = (s - 36) / L; // t < 0 under the ball: the curve simply carries on
          return 4 + 124 * (1 - t) * (1 + 0.55 * t);
        }
      : (s) => 128 - (124 * (s - 36)) / L;
    return { legend, L, sTip, w, at: A.at, ang: A.ang };
  };
  const G_BASE = GEO(false);
  const G_LEG = GEO(true);
  const geoOf = (tier) => (tier === "LEGEND" ? G_LEG : G_BASE);
  /** The trail's two edges as polylines (sampled once per geometry). */
  const EDGES = new Map();
  function edges(g) {
    if (!EDGES.has(g)) {
      const U = [];
      const Lo = [];
      for (let s = 0; s <= g.sTip + 0.01; s += 2.5) {
        U.push(g.at(s, -g.w(s) / 2));
        Lo.push(g.at(s, g.w(s) / 2));
      }
      EDGES.set(g, { U, L: Lo });
    }
    return EDGES.get(g);
  }
  /** x of the trail's upper-start (side −1) or lower-end (side +1) edge at height y. */
  function edgeX(g, y, side) {
    const pts = side < 0 ? edges(g).U : edges(g).L;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1])
        return a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    }
    return side < 0 ? pts[pts.length - 1][0] : pts[0][0];
  }
  /** Horizontal room for a text box (top yT, bottom yB) inside the trail, clear of the ball. */
  function room(g, yT, yB, pad = 4, ballGap = 4) {
    const L = edgeX(g, yT, -1) + pad;
    let R = edgeX(g, yB, 1) - pad;
    const dy = yT - C.y;
    const rr = C.r + ballGap;
    if (Math.abs(dy) < rr) R = Math.min(R, C.x - Math.sqrt(rr * rr - dy * dy));
    return { L, R, w: R - L, c: (L + R) / 2 };
  }
  const TRAILS = new Map();
  function trailPath(g) {
    if (TRAILS.has(g)) return TRAILS.get(g);
    const s0 = 2;
    const N = 48;
    const U = [];
    const Lo = [];
    for (let i = 0; i <= N; i++) {
      const s = s0 + ((g.sTip - s0) * i) / N;
      U.push(g.at(s, -g.w(s) / 2));
      Lo.push(g.at(s, g.w(s) / 2));
    }
    const tip = g.at(g.sTip + 2.6, 0);
    const R0 = r2(Math.hypot(U[0][0] - C.x, U[0][1] - C.y));
    const front = g.at(-R0, 0);
    // the root closes round the front of the ball (hidden under it), so the trail's edges stay tangent
    const d =
      "M" +
      U.map(P).join("L") +
      `Q${P(tip)} ${P(Lo[N])}L` +
      Lo.slice(0, N).reverse().map(P).join("L") +
      `A${R0} ${R0} 0 0 0 ${P(front)}A${R0} ${R0} 0 0 0 ${P(U[0])}Z`;
    TRAILS.set(g, d);
    return d;
  }
  /** A swoosh outside the trail's upper-start edge: inner edge parallel to it at `gap`, up to `T` thick. */
  function crescentPath(g, s0, s1, gap, T, bow = 0, n = 40) {
    const A = [];
    const B = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const s = s0 + (s1 - s0) * t;
      const th = T * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85);
      const base = g.w(s) / 2 + gap + bow * Math.sin(Math.PI * t);
      A.push(g.at(s, -base));
      B.push(g.at(s, -(base + th)));
    }
    return "M" + A.map(P).join("L") + "L" + B.reverse().map(P).join("L") + "Z";
  }
  // the logo's grammar: Logo-Blue swoosh, the ink swoosh outside it, and (CHAMPION) a club-colour third
  const CRES = [
    { s0: 34, s1: 212, gap: 10, T: 12, bow: 0, cls: "c02-cres-blue" },
    { s0: 20, s1: 152, gap: 27, T: 8, bow: 1.5, cls: "c02-cres-ink" },
    { s0: 12, s1: 108, gap: 40, T: 6, bow: 2, cls: "c02-cres-club" },
  ];
  const CRES_COUNT = { HOMA: 0, STADE: 1, PRO: 2, CHAMPION: 3, LEGEND: 2 };
  const BAND = [52, 62];
  const STAT_S = { lat: [205, 222, 239, 256], ar: [194, 211, 228, 245] };
  const LANE_S0 = 268;
  // the figure: the shared avatar from behind, cropped by the bottom edge, pointing at the ball
  const FIG = { x: 64, y: 331, w: 84, h: 100.8 };
  const FIG_K = Math.min(FIG.w / 200, FIG.h / 240);
  const FIG_O = [FIG.x + (FIG.w - 200 * FIG_K) / 2, FIG.y + (FIG.h - 240 * FIG_K)];
  // ball furniture
  const RIM_PANELS = [
    { c: [168, 62], R: 25 },
    { c: [290, 98], R: 25 },
  ];
  const F_PANEL = { c: [262, 140], R: 15 };
  const rot = (c) => (Math.atan2(c[1] - C.y, c[0] - C.x) * 180) / Math.PI;

  /* ---------- defs ---------- */
  function defs(id, tier, extra = "") {
    let d = "";
    d += `<clipPath id="${id}-cb"><circle cx="${C.x}" cy="${C.y}" r="${C.r}"/></clipPath>`;
    d += `<clipPath id="${id}-cframe"><rect x="-40" y="-40" width="${VB.w + 80}" height="${VB.h + 40}"/></clipPath>`;
    d += `<clipPath id="${id}-cfig"><rect x="-40" y="0" width="${VB.w + 80}" height="${VB.h}"/></clipPath>`;
    // ball: a white plate with one soft top light (PRO and up)
    d +=
      `<radialGradient id="${id}-gball" cx="0.36" cy="0.26" r="0.8">` +
      `<stop offset="0" class="c02-s-ballhi"/><stop offset="0.55" class="c02-s-ball"/><stop offset="1" class="c02-s-balllo"/></radialGradient>`;
    // seam arcs that carry the ball's printed code and season
    d += `<path id="${id}-seam1" d="M186 104Q224 116 262 104" fill="none"/>`;
    d += `<path id="${id}-seam2" d="M180 118Q222 131 262 117" fill="none"/>`;
    // struck enamel: blurred alpha lit from the top-start, added back over the fill
    d +=
      `<filter id="${id}-strike" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b"/>` +
      `<feSpecularLighting in="b" surfaceScale="2.4" specularConstant="0.95" specularExponent="24" lighting-color="#ffffff" result="s"><feDistantLight azimuth="225" elevation="44"/></feSpecularLighting>` +
      `<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>` +
      `<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.5" k4="0"/></filter>`;
    if (tier === "PRO") {
      // Floodlight Navy at the root fading to Tunnel Navy at the tip: the colour of motion
      const a = G_BASE.at(40);
      const b = G_BASE.at(G_BASE.sTip);
      d += `<linearGradient id="${id}-gtrail" gradientUnits="userSpaceOnUse" x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(b[0])}" y2="${r2(b[1])}"><stop offset="0" stop-color="#0C3164"/><stop offset="1" stop-color="#001C49"/></linearGradient>`;
    }
    if (tier === "HOMA") {
      // fresh concrete: fine aggregate, clean edges (no displacement)
      d +=
        `<filter id="${id}-conc" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" seed="4" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.86 0 0 0 0 0.88 0 0 0 0 0.9 1.2 0 0 0 -0.74" result="lt"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.12 0 0 0 0 0.13 0 0 0 0 0.15 -1.2 0 0 0 0.5" result="dk"/>` +
        `<feMerge result="t"><feMergeNode in="dk"/><feMergeNode in="lt"/></feMerge>` +
        `<feComposite in="t" in2="SourceAlpha" operator="in" result="tc"/>` +
        `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="tc"/></feMerge></filter>` +
        // chalk: the line itself, with a fine dry-brush break-up (still a fresh, clean line)
        `<filter id="${id}-chalk" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="1.4 0.5" numOctaves="1" seed="9" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.6 0 0 0 1.55" result="m"/>` +
        `<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`;
    }
    if (tier === "CHAMPION") {
      // moulded graphite rubber: fine grip ridges every 4u along the flight
      d +=
        `<pattern id="${id}-ridge" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(${r2(AX_DEG)})">` +
        `<rect width="4" height="1.1" fill="#3A4048"/><rect y="1.1" width="4" height="0.5" fill="#22262B"/></pattern>` +
        `<linearGradient id="${id}-gsheen" gradientUnits="userSpaceOnUse" x1="${C.x - 60}" y1="${C.y - 40}" x2="${C.x + 60}" y2="${C.y + 40}">` +
        `<stop offset="0.3" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.7"/><stop offset="0.7" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>`;
    }
    if (tier === "LEGEND") {
      // a matte white blade: a faint fall-off across it, one polished leading edge
      const u = G_LEG.at(150, -60);
      const l = G_LEG.at(150, 60);
      d +=
        `<linearGradient id="${id}-gblade" gradientUnits="userSpaceOnUse" x1="${r2(u[0])}" y1="${r2(u[1])}" x2="${r2(l[0])}" y2="${r2(l[1])}">` +
        `<stop offset="0" class="c02-s-blade-hi"/><stop offset="0.45" class="c02-s-blade"/><stop offset="1" class="c02-s-blade-lo"/></linearGradient>`;
    }
    return `<defs>${d}${extra}</defs>`;
  }

  /* ---------- the trail and its swooshes ---------- */
  function trailLayer(id, p, tier, opts = {}) {
    const legend = tier === "LEGEND";
    const g = geoOf(tier);
    const path = trailPath(g);
    const club = clubOf(p);
    let out = "";
    // swooshes first (they sit outside the trail)
    const n = CRES_COUNT[tier];
    for (let i = n - 1; i >= 0; i--) {
      const c = CRES[i];
      const d = crescentPath(g, c.s0, c.s1, c.gap, c.T, c.bow);
      const fill = i === 2 ? club.a : "";
      out += `<path d="${d}" class="c02-cres ${c.cls}"${fill ? ` fill="${fill}"` : ""}/>`;
    }
    // the body, by material
    let body = "";
    if (tier === "HOMA")
      body = `<path d="${path}" class="c02-concrete" filter="url(#${id}-conc)"/>`;
    else if (tier === "STADE") body = `<path d="${path}" class="c02-paint"/>`;
    else if (tier === "CHAMPION")
      body = `<path d="${path}" class="c02-rubber"/><path d="${path}" fill="url(#${id}-ridge)" opacity="0.9"/>`;
    else if (legend) body = `<path d="${path}" fill="url(#${id}-gblade)"/>`;
    else body = `<path d="${path}" fill="url(#${id}-gtrail)"/>`;
    out += `<g>` + body;
    // the club band at the root (only its two ends show beside the ball)
    const b0 = BAND[0];
    const b1 = BAND[1];
    const band = (s0, s1) =>
      poly([
        g.at(s0, -g.w(s0) / 2 - 1),
        g.at(s1, -g.w(s1) / 2 - 1),
        g.at(s1, g.w(s1) / 2 + 1),
        g.at(s0, g.w(s0) / 2 + 1),
      ]);
    out += `<g clip-path="url(#${id}-ctrail)"><path d="${band(b0, b1)}" fill="${club.b}"/><path d="${band(b0 + 1.6, b1 - 1.6)}" fill="${club.a}"/></g>`;
    // lanes: four equal lanes run on to the tip; their length never encodes a value
    if (!opts.thumb) {
      const sEnd = g.sTip - (legend ? 14 : 6);
      const lanes = legend ? [-1, 1] : [-1, 0, 1];
      lanes.forEach((k) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const s = LANE_S0 + ((sEnd - LANE_S0) * i) / 12;
          pts.push(g.at(s, (k * g.w(s)) / 4));
        }
        out += `<path d="M${pts.map(P).join("L")}" class="c02-lane c02-lane-${tier.toLowerCase()}" pathLength="1"${tier === "HOMA" ? ` filter="url(#${id}-chalk)"` : ""}/>`;
      });
    }
    // material details
    if (tier === "HOMA") {
      // the patch outlined in fresh chalk, 2u inside its clean-cut edge
      const s0 = 30;
      const sT = g.sTip - 3;
      const e = (s, k) => g.at(s, k * (g.w(s) / 2 - 2));
      const side = (k) => Array.from({ length: 21 }, (_, i) => e(s0 + ((sT - s0) * i) / 20, k));
      out += `<path d="M${side(-1).map(P).join("L")}L${P(g.at(g.sTip - 1, 0))}L${side(1).reverse().map(P).join("L")}" class="c02-chalk-line" filter="url(#${id}-chalk)"/>`;
    }
    if (legend) {
      // one polished leading edge, a soft fall-off on the other
      const line = (o) =>
        "M" +
        Array.from({ length: 25 }, (_, i) =>
          g.at(4 + ((g.sTip - 4) * i) / 24, -g.w(4 + ((g.sTip - 4) * i) / 24) / 2 + o),
        )
          .map(P)
          .join("L");
      out += `<path d="${line(1.1)}" class="c02-blade-edge" fill="none"/>`;
      out += `<path d="${line(3.2)}" class="c02-blade-bevel" fill="none"/>`;
    }
    out += `<path d="${path}" class="c02-trail-rim${legend ? " is-blade" : ""}" fill="none" vector-effect="non-scaling-stroke"/>`;
    out += `</g>`;
    return out;
  }

  /** LEGEND: one debossed dimple per gameweek played (the sample's seven are an example). */
  function dimples(id, o) {
    const ar = MC.isAr(o);
    const at = G_LEG.at;
    let g = `<g class="c02-dimples">`;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const s = 278 + i * 10;
      const c = at(s, 0);
      const r = 3.1 - i * 0.07;
      g +=
        `<g class="c02-dimple" style="--i:${i}">` +
        `<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(r)}" class="c02-dimple-pit"/>` +
        `<path d="M${P(polar(c[0], c[1], r - 0.4, 150))}A${r2(r - 0.4)} ${r2(r - 0.4)} 0 0 1 ${P(polar(c[0], c[1], r - 0.4, 300))}" class="c02-dimple-sh"/>` +
        `<path d="M${P(polar(c[0], c[1], r + 0.2, 330))}A${r2(r + 0.2)} ${r2(r + 0.2)} 0 0 1 ${P(polar(c[0], c[1], r + 0.2, 120))}" class="c02-dimple-hi"/>` +
        `</g>`;
    }
    // the sample's count is not real data: say so on the object
    const t = at(278 + n * 10 + 8, 0);
    g += `<text x="${r2(t[0])}" y="${r2(t[1])}" font-size="${ar ? 7 : 6}" text-anchor="middle" dominant-baseline="central" transform="rotate(${r2(G_LEG.ang(278 + n * 10 + 8) - 180)} ${r2(t[0])} ${r2(t[1])})" class="${ar ? "c02-t-ar" : "c02-t-lab c02-track"} c02-example">${ar ? "مثال" : "EXEMPLE"}</text>`;
    return g + `</g>`;
  }

  /* ---------- the ball ---------- */
  function ballLayer(id, p, o, tier, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const { x: cx, y: cy, r } = C;
    let g = `<g class="c02-ballg"><g class="c02-ball-front">`;
    const flat = tier === "HOMA" || tier === "STADE";
    g += `<circle cx="${cx}" cy="${cy}" r="${r}" ${flat ? 'class="c02-ball-flat"' : `fill="url(#${id}-gball)"`}/>`;
    // rim panels (partial pentagons cut by the rim), in ink
    g += `<g clip-path="url(#${id}-cb)">`;
    RIM_PANELS.forEach(
      (q) => (g += `<path d="${poly(pent(q.c[0], q.c[1], q.R, rot(q.c)))}" class="c02-panel"/>`),
    );
    const fv = pent(F_PANEL.c[0], F_PANEL.c[1], F_PANEL.R, rot(F_PANEL.c));
    if (p.founder) {
      // the founder strike: a die-struck Logo-Blue enamel pentagon with '26' knocked out
      g += `<g class="c02-founder"><path d="${poly(fv)}" fill="#0151FC" filter="url(#${id}-strike)"/>`;
      g += `<path d="M${P(fv[2])}L${P(fv[3])}L${P(fv[4])}" fill="none" stroke="#3D7BFF" stroke-width="0.8" stroke-linejoin="round"/>`;
      g += `<path d="M${P(fv[4])}L${P(fv[0])}L${P(fv[1])}L${P(fv[2])}" fill="none" stroke="#0039B8" stroke-width="0.8" stroke-linejoin="round"/>`;
      if (!opts.thumb)
        g += numText(
          String(p.founder).slice(-2),
          F_PANEL.c[0] - 1.6,
          F_PANEL.c[1] - 1.2,
          12,
          "c02-founder-26",
        );
      g += `</g>`;
    } else {
      g += `<path d="${poly(fv)}" class="c02-panel"/>`;
    }
    g += `</g>`;
    // the ball's printed code: the ID's physical carrier, the season beneath it
    if (!opts.thumb) {
      g += `<path d="M186 104Q224 116 262 104" class="c02-seam"/>`;
      g += `<text font-size="8" class="c02-t-print c02-print1" text-anchor="middle" direction="ltr" dy="-2.4"><textPath href="#${id}-seam1" startOffset="50%">${esc(p.id)}</textPath></text>`;
      const line2 = ar ? `${S.country}  ${p.season}` : `${S.country}  ${p.season}`;
      g += ar
        ? `<text font-size="6.6" class="c02-t-ar c02-print2" text-anchor="middle"><textPath href="#${id}-seam2" startOffset="50%">${esc(S.country)} <tspan direction="ltr" unicode-bidi="embed">${esc(p.season)}</tspan></textPath></text>`
        : `<text font-size="6" class="c02-t-print c02-print2 c02-track" text-anchor="middle" direction="ltr"><textPath href="#${id}-seam2" startOffset="50%">${esc(line2)}</textPath></text>`;
    }
    if (tier === "CHAMPION") {
      // a tilt sheen on the ball only
      g += `<g clip-path="url(#${id}-cb)"><g class="c02-sheen"><rect x="${cx - r - 40}" y="${cy - r}" width="${2 * r + 80}" height="${2 * r}" fill="url(#${id}-gsheen)"/></g></g>`;
    }
    g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" class="c02-ring${tier === "LEGEND" ? " is-blade" : ""}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    g += `</g>`;
    if (opts.back) {
      // long-press turns the ball over: its provenance
      g +=
        `<g class="c02-ball-back" aria-hidden="true">` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#001C49"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="none" stroke="#0151FC" stroke-width="1.2"/>` +
        `<text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="${ar ? 11 : 10}" class="${ar ? "c02-t-ar" : "c02-t-lab c02-track"} c02-back-l1">${esc(p.founder ? S.founderLine : S.manager)}</text>` +
        `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="9" class="c02-t-print c02-back-l2" direction="ltr">${esc(p.id)}</text>` +
        `<text x="${cx}" y="${cy + 19}" text-anchor="middle" font-size="9" class="c02-t-print c02-back-l2" direction="ltr">${esc(p.season)}</text>` +
        `</g>`;
    }
    return g + `</g>`;
  }

  /* ---------- the figure: the striker, from behind, pointing at his shot ---------- */
  function figureLayer(id, opts = {}) {
    const k = opts.k || FIG_K;
    const o = opts.o || FIG_O;
    const box = opts.box || FIG;
    const fill = opts.fill || "#0C1F3D";
    const seam = opts.seam || "#1E3A66";
    const rim = opts.rim || "#9BDBFD";
    // the raised right arm, in the avatar's own units: from the shoulder, along the shot's chord
    const dir = opts.dir || [-AX[0], -AX[1]];
    const dx = dir[0];
    const dy = dir[1];
    const px = -dy;
    const py = dx;
    const S0 = [160, 196];
    const L = 112;
    const H = [S0[0] + dx * L, S0[1] + dy * L];
    // sleeve: wide at the shoulder (tucked into the torso), narrowing to the cuff
    const sleeve = poly([
      [S0[0] - px * 30 - dx * 18, S0[1] - py * 30 - dy * 18],
      [H[0] - px * 14, H[1] - py * 14],
      [H[0] + px * 14, H[1] + py * 14],
      [S0[0] + px * 26 - dx * 30, S0[1] + py * 26 - dy * 30],
    ]);
    const fc = [H[0] + dx * 12, H[1] + dy * 12];
    const fist = `M${P([fc[0] - 15, fc[1]])}a15 15 0 1 0 30 0a15 15 0 1 0 -30 0Z`;
    const f0 = [fc[0] + dx * 8 - px * 6, fc[1] + dy * 8 - py * 6];
    const f1 = [fc[0] + dx * 36 - px * 6, fc[1] + dy * 36 - py * 6];
    const cuff = `M${P([H[0] - px * 14, H[1] - py * 14])}L${P([H[0] + px * 14, H[1] + py * 14])}`;
    const sw = r2(2 / k);
    const T = `translate(${r2(o[0])} ${r2(o[1])}) scale(${r2(k)})`;
    // rim light: the whole figure stroked in sky behind, then the figure on top
    const rimG =
      MC.avatar({
        x: r2(box.x),
        y: r2(box.y),
        w: r2(box.w),
        h: r2(box.h),
        torso: rim,
        seam: false,
        stroke: rim,
        strokeWidth: sw,
      }) +
      `<g transform="${T}" fill="${rim}" stroke="${rim}" stroke-width="${sw}" stroke-linejoin="round">` +
      `<path d="${sleeve}"/><path d="${fist}"/><path d="M${P(f0)}L${P(f1)}" stroke-width="${r2(11 + 2 * sw)}" stroke-linecap="round"/></g>`;
    const body = MC.avatar({
      x: r2(box.x),
      y: r2(box.y),
      w: r2(box.w),
      h: r2(box.h),
      torso: fill,
      seam,
    });
    const armG =
      `<g transform="${T}"><path d="${sleeve}" fill="${fill}"/><path d="${cuff}" stroke="${seam}" stroke-width="5" transform="translate(${r2(-dx * 8)} ${r2(-dy * 8)})"/>` +
      `<path d="${fist}" fill="${fill}"/><path d="M${P(f0)}L${P(f1)}" stroke="${fill}" stroke-width="11" stroke-linecap="round"/></g>`;
    return `<g class="c02-fig"${opts.clip ? ` clip-path="url(#${opts.clip})"` : ""}>${rimG}${body}${armG}</g>`;
  }

  /* ---------- the words on the trail ---------- */
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  function initialForm(name) {
    const parts = name.split(/[\s-]+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
  }
  /** Arabic has no initials: keep the first word, or the first two after عبد / أبو (so «عبد الرحمن»). */
  function shortAr(name) {
    const w = name.split(/\s+/).filter(Boolean);
    if (w.length < 2) return name;
    return /^(عبد|أبو|ابو)$/.test(w[0]) ? `${w[0]} ${w[1]}` : w[0];
  }
  /** The 84 on the trail's thick end. opts.k scales it (the share); opts.overhang lets it break the lower-end edge. */
  function ovrBox(g, p, opts = {}) {
    const k = opts.k || 1;
    const c = g.at(opts.s || 150);
    const fs = 60 * k * (String(p.ovr).length > 2 ? 0.82 : 1);
    const m = measure(String(p.ovr), F_NUM, fs);
    const h = m.a + m.d;
    const w = m.r - m.l;
    let cx;
    if (opts.overhang) {
      // bigger than its trail: the 8's shoulder may kiss the upper-start edge, and the 4's bar may
      // break the lower-end edge by up to 10u (white on the darkened night)
      const lo = edgeX(g, c[1] - h * 0.25, -1) - 1 + w / 2;
      const hi = edgeX(g, c[1] + h * 0.25, 1) + 10 - w / 2;
      cx = lo <= hi ? clamp(c[0], lo, hi) : (lo + hi) / 2;
    } else {
      const rm = room(g, c[1] - h / 2, c[1] + h / 2, 4, 3);
      cx = clamp(rm.c, c[0] - 6, c[0] + 6);
    }
    return { cx, cy: c[1], fs, k, top: c[1] - h / 2, bot: c[1] + h / 2 };
  }
  /** Name and tier inline on one baseline at s≈90; a long name takes its short form, then drops the
      tier to a line beneath. Every word is kept inside the trail, off the ball and above the 84. */
  function nameLine(g, p, o, tier, ovr) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const full = MC.nameOf(p, o);
    const tierTxt = S.tiers[tier];
    const TF = ar ? F_AR : F_LAB;
    const track = ar ? 0 : 0.08;
    const padS = tier === "HOMA" ? 5.5 : 5; // upper-start edge (HOMA: clear of the chalk line)
    const padE = 9; // lower-end edge: clear of the club band's ends beside the ball
    const gap = ar ? 7 : 6;
    const N0 = ar ? 30 : 32;
    const mid = g.at(90)[1];
    // nothing below these: the ink (descenders) and the baseline, above the 84's top; the enlarged
    // share numeral gets more air under the baseline
    const floor = ovr.top - (ovr.k > 1 ? 3 : 4);
    const floorB = ovr.top - (ovr.k > 1 ? 7 : 4);
    const ballR = (y) => {
      const dy = y - C.y;
      const rr = C.r + 3;
      return Math.abs(dy) < rr ? C.x - Math.sqrt(rr * rr - dy * dy) - 5 : Infinity;
    };
    // the club band's ends show beside the ball: every word stays 4u past the band's far edge
    const bp = g.at(BAND[1]);
    const bq = g.at(BAND[1] + 1);
    const bd = unit([bq[0] - bp[0], bq[1] - bp[1]]);
    const bandR = (y) => bp[0] + (4 - (y - bp[1]) * bd[1]) / bd[0];
    /** Room for a box from `top` to `bot`: the slanted edges bind at its top-start and bottom-end
        corners; the ball and the band's end bind at its top-end corner. */
    const span = (top, bot) => ({
      L: edgeX(g, top, -1) + padS,
      R: Math.min(edgeX(g, bot, 1) - padE, ballR(top), bandR(top)),
    });
    const nm = (name, n) => {
      const m = measure(name, F_NUM, n);
      return { w: m.w, asc: m.a, desc: m.d };
    };
    const tm = (t) => {
      const m = measure(tierTxt, TF, t, track);
      return { w: m.w, asc: m.a, desc: m.d };
    };
    function inline(name, n, t, yb) {
      const a = nm(name, n);
      const b = tm(t);
      if (yb > floorB || Math.max(yb + a.desc, yb + b.desc) > floor) return null;
      const sn = span(yb - a.asc, yb + a.desc);
      const st = span(yb - b.asc, yb + b.desc);
      const total = a.w + gap + b.w;
      if (!ar) {
        // [name][tier]
        const lo = sn.L;
        const hi = Math.min(sn.R - a.w, st.R - total);
        if (hi < lo) return null;
        const x0 = clamp((sn.L + st.R - total) / 2, lo, hi);
        return { name, n, t, yb, nx: x0 + a.w / 2, tx: x0 + a.w + gap + b.w / 2 };
      }
      // RTL: [tier][name] from left to right
      const lo = Math.max(st.L, sn.L - b.w - gap);
      const hi = Math.min(sn.R - total, st.R - b.w);
      if (hi < lo) return null;
      const x0 = clamp((st.L + sn.R - total) / 2, lo, hi);
      return { name, n, t, yb, tx: x0 + b.w / 2, nx: x0 + b.w + gap + a.w / 2 };
    }
    function stacked(name, n, t) {
      const a = nm(name, n);
      const b = tm(t);
      for (const dyb of [0, 2, 4, 6, 8, 10, -2, -4, -6]) {
        const yb = mid + a.asc / 2 + dyb;
        const sn = span(yb - a.asc, yb + a.desc);
        if (a.w > sn.R - sn.L) continue;
        const ty = yb + a.desc + b.asc + 2.5;
        if (ty > floorB || ty + b.desc > floor) continue;
        const st = span(ty - b.asc, ty + b.desc);
        if (b.w > st.R - st.L) continue;
        const nx = (sn.L + sn.R) / 2;
        // the tier hangs from the name's start (Latin) or its right end (Arabic), inside the trail
        const want = ar ? nx + a.w / 2 - b.w / 2 : nx - a.w / 2 + b.w / 2;
        return { name, n, t, yb, nx, ty, tx: clamp(want, st.L + b.w / 2, st.R - b.w / 2) };
      }
      return null;
    }
    const names = ar
      ? [full, shortAr(full)].filter((v, i, A) => A.indexOf(v) === i)
      : [full.length > 10 ? initialForm(full) : full];
    let best = null;
    names.forEach((name, i) => {
      for (let n = N0; n >= 18 && !best; n -= 1) {
        const t = n >= 26 ? (ar ? 12 : 11) : ar ? 11 : 10;
        for (let dyb = -4; dyb <= 12 && !best; dyb += 2)
          best = inline(name, n, t, mid + nm(name, n).asc / 2 + dyb);
      }
      const nFloor = i === names.length - 1 ? 12 : 18;
      for (let n = 26; n >= nFloor && !best; n -= 1) best = stacked(name, n, ar ? 10 : 9);
    });
    if (!best) {
      // last resort: the shortest form on the lowest line the 84 allows (the widest), sized to it,
      // the tier beneath; both clamped inside the trail
      const name = names[names.length - 1];
      const t = ar ? 9 : 8;
      const b = tm(t);
      const a0 = nm(name, 12);
      const yb = Math.min(floor - b.desc, floorB) - b.asc - 2 - a0.desc;
      const sn = span(yb - a0.asc, yb + a0.desc);
      const n = clamp((12 * (sn.R - sn.L)) / a0.w, 8, 12);
      const a = nm(name, n);
      const ty = yb + a.desc + b.asc + 2;
      const st = span(ty - b.asc, ty + b.desc);
      const nx = (sn.L + sn.R) / 2;
      const want = ar ? nx + a.w / 2 - b.w / 2 : nx - a.w / 2 + b.w / 2;
      best = {
        name,
        n,
        t,
        yb,
        nx,
        ty,
        tx: clamp(want, st.L + b.w / 2, Math.max(st.L + b.w / 2, st.R - b.w / 2)),
      };
    }
    const cls = `c02-nz c02-nz-${tier.toLowerCase()}`;
    const nameT = ar
      ? `<text x="${r2(best.nx)}" y="${r2(best.yb)}" font-size="${r2(best.n)}" text-anchor="middle" class="c02-t-arname c02-name">${esc(best.name)}</text>`
      : `<text x="${r2(best.nx)}" y="${r2(best.yb)}" font-size="${r2(best.n)}" text-anchor="middle" class="c02-t-name c02-name" direction="ltr">${esc(best.name)}</text>`;
    const ty = best.ty != null ? best.ty : best.yb;
    const tierT = ar
      ? `<text x="${r2(best.tx)}" y="${r2(ty)}" font-size="${r2(best.t)}" text-anchor="middle" class="c02-t-ar c02-tier">${esc(tierTxt)}</text>`
      : `<text x="${r2(best.tx)}" y="${r2(ty)}" font-size="${r2(best.t)}" text-anchor="middle" class="c02-t-lab c02-track c02-tier" direction="ltr">${esc(tierTxt)}</text>`;
    return `<g class="${cls}">${nameT}${tierT}</g>`;
  }
  /** Four horizontal stat lines stepping down the trail at one shared size. Latin rows are centred in
      their chord; Arabic rows are right-aligned to it. A block that does not fit moves up the trail
      (never into the 84) before its size drops. */
  function statLines(g, p, o, tier, ovr) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const ss0 = ar ? STAT_S.ar : STAT_S.lat;
    const gap = ar ? 3 : 4.2;
    // HOMA keeps clear of its chalk line; Arabic rows sit flush to the lower-end edge, so they get more air
    const pad = tier === "HOMA" ? 5.5 : ar ? 4.5 : 2.5;
    const base = ar ? 11 : 12;
    const fsFloor = ar ? 9 : 10;
    const top0 = ovr.bot + 6;
    const geom = (k, s, fs) => {
      const c = g.at(s);
      const lab = S.stats[k];
      const val = String(p.stats[k]);
      const lm = ar ? measure(lab, F_AR, fs) : measure(lab, F_LAB, fs, 0.06);
      const vw = textW(val, F_LAB, fs);
      const yb = c[1] + (ar ? fs * 0.3 : fs * 0.36);
      const top = yb - (ar ? Math.max(lm.a, fs * 0.72) : fs * 0.72);
      const bot = yb + (ar ? lm.d : 0);
      const rm = room(g, top, bot, pad, 3);
      return { lab, val, lw: lm.w, vw, yb, top, rm, tot: lm.w + gap + vw };
    };
    const rowsAt = (ss, fs) => MC.STATS.map((k, i) => geom(k, ss[i], fs));
    let pick = null;
    for (const ds of [0, -3, -6, -9, -12]) {
      const ss = ss0.map((s) => s + ds);
      let got = null;
      for (let fs = base; fs >= fsFloor - 1e-6 && !got; fs -= 0.25) {
        const rows = rowsAt(ss, fs);
        if (rows[0].top < top0) break; // would rise into the 84
        if (rows.every((r) => r.tot <= r.rm.w + 0.01)) got = { fs, rows };
      }
      if (got && (!pick || got.fs > pick.fs + 1e-6)) pick = got;
      if (pick && pick.fs >= base) break;
    }
    if (!pick) pick = { fs: fsFloor, rows: rowsAt(ss0, fsFloor), over: true };
    const fs = pick.fs;
    let out = `<g class="c02-stats c02-stats-${tier.toLowerCase()}">`;
    pick.rows.forEach((r) => {
      if (ar) {
        // right-aligned in the chord: the label reads first, the value (LTR) after it
        // (a row that cannot fit even at the floor splits its overflow between the two edges)
        const xr = r.tot <= r.rm.w ? r.rm.R : r.rm.R + (r.tot - r.rm.w) / 2;
        out +=
          `<text x="${r2(xr - r.lw / 2)}" y="${r2(r.yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-ar c02-slab">${esc(r.lab)}</text>` +
          `<text x="${r2(xr - r.lw - gap - r.vw / 2)}" y="${r2(r.yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-lab c02-sval" direction="ltr">${r.val}</text>`;
      } else {
        const x0 = r.rm.c - r.tot / 2;
        out +=
          `<text x="${r2(x0 + r.lw / 2)}" y="${r2(r.yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-lab c02-slab c02-track-s" direction="ltr">${esc(r.lab)}</text>` +
          `<text x="${r2(x0 + r.lw + gap + r.vw / 2)}" y="${r2(r.yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-lab c02-sval" direction="ltr">${r.val}</text>`;
      }
    });
    return out + `</g>`;
  }

  /** The whole comet, in card units (shared by the card and the share image). */
  function comet(id, p, o, tier, opts = {}) {
    const g = geoOf(tier);
    const ovr = ovrBox(g, p, opts.ovr);
    let svg = "";
    svg += trailLayer(id, p, tier, opts);
    if (tier === "LEGEND" && !opts.thumb) svg += dimples(id, o);
    if (!opts.thumb) svg += nameLine(g, p, o, tier, ovr) + statLines(g, p, o, tier, ovr);
    svg += `<g class="c02-ovrg">${numText(p.ovr, ovr.cx, ovr.cy, ovr.fs, "c02-ovr")}</g>`;
    svg += ballLayer(id, p, o, tier, { thumb: opts.thumb, back: opts.back });
    return svg;
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid(PFX);
    const tier = p.tier;
    const thumb = !!o.thumb;
    const g = geoOf(tier);
    const extra = `<clipPath id="${id}-ctrail"><path d="${trailPath(g)}"/></clipPath>`;
    let svg = defs(id, tier, extra);
    if (!thumb) svg += figureLayer(id, { clip: `${id}-cfig` });
    svg += comet(id, p, o, tier, { thumb, back: !thumb });
    const cls = `c02 c02-card c02--${tier.toLowerCase()}${o.motion ? " c02--motion" : ""}${thumb ? " c02--thumb" : ""}${p.founder ? " is-founder" : ""}`;
    return (
      `<div class="${cls}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}">` +
      `<svg class="c02-svg" viewBox="0 0 ${VB.w} ${VB.h}" aria-hidden="true" focusable="false">${svg}</svg></div>`
    );
  }

  /* ================= tokens: the same object flying flat ================= */
  /* A flat swoosh: the ball at the end, the upper edge curving down to the tip (room for the
     swooshes above it), the lower edge nearly flat (room for the 84 on the root).
     Compact (44–80px): nominal 80 → 80×35, units are half-pixels (viewBox height 70).
     Mini (24–32px): the spec's 32×18 sits at the 28px slot, units are quarter-pixels (height 72). */
  const TK = {
    H: 70,
    ball: { x: 125, y: 35, r: 34 },
    head: 32,
    ua: -118,
    uc: [62, 13],
    tip: [2, 53],
    tipW: 3,
    lc: [56, 69],
    la: 112,
    num: [56, 50],
    fs: 36,
  };
  const MN = {
    H: 76,
    ball: { x: 101, y: 48, r: 26 },
    head: 25,
    ua: -128,
    uc: [34, 25],
    tip: [1, 61],
    tipW: 4,
    lc: [40, 77],
    la: 112,
    num: [47, 56.5],
    fs: 40,
  };
  const qpt = (a, c, b, t) => {
    const u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ];
  };
  const qdr = (a, c, b, t) => {
    const u = 1 - t;
    return [
      2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]),
      2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1]),
    ];
  };
  function swoosh(T, legend) {
    const b = T.ball;
    const tail = b.x - T.tip[0];
    // the LEGEND blade is 30% longer: same ball, the tail stretched out to the start
    const ext = legend ? 0.3 * (b.x - b.r - T.tip[0]) : 0;
    const m = (tail + ext) / tail;
    const bx = b.x + ext;
    const sx = (x) => bx - (b.x - x) * m;
    const hp = (deg, R = T.head) => [
      bx + R * Math.cos((deg * Math.PI) / 180),
      b.y + R * Math.sin((deg * Math.PI) / 180),
    ];
    const U0 = hp(T.ua);
    const L0 = hp(T.la);
    const Uc = [sx(T.uc[0]), T.uc[1]];
    const Lc = [sx(T.lc[0]), T.lc[1]];
    const TU = [T.tip[0], T.tip[1] - T.tipW / 2];
    const TL = [T.tip[0], T.tip[1] + T.tipW / 2];
    const front = hp(0);
    const R = T.head;
    const path =
      `M${P(U0)}Q${P(Uc)} ${P(TU)}Q${P([T.tip[0] - 1.6, T.tip[1]])} ${P(TL)}Q${P(Lc)} ${P(L0)}` +
      `A${R} ${R} 0 0 0 ${P(front)}A${R} ${R} 0 0 0 ${P(U0)}Z`;
    const upper = { a: U0, c: Uc, b: TU };
    const W = Math.ceil(bx + Math.max(b.r, T.head) + 1);
    return { b: { x: bx, y: b.y, r: b.r }, path, upper, W, sx, len: tail + ext };
  }
  /** A swoosh riding outside the upper edge, from t0 (ball end) to t1 (toward the tip). */
  function swooshCrescent(f, t0, t1, gap, T, n = 26) {
    const A = [];
    const B = [];
    const { a, c, b } = f.upper;
    // start where the whole swoosh stays inside the token's box
    for (let i = 0; i < 40; i++) {
      const p = qpt(a, c, b, t0);
      const d = qdr(a, c, b, t0);
      const mm = Math.hypot(d[0], d[1]) || 1;
      if (p[1] + (d[0] / mm) * (gap + T) >= 0.6) break;
      t0 += 0.01;
    }
    for (let i = 0; i <= n; i++) {
      const tt = i / n;
      const t = t0 + (t1 - t0) * tt;
      const p = qpt(a, c, b, t);
      const d = qdr(a, c, b, t);
      const mm = Math.hypot(d[0], d[1]) || 1;
      const nx = -d[1] / mm;
      const ny = d[0] / mm;
      const th = T * Math.pow(Math.sin(Math.PI * Math.pow(tt, 0.62)), 0.85);
      A.push([p[0] + nx * gap, p[1] + ny * gap]);
      B.push([p[0] + nx * (gap + th), p[1] + ny * (gap + th)]);
    }
    return "M" + A.map(P).join("L") + "L" + B.reverse().map(P).join("L") + "Z";
  }
  /** The ball at token size: rim panels, the founder notch, the ring. */
  function tokenBall(id, p, tier, b, mini) {
    const flatBall = mini || tier === "HOMA" || tier === "STADE";
    let g = `<circle cx="${r2(b.x)}" cy="${r2(b.y)}" r="${b.r}" ${flatBall ? 'class="c02-ball-flat"' : `fill="url(#${id}-gball)"`}/>`;
    g += `<g clip-path="url(#${id}-tb)">`;
    // two rim panels (upper-start and end), as on the card
    [
      [214, 0.97, 0.42],
      [2, 0.98, 0.42],
    ].forEach(([a, dist, R]) => {
      const c = polar(b.x, b.y, dist * b.r, a);
      g += `<path d="${poly(pent(c[0], c[1], R * b.r, a))}" class="c02-panel"/>`;
    });
    const fc = polar(b.x, b.y, (mini ? 1.0 : 0.86) * b.r, 52);
    if (p.founder) {
      g += mini
        ? `<circle cx="${r2(fc[0])}" cy="${r2(fc[1])}" r="${r2(0.34 * b.r)}" fill="#0151FC"/>`
        : `<path d="${poly(pent(fc[0], fc[1], 0.3 * b.r, 52))}" fill="#0151FC"/>`;
    } else if (!mini) {
      g += `<path d="${poly(pent(fc[0], fc[1], 0.3 * b.r, 52))}" class="c02-panel"/>`;
    }
    g += `</g>`;
    g += `<circle cx="${r2(b.x)}" cy="${r2(b.y)}" r="${r2(b.r - 0.5)}" fill="none" class="c02-ring${tier === "LEGEND" ? " is-blade" : ""}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    return g;
  }
  function trailFill(id, tier) {
    if (tier === "HOMA") return 'class="c02-concrete"';
    if (tier === "STADE") return 'class="c02-paint"';
    if (tier === "CHAMPION") return 'class="c02-rubber"';
    if (tier === "LEGEND") return 'class="c02-blade"';
    return `fill="url(#${id}-gtrail)"`;
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = o.mini || size <= 32;
    const id = MC.uid(PFX);
    const tier = p.tier;
    const t = tier.toLowerCase();
    const legend = tier === "LEGEND";
    const S = MC.s(o);
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${S.tiers[tier]}${p.founder ? ", " + S.founderLine : ""}`;
    const T = mini ? MN : TK;
    const f = swoosh(T, legend);
    const club = clubOf(p);
    let d =
      `<clipPath id="${id}-tb"><circle cx="${r2(f.b.x)}" cy="${r2(f.b.y)}" r="${f.b.r}"/></clipPath>` +
      `<clipPath id="${id}-tt"><path d="${f.path}"/></clipPath>` +
      `<radialGradient id="${id}-gball" cx="0.36" cy="0.26" r="0.8"><stop offset="0" class="c02-s-ballhi"/><stop offset="0.55" class="c02-s-ball"/><stop offset="1" class="c02-s-balllo"/></radialGradient>`;
    if (tier === "PRO")
      d += `<linearGradient id="${id}-gtrail" gradientUnits="userSpaceOnUse" x1="${r2(f.b.x)}" y1="0" x2="${T.tip[0]}" y2="0"><stop offset="0.3" stop-color="#0C3164"/><stop offset="1" stop-color="#001C49"/></linearGradient>`;
    let g = "";
    // the tier's swooshes above the trail: the count is the tier cue (0 / 1 / 2 / 3); LEGEND inverts the blade
    const n = CRES_COUNT[tier];
    const spec = mini
      ? [
          { t0: 0.04, t1: 0.88, gap: 4, T: 6.4 },
          { t0: 0.04, t1: 0.72, gap: 14, T: 5.4 },
          { t0: 0.04, t1: 0.58, gap: 23, T: 4.6 },
        ]
      : [
          { t0: 0.06, t1: 0.86, gap: 3.6, T: 5.6 },
          { t0: 0.06, t1: 0.7, gap: 11.6, T: 4.6 },
          { t0: 0.06, t1: 0.56, gap: 18.8, T: 3.8 },
        ];
    const cls = ["c02-cres-blue", "c02-cres-ink", "c02-cres-club"];
    for (let i = n - 1; i >= 0; i--) {
      const c = spec[i];
      g += `<path d="${swooshCrescent(f, c.t0, c.t1, c.gap, c.T)}" class="c02-cres ${cls[i]}"${i === 2 ? ` fill="${club.a}"` : ""}/>`;
    }
    g += `<path d="${f.path}" ${trailFill(id, tier)}/>`;
    // the club collar (44px and up): a 12u band following the ball's rim where the trail leaves it,
    // 9u of the club's primary between 1.5u edges of its secondary (about 2.5px of colour at 44px)
    if (!mini) {
      const rc = f.b.r + 6;
      g +=
        `<g clip-path="url(#${id}-tt)" fill="none">` +
        `<circle cx="${r2(f.b.x)}" cy="${r2(f.b.y)}" r="${r2(rc)}" stroke="${club.b}" stroke-width="12"/>` +
        `<circle cx="${r2(f.b.x)}" cy="${r2(f.b.y)}" r="${r2(rc)}" stroke="${club.a}" stroke-width="9"/></g>`;
    }
    g += `<path d="${f.path}" fill="none" class="c02-trail-rim${legend ? " is-blade" : ""}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    // the 84 rides the trail's root
    const fs = T.fs * (String(p.ovr).length > 2 ? 0.82 : 1);
    g += numText(
      p.ovr,
      f.b.x - (T.ball.x - T.num[0]),
      T.num[1],
      fs,
      legend ? "c02-ovr is-ink" : tier === "HOMA" ? "c02-ovr is-chalk" : "c02-ovr",
    );
    g += tokenBall(id, p, tier, f.b, mini);
    // nominal size → px: compact 80 → 80×35; mini 28 → 32×18
    const pxPerU = mini ? size / 28 / 4 : size / 80 / 2; // mini 28 → 32×19, compact 80 → 80×35
    const w = r2(f.W * pxPerU);
    const h = r2(T.H * pxPerU);
    return (
      `<div class="c02 c02-token${mini ? " c02-token--mini" : ""} c02--${t}" style="height:${h}px;width:${w}px" role="img" aria-label="${esc(label)}">` +
      `<svg viewBox="0 0 ${f.W} ${T.H}" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>${d}</defs>${g}</svg></div>`
    );
  }

  /* ---------- row: the "My position" compact card ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const name = MC.nameOf(p, o);
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    return (
      `<div class="c02 c02-row c02--${p.tier.toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""}>` +
      `<span class="c02-row-rank">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c02-row-token">${token(p, { ...o, size: 72, mini: false })}</span>` +
      `<span class="c02-row-who"><b>${esc(name)}${yr ? `<i class="c02-row-yr" title="${esc(S.founderLine)}"> ·${MC.ltr(yr)}</i>` : ""}</b><small>${esc(S.tiers[p.tier])}</small></span>` +
      `<span class="c02-row-pts"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- share: the shot, staged on the splash's night pitch (360×640) ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid(PFX);
    const tier = p.tier;
    const g = geoOf(tier);
    // the card itself at 1.34, its ball bleeding off the top-end corner (the founder strike kept in
    // frame); the card's bottom edge becomes the touchline he points from
    const k = 1.34;
    const OX = -20;
    const OY = -40;
    const TOUCH = OY + VB.h * k;
    const HZ = 446;
    // keep every stripe inside the 360px frame (Sutherland–Hodgman against x = 0 and x = 360)
    const clipX = (pts) => {
      const cut = (ps, inside, at) => {
        const out = [];
        ps.forEach((a, i) => {
          const b = ps[(i + 1) % ps.length];
          if (inside(a)) out.push(a);
          if (inside(a) !== inside(b))
            out.push([at, a[1] + ((at - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]);
        });
        return out;
      };
      return cut(
        cut(pts, (q) => q[0] >= 0, 0),
        (q) => q[0] <= 360,
        360,
      );
    };
    let stripes = "";
    for (let i = -9; i <= 9; i++) {
      if (i % 2 === 0) continue;
      const x0 = 180 + i * 28;
      const x1 = x0 + 28;
      const top = (x) => 180 + (x - 180) * 0.36;
      const bot = (x) => 180 + (x - 180) * 1.7;
      const pts = clipX([
        [top(x0), HZ],
        [top(x1), HZ],
        [bot(x1), 640],
        [bot(x0), 640],
      ]);
      if (pts.length > 2) stripes += `<path d="${poly(pts)}"/>`;
    }
    const extra =
      `<clipPath id="${id}-ctrail"><path d="${trailPath(g)}"/></clipPath>` +
      `<linearGradient id="${id}-gsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#001233"/><stop offset="0.7" stop-color="#000A1E"/><stop offset="1" stop-color="#000814"/></linearGradient>` +
      `<linearGradient id="${id}-gbeam" gradientUnits="userSpaceOnUse" x1="330" y1="240" x2="120" y2="560"><stop offset="0" stop-color="#9BDBFD" stop-opacity="0.13"/><stop offset="1" stop-color="#9BDBFD" stop-opacity="0"/></linearGradient>`;
    let svg = defs(id, tier, extra);
    svg += `<rect width="360" height="640" fill="url(#${id}-gsky)"/>`;
    // the perspective pitch below the horizon
    svg += `<rect x="0" y="${HZ}" width="360" height="${640 - HZ}" fill="#000C24"/>`;
    svg += `<g fill="hsl(214 90% 55% / .13)">${stripes}</g>`;
    svg += `<path d="M0 ${HZ}H360" stroke="#9BDBFD" stroke-opacity="0.28" stroke-width="1"/>`;
    let beams = "";
    let masts = "";
    // two floodlight masts on the far touchline, right of the shot: a thin pylon, a tilted lamp
    // bank facing the pitch, and a faint beam falling across it (flat, no halo, no glow)
    [
      {
        base: [338, HZ],
        top: [332, 236],
        head: 30,
        tilt: -22,
        beam: [
          [96, 640],
          [300, 640],
        ],
      },
      {
        base: [268, HZ],
        top: [265, 336],
        head: 19,
        tilt: -16,
        beam: [
          [150, 640],
          [262, 640],
        ],
      },
    ].forEach((m) => {
      const hw = m.head / 2;
      const hh = m.head * 0.24;
      const a = (m.tilt * Math.PI) / 180;
      const rotp = (dx, dy) => [
        m.top[0] + dx * Math.cos(a) - dy * Math.sin(a),
        m.top[1] + dx * Math.sin(a) + dy * Math.cos(a),
      ];
      const face = [rotp(-hw, -hh), rotp(hw, -hh), rotp(hw, 0), rotp(-hw, 0)];
      beams += `<path d="${poly([face[3], face[2], m.beam[1], m.beam[0]])}" fill="url(#${id}-gbeam)"/>`;
      const bw = m.head / 12;
      masts += `<path d="${poly([
        [m.base[0] - bw, m.base[1]],
        [m.base[0] + bw, m.base[1]],
        [m.top[0] + bw * 0.4, m.top[1] + 2],
        [m.top[0] - bw * 0.4, m.top[1] + 2],
      ])}" fill="#1A365E"/>`;
      // the bank: a dark frame on the mast head, its lit face one bar of lamps split by thin mullions
      masts += `<path d="${poly([rotp(-hw - 1.5, -hh - 1.5), rotp(hw + 1.5, -hh - 1.5), rotp(hw + 1.5, 2.5), rotp(-hw - 1.5, 2.5)])}" fill="#1A365E"/>`;
      masts += `<path d="${poly(face)}" fill="#EAF6FF" fill-opacity="0.9"/>`;
      let mull = "";
      for (let i = 1; i < 6; i++)
        mull += `M${P(rotp(-hw + (m.head / 6) * i, -hh))}L${P(rotp(-hw + (m.head / 6) * i, 0))}`;
      masts += `<path d="${mull}" stroke="#1A365E" stroke-width="${r2(m.head / 32)}" fill="none"/>`;
    });
    svg += beams + masts;
    // the touchline he stands at
    svg += `<path d="M0 ${r2(TOUCH)}H360" stroke="#EAF6FF" stroke-opacity="0.55" stroke-width="2"/>`;
    svg += `<g transform="translate(${OX} ${OY}) scale(${k})">`;
    svg += figureLayer(id, { clip: `${id}-cfig`, fill: "#000A1E", seam: "#0C3164" });
    // the 84 is the hero here: 1.25× on the card's size (a 65px cap, about 10% of the frame); it may
    // break the trail's lower-end edge, white on the darkened night
    svg += comet(id, p, o, tier, { share: true, ovr: { k: 1.25, s: 146, overhang: true } });
    svg += `</g>`;
    const yr = p.founder ? ` ·${String(p.founder).slice(-2)}` : "";
    return (
      `<div class="c02 c02-share c02--${tier.toLowerCase()}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg class="c02-share-svg" viewBox="0 0 360 640" aria-hidden="true" focusable="false">${svg}</svg>` +
      `<div class="c02-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
      `<div class="c02-sh-foot"><b dir="ltr">@${esc(p.key || "ali")}${esc(yr)}</b><span>${MC.ltr(p.id)}</span><em>${ar ? "مثال" : "Exemple"}</em></div>` +
      `</div>`
    );
  }

  /* ---------- interaction: tap strikes the ball, long-press turns it over ---------- */
  function mount(el) {
    if (!el || !el.classList || !el.classList.contains("c02-card")) return;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = null;
    let long = false;
    el.addEventListener("pointerdown", () => {
      long = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        long = true;
        el.classList.toggle("is-flipped");
      }, 520);
    });
    const cancel = () => clearTimeout(timer);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("click", () => {
      if (long || reduce) return;
      el.classList.remove("is-strike");
      void el.getBoundingClientRect();
      el.classList.add("is-strike");
    });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--c02-tilt", r2(((e.clientX - r.left) / r.width - 0.5) * 2));
    });
  }

  const c = {
    id: "c02",
    n: 2,
    name: "Tir",
    nameAr: "التسديدة",
    category: "safe",
    philosophy:
      "Your card is your shot: the ball you struck, and the trail behind it that carries your name, your number and your four decisions.",
    philosophyAr:
      "بطاقتك هي تسديدتك: الكرة التي سدّدتها، والأثر خلفها يحمل اسمك ورقمك وقراراتك الأربعة.",
    idea: [
      "Tir is BotolaGO's own ball in flight, made into one object with no frame. A white ball flies to the top-end of a 300×420 portrait footprint and its trail falls on a shallow arc to the bottom-start — the arc a struck ball really draws, flatter where it arrives than where it left. Swooshes ride beside the trail: Logo Blue, then ink, then (at CHAMPION) the club's colour. The outline reads as 'a shot' before a word is read, and it never mirrors.",
      "Everything that is yours rides the trail, not the ball: the club band at its root (its two ends show on either side of the ball), your name with your tier inline on one baseline, your 84 in Changa 800 on the trail's thick end, then four stat lines stepping down the flight — CAP 91, SEL 82, TRF 86, CON 78. The tail is four equal lanes; no length encodes a value, so nothing reads as an attribute bar. 'OVR' is not drawn in the artwork; it lives in the accessible label.",
      "The ball carries only its two ink rim panels, the founder strike and its printed code: BOT #004821 is printed along a seam the way a maker prints a ball, with the country and the season beneath it. At the bottom-start, where the shot began, stands the shared manager figure from behind — hood up, rim-lit, cropped by the bottom edge — with one arm raised, pointing up along the shot.",
    ],
    belonging: [
      "Your card is your shot. Friends compare a number on a trail, and the trail itself tells everyone the tier before they read it: chalk on concrete, flat paint, the full logo, moulded rubber, a white blade.",
      "In a ranking your mark is a ball with your 84 on its trail, and the swooshes above it count your tier, so a table reads like a set of shots. Your own 'My position' card carries the same object with your club's colours as a collar round the ball.",
      "Founders carry a struck piece of the ball itself, and '·26' follows their name in rows and on the share, the way supporter groups carry their founding year.",
      "LEGEND's dimples are your season, pressed in one per gameweek played. It is calm enough for a 38-year-old: no glow, no metal, no reveal.",
    ],
    founderMark: [
      "One panel of the ball — the lower-end one at four o'clock, far from the swooshes and the top of the ball — is a die-struck Logo-Blue enamel pentagon with a lit bevel and '26' knocked out in white, about 14px on a phone. It is part of the ball, not a sticker. Non-founder balls have a plain ink panel there; a later cohort would get its year in a grey strike, so 2026 stays first.",
      "At 44–80px it is the blue lower-end rim panel of the token's ball; at 24–32px it is a blue notch cut into the rim at four o'clock, about 3px across even at 24px.",
      "In rows and on the share the year follows the name, 'ALI ·26', in Logo Blue. The back of the ball (long-press) reads FOUNDER 2026 with the ID and the season. With motion on, the strike plays a 120ms die-press once; it never gates anything.",
    ],
    small: [
      "44–80px: the same object flying flat (80×35 at 80, 44×19 at 44): the ball with its rim panels and founder panel, a tapered trail carrying the 84 in Changa 800 on its root, a club collar following the ball's rim where the trail leaves it (the club's primary between thin edges of its secondary: about 2.5px of colour at 44px, 4.5px at 80px), and the tier's swooshes above. No figure, no lanes, no filter texture.",
      "24–32px: the mini (32×19 at the 28px slot) fits inside a ranking row's name cell: a white ball ahead, the 84 in white on a short trail, and the tier counted in swooshes above it — HOMA none, STADE one, PRO two, CHAMPION three. LEGEND inverts the trail to a white blade 30% longer, which changes the outline; on the light ground the blade carries an ink keyline, so the top tier is never the faintest mark in a light ranking. The founder notch stays. The mini carries no club colour except CHAMPION's third swoosh.",
      "The full card is size-aware: below 260px the ball's second print line and the LEGEND 'EXEMPLE' tag drop, below 220px the printed code drops, and below 170px the stats and the figure drop. The thumb keeps the comet, the swooshes, the ball and the 84.",
    ],
    rtl: [
      "The comet never mirrors: the ball always flies to the right, as in the logo, and the figure stays where the shot began.",
      "Inside it the words follow the language: علي in Changa 800, upright, with the tier (محترف) inline to its left on the same baseline. The stat lines use the kit's labels (القائد، التشكيلة، الانتقالات، الثبات) in Noto Sans Arabic 700, each right-aligned to the trail's lower-end edge at one shared size, with their digits kept left-to-right; the Arabic block sits higher in the trail than the Latin one, where the chord is wider, and a block that would not fit moves up (never into the 84) before its size drops. The ball prints المغرب with the season.",
      "No letter-spacing anywhere in Arabic. Arabic has no initials: a name that does not fit at 18u keeps its first word, or its first two after عبد or أبو (so عبد الرحمن), then drops the tier onto a line beneath, clamped inside the trail. Nothing runs under the ball, over the club band's ends or into the 84.",
    ],
    tiers: {
      HOMA: "'Craie'. A patch of fresh concrete cut to the full comet outline, outlined and laned in clean white chalk, with chalk-white words; a new white ball with ink panels; no swooshes and no light. Raw, never poor.",
      STADE:
        "'Peinte'. The trail painted flat Floodlight Navy, one Logo-Blue swoosh, and a flat white ball.",
      PRO: "'Logo'. Floodlight Navy fading to Tunnel Navy toward the tip, the Logo-Blue swoosh plus the ink swoosh outside it (the logo's full grammar), and one soft top light on the ball.",
      CHAMPION:
        "'Caoutchouc'. The trail is moulded matte graphite rubber with fine grip ridges every 4u, three swooshes (the third in the club's colour), and a sheen on the ball that follows tilt. No metal.",
      LEGEND:
        "'Lame'. The trail becomes a matte white blade with one polished leading edge — the outline change: on the card it has its own geometry, fuller in the body and on a stronger arc, tapering to a point in the bottom-start corner; the tokens stretch it 30%. Ink words, a Logo-Blue tier word, and one debossed dimple per gameweek played (the sample's seven are marked EXEMPLE). On the light ground the blade is shaded and held by an ink keyline with an ink leading edge. No glow, no gold, no halo.",
    },
    legend: [
      "The strike, as an optional replay: the 84 holds its place from the first frame. With motion on, a contact frame squashes the ball (0.92 × 1.06), it flies to rest along the arc on the hero ease, and the dimples press in one by one, 20ms apart. Then stillness. Under reduced motion the final state shows.",
      "It is the only outline that reaches the card's corner, and as a token the blade runs 30% longer, so a LEGEND reads as a white blade even as a 28px mini in a ranking. Tapping any card pulls the ball back and springs it forward while the lanes redraw; a long-press turns the ball over to its provenance.",
    ],
    advantages: [
      "The strongest small-size object of the set: a ball and a trail with the 84 on it hold at 28px inside a ranking name cell on both grounds, and the swoosh count gives the tier.",
      "Owned by the brand: a ball in flight with swooshes is BotolaGO's own story, not FUT, Sorare, a bank card or a ticket, and it needs no frame.",
      "The stats are four calm lines, not bars: comparable at a glance, and they cannot be misread as progress to 100.",
      "One object from 24px to the poster: the share is the card itself, enlarged so its ball bleeds off the top-end corner, standing over a night pitch with two floodlight masts; its bottom edge becomes the touchline he points from, and the 84 (a 65px cap, about 10% of the frame) is the loudest thing in it.",
      "The club colour shows on every compact token as a collar at the ball (and as CHAMPION's third swoosh), and the ID, season and founder year each have a native carrier on the ball.",
    ],
    risks: [
      "Its grammar echoes the logo's flight (a ball with swooshes). It never uses or alters the logo file — the swooshes are drawn from scratch and the wordmark appears only as MC.logo() — but the owner should say yes before anything is built on it.",
      "It sits in the ⚽💨 sports-clip-art family, and a comet can be read as a tadpole; the ball's panels and the swooshes reduce this but do not remove it. It is also the least 'Moroccan street' slot: the local layer lives in HOMA's chalk and concrete, not in the PRO face.",
      "The portrait card leaves its bottom-end corner empty. The club band at the root lies mostly under the ball, so only its two ends show, and with a pale club secondary they can read as tape. The flat token and the diagonal card still need testing with users as one object.",
      "On the share the 84 is about 10% of the frame (not the 11% asked for) and breaks the trail's lower-end edge to get there; the LEGEND blade's point leaves the frame at the bottom-start. The delta ghost and the 1:1 variant are not built, nor is the rank-rise flight in rows.",
      "One dimple per gameweek fits about eleven weeks on the blade; a full season needs a second row or a finer pitch. The pointing arm is drawn onto the shared figure and is small in the 200px tier strip.",
    ],
    gridWidth: 250,
    detailWidth: 380,
    full,
    token,
    row,
    share,
    mount,
  };
  MC.register(c);
})();
