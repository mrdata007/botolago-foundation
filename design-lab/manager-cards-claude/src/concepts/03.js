/* 03 FLOCAGE — the manager's own bench jacket, hung on a dressing-room hook,
   its back to you. The press prints the OVR where a squad number goes; the
   tier is how the number is made (1, 1, 2, 3, then 4 cut layers). */
(function () {
  const MC = window.MC;

  /* ---------- measured type metrics (Chromium canvas, Changa 800, per 1000 em) ---------- */
  // [advance, ink left, ink right]: Changa digits are proportional, so the OVR is centred by its ink.
  const DIG = {
    0: [675, 31, 641], 1: [535, 0, 516], 2: [595, 31, 563], 3: [556, 0, 531], 4: [627, 0, 609],
    5: [589, 31, 563], 6: [615, 31, 594], 7: [500, 0, 484], 8: [616, 31, 594], 9: [615, 31, 594],
  };
  const CAPS = {
    A: 641, B: 592, C: 510, D: 655, E: 520, F: 470, G: 575, H: 650, I: 300, J: 391, K: 618, L: 445, M: 811,
    N: 675, O: 660, P: 590, Q: 650, R: 625, S: 577, T: 490, U: 634, V: 621, W: 929, X: 630, Y: 580, Z: 589, " ": 200,
  };
  /** x shift that puts the ink (not the advance box) of a figure string on the centre line. */
  const inkShift = (n, F) => {
    let adv = 0, L = null, R = 0;
    for (const ch of String(n)) {
      const d = DIG[ch] || DIG[0];
      if (L === null) L = adv + d[1];
      R = adv + d[2];
      adv += d[0];
    }
    return ((adv / 2 - (L + R) / 2) / 1000) * F;
  };
  const inkWidth = (n) => {
    let adv = 0, L = null, R = 0;
    for (const ch of String(n)) {
      const d = DIG[ch] || DIG[0];
      if (L === null) L = adv + d[1];
      R = adv + d[2];
      adv += d[0];
    }
    return (R - L) / 1000;
  };
  /** Name size: 30u, shrinking to fit 168u (ABDELKARIM lands at ~22u). */
  const nameSize = (name, ar) => {
    const em = ar ? [...name].length * 0.62 : [...name].reduce((a, c) => a + (CAPS[c] || 600), 0) / 1000 + 0.04 * (name.length - 1);
    return Math.max(18, Math.min(30, 168 / Math.max(em, 0.1)));
  };
  const E = MC.esc;

  /* ---------- palette ---------- */
  const C = {
    flock: "#F3F5F8",
    blue: "#0151FC",
    tunnel: "#001C49",
    slate: "#5A667D", // neutral club placeholder (piping, LEGEND outer layer)
    patch: "#0C3164",
    patchInk: "#E9E2CF",
    damask: "#ECE6D6",
    thread: "#B8975A",
    crease: "#0A1A36",
    meta: "#A9B2BE",
  };

  /* ---------- tiers: what the jacket is made of ---------- */
  const TIER = {
    HOMA: { body: ["#29405F", "#1F3557", "#192C49"], fabric: "cotton", hook: "nail", collar: "crew", num: "vinyl", kiss: false, patch: "vinyl", crest: false, piping: false, lining: "#101F38" },
    STADE: { body: ["#1D3A6B", "#142C55", "#10264B"], fabric: "pique", hook: "steel", collar: "stand", num: "gloss", kiss: true, patch: "print", crest: false, piping: false, lining: "#0A1A36" },
    PRO: { body: ["#1D3A6B", "#142C55", "#10264B"], fabric: "pique", hook: "brass", collar: "stand", num: "flock", kiss: true, patch: "woven", crest: true, piping: true, lining: "#0A1A36" },
    CHAMPION: { body: ["#1D3A6B", "#142C55", "#0F2448"], fabric: "pique", hook: "brass", collar: "stand", num: "twill3", kiss: true, patch: "cream", crest: true, piping: true, lining: "quilt" },
    LEGEND: { body: ["#173360", "#0E2347", "#091A37"], fabric: "brushed", hook: "peg", collar: "tall", num: "twill4", kiss: false, patch: "brass", crest: true, piping: true, lining: "quilt", statsInCollar: true },
  };

  /* ---------- the garment (viewBox 0 0 300 400) ---------- */
  const TOPS = {
    // [outline top edge, back collar band, collar base y at the shoulders]
    crew: { top: "M118 31Q138 28 150 22Q162 28 182 31", band: "M118 31Q138 28 150 22Q162 28 182 31L184.5 36.5Q162 33 150 28.5Q138 33 115.5 36.5Z", base: 35 },
    stand: { top: "M116.5 28Q150 10 183.5 28", band: "M116 28Q150 21 184 28L185.5 38.5Q150 33 114.5 38.5Z", base: 35, lining: "M116.5 28Q150 10 183.5 28Q150 21 116.5 28Z" },
    tall: { top: "M112.5 22Q150 3 187.5 22", band: "M112.5 22Q150 13 187.5 22L189 43Q150 36.5 111 43Z", base: 37, lining: "M112.5 22Q150 3 187.5 22Q150 13 112.5 22Z" },
  };
  const outline = (collar) => {
    const t = TOPS[collar];
    const r = collar === "tall" ? 188 : 185;
    const l = collar === "tall" ? 112 : 115;
    return (
      t.top +
      `L${r} ${t.base}L253 52.5C267 56 276 66 277.5 84L275.5 320L273.5 330L239 330L238 372L62 372L61 330L26.5 330L24.5 320L22.5 84C24 66 33 56 47 52.5L${l} ${t.base}Z`
    );
  };

  /* ---------- small builders ---------- */
  const num = (txt, F, x, y, a) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${F}" direction="ltr" ${a}>${E(txt)}</text>`;

  /** One cut layer of the number: grown by stroke W, offset (dx,dy), optional satin edge, cast and lit edge. */
  function layer(txt, F, x, y, L) {
    const W = L.W || 0;
    const tr = `transform="translate(${L.dx || 0} ${L.dy || 0})"`;
    const paint = (fill, w, extra = "") =>
      num(txt, F, x, y, `${tr} fill="${fill}"${w > 0 ? ` stroke="${fill}" stroke-width="${w}" stroke-linejoin="round"` : ""} ${extra}`);
    let s = "";
    if (L.cast) s += num(txt, F, x, y, `transform="translate(${(L.dx || 0) + L.cast} ${(L.dy || 0) + L.cast})" fill="#000" fill-opacity=".5"${W ? ` stroke="#000" stroke-opacity=".5" stroke-width="${W}" stroke-linejoin="round"` : ""}`);
    if (L.lit) s += num(txt, F, x, y, `transform="translate(${(L.dx || 0) - 0.6} ${(L.dy || 0) - 0.6})" fill="${L.lit}"${W ? ` stroke="${L.lit}" stroke-width="${W}" stroke-linejoin="round"` : ""}`);
    s += paint(L.fill, W, L.filter ? `filter="url(#${L.filter})"` : "");
    if (L.satin) {
      if (W > 0) {
        s += num(txt, F, x, y, `${tr} fill="none" stroke="${L.satin}" stroke-width="${W + 1.9}" stroke-dasharray=".5 .38" stroke-linejoin="round"`);
        s += paint(L.fill, Math.max(W - 1.9, 0.01));
      } else {
        s += num(txt, F, x, y, `${tr} fill="none" stroke="${L.satin}" stroke-width="1.7" stroke-dasharray=".5 .38" stroke-linejoin="round"`);
      }
    }
    return s;
  }

  function defs(u, T) {
    const [b0, b1, b2] = T.body;
    return (
      `<defs>` +
      `<clipPath id="${u}-clip"><path d="${outline(T.collar)}"/></clipPath>` +
      `<linearGradient id="${u}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b0}"/><stop offset=".45" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient>` +
      `<linearGradient id="${u}-side" x1="62" x2="238" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".16" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".035"/><stop offset=".84" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>` +
      `<linearGradient id="${u}-slv" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>` +
      `<linearGradient id="${u}-slvR" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>` +
      `<pattern id="${u}-piq" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".62" fill="#2C4E84" fill-opacity=".55"/><circle cx="0" cy="0" r=".35" fill="#06132A" fill-opacity=".45"/></pattern>` +
      `<pattern id="${u}-rib" width="2" height="12" patternUnits="userSpaceOnUse"><rect width="1" height="12" fill="#fff" fill-opacity=".11"/><rect x="1" width="1" height="12" fill="#000" fill-opacity=".18"/></pattern>` +
      `<pattern id="${u}-quilt" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#C9D1DA"/><path d="M0 0H5M0 0V5" stroke="#8E9AAB" stroke-width=".7"/></pattern>` +
      `<pattern id="${u}-dam" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="2" fill="${C.damask}"/><rect width="2" height=".9" fill="#7A6A48" fill-opacity=".09"/></pattern>` +
      `<pattern id="${u}-weave" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><rect width="1.6" height="1.6" fill="${C.patch}"/><rect width="1.6" height=".7" fill="#fff" fill-opacity=".07"/></pattern>` +
      `<pattern id="${u}-twW" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="2.2" height="2.2" fill="${C.flock}"/><rect width="2.2" height=".8" fill="#5A6A85" fill-opacity=".14"/></pattern>` +
      `<pattern id="${u}-twB" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="2.2" height="2.2" fill="${C.blue}"/><rect width="2.2" height=".8" fill="#fff" fill-opacity=".1"/></pattern>` +
      `<pattern id="${u}-twN" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="2.2" height="2.2" fill="${C.tunnel}"/><rect width="2.2" height=".8" fill="#fff" fill-opacity=".07"/></pattern>` +
      `<pattern id="${u}-twS" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="2.2" height="2.2" fill="${C.slate}"/><rect width="2.2" height=".8" fill="#fff" fill-opacity=".1"/></pattern>` +
      `<linearGradient id="${u}-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6D3A3"/><stop offset=".45" stop-color="#C9A86A"/><stop offset="1" stop-color="#8A6A3A"/></linearGradient>` +
      `<linearGradient id="${u}-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4E8EE"/><stop offset=".5" stop-color="#A9B2BE"/><stop offset="1" stop-color="#6D7683"/></linearGradient>` +
      `<radialGradient id="${u}-peg" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#F6E9C6"/><stop offset=".35" stop-color="#D8B878"/><stop offset=".8" stop-color="#8E6C38"/><stop offset="1" stop-color="#5E4524"/></radialGradient>` +
      `<linearGradient id="${u}-gloss" x1="70" y1="168" x2="226" y2="262" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#D3DBE4"/><stop offset=".36" stop-color="#E4E9EF"/><stop offset=".43" stop-color="#FFFFFF"/><stop offset=".53" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E2E8EE"/><stop offset="1" stop-color="#CAD3DD"/></linearGradient>` +
      `<linearGradient id="${u}-kiss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".075"/><stop offset=".5" stop-color="#fff" stop-opacity=".035"/><stop offset="1" stop-color="#fff" stop-opacity=".055"/></linearGradient>` +
      `<linearGradient id="${u}-rake" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C8DAFF" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>` +
      `<linearGradient id="${u}-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#EAF2FF" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${u}-sheen" x1="0" y1="0" x2="1" y2=".35"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<filter id="${u}-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${T.fabric === "brushed" ? ".9 .018" : T.fabric === "cotton" ? "1.1" : ".75"}" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${T.fabric === "brushed" ? ".9 -.32" : ".55 -.2"}"/></filter>` +
      `<filter id="${u}-grainD" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${T.fabric === "brushed" ? "1.1 .02" : "1.3"}" numOctaves="1" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.8 .55"/></filter>` +
      `<filter id="${u}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>` +
      // Flock: fibre noise plus a 1u emboss lit from the top-start, multiplied into the white.
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

  function hook(T, u) {
    if (T.hook === "nail")
      return `<g class="c03-hook"><path d="M150.4 5.5L150.9 13.5L146.2 20" fill="none" stroke="#6B6F75" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M150 6L150.4 13" stroke="#A6ABB2" stroke-width=".8" stroke-linecap="round"/><ellipse cx="150.3" cy="4.6" rx="5.2" ry="2.2" fill="#6B6F75"/><ellipse cx="149.6" cy="4" rx="3" ry=".9" fill="#A6ABB2"/></g>`;
    if (T.hook === "peg")
      return (
        `<g class="c03-hook">` +
        `<path d="M144 20C143 10 157 10 156 20" fill="none" stroke="${T.body[0]}" stroke-width="3.2"/>` +
        `<circle cx="150" cy="10" r="9.5" fill="url(#${u}-peg)"/>` +
        `<circle cx="150" cy="10" r="6.6" fill="none" stroke="#6E5228" stroke-width=".7" stroke-opacity=".7"/>` +
        `<circle cx="150" cy="10" r="3.6" fill="none" stroke="#6E5228" stroke-width=".6" stroke-opacity=".6"/>` +
        `<ellipse cx="146.6" cy="6.8" rx="2.6" ry="1.5" fill="#FFF6DD" fill-opacity=".8"/>` +
        `</g>`
      );
    const g = T.hook === "steel" ? `${u}-steel` : `${u}-brass`;
    const hi = T.hook === "steel" ? "#F3F6FA" : "#F6EBC8";
    return (
      `<g class="c03-hook">` +
      `<rect x="142.5" y="0" width="15" height="3.4" rx="1.2" fill="url(#${g})"/>` +
      `<path d="M150 2V13C150 21 142.5 22.6 138.6 17.4" fill="none" stroke="url(#${g})" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M149 3.5V12.5" stroke="${hi}" stroke-width=".9" stroke-linecap="round" stroke-opacity=".85"/>` +
      `</g>`
    );
  }
  /** The hanger loop: a tape from the collar up around the hook. */
  const loop = (T) =>
    T.hook === "peg" || T.hook === "nail"
      ? ""
      : `<path d="M145.5 23.2C145 15.8 155 15.8 154.5 23.2" fill="none" stroke="${T.body[0]}" stroke-width="2.6"/><path d="M146.6 22.6C146.4 17.6 153.6 17.6 153.4 22.6" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".6"/>`;

  /* ---------- the number, by tier ---------- */
  function number(p, T, u, F, cx, base, thumb) {
    const n = String(p.ovr);
    const x = (cx + inkShift(n, F)).toFixed(2);
    const y = base;
    switch (T.num) {
      case "vinyl": {
        // hand-cut iron-on vinyl, 1.5° off, cracked from washing
        const cr = [
          "M64 200l14 2 9-3 12 3 10-2 13 4", "M70 222l11-2 13 3 8-1 16 2", "M150 196l12 3 14-2 9 2 15-1 8 3",
          "M158 228l9 1 12-3 14 2 10-1", "M76 244l15 2 10-2 13 1", "M166 248l13-2 11 2 14-1", "M100 184l3 12-2 9 3 10",
          "M196 182l-2 14 3 8-1 12", "M84 206l2 10-3 9", "M188 236l3 9-2 10",
        ];
        return (
          `<g transform="rotate(1.5 ${cx} ${y - 40}) translate(-1.2 1.4)">` +
          `<clipPath id="${u}-nclip">${num(n, F, x, y, "")}</clipPath>` +
          num(n, F, x, y, `fill="#E3E5E1"`) +
          (thumb ? "" : `<g clip-path="url(#${u}-nclip)" fill="none" stroke="${T.body[1]}" stroke-width=".75" stroke-linejoin="bevel">${cr.map((d) => `<path d="${d}"/>`).join("")}</g>`) +
          `</g>`
        );
      }
      case "gloss":
        return num(n, F, x, y, `fill="url(#${u}-gloss)"`) + num(n, F, x, y, `fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".6"`);
      case "flock":
        return (
          layer(n, F, x, y, { fill: `url(#${u}-twB)`, W: 6, dx: 2.2, dy: 2.2 }) +
          layer(n, F, x, y, { fill: C.flock, W: 0, filter: thumb ? null : `${u}-flock` })
        );
      case "twill3":
        return (
          layer(n, F, x, y, { fill: `url(#${u}-twN)`, W: 10, dx: 2.2, dy: 2.2, satin: thumb ? null : "#3D5B8E" }) +
          layer(n, F, x, y, { fill: `url(#${u}-twB)`, W: 5, dx: 0.9, dy: 0.9, satin: thumb ? null : "#5C8BFF" }) +
          layer(n, F, x, y, { fill: `url(#${u}-twW)`, W: 0, dx: -0.4, dy: -0.4, satin: thumb ? null : "#FFFFFF" })
        );
      case "twill4":
      default:
        return (
          layer(n, F, x, y, { fill: `url(#${u}-twS)`, W: 14.4, dx: 2.6, dy: 2.6, cast: 2.2, satin: thumb ? null : "#8D98AC" }) +
          layer(n, F, x, y, { fill: `url(#${u}-twN)`, W: 9.6, dx: 1.1, dy: 1.1, cast: 1.8, lit: "#2A4677", satin: thumb ? null : "#3D5B8E" }) +
          layer(n, F, x, y, { fill: `url(#${u}-twB)`, W: 4.8, dx: -0.4, dy: -0.4, cast: 1.6, lit: "#6E98FF", satin: thumb ? null : "#5C8BFF" }) +
          layer(n, F, x, y, { fill: `url(#${u}-twW)`, W: 0, dx: -1.9, dy: -1.9, cast: 1.5, lit: "#FFFFFF", satin: thumb ? null : "#FFFFFF" })
        );
    }
  }

  /* ---------- the name, by tier ---------- */
  function nameMark(p, o, T, u, thumb) {
    const ar = MC.isAr(o);
    const nm = MC.nameOf(p, o);
    const F = nameSize(nm, ar);
    const y = ar ? 138 : 140;
    const base = `x="150" y="${y}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${F.toFixed(1)}"${ar ? ` direction="rtl"` : ` direction="ltr" letter-spacing="${(F * 0.04).toFixed(2)}"`}`;
    const t = (a) => `<text ${base} ${a}>${E(nm)}</text>`;
    switch (T.num) {
      case "vinyl":
        return `<g transform="rotate(-1 150 ${y})">${t(`fill="#E3E5E1"`)}</g>`;
      case "gloss":
        return t(`fill="url(#${u}-gloss)"`);
      case "flock":
        return t(`fill="${C.flock}"${thumb ? "" : ` filter="url(#${u}-flock)"`}`);
      case "twill3":
        return t(`fill="url(#${u}-twW)"`) + (thumb ? "" : t(`fill="none" stroke="#fff" stroke-width="1.3" stroke-dasharray=".5 .38"`));
      default:
        return (
          t(`fill="#000" fill-opacity=".5" transform="translate(1.6 1.6)"`) +
          t(`fill="url(#${u}-twW)"`) +
          (thumb ? "" : t(`fill="none" stroke="#fff" stroke-width="1.3" stroke-dasharray=".5 .38"`))
        );
    }
  }

  /* ---------- prints on the back: shoulders, neck, meta ---------- */
  function prints(p, o, T, u) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const ink = T.num === "vinyl" ? "#E3E5E1" : C.flock;
    const op = T.num === "vinyl" ? ".88" : ".86";
    let s = "";
    // neck print
    const ny = T.collar === "tall" ? 56 : 52;
    s += ar
      ? `<text x="150" y="${ny + 1}" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="9.5" direction="rtl" fill="${ink}" fill-opacity="${op}">${E(S.country)}</text>`
      : `<text x="150" y="${ny}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="8.6" letter-spacing=".7" direction="ltr" fill="${ink}" fill-opacity="${op}">${E(S.country)}</text>`;
    if (T.statsInCollar) return s;
    // shoulder prints: start shoulder CAP·SEL, end shoulder TRF·CON; Arabic starts on the right shoulder
    const pair = (a, b) =>
      ar
        ? `${E(S.stats[a])} <tspan font-family="Manrope" font-weight="800">${p.stats[a]}</tspan>  ${E(S.stats[b])} <tspan font-family="Manrope" font-weight="800">${p.stats[b]}</tspan>`
        : `${a} <tspan fill-opacity="1">${p.stats[a]}</tspan>  ${b} <tspan>${p.stats[b]}</tspan>`;
    const left = { x: 79.2, y: 57.2, r: -14.6 };
    const right = { x: 220.8, y: 57.2, r: 14.6 };
    const at = (pos, txt) =>
      `<text x="${pos.x}" y="${pos.y}" transform="rotate(${pos.r} ${pos.x} ${pos.y})" text-anchor="middle" ` +
      (ar
        ? `font-family="Noto Sans Arabic" font-weight="700" font-size="7.4" direction="rtl"`
        : `font-family="Manrope" font-weight="800" font-size="8" letter-spacing=".25" direction="ltr"`) +
      ` fill="${ink}" fill-opacity="${op}">${txt}</text>`;
    const first = pair("CAP", "SEL");
    const second = pair("TRF", "CON");
    s += ar ? at(right, first) + at(left, second) : at(left, first) + at(right, second);
    return s;
  }

  function collarTape(p, o, u) {
    // LEGEND: the four stats move inside the collar, woven into a cream jacquard tape
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const ln = (a, b, y) =>
      ar
        ? `<text x="150" y="${y}" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="6.3" direction="rtl" fill="${C.patch}">${E(S.stats[a])} <tspan font-family="Manrope" font-weight="800">${p.stats[a]}</tspan>   ${E(S.stats[b])} <tspan font-family="Manrope" font-weight="800">${p.stats[b]}</tspan></text>`
        : `<text x="150" y="${y}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="6.6" letter-spacing=".3" direction="ltr" fill="${C.patch}">${a} ${p.stats[a]}   ${b} ${p.stats[b]}</text>`;
    return (
      `<path d="${TOPS.tall.band}" fill="url(#${u}-dam)"/>` +
      `<path d="M112.5 22Q150 13 187.5 22" fill="none" stroke="${C.thread}" stroke-width=".9" stroke-dasharray="1.4 .9"/>` +
      `<path d="M111 43Q150 36.5 189 43" fill="none" stroke="${C.thread}" stroke-width=".9" stroke-dasharray="1.4 .9"/>` +
      ln("CAP", "SEL", ar ? 28.4 : 28) +
      ln("TRF", "CON", ar ? 37.6 : 36.6)
    );
  }

  /* ---------- sleeve fittings: tier tab (start sleeve) and club disc (end sleeve) ---------- */
  function sleeves(p, o, T, u, thumb) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const word = S.tiers[p.tier];
    const len = ar ? [...word].length * 0.62 : [...word].reduce((a, c) => a + (CAPS[c] || 600), 0) / 1000 * 1.08;
    const Fz = Math.min(8.6, 44 / Math.max(len, 0.1));
    const cx = 42.4, cy = 152;
    const label = (fill, extra = "") =>
      ar
        ? `<text x="${cx}" y="${cy + 2.6}" transform="rotate(-90 ${cx} ${cy})" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="${Math.min(Fz, 8).toFixed(2)}" direction="rtl" fill="${fill}" ${extra}>${E(word)}</text>`
        : `<text x="${cx}" y="${cy + 3}" transform="rotate(-90 ${cx} ${cy})" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="${Fz.toFixed(2)}" letter-spacing="${(Fz * 0.08).toFixed(2)}" direction="ltr" fill="${fill}" ${extra}>${E(word)}</text>`;
    let s = "";
    const tab = (fill, edge, dash) =>
      `<rect x="33.4" y="122" width="18" height="60" rx="2" fill="${fill}"/>` +
      `<rect x="33.4" y="122" width="18" height="60" rx="2" fill="none" stroke="${edge}" stroke-width="1.5" stroke-dasharray="${dash}"/>`;
    if (T.patch === "vinyl") s += `<g transform="rotate(1.2 ${cx} ${cy})">${label("#E3E5E1")}</g>`;
    else if (T.patch === "print") s += label(C.flock, `fill-opacity=".92"`);
    else if (T.patch === "woven") s += tab(`url(#${u}-weave)`, "#8D99AB", ".5 .32") + label(C.patchInk);
    else if (T.patch === "cream") s += tab(`url(#${u}-dam)`, C.thread, ".5 .32") + label(C.patch);
    else s += tab(`url(#${u}-weave)`, "#D9B977", ".5 .3") + `<rect x="35.6" y="124.2" width="13.6" height="55.6" rx="1.2" fill="none" stroke="#D9B977" stroke-opacity=".55" stroke-width=".5"/>` + label("#E3C98C");
    if (thumb && T.patch !== "vinyl" && T.patch !== "print") s = tab(T.patch === "cream" ? C.damask : C.patch, "none", "0");
    if (thumb && (T.patch === "vinyl" || T.patch === "print")) s = "";
    if (T.crest) {
      const ring = T.patch === "brass" ? "#D9B977" : T.patch === "cream" ? C.thread : "#8D99AB";
      s +=
        `<circle cx="258" cy="140" r="12.5" fill="${T.patch === "cream" ? `url(#${u}-dam)` : `url(#${u}-weave)`}"/>` +
        `<circle cx="258" cy="140" r="12.5" fill="none" stroke="${ring}" stroke-width="1.5" stroke-dasharray=".5 .32"/>` +
        (thumb ? "" : `<g transform="translate(251.2 131.8)">${MC.crest({ w: 13.6, h: 16.3, fill: p.club.primary, sash: p.club.secondary, ring: T.patch === "brass" ? "#E3C98C" : p.club.secondary })}</g>`);
    }
    return s;
  }

  /* ---------- FOUNDER: a woven jock tag sewn into the hem (never upgrades) ---------- */
  function founderTag(p, o, u, thumb) {
    if (!p.founder) return "";
    const ar = MC.isAr(o);
    const S = MC.s(o);
    let s =
      `<g class="c03-tag">` +
      `<rect x="64" y="361" width="74" height="23.5" rx="1.4" fill="url(#${u}-dam)"/>` +
      `<rect x="65.2" y="362.2" width="71.6" height="21.1" rx="1" fill="none" stroke="${C.thread}" stroke-width=".8" stroke-dasharray="1.3 .8"/>` +
      `<path d="M64 372.6H138" stroke="#000" stroke-opacity=".12" stroke-width=".6"/>`;
    if (!thumb) {
      s +=
        `<circle cx="75.6" cy="372.8" r="7.4" fill="${C.patch}"/>` +
        `<circle cx="75.6" cy="372.8" r="6.2" fill="none" stroke="${C.thread}" stroke-width=".5"/>` +
        `<text x="75.6" y="375.6" text-anchor="middle" font-family="Changa" font-weight="800" font-size="7.6" direction="ltr" fill="${C.damask}">${String(p.founder).slice(2)}</text>` +
        (ar
          ? `<text x="133.4" y="370.6" text-anchor="start" font-family="Noto Sans Arabic" font-weight="700" font-size="6.2" direction="rtl" fill="${C.patch}">${E(S.founder)} <tspan font-family="Manrope" font-weight="800">${p.founder}</tspan></text>`
          : `<text x="86.2" y="369.8" font-family="Manrope" font-weight="800" font-size="5.9" letter-spacing=".2" direction="ltr" fill="${C.patch}">${E(S.founderLine)}</text>`) +
        `<text x="${ar ? 133.4 : 86.2}" y="379.4" text-anchor="${ar ? "end" : "start"}" font-family="Manrope" font-weight="700" font-size="5" letter-spacing=".15" direction="ltr" fill="${C.patch}" fill-opacity=".85">${E(p.id)}</text>`;
    }
    return s + `</g>`;
  }

  /* ---------- full card ---------- */
  function full(p, o = {}) {
    const S = MC.s(o);
    const T = TIER[p.tier] || TIER.PRO;
    const u = MC.uid("c03");
    const thumb = !!o.thumb;
    const out = outline(T.collar);
    const F = 124;
    const base = 256;
    const tierCls = `c03--${p.tier.toLowerCase()}`;
    let g = "";
    // rim (dark ground) under everything, so 1px shows outside the cloth
    g += `<path class="c03-rim" d="${out}"/>`;
    // body
    g += `<path d="${out}" fill="url(#${u}-body)"/>`;
    g += `<g clip-path="url(#${u}-clip)">`;
    if (!thumb) {
      if (T.fabric === "pique") g += `<rect width="300" height="400" fill="url(#${u}-piq)"/>`;
      g += `<rect width="300" height="400" filter="url(#${u}-grain)" opacity="${T.fabric === "brushed" ? ".5" : ".45"}"/>`;
      g += `<rect width="300" height="400" filter="url(#${u}-grainD)" opacity=".5"/>`;
    }
    // drape: side shading, sleeve shading, pull folds from the hook
    g += `<rect x="62" y="0" width="176" height="400" fill="url(#${u}-side)"/>`;
    g += `<rect x="20" y="70" width="42" height="270" fill="url(#${u}-slv)"/><rect x="238" y="70" width="42" height="270" fill="url(#${u}-slvR)"/>`;
    if (!thumb)
      g +=
        `<g filter="url(#${u}-soft)" opacity=".9"><path d="M140 44L104 112L110 116Z" fill="#000" fill-opacity=".22"/><path d="M160 44L196 112L190 116Z" fill="#000" fill-opacity=".22"/>` +
        `<path d="M146 46L126 120L132 120Z" fill="#fff" fill-opacity=".05"/><path d="M84 300Q92 340 88 372L80 372Q86 336 76 302Z" fill="#000" fill-opacity=".2"/><path d="M216 300Q208 340 212 372L220 372Q214 336 224 302Z" fill="#000" fill-opacity=".2"/></g>`;
    // sleeve creases and seams
    g += `<path d="M62 110V330M238 110V330" stroke="${C.crease}" stroke-width="2.2"/>`;
    g += `<path d="M63.6 112V328M236.4 112V328" stroke="#fff" stroke-opacity=".06" stroke-width=".8"/>`;
    g += `<path d="M47 52.5C55 70 60 92 62 112M253 52.5C245 70 240 92 238 112" fill="none" stroke="${C.crease}" stroke-opacity=".8" stroke-width="1"/>`;
    if (T.collar !== "crew") {
      // yoke seam (the shared avatar's seam, scaled to the jacket): double-needle stitch
      g += `<path d="M57.6 86C110 96.5 190 96.5 242.4 86" fill="none" stroke="${C.crease}" stroke-width="1.1"/>`;
      if (!thumb) g += `<path d="M57.8 88.4C110 98.9 190 98.9 242.2 88.4" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".5" stroke-dasharray="1.6 1"/>`;
    }
    // cuffs and hem rib
    g += `<path d="M24.5 320H62V330H26.5ZM238 320H275.5L273.5 330H238Z" fill="url(#${u}-rib)"/><path d="M24.5 320H61.5M238.5 320H275.5" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>`;
    g += `<rect x="62" y="361" width="176" height="11" fill="url(#${u}-rib)"/><path d="M62 361H238" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>`;
    // tube light on the yoke, raking light (LEGEND)
    g += `<rect x="0" y="0" width="300" height="90" fill="#9CC0FF" opacity=".05"/>`;
    if (T.num === "twill4") g += `<rect width="300" height="400" fill="url(#${u}-rake)"/>`;
    g += `</g>`;
    // collar: lining (inside front), back band in rib knit, loop
    const tp = TOPS[T.collar];
    if (tp.lining) g += `<path d="${tp.lining}" fill="${T.lining === "quilt" ? `url(#${u}-quilt)` : T.lining}"/>`;
    else g += `<path d="M118 31Q138 28 150 22Q162 28 182 31Q150 26 118 31Z" fill="${T.lining}"/>`;
    if (T.collar === "tall") g += collarTape(p, o, u);
    else g += `<path d="${tp.band}" fill="${T.body[0]}"/><path d="${tp.band}" fill="url(#${u}-rib)"/>`;
    // lit top edge from the overhead tube light (shoulders + collar)
    g += `<path class="c03-lit" d="M47 52.5L${T.collar === "tall" ? 112 : 115} ${tp.base}M${T.collar === "tall" ? 188 : 185} ${tp.base}L253 52.5" clip-path="url(#${u}-clip)"/>`;
    // club piping on the shoulder seams
    if (T.piping) g += `<path d="M48.5 54.6L${T.collar === "tall" ? 112 : 115.5} ${tp.base + 2.2}M${T.collar === "tall" ? 188 : 184.5} ${tp.base + 2.2}L251.5 54.6" stroke="${C.slate}" stroke-width="2.4" stroke-linecap="round"/>`;
    // hook + loop
    const hk = hook(T, u);
    // prints
    if (!thumb) g += prints(p, o, T, u);
    // name
    g += nameMark(p, o, T, u, thumb);
    // the press kiss: the mark a platen leaves (STADE..CHAMPION)
    if (T.kiss) g += `<rect x="64" y="158" width="172" height="114" rx="4" fill="url(#${u}-kiss)"/><path d="M68 158.6H232" stroke="#fff" stroke-opacity=".07" stroke-width=".8"/>`;
    // the number
    g += `<g class="c03-num">${number(p, T, u, F, 150, base, thumb)}</g>`;
    if (T.num === "twill4") g += `<g clip-path="url(#${u}-clip)"><rect class="c03-sweep" x="-120" y="150" width="90" height="140" fill="url(#${u}-sweep)" transform="skewX(-18)"/></g>`;
    // tilt sheen (moved by mount)
    if (!thumb) g += `<g clip-path="url(#${u}-clip)"><rect class="c03-sheen" x="-60" y="0" width="420" height="400" fill="url(#${u}-sheen)"/></g>`;
    // meta print
    if (!thumb)
      g +=
        `<text x="150" y="${p.founder ? 349 : 352}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="7.6" letter-spacing=".5" direction="ltr" fill="${C.meta}">${E(p.id)}<tspan dx="7" fill-opacity=".55">/</tspan><tspan dx="7">${E(p.season)}</tspan></text>`;
    // sleeves
    g += sleeves(p, o, T, u, thumb);
    // founder jock tag (changes the outline: sticks out below the hem)
    g += founderTag(p, o, u, thumb);

    const cls = `c03 c03-card ${tierCls}${thumb ? " c03--thumb" : ""}${o.motion ? " c03--motion" : ""}`;
    return (
      `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${E(MC.label(p, o))}" data-tier="${p.tier}">` +
      `<svg class="c03-svg" viewBox="0 0 300 400" style="direction:ltr" aria-hidden="true" focusable="false">` +
      defs(u, T) +
      `<g class="c03-swing">${hk}${loop(T)}<g class="c03-jacket">${g}</g>` +
      `<g class="c03-press" aria-hidden="true"></g></g>` +
      `</svg></div>`
    );
  }

  /* ---------- token (44–80px) and mini (24–32px) ---------- */
  const TOK = {
    // viewBox 0 0 60 80
    outline: {
      crew: "M23.5 9.4Q27.6 8.6 30 6.6Q32.4 8.6 36.5 9.4L37.2 11.4L51.5 15C55.5 16 57.6 19.5 58 23L57.5 63L49 63L48.5 73L11.5 73L11 63L2.5 63L2 23C2.4 19.5 4.5 16 8.5 15L22.8 11.4Z",
      stand: "M23 8.6Q30 4.2 37 8.6L37.4 11.4L51.5 15C55.5 16 57.6 19.5 58 23L57.5 63L49 63L48.5 73L11.5 73L11 63L2.5 63L2 23C2.4 19.5 4.5 16 8.5 15L22.6 11.4Z",
      tall: "M22.2 7.4Q30 1.6 37.8 7.4L38.2 12L51.5 15C55.5 16 57.6 19.5 58 23L57.5 63L49 63L48.5 73L11.5 73L11 63L2.5 63L2 23C2.4 19.5 4.5 16 8.5 15L21.8 12Z",
    },
  };
  const MINI = "M12.6 5.2Q18 2.6 23.4 5.2L33 8.6C34.6 9.3 35.2 10.4 35.2 12L35.2 24.6L28.6 24.6L28.6 30.6L7.4 30.6L7.4 24.6L.8 24.6L.8 12C.8 10.4 1.4 9.3 3 8.6Z";

  function tokenHook(T, size) {
    const thin = size < 56;
    if (T.hook === "nail") return `<path d="M30.3 1.6L30.4 4.6L28.6 6.8" fill="none" stroke="#7D828A" stroke-width="${thin ? 2 : 1.6}" stroke-linecap="round"/><ellipse cx="30.3" cy="1.5" rx="2.4" ry="1" fill="#7D828A"/>`;
    if (T.hook === "peg") return `<circle cx="30" cy="3.6" r="3.6" fill="#D2B06E"/><circle cx="29" cy="2.6" r="1.1" fill="#F6E9C6"/>`;
    const c = T.hook === "steel" ? "#B7C0CB" : "#CFAF72";
    return `<path d="M30 0V3.8C30 6.6 27.4 7.2 26.2 5.6" fill="none" stroke="${c}" stroke-width="${thin ? 2.4 : 2}" stroke-linecap="round"/>`;
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const T = TIER[p.tier] || TIER.PRO;
    const n = String(p.ovr);
    const legend = p.tier === "LEGEND";
    if (o.mini || size <= 32) {
      // mini: collar-and-shoulder trapezoid with sleeve steps; tier on the hem line
      const w = (size * 36) / 32;
      const body = legend ? "#E9E2CF" : T.body[1];
      const ink = legend ? "#0C3164" : C.flock;
      const hem = { HOMA: `<path d="M8.6 28.2H27.4" stroke="#C9D1DA" stroke-width="1" stroke-dasharray="1.6 1.1"/>`, STADE: `<path d="M8.6 28.3H27.4" stroke="#C9D1DA" stroke-width=".9"/>`, PRO: `<path d="M8.6 27.4H27.4M8.6 29.2H27.4" stroke="#C9D1DA" stroke-width=".7"/>`, CHAMPION: `<path d="M8.6 27.1H27.4" stroke="#E6D3A3" stroke-width="1.5"/><path d="M8.6 29.4H27.4" stroke="#C9D1DA" stroke-width=".7"/>`, LEGEND: `<path d="M8.6 27.6H27.4" stroke="#0C3164" stroke-width="1"/>` }[p.tier];
      const F = 14.4;
      const x = (18 + inkShift(n, F)).toFixed(2);
      return (
        `<span class="c03 c03-tok c03-mini c03--${p.tier.toLowerCase()}" style="--h:${size}px">` +
        `<svg viewBox="0 0 36 32" width="${w.toFixed(1)}" height="${size}" style="direction:ltr" aria-hidden="true" focusable="false">` +
        (size >= 28 ? `<path d="M18 0V2.6C18 4.3 16.4 4.6 15.6 3.7" fill="none" stroke="${T.hook === "steel" ? "#B7C0CB" : T.hook === "nail" ? "#7D828A" : "#CFAF72"}" stroke-width="1.5" stroke-linecap="round"/>` : "") +
        `<path class="c03-rim" d="${MINI}"/>` +
        `<path d="${MINI}" fill="${body}"/>` +
        `<path d="M12.6 5.2Q18 2.6 23.4 5.2L23.6 6.4Q18 4.6 12.4 6.4Z" fill="${legend ? "#C9BC98" : T.body[0]}"/>` +
        `<path d="M7.4 12.5V24.6M28.6 12.5V24.6" stroke="${legend ? "#B9AE8E" : C.crease}" stroke-width=".9"/>` +
        `<text x="${x}" y="23.2" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${F}" direction="ltr" fill="${ink}">${n}</text>` +
        hem +
        (p.founder ? `<rect x="8.4" y="29.6" width="4" height="2.4" rx=".5" fill="${legend ? "#0C3164" : C.damask}"/>` : "") +
        `</svg></span>`
      );
    }
    const w = (size * 60) / 80;
    const thin = size < 56;
    const F = 27;
    const cx = 30, base = 55;
    const x = (cx + inkShift(n, F)).toFixed(2);
    const t = (a) => `<text x="${x}" y="${base}" text-anchor="middle" font-family="Changa" font-weight="800" font-size="${F}" direction="ltr" stroke-linejoin="round" ${a}>${n}</text>`;
    let nm = "";
    switch (T.num) {
      case "vinyl":
        nm = `<g transform="rotate(1.5 30 46)">${t(`fill="#E3E5E1"`)}<path d="M15 44l5 .8 4-1 5 1.2 4-.8M31 50l5-.6 4 1 5-.4" fill="none" stroke="${T.body[1]}" stroke-width="${thin ? 1.1 : .8}"/></g>`;
        break;
      case "gloss":
        nm = t(`fill="#EEF2F6"`);
        break;
      case "flock":
        nm = t(`fill="${C.blue}" stroke="${C.blue}" stroke-width="2.6" transform="translate(1 1)"`) + t(`fill="${C.flock}"`);
        break;
      case "twill3":
        nm = t(`fill="#C9D1DA" stroke="#C9D1DA" stroke-width="${thin ? 4.6 : 5}"`) + t(`fill="${C.blue}" stroke="${C.blue}" stroke-width="${thin ? 2.8 : 3}"`) + t(`fill="${C.flock}"`);
        break;
      default:
        nm =
          (thin ? "" : t(`fill="#000" fill-opacity=".55" stroke="#000" stroke-opacity=".55" stroke-width="6.4" transform="translate(1.6 1.6)"`)) +
          t(`fill="${C.slate}" stroke="${C.slate}" stroke-width="${thin ? 5.2 : 6.4}" transform="translate(.9 .9)"`) +
          (thin ? "" : t(`fill="#E6D3A3" stroke="#E6D3A3" stroke-width="4.2" transform="translate(.3 .3)"`)) +
          t(`fill="${C.blue}" stroke="${C.blue}" stroke-width="${thin ? 2.6 : 2.4}"`) +
          t(`fill="${C.flock}" transform="translate(-.4 -.4)"`);
    }
    const out = TOK.outline[T.collar];
    return (
      `<span class="c03 c03-tok c03--${p.tier.toLowerCase()}" style="--h:${size}px">` +
      `<svg viewBox="0 0 60 80" width="${w.toFixed(1)}" height="${size}" style="direction:ltr" aria-hidden="true" focusable="false">` +
      tokenHook(T, size) +
      `<path class="c03-rim" d="${out}"/>` +
      `<path d="${out}" fill="${T.body[1]}"/>` +
      `<path d="M2 23L11 23L11 63L2.5 63ZM58 23L49 23L49 63L57.5 63Z" fill="#000" fill-opacity=".14"/>` +
      `<path d="M11 24V63M49 24V63" stroke="${C.crease}" stroke-width="${thin ? 1.4 : 1}"/>` +
      (T.collar === "tall"
        ? `<path d="M22.2 7.4Q30 3.4 37.8 7.4L38.2 12Q30 9.6 21.8 12Z" fill="${C.damask}"/>`
        : `<path d="${T.collar === "crew" ? "M23.5 9.4Q27.6 8.6 30 6.6Q32.4 8.6 36.5 9.4L37.2 11.4Q32.4 10.4 30 8.6Q27.6 10.4 22.8 11.4Z" : "M23 8.6Q30 6.4 37 8.6L37.4 11.4Q30 9.8 22.6 11.4Z"}" fill="${T.body[0]}"/>`) +
      (T.piping && !thin ? `<path d="M9 15.8L22.6 12.4M37.4 12.4L51 15.8" stroke="${C.slate}" stroke-width="1"/>` : "") +
      `<path d="M11.5 70.6H48.5" stroke="#000" stroke-opacity=".28" stroke-width="${thin ? 1.2 : .8}"/>` +
      nm +
      (p.founder ? `<rect x="13" y="70.4" width="9.5" height="6.4" rx=".8" fill="${C.damask}"/>${thin ? "" : `<rect x="13.6" y="71" width="8.3" height="5.2" rx=".5" fill="none" stroke="${C.thread}" stroke-width=".5" stroke-dasharray=".9 .5"/>`}` : "") +
      `</svg></span>`
    );
  }

  /* ---------- compact card: a peg on the dressing-room rail ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const T = TIER[p.tier] || TIER.PRO;
    const tierCls = `c03-row-tier--${p.tier.toLowerCase()}`;
    return (
      `<div class="c03 c03-row${o.me ? " is-me" : ""}${o.me && o.motion ? " c03--motion" : ""}" dir="${S.dir}">` +
      `<span class="c03-row-rank" aria-label="${E(S.rank)} ${o.rank}">${MC.ltr(o.rank)}</span>` +
      `<span class="c03-row-tok">${token(p, { ...o, size: 54, mini: false })}</span>` +
      `<span class="c03-row-id"><b class="c03-row-name">${E(MC.nameOf(p, o))}</b>` +
      `<span class="c03-row-sub"><i class="c03-row-tier ${tierCls}">${E(S.tiers[p.tier])}</i><span class="c03-row-ovr">${MC.ltr(p.ovr)} <small>${S.ovr}</small></span>` +
      (p.founder ? `<span class="c03-row-f" title="${E(S.founderLine)}">${MC.ltr(String(p.founder).slice(2))}</span>` : "") +
      `</span></span>` +
      `<span class="c03-row-pts"><b>${MC.ltr(o.pts)}</b><small>${E(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- share: "the dressing room", 360×640 ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid("c03s");
    const bg =
      `<svg class="c03-share-bg" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false">` +
      `<defs>` +
      `<linearGradient id="${u}-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E2344"/><stop offset=".55" stop-color="#0A1A33"/><stop offset="1" stop-color="#060F20"/></linearGradient>` +
      `<radialGradient id="${u}-pool" cx="180" cy="70" r="330" gradientUnits="userSpaceOnUse" gradientTransform="translate(180 70) scale(1 1.25) translate(-180 -70)"><stop offset="0" stop-color="#9FC2FF" stop-opacity=".26"/><stop offset=".45" stop-color="#6E95D8" stop-opacity=".08"/><stop offset="1" stop-color="#6E95D8" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${u}-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A4E36"/><stop offset=".3" stop-color="#4F3826"/><stop offset="1" stop-color="#2C1E13"/></linearGradient>` +
      `<linearGradient id="${u}-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6D3A3"/><stop offset=".5" stop-color="#B08D57"/><stop offset="1" stop-color="#6E5228"/></linearGradient>` +
      `<filter id="${u}-paint" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .06" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .6  0 0 0 0 .7  0 0 0 0 .9  0 0 0 .5 -.18"/></filter>` +
      `<filter id="${u}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9 .25" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .6 -.22"/></filter>` +
      `<filter id="${u}-glow" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="6"/></filter>` +
      `<filter id="${u}-cone" x="-20%" y="-10%" width="140%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>` +
      `</defs>` +
      `<rect width="360" height="640" fill="url(#${u}-wall)"/>` +
      `<rect width="360" height="640" filter="url(#${u}-paint)" opacity=".5"/>` +
      `<path d="M128 74H232L380 640H-20Z" fill="#B9D2FF" opacity=".07" filter="url(#${u}-cone)"/>` +
      `<rect width="360" height="640" fill="url(#${u}-pool)"/>` +
      // tube light
      `<rect x="118" y="62" width="124" height="9" rx="4.5" fill="#CFE0FF" filter="url(#${u}-glow)" opacity=".9"/>` +
      `<rect x="122" y="60.5" width="116" height="7" rx="2" fill="#1E2C44"/>` +
      `<rect x="125" y="66" width="110" height="4.6" rx="2.3" fill="#F2F7FF"/>` +
      // the hook rail
      `<rect x="-4" y="110" width="368" height="18" fill="url(#${u}-wood)"/>` +
      `<rect x="-4" y="110" width="368" height="18" filter="url(#${u}-grain)" opacity=".7"/>` +
      `<path d="M-4 110.6H364" stroke="#A88762" stroke-opacity=".7" stroke-width="1.2"/>` +
      `<rect x="-4" y="128" width="368" height="10" fill="#000" opacity=".28"/>` +
      // two empty outer hooks, cropped by the frame
      [2, 358]
        .map(
          (x) =>
            `<rect x="${x - 7}" y="113.5" width="14" height="4" rx="1.4" fill="url(#${u}-brass)"/><path d="M${x} 116V128C${x} 136 ${x - 7.5} 137.6 ${x - 11.4} 132.4" fill="none" stroke="url(#${u}-brass)" stroke-width="3.6" stroke-linecap="round"/>`,
        )
        .join("") +
      `</svg>`;
    const cap =
      `<div class="c03-share-cap">` +
      `<span class="c03-share-handle">${MC.ltr("@ali")}</span>` +
      `<b class="c03-share-name">${E(MC.nameOf(p, o))}</b>` +
      `<span class="c03-share-line"><i class="c03-row-tier c03-row-tier--${p.tier.toLowerCase()}">${E(S.tiers[p.tier])}</i><span class="c03-share-ovr">${MC.ltr(p.ovr)} <small>${S.ovr}</small></span></span>` +
      `<span class="c03-share-meta">${MC.ltr(p.id)}<span aria-hidden="true">/</span>${MC.ltr(p.season)}<span aria-hidden="true">/</span>${ar ? "مثال" : "Sample"}</span>` +
      `</div>`;
    const fig = MC.avatar({
      torso: "#0B172C",
      seam: "#1A2D4D",
      collar: "#101F3A",
      neck: "#5E4232",
      skin: "#6E4C38",
      hair: "#0A0807",
      rim: "#5D7FB8",
    });
    return (
      `<div class="c03 c03-share" dir="${S.dir}" role="img" aria-label="${E(MC.label(p, o))}">` +
      bg +
      `<div class="c03-share-logo">${MC.logo("wordmark", { variant: "light", label: false })}</div>` +
      `<div class="c03-share-jacket">${full(p, { ...o, thumb: false, motion: false })}</div>` +
      `<div class="c03-share-fig">${fig}</div>` +
      cap +
      `</div>`
    );
  }

  /* ---------- interaction: tap to swing, tilt for sheen, long-press to press and peel ---------- */
  function mount(el, o = {}) {
    if (!el || !el.classList || !el.classList.contains("c03-card")) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const svg = el.querySelector("svg");
    const swing = el.querySelector(".c03-swing");
    const sheen = el.querySelector(".c03-sheen");
    const press = el.querySelector(".c03-press");
    const numG = el.querySelector(".c03-num");
    if (!svg || !swing) return;
    const buzz = (pat) => {
      try {
        if (navigator.vibrate) navigator.vibrate(pat);
      } catch (e) {}
    };
    const doSwing = () => {
      swing.classList.remove("c03-swinging");
      void swing.getBoundingClientRect();
      swing.classList.add("c03-swinging");
    };
    el.addEventListener("pointermove", (e) => {
      if (!sheen) return;
      const r = el.getBoundingClientRect();
      const k = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      sheen.setAttribute("transform", `translate(${(k * 40).toFixed(1)} 0)`);
    });
    // press: a dark platen comes down, holds 1.2s, lifts; then a carrier film to peel
    let timer = null, startX = 0, startY = 0, moved = false, pressing = false, film = null;
    const NS = "http://www.w3.org/2000/svg";
    const x0 = 64, y0 = 158, x1 = 236, y1 = 272;
    function showFilm() {
      if (!press || !numG) return;
      press.innerHTML = "";
      film = document.createElementNS(NS, "g");
      film.setAttribute("class", "c03-film");
      const n = numG.querySelector("text");
      const mir = n ? `<g transform="translate(300 0) scale(-1 1)" opacity=".28">${n.outerHTML.replace(/filter="[^"]*"/, "").replace(/transform="[^"]*"/, "")}</g>` : "";
      film.innerHTML =
        `<g class="c03-film-sheet"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="#E9F1FF" fill-opacity=".34"/>${mir}<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".8"/></g>` +
        `<path class="c03-film-flap" d="" fill="#F4F8FF" fill-opacity=".75"/>` +
        `<circle class="c03-film-grip" cx="${x0 + 6}" cy="${y1 - 6}" r="5" fill="#fff" fill-opacity=".5"/>`;
      press.appendChild(film);
    }
    function peel(d) {
      if (!film) return;
      const sheet = film.querySelector(".c03-film-sheet");
      const flap = film.querySelector(".c03-film-flap");
      const grip = film.querySelector(".c03-film-grip");
      sheet.setAttribute("clip-path", "");
      sheet.style.clipPath = `polygon(${x0}px ${y0}px, ${x1}px ${y0}px, ${x1}px ${y1}px, ${x0 + d}px ${y1}px, ${x0}px ${y1 - d}px)`;
      flap.setAttribute("d", `M${x0} ${y1 - d}L${x0 + d} ${y1}L${x0 + d} ${y1 - d}Z`);
      if (grip) grip.setAttribute("opacity", "0");
      if (d > 0.6 * (x1 - x0)) {
        buzz(18);
        film.classList.add("c03-film-gone");
        const f = film;
        film = null;
        setTimeout(() => f.remove(), 260);
        el.classList.remove("c03--revealed");
        void el.offsetWidth;
        el.classList.add("c03--revealed");
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
        el.classList.add("c03--pressing");
        buzz([20, 60, 20, 60, 20, 60, 30]);
        setTimeout(() => {
          el.classList.remove("c03--pressing");
          el.classList.add("c03--lifted");
          buzz(25);
          setTimeout(() => el.classList.remove("c03--lifted"), 400);
          showFilm();
        }, 1200);
      }, 1200);
    });
    el.addEventListener("pointermove", (e) => {
      const dx = e.clientX - startX, dy = e.clientY - startY;
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
    id: "c03",
    n: 3,
    slug: "03",
    name: "Flocage",
    nameAr: "الرقم على الظهر",
    category: "safe",
    philosophy: "Your card is your own bench jacket on a dressing-room hook, and the only thing that can press a new number onto its back is your season.",
    philosophyAr: "بطاقتك هي سترتك معلّقة في غرفة الملابس، ولا يطبع رقمًا جديدًا على ظهرها إلا أداؤك في الموسم.",
    idea: [
      "The card is a garment, not a rectangle: the manager's own bench jacket, hung on a dressing-room hook with its back to you. It joins two rituals Moroccan fans already have — having a name and number heat-pressed onto a replica at the kit shop, and the matchday photo of shirts waiting on their hooks.",
      "On BotolaGO you cannot choose the number. The press prints your OVR where a squad number goes; ALI sits above it like a shirt name; the four decision stats run along the shoulder slopes like the small prints on a real kit; the tier is a woven sleeve tab; the club is a woven disc on the other sleeve; FOUNDER 2026 is the jock tag in the hem.",
      "The tier is not a colour. It is how the number is made: hand-cut cracked vinyl, then glossy heat-transfer, then flock over a Logo Blue under-layer, then three stitched layers of tackle twill, then four layers in relief under a raking light. The layer count is the tier, and it reads in a single ink.",
      "The jacket is the shared avatar's own bench jacket — collar and yoke seam — hung empty. The figure itself appears in the share image, back to camera, looking at it.",
    ],
    belonging: [
      "Every kid has picked a 10 or a 7 for a replica. Here the number on your back is earned, so 'j'ai 84 dans le dos' is a sentence people will actually say, and a friend's 78 is visibly less cloth.",
      "Each tier changes how the number is built, so a CHAMPION's three stitched layers next to a PRO's flock reads across the table without a legend. You can almost feel the difference, which is what makes the next one worth chasing.",
      "A league becomes a dressing room: every manager's jacket on its peg, in rank order, with your own peg's hook lit. Screenshotting your row is screenshotting your shirt on the rail.",
      "The founder tag is sewn in the season you joined and never changes, so years later it still says where you started.",
    ],
    founderMark: [
      "FOUNDER 2026 is a woven jock tag — the authenticity label of a match shirt — sewn into the hem at the bottom-start corner and hanging below it. It changes the outline itself, so a founder's jacket has a different silhouette from everyone else's, even painted as one solid shape.",
      "Cream damask with a twill weave and a dashed brass-thread border, woven in navy: the founder line, the BOT serial and a roundel carrying '26'. It is identical at HOMA and at LEGEND — it records when you arrived, not how good you are.",
      "Later cohorts get a flat tag sewn inside the hem, invisible from outside. At 24px the founder mark survives as a 3px cream nub at the hem corner.",
    ],
    small: [
      "44–80px: the outline alone — hook, collar, sloped shoulders, long sleeves, stepped hem corners — in navy with the 84 in white. The tier lives in the hardware and in how the number is cut: bent nail and cracked vinyl (HOMA), steel hook and flat print (STADE), brass hook and one blue outline (PRO), two outlines (CHAMPION), a round brass peg, cream collar and three stacked outlines with a hard cast (LEGEND).",
      "24–32px: a simpler collar-and-shoulder trapezoid with the sleeve steps and the 84 at 10–13px. The hook stays at 28px and up and drops at 24px. The tier moves to the hem line (dashed, single, double, brass plus thin) and LEGEND inverts to a cream jacket with a navy number, the one change that still reads at 24px.",
      "On the dark app ground every size carries the 1px #737B86 rim the app already uses for ink surfaces, so the navy never dissolves into the page; on the light ground the rim drops and a soft wall shadow takes over.",
    ],
    rtl: [
      "The jacket is an object, so it never mirrors: hook, sleeve tab, club disc and founder tag stay where they are, and the light still comes from the top-left.",
      "The text on it does change: علي is set in Changa 800 at the Latin cap height with room for its descender; the stat pair that starts the reading sits on the right shoulder; the neck print becomes المغرب; the founder line is woven in Arabic. No tracking on Arabic anywhere; serials, seasons and the 84 stay left-to-right.",
      "Rows and the share image mirror their layout (rank and caption start on the right) while the jacket token inside them stays unmirrored.",
    ],
    tiers: {
      HOMA: "A matte cotton training top with a crew neck, hung on a bent nail — the neckline pulled into a peak where it catches. Hand-cut iron-on vinyl, one layer, set 1.5° off and cracked from washing. The tier word is ironed straight onto the sleeve: no patches, no piping, no crest.",
      STADE: "A polyester piqué bench jacket with a stand-up collar, on a steel hook with a hanger loop. Glossy heat-transfer vinyl with one specular streak — one clean layer — and the faint rectangle the platen leaves. The tier is printed on the sleeve.",
      PRO: "A brass hook, slate club piping along the shoulder seams, a woven navy sleeve tab with a merrow edge and a woven club disc. The number is matte flock (fibre grain, a soft emboss) over a Logo Blue twill under-layer: two layers.",
      CHAMPION: "Tackle twill in three layers — white over Logo Blue over Tunnel Navy — each with a visible satin-stitch edge. A quilted lining shows at the collar, and the sleeve tab turns cream damask with brass thread.",
      LEGEND: "A heavier brushed fabric, a turned brass peg instead of a hook (the top of the silhouette changes), a tall collar whose cream jacquard tape carries the four stats, and the number in four layers — club colour outermost — with hard cast shadows under a raking light. No press mark: it is stitched, not pressed. Fewer things, more relief.",
    },
    legend: [
      "The press. The screen dims to the dressing room; a dark platen comes down over the jacket with a contact tick, holds for 1.2s while four short haptic pulses ramp, then lifts with a release thunk.",
      "The carrier film is still on, glossy, showing the number mirrored. You peel it yourself from the bottom-start corner; it curls under the finger and tears free at 60% of its travel.",
      "Underneath, the four-layer number catches one raking light that sweeps across the back once, so the relief shadows move. It can be replayed; under reduced motion it is a 180ms fade to the finished jacket. (In the lab: tap the detail card to swing it on its hook, hold 1.2s to press, then drag the bottom-left corner to peel.)",
    ],
    advantages: [
      "Understood in a second by anyone who has had a shirt printed; it needs no explanation of what a 'card' is.",
      "The back view is faceless by design and neutral on gender and skin, which also settles the avatar question.",
      "The layer ladder (1, 1, 2, 3, then 4 cut layers) reads in one ink, survives JPEG compression and still separates tiers in a 1-bit silhouette.",
      "The outline — hook, long sleeves, stepped hem, founder tag — belongs to nobody else in fantasy football and holds as a solid shape at 28px on both grounds.",
      "The press is the strongest ritual in the set and maps exactly onto the moment that matters: 'your OVR changed'.",
    ],
    risks: [
      "Collision with the app's Fantasy shirts: at 44px a shirt-like token can read as 'a player'. The hook, the long sleeves and the navy-only body are non-negotiable, and club colour must stay piping, never the body.",
      "Managers do not wear numbers. The first time, it needs one line of copy ('the press prints your OVR') or the 84 reads as a squad number.",
      "'Flocage' as the word teenagers use for kit printing in Morocco is an assumption that needs checking with real users.",
      "An empty jacket can feel lonely; the concept leans on the share image to put the person back in front of it.",
      "At 24px without the hook it drifts toward a generic garment glyph, and the hem-line tier cue there is a 1px line most people will not notice.",
      "The shoulder prints and the jock tag are 5–8 units tall: atmosphere at 200px, legible only from about 340px wide.",
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
