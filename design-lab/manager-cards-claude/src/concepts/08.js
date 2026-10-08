/* 08 LSAQ (youth). A cluster of die-cut vinyl stickers slapped on top of each other,
   the way they pile up on the lamppost by the terrain de proximité. The rating is a
   sticker slapped over last week's; the stack under it is the season. One SVG in a
   300 × 404 box; every selector in 08.css sits under .c08. */
(function () {
  const MC = window.MC;
  const NAVY = "#001C49";
  const BLUE = "#0151FC";
  const PAPER = "#F4F1E8";
  const TONER = "#1A1A1A";
  const SILVER = "#AEB6C1";
  const LIGHT = "#E9E2D6"; // unprinted stock: ears and nape on the avatar print
  const VW = 300;
  const VH = 404;
  // Changa advance widths per 1000 (digits are proportional: an 84 is wider than a 71).
  const ADV = { 0: 623, 1: 435, 2: 550, 3: 501, 4: 574, 5: 530, 6: 564, 7: 467, 8: 580, 9: 564 };
  const r2 = (n) => Math.round(n * 100) / 100;
  const numW = (s, fs) => (String(s).split("").reduce((a, ch) => a + (ADV[ch] || 560), 0) * fs) / 1000;
  const esc = MC.esc;
  const RAD = Math.PI / 180;

  /* The print run: each tier is a different way of making the same sticker. */
  const TIER = {
    HOMA: { kw: 7, lam: 0 },
    STADE: { kw: 11, lam: 0, satin: true },
    PRO: { kw: 12, lam: 0.32, gloss: true },
    CHAMPION: { kw: 13, lam: 0.14, dbl: true },
    LEGEND: { kw: 14, lam: 0, puck: true },
  };
  const tierOf = (p) => (TIER[p.tier] ? p.tier : "PRO");

  /* Card layout in viewBox units (LTR; mirrored for Arabic). */
  const LAYOUT = { disc: [70, 72], num: [158, 190], strip: [16, 320], sheet: [164, 280, 128, 118] };

  /* Faces used in measured layout: start loading them now so fonts.ready waits for them. */
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('800 100px "Changa"', "0123456789GO");
      document.fonts.load('700 100px "Changa"', "@ali J.07 محترف");
      document.fonts.load('900 100px "Big Shoulders Display"', "ALI");
      document.fonts.load('400 100px "Lalezar"', "علي");
      document.fonts.load('800 100px "Manrope"', "FOUNDER CAP");
      document.fonts.load('700 100px "Manrope"', "BOT #004821");
      document.fonts.load('700 100px "Noto Sans Arabic"', "القائد عضو مؤسس");
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
  const svgURI = (inner) =>
    "data:image/svg+xml," +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none">${inner}</svg>`);
  // Lens maps for the LEGEND resin: R runs 1→0 left to right, G 1→0 top to bottom, F is the radial falloff.
  const LENS_R = svgURI(`<defs><linearGradient id="a"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#000000"/></linearGradient></defs><rect width="100" height="100" fill="url(#a)"/>`);
  const LENS_G = svgURI(`<defs><linearGradient id="a" x2="0" y2="1"><stop offset="0" stop-color="#00ff00"/><stop offset="1" stop-color="#000000"/></linearGradient></defs><rect width="100" height="100" fill="url(#a)"/>`);
  const LENS_F = svgURI(`<defs><radialGradient id="a"><stop offset=".42" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></radialGradient></defs><rect width="100" height="100" fill="#000"/><rect width="100" height="100" fill="url(#a)"/>`);

  /* ---------- filters ---------- */
  // Every sticker: a ~1px outer hairline (so white vinyl holds on the mist ground) and a
  // small drop shadow. k = user units per CSS px, so the hairline stays one pixel at any size.
  function stickerFilter(id, k, big) {
    const hb = r2(0.9 * k);
    const bl = r2((big ? 4 : 1.3) * k);
    const dy = r2((big ? 6 : 1.7) * k);
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
  // Matte vinyl (founder dot): a visible flat tooth, white and navy specks, no gloss.
  const matteFilter = (id) =>
    `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="13" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -.62" result="w"/>` +
    `<feComposite in="w" in2="SourceAlpha" operator="in" result="wi"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 .05  0 0 0 0 .2  -1.4 0 0 0 .5" result="k"/>` +
    `<feComposite in="k" in2="SourceAlpha" operator="in" result="ki"/>` +
    `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="wi"/><feMergeNode in="ki"/></feMerge></filter>`;
  // STADE satin: a fine grain of white at about 5%, nothing that reads as gloss.
  const satinFilter = (id) =>
    `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .5 0 0 0 -.2"/></filter>`;
  // A lit edge: the shape minus itself shifted toward the lower end, flooded with light.
  const edgeLight = (id, dx, dy, op, color = "#fff") =>
    `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feOffset in="SourceAlpha" dx="${r2(dx)}" dy="${r2(dy)}" result="o"/>` +
    `<feComposite in="SourceAlpha" in2="o" operator="out" result="e"/>` +
    `<feFlood flood-color="${color}" flood-opacity="${op}"/><feComposite in2="e" operator="in"/></filter>`;
  // Torn paper: a ragged displacement for a mask shape.
  const tearFilter = (id, sc = 7) =>
    `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feTurbulence type="fractalNoise" baseFrequency=".18" numOctaves="3" seed="31" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${sc}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  // The BotolaGO GO mark (G, ball and swooshes) as one-colour art.
  const goMark = (x, y, w, h, fill) => {
    const B = window.MC_BRAND && window.MC_BRAND.mark;
    if (!B) return "";
    return `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" viewBox="${B.viewBox}" overflow="visible">${B.paths.map((q) => `<path d="${q.d}" fill="${fill}"/>`).join("")}</svg>`;
  };
  // The logo's ball alone (its largest 'ball' path), for the smallest peel tab.
  const ballGlyph = (cx, cy, d, fill) => {
    const B = window.MC_BRAND && window.MC_BRAND.mark;
    if (!B) return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(d / 2)}" fill="${fill}"/>`;
    const ball = B.paths.filter((q) => q.part === "ball").sort((a, b) => b.d.length - a.d.length)[0];
    return `<svg x="${r2(cx - d / 2)}" y="${r2(cy - d / 2)}" width="${r2(d)}" height="${r2(d)}" viewBox="1404 70 198 198" overflow="visible"><path d="${ball.d}" fill="${fill}"/></svg>`;
  };
  const blurFilter = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;
  // Chrome gradient, set in user space over the digits' ink box (top y0, bottom y1).
  const chromeGrad = (id, y0, y1) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${r2(y0)}" x2="0" y2="${r2(y1)}">` +
    `<stop offset="0" stop-color="#F6F8FA"/><stop offset=".36" stop-color="#C9D0D9"/><stop offset=".5" stop-color="#76818F"/>` +
    `<stop offset=".55" stop-color="#4A5464"/><stop offset=".7" stop-color="#A9B2BE"/><stop offset=".88" stop-color="#E6EAEF"/><stop offset="1" stop-color="#B7BFCA"/></linearGradient>`;

  /* ---------- the number sticker ---------- */
  // Local frame: origin at the centre of the digits' ink box.
  function numGeom(ovr, fs, kw) {
    const w = numW(ovr, fs);
    const sb = 0.028 * fs;
    return { w, sb, base: r2(0.32 * fs), hw: w / 2 - sb + kw, hh: 0.32 * fs + kw };
  }
  const digitsText = (ovr, fs, base, attrs) =>
    `<text x="0" y="${base}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${fs}" ${attrs}>${esc(ovr)}</text>`;
  // Closes the die between two digits (a 71 or a 47 has a hole there) but keeps the notches
  // above and below, so the outline still says "two digits".
  function dieBridge(ovr, fs, base, sw) {
    const s = String(ovr);
    let x = -numW(s, fs) / 2;
    let out = "";
    for (let i = 0; i < s.length - 1; i++) {
      x += ((ADV[s[i]] || 560) * fs) / 1000;
      out += `<rect x="${r2(x - 0.06 * fs)}" y="${r2(base - 0.56 * fs)}" width="${r2(0.12 * fs)}" height="${r2(0.48 * fs)}" stroke-width="${r2(sw)}" stroke-linejoin="round"/>`;
    }
    return out;
  }

  /** The printed digits, per tier. */
  function digits(u, p, tier, fs, base, full) {
    const ovr = String(p.ovr);
    const off = r2(fs * 0.0235);
    const off3 = r2(fs * 0.017);
    let s = "";
    if (tier === "HOMA") return digitsText(ovr, fs, base, `fill="${TONER}" opacity=".9"${full ? ` filter="url(#${u}-ton)"` : ""}`);
    if (tier === "STADE") {
      // two-colour print: a club-colour offset with a hairline of navy round it
      s += `<g transform="translate(${off} ${off})">${digitsText(ovr, fs, base, `fill="${p.club.secondary}" stroke="${NAVY}" stroke-width="${r2(fs * 0.0118)}" stroke-linejoin="round" paint-order="stroke"`)}</g>`;
      return s + digitsText(ovr, fs, base, `fill="${NAVY}"`);
    }
    if (tier === "PRO") {
      s += `<g transform="translate(${off3} ${off3})">${digitsText(ovr, fs, base, `fill="${NAVY}"`)}</g>`;
      return s + digitsText(ovr, fs, base, `fill="${BLUE}"`);
    }
    s += `<g transform="translate(${off} ${off})">${digitsText(ovr, fs, base, `fill="${NAVY}"`)}</g>`;
    if (tier === "CHAMPION")
      return s + digitsText(ovr, fs, base, `fill="url(#${u}-chr)" stroke="${NAVY}" stroke-width="${r2(fs * 0.0188)}" stroke-linejoin="round" paint-order="stroke"${full ? ` filter="url(#${u}-brs)"` : ""}`);
    // LEGEND: Logo-Blue ink under resin, with a chrome edge
    return s + digitsText(ovr, fs, base, `fill="${BLUE}" stroke="url(#${u}-chr)" stroke-width="${r2(fs * 0.034)}" stroke-linejoin="round" paint-order="stroke"`);
  }

  /* ---------- the avatar print ---------- */
  // The shared figure seen from behind, printed in two flat inks: navy hair, unprinted
  // stock for ears and nape, a halftone jacket getting denser away from the lit shoulder,
  // a solid Logo-Blue yoke seam and collar, and a white rim light on the upper-start edge.
  // small: the token and thumb crop (head top near the disc centre, neck navy, one mass).
  function figure(u, c, cx, cy, R, small) {
    const { tier, sg } = c;
    const home = tier === "HOMA";
    const inkN = home ? TONER : NAVY;
    const inkB = home ? TONER : BLUE;
    const light = home ? "#9D9A93" : LIGHT;
    const kR = R / 56;
    const s = small ? R / 141 : 0.66 * kR;
    const x0 = cx - 100 * s + sg * (small ? 0.1 * R : 10 * kR);
    const y0 = small ? cy - 0.3 * R - 38 * s : cy + 24 * kR - 179 * s;
    const pos = { x: r2(x0), y: r2(y0), w: r2(200 * s), h: r2(240 * s) };
    const part = (opts) => MC.avatar({ ...pos, torso: false, seam: false, collar: false, neck: false, skin: false, hair: false, ...opts });
    const seamIn = (svg, col, w) => svg.replace("</svg>", `<path d="${MC.AVATAR.seam}" fill="none" stroke="${col}" stroke-width="${r2(w / s)}"/></svg>`);
    let defs = "";
    let out = "";
    const box = `x="${r2(cx - R)}" y="${r2(cy - R)}" width="${r2(2 * R)}" height="${r2(2 * R)}"`;
    // the rim light (upper-start edge of hair, ears, nape and shoulders)
    const rimW = small ? Math.max(0.7, 0.09 * R) : 1.6 * kR;
    defs += edgeLight(`${u}-rl`, sg * rimW, rimW, home ? 0 : 0.95);
    const rim = home
      ? ""
      : `<g filter="url(#${u}-rl)">${part({ torso: "#000", neck: "#000", skin: "#000", hair: "#000" })}</g>`;
    if (small) {
      out += part({ torso: inkN, collar: inkB, neck: inkN, skin: light, hair: inkN });
      out += `<g>${part({ hair: inkN })}</g>` + rim;
      return { defs, body: out };
    }
    // jacket: the stock (or foil, at CHAMPION) knocked out, then a navy halftone
    defs +=
      `<linearGradient id="${u}-jt" x1="${sg > 0 ? 0 : 1}" y1="0" x2="${sg > 0 ? 1 : 0}" y2="1"><stop offset="0" stop-color="#5e5e5e"/><stop offset=".55" stop-color="#bdbdbd"/><stop offset="1" stop-color="#ffffff"/></linearGradient>` +
      `<mask id="${u}-mj" maskUnits="userSpaceOnUse" ${box}>${part({ torso: `url(#${u}-jt)` })}</mask>`;
    if (tier !== "CHAMPION") out += part({ torso: "currentColor", cls: home ? "c08-kop" : "c08-ko" });
    out += `<g filter="url(#${u}-thr)"><g mask="url(#${u}-mj)"><rect ${box} fill="url(#${u}-pN)"/></g></g>`;
    // second ink: the yoke seam and the collar, slightly misregistered on the cheaper runs
    const mis = home ? "translate(1.1 .7)" : tier === "STADE" ? "translate(.6 .4)" : "";
    out += `<g transform="${mis}">${seamIn(part({ collar: inkB }), inkB, 3)}</g>`;
    // stock: nape, ears and the lower head; then the hair, solid
    out += part({ neck: light, skin: light });
    out += part({ hair: inkN });
    out += rim;
    return { defs, body: out };
  }

  /* ---------- the avatar disc ---------- */
  function disc(u, p, c) {
    const { tier, cx, cy, thumb, sg } = c;
    const t = TIER[tier];
    const R = 56;
    const club = p.club.primary;
    const home = tier === "HOMA";
    const box = `x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}"`;
    let defs =
      `<clipPath id="${u}-cd"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>` +
      `<filter id="${u}-thr" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="12" intercept="-3.4"/></feComponentTransfer></filter>` +
      `<radialGradient id="${u}-dN" r=".71"><stop offset="0" stop-color="${home ? TONER : NAVY}"/><stop offset="1" stop-color="${home ? TONER : NAVY}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${u}-dB" r=".71"><stop offset="0" stop-color="${home ? TONER : BLUE}"/><stop offset="1" stop-color="${home ? TONER : BLUE}" stop-opacity="0"/></radialGradient>` +
      `<pattern id="${u}-pN" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.4" height="3.4" fill="url(#${u}-dN)"/></pattern>` +
      `<pattern id="${u}-pB" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><rect width="3.4" height="3.4" fill="url(#${u}-dB)"/></pattern>`;
    let face = "";
    // ground: club colour (paper at HOMA, brushed foil at CHAMPION)
    if (home) face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${PAPER}"/>`;
    else if (tier === "CHAMPION") {
      defs +=
        `<linearGradient id="${u}-fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EEF1F5"/><stop offset=".42" stop-color="#A9B2BE"/><stop offset=".52" stop-color="#6F7989"/><stop offset=".68" stop-color="#C3CAD3"/><stop offset="1" stop-color="#E4E8ED"/></linearGradient>`;
      face += `<g filter="url(#${u}-brs)"><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${u}-fg)"/></g>`;
    } else face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${club}"/>`;
    // a floodlight falling in from the top-end corner, printed as a Logo-Blue halftone
    const fx = r2(cx + sg * 0.88 * R);
    const fy = r2(cy - 0.9 * R);
    defs += `<radialGradient id="${u}-fl" gradientUnits="userSpaceOnUse" cx="${fx}" cy="${fy}" r="${r2(1.55 * R)}"><stop offset="0" stop-color="#a6a6a6"/><stop offset=".5" stop-color="#6a6a6a"/><stop offset="1" stop-color="#1a1a1a"/></radialGradient>`;
    if (thumb) {
      defs += `<radialGradient id="${u}-fls" gradientUnits="userSpaceOnUse" cx="${fx}" cy="${fy}" r="${r2(1.4 * R)}"><stop offset="0" stop-color="${home ? TONER : BLUE}" stop-opacity=".55"/><stop offset="1" stop-color="${home ? TONER : BLUE}" stop-opacity="0"/></radialGradient>`;
      face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${u}-fls)"/>`;
    } else {
      defs += `<mask id="${u}-mf" maskUnits="userSpaceOnUse" ${box}><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${u}-fl)"/></mask>`;
      face += `<g filter="url(#${u}-thr)"><g mask="url(#${u}-mf)"><rect ${box} fill="url(#${u}-pB)"/></g></g>`;
    }
    const F = figure(u, c, cx, cy, R, thumb);
    defs += F.defs;
    face += F.body;
    // satin / laminate sheen on the printed face
    if (t.lam) {
      defs += `<radialGradient id="${u}-sn" cx="${sg > 0 ? 0.3 : 0.7}" cy=".22" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
      face += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${u}-sn)"/>`;
    }
    let s = `<g filter="url(#${u}-stk)">`;
    s += home
      ? `<circle cx="${cx}" cy="${cy}" r="${R + 6.5}" fill="${PAPER}" class="c08-pap" filter="url(#${u}-pap)"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${R + 9}" class="k-w"/>`;
    if (t.dbl) s += `<circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="none" stroke="${SILVER}" stroke-width="1"/>`;
    s += `<g clip-path="url(#${u}-cd)">${face}</g>`;
    s += `</g>`;
    return { defs, body: s, lam: `<circle cx="${cx}" cy="${cy}" r="${R + 9}" fill="#fff"/>` };
  }

  /* ---------- the stats sheet: one kiss-cut sheet, the best stat half-peeled ---------- */
  function sheet(u, p, c, geo) {
    const { tier, ar, rtl, thumb, sg, o } = c;
    const S = MC.s(o);
    const home = tier === "HOMA";
    const t = TIER[tier];
    const [sx, sy, SW, SH] = geo;
    const x0 = rtl ? VW - sx - SW : sx;
    const tx = r2(x0 + SW / 2);
    const ty = r2(sy + SH / 2);
    const rot = rtl ? -3 : 3;
    const ink = home ? TONER : NAVY;
    const best = MC.STATS.reduce((b, k) => (p.stats[k] > p.stats[b] ? k : b), MC.STATS[0]);
    const R = 21;
    const colX = [-25, 25].map((x) => x * sg);
    const rowY = [-15, 32];
    let s = `<g class="c08-sheet" transform="translate(${tx} ${ty}) rotate(${rot})">`;
    s += `<g filter="url(#${u}-stk)">`;
    s += home
      ? `<rect x="${-SW / 2}" y="${-SH / 2}" width="${SW}" height="${SH}" rx="3" class="c08-pap" filter="url(#${u}-pap)"/>`
      : `<rect x="${-SW / 2}" y="${-SH / 2}" width="${SW}" height="${SH}" rx="6" class="c08-bk"/>`;
    s += `</g>`;
    // header, printed on the sheet's margin: the tier in its own material, then the season, ID and country
    if (!thumb) {
      const tierInk =
        tier === "HOMA" ? TONER : tier === "STADE" ? NAVY : tier === "PRO" ? BLUE : tier === "CHAMPION" ? `url(#${u}-hch)` : BLUE;
      const tierStroke = tier === "CHAMPION" ? ` stroke="${NAVY}" stroke-width=".35" paint-order="stroke"` : tier === "LEGEND" ? ` stroke="url(#${u}-hch)" stroke-width=".5" paint-order="stroke"` : "";
      const hx = r2(sg * (-SW / 2 + 10));
      const tName = S.tiers[tier];
      if (ar) {
        s +=
          `<text x="${hx}" y="-46" font-family="Noto Sans Arabic" font-weight="700" font-size="7.6" fill="${ink}" direction="rtl" text-anchor="start">` +
          `<tspan fill="${tierInk}"${tierStroke}>${esc(tName)}</tspan><tspan> · </tspan><tspan font-family="Manrope" font-size="6.5" direction="ltr" unicode-bidi="embed">${esc(p.season)}</tspan></text>` +
          `<text x="${hx}" y="-36.5" font-family="Noto Sans Arabic" font-weight="700" font-size="7" fill="${ink}" fill-opacity=".78" direction="rtl" text-anchor="start">` +
          `<tspan>${esc(S.country)}</tspan><tspan> · </tspan><tspan font-family="Manrope" font-size="6.5" direction="ltr" unicode-bidi="embed">${esc(p.id)}</tspan></text>`;
      } else {
        s +=
          `<text x="${hx}" y="-47" font-family="Manrope" font-weight="800" font-size="6.5" letter-spacing=".39" fill="${ink}" direction="ltr" style="font-variant-numeric:tabular-nums">` +
          `<tspan fill="${tierInk}"${tierStroke}>${esc(tName)}</tspan><tspan font-weight="700"> · ${esc(p.season)}</tspan></text>` +
          `<text x="${hx}" y="-38.5" font-family="Manrope" font-weight="700" font-size="6.5" letter-spacing=".39" fill="${ink}" fill-opacity=".78" direction="ltr" style="font-variant-numeric:tabular-nums">${esc(p.id)} · ${esc(S.country)}</text>`;
      }
    }
    const lam = [];
    let lifted = "";
    MC.STATS.forEach((k, i) => {
      const x = colX[i % 2];
      const y = rowY[i >> 1];
      const isB = k === best;
      // the kiss-cut ring stays on the sheet (and is all that is left where the best one was peeled)
      s += home
        ? `<circle cx="${x}" cy="${y}" r="${R + 0.6}" fill="none" stroke="${TONER}" stroke-opacity=".55" stroke-width=".7" stroke-dasharray="2.2 1.6"/>`
        : `<circle cx="${x}" cy="${y}" r="${R + 0.4}" fill="${isB ? "#fff" : "none"}" fill-opacity=".35" stroke="#9AA3B0" stroke-opacity=".6" stroke-width=".8"/>`;
      let d = "";
      d += home ? `<circle r="${R}" fill="${PAPER}" class="c08-pap"/>` : `<circle r="${R}" class="k-w"/>`;
      if (t.dbl) d += `<circle r="${R - 2.4}" fill="none" stroke="${SILVER}" stroke-width=".8"/>`;
      if (!thumb) {
        const vInk = isB && !home ? BLUE : ink;
        d += digitsText(String(p.stats[k]), 18, ar ? -0.6 : 1.9, `fill="${vInk}" direction="ltr"`);
        const lab = S.stats[k];
        if (ar) {
          const lw = measure(lab, '"Noto Sans Arabic"', 700, 8, 0.5);
          const fit = lw > 31 ? ` textLength="31" lengthAdjust="spacingAndGlyphs"` : "";
          d += `<text x="0" y="12.2" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="8" fill="${ink}" fill-opacity=".8" direction="rtl"${fit}>${esc(lab)}</text>`;
        } else d += `<text x="0" y="10.4" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="6.5" letter-spacing=".39" fill="${ink}" fill-opacity=".72" direction="ltr">${esc(lab)}</text>`;
      }
      if (isB) {
        // lifted 5 units, turned −12°, its own deeper shadow; the curl shows the white backing side
        const lx = r2(x - sg * 2);
        const ly = r2(y - 5);
        lifted =
          `<g class="c08-peel" transform="translate(${lx} ${ly}) rotate(${-12 * sg})"><g filter="url(#${u}-stl)">${d}</g>` +
          (home ? "" : `<path d="M${r2(sg * 17)} ${r2(11)}A${R} ${R} 0 0 ${sg > 0 ? 1 : 0} ${r2(sg * 7)} ${r2(19.8)}Q${r2(sg * 14)} 13 ${r2(sg * 17)} 11Z" fill="#DCE2EA"/>`) +
          `</g>`;
      } else s += `<g transform="translate(${x} ${y})"><g filter="url(#${u}-stk)">${d}</g></g>`;
      lam.push(`<circle cx="${x}" cy="${y}" r="${R}" fill="#fff"/>`);
    });
    s += lifted + `</g>`;
    return { body: s, lam: `<g transform="translate(${tx} ${ty}) rotate(${rot})">${lam.join("")}</g>` };
  }

  /* ---------- the whole cluster ---------- */
  function art(p, o, u, lay = {}) {
    const ar = MC.isAr(o);
    const rtl = ar;
    const S = MC.s(o);
    const tier = tierOf(p);
    const t = TIER[tier];
    const thumb = !!o.thumb;
    const home = tier === "HOMA";
    const LY = { ...LAYOUT, ...lay };
    const X = (x) => (rtl ? VW - x : x);
    const A = (a) => (rtl ? -a : a);
    const sg = rtl ? -1 : 1;
    const c = { tier, ar, rtl, thumb, o, sg };
    let defs =
      stickerFilter(`${u}-stk`, 1, false) +
      stickerFilter(`${u}-stl`, 1, true) +
      blurFilter(`${u}-b1`, 0.7) +
      blurFilter(`${u}-b12`, 1.2) +
      blurFilter(`${u}-b25`, 2.5) +
      tearFilter(`${u}-tr`);
    if (home) defs += paperFilter(`${u}-pap`) + tonerFilter(`${u}-ton`);
    if (tier === "CHAMPION") defs += brushFilter(`${u}-brs`);
    if (t.satin) defs += satinFilter(`${u}-sat`);
    if (t.gloss) defs += edgeLight(`${u}-kgl`, sg * 1.1, 1.2, 0.95) + edgeLight(`${u}-dgl`, sg * 0.9, 1, 0.42);
    if (p.founder) defs += matteFilter(`${u}-mat`);
    const lam = [];
    let body = "";

    /* number geometry */
    const ovr = String(p.ovr);
    const fs = 170;
    const kw = t.kw;
    const G = numGeom(ovr, fs, kw);
    const ncx = X(LY.num[0]);
    const ncy = LY.num[1];
    const tab = { w: 30, h: 15, r: 3.5, k: 3 };
    tab.x = rtl ? -G.hw - tab.w + 17 : G.hw - 17;
    tab.y = G.hh - 31;
    const dieTab = `<rect x="${r2(tab.x - tab.k)}" y="${r2(tab.y - tab.k)}" width="${tab.w + 2 * tab.k}" height="${tab.h + 2 * tab.k}" rx="${tab.r + tab.k}" stroke="none"/>`;
    defs +=
      `<g id="${u}-die">${digitsText(ovr, fs, G.base, `stroke-width="${2 * kw}" stroke-linejoin="round"`)}${dieBridge(ovr, fs, G.base, kw)}${dieTab}</g>` +
      `<mask id="${u}-md" maskUnits="userSpaceOnUse" x="-260" y="-200" width="520" height="400"><use href="#${u}-die" fill="#fff" stroke="#fff"/></mask>` +
      `<clipPath id="${u}-pc" clipPathUnits="userSpaceOnUse"><polygon points="-2000,-2000 2000,-2000 2000,2000 -2000,2000"/></clipPath>` +
      `<linearGradient id="${u}-bk" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="60" y2="0"><stop offset="0" stop-color="#9DA8B8"/><stop offset=".35" stop-color="#DCE2EA"/><stop offset="1" stop-color="#F3F5F8"/></linearGradient>`;
    if (tier === "CHAMPION" || tier === "LEGEND") defs += chromeGrad(`${u}-chr`, G.base - 0.64 * fs, G.base) + chromeGrad(`${u}-hch`, -52, -45);

    /* 1. older slaps: J.06, J.05, J.04, each slapped its own way (faces hidden) */
    const SL = [
      { dx: 9, dy: -6, a: -2, tab: [G.hw + 1, -G.hh + 34, 90] },
      { dx: 2, dy: -13, a: 3, tab: [G.hw * 0.3, -G.hh - 1, -4] },
      { dx: 15, dy: -3, a: -10, tab: [G.hw - 8, -G.hh + 4, 38] },
    ];
    let hist = "";
    for (let k = SL.length; k >= 1; k--) {
      const L = SL[k - 1];
      const ox = r2(ncx + L.dx * sg);
      const oy = r2(ncy + L.dy);
      const rot = r2(-6 + L.a * sg);
      const bleached = k >= 2;
      const face = home ? (bleached ? "c08-papb" : "c08-papf") : bleached ? "c08-bl" : "k-w k-ws";
      const tx = r2(sg * L.tab[0]);
      const tyy = r2(L.tab[1]);
      const ta = r2(sg * L.tab[2]);
      let g = `<use href="#${u}-die" class="${face}"${home ? ` filter="url(#${u}-pap)"` : ""}/>`;
      g +=
        `<g transform="translate(${tx} ${tyy}) rotate(${ta})"><rect x="-15.5" y="-9" width="31" height="18" rx="6" class="${face}"/>` +
        `<rect x="-12.5" y="-6" width="25" height="12" rx="3.5" fill="${home ? "#B9B4A8" : bleached ? "#C3CFEA" : "#8FA8EA"}"/></g>`;
      if (k === 1 && !thumb) g += `<g class="c08-dash">${digitsText("– –", r2(fs * 0.5), r2(G.base - 0.1 * fs), `fill="${NAVY}" opacity=".55"`)}</g>`;
      let mask = "";
      if (k === 3) {
        // a torn corner at the bottom-start: the oldest slap is wearing off
        const cxk = -sg * G.hw;
        defs +=
          `<mask id="${u}-tm" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800"><rect x="-400" y="-400" width="800" height="800" fill="#fff"/>` +
          `<g filter="url(#${u}-tr)"><polygon points="${r2(cxk - sg * 8)},${r2(G.hh - 22)} ${r2(cxk + sg * 22)},${r2(G.hh + 8)} ${r2(cxk - sg * 8)},${r2(G.hh + 8)}" fill="#000"/></g></mask>`;
        mask = ` mask="url(#${u}-tm)"`;
      }
      hist += `<g transform="translate(${ox} ${oy}) rotate(${rot})"${mask}><g filter="url(#${u}-stk)"${k === 1 ? ' class="c08-under"' : ""}>${g}</g></g>`;
    }

    /* 2. the avatar disc, top-start */
    const D = disc(u, p, { ...c, cx: X(LY.disc[0]), cy: LY.disc[1] });
    defs += D.defs;
    lam.push(D.lam);

    /* 3. the number sticker, slapped at -6deg (constant in both directions) */
    const peelC = { x: rtl ? tab.x : tab.x + tab.w, y: tab.y + tab.h };
    let num = `<g class="c08-num" transform="translate(${ncx} ${ncy}) rotate(-6)" data-cx="${r2(peelC.x)}" data-cy="${r2(peelC.y)}"><g class="c08-slapin">`;
    num += `<g class="c08-front" clip-path="url(#${u}-pc)"><g filter="url(#${u}-stk)">`;
    if (home) num += `<use href="#${u}-die" class="c08-papf" filter="url(#${u}-pap)"/>`;
    else num += `<use href="#${u}-die" class="k-w k-ws"/>`;
    if (t.dbl) {
      num +=
        digitsText(ovr, fs, G.base, `fill="${SILVER}" stroke="${SILVER}" stroke-width="${2 * (kw - 4) + 1.6}" stroke-linejoin="round"`) +
        digitsText(ovr, fs, G.base, `class="k-w k-ws" stroke-width="${2 * (kw - 4)}" stroke-linejoin="round"`);
    }
    if (t.gloss) num += `<use href="#${u}-die" fill="#000" stroke="#000" filter="url(#${u}-kgl)"/>`;
    num += digits(u, p, tier, fs, G.base, !thumb);
    if (t.gloss && !thumb) num += `<g filter="url(#${u}-dgl)">${digitsText(ovr, fs, G.base, 'fill="#000"')}</g>`;
    if (t.satin && !thumb) num += `<g mask="url(#${u}-md)"><rect x="-150" y="-100" width="300" height="200" filter="url(#${u}-sat)"/></g>`;
    // the GO tab: Logo Blue, fixed on the keyline at the bottom-end (the constant brand mark)
    num +=
      `<g class="c08-go"><rect x="${r2(tab.x + tab.w / 2 - 20)}" y="${r2(tab.y + tab.h / 2 - 20)}" width="40" height="40" fill="none" pointer-events="all"/>` +
      `<rect x="${r2(tab.x)}" y="${r2(tab.y)}" width="${tab.w}" height="${tab.h}" rx="${tab.r}" fill="${BLUE}"/>` +
      goMark(tab.x + 5.6, tab.y + 2.2, 18.8, 12, "#fff") +
      `</g>`;
    if (home) {
      // a crease across the paper
      num +=
        `<g mask="url(#${u}-md)"><path d="M${r2(-G.hw)} -26L${r2(G.hw)} 18" stroke="#fff" stroke-opacity=".8" stroke-width="1.1"/>` +
        `<path d="M${r2(-G.hw)} -24.8L${r2(G.hw)} 19.2" stroke="#000" stroke-opacity=".16" stroke-width="1"/></g>`;
    }
    num += `</g></g>`;
    // the flap shown while peeling (the sticker's backing side), hidden at rest
    num += `<g class="c08-flap" clip-path="url(#${u}-pc)" style="display:none"><g filter="url(#${u}-stk)"><use href="#${u}-die" fill="url(#${u}-bk)" stroke="url(#${u}-bk)"/></g></g>`;
    num += `</g></g>`;
    lam.push(`<g transform="translate(${ncx} ${ncy}) rotate(-6)"><use href="#${u}-die" fill="#fff" stroke="#fff"/></g>`);

    /* LEGEND: the number and its history sealed in one clear resin puck */
    let stack;
    if (t.puck) {
      const PW = r2(2 * G.hw + 28);
      const PH = r2(2 * G.hh + 34);
      const PR = 46;
      const rect = (ins, attrs) =>
        `<rect x="${r2(-PW / 2 + ins)}" y="${r2(-PH / 2 + ins)}" width="${r2(PW - 2 * ins)}" height="${r2(PH - 2 * ins)}" rx="${r2(PR - ins)}" ${attrs}/>`;
      const loc = `translate(${ncx} ${ncy}) rotate(-6)`;
      const BW = r2(PW * Math.cos(6 * RAD) + PH * Math.sin(6 * RAD) + 4);
      const BH = r2(PW * Math.sin(6 * RAD) + PH * Math.cos(6 * RAD) + 4);
      const bx = r2(ncx - BW / 2);
      const by = r2(ncy - BH / 2);
      const fi = `x="${bx}" y="${by}" width="${BW}" height="${BH}" preserveAspectRatio="none"`;
      const lit = sg > 0 ? `x1="0" y1="0" x2="1" y2="1"` : `x1="1" y1="0" x2="0" y2="1"`;
      defs +=
        `<clipPath id="${u}-pk"><rect transform="${loc}" x="${-PW / 2}" y="${-PH / 2}" width="${PW}" height="${PH}" rx="${PR}"/></clipPath>` +
        // the lens: what is under the resin is magnified about 4% at the centre, less toward the rim
        `<filter id="${u}-lens" filterUnits="userSpaceOnUse" x="${bx}" y="${by}" width="${BW}" height="${BH}" color-interpolation-filters="sRGB">` +
        `<feImage href="${LENS_R}" ${fi} result="r"/><feImage href="${LENS_G}" ${fi} result="g"/>` +
        `<feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>` +
        `<feImage href="${LENS_F}" ${fi} result="f"/>` +
        `<feComposite in="rg" in2="f" operator="arithmetic" k1="1" k3="-.5" k4=".5" result="map"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="map" scale="10" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        // two-layer shadow, knocked out under the clear body
        `<filter id="${u}-pks" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="a"/><feOffset in="a" dy="2" result="ao"/>` +
        `<feFlood class="c08-fp" flood-opacity=".45"/><feComposite in2="ao" operator="in" result="s1"/>` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="16" result="b"/><feOffset in="b" dy="12" result="bo"/>` +
        `<feFlood class="c08-fp" flood-opacity=".3"/><feComposite in2="bo" operator="in" result="s2"/>` +
        `<feMerge result="m"><feMergeNode in="s2"/><feMergeNode in="s1"/></feMerge>` +
        `<feComposite in="m" in2="SourceAlpha" operator="out"/></filter>` +
        `<linearGradient id="${u}-pus" ${lit}><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff"/><stop offset=".44" stop-color="#000"/></linearGradient>` +
        `<linearGradient id="${u}-pbe" ${lit}><stop offset=".5" stop-color="#000"/><stop offset=".64" stop-color="#fff"/></linearGradient>` +
        `<mask id="${u}-mus" maskUnits="userSpaceOnUse" x="${-PW}" y="${-PH}" width="${2 * PW}" height="${2 * PH}">${rect(-6, `fill="url(#${u}-pus)"`)}</mask>` +
        `<mask id="${u}-mbe" maskUnits="userSpaceOnUse" x="${-PW}" y="${-PH}" width="${2 * PW}" height="${2 * PH}">${rect(-6, `fill="url(#${u}-pbe)"`)}</mask>` +
        `<mask id="${u}-pkm" maskUnits="userSpaceOnUse" x="${-PW}" y="${-PH}" width="${2 * PW}" height="${2 * PH}"><circle class="c08-pk-grow" r="${r2(0.6 * Math.hypot(PW, PH))}" fill="#fff"/></mask>`;
      const bead = { x: r2(-sg * 30), y: r2(-PH / 2 + 7.5) };
      stack =
        `<g transform="${loc}">${rect(0, `fill="#000" filter="url(#${u}-pks)"`)}</g>` +
        `<g clip-path="url(#${u}-pk)"><g filter="url(#${u}-lens)">${hist}${num}</g></g>` +
        `<g class="c08-puck" transform="${loc}"><g mask="url(#${u}-pkm)">` +
        rect(0, `fill="#fff" fill-opacity=".06"`) +
        `<g mask="url(#${u}-mbe)">${rect(1.8, `fill="none" stroke="#0B2A5E" stroke-opacity=".45" stroke-width="3" filter="url(#${u}-b12)"`)}</g>` +
        `<g mask="url(#${u}-mus)">${rect(5, `fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="7" filter="url(#${u}-b25)"`)}</g>` +
        `<g class="c08-beadmove"><circle cx="${bead.x}" cy="${bead.y}" r="5.4" fill="#fff" opacity=".55" filter="url(#${u}-b12)"/><circle cx="${bead.x}" cy="${bead.y}" r="3.4" fill="#fff"/></g>` +
        `</g>` +
        rect(0, `fill="none" stroke="#858D99" stroke-width="1" vector-effect="non-scaling-stroke" pathLength="1" class="c08-pk-line"`) +
        `</g>`;
      // the disc sits under the puck's corner: you see it through the resin
      body += D.body + stack;
    } else body += hist + D.body + num;

    /* 4. the stats sheet, bottom-end */
    let sheetBody = "";
    if (LY.sheet) {
      const SH = sheet(u, p, c, LY.sheet);
      sheetBody = SH.body;
      lam.push(SH.lam);
    }
    body += sheetBody;

    /* 5. the name strip, with the founder dot slapped under its inline end */
    const nm = MC.nameOf(p, o);
    const pad = 14;
    const maxSW = 136;
    const maxTw = maxSW - 2 * pad;
    const fam = ar ? '"Lalezar"' : '"Big Shoulders Display"';
    const wt = ar ? 400 : 900;
    let nfs = 40;
    let ntw = measure(nm, fam, wt, nfs, 0.5) + (ar ? 0 : nm.length * 0.6);
    if (ntw > maxTw) {
      nfs = Math.max(30, (nfs * maxTw) / ntw);
      ntw = measure(nm, fam, wt, nfs, 0.5) + (ar ? 0 : nm.length * 0.6);
    }
    const squeeze = ntw > maxTw;
    ntw = Math.min(ntw, maxTw);
    const sH = ar ? 64 : 52;
    const sW = r2(ntw + 2 * pad);
    const sx0 = X(LY.strip[0]);
    const scy = LY.strip[1];
    const srot = A(2);
    const ink = home ? TONER : NAVY;
    let strip = `<g class="c08-strip" transform="translate(${sx0} ${scy}) rotate(${srot})">`;
    if (p.founder) {
      // FOUNDER 2026: the first slap. Matte Logo Blue, it never takes the tier's finish.
      const fr = 23;
      const fx = r2(sg * (sW + 8));
      const yy = String(p.founder).slice(-2);
      const vc = sg * 7.5; // centre of the part that shows past the strip
      let txt = "";
      if (!thumb) {
        if (ar) {
          const lw = measure(S.founder, '"Noto Sans Arabic"', 700, 7, 0.5);
          txt += `<text x="${r2(vc)}" y="1" text-anchor="middle" font-family="Changa" font-weight="800" font-size="18" fill="#fff" direction="ltr">${esc(yy)}</text>`;
          txt += `<text x="${r2(vc)}" y="12.6" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="7" fill="#fff" direction="rtl"${lw > 25 ? ' textLength="25" lengthAdjust="spacingAndGlyphs"' : ""}>${esc(S.founder)}</text>`;
        } else {
          const lw = measure(S.founder, '"Manrope"', 800, 5.5, 0.72) + 7 * 0.3;
          txt += `<text x="${r2(vc)}" y="3.2" text-anchor="middle" font-family="Changa" font-weight="800" font-size="18" fill="#fff" direction="ltr">${esc(yy)}</text>`;
          txt += `<text x="${r2(vc)}" y="11.6" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="5.5" letter-spacing=".3" fill="#fff" direction="ltr"${lw > 25 ? ' textLength="25" lengthAdjust="spacingAndGlyphs"' : ""}>${esc(S.founder)}</text>`;
        }
      } else txt += `<text x="${r2(vc)}" y="6" text-anchor="middle" font-family="Changa" font-weight="800" font-size="19" fill="#fff" direction="ltr">${esc(yy)}</text>`;
      strip +=
        `<g class="c08-founder" transform="translate(${fx} 0) rotate(${A(-8)})"><g filter="url(#${u}-stk)">` +
        `<circle r="${fr + 4}" class="k-w"/><circle r="${fr}" fill="${BLUE}" filter="url(#${u}-mat)"/></g>${txt}</g>`;
    }
    strip += `<g filter="url(#${u}-stk)">`;
    strip += home
      ? `<rect x="${rtl ? -sW : 0}" y="${-sH / 2}" width="${sW}" height="${sH}" rx="2" fill="${PAPER}" class="c08-pap" filter="url(#${u}-pap)"/>`
      : `<rect x="${rtl ? -sW : 0}" y="${-sH / 2}" width="${sW}" height="${sH}" rx="3" class="k-w"/>`;
    if (t.dbl) strip += `<rect x="${r2((rtl ? -sW : 0) + 3)}" y="${-sH / 2 + 3}" width="${r2(sW - 6)}" height="${sH - 6}" rx="1.5" fill="none" stroke="${SILVER}" stroke-width=".9"/>`;
    const fitAttr = squeeze ? ` textLength="${r2(maxTw)}" lengthAdjust="spacingAndGlyphs"` : "";
    strip += ar
      ? `<text x="${r2((sg * sW) / 2)}" y="${r2(nfs * 0.36)}" text-anchor="middle" font-family="Lalezar" font-size="${r2(nfs)}" fill="${ink}" direction="rtl"${fitAttr}>${esc(nm)}</text>`
      : `<text x="${r2((sg * sW) / 2)}" y="${r2(nfs * 0.355)}" text-anchor="middle" font-family="Big Shoulders Display" font-weight="900" font-size="${r2(nfs)}" letter-spacing=".6" fill="${ink}" direction="ltr"${fitAttr}>${esc(nm)}</text>`;
    strip += `</g></g>`;
    body += strip;
    lam.push(`<rect x="${rtl ? -sW : 0}" y="${-sH / 2}" width="${sW}" height="${sH}" fill="#fff" transform="translate(${sx0} ${scy}) rotate(${srot})"/>`);

    /* 6. laminate (PRO, CHAMPION): one specular band at 35deg, a crisp top edge and a soft fall */
    if (t.lam && !thumb) {
      defs +=
        `<linearGradient id="${u}-lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${t.lam}"/><stop offset=".25" stop-color="#fff" stop-opacity="${r2(t.lam * 0.6)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<mask id="${u}-lm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${VW + 40}" height="${VH + 40}">${lam.join("")}</mask>`;
      const band = tier === "PRO" ? 46 : 60;
      body +=
        `<g mask="url(#${u}-lm)" class="c08-lam"><g class="c08-lammove"><g transform="translate(${X(132)} 150) rotate(${A(-35)})">` +
        `<rect x="-170" y="${-band / 2}" width="380" height="${band}" fill="url(#${u}-lg)"/>` +
        (tier === "PRO" ? `<rect x="-170" y="${r2(-band / 2 - 0.4)}" width="380" height=".8" fill="#fff" fill-opacity=".9"/>` : "") +
        `</g></g></g>`;
    }
    return { defs, body };
  }

  /* ---------- token: the number sticker alone (44–80px) or reduced to its outline (24–32px) ---------- */
  // Gunmetal chrome for small CHAMPION digits: bright chrome on white vinyl is illegible below 80px.
  const steelGrad = (id, y0, y1) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${r2(y0)}" x2="0" y2="${r2(y1)}">` +
    `<stop offset="0" stop-color="#A3ADBB"/><stop offset=".4" stop-color="#566174"/><stop offset=".5" stop-color="#202a3a"/>` +
    `<stop offset=".58" stop-color="#121a28"/><stop offset=".75" stop-color="#4d586a"/><stop offset="1" stop-color="#8a95a5"/></linearGradient>`;
  // tab: null | "ball" | "go". arc: the founder as a Logo-Blue arc on the bottom-start keyline.
  function smallNumber(u, p, c) {
    const { fs, kw, k, rtl, arc, tab } = c;
    const tier = tierOf(p);
    const ovr = String(p.ovr);
    const sg = rtl ? -1 : 1;
    const G = numGeom(ovr, fs, kw);
    const T = (attrs, sw) => digitsText(ovr, fs, G.base, `${sw ? `stroke-width="${r2(sw)}" stroke-linejoin="round" ` : ""}${attrs}`);
    const dieW = 2 * kw;
    const bridge = (attrs, sw) => dieBridge(ovr, fs, G.base, sw).replace(/<rect /g, `<rect ${attrs} `);
    const shape = (attrs, sw) => T(attrs, sw) + bridge(attrs, sw);
    let defs = "";
    let s = "";
    // LEGEND alone is a smooth resin lozenge; every other tier keeps the contour of its digits
    const LW = r2(2 * (G.w / 2 - G.sb + kw * 1.15));
    const LH = r2(2 * G.hh + kw * 0.3);
    const loz = (ins, attrs) =>
      `<rect x="${r2(-LW / 2 + ins)}" y="${r2(-LH / 2 + ins)}" width="${r2(LW - 2 * ins)}" height="${r2(LH - 2 * ins)}" rx="${r2(LH * 0.46 - ins)}" ${attrs}/>`;
    const legend = tier === "LEGEND";
    if (arc) {
      defs += `<clipPath id="${u}-fa"><rect x="${r2(rtl ? G.hw - 0.46 * G.w : -G.hw - 12)}" y="${r2(G.base - 0.26 * fs)}" width="${r2(0.46 * G.w + 12)}" height="${r2(0.6 * fs)}"/></clipPath>`;
      const aw = Math.max(2, 1.5 * k);
      s += `<g clip-path="url(#${u}-fa)">${legend ? loz(-aw, `fill="${BLUE}"`) : shape(`fill="${BLUE}" stroke="${BLUE}"`, dieW + 2 * aw)}</g>`;
    }
    let ring = "";
    if (tier === "HOMA") ring += shape(`fill="none" stroke="${NAVY}" stroke-opacity=".75" stroke-dasharray="${r2(1.7 * k)} ${r2(1.2 * k)}"`, dieW + 2.4 * k);
    if (tier === "CHAMPION") ring += shape(`fill="none" class="c08-hl"`, dieW + 5.2 * k) + shape(`class="k-w k-ws"`, dieW + 4 * k) + shape(`fill="${SILVER}" stroke="${SILVER}"`, dieW + 2 * k);
    let die;
    if (tier === "HOMA") die = shape(`class="c08-papf"`, dieW);
    else if (legend) die = loz(0, `class="k-w"`);
    else die = shape(`class="k-w k-ws"`, dieW);
    s += `<g filter="url(#${u}-stk)">${ring}${die}</g>`;
    const off = r2(fs * 0.02);
    if (tier === "CHAMPION") s += `<g transform="translate(${off} ${off})">${T(`fill="${NAVY}"`)}</g>` + T(`fill="url(#${u}-chr)"`);
    else if (tier === "STADE")
      s += `<g transform="translate(${off} ${off})">${T(`fill="#e9e4d6" stroke="${NAVY}" stroke-width="${r2(0.7 * k)}" paint-order="stroke"`)}</g>` + T(`fill="${NAVY}"`);
    else if (tier === "HOMA") s += T(`fill="${TONER}" opacity=".9"`);
    else s += `<g transform="translate(${off} ${off})">${T(`fill="${NAVY}"`)}</g>` + T(`fill="${BLUE}"`);
    if (legend) {
      // the dome: a refracted lower rim, a bright upper rim and one bead
      const lit = rtl ? `x1="1" y1="0" x2="0" y2="1"` : `x1="0" y1="0" x2="1" y2="1"`;
      defs +=
        `<linearGradient id="${u}-lr" ${lit}><stop offset=".48" stop-color="#0B2A5E" stop-opacity="0"/><stop offset="1" stop-color="#0B2A5E" stop-opacity=".5"/></linearGradient>` +
        `<linearGradient id="${u}-lu" ${lit}><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
      s +=
        loz(Math.max(0.9, 0.7 * k), `fill="none" stroke="url(#${u}-lr)" stroke-width="${r2(Math.max(1.4, 1.1 * k))}"`) +
        loz(-0.3 * k, `fill="none" stroke="#B9C9E6" stroke-width="${r2(Math.max(1, 0.9 * k))}"`) +
        loz(Math.max(1, 0.8 * k), `fill="none" stroke="url(#${u}-lu)" stroke-width="${r2(Math.max(1, 0.9 * k))}"`) +
        `<circle cx="${r2(-sg * (LW / 2 - LH * 0.3))}" cy="${r2(-LH / 2 + LH * 0.2)}" r="${r2(Math.max(1.1, 0.9 * k))}" fill="#fff"/>`;
    }
    if (tab) {
      // a protruding peel corner, hanging outside the bottom-end of the die
      const tw = r2(0.34 * fs);
      const th = r2(0.26 * fs);
      const tcx = r2(sg * (legend ? LW / 2 : G.hw + 0.06 * fs));
      const tcy = r2(legend ? LH / 2 - 0.04 * fs : G.hh - 0.02 * fs);
      const kk = r2(0.9 * k);
      s +=
        `<g transform="translate(${tcx} ${tcy}) rotate(${28 * sg})"><g filter="url(#${u}-stk)"><rect x="${r2(-tw / 2 - kk)}" y="${r2(-th / 2 - kk)}" width="${r2(tw + 2 * kk)}" height="${r2(th + 2 * kk)}" rx="${r2(th * 0.3 + kk)}" class="k-w"/>` +
        `<rect x="${r2(-tw / 2)}" y="${r2(-th / 2)}" width="${tw}" height="${th}" rx="${r2(th * 0.3)}" fill="${BLUE}"/></g>` +
        (tab === "go" ? goMark(-tw * 0.4, -th * 0.33, tw * 0.8, th * 0.66, "#fff") : ballGlyph(0, 0, Math.max(0.18 * fs, 0.62 * th), "#fff")) +
        `</g>`;
    }
    defs += tier === "CHAMPION" ? steelGrad(`${u}-chr`, G.base - 0.64 * fs, G.base) : "";
    return { s, defs, G, LW, LH };
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const u = MC.uid("c08t");
    const rtl = MC.isAr(o);
    const S = MC.s(o);
    const tier = tierOf(p);
    const label = `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${S.tiers[tier]}${p.founder ? ", " + S.founderLine : ""}`;
    const X = (x, w) => (rtl ? w - x : x);
    if (mini) {
      const k = 32 / size;
      const N = smallNumber(u, p, { fs: 21, kw: 2.7, k, rtl, arc: !!p.founder, tab: null });
      const w = r2(size * 1.25);
      return (
        `<span class="c08 c08-tk c08-tk--mini" style="width:${w}px;height:${size}px" role="img" aria-label="${esc(label)}">` +
        `<svg viewBox="0 0 40 32" width="${w}" height="${size}" aria-hidden="true" focusable="false"><defs>${stickerFilter(`${u}-stk`, k * 0.8, false)}${N.defs}</defs>` +
        `<g transform="translate(${X(20.5, 40)} 16.4) rotate(-6)">${N.s}</g></svg></span>`
      );
    }
    // 44–80px: the number, the avatar disc peeking at the top-start, the peel tab and last week's slap
    const k = 80 / size;
    const fs = 50;
    const kw = 5.2;
    const big = size >= 64;
    const N = smallNumber(u, p, { fs, kw, k, rtl, arc: !!p.founder && !big, tab: size >= 64 ? "go" : "ball" });
    const ncx = X(50, 96);
    const ncy = 48;
    const dcx = X(18.5, 96);
    const dcy = 18.5;
    const R = 13.2;
    const sg = rtl ? -1 : 1;
    const F = figure(u, { tier, sg }, dcx, dcy, R, true);
    const w = r2(size * 1.2);
    const G = N.G;
    const lw = tier === "LEGEND";
    const lastWeek =
      `<g transform="translate(${r2(ncx + 6 * sg)} ${ncy - 7}) rotate(${-6 + 4 * sg})" filter="url(#${u}-stk)">` +
      (lw
        ? `<rect x="${r2(-N.LW / 2)}" y="${r2(-N.LH / 2)}" width="${N.LW}" height="${N.LH}" rx="${r2(N.LH * 0.46)}" class="c08-bl"/>`
        : digitsText(String(p.ovr), fs, G.base, `class="c08-bl" stroke-width="${2 * kw}" stroke-linejoin="round"`) + dieBridge(String(p.ovr), fs, G.base, kw).replace(/<rect /g, '<rect class="c08-bl" ')) +
      `</g>`;
    const founderDot =
      p.founder && big
        ? `<g transform="translate(${X(9, 96)} 35) rotate(${-8 * sg})"><g filter="url(#${u}-stk)"><circle r="9.6" class="k-w"/><circle r="8.2" fill="${BLUE}"/></g>` +
          `<text x="${r2(-sg * 1)}" y="3.1" text-anchor="middle" font-family="Changa" font-weight="800" font-size="8.4" fill="#fff" direction="ltr">${esc(String(p.founder).slice(-2))}</text></g>`
        : "";
    defs:
    return (
      `<span class="c08 c08-tk" style="width:${w}px;height:${size}px" role="img" aria-label="${esc(label)}">` +
      `<svg viewBox="0 0 96 80" width="${w}" height="${size}" aria-hidden="true" focusable="false"><defs>${stickerFilter(`${u}-stk`, k * 0.8, false)}${N.defs}${F.defs}` +
      `<clipPath id="${u}-cd"><circle cx="${dcx}" cy="${dcy}" r="${R}"/></clipPath>` +
      `<radialGradient id="${u}-fl" gradientUnits="userSpaceOnUse" cx="${r2(dcx + sg * 11)}" cy="7" r="19"><stop offset="0" stop-color="${tier === "HOMA" ? TONER : BLUE}" stop-opacity=".7"/><stop offset="1" stop-color="${tier === "HOMA" ? TONER : BLUE}" stop-opacity="0"/></radialGradient></defs>` +
      founderDot +
      lastWeek +
      `<g filter="url(#${u}-stk)"><circle cx="${dcx}" cy="${dcy}" r="16.6" class="${tier === "HOMA" ? "c08-papf" : "k-w"}"/><g clip-path="url(#${u}-cd)"><circle cx="${dcx}" cy="${dcy}" r="${R}" fill="${tier === "HOMA" ? PAPER : p.club.primary}"/><circle cx="${dcx}" cy="${dcy}" r="${R}" fill="url(#${u}-fl)"/>${F.body}</g></g>` +
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
      "Not a card at all: a fixed cluster of die-cut vinyl stickers, the kind that pile up on the lamppost outside the terrain de proximité, on a moped mudguard or inside a phone case. The 84 is the main sticker, cut round the real digits with a fat white keyline and slapped at −6°. The die follows the number, so a 71 is honestly narrower than an 84, and a bridge between the digits keeps the die closed while its notches still say 'two digits'.",
      "Behind it, the previous gameweeks' stickers stick out, each slapped its own way with its faded tab at its own corner, the oldest bleached and torn: your history is the thickness of the stack, not a chart. The avatar is its own round sticker, a two-ink screen print of the shared manager seen from behind, cropped tight with the shoulders running off the disc and a floodlight printed in Logo-Blue halftone. The name is a strip of white vinyl. The four stats live on one kiss-cut sheet with the season and the BotolaGO ID printed in its margin, and the best one is half peeled off it.",
      "What stays constant, and therefore what BotolaGO owns: the keyline weight, the −6° slap of the number, the avatar bump at the top-start, the stack sticking out at the top-end, the stepped bottom (name strip, then the sheet), and a small Logo-Blue GO tab fixed on the number's keyline at its bottom-end, the Levi's-tab principle. Depth comes from overlap and a small drop shadow; nothing is shaded inside a sticker except where the material itself (laminate, chrome, resin) demands it.",
    ],
    belonging: [
      "The stack is your season made physical. A 15-year-old sees it change every gameweek even when the tier does not, and a three-season stack is visibly thicker than a new one. Layers can only be played for, never bought.",
      "It is the only identity you can literally send. The same art exports as the WhatsApp sticker you reply with when the group asks for your number, which is how Moroccan group chats already talk. Friends compare by spamming each other's stickers.",
      "It borrows the Panini packet from the hanout for the older users and the sticker-bombed school bag for the younger ones, without naming a group, a chant or a crest.",
    ],
    founderMark: [
      "Every founder stack begins with the same round sticker, slapped down before anything else existed: matte Logo Blue, a white '26' in Changa 800 with FOUNDER set straight underneath. It sits under the name strip's inline end with most of it showing, so the strip reads 'ALI ·26', the founding-year form supporters already use, with no group vocabulary.",
      "It never upgrades. It is the only sticker that never takes the tier's laminate, chrome or resin, so its matte tooth is the tell, sharpest beside the LEGEND resin. Only the GO tab and the founder dot are Logo Blue, so 'ALI ·26' is the one blue mark beside the name. At 64–80px it peeks from under the avatar disc with its 26; at 44px and below it becomes a Logo-Blue arc on the number's bottom-start keyline.",
    ],
    small: [
      "44–80px: the number with its keyline at −6°, the avatar disc at the top-start cropped to a bust, last week's slap turned against it, and a Logo-Blue peel corner hanging off the bottom-end (the GO mark at 64px and up, the logo's ball at 44–56px). Founders get the 26 dot under the disc at 64–80px and a blue arc below that.",
      "24–32px: the number sticker alone. The tier is told by the outline itself: HOMA dashed (hand-cut), STADE a single keyline round navy digits, PRO the same with Logo-Blue ink, CHAMPION double (white and silver), and LEGEND the only smooth lozenge, a resin dome with a bright rim and a bead.",
    ],
    rtl: [
      "The cluster mirrors: the avatar disc moves to the top-right, the GO tab to the bottom-left, the stack to the top-left, the stats sheet to the bottom-left with CAP at its top-right, and the name strip runs right to left with the founder dot at its inline end (left). The slap angle of the number stays −6° in both directions: it is a constant of the brand, not a reading direction.",
      "علي is set in Lalezar in a taller 64-unit strip so its line box is never clipped. Stat labels, the tier and the founder line are Arabic in Noto Sans Arabic, never letter-spaced; digits and codes stay left-to-right.",
    ],
    tiers: {
      HOMA: "Paper cut with scissors: an uneven keyline, paper grain, toner-black digits with dropouts, one crease, a photocopied avatar misregistered by a unit, a stats sheet with dashed cut-here rings, a paper history. No gloss anywhere.",
      STADE: "Die-cut vinyl with a satin grain: a crisp, even keyline, Tunnel-Navy digits over a club-colour offset outlined in navy, the two avatar inks slightly misregistered.",
      PRO: "Laminated vinyl: one specular band at 35° with a crisp upper edge across every laminated sticker, a gloss line on the keyline, Logo-Blue digits with a Tunnel-Navy offset.",
      CHAMPION: "Chrome-foil vinyl: brushed silver digits with anisotropic streaks, a navy outline and a 4-unit navy offset, a double keyline (white plus silver) on every sticker, and an avatar printed straight onto foil.",
      LEGEND: "Sealed: the number and its whole history cast in one clear resin puck, a rounded lozenge that changes the outline of the cluster. The resin magnifies what is under it, has one specular along its upper-start contour, a refracted lower rim, a bead on its shoulder and a deeper two-layer shadow. The ink is Logo Blue on a navy offset with a chrome edge. The name strip, the sheet and the founder dot stay outside, matte.",
    },
    legend: [
      "The pour. A bead of resin traces the puck's outline, the specular floods in from the centre, and the whole stack presses down once. No sparkles, no loop; under reduced motion the sealed state simply shows.",
      "One spectacular physical property and nothing added: LEGEND is the same stack sealed in resin, which is exactly why it reads as earned rather than decorated. A sealed stack cannot be peeled any more; the history is kept, not hidden.",
    ],
    advantages: [
      "The only identity in the set you can literally send: the art is already a sticker, so the WhatsApp pack, the share story and the profile are one object.",
      "Native to how Moroccan teenagers talk (stickers, group chats, the mudguard) without a single zellige, flag or arch.",
      "A print-run ladder that is material, not colour: paper, satin vinyl, laminate, chrome, resin. Each step is a real manufacturing upgrade a teenager recognises, and LEGEND changes the outline itself.",
      "The founder mark is built into the stacking order rather than added as a chip, and it survives at 24px as a blue arc on the keyline.",
      "The rating holds at 24px because the mini is the number itself, keyline included; no avatar to blur.",
    ],
    risks: [
      "The outline is a style more than one fixed shape: recognition rests on the keyline, the −6° slap and the GO tab, which another app could imitate faster than a unique die.",
      "Stickers can read as childish to users over 35; the LEGEND resin and the strict type have to carry adult desirability, and it is unproven that they do.",
      "A low number is the most visible thing on the card: a 52 slapped in the middle of your profile is harsh, and the die makes it physically smaller.",
      "The stack needs per-gameweek OVR history to be honest (display only); without it the slaps behind are decoration.",
      "A sticker pack must never become a random pack; the moment stickers are 'opened' it drifts toward loot boxes.",
      "Chrome and resin can drift toward NFT shine if pushed; they must stay physical (one specular, one bead).",
      "The sheet's margin print (season, ID, country) is texture below 200px, not information.",
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
      // the share drops the stats sheet: the 84, the disc, the name strip, the founder dot and the GO tab
      const lay = { disc: [104, 72], strip: [50, 320], sheet: null };
      const { defs, body } = art(p, { ...o, thumb: false }, u + "a", lay);
      const sc = 0.86;
      const span = ar ? [VW - 295, VW - 39] : [39, 295];
      const tx = r2(180 - (sc * (span[0] + span[1])) / 2);
      const ty = 168;
      const L = (x) => (ar ? 360 - x : x);
      const P0 = 66;
      const PWd = 228;
      // the colour wordmark as its own white die-cut sticker, 150px wide, at the top of the pole
      const WM = window.MC_BRAND && window.MC_BRAND.wordmark;
      const wmS = 150 / 1614.8063;
      const wmH = 288.1029 * wmS;
      const wmX = ar ? 360 - 46 - 150 : 46;
      const wm = WM
        ? `<g transform="translate(${r2(wmX + 75)} ${r2(78 + wmH / 2)}) rotate(${ar ? 4 : -4}) translate(-75 ${r2(-wmH / 2)}) scale(${r2(wmS * 10000) / 10000})" filter="url(#${u}-lstk)">` +
          WM.paths.map((q) => `<path d="${q.d}" fill="#fff" stroke="#fff" stroke-width="${r2(8 / wmS)}" stroke-linejoin="round"/>`).join("") +
          WM.paths.map((q) => `<path d="${q.d}" fill="${q.part === "ink" ? BLUE : "#000"}"/>`).join("") +
          `</g>`
        : "";
      const head = (x, y, flip) =>
        `<g transform="translate(${x} ${y})${flip ? " scale(-1 1)" : ""}">` +
        `<rect x="-2" y="18" width="4" height="${610 - y - 18}" fill="#0E1A30"/>` +
        `<rect x="-30" y="-14" width="60" height="32" rx="2" fill="#16233A" stroke="#2C3D5C" stroke-width="1"/>` +
        [0, 1, 2].map((i) => [0, 1].map((j) => `<rect x="${-26 + i * 18}" y="${-10 + j * 13}" width="16" height="11" rx="1.5" fill="#EAF2FF"/>`).join("")).join("") +
        `</g>`;
      const svg =
        `<svg class="c08-sh-art" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>${defs}` +
        stickerFilter(`${u}-lstk`, 1 / wmS, false) +
        `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A2047"/><stop offset=".55" stop-color="#05122B"/><stop offset="1" stop-color="#020814"/></linearGradient>` +
        `<pattern id="${u}-fence" width="15" height="15" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H15M0 0V15" stroke="#B8CAE8" stroke-width="1.2" fill="none"/></pattern>` +
        `<linearGradient id="${u}-pole" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8A9099"/><stop offset=".32" stop-color="#C7CBD0"/><stop offset=".6" stop-color="#B2B7BE"/><stop offset="1" stop-color="#7A818B"/></linearGradient>` +
        `<linearGradient id="${u}-cyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#020814" stop-opacity=".82"/><stop offset=".1" stop-color="#020814" stop-opacity=".32"/><stop offset=".32" stop-color="#020814" stop-opacity="0"/><stop offset=".62" stop-color="#020814" stop-opacity=".05"/><stop offset=".86" stop-color="#020814" stop-opacity=".4"/><stop offset="1" stop-color="#020814" stop-opacity=".85"/></linearGradient>` +
        `<radialGradient id="${u}-fall" gradientUnits="userSpaceOnUse" cx="180" cy="330" r="300" gradientTransform="translate(180 330) scale(1 1.15) translate(-180 -330)"><stop offset="0" stop-color="#020814" stop-opacity="0"/><stop offset=".45" stop-color="#020814" stop-opacity=".06"/><stop offset=".75" stop-color="#020814" stop-opacity=".45"/><stop offset="1" stop-color="#020814" stop-opacity=".78"/></radialGradient>` +
        `<radialGradient id="${u}-bloom"><stop offset="0" stop-color="#DDE8FF" stop-opacity=".75"/><stop offset=".35" stop-color="#9DB9F0" stop-opacity=".22"/><stop offset="1" stop-color="#9DB9F0" stop-opacity="0"/></radialGradient>` +
        `<filter id="${u}-con" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
        // pores: a fine relief lit from the upper start
        `<feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" seed="8" result="n1"/>` +
        `<feDiffuseLighting in="n1" surfaceScale="1.8" lighting-color="#ffffff" result="lit"><feDistantLight azimuth="${ar ? 305 : 235}" elevation="58"/></feDiffuseLighting>` +
        `<feComposite in="lit" in2="SourceGraphic" operator="arithmetic" k1="1.12" k2="0" k3="0" k4="0" result="m"/>` +
        // aggregate: a few stones, half as many as before
        `<feTurbulence type="fractalNoise" baseFrequency=".3" numOctaves="2" seed="17" result="n3"/>` +
        `<feColorMatrix in="n3" type="matrix" values="0 0 0 0 .22  0 0 0 0 .22  0 0 0 0 .22  1.2 0 0 0 -.7" result="ag"/>` +
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
        `<filter id="${u}-glue" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".07" numOctaves="2" seed="44" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>` +
        `<filter id="${u}-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".8"/></filter>` +
        `<filter id="${u}-bok" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5"/></filter>` +
        `<clipPath id="${u}-pc2"><rect x="${P0}" y="0" width="${PWd}" height="610"/></clipPath>` +
        `</defs>` +
        `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
        // two floodlight heads on their masts, behind the cage
        head(L(34), 120, ar) +
        head(L(328), 84, !ar) +
        `<circle cx="${L(34)}" cy="126" r="62" fill="url(#${u}-bloom)"/><circle cx="${L(328)}" cy="90" r="70" fill="url(#${u}-bloom)"/>` +
        `<g filter="url(#${u}-bok)" opacity=".9"><rect x="${L(34) - 26}" y="112" width="52" height="24" fill="#F3F7FF"/><rect x="${L(328) - 26}" y="76" width="52" height="24" fill="#F3F7FF"/></g>` +
        // the cage of the terrain de proximité: mesh, posts and rail
        `<g opacity=".5" filter="url(#${u}-soft)"><rect y="300" width="360" height="310" fill="url(#${u}-fence)"/>` +
        `<rect x="${L(18)}" y="290" width="4" height="320" fill="#B8CAE8"/><rect x="${L(342) - 4}" y="290" width="4" height="320" fill="#B8CAE8"/><rect y="296" width="360" height="4" fill="#B8CAE8"/></g>` +
        // the ground line
        `<rect y="610" width="360" height="30" fill="#060B16"/><rect y="609" width="360" height="1.5" fill="#3A4A66"/>` +
        // the concrete lamppost, close up
        `<g clip-path="url(#${u}-pc2)">` +
        `<rect x="${P0}" y="0" width="${PWd}" height="610" fill="url(#${u}-pole)" filter="url(#${u}-con)"/>` +
        // two formwork seams
        `<path d="M${P0} 196Q180 204 ${P0 + PWd} 196" stroke="#262C35" stroke-opacity=".55" stroke-width="1.3" fill="none"/><path d="M${P0} 198Q180 206 ${P0 + PWd} 198" stroke="#fff" stroke-opacity=".28" stroke-width="1" fill="none"/>` +
        `<path d="M${P0} 492Q180 500 ${P0 + PWd} 492" stroke="#262C35" stroke-opacity=".55" stroke-width="1.3" fill="none"/><path d="M${P0} 494Q180 502 ${P0 + PWd} 494" stroke="#fff" stroke-opacity=".28" stroke-width="1" fill="none"/>` +
        // ghosts of old adhesive where stickers were scraped off
        `<g opacity=".25" filter="url(#${u}-glue)"><rect x="${L(196) - 30}" y="128" width="60" height="38" rx="4" fill="#D9C68E"/><circle cx="${L(104)}" cy="470" r="22" fill="#D9C68E"/><rect x="${L(240) - 22}" y="458" width="44" height="30" rx="3" fill="#CDBB86"/><rect x="${L(120) - 18}" y="150" width="36" height="22" rx="2" fill="#CDBB86"/></g>` +
        // sun-bleached, torn, blank old stickers: no logos, no words
        `<g transform="translate(${L(250)} 150) rotate(${ar ? -12 : 12})" filter="url(#${u}-tear)"><rect x="-34" y="-18" width="68" height="36" rx="3" fill="#ECE6D6"/></g>` +
        `<g transform="translate(${L(96)} 176) rotate(${ar ? 9 : -9})" filter="url(#${u}-tear)"><circle r="20" fill="#D7E3E6"/></g>` +
        `<g transform="translate(${L(110)} 548) rotate(${ar ? 8 : -8})" filter="url(#${u}-tear)"><rect x="-34" y="-22" width="68" height="44" rx="3" fill="#E5DDB9"/></g>` +
        `<g transform="translate(${L(250)} 584) rotate(${ar ? -5 : 5})" filter="url(#${u}-tear)"><circle r="24" fill="#E9D4D0"/></g>` +
        `<g transform="translate(${L(266)} 506) rotate(${ar ? 14 : -14})" filter="url(#${u}-tear)"><rect x="-18" y="-10" width="36" height="20" rx="2" fill="#E9EDF0"/></g>` +
        wm +
        // ALI's fresh stack, slapped across it at chest height
        `<g transform="translate(${tx} ${ty}) scale(${sc})">${body}</g>` +
        `<rect x="${P0}" y="0" width="${PWd}" height="610" fill="url(#${u}-fall)"/>` +
        `<rect x="${P0}" y="0" width="${PWd}" height="610" fill="url(#${u}-cyl)"/>` +
        `</g></svg>`;
      const ex = ar ? "مثال" : "Exemple";
      const gw = ar ? "الجولة 7" : "J.07";
      const handle = "@" + String(p.name.lat).toLowerCase();
      return (
        `<div class="c08 c08-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${esc(MC.label(p, o))}">` +
        svg +
        `<div class="c08-sh-strip"><span>${MC.ltr(handle)}</span><i>·</i><span>${MC.ltr(p.id)}</span><i>·</i><span>${ar ? esc(gw) : MC.ltr(gw)}</span><i>·</i><em>${esc(ex)}</em></div>` +
        `</div>`
      );
    },

    /* Peel: drag the GO tab and the number sticker folds back over itself to show the
       layer below (last gameweek's sticker, blank in the sample). Release and it slaps
       back down in 90ms with no ease. Under reduced motion a tap toggles that layer.
       LEGEND is sealed in resin: it cannot be peeled. */
    mount(el) {
      if (!el || !el.classList || !el.classList.contains("c08-card") || el.dataset.c08m) return;
      el.dataset.c08m = "1";
      const u = el.dataset.u;
      const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--c08-tx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        el.style.setProperty("--c08-ty", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
      el.addEventListener("pointerleave", () => {
        el.style.removeProperty("--c08-tx");
        el.style.removeProperty("--c08-ty");
      });
      if (el.dataset.tier === "LEGEND") return;
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
        el.classList.remove("c08-peeling");
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
        el.classList.add("c08-peeling");
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
          el.classList.toggle("c08-peeling", shown);
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
