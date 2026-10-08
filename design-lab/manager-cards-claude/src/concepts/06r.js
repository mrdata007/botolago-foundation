/* 06 BRASSARD (bold). The captain's armband, reissued for managers.
   A short woven band seen from a few degrees above, with the closure tab sticking out
   of its end. The 84 sits where an armband carries its "C"; the stats are woven down the
   tab; the founder year is woven on the band and cut into the tab's end on the wordmark's
   11.3 degree slant. Everything on the band is projected onto a real cylinder (per-glyph
   cos(theta) compression and ellipse-following baselines), so it can be spun in mount(). */
(function () {
  const MC = window.MC;
  const ID = "c06";

  /* Faces used in measured layout: request them now so fonts.ready waits for them. */
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('800 100px "Changa"', "ALI 0123456789 BotolaGO");
      document.fonts.load('800 100px "Changa"', "علي محترف المغرب");
      document.fonts.load('800 100px "Manrope"', "CAP SEL TRF CON PRO 0123456789 #");
      document.fonts.load('700 100px "Manrope"', "BOT #004821 2026/27");
      document.fonts.load('700 100px "Noto Sans Arabic"', "القائد التشكيلة الانتقالات الثبات عضو مؤسس المغرب");
    }
  } catch (e) {
    /* measuring falls back to estimates */
  }

  /* ---------- small helpers ---------- */
  const f = (n) => Math.round(n * 100) / 100;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEG = 180 / Math.PI;
  const SLANT = Math.tan(11.3 / DEG); // the wordmark's italic, used for the founder cut
  const rgb = (h) => {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const mix = (a, b, t) => {
    const A = rgb(a);
    const Bc = rgb(b);
    return "#" + A.map((v, i) => Math.round(v + (Bc[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };

  /* Text measuring (canvas), cached only once the face is really loaded. */
  let cv = null;
  const mcache = new Map();
  function measure(txt, font, ls = 0) {
    const key = font + "|" + txt;
    const extra = ls * Math.max(0, [...String(txt)].length - 1);
    if (mcache.has(key)) return mcache.get(key) + extra;
    let w;
    try {
      cv = cv || document.createElement("canvas").getContext("2d");
      cv.font = font;
      w = cv.measureText(txt).width;
      if (document.fonts && document.fonts.check(font, txt)) mcache.set(key, w);
    } catch (e) {
      const px = parseFloat((String(font).match(/([\d.]+)px/) || [0, 12])[1]);
      w = String(txt).length * px * 0.6;
    }
    return w + extra;
  }
  /* Changa digit advances (per 1000, read from the font): proportional, so the 84 is laid out per glyph. */
  const DIG = { 0: 0.623, 1: 0.435, 2: 0.55, 3: 0.501, 4: 0.574, 5: 0.53, 6: 0.564, 7: 0.467, 8: 0.58, 9: 0.564 };

  /* ---------- palette ---------- */
  const K = {
    cream: "#EEF2F7", // weave cream
    thread2: "#b9c3cf", // second thread (labels, tier word)
    blue: "#0151FC", // Logo Blue: the top selvedge, the one fixed brand ink
    velcro: "#5d6570", // loop fabric (cream on it: 5.4:1)
    inside: "#0b0f15",
    rim: "#9BA3AE", // dark-ground lit edge (7.7:1 on the dark page)
    silicone: "#F4F6F8",
    graphite: "#2A2F36",
  };

  /* ---------- tiers: material, not colour ---------- */
  const TIER = {
    HOMA: { n: 0, tone: 0.07, weave: "rib", stripes: 0, ovr: "print", piping: false, ring: false, spec: 0.07, reinforce: false },
    STADE: { n: 1, tone: 0, weave: "twill", stripes: 1, ovr: "woven", piping: false, ring: false, spec: 0.1, reinforce: false },
    PRO: { n: 2, tone: 0, weave: "double", stripes: 2, ovr: "satin", piping: false, ring: false, spec: 0.15, reinforce: false },
    CHAMPION: { n: 3, tone: -0.06, weave: "double", stripes: 3, ovr: "applique", piping: true, ring: false, spec: 0.17, reinforce: true },
    LEGEND: { n: 4, tone: -0.2, weave: "boucle", stripes: 3, ovr: "silicone", piping: true, ring: true, spec: 0.22, reinforce: true },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;
  const clubOf = (p) => ({
    body: (p.club && p.club.primary) || K.graphite,
    sec: (p.club && p.club.secondary) || K.cream,
  });
  /* The body colour in this tier's material: printed elastic is a touch chalkier, the heavy LEGEND weave deeper. */
  const bodyTone = (club, T) => (T.tone > 0 ? mix(club.body, "#ffffff", T.tone) : T.tone < 0 ? mix(club.body, "#000000", -T.tone) : club.body);

  /* ---------- band geometry (viewBox units) ----------
     cx/R: the cylinder; top/ry: the top rim ellipse (8 degrees from above); H: band height;
     irx/iry: the inner opening; s0: arc position of the readable centre (left of the tab);
     tx/th0/th1/tOut: the closure tab (attached edge x, top and bottom band heights,
     how far its foot sticks out past the band end). */
  const geo = (g) => {
    g.x0 = g.cx - g.R;
    g.x1 = g.cx + g.R;
    return g;
  };
  const B = geo({ W: 360, VH: 214, cx: 160, R: 146, top: 46, ry: 13, H: 118, irx: 141, iry: 10.5, s0: -16, tx: 234, th0: 14, th1: 112, tOut: 8 });
  const GT = geo({ W: 98, VH: 48, cx: 39, R: 34, top: 9.5, ry: 4.4, H: 31, irx: 31.4, iry: 2.9, s0: -4, tx: 58, th0: 3.5, th1: 28.5, tOut: 4.5 });
  const GM = geo({ W: 50, VH: 28, cx: 19.5, R: 17.5, top: 4.7, ry: 2.6, H: 17.6, irx: 15.6, iry: 1.6, s0: -1.6, tx: 30, th0: 6.6, th1: 17.6, tOut: 3 });

  const bodyPath = (g, lift = 0) =>
    `M${g.x0} ${f(g.top - lift)}A${g.R} ${g.ry} 0 0 0 ${g.x1} ${f(g.top - lift)}V${g.top + g.H}A${g.R} ${g.ry} 0 0 1 ${g.x0} ${g.top + g.H}Z`;
  /* A horizontal band of the cylinder between two band heights (curves with the ellipse). */
  const arcBand = (g, h0, h1) =>
    `M${g.x0} ${f(g.top + h0)}A${g.R} ${g.ry} 0 0 0 ${g.x1} ${f(g.top + h0)}L${g.x1} ${f(g.top + h1)}A${g.R} ${g.ry} 0 0 1 ${g.x0} ${f(g.top + h1)}Z`;
  /* A band on the inner face of the back wall, seen through the opening (upper half-ellipses). */
  const backBand = (g, h0, h1) =>
    `M${f(g.cx - g.irx)} ${f(g.top + h0)}A${g.irx} ${g.iry} 0 0 1 ${f(g.cx + g.irx)} ${f(g.top + h0)}L${f(g.cx + g.irx)} ${f(g.top + h1)}A${g.irx} ${g.iry} 0 0 0 ${f(g.cx - g.irx)} ${f(g.top + h1)}Z`;
  const arcLine = (g, h) => `M${g.x0} ${f(g.top + h)}A${g.R} ${g.ry} 0 0 0 ${g.x1} ${f(g.top + h)}`;
  const arcLines = (g, step, h0, h1) => {
    let d = "";
    for (let h = h0; h < h1; h += step) d += arcLine(g, h);
    return d;
  };
  const outlinePath = (g) =>
    `M${g.x0} ${g.top}A${g.R} ${g.ry} 0 0 1 ${g.x1} ${g.top}V${g.top + g.H}A${g.R} ${g.ry} 0 0 1 ${g.x0} ${g.top + g.H}Z`;

  /* Places content on the cylinder at arc position s, band height h, spun by phi.
     Verticals stay vertical; horizontals follow the ellipse (skewY); widths shrink by cos. */
  function place(g, s, h, phi, inner, cut = 0.16) {
    const th = s / g.R + phi;
    const c = Math.cos(th);
    if (c < cut) return "";
    const x = g.cx + g.R * Math.sin(th);
    const y = g.top + g.ry * c + h;
    const k = Math.atan((-g.ry * Math.sin(th)) / (g.R * c)) * DEG;
    const a = clamp((c - cut) / 0.28, 0, 1);
    return `<g transform="translate(${f(x)} ${f(y)}) skewY(${f(k)}) scale(${f(c)} 1)"${a < 1 ? ` opacity="${f(a)}"` : ""}>${inner}</g>`;
  }

  /* The closure tab's frame: a flat panel in perspective, drawn in local units
     (x from its attached edge, y down from its top edge). */
  function tabFrame(g, founder, ext = 0) {
    const yS = g.top + g.ry * Math.cos(Math.asin((g.tx - g.cx) / g.R)) + g.th0;
    const yE = g.top + g.th0;
    const m = (0.6 * (yE - yS)) / (g.x1 - g.tx);
    const Ht = g.th1 - g.th0;
    const xb = g.x1 + g.tOut - g.tx + ext;
    const xt = founder ? xb + Ht * SLANT : xb + Ht * SLANT * 0.5;
    const xbe = founder ? xb : xt;
    const xe = (y) => xt - (y / Ht) * (xt - xbe);
    const poly = `M0 0H${f(xt)}L${f(xbe)} ${f(Ht)}H0Z`;
    return { x: g.tx, y: yS, k: Math.atan(m) * DEG, Ht, xt, xb: xbe, xe, poly };
  }
  /* The LEGEND ring: a machined steel frame at the band's end. The strap is threaded through it
     (over the near bar, under the far one) and the frame stands proud of the strap above and below. */
  function ringGeo(g, F, rw, ov) {
    const x0 = g.x1 - g.tx - rw * 0.45;
    const r = rw * 0.42;
    const y0 = -ov;
    const y1 = F.Ht + ov;
    const d = `M${f(x0 + r)} ${f(y0)}H${f(x0 + rw - r)}Q${f(x0 + rw)} ${f(y0)} ${f(x0 + rw)} ${f(y0 + r)}V${f(y1 - r)}Q${f(x0 + rw)} ${f(y1)} ${f(x0 + rw - r)} ${f(y1)}H${f(x0 + r)}Q${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - r)}V${f(y0 + r)}Q${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}Z`;
    const bar = `M${f(x0)} ${f(-1.2)}V${f(F.Ht + 1.2)}`;
    return { x0, rw, d, bar };
  }

  /* Mount registry: what a rendered card needs to be re-projected while spinning. */
  const REG = new Map();
  const remember = (k, v) => {
    REG.set(k, v);
    if (REG.size > 400) REG.delete(REG.keys().next().value);
  };

  /* ---------- the woven surface (everything that turns with the band) ---------- */
  function wovenFill(T, u) {
    return T.ovr === "print" ? K.cream : `url(#${u}-pk)`;
  }

  function nameRow(p, o, u, phi, T) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const nm = MC.nameOf(p, o);
    const tw = S.tiers[p.tier];
    let nSize = 21;
    const tSize = ar ? 11 : 9.5;
    const tLs = ar ? 0 : 1.3;
    const tFont = ar ? `700 ${tSize}px "Noto Sans Arabic"` : `800 ${tSize}px "Manrope"`;
    const wt = measure(tw, tFont, tLs);
    const gap = 13;
    const max = 158;
    let wn = measure(nm, `800 ${nSize}px "Changa"`);
    let fitAttr = "";
    if (wn + gap + wt > max) {
      nSize = Math.max(14, (nSize * (max - gap - wt)) / wn);
      wn = measure(nm, `800 ${f(nSize)}px "Changa"`);
      if (wn + gap + wt > max) {
        wn = max - gap - wt;
        fitAttr = ` textLength="${f(wn)}" lengthAdjust="spacingAndGlyphs"`;
      }
    }
    const tot = wn + gap + wt;
    const hb = ar ? 46 : 44.5;
    const left = B.s0 - tot / 2;
    const nameS = ar ? left + tot - wn / 2 : left + wn / 2;
    const tierS = ar ? left + wt / 2 : left + tot - wt / 2;
    const dotS = ar ? left + wt + gap / 2 : left + wn + gap / 2;
    let s = place(
      B,
      nameS,
      hb,
      phi,
      `<text text-anchor="middle" font-family="Changa, 'Noto Sans Arabic', sans-serif" font-weight="800" font-size="${f(nSize)}" fill="${wovenFill(T, u)}"${fitAttr}>${MC.esc(nm)}</text>`,
    );
    s += place(B, dotS, hb - (ar ? 5.5 : 4.4), phi, `<rect x="-1.3" y="-1.3" width="2.6" height="2.6" fill="${K.thread2}"/>`);
    s += place(
      B,
      tierS + (ar ? 0 : tLs / 2),
      hb,
      phi,
      `<text text-anchor="middle" font-family="${ar ? "'Noto Sans Arabic', Changa" : "Manrope"}, sans-serif" font-weight="${ar ? 700 : 800}" font-size="${tSize}"${ar ? "" : ` letter-spacing="${tLs}"`} fill="${K.thread2}">${MC.esc(tw)}</text>`,
    );
    return s;
  }

  /* The 84: per glyph on the cylinder, in the tier's material. */
  function ovrGlyphs(p, o, u, phi, T, thumb, club) {
    const str = String(p.ovr);
    const Z = 76;
    const hb = 104;
    const ws = [...str].map((ch) => (DIG[ch] || 0.56) * Z);
    const tot = ws.reduce((a, b) => a + b, 0);
    let acc = B.s0 - tot / 2;
    let out = "";
    const base = `text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="${Z}"`;
    const specTh = -26 / DEG;
    ws.forEach((w, i) => {
      const sC = acc + w / 2;
      acc += w;
      const ch = MC.esc(str[i]);
      const thG = sC / B.R + phi;
      // satin sheen: where the cylinder's specular line crosses this glyph
      const t = 0.5 + ((specTh - thG) * B.R) / w;
      const st = (v) => f(clamp(v, 0, 1));
      const sheen =
        `<linearGradient id="${u}-sh${i}" x1="0" y1="0" x2="1" y2=".45">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="${st(t - 0.26)}" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="${st(t)}" stop-color="#fff" stop-opacity=".62"/>` +
        `<stop offset="${st(t + 0.26)}" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#1a2230" stop-opacity=".18"/></linearGradient>`;
      let inner;
      if (T.ovr === "print") {
        inner = `<text ${base} fill="${K.cream}">${ch}</text>` + (thumb ? "" : `<text ${base} fill="url(#${u}-ink)">${ch}</text>`);
      } else if (T.ovr === "woven") {
        inner =
          `<text ${base} fill="url(#${u}-pk)">${ch}</text>` +
          `<text ${base} fill="none" stroke="#0b0f14" stroke-opacity=".28" stroke-width=".7">${ch}</text>`;
      } else if (T.ovr === "satin" || T.ovr === "applique") {
        const under =
          T.ovr === "applique"
            ? `<text ${base} fill="#11161d" stroke="#11161d" stroke-width="5.2" stroke-linejoin="round"${thumb ? "" : ` filter="url(#${u}-raise)"`}>${ch}</text>`
            : "";
        inner =
          `<defs>${sheen}</defs>` +
          under +
          `<g${thumb ? "" : ` filter="url(#${u}-raise)"`}><text ${base} fill="url(#${u}-sat)">${ch}</text></g>` +
          `<text ${base} fill="url(#${u}-sh${i})">${ch}</text>` +
          (T.ovr === "applique" && !thumb
            ? `<text ${base} fill="none" stroke="${mix(club.body, "#000", 0.25)}" stroke-opacity=".75" stroke-width=".75" stroke-dasharray="1.7 1.2">${ch}</text>`
            : "");
      } else {
        // LEGEND: moulded silicone relief with a raking shadow
        inner = thumb
          ? `<text ${base} x="2" y="2.4" fill="#05080d" opacity=".5">${ch}</text><text ${base} fill="${K.silicone}">${ch}</text>`
          : `<text ${base} fill="${K.silicone}" filter="url(#${u}-sil)">${ch}</text>`;
      }
      out += place(B, sC, hb, phi, inner);
    });
    return out;
  }

  /* FOUNDER: '26 woven in a box on the band's start side (where an armband carries its C). */
  function founderPatch(p, o, u, phi, T, thumb) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const yy = String(p.founder).slice(-2);
    const fill = wovenFill(T, u);
    const box = `<rect x="-17" y="-15" width="34" height="30" rx="1.2" fill="none" stroke="${K.cream}" stroke-width="1.6"/>`;
    const inBox = `<rect x="-14.2" y="-12.2" width="28.4" height="24.4" fill="none" stroke="${K.cream}" stroke-opacity=".5" stroke-width=".6" stroke-dasharray="1.4 1"/>`;
    const num = `<text y="7.4" text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="23" fill="${fill}" direction="ltr">${MC.esc(yy)}</text>`;
    const lab = ar
      ? `<text y="-20.5" text-anchor="middle" font-family="'Noto Sans Arabic', sans-serif" font-weight="700" font-size="7.6" fill="${K.thread2}">${MC.esc(S.founder)}</text>`
      : `<text y="-20" x=".5" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="6.6" letter-spacing="1" fill="${K.thread2}">${MC.esc(S.founder)}</text>`;
    return place(B, -98, 78, phi, box + (thumb ? "" : inBox) + num + (thumb ? "" : `<g class="c06-fine">${lab}</g>`));
  }

  function crestItem(phi) {
    return place(B, 56, 79, phi, `<g transform="translate(-9 -11)" opacity=".9">${MC.crest({ mono: K.cream, w: 18, h: 21.6 })}</g>`);
  }

  /* The faces that only exist when the band is turned (mount): seasons, figure + ID, BotolaGO. */
  function faces(p, o, u, phi, T, club) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const Q = (Math.PI * B.R) / 2;
    const sg = ar ? -1 : 1;
    const fill = wovenFill(T, u);
    const lat = ar ? "'Noto Sans Arabic', Changa, sans-serif" : "Manrope, sans-serif";
    let out = "";
    const s1 = B.s0 + sg * Q;
    out += place(B, s1, 42, phi, `<text text-anchor="middle" font-family="${lat}" font-weight="800" font-size="9.5"${ar ? "" : ' letter-spacing="1.3"'} fill="${K.thread2}">${MC.esc(S.season)}</text>`);
    out += place(B, s1, 84, phi, `<text text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="34" fill="${fill}" direction="ltr">${MC.esc(p.season)}</text>`);
    for (let i = 0; i < 4; i++)
      out += place(B, s1 - 27 + i * 18, 94, phi, `<rect x="-6" y="0" width="12" height="4.5" fill="none" stroke="${K.thread2}" stroke-width=".8" stroke-dasharray="1.5 1.2" opacity=".75"/>`);
    const s2 = B.s0 + Math.PI * B.R;
    out += place(
      B,
      s2 + sg * -48,
      40,
      phi,
      MC.avatar({ x: -40, y: 0, w: 80, h: 96, torso: mix(club.body, "#fff", 0.72), seam: club.body, hoodFill: mix(club.body, "#fff", 0.8) }),
    );
    out += place(B, s2 + sg * 44, 56, phi, `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="11" fill="${K.cream}" direction="ltr" style="font-variant-numeric:tabular-nums">${MC.esc(p.id)}</text>`);
    out += place(B, s2 + sg * 44, 80, phi, `<text text-anchor="middle" font-family="Changa, 'Noto Sans Arabic', sans-serif" font-weight="800" font-size="16" fill="${fill}">${MC.esc(S.country)}</text>`);
    out += place(B, s2 + sg * 44, 97, phi, `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="10" fill="${K.thread2}" direction="ltr">${MC.esc(p.season)}</text>`);
    const s3 = B.s0 - sg * Q;
    out += place(B, s3, 86, phi, `<text text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="34" fill="${fill}" direction="ltr">BotolaGO</text>`);
    return out;
  }

  function surfaceItems(p, o, u, phi) {
    const T = tierOf(p);
    const thumb = !!o.thumb;
    const club = clubOf(p);
    let out = "";
    if (!thumb) out += nameRow(p, o, u, phi, T);
    out += ovrGlyphs(p, o, u, phi, T, thumb, club);
    if (p.founder) out += founderPatch(p, o, u, phi, T, thumb);
    out += crestItem(phi);
    if (phi) out += faces(p, o, u, phi, T, club);
    return out;
  }

  /* ---------- defs for the full card ---------- */
  function defsFull(u, T, thumb, club) {
    const g = B;
    let d = "<defs>";
    d += `<clipPath id="${u}-body"><path d="${bodyPath(g)}"/></clipPath>`;
    d += `<clipPath id="${u}-in"><ellipse cx="${g.cx}" cy="${g.top}" rx="${g.irx}" ry="${g.iry}"/></clipPath>`;
    d +=
      `<linearGradient id="${u}-cyl" gradientUnits="userSpaceOnUse" x1="${g.x0}" y1="0" x2="${g.x1}" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".06" stop-color="#000" stop-opacity=".28"/>` +
      `<stop offset=".18" stop-color="#000" stop-opacity=".08"/><stop offset=".32" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset=".56" stop-color="#000" stop-opacity=".05"/><stop offset=".78" stop-color="#000" stop-opacity=".18"/>` +
      `<stop offset=".93" stop-color="#000" stop-opacity=".36"/><stop offset="1" stop-color="#000" stop-opacity=".48"/></linearGradient>`;
    d +=
      `<linearGradient id="${u}-spec" gradientUnits="userSpaceOnUse" x1="44" y1="0" x2="150" y2="0">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${T.spec}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    d +=
      `<linearGradient id="${u}-ao" gradientUnits="userSpaceOnUse" x1="0" y1="${g.top}" x2="0" y2="${g.top + g.H + g.ry}">` +
      `<stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".12" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>`;
    d +=
      `<linearGradient id="${u}-insd" gradientUnits="userSpaceOnUse" x1="0" y1="${g.top - g.iry}" x2="0" y2="${g.top + g.iry}">` +
      `<stop offset="0" stop-color="${mix(club.body, "#000", 0.12)}"/><stop offset=".55" stop-color="${mix(club.body, "#000", 0.42)}"/><stop offset="1" stop-color="${mix(club.body, "#000", 0.72)}"/></linearGradient>`;
    d +=
      (T.ovr === "print"
        ? `<linearGradient id="${u}-rimt" gradientUnits="userSpaceOnUse" x1="${g.x0}" y1="0" x2="${g.x1}" y2="0">` +
          `<stop offset="0" stop-color="${mix(club.body, "#fff", 0.16)}"/><stop offset=".3" stop-color="${mix(club.body, "#fff", 0.3)}"/><stop offset="1" stop-color="${mix(club.body, "#000", 0.12)}"/></linearGradient>`
        : `<linearGradient id="${u}-rimt" gradientUnits="userSpaceOnUse" x1="${g.x0}" y1="0" x2="${g.x1}" y2="0">` +
          `<stop offset="0" stop-color="#2f6dff"/><stop offset=".3" stop-color="#4a82ff"/><stop offset=".7" stop-color="${K.blue}"/><stop offset="1" stop-color="#0034a8"/></linearGradient>`);
    // woven cream thread (picks) for text and stripes
    d +=
      `<pattern id="${u}-pk" patternUnits="userSpaceOnUse" width="6" height="1.6">` +
      `<rect width="6" height="1.6" fill="${K.cream}"/><rect y="1.12" width="6" height=".48" fill="#a9b2be"/></pattern>`;
    d += `<pattern id="${u}-ink" patternUnits="userSpaceOnUse" width="6" height="2"><rect y="1.15" width="6" height=".85" fill="#1b2230" opacity=".2"/></pattern>`;
    d +=
      `<pattern id="${u}-sat" patternUnits="userSpaceOnUse" width="2.3" height="2.3" patternTransform="rotate(-38)">` +
      `<rect width="2.3" height="2.3" fill="#f4f7fa"/><rect y="1.8" width="2.3" height=".5" fill="#aab4c1"/></pattern>`;
    const tw = { rib: 0, twill: 3.4, double: 2.3, boucle: 4.6 }[T.weave];
    if (tw)
      d +=
        `<pattern id="${u}-tw" patternUnits="userSpaceOnUse" width="${tw}" height="${tw}" patternTransform="rotate(-58)">` +
        `<rect width="${tw}" height="${f(tw * 0.36)}" fill="#fff" opacity="${T.weave === "boucle" ? 0.09 : 0.075}"/>` +
        `<rect y="${f(tw * 0.55)}" width="${tw}" height="${f(tw * 0.26)}" fill="#000" opacity="${T.weave === "boucle" ? 0.2 : 0.12}"/></pattern>`;
    d +=
      `<linearGradient id="${u}-tabl" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>`;
    d += `<radialGradient id="${u}-gs"><stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset=".6" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    if (T.ring) {
      const F = tabFrame(g, true, 12);
      d +=
        `<linearGradient id="${u}-steel" gradientUnits="userSpaceOnUse" x1="${f(g.x1 - g.tx - 8)}" y1="-8" x2="${f(g.x1 - g.tx + 12)}" y2="${f(F.Ht + 8)}">` +
        `<stop offset="0" stop-color="#59616c"/><stop offset=".18" stop-color="#e9eef3"/><stop offset=".34" stop-color="#8d97a3"/>` +
        `<stop offset=".52" stop-color="#f7f9fb"/><stop offset=".7" stop-color="#6c7581"/><stop offset=".86" stop-color="#c3cad3"/><stop offset="1" stop-color="#4c535d"/></linearGradient>`;
    }
    if (!thumb) {
      d +=
        `<filter id="${u}-gr" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.7 0 0 0 1.02"/>` +
        `<feComposite in2="SourceGraphic" operator="in"/></filter>`;
      d +=
        `<filter id="${u}-vel" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" seed="11" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.25"/>` +
        `<feComposite in2="SourceGraphic" operator="in"/></filter>`;
      d += `<filter id="${u}-soft" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2.4"/></filter>`;
      d +=
        `<filter id="${u}-raise" x="-15%" y="-15%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/>` +
        `<feSpecularLighting in="b" surfaceScale="2.4" specularConstant=".6" specularExponent="16" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="48"/></feSpecularLighting>` +
        `<feComposite in="sp" in2="SourceAlpha" operator="in" result="spi"/>` +
        `<feOffset in="SourceAlpha" dx="1" dy="1.7" result="of"/><feGaussianBlur in="of" stdDeviation="1.1" result="ob"/>` +
        `<feFlood flood-color="#05080d" flood-opacity=".62"/><feComposite in2="ob" operator="in" result="sh"/>` +
        `<feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/><feMergeNode in="spi"/></feMerge></filter>`;
      d +=
        `<filter id="${u}-sil" x="-20%" y="-20%" width="150%" height="150%" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="1.7" result="b"/>` +
        `<feDiffuseLighting in="b" surfaceScale="5" diffuseConstant="1.12" lighting-color="#fff" result="df"><feDistantLight azimuth="225" elevation="58"/></feDiffuseLighting>` +
        `<feComposite in="df" in2="SourceAlpha" operator="in" result="dfi"/>` +
        `<feBlend in="SourceGraphic" in2="dfi" mode="multiply" result="lit"/>` +
        `<feSpecularLighting in="b" surfaceScale="5" specularConstant=".85" specularExponent="26" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="42"/></feSpecularLighting>` +
        `<feComposite in="sp" in2="SourceAlpha" operator="in" result="spi"/>` +
        `<feOffset in="SourceAlpha" dx="3.4" dy="3.8" result="of"/><feGaussianBlur in="of" stdDeviation="2.6" result="ob"/>` +
        `<feFlood flood-color="#03060a" flood-opacity=".66"/><feComposite in2="ob" operator="in" result="sh"/>` +
        `<feMerge><feMergeNode in="sh"/><feMergeNode in="lit"/><feMergeNode in="spi"/></feMerge></filter>`;
    }
    d += "</defs>";
    return d;
  }

  /* ---------- weave texture over the band body ---------- */
  function weaveLayer(u, T, thumb) {
    if (thumb) return "";
    const g = B;
    const clip = ` clip-path="url(#${u}-body)"`;
    let s = `<g${clip} pointer-events="none">`;
    if (T.weave === "rib") {
      // printed elastic: fine longitudinal ribs that follow the cylinder
      s += `<path d="${arcLines(g, 2, 1, g.H)}" fill="none" stroke="#000" stroke-opacity=".16" stroke-width=".8"/>`;
      s += `<path d="${arcLines(g, 2, 2, g.H)}" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width=".6"/>`;
    } else if (T.weave === "boucle") {
      // the heaviest weave: raised ottoman ribs plus a coarse twill
      s += `<rect x="${g.x0}" y="${g.top - g.ry}" width="${g.x1 - g.x0}" height="${g.H + 2 * g.ry}" fill="url(#${u}-tw)"/>`;
      s += `<path d="${arcLines(g, 3.4, 1.6, g.H)}" fill="none" stroke="#000" stroke-opacity=".26" stroke-width="1.25"/>`;
      s += `<path d="${arcLines(g, 3.4, 0.2, g.H)}" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width=".8"/>`;
    } else {
      s += `<rect x="${g.x0}" y="${g.top - g.ry}" width="${g.x1 - g.x0}" height="${g.H + 2 * g.ry}" fill="url(#${u}-tw)"/>`;
      s += `<path d="${arcLines(g, T.weave === "double" ? 1.25 : 1.6, 0.6, g.H)}" fill="none" stroke="#000" stroke-opacity="${T.weave === "double" ? 0.1 : 0.08}" stroke-width=".42"/>`;
    }
    s += `<rect x="${g.x0}" y="${g.top - g.ry}" width="${g.x1 - g.x0}" height="${g.H + 2 * g.ry}" fill="#000" filter="url(#${u}-gr)" opacity="${T.weave === "rib" ? 0.22 : 0.3}"/>`;
    s += `</g>`;
    return s;
  }

  /* ---------- the inside label (BOT #, season, country), seen through the opening ---------- */
  function insideLabel(p, o, u, club) {
    const g = B;
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const w = 128;
    const x = g.cx - w / 2;
    const y = g.top - g.iry + 6.2;
    const h = 11.6;
    const ink = mix(club.body, "#000", 0.35);
    const lf = `800 6.3px "Manrope"`;
    const af = `700 7px "Noto Sans Arabic"`;
    const pieces = [
      { t: p.id, font: lf, fam: "Manrope", w: 800, sz: 6.3, ltr: true },
      { t: "·", font: lf, fam: "Manrope", w: 800, sz: 6.3, ltr: true },
      { t: p.season, font: lf, fam: "Manrope", w: 800, sz: 6.3, ltr: true },
      { t: "·", font: lf, fam: "Manrope", w: 800, sz: 6.3, ltr: true },
      ar ? { t: S.country, font: af, fam: "'Noto Sans Arabic'", w: 700, sz: 7, ltr: false } : { t: S.country, font: lf, fam: "Manrope", w: 800, sz: 6.3, ltr: true },
    ];
    const gap = 3.2;
    const ls = 0.45;
    const ws = pieces.map((q) => measure(q.t, q.font, q.ltr ? ls : 0));
    const tot = ws.reduce((a, b) => a + b, 0) + gap * (pieces.length - 1);
    const sc = Math.min(1, (w - 12) / tot);
    let cx = g.cx - (tot * sc) / 2;
    let txt = "";
    pieces.forEach((q, i) => {
      const ww = ws[i] * sc;
      txt += `<text x="${f(cx + ww / 2)}" y="${f(y + 8.1)}" text-anchor="middle" font-family="${q.fam}, sans-serif" font-weight="${q.w}" font-size="${f(q.sz * sc)}"${q.ltr ? ` letter-spacing="${f(ls * sc)}" direction="ltr"` : ""} fill="${ink}" style="font-variant-numeric:tabular-nums">${MC.esc(q.t)}</text>`;
      cx += ww + gap * sc;
    });
    return (
      `<g clip-path="url(#${u}-in)">` +
      `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" fill="#c3cad3"/>` +
      `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" fill="url(#${u}-pk)" opacity=".35"/>` +
      `<path d="M${f(x + 3)} ${f(y + 1)}V${f(y + h - 1)}M${f(x + w - 3)} ${f(y + 1)}V${f(y + h - 1)}" stroke="${ink}" stroke-opacity=".5" stroke-width=".6" stroke-dasharray="1.2 .9"/>` +
      `<g class="c06-fine">${txt}</g>` +
      `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" fill="url(#${u}-lblsh)"/>` +
      `</g>` +
      `<defs><linearGradient id="${u}-lblsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".35" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>`
    );
  }

  /* ---------- the closure tab ---------- */
  function statsOnTab(p, o, F, limit = Infinity) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    let s = "";
    const numFont = `800 14px "Manrope"`;
    MC.STATS.forEach((k, i) => {
      const yb = 22.5 + i * 22;
      const xr = Math.min(F.xe(yb - 5) - 6.5, limit);
      const v = String(p.stats[k]);
      const nw = measure(v, numFont);
      const num = (x, anchor) =>
        `<text x="${f(x)}" y="${yb}" text-anchor="${anchor}" font-family="Manrope, sans-serif" font-weight="800" font-size="14" fill="${K.cream}" direction="ltr" style="font-variant-numeric:tabular-nums">${MC.esc(v)}</text>`;
      if (ar) {
        const avail = xr - (23 + nw + 5);
        const lw = measure(S.stats[k], `700 9.5px "Noto Sans Arabic"`);
        const sz = clamp((9.5 * avail) / Math.max(1, lw), 6.4, 9.5);
        s += num(23, "start");
        s += `<text x="${f(xr)}" y="${f(yb - 0.6)}" text-anchor="end" font-family="'Noto Sans Arabic', sans-serif" font-weight="700" font-size="${f(sz)}" fill="${K.thread2}">${MC.esc(S.stats[k])}</text>`;
      } else {
        s += `<text x="23" y="${f(yb - 0.4)}" font-family="Manrope, sans-serif" font-weight="800" font-size="8.4" letter-spacing=".8" fill="${K.thread2}">${MC.esc(S.stats[k])}</text>`;
        s += num(xr, "end");
      }
    });
    return s;
  }

  function tabGroup(p, o, u, T, thumb, club) {
    const founder = !!p.founder;
    const strap = T.ring;
    const F = tabFrame(B, founder, strap ? 12 : 0);
    const R = strap ? ringGeo(B, F, 12, 8) : null;
    const fill = strap ? mix(bodyTone(club, T), "#000", 0.22) : K.velcro;
    const edge = mix(fill, "#000", 0.4);
    const Ht = F.Ht;
    let s = `<g class="c06-tab" transform="translate(${f(F.x)} ${f(F.y)}) skewY(${f(F.k)})">`;
    // its shadow on the band
    s += thumb
      ? `<path d="${F.poly}" transform="translate(-2.5 2)" fill="#000" opacity=".25"/>`
      : `<path d="${F.poly}" transform="translate(-4 3)" fill="#000" opacity=".5" filter="url(#${u}-soft)"/>`;
    // underside with the founder label (shown when the tab is opened in mount)
    if (founder && !thumb) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const lw = F.xb - 26;
      s +=
        `<g class="c06-tab-in" aria-hidden="true"><path d="${F.poly}" fill="#2a3038"/>` +
        `<rect x="22" y="${f(Ht / 2 - 18)}" width="${f(lw)}" height="36" fill="${K.cream}"/>` +
        `<text x="${f(22 + lw / 2)}" y="${f(Ht / 2 - 3)}" text-anchor="middle" font-family="${ar ? "'Noto Sans Arabic', Changa" : "Changa"}, sans-serif" font-weight="800" font-size="${ar ? 9 : 9.5}" fill="${mix(club.body, "#000", 0.35)}"${ar ? ' direction="rtl"' : ""}>${MC.esc(S.founderLine)}</text>` +
        `<text x="${f(22 + lw / 2)}" y="${f(Ht / 2 + 11)}" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="8" fill="${mix(club.body, "#000", 0.35)}" direction="ltr">${MC.esc(p.id)}</text></g>`;
    }
    if (R) {
      s += `<path d="${R.d}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="5" transform="translate(-2.4 2)"${thumb ? "" : ` filter="url(#${u}-soft)"`}/>`;
      s += `<path d="${R.d}" fill="none" stroke="#1b2028" stroke-width="6.4"/>`;
      s += `<path d="${R.d}" fill="none" stroke="url(#${u}-steel)" stroke-width="4.6"/>`;
      s += `<path d="${R.d}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".8" transform="translate(-.8 -.8)"/>`;
    }
    s += `<g class="c06-tab-face">`;
    s += `<path d="${F.poly}" transform="translate(1.1 1.5)" fill="${mix(fill, "#000", 0.55)}"/>`;
    s += `<path d="${F.poly}" fill="${fill}"/>`;
    if (!thumb) {
      if (strap) {
        s += `<path d="${F.poly}" fill="url(#${u}-tw)"/>`;
        let rib = "";
        for (let y = 2.4; y < Ht; y += 3.4) rib += `M0 ${f(y)}H${f(F.xe(y))}`;
        s += `<path d="${rib}" stroke="#000" stroke-opacity=".22" stroke-width="1.1"/>`;
      } else {
        s += `<path d="${F.poly}" fill="#000" filter="url(#${u}-vel)" opacity=".38"/>`;
      }
    }
    s += `<path d="${F.poly}" fill="url(#${u}-tabl)"/>`;
    // bound edge
    s += `<path d="${F.poly}" fill="none" stroke="${edge}" stroke-width="1.8" stroke-linejoin="round"/>`;
    // reinforced tab: a stitched inset border
    if (T.reinforce && !thumb) {
      const i = 3.2;
      s += `<path d="M${i} ${i}H${f(F.xe(i) - i - 0.4)}L${f(F.xe(Ht - i) - i - 0.4)} ${f(Ht - i)}H${i}Z" fill="none" stroke="${K.cream}" stroke-opacity=".5" stroke-width=".75" stroke-dasharray="1.9 1.3"/>`;
    }
    // the stitching where the tab is sewn to the band
    s += founder
      ? `<g fill="none" stroke="${K.cream}" stroke-width="${thumb ? 1.6 : 1.15}" stroke-dasharray="${thumb ? "none" : "2.1 1.3"}" stroke-linecap="round"><path d="M5 7H18V${f(Ht - 7)}H5Z"/><path d="M5 7L18 ${f(Ht - 7)}M18 7L5 ${f(Ht - 7)}"/></g>`
      : `<path d="M11.5 7V${f(Ht - 7)}" fill="none" stroke="${K.cream}" stroke-opacity=".8" stroke-width="1.1" stroke-dasharray="2.1 1.3"/>`;
    if (!thumb) s += statsOnTab(p, o, F, R ? R.x0 - 5 : Infinity);
    s += `</g>`;
    if (R) {
      // the near bar crosses over the strap: it reads as threaded, not as a handle
      s += `<path d="${R.bar}" stroke="#000" stroke-opacity=".5" stroke-width="3" transform="translate(2 1.6)"${thumb ? "" : ` filter="url(#${u}-soft)"`}/>`;
      s += `<path d="${R.bar}" stroke="#1b2028" stroke-width="6.4" stroke-linecap="round"/>`;
      s += `<path d="${R.bar}" stroke="url(#${u}-steel)" stroke-width="4.6" stroke-linecap="round"/>`;
      s += `<path d="${R.bar}" stroke="#fff" stroke-opacity=".8" stroke-width=".8" transform="translate(-.9 0)"/>`;
      s += `<path d="${F.poly}" class="c06-rim" fill="none" stroke="${K.rim}" stroke-width=".7" stroke-opacity=".6"/>`;
    }
    s += `</g>`;
    return s;
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const thumb = !!o.thumb;
    const T = tierOf(p);
    const club = clubOf(p);
    const u = MC.uid(ID);
    const g = B;
    remember(u, { p, o });
    let s = defsFull(u, T, thumb, club);
    // ground shadow
    if (!thumb) s += `<ellipse class="c06-gshadow" cx="${g.cx + 10}" cy="${g.top + g.H + g.ry + 4}" rx="${g.R + 8}" ry="8" fill="url(#${u}-gs)"/>`;
    // top rim and the opening into the loop
    s += `<ellipse cx="${g.cx}" cy="${g.top}" rx="${g.R}" ry="${g.ry}" fill="url(#${u}-rimt)"/>`;
    s += `<ellipse cx="${g.cx}" cy="${g.top}" rx="${g.irx}" ry="${g.iry}" fill="url(#${u}-insd)"/>`;
    s += `<g clip-path="url(#${u}-in)">`;
    if (T.ovr === "print") s += `<path d="${backBand(g, 3.5, 6.5)}" fill="#0a3cae"/>`;
    else s += `<path d="${backBand(g, 0, 5.5)}" fill="#0a3cae"/>`;
    for (let i = 0; i < T.stripes; i++) s += `<path d="${backBand(g, 11.5 + i * 4, 13.2 + i * 4)}" fill="#8e98a6" opacity=".55"/>`;
    if (!thumb) {
      let bl = "";
      for (let h = 0.6; h < 22; h += T.weave === "boucle" ? 3.4 : 1.6) bl += `M${f(g.cx - g.irx)} ${f(g.top + h)}A${g.irx} ${g.iry} 0 0 1 ${f(g.cx + g.irx)} ${f(g.top + h)}`;
      s += `<path d="${bl}" fill="none" stroke="#000" stroke-opacity=".14" stroke-width=".45"/>`;
    }
    s += `</g>`;
    if (!thumb) s += insideLabel(p, o, u, club);
    s += `<ellipse cx="${g.cx}" cy="${g.top + 1.4}" rx="${g.irx}" ry="${g.iry}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="2.4" clip-path="url(#${u}-in)"/>`;
    // the band body
    const body = bodyTone(club, T);
    s += `<path d="${bodyPath(g, 0.7)}" fill="${body}"/>`;
    // selvedges and tier stripes (they curve with the band). Woven tiers bind the top edge in Logo Blue;
    // printed elastic keeps a plain edge with a printed blue line.
    s += T.ovr === "print" ? `<path d="${arcBand(g, 3.5, 6.5)}" fill="${K.blue}"/>` : `<path d="${arcBand(g, 0, 5.5)}" fill="${K.blue}"/>`;
    for (let i = 0; i < T.stripes; i++) s += `<path d="${arcBand(g, 11.5 + i * 4, 13.2 + i * 4)}" fill="${T.ovr === "print" ? K.cream : `url(#${u}-pk)`}"/>`;
    s += T.ovr === "print"
      ? `<path d="${arcBand(g, g.H - 7, g.H - 4)}" fill="${club.sec}"/>`
      : `<path d="${arcBand(g, g.H - 4.5, g.H)}" fill="${club.sec}"/>`;
    // the running stitch that holds the binding (woven tiers)
    if (!thumb && T.ovr !== "print") {
      s += `<path d="${arcLine(g, 7.4)}" fill="none" stroke="${K.cream}" stroke-opacity=".35" stroke-width=".6" stroke-dasharray="2 1.6"/>`;
      s += `<path d="${arcLine(g, g.H - 6.6)}" fill="none" stroke="${K.cream}" stroke-opacity=".3" stroke-width=".6" stroke-dasharray="2 1.6"/>`;
    }
    s += weaveLayer(u, T, thumb);
    // the woven surface (re-projected in mount when the band is turned)
    s += `<g class="c06-surf" clip-path="url(#${u}-body)">${surfaceItems(p, o, u, 0)}</g>`;
    // cylinder light
    s += `<g clip-path="url(#${u}-body)" pointer-events="none">`;
    s += `<rect x="${g.x0}" y="${g.top - g.ry}" width="${g.x1 - g.x0}" height="${g.H + 2 * g.ry}" fill="url(#${u}-cyl)"/>`;
    s += `<rect x="${g.x0}" y="${g.top - g.ry}" width="${g.x1 - g.x0}" height="${g.H + 2 * g.ry}" fill="url(#${u}-ao)"/>`;
    s += `<rect class="c06-spec" x="40" y="${g.top - g.ry}" width="130" height="${g.H + 2 * g.ry}" fill="url(#${u}-spec)"/>`;
    s += `</g>`;
    // top lip highlight
    s += `<path d="${arcLine(g, 0.4)}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".8"/>`;
    // CHAMPION / LEGEND: contrast piping on both edges
    if (T.piping) {
      s += `<ellipse cx="${g.cx}" cy="${g.top}" rx="${g.R}" ry="${g.ry}" fill="none" stroke="${mix(club.sec, "#000", 0.22)}" stroke-width="3.4"/>`;
      s += `<ellipse cx="${g.cx}" cy="${g.top - 0.7}" rx="${g.R}" ry="${g.ry}" fill="none" stroke="${club.sec}" stroke-width="1.4"/>`;
      s += `<path d="${arcLine(g, g.H)}" fill="none" stroke="${mix(club.sec, "#000", 0.3)}" stroke-width="3.4"/>`;
      s += `<path d="${arcLine(g, g.H - 0.7)}" fill="none" stroke="${mix(club.sec, "#000", 0.05)}" stroke-width="1.2"/>`;
    }
    s += tabGroup(p, o, u, T, thumb, club);
    // dark-ground rim: a lit edge so the band keeps its outline on the night ground
    s +=
      `<g class="c06-rim" fill="none" stroke="${K.rim}" stroke-linecap="round" pointer-events="none">` +
      `<ellipse cx="${g.cx}" cy="${g.top}" rx="${g.R}" ry="${g.ry}" stroke-width="1"/>` +
      `<path d="M${g.x0} ${g.top}V${g.top + g.H}" stroke-width="1.1" stroke-opacity=".8"/>` +
      `<path d="M${g.x1} ${g.top}V${g.top + g.H}" stroke-width="1.2"/>` +
      `<path d="${arcLine(g, g.H)}" stroke-width=".9" stroke-opacity=".45"/></g>`;
    const svg = `<svg class="c06-svg" viewBox="0 0 ${g.W} ${g.VH}" width="100%" direction="ltr" style="direction:ltr" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
    return `<div class="c06 c06-full${o.motion ? " is-motion" : ""}${thumb ? " is-thumb" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(MC.label(p, o))}" data-tier="${p.tier}" data-k="${u}">${svg}</div>`;
  }

  /* ---------- token (44–80px) and mini (24–32px): flat fills, no filters ---------- */
  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const G = mini ? GM : GT;
    const T = tierOf(p);
    const club = clubOf(p);
    const u = MC.uid("c06t");
    const founder = !!p.founder;
    const w = f((size * G.W) / G.VH);
    const lit = mix(club.body, "#fff", 0.34);
    let s =
      `<defs><linearGradient id="${u}-c" gradientUnits="userSpaceOnUse" x1="${G.x0}" y1="0" x2="${G.x1}" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".12" stop-color="#000" stop-opacity=".1"/>` +
      `<stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset=".45" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset=".85" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient></defs>`;
    const printed = T.ovr === "print";
    s += `<ellipse cx="${G.cx}" cy="${G.top}" rx="${G.R}" ry="${G.ry}" fill="${printed ? lit : "#3a78ff"}"/>`;
    s += `<ellipse cx="${G.cx}" cy="${G.top}" rx="${G.irx}" ry="${G.iry}" fill="${mix(club.body, "#000", mini ? 0.62 : 0.5)}"/>`;
    if (!printed && !mini) s += `<path d="${backBand(G, 0, 1.3)}" fill="#0a3cae" clip-path="url(#${u}-in)"/><clipPath id="${u}-in"><ellipse cx="${G.cx}" cy="${G.top}" rx="${G.irx}" ry="${G.iry}"/></clipPath>`;
    s += `<path d="${bodyPath(G, mini ? 0.2 : 0.3)}" fill="${bodyTone(club, T)}"/>`;
    const st = mini ? { b0: 0, b1: 1.1, s0: 2.0, sp: 1.9, sw: 1.05 } : { b0: 0, b1: 2.3, s0: 4.2, sp: 2.4, sw: 1.4 };
    s += printed ? `<path d="${arcBand(G, st.b0 + (mini ? 0.3 : 0.9), st.b1 + (mini ? 0.1 : 0.2))}" fill="${K.blue}"/>` : `<path d="${arcBand(G, st.b0, st.b1)}" fill="${K.blue}"/>`;
    for (let i = 0; i < T.stripes; i++) s += `<path d="${arcBand(G, st.s0 + i * st.sp, st.s0 + i * st.sp + st.sw)}" fill="${K.cream}"/>`;
    if (!mini) s += `<path d="${arcBand(G, G.H - 2.6, G.H - 1.2)}" fill="${club.sec}"/>`;
    // the 84
    const Z = mini ? 13.4 : 20.5;
    const hb = mini ? 16.4 : 27.2;
    const th = G.s0 / G.R;
    const c = Math.cos(th);
    const x = G.cx + G.R * Math.sin(th);
    const y = G.top + G.ry * c + hb;
    const t = `text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="${Z}" direction="ltr"`;
    const legend = T.ring;
    s += `<g transform="translate(${f(x)} ${f(y)}) scale(${f(c)} 1)">`;
    if (legend) s += `<text ${t} x="${mini ? 0.55 : 0.8}" y="${mini ? 0.6 : 0.9}" fill="#05080d" opacity=".6">${MC.esc(p.ovr)}</text>`;
    s += `<text ${t} fill="${legend ? "#ffffff" : K.cream}">${MC.esc(p.ovr)}</text></g>`;
    s += `<path d="${bodyPath(G)}" fill="url(#${u}-c)"/>`;
    if (T.piping && !mini) {
      s += `<ellipse cx="${G.cx}" cy="${G.top}" rx="${G.R}" ry="${G.ry}" fill="none" stroke="${club.sec}" stroke-width="1"/>`;
      s += `<path d="${arcLine(G, G.H)}" fill="none" stroke="${club.sec}" stroke-width="1"/>`;
    }
    // the tab
    const F = tabFrame(G, founder, legend ? (mini ? 2.4 : 3.6) : 0);
    const R = legend ? ringGeo(G, F, mini ? 2.6 : 3.6, mini ? 1.7 : 2.6) : null;
    const tf = legend ? mix(bodyTone(club, T), "#000", 0.25) : mini ? "#737b86" : "#5d6570";
    s += `<g transform="translate(${f(F.x)} ${f(F.y)}) skewY(${f(F.k)})">`;
    if (R) {
      s += `<path d="${R.d}" fill="none" stroke="#1b2028" stroke-width="${mini ? 1.9 : 2.5}"/>`;
      s += `<path d="${R.d}" fill="none" stroke="#dfe4ea" stroke-width="${mini ? 1.1 : 1.5}"/>`;
    }
    s += `<path d="${F.poly}" transform="translate(${mini ? -0.8 : -1.4} ${mini ? 0.6 : 1})" fill="#000" opacity=".35"/>`;
    s += `<path d="${F.poly}" fill="${tf}" stroke="${mix(tf, "#000", 0.45)}" stroke-width="${mini ? 0.5 : 0.7}" stroke-linejoin="round"/>`;
    if (founder) {
      if (!mini && size >= 56) {
        s += `<g fill="none" stroke="${K.cream}" stroke-width=".7"><path d="M1.6 2.2H5.6V${f(F.Ht - 2.2)}H1.6Z"/><path d="M1.6 2.2L5.6 ${f(F.Ht - 2.2)}M5.6 2.2L1.6 ${f(F.Ht - 2.2)}"/></g>`;
      } else {
        const bw = mini ? 2.9 : 4;
        s += `<rect x="${mini ? 0.9 : 1.6}" y="${mini ? 1.3 : 2.2}" width="${bw}" height="${f(F.Ht - (mini ? 2.6 : 4.4))}" fill="none" stroke="${K.cream}" stroke-width="${mini ? 0.85 : 0.8}"/>`;
      }
    }
    if (R) {
      s += `<path d="${R.bar}" stroke="#1b2028" stroke-width="${mini ? 1.9 : 2.5}"/>`;
      s += `<path d="${R.bar}" stroke="#eef2f6" stroke-width="${mini ? 1.1 : 1.5}"/>`;
      s += `<path d="${F.poly}" class="c06-rim" fill="none" stroke="${K.rim}" stroke-width="${mini ? 0.5 : 0.6}" stroke-opacity=".7"/>`;
    }
    s += `</g>`;
    s += `<path d="${outlinePath(G)}" class="c06-rim" fill="none" stroke="${K.rim}" stroke-width="${mini ? 0.6 : 0.75}"/>`;
    const S = MC.s(o);
    return (
      `<span class="c06 c06-tok${mini ? " is-mini" : ""}" role="img" aria-label="${MC.esc(`${p.ovr} OVR, ${S.tiers[p.tier]}${p.founder ? ", " + S.founderLine : ""}`)}" style="width:${w}px;height:${size}px">` +
      `<svg viewBox="0 0 ${G.W} ${G.VH}" width="${w}" height="${size}" direction="ltr" style="direction:ltr" aria-hidden="true" focusable="false">${s}</svg></span>`
    );
  }

  /* ---------- row ("My position" compact card) ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const me = !!o.me;
    const nm = MC.nameOf(p, o);
    const fy = p.founder ? `<span class="c06-r-fy">·${MC.ltr(String(p.founder).slice(-2))}</span>` : "";
    return (
      `<div class="c06 c06-row${me ? " is-me" : ""}" dir="${S.dir}" data-tier="${p.tier}">` +
      (me ? `<i class="c06-r-sel" aria-hidden="true"></i>` : "") +
      `<span class="c06-r-rank">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c06-r-tok">${token(p, { ...o, size: 44, mini: false })}</span>` +
      `<span class="c06-r-id"><b class="c06-r-name"><bdi>${MC.esc(nm)}</bdi>${fy}</b><span class="c06-r-tier">${MC.esc(S.tiers[p.tier])}</span></span>` +
      `<span class="c06-r-pts"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${MC.esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- share (360x640): the band under one floodlight, worn on the arm below ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid("c06s");
    const club = clubOf(p);
    const A = MC.AVATAR;
    const X0 = 146; // the figure: bottom-end, cropped at the chest so the shoulders read
    const FS = 1.0;
    const FY = 640 - 240 * FS + 8;
    const yy = p.founder ? String(p.founder).slice(-2) : "";
    let sc = "<defs>";
    sc += `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03060d"/><stop offset=".5" stop-color="#081224"/><stop offset=".74" stop-color="#0b1a30"/><stop offset="1" stop-color="#060c18"/></linearGradient>`;
    sc += `<radialGradient id="${u}-lamp" gradientUnits="userSpaceOnUse" cx="304" cy="46" r="300"><stop offset="0" stop-color="#eef4ff" stop-opacity=".62"/><stop offset=".08" stop-color="#c7d8ff" stop-opacity=".3"/><stop offset=".35" stop-color="#3f63b0" stop-opacity=".12"/><stop offset="1" stop-color="#0a1428" stop-opacity="0"/></radialGradient>`;
    sc += `<linearGradient id="${u}-beam" gradientUnits="userSpaceOnUse" x1="304" y1="46" x2="150" y2="640"><stop offset="0" stop-color="#dfe9ff" stop-opacity=".22"/><stop offset=".6" stop-color="#9fb8ef" stop-opacity=".06"/><stop offset="1" stop-color="#9fb8ef" stop-opacity="0"/></linearGradient>`;
    sc += `<linearGradient id="${u}-turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2140"/><stop offset="1" stop-color="#07101f"/></linearGradient>`;
    sc += `<filter id="${u}-haze" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="3" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 .75  0 0 0 0 .82  0 0 0 0 1  1.1 0 0 0 -.35"/></filter>`;
    sc += `<filter id="${u}-gr" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -.62"/></filter>`;
    sc += `<filter id="${u}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>`;
    sc += `<clipPath id="${u}-torso"><path d="${A.torso}"/></clipPath>`;
    sc += `<linearGradient id="${u}-jk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0c121d"/><stop offset=".7" stop-color="#162134"/><stop offset="1" stop-color="#22324d"/></linearGradient>`;
    sc += "</defs>";
    let w = `<rect width="360" height="640" fill="url(#${u}-sky)"/>`;
    w += `<rect width="360" height="640" fill="url(#${u}-lamp)"/>`;
    // pitch: mowing stripes receding to the far touchline
    w += `<path d="M0 508H360V640H0Z" fill="url(#${u}-turf)"/>`;
    const bands = [508, 514, 522, 532, 545, 562, 584, 610, 640];
    for (let i = 0; i < bands.length - 1; i += 2) w += `<path d="M0 ${bands[i]}H360V${bands[i + 1]}H0Z" fill="hsl(214 90% 55% / .12)"/>`;
    w += `<path d="M0 508H360" stroke="#dfe8f5" stroke-opacity=".42" stroke-width="1.2"/>`;
    w += `<path d="M168 508L96 640" stroke="#dfe8f5" stroke-opacity=".3" stroke-width="1.6"/>`;
    w += `<ellipse cx="156" cy="546" rx="84" ry="16" fill="none" stroke="#dfe8f5" stroke-opacity=".22" stroke-width="1.3"/>`;
    // beam and floodlight head
    w += `<path d="M304 46L40 640H360V250Z" fill="url(#${u}-beam)"/>`;
    w += `<rect width="360" height="640" filter="url(#${u}-haze)" opacity=".12"/>`;
    w += `<path d="M318 64L340 0" stroke="#1c2536" stroke-width="5"/>`;
    w += `<g transform="translate(304 46) rotate(-16)"><rect x="-27" y="-14" width="54" height="28" rx="3" fill="#141c2b" stroke="#2b3850"/>`;
    let lamps = "";
    for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) lamps += `<circle cx="${-18 + q * 12}" cy="${-6 + r * 12}" r="4.2"/>`;
    w += `<g fill="#cfe0ff" filter="url(#${u}-glow)" opacity=".9">${lamps}</g><g fill="#ffffff">${lamps}</g></g>`;
    // the figure from behind, rim-lit by the floodlight, the band on its upper arm
    w += MC.avatar({ x: X0 + 3, y: FY - 0.8, w: 200 * FS, h: 240 * FS, torso: "#bcd2ff", seam: false, hoodFill: "#bcd2ff" });
    w += `<svg x="${X0}" y="${FY}" width="${200 * FS}" height="${240 * FS}" viewBox="${A.viewBox}" overflow="visible">`;
    w += `<path d="${A.torso}" fill="url(#${u}-jk)"/><path d="${A.hood}" fill="url(#${u}-jk)"/>`;
    w += `<path d="${A.seam}" stroke="#2a3a57" stroke-width="2" fill="none"/><path d="${A.hoodSeam}" stroke="#2a3a57" stroke-width="2" fill="none"/><path d="${A.hoodRim}" stroke="#2a3a57" stroke-width="2" fill="none"/>`;
    w += `<g clip-path="url(#${u}-torso)">`;
    w += `<path d="M150 192C154 208 156 224 157 240" stroke="#05080e" stroke-width="1.8" fill="none" opacity=".85"/><path d="M152 192C156 208 158 224 159 240" stroke="#2c3d5c" stroke-width=".8" fill="none"/>`;
    w += `<path d="M155 203Q175 210 195 206L196.5 225Q175 230 155 222.5Z" fill="${club.body}"/>`;
    w += `<path d="M155 203Q175 210 195 206L195.2 209.4Q175 213.6 155.2 206.6Z" fill="${K.blue}"/>`;
    w += `<path d="M155.6 211.6Q175 218.4 195.4 214.4" stroke="${K.cream}" stroke-width="1.1" fill="none"/><path d="M155.8 214.8Q175 221.6 195.6 217.6" stroke="${K.cream}" stroke-width="1.1" fill="none"/>`;
    w += `<path d="M155 203Q175 210 195 206L196.5 225Q175 230 155 222.5Z" fill="url(#${u}-jk)" opacity=".3"/>`;
    w += `<path d="M176 209.6Q187 209.2 195 206L196.5 225" stroke="#e4ecff" stroke-width="1.3" fill="none" opacity=".9"/>`;
    w += `</g></svg>`;
    // grain over everything
    w += `<rect width="360" height="640" filter="url(#${u}-gr)" opacity=".06"/>`;
    const scene = `<svg class="c06-sh-scene" viewBox="0 0 360 640" aria-hidden="true" focusable="false">${sc}<g${ar ? ' transform="translate(360 0) scale(-1 1)"' : ""}>${w}</g></svg>`;
    return (
      `<div class="c06 c06-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(MC.label(p, o))}">` +
      scene +
      `<div class="c06-sh-top"><span class="c06-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</span></div>` +
      `<span class="c06-sh-ex">${ar ? "مثال" : "Exemple"}</span>` +
      `<div class="c06-sh-band" aria-hidden="true">${full(p, { ...o, motion: false, thumb: false })}</div>` +
      `<div class="c06-sh-id"><b class="c06-sh-name"><bdi>${MC.esc(MC.nameOf(p, o))}</bdi>${yy ? `<span class="c06-sh-fy">·${MC.ltr(yy)}</span>` : ""}</b>` +
      `<span class="c06-sh-tier">${MC.esc(S.tiers[p.tier])}</span>` +
      `<span class="c06-sh-handle">${MC.ltr("@" + p.key)}</span>` +
      `<span class="c06-sh-meta">${MC.ltr(p.id)}<br>${MC.ltr(p.season)} · ${MC.esc(S.country)}</span></div>` +
      `</div>`
    );
  }

  /* ---------- mount: turn the band (drag or arrow keys), tap the tab to open it ---------- */
  function mount(el) {
    if (!el || !el.classList || !el.classList.contains("c06")) return;
    try {
      if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch (e) {
      /* no matchMedia: carry on */
    }
    const k = el.getAttribute("data-k");
    const st = REG.get(k);
    const surf = el.querySelector(".c06-surf");
    const svg = el.querySelector("svg.c06-svg");
    if (!st || !surf || !svg) return;
    const Q = Math.PI / 2;
    const friction = st.p.tier === "LEGEND" ? 0.965 : 0.9; // LEGEND turns with more inertia
    let phi = 0;
    let vel = 0;
    let drag = false;
    let lx = 0;
    let raf = 0;
    const unit = () => svg.getBoundingClientRect().width / B.W;
    const draw = () => {
      surf.innerHTML = surfaceItems(st.p, st.o, k, phi);
    };
    const tick = () => {
      try {
        if (navigator.vibrate) navigator.vibrate(8);
      } catch (e) {
        /* no haptics on this device */
      }
    };
    const snapTo = (target) => {
      cancelAnimationFrame(raf);
      const go = () => {
        const d = target - phi;
        if (Math.abs(d) < 0.003) {
          phi = target;
          draw();
          tick();
          return;
        }
        phi += d * 0.2;
        draw();
        raf = requestAnimationFrame(go);
      };
      go();
    };
    const glide = () => {
      cancelAnimationFrame(raf);
      const step = () => {
        if (Math.abs(vel) > 0.004) {
          phi += vel;
          vel *= friction;
          draw();
          raf = requestAnimationFrame(step);
        } else snapTo(Math.round(phi / Q) * Q);
      };
      step();
    };
    el.style.touchAction = "pan-y";
    el.style.cursor = "grab";
    if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest && e.target.closest(".c06-tab")) return;
      drag = true;
      lx = e.clientX;
      vel = 0;
      cancelAnimationFrame(raf);
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is optional */
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - lx;
      lx = e.clientX;
      const d = dx / Math.max(0.1, unit()) / B.R;
      phi += d;
      vel = d;
      draw();
    });
    const up = () => {
      if (!drag) return;
      drag = false;
      vel = clamp(vel, -0.14, 0.14);
      glide();
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      snapTo((Math.round(phi / Q) + dir) * Q);
    });
    const tab = el.querySelector(".c06-tab");
    if (tab && st.p.founder) {
      tab.style.cursor = "pointer";
      tab.addEventListener("click", () => el.classList.toggle("is-open"));
    }
  }

  /* ---------- registration ---------- */
  const c = {
    id: "c06",
    n: 6,
    slug: "06r",
    name: "Brassard",
    nameAr: "الشارة",
    category: "bold",
    philosophy:
      "The captain's armband, reissued for managers: a woven band you turn on your arm to read, with your 84 where the C would be and your founder year stitched into the closure.",
    philosophyAr: "شارة القائد في نسخة للمدربين: شريط منسوج تديره حول ذراعك لتقرأه، تقييمك في مكان حرف القائد، وسنة التأسيس مخيطة في طرف الإغلاق.",
    idea: [
      "Every football culture agrees on one object that means 'this person leads': the armband. In the derb it is a cheap printed strip and who wears it is argued about loudly; in a stadium it is a woven or moulded band handed over with ceremony. BRASSARD keeps the object and changes the letter. There is no C. Where the C would be, the band carries your 84.",
      "The card is not a rectangle. It is a short band seen from a few degrees above: the elliptical opening reads as a loop around an arm that is not drawn, and the closure tab sticks out of the band's end. Everything woven on it is projected onto a real cylinder, letter by letter, so the founder patch on the start side is visibly foreshortened and the 84 sits square on the front.",
      "The information is placed where an armband would hold it. The 84 is on the front face. The name and tier are woven above it. The four stats run down the closure tab in a tabular column, with the number column following the tab's slanted end. BOT #004821, the season and the country are on the woven care label sewn inside the band, read through the opening, which is where a real label lives. Turning the band (drag, or the arrow keys) shows the season face, the woven figure with the ID, and the word BotolaGO.",
      "The Logo Blue top selvedge is the only brand ink. The body is the club colour the user chose, the bottom selvedge its second colour, and the tab is honest loop fabric. The lab's placeholder club is a neutral slate, so the samples are quieter than a real Raja, Wydad or FUS band would be.",
    ],
    belonging: [
      "'Who has the armband?' is a question every group of friends has already argued about. This is the first answer you earn rather than get handed by the coach.",
      "Your band leads your row in every leaderboard. The stripe count under the top edge says your tier at 24px, so friends compare it in comments and head-to-heads without opening anything.",
      "Turning it is a gesture you show people. You hold the phone out, spin the band and stop it on the front: it is filmable in a way a flat card is not.",
      "Teenagers will want the LEGEND ring; older Fantasy players will respect the stripes and the founder cut, which cannot be bought, only kept.",
    ],
    founderMark: [
      "FOUNDER 2026 is built into the object in three places. The tab's free end is cut on the wordmark's 11.3 degree slant (later cohorts get a square cut), the tab is sewn on with a box-X stitch (later cohorts get a single line), and '26 is woven in a box on the band's start side, where an armband carries its C.",
      "The cut and the stitch never upgrade or disappear: the LEGEND strap keeps the same slant and the same box-X. At 24px the slanted tab end and the cream stitch box on it remain as the tell.",
      "Tapping the tab (live card) folds it open to the woven label underneath: FOUNDER 2026 and BOT #004821. The rows set it the supporter-group way, ALI ·26.",
    ],
    small: [
      "At 44–80px the token is the band itself in flat fills: elliptical opening, club-colour body, Logo Blue selvedge, tier stripes, the 84 in Changa 800, and the tab, slanted for founders, threaded through a steel ring for LEGEND. Club colour is the body and the bottom selvedge.",
      "At 24–32px the mini keeps four parts of the object: the opening arc, 0–3 cream stripes under the top edge (HOMA 0, STADE 1, PRO 2, CHAMPION and LEGEND 3), the 84 at 12–14px, and a tab on the lower end. The steel ring at LEGEND changes the outline; founders keep a slanted tab with a cream stitch box.",
      "No filters, turbulence or text measuring run in the token or the row: they are drawn 50 times in a list.",
    ],
    rtl: [
      "The band never mirrors: it is an object, and the tab staying on the right puts it at the reading start in Arabic. The name, the tier word and the stats switch script, not position.",
      "علي is woven in Changa 800 with its own baseline, the tier word in Noto Sans Arabic with no tracking, and the stat labels on the tab are right-aligned against the slanted end with the figures kept LTR. Labels that are too long for the tab shrink to fit rather than truncate.",
      "Turning the band runs the other way in Arabic, so the next face comes in from the reading direction. The share image mirrors its scene, never the band.",
    ],
    tiers: {
      HOMA: "Imprimé: new printed elastic with fine longitudinal ribs, the 84 and name screen-printed flat in cream (the ribs show through the ink), no stripes, plain edges, a simple velcro tab. Full silhouette: it is clean and new, never worn.",
      STADE: "Tissé: a jacquard twill, one woven stripe, and an 84 woven flat so its pick lines are visible inside the figures.",
      PRO: "Double: a denser double weave, two stripes, and an 84 in raised satin stitch whose sheen sits on the cylinder's highlight and travels when the band turns.",
      CHAMPION: "Passepoil: contrast piping on both edges thickens the outline, three stripes, the 84 is a satin appliqué edged in running stitch over a dark under-layer, and the tab is reinforced with a stitched border.",
      LEGEND: "Boucle: the heaviest ribbed weave in a deeper tone, the 84 moulded in white silicone relief with a raking shadow, and the velcro tab replaced by a longer strap threaded through a machined steel ring at the band's end. The ring stands proud of the strap above and below. The strap keeps the founder slant, the box-X and the stats.",
    },
    legend: [
      "LEGEND is the armband the pros wear: a white silicone 84 moulded into a heavy ribbed band, with the strap threaded through a machined steel ring. The ring standing proud of the strap, above and below, is the one outline change, and it still shows as a bright bar at 24px.",
      "The ceremony is specified but not built in this lab: the band arrives as a flat strip with the 84 already visible, curls into a loop around an invisible arm, threads the steel ring and cinches with one heavy haptic, then turns once and settles front-on. It is a replay, never a gate. Reduced motion shows the closed band.",
    ],
    advantages: [
      "A silhouette type nobody else in either exploration has: a short band with an opening and a tab. It is not a rectangle, a ticket or a tombstone.",
      "CAP has a natural home: the stat about captain decisions is woven on the captain's armband.",
      "The stats are always on the front (on the tab); the turning faces add depth without hiding information.",
      "Material progression is physical and legible: print, weave, satin, appliqué and piping, silicone and steel.",
      "It has the strongest motion share of the slate: a three-second spin ending on the front.",
    ],
    risks: [
      "Captain collision: the app already marks the Fantasy captain with a navy C and an amber ring. The band must never carry C or ق, never use amber and never appear on the pitch view, or users will read it as 'my captain'.",
      "At 24px it can read as a wristband, a battery or a fitness tracker; the opening arc and the low tab are doing a lot of work. It is also wider than tall, so it takes about 50px of a row's name cell at 28px.",
      "The placeholder slate club makes every tier look quieter than it would for a real club, and a club with a cream or white kit will need the dark rim on the light ground too.",
      "Fine print lives on the inside label (about 6px at a 360px card). It is legible on a phone at full size but disappears in the tier strip, by design.",
      "The cylinder projection is per glyph and runs in JavaScript; cheap at rest, but rows use a flattened token and the spin re-projects on every frame.",
      "iOS has no web haptics; the woven-tiraz reference for Arabic lettering needs a Moroccan typographer's review before it is used in any copy.",
    ],
    gridWidth: 300,
    detailWidth: 460,
    full,
    token,
    row,
    share,
    mount,
  };
  MC.register(c);
})();
