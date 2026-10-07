/* 02 TIR — the shot.
   BotolaGO's own ball in flight, made into one object: a white score-plate ball that
   carries the OVR, and the trail it leaves, drawn from the four decisions. The geometry
   is the GO mark's grammar (ball + two swooshes), redrawn — never the logo file.
   viewBox 0 0 400 190. The comet is drawn in a local frame and tilted −9° about the ball
   centre, so the shot visibly rises; the ball, the name zone and the manager stay upright.
   The comet never mirrors: the ball always flies to the right. */
(function () {
  const MC = window.MC;
  const PFX = "c02";
  const r2 = (n) => Math.round(n * 100) / 100;
  const P = (p) => `${r2(p[0])} ${r2(p[1])}`;
  const esc = MC.esc;

  /* ---------- measuring (canvas; the faces are requested up front so render can use them) ---------- */
  try {
    [
      ['800 64px "Changa"', "84 ALI"],
      ['800 34px "Changa"', "علي"],
      ['800 11px "Manrope"', "CAP 91"],
      ['600 9px "Manrope"', "BOT #004821"],
      ['700 9px "Noto Sans Arabic"', "قائد"],
    ].forEach(([f, t]) => document.fonts && document.fonts.load(f, t).catch(() => {}));
  } catch (e) {
    /* no FontFaceSet: measuring falls back to estimates */
  }
  let ctx2d = null;
  function measure(str, font, px) {
    try {
      ctx2d = ctx2d || document.createElement("canvas").getContext("2d");
      ctx2d.font = font.replace("{px}", "100px");
      const m = ctx2d.measureText(String(str));
      const k = px / 100;
      const w = m.width * k;
      return {
        w,
        l: (m.actualBoundingBoxLeft || 0) * k,
        r: m.actualBoundingBoxRight != null ? m.actualBoundingBoxRight * k : w,
        a: m.actualBoundingBoxAscent != null ? m.actualBoundingBoxAscent * k : px * 0.68,
        d: (m.actualBoundingBoxDescent || 0) * k,
      };
    } catch (e) {
      const w = String(str).length * px * 0.62;
      return { w, l: 0, r: w, a: px * 0.68, d: 0 };
    }
  }
  const textW = (str, font, px) => measure(str, font, px).w;
  /** Size that fits maxW; floorEm guards against a face that has not loaded yet. */
  const fit = (str, font, px, maxW, min, floorEm = 0) => {
    const w = Math.max(textW(str, font, px), String(str).length * floorEm * px);
    return w > maxW ? Math.max(min, (px * maxW) / w) : px;
  };
  /** Changa digits are proportional: centre the ink box, not the advance, on (cx, cy). */
  function numText(str, cx, cy, px, cls, extra = "") {
    const m = measure(String(str), '800 {px} "Changa"', px);
    const x = cx - (m.r - m.l) / 2;
    const y = cy + (m.a - m.d) / 2;
    return `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(px)}" class="c02-t-num ${cls}" direction="ltr"${extra}>${esc(String(str))}</text>`;
  }

  /* ---------- quadratic helpers ---------- */
  const qp = (Q, t) => {
    const u = 1 - t;
    return [u * u * Q[0][0] + 2 * u * t * Q[1][0] + t * t * Q[2][0], u * u * Q[0][1] + 2 * u * t * Q[1][1] + t * t * Q[2][1]];
  };
  const qd = (Q, t) => {
    const u = 1 - t;
    return [2 * u * (Q[1][0] - Q[0][0]) + 2 * t * (Q[2][0] - Q[1][0]), 2 * u * (Q[1][1] - Q[0][1]) + 2 * t * (Q[2][1] - Q[1][1])];
  };
  const qPath = (Q) => `M${P(Q[0])}Q${P(Q[1])} ${P(Q[2])}`;
  /** A ribbon of width w(t) along a quadratic: the swoosh. */
  function ribbon(Q, w, n = 44) {
    const A = [];
    const B = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = qp(Q, t);
      const d = qd(Q, t);
      const m = Math.hypot(d[0], d[1]) || 1;
      const nx = -d[1] / m;
      const ny = d[0] / m;
      const h = w(t) / 2;
      A.push([p[0] + nx * h, p[1] + ny * h]);
      B.push([p[0] - nx * h, p[1] - ny * h]);
    }
    return "M" + A.map(P).join("L") + "L" + B.reverse().map(P).join("L") + "Z";
  }
  /** Points along a quadratic offset by d (positive = below for a rightward curve). */
  const qOffset = (Q, t, d) => {
    const p = qp(Q, t);
    const v = qd(Q, t);
    const m = Math.hypot(v[0], v[1]) || 1;
    return [p[0] - (v[1] / m) * d, p[1] + (v[0] / m) * d];
  };
  const pent = (cx, cy, R, rot = -90) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = ((rot + i * 72) * Math.PI) / 180;
      return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
  const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

  /* ---------- the comet (full card, local frame before the tilt) ---------- */
  const BALL = { cx: 330, cy: 78, r: 68 };
  const TILT = -9;
  const ROT = `rotate(${TILT} ${BALL.cx} ${BALL.cy})`;
  const VB_H = 190;
  const GROUND = 182;
  const TOP = [[4, 112], [140, 52], [288.5, 24.5]];
  const BOT = [[4, 116], [150, 134], [300, 138]];
  const BODY = "M4 112Q140 52 288.5 24.5L330 78L300 138Q150 134 4 116A2 2 0 0 1 4 112Z";
  const ARC = [[92, 64], [201, 21], [306, 6]];
  const CRESCENT = ribbon(ARC, (t) => 15 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7));
  // LEGEND only: a second, lower swoosh that wraps under the trail toward the ball.
  const LOW_ARC = [[60, 128], [190, 150], [296, 146]];
  const LOW_CRESCENT = ribbon(LOW_ARC, (t) => 9 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.7));
  // The streaks emerge from the ball's wake: their roots end on an arc concentric with the ball.
  const WAKE_R = 180;
  const WAKE_FADE = 8;
  const LANES = [67, 84.5, 102, 119.5];
  const LANES_LEGEND = [74, 90.5, 107, 123.5];
  const TIP = [4, 114];
  const FULL = 146;
  const STAT_ORDER = ["CAP", "SEL", "TRF", "CON"];
  // Upright layout (after the tilt): the name zone and the manager.
  const NZ_X = 171;
  const NZ_AR_R = 238;
  const FIG = { x: 230, y: 96, w: 52, h: 62 };
  // Ball panels: top debossed for everyone; the founder strike is the lower-end panel at 54°.
  const F_PANEL = { c: [359, 118], R: 13, rot: 54 };
  const RIM_PANELS = [
    { c: [330, 26], R: 14, rot: -90 },
    { c: polar(330, 78, 58, -18), R: 14, rot: -18 },
    { c: F_PANEL.c, R: F_PANEL.R, rot: F_PANEL.rot, founder: true },
    { c: polar(330, 78, 58, 198), R: 14, rot: 198 },
  ];

  function bladeGeo(i, v, o = {}) {
    const lanes = o.lanes || LANES;
    const tip = o.tip || TIP;
    const full = o.full || FULL;
    const y0 = lanes[i];
    const x0 = o.rootX != null ? o.rootX : BALL.cx - Math.sqrt(WAKE_R * WAKE_R - (y0 - BALL.cy) * (y0 - BALL.cy));
    const dx = tip[0] - x0;
    const dy = tip[1] - y0;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    return { x0, y0, ux, uy, nx: -uy, ny: ux, L: (v / 100) * full, pre: o.pre != null ? o.pre : 5, ang: (Math.atan2(-uy, -ux) * 180) / Math.PI };
  }
  /** A tapered streak from s0 to s1 along the blade (s < 0 sits under the wake mask). */
  function bladePath(g, T0 = 16, T1 = 1, k = 0.5, n = 28, s0 = -g.pre, s1 = g.L) {
    const A = [];
    const B = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      const th = s <= 0 ? T0 : T1 + (T0 - T1) * Math.pow(Math.max(0, 1 - s / g.L), k);
      const cx = g.x0 + g.ux * s;
      const cy = g.y0 + g.uy * s;
      A.push([cx + (g.nx * th) / 2, cy + (g.ny * th) / 2]);
      B.push([cx - (g.nx * th) / 2, cy - (g.ny * th) / 2]);
    }
    return "M" + A.map(P).join("L") + "L" + B.reverse().map(P).join("L") + "Z";
  }
  const bestStat = (p) => STAT_ORDER.reduce((a, k) => (p.stats[k] > p.stats[a] ? k : a), STAT_ORDER[0]);

  /* ---------- the shared figure (MC.avatar), drawn as one silhouette in one fill ---------- */
  const fig = (fill, dx = 0, dy = 0, extra = {}, box = FIG) =>
    MC.avatar({ x: r2(box.x + dx), y: r2(box.y + dy), w: box.w, h: box.h, torso: fill, seam: false, collar: fill, neck: fill, skin: fill, hair: fill, ...extra });
  /** Masks for the figure treatments (halftone body, rim light, engraved walls, stencil bridges). */
  function figDefs(id, tier) {
    const reg = `maskUnits="userSpaceOnUse" x="${FIG.x - 8}" y="${FIG.y - 8}" width="${FIG.w + 16}" height="${FIG.h + 16}"`;
    let d = "";
    if (tier === "PRO") {
      d +=
        `<pattern id="${id}-ht" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="1.2" cy="1.2" r="0.6" fill="#2A5A9E"/></pattern>` +
        `<pattern id="${id}-ht2" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="1.2" cy="1.2" r="0.95" fill="#2A5A9E"/></pattern>` +
        `<linearGradient id="${id}-gfl" gradientUnits="userSpaceOnUse" x1="${FIG.x + FIG.w}" y1="${FIG.y}" x2="${FIG.x}" y2="${FIG.y + FIG.h}"><stop offset="0" stop-color="#fff"/><stop offset="0.7" stop-color="#000"/></linearGradient>` +
        `<mask id="${id}-mfig" ${reg}>${fig("#fff")}</mask>` +
        `<mask id="${id}-mfig2" ${reg}><rect x="${FIG.x - 8}" y="${FIG.y - 8}" width="${FIG.w + 16}" height="${FIG.h + 16}" fill="url(#${id}-gfl)" mask="url(#${id}-mfig)"/></mask>` +
        `<mask id="${id}-mrim" ${reg}>${fig("#fff")}${fig("#000", -1, 0.6)}</mask>`;
    }
    if (tier === "CHAMPION") {
      d +=
        `<mask id="${id}-mlo" ${reg}>${fig("#fff")}${fig("#000", 0.6, 0.6)}</mask>` +
        `<mask id="${id}-mhi" ${reg}>${fig("#fff")}${fig("#000", -0.6, -0.6)}</mask>`;
    }
    if (tier === "STADE") {
      // stencil bridges: the yoke seam and the hood's seams hold the stencil together
      d +=
        `<mask id="${id}-mst" ${reg}>${fig("#fff")}` +
        MC.avatar({ x: FIG.x, y: FIG.y, w: FIG.w, h: FIG.h, torso: false, collar: false, neck: false, skin: false, hair: false, seam: "#000" }) +
        `</mask>`;
    }
    if (tier === "LEGEND") {
      d += `<filter id="${id}-dil" x="-10%" y="-10%" width="120%" height="120%"><feMorphology operator="dilate" radius="1.2"/></filter>`;
    }
    return d;
  }

  /* ---------- defs (only what a tier uses) ---------- */
  function defs(id, tier, opts = {}) {
    let d = "";
    d += `<clipPath id="${id}-cb"><circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r}"/></clipPath>`;
    d += `<clipPath id="${id}-cy"><path d="${BODY}"/></clipPath>`;
    d += `<clipPath id="${id}-ccr"><path d="${CRESCENT}"/></clipPath>`;
    d += `<path id="${id}-arc" d="${qPath(ARC)}" fill="none"/>`;
    // 'OVR' rides the lower-start rim of the ball, centred near 125°.
    const o0 = polar(BALL.cx, BALL.cy, 57, 168);
    const o1 = polar(BALL.cx, BALL.cy, 57, 82);
    d += `<path id="${id}-ovrp" d="M${P(o0)}A57 57 0 0 0 ${P(o1)}" fill="none"/>`;
    d += `<filter id="${id}-blur" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>`;
    // The wake: the streak roots end on an arc concentric with the ball and fade in over 8u.
    d +=
      `<radialGradient id="${id}-gwake" gradientUnits="userSpaceOnUse" cx="${BALL.cx}" cy="${BALL.cy}" r="${WAKE_R + WAKE_FADE}">` +
      `<stop offset="${r2(WAKE_R / (WAKE_R + WAKE_FADE))}" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient>` +
      `<mask id="${id}-mwake" maskUnits="userSpaceOnUse" x="-20" y="-20" width="440" height="230"><rect x="-20" y="-20" width="440" height="230" fill="url(#${id}-gwake)"/></mask>`;
    // Texture filters work on the shape itself: noise clipped to SourceAlpha, merged over the fill.
    const tex = (name, freq, seed, wa, wb, ka, kb, tint = "1 1 1", dk = "0 0.03 0.12") => {
      const [r, g2, b] = tint.split(" ");
      const [dr, dg, db] = dk.split(" ");
      return (
        `<filter id="${id}-${name}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g2} 0 0 0 0 ${b} ${wa} 0 0 0 ${wb}" result="w"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${dr} 0 0 0 0 ${dg} 0 0 0 0 ${db} ${ka} 0 0 0 ${kb}" result="k"/>` +
        `<feMerge result="t"><feMergeNode in="k"/><feMergeNode in="w"/></feMerge>` +
        `<feComposite in="t" in2="SourceAlpha" operator="in" result="tc"/>` +
        `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="tc"/></feMerge></filter>`
      );
    };
    // print grain on navy: mostly dark fibres, a few light ones
    d += tex("grain", "0.9", 7, 0.5, -0.29, -1.0, 0.46);
    // Struck enamel: blurred alpha lit by a top-start light, added back over the fill.
    d +=
      `<filter id="${id}-strike" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/>` +
      `<feSpecularLighting in="b" surfaceScale="2.6" specularConstant="1.05" specularExponent="22" lighting-color="#ffffff" result="s"><feDistantLight azimuth="225" elevation="42"/></feSpecularLighting>` +
      `<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>` +
      `<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0"/></filter>`;
    // Ball face: a lit plate, not a flat disc.
    d +=
      `<radialGradient id="${id}-gball" cx="0.4" cy="0.3" r="0.78">` +
      `<stop offset="0" class="c02-s-ballhi"/><stop offset="0.62" class="c02-s-ball"/><stop offset="1" class="c02-s-balllo"/></radialGradient>`;
    if (tier === "PRO") {
      d +=
        `<linearGradient id="${id}-gnavy" gradientUnits="userSpaceOnUse" x1="4" y1="114" x2="300" y2="78">` +
        `<stop offset="0" stop-color="#001C49"/><stop offset="0.45" stop-color="#062550"/><stop offset="1" stop-color="#0C3164"/></linearGradient>`;
    }
    if (tier === "STADE") {
      // Matte brushed paint: heavy streaks along the flight, both light and dark fibres.
      d += tex("paint", "0.01 0.5", 4, 1.15, -0.52, -1.25, 0.56, "0.78 0.84 0.92", "0 0.04 0.14");
    }
    if (tier === "CHAMPION") {
      d += tex("brush", "0.004 0.8", 9, 1.3, -0.62, -1.5, 0.66, "1 1 1", "0.12 0.14 0.18");
      d +=
        `<linearGradient id="${id}-galu" gradientUnits="userSpaceOnUse" x1="150" y1="40" x2="166" y2="138">` +
        `<stop offset="0" stop-color="#F3F5F7"/><stop offset="0.3" stop-color="#D7DCE2"/><stop offset="0.66" stop-color="#ACB4BE"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>` +
        `<linearGradient id="${id}-gsweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="${id}-ggroove" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E6773"/><stop offset="1" stop-color="#9AA3AE"/></linearGradient>` +
        `<linearGradient id="${id}-grim" x1="0.15" y1="0.05" x2="0.85" y2="0.95"><stop offset="0" stop-color="#FAFBFC"/><stop offset="0.35" stop-color="#C3CAD2"/><stop offset="0.7" stop-color="#8F98A3"/><stop offset="1" stop-color="#DCE1E6"/></linearGradient>` +
        `<linearGradient id="${id}-gbezel" gradientUnits="userSpaceOnUse" x1="276" y1="24" x2="384" y2="132"><stop offset="0" stop-color="#E4E8EC"/><stop offset="0.3" stop-color="#C3CAD2"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>`;
    }
    if (tier === "HOMA") {
      d +=
        `<filter id="${id}-slab" x="-4%" y="-12%" width="108%" height="124%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="3" result="t"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="t" scale="7" xChannelSelector="R" yChannelSelector="G" result="sh"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="12" result="m"/>` +
        `<feColorMatrix in="m" type="matrix" values="0 0 0 0 0.74 0 0 0 0 0.76 0 0 0 0 0.8 1.5 0 0 0 -0.66" result="mo"/>` +
        `<feColorMatrix in="m" type="matrix" values="0 0 0 0 0.12 0 0 0 0 0.13 0 0 0 0 0.15 -1.4 0 0 0 0.62" result="md"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" seed="2" result="f"/>` +
        `<feColorMatrix in="f" type="matrix" values="0 0 0 0 0.84 0 0 0 0 0.86 0 0 0 0 0.88 2.6 0 0 0 -1.68" result="al"/>` +
        `<feColorMatrix in="f" type="matrix" values="0 0 0 0 0.1 0 0 0 0 0.11 0 0 0 0 0.13 -2.6 0 0 0 1.02" result="ad"/>` +
        `<feMerge result="tx"><feMergeNode in="md"/><feMergeNode in="mo"/><feMergeNode in="ad"/><feMergeNode in="al"/></feMerge>` +
        `<feComposite in="tx" in2="sh" operator="in" result="txc"/>` +
        `<feMerge><feMergeNode in="sh"/><feMergeNode in="txc"/></feMerge></filter>` +
        `<filter id="${id}-chalk" x="-6%" y="-30%" width="112%" height="160%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.85 0.35" numOctaves="2" seed="11" result="t"/>` +
        `<feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.3 0 0 0 2.08" result="m"/>` +
        `<feComposite in="SourceGraphic" in2="m" operator="in" result="c"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="5" result="t2"/>` +
        `<feDisplacementMap in="c" in2="t2" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        `<filter id="${id}-scuff" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.16 0.09" numOctaves="3" seed="21" result="t"/>` +
        `<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.66 0 0 0 0 0.69 0 0 0 0 0.74 8 0 0 0 -5.05"/></filter>`;
    }
    if (tier === "LEGEND") {
      d +=
        `<linearGradient id="${id}-gleg" gradientUnits="userSpaceOnUse" x1="300" y1="78" x2="4" y2="114"><stop offset="0" stop-color="#001C49"/><stop offset="1" stop-color="#000A1E"/></linearGradient>` +
        `<radialGradient id="${id}-gflood" gradientUnits="userSpaceOnUse" cx="${BALL.cx}" cy="${BALL.cy}" r="94"><stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.35"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${id}-glball" cx="0.38" cy="0.3" r="0.76"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#F5F7FA"/><stop offset="0.86" stop-color="#E4EAF2"/><stop offset="1" stop-color="#CBD6E3"/></radialGradient>` +
        `<linearGradient id="${id}-gsheen" x1="0.1" y1="0.05" x2="0.9" y2="0.95"><stop offset="0" stop-color="#FFF3EA" stop-opacity="0.55"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#E3ECFF" stop-opacity="0.6"/></linearGradient>` +
        `<linearGradient id="${id}-gflare" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="c02-s-flare0"/><stop offset="0.5" class="c02-s-flare"/><stop offset="1" class="c02-s-flare0"/></linearGradient>` +
        // pearl panels: lit by a point light above the ball's top-start
        `<filter id="${id}-pearl" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="b"/>` +
        `<feSpecularLighting in="b" surfaceScale="3.2" specularConstant="1.1" specularExponent="14" lighting-color="#FFFFFF" result="s"><fePointLight x="300" y="20" z="60"/></feSpecularLighting>` +
        `<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>` +
        `<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.95" k4="0"/></filter>`;
    }
    d += figDefs(id, tier);
    if (opts.extra) d += opts.extra;
    return `<defs>${d}</defs>`;
  }

  /* ---------- the ball (upright, never tilted) ---------- */
  function ballSeams() {
    const verts = RIM_PANELS.map((q) => pent(q.c[0], q.c[1], q.R, q.rot));
    const out = { panels: [], seams: "" };
    verts.forEach((v, i) => out.panels.push({ d: "M" + v.map(P).join("L") + "Z", founder: !!RIM_PANELS[i].founder, top: i === 0 }));
    // seams between neighbours (closest vertex pairs), bowed outward like a hexagon edge;
    // the lower-start sector is left open for the printed 'OVR'
    [
      [0, 1],
      [1, 2],
      [3, 0],
    ].forEach(([i, j]) => {
      let best = null;
      verts[i].forEach((a) =>
        verts[j].forEach((b) => {
          const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (!best || dd < best.d) best = { a, b, d: dd };
        }),
      );
      const m = [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2];
      const o = Math.hypot(m[0] - BALL.cx, m[1] - BALL.cy);
      const k = (o + 4) / o;
      const mm = [BALL.cx + (m[0] - BALL.cx) * k, BALL.cy + (m[1] - BALL.cy) * k];
      out.seams += `M${P(best.a)}L${P(mm)}L${P(best.b)}`;
    });
    // edges that run over the horizon: from the strike panel and the start panel toward the rim
    const stub = (v) => {
      const dx = v[0] - BALL.cx;
      const dy = v[1] - BALL.cy;
      const k = (BALL.r + 2) / Math.hypot(dx, dy);
      return `M${P(v)}L${P([BALL.cx + dx * k, BALL.cy + dy * k])}`;
    };
    out.seams += stub(verts[2][1]) + stub(verts[3][4]) + stub(verts[1][1]) + stub(verts[3][2]);
    return out;
  }
  const SEAMS = ballSeams();

  function founderStrike(id, p, small = false) {
    const v = pent(F_PANEL.c[0], F_PANEL.c[1], F_PANEL.R, F_PANEL.rot);
    let g = `<polygon points="${v.map(P).join(" ")}" fill="#0151FC" filter="url(#${id}-strike)" class="c02-founder"/>`;
    // bevel: light from the top-start
    g += `<path d="M${P(v[1])}L${P(v[2])}L${P(v[3])}L${P(v[4])}" fill="none" stroke="#3D7BFF" stroke-width="0.8" stroke-linejoin="round"/>`;
    g += `<path d="M${P(v[4])}L${P(v[0])}L${P(v[1])}" fill="none" stroke="#0039B8" stroke-width="0.8" stroke-linejoin="round"/>`;
    if (!small) g += numText(String(p.founder).slice(-2), F_PANEL.c[0], F_PANEL.c[1] - 0.4, 10, "c02-founder-26");
    return g;
  }

  function ball(id, p, o, tier, opts = {}) {
    const S = MC.s(o);
    const { cx, cy, r } = BALL;
    const founder = !!p.founder;
    let g = `<g class="c02-ballg">`;
    g += `<g class="c02-ball-front">`;
    if (tier === "HOMA") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" class="c02-ball-homa"/>`;
      g += `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" filter="url(#${id}-scuff)" clip-path="url(#${id}-cb)" opacity="0.7"/>`;
      g += `<g clip-path="url(#${id}-cb)" fill="none" stroke="#AEB5BE" stroke-width="1.1" stroke-linecap="round" opacity="0.75"><path d="M276 104q10 -4 18 2"/><path d="M362 40q8 4 12 12"/><path d="M300 132q12 4 22 0"/><path d="M372 92q4 -8 10 -10"/></g>`;
      g += `<circle cx="${cx}" cy="${cy + 30}" r="${r}" class="c02-ball-dirt" clip-path="url(#${id}-cb)"/>`;
    } else if (tier === "LEGEND") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-glball)"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-gsheen)"/>`;
    } else if (tier === "STADE") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" class="c02-ball-flat"/>`;
    } else {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-gball)"/>`;
    }
    // panels and seams
    const plain = SEAMS.panels.filter((q) => !(q.founder && founder)).map((q) => q.d).join("");
    if (tier === "STADE") {
      g += `<g clip-path="url(#${id}-cb)"><path d="${SEAMS.seams}${plain}" class="c02-seam-print"/></g>`;
    } else if (tier === "PRO" || tier === "CHAMPION") {
      g +=
        `<g clip-path="url(#${id}-cb)" fill="none" stroke-linejoin="round" stroke-width="1.15">` +
        `<path d="${SEAMS.seams}${plain}" class="c02-seam-hi" transform="translate(0.6 0.6)"/>` +
        `<path d="${SEAMS.seams}${plain}" class="c02-seam"/></g>`;
    } else if (tier === "LEGEND") {
      g +=
        `<g clip-path="url(#${id}-cb)"><path d="${plain}" fill="#DCE4EE" filter="url(#${id}-pearl)"/>` +
        `<path d="${SEAMS.seams}${plain}" fill="none" stroke="#AEBCCC" stroke-width="0.9" stroke-linejoin="round"/></g>`;
    }
    if (tier === "CHAMPION") {
      // a machined steel bezel carrying 48 knurl ticks
      const circ = 2 * Math.PI * 66;
      g += `<circle cx="${cx}" cy="${cy}" r="66" fill="none" stroke="url(#${id}-gbezel)" stroke-width="4"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="66" fill="none" stroke="#6E7782" stroke-width="3.3" stroke-dasharray="0.6 ${r2(circ / 48 - 0.6)}"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="63.8" fill="none" stroke="#6E7782" stroke-width="0.5" opacity="0.8"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="64.3" fill="none" stroke="#FFFFFF" stroke-width="0.4" opacity="0.7" transform="translate(0.4 0.4)"/>`;
    }
    if (tier !== "LEGEND") g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" class="c02-ring" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    // the founder strike: a struck enamel panel at the lower-end rim, same at every tier
    if (founder) g += founderStrike(id, p, !!opts.small);
    // the rating: Tunnel Navy on the plate, ink-centred on the ball
    g += numText(p.ovr, cx, cy, opts.ovrSize || 64, "c02-ovr");
    if (!opts.noUnit)
      g += `<text font-size="7.5" class="c02-t-lab c02-unit" direction="ltr" text-anchor="middle"><textPath href="#${id}-ovrp" startOffset="50%">${esc(S.ovr)}</textPath></text>`;
    g += `</g>`;
    // the back of the ball (long-press): where the provenance lives
    if (opts.back) {
      g +=
        `<g class="c02-ball-back" aria-hidden="true">` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#001C49"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r - 5}" fill="none" stroke="#0151FC" stroke-width="1.2"/>` +
        `<text x="${cx}" y="70" text-anchor="middle" font-size="${MC.isAr(o) ? 12 : 11}" class="${MC.isAr(o) ? "c02-t-ar" : "c02-t-lab"} c02-back-l1">${esc(founder ? S.founderLine : S.manager)}</text>` +
        `<text x="${cx}" y="88" text-anchor="middle" font-size="9" class="c02-t-meta c02-back-l2" direction="ltr">${esc(p.id)}</text>` +
        `<text x="${cx}" y="101" text-anchor="middle" font-size="9" class="c02-t-meta c02-back-l2" direction="ltr">${esc(p.season)}</text>` +
        `</g>`;
    }
    g += `</g>`;
    return g;
  }

  /** What sits around and under the ball: the floodlight (LEGEND) and the lift shadow / ground flare. */
  function ground(id, tier, opts = {}) {
    const { cx, cy, r } = BALL;
    let g = "";
    if (tier === "LEGEND") {
      if (!opts.noFlare) g += `<rect x="${cx - 80}" y="${GROUND - 0.6}" width="160" height="1.2" fill="url(#${id}-gflare)"/>`;
    } else if (!opts.noLift) {
      g += `<ellipse class="c02-lift" cx="${cx + 4}" cy="${GROUND}" rx="46" ry="4.5" filter="url(#${id}-blur)"/>`;
    }
    return g;
  }
  function legendRings() {
    const { cx, cy, r } = BALL;
    return (
      `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" class="c02-lring" stroke-width="1.5"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r + 8}" fill="none" stroke="#0151FC" stroke-width="0.75"/>`
    );
  }

  /* ---------- the trail (local frame) ---------- */
  function statLayer(id, p, o, tier, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const best = bestStat(p);
    const k = opts.scale || 1;
    const legend = tier === "LEGEND";
    const lanes = legend ? LANES_LEGEND : LANES;
    let blades = "";
    let labels = "";
    STAT_ORDER.forEach((key, i) => {
      const v = p.stats[key];
      const geo = bladeGeo(i, v, { lanes });
      const isBest = key === best;
      // label + value metrics (inside the root, reading toward the ball)
      const vfs = 11 * k;
      const lab = ar ? S.stats[key].replace(/^ال/, "") : S.stats[key];
      const lfs = ar ? fit(lab, '700 {px} "Noto Sans Arabic"', 9 * k, 30 * k, 7 * k) : 8.5 * k;
      const valX = -11 - (k - 1) * 4;
      const vw = textW(String(v), '800 {px} "Manrope"', vfs);
      const gap = 3.4 * k;
      const labX = valX - vw - gap;
      const lw = ar ? textW(lab, '700 {px} "Noto Sans Arabic"', lfs) : textW(lab, '800 {px} "Manrope"', lfs) + lab.length * 0.09 * lfs;
      const textEnd = -labX + lw + 3;
      if (legend) {
        // a crisp beam of light, interrupted where its label sits
        const s1 = opts.labels === false ? geo.L : Math.min(geo.L, -valX - 2.5);
        blades += `<path d="${bladePath(geo, 1.8, 0.6, 0.9, 8, -geo.pre, s1)}" class="c02-beam${isBest ? " is-best" : ""}"/>`;
        if (opts.labels !== false && textEnd < geo.L - 4)
          blades += `<path d="${bladePath(geo, 1.8, 0.6, 0.9, 18, textEnd, geo.L)}" class="c02-beam${isBest ? " is-best" : ""}"/>`;
      } else {
        const path = bladePath(geo);
        if (tier === "HOMA") blades += `<path d="${path}" class="c02-blade c02-blade-chalk${isBest ? " is-best" : ""}" filter="url(#${id}-chalk)"/>`;
        else if (tier === "CHAMPION")
          blades +=
            `<path d="${path}" fill="#FFFFFF" opacity="0.85" transform="translate(0 0.7)"/>` +
            `<path d="${path}" class="c02-blade" fill="${isBest ? "#0151FC" : `url(#${id}-ggroove)`}"${isBest ? ` filter="url(#${id}-strike)"` : ""}/>`;
        else blades += `<path d="${path}" class="c02-blade c02-blade-${tier.toLowerCase()}${isBest ? " is-best" : ""}"/>`;
      }
      if (opts.labels === false) return;
      const y = r2(legend ? 3.7 * k : 3.7 * k);
      const cls = `c02-slab c02-slab-${tier.toLowerCase()}${isBest ? " is-best" : ""}`;
      const engrave = tier === "CHAMPION" && !isBest;
      const valT = `<text x="${r2(valX)}" y="${y}" text-anchor="end" font-size="${r2(vfs)}" class="c02-t-lab c02-sval" direction="ltr">${v}</text>`;
      const labT = ar
        ? `<text x="${r2(labX)}" y="${r2(y + 0.2)}" text-anchor="end" font-size="${r2(lfs)}" class="c02-t-ar c02-slab-t" direction="rtl">${esc(lab)}</text>`
        : `<text x="${r2(labX)}" y="${y}" text-anchor="end" font-size="${r2(lfs)}" class="c02-t-lab c02-slab-t c02-track" direction="ltr">${esc(lab)}</text>`;
      labels +=
        `<g class="${cls}" transform="translate(${r2(geo.x0)} ${r2(geo.y0)}) rotate(${r2(geo.ang)})">` +
        (engrave ? `<g class="c02-engrave-hi" transform="translate(0 0.55)">${valT}${labT}</g>` : "") +
        `${valT}${labT}</g>`;
    });
    return `<g class="c02-blades" mask="url(#${id}-mwake)">${blades}</g>` + labels;
  }

  function crescentLayer(id, p, o, tier, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    let g = "";
    if (tier === "HOMA") {
      // the swoosh chalked onto the air: a scumbled chalk fill
      g += `<path d="${CRESCENT}" class="c02-cres-chalk" opacity="0.85" filter="url(#${id}-chalk)"/>`;
    } else if (tier === "STADE") {
      // a painted outline: the swoosh is drawn, not yet filled
      g += `<path d="${CRESCENT}" class="c02-cres-line" fill="none" stroke-width="1.4" stroke-linejoin="round"/>`;
    } else {
      g += `<path d="${CRESCENT}" fill="#0151FC" class="c02-crescent"${tier === "CHAMPION" ? ` filter="url(#${id}-strike)"` : ""}/>`;
      g += `<g clip-path="url(#${id}-ccr)"><path d="${qPath(ARC)}" transform="translate(0.4 -${tier === "LEGEND" ? 5.6 : 4.6})" fill="none" stroke="${tier === "LEGEND" ? "#F4FBFF" : "#5C93FF"}" stroke-width="${tier === "LEGEND" ? 1.5 : 1.6}" opacity="${tier === "LEGEND" ? 1 : 0.85}"/></g>`;
      if (tier === "CHAMPION") g += `<path d="${CRESCENT}" fill="none" stroke="url(#${id}-grim)" stroke-width="1" stroke-linejoin="round"/>`;
    }
    if (opts.text === false) return g;
    // words on the swoosh: the country, then the founder line
    const cls = `c02-arc-t c02-arc-${tier.toLowerCase()}`;
    const fs = 8 * (opts.scale || 1);
    const run = (txt, off, arabic) =>
      arabic
        ? `<text font-size="${r2(fs + 0.6)}" dy="${r2(fs * 0.3)}" text-anchor="middle" class="c02-t-ar ${cls}"><textPath href="#${id}-arc" startOffset="${off}%">${esc(txt)}</textPath></text>`
        : `<text font-size="${r2(fs)}" dy="${r2(fs * 0.36)}" text-anchor="middle" class="c02-t-lab c02-track ${cls}" direction="ltr"><textPath href="#${id}-arc" startOffset="${off}%">${esc(txt)}</textPath></text>`;
    let t = "";
    if (ar) {
      t += run(S.country, p.founder ? 30 : 50, true);
      if (p.founder) {
        t += run(String(p.founder), 57, false);
        t += run(S.founder, 74, true);
      }
    } else {
      t += run(S.country, p.founder ? 32 : 50, false);
      if (p.founder) t += run(S.founderLine, 68, false);
    }
    return g + `<g class="c02-arc-words">${t}</g>`;
  }

  /** The manager, upright, standing just behind the ball, one filled treatment per tier. */
  function avatarLayer(id, tier) {
    const box = `x="${FIG.x - 6}" y="${FIG.y - 6}" width="${FIG.w + 12}" height="${FIG.h + 12}"`;
    let g = "";
    if (tier === "HOMA") {
      g += `<g filter="url(#${id}-chalk)" opacity="0.82">${fig("#C9CFD8", 0, 0, { seam: "#4A515B" })}</g>`;
    } else if (tier === "STADE") {
      g += `<rect ${box} class="c02-stencil" mask="url(#${id}-mst)"/>`;
    } else if (tier === "CHAMPION") {
      g += fig("#8F98A3");
      g += `<rect ${box} fill="#4A525C" mask="url(#${id}-mlo)"/>`;
      g += `<rect ${box} fill="#FFFFFF" mask="url(#${id}-mhi)"/>`;
    } else if (tier === "LEGEND") {
      g += `<g filter="url(#${id}-dil)">${fig("#F4FBFF")}</g>${fig("#001C49", 0, 0, { seam: "#0C3164" })}`;
    } else {
      // PRO: a printed halftone, denser where the ball lights him, with a sky rim on the ball side
      g += `<rect ${box} fill="url(#${id}-ht)" opacity="0.7" mask="url(#${id}-mfig)"/>`;
      g += `<rect ${box} fill="url(#${id}-ht2)" opacity="0.7" mask="url(#${id}-mfig2)"/>`;
      g += `<rect ${box} fill="#9BDBFD" mask="url(#${id}-mrim)"/>`;
    }
    return `<g class="c02-fig" clip-path="url(#${id}-cyr)">${g}</g>`;
  }

  /** Latin names: one line down to 18u, then two lines at 20u (broken at a hyphen/space or after 7). */
  function splitName(name) {
    const m = name.match(/^(.+?[-\s])(.+)$/);
    if (m) return [m[1].trim(), m[2].trim()];
    if (name.length > 7) return [name.slice(0, 7), name.slice(7)];
    return null;
  }

  function nameZone(id, p, o, tier) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const name = MC.nameOf(p, o);
    const engrave = tier === "CHAMPION";
    let g = `<g class="c02-nz c02-nz-${tier.toLowerCase()}">`;
    if (ar) {
      const F = '800 {px} "Changa"';
      const maxW = NZ_AR_R - NZ_X;
      let fs = fit(name, F, 34, maxW, 16, 0.5);
      let lines = [name];
      let y = { name: [97], tier: 122.5, season: 133, bot: 143.5 };
      if (textW(name, F, fs) > maxW + 0.5 && /\s/.test(name)) {
        const i = name.lastIndexOf(" ", Math.ceil(name.length / 2) + 2);
        lines = [name.slice(0, i), name.slice(i + 1)];
        fs = Math.min(16, ...lines.map((l) => fit(l, F, 16, maxW, 11, 0.5)));
        y = { name: [86, r2(86 + fs * 1.95)], tier: 134.5, season: null, bot: 145 };
      }
      const nm = (cls, dy = 0) =>
        lines.map((l, i) => `<text x="${NZ_AR_R}" y="${r2(y.name[i] + dy)}" text-anchor="end" font-size="${r2(fs)}" class="c02-t-arname ${cls}">${esc(l)}</text>`).join("");
      g += (engrave ? nm("c02-name-hi", 0.8) : "") + nm("c02-name");
      g += `<text x="${NZ_AR_R}" y="${y.tier}" text-anchor="end" font-size="10.5" class="c02-t-ar c02-tier">${esc(S.tiers[tier])}</text>`;
      if (y.season) g += `<text x="${NZ_AR_R}" y="${y.season}" text-anchor="end" font-size="8.6" class="c02-t-meta c02-meta c02-season" direction="ltr">${esc(p.season)}</text>`;
      g += `<text x="${NZ_AR_R}" y="${y.bot}" text-anchor="end" font-size="8.6" class="c02-t-meta c02-meta c02-bot" direction="ltr">${esc(p.id)}</text>`;
    } else {
      const F = '800 {px} "Changa"';
      const maxW = 72;
      let fs = fit(name, F, 36, maxW, 18, 0.5);
      let lines = [name];
      let y = { name: [104], tier: 117, season: 128, bot: 139 };
      const split = textW(name, F, fs) > maxW + 0.5 ? splitName(name) : null;
      if (split) {
        lines = split;
        fs = Math.min(20, ...lines.map((l) => fit(l, F, 20, maxW, 13, 0.5)));
        y = { name: [93, r2(93 + fs * 0.98)], tier: 124.5, season: 135, bot: 145.5 };
      }
      const nm = (cls) => lines.map((l, i) => `<text x="0" y="${r2(y.name[i] - y.name[0])}" font-size="${r2(fs)}" class="c02-t-name ${cls}" direction="ltr">${esc(l)}</text>`).join("");
      g +=
        `<g transform="translate(${NZ_X} ${y.name[0]}) skewX(-11.3)">` +
        (engrave ? `<g transform="translate(0 0.8)">${nm("c02-name-hi")}</g>` : "") +
        nm("c02-name") +
        `</g>`;
      g += `<text x="${NZ_X + 1}" y="${y.tier}" font-size="10.5" class="c02-t-lab c02-track c02-tier" direction="ltr">${esc(S.tiers[tier])}</text>`;
      g += `<text x="${NZ_X + 1}" y="${y.season}" font-size="8.6" class="c02-t-meta c02-meta c02-season" direction="ltr">${esc(p.season)}</text>`;
      g += `<text x="${NZ_X + 1}" y="${y.bot}" font-size="8.6" class="c02-t-meta c02-meta c02-bot" direction="ltr">${esc(p.id)}</text>`;
    }
    return g + `</g>`;
  }

  /** Body / material of the trail for a tier (local frame). */
  function trailBody(id, tier, opts = {}) {
    if (tier === "HOMA") {
      return `<path d="${BODY}" class="c02-concrete" filter="url(#${id}-slab)"/>`;
    }
    if (tier === "STADE") {
      return (
        `<path d="${BODY}" fill="#173C74" class="c02-body" filter="url(#${id}-paint)"/>` +
        `<path d="${BODY}" fill="none" class="c02-rim" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      );
    }
    if (tier === "CHAMPION") {
      return (
        `<path d="${BODY}" fill="url(#${id}-galu)" filter="url(#${id}-brush)"/>` +
        `<g clip-path="url(#${id}-cy)">` +
        `<g class="c02-sweep"><path d="M168 18L214 18L190 140L144 140Z" fill="url(#${id}-gsweep)"/></g>` +
        `<path d="${qPath(TOP)}" fill="none" stroke="#FFFFFF" stroke-width="3"/>` +
        `<path d="${qPath(BOT)}" fill="none" stroke="#6E7782" stroke-width="2" opacity="0.8"/>` +
        `</g>` +
        `<path d="${BODY}" fill="none" class="c02-alu-edge" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      );
    }
    if (tier === "LEGEND") {
      // a solid night body with the pitch inlaid, a lit top edge and fourteen lamps set into it
      let stripes = "";
      for (let i = 0; i < 10; i++) {
        const x0 = 4 + i * 33;
        const x1 = x0 + 16.5;
        const top = (x) => r2(167 + (x - 167) * 0.25);
        stripes += `<path d="M${r2(x0)} 145L${r2(x1)} 145L${top(x1)} 15L${top(x0)} 15Z"/>`;
      }
      let lamps = "";
      for (let i = 0; i < 14; i++) {
        const f = i / 13;
        const t = 0.05 + 0.87 * Math.pow(f, 0.85);
        const c = qOffset(TOP, t, 6);
        const rr = 1.6 + 2.8 * Math.pow(f, 1.1);
        lamps +=
          `<g class="c02-dot" style="--i:${i}"><circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr + 0.8)}" fill="#000A1E"/>` +
          `<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr)}" fill="#F4FBFF"/></g>`;
      }
      return (
        `<path d="${LOW_CRESCENT}" class="c02-lowcres"/>` +
        `<path d="${BODY}" fill="url(#${id}-gleg)"/>` +
        `<g clip-path="url(#${id}-cy)"><g fill="hsl(214 90% 55% / .13)">${stripes}</g>` +
        `<path d="${qPath(TOP)}" fill="none" stroke="#F4FBFF" stroke-width="3"/></g>` +
        `<path d="${BODY}" fill="none" class="c02-rim" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
        lamps
      );
    }
    // PRO: Floodlight Navy fading to Tunnel Navy at the tip, printed grain, a lit top edge
    return (
      `<path d="${BODY}" fill="url(#${id}-gnavy)" class="c02-body" filter="url(#${id}-grain)"/>` +
      `<g clip-path="url(#${id}-cy)">` +
      (opts.share
        ? `<path d="${qPath(TOP)}" fill="none" stroke="#9BDBFD" stroke-width="3" opacity="0.7"/>`
        : `<path d="${qPath(TOP)}" fill="none" stroke="#2A5A9E" stroke-width="2.6" opacity="0.75"/>`) +
      `<path d="${qPath(BOT)}" fill="none" stroke="#000A1E" stroke-width="3" opacity="0.5"/>` +
      `</g>` +
      `<path d="${BODY}" fill="none" class="${opts.share ? "c02-rim-share" : "c02-rim"}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    );
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid(PFX);
    const tier = p.tier;
    const thumb = !!o.thumb;
    // clip paths for upright layers, in the tilted frame
    const extra = `<clipPath id="${id}-cyr"><path d="${BODY}" transform="${ROT}"/></clipPath>`;
    let svg = defs(id, tier, { extra });
    if (tier === "LEGEND") svg += `<circle cx="${BALL.cx}" cy="${BALL.cy}" r="94" fill="url(#${id}-gflood)" class="c02-flood"/>`;
    svg += ground(id, tier, { noLift: thumb });
    svg += `<g class="c02-trail" transform="${ROT}">${trailBody(id, tier)}`;
    svg += crescentLayer(id, p, o, tier, { text: !thumb });
    svg += statLayer(id, p, o, tier, { labels: !thumb });
    svg += `</g>`;
    if (!thumb) svg += avatarLayer(id, tier) + nameZone(id, p, o, tier);
    if (tier === "LEGEND") svg += legendRings();
    svg += ball(id, p, o, tier, { noUnit: thumb, back: !thumb, small: thumb });
    const cls = `c02 c02-card c02--${tier.toLowerCase()}${o.motion ? " c02--motion" : ""}${thumb ? " c02--thumb" : ""}`;
    return (
      `<div class="${cls}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}">` +
      `<svg class="c02-svg" viewBox="0 0 400 ${VB_H}" aria-hidden="true" focusable="false">${svg}</svg></div>`
    );
  }

  /* ---------- token: 44–80px (comet) and 24–32px (ball + tier stubs) ---------- */
  const TK = {
    vb: [176, 96],
    ball: [128, 48, 44],
    body: "M4 66Q52 34 99.7 14.3L128 48L102.8 84Q56 82 4 70A2 2 0 0 1 4 66Z",
    top: [[4, 66], [52, 34], [99.7, 14.3]],
    arc: [[22, 42], [62, 10], [111, 2.5]],
    low: [[18, 80], [62, 93], [100, 92.5]],
  };
  const TK_CRESCENT = ribbon(TK.arc, (t) => 8.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7), 30);
  const TK_LOW = ribbon(TK.low, (t) => 5.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.7), 24);
  const MN = {
    vb: [128, 96],
    ball: [82, 48, 43],
    stub: "M2 64Q22 46 46 27L82 48L50 78Q26 72 2 68A2 2 0 0 1 2 64Z",
    arc: [[6, 34], [24, 12], [50, 4]],
  };
  const MN_CRESCENT = ribbon(MN.arc, (t) => 9 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7), 20);

  function tokenBall(id, p, tier, cx, cy, r, fsz, mini) {
    let g = "";
    const inverted = tier === "LEGEND" && mini;
    const clip = `clip-path="url(#${id}-tb)"`;
    if (inverted) {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#001C49"/>`;
    } else if (tier === "LEGEND") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-glball)"/>`;
    } else if (tier === "HOMA") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" class="c02-ball-homa"/>`;
      if (!mini) g += `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" filter="url(#${id}-scuff)" ${clip} opacity="0.8"/>`;
    } else {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-gball)"/>`;
    }
    // rim panel fragments: a ball, not a disc (the founder's is the blue lower-end one)
    if (!mini && tier !== "HOMA") {
      g += `<g ${clip}>`;
      [-36, 144, 234].forEach((a) => {
        const c = polar(cx, cy, 0.92 * r, a);
        g += `<polygon points="${pent(c[0], c[1], 0.3 * r, a).map(P).join(" ")}" class="c02-tpanel${tier === "LEGEND" ? " is-pearl" : ""}"/>`;
      });
      if (!p.founder) {
        const c = polar(cx, cy, 0.9 * r, 54);
        g += `<polygon points="${pent(c[0], c[1], 0.28 * r, 54).map(P).join(" ")}" class="c02-tpanel${tier === "LEGEND" ? " is-pearl" : ""}"/>`;
      }
      g += `</g>`;
    }
    if (tier === "CHAMPION" && !mini) {
      const rb = r - 2;
      g += `<circle cx="${cx}" cy="${cy}" r="${rb}" fill="none" stroke="url(#${id}-gbezel)" stroke-width="4"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${rb}" fill="none" stroke="#6E7782" stroke-width="3.3" stroke-dasharray="0.8 ${r2((2 * Math.PI * rb) / 48 - 0.8)}"/>`;
    }
    if (inverted) g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" stroke="#F4FBFF" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
    else if (tier !== "LEGEND") g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" class="c02-ring" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if (p.founder) {
      if (mini) {
        // a blue notch cut into the rim at 4–5 o'clock
        const c = polar(cx, cy, 1.06 * r, 54);
        g += `<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(0.38 * r)}" fill="${inverted ? "#3D7BFF" : "#0151FC"}" ${clip}/>`;
      } else {
        const c = polar(cx, cy, 0.9 * r, 54);
        const v = pent(c[0], c[1], 0.28 * r, 54);
        g += `<g ${clip}><polygon points="${v.map(P).join(" ")}" fill="#0151FC"/><path d="M${P(v[1])}L${P(v[2])}L${P(v[3])}" fill="none" stroke="#3D7BFF" stroke-width="1"/></g>`;
      }
    }
    g += numText(p.ovr, cx, cy, fsz, inverted ? "c02-ovr-inv" : "c02-ovr");
    return g;
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = o.mini || size <= 32;
    const id = MC.uid(PFX);
    const tier = p.tier;
    const t = tier.toLowerCase();
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${MC.s(o).tiers[tier]}${p.founder ? ", " + MC.s(o).founderLine : ""}`;
    const ballGrad = `<radialGradient id="${id}-gball" cx="0.4" cy="0.3" r="0.78"><stop offset="0" class="c02-s-ballhi"/><stop offset="0.62" class="c02-s-ball"/><stop offset="1" class="c02-s-balllo"/></radialGradient>`;
    let d = "";
    let g = "";
    if (mini) {
      const [cx, cy, r] = MN.ball;
      d +=
        `<clipPath id="${id}-tb"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
        ballGrad +
        `<linearGradient id="${id}-galu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3F5F7"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>`;
      if (tier === "STADE" || tier === "PRO" || tier === "CHAMPION") {
        const fill = tier === "CHAMPION" ? `url(#${id}-galu)` : tier === "STADE" ? "#173C74" : "#0C3164";
        g += `<path d="${MN.stub}" fill="${fill}"/><path d="${MN.stub}" fill="none" class="${tier === "CHAMPION" ? "c02-alu-edge" : "c02-rim"}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      }
      if (tier === "PRO" || tier === "CHAMPION") g += `<path d="${MN_CRESCENT}" fill="#0151FC"/>`;
      if (tier === "CHAMPION") g += `<circle cx="${cx}" cy="${cy}" r="${r + 4.2}" fill="none" class="c02-champ-ring" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      if (tier === "LEGEND")
        g += [
          [8, 66, 3.2],
          [22, 61, 4.6],
          [38, 55, 6.2],
        ]
          .map((c) => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" class="c02-mini-dot"/>`)
          .join("");
      g += tokenBall(id, p, tier, cx, cy, r, 44, true);
      const w = r2((size * MN.vb[0]) / MN.vb[1]);
      return (
        `<div class="c02 c02-token c02-token--mini c02--${t}" style="height:${size}px;width:${w}px" role="img" aria-label="${esc(label)}">` +
        `<svg viewBox="0 0 ${MN.vb[0]} ${MN.vb[1]}" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>${d}</defs>${g}</svg></div>`
      );
    }
    const [cx, cy, r] = TK.ball;
    const rich = size >= 64;
    d += `<clipPath id="${id}-tb"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` + `<clipPath id="${id}-tbody"><path d="${TK.body}"/></clipPath>` + ballGrad;
    if (tier === "PRO")
      d += `<linearGradient id="${id}-gnavy" gradientUnits="userSpaceOnUse" x1="4" y1="68" x2="110" y2="48"><stop offset="0" stop-color="#001C49"/><stop offset="1" stop-color="#0C3164"/></linearGradient>`;
    if (tier === "CHAMPION")
      d +=
        `<linearGradient id="${id}-galu" gradientUnits="userSpaceOnUse" x1="60" y1="20" x2="66" y2="86"><stop offset="0" stop-color="#F3F5F7"/><stop offset="0.35" stop-color="#D7DCE2"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>` +
        `<linearGradient id="${id}-gbezel" gradientUnits="userSpaceOnUse" x1="96" y1="16" x2="160" y2="80"><stop offset="0" stop-color="#E4E8EC"/><stop offset="0.3" stop-color="#C3CAD2"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>`;
    if (tier === "HOMA")
      d +=
        `<filter id="${id}-rough" x="-5%" y="-15%" width="110%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        `<filter id="${id}-scuff" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="21" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.6 0 0 0 0 0.63 0 0 0 0 0.68 7 0 0 0 -3.85"/></filter>`;
    if (tier === "LEGEND")
      d +=
        `<linearGradient id="${id}-gleg" gradientUnits="userSpaceOnUse" x1="110" y1="48" x2="4" y2="68"><stop offset="0" stop-color="#001C49"/><stop offset="1" stop-color="#000A1E"/></linearGradient>` +
        `<radialGradient id="${id}-glball" cx="0.4" cy="0.32" r="0.74"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#F3F6FA"/><stop offset="1" stop-color="#CFD9E5"/></radialGradient>`;
    // the crescent, by material
    let cres = "";
    if (tier === "HOMA") cres = `<path d="${TK_CRESCENT}" class="c02-cres-chalk" opacity="0.9" filter="url(#${id}-rough)"/>`;
    else if (tier === "STADE") cres = `<path d="${TK_CRESCENT}" fill="none" class="c02-cres-line" stroke-width="1.5" stroke-linejoin="round"/>`;
    else cres = `<path d="${TK_CRESCENT}" fill="#0151FC"/>` + (tier === "LEGEND" ? `<path d="${qPath(TK.arc)}" transform="translate(0.3 -3.2)" fill="none" stroke="#F4FBFF" stroke-width="1.2" clip-path="url(#${id}-tcr)"/>` : "");
    if (tier === "LEGEND") d += `<clipPath id="${id}-tcr"><path d="${TK_CRESCENT}"/></clipPath>`;
    // the trail
    if (tier === "HOMA") {
      g += `<path d="${TK.body}" class="c02-concrete" filter="url(#${id}-rough)"/>`;
      g += [0, 1, 2]
        .map((i) => `<path d="M${30 + i * 4} ${58 + i * 6}L94 ${34 + i * 13}" class="c02-chalkline" stroke-width="${3 - i * 0.6}" stroke-linecap="round" fill="none" opacity="0.85"/>`)
        .join("");
    } else if (tier === "LEGEND") {
      g += `<path d="${TK_LOW}" class="c02-lowcres"/>`;
      g += `<path d="${TK.body}" fill="url(#${id}-gleg)"/>`;
      g += `<path d="${qPath(TK.top)}" fill="none" stroke="#F4FBFF" stroke-width="2.4" clip-path="url(#${id}-tbody)"/>`;
      g += `<path d="${TK.body}" fill="none" class="c02-rim" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i < 6; i++) {
        const f = i / 5;
        const c = qOffset(TK.top, 0.12 + 0.72 * f, 5.2);
        const rr = 1.6 + 1.9 * f;
        g += `<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr + 0.9)}" fill="#000A1E"/><circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr)}" fill="#F4FBFF"/>`;
      }
    } else {
      const fill = tier === "CHAMPION" ? `url(#${id}-galu)` : tier === "PRO" ? `url(#${id}-gnavy)` : "#173C74";
      g += `<path d="${TK.body}" fill="${fill}"/>`;
      if (tier === "CHAMPION") g += `<path d="${qPath(TK.top)}" fill="none" stroke="#fff" stroke-width="2.4" clip-path="url(#${id}-tbody)"/>`;
      if (rich) {
        const best = bestStat(p);
        STAT_ORDER.forEach((k, i) => {
          const geo = bladeGeo(i, p.stats[k], { rootX: 92, lanes: [34, 46, 58, 70], tip: [4, 68], full: 96, pre: 0 });
          const col = tier === "CHAMPION" ? (k === best ? "#0151FC" : "#6E7782") : k === best ? "#FFFFFF" : "#B6C1D1";
          g += `<path d="${bladePath(geo, 7, 0.8, 0.6, 14)}" fill="${col}"/>`;
        });
      }
      g += `<path d="${TK.body}" fill="none" class="${tier === "CHAMPION" ? "c02-alu-edge" : "c02-rim"}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    g += cres;
    if (tier === "LEGEND")
      g += `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="none" class="c02-lring" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="${r + 5.4}" fill="none" stroke="#0151FC" stroke-width="1"/>`;
    g += tokenBall(id, p, tier, cx, cy, r, 39, false);
    const w = r2((size * TK.vb[0]) / TK.vb[1]);
    return (
      `<div class="c02 c02-token c02--${t}" style="height:${size}px;width:${w}px" role="img" aria-label="${esc(label)}">` +
      `<svg viewBox="0 0 ${TK.vb[0]} ${TK.vb[1]}" width="100%" height="100%" aria-hidden="true" focusable="false" style="overflow:visible"><defs>${d}</defs>${g}</svg></div>`
    );
  }

  /* ---------- row: the leaderboard line that flies ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const name = MC.nameOf(p, o);
    return (
      `<div class="c02 c02-row c02--${p.tier.toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""}>` +
      (o.me ? `<span class="c02-row-wedge" aria-hidden="true"></span>` : "") +
      `<span class="c02-row-rank">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c02-row-token">${token(p, { ...o, size: 44 })}</span>` +
      `<span class="c02-row-who"><b>${esc(name)}</b><small>${esc(S.tiers[p.tier])}${p.founder ? `<i class="c02-row-f" role="img" aria-label="${esc(S.founderLine)}"></i>` : ""}</small></span>` +
      `<span class="c02-row-pts"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- share: the shot, staged on a night pitch (360x640) ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid(PFX);
    const tier = p.tier;
    const s = 1.1;
    const B = [262, 214];
    const F = [70, 430];
    const ang = (Math.atan2(B[1] - F[1], B[0] - F[0]) * 180) / Math.PI;
    const local = (Math.atan2(BALL.cy - TIP[1], BALL.cx - TIP[0]) * 180) / Math.PI;
    const rot = r2(ang - local);
    const tr = `translate(${B[0]} ${B[1]}) rotate(${rot}) scale(${s}) translate(-${BALL.cx} -${BALL.cy})`;
    const tb = `translate(${B[0]} ${B[1]}) scale(${s}) translate(-${BALL.cx} -${BALL.cy})`;
    // clip a polygon to the frame's width (keeps every shape inside the 360px story)
    const clipX = (poly, lo = 0, hi = 360) => {
      const cut = (pts, inside, at) => {
        const out = [];
        pts.forEach((a, i) => {
          const b = pts[(i + 1) % pts.length];
          const ia = inside(a);
          const ib = inside(b);
          if (ia) out.push(a);
          if (ia !== ib) {
            const t = (at - a[0]) / (b[0] - a[0]);
            out.push([at, a[1] + t * (b[1] - a[1])]);
          }
        });
        return out;
      };
      return cut(cut(poly, (q) => q[0] >= lo, lo), (q) => q[0] <= hi, hi);
    };
    const poly = (pts) => (pts.length > 2 ? `<path d="M${pts.map(P).join("L")}Z"/>` : "");
    let stripes = "";
    const HZ = 404;
    for (let i = -7; i <= 7; i++) {
      if (i % 2 === 0) continue;
      const x0 = 180 + i * 34;
      const x1 = x0 + 34;
      const top = (x) => 180 + (x - 180) * 0.3;
      const bot = (x) => 180 + (x - 180) * 1.35;
      stripes += poly(clipX([[top(x0), HZ], [top(x1), HZ], [bot(x1), 640], [bot(x0), 640]]));
    }
    const extra =
      `<radialGradient id="${id}-gsky" cx="0.5" cy="0.18" r="0.9"><stop offset="0" stop-color="#0C3164"/><stop offset="0.55" stop-color="#001C49"/><stop offset="1" stop-color="#000C22"/></radialGradient>` +
      `<radialGradient id="${id}-gdeep" gradientUnits="userSpaceOnUse" cx="150" cy="330" r="160"><stop offset="0" stop-color="#000C22" stop-opacity="0.6"/><stop offset="1" stop-color="#000C22" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${id}-glamp" gradientUnits="userSpaceOnUse" cx="34" cy="30" r="78"><stop offset="0" stop-color="#F4FBFF" stop-opacity="0.95"/><stop offset="0.2" stop-color="#DDEFFC" stop-opacity="0.42"/><stop offset="1" stop-color="#9BDBFD" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${id}-glamp2" gradientUnits="userSpaceOnUse" cx="328" cy="24" r="86"><stop offset="0" stop-color="#F4FBFF" stop-opacity="0.95"/><stop offset="0.2" stop-color="#DDEFFC" stop-opacity="0.42"/><stop offset="1" stop-color="#9BDBFD" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${id}-gbeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAF6FF" stop-opacity="0.2"/><stop offset="1" stop-color="#EAF6FF" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${id}-ghaze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9BDBFD" stop-opacity="0"/><stop offset="0.65" stop-color="#9BDBFD" stop-opacity="0.18"/><stop offset="1" stop-color="#9BDBFD" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${id}-gfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000C22" stop-opacity="0"/><stop offset="1" stop-color="#000C22" stop-opacity="0.85"/></linearGradient>`;
    let svg = defs(id, tier, { extra });
    svg += `<rect width="360" height="640" fill="url(#${id}-gsky)"/>`;
    // floodlights: two lamps, two beams
    svg += poly(clipX([[34, 30], [-40, 640], [150, 640]])).replace("<path", `<path fill="url(#${id}-gbeam)"`);
    svg += poly(clipX([[328, 24], [210, 640], [400, 640]])).replace("<path", `<path fill="url(#${id}-gbeam)"`);
    svg += `<rect x="0" y="0" width="112" height="108" fill="url(#${id}-glamp)"/><rect x="242" y="0" width="118" height="110" fill="url(#${id}-glamp2)"/>`;
    svg += `<rect x="0" y="${HZ}" width="360" height="${640 - HZ}" fill="#001634"/>`;
    svg += `<g fill="hsl(214 90% 55% / .13)">${stripes}</g>`;
    svg += `<rect x="0" y="${HZ - 26}" width="360" height="40" fill="url(#${id}-ghaze)"/>`;
    svg += `<path d="M0 ${HZ}H360" stroke="#9BDBFD" stroke-opacity="0.35" stroke-width="1"/>`;
    svg += `<path d="M0 586L360 572" stroke="#EAF6FF" stroke-opacity="0.55" stroke-width="2"/>`;
    svg += `<rect y="430" width="360" height="210" fill="url(#${id}-gfade)"/>`;
    // the sky darkens behind the shot so the trail holds its edge
    svg += `<rect x="0" y="160" width="320" height="340" fill="url(#${id}-gdeep)"/>`;
    // the manager at the touchline, where the shot started: the ball is already ahead of him
    svg += MC.avatar({ x: 10, y: 476, w: 76, h: 110, torso: "#000A1E", seam: "#0C3164", collar: "#000A1E", neck: "#000A1E", skin: "#000A1E", hair: "#000A1E", rim: "#9BDBFD" });
    // the shot: three rotated groups, not one, so each keeps a tight box inside the frame
    svg += `<g transform="${tr}">${trailBody(id, tier, { share: true })}</g>`;
    svg += `<g transform="${tr}">${crescentLayer(id, p, o, tier, { text: true, scale: 1.15 })}</g>`;
    svg += `<g transform="${tr}">${statLayer(id, p, o, tier, { scale: 1.25 })}</g>`;
    svg += `<g transform="${tb}">${tier === "LEGEND" ? `<circle cx="${BALL.cx}" cy="${BALL.cy}" r="94" fill="url(#${id}-gflood)"/>` + legendRings() : ""}${ball(id, p, o, tier, {})}</g>`;
    const name = MC.nameOf(p, o);
    const nameHTML = ar
      ? `<b class="c02-sh-name c02-sh-name-ar">${esc(name)}</b>`
      : `<b class="c02-sh-name" style="font-size:${r2(fit(name, '800 {px} "Changa"', 92, 168, 40))}px">${esc(name)}</b>`;
    return (
      `<div class="c02 c02-share c02--${tier.toLowerCase()}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg class="c02-share-svg" viewBox="0 0 360 640" aria-hidden="true" focusable="false">${svg}</svg>` +
      `<div class="c02-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
      `<div class="c02-sh-who">${nameHTML}<span class="c02-sh-tier">${esc(S.tiers[tier])}</span></div>` +
      `<div class="c02-sh-foot"><b dir="ltr">@${esc(p.key || "ali")}</b><span>${MC.ltr(p.id)}</span><em>${ar ? "مثال" : "Exemple"}</em></div>` +
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
    philosophy: "Your card is your shot: the ball carries your rating, and the trail it leaves is drawn from your four decisions.",
    philosophyAr: "بطاقتك هي تسديدتك: الكرة تحمل تقييمك، والأثر الذي تتركه خلفها مرسوم من قراراتك الأربعة.",
    idea: [
      "Tir is BotolaGO's own ball in flight. The GO mark is already a story — a ball with two swooshes trailing behind it — so the card takes that grammar and makes it the object: a white score-plate ball, a trail behind it, and a thin crescent above, the logo's second swoosh. There is no rectangle anywhere; the outline is a comet that reads as 'a shot' before a single word is read, and it rises 9° toward the ball, so even the silhouette is going somewhere.",
      "The rating rides on the ball, ink-centred in Tunnel Navy, with 'OVR' printed round the lower rim the way a maker's name is printed on a ball. The four decisions are the trail itself: four tapered streaks that emerge from the ball's wake — their roots fade in on an arc around the ball — and run as long as their values. It is a bar chart disguised as motion, with no track and no 100 mark.",
      "The name sits upright inside the trail, slanted at the wordmark's 11.3° in Latin and upright in Arabic. The shared manager stands just behind the ball, seen from behind, printed into the trail in the tier's own technique — chalk, stencil, halftone, engraving, a rim of light.",
    ],
    belonging: [
      "Anyone can read a Tir card in one glance: the longer your streaks, the further your ball has flown. Two friends comparing cards compare the shape of their shots before they compare numbers.",
      "In the rankings your row literally flies: your own line is a wedge that widens toward your ball, and the trail tells everyone your tier before they read it — chalk, paint, navy, aluminium, light.",
      "Founders carry a struck enamel panel in their ball. Nobody can earn a 2026 strike later, and it survives as a blue notch in the ball's rim even at 24px in a comment thread.",
      "Older users respect it because it is calm and typographically serious; teenagers get the flex of a LEGEND ball that sits in its own floodlight with a second swoosh of light under the shot.",
    ],
    founderMark: [
      "One panel of the ball — the lower-end one, at four o'clock — is die-struck in Logo-Blue enamel with '26' knocked out in white and lit by a specular bevel. It is a panel of the ball, not a sticker on the card: the object itself is different for founders.",
      "The swoosh above the ball carries the words FOUNDER 2026, so the mark is explained without a chip or a badge. The strike sits low on the ball, away from the crescent's tip, so the two never read as a crescent and star.",
      "It never changes with tier — chalk ball or pearl ball, the 2026 strike is the same. Non-founders keep a debossed empty panel there; later cohorts would get their own year in a grey strike, so 2026 stays first in the series. At 44–80px it is a blue rim panel; at 24–32px a blue notch cut into the rim.",
    ],
    small: [
      "44–80px: the token is the comet itself, kept horizontal — the ball with the 84 in Changa 800 and three rim panel fragments (a ball, not a disc), a tapered trail and the crescent in the tier's material. From 64px the four streaks show inside the trail; below that they merge into one solid trail.",
      "24–32px: the ball alone carries the 84, and the tier is told by what trails it — HOMA nothing, STADE one stub, PRO a stub and the crescent (the full logo grammar), CHAMPION the same plus a ring, LEGEND an inverted dark ball with three dots of light. The founder notch stays.",
      "The full card is size-aware: below 280px the stat labels, the season and the swoosh words drop and the values grow; below 200px only the name, the tier and the 84 remain.",
    ],
    rtl: [
      "The comet never mirrors: in the GO mark the ball always flies to the right, and the card keeps that rule in both languages. The manager does not move either — he stays just behind his shot.",
      "Inside it the name zone follows the language: علي is set upright in Changa 800 (never slanted), right-aligned at the manager's shoulder, with the tier in Noto Sans Arabic and the season and ID kept left-to-right beneath it. Streak labels use the short MSA forms (قائد، اختيار، انتقالات، ثبات) with the value at the root, and the swoosh carries المغرب and عضو مؤسس as separate runs so the digits stay LTR.",
      "No letter-spacing anywhere in Arabic; Arabic lines get their own baselines so tall letters and descenders clear each other, and long names shrink to a 16u floor before they break onto two lines.",
    ],
    tiers: {
      HOMA: "A street shot: a scuffed grey ball with no panels, a trail of rough concrete (turbulence texture, ragged displaced edge) with four chalk streaks, the swoosh scumbled in chalk, and the manager chalked in. No light, no motion. The three-part outline is already there — in chalk.",
      STADE: "The first painted shot: a flat matte navy wedge with heavy brush grain, a clean white ball with printed seams, painted white streaks, the swoosh drawn as a painted outline that is not yet filled, and the manager sprayed through a stencil.",
      PRO: "The full logo grammar: Floodlight Navy fading to Tunnel Navy, printed grain and a lit top edge, the swoosh filled in Logo-Blue enamel, a lit ball with debossed seams, and the manager in halftone with a sky rim light from the ball.",
      CHAMPION: "Metal: the trail becomes a brushed-aluminium blade with a polished leading edge and a light band that follows tilt; the streaks are engraved grooves with the best decision inlaid in blue enamel; the name is stamped, the manager is an engraved recess, the swoosh gets a machined edge and the ball a knurled steel bezel.",
      LEGEND: "Light: a solid night trail with the pitch inlaid, a lit top edge and fourteen lamps set into it; the streaks become crisp beams; the ball turns pearl with lit panels, ringed in white and Logo Blue inside its own floodlight; a second swoosh of light wraps under the shot, changing the outline itself; the manager is rim-lit.",
    },
    legend: [
      "The strike. The screen dims to Tunnel Navy; a contact frame squashes the ball for one beat; the ball flies to rest along the curve over 420ms, switching on its fourteen lamps one at a time; the floodlight breathes once, and then everything is still. It never loops, and under reduced motion the finished state shows.",
      "It is the only tier with a fourth part — the lower swoosh of light — so a LEGEND is recognisable from its outline alone, even as a 32px token in a ranking.",
    ],
    advantages: [
      "The strongest small-size silhouette of the set: a ball and a wedge hold at 24px on the light and the dark ground, and the tier stays readable there.",
      "Owned by the brand: the geometry comes from BotolaGO's own mark and splash, not from FUT, Sorare or a bank card, and the comet never needs a frame.",
      "The four stats become one readable graphic instead of four numbers in a row.",
      "Calm enough for adult Fantasy players; the tiers change material (chalk → paint → navy → aluminium → light), not just colour, and the same three-part outline holds at every tier.",
      "The share image is a real poster: the shot rising over a night pitch, already ahead of the manager at the touchline.",
    ],
    risks: [
      "It is built from the logo's flight geometry, so the owner may read it as altering the logo. It is a redrawn proposal and never uses the logo file, but this needs an explicit yes.",
      "Even at 400×190 the object is landscape: it looks smaller than portrait cards in a portrait gallery and wants a full-width slot.",
      "The streaks can still be misread as attribute bars by someone who does not know them; the taper, the wake fade and the missing track only reduce this.",
      "It is the least 'Moroccan street' of the set: the local layer lives in HOMA's chalk and concrete and in the copy, not in the PRO card's face.",
      "A slanted Latin name next to an upright Arabic one makes the two language versions look slightly different, and the stat labels inside the roots stay small (about 7.5px on a 360px card).",
    ],
    gridWidth: 330,
    detailWidth: 560,
    full,
    token,
    row,
    share,
    mount,
  };
  MC.register(c);
})();
