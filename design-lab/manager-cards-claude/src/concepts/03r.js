/* 03 PORTE-CLÉS (safe). Your BotolaGO identity is the fob on your keyring: a pear-shaped
   paddle with your number engraved like a room number, hung on a flat split ring that only
   2026 founders have squared, collecting charms that only ever add.
   One object, five materials: moulded PVC, acrylic with a printed insert, bakelite, hard
   enamel on nickel, and match-ball leather. The laminated edge under the bulb shows the
   tier as stacked plies (1 to 4), and one of those plies is always the club colour.
   The object never mirrors in Arabic; only its type does. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const r2 = (n) => Math.round(n * 100) / 100;

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
  try {
    if (document.fonts && document.fonts.load) {
      ["800 100px Changa", "600 100px Changa", "800 100px Manrope", "700 100px Manrope"].forEach((f) => document.fonts.load(f, "AZ09·#/"));
      ["800 100px Changa", "700 100px \"Noto Sans Arabic\""].forEach((f) => document.fonts.load(f, "علي محترف"));
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

  /* ------------------------------------------------------------ geometry (viewBox 0 0 260 420) */
  // The pear paddle: a 60u neck with the eyelet, flaring to a 220u bulb with a round bottom.
  // d insets the outline (for moulded rims, inserts, stitching); oy shifts it (edge plies).
  function pearD(d = 0, oy = 0) {
    const L = 100 + d;
    const R = 160 - d;
    const rr = 30 - d;
    const y = (v) => r2(v + oy);
    return (
      `M130 ${y(92 + d)}A${rr} ${rr} 0 0 1 ${R} ${y(122)}L${R} ${y(140)}` +
      `C${R} ${y(196)} ${240 - d} ${y(226)} ${240 - d} ${y(322)}` +
      `A${110 - d} ${88 - d} 0 0 1 ${20 + d} ${y(322)}` +
      `C${20 + d} ${y(226)} ${L} ${y(196)} ${L} ${y(140)}L${L} ${y(122)}A${rr} ${rr} 0 0 1 130 ${y(92 + d)}Z`
    );
  }
  const EY = { x: 130, y: 112 };
  const holeD = (r = 10, oy = 0) =>
    `M${EY.x + r} ${r2(EY.y + oy)}A${r} ${r} 0 1 0 ${EY.x - r} ${r2(EY.y + oy)}A${r} ${r} 0 1 0 ${EY.x + r} ${r2(EY.y + oy)}Z`;
  const faceD = (oy = 0) => pearD(0, oy) + holeD(10, oy);

  // The split ring. Founders: a rounded SQUARE (80u outer, 12u band), tilted 18deg toward the
  // inline end, its bottom bar running through the eyelet. Everyone else: a round ring.
  const TILT = 18;
  const RAD = (TILT * Math.PI) / 180;
  const COS = Math.cos(RAD);
  const SIN = Math.sin(RAD);
  const SQ = { x: 148.1, y: 82.1 };
  const RN = { x: 148.4, y: 85.8, r: 32 };
  const rrect = (h, r) =>
    `M${-h + r} ${-h}H${h - r}A${r} ${r} 0 0 1 ${h} ${-h + r}V${h - r}A${r} ${r} 0 0 1 ${h - r} ${h}H${-h + r}A${r} ${r} 0 0 1 ${-h} ${h - r}V${-h + r}A${r} ${r} 0 0 1 ${-h + r} ${-h}Z`;
  const circ = (r) => `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;
  const sqW = (x, y) => [r2(SQ.x + x * COS - y * SIN), r2(SQ.y + x * SIN + y * COS)];
  const rnW = (deg, rr = RN.r) => [r2(RN.x + rr * Math.cos((deg * Math.PI) / 180)), r2(RN.y + rr * Math.sin((deg * Math.PI) / 180))];
  // Where the charms hang on each ring, and which way they fall in the flat lay.
  const ATT = {
    sq: { fig: sqW(34, -9), ball: sqW(31.1, 31.1), carab: sqW(-34, -2) },
    rn: { fig: rnW(-12), ball: rnW(42), carab: rnW(196) },
  };
  // The half-plane where the band runs in FRONT of the fob, before it dives into the eyelet.
  function frontClip(founder) {
    const t = founder ? [COS, SIN] : [0.819, 0.574];
    const n = [-t[1], t[0]];
    const L = 400;
    const P = (a, b) => `${r2(EY.x + a * n[0] + b * t[0])} ${r2(EY.y + a * n[1] + b * t[1])}`;
    return `M${P(L, 0)}L${P(L, -L)}L${P(-L, -L)}L${P(-L, 0)}Z`;
  }

  /* ------------------------------------------------------------ tiers */
  // n = laminated plies on the edge. ply() lists them top to bottom; one is always the club colour.
  const TIER = {
    HOMA: { n: 1, ply: (c) => [mix(c.primary, "#000000", 0.38)] },
    STADE: { n: 2, ply: (c) => ["#9fb3c8", c.primary] },
    PRO: { n: 3, ply: (c) => ["#2e2925", c.primary, "#141210"] },
    CHAMPION: { n: 4, ply: (c) => ["#8e97a3", c.primary, "#6b7480", c.primary] },
    LEGEND: { n: 4, ply: (c) => ["#7d5a3a", c.primary, "#5f4229", c.primary] },
  };
  const PLY = 2.2; // ply thickness in viewBox units

  /* ------------------------------------------------------------ shared defs */
  function defsCommon(id, founder) {
    return (
      // blued steel (founder ring) or plain steel, in ring-local space
      (founder
        ? `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#7189ad"/><stop offset=".17" stop-color="#32455f"/><stop offset=".36" stop-color="#9db0ca"/><stop offset=".5" stop-color="#3a4e6b"/><stop offset=".7" stop-color="#22324a"/><stop offset=".86" stop-color="#6580a4"/><stop offset="1" stop-color="#2a3b54"/></linearGradient>`
        : `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#e6ebf0"/><stop offset=".2" stop-color="#87919d"/><stop offset=".4" stop-color="#f3f6f9"/><stop offset=".56" stop-color="#a9b2be"/><stop offset=".76" stop-color="#6b7683"/><stop offset=".9" stop-color="#c7ced6"/><stop offset="1" stop-color="#8a94a0"/></linearGradient>`) +
      // cut steel for charms and fittings
      `<linearGradient id="${id}-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f4f7"/><stop offset=".42" stop-color="#a9b2be"/><stop offset=".68" stop-color="#77818e"/><stop offset="1" stop-color="#cfd5dc"/></linearGradient>` +
      `<radialGradient id="${id}-bl" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#c9d0d8"/><stop offset=".8" stop-color="#7d8794"/><stop offset="1" stop-color="#5b6470"/></radialGradient>` +
      `<clipPath id="${id}-fr"><path d="${frontClip(founder)}"/></clipPath>` +
      `<clipPath id="${id}-fc"><path d="${pearD(0)}"/></clipPath>` +
      `<clipPath id="${id}-bc"><circle r="8.6"/></clipPath>`
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
    `<feFlood flood-color="#06101c" flood-opacity=".6"/><feComposite in2="bo" operator="in" result="ds"/>` +
    `<feOffset in="SourceAlpha" dx=".7" dy=".9" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>` +
    `<feFlood flood-color="#fff" flood-opacity=".6"/><feComposite in2="e" operator="in" result="hl"/>` +
    `<feOffset in="SourceAlpha" dx="-.6" dy="-.8" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="e2"/>` +
    `<feFlood flood-color="#000" flood-opacity=".25"/><feComposite in2="e2" operator="in" result="lo"/>` +
    `<feMerge><feMergeNode in="ds"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hl"/><feMergeNode in="lo"/></feMerge></filter>`;
  // Raised polished nickel (CHAMPION): a hairline cast shadow into the enamel.
  const fNickel = (id) =>
    `<filter id="${id}-ink" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation=".6" result="b"/><feOffset in="b" dx=".6" dy="1.1" result="bo"/>` +
    `<feFlood flood-color="#05090f" flood-opacity=".7"/><feComposite in2="bo" operator="in" result="ds"/>` +
    `<feMerge><feMergeNode in="ds"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
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
  function plies(tk, c, thumb, step = PLY) {
    const list = TIER[tk].ply(c);
    let s = "";
    for (let k = list.length; k >= 1; k--) {
      const last = k === list.length;
      s +=
        `<path d="${faceD(step * k)}" fill-rule="evenodd" fill="${list[k - 1]}"` +
        (tk === "STADE" && k === 1 ? ` fill-opacity=".8"` : "") +
        ` stroke="#000" stroke-opacity=".35" stroke-width=".4"/>` +
        (last ? `<path class="c03-rim" d="${pearD(0, step * k)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` : "");
    }
    return s;
  }

  function faceHoma(id, c, thumb) {
    const f = thumb ? "" : ` filter="url(#${id}-mat)"`;
    const defs = thumb
      ? ""
      : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b"/>` +
        `<feDiffuseLighting in="b" surfaceScale="7" diffuseConstant="1.25" lighting-color="#fff" result="dl"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>` +
        `<feBlend in="SourceGraphic" in2="dl" mode="multiply" result="m"/>` +
        `<feSpecularLighting in="b" surfaceScale="7" specularConstant="1" specularExponent="24" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>` +
        `<feComposite in="m" in2="sp" operator="arithmetic" k2="1" k3=".7" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
        `<mask id="${id}-mk" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="420"><rect width="260" height="420" fill="#fff"/><circle cx="130" cy="112" r="16" fill="#000"/></mask>` +
        fRaise(id);
    // moulded PVC in club colour with a raised rim that wraps round the eyelet
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="${c.primary}"${f}/>` +
      `<g fill="none" stroke="${c.secondary}" stroke-width="2.6"${thumb ? "" : ` filter="url(#${id}-ink)"`}>` +
      `<path d="${pearD(8)}"${thumb ? "" : ` mask="url(#${id}-mk)"`}/><circle cx="130" cy="112" r="16"/></g>`;
    return { defs, body, ink: { fill: c.secondary } };
  }

  function faceStade(id, c, thumb) {
    const defs =
      `<pattern id="${id}-ht" width="4.4" height="4.4" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><circle cx="2.2" cy="2.2" r="1.15" fill="${c.primary}"/></pattern>` +
      `<filter id="${id}-hb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>` +
      `<mask id="${id}-hm" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="420"><path d="${pearD(5)}" fill="none" stroke="#fff" stroke-width="26" filter="url(#${id}-hb)"/></mask>` +
      `<mask id="${id}-km" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="420"><rect width="260" height="420" fill="#fff"/><circle cx="130" cy="112" r="19.5" fill="#000"/></mask>` +
      `<linearGradient id="${id}-gl" gradientUnits="userSpaceOnUse" x1="40" y1="150" x2="70" y2="215"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    // clear injection acrylic: you see its 5u thickness round a printed paper insert
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="#d9e8f5" fill-opacity=".16"/>` +
      `<path d="${pearD(5)}${holeD(15)}" fill-rule="evenodd" fill="${c.secondary}"/>` +
      (thumb ? "" : `<path d="${pearD(5)}${holeD(15)}" fill-rule="evenodd" fill="url(#${id}-ht)" mask="url(#${id}-hm)" opacity=".55"/>`) +
      `<g fill="none" stroke="${c.primary}" stroke-width="1.5"><path d="${pearD(10)}" mask="url(#${id}-km)"/><circle cx="130" cy="112" r="19.5"/></g>` +
      `<path d="${pearD(3.6)}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width=".6"/>` +
      `<path d="${faceD()}" fill="none" stroke="#f1f7fc" stroke-opacity=".85" stroke-width=".9"/>` +
      `<circle cx="130" cy="112" r="15" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".6"/>` +
      (thumb ? "" : `<path d="M10 236L250 120V150L10 266Z" fill="url(#${id}-gl)" clip-path="url(#${id}-fc)"/>`);
    return { defs, body, ink: { fill: c.primary } };
  }

  function facePro(id, c, thumb) {
    const defs =
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          `<feTurbulence type="fractalNoise" baseFrequency=".007 .024" numOctaves="3" seed="4" result="n"/>` +
          `<feColorMatrix in="n" type="matrix" values="0 0 0 0 .33  0 0 0 0 .22  0 0 0 0 .16  3.4 0 0 0 -1.86" result="v"/>` +
          `<feComposite in="v" in2="SourceAlpha" operator="in" result="vn"/>` +
          `<feMerge result="base"><feMergeNode in="SourceGraphic"/><feMergeNode in="vn"/></feMerge>` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b"/>` +
          `<feSpecularLighting in="b" surfaceScale="10" specularConstant=".8" specularExponent="20" lighting-color="#fff3e4" result="sp"><feDistantLight azimuth="225" elevation="36"/></feSpecularLighting>` +
          `<feComposite in="base" in2="sp" operator="arithmetic" k2="1" k3=".55" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
          fEng(id)) + `<linearGradient id="${id}-sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3430"/><stop offset=".45" stop-color="#1e1b19"/><stop offset="1" stop-color="#121010"/></linearGradient>`;
    // weighted bakelite: warm black with oxblood veins and a soft sheen; drilled eyelet
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="${thumb ? `url(#${id}-sh)` : "#1e1b19"}"${thumb ? "" : ` filter="url(#${id}-mat)"`}/>` +
      `<path d="M138.7 117A10 10 0 0 1 121.3 117" fill="none" stroke="#fff4e8" stroke-opacity=".3" stroke-width="1.2"/>`;
    return { defs, body, ink: { fill: c.secondary } };
  }

  function faceChampion(id, c, thumb) {
    const defs =
      `<linearGradient id="${id}-nk" gradientUnits="userSpaceOnUse" x1="20" y1="92" x2="240" y2="410"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".14" stop-color="#9aa3ae"/><stop offset=".3" stop-color="#e8ecf0"/><stop offset=".47" stop-color="#8c96a2"/><stop offset=".62" stop-color="#d9dfe5"/><stop offset=".8" stop-color="#7a8491"/><stop offset="1" stop-color="#c3cad2"/></linearGradient>` +
      `<linearGradient id="${id}-nt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".38" stop-color="#dfe4ea"/><stop offset=".56" stop-color="#9aa4b0"/><stop offset=".78" stop-color="#eef1f4"/><stop offset="1" stop-color="#b9c1ca"/></linearGradient>` +
      `<clipPath id="${id}-en"><path d="${pearD(5.5)}"/></clipPath>` +
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b"/>` +
          `<feSpecularLighting in="b" surfaceScale="3" specularConstant="1" specularExponent="34" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="44"/></feSpecularLighting>` +
          `<feComposite in="SourceGraphic" in2="sp" operator="arithmetic" k2="1" k3=".7" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
          `<filter id="${id}-br" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
          `<feTurbulence type="fractalNoise" baseFrequency=".012 1.1" numOctaves="2" seed="5" result="n"/>` +
          `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .7 -.2" result="w"/>` +
          `<feComposite in="w" in2="SourceAlpha" operator="in" result="wl"/>` +
          `<feBlend in="SourceGraphic" in2="wl" mode="soft-light"/></filter>` +
          fNickel(id));
    const band = (y0, y1) => `M-10 ${y0 + 9}Q130 ${y0 - 9} 270 ${y0 + 9}L270 ${y1 + 9}Q130 ${y1 - 9} -10 ${y1 + 9}Z`;
    const wire = (y) => `M-10 ${y + 9}Q130 ${y - 9} 270 ${y + 9}`;
    // nickel-silver blank, hard enamel fields flush to the polished cloisonné wires
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="url(#${id}-nk)"${thumb ? "" : ` filter="url(#${id}-br)"`}/>` +
      `<g${thumb ? "" : ` filter="url(#${id}-mat)"`}>` +
      `<path d="${pearD(5.5)}${holeD(16.5)}" fill-rule="evenodd" fill="${c.primary}"/>` +
      `<path d="${band(240, 250)}" fill="${c.secondary}" clip-path="url(#${id}-en)"/></g>` +
      `<g fill="none" stroke="url(#${id}-nk)" stroke-width="2.2" clip-path="url(#${id}-en)"><path d="${wire(239)}"/><path d="${wire(251)}"/></g>` +
      `<circle cx="130" cy="112" r="13.3" fill="none" stroke="url(#${id}-nk)" stroke-width="6.6"/>` +
      `<circle cx="130" cy="112" r="10.2" fill="none" stroke="#3b434d" stroke-width=".6"/>` +
      `<path d="${pearD(0.6)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7" clip-path="url(#${id}-tl)"/>` +
      `<clipPath id="${id}-tl"><path d="M0 0H200L0 300Z"/></clipPath>`;
    return { defs, body, ink: { fill: `url(#${id}-nt)`, stroke: "#2b333d", sw: 0.45 } };
  }

  function faceLegend(id, c, thumb) {
    const defs =
      (thumb
        ? ""
        : `<filter id="${id}-mat" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
          `<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="9" result="g"/>` +
          `<feDiffuseLighting in="g" surfaceScale="1.5" diffuseConstant="1.2" lighting-color="#fff" result="gb"><feDistantLight azimuth="225" elevation="55"/></feDiffuseLighting>` +
          `<feBlend in="SourceGraphic" in2="gb" mode="multiply" result="m"/>` +
          `<feTurbulence type="fractalNoise" baseFrequency=".016" numOctaves="3" seed="21" result="p"/>` +
          `<feColorMatrix in="p" type="matrix" values="0 0 0 0 .42  0 0 0 0 .27  0 0 0 0 .14  2.6 0 0 0 -1.25" result="pa"/>` +
          `<feComposite in="pa" in2="SourceAlpha" operator="in" result="pat"/>` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="4.5" result="eb"/>` +
          `<feColorMatrix in="eb" type="matrix" values="0 0 0 0 .3  0 0 0 0 .18  0 0 0 0 .09  0 0 0 -1.15 1" result="burn"/>` +
          `<feComposite in="burn" in2="SourceAlpha" operator="in" result="bur"/>` +
          `<feMerge result="base"><feMergeNode in="m"/><feMergeNode in="pat"/><feMergeNode in="bur"/></feMerge>` +
          `<feGaussianBlur in="SourceAlpha" stdDeviation="8" result="b"/>` +
          `<feSpecularLighting in="b" surfaceScale="8" specularConstant=".6" specularExponent="18" lighting-color="#fff1dc" result="sp"><feDistantLight azimuth="225" elevation="38"/></feSpecularLighting>` +
          `<feComposite in="base" in2="sp" operator="arithmetic" k2="1" k3=".5" result="s"/><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
          fDeboss(id)) +
      `<radialGradient id="${id}-lg" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d6b38b"/><stop offset=".7" stop-color="#c29b70"/><stop offset="1" stop-color="#9c7650"/></radialGradient>` +
      `<clipPath id="${id}-sc"><path d="${pearD(3.5)}"/></clipPath>` +
      `<mask id="${id}-mk" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="420"><rect width="260" height="420" fill="#fff"/><circle cx="130" cy="112" r="20.5" fill="#000"/></mask>`;
    // the panel seams of an old match ball: a Y junction where three panels meet
    const seams = ["M-10 251Q130 233 270 251", "M206 241.6Q213 283 240 322", "M54 241.6Q47 283 20 322"];
    const seam = (d) =>
      `<path d="${d}" stroke="#6f4a2b" stroke-width="2.2"/>` +
      (thumb ? "" : `<path d="${d}" stroke="#3a2a1c" stroke-width="5.4" stroke-dasharray="1.15 3.6"/>`) +
      `<path d="${d}" stroke="#2c1d11" stroke-width="1.1"/>` +
      (thumb ? "" : `<path d="${d}" stroke="#ffe7c6" stroke-opacity=".35" stroke-width=".7" transform="translate(.5 1)"/>`);
    const body =
      `<path d="${faceD()}" fill-rule="evenodd" fill="${thumb ? `url(#${id}-lg)` : "#c8a27a"}"${thumb ? "" : ` filter="url(#${id}-mat)"`}/>` +
      `<g fill="none" stroke-linecap="round" clip-path="url(#${id}-sc)">${seams.map(seam).join("")}</g>` +
      // saddle stitching round the edge and the eyelet (two layers of leather sewn together)
      `<g fill="none" stroke-linecap="round">` +
      (thumb ? "" : `<g stroke="#5a3d24" stroke-opacity=".3" stroke-width="2.6"><path d="${pearD(6.5)}" mask="url(#${id}-mk)"/><circle cx="130" cy="112" r="20.5"/></g>`) +
      `<g stroke="#3a2a1c" stroke-width="1.3" stroke-dasharray="3.2 2.3"><path d="${pearD(6.5)}" mask="url(#${id}-mk)"/><circle cx="130" cy="112" r="20.5"/></g></g>` +
      // steel rivet eyelet
      `<circle cx="130" cy="112" r="13" fill="none" stroke="#4a525c" stroke-width="7"/>` +
      `<circle cx="130" cy="112" r="13" fill="none" stroke="url(#${id}-st)" stroke-width="5.6"/>` +
      `<circle cx="130" cy="112" r="10.3" fill="none" stroke="#2a3038" stroke-width=".7"/>`;
    return { defs, body, ink: { fill: "#14161a" } };
  }

  const FACE = { HOMA: faceHoma, STADE: faceStade, PRO: facePro, CHAMPION: faceChampion, LEGEND: faceLegend };

  /* ------------------------------------------------------------ the engraving */
  function engraving(p, o, id, ink, thumb) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const paint = `fill="${ink.fill}"` + (ink.stroke ? ` stroke="${ink.stroke}" stroke-width="${ink.sw}" paint-order="stroke"` : "");
    let s = "";

    if (!thumb) {
      // tier, in the neck where a hotel fob carries the house name
      const tier = S.tiers[p.tier];
      if (ar) {
        const w = wAt('700 100px "Noto Sans Arabic"', tier, 11, 0.5);
        const fs = r2(Math.min(11, (11 * 44) / Math.max(1, w)));
        s += `<text x="130" y="152" text-anchor="middle" font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="700" font-size="${fs}" ${paint} fill-opacity=".78">${esc(tier)}</text>`;
      } else {
        const ls = 0.12;
        const w = wAt("800 100px Manrope", tier, 10.5, 0.72) + tier.length * ls * 10.5;
        const fs = r2(Math.min(10.5, (10.5 * 46) / Math.max(1, w)));
        s += `<text x="${r2(130 + (ls * fs) / 2)}" y="151" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${fs}" letter-spacing="${r2(ls * fs)}" ${paint} fill-opacity=".78">${esc(tier)}</text>`;
      }

      // the stats, an engraved column down the neck: figures read down one line
      const vf = 12.5;
      const lf = ar ? 10 : 10.5;
      const lFont = ar ? '700 100px "Noto Sans Arabic"' : "800 100px Manrope";
      const lls = ar ? 0 : 0.06;
      const labels = MC.STATS.map((k) => S.stats[k]);
      const lw = Math.max(...labels.map((t) => wAt(lFont, t, lf, ar ? 0.5 : 0.72) + (ar ? 0 : t.length * lls * lf)));
      const vw = Math.max(...MC.STATS.map((k) => wAt("800 100px Manrope", String(p.stats[k]), vf, 0.62)));
      const gap = 7;
      const block = lw + gap + vw;
      const left = 130 - block / 2;
      const ys = [184, 200, 216, 232];
      MC.STATS.forEach((k, i) => {
        const y = ys[i];
        const lab = esc(S.stats[k]);
        const val = esc(p.stats[k]);
        if (ar) {
          // RTL reading: the label at the right, its figure to its left, figures aligned
          const ax = r2(left + vw);
          s +=
            `<text x="${ax}" y="${y}" text-anchor="end" font-family="Manrope, sans-serif" font-weight="800" font-size="${vf}" style="font-variant-numeric:tabular-nums" ${paint}>${val}</text>` +
            `<text x="${r2(ax + gap)}" y="${y}" font-family="Noto Sans Arabic, Changa, sans-serif" font-weight="700" font-size="${lf}" ${paint} fill-opacity=".72">${lab}</text>`;
        } else {
          const ax = r2(left + lw);
          s +=
            `<text x="${ax}" y="${y}" text-anchor="end" font-family="Manrope, sans-serif" font-weight="800" font-size="${lf}" letter-spacing="${r2(lls * lf)}" ${paint} fill-opacity=".72">${lab}</text>` +
            `<text x="${r2(ax + gap)}" y="${y}" font-family="Manrope, sans-serif" font-weight="800" font-size="${vf}" style="font-variant-numeric:tabular-nums" ${paint}>${val}</text>`;
        }
      });
    }

    // the name, and the founder year after it the way supporter groups carry theirs
    const name = MC.nameOf(p, o);
    const nfont = "800 100px Changa";
    const nw30 = wAt(nfont, name, 30, ar ? 0.55 : 0.6);
    const yy = p.founder ? "·" + String(p.founder).slice(2) : "";
    let nfs = 30;
    const sufW = (fs) => (yy ? wAt("600 100px Changa", yy, fs * 0.62, 0.5) + fs * 0.14 : 0);
    if (nw30 + sufW(30) > 176) nfs = Math.max(17, (30 * 176) / (nw30 + sufW(30)));
    const nw = (nw30 * nfs) / 30;
    const sw = sufW(nfs);
    const total = nw + sw;
    const x0 = 130 - total / 2;
    const ny = 278;
    const nameX = ar ? x0 + sw : x0;
    const sufX = ar ? x0 : x0 + nw + nfs * 0.14;
    s +=
      `<text x="${r2(nameX)}" y="${ny}" font-family="Changa, sans-serif" font-weight="800" font-size="${r2(nfs)}" ${paint}${nw30 * (nfs / 30) > 178 ? ` textLength="176" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(name)}</text>` +
      (yy ? `<text x="${r2(sufX)}" y="${ny}" font-family="Changa, sans-serif" font-weight="600" font-size="${r2(nfs * 0.62)}" direction="ltr" ${paint} fill-opacity=".74">${esc(yy)}</text>` : "");

    // the 84: engraved at the centre of the bulb like a room number, ink-centred in a fixed slot
    const fs = p.ovr >= 100 ? 88 : 108;
    const m = meas("800 100px Changa", String(p.ovr));
    const x84 = m ? r2(130 - (((m.r - m.l) / 2) * fs) / 100) : 130;
    s += `<text x="${x84}" y="382" ${m ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" ${paint}>${esc(p.ovr)}</text>`;

    // the BotolaGO ID, season and country, engraved round the bottom like a hotel fob's return line
    if (!thumb) {
      const sp = ` font-family="Manrope, Noto Sans Arabic, sans-serif" font-weight="700" font-size="6.3" ${paint} fill-opacity=".7"`;
      const lat = `${p.id} · ${p.season} · `;
      s += ar
        ? `<text${sp} direction="rtl"><textPath href="#${id}-rp" startOffset="50%" text-anchor="middle">${esc(S.country)} · ${esc(p.season)} · <tspan letter-spacing="1">${esc(p.id)}</tspan></textPath></text>`
        : `<text${sp} letter-spacing="1"><textPath href="#${id}-rp" startOffset="50%" text-anchor="middle">${esc(lat + S.country)}</textPath></text>`;
    }
    return `<g${thumb || !ink.filter ? "" : ` filter="url(#${id}-ink)"`}>${s}</g>`;
  }

  /* ------------------------------------------------------------ ring, charms, carabiner */
  function ring(p, o, id, thumb, part) {
    const founder = !!p.founder;
    const S = MC.s(o);
    const ar = MC.isAr(o);
    let s;
    if (founder) {
      s =
        `<g transform="translate(${SQ.x} ${SQ.y}) rotate(${TILT})">` +
        `<path d="${rrect(40, 16)}${rrect(28, 4)}" fill-rule="evenodd" fill="url(#${id}-rg)"/>` +
        `<path d="${rrect(39.6, 15.6)}" fill="none" stroke="#dbe5f2" stroke-opacity=".75" stroke-width=".8"/>` +
        `<path d="${rrect(28.3, 4.3)}" fill="none" stroke="#0d1520" stroke-opacity=".6" stroke-width=".8"/>` +
        // the split: where the top coil ends
        `<path d="M27.6 -17V-17M28 -18.6L40.4 -15.8" stroke="#0d1520" stroke-width="1.1"/><path d="M28 -17.2L40.2 -14.4" stroke="#c9d6e8" stroke-opacity=".6" stroke-width=".6"/>`;
      if (!thumb && part !== "front") {
        // FOUNDER 2026 stamped through the bluing on the top bar: bright bare steel
        const t = S.founderLine;
        const fsMax = ar ? 7.2 : 6.4;
        const w = ar ? wAt('700 100px "Noto Sans Arabic"', t, fsMax, 0.5) : wAt("800 100px Manrope", t, fsMax, 0.68) + t.length * 0.08 * fsMax;
        const fs = r2(Math.min(fsMax, (fsMax * 45) / Math.max(1, w)));
        const font = ar ? `font-family="Noto Sans Arabic, sans-serif" font-weight="700" direction="rtl"` : `font-family="Manrope, sans-serif" font-weight="800" letter-spacing="${r2(0.08 * fs)}"`;
        const dy = ar ? 2.2 : r2(fs * 0.36);
        s +=
          `<text x="${ar ? 0 : r2(0.04 * fs)}" y="${r2(-34 + dy + 0.45)}" text-anchor="middle" font-size="${fs}" ${font} fill="#0b121c" fill-opacity=".7">${esc(t)}</text>` +
          `<text x="${ar ? 0 : r2(0.04 * fs)}" y="${r2(-34 + dy)}" text-anchor="middle" font-size="${fs}" ${font} fill="#e9eef5">${esc(t)}</text>`;
      }
      s += `</g>`;
    } else {
      s =
        `<g transform="translate(${RN.x} ${RN.y})">` +
        `<path d="${circ(38)}${circ(26)}" fill-rule="evenodd" fill="url(#${id}-rg)"/>` +
        `<path d="${circ(37.6)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>` +
        `<path d="${circ(26.3)}" fill="none" stroke="#1c232c" stroke-opacity=".55" stroke-width=".8"/>` +
        `<path d="M21 -20.4L29.6 -28.6" stroke="#2a313a" stroke-width="1.1"/><path d="M21.8 -19.4L30.4 -27.6" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/>` +
        `</g>`;
    }
    return part === "front" ? `<g clip-path="url(#${id}-fr)">${s}</g>` : s;
  }

  // The first charm and the only permanent one: the shared manager figure, seen from behind,
  // hood up, cut from steel with its seams engraved.
  function figureCharm(id, at, rot) {
    return (
      `<g transform="translate(${at[0]} ${at[1]}) rotate(${rot})"><g class="c03-sw">` +
      `<circle r="4.4" fill="none" stroke="#59626d" stroke-width="2.4"/><circle r="4.4" fill="none" stroke="url(#${id}-st)" stroke-width="1.6"/>` +
      `<circle cy="9.2" r="2.5" fill="none" stroke="url(#${id}-st)" stroke-width="1.5"/>` +
      `<rect x="-1.3" y="11" width="2.6" height="6" rx="1" fill="url(#${id}-st)"/>` +
      MC.avatar({ x: -13, y: 11.5, w: 26, h: 31.2, torso: `url(#${id}-st)`, seam: "#4d5662", stroke: "#4a535e", strokeWidth: 4 }) +
      `</g></g>`
    );
  }
  // The holder charm (a sample): a steel match ball on a lobster clasp that passes each
  // gameweek to the mini-league leader.
  function ballCharm(id, at, rot) {
    const pent = (r, a0) =>
      [0, 1, 2, 3, 4].map((i) => {
        const a = ((a0 + i * 72) * Math.PI) / 180;
        return `${r2(r * Math.cos(a))} ${r2(r * Math.sin(a))}`;
      });
    const P = pent(2.9, -90);
    const spokes = pent(5.6, -90)
      .map((q, i) => `M${P[i]}L${q}`)
      .join("");
    const outer = [0, 1, 2, 3, 4].map((i) => {
      const a = ((-90 + i * 72) * Math.PI) / 180;
      const c = [8.6 * Math.cos(a), 8.6 * Math.sin(a)];
      return `M${pent(3, -90 + i * 72 + 180)
        .map((q) => {
          const [qx, qy] = q.split(" ").map(Number);
          return `${r2(c[0] + qx)} ${r2(c[1] + qy)}`;
        })
        .join("L")}Z`;
    });
    return (
      `<g transform="translate(${at[0]} ${at[1]}) rotate(${rot})"><g class="c03-sw">` +
      `<path d="M0 2.6C3.5 2.6 4.4 7.6 4.2 11.4C4 14.8 2.4 16.8 0 16.8C-2.4 16.8 -4 14.8 -4.2 11.4C-4.4 7.6 -3.5 2.6 0 2.6Z" fill="url(#${id}-st)" stroke="#4f5863" stroke-width=".7"/>` +
      `<path d="M-1.6 6.4C-1.6 9 -1.3 12 0 13.6" fill="none" stroke="#4f5863" stroke-width=".8"/>` +
      `<circle cy="19.2" r="2.2" fill="none" stroke="url(#${id}-st)" stroke-width="1.4"/>` +
      `<g transform="translate(0 29.6)">` +
      `<circle r="8.6" fill="url(#${id}-bl)" stroke="#525b66" stroke-width=".7"/>` +
      `<g clip-path="url(#${id}-bc)"><path d="M${P.join("L")}Z${outer.join("")}" fill="#56606b"/><path d="${spokes}" stroke="#56606b" stroke-width=".7"/></g>` +
      `<ellipse cx="-3" cy="-3.6" rx="2.2" ry="1.2" fill="#fff" opacity=".7" transform="rotate(-35 -3 -3.6)"/>` +
      `</g></g></g>`
    );
  }
  function carabiner(id, at) {
    // a D carabiner hooked on the founder ring's start bar, lying toward the free corner
    const D = "M-9 -4C-9 1 -4 4 1 4C7 4 11 0 11 -7L11 -46C11 -53 6 -57 0 -57C-6 -57 -9 -53 -9 -47Z";
    return (
      `<g transform="translate(${at[0]} ${at[1]}) rotate(-36) scale(.86)">` +
      `<path d="${D}" fill="none" stroke="#2f363e" stroke-width="7.2" stroke-linejoin="round"/>` +
      `<path d="${D}" fill="none" stroke="#9aa4b0" stroke-width="5"/>` +
      `<path d="${D}" fill="none" stroke="#e9eef3" stroke-width="1.4" transform="translate(-.9 -.4)" stroke-opacity=".9"/>` +
      // the gate on the start side, sprung shut, and its nose
      `<path d="M-9 -12L-9 -42" stroke="#2f363e" stroke-width="7.6"/><path d="M-9 -12.6L-9 -41.4" stroke="#c4ccd5" stroke-width="5"/>` +
      `<path d="M-10.3 -13V-41" stroke="#f4f7fa" stroke-width="1" stroke-opacity=".9"/>` +
      `<path d="M-12 -42.4H-6M-12 -12H-6" stroke="#2f363e" stroke-width="1.1"/>` +
      `</g>`
    );
  }

  /* ------------------------------------------------------------ the whole object */
  function art(p, o, id, opts = {}) {
    const thumb = !!o.thumb;
    const tk = MC.TIERS.includes(p.tier) ? p.tier : "PRO";
    const c = p.club;
    const founder = !!p.founder;
    const F = FACE[tk](id, c, thumb);
    const ink = { ...F.ink, filter: !thumb && tk !== "STADE" };
    const at = founder ? ATT.sq : ATT.rn;
    const S = MC.s(o);
    const defs =
      defsCommon(id, founder) +
      F.defs +
      `<path id="${id}-rp" d="M29 322A101 79 0 0 0 231 322"/>`;
    const charms =
      figureCharm(id, at.fig, -46) +
      ballCharm(id, at.ball, -34) +
      (thumb || opts.noCaption
        ? ""
        : `<text class="c03-cap" x="${r2(at.ball[0] + 34)}" y="${r2(at.ball[1] + 28)}" font-family="${MC.isAr(o) ? "Noto Sans Arabic, sans-serif" : "Manrope, sans-serif"}" font-weight="600" font-size="7" ${MC.isAr(o) ? 'direction="rtl" text-anchor="end"' : ""}>${MC.isAr(o) ? "مثال" : "Exemple"}</text>`);
    const swing = opts.swing ? ` transform="rotate(${opts.swing} ${EY.x} ${EY.y})"` : "";
    const body =
      (tk === "LEGEND" ? carabiner(id, at.carab) : "") +
      ring(p, o, id, thumb, "back") +
      `<g class="c03-fob"${swing}>` +
      plies(tk, c, thumb) +
      F.body +
      `<path class="c03-rim" d="${pearD(0)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      engraving(p, o, id, ink, thumb) +
      `</g>` +
      ring(p, o, id, thumb, "front") +
      (tk === "LEGEND" ? `<g clip-path="url(#${id}-fr)">${carabiner(id, at.carab)}</g>` : "") +
      `<g class="c03-charms">${charms}</g>`;
    void S;
    return { defs, body };
  }

  /* ------------------------------------------------------------ full card */
  function full(p, o = {}) {
    const S = MC.s(o);
    const id = MC.uid("c03");
    const A = art(p, o, id);
    return (
      `<div class="c03 c03-full c03--${String(p.tier).toLowerCase()}${o.thumb ? " is-thumb" : ""}" dir="${S.dir}"${MC.isAr(o) ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}"${o.motion ? ' data-motion="1"' : ""}>` +
      `<svg class="c03-art" viewBox="0 0 260 420" direction="ltr" aria-hidden="true" focusable="false"><defs>${A.defs}</defs>${A.body}</svg>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ token (44–80px) and mini (24–32px) */
  // Flat materials only: no filters at token size (fifty of these sit in one list).
  const TOK = {
    HOMA: (c) => ({ body: c.primary, num: c.secondary, line: c.secondary }),
    STADE: (c) => ({ body: c.secondary, num: c.primary, clear: true }),
    PRO: (c) => ({ body: "#1e1b19", num: c.secondary, sheen: true }),
    CHAMPION: (c) => ({ body: c.primary, num: "#eef1f4", nickel: true }),
    LEGEND: (c) => ({ body: "#c8a27a", num: "#14161a", stitch: true }),
  };

  function bigToken(p, o, size) {
    const id = MC.uid("c03t");
    const tk = MC.TIERS.includes(p.tier) ? p.tier : "PRO";
    const c = p.club;
    const T = TOK[tk](c);
    const founder = !!p.founder;
    const at = founder ? ATT.sq : ATT.rn;
    const showBall = size >= 64;
    // the main geometry at 1/5 scale, with thicker plies and ring so they survive
    const G = (inner) => `<g transform="translate(-2.4 -5) scale(.2)">${inner}</g>`;
    const step = 6.2;
    const list = TIER[tk].ply(c);
    let ply = "";
    for (let k = list.length; k >= 1; k--) {
      ply += `<path d="${faceD(step * k)}" fill-rule="evenodd" fill="${list[k - 1]}" stroke="#000" stroke-opacity=".35" stroke-width="1.4"/>`;
      if (k === list.length) ply += `<path class="c03-rim" d="${pearD(0, step * k)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    let face = "";
    if (T.clear) {
      face =
        `<path d="${faceD()}" fill-rule="evenodd" fill="#d9e8f5" fill-opacity=".25"/>` +
        `<path d="${pearD(12)}${holeD(17)}" fill-rule="evenodd" fill="${T.body}"/>` +
        `<path class="c03-clear" d="${faceD()}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    } else if (T.nickel) {
      face = `<path d="${faceD()}" fill-rule="evenodd" fill="url(#${id}-nk)"/><path d="${pearD(13)}${holeD(19)}" fill-rule="evenodd" fill="${T.body}"/>`;
    } else {
      face = `<path d="${faceD()}" fill-rule="evenodd" fill="${T.sheen ? `url(#${id}-sh)` : T.body}"/>`;
      if (T.line) face += `<path d="${pearD(14)}" fill="none" stroke="${T.line}" stroke-width="5" mask="url(#${id}-mk)"/><circle cx="130" cy="112" r="22" fill="none" stroke="${T.line}" stroke-width="5"/>`;
      if (T.stitch) face += `<g fill="none" stroke="#3a2a1c" stroke-width="4.4" stroke-dasharray="11 8" stroke-linecap="round"><path d="${pearD(14)}" mask="url(#${id}-mk)"/><circle cx="130" cy="112" r="22"/></g><circle cx="130" cy="112" r="14" fill="none" stroke="#a9b2be" stroke-width="8"/>`;
    }
    const ringS = founder
      ? `<g transform="translate(${SQ.x} ${SQ.y}) rotate(${TILT})"><path d="${rrect(42, 17)}${rrect(26, 3)}" fill-rule="evenodd" fill="url(#${id}-rg)"/><path class="c03-rimr" d="${rrect(42, 17)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`
      : `<g transform="translate(${RN.x} ${RN.y})"><path d="${circ(40)}${circ(24)}" fill-rule="evenodd" fill="url(#${id}-rg)"/><path class="c03-rimr" d="${circ(40)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`;
    const fig = `<g transform="translate(${at.fig[0]} ${at.fig[1]}) rotate(-46)"><circle r="6" fill="none" stroke="#a9b2be" stroke-width="4"/><path transform="translate(-16 8) scale(.16)" d="${MC.AVATAR.torso}${MC.AVATAR.hood}" fill="url(#${id}-st)" stroke="#4a535e" stroke-width="12"/></g>`;
    const ball = showBall ? `<g transform="translate(${at.ball[0]} ${at.ball[1]}) rotate(-34)"><path d="M0 3V18" stroke="#a9b2be" stroke-width="5"/><circle cy="29" r="10.5" fill="url(#${id}-bl)" stroke="#525b66" stroke-width="2"/></g>` : "";
    const carab = tk === "LEGEND" ? `<g transform="translate(${at.carab[0]} ${at.carab[1]}) rotate(-36) scale(.95)"><path d="M-9 -4C-9 1 -4 4 1 4C7 4 11 0 11 -7L11 -46C11 -53 6 -57 0 -57C-6 -57 -9 -53 -9 -47Z" fill="none" stroke="#2f363e" stroke-width="11"/><path d="M-9 -4C-9 1 -4 4 1 4C7 4 11 0 11 -7L11 -46C11 -53 6 -57 0 -57C-6 -57 -9 -53 -9 -47Z" fill="none" stroke="#c4ccd5" stroke-width="7"/></g>` : "";
    const m = meas("800 100px Changa", String(p.ovr));
    const nfs = p.ovr >= 100 ? 18 : 22;
    const nx = m ? r2(23.6 - (((m.r - m.l) / 2) * nfs) / 100) : 23.6;
    const defs =
      (founder
        ? `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#9db0ca"/><stop offset=".45" stop-color="#3a4e6b"/><stop offset=".7" stop-color="#7a92b4"/><stop offset="1" stop-color="#2c3d55"/></linearGradient>`
        : `<linearGradient id="${id}-rg" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="40" y2="40"><stop offset="0" stop-color="#eef1f4"/><stop offset=".45" stop-color="#8d97a3"/><stop offset=".7" stop-color="#d5dbe1"/><stop offset="1" stop-color="#7b8592"/></linearGradient>`) +
      `<linearGradient id="${id}-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef1f4"/><stop offset=".6" stop-color="#9aa4b0"/><stop offset="1" stop-color="#6f7986"/></linearGradient>` +
      `<radialGradient id="${id}-bl" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#aab3be"/><stop offset="1" stop-color="#5b6470"/></radialGradient>` +
      `<linearGradient id="${id}-sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a423c"/><stop offset=".4" stop-color="#1e1b19"/><stop offset="1" stop-color="#100e0d"/></linearGradient>` +
      `<linearGradient id="${id}-nk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".35" stop-color="#9aa3ae"/><stop offset=".6" stop-color="#e3e8ed"/><stop offset="1" stop-color="#7a8491"/></linearGradient>` +
      `<mask id="${id}-mk" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="420"><rect width="260" height="420" fill="#fff"/><circle cx="130" cy="112" r="22" fill="#000"/></mask>`;
    const vbW = 48;
    return (
      `<svg viewBox="0 0 ${vbW} 80" width="${r2((size * vbW) / 80)}" height="${size}" direction="ltr" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      G(carab + ringS + ply + face + `<path class="c03-rim" d="${pearD(0)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` + fig + ball) +
      `<text x="${nx}" y="68" ${m ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${nfs}" fill="${T.num}">${esc(p.ovr)}</text>` +
      `</svg>`
    );
  }

  // 24–32px: the pear, its ring (square = founder), the 84, the plies under the bulb; LEGEND
  // adds a carabiner on the free top corner, which changes the outline.
  const MPEAR = (oy = 0) => {
    const y = (v) => r2(v + oy);
    return `M10 ${y(4.2)}A3 3 0 0 1 13 ${y(7.2)}L13 ${y(8)}C13 ${y(10.2)} 18 ${y(10.8)} 18 ${y(13.6)}A8 5 0 0 1 2 ${y(13.6)}C2 ${y(10.8)} 7 ${y(10.2)} 7 ${y(8)}L7 ${y(7.2)}A3 3 0 0 1 10 ${y(4.2)}Z`;
  };
  function miniToken(p, o, size) {
    const tk = MC.TIERS.includes(p.tier) ? p.tier : "PRO";
    const c = p.club;
    const T = TOK[tk](c);
    const founder = !!p.founder;
    const list = TIER[tk].ply(c);
    const step = 1.15;
    let ply = "";
    for (let k = list.length; k >= 1; k--) {
      ply += `<path d="${MPEAR(step * k)}" fill="${list[k - 1]}" stroke="#000" stroke-opacity=".3" stroke-width=".25"/>`;
      if (k === list.length) ply += `<path class="c03-rim" d="${MPEAR(step * k)}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    }
    const hole = `<circle cx="10" cy="6.6" r="1" class="c03-hole"/>`;
    let face;
    if (T.clear) face = `<path d="${MPEAR()}" fill="${T.body}"/><path class="c03-clear" d="${MPEAR()}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    else if (T.nickel) face = `<path d="${MPEAR()}" fill="${T.body}"/><path d="${MPEAR()}" fill="none" stroke="#c9d0d8" stroke-width="1.1"/>`;
    else face = `<path d="${MPEAR()}" fill="${T.body}"/>` + (T.stitch ? `<path d="${MPEAR()}" fill="none" stroke="#7d5a3a" stroke-width=".7"/>` : "");
    const ringS = founder
      ? `<g transform="translate(14.9 4.3) rotate(${TILT})"><path class="c03-mr" d="${rrect(3, 1)}" fill="none" stroke-width="1.35"/></g>`
      : `<circle class="c03-mr" cx="14.9" cy="4.5" r="3.1" fill="none" stroke-width="1.3"/>`;
    const carab =
      tk === "LEGEND"
        ? `<g transform="translate(11.7 4.6) rotate(-58)"><path class="c03-mc" d="M-1.5 0C-1.5 .9 -.7 1.4 0 1.4C.9 1.4 1.6 .8 1.6 -.3V-5.6C1.6 -6.5 .9 -7.1 0 -7.1C-.8 -7.1 -1.5 -6.5 -1.5 -5.7Z" fill="none" stroke-width="1.15"/></g>`
        : "";
    const m = meas("800 100px Changa", String(p.ovr));
    const fs = p.ovr >= 100 ? 6.6 : 8.4;
    const nx = m ? r2(10 - (((m.r - m.l) / 2) * fs) / 100) : 10;
    return (
      `<svg viewBox="0 0 22 24" width="${r2((size * 22) / 24)}" height="${size}" direction="ltr" aria-hidden="true" focusable="false">` +
      ply +
      face +
      `<path class="c03-rim" d="${MPEAR()}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
      hole +
      carab +
      ringS +
      `<text x="${nx}" y="16.7" ${m ? "" : 'text-anchor="middle"'} font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" fill="${T.num}">${esc(p.ovr)}</text>` +
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
  function plyGlyph(p) {
    const list = TIER[p.tier] ? TIER[p.tier].ply(p.club) : TIER.PRO.ply(p.club);
    const h = list.length * 3 - 1;
    return (
      `<svg class="c03-pg" viewBox="0 0 16 ${h}" width="16" height="${h}" aria-hidden="true">` +
      list.map((col, i) => `<rect x="0" y="${i * 3}" width="16" height="2" rx="1" fill="${col}"/>`).join("") +
      `</svg>`
    );
  }
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const yy = p.founder ? "·" + String(p.founder).slice(2) : "";
    return (
      `<div class="c03 c03-row${o.me ? " is-me" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} data-tier="${p.tier}">` +
      `<span class="c03-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c03-rt">${token(p, { ...o, size: 54, mini: false })}</span>` +
      `<span class="c03-rn"><b><span class="c03-rnm">${esc(MC.nameOf(p, o))}</span>${yy ? `<i>${MC.ltr(yy)}</i>` : ""}</b>` +
      `<small>${plyGlyph(p)}<span>${esc(S.tiers[p.tier])}</span></small></span>` +
      `<span class="c03-rp"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------ share: "Sur mon sac" */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid("c03s");
    const A = art(p, { ...o, thumb: false }, id + "a", { swing: -7, noCaption: true });
    const sc = 1.08;
    const tx = 180 - 130 * sc;
    const slot = { x: r2(tx + 158.6 * sc), y: 150 };
    const ty = r2(slot.y - 49.8 * sc);
    const handle = "@" + String(p.key || p.name.lat).toLowerCase();
    const yy = p.founder ? "·" + String(p.founder).slice(2) : "";
    // zip coil teeth along y=118
    const zx = slot.x;
    const bg =
      `<svg class="c03-sh-bg" viewBox="0 0 360 640" width="360" height="640" direction="ltr" aria-hidden="true" focusable="false"><defs>` +
      A.defs +
      `<pattern id="${id}-wv" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><rect width="3.2" height="3.2" fill="#26282c"/><rect width="3.2" height="1.3" fill="#2f3237"/><rect y="1.6" width="1.3" height="1.6" fill="#2c2f33"/></pattern>` +
      `<filter id="${id}-gr" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 -.18"/></filter>` +
      `<radialGradient id="${id}-lt" cx=".22" cy=".2" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>` +
      `<pattern id="${id}-rb" width="2" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="4" fill="#1b1d20"/><rect width=".9" height="4" fill="#222428"/></pattern>` +
      `<pattern id="${id}-tt" x="0" y="0" width="5" height="12" patternUnits="userSpaceOnUse"><path d="M1 0.5H3.6A1.3 1.3 0 0 1 3.6 3.1H1Z" fill="#4a4e55"/><path d="M1 0.5H3.6" stroke="#6d727a" stroke-width=".5"/><path d="M3.5 6.5H1A1.3 1.3 0 0 0 1 9.1H3.5Z" transform="translate(1.4 0)" fill="#3f4349"/></pattern>` +
      `<filter id="${id}-cs" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feFlood flood-color="#000" flood-opacity=".55"/><feComposite in2="SourceAlpha" operator="in"/><feGaussianBlur stdDeviation="1.8"/></filter>` +
      `<linearGradient id="${id}-zp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8e959e"/><stop offset=".45" stop-color="#3d4248"/><stop offset="1" stop-color="#22252a"/></linearGradient>` +
      `<g id="${id}-obj" class="c03 c03-shobj">${A.body}</g>` +
      `</defs>` +
      `<rect width="360" height="640" fill="url(#${id}-wv)"/>` +
      `<rect width="360" height="640" filter="url(#${id}-gr)" opacity=".5"/>` +
      // a stitched seam and the zip across the top of the bag's front pocket
      `<rect y="96" width="360" height="44" fill="url(#${id}-rb)"/>` +
      `<path d="M0 92H360M0 144H360" stroke="#7d8189" stroke-width="1" stroke-dasharray="4 3"/>` +
      `<rect y="113" width="360" height="12" fill="url(#${id}-tt)"/>` +
      `<rect y="96" width="360" height="44" fill="#000" opacity=".12"/>` +
      `<rect width="360" height="640" fill="url(#${id}-lt)"/>` +
      `<use href="#${id}-obj" transform="translate(${r2(tx + 9)} ${r2(ty + 12)}) scale(${sc})" filter="url(#${id}-cs)"/>` +
      `<use href="#${id}-obj" transform="translate(${r2(tx)} ${ty}) scale(${sc})"/>` +
      // the slider and its pull tab, with the ring through the tab's slot
      `<g transform="translate(${zx} 119)">` +
      `<rect x="-15" y="-11" width="30" height="20" rx="5" fill="url(#${id}-zp)" stroke="#16181b" stroke-width="1"/>` +
      `<path d="M-13 -9H13" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>` +
      `<path d="M-8 2H8V36A6 6 0 0 1 2 42H-2A6 6 0 0 1 -8 36Z" fill="url(#${id}-zp)" stroke="#16181b" stroke-width="1"/>` +
      `<rect x="-4" y="25" width="8" height="12" rx="3" fill="#121316"/>` +
      `<path d="M-6.5 4V34" stroke="#fff" stroke-opacity=".3" stroke-width="1"/>` +
      `</g>` +
      `<ellipse cx="${r2(tx + 118 * sc)}" cy="${r2(ty + 46 * sc)}" rx="7" ry="1.6" fill="#fff" opacity=".55" transform="rotate(${-72} ${r2(tx + 118 * sc)} ${r2(ty + 46 * sc)})"/>` +
      `</svg>`;
    const label =
      `<div class="c03-sh-tag">` +
      `<div class="c03-sh-name"><b>${esc(MC.nameOf(p, o))}</b>${yy ? `<i>${MC.ltr(yy)}</i>` : ""}</div>` +
      `<div class="c03-sh-meta"><span class="c03-sh-h">${MC.ltr(handle)}</span><span>${esc(S.tiers[p.tier])}</span><span>${MC.ltr(p.id)}</span></div>` +
      `<em>${ar ? "مثال" : "Exemple"}</em>` +
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
      sw.forEach((g, i) => (g.style.transform = `rotate(${-th * (0.7 + i * 0.25)}deg)`));
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
      th = Math.max(-24, Math.min(24, drag.th0 - ((e.clientX - drag.x) / w) * 60));
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
      "Your BotolaGO identity is the fob on your keyring: the 84 engraved like a room number, a ring only 2026 founders have squared, and charms that only ever add.",
    philosophyAr: "هويتك في BotolaGO هي الميدالية المعلّقة في حلقة مفاتيحك: رقم 84 محفور كرقم غرفة، وحلقة مربّعة لا يحملها إلا مؤسسو 2026، وتعاليق لا تزيد إلا عددًا.",
    idea: [
      "Not a card. The identity is a keyring fob: a pear-shaped paddle on a flat split ring, the object every Moroccan teenager already clips to a school bag and every family hangs by the door. It is carried, not displayed, which is why it belongs to you rather than to an organiser.",
      "The layout is the hotel key fob, which solved this problem decades ago: a narrow neck that carries the house name (here, the tier), a wide bulb with one big engraved number (the 84), and a return line round the bottom edge (here, BOT #004821, the season and MOROCCO). The four stats are an engraved column down the neck, read top to bottom like a team sheet, not FUT's number-over-label row.",
      "Its outline is the asset: a pear with a tilted ring at its top-end and a cluster of charms off one shoulder. At 24px it is still a fob, not a map pin (the point is at the top, not the bottom) and not a luggage tag (there is no rectangle anywhere).",
      "Every tier is the same object in a better material, the way real fobs are: moulded PVC, acrylic with a printed insert, bakelite, hard enamel on nickel, and finally match-ball leather. The edge under the bulb shows the plies it is laminated from, one to four, and one ply is always your club colour, so allegiance runs through the object instead of being painted on it.",
    ],
    belonging: [
      "'Show me your ring.' A founder ring is square; every later cohort's is round. You can tell a 2026 founder across a leaderboard without reading a word, and nobody can ever get that ring again.",
      "Charms only add. The manager figure is the first, permanent charm; one more is struck for each completed season; and the steel ball (shown as an example) passes each gameweek to whoever leads the mini-league, then moves on. Friends compare what is hanging off their ring, not just their number.",
      "Teenagers want the leather fob and the carabiner; adults respect bakelite and leather. Neither looks like a game skin, which keeps it wearable for the 35-year-old Fantasy veteran and still covetable at 15.",
      "Screenshot value comes from the object, not the template: a keyring on your actual bag, mid-swing, is a photo people already take. The share image is exactly that photo.",
    ],
    founderMark: [
      "The founder mark changes the object itself: the split ring is forged as a rounded square in blued steel, the only square ring the system will ever issue. Later cohorts get round rings in plain steel with their own year, so 2026 is always first.",
      "FOUNDER 2026 is stamped through the bluing on the ring's top bar, so the letters show as bright bare steel against the blue, legible at arm's length. The name carries the year the way supporter groups carry theirs: ALI ·26.",
      "It never upgrades and never changes with tier. At LEGEND the carabiner clips onto that same ring, so the founder ring is literally what the top of the object hangs from.",
      "At 24px the ring is a 6px square against everyone else's circle: a 3px-plus corner signal that survives the silhouette test.",
    ],
    small: [
      "44–80px: the fob with the 84 set in Changa 800 in its bulb, the ring (square or round), the figure charm and, from 64px, the ball. The edge plies stay visible and carry the club colour; the material is flat colour with no filters.",
      "24–32px: a pear with a ring at its top-end, the 84 in the bulb, and the plies as 1px stripes under it (one for HOMA up to four for CHAMPION). The material reads as colour: slate PVC, cream insert, black bakelite, nickel-rimmed enamel, tan leather. LEGEND adds a carabiner in the free top corner, which changes the black-and-white outline.",
      "The silhouette is asymmetric on purpose (the ring tilts toward one side and never mirrors), which is what makes it recognisable before anything is read.",
    ],
    rtl: [
      "The fob is a physical object, so it never mirrors: the ring stays tilted to the same side and the charms hang where they hang. Only the engraving changes script.",
      "علي is set in Changa 800 at the same size as ALI, with ·26 to its left, kept left-to-right. The stat column puts the Arabic label (القائد، التشكيلة، الانتقالات، الثبات) to the right of its figure, with figures aligned in a column and kept LTR. No letter-spacing on any Arabic run.",
      "The ring stamp reads عضو مؤسس 2026 and the bottom return line reads المغرب · 2026/27 · BOT #004821, right to left with the codes kept LTR.",
    ],
    tiers: {
      HOMA: "Soft moulded PVC in the club colour, new and glossy, with a raised cream rim that wraps round the eyelet and raised cream lettering. One ply. The full outline, never a lesser shape: the street origin shows only in the material.",
      STADE: "Clear injection acrylic round a printed paper insert, with a halftone vignette and a printed club keyline. You can see the 5u of clear plastic at the edge and one diagonal glare across it. Two plies.",
      PRO: "Weighted bakelite, warm black with faint oxblood veining and a soft sheen. The 84 and every word are engraved and paint-filled in the club's second colour, the way hotel fobs were made. Three plies, with the club colour sandwiched in the middle.",
      CHAMPION: "Hard enamel flush in club-colour fields on a nickel-silver blank, with polished cloisonné wires and a stripe of the club's second colour across the shoulders. The lettering is raised polished nickel, and the eyelet is an integral nickel ring. Four plies.",
      LEGEND: "Cut from vintage match-ball leather: grained, burnished at the edge, saddle-stitched round its outline, with the panel seams of an old ball meeting in a Y across the shoulders. The 84 is stamped and debossed in black ink, and a steel carabiner clips onto the ring. No precious metal.",
    },
    legend: [
      "LEGEND is the only tier that changes the object's outline: a machined steel carabiner clips onto the ring and lies across the free top corner, so even at 24px a LEGEND fob has something hanging off it that nobody else's has.",
      "The material is the one every football fan wants to touch: old match-ball leather, grained and darkened at the edges, with a stitched Y where three panels meet. The stats stay on the front, debossed in ink.",
      "With motion on, the fob settles on the ring with a heavier, slower swing than any other tier: three damped arcs, then a dead stop. The 84 is visible the whole time; the swing is a replay, never a reveal.",
    ],
    advantages: [
      "Instantly understood by anyone: a keyring needs no explanation and no gaming literacy.",
      "A silhouette no card game owns: a pear with a tilted ring and charms, asymmetric and unmistakable at 24px.",
      "The founder mark is part of the outline (square ring), not a sticker, and the tier is the material plus a countable edge.",
      "Charms give a natural, honest place for season history and weekly mini-league honours without inventing rarity or scarcity.",
      "No overlap with an existing BotolaGO surface (unlike a shirt back or a ticket), and nothing that reads as money, betting or an access pass.",
    ],
    risks: [
      "A key implies access. Copy must never say accès, clé or 'unlock' beyond the concept's own name; the share image shows a bag, never a door.",
      "Keyrings can read as a cheap souvenir. HOMA and STADE are the riskiest tiers; the bakelite, enamel and leather tiers have to carry the prestige, and the materials must stay rendered, not flat.",
      "At 24px the pear can read as a light bulb, a guitar pick or a pear. The ring at the top-end is what saves it, so the ring must never be dropped at small sizes.",
      "Charm clutter: capped at four, and the holder charm needs one line of explanation the first time someone sees it.",
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
