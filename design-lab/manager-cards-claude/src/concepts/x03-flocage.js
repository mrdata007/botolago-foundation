/* 03 FLOCAGE — the manager's own bench coat, hung by its loop on a dressing-room
   rail, its back to you. The press prints "84 OVR" where a squad number would go;
   the tier changes the garment itself (heather cotton, piqué, quilted, melton)
   and how the number is built (1, 1, 2, 3, then 4 cut layers). */
(function () {
  const MC = window.MC;
  const E = MC.esc;
  const f = (v) => +(+v).toFixed(2);

  /* ---------- measured type metrics (Chromium canvas, per 1000 em) ---------- */
  // Changa 800 digits [advance, ink left, ink right]: proportional, so the OVR is set by its ink.
  const DIG = {
    0: [675, 31, 641],
    1: [535, 0, 516],
    2: [595, 31, 563],
    3: [556, 0, 531],
    4: [627, 0, 609],
    5: [589, 31, 563],
    6: [615, 31, 594],
    7: [500, 0, 484],
    8: [616, 31, 594],
    9: [615, 31, 594],
  };
  const CAP_H = 0.64; // Changa 800 figure height, em
  const CAPS = {
    A: 641,
    B: 592,
    C: 510,
    D: 655,
    E: 520,
    F: 470,
    G: 575,
    H: 650,
    I: 300,
    J: 391,
    K: 618,
    L: 445,
    M: 811,
    N: 675,
    O: 660,
    P: 590,
    Q: 650,
    R: 625,
    S: 577,
    T: 490,
    U: 634,
    V: 621,
    W: 929,
    X: 630,
    Y: 580,
    Z: 589,
    " ": 200,
  };
  const OVR_INK = [0.0156, 2.0216]; // Manrope 800 "OVR" ink left/right, em
  const AR_TIER_EM = { HOMA: 2.291, STADE: 2.62, PRO: 3.089, CHAMPION: 1.87, LEGEND: 3.347 }; // Noto Sans Arabic 700
  const LAT_TIER_EM = { HOMA: 3.035, STADE: 3.244, PRO: 2.078, CHAMPION: 5.456, LEGEND: 3.871 }; // Manrope 800
  const ink = (n) => {
    let adv = 0,
      L = null,
      R = 0;
    for (const ch of String(n)) {
      const d = DIG[ch] || DIG[0];
      if (L === null) L = adv + d[1];
      R = adv + d[2];
      adv += d[0];
    }
    return { L: L / 1000, R: R / 1000, W: (R - L) / 1000 };
  };
  /** Name size: 30u, shrinking to fit 176u (ABDELKARIM lands near 22u). */
  const nameSize = (name, ar) => {
    const em = ar
      ? [...name].length * 0.62
      : [...name].reduce((a, c) => a + (CAPS[c] || 600), 0) / 1000 + 0.04 * (name.length - 1);
    return Math.max(18, Math.min(30, 176 / Math.max(em, 0.1)));
  };

  /* ---------- palette ---------- */
  const C = {
    flock: "#F3F5F8",
    blue: "#0151FC",
    tunnel: "#001C49",
    slate: "#5A667D", // neutral club placeholder: piping, LEGEND's third layer
    patch: "#0C3164",
    patchInk: "#E9E2CF",
    damask: "#ECE6D6",
    thread: "#B8975A",
    crease: "#0A1A36",
    meta: "#A9B2BE",
    ecru: "#E9E2CF",
  };

  /* ---------- tiers: the garment changes, not just the number ---------- */
  const TIER = {
    HOMA: {
      body: ["#55627B", "#4A5770", "#3A4660"],
      fabric: "heather",
      hook: "wire",
      rail: "paint",
      collar: "crew",
      num: "vinyl",
      flat: false,
      patch: "vinyl",
      crest: false,
      piping: false,
      label: "print",
      ink: "#E3E5E1",
      meta: "#C3C9D2",
      crease: "#2B3549",
      rib: "#3E4A62",
      lining: "#2E3850",
    },
    STADE: {
      body: ["#1D3A6B", "#142C55", "#10264B"],
      fabric: "pique",
      hook: "steel",
      rail: "steel",
      collar: "stand",
      num: "gloss",
      flat: true,
      patch: "print",
      crest: false,
      piping: false,
      label: "woven",
      ink: C.flock,
      meta: C.meta,
      crease: C.crease,
      rib: "#1A3463",
      lining: "#0A1A36",
    },
    PRO: {
      body: ["#1D3A6B", "#142C55", "#10264B"],
      fabric: "pique",
      hook: "brass",
      rail: "oak",
      collar: "stand",
      num: "flock",
      flat: true,
      patch: "woven",
      crest: true,
      piping: true,
      label: "woven",
      ink: C.flock,
      meta: C.meta,
      crease: C.crease,
      rib: "#1A3463",
      lining: "#0A1A36",
    },
    CHAMPION: {
      body: ["#20406F", "#16305C", "#0F2448"],
      fabric: "quilt",
      hook: "brass",
      rail: "oak",
      collar: "stand",
      num: "twill3",
      flat: false,
      patch: "cream",
      crest: true,
      piping: true,
      label: "woven",
      ink: C.flock,
      meta: C.meta,
      crease: "#081633",
      rib: "#132A52",
      lining: "quilt",
    },
    LEGEND: {
      body: ["#F1EBDA", "#E9E2CF", "#CFC5AC"],
      fabric: "melton",
      hook: "peg",
      rail: "walnut",
      collar: "tall",
      num: "twill4",
      flat: false,
      patch: "navy",
      crest: true,
      piping: true,
      label: "navy",
      ink: C.tunnel,
      meta: "#5F5644",
      crease: "#9E9378",
      rib: "#14284F",
      lining: "#0E2347",
      light: true,
    },
  };
  const RAIL = {
    paint: { g: ["#9AA2AC", "#7A828C", "#58606A"], hi: "#C4CAD2", tok: "#7A828C" },
    steel: { g: ["#EEF1F5", "#B7C0CB", "#6D7683"], hi: "#FFFFFF", tok: "#AEB7C2" },
    oak: { g: ["#C29A68", "#9A7148", "#664629"], hi: "#E2C49A", tok: "#9A7148" },
    walnut: { g: ["#7A5A40", "#4A3423", "#2C1E14"], hi: "#A07E5E", tok: "#5A3F2A" },
  };
  const HOOK = {
    wire: { g: ["#C3C9D0", "#8E959E", "#5E656E"], hi: "#E4E8EC", tok: "#99A0A9" },
    steel: { g: ["#F1F4F8", "#AEB7C2", "#68717E"], hi: "#FFFFFF", tok: "#B7C0CB" },
    brass: { g: ["#EBD9AC", "#C2A061", "#7E5F31"], hi: "#F8EDCB", tok: "#CFAF72" },
    peg: { g: ["#9A7656", "#5A3F2A", "#2E2016"], hi: "#C7A585", tok: "#5A3F2A" },
  };

  /* ---------- the garment (viewBox 0 0 300 420) ---------- */
  // Rail y2–12. Collar base (114,68)/(186,68). Shoulders slope 14° to (20,91.4)/(280,91.4).
  // Sleeves hang to the cuffs at y300, 3u clear of the body (x54|57, x243|246) from the armpit
  // (y≈126) down; the body runs on to the hem at y382, so each lower corner steps in by 82u.
  const G = { cuff: 300, hem: 382, armpit: 128, bodyL: 57, bodyR: 243, slvL: 54, slvR: 246 };
  const COLLAR = {
    crew: { l: 114, r: 186, top: "L116.5 62Q150 55.5 183.5 62", apex: 58.75 },
    stand: { l: 114, r: 186, top: "L116 56Q150 47 184 56", apex: 51.5 },
    tall: { l: 114, r: 186, top: "L113 49Q150 39 187 49", apex: 44 },
  };
  const SLEEVE_SEAMS = [130, 154, 178, 202, 226, 250, 274, 290];
  const BODY_SEAMS = [300, 322, 346, 371];
  const sxL = (y) => 20 + (-5 * (y - 91.4)) / 208.6;
  const sxR = (y) => 280 + (5 * (y - 91.4)) / 208.6;
  /** A straight edge between two points, or (quilted) bulging 1.5u outward between channel seams. */
  function seg(xa, ya, xb, yb, seams, b, ox) {
    const at = (y) => xa + ((xb - xa) * (y - ya)) / (yb - ya);
    const cuts = seams
      .filter((y) => (y - ya) * (y - yb) < 0)
      .sort((p, q) => (ya < yb ? p - q : q - p));
    const P = [[xa, ya], ...cuts.map((y) => [at(y), y]), [xb, yb]];
    let s = "";
    for (let i = 1; i < P.length; i++) {
      const [x0, y0] = P[i - 1];
      const [x1, y1] = P[i];
      s += b
        ? `Q${f((x0 + x1) / 2 + ox * 2 * b)} ${f((y0 + y1) / 2)} ${f(x1)} ${f(y1)}`
        : `L${f(x1)} ${f(y1)}`;
    }
    return s;
  }
  function outline(T) {
    const c = COLLAR[T.collar];
    const q = T.fabric === "quilt" ? 1.5 : 0;
    return (
      `M${c.l} 68${c.top}L${c.r} 68` +
      // right shoulder (14°), corner r3, sleeve outer edge down to the cuff
      `L277.09 90.68Q280 91.4 280.07 94.4` +
      `L${f(sxR(130))} 130` +
      seg(sxR(130), 130, sxR(290), 290, SLEEVE_SEAMS, q, 1) +
      `L284.95 298.5Q285 300 283.5 300` +
      // cuff, sleeve inner edge up to the armpit, 3u slit, body side down to the hem
      `L247.5 300Q246 300 246 298.5L246 ${G.armpit}Q244.5 124 243 ${G.armpit}L243 300` +
      seg(243, 300, 243, 371, BODY_SEAMS, q, 1) +
      `L243 380.5Q243 382 241.5 382` +
      `L58.5 382Q57 382 57 380.5L57 371` +
      seg(57, 371, 57, 300, BODY_SEAMS, q, -1) +
      `L57 ${G.armpit}Q55.5 124 54 ${G.armpit}L54 298.5Q54 300 52.5 300` +
      `L16.5 300Q15 300 15.05 298.5L${f(sxL(290))} 290` +
      seg(sxL(290), 290, sxL(130), 130, SLEEVE_SEAMS, q, -1) +
      `L19.93 94.4Q20 91.4 22.91 90.68Z`
    );
  }

  /* ---------- the number group: "84" + "OVR" printed as one run, centred by ink ---------- */
  const NUM = { F: 108, Fo: 14.5, ls: 0.6, gap: 6, base: 294, cx: 150 };
  function numRuns(n, thumb, shift = 0) {
    const k = ink(n);
    const F = NUM.F;
    const wN = k.W * F;
    const Fo = thumb ? 0 : NUM.Fo;
    const wO = Fo ? (OVR_INK[1] - OVR_INK[0]) * Fo + 2 * NUM.ls : 0;
    const total = wN + (Fo ? NUM.gap + wO : 0);
    const gx0 = NUM.cx - total / 2 + shift;
    const runs = [{ t: n, x: gx0 - k.L * F, F, fam: "Changa" }];
    if (Fo)
      runs.push({
        t: "OVR",
        x: gx0 + wN + NUM.gap - OVR_INK[0] * Fo,
        F: Fo,
        fam: "Manrope",
        ls: NUM.ls,
      });
    return { runs, k, x0: gx0, x1: gx0 + total, lastX: gx0 - k.L * F };
  }
  const txt = (r, y, a) =>
    `<text x="${f(r.x)}" y="${y}" font-family="${r.fam}" font-weight="800" font-size="${r.F}" direction="ltr"${r.ls ? ` letter-spacing="${r.ls}"` : ""} ${a}>${E(r.t)}</text>`;

  /** One cut layer under the face: grown by W, offset (d,d), optional satin edge and hard cast. OVR gets a scaled copy. */
  function layer(runs, y, L) {
    let s = "";
    runs.forEach((r, i) => {
      const sc = i === 0 ? 1 : 0.4;
      const W = (L.W || 0) * sc;
      const d = (L.d || 0) * sc;
      const tr = `transform="translate(${f(d)} ${f(d)})"`;
      const paint = (fill, w, extra = "") =>
        txt(
          r,
          y,
          `${tr} fill="${fill}"${w > 0 ? ` stroke="${fill}" stroke-width="${f(w)}" stroke-linejoin="round"` : ""} ${extra}`,
        );
      if (L.cast) {
        const c = L.cast * sc;
        s += txt(
          r,
          y,
          `transform="translate(${f(d + c)} ${f(d + c)})" fill="${L.castC}" fill-opacity="${L.castO}"${W ? ` stroke="${L.castC}" stroke-opacity="${L.castO}" stroke-width="${f(W)}" stroke-linejoin="round"` : ""}`,
        );
      }
      s += paint(L.fill, W, L.filter ? `filter="url(#${L.filter})"` : "");
      if (L.satin) {
        const sw = i === 0 ? 1.5 : 0.7;
        if (W > 0) {
          s += txt(
            r,
            y,
            `${tr} fill="none" stroke="${L.satin}" stroke-width="${f(W + sw)}" stroke-dasharray=".5 .38" stroke-linejoin="round"`,
          );
          s += paint(L.fill, Math.max(W - sw, 0.01));
        } else {
          s += txt(
            r,
            y,
            `${tr} fill="none" stroke="${L.satin}" stroke-width="${sw}" stroke-dasharray=".5 .38" stroke-linejoin="round"`,
          );
        }
      }
    });
    return s;
  }

  function number(p, T, u, thumb) {
    const n = String(p.ovr);
    const y = NUM.base;
    switch (T.num) {
      case "vinyl": {
        // matte iron-on vinyl, set by hand 1.5° off; the top-end corner of the last figure has lifted
        const g = numRuns(n, thumb);
        const last = n.slice(-1);
        const dg = DIG[last] || DIG[0];
        const lx = g.lastX;
        let adv = 0;
        for (const ch of n.slice(0, -1)) adv += (DIG[ch] || DIG[0])[0];
        const ax = lx + ((adv + dg[2]) / 1000) * NUM.F - 4; // stem's top-end corner
        const ay = y - CAP_H * NUM.F;
        const L = 17;
        const A = [ax + 1.5, ay - 1],
          B = [ax - L, ay - 1],
          Cc = [ax + 1.5, ay + L + 1.5];
        const tri = `M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}L${f(Cc[0])} ${f(Cc[1])}Z`;
        // fold matrix: reflect across B–C and foreshorten (the corner curls back at about 60°)
        const len = Math.hypot(Cc[0] - B[0], Cc[1] - B[1]);
        const d = [(Cc[0] - B[0]) / len, (Cc[1] - B[1]) / len];
        const nv = [-d[1], d[0]];
        const k = 0.5;
        const m00 = d[0] * d[0] - k * nv[0] * nv[0],
          m01 = d[0] * d[1] - k * nv[0] * nv[1],
          m11 = d[1] * d[1] - k * nv[1] * nv[1];
        const e = B[0] - (m00 * B[0] + m01 * B[1]),
          fy = B[1] - (m01 * B[0] + m11 * B[1]);
        const fold = `matrix(${f(m00)} ${f(m01)} ${f(m01)} ${f(m11)} ${f(e)} ${f(fy)})`;
        const runs = g.runs;
        const face = (a) => runs.map((r) => txt(r, y, a)).join("");
        if (thumb) return `<g transform="rotate(1.5 150 ${y - 30})">${face(`fill="#E3E5E1"`)}</g>`;
        return (
          `<g transform="rotate(1.5 150 ${y - 30})">` +
          `<clipPath id="${u}-tri"><path d="${tri}"/></clipPath>` +
          `<mask id="${u}-notri" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="420"><rect width="300" height="420" fill="#fff"/><path d="${tri}" fill="#000"/></mask>` +
          `<clipPath id="${u}-glyph">${face("")}</clipPath>` +
          `<g mask="url(#${u}-notri)">${face(`fill="#E3E5E1"`)}<g clip-path="url(#${u}-glyph)"><rect x="40" y="190" width="220" height="120" filter="url(#${u}-matte)" opacity=".5"/></g></g>` +
          // where the vinyl came away: a faint glue trace on the cotton
          `<g clip-path="url(#${u}-tri)">${face(`fill="#fff" fill-opacity=".09"`)}</g>` +
          // the curled corner, its backing side up, and the shadow it throws
          `<g transform="translate(1.3 1.7)" opacity=".42"><g transform="${fold}"><g clip-path="url(#${u}-tri)">${face(`fill="#0D1424"`)}</g></g></g>` +
          `<g transform="${fold}"><g clip-path="url(#${u}-tri)">${face(`fill="#C3C7C0"`)}</g></g>` +
          `<g clip-path="url(#${u}-glyph)"><path d="M${f(B[0])} ${f(B[1])}L${f(Cc[0])} ${f(Cc[1])}" stroke="#fff" stroke-width=".8" stroke-opacity=".9"/></g>` +
          `</g>`
        );
      }
      case "gloss": {
        const g = numRuns(n, thumb);
        return g.runs
          .map(
            (r) =>
              txt(r, y, `fill="url(#${u}-gloss)"`) +
              txt(r, y, `fill="none" stroke="#fff" stroke-opacity=".4" stroke-width=".6"`),
          )
          .join("");
      }
      case "flock": {
        const g = numRuns(n, thumb, -1.1);
        return (
          layer(g.runs, y, { fill: `url(#${u}-twB)`, W: 3, d: 2.2 }) +
          layer(g.runs, y, { fill: C.flock, filter: thumb ? null : `${u}-flock` })
        );
      }
      case "twill3": {
        const g = numRuns(n, thumb, -2.2);
        return (
          layer(g.runs, y, {
            fill: `url(#${u}-twN)`,
            W: 4,
            d: 4.4,
            satin: thumb ? null : "#3D5B8E",
          }) +
          layer(g.runs, y, {
            fill: `url(#${u}-twB)`,
            W: 2,
            d: 2.2,
            satin: thumb ? null : "#6E98FF",
          }) +
          layer(g.runs, y, { fill: `url(#${u}-twW)`, satin: thumb ? null : "#FFFFFF" })
        );
      }
      default: {
        // LEGEND: four cut layers, depth by overlap only — cream, club slate, Logo Blue, Tunnel Navy face
        const g = numRuns(n, thumb, -3.3);
        return (
          layer(g.runs, y, {
            fill: `url(#${u}-twC)`,
            W: 6,
            d: 6.6,
            cast: 2.4,
            castC: "#4A3C22",
            castO: ".28",
            satin: thumb ? null : "#A89C7C",
          }) +
          layer(g.runs, y, {
            fill: `url(#${u}-twS)`,
            W: 4,
            d: 4.4,
            satin: thumb ? null : "#8F9AAE",
          }) +
          layer(g.runs, y, {
            fill: `url(#${u}-twB)`,
            W: 2,
            d: 2.2,
            satin: thumb ? null : "#6E98FF",
          }) +
          layer(g.runs, y, { fill: `url(#${u}-twN)`, satin: thumb ? null : "#3B5A8C" })
        );
      }
    }
  }

  /* ---------- the name, by tier ---------- */
  function nameMark(p, o, T, u, thumb) {
    const ar = MC.isAr(o);
    const nm = MC.nameOf(p, o);
    const F = nameSize(nm, ar);
    const y = ar ? 190 : 192;
    const base = `x="150" y="${y}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${f(F)}"${ar ? ` direction="rtl"` : ` direction="ltr" letter-spacing="${f(F * 0.04)}"`}`;
    const t = (a) => `<text ${base} ${a}>${E(nm)}</text>`;
    switch (T.num) {
      case "vinyl":
        return `<g transform="rotate(-1 150 ${y})">${t(`fill="#E3E5E1"`)}</g>`;
      case "gloss":
        return t(`fill="url(#${u}-gloss)"`);
      case "flock":
        return t(`fill="${C.flock}"${thumb ? "" : ` filter="url(#${u}-flock)"`}`);
      case "twill3":
        return (
          t(`fill="${C.blue}" transform="translate(1.4 1.4)"`) +
          t(`fill="url(#${u}-twW)"`) +
          (thumb ? "" : t(`fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray=".5 .38"`))
        );
      default:
        return (
          t(`fill="${C.blue}" transform="translate(1.6 1.6)"`) +
          t(`fill="url(#${u}-twN)"`) +
          (thumb
            ? ""
            : t(`fill="none" stroke="#3B5A8C" stroke-width="1.2" stroke-dasharray=".5 .38"`))
        );
    }
  }

  /* ---------- prints: the back-neck label and the one stats line on the yoke ---------- */
  function neckLabel(o, T, u) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const word = S.manager;
    const navy = T.label === "navy";
    const bg = navy ? C.tunnel : C.patch;
    const tx = navy ? C.ecru : C.patchInk;
    const edge = navy ? "#C9BC98" : "#8D99AB";
    const w = ar ? 38 : 48;
    const h = ar ? 17 : 12;
    const x = 150 - w / 2;
    const y = 70.5;
    const word$ = ar
      ? `<text x="150" y="${y + 11.4}" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="10" direction="rtl" fill="${T.label === "print" ? T.ink : tx}">${E(word)}</text>`
      : `<text x="150" y="${y + 8.7}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="7.4" letter-spacing=".6" direction="ltr" fill="${T.label === "print" ? T.ink : tx}">${E(word)}</text>`;
    if (T.label === "print") return `<g opacity=".86">${word$}</g>`;
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${bg}"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="url(#${u}-lblw)"/>` +
      `<rect x="${x + 0.6}" y="${y + 0.6}" width="${w - 1.2}" height="${h - 1.2}" rx=".6" fill="none" stroke="${edge}" stroke-width=".8" stroke-dasharray=".45 .3"/>` +
      word$
    );
  }
  function statsLine(p, o, T) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const ink$ = T.ink;
    const sep = `<tspan fill-opacity=".42"> · </tspan>`;
    if (ar) {
      const part = (k) =>
        `<tspan fill-opacity=".72">${E(S.stats[k])}</tspan> <tspan font-family="Manrope" font-weight="800" direction="ltr" unicode-bidi="embed">${p.stats[k]}</tspan>`;
      return `<text x="150" y="106" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="10.5" direction="rtl" fill="${ink$}">${MC.STATS.map(part).join(sep)}</text>`;
    }
    const part = (k) => `<tspan fill-opacity=".7">${k}</tspan> ${p.stats[k]}`;
    return `<text x="150" y="105" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="10.5" letter-spacing=".2" direction="ltr" style="font-variant-numeric:tabular-nums" fill="${ink$}">${MC.STATS.map(part).join(sep)}</text>`;
  }

  /* ---------- sleeve fittings: tier tab (start sleeve) and club disc (end sleeve) ---------- */
  function sleeves(p, o, T, u, thumb) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const word = S.tiers[p.tier];
    const woven = {
      woven: [C.patch, C.patchInk, "#8D99AB", `url(#${u}-weave)`],
      cream: [C.damask, C.patch, C.thread, `url(#${u}-dam)`],
      navy: [C.tunnel, C.ecru, "#C9BC98", `url(#${u}-weaveN)`],
    }[T.patch];
    let s = "";
    if (ar) {
      // Arabic: a horizontal woven tab, words upright (never rotated)
      const Fz = Math.min(9, 27 / (AR_TIER_EM[p.tier] || 3));
      const label = (fill, extra = "") =>
        `<text x="37" y="${f(150.6)}" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="${f(Fz)}" direction="rtl" fill="${fill}" ${extra}>${E(word)}</text>`;
      if (T.patch === "vinyl") s += `<g transform="rotate(1.2 37 147)">${label(T.ink)}</g>`;
      else if (T.patch === "print") s += label(C.flock, `fill-opacity=".92"`);
      else
        s +=
          `<rect x="21" y="138" width="32" height="18" rx="1.8" fill="${woven[3]}"/>` +
          `<rect x="21.6" y="138.6" width="30.8" height="16.8" rx="1.4" fill="none" stroke="${woven[2]}" stroke-width="1.1" stroke-dasharray=".45 .28"/>` +
          (thumb ? "" : label(woven[1]));
    } else {
      const em = (LAT_TIER_EM[p.tier] || 3) + 0.08 * (word.length - 1);
      const Fz = Math.min(8, 52 / em);
      const label = (fill, extra = "") =>
        `<text x="36" y="${f(167 + Fz * 0.36)}" transform="rotate(-90 36 167)" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="${f(Fz)}" letter-spacing="${f(Fz * 0.08)}" direction="ltr" fill="${fill}" ${extra}>${E(word)}</text>`;
      if (T.patch === "vinyl")
        s += thumb ? "" : `<g transform="rotate(1.2 36 167)">${label(T.ink)}</g>`;
      else if (T.patch === "print") s += thumb ? "" : label(C.flock, `fill-opacity=".92"`);
      else
        s +=
          `<rect x="27.5" y="136" width="17" height="62" rx="1.8" fill="${woven[3]}"/>` +
          `<rect x="28.1" y="136.6" width="15.8" height="60.8" rx="1.4" fill="none" stroke="${woven[2]}" stroke-width="1.1" stroke-dasharray=".45 .28"/>` +
          (thumb ? "" : label(woven[1]));
    }
    if (T.crest) {
      s +=
        `<circle cx="264" cy="158" r="12.5" fill="${woven[3]}"/>` +
        `<circle cx="264" cy="158" r="11.9" fill="none" stroke="${woven[2]}" stroke-width="1.1" stroke-dasharray=".45 .28"/>` +
        (thumb
          ? ""
          : `<g transform="translate(257.2 149.8)">${MC.crest({ w: 13.6, h: 16.3, fill: T.patch === "cream" ? C.patch : p.club.primary, sash: p.club.secondary, ring: T.patch === "cream" ? C.patch : p.club.secondary })}</g>`);
    }
    return s;
  }

  /* ---------- FOUNDER: a woven jock tag sewn into the hem, hanging below it (never upgrades) ---------- */
  function founderTag(p, o, u, thumb) {
    if (!p.founder) return "";
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const tw = ar ? 60.6 : 57.3;
    const x = 62,
      y = 369,
      h = 23,
      w = f(31 + tw + 6);
    let s =
      `<g class="x03-tag">` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.4" fill="url(#${u}-dam)"/>` +
      `<rect x="${x + 1.1}" y="${y + 1.1}" width="${f(w - 2.2)}" height="${h - 2.2}" rx="1" fill="none" stroke="${C.thread}" stroke-width=".8" stroke-dasharray="1.3 .8"/>` +
      `<path d="M${x} ${y + h - 0.6}H${f(x + w)}" stroke="#000" stroke-opacity=".14" stroke-width="1.2"/>`;
    if (!thumb) {
      s +=
        `<circle cx="${x + 11.5}" cy="${y + 11.5}" r="9" fill="${C.patch}"/>` +
        `<circle cx="${x + 11.5}" cy="${y + 11.5}" r="7.6" fill="none" stroke="${C.thread}" stroke-width=".6"/>` +
        `<text x="${x + 11.5}" y="${y + 15}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="9.4" direction="ltr" fill="${C.damask}">${String(p.founder).slice(2)}</text>` +
        (ar
          ? `<text x="${f(x + w - 5.5)}" y="${y + 14.4}" text-anchor="start" font-family="Noto Sans Arabic" font-weight="700" font-size="7.5" direction="rtl" fill="${C.patch}">${E(S.founder)} <tspan font-family="Manrope" font-weight="800">${p.founder}</tspan></text>`
          : `<text x="${x + 25.5}" y="${y + 14.2}" font-family="Manrope" font-weight="800" font-size="7.5" letter-spacing=".15" direction="ltr" fill="${C.patch}">${E(S.founderLine)}</text>`);
    }
    return s + `</g>`;
  }

  /* ---------- rail, hook, loop ---------- */
  function rail(T, u) {
    return (
      `<g class="x03-rail">` +
      `<rect class="x03-rim" x="90" y="2" width="120" height="10" rx="2.5"/>` +
      `<rect x="90" y="2" width="120" height="10" rx="2.5" fill="url(#${u}-rail)"/>` +
      (T.rail === "oak" || T.rail === "walnut"
        ? `<rect x="90" y="2" width="120" height="10" rx="2.5" filter="url(#${u}-wood)" opacity=".55"/>`
        : "") +
      `<path d="M92.5 2.9H207.5" stroke="${RAIL[T.rail].hi}" stroke-opacity=".75" stroke-width=".9" stroke-linecap="round"/>` +
      `<path d="M92 11.4H208" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>` +
      `<circle cx="97" cy="7" r="1.3" fill="#000" fill-opacity=".35"/><circle cx="203" cy="7" r="1.3" fill="#000" fill-opacity=".35"/>` +
      `</g>`
    );
  }
  function hook(T, u) {
    const H = HOOK[T.hook];
    if (T.hook === "peg")
      return (
        `<g class="x03-hook">` +
        `<rect x="145" y="11" width="10" height="5" rx="1" fill="url(#${u}-hookL)"/>` +
        `<circle class="x03-rim" cx="150" cy="22" r="10"/>` +
        `<circle cx="150" cy="22" r="10" fill="url(#${u}-peg)"/>` +
        `<circle cx="150" cy="22" r="7" fill="none" stroke="#1E140C" stroke-width=".7" stroke-opacity=".55"/>` +
        `<circle cx="150" cy="22" r="3.8" fill="none" stroke="#1E140C" stroke-width=".6" stroke-opacity=".5"/>` +
        `<ellipse cx="146.4" cy="18.2" rx="3" ry="1.6" fill="${H.hi}" fill-opacity=".55"/>` +
        `</g>`
      );
    const d =
      T.hook === "wire"
        ? "M161 6.5C161 -.5 155 -.5 155 5V30C155 42.5 140 44.5 138 34"
        : "M157 8V30C157 42.5 141 45 138.5 33.5";
    return (
      `<g class="x03-hook">` +
      (T.hook === "wire"
        ? ""
        : `<rect x="151" y="3.6" width="12" height="6.8" rx="2" fill="url(#${u}-hookL)"/><circle cx="157" cy="7" r="1.1" fill="#000" fill-opacity=".4"/>`) +
      `<path d="${d}" fill="none" stroke="url(#${u}-hookL)" stroke-width="${T.hook === "wire" ? 4.4 : 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
      (T.hook === "wire" ? "" : `<circle cx="138.6" cy="32.6" r="3.7" fill="url(#${u}-hookL)"/>`) +
      `<path d="${T.hook === "wire" ? "M153.9 8V30" : "M155.3 11V30"}" stroke="${H.hi}" stroke-width=".9" stroke-linecap="round" stroke-opacity=".8"/>` +
      `</g>`
    );
  }
  /** The hanger loop: a tape from the back collar, folded over the hook's cup (or behind the peg). */
  function loop(T) {
    const c = COLLAR[T.collar];
    const col = T.collar === "tall" ? T.rib : T.body[0];
    if (T.hook === "peg")
      return `<path d="M147.5 ${c.apex + 2}V24H152.5V${c.apex + 2}Z" fill="${col}"/>`;
    return (
      `<path d="M144.5 ${c.apex + 2}L144.5 37.6Q147 33.4 149.5 37.6L149.5 ${c.apex + 2}Z" fill="${col}"/>` +
      `<path d="M144.9 37.4Q147 34.3 149.1 37.4" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".7"/>` +
      `<path d="M144.5 44.6H149.5" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`
    );
  }

  function defs(u, T) {
    const [b0, b1, b2] = T.body;
    const R = RAIL[T.rail].g;
    const H = HOOK[T.hook].g;
    const tw = (id, base, line, op) =>
      `<pattern id="${u}-${id}" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="2.2" height="2.2" fill="${base}"/><rect width="2.2" height=".8" fill="${line}" fill-opacity="${op}"/></pattern>`;
    return (
      `<defs>` +
      `<clipPath id="${u}-clip"><path d="${outline(T)}"/></clipPath>` +
      `<linearGradient id="${u}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b0}"/><stop offset=".42" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient>` +
      `<linearGradient id="${u}-side" x1="57" x2="243" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${T.light ? "#4A3C22" : "#000"}" stop-opacity="${T.light ? 0.22 : 0.34}"/><stop offset=".16" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset=".84" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="${T.light ? "#4A3C22" : "#000"}" stop-opacity="${T.light ? 0.22 : 0.34}"/></linearGradient>` +
      `<linearGradient id="${u}-slv" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="${T.light ? 0.16 : 0.3}"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="${T.light ? 0.2 : 0.32}"/></linearGradient>` +
      `<linearGradient id="${u}-slvR" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="${T.light ? 0.16 : 0.3}"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="${T.light ? 0.2 : 0.32}"/></linearGradient>` +
      `<pattern id="${u}-piq" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".62" fill="#2C4E84" fill-opacity=".55"/><circle cx="0" cy="0" r=".35" fill="#06132A" fill-opacity=".45"/></pattern>` +
      `<pattern id="${u}-rib" width="2" height="12" patternUnits="userSpaceOnUse"><rect width="1" height="12" fill="#fff" fill-opacity=".12"/><rect x="1" width="1" height="12" fill="#000" fill-opacity=".2"/></pattern>` +
      `<pattern id="${u}-quilt" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#C9D1DA"/><path d="M0 0H5M0 0V5" stroke="#8E9AAB" stroke-width=".7"/></pattern>` +
      `<pattern id="${u}-dam" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="2" fill="${C.damask}"/><rect width="2" height=".9" fill="#7A6A48" fill-opacity=".1"/></pattern>` +
      `<pattern id="${u}-weave" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><rect width="1.6" height="1.6" fill="${C.patch}"/><rect width="1.6" height=".7" fill="#fff" fill-opacity=".08"/></pattern>` +
      `<pattern id="${u}-weaveN" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><rect width="1.6" height="1.6" fill="${C.tunnel}"/><rect width="1.6" height=".7" fill="#fff" fill-opacity=".08"/></pattern>` +
      `<pattern id="${u}-lblw" width="1.4" height="1.4" patternUnits="userSpaceOnUse"><rect width="1.4" height=".6" fill="#fff" fill-opacity=".07"/></pattern>` +
      tw("twW", C.flock, "#5A6A85", 0.14) +
      tw("twB", C.blue, "#fff", 0.1) +
      tw("twN", C.tunnel, "#fff", 0.08) +
      tw("twS", C.slate, "#fff", 0.1) +
      tw("twC", "#F7F2E4", "#8A7B58", 0.12) +
      `<linearGradient id="${u}-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${R[0]}"/><stop offset=".45" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></linearGradient>` +
      `<linearGradient id="${u}-hookL" x1="134" y1="0" x2="162" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${H[2]}"/><stop offset=".55" stop-color="${H[1]}"/><stop offset=".8" stop-color="${H[0]}"/><stop offset="1" stop-color="${H[1]}"/></linearGradient>` +
      `<radialGradient id="${u}-peg" cx=".36" cy=".32" r=".78"><stop offset="0" stop-color="#B08A66"/><stop offset=".35" stop-color="#6E4E36"/><stop offset=".8" stop-color="#3E2A1B"/><stop offset="1" stop-color="#22160D"/></radialGradient>` +
      `<filter id="${u}-wood" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9 .06" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 .62"/></filter>` +
      `<linearGradient id="${u}-gloss" x1="60" y1="220" x2="240" y2="298" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#D3DBE4"/><stop offset=".36" stop-color="#E4E9EF"/><stop offset=".43" stop-color="#FFFFFF"/><stop offset=".53" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E2E8EE"/><stop offset="1" stop-color="#CAD3DD"/></linearGradient>` +
      `<linearGradient id="${u}-tube" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.light ? "#FFF6DF" : "#9CC0FF"}" stop-opacity="${T.light ? 0.16 : 0.07}"/><stop offset="1" stop-color="${T.light ? "#FFF6DF" : "#9CC0FF"}" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-rake" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF8E8" stop-opacity=".3"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#3A2E18" stop-opacity=".22"/></linearGradient>` +
      `<linearGradient id="${u}-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#FFFBEF" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-sheen" x1="0" y1="0" x2="1" y2=".35"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      // quilted channels: each 24u channel lit +6% at the top, −10% at the bottom
      `<linearGradient id="${u}-chan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset=".35" stop-color="#fff" stop-opacity=".02"/><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient>` +
      `<pattern id="${u}-chP" x="0" y="130" width="300" height="24" patternUnits="userSpaceOnUse"><rect width="300" height="24" fill="url(#${u}-chan)"/></pattern>` +
      // fabric grain
      (T.fabric === "heather"
        ? `<filter id="${u}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".16 1.6" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.4 -1.25"/></filter>` +
          `<filter id="${u}-grainD" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".2 1.4" numOctaves="2" seed="13"/><feColorMatrix values="0 0 0 0 .05  0 0 0 0 .07  0 0 0 0 .12  0 0 0 2.4 -1.2"/></filter>`
        : T.fabric === "melton"
          ? // felt nap: noise as a height map under one raking light, kept as darkness only
            `<filter id="${u}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.25" numOctaves="2" seed="21"/><feDiffuseLighting surfaceScale="1.1" diffuseConstant="1" lighting-color="#fff"><feDistantLight azimuth="225" elevation="62"/></feDiffuseLighting><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .24  0 0 0 0 .13  -1.1 0 0 0 1"/></filter>` +
            `<filter id="${u}-grainD" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .28  0 0 0 0 .16  0 0 0 .9 -.42"/></filter>`
          : `<filter id="${u}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${T.fabric === "quilt" ? ".55 .9" : ".75"}" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 -.2"/></filter>` +
            `<filter id="${u}-grainD" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.8 .55"/></filter>`) +
      `<filter id="${u}-matte" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="8"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .58  0 0 0 0 .62  0 0 0 .7 -.25"/></filter>` +
      `<filter id="${u}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>` +
      // the press's trace: piqué flattened under the platen, feathered so it has no edge
      `<filter id="${u}-feather" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="11"/></filter>` +
      `<mask id="${u}-flat" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="420"><rect width="300" height="420" fill="#fff"/><rect x="66" y="206" width="168" height="104" rx="30" fill="#000" fill-opacity=".72" filter="url(#${u}-feather)"/></mask>` +
      // flock: fibre noise plus a 1u emboss lit from the top-start, multiplied into the white
      `<filter id="${u}-flock" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation=".9" result="b"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="1.7" numOctaves="2" seed="3" result="n"/>` +
      `<feComposite in="n" in2="b" operator="arithmetic" k2=".28" k3="1" result="h"/>` +
      `<feDiffuseLighting in="h" surfaceScale="2.2" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>` +
      `<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1=".8" k2=".4" result="m"/>` +
      `<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>` +
      `</defs>`
    );
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const T = TIER[p.tier] || TIER.PRO;
    const u = MC.uid("x03");
    const thumb = !!o.thumb;
    const out = outline(T);
    const tp = COLLAR[T.collar];
    const tierCls = `x03--${p.tier.toLowerCase()}`;
    let g = "";
    g += `<path class="x03-rim" d="${out}"/>`;
    g += `<path d="${out}" fill="url(#${u}-body)"/>`;
    g += `<g clip-path="url(#${u}-clip)">`;
    if (!thumb) {
      if (T.fabric === "pique")
        g += `<rect width="300" height="420" fill="url(#${u}-piq)"${T.flat ? ` mask="url(#${u}-flat)"` : ""}/>`;
      if (T.fabric === "heather")
        g += `<rect width="300" height="420" filter="url(#${u}-grain)" opacity=".18"/><rect width="300" height="420" filter="url(#${u}-grainD)" opacity=".2"/>`;
      else if (T.fabric === "melton")
        g += `<rect width="300" height="420" filter="url(#${u}-grainD)" opacity=".22"/><rect width="300" height="420" filter="url(#${u}-grain)" opacity=".3"/>`;
      else
        g += `<rect width="300" height="420" filter="url(#${u}-grain)" opacity=".4"/><rect width="300" height="420" filter="url(#${u}-grainD)" opacity=".45"/>`;
      if (T.flat)
        g += `<rect x="66" y="206" width="168" height="104" rx="30" fill="#fff" fill-opacity=".028" filter="url(#${u}-feather)"/>`;
    }
    // quilted channels (CHAMPION): body and sleeves below the yoke
    if (T.fabric === "quilt") {
      g += `<rect x="0" y="130" width="300" height="241" fill="url(#${u}-chP)"/>`;
      const seams = [154, 178, 202, 226, 250, 274, 298, 322, 346];
      g +=
        `<path d="${[130, ...seams].map((y) => `M0 ${y}H300`).join("")}" stroke="${T.crease}" stroke-opacity=".7" stroke-width="1.1"/>` +
        (thumb
          ? ""
          : `<path d="${[130, ...seams].map((y) => `M0 ${y + 1.1}H300`).join("")}" stroke="#fff" stroke-opacity=".3" stroke-width=".8" stroke-dasharray="1.5 1"/>`);
    }
    // drape: side shading, sleeve shading, pull folds from the loop
    g += `<rect x="57" y="0" width="186" height="420" fill="url(#${u}-side)"/>`;
    g += `<path d="M0 91.4H20C34 100 47 112 54 ${G.armpit}V300H0Z" fill="url(#${u}-slv)"/><path d="M300 91.4H280C266 100 253 112 246 ${G.armpit}V300H300Z" fill="url(#${u}-slvR)"/>`;
    if (!thumb)
      g +=
        `<g filter="url(#${u}-soft)" opacity="${T.light ? 0.55 : 0.9}"><path d="M141 62L100 132L106 136Z" fill="#000" fill-opacity=".22"/><path d="M159 62L200 132L194 136Z" fill="#000" fill-opacity=".22"/>` +
        `<path d="M147 64L124 140L130 140Z" fill="#fff" fill-opacity=".05"/><path d="M80 312Q88 352 84 382L76 382Q82 348 72 314Z" fill="#000" fill-opacity=".2"/><path d="M220 312Q212 352 216 382L224 382Q218 348 228 314Z" fill="#000" fill-opacity=".2"/></g>`;
    // armhole seams and the body's inner edge at the slits
    g += `<path d="M20 91.4C34 100 47 112 54 ${G.armpit}M280 91.4C266 100 253 112 246 ${G.armpit}" fill="none" stroke="${T.crease}" stroke-opacity=".8" stroke-width="1"/>`;
    g += `<path d="M58 ${G.armpit}V300M242 ${G.armpit}V300" stroke="#000" stroke-opacity="${T.light ? 0.16 : 0.32}" stroke-width="2"/>`;
    if (T.collar !== "crew") {
      // yoke seam (the shared avatar's seam, scaled to the coat): double-needle stitch
      g += `<path d="M19.6 113C90 125 210 125 280.4 113" fill="none" stroke="${T.crease}" stroke-width="1.1"/>`;
      if (!thumb)
        g += `<path d="M19.7 115.4C90 127.4 210 127.4 280.3 115.4" fill="none" stroke="${T.light ? C.tunnel : "#fff"}" stroke-opacity="${T.light ? 0.3 : 0.16}" stroke-width=".5" stroke-dasharray="1.6 1"/>`;
    }
    // cuffs and hem rib
    const rib = T.light ? T.rib : null;
    if (rib)
      g += `<path d="M0 290H54V300H0ZM246 290H300V300H246Z" fill="${rib}"/><rect x="57" y="371" width="186" height="11" fill="${rib}"/>`;
    g += `<path d="M0 290H54V300H0ZM246 290H300V300H246Z" fill="url(#${u}-rib)"/><path d="M0 290H54M246 290H300" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>`;
    g += `<rect x="57" y="371" width="186" height="11" fill="url(#${u}-rib)"/><path d="M57 371H243" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>`;
    // overhead tube light on the yoke; LEGEND's raking light
    g += `<rect x="0" y="0" width="300" height="140" fill="url(#${u}-tube)"/>`;
    if (T.light) g += `<rect width="300" height="420" fill="url(#${u}-rake)"/>`;
    g += `</g>`;
    // collar
    if (T.collar === "crew") {
      g += `<path d="M114 68L116.5 62Q150 55.5 183.5 62L186 68Q150 61.5 114 68Z" fill="${T.rib}"/><path d="M114 68L116.5 62Q150 55.5 183.5 62L186 68Q150 61.5 114 68Z" fill="url(#${u}-rib)"/>`;
    } else {
      const top = T.collar === "tall" ? "M113 49Q150 39 187 49" : "M116 56Q150 47 184 56";
      const lining =
        T.collar === "tall"
          ? "M113 49Q150 35.5 187 49Q150 39 113 49Z"
          : "M116 56Q150 43.5 184 56Q150 47 116 56Z";
      g += `<path d="${lining}" fill="${T.lining === "quilt" ? `url(#${u}-quilt)` : T.lining}"/>`;
      const band = `M114 68L${top.slice(1)}L186 68Q150 ${T.collar === "tall" ? 61 : 62} 114 68Z`;
      g += `<path d="${band}" fill="${T.collar === "tall" ? T.rib : T.body[0]}"/><path d="${band}" fill="url(#${u}-rib)"/>`;
    }
    // lit top edge from the overhead tube light (shoulders)
    g += `<path class="x03-lit" d="M20 91.4L114 68M186 68L280 91.4" clip-path="url(#${u}-clip)"/>`;
    if (T.piping)
      g += `<path d="M21.6 92.8L114.4 69.8M185.6 69.8L278.4 92.8" stroke="${T.light ? C.tunnel : C.slate}" stroke-width="2.2" stroke-linecap="round"/>`;
    // back-neck label and the stats line
    if (!thumb) g += neckLabel(o, T, u) + statsLine(p, o, T);
    // name and number
    g += nameMark(p, o, T, u, thumb);
    g += `<g class="x03-num">${number(p, T, u, thumb)}</g>`;
    if (T.num === "twill4")
      g += `<g clip-path="url(#${u}-clip)"><rect class="x03-sweep" x="30" y="202" width="80" height="112" fill="url(#${u}-sweep)"/></g>`;
    if (!thumb)
      g += `<g clip-path="url(#${u}-clip)"><rect class="x03-sheen" x="12" y="0" width="276" height="420" fill="url(#${u}-sheen)"/></g>`;
    // hem meta: country code, serial, season
    if (!thumb)
      g +=
        `<text x="150" y="${p.founder ? 359 : 361}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="7.6" letter-spacing=".5" direction="ltr" fill="${T.meta}">` +
        `${E(p.country.code || "MAR")}<tspan fill-opacity=".5"> · </tspan>${E(p.id)}<tspan fill-opacity=".5"> · </tspan>${E(p.season)}</text>`;
    g += sleeves(p, o, T, u, thumb);
    g += founderTag(p, o, u, thumb);

    const cls = `x03 x03-card ${tierCls}${thumb ? " x03--thumb" : ""}${o.motion ? " x03--motion" : ""}`;
    const peg = T.hook === "peg";
    return (
      `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${E(MC.label(p, o))}" data-tier="${p.tier}">` +
      `<svg class="x03-svg" viewBox="0 0 300 420" style="direction:ltr" aria-hidden="true" focusable="false">` +
      defs(u, T) +
      (o.rail === false ? "" : rail(T, u)) +
      (peg ? `<g class="x03-swing">${loop(T)}</g>${hook(T, u)}` : hook(T, u)) +
      `<g class="x03-swing">${peg ? "" : loop(T)}<g class="x03-jacket">${g}</g><g class="x03-press" aria-hidden="true"></g></g>` +
      `</svg></div>`
    );
  }

  /* ---------- token (44–80px, viewBox 60×80) and mini (24–32px, viewBox 36×32) ---------- */
  const TOK = {
    collar: {
      crew: "L24.2 15.6Q30 13.6 35.8 15.6",
      stand: "L24 14.2Q30 12 36 14.2",
      tall: "L23.6 12.6Q30 10.4 36.4 12.6",
    },
    band: {
      crew: "M23.6 17.6L24.2 15.6Q30 13.6 35.8 15.6L36.4 17.6Q30 15.8 23.6 17.6Z",
      stand: "M23.6 17.6L24 14.2Q30 12 36 14.2L36.4 17.6Q30 15.6 23.6 17.6Z",
      tall: "M23.6 17.6L23.6 12.6Q30 10.4 36.4 12.6L36.4 17.6Q30 15.4 23.6 17.6Z",
    },
  };
  const tokOutline = (collar) =>
    `M23.6 17.6${TOK.collar[collar]}L36.4 17.6L55.6 22.4L56.8 62L49.5 62L49.5 29.6Q48.5 27.2 47.5 29.6L47.5 76L12.5 76L12.5 29.6Q11.5 27.2 10.5 29.6L10.5 62L3.2 62L4.4 22.4Z`;
  const MINI =
    "M13.4 6.6L13.8 4.8Q18 3.4 22.2 4.8L22.6 6.6L35.2 9.74L35.4 24.4L29.2 24.4L29.2 31.4L6.8 31.4L6.8 24.4L.6 24.4L.8 9.74Z";

  function tokenNum(n, T, F, cx, base, thin, mini) {
    const k = ink(n);
    const x0 = cx - (k.W * F) / 2 - k.L * F;
    const t = (a, dx = 0) =>
      `<text x="${f(x0 + dx)}" y="${base}" font-family="Changa" font-weight="800" font-size="${F}" direction="ltr" stroke-linejoin="round" ${a}>${n}</text>`;
    const sc = F / 24;
    switch (T.num) {
      case "vinyl":
        return `<g transform="rotate(1.5 ${cx} ${base - 8})">${t(`fill="#E3E5E1"`)}</g>`;
      case "gloss":
        return t(`fill="#EEF2F6"`);
      case "flock":
        return (
          t(
            `fill="${C.blue}" stroke="${C.blue}" stroke-width="${f(1.3 * sc)}" transform="translate(${f(0.9 * sc)} ${f(0.9 * sc)})"`,
            -0.4 * sc,
          ) + t(`fill="${C.flock}"`, -0.4 * sc)
        );
      case "twill3":
        return (
          t(
            `fill="${C.tunnel}" stroke="${C.tunnel}" stroke-width="${f(1.8 * sc)}" transform="translate(${f(1.8 * sc)} ${f(1.8 * sc)})"`,
            -0.9 * sc,
          ) +
          t(
            `fill="${C.blue}" stroke="${C.blue}" stroke-width="${f(1 * sc)}" transform="translate(${f(0.9 * sc)} ${f(0.9 * sc)})"`,
            -0.9 * sc,
          ) +
          t(`fill="${C.flock}"`, -0.9 * sc)
        );
      default:
        return (
          (thin
            ? ""
            : t(
                `fill="#F7F2E4" stroke="#F7F2E4" stroke-width="${f(2.4 * sc)}" transform="translate(${f(2.7 * sc)} ${f(2.7 * sc)})"`,
                -1.3 * sc,
              )) +
          t(
            `fill="${C.slate}" stroke="${C.slate}" stroke-width="${f(1.7 * sc)}" transform="translate(${f(1.8 * sc)} ${f(1.8 * sc)})"`,
            -1.3 * sc,
          ) +
          (mini
            ? ""
            : t(
                `fill="${C.blue}" stroke="${C.blue}" stroke-width="${f(0.9 * sc)}" transform="translate(${f(0.9 * sc)} ${f(0.9 * sc)})"`,
                -1.3 * sc,
              )) +
          t(`fill="${C.tunnel}"`, -1.3 * sc)
        );
    }
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const T = TIER[p.tier] || TIER.PRO;
    const n = String(p.ovr);
    const legend = p.tier === "LEGEND";
    const railC = RAIL[T.rail].tok;
    const hookC = HOOK[T.hook].tok;
    const body = legend ? C.ecru : T.body[1];
    const tierCls = `x03--${p.tier.toLowerCase()}`;
    if (o.mini || size <= 32) {
      // mini: a 2px rail, the wide shoulder wedge, the 84 under the collar; hook only at 32px
      const w = (size * 36) / 32;
      const rh = f((2 * 32) / size);
      const F = 13.6;
      return (
        `<span class="x03 x03-tok x03-mini ${tierCls}" style="--h:${size}px">` +
        `<svg viewBox="0 0 36 32" width="${f(w)}" height="${size}" style="direction:ltr;overflow:visible" aria-hidden="true" focusable="false">` +
        `<rect x="3" y="0" width="30" height="${rh}" rx="${f(rh / 2)}" fill="${railC}"/>` +
        (size >= 30
          ? `<path d="M19.8 ${rh}V3.4C19.8 5.6 16.9 6.1 16.4 4.1" fill="none" stroke="${hookC}" stroke-width="1.5" stroke-linecap="round"/>`
          : "") +
        `<path class="x03-rim" d="${MINI}"/>` +
        `<path d="${MINI}" fill="${body}"/>` +
        `<path d="M13.4 6.6L13.8 4.8Q18 3.4 22.2 4.8L22.6 6.6Q18 5.4 13.4 6.6Z" fill="${legend ? T.rib : T.body[0]}"/>` +
        `<path d="M6.8 12.4V24.4M29.2 12.4V24.4" stroke="${legend ? "#A99E83" : T.crease}" stroke-width=".9"/>` +
        tokenNum(n, T, F, 18, 20.8, true, true) +
        (p.founder
          ? `<rect x="7.4" y="30.4" width="4.2" height="1.8" rx=".4" fill="${legend ? C.tunnel : C.damask}"/>`
          : "") +
        `</svg></span>`
      );
    }
    const w = (size * 60) / 80;
    const thin = size < 56;
    const out = tokOutline(T.collar);
    const showRail = o.rail !== false;
    let s = "";
    if (showRail)
      s += `<rect class="x03-rim" x="6" y="0" width="48" height="4" rx="1"/><rect x="6" y="0" width="48" height="4" rx="1" fill="${railC}"/><path d="M7 .7H53" stroke="${RAIL[T.rail].hi}" stroke-opacity=".7" stroke-width=".6"/>`;
    if (T.hook === "peg")
      s += `<rect x="28.4" y="3" width="3.2" height="2.4" fill="${hookC}"/><circle class="x03-rim" cx="30" cy="8" r="4.2"/><circle cx="30" cy="8" r="4.2" fill="${hookC}"/><circle cx="28.8" cy="6.8" r="1.3" fill="#A07E5E"/>`;
    else
      s +=
        (T.hook === "wire"
          ? `<path d="M36.6 3.4C36.6 .6 33.5 .6 33.5 2.6V7.6C33.5 12.6 27.6 13.6 26.3 9.4" fill="none" stroke="${hookC}" stroke-width="3" stroke-linecap="round"/>`
          : `<rect x="31.2" y=".6" width="4.6" height="3" rx="1" fill="${hookC}"/><path d="M33.5 1.8V7.6C33.5 12.6 27.6 13.6 26.3 9.4" fill="none" stroke="${hookC}" stroke-width="3" stroke-linecap="round"/><circle cx="26.4" cy="9.2" r="1.7" fill="${hookC}"/>`) +
        `<path d="M29 17L29 11.2Q30.4 9.4 31.8 11.2L31.8 17Z" fill="${legend ? T.rib : T.body[0]}"/>`;
    s += `<path class="x03-rim" d="${out}"/>`;
    s += `<path d="${out}" fill="${body}"/>`;
    s += `<path d="M3.2 22.4L10.5 23V62H3.2ZM56.8 22.4L49.5 23V62H56.8Z" fill="#000" fill-opacity="${legend ? 0.08 : 0.14}"/>`;
    if (T.fabric === "quilt")
      s += `<path d="M3.6 37H56.4M3.6 49H56.4M12.5 67H47.5" stroke="#0A1A36" stroke-width="${thin ? 1 : 0.8}"/><path d="M3.6 37.9H56.4M3.6 49.9H56.4M12.5 67.9H47.5" stroke="#fff" stroke-opacity=".22" stroke-width=".5"/>`;
    s += `<path d="${TOK.band[T.collar]}" fill="${legend ? T.rib : T.body[0]}"/>`;
    if (T.piping && !thin)
      s += `<path d="M5.4 23.2L23.4 18.7M36.6 18.7L54.6 23.2" stroke="${legend ? C.tunnel : C.slate}" stroke-width="1"/>`;
    s += `<path d="M3.4 59.6H10.5M49.5 59.6H56.6M12.5 73.4H47.5" stroke="${legend ? T.rib : "#000"}" stroke-opacity="${legend ? 0.9 : 0.3}" stroke-width="${legend ? 1.4 : thin ? 1.1 : 0.8}"/>`;
    s += tokenNum(n, T, 23.5, 30, 56.5, thin);
    if (p.founder)
      s += `<rect x="14" y="72.6" width="11" height="6.8" rx=".8" fill="${C.damask}"/>${thin ? "" : `<rect x="14.6" y="73.2" width="9.8" height="5.6" rx=".5" fill="none" stroke="${C.thread}" stroke-width=".5" stroke-dasharray=".9 .5"/>`}`;
    return (
      `<span class="x03 x03-tok ${tierCls}" style="--h:${size}px">` +
      `<svg viewBox="0 0 60 80" width="${f(w)}" height="${size}" style="direction:ltr" aria-hidden="true" focusable="false">${s}</svg></span>`
    );
  }

  /* ---------- compact card: one peg on the dressing-room rail ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const tierCls = `x03-chip--${p.tier.toLowerCase()}`;
    return (
      `<div class="x03 x03-row${o.me ? " is-me" : ""}${o.me && o.motion ? " x03--motion" : ""}" dir="${S.dir}">` +
      `<span class="x03-row-rank" aria-label="${E(S.rank)} ${o.rank}">${MC.ltr(o.rank)}</span>` +
      `<span class="x03-row-tok">${token(p, { ...o, size: 54, mini: false, rail: false })}</span>` +
      `<span class="x03-row-id"><b class="x03-row-name">${E(MC.nameOf(p, o))}</b>` +
      `<span class="x03-row-sub"><i class="x03-chip ${tierCls}">${E(S.tiers[p.tier])}</i><bdi dir="ltr" class="x03-row-ovr">${p.ovr} <small>${S.ovr}</small></bdi>` +
      (p.founder
        ? `<span class="x03-chip x03-chip--founder" title="${E(S.founderLine)}" aria-label="${E(S.founderLine)}">${MC.ltr(p.founder)}</span>`
        : "") +
      `</span></span>` +
      `<span class="x03-row-pts"><b>${MC.ltr(o.pts)}</b><small>${E(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- the shared figure as a duotone halftone (the same back view, screened) ---------- */
  // Returned as a data: URI so the frame crops it as a background (no DOM outside the frame).
  function halftoneFigure(tilt) {
    const A = MC.AVATAR;
    const hood = !!A.hood; // the shared figure wears its hood up by default
    const parts = hood
      ? [A.torso, A.collar, A.hood]
      : [A.torso, A.collar, A.neck, A.ears, A.head, A.hair];
    const radii = [1.9, 1.68, 1.44, 1.2, 0.98, 0.76, 0.56, 0.36, 0.2];
    let pats = "";
    let bands = "";
    radii.forEach((r, i) => {
      pats += `<pattern id="h${i}" width="4.4" height="4.4" patternUnits="userSpaceOnUse"><circle cx="2.2" cy="2.2" r="${r}" fill="#8FB0E4"/></pattern>`;
      bands += `<rect x="-120" y="${-40 + i * 34}" width="440" height="${i === radii.length - 1 ? 200 : 34}" fill="url(#h${i})"/>`;
    });
    const rim = hood ? [A.torso, A.hood] : [A.torso, A.hair, A.ears];
    const fills = hood
      ? `<path d="${A.torso}" fill="#14223A"/><path d="${A.collar}" fill="#1A2B48"/><path d="${A.hood}" fill="#182842"/>`
      : `<path d="${A.torso}" fill="#14223A"/><path d="${A.collar}" fill="#1A2B48"/><path d="${A.neck}" fill="#22324F"/><path d="${A.ears}" fill="#22324F"/><path d="${A.head}" fill="#22324F"/><path d="${A.hair}" fill="#0B1424"/>`;
    const seams =
      `<path d="${A.seam}"/>` + (hood ? `<path d="${A.hoodSeam}"/><path d="${A.hoodRim}"/>` : "");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 240 260" width="240" height="260">` +
      `<defs><clipPath id="fig">${parts.map((d) => `<path d="${d}"/>`).join("")}</clipPath>${pats}</defs>` +
      `<g transform="rotate(${tilt} 100 240)">` +
      `<g fill="none" stroke="#8FB0E4" stroke-width="3.2" stroke-linejoin="round" opacity=".95">${rim.map((d) => `<path d="${d}"/>`).join("")}</g>` +
      fills +
      `<g clip-path="url(#fig)"><g transform="rotate(45 100 120)">${bands}</g></g>` +
      `<g fill="none" stroke="#8FB0E4" stroke-opacity=".55" stroke-width="2">${seams}</g>` +
      `</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /* ---------- share: "the dressing room", 360×640 ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid("x03s");
    const T = TIER[p.tier] || TIER.PRO;
    const jx = ar ? 164 : 196; // the jacket's hook, toward the end side
    const hooks = [jx - 132, jx, jx + 132];
    const bg =
      `<svg class="x03-share-bg" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false">` +
      `<defs>` +
      `<filter id="${u}-plaster" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="4" seed="17"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .38  0 0 0 0 .3  0 0 0 1.3 -.55"/></filter>` +
      `<filter id="${u}-lime" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .27  0 0 0 0 .2  0 0 0 .9 -.38"/></filter>` +
      `<filter id="${u}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9 .06" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 .62"/></filter>` +
      `<filter id="${u}-glow" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="5"/></filter>` +
      `<linearGradient id="${u}-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBF0" stop-opacity=".18"/><stop offset=".55" stop-color="#FFFBF0" stop-opacity=".07"/><stop offset="1" stop-color="#FFFBF0" stop-opacity="0"/></linearGradient>` +
      `<radialGradient id="${u}-vig" cx="${jx}" cy="150" r="380" gradientUnits="userSpaceOnUse"><stop offset=".35" stop-color="#2A2416" stop-opacity="0"/><stop offset="1" stop-color="#2A2416" stop-opacity=".34"/></radialGradient>` +
      `<linearGradient id="${u}-dado" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A586C"/><stop offset=".08" stop-color="#3D4A5C"/><stop offset="1" stop-color="#2A3442"/></linearGradient>` +
      `<linearGradient id="${u}-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9A7148"/><stop offset=".4" stop-color="#7A5636"/><stop offset="1" stop-color="#4A321E"/></linearGradient>` +
      `<linearGradient id="${u}-brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7E5F31"/><stop offset=".55" stop-color="#C2A061"/><stop offset=".8" stop-color="#EBD9AC"/><stop offset="1" stop-color="#C2A061"/></linearGradient>` +
      `</defs>` +
      // limewash above, gloss dado below
      `<rect width="360" height="300" fill="#D8D2C3"/>` +
      `<rect width="360" height="300" filter="url(#${u}-plaster)" opacity=".55"/>` +
      `<rect width="360" height="300" filter="url(#${u}-lime)" opacity=".5"/>` +
      `<rect y="300" width="360" height="340" fill="url(#${u}-dado)"/>` +
      `<path d="M0 306.5H360" stroke="#fff" stroke-opacity=".16" stroke-width="3"/><path d="M0 330H360" stroke="#fff" stroke-opacity=".05" stroke-width="10"/>` +
      `<path d="M0 301H360" stroke="#1E2836" stroke-width="2"/>` +
      `<rect width="360" height="640" fill="url(#${u}-vig)"/>` +
      // the tube light and its cone
      `<path d="M${jx - 62} 46H${jx + 62}L${jx + 200} 640H${jx - 200}Z" fill="url(#${u}-cone)"/>` +
      `<rect x="${jx - 64}" y="36" width="128" height="9" rx="4.5" fill="#FFF6DE" filter="url(#${u}-glow)" opacity=".9"/>` +
      `<rect x="${jx - 60}" y="33" width="120" height="7" rx="2" fill="#3A3F48"/>` +
      `<rect x="${jx - 57}" y="38.5" width="114" height="4.6" rx="2.3" fill="#FFFDF6"/>` +
      // the hook rail: three identical hooks
      `<rect x="-4" y="90" width="368" height="16" fill="url(#${u}-wood)"/>` +
      `<rect x="-4" y="90" width="368" height="16" filter="url(#${u}-grain)" opacity=".6"/>` +
      `<path d="M-4 90.6H364" stroke="#C9A57E" stroke-opacity=".8" stroke-width="1.2"/>` +
      `<path d="M-4 110H364" stroke="#3A2E1E" stroke-opacity=".28" stroke-width="8"/>` +
      hooks
        .map((x) => {
          const s = 248 / 300;
          const tx = x - 157 * s + 0.0;
          return `<g transform="translate(${f(tx)} 90) scale(${f(s)})"><rect x="151" y="3.6" width="12" height="6.8" rx="2" fill="url(#${u}-brass)"/><path d="M157 8V30C157 42.5 141 45 138.5 33.5" fill="none" stroke="url(#${u}-brass)" stroke-width="6" stroke-linecap="round"/><circle cx="138.6" cy="32.6" r="3.7" fill="url(#${u}-brass)"/><path d="M155.3 11V30" stroke="#F8EDCB" stroke-width=".9" stroke-opacity=".8"/></g>`;
        })
        .join("") +
      `</svg>`;
    const cap =
      `<div class="x03-share-cap">` +
      `<span class="x03-share-handle">${MC.ltr("@ali")}</span>` +
      `<b class="x03-share-name">${E(MC.nameOf(p, o))}</b>` +
      `<span class="x03-share-line"><i class="x03-chip x03-chip--${p.tier.toLowerCase()}">${E(S.tiers[p.tier])}</i><bdi dir="ltr" class="x03-share-ovr">${p.ovr} <small>${S.ovr}</small></bdi></span>` +
      `<span class="x03-share-meta">${MC.ltr(p.id)}<span aria-hidden="true">·</span>${MC.ltr(p.season)}<span aria-hidden="true">·</span>${ar ? "مثال" : "Sample"}</span>` +
      `</div>`;
    return (
      `<div class="x03 x03-share" dir="${S.dir}" role="img" aria-label="${E(MC.label(p, o))}">` +
      bg +
      `<div class="x03-share-logo">${MC.logo("wordmark", { variant: "color", label: false })}</div>` +
      `<div class="x03-share-jacket" style="left:${f(jx - 157 * (248 / 300))}px">${full(p, { ...o, thumb: false, motion: false, rail: false })}</div>` +
      `<div class="x03-share-fig" aria-hidden="true" style="background-image:${halftoneFigure(ar ? -3 : 3).replace(/"/g, "&quot;")}"></div>` +
      cap +
      `</div>`
    );
  }

  /* ---------- interaction: tap to swing, pointer for sheen, long-press to press and peel ---------- */
  function mount(el, o = {}) {
    if (!el || !el.classList || !el.classList.contains("x03-card")) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const svg = el.querySelector("svg");
    const swings = el.querySelectorAll(".x03-swing");
    const sheen = el.querySelector(".x03-sheen");
    const press = el.querySelector(".x03-press");
    const numG = el.querySelector(".x03-num");
    if (!svg || !swings.length) return;
    const buzz = (pat) => {
      try {
        if (navigator.vibrate) navigator.vibrate(pat);
      } catch (e) {}
    };
    const doSwing = () => {
      swings.forEach((s) => s.classList.remove("x03-swinging"));
      void el.getBoundingClientRect();
      swings.forEach((s) => s.classList.add("x03-swinging"));
    };
    el.addEventListener("pointermove", (e) => {
      if (!sheen) return;
      const r = el.getBoundingClientRect();
      const k = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const gr = el.querySelector("linearGradient[id$='-sheen']");
      if (gr) gr.setAttribute("gradientTransform", `translate(${(k * 0.18).toFixed(3)} 0)`);
    });
    // press: a dark platen comes down, holds 1.2s, lifts; then a carrier film to peel
    let timer = null,
      startX = 0,
      startY = 0,
      moved = false,
      pressing = false,
      film = null;
    const NS = "http://www.w3.org/2000/svg";
    const x0 = 46,
      y0 = 202,
      x1 = 254,
      y1 = 310;
    const fid = MC.uid("x03f");
    function showFilm() {
      if (!press) return;
      press.innerHTML = "";
      film = document.createElementNS(NS, "g");
      film.setAttribute("class", "x03-film");
      film.innerHTML =
        `<clipPath id="${fid}"><polygon class="x03-film-cut" points="${x0},${y0} ${x1},${y0} ${x1},${y1} ${x0},${y1}"/></clipPath>` +
        `<g clip-path="url(#${fid})"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="#E9F1FF" fill-opacity=".3"/>` +
        `<g class="x03-film-mirror" transform="translate(300 0) scale(-1 1)" opacity=".45"></g>` +
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/></g>` +
        `<path class="x03-film-flap" d="" fill="#F4F8FF" fill-opacity=".8"/>` +
        `<circle class="x03-film-grip" cx="${x0 + 6}" cy="${y1 - 6}" r="5" fill="#fff" fill-opacity=".55"/>`;
      const mirror = film.querySelector(".x03-film-mirror");
      if (numG && mirror) {
        numG.querySelectorAll("text").forEach((t) => {
          const c = t.cloneNode(true);
          c.removeAttribute("filter");
          c.setAttribute("fill", "#fff");
          c.removeAttribute("stroke");
          mirror.appendChild(c);
        });
      }
      press.appendChild(film);
    }
    function peel(d) {
      if (!film) return;
      const cut = film.querySelector(".x03-film-cut");
      const flap = film.querySelector(".x03-film-flap");
      const grip = film.querySelector(".x03-film-grip");
      if (cut)
        cut.setAttribute(
          "points",
          `${x0},${y0} ${x1},${y0} ${x1},${y1} ${x0 + d},${y1} ${x0},${y1 - d}`,
        );
      if (flap) flap.setAttribute("d", `M${x0} ${y1 - d}L${x0 + d} ${y1}L${x0 + d} ${y1 - d}Z`);
      if (grip) grip.setAttribute("opacity", "0");
      if (d > 0.6 * (x1 - x0)) {
        buzz(18);
        film.classList.add("x03-film-gone");
        const fl = film;
        film = null;
        setTimeout(() => fl.remove(), 260);
        el.classList.remove("x03--revealed");
        void el.getBoundingClientRect();
        el.classList.add("x03--revealed");
      }
    }
    el.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      moved = false;
      if (film) {
        pressing = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch (err) {}
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        el.classList.add("x03--pressing");
        buzz([20, 60, 20, 60, 20, 60, 30]);
        setTimeout(() => {
          el.classList.remove("x03--pressing");
          el.classList.add("x03--lifted");
          buzz(25);
          setTimeout(() => el.classList.remove("x03--lifted"), 400);
          showFilm();
        }, 1200);
      }, 1200);
    });
    el.addEventListener("pointermove", (e) => {
      const dx = e.clientX - startX,
        dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (timer && moved) {
        clearTimeout(timer);
        timer = null;
      }
      if (pressing && film) {
        const r = svg.getBoundingClientRect();
        const s = 300 / r.width;
        peel(Math.max(0, (dx - dy) * s * 0.7));
      }
    });
    const end = () => {
      const wasTap = timer && !moved;
      if (timer) clearTimeout(timer);
      timer = null;
      pressing = false;
      if (wasTap && !film) doSwing();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  MC.register({
    id: "x03",
    cut: true,
    cutReason:
      "At 24px the jacket reads as the shirt the Fantasy squad already uses for players, and Pépites already puts a rank number on a shirt back. Its press-and-peel ritual also held the number back behind a gesture, which reads as a scratch card.",
    cutReasonAr:
      "عند 24 بكسل تُقرأ السترة كالقميص الذي تستخدمه تشكيلة الفانتازي للاعبين أصلًا، وقسم Pépites يضع رقم الترتيب على ظهر القميص. كما أن حركة الكبس والنزع كانت تحجب الرقم، فتبدو كبطاقة خدش.",
    n: 3,
    slug: "03",
    name: "Flocage",
    nameAr: "الرقم على الظهر",
    category: "safe",
    philosophy:
      "Your card is your own bench coat hanging on the dressing-room rail, and the only thing that can press a new number onto its back is your season.",
    philosophyAr:
      "بطاقتك هي معطفك معلّقًا على مشجب غرفة الملابس، ولا يطبع رقمًا جديدًا على ظهره إلا أداؤك في الموسم.",
    idea: [
      "The card is a garment, not a rectangle: the manager's own long bench coat, hung by its loop from a hook on the dressing-room rail, back to you. It joins two rituals Moroccan fans already have: having a name and number heat-pressed onto a replica at the kit shop, and the matchday photo of shirts waiting on their hooks.",
      "On BotolaGO you cannot choose the number. The press prints '84 OVR' as one run where a squad number would go, so it never reads as a shirt number. ALI sits above it. A woven back-neck label says MANAGER. The four decision stats are one printed line across the yoke. MAR, the BOT serial and the season are printed by the hem. The tier is a woven sleeve tab, the club is a woven disc on the other sleeve, and FOUNDER 2026 is a jock tag hanging below the hem.",
      "The outline is the object: a rail bar and a J-hook on top, a small collar, straight 14° shoulders, two sleeves hanging free of the body, and a coat-length hem that steps in 82 units below the cuffs. No football shirt has that shape, so it cannot be mistaken for the app's player shirts.",
      "The tier changes the garment itself, then how the number is made: a heather cotton top with matte iron-on vinyl, a piqué jacket with glossy vinyl, the same jacket with flock over a Logo Blue layer, a channel-quilted coat with three stitched twill layers, and an ecru melton coat with four cut layers on a turned walnut peg.",
    ],
    belonging: [
      "Every kid has picked a 10 or a 7 for a replica. Here the number on your back is earned, so 'j'ai 84 dans le dos' is a sentence people will actually say, and a friend's 78 is visibly less cloth.",
      "Each tier is a different coat, and the number is built differently on each one, so a CHAMPION's quilted coat next to a PRO's piqué reads across the table without a legend. LEGEND is the only light coat in the league: one ecru coat on a rail of navy ones.",
      "A league becomes a dressing room: every manager's coat on its hook, in rank order, with your own peg lit. Screenshotting your row is screenshotting your coat on the rail.",
      "The founder tag is sewn in the season you joined and never changes, so years later it still says where you started.",
    ],
    founderMark: [
      "FOUNDER 2026 is a woven jock tag, the authenticity label of a match shirt, sewn into the hem at the bottom-start corner and hanging below it. It changes the outline itself, so a founder's coat has a different silhouette from everyone else's, even painted as one solid shape.",
      "Cream damask with a twill weave and a stitched brass-thread border, woven in navy: one line, FOUNDER 2026, beside a roundel carrying '26'. It is identical on the heather top and on the melton coat, because it records when you arrived, not how good you are.",
      "Later cohorts get a flat tag sewn inside the hem, invisible from outside. At 24–80px the founder mark survives as a cream nub hanging below the hem corner.",
    ],
    small: [
      "44–80px: the outline alone, in flat fills: a rail bar across the top, a J-hook (a turned peg at LEGEND), sloped shoulders, two sleeves with a slit between them and the body, and the long stepped hem, with the 84 on the back. The tier is the cloth and the rail: grey heather on a painted rail, navy on steel, navy on oak with a brass hook, navy with three quilt channels, and an ecru coat with a navy 84 on walnut.",
      "24–32px: a 2px rail line, the wide shoulder wedge and the 84 under the collar. The hook stays at 32px and drops below. The body colour carries the tier (heather, navy, ecru), the number's layers carry the rest, and the founder nub stays at the hem corner.",
      "On the dark app ground every size carries a 1px #737B86 rim so the navy never dissolves into the page; on the light ground the rim drops and a soft wall shadow takes over, except on the ecru LEGEND coat, which keeps a darker felt edge.",
    ],
    rtl: [
      "The coat is an object, so it never mirrors: hook, sleeve tab, club disc and founder tag stay where they are, and the light still comes from the top-left.",
      "The text on it changes. علي is set in Changa 800 at the Latin cap height with room for its descender. The stats line reads right to left from القائد, with the values kept left-to-right. The back-neck label says مدرب. The tier tab turns horizontal so the Arabic word stays upright, and the founder line is woven as عضو مؤسس 2026. No tracking on Arabic anywhere; serials, seasons and the 84 stay left-to-right.",
      "Rows and the share image mirror their layout (rank, caption and figure swap sides) while the coat inside them stays unmirrored.",
    ],
    tiers: {
      HOMA: "A heather cotton training top with a crew neck, hung from a plain wire S-hook on a painted rail. One layer of matte iron-on vinyl set 1.5° off by hand, with the top corner of the last figure starting to lift. The tier word is ironed straight onto the sleeve: no patches, no piping, no crest.",
      STADE:
        "A navy piqué bench jacket with a stand-up collar on a steel hook and a galvanised rail. Glossy heat-transfer vinyl with one specular streak (one clean layer), and around it a soft zone where the platen flattened the piqué. The tier is printed on the sleeve.",
      PRO: "The same jacket on an oak rail with a brass hook, slate club piping along the shoulders, a woven navy sleeve tab and a woven club disc. The number is matte flock (fibre grain, a soft emboss) over a Logo Blue twill layer: two layers.",
      CHAMPION:
        "A channel-quilted coat: horizontal channels every 24 units, each lit at the top and shaded at the bottom, so the sleeves and lower body bulge at every seam and the outline itself ripples. Tackle twill in three layers (white over Logo Blue over Tunnel Navy), each with a satin-stitch edge, a quilted lining at the collar and a cream damask sleeve tab.",
      LEGEND:
        "An ecru melton wool coat with a navy rib collar, cuffs and hem: the only light coat in the league. It hangs from a turned walnut peg on a walnut rail, which changes the top of the silhouette. The number is four cut layers stacked by hard offsets (a Tunnel Navy face over Logo Blue, club slate and cream), each satin-stitched, under one raking light. No metal and no gold anywhere.",
    },
    legend: [
      "The press. The screen dims to the dressing room. A dark platen comes down over the coat with a contact tick and holds for 1.2s while four short haptic pulses ramp, then lifts with a release thunk.",
      "The carrier film is still on, glossy, showing the number mirrored. You peel it yourself from the bottom-start corner; it curls under the finger and tears free at 60% of its travel.",
      "Underneath, the four-layer number on the ecru coat catches one raking light that sweeps across the back once, so the stacked layers seem to move. It can be replayed; under reduced motion it is a 180ms fade to the finished coat. (In the lab: tap the detail card to swing it on its hook, hold 1.2s to press, then drag the bottom-left corner to peel.)",
    ],
    advantages: [
      "Understood in a second by anyone who has had a shirt printed; it needs no explanation of what a 'card' is.",
      "The back view is faceless by design and neutral on gender and skin, which also settles the avatar question.",
      "The outline (rail, hook, free-hanging sleeves, coat-length stepped hem, founder tag) belongs to nobody else in fantasy football and holds as a solid shape at 44px on both grounds.",
      "Five different garments, not five colours: grey heather, navy piqué twice, a quilted coat whose outline ripples, and the one ecru coat. LEGEND is visible across a whole leaderboard at a glance.",
      "The press is the strongest ritual in the set and maps exactly onto the moment that matters: 'your OVR changed'.",
    ],
    risks: [
      "Shirt grammar is close to the app's own Pépites shirt (name above, big number below). The rail, hook, long sleeves, 'OVR' printed in the run and the MANAGER label are what keep it a manager's coat; dropping any of them pulls it back toward a squad shirt.",
      "Managers do not wear numbers. The first time, it needs one line of copy ('the press prints your OVR').",
      "'Flocage' as the word teenagers use for kit printing in Morocco is an assumption that needs checking with real users.",
      "At 24px the hook goes and the shape is a wedge with a number: recognisable to someone who knows it, generic to someone who does not.",
      "The stats line is 10.5 units: readable from about 300px wide, texture at the 200px grid. The founder line is 7.5 units, a detail rather than a headline.",
    ],
    gridWidth: 236,
    detailWidth: 380,
    full,
    token,
    row,
    share,
    mount,
  });
})();
