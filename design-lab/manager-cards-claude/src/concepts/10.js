/* 10 QUATRE OMBRES (wildcard).
   Under four floodlights every player casts four shadows. Here the manager's four
   decision stats ARE those shadows: one reach for all four, length = value, cast from
   the feet toward the four lamp towers. A founder casts a fifth, short shadow from the
   first light. The tier is carried by the quality of the light, never by a colour swatch. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const f = (n) => Math.round(n * 100) / 100;

  const C = {
    night: "#0B1A33",
    deep: "#050D1C",
    tunnel: "#001C49",
    logo: "#0151FC",
    shadow: "#0C3164",
    muted: "#4E5661",
    meta: "#A9B2BE",
    lens: "#F4FBFF",
    sodium: "#FFA23A",
    first: "#FFF1D2",
    figure: "#0C1F3D",
  };

  /* ---------- the light, per tier ---------- */
  // blur = shadow penumbra per stat (user units), fill/op = shadow ink, lamp = head type,
  // mast = how far the tower stands out past the panel corner (the outline grows with tier).
  const TIER = {
    HOMA: {
      ground: "concrete", base: "#C9B59A", stripe: null, hubGlow: 0, night: C.night,
      blur: { CAP: 2.1, TRF: 2.1, SEL: 2.1, CON: 2.1 },
      fill: { CAP: "#2C241D", TRF: "#2C241D", SEL: "#2C241D", CON: "#2C241D" },
      op: 0.62, lamp: "sodium", mast: 11, rim: null, bloom: C.sodium, bloomOp: 0.55,
      tok: { base: "#CDB99C" },
    },
    STADE: {
      ground: "synthetic", base: "#B9C7D2", stripe: null, hubGlow: 0, night: C.night,
      blur: { CAP: 0.5, CON: 0.5, SEL: 1.7, TRF: 1.7 },
      fill: { CAP: "#0A2650", CON: "#0A2650", SEL: "#302822", TRF: "#302822" },
      op: 0.72, lamp: "mixed", mast: 12, rim: "#FFE7C4", rimW: 5, rimOp: 0.6, bloom: C.lens, bloomOp: 0.45,
      tok: { base: "#BCCAD5" },
    },
    PRO: {
      ground: "grass", base: "#D0DEE7", stripe: "#B9CCD9", hubGlow: 0.18, night: C.night,
      blur: { CAP: 0.6, TRF: 0.6, SEL: 0.6, CON: 0.6 },
      fill: { CAP: C.shadow, TRF: C.shadow, SEL: C.shadow, CON: C.shadow },
      op: 0.78, lamp: "led", mast: 14, rim: "#FFFFFF", rimW: 6, rimOp: 0.9, bloom: C.lens, bloomOp: 0.55,
      tok: { base: "#D3E0E9" },
    },
    CHAMPION: {
      ground: "wet", base: "#AFC2D0", stripe: "#9FB5C5", hubGlow: 0.2, night: C.night,
      blur: { CAP: 0.3, TRF: 0.3, SEL: 0.3, CON: 0.3 },
      fill: { CAP: "#061D44", TRF: "#061D44", SEL: "#061D44", CON: "#061D44" },
      op: 0.88, lamp: "flood", mast: 16, rim: "#FFFFFF", rimW: 6.5, rimOp: 0.95, bloom: C.lens, bloomOp: 0.6, sheen: true,
      tok: { base: "#B7C9D6" },
    },
    LEGEND: {
      ground: "pristine", base: "#D7E3EB", stripe: "#C3D4DF", hubGlow: 0.75, night: C.deep,
      blur: { CAP: 0, TRF: 0, SEL: 0, CON: 0 },
      fill: { CAP: "#061736", TRF: "#061736", SEL: "#061736", CON: "#061736" },
      op: 0.95, lamp: "tower", mast: 18, rim: "#FFFFFF", rimW: 8, rimOp: 1, bloom: C.lens, bloomOp: 0.85, glare: true,
      tok: { base: "#FFFFFF" },
    },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;

  /* ---------- geometry ---------- */
  const STATS = ["CAP", "TRF", "SEL", "CON"];
  const CORNER_OF = { CAP: "TL", TRF: "TR", SEL: "BL", CON: "BR" };
  // relight order (CAP, SEL, TRF, CON), founder light last
  const STEP = { CAP: 1, SEL: 2, TRF: 3, CON: 4 };
  const STEP_LAMP = { BR: 1, TR: 2, BL: 3, TL: 4 };

  /** ONE mapping for every surface (card, token, share): value 40→100 fills 30→100% of the reach. */
  const mapStat = (v) => Math.max(0.3, Math.min(1, (v - 40) / 60));
  const REACH = 170;

  /** Shadow directions and lengths: one reach for all four, so only the stats change the shape. */
  function rig(F, corners, reach, p) {
    const out = {};
    for (const k of STATS) {
      const [cx, cy] = corners[CORNER_OF[k]];
      const dx = cx - F[0], dy = cy - F[1];
      const dist = Math.hypot(dx, dy);
      out[k] = { ang: (Math.atan2(dy, dx) * 180) / Math.PI, L: mapStat(p.stats[k]) * reach, ux: dx / dist, uy: dy / dist };
    }
    return out;
  }

  /** Catmull-Rom through points, as cubic segments (no leading M). */
  function spline(pts) {
    let d = "";
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }

  /**
   * A person's shadow lying along +x from the feet (0,0): the touchline stance, hands on hips.
   * Legs apart (a gap that closes at the crotch), elbows out, so two triangles of lit turf
   * show between each arm and the body; a thick neck running into an elongated head.
   * One path, holes cut with fill-rule="evenodd".
   */
  function shadowShape(L, s = 1) {
    const rx = 7.5 * s, ry = 5.4 * s, nw = 3.8 * s;
    const B = L - 2 * rx; // feet to chin
    const hc = L - rx; // head centre
    const P = (t, w) => [t * B, w * s];
    const inner = [P(0.3, 1.25), P(0.14, 1.95), P(0.01, 2.4)];
    const foot = [[-0.6 * s, 4.3 * s]];
    const jx = hc - rx * Math.sqrt(1 - (nw / ry) ** 2);
    const outer = [P(0.01, 6.2), P(0.14, 5.5), P(0.28, 5.2), P(0.42, 6), P(0.52, 7), P(0.565, 8.4), P(0.71, 15), P(0.8, 13.8), P(0.895, 11.4), P(0.935, 8.6), P(0.965, 4.4), [jx, nw]];
    const th0 = Math.PI - Math.asin(nw / ry);
    const arc = [];
    const N = 10;
    for (let i = 1; i < N; i++) {
      const th = th0 - (2 * th0 * i) / N;
      arc.push([hc + rx * Math.cos(th), ry * Math.sin(th)]);
    }
    const mir = (pts) => pts.map(([x, y]) => [x, -y]);
    const crotch = [0.48 * B, 0];
    const loop = [crotch, ...inner, ...foot, ...outer, ...arc, ...mir(outer).reverse(), ...mir(foot), ...mir(inner).reverse(), crotch];
    let d = `M${f(crotch[0])} 0${spline(loop)}Z`;
    for (const sg of [1, -1]) {
      const a = P(0.6, 6.1 * sg), b = P(0.71, 11.6 * sg), c = P(0.835, 8.2 * sg);
      d += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}L${f(c[0])} ${f(c[1])}Z`;
    }
    return d;
  }

  /* ---------- text measurement (Changa digits are proportional) ---------- */
  // Changa 800, per 100px: [advance, ink left, ink right], measured in Chromium on 2026-10-07.
  // A table, not canvas: measuring at render time races the web-font load.
  const DIG = { 0: [67.5, 4, 64], 1: [53.5, 1, 52], 2: [59.5, 3, 56], 3: [55.6, 1, 53], 4: [62.7, 1, 60], 5: [58.9, 4, 56], 6: [61.5, 3, 58], 7: [50, 0, 48], 8: [61.6, 3, 59], 9: [61.5, 3, 58] };
  /** Ink of a Changa 800 figure string in em: dx = offset that centres the ink on x (start anchor), half = half ink width. */
  function ink(text) {
    let x = 0, l = 0, r = 0;
    const ch = String(text).split("");
    ch.forEach((c, i) => {
      const [a, il, ir] = DIG[c] || [60, 3, 57];
      if (i === 0) l = x + il;
      if (i === ch.length - 1) r = x + ir;
      x += a;
    });
    return { dx: -(l + r) / 200, half: (r - l) / 200, asc: 0.64 };
  }
  // Label widths per 1px of font size, measured in Chromium (Manrope 800 / Noto Sans Arabic 700).
  const LAB_EM = {
    lat: { CAP: 2.06, SEL: 1.8, TRF: 1.81, CON: 2.23 },
    ar: { CAP: 2.31, SEL: 3.82, TRF: 4.13, CON: 2.71 },
  };
  const VAL_EM = 1.25; // two Manrope 800 digits

  /* ---------- shared defs ---------- */
  function defs(u, T, box, F) {
    const { x, y, w, h } = box;
    let d = "";
    d += `<clipPath id="${u}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>`;
    d += `<filter id="${u}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${box.soft || 6}"/></filter>`;
    d += `<mask id="${u}-lit" maskUnits="userSpaceOnUse" x="${x - 40}" y="${y - 40}" width="${w + 80}" height="${h + 80}"><rect x="${box.lit[0]}" y="${box.lit[1]}" width="${box.lit[2]}" height="${box.lit[3]}" rx="12" fill="#fff" filter="url(#${u}-soft)"/></mask>`;
    // light pool: brightest at the hub, settling toward the edge
    d += `<radialGradient id="${u}-pool" gradientUnits="userSpaceOnUse" cx="${F[0]}" cy="${F[1]}" r="${box.poolR || 230}"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="${C.night}" stop-opacity="${T.glare ? 0.4 : 0.22}"/></radialGradient>`;
    d += `<radialGradient id="${u}-hub" gradientUnits="userSpaceOnUse" cx="${F[0]}" cy="${F[1]}" r="${box.hubR || 120}"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".35" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    d += `<linearGradient id="${u}-graph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#AEB7C1"/><stop offset=".18" stop-color="#5D6876"/><stop offset=".6" stop-color="#2C3644"/><stop offset="1" stop-color="#18202B"/></linearGradient>`;
    d += `<linearGradient id="${u}-graphH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2C3644"/><stop offset=".45" stop-color="#8E99A6"/><stop offset="1" stop-color="#1E2733"/></linearGradient>`;
    d += `<radialGradient id="${u}-lens" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="${C.lens}"/><stop offset="1" stop-color="#9DB4C6"/></radialGradient>`;
    d += `<radialGradient id="${u}-halo"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-sod" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#FFF3DA"/><stop offset=".4" stop-color="#FFC877"/><stop offset="1" stop-color="${C.sodium}"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloom"><stop offset="0" stop-color="${T.bloom}" stop-opacity="${T.bloomOp}"/><stop offset=".35" stop-color="${T.bloom}" stop-opacity="${f(T.bloomOp * 0.35)}"/><stop offset="1" stop-color="${T.bloom}" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloomS"><stop offset="0" stop-color="${C.sodium}" stop-opacity=".6"/><stop offset=".4" stop-color="${C.sodium}" stop-opacity=".2"/><stop offset="1" stop-color="${C.sodium}" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloomF"><stop offset="0" stop-color="${C.first}" stop-opacity=".75"/><stop offset=".4" stop-color="${C.first}" stop-opacity=".2"/><stop offset="1" stop-color="${C.first}" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-spike"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-dark"><stop offset="0" stop-color="${C.deep}" stop-opacity=".94"/><stop offset=".5" stop-color="${C.deep}" stop-opacity=".62"/><stop offset="1" stop-color="${C.deep}" stop-opacity="0"/></radialGradient>`;
    // painted marks: grass blades break the paint
    d += `<filter id="${u}-paint" x="-4%" y="-20%" width="108%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.3 0.55" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".8" xChannelSelector="R" yChannelSelector="G" result="dsp"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.4 0 0 0 3.3" result="m"/><feComposite in="dsp" in2="m" operator="in"/></filter>`;
    d += `<filter id="${u}-contact" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="2.6"/></filter>`;
    if (T.glare)
      // LEGEND: the air is lit, the beams carry haze
      d += `<filter id="${u}-haze" filterUnits="userSpaceOnUse" x="${x - 30}" y="${y - 30}" width="${w + 60}" height="${h + 60}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".02 .06" numOctaves="3" seed="8" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.9 0 0 0 -.38" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`;
    return d;
  }

  /** Grain filter: dark and light specks from one noise field. */
  function grainFilter(id, freq, oct, seed, dark, kd, kl) {
    return (
      `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${dark[0]}  0 0 0 0 ${dark[1]}  0 0 0 0 ${dark[2]}  ${kd[0]} 0 0 0 ${kd[1]}" result="dk"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${kl[0]} 0 0 0 ${kl[1]}" result="lt"/>` +
      `<feMerge><feMergeNode in="dk"/><feMergeNode in="lt"/></feMerge></filter>`
    );
  }

  /** Short grass blades seen from the high camera: two tile sizes so the repeat never lines up. */
  function bladePattern(id, k, seedShift) {
    const dark = "M1 6.6l.5-3M4.3 6.9l-.3-3.3M7 6.3l.6-2.8M2.4 3.2l-.4-2.6M8.2 2.9l.3-2.4M5.6 2.4l-.5-2.2";
    const lite = "M1.9 6.2l.4-2.4M6 6.5l.2-2.2M3.6 2.6l.3-2.2M.4 2.4l.2-1.8";
    return (
      `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${seedShift}" y="${seedShift * 0.6}" width="${f(9 * k)}" height="${f(7 * k)}">` +
      `<g transform="scale(${k})" stroke-linecap="round" fill="none"><path d="${dark}" stroke="#0A1C33" stroke-width=".6"/><path d="${lite}" stroke="#FFFFFF" stroke-width=".5"/></g></pattern>`
    );
  }

  /** The lit ground for a tier, drawn inside the lit mask. */
  function ground(u, T, box, F, band) {
    const { x, y, w, h } = box;
    const R = `x="${x}" y="${y}" width="${w}" height="${h}"`;
    let d = "", g = "";
    g += `<rect ${R} fill="${T.base}"/>`;
    if (T.ground === "grass" || T.ground === "wet" || T.ground === "pristine") {
      d += `<pattern id="${u}-mowV" patternUnits="userSpaceOnUse" x="${F[0] - band / 2}" y="0" width="${band * 2}" height="40"><rect width="${band}" height="40" fill="${T.stripe}"/></pattern>`;
      d += `<filter id="${u}-mowsoft" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="1"/></filter>`;
      g += `<rect ${R} fill="url(#${u}-mowV)" filter="url(#${u}-mowsoft)"/>`;
      if (T.ground === "pristine") {
        // stadium checkerboard: a second cut across the first
        d += `<pattern id="${u}-mowH" patternUnits="userSpaceOnUse" x="0" y="${F[1] - band / 2}" width="40" height="${band * 2}"><rect width="40" height="${band}" fill="${T.stripe}"/></pattern>`;
        g += `<rect ${R} fill="url(#${u}-mowH)" opacity=".7" filter="url(#${u}-mowsoft)"/>`;
      }
      d += grainFilter(`${u}-mottle`, "0.018 0.045", 3, 13, [0.05, 0.12, 0.22], [2.4, -1.12], [-2.4, 1.05]);
      g += `<rect ${R} filter="url(#${u}-mottle)" opacity="${T.ground === "pristine" ? 0.1 : T.ground === "wet" ? 0.24 : 0.2}"/>`;
      d += bladePattern(`${u}-bladeA`, 1, 0) + bladePattern(`${u}-bladeB`, 1.45, 3.3);
      const bo = T.ground === "pristine" ? 0.08 : T.ground === "wet" ? 0.1 : 0.12;
      g += `<rect ${R} fill="url(#${u}-bladeA)" opacity="${bo}"/><rect ${R} fill="url(#${u}-bladeB)" opacity="${f(bo * 0.7)}"/>`;
    }
    if (T.ground === "wet") {
      // wet grass: sparse pin glints on the blades, and the four heads reflected as streaks
      d += `<filter id="${u}-wet" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.85 0.3" numOctaves="1" seed="4" result="n"/><feSpecularLighting in="n" surfaceScale="3" specularConstant="1.2" specularExponent="60" lighting-color="#ffffff" result="s"><fePointLight x="${F[0]}" y="${y - 160}" z="160"/></feSpecularLighting><feColorMatrix in="s" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 1.4 1.4 0 -3.9"/></filter>`;
      g += `<rect ${R} filter="url(#${u}-wet)" opacity=".75"/>`;
      d += `<radialGradient id="${u}-refl"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        const a = Math.atan2(F[1] - cy, F[0] - cx);
        const ex = cx + Math.cos(a) * 92, ey = cy + Math.sin(a) * 92;
        g += `<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="90" ry="4" fill="url(#${u}-refl)" transform="rotate(${f((a * 180) / Math.PI)} ${f(ex)} ${f(ey)})"/>`;
      }
    }
    if (T.ground === "concrete") {
      d += grainFilter(`${u}-grain`, "0.7", 3, 3, [0.18, 0.14, 0.1], [2.6, -1.2], [-2.6, 1.12]);
      d += grainFilter(`${u}-stain`, "0.014 0.02", 3, 9, [0.28, 0.22, 0.16], [2.2, -1.0], [-2, 0.9]);
      g += `<rect ${R} filter="url(#${u}-stain)" opacity=".6"/>`;
      g += `<rect ${R} filter="url(#${u}-grain)" opacity=".45"/>`;
      // slab joints, saw-cut into the lot
      const j = `stroke="#6F6254" stroke-width="1.3" opacity=".75"`;
      const jl = `stroke="#F1E3CC" stroke-width=".6" opacity=".5"`;
      for (const jx of [x + w * 0.34, x + w * 0.67]) g += `<path d="M${f(jx)} ${y}V${y + h}" ${j}/><path d="M${f(jx + 1)} ${y}V${y + h}" ${jl}/>`;
      for (const jy of [y + h * 0.4, y + h * 0.78]) g += `<path d="M${x} ${f(jy)}H${x + w}" ${j}/><path d="M${x} ${f(jy + 1)}H${x + w}" ${jl}/>`;
      g += `<path d="M${x + w * 0.08} ${y + h * 0.58}l14 -3 9 6 12 -2 7 5" fill="none" stroke="#5C5045" stroke-width=".7" opacity=".6"/>`;
      // sodium pools under each street lamp
      d += `<radialGradient id="${u}-sodpool"><stop offset="0" stop-color="${C.sodium}" stop-opacity=".5"/><stop offset=".6" stop-color="${C.sodium}" stop-opacity=".12"/><stop offset="1" stop-color="${C.sodium}" stop-opacity="0"/></radialGradient>`;
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) g += `<circle cx="${cx}" cy="${cy}" r="${f(w * 0.48)}" fill="url(#${u}-sodpool)"/>`;
    }
    if (T.ground === "synthetic") {
      // terrain de proximite: fibre grain plus sparse black rubber crumb
      d += grainFilter(`${u}-grain`, "1.2 0.36", 2, 5, [0.05, 0.1, 0.18], [2.4, -1.1], [-2.4, 1.02]);
      d += `<filter id="${u}-crumb" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".42" numOctaves="1" seed="21" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .071  0 0 0 0 .078  0 0 0 0 .09  14 0 0 0 -11.2"/></filter>`;
      g += `<rect ${R} filter="url(#${u}-grain)" opacity=".25"/>`;
      g += `<rect ${R} filter="url(#${u}-crumb)" opacity=".6"/>`;
      g += `<path d="M${x} ${f(F[1] + 0.5)}H${x + w}" stroke="#F4F7FA" stroke-width="2.2" opacity=".7" filter="url(#${u}-paint)"/>`;
    }
    g += `<rect ${R} fill="url(#${u}-pool)"/>`;
    return { defs: d, g };
  }

  /* ---------- lamp heads on their masts ---------- */
  const HEAD = {
    strip: { w: 27, h: 12, rows: 1, cols: 4, inset: 1 },
    led: { w: 31, h: 14, rows: 2, cols: 3, inset: 1.5 },
    flood: { w: 33, h: 15, rows: 2, cols: 4, inset: 2, yoke: true },
    tower: { w: 36, h: 17, rows: 2, cols: 5, inset: 3.5, yoke: true },
    first: { w: 27, h: 12, rows: 1, cols: 3, inset: 0 },
  };
  /**
   * A lamp in its own frame: +y points into the scene, the mast runs out along -y to its foot.
   * kind: sodium | strip | led | flood | tower | first. out = foot distance from the head centre.
   */
  function lampHead(u, kind, cx, cy, rot, sc, out) {
    let s = `<g class="c10-lamp" transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)}) scale(${sc})">`;
    const edge = `class="c10-case" stroke-width=".9"`;
    if (kind === "sodium") {
      // a cobra-head street lamp: long housing along a curved arm, amber lens underneath
      s += `<path d="M0 -11C0 -${f(out * 0.55)} 4.5 -${f(out * 0.7)} 2.2 -${f(out)}" fill="none" stroke="#18202B" stroke-width="3.6" stroke-linecap="round"/>`;
      s += `<path d="M0 -11C0 -${f(out * 0.55)} 4.5 -${f(out * 0.7)} 2.2 -${f(out)}" fill="none" class="c10-case" stroke-width=".8" stroke-linecap="round" opacity=".9"/>`;
      s += `<circle cx="2.2" cy="${f(-out)}" r="3.4" fill="url(#${u}-graph)" ${edge}/>`;
      s += `<path d="M0 13C4.6 13 4.9 5 4.6 -1C4.3 -7 2.8 -11 1.4 -13H-1.4C-2.8 -11 -4.3 -7 -4.6 -1C-4.9 5 -4.6 13 0 13Z" fill="url(#${u}-graphH)" ${edge}/>`;
      s += `<ellipse class="c10-lens" cx="0" cy="4.2" rx="3.1" ry="7.4" fill="url(#${u}-sod)"/>`;
      s += `<ellipse class="c10-lens" cx="0" cy="5.4" rx="1.2" ry="3" fill="#FFF8EA"/>`;
      return s + "</g>";
    }
    const { w, h, rows, cols, yoke } = HEAD[kind];
    if (kind !== "first") {
      // the mast to its foot outside the panel: the outline's pylon
      const mw = kind === "tower" ? 6 : 5;
      s += `<rect x="${-mw / 2}" y="${f(-out)}" width="${mw}" height="${f(out - h / 2 + 1)}" rx="1.2" fill="url(#${u}-graphH)" ${edge}/>`;
      const fw = kind === "tower" ? 10 : 7.5;
      s += `<rect x="${-fw / 2}" y="${f(-out - fw / 2)}" width="${fw}" height="${fw}" rx="1.6" fill="url(#${u}-graph)" ${edge}/>`;
      if (kind === "tower") s += `<path d="M${-fw / 2 + 1.5} ${f(-out - fw / 2 + 1.5)}l${fw - 3} ${fw - 3}M${fw / 2 - 1.5} ${f(-out - fw / 2 + 1.5)}l${-(fw - 3)} ${fw - 3}" stroke="#B8C1CB" stroke-width=".6" opacity=".8"/>`;
    }
    if (yoke) s += `<path d="M${f(-w / 2 - 2.4)} 3V${f(-h / 2 - 1.6)}H${f(w / 2 + 2.4)}V3" fill="none" stroke="#3A4452" stroke-width="2.3"/><path d="M${f(-w / 2 - 2.4)} 3V${f(-h / 2 - 1.6)}H${f(w / 2 + 2.4)}V3" fill="none" stroke="#B8C1CB" stroke-width=".6"/>`;
    s += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${kind === "first" ? h / 2 : 2.4}" fill="url(#${u}-graph)" ${edge}/>`;
    const lx = -w / 2 + 2, ly = -h / 2 + 2.6, lw = w - 4, lh = h - 4.4;
    s += `<rect x="${f(lx)}" y="${f(ly)}" width="${f(lw)}" height="${f(lh)}" rx="${kind === "first" ? f(lh / 2) : 1.2}" fill="#0E1622"/>`;
    const cw = lw / cols, ch = lh / rows, gap = 0.75;
    const cell = kind === "first" ? C.first : `url(#${u}-lens)`;
    s += `<rect class="c10-lens" x="${f(lx - 2)}" y="${f(ly - 1)}" width="${f(lw + 4)}" height="${f(lh + 4)}" rx="3" fill="url(#${u}-halo)" opacity=".9"/>`;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++)
        s += `<rect class="c10-lens" x="${f(lx + cw * j + gap / 2)}" y="${f(ly + ch * i + gap / 2)}" width="${f(cw - gap)}" height="${f(ch - gap)}" rx="${f(Math.min(cw, ch) * 0.28)}" fill="${cell}"/>`;
    return s + "</g>";
  }

  /** Lamp kinds per corner for a tier. */
  function lampKind(T, corner) {
    if (T.lamp === "mixed") return corner === "BR" || corner === "TL" ? "strip" : "sodium";
    return T.lamp;
  }

  /** Four towers (and the founder's first light): heads aimed at the feet, masts out past the corners. */
  function lampsFor(u, T, corners, F, sc, founderAt, opts = {}) {
    let blooms = "", heads = "", cones = "";
    for (const c of ["TL", "TR", "BL", "BR"]) {
      const kind = lampKind(T, c);
      const [x0, y0] = corners[c];
      const a = Math.atan2(F[1] - y0, F[0] - x0);
      const inset = kind === "sodium" ? 11 : HEAD[kind].inset;
      const cx = x0 + Math.cos(a) * inset * sc, cy = y0 + Math.sin(a) * inset * sc;
      const rot = (a * 180) / Math.PI - 90;
      const out = (kind === "sodium" ? 11 + T.mast * 0.9 : inset + T.mast) * (opts.mastScale || 1);
      const bx = cx + Math.cos(a) * 6 * sc, by = cy + Math.sin(a) * 6 * sc;
      const bloomId = kind === "sodium" ? `${u}-bloomS` : `${u}-bloom`;
      blooms += `<circle class="c10-bloom c10-k${STEP_LAMP[c]}" cx="${f(bx)}" cy="${f(by)}" r="${f((kind === "tower" ? 58 : kind === "sodium" ? 44 : 40) * sc * (opts.bloomScale || 1))}" fill="url(#${bloomId})"/>`;
      heads += `<g class="c10-lit c10-k${STEP_LAMP[c]}">${lampHead(u, kind, cx, cy, rot, sc, out)}</g>`;
      if (T.glare) {
        // LEGEND: four hazy beams cross into the pool, and camera glare on each head
        const px = -Math.sin(a), py = Math.cos(a), hw = 30 * sc;
        cones += `<linearGradient id="${u}-cone${c}" gradientUnits="userSpaceOnUse" x1="${f(bx)}" y1="${f(by)}" x2="${F[0]}" y2="${F[1]}"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/></linearGradient>`;
        cones += `<path class="c10-bloom c10-k${STEP_LAMP[c]}" d="M${f(bx - px * 5)} ${f(by - py * 5)}L${f(F[0] - px * hw)} ${f(F[1] - py * hw)}L${f(F[0] + px * hw)} ${f(F[1] + py * hw)}L${f(bx + px * 5)} ${f(by + py * 5)}Z" fill="url(#${u}-cone${c})"/>`;
        const L = 58 * sc, D = 30 * sc;
        heads += `<g class="c10-glare c10-k${STEP_LAMP[c]}" style="mix-blend-mode:screen"><circle cx="${f(bx)}" cy="${f(by)}" r="${f(16 * sc)}" fill="url(#${u}-spike)" opacity=".8"/><ellipse cx="${f(bx)}" cy="${f(by)}" rx="${f(L)}" ry="${f(1.3 * sc)}" fill="url(#${u}-spike)"/><ellipse cx="${f(bx)}" cy="${f(by)}" rx="${f(1.3 * sc)}" ry="${f(L)}" fill="url(#${u}-spike)"/><ellipse cx="${f(bx)}" cy="${f(by)}" rx="${f(D)}" ry="${f(0.8 * sc)}" fill="url(#${u}-spike)" transform="rotate(45 ${f(bx)} ${f(by)})"/><ellipse cx="${f(bx)}" cy="${f(by)}" rx="${f(D)}" ry="${f(0.8 * sc)}" fill="url(#${u}-spike)" transform="rotate(-45 ${f(bx)} ${f(by)})"/><circle cx="${f(bx)}" cy="${f(by)}" r="${f(3.6 * sc)}" fill="#fff"/></g>`;
      }
    }
    if (founderAt) {
      const [fx, fy] = founderAt;
      blooms += `<circle class="c10-bloom c10-k5" cx="${fx}" cy="${f(fy - 4 * sc)}" r="${f(36 * sc)}" fill="url(#${u}-bloomF)"/>`;
      heads += `<g class="c10-lit c10-k5">${lampHead(u, "first", fx, fy + 3 * sc, 180, sc, 0)}</g>`;
    }
    return { blooms, heads, cones };
  }

  /* ---------- the figure ---------- */
  // Seen from the high camera: one solid silhouette (head, neck, shoulders), squashed to 75%
  // around the feet, its hem rounded off so the body runs straight into its own shadows.
  function figure(u, T, F, wFig) {
    const hFig = wFig * 1.2;
    const box = { x: F[0] - wFig / 2, y: F[1] + wFig * 0.16 - hFig, w: wFig, h: hFig };
    const cy = F[1] - wFig * 0.094;
    const solid = { torso: C.figure, seam: false, collar: C.figure, neck: C.figure, skin: C.figure, hair: C.figure };
    let s = `<clipPath id="${u}-fc"><rect x="${f(F[0] - wFig)}" y="${f(F[1] - wFig * 2)}" width="${f(wFig * 2)}" height="${f(cy - (F[1] - wFig * 2))}"/><ellipse cx="${F[0]}" cy="${f(cy)}" rx="${f(wFig * 0.42)}" ry="${f(wFig * 0.16)}"/></clipPath>`;
    s += `<g clip-path="url(#${u}-fc)"><g transform="translate(${F[0]} ${F[1]}) scale(1 .75) translate(${-F[0]} ${-F[1]})">`;
    if (T.glare) s += `<g opacity=".45" filter="url(#${u}-contact)">${MC.avatar({ ...box, torso: "#fff", seam: false, collar: "#fff", neck: "#fff", skin: "#fff", hair: "#fff", stroke: "#fff", strokeWidth: 18 })}</g>`;
    if (T.rim) s += `<g opacity="${T.rimOp}">${MC.avatar({ ...box, torso: T.rim, seam: false, collar: T.rim, neck: T.rim, skin: T.rim, hair: T.rim, stroke: T.rim, strokeWidth: T.rimW })}</g>`;
    s += MC.avatar({ ...box, ...solid });
    return s + "</g></g>";
  }

  /* ---------- the four shadows ---------- */
  function shadows(u, T, F, G, opts = {}) {
    const s = opts.scale || 1;
    let d = "", g = "";
    STATS.forEach((k, i) => {
      const b = T.blur[k] * (opts.blurScale || 1);
      if (b > 0) d += `<filter id="${u}-b${i}" filterUnits="userSpaceOnUse" x="-30" y="-40" width="${f(G[k].L + 60)}" height="80"><feGaussianBlur stdDeviation="${b}"/></filter>`;
    });
    g += `<g class="c10-shadows" style="mix-blend-mode:multiply">`;
    STATS.forEach((k, i) => {
      const sh = shadowShape(G[k].L, s);
      const b = T.blur[k];
      g +=
        `<g data-c10-sh="${k}" class="c10-tilt">` +
        `<g class="c10-cast c10-k${STEP[k]}">` +
        `<g transform="translate(${F[0]} ${F[1]}) rotate(${f(G[k].ang)})" fill="${T.fill[k]}" opacity="${T.op}"${b > 0 ? ` filter="url(#${u}-b${i})"` : ""}>` +
        `<path d="${sh}" fill-rule="evenodd"/>` +
        (T.sheen ? "" : "") +
        `</g></g></g>`;
    });
    g += `</g>`;
    if (T.sheen) {
      // wet edge: a reflected line inside one edge of each shadow
      STATS.forEach((k, i) => {
        const sh = shadowShape(G[k].L, s);
        d += `<clipPath id="${u}-sc${i}"><path d="${sh}" clip-rule="evenodd"/></clipPath>`;
        g += `<g data-c10-sh="${k}" class="c10-tilt"><g class="c10-cast c10-k${STEP[k]}"><g transform="translate(${F[0]} ${F[1]}) rotate(${f(G[k].ang)})"><g clip-path="url(#${u}-sc${i})"><path d="${sh}" transform="translate(0 ${f(-1.5 * s)})" fill="none" stroke="#DCEBF5" stroke-width="${f(1 * s)}" opacity=".75"/></g></g></g></g>`;
      });
    }
    return { defs: d, g };
  }

  /**
   * The founder's fifth shadow: the same person, same ink, cast straight up by the first light.
   * Razor-sharp at every tier, always the same length. FOUNDER 2026 is knocked out of it, so the
   * lit turf shows through the letters.
   */
  function founderShadow(u, T, F, tipY, s, label, fs, o, area) {
    const L = F[1] - tipY;
    const sh = shadowShape(L, s);
    let defs = "", mask = "";
    if (label) {
      const ar = MC.isAr(o);
      const B = L - 15 * s;
      const y0 = F[1] - 0.48 * B - 2 * s, y1 = tipY + 3 * s;
      const cy = (y0 + y1) / 2;
      const base = ar ? fs * 0.3 : fs * 0.36;
      const txt = ar
        ? `<text x="0" y="0" transform="translate(${f(F[0] + base)} ${f(cy)}) rotate(-90)" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="700" font-size="${fs}" fill="#000">${esc(label.word)} <tspan direction="ltr" unicode-bidi="embed" font-family="Manrope, sans-serif" font-weight="800">${label.year}</tspan></text>`
        : `<text x="0" y="0" transform="translate(${f(F[0] + base)} ${f(cy)}) rotate(-90)" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${fs}" letter-spacing="${f(fs * 0.04)}" fill="#000">${esc(label.word)} ${label.year}</text>`;
      defs = `<mask id="${u}-ko" maskUnits="userSpaceOnUse" x="${area[0]}" y="${area[1]}" width="${area[2]}" height="${area[3]}"><rect x="${area[0]}" y="${area[1]}" width="${area[2]}" height="${area[3]}" fill="#fff"/>${txt}</mask>`;
      mask = ` mask="url(#${u}-ko)"`;
    }
    const g =
      `<g class="c10-first c10-k5" style="mix-blend-mode:multiply"${mask}>` +
      `<path d="${sh}" fill-rule="evenodd" fill="${T.fill.CAP}" opacity="${f(Math.max(T.op, 0.86))}" transform="translate(${F[0]} ${F[1]}) rotate(-90)"/></g>`;
    return { defs, g };
  }

  /* ---------- the stat beyond each shadow's head ---------- */
  /**
   * Places "CAP 91" a fixed gap past the head along the shadow's own direction, so a longer
   * shadow pushes its number further out. The text box touches that point with its nearest corner.
   */
  function statText(k, v, G, F, gap, o, sz, clampX, ink2) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const g = G[k];
    const px = F[0] + g.ux * (g.L + gap), py = F[1] + g.uy * (g.L + gap);
    const labSz = ar ? sz.lab * 1.15 : sz.lab;
    const W = labSz * LAB_EM[ar ? "ar" : "lat"][k] + sz.val * 0.22 + sz.val * VAL_EM + (ar ? 0 : labSz * 0.24);
    const cap = sz.val * 0.72;
    const left = g.ux < 0;
    let xl = left ? px - W : px; // left edge of the box
    xl = Math.max(clampX[0], Math.min(clampX[1] - W, xl));
    const base = g.uy < 0 ? py : py + cap;
    const x = ar ? xl + W : xl; // start edge in reading order
    const labFill = ink2 ? ink2.lab : C.muted, valFill = ink2 ? ink2.val : C.tunnel;
    const lab = ar
      ? `<tspan font-family="Noto Sans Arabic, sans-serif" font-weight="700" font-size="${f(labSz)}" fill="${labFill}">${esc(S.stats[k])}</tspan>`
      : `<tspan font-family="Manrope, sans-serif" font-weight="800" font-size="${labSz}" fill="${labFill}" letter-spacing="${f(labSz * 0.08)}">${esc(S.stats[k])}</tspan>`;
    const val = `<tspan dx="${f(sz.val * (ar ? -0.22 : 0.22))}" direction="ltr" unicode-bidi="embed" font-family="Manrope, sans-serif" font-weight="800" font-size="${sz.val}" fill="${valFill}" style="font-variant-numeric:tabular-nums">${v}</tspan>`;
    return `<text class="c10-val c10-k${STEP[k]}" x="${f(x)}" y="${f(base)}" text-anchor="start" direction="${ar ? "rtl" : "ltr"}">${lab}${val}</text>`;
  }

  /** The 84: painted on the turf, or at LEGEND standing up and casting its own four shadows. */
  function ovrMark(u, T, p, x, y, size, G) {
    const t = `font-family="Changa, sans-serif" font-weight="800" font-size="${size}" direction="ltr" text-anchor="start"`;
    if (!T.glare) return `<text class="c10-ovr" x="${f(x)}" y="${y}" ${t} fill="${C.tunnel}" filter="url(#${u}-paint)">${p.ovr}</text>`;
    let s = `<g style="mix-blend-mode:multiply" opacity=".5">`;
    for (const k of STATS) s += `<text x="${f(x + G[k].ux * 3)}" y="${f(y + G[k].uy * 3)}" ${t} fill="#061736">${p.ovr}</text>`;
    s += `</g>`;
    s += `<text class="c10-ovr" x="${f(x)}" y="${y}" ${t} fill="#F4FBFF" stroke="${C.tunnel}" stroke-width="2" stroke-linejoin="round" paint-order="stroke">${p.ovr}</text>`;
    return s;
  }

  /* ================= full card ================= */
  const BOX = { x: 16, y: 16, w: 288, h: 368, lit: [19, 19, 282, 347], soft: 5, poolR: 230, hubR: 115 };
  const CORNERS = { TL: [16, 16], TR: [304, 16], BL: [16, 384], BR: [304, 384] };
  const F_CARD = [160, 214];

  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const T = tierOf(p);
    const u = MC.uid("c10");
    const F = F_CARD;
    const G = rig(F, CORNERS, REACH, p);
    const thumb = !!o.thumb;
    const gr = ground(u, T, BOX, F, 24);
    const sh = shadows(u, T, F, G);
    const lamps = lampsFor(u, T, CORNERS, F, 1, p.founder ? [160, 384] : null);

    // the 84, ink-centred in its slot (x114-206)
    const ovrSize = thumb ? 90 : 76;
    const m = ink(p.ovr);
    const ovrX = 160 + m.dx * ovrSize;
    const ovrY = thumb ? 352 : 340;

    let txt = "";
    if (!thumb) {
      const name = esc(MC.nameOf(p, o));
      const tierWord = esc(S.tiers[p.tier]);
      txt +=
        `<text class="c10-name" x="160" y="${ar ? 68 : 66}" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" filter="url(#${u}-paint)">` +
        `<tspan font-family="Changa, sans-serif" font-weight="800" font-size="28" fill="${C.logo}">${name}</tspan>` +
        (ar
          ? `<tspan dx="-7" font-family="Changa, Noto Sans Arabic, sans-serif" font-weight="700" font-size="15" fill="${C.tunnel}">${tierWord}</tspan></text>`
          : `<tspan dx="7" font-family="Changa, sans-serif" font-weight="700" font-size="13.5" fill="${C.tunnel}" letter-spacing="1.2">${tierWord}</tspan></text>`);
      const sz = { lab: 9.2, val: 17 };
      for (const k of STATS) txt += statText(k, p.stats[k], G, F, 14, o, sz, [30, 290]);
    }
    txt += ovrMark(u, T, p, ovrX, ovrY, ovrSize, G);
    if (!thumb) txt += `<text x="160.5" y="356" direction="ltr" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="8.6" letter-spacing="1.6" fill="${C.muted}">${S.ovr}</text>`;

    // founder: fifth shadow, straight up from the feet, letters knocked out
    let first = { defs: "", g: "" };
    if (p.founder) first = founderShadow(u, T, F, 100, 1.15, thumb ? null : { word: S.founder, year: p.founder }, ar ? 6.7 : 6.9, o, [0, 0, 320, 400]);

    // meta strip in the night margin (swapped for a shadow's meaning when one is tapped)
    let meta = "";
    if (!thumb) {
      const x0 = T.glare ? 58 : 30, x1 = T.glare ? 262 : 290;
      const mf = `font-family="Manrope, sans-serif" font-weight="700" font-size="8.4" fill="${C.meta}"`;
      const crest = (cx) => `<svg x="${cx}" y="367" width="9" height="11" viewBox="0 0 40 48" aria-hidden="true">${MC.crest({ mono: C.meta }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
      meta += `<g class="c10-meta">`;
      if (!ar) {
        meta += crest(x0) + `<text x="${x0 + 13}" y="376.5" ${mf} letter-spacing=".5" style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>`;
        meta += `<text x="${x1}" y="376.5" text-anchor="end" ${mf} letter-spacing=".5">${esc(S.country)}<tspan dx="6" style="font-variant-numeric:tabular-nums">${esc(p.season)}</tspan></text>`;
      } else {
        meta += crest(x1 - 9) + `<text x="${x1 - 13}" y="376.5" text-anchor="end" direction="ltr" ${mf} style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>`;
        meta += `<text x="${x0}" y="377" text-anchor="end" direction="rtl" font-family="Noto Sans Arabic, sans-serif" font-weight="700" font-size="9" fill="${C.meta}">${esc(S.country)}  <tspan direction="ltr" unicode-bidi="embed" font-family="Manrope, sans-serif" font-size="8.4">${esc(p.season)}</tspan></text>`;
      }
      meta += `</g>`;
      meta += `<text class="c10-meaning" x="160" y="${ar ? 377.5 : 376.5}" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" font-family="${ar ? "Noto Sans Arabic, sans-serif" : "Manrope, sans-serif"}" font-weight="700" font-size="${ar ? 9.6 : 9}" fill="#E6EEF5"></text>`;
    }

    // LEGEND: the corners fall to deep night where the towers stand
    const darkCorners = T.glare ? Object.values(CORNERS).map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="56" fill="url(#${u}-dark)"/>`).join("") : "";

    const svg =
      `<svg class="c10-scene" viewBox="0 0 320 400" aria-hidden="true" focusable="false">` +
      `<defs>${defs(u, T, BOX, F)}${gr.defs}${sh.defs}${first.defs}${lamps.cones}</defs>` +
      `<g clip-path="url(#${u}-clip)">` +
      `<rect x="16" y="16" width="288" height="368" fill="${T.night}"/>` +
      `<g class="c10-turf" mask="url(#${u}-lit)">${gr.g}` +
      (T.hubGlow ? `<circle cx="${F[0]}" cy="${F[1]}" r="${BOX.hubR}" fill="url(#${u}-hub)" opacity="${T.hubGlow}"/>` : "") +
      darkCorners +
      `</g>` +
      (T.glare ? `<g class="c10-beams" style="mix-blend-mode:screen" filter="url(#${u}-haze)">${lamps.cones.replace(/<linearGradient[\s\S]*?<\/linearGradient>/g, "")}</g>` : "") +
      `<g class="c10-paint">${txt}</g>` +
      sh.g +
      first.g +
      `<ellipse cx="${F[0]}" cy="${F[1]}" rx="20" ry="6" fill="#06142B" opacity=".55" filter="url(#${u}-contact)"/>` +
      figure(u, T, F, 64) +
      `<g style="mix-blend-mode:screen">${lamps.blooms}</g>` +
      `</g>` +
      `<rect class="c10-rim" x="16.5" y="16.5" width="287" height="367" rx="3" fill="none" vector-effect="non-scaling-stroke"/>` +
      lamps.heads +
      meta +
      `</svg>`;
    return (
      `<div class="c10 c10--card t-${p.tier}${o.motion ? " c10-relight" : ""}${thumb ? " is-thumb" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}">` +
      svg +
      `</div>`
    );
  }

  /* ================= token ================= */
  // A night tile with its lit pool, the 84 where the manager stands, the shadows running out
  // toward four lamp ears. Tier is told by discrete marks (the ears, the ring, the inversion),
  // never by blur. It simplifies by size: figures (56+), wedges (44-55), the 84 alone (32),
  // and at 24 the lit disc, the manager as a navy dot and the founder's fifth ear.
  function token(p, o = {}) {
    const T = tierOf(p);
    const size = o.size || 44;
    const glyph = size <= 26;
    const numOnly = !glyph && size <= 34;
    const figs = size >= 56;
    const legend = p.tier === "LEGEND";
    const u = MC.uid("c10t");
    const px = 100 / size; // user units per css px
    const P0 = 12, P1 = 88, W = P1 - P0;
    let d = "", g = "";
    const R0 = glyph ? 26 : 29, R1 = glyph ? 31 : 41;
    d += `<linearGradient id="${u}-st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#AEB7C1"/><stop offset=".22" stop-color="#5D6876"/><stop offset=".65" stop-color="#2C3644"/><stop offset="1" stop-color="#18202B"/></linearGradient>`;
    if (legend) {
      // LEGEND inverts: the whole tile is white-hot to the corners
      d += `<radialGradient id="${u}-hot" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="54"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#F3F8FB"/><stop offset="1" stop-color="#D6E3EC"/></radialGradient>`;
      g += `<rect x="${P0}" y="${P0}" width="${W}" height="${W}" rx="3" fill="url(#${u}-hot)"/>`;
      if (!glyph) {
        const bw = W / 6;
        for (let i = 1; i < 6; i += 2) g += `<rect x="${f(P0 + bw * i)}" y="${P0}" width="${f(bw)}" height="${W}" fill="#E4EDF3" opacity=".7"/>`;
      }
    } else {
      d += `<radialGradient id="${u}-pool" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="${R1}"><stop offset="0" stop-color="#fff"/><stop offset="${f(R0 / R1)}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
      d += `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="${P0}" y="${P0}" width="${W}" height="${W}" fill="url(#${u}-pool)"/></mask>`;
      g += `<rect x="${P0}" y="${P0}" width="${W}" height="${W}" rx="3" fill="${C.night}"/>`;
      let turf = `<rect x="${P0}" y="${P0}" width="${W}" height="${W}" fill="${T.tok.base}"/>`;
      if (!glyph && (T.ground === "grass" || T.ground === "wet")) {
        const bw = W / 6;
        for (let i = 1; i < 6; i += 2) turf += `<rect x="${f(P0 + bw * i)}" y="${P0}" width="${f(bw)}" height="${W}" fill="${T.stripe}"/>`;
      }
      if (T.ground === "concrete") turf += `<rect x="${P0}" y="${P0}" width="${W}" height="${W}" fill="${C.sodium}" opacity=".16"/>` + (glyph ? "" : `<path d="M38 12V88M63 12V88M12 41H88" stroke="#7A6B5B" stroke-width="${f(Math.max(0.8, 0.45 * px))}" opacity=".5"/>`);
      if (T.ground === "synthetic" && !glyph) turf += `<path d="M12 50H88" stroke="#F4F7FA" stroke-width="${f(Math.max(1.4, 0.6 * px))}" opacity=".55"/>`;
      g += `<g mask="url(#${u}-m)">${turf}</g>`;
    }

    // the shadows: same mapping as the card, measured from the hub
    const fs = numOnly ? 46 : figs ? 30 : 33;
    const m = ink(p.ovr);
    const Rt = 40;
    const dirs = { CAP: -135, TRF: -45, SEL: 135, CON: 45 };
    const inkC = legend ? "#061736" : null;
    if (!glyph && !numOnly) {
      const r0 = 0.32 * fs * Math.SQRT2 + 2.5;
      let sh = `<g style="mix-blend-mode:multiply">`;
      for (const k of STATS) {
        const L = Rt * mapStat(p.stats[k]);
        const shape = figs ? shadowShape(L, 0.4) : `M${f(r0)} -3L${f(L)} -.75L${f(L)} .75L${f(r0)} 3Z`;
        sh += `<path d="${shape}" fill-rule="evenodd" transform="translate(50 50) rotate(${dirs[k]})" fill="${inkC || T.fill[k]}" opacity="${f(legend ? 0.92 : Math.min(1, T.op + 0.14))}"/>`;
      }
      if (p.founder) {
        // the fifth: fixed length, straight up
        const L = 30, r0u = 0.32 * fs + 2.5;
        const shape = figs ? shadowShape(L, 0.4) : `M${f(r0u)} -2.6L${L} -.75L${L} .75L${f(r0u)} 2.6Z`;
        sh += `<path d="${shape}" fill-rule="evenodd" transform="translate(50 50) rotate(-90)" fill="${inkC || T.fill.CAP}" opacity=".95"/>`;
      }
      sh += `</g>`;
      g += legend ? sh : `<g mask="url(#${u}-m)">${sh}</g>`;
    }
    // CHAMPION: a wet ring at the pool's edge
    if (p.tier === "CHAMPION") g += `<circle cx="50" cy="50" r="${glyph ? 31 : 36}" fill="none" stroke="#FFFFFF" stroke-width="${f(px)}" opacity=".85"/>`;
    if (glyph) g += `<circle cx="50" cy="50" r="9" fill="${C.figure}"/>`;
    else g += `<text x="${f(50 + m.dx * fs)}" y="${f(50 + 0.32 * fs)}" text-anchor="start" direction="ltr" font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" fill="${C.tunnel}">${p.ovr}</text>`;

    // outline: rim on dark, a navy edge for the white-hot LEGEND tile
    g += `<rect class="c10-rim" x="${P0 + 0.5}" y="${P0 + 0.5}" width="${W - 1}" height="${W - 1}" rx="3" fill="none" vector-effect="non-scaling-stroke"/>`;
    if (legend) g += `<rect x="${P0 + 0.5}" y="${P0 + 0.5}" width="${W - 1}" height="${W - 1}" rx="3" fill="none" stroke="${C.night}" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".85"/>`;

    // the ears: discrete tier marks
    const kinds = {
      HOMA: ["sod", "sod", "sod", "sod"],
      STADE: ["led", "sod", "sod", "led"],
      PRO: ["led", "led", "led", "led"],
      CHAMPION: ["led", "led", "led", "led"],
      LEGEND: ["tower", "tower", "tower", "tower"],
    }[p.tier] || ["led", "led", "led", "led"];
    const sw = f(Math.max(0.8, 0.5 * px));
    [[P0, P0, -45, -1, -1], [P1, P0, 45, 1, -1], [P0, P1, 45, -1, 1], [P1, P1, -45, 1, 1]].forEach(([x0, y0, rot, sx, sy], i) => {
      const kind = kinds[i];
      const dOut = kind === "tower" ? 2.5 : kind === "sod" ? 2 : 1.5;
      const cx = x0 + (sx * dOut) / Math.SQRT2, cy = y0 + (sy * dOut) / Math.SQRT2;
      let e = `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${rot})">`;
      if (kind === "sod") {
        e += `<rect x="-8" y="-3.8" width="16" height="7.6" rx="3.8" fill="url(#${u}-st)" class="c10-case" stroke-width="${sw}"/>`;
        e += `<ellipse cx="0" cy="0" rx="5" ry="2.1" fill="#FFB24E"/>`;
      } else {
        const ew = kind === "tower" ? 23 : 19, eh = kind === "tower" ? 10.5 : 8.5;
        e += `<rect x="${-ew / 2}" y="${-eh / 2}" width="${ew}" height="${eh}" rx="1.6" fill="url(#${u}-st)" class="c10-case" stroke-width="${sw}"/>`;
        e += `<rect x="${f(-ew / 2 + 2)}" y="${f(-eh / 2 + 2.1)}" width="${ew - 4}" height="${f(eh - 4.2)}" rx="1" fill="${C.lens}"/>`;
        if (size >= 56) for (let j = 1; j < 4; j++) e += `<path d="M${f(-ew / 2 + 2 + ((ew - 4) / 4) * j)} ${f(-eh / 2 + 2.1)}v${f(eh - 4.2)}" stroke="#7E93A6" stroke-width=".7"/>`;
        if (kind === "tower") {
          const sl = ew / 2 + 3 * px;
          e += `<g stroke="#FFFFFF" stroke-linecap="round" opacity=".95"><path d="M${f(-sl)} 0H${f(sl)}" stroke-width="${f(0.55 * px)}"/><path d="M0 ${f(-eh / 2 - 3 * px)}V${f(eh / 2 + 3 * px)}" stroke-width="${f(0.55 * px)}"/></g>`;
        }
      }
      g += e + `</g>`;
    });
    if (p.founder) g += `<g transform="translate(50 ${P1 + 1})"><rect x="-8.5" y="-4.2" width="17" height="8.4" rx="4.2" fill="url(#${u}-st)" class="c10-case" stroke-width="${sw}"/><rect x="-5.2" y="-1.4" width="10.4" height="3" rx="1.5" fill="${C.first}"/></g>`;
    return (
      `<span class="c10 c10--tok t-${p.tier}${glyph || numOnly ? " is-mini" : ""}" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" focusable="false"><defs>${d}</defs>${g}</svg></span>`
    );
  }

  /* ================= row ================= */
  // Each row is lit by its own tier: sodium, mixed, cool LED, wet, or two crisp beams.
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const me = !!o.me;
    return (
      `<div class="c10 c10--row t-${p.tier}${me ? " is-me" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc((o.rank ? o.rank + ". " : "") + MC.label(p, o) + (o.pts != null ? ", " + o.pts + " " + S.pts : ""))}">` +
      `<span class="c10r-rank">${MC.ltr(o.rank ?? "")}</span>` +
      `<span class="c10r-tok">${token(p, { ...o, size: 48, mini: false })}</span>` +
      `<span class="c10r-id"><b>${esc(MC.nameOf(p, o))}</b><small>${esc(S.tiers[p.tier])}${p.founder ? `<i>${ar ? esc(S.founder) : "FOUNDER"}</i>` : ""}</small></span>` +
      `<span class="c10r-ovr">${MC.ltr(p.ovr)}</span>` +
      `<span class="c10r-pts">${MC.ltr(o.pts ?? "")}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ================= share (360x640) ================= */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const T = tierOf(p);
    const u = MC.uid("c10s");
    const F = [180, 252];
    const box = { x: 0, y: 0, w: 360, h: 640, lit: [14, 60, 332, 460], soft: 10, poolR: 300, hubR: 140 };
    const towers = { TL: [30, 30], TR: [330, 30], BL: [30, 610], BR: [330, 610] };
    const G = rig(F, towers, 190, p);
    const gr = ground(u, T, box, F, 34);
    const sh = shadows(u, T, F, G, { scale: 1.35, blurScale: 1.3 });
    const lamps = lampsFor(u, T, towers, F, 1.25, [180, 532], { bloomScale: 1.5, mastScale: 0.85 });
    const m = ink(p.ovr);
    const ovrSize = 112;
    let txt = "";
    const sz = { lab: 11.5, val: 27 };
    for (const k of STATS) txt += statText(k, p.stats[k], G, F, 19, o, sz, [24, 336]);
    const ovrY = 500;
    txt += ovrMark(u, T, p, 180 + m.dx * ovrSize, ovrY, ovrSize, G);
    const ux = ar ? 180 - m.half * ovrSize - 8 : 180 + m.half * ovrSize + 8;
    txt += `<text x="${f(ux)}" y="${ovrY}" direction="ltr" text-anchor="${ar ? "end" : "start"}" font-family="Manrope, sans-serif" font-weight="800" font-size="13" letter-spacing="1.2" fill="${C.muted}">${S.ovr}</text>`;
    let first = { defs: "", g: "" };
    if (p.founder) first = founderShadow(u, T, F, 95, 1.55, { word: S.founder, year: p.founder }, ar ? 8.8 : 9.2, o, [0, 0, 360, 640]);
    const darkCorners = T.glare ? Object.values(towers).map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="80" fill="url(#${u}-dark)"/>`).join("") : "";
    const svg =
      `<svg class="c10-share-scene" viewBox="0 0 360 640" aria-hidden="true" focusable="false">` +
      `<defs>${defs(u, T, box, F)}${gr.defs}${sh.defs}${first.defs}${lamps.cones}</defs>` +
      `<g clip-path="url(#${u}-clip)">` +
      `<rect width="360" height="640" fill="${T.night}"/>` +
      `<g mask="url(#${u}-lit)">${gr.g}${T.hubGlow ? `<circle cx="${F[0]}" cy="${F[1]}" r="${box.hubR}" fill="url(#${u}-hub)" opacity="${T.hubGlow}"/>` : ""}${darkCorners}</g>` +
      (T.glare ? `<g style="mix-blend-mode:screen" filter="url(#${u}-haze)">${lamps.cones.replace(/<linearGradient[\s\S]*?<\/linearGradient>/g, "")}</g>` : "") +
      txt +
      sh.g +
      first.g +
      `<ellipse cx="${F[0]}" cy="${F[1]}" rx="28" ry="8" fill="#06142B" opacity=".55" filter="url(#${u}-contact)"/>` +
      figure(u, T, F, 88) +
      `<rect x="0" y="548" width="360" height="92" fill="${T.night}"/>` +
      `<path d="M0 548.5H360" stroke="#FFFFFF" stroke-opacity=".08"/>` +
      `<g style="mix-blend-mode:screen">${lamps.blooms}</g>` +
      lamps.heads +
      `</g></svg>`;
    const sample = ar ? "مثال" : "Exemple";
    return (
      `<div class="c10 c10--share t-${p.tier}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      svg +
      `<div class="c10s-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
      `<div class="c10s-foot">` +
      `<p class="c10s-who"><b>${esc(MC.nameOf(p, o))}</b><span>${esc(S.tiers[p.tier])}</span><bdi dir="ltr">@${esc(p.name.lat.toLowerCase())}</bdi></p>` +
      `<p class="c10s-meta">${MC.ltr(p.id)}<span>${MC.ltr(p.season)}</span><span>${esc(sample)}</span></p>` +
      `</div></div>`
    );
  }

  /* ================= interaction ================= */
  function mount(el, o = {}) {
    if (!el || !el.classList || !el.classList.contains("c10--card") || el.dataset.c10Mounted) return;
    el.dataset.c10Mounted = "1";
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = MC.s(o);
    const tilts = el.querySelectorAll(".c10-tilt");
    const F = F_CARD;
    let target = 0, cur = 0, raf = 0;
    const apply = () => {
      cur += (target - cur) * 0.18;
      tilts.forEach((t) => t.setAttribute("transform", `rotate(${f(cur)} ${F[0]} ${F[1]})`));
      raf = Math.abs(target - cur) > 0.02 ? requestAnimationFrame(apply) : 0;
    };
    const go = (deg) => {
      target = Math.max(-6, Math.min(6, deg));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    if (!reduce) {
      // drag or hover swings the four lights; lengths, numbers and the founder's shadow never move
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        go(((e.clientX - r.left) / r.width - 0.5) * 12);
      });
      el.addEventListener("pointerleave", () => go(0));
    }
    // tap a shadow: it darkens and names its decision in the night strip
    const meaning = el.querySelector(".c10-meaning");
    el.addEventListener("click", (e) => {
      const hit = e.target.closest && e.target.closest("[data-c10-sh]");
      const k = hit && hit.getAttribute("data-c10-sh");
      el.querySelectorAll("[data-c10-sh]").forEach((n) => n.classList.toggle("is-focus", !!k && n.getAttribute("data-c10-sh") === k));
      el.classList.toggle("has-focus", !!k);
      if (meaning) meaning.textContent = k ? `${S.statsLong[k]} · ${el.querySelector(`.c10-val.c10-k${STEP[k]} tspan:last-child`)?.textContent || ""}` : "";
    });
  }

  MC.register({
    id: "c10",
    n: 10,
    slug: "10",
    name: "Quatre Ombres",
    nameAr: "أربعة ظلال",
    category: "wildcard",
    philosophy: "Under four floodlights every player casts four shadows; on BotolaGO your four decisions are the shadows you cast.",
    philosophyAr: "تحت أربعة أضواء كاشفة يُلقي كل لاعب أربعة ظلال، وفي BotolaGO تصبح قراراتك الأربعة هي الظلال التي تُلقيها.",
    idea: [
      "The identity is not an object you hold but a shape you cast. The card is a patch of floodlit turf seen from the broadcast camera high above the stand, with the manager at its centre and four floodlight pylons standing out past its corners. Each of the four stats is one of the manager's own shadows, thrown toward a corner: CAP top-left, TRF top-right, SEL bottom-left, CON bottom-right. All four share one reach, so length is the value and nothing else; the number sits just past each shadow's head, so a longer shadow pushes its number further out.",
      "The shadows are a person, not spokes: the touchline stance, hands on hips, legs apart, so two triangles of lit turf show between each arm and the body. The figure at the hub is the same person seen from above, one solid silhouette with a lit rim, running straight into its shadows.",
      "Everything else is quiet on purpose. The 84 is painted on the turf in Tunnel Navy, like a pitch marking, with the grass breaking the paint; the name is painted in Logo Blue line paint. The outline (a lit panel with four pylons, a fifth light for founders) carries recognition, while the shadows inside carry the record.",
    ],
    belonging: [
      "Your shadows are built from your own decisions and they visibly change when you play better: a good month of captaincy lengthens the CAP shadow, and every surface (card, token, share) uses the same scale, so friends can compare: 'ton ombre CAP est plus longue que la mienne'.",
      "It is a picture of something every Moroccan player has stood in: a night match on a terrain de proximité or a Ramadan tournament after iftar, under four poles of light, four shadows at your feet. The reference is the light, not a decoration.",
      "The fifth shadow becomes the story people ask about ('pourquoi Ali a cinq ombres ?'), and the answer cannot be bought or earned again. A 15-year-old wants the LEGEND night: beams through the haze, razor shadows, the 84 standing up. An adult reads the shape as a record of a season.",
    ],
    founderMark: [
      "A fifth light. Founders get a warm-white lamp at the bottom-centre edge, which changes the outline itself, and it throws a fifth shadow straight up the card from the feet: the same person, the same ink, razor-sharp at every tier and always the same length.",
      "FOUNDER 2026 (عضو مؤسس 2026 in Arabic) is knocked out of that shadow, so the first light shows through the letters as lit turf. It is not printed on the card; it is a gap in your own shadow. When the card is tilted the four tower shadows swing and the founder's alone stays put.",
      "In the token it survives as a fifth shadow pointing straight up and a fifth lamp ear at the bottom edge; at 24px the ear alone carries it.",
    ],
    small: [
      "56-80px: the token is the card reduced to its grammar: a night tile with a round lit pool, the 84 where the manager stands, four small hands-on-hips shadows on the card's own scale, and four lamp ears. 44-55px: the shadows become tapered wedges with no heads (heads read as rotors at that size), still on the same scale, so a long CAP and a short CON stay visibly different.",
      "32px: the 84 alone in the pool, no rays. 24px: the lit disc, the manager as a navy dot and the four ears; the OVR moves into the row text beside it. There is no claim that the shape is unique at these sizes: what survives is the concept (light, pool, pylons) and the tier.",
      "Tier survives small as discrete marks, not blur: HOMA four amber street-lamp ears; STADE two amber and two white; PRO four white; CHAMPION four white plus a thin wet ring at the pool's edge; LEGEND inverted, the whole tile white-hot, bigger ears with glare spikes.",
    ],
    rtl: [
      "The shadows never mirror. CAP is always top-left, so a manager's shape is the same in French and Arabic; a mirrored shadow would be a different person.",
      "Everything that is text follows the language: علي is set in Changa 800 line paint with no tracking, the tier word becomes محترف, the labels become MSA proposals (القائد، التشكيلة، الانتقالات، الثبات) in Noto Sans Arabic 700, each kept inside the panel past its own shadow's head, and the meta strip and the OVR unit swap sides.",
      "Digits stay left-to-right everywhere (the 84, the stat values, 2026, 2026/27, BOT #004821). The founder knock-out reads عضو مؤسس with the year kept LTR. Arabic labels and the term عضو مؤسس need MSA review before they ship.",
    ],
    tiers: {
      HOMA: "A concrete lot at night under four cobra-head street lamps on curved arms: warm aggregate, saw-cut slab joints and a crack, amber pools at the corners. Shadows soft and warm-brown. No rim on the figure. The shortest pylons.",
      STADE: "The synthetic turf of a terrain de proximité: fibre grain, sparse black rubber crumb, one worn white line. Mixed light: two LED strip heads throw two crisp, cool shadows (CAP, CON); two street lamps throw two soft, warm ones (SEL, TRF). A faint warm rim on the figure.",
      PRO: "Real grass with hard mowing stripes and short blade strokes, four LED floodlight heads on masts, four near-crisp shadows and a white rim on the figure from the four lights.",
      CHAMPION: "Wet grass after rain: darker turf, sparse pin glints on the blades, the four flood heads (2x4 lamps in a steel yoke) reflected as long streaks on the ground. Shadows darker and crisp, each with a thin reflected highlight inside one edge. Longer masts.",
      LEGEND: "Stadium night: the corners fall to deep night where the towers stand, four hazy beams cross into a white pool at the feet, the shadows are razor-sharp and near-black, the heads are full towers with glare stars on the longest masts, and the 84 stops being paint: it stands up in white and casts its own four short shadows.",
    },
    legend: [
      "A dark screen with the manager alone. The four towers catch one at a time with the splash screen's hard stepped flicker; as each one lights, its shadow snaps out from the feet and the number appears past its head: CAP, SEL, TRF, then CON. For founders the fifth light catches last and the FOUNDER 2026 shadow falls straight up. Then everything is still. It never loops; under reduced motion the final frame shows.",
      "At LEGEND the light itself is the reward: beams through haze, razor shadows, the white pool, glare on the towers, and the 84 standing up as an object with four shadows of its own. Nothing on the card turns gold.",
    ],
    advantages: [
      "An ownable mark: a picture only BotolaGO makes, rooted in the brand's own north star ('club colours under floodlights') and in the splash screen's floodlight ceremony.",
      "Personal and comparable at the same time: one reach and one scale on every surface, so the shape is an honest record that changes as you play (progression without a progress bar).",
      "Tiers are carried by real, drawable light quality (sodium, mixed, crisp, wet, stadium night) and by the pylons growing, so they are materially different without a colour ladder, and HOMA has its own dignity instead of being the 'grey' tier.",
      "Founder status is in the outline (a fifth light) and in the scene (a fifth shadow with the words cut out of it), not on a sticker.",
    ],
    risks: [
      "Closeness to a radar chart and to the Pépites wheel: it only works while the shadows stay human-shaped and there is no polygon, axis or ring joining the heads. Any 'simplification' toward spokes kills it.",
      "Stats cluster (78-91), so even on one honest scale the four shadows differ by about a quarter of their length at full size; below 56px only the tier and the concept survive, not the personal shape.",
      "At 24px a square with corner nubs can read as a generic app icon; the lit disc and the ears carry a lot of weight there, and it is untested with real users.",
      "Navy, Logo Blue and white overlap the Codex palette; HOMA and STADE carry their own warm light, but PRO through LEGEND live in the same blues.",
      "It is abstract and needs one line of explanation the first time ('your four decisions are your four shadows'). The fifth-light myth only works if the community tells it.",
      "Heavy SVG filters (turbulence, lighting) per card: fine for a profile and a share image, needs a flattened bitmap for long lists.",
    ],
    gridWidth: 236,
    detailWidth: 380,
    full,
    token,
    row,
    share,
    mount,
  });
})();
