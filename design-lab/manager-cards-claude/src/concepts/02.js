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
  const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const poly = (pts) => "M" + pts.map(P).join("L") + "Z";
  const bestStat = (p) => MC.STATS.reduce((a, k) => (p.stats[k] > p.stats[a] ? k : a), MC.STATS[0]);
  /** The user's club colours (the lab's placeholder club; white when no club is set). */
  const clubOf = (p) => ({ a: (p.club && p.club.primary) || "#FFFFFF", b: (p.club && p.club.secondary) || "#FFFFFF" });

  /* ================= the full card: one comet, rising diagonally (viewBox 300×420) ================= */
  const VB = { w: 300, h: 420 };
  const C = { x: 224, y: 94, r: 70 };
  const AL = Math.hypot(0.547, 0.837);
  const AX = [-0.547 / AL, 0.837 / AL]; // from the ball toward the tip (bottom-start)
  const NM = [AX[1], -AX[0]]; // across the trail, toward its lower-end edge
  const at = (s, off = 0) => [C.x + AX[0] * s + NM[0] * off, C.y + AX[1] * s + NM[1] * off];
  const AX_DEG = (Math.atan2(AX[1], AX[0]) * 180) / Math.PI;
  /** Trail geometry: w(s) = 128 − 124·(s−36)/L, s measured from the ball centre. LEGEND is 30% longer. */
  const GEO = (legend) => {
    const L = 329 * (legend ? 1.3 : 1);
    const a1 = -124 / L;
    const a0 = 128 - a1 * 36;
    return { legend, L, a0, a1, sTip: 36 + L, w: (s) => a0 + a1 * s };
  };
  const G_BASE = GEO(false);
  const G_LEG = GEO(true);
  /** x of the trail's upper-start / lower-end edge at height y. */
  function edgeX(g, y, side) {
    const k = side < 0 ? -1 : 1;
    const s = (y - C.y - (k * NM[1] * g.a0) / 2) / (AX[1] + (k * NM[1] * g.a1) / 2);
    return C.x + AX[0] * s + (k * NM[0] * g.w(s)) / 2;
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
  function trailPath(g) {
    const s0 = 2;
    const u0 = at(s0, -g.w(s0) / 2);
    const l0 = at(s0, g.w(s0) / 2);
    const u1 = at(g.sTip, -g.w(g.sTip) / 2);
    const l1 = at(g.sTip, g.w(g.sTip) / 2);
    const tip = at(g.sTip + 2.6, 0);
    const front = at(-g.w(s0) / 2, 0);
    const R0 = r2(Math.hypot(u0[0] - C.x, u0[1] - C.y));
    // the root closes round the front of the ball (hidden under it), so the trail's edges stay tangent
    return `M${P(u0)}L${P(u1)}Q${P(tip)} ${P(l1)}L${P(l0)}A${R0} ${R0} 0 0 0 ${P(front)}A${R0} ${R0} 0 0 0 ${P(u0)}Z`;
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
      A.push(at(s, -base));
      B.push(at(s, -(base + th)));
    }
    return "M" + A.map(P).join("L") + "L" + B.reverse().map(P).join("L") + "Z";
  }
  // the logo's grammar: Logo-Blue swoosh, the ink swoosh outside it, and (CHAMPION) a club-colour third
  const CRES = [
    { s0: 40, s1: 200, gap: 10, T: 12, bow: 0, cls: "c02-cres-blue" },
    { s0: 24, s1: 150, gap: 27, T: 8, bow: 1.5, cls: "c02-cres-ink" },
    { s0: 18, s1: 108, gap: 40, T: 6, bow: 2, cls: "c02-cres-club" },
  ];
  const CRES_COUNT = { HOMA: 0, STADE: 1, PRO: 2, CHAMPION: 3, LEGEND: 2 };
  const BAND = [52, 62];
  const STAT_S = { lat: [205, 222, 239, 256], ar: [207, 228.5, 250, 271.5] };
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
    d += `<path id="${id}-seam2" d="M196 119Q222 127 246 120" fill="none"/>`;
    // struck enamel: blurred alpha lit from the top-start, added back over the fill
    d +=
      `<filter id="${id}-strike" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b"/>` +
      `<feSpecularLighting in="b" surfaceScale="2.4" specularConstant="0.95" specularExponent="24" lighting-color="#ffffff" result="s"><feDistantLight azimuth="225" elevation="44"/></feSpecularLighting>` +
      `<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>` +
      `<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.5" k4="0"/></filter>`;
    if (tier === "PRO") {
      // Floodlight Navy at the root fading to Tunnel Navy at the tip: the colour of motion
      const a = at(40);
      const b = at(G_BASE.sTip);
      d += `<linearGradient id="${id}-gtrail" gradientUnits="userSpaceOnUse" x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(b[0])}" y2="${r2(b[1])}"><stop offset="0" stop-color="#0C3164"/><stop offset="1" stop-color="#001C49"/></linearGradient>`;
    }
    if (tier === "HOMA") {
      // fresh concrete: fine aggregate, clean edges (no displacement)
      d +=
        `<filter id="${id}-conc" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.86 0 0 0 0 0.88 0 0 0 0 0.9 1.9 0 0 0 -1.12" result="lt"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.12 0 0 0 0 0.13 0 0 0 0 0.15 -1.9 0 0 0 0.86" result="dk"/>` +
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
      const u = at(150, -60);
      const l = at(150, 60);
      d +=
        `<linearGradient id="${id}-gblade" gradientUnits="userSpaceOnUse" x1="${r2(u[0])}" y1="${r2(u[1])}" x2="${r2(l[0])}" y2="${r2(l[1])}">` +
        `<stop offset="0" class="c02-s-blade-hi"/><stop offset="0.45" class="c02-s-blade"/><stop offset="1" class="c02-s-blade-lo"/></linearGradient>`;
    }
    return `<defs>${d}${extra}</defs>`;
  }

  /* ---------- the trail and its swooshes ---------- */
  function trailLayer(id, p, tier, opts = {}) {
    const legend = tier === "LEGEND";
    const g = legend ? G_LEG : G_BASE;
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
    if (tier === "HOMA") body = `<path d="${path}" class="c02-concrete" filter="url(#${id}-conc)"/>`;
    else if (tier === "STADE") body = `<path d="${path}" class="c02-paint"/>`;
    else if (tier === "CHAMPION") body = `<path d="${path}" class="c02-rubber"/><path d="${path}" fill="url(#${id}-ridge)" opacity="0.9"/>`;
    else if (legend) body = `<path d="${path}" fill="url(#${id}-gblade)"/>`;
    else body = `<path d="${path}" fill="url(#${id}-gtrail)"/>`;
    out += `<g${legend ? ` clip-path="url(#${id}-cframe)"` : ""}>` + body;
    // the club band at the root (only its two ends show beside the ball)
    const b0 = BAND[0];
    const b1 = BAND[1];
    const band = (s0, s1) => poly([at(s0, -g.w(s0) / 2 - 1), at(s1, -g.w(s1) / 2 - 1), at(s1, g.w(s1) / 2 + 1), at(s0, g.w(s0) / 2 + 1)]);
    out += `<g clip-path="url(#${id}-ctrail)"><path d="${band(b0, b1)}" fill="${club.b}"/><path d="${band(b0 + 1.6, b1 - 1.6)}" fill="${club.a}"/></g>`;
    // lanes: four equal lanes run on to the tip; their length never encodes a value
    if (!opts.thumb) {
      const sEnd = Math.min(g.sTip - 6, legend ? 392 : 1e9);
      const lanes = legend ? [-1, 1] : [-1, 0, 1];
      lanes.forEach((k) => {
        const a = at(LANE_S0, (k * g.w(LANE_S0)) / 4);
        const b = at(sEnd, (k * g.w(sEnd)) / 4);
        out += `<path d="M${P(a)}L${P(b)}" class="c02-lane c02-lane-${tier.toLowerCase()}" pathLength="1"${tier === "HOMA" ? ` filter="url(#${id}-chalk)"` : ""}/>`;
      });
    }
    // material details
    if (tier === "HOMA") {
      // the patch outlined in fresh chalk, 2.5u inside its clean-cut edge
      const s0 = 30;
      const sT = g.sTip - 3;
      const e = (s, k) => at(s, k * (g.w(s) / 2 - 2.6));
      out += `<path d="M${P(e(s0, -1))}L${P(e(sT, -1))}L${P(at(g.sTip - 1, 0))}L${P(e(sT, 1))}L${P(e(s0, 1))}" class="c02-chalk-line" filter="url(#${id}-chalk)"/>`;
    }
    if (legend) {
      // one polished leading edge, a soft fall-off on the other
      const u0 = at(4, -g.w(4) / 2 + 1.1);
      const u1 = at(g.sTip, -g.w(g.sTip) / 2 + 1.1);
      out += `<path d="M${P(u0)}L${P(u1)}" class="c02-blade-edge"/>`;
      out += `<path d="M${P(at(4, -g.w(4) / 2 + 3))}L${P(at(g.sTip, -g.w(g.sTip) / 2 + 3))}" class="c02-blade-bevel"/>`;
    }
    out += `<path d="${path}" class="c02-trail-rim${legend ? " is-blade" : ""}" fill="none" vector-effect="non-scaling-stroke"/>`;
    out += `</g>`;
    return out;
  }

  /** LEGEND: one debossed dimple per gameweek played (the sample's seven are an example). */
  function dimples(id, o) {
    const ar = MC.isAr(o);
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
    g += `<text x="${r2(t[0])}" y="${r2(t[1])}" font-size="${ar ? 7 : 6}" text-anchor="middle" dominant-baseline="central" transform="rotate(${r2(AX_DEG - 180)} ${r2(t[0])} ${r2(t[1])})" class="${ar ? "c02-t-ar" : "c02-t-lab c02-track"} c02-example">${ar ? "مثال" : "EXEMPLE"}</text>`;
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
    RIM_PANELS.forEach((q) => (g += `<path d="${poly(pent(q.c[0], q.c[1], q.R, rot(q.c)))}" class="c02-panel"/>`));
    const fv = pent(F_PANEL.c[0], F_PANEL.c[1], F_PANEL.R, rot(F_PANEL.c));
    if (p.founder) {
      // the founder strike: a die-struck Logo-Blue enamel pentagon with '26' knocked out
      g += `<g class="c02-founder"><path d="${poly(fv)}" fill="#0151FC" filter="url(#${id}-strike)"/>`;
      g += `<path d="M${P(fv[2])}L${P(fv[3])}L${P(fv[4])}" fill="none" stroke="#3D7BFF" stroke-width="0.8" stroke-linejoin="round"/>`;
      g += `<path d="M${P(fv[4])}L${P(fv[0])}L${P(fv[1])}L${P(fv[2])}" fill="none" stroke="#0039B8" stroke-width="0.8" stroke-linejoin="round"/>`;
      if (!opts.thumb) g += numText(String(p.founder).slice(-2), F_PANEL.c[0] - 1.6, F_PANEL.c[1] - 1.2, 12, "c02-founder-26");
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
    const target = opts.target || [C.x, C.y];
    const fill = opts.fill || "#0C1F3D";
    const seam = opts.seam || "#1E3A66";
    const rim = opts.rim || "#9BDBFD";
    // the raised arm, in the avatar's own units: shoulder → hand, aimed at the ball
    const S0 = [164, 200];
    const sc = [o[0] + S0[0] * k, o[1] + S0[1] * k];
    let dx = target[0] - sc[0];
    let dy = target[1] - sc[1];
    const m = Math.hypot(dx, dy);
    dx /= m;
    dy /= m;
    const px = -dy;
    const py = dx;
    const L = 128;
    const H = [S0[0] + dx * L, S0[1] + dy * L];
    const arm =
      `M${P([S0[0] - px * 22 - dx * 14, S0[1] - py * 22 - dy * 14])}` +
      `L${P([H[0] - px * 11, H[1] - py * 11])}` +
      `L${P([H[0] + px * 11, H[1] + py * 11])}` +
      `L${P([S0[0] + px * 20 - dx * 22, S0[1] + py * 20 - dy * 22])}Z`;
    const fist = `M${P([H[0] - px * 12 + dx * 2, H[1] - py * 12 + dy * 2])}a13 13 0 1 0 ${r2(px * 24)} ${r2(py * 24)}a13 13 0 1 0 ${r2(-px * 24)} ${r2(-py * 24)}Z`;
    const finger = [
      [H[0] + dx * 10 - px * 4, H[1] + dy * 10 - py * 4],
      [H[0] + dx * 34 - px * 4, H[1] + dy * 34 - py * 4],
    ];
    const armG = (f, st = "") =>
      `<g transform="translate(${r2(o[0])} ${r2(o[1])}) scale(${r2(k)})"${st}>` +
      `<path d="${arm}" fill="${f}"/><path d="${fist}" fill="${f}"/>` +
      `<path d="M${P(finger[0])}L${P(finger[1])}" stroke="${f}" stroke-width="9" stroke-linecap="round"/></g>`;
    const sw = r2(2 / k);
    // rim light: the whole figure stroked in sky, then the figure on top
    const rimG =
      MC.avatar({ x: r2(box.x), y: r2(box.y), w: r2(box.w), h: r2(box.h), torso: rim, seam: false, stroke: rim, strokeWidth: sw }) +
      `<g transform="translate(${r2(o[0])} ${r2(o[1])}) scale(${r2(k)})" stroke="${rim}" stroke-width="${sw}" stroke-linejoin="round">` +
      `<path d="${arm}" fill="${rim}"/><path d="${fist}" fill="${rim}"/>` +
      `<path d="M${P(finger[0])}L${P(finger[1])}" stroke-width="${r2(9 + 2 * sw)}" stroke-linecap="round"/></g>`;
    const body = MC.avatar({ x: r2(box.x), y: r2(box.y), w: r2(box.w), h: r2(box.h), torso: fill, seam });
    return `<g class="c02-fig"${opts.clip ? ` clip-path="url(#${opts.clip})"` : ""}>${rimG}${armG(fill)}${body}</g>`;
  }

  /* ---------- the words on the trail ---------- */
  function initialForm(name) {
    const parts = name.split(/[\s-]+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
  }
  /** Name and tier inline on one baseline, centred in the trail at s≈90. */
  function nameLine(g, p, o, tier) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    let name = MC.nameOf(p, o);
    if (!ar && name.length > 10) name = initialForm(name);
    const tierTxt = S.tiers[tier];
    const NF = F_NUM;
    const TF = ar ? F_AR : F_LAB;
    const track = ar ? 0 : 0.08;
    let ns = ar ? 30 : 32;
    let ts = ar ? 12 : 11;
    const gap = ar ? 7 : 6;
    const mid = at(90)[1];
    let best = null;
    // try a few baselines around s≈90 and keep the one that lets the name stay largest
    for (let dyb = -6; dyb <= 12; dyb += 2) {
      let n = ns;
      let t = ts;
      for (let it = 0; it < 6; it++) {
        const mn = measure(name, NF, n);
        const asc = ar ? n * 0.62 : mn.a;
        const desc = ar ? n * 0.42 : 0;
        const yb = mid + asc / 2 + dyb;
        const rm = room(g, yb - asc, yb + desc, 5, 3);
        const tw = textW(tierTxt, TF, t, track);
        const total = mn.w + gap + tw;
        if (total <= rm.w) {
          if (!best || n > best.n + 0.01) best = { n, t, yb, rm, nw: mn.w, tw, total };
          break;
        }
        const k = rm.w / total;
        n = Math.max(16, n * k);
        t = Math.max(8.5, t * Math.max(k, 0.82));
        if (n === 16 && t === 8.5) {
          if (!best) best = { n, t, yb, rm, nw: mn.w, tw, total };
          break;
        }
      }
    }
    const b = best;
    const x0 = b.rm.c - b.total / 2;
    const cls = `c02-nz c02-nz-${tier.toLowerCase()}`;
    if (ar) {
      // RTL: the name at the right, the tier after it to the left, both upright
      const nx = x0 + b.total - b.nw / 2;
      const tx = x0 + b.tw / 2;
      return (
        `<g class="${cls}">` +
        `<text x="${r2(nx)}" y="${r2(b.yb)}" font-size="${r2(b.n)}" text-anchor="middle" class="c02-t-arname c02-name">${esc(name)}</text>` +
        `<text x="${r2(tx)}" y="${r2(b.yb)}" font-size="${r2(b.t)}" text-anchor="middle" class="c02-t-ar c02-tier">${esc(tierTxt)}</text></g>`
      );
    }
    return (
      `<g class="${cls}">` +
      `<text x="${r2(x0 + b.nw / 2)}" y="${r2(b.yb)}" font-size="${r2(b.n)}" text-anchor="middle" class="c02-t-name c02-name" direction="ltr">${esc(name)}</text>` +
      `<text x="${r2(x0 + b.nw + gap + b.tw / 2)}" y="${r2(b.yb)}" font-size="${r2(b.t)}" text-anchor="middle" class="c02-t-lab c02-track c02-tier" direction="ltr">${esc(tierTxt)}</text></g>`
    );
  }
  /** The 84 on the trail's thick end, white on the trail (ink on the LEGEND blade). */
  function ovrMark(g, p) {
    const c = at(150);
    const big = String(p.ovr).length > 2;
    let fs = big ? 60 * 0.82 : 60;
    const m = measure(String(p.ovr), F_NUM, fs);
    const rm = room(g, c[1] - m.a / 2, c[1] + m.a / 2, 4, 3);
    const cx = Math.min(Math.max(rm.c, c[0] - 6), c[0] + 6);
    return `<g class="c02-ovrg">${numText(p.ovr, cx, c[1], fs, "c02-ovr")}</g>`;
  }
  /** Four horizontal stat lines stepping down the trail. */
  function statLines(g, p, o, tier) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const ss = ar ? STAT_S.ar : STAT_S.lat;
    let out = `<g class="c02-stats c02-stats-${tier.toLowerCase()}">`;
    MC.STATS.forEach((k, i) => {
      const c = at(ss[i]);
      const lab = S.stats[k];
      const val = String(p.stats[k]);
      let fs = ar ? 11 : 12;
      let lw;
      let vw;
      let rm;
      const gap = ar ? 4 : 4.2;
      for (let it = 0; it < 5; it++) {
        const asc = ar ? fs * 0.66 : fs * 0.72;
        const desc = ar ? fs * 0.36 : 0;
        lw = ar ? textW(lab, F_AR, fs) : textW(lab, F_LAB, fs, 0.06);
        vw = textW(val, F_LAB, fs);
        rm = room(g, c[1] - asc / 2 - (ar ? 1 : 0), c[1] + asc / 2 + desc, ar ? 3 : 2.5, 3);
        if (lw + gap + vw <= rm.w || fs <= 8.5) break;
        fs = Math.max(8.5, (fs * rm.w) / (lw + gap + vw));
      }
      const yb = c[1] + (ar ? fs * 0.3 : fs * 0.36);
      const tot = lw + gap + vw;
      if (ar) {
        // right-aligned within the chord: the label reads first, the value (LTR) after it
        const xr = rm.R;
        out +=
          `<text x="${r2(xr - lw / 2)}" y="${r2(yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-ar c02-slab">${esc(lab)}</text>` +
          `<text x="${r2(xr - lw - gap - vw / 2)}" y="${r2(yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-lab c02-sval" direction="ltr">${val}</text>`;
      } else {
        const x0 = rm.c - tot / 2;
        out +=
          `<text x="${r2(x0 + lw / 2)}" y="${r2(yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-lab c02-slab c02-track-s" direction="ltr">${esc(lab)}</text>` +
          `<text x="${r2(x0 + lw + gap + vw / 2)}" y="${r2(yb)}" font-size="${r2(fs)}" text-anchor="middle" class="c02-t-lab c02-sval" direction="ltr">${val}</text>`;
      }
    });
    return out + `</g>`;
  }

  /** The whole comet, in card units (shared by the card and the share image). */
  function comet(id, p, o, tier, opts = {}) {
    const g = tier === "LEGEND" ? G_LEG : G_BASE;
    let svg = "";
    svg += trailLayer(id, p, tier, opts);
    if (tier === "LEGEND" && !opts.thumb) svg += dimples(id, o);
    if (!opts.thumb) svg += nameLine(g, p, o, tier) + statLines(g, p, o, tier);
    svg += ovrMark(g, p);
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
    const g = tier === "LEGEND" ? G_LEG : G_BASE;
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
  const TK = { H: 70, ball: { x: 125, y: 35, r: 34 }, head: 32, ua: -118, uc: [50, 3], tip: [2, 55], tipW: 3, lc: [52, 70], la: 112, num: [62, 50], fs: 36 };
  const MN = { H: 72, ball: { x: 92, y: 36, r: 28 }, head: 36, ua: -100, uc: [24, 4], tip: [1, 54], tipW: 4, lc: [30, 73], la: 100, num: [41, 52], fs: 42 };
  const qpt = (a, c, b, t) => {
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  };
  const qdr = (a, c, b, t) => {
    const u = 1 - t;
    return [2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];
  };
  function swoosh(T, legend) {
    const b = T.ball;
    const tail = b.x - T.tip[0];
    // the LEGEND blade is 30% longer: same ball, the tail stretched out to the start
    const ext = legend ? 0.3 * (b.x - b.r - T.tip[0]) : 0;
    const m = (tail + ext) / tail;
    const bx = b.x + ext;
    const sx = (x) => bx - (b.x - x) * m;
    const hp = (deg, R = T.head) => [bx + R * Math.cos((deg * Math.PI) / 180), b.y + R * Math.sin((deg * Math.PI) / 180)];
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
          { t0: 0.16, t1: 0.86, gap: 4.5, T: 6.5 },
          { t0: 0.1, t1: 0.66, gap: 14, T: 5.5 },
          { t0: 0.06, t1: 0.46, gap: 22.5, T: 4.6 },
        ]
      : [
          { t0: 0.12, t1: 0.86, gap: 3.6, T: 5.6 },
          { t0: 0.08, t1: 0.66, gap: 11.4, T: 4.4 },
          { t0: 0.05, t1: 0.46, gap: 18.2, T: 3.6 },
        ];
    const cls = ["c02-cres-blue", "c02-cres-ink", "c02-cres-club"];
    for (let i = n - 1; i >= 0; i--) {
      const c = spec[i];
      g += `<path d="${swooshCrescent(f, c.t0, c.t1, c.gap, c.T)}" class="c02-cres ${cls[i]}"${i === 2 ? ` fill="${club.a}"` : ""}/>`;
    }
    g += `<path d="${f.path}" ${trailFill(id, tier)}/>`;
    // club band: a stripe across the trail where it leaves the ball (44px and up)
    if (!mini) {
      const x1 = f.b.x - f.b.r - 1;
      const x0 = x1 - 7;
      g += `<g clip-path="url(#${id}-tt)"><rect x="${r2(x0)}" y="0" width="7" height="${T.H}" fill="${club.b}"/><rect x="${r2(x0 + 1.6)}" y="0" width="3.8" height="${T.H}" fill="${club.a}"/></g>`;
    }
    g += `<path d="${f.path}" fill="none" class="c02-trail-rim${legend ? " is-blade" : ""}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    // the 84 rides the trail's root
    const fs = T.fs * (String(p.ovr).length > 2 ? 0.82 : 1);
    g += numText(p.ovr, f.b.x - (T.ball.x - T.num[0]), T.num[1], fs, legend ? "c02-ovr is-ink" : tier === "HOMA" ? "c02-ovr is-chalk" : "c02-ovr");
    g += tokenBall(id, p, tier, f.b, mini);
    // nominal size → px: compact 80 → 80×35; mini 28 → 32×18
    const pxPerU = mini ? size / 28 / 4 : size / 80 / 2;
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
    const g = tier === "LEGEND" ? G_LEG : G_BASE;
    // the card's comet, scaled so the ball is about 150px across, placed to rise across the frame
    const k = 1.1;
    const B = [262, 172];
    const tr = `translate(${B[0]} ${B[1]}) scale(${k}) translate(${-C.x} ${-C.y})`;
    const toShare = (q) => [B[0] + (q[0] - C.x) * k, B[1] + (q[1] - C.y) * k];
    const HZ = 470;
    let stripes = "";
    for (let i = -8; i <= 8; i++) {
      if (i % 2 === 0) continue;
      const x0 = 180 + i * 30;
      const x1 = x0 + 30;
      const top = (x) => 180 + (x - 180) * 0.34;
      const bot = (x) => 180 + (x - 180) * 1.5;
      stripes += `<path d="M${r2(top(x0))} ${HZ}L${r2(top(x1))} ${HZ}L${r2(bot(x1))} 640L${r2(bot(x0))} 640Z"/>`;
    }
    const extra =
      `<clipPath id="${id}-ctrail"><path d="${trailPath(g)}"/></clipPath>` +
      `<linearGradient id="${id}-gsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#062550"/><stop offset="0.6" stop-color="#001C49"/><stop offset="1" stop-color="#00102B"/></linearGradient>`;
    let svg = defs(id, tier, extra);
    svg += `<rect width="360" height="640" fill="url(#${id}-gsky)"/>`;
    // two flat floodlight halos at the top: discs, no glow
    [
      [300, 58, 1],
      [196, 34, 0.8],
    ].forEach(([x, y, s]) => {
      svg += `<circle cx="${x}" cy="${y}" r="${r2(54 * s)}" fill="#9BDBFD" fill-opacity="0.06"/><circle cx="${x}" cy="${y}" r="${r2(30 * s)}" fill="#9BDBFD" fill-opacity="0.08"/><circle cx="${x}" cy="${y}" r="${r2(9 * s)}" fill="#EAF6FF" fill-opacity="0.9"/>`;
    });
    // the perspective pitch
    svg += `<rect x="0" y="${HZ}" width="360" height="${640 - HZ}" fill="#001634"/>`;
    svg += `<g fill="hsl(214 90% 55% / .13)">${stripes}</g>`;
    svg += `<path d="M0 ${HZ}H360" stroke="#9BDBFD" stroke-opacity="0.3" stroke-width="1"/>`;
    // the touchline, where he stands
    svg += `<path d="M0 556L360 548" stroke="#EAF6FF" stroke-opacity="0.5" stroke-width="2"/>`;
    // the striker, small and solid at the bottom-start, pointing at the ball
    const fb = { x: 74, y: 452, w: 78, h: 93.6 };
    const fk = Math.min(fb.w / 200, fb.h / 240);
    svg += figureLayer(id, { box: fb, k: fk, o: [fb.x + (fb.w - 200 * fk) / 2, fb.y + (fb.h - 240 * fk)], target: B, fill: "#000A1E", seam: "#0C3164", rim: "#9BDBFD" });
    svg += `<g transform="${tr}">${comet(id, p, o, tier, { share: true })}</g>`;
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
    philosophy: "Your card is your shot: the ball you struck, and the trail behind it that carries your name, your number and your four decisions.",
    philosophyAr: "بطاقتك هي تسديدتك: الكرة التي سدّدتها، والأثر خلفها يحمل اسمك ورقمك وقراراتك الأربعة.",
    idea: [],
    belonging: [],
    founderMark: [],
    small: [],
    rtl: [],
    tiers: {},
    legend: [],
    advantages: [],
    risks: [],
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
