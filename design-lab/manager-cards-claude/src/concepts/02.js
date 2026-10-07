/* 02 TIR — the shot.
   BotolaGO's own ball in flight, made into one object: a white score-plate ball that
   carries the OVR, and the trail it leaves, drawn from the four decisions. The geometry
   is the GO mark's grammar (ball + two swooshes), redrawn — never the logo file.
   viewBox 0 0 400 150. The comet never mirrors: the ball always flies to the right. */
(function () {
  const MC = window.MC;
  const PFX = "c02";
  const r2 = (n) => Math.round(n * 100) / 100;
  const P = (p) => `${r2(p[0])} ${r2(p[1])}`;
  const esc = MC.esc;

  /* ---------- measuring: fonts are loaded before render; estimate if canvas is missing ---------- */
  let ctx2d = null;
  function textW(str, font, px) {
    try {
      ctx2d = ctx2d || document.createElement("canvas").getContext("2d");
      ctx2d.font = font.replace("{px}", "100px");
      return (ctx2d.measureText(str).width * px) / 100;
    } catch (e) {
      return String(str).length * px * 0.62;
    }
  }
  const fit = (str, font, px, maxW, min) => {
    const w = textW(str, font, px);
    return w > maxW ? Math.max(min, (px * maxW) / w) : px;
  };

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

  /* ---------- the comet (full card) ---------- */
  const BALL = { cx: 330, cy: 78, r: 68 };
  const TOP = [[4, 112], [140, 52], [288.5, 24.5]];
  const BOT = [[4, 116], [150, 134], [300, 138]];
  const BODY = "M4 112Q140 52 288.5 24.5L330 78L300 138Q150 134 4 116A2 2 0 0 1 4 112Z";
  const ARC = [[92, 64], [201, 21], [306, 6]];
  const CRESCENT = ribbon(ARC, (t) => 15 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7));
  // HOMA: a concrete slab under the whole drawing (the smear), roughened by a filter.
  const SLAB = "M0 115Q150 -6 313 13L330 78L301 140Q150 139 0 119Z";
  const ROOT_X = 152;
  const LANES = [68, 85, 102, 119];
  const TIP = [4, 114];
  const STAT_ORDER = ["CAP", "SEL", "TRF", "CON"];

  function bladeGeo(i, v, rootX = ROOT_X, lanes = LANES, tip = TIP, full = 146) {
    const y0 = lanes[i];
    const dx = tip[0] - rootX;
    const dy = tip[1] - y0;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    return { x0: rootX, y0, ux, uy, nx: -uy, ny: ux, L: (v / 100) * full, ang: (Math.atan2(-uy, -ux) * 180) / Math.PI };
  }
  function bladePath(g, T0 = 13, T1 = 1, k = 0.6, n = 26) {
    const A = [];
    const B = [];
    for (let i = 0; i <= n; i++) {
      const s = (g.L * i) / n;
      const th = T1 + (T0 - T1) * Math.pow(1 - s / g.L, k);
      const cx = g.x0 + g.ux * s;
      const cy = g.y0 + g.uy * s;
      A.push([cx + (g.nx * th) / 2, cy + (g.ny * th) / 2]);
      B.push([cx - (g.nx * th) / 2, cy - (g.ny * th) / 2]);
    }
    return "M" + A.map(P).join("L") + "L" + B.reverse().map(P).join("L") + "Z";
  }
  const bestStat = (p) => STAT_ORDER.reduce((a, k) => (p.stats[k] > p.stats[a] ? k : a), STAT_ORDER[0]);

  /* ---------- defs (only what a tier uses) ---------- */
  function defs(id, tier, opts = {}) {
    let d = "";
    d += `<clipPath id="${id}-cb"><circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r}"/></clipPath>`;
    d += `<clipPath id="${id}-cy"><path d="${BODY}"/></clipPath>`;
    d += `<path id="${id}-arc" d="${qPath(ARC)}" fill="none"/>`;
    d += `<filter id="${id}-blur" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>`;
    // Print grain: white and dark speckles, used at low opacity over any material.
    d +=
      `<filter id="${id}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="2" seed="7" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 4 0 0 0 -2.15" result="w"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0.05 0 0 0 0 0.16 -4 0 0 0 1.85" result="k"/>` +
      `<feMerge><feMergeNode in="k"/><feMergeNode in="w"/></feMerge></filter>`;
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
    if (tier === "PRO" || tier === "STADE" || tier === "LEGEND") {
      d +=
        `<linearGradient id="${id}-gnavy" gradientUnits="userSpaceOnUse" x1="4" y1="114" x2="300" y2="78">` +
        (tier === "LEGEND"
          ? `<stop offset="0" stop-color="#001C49"/><stop offset="1" stop-color="#001C49"/>`
          : `<stop offset="0" stop-color="#001C49"/><stop offset="0.45" stop-color="#062550"/><stop offset="1" stop-color="#0C3164"/>`) +
        `</linearGradient>`;
    }
    if (tier === "STADE") {
      // Brushed paint: long streaks along the flight.
      d +=
        `<filter id="${id}-paint" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="3" seed="4" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 3.4 0 0 0 -1.75" result="w"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0.03 0 0 0 0 0.12 -3.4 0 0 0 1.55" result="k"/>` +
        `<feMerge><feMergeNode in="k"/><feMergeNode in="w"/></feMerge></filter>`;
    }
    if (tier === "CHAMPION") {
      d +=
        `<linearGradient id="${id}-galu" gradientUnits="userSpaceOnUse" x1="150" y1="40" x2="166" y2="138">` +
        `<stop offset="0" stop-color="#F3F5F7"/><stop offset="0.3" stop-color="#D7DCE2"/><stop offset="0.66" stop-color="#ACB4BE"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>` +
        `<filter id="${id}-brush" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.0035 0.75" numOctaves="2" seed="9" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 3.2 0 0 0 -1.5" result="w"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.1 0 0 0 0 0.12 0 0 0 0 0.16 -3.2 0 0 0 1.62" result="k"/>` +
        `<feMerge><feMergeNode in="k"/><feMergeNode in="w"/></feMerge></filter>` +
        `<linearGradient id="${id}-gsweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="${id}-ggroove" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E6773"/><stop offset="1" stop-color="#9AA3AE"/></linearGradient>` +
        `<linearGradient id="${id}-grim" x1="0.15" y1="0.05" x2="0.85" y2="0.95"><stop offset="0" stop-color="#FAFBFC"/><stop offset="0.35" stop-color="#C3CAD2"/><stop offset="0.7" stop-color="#8F98A3"/><stop offset="1" stop-color="#DCE1E6"/></linearGradient>`;
    }
    if (tier === "HOMA") {
      d +=
        `<filter id="${id}-rough" x="-4%" y="-12%" width="108%" height="124%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" seed="3" result="t"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        `<filter id="${id}-concrete" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="4" seed="12" result="a"/>` +
        `<feColorMatrix in="a" type="matrix" values="0 0 0 0 0.85 0 0 0 0 0.87 0 0 0 0 0.9 2.6 0 0 0 -1.25" result="lt"/>` +
        `<feColorMatrix in="a" type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.09 0 0 0 0 0.1 -2.6 0 0 0 1.2" result="dk"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="2" result="f"/>` +
        `<feColorMatrix in="f" type="matrix" values="0 0 0 0 0.9 0 0 0 0 0.92 0 0 0 0 0.95 5 0 0 0 -3.1" result="sp"/>` +
        `<feMerge><feMergeNode in="dk"/><feMergeNode in="lt"/><feMergeNode in="sp"/></feMerge></filter>` +
        `<filter id="${id}-chalk" x="-6%" y="-30%" width="112%" height="160%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.85 0.35" numOctaves="2" seed="11" result="t"/>` +
        `<feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3.2 0 0 0 2.35" result="m"/>` +
        `<feComposite in="SourceGraphic" in2="m" operator="in" result="c"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="5" result="t2"/>` +
        `<feDisplacementMap in="c" in2="t2" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        `<filter id="${id}-scuff" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="4" seed="21" result="t"/>` +
        `<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.6 0 0 0 0 0.63 0 0 0 0 0.68 7 0 0 0 -3.85"/></filter>`;
    }
    if (tier === "LEGEND") {
      d +=
        `<filter id="${id}-feather" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>` +
        `<filter id="${id}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
        `<radialGradient id="${id}-gflood" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#EAF6FF" stop-opacity="0.85"/><stop offset="0.45" stop-color="#9FE9F7" stop-opacity="0.32"/><stop offset="1" stop-color="#73EDFA" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${id}-glball" cx="0.42" cy="0.34" r="0.72"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#F1FAFF"/><stop offset="0.9" stop-color="#C9EEF8"/><stop offset="1" stop-color="#9FE3F2"/></radialGradient>` +
        `<linearGradient id="${id}-gflare" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#73EDFA" stop-opacity="0"/><stop offset="0.5" stop-color="#F4FBFF" stop-opacity="0.95"/><stop offset="1" stop-color="#73EDFA" stop-opacity="0"/></linearGradient>`;
    }
    if (opts.extra) d += opts.extra;
    return `<defs>${d}</defs>`;
  }

  /* ---------- the ball ---------- */
  function ballSeams(tier, founder) {
    // Four partial pentagons near the rim, linked by seams around the score panel.
    const ring = [-18, 54, 126, 198].map((a) => {
      const rad = (a * Math.PI) / 180;
      return { a, c: [BALL.cx + 58 * Math.cos(rad), BALL.cy + 58 * Math.sin(rad)] };
    });
    const top = { a: -90, c: [330, 26], R: 14 };
    const all = [top, ...ring.map((r) => ({ ...r, R: 14 }))];
    const verts = all.map((q) => pent(q.c[0], q.c[1], q.R, q.a));
    let d = "";
    verts.forEach((v, i) => {
      if (i === 0) return; // the top panel is drawn by the founder / panel layer
      d += "M" + v.map(P).join("L") + "Z";
    });
    // seams between neighbours (closest vertex pairs)
    const order = [0, 1, 2, 3, 4];
    order.forEach((i) => {
      const j = (i + 1) % 5;
      let best = null;
      verts[i].forEach((a) =>
        verts[j].forEach((b) => {
          const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (!best || dd < best.d) best = { a, b, d: dd };
        }),
      );
      const m = [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2];
      const out = Math.hypot(m[0] - BALL.cx, m[1] - BALL.cy);
      const k = (out + 4) / out; // bow the seam outward like a hexagon edge
      const mm = [BALL.cx + (m[0] - BALL.cx) * k, BALL.cy + (m[1] - BALL.cy) * k];
      d += `M${P(best.a)}L${P(mm)}L${P(best.b)}`;
    });
    return d;
  }

  function ball(id, p, o, tier, opts = {}) {
    const S = MC.s(o);
    const { cx, cy, r } = BALL;
    const founder = !!p.founder;
    const seams = ballSeams(tier, founder);
    const topPent = pent(330, 26, 14).map(P).join(" ");
    let g = "";
    // lift shadow: the ball is the object in flight
    if (tier !== "LEGEND") g += `<ellipse class="c02-lift" cx="${cx + 4}" cy="${cy + r + 2}" rx="48" ry="5" filter="url(#${id}-blur)"/>`;
    if (tier === "LEGEND") {
      g += `<circle cx="${cx}" cy="${cy}" r="96" fill="url(#${id}-gflood)" class="c02-flood"/>`;
      g += `<rect x="${cx - 78}" y="${cy + r + 1}" width="156" height="2.4" rx="1.2" fill="url(#${id}-gflare)" filter="url(#${id}-glow)"/>`;
    }
    g += `<g class="c02-ballg">`;
    g += `<g class="c02-ball-front">`;
    if (tier === "HOMA") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" class="c02-ball-homa"/>`;
      g += `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" filter="url(#${id}-scuff)" clip-path="url(#${id}-cb)" opacity="0.9"/>`;
      g += `<circle cx="${cx}" cy="${cy + 30}" r="${r}" class="c02-ball-dirt" clip-path="url(#${id}-cb)"/>`;
    } else if (tier === "LEGEND") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-glball)"/>`;
    } else if (tier === "STADE") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" class="c02-ball-flat"/>`;
    } else {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-gball)"/>`;
    }
    // panels and seams
    if (tier === "STADE") {
      g += `<g clip-path="url(#${id}-cb)"><path d="${seams}" class="c02-seam-print"/></g>`;
    } else if (tier === "PRO" || tier === "CHAMPION") {
      g +=
        `<g clip-path="url(#${id}-cb)" fill="none" stroke-linejoin="round" stroke-width="1.15">` +
        `<path d="${seams}" class="c02-seam-hi" transform="translate(0.6 0.6)"/>` +
        `<path d="${seams}" class="c02-seam"/></g>`;
    } else if (tier === "LEGEND") {
      const ringP = [-18, 54, 126, 198]
        .map((a) => {
          const rad = (a * Math.PI) / 180;
          return "M" + pent(cx + 58 * Math.cos(rad), cy + 58 * Math.sin(rad), 14, a).map(P).join("L") + "Z";
        })
        .join("");
      g +=
        `<g clip-path="url(#${id}-cb)"><path d="${ringP}" fill="#DDF6FC"/>` +
        `<path d="${seams}" fill="none" stroke="#7FDDF0" stroke-width="1.1" stroke-linejoin="round"/></g>`;
    }
    if (tier === "CHAMPION") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 1.4}" fill="none" stroke="url(#${id}-grim)" stroke-width="3.2"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 3.2}" fill="none" stroke="#7D8691" stroke-width="0.5" opacity="0.7"/>`;
    }
    if (tier === "LEGEND") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.6}" fill="none" stroke="#73EDFA" stroke-width="1.4" filter="url(#${id}-glow)"/>`;
    } else {
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" class="c02-ring" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    // the top panel: founders carry a struck enamel pentagon; others a debossed outline
    if (founder) {
      g += `<polygon points="${topPent}" fill="#0151FC" filter="url(#${id}-strike)" class="c02-founder"/>`;
      const v = pent(330, 26, 14);
      g += `<path d="M${P(v[3])}L${P(v[4])}L${P(v[0])}" fill="none" stroke="#3D7BFF" stroke-width="0.8" stroke-linejoin="round"/>`;
      g += `<path d="M${P(v[0])}L${P(v[1])}L${P(v[2])}L${P(v[3])}" fill="none" stroke="#0039B8" stroke-width="0.8" stroke-linejoin="round"/>`;
      g += `<text x="330" y="30.3" text-anchor="middle" font-size="12" class="c02-t-num c02-founder-26">${String(p.founder).slice(-2)}</text>`;
    } else if (tier !== "HOMA") {
      g +=
        `<polygon points="${topPent}" fill="none" class="c02-seam-hi" stroke-width="1.15" transform="translate(0.6 0.6)"/>` +
        `<polygon points="${topPent}" fill="none" class="c02-seam" stroke-width="1.15"/>`;
    }
    // the rating: Tunnel Navy on the plate, centred in a fixed slot
    const ovrSize = opts.ovrSize || 60;
    g += `<text x="${cx}" y="${opts.ovrY || 96}" text-anchor="middle" font-size="${ovrSize}" class="c02-t-num c02-ovr" direction="ltr">${p.ovr}</text>`;
    if (!opts.noUnit) g += `<text x="${cx + 0.45}" y="114" text-anchor="middle" font-size="9" class="c02-t-lab c02-unit" direction="ltr">${esc(S.ovr)}</text>`;
    g += `</g>`;
    // the back of the ball (long-press): where the provenance lives
    if (opts.back) {
      g +=
        `<g class="c02-ball-back" aria-hidden="true">` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#001C49"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r - 5}" fill="none" stroke="#0151FC" stroke-width="1.2"/>` +
        (founder ? `<polygon points="${pent(330, 40, 11).map(P).join(" ")}" fill="#0151FC"/>` : "") +
        `<text x="${cx}" y="${founder ? 76 : 70}" text-anchor="middle" font-size="${MC.isAr(o) ? 12 : 11}" class="${MC.isAr(o) ? "c02-t-ar" : "c02-t-lab"} c02-back-l1">${esc(founder ? S.founderLine : S.manager)}</text>` +
        `<text x="${cx}" y="${founder ? 94 : 88}" text-anchor="middle" font-size="9" class="c02-t-meta c02-back-l2" direction="ltr">${esc(p.id)}</text>` +
        `<text x="${cx}" y="${founder ? 107 : 101}" text-anchor="middle" font-size="9" class="c02-t-meta c02-back-l2" direction="ltr">${esc(p.season)}</text>` +
        `</g>`;
    }
    g += `</g>`;
    return g;
  }

  /* ---------- the trail ---------- */
  function statLayer(id, p, o, tier, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const best = bestStat(p);
    let g = `<g class="c02-blades">`;
    let labels = "";
    STAT_ORDER.forEach((k, i) => {
      const v = p.stats[k];
      const geo = bladeGeo(i, v);
      const isBest = k === best;
      if (tier === "LEGEND") {
        const beam = bladePath(geo, 1.6, 0.4, 0.9, 16);
        g += `<path d="${beam}" class="c02-beam${isBest ? " is-best" : ""}" filter="url(#${id}-glow)"/>`;
      } else {
        const path = bladePath(geo);
        if (tier === "HOMA") g += `<path d="${path}" class="c02-blade c02-blade-chalk${isBest ? " is-best" : ""}" filter="url(#${id}-chalk)"/>`;
        else if (tier === "CHAMPION")
          g +=
            `<path d="${path}" fill="#FFFFFF" opacity="0.85" transform="translate(0 0.7)"/>` +
            `<path d="${path}" class="c02-blade" fill="${isBest ? "#0151FC" : `url(#${id}-ggroove)`}"${isBest ? ` filter="url(#${id}-strike)"` : ""}/>`;
        else g += `<path d="${path}" class="c02-blade c02-blade-${tier.toLowerCase()}${isBest ? " is-best" : ""}"/>`;
      }
      if (opts.labels === false) return;
      // label + value sit inside the root, along the blade
      const lab = S.stats[k];
      const valX = -3.2;
      const labX = valX - 13.6;
      const onBeam = tier === "LEGEND";
      const y = onBeam ? -2.6 : 3.2;
      const cls = `c02-slab c02-slab-${tier.toLowerCase()}${isBest ? " is-best" : ""}`;
      const engrave = tier === "CHAMPION" && !isBest;
      const valT = `<text x="${valX}" y="${y}" text-anchor="end" font-size="9.5" class="c02-t-lab c02-sval" direction="ltr">${v}</text>`;
      const labT = ar
        ? `<text x="${labX}" y="${y + 0.2}" text-anchor="end" font-size="8.4" class="c02-t-ar c02-slab-t">${esc(lab)}</text>`
        : `<text x="${labX}" y="${y}" text-anchor="end" font-size="8" class="c02-t-lab c02-slab-t c02-track">${esc(lab)}</text>`;
      labels +=
        `<g class="${cls}" transform="translate(${r2(geo.x0)} ${r2(geo.y0)}) rotate(${r2(geo.ang)})">` +
        (engrave ? `<g class="c02-engrave-hi" transform="translate(0 0.55)">${valT}${labT}</g>` : "") +
        `${valT}${labT}</g>`;
    });
    g += `</g>`;
    return g + labels;
  }

  function crescentLayer(id, p, o, tier, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    let g = "";
    if (tier === "PRO" || tier === "CHAMPION") {
      g += `<path d="${CRESCENT}" fill="#0151FC" class="c02-crescent"${tier === "CHAMPION" ? ` filter="url(#${id}-strike)"` : ""}/>`;
      g += `<g clip-path="url(#${id}-ccr)"><path d="${qPath(ARC)}" transform="translate(0.4 -4.6)" fill="none" stroke="#5C93FF" stroke-width="1.6" opacity="0.85"/></g>`;
    } else if (tier === "LEGEND") {
      g += `<path d="${CRESCENT}" fill="#0151FC" filter="url(#${id}-glow)"/>`;
      g += `<path d="${qPath(ARC)}" fill="none" stroke="#9BDBFD" stroke-width="1.2" opacity="0.9" clip-path="url(#${id}-ccr)"/>`;
    } else if (tier === "HOMA") {
      // a chalk swoosh drawn under the words, on the slab
      g += `<path d="${qPath([[96, 72], [204, 30], [304, 16]])}" fill="none" class="c02-chalkline" stroke-width="2.2" stroke-linecap="round" filter="url(#${id}-chalk)"/>`;
    }
    if (opts.text === false) return g;
    // words on the swoosh: country, then the founder line leading into the struck pentagon
    const cls = `c02-arc-t c02-arc-${tier.toLowerCase()}`;
    const fs = 7.4;
    const run = (txt, off, arabic) =>
      arabic
        ? `<text font-size="${fs + 0.4}" dy="2.1" text-anchor="middle" class="c02-t-ar ${cls}"><textPath href="#${id}-arc" startOffset="${off}%">${esc(txt)}</textPath></text>`
        : `<text font-size="${fs}" dy="2.65" text-anchor="middle" class="c02-t-lab c02-track ${cls}" direction="ltr"><textPath href="#${id}-arc" startOffset="${off}%">${esc(txt)}</textPath></text>`;
    if (ar) {
      g += run(S.country, 30, true);
      if (p.founder) {
        g += run(String(p.founder), 57, false);
        g += run(S.founder, 74, true);
      }
    } else {
      g += run(S.country, p.founder ? 32 : 48, false);
      if (p.founder) g += run(S.founderLine, 68, false);
    }
    return g;
  }

  function avatarLayer(id, tier, ar) {
    const box = { x: 228, y: 92, w: 46, h: 55.2 };
    const fig = (o) => MC.avatar({ ...box, ...o });
    const all = (c) => ({ torso: c, seam: c, collar: c, neck: c, skin: c, hair: c });
    if (tier === "HOMA") {
      return `<g filter="url(#${id}-chalk)" opacity="0.92">${fig({ ...all("none"), seam: "#C9CFD8", stroke: "#D5DAE0", strokeWidth: 5 })}</g>`;
    }
    if (tier === "STADE") {
      return `<g clip-path="url(#${id}-cy)">${fig({ ...all("#173C74"), seam: "#0C3164" })}</g>`;
    }
    if (tier === "CHAMPION") {
      return (
        `<g clip-path="url(#${id}-cy)">` +
        `<g transform="translate(0.5 0.6)">${fig({ ...all("none"), seam: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: 3.2 })}</g>` +
        `${fig({ ...all("none"), seam: "#4A525C", stroke: "#4A525C", strokeWidth: 3.2 })}</g>`
      );
    }
    if (tier === "LEGEND") {
      return `<g>${fig({ ...all("#001C49"), seam: "#0C3164", rim: "#73EDFA" })}</g>`;
    }
    // PRO: blind emboss — relief only, no ink
    return (
      `<g clip-path="url(#${id}-cy)">` +
      `<g transform="translate(-0.8 -0.8)" opacity="0.6">${fig(all("#2A5A9E"))}</g>` +
      `<g transform="translate(0.8 0.8)">${fig(all("#00102E"))}</g>` +
      `${fig({ ...all("#0A2D5E"), seam: "#06224B", stroke: "#08285A", strokeWidth: 2.4 })}</g>`
    );
  }

  function nameZone(id, p, o, tier) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const name = MC.nameOf(p, o);
    const tcls = `c02-nz c02-nz-${tier.toLowerCase()}`;
    let g = `<g class="${tcls}">`;
    if (ar) {
      const fs = fit(name, '800 {px} "Changa"', 34, 62, 18);
      const right = 222;
      const engrave = tier === "CHAMPION";
      const nm = (cls, dy = 0) => `<text x="${right}" y="${84 + dy}" text-anchor="end" font-size="${r2(fs)}" class="c02-t-arname ${cls}" direction="rtl">${esc(name)}</text>`;
      g += (engrave ? `<g transform="translate(0 0.8)">${nm("c02-name-hi")}</g>` : "") + nm("c02-name");
      g += `<text x="${right}" y="107" text-anchor="end" font-size="10.5" class="c02-t-ar c02-tier" direction="rtl">${esc(S.tiers[tier])}</text>`;
      g += `<text x="${right}" y="118.5" text-anchor="end" font-size="8.6" class="c02-t-meta c02-meta" direction="ltr">${esc(p.season)}</text>`;
      g += `<text x="${right}" y="129" text-anchor="end" font-size="8.6" class="c02-t-meta c02-meta" direction="ltr">${esc(p.id)}</text>`;
    } else {
      const fs = fit(name, '800 {px} "Changa"', 36, 92, 17);
      const engrave = tier === "CHAMPION";
      const nm = (cls) => `<text x="0" y="0" font-size="${r2(fs)}" class="c02-t-name ${cls}" direction="ltr">${esc(name)}</text>`;
      g +=
        `<g transform="translate(159 ${r2(90 - (36 - fs) * 0.18)}) skewX(-11.3)">` +
        (engrave ? `<g transform="translate(0 0.8)">${nm("c02-name-hi")}</g>` : "") +
        nm("c02-name") +
        `</g>`;
      g += `<text x="159" y="103.5" font-size="10.5" class="c02-t-lab c02-track c02-tier" direction="ltr">${esc(S.tiers[tier])}</text>`;
      g += `<text x="159" y="115" font-size="8.6" class="c02-t-meta c02-meta" direction="ltr">${esc(p.season)}</text>`;
      g += `<text x="159" y="125.5" font-size="8.6" class="c02-t-meta c02-meta" direction="ltr">${esc(p.id)}</text>`;
    }
    return g + `</g>`;
  }

  /** Body / material of the trail for a tier. */
  function trailBody(id, tier) {
    if (tier === "HOMA") {
      return (
        `<g filter="url(#${id}-rough)" class="c02-slab-g">` +
        `<path d="${SLAB}" class="c02-concrete"/>` +
        `<g clip-path="url(#${id}-cs)"><rect x="0" y="0" width="330" height="150" filter="url(#${id}-concrete)" opacity="0.55"/></g>` +
        `</g>`
      );
    }
    if (tier === "STADE") {
      return (
        `<path d="${BODY}" fill="#0C3164" class="c02-body"/>` +
        `<g clip-path="url(#${id}-cy)"><rect x="0" y="0" width="330" height="150" filter="url(#${id}-paint)" opacity="0.2" transform="rotate(-9 160 80)"/></g>` +
        `<path d="${BODY}" fill="none" class="c02-rim" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      );
    }
    if (tier === "CHAMPION") {
      return (
        `<path d="${BODY}" fill="url(#${id}-galu)"/>` +
        `<g clip-path="url(#${id}-cy)">` +
        `<rect x="-20" y="-30" width="360" height="200" filter="url(#${id}-brush)" opacity="0.5" transform="rotate(-11 160 80)"/>` +
        `<g class="c02-sweep"><rect x="150" y="-40" width="58" height="230" fill="url(#${id}-gsweep)" transform="rotate(24 179 75)"/></g>` +
        `<path d="${qPath(TOP)}" fill="none" stroke="#FFFFFF" stroke-width="3"/>` +
        `<path d="${qPath(BOT)}" fill="none" stroke="#6E7782" stroke-width="2" opacity="0.8"/>` +
        `</g>` +
        `<path d="${BODY}" fill="none" class="c02-alu-edge" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      );
    }
    if (tier === "LEGEND") {
      // the trail turns into light: a feathered night patch, the pitch, and 14 dots
      let stripes = "";
      for (let i = -6; i <= 14; i++) {
        const x0 = 150 + i * 34;
        stripes += i % 2 ? `<path d="M${r2(x0)} 150L${r2(x0 + 34)} 150L${r2(150 + (x0 - 150) * 0.12 + 4)} -10L${r2(150 + (x0 - 150) * 0.12)} -10Z"/>` : "";
      }
      let dots = "";
      for (let i = 0; i < 14; i++) {
        const f = i / 13;
        const t = 0.03 + 0.86 * Math.pow(f, 0.82);
        const c = qOffset(TOP, t, 7.5 + 2.5 * f);
        const rr = 2 + 6.6 * Math.pow(f, 1.15);
        dots +=
          `<g class="c02-dot" style="--i:${i}"><circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr * 1.9)}" fill="#73EDFA" opacity="0.32" filter="url(#${id}-glow)"/>` +
          `<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rr)}" fill="#F4FBFF"/></g>`;
      }
      return (
        `<g class="c02-night"><path d="${BODY}" fill="#001C49" filter="url(#${id}-feather)" opacity="0.96"/>` +
        `<circle cx="${BALL.cx}" cy="${BALL.cy}" r="78" fill="#001C49" filter="url(#${id}-feather)" opacity="0.96"/></g>` +
        `<path d="${BODY}" fill="#001C49" opacity="0.7"/>` +
        `<g clip-path="url(#${id}-cy)" fill="hsl(214 90% 55% / .13)">${stripes}</g>` +
        dots
      );
    }
    // PRO: Floodlight Navy fading to Tunnel Navy at the tip, printed grain, a lit top edge
    return (
      `<path d="${BODY}" fill="url(#${id}-gnavy)" class="c02-body"/>` +
      `<g clip-path="url(#${id}-cy)">` +
      `<rect x="0" y="0" width="330" height="150" filter="url(#${id}-grain)" opacity="0.16"/>` +
      `<path d="${qPath(TOP)}" fill="none" stroke="#2A5A9E" stroke-width="2.6" opacity="0.75"/>` +
      `<path d="${qPath(BOT)}" fill="none" stroke="#000A1E" stroke-width="3" opacity="0.5"/>` +
      `</g>` +
      `<path d="${BODY}" fill="none" class="c02-rim" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    );
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid(PFX);
    const tier = p.tier;
    const thumb = !!o.thumb;
    const extra =
      `<clipPath id="${id}-ccr"><path d="${CRESCENT}"/></clipPath>` + (tier === "HOMA" ? `<clipPath id="${id}-cs"><path d="${SLAB}"/></clipPath>` : "");
    let svg = defs(id, tier, { extra });
    svg += `<g class="c02-trail">${trailBody(id, tier)}`;
    svg += crescentLayer(id, p, o, tier, { text: !thumb });
    svg += statLayer(id, p, o, tier, { labels: !thumb });
    if (!thumb) svg += avatarLayer(id, tier, ar) + nameZone(id, p, o, tier);
    svg += `</g>`;
    svg += ball(id, p, o, tier, { noUnit: thumb, back: !thumb });
    const cls = `c02 c02-card c02--${tier.toLowerCase()}${o.motion ? " c02--motion" : ""}${thumb ? " c02--thumb" : ""}`;
    return (
      `<div class="${cls}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier}">` +
      `<svg class="c02-svg" viewBox="0 0 400 150" aria-hidden="true" focusable="false">${svg}</svg></div>`
    );
  }

  /* ---------- token: 44–80px (comet) and 24–32px (ball + tier stubs) ---------- */
  const TK = {
    vb: [176, 96],
    ball: [128, 48, 44],
    body: "M4 66Q52 34 99.7 14.3L128 48L102.8 84Q56 82 4 70A2 2 0 0 1 4 66Z",
    arc: [[22, 42], [62, 10], [111, 2.5]],
  };
  const TK_CRESCENT = ribbon(TK.arc, (t) => 8.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7), 30);
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
    if (inverted) {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#001C49"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" stroke="#73EDFA" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`;
    } else if (tier === "LEGEND") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r * 1.32}" fill="url(#${id}-gflood)"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-glball)"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.6}" fill="none" stroke="#73EDFA" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
    } else if (tier === "HOMA") {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" class="c02-ball-homa"/>`;
      if (!mini) g += `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" filter="url(#${id}-scuff)" clip-path="url(#${id}-tb)" opacity="0.8"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" class="c02-ring" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    } else {
      g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-gball)"/>`;
      if (tier === "CHAMPION" && !mini) g += `<circle cx="${cx}" cy="${cy}" r="${r - 1.6}" fill="none" stroke="#9AA3AE" stroke-width="3.2"/>`;
      g += `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="none" class="c02-ring" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    if (p.founder) {
      const R = mini ? 11.5 : 9;
      const pc = [cx, cy - r + R + (mini ? 1.5 : 2.2)];
      g += `<polygon points="${pent(pc[0], pc[1], R).map(P).join(" ")}" fill="${inverted ? "#3D7BFF" : "#0151FC"}"/>`;
    }
    g += `<text x="${cx}" y="${r2(cy + fsz * 0.33)}" text-anchor="middle" font-size="${fsz}" class="c02-t-num ${inverted ? "c02-ovr-inv" : "c02-ovr"}" direction="ltr">${p.ovr}</text>`;
    return g;
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = o.mini || size <= 32;
    const id = MC.uid(PFX);
    const tier = p.tier;
    const t = tier.toLowerCase();
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${MC.s(o).tiers[tier]}${p.founder ? ", " + MC.s(o).founderLine : ""}`;
    let d = "";
    let g = "";
    if (mini) {
      const [cx, cy, r] = MN.ball;
      d +=
        `<radialGradient id="${id}-gball" cx="0.4" cy="0.3" r="0.78"><stop offset="0" class="c02-s-ballhi"/><stop offset="0.62" class="c02-s-ball"/><stop offset="1" class="c02-s-balllo"/></radialGradient>` +
        `<linearGradient id="${id}-galu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3F5F7"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>`;
      if (tier === "STADE" || tier === "PRO" || tier === "CHAMPION") {
        const fill = tier === "CHAMPION" ? `url(#${id}-galu)` : "#0C3164";
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
    d +=
      `<clipPath id="${id}-tb"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
      `<clipPath id="${id}-tbody"><path d="${TK.body}"/></clipPath>` +
      `<radialGradient id="${id}-gball" cx="0.4" cy="0.3" r="0.78"><stop offset="0" class="c02-s-ballhi"/><stop offset="0.62" class="c02-s-ball"/><stop offset="1" class="c02-s-balllo"/></radialGradient>`;
    if (tier === "PRO")
      d += `<linearGradient id="${id}-gnavy" gradientUnits="userSpaceOnUse" x1="4" y1="68" x2="110" y2="48"><stop offset="0" stop-color="#001C49"/><stop offset="1" stop-color="#0C3164"/></linearGradient>`;
    if (tier === "CHAMPION")
      d += `<linearGradient id="${id}-galu" gradientUnits="userSpaceOnUse" x1="60" y1="20" x2="66" y2="86"><stop offset="0" stop-color="#F3F5F7"/><stop offset="0.35" stop-color="#D7DCE2"/><stop offset="1" stop-color="#8F98A3"/></linearGradient>`;
    if (tier === "HOMA")
      d +=
        `<filter id="${id}-rough" x="-5%" y="-15%" width="110%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        `<filter id="${id}-scuff" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="21" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.6 0 0 0 0 0.63 0 0 0 0 0.68 7 0 0 0 -3.85"/></filter>`;
    if (tier === "LEGEND")
      d +=
        `<radialGradient id="${id}-gflood" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#9FE9F7" stop-opacity="0.55"/><stop offset="1" stop-color="#73EDFA" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${id}-glball" cx="0.42" cy="0.34" r="0.72"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#EEF9FF"/><stop offset="1" stop-color="#A9E6F4"/></radialGradient>`;
    // trail
    if (tier === "HOMA") {
      g += `<path d="M2 70Q60 6 112 4L128 48L104 88Q50 86 2 74Z" class="c02-concrete" filter="url(#${id}-rough)"/>`;
      g += [0, 1, 2]
        .map((i) => `<path d="M${30 + i * 4} ${58 + i * 7}L94 ${34 + i * 14}" class="c02-chalkline" stroke-width="${3 - i * 0.6}" stroke-linecap="round" fill="none" opacity="0.85"/>`)
        .join("");
    } else if (tier === "LEGEND") {
      g += `<path d="${TK.body}" fill="#001C49"/><path d="${TK.body}" fill="none" class="c02-rim" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      for (let i = 0; i < 6; i++) {
        const f = i / 5;
        const x = 12 + f * 78;
        const y = 64 - f * 30;
        const rr = 2.2 + f * 4.6;
        g += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(rr + 2.4)}" fill="#73EDFA" opacity="0.28"/><circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(rr)}" fill="#F4FBFF"/>`;
      }
    } else {
      const fill = tier === "CHAMPION" ? `url(#${id}-galu)` : tier === "PRO" ? `url(#${id}-gnavy)` : "#0C3164";
      g += `<path d="${TK.body}" fill="${fill}"/>`;
      if (tier === "CHAMPION") g += `<path d="M4 66Q52 34 99.7 14.3" fill="none" stroke="#fff" stroke-width="2.4" clip-path="url(#${id}-tbody)"/>`;
      if (rich) {
        const best = bestStat(p);
        STAT_ORDER.forEach((k, i) => {
          const geo = bladeGeo(i, p.stats[k], 92, [34, 46, 58, 70], [4, 68], 96);
          const col = tier === "CHAMPION" ? (k === best ? "#0151FC" : "#6E7782") : k === best ? "#FFFFFF" : "#B6C1D1";
          g += `<path d="${bladePath(geo, 7, 0.8, 0.6, 14)}" fill="${col}"/>`;
        });
      }
      g += `<path d="${TK.body}" fill="none" class="${tier === "CHAMPION" ? "c02-alu-edge" : "c02-rim"}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    if (tier === "PRO" || tier === "CHAMPION" || tier === "LEGEND") g += `<path d="${TK_CRESCENT}" fill="#0151FC"/>`;
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
      `<span class="c02-row-who"><b>${esc(name)}</b><small>${esc(S.tiers[p.tier])}${p.founder ? `<i class="c02-row-f" aria-label="${esc(S.founderLine)}"></i>` : ""}</small></span>` +
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
    const B = [252, 200];
    const F = [62, 492];
    const ang = (Math.atan2(B[1] - F[1], B[0] - F[0]) * 180) / Math.PI;
    const local = (Math.atan2(BALL.cy - TIP[1], BALL.cx - TIP[0]) * 180) / Math.PI;
    const rot = r2(ang - local);
    const tr = `translate(${B[0]} ${B[1]}) rotate(${rot}) scale(${s}) translate(-${BALL.cx} -${BALL.cy})`;
    const tb = `translate(${B[0]} ${B[1]}) scale(${s}) translate(-${BALL.cx} -${BALL.cy})`;
    // pitch: perspective stripes converging on a vanishing point above the frame
    let stripes = "";
    const vp = [180, 120];
    for (let i = -9; i <= 9; i++) {
      if (i % 2 === 0) continue;
      const x0 = 180 + i * 46;
      const x1 = x0 + 46;
      stripes += `<path d="M${vp[0] + (x0 - 180) * 0.08} 300L${vp[0] + (x1 - 180) * 0.08} 300L${x1 * 1.6 - 108} 640L${x0 * 1.6 - 108} 640Z"/>`;
    }
    const extra =
      `<clipPath id="${id}-ccr"><path d="${CRESCENT}"/></clipPath>` +
      (tier === "HOMA" ? `<clipPath id="${id}-cs"><path d="${SLAB}"/></clipPath>` : "") +
      `<radialGradient id="${id}-gsky" cx="0.5" cy="0.18" r="0.9"><stop offset="0" stop-color="#0C3164"/><stop offset="0.55" stop-color="#001C49"/><stop offset="1" stop-color="#000C22"/></radialGradient>` +
      `<radialGradient id="${id}-glamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#F4FBFF" stop-opacity="0.95"/><stop offset="0.2" stop-color="#BFF3FB" stop-opacity="0.45"/><stop offset="1" stop-color="#73EDFA" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${id}-gbeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAF6FF" stop-opacity="0.22"/><stop offset="1" stop-color="#EAF6FF" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${id}-gfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000C22" stop-opacity="0"/><stop offset="1" stop-color="#000C22" stop-opacity="0.85"/></linearGradient>`;
    let svg = defs(id, tier, { extra });
    svg += `<rect width="360" height="640" fill="url(#${id}-gsky)"/>`;
    // floodlights: two lamps, two beams
    svg += `<path d="M30 30L-40 640L150 640Z" fill="url(#${id}-gbeam)"/><path d="M332 24L210 640L400 640Z" fill="url(#${id}-gbeam)"/>`;
    svg += `<circle cx="30" cy="30" r="70" fill="url(#${id}-glamp)"/><circle cx="332" cy="24" r="80" fill="url(#${id}-glamp)"/>`;
    svg += `<g fill="hsl(214 90% 55% / .13)">${stripes}</g>`;
    svg += `<path d="M-10 586L370 572" stroke="#EAF6FF" stroke-opacity="0.55" stroke-width="2"/>`;
    svg += `<rect y="430" width="360" height="210" fill="url(#${id}-gfade)"/>`;
    // the manager at the touchline, where the shot started
    svg += MC.avatar({ x: 28, y: 470, w: 92, h: 110, torso: "#000A1E", seam: "#0C3164", collar: "#000A1E", neck: "#000A1E", skin: "#000A1E", hair: "#000A1E", rim: "#73EDFA" });
    // the shot
    svg += `<g transform="${tr}">${trailBody(id, tier)}${crescentLayer(id, p, o, tier, { text: true })}${statLayer(id, p, o, tier)}</g>`;
    svg += `<g transform="${tb}">${ball(id, p, o, tier, {})}</g>`;
    const name = MC.nameOf(p, o);
    const nameHTML = ar
      ? `<b class="c02-sh-name c02-sh-name-ar">${esc(name)}</b>`
      : `<b class="c02-sh-name" style="font-size:${r2(fit(name, '800 {px} "Changa"', 92, 168, 40))}px">${esc(name)}</b>`;
    return (
      `<div class="c02 c02-share c02--${tier.toLowerCase()}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg class="c02-share-svg" viewBox="0 0 360 640" aria-hidden="true" focusable="false">${svg}</svg>` +
      `<div class="c02-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
      `<div class="c02-sh-who">${nameHTML}<span class="c02-sh-tier">${esc(S.tiers[tier])}</span></div>` +
      `<div class="c02-sh-foot"><b>@${esc(p.key || "ali")}</b><span>${MC.ltr(p.id)}</span><em>${ar ? "مثال" : "Exemple"}</em></div>` +
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
      "Tir is BotolaGO's own ball in flight. The GO mark is already a story — a ball with two swooshes trailing behind it — so the card takes that grammar and makes it the object: a white score-plate ball at the end, a navy trail behind it, and a thin Logo-Blue crescent above, the logo's second swoosh. There is no rectangle anywhere; the outline is a comet that reads as 'a shot' before a single word is read.",
      "The rating rides on the ball, in Tunnel Navy on a lit white plate, because the ball is the end of the flight and the brightest object on the card. The four decisions are the trail itself: four tapered streaks whose lengths are the values, rooted where the trail is thickest and converging toward the tip. It is a bar chart disguised as motion, with no track and no 100 mark, so it reads as speed, not as an XP bar.",
      "The name sits inside the trail, slanted at the wordmark's 11.3° in Latin and upright in Arabic. The shared manager figure is pressed into the trail as a blind emboss — relief without ink — standing just behind the ball, the manager inside his own shot.",
    ],
    belonging: [
      "Anyone can read a Tir card in one glance: the longer your streaks, the further your ball has flown. Two friends comparing cards compare the shape of their shots before they compare numbers.",
      "In the rankings your row literally flies: your own line is a trail that widens toward your ball, and the trail tells everyone your tier before they read it — chalk, paint, navy, aluminium, light.",
      "Founders carry a struck piece of the logo's own ball. Nobody can earn a 2026 strike later, and it is visible as a dark notch on the ball even at 24px in a comment thread.",
      "Older users respect it because it is calm and typographically serious; teenagers get the flex of a LEGEND ball that glows like the splash screen.",
    ],
    founderMark: [
      "The ball's top panel is a die-struck Logo-Blue enamel pentagon with '26' knocked out in white, lit by a specular bevel. It is a panel of the ball, not a sticker on the card: the object itself is different for founders.",
      "The swoosh above the ball carries the words FOUNDER 2026 straight into the pentagon, so the mark is explained without a chip or a badge.",
      "It never changes with tier — chalk ball or ball of light, the 2026 strike is the same. Non-founders keep a debossed empty panel; later cohorts would get their own year in a grey strike, so 2026 stays first in the series. At 24px it survives as a dark notch at the top of the ball.",
    ],
    small: [
      "44–80px: the token is the comet itself — the ball with the 84 in Changa 800, a tapered trail and the crescent arc. From 64px the four streaks show inside the trail; below that they merge into one solid trail.",
      "24–32px: the ball alone carries the 84, and the tier is told by what trails it — HOMA nothing, STADE one stub, PRO a stub and the crescent (the full logo grammar), CHAMPION the same plus a ring, LEGEND an inverted dark ball with three dots of light. The founder notch stays.",
      "The silhouette is a circle with a wedge: the most legible shape in the lab at 24px on both grounds, because a ball is the one shape a football app can own at that size.",
    ],
    rtl: [
      "The comet never mirrors: in the GO mark the ball always flies to the right, and the card keeps that rule in both languages.",
      "Everything typographic inside it does follow the language: علي is set upright in Changa 800 (never slanted), right-aligned in the name zone with the tier in Noto Sans Arabic and the season and ID kept left-to-right beneath it. Streak labels read right-to-left from the root with the value at the root, and the swoosh carries المغرب and عضو مؤسس as separate runs so the digits stay LTR.",
      "No letter-spacing anywhere in Arabic; Arabic lines get their own baselines so tall letters and descenders clear each other.",
    ],
    tiers: {
      HOMA: "A street shot: a scuffed grey ball with no panels, and the trail drawn in chalk on a rough concrete slab (turbulence texture, ragged displaced edge). The country is chalked along an arc. No crescent, no light, no motion. The outline is ball plus smear.",
      STADE: "The first painted swoosh: a crisp flat Floodlight-Navy wedge with brushed-paint grain, a clean white ball with printed seams and painted white streaks. The manager is a flat stencil. Still no crescent — the outline is ball plus wedge.",
      PRO: "The full logo grammar: Floodlight Navy fading to Tunnel Navy, printed grain and a lit top edge, the Logo-Blue crescent, a lit ball with debossed seams, and the manager as a blind emboss. A new piece of the silhouette arrives: the crescent.",
      CHAMPION: "The trail becomes a brushed-aluminium blade: anisotropic grain, a polished leading edge, a specular sweep that follows tilt, streaks engraved as grooves with the best decision inlaid in blue enamel, the name stamped, the manager engraved as a line, and a machined metal rim on the ball.",
      LEGEND: "The trail turns into light: the solid body is replaced by the splash screen's fourteen luminous dots over a feathered night patch with the pitch in it, the streaks become light beams, the ball glows under a floodlight halo with lit panels and a ground-line flare, and the manager is rim-lit. Fewer parts, more light.",
    },
    legend: [
      "The strike. The screen dims to Tunnel Navy; a contact frame squashes the ball for one beat; the ball flies to rest along the curve over 420ms, laying its fourteen-dot tail one dot at a time; the floodlight halo breathes once, and then everything is still. It never loops, and under reduced motion the finished state shows.",
      "It reuses the brand's own launch ceremony — floodlights, the night pitch, the ball with its light tail — so the highest tier feels like the app itself saying your name.",
    ],
    advantages: [
      "The strongest small-size silhouette of the set: a ball and a wedge hold at 24px on the light and the dark ground, and the tier stays readable there.",
      "Owned by the brand: the geometry comes from BotolaGO's own mark and splash, not from FUT, Sorare or a bank card, and the comet never needs a frame.",
      "The four stats become one readable graphic instead of four numbers in a row.",
      "Calm enough for adult Fantasy players; the tiers change material (chalk → paint → navy → aluminium → light), not just colour.",
      "The share image is a real poster: the shot rising over a night pitch from the manager at the touchline.",
    ],
    risks: [
      "It is built from the logo's flight geometry, so the owner may read it as altering the logo. It is a redrawn proposal and never uses the logo file, but this needs an explicit yes.",
      "A landscape object looks smaller than portrait cards in a portrait gallery and leaves empty space in a profile header; it wants a full-width slot.",
      "The streaks can still be misread as progress-to-100 bars by someone who does not know them; the taper and the missing track only reduce this.",
      "It is the least 'Moroccan street' of the set: the local layer lives in HOMA's chalk and concrete and in the copy, not in the PRO card's face.",
      "A slanted Latin name next to an upright Arabic one makes the two language versions look slightly different, and the stat labels inside the roots are small (about 8px on a 360px card).",
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
