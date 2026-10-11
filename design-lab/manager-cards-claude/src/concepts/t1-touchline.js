/* T1 TOUCHLINE (Codex's shape, reworked by Claude).
   You stand at the touchline. The card is a leaf of your club's colour with the BotolaGO-blue
   run-off down its start edge and the white touchline painted along it. Your badge (the 84 and
   your tier) is a disc seated on that line, half of it standing proud of the card's edge. The
   person leaf (the shared hooded figure) is the part that is yours for good; the badge is the part
   that changes, and each tier changes its hardware and, from PRO up, the card's outline:
   painted disc, rimmed and riveted disc, a mast, a mast with a pennant, a full corner flag.
   The rework answers the critique: no stack of stats in a panel of its own, the exact logo blue
   #0151FC, the 84 and the tier inside the badge, a fit ladder for long names, a mirrored Arabic
   face, and the founder year after the name (ALI ·26). */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const r2 = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

  /* ------------------------------------------------------------ colour helpers */
  const rgb = (h) => {
    const s = String(h).replace("#", "");
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  };
  const hx = (a) =>
    "#" +
    a
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const mix = (a, b, t) => {
    const A = rgb(a);
    const B = rgb(b);
    return hx(A.map((v, i) => v + (B[i] - v) * t));
  };
  const lin = (v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (h) => {
    const [r, g, b] = rgb(h).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const A = lum(a);
    const B = lum(b);
    return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
  };
  /** fg pulled toward bg by t, backed off until it still reads at `min`:1 on bg. */
  const tone = (fg, bg, t, min = 4.5) => {
    let k = t;
    while (k > 0 && contrast(mix(fg, bg, k), bg) < min) k -= 0.04;
    return mix(fg, bg, Math.max(0, k));
  };

  const BLUE = "#0151FC"; // the logo blue, exactly
  const PAINT = "#f7f6ef"; // line paint
  const CHALK = "#ebe7da"; // the object's own material when no club is chosen
  const DISC = "#fbfaf5"; // a printed disc, a step lighter than the chalk board
  const INK = "#0b1630";
  const STEEL = ["#f1f4f9", "#7d8ba0"];
  const STEEL_B = ["#ffffff", "#9fadc1"];

  /* ------------------------------------------------------------ text measuring */
  const F_CH = "800 100px Changa";
  const F_CH7 = "700 100px Changa";
  const F_MR = "700 100px Manrope";
  const F_AR = '700 100px "Noto Sans Arabic"';
  try {
    if (document.fonts && document.fonts.load) {
      [F_CH, F_CH7, F_MR].forEach((f) => document.fonts.load(f, "AZ09·#/—"));
      [F_CH, F_AR].forEach((f) => document.fonts.load(f, "علي محترف عضو مؤسس"));
    }
  } catch (e) {
    /* measurement falls back to estimates */
  }
  let cx2d = null;
  function meas(font, text) {
    try {
      if (document.fonts && document.fonts.check(font, text)) {
        cx2d = cx2d || document.createElement("canvas").getContext("2d");
        cx2d.font = font;
        const m = cx2d.measureText(text);
        return { w: m.width, a: m.actualBoundingBoxAscent };
      }
    } catch (e) {
      /* fall through */
    }
    return null;
  }
  /** Advance width of text at font size fs (font string uses 100px). */
  function wAt(font100, text, fs, estEm) {
    const m = meas(font100, text);
    return ((m ? m.w : String(text).length * estEm * 100) * fs) / 100;
  }

  /* ------------------------------------------------------------ geometry */
  const W = 300;
  const H = 440;
  // headroom for the mast and the run-off for the badge's overhang, kept on every tier so the five
  // stand on the same line and the Arabic mirror needs no second box
  const VB = "-24 -52 348 500";
  const LEAF_R = [10, 54, 10, 54]; // top-start, top-end, bottom-end, bottom-start
  const STRIP = 26; // the blue run-off, x 0..26
  const LINE = { x: 26, w: 6, c: 29 }; // the white touchline, x 26..32
  const BD = { cx: 29, cy: 96, r: 50 }; // the badge, seated on the line
  const PL = { x: 42, y: 58, w: 244, h: 184, r: [8, 44, 8, 44] }; // the person leaf
  const CX0 = 44; // content start
  const CX1 = 286; // content end
  const NAME = { base1: 298, base2a: 277, base2b: 305 };
  const TICK = { y0: 174, dy: 17, len: 20, h: 7 };

  /** Rounded rectangle path with one radius per corner (tl, tr, br, bl). */
  function rr(x, y, w, h, [a, b, c, d]) {
    return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
  }
  const LEAF_D = rr(0, 0, W, H, LEAF_R);
  const PLATE_D = rr(PL.x, PL.y, PL.w, PL.h, PL.r);

  /* ------------------------------------------------------------ tiers: hardware, not only colour */
  // pole: the touchline carries on above the card as a mast (PRO), with a pennant (CHAMPION) or a
  // full corner flag (LEGEND). rim/teeth/rivets: how the badge is made and pinned to the line.
  const TIER = {
    BASE: { pole: 0, flag: 0, face: DISC, digit: BLUE, rimW: 0, teeth: false, rivets: 0, ring: 0 },
    HOMA: { pole: 0, flag: 0, face: DISC, digit: BLUE, rimW: 0, teeth: false, rivets: 0, ring: 0 },
    STADE: {
      pole: 0,
      flag: 0,
      face: "#ffffff",
      digit: BLUE,
      rimW: 5,
      teeth: false,
      rivets: 2,
      ring: 0,
      steel: STEEL,
    },
    PRO: {
      pole: 14,
      flag: 0,
      face: BLUE,
      digit: "#ffffff",
      rimW: 5,
      teeth: false,
      rivets: 2,
      ring: 1,
      steel: STEEL,
    },
    CHAMPION: {
      pole: 28,
      flag: 1,
      face: "#ffffff",
      digit: BLUE,
      rimW: 8,
      teeth: true,
      rivets: 4,
      ring: 0,
      steel: STEEL_B,
    },
    LEGEND: {
      pole: 44,
      flag: 2,
      face: BLUE,
      digit: "#ffffff",
      rimW: 8,
      teeth: true,
      rivets: 4,
      ring: 2,
      steel: STEEL_B,
    },
  };
  const tierKey = (p) => (MC.TIERS.includes(p.tier) ? p.tier : null);

  /* ------------------------------------------------------------ theme: the club colour slot */
  function theme(p) {
    const c = p.club || null;
    const leaf = c ? c.primary : CHALK;
    const ink = contrast("#ffffff", leaf) >= contrast(INK, leaf) ? "#ffffff" : INK;
    const soft = tone(ink, leaf, 0.3);
    const plate = c ? c.secondary : mix(BLUE, "#ffffff", 0.86);
    const figDark = c
      ? contrast(c.primary, c.secondary) >= 3
        ? c.primary
        : INK
      : mix(BLUE, "#000000", 0.55);
    return {
      own: !c,
      leaf,
      leafHi: mix(leaf, "#ffffff", c ? 0.08 : 0.35),
      leafLo: mix(leaf, "#000000", c ? 0.14 : 0.07),
      ink,
      soft,
      plate,
      fig: figDark,
      figSeam: mix(figDark, plate, 0.4),
      edge: tone(figDark, plate, 0.45, 3),
      pennant: c ? c.secondary : BLUE,
      sec: c ? c.secondary : BLUE,
      crestFill: c ? c.primary : BLUE,
    };
  }

  /* ------------------------------------------------------------ the name: a fit ladder */
  const brk = (s) => {
    // split points after a space or a hyphen
    const out = [];
    for (let i = 1; i < s.length - 1; i++) if (s[i] === " " || s[i] === "-") out.push(i + 1);
    return out;
  };
  /**
   * 1) one line at 40..32; 2) two lines at the best break, 32..24; 3) one line squeezed to 84%;
   * 4) two lines squeezed to 80% at 26; 5) one line ellipsised. Never an initial.
   * yearW(size) is the room the founder year takes after the last line.
   */
  function fitName(text, ar, maxW, yearW) {
    const em = ar ? 0.5 : 0.62;
    const w = (t, s) => wAt(F_CH, t, s, em);
    const t = text.trim();
    for (let s = 40; s >= 32; s--)
      if (w(t, s) + yearW(s) <= maxW) return { lines: [{ t, sx: 1 }], size: s };
    const cuts = brk(t);
    let best = null;
    for (const c of cuts) {
      const a = t.slice(0, c).trim();
      const b = t.slice(c).trim();
      const m = (s) => Math.max(w(a, s), w(b, s) + yearW(s));
      if (!best || m(30) < best.m(30)) best = { a, b, m };
    }
    if (best) {
      for (let s = 32; s >= 24; s--)
        if (best.m(s) <= maxW)
          return {
            lines: [
              { t: best.a, sx: 1 },
              { t: best.b, sx: 1 },
            ],
            size: s,
          };
    }
    for (let s = 32; s >= 26; s--) {
      const sx = maxW / (w(t, s) + yearW(s));
      if (sx >= 0.84) return { lines: [{ t, sx: Math.min(1, sx) }], size: s };
    }
    if (best) {
      const s = 26;
      const sx = maxW / best.m(s);
      if (sx >= 0.8)
        return {
          lines: [
            { t: best.a, sx },
            { t: best.b, sx },
          ],
          size: s,
        };
    }
    let u = t;
    while (u.length > 2 && w(u + "…", 26) * 0.84 + yearW(26) > maxW) u = u.slice(0, -1);
    return { lines: [{ t: u.trim() + "…", sx: 0.84 }], size: 26 };
  }

  /* ------------------------------------------------------------ marks: k of N along the touchline */
  const markN = (p) => (p.minRated ? Math.max(1, Math.min(6, Math.round(p.minRated))) : 0);
  const markK = (p, N) => Math.max(0, Math.min(N, Math.round(p.counted || 0)));

  /* ------------------------------------------------------------ the badge (shared by card and token) */
  /**
   * The disc seated on the line, in left-to-right coordinates (the caller mirrors it). Returns
   * { defs, shape } for the hardware and the geometry the text needs.
   */
  function badgeShape(g, T, id, flat) {
    const { cx, cy, r } = g;
    const u = r / 50;
    const rf = r - T.rimW * u;
    let defs = "";
    let s = "";
    const st = T.steel;
    if (T.rimW && st) {
      defs += flat
        ? ""
        : `<linearGradient id="${id}-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${st[0]}"/><stop offset="1" stop-color="${st[1]}"/></linearGradient>`;
      const fill = flat ? mix(st[0], st[1], 0.4) : `url(#${id}-st)`;
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
      if (T.teeth) {
        // a knurled collar: a ring of short cuts
        const n = 48;
        const rm = r - (T.rimW * u) / 2;
        const seg = (2 * Math.PI * rm) / n;
        s += `<circle cx="${cx}" cy="${cy}" r="${r2(rm)}" fill="none" stroke="${mix(st[1], "#000000", 0.35)}" stroke-opacity=".55" stroke-width="${r2(T.rimW * u * 0.78)}" stroke-dasharray="${r2(seg * 0.42)} ${r2(seg * 0.58)}"/>`;
      }
      s += `<circle cx="${cx}" cy="${cy}" r="${r2(rf)}" fill="${mix(st[1], "#000000", 0.25)}"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${r2(rf - 0.9 * u)}" fill="${T.face}"/>`;
    } else {
      // painted: a printed disc with one ring inside it
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${T.face}"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${r2(r - 5.5 * u)}" fill="none" stroke="${BLUE}" stroke-width="${r2(1.5 * u)}"/>`;
    }
    const rf2 = rf - 0.9 * u;
    if (T.ring === 1)
      s += `<circle cx="${cx}" cy="${cy}" r="${r2(rf2 - 3.4 * u)}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="${r2(1.1 * u)}"/>`;
    if (T.ring === 2) {
      s += `<circle cx="${cx}" cy="${cy}" r="${r2(rf2 - 3 * u)}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="${r2(1.4 * u)}"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${r2(rf2 - 6.6 * u)}" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="${r2(0.9 * u)}"/>`;
    }
    // rivets pin the disc to the line (top and bottom) and, from CHAMPION, to its sides
    const pts = [];
    if (T.rivets >= 2) pts.push([cx, cy - r + (T.rimW * u) / 2], [cx, cy + r - (T.rimW * u) / 2]);
    if (T.rivets >= 4) pts.push([cx - r + (T.rimW * u) / 2, cy], [cx + r - (T.rimW * u) / 2, cy]);
    const rv = r2(Math.min(T.rimW * u * 0.4, 3.1 * u));
    pts.forEach(([x, y]) => {
      s += `<circle class="tl-rv" cx="${r2(x)}" cy="${r2(y)}" r="${rv}" fill="${mix(st[0], st[1], 0.55)}" stroke="${mix(st[1], "#000000", 0.45)}" stroke-width="${r2(0.6 * u)}"/>`;
    });
    return { defs, shape: s, rf: rf2 };
  }

  /** The mast and its pennant above the card (left-to-right coordinates). */
  function mast(T, th, id, flat) {
    if (!T.pole) return "";
    const x0 = LINE.x;
    const x1 = LINE.x + LINE.w;
    const top = -T.pole;
    let s = `<rect x="${x0}" y="${top}" width="${LINE.w}" height="${T.pole + 2}" fill="${PAINT}"/>`;
    s += `<rect x="${x0}" y="${top}" width="2" height="${T.pole + 2}" fill="#000" opacity=".1"/>`;
    if (T.flag === 1)
      s += `<path d="M${x1} ${top + 2}L${x1 + 36} ${top + 10}L${x1} ${top + 19}Z" fill="${th.pennant}" stroke="#000" stroke-opacity=".3" stroke-width="1"/>`;
    if (T.flag === 2) {
      s += `<path d="M${x1} ${top + 2}L${x1 + 58} ${top + 8}L${x1 + 43} ${top + 17}L${x1 + 58} ${top + 26}L${x1} ${top + 31}Z" fill="${th.pennant}" stroke="#000" stroke-opacity=".3" stroke-width="1"/>`;
      s += `<path d="M${x1} ${top + 2}L${x1 + 13} ${top + 3.4}V${top + 29.6}L${x1} ${top + 31}Z" fill="${BLUE}"/>`;
    }
    const fin = T.flag ? STEEL_B : STEEL;
    s += `<circle cx="${LINE.c}" cy="${top - 1}" r="${T.flag ? 4.6 : 4.2}" fill="${flat ? mix(fin[0], fin[1], 0.4) : `url(#${id}-fn)`}" stroke="${mix(fin[1], "#000000", 0.4)}" stroke-width=".8"/>`;
    return s;
  }

  /* ------------------------------------------------------------ full card */
  function art(p, o, id, beat) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const thumb = !!o.thumb;
    const th = theme(p);
    const tk = tierKey(p);
    const T = TIER[tk || "BASE"];
    const X = (x) => (ar ? W - x : x);
    const M = (s) => (ar ? `<g transform="translate(${W} 0) scale(-1 1)">${s}</g>` : s);
    const N = markN(p);
    const K = markK(p, N);
    const hasNum = p.ovr != null;
    let defs =
      `<linearGradient id="${id}-lf" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${th.leafHi}"/><stop offset="1" stop-color="${th.leafLo}"/></linearGradient>` +
      `<clipPath id="${id}-cl"><path d="${LEAF_D}"/></clipPath>` +
      `<clipPath id="${id}-pl"><path d="${PLATE_D}"/></clipPath>` +
      `<linearGradient id="${id}-fn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${STEEL_B[0]}"/><stop offset="1" stop-color="${STEEL_B[1]}"/></linearGradient>` +
      `<filter id="${id}-bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>`;

    /* ---- back layers: mast, leaf, run-off, line, marks, person leaf, footer bar ---- */
    let back = mast(T, th, id, false);
    back += `<path d="${LEAF_D}" fill="url(#${id}-lf)"/>`;
    let clip = `<rect x="0" y="0" width="${STRIP}" height="${H}" fill="${BLUE}"/>`;
    clip += `<rect x="${LINE.x}" y="-2" width="2" height="${H + 4}" fill="#000" opacity=".08"/>`;
    clip += `<path class="tl-line" d="M${LINE.c} -2V${H + 2}" pathLength="1" fill="none" stroke="${PAINT}" stroke-width="${LINE.w}"/>`;
    // k of N marks: ticks off the line, painted when counted and an empty outline when not
    for (let i = 0; i < N; i++) {
      const y = TICK.y0 + i * TICK.dy;
      const x0 = LINE.x - TICK.len;
      const filled = i < K;
      const isNew = beat === "tick" && K > 0 && i === K - 1;
      if (!filled || isNew)
        clip += `<rect x="${x0 + 0.8}" y="${y - TICK.h / 2 + 0.8}" width="${TICK.len - 0.8}" height="${TICK.h - 1.6}" rx="1.2" fill="none" stroke="${PAINT}" stroke-width="1.8"/>`;
      if (filled)
        clip += `<path class="tl-tick${isNew ? " tl-tick-new" : ""}" d="M${LINE.x} ${y}H${x0}" pathLength="1" stroke="${PAINT}" stroke-width="${TICK.h}" fill="none"/>`;
    }
    // the person leaf: a plate in the club's second colour with the shared figure standing on it
    const AV = { x: 118, y: 44, w: 172, h: 198 };
    const avatar = (outline) =>
      MC.avatar(
        outline
          ? {
              x: AV.x,
              y: AV.y,
              w: AV.w,
              h: AV.h,
              torso: "none",
              hoodFill: "none",
              seam: th.edge,
              stroke: th.edge,
              strokeWidth: 3,
            }
          : { x: AV.x, y: AV.y, w: AV.w, h: AV.h, torso: th.fig, seam: th.figSeam, collar: th.fig },
      );
    let person = "";
    if (beat === "make")
      person += `<g class="tl-outline"><path d="${PLATE_D}" fill="none" stroke="${th.edge}" stroke-width="1.6" stroke-dasharray="3 3"/><g clip-path="url(#${id}-pl)">${avatar(true)}</g></g>`;
    person += `<g class="tl-fill"><g clip-path="url(#${id}-pl)"><path d="${PLATE_D}" fill="${th.plate}"/>${avatar(false)}</g></g>`;
    clip += `<g class="tl-person">${person}</g>`;
    // the goal-line bar that carries the ID and the season
    clip += `<rect x="${CX0 - 4}" y="388" width="${CX1 - CX0 + 8}" height="30" rx="4" fill="${PAINT}" stroke="${BLUE}" stroke-opacity="${th.own || lum(th.leaf) > 0.5 ? 0.35 : 0}" stroke-width="1"/>`;
    back += `<g clip-path="url(#${id}-cl)">${clip}</g>`;
    back += `<path class="tl-rim" d="${LEAF_D}" fill="none" stroke-width="1.4"/>`;

    /* ---- the badge on the line ---- */
    const b = badgeShape(BD, T, id, false);
    defs += b.defs;
    const word = tk ? S.tiers[tk] : "";
    const digits = hasNum ? String(Math.round(p.ovr)) : null;
    const dSize = digits && digits.length > 2 ? BD.r * 0.86 : BD.r * 1.14;
    const capH = (meas(F_CH, "84") ? meas(F_CH, "84").a / 100 : 0.7) * dSize;
    const dMid = BD.cy + (word ? -10 : 0);
    const dBase = dMid + capH / 2;
    let btxt = "";
    const bx = X(BD.cx);
    if (digits)
      btxt += `<text class="tl-num" x="${bx}" y="${r2(dBase)}" text-anchor="middle" font-size="${r2(dSize)}" fill="${T.digit}" direction="ltr">${esc(digits)}</text>`;
    else
      btxt += `<rect class="tl-dash" x="${r2(bx - BD.r * 0.38)}" y="${r2(dMid - BD.r * 0.1)}" width="${r2(BD.r * 0.76)}" height="${r2(BD.r * 0.2)}" rx="${r2(BD.r * 0.1)}" fill="${T.digit}"/>`;
    if (word) {
      const wy = BD.cy + BD.r * (ar ? 0.66 : 0.72);
      const half = Math.sqrt(Math.max(0, b.rf * b.rf - (wy - BD.cy) ** 2));
      const em = ar ? 0.5 : 0.62;
      let ws = ar ? 14 : 13;
      const spacing = ar ? 0 : 0.08;
      const ww = (s) => wAt(ar ? F_AR : F_CH, word, s, em) + spacing * s * word.length;
      while (ws > 8 && ww(ws) > half * 2 - 6) ws -= 0.5;
      btxt += `<path d="M${r2(bx - 17)} ${r2(BD.cy + BD.r * 0.44)}H${r2(bx + 17)}" stroke="${T.digit}" stroke-opacity=".55" stroke-width="1.2" fill="none"/>`;
      btxt += `<text class="tl-word${ar ? " is-ar" : ""}" x="${bx}" y="${r2(wy)}" text-anchor="middle" font-size="${r2(ws)}" fill="${T.digit}" direction="ltr">${esc(word)}</text>`;
    }
    const shadow = `<circle cx="${BD.cx + 2}" cy="${BD.cy + 5}" r="${BD.r}" fill="#000" opacity=".38" filter="url(#${id}-bl)"/>`;
    const badge =
      `<g class="tl-badge">` +
      `<g class="tl-seat">${M(shadow)}</g>` +
      `<g class="tl-ripple-g">${M(`<circle class="tl-ripple" cx="${BD.cx}" cy="${BD.cy}" r="${BD.r + 2}" fill="none" stroke="${PAINT}" stroke-width="2.4" opacity="0"/>`)}</g>` +
      `<g class="tl-hw">${M(b.shape)}</g>` +
      `${btxt}</g>`;

    /* ---- text layer ---- */
    let txt = "";
    // logo (light on a dark leaf, colour on a light one) and the club crest
    const lw = 124;
    const lh = lw / MC.LOGO_RATIO.wordmark;
    const logoX = ar ? W - (p.club ? 104 : 112) - lw : p.club ? 104 : 112;
    txt += `<g transform="translate(${r2(logoX)} 20)">${MC.logo("wordmark", { w: lw, h: r2(lh), variant: lum(th.leaf) > 0.4 ? "color" : "light", label: false })}</g>`;
    if (p.club) {
      const cw = 22;
      const cxp = ar ? W - 252 - cw : 252;
      txt += `<g transform="translate(${cxp} 14)">${MC.crest({ w: cw, h: r2((cw * 48) / 40), fill: th.crestFill, sash: th.sec, ring: th.sec })}</g>`;
    }
    // the name, through the fit ladder, with the founder year after it
    const founder = !!p.founder;
    const yr = founder ? String(p.founder).slice(2) : "";
    const nameTxt = MC.nameOf(p, o);
    const maxW = CX1 - CX0;
    if (nameTxt) {
      const yearW = (s) => (founder ? wAt(F_CH7, "·" + yr, s * 0.46, 0.55) + s * 0.1 : 0);
      const fit = fitName(nameTxt, ar, maxW, yearW);
      const two = fit.lines.length === 2;
      const bases = two ? [NAME.base2a, NAME.base2b] : [NAME.base1];
      fit.lines.forEach((ln, i) => {
        const nx = ar ? X(CX0) : CX0;
        const anchor = ar ? "end" : "start";
        const tf =
          ln.sx < 1 ? ` transform="translate(${nx} ${bases[i]}) scale(${r2(ln.sx, 3)} 1)"` : "";
        const pos = ln.sx < 1 ? `x="0" y="0"` : `x="${nx}" y="${bases[i]}"`;
        txt += `<text class="tl-name${ar ? " is-ar" : ""}" ${pos}${tf} text-anchor="${anchor}" font-size="${fit.size}" fill="${th.ink}" direction="ltr">${esc(ln.t)}</text>`;
        if (founder && i === fit.lines.length - 1) {
          const w = wAt(F_CH, ln.t, fit.size, ar ? 0.5 : 0.62) * ln.sx + fit.size * 0.1;
          const yx = ar ? X(CX0) - w : CX0 + w;
          txt += `<text class="tl-year" x="${r2(yx)}" y="${bases[i]}" text-anchor="${ar ? "end" : "start"}" font-size="${r2(fit.size * 0.46)}" fill="${th.soft}" direction="ltr">${ar ? yr + "·" : "·" + yr}</text>`;
        }
      });
    } else {
      // an unnamed card: the name carrier drawn empty, a painted dotted baseline
      txt += `<path d="M${X(CX0)} ${NAME.base1 - 4}H${X(CX0 + 150)}" stroke="${th.soft}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0.1 8.6" fill="none"/>`;
    }
    // the four stats on one baseline (no panel), a dash for any that is empty
    if (!thumb) {
      const colW = (CX1 - CX0) / 4;
      txt += `<path d="M${X(CX0)} 320H${X(CX1)}" stroke="${th.ink}" stroke-opacity=".28" stroke-width="1.2" fill="none"/>`;
      MC.STATS.forEach((k, i) => {
        const cxs = X(CX0 + colW * (i + 0.5));
        const v = p.stats && p.stats[k] != null ? String(p.stats[k]) : null;
        txt += v
          ? `<text class="tl-sv" x="${r2(cxs)}" y="352" text-anchor="middle" font-size="25" fill="${th.ink}" direction="ltr">${esc(v)}</text>`
          : `<rect class="tl-dash" x="${r2(cxs - 7)}" y="342" width="14" height="4.4" rx="2.2" fill="${th.ink}"/>`;
        txt += `<text class="tl-sl${ar ? " is-ar" : ""}" x="${r2(cxs)}" y="368" text-anchor="middle" font-size="${ar ? 10.2 : 9.2}" fill="${th.soft}" direction="ltr">${esc(S.stats[k])}</text>`;
      });
      // the bar: ID at the start, flag and season at the end
      const idTxt = p.id || null;
      const by = 407;
      txt += idTxt
        ? `<text class="tl-id" x="${X(CX0 + 4)}" y="${by}" text-anchor="${ar ? "end" : "start"}" font-size="11" fill="${BLUE}" direction="ltr">${esc(idTxt)}</text>`
        : `<rect class="tl-dash" x="${ar ? X(CX0 + 4) - 14 : CX0 + 4}" y="${by - 6.6}" width="14" height="4.4" rx="2.2" fill="${BLUE}"/>`;
      const sw = wAt(F_MR, p.season, 11, 0.62);
      const endX = CX1 - 4;
      txt += `<text class="tl-id" x="${X(endX)}" y="${by}" text-anchor="${ar ? "start" : "end"}" font-size="11" fill="${BLUE}" direction="ltr">${esc(p.season)}</text>`;
      const fx = endX - sw - 8 - 15;
      txt += `<g transform="translate(${r2(ar ? X(fx) - 15 : fx)} ${by - 9.5})">${MC.flag({ w: 15, h: 10 })}</g>`;
    }
    // the founder part on the run-off: only when there is one
    if (founder && !thumb) {
      const fy = 316;
      const lbl = S.founder;
      txt += ar
        ? `<text class="tl-fl is-ar" transform="translate(${X(13) - 3.4} ${fy}) rotate(90)" text-anchor="middle" font-size="9.4" fill="#fff" direction="ltr">${esc(lbl)}</text>`
        : `<text class="tl-fl" transform="translate(${13 + 3.4} ${fy}) rotate(-90)" text-anchor="middle" font-size="8.6" fill="#fff" direction="ltr">${esc(lbl)}</text>`;
    }
    return { defs, body: M(back) + badge + txt };
  }

  function full(p, o = {}) {
    const S = MC.s(o);
    const id = MC.uid("tl");
    const beat = o.beat === "make" || o.beat === "first" || o.beat === "tick" ? o.beat : null;
    const A = art(p, o, id, beat);
    const tk = tierKey(p);
    return (
      `<div class="tl tl-full tl--${(tk || "base").toLowerCase()}${o.thumb ? " is-thumb" : ""}${p.club ? "" : " is-own"}" dir="${S.dir}"${MC.isAr(o) ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}"${tk ? ` data-tier="${tk}"` : ""}${o.motion ? ' data-motion="1"' : ""}${beat ? ` data-beat="${beat}"` : ""}>` +
      `<svg class="tl-art" viewBox="${VB}" direction="ltr" aria-hidden="true" focusable="false"><defs>${A.defs}</defs>${A.body}</svg>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ token (24–80px) */
  // The badge is the token: the disc seated on the line with the 84 (a dash before the first
  // rating), the leaf behind it carrying the club colour, the run-off and the line. Flat fills, no
  // filters. Under 33px the disc takes the whole height; above it the ticks for counted rounds
  // hang off the line under the disc and a goal-line bar closes the leaf.
  function tokenSvg(p, o, size, mini) {
    const ar = MC.isAr(o);
    const th = theme(p);
    const tk = tierKey(p);
    const T = TIER[tk || "BASE"];
    const id = MC.uid("tk");
    const LH = 100;
    const head = 18; // headroom for the mast
    const LW = mini ? 66 : 82;
    const sw = 8; // run-off
    const lw = 3.2; // line
    const lc = sw + lw / 2;
    const bd = mini ? { cx: lc, cy: 50, r: 42 } : { cx: lc, cy: 40, r: 34 };
    const pad = bd.r - lc + 1.5; // the badge's overhang
    const vw = LW + pad + 1.5;
    const vx = ar ? -1.5 : -pad;
    const M = (x) => (ar ? `<g transform="translate(${LW} 0) scale(-1 1)">${x}</g>` : x);
    const ld = rr(0, 0, LW, LH, [4, mini ? 30 : 28, 4, mini ? 30 : 28]);
    const poleH = r2(head * (T.pole / 44));
    let s = "";
    if (T.pole) {
      const top = -poleH;
      s += `<rect x="${sw}" y="${top}" width="${lw}" height="${poleH + 1}" fill="${PAINT}"/>`;
      if (T.flag) {
        const fl = T.flag === 2;
        s += `<path d="M${sw + lw} ${top + 0.4}L${sw + lw + (fl ? 22 : 13)} ${top + (fl ? 4 : 3.4)}L${sw + lw} ${top + (fl ? 10.5 : 7)}Z" fill="${th.pennant}" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>`;
      }
      s += `<circle cx="${lc}" cy="${top - 0.8}" r="2" fill="${mix(STEEL_B[0], STEEL_B[1], 0.3)}"/>`;
    }
    s += `<path d="${ld}" fill="${th.leaf}"/>`;
    let cl = `<rect width="${sw}" height="${LH}" fill="${BLUE}"/><rect x="${sw}" width="${lw}" height="${LH}" fill="${PAINT}"/>`;
    const N = markN(p);
    const K = markK(p, N);
    if (!mini) {
      // the goal-line bar closes the leaf; the ticks hang off the line beside it
      cl += `<rect x="${sw + lw + 4}" y="82" width="${LW - sw - lw - 12}" height="10" rx="2" fill="${PAINT}" stroke="${BLUE}" stroke-opacity="${th.own || lum(th.leaf) > 0.5 ? 0.35 : 0}" stroke-width=".8"/>`;
      const dy = N > 1 ? Math.min(7.5, 15 / (N - 1)) : 0;
      for (let i = 0; i < N; i++) {
        const y = 83 + i * dy;
        if (i < K)
          cl += `<rect x="0" y="${r2(y - 1.9)}" width="${sw + 0.4}" height="3.8" fill="${PAINT}"/>`;
        else
          cl += `<rect x="1" y="${r2(y - 1.4)}" width="${sw - 0.6}" height="2.8" fill="none" stroke="${PAINT}" stroke-opacity=".9" stroke-width="1"/>`;
      }
    }
    // the founder sign: the dot of ·26, a bright dot on the leaf's top-end corner
    if (p.founder)
      cl += `<circle cx="${LW - 15}" cy="${mini ? 15 : 14}" r="${mini ? 8 : 6.5}" fill="${PAINT}"/><circle cx="${LW - 15}" cy="${mini ? 15 : 14}" r="${mini ? 3.4 : 2.8}" fill="${BLUE}"/>`;
    s += `<clipPath id="${id}-c"><path d="${ld}"/></clipPath><g clip-path="url(#${id}-c)">${cl}</g>`;
    s += `<path class="tl-rim" d="${ld}" fill="none" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    // the badge
    const b = badgeShape(bd, T, id, true);
    const digits = p.ovr != null ? String(Math.round(p.ovr)) : null;
    const dSize = digits && digits.length > 2 ? bd.r * 0.95 : bd.r * 1.22;
    const hasWord = !mini && tk;
    const dMid = bd.cy + (hasWord ? -3 : 0);
    const bx = ar ? LW - bd.cx : bd.cx;
    let bt = "";
    if (digits)
      bt = `<text class="tl-num" x="${r2(bx)}" y="${r2(dMid + dSize * 0.35)}" text-anchor="middle" font-size="${r2(dSize)}" fill="${T.digit}" direction="ltr">${esc(digits)}</text>`;
    else
      bt = `<rect x="${r2(bx - bd.r * 0.38)}" y="${r2(dMid - bd.r * 0.1)}" width="${r2(bd.r * 0.76)}" height="${r2(bd.r * 0.2)}" rx="${r2(bd.r * 0.1)}" fill="${T.digit}"/>`;
    if (hasWord) {
      const word = MC.s(o).tiers[tk];
      bt += `<text class="tl-word${ar ? " is-ar" : ""}" x="${r2(bx)}" y="${r2(bd.cy + bd.r * 0.66)}" text-anchor="middle" font-size="${ar ? 8.6 : 7.4}" fill="${T.digit}" direction="ltr">${esc(word)}</text>`;
    }
    const rimC = `<circle class="tl-rim" cx="${bd.cx}" cy="${bd.cy}" r="${bd.r}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    const vh = head + LH + 2;
    const wpx = r2((size * vw) / vh);
    return (
      `<svg class="tl-tsvg" viewBox="${r2(vx)} ${-head} ${r2(vw)} ${vh}" width="${wpx}" height="${size}" direction="ltr" aria-hidden="true" focusable="false"><defs>${b.defs}</defs>` +
      M(s) +
      M(b.shape + rimC) +
      bt +
      `</svg>`
    );
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = o.mini || size <= 32;
    const S = MC.s(o);
    const t = MC.onbStr(o);
    const tk = tierKey(p);
    const num = p.ovr == null ? t.noRating : `${p.ovr} ${S.ovr}`;
    return (
      `<span class="tl tl-tok${mini ? " is-mini" : ""}${p.club ? "" : " is-own"}" role="img" aria-label="${esc(`${p.name ? MC.nameOf(p, o) : t.cardOf}, ${num}${tk ? ", " + S.tiers[tk] : ""}${p.founder ? ", " + S.founderLine : ""}`)}"${tk ? ` data-tier="${tk}"` : ""}>` +
      tokenSvg(p, o, size, mini) +
      `</span>`
    );
  }

  /* ------------------------------------------------------------ row */
  function row(p, o = {}) {
    const S = MC.s(o);
    const t = MC.onbStr(o);
    const ar = MC.isAr(o);
    const tk = tierKey(p);
    const yr = p.founder ? String(p.founder).slice(2) : "";
    const yy = yr ? (ar ? yr + "·" : "·" + yr) : "";
    const N = markN(p);
    const K = markK(p, N);
    const forming = p.ovr == null;
    const sub = forming
      ? `<span>${esc(t.forming)}${N ? " " + MC.ltr(`${K}/${N}`) : ""}</span>`
      : tk
        ? `<span>${esc(S.tiers[tk])}</span>`
        : "";
    const name = MC.nameOf(p, o);
    return (
      `<div class="tl tl-row${o.me ? " is-me" : ""}${p.club ? "" : " is-own"}" dir="${S.dir}"${ar ? ' lang="ar"' : ""}${tk ? ` data-tier="${tk}"` : ""}>` +
      `<span class="tl-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="tl-rt">${token(p, { ...o, size: 56, mini: false })}</span>` +
      `<span class="tl-rn"><b>${name ? `<span class="tl-rnm">${esc(name)}</span>` : `<span class="tl-rnm is-empty"></span>`}${yy ? `<i>${MC.ltr(yy)}</i>` : ""}</b><small>${sub}</small></span>` +
      `<span class="tl-rp"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ share: "Au bord du terrain" */
  // 360 x 640. The card is planted on the pitch's own touchline: the white line and the blue
  // run-off run the full height of the image and the card's line sits exactly on them, so the
  // leaf grows out of the pitch edge. The grass is mown in stripes under floodlight.
  function share(p, o = {}) {
    const S = MC.s(o);
    const t = MC.onbStr(o);
    const ar = MC.isAr(o);
    const id = MC.uid("tls");
    const LC = 58; // x of the line's centre, from the start edge
    const sc = 0.94;
    const lcPx = ar ? 360 - LC : LC;
    // the card's svg is 348 wide with its line at 53 (viewBox x -24 + 29); mirrored it is at 295
    const left = r2(ar ? lcPx - 295 * sc : lcPx - 53 * sc);
    const card = full(p, { ...o, thumb: false });
    const prov = p.provisional ? (ar ? "مبدئي" : "Provisoire") : "";
    const stripes = Array.from({ length: 9 }, (_, i) =>
      i % 2 ? `<rect x="0" y="${i * 80}" width="360" height="80" fill="#000" opacity=".16"/>` : "",
    ).join("");
    const bandX = ar ? lcPx + 3 : 0;
    const bandW = ar ? 360 - lcPx - 3 : lcPx - 3;
    const bg =
      `<svg class="tl-sh-bg" viewBox="0 0 360 640" width="360" height="640" direction="ltr" aria-hidden="true" focusable="false"><defs>` +
      `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14503a"/><stop offset="1" stop-color="#0c3326"/></linearGradient>` +
      `<radialGradient id="${id}-l" cx="${ar ? 0.7 : 0.3}" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>` +
      `</defs><rect width="360" height="640" fill="url(#${id}-g)"/>${stripes}<rect width="360" height="640" fill="url(#${id}-l)"/>` +
      `<rect x="${bandX}" width="${bandW}" height="640" fill="${BLUE}"/>` +
      `<rect x="${lcPx - 3}" width="6" height="640" fill="${PAINT}"/></svg>`;
    return (
      `<div class="tl tl-share${p.club ? "" : " is-own"}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}${prov ? ", " + prov : ""}">` +
      bg +
      `<div class="tl-sh-card" style="left:${left}px;top:${r2(98 - 52 * sc)}px;width:${r2(348 * sc)}px">${card}</div>` +
      `<div class="tl-sh-foot">` +
      (prov ? `<span class="tl-sh-prov">${esc(prov)}</span>` : "") +
      `<span class="tl-sh-tag"><b>@${esc(String(p.key || (p.name ? p.name.lat : "ali")).toLowerCase())}</b><em>${ar ? "مثال" : "Exemple"}</em></span>` +
      `</div>` +
      `<div class="tl-sh-cap">${esc(t.cardOf)}</div>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ registration */
  MC.register({
    id: "t1",
    n: 11,
    slug: "t1-touchline",
    source: "Codex, reworked by Claude",
    name: "Touchline",
    nameAr: "خطّ التماس",
    category: "safe",
    philosophy:
      "You stand at the touchline: a leaf in your club's colour, the white line painted down its edge in BotolaGO blue, and your badge, the 84 and your tier, seated on that line like a disc on a rail.",
    philosophyAr:
      "أنت واقف عند خط التماس: ورقة بلون ناديك، وعلى حافتها خطّ أبيض مرسوم فوق شريط أزرق بلون BotolaGO، وشارتك، رقم 84 ومستواك، مثبّتة على الخط كقرص على سكّة.",
    idea: [
      "Codex's best shape, and its one real idea: a permanent part (the person) and a part that changes (the number), kept apart. The rework keeps that split and removes what made it a FUT card: there is no column of stacked stats in a panel of its own. The change is a disc, the badge, seated on the touchline that runs down the card's edge.",
      "The card is a leaf in your club's colour with two corners cut away. Its start edge is the run-off in the exact logo blue #0151FC, with the white touchline painted beside it. The badge, with the 84 and the tier word inside it, is pinned to that line and stands half proud of the card's edge: the outline that tells it from every other card in a leaderboard.",
      "The person leaf is the shared hooded figure on a plate in the club's second colour, off centre, beside the badge. Name, four stats on one baseline and a goal-line bar carrying the ID, the flag and the season sit below it.",
      "The counted rounds are ticks off the line: painted when counted, an outline when not. Before the first rating the badge shows a painted dash where the 84 will sit.",
    ],
    belonging: [
      "The line is where the manager stands: the card carries the one place every fan has watched a coach shout from.",
      "Your club's colour is the leaf, so a leaderboard of Touchline cards is a leaderboard of clubs. A manager with no club gets chalk-white board with the brand blue.",
      "The mast and the flag are earned: nobody has one on day one, and a LEGEND's flag is visible across a whole list.",
    ],
    founderMark: [
      "ALI ·26: the year after the name, the way supporter groups carry theirs. Founders also carry the word FOUNDER (عضو مؤسس) printed up the run-off, and on the token a bright pill sits on the run-off at its foot, 3px wide at 24px.",
    ],
    small: [
      "44–80px: the leaf in the club colour, the run-off and line, the badge disc with the 84 and the tier's hardware, ticks while the number is still to come.",
      "24–32px: a squarer leaf, the run-off with its line, and the badge disc carrying the 84. LEGEND adds a full mast and pennant above the leaf, which changes the outline; the badge's white-on-blue or blue-on-white face and its rim carry the lower tiers.",
    ],
    rtl: [
      "The whole object mirrors: the run-off, the line and the badge sit on the right, the plate and the figure on the left, the logo on the left. The name is Changa 800 right-aligned, followed to its left by 26· . Stat labels are the kit's (القائد، التشكيلة، الانتقالات، الثبات), figures stay Western and left-to-right, and nothing carries letter-spacing.",
    ],
    tiers: {
      HOMA: "Printed on chalk: the disc is a flat print with one ring, the line is paint and nothing is added. Raw but new.",
      STADE: "A steel rim and two rivets pin the disc to the line.",
      PRO: "The disc turns the logo blue with a white inner keyline, and the line carries on above the card as a mast with a steel ball.",
      CHAMPION: "A knurled steel collar and four rivets, and a pennant on the mast.",
      LEGEND:
        "A double-ringed blue disc in a knurled collar, and the full corner flag: a tall mast with a swallow-tailed pennant in the club's second colour.",
    },
    legend: [
      "LEGEND is the touchline reaching the corner flag. The mast stands taller than the card's head, with a swallow-tailed pennant in the club's second colour, so even at 28px a LEGEND leaf has a flag that nobody else's has. The stats stay on the front.",
    ],
    advantages: [
      "A silhouette no other card has: a leaf with a round badge standing proud of its edge.",
      "The 84 is the biggest thing on the card and sits inside its badge with the tier, at every size.",
      "The club's colour is the object, so it shows on the 44px token without a disc.",
    ],
    risks: [
      "The badge's overhang makes the card wider than its slot at small sizes; tokens reserve the room.",
      "A club whose two colours are both dark needs the plate's figure to fall back to ink (done), but its leaf then has little contrast against the dark ground; a rim line carries it.",
      "The mast at PRO and CHAMPION is small at 28px: the face colour and the rim carry those tiers there.",
    ],
    gridWidth: 236,
    detailWidth: 380,
    full,
    token,
    row,
    share,
  });
})();
