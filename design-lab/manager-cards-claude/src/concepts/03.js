/* 03 PORTE-CLÉS (safe). Your BotolaGO identity is the fob on your keyring: a long-necked
   paddle with your club's crest at the neck and your number engraved in the bulb like a room
   number, hung on a flat split ring that only 2026 founders have squared.
   One object, five materials: moulded PVC, acrylic with a printed insert, bakelite, hard
   enamel on nickel, and match-ball leather. The laminated edge under the bulb shows the
   tier as stacked plies (1 to 4), and one of those plies is always the club colour.
   The object never mirrors in Arabic; only its type does. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const r2 = (n) => Math.round(n * 100) / 100;
  const cub = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * t * (1 - t) ** 2 * b + 3 * t * t * (1 - t) * c + t ** 3 * d;

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

  /* ------------------------------------------------------------ text measuring */
  const F_BS = '800 100px "Big Shoulders Display"';
  const F_MR = "800 100px Manrope";
  const F_AR = '700 100px "Noto Sans Arabic"';
  const F_CH = "800 100px Changa";
  const F_CH6 = "600 100px Changa";
  try {
    if (document.fonts && document.fonts.load) {
      [F_BS, F_MR, F_CH, F_CH6].forEach((f) => document.fonts.load(f, "AZ09·#/"));
      [F_CH, F_AR].forEach((f) => document.fonts.load(f, "علي محترف"));
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
        return { w: m.width, l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight };
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
  function inkX(text, fs, cx) {
    const m = meas(F_CH, String(text));
    return m ? r2(cx - (((m.r - m.l) / 2) * fs) / 100) : null;
  }

  /* ------------------------------------------------------------ geometry (viewBox 0 -14 260 474) */
  // The headroom above the ring (y -14..48) is reserved on every tier so LEGEND's carabiner can
  // lengthen the outline without the fob shrinking; all five tiers stand on the same line.
  const VB = "0 -14 260 474";
  // The paddle: a long straight 56u neck (the fob tell), concave shoulders, a 184u bulb.
  const GM = { cx: 130, top: 90, nh: 28, ne: 168, bh: 92, by: 352, bot: 446 };
  function pearG(G, d = 0, oy = 0) {
    const r = r2(G.nh - d);
    const ac = G.top + G.nh;
    const L = r2(G.cx - G.nh + d);
    const R = r2(G.cx + G.nh - d);
    const BL = r2(G.cx - G.bh + d);
    const BR = r2(G.cx + G.bh - d);
    const c1 = G.ne + 0.35 * (G.by - G.ne);
    const c2 = G.by - 0.435 * (G.by - G.ne);
    const ry = r2(G.bot - G.by - d);
    const y = (v) => r2(v + oy);
    return (
      `M${G.cx} ${y(ac - r)}A${r} ${r} 0 0 1 ${R} ${y(ac)}L${R} ${y(G.ne)}` +
      `C${R} ${y(c1)} ${BR} ${y(c2)} ${BR} ${y(G.by)}A${r2(G.bh - d)} ${ry} 0 0 1 ${BL} ${y(G.by)}` +
      `C${BL} ${y(c2)} ${L} ${y(c1)} ${L} ${y(G.ne)}L${L} ${y(ac)}A${r} ${r} 0 0 1 ${G.cx} ${y(ac - r)}Z`
    );
  }
  const pearD = (d = 0, oy = 0) => pearG(GM, d, oy);
  /** Half-width of the paddle at height y (for fitting engraved text). */
  function halfW(y, G = GM) {
    const ac = G.top + G.nh;
    if (y <= G.top || y >= G.bot) return 0;
    if (y < ac) return Math.sqrt(Math.max(0, G.nh * G.nh - (ac - y) ** 2));
    if (y <= G.ne) return G.nh;
    if (y <= G.by) {
      const c1 = G.ne + 0.35 * (G.by - G.ne);
      const c2 = G.by - 0.435 * (G.by - G.ne);
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 28; i++) {
        const t = (lo + hi) / 2;
        if (cub(G.ne, c1, c2, G.by, t) < y) lo = t;
        else hi = t;
      }
      return cub(G.nh, G.nh, G.bh, G.bh, lo);
    }
    return G.bh * Math.sqrt(1 - ((y - G.by) / (G.bot - G.by)) ** 2);
  }
  const EY = { x: 130, y: 115, r: 12 };
  const holeD = (r = EY.r, oy = 0, c = EY) =>
    `M${c.x + r} ${r2(c.y + oy)}A${r} ${r} 0 1 0 ${c.x - r} ${r2(c.y + oy)}A${r} ${r} 0 1 0 ${c.x + r} ${r2(c.y + oy)}Z`;
  const faceD = (oy = 0) => pearD(0, oy) + holeD(EY.r, oy);

  // The split ring, 9u flat band. Founders: a rounded SQUARE tilted 18deg toward the inline end;
  // everyone else: a round ring. Its band passes 7u inside the eyelet's centre, so a crescent of
  // open hole always shows on the start side (a flat paddle with a hole is the fob tell).
  const TILT = 18;
  const COS = Math.cos((TILT * Math.PI) / 180);
  const SIN = Math.sin((TILT * Math.PI) / 180);
  const UV = [0.891, -0.454]; // from the eyelet toward the ring's centre
  const NV = [0.454, 0.891];
  const SQ = { x: r2(EY.x + 50.03 * UV[0]), y: r2(EY.y + 50.03 * UV[1]) };
  const RN = { x: r2(EY.x + 40.5 * UV[0]), y: r2(EY.y + 40.5 * UV[1]) };
  const P0 = [EY.x + 7 * UV[0], EY.y + 7 * UV[1]]; // where the band crosses the eyelet
  const rrect = (h, r) =>
    `M${-h + r} ${-h}H${h - r}A${r} ${r} 0 0 1 ${h} ${-h + r}V${h - r}A${r} ${r} 0 0 1 ${h - r} ${h}H${-h + r}A${r} ${r} 0 0 1 ${-h} ${h - r}V${-h + r}A${r} ${r} 0 0 1 ${-h + r} ${-h}Z`;
  const circ = (r) => `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;
  const sqW = (x, y) => [r2(SQ.x + x * COS - y * SIN), r2(SQ.y + x * SIN + y * COS)];
  const rnW = (deg, rr = 33.5) => [r2(RN.x + rr * Math.cos((deg * Math.PI) / 180)), r2(RN.y + rr * Math.sin((deg * Math.PI) / 180))];
  // the half-disc round the eyelet where the band runs IN FRONT of the paddle (it then dives
  // through the hole and passes behind the neck)
  function frontD(rad = 46) {
    const a = [P0[0] + rad * UV[0], P0[1] + rad * UV[1]];
    const b = [P0[0] - rad * UV[0], P0[1] - rad * UV[1]];
    return `M${r2(a[0])} ${r2(a[1])}A${rad} ${rad} 0 0 0 ${r2(b[0])} ${r2(b[1])}Z`;
  }
  // the wedge (ring-local) where the split ring's two coils overlap, from the split onward
  const wedgeD = (a0, a1, rad = 70) => {
    const p = (a) => `${r2(rad * Math.cos((a * Math.PI) / 180))} ${r2(rad * Math.sin((a * Math.PI) / 180))}`;
    return `M0 0L${p(a0)}A${rad} ${rad} 0 0 1 ${p(a1)}Z`;
  };
  // where the figure tag's jump ring and LEGEND's carabiner meet each ring
  const JR = { sq: sqW(31.8, 31.8), rn: rnW(40, 35.5) };
  const CB = { sq: { at: sqW(-24, -24), rot: -22 }, rn: { at: rnW(-100, 24), rot: -8 } };
  // the cloisonné wire / ball seam across the shoulders
  const WIRE_Y = 271;
  const wireD = `M-10 281Q130 261 270 281`;

  /* ------------------------------------------------------------ tiers */
  // n = laminated plies on the edge. ply() lists them top to bottom; one is always the club colour.
  const TIER = {
    HOMA: { ply: (c) => [mix(c.primary, "#000000", 0.38)] },
    STADE: { ply: (c) => ["#9fb3c8", c.primary] },
    PRO: { ply: (c) => ["#2e2925", c.primary, "#141210"] },
    CHAMPION: { ply: (c) => ["#8e97a3", c.primary, "#6b7480", c.primary] },
    LEGEND: { ply: (c) => ["#5a3b22", c.primary, "#3a2414", c.primary] },
  };
  const PLY = 2.2;

  /* ------------------------------------------------------------ shared defs */
  function defsCommon(id, founder) {
    return (
      (founder
        ? `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#7189ad"/><stop offset=".17" stop-color="#32455f"/><stop offset=".36" stop-color="#9db0ca"/><stop offset=".5" stop-color="#3a4e6b"/><stop offset=".7" stop-color="#22324a"/><stop offset=".86" stop-color="#6580a4"/><stop offset="1" stop-color="#2a3b54"/></linearGradient>`
        : `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#e6ebf0"/><stop offset=".2" stop-color="#87919d"/><stop offset=".4" stop-color="#f3f6f9"/><stop offset=".56" stop-color="#a9b2be"/><stop offset=".76" stop-color="#6b7683"/><stop offset=".9" stop-color="#c7ced6"/><stop offset="1" stop-color="#8a94a0"/></linearGradient>`) +
      `<linearGradient id="${id}-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f4f7"/><stop offset=".42" stop-color="#a9b2be"/><stop offset=".68" stop-color="#77818e"/><stop offset="1" stop-color="#cfd5dc"/></linearGradient>` +
      `<linearGradient id="${id}-fg" gradientUnits="userSpaceOnUse" x1="10" y1="40" x2="190" y2="240"><stop offset="0" stop-color="#f2f5f8"/><stop offset=".45" stop-color="#b4bdc8"/><stop offset=".75" stop-color="#8a94a0"/><stop offset="1" stop-color="#6c7682"/></linearGradient>` +
      `<clipPath id="${id}-fr"><path d="${frontD()}"/></clipPath>` +
      `<clipPath id="${id}-fc"><path d="${pearD(0)}"/></clipPath>` +
      `<clipPath id="${id}-tf"><path d="${MC.AVATAR.torso}"/><path d="${MC.AVATAR.hood}"/></clipPath>` +
      `<mask id="${id}-th" maskUnits="userSpaceOnUse" x="-30" y="-10" width="270" height="290"><rect x="-30" y="-10" width="270" height="290" fill="#fff"/><circle cx="100" cy="30" r="8" fill="#000"/></mask>`
    );
  }

  // Engraved and paint-filled (PRO): the recess casts a shadow from its top-start wall.
  const fEng = (id) =>
    `<filter id="${id}-ink" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feOffset in="SourceAlpha" dx=".9" dy="1.2" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="w"/>` +
    `<feFlood flood-color="#000" flood-opacity=".85"/><feComposite in2="w" operator="in" result="sh"/>` +
    `<feOffset in="SourceAlpha" dx="-.45" dy="-.55" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="l"/>` +
    `<feFlood flood-color="#fff" flood-opacity=".3"/><feComposite in2="l" operator="in" result="hl"/>` +
    `<feOffset in="SourceAlpha" dx=".5" dy=".6" result="o3"/><feComposite in="o3" in2="SourceAlpha" operator="out" result="lip"/>` +
    `<feFlood flood-color="#fff3e6" flood-opacity=".16"/><feComposite in2="lip" operator="in" result="lp"/>` +
    `<feMerge><feMergeNode in="lp"/><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/><feMergeNode in="hl"/></feMerge></filter>`;
  // Moulded and raised (HOMA): a soft cast shadow and a lit top edge.
  const fRaise = (id) =>
    `<filter id="${id}-ink" x="-15%" y="-15%" width="130%" height="140%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b"/><feOffset in="b" dx=".8" dy="1.6" result="bo"/>` +
    `<feFlood flood-color="#06101c" flood-opacity=".55"/><feComposite in2="bo" operator="in" result="ds"/>` +
    `<feOffset in="SourceAlpha" dx=".7" dy=".9" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>` +
    `<feFlood flood-color="#fff" flood-opacity=".5"/><feComposite in2="e" operator="in" result="hl"/>` +
    `<feOffset in="SourceAlpha" dx="-.6" dy="-.8" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="e2"/>` +
    `<feFlood flood-color="#000" flood-opacity=".25"/><feComposite in2="e2" operator="in" result="lo"/>` +
    `<feMerge><feMergeNode in="ds"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hl"/><feMergeNode in="lo"/></feMerge></filter>`;
  // Raised polished nickel (CHAMPION): a hairline cast shadow into the enamel and a lit top edge.
  const fNickel = (id) =>
    `<filter id="${id}-ink" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation=".6" result="b"/><feOffset in="b" dx=".7" dy="1.2" result="bo"/>` +
    `<feFlood flood-color="#05090f" flood-opacity=".7"/><feComposite in2="bo" operator="in" result="ds"/>` +
    `<feOffset in="SourceAlpha" dx=".45" dy=".55" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>` +
    `<feFlood flood-color="#fff" flood-opacity=".55"/><feComposite in2="e" operator="in" result="hl"/>` +
    `<feMerge><feMergeNode in="ds"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hl"/></feMerge></filter>`;
  // Stamped and debossed in ink (LEGEND): pressed into leather, the lower lip catches light.
  const fDeboss = (id) =>
    `<filter id="${id}-ink" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB">` +
    `<feOffset in="SourceAlpha" dx="1" dy="1.3" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="w"/>` +
    `<feFlood flood-color="#000" flood-opacity=".75"/><feComposite in2="w" operator="in" result="sh"/>` +
    `<feOffset in="SourceAlpha" dx=".8" dy="1" result="o3"/><feComposite in="o3" in2="SourceAlpha" operator="out" result="lip"/>` +
    `<feFlood flood-color="#ffe8c4" flood-opacity=".42"/><feComposite in2="lip" operator="in" result="lp"/>` +
    `<feOffset in="SourceAlpha" dx="-.7" dy="-.8" result="o4"/><feComposite in="o4" in2="SourceAlpha" operator="out" result="top"/>` +
    `<feFlood flood-color="#3d2814" flood-opacity=".35"/><feComposite in2="top" operator="in" result="tp"/>` +
    `<feMerge><feMergeNode in="lp"/><feMergeNode in="tp"/><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge></filter>`;

  /* ------------------------------------------------------------ the fob face, per tier */
  function plies(tk, c) {
    const list = TIER[tk].ply(c);
    let s = "";
    for (let k = list.length; k >= 1; k--) {
      s +=
        `<path d="${faceD(PLY * k)}" fill-rule="evenodd" fill="${list[k - 1]}"` +
        (tk === "STADE" && k === 1 ? ` fill-opacity=".8"` : "") +
        ` stroke="#000" stroke-opacity=".35" stroke-width=".4"/>` +
        (k === list.length ? `<path class="c03-rim" d="${pearD(0, PLY * k)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` : "");
    }
    return s;
  }
  // the eyelet mask: strokes that run round the outline step round the hole
  const eyeMask = (id, r) =>
    `<mask id="${id}-mk" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="460"><rect width="260" height="460" fill="#fff"/><circle cx="${EY.x}" cy="${EY.y}" r="${r}" fill="#000"/></mask>`;

  function faceHoma(id, c, thumb) {
    // soft PVC, matte: low lighting (surfaceScale 3, wide blur) so it reads as moulded, not glossy
    const defs =
      eyeMask(id, 17.5) +
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="10" result="b"/>` +
          `<feDiffuseLighting in="b" surfaceScale="3" diffuseConstant="1.18" lighting-color="#fff" result="dl"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>` +
          `<feBlend in="SourceGraphic" in2="dl" mode="multiply" result="m"/>` +
          `<feSpecularLighting in="b" surfaceScale="3" specularConstant=".35" specularExponent="14" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>` +
          `<feComposite in="m" in2="sp" operator="arithmetic" k2="1" k3=".6" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
          fRaise(id));
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="${c.primary}"${thumb ? "" : ` filter="url(#${id}-mat)"`}/>` +
      `<g fill="none" stroke="${c.secondary}" stroke-width="2.6"${thumb ? "" : ` filter="url(#${id}-ink)"`}>` +
      `<path d="${pearD(6)}" mask="url(#${id}-mk)"/><circle cx="${EY.x}" cy="${EY.y}" r="16.5"/></g>`;
    return {
      defs,
      body,
      inset: 10,
      ink: { fill: c.secondary, filter: true },
      crest: (w, h) => MC.crest({ fill: c.primary, sash: c.secondary, ring: c.secondary, w, h }),
    };
  }

  function faceStade(id, c, thumb) {
    const defs =
      `<pattern id="${id}-ht" width="4.4" height="4.4" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><circle cx="2.2" cy="2.2" r="1.15" fill="${c.primary}"/></pattern>` +
      `<filter id="${id}-hb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>` +
      `<mask id="${id}-hm" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="460"><path d="${pearD(5)}" fill="none" stroke="#fff" stroke-width="24" filter="url(#${id}-hb)"/></mask>` +
      eyeMask(id, 19) +
      `<linearGradient id="${id}-gl" gradientUnits="userSpaceOnUse" x1="40" y1="190" x2="70" y2="255"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    // clear injection acrylic: you see its 5u thickness round a printed paper insert
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="#d9e8f5" fill-opacity=".16"/>` +
      `<path d="${pearD(5)}${holeD(16)}" fill-rule="evenodd" fill="${c.secondary}"/>` +
      (thumb ? "" : `<path d="${pearD(5)}${holeD(16)}" fill-rule="evenodd" fill="url(#${id}-ht)" mask="url(#${id}-hm)" opacity=".55"/>`) +
      `<g fill="none" stroke="${c.primary}" stroke-width="1.4"><path d="${pearD(7.6)}" mask="url(#${id}-mk)"/><circle cx="${EY.x}" cy="${EY.y}" r="19"/></g>` +
      `<path d="${pearD(3.4)}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width=".6"/>` +
      `<path d="${faceD()}" fill="none" stroke="#f1f7fc" stroke-opacity=".85" stroke-width=".9"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="16" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".6"/>` +
      (thumb ? "" : `<path d="M10 290L250 160V192L10 322Z" fill="url(#${id}-gl)" clip-path="url(#${id}-fc)"/>`);
    return {
      defs,
      body,
      inset: 10,
      ink: { fill: c.primary },
      crest: (w, h) => MC.crest({ fill: c.primary, sash: c.secondary, ring: c.primary, w, h }),
    };
  }

  // one narrow spike in the alpha table: a single thin contour of the noise field = one vein
  const VEIN = Array.from({ length: 41 }, (_, i) => (i === 20 ? 1 : 0)).join(" ");
  function facePro(id, c, thumb) {
    const defs =
      `<linearGradient id="${id}-sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3430"/><stop offset=".45" stop-color="#1e1b19"/><stop offset="1" stop-color="#121010"/></linearGradient>` +
      (thumb
        ? ""
        : // oxblood veins: thin marbled lines, one contour of a stretched noise field
          `<filter id="${id}-mat" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
          `<feTurbulence type="fractalNoise" baseFrequency=".005 .012" numOctaves="3" seed="4" result="n"/>` +
          `<feColorMatrix in="n" type="matrix" values="0 0 0 0 .353  0 0 0 0 .165  0 0 0 0 .125  1 0 0 0 0" result="v"/>` +
          `<feComponentTransfer in="v" result="v1"><feFuncA type="table" tableValues="${VEIN}"/></feComponentTransfer>` +
          `<feComponentTransfer in="v1" result="v2"><feFuncA type="linear" slope=".34"/></feComponentTransfer>` +
          `<feComposite in="v2" in2="SourceAlpha" operator="in" result="vn"/>` +
          `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="vn"/></feMerge></filter>` +
          // the sheen: no lighting filter, a soft highlight that lives only in the top-start quarter
          `<filter id="${id}-sb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>` +
          `<linearGradient id="${id}-sg" gradientUnits="userSpaceOnUse" x1="44" y1="120" x2="150" y2="300"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
          `<mask id="${id}-sm" maskUnits="userSpaceOnUse" x="0" y="60" width="260" height="400"><rect x="0" y="60" width="130" height="400" fill="url(#${id}-sg)"/></mask>` +
          fEng(id));
    // weighted bakelite: warm black, faint oxblood veins, a soft sheen; a drilled eyelet
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="${thumb ? `url(#${id}-sh)` : "#1e1b19"}"${thumb ? "" : ` filter="url(#${id}-mat)"`}/>` +
      (thumb
        ? ""
        : `<g clip-path="url(#${id}-fc)" mask="url(#${id}-sm)">` +
          `<path d="${pearD(6)}" fill="none" stroke="#fff3e4" stroke-opacity=".14" stroke-width="10" filter="url(#${id}-sb)"/>` +
          `<path d="${pearD(2)}" fill="none" stroke="#fff3e4" stroke-opacity=".4" stroke-width="1"/></g>`) +
      `<path d="M140.4 120A12 12 0 0 1 119.6 120" fill="none" stroke="#fff4e8" stroke-opacity=".3" stroke-width="1.2"/>`;
    return {
      defs,
      body,
      inset: 6,
      ink: { fill: c.secondary, filter: true },
      crest: (w, h) => MC.crest({ fill: c.primary, sash: c.secondary, ring: c.secondary, w, h }),
    };
  }

  function faceChampion(id, c, thumb) {
    const above = `M-10 -20H270V281Q130 261 -10 281Z`;
    const below = `M-10 281Q130 261 270 281V470H-10Z`;
    const defs =
      `<linearGradient id="${id}-nk" gradientUnits="userSpaceOnUse" x1="30" y1="90" x2="230" y2="450"><stop offset="0" stop-color="#f1f4f7"/><stop offset=".22" stop-color="#b3bcc6"/><stop offset=".42" stop-color="#e6eaee"/><stop offset=".62" stop-color="#98a2ad"/><stop offset=".82" stop-color="#d7dde3"/><stop offset="1" stop-color="#a3adb8"/></linearGradient>` +
      `<linearGradient id="${id}-bv" gradientUnits="userSpaceOnUse" x1="40" y1="100" x2="220" y2="440"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset=".55" stop-color="#1b232c" stop-opacity=".1"/><stop offset="1" stop-color="#1b232c"/></linearGradient>` +
      `<clipPath id="${id}-en"><path d="${pearD(7)}"/></clipPath>` +
      `<clipPath id="${id}-ab"><path d="${above}"/></clipPath><clipPath id="${id}-be"><path d="${below}"/></clipPath>` +
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b"/>` +
          `<feSpecularLighting in="b" surfaceScale="3" specularConstant=".9" specularExponent="34" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="44"/></feSpecularLighting>` +
          `<feComposite in="SourceGraphic" in2="sp" operator="arithmetic" k2="1" k3=".6" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
          `<filter id="${id}-br" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
          `<feTurbulence type="fractalNoise" baseFrequency=".012 1.1" numOctaves="2" seed="5" result="n"/>` +
          `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .6 -.2" result="w"/>` +
          `<feComposite in="w" in2="SourceAlpha" operator="in" result="wl"/>` +
          `<feBlend in="SourceGraphic" in2="wl" mode="soft-light"/></filter>` +
          fNickel(id));
    // a polished nickel blank with a 7u bevelled border; two hard-enamel fields split by a
    // cloisonné wire: the club's second colour in the neck, the club colour in the bulb
    const enamel = `${pearD(7)}${holeD(19)}`;
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="url(#${id}-nk)"${thumb ? "" : ` filter="url(#${id}-br)"`}/>` +
      `<path d="${pearD(3.5)}" fill="none" stroke="url(#${id}-bv)" stroke-width="7" stroke-opacity=".5"/>` +
      `<g${thumb ? "" : ` filter="url(#${id}-mat)"`}>` +
      `<path d="${enamel}" fill-rule="evenodd" fill="${c.secondary}" clip-path="url(#${id}-ab)"/>` +
      `<path d="${enamel}" fill-rule="evenodd" fill="${c.primary}" clip-path="url(#${id}-be)"/></g>` +
      `<g clip-path="url(#${id}-en)" fill="none"><path d="${wireD}" stroke="#2b333d" stroke-width="3.4"/><path d="${wireD}" stroke="url(#${id}-nk)" stroke-width="2.4"/><path d="${wireD}" stroke="#fff" stroke-opacity=".7" stroke-width=".6" transform="translate(0 -.6)"/></g>` +
      `<path d="${pearD(7)}" fill="none" stroke="#2b333d" stroke-opacity=".55" stroke-width=".7"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="19" fill="none" stroke="#2b333d" stroke-opacity=".55" stroke-width=".7"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="12.3" fill="none" stroke="#3b434d" stroke-width=".6"/>` +
      `<path d="${pearD(0.6)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".7" clip-path="url(#${id}-tl)"/>` +
      `<clipPath id="${id}-tl"><path d="M0 0H200L0 330Z"/></clipPath>`;
    return {
      defs,
      body,
      inset: 9.5,
      ink: { fill: "#e6eaee", filter: true },
      neck: { fill: "#2b333d" },
      crest: (w, h) => MC.crest({ fill: c.primary, sash: c.secondary, ring: "#8e97a3", w, h }),
    };
  }

  function faceLegend(id, c, thumb) {
    const defs =
      `<radialGradient id="${id}-lg" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d6b38b"/><stop offset=".7" stop-color="#c29b70"/><stop offset="1" stop-color="#9c7650"/></radialGradient>` +
      `<clipPath id="${id}-sc"><path d="${pearD(3.5)}"/></clipPath>` +
      eyeMask(id, 20) +
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          // a fine pebble grain (finer than cork), lit very low
          `<feTurbulence type="fractalNoise" baseFrequency=".45" numOctaves="2" seed="9" result="g"/>` +
          `<feDiffuseLighting in="g" surfaceScale="1" diffuseConstant="1.12" lighting-color="#fff" result="gb"><feDistantLight azimuth="225" elevation="58"/></feDiffuseLighting>` +
          `<feBlend in="SourceGraphic" in2="gb" mode="multiply" result="m"/>` +
          `<feTurbulence type="fractalNoise" baseFrequency=".016" numOctaves="3" seed="21" result="p"/>` +
          `<feColorMatrix in="p" type="matrix" values="0 0 0 0 .42  0 0 0 0 .27  0 0 0 0 .14  2 0 0 0 -1.05" result="pa"/>` +
          `<feComposite in="pa" in2="SourceAlpha" operator="in" result="pat"/>` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="5" result="eb"/>` +
          `<feColorMatrix in="eb" type="matrix" values="0 0 0 0 .3  0 0 0 0 .18  0 0 0 0 .09  0 0 0 -1.1 1" result="burn"/>` +
          `<feComposite in="burn" in2="SourceAlpha" operator="in" result="bur"/>` +
          `<feMerge result="base"><feMergeNode in="m"/><feMergeNode in="pat"/><feMergeNode in="bur"/></feMerge>` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="10" result="b"/>` +
          `<feSpecularLighting in="b" surfaceScale="3" specularConstant=".5" specularExponent="16" lighting-color="#fff1dc" result="sp"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>` +
          `<feComposite in="base" in2="sp" operator="arithmetic" k2="1" k3=".45" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
          fDeboss(id));
    // the panel seams of an old match ball: one hexagon edge across the shoulders, its
    // neighbours running out to the edge
    const seams = [`M88 ${WIRE_Y}H172`, `M88 ${WIRE_Y}L30 371`, `M172 ${WIRE_Y}L230 371`, `M88 ${WIRE_Y}L58 219`, `M172 ${WIRE_Y}L202 219`];
    const seam = (d) =>
      `<path d="${d}" stroke="#6f4a2b" stroke-width="3"/>` +
      `<path d="${d}" stroke="#2c1d11" stroke-width="1.2"/>` +
      (thumb ? "" : `<path d="${d}" stroke="#3a2414" stroke-width="5.6" stroke-dasharray=".9 3.4" stroke-opacity=".75"/><path d="${d}" stroke="#ffe7c6" stroke-opacity=".35" stroke-width=".8" transform="translate(.6 1.1)"/>`);
    const stitch = (d, extra = "") =>
      (thumb ? "" : `<path d="${d}"${extra} stroke="#1c1108" stroke-opacity=".55" stroke-width="2" stroke-dasharray="3.4 2.4" transform="translate(.45 .7)"/>`) +
      `<path d="${d}"${extra} stroke="#efe3cf" stroke-width="1.6" stroke-dasharray="3.4 2.4"/>`;
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="${thumb ? `url(#${id}-lg)` : "#c8a27a"}"${thumb ? "" : ` filter="url(#${id}-mat)"`}/>` +
      `<g fill="none" stroke-linecap="round" clip-path="url(#${id}-sc)">${seams.map(seam).join("")}</g>` +
      // edge paint round the whole outline, the way good leather goods are finished
      `<path d="${pearD(1.25)}" fill="none" stroke="#3a2414" stroke-width="2.5"/>` +
      // waxed cream saddle stitch, two layers of leather sewn together
      `<g fill="none" stroke-linecap="round">${stitch(pearD(6.5), ` mask="url(#${id}-mk)"`)}</g>` +
      // steel rivet eyelet
      `<circle cx="${EY.x}" cy="${EY.y}" r="14.4" fill="none" stroke="#3a4048" stroke-width="5.6"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="14.4" fill="none" stroke="url(#${id}-st)" stroke-width="4.4"/>` +
      `<circle cx="${EY.x}" cy="${EY.y}" r="12.3" fill="none" stroke="#2a3038" stroke-width=".7"/>`;
    return {
      defs,
      body,
      inset: 10.5,
      ink: { fill: "#14161a", filter: true },
      crest: (w, h) => MC.crest({ mono: "#14161a", w, h }),
    };
  }

  const FACE = { HOMA: faceHoma, STADE: faceStade, PRO: facePro, CHAMPION: faceChampion, LEGEND: faceLegend };

  /* ------------------------------------------------------------ the engraving */
  const CREST = { x: 119, y: 136, w: 22, h: 26.4 };
  function engraving(p, o, id, F, thumb, tk) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const paint = (k) => `fill="${k.fill}"` + (k.stroke ? ` stroke="${k.stroke}" stroke-width="${k.sw}" paint-order="stroke"` : "");
    const ink = F.ink;
    const nk = F.neck || F.ink;
    let neck = "";
    let bulb = "";

    // the club's crest at the neck, where a hotel fob carries the house crest
    neck += `<g transform="translate(${CREST.x} ${CREST.y})">${F.crest(CREST.w, CREST.h)}</g>`;

    if (!thumb) {
      // the tier under it, in a condensed house-name face (Latin) or Noto Sans Arabic
      const tier = S.tiers[p.tier];
      const ty = 183;
      if (ar) {
        const w = wAt(F_AR, tier, 12, 0.5);
        const avail = 2 * (halfW(ty - 11) - F.inset) - 2;
        const fs = r2(Math.min(12, (12 * avail) / Math.max(1, w)));
        neck += `<text x="130" y="${ty}" text-anchor="middle" font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="700" font-size="${fs}" ${paint(nk)} fill-opacity=".86">${esc(tier)}</text>`;
      } else {
        const avail = 2 * (halfW(ty - 10) - F.inset) - 2;
        const ls = wAt(F_BS, tier, 12, 0.36) + tier.length * 0.06 * 12 > avail ? 0 : 0.06;
        const w = wAt(F_BS, tier, 12, 0.36) + tier.length * ls * 12;
        const fs = r2(Math.min(12, (12 * avail) / Math.max(1, w)));
        neck += `<text x="${r2(130 + (ls * fs) / 2)}" y="${ty}" text-anchor="middle" font-family="Big Shoulders Display, Manrope, sans-serif" font-weight="800" font-size="${fs}" letter-spacing="${r2(ls * fs)}" ${paint(nk)} fill-opacity=".86">${esc(tier)}</text>`;
      }

      // the stats, an engraved column down the neck: figures read down one line
      const vf = 12.5;
      const gap = 6;
      const ys = [209, 225, 241, 257];
      const labels = MC.STATS.map((k) => S.stats[k]);
      const vws = MC.STATS.map((k) => wAt(F_MR, String(p.stats[k]), vf, 0.58));
      const lls = ar ? 0 : 0.06;
      let lf = ar ? 10 : 10.5;
      let lws = [];
      let anchor = 130;
      for (let tries = 0; tries < 10; tries++) {
        lws = labels.map((t) => wAt(ar ? F_AR : F_MR, t, lf, ar ? 0.45 : 0.7) + (ar ? 0 : t.length * lls * lf));
        const LW = Math.max(...lws);
        const VW = Math.max(...vws);
        const B = LW + gap + VW;
        const ideal = ar ? 130 - B / 2 + VW : 130 - B / 2 + LW;
        let lo = -1e9;
        let hi = 1e9;
        ys.forEach((y, i) => {
          const hw = halfW(y - 9.4) - F.inset;
          lo = Math.max(lo, 130 - hw + (ar ? vws[i] : lws[i]));
          hi = Math.min(hi, 130 + hw - (ar ? gap + lws[i] : gap + vws[i]));
        });
        if (lo <= hi) {
          anchor = Math.min(hi, Math.max(lo, ideal));
          break;
        }
        if (lf <= (ar ? 8.4 : 9)) {
          anchor = (lo + hi) / 2;
          break;
        }
        lf = r2(lf * 0.95);
      }
      MC.STATS.forEach((k, i) => {
        const y = ys[i];
        const lab = esc(S.stats[k]);
        const val = esc(p.stats[k]);
        const vText = (x, anchorEnd) =>
          `<text x="${r2(x)}" y="${y}"${anchorEnd ? ' text-anchor="end"' : ""} font-family="Manrope, sans-serif" font-weight="800" font-size="${vf}" style="font-variant-numeric:tabular-nums" ${paint(nk)}>${val}</text>`;
        if (ar) {
          // RTL reading: the label at the right, its figure to its left, figures aligned
          neck += vText(anchor, true) + `<text x="${r2(anchor + gap)}" y="${y}" font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="700" font-size="${lf}" ${paint(nk)} fill-opacity=".74">${lab}</text>`;
        } else {
          neck +=
            `<text x="${r2(anchor)}" y="${y}" text-anchor="end" font-family="Manrope, sans-serif" font-weight="800" font-size="${lf}" letter-spacing="${r2(lls * lf)}" ${paint(nk)} fill-opacity=".74">${lab}</text>` +
            vText(anchor + gap, false);
        }
      });
    }

    // the name, and the founder year after it the way supporter groups carry theirs (ALI ·26).
    // In Arabic the year sits to the left of the name and the dot stays next to the name (26· علي).
    const name = MC.nameOf(p, o);
    const yr = p.founder ? String(p.founder).slice(2) : "";
    const yy = yr ? (ar ? yr + "·" : "·" + yr) : "";
    const ny = 302;
    // fit to the bulb's real width at the name's cap height, inside the tier's border
    const NW = Math.min(150, 2 * (halfW(ny - 19) - F.inset) - 6);
    const nW = (fs) => wAt(F_CH, name, fs, ar ? 0.55 : 0.62);
    const sW = (fs) => (yy ? wAt(F_CH6, yy, fs * 0.62, 0.48) + fs * 0.14 : 0);
    let nfs = 30;
    if (nW(30) + sW(30) > NW) nfs = Math.max(17, (30 * NW) / (nW(30) + sW(30)));
    const sw = sW(nfs);
    const nwRaw = nW(nfs);
    const squeeze = nwRaw + sw > NW + 1;
    const nw = squeeze ? NW - sw : nwRaw;
    const x0 = 130 - (nw + sw) / 2;
    const nameX = ar ? x0 + sw : x0;
    const sufX = ar ? x0 : x0 + nw + nfs * 0.14;
    bulb +=
      `<text x="${r2(nameX)}" y="${ny}" font-family="Changa, sans-serif" font-weight="800" font-size="${r2(nfs)}" ${paint(ink)}${squeeze ? ` textLength="${r2(nw)}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(name)}</text>` +
      (yy ? `<text x="${r2(sufX)}" y="${ny}" font-family="Changa, sans-serif" font-weight="600" font-size="${r2(nfs * 0.62)}" direction="ltr" ${paint(ink)} fill-opacity=".78">${esc(yy)}</text>` : "");

    // the 84: engraved at the centre of the bulb like a room number, ink-centred in a fixed slot
    const fs = p.ovr >= 100 ? 70 : 100;
    const x84 = inkX(p.ovr, fs, 130);
    bulb += `<text x="${x84 != null ? x84 : 130}" y="${p.ovr >= 100 ? 396 : 404}" ${x84 != null ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" ${paint(ink)}>${esc(p.ovr)}</text>`;

    // the BotolaGO ID, season and country, engraved round the bottom like a hotel fob's return line
    if (!thumb) {
      const sp = ` font-family="Manrope, sans-serif" font-weight="800" font-size="8.5" ${paint(ink)} fill-opacity=".8"`;
      bulb += ar
        ? `<text${sp} direction="rtl"><textPath href="#${id}-rp" startOffset="50%" text-anchor="middle"><tspan font-family="Noto Sans Arabic, sans-serif" font-weight="700">${esc(S.country)}</tspan> · ${esc(p.season)} · <tspan letter-spacing=".3">${esc(p.id)}</tspan></textPath></text>`
        : `<text${sp} letter-spacing=".3"><textPath href="#${id}-rp" startOffset="50%" text-anchor="middle">${esc(`${p.id} · ${p.season} · ${S.country}`)}</textPath></text>`;
    }
    void tk;
    const fl = ink.filter && !thumb ? ` filter="url(#${id}-ink)"` : "";
    return `<g${fl}>${neck}</g><g${fl}>${bulb}</g>`;
  }

  /* ------------------------------------------------------------ ring, figure tag, carabiner */
  function ring(p, o, id, thumb) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    let s;
    if (p.founder) {
      s =
        `<g transform="translate(${SQ.x} ${SQ.y}) rotate(${TILT})">` +
        `<clipPath id="${id}-cw"><path d="${wedgeD(180, 250)}"/></clipPath>` +
        // the under coil, sprung 3u proud of the top one for 70deg past the split
        `<g clip-path="url(#${id}-cw)"><path d="${rrect(41, 18)}${rrect(37.5, 14.5)}" fill-rule="evenodd" fill="#22324a"/><path d="${rrect(40.6, 17.6)}" fill="none" stroke="#9db0ca" stroke-opacity=".7" stroke-width=".7"/></g>` +
        `<path d="${rrect(38, 15)}${rrect(29, 6)}" fill-rule="evenodd" fill="url(#${id}-rg)"/>` +
        `<path d="${rrect(37.6, 14.6)}" fill="none" stroke="#dbe5f2" stroke-opacity=".7" stroke-width=".8"/>` +
        `<path d="${rrect(29.3, 6.3)}" fill="none" stroke="#0d1520" stroke-opacity=".6" stroke-width=".8"/>` +
        // the split: where the top coil ends and the step begins
        `<path d="M-41 .6L-29 -.6" stroke="#0d1520" stroke-width="1.2"/><path d="M-40.6 -.6L-29.4 -1.6" stroke="#c9d6e8" stroke-opacity=".7" stroke-width=".6"/>`;
      if (!thumb) {
        // 2026 stamped big through the bluing on the top bar, bright bare steel
        const yfs = 9.4;
        const yb = r2(-33.5 + 0.37 * yfs);
        s +=
          `<text x=".3" y="${r2(yb + 0.5)}" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${yfs}" letter-spacing=".5" fill="#0b121c" fill-opacity=".75">${p.founder}</text>` +
          `<text x=".3" y="${yb}" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${yfs}" letter-spacing=".5" fill="#eef3f9">${p.founder}</text>`;
        // FOUNDER / عضو مؤسس running down the end bar
        const t = S.founder;
        const ffs = ar ? 6.6 : 7.5;
        const w = ar ? wAt(F_AR, t, ffs, 0.45) : wAt(F_MR, t, ffs, 0.66) + t.length * 0.08 * ffs;
        const fit = r2(Math.min(ffs, (ffs * 40) / Math.max(1, w)));
        const dy = ar ? r2(0.24 * fit) : r2(0.37 * fit);
        const font = ar ? `font-family="Noto Sans Arabic, sans-serif" font-weight="700"` : `font-family="Manrope, sans-serif" font-weight="800" letter-spacing="${r2(0.08 * fit)}"`;
        s +=
          `<g transform="translate(33.5 -3) rotate(90)">` +
          `<text x=".4" y="${r2(dy + 0.45)}" text-anchor="middle" font-size="${fit}" ${font} fill="#0b121c" fill-opacity=".7">${esc(t)}</text>` +
          `<text x="0" y="${dy}" text-anchor="middle" font-size="${fit}" ${font} fill="#e9eef5">${esc(t)}</text></g>`;
      }
      s += `</g>`;
    } else {
      s =
        `<g transform="translate(${RN.x} ${RN.y})">` +
        `<clipPath id="${id}-cw"><path d="${wedgeD(225, 295)}"/></clipPath>` +
        `<g clip-path="url(#${id}-cw)"><path d="${circ(41)}${circ(37.5)}" fill-rule="evenodd" fill="#6b7683"/><path d="${circ(40.6)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".7"/></g>` +
        `<path d="${circ(38)}${circ(29)}" fill-rule="evenodd" fill="url(#${id}-rg)"/>` +
        `<path d="${circ(37.6)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>` +
        `<path d="${circ(29.3)}" fill="none" stroke="#1c232c" stroke-opacity=".55" stroke-width=".8"/>` +
        `<path d="M-29 -20.5L-21.3 -27.6" stroke="#2a313a" stroke-width="1.1"/><path d="M-28.3 -21.6L-20.6 -28.6" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/>` +
        `</g>`;
    }
    return s;
  }

  // The first charm and the only permanent one: an acrylic bag charm of the shared manager
  // figure, seen from behind at the touchline: printed as a grey hood over a bench jacket in the
  // club colour (yoke and raglan seams a shade lighter), die-cut with a white margin and a clear edge,
  // the way the charms on school bags are made. (A monochrome steel cut-out of this figure reads
  // as a bell; the two-tone print is what makes it a person.)
  const FIG_CUT = (A) => `<path d="${A.torso}"/><path d="${A.hood}"/><circle cx="100" cy="30" r="15"/>`;
  function figTag(id, J, thumb, c) {
    const A = MC.AVATAR;
    const cut = (col, w, extra = "") => `<g fill="${col}" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"${extra}>${FIG_CUT(A)}</g>`;
    return (
      `<g transform="translate(${J[0]} ${J[1]})"><g class="c03-sw">` +
      `<g transform="translate(-25 -3.9) scale(.25)" mask="url(#${id}-th)">` +
      (thumb ? "" : cut("#000", 26, ` opacity=".4" transform="translate(7 11)"`)) +
      cut("#6f7a87", 31) +
      cut("#d6e3ee", 26) +
      cut("#ffffff", 17) +
      `<path d="${A.torso}" fill="${c.primary}"/>` +
      // yoke and raglan seams stitched a shade lighter than the jacket: they make the sleeves
      `<path d="${A.seam}" fill="none" stroke="${mix(c.primary, "#ffffff", 0.32)}" stroke-width="5.5" stroke-linecap="round"/>` +
      `<path d="${A.hood}" fill="#a3acb6"/>` +
      `<g fill="none" stroke="#5f6873" stroke-linecap="round"><path d="M100 50C100 92 100 140 100 172" stroke-width="5"/><path d="${A.hoodRim}" stroke-width="6.5"/></g>` +
      (thumb
        ? ""
        : `<path d="M54 86C44 112 42 150 46 182" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>` +
          `<path d="M-30 160L230 36V64L-30 188Z" fill="#fff" opacity=".16" clip-path="url(#${id}-tf)"/>`) +
      `</g>` +
      // the jump ring through the charm's hole and the split ring
      `<circle r="3.6" fill="none" stroke="#3b444e" stroke-width="2.6"/><circle r="3.6" fill="none" stroke="url(#${id}-st)" stroke-width="1.7"/>` +
      `</g></g>`
    );
  }

  // LEGEND: a heavy machined D carabiner hooked through the ring's top corner, standing above it.
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
    const tk = MC.TIERS.includes(p.tier) ? p.tier : "PRO";
    const c = p.club;
    const founder = !!p.founder;
    const F = FACE[tk](id, c, thumb);
    const defs = defsCommon(id, founder) + F.defs + `<path id="${id}-rp" d="M47 354A83 81 0 0 0 213 354"/>`;
    const cb = founder ? CB.sq : CB.rn;
    const ringS = ring(p, o, id, thumb);
    const back =
      (tk === "LEGEND" ? carabiner(id, cb.at, cb.rot, 0.92, "back", thumb) : "") +
      ringS +
      (tk === "LEGEND" ? carabiner(id, cb.at, cb.rot, 0.92, "front", thumb) : "") +
      `<g class="c03-charms">${figTag(id, founder ? JR.sq : JR.rn, thumb, c)}</g>`;
    const fob =
      `<g class="c03-fob">` +
      plies(tk, c) +
      F.body +
      `<path class="c03-rim" d="${pearD(0)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      engraving(p, o, id, F, thumb, tk) +
      `</g>`;
    // the band runs over the paddle's top and dives through the eyelet
    const front = `<g clip-path="url(#${id}-fr)">${ringS.replace(/id="[^"]*-cw"/, `id="${id}-cw2"`).replace(new RegExp(`url\\(#${id}-cw\\)`, "g"), `url(#${id}-cw2)`)}</g>`;
    const body = back + (opts.swing ? `<g transform="rotate(${opts.swing} ${EY.x} ${EY.y})">${fob}</g>` : fob) + front;
    return { defs, body, back, fob, front };
  }

  /* ------------------------------------------------------------ full card */
  function full(p, o = {}) {
    const S = MC.s(o);
    const id = MC.uid("c03");
    const A = art(p, o, id);
    return (
      `<div class="c03 c03-full c03--${String(p.tier).toLowerCase()}${o.thumb ? " is-thumb" : ""}" dir="${S.dir}"${MC.isAr(o) ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}"${o.motion ? ' data-motion="1"' : ""}>` +
      `<svg class="c03-art" viewBox="${VB}" direction="ltr" aria-hidden="true" focusable="false"><defs>${A.defs}</defs>${A.body}</svg>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ token (44–80px) and mini (24–32px) */
  // Flat materials only: no filters at token size (fifty of these sit in one list).
  const TOK = {
    HOMA: (c) => ({ body: c.primary, num: c.secondary, line: c.secondary, collar: [c.secondary, c.primary] }),
    STADE: (c) => ({ body: c.secondary, num: c.primary, clear: true }),
    PRO: (c) => ({ body: "#1e1b19", num: c.secondary, sheen: true }),
    CHAMPION: (c) => ({ body: "#c3cad2", num: "#e6eaee", field: c.primary }),
    LEGEND: (c) => ({ body: "#c8a27a", num: "#14161a", stitch: true }),
  };
  const TVB = { x: 32, y: 0, w: 196, h: 478 };

  function bigToken(p, o, size) {
    const id = MC.uid("c03t");
    const tk = MC.TIERS.includes(p.tier) ? p.tier : "PRO";
    const c = p.club;
    const T = TOK[tk](c);
    const founder = !!p.founder;
    const step = 7;
    const HR = 20;
    // the ring sits 12u further out than on the full card so most of the eyelet stays open at 44px
    const SQt = { x: r2(EY.x + 54.73 * UV[0]), y: r2(EY.y + 54.73 * UV[1]) };
    const RNt = { x: r2(EY.x + 45 * UV[0]), y: r2(EY.y + 45 * UV[1]) };
    const tW = (x, y) => [r2(SQt.x + x * COS - y * SIN), r2(SQt.y + x * SIN + y * COS)];
    const tR = (deg, rr) => [r2(RNt.x + rr * Math.cos((deg * Math.PI) / 180)), r2(RNt.y + rr * Math.sin((deg * Math.PI) / 180))];
    const TF = pearD(0) + holeD(HR);
    const list = TIER[tk].ply(c);
    let ply = "";
    for (let k = list.length; k >= 1; k--) {
      ply += `<path d="${pearD(0, step * k)}${holeD(HR, step * k)}" fill-rule="evenodd" fill="${list[k - 1]}" stroke="#000" stroke-opacity=".35" stroke-width="1.4"/>`;
      if (k === list.length) ply += `<path class="c03-rim" d="${pearD(0, step * k)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    let face = "";
    if (T.clear) {
      face =
        `<path d="${TF}" fill-rule="evenodd" fill="#d9e8f5" fill-opacity=".25"/>` +
        `<path d="${pearD(12)}${holeD(25)}" fill-rule="evenodd" fill="${T.body}"/>` +
        `<path class="c03-clear" d="${TF}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    } else if (T.field) {
      face =
        `<path d="${TF}" fill-rule="evenodd" fill="url(#${id}-nk)"/>` +
        `<path d="${pearD(14)}" fill="${T.field}" clip-path="url(#${id}-be)"/>` +
        `<path d="${wireD}" fill="none" stroke="#2b333d" stroke-width="3" clip-path="url(#${id}-ec)"/>`;
    } else {
      face = `<path d="${TF}" fill-rule="evenodd" fill="${T.sheen ? `url(#${id}-sh)` : T.body}"/>`;
      if (T.line) face += `<path d="${pearD(11)}" fill="none" stroke="${T.line}" stroke-width="6" mask="url(#${id}-mk)"/>`;
      if (T.stitch)
        face +=
          `<path d="${pearD(3.5)}" fill="none" stroke="#3a2414" stroke-width="7"/>` +
          `<path d="${pearD(14)}" fill="none" stroke="#efe3cf" stroke-width="4.6" stroke-dasharray="11 8" stroke-linecap="round" mask="url(#${id}-mk)"/>` +
          `<circle cx="${EY.x}" cy="${EY.y}" r="${HR + 4}" fill="none" stroke="#a9b2be" stroke-width="8"/>`;
    }
    // the club collar round the neck: a band of the club colour between keylines of its second
    // colour, so even a dark club colour reads on black bakelite or tan leather
    const cl = T.collar || [c.primary, c.secondary];
    const collar =
      `<g clip-path="url(#${id}-oc)"><rect x="90" y="142" width="80" height="30" fill="${cl[0]}"/>` +
      `<rect x="90" y="142" width="80" height="5.5" fill="${cl[1]}"/><rect x="90" y="166.5" width="80" height="5.5" fill="${cl[1]}"/></g>`;
    const ringS = founder
      ? `<g transform="translate(${SQt.x} ${SQt.y}) rotate(${TILT})"><path d="${rrect(40, 16)}${rrect(26, 3)}" fill-rule="evenodd" fill="url(#${id}-rg)"/><path class="c03-rimr" d="${rrect(40, 16)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`
      : `<g transform="translate(${RNt.x} ${RNt.y})"><path d="${circ(40)}${circ(26)}" fill-rule="evenodd" fill="url(#${id}-rg)"/><path class="c03-rimr" d="${circ(40)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`;
    // from 56px the figure charm is drawn flat: white die-cut margin, grey hood, club-colour jacket
    const J = founder ? tW(33, 33) : tR(40, 35);
    const A = MC.AVATAR;
    const fig =
      size >= 56
        ? `<g transform="translate(${J[0]} ${J[1]})"><g transform="translate(-25 -3.9) scale(.25)"><g fill="#6f7a87" stroke="#6f7a87" stroke-width="34" stroke-linejoin="round">${FIG_CUT(A)}</g><g fill="#fff" stroke="#fff" stroke-width="24" stroke-linejoin="round">${FIG_CUT(A)}</g><path d="${A.torso}" fill="${c.primary}"/><path d="${A.hood}" fill="#a3acb6"/><path d="${A.hoodRim}" fill="none" stroke="#5f6873" stroke-width="10"/></g>` +
          `<circle r="4.4" fill="none" stroke="#a9b2be" stroke-width="3.4"/></g>`
        : "";
    const carab = tk === "LEGEND" ? carabiner(id, founder ? tW(-24, -24) : tR(-100, 24), founder ? -22 : -8, 0.8, "back", true) : "";
    const n = String(p.ovr);
    const nfs = p.ovr >= 100 ? 72 : 112;
    const nx = inkX(n, nfs, 130);
    const ny = r2(GM.by + 0.315 * nfs);
    const defs =
      (founder
        ? `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#9db0ca"/><stop offset=".45" stop-color="#3a4e6b"/><stop offset=".7" stop-color="#7a92b4"/><stop offset="1" stop-color="#2c3d55"/></linearGradient>`
        : `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#eef1f4"/><stop offset=".45" stop-color="#8d97a3"/><stop offset=".7" stop-color="#d5dbe1"/><stop offset="1" stop-color="#7b8592"/></linearGradient>`) +
      `<linearGradient id="${id}-sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a423c"/><stop offset=".4" stop-color="#1e1b19"/><stop offset="1" stop-color="#100e0d"/></linearGradient>` +
      `<linearGradient id="${id}-nk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef1f4"/><stop offset=".4" stop-color="#c3cad2"/><stop offset=".7" stop-color="#dfe4e9"/><stop offset="1" stop-color="#99a3ae"/></linearGradient>` +
      `<mask id="${id}-mk" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="480"><rect width="260" height="480" fill="#fff"/><circle cx="${EY.x}" cy="${EY.y}" r="${HR + 9}" fill="#000"/></mask>` +
      `<clipPath id="${id}-be"><path d="M-10 281Q130 261 270 281V480H-10Z"/></clipPath><clipPath id="${id}-ec"><path d="${pearD(14)}"/></clipPath>` +
      `<clipPath id="${id}-oc"><path d="${pearD(0)}"/></clipPath>`;
    return (
      `<svg viewBox="${TVB.x} ${TVB.y} ${TVB.w} ${TVB.h}" width="${r2((size * TVB.w) / TVB.h)}" height="${size}" direction="ltr" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      carab +
      ringS +
      fig +
      ply +
      face +
      collar +
      `<path class="c03-rim" d="${pearD(0)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      `<text x="${nx != null ? nx : 130}" y="${ny}" ${nx != null ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${nfs}" fill="${T.num}">${esc(n)}</text>` +
      `</svg>`
    );
  }

  // 24–32px: a long-necked pear with a hole, its ring at the top-end (square = founder), the 84 on
  // the bulb's widest band, the club ply under it; LEGEND adds a D loop above the ring.
  const GMI = { cx: 8.6, top: 5.6, nh: 2, ne: 12.2, bh: 6.2, by: 19.6, bot: 25.8 };
  const MEY = { x: 8.6, y: 7.9 };
  const MV = { x: 1.9, y: -1.7, w: 15.9, h: 30.1 };
  function miniToken(p, o, size) {
    const mid = MC.uid("c03m");
    const tk = MC.TIERS.includes(p.tier) ? p.tier : "PRO";
    const c = p.club;
    const T = TOK[tk](c);
    const founder = !!p.founder;
    const list = TIER[tk].ply(c);
    const step = 0.5;
    const MP = (oy = 0) => pearG(GMI, 0, oy);
    const MH = (oy = 0) => holeD(1.15, oy, MEY);
    let ply = "";
    for (let k = list.length; k >= 1; k--) {
      ply += `<path d="${MP(step * k)}" fill="${list[k - 1]}"/>`;
      if (k === list.length) ply += `<path class="c03-rim" d="${MP(step * k)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    const FP = MP() + MH();
    let face;
    if (T.clear) face = `<path d="${FP}" fill-rule="evenodd" fill="${T.body}"/><path class="c03-clear" d="${MP()}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    else if (T.field)
      face =
        `<path d="${FP}" fill-rule="evenodd" fill="${T.body}"/>` +
        `<path d="${pearG(GMI, 0.9)}" fill="${T.field}" clip-path="url(#${mid}-mc)"/>`;
    else face = `<path d="${FP}" fill-rule="evenodd" fill="${T.body}"/>` + (T.stitch ? `<path d="${MP()}" fill="none" stroke="#3a2414" stroke-width=".7"/>` : "");
    const UVm = UV;
    let ringS;
    let top;
    if (founder) {
      const d = 3.55 + 1;
      const cx = r2(MEY.x + d * UVm[0]);
      const cy = r2(MEY.y + d * UVm[1]);
      ringS = `<g transform="translate(${cx} ${cy}) rotate(${TILT})"><path class="c03-mr" d="${rrect(2.8, 1)}" fill="none" stroke-width="1.25"/></g>`;
      top = [r2(cx - 2.51 * COS + 2.51 * SIN), r2(cy - 2.51 * SIN - 2.51 * COS)];
    } else {
      const d = 3.2 + 1;
      const cx = r2(MEY.x + d * UVm[0]);
      const cy = r2(MEY.y + d * UVm[1]);
      ringS = `<circle class="c03-mr" cx="${cx}" cy="${cy}" r="3.2" fill="none" stroke-width="1.25"/>`;
      top = [r2(cx - 0.6), r2(cy - 3.2)];
    }
    // LEGEND: a D loop standing on the ring's top corner
    const carab =
      tk === "LEGEND"
        ? `<g transform="translate(${top[0]} ${r2(top[1] + 0.9)}) rotate(-20)"><path class="c03-mc" d="M1.4 -1.1V-3.2C1.4 -4 .8 -4.5 0 -4.5C-.8 -4.5 -1.4 -4 -1.4 -3.2L-1.2 -1.1C-1.2 -.4 -.6 0 0 0C.7 0 1.4 -.4 1.4 -1.1Z" fill="none" stroke-width="1.3"/></g>`
        : "";
    const n = String(p.ovr);
    const fs = p.ovr >= 100 ? 5.6 : 8.6;
    const nx = inkX(n, fs, GMI.cx);
    const ny = r2(GMI.by + 0.315 * fs);
    return (
      `<svg viewBox="${MV.x} ${MV.y} ${MV.w} ${MV.h}" width="${r2((size * MV.w) / MV.h)}" height="${size}" direction="ltr" aria-hidden="true" focusable="false">` +
      (T.field ? `<defs><clipPath id="${mid}-mc"><path d="M0 16Q8.6 14.6 17.2 16V30H0Z"/></clipPath></defs>` : "") +
      ply +
      face +
      `<path class="c03-rim" d="${MP()}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      carab +
      ringS +
      `<text x="${nx != null ? nx : GMI.cx}" y="${ny}" ${nx != null ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" fill="${T.num}">${esc(n)}</text>` +
      `</svg>`
    );
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = o.mini || size <= 32;
    const S = MC.s(o);
    return (
      `<span class="c03 c03-tok${mini ? " is-mini" : ""}" role="img" aria-label="${esc(`${MC.nameOf(p, o)}, ${p.ovr} ${S.ovr}, ${S.tiers[p.tier]}${p.founder ? ", " + S.founderLine : ""}`)}" data-tier="${p.tier}">` +
      (mini ? miniToken(p, o, size) : bigToken(p, o, size)) +
      `</span>`
    );
  }

  /* ------------------------------------------------------------ row: the "My position" compact card */
  // the tier cue beside its name: a small pear in the tier's material over its club-colour ply
  function tierSwatch(p) {
    const tk = MC.TIERS.includes(p.tier) ? p.tier : "PRO";
    const T = TOK[tk](p.club);
    const G = { cx: 6, top: 0.6, nh: 1.6, ne: 4.6, bh: 4.6, by: 10.4, bot: 15.2 };
    return (
      `<svg class="c03-pg" viewBox="0 0 12 17" width="9" height="12.75" aria-hidden="true">` +
      `<path d="${pearG(G, 0, 1.4)}" fill="${p.club.primary}"/>` +
      `<path d="${pearG(G)}${holeD(0.85, 0, { x: 6, y: 2.3 })}" fill-rule="evenodd" fill="${T.field ? "#c3cad2" : T.body}"/>` +
      (T.field ? `<path d="${pearG(G, 1)}" fill="${T.field}" clip-path="inset(45% 0 0 0)"/>` : "") +
      `<path class="c03-rim" d="${pearG(G, 0, 1.4)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      `</svg>`
    );
  }
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const yr = p.founder ? String(p.founder).slice(2) : "";
    const yy = yr ? (ar ? yr + "·" : "·" + yr) : "";
    return (
      `<div class="c03 c03-row${o.me ? " is-me" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} data-tier="${p.tier}">` +
      `<span class="c03-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c03-rt">${token(p, { ...o, size: 54, mini: false })}</span>` +
      `<span class="c03-rn"><b><span class="c03-rnm">${esc(MC.nameOf(p, o))}</span>${yy ? `<i>${MC.ltr(yy)}</i>` : ""}</b>` +
      `<small>${tierSwatch(p)}<span>${esc(S.tiers[p.tier])}</span></small></span>` +
      `<span class="c03-rp"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ share: "Sur mon sac" */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid("c03s");
    const founder = !!p.founder;
    // hung by the ring's top corner from the zip pull: the whole assembly turns so the eyelet
    // hangs under the hook, and the fob is caught mid-swing, its bottom toward the end side
    const hook = founder ? sqW(-30.4, -30.4) : rnW(235);
    const whole = r2((Math.atan2(EY.x - hook[0], EY.y - hook[1]) * 180) / Math.PI);
    const net = -16;
    const swing = r2(net - whole);
    const A = art(p, { ...o, thumb: false }, id + "a");
    const A2 = art(p, { ...o, thumb: true }, id + "b");
    const sc = 1.42;
    const H = { x: 158, y: 84 };
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
      `<svg class="c03-sh-bg" viewBox="0 0 360 640" width="360" height="640" direction="ltr" aria-hidden="true" focusable="false"><defs>` +
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
      // the fob, its cast shadow thrown down-end by the top-start light
      `<g filter="url(#${id}-cs)">${obj(A2, "translate(14 18) ")}</g>` +
      `<g class="c03-shobj">${obj(A, "")}</g>` +
      // the zip slider and its pull tab; the ring passes through the tab's slot
      `<g transform="translate(${H.x} 66.3)">` +
      `<rect x="-14" y="-10" width="28" height="18" rx="5" fill="url(#${id}-zp)" stroke="#16181b" stroke-width="1"/>` +
      `<path d="M-12 -8H12" stroke="#fff" stroke-opacity=".4" stroke-width="1"/>` +
      `<path d="M-7 2H7V26A6 6 0 0 1 1 32H-1A6 6 0 0 1 -7 26ZM-3.6 14V22A3 3 0 0 0 -.6 25H.6A3 3 0 0 0 3.6 22V14A3 3 0 0 0 .6 11H-.6A3 3 0 0 0 -3.6 14Z" fill-rule="evenodd" fill="url(#${id}-zp)" stroke="#16181b" stroke-width="1"/>` +
      `<path d="M-5.6 4V25" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>` +
      `</g>` +
      `</svg>`;
    const label =
      `<div class="c03-sh-tag">` +
      `<div class="c03-sh-name"><b>${esc(MC.nameOf(p, o))}</b>${yy ? `<i>${MC.ltr(yy)}</i>` : ""}</div>` +
      `<div class="c03-sh-meta"><span class="c03-sh-h">${MC.ltr(handle)}</span><em>${ar ? "مثال" : "Exemple"}</em></div>` +
      `</div>`;
    return (
      `<div class="c03 c03-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c03-sh-logo">${MC.logo("wordmark", { variant: "light" })}</div>` +
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
    const fob = el.querySelector(".c03-fob");
    const sw = [...el.querySelectorAll(".c03-sw")];
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
    id: "c03",
    n: 3,
    slug: "03r",
    name: "Porte-clés",
    nameAr: "علّاقة المفاتيح",
    category: "safe",
    philosophy:
      "Your BotolaGO identity is the fob on your keyring: your club's crest at the neck, the 84 engraved like a room number, on a ring only 2026 founders have squared.",
    philosophyAr: "هويتك في BotolaGO هي الميدالية المعلّقة في حلقة مفاتيحك: شعار ناديك في عنقها، ورقم 84 محفور كرقم غرفة، وحلقة مربّعة لا يحملها إلا مؤسسو 2026.",
    idea: [
      "Not a card. The identity is a keyring fob: a long-necked paddle with a drilled hole, hung on a flat split ring, the object every Moroccan teenager already clips to a school bag and every family hangs by the door. It is carried, not displayed, which is why it belongs to you rather than to an organiser.",
      "The layout is the hotel key fob, which solved this problem decades ago: a narrow neck that carries the house crest and the house name (here, your club's crest and your tier), a wide bulb with one big engraved number (the 84), and a return line round the bottom edge (here, BOT #004821, the season and MOROCCO). The four stats are an engraved column down the neck, read top to bottom like a team sheet, not FUT's number-over-label row.",
      "Its outline is the asset: a long straight neck with an open hole, a ring at its top-end and the figure charm hanging beside the neck. At 28px it reads as a hanging fob, not a map pin (the point is at the top) and not a luggage tag (there is no rectangle anywhere).",
      "Every tier is the same object in a better material, the way real fobs are: moulded PVC, acrylic with a printed insert, bakelite, hard enamel on nickel, and finally match-ball leather. The edge under the bulb shows the plies it is laminated from, one to four, and one ply is always your club colour, so allegiance runs through the object instead of being painted on it.",
    ],
    belonging: [
      "'Show me your ring.' A founder ring is square; every later cohort's is round. You can tell a 2026 founder across a leaderboard without reading a word, and nobody can ever get that ring again.",
      "Your club is on it twice: the crest at the neck, moulded, printed, engraved, enamelled or hot-stamped depending on the tier, and the club-colour ply in its edge. On the small token the club becomes a collar round the neck.",
      "The only charm is the permanent one: an acrylic bag charm of the manager seen from behind at the touchline, a grey hood over a bench jacket in your club colour, die-cut with a white margin like the charms already hanging off school bags. One more charm would be added for each completed season; ALI has none yet, so none is drawn. Charms only ever add.",
      "Teenagers want the leather fob and the carabiner; adults respect bakelite and leather. Neither looks like a game skin, which keeps it wearable for the 35-year-old Fantasy veteran and still covetable at 15.",
      "Screenshot value comes from the object, not the template: a keyring on your actual bag, mid-swing, is a photo people already take. The share image is exactly that photo.",
    ],
    founderMark: [
      "The founder mark changes the object itself: the split ring is forged as a rounded square in blued steel, the only square ring the system will ever issue. Later cohorts get round rings in plain steel, so 2026 is always first.",
      "2026 is stamped big through the bluing on the ring's top bar, and FOUNDER (عضو مؤسس) runs down its end bar, so the letters show as bright bare steel against the blue. The name carries the year the way supporter groups carry theirs: ALI ·26.",
      "It never upgrades and never changes with tier. At LEGEND the carabiner hooks through that same ring, so the founder ring is literally what the top of the object hangs from.",
      "At 24px the ring is a 6px square against everyone else's circle: a corner signal that survives the silhouette test.",
    ],
    small: [
      "44–80px: the fob with the 84 set in Changa 800 on the bulb's widest band, the ring (square or round) and, from 56px, the figure charm. A collar in the club colour between keylines of its second colour wraps the neck, so the club reads even when its colour is dark. Flat colour, no filters.",
      "24–32px: a long-necked pear with its hole, the ring at its top-end, the 84 on the bulb's widest band and the club ply under it. The material reads as colour: slate PVC, cream insert, black bakelite, nickel with a club-colour field, tan leather. LEGEND adds a D loop above the ring, which changes the black-and-white outline.",
      "The silhouette is asymmetric on purpose (the ring sits at the top-end and never mirrors), which is what makes it recognisable before anything is read.",
    ],
    rtl: [
      "The fob is a physical object, so it never mirrors: the ring stays at the same corner and the charm hangs where it hangs. Only the engraving changes script.",
      "علي is set in Changa 800 at the same size as ALI, with 26· to its left so the dot stays beside the name. The stat column puts the Arabic label (القائد، التشكيلة، الانتقالات، الثبات) to the right of its figure, with figures aligned in a column and kept LTR. No letter-spacing on any Arabic run.",
      "The ring reads 2026 on its top bar and عضو مؤسس down its end bar; the bottom return line reads المغرب · 2026/27 · BOT #004821, right to left with the codes kept LTR.",
    ],
    tiers: {
      HOMA: "Soft moulded PVC in the club colour, new and matte, with a raised cream rim that wraps round the eyelet, a moulded crest and raised cream lettering. One ply. The full outline, never a lesser shape: the street origin shows only in the material.",
      STADE: "Clear injection acrylic round a printed paper insert, with a halftone vignette, a printed club keyline and a printed crest. You can see the 5u of clear plastic at the edge and one diagonal glare across it. Two plies.",
      PRO: "Weighted bakelite, warm black with thin oxblood veins and a soft sheen on its top-start shoulder. The crest, the 84 and every word are engraved and paint-filled in the club's colours, the way hotel fobs were made. Three plies, with the club colour sandwiched in the middle.",
      CHAMPION: "A polished nickel blank with a bevelled border and two hard-enamel fields split by a cloisonné wire: the club's second colour in the neck (crest, tier and stats in dark raised nickel), the club colour in the bulb (the name and the 84 in raised polished nickel). Four plies.",
      LEGEND: "Cut from vintage match-ball leather: fine-grained, edge-painted and saddle-stitched in waxed cream thread, with the panel seams of an old ball across the shoulders and a hot-stamped crest. The 84 is stamped and debossed in black ink. A heavy machined steel carabiner hooks through the ring and stands above it. No precious metal.",
    },
    legend: [
      "LEGEND is the only tier that changes the object's outline: a heavy machined D carabiner, knurled gate and all, hooks through the ring's top bar and stands above it, so even at 24px a LEGEND fob has a loop above its ring that nobody else's has.",
      "The material is the one every football fan wants to touch: old match-ball leather, grained and darkened at the edges, edge-painted and sewn in cream thread, with a ball's panel seams across the shoulders. The stats stay on the front, debossed in ink.",
      "With motion on, the fob settles on the ring with a heavier, slower swing than any other tier: three damped arcs, then a dead stop. The 84 is visible the whole time; the swing is a replay, never a reveal.",
    ],
    advantages: [
      "Instantly understood by anyone: a keyring needs no explanation and no gaming literacy.",
      "A silhouette no card game owns: a long-necked paddle with an open hole, a ring at its top-end and a figure charm, asymmetric and readable at 28px.",
      "The founder mark is part of the outline (square ring), not a sticker; the tier is the material plus a countable edge; the club is the crest and a ply.",
      "Charms give an honest place for season history without inventing rarity or scarcity: only the permanent figure charm is drawn until a season is actually completed.",
      "No overlap with an existing BotolaGO surface (unlike a shirt back or a ticket), and nothing that reads as money, betting or an access pass.",
    ],
    risks: [
      "A key implies access. Copy must never say accès, clé or 'unlock' beyond the concept's own name; the share image shows a bag, never a door.",
      "Keyrings can read as a cheap souvenir. HOMA and STADE are the riskiest tiers; the bakelite, enamel and leather tiers have to carry the prestige, and the materials must stay rendered, not flat.",
      "At 24px the pear can still read as a bulb or a bottle. The neck, the open hole and the ring at the top-end are what make it a fob, so none of them may be dropped at small sizes.",
      "The club collar on the token depends on the club's two colours contrasting with each other; a club whose colours are both dark needs a light keyline fallback.",
      "The four plies are subtle at 44px on the dark ground; tier recognition there leans on material colour more than on counting plies.",
      "Selling physical fobs or rings would destroy the founder mark and look pay-to-win. Never.",
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
