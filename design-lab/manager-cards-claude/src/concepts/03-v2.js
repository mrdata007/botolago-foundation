/* 03 PORTE-CLÉS, second pass (v2, refined from c03).
   Your BotolaGO identity is the tag on your keyring: a dressing-room locker key tag, an
   elongated 1:2.3 capsule whose bottom edge is cut with the penalty-area "D". The squared
   split ring that only 2026 founders get stays the founder sign. The ring's charms are your
   football history: your club's disc, the enamel pin of the manager, and one ball per season
   played with the season engraved on its band.
   One object, five materials, each clearly better than the last: matte anodised aluminium,
   vitreous enamel on steel, smoked resin, machined steel, and stitched match-ball leather.
   The object never mirrors in Arabic; only its type does. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const r2 = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
  const DEG = Math.PI / 180;

  /* ------------------------------------------------------------ colour helpers */
  const rgb = (h) => {
    const s = String(h).replace("#", "");
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  };
  const hx = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
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
  const CREAM = "#f5eedf";
  const INK = "#141a22";
  /** Paint for an engraving on a ground: cream, unless its 70% labels would fall under 4.5:1. */
  const paintOn = (ground) => (contrast(mix(CREAM, ground, 0.3), ground) >= 4.5 ? CREAM : INK);

  /* ------------------------------------------------------------ text measuring */
  const F_MR = "700 100px Manrope";
  const F_MR6 = "600 100px Manrope";
  const F_MR8 = "800 100px Manrope";
  const F_AR = '700 100px "Noto Sans Arabic"';
  const F_AR6 = '600 100px "Noto Sans Arabic"';
  const F_CH = "800 100px Changa";
  const F_CH6 = "600 100px Changa";
  const F_CH7 = "700 100px Changa";
  try {
    if (document.fonts && document.fonts.load) {
      [F_MR, F_MR6, F_MR8, F_CH, F_CH6, F_CH7].forEach((f) => document.fonts.load(f, "AZ09·#/"));
      [F_CH, F_AR, F_AR6].forEach((f) => document.fonts.load(f, "علي محترف عضو مؤسس"));
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
        return { w: m.width, l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent };
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
  /** x that centres the ink of `text` on cx (Changa digits are proportional). */
  function inkX(text, fs, cx, font = F_CH) {
    const m = meas(font, String(text));
    return m ? r2(cx - (((m.r - m.l) / 2) * fs) / 100) : null;
  }
  const tierOf = (p) => (MC.TIERS.includes(p.tier) ? p.tier : "PRO");

  /* ------------------------------------------------------------ the tag outline */
  // viewBox 0 2 272 484. The tag is a 156 x 359 capsule (1:2.3): a semicircular top, straight
  // sides, rounded bottom corners, and the penalty-area D cut into the bottom edge (its depth is
  // a quarter of its chord, the proportion of the real arc). LEGEND's carabiner lives in the
  // headroom above the ring, reserved on every tier so all five stand on the same line.
  const VB = "0 2 272 484";
  const G = { cx: 104, top: 112, hw: 78, H: 359, rb: 40, c: 36, dep: 18 };
  const BOT = G.top + G.H;
  function cc(c1, ra, c2, rb) {
    const dx = c2[0] - c1[0];
    const dy = c2[1] - c1[1];
    const d = Math.hypot(dx, dy);
    const a = (ra * ra - rb * rb + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, ra * ra - a * a));
    const xm = c1[0] + (a * dx) / d;
    const ym = c1[1] + (a * dy) / d;
    return [
      [xm + (h * dy) / d, ym - (h * dx) / d],
      [xm - (h * dy) / d, ym + (h * dx) / d],
    ];
  }
  const notchOf = (g) => {
    const R = (g.c * g.c + g.dep * g.dep) / (2 * g.dep);
    return { R, x: g.cx, y: g.top + g.H - g.dep + R };
  };
  /** The outline inset by d (keylines, enamel fields) and shifted down by oy (the edge). */
  function tagG(g, d = 0, oy = 0) {
    const top = g.top + oy;
    const bot = top + g.H;
    const { cx, hw, rb } = g;
    const N = notchOf({ ...g, top });
    const Rn = N.R + d;
    const rt = hw - d;
    const xr = cx + hw - d;
    const xl = cx - hw + d;
    const yb = bot - d;
    const rbd = rb - d;
    const cR = [cx + hw - rb, bot - rb];
    const fy = N.y - yb;
    const fx = Math.sqrt(Math.max(0, Rn * Rn - fy * fy));
    const onFlat = fx <= hw - rb;
    let pr;
    if (onFlat) pr = [cx + fx, yb];
    else {
      const Q = cc([N.x, N.y], Rn, cR, rbd);
      pr = Q[0][0] > Q[1][0] ? Q[0] : Q[1];
    }
    const pl = [2 * cx - pr[0], pr[1]];
    const P = (x, y) => `${r2(x)} ${r2(y)}`;
    let s = `M${P(xl, top + hw)}A${r2(rt)} ${r2(rt)} 0 0 1 ${P(xr, top + hw)}L${P(xr, bot - rb)}`;
    s += onFlat ? `A${r2(rbd)} ${r2(rbd)} 0 0 1 ${P(cx + hw - rb, yb)}L${P(pr[0], pr[1])}` : `A${r2(rbd)} ${r2(rbd)} 0 0 1 ${P(pr[0], pr[1])}`;
    s += `A${r2(Rn)} ${r2(Rn)} 0 0 0 ${P(pl[0], pl[1])}`;
    s += onFlat ? `L${P(cx - hw + rb, yb)}A${r2(rbd)} ${r2(rbd)} 0 0 1 ${P(xl, bot - rb)}` : `A${r2(rbd)} ${r2(rbd)} 0 0 1 ${P(xl, bot - rb)}`;
    return s + "Z";
  }
  const tagD = (d = 0, oy = 0) => tagG(G, d, oy);
  /** Half-width of the tag at height y (the notch only bites the bottom centre). */
  function halfW(y, g = G) {
    const ct = g.top + g.hw;
    const bot = g.top + g.H;
    if (y <= g.top || y >= bot) return 0;
    if (y < ct) return Math.sqrt(Math.max(0, g.hw * g.hw - (ct - y) ** 2));
    if (y <= bot - g.rb) return g.hw;
    return g.hw - g.rb + Math.sqrt(Math.max(0, g.rb * g.rb - (y - (bot - g.rb)) ** 2));
  }
  const NT = notchOf(G);
  const EY = { x: G.cx, y: G.top + 27, r: 11 };
  const holeD = (r = EY.r, oy = 0, c = EY) =>
    `M${r2(c.x + r)} ${r2(c.y + oy)}A${r} ${r} 0 1 0 ${r2(c.x - r)} ${r2(c.y + oy)}A${r} ${r} 0 1 0 ${r2(c.x + r)} ${r2(c.y + oy)}Z`;
  const faceD = (oy = 0) => tagD(0, oy) + holeD(EY.r, oy);

  // The layout down the tag: crest, the tier band, the stat table, the name, the 84 low in the
  // tag where a hanging object carries its weight, and the return line riding the D.
  const L = { crestY: 157, crestW: 27.5, crestH: 33, bandY: 198, bandH: 21, st0: 243, stP: 16.5, nameY: 335.5, f84: 100, b84: 426, idR: 55.5, key: 5.5 };
  const idArc = (R = L.idR) => {
    const a = 70 * DEG;
    const x0 = NT.x - R * Math.sin(a);
    const x1 = NT.x + R * Math.sin(a);
    const y = NT.y - R * Math.cos(a);
    return `M${r2(x0)} ${r2(y)}A${R} ${R} 0 0 1 ${r2(x1)} ${r2(y)}`;
  };

  /* ------------------------------------------------------------ the split ring */
  // 11u flat band. Founders: a rounded SQUARE tilted 18deg toward the inline end; everyone else:
  // a round ring. The band passes 6.5u inside the eyelet's centre, so a crescent of open hole
  // shows on the start side; it runs in front of the tag up its start side and behind it on the
  // way out, so the charms hang from the part of the ring clear of the tag.
  const TILT = 18;
  const COS = Math.cos(TILT * DEG);
  const SIN = Math.sin(TILT * DEG);
  const UV = [0.891, -0.454]; // from the eyelet toward the ring's centre
  const diag = (h, r) => (h - r) * Math.SQRT2 + r;
  const SQB = { ho: 42, ro: 16, hi: 31, ri: 5 };
  const SQ_MID = (diag(SQB.ho, SQB.ro) + diag(SQB.hi, SQB.ri)) / 2;
  const SQ = { x: r2(EY.x + (SQ_MID + 6.5) * UV[0]), y: r2(EY.y + (SQ_MID + 6.5) * UV[1]) };
  const RN = { x: r2(EY.x + 41.5 * UV[0]), y: r2(EY.y + 41.5 * UV[1]) };
  const P0 = [EY.x + 6.5 * UV[0], EY.y + 6.5 * UV[1]]; // where the band crosses the eyelet
  const rrect = (h, r) =>
    `M${-h + r} ${-h}H${h - r}A${r} ${r} 0 0 1 ${h} ${-h + r}V${h - r}A${r} ${r} 0 0 1 ${h - r} ${h}H${-h + r}A${r} ${r} 0 0 1 ${-h} ${h - r}V${-h + r}A${r} ${r} 0 0 1 ${-h + r} ${-h}Z`;
  const circ = (r) => `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;
  const sqW = (x, y, C = SQ) => [r2(C.x + x * COS - y * SIN), r2(C.y + x * SIN + y * COS)];
  const rnW = (deg, rr, C = RN) => [r2(C.x + rr * Math.cos(deg * DEG)), r2(C.y + rr * Math.sin(deg * DEG))];
  // the half-disc round the eyelet where the band runs IN FRONT of the tag
  function frontD(rad = 50) {
    const a = [P0[0] + rad * UV[0], P0[1] + rad * UV[1]];
    const b = [P0[0] - rad * UV[0], P0[1] - rad * UV[1]];
    return `M${r2(a[0])} ${r2(a[1])}A${rad} ${rad} 0 0 0 ${r2(b[0])} ${r2(b[1])}Z`;
  }
  const wedgeD = (a0, a1, rad = 80) => {
    const p = (a) => `${r2(rad * Math.cos(a * DEG))} ${r2(rad * Math.sin(a * DEG))}`;
    return `M0 0L${p(a0)}A${rad} ${rad} 0 0 1 ${p(a1)}Z`;
  };
  // where the charms' jump rings and LEGEND's carabiner meet each ring
  const JR = { sq: sqW(36.5, 22), rn: rnW(25, 35) };
  const CB = { sq: { at: sqW(-26, -26), rot: -22 }, rn: { at: rnW(-100, 27), rot: -8 } };

  /* ------------------------------------------------------------ shared defs */
  function defsCommon(id, founder) {
    return (
      (founder
        ? `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-44" y1="-44" x2="44" y2="44"><stop offset="0" stop-color="#7189ad"/><stop offset=".17" stop-color="#32455f"/><stop offset=".36" stop-color="#9db0ca"/><stop offset=".5" stop-color="#3a4e6b"/><stop offset=".7" stop-color="#22324a"/><stop offset=".86" stop-color="#6580a4"/><stop offset="1" stop-color="#2a3b54"/></linearGradient>`
        : `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-44" y1="-44" x2="44" y2="44"><stop offset="0" stop-color="#e6ebf0"/><stop offset=".2" stop-color="#87919d"/><stop offset=".4" stop-color="#f3f6f9"/><stop offset=".56" stop-color="#a9b2be"/><stop offset=".76" stop-color="#6b7683"/><stop offset=".9" stop-color="#c7ced6"/><stop offset="1" stop-color="#8a94a0"/></linearGradient>`) +
      `<linearGradient id="${id}-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f4f7"/><stop offset=".42" stop-color="#a9b2be"/><stop offset=".68" stop-color="#77818e"/><stop offset="1" stop-color="#cfd5dc"/></linearGradient>` +
      `<clipPath id="${id}-fr"><path d="${frontD()}"/></clipPath>` +
      `<clipPath id="${id}-fc"><path d="${tagD(0)}"/></clipPath>`
    );
  }

  // Engraved and paint-filled (PRO resin, CHAMPION steel): the recess casts a shadow from its
  // top-start wall and its lower lip catches the light.
  const fEngOne = (fid, k, lip, lipO) =>
    `<filter id="${fid}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feOffset in="SourceAlpha" dx="${r2(0.8 * k)}" dy="${r2(1.1 * k)}" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="w"/>` +
    `<feFlood flood-color="#000" flood-opacity="${k < 1 ? 0.55 : 0.8}"/><feComposite in2="w" operator="in" result="sh"/>` +
    `<feOffset in="SourceAlpha" dx="${r2(0.5 * k)}" dy="${r2(0.6 * k)}" result="o3"/><feComposite in="o3" in2="SourceAlpha" operator="out" result="lip"/>` +
    `<feFlood flood-color="${lip}" flood-opacity="${lipO}"/><feComposite in2="lip" operator="in" result="lp"/>` +
    `<feMerge><feMergeNode in="lp"/><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge></filter>`;
  // -ink for display type (crest, name, 84), -ink2 for small type, whose strokes a full-depth
  // recess shadow would swallow
  const fEng = (id, lip = "#fff3e6", lipO = 0.16) => fEngOne(`${id}-ink`, 1, lip, lipO) + fEngOne(`${id}-ink2`, 0.4, lip, lipO);
  // Debossed into leather (LEGEND): pressed in, the lower lip catches light.
  const fDebOne = (fid, k) =>
    `<filter id="${fid}" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB">` +
    `<feOffset in="SourceAlpha" dx="${r2(0.9 * k)}" dy="${r2(1.2 * k)}" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="w"/>` +
    `<feFlood flood-color="#000" flood-opacity="${k < 1 ? 0.5 : 0.7}"/><feComposite in2="w" operator="in" result="sh"/>` +
    `<feOffset in="SourceAlpha" dx="${r2(0.7 * k)}" dy="${r2(0.9 * k)}" result="o3"/><feComposite in="o3" in2="SourceAlpha" operator="out" result="lip"/>` +
    `<feFlood flood-color="#ffffff" flood-opacity=".22"/><feComposite in2="lip" operator="in" result="lp"/>` +
    `<feMerge><feMergeNode in="lp"/><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge></filter>`;
  const fDeboss = (id) => fDebOne(`${id}-ink`, 1) + fDebOne(`${id}-ink2`, 0.4);

  /* ------------------------------------------------------------ the five materials */
  // Each returns the tag's edge (its visible thickness), its face, the tier band's strip, the
  // paint for the engraving and the crest treatment. The paint is cream on the dark materials and
  // a near-black enamel on the light ones; labels at 70% stay at 4.5:1 or better on every one.
  const bandRect = (inset = 0) => `<rect x="${G.cx - G.hw - 2}" y="${L.bandY}" width="${2 * G.hw + 4}" height="${L.bandH}"/>`;
  const edge = (fill, t, extra = "") =>
    `<path d="${faceD(t)}" fill-rule="evenodd" fill="${fill}"${extra}/>` + `<path class="c03v2-rim" d="${tagD(0, t)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

  // HOMA: fresh anodised aluminium in a light slate, bead-blasted to a fine matte; every mark is
  // laser-etched dark. Light in value, so it can never be mistaken for the dark club leather.
  function faceHoma(id, c, thumb) {
    const base = "#a9b6c6";
    const ink = "#0e1319";
    const defs =
      `<clipPath id="${id}-bd"><path d="${tagD(0.6)}"/></clipPath>` +
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          // the bead-blast: a dense, even speckle of tiny pits, light and dark
          `<feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="7" result="n"/>` +
          `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .2 -.07" result="sp"/>` +
          `<feComposite in="sp" in2="SourceAlpha" operator="in" result="spk"/>` +
          `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.16 .07" result="pt"/>` +
          `<feComposite in="pt" in2="SourceAlpha" operator="in" result="pit"/>` +
          // a soft broad shading across the part, flat in the middle where the type is
          `<feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b"/>` +
          `<feDiffuseLighting in="b" surfaceScale="2.2" diffuseConstant="1.17" lighting-color="#fff" result="dl"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>` +
          `<feBlend in="SourceGraphic" in2="dl" mode="multiply" result="m"/>` +
          `<feMerge result="mm"><feMergeNode in="m"/><feMergeNode in="pit"/><feMergeNode in="spk"/></feMerge><feComposite in="mm" in2="SourceAlpha" operator="in"/></filter>`);
    const under = edge("#6d7883", 4);
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="${base}"${thumb ? "" : ` filter="url(#${id}-mat)"`}/>` +
      // the soft edge break of a tumbled part, lit along its top-start, shaded along its bottom-end
      `<path d="${tagD(0.9)}" fill="none" stroke="#f2f5f8" stroke-opacity=".7" stroke-width="1.1" clip-path="url(#${id}-tl)"/>` +
      `<path d="${tagD(0.9)}" fill="none" stroke="#3e4752" stroke-opacity=".35" stroke-width="1.1" clip-path="url(#${id}-br)"/>` +
      `<clipPath id="${id}-tl"><path d="M0 0H210L0 330Z"/></clipPath><clipPath id="${id}-br"><path d="M210 0V500H0Z"/></clipPath>`;
    // the band: a machined flat, a step down into the part
    const band =
      `<g clip-path="url(#${id}-bd)"><g fill="#93a0b0">${bandRect()}</g>` +
      `<path d="M0 ${L.bandY + 0.6}H220" stroke="#4a5460" stroke-opacity=".55" stroke-width="1.2"/>` +
      `<path d="M0 ${L.bandY + L.bandH - 0.5}H220" stroke="#f2f5f8" stroke-opacity=".75" stroke-width="1"/></g>`;
    return { defs, under, body, band, ink, bandInk: ink, keyline: 0.3, crest: (w, h) => MC.crest({ mono: ink, w, h }) };
  }

  // STADE: cream vitreous enamel fired on a pressed steel blank; the steel rim follows the D.
  function faceStade(id, c, thumb) {
    const ink = "#1a2330";
    const enamel = `${tagD(3.6)}${holeD(14.8)}`;
    const defs =
      `<linearGradient id="${id}-sb" gradientUnits="userSpaceOnUse" x1="30" y1="110" x2="190" y2="470"><stop offset="0" stop-color="#eef1f4"/><stop offset=".35" stop-color="#a7b0ba"/><stop offset=".6" stop-color="#dde2e7"/><stop offset="1" stop-color="#8d97a2"/></linearGradient>` +
      `<linearGradient id="${id}-gl" gradientUnits="userSpaceOnUse" x1="30" y1="150" x2="120" y2="300"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<clipPath id="${id}-en"><path d="${enamel}" clip-rule="evenodd"/></clipPath>`;
    const under = edge("#757e88", 3.5);
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="url(#${id}-sb)"/>` +
      `<path d="${enamel}" fill-rule="evenodd" fill="#efe8d8"/>` +
      // the glaze pools against the rim: a hairline of shadow, then the gloss
      `<path d="${enamel}" fill-rule="evenodd" fill="none" stroke="#5b5242" stroke-opacity=".28" stroke-width="1.2"/>` +
      (thumb ? "" : `<path d="M20 110H200L20 300Z" fill="url(#${id}-gl)" clip-path="url(#${id}-en)"/>`) +
      `<path d="${tagD(0.7)}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".8" clip-path="url(#${id}-tl)"/>` +
      `<clipPath id="${id}-tl"><path d="M0 0H210L0 330Z"/></clipPath>`;
    // the band: the club colour fired between two raised steel wires (cloisonné)
    const band =
      `<g clip-path="url(#${id}-en)"><g fill="${c.primary}">${bandRect()}</g>` +
      `<path d="M0 ${L.bandY}H220M0 ${L.bandY + L.bandH}H220" stroke="#8d97a2" stroke-width="2"/>` +
      `<path d="M0 ${L.bandY - 0.5}H220M0 ${L.bandY + L.bandH - 0.5}H220" stroke="#f4f6f8" stroke-width=".7"/></g>`;
    return {
      defs,
      under,
      body,
      band,
      ink,
      bandInk: c.secondary,
      keyline: 0,
      crest: (w, h) => MC.crest({ fill: c.primary, sash: c.secondary, ring: c.primary, w, h }),
    };
  }

  // PRO: clean smoked-navy translucent resin. Light enters at the edges, so they glow; the
  // visible edge thickness is a lighter, clearer navy; the ring shows faintly through it.
  function facePro(id, c, thumb) {
    const ink = "#efe7d6";
    const defs =
      `<radialGradient id="${id}-rs" gradientUnits="userSpaceOnUse" cx="96" cy="250" r="230"><stop offset="0" stop-color="#0f1a2d"/><stop offset=".62" stop-color="#132341"/><stop offset="1" stop-color="#22406a"/></radialGradient>` +
      `<linearGradient id="${id}-ed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d4f7d"/><stop offset="1" stop-color="#3e679c"/></linearGradient>` +
      `<linearGradient id="${id}-sg" gradientUnits="userSpaceOnUse" x1="40" y1="120" x2="140" y2="300"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<clipPath id="${id}-bd"><path d="${tagD(0.6)}"/></clipPath>` +
      (thumb ? "" : `<filter id="${id}-gw" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter>` + fEng(id));
    const under =
      `<path d="${faceD(5)}" fill-rule="evenodd" fill="url(#${id}-ed)" fill-opacity=".96"/>` +
      `<path d="${tagD(0, 5)}" fill="none" stroke="#9cc0ec" stroke-opacity=".55" stroke-width=".9" clip-path="url(#${id}-lo)"/>` +
      `<clipPath id="${id}-lo"><rect x="0" y="300" width="260" height="200"/></clipPath>` +
      `<path class="c03v2-rim" d="${tagD(0, 5)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="url(#${id}-rs)"/>` +
      (thumb ? "" : `<g clip-path="url(#${id}-fc)"><path d="${tagD(1)}" fill="none" stroke="#4f80bd" stroke-opacity=".5" stroke-width="7" filter="url(#${id}-gw)"/></g>`) +
      `<path d="${tagD(0)}" fill="url(#${id}-sg)" clip-path="url(#${id}-tl)"/>` +
      `<path d="${tagD(0.8)}" fill="none" stroke="#d6e6fa" stroke-opacity=".55" stroke-width=".8" clip-path="url(#${id}-tl)"/>` +
      `<clipPath id="${id}-tl"><path d="M0 0H210L0 330Z"/></clipPath>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="${EY.r + 0.6}" fill="none" stroke="#8fb2de" stroke-opacity=".45" stroke-width="1"/>`;
    // the band: moulded into the resin as a frosted strip
    const band =
      `<g clip-path="url(#${id}-bd)"><g fill="#c9dcf3" fill-opacity=".1">${bandRect()}</g>` +
      `<path d="M0 ${L.bandY + 0.5}H220" stroke="#cfe0f5" stroke-opacity=".35" stroke-width="1"/>` +
      `<path d="M0 ${L.bandY + L.bandH - 0.5}H220" stroke="#000" stroke-opacity=".45" stroke-width="1"/></g>`;
    return {
      defs,
      under,
      body,
      band,
      ink,
      bandInk: ink,
      filter: true,
      keyline: 0.3,
      seeThrough: true,
      crest: (w, h) => MC.crest({ fill: c.primary, sash: c.secondary, ring: c.secondary, w, h }),
    };
  }

  // CHAMPION: solid machined steel, turned and brushed, with a polished chamfer; every mark is
  // engraved and paint-filled in black enamel. The band is a machined groove filled black.
  function faceChampion(id, c, thumb) {
    const ink = "#11161c";
    const defs =
      `<linearGradient id="${id}-nk" gradientUnits="userSpaceOnUse" x1="26" y1="110" x2="190" y2="480"><stop offset="0" stop-color="#eef1f4"/><stop offset=".22" stop-color="#b8c0c9"/><stop offset=".42" stop-color="#e3e7eb"/><stop offset=".62" stop-color="#a2abb5"/><stop offset=".82" stop-color="#d6dce2"/><stop offset="1" stop-color="#a5aeb8"/></linearGradient>` +
      `<linearGradient id="${id}-bv" gradientUnits="userSpaceOnUse" x1="40" y1="110" x2="180" y2="470"><stop offset="0" stop-color="#fff"/><stop offset=".48" stop-color="#fff" stop-opacity=".15"/><stop offset=".55" stop-color="#1b232c" stop-opacity=".15"/><stop offset="1" stop-color="#1b232c" stop-opacity=".85"/></linearGradient>` +
      `<clipPath id="${id}-bd"><path d="${tagD(4.2)}"/></clipPath>` +
      (thumb
        ? ""
        : `<filter id="${id}-br" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
          `<feTurbulence type="fractalNoise" baseFrequency=".008 .9" numOctaves="2" seed="5" result="n"/>` +
          `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 -.2" result="w"/>` +
          `<feComposite in="w" in2="SourceAlpha" operator="in" result="wl"/>` +
          `<feBlend in="SourceGraphic" in2="wl" mode="soft-light"/></filter>` +
          fEng(id, "#ffffff", 0.55));
    const under = edge("#646d77", 4.2);
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="url(#${id}-nk)"${thumb ? "" : ` filter="url(#${id}-br)"`}/>` +
      // the polished chamfer round the outline and round the eyelet
      `<path d="${tagD(2.1)}" fill="none" stroke="url(#${id}-bv)" stroke-width="4.2" stroke-opacity=".75"/>` +
      `<path d="${tagD(4.2)}" fill="none" stroke="#2b333d" stroke-opacity=".4" stroke-width=".6"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="${EY.r + 2}" fill="none" stroke="url(#${id}-bv)" stroke-width="4" stroke-opacity=".8"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="${EY.r + 4}" fill="none" stroke="#2b333d" stroke-opacity=".4" stroke-width=".6"/>`;
    const band =
      `<g clip-path="url(#${id}-bd)"><g fill="#171c22">${bandRect()}</g>` +
      `<path d="M0 ${L.bandY + 0.8}H220" stroke="#000" stroke-opacity=".6" stroke-width="1.6"/>` +
      `<path d="M0 ${L.bandY + L.bandH + 0.4}H220" stroke="#fff" stroke-opacity=".75" stroke-width=".8"/></g>`;
    return {
      defs,
      under,
      body,
      band,
      ink,
      bandInk: "#e4e8ec",
      filter: true,
      keyline: 0.42,
      keyInset: 7.5,
      crest: (w, h) => MC.crest({ fill: c.primary, sash: c.secondary, ring: ink, w, h }),
    };
  }

  // LEGEND: hand-stitched leather in the club colour, cut in match-ball panels. A hexagon panel
  // frames the stat table and nothing else: its top edge runs under the sewn strap, its side
  // corners reach for the border stitching and its bottom edge closes 12u under the last row,
  // so no seam comes within 8u of any type. The name and the 84 sit on the plain lower panel.
  // (A regular hexagon wide enough for the table would be taller than the gap between the strap
  // and the name, so the panel is a hexagon stretched across the tag, as a ball panel is near
  // the seam of a hide.)
  const LEG = { bandY: 196, bandH: 26, st0: 239.5, stP: 15.5, tw: 66, nameTop: 312.5 };
  const HX = (() => {
    const cx = G.cx;
    const yt = 212;
    const yb = 301;
    const p = 44;
    const q = 64;
    const ym = (yt + yb) / 2;
    return { TL: [cx - p, yt], TR: [cx + p, yt], R: [cx + q, ym], BR: [cx + p, yb], BL: [cx - p, yb], Lf: [cx - q, ym], yt, yb, ym };
  })();
  const hexD = () => `M${HX.TL.join(" ")}L${HX.TR.join(" ")}L${HX.R.map(r2).join(" ")}L${HX.BR.map(r2).join(" ")}L${HX.BL.map(r2).join(" ")}L${HX.Lf.map(r2).join(" ")}Z`;
  // the third seam at each top corner, running up and out past the strap to the outline
  const HX_UP = (() => {
    const e1 = [1, 0];
    const dx = HX.Lf[0] - HX.TL[0];
    const dy = HX.Lf[1] - HX.TL[1];
    const l = Math.hypot(dx, dy);
    const b = [-(e1[0] + dx / l), -(e1[1] + dy / l)];
    const bl = Math.hypot(b[0], b[1]);
    const u = [b[0] / bl, b[1] / bl];
    return { L: [r2(HX.TL[0] + u[0] * 140), r2(HX.TL[1] + u[1] * 140)], R: [r2(HX.TR[0] - u[0] * 140), r2(HX.TR[1] + u[1] * 140)] };
  })();
  function faceLegend(id, c, thumb) {
    const leather = c.primary;
    const ink = paintOn(leather);
    const hi = mix(leather, "#ffffff", 0.12);
    const lo = mix(leather, "#000000", 0.38);
    const strap = mix(leather, "#000000", 0.4);
    const thread = "#f1e6d2";
    const H = HX;
    const U = HX_UP;
    // the five panels, each padded on its own: lit at its top-start, shaded into its seams
    const panels = [
      { d: hexD(), at: [84, 226], r: 80, hl: 0.03 },
      { d: `M${H.TL.join(" ")}L${U.L.join(" ")}L-40 ${U.L[1]}V${H.ym}H${H.Lf[0]}Z`, at: [36, 200], r: 52 },
      { d: `M${H.TR.join(" ")}L${U.R.join(" ")}L250 ${U.R[1]}V${H.ym}H${H.R[0]}Z`, at: [158, 200], r: 52 },
      { d: `M${U.L.join(" ")}L${H.TL.join(" ")}H${H.TR[0]}L${U.R.join(" ")}V0H${U.L[0]}Z`, at: [84, 138], r: 96 },
      { d: `M-40 ${H.ym}H${H.Lf[0]}L${H.BL.join(" ")}H${H.BR[0]}L${H.R.join(" ")}H250V500H-40Z`, at: [78, 330], r: 170 },
    ];
    const padG = (k, P) =>
      `<radialGradient id="${id}-pd${k}" gradientUnits="userSpaceOnUse" cx="${P.at[0]}" cy="${P.at[1]}" r="${P.r}"><stop offset="0" stop-color="#fff" stop-opacity="${P.hl || 0.16}"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>`;
    const defs =
      `<radialGradient id="${id}-lh" gradientUnits="userSpaceOnUse" cx="70" cy="170" r="330"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${leather}"/><stop offset="1" stop-color="${lo}"/></radialGradient>` +
      `<linearGradient id="${id}-eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a221c"/><stop offset="1" stop-color="#0d0a08"/></linearGradient>` +
      panels.map((P, k) => padG(k, P)).join("") +
      `<clipPath id="${id}-sc"><path d="${tagD(1.6)}"/></clipPath>` +
      `<clipPath id="${id}-bd"><path d="${tagD(1.4)}"/></clipPath>` +
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          // a fine pebble grain, lit low, then a broad soft sheen: finished hide, not felt
          `<feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="9" result="g"/>` +
          `<feDiffuseLighting in="g" surfaceScale=".6" diffuseConstant="1.06" lighting-color="#fff" result="gb"><feDistantLight azimuth="225" elevation="64"/></feDiffuseLighting>` +
          `<feBlend in="SourceGraphic" in2="gb" mode="multiply" result="m"/>` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="12" result="b"/>` +
          `<feSpecularLighting in="b" surfaceScale="3.2" specularConstant=".7" specularExponent="14" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>` +
          `<feComposite in="m" in2="sp" operator="arithmetic" k2="1" k3=".34" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
          `<filter id="${id}-pw" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="3.4"/></filter>` +
          `<filter id="${id}-ss" x="-10%" y="-60%" width="120%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2.2"/></filter>` +
          fDeboss(id));
    // the seams as straight segments: the hexagon, the edges running up from its top corners
    // past the strap, and the short edges from its side corners out to the outline
    const segs = [
      [H.TL, H.TR], [H.TR, H.R], [H.R, H.BR], [H.BR, H.BL], [H.BL, H.Lf], [H.Lf, H.TL],
      [H.TL, U.L], [H.TR, U.R], [H.Lf, [10, H.Lf[1]]], [H.R, [200, H.R[1]]],
    ].map(([a, b]) => [a.map(r2), b.map(r2)]);
    // the side stubs' own stitching stops at the border stitching instead of crossing it
    const IN = 9.4;
    const sSegs = segs.map(([a, b], i) => (i === 8 ? [a, [G.cx - G.hw + IN, b[1]]] : i === 9 ? [a, [G.cx + G.hw - IN, b[1]]] : [a, b]));
    const off = (a, b, k) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * k;
      const ny = (dx / l) * k;
      return `M${r2(a[0] + nx)} ${r2(a[1] + ny)}L${r2(b[0] + nx)} ${r2(b[1] + ny)}`;
    };
    const line = (a, b) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
    // each panel is padded: a soft shadow pools along every seam, and the panel rises toward a
    // highlight at its top-start
    const pillow = thumb ? "" : `<g filter="url(#${id}-pw)" stroke="#000" stroke-opacity=".5" stroke-width="10">${segs.map(([a, b]) => `<path d="${line(a, b)}"/>`).join("")}</g>`;
    const pads = panels.map((P, k) => `<path d="${P.d}" fill="url(#${id}-pd${k})"/>`).join("");
    const grooves = segs.map(([a, b]) => `<path d="${line(a, b)}" stroke="#07090c" stroke-opacity=".75" stroke-width="1.6"/>`).join("");
    const stitches = sSegs
      .map(([a, b]) =>
        [-2.8, 2.8]
          .map(
            (k) =>
              (thumb ? "" : `<path d="${off(a, b, k)}" stroke="#05070a" stroke-opacity=".6" stroke-width="1.8" stroke-dasharray="2.8 2.1" transform="translate(.35 .55)"/>`) +
              `<path d="${off(a, b, k)}" stroke="${thread}" stroke-width="1.3" stroke-dasharray="2.8 2.1"/>`,
          )
          .join(""),
      )
      .join("");
    // the double saddle stitch round the outline: two rows of heavy cream thread
    const saddle = [4, 7.2]
      .map(
        (d) =>
          (thumb ? "" : `<path d="${tagD(d)}" fill="none" stroke="#05070a" stroke-opacity=".6" stroke-width="2.3" stroke-dasharray="3.6 2.3" transform="translate(.45 .7)"/>`) +
          `<path d="${tagD(d)}" fill="none" stroke="${thread}" stroke-width="1.75" stroke-dasharray="3.6 2.3" stroke-linecap="round"/>`,
      )
      .join("");
    // the burnished, painted edge: a dark warm edge paint with a slick of light along it
    const under =
      `<path d="${faceD(4.5)}" fill-rule="evenodd" fill="url(#${id}-eg)"/>` +
      `<path d="${tagD(0, 2.6)}" fill="none" stroke="#b5a796" stroke-opacity=".38" stroke-width=".8" clip-path="url(#${id}-lo)"/>` +
      `<clipPath id="${id}-lo"><rect x="0" y="250" width="260" height="260"/></clipPath>` +
      `<path class="c03v2-rim" d="${tagD(0, 4.5)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="url(#${id}-lh)"${thumb ? "" : ` filter="url(#${id}-mat)"`}/>` +
      // each panel is its own piece of hide; the hexagon that carries the table is the darkest, so
      // the 70% labels hold 4.5:1 on it
      `<g clip-path="url(#${id}-fc)"><path d="${hexD()}" fill="#000" fill-opacity=".5"/>${pads}</g>` +
      `<g fill="none" stroke-linecap="round" clip-path="url(#${id}-sc)">${pillow}${grooves}${stitches}</g>` +
      // the painted edge rolls over onto the face
      `<path d="${tagD(1.1)}" fill="none" stroke="#17120e" stroke-width="2.4"/>` +
      `<path d="${tagD(2.5)}" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width=".6"/>` +
      saddle +
      // a steel grommet in the eyelet
      `<circle cx="${EY.x}" cy="${EY.y}" r="${EY.r + 3.2}" fill="none" stroke="#3a4048" stroke-width="6.6"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="${EY.r + 3.2}" fill="none" stroke="url(#${id}-st)" stroke-width="5.2"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="${EY.r + 0.6}" fill="none" stroke="#2a3038" stroke-width=".7"/>`;
    // the band: a separate strap of darker hide sewn across the top, taller than the other
    // tiers' bands so the Arabic tier word clears both rows of its stitching
    const y0 = LEG.bandY;
    const y1 = LEG.bandY + LEG.bandH;
    const band =
      (thumb ? "" : `<g clip-path="url(#${id}-fc)"><rect x="0" y="${y1 - 1}" width="220" height="5" fill="#000" fill-opacity=".55" filter="url(#${id}-ss)"/></g>`) +
      `<g clip-path="url(#${id}-bd)"><rect x="${G.cx - G.hw - 2}" y="${y0}" width="${2 * G.hw + 4}" height="${LEG.bandH}" fill="${strap}"/>` +
      `<path d="M0 ${y0 + 0.6}H220M0 ${y1 - 0.6}H220" stroke="#120e0b" stroke-width="1.4"/>` +
      `<path d="M0 ${y0 + 1.5}H220" stroke="#fff" stroke-opacity=".16" stroke-width=".5"/>` +
      `<path d="M0 ${y0 + 2.9}H220M0 ${y1 - 2.9}H220" stroke="${thread}" stroke-width="1.3" stroke-dasharray="2.8 2"/></g>`;
    return {
      defs,
      under,
      body,
      band,
      ink,
      bandInk: ink,
      filter: true,
      keyline: 0,
      lay: { bandY: LEG.bandY, bandH: LEG.bandH, st0: LEG.st0, stP: LEG.stP, tw: LEG.tw, nameTop: LEG.nameTop, idR: 58.5, tierAr: 11.5 },
      crest: (w, h) => MC.crest({ mono: ink, w, h }),
    };
  }

  const FACE = { HOMA: faceHoma, STADE: faceStade, PRO: facePro, CHAMPION: faceChampion, LEGEND: faceLegend };

  /* ------------------------------------------------------------ the engraving */
  function engraving(p, o, id, F, thumb) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const ink = F.ink;
    let big = "";
    let small = "";

    // the club's crest at the top, 25% larger than the first pass
    big += `<g transform="translate(${r2(G.cx - L.crestW / 2)} ${L.crestY})">${F.crest(L.crestW, L.crestH)}</g>`;

    // the tier, moulded into the band across the top
    const lay = { bandY: L.bandY, bandH: L.bandH, st0: L.st0, stP: L.stP, tw: 0, nameTop: 0, ...(F.lay || {}) };
    const tier = S.tiers[p.tier];
    const bc = lay.bandY + lay.bandH / 2;
    if (!thumb) {
      if (ar) {
        const fs = lay.tierAr || 12;
        const m = meas(F_AR, tier);
        const base = m ? r2(bc + (((m.a - m.d) / 2) * fs) / 100) : r2(bc + 0.3 * fs);
        small += `<text x="${G.cx}" y="${base}" text-anchor="middle" font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="700" font-size="${fs}" fill="${F.bandInk}">${esc(tier)}</text>`;
      } else {
        const fs = 11.5;
        const ls = 0.16 * fs;
        small += `<text x="${r2(G.cx + ls / 2)}" y="${r2(bc + 0.32 * fs)}" text-anchor="middle" font-family="Changa, sans-serif" font-weight="700" font-size="${fs}" letter-spacing="${r2(ls)}" fill="${F.bandInk}">${esc(tier)}</text>`;
      }
    }

    // the name, with the founder year after it the way supporter groups carry theirs (ALI ·26).
    // In Arabic the year sits to the left of the name and the dot stays beside the name (26· علي).
    // The line is never wider than NW, which keeps it 20u inside the outline (and 10u inside
    // LEGEND's inner row of stitching); long names step down in size rather than crowd the edge.
    const name = MC.nameOf(p, o);
    const yr = p.founder ? String(p.founder).slice(2) : "";
    const yy = yr ? (ar ? yr + "·" : "·" + yr) : "";
    let ny = L.nameY;
    const NW = 116;
    const nW = (fs) => wAt(F_CH, name, fs, ar ? 0.55 : 0.62);
    const sW = (fs) => (yy ? wAt(F_CH6, yy, fs * 0.62, 0.48) + fs * 0.14 : 0);
    let nfs = 30;
    if (nW(30) + sW(30) > NW) nfs = Math.max(17, (30 * NW) / (nW(30) + sW(30)));
    // Arabic letters climb above and drop below the Latin caps: fit the ink between the table
    // (or LEGEND's hexagon seam) and the 84 with 8u clear of each, moving the baseline first and
    // the size only if it must
    if (ar) {
      const m = meas(F_CH, name);
      if (m) {
        const top = lay.nameTop || lay.st0 + 3 * lay.stP + 3 + 12;
        const bot = L.b84 - 0.64 * L.f84 - 8;
        const asc = m.a / 100;
        const dsc = m.d / 100;
        if ((asc + dsc) * nfs > bot - top) nfs = Math.max(17, (bot - top) / (asc + dsc));
        ny = Math.min(Math.max(ny, top + asc * nfs), bot - dsc * nfs);
      }
    }
    ny = r2(ny);
    const sw = sW(nfs);
    const nwRaw = nW(nfs);
    const squeeze = nwRaw + sw > NW + 1;
    const nw = squeeze ? NW - sw : nwRaw;
    const lineW = nw + sw;
    const x0 = G.cx - lineW / 2;
    const nameX = ar ? x0 + sw : x0;
    const sufX = ar ? x0 : x0 + nw + nfs * 0.14;
    big += `<text x="${r2(nameX)}" y="${ny}" font-family="Changa, sans-serif" font-weight="800" font-size="${r2(nfs)}" fill="${ink}"${squeeze ? ` textLength="${r2(nw)}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(name)}</text>`;
    if (yy) small += `<text x="${r2(sufX)}" y="${ny}" font-family="Changa, sans-serif" font-weight="600" font-size="${r2(nfs * 0.62)}" direction="ltr" fill="${ink}" fill-opacity=".86">${esc(yy)}</text>`;

    // the stat table: four aligned rows, as wide as the name line so they read as one column
    // (LEGEND caps it at the width its hexagon panel can frame). Values in Manrope 700 with
    // tabular figures, labels in 600 caps at 70%.
    if (!thumb) {
      const TW = lay.tw || Math.max(72, Math.min(84, lineW));
      const xl = r2(G.cx - TW / 2);
      const xr = r2(G.cx + TW / 2);
      const vf = 12.5;
      MC.STATS.forEach((k, i) => {
        const y = r2(lay.st0 + i * lay.stP);
        const lab = esc(S.stats[k]);
        const val = esc(p.stats[k]);
        const vT = (x, end) =>
          `<text x="${x}" y="${y}"${end ? ' text-anchor="end"' : ""} font-family="Manrope, sans-serif" font-weight="700" font-size="${vf}" style="font-variant-numeric:tabular-nums" fill="${ink}">${val}</text>`;
        if (ar) {
          // RTL: the Arabic label at the right edge, its figure at the left edge, figures aligned
          small += `<text x="${xr}" y="${y}" text-anchor="end" font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="600" font-size="10.5" fill="${ink}" fill-opacity=".7">${lab}</text>` + vT(xl, false);
        } else {
          small += `<text x="${xl}" y="${y}" font-family="Manrope, sans-serif" font-weight="600" font-size="10" letter-spacing=".6" fill="${ink}" fill-opacity=".7">${lab}</text>` + vT(xr, true);
        }
      });
    }

    // the 84, low in the tag, ink-centred in a fixed slot above the D
    const fs = p.ovr >= 100 ? 74 : L.f84;
    const x84 = inkX(p.ovr, fs, G.cx);
    big += `<text x="${x84 != null ? x84 : G.cx}" y="${L.b84}" ${x84 != null ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" fill="${ink}">${esc(p.ovr)}</text>`;

    // the return line rides the penalty-area D: BotolaGO ID and country
    if (!thumb) {
      const sp = ` font-family="Manrope, sans-serif" font-weight="700" font-size="6.8" fill="${ink}" fill-opacity=".82"`;
      small += ar
        ? `<text${sp} direction="rtl"><textPath href="#${id}-rp" startOffset="50%" text-anchor="middle"><tspan font-family="Noto Sans Arabic, sans-serif" font-weight="700" font-size="7.4">${esc(S.country)}</tspan> · <tspan letter-spacing=".25">${esc(p.id)}</tspan></textPath></text>`
        : `<text${sp} letter-spacing=".25"><textPath href="#${id}-rp" startOffset="50%" text-anchor="middle">${esc(`${p.id} · ${S.country}`)}</textPath></text>`;
    }
    const key = F.keyline && !thumb ? `<path d="${tagD(F.keyInset || L.key)}" fill="none" stroke="${ink}" stroke-opacity="${F.keyline}" stroke-width=".8"/>` : "";
    const fl = (k) => (F.filter && !thumb ? ` filter="url(#${id}-${k})"` : "");
    return `<g${fl("ink2")}>${key}${small}</g><g${fl("ink")}>${big}</g>`;
  }

  /* ------------------------------------------------------------ the ring */
  function ring(p, o, id, thumb) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    if (!p.founder) {
      return (
        `<g transform="translate(${RN.x} ${RN.y})">` +
        `<clipPath id="${id}-cw"><path d="${wedgeD(225, 295)}"/></clipPath>` +
        `<g clip-path="url(#${id}-cw)"><path d="${circ(43.5)}${circ(40)}" fill-rule="evenodd" fill="#6b7683"/><path d="${circ(43.1)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".7"/></g>` +
        `<path d="${circ(40)}${circ(30)}" fill-rule="evenodd" fill="url(#${id}-rg)"/>` +
        `<path d="${circ(39.6)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>` +
        `<path d="${circ(30.3)}" fill="none" stroke="#1c232c" stroke-opacity=".55" stroke-width=".8"/>` +
        `<path d="M-30 -21.2L-21.6 -29" stroke="#2a313a" stroke-width="1.1"/><path d="M-29.3 -22.3L-20.9 -30" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/>` +
        `</g>`
      );
    }
    const { ho, ro, hi, ri } = SQB;
    let s =
      `<g transform="translate(${SQ.x} ${SQ.y}) rotate(${TILT})">` +
      `<clipPath id="${id}-cw"><path d="${wedgeD(180, 250)}"/></clipPath>` +
      // the under coil, sprung 3u proud of the top one for 70deg past the split
      `<g clip-path="url(#${id}-cw)"><path d="${rrect(ho + 3.2, ro + 3.2)}${rrect(ho - 0.4, ro - 0.4)}" fill-rule="evenodd" fill="#22324a"/><path d="${rrect(ho + 2.8, ro + 2.8)}" fill="none" stroke="#9db0ca" stroke-opacity=".7" stroke-width=".7"/></g>` +
      `<path d="${rrect(ho, ro)}${rrect(hi, ri)}" fill-rule="evenodd" fill="url(#${id}-rg)"/>` +
      `<path d="${rrect(ho - 0.4, ro - 0.4)}" fill="none" stroke="#dbe5f2" stroke-opacity=".7" stroke-width=".8"/>` +
      `<path d="${rrect(hi + 0.3, ri + 0.3)}" fill="none" stroke="#0d1520" stroke-opacity=".6" stroke-width=".8"/>` +
      // the split: where the top coil ends and the step begins
      `<path d="M${-ho} .6L${-hi} -.6" stroke="#0d1520" stroke-width="1.2"/><path d="M${-ho + 0.4} -.6L${-hi - 0.4} -1.6" stroke="#c9d6e8" stroke-opacity=".7" stroke-width=".6"/>`;
    if (!thumb) {
      const by = -(ho + hi) / 2;
      const stamp = (x, y, attrs, t) =>
        `<text x="${r2(x + 0.35)}" y="${r2(y + 0.5)}" ${attrs} fill="#0b121c" fill-opacity=".75">${esc(t)}</text>` + `<text x="${r2(x)}" y="${r2(y)}" ${attrs} fill="#eef3f9">${esc(t)}</text>`;
      // FOUNDER / عضو مؤسس stamped along the top bar, upright enough to read at arm's length
      const t = S.founder;
      if (ar) {
        let fs = 8.4;
        const w = wAt(F_AR, t, fs, 0.6);
        if (w > 50) fs = r2((fs * 50) / w);
        const m = meas(F_AR, t);
        const base = m ? r2(by + (((m.a - m.d) / 2) * fs) / 100) : r2(by + 0.25 * fs);
        s += stamp(0, base, `text-anchor="middle" font-family="Noto Sans Arabic, sans-serif" font-weight="700" font-size="${fs}"`, t);
      } else {
        const fs = 7.6;
        const ls = r2(0.07 * fs);
        s += stamp(ls / 2, r2(by + 0.37 * fs), `text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${fs}" letter-spacing="${ls}"`, t);
      }
      // 2026 stamped down the end bar
      const yfs = 8.8;
      s += `<g transform="translate(${(ho + hi) / 2} -5) rotate(90)">` + stamp(0.25, r2(0.37 * yfs), `text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${yfs}" letter-spacing=".5"`, String(p.founder)) + `</g>`;
    }
    return s + `</g>`;
  }

  /* ------------------------------------------------------------ the charms */
  // Each charm hangs on its own jump ring at J, laid out like a keyring on a table. The club disc
  // sits in front, the enamel pin of the manager behind it, the season balls further down on a
  // bead chain. Positions are offsets from J.
  const CH = { av: { x: 52, y: -22, r: 25 }, cl: { x: 33, y: 19, r: 29 }, ba: { x: 26, y: 105, r: 19 } };
  const unit = (x, y) => {
    const d = Math.hypot(x, y) || 1;
    return [x / d, y / d];
  };
  // a short chain of flat oval links from the jump ring (0,0) to a charm's tab at B
  const link = (B) => {
    const len = Math.hypot(B[0], B[1]);
    const n = Math.max(1, Math.round(len / 10));
    const ang = r2((Math.atan2(B[1], B[0]) * 180) / Math.PI);
    let s = "";
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const lw = len / n;
      const x = r2(B[0] * t);
      const y = r2(B[1] * t);
      s +=
        i % 2 === 0
          ? `<g transform="translate(${x} ${y}) rotate(${ang})"><rect x="${r2(-lw / 2 - 2.4)}" y="-3.4" width="${r2(lw + 4.8)}" height="6.8" rx="3.4" fill="none" stroke="#2f363e" stroke-width="2.9"/><rect x="${r2(-lw / 2 - 2.4)}" y="-3.4" width="${r2(lw + 4.8)}" height="6.8" rx="3.4" fill="none" stroke="#bcc5cf" stroke-width="1.7"/></g>`
          : `<g transform="translate(${x} ${y}) rotate(${ang})"><rect x="${r2(-lw / 2 - 2.6)}" y="-1.5" width="${r2(lw + 5.2)}" height="3" rx="1.5" fill="#8f99a4" stroke="#2f363e" stroke-width=".9"/></g>`;
    }
    return s;
  };
  // the tab on a disc charm's edge, facing its jump ring
  const bail = (u, r, st) => {
    const bx = r2(u[0] * (r + 2.2));
    const by = r2(u[1] * (r + 2.2));
    return `<circle cx="${bx}" cy="${by}" r="4.6" fill="#3a424b"/><circle cx="${bx}" cy="${by}" r="3.8" fill="${st ? `url(#${st}-st)` : "#c3cbd4"}"/><circle cx="${bx}" cy="${by}" r="1.7" fill="#1d232a"/>`;
  };

  // the club disc: enamel in the club's colours, initials only (no crest is cleared for use)
  function clubDisc(id, c, thumb, r, u) {
    const ink = c.secondary;
    const ini = String(c.initials || "").slice(0, 3);
    const fs = r2(r * (ini.length > 2 ? 0.52 : 0.72));
    const ix = inkX(ini, fs, 0);
    return (
      bail(u, r, id) +
      `<circle r="${r}" fill="url(#${id}-st)"/>` +
      `<circle r="${r - 0.5}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/>` +
      `<circle r="${r - 2.6}" fill="${c.primary}"/>` +
      `<circle r="${r - 5.6}" fill="none" stroke="${ink}" stroke-width="1.3"/>` +
      `<text x="${ix != null ? ix : 0}" y="${r2(0.32 * fs)}"${ix != null ? "" : ' text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" fill="${ink}">${esc(ini)}</text>` +
      (thumb ? "" : `<path d="M${-r + 5} ${-4}A${r - 4} ${r - 4} 0 0 1 ${-4} ${-r + 5}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.2" stroke-linecap="round"/>`)
    );
  }

  // the enamel pin of the manager, cloisonné: steel wire lines hold cream enamel for the ground
  // and the club's colours for the figure. The shared figure, hood up, is scaled up and cropped
  // off-centre at the chest so the hood and one broad shoulder fill the disc; the hood's centre
  // seam runs in cream, turned a little with the head; a 1px rim of light catches its lit side
  // only. No brim, no bar: a person in a bench jacket, not a helmet.
  function avatarPin(id, c, thumb, r, u, st) {
    const A = MC.AVATAR;
    const ri = r - 2.4;
    const k = 0.205;
    const hx = -7;
    // the shoulder line just under the disc's equator, so the near shoulder rounds over inside it
    const top = 1 - 174 * k;
    // three-quarters from behind: the head turned a little toward the start side, the near
    // (end) shoulder broader and dropping away, the far one tucked behind the club disc
    const hoodT = `translate(${r2(hx - 100 * k)} ${r2(top)}) scale(${k}) rotate(-5 100 180)`;
    const bodyT = `translate(${r2(hx + 5 - 100 * k * 1.12)} ${r2(top)}) scale(${r2(k * 1.12, 4)} ${k}) rotate(4 100 176)`;
    const jacket = c.primary;
    const hood = mix(c.primary, "#000000", 0.14);
    const wire = "#c9d0d8";
    const wb = r2(0.95 / k);
    return (
      bail(u, r, st) +
      `<defs><clipPath id="${id}-pc"><circle r="${ri}"/></clipPath>` +
      `<clipPath id="${id}-hw"><rect x="0" y="0" width="200" height="166"/></clipPath><clipPath id="${id}-tw"><rect x="-10" y="0" width="220" height="236"/></clipPath>` +
      `<radialGradient id="${id}-pg" cx=".34" cy=".26" r=".9"><stop offset="0" stop-color="${mix(c.secondary, "#ffffff", 0.45)}"/><stop offset=".55" stop-color="${c.secondary}"/><stop offset="1" stop-color="${mix(c.secondary, "#6b6252", 0.28)}"/></radialGradient>` +
      `<clipPath id="${id}-pl"><rect x="${hx + 2}" y="-${r}" width="${2 * r}" height="${2 * r}"/></clipPath></defs>` +
      `<circle r="${r}" fill="url(#${st}-st)"/>` +
      `<circle r="${ri}" fill="url(#${id}-pg)"/>` +
      `<g clip-path="url(#${id}-pc)">` +
      // the jacket and its steel wire
      // (the bust ends at its chest line; the jacket runs on below it to the rim)
      `<g transform="${bodyT}"><path d="${A.torso}M2 236H198V330H2Z" fill="${jacket}"/><path d="${A.torso}" fill="none" stroke="${wire}" stroke-width="${wb}" stroke-linejoin="round" clip-path="url(#${id}-tw)"/><path d="M2 236V330M198 236V330" stroke="${wire}" stroke-width="${wb}"/></g>` +
      // the hood, a shade darker, wired down its sides only so it runs on into the jacket (no
      // bar across its foot), and its centre seam in cream enamel, turned with the head
      `<g transform="${hoodT}"><path d="${A.hood}" fill="${hood}"/>` +
      `<path d="${A.hood}" fill="none" stroke="${wire}" stroke-width="${wb}" stroke-linejoin="round" clip-path="url(#${id}-hw)"/>` +
      `<path d="M${118} 62C${126} 100 ${124} 140 ${116} 172" fill="none" stroke="${c.secondary}" stroke-width="${r2(1.15 / k)}" stroke-linecap="round"/></g>` +
      // the rim light, only along the lit side
      `<g clip-path="url(#${id}-pl)" fill="none" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke"><g transform="${bodyT}"><path d="${A.torso}" clip-path="url(#${id}-tw)"/><path d="M198 236V330"/></g><g transform="${hoodT}"><path d="${A.hood}" clip-path="url(#${id}-hw)"/></g></g>` +
      `</g>` +
      `<circle r="${ri}" fill="none" stroke="#0e1217" stroke-opacity=".55" stroke-width=".8"/>` +
      (thumb ? "" : `<path d="M${-ri + 3} ${-5}A${ri - 3} ${ri - 3} 0 0 1 ${-5} ${-ri + 3}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>`)
    );
  }

  // one ball per season played, the season engraved on its band (the sample has played one)
  function seasonBall(id, season, thumb, r, st) {
    const pent = (x, y, rad, rot) =>
      "M" +
      [0, 1, 2, 3, 4]
        .map((k) => {
          const a = (rot + k * 72 - 90) * DEG;
          return `${r2(x + rad * Math.cos(a))} ${r2(y + rad * Math.sin(a))}`;
        })
        .join("L") +
      "Z";
    const pr = r * 0.34;
    const cy = -r * 0.46;
    const outer = [-1, 1, 2, -2]
      .map((k) => {
        const a = (-90 + k * 72) * DEG;
        return pent(r2(r * 1.0 * Math.cos(a)), r2(cy + r * 1.05 * Math.sin(a) + r * 0.46), pr, k * 72 + 180);
      })
      .join("");
    const by0 = r2(-r * 0.12);
    const by1 = r2(r * 0.34);
    const band = `M${-r - 1} ${by0}Q0 ${r2(by0 + 3.4)} ${r + 1} ${by0}V${by1}Q0 ${r2(by1 + 3.4)} ${-r - 1} ${by1}Z`;
    const fs = r2(r * 0.34);
    return (
      `<defs><clipPath id="${id}-bc"><circle r="${r}"/></clipPath>` +
      `<radialGradient id="${id}-bl" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ece6da"/><stop offset="1" stop-color="#a9a296"/></radialGradient></defs>` +
      // the bail and its cap
      `<rect x="-3.2" y="${-r - 5}" width="6.4" height="6" rx="1.4" fill="url(#${st}-st)" stroke="#3a424b" stroke-width=".8"/>` +
      `<circle cy="${-r - 6}" r="3.2" fill="none" stroke="#3a424b" stroke-width="2.4"/><circle cy="${-r - 6}" r="3.2" fill="none" stroke="#c3cbd4" stroke-width="1.5"/>` +
      `<circle r="${r}" fill="url(#${id}-bl)"/>` +
      `<g clip-path="url(#${id}-bc)">` +
      `<path d="${pent(0, cy, pr, 0)}${outer}" fill="#262b32"/>` +
      `<g fill="none" stroke="#5f5a50" stroke-opacity=".7" stroke-width=".6">${[0, 1, 2, 3, 4]
        .map((k) => {
          const a = (k * 72 - 90) * DEG;
          return `<path d="M${r2(pr * Math.cos(a))} ${r2(cy + pr * Math.sin(a))}L${r2(pr * 2.2 * Math.cos(a))} ${r2(cy + pr * 2.2 * Math.sin(a))}"/>`;
        })
        .join("")}</g>` +
      // the band: polished steel round the equator, the season engraved in it
      `<path d="${band}" fill="url(#${st}-st)"/>` +
      `<path d="M${-r - 1} ${by0}Q0 ${r2(by0 + 3.4)} ${r + 1} ${by0}" fill="none" stroke="#2f363e" stroke-width=".8"/>` +
      `<path d="M${-r - 1} ${by1}Q0 ${r2(by1 + 3.4)} ${r + 1} ${by1}" fill="none" stroke="#2f363e" stroke-width=".8"/>` +
      (thumb ? "" : `<text x="0" y="${r2((by0 + by1) / 2 + 1.6 + 0.36 * fs)}" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${fs}" letter-spacing=".2" fill="#151a20">${esc(season)}</text>`) +
      `</g>` +
      `<circle r="${r}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>`
    );
  }

  // the bead chain the season balls hang on
  function beadChain(B, thumb) {
    const C = [B[0] * 0.05, B[1] * 0.6];
    const q = (t) => [(1 - t) ** 2 * 0 + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) ** 2 * 0 + 2 * (1 - t) * t * C[1] + t * t * B[1]];
    const pts = [];
    let last = [0, 0];
    let acc = 0;
    for (let i = 1; i <= 200; i++) {
      const pt = q(i / 200);
      acc += Math.hypot(pt[0] - last[0], pt[1] - last[1]);
      last = pt;
      if (acc >= 4.6) {
        pts.push(pt);
        acc = 0;
      }
    }
    const d = `M0 0Q${r2(C[0])} ${r2(C[1])} ${r2(B[0])} ${r2(B[1])}`;
    return (
      `<path d="${d}" fill="none" stroke="#545c66" stroke-width=".9"/>` +
      pts
        .slice(0, -1)
        .map(
          (pt) =>
            `<circle cx="${r2(pt[0])}" cy="${r2(pt[1])}" r="2.05" fill="#8b949e"/>` +
            (thumb ? "" : `<circle cx="${r2(pt[0] - 0.6)}" cy="${r2(pt[1] - 0.6)}" r=".8" fill="#eef2f6"/>`),
        )
        .join("")
    );
  }

  function charms(p, o, id, J, thumb) {
    const c = p.club;
    const av = CH.av;
    const cl = CH.cl;
    const ba = CH.ba;
    const uA = unit(-av.x, -av.y);
    const uC = unit(-cl.x, -cl.y);
    const bA = [av.x + uA[0] * (av.r + 2.2), av.y + uA[1] * (av.r + 2.2)];
    const bC = [cl.x + uC[0] * (cl.r + 2.2), cl.y + uC[1] * (cl.r + 2.2)];
    const season = String(p.season || "");
    return (
      `<g transform="translate(${J[0]} ${J[1]})"><g class="c03v2-sw">` +
      link(bA) +
      `<g transform="translate(${av.x} ${av.y})">${avatarPin(id + "p", c, thumb, av.r, uA, id)}</g>` +
      beadChain([ba.x, ba.y - ba.r - 9], thumb) +
      `<g transform="translate(${ba.x} ${ba.y})">${seasonBall(id + "b", season, thumb, ba.r, id)}</g>` +
      link(bC) +
      `<g transform="translate(${cl.x} ${cl.y})">${clubDisc(id, c, thumb, cl.r, uC)}</g>` +
      // the jump rings, bunched on the split ring
      `<circle r="4.4" fill="none" stroke="#2f363e" stroke-width="3"/><circle r="4.4" fill="none" stroke="url(#${id}-st)" stroke-width="2"/>` +
      `</g></g>`
    );
  }

  /* ------------------------------------------------------------ LEGEND's carabiner */
  const CAR = "M13 -14L13 -58C13 -70 7 -76 -1 -76C-10 -76 -15 -69 -15 -58L-12 -14C-12 -5 -6 0 0 0C7 0 13 -6 13 -14Z";
  function carabiner(id, at, rot, sc, part, lite) {
    const body =
      `<path d="${CAR}" fill="none" stroke="#2f363e" stroke-width="12" stroke-linejoin="round"/>` +
      `<path d="${CAR}" fill="none" stroke="#b9c2cc" stroke-width="8" stroke-linejoin="round"/>` +
      (lite
        ? ""
        : `<path d="${CAR}" fill="none" stroke="#7d8792" stroke-width="1.6" transform="translate(2.2 1.2)"/>` +
          `<path d="${CAR}" fill="none" stroke="#fff" stroke-width="1.6" transform="translate(-2.2 -1.2)"/>` +
          // the gate: hinge gap at the bottom, knurled locking sleeve at the top
          `<path d="M-12.6 -21L-11.4 -19" stroke="#2f363e" stroke-width="2.2"/>` +
          `<path d="M-14.8 -55.5L-13.5 -40" stroke="#2f363e" stroke-width="12.6"/><path d="M-14.8 -55.5L-13.5 -40" stroke="#9aa4af" stroke-width="9"/>` +
          [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${r2(-19 + i * 0.11)} ${r2(-54 + i * 2.6)}h9.8" stroke="#2f363e" stroke-width="1.1"/>`).join("") +
          `<path d="M-18.4 -55V-41" stroke="#fff" stroke-opacity=".75" stroke-width="1"/>`);
    const tf = `translate(${at[0]} ${at[1]}) rotate(${rot}) scale(${sc})`;
    if (part === "front") return `<g transform="${tf}"><clipPath id="${id}-cf"><rect x="-30" y="-26" width="29" height="34"/></clipPath><g clip-path="url(#${id}-cf)">${body}</g></g>`;
    return `<g transform="${tf}">${body}</g>`;
  }

  /* ------------------------------------------------------------ the whole object */
  function art(p, o, id, opts = {}) {
    const thumb = !!o.thumb;
    const tk = tierOf(p);
    const c = p.club;
    const founder = !!p.founder;
    const F = FACE[tk](id, c, thumb);
    const defs = defsCommon(id, founder) + F.defs + `<path id="${id}-rp" d="${idArc((F.lay && F.lay.idR) || L.idR)}"/>`;
    const cb = founder ? CB.sq : CB.rn;
    const ringS = ring(p, o, id, thumb);
    const reId = (s, k) => s.replace(/id="[^"]*-cw"/, `id="${id}-cw${k}"`).replace(new RegExp(`url\\(#${id}-cw\\)`, "g"), `url(#${id}-cw${k})`);
    const back =
      (tk === "LEGEND" ? carabiner(id, cb.at, cb.rot, 0.92, "back", thumb) : "") +
      ringS +
      (tk === "LEGEND" ? carabiner(id, cb.at, cb.rot, 0.92, "front", thumb) : "") +
      `<g class="c03v2-charms">${charms(p, o, id, founder ? JR.sq : JR.rn, thumb)}</g>`;
    // smoked resin: the ring behind the tag shows faintly through it
    const see = F.seeThrough && !thumb ? `<g clip-path="url(#${id}-fc)" opacity=".2">${reId(ringS, 3)}</g>` : "";
    const fob =
      `<g class="c03v2-fob">` +
      F.under +
      F.body +
      see +
      F.band +
      engraving(p, o, id, F, thumb) +
      `<path class="c03v2-rim" d="${tagD(0)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      `</g>`;
    // the band runs over the tag's top and dives through the eyelet
    const front = `<g clip-path="url(#${id}-fr)">${reId(ringS, 2)}</g>`;
    const body = back + (opts.swing ? `<g transform="rotate(${opts.swing} ${EY.x} ${EY.y})">${fob}</g>` : fob) + front;
    return { defs, body, back, fob, front };
  }

  /* ------------------------------------------------------------ full card */
  function full(p, o = {}) {
    const S = MC.s(o);
    const id = MC.uid("c03v2");
    const A = art(p, o, id);
    return (
      `<div class="c03v2 c03v2-full c03v2--${String(p.tier).toLowerCase()}${o.thumb ? " is-thumb" : ""}" dir="${S.dir}"${MC.isAr(o) ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}"${o.motion ? ' data-motion="1"' : ""}>` +
      `<svg class="c03v2-art" viewBox="${VB}" direction="ltr" aria-hidden="true" focusable="false"><defs>${A.defs}</defs>${A.body}</svg>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ token (44–80px) */
  // Flat materials only: no filters at token size (fifty of these sit in one list). The tag keeps
  // its D, its eyelet and its band; the club disc hangs beside it so the club colour shows at 44px.
  const TOK = {
    HOMA: () => ({ face: "#a6b3c3", side: "#5c6878", band: "#8592a2", num: "#0e1319" }),
    STADE: (c) => ({ face: "#efe8d8", rim: "#a9b2bc", side: "#757e88", band: c.primary, num: "#1a2330" }),
    PRO: () => ({ face: "#14233c", glow: "#3f6aa1", side: "#2d4f7d", band: "#24395a", num: "#efe7d6" }),
    CHAMPION: () => ({ face: "#dde2e7", chamfer: "#f7f9fa", side: "#646d77", band: "#171c22", num: "#11161c" }),
    LEGEND: (c) => ({ face: c.primary, side: "#120e0b", band: mix(c.primary, "#000000", 0.4), num: paintOn(c.primary), stitch: "#f1e6d2" }),
  };
  const TVB = { x: 20, y: 34, w: 250, h: 448 };

  function bigToken(p, o, size) {
    const id = MC.uid("c03v2t");
    const tk = tierOf(p);
    const c = p.club;
    const T = TOK[tk](c);
    const founder = !!p.founder;
    const HR = 15;
    const TF = tagD(0) + holeD(HR);
    const bandClip = `<clipPath id="${id}-bd"><path d="${tagD(T.rim ? 7 : 0)}"/></clipPath>`;
    let face = `<path d="${faceD(5)}" fill-rule="evenodd" fill="${T.side}"/><path class="c03v2-rim" d="${tagD(0, 5)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if (T.rim) face += `<path d="${TF}" fill-rule="evenodd" fill="${T.rim}"/><path d="${tagD(7)}${holeD(HR + 5)}" fill-rule="evenodd" fill="${T.face}"/>`;
    else face += `<path d="${TF}" fill-rule="evenodd" fill="${T.face}"/>`;
    if (T.glow) face += `<path d="${tagD(4)}" fill="none" stroke="${T.glow}" stroke-width="8" stroke-opacity=".55"/>`;
    if (T.chamfer) face += `<path d="${tagD(3)}" fill="none" stroke="${T.chamfer}" stroke-width="5"/><path d="${tagD(6)}" fill="none" stroke="#7d8792" stroke-width="1.6"/>`;
    face += `<g clip-path="url(#${id}-bd)"><rect x="20" y="${L.bandY - 4}" width="180" height="${L.bandH + 10}" fill="${T.band}"/></g>`;
    // LEGEND: a heavy cream stitched border, thick enough to survive at 44px
    if (T.stitch) face += `<path d="${tagD(11)}" fill="none" stroke="${T.stitch}" stroke-width="9" stroke-dasharray="17 10" stroke-linecap="round"/>`;
    const ringS = founder
      ? `<g transform="translate(${SQ.x} ${SQ.y}) rotate(${TILT})"><path d="${rrect(SQB.ho + 2, SQB.ro + 2)}${rrect(SQB.hi - 3, SQB.ri)}" fill-rule="evenodd" fill="url(#${id}-rg)"/><path class="c03v2-rimr" d="${rrect(SQB.ho + 2, SQB.ro + 2)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`
      : `<g transform="translate(${RN.x} ${RN.y})"><path d="${circ(42)}${circ(27)}" fill-rule="evenodd" fill="url(#${id}-rg)"/><path class="c03v2-rimr" d="${circ(42)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`;
    // the club disc, bigger than on the card so its two colours read at 44px
    const J = founder ? JR.sq : JR.rn;
    const DR = 42;
    const D = [J[0] + 40, J[1] + 50];
    const ini = String(c.initials || "");
    const dfs = DR * 0.8;
    const dx = inkX(ini, dfs, D[0]);
    const disc =
      `<path d="M${J[0]} ${J[1]}L${r2(D[0] - DR * 0.6)} ${r2(D[1] - DR * 0.72)}" stroke="#a9b2be" stroke-width="7" stroke-linecap="round"/>` +
      `<circle cx="${r2(D[0])}" cy="${r2(D[1])}" r="${DR}" fill="${c.secondary}"/>` +
      `<circle cx="${r2(D[0])}" cy="${r2(D[1])}" r="${DR - 8}" fill="${c.primary}"/>` +
      `<path class="c03v2-rimr" d="M${r2(D[0] + DR)} ${r2(D[1])}A${DR} ${DR} 0 1 0 ${r2(D[0] - DR)} ${r2(D[1])}A${DR} ${DR} 0 1 0 ${r2(D[0] + DR)} ${r2(D[1])}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      (size >= 64 ? `<text x="${dx != null ? dx : D[0]}" y="${r2(D[1] + 0.32 * dfs)}"${dx != null ? "" : ' text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${r2(dfs)}" fill="${c.secondary}">${esc(ini)}</text>` : "") +
      `<circle cx="${J[0]}" cy="${J[1]}" r="6" fill="none" stroke="#a9b2be" stroke-width="4"/>`;
    const cb = founder ? { at: sqW(-26, -26), rot: -30 } : { at: rnW(-100, 27), rot: -14 };
    const carab = tk === "LEGEND" ? carabiner(id, cb.at, cb.rot, 0.64, "back", true) : "";
    const n = String(p.ovr);
    // LEGEND's 84 sits inside its stitched border, never on it
    const nfs = p.ovr >= 100 ? (T.stitch ? 70 : 78) : T.stitch ? 97 : 110;
    const nx = inkX(n, nfs, G.cx);
    const ny = T.stitch ? 431 : 440;
    const defs =
      (founder
        ? `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-44" y1="-44" x2="44" y2="44"><stop offset="0" stop-color="#9db0ca"/><stop offset=".45" stop-color="#3a4e6b"/><stop offset=".7" stop-color="#7a92b4"/><stop offset="1" stop-color="#2c3d55"/></linearGradient>`
        : `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-44" y1="-44" x2="44" y2="44"><stop offset="0" stop-color="#eef1f4"/><stop offset=".45" stop-color="#8d97a3"/><stop offset=".7" stop-color="#d5dbe1"/><stop offset="1" stop-color="#7b8592"/></linearGradient>`) +
      bandClip;
    return (
      `<svg viewBox="${TVB.x} ${TVB.y} ${TVB.w} ${TVB.h}" width="${r2((size * TVB.w) / TVB.h)}" height="${size}" direction="ltr" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      carab +
      ringS +
      (size >= 44 ? disc : "") +
      face +
      `<path class="c03v2-rim" d="${tagD(0)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      `<text x="${nx != null ? nx : G.cx}" y="${ny}" ${nx != null ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${nfs}" fill="${T.num}">${esc(n)}</text>` +
      `</svg>`
    );
  }

  /* ------------------------------------------------------------ mini (24–32px) */
  // No hole, no crest, no stats: the capsule with its D, the 84 across 90% of its width, the band
  // in the tier's material, and the ring at the top-end (square = founder). LEGEND adds the
  // carabiner, which changes the outline. The mini relaxes the capsule to 1:1.85 so the 84 can
  // be read in a ranking row's name cell.
  const GMI = { cx: 6.5, top: 0.2, hw: 6.5, H: 24, rb: 3.4, c: 3.4, dep: 2 };
  const MV = { x: -0.7, y: -0.9, w: 22, h: 25.8 };
  function miniToken(p, o, size) {
    const tk = tierOf(p);
    const c = p.club;
    const T = TOK[tk](c);
    const founder = !!p.founder;
    const MP = (d = 0, oy = 0) => tagG(GMI, d, oy);
    const bandY = 6.9;
    const mid = MC.uid("c03v2m");
    let face = `<path d="${MP(0, 0.7)}" fill="${T.side}"/>`;
    if (T.rim) face += `<path d="${MP()}" fill="${T.rim}"/><path d="${MP(0.75)}" fill="${T.face}"/>`;
    else face += `<path d="${MP()}" fill="${T.face}"/>`;
    face += `<clipPath id="${mid}-b"><path d="${MP(T.rim ? 0.75 : 0)}"/></clipPath><rect x="0" y="${bandY}" width="13" height="2.1" fill="${T.band}" clip-path="url(#${mid}-b)"/>`;
    if (T.glow) face += `<path d="${MP(0.5)}" fill="none" stroke="${T.glow}" stroke-width=".8"/>`;
    if (T.chamfer) face += `<path d="${MP(0.45)}" fill="none" stroke="#fff" stroke-width=".7"/>`;
    // LEGEND: the heavy cream saddle stitch round the outline, about 1px at 24px
    if (T.stitch) face += `<path d="${MP(0.62)}" fill="none" stroke="${T.stitch}" stroke-width=".88" stroke-dasharray="1.75 .8"/>`;
    // the ring at the top-end, threaded over the tag's shoulder
    const RC = { x: 12.3, y: 4.5 };
    const ringS = founder
      ? `<g transform="translate(${RC.x} ${RC.y}) rotate(${TILT})"><path class="c03v2-mr" d="${rrect(3.35, 1.2)}" fill="none" stroke-width="1.45"/></g>`
      : `<circle class="c03v2-mr" cx="${RC.x}" cy="${RC.y}" r="3.2" fill="none" stroke-width="1.35"/>`;
    // LEGEND: a D carabiner clipped to the ring's top-end corner, standing out to the side
    const carab =
      tk === "LEGEND"
        ? `<g transform="translate(15.6 2.3) rotate(58)"><path class="c03v2-mc" d="M1.5 -1.1V-3.6C1.5 -4.5 .8 -5 0 -5C-.8 -5 -1.5 -4.5 -1.5 -3.6L-1.3 -1.1C-1.3 -.4 -.6 0 0 0C.7 0 1.5 -.4 1.5 -1.1Z" fill="none" stroke-width="1.3"/></g>`
        : "";
    const n = String(p.ovr);
    // the 84 spans 90% of the tag (80% inside LEGEND's stitching, which it must not touch)
    const fs = p.ovr >= 100 ? 7.2 : T.stitch ? 8.2 : 9.4;
    const nx = inkX(n, fs, GMI.cx);
    const ny = T.stitch ? 20.6 : 21.2;
    return (
      `<svg viewBox="${MV.x} ${MV.y} ${MV.w} ${MV.h}" width="${r2((size * MV.w) / MV.h)}" height="${size}" direction="ltr" aria-hidden="true" focusable="false">` +
      face +
      `<path class="c03v2-rim" d="${MP()}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      `<text x="${nx != null ? nx : GMI.cx}" y="${ny}" ${nx != null ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" fill="${T.num}">${esc(n)}</text>` +
      carab +
      ringS +
      `</svg>`
    );
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = o.mini || size <= 32;
    const S = MC.s(o);
    return (
      `<span class="c03v2 c03v2-tok${mini ? " is-mini" : ""}" role="img" aria-label="${esc(`${MC.nameOf(p, o)}, ${p.ovr} ${S.ovr}, ${S.tiers[p.tier]}${p.founder ? ", " + S.founderLine : ""}`)}" data-tier="${p.tier}">` +
      (mini ? miniToken(p, o, size) : bigToken(p, o, size)) +
      `</span>`
    );
  }

  /* ------------------------------------------------------------ row: the "My position" compact card */
  // the tier cue beside the tier word: a small tag in the tier's material, with its D
  function tierSwatch(p) {
    const T = TOK[tierOf(p)](p.club);
    const g = { cx: 5, top: 0.5, hw: 4.5, H: 14, rb: 2.2, c: 2.2, dep: 1.3 };
    return (
      `<svg class="c03v2-pg" viewBox="0 0 10 16" width="8.75" height="14" aria-hidden="true">` +
      `<path d="${tagG(g, 0, 0.9)}" fill="${T.side}"/>` +
      `<path d="${tagG(g)}" fill="${T.rim || T.face}"/>` +
      (T.rim ? `<path d="${tagG(g, 0.7)}" fill="${T.face}"/>` : "") +
      `<rect x="0" y="4.4" width="10" height="1.6" fill="${T.band}"/>` +
      (T.stitch ? `<path d="${tagG(g, 0.95)}" fill="none" stroke="${T.stitch}" stroke-width=".9" stroke-dasharray="1.4 .7"/>` : "") +
      `<path class="c03v2-rim" d="${tagG(g)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      `</svg>`
    );
  }
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const yr = p.founder ? String(p.founder).slice(2) : "";
    const yy = yr ? (ar ? yr + "·" : "·" + yr) : "";
    return (
      `<div class="c03v2 c03v2-row${o.me ? " is-me" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} data-tier="${p.tier}">` +
      `<span class="c03v2-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c03v2-rt">${token(p, { ...o, size: 56, mini: false })}</span>` +
      `<span class="c03v2-rn"><b><span class="c03v2-rnm">${esc(MC.nameOf(p, o))}</span>${yy ? `<i>${MC.ltr(yy)}</i>` : ""}</b>` +
      `<small>${tierSwatch(p)}<span>${esc(S.tiers[p.tier])}</span></small></span>` +
      `<span class="c03v2-rp"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ share: "Sur mon sac" */
  // The keyring clipped to a backpack's zip pull, the whole tag and ring inside a 24px safe
  // margin, the tag hanging within 12deg of upright.
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid("c03v2s");
    const founder = !!p.founder;
    // Hung from the zip pull: the ring's top corner passes through the pull's slot, the ring
    // turns a little and the tag swings back toward upright under it. LEGEND's carabiner clips
    // through the slot instead and the ring hangs from the carabiner, so the whole object drops
    // by the carabiner's length; it hangs nearly straight and a little smaller to stay inside the
    // 24px margin and 16px clear of the woven label.
    const legend = tierOf(p) === "LEGEND";
    const cb = founder ? CB.sq : CB.rn;
    let hook;
    if (legend) {
      const a = cb.rot * DEG;
      const lx = -1 * 0.92;
      const ly = -71 * 0.92;
      hook = [r2(cb.at[0] + lx * Math.cos(a) - ly * Math.sin(a)), r2(cb.at[1] + lx * Math.sin(a) + ly * Math.cos(a))];
    } else hook = founder ? sqW(-36.5, -36.5) : rnW(235, 35);
    const whole = legend ? -4 : founder ? -14 : -7;
    const swing = legend ? 2 : 5;
    const A = art(p, { ...o, thumb: false }, id + "a");
    const A2 = art(p, { ...o, thumb: true }, id + "b");
    const sc = legend ? 1.0 : 1.1;
    const H = legend ? { x: 156, y: 86 } : { x: 152, y: 86 };
    const ringT = `translate(${H.x} ${H.y}) scale(${sc}) rotate(${whole}) translate(${r2(-hook[0])} ${r2(-hook[1])})`;
    const fobT = `${ringT} rotate(${swing} ${EY.x} ${EY.y})`;
    const obj = (X, pre) => `<g transform="${pre}${ringT}">${X.back}</g><g transform="${pre}${fobT}">${X.fob}</g><g transform="${pre}${ringT}">${X.front}</g>`;
    const handle = "@" + String(p.key || p.name.lat).toLowerCase();
    const yr = p.founder ? String(p.founder).slice(2) : "";
    const yy = yr ? (ar ? yr + "·" : "·" + yr) : "";
    // the strap crosses the top-end corner; the wordmark sits in the top-start corner
    const strap = ar ? "translate(-30 130) rotate(-45)" : "translate(230 -40) rotate(45)";
    const pocket = "M-10 78Q180 26 370 78";
    const bg =
      `<svg class="c03v2-sh-bg" viewBox="0 0 360 640" width="360" height="640" direction="ltr" aria-hidden="true" focusable="false"><defs>` +
      A.defs +
      A2.defs +
      `<pattern id="${id}-wv" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><rect width="3.2" height="3.2" fill="#383c43"/><rect width="3.2" height="1.3" fill="#42464e"/><rect y="1.6" width="1.3" height="1.6" fill="#3e424a"/></pattern>` +
      `<pattern id="${id}-wu" width="3.6" height="3.6" patternUnits="userSpaceOnUse"><rect width="3.6" height="3.6" fill="#26292e"/><rect width="1.5" height="3.6" fill="#2e3137"/><rect y="1.8" width="3.6" height="1" fill="#2a2d32"/></pattern>` +
      `<pattern id="${id}-wb" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="3" fill="${p.club.primary}"/><rect width="4" height="1.2" fill="${mix(p.club.primary, "#ffffff", 0.12)}"/></pattern>` +
      `<filter id="${id}-gr" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 -.18"/></filter>` +
      `<radialGradient id="${id}-lt" gradientUnits="userSpaceOnUse" cx="${ar ? 300 : 60}" cy="90" r="430"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>` +
      `<linearGradient id="${id}-gu" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${id}-gv" x1="1" x2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<filter id="${id}-cs" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feFlood flood-color="#000" flood-opacity=".6"/><feComposite in2="SourceAlpha" operator="in"/><feGaussianBlur stdDeviation="3"/></filter>` +
      `<linearGradient id="${id}-zp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa1aa"/><stop offset=".45" stop-color="#3d4248"/><stop offset="1" stop-color="#22252a"/></linearGradient>` +
      `<clipPath id="${id}-pk"><path d="${pocket}V700H-10Z"/></clipPath>` +
      `</defs>` +
      // the bag's main panel, then the front pocket with its curved, piped top and zip
      `<rect width="360" height="640" fill="url(#${id}-wu)"/>` +
      `<g clip-path="url(#${id}-pk)"><rect width="360" height="640" fill="url(#${id}-wv)"/><rect width="360" height="640" filter="url(#${id}-gr)" opacity=".45"/>` +
      `<path d="M-10 92Q180 40 370 92" fill="none" stroke="#1a1c1f" stroke-width="16"/>` +
      `<path d="M-10 92Q180 40 370 92" fill="none" stroke="#4a4e55" stroke-width="6" stroke-dasharray="2 1.7"/>` +
      `<path d="M-10 92Q180 40 370 92" fill="none" stroke="#6d727a" stroke-width="1" stroke-dasharray="2 1.7" transform="translate(0 -2)"/>` +
      `<path d="M-10 106Q180 54 370 106" fill="none" stroke="#7d8189" stroke-width="1" stroke-dasharray="4 3"/></g>` +
      `<path d="${pocket}" fill="none" stroke="#141518" stroke-width="5"/><path d="${pocket}" fill="none" stroke="#3a3d43" stroke-width="3"/><path d="${pocket}" fill="none" stroke="#6a6e75" stroke-width=".9" transform="translate(0 -.9)"/>` +
      // side gussets, darker and turning away from the light
      `<rect width="20" height="640" fill="url(#${id}-gu)"/><path d="M20 0V640" stroke="#7d8189" stroke-width="1" stroke-dasharray="4 3" opacity=".7"/>` +
      `<rect x="340" width="20" height="640" fill="url(#${id}-gv)"/><path d="M340 0V640" stroke="#7d8189" stroke-width="1" stroke-dasharray="4 3" opacity=".7"/>` +
      // a webbing strap in the club colours across the top-end corner
      `<g transform="${strap}"><rect x="-40" y="-17" width="260" height="34" fill="url(#${id}-wb)"/><rect x="-40" y="-17" width="260" height="4" fill="${p.club.secondary}"/><rect x="-40" y="13" width="260" height="4" fill="${p.club.secondary}"/><rect x="-40" y="-17" width="260" height="34" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1"/><path d="M-40 -10H220M-40 10H220" stroke="#000" stroke-opacity=".25" stroke-width="1" stroke-dasharray="3 2.4"/></g>` +
      `<rect width="360" height="640" fill="url(#${id}-lt)"/>` +
      // the keyring, its cast shadow thrown down-end by the top-start light
      `<g filter="url(#${id}-cs)">${obj(A2, "translate(12 16) ")}</g>` +
      `<g class="c03v2-shobj">${obj(A, "")}</g>` +
      // the zip slider and its pull tab; the ring passes through the tab's slot
      `<g transform="translate(${H.x} 66.3)">` +
      `<rect x="-14" y="-10" width="28" height="18" rx="5" fill="url(#${id}-zp)" stroke="#16181b" stroke-width="1"/>` +
      `<path d="M-12 -8H12" stroke="#fff" stroke-opacity=".4" stroke-width="1"/>` +
      `<path d="M-7 2H7V26A6 6 0 0 1 1 32H-1A6 6 0 0 1 -7 26ZM-3.6 14V22A3 3 0 0 0 -.6 25H.6A3 3 0 0 0 3.6 22V14A3 3 0 0 0 .6 11H-.6A3 3 0 0 0 -3.6 14Z" fill-rule="evenodd" fill="url(#${id}-zp)" stroke="#16181b" stroke-width="1"/>` +
      `<path d="M-5.6 4V25" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>` +
      `</g>` +
      `</svg>`;
    const label =
      `<div class="c03v2-sh-tag">` +
      `<div class="c03v2-sh-name"><b>${esc(MC.nameOf(p, o))}</b>${yy ? `<i>${MC.ltr(yy)}</i>` : ""}</div>` +
      `<div class="c03v2-sh-meta"><span class="c03v2-sh-h">${MC.ltr(handle)}</span><em>${ar ? "مثال" : "Exemple"}</em></div>` +
      `</div>`;
    return (
      `<div class="c03v2 c03v2-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c03v2-sh-logo">${MC.logo("wordmark", { variant: "light" })}</div>` +
      label +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ interaction: swing it */
  function mount(el) {
    if (!el || !el.querySelector) return;
    try {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch (e) {
      return;
    }
    const fob = el.querySelector(".c03v2-fob");
    const sw = [...el.querySelectorAll(".c03v2-sw")];
    if (!fob) return;
    const heavy = el.dataset.tier === "LEGEND";
    let th = 0;
    let v = 0;
    let raf = 0;
    let drag = null;
    const set = () => {
      fob.style.transform = `rotate(${th}deg)`;
      sw.forEach((g) => (g.style.transform = `rotate(${-th * 0.8}deg)`));
    };
    const step = () => {
      const k = heavy ? 0.018 : 0.03;
      const c = heavy ? 0.06 : 0.075;
      v += -k * th - c * v;
      th += v;
      set();
      if (Math.abs(th) > 0.05 || Math.abs(v) > 0.05) raf = requestAnimationFrame(step);
      else {
        th = 0;
        v = 0;
        set();
      }
    };
    el.addEventListener("pointerdown", (e) => {
      // the first touch ends any settle still running, so the hand takes over at once
      el.classList.add("is-held");
      drag = { x: e.clientX, th0: th };
      cancelAnimationFrame(raf);
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const w = el.getBoundingClientRect().width || 300;
      th = Math.max(-20, Math.min(20, drag.th0 - ((e.clientX - drag.x) / w) * 60));
      set();
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      v = 0;
      raf = requestAnimationFrame(step);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  /* ------------------------------------------------------------ registration */
  MC.register({
    id: "c03-v2",
    n: 3,
    refinedFrom: "c03",
    slug: "03r",
    name: "Porte-clés",
    nameAr: "علّاقة المفاتيح",
    category: "safe",
    philosophy:
      "Your BotolaGO identity is the tag on your keyring: a dressing-room locker key tag cut with the penalty-area D, your 84 engraved low where its weight hangs, on a ring only 2026 founders have squared, with your club and every season you play hanging from it.",
    philosophyAr:
      "هويتك في BotolaGO هي البطاقة المعلّقة في حلقة مفاتيحك: بطاقة مفتاح خزانة في غرفة الملابس، مقطوعة بقوس منطقة الجزاء، ورقم 84 محفور في أسفلها حيث يتدلّى ثقلها، على حلقة مربّعة لا يحملها إلا مؤسسو 2026، وتتدلّى منها شارة ناديك وكرة عن كل موسم تلعبه.",
    idea: [
      "Not a card. The identity is a dressing-room locker key tag: an elongated 1:2.3 capsule with an eyelet at the top, the tag every player has worn on a wrist or hung on a hook before a match. Its bottom edge is cut with the penalty-area D, a quarter as deep as it is wide like the real arc. That one football cut turns a hotel or riad key into a vestiaire key, and it survives as a black silhouette at 24px.",
      "The layout follows the hanging object, top to bottom: the club crest, a moulded band carrying the tier across the tag, an aligned four-row stat table about as wide as the name line (LEGEND's is sized to its hexagon panel), the name with its founder year, then the 84 low in the tag where the weight hangs. The return line (BOT #004821 · MOROCCO) is engraved along the D, like the arc's own marking.",
      "The ring is your football history. Its charms are football's own: a club disc in your club's colours (initials only), the enamel pin of the manager hung behind it, and one ball for each season played, with the season engraved on its steel band. ALI has played one season, 2026/27, so he carries one ball.",
      "Every tier is the same tag in a better material, and each step is visibly better than the last: light bead-blasted aluminium, vitreous enamel on steel, smoked translucent resin, machined steel, and finally padded, hand-stitched match-ball leather in the club's colour. There is no brass or gold anywhere.",
    ],
    belonging: [
      "'Show me your ring.' A founder's ring is square and every later cohort's is round, so you can spot a 2026 founder across a leaderboard without reading a word. Nobody can get that ring again.",
      "Charms only ever add: a new ball for every season you play, each engraved with its season. A five-season manager's ring is visibly heavier than a newcomer's, and nothing on it can be bought.",
      "Your club is on the object twice, as a disc in its colours on the ring and as the crest at the top of the tag. Allegiance is built into the object rather than stuck on.",
      "Teenagers want the stitched leather and the carabiner; adults respect machined steel and enamel. Neither looks like a game skin, so it stays wearable for the 35-year-old Fantasy veteran and covetable at 15.",
      "The screenshot value comes from the object. A keyring clipped to your bag, the whole tag in frame, is a photo people already take, and the share image is that photo.",
    ],
    founderMark: [
      "The founder mark changes the object itself. The split ring is forged as a rounded square in blued steel, the only square ring the system will ever issue. Later cohorts get round rings in plain steel.",
      "FOUNDER is stamped along the ring's top bar, upright enough to read at arm's length, and 2026 runs down its end bar, both bright steel through the bluing. In Arabic the top bar reads عضو مؤسس in Noto Sans Arabic 700, at a legible size and with no letter-spacing. The name carries the year the way supporter groups carry theirs: ALI ·26.",
      "The ring never changes with tier. At LEGEND the carabiner hooks through that same ring.",
      "At 24px the ring is a 6px square stroke at the tag's top-end corner, where everyone else has a circle.",
    ],
    small: [
      "44–80px: the tag with its D, its eyelet and its tier band in flat tier colours. The 84 spans 90% of the tag's width, the ring is square or round, and the club disc hangs beside the tag in the club's two colours, with initials from 64px. LEGEND adds a heavy cream stitched border with its 84 inside it. No filters.",
      "24–32px: no hole, crest or stats. The capsule relaxes to 1:1.85 so the 84 can fill 90% of its width in Changa 800 (80% inside LEGEND's stitching). At this size the D is only a shallow dip, so the founder square and the 84 carry the identity. The tier reads from the material's value as much as its colour: light slate with a dark 84, cream, navy, bright steel with a black band, or dark club-colour leather inside a cream stitched border. The founder sign is the square ring at the top-end corner, and LEGEND adds a carabiner that changes the outline.",
      "The silhouette is a capsule with an eyelet, a D cut in its bottom and a ring at the top-end: a locker tag, not a bulb or a bomb.",
    ],
    rtl: [
      "The tag is a physical object, so it never mirrors: the ring stays at the same corner and the charms hang where they hang. Only the engraving changes script.",
      "علي is set in Changa 800 at the same size as ALI, with 26· to its left. The stat table puts each Arabic label (القائد، التشكيلة، الانتقالات، الثبات) at the right edge and its figure at the left edge, with the figures aligned and kept left-to-right. The tier band reads محترف and the others in Noto Sans Arabic 700. No Arabic run has letter-spacing.",
      "The ring reads عضو مؤسس along its top bar and 2026 down its end bar. The D carries المغرب · BOT #004821 right to left, with the code kept left-to-right.",
    ],
    tiers: {
      HOMA: "Fresh anodised aluminium in a light slate, bead-blasted to a fine matte, with a soft edge break. Every mark is laser-etched dark, the crest is etched in line, and the band is a machined flat a step down. Raw but new: the full outline with nothing missing, and light in value so it can never be mistaken for LEGEND's dark leather.",
      STADE: "Cream vitreous enamel fired on a pressed steel blank, with a steel rim that follows the outline and the D. The tier band is the club colour fired between two raised steel wires, the crest is printed in the club's colours, and the type is fired black enamel.",
      PRO: "Clean smoked-navy translucent resin. Light enters at the edges so they glow, the visible edge thickness is a clearer, lighter navy, and the ring's hidden half shows faintly through the tag. The type is engraved and paint-filled cream, and the band is a frosted strip moulded into the resin.",
      CHAMPION: "Solid machined steel, brushed, with a polished chamfer round the outline and the eyelet. Every mark is engraved and paint-filled in black enamel. The band is a machined groove filled black with the tier in bare steel, and the crest is an enamel inlay.",
      LEGEND: "Hand-stitched leather in the club colour, cut in match-ball panels. A darker hexagon panel frames the stat table and nothing else; the name and the 84 sit on the plain lower panel. Every panel is padded and shaded into its seams, the seams are top-stitched in cream, the edge is burnished and painted, and two rows of heavy cream saddle stitch run round the outline. A taller strap of darker hide is sewn across for the tier, a steel grommet lines the eyelet, and every mark is debossed and paint-filled cream. A machined steel carabiner hooks through the ring. No precious metal.",
    },
    legend: [
      "LEGEND is the only tier that changes the outline. A machined D carabiner with a knurled locking sleeve hooks through the ring's top corner and stands above it, so even at 24px a LEGEND tag has a loop at its ring that nobody else's has.",
      "The material is the one every football fan wants to touch: padded match-ball leather in your club's colour, cut and stitched in ball panels, with a double cream saddle stitch round the edge. The stats stay on the front, framed by the hexagon panel.",
      "With motion on, the tag settles on the ring with a heavier, slower swing than any other tier, and the charms swing against it; a touch takes over at once and the tag can be swung by hand. The 84 is visible the whole time; the swing is a replay, never a reveal.",
    ],
    advantages: [
      "Instantly understood: a key tag needs no explanation and no gaming literacy, and the D makes it a football key.",
      "A silhouette no card game owns: a capsule with an eyelet, a D cut and a ring at the top-end, readable as a black shape at 24px.",
      "The founder mark is part of the outline (a square ring), the tier is the material, and the club is both a disc on the ring and a crest on the tag.",
      "Season history has an honest home: one ball for each season actually played, with nothing invented and nothing for sale.",
      "It is credible as physical merch at matches and rides the bag-charm trend, and nothing in it reads as money, betting or an access pass.",
    ],
    risks: [
      "A key implies access. Copy must never say accès, clé or 'unlock' beyond the concept's own name, and the share image shows a bag, never a door.",
      "The ring's history grows. Past five or six seasons the balls need a second strand or a smaller size, and that is not drawn yet.",
      "The club disc, the pin's jacket and LEGEND's leather all use the club's primary colour, so a club whose two colours are both dark needs a light keyline fallback. The placeholder club is slate, which keeps LEGEND's leather dark and quiet; its stitching, panels and carabiner carry the step up, and a real club colour would make it louder.",
      "At 24px the mini relaxes the capsule to 1:1.85 and the D becomes a shallow dip. There, the founder square and the 84 carry the identity, not the notch.",
      "The manager pin uses the shared figure seen from behind, so its three-quarter turn comes from turning the hood against the shoulders, an off-centre seam and the crop rather than a true profile. At the 200px tier strip it reads as a hooded head and one shoulder, not a detailed figure.",
      "LEGEND's hexagon is stretched across the tag (its top and bottom edges are longer than its sides): a regular hexagon wide enough to frame the table with clear margins would be taller than the gap between the strap and the name.",
      "Selling physical tags or rings would destroy the founder mark and look pay-to-win. Never.",
    ],
    refinementNotes: [
      {
        title: "Silhouette",
        items: [
          "The teardrop paddle (read as a hotel key, a bulb or a bomb) is now a dressing-room locker key tag: an elongated 1:2.3 capsule with a centred eyelet.",
          "Its bottom edge is cut with the penalty-area D, its depth a quarter of its chord. It is the only cut; nothing else was added.",
          "The squared split ring stays the founder sign, and LEGEND's carabiner still changes the outline.",
        ],
      },
      {
        title: "Football on the ring",
        items: [
          "The bell-like hood charm is gone. The ring carries a club disc in the club's colours (initials only), with the manager hung behind it as a cloisonné enamel pin: a cream enamel ground, the figure in a club-colour jacket with the hood a shade darker, steel wire round each field and no bar across the hood.",
          "The pin is cropped off-centre at the chest so the hood and one broad shoulder fill it, turned three-quarters with a cream hood seam set off-centre, a 1px rim light on its lit side only, and tucked behind the club disc so the charms overlap like a real keyring.",
          "One season ball hangs on a bead chain with 2026/27 engraved on its steel band, one per season played.",
        ],
      },
      {
        title: "Hierarchy and stats",
        items: [
          "Top to bottom: the crest (25% larger), a moulded band across the tag carrying the tier, the four-row stat table, ALI ·26, then the 84 low in the tag.",
          "Values are Manrope 700 with tabular figures, labels are 600 caps at 70%, and there are 1.5× line-height gaps between the table, the name and the 84. The name line is capped at 116u, 20u inside the outline, so long names step down in size instead of filling the tag.",
          "Arabic names are fitted by their ink: they sit 8u or more clear of the table and of the 84, moving the baseline first and the size only if they must.",
          "The return line, BOT #004821 · MOROCCO, rides the D instead of the bulb's rim. Small type gets a shallower recess than display type, so thin strokes are not swallowed by their own shadow.",
        ],
      },
      {
        title: "Material ladder",
        items: [
          "HOMA is light bead-blasted slate aluminium with dark etched type, so it is separated from LEGEND by value and material, not hue. STADE is cream enamel on steel. PRO is clean smoked-navy resin with a lit edge, replacing the muddy bakelite swirl. CHAMPION is solid machined steel with black paint-filled engraving, replacing the unfinished split two-tone.",
          "There is no brass or gold anywhere. Labels at 70% measure at least 4.5:1 on every material in both scripts, read from rasterised pixels (worst label on each): 4.8 HOMA, 5.4 STADE, 5.8 PRO, 6.3 CHAMPION, 4.7 LEGEND.",
        ],
      },
      {
        title: "LEGEND",
        items: [
          "Hand-stitched club-colour leather in ball panels, replacing the tan luxury leather. Every panel is padded and shaded into its seams, the edge is burnished and painted, and two rows of heavy cream saddle stitch run round the outline.",
          "The hexagon panel now frames the stat table only, with its top edge under the strap; the name and the 84 sit on the plain lower panel. Measured on every sample name in both scripts, no type comes within 11u of a seam, the stats start 8u under the strap, and names stay at least 11u inside the inner row of stitching.",
          "The strap is taller, so أسطورة clears both rows of its stitching. At 44–80px LEGEND keeps a heavy cream stitched border, and at 24–32px a cream stitched outline, so it reads at once as the top tier and never as HOMA.",
        ],
      },
      {
        title: "Founder ring",
        items: [
          "FOUNDER / عضو مؤسس moved to the top bar, upright enough to read. The Arabic is Noto Sans Arabic 700 at a legible size with no letter-spacing, no longer squashed down the side bar.",
          "2026 is stamped down the end bar, and ALI ·26 stays on the face.",
        ],
      },
      {
        title: "Small sizes, share and motion",
        items: [
          "Mini (24–32px): no hole, crest or stats. The 84 fills 90% of the tag width in Changa 800, the square ring stays at the top-end corner, and the tier material and its value carry the rest. Token (44px and up): the club disc hangs beside the tag in the club's two colours.",
          "Share: the whole object sits inside the 24px safe margin and at least 21px clear of the woven label, in every tier and both scripts. LEGEND's carabiner clips through the zip pull and the ring hangs from it, so it no longer touches the wordmark (29px clear) or floats free; the tag hangs 2° from upright, the others 2–9°.",
          "Motion: the settle no longer holds the tag after it ends, so drag-to-swing works with motion on, a touch during the settle takes over at once, and dragging no longer selects the card's text.",
        ],
      },
    ],
    gridWidth: 220,
    detailWidth: 360,
    full,
    token,
    row,
    share,
    mount,
  });
})();
