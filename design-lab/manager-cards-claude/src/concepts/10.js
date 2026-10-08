/* 10 QUATRE OMBRES (wildcard).
   Under four floodlights every player casts four shadows. The X they make is constant: it is
   the BotolaGO mark, the same for everyone, made only of light. What is yours is the light:
   your four stats ride on the four lamp plates, your tier is how many of those lamps are crisp
   LED rather than sodium, and a founder has a fifth lamp and a fifth shadow.
   The full card is a landscape pitch panel, viewBox 0 0 420 240, never mirrored. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const f = (n) => Math.round(n * 100) / 100;
  /** Mixes two #rrggbb colours: t = 0 gives a, 1 gives b. */
  const mix = (a, b, t) => {
    const h = (c, i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
    return "#" + [0, 1, 2].map((i) => Math.round(h(a, i) + (h(b, i) - h(a, i)) * t).toString(16).padStart(2, "0")).join("");
  };

  const C = {
    night: "#0B1A33",
    deep: "#050D1C",
    tunnel: "#001C49",
    logo: "#0151FC",
    shadow: "#0C3164",
    figure: "#0C1F3D",
    seam: "#25426D",
    lens: "#F4FBFF",
    sodium: "#FFA23A",
    first: "#FFF1D2",
    steel: "#8F99A3",
    steelInk: "#14161A",
    meta: "#A9B2BE",
  };

  /* ---------- the lamps ---------- */
  // Clockwise from top-start. The stat on each plate and the order in which sodium is
  // replaced by LED are both fixed, in both languages.
  const CORNERS = ["TL", "TR", "BR", "BL"];
  const STAT_AT = { TL: "CAP", TR: "TRF", BR: "CON", BL: "SEL" };
  const OPP = { TL: "BR", TR: "BL", BR: "TL", BL: "TR" };
  const LEDS = { HOMA: 1, STADE: 2, PRO: 3, CHAMPION: 4, LEGEND: 4 };
  const ledCount = (p) => LEDS[p.tier] ?? 3;
  const isLed = (p, c) => CORNERS.indexOf(c) < ledCount(p);
  const STEP = { TL: 1, TR: 2, BR: 3, BL: 4 };

  /* ---------- the ground, per tier ---------- */
  const TIER = {
    HOMA: { ground: "concrete", base: "#BCC0C3", stripe: null, vig: 0.5, crisp: { fill: C.shadow, op: 0.74 } },
    STADE: { ground: "synthetic", base: "#BAC8D3", stripe: null, vig: 0.4, crisp: { fill: C.shadow, op: 0.76 } },
    PRO: { ground: "grass", base: "#CFDDE6", stripe: "#BCCEDA", vig: 0.3, crisp: { fill: C.shadow, op: 0.78 } },
    CHAMPION: { ground: "wet", base: "#B6C8D5", stripe: "#A8BDCC", vig: 0.32, crisp: { fill: "#08275A", op: 0.84 }, wet: true },
    LEGEND: { ground: "pristine", base: "#D8E3EB", stripe: "#C7D7E2", vig: 0.12, crisp: { fill: "#061736", op: 0.9 }, legend: true },
  };
  const SOFT = { fill: "#33251A", op: 0.6, blur: 1.5 }; // sodium: warm, with a ~3u penumbra
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;

  /* ---------- the shadow: the figure's outline stretched along +x ---------- */
  // Body half-widths at k = 1, along the body length u (0 = feet, 1 = the neck): two legs apart
  // (26u across the feet), the hips, a waist, the folded-arm elbows (just wider than the
  // shoulders), sloped shoulders and a soft neck. A round head sits beyond the neck.
  const PROFILE = [
    [0, 12.5], [0.1, 10.6], [0.24, 8.7], [0.37, 8.2], [0.47, 8.2], [0.56, 7.9], [0.62, 9.3],
    [0.69, 11], [0.78, 11.2], [0.86, 11], [0.915, 10.7], [0.95, 8.8], [0.975, 5.4], [1, 4.2],
  ];
  // the lit gap between the legs: open at the feet (5u half-width), closing at the crotch
  const NOTCH = [[0.14, 3.8], [0.29, 2.2], [0.4, 0.8], [0.45, 0]];
  /**
   * Closed outline in local coords (feet at 0,0, the shadow along +x), L long. k scales the
   * widths; rx is the head's half-length (default 8u on the 130u shadow), its half-width 7k.
   */
  function personLoop(L, k, rxIn) {
    const rx = rxIn ?? 0.055 * L, ry = 6.3 * k;
    const Lb = L - 1.76 * rx; // the neck slips 0.24rx into the head
    const up = PROFILE.slice(1).map(([u, w]) => [u * Lb, w * k]);
    const hc = L - rx, nw = PROFILE[PROFILE.length - 1][1] * k;
    const th0 = Math.PI - Math.asin(Math.min(0.98, nw / ry));
    const arc = [];
    const N = 12;
    for (let i = 1; i < N; i++) {
      const th = th0 - (2 * th0 * i) / N;
      arc.push([hc + rx * Math.cos(th), ry * Math.sin(th)]);
    }
    const lo = up.map(([x, y]) => [x, -y]).reverse();
    const foot = (s) => [[0, s * 5 * k], [-1.8 * k, s * 8.8 * k], [0, s * 12.5 * k]];
    const notch = NOTCH.map(([u, w]) => [u * Lb, -w * k]).concat(NOTCH.slice(0, -1).reverse().map(([u, w]) => [u * Lb, w * k]));
    const loop = [...foot(1), ...up, ...arc, ...lo, ...foot(-1).reverse(), ...notch];
    return { loop, rx, ry, Lb, hc, th0 };
  }
  /** The wet highlight: a short line inside the shadow's upper edge, from the elbows to the head. */
  function sheenPath(L, k, side) {
    const { rx, ry, Lb, hc, th0 } = personLoop(L, k);
    const pts = PROFILE.filter(([u]) => u >= 0.66).map(([u, w]) => [u * Lb, side * (w * k - 1.7)]);
    for (let i = 1; i <= 3; i++) {
      const th = th0 - ((th0 - Math.PI / 2) * i) / 3;
      pts.push([hc + (rx - 1.7) * Math.cos(th), side * (ry - 1.7) * Math.sin(th)]);
    }
    return "M" + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L");
  }
  /** A flat tapered wedge (small sizes and the thumb): no head. */
  function wedgeLoop(L, root, tip) {
    return [[-root * 0.4, 0], [0, root], [L * 0.94, tip], [L, 0], [L * 0.94, -tip], [0, -root]];
  }
  /** Catmull-Rom through a closed loop of points. */
  function closedPath(pts) {
    const n = pts.length;
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + "Z";
  }
  const polyPath = (pts) => "M" + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z";
  const personPath = (L, k, rx) => closedPath(personLoop(L, k, rx).loop);

  /* ---------- Changa 800 digits (proportional): measured table, not canvas ---------- */
  // per 100px: [advance, ink left, ink right], measured in Chromium on 2026-10-07.
  const DIG = { 0: [67.5, 4, 64], 1: [53.5, 1, 52], 2: [59.5, 3, 56], 3: [55.6, 1, 53], 4: [62.7, 1, 60], 5: [58.9, 4, 56], 6: [61.5, 3, 58], 7: [50, 0, 48], 8: [61.6, 3, 59], 9: [61.5, 3, 58] };
  function ink(text) {
    let x = 0, l = 0, r = 0;
    const ch = String(text).split("");
    ch.forEach((c, i) => {
      const [a, il, ir] = DIG[c] || [60, 3, 57];
      if (i === 0) l = x + il;
      if (i === ch.length - 1) r = x + ir;
      x += a;
    });
    return { dx: -(l + r) / 200, half: (r - l) / 200 };
  }
  const ovrScale = (p) => (String(p.ovr).length > 2 ? 0.82 : 1);

  /* ---------- small shared pieces ---------- */
  function grainFilter(id, freq, oct, seed, dark, kd, kl) {
    return (
      `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${dark[0]}  0 0 0 0 ${dark[1]}  0 0 0 0 ${dark[2]}  ${kd[0]} 0 0 0 ${kd[1]}" result="dk"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${kl[0]} 0 0 0 ${kl[1]}" result="lt"/>` +
      `<feMerge><feMergeNode in="dk"/><feMergeNode in="lt"/></feMerge></filter>`
    );
  }
  /* ================= full card ================= */
  const VB = [-12, 0, 444, 240]; // the panel's 420x240 frame, widened 12u each side for the plates
  const PANEL = { x: 30, y: 30, w: 360, h: 180 };
  const F = [210, 121]; // the feet: 3u above the spec's y124, so the lower shadows clear the 84
  const CPT = { TL: [30, 30], TR: [390, 30], BR: [390, 210], BL: [30, 210] };
  // The four shadows run 130u toward the corners: (-115,-60), (115,-60), (115,60), (-115,60).
  const DIR = { TL: [-115, -60], TR: [115, -60], BR: [115, 60], BL: [-115, 60] };
  const SH_L = 130;
  const THUMB_L = 112; // the thumbnail's flat wedges stop short of the 84
  const angOf = (c) => (Math.atan2(DIR[c][1], DIR[c][0]) * 180) / Math.PI;

  /**
   * Plate rectangle per corner: 76x28 centred on the panel's corner, so it stands 38u out
   * sideways and 14u up or down (LEGEND 84x40, grown outward into a floodlight head). The
   * viewBox runs from x -12 to 432 to hold them.
   */
  function plateBox(c, legend, faceDown) {
    const w = legend ? 84 : 76, h = legend ? 40 : 28;
    const left = c === "TL" || c === "BL", top = faceDown || c === "TL" || c === "TR";
    const x = left ? (legend ? -12 : -8) : legend ? 348 : 352;
    const y = top ? (legend ? 4 : 16) : 196;
    return { x, y, w, h, left, top };
  }

  function groundDefs(u, T, box, flat = true) {
    const { x, y, w, h } = box;
    const R = `x="${x}" y="${y}" width="${w}" height="${h}"`;
    let d = "", g = `<rect ${R} fill="${T.base}"/>`;
    if (T.stripe) {
      d += `<pattern id="${u}-mow" patternUnits="userSpaceOnUse" x="${F[0] - 12}" y="0" width="48" height="40"><rect width="24" height="40" fill="${T.stripe}"/></pattern>`;
      g += `<rect ${R} fill="url(#${u}-mow)"/>`;
    }
    if (T.ground === "grass" || T.ground === "wet") {
      d += grainFilter(`${u}-mottle`, "0.018 0.045", 3, 13, [0.05, 0.12, 0.22], [2.4, -1.12], [-2.4, 1.05]);
      g += `<rect ${R} filter="url(#${u}-mottle)" opacity="${T.wet ? 0.16 : 0.12}"/>`;
    }
    if (T.ground === "concrete") {
      // a new concrete lot: fine aggregate, clean saw-cut joints, a fresh chalk line
      d += grainFilter(`${u}-grain`, "0.75", 3, 3, [0.16, 0.17, 0.18], [2.6, -1.2], [-2.6, 1.12]);
      d += grainFilter(`${u}-stain`, "0.012 0.018", 3, 9, [0.3, 0.31, 0.32], [2, -0.95], [-2, 0.9]);
      g += `<rect ${R} filter="url(#${u}-stain)" opacity=".45"/><rect ${R} filter="url(#${u}-grain)" opacity=".2"/>`;
      if (flat) {
      const j = `stroke="#7E8489" stroke-width="1"`, jl = `stroke="#F4F6F8" stroke-width=".6" opacity=".55"`;
      for (const jx of [150, 270]) g += `<path d="M${jx} ${y}V${y + h}" ${j}/><path d="M${jx + 1} ${y}V${y + h}" ${jl}/>`;
      g += `<path d="M${x} 120H${x + w}" ${j}/><path d="M${x} 121H${x + w}" ${jl}/>`;
      }
    }
    if (T.ground === "synthetic") {
      d += grainFilter(`${u}-grain`, "1.2 0.36", 2, 5, [0.05, 0.1, 0.18], [2.4, -1.1], [-2.4, 1.02]);
      d += `<filter id="${u}-crumb" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".42" numOctaves="1" seed="21" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .071  0 0 0 0 .078  0 0 0 0 .09  14 0 0 0 -11.4"/></filter>`;
      g += `<rect ${R} filter="url(#${u}-grain)" opacity=".24"/><rect ${R} filter="url(#${u}-crumb)" opacity=".25"/>`;
    }
    return { d, g };
  }

  /** The light on the ground: sodium pools warm the turf, LED pools brighten it. */
  function lightPools(u, p, T, cpt, r) {
    let d = "", warm = "", cool = "";
    d += `<radialGradient id="${u}-warm"><stop offset="0" stop-color="#FFB45C" stop-opacity=".55"/><stop offset=".55" stop-color="#FFC783" stop-opacity=".18"/><stop offset="1" stop-color="#FFD7A6" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-cool"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".12"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>`;
    for (const c of CORNERS) {
      const [cx, cy] = cpt[c];
      if (isLed(p, c)) cool += `<circle class="c10-pool c10-k${STEP[c]}" cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}-cool)"/>`;
      else warm += `<circle class="c10-pool c10-k${STEP[c]}" cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}-warm)"/>`;
    }
    return { d, g: `<g style="mix-blend-mode:multiply">${warm}</g><g style="mix-blend-mode:screen" opacity="${T.legend ? 0.55 : 0.45}">${cool}</g>` };
  }

  /** A lamp plate: the club's colour, the stat in its on-colour, a lens on the edge facing the turf. */
  function plate(u, p, o, c, legend, withText, faceDown) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const k = STAT_AT[c];
    const B = plateBox(c, legend, faceDown);
    const led = isLed(p, c);
    const club = p.club || {};
    const fill = club.primary || C.steel;
    const on = club.primary ? club.secondary || "#F4F6F8" : C.steelInk;
    let s = `<g class="c10-plate" data-c10-k="${k}">`;
    s += `<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="2" fill="${fill}"/>`;
    s += `<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="2" fill="url(#${u}-plate)"/>`;
    s += `<rect class="c10-plate-edge" x="${B.x + 0.5}" y="${B.y + 0.5}" width="${B.w - 1}" height="${B.h - 1}" rx="1.6" fill="none"/>`;
    // lens on the inner long edge (bottom for the top plates, top for the bottom plates)
    let textMid;
    if (!legend) {
      const ly = B.top ? B.y + B.h - 5 : B.y + 1;
      const lx = B.x + 3, lw = B.w - 6;
      s += `<rect x="${lx}" y="${ly}" width="${lw}" height="4" rx="1" fill="#0E1622"/>`;
      if (led) {
        const n = 6, cw = lw / n;
        for (let i = 0; i < n; i++) s += `<rect class="c10-lens c10-k${STEP[c]}" x="${f(lx + cw * i + 0.4)}" y="${ly + 0.4}" width="${f(cw - 0.8)}" height="3.2" rx=".6" fill="${C.lens}"/>`;
      } else {
        s += `<rect class="c10-lens c10-k${STEP[c]}" x="${lx + 0.5}" y="${ly + 0.4}" width="${lw - 1}" height="3.2" rx="1.6" fill="${C.sodium}"/>`;
        s += `<rect class="c10-lens c10-k${STEP[c]}" x="${lx + 6}" y="${ly + 1.5}" width="${lw - 12}" height="1" rx=".5" fill="#FFE2B0"/>`;
      }
      textMid = B.top ? B.y + (B.h - 5) / 2 : B.y + 5 + (B.h - 5) / 2;
    } else {
      // LEGEND: a full floodlight head, 2x4 LED lamps, on the half that faces the turf
      const gy = B.top ? B.y + 22 : B.y + 2, gx = B.x + 4, gw = B.w - 8, gh = 16;
      s += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="1.4" fill="#0E1622"/>`;
      const cw = gw / 4, ch = gh / 2;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 4; j++)
          s += `<rect class="c10-lens c10-k${STEP[c]}" x="${f(gx + cw * j + 0.8)}" y="${f(gy + ch * i + 0.8)}" width="${f(cw - 1.6)}" height="${f(ch - 1.6)}" rx="1" fill="url(#${u}-lamp)"/>`;
      textMid = B.top ? B.y + 11 : B.y + B.h - 11;
    }
    if (withText) {
      const v = p.stats[k];
      const cx = B.x + B.w / 2;
      const base = f(textMid + 5.2);
      if (ar) {
        s += `<text class="c10-ptxt" x="${f(cx)}" y="${base}" text-anchor="middle" direction="rtl" fill="${on}">` +
          `<tspan font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="700" font-size="${S.stats[k].length > 7 ? 10.5 : 11.5}" fill-opacity=".86">${esc(S.stats[k])}</tspan>` +
          `<tspan dx="-4" direction="ltr" unicode-bidi="embed" font-family="Manrope, sans-serif" font-weight="800" font-size="15" style="font-variant-numeric:tabular-nums">${v}</tspan></text>`;
      } else {
        s += `<text class="c10-ptxt" x="${f(cx)}" y="${base}" text-anchor="middle" fill="${on}">` +
          `<tspan font-family="Manrope, sans-serif" font-weight="800" font-size="11" letter-spacing=".9" fill-opacity=".86">${esc(S.stats[k])}</tspan>` +
          `<tspan dx="4" font-family="Manrope, sans-serif" font-weight="800" font-size="15" style="font-variant-numeric:tabular-nums">${v}</tspan></text>`;
      }
    }
    return s + `</g>`;
  }

  /** The founder's fifth plate: raw steel, the first light on its top edge, 2026 stamped in. */
  function fifthPlate(u, p, cx, cy, w, h, withText, fs) {
    let s = `<g class="c10-fifth">`;
    s += `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${w}" height="${h}" rx="2" fill="url(#${u}-steel)"/>`;
    s += `<rect class="c10-plate-edge" x="${f(cx - w / 2 + 0.5)}" y="${f(cy - h / 2 + 0.5)}" width="${w - 1}" height="${h - 1}" rx="1.6" fill="none"/>`;
    s += `<rect x="${f(cx - w / 2 + 3)}" y="${f(cy - h / 2 + 1)}" width="${w - 6}" height="3.6" rx="1" fill="#0E1622"/>`;
    s += `<rect class="c10-lens c10-k5" x="${f(cx - w / 2 + 3.5)}" y="${f(cy - h / 2 + 1.4)}" width="${w - 7}" height="2.8" rx="1" fill="${C.first}"/>`;
    if (withText) s += `<text x="${cx}" y="${f(cy + h / 2 - 5)}" text-anchor="middle" direction="ltr" font-family="Manrope, sans-serif" font-weight="800" font-size="${fs}" letter-spacing="${f(fs * 0.06)}" fill="${C.steelInk}" style="font-variant-numeric:tabular-nums">${p.founder}</text>`;
    return s + `</g>`;
  }

  /**
   * The figure: the shared rear view, hood up, at its true proportions, dressed in the club's
   * bench jacket. Only the hood's centre seam is drawn (in the club's light trim); the hood rim
   * is left out, because the rim arc over the flared hem made a bell's lip. A rim light runs
   * along the upper edges only (hood and shoulder tops). The full card fades the hem into the
   * shadows; the share (o.coat) ends the coat on a straight hem above two feet.
   */
  function figure(u, at, w, h, rimW, club, o = {}) {
    const A = MC.AVATAR;
    const [cx, fy] = at;
    const jacket = (club && club.primary) || C.figure;
    const trim = (club && club.secondary) || C.seam;
    const sc = h / 240;
    const box = { x: cx - w / 2, y: o.coat ? fy - 226 * sc : fy + h * 0.12 - h, w, h };
    const Y = (ay) => f(box.y + ay * sc); // avatar y -> scene y
    const pos = `x="${f(box.x)}" y="${f(box.y)}" width="${f(w)}" height="${f(h)}" viewBox="${A.viewBox}" preserveAspectRatio="xMidYMax meet"`;
    let s = "";
    // rim light on the upper edges only: full at the hood, gone by mid-shoulder
    s += `<linearGradient id="${u}-rimg" gradientUnits="userSpaceOnUse" x1="0" y1="${Y(150)}" x2="0" y2="${Y(232)}"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    s += `<mask id="${u}-rim" maskUnits="userSpaceOnUse" x="${f(cx - w)}" y="${f(box.y - 4)}" width="${f(w * 2)}" height="${f(h + 8)}"><rect x="${f(cx - w)}" y="${f(box.y - 4)}" width="${f(w * 2)}" height="${f(h + 8)}" fill="url(#${u}-rimg)"/></mask>`;
    const rim = `<g mask="url(#${u}-rim)" opacity=".8">${MC.avatar({ ...box, torso: C.lens, seam: false, stroke: C.lens, strokeWidth: f((rimW * 2) / sc) })}</g>`;
    // the full card's high camera sees the hood lit from above and the shoulders a step darker
    // under it; the share's low camera sees the figure against the towers, so it is backlit
    const body = o.coat
      ? MC.avatar({ ...box, torso: mix(jacket, C.night, 0.5), hoodFill: mix(jacket, C.night, 0.36), seam: false })
      : MC.avatar({ ...box, torso: mix(jacket, C.night, 0.38), hoodFill: mix(jacket, "#FFFFFF", 0.1), seam: false });
    const seam = `<svg ${pos} aria-hidden="true" focusable="false"><path d="${A.hoodSeam}" stroke="${trim}" stroke-width="${f(Math.max(2.5, 0.7 / sc))}" stroke-linecap="round" fill="none" opacity=".85"/></svg>`;
    if (o.coat) {
      // the share: the coat ends on a straight hem at avatar y 226, above the feet
      s += `<clipPath id="${u}-coat"><rect x="${f(cx - w)}" y="${f(box.y - 4)}" width="${f(w * 2)}" height="${f(fy - box.y + 4)}"/></clipPath>`;
      s += `<g clip-path="url(#${u}-coat)">${rim}${body}${seam}</g>`;
      return s;
    }
    s += `<linearGradient id="${u}-hemg" gradientUnits="userSpaceOnUse" x1="0" y1="${f(box.y)}" x2="0" y2="${f(box.y + h)}"><stop offset=".93" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    s += `<mask id="${u}-hem" maskUnits="userSpaceOnUse" x="${f(cx - w)}" y="${f(box.y - 4)}" width="${f(w * 2)}" height="${f(h + 8)}"><rect x="${f(cx - w)}" y="${f(box.y - 4)}" width="${f(w * 2)}" height="${f(h + 8)}" fill="url(#${u}-hemg)"/></mask>`;
    s += `<g mask="url(#${u}-hem)">${rim}${body}${seam}</g>`;
    return s;
  }

  /**
   * The panel's edge: the outer 14u fall off to night in straight lines (a run-off band, darkest
   * at the wall), and the lit pitch starts crisply at the touchline.
   */
  function falloff(u) {
    const st = `<stop offset="0" stop-color="${C.night}"/><stop offset=".35" stop-color="${C.night}" stop-opacity=".84"/><stop offset="1" stop-color="${C.night}" stop-opacity=".7"/>`;
    let d = "";
    for (const [id, x1, y1, x2, y2] of [["L", 0, 0, 1, 0], ["R", 1, 0, 0, 0], ["T", 0, 0, 0, 1], ["B", 0, 1, 0, 0]])
      d += `<linearGradient id="${u}-f${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${st}</linearGradient>`;
    const g =
      `<rect x="30" y="30" width="14" height="180" fill="url(#${u}-fL)"/><rect x="376" y="30" width="14" height="180" fill="url(#${u}-fR)"/>` +
      `<rect x="30" y="30" width="360" height="14" fill="url(#${u}-fT)"/><rect x="30" y="196" width="360" height="14" fill="url(#${u}-fB)"/>`;
    return { d, g };
  }

  // full-card geometry
  const NAME_Y = 66; // the name's baseline (the top touchline sits at y44)
  const FIFTH_L = 47; // the founder's shadow: from the feet (y121) straight up to y74
  const OVR_Y = 194;

  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const T = tierOf(p);
    const u = MC.uid("c10");
    const thumb = !!o.thumb;
    const legend = !!T.legend;
    const box = { x: 30, y: 30, w: 360, h: 180 };
    const gr = groundDefs(u, T, box);
    const pools = lightPools(u, p, T, CPT, 170);
    const fo = falloff(u);

    let defs = gr.d + pools.d + fo.d;
    defs += `<clipPath id="${u}-clip"><rect x="30" y="30" width="360" height="180" rx="2"/></clipPath>`;
    defs += `<radialGradient id="${u}-vig" gradientUnits="userSpaceOnUse" cx="${F[0]}" cy="${F[1] + 18}" r="215"><stop offset=".42" stop-color="${C.night}" stop-opacity="0"/><stop offset="1" stop-color="${C.night}" stop-opacity="${T.vig}"/></radialGradient>`;
    // the brightest turf is around the 84, below the figure
    defs += `<radialGradient id="${u}-hot" gradientUnits="userSpaceOnUse" cx="210" cy="166" r="118"><stop offset="0" stop-color="#FFFFFF" stop-opacity="${T.legend ? 0.42 : 0.34}"/><stop offset=".55" stop-color="#FFFFFF" stop-opacity=".1"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>`;
    defs += `<linearGradient id="${u}-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>`;
    defs += `<linearGradient id="${u}-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B3BCC5"/><stop offset=".5" stop-color="${C.steel}"/><stop offset="1" stop-color="#7A848E"/></linearGradient>`;
    defs += `<radialGradient id="${u}-lamp" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="${C.lens}"/><stop offset="1" stop-color="#B9CCDA"/></radialGradient>`;
    defs += `<radialGradient id="${u}-bloomL"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".45"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>`;
    defs += `<radialGradient id="${u}-bloomS"><stop offset="0" stop-color="${C.sodium}" stop-opacity=".5"/><stop offset="1" stop-color="${C.sodium}" stop-opacity="0"/></radialGradient>`;
    defs += `<radialGradient id="${u}-bloomF"><stop offset="0" stop-color="${C.first}" stop-opacity=".8"/><stop offset="1" stop-color="${C.first}" stop-opacity="0"/></radialGradient>`;
    defs += `<filter id="${u}-pen" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="40" y="20" width="340" height="200"><feGaussianBlur stdDeviation="${SOFT.blur}"/></filter>`;
    defs += `<filter id="${u}-contact" color-interpolation-filters="sRGB" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="1.6"/></filter>`;
    if (!thumb) defs += `<filter id="${u}-paint" x="-4%" y="-20%" width="108%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.3 0.55" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".55" xChannelSelector="R" yChannelSelector="G"/></filter>`;

    // the four shadows: shadow toward corner c is cast by the lamp opposite it
    let sh = "";
    for (const c of CORNERS) {
      const lamp = OPP[c];
      const led = isLed(p, lamp);
      const ink = led ? T.crisp : SOFT;
      const d = thumb ? closedPath(wedgeLoop(THUMB_L, 12, 3.5)) : personPath(SH_L, 1);
      const a = angOf(c);
      let g = `<path d="${d}" fill="${ink.fill}" opacity="${ink.op}"/>`;
      if (T.wet && led && !thumb) {
        // a short reflected highlight inside the upper edge, elbows to head; it slides on drag
        const side = Math.cos((a * Math.PI) / 180) > 0 ? -1 : 1;
        defs += `<clipPath id="${u}-sc${c}"><path d="${d}"/></clipPath>`;
        g += `<g clip-path="url(#${u}-sc${c})"><g class="c10-slide"><path d="${sheenPath(SH_L, 1, side)}" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round" opacity=".4"/></g></g>`;
      }
      sh +=
        `<g class="c10-swing"><g class="c10-cast c10-k${STEP[lamp]}"${!led ? ` filter="url(#${u}-pen)"` : ""}>` +
        `<g transform="translate(${F[0]} ${F[1]}) rotate(${f(a)})">${g}</g></g></g>`;
    }
    // founder: a fifth, short, razor-sharp shadow straight up, cast by the fifth lamp. It is a
    // small person of its own (head, shoulders, elbows) standing clear above the hood.
    let fifthSh = "";
    if (p.founder) {
      const d = thumb ? closedPath(wedgeLoop(FIFTH_L, 7, 3)) : personPath(FIFTH_L, 0.62, 3.6);
      fifthSh = `<g class="c10-cast c10-first c10-k5"><path d="${d}" fill="${T.crisp.fill}" opacity="${Math.max(0.84, T.crisp.op)}" transform="translate(${F[0]} ${F[1]}) rotate(-90)"/></g>`;
    }

    // lens blooms on the turf, just inside each plate
    let blooms = "";
    for (const c of CORNERS) {
      const B = plateBox(c, legend);
      const bx = B.x + B.w / 2 + (B.left ? 22 : -22), by = B.top ? B.y + B.h + 2 : B.y - 2;
      blooms += `<ellipse class="c10-bloom c10-k${STEP[c]}" cx="${f(bx)}" cy="${f(by)}" rx="${legend ? 52 : 42}" ry="${legend ? 16 : 12}" fill="url(#${u}-${isLed(p, c) ? "bloomL" : "bloomS"})"/>`;
    }
    if (p.founder) blooms += `<ellipse class="c10-bloom c10-k5" cx="210" cy="196" rx="40" ry="12" fill="url(#${u}-bloomF)"/>`;

    // the paint: the touchline, the name, the 84, the touchline lettering
    const sc = ovrScale(p);
    const ovrSize = 64 * sc;
    const m = ink(p.ovr);
    // optically centred 1u left: the 4's stem is the heavy side, and it is the side the
    // lower-right shadow passes closest to at the end of a drag
    const ovrX = (sc < 1 ? 210 : 209) + m.dx * ovrSize;
    let paint = `<rect class="c10-line" x="44.6" y="44.6" width="330.8" height="150.8" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity=".55"/>`;
    paint += `<text class="c10-ovr" x="${f(ovrX)}" y="${OVR_Y}" direction="ltr" text-anchor="start" font-family="Changa, sans-serif" font-weight="800" font-size="${f(ovrSize)}" fill="${C.tunnel}"${thumb ? "" : ` filter="url(#${u}-paint)"`}>${p.ovr}</text>`;
    let lettering = "";
    if (!thumb) {
      const name = esc(MC.nameOf(p, o));
      const tierWord = esc(S.tiers[p.tier]);
      paint +=
        `<text class="c10-name" x="210" y="${NAME_Y}" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" filter="url(#${u}-paint)">` +
        `<tspan font-family="Changa, sans-serif" font-weight="800" font-size="26" fill="${C.logo}">${name}</tspan>` +
        (ar
          ? `<tspan dx="-6" font-family="Changa, Noto Sans Arabic, sans-serif" font-weight="700" font-size="13" fill="${C.tunnel}">${tierWord}</tspan>`
          : `<tspan dx="6" font-family="Manrope, sans-serif" font-weight="800" font-size="12" letter-spacing="1.1" fill="${C.tunnel}">${tierWord}</tspan>`) +
        `</text>`;
      // the ID and the season, stencilled in line paint on the run-off along the top touchline
      const lf = `font-family="Manrope, sans-serif" font-weight="700" font-size="9" fill="#F4FBFF" fill-opacity=".76" style="font-variant-numeric:tabular-nums"`;
      lettering += `<g class="c10-letter">`;
      lettering += ar
        ? `<text x="210" y="40.4" text-anchor="middle" direction="rtl" ${lf}><tspan direction="ltr" unicode-bidi="embed" letter-spacing=".9">${esc(p.id)}</tspan><tspan dx="-14" font-family="Noto Sans Arabic, sans-serif" font-size="9.4">${esc(S.country)}</tspan><tspan dx="-14" direction="ltr" unicode-bidi="embed" letter-spacing=".9">${esc(p.season)}</tspan></text>`
        : `<text x="210" y="40.4" text-anchor="middle" ${lf} letter-spacing=".9">${esc(p.id)}<tspan dx="14">${esc(S.country)}</tspan><tspan dx="14">${esc(p.season)}</tspan></text>`;
      lettering += `</g>`;
      lettering += `<text class="c10-meaning" x="210" y="40.4" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" font-family="${ar ? "Noto Sans Arabic, sans-serif" : "Manrope, sans-serif"}" font-weight="700" font-size="${ar ? 9.6 : 9}" fill="#F4FBFF"></text>`;
    }

    // plates last: they sit over the panel corners and make the outline
    let plates = "";
    for (const c of CORNERS) plates += plate(u, p, o, c, legend, !thumb);
    if (p.founder) plates += fifthPlate(u, p, 210, 210, 60, 24, !thumb, 13);

    const svg =
      `<svg class="c10-scene" viewBox="${VB.join(" ")}" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      `<rect class="c10-rim" x="29.5" y="29.5" width="361" height="181" rx="2.5" fill="none" vector-effect="non-scaling-stroke"/>` +
      `<g clip-path="url(#${u}-clip)">` +
      `<g class="c10-turf">${gr.g}${pools.g}<rect x="30" y="30" width="360" height="180" fill="url(#${u}-vig)"/>` +
      `<rect x="30" y="30" width="360" height="180" fill="url(#${u}-hot)" style="mix-blend-mode:screen"/><g style="mix-blend-mode:screen">${blooms}</g>${fo.g}<g class="c10-paint">${paint}</g></g>` +
      `<g class="c10-shadows" style="mix-blend-mode:multiply">${sh}${fifthSh}</g>` +
      `<ellipse cx="${F[0]}" cy="${F[1] + 1}" rx="15" ry="4.6" fill="#06142B" opacity=".55" filter="url(#${u}-contact)"/>` +
      figure(u, F, 28.4, 34, 0.7, p.club) +
      lettering +
      `</g>` +
      plates +
      `</svg>`;
    return (
      `<div class="c10 c10--card t-${p.tier}${o.motion ? " c10-relight" : ""}${thumb ? " is-thumb" : ""}${p.founder ? " is-founder" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}">` +
      svg +
      `</div>`
    );
  }

  /* ================= token (44-80px) and mini (24-32px) ================= */
  // A lit tile with four lamp tabs in club colour at its corners. The tier is the count of
  // white LED lenses (HOMA 1 ... CHAMPION 4); LEGEND grows the tabs into floodlight heads.
  // 44+: four short crisp shadow wedges and the 84 under the hub. Mini: the 84 alone.
  function token(p, o = {}) {
    const S0 = o.size || 44;
    const mini = S0 <= 32;
    const T = tierOf(p);
    const legend = !!T.legend;
    const u = MC.uid("c10t");
    const club = p.club || {};
    const house = club.primary || C.steel;
    let Wt, Ht, tw, th, thL, px;
    if (mini) {
      Ht = S0 <= 24 ? S0 : Math.round(24 + (S0 - 24) * 0.5);
      Wt = Math.round((Ht * 4) / 3);
      tw = Math.round(Wt * 0.27);
      th = 4;
      thL = 6.5;
    } else {
      Wt = S0;
      Ht = Math.round(S0 * 0.575);
      tw = Math.round(S0 * 0.25);
      th = Math.max(4.5, Math.round(S0 * 0.095));
      thL = Math.round(th * 1.75);
    }
    px = Math.round(tw * 0.3); // how far a tab stands out sideways
    const pxL = px + (mini ? 1 : Math.round(S0 * 0.03));
    const mx = legend ? pxL : px;
    const my = Math.ceil((legend ? thL - th / 2 : th / 2) + 0.5);
    const W = Wt + 2 * mx, H = Ht + 2 * my;
    const x0 = mx, y0 = my;
    let d = "", g = "";

    // the tile: night run-off, lit turf inside, a vignette to the edge
    const e = mini ? 1.6 : Math.max(2.4, S0 * 0.05);
    g += `<rect class="c10-trim" x="${x0}" y="${y0}" width="${Wt}" height="${Ht}" rx="${mini ? 1.4 : 2}" fill="${C.night}"/>`;
    const lit = `x="${f(x0 + e)}" y="${f(y0 + e)}" width="${f(Wt - 2 * e)}" height="${f(Ht - 2 * e)}"`;
    g += `<rect ${lit} rx="${mini ? 0.8 : 1.4}" fill="${T.base}"/>`;
    if (T.stripe && !mini) {
      const bw = (Wt - 2 * e) / 7;
      for (let i = 1; i < 7; i += 2) g += `<rect x="${f(x0 + e + bw * i)}" y="${f(y0 + e)}" width="${f(bw)}" height="${f(Ht - 2 * e)}" fill="${T.stripe}"/>`;
    }
    if (T.ground === "concrete" || T.ground === "synthetic") {
      d += `<radialGradient id="${u}-w"><stop offset="0" stop-color="#FFB45C" stop-opacity=".45"/><stop offset="1" stop-color="#FFB45C" stop-opacity="0"/></radialGradient>`;
      d += `<clipPath id="${u}-cl"><rect ${lit}/></clipPath>`;
      let pools = "";
      for (const c of CORNERS) {
        if (isLed(p, c)) continue;
        const cx = c === "TL" || c === "BL" ? x0 : x0 + Wt, cy = c === "TL" || c === "TR" ? y0 : y0 + Ht;
        pools += `<circle cx="${cx}" cy="${cy}" r="${f(Wt * 0.42)}" fill="url(#${u}-w)"/>`;
      }
      g += `<g clip-path="url(#${u}-cl)" style="mix-blend-mode:multiply">${pools}</g>`;
    }
    d += `<radialGradient id="${u}-v" gradientUnits="userSpaceOnUse" cx="${x0 + Wt / 2}" cy="${y0 + Ht * 0.45}" r="${f(Wt * 0.62)}"><stop offset=".45" stop-color="${C.night}" stop-opacity="0"/><stop offset="1" stop-color="${C.night}" stop-opacity="${f(Math.min(0.45, T.vig + 0.1))}"/></radialGradient>`;
    g += `<rect ${lit} fill="url(#${u}-v)"/>`;

    // the 84
    const cx = x0 + Wt / 2;
    const sc = ovrScale(p);
    const fs = (mini ? Ht * 0.47 : S0 * 0.26) * sc;
    const m = ink(p.ovr);
    const base = mini ? y0 + Ht / 2 + fs * 0.32 : y0 + Ht - e - (Ht - 2 * e) * 0.08;

    // the four shadows (44px and up): short crisp wedges meeting at the feet, no hub mark. They
    // are sized to the room above the digits, so the lower tips stay 1.5px clear of the 84.
    if (!mini) {
      const SIN = Math.sin((27.55 * Math.PI) / 180);
      const rw = S0 * 0.024, tip = Math.max(0.45, S0 * 0.009);
      const top = y0 + e + 0.6, room = base - 0.72 * fs - 1.5 - top;
      const Lw = Math.min(Wt * 0.21, (room - 2 * rw) / (2 * SIN));
      const hy = top + rw + Lw * SIN;
      let w = `<g style="mix-blend-mode:multiply">`;
      for (const c of CORNERS) w += `<path d="${closedPath(wedgeLoop(Lw, rw, tip))}" transform="translate(${f(cx)} ${f(hy)}) rotate(${f(angOf(c))})" fill="${T.crisp.fill}" opacity="${f(Math.min(0.95, T.crisp.op + 0.1))}"/>`;
      g += w + `</g>`;
    }
    g += `<text x="${f(cx + m.dx * fs)}" y="${f(base)}" direction="ltr" text-anchor="start" font-family="Changa, sans-serif" font-weight="800" font-size="${f(fs)}" fill="${C.tunnel}">${p.ovr}</text>`;
    g += `<rect class="c10-rim" x="${f(x0 - 0.5)}" y="${f(y0 - 0.5)}" width="${Wt + 1}" height="${Ht + 1}" rx="${mini ? 1.8 : 2.4}" fill="none"/>`;

    // the lamp tabs: club colour housing, white LED lens or amber sodium lens on the inner edge
    for (const c of CORNERS) {
      const left = c === "TL" || c === "BL", top = c === "TL" || c === "TR";
      const hh = legend ? thL : th;
      const out = legend ? pxL : px;
      const tx = left ? x0 - out : x0 + Wt + out - tw - (legend && !mini ? 2 : 0);
      const twx = tw + (legend && !mini ? 2 : 0);
      const ty = top ? y0 - (hh - th / 2) : y0 + Ht - th / 2;
      g += `<rect x="${f(tx)}" y="${f(ty)}" width="${twx}" height="${f(hh)}" rx="${mini ? 0.6 : 1}" fill="${house}"/>`;
      const led = isLed(p, c);
      const lh = legend ? hh * 0.62 : mini ? hh - 1.4 : Math.max(1.5, hh * 0.45);
      const ly = top ? ty + hh - lh - (mini ? 0.7 : 0.6) : ty + (mini ? 0.7 : 0.6);
      const lx = tx + (mini ? 0.7 : 1.2), lw = twx - (mini ? 1.4 : 2.4);
      if (legend && !mini && S0 >= 56) {
        // floodlight head: 2x4 lamps
        const cw = lw / 4, ch = lh / 2;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) g += `<rect x="${f(lx + cw * j + 0.35)}" y="${f(ly + ch * i + 0.35)}" width="${f(cw - 0.7)}" height="${f(ch - 0.7)}" rx=".4" fill="${C.lens}"/>`;
      } else g += `<rect x="${f(lx)}" y="${f(ly)}" width="${f(lw)}" height="${f(lh)}" rx="${f(Math.min(0.8, lh / 2))}" fill="${led ? C.lens : C.sodium}"/>`;
    }
    if (p.founder) {
      const fw = Math.round(tw * 0.8), fh = th;
      const fx = cx - fw / 2, fy = y0 + Ht - fh / 2;
      g += `<rect x="${f(fx)}" y="${f(fy)}" width="${fw}" height="${f(fh)}" rx="${mini ? 0.6 : 1}" fill="${C.steel}"/>`;
      g += `<rect x="${f(fx + 0.9)}" y="${f(fy + 0.6)}" width="${f(fw - 1.8)}" height="${f(Math.max(1.2, fh * 0.4))}" rx=".5" fill="${C.first}"/>`;
    }
    return (
      `<span class="c10 c10--tok t-${p.tier}${mini ? " is-mini" : ""}" style="width:${W}px;height:${H}px" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false"><defs>${d}</defs>${g}</svg></span>`
    );
  }

  /* ================= row: the "My position" compact card ================= */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const me = !!o.me;
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    return (
      `<div class="c10 c10--row t-${p.tier}${me ? " is-me" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc((o.rank ? o.rank + ". " : "") + MC.label(p, o) + (o.pts != null ? ", " + o.pts + " " + S.pts : ""))}">` +
      `<span class="c10r-rank">${MC.ltr(o.rank ?? "")}</span>` +
      `<span class="c10r-tok">${token(p, { ...o, size: 64, mini: false })}</span>` +
      `<span class="c10r-id"><b>${esc(MC.nameOf(p, o))}${yr ? `<i>·${MC.ltr(yr)}</i>` : ""}</b><small>${esc(S.tiers[p.tier])}</small></span>` +
      `<span class="c10r-pts">${MC.ltr(o.pts ?? "")}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ================= share (360x640): the low oblique camera behind the figure ================= */
  // The pitch plane (X across, Z away from the camera) is projected to the frame. Four towers
  // stand in front and to the sides, so the four shadows fan back toward the viewer.
  const PJ = (X, Z) => [180 + (X * 360) / (Z + 3), 140 + 540 / (Z + 3)];
  const SH_TOWERS = { TL: [-2.7, 5], TR: [2.7, 5], BL: [-1.5, 0.9], BR: [1.5, 0.9] };
  // towers' lamp plates on the frame (fixed size so the stats stay legible)
  const SH_PLATES = { TL: [58, 116], TR: [302, 116], BL: [46, 222], BR: [314, 222] };

  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const T = tierOf(p);
    const u = MC.uid("c10s");
    const legend = !!T.legend;
    const Fs = PJ(0, 0); // (180, 320)
    let d = "";
    // turf: the plane rectangle X -1.3..1.3, Z -1.7..4.5, mowing bands along Z
    const quad = (x1, x2, z1, z2) => polyPath([PJ(x1, z1), PJ(x2, z1), PJ(x2, z2), PJ(x1, z2)]);
    const X0 = -1.3, X1 = 1.3, Z0 = -1.62, Z1 = 4.5;
    let turf = `<path d="${quad(X0 - 3, X1 + 3, Z0, Z1)}" fill="${T.base}"/>`;
    if (T.stripe) {
      const n = 10, bw = (X1 - X0) / n;
      for (let i = 1; i < n; i += 2) turf += `<path d="${quad(X0 + bw * i, X0 + bw * (i + 1), Z0, Z1)}" fill="${T.stripe}"/>`;
    }
    const gr = groundDefs(u, { ...T, stripe: null }, { x: 0, y: 212, w: 360, h: 340 }, false);
    if (T.ground !== "pristine") turf += gr.g.replace(/^<rect[^>]*\/>/, "");
    d += gr.d;
    // side lines and the near touchline in paint
    const lines = `<path d="M${PJ(X0, Z0).map(f).join(" ")}L${PJ(X0, Z1).map(f).join(" ")}L${PJ(X1, Z1).map(f).join(" ")}L${PJ(X1, Z0).map(f).join(" ")}" fill="none" stroke="#F7FAFC" stroke-width="1.4" opacity=".55"/>`;
    // light: pools under the towers and a falloff to night toward the frame's edges
    const sp = {};
    for (const c of CORNERS) sp[c] = PJ(...SH_TOWERS[c]);
    const pools = lightPools(u, p, T, sp, 210);
    d += pools.d;
    d += `<radialGradient id="${u}-vig" gradientUnits="userSpaceOnUse" cx="180" cy="360" r="330"><stop offset=".38" stop-color="${C.night}" stop-opacity="0"/><stop offset=".86" stop-color="${C.night}" stop-opacity="${f(T.vig + 0.25)}"/><stop offset="1" stop-color="${C.night}" stop-opacity=".95"/></radialGradient>`;
    d += `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.deep}"/><stop offset=".75" stop-color="${C.night}"/><stop offset="1" stop-color="#16294A"/></linearGradient>`;
    d += `<linearGradient id="${u}-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.night}" stop-opacity="0"/><stop offset="1" stop-color="${C.night}" stop-opacity=".85"/></linearGradient>`;
    d += `<filter id="${u}-pen" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="0" y="150" width="360" height="400"><feGaussianBlur stdDeviation="${SOFT.blur * 1.2}"/></filter>`;
    d += `<filter id="${u}-contact" color-interpolation-filters="sRGB" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>`;
    d += `<linearGradient id="${u}-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>`;
    d += `<linearGradient id="${u}-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B3BCC5"/><stop offset=".5" stop-color="${C.steel}"/><stop offset="1" stop-color="#7A848E"/></linearGradient>`;
    d += `<radialGradient id="${u}-lamp" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="${C.lens}"/><stop offset="1" stop-color="#B9CCDA"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloomL"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".75"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloomS"><stop offset="0" stop-color="${C.sodium}" stop-opacity=".6"/><stop offset="1" stop-color="${C.sodium}" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloomF"><stop offset="0" stop-color="${C.first}" stop-opacity=".85"/><stop offset="1" stop-color="${C.first}" stop-opacity="0"/></radialGradient>`;

    // the four shadows, the figure's outline on the plane, projected. Every shadow is rooted
    // at the same two feet (on the X axis, either side of the feet point): near the root the
    // width runs along X, then turns to the shadow's own cross direction by a third of its length.
    const Lp = 1.25, kp = Lp / SH_L;
    const { loop } = personLoop(Lp, kp);
    let sh = "";
    for (const c of CORNERS) {
      const [tx, tz] = SH_TOWERS[c];
      const n = Math.hypot(tx, tz), dx = -tx / n, dz = -tz / n; // away from the tower
      const px = -dz, pz = dx; // the shadow's cross direction
      const sg = px >= 0 ? 1 : -1;
      const to = ([s, w]) => {
        const b = Math.min(1, Math.max(0, s / (Lp * 0.34)));
        const ex = sg * (1 - b) + px * b, ez = pz * b;
        return PJ(s * dx + w * ex, s * dz + w * ez);
      };
      const led = isLed(p, c);
      const inkS = led ? T.crisp : SOFT;
      sh += `<path d="${closedPath(loop.map(to))}" fill="${inkS.fill}" opacity="${inkS.op}"${led ? "" : ` filter="url(#${u}-pen)"`}/>`;
    }

    // towers: pole from the ground to the plate
    let towers = "", blooms = "";
    for (const c of CORNERS) {
      const g0 = PJ(...SH_TOWERS[c]);
      const [qx, qy] = SH_PLATES[c];
      const far = c === "TL" || c === "TR";
      towers += `<path d="M${f(g0[0])} ${f(g0[1])}L${qx} ${qy + 14}" stroke="#2A3646" stroke-width="${far ? 2 : 3}" stroke-linecap="round"/>`;
      blooms += `<ellipse class="c10-bloom" cx="${qx}" cy="${qy + 18}" rx="${legend ? 70 : 56}" ry="${legend ? 30 : 22}" fill="url(#${u}-${isLed(p, c) ? "bloomL" : "bloomS"})"/>`;
    }
    let plates = "";
    for (const c of CORNERS) {
      const [qx, qy] = SH_PLATES[c];
      const B = plateBox(c, legend, true);
      // reuse the card's plate, moved to its tower and scaled to the frame; every lens faces down
      const kx = 0.92;
      plates += `<g transform="translate(${f(qx - (B.x + B.w / 2) * kx)} ${f(qy - (B.y + B.h / 2) * kx)}) scale(${kx})">${plate(u, p, o, c, legend, true, true)}</g>`;
    }

    // below the bench coat's hem, two legs in silhouette (the figure is backlit by the towers)
    const legC = mix((p.club && p.club.primary) || C.figure, C.night, 0.62);
    const leg = (sg) => `<path d="M${f(Fs[0] + sg * 16)} ${f(Fs[1] - 18)}L${f(Fs[0] + sg * 4.5)} ${f(Fs[1] - 18)}L${f(Fs[0] + sg * 5.6)} ${f(Fs[1] - 1)}L${f(Fs[0] + sg * 11.6)} ${f(Fs[1] - 1)}Z" fill="${legC}"/>`;
    const legs = leg(-1) + leg(1);
    // the 84 in the lit gap, the figure from behind, the fifth plate on the near touchline
    const sc = ovrScale(p);
    const ovrSize = 110 * sc;
    const m = ink(p.ovr);
    const ovrY = 506;
    const ovr = `<text x="${f(180 + m.dx * ovrSize)}" y="${ovrY}" direction="ltr" text-anchor="start" font-family="Changa, sans-serif" font-weight="800" font-size="${f(ovrSize)}" fill="${C.tunnel}">${p.ovr}</text>`;
    const nearY = PJ(0, Z0)[1];
    const fifth = p.founder ? `<ellipse cx="180" cy="${f(nearY - 10)}" rx="70" ry="18" fill="url(#${u}-bloomF)" style="mix-blend-mode:screen"/>` + fifthPlate(u, p, 180, nearY, 68, 26, true, 14) : "";
    const lf = `font-family="Manrope, sans-serif" font-weight="700" font-size="10" fill="#F4FBFF" fill-opacity=".72" letter-spacing="1" style="font-variant-numeric:tabular-nums"`;
    const letterY = f(nearY + 21);
    const lettering = ar
      ? `<text x="336" y="${letterY}" text-anchor="end" direction="ltr" ${lf}>${esc(p.id)}</text><text x="24" y="${letterY}" text-anchor="end" direction="rtl" ${lf} letter-spacing="0"><tspan font-family="Noto Sans Arabic, sans-serif" font-size="10.5">${esc(S.country)}</tspan><tspan dx="-10" direction="ltr" unicode-bidi="embed" letter-spacing="1">${esc(p.season)}</tspan></text>`
      : `<text x="24" y="${letterY}" ${lf}>${esc(p.id)}</text><text x="336" y="${letterY}" text-anchor="end" ${lf}>${esc(S.country)}<tspan dx="10">${esc(p.season)}</tspan></text>`;

    const svg =
      `<svg class="c10-share-scene" viewBox="0 0 360 640" aria-hidden="true" focusable="false"><defs>${d}</defs>` +
      `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
      `<g>${turf}${pools.g}<rect width="360" height="640" fill="url(#${u}-vig)"/>${lines}</g>` +
      `<rect x="0" y="${f(nearY - 22)}" width="360" height="22" fill="url(#${u}-near)"/>` +
      ovr +
      `<g style="mix-blend-mode:multiply">${sh}</g>` +
      `<ellipse cx="${Fs[0]}" cy="${Fs[1] + 1}" rx="30" ry="5" fill="#06142B" opacity=".45" filter="url(#${u}-contact)"/>` +
      legs +
      figure(u, [Fs[0], Fs[1] - 15], 92, 110, 1.4, p.club, { coat: true }) +
      `<path d="M${Fs[0] - 18} ${f(Fs[1] + 0.8)}H${Fs[0] + 18}" stroke="#06142B" stroke-width="1.8" stroke-linecap="round"/>` +
      `<ellipse cx="${Fs[0] - 8.5}" cy="${Fs[1] - 0.8}" rx="5.4" ry="2.5" fill="#0A1426"/><ellipse cx="${Fs[0] + 8.5}" cy="${Fs[1] - 0.8}" rx="5.4" ry="2.5" fill="#0A1426"/>` +
      towers +
      `<g style="mix-blend-mode:screen">${blooms}</g>` +
      `<rect x="0" y="${f(nearY)}" width="360" height="${f(640 - nearY)}" fill="${C.night}"/>` +
      `<path d="M0 ${f(nearY)}H360" stroke="#F7FAFC" stroke-width="1.6" opacity=".6"/>` +
      plates +
      fifth +
      lettering +
      `</svg>`;
    const sample = ar ? "مثال" : "Exemple";
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    return (
      `<div class="c10 c10--share t-${p.tier}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      svg +
      `<div class="c10s-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
      `<div class="c10s-foot">` +
      `<p class="c10s-who"><b>${esc(MC.nameOf(p, o))}</b>${yr ? `<span class="c10s-yr">·${MC.ltr(yr)}</span>` : ""}</p>` +
      `<p class="c10s-meta"><span>${esc(S.tiers[p.tier])}</span><bdi dir="ltr">@${esc(p.name.lat.toLowerCase())}</bdi><span>${esc(sample)}</span></p>` +
      `</div></div>`
    );
  }

  /* ================= interaction ================= */
  // Drag swings the four lights up to 6 degrees (the most that keeps 1.5u of turf between a
  // lower shadow and the 84): the four shadows pivot around the feet, the
  // founder's shadow alone stays put. Tap a lamp plate to light it and read what its stat means.
  function mount(el, o = {}) {
    if (!el || !el.classList || !el.classList.contains("c10--card") || el.dataset.c10Mounted) return;
    el.dataset.c10Mounted = "1";
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = MC.s(o);
    const swings = el.querySelectorAll(".c10-swing");
    const slides = el.querySelectorAll(".c10-slide");
    let target = 0, cur = 0, raf = 0, startX = null, base = 0, moved = false;
    const apply = () => {
      cur += (target - cur) * 0.2;
      swings.forEach((t) => t.setAttribute("transform", `rotate(${f(cur)} ${F[0]} ${F[1]})`));
      slides.forEach((t) => t.setAttribute("transform", `translate(0 ${f(cur * 0.16)})`));
      raf = Math.abs(target - cur) > 0.02 ? requestAnimationFrame(apply) : 0;
    };
    const go = (deg) => {
      target = Math.max(-6, Math.min(6, deg));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    if (!reduce) {
      el.addEventListener("pointerdown", (e) => {
        startX = e.clientX;
        base = target;
        moved = false;
      });
      el.addEventListener("pointermove", (e) => {
        if (startX == null) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        go(base + (dx / el.getBoundingClientRect().width) * 24);
      });
      const end = () => {
        startX = null;
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("pointerleave", () => {
        startX = null;
        go(0);
      });
    }
    const meaning = el.querySelector(".c10-meaning");
    el.addEventListener("click", (e) => {
      if (moved) {
        moved = false;
        return;
      }
      const hit = e.target.closest && e.target.closest("[data-c10-k]");
      const k = hit && hit.getAttribute("data-c10-k");
      const same = k && hit.classList.contains("is-on");
      el.querySelectorAll("[data-c10-k]").forEach((n) => n.classList.toggle("is-on", !same && n === hit));
      el.classList.toggle("has-focus", !!k && !same);
      if (meaning) meaning.textContent = k && !same ? `${S.statsLong[k]}  ${el.querySelector(`[data-c10-k="${k}"] tspan:last-child`)?.textContent || ""}` : "";
    });
  }

  MC.register({
    id: "c10",
    n: 10,
    slug: "10",
    name: "Quatre Ombres",
    nameAr: "أربعة ظلال",
    category: "wildcard",
    philosophy: "Under four floodlights every player casts four shadows: that X is the BotolaGO mark, and what is yours is the light.",
    philosophyAr: "تحت أربعة أضواء كاشفة يُلقي كل لاعب أربعة ظلال: هذا الشكل هو علامة BotolaGO، وما يخصّك أنت هو الضوء.",
    idea: [
      "This might be crazy. Under four floodlights every player casts four shadows, so the mark of a BotolaGO manager is that X of shadows: you, standing on lit turf. The X is constant. It is the same for every manager, set at 27.6 degrees on a landscape pitch and never mirrored, because it is the brand glyph, made only of light. What is yours is the light.",
      "The full card is a 420x240 panel of night pitch seen from the high broadcast camera: lit turf falling off to a night run-off, four lamp plates standing out past its corners, and the manager at the hub of four shadows, seen from behind with the hood up, in the club's bench jacket. Each shadow is a person (legs apart, folded-arm elbows, shoulders, a head), never a spoke, and none of them encodes a value.",
      "The stats ride on the lamps: CAP 91 top-start, TRF 86 top-end, CON 78 bottom-end, SEL 82 bottom-start, on club-colour plates with a lens strip facing the turf. The 84 is painted in Tunnel Navy on the brightest turf below the figure, with no OVR in the artwork (the accessible label says 84 OVR). ALI is painted in Logo Blue, the one brand place, with the tier word beside it in Tunnel Navy. BOT #004821, MOROCCO and 2026/27 are stencilled on the run-off along the top touchline.",
    ],
    belonging: [
      "The founder myth: 'pourquoi Ali a cinq ombres ?' A fifth lamp and a fifth shadow that nobody after 2026 will have.",
      "Your lamps turn from sodium to LED as you play, one tower at a time, and anyone can count them: on the card, on the token and on the 28px mini in a ranking row.",
      "The X is the thing people will draw: four strokes and a dot. It is the night match on a terrain de proximité, or a Ramadan tournament after iftar under poles of light. Adults read a calm, serious mark; teenagers want the LEGEND floodlight heads and the razor shadows.",
    ],
    founderMark: [
      "A fifth lamp: a raw-steel plate on the bottom edge, its warm lens facing the turf and 2026 stamped into it in Manrope 800 (13u, about 11px on a 360px card). It changes the outline: the panel grows a fifth tab.",
      "A fifth shadow, short and razor-sharp at every tier, falls straight up from the feet; its head and shoulders show above the hood. When the card is dragged the four tower shadows swing and the founder's alone stays put.",
      "Small sizes keep the fifth tab (4px tall at 24px). The row and the share carry the year after the name, the way supporter groups carry theirs: ALI ·26.",
    ],
    small: [
      "44-80px token (the My position card, the hub, head-to-head): an 80x46 lit tile (44x25 at 44px) on night, four lamp tabs in the club's colour at its corners, four short crisp shadow wedges from a hub dot, the 84 in Changa 800 under the hub (about 21px at 80, 11px at 44), the founder's fifth tab and a 1px rim on dark. It uses no filters.",
      "24-32px mini, inside a ranking row's name cell: a 32x24 lit tile (35x26 at 28px) with the 84 at its centre and four corner tabs, no shadows, never the bare X. The tier is the count of white LED lenses (HOMA 1, STADE 2, PRO 3, CHAMPION 4; the rest are amber sodium). LEGEND's tabs grow into taller floodlight heads that stand further out, which changes the outline.",
      "What survives small is the object (the lit tile, the lamp tabs, the 84) and the lamp count. The shadows' human shape only reads on the full card; the 120px thumbnail falls back to flat wedges.",
    ],
    rtl: [
      "Nothing mirrors: CAP is always top-left, so the X and the plates sit in the same places in French and Arabic.",
      "علي is set in Changa 800 line paint with محترف beside it. The plate labels come from the kit strings (القائد، الانتقالات، الثبات، التشكيلة) in Noto Sans Arabic 700, set right to left inside each plate with the figures kept left to right. The touchline reads BOT #004821, المغرب, 2026/27 from the right. The row and the share follow dir=rtl, and ·26 stays a left-to-right fragment.",
      "The Arabic labels and عضو مؤسس need a Modern Standard Arabic review.",
    ],
    tiers: {
      HOMA: "A new concrete lot (clean saw-cut joints, fine aggregate) under one LED lamp (CAP) and three sodium lamps (amber lenses, warm pools). One crisp shadow and three soft, warm ones with a penumbra of about 3u. The full outline; no motion.",
      STADE: "Synthetic turf with sparse rubber crumb. Two LED lamps (CAP, TRF) and two sodium, so the two lower shadows are crisp and the two upper ones soft.",
      PRO: "Mown grass in 24u blue-grey stripes. Three LED lamps and one sodium (SEL): three crisp shadows and one soft.",
      CHAMPION: "Wet grass after rain: darker turf and four LED lamps. Four crisp, darker shadows, each with a thin reflected highlight along one edge that slides when you drag.",
      LEGEND: "Razor-sharp near-black shadows on clean bright turf with nothing else on it, and the four plates grown into full floodlight heads (2x4 LED lamps) that stand further out. That outline change is visible at 28px. The stats stay on the plates. No gold, no halo, no ring.",
    },
    legend: [
      "An optional replay (the gallery's detail sheet plays it when motion is on). The screen dims around the panel, and the four heads catch one at a time, clockwise from CAP, each with a hard stepped flicker of three 60ms steps. As each head catches, its shadow snaps out from the feet. For founders the fifth light catches last with a quicker flicker, and its shadow falls. Then everything is still.",
      "The 84 and the stats show from the first frame: in a capture with motion on, the 84 was at full opacity at 150ms. Under reduced motion the final frame shows. Haptics are a product note; the lab has none.",
      "Dragging swings the four lights up to 8 degrees, so the shadows pivot around the feet while the founder's shadow stays put. Tapping a plate brightens its lens and replaces the touchline lettering with the stat's name (Captaincy 91). Tilt is not built, because it would need an iOS permission prompt.",
    ],
    advantages: [
      "The most brandable glyph in the slate: an X of four shadows that anyone can draw, made from the brand's own floodlight north star and identical in both languages.",
      "Light carries the tier with no colour ladder. The count of LED lamps can be read on the card, the token and the 28px mini, and HOMA keeps the full outline with its own warm light.",
      "Founder status is in the outline (a fifth plate) and in the scene (a fifth shadow), and the club's colour has real carriers: the lamp plates and the manager's jacket.",
    ],
    risks: [
      "It is abstract and needs one line of explanation the first time.",
      "Even flattened, the X can read at a glance as crossed spoons, a spider or a bow tie. The shadows only read as people at full size.",
      "The hub figure is the weak link. The shared rear-view avatar, seen from above, is a hood on shoulders; without its shadows (the first frame of the ceremony) it can read as a bell.",
      "A constant mark gives less individual flex. The plate numbers, the lamp count and the fifth shadow carry what is yours.",
      "The landscape card needs its own hero slot (340px wide in the grid, 520px in the detail sheet). Its plate numbers are small, about 9-13px on a 360px card.",
      "The 84 is paint under the shadows, so at the end of a drag the lower-right shadow brushes the edge of the 4.",
      "The full card uses filters (turbulence grain, a blurred penumbra, a paint edge) that cost on low-end Android; the token and the row use none.",
      "The navy run-off and the blue-grey turf sit near the Codex palette. HOMA and STADE carry warm light, but PRO to LEGEND are all blues.",
      "Not built here: the 1:1 'Mon ombre' avatar export and the two-figure head-to-head share.",
    ],
    gridWidth: 340,
    detailWidth: 520,
    full,
    token,
    row,
    share,
    mount,
  });
})();
