/* 05 PAVÉ — the double-T interlocking paver of Moroccan pavements and squares, and the
   granito floors of homes and cafés. You signed this block in wet cement in 2026; each tier
   grinds, polishes and inlays it until it is black terrazzo and brass. One viewBox (360×236):
   the paver (y0–168) and the next course of four half-blocks (y176–228) that lock into it. */
(function () {
  const MC = window.MC;
  const C = "c05";

  /* ---------- small helpers ---------- */
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const dPoly = (P) => "M" + P.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L") + "Z";
  const esc = MC.esc;
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seedOf = (p) => ((parseInt(p.serial, 10) || 4821) % 89) + 3;

  /* ---------- geometry (viewBox units) ---------- */
  const CH = 3; // the arris: every outer corner is cut 3u
  /** The paver: two square lobes, a waist, a trapezoid notch in each long side. */
  function paverPts(bite, notch = { e: 64, d: 44, h: 20 }) {
    const a = 180 - notch.e / 2, b = 180 - notch.d / 2, c = 180 + notch.d / 2, d = 180 + notch.e / 2;
    const P = [[CH, 0], [a, 0], [b, notch.h], [c, notch.h], [d, 0], [360 - CH, 0], [360, CH]];
    // the first edge chip: a bite out of the bottom end corner (one per season played)
    if (bite) P.push([360, 151], [356.5, 154], [355, 159.5], [350, 163.5], [345, 168]);
    else P.push([360, 168 - CH], [360 - CH, 168]);
    P.push([d, 168], [c, 168 - notch.h], [b, 168 - notch.h], [a, 168], [CH, 168], [0, 168 - CH], [0, CH]);
    return P;
  }
  const mirror = (P) => P.map(([x, y]) => [360 - x, y]).reverse();
  /** The next course: four half-blocks; the middle two tongue up into the paver's bottom notch.
      In the share's pavement the outer two also tongue down into the next paver's top notch. */
  function coursePts(down) {
    const T = 176, B = 228;
    const b1 = down
      ? [[CH, T], [85 - CH, T], [85, T + CH], [85, B - CH], [85 - CH, B], [29, B], [17, 252], [0, 252], [0, T + CH]]
      : [[CH, T], [85 - CH, T], [85, T + CH], [85, B - CH], [85 - CH, B], [CH, B], [0, B - CH], [0, T + CH]];
    const b2 = [[91 + CH, T], [148, T], [158, 156], [177 - CH, 156], [177, 156 + CH], [177, B - CH], [177 - CH, B], [91 + CH, B], [91, B - CH], [91, T + CH]];
    return [b1, b2, mirror(b2), mirror(b1)];
  }
  const COURSE_CX = [42.5, 134, 226, 317.5];

  /** Offsets a closed polygon inward by d (mitred), for arrises and brass strips. */
  function inset(P, d) {
    const n = P.length;
    let A = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % n];
      A += x1 * y2 - x2 * y1;
    }
    const s = A > 0 ? 1 : -1;
    const L = P.map((p, i) => {
      const q = P[(i + 1) % n];
      let dx = q[0] - p[0], dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const nx = -dy * s, ny = dx * s;
      return { px: p[0] + nx * d, py: p[1] + ny * d, dx, dy, nx, ny };
    });
    return P.map((_, i) => {
      const a = L[(i - 1 + n) % n], b = L[i];
      const den = a.dx * b.dy - a.dy * b.dx;
      if (Math.abs(den) < 1e-6) return [b.px, b.py];
      const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
      return [a.px + a.dx * t, a.py + a.dy * t];
    });
  }
  /** The chamfered arris as lit facets: each edge becomes a quad shaded by a light from the top-left. */
  const LIGHT = [-0.5547, -0.8321];
  function facets(P, w, hiA, loA) {
    const Q = inset(P, w);
    const n = P.length;
    let s = "";
    let A = 0;
    for (let i = 0; i < n; i++) A += P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1];
    const sg = A > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n];
      let dx = q[0] - p[0], dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1;
      const ox = (dy / l) * sg, oy = (-dx / l) * sg; // outward normal
      const b = ox * LIGHT[0] + oy * LIGHT[1];
      const quad = dPoly([p, q, Q[(i + 1) % n], Q[i]]);
      if (b > 0.04) s += `<path d="${quad}" fill="#fff" fill-opacity="${r2(b * hiA)}"/>`;
      else if (b < -0.04) s += `<path d="${quad}" fill="#000" fill-opacity="${r2(-b * loA)}"/>`;
    }
    return s;
  }

  /* ---------- materials, one per tier ---------- */
  const PRO_CHIPS = [
    { c: "#c8c3b6", w: 0.3 }, { c: "#a6a39b", w: 0.15 }, { c: "#6f727a", w: 0.08 }, { c: "#0C3164", w: 0.16 },
    { c: "#9BDBFD", w: 0.11 }, { c: "#0151FC", w: 0.08 }, { c: "#3b4a5e", w: 0.07 }, { c: "#fffdf7", w: 0.05 },
  ];
  const LEGEND_CHIPS = [
    { c: "#363b44", w: 0.3 }, { c: "#545b66", w: 0.2 }, { c: "#868c96", w: 0.14 }, { c: "#d6d9de", w: 0.08 },
    { c: "#C9A85E", w: 0.12 }, { c: "#0c3164", w: 0.09 }, { c: "#0151FC", w: 0.07 },
  ];
  const TIER = {
    HOMA: {
      stone: "#727880", band: "#474c52", bandLo: "#2e3236", t: 4, bev: 3.6, hiA: 0.34, loA: 0.42, edge: "rgba(18,20,24,.45)",
      rf: "0.045", ss: 2.8, el: 46, gd: 3.2, gl: 2.6, rough: true, pin: 80, marks: true,
      tool: ["#363a3f", "#a1a7ad"], num: "paint", fig: "groove", fill: "#F4F2EC",
    },
    STADE: {
      stone: "#646B72", band: "#3f444a", bandLo: "#2a2e33", t: 4, bev: 3, hiA: 0.4, loA: 0.46, edge: "rgba(18,20,24,.45)",
      rf: "0.07", ss: 1.3, el: 52, gd: 2.6, gl: 2.2, sheen: true, pin: 24, bite: true,
      tool: ["#3a3f45", "#8d949b"], num: "stencil", fig: "stencil", fill: "#F2F4F5",
    },
    PRO: {
      stone: "#E9E6DF", band: "#B9B4A8", bandLo: "#8f8a7f", t: 4, bev: 2.6, hiA: 0.6, loA: 0.24, edge: "#9AA0A6",
      rf: "0.11", ss: 0.55, el: 60, gd: 2.2, gl: 0, chips: PRO_CHIPS, bite: true,
      tool: ["#6a665e", "#ffffff"], num: "cement", fig: "marq", fill: "#0C3164",
    },
    CHAMPION: {
      stone: "#EEEBE4", band: "#B9B4A8", bandLo: "#8f8a7f", t: 4, bev: 2.2, hiA: 0.6, loA: 0.26, edge: "#9AA0A6",
      rf: "0.11", ss: 0.35, el: 64, gd: 2, gl: 0, chips: PRO_CHIPS, bite: true, polish: 1, strips: true,
      tool: ["#6a665e", "#ffffff"], num: "brass", fig: "marqBrass", scratch: "resin", fill: "#C29A45",
    },
    LEGEND: {
      stone: "#1B1F26", band: "#2A2F36", bandLo: "#14171c", t: 6, bev: 1.8, hiA: 0.26, loA: 0.5, edge: "#737B86",
      rf: "0.11", ss: 0.25, el: 66, gd: 0, gl: 2.4, chips: LEGEND_CHIPS, bite: true, polish: 2, strips: true,
      tool: ["#b39a5f", null], num: "brassHi", fig: "black", scratch: "brass", fill: "#D4B266",
    },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;

  /** Seeded aggregate chips: irregular polygons, power-law sizes, one path per colour. */
  function chipPaths(seed, palette, count, rmin, rmax, box, opacity) {
    const R = rng(seed);
    const groups = palette.map(() => []);
    for (let i = 0; i < count; i++) {
      const x = box[0] + R() * box[2], y = box[1] + R() * box[3];
      const r = rmin + (rmax - rmin) * Math.pow(R(), 2.3);
      let u = R(), k = 0;
      while (k < palette.length - 1 && u > palette[k].w) { u -= palette[k].w; k++; }
      const nv = 4 + Math.floor(R() * 3), a0 = R() * 6.283;
      let d = "M";
      for (let j = 0; j < nv; j++) {
        const a = a0 + (j * 6.283) / nv + (R() - 0.5) * 0.8, rr = r * (0.55 + R() * 0.55);
        d += `${r1(x + Math.cos(a) * rr)} ${r1(y + Math.sin(a) * rr * 0.85)}` + (j < nv - 1 ? "L" : "");
      }
      groups[k].push(d + "Z");
    }
    return palette.map((p, k) => (groups[k].length ? `<path d="${groups[k].join("")}" fill="${p.c}"${opacity ? ` fill-opacity="${opacity}"` : ""}/>` : "")).join("");
  }
  function dots(seed, count, rmin, rmax, box, fill, op) {
    const R = rng(seed);
    let d = "";
    for (let i = 0; i < count; i++) {
      const x = r1(box[0] + R() * box[2]), y = r1(box[1] + R() * box[3]), r = r2(rmin + (rmax - rmin) * R());
      d += `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    return `<path d="${d}" fill="${fill}" fill-opacity="${op}"/>`;
  }

  /* ---------- text helpers ---------- */
  const BS = `font-family="Big Shoulders Display" font-weight="800"`;
  const MR = `font-family="Manrope" font-weight="700"`;
  const AX = (w) => `font-family="Alexandria" font-weight="${w}"`;
  // Big Shoulders 800 advance per em (measured): digits ≈ .475, caps ≈ .45 average.
  const bsWidth = (s) => [...String(s)].reduce((a, ch) => a + (/[0-9]/.test(ch) ? 0.475 : ch === " " ? 0.2 : /[MW]/.test(ch) ? 0.7 : ch === "I" ? 0.22 : 0.45), 0);
  const fitBS = (s, max, size, track = 0) => Math.min(size, max / (bsWidth(s) + track * String(s).length));
  const arWidth = (s) => String(s).length * 0.62; // Alexandria Arabic, generous estimate per letter
  /** Debossed ("tooled") text: a lit lip down-right, the cut on top. */
  function tooled(x, y, str, attrs, tool, off = 0.6) {
    const [dark, light] = tool;
    return (light ? `<text x="${r2(x + off)}" y="${r2(y + off)}" ${attrs} fill="${light}" fill-opacity=".85">${str}</text>` : "") + `<text x="${r2(x)}" y="${r2(y)}" ${attrs} fill="${dark}">${str}</text>`;
  }

  /* ---------- defs shared by a card render ---------- */
  function brassStops(hi) {
    return hi
      ? `<stop offset="0" stop-color="#9c7a33"/><stop offset=".2" stop-color="#f6e3a4"/><stop offset=".34" stop-color="#c9a24e"/><stop offset=".5" stop-color="#fff2c8"/><stop offset=".6" stop-color="#d4b266"/><stop offset=".8" stop-color="#94722e"/><stop offset="1" stop-color="#ecd28c"/>`
      : `<stop offset="0" stop-color="#7c5c22"/><stop offset=".18" stop-color="#e8cd86"/><stop offset=".33" stop-color="#ad853a"/><stop offset=".5" stop-color="#f3dc9a"/><stop offset=".62" stop-color="#c29a45"/><stop offset=".82" stop-color="#83632a"/><stop offset="1" stop-color="#e2c47c"/>`;
  }

  /* ---------- the figure: the shared avatar, cut as inlay ---------- */
  function figure(T, x, y, s, u, seed, mini) {
    const A = MC.AVATAR;
    const sw = (n) => r2(n / s);
    const g = (inner) => `<g transform="translate(${r2(x)} ${r2(y)}) scale(${s})">${inner}</g>`;
    if (T.fig === "groove") {
      // HOMA: only a groove tooled into raw concrete
      const parts = [A.torso, A.hair, A.ears, A.collar];
      const path = (c, w) => parts.map((d) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${sw(w)}" stroke-linejoin="round"/>`).join("") + `<path d="${A.seam}" fill="none" stroke="${c}" stroke-width="${sw(w * 0.8)}"/>`;
      return g(`<g transform="translate(${sw(0.8)} ${sw(0.8)})" opacity=".8">${path(T.tool[1], mini ? 5 : 1.5)}</g>${path(T.tool[0], mini ? 5 : 1.7)}`);
    }
    if (T.fig === "stencil") {
      // STADE: sprayed through a stencil — one paint, bridges left as gaps, a soft overspray
      const paint = "#9BDBFD";
      const all = [A.torso, A.neck, A.collar, A.ears, A.head, A.hair].map((d) => `<path d="${d}"/>`).join("");
      const gaps = `<g fill="none" stroke="${T.stone}" stroke-width="${sw(mini ? 6 : 1.8)}" stroke-linejoin="round"><path d="${A.collar}"/><path d="${A.hair}"/><path d="${A.seam}"/></g>`;
      return g(
        (mini ? "" : `<g fill="${paint}" opacity=".22" filter="url(#${u}-os)">${all}</g>`) +
          `<g fill="${paint}" opacity=".9"${mini ? "" : ` filter="url(#${u}-spray)"`}>${all}</g>${gaps}`,
      );
    }
    // marquetry: flush stone pieces separated by cut lines (grey at PRO, brass from CHAMPION)
    const legend = T.fig === "black";
    const brass = T.fig !== "marq";
    const cut = brass ? `url(#${u}-brass)` : "#5F6368";
    const cw = sw(mini ? (brass ? 7 : 5) : brass ? 1.5 : 1);
    const jacket = legend ? "#272c35" : "#0C3164";
    const skin = legend ? "#3b3532" : "#B9906E";
    const hair = legend ? "#0d0f12" : "#1B1F26";
    const collar = legend ? "#1c2430" : "#0151FC";
    const specks = mini
      ? ""
      : `<g clip-path="url(#${u}-torso)">${chipPaths(seed + 11, legend ? [{ c: "#5d6470", w: 0.6 }, { c: "#C9A85E", w: 0.4 }] : [{ c: "#9BDBFD", w: 0.45 }, { c: "#ffffff", w: 0.3 }, { c: "#0151FC", w: 0.25 }], 70, 0.8, 2.6, [8, 172, 184, 68])}</g>`;
    const vein = mini ? "" : `<path d="M70 70C88 62 96 80 112 74S130 60 134 66M76 104C90 98 100 112 120 100" fill="none" stroke="${legend ? "#C9A85E" : "#e8e6e1"}" stroke-opacity="${legend ? 0.55 : 0.35}" stroke-width="${sw(0.5)}"/>`;
    const st = `stroke="${cut}" stroke-width="${cw}" stroke-linejoin="round"`;
    return g(
      `<path d="${A.torso}" fill="${jacket}" ${st}/>${specks}` +
        `<path d="${A.seam}" fill="none" ${st}/>` +
        `<path d="${A.neck}" fill="${skin}" ${st}/>` +
        `<path d="${A.collar}" fill="${collar}" ${st}/>` +
        `<path d="${A.ears}" fill="${skin}" ${st}/>` +
        `<path d="${A.head}" fill="${skin}" ${st}/>` +
        `<path d="${A.hair}" fill="${hair}" ${st}/>` +
        `<g clip-path="url(#${u}-hair)">${vein}</g>`,
    );
  }
  const figureDefs = (u, x, y, s) => {
    const A = MC.AVATAR;
    return `<clipPath id="${u}-torso"><path d="${A.torso}"/></clipPath><clipPath id="${u}-hair"><path d="${A.hair}"/></clipPath>`;
  };

  /* ---------- inlaid figures (number, tier word, stat values) in the tier's material ---------- */
  function inlay(T, x, y, size, str, anchor, u, extra = "", opts = {}) {
    const a = `x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-size="${r2(size)}" ${extra}`;
    const k = size / 100;
    switch (T.num) {
      case "paint": // HOMA: road paint, brushed on, worn
        return `<text ${a} fill="${T.fill}" filter="url(#${u}-paint)">${str}</text>`;
      case "stencil": { // STADE: sprayed through a stencil — bridges and overspray
        const bridge = opts.bridges !== false;
        return (
          `<text ${a} fill="#ffffff" opacity=".2" filter="url(#${u}-os)">${str}</text>` +
          `<g${bridge ? ` mask="url(#${u}-bridge)"` : ""}><text ${a} fill="${T.fill}" filter="url(#${u}-spray)">${str}</text></g>`
        );
      }
      case "cement": // PRO: navy cement inlay, a fine cut line around it
        return `<text ${a} fill="${T.fill}" stroke="#3a3e46" stroke-opacity=".55" stroke-width="${r2(Math.max(0.6, 1.4 * k))}" paint-order="stroke">${str}</text>`;
      case "brass": // CHAMPION: brass set in a black epoxy bed so it reads on light stone
        return (
          `<text ${a} fill="#1B1F26" stroke="#1B1F26" stroke-width="${r2(Math.max(0.9, 4.4 * k))}" stroke-linejoin="round">${str}</text>` +
          `<text ${a} fill="url(#${u}-brass)">${str}</text>`
        );
      default: // LEGEND: brass flush in black terrazzo
        return `<text ${a} fill="url(#${u}-brassHi)" stroke="#5a4317" stroke-opacity=".5" stroke-width="${r2(Math.max(0.4, 0.8 * k))}" paint-order="stroke">${str}</text>`;
    }
  }

  /* ---------- the founder scratch: the name and ·26 drawn in wet cement ---------- */
  function scratch(p, o, T, u, x, y, size, anchor) {
    if (!p.founder) return "";
    const ar = MC.isAr(o);
    const yy = String(p.founder).slice(-2);
    const word = ar ? `${esc(p.name.ar)}·${yy}` : `${esc(p.name.lat)}·${yy}`;
    const est = ar ? arWidth(p.name.ar) * 0.95 + 1.4 : String(p.name.lat).length * 0.58 + 1.3;
    const fs = Math.min(size, 112 / est);
    const dir = ar ? ` direction="rtl"` : "";
    const a = `x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-family="Reem Kufi" font-weight="500" font-size="${r2(fs)}"${dir}`;
    const lip = `<text ${a} transform="translate(.7 .8)" fill="#C4C9CE" fill-opacity="${T.num === "brassHi" ? 0.18 : 0.75}" stroke="#C4C9CE" stroke-opacity=".4" stroke-width=".9" stroke-linejoin="round">${word}</text>`;
    let cut;
    if (T.scratch === "brass") cut = `<text ${a} fill="url(#${u}-brassHi)" stroke="url(#${u}-brassHi)" stroke-width=".7" stroke-linejoin="round" class="c05-flow">${word}</text>`;
    else cut = `<text ${a} fill="#2f3338" fill-opacity=".86" stroke="#2f3338" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round">${word}</text><text ${a} transform="translate(-.5 -.6)" fill="none" stroke="#000" stroke-opacity=".28" stroke-width=".5">${word}</text>`;
    let resin = "";
    if (T.scratch === "resin") {
      // CHAMPION: the scratch is sealed under a clear resin oval
      const w = fs * est + 14, cx = anchor === "start" ? x + w / 2 - 7 : x - w / 2 + 7, cy = y - fs * 0.32;
      resin =
        `<ellipse cx="${r2(cx)}" cy="${r2(cy + 1.2)}" rx="${r2(w / 2)}" ry="${r2(fs * 0.78)}" fill="#000" fill-opacity=".07"/>` +
        `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(w / 2)}" ry="${r2(fs * 0.78)}" fill="url(#${u}-resin)" stroke="#fff" stroke-opacity=".8" stroke-width=".6"/>` +
        `<path d="M${r2(cx - w * 0.36)} ${r2(cy - fs * 0.38)}Q${r2(cx - w * 0.1)} ${r2(cy - fs * 0.74)} ${r2(cx + w * 0.22)} ${r2(cy - fs * 0.6)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.1" stroke-linecap="round"/>`;
    }
    const rot = `rotate(${anchor === "start" && !ar ? -4 : 4} ${r2(x)} ${r2(y)})`;
    return `<g transform="${rot}"><g filter="url(#${u}-wob)">${lip}${cut}</g>${resin}</g>`;
  }

  /* ---------- the card ---------- */
  function cardSVG(p, o = {}, place = "") {
    const T = tierOf(p);
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const thumb = !!o.thumb;
    const u = MC.uid(C);
    const seed = seedOf(p);
    const X = (x) => (ar ? 360 - x : x);
    const MP = (P) => (ar ? mirror(P) : P);
    const paver = MP(paverPts(T.bite));
    const course = coursePts(!!o.down).map(MP);
    const blocks = [paver, ...course];
    const union = blocks.map(dPoly).join("");
    const bandD = blocks.map((P) => dPoly(P.map(([x, y]) => [x, y + T.t]))).join("");
    const legend = p.tier === "LEGEND";
    const motion = !!o.motion && legend && !thumb;

    /* defs */
    const sv = Math.sin((T.el * Math.PI) / 180);
    let defs =
      `<clipPath id="${u}-faces"><path d="${union}"/></clipPath>` +
      `<clipPath id="${u}-paver"><path d="${dPoly(paver)}"/></clipPath>` +
      `<filter id="${u}-sh" x="-8%" y="-8%" width="116%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="6" result="b"/><feFlood style="flood-color:var(--c05-shadow,#000);flood-opacity:var(--c05-shadow-a,.7)"/><feComposite in2="b" operator="in"/></filter>` +
      `<filter id="${u}-stone" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${T.rf}" numOctaves="4" seed="${seed}" result="n"/>` +
      `<feDiffuseLighting in="n" surfaceScale="${T.ss}" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="${T.el}"/></feDiffuseLighting>` +
      `<feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="${r2(1 / sv)}" result="lit"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="${seed + 7}" result="g"/>` +
      `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${T.gd} 0 0 0 ${r2(-T.gd * 0.6)}" result="gd"/>` +
      `<feColorMatrix in="g" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 ${T.gl} 0 0 ${r2(-T.gl * 0.6)}" result="gl"/>` +
      `<feMerge result="m"><feMergeNode in="lit"/><feMergeNode in="gd"/><feMergeNode in="gl"/></feMerge>` +
      (T.sheen
        ? `<feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="2" seed="${seed + 2}" result="w"/>` +
          `<feSpecularLighting in="w" surfaceScale="7" specularConstant=".85" specularExponent="16" lighting-color="#e4f3ff" result="sp"><feDistantLight azimuth="225" elevation="38"/></feSpecularLighting>` +
          `<feComposite in="m" in2="sp" operator="arithmetic" k2="1" k3=".32" result="m2"/><feComposite in="m2" in2="SourceAlpha" operator="in"/>`
        : `<feComposite in="m" in2="SourceAlpha" operator="in"/>`) +
      `</filter>` +
      `<linearGradient id="${u}-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.band}"/><stop offset="1" stop-color="${T.bandLo}"/></linearGradient>` +
      `<linearGradient id="${u}-brass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="236">${brassStops(false)}</linearGradient>` +
      `<linearGradient id="${u}-brassHi" gradientUnits="userSpaceOnUse" x1="${ar ? 360 : 0}" y1="0" x2="${ar ? 0 : 360}" y2="236">${brassStops(true)}</linearGradient>` +
      `<linearGradient id="${u}-brassBB" x1="0" y1="0" x2="1" y2="1">${brassStops(legend)}</linearGradient>` +
      `<radialGradient id="${u}-resin" cx=".42" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".6" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#cfe6ee" stop-opacity=".3"/></radialGradient>` +
      `<filter id="${u}-wob" x="-10%" y="-30%" width="120%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".45" numOctaves="1" seed="${seed + 6}" result="t2"/><feColorMatrix in="t2" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.2 -.45" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>` +
      `<filter id="${u}-spray" x="-6%" y="-6%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="${seed + 8}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 -.7" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>` +
      `<filter id="${u}-os" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      `<filter id="${u}-paint" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency=".035 .42" numOctaves="2" seed="${seed + 4}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -2.6 2.15" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>` +
      `<filter id="${u}-chalk" x="-4%" y="-10%" width="108%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${seed + 5}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -3.2 2.3" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>` +
      (T.rough ? `<filter id="${u}-rough" x="-2%" y="-3%" width="104%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="${seed + 1}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter>` : "") +
      `<linearGradient id="${u}-pol" gradientUnits="userSpaceOnUse" x1="${ar ? 250 : 110}" y1="0" x2="${ar ? 190 : 170}" y2="70"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${legend ? 0.16 : 0.2}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-rake" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="0"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${legend ? 0.07 : 0.1}"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      figureDefs(u);

    /* stencil bridges for the STADE numbers: thin gaps through each digit's centre */
    if (T.num === "stencil") {
      const ds = String(p.ovr);
      const w = 0.475 * 100, left = X(284) - 1 - (ds.length * w) / 2;
      let gaps = "";
      for (let i = 0; i < ds.length; i++) gaps += `<rect x="${r2(left + w * i + w / 2 - 1.6)}" y="40" width="3.2" height="100" fill="#000"/>`;
      // stat values (two digits each) get bridges too
      MC.STATS.forEach((k, i) => {
        const fs = ar ? 24 : 23, dw = 0.475 * fs, n = String(p.stats[k]).length;
        const l0 = ar ? X(COURSE_CX[i]) - (n * dw) / 2 : X(COURSE_CX[i]) + 2.5;
        for (let j = 0; j < n; j++) gaps += `<rect x="${r2(l0 + dw * j + dw / 2 - 0.8)}" y="${ar ? 198 : 188}" width="1.6" height="26" fill="#000"/>`;
      });
      defs += `<mask id="${u}-bridge" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="236"><rect width="360" height="236" fill="#fff"/>${gaps}</mask>`;
    }

    /* the block body */
    let body = "";
    body += `<path d="${bandD}" fill="url(#${u}-band)"/>`;
    body += `<path d="${union}" fill="${T.stone}" filter="url(#${u}-stone)"/>`;
    let surf = "";
    if (T.marks && !thumb) {
      // form-release marks: ghost rectangles left by the mould boards, and its pinholes
      surf += `<g fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.2"><rect x="${X(ar ? 136 : 12)}" y="58" width="124" height="96"/><rect x="${X(ar ? 352 : 222)}" y="10" width="130" height="64"/><path d="M0 112H360"/></g>`;
      surf += `<g fill="#000" fill-opacity=".06"><rect x="${X(ar ? 300 : 238)}" y="96" width="62" height="54"/></g>`;
    }
    if (T.pin && !thumb) {
      surf += dots(seed + 9, T.pin, 0.45, 1.25, [0, 0, 360, 230], "#26292d", 0.75);
      surf += dots(seed + 9, T.pin, 0.45, 1.25, [0.7, 0.7, 360, 230], "#c9cdd1", 0.22);
    }
    if (T.chips) {
      const n = thumb ? 160 : legend ? 620 : 680;
      surf += chipPaths(seed, T.chips, n, thumb ? 1.6 : 0.8, thumb ? 4 : 3.6, [0, 0, 360, o.down ? 254 : 230]);
    }
    if (T.polish) {
      surf += `<rect x="0" y="0" width="360" height="236" fill="url(#${u}-pol)"/>`;
      if (T.polish > 1) surf += `<path d="${ar ? "M60 0H84L-6 236H-30Z" : "M276 0H300L390 236H366Z"}" fill="#fff" fill-opacity=".05"/>`;
    }
    body += `<g clip-path="url(#${u}-faces)">${surf}</g>`;
    const arris = blocks.map((P) => facets(P, T.bev, T.hiA, T.loA)).join("");
    const outline = `<path d="${union}" fill="none" stroke="${T.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

    /* brass strips: terrazzo dividers framing the lobes, the waist and each course block */
    let strips = "";
    if (T.strips) {
      const inner = inset(paverPts(T.bite), 8);
      // the notch-bottom corners of the inset outline: dividers run between them
      const tl = inner[2], tr = inner[3];
      const bl = inner[inner.length - 6], br = inner[inner.length - 7];
      const P = ar ? mirror(inner) : inner;
      let d = dPoly(P);
      d += `M${r2(X(tl[0]))} ${r2(tl[1])}V${r2(bl[1])}M${r2(X(tr[0]))} ${r2(tr[1])}V${r2(br[1])}`;
      d += coursePts(false).map((Q) => dPoly(MP(inset(Q, 5.5)))).join("");
      strips = `<path d="${d}" fill="none" stroke="#3b2c10" stroke-opacity=".35" stroke-width="2.6"/><path d="${d}" fill="none" stroke="url(#${u}-brass${legend ? "Hi" : ""})" stroke-width="1.7"/>`;
    }

    /* inlays and lettering */
    let ink = "";
    // the figure, inlaid in the start lobe
    ink += `<g clip-path="url(#${u}-paver)">${figure(T, X(ar ? 139 : 29) , 36, 0.55, u, seed, false)}</g>`;
    // the founder scratch
    ink += scratch(p, o, T, u, X(14), ar ? 29 : 30, 22, "start");
    if (p.founder && !thumb) {
      const cap = ar ? esc(S.founderLine) : esc(S.founderLine);
      ink += ar
        ? tooled(X(14), 45, cap, `${AX(600)} font-size="7.4" text-anchor="start" direction="rtl"`, T.tool, 0.45)
        : tooled(X(14), 42, cap, `${MR} font-size="6.6" letter-spacing=".9"`, T.tool, 0.45);
    }
    if (!thumb) {
      // the waist: wordmark, crest, tier, country, season
      const lw = 46, lh = lw / MC.LOGO_RATIO.wordmark;
      const logo = (color, extra = "") => `<g transform="translate(${r2(180 - lw / 2)} 29)"${extra}>${MC.logo("wordmark", { variant: "mono", color, label: false, w: lw, h: r2(lh) })}</g>`;
      if (T.num === "paint" || T.num === "stencil") ink += `<g transform="translate(.5 .5)" opacity=".8">${logo(T.tool[1])}</g>` + logo(T.tool[0]);
      else if (T.num === "cement") ink += logo("#0151FC", ` stroke="#3a3e46" stroke-opacity=".5" stroke-width="30" paint-order="stroke"`);
      else if (T.num === "brass") ink += logo("#1B1F26", ` stroke="#1B1F26" stroke-width="70" stroke-linejoin="round"`) + logo(`url(#${u}-brassBB)`);
      else ink += logo(`url(#${u}-brassBB)`);
      const crest = (opts) => `<g transform="translate(170 45)">${MC.crest({ w: 20, h: 24, ...opts })}</g>`;
      if (T.num === "paint" || T.num === "stencil") ink += `<g transform="translate(.6 .6)" opacity=".8">${crest({ mono: T.tool[1] })}</g>` + crest({ mono: T.tool[0] });
      else if (legend) ink += crest({ fill: "#2a2f38", sash: "#D4B266", ring: "#D4B266" });
      else ink += crest({ fill: "#3b4a5e", sash: "#e9e4d6", ring: T.strips ? "#C29A45" : "#5F6368" });
      const tw = S.tiers[p.tier];
      if (ar) ink += inlay(T, 180, 95, Math.min(16, 50 / arWidth(tw)) * 1.0, esc(tw), "middle", u, `${AX(700)} direction="rtl"`, { bridges: false });
      else ink += inlay(T, 180, 94, fitBS(tw, 50, 18, 0.06), esc(tw), "middle", u, `${BS} letter-spacing="1"`, { bridges: false });
      ink += ar
        ? tooled(180, 115, esc(S.country), `${AX(600)} font-size="9.5" text-anchor="middle" direction="rtl"`, T.tool, 0.45)
        : tooled(180, 113, esc(S.country), `${MR} font-size="8.2" letter-spacing=".6" text-anchor="middle"`, T.tool, 0.45);
      ink += tooled(180, 128, esc(p.season), `${MR} font-size="8.6" text-anchor="middle" direction="ltr" style="font-variant-numeric:tabular-nums"`, T.tool, 0.45);
    }
    // the end lobe: name, the 84, the ID
    const ex = X(284);
    if (!thumb) {
      const nm = MC.nameOf(p, o);
      ink += ar
        ? tooled(ex, 34, esc(nm), `${AX(700)} font-size="${r2(Math.min(24, 118 / arWidth(nm)))}" text-anchor="middle" direction="rtl"`, T.tool, 0.6)
        : tooled(ex, 37, esc(nm), `${BS} font-size="${r2(fitBS(nm, 122, 25, 0.12))}" letter-spacing="${r2(fitBS(nm, 122, 25, 0.12) * 0.12)}" text-anchor="middle"`, T.tool, 0.6);
    }
    ink += inlay(T, ex - 1, ar ? 134 : 131, 100, MC.esc(p.ovr), "middle", u, `${BS} direction="ltr"`);
    if (!thumb) ink += tooled(ex, ar ? 152 : 150, esc(p.id), `${MR} font-size="8.4" letter-spacing=".5" text-anchor="middle" direction="ltr" style="font-variant-numeric:tabular-nums"`, T.tool, 0.45);
    // the course: one stat per half-block, label tooled, value inlaid
    if (!thumb) {
      MC.STATS.forEach((k, i) => {
        const cx = X(COURSE_CX[i]);
        const v = p.stats[k];
        if (ar) {
          const lab = esc(S.stats[k]);
          const lfs = Math.min(11.5, 60 / arWidth(S.stats[k]));
          ink += T.num === "paint"
            ? `<text x="${cx}" y="197" ${AX(600)} font-size="${r2(lfs)}" text-anchor="middle" direction="rtl" fill="${T.fill}" filter="url(#${u}-chalk)">${lab}</text>`
            : tooled(cx, 197, lab, `${AX(600)} font-size="${r2(lfs)}" text-anchor="middle" direction="rtl"`, T.tool, 0.45);
          ink += T.num === "paint"
            ? `<text x="${cx}" y="221" ${BS} font-size="24" text-anchor="middle" direction="ltr" fill="${T.fill}" filter="url(#${u}-chalk)">${v}</text>`
            : inlay(T, cx, 221, 24, v, "middle", u, `${BS} direction="ltr"`);
        } else {
          const lab = esc(S.stats[k]);
          const lx = cx - 2.5, vx = cx + 2.5;
          if (T.num === "paint") {
            ink += `<g filter="url(#${u}-chalk)" fill="${T.fill}"><text x="${lx}" y="210" ${BS} font-size="15" letter-spacing="1.2" text-anchor="end">${lab}</text><text x="${vx}" y="210" ${BS} font-size="23">${v}</text></g>`;
          } else {
            ink += tooled(lx, 210, lab, `${BS} font-size="15" letter-spacing="1.2" text-anchor="end"`, T.tool, 0.5);
            ink += inlay(T, vx, 210, 23, v, "start", u, BS);
          }
        }
      });
    }

    /* the LEGEND grind: a grey surface ground away from start to end, once */
    let grind = "";
    if (motion) {
      defs += `<mask id="${u}-gm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="400" height="280"><rect class="c05-grind" x="-10" y="-20" width="380" height="280" fill="#fff"/></mask>`;
      grind = `<g class="c05-cover" mask="url(#${u}-gm)"><path d="${union}" fill="#6E747B" filter="url(#${u}-stone)"/></g><rect class="c05-grind c05-edge" x="${ar ? 362 : -14}" y="-6" width="12" height="248" fill="#fff" fill-opacity=".55" filter="url(#${u}-os)"/>`;
    }

    const rake = thumb ? "" : `<g clip-path="url(#${u}-faces)" class="c05-rake"><rect x="0" y="0" width="360" height="236" fill="url(#${u}-rake)"/></g>`;
    const shadow = thumb ? "" : `<path d="${bandD}" fill="#000" filter="url(#${u}-sh)"/>`;
    const bodyG = T.rough ? `<g filter="url(#${u}-rough)">${body}${arris}</g>` : `${body}${arris}`;
    return (
      `<svg class="c05-svg" ${place} viewBox="0 0 360 236" aria-hidden="true" focusable="false" style="--c05-dir:${ar ? -1 : 1};overflow:visible">` +
      `<defs>${defs}</defs>${shadow}${bodyG}${strips}${ink}${outline}${grind}${rake}</svg>`
    );
  }

  /* ---------- the token: the paver alone ---------- */
  function tokenSVG(p, o = {}) {
    const T = tierOf(p);
    const ar = MC.isAr(o);
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const h = Math.round(size * 0.82), w = h * 2;
    const u = MC.uid(C + "t");
    const seed = seedOf(p);
    const X = (x) => (ar ? 360 - x : x);
    // optical correction: deeper notches as the token shrinks
    const notch = mini ? { e: 78, d: 52, h: 28 } : { e: 70, d: 48, h: 24 };
    const raw = paverPts(T.bite && !mini, notch);
    const P = ar ? mirror(raw) : raw;
    const d = dPoly(P);
    const t = mini ? 10 : 8;
    const legend = p.tier === "LEGEND";
    let s = `<defs><clipPath id="${u}-c"><path d="${d}"/></clipPath><linearGradient id="${u}-brass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="180">${brassStops(legend)}</linearGradient><linearGradient id="${u}-brassHi" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="180">${brassStops(true)}</linearGradient>${figureDefs(u)}</defs>`;
    s += `<path d="${dPoly(P.map(([x, y]) => [x, y + t]))}" fill="${T.bandLo}"/>`;
    s += `<path d="${d}" fill="${T.stone}"/>`;
    let surf = "";
    if (T.chips) surf += chipPaths(seed, T.chips.slice(0, mini ? 6 : 8), mini ? 26 : 70, mini ? 6 : 3.5, mini ? 9 : 8, [0, 0, 360, 168]);
    if (T.pin) surf += dots(seed, mini ? 14 : 36, mini ? 4 : 2.2, mini ? 6 : 3.6, [0, 0, 360, 168], "#26292d", 0.55);
    if (T.sheen) surf += `<path d="M0 0H360V60C240 40 120 90 0 50Z" fill="#fff" fill-opacity=".09"/>`;
    if (T.polish) surf += `<path d="${ar ? "M250 0H210L80 168H120Z" : "M110 0H150L280 168H240Z"}" fill="#fff" fill-opacity="${legend ? 0.07 : 0.16}"/>`;
    s += `<g clip-path="url(#${u}-c)">${surf}</g>`;
    s += facets(P, mini ? 11 : 8, T.hiA, T.loA);
    if (T.strips) {
      const inner = ar ? mirror(inset(raw, mini ? 18 : 14)) : inset(raw, mini ? 18 : 14);
      s += `<path d="${dPoly(inner)}" fill="none" stroke="url(#${u}-brass${legend ? "Hi" : ""})" stroke-width="${mini ? 9 : 6}"/>`;
    }
    // the figure in the start lobe (dropped at mini size)
    if (!mini) s += `<g clip-path="url(#${u}-c)">${figure(T, X(ar ? 126 : 22), 168 - 125, 0.52, u, seed, true)}</g>`;
    // founder: a nick at the start lobe's top corner (a squiggle when there is room)
    if (p.founder) {
      const col = legend ? `url(#${u}-brassHi)` : "#2f3338";
      s += mini
        ? `<path d="M${X(14)} 14L${X(52)} 44" stroke="${col}" stroke-width="13" stroke-linecap="round" opacity=".85"/>`
        : `<path d="M${X(16)} 26c8-12 14 8 22-4s14 8 22-4" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`;
    }
    // the number, inlaid in the end lobe
    const fs = mini ? 138 : 122;
    const cx = X(mini ? 290 : 288) - 1, by = 84 + fs * 0.405;
    const a = `x="${r2(cx)}" y="${r2(by)}" text-anchor="middle" font-size="${fs}" ${BS} direction="ltr"`;
    const num = MC.esc(p.ovr);
    if (T.num === "paint" || T.num === "stencil") s += `<text ${a} fill="${T.fill}">${num}</text>`;
    else if (T.num === "cement") s += `<text ${a} fill="${T.fill}">${num}</text>`;
    else if (T.num === "brass") s += `<text ${a} fill="#1B1F26" stroke="#1B1F26" stroke-width="${mini ? 16 : 12}" stroke-linejoin="round">${num}</text><text ${a} fill="url(#${u}-brass)">${num}</text>`;
    else s += `<text ${a} fill="url(#${u}-brassHi)">${num}</text>`;
    s += `<path d="${d}" fill="none" stroke="${T.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    return `<svg class="c05-tok-svg" viewBox="0 0 360 180" width="${w}" height="${h}" aria-hidden="true" focusable="false" style="overflow:visible">${s}</svg>`;
  }

  /* ---------- the share's pavement: the same blocks, tessellated ---------- */
  function pavementField(s, ox, oy, rows, cols, skip) {
    let faces = "", bands = "";
    const per = 236, span = 366;
    const tf = (P, dx, dy) => P.map(([x, y]) => [ox + (x + dx) * s, oy + (y + dy) * s]);
    for (let k = rows[0]; k <= rows[1]; k++) {
      const shift = Math.abs(k) % 2 ? 183 : 0;
      for (let j = cols[0]; j <= cols[1]; j++) {
        const dx = j * span + shift, dy = k * per;
        if (skip && k === 0 && j === 0) continue;
        [paverPts(false), ...coursePts(true)].forEach((Q) => {
          faces += dPoly(tf(Q, dx, dy));
          bands += dPoly(tf(Q, dx, dy + 4));
        });
      }
    }
    return { faces, bands };
  }

  const c = {
    id: "c05",
    n: 5,
    name: "PAVÉ",
    nameAr: "البلاطة",
    category: "bold",
    philosophy:
      "You signed your block while the cement was wet in 2026; every tier grinds, polishes and inlays it until it is black terrazzo and brass, and your league is the pavement it locks into.",
    philosophyAr:
      "وقّعتَ على بلاطتك والإسمنت ما زال طريًّا سنة 2026، وكل مستوى يصقلها ويرصّعها حتى تصير حجرًا أسود مصقولًا ونحاسًا، ودوريّك هو الرصيف الذي تتشابك فيه.",
    idea: [
      "The card is not a card. It is a paving block: the double-T interlocking paver of city pavements and squares, the ground that neighbourhood football is played on, cut with a trapezoid notch in each long side. Under it sits the next course of the pavement, four half-blocks, and the middle two tongue up into the paver's notch so the parts physically lock. Read as a silhouette it is an I-beam over a row of bricks, a shape no card game, bank or profile widget uses.",
      "Reading the block means walking along it. The start lobe carries the manager seen from behind, cut into the stone as an inlay; the waist carries the BotolaGO wordmark, the neutral crest, the tier, the country and the season; the end lobe carries the name and the 84, inlaid. The four course blocks hold one stat each, label cut into the stone and value inlaid in the tier's material. Nothing floats: every mark is either cut into the block or set flush into it.",
      "The material is the progression. Raw cast concrete with pinholes and mould marks, then sealed concrete with a wet sheen, then white granito ground down to its aggregate, then polished terrazzo framed in brass strips, then black terrazzo where only brass remains. The aggregate chips are seeded by the BOT number, so every member's block has its own grain, the way no two terrazzo floors match.",
      "Typography is set like lettering on a building: Big Shoulders Display 800 for the number, name and stat values (a condensed, civic face that reads like street-sign and stadium numbering), Manrope for the cut-in codes, Alexandria for Arabic, and the founder scratch is the only handwriting on the object.",
    ],
    belonging: [
      "The league is literally a pavement. Every member's block locks into the next one, which is the group image the product has been missing: not a podium, a ground you share. The share image is the same block lying in a lit square of identical grey pavers, and it is obvious which one is yours.",
      "The block ages with you. It takes one edge chip per season played (the first is already bitten out of the end corner from STADE on), so a three-season block looks lived-in in a way a new account cannot copy. A 15-year-old wants the brass; a 30-year-old finds black terrazzo and brass genuinely beautiful, which keeps it from feeling childish.",
      "Friends compare by material before they compare by number: 'yours is still concrete' is a sentence that works in a playground. The 84 is inlaid in the end lobe where it is the largest mark on the block, so the number comparison still happens at a glance.",
    ],
    founderMark: [
      "FOUNDER 2026 is not a badge placed on the block. It is the member's name and ·26 finger-scratched into the wet cement in the start lobe's top corner, with a slight wobble seeded by the BOT number so no two scratches are identical, and the words FOUNDER 2026 cut beneath it like a date line.",
      "It is part of the concrete from day one and is never polished away: grooved at HOMA, STADE and PRO, sealed under a clear resin oval at CHAMPION (a floor someone chose to protect), and filled with brass at LEGEND. Later cohorts carry their own year; nobody else's block will ever carry ·26, and it cannot be bought because it was made the day they joined.",
      "It borrows the form of supporter-group naming, a name followed by its founding year, without any group vocabulary or crest.",
    ],
    small: [
      "At 44–80px the token is the paver alone at 2:1: both trapezoid notches visible, the 84 in Big Shoulders inlaid in the end lobe at about 60% of the block height, the figure in the start lobe and a short scratch at its top corner for founders. The notches are cut slightly deeper than on the full card, an optical correction so the I-shape survives.",
      "At 24–32px the figure drops and the 84 grows to fill the end lobe; tier is carried by the material alone: mid-grey raw concrete, darker sealed grey, light granito with a few coloured chips, granito with a brass inner frame and a black-bedded brass number, black with a brass number and a lit rim. Founders keep a single diagonal nick in the start corner.",
      "The 1px arris line is drawn non-scaling, so light stone keeps its edge on the light app ground and black terrazzo keeps a #737B86 rim on the dark ground at every size.",
    ],
    rtl: [
      "The outline is symmetric, so the whole composition mirrors without changing the silhouette: in Arabic the 84 and the name move to the left lobe (inline end), the figure and the scratch move to the right lobe, and the course reads with the captaincy block on the right. Only the edge chip moves with it, to the bottom-left corner.",
      "The name علي is set in Alexandria 700 with room above and below for its tall ascenders and the ي descender; the Arabic stat labels are longer than CAP/SEL/TRF/CON, so they stack above their values instead of sitting beside them. No letter-spacing on Arabic anywhere; digits, the BOT number and the season stay left-to-right.",
      "The founder scratch is the Arabic name and ·26 in Reem Kufi, the Kufic face that is closest to a finger drawn in cement.",
    ],
    tiers: {
      HOMA: "Raw cast concrete: mottled grey with pinholes and the ghost rectangles of mould boards, a crude arris that wobbles, the number brushed on in worn road paint, the stats written in chalk, the figure only a tooled groove.",
      STADE: "Cured and sealed: darker, with a wet sheen that catches the light, sharper arrises, the number sprayed through a stencil (bridges and overspray), the figure a sky-blue stencil, and the first edge chip bitten out of the end corner.",
      PRO: "Ground down to white granito: the aggregate is exposed in navy, sky, logo blue and club colour chips. The number, tier and stat values become navy cement inlays, the wordmark a logo-blue stone, and the figure flush marquetry: navy granite jacket, blue collar, warm stone, black marble hair.",
      CHAMPION: "Polished terrazzo: a reflection band across the face, brass strips framing the lobes, the waist and every course block, brass numerals set in a black epoxy bed so they read on light stone, brass cut lines through the figure, and the founder scratch sealed under clear resin.",
      LEGEND: "Black terrazzo polished to a mirror with flecks of grey, white and brass. Only brass remains: the number, the strips, the figure's outline, the wordmark, and the founder scratch, now filled with brass. The block stands taller (a 6u side instead of 4u) and keeps a lit rim on the dark ground.",
    },
    legend: [
      "The grind. A raking floodlight crosses the block at a low angle, then a grinding pass sweeps from the start lobe to the end lobe (a mask wipe, 900ms) and takes the grey surface away to reveal black terrazzo. Brass flows into the founder scratch last and catches the light. It plays once, never loops, and under reduced motion the finished block simply shows.",
      "At rest the LEGEND block is the most desirable object in the set because it looks expensive in the way a hotel lobby floor does, not the way a game reward does: black stone, brass lines, a second faint reflection, and a scratch from 2026 that is now metal.",
    ],
    advantages: [
      "A silhouette nobody else owns: the I-beam with a course of bricks beneath it is recognisable as a solid shape at 120px and as a token at 24px, on both app grounds.",
      "Tessellation gives a natural group image: a league, a head-to-head or a share is the same blocks locking together, which no rectangle card can do.",
      "Progression is genuinely material (cast, sealed, ground, polished, inlaid), so five tiers read as five objects rather than five colours, and LEGEND has adult-grade beauty instead of game-reward glow.",
      "The finger scratch is the most human founder mark in the slate and is impossible to fake retroactively.",
      "The symmetric outline makes right-to-left a mirror rather than a redesign.",
    ],
    risks: [
      "At small sizes the double-T can read as a dog bone or a film strip; it depends on square corners, trapezoid notches and the deeper optical notches holding up. Test with real users at 24px before committing.",
      "Grey HOMA can read as drab or as a 'not loaded' state to the people it most needs to win; the road paint and chalk have to carry the energy.",
      "It is an unfamiliar identity object: the metaphor lands fully in the league view and the share, less so on a lone profile, and needs one line of onboarding copy.",
      "Terrazzo is a current interior-décor trend, so LEGEND could date; the paver itself is timeless, the polish might not be.",
      "How common double-T pavers are in Moroccan streets and squares is not verified; the concept leans on derb concrete generally, but a local check is needed before claiming it.",
      "Brass on light stone needs its epoxy bed to read; any production version must keep the bed or CHAMPION loses legibility.",
      "Heavy SVG: hundreds of seeded chips and lighting filters per card are fine in a gallery but need a rasterised or simplified path for long lists.",
      "The league pavement share must respect privacy (initials on discs, consent) and must not invent member counts.",
    ],
    gridWidth: 300,
    detailWidth: 440,

    full(p, o = {}) {
      const S = MC.s(o);
      return `<div class="c05 c05-card${o.thumb ? " is-thumb" : ""}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}">${cardSVG(p, o)}</div>`;
    },

    token(p, o = {}) {
      const S = MC.s(o);
      return `<span class="c05 c05-tok" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}">${tokenSVG(p, o)}</span>`;
    },

    row(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const nm = esc(MC.nameOf(p, o));
      const founder = p.founder ? `<span class="c05-row-f" aria-hidden="true"><bdi dir="ltr">·${String(p.founder).slice(-2)}</bdi></span>` : "";
      return (
        `<div class="c05 c05-row${o.me ? " is-me" : ""}" dir="${S.dir}" data-tier="${p.tier}" role="img" aria-label="${esc((o.rank || "") + ". " + MC.label(p, o) + ", " + (o.pts || "") + " " + S.pts)}">` +
        `<span class="c05-row-rank">${MC.ltr(o.rank ?? "")}</span>` +
        `<span class="c05-row-tok">${tokenSVG(p, { ...o, size: 44, mini: false })}</span>` +
        `<span class="c05-row-id"><b${ar ? ' class="ar"' : ""}>${nm}</b><small><i>${esc(S.tiers[p.tier])}</i>${founder}</small></span>` +
        `<span class="c05-row-pts"><b>${MC.ltr(o.pts ?? "")}</b><small>${esc(S.pts)}</small></span>` +
        `</div>`
      );
    },

    share(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const u = MC.uid(C + "s");
      const sc = 320 / 360;
      const ox = 20, oy = 262;
      const f = pavementField(sc, ox, oy, [-2, 1], [-1, 1], true);
      const cardW = 320, cardH = 236 * sc;
      const seed = seedOf(p);
      const X = (x) => (ar ? 360 - x : x);
      const nm = MC.nameOf(p, o);
      const logoW = 112;
      const logo = MC.logo("wordmark", { variant: "light", label: false, w: logoW, h: r2(logoW / MC.LOGO_RATIO.wordmark) });
      const ovr = esc(p.ovr);
      return (
        `<div class="c05 c05-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
        `<svg viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false">` +
        `<defs>` +
        `<radialGradient id="${u}-pool" cx="180" cy="300" r="330" gradientUnits="userSpaceOnUse" gradientTransform="translate(180 300) scale(1 1.15) translate(-180 -300)"><stop offset="0" stop-color="#cdfaff" stop-opacity=".26"/><stop offset=".3" stop-color="#73EDFA" stop-opacity=".12"/><stop offset=".7" stop-color="#73EDFA" stop-opacity=".03"/><stop offset="1" stop-color="#73EDFA" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${u}-vig" cx="180" cy="330" r="430" gradientUnits="userSpaceOnUse"><stop offset=".45" stop-color="#050b18" stop-opacity="0"/><stop offset="1" stop-color="#050b18" stop-opacity=".94"/></radialGradient>` +
        `<linearGradient id="${u}-foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050b18" stop-opacity="0"/><stop offset="1" stop-color="#050b18" stop-opacity=".9"/></linearGradient>` +
        `<mask id="${u}-onfaces" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="640"><path d="${f.faces}" fill="#fff"/></mask>` +
        `<filter id="${u}-paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".02 .3" numOctaves="2" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -2.2 2" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>` +
        `</defs>` +
        `<rect width="360" height="640" fill="#070c16"/>` +
        `<path d="${f.bands}" fill="#12161c"/>` +
        `<path d="${f.faces}" fill="#2a3038"/>` +
        // the huge 84, painted on the pavement in road paint; the joints break it
        `<g mask="url(#${u}-onfaces)"><text x="180" y="246" text-anchor="middle" ${BS} font-size="236" direction="ltr" fill="#F4F2EC" fill-opacity=".9" filter="url(#${u}-paint)">${ovr}</text></g>` +
        `<rect width="360" height="640" fill="url(#${u}-pool)"/>` +
        `<rect width="360" height="640" fill="url(#${u}-vig)"/>` +
        `<rect y="470" width="360" height="170" fill="url(#${u}-foot)"/>` +
        // ALI's block, lit, locked into its slot
        cardSVG(p, { ...o, motion: false, down: true }, `x="${ox}" y="${oy}" width="${cardW}" height="${r2(cardH)}"`) +
        // top: the logo at the inline start, the season at the end
        `<g transform="translate(${ar ? 360 - 22 - logoW : 22} 24)">${logo}</g>` +
        `<text x="${X(338)}" y="40" text-anchor="${ar ? "start" : "end"}" ${MR} font-size="11" letter-spacing="${ar ? 0 : 0.8}" fill="#a9b2be" direction="ltr">${esc(p.season)}</text>` +
        // bottom: the name, the handle, the tier and the founder line
        (ar
          ? `<text x="${X(22)}" y="556" text-anchor="end" ${AX(700)} font-size="40" fill="#F0F6FC" direction="rtl">${esc(nm)}</text>`
          : `<text x="${X(22)}" y="556" ${BS} font-size="50" letter-spacing="5" fill="#F0F6FC">${esc(nm)}</text>`) +
        `<text x="${X(22)}" y="582" text-anchor="${ar ? "end" : "start"}" ${MR} font-size="12" letter-spacing="1" fill="#a9b2be" direction="ltr" style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>` +
        (ar
          ? `<text x="${X(338)}" y="552" text-anchor="start" ${AX(700)} font-size="20" fill="#9BDBFD" direction="rtl">${esc(S.tiers[p.tier])}</text>`
          : `<text x="${X(338)}" y="552" text-anchor="end" ${BS} font-size="24" letter-spacing="2.4" fill="#9BDBFD">${esc(S.tiers[p.tier])}</text>`) +
        (p.founder
          ? ar
            ? `<text x="${X(338)}" y="580" text-anchor="start" ${AX(600)} font-size="12" fill="#d8c48f" direction="rtl">${esc(S.founderLine)}</text>`
            : `<text x="${X(338)}" y="580" text-anchor="end" ${MR} font-size="11" letter-spacing="1.2" fill="#d8c48f">${esc(S.founderLine)}</text>`
          : "") +
        `<text x="180" y="622" text-anchor="middle" ${ar ? AX(500) : MR} font-size="9" fill="#a9b2be" fill-opacity=".7"${ar ? "" : ' letter-spacing="1.4"'}>${ar ? "مثال" : "SAMPLE"}</text>` +
        `</svg></div>`
      );
    },

    mount(el) {
      if (!el || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
      const move = (e) => {
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 2 - 1;
        el.style.setProperty("--c05-lx", Math.max(-1, Math.min(1, x)).toFixed(3));
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", () => el.style.setProperty("--c05-lx", "0"));
    },
  };
  MC.register(c);
})();
