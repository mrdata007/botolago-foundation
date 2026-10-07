/* 06 ARDOISE — the café's pavement A-board.
   A double-sided chalkboard in a carved wooden frame: one face French, one face Arabic.
   Rising tiers make the name harder to wipe off: chalk, liquid-chalk marker, sign-painter's
   enamel, then gold leaf on black glass. FOUNDER 2026 is knife-cut into the frame. */
(function () {
  const MC = window.MC;

  /* ---------- palette (artwork only) ---------- */
  const C = {
    chalk: "#EEF0EA",
    sky: "#9FE3EF",
    enamel: "#F7F7F2",
    blue: "#0151FC",
    blueDeep: "#0A33A8",
    wood: "#8A5A34",
    back: "#5E3D22",
    groove: "#3E2410",
    lip: "#C9A070",
    ply: "#B08A5E",
    plyEdge: "#D2B184",
    poplar: "#CDB083",
    slate: "#1E2A2F",
    paint: "#2A2F2C",
    glass: "#0B0D10",
    gold: "#D4AF37",
  };
  const MEDIUM = { HOMA: "rough", STADE: "chalk", PRO: "marker", CHAMPION: "enamel", LEGEND: "gold" };
  /* MSA list labels, shorter than the kit's so the chalk column stays one line. */
  const AR_STATS = { CAP: "قيادة", SEL: "اختيار", TRF: "انتقالات", CON: "ثبات" };
  const HEAD = { lat: ["CE SOIR", "J.07"], ar: ["الليلة", "الجولة 07"] };
  const CAPTION = { lat: "À l'affiche ce soir", ar: "اسمي على اللوحة الليلة" };

  /* ---------- fonts and measuring (canvas; estimates if canvas is unavailable) ---------- */
  try {
    [
      '400 64px "Lalezar"',
      '700 13px "Changa"',
      '800 13px "Changa"',
      '600 18px "Changa"',
      '800 12px "Big Shoulders Display"',
      '700 10px "Manrope"',
      '800 10px "Manrope"',
    ].forEach((f) => document.fonts.load(f));
    document.fonts.load('400 64px "Lalezar"', "علي ياسمين");
    document.fonts.load('700 14px "Changa"', "الليلة");
    document.fonts.load('600 18px "Changa"', "انتقالات");
  } catch (e) {
    /* fonts load on first use */
  }
  const EST = { Lalezar: 0.52, Changa: 0.6, Manrope: 0.66, "Big Shoulders Display": 0.42 };
  let ctx = null;
  function tw(text, weight, size, family, ls = 0) {
    const t = String(text);
    let w = 0;
    try {
      ctx = ctx || document.createElement("canvas").getContext("2d");
      ctx.font = `${weight} ${size}px "${family}"`;
      w = ctx.measureText(t).width;
    } catch (e) {
      w = 0;
    }
    if (!(w > 0)) w = t.length * size * (EST[family] || 0.6);
    return w + ls * Math.max(0, t.length - 1);
  }

  /* ---------- geometry (viewBox 0 0 300 440, drawn for the French face; Arabic mirrors) ---------- */
  const r2 = (n) => Math.round(n * 100) / 100;
  const pts = (a) => a.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");
  const xl = (y) => 26 - (14 * (y - 22)) / 358;
  const xr = (y) => 274 + (14 * (y - 22)) / 358;
  const FW = 15;
  const TI = 50;
  const BI = 364;
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
  const NOTCH = [
    [xl(345) - 3, 345],
    [xl(351) + 7, 351],
    [xl(357) - 3, 357],
  ];

  /* deterministic jitter for brush and plank edges */
  function rng(seed) {
    let s = seed;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }
  function ragged(x1, y1, x2, y2, seed, amp, step = 8) {
    const r = rng(seed);
    const p = [];
    for (let x = x1; x < x2; x += step) p.push([x, y1 + (r() - 0.5) * amp]);
    for (let y = y1; y < y2; y += step) p.push([x2 + (r() - 0.5) * amp, y]);
    for (let x = x2; x > x1; x -= step) p.push([x, y2 + (r() - 0.5) * amp]);
    for (let y = y2; y > y1; y -= step) p.push([x1 + (r() - 0.5) * amp, y]);
    return p;
  }
  const mirrorPts = (a, w = 300) => a.map(([x, y]) => [w - x, y]);

  /* ---------- shared defs ---------- */
  function defs(u, tier) {
    const rough = tier === "HOMA";
    const varnish = tier === "CHAMPION" || tier === "LEGEND";
    const wood = (id, f) =>
      `<filter id="${u}-${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${f[0]} ${f[1]}" numOctaves="3" seed="7" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.14  0 0 0 0 0.07  2.5 0 0 0 -1.02" result="g"/>` +
      `<feComposite in="g" in2="SourceGraphic" operator="in" result="gi"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="${f[0] * 2.6} ${f[1] * 2.6}" numOctaves="1" seed="12" result="n2"/>` +
      `<feColorMatrix in="n2" type="matrix" values="0 0 0 0 0.86  0 0 0 0 0.64  0 0 0 0 0.42  1.5 0 0 0 -0.66" result="h"/>` +
      `<feComposite in="h" in2="SourceGraphic" operator="in" result="hi"/>` +
      `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gi"/><feMergeNode in="hi"/></feMerge></filter>`;
    return (
      /* chalk: grain holes from noise, plus a hand wobble */
      `<filter id="${u}-ch" x="-8%" y="-12%" width="116%" height="124%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${rough ? 0.75 : 0.95}" numOctaves="2" seed="${rough ? 8 : 4}" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="${rough ? 2.8 : 1.6}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${rough ? "-3.4 0 0 0 2.3" : "-2.8 0 0 0 2.3"}" result="m"/>` +
      `<feComposite in="d" in2="m" operator="in"/></filter>` +
      /* liquid chalk marker: opaque, a slight wobble at the edge */
      `<filter id="${u}-mk" x="-6%" y="-10%" width="112%" height="120%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="2" result="n"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G"/></filter>` +
      /* slate haze: old chalk ground in, with a fine tooth */
      `<filter id="${u}-hz" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.028 0.042" numOctaves="3" seed="${rough ? 3 : 5}" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.93  0 0 0 0 0.94  0 0 0 0 0.92  ${rough ? "1.2 0 0 0 -0.46" : "0.9 0 0 0 -0.36"}" result="h"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="3" result="f"/>` +
      `<feColorMatrix in="f" type="matrix" values="0 0 0 0 0.93  0 0 0 0 0.94  0 0 0 0 0.92  0.55 0 0 0 -0.22" result="g"/>` +
      `<feMerge><feMergeNode in="h"/><feMergeNode in="g"/></feMerge></filter>` +
      wood("wh", [0.012, 0.3]) +
      wood("wv", [0.3, 0.012]) +
      /* plywood face: wide, wavy rotary-cut figure */
      `<filter id="${u}-pw" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.006 0.05" numOctaves="3" seed="21" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.36  0 0 0 0 0.2  3 0 0 0 -1.35" result="g"/>` +
      `<feComposite in="g" in2="SourceGraphic" operator="in" result="gi"/>` +
      `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gi"/></feMerge></filter>` +
      /* moulded frame: diffuse light on the blurred frame alpha, varnish sheen from CHAMPION */
      `<filter id="${u}-bv" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="b"/>` +
      `<feDiffuseLighting in="b" surfaceScale="3" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="40"/></feDiffuseLighting>` +
      `<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.5" k2="0" k3="0" k4="0" result="lit"/>` +
      (varnish
        ? `<feSpecularLighting in="b" surfaceScale="3" specularConstant="${tier === "LEGEND" ? 0.95 : 0.7}" specularExponent="22" lighting-color="#ffe7c6" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>` +
          `<feComposite in="lit" in2="s" operator="arithmetic" k2="1" k3="0.5" result="lit"/>`
        : "") +
      `<feComposite in="lit" in2="SourceAlpha" operator="in"/></filter>` +
      /* gold leaf: rounded ridges from the blurred letter, lit from high so the burnish runs down the stroke */
      `<linearGradient id="${u}-gg" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#F6E7A2"/><stop offset=".38" stop-color="#DDB848"/><stop offset=".5" stop-color="#B48A26"/><stop offset=".64" stop-color="#E6C862"/><stop offset="1" stop-color="#C39632"/></linearGradient>` +
      `<filter id="${u}-au" x="-6%" y="-12%" width="112%" height="124%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="b"/>` +
      `<feSpecularLighting in="b" surfaceScale="5" specularConstant="1.25" specularExponent="34" lighting-color="#FFF6D8" result="s"><feDistantLight azimuth="245" elevation="66"/></feSpecularLighting>` +
      `<feComposite in="s" in2="SourceAlpha" operator="in" result="si"/>` +
      `<feComposite in="SourceGraphic" in2="si" operator="arithmetic" k2="1" k3="0.95" result="g"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="6" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.22  0 0 0 0 0.04  0.7 0 0 0 -0.3" result="nm"/>` +
      `<feComposite in="nm" in2="SourceAlpha" operator="in" result="nn"/>` +
      `<feMerge><feMergeNode in="g"/><feMergeNode in="nn"/></feMerge></filter>` +
      /* gold-leaf seams: the squares the leaf was laid in */
      `<pattern id="${u}-sm" width="23" height="23" patternUnits="userSpaceOnUse"><path d="M0 .3H23M.3 0V23" stroke="#6b4e10" stroke-width=".55" fill="none"/></pattern>` +
      `<linearGradient id="${u}-br" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DD94"/><stop offset=".45" stop-color="#C79C42"/><stop offset="1" stop-color="#76571E"/></linearGradient>` +
      `<linearGradient id="${u}-gl" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#1B2028"/><stop offset=".45" stop-color="#0B0D10"/><stop offset="1" stop-color="#040506"/></linearGradient>` +
      `<linearGradient id="${u}-rf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".075"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#FFF9E6" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-lg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9C6A3E"/><stop offset=".55" stop-color="#7E5130"/><stop offset="1" stop-color="#5E3D22"/></linearGradient>` +
      `<linearGradient id="${u}-bk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A4527"/><stop offset="1" stop-color="#3F2815"/></linearGradient>` +
      `<filter id="${u}-bl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>` +
      `<filter id="${u}-bs" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.2"/></filter>`
    );
  }

  /* ---------- the shared avatar, drawn as a signwriter's contour ---------- */
  function figure(x, y, h, st) {
    const A = MC.AVATAR;
    const w = (h * 200) / 240;
    const sw = st.sw;
    const line = st.line;
    const fill = st.fill;
    const torsoOpen = A.torso.replace(/Z$/, "");
    let g;
    if (st.mode === "two") {
      /* CHAMPION: two-tone sign-painted silhouette */
      g =
        `<path d="${A.torso}" fill="${C.blue}"/>` +
        `<path d="${A.seam}" stroke="${C.enamel}" stroke-width="5" fill="none"/>` +
        `<path d="${A.neck}" fill="${C.enamel}"/>` +
        `<path d="${A.collar}" fill="${C.blueDeep}"/>` +
        `<path d="${A.ears}" fill="${C.enamel}"/>` +
        `<path d="${A.head}" fill="${C.enamel}"/>` +
        `<path d="${A.hair}" fill="${C.enamel}"/>`;
    } else {
      const s = `stroke="${line}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
      g =
        `<path d="${A.torso}" fill="${fill}"/>` +
        `<path d="${torsoOpen}" fill="none" ${s}/>` +
        `<path d="${A.seam}" fill="none" stroke="${st.seam || line}" stroke-width="${sw * 0.8}" stroke-linecap="round"/>` +
        `<path d="${A.neck}" fill="${fill}" ${s}/>` +
        `<path d="${A.collar}" fill="${fill}" ${s}/>` +
        `<path d="${A.ears}" fill="${fill}" ${s}/>` +
        `<path d="${A.head}" fill="${fill}" ${s}/>` +
        `<path d="${A.hair}" fill="${fill}" ${s}/>`;
    }
    return `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" viewBox="0 0 200 240" overflow="visible">${g}</svg>`;
  }

  /* hand-drawn rounded box with an overlapping closing stroke */
  function hbox(x1, y1, x2, y2, r, j = 0.5) {
    return (
      `M${r2(x1 + r + 3)} ${r2(y1 - j)} L${r2(x2 - r)} ${r2(y1 + j * 0.6)} Q${x2} ${y1} ${r2(x2 + j * 0.6)} ${r2(y1 + r)} ` +
      `L${r2(x2 - j)} ${r2(y2 - r)} Q${x2} ${y2} ${r2(x2 - r)} ${r2(y2 + j * 0.6)} L${r2(x1 + r)} ${r2(y2 - j * 0.8)} ` +
      `Q${x1} ${y2} ${r2(x1 + j * 0.6)} ${r2(y2 - r)} L${r2(x1 - j * 0.8)} ${r2(y1 + r)} Q${x1} ${y1} ${r2(x1 + r)} ${r2(y1 - j * 0.4)} L${r2(x1 + r + 16)} ${r2(y1 - j * 2.2)}`
    );
  }

  /* ---------- per-tier layout ---------- */
  function layout(tier) {
    const homa = tier === "HOMA";
    return {
      hy: 70,
      ny: 150,
      box: [166, 92, 252, 162],
      ovrY: 148,
      sy: [210, 238, 266, 294],
      av: homa ? { x: 156, y: 214, h: 118 } : { x: 152, y: 226, h: 128 },
      meta: homa ? [318, 333] : [328, 343],
    };
  }

  /* ---------- a slate face (HOMA, STADE, PRO, CHAMPION, and the LEGEND back) ---------- */
  function slateFace(p, o, tier, u, ar, thumb, med) {
    const S = MC.s(o);
    const X = (x) => (ar ? 300 - x : x);
    const AS = ar ? "end" : "start";
    const AE = ar ? "start" : "end";
    const dir = ar ? -1 : 1;
    const L = layout(tier);
    const chalky = med === "rough" || med === "chalk";
    const F = chalky ? `filter="url(#${u}-ch)"` : `filter="url(#${u}-mk)"`;
    const white = med === "enamel" ? C.enamel : C.chalk;
    const accent = med === "marker" || med === "enamel" ? C.sky : C.chalk;
    const ground = tier === "HOMA" ? C.paint : C.slate;
    const lsLat = ar ? 0 : 0.8;
    let s = "";

    /* old chalk: smudges and dust at the ledge */
    if (med !== "enamel") {
      s +=
        `<g filter="url(#${u}-bl)" opacity="${med === "rough" ? 0.14 : med === "chalk" ? 0.1 : 0.07}" fill="${C.chalk}">` +
        `<ellipse cx="${X(118)}" cy="184" rx="34" ry="7"/><ellipse cx="${X(222)}" cy="200" rx="24" ry="6"/>` +
        (med === "rough" ? `<ellipse cx="${X(90)}" cy="112" rx="40" ry="9"/>` : "") +
        `</g>`;
    }
    s += `<rect x="30" y="${tier === "HOMA" ? 326 : 352}" width="240" height="12" fill="${C.chalk}" opacity=".07" filter="url(#${u}-bs)"/>`;

    /* PRO: the signwriter's ruled guide lines */
    if (med === "marker" && !thumb) {
      s += `<g stroke="${C.sky}" stroke-width=".55" opacity=".24">`;
      [104, 150, ...L.sy].forEach((y) => (s += `<path d="M40 ${y + 0.5}H262"/>`));
      s += `</g>`;
    }

    /* header */
    const [h1, h2] = ar ? HEAD.ar : HEAD.lat;
    const hfs = ar ? 14 : 13;
    const hw1 = tw(h1, ar ? 700 : 800, hfs, "Changa", lsLat);
    const hw2 = tw(h2, ar ? 700 : 800, hfs, "Changa", lsLat);
    const hx1 = X(46);
    const hdot = hx1 + dir * (hw1 + 8);
    const hx2 = hdot + dir * 8;
    const hEnd = hx2 + dir * hw2;
    const [bx1, by1, bx2, by2] = ar ? [300 - L.box[2], L.box[1], 300 - L.box[0], L.box[3]] : L.box;
    const bcx = (bx1 + bx2) / 2;
    const tierWord = S.tiers[tier];
    if (!thumb) {
      if (med === "enamel") {
        /* CHAMPION: a painted Logo-Blue band, lettered in white enamel */
        const band = ragged(44, 55, 256, 84, 31, 1.6, 6);
        s += `<polygon points="${pts(ar ? mirrorPts(band) : band)}" fill="${C.blue}"/>`;
        s += `<polygon points="${pts(ar ? mirrorPts(band) : band)}" fill="#000" opacity=".12" transform="translate(0 1.4)" style="mix-blend-mode:multiply"/>`;
        s += `<text x="${r2(hx1 + dir * 6)}" y="74" text-anchor="${AS}" class="c06-ch" font-weight="800" font-size="${hfs}" letter-spacing="${lsLat}" fill="${C.enamel}">${MC.esc(h1)}</text>`;
        s += `<circle cx="${r2(hdot + dir * 6)}" cy="69.5" r="1.6" fill="${C.enamel}"/>`;
        s += `<text x="${r2(hx2 + dir * 6)}" y="74" text-anchor="${AS}" class="c06-ch" font-weight="800" font-size="${hfs}" letter-spacing="${lsLat}" fill="${C.enamel}">${MC.esc(h2)}</text>`;
        const tfs = ar ? 13 : 10.5;
        s += `<text x="${X(248)}" y="${ar ? 74.5 : 73.5}" text-anchor="${AE}" class="c06-ch" font-weight="800" font-size="${tfs}" letter-spacing="${ar ? 0 : 1.6}" fill="${C.enamel}">${MC.esc(tierWord)}</text>`;
        const tw0 = tw(tierWord, 800, tfs, "Changa", ar ? 0 : 1.6);
        const tStart = X(248) - dir * tw0;
        const hE = hEnd + dir * 6;
        const space = ar ? hE - tStart : tStart - hE;
        if (space > 34) {
          const m = (hE + tStart) / 2;
          s += `<g transform="translate(${r2(m - 6)} 61)">${MC.crest({ w: 12, h: 15, mono: C.enamel })}</g>`;
        }
      } else {
        s += `<g ${F} fill="${white}">`;
        s += `<text x="${r2(hx1)}" y="${L.hy}" text-anchor="${AS}" class="c06-ch" font-weight="${ar ? 700 : 800}" font-size="${hfs}" letter-spacing="${lsLat}">${MC.esc(h1)}</text>`;
        s += `<circle cx="${r2(hdot)}" cy="${L.hy - 4.5}" r="1.5"/>`;
        s += `<text x="${r2(hx2)}" y="${L.hy}" text-anchor="${AS}" class="c06-ch" font-weight="${ar ? 700 : 800}" font-size="${hfs}" letter-spacing="${lsLat}" fill="${accent}">${MC.esc(h2)}</text>`;
        s += `</g>`;
        /* wobbly underline */
        const ux1 = hx1;
        const ux2 = hEnd + dir * 6;
        s += `<path d="M${r2(ux1)} 79.2 Q${r2((ux1 + ux2) / 2)} 77.2 ${r2(ux2)} 79.6" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" fill="none" ${F}/>`;
        /* tier, circled twice like a chalked result */
        const tfs = ar ? 15 : 14;
        const tW = tw(tierWord, 800, tfs, "Changa", ar ? 0 : 0.6);
        const rx = tW / 2 + 11;
        s += `<text x="${r2(bcx)}" y="70.5" text-anchor="middle" class="c06-ch" font-weight="800" font-size="${tfs}" letter-spacing="${ar ? 0 : 0.6}" fill="${white}" ${F}>${MC.esc(tierWord)}</text>`;
        s +=
          `<g fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" ${F}>` +
          `<path d="M${r2(bcx - rx + 4)} 58.5 C${r2(bcx - rx - 8)} 63 ${r2(bcx - rx)} 77.5 ${r2(bcx)} 77.2 S${r2(bcx + rx + 4)} 70 ${r2(bcx + rx)} 62.5 S${r2(bcx - rx * 0.4)} 52 ${r2(bcx - rx - 3)} 62"/>` +
          `</g>`;
        /* chalked crest, only if it clears the tier ring */
        const crX = hEnd + dir * 13;
        const ringNear = bcx - dir * (rx + 6);
        if (ar ? crX - 14 > ringNear : crX + 14 < ringNear) {
          s += `<g transform="translate(${r2(ar ? crX - 14 : crX)} 56.5)" ${F}>${MC.crest({ w: 14, h: 17, mono: white })}</g>`;
        }
      }
    }

    /* the fixture headline: name … score box */
    const name = MC.nameOf(p, o);
    const nfs0 = ar ? 72 : 64;
    const nmax = 112;
    const nw0 = tw(name, 400, nfs0, "Lalezar");
    const nfs = Math.max(30, Math.min(nfs0, (nfs0 * nmax) / nw0));
    const nw = (nw0 * nfs) / nfs0;
    const nx = X(46);
    const nameEnd = nx + dir * nw;
    const nameAttr = `x="${r2(nx)}" y="${L.ny}" text-anchor="${AS}" class="c06-lz" font-size="${r2(nfs)}"`;
    if (med === "enamel") {
      s += `<text ${nameAttr} fill="${C.blue}" transform="translate(${3 * dir} 3)">${MC.esc(name)}</text>`;
      s += `<text ${nameAttr} fill="${C.enamel}">${MC.esc(name)}</text>`;
    } else {
      s += `<text ${nameAttr} fill="${white}" ${F}>${MC.esc(name)}</text>`;
    }
    /* STADE: a chalked drop line under the name */
    if (med === "chalk" && !thumb) {
      s += `<path d="M${r2(nx)} 163 Q${r2((nx + nameEnd) / 2)} 161.6 ${r2(nameEnd + dir * 10)} 162.8 l${4 * dir} -3" stroke="${C.chalk}" stroke-width="1.7" fill="none" stroke-linecap="round" ${F}/>`;
    }
    /* the dash between the two sides of the fixture */
    const gapA = ar ? bx2 : nameEnd;
    const gapB = ar ? nameEnd : bx1;
    if (gapB - gapA > 22) {
      const mid = (gapA + gapB) / 2;
      const dl = Math.min(14, gapB - gapA - 12);
      s += `<path d="M${r2(mid - dl / 2)} 128.6 L${r2(mid + dl / 2)} 127.8" stroke="${accent}" stroke-width="${med === "enamel" ? 3 : 2.4}" stroke-linecap="round" ${med === "enamel" ? "" : F}/>`;
    }
    /* score box and the 84 */
    const ovr = String(p.ovr);
    const ofs = 66;
    if (med === "enamel") {
      s += `<rect x="${bx1 + 2.5 * dir}" y="${by1 + 2.5}" width="${bx2 - bx1}" height="${by2 - by1}" rx="9" fill="none" stroke="${C.blue}" stroke-width="2.6"/>`;
      s += `<rect x="${bx1}" y="${by1}" width="${bx2 - bx1}" height="${by2 - by1}" rx="9" fill="none" stroke="${C.enamel}" stroke-width="2.4"/>`;
      s += `<text x="${r2(bcx + 3 * dir)}" y="${L.ovrY + 3}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="${C.blue}" direction="ltr">${ovr}</text>`;
      s += `<text x="${r2(bcx)}" y="${L.ovrY}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="${C.enamel}" direction="ltr">${ovr}</text>`;
    } else {
      s += `<path d="${hbox(bx1, by1, bx2, by2, 9, med === "rough" ? 1.4 : 0.6)}" fill="none" stroke="${med === "marker" ? C.sky : C.chalk}" stroke-width="${med === "rough" ? 2.2 : 1.9}" stroke-linecap="round" ${F}/>`;
      if (med === "marker") {
        s += `<rect x="${bx1 + 4.5}" y="${by1 + 4.5}" width="${bx2 - bx1 - 9}" height="${by2 - by1 - 9}" rx="5.5" fill="none" stroke="${C.chalk}" stroke-width="1.1" ${F}/>`;
      }
      s += `<text x="${r2(bcx)}" y="${L.ovrY}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="${accent}" direction="ltr" ${F}>${ovr}</text>`;
    }

    if (thumb) {
      s += figure(ar ? 300 - L.av.x - (L.av.h * 200) / 240 : L.av.x, L.av.y, L.av.h, avatarStyle(med, ground));
      return s;
    }

    /* the list: dash, label, figure */
    const sfs = ar ? 17 : 18;
    const labs = MC.STATS.map((k) => (ar ? AR_STATS[k] : S.stats[k]));
    const lw = Math.max(...labs.map((l) => tw(l, 600, sfs, "Changa", ar ? 0 : 0.5)));
    const nwm = Math.max(...MC.STATS.map((k) => tw(String(p.stats[k]), 700, sfs, "Changa")));
    const lx = X(60);
    const numEdge = ar ? lx - lw - 12 : lx + lw + 12 + nwm;
    const sInk = med === "enamel" ? C.enamel : C.chalk;
    s += `<g ${F}>`;
    MC.STATS.forEach((k, i) => {
      const y = L.sy[i];
      s += `<path d="M${X(46)} ${y - 6.2} L${X(54)} ${y - 6.8}" stroke="${sInk}" stroke-width="2" stroke-linecap="round"/>`;
      s += `<text x="${r2(lx)}" y="${y}" text-anchor="${AS}" class="c06-ch" font-weight="600" font-size="${sfs}" letter-spacing="${ar ? 0 : 0.5}" fill="${sInk}">${MC.esc(labs[i])}</text>`;
      s += `<text x="${r2(numEdge)}" y="${y}" text-anchor="end" class="c06-ch" font-weight="700" font-size="${sfs}" fill="${accent}" direction="ltr">${p.stats[k]}</text>`;
    });
    s += `</g>`;

    /* the manager, quick contour */
    const avW = (L.av.h * 200) / 240;
    s += `<g ${med === "enamel" ? "" : F}>${figure(ar ? 300 - L.av.x - avW : L.av.x, L.av.y, L.av.h, avatarStyle(med, ground))}</g>`;

    /* meta */
    const mfs = 9;
    const mInk = sInk;
    s += `<g fill="${mInk}" opacity=".86" ${F}>`;
    s += `<text x="${X(46)}" y="${L.meta[0]}" text-anchor="${AS}" class="c06-mr" font-weight="700" font-size="${mfs}" letter-spacing=".7" direction="ltr">${MC.esc(p.id)}</text>`;
    const ctry = ar ? p.country.ar : p.country.lat;
    const cw = tw(ctry, 700, ar ? 10 : mfs, ar ? "Changa" : "Manrope", ar ? 0 : 0.7);
    s += `<text x="${X(46)}" y="${L.meta[1]}" text-anchor="${AS}" class="${ar ? "c06-ch" : "c06-mr"}" font-weight="700" font-size="${ar ? 10 : mfs}" letter-spacing="${ar ? 0 : 0.7}">${MC.esc(ctry)}</text>`;
    const sx = X(46) + dir * (cw + 7);
    s += `<path d="M${r2(sx)} ${L.meta[1] - 3} l${r2(dir * 5)} -0.4" stroke="${mInk}" stroke-width="1.2" stroke-linecap="round"/>`;
    s += `<text x="${r2(sx + dir * 9)}" y="${L.meta[1]}" text-anchor="${AS}" class="c06-mr" font-weight="700" font-size="${mfs}" letter-spacing=".7" direction="ltr">${MC.esc(p.season)}</text>`;
    s += `</g>`;
    return s;
  }

  function avatarStyle(med, ground) {
    if (med === "enamel") return { mode: "two" };
    if (med === "gold") return { line: "#D9B648", fill: C.glass, sw: 3.2 };
    if (med === "marker") return { line: C.chalk, fill: ground, sw: 3.6, seam: C.sky };
    return { line: C.chalk, fill: ground, sw: med === "rough" ? 4.6 : 4 };
  }

  /* ---------- the LEGEND face: gold leaf on black glass ---------- */
  function legendFace(p, o, u, ar, thumb, motion) {
    const S = MC.s(o);
    const X = (x) => (ar ? 300 - x : x);
    const AS = ar ? "end" : "start";
    const dir = ar ? -1 : 1;
    let s = "";
    /* glass */
    s += `<polygon points="${pts(IN)}" fill="url(#${u}-gl)"/>`;
    const rb = ar
      ? [
          [300 - 160, 50],
          [300 - 232, 50],
          [300 - 104, 364],
          [300 - 32, 364],
        ]
      : [
          [160, 50],
          [232, 50],
          [104, 364],
          [32, 364],
        ];
    s += `<polygon points="${pts(rb)}" fill="url(#${u}-rf)"/>`;
    s += `<path d="M${r2(IN[0][0] + 3)} 52.5 H${r2(IN[1][0] - 3)}" stroke="#fff" stroke-opacity=".16" stroke-width="1"/>`;
    /* the gilded fillet */
    s += `<polygon points="${pts(inset(5))}" fill="none" stroke="url(#${u}-gg)" stroke-width="1.3"/>`;
    s += `<polygon points="${pts(inset(8.5))}" fill="none" stroke="#D4AF37" stroke-opacity=".45" stroke-width=".5"/>`;

    const golds = [];
    const gtext = (attrs, txt) => golds.push({ attrs, txt });
    /* header line: the tier, between ornamental rules */
    const tierWord = S.tiers.LEGEND;
    const tfs = ar ? 16 : 12.5;
    const tls = ar ? 0 : 3.2;
    const tW = tw(tierWord, 800, tfs, "Changa", tls);
    if (!thumb) gtext(`x="150" y="84" text-anchor="middle" class="c06-ch" font-weight="800" font-size="${tfs}" letter-spacing="${tls}"`, MC.esc(tierWord));
    /* name … box */
    const name = MC.nameOf(p, o);
    const nfs0 = ar ? 84 : 76;
    const nw0 = tw(name, 400, nfs0, "Lalezar");
    const nfs = Math.max(30, Math.min(nfs0, (nfs0 * 112) / nw0));
    gtext(`x="${X(48)}" y="182" text-anchor="${AS}" class="c06-lz" font-size="${r2(nfs)}"`, MC.esc(name));
    const box = ar ? [300 - 254, 110, 300 - 166, 190] : [166, 110, 254, 190];
    const bcx = (box[0] + box[2]) / 2;
    gtext(`x="${r2(bcx)}" y="175" text-anchor="middle" class="c06-lz" font-size="70" direction="ltr"`, String(p.ovr));

    const gold = golds
      .map(
        (g) =>
          `<text ${g.attrs} fill="#4A3410" transform="translate(${2.2 * dir} 2.4)">${g.txt}</text>` +
          `<text ${g.attrs} fill="url(#${u}-gg)" filter="url(#${u}-au)">${g.txt}</text>` +
          `<text ${g.attrs} fill="url(#${u}-sm)" opacity=".55">${g.txt}</text>`,
      )
      .join("");
    s += gold;
    if (!thumb) {
      const rl = tW / 2 + 12;
      s +=
        `<g stroke="url(#${u}-gg)" stroke-width="1.1" fill="#D4AF37">` +
        `<path d="M${150 - rl} 79.5H64"/><path d="M${150 + rl} 79.5H236"/>` +
        `<path d="M60 79.5l4 -3 4 3 -4 3z" stroke="none"/><path d="M232 79.5l4 -3 4 3 -4 3z" stroke="none"/></g>`;
    }
    s += `<rect x="${box[0]}" y="${box[1]}" width="${box[2] - box[0]}" height="${box[3] - box[1]}" rx="10" fill="none" stroke="url(#${u}-gg)" stroke-width="2.4"/>`;
    s += `<rect x="${box[0] + 5}" y="${box[1] + 5}" width="${box[2] - box[0] - 10}" height="${box[3] - box[1] - 10}" rx="6" fill="none" stroke="#D4AF37" stroke-opacity=".7" stroke-width=".8"/>`;
    /* the manager in a gilded outline, centred like a shop-window motif */
    s += figure(150 - (122 * 200) / 240 / 2, 212, 122, avatarStyle("gold"));
    if (!thumb) {
      s += `<text x="150" y="352" text-anchor="middle" class="c06-mr" font-weight="700" font-size="8.5" letter-spacing="1.4" fill="#D4AF37" opacity=".85" direction="ltr">${MC.esc(p.id)}  ${MC.esc(p.season)}</text>`;
    }
    /* the one specular sweep across the gilding (motion only, never loops) */
    if (motion && !thumb) {
      const mask = golds.map((g) => `<text ${g.attrs} fill="#fff">${g.txt}</text>`).join("");
      s +=
        `<mask id="${u}-gm" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="440"><rect width="300" height="440" fill="#000"/>${mask}</mask>` +
        `<g class="c06-sweep" mask="url(#${u}-gm)"><rect class="c06-sweep-bar" x="${ar ? 320 : -90}" y="40" width="70" height="330" fill="url(#${u}-sw)" transform="skewX(-14)"/></g>`;
    }
    return s;
  }

  /* ---------- the carving: FOUNDER cut into the bottom rail ---------- */
  function carving(ar, x0, y0, small) {
    const X = (x) => (ar ? 300 - x : x);
    const AS = ar ? "end" : "start";
    const dir = ar ? -1 : 1;
    const big = small ? 11 : 12.5;
    const w26 = tw("26", 800, big, "Big Shoulders Display", 0.4);
    const word = ar ? "مؤسس" : "FOUNDER";
    const wx = X(x0) + dir * (w26 + 4);
    const cut = (x, y, extra, txt) =>
      `<text x="${r2(x + 0.6)}" y="${r2(y + 0.6)}" ${extra} fill="${C.lip}" opacity=".85">${txt}</text>` +
      `<text x="${r2(x)}" y="${r2(y)}" ${extra} fill="${C.groove}">${txt}</text>`;
    return (
      `<g class="c06-carve" transform="rotate(${-1.5 * dir} ${X(x0)} ${y0})">` +
      cut(X(x0), y0, `text-anchor="${AS}" class="c06-bs" font-weight="800" font-size="${big}" letter-spacing=".4" direction="ltr"`, "26") +
      cut(wx, y0 - 1.2, `text-anchor="${AS}" class="${ar ? "c06-ch" : "c06-bs"}" font-weight="${ar ? 700 : 800}" font-size="${ar ? 8.5 : 7.6}" letter-spacing="${ar ? 0 : 0.9}"`, word) +
      `</g>`
    );
  }

  /* ---------- tools on the ledge ---------- */
  function ledgeTool(med, ar, y = 358) {
    const x = ar ? 300 - 228 : 196;
    if (med === "rough" || med === "chalk")
      return `<g transform="translate(${x} ${y}) rotate(${ar ? 4 : -4} 16 3)"><rect width="21" height="4.6" rx="2.2" fill="${C.chalk}"/><rect x="1" y="2.6" width="19" height="2" rx="1" fill="#c9ccc4"/></g>`;
    if (med === "marker")
      return `<g transform="translate(${ar ? x - 4 : x} 357.4) rotate(${ar ? 3 : -3} 16 3)"><rect width="30" height="5.6" rx="1.6" fill="#24292d"/><rect x="${ar ? 0 : 22}" y="-.3" width="9" height="6.2" rx="1.6" fill="${C.sky}"/><rect x="${ar ? 12 : 6}" y="1.6" width="10" height="2.4" fill="${C.chalk}" opacity=".9"/></g>`;
    if (med === "enamel") {
      const f = ar ? `translate(${x + 34} 358.6) scale(-1 1)` : `translate(${x - 4} 358.6)`;
      return `<g transform="${f} rotate(-3 16 2)"><rect width="24" height="2.8" rx="1.2" fill="#a7743f"/><rect x="23" y="-.4" width="6" height="3.6" fill="#c8ccd0"/><path d="M29 -.6 L35 .6 L35 2.6 L29 3.4Z" fill="${C.blue}"/></g>`;
    }
    return "";
  }

  /* ---------- brass corner caps (CHAMPION, LEGEND) ---------- */
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
    const bl = [
      [xl(380 - a) - 1.6, 380 - a],
      [xl(380 - a) + t, 380 - a],
      [xl(380 - t) + t, 380 - t],
      [12 + a, 380 - t],
      [12 + a, 380 + 1.6],
      [12 - 1.6, 380 + 1.6],
    ];
    const screws = (list) => list.map(([x, y]) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="1.15" fill="#5f451a"/><circle cx="${r2(x - 0.3)}" cy="${r2(y - 0.3)}" r=".45" fill="#f5e3a8"/>`).join("");
    return (
      corner(tl) +
      corner(mirrorPts(tl)) +
      corner(bl) +
      corner(mirrorPts(bl)) +
      screws([
        [33, 25.5],
        [267, 25.5],
        [xl(374) + 5, 375.5],
        [xr(374) - 5, 375.5],
      ])
    );
  }

  /* ---------- the A-frame (STADE and up) ---------- */
  function aFrame(u, tier, founder, thumb) {
    const rails = `<polygon points="${pts([OUT[0], OUT[1], IN[1], IN[0]])}"/><polygon points="${pts([IN[3], IN[2], OUT[2], OUT[3]])}"/>`;
    const stiles = `<polygon points="${pts([OUT[0], IN[0], IN[3], OUT[3]])}"/><polygon points="${pts([OUT[1], OUT[2], IN[2], IN[1]])}"/>`;
    const slot = `<rect x="120" y="28.5" width="60" height="12" rx="6"/>`;
    let s =
      `<clipPath id="${u}-rl">${rails}</clipPath><clipPath id="${u}-st">${stiles}</clipPath>` +
      `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="440"><rect width="300" height="440" fill="#fff"/>` +
      `<g fill="#000">${slot}${founder ? `<polygon points="${pts(NOTCH)}"/>` : ""}</g></mask>`;
    /* ground contact */
    if (!thumb) {
      s +=
        `<g class="c06-contact" filter="url(#${u}-bs)" fill="#000">` +
        `<ellipse cx="16" cy="436.5" rx="11" ry="2.4"/><ellipse cx="284" cy="436.5" rx="11" ry="2.4"/><ellipse cx="295" cy="434" rx="6" ry="2"/></g>`;
    }
    /* the back face: the depth of the A */
    s += `<polygon points="283,374 293,380 299,434 291,436" fill="#4b301a"/>`;
    s += `<polygon points="274,22 282,26 296,384 288,380" fill="url(#${u}-bk)"/>`;
    s += `<path d="M282 26 L296 384" stroke="#8a6342" stroke-width=".8" opacity=".7"/>`;
    /* legs */
    s += `<g fill="url(#${u}-lg)"><polygon points="30,376 42,376 22,436 10,436"/><polygon points="258,376 270,376 290,436 278,436"/></g>`;
    s += `<g fill="#2b1a0d"><polygon points="10.6,433 22.6,433 22,436 10,436"/><polygon points="277.4,433 289.4,433 290,436 278,436"/></g>`;
    /* the board: frame + slate, with the carry slot and founder notch cut through */
    s += `<g mask="url(#${u}-m)">`;
    s += `<g filter="url(#${u}-bv)">`;
    s += `<g clip-path="url(#${u}-rl)"><rect width="300" height="440" fill="${C.wood}" filter="url(#${u}-wh)"/></g>`;
    s += `<g clip-path="url(#${u}-st)"><rect width="300" height="440" fill="${C.wood}" filter="url(#${u}-wv)"/></g>`;
    s += `</g>`;
    s += `<g stroke="#3a2210" stroke-width=".8" opacity=".75">${[0, 1, 2, 3].map((i) => `<path d="M${r2(OUT[i][0])} ${OUT[i][1]} L${r2(IN[i][0])} ${IN[i][1]}"/>`).join("")}</g>`;
    s += `<g class="c06-slotedge" fill="none"><rect x="119.4" y="27.9" width="61.2" height="13.2" rx="6.6" stroke="#2f1b0b" stroke-width="1.6"/><path d="M125 41.6 H175" stroke="${C.lip}" stroke-width=".8" opacity=".8"/></g>`;
    if (founder) s += `<path d="M${r2(NOTCH[0][0] + 3)} 345 L${r2(NOTCH[1][0])} 351 L${r2(NOTCH[2][0] + 3)} 357" fill="none" stroke="#2f1b0b" stroke-width="1.1" stroke-linejoin="round"/>`;
    /* slate */
    s += `<g clip-path="url(#${u}-sl)">`;
    s += `<rect width="300" height="440" fill="${tier === "LEGEND" ? C.glass : C.slate}"/>`;
    if (tier !== "LEGEND") s += `<rect x="20" y="40" width="260" height="340" fill="#fff" filter="url(#${u}-hz)"/>`;
    s += `<polygon points="${pts(IN)}" fill="none" stroke="#000" stroke-width="12" opacity=".55" filter="url(#${u}-bs)" transform="translate(1.4 2.4)"/>`;
    s += `</g>`;
    s += `</g>`;
    /* lit outer edge (shown on dark grounds) */
    s += `<polygon class="c06-rim" points="${pts(OUT)}" fill="none" stroke="#D9AA78" stroke-width="1.1" stroke-linejoin="round"/>`;
    if (tier === "CHAMPION" || tier === "LEGEND") s += caps(u);
    return s;
  }

  /* ---------- HOMA: a plywood scrap, painted, propped on a crate ---------- */
  const HOMA_T = "translate(-14 4) translate(150 356) rotate(6) scale(.95) translate(-150 -356)";
  const HOMA_T_AR = "translate(14 4) translate(150 356) rotate(-6) scale(.95) translate(-150 -356)";
  const PLANK = [
    [24, 35],
    [29, 30],
    [271, 30],
    [276, 36],
    [276, 351],
    [270, 356],
    [31, 356],
    [24, 349],
  ];
  const PAINT = ragged(31, 37, 269, 341, 17, 3.2, 7);
  function plank(u, founder, thumb) {
    let s = "";
    /* crate */
    if (!thumb) s += `<ellipse cx="150" cy="437" rx="104" ry="3" fill="#000" opacity=".35" filter="url(#${u}-bs)" class="c06-contact"/>`;
    s += `<rect x="60" y="372" width="180" height="64" fill="#2a2016"/>`;
    s += `<g filter="url(#${u}-wh)">`;
    [374, 396, 418].forEach((y) => (s += `<rect x="54" y="${y}" width="192" height="15" fill="${C.poplar}"/>`));
    s += `</g>`;
    s += `<g fill="#B5946A"><rect x="54" y="370" width="11" height="68"/><rect x="235" y="370" width="11" height="68"/></g>`;
    s += `<g fill="#5b5f63">${[380, 402, 424].map((y) => `<rect x="57" y="${y}" width="5" height="1.4"/><rect x="238" y="${y}" width="5" height="1.4"/>`).join("")}</g>`;
    s += `<g stroke="#8d714c" stroke-width=".6" opacity=".6">${[374, 396, 418].map((y) => `<path d="M65 ${y + 0.4}H235"/>`).join("")}</g>`;
    /* plank */
    s += `<g transform="${HOMA_T}">`;
    s += `<mask id="${u}-pm" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="440"><rect width="300" height="440" fill="#fff"/>${founder ? `<polygon points="20,326 33,333 20,340" fill="#000"/>` : ""}</mask>`;
    s += `<g mask="url(#${u}-pm)">`;
    s += `<polygon points="276,36 282,33 282,353 276,351" fill="${C.plyEdge}"/>`;
    s += `<g stroke="#8a6a44" stroke-width=".7">${[38, 41, 44].map((d) => `<path d="M${276 + (d - 36) * 0.75} 36 V352"/>`).join("")}</g>`;
    s += `<polygon points="${pts(PLANK)}" fill="${C.ply}" filter="url(#${u}-pw)"/>`;
    s += `<polygon points="${pts(PAINT)}" fill="${C.paint}"/>`;
    s += `<g clip-path="url(#${u}-pc)"><rect x="20" y="30" width="260" height="320" fill="#fff" filter="url(#${u}-hz)"/></g>`;
    if (founder) s += `<path d="M24 326 L33 333 L24 340" fill="none" stroke="#5a4024" stroke-width="1"/>`;
    s += `</g></g>`;
    s += `<clipPath id="${u}-pc"><polygon points="${pts(PAINT)}"/></clipPath>`;
    return s;
  }

  /* ---------- registration ---------- */
  const c = {
    id: "c06",
    n: 6,
    slug: "06-ardoise",
    name: "Ardoise",
    nameAr: "سبّورة المقهى",
    category: "bold",
    philosophy:
      "Your name, chalked on the café's pavement board as tonight's main event: the higher you rise, the harder it is to wipe off.",
    philosophyAr: "اسمك مكتوب على سبّورة المقهى كأنه مباراة الليلة، وكلما ارتقيت صار محوه أصعب.",
    idea: [
      "The card is an object every Moroccan fan has walked past: the double-sided A-frame board a café puts on the pavement to announce tonight's match. A carved wooden frame, a carry slot cut through the top rail, two splayed legs and the narrow sliver of the board's second face. It is not a rectangle with a border; at 44px it is still a board standing on the pavement.",
      "The name and the 84 are written as a fixture headline: name first, then a dash, then the figure in a chalk score box, the way a café writes WAC — RCA. That puts the rating at the end of a line instead of the top corner, which is the main structural break from FUT.",
      "Progression is permanence, drawn in the medium: chalk on a painted plywood scrap (HOMA), chalk on real slate (STADE), liquid-chalk marker in two colours over ruled guide lines (PRO), sign-painted enamel with a Logo-Blue drop shade and brass corner caps (CHAMPION), and gold leaf on black glass (LEGEND). The frame never changes, so whatever is cut into it stays.",
      "Typography carries the concept. Lalezar, a heavy poster face with Latin and Arabic, gives the name and the 84 the voice of hand-painted shop lettering; Changa sets the header and the list; Manrope is kept for the ID and the season, which are data, not lettering.",
    ],
    belonging: [
      "Everyone in Morocco understands the status of a name written on the café board: it is tonight's event. Seeing your own name in that place is the screenshot.",
      "The ladder is easy to explain to a friend: my name is still in chalk, yours is in enamel. A 15-year-old wants the better one because it is harder to erase, not because it is shinier.",
      "Arabic-first users get a face that was lettered for them, not a translation laid over a French card. Turning the board shows the other language, which is how the real boards work.",
      "The weekly rewrite (the old 84 wiped, the new one chalked) gives a reason to come back after every gameweek, while the frame and the carving say this board has been yours since 2026.",
    ],
    founderMark: [
      "FOUNDER 2026 is not written on the board, because chalk gets wiped every week. It is knife-cut into the wooden frame: '26' and FOUNDER carved into the bottom rail at the inline-start, drawn as a groove with a lit lip, like initials cut into a school desk.",
      "A V-notch is cut out of the frame's outer edge just above the bottom-start corner. It changes the silhouette itself, so a founder board is recognisable as a solid shape, even at 24px.",
      "The frame is kept at every tier, so the carving stays exactly where it was cut when HOMA chalk becomes LEGEND gold. Later cohorts' frames are smooth; the mark cannot be added afterwards.",
    ],
    small: [
      "At 44 to 80px the token is the A-frame front alone: a tapered board, its wood frame, two legs, the back-face sliver and the 84 in Lalezar. The frame wood (#8A5A34) carries the outline at 5.4:1 on the light ground and 3.4:1 on the dark one, with a lighter lip on top.",
      "At 24 to 32px the frame thickens, the legs become two ticks, and the tier is told by medium: HOMA is a tilted plank with no legs, STADE a plain framed board, PRO a sky box round the 84, CHAMPION a blue band across the top, LEGEND a black glass board with a gold 84 and gold fillet. The founder notch is drawn larger.",
      "The leaderboard row is a long slate strip in the same frame, standing on two leg stubs, with the 84 chalked in a box at the inline-start.",
    ],
    rtl: [
      "The board has two faces and the Arabic one is lettered, not translated: الليلة and الجولة 07 in Changa, علي in Lalezar's Arabic at 72 units with room for its descenders, and MSA list labels (قيادة، اختيار، انتقالات، ثبات). Digits and the BOT ID stay left-to-right; nothing Arabic is letter-spaced.",
      "The whole object mirrors: the name moves to the right, the score box to the left, the back-face sliver to the left edge because the board is seen from its other side, and the carving to that face's own inline-start (bottom-right). The BotolaGO logo is never mirrored.",
      "In the detail sheet, a tap turns the board on its legs to the other face, so every owner holds both languages.",
    ],
    tiers: {
      HOMA: "A scrap of plywood painted with blackboard paint, raw ply showing round a brushed edge, propped at 6° on a fruit crate. No frame, no legs, fast smudged chalk. The silhouette is plank-on-crate, not the A-frame.",
      STADE: "The real slate A-frame: moulded frame, carry slot, legs, back face. Crisp chalk with a drop line under the name and a chalk stick on the ledge.",
      PRO: "Liquid-chalk marker in white and sky over the signwriter's ruled guide lines. The 84 sits in a double box and a marker lies on the ledge. Still wipeable, but only with intent.",
      CHAMPION: "The café has had it sign-painted: a Logo-Blue header band, the name and the 84 in white enamel with a blue drop shade, the manager as a two-tone silhouette, brass caps on the frame corners and a varnished frame.",
      LEGEND: "Verre églomisé: gold leaf on black glass with burnished highlights and visible leaf seams, a gilded fillet and a gilded outline of the manager. Only the tier, the name, the 84 and the ID remain; the weekly list moves to the back face.",
    },
    legend: [
      "LEGEND stops being something written on the board and becomes the board. Black glass, gold leaf laid in squares (the seams show), a gilded double-rule round the 84 and the same carved frame, now varnished and capped in brass.",
      "With motion on, one specular sweep crosses the gilding, left to right in French and right to left in Arabic. It never loops; under reduced motion the gilded state simply shows.",
      "The spec's full reveal (the board turning on its legs, a cloth wiping the chalk, the gold revealed behind it) is designed but only the sweep and the tap-to-turn are built in this lab.",
    ],
    advantages: [
      "The only concept where both languages are full faces of one object, which makes bilingual Morocco literal without a flag.",
      "A silhouette nobody else owns in football collectibles: a tapered board on splayed legs with a cut-through slot. It survives as a solid shape on both grounds.",
      "Progression is a story anyone can tell (chalk, marker, enamel, gold leaf) and each step changes material, finish, tools and, for HOMA, the whole outline.",
      "The founder mark changes the object (a carving and a notch), so it reads as earned history, not a badge.",
      "Warm, adult craft at the top of the ladder; nothing in it looks like FUT, an NFT or a bank card.",
    ],
    risks: [
      "It can read as a shop sign ('Café Ali') or a menu board. The J.07 header and the score box have to dominate, and the stats must never get dot leaders or prices.",
      "Chalkboard texture slides easily into wedding-sign and craft-fair kitsch; the restraint of the type and the palette is doing all the work.",
      "At icon size it can read as an easel or a school blackboard. The legs and the back-face sliver are what separate it; if either is lost at 24px the concept weakens.",
      "The café terrace on match night is mostly an adult male space, so girls and women may identify less with the setting than with the object.",
      "Lalezar has a Persian-poster character; if the owner rejects it, the fallback is Changa 800 under the same chalk treatment, which is less warm.",
      "The BotolaGO wordmark is not on the board itself (only on the share image); the burnt-wood or gilded logo variants that would fit it are new logo treatments and need the owner's approval.",
      "Gold leaf must stay sign-painter craft. Pushed further (more sparkle, more gold) it becomes luxury branding.",
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
      const med = o.back && tier === "LEGEND" ? "marker" : MEDIUM[tier];
      const mirror = ar ? `transform="translate(300 0) scale(-1 1)"` : "";
      let body = "";
      let content = "";
      if (tier === "HOMA") {
        body = plank(u, founder, thumb);
        const clip = ar ? mirrorPts(PAINT) : PAINT;
        content =
          `<clipPath id="${u}-pa"><polygon points="${pts(clip)}"/></clipPath>` +
          `<g transform="${ar ? HOMA_T_AR : HOMA_T}"><g clip-path="url(#${u}-pa)">${slateFace(p, o, tier, u, ar, thumb, med)}</g>` +
          (founder && !thumb ? carving(ar, 34, 353, true) : "") +
          (!thumb ? ledgeTool("rough", ar, 343) : "") +
          `</g>`;
      } else {
        body = aFrame(u, tier, founder, thumb);
        const face = tier === "LEGEND" && !o.back ? legendFace(p, o, u, ar, thumb, !!o.motion) : slateFace(p, o, tier, u, ar, thumb, med);
        content = `<g clip-path="url(#${u}-sl)">${face}</g>`;
        if (founder && !thumb) content += carving(ar, 33, 377.4, false);
        if (!thumb && !(tier === "LEGEND" && !o.back)) content += ledgeTool(med, ar);
      }
      const svg =
        `<svg class="c06-face" viewBox="0 0 300 440" aria-hidden="true" focusable="false">` +
        `<defs>${defs(u, tier)}<clipPath id="${u}-sl"><polygon points="${pts(IN)}"/></clipPath></defs>` +
        `<g ${mirror}>${body}</g>` +
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
      const W = 64;
      const w = r2((size * W) / 80);
      const top = 4;
      const bot = 60;
      const lx = (y) => 9 + ((4 - 9) * (y - top)) / (bot - top);
      const rx = (y) => 53 + ((58 - 53) * (y - top)) / (bot - top);
      const f = mini ? 6.4 : 4.6;
      const ft = mini ? 7 : size >= 56 ? 8.5 : 6.6;
      const fb = mini ? 6 : 5.2;
      const yi1 = top + ft;
      const yi2 = bot - fb;
      const out = [
        [9, top],
        [53, top],
        [58, bot],
        [4, bot],
      ];
      const inn = [
        [lx(yi1) + f, yi1],
        [rx(yi1) - f, yi1],
        [rx(yi2) - f, yi2],
        [lx(yi2) + f, yi2],
      ];
      const cx = 31;
      const cy = (yi1 + yi2) / 2;
      const ofs = mini ? 29 : 27;
      const base = r2(cy + ofs * 0.31);
      const ovr = String(p.ovr);
      const tx = ar ? W - cx : cx;
      let g = "";
      let top84 = "";
      let d =
        `<linearGradient id="${u}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A26C3F"/><stop offset="1" stop-color="#7A4C2A"/></linearGradient>` +
        `<linearGradient id="${u}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E7A2"/><stop offset=".45" stop-color="#D9B444"/><stop offset=".55" stop-color="#B98E2A"/><stop offset="1" stop-color="#E6C862"/></linearGradient>`;
      if (tier === "HOMA") {
        /* tilted plank, raw ply edge, no legs */
        const pl = mini ? [8, 10, 56, 60] : [9, 8, 55, 56];
        const T = `rotate(${ar ? -6 : 6} 32 ${pl[3]})`;
        g += `<g transform="${T}"${founder ? ` mask="url(#${u}-pm)"` : ""}>`;
        g += `<rect x="${pl[0]}" y="${pl[1]}" width="${pl[2] - pl[0]}" height="${pl[3] - pl[1]}" rx="1" fill="${C.ply}"/>`;
        g += `<rect x="${pl[0] + (mini ? 3.4 : 2.6)}" y="${pl[1] + (mini ? 3.4 : 2.6)}" width="${pl[2] - pl[0] - (mini ? 6.8 : 5.2)}" height="${pl[3] - pl[1] - (mini ? 6.8 : 5.2)}" fill="${C.paint}"/>`;
        if (founder) d += `<mask id="${u}-pm" maskUnits="userSpaceOnUse" x="-10" y="-10" width="84" height="100"><rect x="-10" y="-10" width="84" height="100" fill="#fff"/><polygon points="${ar ? `${pl[2] + 2},${pl[3] - 17} ${pl[2] - 5.5},${pl[3] - 11} ${pl[2] + 2},${pl[3] - 5}` : `${pl[0] - 2},${pl[3] - 17} ${pl[0] + 5.5},${pl[3] - 11} ${pl[0] - 2},${pl[3] - 5}`}" fill="#000"/></mask>`;
        top84 = `<text x="${tx}" y="${r2((pl[1] + pl[3]) / 2 + ofs * 0.31)}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="${C.chalk}" direction="ltr">${ovr}</text>`;
        g += top84 + `</g>`;
        if (mini) g += `<path d="M6 ${pl[3] + 8} H58" stroke="#8A5A34" stroke-width="3" stroke-linecap="round"/>`;
        else
          g +=
            `<rect x="14" y="62" width="36" height="16" fill="#2a2016"/>` +
            `<g fill="${C.poplar}"><rect x="12" y="62" width="40" height="5"/><rect x="12" y="70" width="40" height="5"/></g>` +
            `<g fill="#B5946A"><rect x="12" y="61" width="4" height="17"/><rect x="48" y="61" width="4" height="17"/></g>`;
        return `<span class="c06-tok" style="width:${w}px;height:${size}px" role="img" aria-label="${MC.esc(MC.label(p, o))}"><svg viewBox="0 0 ${W} 80" width="${w}" height="${size}" aria-hidden="true" focusable="false"><defs>${d}</defs>${g}</svg></span>`;
      }
      /* the A-frame */
      const notch = mini
        ? [
            [lx(40) - 2, 40],
            [lx(47) + 7, 47],
            [lx(54) - 2, 54],
          ]
        : [
            [lx(42) - 2, 42],
            [lx(47) + 4.6, 47],
            [lx(52) - 2, 52],
          ];
      d += `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="80"><rect width="${W}" height="80" fill="#fff"/>${size >= 56 ? `<rect x="25" y="6" width="12" height="3.6" rx="1.8" fill="#000"/>` : ""}${founder ? `<polygon points="${pts(notch)}" fill="#000"/>` : ""}</mask>`;
      const legW = mini ? 8.5 : 6;
      g += `<polygon points="53,${top} 57,${top + 2} 62,${bot + 2} 58,${bot}" fill="#5E3D22"/>`;
      g += `<polygon points="${mini ? `56,${bot} 60,${bot} 63,78 59,78` : `57,${bot} 60,${bot + 1} 63,78 60,78`}" fill="#4b301a"/>`;
      g += `<g fill="#8A5A34"><polygon points="${8},${bot - 1} ${8 + legW},${bot - 1} ${3 + legW},78 ${2},78"/><polygon points="${56 - legW},${bot - 1} ${56},${bot - 1} ${61},78 ${60 - legW},78"/></g>`;
      g += `<g mask="url(#${u}-m)">`;
      g += `<polygon points="${pts(out)}" fill="url(#${u}-w)"/>`;
      if (size >= 56) g += `<g stroke="#6E4426" stroke-width=".6" opacity=".7"><path d="M12 6.4H50"/><path d="M8 57.6H54"/><path d="M${r2(lx(20) + 2)} 20 L${r2(lx(50) + 2)} 50"/><path d="M${r2(rx(20) - 2)} 20 L${r2(rx(50) - 2)} 50"/></g>`;
      g += `<polygon points="${pts(inn)}" fill="${tier === "LEGEND" ? C.glass : C.slate}"/>`;
      g += `</g>`;
      g += `<path class="c06-rim" d="M9 ${top} H53" stroke="#D9AA78" stroke-width="${mini ? 1.6 : 1}"/>`;
      /* tier by medium */
      if (tier === "STADE") {
        top84 = `<text x="${tx}" y="${base}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="${C.chalk}" direction="ltr">${ovr}</text>`;
        if (!mini) top84 += `<path d="M${tx - 11} ${base + 3.4} H${tx + 11}" stroke="${C.chalk}" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>`;
      } else if (tier === "PRO") {
        const bw = mini ? 36 : 34;
        const bh = mini ? 32 : 28;
        top84 = `<rect x="${tx - bw / 2}" y="${r2(cy - bh / 2)}" width="${bw}" height="${bh}" rx="4" fill="none" stroke="${C.sky}" stroke-width="${mini ? 2.6 : 1.6}"/>`;
        if (!mini) top84 += `<rect x="${tx - bw / 2 + 3}" y="${r2(cy - bh / 2 + 3)}" width="${bw - 6}" height="${bh - 6}" rx="2.2" fill="none" stroke="${C.chalk}" stroke-width=".8"/>`;
        top84 += `<text x="${tx}" y="${r2(base - (mini ? 0.5 : 0))}" text-anchor="middle" class="c06-lz" font-size="${mini ? 25 : 22}" fill="${C.chalk}" direction="ltr">${ovr}</text>`;
      } else if (tier === "CHAMPION") {
        const bandH = mini ? 7.5 : 7;
        top84 = `<rect x="${r2(inn[0][0])}" y="${yi1}" width="${r2(inn[1][0] - inn[0][0])}" height="${bandH}" fill="${C.blue}"/>`;
        const b = r2(base + bandH / 2 - 1);
        top84 += `<text x="${tx + (ar ? -1.6 : 1.6)}" y="${b + 1.6}" text-anchor="middle" class="c06-lz" font-size="${ofs - 3}" fill="${C.blue}" direction="ltr">${ovr}</text>`;
        top84 += `<text x="${tx}" y="${b}" text-anchor="middle" class="c06-lz" font-size="${ofs - 3}" fill="${C.enamel}" direction="ltr">${ovr}</text>`;
        if (!mini) top84 += `<g fill="#C79C42"><rect x="7.4" y="2.6" width="7" height="4.4"/><rect x="47.6" y="2.6" width="7" height="4.4"/><rect x="2.6" y="56" width="7" height="5.4"/><rect x="52.4" y="56" width="7" height="5.4"/></g>`;
      } else if (tier === "LEGEND") {
        const fi = inn.map(([x, y], i) => [x + (i === 0 || i === 3 ? 2.2 : -2.2), y + (i < 2 ? 2.2 : -2.2)]);
        top84 = `<polygon points="${pts(fi)}" fill="none" stroke="url(#${u}-g)" stroke-width="${mini ? 1.8 : 1.1}"/>`;
        top84 += `<text x="${tx}" y="${base}" text-anchor="middle" class="c06-lz" font-size="${ofs}" fill="url(#${u}-g)" direction="ltr">${ovr}</text>`;
        if (!mini) top84 += `<g fill="#C79C42"><rect x="7.4" y="2.6" width="7" height="4.4"/><rect x="47.6" y="2.6" width="7" height="4.4"/><rect x="2.6" y="56" width="7" height="5.4"/><rect x="52.4" y="56" width="7" height="5.4"/></g>`;
      }
      const geo = ar ? `<g transform="translate(${W} 0) scale(-1 1)">${g}</g>` : g;
      return (
        `<span class="c06-tok c06-tok-${tier.toLowerCase()}" style="width:${w}px;height:${size}px" role="img" aria-label="${MC.esc(MC.label(p, o))}">` +
        `<svg viewBox="0 0 ${W} 80" width="${w}" height="${size}" aria-hidden="true" focusable="false"><defs>${d}</defs>${geo}${top84}</svg></span>`
      );
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
      const ink = glass ? `url(#${u}-g)` : med === "enamel" ? C.enamel : C.chalk;
      const accent = glass ? `url(#${u}-g)` : med === "marker" ? C.sky : med === "enamel" ? C.enamel : C.chalk;
      const F = med === "rough" || med === "chalk" ? `filter="url(#${u}-ch)"` : "";
      let d =
        `<filter id="${u}-ch" x="-5%" y="-20%" width="110%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.25" result="m"/><feComposite in="d" in2="m" operator="in"/></filter>` +
        `<linearGradient id="${u}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A26C3F"/><stop offset="1" stop-color="#7A4C2A"/></linearGradient>` +
        `<linearGradient id="${u}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E7A2"/><stop offset=".45" stop-color="#D9B444"/><stop offset=".55" stop-color="#B98E2A"/><stop offset="1" stop-color="#E6C862"/></linearGradient>` +
        `<linearGradient id="${u}-gl" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#1B2028"/><stop offset="1" stop-color="#060708"/></linearGradient>`;
      let g = "";
      let t = "";
      const homa = tier === "HOMA";
      /* the strip (geometry is drawn for LTR and mirrored as a whole) */
      if (homa) {
        g += `<rect x="3" y="3" width="352" height="52" rx="1.5" fill="${C.ply}"/>`;
        g += `<path d="M3 5.6H355M3 52.4H355" stroke="#8e6b44" stroke-width=".6" opacity=".7"/>`;
        g += `<polygon points="${pts(ragged(8, 8, 350, 50, 5, 2.2, 9))}" fill="${C.paint}"/>`;
      } else {
        g += `<polygon points="18,54 25,54 21,63 14,63" fill="url(#${u}-w)"/><polygon points="333,54 340,54 344,63 337,63" fill="url(#${u}-w)"/>`;
        g += `<rect x="2" y="2" width="354" height="53" rx="1.5" fill="url(#${u}-w)"/>`;
        g += `<path d="M2 2.6H356" stroke="#D9AA78" stroke-width="1" class="c06-rim"/>`;
        g += `<g stroke="#5a381d" stroke-width=".7" opacity=".7"><path d="M2 2L8 7.5M356 2L350 7.5M2 55L8 49.5M356 55L350 49.5"/></g>`;
        g += `<rect x="8" y="7.5" width="342" height="42" fill="${glass ? `url(#${u}-gl)` : C.slate}"/>`;
        g += `<rect x="8" y="7.5" width="342" height="3" fill="#000" opacity=".28"/>`;
        if (glass) g += `<polygon points="150,7.5 196,7.5 166,49.5 120,49.5" fill="#fff" opacity=".05"/><rect x="11" y="10.5" width="336" height="36" fill="none" stroke="#D4AF37" stroke-opacity=".7" stroke-width=".8"/>`;
        if (tier === "CHAMPION" || glass) g += `<g fill="#C79C42"><rect x="0.6" y="0.6" width="9" height="5"/><rect x="348.4" y="0.6" width="9" height="5"/><rect x="0.6" y="51.6" width="9" height="5"/><rect x="348.4" y="51.6" width="9" height="5"/></g>`;
      }
      if (founder) d += `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="64"><rect width="${W}" height="64" fill="#fff"/><polygon points="${homa ? "21,57 27,48.6 33,57" : "23,57 29,48.6 35,57"}" fill="#000"/></mask>`;
      /* rank */
      const rk = String(o.rank != null ? o.rank : "");
      t += `<text x="${X(26)}" y="35" text-anchor="middle" class="c06-mr" font-weight="800" font-size="17" fill="${ink}" direction="ltr" ${F}>${rk}</text>`;
      if (o.me) t += `<path d="M${X(26) - 12} 22 C${X(26) - 17} 32 ${X(26) - 6} 42 ${X(26) + 3} 41 S${X(26) + 16} 30 ${X(26) + 10} 22 S${X(26) - 6} 16 ${X(26) - 13} 25" fill="none" stroke="${C.sky}" stroke-width="1.6" stroke-linecap="round" ${F}/>`;
      /* the 84 in its box */
      const b1 = X(ar ? 94 : 44);
      const bw = 50;
      if (med === "enamel") {
        t += `<rect x="${b1}" y="12" width="${bw}" height="33" rx="3" fill="${C.blue}"/>`;
        t += `<text x="${b1 + bw / 2 + 1.4}" y="${39 + 1.4}" text-anchor="middle" class="c06-lz" font-size="27" fill="#002a8f" direction="ltr">${p.ovr}</text>`;
        t += `<text x="${b1 + bw / 2}" y="39" text-anchor="middle" class="c06-lz" font-size="27" fill="${C.enamel}" direction="ltr">${p.ovr}</text>`;
      } else {
        t += `<path d="${hbox(b1, 12, b1 + bw, 45, 5, homa ? 1 : 0.5)}" fill="none" stroke="${accent}" stroke-width="${glass ? 1.3 : 1.5}" ${F}/>`;
        if (med === "marker") t += `<rect x="${b1 + 3}" y="15" width="${bw - 6}" height="27" rx="2.5" fill="none" stroke="${C.chalk}" stroke-width=".8"/>`;
        t += `<text x="${b1 + bw / 2}" y="39" text-anchor="middle" class="c06-lz" font-size="27" fill="${med === "marker" ? C.sky : ink}" direction="ltr" ${F}>${p.ovr}</text>`;
      }
      /* name + tier */
      const pts0 = String(o.pts != null ? o.pts : "");
      const pw = tw(pts0, 800, 17, "Manrope");
      const nx = X(108);
      const avail = W - 108 - 24 - pw - 14;
      const name = MC.nameOf(p, o);
      const nw0 = tw(name, 400, 23, "Lalezar");
      const nfs = r2(Math.max(14, Math.min(23, (23 * avail) / nw0)));
      t += `<text x="${nx}" y="${ar ? 31 : 32}" text-anchor="${AS}" class="c06-lz" font-size="${nfs}" fill="${ink}" ${F}>${MC.esc(name)}</text>`;
      const tierWord = S.tiers[tier];
      t += `<text x="${nx}" y="${ar ? 46.5 : 45.5}" text-anchor="${AS}" class="c06-ch" font-weight="${ar ? 700 : 800}" font-size="${ar ? 10 : 8.6}" letter-spacing="${ar ? 0 : 1.3}" fill="${accent}" opacity="${glass ? 1 : 0.82}">${MC.esc(tierWord)}</text>`;
      /* points */
      t += `<text x="${X(338)}" y="31" text-anchor="${AE}" class="c06-mr c06-tab" font-weight="800" font-size="17" fill="${ink}" direction="ltr" ${F}>${pts0}</text>`;
      t += `<text x="${X(338)}" y="${ar ? 45.5 : 44.5}" text-anchor="${AE}" class="${ar ? "c06-ch" : "c06-mr"}" font-weight="700" font-size="${ar ? 9.5 : 8}" letter-spacing="${ar ? 0 : 1}" fill="${ink}" opacity=".7">${MC.esc(ar ? S.pts : "PTS")}</text>`;
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
      const r = rng(9);
      let joints = "";
      for (let i = 0; i < 9; i++) {
        const y = 476 + i * i * 2.2 + i * 4;
        joints += `<path d="M0 ${r2(y)}H360" />`;
      }
      for (let i = -8; i <= 14; i++) {
        const x0 = 200 + i * 9;
        const x1 = 200 + i * 52;
        joints += `<path d="M${x0} 470 L${x1} 640" />`;
      }
      const scene =
        `<svg class="c06-sh-bg" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>` +
        `<linearGradient id="${u}-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06122a"/><stop offset="1" stop-color="#0b1f40"/></linearGradient>` +
        `<linearGradient id="${u}-pave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10264a"/><stop offset="1" stop-color="#071530"/></linearGradient>` +
        `<linearGradient id="${u}-door" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE9C2"/><stop offset="1" stop-color="#F0B868"/></linearGradient>` +
        `<radialGradient id="${u}-spill" cx="0" cy=".66" r=".85"><stop offset="0" stop-color="#FFE2B0" stop-opacity=".34"/><stop offset=".55" stop-color="#FFE2B0" stop-opacity=".08"/><stop offset="1" stop-color="#FFE2B0" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="${u}-cone" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" stop-color="#FFE2B0" stop-opacity=".3"/><stop offset=".7" stop-color="#FFE2B0" stop-opacity=".04"/><stop offset="1" stop-color="#FFE2B0" stop-opacity="0"/></linearGradient>` +
        `<filter id="${u}-grit" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 -.4"/></filter>` +
        `<filter id="${u}-sb" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>` +
        `</defs><g ${M}>` +
        `<rect width="360" height="470" fill="url(#${u}-wall)"/>` +
        `<rect width="360" height="470" fill="#fff" filter="url(#${u}-grit)" opacity=".06"/>` +
        /* the café door at the inline-start edge */
        `<rect x="-6" y="96" width="34" height="374" fill="url(#${u}-door)"/>` +
        `<rect x="28" y="90" width="7" height="380" fill="#1a1410"/><rect x="-6" y="88" width="41" height="8" fill="#1a1410"/>` +
        `<rect width="360" height="470" fill="url(#${u}-spill)"/>` +
        /* pavement */
        `<rect y="470" width="360" height="170" fill="url(#${u}-pave)"/>` +
        `<rect y="470" width="360" height="3" fill="#000" opacity=".35"/>` +
        `<g stroke="#2a4470" stroke-width=".7" opacity=".55">${joints}</g>` +
        `<rect y="470" width="360" height="170" fill="#fff" filter="url(#${u}-grit)" opacity=".05"/>` +
        `<polygon points="0,470 35,470 360,600 360,640 0,640" fill="url(#${u}-cone)"/>` +
        /* the board's shadow, thrown away from the door */
        `<polygon points="80,492 300,492 360,540 360,566 150,566" fill="#000" opacity=".5" filter="url(#${u}-sb)"/>` +
        `</g></svg>`;
      const id = MC.esc(p.id);
      return (
        `<div class="c06-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(MC.label(p, o))}">` +
        scene +
        `<div class="c06-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
        `<div class="c06-sh-board">${c.full(p, { ...o, thumb: false })}</div>` +
        `<div class="c06-sh-warm" aria-hidden="true"></div>` +
        `<div class="c06-sh-cap"><p class="c06-sh-line">${MC.esc(ar ? CAPTION.ar : CAPTION.lat)}</p>` +
        `<p class="c06-sh-id"><b>${MC.esc(MC.nameOf(p, o))}</b><span>${MC.ltr(p.id)}</span><span>${MC.ltr(p.season)}</span></p></div>` +
        `</div>`
      );
    },

    /* Walk around it: a tap turns the board on its legs to the other language's face. */
    mount(el, o = {}) {
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
          tmp.innerHTML = c.full(MC.withTier(tier), { lang: other, back: tier === "LEGEND" });
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
