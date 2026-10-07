/* 06 ARDOISE — the café's pavement A-board.
   A double-sided chalkboard in a carved wooden frame: one face French, one face Arabic.
   Rising tiers make the name harder to wipe off, and the board itself gets better:
   raw pine and blackboard paint, stained slate, slate with steel hardware and marker,
   sign-painted enamel with brass, then gold leaf on black glass under a gilded topper.
   FOUNDER 2026 is knife-cut into the bottom rail, with a notch cut out of its corner. */
(function () {
  const MC = window.MC;

  /* ---------- palette (artwork only) ---------- */
  const C = {
    chalk: "#EEF0EA",
    sky: "#9FE3EF",
    enamel: "#F7F7F2",
    cream: "#F0E4CA",
    navy: "#0B2A6B",
    blue: "#0151FC",
    blueDeep: "#0A33A8",
    wood: "#8A5A34",
    back: "#5E3D22",
    groove: "#2A1608",
    lip: "#DDB582",
    pine: "#C9A57A",
    pineEdge: "#7A5530",
    pineBack: "#A8845A",
    ply: "#B08A5E",
    slate: "#1E2A2F",
    paint: "#2A2F2C",
    glass: "#0B0D10",
    gold: "#D9B24A",
    goldHi: "#F3DE8A",
    shade: "#5A2A14",
  };
  const MEDIUM = { HOMA: "rough", STADE: "chalk", PRO: "marker", CHAMPION: "enamel", LEGEND: "gold" };
  /* MSA list labels, shorter than the kit's so the chalk column stays one line. */
  const AR_STATS = { CAP: "قيادة", SEL: "اختيار", TRF: "انتقالات", CON: "ثبات" };
  const HEAD = { lat: "MANAGER", ar: "مدرب" };
  const CAPTION = { lat: "À l'affiche ce soir", ar: "اسمي على اللوحة الليلة" };

  /* ---------- fonts and measuring (canvas; estimates if canvas is unavailable) ---------- */
  try {
    [
      '400 64px "Lalezar"',
      '700 13px "Changa"',
      '800 13px "Changa"',
      '600 18px "Changa"',
      '800 16px "Big Shoulders Display"',
      '700 10px "Manrope"',
      '800 10px "Manrope"',
    ].forEach((f) => document.fonts.load(f));
    document.fonts.load('400 64px "Lalezar"', "علي ياسمين عثمان سلمى حمزة");
    document.fonts.load('700 14px "Changa"', "مدرب مؤسس");
    document.fonts.load('800 14px "Changa"', "أسطورة محترف");
    document.fonts.load('600 18px "Changa"', "انتقالات");
  } catch (e) {
    /* fonts load on first use */
  }
  const EST = { Lalezar: 0.52, Changa: 0.6, Manrope: 0.66, "Big Shoulders Display": 0.42 };
  let ctx = null;
  function meas(text, weight, size, family) {
    try {
      ctx = ctx || document.createElement("canvas").getContext("2d");
      ctx.font = `${weight} ${size}px "${family}"`;
      return ctx.measureText(String(text));
    } catch (e) {
      return null;
    }
  }
  function tw(text, weight, size, family, ls = 0) {
    const t = String(text);
    const m = meas(t, weight, size, family);
    const w = m && m.width > 0 ? m.width : t.length * size * (EST[family] || 0.6);
    return w + ls * Math.max(0, t.length - 1);
  }
  /* how far a line of Lalezar drops below its baseline (Arabic tails need room) */
  function tdesc(text, size, ar) {
    const m = meas(text, 400, size, "Lalezar");
    const d = m && m.actualBoundingBoxDescent;
    return typeof d === "number" && isFinite(d) && m.width > 0 ? Math.max(0, d) : ar ? size * 0.48 : size * 0.02;
  }

  /* ---------- geometry (viewBox 0 -12 300 452, drawn for the French face; Arabic mirrors) ---------- */
  const VB = "0 -12 300 452";
  const r2 = (n) => Math.round(n * 100) / 100;
  const pts = (a) => a.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");
  const xl = (y) => 26 - (14 * (y - 22)) / 358;
  const xr = (y) => 274 + (14 * (y - 22)) / 358;
  const FW = 15;
  const TI = 50;
  const BI = 360; /* the bottom rail is 20u: deep enough to carve into */
  const OUT = [
    [26, 22],
    [274, 22],
    [288, 380],
    [12, 380],
  ];
  const IN = [
    [xl(TI) + FW, TI],
    [xr(TI) - FW, TI],
    [xr(BI) - FW, BI],
    [xl(BI) + FW, BI],
  ];
  const inset = (d, y1 = TI + d, y2 = BI - d) => [
    [xl(y1) + FW + d, y1],
    [xr(y1) - FW - d, y1],
    [xr(y2) - FW - d, y2],
    [xl(y2) + FW + d, y2],
  ];
  /* the founder notch: cut up into the bottom rail at the bottom-start corner, beside the carving */
  const NOTCH = [
    [16.5, 382],
    [22.5, 371],
    [28.5, 382],
  ];

  /* deterministic jitter for brush and chalk edges */
  function rng(seed) {
    let s = seed;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }
  /* a polygon's edges, walked with a little hand wobble */
  function raggedPoly(poly, seed, amp, step = 7) {
    const r = rng(seed);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const jx = k === 0 ? 0 : (r() - 0.5) * amp;
        const jy = k === 0 ? 0 : (r() - 0.5) * amp;
        out.push([x1 + (x2 - x1) * t + jx, y1 + (y2 - y1) * t + jy]);
      }
    }
    return out;
  }
  const mirrorPts = (a, w = 300) => a.map(([x, y]) => [w - x, y]);

  /* ---------- shared defs ---------- */
  function defs(u, tier) {
    const pine = tier === "HOMA";
    const glass = tier === "LEGEND";
    const varnish = tier === "CHAMPION" || glass;
    const wood = (id, f) =>
      `<filter id="${u}-${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${f[0]} ${f[1]}" numOctaves="3" seed="7" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${pine ? "0.42  0 0 0 0 0.27  0 0 0 0 0.12  1.8 0 0 0 -0.8" : "0.25  0 0 0 0 0.14  0 0 0 0 0.07  2.5 0 0 0 -1.02"}" result="g"/>` +
      `<feComposite in="g" in2="SourceGraphic" operator="in" result="gi"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="${f[0] * 2.6} ${f[1] * 2.6}" numOctaves="1" seed="12" result="n2"/>` +
      `<feColorMatrix in="n2" type="matrix" values="0 0 0 0 ${pine ? "0.93  0 0 0 0 0.8  0 0 0 0 0.6" : "0.86  0 0 0 0 0.64  0 0 0 0 0.42"}  1.5 0 0 0 -0.66" result="h"/>` +
      `<feComposite in="h" in2="SourceGraphic" operator="in" result="hi"/>` +
      `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gi"/><feMergeNode in="hi"/></feMerge></filter>`;
    let d =
      /* chalk: grain holes from noise, plus a hand wobble */
      `<filter id="${u}-ch" x="-8%" y="-12%" width="116%" height="124%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${pine ? 0.75 : 0.95}" numOctaves="2" seed="${pine ? 8 : 4}" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="${pine ? 2.6 : 1.6}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${pine ? "-3.0 0 0 0 2.3" : "-2.8 0 0 0 2.3"}" result="m"/>` +
      `<feComposite in="d" in2="m" operator="in"/></filter>` +
      /* liquid chalk marker: opaque, a slight wobble at the edge */
      `<filter id="${u}-mk" x="-6%" y="-10%" width="112%" height="120%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="2" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G"/></filter>` +
      /* the board's fine tooth (old chalk ground into the surface) */
      `<filter id="${u}-tt" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="3" result="f"/>` +
      `<feColorMatrix in="f" type="matrix" values="0 0 0 0 0.93  0 0 0 0 0.94  0 0 0 0 0.92  ${pine ? "0.42 0 0 0 -0.15" : "0.36 0 0 0 -0.135"}"/></filter>` +
      /* eraser arcs: broad wipes, soft-edged */
      `<filter id="${u}-er" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>` +
      wood("wh", pine ? [0.01, 0.22] : [0.012, 0.3]) +
      wood("wv", pine ? [0.22, 0.01] : [0.3, 0.012]) +
      `<filter id="${u}-bl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>` +
      `<filter id="${u}-bs" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
      `<linearGradient id="${u}-lg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9C6A3E"/><stop offset=".55" stop-color="#7E5130"/><stop offset="1" stop-color="#5E3D22"/></linearGradient>` +
      `<linearGradient id="${u}-bk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A4527"/><stop offset="1" stop-color="#3F2815"/></linearGradient>` +
      `<linearGradient id="${u}-br" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DD94"/><stop offset=".45" stop-color="#C79C42"/><stop offset="1" stop-color="#76571E"/></linearGradient>` +
      `<linearGradient id="${u}-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9EDF0"/><stop offset=".5" stop-color="#A9B1B8"/><stop offset="1" stop-color="#6C747B"/></linearGradient>` +
      /* chalk-grain hatching for the form bars */
      `<pattern id="${u}-hc" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(-52)"><path d="M0 1.3H2.6" stroke="${C.chalk}" stroke-width="1.15"/></pattern>` +
      `<pattern id="${u}-hs" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(-52)"><path d="M0 1.3H2.6" stroke="${C.sky}" stroke-width="1.3"/></pattern>`;
    if (!pine) {
      /* moulded frame: diffuse light on the blurred frame alpha, varnish sheen from CHAMPION */
      d +=
        `<filter id="${u}-bv" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="b"/>` +
        `<feDiffuseLighting in="b" surfaceScale="3" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="40"/></feDiffuseLighting>` +
        `<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.5" k2="0" k3="0" k4="0" result="lit"/>` +
        (varnish
          ? `<feSpecularLighting in="b" surfaceScale="3" specularConstant="${glass ? 0.95 : 0.7}" specularExponent="22" lighting-color="#ffe7c6" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>` +
            `<feComposite in="lit" in2="s" operator="arithmetic" k2="1" k3="0.5" result="lit"/>`
          : "") +
        `<feComposite in="lit" in2="SourceAlpha" operator="in"/></filter>`;
    } else {
      /* blackboard paint: brush streaks and ridges, and the raw plywood under it */
      d +=
        `<filter id="${u}-bm" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.011 0.42" numOctaves="2" seed="11" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.53  0 0 0 0 0.51  0 0 4.2 0 -2.18" result="hi"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.04  0 0 0 0 0.05  0 0 0 0 0.04  0 0 -4 0 1.72" result="lo"/>` +
        `<feMerge><feMergeNode in="lo"/><feMergeNode in="hi"/></feMerge></filter>` +
        `<filter id="${u}-pw" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.006 0.05" numOctaves="3" seed="21" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.36  0 0 0 0 0.2  3 0 0 0 -1.35" result="g"/>` +
        `<feComposite in="g" in2="SourceGraphic" operator="in" result="gi"/>` +
        `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gi"/></feMerge></filter>`;
    }
    if (glass) {
      /* sign-writer's gilding: flat mirror gold, engine-turned burnish, leaf seams, glass */
      d +=
        `<linearGradient id="${u}-gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldHi}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>` +
        `<pattern id="${u}-bn" width="9" height="9" patternUnits="userSpaceOnUse"><g fill="none" stroke="#000" stroke-opacity=".08" stroke-width=".55">` +
        `<circle cx="0" cy="0" r="2.4"/><circle cx="0" cy="0" r="4.6"/><circle cx="0" cy="0" r="6.8"/><circle cx="9" cy="9" r="2.4"/><circle cx="9" cy="9" r="4.6"/><circle cx="9" cy="9" r="6.8"/>` +
        `<circle cx="9" cy="0" r="3.5"/><circle cx="0" cy="9" r="3.5"/></g></pattern>` +
        `<pattern id="${u}-sm" width="23" height="23" patternUnits="userSpaceOnUse"><path d="M0 .3H23M.3 0V23" stroke="#6b4e10" stroke-width=".55" fill="none"/></pattern>` +
        `<linearGradient id="${u}-gl" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#1B2028"/><stop offset=".45" stop-color="#0B0D10"/><stop offset="1" stop-color="#040506"/></linearGradient>` +
        `<linearGradient id="${u}-rf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".09"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="${u}-sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#FFF9E6" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    }
    return d;
  }

  /* ---------- the shared avatar: the manager seen from behind ---------- */
  /* short strokes across the nape hairline, so the back of the head reads as a haircut, not a helmet */
  const NAPE = [
    [76, 129.8],
    [81, 129.3],
    [86, 130.3],
    [91, 132.5],
    [96, 135.5],
    [100, 138],
    [104, 135.5],
    [109, 132.5],
    [114, 130.3],
    [119, 129.3],
    [124, 129.8],
  ]
    .map(([x, y]) => `<path d="M${x} ${r2(y - 5)} L${r2(x + (100 - x) * 0.07)} ${r2(y + 3.2)}"/>`)
    .join("");
  function figure(x, y, h, st) {
    const A = MC.AVATAR;
    const w = (h * 200) / 240;
    const torsoOpen = A.torso.replace(/Z$/, "");
    let g;
    if (A.hood) {
      /* the kit's default: hood up. The hood is a solid mass with its panel seams cut through it,
         so the figure reads as a person in a bench jacket, not a chalk dome. */
      const hs = `<path d="${A.hoodSeam}"/><path d="${A.hoodRim}"/>`;
      if (st.mode === "two") {
        g =
          `<g transform="translate(5 5)" fill="${C.blueDeep}" opacity=".5"><path d="${A.torso}"/><path d="${A.hood}"/></g>` +
          `<path d="${A.torso}" fill="${C.blue}" stroke="${C.enamel}" stroke-width="4.4" stroke-linejoin="round"/>` +
          `<path d="${A.seam}" stroke="${C.enamel}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
          `<path d="${A.hood}" fill="${C.navy}" stroke="${C.enamel}" stroke-width="4.4" stroke-linejoin="round"/>` +
          `<path d="M66 80 C80 58 96 52 100 52" stroke="#2D58C8" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>` +
          `<g stroke="${C.blue}" stroke-width="4.4" fill="none" stroke-linecap="round">${hs}</g>`;
      } else if (st.mode === "gold") {
        g =
          `<path d="${A.torso}" fill="${C.glass}"/>` +
          `<path d="${torsoOpen}" fill="none" stroke="${C.gold}" stroke-width="${st.sw}" stroke-linejoin="round" stroke-linecap="round"/>` +
          `<path d="${A.seam}" fill="none" stroke="${C.gold}" stroke-width="${st.sw * 0.8}" stroke-linecap="round"/>` +
          `<path d="${A.hood}" fill="${C.shade}" transform="translate(4 4)"/>` +
          `<path d="${A.hood}" fill="url(#${st.u}-gg)" stroke="#07080A" stroke-width="3" paint-order="stroke"/>` +
          `<path d="${A.hood}" fill="url(#${st.u}-bn)"/>` +
          `<g stroke="#07080A" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".85">${hs}</g>`;
      } else {
        const s = `stroke="${st.line}" stroke-width="${st.sw}" stroke-linejoin="round" stroke-linecap="round"`;
        g =
          `<path d="${A.torso}" fill="${st.fill}"/>` +
          `<path d="${torsoOpen}" fill="none" ${s}/>` +
          `<path d="${A.seam}" fill="none" stroke="${st.seam || st.line}" stroke-width="${st.sw * 0.8}" stroke-linecap="round"/>` +
          `<path d="${A.hood}" fill="${st.fill}"/>` +
          (st.hatch
            ? `<path d="${A.hood}" fill="${st.line}" fill-opacity=".22"/><path d="${A.hood}" fill="url(#${st.u}-hc)" ${s}/>`
            : `<path d="${A.hood}" fill="${st.line}" fill-opacity="${st.hair || 0.6}" ${s}/>`) +
          `<g stroke="${st.fill}" stroke-width="${st.sw * 0.9}" fill="none" stroke-linecap="round">${hs}</g>`;
      }
      return `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" viewBox="0 0 200 240" overflow="visible">${g}</svg>`;
    }
    if (st.mode === "two") {
      /* CHAMPION: sign-painted in two tones, navy hair over cream skin, a Logo-Blue jacket */
      const k = `stroke="${C.navy}" stroke-width="4" stroke-linejoin="round"`;
      g =
        `<g transform="translate(5 5)" fill="${C.blueDeep}" opacity=".5"><path d="${A.torso}"/><path d="${A.hair}"/><path d="${A.ears}"/></g>` +
        `<path d="${A.torso}" fill="${C.blue}" stroke="${C.enamel}" stroke-width="4.4" stroke-linejoin="round"/>` +
        `<path d="${A.seam}" stroke="${C.enamel}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
        `<path d="${A.neck}" fill="${C.cream}" ${k}/>` +
        `<path d="${A.collar}" fill="${C.blueDeep}" stroke="${C.enamel}" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="${A.ears}" fill="${C.cream}" ${k}/>` +
        `<path d="${A.head}" fill="${C.cream}" ${k}/>` +
        `<path d="${A.hair}" fill="${C.navy}" ${k}/>` +
        `<path d="M80 62 C90 50 112 49 122 60" stroke="#2D58C8" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>` +
        `<g stroke="${C.navy}" stroke-width="3.6" fill="none" stroke-linecap="round">${NAPE}</g>`;
    } else if (st.mode === "gold") {
      /* LEGEND: gilded solid hair, gold outline everywhere else */
      const s = `stroke="${C.gold}" stroke-width="${st.sw}" stroke-linejoin="round" stroke-linecap="round"`;
      g =
        `<path d="${A.torso}" fill="${C.glass}"/>` +
        `<path d="${torsoOpen}" fill="none" ${s}/>` +
        `<path d="${A.seam}" fill="none" stroke="${C.gold}" stroke-width="${st.sw * 0.8}" stroke-linecap="round"/>` +
        `<path d="${A.neck}" fill="${C.glass}" ${s}/>` +
        `<path d="${A.collar}" fill="${C.glass}" ${s}/>` +
        `<path d="${A.ears}" fill="${C.glass}" ${s}/>` +
        `<path d="${A.head}" fill="${C.glass}" ${s}/>` +
        `<path d="${A.hair}" fill="${C.shade}" transform="translate(4 4)"/>` +
        `<path d="${A.hair}" fill="url(#${st.u}-gg)" stroke="#07080A" stroke-width="3" paint-order="stroke"/>` +
        `<path d="${A.hair}" fill="url(#${st.u}-bn)"/>` +
        `<g stroke="${C.gold}" stroke-width="${st.sw * 0.7}" fill="none" stroke-linecap="round">${NAPE}</g>`;
    } else {
      /* chalk / marker: open contour, the hair a solid chalk mass */
      const line = st.line;
      const fill = st.fill;
      const s = `stroke="${line}" stroke-width="${st.sw}" stroke-linejoin="round" stroke-linecap="round"`;
      g =
        `<path d="${A.torso}" fill="${fill}"/>` +
        `<path d="${torsoOpen}" fill="none" ${s}/>` +
        `<path d="${A.seam}" fill="none" stroke="${st.seam || line}" stroke-width="${st.sw * 0.8}" stroke-linecap="round"/>` +
        `<path d="${A.neck}" fill="${fill}" ${s}/>` +
        `<path d="${A.collar}" fill="${fill}" ${s}/>` +
        `<path d="${A.ears}" fill="${fill}" ${s}/>` +
        `<path d="${A.head}" fill="${fill}" ${s}/>` +
        `<path d="${A.hair}" fill="${fill}"/>` +
        `<path d="${A.hair}" fill="${line}" fill-opacity="${st.hair || 0.6}" ${s}/>` +
        `<g stroke="${line}" stroke-width="${st.sw * 0.62}" fill="none" stroke-linecap="round">${NAPE}</g>`;
    }
    return `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" viewBox="0 0 200 240" overflow="visible">${g}</svg>`;
  }
  function avatarStyle(med, ground, u) {
    if (med === "enamel") return { mode: "two" };
    if (med === "gold") return { mode: "gold", sw: 3.4, u };
    if (med === "marker") return { line: C.chalk, fill: ground, sw: 3.6, seam: C.sky, hair: 0.62, hatch: true, u };
    return { line: C.chalk, fill: ground, sw: med === "rough" ? 4.6 : 4, hair: med === "rough" ? 0.55 : 0.6 };
  }

  /* hand-drawn rounded box with an overlapping closing stroke */
  function hbox(x1, y1, x2, y2, r, j = 0.5) {
    return (
      `M${r2(x1 + r + 3)} ${r2(y1 - j)} L${r2(x2 - r)} ${r2(y1 + j * 0.6)} Q${x2} ${y1} ${r2(x2 + j * 0.6)} ${r2(y1 + r)} ` +
      `L${r2(x2 - j)} ${r2(y2 - r)} Q${x2} ${y2} ${r2(x2 - r)} ${r2(y2 + j * 0.6)} L${r2(x1 + r)} ${r2(y2 - j * 0.8)} ` +
      `Q${x1} ${y2} ${r2(x1 + j * 0.6)} ${r2(y2 - r)} L${r2(x1 - j * 0.8)} ${r2(y1 + r)} Q${x1} ${y1} ${r2(x1 + r)} ${r2(y1 - j * 0.4)} L${r2(x1 + r + 16)} ${r2(y1 - j * 2.2)}`
    );
  }

  /* ---------- the face: header, fixture headline, stats with form bars, figure, meta ---------- */
  const SY = [210, 238, 266, 294];
  const AV = { x: 176, y: 250, h: 104 };
  function face(p, o, tier, u, ar, thumb, med) {
    const S = MC.s(o);
    const X = (x) => (ar ? 300 - x : x);
    const AS = ar ? "end" : "start";
    const AE = ar ? "start" : "end";
    const dir = ar ? -1 : 1;
    const gold = med === "gold";
    const enamel = med === "enamel";
    const marker = med === "marker";
    const chalky = med === "rough" || med === "chalk";
    const F = chalky ? `filter="url(#${u}-ch)"` : marker ? `filter="url(#${u}-mk)"` : "";
    const white = enamel ? C.enamel : C.chalk;
    const accent = marker || enamel ? C.sky : C.chalk;
    const ground = tier === "HOMA" ? C.paint : gold ? C.glass : C.slate;
    const ls = ar ? 0 : 0.7;
    const esc = MC.esc;
    /* gilding: shade, crisp black outline, mirror gold, burnish, leaf seams */
    const gilt = (attrs, txt, big) => {
      const sh = big ? 3 : 1.3;
      const ow = big ? 3 : 1.5;
      return (
        `<text ${attrs} fill="${C.shade}" stroke="${C.shade}" stroke-width="${ow}" stroke-linejoin="round" transform="translate(${r2(sh * dir)} ${sh})">${txt}</text>` +
        `<text ${attrs} fill="url(#${u}-gg)" stroke="#07080A" stroke-width="${ow}" stroke-linejoin="round" paint-order="stroke">${txt}</text>` +
        `<text ${attrs} fill="url(#${u}-bn)">${txt}</text>` +
        (big ? `<text ${attrs} fill="url(#${u}-sm)" opacity=".14">${txt}</text>` : "")
      );
    };
    const sweep = [];
    let s = "";

    /* chalk dust on the ledge */
    if (!gold) s += `<rect x="40" y="346" width="220" height="12" fill="${C.chalk}" opacity="${med === "rough" ? 0.1 : 0.06}" filter="url(#${u}-bs)"/>`;

    /* PRO: the signwriter's ruled guide lines */
    const name = MC.nameOf(p, o);
    const two = tw(name, 400, 44, "Lalezar") > 96;
    let nfs;
    let nBase;
    let box;
    let ofs;
    let lfs;
    if (!two) {
      /* one line: NAME – [84], sharing a baseline, like a fixture */
      const n0 = ar ? 72 : 64;
      nfs = Math.min(n0, (n0 * 96) / tw(name, 400, n0, "Lalezar"));
      nBase = 144;
      box = [166, 92, 252, 172];
      ofs = 66;
      lfs = 9;
    } else {
      /* two lines: the name across the board, the box under it at the inline end */
      const n0 = ar ? 52 : 56;
      nfs = Math.max(40, Math.min(n0, (n0 * 208) / tw(name, 400, n0, "Lalezar")));
      nBase = ar ? 118 : 120;
      const top = Math.max(ar ? 136 : 128, nBase + tdesc(name, nfs, ar) + 5);
      box = [166, r2(top), 252, r2(top + Math.min(58, 194 - top))];
      ofs = 50;
      lfs = 8.5;
    }
    const dH = ofs * 0.58;
    const lH = lfs * 0.64;
    const gap = two ? 6 : 9;
    const blockTop = box[1] + (box[3] - box[1] - (dH + gap + lH)) / 2;
    const oBase = r2(blockTop + dH);
    const lBase = r2(oBase + gap + lH);
    const [bx1, by1, bx2, by2] = ar ? [300 - box[2], box[1], 300 - box[0], box[3]] : box;
    const bcx = (bx1 + bx2) / 2;

    if (marker && !thumb) {
      s += `<g stroke="${C.sky}" stroke-width=".55" opacity=".24">`;
      [nBase, ...SY].forEach((y) => (s += `<path d="M40 ${y + 0.5}H262"/>`));
      s += `</g>`;
    }

    /* header: MANAGER · 2026/27, and the tier */
    const tierWord = S.tiers[tier];
    if (!thumb) {
      const head = ar ? HEAD.ar : HEAD.lat;
      const hfs = ar ? 14 : 12;
      const hwt = ar ? 700 : 800;
      const pad = enamel ? 6 : 0;
      const hx1 = X(46 + pad);
      const hw1 = tw(head, hwt, hfs, "Changa", ls);
      const hdot = hx1 + dir * (hw1 + 7);
      const hx2 = hdot + dir * 7;
      const hw2 = tw(p.season, 800, 12, "Changa", ls);
      const hEnd = hx2 + dir * hw2;
      const hy = enamel ? 74 : 70;
      const ha = (x, w, fs, extra = "") => `x="${r2(x)}" y="${hy}" text-anchor="${AS}" class="c06-ch" font-weight="${w}" font-size="${fs}" letter-spacing="${ls}"${extra}`;
      if (enamel) {
        /* CHAMPION: a painted Logo-Blue band, lettered in white enamel */
        const band = raggedPoly(
          [
            [44, 55],
            [256, 55],
            [256, 84],
            [44, 84],
          ],
          31,
          1.4,
          6,
        );
        s += `<polygon points="${pts(ar ? mirrorPts(band) : band)}" fill="${C.blue}"/>`;
        s += `<text ${ha(hx1, hwt, hfs)} fill="${C.enamel}">${esc(head)}</text>`;
        s += `<circle cx="${r2(hdot + dir * 0.5)}" cy="${hy - 4}" r="1.6" fill="${C.enamel}"/>`;
        s += `<text ${ha(hx2, 800, 12, ' direction="ltr"')} fill="${C.enamel}">${esc(p.season)}</text>`;
        const tfs = ar ? 13 : 10.5;
        s += `<text x="${X(248)}" y="${ar ? 74.5 : 73.5}" text-anchor="${AE}" class="c06-ch" font-weight="800" font-size="${tfs}" letter-spacing="${ar ? 0 : 1.6}" fill="${C.enamel}">${esc(tierWord)}</text>`;
      } else if (gold) {
        /* LEGEND: the tier rides on the topper; the glass carries a gilded line */
        s += gilt(ha(hx1, hwt, hfs), esc(head), false);
        s += `<circle cx="${r2(hdot + dir * 0.5)}" cy="${hy - 4}" r="1.7" fill="${C.gold}" stroke="#07080A" stroke-width=".6"/>`;
        s += gilt(ha(hx2, 800, 12, ' direction="ltr"'), esc(p.season), false);
        s += `<path d="M${r2(hx1)} 79.4 H${r2(hEnd + dir * 6)}" stroke="${C.gold}" stroke-width="1.2"/>`;
      } else {
        s += `<g ${F} fill="${white}">`;
        s += `<text ${ha(hx1, hwt, hfs)}>${esc(head)}</text>`;
        s += `<circle cx="${r2(hdot + dir * 0.5)}" cy="${hy - 4}" r="1.5"/>`;
        s += `<text ${ha(hx2, 800, 12, ' direction="ltr"')} fill="${accent}">${esc(p.season)}</text>`;
        s += `</g>`;
        const ux2 = hEnd + dir * 6;
        s += `<path d="M${r2(hx1)} 79.2 Q${r2((hx1 + ux2) / 2)} 77.4 ${r2(ux2)} 79.6" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" fill="none" ${F}/>`;
        /* the tier, circled twice like a chalked result, at the inline end */
        const tfs = ar ? 15 : 13.5;
        const tls = ar ? 0 : 0.6;
        const tW = tw(tierWord, 800, tfs, "Changa", tls);
        const rx = tW / 2 + 11;
        const tcx = X(252) - dir * rx;
        s += `<text x="${r2(tcx + (ar ? 0 : tls / 2))}" y="70.5" text-anchor="middle" class="c06-ch" font-weight="800" font-size="${tfs}" letter-spacing="${tls}" fill="${white}" ${F}>${esc(tierWord)}</text>`;
        s +=
          `<path d="M${r2(tcx - rx + 4)} 58.5 C${r2(tcx - rx - 8)} 63 ${r2(tcx - rx)} 77.5 ${r2(tcx)} 77.2 S${r2(tcx + rx + 4)} 70 ${r2(tcx + rx)} 62.5 S${r2(tcx - rx * 0.4)} 52 ${r2(tcx - rx - 3)} 62" ` +
          `fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" ${F}/>`;
      }
    }

    /* the fixture headline: NAME – [84 OVR] */
    const nx = X(46);
    const nw = tw(name, 400, nfs, "Lalezar");
    const nameEnd = nx + dir * nw;
    const nameAttr = `x="${r2(nx)}" y="${nBase}" text-anchor="${AS}" class="c06-lz" font-size="${r2(nfs)}"`;
    if (gold) {
      s += gilt(nameAttr, esc(name), true);
      sweep.push(nameAttr, esc(name));
    } else if (enamel) {
      s += `<text ${nameAttr} fill="${C.blue}" transform="translate(${3 * dir} 3)">${esc(name)}</text>`;
      s += `<text ${nameAttr} fill="${C.enamel}">${esc(name)}</text>`;
    } else {
      s += `<text ${nameAttr} fill="${white}" ${F}>${esc(name)}</text>`;
    }
    /* STADE: a chalked drop line under the name, clear of Arabic tails and of the box */
    if (med === "chalk" && !thumb) {
      const dy = r2(nBase + Math.max(4, tdesc(name, nfs, ar)) + 7);
      let endX = nameEnd + dir * 10;
      if (dy > by1 - 3 && dy < by2 + 3) endX = ar ? Math.max(endX, bx2 + 8) : Math.min(endX, bx1 - 8);
      if (dy < 194 && Math.abs(endX - nx) > 30) {
        s += `<path d="M${r2(nx)} ${dy} Q${r2((nx + endX) / 2)} ${r2(dy - 1.4)} ${r2(endX)} ${r2(dy - 0.2)} l${4 * dir} -3" stroke="${C.chalk}" stroke-width="1.7" fill="none" stroke-linecap="round" ${F}/>`;
      }
    }
    /* the dash between the two sides of the fixture */
    const dash = (x1, x2, y) => {
      if (gold) return `<path d="M${r2(x1)} ${r2(y + 1.2)} L${r2(x2)} ${r2(y + 1.2)}" stroke="${C.shade}" stroke-width="3.6" stroke-linecap="round"/><path d="M${r2(x1)} ${r2(y)} L${r2(x2)} ${r2(y)}" stroke="${C.gold}" stroke-width="3.2" stroke-linecap="round"/>`;
      if (enamel) return `<path d="M${r2(x1 + 2 * dir)} ${r2(y + 2)} L${r2(x2 + 2 * dir)} ${r2(y + 2)}" stroke="${C.blue}" stroke-width="3.2" stroke-linecap="round"/><path d="M${r2(x1)} ${r2(y)} L${r2(x2)} ${r2(y - 0.4)}" stroke="${C.enamel}" stroke-width="3.2" stroke-linecap="round"/>`;
      return `<path d="M${r2(x1)} ${r2(y + 0.4)} L${r2(x2)} ${r2(y - 0.4)}" stroke="${accent}" stroke-width="2.4" stroke-linecap="round" ${F}/>`;
    };
    if (!two) {
      const gA = ar ? bx2 : nameEnd;
      const gB = ar ? nameEnd : bx1;
      if (gB - gA >= 24) {
        const mid = (gA + gB) / 2;
        const dl = Math.min(14, gB - gA - 12);
        s += dash(mid - dl / 2, mid + dl / 2, nBase - nfs * 0.29);
      }
    } else if (!thumb) {
      const ex = ar ? bx2 + 10 : bx1 - 10;
      s += dash(ex - dir * 14, ex, (by1 + by2) / 2);
    }
    /* score box, the 84, and its label */
    const ovr = String(p.ovr);
    const oAttr = `x="${r2(bcx)}" y="${oBase}" text-anchor="middle" class="c06-lz" font-size="${ofs}" direction="ltr"`;
    const lAttr = `x="${r2(bcx + 0.75)}" y="${lBase}" text-anchor="middle" class="c06-ch" font-weight="800" font-size="${lfs}" letter-spacing="1.5" direction="ltr"`;
    if (gold) {
      s += `<rect x="${bx1}" y="${by1}" width="${bx2 - bx1}" height="${r2(by2 - by1)}" rx="10" fill="none" stroke="#07080A" stroke-width="4.4"/>`;
      s += `<rect x="${bx1}" y="${by1}" width="${bx2 - bx1}" height="${r2(by2 - by1)}" rx="10" fill="none" stroke="url(#${u}-gg)" stroke-width="2.4"/>`;
      s += `<rect x="${bx1 + 5}" y="${by1 + 5}" width="${bx2 - bx1 - 10}" height="${r2(by2 - by1 - 10)}" rx="6" fill="none" stroke="${C.gold}" stroke-opacity=".7" stroke-width=".8"/>`;
      s += gilt(oAttr, ovr, true);
      sweep.push(oAttr, ovr);
      if (!thumb) s += `<text ${lAttr} fill="${C.gold}" opacity=".9">OVR</text>`;
    } else if (enamel) {
      s += `<rect x="${bx1 + 2.5 * dir}" y="${by1 + 2.5}" width="${bx2 - bx1}" height="${r2(by2 - by1)}" rx="9" fill="none" stroke="${C.blue}" stroke-width="2.6"/>`;
      s += `<rect x="${bx1}" y="${by1}" width="${bx2 - bx1}" height="${r2(by2 - by1)}" rx="9" fill="none" stroke="${C.enamel}" stroke-width="2.4"/>`;
      s += `<text ${oAttr} fill="${C.blue}" transform="translate(${3 * dir} 3)">${ovr}</text>`;
      s += `<text ${oAttr} fill="${C.enamel}">${ovr}</text>`;
      if (!thumb) s += `<text ${lAttr} fill="${C.enamel}" opacity=".85">OVR</text>`;
    } else {
      s += `<path d="${hbox(bx1, by1, bx2, by2, 9, med === "rough" ? 1.4 : 0.6)}" fill="none" stroke="${marker ? C.sky : C.chalk}" stroke-width="${med === "rough" ? 2.2 : 1.9}" stroke-linecap="round" ${F}/>`;
      if (marker) s += `<rect x="${bx1 + 4.5}" y="${by1 + 4.5}" width="${bx2 - bx1 - 9}" height="${r2(by2 - by1 - 9)}" rx="5.5" fill="none" stroke="${C.chalk}" stroke-width="1.1" ${F}/>`;
      s += `<text ${oAttr} fill="${accent}" ${F}>${ovr}</text>`;
      if (!thumb) s += `<text ${lAttr} fill="${C.chalk}" opacity=".8" ${F}>OVR</text>`;
    }

    const avW = (AV.h * 200) / 240;
    const avX = ar ? 300 - AV.x - avW : AV.x;
    if (thumb) {
      s += figure(avX, AV.y, AV.h, avatarStyle(med, ground, u));
      return { s, sweep };
    }

    /* the list: label, figure, and a hand-drawn form bar of (value − 50) × 1.6 */
    const sfs = gold ? 16 : ar ? 17 : 18;
    const labs = MC.STATS.map((k) => (ar ? AR_STATS[k] : S.stats[k]));
    const lsS = ar ? 0 : 0.5;
    const lw = Math.max(...labs.map((l) => tw(l, 600, sfs, "Changa", lsS)));
    const vw = Math.max(...MC.STATS.map((k) => tw(String(p.stats[k]), 700, sfs, "Changa")));
    const lx = X(46);
    const vEdge = ar ? lx - lw - 9 : lx + lw + 9 + vw;
    const barX = ar ? vEdge - vw - 7 : vEdge + 7;
    const sInk = enamel ? C.enamel : C.chalk;
    let txt = "";
    let bars = "";
    MC.STATS.forEach((k, i) => {
      const y = SY[i];
      const la = `x="${r2(lx)}" y="${y}" text-anchor="${AS}" class="c06-ch" font-weight="600" font-size="${sfs}" letter-spacing="${lsS}"`;
      const va = `x="${r2(vEdge)}" y="${y}" text-anchor="end" class="c06-ch" font-weight="700" font-size="${sfs}" direction="ltr"`;
      if (gold) {
        txt += gilt(la, esc(labs[i]), false) + gilt(va, String(p.stats[k]), false);
      } else {
        txt += `<text ${la} fill="${sInk}">${esc(labs[i])}</text><text ${va} fill="${accent}">${p.stats[k]}</text>`;
      }
      const len = Math.max(4, (p.stats[k] - 50) * 1.6);
      const r = rng(17 + i * 7);
      const j = () => r2((r() - 0.5) * 0.9);
      const cy = y - (gold ? 5.4 : 6);
      const x0 = barX;
      const x1 = barX + dir * len;
      const d =
        `M${r2(x0)} ${r2(cy - 2.5 + j())} L${r2(x1 - dir * 1.6)} ${r2(cy - 2.7 + j())} ` +
        `Q${r2(x1 + dir * 0.9)} ${r2(cy)} ${r2(x1 - dir * 1.2)} ${r2(cy + 2.6 + j())} L${r2(x0)} ${r2(cy + 2.5 + j())} Z`;
      if (gold) {
        bars += `<path d="${d}" fill="${C.shade}" transform="translate(${r2(1.3 * dir)} 1.3)"/><path d="${d}" fill="url(#${u}-gg)" stroke="#07080A" stroke-width="1.1" paint-order="stroke"/>`;
      } else if (enamel) {
        bars += `<path d="${d}" fill="${C.blue}" transform="translate(${r2(1.6 * dir)} 1.6)"/><path d="${d}" fill="${C.sky}"/>`;
      } else {
        const col = marker ? C.sky : C.chalk;
        bars += `<path d="${d}" fill="url(#${u}-${marker ? "hs" : "hc"})" stroke="${col}" stroke-width="1.05" stroke-linejoin="round"/>`;
      }
    });
    s += `<g ${F}>${txt}${bars}</g>`;

    /* the manager */
    s += `<g ${chalky || marker ? F : ""}>${figure(avX, AV.y, AV.h, avatarStyle(med, ground, u))}</g>`;

    /* meta: club crest, BOT id, country */
    const mInk = gold ? C.gold : sInk;
    const mx = X(68);
    s += `<g opacity="${gold ? 0.92 : 0.88}" ${F}>`;
    s += `<g transform="translate(${r2(ar ? X(46) - 15 : X(46))} 318)">${MC.crest({ w: 15, h: 18, mono: mInk })}</g>`;
    s += `<text x="${r2(mx)}" y="328" text-anchor="${AS}" class="c06-mr" font-weight="700" font-size="10" letter-spacing=".6" fill="${mInk}" direction="ltr">${esc(p.id)}</text>`;
    const ctry = ar ? p.country.ar : p.country.lat;
    s += `<text x="${r2(mx)}" y="${ar ? 343 : 342}" text-anchor="${AS}" class="${ar ? "c06-ch" : "c06-mr"}" font-weight="700" font-size="${ar ? 11 : 10}" letter-spacing="${ar ? 0 : 0.6}" fill="${mInk}">${esc(ctry)}</text>`;
    s += `</g>`;
    return { s, sweep };
  }

  /* ---------- the carving: 26 FOUNDER cut into the bottom rail, beside the notch ---------- */
  function carving(ar) {
    const X = (x) => (ar ? 300 - x : x);
    const AS = ar ? "end" : "start";
    const dir = ar ? -1 : 1;
    const x0 = X(33);
    const by = 376;
    const w26 = tw("26", 800, 16, "Big Shoulders Display", 0.4);
    const word = ar ? "مؤسس" : "FOUNDER";
    const ww = ar ? tw(word, 700, 12, "Changa") : tw(word, 800, 11, "Big Shoulders Display", 1.2);
    const wx = x0 + dir * (w26 + 4.5);
    const cut = (x, y, extra, txt) =>
      `<text x="${r2(x + 0.4)}" y="${r2(y + 0.8)}" ${extra} fill="${C.lip}">${txt}</text>` + `<text x="${r2(x)}" y="${r2(y)}" ${extra} fill="${C.groove}">${txt}</text>`;
    /* chips knocked out where the knife entered and left */
    const chip = (x, y, a) => `<path d="M${r2(x)} ${r2(y)} l${r2(2.4 * a)} -0.9 l${r2(-1 * a)} 2 z" fill="${C.lip}" opacity=".9"/><path d="M${r2(x)} ${r2(y)} l${r2(2.4 * a)} -0.9" stroke="${C.groove}" stroke-width=".5"/>`;
    const wEnd = wx + dir * ww;
    return (
      `<g class="c06-carve" transform="rotate(${-1 * dir} ${x0} ${by})">` +
      cut(x0, by, `text-anchor="${AS}" class="c06-bs" font-weight="800" font-size="16" letter-spacing=".4" direction="ltr"`, "26") +
      cut(wx, ar ? by - 1.6 : by, `text-anchor="${AS}" class="${ar ? "c06-ch" : "c06-bs"}" font-weight="${ar ? 700 : 800}" font-size="${ar ? 12 : 11}" letter-spacing="${ar ? 0 : 1.2}"`, word) +
      chip(x0 - dir * 1.8, 364.2, dir) +
      chip(x0 + dir * (w26 + 0.6), 377.6, -dir) +
      chip(wEnd + dir * 1.4, 367.4, -dir) +
      chip(wx + dir * ww * 0.45, 378, dir) +
      `</g>`
    );
  }

  /* ---------- tools on the ledge ---------- */
  function ledgeTool(med, ar) {
    const x = ar ? 300 - 140 : 118;
    if (med === "rough" || med === "chalk")
      return `<g transform="translate(${x} 352.4) rotate(${ar ? 4 : -4} 10 2)"><rect width="21" height="4.6" rx="2.2" fill="${C.chalk}"/><rect x="1" y="2.6" width="19" height="2" rx="1" fill="#c9ccc4"/></g>`;
    if (med === "enamel") {
      const f = ar ? `translate(${x + 30} 354) scale(-1 1)` : `translate(${x} 354)`;
      return `<g transform="${f} rotate(-3 16 2)"><rect width="24" height="2.8" rx="1.2" fill="#a7743f"/><rect x="23" y="-.4" width="6" height="3.6" fill="#c8ccd0"/><path d="M29 -.6 L35 .6 L35 2.6 L29 3.4Z" fill="${C.blue}"/></g>`;
    }
    return "";
  }

  /* ---------- hardware ---------- */
  function caps(u) {
    const t = 7;
    const a = 18;
    const corner = (pp) => `<polygon points="${pts(pp)}" fill="url(#${u}-br)" stroke="#5f451a" stroke-width=".5"/>`;
    const tl = [
      [26 - 1.6, 22 - 1.6],
      [26 + a, 22 - 1.6],
      [26 + a, 22 + t],
      [xl(22 + t) + t, 22 + t],
      [xl(22 + a) + t, 22 + a],
      [xl(22 + a) - 1.6, 22 + a],
    ];
    const br = [
      [xr(380 - a) + 1.6, 380 - a],
      [xr(380 - a) - t, 380 - a],
      [xr(380 - t) - t, 380 - t],
      [288 - a, 380 - t],
      [288 - a, 380 + 1.6],
      [288 + 1.6, 380 + 1.6],
    ];
    const screws = (list) => list.map(([x, y]) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="1.15" fill="#5f451a"/><circle cx="${r2(x - 0.3)}" cy="${r2(y - 0.3)}" r=".45" fill="#f5e3a8"/>`).join("");
    /* the bottom-start corner stays bare wood: that is where the founder notch is cut */
    return (
      corner(tl) +
      corner(mirrorPts(tl)) +
      corner(br) +
      screws([
        [33, 25.5],
        [267, 25.5],
        [xr(374) - 5, 375.5],
      ])
    );
  }
  /* the hinge that joins the two faces, at the inline-end top corner */
  function hinge(u, ar, metal) {
    const M = (a) => (ar ? mirrorPts(a) : a);
    const X = (x) => (ar ? 300 - x : x);
    const f = `fill="url(#${u}-${metal})" stroke="${metal === "st" ? "#4b5258" : "#5f451a"}" stroke-width=".6"`;
    const sc = (x, y) => `<circle cx="${r2(X(x))}" cy="${y}" r="1.05" fill="#2c3035"/><circle cx="${r2(X(x) - 0.3)}" cy="${y - 0.3}" r=".4" fill="#fff" opacity=".7"/>`;
    return (
      `<polygon points="${pts(
        M([
          [277.4, 25],
          [284, 28.2],
          [285.4, 40.5],
          [278.6, 37.8],
        ]),
      )}" ${f}/>` +
      `<polygon points="${pts(
        M([
          [257, 25.2],
          [272.6, 25.2],
          [272.6, 35.8],
          [257, 35.8],
        ]),
      )}" ${f}/>` +
      `<rect x="${r2(ar ? 300 - 278.6 : 272.2)}" y="21.4" width="6.4" height="17.4" rx="2.6" ${f}/>` +
      `<path d="M${r2(X(273.6))} 27H${r2(X(277.4))}M${r2(X(273.6))} 33H${r2(X(277.4))}" stroke="#000" stroke-opacity=".35" stroke-width=".5"/>` +
      sc(260.6, 30.5) +
      sc(268.8, 30.5) +
      sc(281.2, 33.2)
    );
  }
  /* PRO: a steel clip on the inline-end stile holding the chalk marker */
  function markerClip(ar) {
    const cy = 172;
    const cx = xr(cy) - FW / 2;
    const X = (x) => (ar ? 300 - x : x);
    const rot = ar ? 2.24 : -2.24;
    const ox = X(cx);
    const pen =
      `<rect x="${r2(ox - 3.2 + 1.4)}" y="141.6" width="6.4" height="58" rx="2.6" fill="#000" opacity=".35"/>` +
      `<rect x="${r2(ox - 3.2)}" y="140" width="6.4" height="58" rx="2.6" fill="#1c2023"/>` +
      `<rect x="${r2(ox - 3.2)}" y="176" width="6.4" height="14" fill="${C.chalk}" opacity=".9"/>` +
      `<rect x="${r2(ox - 3.4)}" y="134" width="6.8" height="15" rx="2.6" fill="${C.sky}"/>` +
      `<rect x="${r2(ox - 1.6)}" y="198" width="3.2" height="4" rx="1" fill="#e7f6f9"/>` +
      `<path d="M${r2(ox - 1.6)} 140V196" stroke="#fff" stroke-opacity=".18" stroke-width="1"/>`;
    const band =
      `<rect x="${r2(ox - 9.2)}" y="${cy - 4}" width="18.4" height="8" rx="1.6" fill="#000" opacity=".3" transform="translate(1 1.2)"/>` +
      `<rect x="${r2(ox - 9.2)}" y="${cy - 4}" width="18.4" height="8" rx="1.6" fill="url(#${"__U__"}-st)" stroke="#4b5258" stroke-width=".6"/>` +
      `<path d="M${r2(ox - 8)} ${cy - 2.6}H${r2(ox + 8)}" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/>` +
      `<circle cx="${r2(ox + (ar ? 6 : -6))}" cy="${cy}" r="1" fill="#2c3035"/>`;
    return `<g transform="rotate(${rot} ${r2(ox)} ${cy})">${pen}${band}</g>`;
  }
  /* LEGEND: a gilded name-topper on two brass posts above the top rail */
  function topper(u, ar, thumb) {
    let s =
      `<g fill="url(#${u}-br)" stroke="#5f451a" stroke-width=".5"><rect x="99" y="9" width="7" height="14.5"/><rect x="194" y="9" width="7" height="14.5"/></g>` +
      `<rect x="84" y="-11" width="132" height="22" rx="2.2" fill="url(#${u}-gg)" stroke="#5a3f0c" stroke-width="1.1"/>` +
      `<rect x="84" y="-11" width="132" height="22" rx="2.2" fill="url(#${u}-bn)"/>` +
      `<rect x="84" y="-11" width="132" height="22" rx="2.2" fill="url(#${u}-sm)" opacity=".12"/>` +
      `<rect x="87.6" y="-7.4" width="124.8" height="14.8" rx="1.2" fill="none" stroke="#8a6a1e" stroke-width=".7"/>` +
      `<path d="M86.4 -9.9 H213.6" stroke="#FFF6D0" stroke-width=".9" opacity=".85"/>` +
      `<path d="M86.4 10.1 H213.6" stroke="#5a3f0c" stroke-width=".8" opacity=".6"/>`;
    if (!thumb) {
      const a = ar
        ? `x="150" y="3.8" text-anchor="middle" class="c06-ch" font-weight="800" font-size="13"`
        : `x="151.5" y="4.3" text-anchor="middle" class="c06-ch" font-weight="800" font-size="12.5" letter-spacing="3"`;
      const w = ar ? "أسطورة" : "LEGEND";
      s += `<text ${a} fill="#FFF3C4" opacity=".8" transform="translate(0 .8)">${w}</text><text ${a} fill="#33220A">${w}</text>`;
    }
    return s;
  }

  /* ---------- the A-frame: one geometry, five materials ---------- */
  function aFrame(u, tier, founder, thumb, ar) {
    /* asymmetric parts are mirrored numerically: lighting filters misrender under a negative scale */
    const M = (a) => (ar ? mirrorPts(a) : a);
    const poly = (a, attrs = "") => `<polygon points="${pts(M(a))}" ${attrs}/>`;
    const pine = tier === "HOMA";
    const glass = tier === "LEGEND";
    let rails;
    let stiles;
    let joints;
    if (pine) {
      /* butt joints: the rails run the full width, the stiles sit between them */
      rails = [
        [OUT[0], OUT[1], [xr(TI), TI], [xl(TI), TI]],
        [[xl(BI), BI], [xr(BI), BI], OUT[2], OUT[3]],
      ];
      stiles = [
        [[xl(TI), TI], [xl(TI) + FW, TI], [xl(BI) + FW, BI], [xl(BI), BI]],
        [[xr(TI) - FW, TI], [xr(TI), TI], [xr(BI), BI], [xr(BI) - FW, BI]],
      ];
      joints = `<path d="M${r2(xl(TI))} ${TI}H${r2(xl(TI) + FW)}M${r2(xr(TI) - FW)} ${TI}H${r2(xr(TI))}M${r2(xl(BI))} ${BI}H${r2(xl(BI) + FW)}M${r2(xr(BI) - FW)} ${BI}H${r2(xr(BI))}"/>`;
    } else {
      rails = [
        [OUT[0], OUT[1], IN[1], IN[0]],
        [IN[3], IN[2], OUT[2], OUT[3]],
      ];
      stiles = [
        [OUT[0], IN[0], IN[3], OUT[3]],
        [OUT[1], OUT[2], IN[2], IN[1]],
      ];
      joints = [0, 1, 2, 3].map((i) => `<path d="M${r2(OUT[i][0])} ${OUT[i][1]} L${r2(IN[i][0])} ${IN[i][1]}"/>`).join("");
    }
    const P = (a) => `<polygon points="${pts(a)}"/>`;
    const slot = `<rect x="120" y="28.5" width="60" height="12" rx="6"/>`;
    let s =
      `<clipPath id="${u}-rl">${rails.map(P).join("")}</clipPath><clipPath id="${u}-sti">${stiles.map(P).join("")}</clipPath>` +
      `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="-12" width="300" height="452"><rect x="0" y="-12" width="300" height="452" fill="#fff"/>` +
      `<g fill="#000">${slot}${founder ? poly(NOTCH) : ""}</g></mask>`;
    /* ground contact */
    if (!thumb) {
      const bx = ar ? 5 : 295;
      s +=
        `<g class="c06-contact" filter="url(#${u}-bs)" fill="#000">` +
        `<ellipse cx="16" cy="436.5" rx="11" ry="2.4"/><ellipse cx="284" cy="436.5" rx="11" ry="2.4"/><ellipse cx="${bx}" cy="434" rx="6" ry="2"/></g>`;
    }
    /* the back face: the depth of the A */
    const edge = pine ? `stroke="${C.pineEdge}" stroke-width="1.1" stroke-linejoin="round"` : "";
    s += poly(
      [
        [283, 374],
        [293, 380],
        [299, 434],
        [291, 436],
      ],
      `fill="${pine ? "#9C7A50" : "#4b301a"}" ${edge}`,
    );
    s += poly(
      [
        [274, 22],
        [282, 26],
        [296, 384],
        [288, 380],
      ],
      `fill="${pine ? C.pineBack : `url(#${u}-bk)`}" ${edge}`,
    );
    if (!pine) s += `<path d="M${ar ? 18 : 282} 26 L${ar ? 4 : 296} 384" stroke="#8a6342" stroke-width=".8" opacity=".7"/>`;
    /* legs and feet */
    const legL = [
      [30, 376],
      [42, 376],
      [22, 436],
      [10, 436],
    ];
    const legR = [
      [258, 376],
      [270, 376],
      [290, 436],
      [278, 436],
    ];
    if (pine) {
      s += `<g fill="${C.pine}" ${edge}>${P(legL)}${P(legR)}</g>`;
      s += `<g stroke="#9C7A50" stroke-width=".7" opacity=".8"><path d="M33 386 L25 420"/><path d="M267 386 L275 420"/></g>`;
      s += `<g fill="#6b4a2a"><circle cx="34.6" cy="383" r=".9"/><circle cx="265.4" cy="383" r=".9"/></g>`;
    } else {
      s += `<g fill="url(#${u}-lg)">${P(legL)}${P(legR)}</g>`;
      if (tier === "STADE") {
        s += `<g fill="#2b1a0d"><polygon points="10.6,433 22.6,433 22,436 10,436"/><polygon points="277.4,433 289.4,433 290,436 278,436"/></g>`;
      } else {
        /* PRO and CHAMPION stand on black rubber feet, LEGEND on brass ferrules */
        const fill = glass ? `url(#${u}-br)` : "#141516";
        const foot = (x1, x2) => `<rect x="${x1}" y="427.6" width="${r2(x2 - x1)}" height="9.4" rx="1.6" fill="${fill}"/>` + `<path d="M${x1 + 1} 428.6H${x2 - 1}" stroke="${glass ? "#FFF2C4" : "#4a4e52"}" stroke-width=".8"/>`;
        s += foot(8.8, 24.6) + foot(275.4, 291.2);
        const bk = M([[290.2, 427], [298.6, 427]]);
        s += `<rect x="${r2(Math.min(bk[0][0], bk[1][0]))}" y="427" width="8.4" height="8.6" rx="1.4" fill="${fill}" opacity=".85"/>`;
      }
    }
    /* the board: frame + face, with the carry slot and founder notch cut through */
    s += `<g mask="url(#${u}-m)">`;
    s += pine ? `<g>` : `<g filter="url(#${u}-bv)">`;
    const fw = pine ? C.pine : C.wood;
    s += `<g clip-path="url(#${u}-rl)"><rect x="0" y="0" width="300" height="440" fill="${fw}" filter="url(#${u}-wh)"/></g>`;
    s += `<g clip-path="url(#${u}-sti)"><rect x="0" y="0" width="300" height="440" fill="${fw}" filter="url(#${u}-wv)"/></g>`;
    s += `</g>`;
    s += `<g stroke="${pine ? "#8C6A44" : "#3a2210"}" stroke-width="${pine ? 1 : 0.8}" opacity=".75">${joints}</g>`;
    if (pine) {
      /* plywood laminations on the rail ends, and a few nail heads */
      const lam = (x, y1, y2, sgn) => {
        let g = `<rect x="${r2(sgn > 0 ? x : x - 3.4)}" y="${y1}" width="3.4" height="${y2 - y1}" fill="#E2C79E"/>`;
        for (let yy = y1 + 2.4; yy < y2 - 1; yy += 3.2) g += `<path d="M${r2(sgn > 0 ? x : x - 3.4)} ${r2(yy)}h3.4" stroke="#8C6A44" stroke-width=".8"/>`;
        return g;
      };
      s += lam(xl(22), 22.5, 49.5, 1) + lam(xr(22), 22.5, 49.5, -1) + lam(xl(BI) - 0.4, BI + 0.5, 379.5, 1) + lam(xr(BI) + 0.4, BI + 0.5, 379.5, -1);
      s += `<g fill="#5a4024">${[
        [xl(36) + 7, 36],
        [xr(36) - 7, 36],
        [xl(370) + 7, 370],
        [xr(370) - 7, 370],
      ]
        .map(([x, y]) => `<circle cx="${r2(x)}" cy="${y}" r="1.1"/>`)
        .join("")}</g>`;
    }
    s += `<g class="c06-slotedge" fill="none"><rect x="119.4" y="27.9" width="61.2" height="13.2" rx="6.6" stroke="${pine ? C.pineEdge : "#2f1b0b"}" stroke-width="1.6"/><path d="M125 41.6 H175" stroke="${C.lip}" stroke-width=".8" opacity=".8"/></g>`;
    if (founder) {
      /* the notch's two cut faces: one in shadow, one catching the light */
      const [a, apex, b] = NOTCH;
      s += poly(
        [
          [a[0], 380],
          apex,
          [apex[0] - 0.9, apex[1] - 2.2],
          [a[0] - 2.2, 380],
        ],
        `fill="${C.groove}"`,
      );
      s += poly(
        [
          apex,
          [b[0], 380],
          [b[0] + 2.2, 380],
          [apex[0] + 0.9, apex[1] - 2.2],
        ],
        `fill="${C.lip}"`,
      );
    }
    /* the face itself */
    s += `<g clip-path="url(#${u}-sl)">`;
    if (glass) {
      s += `<rect x="0" y="0" width="300" height="440" fill="url(#${u}-gl)"/>`;
      s += poly(
        [
          [160, 50],
          [232, 50],
          [104, 360],
          [32, 360],
        ],
        `fill="url(#${u}-rf)"`,
      );
      s += poly(
        [
          [246, 50],
          [262, 50],
          [190, 360],
          [174, 360],
        ],
        `fill="url(#${u}-rf)" opacity=".6"`,
      );
      s += `<path d="M${r2(IN[0][0] + 3)} 52.5 H${r2(IN[1][0] - 3)}" stroke="#fff" stroke-opacity=".16" stroke-width="1"/>`;
    } else if (pine) {
      /* raw plywood, brushed over with blackboard paint that stops short of the frame */
      const paint = raggedPoly(inset(2.6), 17, 2.6, 7);
      s += `<rect x="0" y="0" width="300" height="440" fill="${C.ply}" filter="url(#${u}-pw)"/>`;
      s += `<clipPath id="${u}-pa"><polygon points="${pts(M(paint))}"/></clipPath>`;
      s += `<polygon points="${pts(M(paint))}" fill="${C.paint}"/>`;
      s += `<g clip-path="url(#${u}-pa)"><rect x="20" y="40" width="260" height="330" fill="#fff" filter="url(#${u}-bm)" opacity=".32" transform="rotate(-2.5 150 200)"/></g>`;
    } else {
      s += `<rect x="0" y="0" width="300" height="440" fill="${C.slate}"/>`;
    }
    if (!glass) {
      s += `<rect x="20" y="40" width="260" height="330" fill="#fff" filter="url(#${u}-tt)"/>`;
      /* eraser arcs: last week's chalk, wiped in broad curves, away from the headline */
      s +=
        `<g filter="url(#${u}-er)" opacity="${pine ? 0.09 : 0.06}" fill="none" stroke="${C.chalk}" stroke-width="50" stroke-linecap="round">` +
        `<path d="M40 238 C108 206 190 214 262 252"/><path d="M58 322 C122 300 196 304 248 334"/><path d="M206 52 C232 52 252 60 268 76"/></g>`;
    }
    s += `<polygon points="${pts(IN)}" fill="none" stroke="#000" stroke-width="12" opacity=".55" filter="url(#${u}-bs)" transform="translate(${ar ? -1.4 : 1.4} 2.4)"/>`;
    if (glass) {
      /* the gilded fillet */
      s += `<polygon points="${pts(inset(5))}" fill="none" stroke="url(#${u}-gg)" stroke-width="1.3"/>`;
      s += `<polygon points="${pts(inset(8.5))}" fill="none" stroke="${C.gold}" stroke-opacity=".45" stroke-width=".5"/>`;
    }
    s += `</g>`;
    s += `</g>`;
    /* the outer edge: a lit lip on dark grounds, a darker edge for the pale pine */
    if (pine) s += `<polygon points="${pts(OUT)}" fill="none" stroke="${C.pineEdge}" stroke-width="1.2" stroke-linejoin="round"/>`;
    else s += `<polygon class="c06-rim" points="${pts(OUT)}" fill="none" stroke="#D9AA78" stroke-width="1.1" stroke-linejoin="round"/>`;
    /* hardware, by tier */
    let over = "";
    if (tier === "PRO") over += hinge(u, ar, "st") + markerClip(ar).replace(/__U__/g, u);
    if (tier === "CHAMPION" || glass) over += hinge(u, ar, "br") + caps(u);
    if (glass) over += topper(u, ar, thumb);
    return { body: s, over };
  }

  /* ---------- share light: the café door at the inline-start ---------- */
  function doorLight(u, ar) {
    const g = `<linearGradient id="${u}-lt" x1="${ar ? 1 : 0}" y1="0" x2="${ar ? 0 : 1}" y2="0"><stop offset="0" stop-color="#FFE2B0"/><stop offset=".55" stop-color="#FFE2B0" stop-opacity="0"/></linearGradient>`;
    const M = (a) => (ar ? mirrorPts(a) : a);
    const legL = [
      [30, 376],
      [42, 376],
      [22, 436],
      [10, 436],
    ];
    return (
      `<defs>${g}</defs>` +
      `<g style="mix-blend-mode:soft-light" opacity=".35" fill="url(#${u}-lt)"><polygon points="${pts(OUT)}"/><polygon points="${pts(M(legL))}"/></g>` +
      `<g fill="none" stroke="#FFD08A" stroke-linecap="round" opacity=".9"><path d="M${pts(M([OUT[0], OUT[3]])).replace(" ", " L")}" stroke-width="2.2"/><path d="M${pts(M([[30, 377], [10, 436]])).replace(" ", " L")}" stroke-width="1.6"/></g>`
    );
  }

  /* ---------- registration ---------- */
  const c = {
    id: "c06",
    n: 6,
    slug: "06-ardoise",
    name: "Ardoise",
    nameAr: "سبّورة المقهى",
    category: "bold",
    philosophy: "Your name, chalked on the café's pavement board for the whole street to read: the higher you rise, the harder it is to wipe off.",
    philosophyAr: "اسمك مكتوب على سبّورة المقهى ليقرأه الحيّ كله، وكلما ارتقيت صار محوه أصعب.",
    idea: [
      "The card is an object every Moroccan fan has walked past: the double-sided A-frame board a café puts on the pavement on match nights. A wooden frame, a carry slot cut through the top rail, two splayed legs and the narrow sliver of the board's second face. It is not a rectangle with a border; at 44px it is still a board standing on the pavement.",
      "The name and the 84 are written as a fixture headline: name first, a dash, then the figure in a chalk score box labelled OVR, the way a café writes WAC – RCA. Long names take their own line and the box drops beneath them, so the name never touches the number. The stats are a chalk list with a hand-drawn form bar after each figure, so the board reads as a stats board, never a price list.",
      "Progression is permanence, drawn in the medium and in the board itself: chalk on blackboard paint in a raw pine frame (HOMA), chalk on slate in a stained moulded frame (STADE), two-colour chalk marker with a steel hinge, rubber feet and a marker clipped to the stile (PRO), sign-painted enamel with brass corners and a varnished frame (CHAMPION), and gold leaf on black glass under a gilded name-topper (LEGEND). The outline is the same A-frame at every tier; LEGEND alone grows a stepped top.",
      "Typography carries the concept. Lalezar, a heavy poster face with Latin and Arabic, gives the name and the 84 the voice of hand-painted shop lettering; Changa sets the header, the tier and the list; Manrope is kept for the ID and the country, which are data, not lettering; Big Shoulders is the knife.",
    ],
    belonging: [
      "Everyone in Morocco understands the status of a name written on the café board: the whole street reads it. Seeing your own name there, with your 84 boxed beside it, is the screenshot.",
      "The ladder is easy to explain to a friend: my board is still raw pine and chalk, yours has a steel hinge and a marker; hers is gold leaf on glass with a topper. A 15-year-old wants the better one because it is harder to erase and better made, not because it is shinier.",
      "Arabic-first users get a face that was lettered for them, not a translation laid over a French card. Turning the board shows the other language, which is how the real boards work.",
      "The weekly rewrite (the old 84 wiped, the new one chalked) gives a reason to come back after every gameweek, while the frame and the carving say this board has been yours since 2026.",
    ],
    founderMark: [
      "FOUNDER 2026 is not written on the board, because chalk gets wiped every week. It is knife-cut into the wooden frame: '26' and FOUNDER carved into a deeper bottom rail at the inline-start, drawn as a dark groove with a lit lower lip and a few chips where the blade went in, like initials cut into a school desk.",
      "Right beside the carving, a V-notch is cut up into the rail from the bottom-start corner, with one cut face in shadow and one in light. The notch changes the silhouette itself, so a founder board is recognisable as a solid shape, and it is drawn at 10 units in the mini token so it still shows at 24px.",
      "The frame keeps its place at every tier, so the carving stays exactly where it was cut when HOMA pine becomes LEGEND gilt. Later cohorts' rails are smooth; the mark cannot be added afterwards.",
    ],
    small: [
      "At 44 to 80px the token is the A-frame front: a tapered board, its frame, the carry slot, two legs, the back-face sliver and the 84 in Lalezar. HOMA's frame is pale pine with a dark edge, STADE's stained wood, PRO adds black feet and a sky double box, CHAMPION a blue band and brass caps, LEGEND black glass, a gold fillet and the topper.",
      "At 24 to 32px it is rebuilt, not shrunk: the board fills two-thirds of the height, the carry slot becomes an open U-notch in the top edge, the legs become two splayed ticks, the frame is a solid 4-unit line, and the 84 switches to Changa 800 at 34 units (about 6px tall at 24px). LEGEND keeps a gold frame and the topper bump, CHAMPION a blue band; the founder notch is 10 units wide.",
      "The leaderboard row is a slate strip between two thin wood rails, with the 84 chalked in a box at the inline-start. Only your own row and a LEGEND row stand on leg stubs, so five rows do not stack like shelves.",
    ],
    rtl: [
      "The board has two faces and the Arabic one is lettered, not translated: مدرب and the season in Changa, علي in Lalezar's Arabic with room for its tails (long Arabic names move to their own line before they reach the box), and MSA list labels (قيادة، اختيار، انتقالات، ثبات). Digits, OVR and the BOT ID stay left-to-right; nothing Arabic is letter-spaced.",
      "The whole object mirrors: the name moves to the right, the score box to the left, the form bars grow leftwards, the back-face sliver and hinge move to the left edge because the board is seen from its other side, and the carving and notch move to that face's own inline-start (bottom-right). The BotolaGO logo is never mirrored.",
      "In the detail sheet, a tap turns the board on its legs to the other face, so every owner holds both languages.",
    ],
    tiers: {
      HOMA: "The street board: the same A-frame, knocked together in raw pine with butt joints, plywood laminations showing on the rail ends, plain batten legs and a few nail heads. The face is blackboard paint brushed over plywood, stopping short of the frame; fast, rough chalk.",
      STADE: "The café's proper slate: a stained, moulded frame lit along its bevels, a slate face with eraser arcs, crisp chalk, a drop line under the name and a chalk stick on the ledge.",
      PRO: "The board gets hardware: a steel hinge joining the two faces, black rubber feet, and a chalk marker clipped to the stile. Lettering in white and sky marker over ruled guide lines, the 84 in a double box, sky form bars.",
      CHAMPION: "The café has had it sign-painted: a Logo-Blue header band, the name and the 84 in white enamel with a blue drop shade, sky bars with a painted shadow, the manager in navy and cream on a Logo-Blue jacket, brass corners and hinge, a varnished frame.",
      LEGEND: "Verre églomisé: gold leaf on black glass, outlined in black and shaded in brown the way sign-writers gild, with an engine-turned burnish and faint leaf seams. A gilded name-topper on two brass posts carries LEGEND above the top rail, which changes the outline. The four stats stay on the glass in gold.",
    },
    legend: [
      "LEGEND stops being something written on the board and becomes the board. Black glass, flat mirror gold with a crisp black outline and a brown shade, an engine-turned burnish inside every letter, a gilded double rule round the 84, and the same frame, now varnished, capped in brass and crowned by a gilded topper standing on two posts.",
      "The topper gives LEGEND the only stepped outline in the set, so it reads as the top tier as a solid shape, at 24px, before any colour.",
      "With motion on, one specular sweep crosses the gilding, left to right in French and right to left in Arabic. It never loops; under reduced motion the gilded state simply shows. The spec's cloth wipe of the chalk before the reveal is designed but not built in this lab; the tap-to-turn is.",
    ],
    advantages: [
      "The only concept where both languages are full faces of one object, which makes bilingual Morocco literal without a flag.",
      "A silhouette nobody else owns in football collectibles: a tapered board on splayed legs with a cut-through slot, and a stepped crown at LEGEND. It survives as a solid shape on both grounds and at every tier.",
      "Progression is a story anyone can tell (pine and paint, slate, hardware and marker, enamel and brass, gold leaf and a topper), and each step changes the object, not only the lettering.",
      "The founder mark changes the object (a carving and a notch), so it reads as earned history, not a badge.",
      "Warm, adult craft at the top of the ladder; nothing in it looks like FUT, an NFT or a bank card.",
    ],
    risks: [
      "It can still read as a café menu board. The OVR label in the box, the form bars and the MANAGER header carry the football reading; if any of them is removed, the board drifts back to 'plat du jour'.",
      "Chalkboard texture slides easily into wedding-sign and craft-fair kitsch; the restraint of the type and the palette is doing the work.",
      "At icon size STADE, PRO and CHAMPION share one solid outline (only LEGEND's topper and the founder notch change it), so their tier is told by colour cues and the row's tier word. The app already uses an easel on legs for its 'standings unavailable' empty state, which this outline is close to.",
      "The café terrace on match night is mostly an adult male space, so girls and women may identify less with the setting than with the object.",
      "Lalezar has a Persian-poster character; if the owner rejects it, the fallback is Changa 800 under the same chalk treatment, which is less warm.",
      "The BotolaGO wordmark is not on the board itself (only on the share image); carved or gilded logo variants would be new logo treatments and need the owner's approval.",
      "Gold leaf must stay sign-painter craft. Pushed further (more sparkle, bevels, ornaments) it becomes casino or barbershop gold.",
    ],
    gridWidth: 220,
    detailWidth: 380,

    full(p, o = {}) {
      const ar = MC.isAr(o);
      const S = MC.s(o);
      const tier = p.tier;
      const u = MC.uid("c06");
      const founder = !!p.founder;
      const thumb = !!o.thumb;
      const med = MEDIUM[tier];
      const frame = aFrame(u, tier, founder, thumb, ar);
      const f = face(p, o, tier, u, ar, thumb, med);
      let content = `<g clip-path="url(#${u}-sl)">${f.s}</g>`;
      if (founder && !thumb) content += carving(ar);
      if (!thumb) content += ledgeTool(med, ar);
      content += frame.over;
      /* LEGEND: one specular sweep across the gilding (motion only, never loops) */
      if (tier === "LEGEND" && o.motion && !thumb && f.sweep.length) {
        let mask = "";
        for (let i = 0; i < f.sweep.length; i += 2) mask += `<text ${f.sweep[i]} fill="#fff">${f.sweep[i + 1]}</text>`;
        content +=
          `<mask id="${u}-gm" maskUnits="userSpaceOnUse" x="0" y="-12" width="300" height="452"><rect x="0" y="-12" width="300" height="452" fill="#000"/>${mask}</mask>` +
          `<g class="c06-sweep" mask="url(#${u}-gm)"><rect class="c06-sweep-bar" x="${ar ? 320 : -90}" y="40" width="70" height="330" fill="url(#${u}-sw)" transform="skewX(-14)"/></g>`;
      }
      if (o.lit) content += doorLight(u, ar);
      const svg =
        `<svg class="c06-face" viewBox="${VB}" aria-hidden="true" focusable="false">` +
        `<defs>${defs(u, tier)}<clipPath id="${u}-sl"><polygon points="${pts(IN)}"/></clipPath></defs>` +
        frame.body +
        content +
        `</svg>`;
      return (
        `<div class="c06 c06-${tier.toLowerCase()}${o.motion ? " is-motion" : ""}${thumb ? " is-thumb" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(MC.label(p, o))}" data-tier="${tier}" data-lang="${ar ? "ar" : "lat"}">` +
        `<div class="c06-turn">${svg}</div></div>`
      );
    },

    token(p, o = {}) {
      const size = o.size || 44;
      const mini = !!o.mini || size <= 32;
      const tier = p.tier;
      const ar = MC.isAr(o);
      const u = MC.uid("c06k");
      const founder = !!p.founder;
      const W = 62;
      const H = 82;
      const w = r2((size * W) / H);
      const ovr = String(p.ovr);
      const legend = tier === "LEGEND";
      const homa = tier === "HOMA";
      const champ = tier === "CHAMPION";
      const M = (a) => (ar ? mirrorPts(a, W) : a);
      const P = (a, attrs) => `<polygon points="${pts(a)}" ${attrs}/>`;
      const label = `role="img" aria-label="${MC.esc(MC.label(p, o))}"`;
      const wrap = (defsS, g) =>
        `<span class="c06-tok c06-tok-${tier.toLowerCase()}" style="width:${w}px;height:${size}px" ${label}>` +
        `<svg viewBox="0 0 ${W} ${H}" width="${w}" height="${size}" aria-hidden="true" focusable="false"><defs>${defsS}</defs>${g}</svg></span>`;
      const frameCol = homa ? C.pine : C.wood;
      const faceCol = homa ? C.paint : legend ? C.glass : C.slate;

      if (mini) {
        /* rebuilt for 24–32px: a tall board, a U-notch slot, two ticks, Changa digits */
        const top = legend ? 9.5 : 0;
        const bot = 64;
        const lx = (y) => 5 - (4 * y) / 64;
        const rx = (y) => 57 + (4 * y) / 64;
        const fr = 4;
        const out = [
          [lx(top), top],
          [rx(top), top],
          [rx(bot), bot],
          [lx(bot), bot],
        ];
        const inn = [
          [lx(top + fr) + fr, top + fr],
          [rx(top + fr) - fr, top + fr],
          [rx(bot - fr) - fr, bot - fr],
          [lx(bot - fr) + fr, bot - fr],
        ];
        const fc = legend ? "#D4AF37" : frameCol;
        let d =
          `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="-2" y="-2" width="66" height="86"><rect x="-2" y="-2" width="66" height="86" fill="#fff"/>` +
          `<path d="M27 ${top - 1} V${top + 2} A4 4 0 0 0 35 ${top + 2} V${top - 1} Z" fill="#000"/>` +
          (founder
            ? `<polygon points="${pts(
                M([
                  [3.6, 65],
                  [8.6, 55],
                  [13.6, 65],
                ]),
              )}" fill="#000"/>`
            : "") +
          `</mask>`;
        let g = "";
        const legs =
          P(
            [
              [14, 63],
              [18.6, 63],
              [4.6, 82],
              [0, 82],
            ],
            "",
          ) +
          P(
            [
              [43.4, 63],
              [48, 63],
              [62, 82],
              [57.4, 82],
            ],
            "",
          );
        g += `<g fill="${legend ? "#A8842C" : fc}"${homa ? ` stroke="${C.pineEdge}" stroke-width="1" stroke-linejoin="round"` : ""}>${legs}</g>`;
        if (legend)
          g +=
            `<rect x="17" y="0" width="28" height="6.2" rx="1" fill="#E6C65A" stroke="#7a5a12" stroke-width=".8"/>` +
            `<g fill="#A8842C"><rect x="20.5" y="6" width="4" height="4"/><rect x="37.5" y="6" width="4" height="4"/></g>`;
        g += `<g mask="url(#${u}-m)">`;
        g += P(out, `fill="${fc}"${homa ? ` stroke="${C.pineEdge}" stroke-width="1.2" stroke-linejoin="round"` : ""}`);
        g += P(inn, `fill="${faceCol}"`);
        let cy = (top + fr + bot - fr) / 2;
        if (champ) {
          g += `<rect x="${r2(inn[0][0])}" y="${top + fr}" width="${r2(inn[1][0] - inn[0][0])}" height="10" fill="${C.blue}"/>`;
          cy = (top + fr + 10 + bot - fr) / 2;
        }
        g += `</g>`;
        if (!homa && !legend) g += `<path class="c06-rim" d="M${r2(lx(top) + 0.6)} ${top + 0.7} H26.4 M35.6 ${top + 0.7} H${r2(rx(top) - 0.6)}" stroke="#D9AA78" stroke-width="1.4"/>`;
        const fs = legend ? 31 : 34;
        const col = homa || tier === "STADE" ? C.chalk : tier === "PRO" ? C.sky : champ ? C.enamel : "#EBCB60";
        g += `<text x="${W / 2}" y="${r2(cy + fs * 0.32)}" text-anchor="middle" class="c06-ch" font-weight="800" font-size="${fs}" fill="${col}" direction="ltr">${ovr}</text>`;
        return wrap(d, g);
      }

      /* 44–80px: the A-frame front */
      const top = legend ? 11 : 3;
      const bot = 63;
      const lx = (y) => 10 - (5 * (y - 3)) / 60;
      const rx = (y) => 50 + (5 * (y - 3)) / 60;
      const slot = size >= 40;
      const f = 4.4;
      const ft = slot ? 8.4 : 6.4;
      const fb = 6.8;
      const yi1 = top + ft;
      const yi2 = bot - fb;
      const out = [
        [lx(top), top],
        [rx(top), top],
        [55, bot],
        [5, bot],
      ];
      const inn = [
        [lx(yi1) + f, yi1],
        [rx(yi1) - f, yi1],
        [rx(yi2) - f, yi2],
        [lx(yi2) + f, yi2],
      ];
      const cx = 30;
      const cy = (yi1 + yi2) / 2;
      const ofs = legend ? 23 : 25;
      const base = r2(cy + ofs * 0.29);
      const edge = homa ? ` stroke="${C.pineEdge}" stroke-width=".9" stroke-linejoin="round"` : "";
      let d =
        `<linearGradient id="${u}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A26C3F"/><stop offset="1" stop-color="#7A4C2A"/></linearGradient>` +
        `<linearGradient id="${u}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldHi}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>` +
        `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>` +
        (slot ? `<rect x="23.5" y="${top + 1.6}" width="13" height="3.6" rx="1.8" fill="#000"/>` : "") +
        (founder
          ? `<polygon points="${pts(
              M([
                [6.2, bot + 0.6],
                [9, bot - 5.6],
                [11.8, bot + 0.6],
              ]),
            )}" fill="#000"/>`
          : "") +
        `</mask>`;
      let g = "";
      /* back face and its leg */
      g += P(
        M([
          [rx(top), top],
          [rx(top) + 4, top + 2],
          [59, bot + 2],
          [55, bot],
        ]),
        `fill="${homa ? C.pineBack : C.back}"${edge}`,
      );
      g += P(
        M([
          [55, bot],
          [58, bot + 1],
          [62, 80],
          [59, 80],
        ]),
        `fill="${homa ? "#9C7A50" : "#4b301a"}"`,
      );
      /* legs */
      const legA = [
        [12, bot - 1],
        [17.6, bot - 1],
        [8, 80],
        [2.4, 80],
      ];
      const legB = [
        [42.4, bot - 1],
        [48, bot - 1],
        [57.6, 80],
        [52, 80],
      ];
      g += `<g fill="${homa ? C.pine : "#8A5A34"}"${edge}>${P(legA, "")}${P(legB, "")}</g>`;
      if (tier === "PRO" || champ) g += `<g fill="#141516"><rect x="1.8" y="76.4" width="7" height="4" rx="1"/><rect x="51.2" y="76.4" width="7" height="4" rx="1"/></g>`;
      if (legend) g += `<g fill="#C79C42"><rect x="1.8" y="76.4" width="7" height="4" rx="1"/><rect x="51.2" y="76.4" width="7" height="4" rx="1"/></g>`;
      /* the board */
      g += `<g mask="url(#${u}-m)">`;
      g += P(out, `fill="${homa ? C.pine : `url(#${u}-w)`}"${edge}`);
      if (size >= 56) {
        if (homa) g += `<g stroke="#8C6A44" stroke-width=".7"><path d="M${r2(lx(yi1))} ${yi1}H${r2(lx(yi1) + f)}M${r2(rx(yi1) - f)} ${yi1}H${r2(rx(yi1))}M${r2(lx(yi2))} ${yi2}H${r2(lx(yi2) + f)}M${r2(rx(yi2) - f)} ${yi2}H${r2(rx(yi2))}"/></g>`;
        else g += `<g stroke="#6E4426" stroke-width=".6" opacity=".7"><path d="M${r2(lx(yi1))} ${r2(top + 2)}H${r2(rx(yi1))}"/><path d="M6 ${bot - 2.4}H54"/></g>`;
      }
      g += P(inn, `fill="${faceCol}"`);
      g += P(inn, `fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2"`);
      g += `</g>`;
      if (!homa) g += `<path class="c06-rim" d="M${r2(lx(top))} ${top + 0.4} H${r2(rx(top))}" stroke="#D9AA78" stroke-width="1"/>`;
      const capsT = `<g fill="#C79C42"><rect x="${r2(lx(top) - 1.4)}" y="${top - 1.4}" width="7" height="4.4"/><rect x="${r2(rx(top) - 5.6)}" y="${top - 1.4}" width="7" height="4.4"/><rect x="${r2(55 - 5.6)}" y="${bot - 4.4}" width="7" height="5.6"/></g>`;
      /* tier by medium */
      const tx = ar ? W - cx : cx;
      let t = "";
      if (homa || tier === "STADE") {
        t = `<text x="${tx}" y="${base}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="${C.chalk}" direction="ltr">${ovr}</text>`;
        if (tier === "STADE") t += `<path d="M${tx - 10} ${base + 3.6} H${tx + 10}" stroke="${C.chalk}" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>`;
      } else if (tier === "PRO") {
        const bw = 31;
        const bh = 26;
        t = `<rect x="${tx - bw / 2}" y="${r2(cy - bh / 2)}" width="${bw}" height="${bh}" rx="4" fill="none" stroke="${C.sky}" stroke-width="1.7"/>`;
        t += `<rect x="${tx - bw / 2 + 3}" y="${r2(cy - bh / 2 + 3)}" width="${bw - 6}" height="${bh - 6}" rx="2.2" fill="none" stroke="${C.chalk}" stroke-width=".8"/>`;
        t += `<text x="${tx}" y="${r2(cy + 20 * 0.29)}" text-anchor="middle" class="c06-lz" font-size="20" fill="${C.sky}" direction="ltr">${ovr}</text>`;
      } else if (champ) {
        const bandH = 6.6;
        t = `<rect x="${r2(inn[0][0])}" y="${yi1}" width="${r2(inn[1][0] - inn[0][0])}" height="${bandH}" fill="${C.blue}"/>`;
        const b = r2(cy + bandH / 2 + (ofs - 3) * 0.29);
        t += `<text x="${tx + (ar ? -1.5 : 1.5)}" y="${b + 1.5}" text-anchor="middle" class="c06-lz" font-size="${ofs - 3}" fill="${C.blue}" direction="ltr">${ovr}</text>`;
        t += `<text x="${tx}" y="${b}" text-anchor="middle" class="c06-lz" font-size="${ofs - 3}" fill="${C.enamel}" direction="ltr">${ovr}</text>`;
        t += capsT;
      } else if (legend) {
        const fi = inn.map(([x, y], i) => [x + (i === 0 || i === 3 ? 2.2 : -2.2), y + (i < 2 ? 2.2 : -2.2)]);
        t = `<polygon points="${pts(fi)}" fill="none" stroke="url(#${u}-g)" stroke-width="1.1"/>`;
        t += `<text x="${tx}" y="${base}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="url(#${u}-g)" stroke="#07080A" stroke-width=".7" paint-order="stroke" direction="ltr">${ovr}</text>`;
        t += capsT;
        /* the topper on its posts */
        t += `<g fill="#B8913A"><rect x="20.5" y="7.6" width="3" height="4"/><rect x="38.5" y="7.6" width="3" height="4"/></g>`;
        t += `<rect x="16.5" y="1.2" width="29" height="7" rx="1" fill="url(#${u}-g)" stroke="#6b4e10" stroke-width=".6"/>`;
      }
      return wrap(d, g + t);
    },

    row(p, o = {}) {
      const ar = MC.isAr(o);
      const S = MC.s(o);
      const tier = p.tier;
      const u = MC.uid("c06r");
      const med = MEDIUM[tier];
      const W = 358;
      const X = (x) => (ar ? W - x : x);
      const AS = ar ? "end" : "start";
      const AE = ar ? "start" : "end";
      const founder = !!p.founder;
      const glass = tier === "LEGEND";
      const homa = tier === "HOMA";
      const champ = tier === "CHAMPION";
      const stubs = !!o.me || glass;
      const gref = `url(#${u}-g)`;
      const ink = glass ? gref : med === "enamel" ? C.enamel : C.chalk;
      const accent = glass ? gref : med === "marker" ? C.sky : med === "enamel" ? C.enamel : C.chalk;
      const F = med === "rough" || med === "chalk" ? `filter="url(#${u}-ch)"` : "";
      let d =
        `<filter id="${u}-ch" x="-5%" y="-20%" width="110%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.25" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>` +
        `<linearGradient id="${u}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A26C3F"/><stop offset="1" stop-color="#7A4C2A"/></linearGradient>` +
        `<linearGradient id="${u}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldHi}"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>` +
        `<linearGradient id="${u}-gl" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#1B2028"/><stop offset="1" stop-color="#060708"/></linearGradient>`;
      let g = "";
      let t = "";
      /* the strip: a slate face between two thin rails (drawn LTR, mirrored as a whole) */
      const rail = homa ? C.pine : `url(#${u}-w)`;
      if (stubs) g += `<g fill="${rail}"><polygon points="17,55 24.4,55 21,63 13.6,63"/><polygon points="333.6,55 341,55 344.4,63 337,63"/></g>`;
      g += `<rect x="2" y="8.2" width="354" height="43.6" fill="${glass ? `url(#${u}-gl)` : homa ? C.paint : C.slate}"/>`;
      if (homa) g += `<g stroke="#4a514c" stroke-width=".7" opacity=".5"><path d="M8 15.6 C90 14.4 200 16.8 350 15M4 27.8 C120 29 230 26.6 354 28.4M10 41.4 C100 40.2 260 42.6 348 41"/></g>`;
      else if (!glass) g += `<rect x="2" y="8.2" width="354" height="3" fill="#000" opacity=".28"/>`;
      if (glass)
        g +=
          `<polygon points="150,8.2 196,8.2 166,51.8 120,51.8" fill="#fff" opacity=".05"/>` +
          `<g stroke="${C.gold}" stroke-opacity=".7" stroke-width=".8"><path d="M6 11.6H352M6 48.4H352"/></g>`;
      g += `<rect x="2" y="4" width="354" height="4.4" fill="${rail}"${homa ? ` stroke="${C.pineEdge}" stroke-width=".7"` : ""}/>`;
      g += `<rect x="2" y="51.6" width="354" height="4.4" fill="${rail}"${homa ? ` stroke="${C.pineEdge}" stroke-width=".7"` : ""}/>`;
      if (!homa) g += `<path d="M2 4.4H356" stroke="#D9AA78" stroke-width=".9" class="c06-rim"/>`;
      if (champ || glass) g += `<g fill="#C79C42"><rect x="0.6" y="3.2" width="8" height="6"/><rect x="349.4" y="3.2" width="8" height="6"/><rect x="0.6" y="50.8" width="8" height="6"/><rect x="349.4" y="50.8" width="8" height="6"/></g>`;
      if (founder) d += `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="64"><rect width="${W}" height="64" fill="#fff"/><polygon points="9,57 13.4,50.6 17.8,57" fill="#000"/></mask>`;
      /* rank */
      const rk = String(o.rank != null ? o.rank : "");
      t += `<text x="${X(26)}" y="36" text-anchor="middle" class="c06-mr" font-weight="800" font-size="17" fill="${ink}" direction="ltr" ${F}>${rk}</text>`;
      if (o.me) t += `<path d="M${X(26) - 12} 22.6 C${X(26) - 17} 32.6 ${X(26) - 6} 42.6 ${X(26) + 3} 41.6 S${X(26) + 16} 30.6 ${X(26) + 10} 22.6 S${X(26) - 6} 16.6 ${X(26) - 13} 25.6" fill="none" stroke="${C.sky}" stroke-width="1.6" stroke-linecap="round" ${F}/>`;
      /* the 84 in its box */
      const b1 = X(ar ? 94 : 44);
      const bw = 50;
      if (med === "enamel") {
        t += `<rect x="${b1}" y="13" width="${bw}" height="34" rx="3" fill="${C.blue}"/>`;
        t += `<text x="${b1 + bw / 2 + 1.4}" y="${39.6 + 1.4}" text-anchor="middle" class="c06-lz" font-size="27" fill="#002a8f" direction="ltr">${p.ovr}</text>`;
        t += `<text x="${b1 + bw / 2}" y="39.6" text-anchor="middle" class="c06-lz" font-size="27" fill="${C.enamel}" direction="ltr">${p.ovr}</text>`;
      } else {
        t += `<path d="${hbox(b1, 13, b1 + bw, 47, 5, homa ? 1 : 0.5)}" fill="none" stroke="${accent}" stroke-width="${glass ? 1.3 : 1.5}" ${F}/>`;
        if (med === "marker") t += `<rect x="${b1 + 3}" y="16" width="${bw - 6}" height="28" rx="2.5" fill="none" stroke="${C.chalk}" stroke-width=".8"/>`;
        t += `<text x="${b1 + bw / 2}" y="39.6" text-anchor="middle" class="c06-lz" font-size="27" fill="${med === "marker" ? C.sky : ink}"${glass ? ' stroke="#07080A" stroke-width=".8" paint-order="stroke"' : ""} direction="ltr" ${F}>${p.ovr}</text>`;
      }
      /* name + tier */
      const pts0 = String(o.pts != null ? o.pts : "");
      const pw = tw(pts0, 800, 17, "Manrope");
      const nx = X(108);
      const avail = W - 108 - 24 - pw - 14;
      const name = MC.nameOf(p, o);
      const n0 = ar ? 21 : 23;
      const nfs = r2(Math.max(14, Math.min(n0, (n0 * avail) / tw(name, 400, n0, "Lalezar"))));
      t += `<text x="${nx}" y="${ar ? 27.6 : 31}" text-anchor="${AS}" class="c06-lz" font-size="${nfs}" fill="${ink}" ${F}>${MC.esc(name)}</text>`;
      const tierWord = S.tiers[tier];
      t += `<text x="${nx}" y="${ar ? 47.2 : 45.6}" text-anchor="${AS}" class="c06-ch" font-weight="700" font-size="10.5" letter-spacing="${ar ? 0 : 0.5}" fill="${accent}" opacity="${glass ? 1 : 0.86}">${MC.esc(tierWord)}</text>`;
      /* points */
      t += `<text x="${X(338)}" y="36.2" text-anchor="${AE}" class="c06-mr c06-tab" font-weight="800" font-size="17" fill="${ink}" direction="ltr" ${F}>${pts0}</text>`;
      if (founder) g = `<g mask="url(#${u}-m)">${g}</g>`;
      const geo = ar ? `<g transform="translate(${W} 0) scale(-1 1)">${g}</g>` : g;
      return (
        `<div class="c06-row${o.me ? " is-me" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(`${rk}. ${name}, ${p.ovr} OVR, ${tierWord}, ${pts0} ${S.pts}`)}">` +
        `<svg viewBox="0 0 ${W} 64" aria-hidden="true" focusable="false"><defs>${d}</defs>${geo}${t}</svg></div>`
      );
    },

    share(p, o = {}) {
      const ar = MC.isAr(o);
      const S = MC.s(o);
      const u = MC.uid("c06s");
      const M = ar ? `transform="translate(360 0) scale(-1 1)"` : "";
      const floor = 500;
      /* pavement: rows of cement pavers, staggered, converging on a vanishing point behind the board */
      let joints = "";
      const vx = 200;
      const vy = 380;
      const at = (x640, yy) => vx + ((x640 - vx) * (yy - vy)) / (640 - vy);
      let y = floor + 3;
      for (let i = 0; y < 640; i++) {
        const h = 7 + i * 5;
        const y2 = Math.min(640, y + h);
        joints += `<path d="M0 ${y}H360"/>`;
        for (let j = -14; j <= 14; j++) {
          const g0 = vx + (j + (i % 2) * 0.5) * 62;
          const xa = at(g0, y);
          const xb = at(g0, y2);
          if (xa > -20 && xa < 380 && xb > -20 && xb < 380) joints += `<path d="M${r2(xa)} ${y}L${r2(xb)} ${r2(y2)}"/>`;
        }
        y = y2;
      }
      const scene =
        `<svg class="c06-sh-bg" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>` +
        `<linearGradient id="${u}-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050f24"/><stop offset="1" stop-color="#0c2146"/></linearGradient>` +
        `<linearGradient id="${u}-pave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#11284d"/><stop offset="1" stop-color="#06122a"/></linearGradient>` +
        `<linearGradient id="${u}-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9A65A"/><stop offset=".45" stop-color="#FFD9A0"/><stop offset="1" stop-color="#FFE9C6"/></linearGradient>` +
        `<linearGradient id="${u}-jamb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a2a1c"/><stop offset="1" stop-color="#1a120b"/></linearGradient>` +
        `<radialGradient id="${u}-tv" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9FE3EF" stop-opacity=".95"/><stop offset=".5" stop-color="#5AB8F0" stop-opacity=".35"/><stop offset="1" stop-color="#5AB8F0" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${u}-spill" cx="0" cy=".7" r=".9"><stop offset="0" stop-color="#FFE2B0" stop-opacity=".36"/><stop offset=".5" stop-color="#FFE2B0" stop-opacity=".09"/><stop offset="1" stop-color="#FFE2B0" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="${u}-cone" x1="0" y1="0" x2="1" y2=".25"><stop offset="0" stop-color="#FFE2B0" stop-opacity=".42"/><stop offset=".6" stop-color="#FFE2B0" stop-opacity=".08"/><stop offset="1" stop-color="#FFE2B0" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="${u}-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050f24" stop-opacity=".85"/><stop offset="1" stop-color="#050f24" stop-opacity="0"/></linearGradient>` +
        `<filter id="${u}-grit" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 -.4"/></filter>` +
        `<filter id="${u}-sb" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>` +
        `<filter id="${u}-gb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>` +
        `</defs><g ${M}>` +
        `<rect width="360" height="${floor}" fill="url(#${u}-wall)"/>` +
        `<rect width="360" height="${floor}" fill="#fff" filter="url(#${u}-grit)" opacity=".05"/>` +
        /* the café doorway at the inline-start: warm inside, a TV's cool glow, a heavy jamb */
        `<rect x="-10" y="180" width="62" height="${floor - 180}" fill="url(#${u}-in)"/>` +
        `<rect x="-10" y="180" width="62" height="70" fill="#C98A48" opacity=".35"/>` +
        `<ellipse cx="18" cy="226" rx="30" ry="20" fill="url(#${u}-tv)"/>` +
        `<rect x="1" y="212" width="34" height="23" rx="2" fill="#15110d"/><rect x="3.5" y="214.5" width="29" height="18" rx="1" fill="#BFF2FA" opacity=".85"/><path d="M14 235 L18 241 L22 235" stroke="#15110d" stroke-width="2" fill="none"/>` +
        `<rect x="-10" y="${floor - 70}" width="62" height="70" fill="#7a4e26" opacity=".18"/>` +
        `<rect x="52" y="170" width="11" height="${floor - 170}" fill="url(#${u}-jamb)"/>` +
        `<rect x="-10" y="168" width="73" height="12" fill="#22170e"/>` +
        `<path d="M52 182V${floor}" stroke="#9FE3EF" stroke-opacity=".28" stroke-width="1.4"/>` +
        `<path d="M52 260V${floor}" stroke="#FFD08A" stroke-opacity=".5" stroke-width="1"/>` +
        `<rect width="360" height="${floor}" fill="url(#${u}-spill)"/>` +
        `<ellipse cx="66" cy="230" rx="34" ry="46" fill="#7FCBEA" opacity=".07" filter="url(#${u}-gb)"/>` +
        /* pavement */
        `<rect y="${floor}" width="360" height="${640 - floor}" fill="url(#${u}-pave)"/>` +
        `<rect x="-10" y="${floor - 1}" width="74" height="5" fill="#E7C89A" opacity=".55"/>` +
        `<rect y="${floor}" width="360" height="3" fill="#000" opacity=".35"/>` +
        `<g stroke="#03091a" stroke-width="1.1" opacity=".55">${joints}</g>` +
        `<rect y="${floor}" width="360" height="${640 - floor}" fill="#fff" filter="url(#${u}-grit)" opacity=".05"/>` +
        `<polygon points="-10,${floor} 56,${floor} 300,640 -10,640" fill="url(#${u}-cone)"/>` +
        /* the board's shadow, thrown away from the door */
        `<polygon points="70,606 330,606 360,616 360,640 130,640" fill="#000" opacity=".55" filter="url(#${u}-sb)"/>` +
        `<rect width="360" height="190" fill="url(#${u}-fade)"/>` +
        `</g></svg>`;
      const name = MC.nameOf(p, o);
      return (
        `<div class="c06-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(MC.label(p, o))}">` +
        scene +
        `<div class="c06-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
        `<div class="c06-sh-head"><p class="c06-sh-big"><span class="c06-sh-name">${MC.esc(name)}</span><span class="c06-sh-dot" aria-hidden="true"></span>${MC.ltr(String(p.ovr))}<span class="c06-sh-ovr">OVR</span></p>` +
        `<p class="c06-sh-line">${MC.esc(ar ? CAPTION.ar : CAPTION.lat)}</p>` +
        `<p class="c06-sh-id"><span>${MC.ltr(p.id)}</span><span>${MC.ltr(p.season)}</span></p></div>` +
        `<div class="c06-sh-board">${c.full(p, { ...o, thumb: false, lit: true })}</div>` +
        `</div>`
      );
    },

    /* Walk around it: a tap turns the board on its legs to the other language's face. */
    mount(el) {
      if (!el || !el.classList.contains("c06")) return;
      const turn = el.querySelector(".c06-turn");
      if (!turn) return;
      const tier = el.dataset.tier;
      const other = el.dataset.lang === "ar" ? "lat" : "ar";
      let back = null;
      el.tabIndex = 0;
      el.classList.add("is-live");
      const flip = () => {
        if (!back) {
          const tmp = document.createElement("div");
          tmp.innerHTML = c.full(MC.withTier(tier), { lang: other });
          back = tmp.querySelector(".c06-face");
          if (!back) return;
          back.classList.add("c06-face-back");
          turn.appendChild(back);
        }
        el.classList.toggle("is-turned");
      };
      el.addEventListener("click", flip);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          flip();
        }
      });
    },
  };
  MC.register(c);
})();
