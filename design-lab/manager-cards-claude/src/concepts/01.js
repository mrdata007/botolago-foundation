/* 01 LUCARNE (safe).
   The card is a five-a-side goal seen from the penalty spot, over the manager's shoulder.
   The mouth is see-through (a net drawn as lines over whatever ground the card sits on),
   the 84 sits in the top corner of the net (la lucarne), the four stats are painted in one
   band along the crossbar, and the founder mark is the concrete footing the end post is
   set into, with 2026 struck into it.
   Tiers rebuild the goal itself: two schoolbags and a chalk drawing (HOMA), a goal painted
   on a breeze-block wall (STADE), the welded cage of a neighbourhood pitch (PRO), a white
   aluminium box goal (CHAMPION), and an enamel match goal under its own floodlight with the
   ball still lodged in the corner of the net (LEGEND).
   The goal is an object, so it never mirrors in Arabic; the 84 stays in the top-right corner. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const r1 = (n) => Math.round(n * 10) / 10;
  const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Seeded generator (mulberry32): the chalk wobble is fixed per manager. */
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- geometry: viewBox 0 0 360 260, a 3 m x 2 m goal ---------- */
  const VW = 360;
  const VH = 260;
  const MO = { x0: 52, x1: 308, y0: 54, y1: 228 }; // the mouth (see-through)
  const EYE = { x: 180, y: 89, f: 516 }; // penalty spot, eye at 1.6 m
  const POCKET = { x: 228, y: 117 }; // where the 84 went in
  const BALL = { x: 318, y: 15, r: 9 }; // LEGEND: the ball still lodged in the corner of the net
  const BAG = "M290 30C296 18 304 6.5 316 5.2C326 4.2 331.5 11 331 18C330.5 26 326.5 34 320 44V30Z";
  const LAMP = { x: 352, y: 7 }; // LEGEND floodlight head, entering from the top-end corner
  const FIG = { x: -8, y: 150, w: 98, h: 117.6 }; // the manager: head and shoulders, cropped at the chest by the bottom edge
  const POST_END = 314; // centre of the end post (the footing sits under it)

  const project = (P) => {
    const s = EYE.f / (EYE.f + P[2]);
    return [EYE.x + (P[0] - EYE.x) * s, EYE.y + (P[1] - EYE.y) * s];
  };
  const lerp3 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
  const dist3 = (A, B) => Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const bil = (q, u, v) => lerp3(lerp3(q[0], q[1], u), lerp3(q[3], q[2], u), v);

  /* Net surfaces in 3D (x across, y down, z away from the viewer). Each quad: A→B is s, A→D is t. */
  const box = (dt, db) => () => {
    const { x0, x1, y0, y1 } = MO;
    return [
      [[x0, y0, dt], [x1, y0, dt], [x1, y1, db], [x0, y1, db]],
      [[x0, y0, 0], [x1, y0, 0], [x1, y0, dt], [x0, y0, dt]],
      [[x0, y0, 0], [x0, y0, dt], [x0, y1, db], [x0, y1, 0]],
      [[x1, y0, 0], [x1, y0, dt], [x1, y1, db], [x1, y1, 0]],
    ];
  };
  const boxEdges = (dt, db) => () => {
    const { x0, x1, y0, y1 } = MO;
    return {
      bars: [
        [[x0, y0, dt], [x1, y0, dt]],
        [[x0, y1, db], [x1, y1, db]],
      ],
      stays: [
        [[x0, y0, dt], [x0, y1, db]],
        [[x1, y0, dt], [x1, y1, db]],
      ],
      sides: [
        [[x0, y0, 0], [x0, y0, dt]],
        [[x1, y0, 0], [x1, y0, dt]],
        [[x0, y1, 0], [x0, y1, db]],
        [[x1, y1, 0], [x1, y1, db]],
      ],
    };
  };
  const LG = { ym: 140, dt: 58, dm: 182 };
  const legendPlanes = () => {
    const { x0, x1, y0, y1 } = MO;
    const { ym, dt, dm } = LG;
    return [
      [[x0, y0, 0], [x1, y0, 0], [x1, y0, dt], [x0, y0, dt]],
      [[x0, y0, dt], [x1, y0, dt], [x1, ym, dm], [x0, ym, dm]],
      [[x0, ym, dm], [x1, ym, dm], [x1, y1, dm], [x0, y1, dm]],
      [[x0, y0, 0], [x0, y0, dt], [x0, ym, dm], [x0, ym, 0]],
      [[x0, ym, 0], [x0, ym, dm], [x0, y1, dm], [x0, y1, 0]],
      [[x1, y0, 0], [x1, y0, dt], [x1, ym, dm], [x1, ym, 0]],
      [[x1, ym, 0], [x1, ym, dm], [x1, y1, dm], [x1, y1, 0]],
    ];
  };
  const legendEdges = () => {
    const { x0, x1, y0, y1 } = MO;
    const { ym, dt, dm } = LG;
    return {
      bars: [
        [[x0, y0, dt], [x1, y0, dt]],
        [[x0, ym, dm], [x1, ym, dm]],
        [[x0, y1, dm], [x1, y1, dm]],
      ],
      stays: [
        [[x0, y0, dt], [x0, ym, dm]],
        [[x1, y0, dt], [x1, ym, dm]],
        [[x0, ym, dm], [x0, y1, dm]],
        [[x1, ym, dm], [x1, y1, dm]],
      ],
      sides: [
        [[x0, y0, 0], [x0, y0, dt]],
        [[x1, y0, 0], [x1, y0, dt]],
        [[x0, y1, 0], [x0, y1, dm]],
        [[x1, y1, 0], [x1, y1, dm]],
      ],
    };
  };

  /* ---------- tiers (rim: the figure's lit edge, dx > 0 is the end side) ---------- */
  const TIER = {
    HOMA: { k: "homa", rim: { c: "#ffd58a", dx: 0, dy: -1.5 } },
    STADE: { k: "stade", rim: { c: "#c9d2dc", dx: 0.9, dy: -0.9 } },
    PRO: { k: "pro", net: "diamond", pitch: 11, planes: box(86, 86), edges: boxEdges(86, 86), pinch: 0.24, sigma: 46, cord: 0.85, rim: { c: "#9bdbfd", dx: 1.2, dy: -0.5 } },
    CHAMPION: { k: "champion", net: "square", pitch: 10, planes: box(62, 128), edges: boxEdges(62, 128), pinch: 0.32, sigma: 50, cord: 0.8, knot: 1.9, rim: { c: "#e9f6ff", dx: 1.4, dy: -0.8 } },
    LEGEND: { k: "legend", net: "square", pitch: 12, planes: legendPlanes, edges: legendEdges, pinch: 0.42, sigma: 56, cord: 1.0, knot: 1.8, dropV: [2], rim: { c: "#eaf6ff", dx: 2, dy: -1, halo: true } },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;

  /** The net as projected polylines, pinched toward the pocket (and, while tapped, toward the tap). */
  function buildNet(spec, opt = {}) {
    const pitch = spec.pitch * (opt.pitchMul || 1);
    const at = opt.pk || POCKET;
    const pins = [];
    if (opt.pinch !== false) pins.push({ x: at.x, y: at.y, k: spec.pinch * (opt.pinchMul == null ? 1 : opt.pinchMul), s: spec.sigma });
    if (opt.extra) pins.push(opt.extra);
    const pinch = (P) => {
      let Q = P;
      for (const pk of pins) {
        const dx = Q[0] - pk.x;
        const dy = Q[1] - pk.y;
        const f = 1 - pk.k * Math.exp(-(dx * dx + dy * dy) / (2 * pk.s * pk.s));
        Q = [pk.x + dx * f, pk.y + dy * f];
      }
      return Q;
    };
    let d = "";
    let knots = "";
    const line = (q, u0, v0, u1, v1, len) => {
      const n = Math.max(1, Math.ceil(len / 5));
      const pts = [];
      let dev = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const P = project(bil(q, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t));
        const Q = pinch(P);
        dev = Math.max(dev, Math.abs(Q[0] - P[0]) + Math.abs(Q[1] - P[1]));
        pts.push(Q);
      }
      const use = dev < 0.25 ? [pts[0], pts[pts.length - 1]] : pts;
      d += "M" + use.map((P) => r1(P[0]) + " " + r1(P[1])).join("L");
    };
    spec.planes().forEach((q, qi) => {
      const Ls = Math.max(dist3(q[0], q[1]), dist3(q[3], q[2]));
      const Lt = Math.max(dist3(q[0], q[3]), dist3(q[1], q[2]));
      if (spec.net === "square") {
        const ns = Math.max(1, Math.round(Ls / pitch));
        const nt = Math.max(1, Math.round(Lt / pitch));
        const noV = spec.dropV && spec.dropV.includes(qi);
        if (!noV) for (let i = 1; i < ns; i++) line(q, i / ns, 0, i / ns, 1, Lt);
        for (let j = 1; j < nt; j++) line(q, 0, j / nt, 1, j / nt, Ls);
        if (spec.knot && !opt.noKnots && !noV)
          for (let i = 1; i < ns; i++)
            for (let j = 1; j < nt; j++) {
              const Q = pinch(project(bil(q, i / ns, j / nt)));
              knots += `M${r1(Q[0])} ${r1(Q[1])}h0`;
            }
      } else {
        // chain-link: two families of slanted wires, diamonds taller than wide
        const k = 0.72;
        const step = pitch;
        for (let c = -Lt * k + step / 2; c < Ls; c += step) {
          const ta = Math.max(0, -c / k);
          const tb = Math.min(Lt, (Ls - c) / k);
          if (tb > ta) line(q, (c + k * ta) / Ls, ta / Lt, (c + k * tb) / Ls, tb / Lt, (tb - ta) * 1.25);
        }
        for (let c = step / 2; c < Ls + Lt * k; c += step) {
          const ta = Math.max(0, (c - Ls) / k);
          const tb = Math.min(Lt, c / k);
          if (tb > ta) line(q, (c - k * ta) / Ls, ta / Lt, (c - k * tb) / Ls, tb / Lt, (tb - ta) * 1.25);
        }
      }
    });
    return { d, knots };
  }
  const seg2 = (A, B) => {
    const a = project(A);
    const b = project(B);
    return `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`;
  };

  /* ---------- filters and gradients ---------- */
  const stops = (list) =>
    list
      .map(([o, c, a]) => `<stop offset="${o}" ${c.startsWith("var(") ? `style="stop-color:${c}${a != null ? `;stop-opacity:${a}` : ""}"` : `stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}`}/>`)
      .join("");
  const lin = (id, list, x2 = 1, y2 = 0) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;
  /** Multiplies a fill by fractal noise: galvanised spangle, powder coat, canvas, breeze block. */
  const grain = (id, freq, k1, k2, seed = 3, oct = 2) =>
    `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1" result="g"/>` +
    `<feComposite in="SourceGraphic" in2="g" operator="arithmetic" k1="${k1}" k2="${k2}" k3="0" k4="0" result="m"/>` +
    `<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>`;
  /** Cast concrete: noise as a height map, lit from the top-end by feDiffuseLighting, multiplied into the fill. */
  const concrete = (id, seed = 17) =>
    `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="${seed}" result="n"/>` +
    `<feDiffuseLighting in="n" surfaceScale="2" diffuseConstant="1.1" lighting-color="#ffffff" result="l"><feDistantLight azimuth="225" elevation="56"/></feDiffuseLighting>` +
    `<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="0.42" k2="0.66" k3="0" k4="0" result="m"/>` +
    `<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>`;
  /** Chalk strokes (lines only): rough edge plus a grain that keeps about 85% of the stroke. */
  const chalkLine = (id) =>
    `<filter id="${id}" x="-4%" y="-6%" width="108%" height="112%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="12" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 0 0 0 -1.05" result="ga"/>` +
    `<feComposite in="d" in2="ga" operator="in"/></filter>`;
  /** The chalked 84: grain that runs along the strokes, at least 85% coverage, slightly rough edge. */
  const chalk84 = (id) =>
    `<filter id="${id}" x="-3%" y="-5%" width="106%" height="110%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="8" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.03 0.7" numOctaves="2" seed="21" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4.4 0 0 0 -1.15" result="ga"/>` +
    `<feComposite in="d" in2="ga" operator="in"/></filter>`;
  /** Chalk on small text: grain mask only, never displaced. */
  const chalkText = (id) =>
    `<filter id="${id}" x="-2%" y="-10%" width="104%" height="120%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="31" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3.6 0 0 0 -0.8" result="ga"/>` +
    `<feComposite in="SourceGraphic" in2="ga" operator="in"/></filter>`;
  /** Brushed wall paint: brushy edge plus streaks. */
  const paint = (id, freqEdge, freqStreak, seed, ka = -2.2, kb = 1.85, scale = 2.8) =>
    `<filter id="${id}" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freqEdge}" numOctaves="2" seed="${seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freqStreak}" numOctaves="2" seed="${seed + 7}" result="s"/>` +
    `<feColorMatrix in="s" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${ka} 0 0 0 ${kb}" result="sa"/>` +
    `<feComposite in="d" in2="sa" operator="in"/></filter>`;
  const blur = (id, sd) => `<filter id="${id}" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
  /** Turns any drawing into a flat black at the given alpha (the net's cast shadow). */
  const toShadow = (id, a) =>
    `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${a} 0"/></filter>`;

  /** Hand-drawn line: a polyline with seeded perpendicular wobble. */
  function wobble(x1, y1, x2, y2, rand, amp = 0.9, step = 14) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(2, Math.round(len / step));
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    let d = "";
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = i === 0 || i === n ? 0 : (rand() - 0.5) * 2 * amp;
      d += (i ? "L" : "M") + r1(x1 + (x2 - x1) * t + nx * w) + " " + r1(y1 + (y2 - y1) * t + ny * w);
    }
    return d;
  }

  /** Arabic text in SVG: right-to-left run, anchored by its visual right edge when `right` is true. */
  const arText = (x, y, cls, txt, right = true, extra = "") =>
    `<text x="${x}" y="${y}" class="${cls}" direction="rtl" unicode-bidi="embed" text-anchor="${right ? "start" : "end"}"${extra}>${txt}</text>`;

  /* ---------- the shared figure: the manager seen from behind, lit from the goal end ---------- */
  function figure(rim, opts = {}) {
    const { x, y, w, h } = opts.box || FIG;
    const solid = (c, seam, collar) => ({ x, y, w, h, torso: c, collar: collar || c, neck: c, skin: c, hair: c, seam });
    let rims = "";
    if (rim.halo) rims += `<g opacity=".38">${MC.avatar({ ...solid(rim.c, false), x: r1(x + rim.dx * 1.9), y: r1(y + rim.dy * 1.9) })}</g>`;
    rims += MC.avatar({ ...solid(rim.c, false), x: r1(x + rim.dx), y: r1(y + rim.dy) });
    const dark = MC.avatar(solid("#1e2d47", "#33507c", "#243856"));
    const light = MC.avatar(solid("#1d3b66", "#4a6a99", "#24467a"));
    if (opts.fixed) return `<g class="c01-fig">${rims}${dark}</g>`;
    return `<g class="c01-fig">${rims}<g class="th-d">${dark}</g><g class="th-l">${light}</g></g>`;
  }

  /* ---------- the crossbar: one continuous band, Logo Blue only for dividers and values ---------- */
  function bandRow(p, o, L, R, y, look) {
    if (o.thumb) return "";
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const order = ar ? ["CON", "TRF", "SEL", "CAP"] : ["CAP", "SEL", "TRF", "CON"]; // visual left → right
    const cw = (R - L) / 4;
    const cls = look.chalk ? "c01-bt c01-bt-homa" : "c01-bt";
    const lab = look.chalk ? "" : ` style="fill:${look.lab}"`;
    const val = look.chalk ? "" : ` style="fill:${look.val}"`;
    return order
      .map((k, i) => {
        const cx = r1(L + cw * (i + 0.5));
        const label = esc(S.stats[k]);
        const v = p.stats[k];
        const full = ar
          ? `<text x="${cx}" y="${y}" class="${cls} c01-bt-ar" text-anchor="middle" direction="rtl" unicode-bidi="embed"><tspan class="c01-bl"${lab}>${label}</tspan> <tspan class="c01-bv"${val}>${v}</tspan></text>`
          : `<text x="${cx}" y="${y}" class="${cls}" text-anchor="middle"><tspan class="c01-bl"${lab}>${label}</tspan> <tspan class="c01-bv"${val}>${v}</tspan></text>`;
        const big = `<text x="${cx}" y="${r1(y + 2.6)}" class="c01-btv${look.chalk ? " c01-btv-homa" : ""}" text-anchor="middle"${val}>${v}</text>`;
        return full + big;
      })
      .join("");
  }
  const dividers = (L, R, y0, h, w, fill) => {
    const cw = (R - L) / 4;
    let s = "";
    for (let i = 1; i < 4; i++) s += `<rect x="${r1(L + cw * i - w / 2)}" y="${y0}" width="${w}" height="${h}" fill="${fill}"/>`;
    return s;
  };

  /** Club tape: two wraps on the start post (primary 5u, secondary 3u), lit along their top edges. */
  function tape(p, L, pw, painted, u) {
    const c = p.club;
    const s =
      `<rect x="${r1(L - 0.4)}" y="150" width="${r1(pw + 0.8)}" height="5" fill="${c.primary}"/>` +
      `<rect x="${r1(L - 0.4)}" y="155.6" width="${r1(pw + 0.8)}" height="3" fill="${c.secondary}"/>` +
      `<rect x="${r1(L - 0.4)}" y="159.2" width="${r1(pw + 0.8)}" height="2.6" fill="${c.primary}"/>`;
    if (painted) return `<g filter="url(#${u}-paintH)">${s}</g>`;
    return (
      s +
      `<path d="M${r1(L - 0.4)} 150.3h${r1(pw + 0.8)}M${r1(L - 0.4)} 155.9h${r1(pw + 0.8)}M${r1(L - 0.4)} 159.5h${r1(pw + 0.8)}" stroke="#ffffff" stroke-width=".5" opacity=".55"/>` +
      `<rect x="${r1(L + pw * 0.7)}" y="150" width="${r1(pw * 0.3 + 0.4)}" height="11.8" fill="#000" opacity=".22"/>`
    );
  }
  /** Club sticker wrapped round the end post. */
  function sticker(p, cx, cy, rx) {
    const c = p.club;
    const ry = 7.6;
    return (
      `<g class="c01-fine">` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 0.8}" ry="${ry + 0.8}" fill="#f4f1ea"/>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c.primary}"/>` +
      `<g transform="translate(${r1(cx - rx * 0.62)} ${r1(cy - ry * 0.72)})">${MC.crest({ mono: c.secondary, w: r1(rx * 1.24), h: r1(ry * 1.44) })}</g>` +
      `<ellipse cx="${r1(cx + rx * 0.45)}" cy="${cy}" rx="${r1(rx * 0.55)}" ry="${ry + 0.8}" fill="#000" opacity=".18"/>` +
      `</g>`
    );
  }

  function frameDefs(u, tk) {
    let d = blur(`${u}-soft`, 5) + concrete(`${u}-conc`) + toShadow(`${u}-shadow`, 0.15);
    d += `<radialGradient id="${u}-pocket" cx="${POCKET.x}" cy="${POCKET.y}" r="78" gradientUnits="userSpaceOnUse">${stops([[0, "var(--c01-pocket)"], [1, "var(--c01-pocket)", 0]])}</radialGradient>`;
    if (tk === "pro")
      d +=
        lin(`${u}-tube`, [[0, "#6e7884"], [0.45, "#d5dce3"], [0.7, "#8f9aa5"], [1, "#6e7884"]]) +
        lin(`${u}-shade`, [[0, "#000", 0.3], [0.2, "#000", 0.03], [0.38, "#fff", 0.3], [0.55, "#fff", 0], [0.84, "#000", 0.1], [1, "#000", 0.34]], 0, 1) +
        lin(`${u}-spec`, [[0, "#fff", 0], [0.55, "#fff", 0.25], [1, "#fff", 0.9]]) +
        lin(`${u}-specV`, [[0, "#fff", 0.85], [1, "#fff", 0.05]], 0, 1) +
        grain(`${u}-spangle`, 0.42, 0.55, 0.76, 7) +
        grain(`${u}-bandpaint`, "0.9 0.25", 0.2, 0.9, 13, 2);
    if (tk === "champion")
      d +=
        lin(`${u}-tube`, [[0, "#c9d2dc"], [0.3, "#ffffff"], [0.62, "#eef2f5"], [1, "#b9c3ce"]]) +
        lin(`${u}-shade`, [[0, "#000", 0.2], [0.18, "#000", 0.02], [0.34, "#fff", 0.5], [0.5, "#fff", 0], [0.86, "#000", 0.07], [1, "#000", 0.22]], 0, 1) +
        lin(`${u}-spec`, [[0, "#e9f6ff", 0], [0.5, "#e9f6ff", 0.4], [1, "#ffffff", 1]]) +
        lin(`${u}-specV`, [[0, "#fff", 1], [1, "#e9f6ff", 0.15]], 0, 1) +
        `<radialGradient id="${u}-glint">${stops([[0, "#ffffff", 1], [0.25, "#e9f6ff", 0.7], [1, "#e9f6ff", 0]])}</radialGradient>` +
        grain(`${u}-powder`, 1.1, 0.16, 0.93, 9, 1);
    if (tk === "legend")
      d +=
        lin(`${u}-tube`, [[0, "#ffffff"], [0.3, "#f2f4f6"], [0.85, "#c9d2dc"], [1, "#e9eef3"]]) +
        lin(`${u}-bar`, [[0, "#ffffff"], [0.3, "#f6f8fa"], [0.72, "#d3dae2"], [0.9, "#c9d2dc"], [1, "#eef2f6"]], 0, 1) +
        lin(`${u}-enamel`, [[0, "#ffffff"], [0.55, "#f7f9fb"], [1, "#e8edf2"]], 0, 1) +
        lin(`${u}-specV`, [[0, "#fff", 1], [1, "#fff", 0.1]], 0, 1) +
        lin(`${u}-mast`, [[0, "#6e7884"], [0.4, "#d5dce3"], [1, "#6e7884"]]) +
        `<clipPath id="${u}-goalbox"><rect x="40" y="30" width="280" height="204"/></clipPath>` +
        `<clipPath id="${u}-bagc"><path d="${BAG}"/></clipPath>` +
        `<clipPath id="${u}-linec"><rect x="0" y="228" width="${VW}" height="6"/></clipPath>`;
    if (tk === "homa")
      d +=
        chalkLine(`${u}-chalk`) +
        chalk84(`${u}-chalk84`) +
        chalkText(`${u}-chalkt`) +
        lin(`${u}-canvas`, [[0, "#3d6f9f"], [0.5, "#2f5d8a"], [1, "#24496f"]], 0, 1) +
        grain(`${u}-weave`, "0.9 0.9", 0.5, 0.78, 21, 1) +
        grain(`${u}-breeze`, 0.85, 0.42, 0.8, 41, 2) +
        `<radialGradient id="${u}-lamp" cx="150" cy="96" r="150" gradientTransform="translate(150 96) scale(1 .72) translate(-150 -96)" gradientUnits="userSpaceOnUse">${stops([[0, "var(--c01-lamp)", 0.17], [0.55, "var(--c01-lamp)", 0.06], [1, "var(--c01-lamp)", 0]])}</radialGradient>` +
        `<clipPath id="${u}-wall"><rect width="${VW}" height="228"/></clipPath>`;
    if (tk === "stade")
      d +=
        paint(`${u}-paintV`, "0.7 0.05", "0.9 0.02", 8, -1.7, 1.75) +
        paint(`${u}-paintH`, "0.05 0.7", "0.02 0.9", 3, -1.0, 1.44) +
        paint(`${u}-paint84`, "0.5 0.5", "0.04 0.9", 5, -1.2, 1.62, 1.4) +
        grain(`${u}-breeze`, 0.85, 0.42, 0.8, 41, 2);
    return d;
  }

  /** Posts, crossbar with its stats band, club tape and sticker. */
  function frame(u, p, o, tk) {
    const thumb = !!o.thumb;
    if (tk === "homa") {
      const rand = rng(parseInt(p.serial, 10) || 7);
      const endTop = p.founder ? 168 : 182;
      let d = wobble(46, 182, 45, 27, rand, 0.8) + wobble(314, endTop, 315, 28, rand, 0.8);
      const bars = wobble(40, 31.5, 320, 32.5, rand, 0.7) + wobble(43, 53, 318, 52.5, rand, 0.7);
      let ticks = "";
      [110, 180, 250].forEach((x) => (ticks += wobble(x + (rand() - 0.5) * 2, 36, x + (rand() - 0.5) * 2, 49.5, rand, 0.4, 8)));
      return (
        `<g filter="url(#${u}-chalk)" class="c01-chalk">` +
        `<path d="${d}" fill="none" stroke-width="4.6" stroke-linecap="round"/>` +
        `<path d="${bars}" fill="none" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="${ticks}" fill="none" stroke-width="2" stroke-linecap="round" opacity=".85"/>` +
        `</g>` +
        `<g filter="url(#${u}-chalkt)" class="c01-chalkfill">${bandRow(p, o, 40, 320, 46.6, { chalk: true })}</g>`
      );
    }
    if (tk === "stade") {
      return (
        `<g filter="url(#${u}-paintV)"><rect x="40" y="52" width="12" height="176" class="c01-wallpaint"/><rect x="308" y="52" width="12" height="176" class="c01-wallpaint"/></g>` +
        `<g filter="url(#${u}-paintH)"><rect x="40" y="30" width="280" height="24" class="c01-wallpaint"/>${dividers(40, 320, 31.5, 21, 3, "#0151fc")}</g>` +
        bandRow(p, o, 40, 320, 47, { lab: "#3a4554", val: "#0151fc" }) +
        (thumb ? "" : tape(p, 40, 12, true, u)) +
        (thumb ? "" : sticker(p, POST_END, 186, 5.8))
      );
    }
    const L = tk === "champion" ? 38 : 40;
    const R = tk === "champion" ? 322 : 320;
    const pw = MO.x0 - L;
    const keyline = `<path d="M${L} 228V30H${R}V228" class="c01-key" fill="none" stroke-width="2.2"/><path d="M${MO.x0} 228V54H${MO.x1}V228" class="c01-key" fill="none" stroke-width="2.2"/>`;
    let posts = "";
    let bar = "";
    if (tk === "legend") {
      // polished enamel posts: one navy reflection stripe and one white hairline each
      const refl = (x0) =>
        `<rect x="${r1(x0 + pw * 0.62)}" y="56" width="1.5" height="170" fill="#0c3164" opacity=".3"/>` +
        `<rect x="${r1(x0 + pw * 0.26)}" y="56" width=".6" height="170" fill="#ffffff"/>`;
      posts =
        `<rect x="${L}" y="54" width="${pw}" height="174" fill="url(#${u}-tube)"/>` +
        `<rect x="${MO.x1}" y="54" width="${pw}" height="174" fill="url(#${u}-tube)" transform="translate(${MO.x1 * 2 + pw} 0) scale(-1 1)"/>` +
        refl(L) +
        refl(MO.x1) +
        `<path d="M${MO.x0 - 0.5} 55V228M${MO.x1 + 0.5} 55V228M${MO.x0} 54.5H${MO.x1}" stroke="#ffffff" stroke-width="1"/>`;
      // the polished bar, with the stats as an enamel inlay set into it
      const iy0 = 33.2;
      const ih = 17.6;
      bar =
        `<rect x="${L}" y="30" width="${R - L}" height="24" fill="url(#${u}-bar)"/>` +
        `<rect x="${L}" y="31.1" width="${R - L}" height=".6" fill="#ffffff"/>` +
        `<rect x="${L}" y="51.6" width="${R - L}" height="1.5" fill="#0c3164" opacity=".3"/>` +
        `<rect x="${L + 3}" y="${iy0}" width="${R - L - 6}" height="${ih}" fill="url(#${u}-enamel)"/>` +
        `<rect x="${L + 3}" y="${iy0}" width="${R - L - 6}" height=".8" fill="#8f9aa5"/>` +
        `<rect x="${L + 3}" y="${iy0}" width=".8" height="${ih}" fill="#a9b3bd"/>` +
        `<rect x="${L + 3}" y="${r1(iy0 + ih - 0.8)}" width="${R - L - 6}" height=".8" fill="#ffffff"/>` +
        `<rect x="${R - 3.8}" y="${iy0}" width=".8" height="${ih}" fill="#ffffff"/>` +
        dividers(L, R, iy0 + 0.8, ih - 1.6, 2.6, "#0151fc") +
        dividers(L - 0.9, R - 0.9, iy0 + 0.8, ih - 1.6, 0.5, "#9fc0ff") +
        `<rect x="${L + 4}" y="${r1(iy0 + 1.4)}" width="${R - L - 8}" height=".6" fill="#ffffff" opacity=".9"/>` +
        bandRow(p, o, L, R, 47, { lab: "#4e5661", val: "#0151fc" });
    } else {
      const steelFilter = tk === "pro" ? ` filter="url(#${u}-spangle)"` : ` filter="url(#${u}-powder)"`;
      posts =
        `<g${steelFilter}><rect x="${L}" y="54" width="${pw}" height="174" fill="url(#${u}-tube)"/><rect x="${MO.x1}" y="54" width="${pw}" height="174" fill="url(#${u}-tube)"/></g>` +
        `<rect x="${r1(L + pw * 0.36)}" y="57" width="${tk === "champion" ? 1.2 : 1.5}" height="168" fill="url(#${u}-specV)" opacity="${tk === "champion" ? 0.9 : 0.55}"/>` +
        `<rect x="${r1(MO.x1 + pw * 0.36)}" y="57" width="${tk === "champion" ? 1.4 : 1.7}" height="168" fill="url(#${u}-specV)"/>`;
      if (tk === "pro") {
        bar =
          `<rect x="${L}" y="30" width="${R - L}" height="24" fill="#8f9aa5"${steelFilter}/>` +
          `<rect x="${L + 2}" y="32.5" width="${R - L - 4}" height="19" fill="#eef1f4" filter="url(#${u}-bandpaint)"/>` +
          dividers(L, R, 32.5, 19, 2.4, "#0151fc") +
          bandRow(p, o, L, R, 47, { lab: "#4e5661", val: "#0151fc" }) +
          `<rect x="${L}" y="30" width="${R - L}" height="24" fill="url(#${u}-shade)"/>` +
          `<rect x="${L + 60}" y="37.6" width="${R - L - 62}" height="1.3" fill="url(#${u}-spec)" opacity=".6"/>`;
        let w = "";
        for (let x = L + 1.2; x < MO.x0; x += 2.4) w += `<circle cx="${r1(x)}" cy="54.6" r="1"/><circle cx="${r1(x + MO.x1 - L)}" cy="54.6" r="1"/>`;
        bar += `<g fill="#7e8893">${w}</g>`;
      } else {
        // printed decal on white powder coat: blue pinstripes, blue dividers
        bar =
          `<rect x="${L}" y="30" width="${R - L}" height="24" fill="#eef2f5"${steelFilter}/>` +
          `<rect x="${L + 2}" y="32.5" width="${R - L - 4}" height="19" fill="#fbfcfd"/>` +
          `<rect x="${L + 2}" y="33" width="${R - L - 4}" height="1" fill="#0151fc"/><rect x="${L + 2}" y="50" width="${R - L - 4}" height="1" fill="#0151fc"/>` +
          dividers(L, R, 34, 16, 2.4, "#0151fc") +
          bandRow(p, o, L, R, 47, { lab: "#4e5661", val: "#0151fc" }) +
          `<rect x="${L}" y="30" width="${R - L}" height="24" fill="url(#${u}-shade)"/>` +
          `<rect x="${L + 60}" y="37.2" width="${R - L - 62}" height="1.1" fill="url(#${u}-spec)" opacity=".7"/>` +
          `<ellipse cx="${MO.x1 + 7}" cy="40" rx="9" ry="3.2" fill="url(#${u}-glint)"/>` +
          `<ellipse cx="${MO.x1 + 7.5}" cy="74" rx="2.6" ry="10" fill="url(#${u}-glint)"/>`;
      }
    }
    return keyline + posts + bar + (thumb ? "" : tape(p, L, pw, false, u)) + (thumb ? "" : sticker(p, r1(MO.x1 + pw / 2), 186, r1(pw / 2 - 0.4)));
  }

  /** Rear structure seen through the mouth: depth lines, box frame or stanchions. */
  function rear(u, spec, tk) {
    if (!spec.edges) return "";
    const E = spec.edges();
    if (tk === "pro") {
      const d = [...E.bars, ...E.stays, ...E.sides].map(([a, b]) => seg2(a, b)).join("");
      return `<path d="${d}" stroke="#6e7884" stroke-width="1" fill="none"/>`;
    }
    if (tk === "champion") {
      const stays = E.stays.map(([a, b]) => seg2(a, b)).join("");
      const rest = [...E.bars, ...E.sides].map(([a, b]) => seg2(a, b)).join("");
      return (
        `<g fill="none" stroke-linecap="round"><path d="${stays + rest}" class="c01-key" stroke-width="4.4"/>` +
        `<path d="${rest}" stroke="#dfe5eb" stroke-width="2"/><path d="${stays}" stroke="#eef2f5" stroke-width="3"/><path d="${stays}" stroke="#ffffff" stroke-width=".9" transform="translate(-.6 0)"/></g>`
      );
    }
    const all = [...E.bars, ...E.stays, ...E.sides].map(([a, b]) => seg2(a, b)).join("");
    return `<g fill="none" stroke-linecap="round"><path d="${all}" class="c01-key" stroke-width="2.6"/><path d="${all}" class="c01-rearl" stroke-width="1.2"/></g>`;
  }

  /* ---------- text inside the mouth ---------- */
  function fitSize(n, base, min, max, perChar) {
    const est = n * perChar * base;
    return est <= max ? base : Math.max(min, Math.floor((base * max) / est));
  }
  function content(p, o, tk, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const thumb = !!o.thumb;
    const name = MC.nameOf(p, o);
    const draw = [];
    const knock = [];
    const ko = (s, w = 6, extraCls = "") =>
      knock.push(s.replace(/ filter="[^"]*"/, "").replace("<text ", `<text ${extraCls ? `data-ko="${extraCls}" ` : ""}style="fill:#000;stroke:#000;stroke-width:${w};stroke-linejoin:round" `));
    const wall = tk === "stade"; // text sits on the breeze-block wall, not on the page
    const inkCls = tk === "homa" ? "c01-chalkfill" : wall ? "c01-wpaint" : "c01-ink";
    const mutedCls = wall ? "c01-wink" : "c01-muted";
    const tierCls = wall ? "c01-wink" : "c01-tierc";
    // the 84, in the top corner
    const ovr = String(p.ovr);
    const fx = tk === "homa" ? ` filter="url(#${opts.u}-chalk84)"` : wall ? ` filter="url(#${opts.u}-paint84)"` : "";
    const t84 = `<text x="${POCKET.x}" y="150" class="c01-84 ${inkCls}" text-anchor="middle"${fx}>${ovr}</text>`;
    draw.push(t84);
    if (tk === "homa") {
      // three hatch strokes where the chalk skipped, the way kids fill a chalked number
      const cid = `${opts.u}-c84`;
      let hatch = "";
      [0, 44, 88, 128].forEach((dx, i) => (hatch += `M${168 + dx} ${154 - (i % 2) * 3}L${194 + dx} ${80 + (i % 2) * 2}`));
      draw.push(
        `<clipPath id="${cid}"><text x="${POCKET.x}" y="150" class="c01-84" text-anchor="middle">${ovr}</text></clipPath>` +
          `<path d="${hatch}" clip-path="url(#${cid})" class="c01-hatch" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
      );
    }
    knock.push(`<text x="${POCKET.x}" y="150" class="c01-84 c01-ko84" text-anchor="middle" style="fill:#000;stroke:#000;stroke-width:12;stroke-linejoin:round">${ovr}</text>`);
    if (!thumb) {
      const tOvr = `<text x="${POCKET.x + 0.6}" y="168" class="c01-ovr ${mutedCls}" text-anchor="middle">${esc(S.ovr)}</text>`;
      draw.push(tOvr);
      ko(tOvr);
      // name and tier, top-start of the mouth
      const nameFx = tk === "homa" ? ` filter="url(#${opts.u}-chalkt)"` : wall ? ` filter="url(#${opts.u}-paint84)"` : "";
      if (ar) {
        const fs = fitSize([...name].length, 30, 20, 86, 0.55);
        const tn = arText(150, 92, `c01-name-ar ${inkCls}`, esc(name), true, ` style="font-size:${fs}px"${nameFx}`);
        const tt = arText(150, 116, `c01-tier-ar ${tierCls}`, esc(S.tiers[p.tier]));
        draw.push(tn, tt);
        ko(tn, 8);
        ko(tt, 8);
      } else {
        const fs = fitSize(name.length, 34, 20, 100, 0.5);
        const tn = `<text x="64" y="94" class="c01-name ${inkCls}" style="font-size:${fs}px"${nameFx}>${esc(name)}</text>`;
        const tt = `<text x="65" y="112" class="c01-tier ${tierCls}">${esc(S.tiers[p.tier])}</text>`;
        draw.push(tn, tt);
        ko(tn, 8);
        ko(tt, 8);
      }
      // meta, bottom-end (start side in Arabic)
      const metaX = tk === "homa" ? 286 : 300;
      const lines = [
        { t: p.id, y: 206, ltr: true },
        { t: ar ? `${S.country} · ${p.season}` : `${p.season} · ${S.country}`, y: 219 },
      ];
      lines.forEach((l) => {
        const isAr = ar && !l.ltr;
        const cls = `c01-meta${isAr ? "-ar" : ""} ${mutedCls} c01-fine`;
        const t = isAr ? arText(metaX, l.y, cls, esc(l.t)) : `<text x="${metaX}" y="${l.y}" class="${cls}" text-anchor="end">${esc(l.t)}</text>`;
        draw.push(t);
        ko(t, 5);
      });
    }
    return { draw: draw.join(""), knock: knock.join("") };
  }

  /* ---------- the founder footing: the end post is set into it ---------- */
  function footing(u, p, o, tk, cx = POST_END, y0 = 226) {
    if (!p.founder) return "";
    const ar = MC.isAr(o);
    const thumb = !!o.thumb;
    const x0 = cx - 22;
    const x1 = cx + 22;
    const y1 = y0 + 26;
    const shape = `M${x0 + 1.6} ${y0}H${x1 - 1.6}L${x1} ${y0 + 1.6}V${y1}H${x0}V${y0 + 1.6}Z`;
    const yr = String(p.founder);
    let body;
    let deboss = true;
    if (tk === "stade") {
      // a plinth painted round the post foot, numbers painted in navy
      body = `<g filter="url(#${u}-paintH)"><path d="${shape}" fill="#0c3164"/></g>`;
      deboss = false;
    } else if (tk === "homa") {
      // a breeze block, with its two hollow cores showing on the end face
      body =
        `<path d="${shape}" fill="#8c9298" filter="url(#${u}-breeze)"/>` +
        `<path d="M${x0} ${y1 - 0.8}H${x1}" stroke="#000" stroke-width="1.6" opacity=".25"/>`;
    } else {
      body =
        `<path d="${shape}" fill="#b9c0c7" filter="url(#${u}-conc)"/>` +
        `<path d="M${x0 + 1.6} ${y0 + 0.4}H${x1 - 1.6}" stroke="#eef2f6" stroke-width=".8" opacity=".9"/>` +
        `<path d="M${x0} ${y1 - 0.7}H${x1}" stroke="#2a3038" stroke-width="1.4" opacity=".45"/>`;
    }
    // the post foot disappears into the footing: a dark collar where steel meets concrete
    const collar = tk === "stade" || tk === "homa" ? "" : `<rect x="${cx - 7}" y="${y0}" width="14" height="1.4" fill="#3b434d" opacity=".55"/>`;
    if (thumb) return `<g class="c01-foot">${body}${collar}</g>`;
    const word = ar ? "مؤسس" : "FOUNDER";
    const wordEl = (fill, dx = 0, dy = 0) =>
      ar
        ? `<text x="${r1(cx + dx)}" y="${r1(y0 + 9.6 + dy)}" class="c01-fword-ar c01-fine" text-anchor="middle" direction="rtl" style="fill:${fill}">${word}</text>`
        : `<text x="${r1(cx + dx)}" y="${r1(y0 + 8.6 + dy)}" class="c01-fword c01-fine" text-anchor="middle" style="fill:${fill}">${word}</text>`;
    const yrEl = (fill, dx = 0, dy = 0) => `<text x="${r1(cx + dx)}" y="${r1(y0 + 22.4 + dy)}" class="c01-fyear" text-anchor="middle" style="fill:${fill}">${yr}</text>`;
    const text = deboss ? wordEl("#e6ebf0", 0.6, 0.6) + wordEl("#5f6873") + yrEl("#e6ebf0", 0.6, 0.6) + yrEl("#5f6873") : wordEl("#f7f7f2") + yrEl("#f7f7f2");
    return `<g class="c01-foot">${body}${collar}${text}</g>`;
  }

  /** HOMA: a canvas schoolbag dropped at the post foot (the end one carries a strap in club colours). */
  function bag(u, cx, base, rot, p, strap) {
    const c = p.club;
    return (
      `<g transform="translate(${cx} ${base}) rotate(${rot})">` +
      `<ellipse cx="0" cy="0.6" rx="20" ry="2.4" fill="#000" opacity=".4"/>` +
      `<path d="M16 -38C23 -30 24 -14 19 -2" fill="none" stroke="#1d3b5c" stroke-width="3.2" stroke-linecap="round"/>` +
      `<g filter="url(#${u}-weave)"><rect x="-18" y="-44" width="36" height="44" rx="7" fill="url(#${u}-canvas)"/>` +
      `<rect x="-14" y="-22" width="28" height="19" rx="5" fill="#29527c"/></g>` +
      `<rect x="-14" y="-22" width="28" height="19" rx="5" fill="none" stroke="#1d3b5c" stroke-width=".9"/>` +
      `<path d="M-12 -19.6H12" stroke="#9aa3ad" stroke-width="1.3" stroke-dasharray=".7 .6"/>` +
      `<rect x="7" y="-21.6" width="2.4" height="5" rx=".8" fill="#c5ccd3"/>` +
      (strap
        ? `<rect x="-4.5" y="-44" width="9" height="44" fill="${c.primary}"/><rect x="-1.4" y="-44" width="2.8" height="44" fill="${c.secondary}"/>` +
          `<path d="M-4.5 -44V0M4.5 -44V0" stroke="#000" stroke-width=".5" opacity=".35"/><rect x="-5.5" y="-30" width="11" height="4.5" rx="1" fill="#c5ccd3"/>`
        : "") +
      `<path d="M-17 -40C-12 -44.6 12 -44.6 17 -40" fill="none" stroke="#ffd58a" stroke-width=".9" opacity=".6" class="th-d"/>` +
      `<path d="M-7 -44C-7 -53 7 -53 7 -44" fill="none" stroke="#1d3b5c" stroke-width="2.4"/>` +
      `</g>`
    );
  }

  /** The ball: white, two navy panel marks (never the logo ball). */
  const ballArt = (r = 9) => {
    const k = r / 9;
    return (
      `<circle r="${r}" fill="#ffffff" class="c01-ballbody"/>` +
      `<path d="M${r1(-3 * k)} ${r1(-4 * k)}l${r1(3 * k)} ${r1(-2 * k)} ${r1(3 * k)} ${r1(2 * k)} ${r1(-1 * k)} ${r1(3.5 * k)}h${r1(-4 * k)}z" fill="#0c3164"/>` +
      `<path d="M${r1(-8.6 * k)} ${r1(2.4 * k)}l${r1(2.6 * k)} ${r1(0.4 * k)} ${r1(1.4 * k)} ${r1(3.4 * k)}" fill="none" stroke="#0c3164" stroke-width="${r1(1.4 * k)}"/>` +
      `<path d="M${r1(5 * k)} ${r1(4.5 * k)}l${r1(2.6 * k)} ${r1(-1 * k)}" stroke="#0c3164" stroke-width="${r1(1.4 * k)}"/>` +
      `<circle r="${r}" fill="none" stroke="#9aa6b2" stroke-width=".6"/>`
    );
  };

  /** LEGEND: the ball lodged in the top-end corner, pushing a bag of net out past the joint. */
  function ballBag(u, thumb) {
    let mesh = "";
    for (let k = -40; k < 60; k += 4.6) mesh += `M${r1(290 + k)} 0l40 46M${r1(290 + k)} 46l40 -46`;
    return (
      `<g class="c01-bag">` +
      `<path d="${BAG}" class="c01-bagfill"/>` +
      `<path d="${mesh}" clip-path="url(#${u}-bagc)" class="c01-bagnet" stroke-width="${thumb ? 1.4 : 0.7}" fill="none"/>` +
      `<g class="c01-ball" transform="translate(${BALL.x} ${BALL.y})">${ballArt(BALL.r)}</g>` +
      `<path d="M300 26C306 15 314 9 326 9M304 30C310 22 318 19 330 20M296 30C298 22 304 13 312 8" class="c01-bagcord" stroke-width="${thumb ? 1.6 : 0.9}" fill="none"/>` +
      `<path d="${BAG.replace(/V30Z$/, "")}" class="c01-bagcord" stroke-width="${thumb ? 2 : 1.2}" fill="none"/>` +
      `</g>`
    );
  }

  /** LEGEND: the floodlight (2x2 lamp head on a 3u mast) and its hard-edged light wedge. */
  const beam = (u) => {
    const A = `${LAMP.x - 6} ${LAMP.y + 5}`;
    return (
      `<g clip-path="url(#${u}-goalbox)" class="c01-beam">` +
      `<path d="M${A}L18 234H262Z" class="c01-beam1"/>` +
      `<path d="M${A}L60 234H214Z" class="c01-beam2"/>` +
      `<path d="M${A}L96 234H168Z" class="c01-beam3"/>` +
      `</g>`
    );
  };
  const lampHead = (u, thumb) =>
    `<g class="c01-lamp">` +
    `<rect x="${LAMP.x - 1.5}" y="${LAMP.y + 6}" width="3" height="${228 - LAMP.y - 6}" fill="url(#${u}-mast)"/>` +
    `<g transform="rotate(-16 ${LAMP.x} ${LAMP.y})">` +
    `<rect x="${LAMP.x - 9}" y="${LAMP.y - 6.5}" width="18" height="13" rx="1.6" class="c01-housing"/>` +
    (thumb
      ? `<rect x="${LAMP.x - 7.5}" y="${LAMP.y - 5}" width="15" height="10" fill="#eaf6ff"/>`
      : `<rect x="${LAMP.x - 7.5}" y="${LAMP.y - 5}" width="7" height="4.6" fill="#eaf6ff"/><rect x="${LAMP.x + 0.5}" y="${LAMP.y - 5}" width="7" height="4.6" fill="#eaf6ff"/>` +
        `<rect x="${LAMP.x - 7.5}" y="${LAMP.y + 0.4}" width="7" height="4.6" fill="#eaf6ff"/><rect x="${LAMP.x + 0.5}" y="${LAMP.y + 0.4}" width="7" height="4.6" fill="#eaf6ff"/>`) +
    `</g></g>`;

  /** A ball lodged inside the net (share image), with two cords across it. */
  const lodged = (x, y, r) =>
    `<g transform="translate(${x} ${y})">${ballArt(r)}<path d="M${-r - 2} ${-r * 0.3}C${-r * 0.3} ${-r * 0.7} ${r * 0.4} ${-r * 0.2} ${r + 3} ${-r * 0.6}M${-r * 0.6} ${-r - 2}C${-r * 0.2} ${-r * 0.2} ${r * 0.1} ${r * 0.4} ${-r * 0.2} ${r + 2}" class="c01-bagcord" stroke-width="1" fill="none"/></g>`;

  /** STADE: a raw breeze-block wall, 13u courses with toothed ends, the same in both themes. */
  function wall(u, thumb) {
    let fill = "";
    let mortar = "";
    let shade = "";
    let vj = "";
    for (let i = 0, y = 228; y > 20; i++, y -= 13) {
      const top = Math.max(20, y - 13);
      const x0 = i % 2 ? 33 : 20;
      const x1 = i % 2 ? 327 : 340;
      fill += `M${x0} ${top}H${x1}V${y}H${x0}Z`;
      mortar += `M${x0} ${top}H${x1}`;
      shade += `M${x0} ${top + 1.5}H${x1}`;
      for (let x = x0 + 26; x < x1 - 2; x += 26) vj += `M${x} ${top}V${y}`;
    }
    return (
      `<g class="c01-wallg">` +
      `<path d="${fill}" fill="#8c9298" filter="url(#${u}-breeze)"/>` +
      (thumb
        ? ""
        : `<path d="${shade}" stroke="#000" stroke-width="2" opacity=".16"/>` +
          `<path d="${vj}" stroke="#000" stroke-width="1.6" opacity=".1" transform="translate(.9 0)"/>` +
          `<path d="${mortar}${vj}" stroke="#a3a9ae" stroke-width="1"/>`) +
      `</g>`
    );
  }

  /** The goal itself (everything but the foreground figure), in card coordinates. */
  function goal(u, p, o, opts = {}) {
    const spec = tierOf(p);
    const tk = spec.k;
    const thumb = !!o.thumb;
    const c = opts.content || content(p, o, tk, { u });
    let out = "";
    // atmosphere behind the goal
    if (tk === "homa") {
      out += `<rect width="${VW}" height="228" fill="url(#${u}-lamp)"/>`;
      out += `<g clip-path="url(#${u}-wall)" class="c01-cast"><g transform="matrix(1 0 -.16 1 36.5 0)">${MC.avatar({ x: 52, y: 88.5, w: 124, h: 148.8, torso: "#000", collar: false, neck: "#000", skin: "#000", hair: "#000", seam: false })}</g></g>`;
    }
    if (tk === "stade") out += wall(u, thumb);
    if (tk === "legend" && !opts.noLamp && !thumb) out += beam(u);
    // see-through net
    if (spec.net) {
      if (!thumb) out += `<rect x="${MO.x0}" y="${MO.y0}" width="${MO.x1 - MO.x0}" height="${MO.y1 - MO.y0}" fill="url(#${u}-pocket)"/>`;
      out += `<g mask="url(#${u}-m)">${rear(u, spec, tk)}</g>`;
      const net = buildNet(spec, { pitchMul: thumb ? 2.1 : opts.pitchMul || 1, noKnots: thumb, pk: opts.pk });
      const cw = thumb ? spec.cord * 2.4 : spec.cord;
      const body =
        `<path id="${u}-np" data-net="1" d="${net.d}" class="c01-net" stroke-width="${cw}"/>` +
        (net.knots ? `<path data-knots="1" d="${net.knots}" class="c01-knot" stroke-width="${spec.knot}" stroke-linecap="round"/>` : "");
      out += `<g mask="url(#${u}-m)" fill="none" class="c01-netg">${body}</g>`;
    }
    if (tk === "legend" && !opts.noBag) out += ballBag(u, thumb);
    if (opts.ballAt) out += lodged(opts.ballAt.x, opts.ballAt.y, opts.ballAt.r || 9);
    if (tk === "stade" && !thumb)
      out += `<g class="c01-prints" fill="none" stroke-width="1.3" stroke-dasharray="2.2 1.6"><circle cx="266" cy="68" r="7"/><circle cx="292" cy="74" r="7"/><circle cx="301" cy="100" r="7"/></g>`;
    out += `<g class="c01-content">${c.draw}</g>`;
    // the frame
    out += frame(u, p, o, tk);
    if (tk === "legend" && !opts.noLamp) out += lampHead(u, thumb);
    // goal line
    if (tk === "homa") {
      out += `<path d="M2 231.5H358" class="c01-chalk" filter="url(#${u}-chalk)" stroke-width="4" stroke-dasharray="15 5 22 6 11 5" fill="none"/>`;
    } else if (tk === "stade") {
      out += `<g filter="url(#${u}-paintH)"><rect x="0" y="228" width="${VW}" height="6" class="c01-linec c01-keyed"/></g>`;
    } else {
      out += `<rect x="-2" y="228" width="${VW + 4}" height="6" class="c01-linec c01-keyed"/>`;
      if (tk === "legend") {
        out += `<rect x="0" y="228.6" width="${VW}" height="1.2" fill="#ffffff"/>`;
        // the net's shadow, thrown forward onto the lit goal line
        if (!thumb && spec.net) out += `<g clip-path="url(#${u}-linec)"><use href="#${u}-np" transform="matrix(1 0 .5 -.035 -114 236)" filter="url(#${u}-shadow)"/></g>`;
      }
    }
    // founder footing under the end post (HOMA: a breeze block under the end bag)
    if (tk === "homa") {
      out += footing(u, p, o, tk, POST_END, 214);
      out += bag(u, 46, 228, -5, p, false) + bag(u, POST_END, p.founder ? 214 : 228, 3, p, !thumb);
    } else out += footing(u, p, o, tk, opts.footCx || POST_END);
    return { svg: out, mask: c.knock };
  }

  /* ---------- registration ---------- */
  const c = {
    id: "c01",
    n: 1,
    slug: "01",
    name: "Lucarne",
    nameAr: "الزاوية العليا",
    category: "safe",
    philosophy:
      "Your season is the shot and your 84 is where it went in: the top corner of a five-a-side goal that you rebuild, tier by tier, from two schoolbags in the derb to a floodlit net that still holds the ball.",
    philosophyAr:
      "موسمك تسديدة، ورقم 84 هو المكان الذي دخلت منه الكرة: الزاوية العليا لمرمى صغير تعيد بناءه مستوى بعد مستوى، من حقيبتين مدرسيتين في الحي إلى شباك تحت الأضواء ما زالت تمسك الكرة.",
    idea: [
      "The card is not a card. It is a goal: two posts, a crossbar and a painted goal line that runs past both posts, seen from the penalty spot over the manager's shoulder. The mouth is see-through, a net drawn as lines over whatever ground the card sits on, so the outline is a Π standing on a line, never a filled rectangle.",
      "The 84 sits in the top corner of the net, the lucarne, where the cords are pulled in around the digits as if the ball has just gone through. The manager is the back of a head in the bottom-start corner, cropped by the edge like a camera over his shoulder, so the diagonal from him to the 84 is the line of the shot. Name top-start, rating top-end: the card reads across as 'ALI … 84'.",
      "The four stats are painted in one continuous band along the crossbar: small labels, large tabular values, and Logo Blue only for the values and the three dividers. They are built into the structure instead of sitting in tiles under a portrait.",
      "The goal keeps five-a-side proportions (3 m by 2 m) at every tier. Prestige climbs from the street to the lit neighbourhood pitch and never to a national stadium.",
    ],
    belonging: [
      "Almost every Moroccan player started with two schoolbags in the derb, so HOMA reads as where you come from, not a beginner skin. The tier ladder is a story everyone has lived: bags, a goal painted on a breeze-block wall, the welded cage of the terrain de proximité, a real box net, the net under its own floodlight.",
      "A 15-year-old wants the LEGEND goal because it is the only one with the ball still in it: the net bulges out past the corner and the floodlight is yours. Friends tease each other with the lower rungs: 't'as encore les cartables ?'",
      "Your club travels with you: its colours are taped round the start post and its sticker is on the end post, the way kids mark a goal as theirs.",
      "Everyone already has the vocabulary for comparing: 'mine has a net', 'yours is still chalk'. The 84 in the top corner is a goal you scored, and a top-corner goal is what people screenshot.",
    ],
    founderMark: [
      "Founders' goals stand on a foundation. The end post is set into a cast-concrete footing that sticks out below the goal line, and 'FOUNDER' and '2026' are struck into the concrete: grain and relief come from noise lit by a diffuse light, and the letters are debossed with a light edge on their lower side.",
      "The footing exists at every tier and only its material changes: a breeze block under the end schoolbag at HOMA, a plinth painted round the post foot at STADE, cast concrete from PRO up. The footing was poured first; the goal was set into it.",
      "Later cohorts get a bare post foot. Small, the footing becomes a block under the end post that breaks the line, so a founder's token is asymmetric below the goal line, and in the leaderboard row the same post-on-block glyph sits next to 2026.",
    ],
    small: [
      "At 44–80px the token is the Π standing on its goal line, with one Logo Blue stripe on the crossbar, a net drawn as 1px strokes over the page (never filled), the 84 in Changa 800 tucked into the top-end corner at about a third of the height so the empty bottom-start of the net shows first, a 2px band of club colour on the start post and the founder block under the end post.",
      "At 24–32px the post feet stop a pixel short of the line, which runs 18% past each post. The tier is the density of the net: none at STADE, one diagonal cross at PRO, a 2×2 grid with depth ticks at CHAMPION, a 3×3 grid at LEGEND with a 3px ball lodged in the corner, poking out of the frame. HOMA is a dashed chalk Π with two dots for the bags.",
      "The leaderboard row is its own small pitch: each row's goal line runs the full width of the row, so a table of five reads as five goals in a line, and your own net is drawn lit.",
    ],
    rtl: [
      "The goal is an object and never mirrors: the 84 stays top-right, which in Arabic is where reading starts. The name علي moves to the top-left in Changa 800 Arabic at 30u with its tier under it at 13u, right-aligned in its slot with room for Arabic ascenders and descenders.",
      "The crossbar labels become Arabic (القائد، الاختيار، الانتقالات، الثبات) in Noto Sans Arabic, read right to left across the bar; values stay Western digits, left to right. The footing reads مؤسس over 2026. No letter-spacing on any Arabic run.",
    ],
    tiers: {
      HOMA: "Cartables. Two canvas schoolbags at the post feet and a goal chalked on the wall above them: no net, fresh chalk with grain along the strokes and a few hatch strokes in the 84, one street lamp throwing the manager's shadow onto the wall. The end bag carries a strap in club colours and stands on the founder's breeze block.",
      STADE: "Mur. A raw breeze-block wall with toothed ends, 13u courses and mortar joints, and a goal brush-painted on it in white wall paint with the stats band painted along the bar. Ball prints near the top corner. Club colours painted round the start post, the founder plinth painted navy.",
      PRO: "Cage. Galvanised round tubes with spangle and a specular streak, welded joints, a see-through chain-link net drawn in perspective with thin depth lines to the back frame. The stats band is painted on the steel; club tape on the start post, a sticker on the end post, a cast-concrete footing under it.",
      CHAMPION: "Box. Thicker white powder-coated aluminium with a cool specular line and two floodlight glints, a deeper box with stanchions running back to the ground, and a knotted nylon net with visible knots, roof and side panels. The stats are a printed decal with blue pinstripes.",
      LEGEND: "Lucarne. Polished enamel posts with a navy reflection stripe and a white hairline, the stats inlaid in enamel with a bevel, a cord net hung in three planes, and the ball still lodged in the top-end corner, pushing a bag of net out past the joint. A floodlight on its own mast lights the net in three hard-edged steps and throws the net's shadow onto a lit goal line.",
    },
    legend: [
      "LEGEND is the goal that remembers your goal: the ball is still in the corner of the net, bulging out past the frame, under a floodlight that is yours.",
      "On first reveal (or a replay from the card's history) the mouth dims, a plain ball leaves the ground in front of the manager and curves into the top corner, and at impact the frame freezes for a beat at maximum net bulge with one white flash; then the net settles and the 84 appears. It plays once. Anyone can also pull down on the lower third and release to take the shot again; the ball always finds the corner. With reduced motion only the final frame is shown.",
    ],
    advantages: [
      "Readable at a glance by anyone who has played football: nobody needs a caption to understand a goal with a number in the top corner.",
      "The tier ladder is lived progression rather than colour: the object is rebuilt in a new material at each step, every step is a real Moroccan neighbourhood goal, and LEGEND changes the outline itself (the ball bag and the floodlight mast).",
      "The see-through Π keeps its outline on both grounds: white and steel frames on night, keylined frames and a single lift shadow on day.",
      "The 84 stays a solid Changa figure at every size, and the token stays a goal at 24px because its feet stand apart from the line and the net is only ever strokes.",
      "It avoids FUT's skeleton entirely: no portrait slot, no left rating column, no stat tiles, no flag cluster.",
    ],
    risks: [
      "To non-football eyes a Π can read as pi, a torii gate or a table, especially at 24px where the goal line is two pixels.",
      "A goal suggests goals scored, so the card can read as a striker's rating rather than a manager's.",
      "Because the mouth is see-through, the 84 and the name take the theme's ink: a screenshot taken in light mode and one taken in dark mode look different. Shares are always night to compensate.",
      "Many parts (frame, net, figure, 84, stats band, footing) compete at 200px; the meta lines, sticker and labels drop out there and the stats show as values only.",
      "'Lucarne' as current Moroccan usage is unverified, and 'HOMA' is Darija: both need the owner's sign-off.",
      "Net rendering is code-generated geometry; it is cheap to draw but adds about 10–20 KB of path data per card, which matters on a long leaderboard of full cards.",
    ],
    gridWidth: 300,
    detailWidth: 460,

    full(p, o = {}) {
      const S = MC.s(o);
      const u = MC.uid("c01");
      const spec = tierOf(p);
      const tk = spec.k;
      const g = goal(u, p, o);
      const thumb = !!o.thumb;
      const defs =
        `<defs>${frameDefs(u, tk)}` +
        `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><rect width="${VW}" height="${VH}" fill="#fff"/>${g.mask}</mask></defs>`;
      const shadow = `<rect x="22" y="231" width="316" height="7" rx="3.5" class="th-l" fill="#001c49" opacity=".55" filter="url(#${u}-soft)"/>`;
      const fig = thumb && o.thumbNoFig ? "" : figure(spec.rim);
      return (
        `<div class="c01 c01-card t-${tk}${thumb ? " is-thumb" : ""}" dir="${S.dir}" lang="${MC.isAr(o) ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}">` +
        `<svg class="c01-art" viewBox="0 0 ${VW} ${VH}" width="100%" aria-hidden="true" focusable="false">` +
        defs +
        shadow +
        g.svg +
        fig +
        `</svg></div>`
      );
    },

    token(p, o = {}) {
      const h = Math.max(16, Math.round(o.size || 44));
      const mini = !!o.mini || h <= 32;
      const W = Math.round(h * 1.5);
      const tier = TIER[p.tier] ? p.tier : "PRO";
      const tk = TIER[tier].k;
      const u = MC.uid("c01t");
      const lh = mini ? 2 : Math.max(2, Math.round(h / 22));
      const fb = mini ? 2 : Math.max(2, Math.round(h * 0.07)); // room under the line for the footing
      const ext = mini ? Math.round(W * 0.18) : Math.max(5, Math.round(W * 0.13));
      const X0 = ext;
      const X1 = W - ext;
      const Y0 = mini ? 3 : Math.max(3, Math.round(h * 0.1));
      const YL = h - fb - lh;
      const feet = mini ? YL - 1 : YL; // at 24–32px the posts stop a pixel short of the line
      const post = mini
        ? { HOMA: 2, STADE: 1, PRO: 2, CHAMPION: 2, LEGEND: 3 }[tier]
        : Math.max(2, Math.round(h * { HOMA: 0.055, STADE: 0.06, PRO: 0.07, CHAMPION: 0.08, LEGEND: 0.09 }[tier]));
      const bar = mini ? post : Math.max(3, Math.round(post * 1.6));
      const mx0 = X0 + post;
      const mx1 = X1 - post;
      const my0 = Y0 + bar;
      const my1 = feet;
      const mw = mx1 - mx0;
      const mh = my1 - my0;
      const fs = mini ? Math.round(h * 0.5) : Math.round(h * 0.36);
      const pad = mini ? 1 : Math.max(2, Math.round(h * 0.05));
      const tx = mx1 - pad;
      const base = r1(my0 + pad + fs * 0.64);
      let s = "";
      const defs = [];
      // the net: strokes over the page, never a fill; denser with each tier
      let d = "";
      const vx = (x) => Math.round(x) + 0.5;
      if (mini) {
        if (tier === "PRO") d = `M${mx0} ${my0}L${mx1} ${my1}M${mx1} ${my0}L${mx0} ${my1}`;
        if (tier === "CHAMPION") d = `M${vx(mx0 + mw / 2)} ${my0}V${my1}M${mx0} ${vx(my0 + mh / 2)}H${mx1}`;
        if (tier === "LEGEND")
          for (let i = 1; i < 3; i++) d += `M${vx(mx0 + (mw * i) / 3)} ${my0}V${my1}M${mx0} ${vx(my0 + (mh * i) / 3)}H${mx1}`;
      } else if (tier === "PRO" || tier === "CHAMPION" || tier === "LEGEND") {
        const base0 = h >= 76 ? 6 : h >= 60 ? 5 : 4;
        const pitch = tier === "PRO" ? base0 + 1 : tier === "CHAMPION" ? base0 : Math.max(3, base0 - 1);
        if (tier === "PRO") {
          for (let k = -mh; k < mw; k += pitch) d += `M${mx0 + k} ${my0}l${mh} ${mh}`;
          for (let k = 0; k < mw + mh; k += pitch) d += `M${mx0 + k} ${my0}l${-mh} ${mh}`;
        } else {
          for (let x = mx0 + pitch; x < mx1; x += pitch) d += `M${x + 0.5} ${my0}V${my1}`;
          for (let y = my0 + pitch; y < my1; y += pitch) d += `M${mx0} ${y + 0.5}H${mx1}`;
        }
      }
      if (d) {
        defs.push(`<clipPath id="${u}-mo"><rect x="${mx0}" y="${my0}" width="${mw}" height="${mh}"/></clipPath>`);
        defs.push(
          `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${h}"><rect width="${W}" height="${h}" fill="#fff"/><text x="${tx}" y="${base}" class="c01-t84" style="font-size:${fs}px;fill:#000;stroke:#000;stroke-width:${Math.max(3, Math.round(fs * 0.22))}px;stroke-linejoin:round" text-anchor="end">${p.ovr}</text></mask>`,
        );
        s += `<g clip-path="url(#${u}-mo)"><path d="${d}" class="c01-tmesh" stroke-width="1" fill="none" mask="url(#${u}-m)"/></g>`;
      }
      if (tier === "CHAMPION") {
        const dt = mini ? 3 : Math.round(h * 0.12);
        s += `<path d="M${mx0} ${my0}l${dt} ${dt}M${mx1} ${my0}l${-dt} ${dt}" class="c01-tdepth" fill="none" stroke-width="${mini ? 1.5 : h >= 56 ? 2 : 1.5}"/>`;
      }
      // the frame
      if (tier === "HOMA") {
        const dash = mini ? "3 1.6" : `${Math.round(h * 0.14)} ${Math.max(2, Math.round(h * 0.06))}`;
        const pw = mini ? 1.6 : post;
        const xa = X0 + pw / 2;
        const xb = X1 - pw / 2;
        const ya = Y0 + pw / 2;
        const bagH = mini ? 0 : Math.round(h * 0.3);
        s += `<path d="M${xa} ${feet - bagH}V${ya}L${r1(W / 2)} ${ya + 0.6}L${xb} ${ya}V${feet - bagH}" class="c01-tchalk" fill="none" stroke-width="${pw}" stroke-dasharray="${dash}" stroke-linejoin="round"/>`;
        if (mini) s += `<circle cx="${xa}" cy="${YL - 1.4}" r="1.6" class="c01-tbag"/><circle cx="${xb}" cy="${YL - 1.4}" r="1.6" class="c01-tbag"/>`;
        else {
          const bw = Math.round(W * 0.15);
          s += `<rect x="${r1(xa - bw / 2)}" y="${YL - bagH}" width="${bw}" height="${bagH}" rx="${r1(bw * 0.22)}" class="c01-tbag"/><rect x="${r1(xb - bw / 2)}" y="${YL - bagH}" width="${bw}" height="${bagH}" rx="${r1(bw * 0.22)}" class="c01-tbag"/>`;
          s += `<rect x="${r1(xb - 1.5)}" y="${YL - bagH}" width="3" height="${bagH}" fill="${p.club.primary}"/>`;
          s += `<path d="M${r1(xa - bw / 2 + 1.5)} ${r1(YL - bagH * 0.45)}h${bw - 3}" stroke="#9aa3ad" stroke-width="1"/>`;
        }
      } else {
        const path = `M${X0} ${feet}V${Y0}H${X1}V${feet}H${X1 - post}V${Y0 + bar}H${X0 + post}V${feet}Z`;
        s += `<path d="${path}" class="c01-tframe"/>`;
        if (!mini) {
          // one solid Logo Blue stripe on the crossbar, and the club's colour on the start post
          const inset = bar >= 4 ? 1 : 0;
          s += `<rect x="${X0 + post + 1}" y="${Y0 + inset}" width="${mw - 2}" height="${bar - inset * 2}" fill="#0151fc"/>`;
          s += `<rect x="${X0}" y="${r1(my0 + mh * 0.42)}" width="${post}" height="2" fill="${p.club.primary}"/>`;
        }
      }
      // goal line, running past both posts
      s += `<rect x="0" y="${YL}" width="${W}" height="${lh}" class="${tier === "HOMA" ? "c01-tchalkf" : "c01-tline"}"/>`;
      // founder: a block under the end post that breaks the line
      if (p.founder) {
        const fw = Math.max(4, Math.round(h * 0.13));
        const fx = Math.round(X1 - post / 2 - fw / 2);
        s += `<rect x="${fx}" y="${feet}" width="${fw}" height="${h - feet}" class="c01-tfoot"/>`;
      }
      // LEGEND: the ball, lodged in the top-end corner and poking out of the frame
      if (tier === "LEGEND") {
        const br = mini ? 1.6 : Math.max(2.5, Math.round(h * 0.13) / 2);
        const bx = r1(X1 + br * 0.35);
        const by = r1(Y0 - br * 0.1);
        if (!mini) s += `<circle cx="${bx}" cy="${by}" r="${r1(br + 1.6)}" class="c01-tbagnet" fill="none" stroke-width="1" stroke-dasharray="1.2 1"/>`;
        s += `<circle cx="${bx}" cy="${by}" r="${br}" class="c01-tball"/>`;
      }
      // the 84, tucked into the top-end corner
      s += `<text x="${tx}" y="${base}" class="c01-t84 ${tier === "HOMA" ? "c01-t84c" : "c01-t84i"}" style="font-size:${fs}px" text-anchor="end">${p.ovr}</text>`;
      return (
        `<span class="c01 c01-tok t-${tk}${mini ? " is-mini" : ""}" dir="ltr" role="img" aria-label="${esc(MC.label(p, o))}" style="width:${W}px;height:${h}px">` +
        `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" aria-hidden="true" focusable="false">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${s}</svg></span>`
      );
    },

    row(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const tok = c.token(p, { ...o, size: 46, mini: false });
      const founder = p.founder
        ? `<span class="c01-rf"><svg viewBox="0 0 10 9" width="10" height="9" aria-hidden="true"><path d="M3.6 0h2.8v4.4H3.6z"/><path d="M0 4.4h10V9H0z" opacity=".75"/></svg>${MC.ltr(String(p.founder))}</span>`
        : "";
      return (
        `<div class="c01 c01-row t-${TIER[p.tier] ? TIER[p.tier].k : "pro"}${o.me ? " is-me" : ""}" dir="${S.dir}" role="img" aria-label="${esc(`${o.rank}. ${MC.label(p, o)}, ${o.pts} ${S.pts}`)}">` +
        `<span class="c01-rk">${MC.ltr(String(o.rank))}</span>` +
        `<span class="c01-rt">${tok}</span>` +
        `<span class="c01-rn"><b>${esc(MC.nameOf(p, o))}</b><small><span class="c01-rtier">${esc(S.tiers[p.tier])}</span>${founder}</small></span>` +
        `<span class="c01-rp"><b>${MC.ltr(String(o.pts))}</b><small>${esc(ar ? S.pts : "pts")}</small></span>` +
        `<i class="c01-rl" aria-hidden="true"></i>` +
        `</div>`
      );
    },

    share(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const u = MC.uid("c01s");
      const tk = tierOf(p).k;
      // the goal, larger and lower: posts run off both edges, crossbar at y210
      const k = 376 / 280;
      const tx = r1(-8 - 40 * k);
      const ty = r1(210 - 30 * k);
      const lineY = r1(228 * k + ty);
      const kk = r1(k * 10000) / 10000;
      // the 84 at 160px, top-end of the mouth; the ball lodged in the corner above it
      const fs84 = r1(160 / k);
      const draw = [];
      const knock = [];
      draw.push(`<text x="303" y="182" class="c01-84 c01-ink" text-anchor="end" style="font-size:${fs84}px">${p.ovr}</text>`);
      knock.push(`<text x="303" y="182" class="c01-84" text-anchor="end" style="font-size:${fs84}px;fill:#000;stroke:#000;stroke-width:10;stroke-linejoin:round">${p.ovr}</text>`);
      draw.push(`<text x="246" y="198" class="c01-ovr c01-muted" text-anchor="middle" style="font-size:9px">${esc(S.ovr)}</text>`);
      knock.push(`<text x="246" y="198" class="c01-ovr" text-anchor="middle" style="font-size:9px;fill:#000;stroke:#000;stroke-width:6">${esc(S.ovr)}</text>`);
      const ballAt = { x: 289, y: 72, r: 9 };
      knock.push(`<circle cx="${ballAt.x}" cy="${ballAt.y}" r="11" fill="#000"/>`);
      const g = goal(u, p, { ...o, thumb: false }, { content: { draw: draw.join(""), knock: knock.join("") }, noBag: true, noLamp: true, pk: { x: 289, y: 76 }, ballAt, footCx: 289 });
      // turf: horizontal mowing bands, thinner toward the goal line
      let turf = "";
      const bands = [10, 13, 17, 22, 28, 35, 44, 50];
      let y = lineY + 6;
      bands.forEach((hh, i) => {
        if (y >= 640) return;
        turf += `<rect x="0" y="${r1(y)}" width="360" height="${r1(Math.min(hh, 640 - y))}" fill="${i % 2 ? "#0f2547" : "#13305a"}"/>`;
        y += hh;
      });
      // floodlight, top-end, with three hard-edged steps of light falling to the bottom-start
      const LX = 326;
      const LY = 24;
      const lamp =
        `<rect x="${LX + 3}" y="${LY + 8}" width="3.5" height="${300 - LY - 8}" fill="#6e7884"/>` +
        `<g transform="rotate(-16 ${LX} ${LY})"><rect x="${LX - 15}" y="${LY - 10}" width="30" height="20" rx="2.4" fill="#0a1626" stroke="#2c3a50" stroke-width="1"/>` +
        `<rect x="${LX - 12.5}" y="${LY - 7.5}" width="11.5" height="7" fill="#eaf6ff"/><rect x="${LX + 1}" y="${LY - 7.5}" width="11.5" height="7" fill="#eaf6ff"/>` +
        `<rect x="${LX - 12.5}" y="${LY + 0.5}" width="11.5" height="7" fill="#eaf6ff"/><rect x="${LX + 1}" y="${LY + 0.5}" width="11.5" height="7" fill="#eaf6ff"/></g>`;
      const A = `${LX - 8} ${LY + 6}`;
      const wedges =
        `<path d="M${A}L-90 640H250Z" fill="#eaf6ff" opacity=".04"/>` +
        `<path d="M${A}L-40 640H170Z" fill="#eaf6ff" opacity=".08"/>` +
        `<path d="M${A}L4 640H104Z" fill="#eaf6ff" opacity=".12"/>`;
      const handle = "@" + p.name.lat.toLowerCase();
      const sample = ar ? "مثال" : "Exemple";
      const name = MC.nameOf(p, o);
      const tierLine = `${S.tiers[p.tier]} · ${p.ovr} ${S.ovr}`;
      const textBlock = ar
        ? arText(336, 132, "c01-sh-name-ar", esc(name)) +
          arText(336, 158, "c01-sh-tier-ar", `${esc(S.tiers[p.tier])} · <tspan direction="ltr" unicode-bidi="embed">${p.ovr} ${esc(S.ovr)}</tspan>`) +
          `<text x="336" y="178" class="c01-sh-meta" text-anchor="end">${esc(handle)} · ${esc(p.id)}</text>` +
          arText(336, 196, "c01-sh-meta-ar", `${esc(sample)} · ${esc(p.season)}`)
        : `<text x="24" y="126" class="c01-sh-name">${esc(name)}</text>` +
          `<text x="25" y="150" class="c01-sh-tier">${esc(tierLine)}</text>` +
          `<text x="25" y="172" class="c01-sh-meta">${esc(handle)} · ${esc(p.id)}</text>` +
          `<text x="25" y="190" class="c01-sh-meta">${esc(p.season)} · ${esc(sample)}</text>`;
      const logoH = 24;
      const logoW = r1(logoH * MC.LOGO_RATIO.wordmark);
      const logoX = ar ? r1(336 - logoW) : 24;
      // the net's shadow on the turf, thrown toward the viewer and the start side
      const sh = `matrix(${kk} 0 ${r1(0.6 * k * 1000) / 1000} ${r1(-0.25 * k * 1000) / 1000} ${r1(tx - 0.6 * k * 228)} ${r1(lineY + 0.25 * k * 228)})`;
      return (
        `<div class="c01 c01-share t-${tk}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
        `<svg viewBox="0 0 360 640" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">` +
        `<defs>${frameDefs(u, tk)}` +
        `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><rect width="${VW}" height="${VH}" fill="#fff"/>${g.mask}</mask>` +
        `<clipPath id="${u}-turf"><rect x="0" y="${lineY + 6}" width="360" height="${r1(640 - lineY)}"/></clipPath>` +
        `</defs>` +
        `<rect width="360" height="640" fill="#001c49"/>` +
        `<rect y="300" width="360" height="${r1(lineY - 300)}" fill="#05193a"/>` +
        `<path d="M0 300.5H360" stroke="#0c3164" stroke-width="1"/>` +
        turf +
        `<g clip-path="url(#${u}-turf)"><use href="#${u}-np" transform="${sh}" filter="url(#${u}-shadow)"/></g>` +
        lamp +
        wedges +
        `<g transform="translate(${tx} ${ty}) scale(${kk})">${g.svg}</g>` +
        `<g transform="translate(${logoX} 40)">${MC.logo("wordmark", { variant: "light", w: logoW, h: logoH, label: false })}</g>` +
        textBlock +
        figure(TIER.LEGEND.rim, { fixed: true, box: { x: -8, y: 470, w: 150, h: 180 } }) +
        `</svg></div>`
      );
    },

    /** Tap the net and it gives round your finger; pull down on the lower third and release to shoot.
        With o.reveal (first reveal, or a replay from history) the shot plays once by itself. */
    mount(el, o = {}) {
      if (!el || !el.classList || !el.classList.contains("c01-card") || el.dataset.c01m) return;
      if (!o.motion || reducedMotion()) return;
      const svg = el.querySelector("svg.c01-art");
      if (!svg) return;
      el.dataset.c01m = "1";
      const tier = el.dataset.tier;
      const spec = TIER[tier] || TIER.PRO;
      const legend = tier === "LEGEND";
      const NS = "http://www.w3.org/2000/svg";
      const netg = svg.querySelector(".c01-netg");
      const nets = netg ? [...netg.querySelectorAll("[data-net]")] : [];
      const knots = netg ? netg.querySelector("[data-knots]") : null;
      const repath = (extra, pinchMul) => {
        if (!nets.length) return;
        const n = buildNet(spec, { extra, pinchMul });
        nets.forEach((q) => q.setAttribute("d", n.d));
        if (knots) knots.setAttribute("d", n.knots);
      };
      // re-path the net a few times along an envelope; the edges stay tied to the posts
      let pinchId = 0;
      const pinchAnim = (x, y, s, env, dur, steps, done) => {
        const id = ++pinchId;
        let i = 0;
        const tick = () => {
          if (id !== pinchId) return;
          i++;
          const t = i / steps;
          const k = env(t);
          repath(Math.abs(k) > 0.002 ? { x, y, k, s } : null);
          if (i < steps) setTimeout(tick, dur / steps);
          else if (done) done();
        };
        tick();
      };
      const toSvg = (e) => {
        const m = svg.getScreenCTM();
        return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
      };
      const mouthRect = (fill, op) => {
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", MO.x0);
        r.setAttribute("y", MO.y0);
        r.setAttribute("width", MO.x1 - MO.x0);
        r.setAttribute("height", MO.y1 - MO.y0);
        r.setAttribute("class", fill);
        r.setAttribute("opacity", op);
        r.style.pointerEvents = "none";
        return r;
      };
      const settle = (t) => 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.06;

      let busy = false;
      const shoot = (reveal) => {
        if (busy) return;
        busy = true;
        const fig = svg.querySelector(".c01-fig");
        const n84 = svg.querySelector(".c01-content .c01-84");
        const ko84 = [...svg.querySelectorAll(".c01-ko84")];
        const still = svg.querySelector(".c01-bag .c01-ball");
        const target = legend ? [BALL.x, BALL.y] : [286, 76];
        if (reveal && n84) {
          n84.style.opacity = "0";
          ko84.forEach((k) => (k.style.opacity = "0")); // no 84-shaped hole in the net while it is hidden
        }
        if (still) still.style.opacity = "0";
        let dim = null;
        if (legend) {
          dim = mouthRect("c01-dim", ".55");
          svg.insertBefore(dim, svg.querySelector(".c01-content"));
        }
        const g = document.createElementNS(NS, "g");
        g.style.pointerEvents = "none";
        const shadowEl = document.createElementNS(NS, "ellipse");
        shadowEl.setAttribute("fill", "#000");
        const ball = document.createElementNS(NS, "g");
        ball.innerHTML = ballArt(9);
        g.appendChild(shadowEl);
        g.appendChild(ball);
        svg.insertBefore(g, fig ? fig.nextSibling : null);
        const P0 = [120, 246];
        const P1 = [150, 40];
        const P2 = target;
        const t0 = performance.now();
        const FLY = 520;
        const fly = (now) => {
          const t = Math.min(1, (now - t0) / FLY);
          const e = t * t; // accelerating
          const a = 1 - e;
          const x = a * a * P0[0] + 2 * a * e * P1[0] + e * e * P2[0];
          const y = a * a * P0[1] + 2 * a * e * P1[1] + e * e * P2[1];
          const sc = 1.1 - 0.6 * e;
          ball.setAttribute("transform", `translate(${r1(x)} ${r1(y)}) scale(${r1(sc * 100) / 100})`);
          shadowEl.setAttribute("cx", r1(x));
          shadowEl.setAttribute("cy", r1(254 - 24 * e));
          shadowEl.setAttribute("rx", r1(10 * (1 - e) + 1));
          shadowEl.setAttribute("ry", r1(2.6 * (1 - e) + 0.4));
          shadowEl.setAttribute("opacity", r1(0.35 * (1 - e) * 100) / 100);
          if (t < 1) return requestAnimationFrame(fly);
          impact();
        };
        const finish = () => {
          if (reveal && n84) {
            ko84.forEach((k) => (k.style.opacity = ""));
            n84.style.transition = "opacity 260ms ease-out";
            n84.style.opacity = "1";
          }
          setTimeout(() => {
            g.remove();
            if (dim) dim.remove();
            if (n84) n84.style.transition = "";
            busy = false;
          }, 520);
        };
        const impact = () => {
          shadowEl.remove();
          if (legend) {
            // hard cut to maximum bulge in the corner, freeze 240ms, one 60ms flash
            if (still) still.style.opacity = "";
            ball.remove();
            repath({ x: 300, y: 62, k: 0.3, s: 54 }, 1.35);
            const flash = mouthRect("c01-flash", ".4");
            svg.insertBefore(flash, g);
            setTimeout(() => flash.remove(), 60);
            setTimeout(() => {
              pinchAnim(300, 62, 54, (t) => 0.3 * (1 - settle(t)), 420, 7, () => repath(null, 1));
              dim.style.transition = "opacity 420ms cubic-bezier(.22,1.1,.36,1)";
              dim.setAttribute("opacity", "0");
              const lamp = svg.querySelector(".c01-lamp");
              if (lamp) {
                const glint = document.createElementNS(NS, "path");
                glint.setAttribute("d", `M${LAMP.x - 22} ${LAMP.y + 5}h44M${LAMP.x} ${LAMP.y - 16}v42`);
                glint.setAttribute("stroke", "#eaf6ff");
                glint.setAttribute("stroke-width", "1.4");
                glint.setAttribute("transform", `rotate(-16 ${LAMP.x} ${LAMP.y})`);
                glint.style.transition = "opacity 520ms steps(4, end)";
                lamp.appendChild(glint);
                requestAnimationFrame(() => requestAnimationFrame(() => (glint.style.opacity = "0")));
                setTimeout(() => glint.remove(), 600);
              }
              finish();
            }, 240);
          } else {
            // the net gives where the ball hit, then the ball drops out of the corner
            if (nets.length) pinchAnim(target[0], target[1], 40, (t) => 0.26 * Math.sin(Math.PI * t), 420, 7);
            const d0 = performance.now();
            const drop = (now) => {
              const t = Math.min(1, (now - d0) / 420);
              ball.setAttribute("transform", `translate(${r1(target[0] - 8 * t)} ${r1(target[1] + (226 - target[1]) * t * t)}) scale(.5)`);
              ball.setAttribute("opacity", r1((1 - t) * 100) / 100);
              if (t < 1) requestAnimationFrame(drop);
            };
            requestAnimationFrame(drop);
            finish();
          }
        };
        requestAnimationFrame(fly);
      };

      let pull = null;
      el.addEventListener("pointerdown", (e) => {
        const pt = toSvg(e);
        if (!pt) return;
        if (pt.y >= 173) {
          pull = { y: pt.y };
          return;
        }
        if (nets.length && pt.x >= MO.x0 && pt.x <= MO.x1 && pt.y >= MO.y0 && pt.y <= MO.y1) pinchAnim(pt.x, pt.y, 34, (t) => 0.18 * Math.sin(Math.PI * t), 420, 7);
      });
      el.addEventListener("pointerup", () => {
        if (!pull) return;
        pull = null;
        shoot(false);
      });
      el.addEventListener("pointercancel", () => (pull = null));
      if (o.reveal) shoot(true);
    },
  };
  MC.register(c);
})();
