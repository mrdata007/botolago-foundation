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
  // Notch depth is about a quarter of the block so the double-T reads as a solid shape;
  // the token cuts it deeper still (an optical correction for small sizes).
  const NOTCH = { e: 84, d: 52, h: 40 };
  const NOTCH_TOK = { e: 92, d: 56, h: 48 };
  const NOTCH_MINI = { e: 96, d: 56, h: 52 };
  /** The paver: two square lobes, a waist, a trapezoid notch in each long side. */
  function paverPts(bite, notch = NOTCH, ch = CH) {
    const a = 180 - notch.e / 2, b = 180 - notch.d / 2, c = 180 + notch.d / 2, d = 180 + notch.e / 2;
    const P = ch ? [[ch, 0], [a, 0], [b, notch.h], [c, notch.h], [d, 0], [360 - ch, 0], [360, ch]] : [[0, 0], [a, 0], [b, notch.h], [c, notch.h], [d, 0], [360, 0]];
    // the first edge chip: a bite out of the bottom end corner (one per season played)
    if (bite) P.push([360, 151], [356.5, 154], [355, 159.5], [350, 163.5], [345, 168]);
    else if (ch) P.push([360, 168 - ch], [360 - ch, 168]);
    else P.push([360, 168]);
    P.push([d, 168], [c, 168 - notch.h], [b, 168 - notch.h], [a, 168]);
    if (ch) P.push([ch, 168], [0, 168 - ch], [0, ch]);
    else P.push([0, 168]);
    return P;
  }
  const mirror = (P) => P.map(([x, y]) => [360 - x, y]).reverse();

  /* The next course. The middle two half-blocks push tongues up into the paver's bottom notch and
     stop a joint short of it on every side, so the sand shows through and the interlock reads in
     silhouette. The outer two step in from the paver's ends. In the share's pavement (down) the
     outer blocks instead run to the ends and grow legs into the next row's top notch. */
  const CT = 176, CB = 228, JW = 5, STEP = 12;
  function coursePts(t = 4, down = false) {
    const n = NOTCH, a = 180 - n.e / 2, slope = (n.e - n.d) / 2 / n.h;
    const off = JW * Math.hypot(1, slope); // horizontal width of a JW joint across the slanted side
    const top = 168 - n.h + t + 3.5; // under the notch floor: its side band, then a 3.5u joint
    const xs = (y) => a + off + slope * (168 - y);
    const b2 = [[91 + CH, CT], [xs(CT), CT], [xs(top), top], [177 - CH, top], [177, top + CH], [177, CB - CH], [177 - CH, CB], [91 + CH, CB], [91, CB - CH], [91, CT + CH]];
    let b1;
    if (down) {
      // the next row sits half a block along; its top notch is centred on the joint at x = -3
      const c0 = -3, legB = 236 + n.h - 4 - 3.5;
      const lx = (y) => c0 + n.e / 2 - off - slope * (y - 236);
      b1 = [[CH, CT], [85 - CH, CT], [85, CT + CH], [85, CB - CH], [85 - CH, CB], [lx(CB), CB], [lx(legB), legB], [0, legB], [0, CT + CH]];
    } else b1 = [[STEP + CH, CT], [85 - CH, CT], [85, CT + CH], [85, CB - CH], [85 - CH, CB], [STEP + CH, CB], [STEP, CB - CH], [STEP, CT + CH]];
    return [b1, b2, mirror(b2), mirror(b1)];
  }
  const COURSE_CX = [(STEP + 85) / 2, 134, 226, 360 - (STEP + 85) / 2];
  const tongueTop = (t) => 168 - NOTCH.h + t + 3.5;

  /** Offsets a closed polygon inward by d (mitred). */
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
      return { px: p[0] + nx * d, py: p[1] + ny * d, dx, dy };
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
      const dx = q[0] - p[0], dy = q[1] - p[1];
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
  // black terrazzo: greys, white marble and lapis — no brass in the aggregate (brass is kept for the strips)
  const LEGEND_CHIPS = [
    { c: "#363b44", w: 0.3 }, { c: "#545b66", w: 0.2 }, { c: "#868c96", w: 0.13 }, { c: "#d6d9de", w: 0.1 },
    { c: "#ECE8DF", w: 0.08 }, { c: "#0C3164", w: 0.12 }, { c: "#9BDBFD", w: 0.04 }, { c: "#0151FC", w: 0.03 },
  ];
  /* tool = the colour of lettering cut into the stone: ink, plus a lip that catches the light. */
  const TIER = {
    HOMA: {
      stone: "#8a8f95", band: "#5f646a", bandLo: "#3c4045", t: 4, bev: 3.6, hiA: 0.34, loA: 0.42, edge: "rgba(20,22,26,.5)",
      rf: "0.045", ss: 2.8, el: 46, gd: 3.2, gl: 2.6, rough: true, pin: 80, marks: true, broom: true,
      tool: { ink: "#1f2226", lip: "#c9cdd1", lo: 0.6 }, num: "paint", stat: "chalk", fig: "groove", fill: "#F4F2EC",
    },
    STADE: {
      stone: "#565d65", band: "#383d43", bandLo: "#212428", t: 4, bev: 3, hiA: 0.42, loA: 0.5, edge: "#7d848c",
      rf: "0.07", ss: 1.3, el: 52, gd: 2.6, gl: 2.2, sheen: true, pin: 24, bite: true,
      tool: { ink: "#E6E9EC", lip: "#1a1d21", lo: 0.6 }, num: "stencil", fig: "stencil", fill: "#F2F4F5",
    },
    PRO: {
      stone: "#E9E6DF", band: "#B9B4A8", bandLo: "#8f8a7f", t: 4, bev: 2.6, hiA: 0.6, loA: 0.24, edge: "#858D99",
      rf: "0.11", ss: 0.55, el: 60, gd: 2.2, gl: 0, chips: PRO_CHIPS, bite: true,
      tool: { ink: "#5a564f", lip: "#ffffff", lo: 0.5 }, num: "cement", fig: "marq", fill: "#0C3164",
    },
    CHAMPION: {
      stone: "#EEEBE4", band: "#B9B4A8", bandLo: "#8f8a7f", t: 4, bev: 2.2, hiA: 0.6, loA: 0.26, edge: "#858D99",
      rf: "0.11", ss: 0.35, el: 64, gd: 2, gl: 0, chips: PRO_CHIPS, bite: true, polish: 1, strips: true,
      tool: { ink: "#5a564f", lip: "#ffffff", lo: 0.5 }, num: "cementBrass", fig: "marqBrass", scratch: "resin", fill: "#0C3164",
    },
    LEGEND: {
      stone: "#1B1F26", band: "#2A2F36", bandLo: "#14171c", t: 6, bev: 1.8, hiA: 0.26, loA: 0.5, edge: "#737B86",
      rf: "0.11", ss: 0.25, el: 66, gd: 0, gl: 2.4, chips: LEGEND_CHIPS, bite: true, polish: 2, strips: true,
      tool: { ink: "#b9bec6", lip: null, lo: 0.5 }, num: "marble", fig: "legend", scratch: "brass", fill: "#ECE8DF",
    },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;

  /** Seeded aggregate chips: irregular polygons, power-law sizes, one path per colour.
      keep: text boxes [x0,y0,x1,y1] the aggregate must not touch. */
  function chipPaths(seed, palette, count, rmin, rmax, box, opacity, keep) {
    const R = rng(seed);
    const groups = palette.map(() => []);
    for (let i = 0; i < count; i++) {
      const x = box[0] + R() * box[2], y = box[1] + R() * box[3];
      const r = rmin + (rmax - rmin) * Math.pow(R(), 2.3);
      let u = R(), k = 0;
      while (k < palette.length - 1 && u > palette[k].w) { u -= palette[k].w; k++; }
      const nv = 4 + Math.floor(R() * 3), a0 = R() * 6.283;
      const jit = [];
      for (let j = 0; j < nv; j++) jit.push([R(), R()]);
      if (keep && keep.some((b) => x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3])) continue;
      let d = "M";
      for (let j = 0; j < nv; j++) {
        const a = a0 + (j * 6.283) / nv + (jit[j][0] - 0.5) * 0.8, rr = r * (0.55 + jit[j][1] * 0.55);
        d += `${r1(x + Math.cos(a) * rr)} ${r1(y + Math.sin(a) * rr * 0.85)}` + (j < nv - 1 ? "L" : "");
      }
      groups[k].push(d + "Z");
    }
    return palette.map((p, k) => (groups[k].length ? `<path d="${groups[k].join("")}" fill="${p.c}"${opacity ? ` fill-opacity="${opacity}"` : ""}/>` : "")).join("");
  }
  function dots(seed, count, rmin, rmax, box, fill, op, keep) {
    const R = rng(seed);
    let d = "";
    for (let i = 0; i < count; i++) {
      const x = r1(box[0] + R() * box[2]), y = r1(box[1] + R() * box[3]), r = r2(rmin + (rmax - rmin) * R());
      if (keep && keep.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])) continue;
      d += `M${r2(x - r)} ${y}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0`;
    }
    return d ? `<path d="${d}" fill="${fill}" fill-opacity="${op}"/>` : "";
  }
  /** Broom finish: near-horizontal drag lines left by the broom on fresh concrete. */
  function broom(seed, count, box) {
    const R = rng(seed + 31);
    let dk = "", lt = "";
    for (let i = 0; i < count; i++) {
      const y = box[1] + ((i + R() * 0.8) / count) * box[3];
      const x0 = box[0] + R() * 60 - 20, x1 = box[0] + box[2] - R() * 60 + 20;
      const m = (x0 + x1) / 2, dy = (R() - 0.5) * 2.4;
      const d = `M${r1(x0)} ${r1(y)}Q${r1(m)} ${r1(y + dy)} ${r1(x1)} ${r1(y + (R() - 0.5) * 1.6)}`;
      if (i % 2) lt += d; else dk += d;
    }
    return `<path d="${dk}" fill="none" stroke="#000" stroke-opacity=".07" stroke-width=".5"/><path d="${lt}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width=".5"/>`;
  }

  /* ---------- type ---------- */
  const BS = `font-family="Big Shoulders Display" font-weight="800"`;
  const MR = `font-family="Manrope" font-weight="700"`;
  const AX = (w) => `font-family="Alexandria" font-weight="${w}"`;
  // advances per em, measured in Chromium (Big Shoulders Display 800)
  const BSW = { A: .44, B: .44, C: .45, D: .46, E: .38, F: .38, G: .46, H: .45, I: .22, J: .42, K: .46, L: .37, M: .69, N: .51, O: .46, P: .44, Q: .46, R: .44, S: .44, T: .38, U: .45, V: .46, W: .73, X: .44, Y: .43, Z: .39, " ": .22, "#": .69, "·": .18, 0: .47, 1: .26, 2: .46, 3: .47, 4: .48, 5: .48, 6: .47, 7: .45, 8: .47, 9: .47 };
  const bsW = (s) => [...String(s)].reduce((a, c) => a + (BSW[c] ?? 0.45), 0);
  // Alexandria 300 (the scratch): ALI 1.53em, ·26 1.42em; Arabic about .59em a letter at 300, .65 at 700
  const AX3L = { A: 0.66, L: 0.55, I: 0.32 };
  const scratchW = (s, ar) => (ar ? [...String(s)].length * 0.59 : [...String(s)].reduce((a, c) => a + (AX3L[c] ?? 0.64), 0));
  const arW = (s, w = 700) => [...String(s)].length * (w >= 700 ? 0.65 : 0.5);

  /** Lettering cut into the stone: a lip catches the light down-right, the ink sits on top.
      Arabic gets a single fill with a quarter-unit lip so its joins never double. */
  function tooled(x, y, str, attrs, tool, ar) {
    const off = ar ? 0.25 : tool.lo;
    const lipA = ar ? 0.5 : 0.85;
    return (tool.lip ? `<text x="${r2(x + off)}" y="${r2(y + off)}" ${attrs} fill="${tool.lip}" fill-opacity="${lipA}">${str}</text>` : "") + `<text x="${r2(x)}" y="${r2(y)}" ${attrs} fill="${tool.ink}">${str}</text>`;
  }

  function brassStops(hi) {
    return hi
      ? `<stop offset="0" stop-color="#9c7a33"/><stop offset=".2" stop-color="#f6e3a4"/><stop offset=".34" stop-color="#c9a24e"/><stop offset=".5" stop-color="#fff2c8"/><stop offset=".6" stop-color="#d4b266"/><stop offset=".8" stop-color="#94722e"/><stop offset="1" stop-color="#ecd28c"/>`
      : `<stop offset="0" stop-color="#7c5c22"/><stop offset=".18" stop-color="#e8cd86"/><stop offset=".33" stop-color="#ad853a"/><stop offset=".5" stop-color="#f3dc9a"/><stop offset=".62" stop-color="#c29a45"/><stop offset=".82" stop-color="#83632a"/><stop offset="1" stop-color="#e2c47c"/>`;
  }
  /** White marble for the LEGEND inlays: #ECE8DF with faint grey veins, seeded per member. */
  function marblePattern(id, seed) {
    const R = rng(seed + 77);
    let v = "", f = "";
    for (let i = 0; i < 7; i++) {
      const x0 = -20 + R() * 400, y0 = -10 + R() * 60, x1 = x0 + 60 + R() * 120, y1 = y0 + 150 + R() * 90;
      const d = `M${r1(x0)} ${r1(y0)}C${r1(x0 + 40 + R() * 40)} ${r1(y0 + 60)} ${r1(x1 - 60 - R() * 40)} ${r1(y1 - 70)} ${r1(x1)} ${r1(y1)}`;
      if (i % 3) f += d; else v += d;
    }
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="360" height="236"><rect width="360" height="236" fill="#ECE8DF"/><path d="${v}" fill="none" stroke="#8d939c" stroke-opacity=".42" stroke-width=".9"/><path d="${f}" fill="none" stroke="#a7acb3" stroke-opacity=".32" stroke-width=".5"/></pattern>`;
  }
  /** Concrete or stone: noise lit by a raking light, grain, an optional wet sheen. */
  function stoneFilter(id, T, seed) {
    const sv = Math.sin((T.el * Math.PI) / 180);
    return (
      `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${T.rf}" numOctaves="4" seed="${seed}" result="n"/>` +
      `<feDiffuseLighting in="n" surfaceScale="${T.ss}" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="${T.el}"/></feDiffuseLighting>` +
      `<feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="${r2(1 / sv)}" result="lit"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="${seed + 7}" result="g"/>` +
      `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${T.gd} 0 0 0 ${r2(-T.gd * 0.6)}" result="gd"/>` +
      `<feColorMatrix in="g" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 ${T.gl} 0 0 ${r2(-T.gl * 0.6)}" result="gl"/>` +
      `<feMerge result="m"><feMergeNode in="lit"/><feMergeNode in="gd"/><feMergeNode in="gl"/></feMerge>` +
      (T.sheen
        ? `<feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="2" seed="${seed + 2}" result="w"/>` +
          `<feSpecularLighting in="w" surfaceScale="7" specularConstant="1.3" specularExponent="24" lighting-color="#e4f3ff" result="sp"><feDistantLight azimuth="225" elevation="38"/></feSpecularLighting>` +
          `<feComposite in="m" in2="sp" operator="arithmetic" k2="1" k3=".55" result="m2"/><feComposite in="m2" in2="SourceAlpha" operator="in"/>`
        : `<feComposite in="m" in2="SourceAlpha" operator="in"/>`) +
      `</filter>`
    );
  }

  /* ---------- the figure: the shared avatar, cut into the stone ---------- */
  function figure(T, x, y, s, u, seed, mini) {
    const A = MC.AVATAR;
    const sw = (n) => r2(n / s);
    const open = `<g transform="translate(${r2(x)} ${r2(y)}) scale(${s})">`;
    const P = (d) => `<path d="${d}"/>`;
    const box = `x="-20" y="-20" width="240" height="280"`;
    if (T.fig === "groove") {
      // HOMA: a groove cut in raw concrete; the wall nearer the light is in shadow, the far wall lit,
      // and the hair is pressed in as a rough darker patch
      if (mini) return open + `<g fill="#62676d">${P(A.torso)}${P(A.head)}</g><path d="${A.hair}" fill="#4c5056"/></g>`;
      const lines = [A.torso, A.collar, A.ears, A.hair].map(P).join("") + P(A.seam);
      return (
        `<defs><mask id="${u}-gv" maskUnits="userSpaceOnUse" ${box}><g fill="none" stroke="#fff" stroke-width="${sw(3.2)}" stroke-linejoin="round" stroke-linecap="round">${lines}</g></mask>` +
        `<filter id="${u}-press" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="${r2(0.16 * s)}" numOctaves="3" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${sw(3)}" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency="${r2(1.3 * s)}" numOctaves="1" seed="${seed + 3}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.6 -.7" result="gm"/><feComposite in="d" in2="gm" operator="in"/></filter></defs>` +
        open +
        `<path d="${A.hair}" fill="#4f5359" fill-opacity=".6" filter="url(#${u}-press)"/>` +
        `<g fill="none" stroke="#6a6f75" stroke-width="${sw(3.2)}" stroke-linejoin="round" stroke-linecap="round">${lines}</g>` +
        `<g mask="url(#${u}-gv)" fill="none" stroke-linejoin="round" stroke-linecap="round">` +
        `<g transform="translate(${sw(-1)} ${sw(-1)})" stroke="#1d2024" stroke-opacity=".85" stroke-width="${sw(2)}">${lines}</g>` +
        `<g transform="translate(${sw(1.1)} ${sw(1.1)})" stroke="#e1e4e7" stroke-opacity=".8" stroke-width="${sw(1.6)}">${lines}</g>` +
        `</g></g>`
      );
    }
    if (T.fig === "stencil") {
      // STADE: two sprayed stencils, sky then navy, bridges left as gaps, one off register by 1u
      const sky = "#9BDBFD", navy = "#0C3164";
      if (mini) return open + `<g fill="${sky}">${P(A.torso)}${P(A.neck)}${P(A.head)}</g><path d="${A.hair}" fill="${navy}"/></g>`;
      const skyP = [A.torso, A.neck, A.ears, A.head].map(P).join("");
      const navyP = P(A.hair) + P(A.collar);
      return (
        `<defs>` +
        `<mask id="${u}-sk" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/><g fill="none" stroke="#000" stroke-width="${sw(2)}"><path d="${A.seam}"/><path d="${A.collar}"/><path d="M100 146V178"/></g></mask>` +
        `<mask id="${u}-nv" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/><g fill="none" stroke="#000" stroke-width="${sw(2)}"><path d="M70 98C86 89 114 89 130 98"/><path d="M100 160V194"/></g></mask>` +
        `<filter id="${u}-halo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${sw(1.5)}"/></filter>` +
        `<filter id="${u}-fs" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency="${r2(1.1 * s)}" numOctaves="1" seed="${seed + 8}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 -.62" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>` +
        `</defs>` +
        open +
        `<g fill="${sky}" opacity=".3" filter="url(#${u}-halo)">${skyP}</g>` +
        `<g mask="url(#${u}-sk)"><g fill="${sky}" filter="url(#${u}-fs)">${skyP}</g></g>` +
        `<g transform="translate(${sw(1)} ${sw(-0.8)})">` +
        `<g fill="${navy}" opacity=".35" filter="url(#${u}-halo)">${navyP}</g>` +
        `<g mask="url(#${u}-nv)"><g fill="${navy}" filter="url(#${u}-fs)">${navyP}</g></g>` +
        `</g></g>`
      );
    }
    // marquetry: flush stone pieces separated by cut lines (grey at PRO, brass from CHAMPION)
    const legend = T.fig === "legend";
    const brass = T.fig !== "marq";
    const cut = brass ? `url(#${u}-brass${legend ? "Hi" : ""})` : "#5F6368";
    const cw = sw(mini ? (brass ? 7 : 5) : brass ? 1.4 : 1);
    const jacket = "#0C3164"; // navy granite at PRO, lapis at LEGEND (denser sky flecks)
    const skin = legend ? "#8a6a55" : "#B9906E";
    const hair = legend ? "#2e333c" : "#1B1F26";
    const collar = "#0151FC";
    const st = `stroke="${cut}" stroke-width="${cw}" stroke-linejoin="round"`;
    if (mini)
      return open + `<path d="${A.torso}" fill="${jacket}" ${st}/><path d="${A.head}" fill="${skin}" ${st}/><path d="${A.hair}" fill="${hair}" ${st}/></g>`;
    const specks = `<g clip-path="url(#${u}-torso)">${chipPaths(seed + 11, legend ? [{ c: "#9BDBFD", w: 0.5 }, { c: "#ffffff", w: 0.22 }, { c: "#4f7fd8", w: 0.28 }] : [{ c: "#9BDBFD", w: 0.45 }, { c: "#ffffff", w: 0.3 }, { c: "#0151FC", w: 0.25 }], legend ? 110 : 70, 0.8, 2.6, [8, 172, 184, 68])}</g>`;
    const vein = `<path d="M66 72C88 62 96 82 112 74S130 60 136 66M74 104C90 96 102 112 122 100M84 54C94 66 112 52 120 60" fill="none" stroke="${legend ? "#f4f2ec" : "#e8e6e1"}" stroke-opacity="${legend ? 0.5 : 0.35}" stroke-width="${sw(0.5)}"/>`;
    return (
      `<defs><clipPath id="${u}-torso"><path d="${A.torso}"/></clipPath><clipPath id="${u}-hair"><path d="${A.hair}"/></clipPath></defs>` +
      open +
      `<path d="${A.torso}" fill="${jacket}" ${st}/>${specks}` +
      `<path d="${A.seam}" fill="none" ${st}/>` +
      `<path d="${A.neck}" fill="${skin}" ${st}/>` +
      `<path d="${A.collar}" fill="${collar}" ${st}/>` +
      `<path d="${A.ears}" fill="${skin}" ${st}/>` +
      `<path d="${A.head}" fill="${skin}" ${st}/>` +
      `<path d="${A.hair}" fill="${hair}" ${st}/>` +
      `<g clip-path="url(#${u}-hair)">${vein}</g></g>`
    );
  }

  /* ---------- inlaid figures (number, name, tier word, stat values) in the tier's material ---------- */
  /** Words are set in the same material with a lighter hand: paint without the heavy wear, stencil without bridges. */
  const wordAs = (T) => (T.num === "paint" ? "paintS" : T.num === "stencil" ? "stencilNB" : null);
  function inlay(T, x, y, size, str, anchor, u, extra = "", as) {
    const a = `x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-size="${r2(size)}" ${extra}`;
    const k = size / 100;
    const grime = `<text ${a} fill="none" stroke="#25282c" stroke-opacity=".36" stroke-width="${r2(Math.max(1, 2.6 * k))}" stroke-linejoin="round" filter="url(#${u}-grime)">${str}</text>`;
    switch (as || T.num) {
      case "paint": // HOMA: road paint, brushed on and worn patchy; dirt has collected along its edge
        return grime + `<text ${a} fill="${T.fill}" filter="url(#${u}-paint)">${str}</text>`;
      case "paintS": // the same paint on a word: pitted, not worn through
        return grime + `<text ${a} fill="${T.fill}" filter="url(#${u}-paintS)">${str}</text>`;
      case "chalk":
        return grime + `<text ${a} fill="${T.fill}" filter="url(#${u}-chalk)">${str}</text>`;
      case "stencil": // STADE: sprayed through a stencil — bridges and overspray
        return `<text ${a} fill="#ffffff" opacity=".2" filter="url(#${u}-os)">${str}</text><g mask="url(#${u}-bridge)"><text ${a} fill="${T.fill}" filter="url(#${u}-spray)">${str}</text></g>`;
      case "stencilNB": // the same spray, for words (no bridges)
        return `<text ${a} fill="#ffffff" opacity=".2" filter="url(#${u}-os)">${str}</text><text ${a} fill="${T.fill}" filter="url(#${u}-spray)">${str}</text>`;
      case "cement": // PRO: navy cement inlay, a fine cut line around it
        return `<text ${a} fill="${T.fill}" stroke="#3a3e46" stroke-opacity=".55" stroke-width="${r2(Math.max(0.6, 1.4 * k))}" paint-order="stroke">${str}</text>`;
      case "cementBrass": { // CHAMPION: navy cement held in a brass strip bent around each glyph
        const w = r2(size >= 40 ? 2.8 * k : size >= 20 ? 1.5 : 1);
        return `<text ${a} fill="${T.fill}" stroke="#4a3812" stroke-opacity=".5" stroke-width="${r2(w + (size >= 20 ? 1 : 0.6))}" stroke-linejoin="round" paint-order="stroke">${str}</text><text ${a} fill="${T.fill}" stroke="url(#${u}-brass)" stroke-width="${w}" stroke-linejoin="round" paint-order="stroke">${str}</text>`;
      }
      default: { // LEGEND: white marble with faint veins, held in brass
        const w = r2(size >= 40 ? 2.6 * k : size >= 20 ? 1.4 : 0.9);
        return `<text ${a} fill="#0b0d10" stroke="#0b0d10" stroke-width="${r2(w + (size >= 20 ? 1.2 : 0.7))}" stroke-linejoin="round">${str}</text><text ${a} fill="url(#${u}-marble)" stroke="url(#${u}-brassHi)" stroke-width="${w}" stroke-linejoin="round" paint-order="stroke">${str}</text>`;
      }
    }
  }

  /* ---------- the founder scratch: the name and ·26 drawn with a finger in wet cement ---------- */
  function scratch(p, o, T, u, x, y, keep) {
    if (!p.founder) return "";
    const ar = MC.isAr(o);
    const fs = 18;
    const nm = ar ? p.name.ar : p.name.lat;
    const nW = r2(scratchW(nm, ar) * fs);
    const yy = String(p.founder).slice(-2);
    const tail = ar ? `${yy}·` : `·${yy}`; // the dot always sits against the name
    const tW = 1.42 * fs;
    const x2 = ar ? x - nW - 1 : x + nW + 1;
    const F = `font-family="Alexandria" font-weight="300" font-size="${fs}"`;
    const runs = (dx, dy, attrs) =>
      `<text x="${r2(x + dx)}" y="${r2(y + dy)}" ${F} text-anchor="start"${ar ? ` direction="rtl"` : ""} textLength="${nW}" lengthAdjust="spacingAndGlyphs" ${attrs}>${esc(nm)}</text>` +
      `<text x="${r2(x2 + dx)}" y="${r2(y + dy)}" ${F} text-anchor="${ar ? "end" : "start"}" direction="ltr" ${attrs}>${tail}</text>`;
    const groove = (c, a, w) => `fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-opacity="${a}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
    let cut;
    if (T.scratch === "brass") {
      // LEGEND: the groove is filled with brass, flush with the black stone
      cut = runs(0, 0, groove("#07080a", 0.9, 2.8)) + `<g class="c05-flow">${runs(0, 0, groove(`url(#${u}-brassHi)`, 1, 1.8))}</g>`;
    } else {
      cut =
        runs(0.6, 0.7, groove("#C4C9CE", T.num === "stencil" ? 0.55 : 0.9, 1.4)) + // the lit far wall
        runs(0, 0, groove("#3E4348", 0.7, 2)) + // the groove
        runs(-0.4, -0.5, groove("#000", 0.25, 1)); // the shadowed near wall
    }
    let resin = "";
    const w = nW + 1 + tW + 14;
    if (T.scratch === "resin") {
      // CHAMPION: the scratch is sealed under a clear resin oval (a floor someone chose to protect)
      const cx = ar ? x - w / 2 + 7 : x + w / 2 - 7, cy = y - fs * 0.34;
      resin =
        `<g clip-path="url(#${u}-paver)">` +
        `<ellipse cx="${r2(cx)}" cy="${r2(cy + 0.9)}" rx="${r2(w / 2)}" ry="${r2(fs * 0.74)}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="1.2"/>` +
        `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(w / 2)}" ry="${r2(fs * 0.74)}" fill="url(#${u}-resin)" stroke="#7d776b" stroke-opacity=".6" stroke-width=".7"/>` +
        `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(w / 2 - 1.3)}" ry="${r2(fs * 0.74 - 1.3)}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".6"/>` +
        `<path d="M${r2(cx - w * 0.24)} ${r2(cy - fs * 0.5)}Q${r2(cx - w * 0.08)} ${r2(cy - fs * 0.68)} ${r2(cx + w * 0.08)} ${r2(cy - fs * 0.62)}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".9" stroke-linecap="round"/>` +
        `</g>`;
    }
    const x0 = ar ? x - w + 7 : x - 2, x1 = ar ? x + 2 : x + w - 7;
    keep.push([x0 - 2, y - fs - 6, x1 + 2, y + (ar ? fs * 0.55 : 4)]);
    const rot = `rotate(${ar ? 4 : -4} ${r2(x)} ${r2(y)})`;
    return `<g transform="${rot}"><g filter="url(#${u}-wob)">${cut}</g>${resin}</g>`;
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
    const course = coursePts(T.t).map(MP);
    const blocks = [paver, ...course];
    const union = blocks.map(dPoly).join("");
    const bandD = blocks.map((P) => dPoly(P.map(([x, y]) => [x, y + T.t]))).join("");
    const legend = p.tier === "LEGEND";
    const motion = !!o.motion && legend && !thumb;
    const keep = [];
    const kb = (x0, y0, x1, y1) => keep.push([Math.min(x0, x1) - 2, Math.min(y0, y1) - 2, Math.max(x0, x1) + 2, Math.max(y0, y1) + 2]);
    const tool = T.tool;
    let gaps = ""; // stencil bridges (STADE)
    const bridges = (cx, y, size, str, anchor) => {
      const s = String(str);
      const total = bsW(s) * size;
      let left = anchor === "middle" ? cx - total / 2 : anchor === "end" ? cx - total : cx;
      for (const ch of s) {
        const w = (BSW[ch] ?? 0.45) * size;
        if (ch !== "1") gaps += `<rect x="${r2(left + w / 2 - size * 0.021)}" y="${r2(y - size * 0.85)}" width="${r2(size * 0.042)}" height="${r2(size * 0.9)}" fill="#000"/>`;
        left += w;
      }
    };

    /* ---- lettering and inlays first, so the aggregate can keep clear of them ---- */
    let ink = "";
    // the figure, inlaid in the start lobe
    ink += `<g clip-path="url(#${u}-paver)">${figure(T, X(ar ? 139 : 29), 36, 0.55, u, seed, false)}</g>`;
    // the founder scratch and its date line
    if (!thumb) ink += scratch(p, o, T, u, X(14), 28, keep);
    if (p.founder && !thumb) {
      const cap = esc(S.founderLine);
      if (ar) {
        ink += tooled(X(14), 44, cap, `${AX(600)} font-size="7.4" text-anchor="start" direction="rtl"`, tool, true);
        kb(X(14), 36, X(14) - arW(S.founderLine, 600) * 7.4, 47);
      } else {
        ink += tooled(X(14), 41, cap, `${MR} font-size="6.4" letter-spacing=".8"`, tool);
        kb(14, 35, 14 + 7.33 * 6.4 + 9, 42);
      }
    }
    if (!thumb) {
      // the waist: wordmark, crest, tier, country, season
      const lw = 44, lh = lw / MC.LOGO_RATIO.wordmark;
      const logo = (color, extra = "") => `<g transform="translate(${r2(180 - lw / 2)} 46)"${extra}>${MC.logo("wordmark", { variant: "mono", color, label: false, w: lw, h: r2(lh) })}</g>`;
      if (T.num === "paint" || T.num === "stencil") ink += `<g transform="translate(.5 .5)" opacity=".85">${logo(tool.lip)}</g>` + logo(tool.ink);
      else if (legend) ink += logo("#ECE8DF");
      else ink += logo("#0151FC", ` stroke="#3a3e46" stroke-opacity=".5" stroke-width="30" paint-order="stroke"`);
      kb(180 - lw / 2, 46, 180 + lw / 2, 46 + lh);
      const crest = (opts) => `<g transform="translate(173 59)">${MC.crest({ w: 14, h: 17, ...opts })}</g>`;
      if (T.num === "paint" || T.num === "stencil") ink += `<g transform="translate(.5 .5)" opacity=".85">${crest({ mono: tool.lip })}</g>` + crest({ mono: tool.ink });
      else if (legend) ink += crest({ fill: "#2a2f38", sash: "#ECE8DF", ring: "#ECE8DF" });
      else ink += crest({ fill: "#3b4a5e", sash: "#e9e4d6", ring: T.strips ? "#C29A45" : "#5F6368" });
      kb(173, 59, 187, 76);
      const tw = S.tiers[p.tier];
      if (ar) {
        const fs = Math.max(10, Math.min(15, 38 / arW(tw)));
        ink += inlay(T, 180, 99, fs, esc(tw), "middle", u, `${AX(700)} direction="rtl"`, wordAs(T));
        kb(180 - (arW(tw) * fs) / 2, 99 - fs * 0.95, 180 + (arW(tw) * fs) / 2, 99 + fs * 0.32);
      } else {
        const est = bsW(tw);
        const fs = Math.min(16, (38 * 1.15) / est);
        const fit = est * fs > 38 ? ` textLength="38" lengthAdjust="spacingAndGlyphs"` : "";
        ink += inlay(T, 180, 98, fs, esc(tw), "middle", u, `${BS}${fit}`, wordAs(T));
        kb(180 - Math.min(38, est * fs) / 2, 98 - fs * 0.8, 180 + Math.min(38, est * fs) / 2, 98);
      }
      if (ar) {
        ink += tooled(180, 112, esc(S.country), `${AX(600)} font-size="9" text-anchor="middle" direction="rtl"`, tool, true);
        kb(162, 104, 198, 115);
      } else {
        ink += tooled(180, 110.5, esc(S.country), `${MR} font-size="6.8" letter-spacing=".3" text-anchor="middle"`, tool);
        kb(160, 105, 200, 111);
      }
      ink += tooled(180, 122, esc(p.season), `${MR} font-size="7.6" text-anchor="middle" direction="ltr" style="font-variant-numeric:tabular-nums"`, tool);
      kb(165, 116, 195, 123);
    }
    // the end lobe: name, the 84, the ID — all inlaid in the tier's material
    const ex = X(291);
    if (!thumb) {
      const nm = MC.nameOf(p, o);
      if (ar) {
        const fs = Math.min(26, 112 / arW(nm));
        ink += inlay(T, ex, 33, fs, esc(nm), "middle", u, `${AX(700)} direction="rtl"`, wordAs(T));
        kb(ex - (arW(nm) * fs) / 2, 33 - fs * 0.9, ex + (arW(nm) * fs) / 2, 33 + fs * 0.6);
      } else {
        const fs = Math.min(26, 112 / (bsW(nm) + 0.02 * nm.length));
        ink += inlay(T, ex, 36, fs, esc(nm), "middle", u, `${BS} letter-spacing="${r2(fs * 0.02)}"`, wordAs(T));
        kb(ex - (bsW(nm) * fs) / 2, 36 - fs * 0.8, ex + (bsW(nm) * fs) / 2, 36);
      }
    }
    const ny = ar ? 135 : 131;
    ink += inlay(T, ex, ny, 100, esc(p.ovr), "middle", u, `${BS} direction="ltr"`);
    if (T.num === "stencil") bridges(ex, ny, 100, p.ovr, "middle");
    kb(ex - 48, ny - 81, ex + 48, ny + 1);
    if (!thumb) {
      const iy = ar ? 155 : 152;
      ink += tooled(ex, iy, esc(p.id), `${MR} font-size="8" letter-spacing=".5" text-anchor="middle" direction="ltr" style="font-variant-numeric:tabular-nums"`, tool);
      kb(ex - 28, iy - 6.5, ex + 28, iy + 1);
    }
    // the course: one stat per half-block, label cut in, value inlaid
    if (!thumb) {
      MC.STATS.forEach((k, i) => {
        const cx = X(COURSE_CX[i]);
        const v = String(p.stats[k]);
        const lab = esc(S.stats[k]);
        const valAs = T.stat || (T.num === "stencil" ? "stencil" : null);
        if (ar) {
          const lfs = Math.max(10, Math.min(10.5, 60 / arW(S.stats[k], 600)));
          ink += tooled(cx, 194, lab, `${AX(600)} font-size="${r2(lfs)}" text-anchor="middle" direction="rtl"`, tool, true);
          kb(cx - (arW(S.stats[k], 600) * lfs) / 2, 184, cx + (arW(S.stats[k], 600) * lfs) / 2, 198);
          ink += inlay(T, cx, 221, 22, v, "middle", u, `${BS} direction="ltr"`, valAs);
          if (T.num === "stencil") bridges(cx, 221, 22, v, "middle");
          kb(cx - 12, 203, cx + 12, 222);
        } else {
          const lw = bsW(S.stats[k]) * 15 + 0.9 * S.stats[k].length, vw = bsW(v) * 23, gap = 4.5;
          const x0 = X(COURSE_CX[i]) - (lw + gap + vw) / 2;
          ink += tooled(x0, 211, lab, `${BS} font-size="15" letter-spacing=".9"`, tool);
          ink += inlay(T, x0 + lw + gap, 211, 23, v, "start", u, BS, valAs);
          if (T.num === "stencil") bridges(x0 + lw + gap, 211, 23, v, "start");
          kb(x0, 192, x0 + lw + gap + vw, 212);
        }
      });
    }

    /* ---- defs ---- */
    let defs =
      `<clipPath id="${u}-faces"><path d="${union}"/></clipPath>` +
      `<clipPath id="${u}-paver"><path d="${dPoly(paver)}"/></clipPath>` +
      `<filter id="${u}-sh" x="-8%" y="-8%" width="116%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="6" result="b"/><feFlood style="flood-color:var(--c05-shadow,#000);flood-opacity:var(--c05-shadow-a,.7)"/><feComposite in2="b" operator="in"/></filter>` +
      stoneFilter(`${u}-stone`, T, seed) +
      `<linearGradient id="${u}-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.band}"/><stop offset="1" stop-color="${T.bandLo}"/></linearGradient>` +
      `<linearGradient id="${u}-brass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="236">${brassStops(false)}</linearGradient>` +
      `<linearGradient id="${u}-brassHi" gradientUnits="userSpaceOnUse" x1="${ar ? 360 : 0}" y1="0" x2="${ar ? 0 : 360}" y2="236">${brassStops(true)}</linearGradient>` +
      `<radialGradient id="${u}-resin" cx=".42" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".6" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#cfe6ee" stop-opacity=".1"/></radialGradient>` +
      // the finger's wobble: a slight displacement, no holes punched through the groove
      `<filter id="${u}-wob" x="-10%" y="-30%" width="120%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale=".8" xChannelSelector="R" yChannelSelector="G"/></filter>` +
      `<filter id="${u}-spray" x="-6%" y="-6%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="${seed + 8}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 -.7" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>` +
      `<filter id="${u}-os" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      // road paint: isotropic wear in patches, then the aggregate pits that the paint never filled
      `<filter id="${u}-paint" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="${seed + 4}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -4.6 3.5" result="m"/><feComposite in="d" in2="m" operator="in" result="p"/><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="1" seed="${seed + 12}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 12 0 0 0 -3.1" result="gm"/><feComposite in="p" in2="gm" operator="in"/></filter>` +
      `<filter id="${u}-paintS" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="${seed + 13}" result="g"/><feDisplacementMap in="SourceGraphic" in2="g" scale=".6" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 12 0 0 0 -2.9" result="gm"/><feComposite in="d" in2="gm" operator="in"/></filter>` +
      `<filter id="${u}-grime" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="${seed + 14}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="1.4" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation=".45"/></filter>` +
      `<filter id="${u}-chalk" x="-4%" y="-10%" width="108%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${seed + 5}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -3.2 2.9" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>` +
      (T.rough ? `<filter id="${u}-rough" x="-2%" y="-3%" width="104%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="${seed + 1}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter>` : "") +
      `<linearGradient id="${u}-pol" gradientUnits="userSpaceOnUse" x1="${ar ? 250 : 110}" y1="0" x2="${ar ? 190 : 170}" y2="70"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-rake" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="0"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${legend ? 0.05 : 0.1}"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      (legend ? marblePattern(`${u}-marble`, seed) : "");
    if (T.num === "stencil") defs += `<mask id="${u}-bridge" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="236"><rect width="360" height="236" fill="#fff"/>${gaps}</mask>`;

    /* ---- the block body ---- */
    let body = `<path d="${bandD}" fill="url(#${u}-band)"/>`;
    body += `<path d="${union}" fill="${T.stone}" filter="url(#${u}-stone)"/>`;
    let surf = "";
    if (T.broom && !thumb) surf += broom(seed, 60, [0, 4, 360, 224]);
    if (T.marks && !thumb) {
      // form-release marks: ghost rectangles left by the mould boards
      surf += `<g fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.2"><rect x="${X(ar ? 134 : 10)}" y="58" width="124" height="100"/><rect x="${X(ar ? 352 : 226)}" y="8" width="126" height="64"/><path d="M0 112H360"/></g>`;
      surf += `<rect x="${X(ar ? 300 : 238)}" y="96" width="62" height="54" fill="#000" fill-opacity=".05"/>`;
    }
    if (T.pin && !thumb) {
      surf += dots(seed + 9, T.pin, 0.45, 1.25, [0, 0, 360, 230], "#26292d", 0.75, keep);
      surf += dots(seed + 9, T.pin, 0.45, 1.25, [0.7, 0.7, 360, 230], "#e3e6e8", 0.3, keep);
    }
    if (T.chips) {
      const n = thumb ? 160 : legend ? 620 : 680;
      surf += chipPaths(seed, T.chips, n, thumb ? 1.6 : 0.8, thumb ? 4 : 3.6, [0, 0, 360, 230], 0, thumb ? null : keep);
    }
    if (T.polish === 1) surf += `<rect x="0" y="0" width="360" height="236" fill="url(#${u}-pol)"/>`;
    if (T.polish === 2) {
      // a mirror finish: one hard-edged reflection band (and its faint echo) that follows the raking light
      const band = ar ? "M110 -10H84L-6 246H20Z" : "M250 -10H276L366 246H340Z";
      const echo = ar ? "M66 -10H58L-32 246H-24Z" : "M294 -10H302L392 246H384Z";
      surf += `<g class="c05-mirror"><path d="${band}" fill="#fff" fill-opacity=".14"/><path d="${echo}" fill="#fff" fill-opacity=".03"/></g>`;
    }
    body += `<g clip-path="url(#${u}-faces)">${surf}</g>`;
    const arris = blocks.map((P) => facets(P, T.bev, T.hiA, T.loA)).join("");
    const outline = `<path d="${union}" fill="none" stroke="${T.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

    /* brass strips, only as straight dividers: the two waist verticals, and a strip in each course joint */
    let strips = "";
    if (T.strips) {
      const b = 180 - NOTCH.d / 2, c = 180 + NOTCH.d / 2, top = NOTCH.h, bot = 168 - NOTCH.h, tt = tongueTop(T.t);
      const d = `M${b} ${top}V${bot}M${c} ${top}V${bot}M${X(88)} ${CT - 1}V${CB}M180 ${tt}V${CB}M${X(272)} ${CT - 1}V${CB}`;
      strips = `<path d="${d}" fill="none" stroke="#2c210c" stroke-opacity=".45" stroke-width="2.6"/><path d="${d}" fill="none" stroke="url(#${u}-brass${legend ? "Hi" : ""})" stroke-width="1.6"/>`;
    }

    /* the LEGEND grind: the polished CHAMPION surface is ground away from start to end, once */
    let grind = "";
    if (motion) {
      const C2 = TIER.CHAMPION;
      const bandC = blocks.map((P) => dPoly(P.map(([x, y]) => [x, y + T.t]))).join("");
      const e0 = ar ? 370 : -10; // the grinding edge's start
      defs +=
        stoneFilter(`${u}-stoneC`, C2, seed) +
        `<mask id="${u}-gm" maskUnits="userSpaceOnUse" x="-420" y="-20" width="1200" height="280"><rect class="c05-grind" x="-10" y="-20" width="380" height="280" fill="#fff"/></mask>` +
        `<linearGradient id="${u}-wet" x1="${ar ? 0 : 1}" y1="0" x2="${ar ? 1 : 0}" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".7" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
        `<filter id="${u}-slurry" x="-80%" y="-4%" width="260%" height="108%"><feTurbulence type="fractalNoise" baseFrequency=".07 .12" numOctaves="3" seed="${seed + 21}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="12" xChannelSelector="R" yChannelSelector="G" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="${seed + 22}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 .6 .42 0 0 0 .6 .42 0 0 0 .6 .44 0 0 0 0 1" result="gg"/><feBlend in="d" in2="gg" mode="multiply" result="b"/><feComposite in="b" in2="d" operator="in"/></filter>` +
        `<clipPath id="${u}-fb"><path d="${union}${bandD}"/></clipPath>`;
      grind =
        `<g class="c05-cover" mask="url(#${u}-gm)">` +
        `<path d="${bandC}" fill="#a39e92"/>` +
        `<path d="${union}" fill="${C2.stone}" filter="url(#${u}-stoneC)"/>` +
        `<g clip-path="url(#${u}-faces)">${chipPaths(seed, PRO_CHIPS, 420, 0.8, 3.6, [0, 0, 360, 230])}</g>` +
        blocks.map((P) => facets(P, C2.bev, C2.hiA, C2.loA)).join("") +
        `<path d="${union}" fill="none" stroke="${C2.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/></g>` +
        `<g clip-path="url(#${u}-fb)"><g class="c05-grind c05-head">` +
        `<rect x="${ar ? e0 + 7 : e0 - 27}" y="-6" width="20" height="250" fill="url(#${u}-wet)"/>` +
        `<rect x="${e0 - 7}" y="-6" width="14" height="250" fill="#d4d6d8" filter="url(#${u}-slurry)"/>` +
        `</g></g>`;
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
    const notch = mini ? NOTCH_MINI : NOTCH_TOK;
    const raw = paverPts(T.bite && !mini, notch);
    const P = ar ? mirror(raw) : raw;
    const d = dPoly(P);
    const t = mini ? 10 : 8;
    const legend = p.tier === "LEGEND";
    // the number: smaller on strip tiers so it keeps 6u clear of the brass frame
    const fs = T.strips ? (mini ? 108 : 104) : mini ? 120 : 118;
    const ncx = X(T.strips ? (mini ? 287 : 284) : 292) - (ar ? 0 : 1);
    const by = 84 + fs * 0.4;
    const nw = 0.95 * fs;
    const keep = [[ncx - nw / 2 - 6, by - 0.81 * fs - 6, ncx + nw / 2 + 6, by + 6]];
    let s = `<defs><clipPath id="${u}-c"><path d="${d}"/></clipPath><linearGradient id="${u}-brass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="180">${brassStops(false)}</linearGradient><linearGradient id="${u}-brassHi" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="360" y2="180">${brassStops(true)}</linearGradient></defs>`;
    s += `<path d="${dPoly(P.map(([x, y]) => [x, y + t]))}" fill="${T.bandLo}"/>`;
    s += `<path d="${d}" fill="${T.stone}"/>`;
    let surf = "";
    if (T.chips) surf += chipPaths(seed, T.chips.slice(0, mini ? 6 : 8), mini ? 22 : 64, mini ? 6 : 3.5, mini ? 9 : 8, [0, 0, 360, 168], 0, keep);
    if (T.pin) surf += dots(seed, mini ? 12 : 34, mini ? 4 : 2.2, mini ? 6 : 3.6, [0, 0, 360, 168], "#26292d", 0.5, keep);
    if (T.broom && !mini) surf += `<path d="M0 30H360M0 64H360M0 98H360M0 132H360" stroke="#000" stroke-opacity=".06" stroke-width="2"/>`;
    if (T.sheen) surf += `<path d="M0 0H360V60C240 40 120 90 0 50Z" fill="#fff" fill-opacity=".1"/>`;
    if (T.polish === 1) surf += `<path d="${ar ? "M250 0H210L80 168H120Z" : "M110 0H150L280 168H240Z"}" fill="#fff" fill-opacity=".16"/>`;
    if (T.polish === 2) surf += `<path d="${ar ? "M118 -4H82L-20 172H16Z" : "M242 -4H278L380 172H344Z"}" fill="#fff" fill-opacity=".12"/>`;
    s += `<g clip-path="url(#${u}-c)">${surf}</g>`;
    s += facets(P, mini ? 11 : 8, T.hiA, T.loA);
    if (T.strips) {
      // a brass inner border, offset from a clean outline (no arris, no chip) so its corners stay square
      const inner = inset(paverPts(false, notch, 0), mini ? 12 : 14);
      s += `<path d="${dPoly(ar ? mirror(inner) : inner)}" fill="none" stroke="url(#${u}-brass${legend ? "Hi" : ""})" stroke-width="${mini ? 8 : 6}"/>`;
    }
    // the figure in the start lobe (simplified at mini size)
    s += `<g clip-path="url(#${u}-c)">${mini ? figure(T, X(ar ? 120 : 20), 52, 0.48, u, seed, true) : figure(T, X(ar ? 126 : 22), 43, 0.52, u, seed, true)}</g>`;
    // founder: ·26 grooved at the start lobe's top corner; a single finger nick at mini size
    if (p.founder) {
      if (mini) {
        const nick = `M${X(16)} 16L${X(48)} 44`;
        s += legend
          ? `<path d="${nick}" stroke="url(#${u}-brassHi)" stroke-width="13" stroke-linecap="round"/>`
          : `<path d="${nick}" stroke="#C4C9CE" stroke-opacity=".8" stroke-width="12" stroke-linecap="round" transform="translate(3 3)"/><path d="${nick}" stroke="#2f3338" stroke-width="12" stroke-linecap="round"/>`;
      } else {
        const a = `x="${X(16)}" y="54" text-anchor="${ar ? "end" : "start"}" direction="ltr" transform="rotate(${ar ? 4 : -4} ${X(16)} 54)" font-family="Alexandria" font-weight="300" font-size="46" stroke-linejoin="round" stroke-linecap="round"`;
        const yy = ar ? `${String(p.founder).slice(-2)}·` : `·${String(p.founder).slice(-2)}`;
        s += legend
          ? `<text ${a} fill="url(#${u}-brassHi)" stroke="url(#${u}-brassHi)" stroke-width="4">${yy}</text>`
          : `<text ${a} fill="#C4C9CE" fill-opacity=".8" stroke="#C4C9CE" stroke-opacity=".8" stroke-width="5" dx="2" dy="2">${yy}</text><text ${a} fill="#3E4348" stroke="#3E4348" stroke-width="5">${yy}</text>`;
      }
    }
    // the number, inlaid in the end lobe
    const a = `x="${r2(ncx)}" y="${r2(by)}" text-anchor="middle" font-size="${fs}" ${BS} direction="ltr"`;
    const num = esc(p.ovr);
    if (T.num === "paint") s += `<text ${a} fill="none" stroke="#25282c" stroke-opacity=".45" stroke-width="${mini ? 12 : 9}" stroke-linejoin="round">${num}</text><text ${a} fill="${T.fill}">${num}</text>`;
    else if (T.num === "stencil") {
      s += `<text ${a} fill="${T.fill}">${num}</text>`;
      // the stencil bridges, cut in the stone's colour
      let left = ncx - nw / 2;
      for (const ch of String(p.ovr)) {
        const cw = (BSW[ch] ?? 0.45) * fs;
        if (ch !== "1") s += `<rect x="${r2(left + cw / 2 - (mini ? 4 : 3))}" y="${r2(by - fs * 0.85)}" width="${mini ? 8 : 6}" height="${r2(fs * 0.9)}" fill="${T.stone}"/>`;
        left += cw;
      }
    } else if (T.num === "cement") s += `<text ${a} fill="${T.fill}">${num}</text>`;
    else if (T.num === "cementBrass") s += `<text ${a} fill="${T.fill}" stroke="url(#${u}-brass)" stroke-width="${mini ? 12 : 9}" stroke-linejoin="round" paint-order="stroke">${num}</text>`;
    else s += `<text ${a} fill="#ECE8DF" stroke="url(#${u}-brassHi)" stroke-width="${mini ? 11 : 8}" stroke-linejoin="round" paint-order="stroke">${num}</text>`;
    s += `<path d="${d}" fill="none" stroke="${T.edge}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    return `<svg class="c05-tok-svg" viewBox="0 0 360 180" width="${w}" height="${h}" aria-hidden="true" focusable="false" style="overflow:visible">${s}</svg>`;
  }

  /* ---------- the share's pavement: the same blocks, laid in stretcher bond ---------- */
  function pavementField(seed, rows, cols) {
    const R = rng(seed + 41);
    const faces = ["", "", ""], bands = [];
    for (let k = rows[0]; k <= rows[1]; k++) {
      const shift = Math.abs(k) % 2 ? 183 : 0;
      for (let j = cols[0]; j <= cols[1]; j++) {
        const dx = j * 366 + shift, dy = k * 236;
        // clamped just outside the frame; no slanted edge crosses the clamp, so nothing visible bends
        const cl = (x) => Math.max(-45, Math.min(405, x));
        [paverPts(false), ...coursePts(4, true)].forEach((Q) => {
          faces[Math.floor(R() * 3)] += dPoly(Q.map(([x, y]) => [cl(x + dx), y + dy]));
          bands.push(dPoly(Q.map(([x, y]) => [cl(x + dx), y + dy + 4])));
        });
      }
    }
    return { faces, all: faces.join(""), bands: bands.join("") };
  }

  /** A tiny stone texture for the leaderboard slab, seeded per member (inline SVG data URI). */
  function slabChips(p) {
    const T = tierOf(p);
    if (!T.chips) return "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="346" height="64" viewBox="0 0 346 64">${chipPaths(seedOf(p) + 5, T.chips, 120, 0.5, 1.7, [0, 0, 346, 64], 0.85)}</svg>`;
    return `--c05-chips:url(&quot;data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}&quot;)`;
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
      "The card is not a card. It is a paving block: the double-T interlocking paver of city pavements and squares, the ground that neighbourhood football is played on, with a trapezoid notch cut a quarter of the way into each long side. Under it sits the next course of the pavement, four half-blocks: the middle two tongue up into the paver's notch and stop a sand joint short of it, and the outer two step in from the paver's ends. In silhouette it is an I-beam locked onto a row of bricks, a shape no card game, bank or profile widget uses.",
      "Reading the block means walking along it. The start lobe carries the manager seen from behind, cut into the stone; the waist carries the BotolaGO wordmark, the neutral crest, the tier, the country and the season; the end lobe carries the name and the 84, both inlaid in the tier's material. The four course blocks hold one stat each, label cut into the stone and value inlaid. Nothing floats: every mark is either cut into the block or set flush into it, and the aggregate keeps clear of every letter.",
      "The material is the progression. Broom-finished raw concrete with pinholes and mould marks, then dark sealed concrete with a wet sheen, then white granito ground down to its aggregate, then polished terrazzo with brass dividers, then black terrazzo with white marble inlays. The aggregate is seeded by the BOT number, so every member's block has its own grain, the way no two terrazzo floors match.",
      "Typography is set like lettering on a building: Big Shoulders Display 800 for the number, name and stat values (a condensed civic face that reads like street-sign and stadium numbering), Manrope for the cut-in codes, Alexandria for Arabic, and the founder scratch, a single round groove drawn with a fingertip, is the only handwriting on the object.",
    ],
    belonging: [
      "The league is literally a pavement. Every member's block locks into the next, which is the group image the product has been missing: not a podium, a ground you share. In the leaderboard each row is a slab of its owner's material, laid in stretcher bond with sand joints, and the share image is your block set into a lit pavement at night with your name scratched into the kerb.",
      "The block ages with you. It takes one edge chip per season played (the first is bitten out of the end corner from STADE on), so a three-season block looks lived-in in a way a new account cannot copy. A 15-year-old wants the brass; a 30-year-old finds black terrazzo with marble and brass genuinely beautiful, which keeps it from feeling childish.",
      "Friends compare by material before they compare by number: 'yours is still concrete' is a sentence that works in a playground. The 84 is inlaid in the end lobe where it is the largest mark on the block, so the number comparison still happens at a glance.",
    ],
    founderMark: [
      "FOUNDER 2026 is not a badge placed on the block. It is the member's name and ·26 drawn with a fingertip into the wet cement at the start lobe's top corner: one round groove with a lit far wall and a shadowed near wall, a slight wobble seeded by the BOT number so no two are identical, and FOUNDER 2026 cut beneath it like a date line.",
      "It is part of the concrete from day one and is never polished away: grooved at HOMA, STADE and PRO, sealed under a clear resin oval at CHAMPION (a floor someone chose to protect), and filled with brass at LEGEND. Later cohorts carry their own year; nobody else's block will ever carry ·26, and it cannot be bought because it was made the day they joined.",
      "It borrows the form of supporter-group naming, a name followed by its founding year, without any group vocabulary or crest.",
    ],
    small: [
      "At 44–80px the token is the paver alone at 2:1 with its notches cut deeper than on the full card (an optical correction so the I-shape survives): the 84 inlaid in the end lobe, the figure in the start lobe and a grooved ·26 at its top corner for founders. On brass tiers the number is set smaller so it keeps clear of the brass border.",
      "At 24–32px the figure is reduced to head and shoulders and the 84 fills the end lobe; tier is carried by the material: light broom-finished concrete with a road-paint number, dark sealed concrete with a stencilled number, white granito with a navy number, granito with a brass border and a brass-edged number, black with a marble number and a lit rim. Founders keep a single finger nick in the start corner.",
      "The 1px arris line is drawn non-scaling: light stone keeps a #858D99 edge on the light app ground, and black terrazzo and sealed concrete keep a lit rim on the dark ground at every size.",
    ],
    rtl: [
      "The outline is symmetric, so the whole composition mirrors without changing the silhouette: in Arabic the 84 and the name move to the left lobe (inline end), the figure and the scratch move to the right lobe, and the course reads with the captaincy block on the right. Only the edge chip moves with it, to the bottom-left corner.",
      "The name علي is inlaid in Alexandria 700 with room above and below for its tall letters and the ي descender; the Arabic stat labels stack above their values and are cut with a single fill, so their joins never double. No letter-spacing on Arabic anywhere; digits, the BOT number and the season stay left-to-right.",
      "The founder scratch is the Arabic name and 26· as two separate grooves, so the year sits against the name and never runs into it.",
    ],
    tiers: {
      HOMA: "Raw cast concrete, light and matte: a broom finish, pinholes and the ghost rectangles of mould boards, a crude arris that wobbles, the number and name brushed on in worn road paint, the stats in chalk, the figure a groove cut into the concrete with the hair pressed in.",
      STADE: "Cured and sealed: dark concrete with a wet sheen that catches the light, sharper arrises, the number sprayed through a stencil (bridges and overspray), the figure a two-colour spray stencil in sky and navy, and the first edge chip bitten out of the end corner.",
      PRO: "Ground down to white granito: the aggregate is exposed in navy, sky, logo-blue and club-colour chips. The number, name and stat values become navy cement inlays, the wordmark logo-blue stone, and the figure flush marquetry: navy granite jacket, blue collar, warm stone, black marble hair.",
      CHAMPION: "Polished terrazzo: a reflection band across the face, brass dividers in the waist and in the course joints, the numerals in navy cement held in a brass strip bent around each glyph (real terrazzo technique), brass cut lines through the figure, and the founder scratch sealed under clear resin.",
      LEGEND: "Black terrazzo polished to a mirror, with one hard reflection band that follows the light. The 84 and the name are inlaid in white marble with faint grey veins, held in brass; the figure becomes a lapis jacket with veined hair; brass is kept for the dividers, the figure's cut lines and the founder scratch, now filled with metal. The block stands taller (a 6u side) and keeps a lit rim on the dark ground.",
    },
    legend: [
      "The grind. A raking floodlight crosses the block, then a grinding head sweeps from the start lobe to the end lobe (900ms): the polished CHAMPION surface goes under a band of grey slurry and comes out as wet, dark black terrazzo, which dries as the head moves on. Brass flows into the founder scratch last. It plays once, never loops, and under reduced motion the finished block simply shows.",
      "At rest the LEGEND block is the most desirable object in the set because it looks expensive the way a hotel lobby floor does, not the way a game reward does: black stone, white marble numerals, thin brass, one hard reflection, and a scratch from 2026 that is now metal.",
    ],
    advantages: [
      "A silhouette nobody else owns: the I-beam with a stepped course of bricks locked under it is recognisable as a solid shape at 120px and as a token at 24px, on both app grounds.",
      "Tessellation gives a natural group image: a league, a head-to-head or a share is the same blocks locking together, which no rectangle card can do.",
      "Progression is genuinely material (cast, sealed, ground, polished, inlaid), so five tiers read as five objects rather than five colours, and LEGEND has adult-grade beauty instead of game-reward glow.",
      "The finger scratch is the most human founder mark in the slate and is impossible to fake retroactively.",
      "The symmetric outline makes right-to-left a mirror rather than a redesign.",
    ],
    risks: [
      "At small sizes the double-T can read as a dog bone or a film strip; it depends on square corners, deep trapezoid notches and the deeper optical notches holding up. Test with real users at 24px before committing.",
      "Grey HOMA can read as drab or as a 'not loaded' state to the people it most needs to win; the broom finish, road paint and chalk have to carry the energy.",
      "It is an unfamiliar identity object: the metaphor lands fully in the league view and the share, less so on a lone profile, and needs one line of onboarding copy.",
      "Terrazzo is a current interior-décor trend, so LEGEND could date; the paver itself is timeless, the polish might not be.",
      "How common double-T pavers are in Moroccan streets and squares is not verified; the concept leans on derb concrete generally, but a local check is needed before claiming it.",
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
      const bond = (o.rank || 0) % 2 ? "a" : "b";
      const yy = String(p.founder || "").slice(-2);
      const founder = p.founder ? `<span class="c05-row-f" aria-hidden="true"><bdi dir="ltr">${ar ? yy + "·" : "·" + yy}</bdi></span>` : "";
      return (
        `<div class="c05 c05-row${o.me ? " is-me" : ""}" dir="${S.dir}" data-tier="${p.tier}" data-bond="${bond}" role="img" aria-label="${esc((o.rank || "") + ". " + MC.label(p, o) + ", " + (o.pts || "") + " " + S.pts)}">` +
        `<div class="c05-row-slab" style="${slabChips(p)}">` +
        `<span class="c05-row-rank">${MC.ltr(o.rank ?? "")}</span>` +
        `<span class="c05-row-tok">${tokenSVG(p, { ...o, size: 44, mini: false })}</span>` +
        `<span class="c05-row-id"><b${ar ? ' class="ar"' : ""}>${nm}</b><small><i>${esc(S.tiers[p.tier])}</i>${founder}</small></span>` +
        `<span class="c05-row-pts"><b>${MC.ltr(o.pts ?? "")}</b><small>${esc(S.pts)}</small></span>` +
        `</div></div>`
      );
    },

    share(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const u = MC.uid(C + "s");
      const T = tierOf(p);
      const sc = 320 / 360;
      const ox = 20, oy = 266;
      const seed = seedOf(p);
      const X = (x) => (ar ? 360 - x : x);
      const MP = (P) => (ar ? mirror(P) : P);
      const f = pavementField(seed, [-2, 1], [-1, 1]);
      const cardH = 236 * sc;
      const tr = `translate(${ox} ${oy}) scale(${r2(sc)})`;
      // ALI's slot: the pavement is cut to the block's exact outline, with a 3u sand joint all round
      const aliBlocks = [MP(paverPts(T.bite)), ...coursePts(T.t).map(MP)];
      const slot = aliBlocks.map(dPoly).join("") + aliBlocks.map((P) => dPoly(P.map(([x, y]) => [x, y + T.t]))).join("");
      const sand = "#211f1b";
      const logoW = 108;
      const logo = MC.logo("wordmark", { variant: "light", label: false, w: logoW, h: r2(logoW / MC.LOGO_RATIO.wordmark) });
      const nm = MC.nameOf(p, o);
      const yy = String(p.founder || "").slice(-2);
      // kerb: two cast stones with a joint, the inscription on the first
      const kerbY = 516, kerbB = 594;
      const kA = ar ? [[94, kerbY], [370, kerbY], [370, kerbB], [94, kerbB]] : [[-10, kerbY], [266, kerbY], [266, kerbB], [-10, kerbB]];
      const kB = ar ? [[-10, kerbY], [90, kerbY], [90, kerbB], [-10, kerbB]] : [[270, kerbY], [370, kerbY], [370, kerbB], [270, kerbB]];
      const chamf = (Q) => {
        const [a, b, c2, d] = Q;
        return [[a[0] + 3, a[1]], [b[0] - 3, b[1]], [b[0], b[1] + 3], [c2[0], c2[1] - 3], [c2[0] - 3, c2[1]], [d[0] + 3, d[1]], [d[0], d[1] - 3], [a[0], a[1] + 3]];
      };
      const kerbs = [chamf(kA), chamf(kB)];
      const kerbD = kerbs.map(dPoly).join("");
      const kerbBand = kerbs.map((Q) => dPoly(Q.map(([x, y]) => [x, y + 7]))).join("");
      const KT = { ...TIER.HOMA, stone: "#8a9097", el: 44, rf: "0.05", ss: 1.8 };
      // the scratch on the kerb, three times the size of the card's
      const sfs = 44, sx = X(28), sy = 560;
      const nW = r2(scratchW(nm, ar) * sfs);
      const tail = ar ? `${yy}·` : `·${yy}`;
      const x2 = ar ? sx - nW - 2 : sx + nW + 2;
      const F = `font-family="Alexandria" font-weight="300" font-size="${sfs}"`;
      const runs = (dx, dy, attrs) =>
        `<text x="${r2(sx + dx)}" y="${r2(sy + dy)}" ${F} text-anchor="start"${ar ? ' direction="rtl"' : ""} textLength="${nW}" lengthAdjust="spacingAndGlyphs" ${attrs}>${esc(nm)}</text>` +
        (p.founder ? `<text x="${r2(x2 + dx)}" y="${r2(sy + dy)}" ${F} text-anchor="${ar ? "end" : "start"}" direction="ltr" ${attrs}>${tail}</text>` : "");
      const groove = (c, a, w) => `fill="${c}" fill-opacity="${a}" stroke="${c}" stroke-opacity="${a}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
      const scr = `<g transform="rotate(${ar ? 3 : -3} ${sx} ${sy})" filter="url(#${u}-wob)">${runs(1.4, 1.6, groove("#C4C9CE", 0.85, 3))}${runs(0, 0, groove("#33373c", 0.82, 4.4))}${runs(-1, -1.1, groove("#000", 0.28, 2))}</g>`;
      // the kerb inscription: ID, tier and season cut on one line, separated by small cut squares
      const iy = 584;
      const ins = (x, txt, attrs) => `<text x="${r2(x + 0.6)}" y="${iy + 0.6}" ${attrs} fill="#cfd3d7" fill-opacity=".8">${txt}</text><text x="${r2(x)}" y="${iy}" ${attrs} fill="#1f2226">${txt}</text>`;
      const sq = (x) => `<rect x="${r2(x - 1.8)}" y="${iy - 5.6}" width="3.6" height="3.6" transform="rotate(45 ${r2(x)} ${iy - 3.8})" fill="#1f2226"/>`;
      const idW = 6.67 * 10.5 + 1.4 * 11, gap = 13;
      const tierTxt = esc(S.tiers[p.tier]);
      const tierW = ar ? arW(S.tiers[p.tier], 700) * 12 : bsW(S.tiers[p.tier]) * 14 + 1.4 * S.tiers[p.tier].length;
      let insc = "";
      if (ar) {
        let x = 332;
        insc += ins(x, esc(p.id), `${MR} font-size="10.5" letter-spacing="1.4" text-anchor="end" direction="ltr"`);
        x -= idW + gap;
        insc += sq(x);
        x -= gap;
        insc += ins(x, tierTxt, `${AX(700)} font-size="12" text-anchor="start" direction="rtl"`);
        x -= tierW + gap;
        insc += sq(x);
        x -= gap;
        insc += ins(x, esc(p.season), `${MR} font-size="10.5" letter-spacing="1.4" text-anchor="end" direction="ltr"`);
      } else {
        let x = 28;
        insc += ins(x, esc(p.id), `${MR} font-size="10.5" letter-spacing="1.4"`);
        x += idW + gap;
        insc += sq(x);
        x += gap;
        insc += ins(x, tierTxt, `${BS} font-size="14" letter-spacing="1.4"`);
        x += tierW + gap;
        insc += sq(x);
        x += gap;
        insc += ins(x, esc(p.season), `${MR} font-size="10.5" letter-spacing="1.4"`);
      }
      return (
        `<div class="c05 c05-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
        `<svg viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false">` +
        `<defs>` +
        `<filter id="${u}-field" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="4" seed="${seed}" result="n"/><feDiffuseLighting in="n" surfaceScale="1.7" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="270" elevation="30"/></feDiffuseLighting><feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.75" result="lit"/><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${seed + 3}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.8 0 0 0 -1.7" result="gd"/><feMerge result="m"><feMergeNode in="lit"/><feMergeNode in="gd"/></feMerge><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>` +
        stoneFilter(`${u}-kerb`, KT, seed + 9) +
        `<radialGradient id="${u}-pool" cx="180" cy="300" r="300" gradientUnits="userSpaceOnUse" gradientTransform="translate(180 300) scale(1.05 1.2) translate(-180 -300)"><stop offset="0" stop-color="#73EDFA" stop-opacity=".3"/><stop offset=".4" stop-color="#73EDFA" stop-opacity=".14"/><stop offset=".8" stop-color="#73EDFA" stop-opacity=".03"/><stop offset="1" stop-color="#73EDFA" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="${u}-rake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9fcff" stop-opacity=".16"/><stop offset=".45" stop-color="#e9fcff" stop-opacity="0"/></linearGradient>` +
        `<radialGradient id="${u}-vig" cx="180" cy="300" r="400" gradientUnits="userSpaceOnUse"><stop offset=".42" stop-color="#03070f" stop-opacity="0"/><stop offset="1" stop-color="#03070f" stop-opacity=".92"/></radialGradient>` +
        `<linearGradient id="${u}-low" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03070f" stop-opacity="0"/><stop offset="1" stop-color="#03070f" stop-opacity=".55"/></linearGradient>` +
        `<mask id="${u}-onfaces" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="640"><path d="${f.all}" transform="${tr}" fill="#fff"/></mask>` +
        `<filter id="${u}-paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -4.6 3.4" result="m"/><feComposite in="d" in2="m" operator="in" result="p"/><feTurbulence type="fractalNoise" baseFrequency=".45" numOctaves="1" seed="${seed + 3}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 12 0 0 0 -3.1" result="gm"/><feComposite in="p" in2="gm" operator="in"/></filter>` +
        `<filter id="${u}-wob" x="-5%" y="-20%" width="110%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        `<filter id="${u}-asph" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="${seed + 5}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.2 -.62" result="gl"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gl"/></feMerge></filter>` +
        `</defs>` +
        // the sand bed, the blocks' sides, then their faces (three slightly different cures)
        `<rect width="360" height="640" fill="${sand}"/>` +
        `<g transform="${tr}">` +
        `<path d="${f.bands}" fill="#15181c"/>` +
        `<path d="${f.faces[0]}" fill="#4a5057" filter="url(#${u}-field)"/>` +
        `<path d="${f.faces[1]}" fill="#43494f" filter="url(#${u}-field)"/>` +
        `<path d="${f.faces[2]}" fill="#4f555c" filter="url(#${u}-field)"/>` +
        `</g>` +
        // the huge 84, painted across the pavement in road paint; the joints break it
        `<g mask="url(#${u}-onfaces)"><text x="180" y="246" text-anchor="middle" ${BS} font-size="214" direction="ltr" fill="#F4F2EC" fill-opacity=".92" filter="url(#${u}-paint)">${esc(p.ovr)}</text></g>` +
        // one floodlight above the frame: a cyan pool and a raking wash from the top
        `<rect width="360" height="640" fill="url(#${u}-pool)"/>` +
        `<rect width="360" height="640" fill="url(#${u}-rake)"/>` +
        `<rect width="360" height="640" fill="url(#${u}-vig)"/>` +
        // ALI's slot, then ALI's block locked into it
        `<path d="${slot}" transform="${tr}" fill="${sand}" stroke="${sand}" stroke-width="6" stroke-linejoin="round"/>` +
        cardSVG(p, { ...o, motion: false, thumb: false }, `x="${ox}" y="${oy}" width="320" height="${r2(cardH)}"`) +
        // the kerb at the pavement's edge, and the road beyond it
        `<rect y="${kerbY - 8}" width="360" height="${640 - kerbY + 8}" fill="${sand}"/>` +
        `<rect y="${kerbB + 10}" width="360" height="${640 - kerbB - 10}" fill="#0a0d12" filter="url(#${u}-asph)"/>` +
        `<path d="${kerbBand}" fill="#2c3035"/>` +
        `<path d="${kerbD}" fill="${KT.stone}" filter="url(#${u}-kerb)"/>` +
        kerbs.map((Q) => facets(Q, 3, 0.4, 0.4)).join("") +
        scr +
        insc +
        `<rect y="${kerbB + 10}" width="360" height="${640 - kerbB - 10}" fill="url(#${u}-low)"/>` +
        // top: the logo at the inline start, the season at the end
        `<g transform="translate(${ar ? 360 - 22 - logoW : 22} 26)">${logo}</g>` +
        `<text x="${X(338)}" y="41" text-anchor="${ar ? "start" : "end"}" ${MR} font-size="11" letter-spacing="${ar ? 0 : 0.8}" fill="#c3cad3" direction="ltr">${esc(p.season)}</text>` +
        `<text x="180" y="625" text-anchor="middle" ${ar ? AX(500) : MR} font-size="9" fill="#a9b2be" fill-opacity=".75"${ar ? "" : ' letter-spacing="1.4"'}>${ar ? "مثال" : "SAMPLE"}</text>` +
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
