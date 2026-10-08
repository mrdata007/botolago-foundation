/* 06 BRASSARD (bold). The captain's armband, reissued for managers.
   A short woven band seen from about 27 degrees above, so the line of sight passes through
   both openings: the loop is a real hole (the ground shows through it), the inside of the
   back wall carries the tier stripes and the woven care label, and the closure strap lies
   on the band and leaves it at the end. The 84 sits where an armband carries its "C"; the
   stats are woven down the strap; the founder year follows the name (ALI ·26) and the
   strap's free end is cut on the wordmark's 11.3 degree slant. Everything on the band is
   projected onto a real cylinder (per-glyph cos(theta) compression and ellipse-following
   baselines), so it can be turned in mount(). */
(function () {
  const MC = window.MC;
  const ID = "c06";

  /* Faces used in measured layout: request them now so fonts.ready waits for them. */
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('800 100px "Changa"', "ALI ·26 0123456789 BotolaGO");
      document.fonts.load('800 100px "Changa"', "علي ياسمين عثمان سلمى حمزة");
      document.fonts.load('800 100px "Manrope"', "CAP SEL TRF CON PRO STADE HOMA CHAMPION LEGEND 0123456789 #·/");
      document.fonts.load('700 100px "Noto Sans Arabic"', "القائد التشكيلة الانتقالات الثبات عضو مؤسس المغرب محترف أسطورة");
    }
  } catch (e) {
    /* measuring falls back to estimates */
  }

  /* ---------- small helpers ---------- */
  const f = (n) => Math.round(n * 100) / 100;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEG = 180 / Math.PI;
  const RAD = Math.PI / 180;
  const CUT = Math.tan(11.3 * RAD); // the wordmark's italic, used for the founder cut
  const TAU = Math.PI * 2;
  const wrapPhi = (a) => a - TAU * Math.round(a / TAU);
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

  /* Text metrics (canvas) at 100px, cached only once the face is really loaded. */
  let cv = null;
  const mcache = new Map();
  function metrics(txt, font) {
    const key = font + "|" + txt;
    if (mcache.has(key)) return mcache.get(key);
    let r;
    try {
      cv = cv || document.createElement("canvas").getContext("2d");
      cv.font = font;
      const m = cv.measureText(txt);
      r = { w: m.width, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent, l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight };
      if (document.fonts && document.fonts.check(font, txt)) mcache.set(key, r);
    } catch (e) {
      const n = [...String(txt)].length;
      r = { w: n * 60, a: 70, d: 25, l: 0, r: n * 60 };
    }
    return r;
  }
  const F_CH = '800 100px "Changa"';
  const F_MR = '800 100px "Manrope"';
  const F_AR = '700 100px "Noto Sans Arabic"';
  /** Width in units of a string set at size z (letter-spacing ls added between glyphs). */
  const wOf = (t, font, z, ls = 0) => (metrics(t, font).w * z) / 100 + ls * Math.max(0, [...String(t)].length - 1);

  /* ---------- palette ---------- */
  const K = {
    cream: "#EEF2F7", // weave cream
    thread2: "#c4ccd7", // second thread (labels, tier word)
    blue: "#0151FC", // Logo Blue: the binding, the one fixed brand ink
    blueIn: "#0a3cae", // the same binding seen on the inside, in shade
    velcro: "#5d6570", // loop fabric (cream on it: 5.4:1)
    rim: "#9BA3AE", // dark-ground lit edge (7.7:1 on the dark page)
    silicone: "#F4F6F8",
    graphite: "#2A2F36",
    steelDark: "#59616c",
    steelLight: "#eef2f6",
  };

  /* ---------- tiers: material, finish and light, not colour ---------- */
  const TIER = {
    HOMA: { n: 0, tone: 0.07, weave: "rib", ovr: "print", piping: false, ring: false, reinforce: false, light: 0.55, spec: 0.05 },
    STADE: { n: 1, tone: 0, weave: "twill", ovr: "woven", piping: false, ring: false, reinforce: false, light: 0.72, spec: 0.09 },
    PRO: { n: 2, tone: 0, weave: "double", ovr: "satin", piping: false, ring: false, reinforce: false, light: 0.88, spec: 0.15 },
    CHAMPION: { n: 3, tone: -0.05, weave: "double", ovr: "applique", piping: true, ring: false, reinforce: true, light: 1.02, spec: 0.19 },
    LEGEND: { n: 4, tone: -0.2, weave: "ottoman", ovr: "silicone", piping: false, ring: true, reinforce: true, light: 1.25, spec: 0.3 },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;
  const stripesOf = (T) => Math.min(3, T.n);
  const clubOf = (p) => ({
    body: (p.club && p.club.primary) || K.graphite,
    sec: (p.club && p.club.secondary) || K.cream,
  });
  /* The body colour in this tier's material: printed elastic is a touch chalkier, the heavy LEGEND weave deeper. */
  const bodyTone = (club, T) => (T.tone > 0 ? mix(club.body, "#ffffff", T.tone) : T.tone < 0 ? mix(club.body, "#000000", -T.tone) : club.body);

  /* ---------- band geometry (viewBox units) ----------
     R/ry: the cylinder and its rim ellipse (ry/R = sin of the view angle, about 27 degrees);
     ty: rim centre; H: projected wall height; t: wall thickness (inner radius R - t).
     With 2*ry > H the line of sight passes through both openings: that lens is left unpainted.
     thC: arc angle of the 84 and name; Z: the 84's size; tab: the closure strap
     (th0..th1 lies on the band, then it bends out to psi and stands `past` beyond the end). */
  function geo(o) {
    const g = Object.assign({}, o);
    g.sa = g.ry / g.R;
    g.ca = Math.sqrt(1 - g.sa * g.sa);
    g.x0 = g.cx - g.R;
    g.x1 = g.cx + g.R;
    g.Ri = g.R - g.t;
    g.ryi = g.Ri * g.sa;
    g.by = g.ty + g.H;
    return g;
  }
  const B = geo({
    W: 360, VH: 240, cx: 158, R: 140, ry: 64, ty: 70, H: 90, t: 3.5,
    bind: 6.5, selv: 5, stripe0: 9.5, stripeP: 4.4, stripeW: 2.2,
    thC: -10, Z: 70, ovrBase: 82, crestTh: -48, crestY: 60, crestH: 31,
    tab: { th0: 15, th1: 64, rb: 7, psi: 27, past: 26, dr: 2.5, hT: 0, Ht: 90, lab0: 20, num1: 67,
      ring: { past: 8, over: 14, stock: 8, depth: 30, fold: 18 } },
  });
  /* The story close-up: the same band, the 84 grown to fill the wall (the name moves to the credit line). */
  const SB = geo({ ...B, thC: -17, Z: 111, ovrBase: 81.5, crestTh: -66, tab: { ...B.tab, past: 12, ring: { ...B.tab.ring, past: 4 } } });
  /* Token (44-80px): 1u = 1px at 44px. The hole is 6.8u tall. */
  const GT = geo({
    W: 66, WL: 71, VH: 44, cx: 29.4, R: 27.4, ry: 12.5, ty: 13.5, H: 17, t: 1.3,
    bind: 2, selv: 1.6, stripe0: 3.1, stripeP: 3.1, stripeW: 2,
    thC: -14, Z: 16.5,
    tab: { th0: 20, th1: 62, rb: 2, psi: 27, past: 7, dr: 0.6, hT: 0, Ht: 17, ring: { past: 2.5, over: 4, stock: 2.6, depth: 9, fold: 6 } },
  });
  /* Mini (24-32px): 1u = 1px at 28px. The hole is 4u tall; stripes 1.6u with 1.2u gaps; the strap covers the full wall. */
  const GM = geo({
    W: 42, WL: 46, VH: 28, cx: 18.1, R: 17.5, ry: 8, ty: 8.6, H: 11.2, t: 0.9,
    bind: 1.1, selv: 0.9, stripe0: 1.9, stripeP: 2.8, stripeW: 1.6,
    thC: -14, Z: 11,
    tab: { th0: 24, th1: 60, rb: 1.4, psi: 27, past: 5, dr: 0.4, hT: 0, Ht: 11.2, runMini: 3.6, ring: { past: 2, over: 2.3, stock: 1.6, depth: 6.6, fold: 4 } },
  });
  const ovrBaseOf = (g) => (g.ovrBase != null ? g.ovrBase : g.H - g.selv - (g.H - g.selv - g.bind - 0.64 * g.Z) / 2);
  const ovrTopOf = (g) => ovrBaseOf(g) - 0.64 * g.Z;

  /* ---------- paths ---------- */
  /* Front wall (outer face): from the near arc of the top rim to the near arc of the bottom edge. */
  const fwPath = (g) =>
    `M${f(g.x0)} ${f(g.ty)}A${f(g.R)} ${f(g.ry)} 0 0 0 ${f(g.x1)} ${f(g.ty)}V${f(g.by)}A${f(g.R)} ${f(g.ry)} 0 0 1 ${f(g.x0)} ${f(g.by)}Z`;
  /* Inner face of the back wall: from the far arc of the inner rim to the far arc of the inner bottom edge. */
  const iwPath = (g) =>
    `M${f(g.cx - g.Ri)} ${f(g.ty)}A${f(g.Ri)} ${f(g.ryi)} 0 0 1 ${f(g.cx + g.Ri)} ${f(g.ty)}V${f(g.by)}A${f(g.Ri)} ${f(g.ryi)} 0 0 0 ${f(g.cx - g.Ri)} ${f(g.by)}Z`;
  const ell = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
  /* The top edge seen from above: the ring between the outer and the inner rim. */
  const rimPath = (g) => ell(g.cx, g.ty, g.R, g.ry) + ell(g.cx, g.ty, g.Ri, g.ryi);
  const outlinePath = (g) =>
    `M${f(g.x0)} ${f(g.ty)}A${f(g.R)} ${f(g.ry)} 0 0 1 ${f(g.x1)} ${f(g.ty)}V${f(g.by)}A${f(g.R)} ${f(g.ry)} 0 0 1 ${f(g.x0)} ${f(g.by)}Z`;
  const arcBand = (g, h0, h1) =>
    `M${f(g.x0)} ${f(g.ty + h0)}A${f(g.R)} ${f(g.ry)} 0 0 0 ${f(g.x1)} ${f(g.ty + h0)}L${f(g.x1)} ${f(g.ty + h1)}A${f(g.R)} ${f(g.ry)} 0 0 1 ${f(g.x0)} ${f(g.ty + h1)}Z`;
  const arcLine = (g, h) => `M${f(g.x0)} ${f(g.ty + h)}A${f(g.R)} ${f(g.ry)} 0 0 0 ${f(g.x1)} ${f(g.ty + h)}`;
  const arcLines = (g, step, h0, h1) => {
    let d = "";
    for (let h = h0; h < h1; h += step) d += arcLine(g, h);
    return d;
  };
  const backBand = (g, h0, h1) =>
    `M${f(g.cx - g.Ri)} ${f(g.ty + h0)}A${f(g.Ri)} ${f(g.ryi)} 0 0 1 ${f(g.cx + g.Ri)} ${f(g.ty + h0)}L${f(g.cx + g.Ri)} ${f(g.ty + h1)}A${f(g.Ri)} ${f(g.ryi)} 0 0 0 ${f(g.cx - g.Ri)} ${f(g.ty + h1)}Z`;
  const backLine = (g, h) => `M${f(g.cx - g.Ri)} ${f(g.ty + h)}A${f(g.Ri)} ${f(g.ryi)} 0 0 1 ${f(g.cx + g.Ri)} ${f(g.ty + h)}`;
  const backLines = (g, step, h0, h1) => {
    let d = "";
    for (let h = h0; h < h1; h += step) d += backLine(g, h);
    return d;
  };

  /* ---------- projection ---------- */
  /* A local frame on the surface whose tangent heads at angle p (p = theta on the cylinder):
     verticals stay vertical, horizontals follow the ellipse (skewY), widths shrink by cos p. */
  const frameT = (g, x, y, p) => `translate(${f(x)} ${f(y)}) skewY(${f(Math.atan(-g.sa * Math.tan(p)) * DEG)}) scale(${f(Math.cos(p))} 1)`;
  /* Places content on the outer face at arc position s, wall height h, turned by phi. */
  function place(g, s, h, phi, inner, cut = 0.16) {
    const th = s / g.R + phi;
    const c = Math.cos(th);
    if (c < cut) return "";
    const x = g.cx + g.R * Math.sin(th);
    const y = g.ty + g.ry * c + h;
    const a = clamp((c - cut) / 0.28, 0, 1);
    return `<g transform="${frameT(g, x, y, th)}"${a < 1 ? ` opacity="${f(a)}"` : ""}>${inner}</g>`;
  }
  /* Places content on the inside of the back wall (concave, read from inside), s = 0 at the back centre. */
  function placeIn(g, s, h, phi, inner, cut = 0.2) {
    const th = s / g.Ri - phi;
    const c = Math.cos(th);
    if (c < cut) return "";
    const x = g.cx + g.Ri * Math.sin(th);
    const y = g.ty - g.ryi * c + h;
    const a = clamp((c - cut) / 0.25, 0, 1);
    return `<g transform="translate(${f(x)} ${f(y)}) skewY(${f(Math.atan(g.sa * Math.tan(th)) * DEG)}) scale(${f(c)} 1)"${a < 1 ? ` opacity="${f(a)}"` : ""}>${inner}</g>`;
  }

  /* The closure strap as a real strip: it lies on the band (radius R + dr) from th0 to th1, bends
     outward (radius rb) to heading psi, then runs straight so its top end stands `past` beyond
     the band's end. Its cross-sections are vertical, so on screen the strip is its top edge
     plus a constant height Ht. The straight length is fixed at rest so the strap keeps its
     length while the band turns. */
  function stripBuild(g, sp, phi, past) {
    const Rt = g.R + sp.dr;
    const ds = Math.max(0.25, g.R / 60);
    const a0 = sp.th0 * RAD;
    const a1 = sp.th1 * RAD;
    const pe = sp.psi * RAD;
    const run = (ph) => {
      const pts = [];
      const nA = Math.max(3, Math.ceil(((a1 - a0) * Rt) / ds));
      for (let i = 0; i <= nA; i++) {
        const a = a0 + ph + ((a1 - a0) * i) / nA;
        pts.push({ X: Rt * Math.sin(a), Z: Rt * Math.cos(a), p: a, s: ((a1 - a0) * i * Rt) / nA });
      }
      let { X, Z, p, s } = pts[pts.length - 1];
      const pE = pe + ph;
      while (p - pE > 1e-6) {
        const dp = Math.min(ds / sp.rb, p - pE);
        const pm = p - dp / 2;
        const l = dp * sp.rb;
        X += Math.cos(pm) * l;
        Z -= Math.sin(pm) * l;
        p -= dp;
        s += l;
        pts.push({ X, Z, p, s });
      }
      return pts;
    };
    const pts = run(phi);
    const rest = phi ? run(0) : pts;
    const b0 = rest[rest.length - 1];
    const L = Math.max(1, (g.R + past - b0.X) / Math.cos(pe));
    const e = pts[pts.length - 1];
    pts.push({ X: e.X + Math.cos(e.p) * L, Z: e.Z - Math.sin(e.p) * L, p: e.p, s: e.s + L });
    const len = e.s + L;
    const at = (q, v = 0) => [g.cx + q.X, g.ty + q.Z * g.sa + sp.hT + v];
    const frame = (s) => {
      let i = 0;
      while (i < pts.length - 2 && pts[i + 1].s < s) i++;
      const A = pts[i];
      const Bq = pts[i + 1];
      const t = (s - A.s) / Math.max(1e-6, Bq.s - A.s);
      const q = { X: A.X + (Bq.X - A.X) * t, Z: A.Z + (Bq.Z - A.Z) * t, p: A.p + (Bq.p - A.p) * t };
      const [x, y] = at(q);
      return { x, y, p: q.p };
    };
    return { pts, len, frame, at, g, sp };
  }
  const onStrip = (S, s, v, inner) => {
    const fr = S.frame(s);
    return `<g transform="${frameT(S.g, fr.x, fr.y + v, fr.p)}">${inner}</g>`;
  };
  /* A horizontal band of the strip between heights v0 and v1, ending on the cut (endAt(v)). */
  function stripBandPoly(S, v0, v1, endAt, dy = 0) {
    const P = [];
    const push = (x, y) => P.push(`${f(x)} ${f(y + dy)}`);
    const e0 = endAt(v0);
    const e1 = endAt(v1);
    let fr = S.frame(0);
    push(fr.x, fr.y + v0);
    for (const q of S.pts) if (q.s > 0 && q.s < e0) push(...S.at(q, v0));
    fr = S.frame(e0);
    push(fr.x, fr.y + v0);
    fr = S.frame(e1);
    push(fr.x, fr.y + v1);
    for (let i = S.pts.length - 1; i >= 0; i--) {
      const q = S.pts[i];
      if (q.s > 0 && q.s < e1) push(...S.at(q, v1));
    }
    fr = S.frame(0);
    push(fr.x, fr.y + v1);
    return "M" + P.join("L") + "Z";
  }
  const cutEnd = (sTop, sBot, Ht) => (v) => sTop - ((sTop - sBot) * v) / Ht;
  const stripPoly = (S, sTop, sBot, Ht, dy = 0) => stripBandPoly(S, 0, Ht, cutEnd(sTop, sBot, Ht), dy);
  function stripLine(S, s0, s1, v) {
    const P = [];
    let fr = S.frame(s0);
    P.push(`${f(fr.x)} ${f(fr.y + v)}`);
    for (const q of S.pts) if (q.s > s0 && q.s < s1) P.push(S.at(q, v).map(f).join(" "));
    fr = S.frame(s1);
    P.push(`${f(fr.x)} ${f(fr.y + v)}`);
    return "M" + P.join("L");
  }
  const ptOn = (S, s, v) => {
    const fr = S.frame(s);
    return `${f(fr.x)} ${f(fr.y + v)}`;
  };

  /* Mount registry: what a rendered card needs to be re-projected while turning. */
  const REG = new Map();
  const remember = (k, v) => {
    REG.set(k, v);
    if (REG.size > 400) REG.delete(REG.keys().next().value);
  };

  /* ---------- the woven surface (everything that turns with the band) ---------- */
  const wovenFill = (T, u) => (T.ovr === "print" ? K.cream : `url(#${u}-pk)`);

  /* Name row: ALI ·26, the year in club-secondary thread at 60% on the same baseline (Rule 4). */
  function nameRow(p, o, u, g, phi, T, club) {
    const ar = MC.isAr(o);
    const nm = MC.nameOf(p, o);
    const yy = p.founder ? String(p.founder).slice(-2) : "";
    const yTxt = yy ? (ar ? `${yy}·` : `·${yy}`) : "";
    const mN = metrics(nm, F_CH);
    const mY = yy ? metrics(yTxt, F_CH) : { w: 0 };
    const top = g.bind + 3;
    const bot = ovrTopOf(g) - 4.2;
    const YS = 0.6;
    const GAP = 0.16;
    const maxW = 150;
    let n = ar ? 18.5 : 19;
    const wAt = (z) => ((mN.w + (yy ? GAP * 100 + mY.w * YS : 0)) * z) / 100;
    if (wAt(n) > maxW) n = Math.max(12, (n * maxW) / wAt(n));
    const vh = (mN.a + mN.d) / 100;
    if (vh * n > bot - top) n = (bot - top) / vh;
    let wn = (mN.w * n) / 100;
    let fit = "";
    if (wAt(n) > maxW + 0.5) {
      wn -= wAt(n) - maxW;
      fit = ` textLength="${f(wn)}" lengthAdjust="spacingAndGlyphs"`;
    }
    const wy = yy ? (mY.w * n * YS) / 100 : 0;
    const gap = yy ? GAP * n : 0;
    const tot = wn + gap + wy;
    const asc = (mN.a * n) / 100;
    const desc = (mN.d * n) / 100;
    const hb = top + (bot - top - asc - desc) / 2 + asc;
    const s0 = g.R * g.thC * RAD;
    const left = s0 - tot / 2;
    const nameS = ar ? left + wy + gap + wn / 2 : left + wn / 2;
    const yyS = ar ? left + wy / 2 : left + wn + gap + wy / 2;
    let s = place(
      g,
      nameS,
      hb,
      phi,
      `<text text-anchor="middle" font-family="Changa, 'Noto Sans Arabic', sans-serif" font-weight="800" font-size="${f(n)}" fill="${wovenFill(T, u)}"${fit}>${MC.esc(nm)}</text>`,
    );
    if (yy)
      s += place(
        g,
        yyS,
        hb,
        phi,
        `<text text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="${f(n * YS)}" fill="${T.ovr === "print" ? club.sec : `url(#${u}-pks)`}" direction="ltr">${MC.esc(yTxt)}</text>`,
      );
    return s;
  }

  /* The 84: per glyph on the cylinder, in the tier's material, its ink box centred on thC. */
  function ovrGlyphs(p, o, u, g, phi, T, club, thumb) {
    const str = String(p.ovr);
    const Z = g.Z;
    const hb = ovrBaseOf(g);
    const ws = [...str].map((ch) => (metrics(ch, F_CH).w * Z) / 100);
    const all = metrics(str, F_CH);
    const inkC = (((all.r - all.l) / 2) * Z) / 100;
    const s0 = g.R * g.thC * RAD;
    let acc = s0 - inkC;
    let out = "";
    const base = `text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="${f(Z)}"`;
    const body = bodyTone(club, T);
    const specTh = -26 * RAD;
    ws.forEach((w, i) => {
      const sC = acc + w / 2;
      acc += w;
      const ch = MC.esc(str[i]);
      let inner;
      if (T.ovr === "print") {
        // screen print: flat ink, the elastic's ribs show through it
        inner = `<text ${base} fill="${K.cream}">${ch}</text>` + (thumb ? "" : `<text ${base} fill="url(#${u}-ink)">${ch}</text>`);
      } else if (T.ovr === "woven") {
        // woven flat into the band: its pick lines run through the figures
        inner = `<text ${base} fill="url(#${u}-pk)">${ch}</text><text ${base} fill="none" stroke="#0b0f14" stroke-opacity=".28" stroke-width=".6">${ch}</text>`;
      } else if (T.ovr === "satin") {
        // raised satin stitch: threads run across the strokes, one soft sheen on the cylinder's highlight
        const thG = sC / g.R + phi;
        const t = clamp(0.5 + ((specTh - thG) * g.R) / w, -0.4, 1.4);
        const st = (v) => f(clamp(v, 0, 1));
        inner =
          `<defs><linearGradient id="${u}-sh${i}" x1="0" y1="0" x2="1" y2=".3">` +
          `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${st(t - 0.3)}" stop-color="#fff" stop-opacity="0"/>` +
          `<stop offset="${st(t)}" stop-color="#fff" stop-opacity=".34"/><stop offset="${st(t + 0.3)}" stop-color="#fff" stop-opacity="0"/>` +
          `<stop offset="1" stop-color="#1a2230" stop-opacity=".14"/></linearGradient></defs>` +
          `<text ${base} x=".55" y=".75" fill="#05080d" opacity=".42">${ch}</text>` +
          `<text ${base} fill="url(#${u}-sat)">${ch}</text>` +
          (thumb ? "" : `<text ${base} fill="url(#${u}-sh${i})">${ch}</text>`);
      } else if (T.ovr === "applique") {
        // appliqué: a cut piece of club-secondary fabric with a zigzag satin edge
        inner =
          `<text ${base} x=".9" y="1.2" fill="#05080d" opacity=".38"${thumb ? "" : ` filter="url(#${u}-lift)"`}>${ch}</text>` +
          `<text ${base} fill="url(#${u}-app)">${ch}</text>` +
          (thumb ? "" : `<text ${base} fill="none" stroke="${mix(club.sec, "#000", 0.42)}" stroke-width="1.4" stroke-dasharray=".34 .26">${ch}</text>`);
      } else {
        // LEGEND: moulded white silicone, flat face, a fine chamfer and a hard raking shadow
        inner =
          `<text ${base} x="2.2" y="2.6" fill="${mix(body, "#000", 0.55)}"${thumb ? "" : ` filter="url(#${u}-sil)"`}>${ch}</text>` +
          `<text ${base} x=".8" y=".95" fill="#aab3be">${ch}</text>` +
          (thumb ? "" : `<text ${base} x="-.6" y="-.6" fill="#ffffff">${ch}</text>`) +
          `<text ${base} fill="${K.silicone}">${ch}</text>`;
      }
      out += place(g, sC, hb, phi, inner);
    });
    return out;
  }

  /* The club, woven as a colour patch with a satin border on the band's start side. */
  function crestItem(g, phi, club, thumb) {
    const h = g.crestH;
    const w = (h * 40) / 48;
    const sc = h / 48;
    const inner =
      `<g transform="translate(${f(-w / 2)} ${f(-h / 2)})">` +
      MC.crest({ fill: mix(club.body, "#ffffff", 0.12), sash: club.sec, ring: K.cream, w: f(w), h: f(h) }) +
      (thumb
        ? ""
        : `<path d="${MC.CREST.shield}" transform="scale(${f(sc)})" fill="none" stroke="${K.cream}" stroke-width="${f(1 / sc)}" stroke-dasharray="${f(0.32 / sc)} ${f(0.24 / sc)}"/>`) +
      `</g>`;
    return place(g, g.R * g.crestTh * RAD, g.crestY, phi, inner);
  }

  /* The faces that exist when the band is turned (mount): seasons, the woven figure + ID, BotolaGO. */
  function faces(p, o, u, g, phi, T, club) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const sg = ar ? -1 : 1;
    const s0 = g.R * g.thC * RAD;
    const Q = (Math.PI * g.R) / 2;
    const fill = wovenFill(T, u);
    const lab = ar ? `font-family="'Noto Sans Arabic', sans-serif" font-weight="700" font-size="10"` : `font-family="Manrope, sans-serif" font-weight="800" font-size="8.5" letter-spacing="1.6"`;
    let out = "";
    const s1 = s0 + sg * Q;
    out += place(g, s1, 24, phi, `<text text-anchor="middle" ${lab} fill="${K.thread2}">${MC.esc(S.season)}</text>`);
    out += place(g, s1, 60, phi, `<text text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="31" fill="${fill}" direction="ltr">${MC.esc(p.season)}</text>`);
    // one woven slot per completed season (none yet)
    for (let i = 0; i < 4; i++)
      out += place(g, s1 - 30 + i * 20, 69, phi, `<rect x="-7" y="0" width="14" height="5" fill="none" stroke="${K.thread2}" stroke-width=".8" stroke-dasharray="1.5 1.2" opacity=".75"/>`);
    const s2 = s0 + Math.PI * g.R;
    // the figure from behind, woven in two-colour jacquard: hood and one shoulder rising from the bottom edge
    out += place(
      g,
      s2 - sg * 26,
      0,
      phi,
      `<g clip-path="url(#${u}-fig)">` +
        MC.avatar({ x: -80, y: -102.4, w: 160, h: 192, torso: `url(#${u}-jq)`, hoodFill: `url(#${u}-jq)`, seam: mix(club.body, "#000", 0.25), preserve: "xMidYMid meet" }) +
        `</g>`,
    );
    out += place(g, s2 + sg * 50, 30, phi, `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="10.5" fill="${K.cream}" direction="ltr" style="font-variant-numeric:tabular-nums">${MC.esc(p.id)}</text>`);
    out += place(g, s2 + sg * 50, 55, phi, `<text text-anchor="middle" font-family="Changa, 'Noto Sans Arabic', sans-serif" font-weight="800" font-size="16" fill="${fill}">${MC.esc(S.country)}</text>`);
    out += place(g, s2 + sg * 50, 73, phi, `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="10" fill="${K.thread2}" direction="ltr">${MC.esc(p.season)}</text>`);
    const s3 = s0 - sg * Q;
    out += place(g, s3, 58, phi, `<text text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="31" fill="${fill}" direction="ltr">BotolaGO</text>`);
    return out;
  }

  function surfaceItems(p, o, u, g, phi, T, club, thumb, share) {
    let out = "";
    if (!thumb && !share) out += nameRow(p, o, u, g, phi, T, club);
    out += ovrGlyphs(p, o, u, g, phi, T, club, thumb);
    out += crestItem(g, phi, club, thumb);
    if (phi) out += faces(p, o, u, g, phi, T, club);
    return out;
  }

  /* ---------- the woven care label inside the back wall (BOT #, season, country) ---------- */
  function careLabel(p, o, u, g, phi, club) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const W = 166;
    const h0 = 25.5;
    const hh = 18;
    if (Math.cos(phi) < 0.3) return "";
    const ink = mix(club.body, "#000", 0.38);
    const N = 28;
    const top = [];
    const bot = [];
    for (let i = 0; i <= N; i++) {
      const s = -W / 2 + (W * i) / N;
      const th = s / g.Ri - phi;
      const x = g.cx + g.Ri * Math.sin(th);
      const y = g.ty - g.ryi * Math.cos(th);
      top.push(`${f(x)} ${f(y + h0)}`);
      bot.unshift(`${f(x)} ${f(y + h0 + hh)}`);
    }
    const tape = "M" + top.join("L") + "L" + bot.join("L") + "Z";
    const fade = clamp((Math.cos(phi) - 0.3) / 0.3, 0, 1);
    // text pieces, laid out per piece on the concave wall (visual order left to right)
    const lf = { font: F_MR, fam: "Manrope", wt: 800, z: 8.5, ls: 0.25, ltr: true };
    const af = { font: F_AR, fam: "'Noto Sans Arabic'", wt: 700, z: 9.5, ls: 0, ltr: false };
    let pieces = [
      { t: p.id, ...lf },
      { t: "·", ...lf },
      { t: p.season, ...lf },
      { t: "·", ...lf },
      ar ? { t: S.country, ...af } : { t: S.country, ...lf },
    ];
    if (ar) pieces = pieces.reverse();
    const gap = 3.4;
    const ws = pieces.map((q) => wOf(q.t, q.font, q.z, q.ls));
    const tot = ws.reduce((a, b) => a + b, 0) + gap * (pieces.length - 1);
    const sc = Math.min(1, (W - 14) / tot);
    let cx = -(tot * sc) / 2;
    let txt = "";
    pieces.forEach((q, i) => {
      const ww = ws[i] * sc;
      txt += placeIn(
        g,
        cx + ww / 2,
        h0 + 12.6,
        phi,
        `<text text-anchor="middle" font-family="${q.fam}, sans-serif" font-weight="${q.wt}" font-size="${f(q.z * sc)}"${q.ltr ? ` letter-spacing="${f(q.ls * sc)}" direction="ltr"` : ""} fill="${ink}" style="font-variant-numeric:tabular-nums">${MC.esc(q.t)}</text>`,
      );
      cx += ww + gap * sc;
    });
    const big = placeIn(g, 0, h0 + 13.4, phi, `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="12" letter-spacing=".3" direction="ltr" fill="${ink}">${MC.esc(p.id)}</text>`);
    const ends = [-W / 2 + 3, W / 2 - 3]
      .map((s) => placeIn(g, s, h0 + 1.5, phi, `<path d="M0 0V${hh - 3}" stroke="${ink}" stroke-opacity=".55" stroke-width=".7" stroke-dasharray="1.3 .9"/>`))
      .join("");
    return (
      `<g class="c06-label"${fade < 1 ? ` opacity="${f(fade)}"` : ""}>` +
      `<path d="${tape}" transform="translate(.8 1.4)" fill="#000" opacity=".35"/>` +
      `<path d="${tape}" fill="#cfd6de"/><path d="${tape}" fill="url(#${u}-pkl)"/>` +
      ends +
      `<g class="c06-fine">${txt}</g><g class="c06-big">${big}</g>` +
      `</g>`
    );
  }

  /* ---------- defs for the full card ---------- */
  function defsFull(u, g, T, thumb, club) {
    const L = T.light;
    const op = (v) => f(clamp(v, 0, 0.9));
    let d = "<defs>";
    d += `<clipPath id="${u}-fw"><path d="${fwPath(g)}"/></clipPath>`;
    d += `<clipPath id="${u}-iw"><path d="${iwPath(g)}"/></clipPath>`;
    d += `<clipPath id="${u}-fig"><rect x="-80" y="-4" width="104" height="100"/></clipPath>`;
    // the cylinder in one floodlight from the top-start: side shading deepens with the tier
    d +=
      `<linearGradient id="${u}-cyl" gradientUnits="userSpaceOnUse" x1="${f(g.x0)}" y1="0" x2="${f(g.x1)}" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity="${op(0.5 * L)}"/><stop offset=".07" stop-color="#000" stop-opacity="${op(0.27 * L)}"/>` +
      `<stop offset=".2" stop-color="#000" stop-opacity="${op(0.06 * L)}"/><stop offset=".33" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset=".55" stop-color="#000" stop-opacity="${op(0.07 * L)}"/><stop offset=".76" stop-color="#000" stop-opacity="${op(0.24 * L)}"/>` +
      `<stop offset=".92" stop-color="#000" stop-opacity="${op(0.45 * L)}"/><stop offset="1" stop-color="#000" stop-opacity="${op(0.6 * L)}"/></linearGradient>`;
    d +=
      `<linearGradient id="${u}-spec" gradientUnits="userSpaceOnUse" x1="${f(g.cx - 0.82 * g.R)}" y1="0" x2="${f(g.cx - 0.02 * g.R)}" y2="0">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${T.spec}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    d +=
      `<linearGradient id="${u}-ao" gradientUnits="userSpaceOnUse" x1="0" y1="${f(g.ty)}" x2="0" y2="${f(g.by + g.ry)}">` +
      `<stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".1" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${op(0.3 * L)}"/></linearGradient>`;
    if (T.ring)
      d +=
        `<linearGradient id="${u}-rake" gradientUnits="userSpaceOnUse" x1="${f(g.x0)}" y1="${f(g.ty)}" x2="${f(g.x0 + 60)}" y2="${f(g.by + g.ry)}">` +
        `<stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>`;
    // the inside: the start side of the loop is in its own shadow, the end side catches the light
    d +=
      `<linearGradient id="${u}-insd" gradientUnits="userSpaceOnUse" x1="${f(g.cx - g.Ri)}" y1="0" x2="${f(g.cx + g.Ri)}" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset=".22" stop-color="#000" stop-opacity=".34"/>` +
      `<stop offset=".5" stop-color="#000" stop-opacity=".12"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>`;
    d +=
      `<linearGradient id="${u}-inao" gradientUnits="userSpaceOnUse" x1="0" y1="${f(g.ty - g.ryi)}" x2="0" y2="${f(g.ty - g.ryi + g.H)}">` +
      `<stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".16" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>`;
    d +=
      T.ovr === "print"
        ? `<linearGradient id="${u}-rimt" gradientUnits="userSpaceOnUse" x1="${f(g.x0)}" y1="0" x2="${f(g.x1)}" y2="0">` +
          `<stop offset="0" stop-color="${mix(club.body, "#fff", 0.2)}"/><stop offset=".35" stop-color="${mix(club.body, "#fff", 0.32)}"/><stop offset="1" stop-color="${mix(club.body, "#000", 0.1)}"/></linearGradient>`
        : `<linearGradient id="${u}-rimt" gradientUnits="userSpaceOnUse" x1="${f(g.x0)}" y1="0" x2="${f(g.x1)}" y2="0">` +
          `<stop offset="0" stop-color="#3a78ff"/><stop offset=".32" stop-color="#4d85ff"/><stop offset=".7" stop-color="${K.blue}"/><stop offset="1" stop-color="#0034a8"/></linearGradient>`;
    // the strap end leaves the light as it turns away
    d +=
      `<linearGradient id="${u}-flap" gradientUnits="userSpaceOnUse" x1="${f(g.x1 - 22)}" y1="0" x2="${f(g.x1 + 30)}" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>`;
    d +=
      `<radialGradient id="${u}-gs"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".7" stop-color="#000" stop-opacity=".2"/>` +
      `<stop offset=".9" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    // threads
    d += `<pattern id="${u}-pk" patternUnits="userSpaceOnUse" width="6" height="1.6"><rect width="6" height="1.6" fill="${K.cream}"/><rect y="1.12" width="6" height=".48" fill="#a9b2be"/></pattern>`;
    d += `<pattern id="${u}-pks" patternUnits="userSpaceOnUse" width="6" height="1.6"><rect width="6" height="1.6" fill="${club.sec}"/><rect y="1.12" width="6" height=".48" fill="${mix(club.sec, "#000", 0.28)}"/></pattern>`;
    d += `<pattern id="${u}-pkl" patternUnits="userSpaceOnUse" width="5" height="1.4"><rect y="1" width="5" height=".4" fill="#8e98a6" opacity=".35"/></pattern>`;
    d += `<pattern id="${u}-ink" patternUnits="userSpaceOnUse" width="6" height="2"><rect y="1.2" width="6" height=".8" fill="#1b2230" opacity=".22"/></pattern>`;
    d += `<pattern id="${u}-sat" patternUnits="userSpaceOnUse" width=".9" height="4"><rect width=".9" height="4" fill="#f4f7fa"/><rect x=".6" width=".3" height="4" fill="#aeb8c5"/></pattern>`;
    d +=
      `<pattern id="${u}-app" patternUnits="userSpaceOnUse" width="1.8" height="1.8" patternTransform="rotate(-40)">` +
      `<rect width="1.8" height="1.8" fill="${club.sec}"/><rect y="1.2" width="1.8" height=".6" fill="${mix(club.sec, "#000", 0.12)}"/></pattern>`;
    d +=
      `<pattern id="${u}-jq" patternUnits="userSpaceOnUse" width="8" height="1.5">` +
      `<rect width="8" height="1.5" fill="${mix(K.cream, club.body, 0.12)}"/><rect y=".95" width="8" height=".55" fill="${mix(club.body, "#000", 0.1)}"/></pattern>`;
    const tw = { twill: 3.4, double: 2.3 }[T.weave];
    if (tw) {
      const twp = (id, rot) =>
        `<pattern id="${u}-${id}" patternUnits="userSpaceOnUse" width="${tw}" height="${tw}" patternTransform="rotate(${rot})">` +
        `<rect width="${tw}" height="${f(tw * 0.36)}" fill="#fff" opacity=".075"/><rect y="${f(tw * 0.55)}" width="${tw}" height="${f(tw * 0.26)}" fill="#000" opacity=".13"/></pattern>`;
      d += twp("tw", -58) + twp("twr", 58);
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
      d += `<filter id="${u}-soft" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2.2"/></filter>`;
      d += `<filter id="${u}-sil" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".45"/></filter>`;
      d += `<filter id="${u}-lift" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".7"/></filter>`;
    }
    d += "</defs>";
    return d;
  }

  /* ---------- weave textures ---------- */
  function weaveFront(u, g, T, thumb) {
    if (thumb) return "";
    const R = `x="${f(g.x0)}" y="${f(g.ty - g.ry)}" width="${f(2 * g.R)}" height="${f(g.H + 2 * g.ry)}"`;
    let s = `<g clip-path="url(#${u}-fw)" pointer-events="none">`;
    if (T.weave === "rib") {
      // printed elastic: fine longitudinal ribs that follow the cylinder
      s += `<path d="${arcLines(g, 2, 1, g.H)}" fill="none" stroke="#000" stroke-opacity=".17" stroke-width=".8"/>`;
      s += `<path d="${arcLines(g, 2, 1.9, g.H)}" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width=".6"/>`;
    } else if (T.weave === "ottoman") {
      // ottoman rib: heavy horizontal ribs at 4u, each lit on top and shaded underneath
      s += `<path d="${arcLines(g, 4, 0.8, g.H)}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.1"/>`;
      s += `<path d="${arcLines(g, 4, 2.1, g.H)}" fill="none" stroke="#000" stroke-opacity=".1" stroke-width=".7"/>`;
      s += `<path d="${arcLines(g, 4, 3.3, g.H)}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.3"/>`;
    } else {
      s += `<rect ${R} fill="url(#${u}-tw)"/>`;
      s += `<path d="${arcLines(g, T.weave === "double" ? 1.25 : 1.6, 0.6, g.H)}" fill="none" stroke="#000" stroke-opacity="${T.weave === "double" ? 0.1 : 0.08}" stroke-width=".42"/>`;
    }
    s += `<rect ${R} fill="#000" filter="url(#${u}-gr)" opacity="${T.weave === "rib" ? 0.22 : 0.3}"/>`;
    return s + `</g>`;
  }
  function weaveInside(u, g, T, thumb) {
    if (thumb) return "";
    const R = `x="${f(g.cx - g.Ri)}" y="${f(g.ty - g.ryi)}" width="${f(2 * g.Ri)}" height="${f(g.H + 2 * g.ryi)}"`;
    let s = `<g clip-path="url(#${u}-iw)" pointer-events="none">`;
    if (T.weave === "rib") s += `<path d="${backLines(g, 2, 1, g.H)}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width=".8"/>`;
    else if (T.weave === "ottoman") {
      s += `<path d="${backLines(g, 4, 0.8, g.H)}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1"/>`;
      s += `<path d="${backLines(g, 4, 3.3, g.H)}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.3"/>`;
    } else {
      // the reverse of the weave: the twill runs the other way inside
      s += `<rect ${R} fill="url(#${u}-twr)"/>`;
      s += `<path d="${backLines(g, 1.6, 0.6, g.H)}" fill="none" stroke="#000" stroke-opacity=".1" stroke-width=".42"/>`;
    }
    s += `<rect ${R} fill="#000" filter="url(#${u}-gr)" opacity=".28"/>`;
    return s + `</g>`;
  }

  /* ---------- the closure strap (full card) ---------- */
  function boxX(a, b, c, d2, w, dash) {
    // a,b,c,d2: corner points "x y" (top-start, top-end, bottom-end, bottom-start)
    return `<g fill="none" stroke="${K.cream}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}><path d="M${a}L${b}L${c}L${d2}Z"/><path d="M${a}L${c}M${b}L${d2}"/></g>`;
  }

  function tabStats(p, o, S, g, T) {
    const ar = MC.isAr(o);
    const Sx = MC.s(o);
    const sp = g.tab;
    const rows = [27.5, 43, 58.5, 74];
    const head = 13;
    const NZ = 13.5;
    const labelZ = ar ? 9.5 : 8;
    const tw = Sx.tiers[p.tier];
    let fine = "";
    let big = "";
    const num = (v, z) => `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${z}" fill="${K.cream}" direction="ltr" style="font-variant-numeric:tabular-nums">${MC.esc(v)}</text>`;
    if (!ar) {
      const s0 = sp.lab0;
      const s1 = sp.num1;
      const hw = wOf(tw, F_MR, 7.2, 1.3);
      fine += onStrip(S, s0 + hw / 2, head, `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="7.2" letter-spacing="1.3" fill="${K.thread2}">${MC.esc(tw)}</text>`);
      fine += onStrip(S, s0, head + 3.2, `<path d="M0 0H${f(s1 - s0)}" stroke="${K.thread2}" stroke-opacity=".35" stroke-width=".6"/>`);
      MC.STATS.forEach((k, i) => {
        const lw = wOf(Sx.stats[k], F_MR, labelZ, 0.8);
        const v = String(p.stats[k]);
        fine += onStrip(S, s0 + lw / 2, rows[i] - 0.4, `<text text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${labelZ}" letter-spacing=".8" fill="${K.thread2}">${MC.esc(Sx.stats[k])}</text>`);
        fine += onStrip(S, s1 - wOf(v, F_MR, NZ) / 2, rows[i], num(v, NZ));
        big += onStrip(S, s1 - wOf(v, F_MR, 16) / 2, 20 + i * 19, num(v, 16));
      });
    } else {
      // Arabic: the labels are right-aligned at the reading start, the figures to their left
      const s0 = sp.lab0;
      const nW = wOf("00", F_MR, NZ);
      const maxL = Math.max(...MC.STATS.map((k) => wOf(Sx.stats[k], F_AR, labelZ)));
      const sEnd = s0 + nW + 6 + maxL;
      const hw = wOf(tw, F_AR, 9);
      fine += onStrip(S, sEnd - hw / 2, head + 0.6, `<text text-anchor="middle" font-family="'Noto Sans Arabic', sans-serif" font-weight="700" font-size="9" fill="${K.thread2}">${MC.esc(tw)}</text>`);
      fine += onStrip(S, s0, head + 3.6, `<path d="M0 0H${f(sEnd - s0)}" stroke="${K.thread2}" stroke-opacity=".35" stroke-width=".6"/>`);
      MC.STATS.forEach((k, i) => {
        const lw = wOf(Sx.stats[k], F_AR, labelZ);
        const v = String(p.stats[k]);
        fine += onStrip(S, sEnd - lw / 2, rows[i] - 0.4, `<text text-anchor="middle" font-family="'Noto Sans Arabic', sans-serif" font-weight="700" font-size="${labelZ}" fill="${K.thread2}">${MC.esc(Sx.stats[k])}</text>`);
        fine += onStrip(S, s0 + wOf(v, F_MR, NZ) / 2, rows[i], num(v, NZ));
        big += onStrip(S, s0 + wOf(v, F_MR, 16) / 2, 20 + i * 19, num(v, 16));
      });
    }
    return `<g class="c06-fine">${fine}</g><g class="c06-big">${big}</g>`;
  }

  function tabFull(p, o, u, g, T, club, phi, thumb, pull = 1) {
    const sp = g.tab;
    const founder = !!p.founder;
    const legend = T.ring;
    const Ht = sp.Ht;
    const run = (Ht / g.ca) * CUT;
    const fade = clamp(1 - Math.abs(wrapPhi(phi)) / 0.55, 0, 1);
    if (fade <= 0) return "";
    const S = stripBuild(g, sp, phi, legend ? sp.ring.past : sp.past);
    const fill = legend ? mix(bodyTone(club, T), "#000", 0.1) : K.velcro;
    const edge = mix(fill, "#000", 0.45);
    const lift = mix(fill, "#ffffff", 0.24);
    const RG = sp.ring;
    // LEGEND: the strap end slides through the ring (pull 0..1) and folds back over itself
    const sTop = legend ? S.len + 0.6 + (1 - pull) * RG.fold * 0.9 : S.len;
    const sBot = legend ? sTop : founder ? S.len - run : S.len;
    const poly = stripPoly(S, 0, sTop, sBot, Ht);
    let s = `<g class="c06-tab"${fade < 1 ? ` opacity="${f(fade)}"` : ""}>`;
    // contact shadow on the band
    s += `<g clip-path="url(#${u}-fw)"><path d="${poly}" transform="translate(2.4 3.2)" fill="#000" opacity="${thumb ? 0.3 : 0.55}"${thumb ? "" : ` filter="url(#${u}-soft)"`}/></g>`;
    let ringFront = "";
    if (legend) {
      const fr = S.frame(S.len);
      const tf = frameT(g, fr.x, fr.y, fr.p);
      const half = RG.stock / 2;
      const v0 = -RG.over + half;
      const v1 = Ht + RG.over - half;
      const Dd = RG.depth;
      const kk = 0.17;
      const dP = `M0 ${f(v0)}V${f(v1)}C${f(Dd * 0.62)} ${f(v1)} ${f(Dd)} ${f(v1 - (v1 - v0) * kk)} ${f(Dd)} ${f((v0 + v1) / 2)}C${f(Dd)} ${f(v0 + (v1 - v0) * kk)} ${f(Dd * 0.62)} ${f(v0)} 0 ${f(v0)}Z`;
      const vm = (v0 + v1) / 2;
      const ins = (d) => `translate(${f(Dd / 2)} ${f(vm)}) scale(${f((Dd - 2 * d) / Dd)} ${f((v1 - v0 - 2 * d) / (v1 - v0))}) translate(${f(-Dd / 2)} ${f(-vm)})`;
      s +=
        `<g transform="${tf}">` +
        `<defs><linearGradient id="${u}-st" gradientUnits="userSpaceOnUse" x1="0" y1="${f(v0)}" x2="${f(Dd)}" y2="${f(v1)}">` +
        `<stop offset="0" stop-color="#6c7581"/><stop offset=".14" stop-color="#e9eef3"/><stop offset=".3" stop-color="#8d97a3"/><stop offset=".5" stop-color="#f7f9fb"/>` +
        `<stop offset=".68" stop-color="#6c7581"/><stop offset=".85" stop-color="#c3cad3"/><stop offset="1" stop-color="#4c535d"/></linearGradient></defs>` +
        (thumb ? "" : `<path d="${dP}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="${RG.stock}" transform="translate(2.8 3.4)" filter="url(#${u}-soft)"/>`) +
        `<path d="${dP}" fill="none" stroke="#1b2028" stroke-width="${f(RG.stock + 1)}" stroke-linejoin="round"/>` +
        `<path d="${dP}" fill="none" stroke="${K.steelDark}" stroke-width="${RG.stock}" stroke-linejoin="round"/>` +
        `<path d="${dP}" fill="none" stroke="url(#${u}-st)" stroke-width="${f(RG.stock - 2.4)}" stroke-linejoin="round"/>` +
        `<path d="${dP}" transform="${ins(2.2)}" fill="none" stroke="${K.steelLight}" stroke-width="1.1" stroke-linejoin="round"/>` +
        (thumb ? "" : `<path d="M${f(Dd * 0.2)} ${f(v0 - 0.4)}C${f(Dd * 0.5)} ${f(v0 - 0.4)} ${f(Dd * 0.78)} ${f(v0 + 3)} ${f(Dd * 0.92)} ${f(v0 + 9)}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".85"/>`) +
        `</g>`;
      // the strap's end wrapped round the bar and sewn back on itself
      const fold = RG.fold * pull;
      if (fold > 0.5) {
        const cutL = founder ? run : 0;
        const dbl = `M${f(-fold)} 0H0.8V${f(Ht)}H${f(-fold + cutL)}Z`;
        let dr = `<path d="M-2 0H0.8C${f(RG.stock * 0.62)} 0 ${f(RG.stock * 0.62)} ${f(Ht)} 0.8 ${f(Ht)}H-2Z" fill="${mix(fill, "#000", 0.25)}"/>`;
        dr += `<path d="${dbl}" transform="translate(1.3 1.8)" fill="#000" opacity=".4"/>`;
        dr += `<path d="${dbl}" fill="${mix(fill, "#ffffff", 0.06)}"/>`;
        if (!thumb) {
          let rib = "";
          for (let v = 0.8; v < Ht; v += 4) rib += `M${f(-fold + (cutL * v) / Ht)} ${f(v)}H0.8`;
          dr += `<path d="${rib}" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>`;
          rib = "";
          for (let v = 3.3; v < Ht; v += 4) rib += `M${f(-fold + (cutL * v) / Ht)} ${f(v)}H0.8`;
          dr += `<path d="${rib}" stroke="#000" stroke-opacity=".32" stroke-width="1.2"/>`;
        }
        dr += `<path d="${dbl}" fill="none" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round"/>`;
        if (fold > RG.fold * 0.7) {
          const a0 = -fold + cutL + 2.6;
          const a1 = -2.8;
          if (founder) dr += boxX(`${f(a0)} 4`, `${f(a1)} 4`, `${f(a1)} ${f(Ht - 4)}`, `${f(a0)} ${f(Ht - 4)}`, thumb ? 1.6 : 1.15, thumb ? "" : "2.1 1.3");
          else dr += `<path d="M${f(-fold / 2)} 4V${f(Ht - 4)}" stroke="${K.cream}" stroke-opacity=".8" stroke-width="1.1" stroke-dasharray="2.1 1.3"/>`;
        }
        ringFront = `<g transform="${tf}">${dr}</g>`;
      }
    }
    // the underside, with the founder label (shown when the tab is opened in mount)
    if (founder && !thumb) {
      const Sx = MC.s(o);
      const ar = MC.isAr(o);
      const sm = 56;
      s +=
        `<g class="c06-tab-in" aria-hidden="true"><path d="${poly}" fill="#252b33"/>` +
        onStrip(
          S,
          sm,
          Ht / 2,
          `<rect x="-36" y="-17" width="72" height="34" fill="${K.cream}"/>` +
            `<text y="-2" text-anchor="middle" font-family="${ar ? "'Noto Sans Arabic', Changa" : "Changa"}, sans-serif" font-weight="800" font-size="${ar ? 9 : 10}" fill="${mix(club.body, "#000", 0.35)}">${MC.esc(Sx.founderLine)}</text>` +
            `<text y="11" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="8" fill="${mix(club.body, "#000", 0.35)}" direction="ltr">${MC.esc(p.id)}</text>`,
        ) +
        `</g>`;
    }
    s += `<g class="c06-tab-face">`;
    // the strap's thickness, seen on its top edge
    s += `<path d="${stripPoly(S, 0, sTop, sBot, Ht, -1.5)}" fill="${lift}"/>`;
    s += `<path d="${poly}" fill="${fill}"/>`;
    if (!thumb) {
      if (legend) {
        let rib = "";
        for (let v = 0.8; v < Ht; v += 4) rib += stripLine(S, 0, sTop, v);
        s += `<path d="${rib}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>`;
        rib = "";
        for (let v = 3.3; v < Ht; v += 4) rib += stripLine(S, 0, sTop, v);
        s += `<path d="${rib}" fill="none" stroke="#000" stroke-opacity=".32" stroke-width="1.2"/>`;
      } else {
        s += `<path d="${poly}" fill="#000" filter="url(#${u}-vel)" opacity=".4"/>`;
      }
    }
    s += `<path d="${poly}" fill="url(#${u}-cyl)" opacity=".8"/><path d="${poly}" fill="url(#${u}-flap)"/>`;
    s += `<path d="${poly}" fill="none" stroke="${edge}" stroke-width="1.3" stroke-linejoin="round"/>`;
    // reinforced strap: a stitched inset border
    if (T.reinforce && !thumb) {
      const e2 = (legend ? sTop : sBot) - 3.5;
      s += `<path d="${stripLine(S, 2.5, e2, 3)}${stripLine(S, 2.5, e2, Ht - 3)}" fill="none" stroke="${K.cream}" stroke-opacity=".5" stroke-width=".75" stroke-dasharray="1.9 1.3"/>`;
    }
    // where the strap is sewn to the band: a box-X for founders, one line for everyone else
    if (founder && !legend) s += boxX(ptOn(S, 3, 4), ptOn(S, 15, 4), ptOn(S, 15, Ht - 4), ptOn(S, 3, Ht - 4), thumb ? 1.6 : 1.15, thumb ? "" : "2.1 1.3");
    else s += `<path d="M${ptOn(S, 8, 4)}L${ptOn(S, 8, Ht - 4)}" fill="none" stroke="${K.cream}" stroke-opacity=".8" stroke-width="1.1" stroke-dasharray="${thumb ? "none" : "2.1 1.3"}"/>`;
    if (!thumb) s += tabStats(p, o, S, g, T);
    s += `</g>`;
    s += ringFront;
    s += `</g>`;
    return s;
  }

  /* ---------- the whole band, for a geometry and a turn ---------- */
  function svgBody(p, o, u, st) {
    const g = st.g;
    const T = tierOf(p);
    const club = clubOf(p);
    const thumb = !!o.thumb;
    const share = !!st.share;
    const phi = st.phi || 0;
    const body = bodyTone(club, T);
    const inner = mix(club.body, "#000", T.n === 4 ? 0.45 : 0.35);
    const woven = T.ovr !== "print";
    let s = defsFull(u, g, T, thumb, club);
    // floor shadow (seen through the loop too)
    if (!thumb && !share) s += `<ellipse class="c06-gshadow" cx="${f(g.cx + 7)}" cy="${f(g.by + 3)}" rx="${f(g.R + 6)}" ry="${f(g.ry + 5)}" fill="url(#${u}-gs)"/>`;
    // the inside of the back wall
    s += `<path d="${iwPath(g)}" fill="${inner}"/>`;
    s += weaveInside(u, g, T, thumb);
    if (woven) s += `<path d="${backBand(g, 0, g.bind)}" fill="${K.blueIn}"/>`;
    for (let i = 0; i < stripesOf(T); i++) s += `<path d="${backBand(g, g.stripe0 + i * g.stripeP, g.stripe0 + i * g.stripeP + g.stripeW)}" fill="${thumb ? K.cream : `url(#${u}-pk)`}"/>`;
    if (woven) s += `<path d="${backBand(g, g.H - g.selv, g.H)}" fill="${mix(club.sec, "#000", 0.3)}"/>`;
    if (!thumb) s += `<g class="c06-inl">${careLabel(p, o, u, g, phi, club)}</g>`;
    s += `<g clip-path="url(#${u}-iw)" pointer-events="none"><rect x="${f(g.cx - g.Ri)}" y="${f(g.ty - g.ryi)}" width="${f(2 * g.Ri)}" height="${f(g.H + 2 * g.ryi)}" fill="url(#${u}-insd)"/>` +
      `<rect x="${f(g.cx - g.Ri)}" y="${f(g.ty - g.ryi)}" width="${f(2 * g.Ri)}" height="${f(g.H)}" fill="url(#${u}-inao)"/></g>`;
    // the top edge, bound in Logo Blue (printed elastic: a plain cut edge)
    s += `<path d="${rimPath(g)}" fill-rule="evenodd" fill="url(#${u}-rimt)"/>`;
    // the front wall
    s += `<path d="${fwPath(g)}" fill="${body}"/>`;
    s += weaveFront(u, g, T, thumb);
    if (woven) {
      s += `<path d="${arcBand(g, 0, g.bind)}" fill="${K.blue}"/>`;
      s += `<path d="${arcBand(g, g.H - g.selv, g.H)}" fill="${club.sec}"/>`;
      if (!thumb) {
        s += `<path d="${arcLine(g, g.bind + 1.2)}" fill="none" stroke="${K.cream}" stroke-opacity=".35" stroke-width=".6" stroke-dasharray="2 1.6"/>`;
        s += `<path d="${arcLine(g, g.H - g.selv - 1.2)}" fill="none" stroke="${K.cream}" stroke-opacity=".3" stroke-width=".6" stroke-dasharray="2 1.6"/>`;
      }
    } else {
      s += `<path d="${arcBand(g, 2, 5.2)}" fill="${K.blue}"/>`;
      s += `<path d="${arcBand(g, g.H - 6.4, g.H - 3.4)}" fill="${club.sec}"/>`;
    }
    s += `<g class="c06-surf" clip-path="url(#${u}-fw)">${surfaceItems(p, o, u, g, phi, T, club, thumb, share)}</g>`;
    // one floodlight: side shading, a soft sheen band, floor occlusion (LEGEND: raking)
    s += `<g clip-path="url(#${u}-fw)" pointer-events="none">`;
    const box = `x="${f(g.x0)}" y="${f(g.ty - g.ry)}" width="${f(2 * g.R)}" height="${f(g.H + 2 * g.ry)}"`;
    s += `<rect ${box} fill="url(#${u}-cyl)"/><rect ${box} fill="url(#${u}-ao)"/>`;
    if (T.ring) s += `<rect ${box} fill="url(#${u}-rake)"/>`;
    s += `<rect class="c06-spec" ${box} fill="url(#${u}-spec)"/>`;
    s += `</g>`;
    s += `<path d="${arcLine(g, 0.4)}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width=".8"/>`;
    // CHAMPION: a round cord piping on both edges
    if (T.piping) {
      const cord = (d) =>
        `<path d="${d}" fill="none" stroke="${mix(club.sec, "#000", 0.45)}" stroke-width="3.6"/>` +
        `<path d="${d}" fill="none" stroke="${mix(club.sec, "#000", 0.12)}" stroke-width="2.8"/>` +
        `<path d="${d}" transform="translate(0 -.7)" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".8"/>`;
      s += cord(ell(g.cx, g.ty, g.R, g.ry)) + cord(arcLine(g, g.H));
    }
    // dark-ground lit edge, so the band and its loop keep their outline on the night ground
    s +=
      `<g class="c06-rim" fill="none" stroke="${K.rim}" stroke-linecap="round" pointer-events="none">` +
      `<path d="${outlinePath(g)}" stroke-width="1"/>` +
      `<g clip-path="url(#${u}-iw)"><path d="${backLine(g, g.H)}" stroke-width=".8" stroke-opacity=".55"/></g>` +
      `<path d="${ell(g.cx, g.ty, g.Ri, g.ryi)}" stroke-width=".6" stroke-opacity=".35"/></g>`;
    s += `<g class="c06-tabw">${tabFull(p, o, u, g, T, club, phi, thumb, st.pull == null ? 1 : st.pull)}</g>`;
    return s;
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const thumb = !!o.thumb;
    const u = MC.uid(ID);
    remember(u, { p, o });
    const svg =
      `<svg class="c06-svg" viewBox="0 0 ${B.W} ${B.VH}" width="100%" direction="ltr" style="direction:ltr" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">` +
      svgBody(p, o, u, { g: B, phi: 0, pull: 1 }) +
      `</svg>`;
    return `<div class="c06 c06-full${o.motion ? " is-motion" : ""}${thumb ? " is-thumb" : ""}" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(MC.label(p, o))}" data-tier="${p.tier}" data-k="${u}">${svg}</div>`;
  }

  /* ---------- token (44-80px) and mini (24-32px): flat fills, no filters, no measuring ---------- */
  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const g = mini ? GM : GT;
    const T = tierOf(p);
    const club = clubOf(p);
    const founder = !!p.founder;
    const legend = T.ring;
    const u = MC.uid("c06t");
    const W = legend ? g.WL : g.W;
    const w = f((size * W) / g.VH);
    const woven = T.ovr !== "print";
    const body = bodyTone(club, T);
    let s =
      `<defs><linearGradient id="${u}-c" gradientUnits="userSpaceOnUse" x1="${f(g.x0)}" y1="0" x2="${f(g.x1)}" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".14" stop-color="#000" stop-opacity=".08"/>` +
      `<stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset=".46" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset=".85" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>` +
      `<linearGradient id="${u}-i" gradientUnits="userSpaceOnUse" x1="${f(g.cx - g.Ri)}" y1="0" x2="${f(g.cx + g.Ri)}" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".5" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>`;
    // inside of the loop: the tier stripes are woven all the way round, so they show inside
    s += `<path d="${iwPath(g)}" fill="${mix(club.body, "#000", 0.42)}"/>`;
    if (woven) s += `<path d="${backBand(g, 0, g.bind)}" fill="${K.blueIn}"/>`;
    for (let i = 0; i < stripesOf(T); i++) s += `<path d="${backBand(g, g.stripe0 + i * g.stripeP, g.stripe0 + i * g.stripeP + g.stripeW)}" fill="${K.cream}"/>`;
    s += `<path d="${iwPath(g)}" fill="url(#${u}-i)"/>`;
    s += `<path d="${rimPath(g)}" fill-rule="evenodd" fill="${woven ? "#2f6dff" : mix(club.body, "#fff", 0.3)}"/>`;
    // front wall
    s += `<path d="${fwPath(g)}" fill="${body}"/>`;
    s += woven ? `<path d="${arcBand(g, 0, g.bind)}" fill="${K.blue}"/>` : `<path d="${arcBand(g, g.bind * 0.35, g.bind * 1.1)}" fill="${K.blue}"/>`;
    s += `<path d="${arcBand(g, g.H - g.selv, g.H)}" fill="${club.sec}"/>`;
    // the 84, centred between the binding and the bottom selvedge
    const th = g.thC * RAD;
    const x = g.cx + g.R * Math.sin(th) + 0.02 * g.Z;
    const y = g.ty + g.ry * Math.cos(th) + ovrBaseOf(g);
    const t = `text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="${g.Z}" direction="ltr"`;
    s += `<g transform="${frameT(g, x, y, th)}">`;
    if (legend) s += `<text ${t} x="${mini ? 0.7 : 1}" y="${mini ? 0.8 : 1.15}" fill="#05080d" opacity=".55">${MC.esc(p.ovr)}</text>`;
    s += `<text ${t} fill="${legend ? "#ffffff" : T.ovr === "applique" ? club.sec : K.cream}">${MC.esc(p.ovr)}</text></g>`;
    s += `<path d="${fwPath(g)}" fill="url(#${u}-c)"/>`;
    if (T.piping && !mini) s += `<path d="${ell(g.cx, g.ty, g.R, g.ry)}${arcLine(g, g.H)}" fill="none" stroke="${club.sec}" stroke-width="1.1"/>`;
    // dark-ground lit edge
    s += `<path d="${outlinePath(g)}" class="c06-rim" fill="none" stroke="${K.rim}" stroke-width="${mini ? 0.6 : 0.8}"/>`;
    // the strap
    const sp = g.tab;
    const Ht = sp.Ht;
    const run = mini ? sp.runMini : (Ht / g.ca) * CUT;
    const S = stripBuild(g, sp, 0, legend ? sp.ring.past : sp.past);
    const tf = legend ? mix(body, "#000", 0.18) : mini ? "#6b7380" : K.velcro;
    const sTop = legend ? S.len + 0.3 : S.len;
    const sBot = legend ? sTop : founder ? S.len - run : S.len;
    const poly = stripPoly(S, 0, sTop, sBot, Ht);
    s += `<path d="${poly}" transform="translate(${mini ? 0.6 : 0.9} ${mini ? 0.8 : 1.1})" fill="#000" opacity=".35"/>`;
    if (legend) {
      const RG = sp.ring;
      const fr = S.frame(S.len);
      const half = RG.stock / 2;
      const v0 = -RG.over + half;
      const v1 = Ht + RG.over - half;
      const Dd = RG.depth;
      const dP = `M0 ${f(v0)}V${f(v1)}C${f(Dd * 0.62)} ${f(v1)} ${f(Dd)} ${f(v1 - (v1 - v0) * 0.17)} ${f(Dd)} ${f((v0 + v1) / 2)}C${f(Dd)} ${f(v0 + (v1 - v0) * 0.17)} ${f(Dd * 0.62)} ${f(v0)} 0 ${f(v0)}Z`;
      s +=
        `<g transform="${frameT(g, fr.x, fr.y, fr.p)}">` +
        `<path d="${dP}" fill="none" stroke="#1b2028" stroke-width="${f(RG.stock + 0.9)}" stroke-linejoin="round"/>` +
        `<path d="${dP}" fill="none" stroke="#c9d0d8" stroke-width="${f(RG.stock)}" stroke-linejoin="round"/>` +
        `<path d="${dP}" fill="none" stroke="#ffffff" stroke-width="${f(RG.stock * 0.32)}" stroke-linejoin="round" transform="translate(-.3 -.3)" opacity=".8"/>` +
        `</g>`;
    }
    s += `<path d="${poly}" fill="${tf}" stroke="${mix(tf, "#000", 0.45)}" stroke-width="${mini ? 0.5 : 0.7}" stroke-linejoin="round"/>`;
    if (legend) {
      const RG = sp.ring;
      const fr = S.frame(S.len);
      const fold = RG.fold;
      const cutL = founder ? run : 0;
      s +=
        `<g transform="${frameT(g, fr.x, fr.y, fr.p)}">` +
        `<path d="M${f(-fold)} 0H0.6C${f(RG.stock * 0.6)} 0 ${f(RG.stock * 0.6)} ${f(Ht)} 0.6 ${f(Ht)}H${f(-fold + cutL)}Z" fill="${mix(tf, "#fff", 0.08)}" stroke="${mix(tf, "#000", 0.45)}" stroke-width="${mini ? 0.5 : 0.7}" stroke-linejoin="round"/>` +
        `</g>`;
    }
    if (founder && size >= 56) {
      if (legend) {
        const RG = sp.ring;
        const fr = S.frame(S.len);
        const a0 = -RG.fold + run + 1.2;
        s += `<g transform="${frameT(g, fr.x, fr.y, fr.p)}">${boxX(`${f(a0)} 1.8`, `-1.2 1.8`, `-1.2 ${f(Ht - 1.8)}`, `${f(a0)} ${f(Ht - 1.8)}`, 0.6)}</g>`;
      } else s += boxX(ptOn(S, 1.2, 1.8), ptOn(S, 5.4, 1.8), ptOn(S, 5.4, Ht - 1.8), ptOn(S, 1.2, Ht - 1.8), 0.6);
    }
    const Sx = MC.s(o);
    return (
      `<span class="c06 c06-tok${mini ? " is-mini" : ""}" role="img" aria-label="${MC.esc(`${p.ovr} OVR, ${Sx.tiers[p.tier]}${p.founder ? ", " + Sx.founderLine : ""}`)}" style="width:${w}px;height:${size}px">` +
      `<svg viewBox="0 0 ${W} ${g.VH}" width="${w}" height="${size}" direction="ltr" style="direction:ltr" aria-hidden="true" focusable="false">${s}</svg></span>`
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

  /* ---------- share (360x640): the band close up under a floodlight, the manager behind it ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid("c06s");
    const club = clubOf(p);
    const T = tierOf(p);
    const A = MC.AVATAR;
    // the band close-up: fit the 84's left edge to the tab's end inside the frame, bleeding off the start side
    const g = SB;
    const all = metrics(String(p.ovr), F_CH);
    const s0 = g.R * g.thC * RAD;
    const inkL = s0 - (((all.r - all.l) / 2) * g.Z) / 100 - (all.l * g.Z) / 100;
    const xL = g.cx + g.R * Math.sin(inkL / g.R);
    const xR = g.cx + g.R + (T.ring ? g.tab.ring.past + g.tab.ring.depth + 4 : g.tab.past + 2);
    const sc = Math.min(1.34, (346 - 14) / (xR - xL));
    const bx = 14 - xL * sc;
    const by = 92 - 4 * sc;
    const bu = MC.uid(ID);
    const band =
      `<svg class="c06-sh-band" x="${f(bx)}" y="${f(by)}" width="${f(g.W * sc)}" height="${f(g.VH * sc)}" viewBox="0 0 ${g.W} ${g.VH}" overflow="visible">` +
      svgBody(p, { ...o, thumb: false }, bu, { g, phi: 0, pull: 1, share: true }) +
      `</svg>`;
    // the figure from behind, cropped to the hood and one shoulder, the armband on the upper arm
    const FS = 1.8;
    const FX = 252 - 100 * FS;
    const FY = 300 - 44 * FS;
    const Fx = (ax) => FX + ax * FS;
    const Fy = (ay) => FY + ay * FS;
    let sc2 = "<defs>";
    sc2 += `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050913"/><stop offset=".55" stop-color="#0a1426"/><stop offset="1" stop-color="#050a14"/></linearGradient>`;
    sc2 += `<radialGradient id="${u}-src" gradientUnits="userSpaceOnUse" cx="-30" cy="-50" r="430"><stop offset="0" stop-color="#9cb3e6" stop-opacity=".9"/><stop offset=".22" stop-color="#5b72a6" stop-opacity=".62"/><stop offset=".5" stop-color="#22345a" stop-opacity=".35"/><stop offset="1" stop-color="#0a1428" stop-opacity="0"/></radialGradient>`;
    sc2 += `<linearGradient id="${u}-beam" gradientUnits="userSpaceOnUse" x1="-40" y1="-40" x2="330" y2="600"><stop offset="0" stop-color="#dfe9ff" stop-opacity=".36"/><stop offset=".55" stop-color="#9fb8ef" stop-opacity=".08"/><stop offset="1" stop-color="#9fb8ef" stop-opacity="0"/></linearGradient>`;
    sc2 += `<filter id="${u}-bl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>`;
    sc2 += `<filter id="${u}-haze" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".011 .028" numOctaves="3" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 .75  0 0 0 0 .82  0 0 0 0 1  1.1 0 0 0 -.35"/></filter>`;
    sc2 += `<filter id="${u}-gr" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -.62"/></filter>`;
    sc2 += `<linearGradient id="${u}-jk" gradientUnits="userSpaceOnUse" x1="${f(Fx(0))}" y1="0" x2="${f(Fx(200))}" y2="0"><stop offset="0" stop-color="#1c2a44"/><stop offset=".45" stop-color="#121c2e"/><stop offset="1" stop-color="#0a101b"/></linearGradient>`;
    sc2 += `<clipPath id="${u}-fig"><path transform="translate(${f(FX)} ${f(FY)}) scale(${FS})" d="${A.torso}${A.hood}"/></clipPath>`;
    sc2 += `<clipPath id="${u}-lit"><rect x="0" y="0" width="${f(Fx(104))}" height="640"/></clipPath>`;
    sc2 += `<linearGradient id="${u}-scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03060d" stop-opacity="0"/><stop offset="1" stop-color="#03060d" stop-opacity=".88"/></linearGradient>`;
    sc2 += "</defs>";
    let w = `<rect width="360" height="640" fill="url(#${u}-sky)"/>`;
    // the floodlight is out of frame at the top-start: its glow, two beams, the haze they light
    w += `<rect width="360" height="640" fill="url(#${u}-src)"/>`;
    w += `<g filter="url(#${u}-bl)"><path d="M-60 -40L40 -60L380 470L250 640Z" fill="url(#${u}-beam)"/><path d="M-80 30L-30 -10L170 640L40 640Z" fill="url(#${u}-beam)" opacity=".7"/></g>`;
    w += `<rect width="360" height="640" filter="url(#${u}-haze)" opacity=".1"/>`;
    // the pitch behind: the touchline and turf stripes, far below the light
    w += `<path d="M0 548H360V640H0Z" fill="#081326"/>`;
    for (let i = 0; i < 4; i++) w += `<path d="M0 ${560 + i * 22}H360V${571 + i * 22}H0Z" fill="#0d1d38" opacity=".7"/>`;
    w += `<path d="M0 548H360" stroke="#dfe8f5" stroke-opacity=".38" stroke-width="1.3"/>`;
    // the manager
    w += `<g transform="translate(${f(FX)} ${f(FY)}) scale(${FS})">`;
    w += `<path d="${A.torso}" fill="url(#${u}-jk)"/><path d="${A.hood}" fill="url(#${u}-jk)"/>`;
    w += `<g fill="none" stroke="#2c3d5e" stroke-width="1.3"><path d="${A.seam}"/><path d="${A.hoodSeam}"/><path d="${A.hoodRim}"/></g>`;
    w += `</g>`;
    // the armband on the upper arm, catching the light
    const arm = `M${f(Fx(9))} ${f(Fy(214))}Q${f(Fx(26))} ${f(Fy(203))} ${f(Fx(46))} ${f(Fy(194))}L${f(Fx(53))} ${f(Fy(208))}Q${f(Fx(33))} ${f(Fy(217))} ${f(Fx(14))} ${f(Fy(229))}Z`;
    const armTop = `M${f(Fx(9))} ${f(Fy(214))}Q${f(Fx(26))} ${f(Fy(203))} ${f(Fx(46))} ${f(Fy(194))}L${f(Fx(47.4))} ${f(Fy(196.8))}Q${f(Fx(27.4))} ${f(Fy(205.8))} ${f(Fx(10))} ${f(Fy(217))}Z`;
    w += `<g clip-path="url(#${u}-fig)"><path d="${arm}" fill="${club.body}"/><path d="${armTop}" fill="${K.blue}"/>`;
    w += `<path d="M${f(Fx(12))} ${f(Fy(226.4))}Q${f(Fx(32))} ${f(Fy(214.4))} ${f(Fx(52))} ${f(Fy(205.4))}" stroke="${club.sec}" stroke-width="2.4" fill="none"/>`;
    w += `<path d="M${f(Fx(9))} ${f(Fy(214))}Q${f(Fx(26))} ${f(Fy(203))} ${f(Fx(46))} ${f(Fy(194))}" stroke="#dce8ff" stroke-width="1.5" fill="none"/></g>`;
    // rim light on the side that faces the floodlight
    w += `<g clip-path="url(#${u}-lit)" fill="none" stroke="#cfe0ff" stroke-width="1.5" opacity=".9"><path transform="translate(${f(FX)} ${f(FY)}) scale(${FS})" vector-effect="non-scaling-stroke" d="${A.hood}"/><path transform="translate(${f(FX)} ${f(FY)}) scale(${FS})" vector-effect="non-scaling-stroke" d="${A.torso}"/></g>`;
    // grain, then the bottom scrim for the credit line
    w += `<rect width="360" height="640" filter="url(#${u}-gr)" opacity=".05"/>`;
    w += `<rect y="520" width="360" height="120" fill="url(#${u}-scrim)"/>`;
    const scene = `<svg class="c06-sh-scene" viewBox="0 0 360 640" aria-hidden="true" focusable="false">${sc2}<g${ar ? ' transform="translate(360 0) scale(-1 1)"' : ""}>${w}</g>${band}</svg>`;
    const yy = p.founder ? String(p.founder).slice(-2) : "";
    const dot = `<i aria-hidden="true">·</i>`;
    const credit =
      `<p class="c06-sh-credit"><b><bdi>${MC.esc(MC.nameOf(p, o))}</bdi>${yy ? `<span>·${MC.ltr(yy)}</span>` : ""}</b>` +
      `${dot}<span>${MC.esc(S.tiers[p.tier])}</span>${dot}${MC.ltr("@" + p.key)}${dot}${MC.ltr(p.id)}${dot}${MC.ltr(p.season)}${dot}<span>${ar ? "مثال" : "Exemple"}</span></p>`;
    return (
      `<div class="c06 c06-share" dir="${S.dir}"${ar ? ' lang="ar"' : ""} role="img" aria-label="${MC.esc(MC.label(p, o))}">` +
      scene +
      `<span class="c06-sh-logo">${MC.logo("wordmark", { variant: "light", label: false })}</span>` +
      credit +
      `</div>`
    );
  }

  /* ---------- mount: turn the band, step through its faces, open the tab, LEGEND ceremony ---------- */
  function mount(el, mo = {}) {
    if (!el || !el.classList || !el.classList.contains("c06") || el.dataset.c06m) return;
    const k = el.getAttribute("data-k");
    const st = REG.get(k);
    const svg = el.querySelector("svg.c06-svg");
    if (!st || !svg) return;
    el.dataset.c06m = "1";
    const p = st.p;
    const o = st.o;
    const T = tierOf(p);
    const club = clubOf(p);
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const sg = ar ? -1 : 1;
    let reduced = false;
    try {
      reduced = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      /* no matchMedia: animate */
    }
    const Q = Math.PI / 2;
    const friction = T.ring ? 0.965 : 0.9; // LEGEND turns with more inertia
    const targets = [0, -sg * Q, Math.PI, sg * Q];
    let phi = 0;
    let vel = 0;
    let drag = false;
    let lx = 0;
    let raf = 0;
    let busy = false;
    const q = (sel) => svg.querySelector(sel);
    const unit = () => svg.getBoundingClientRect().width / B.W;
    let ctl = null;
    const mark = () => {
      if (!ctl) return;
      const w = wrapPhi(phi);
      ctl.querySelectorAll("button[data-i]").forEach((b) => {
        const i = +b.dataset.i;
        b.setAttribute("aria-pressed", String(Math.abs(wrapPhi(w - targets[i])) < 0.2));
      });
    };
    const draw = () => {
      const a = q(".c06-surf");
      const b = q(".c06-inl");
      const c = q(".c06-tabw");
      if (a) a.innerHTML = surfaceItems(p, o, k, B, phi, T, club, false, false);
      if (b) b.innerHTML = careLabel(p, o, k, B, phi, club);
      if (c) c.innerHTML = tabFull(p, o, k, B, T, club, phi, false, 1);
      mark();
    };
    const tick = (ms = 8) => {
      try {
        if (navigator.vibrate) navigator.vibrate(ms);
      } catch (e) {
        /* no haptics on this device */
      }
    };
    const nearest = (target) => target + TAU * Math.round((phi - target) / TAU);
    const snapTo = (target) => {
      cancelAnimationFrame(raf);
      const go = () => {
        const d = target - phi;
        if (Math.abs(d) < 0.003) {
          phi = wrapPhi(target);
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
    // reduced motion: the faces change by a 180ms crossfade, never by turning
    const fadeTo = (target) => {
      const groups = [q(".c06-surf"), q(".c06-inl"), q(".c06-tabw")].filter(Boolean);
      groups.forEach((n) => {
        n.style.transition = "opacity 180ms linear";
        n.style.opacity = "0";
      });
      setTimeout(() => {
        phi = wrapPhi(target);
        draw();
        const g2 = [q(".c06-surf"), q(".c06-inl"), q(".c06-tabw")].filter(Boolean);
        g2.forEach((n) => {
          n.style.transition = "opacity 180ms linear";
          n.style.opacity = "1";
        });
      }, 180);
    };
    const goFace = (i) => {
      if (busy) return;
      if (reduced) fadeTo(targets[i]);
      else snapTo(nearest(targets[i]));
    };
    // the control: four faces, the founder tab, and the LEGEND replay
    const lab = [String(p.ovr), S.season, "BOT #", "BotolaGO"];
    let h = `<div class="c06 c06-ctl" dir="${S.dir}"><div class="c06-seg" role="group" aria-label="${MC.esc(MC.nameOf(p, o))}">`;
    lab.forEach((t, i) => (h += `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${MC.esc(t)}</button>`));
    h += `</div>`;
    if (p.founder) h += `<button type="button" class="c06-open" aria-pressed="false">${MC.esc(S.founder)}</button>`;
    if (T.ring && !reduced)
      h += `<button type="button" class="c06-replay" aria-label="${ar ? "إعادة" : "Replay"}"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M15.5 10a5.5 5.5 0 1 1-1.8-4.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14.8 2.6v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    h += `</div>`;
    el.insertAdjacentHTML("afterend", h);
    ctl = el.nextElementSibling;
    ctl.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => goFace(+b.dataset.i)));
    const openBtn = ctl.querySelector(".c06-open");
    const toggleOpen = () => {
      const on = el.classList.toggle("is-open");
      if (openBtn) openBtn.setAttribute("aria-pressed", String(on));
    };
    if (openBtn) openBtn.addEventListener("click", toggleOpen);
    el.addEventListener("click", (e) => {
      if (p.founder && e.target.closest && e.target.closest(".c06-tab")) toggleOpen();
    });
    if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
    el.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const dir = (e.key === "ArrowRight" ? 1 : -1) * (ar ? -1 : 1);
      const cur = targets.findIndex((t) => Math.abs(wrapPhi(phi - t)) < 0.2);
      goFace((((cur < 0 ? 0 : cur) + dir) % 4 + 4) % 4);
    });
    if (reduced) return;
    // drag to turn (horizontal; vertical scrolling stays with the page)
    el.style.touchAction = "pan-y";
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", (e) => {
      if (busy || (e.target.closest && e.target.closest(".c06-tab"))) return;
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
    // LEGEND: the strip curls into a loop, the strap snaps through the ring, one slow turn to the front
    const ceremony = () => {
      if (busy) return;
      busy = true;
      cancelAnimationFrame(raf);
      el.classList.remove("is-open");
      const t0 = performance.now();
      const D1 = 650;
      const D2 = 420;
      const D3 = 1900;
      const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const back = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
      let snapped = false;
      const frame = (now) => {
        const t = now - t0;
        if (t < D1) {
          const g = geo({ ...B, ry: Math.max(0.01, B.ry * ease(t / D1)) });
          svg.innerHTML = svgBody(p, o, k, { g, phi: 0, pull: 0 });
        } else if (t < D1 + D2) {
          svg.innerHTML = svgBody(p, o, k, { g: B, phi: 0, pull: clamp(back((t - D1) / D2), 0, 1.08) });
        } else if (t < D1 + D2 + D3) {
          if (!snapped) {
            snapped = true;
            tick(30);
            svg.innerHTML = svgBody(p, o, k, { g: B, phi: 0, pull: 1 });
          }
          const x = (t - D1 - D2) / D3;
          phi = -sg * TAU * (1 - (1 - Math.pow(1 - x, 3)));
          draw();
        } else {
          phi = 0;
          svg.innerHTML = svgBody(p, o, k, { g: B, phi: 0, pull: 1 });
          mark();
          busy = false;
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    const rb = ctl.querySelector(".c06-replay");
    if (rb) rb.addEventListener("click", ceremony);
    if (T.ring && mo.motion !== false && o.motion !== false) ceremony();
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
      "The captain's armband, reissued for managers: a woven loop you can see through, with your 84 where the C would be, your tier woven inside and your founder year cut into the strap.",
    philosophyAr: "شارة القائد في نسخة للمدربين: حلقة منسوجة يُرى من خلالها، تقييمك في مكان حرف القائد، ومستواك منسوج في داخلها، وسنة التأسيس مقصوصة في طرف الحزام.",
    idea: [
      "Every football culture agrees on one object that means 'this person leads': the armband. In the derb it is a cheap printed strip and who wears it is argued about loudly; in a stadium it is a woven band handed over with ceremony. BRASSARD keeps the object and changes the letter. There is no C. Where the C would be, the band carries your 84.",
      "The card is not a rectangle. It is a short band seen from about 27 degrees above, the angle of a product shot, so you look into the loop and through it: the opening is a real hole and the ground shows through. That hole, the elliptical rim and the strap leaving the band's end make an outline nothing else in the app has.",
      "The information sits where an armband holds it. The 84 is on the front face, ALI ·26 woven above it, the club patch on the start side. The strap that closes the band lies on it and carries the tier word and the four stats in a tabular column. Inside the loop, the back wall shows the tier stripes (woven all the way round) and the care label: BOT #004821 · 2026/27 · MOROCCO. Turning the band (drag, arrow keys or the four buttons) shows the season face, the woven figure with the ID, and the word BotolaGO.",
      "Logo Blue binds the top edge, inside and out: it is the band's one brand ink. The body is the club colour the user chose and the bottom selvedge its second colour; the strap is honest loop fabric. The lab's placeholder club is a neutral slate, so these samples are quieter than a real Raja, Wydad or FUS band would be.",
    ],
    belonging: [
      "'Who has the armband?' is a question every group of friends has already argued about. This is the first answer you earn rather than get handed by the coach.",
      "Your band leads your row in every leaderboard, and the stripes inside the loop say your tier at 24px, so friends compare it in comments and head-to-heads without opening anything.",
      "Turning it is a gesture you show people: hold the phone out, spin the band, stop it on the front. LEGEND adds a ceremony worth filming, the strip curling into a loop and the strap snapping through a steel ring.",
      "Teenagers will want the LEGEND ring; older Fantasy players will respect the stripes and the founder cut, which cannot be bought, only kept.",
    ],
    founderMark: [
      "FOUNDER 2026 is written the supporter-group way, after the name: ALI ·26, woven in the club's second thread on the same baseline. It is part of the name, not a badge.",
      "It is also cut into the object. The strap's free end is cut on the wordmark's 11.3 degree slant (later cohorts get a square cut) and sewn on with a box-X (later cohorts get a single line). The LEGEND strap keeps both: the slant and the box-X move to the end that folds back through the ring. At 24px the slanted strap end is the tell; it is drawn steeper there so it stays at least 3px.",
      "Tapping the strap (or its button) folds it open to the woven label underneath: FOUNDER 2026 and BOT #004821.",
    ],
    small: [
      "At 44-80px the token is the band itself in flat fills, seen from the same angle: the hole you can see through (6.8px tall at 44px), the Logo Blue rim, the tier stripes inside the loop, the 84 on the club-colour front, the club's second colour on the bottom edge, and the strap, slanted for founders and folded through a steel D for LEGEND.",
      "At 24-32px the mini keeps the object's own parts: the hole (4px at 28px), 0-3 cream stripes inside the loop (1.6px with 1.2px gaps: HOMA 0, STADE 1, PRO 2, CHAMPION and LEGEND 3), the 84 at 11px and a full-height strap. LEGEND's D-ring stands past the strap above and below with its own hole, the one outline change at 32px.",
      "No filters, turbulence or text measuring run in the token or the row: they are drawn 50 times in a list.",
    ],
    rtl: [
      "The band never mirrors: it is an object, and the strap staying on the right puts it at the reading start in Arabic. The name, the tier word and the stats switch script, not position.",
      "علي is woven in Changa 800 with its own fitted line box: its baseline is placed from the measured ascent and descent so the dots of the ي clear the 84 by at least 4u. The year follows the name (26· to its left), the stat labels are right-aligned at the strap's reading start in Noto Sans Arabic at 9.5u or more, figures stay LTR, and nothing Arabic is tracked.",
      "Turning the band runs the other way in Arabic, so the next face comes in from the reading direction. The story image mirrors its scene and its light, never the band.",
    ],
    tiers: {
      HOMA: "Imprimé: new printed elastic with fine longitudinal ribs, the 84 and name screen-printed flat in cream (the ribs show through the ink), a plain cut edge with a printed blue line, nothing woven inside, a simple velcro strap, soft flat light. Full silhouette: clean and new, never worn.",
      STADE: "Tissé: a jacquard twill, the Logo Blue binding wrapped over the edge, one woven stripe inside the loop, and an 84 woven flat so its pick lines run through the figures.",
      PRO: "Double: a denser double weave, two stripes inside, and an 84 in raised satin stitch whose threads run across the strokes, with one soft sheen that sits on the cylinder's highlight and travels when the band turns. The light is stronger.",
      CHAMPION: "Passepoil: a round cord piping on both edges thickens the outline, three stripes inside, the 84 is an appliqué cut from the club's second fabric with a zigzag satin edge, and the strap is reinforced with a stitched border.",
      LEGEND: "Ottoman: a heavy horizontal rib in a deeper tone under a raking floodlight, the 84 moulded in white silicone with a fine chamfer and a hard cast shadow, and the strap folded through a machined steel D-ring that stands 14u past it above and below, with a hole you can see through. The strap keeps the founder slant, the box-X and the stats.",
    },
    legend: [
      "LEGEND is the armband the pros wear: a white silicone 84 moulded into a heavy ottoman rib, lit by a raking floodlight, with the strap folded through a machined steel D-ring. The D standing past the strap above and below, with its own hole, is the one outline change; it reads at 24px.",
      "The ceremony is a replay, never a gate: the 84 is there from the first frame on a flat strip; in 650ms the strip curls into a loop; the strap slides through the D-ring and snaps (one heavy haptic where the device has them); then the band makes one slow turn and settles on the front. Reduced motion shows the closed band and replaces turning with a four-button crossfade.",
    ],
    advantages: [
      "A silhouette type nobody else in either exploration has: a ring with a real hole and a strap. It is not a rectangle, a ticket or a tombstone, and it survives as a solid shape at 28px.",
      "CAP has a natural home: the stat about captain decisions is woven on the captain's armband.",
      "The stats are always on the front (on the strap); the turning faces add depth without hiding information.",
      "Material progression is physical and legible: print, weave, satin, appliqué and piping, silicone and steel, with the light rising tier by tier.",
      "It has the strongest motion share of the slate: a three-second spin ending on the front, and the LEGEND curl-and-snap.",
    ],
    risks: [
      "Captain collision: the app already marks the Fantasy captain with a navy C and an amber ring. The band must never carry C or ق, never use amber and never appear on the pitch view, or users will read it as 'my captain'.",
      "At 24px it can read as a ring or a bracelet before it reads as an armband; the strap and the Logo Blue rim carry the armband reading. It is wider than tall, so it takes about 42-46px of a row's name cell at 28px.",
      "The placeholder slate club makes every tier look quieter than it would for a real club, and a club with a cream or white kit will need the dark rim on the light ground too.",
      "The gallery only mounts live cards when motion is allowed, so under reduced motion the four-face control is not attached there; mount() itself provides the crossfade control when it is called.",
      "The cylinder projection is per glyph and runs in JavaScript; cheap at rest, but the spin re-projects the woven faces every frame and the LEGEND ceremony redraws the band for about a second.",
      "iOS has no web haptics; the woven Arabic lettering reference (tiraz) needs a Moroccan typographer's review before it is used in any copy.",
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
