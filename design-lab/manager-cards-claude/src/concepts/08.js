/* 08 LSAQ (youth). A cluster of die-cut vinyl stickers slapped on top of each other,
   the way they pile up on the lamppost by the terrain de proximité. The rating is a
   sticker slapped over last week's; the stack under it is the season. One SVG in a
   300 × 390 box; every selector in 08.css sits under .c08. */
(function () {
  const MC = window.MC;
  const NAVY = "#001C49";
  const BLUE = "#0151FC";
  const PAPER = "#F4F1E8";
  const TONER = "#1A1A1A";
  const SILVER = "#AEB6C1";
  const VW = 300;
  const VH = 390;
  // Changa advance widths per 1000 (digits are proportional: an 84 is wider than a 71).
  const ADV = { 0: 623, 1: 435, 2: 550, 3: 501, 4: 574, 5: 530, 6: 564, 7: 467, 8: 580, 9: 564 };
  const r2 = (n) => Math.round(n * 100) / 100;
  const numW = (s, fs) => (String(s).split("").reduce((a, ch) => a + (ADV[ch] || 560), 0) * fs) / 1000;
  const esc = MC.esc;

  /* The print run: each tier is a different way of making the same sticker. */
  const TIER = {
    HOMA: { kw: 7, ink: TONER, off: null, lam: 0 },
    STADE: { kw: 11, ink: NAVY, off: "club", lam: 0.08 },
    PRO: { kw: 12, ink: BLUE, off: NAVY, lam: 0.2 },
    CHAMPION: { kw: 13, ink: "chrome", off: NAVY, lam: 0.14, dbl: true },
    LEGEND: { kw: 14, ink: NAVY, off: BLUE, lam: 0.18, dome: true },
  };
  const tierOf = (p) => (TIER[p.tier] ? p.tier : "PRO");

  /* Faces used in measured layout: start loading them now so fonts.ready waits for them. */
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('800 100px "Changa"', "0123456789GO");
      document.fonts.load('900 100px "Big Shoulders Display"', "ALI");
      document.fonts.load('400 100px "Lalezar"', "علي");
      document.fonts.load('800 100px "Manrope"', "PRO");
      document.fonts.load('700 100px "Changa"', "محترف");
      document.fonts.load('700 100px "Noto Sans Arabic"', "القائد");
    }
  } catch (e) {
    /* layout falls back to estimates */
  }
  let g2d = null;
  /** Text width in the given face at `size` units; falls back to an em estimate if the face is not ready. */
  function measure(txt, family, weight, size, em) {
    const font = `${weight} 100px ${family}`;
    try {
      if (document.fonts && document.fonts.check(font, txt)) {
        g2d = g2d || document.createElement("canvas").getContext("2d");
        g2d.font = font;
        return (g2d.measureText(txt).width * size) / 100;
      }
    } catch (e) {
      /* estimate below */
    }
    return String(txt).length * em * size;
  }

  /* ---------- filters ---------- */
  // Every sticker: a ~1px outer hairline (so white vinyl holds on the mist ground) and a
  // small drop shadow. k = user units per CSS px, so the hairline stays one pixel at any size.
  function stickerFilter(id, k, big) {
    const hb = r2(0.9 * k);
    const bl = r2((big ? 5 : 1.3) * k);
    const dy = r2((big ? 6.5 : 1.7) * k);
    return (
      `<filter id="${id}" x="-15%" y="-15%" width="130%" height="140%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${hb}" result="b0"/>` +
      `<feComponentTransfer in="b0" result="d"><feFuncA type="linear" slope="5"/></feComponentTransfer>` +
      `<feFlood class="c08-fh" result="hc"/><feComposite in="hc" in2="d" operator="in" result="hair"/>` +
      `<feGaussianBlur in="d" stdDeviation="${bl}" result="b"/><feOffset in="b" dy="${dy}" result="bo"/>` +
      `<feFlood class="c08-fs" result="sc"/><feComposite in="sc" in2="bo" operator="in" result="sh"/>` +
      (big
        ? `<feGaussianBlur in="d" stdDeviation="${r2(0.9 * k)}" result="b1"/><feOffset in="b1" dy="${r2(1.3 * k)}" result="b1o"/><feComposite in="sc" in2="b1o" operator="in" result="sh1"/>`
        : "") +
      `<feMerge><feMergeNode in="sh"/>${big ? '<feMergeNode in="sh1"/>' : ""}<feMergeNode in="hair"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    );
  }
  // HOMA: paper cut with scissors (uneven edge) plus paper grain.
  const paperFilter = (id) =>
    `<filter id="${id}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="5" result="lo"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="lo" scale="6" xChannelSelector="R" yChannelSelector="G" result="cut"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="2" result="hi"/>` +
    `<feColorMatrix in="hi" type="matrix" values="0 0 0 0 .5  0 0 0 0 .46  0 0 0 0 .38  .5 0 0 0 -.17" result="gr"/>` +
    `<feComposite in="gr" in2="cut" operator="in" result="gri"/>` +
    `<feMerge><feMergeNode in="cut"/><feMergeNode in="gri"/></feMerge></filter>`;
  // HOMA digits: worn toner with dropouts.
  const tonerFilter = (id) =>
    `<filter id="${id}" x="0" y="0" width="1" height="1">` +
    `<feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="9" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 0 0 4.95" result="m"/>` +
    `<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`;
  // CHAMPION: anisotropic brushed streaks over chrome.
  const brushFilter = (id) =>
    `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.6 0.02" numOctaves="2" seed="4" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .95 0 0 0 -.46" result="w"/>` +
    `<feComposite in="w" in2="SourceAlpha" operator="in" result="wi"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 .05  0 0 0 0 .14  -.95 0 0 0 .38" result="k"/>` +
    `<feComposite in="k" in2="SourceAlpha" operator="in" result="ki"/>` +
    `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="wi"/><feMergeNode in="ki"/></feMerge></filter>`;
  // Matte vinyl (founder dot): a fine flat grain, no gloss.
  const matteFilter = (id) =>
    `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="13" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .5 0 0 0 -.2" result="w"/>` +
    `<feComposite in="w" in2="SourceAlpha" operator="in" result="wi"/>` +
    `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="wi"/></feMerge></filter>`;
  // LEGEND resin: the refracted lower dome edge (dark) and the upper lip (light), from the die alpha.
  const edgeFilter = (id, k = 1) =>
    `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${r2(2.4 * k)}" result="b"/>` +
    `<feOffset in="b" dx="${r2(-1.6 * k)}" dy="${r2(-3.4 * k)}" result="bo"/>` +
    `<feComposite in="SourceAlpha" in2="bo" operator="out" result="e"/>` +
    `<feFlood flood-color="#0B2A5E" flood-opacity=".62"/><feComposite in2="e" operator="in" result="lo"/>` +
    `<feOffset in="SourceAlpha" dx="${r2(-0.4 * k)}" dy="${r2(-1.3 * k)}" result="so"/>` +
    `<feComposite in="SourceAlpha" in2="so" operator="out" result="me"/>` +
    `<feFlood flood-color="#ffffff" flood-opacity=".95"/><feComposite in2="me" operator="in" result="men"/>` +
    `<feOffset in="b" dx="${r2(1.2 * k)}" dy="${r2(2.6 * k)}" result="bt"/>` +
    `<feComposite in="SourceAlpha" in2="bt" operator="out" result="e2"/>` +
    `<feFlood flood-color="#ffffff" flood-opacity=".9"/><feComposite in2="e2" operator="in" result="hi"/>` +
    `<feMerge><feMergeNode in="lo"/><feMergeNode in="hi"/><feMergeNode in="men"/></feMerge></filter>`;
  // The BotolaGO GO mark (G, ball and swooshes) as one-colour art for the tab.
  const goMark = (x, y, w, h, fill) => {
    const B = window.MC_BRAND && window.MC_BRAND.mark;
    if (!B) return "";
    return `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" viewBox="${B.viewBox}" overflow="visible">${B.paths.map((q) => `<path d="${q.d}" fill="${fill}"/>`).join("")}</svg>`;
  };
  const blurFilter = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;
  // Chrome gradient, set in user space over the digits' ink box (top y0, bottom y1).
  const chromeGrad = (id, y0, y1) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${r2(y0)}" x2="0" y2="${r2(y1)}">` +
    `<stop offset="0" stop-color="#F6F8FA"/><stop offset=".36" stop-color="#C9D0D9"/><stop offset=".5" stop-color="#76818F"/>` +
    `<stop offset=".55" stop-color="#4A5464"/><stop offset=".7" stop-color="#A9B2BE"/><stop offset=".88" stop-color="#E6EAEF"/><stop offset="1" stop-color="#B7BFCA"/></linearGradient>`;

  /* ---------- the number sticker ---------- */
  // Local frame: origin at the centre of the digits' ink box. Returns geometry for placing tabs.
  function numGeom(ovr, fs, kw) {
    const w = numW(ovr, fs);
    const sb = 0.028 * fs;
    return { w, base: r2(0.32 * fs), hw: w / 2 - sb + kw, hh: 0.32 * fs + kw };
  }
  const digitsText = (ovr, fs, base, attrs) =>
    `<text x="0" y="${base}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${fs}" ${attrs}>${esc(ovr)}</text>`;

  /** The printed digits, per tier. */
  function digits(u, p, tier, fs, base, full) {
    const t = TIER[tier];
    const ovr = String(p.ovr);
    const off = r2(fs * 0.017);
    let s = "";
    if (t.off) s += `<g transform="translate(${off} ${off})">${digitsText(ovr, fs, base, `fill="${t.off === "club" ? p.club.primary : t.off}"`)}</g>`;
    if (tier === "HOMA") s += digitsText(ovr, fs, base, `fill="${TONER}" opacity=".9"${full ? ` filter="url(#${u}-ton)"` : ""}`);
    else if (tier === "CHAMPION")
      s += digitsText(ovr, fs, base, `fill="url(#${u}-chr)" stroke="${NAVY}" stroke-width="${r2(fs * 0.012)}" paint-order="stroke"${full ? ` filter="url(#${u}-brs)"` : ""}`);
    else if (tier === "LEGEND")
      s += digitsText(ovr, fs, base, `fill="${NAVY}" stroke="url(#${u}-chr)" stroke-width="${r2(fs * 0.034)}" stroke-linejoin="round" paint-order="stroke"`);
    else s += digitsText(ovr, fs, base, `fill="${t.ink}"`);
    return tier === "LEGEND" ? `<g class="c08-swell">${s}</g>` : s;
  }

  /* ---------- the avatar disc ---------- */
  function disc(u, p, c) {
    const { tier, cx, cy, thumb } = c;
    const t = TIER[tier];
    const R = 56;
    const pos = { x: r2(cx - 49), y: r2(cy - 62), w: 98, h: 117.6 };
    const club = p.club.primary;
    const home = tier === "HOMA";
    const inkN = home ? TONER : NAVY;
    const inkB = home ? TONER : BLUE;
    let defs = `<clipPath id="${u}-cd"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>`;
    let face = "";
    // ground
    if (home) face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${PAPER}"/>`;
    else if (tier === "CHAMPION") {
      defs +=
        `<linearGradient id="${u}-fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EEF1F5"/><stop offset=".45" stop-color="#9AA4B2"/><stop offset=".52" stop-color="#5F6979"/><stop offset=".7" stop-color="#C3CAD3"/><stop offset="1" stop-color="#E4E8ED"/></linearGradient>`;
      face += `<g filter="url(#${u}-brs)"><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${u}-fg)"/></g>`;
      face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${club}" opacity=".62" style="mix-blend-mode:multiply"/>`;
    } else face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${club}"/>`;

    if (thumb) {
      face += MC.avatar({ ...pos, torso: inkN, seam: inkB, collar: inkB, neck: "#cfd5de", skin: "#cfd5de", hair: inkN });
    } else {
      const seamPath = (col) => `<path d="${MC.AVATAR.seam}" fill="none" stroke="${col}" stroke-width="8"/>`;
      const withSeam = (svg, col) => svg.replace("</svg>", seamPath(col) + "</svg>");
      defs +=
        `<radialGradient id="${u}-dN" r=".71"><stop offset="0" stop-color="${inkN}"/><stop offset="1" stop-color="${inkN}" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${u}-dB" r=".71"><stop offset="0" stop-color="${inkB}"/><stop offset="1" stop-color="${inkB}" stop-opacity="0"/></radialGradient>` +
        `<pattern id="${u}-pN" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.4" height="3.4" fill="url(#${u}-dN)"/></pattern>` +
        `<pattern id="${u}-pB" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><rect width="3.4" height="3.4" fill="url(#${u}-dB)"/></pattern>` +
        `<filter id="${u}-thr" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="12" intercept="-3.4"/></feComponentTransfer></filter>` +
        // tone maps (luminance = ink density): floodlight from the upper start
        `<linearGradient id="${u}-gT" x1=".1" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="#8f8f8f"/><stop offset=".5" stop-color="#d6d6d6"/><stop offset="1" stop-color="#f7f7f7"/></linearGradient>` +
        `<radialGradient id="${u}-gH" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="#9c9c9c"/><stop offset=".55" stop-color="#e6e6e6"/><stop offset="1" stop-color="#ffffff"/></radialGradient>` +
        `<mask id="${u}-mN" maskUnits="userSpaceOnUse" x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}">` +
        withSeam(MC.avatar({ ...pos, torso: `url(#${u}-gT)`, seam: false, collar: "#000", neck: "#5e5e5e", skin: "#5e5e5e", hair: `url(#${u}-gH)` }), "#000") +
        `</mask>` +
        `<mask id="${u}-mB" maskUnits="userSpaceOnUse" x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}">` +
        withSeam(MC.avatar({ ...pos, torso: "#000", seam: false, collar: "#f0f0f0", neck: "#000", skin: "#000", hair: "#000" }), "#f0f0f0") +
        `</mask>`;
      if (home) {
        // the photocopied ground: a toner screen over the whole disc, the figure knocked out
        defs +=
          `<mask id="${u}-mG" maskUnits="userSpaceOnUse" x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#7a7a7a"/>` +
          MC.avatar({ ...pos, torso: "#000", seam: false, collar: "#000", neck: "#000", skin: "#000", hair: "#000" }) +
          `</mask>`;
        face += `<g filter="url(#${u}-thr)"><g mask="url(#${u}-mG)"><rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" fill="url(#${u}-pN)"/></g></g>`;
      }
      const mis = home ? "translate(1.1 .7)" : tier === "STADE" ? "translate(.6 .4)" : "";
      face +=
        MC.avatar({ ...pos, torso: "currentColor", seam: false, collar: "currentColor", neck: "currentColor", skin: "currentColor", hair: "currentColor", cls: home ? "c08-kop" : "c08-ko" }) +
        `<g filter="url(#${u}-thr)"><g mask="url(#${u}-mN)"><rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" fill="url(#${u}-pN)"/></g></g>` +
        `<g transform="${mis}"><g filter="url(#${u}-thr)"><g mask="url(#${u}-mB)"><rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" fill="url(#${u}-pB)"/></g></g></g>`;
    }
    // satin / laminate sheen on the printed face
    if (!home && t.lam) {
      defs += `<radialGradient id="${u}-sn" cx=".3" cy=".22" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
      face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${u}-sn)"/>`;
    }
    let s = `<g filter="url(#${u}-${t.dome ? "dom" : "stk"})">`;
    s += home
      ? `<circle cx="${cx}" cy="${cy}" r="${R + 6.5}" fill="${PAPER}" class="c08-pap" filter="url(#${u}-pap)"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${R + 9}" class="k-w"/>`;
    if (t.dbl) s += `<circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="none" stroke="${SILVER}" stroke-width="1"/>`;
    s += `<g clip-path="url(#${u}-cd)">${face}</g>`;
    if (!thumb) s += rimText(u, p, c);
    if (t.dome && !thumb) {
      defs +=
        `<radialGradient id="${u}-dd" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#0B2A5E" stop-opacity="0"/><stop offset="1" stop-color="#0B2A5E" stop-opacity=".34"/></radialGradient>` +
        `<linearGradient id="${u}-dr" x1="0" y1="0" x2=".3" y2="1"><stop offset=".45" stop-color="#0B2A5E" stop-opacity="0"/><stop offset="1" stop-color="#0B2A5E" stop-opacity=".55"/></linearGradient>`;
      s +=
        `<g class="c08-dome"><circle cx="${cx}" cy="${cy}" r="${R + 9}" fill="url(#${u}-dd)"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${R + 7.4}" fill="none" stroke="url(#${u}-dr)" stroke-width="3"/>` +
        `<path d="M${r2(cx - 46)} ${r2(cy - 14)}A48 48 0 0 1 ${r2(cx - 8)} ${r2(cy - 49)}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="5" stroke-linecap="round" filter="url(#${u}-b2)"/>` +
        `<g class="c08-beadmove"><circle cx="${r2(cx - 30)}" cy="${r2(cy - 34)}" r="3.4" fill="#fff" filter="url(#${u}-b1)"/><circle cx="${r2(cx - 30)}" cy="${r2(cy - 34)}" r="1.5" fill="#fff"/></g></g>`;
    }
    s += `</g>`;
    return { defs, body: s, lam: `<circle cx="${cx}" cy="${cy}" r="${R + 9}" fill="#fff"/>` };
  }

  // 'BOT #004821 · MOROCCO · 2026/27' set round the disc's keyline, over the top.
  function rimText(u, p, c) {
    const { cx, cy, ar, tier } = c;
    const S = MC.s(c.o);
    const r = 58;
    const a0 = (160 * Math.PI) / 180;
    const a1 = (20 * Math.PI) / 180;
    const d = `M${r2(cx + r * Math.cos(a0))} ${r2(cy + r * Math.sin(a0))}A${r} ${r} 0 1 1 ${r2(cx + r * Math.cos(a1))} ${r2(cy + r * Math.sin(a1))}`;
    const ink = tier === "HOMA" ? TONER : NAVY;
    const country = ar
      ? `<tspan font-family="Noto Sans Arabic" font-weight="700" letter-spacing="0">${esc(S.country)}</tspan>`
      : esc(S.country);
    return (
      `<path id="${u}-rim" d="${d}" fill="none"/>` +
      `<text font-family="Manrope" font-weight="800" font-size="6.6" letter-spacing=".75" fill="${ink}" direction="ltr">` +
      `<textPath href="#${u}-rim" startOffset="50%" text-anchor="middle">${esc(p.id)}  ·  ${country}  ·  ${esc(p.season)}</textPath></text>`
    );
  }

  /* ---------- the whole cluster ---------- */
  function art(p, o, u) {
    const ar = MC.isAr(o);
    const rtl = ar;
    const S = MC.s(o);
    const tier = tierOf(p);
    const t = TIER[tier];
    const thumb = !!o.thumb;
    const home = tier === "HOMA";
    const X = (x) => (rtl ? VW - x : x);
    const A = (a) => (rtl ? -a : a);
    const sg = rtl ? -1 : 1;
    const c = { tier, ar, rtl, thumb, o };
    let defs =
      stickerFilter(`${u}-stk`, 1, false) +
      blurFilter(`${u}-b1`, 0.7) +
      blurFilter(`${u}-b2`, 1.6) +
      blurFilter(`${u}-b4`, 4);
    if (t.dome) defs += stickerFilter(`${u}-dom`, 1, true) + edgeFilter(`${u}-edg`);
    if (home) defs += paperFilter(`${u}-pap`) + tonerFilter(`${u}-ton`);
    if (tier === "CHAMPION") defs += brushFilter(`${u}-brs`);
    if (p.founder) defs += matteFilter(`${u}-mat`);
    const lam = [];
    let body = "";

    /* number geometry */
    const ovr = String(p.ovr);
    const fs = 170;
    const kw = t.kw;
    const G = numGeom(ovr, fs, kw);
    const ncx = X(160);
    const ncy = 196;
    const tab = { w: 30, h: 15, r: 3.5, k: 3 };
    tab.x = rtl ? -G.hw - tab.w + 17 : G.hw - 17;
    tab.y = G.hh - 31;
    const dieTab = `<rect x="${r2(tab.x - tab.k)}" y="${r2(tab.y - tab.k)}" width="${tab.w + 2 * tab.k}" height="${tab.h + 2 * tab.k}" rx="${tab.r + tab.k}" stroke="none"/>`;
    defs +=
      `<g id="${u}-die">${digitsText(ovr, fs, G.base, `stroke-width="${2 * kw}" stroke-linejoin="round"`)}${dieTab}</g>` +
      `<mask id="${u}-md" maskUnits="userSpaceOnUse" x="-260" y="-200" width="520" height="400"><use href="#${u}-die" fill="#fff" stroke="#fff"/></mask>` +
      `<clipPath id="${u}-pc" clipPathUnits="userSpaceOnUse"><polygon points="-2000,-2000 2000,-2000 2000,2000 -2000,2000"/></clipPath>` +
      `<linearGradient id="${u}-bk" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="60" y2="0"><stop offset="0" stop-color="#9DA8B8"/><stop offset=".35" stop-color="#DCE2EA"/><stop offset="1" stop-color="#F3F5F8"/></linearGradient>`;
    if (tier === "CHAMPION" || tier === "LEGEND") defs += chromeGrad(`${u}-chr`, G.base - 0.64 * fs, G.base);

    /* 1. older slaps: J.06, J.05, J.04 fanning out from under the number (faces hidden) */
    const nOld = 3;
    for (let k = nOld; k >= 1; k--) {
      const ox = r2(ncx + 6 * k * sg);
      const oy = r2(ncy - 5 * k);
      const rot = r2(-6 + 2 * k * sg);
      const bleached = k >= 2;
      body +=
        `<g transform="translate(${ox} ${oy}) rotate(${rot})" filter="url(#${u}-stk)"${k === 1 ? ' class="c08-under"' : ""}>` +
        `<use href="#${u}-die" class="${bleached ? "c08-bl" : home ? "c08-papf" : "k-w k-ws"}"/>` +
        `<rect x="${r2(tab.x)}" y="${r2(tab.y)}" width="${tab.w}" height="${tab.h}" rx="${tab.r}" fill="${bleached ? "#B4C3E6" : "#7E9BE8"}"/>` +
        (k === 1 && !thumb ? digitsText("– –", r2(fs * 0.5), r2(G.base - 0.1 * fs), `fill="${NAVY}" opacity=".55"`) : "") +
        `</g>`;
    }

    /* 2. the avatar disc, top-start */
    const D = disc(u, p, { ...c, cx: X(72), cy: 82 });
    defs += D.defs;
    body += D.body;
    lam.push(D.lam);

    /* 3. the number sticker, slapped at -6deg (constant in both directions) */
    const peelC = { x: rtl ? tab.x : tab.x + tab.w, y: tab.y + tab.h };
    let num = `<g class="c08-num" transform="translate(${ncx} ${ncy}) rotate(-6)" data-cx="${r2(peelC.x)}" data-cy="${r2(peelC.y)}"><g class="c08-slapin">`;
    num += `<g class="c08-front" clip-path="url(#${u}-pc)"><g filter="url(#${u}-${t.dome ? "dom" : "stk"})">`;
    if (home) num += `<use href="#${u}-die" class="c08-papf" filter="url(#${u}-pap)"/>`;
    else num += `<use href="#${u}-die" class="k-w k-ws"/>`;
    if (t.dbl) {
      num +=
        digitsText(ovr, fs, G.base, `fill="${SILVER}" stroke="${SILVER}" stroke-width="${2 * (kw - 4) + 1.6}" stroke-linejoin="round"`) +
        digitsText(ovr, fs, G.base, `class="k-w k-ws" stroke-width="${2 * (kw - 4)}" stroke-linejoin="round"`);
    }
    num += digits(u, p, tier, fs, G.base, !thumb);
    // the GO tab: Logo Blue, fixed on the keyline at the bottom-end (the constant brand mark)
    num +=
      `<g class="c08-go"><rect x="${r2(tab.x)}" y="${r2(tab.y)}" width="${tab.w}" height="${tab.h}" rx="${tab.r}" fill="${BLUE}"/>` +
      goMark(tab.x + 5.6, tab.y + 2.2, 18.8, 12, "#fff") +
      `</g>`;
    if (home) {
      // a crease across the paper
      num +=
        `<g mask="url(#${u}-md)"><path d="M${r2(-G.hw)} -26L${r2(G.hw)} 18" stroke="#fff" stroke-opacity=".8" stroke-width="1.1"/>` +
        `<path d="M${r2(-G.hw)} -24.8L${r2(G.hw)} 19.2" stroke="#000" stroke-opacity=".16" stroke-width="1"/></g>`;
    }
    if (t.dome && !thumb) {
      defs +=
        `<linearGradient id="${u}-ds" gradientUnits="userSpaceOnUse" x1="${r2(-G.hw)}" y1="${r2(-G.hh)}" x2="${r2(G.hw * 0.7)}" y2="${r2(G.hh)}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#0B2A5E" stop-opacity="0"/><stop offset="1" stop-color="#0B2A5E" stop-opacity=".2"/></linearGradient>`;
      const wx = -G.hw + 16;
      const wy = -G.hh + 14;
      // a window reflection on the resin: one broad pane and one thin glint, sharp-edged like glass
      num +=
        `<g class="c08-dome"><g mask="url(#${u}-md)"><rect x="${r2(-G.hw - 20)}" y="${r2(-G.hh - 20)}" width="${r2(2 * G.hw + 40)}" height="${r2(2 * G.hh + 40)}" fill="url(#${u}-ds)"/>` +
        `<path d="M${r2(wx)} ${r2(wy + 16)}C${r2(wx + 30)} ${r2(wy - 4)} ${r2(wx + 92)} ${r2(wy - 8)} ${r2(wx + 150)} ${r2(wy - 2)}L${r2(wx + 146)} ${r2(wy + 11)}C${r2(wx + 92)} ${r2(wy + 5)} ${r2(wx + 36)} ${r2(wy + 11)} ${r2(wx + 4)} ${r2(wy + 30)}Z" fill="#fff" opacity=".5" filter="url(#${u}-b1)"/>` +
        `<path d="M${r2(wx + 2)} ${r2(wy + 40)}C${r2(wx + 26)} ${r2(wy + 22)} ${r2(wx + 70)} ${r2(wy + 15)} ${r2(wx + 118)} ${r2(wy + 15)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/></g>` +
        `<use href="#${u}-die" fill="#000" stroke="#000" filter="url(#${u}-edg)"/>` +
        `<g class="c08-beadmove"><ellipse cx="${r2(-G.hw * 0.52)}" cy="${r2(-G.hh * 0.5)}" rx="6" ry="3.6" fill="#fff" opacity=".9" filter="url(#${u}-b1)" transform="rotate(-20 ${r2(-G.hw * 0.52)} ${r2(-G.hh * 0.5)})"/>` +
        `<circle cx="${r2(-G.hw * 0.52 - 1.4)}" cy="${r2(-G.hh * 0.5 - 0.6)}" r="1.6" fill="#fff"/></g></g>`;
    }
    num += `</g></g>`;
    // the flap shown while peeling (the sticker's backing side), hidden at rest
    num += `<g class="c08-flap" clip-path="url(#${u}-pc)" style="display:none"><g filter="url(#${u}-stk)"><use href="#${u}-die" fill="url(#${u}-bk)" stroke="url(#${u}-bk)"/></g></g>`;

    /* 4. the tier tag, slapped across the number's top-end corner */
    const tagTxt = S.tiers[tier];
    const tagFs = ar ? 12.5 : 11.5;
    const tagTw = ar ? measure(tagTxt, '"Changa"', 700, tagFs, 0.5) : measure(tagTxt, '"Manrope"', 800, tagFs, 0.72) + tagTxt.length * 0.7;
    const tagW = r2(tagTw + 18);
    const tagH = ar ? 25 : 20;
    const tcx = r2(sg * (G.hw - 4 - Math.max(0, tagW - 50) * 0.55));
    const tcy = r2(-G.hh + 4);
    const trot = rtl ? -2 : 14;
    const tagFace =
      tier === "HOMA" ? `fill="${PAPER}"` : tier === "CHAMPION" ? `fill="url(#${u}-tch)"` : tier === "LEGEND" ? `fill="${NAVY}"` : 'class="k-w"';
    const tagInk = tier === "HOMA" ? TONER : tier === "LEGEND" ? "#fff" : NAVY;
    if (tier === "CHAMPION") defs += chromeGrad(`${u}-tch`, -tagH / 2, tagH / 2);
    let tag = `<g class="c08-tag" transform="translate(${tcx} ${tcy}) rotate(${trot})"><g filter="url(#${u}-stk)">`;
    if (tier === "CHAMPION" || tier === "LEGEND")
      tag += `<rect x="${r2(-tagW / 2 - 3)}" y="${r2(-tagH / 2 - 3)}" width="${r2(tagW + 6)}" height="${tagH + 6}" rx="6" class="k-w"/>`;
    tag += `<rect x="${r2(-tagW / 2)}" y="${-tagH / 2}" width="${tagW}" height="${tagH}" rx="3.5" ${tagFace}${home ? ` filter="url(#${u}-pap)"` : ""}/>`;
    if (tier === "LEGEND") tag += `<rect x="${r2(-tagW / 2 + 2)}" y="${-tagH / 2 + 1.6}" width="${r2(tagW - 4)}" height="5" rx="2.5" fill="#fff" opacity=".18"/>`;
    if (!thumb) {
      tag += ar
        ? `<text x="0" y="${r2(tagFs * 0.34)}" text-anchor="middle" font-family="Changa" font-weight="700" font-size="${tagFs}" fill="${tagInk}" direction="rtl">${esc(tagTxt)}</text>`
        : `<text x="0" y="${r2(tagFs * 0.36)}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="${tagFs}" letter-spacing=".7" fill="${tagInk}" direction="ltr">${esc(tagTxt)}</text>`;
    }
    tag += `</g></g>`;
    num += tag + `</g></g>`;
    body += num;
    lam.push(`<g transform="translate(${ncx} ${ncy}) rotate(-6)"><use href="#${u}-die" fill="#fff" stroke="#fff"/></g>`);

    /* 5. the name strip, with the founder dot slapped under its inline end */
    const nm = MC.nameOf(p, o);
    const nfs = 30;
    let ntw = ar ? measure(nm, '"Lalezar"', 400, nfs, 0.5) : measure(nm, '"Big Shoulders Display"', 900, nfs, 0.5);
    const maxTw = 168;
    const squeeze = ntw > maxTw;
    ntw = Math.min(ntw, maxTw);
    const sH = ar ? 46 : 40;
    const sW = r2(ntw + 28);
    const sx0 = X(26);
    const sy0 = ar ? 283 : 286;
    const srot = A(2);
    const ink = home ? TONER : NAVY;
    let strip = `<g class="c08-strip" transform="translate(${sx0} ${r2(sy0 + sH / 2)}) rotate(${srot})">`;
    if (p.founder) {
      // FOUNDER 2026: the first slap. Matte Logo Blue, it never takes the tier's finish.
      const fx = r2(sg * sW);
      const fr = 17;
      const yy = String(p.founder).slice(-2);
      const rr = 18.2;
      const pathF = rtl
        ? `M${r2(rr * Math.cos((100 * Math.PI) / 180))} ${r2(rr * Math.sin((100 * Math.PI) / 180))}A${rr} ${rr} 0 0 1 ${r2(rr * Math.cos((260 * Math.PI) / 180))} ${r2(rr * Math.sin((260 * Math.PI) / 180))}`
        : `M${r2(rr * Math.cos((-80 * Math.PI) / 180))} ${r2(rr * Math.sin((-80 * Math.PI) / 180))}A${rr} ${rr} 0 0 1 ${r2(rr * Math.cos((80 * Math.PI) / 180))} ${r2(rr * Math.sin((80 * Math.PI) / 180))}`;
      strip +=
        `<g class="c08-founder" transform="translate(${fx} 0) rotate(${A(-8)})"><g filter="url(#${u}-stk)">` +
        `<circle r="${fr + 5}" class="k-w"/><circle r="${fr}" fill="${BLUE}" filter="url(#${u}-mat)"/>` +
        (thumb
          ? ""
          : `<text x="${r2(sg * 8.2)}" y="4.4" text-anchor="middle" font-family="Changa" font-weight="800" font-size="13.5" fill="#fff" direction="ltr">${esc(yy)}</text>` +
            `<path id="${u}-fr" d="${pathF}" fill="none"/>` +
            (ar
              ? `<text font-family="Noto Sans Arabic" font-weight="700" font-size="4.6" fill="${NAVY}" direction="rtl"><textPath href="#${u}-fr" startOffset="50%" text-anchor="middle">${esc(S.founder)}</textPath></text>`
              : `<text font-family="Manrope" font-weight="800" font-size="4.4" letter-spacing=".55" fill="${NAVY}" direction="ltr"><textPath href="#${u}-fr" startOffset="50%" text-anchor="middle">${esc(S.founderLine)}</textPath></text>`)) +
        `</g></g>`;
    }
    strip += `<g filter="url(#${u}-stk)">`;
    strip += home
      ? `<rect x="${rtl ? -sW : 0}" y="${-sH / 2}" width="${sW}" height="${sH}" rx="2" fill="${PAPER}" class="c08-pap" filter="url(#${u}-pap)"/>`
      : `<rect x="${rtl ? -sW : 0}" y="${-sH / 2}" width="${sW}" height="${sH}" rx="3" class="k-w"/>`;
    if (t.dbl) strip += `<rect x="${r2((rtl ? -sW : 0) + 3)}" y="${-sH / 2 + 3}" width="${r2(sW - 6)}" height="${sH - 6}" rx="1.5" fill="none" stroke="${SILVER}" stroke-width=".9"/>`;
    const fitAttr = squeeze ? ` textLength="${maxTw}" lengthAdjust="spacingAndGlyphs"` : "";
    strip += ar
      ? `<text x="${r2((sg * sW) / 2)}" y="9.5" text-anchor="middle" font-family="Lalezar" font-size="${nfs}" fill="${ink}" direction="rtl"${fitAttr}>${esc(nm)}</text>`
      : `<text x="${r2((sg * sW) / 2)}" y="10.8" text-anchor="middle" font-family="Big Shoulders Display" font-weight="900" font-size="${nfs}" letter-spacing=".6" fill="${ink}" direction="ltr"${fitAttr}>${esc(nm)}</text>`;
    strip += `</g></g>`;
    body += strip;
    lam.push(`<rect x="${rtl ? sx0 - sW : sx0}" y="${sy0}" width="${sW}" height="${sH}" fill="#fff" transform="rotate(${srot} ${sx0} ${r2(sy0 + sH / 2)})"/>`);

    /* 6. four loose kiss-cut stat dots, one stat each */
    const best = MC.STATS.reduce((b, k) => (p.stats[k] > p.stats[b] ? k : b), MC.STATS[0]);
    const DX = [44, 112, 180, 248];
    const DA = [-4, 3, -2, 5];
    MC.STATS.forEach((k, i) => {
      const x = X(DX[i]);
      const y = 358;
      const a = A(DA[i]);
      const isB = k === best;
      const v = p.stats[k];
      const face = isB ? (home ? TONER : BLUE) : null;
      const txt = isB ? "#fff" : ink;
      const lr = 17.2;
      const lp = `M${r2(lr * Math.cos((200 * Math.PI) / 180))} ${r2(lr * Math.sin((200 * Math.PI) / 180))}A${lr} ${lr} 0 0 1 ${r2(lr * Math.cos((340 * Math.PI) / 180))} ${r2(lr * Math.sin((340 * Math.PI) / 180))}`;
      let d = `<g class="c08-dot" transform="translate(${x} ${y}) rotate(${a})"><g filter="url(#${u}-stk)">`;
      d += home ? `<circle r="26" fill="${PAPER}" class="c08-pap" filter="url(#${u}-pap)"/>` : `<circle r="27" class="k-w"/>`;
      if (face) d += `<circle r="${home ? 22 : 23.6}" fill="${face}"/>`;
      if (t.dbl) d += `<circle r="24.6" fill="none" stroke="${SILVER}" stroke-width=".9"/>`;
      d += digitsText(String(v), 19, r2(0.32 * 19 + 3.4), `fill="${txt}" direction="ltr"`);
      if (!thumb) {
        d += `<path id="${u}-l${i}" d="${lp}" fill="none"/>`;
        d += ar
          ? `<text font-family="Noto Sans Arabic" font-weight="700" font-size="6.4" fill="${txt}" direction="rtl"><textPath href="#${u}-l${i}" startOffset="50%" text-anchor="middle">${esc(S.stats[k])}</textPath></text>`
          : `<text font-family="Manrope" font-weight="800" font-size="6.6" letter-spacing="1.1" fill="${txt}" opacity="${isB ? 1 : 0.78}" direction="ltr"><textPath href="#${u}-l${i}" startOffset="50%" text-anchor="middle">${esc(S.stats[k])}</textPath></text>`;
      }
      d += `</g></g>`;
      body += d;
      lam.push(`<circle cx="${x}" cy="${y}" r="27" fill="#fff"/>`);
    });

    /* 7. laminate: one soft specular band at 35deg across every laminated sticker */
    if (t.lam && !thumb) {
      defs +=
        `<linearGradient id="${u}-lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${t.lam}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<mask id="${u}-lm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${VW + 40}" height="${VH + 40}">${lam.join("")}</mask>`;
      const band = tier === "STADE" ? 120 : 54;
      body += `<g mask="url(#${u}-lm)" class="c08-lam"><g class="c08-lammove"><rect x="-150" y="${-band / 2}" width="340" height="${band}" fill="url(#${u}-lg)" transform="translate(${X(132)} 150) rotate(${A(-35)})"/></g></g>`;
    }
    return { defs, body };
  }

  /* ---------- token: the number sticker alone (44–80px) or reduced to its keyline (24–32px) ---------- */
  // Gunmetal chrome for small CHAMPION digits: bright chrome on white vinyl is illegible below 80px.
  const steelGrad = (id, y0, y1) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${r2(y0)}" x2="0" y2="${r2(y1)}">` +
    `<stop offset="0" stop-color="#A3ADBB"/><stop offset=".4" stop-color="#566174"/><stop offset=".5" stop-color="#202a3a"/>` +
    `<stop offset=".58" stop-color="#121a28"/><stop offset=".75" stop-color="#4d586a"/><stop offset="1" stop-color="#8a95a5"/></linearGradient>`;
  function smallNumber(u, p, c) {
    const { fs, kw, k, rtl, founder, tab } = c;
    const tier = tierOf(p);
    const ovr = String(p.ovr);
    const kwT = tier === "LEGEND" ? kw * 1.35 : kw;
    const G = numGeom(ovr, fs, kwT);
    const T = (attrs, sw) => digitsText(ovr, fs, G.base, `${sw ? `stroke-width="${r2(sw)}" stroke-linejoin="round" ` : ""}${attrs}`);
    let s = "";
    if (founder) s += `<circle cx="${r2((rtl ? 1 : -1) * (G.hw - kwT * 0.4))}" cy="${r2(G.hh - kwT * 0.3)}" r="${r2(fs * 0.19)}" fill="${BLUE}"/>`;
    let tabEl = "";
    let tabDie = "";
    if (tab) {
      const tw = r2(fs * 0.25);
      const th = r2(fs * 0.13);
      const tx = rtl ? -G.hw - tw + fs * 0.05 : G.hw - fs * 0.05;
      const ty = G.hh - th - kw * 0.35;
      const kk = r2(kw * 0.55);
      tabDie = `<rect x="${r2(tx - kk)}" y="${r2(ty - kk)}" width="${r2(tw + 2 * kk)}" height="${r2(th + 2 * kk)}" rx="${r2(th * 0.3 + kk)}"`;
      tabEl = `<rect x="${r2(tx)}" y="${r2(ty)}" width="${tw}" height="${th}" rx="${r2(th * 0.3)}" fill="${BLUE}"/>`;
    }
    const dieW = 2 * kwT;
    // the tier, told by the keyline: HOMA dashed (hand cut), STADE single, PRO single + gloss tick,
    // CHAMPION double (white + silver), LEGEND a thick dome rim with a highlight bead
    let ring = "";
    if (tier === "HOMA") ring += T(`fill="none" stroke="${NAVY}" stroke-opacity=".75" stroke-dasharray="${r2(1.7 * k)} ${r2(1.2 * k)}"`, dieW + 2.4 * k);
    if (tier === "CHAMPION") ring += T(`fill="none" class="c08-hl"`, dieW + 5.2 * k) + T(`class="k-w k-ws"`, dieW + 4 * k) + T(`fill="${SILVER}" stroke="${SILVER}"`, dieW + 2 * k);
    let die;
    if (tier === "HOMA") die = T(`class="c08-papf"`, dieW) + (tabDie ? tabDie + ` class="c08-papf"/>` : "");
    else if (tier === "LEGEND") die = T(`fill="url(#${u}-rim)" stroke="url(#${u}-rim)"`, dieW) + (tabDie ? tabDie + ` fill="url(#${u}-rim)"/>` : "") + T(`class="k-w k-ws"`, kw * 1.25);
    else die = T(`class="k-w k-ws"`, dieW) + (tabDie ? tabDie + ` class="k-w"/>` : "");
    s += `<g filter="url(#${u}-stk)">${ring}${die}</g>`;
    if (tier === "CHAMPION") {
      const off = r2(fs * 0.017);
      s += `<g transform="translate(${off} ${off})">${T(`fill="${NAVY}"`)}</g>` + T(`fill="url(#${u}-chr)"`);
    } else s += digits(u, p, tier, fs, G.base, false);
    s += tabEl;
    if (tier === "PRO") s += `<path d="M${r2(-G.w * 0.37)} ${r2(-fs * 0.16)}L${r2(-G.w * 0.22)} ${r2(-fs * 0.26)}" stroke="#fff" stroke-width="${r2(1.3 * k)}" stroke-linecap="round" opacity=".95"/>`;
    if (tier === "LEGEND") s += `<circle cx="${r2(-G.hw + kwT * 0.8)}" cy="${r2(-G.hh + kwT * 0.8)}" r="${r2(Math.max(1.2 * k, kwT * 0.32))}" fill="#fff"/>`;
    const defs =
      (tier === "LEGEND"
        ? `<linearGradient id="${u}-rim" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#C9D6EC"/><stop offset="1" stop-color="#6F86B2"/></linearGradient>`
        : "") + (tier === "CHAMPION" ? steelGrad(`${u}-chr`, G.base - 0.64 * fs, G.base) : tier === "LEGEND" ? chromeGrad(`${u}-chr`, G.base - 0.64 * fs, G.base) : "");
    return { s, defs, G };
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const u = MC.uid("c08t");
    const rtl = MC.isAr(o);
    const S = MC.s(o);
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${S.tiers[tierOf(p)]}${p.founder ? ", " + S.founderLine : ""}`;
    const X = (x, w) => (rtl ? w - x : x);
    if (mini) {
      const k = 32 / size;
      const N = smallNumber(u, p, { fs: 21, kw: 2.7, k, rtl, founder: !!p.founder, tab: false });
      const w = r2(size * 1.25);
      return (
        `<span class="c08 c08-tk c08-tk--mini" style="width:${w}px;height:${size}px" role="img" aria-label="${esc(label)}">` +
        `<svg viewBox="0 0 40 32" width="${w}" height="${size}" aria-hidden="true" focusable="false"><defs>${stickerFilter(`${u}-stk`, k * 0.8, false)}${N.defs}</defs>` +
        `<g transform="translate(${X(20.5, 40)} 16.4) rotate(-6)">${N.s}</g></svg></span>`
      );
    }
    // 44–80px: the number, the avatar disc peeking at the top-start, the GO tab and last week's edge
    const k = 80 / size;
    const fs = 50;
    const kw = 5.2;
    const N = smallNumber(u, p, { fs, kw, k, rtl, founder: !!p.founder, tab: true });
    const ncx = X(53, 96);
    const ncy = 49;
    const dcx = X(18.5, 96);
    const dcy = 18.5;
    const fig = MC.avatar({ x: r2(dcx - 13), y: r2(dcy - 14), w: 26, h: 31.2, torso: NAVY, seam: BLUE, collar: BLUE, neck: "#cfd5de", skin: "#cfd5de", hair: NAVY });
    const w = r2(size * 1.2);
    const lastWeek =
      `<g transform="translate(${r2(ncx + (rtl ? -4.5 : 4.5))} ${ncy - 4.5}) rotate(${rtl ? -9 : -3})" filter="url(#${u}-stk)">` +
      digitsText(String(p.ovr), fs, N.G.base, `class="c08-bl" stroke-width="${2 * kw}" stroke-linejoin="round"`) +
      `</g>`;
    return (
      `<span class="c08 c08-tk" style="width:${w}px;height:${size}px" role="img" aria-label="${esc(label)}">` +
      `<svg viewBox="0 0 96 80" width="${w}" height="${size}" aria-hidden="true" focusable="false"><defs>${stickerFilter(`${u}-stk`, k * 0.8, false)}${N.defs}` +
      `<clipPath id="${u}-cd"><circle cx="${dcx}" cy="${dcy}" r="13.2"/></clipPath></defs>` +
      lastWeek +
      `<g filter="url(#${u}-stk)"><circle cx="${dcx}" cy="${dcy}" r="16.6" class="k-w"/><g clip-path="url(#${u}-cd)"><circle cx="${dcx}" cy="${dcy}" r="13.2" fill="${p.club.primary}"/>${fig}</g></g>` +
      `<g transform="translate(${ncx} ${ncy}) rotate(-6)">${N.s}</g></svg></span>`
    );
  }

  /* ---------- registration ---------- */
  const c = {
    id: "c08",
    n: 8,
    slug: "08",
    name: "Lsaq",
    nameAr: "ملصق",
    category: "youth",
    philosophy:
      "Your rating is a sticker slapped over last week's: the stack under it is your season, and the same art is the sticker you send the group chat.",
    philosophyAr: "تقييمك ملصق يُلصق فوق ملصق الأسبوع الماضي؛ الطبقات تحته هي موسمك، والملصق نفسه هو ما ترسله إلى مجموعة أصدقائك.",
    idea: [
      "Not a card at all: a fixed cluster of die-cut vinyl stickers, the kind that pile up on the lamppost outside the terrain de proximité, on a moped mudguard or inside a phone case. The 84 is the main sticker, cut round the real digits with a fat white keyline and slapped at −6°. The die follows the number, so a 71 is honestly narrower than an 84.",
      "Behind it, the keyline edges of the previous gameweeks fan out toward the top-end, faces hidden: your history is the thickness of the stack, not a chart. The avatar is its own round sticker, a two-colour halftone screen print of the shared manager seen from behind, with the BotolaGO ID, country and season printed round its keyline. The name is a strip of white vinyl; the four stats are loose kiss-cut dots, separate collectible pieces rather than a stat row.",
      "What stays constant, and therefore what BotolaGO owns: the keyline weight, the −6° slap of the number, the avatar bump at the top-start, the fanned edges at the top-end, and a small Logo-Blue GO tab fixed on the number's keyline at its bottom-end, the Levi's-tab principle. Depth comes only from overlap and one small drop shadow; nothing is shaded inside a sticker except where the material itself (laminate, chrome, resin) demands it.",
    ],
    belonging: [
      "The stack is your season made physical. A 15-year-old sees it change every gameweek even when the tier does not, and a three-season stack is visibly thicker than a new one. Layers can only be played for, never bought.",
      "It is the only identity you can literally send. The same art exports as the WhatsApp sticker you reply with when the group asks for your number, which is how Moroccan group chats already talk. Friends compare by spamming each other's stickers.",
      "It borrows the Panini packet from the hanout for the older users and the sticker-bombed school bag for the younger ones, without naming a group, a chant or a crest.",
    ],
    founderMark: [
      "Every founder stack begins with the same small round sticker, slapped down before anything else existed: matte Logo Blue, a white '26' in Changa 800, FOUNDER 2026 printed round its keyline. It sits under the name strip's inline end, so the visible half makes the strip read 'ALI ·26', the founding-year form supporters already use, with no group vocabulary.",
      "It never upgrades. It is the only sticker that never takes the tier's laminate, chrome or resin, so its matte vinyl is the tell, even beside a LEGEND dome. The next cohort's base sticker would be square, so a round base means founder. At 24px it survives as a blue half-dot under the number's bottom-start.",
    ],
    small: [
      "44–80px: two stickers only. The number with its keyline at −6°, the avatar disc peeking out at the top-start, the GO tab, one keyline edge of last week behind, and the founder half-dot.",
      "24–32px: the number sticker alone, about 10px-tall digits with a 2px keyline and the founder half-dot. The tier is told by the keyline itself, in monochrome: HOMA dashed (hand-cut), STADE single, PRO single with a gloss tick, CHAMPION double (white and silver), LEGEND a thick dome rim with a highlight bead.",
    ],
    rtl: [
      "The cluster mirrors: the avatar disc moves to the top-right, the GO tab to the bottom-left, the fanned edges to the top-left, and the name strip runs right to left with the founder dot at its inline end (left). The slap angle of the number stays −6° in both directions: it is a constant of the brand, not a reading direction.",
      "علي is set in Lalezar in a taller 46-unit strip so its line box is never clipped. Stat and tier labels are Arabic proposals in Noto Sans Arabic and Changa, never letter-spaced; digits and codes stay left-to-right, and the rim text keeps the ID and season in Latin with المغرب set as its own Arabic run.",
    ],
    tiers: {
      HOMA: "Paper cut with scissors: an uneven 3–8 unit keyline, paper grain, toner-black digits with dropouts, one crease line, a photocopied halftone avatar misregistered by 1 unit, no gloss anywhere.",
      STADE: "Die-cut vinyl: a crisp, even keyline, satin finish, Tunnel-Navy digits with a 3-unit club-colour offset, the avatar in two inks slightly misregistered.",
      PRO: "Laminated vinyl: one soft specular band at 35° across every laminated sticker, Logo-Blue digits with a Tunnel-Navy offset, two clean inks on the avatar.",
      CHAMPION: "Chrome-foil vinyl: brushed silver digits with anisotropic streaks and a Tunnel-Navy offset, a double keyline (white plus a thin silver line) on every sticker, a chrome tier tag and a foil-backed avatar print.",
      LEGEND: "Domed epoxy resin over the number and the avatar disc: a thicker die, a visible lower dome edge, digits swelling 6% under the lens, one highlight bead, a deeper shadow. The print underneath inverts to Tunnel-Navy digits on a Logo-Blue offset, the tag turns navy. The founder dot stays matte beside it.",
    },
    legend: [
      "The pour. A clear bead of resin floods the die-line, the digits swell 6% under the lens, the highlight bead lands, and the whole stack presses down 2% once. No sparkles, no loop; under reduced motion the domed state simply shows.",
      "One spectacular physical property and nothing added: LEGEND is the same sticker under 3mm of resin, which is exactly why it reads as earned rather than decorated.",
    ],
    advantages: [
      "The only identity in the set you can literally send: the art is already a sticker, so the WhatsApp pack, the share story and the profile are one object.",
      "Native to how Moroccan teenagers talk (stickers, group chats, the mudguard) without a single zellige, flag or arch.",
      "A print-run ladder that is material, not colour: paper, vinyl, laminate, chrome, resin. Each step is a real manufacturing upgrade a teenager recognises.",
      "The founder mark is built into the stacking order rather than added as a chip, and it survives at 24px as a blue half-dot.",
      "The rating holds at 24px because the mini is the number itself, keyline included; no avatar to blur.",
    ],
    risks: [
      "The outline is a style more than one fixed shape: recognition rests on the keyline, the −6° slap and the GO tab, which another app could imitate faster than a unique die.",
      "Stickers can read as childish to users over 35; the LEGEND dome and the strict type have to carry adult desirability, and it is unproven that they do.",
      "A low number is the most visible thing on the card: a 52 slapped in the middle of your profile is harsh, and the die makes it physically smaller.",
      "The stack needs per-gameweek OVR history to be honest (display only); without it the fanned edges are decoration.",
      "A sticker pack must never become a random pack; the moment stickers are 'opened' it drifts toward loot boxes.",
      "Chrome and resin can drift toward NFT shine if pushed; they must stay physical (one band, one bead).",
      "Many small printed texts (rim, stat labels, founder rim) are texture below 200px, not information.",
      "The name is Darija and needs the owner's approval; the Arabic concept name would be ملصق.",
    ],
    gridWidth: 236,
    detailWidth: 380,

    full(p, o = {}) {
      const u = MC.uid("c08");
      const S = MC.s(o);
      const { defs, body } = art(p, o, u);
      return (
        `<div class="c08 c08-card${o.motion ? " c08--motion" : ""}${o.thumb ? " c08--thumb" : ""}" data-tier="${esc(tierOf(p))}" data-u="${u}" dir="${S.dir}"${MC.isAr(o) ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
        `<svg class="c08-art" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false"><defs>${defs}</defs><g class="c08-cluster">${body}</g></svg></div>`
      );
    },

    token,

    row(p, o = {}) {
      const S = MC.s(o);
      const tier = tierOf(p);
      return (
        `<div class="c08 c08-row${o.me ? " is-me" : ""}" data-tier="${tier}" dir="${S.dir}">` +
        `<span class="c08-rk">${MC.ltr(o.rank)}</span>` +
        `<span class="c08-rtk">${token(p, { ...o, size: 44, mini: false })}</span>` +
        `<span class="c08-rn">${esc(MC.nameOf(p, o))}</span>` +
        `<span class="c08-rt">${esc(S.tiers[tier])}</span>` +
        `<span class="c08-rp"><b>${MC.ltr(o.pts)}</b><small>${esc(S.pts)}</small></span>` +
        `</div>`
      );
    },

    share(p, o = {}) {
      const u = MC.uid("c08s");
      const ar = MC.isAr(o);
      const S = MC.s(o);
      const { defs, body } = art(p, o, u + "a");
      // the 84 at about 150px: the digits are ~196 units wide in the card box
      const sc = r2(150 / numW(p.ovr, 170));
      const cx = 180 - (VW * sc) / 2;
      const cy = 192;
      const handle = "@" + String(p.name.lat).toLowerCase();
      const L = (x) => (ar ? 360 - x : x);
      const svg =
        `<svg class="c08-sh-art" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>${defs}` +
        `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#071a3a"/><stop offset=".5" stop-color="#04112a"/><stop offset="1" stop-color="#020814"/></linearGradient>` +
        `<radialGradient id="${u}-lamp" cx=".5" cy="-.05" r=".75"><stop offset="0" stop-color="#E4EEFF" stop-opacity=".55"/><stop offset=".35" stop-color="#9DB9F0" stop-opacity=".16"/><stop offset="1" stop-color="#9DB9F0" stop-opacity="0"/></radialGradient>` +
        `<pattern id="${u}-fence" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H16M0 0V16" stroke="#A9BEDF" stroke-width="1.1" fill="none"/></pattern>` +
        `<linearGradient id="${u}-pole" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7C838D"/><stop offset=".3" stop-color="#C9CDD2"/><stop offset=".55" stop-color="#B3B8BF"/><stop offset="1" stop-color="#6A717B"/></linearGradient>` +
        `<linearGradient id="${u}-cyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#020814" stop-opacity=".78"/><stop offset=".1" stop-color="#020814" stop-opacity=".3"/><stop offset=".3" stop-color="#020814" stop-opacity="0"/><stop offset=".62" stop-color="#020814" stop-opacity=".06"/><stop offset=".86" stop-color="#020814" stop-opacity=".38"/><stop offset="1" stop-color="#020814" stop-opacity=".82"/></linearGradient>` +
        `<radialGradient id="${u}-fall" gradientUnits="userSpaceOnUse" cx="180" cy="372" r="330" gradientTransform="translate(180 372) scale(1 1.1) translate(-180 -372)"><stop offset="0" stop-color="#020814" stop-opacity="0"/><stop offset=".42" stop-color="#020814" stop-opacity=".08"/><stop offset=".72" stop-color="#020814" stop-opacity=".5"/><stop offset="1" stop-color="#020814" stop-opacity=".8"/></radialGradient>` +
        `<filter id="${u}-con" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
        // pores: fine relief lit from the upper start
        `<feTurbulence type="fractalNoise" baseFrequency="1.25" numOctaves="2" seed="8" result="n1"/>` +
        `<feDiffuseLighting in="n1" surfaceScale="1.1" lighting-color="#ffffff" result="lit"><feDistantLight azimuth="235" elevation="64"/></feDiffuseLighting>` +
        `<feComposite in="lit" in2="SourceGraphic" operator="arithmetic" k1="1.08" k2="0" k3="0" k4="0" result="m"/>` +
        // aggregate: a few lighter and darker stones
        `<feTurbulence type="fractalNoise" baseFrequency=".32" numOctaves="2" seed="17" result="n3"/>` +
        `<feColorMatrix in="n3" type="matrix" values="0 0 0 0 .2  0 0 0 0 .2  0 0 0 0 .2  2.4 0 0 0 -1.38" result="ag"/>` +
        `<feComposite in="ag" in2="SourceAlpha" operator="in" result="agi"/>` +
        // weathering: rain streaks run down the pole
        `<feTurbulence type="fractalNoise" baseFrequency=".035 .004" numOctaves="3" seed="21" result="n2"/>` +
        `<feColorMatrix in="n2" type="matrix" values="0 0 0 0 .14  0 0 0 0 .13  0 0 0 0 .12  .9 0 0 0 -.38" result="st"/>` +
        `<feComposite in="st" in2="SourceAlpha" operator="in" result="sti"/>` +
        `<feMerge><feMergeNode in="m"/><feMergeNode in="agi"/><feMergeNode in="sti"/></feMerge></filter>` +
        `<filter id="${u}-tear" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="31" result="n"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
        `<feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="6" result="g"/>` +
        `<feColorMatrix in="g" type="matrix" values="0 0 0 0 .4  0 0 0 0 .38  0 0 0 0 .34  1.2 0 0 0 -.5" result="gc"/>` +
        `<feComposite in="gc" in2="d" operator="in" result="gi"/>` +
        `<feDropShadow in="d" dx="0" dy=".8" stdDeviation=".6" flood-color="#1b2433" flood-opacity=".35" result="ds"/>` +
        `<feMerge><feMergeNode in="ds"/><feMergeNode in="gi"/></feMerge></filter>` +
        `<filter id="${u}-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
        `<filter id="${u}-bok" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>` +
        `<clipPath id="${u}-pc2"><rect x="62" y="0" width="236" height="640"/></clipPath>` +
        `</defs>` +
        `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
        // the cage of the terrain de proximité behind, out of focus, and two floodlights
        `<g opacity=".22" filter="url(#${u}-soft)"><rect y="250" width="360" height="390" fill="url(#${u}-fence)"/><rect x="${L(26)}" y="230" width="4" height="410" fill="#A9BEDF"/><rect x="${L(330)}" y="230" width="4" height="410" fill="#A9BEDF"/><rect y="248" width="360" height="3" fill="#A9BEDF"/></g>` +
        `<g filter="url(#${u}-bok)"><circle cx="${L(22)}" cy="170" r="12" fill="#DDE8FF" opacity=".55"/><circle cx="${L(44)}" cy="176" r="8" fill="#DDE8FF" opacity=".35"/><circle cx="${L(338)}" cy="214" r="10" fill="#DDE8FF" opacity=".4"/></g>` +
        `<rect width="360" height="640" fill="url(#${u}-lamp)"/>` +
        // the concrete lamppost, close up
        `<g clip-path="url(#${u}-pc2)">` +
        `<rect x="62" y="0" width="236" height="640" fill="url(#${u}-pole)" filter="url(#${u}-con)"/>` +
        `<path d="M62 112Q180 121 298 112" stroke="#2A313B" stroke-opacity=".5" stroke-width="1.2" fill="none"/><path d="M62 114Q180 123 298 114" stroke="#fff" stroke-opacity=".25" stroke-width="1" fill="none"/>` +
        `<path d="M62 598Q180 607 298 598" stroke="#2A313B" stroke-opacity=".5" stroke-width="1.2" fill="none"/>` +
        // sun-bleached, torn, blank old stickers: no logos, no words
        `<g transform="translate(${L(118)} 62) rotate(${ar ? 9 : -9})" filter="url(#${u}-tear)"><circle r="34" fill="#D7E3E6"/></g>` +
        `<g transform="translate(${L(236)} 150) rotate(${ar ? -12 : 12})" filter="url(#${u}-tear)"><rect x="-44" y="-24" width="88" height="48" rx="3" fill="#ECE6D6"/></g>` +
        `<g transform="translate(${L(206)} 70) rotate(${ar ? -4 : 4})" filter="url(#${u}-tear)"><rect x="-26" y="-14" width="52" height="28" rx="2" fill="#E6D9C2"/></g>` +
        `<g transform="translate(${L(102)} 566) rotate(${ar ? 8 : -8})" filter="url(#${u}-tear)"><rect x="-40" y="-26" width="80" height="52" rx="3" fill="#E5DDB9"/></g>` +
        `<g transform="translate(${L(238)} 600) rotate(${ar ? -5 : 5})" filter="url(#${u}-tear)"><circle r="28" fill="#E9D4D0"/></g>` +
        `<g transform="translate(${L(270)} 528) rotate(${ar ? 14 : -14})" filter="url(#${u}-tear)"><rect x="-22" y="-12" width="44" height="24" rx="2" fill="#E9EDF0"/></g>` +
        // ALI's fresh stack, slapped across it at chest height
        `<g transform="translate(${r2(cx)} ${cy}) scale(${sc})">${body}</g>` +
        `<rect x="62" y="0" width="236" height="640" fill="url(#${u}-fall)"/>` +
        `<rect x="62" y="0" width="236" height="640" fill="url(#${u}-cyl)"/>` +
        `</g></svg>`;
      const ex = ar ? "مثال" : "Exemple";
      const gw = ar ? "الجولة 7" : "J.07";
      return (
        `<div class="c08 c08-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
        svg +
        `<div class="c08-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
        `<div class="c08-sh-strip"><span>${MC.ltr(handle)}</span><i>·</i><span>${MC.ltr(p.id)}</span><i>·</i><span>${ar ? esc(gw) : MC.ltr(gw)}</span><i>·</i><em>${esc(ex)}</em></div>` +
        `</div>`
      );
    },

    /* Peel: drag the GO tab and the number sticker folds back over itself to show the
       layer below (last gameweek's sticker, blank in the sample). Release and it slaps
       back down in 90ms with no ease. Under reduced motion a tap toggles that layer. */
    mount(el) {
      if (!el || !el.classList || !el.classList.contains("c08-card") || el.dataset.c08m) return;
      el.dataset.c08m = "1";
      const u = el.dataset.u;
      const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--c08-tx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        el.style.setProperty("--c08-ty", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
      el.addEventListener("pointerleave", () => {
        el.style.removeProperty("--c08-tx");
        el.style.removeProperty("--c08-ty");
      });
      const num = el.querySelector(".c08-num");
      const front = el.querySelector(".c08-front");
      const flap = el.querySelector(".c08-flap");
      const flapUse = flap && flap.querySelector("use");
      const poly = el.querySelector(`[id="${u}-pc"] polygon`);
      const grad = el.querySelector(`[id="${u}-bk"]`);
      const go = el.querySelector(".c08-go");
      if (!num || !front || !flap || !flapUse || !poly || !go) return;
      const C = { x: +num.dataset.cx, y: +num.dataset.cy };
      const BIG = 2000;
      const rest = () => {
        poly.setAttribute("points", `-${BIG},-${BIG} ${BIG},-${BIG} ${BIG},${BIG} -${BIG},${BIG}`);
        flap.style.display = "none";
      };
      const fold = (P) => {
        const dx = C.x - P.x;
        const dy = C.y - P.y;
        const L = Math.hypot(dx, dy);
        if (L < 2) return rest();
        const nx = dx / L;
        const ny = dy / L;
        const mx = (C.x + P.x) / 2;
        const my = (C.y + P.y) / 2;
        const tx = -ny;
        const ty = nx;
        const pts = [
          [mx + tx * BIG, my + ty * BIG],
          [mx - tx * BIG, my - ty * BIG],
          [mx - tx * BIG - nx * BIG, my - ty * BIG - ny * BIG],
          [mx + tx * BIG - nx * BIG, my + ty * BIG - ny * BIG],
        ];
        poly.setAttribute("points", pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" "));
        const d = mx * nx + my * ny;
        const a = 1 - 2 * nx * nx;
        const b = -2 * nx * ny;
        const e = 1 - 2 * ny * ny;
        flapUse.setAttribute("transform", `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${b.toFixed(4)} ${e.toFixed(4)} ${(2 * d * nx).toFixed(2)} ${(2 * d * ny).toFixed(2)})`);
        if (grad) {
          grad.setAttribute("x1", mx.toFixed(1));
          grad.setAttribute("y1", my.toFixed(1));
          grad.setAttribute("x2", (mx + nx * 70).toFixed(1));
          grad.setAttribute("y2", (my + ny * 70).toFixed(1));
        }
        flap.style.display = "";
      };
      const local = (e) => {
        const m = num.getScreenCTM();
        if (!m) return null;
        return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      };
      let drag = false;
      let P = null;
      let shown = false;
      go.style.cursor = "grab";
      go.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (reduce) {
          shown = !shown;
          front.style.visibility = shown ? "hidden" : "";
          return;
        }
        drag = true;
        try {
          go.setPointerCapture(e.pointerId);
        } catch (err) {
          /* capture is optional */
        }
      });
      go.addEventListener("pointermove", (e) => {
        if (!drag) return;
        P = local(e);
        if (P) fold(P);
      });
      const end = () => {
        if (!drag) return;
        drag = false;
        if (!P) return rest();
        const from = { x: P.x, y: P.y };
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / 90);
          fold({ x: from.x + (C.x - from.x) * k, y: from.y + (C.y - from.y) * k });
          if (k < 1) requestAnimationFrame(step);
          else rest();
        };
        requestAnimationFrame(step);
        P = null;
      };
      go.addEventListener("pointerup", end);
      go.addEventListener("pointercancel", end);
    },
  };
  MC.register(c);
})();
