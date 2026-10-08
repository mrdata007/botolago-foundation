/* 01 LUCARNE (safe).
   The card is a five-a-side goal (3 m x 2 m) seen from the penalty spot. The mouth is
   see-through: a net drawn as lines over whatever ground the card sits on, so the outline is
   a Π standing on a goal line that runs past both posts. The 84 sits where the shot went in,
   the top corner (la lucarne). The four stats are one painted line along the crossbar. The
   manager stands outside the start post, cropped by the edge, watching. Founders' end posts
   stand in a concrete footing with a cast-iron plate that carries 26.
   Tiers rebuild the goal: a chalk goal on a breeze-block wall (HOMA), the galvanised cage of
   a neighbourhood pitch (STADE), white steel tubes with a knotted net in club colour (PRO),
   a powder-coated box goal (CHAMPION), and the same box goal with the ball lodged for good
   in the top corner, its net bag breaking the outline (LEGEND).
   The goal is an object, so it never mirrors in Arabic; the 84 stays top-right. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const r1 = (n) => Math.round(n * 10) / 10;
  const reducedMotion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Unicode isolates keep Latin codes and dates left-to-right inside Arabic SVG text. */
  const iso = (s) => "⁦" + esc(s) + "⁩";

  /* ---------- text measure (names are fitted, never left to run under the 84) ---------- */
  // Ask for the Arabic faces now, so the page's fonts.ready waits for them and the first render measures real glyphs.
  try {
    if (typeof document !== "undefined" && document.fonts && document.fonts.load) {
      document.fonts.load('800 34px "Changa"', "علي");
      document.fonts.load('700 13px "Noto Sans Arabic"', "علي");
    }
  } catch (e) {
    /* measuring falls back to the tables below */
  }
  // Changa 800 advance widths (em), measured in Chromium; the fallback when the face is not ready.
  const CHANGA_W = {
    A: 0.64,
    B: 0.59,
    C: 0.51,
    D: 0.65,
    E: 0.52,
    F: 0.47,
    G: 0.57,
    H: 0.65,
    I: 0.3,
    J: 0.39,
    K: 0.62,
    L: 0.44,
    M: 0.81,
    N: 0.67,
    O: 0.66,
    P: 0.59,
    Q: 0.65,
    R: 0.62,
    S: 0.58,
    T: 0.49,
    U: 0.63,
    V: 0.62,
    W: 0.93,
    X: 0.63,
    Y: 0.58,
    Z: 0.59,
    " ": 0.2,
    "-": 0.35,
    0: 0.67,
    1: 0.53,
    2: 0.59,
    3: 0.56,
    4: 0.63,
    5: 0.59,
    6: 0.61,
    7: 0.5,
    8: 0.62,
    9: 0.61,
  };
  let ctx2d = null;
  /** Width of txt in em for a CSS font at 100px ("800 100px Changa"); measured when the face is loaded. */
  function emWidth(txt, font, ar) {
    try {
      if (typeof document !== "undefined" && document.fonts && document.fonts.check(font, txt)) {
        ctx2d = ctx2d || document.createElement("canvas").getContext("2d");
        ctx2d.font = font;
        const w = ctx2d.measureText(txt).width;
        if (w > 0) return w / 100;
      }
    } catch (e) {
      /* fall through to the estimate */
    }
    // conservative estimates: Arabic letters about 0.78em (wide finals), Latin from the table
    return [...txt].reduce(
      (a, ch) => a + (ar ? (ch === " " ? 0.22 : 0.78) : CHANGA_W[ch.toUpperCase()] || 0.66),
      0,
    );
  }
  const F_NAME = '800 100px "Changa"';
  const F_TIER = '800 100px "Manrope"';
  const F_TIER_AR = '700 100px "Noto Sans Arabic"';

  /** Seeded generator (mulberry32): the chalk hand is fixed per manager. */
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- geometry: viewBox 0 0 360 280 ---------- */
  const VW = 360;
  const VH = 280;
  const PW = 12; // tube width
  const L = 40; // start post, outer edge
  const R = 320; // end post, outer edge
  const BAR = { y0: 34, y1: 58 };
  const LINE = { y0: 236, y1: 242 };
  const MO = { x0: L + PW, x1: R - PW, y0: BAR.y1, y1: LINE.y0 }; // the see-through mouth
  const POST_END = R - PW / 2;
  const EYE = { x: 180, y: 94, f: 516 }; // penalty spot, eye at about 1.6 m
  const POCKET = { x: 228, y: 116 }; // where the 84 went in
  const BALL = { x: 321, y: 32, r: 11 }; // LEGEND: the ball lodged for good behind the top-end joint
  const BAG = "M290 34C296 24 305 18.5 317 18C329 17.5 336 23 336 31C336 39 331 46 320 54V34Z"; // breaks the Π by 16u
  const FIG = { x: -40, y: 152.5, w: 106.7, h: 128 }; // outside the start post, cropped by the left and bottom edges: hood and one shoulder
  const FOOT = { x0: 292, x1: 336, y0: 234, y1: 262 }; // founder footing, 20u below the goal line
  const PLATE = { x0: 296, x1: 332, y0: 241, y1: 259 }; // cast-iron plate set into it
  const STAT_Y = 50.5;
  const WALL = { x0: 14, x1: 346, y0: 8, y1: 230 }; // HOMA: the breeze-block wall, squared ends, standing behind the goal line
  const HOMA_LINE = 240; // HOMA: the chalk goal line on the ground, clearly below the wall's foot

  const project = (P) => {
    const s = EYE.f / (EYE.f + P[2]);
    return [EYE.x + (P[0] - EYE.x) * s, EYE.y + (P[1] - EYE.y) * s];
  };
  const lerp3 = (A, B, t) => [
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
  ];
  const dist3 = (A, B) => Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const bil = (q, u, v) => lerp3(lerp3(q[0], q[1], u), lerp3(q[3], q[2], u), v);

  /* Net surfaces in 3D (x across, y down, z away from the viewer). Each quad: A→B is s, A→D is t. */
  const box = (dt, db) => () => {
    const { x0, x1, y0, y1 } = MO;
    return [
      [
        [x0, y0, dt],
        [x1, y0, dt],
        [x1, y1, db],
        [x0, y1, db],
      ],
      [
        [x0, y0, 0],
        [x1, y0, 0],
        [x1, y0, dt],
        [x0, y0, dt],
      ],
      [
        [x0, y0, 0],
        [x0, y0, dt],
        [x0, y1, db],
        [x0, y1, 0],
      ],
      [
        [x1, y0, 0],
        [x1, y0, dt],
        [x1, y1, db],
        [x1, y1, 0],
      ],
    ];
  };
  const boxEdges = (dt, db) => () => {
    const { x0, x1, y0, y1 } = MO;
    return {
      bars: [
        [
          [x0, y0, dt],
          [x1, y0, dt],
        ],
        [
          [x0, y1, db],
          [x1, y1, db],
        ],
      ],
      stays: [
        [
          [x0, y0, dt],
          [x0, y1, db],
        ],
        [
          [x1, y0, dt],
          [x1, y1, db],
        ],
      ],
      sides: [
        [
          [x0, y0, 0],
          [x0, y0, dt],
        ],
        [
          [x1, y0, 0],
          [x1, y0, dt],
        ],
        [
          [x0, y1, 0],
          [x0, y1, db],
        ],
        [
          [x1, y1, 0],
          [x1, y1, db],
        ],
      ],
    };
  };
  // LEGEND's fold (where the sloped back meets the hanging back) projects to y≈166, below every text element
  const LG = { ym: 191, dt: 58, dm: 182 };
  const legendPlanes = () => {
    const { x0, x1, y0, y1 } = MO;
    const { ym, dt, dm } = LG;
    return [
      [
        [x0, y0, 0],
        [x1, y0, 0],
        [x1, y0, dt],
        [x0, y0, dt],
      ],
      [
        [x0, y0, dt],
        [x1, y0, dt],
        [x1, ym, dm],
        [x0, ym, dm],
      ],
      [
        [x0, ym, dm],
        [x1, ym, dm],
        [x1, y1, dm],
        [x0, y1, dm],
      ],
      [
        [x0, y0, 0],
        [x0, y0, dt],
        [x0, ym, dm],
        [x0, ym, 0],
      ],
      [
        [x0, ym, 0],
        [x0, ym, dm],
        [x0, y1, dm],
        [x0, y1, 0],
      ],
      [
        [x1, y0, 0],
        [x1, y0, dt],
        [x1, ym, dm],
        [x1, ym, 0],
      ],
      [
        [x1, ym, 0],
        [x1, ym, dm],
        [x1, y1, dm],
        [x1, y1, 0],
      ],
      [
        [x0, y1, 0],
        [x1, y1, 0],
        [x1, y1, dm],
        [x0, y1, dm],
      ], // the ground sheet: a LEGEND net is closed all round
    ];
  };
  const legendEdges = () => {
    const { x0, x1, y0, y1 } = MO;
    const { ym, dt, dm } = LG;
    return {
      bars: [
        [
          [x0, y0, dt],
          [x1, y0, dt],
        ],
        [
          [x0, ym, dm],
          [x1, ym, dm],
        ],
        [
          [x0, y1, dm],
          [x1, y1, dm],
        ],
      ],
      stays: [
        [
          [x0, y0, dt],
          [x0, ym, dm],
        ],
        [
          [x1, y0, dt],
          [x1, ym, dm],
        ],
        [
          [x0, ym, dm],
          [x0, y1, dm],
        ],
        [
          [x1, ym, dm],
          [x1, y1, dm],
        ],
      ],
      sides: [
        [
          [x0, y0, 0],
          [x0, y0, dt],
        ],
        [
          [x1, y0, 0],
          [x1, y0, dt],
        ],
        [
          [x0, y1, 0],
          [x0, y1, dm],
        ],
        [
          [x1, y1, 0],
          [x1, y1, dm],
        ],
      ],
    };
  };
  /** STADE's welded cage: the rear frame plus a mid rail and a diagonal brace in each side. */
  const cageEdges = (d) => () => {
    const { x0, x1, y0, y1 } = MO;
    const E = boxEdges(d, d)();
    const ym = y1 - 40; // the rear rail runs low, under the 84 and clear of every label
    E.bars.push([
      [x0, ym, d],
      [x1, ym, d],
    ]);
    E.braces = [
      [
        [x0, y0, 0],
        [x0, y1, d],
      ],
      [
        [x1, y0, 0],
        [x1, y1, d],
      ],
    ];
    E.welds = [
      [x0, y0, d],
      [x1, y0, d],
      [x0, y1, d],
      [x1, y1, d],
      [x0, ym, d],
      [x1, ym, d],
    ];
    return E;
  };

  /* ---------- tiers ---------- */
  // STADE hangs nothing: rigid flat chain-link (no bulge), tight pitch. PRO is soft nylon: it bulges round the
  // 84 and sags between its ties. LEGEND is the heaviest: a braided net at a fine pitch, closed all round.
  const TIER = {
    HOMA: { k: "homa", cords: 0 },
    STADE: {
      k: "stade",
      cords: 1,
      net: "diamond",
      slope: 0.72,
      pitch: 8,
      planes: box(70, 70),
      edges: cageEdges(70),
      pinch: 0,
      sigma: 46,
      cord: 0.7,
      steel: true,
    },
    PRO: {
      k: "pro",
      cords: 2,
      net: "diamond",
      slope: 1,
      pitch: 12,
      planes: box(80, 80),
      edges: boxEdges(80, 80),
      pinch: 0.26,
      sigma: 48,
      cord: 1,
      knot: 1.9,
      sag: 9,
      knotCls: "c01-knot2",
    },
    CHAMPION: {
      k: "champion",
      cords: 3,
      net: "square",
      pitch: 10,
      planes: box(62, 128),
      edges: boxEdges(62, 128),
      pinch: 0.32,
      sigma: 50,
      cord: 0.85,
      knot: 1.9,
    },
    LEGEND: {
      k: "legend",
      cords: 3,
      net: "square",
      pitch: 9.5,
      planes: legendPlanes,
      edges: legendEdges,
      pinch: 0.4,
      sigma: 56,
      cord: 1.6,
      knot: 2.6,
      braid: true,
    },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;

  /** The net as projected polylines, pulled toward the pocket (and, while tapped, toward the tap). */
  function buildNet(spec, opt = {}) {
    const pitch = spec.pitch * (opt.pitchMul || 1);
    const at = opt.pk || POCKET;
    const pins = [];
    if (opt.pinch !== false)
      pins.push({
        x: at.x,
        y: at.y,
        k: spec.pinch * (opt.pinchMul == null ? 1 : opt.pinchMul),
        s: spec.sigma,
      });
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
    // soft nylon sags between its ties (zero at every edge, deepest mid-panel); steel does not
    const sagA = spec.sag || 0;
    const at3 = (q, u, v) => {
      const P = bil(q, u, v);
      return sagA ? [P[0], P[1] + sagA * Math.sin(Math.PI * u) * Math.sin(Math.PI * v), P[2]] : P;
    };
    const knot = (q, u, v) => {
      const Q = pinch(project(at3(q, u, v)));
      knots += `M${r1(Q[0])} ${r1(Q[1])}h0`;
    };
    const line = (q, u0, v0, u1, v1, len) => {
      const n = Math.max(1, Math.ceil(len / 9)); // a point every 9u is enough for the bulge's curvature
      const pts = [];
      let dev = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = u0 + (u1 - u0) * t;
        const v = v0 + (v1 - v0) * t;
        const P = project(bil(q, u, v));
        const Q = pinch(project(at3(q, u, v)));
        dev = Math.max(dev, Math.abs(Q[0] - P[0]) + Math.abs(Q[1] - P[1]));
        pts.push(Q);
      }
      const use = dev < 0.25 ? [pts[0], pts[pts.length - 1]] : pts;
      d += "M" + use.map((P) => r1(P[0]) + " " + r1(P[1])).join("L");
    };
    const withKnots = spec.knot && !opt.noKnots;
    spec.planes().forEach((q) => {
      const Ls = Math.max(dist3(q[0], q[1]), dist3(q[3], q[2]));
      const Lt = Math.max(dist3(q[0], q[3]), dist3(q[1], q[2]));
      if (spec.net === "square") {
        const ns = Math.max(1, Math.round(Ls / pitch));
        const nt = Math.max(1, Math.round(Lt / pitch));
        for (let i = 1; i < ns; i++) line(q, i / ns, 0, i / ns, 1, Lt);
        for (let j = 1; j < nt; j++) line(q, 0, j / nt, 1, j / nt, Ls);
        if (withKnots)
          for (let i = 1; i < ns; i++) for (let j = 1; j < nt; j++) knot(q, i / ns, j / nt);
      } else {
        // diamonds: two families of slanted cords, s = c + k·t and s = c − k·t (k = 1: square knots turned 45°)
        const k = spec.slope || 1;
        const A = [];
        const B = [];
        for (let c = -Lt * k + pitch / 2; c < Ls; c += pitch) {
          const ta = Math.max(0, -c / k);
          const tb = Math.min(Lt, (Ls - c) / k);
          if (tb > ta) {
            line(q, (c + k * ta) / Ls, ta / Lt, (c + k * tb) / Ls, tb / Lt, (tb - ta) * 1.25);
            A.push(c);
          }
        }
        for (let c = pitch / 2; c < Ls + Lt * k; c += pitch) {
          const ta = Math.max(0, (c - Ls) / k);
          const tb = Math.min(Lt, c / k);
          if (tb > ta) {
            line(q, (c - k * ta) / Ls, ta / Lt, (c - k * tb) / Ls, tb / Lt, (tb - ta) * 1.25);
            B.push(c);
          }
        }
        if (withKnots)
          for (const c1 of A)
            for (const c2 of B) {
              const t = (c2 - c1) / (2 * k);
              const s = (c1 + c2) / 2;
              if (t > 0.5 && t < Lt - 0.5 && s > 0.5 && s < Ls - 0.5) knot(q, s / Ls, t / Lt);
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

  /* ---------- filters and gradients (full card only; tokens, rows and the share are flat) ---------- */
  const stops = (list) =>
    list
      .map(
        ([o, c, a]) =>
          `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`,
      )
      .join("");
  const lin = (id, list, x2 = 1, y2 = 0) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;
  /** Multiplies a fill by fractal noise: galvanised spangle, powder coat, breeze block. */
  const grain = (id, freq, k1, k2, seed = 3, oct = 2) =>
    `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1" result="g"/>` +
    `<feComposite in="SourceGraphic" in2="g" operator="arithmetic" k1="${k1}" k2="${k2}" k3="0" k4="0" result="m"/>` +
    `<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>`;
  /** Poured concrete: noise as a height map, lit from the top-end, multiplied into the fill. */
  const concrete = (id, seed = 17) =>
    `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="${seed}" result="n"/>` +
    `<feDiffuseLighting in="n" surfaceScale="1.6" diffuseConstant="1.05" lighting-color="#ffffff" result="l"><feDistantLight azimuth="225" elevation="58"/></feDiffuseLighting>` +
    `<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="0.36" k2="0.7" k3="0" k4="0" result="m"/>` +
    `<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>`;
  /** Fresh chalk on lines: a hair of edge and a grain that keeps about 90% of the stroke. The region is in user
      space, because a straight chalk line has a zero-height box and would otherwise not render at all. */
  const chalkLine = (id) =>
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="-4" y="-4" width="${VW + 8}" height="${VH + 8}" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="12" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 -0.62" result="ga"/>` +
    `<feComposite in="d" in2="ga" operator="in"/></filter>`;
  /** Chalk on the 84 and the name: an even fine grain (no streaks), never displaced; about 97% of each stroke survives. */
  const chalkText = (id) =>
    `<filter id="${id}" x="-2%" y="-4%" width="104%" height="108%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="31" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 16 0 0 0 -4" result="ga"/>` +
    `<feComposite in="SourceGraphic" in2="ga" operator="in"/></filter>`;
  const blur = (id, sd) =>
    `<filter id="${id}" x="-30%" y="-150%" width="160%" height="400%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
  /** Feathers the net's clearance round the name and tier, so it reads as the net thinning out, not a plate. */
  const feather = (id) =>
    `<filter id="${id}" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2"/></filter>`;

  /** Hand-drawn line: a polyline with seeded perpendicular wobble. */
  function wobble(x1, y1, x2, y2, rand, amp = 0.5, step = 20) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(2, Math.round(len / step));
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    let d = "";
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = i === 0 || i === n ? 0 : (rand() - 0.5) * 2 * amp;
      d +=
        (i ? "L" : "M") + r1(x1 + (x2 - x1) * t + nx * w) + " " + r1(y1 + (y2 - y1) * t + ny * w);
    }
    return d;
  }

  /** Arabic text in SVG, anchored at its visual right edge. */
  const arText = (x, y, cls, txt, extra = "") =>
    `<text x="${x}" y="${y}" class="${cls}" direction="rtl" text-anchor="start"${extra}>${txt}</text>`;

  /** A four-point floodlight glint. */
  const glint = (x, y, s, cls = "c01-glint") =>
    `<path d="M${x} ${r1(y - s)}L${r1(x + s * 0.16)} ${r1(y - s * 0.16)}L${r1(x + s)} ${y}L${r1(x + s * 0.16)} ${r1(y + s * 0.16)}L${x} ${r1(y + s)}L${r1(x - s * 0.16)} ${r1(y + s * 0.16)}L${r1(x - s)} ${y}L${r1(x - s * 0.16)} ${r1(y - s * 0.16)}Z" class="${cls}"/>`;

  /* ---------- the shared figure: hood up, seen from behind, lit from the goal end ---------- */
  function figure(box = FIG) {
    const { x, y, w, h } = box;
    const k = w / 100;
    const rim = MC.avatar({
      x: r1(x + 1.3 * k),
      y: r1(y - 0.9 * k),
      w,
      h,
      torso: "#9bdbfd",
      collar: "#9bdbfd",
      neck: "#9bdbfd",
      skin: "#9bdbfd",
      hair: "#9bdbfd",
      seam: false,
    });
    const body = MC.avatar({ x, y, w, h, torso: "#1e2733", seam: "#46546a" });
    return `<g class="c01-fig">${rim}${body}</g>`;
  }

  /* ---------- the stats: one painted line along the crossbar ---------- */
  function statLine(p, o, cls, y = STAT_Y) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const items = MC.STATS.map(
      (k) =>
        `<tspan class="c01-sl-l">${esc(S.stats[k])}</tspan> <tspan class="c01-sl-v">${p.stats[k]}</tspan>`,
    );
    const sep = `<tspan class="c01-sl-d"> · </tspan>`;
    const full = ar
      ? `<text x="180" y="${y}" class="c01-sl c01-sl-ar ${cls}" text-anchor="middle" direction="rtl">${items.join(sep)}</text>`
      : `<text x="180" y="${y}" class="c01-sl ${cls}" text-anchor="middle">${items.join(sep)}</text>`;
    // small cards: the four values alone, larger, in the same reading order
    const vals = (ar ? [...MC.STATS].reverse() : MC.STATS).map((k) => p.stats[k]).join(" · ");
    const short = `<text x="180" y="${r1(y + 2)}" class="c01-slv ${cls}" text-anchor="middle" direction="ltr">${vals}</text>`;
    return full + short;
  }

  /** Club tape: two wraps on the galvanised start post (STADE has no club-colour net). */
  function tape(p) {
    const c = p.club;
    return (
      `<g class="c01-fine"><rect x="${L - 0.4}" y="150" width="${PW + 0.8}" height="5" fill="${c.primary}"/>` +
      `<rect x="${L - 0.4}" y="155.6" width="${PW + 0.8}" height="3" fill="${c.secondary}"/>` +
      `<rect x="${L - 0.4}" y="159.2" width="${PW + 0.8}" height="2.6" fill="${c.primary}"/>` +
      `<path d="M${L - 0.4} 150.3h${PW + 0.8}M${L - 0.4} 155.9h${PW + 0.8}M${L - 0.4} 159.5h${PW + 0.8}" stroke="#ffffff" stroke-width=".5" opacity=".55"/>` +
      `<rect x="${r1(L + PW * 0.7)}" y="150" width="${r1(PW * 0.3 + 0.4)}" height="11.8" fill="#000" opacity=".22"/></g>`
    );
  }
  /** The club's crest as a round sticker: wrapped round the end post, or flat on the HOMA wall. */
  function sticker(p, cx, cy, wrap) {
    const c = p.club;
    const rx = wrap ? 6 : 9;
    const ry = 9;
    return (
      `<g class="c01-fine c01-sticker">` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 0.8}" ry="${ry + 0.8}" fill="#f4f1ea"/>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c.primary}"/>` +
      `<g transform="translate(${r1(cx - rx * 0.66)} ${r1(cy - ry * 0.66)})">${MC.crest({ mono: c.secondary, w: r1(rx * 1.32), h: r1(ry * 1.32) })}</g>` +
      (wrap
        ? `<ellipse cx="${r1(cx + rx * 0.45)}" cy="${cy}" rx="${r1(rx * 0.55)}" ry="${ry + 0.8}" fill="#000" opacity=".2"/>`
        : "") +
      `</g>`
    );
  }

  function frameDefs(u, tk, F, p) {
    let d = `<clipPath id="${u}-mo"><rect x="${MO.x0}" y="${MO.y0}" width="${MO.x1 - MO.x0}" height="${MO.y1 - MO.y0}"/></clipPath>`;
    if (tk === "legend") d += `<clipPath id="${u}-bagc"><path d="${BAG}"/></clipPath>`;
    if (tk === "homa") {
      // the lamp's pool: the wall fades toward its ends and its top, so the chalk Π stays the outline
      d +=
        `<linearGradient id="${u}-wfh" gradientUnits="userSpaceOnUse" x1="${WALL.x0}" y1="0" x2="${WALL.x1}" y2="0">${stops(
          [
            [0, "#fff", 0.22],
            [0.09, "#fff", 0.6],
            [0.26, "#fff", 1],
            [0.74, "#fff", 1],
            [0.91, "#fff", 0.6],
            [1, "#fff", 0.22],
          ],
        )}</linearGradient>` +
        `<linearGradient id="${u}-wfv" gradientUnits="userSpaceOnUse" x1="0" y1="${WALL.y0}" x2="0" y2="${WALL.y1}">${stops(
          [
            [0, "#fff", 0.22],
            [0.12, "#fff", 0.64],
            [0.36, "#fff", 1],
            [1, "#fff", 1],
          ],
        )}</linearGradient>` +
        `<mask id="${u}-wmh" maskUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><rect x="0" y="0" width="${VW}" height="${VH}" fill="url(#${u}-wfh)"/></mask>` +
        `<mask id="${u}-wmv" maskUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><rect x="0" y="0" width="${VW}" height="${VH}" fill="url(#${u}-wfv)"/></mask>`;
    }
    if (F.flat || F.thumb) return d;
    d += blur(`${u}-soft`, 5) + feather(`${u}-fe`);
    if (p.founder) d += concrete(`${u}-conc`);
    if (tk === "homa")
      d +=
        grain(`${u}-block`, 0.8, 0.3, 0.8, 41, 2) +
        chalkLine(`${u}-chalk`) +
        chalkText(`${u}-chalkt`) +
        `<radialGradient id="${u}-lamp" cx="104" cy="24" r="230" gradientUnits="userSpaceOnUse">${stops(
          [
            [0, "#ffd58a", 0.13],
            [0.5, "#ffd58a", 0.05],
            [1, "#ffd58a", 0],
          ],
        )}</radialGradient>`;
    if (tk === "stade")
      d +=
        lin(`${u}-tube`, [
          [0, "#6e7884"],
          [0.45, "#d5dce3"],
          [0.7, "#8f9aa5"],
          [1, "#6e7884"],
        ]) +
        lin(
          `${u}-barg`,
          [
            [0, "#d5dce3"],
            [0.3, "#a9b3bd"],
            [0.72, "#8f9aa5"],
            [1, "#6e7884"],
          ],
          0,
          1,
        ) +
        grain(`${u}-spangle`, 0.42, 0.55, 0.76, 7);
    if (tk === "pro")
      d +=
        lin(`${u}-tube`, [
          [0, "#c9d2dc"],
          [0.3, "#ffffff"],
          [0.62, "#f2f4f6"],
          [1, "#b4bec9"],
        ]) +
        lin(
          `${u}-barg`,
          [
            [0, "#ffffff"],
            [0.4, "#f4f6f8"],
            [0.84, "#d5dce3"],
            [1, "#b4bec9"],
          ],
          0,
          1,
        ) +
        lin(
          `${u}-specV`,
          [
            [0, "#ffffff", 1],
            [1, "#ffffff", 0.15],
          ],
          0,
          1,
        ) +
        lin(`${u}-specH`, [
          [0, "#ffffff", 0],
          [1, "#ffffff", 1],
        ]);
    if (tk === "champion" || tk === "legend")
      d +=
        lin(`${u}-tube`, [
          [0, "#dce3ea"],
          [0.28, "#ffffff"],
          [0.6, "#f2f4f6"],
          [1, "#cdd5de"],
        ]) +
        lin(
          `${u}-barg`,
          [
            [0, "#ffffff"],
            [0.5, "#f2f4f6"],
            [1, "#dce3ea"],
          ],
          0,
          1,
        ) +
        lin(
          `${u}-specV`,
          [
            [0, "#ffffff", 1],
            [1, "#ffffff", 0.1],
          ],
          0,
          1,
        ) +
        grain(`${u}-powder`, 1.1, 0.14, 0.94, 9, 1);
    return d;
  }

  /** Posts, crossbar with its painted stat line, and the club marks. */
  function frame(u, p, o, tk, F) {
    const thumb = !!F.thumb;
    const flat = !!(F.flat || F.thumb);
    if (tk === "homa") {
      // a goal chalked on the wall: one clean 5u line, fresh, never smudged
      const rand = rng(parseInt(p.serial, 10) || 7);
      const xa = L + PW / 2;
      const xb = R - PW / 2;
      const yb = BAR.y0 + 2.5;
      const d =
        wobble(xa, WALL.y1, xa, yb, rand) +
        wobble(xa, yb, xb, yb, rand) +
        wobble(xb, yb, xb, WALL.y1, rand);
      return (
        `<g class="c01-frameg">` +
        `<path d="${d}" class="c01-chalk" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"${flat ? "" : ` filter="url(#${u}-chalk)"`}/>` +
        (thumb ? "" : statLine(p, o, "c01-chalkf", 52)) +
        (thumb ? "" : sticker(p, 334, 190, false)) +
        `</g>`
      );
    }
    const H = LINE.y0 - BAR.y0;
    const key = `<path d="M${L} ${LINE.y0}V${BAR.y0}H${R}V${LINE.y0}H${R - PW}V${BAR.y1}H${L + PW}V${LINE.y0}Z" class="c01-key" fill="none" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    const steel = tk === "stade";
    let s = key;
    if (flat) {
      // flat fills (thumb strip and share): body colour plus one shade strip on the end side
      const body = steel ? "#8f9aa5" : "#f2f4f6";
      const shade = steel ? "#6e7884" : "#c9d2dc";
      s +=
        `<rect x="${L}" y="${BAR.y0}" width="${PW}" height="${H}" fill="${body}"/><rect x="${R - PW}" y="${BAR.y0}" width="${PW}" height="${H}" fill="${body}"/>` +
        `<rect x="${L + PW * 0.68}" y="${BAR.y1}" width="${PW * 0.32}" height="${H - 24}" fill="${shade}"/><rect x="${R - PW * 0.32}" y="${BAR.y1}" width="${PW * 0.32}" height="${H - 24}" fill="${shade}"/>` +
        `<rect x="${L}" y="${BAR.y0}" width="${R - L}" height="24" fill="${body}"/><rect x="${L}" y="${BAR.y1 - 3}" width="${R - L}" height="3" fill="${shade}"/>`;
      if (steel)
        s += `<rect x="${L + 6}" y="${BAR.y0 + 4}" width="${R - L - 12}" height="15" rx="1" fill="#f2f4f6"/>`;
    } else {
      const fx = steel
        ? ` filter="url(#${u}-spangle)"`
        : tk === "pro"
          ? ""
          : ` filter="url(#${u}-powder)"`;
      s +=
        `<g${fx}><rect x="${L}" y="${BAR.y0}" width="${PW}" height="${H}" fill="url(#${u}-tube)"/><rect x="${R - PW}" y="${BAR.y0}" width="${PW}" height="${H}" fill="url(#${u}-tube)"/>` +
        `<rect x="${L}" y="${BAR.y0}" width="${R - L}" height="24" fill="url(#${u}-barg)"/></g>`;
      if (steel) {
        // white enamel painted along the galvanised bar, welds at the joints
        s += `<rect x="${L + 6}" y="${BAR.y0 + 4}" width="${R - L - 12}" height="15" rx="1" fill="#f2f4f6"/><rect x="${L + 6}" y="${BAR.y0 + 18.2}" width="${R - L - 12}" height=".8" fill="#c9d2dc"/>`;
      }
      if (tk === "pro") {
        // the end-side floodlight: one specular streak down each tube and along the bar
        s +=
          `<rect x="${r1(L + PW * 0.68)}" y="${BAR.y1 + 2}" width="1.6" height="${H - 30}" fill="url(#${u}-specV)"/>` +
          `<rect x="${r1(R - PW * 0.32)}" y="${BAR.y1 + 2}" width="1.8" height="${H - 30}" fill="url(#${u}-specV)"/>` +
          `<rect x="170" y="${BAR.y0 + 2}" width="${R - 172}" height="1.3" fill="url(#${u}-specH)" opacity=".9"/>`;
      }
      if (tk === "champion" || tk === "legend") {
        s +=
          `<rect x="${r1(L + PW * 0.3)}" y="${BAR.y1 + 2}" width="1.2" height="${H - 30}" fill="url(#${u}-specV)" opacity=".9"/>` +
          `<rect x="${r1(R - PW * 0.7)}" y="${BAR.y1 + 2}" width="1.4" height="${H - 30}" fill="url(#${u}-specV)"/>` +
          `<rect x="${L + 2}" y="${BAR.y0 + 1.2}" width="${R - L - 4}" height=".8" fill="#ffffff"/>`;
      }
      if (steel || tk === "pro") {
        let w = "";
        for (let x = L + 1.2; x < L + PW; x += 2.4)
          w += `<circle cx="${r1(x)}" cy="${BAR.y1 + 0.6}" r="1"/><circle cx="${r1(x + R - PW - L)}" cy="${BAR.y1 + 0.6}" r="1"/>`;
        s += `<g fill="${steel ? "#7e8893" : "#c9d2dc"}">${w}</g>`;
      }
    }
    if (!thumb) s += statLine(p, o, "c01-paint");
    if (tk === "champion" && !thumb) s += glint(R - 4, 72, 6) + glint(R - 26, BAR.y0 + 3, 5);
    if (!thumb && steel) s += tape(p);
    if (!thumb) s += sticker(p, POST_END, 179, true);
    return `<g class="c01-frameg">${s}</g>`;
  }

  /** Rear structure seen through the mouth: cage frame, net edges, or stanchions. */
  function rear(spec, tk, thumb) {
    if (!spec.edges) return "";
    const E = spec.edges();
    const all = [...E.bars, ...E.stays, ...E.sides].map(([a, b]) => seg2(a, b)).join("");
    if (tk === "stade") {
      // the welded cage behind the chain-link: rear frame, mid rail, side braces, weld beads at the joints
      const br = (E.braces || []).map(([a, b]) => seg2(a, b)).join("");
      if (thumb)
        return `<path d="${all + br}" class="c01-rearsteel" stroke-width="3" fill="none"/>`;
      const welds = (E.welds || []).map((P) => {
        const Q = project(P);
        return `<circle cx="${r1(Q[0])}" cy="${r1(Q[1])}" r="2.1"/>`;
      });
      return (
        `<g fill="none" stroke-linecap="round"><path d="${all + br}" class="c01-rearsteel" stroke-width="3.4"/>` +
        `<path d="${all + br}" class="c01-rearhi" stroke-width=".8" transform="translate(-.7 -.7)"/></g>` +
        `<g class="c01-weld">${welds.join("")}</g>`
      );
    }
    if (tk === "pro")
      return `<path d="${all}" class="c01-net" stroke-width="${thumb ? 2.4 : 1.2}" fill="none"/>`;
    const stays = E.stays.map(([a, b]) => seg2(a, b)).join("");
    const rest = [...E.bars, ...E.sides].map(([a, b]) => seg2(a, b)).join("");
    return (
      `<g fill="none" stroke-linecap="round"><path d="${stays + rest}" class="c01-key" stroke-width="5"/>` +
      `<path d="${rest}" class="c01-rearw" stroke-width="2"/><path d="${stays}" class="c01-rearw" stroke-width="3"/></g>`
    );
  }

  /* ---------- text inside the mouth: the 84, the name, the tier ---------- */
  function content(u, p, o, tk, F) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const thumb = !!F.thumb;
    const fx = tk === "homa" && !F.flat && !thumb ? ` filter="url(#${u}-chalkt)"` : "";
    const ink = tk === "homa" ? "c01-chalkf" : "c01-ink";
    const draw = [];
    const knock = [];
    // the 84 keeps a hard 6u halo in the net
    const t84 = `<text x="${POCKET.x}" y="152" class="c01-84 ${ink}" text-anchor="middle"${fx}>${p.ovr}</text>`;
    draw.push(t84);
    knock.push(
      t84
        .replace(/ filter="[^"]*"/, "")
        .replace(
          "<text ",
          `<text style="fill:#000;stroke:#000;stroke-width:12;stroke-linejoin:round" `,
        ),
    );
    if (!thumb) {
      const L = nameLayout(p, o);
      const tierTxt = esc(S.tiers[p.tier]);
      const tl = (ln) =>
        ln.tl ? ` textLength="${r1(ln.tl)}" lengthAdjust="spacingAndGlyphs"` : "";
      if (ar) {
        const spans = L.lines
          .map(
            (ln) =>
              `<tspan x="${L.edge}" y="${r1(ln.y)}" style="font-size:${r1(L.fs)}px"${tl(ln)}>${esc(ln.txt)}</tspan>`,
          )
          .join("");
        draw.push(
          `<text class="c01-name ${ink}" direction="rtl" text-anchor="start"${fx}>${spans}</text>`,
        );
        draw.push(arText(L.edge, r1(L.tierY), `c01-tier-ar ${ink}`, tierTxt));
      } else {
        const spans = L.lines
          .map(
            (ln) =>
              `<tspan x="${L.edge}" y="${r1(ln.y)}" style="font-size:${r1(L.fs)}px"${tl(ln)}>${esc(ln.txt)}</tspan>`,
          )
          .join("");
        draw.push(`<text class="c01-name ${ink}"${fx}>${spans}</text>`);
        draw.push(
          `<text x="${L.edge + 1}" y="${r1(L.tierY)}" class="c01-tier ${ink}">${tierTxt}</text>`,
        );
      }
      // one soft clearance for the name block: the name's box, the tier's box (3u) and the bridge between,
      // feathered; the tier box has a large-size twin for the small card, where the tier label grows
      if (!F.flat && tk !== "homa") {
        const box = (x0, x1, y0, y1, cls = "") =>
          `<rect${cls ? ` class="${cls}"` : ""} x="${r1(x0)}" y="${r1(y0)}" width="${r1(x1 - x0)}" height="${r1(y1 - y0)}" rx="3"/>`;
        const span = (w, pad) =>
          ar ? [L.edge - w - pad, L.edge + pad] : [L.edge - pad, L.edge + w + pad];
        const [nx0, nx1] = span(L.w, 5);
        const nb = L.bottom + 4;
        let k = box(nx0, nx1, L.top - 5, nb);
        [
          [L.tierW, L.tierCap, "c01-kt"],
          [L.tierW * L.tierBig, L.tierCap * L.tierBig, "c01-kt-big"],
        ].forEach(([w, cap, cls]) => {
          const [tx0, tx1] = span(w, 3);
          k += box(tx0, tx1, L.tierY - cap - 3, L.tierY + L.tierDesc + 3, cls);
          const [bx0, bx1] = span(Math.min(w, L.w), 3);
          k += box(bx0, bx1, nb - 2, L.tierY - cap + 1, cls);
        });
        knock.push(`<g filter="url(#${u}-fe)" fill="#000">${k}</g>`);
      }
    }
    return { draw: draw.join(""), knock: knock.join("") };
  }

  /** Fits the name in the space left of the 84: shrink to 22u, then two lines (at a space), then
      textLength down to 0.85, then smaller still. The tier follows the last line. */
  function nameLayout(p, o) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const name = MC.nameOf(p, o);
    const left84 = POCKET.x - (emWidth(String(p.ovr), F_NAME) * 104) / 2;
    const edge = ar ? Math.min(176, Math.floor(left84 - 12)) : 64; // Latin starts at x64; Arabic ends just short of the 84
    const maxW = ar ? edge - 58 : Math.min(176, left84 - 12) - edge;
    const em = (t) => emWidth(t, F_NAME, ar);
    const fit = (wEm, maxFs) => {
      let fs = Math.min(maxFs, maxW / wEm);
      if (fs >= 22) return { fs, tl: 0 };
      fs = maxW / (wEm * 22) >= 0.85 ? 22 : maxW / (wEm * 0.85);
      return { fs, tl: wEm * fs > maxW ? maxW : 0 };
    };
    let lines;
    let fs;
    const one = fit(em(name), 34);
    const words = name.trim().split(/\s+/);
    if (one.fs >= 22 && !one.tl) {
      fs = one.fs;
      lines = [{ txt: name, w: em(name) * fs }];
    } else if (words.length > 1) {
      // break at the space that leaves the widest line narrowest
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" ");
        const b = words.slice(i).join(" ");
        const m = Math.max(em(a), em(b));
        if (!best || m < best.m) best = { a, b, m };
      }
      const f = fit(best.m, 28);
      fs = f.fs;
      lines = [best.a, best.b].map((txt) => {
        const w = em(txt) * fs;
        return { txt, w: Math.min(w, maxW), tl: w > maxW ? maxW : 0 };
      });
    } else {
      fs = one.fs;
      lines = [{ txt: name, w: Math.min(em(name) * fs, maxW), tl: one.tl }];
    }
    // Latin caps hang from y72; Arabic ascenders from about y70, with a deeper line box for the descenders
    const cap = ar ? 0.75 : 0.72;
    const lead = ar ? 1.3 : 0.98;
    const top = 72;
    lines.forEach((ln, i) => (ln.y = top + cap * fs + i * lead * fs));
    const last = lines[lines.length - 1].y;
    const tierSize = ar ? 13 : 12;
    const tierW = ar
      ? emWidth(S.tiers[p.tier], F_TIER_AR, true) * tierSize
      : emWidth(S.tiers[p.tier], F_TIER) * tierSize + 0.1 * tierSize * [...S.tiers[p.tier]].length;
    const tierY = ar ? last + 0.5 * fs + 17 : last + 20;
    return {
      edge,
      fs,
      lines,
      w: Math.max(...lines.map((l) => l.w)),
      top: top - 1,
      bottom: last + (ar ? 0.45 * fs : 0),
      tierY,
      tierW,
      tierCap: ar ? 0.78 * tierSize : 0.72 * tierSize,
      tierDesc: ar ? 0.4 * tierSize : 0,
      tierBig: ar ? 16 / 13 : 15 / 12, // the small card's tier size (see the container query in 01.css)
    };
  }

  /* ---------- the founder footing: poured round the end post, a cast-iron plate set in ---------- */
  function footing(u, p, F, tk) {
    if (!p.founder) return "";
    const { x0, x1, y1 } = FOOT;
    const y0 = tk === "homa" ? WALL.y1 - 1 : FOOT.y0; // at HOMA it is poured against the foot of the wall
    const flat = F.flat || F.thumb;
    let s =
      `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="1.2" class="c01-key" fill="none" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
      `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="1.2" fill="#a9adb2"${flat ? "" : ` filter="url(#${u}-conc)"`}/>` +
      `<rect x="${x0 + 1}" y="${y0 + 0.4}" width="${x1 - x0 - 2}" height=".8" fill="#d4d7da"/>` +
      `<rect x="${x0}" y="${y1 - 1.4}" width="${x1 - x0}" height="1.4" fill="#6e7884" opacity=".7"/>` +
      `<rect x="${R - PW}" y="${y0}" width="${PW}" height="1.6" fill="#2a2c30" opacity=".45"/>`; // where the post goes into the concrete
    if (F.thumb) return `<g class="c01-foot">${s}</g>`;
    const P = PLATE;
    const cx = (P.x0 + P.x1) / 2;
    const yr = String(p.founder).slice(-2);
    s +=
      `<rect x="${P.x0}" y="${P.y0}" width="${P.x1 - P.x0}" height="${P.y1 - P.y0}" rx=".8" fill="#2a2c30"/>` +
      `<path d="M${P.x0 + 0.4} ${P.y1 - 0.4}V${P.y0 + 0.4}H${P.x1 - 0.4}" stroke="#55595f" stroke-width=".8" fill="none"/>` +
      `<path d="M${P.x0 + 0.4} ${P.y1 - 0.4}H${P.x1 - 0.4}V${P.y0 + 0.4}" stroke="#131416" stroke-width=".8" fill="none"/>` +
      `<g fill="#55595f"><circle cx="${P.x0 + 3}" cy="${P.y0 + 3}" r=".9"/><circle cx="${P.x1 - 3}" cy="${P.y0 + 3}" r=".9"/><circle cx="${P.x0 + 3}" cy="${P.y1 - 3}" r=".9"/><circle cx="${P.x1 - 3}" cy="${P.y1 - 3}" r=".9"/></g>` +
      // 26 cast in relief: lit edge top-start, shadow bottom-end, iron face
      `<text x="${cx - 0.5}" y="${P.y1 - 4.6}" class="c01-fyear" text-anchor="middle" fill="#c3c8ce">${yr}</text>` +
      `<text x="${cx + 0.7}" y="${P.y1 - 3.4}" class="c01-fyear" text-anchor="middle" fill="#0e0f11">${yr}</text>` +
      `<text x="${cx}" y="${P.y1 - 4}" class="c01-fyear" text-anchor="middle" fill="#8a8f96">${yr}</text>`;
    return `<g class="c01-foot">${s}</g>`;
  }

  /** The ball: white, two navy panel marks (never the logo ball). */
  const ballArt = (r = 11) => {
    const k = r / 9;
    return (
      `<circle r="${r}" fill="#ffffff"/>` +
      `<path d="M${r1(-3 * k)} ${r1(-4 * k)}l${r1(3 * k)} ${r1(-2 * k)} ${r1(3 * k)} ${r1(2 * k)} ${r1(-1 * k)} ${r1(3.5 * k)}h${r1(-4 * k)}z" fill="#0c3164"/>` +
      `<path d="M${r1(-8.6 * k)} ${r1(2.4 * k)}l${r1(2.6 * k)} ${r1(0.4 * k)} ${r1(1.4 * k)} ${r1(3.4 * k)}" fill="none" stroke="#0c3164" stroke-width="${r1(1.4 * k)}"/>` +
      `<path d="M${r1(5 * k)} ${r1(4.5 * k)}l${r1(2.6 * k)} ${r1(-1 * k)}" stroke="#0c3164" stroke-width="${r1(1.4 * k)}"/>` +
      `<circle r="${r}" fill="none" stroke="#9aa6b2" stroke-width=".6"/>`
    );
  };

  /** LEGEND: the ball lodged for good in the top-end corner, its net bag out past the joint. */
  function ballBag(u, F) {
    const thumb = !!F.thumb;
    let mesh = "";
    for (let k = -50; k < 60; k += thumb ? 7 : 5)
      mesh += `M${290 + k} 8l52 52M${290 + k} 60l52 -52`;
    return (
      `<g class="c01-bag">` +
      `<path d="${BAG}" class="c01-bagfill"/>` +
      `<path d="${mesh}" clip-path="url(#${u}-bagc)" class="c01-bagnet" stroke-width="${thumb ? 1.6 : 0.8}" fill="none"/>` +
      `<g class="c01-ball" transform="translate(${BALL.x} ${BALL.y})">${ballArt(BALL.r)}</g>` +
      `<path d="M303 32C307 25 314 22 326 22M298 32C300 26 305 21 313 19" class="c01-bagcord" stroke-width="${thumb ? 1.6 : 1}" fill="none"/>` +
      `<path d="${BAG.replace(/V34Z$/, "")}" class="c01-bagcord" stroke-width="${thumb ? 2.4 : 1.4}" fill="none"/>` +
      `</g>`
    );
  }

  /** HOMA: a new breeze-block wall in running bond, both ends squared (half blocks in alternate courses).
      It stands behind the goal line and fades toward its ends and top, out of the street lamp's pool. */
  function wall(u, F) {
    const flat = F.flat || F.thumb;
    const { x0, x1, y0, y1 } = WALL;
    const ch = (y1 - y0) / 12;
    const bl = (x1 - x0) / 9;
    let mortar = "";
    let lite = "";
    for (let i = 0; i < 12; i++) {
      const yb = y1 - i * ch;
      const yt = r1(yb - ch);
      if (i) mortar += `M${x0} ${r1(yb)}H${x1}`;
      lite += `M${x0} ${r1(yt + 1)}H${x1}`;
      for (let x = x0 + (i % 2 ? bl / 2 : bl); x < x1 - 2; x += bl)
        mortar += `M${r1(x)} ${yt}V${r1(yb)}`;
    }
    const rect = `x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"`;
    return (
      `<g class="c01-wallg" mask="url(#${u}-wmh)"><g mask="url(#${u}-wmv)">` +
      // at thumb size the wall goes thin, so the chalk Π stays the outline (the 1-bit test reads a goal, not a block)
      `<rect ${rect} fill="#72787f"${F.thumb ? ' fill-opacity=".3"' : ""}${flat ? "" : ` filter="url(#${u}-block)"`}/>` +
      (flat ? "" : `<rect ${rect} fill="url(#${u}-lamp)"/>`) +
      (F.thumb
        ? ""
        : `<path d="${lite}" stroke="#8a9097" stroke-width=".8" opacity=".35"/><path d="${mortar}" stroke="#5f656c" stroke-width="1"/>`) +
      `</g></g>`
    );
  }

  /** The goal itself (everything but the foreground figure), in card coordinates. */
  function goal(u, p, o, F) {
    const spec = tierOf(p);
    const tk = spec.k;
    const thumb = !!F.thumb;
    const c = F.content || content(u, p, o, tk, F);
    let out = "";
    if (tk === "homa") {
      out += wall(u, F);
      // two fresh ball marks in the lucarne, clear of the 84 (its top sits near y76) and of the chalked stats
      if (!thumb)
        out += `<g class="c01-marks"><circle cx="302" cy="64.5" r="7"/><circle cx="279" cy="62.5" r="6.5"/></g>`;
    }
    if (spec.net) {
      out += `<g mask="url(#${u}-m)">${rear(spec, tk, thumb)}</g>`;
      const net = buildNet(spec, { pitchMul: thumb ? 2 : 1, noKnots: thumb, pk: F.pk });
      const cw = thumb ? spec.cord * 2.2 : spec.cord;
      // LEGEND's cord is braided: the body, then a 0.6u lighter strand laid along its upper edge (the same path, reused)
      const braid = spec.braid && !thumb;
      out +=
        `<g mask="url(#${u}-m)" fill="none" class="c01-netg">` +
        (braid
          ? // the path carries no paint of its own, so the reused copy takes the lighter strand's paint
            `<g class="c01-net c01-braid" stroke-width="${cw}"><path data-net="1" id="${u}-np" d="${net.d}"/></g>` +
            `<use href="#${u}-np" class="c01-netlite" stroke-width=".6" transform="translate(-.45 -.45)"/>`
          : `<path data-net="1" d="${net.d}" class="${spec.steel ? "c01-steelnet" : "c01-net"}" stroke-width="${cw}"/>`) +
        (net.knots
          ? `<path data-knots="1" d="${net.knots}" class="${spec.knotCls || (braid ? "c01-knot c01-bknot" : "c01-knot")}" stroke-width="${spec.knot}" stroke-linecap="round"/>`
          : "") +
        `</g>`;
    }
    if (tk === "legend" && !thumb) {
      // one floodlight, off the top-end corner: three hard-edged steps of light across the net
      out +=
        `<g clip-path="url(#${u}-mo)" class="c01-beam">` +
        `<path d="M350 4L30 240H250Z" class="c01-beam1"/><path d="M350 4L84 240H200Z" class="c01-beam2"/><path d="M350 4L120 240H166Z" class="c01-beam3"/></g>`;
    }
    if (tk === "legend") out += ballBag(u, F);
    out += `<g class="c01-content">${c.draw}</g>`;
    out += frame(u, p, o, tk, F);
    // goal line, the full width of the card
    if (tk === "homa")
      // on the day ground the chalk line takes the same 1px keyline as every other tier's goal line
      out +=
        `<path d="M2.3 ${HOMA_LINE}H357.7" class="c01-key" stroke-width="6.6" stroke-linecap="round" fill="none"/>` +
        `<path d="M2.3 ${HOMA_LINE}H357.7" class="c01-chalk" stroke-width="4.6" stroke-linecap="round" fill="none"${F.flat || thumb ? "" : ` filter="url(#${u}-chalk)"`}/>`;
    else
      out += `<rect x="0" y="${LINE.y0}" width="${VW}" height="${LINE.y1 - LINE.y0}" class="c01-linec c01-keyed"/>`;
    out += footing(u, p, F, tk);
    return { svg: out, mask: c.knock };
  }

  /* ---------- the back of the card: the crossbar's back face and the plate in close-up ---------- */
  function backFace(u, p, o, tk) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const legend = tk === "legend";
    const homa = tk === "homa";
    const outline = `<path d="M${L} ${LINE.y0}V${BAR.y0}H${R}V${LINE.y0}H${R - PW}V${BAR.y1}H${L + PW}V${LINE.y0}Z" class="c01-backframe" stroke-width="1.2" fill="none"/>`;
    const barFill = homa ? "none" : tk === "stade" ? "#8f9aa5" : "#e9edf1";
    const where = p.founder ? "" : ` · ${p.id}`;
    const barText = ar
      ? `<text x="180" y="${STAT_Y}" class="c01-bk ${homa ? "c01-ink" : "c01-paint"}" text-anchor="middle" direction="rtl">${esc(S.country)} · ${iso(p.season + where)}</text>`
      : `<text x="180" y="${STAT_Y}" class="c01-bk ${homa ? "c01-ink" : "c01-paint"}" text-anchor="middle">${esc(p.season)} · ${esc(S.country)}${esc(where)}</text>`;
    let s =
      outline +
      `<rect x="${L}" y="${BAR.y0}" width="${R - L}" height="24" fill="${barFill}" class="${homa ? "c01-backframe" : ""}"${homa ? ' stroke-width="1.2"' : ""}/>` +
      (tk === "stade"
        ? `<rect x="${L + 6}" y="${BAR.y0 + 4}" width="${R - L - 12}" height="15" rx="1" fill="#f2f4f6"/>`
        : "") +
      barText +
      `<rect x="0" y="${LINE.y0}" width="${VW}" height="6" class="c01-backline"/>`;
    if (p.founder) {
      // the plate in close-up, edge lettering legible: the ID's physical carrier
      const x0 = 92;
      const x1 = 268;
      const y0 = 84;
      const y1 = 192;
      const edgeTop = ar
        ? `<text x="180" y="${y0 + 16}" class="c01-pl-ar" text-anchor="middle" direction="rtl" fill="#8a8f96">${esc(S.founderLine)}</text>`
        : `<text x="180" y="${y0 + 15}" class="c01-pl" text-anchor="middle" fill="#8a8f96">${esc(S.founderLine)}</text>`;
      s +=
        `<rect x="${x0 - 14}" y="${y0 - 14}" width="${x1 - x0 + 28}" height="${y1 - y0 + 28}" rx="2" fill="#a9adb2" class="c01-backslab"/>` +
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="2" fill="#2a2c30"/>` +
        `<rect x="${x0 + 5}" y="${y0 + 22}" width="${x1 - x0 - 10}" height="${y1 - y0 - 44}" rx="1" fill="none" stroke="#55595f" stroke-width="1"/>` +
        `<g fill="#55595f"><circle cx="${x0 + 8}" cy="${y0 + 8}" r="2.4"/><circle cx="${x1 - 8}" cy="${y0 + 8}" r="2.4"/><circle cx="${x0 + 8}" cy="${y1 - 8}" r="2.4"/><circle cx="${x1 - 8}" cy="${y1 - 8}" r="2.4"/></g>` +
        edgeTop +
        `<text x="180" y="${y1 - 8}" class="c01-pl" text-anchor="middle" fill="#8a8f96">${esc(p.id)}</text>` +
        `<text x="178.6" y="${y1 - 31.6}" class="c01-pl26" text-anchor="middle" fill="#c3c8ce">${String(p.founder).slice(-2)}</text>` +
        `<text x="181.6" y="${y1 - 28.6}" class="c01-pl26" text-anchor="middle" fill="#0e0f11">${String(p.founder).slice(-2)}</text>` +
        `<text x="180" y="${y1 - 30}" class="c01-pl26" text-anchor="middle" fill="#8a8f96">${String(p.founder).slice(-2)}</text>`;
    } else {
      s += `<g transform="translate(160 110)">${MC.crest({ fill: p.club.primary, sash: p.club.secondary, ring: p.club.secondary, w: 40, h: 48 })}</g>`;
    }
    if (legend) {
      const label = ar ? "إعادة الهدف" : "Revoir le but";
      s +=
        `<g class="c01-replay"><rect x="120" y="208" width="120" height="22" rx="11" class="c01-replaybg"/>` +
        (ar
          ? arText(214, 223.5, "c01-replayt-ar", label)
          : `<text x="186" y="223" class="c01-replayt" text-anchor="middle">${label}</text>`) +
        `<path d="${ar ? "M226 214a5 5 0 1 0 4 2" : "M134 214a5 5 0 1 1 -4 2"}" class="c01-replayi" fill="none" stroke-width="1.6"/></g>`;
    }
    return `<svg class="c01-face c01-back" viewBox="0 0 ${VW} ${VH}" width="100%" aria-hidden="true" focusable="false">${s}</svg>`;
  }

  /* ---------- small marks ---------- */
  /** 24–32px, inside the ranking row's name cell: Π in the text colour; tier = count of net cords. */
  function miniTok(p, o, h) {
    const tier = TIER[p.tier] ? p.tier : "PRO";
    const s = h / 24;
    const W = Math.round(30 * s);
    const t = 2;
    const ext = Math.round(4 * s);
    const X0 = ext;
    const X1 = W - ext;
    const fh = Math.round(3 * s);
    const lh = 2;
    const YL = h - fh - lh;
    const feet = YL - 1; // a pixel of air between the post feet and the line
    const Y0 = 2;
    const mx0 = X0 + t;
    const mx1 = X1 - t;
    const my0 = Y0 + t;
    const fs = Math.round(h * 0.4);
    const base = Math.round(my0 + 1 + fs * 0.7);
    const tx = mx1 - 0.5;
    let out = "";
    let cords = "";
    // the tier is the number of net cords, in the free zone left of the 84 (at its height, clear of the line)
    const n = TIER[tier].cords;
    const mid = base - fs * 0.36;
    const cx1 = Math.floor(tx - emWidth(String(p.ovr), F_NAME) * fs - 1); // stop a pixel short of the 84
    for (let i = 0; i < n; i++)
      cords += `M${mx0} ${Math.floor(mid + (i - (n - 1) / 2) * 3) + 0.5}H${cx1}`;
    if (cords) out += `<path d="${cords}" class="c01-mcord" stroke-width="1" fill="none"/>`;
    // the floor: two ground stays from the post feet back to a short rear ground bar. A goal has a floor; a screen does not.
    const fd = Math.max(3, Math.round(3.6 * s));
    const ins = Math.max(3, Math.round(3.4 * s));
    const yb = feet - fd + 0.5;
    // drawn aliased, so the stays step pixel by pixel and survive a 1-bit render instead of greying out
    out += `<path d="M${mx0 + 0.5} ${feet}L${mx0 + ins} ${yb}H${mx1 - ins}L${mx1 - 0.5} ${feet}" stroke="currentColor" stroke-width="1" fill="none" shape-rendering="crispEdges"/>`;
    out += `<path d="M${X0} ${feet}V${Y0}H${X1}V${feet}H${X1 - t}V${my0}H${mx0}V${feet}Z" fill="currentColor"/>`;
    out += `<rect x="0" y="${YL}" width="${W}" height="${lh}" fill="currentColor"/>`;
    if (p.founder)
      out += `<rect x="${X1 - t / 2 - 2}" y="${YL + lh}" width="4" height="${fh}" fill="currentColor"/>`;
    if (tier === "LEGEND")
      out += `<circle cx="${X1 + 0.5}" cy="${Y0 - 0.5}" r="2" fill="currentColor"/>`;
    out += `<text x="${tx}" y="${base}" class="c01-t84" style="font-size:${fs}px" text-anchor="end" fill="currentColor">${p.ovr}</text>`;
    return (
      `<span class="c01 c01-tok is-mini t-${TIER[tier].k}" dir="ltr" role="img" aria-label="${esc(MC.label(p, o))}" style="width:${W}px;height:${h}px;--c01-club:${p.club.primary}">` +
      `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" aria-hidden="true" focusable="false">${out}</svg></span>`
    );
  }

  /** 44–80px (My position card, hub team card, head-to-head): the goal with its net, club and footing. */
  function compactTok(p, o, h) {
    const tier = TIER[p.tier] ? p.tier : "PRO";
    const tk = TIER[tier].k;
    const u = MC.uid("c01t");
    const W = Math.round(h * 1.29);
    const t = h >= 60 ? 3 : 2;
    const ext = Math.max(4, Math.round(W * 0.1));
    const lh = 2;
    const fh = Math.max(3, Math.round(h * 0.08));
    const YL = h - fh - lh;
    const Y0 = Math.max(3, Math.round(h * 0.09));
    const X0 = ext;
    const X1 = W - ext;
    const mx0 = X0 + t;
    const mx1 = X1 - t;
    const my0 = Y0 + t;
    const my1 = YL;
    const mw = mx1 - mx0;
    const mh = my1 - my0;
    const fs = Math.round(h * 0.4);
    const pad = Math.max(2, Math.round(h * 0.04));
    const tx = mx1 - pad;
    const base = Math.round(my0 + pad + fs * 0.7);
    // a few cords only (2–3 each way), so the mouth stays open and the goal reads before the 84
    let mesh = "";
    let meshCls = "c01-tnet";
    const px = (x) => Math.round(x) + 0.5;
    if (tier === "HOMA") {
      // two breeze-block courses behind the chalked goal
      const ch = Math.round(mh / 3);
      const bl = Math.round(mw / 3);
      for (let i = 1; i <= 2; i++) {
        const y = my1 - ch * i;
        mesh += `M${mx0} ${px(y)}H${mx1}`;
        for (let x = mx0 + (i % 2 ? bl / 2 : bl); x < mx1 - 2; x += bl)
          mesh += `M${px(x)} ${y}v${ch}`;
      }
      meshCls = "c01-twall";
    } else if (tier === "STADE" || tier === "PRO") {
      const a = tier === "STADE" ? 0.72 : 1;
      const step = Math.round(mw / (tier === "STADE" ? 3.4 : 2.6));
      for (let c = -a * mh + step / 2; c < mw; c += step)
        mesh += `M${r1(mx0 + c)} ${my0}l${r1(a * mh)} ${mh}`;
      for (let c = step / 2; c < mw + a * mh; c += step)
        mesh += `M${r1(mx0 + c)} ${my0}l${r1(-a * mh)} ${mh}`;
      if (tier === "STADE") meshCls = "c01-tsteel";
    } else {
      const n = tier === "LEGEND" ? 4 : 3;
      for (let i = 1; i < n; i++)
        mesh += `M${px(mx0 + (mw * i) / n)} ${my0}V${my1}M${mx0} ${px(my0 + (mh * i) / n)}H${mx1}`;
    }
    const halo = Math.max(2, Math.round(fs * 0.16));
    const defs =
      `<clipPath id="${u}-mo"><rect x="${mx0}" y="${my0}" width="${mw}" height="${mh}"/></clipPath>` +
      `<mask id="${u}-k" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${h}"><rect width="${W}" height="${h}" fill="#fff"/><text x="${tx}" y="${base}" class="c01-t84" style="font-size:${fs}px;fill:#000;stroke:#000;stroke-width:${halo}px;stroke-linejoin:round" text-anchor="end">${p.ovr}</text></mask>`;
    let s = `<g clip-path="url(#${u}-mo)"><path d="${mesh}" class="${meshCls}" stroke-width="1" fill="none" mask="url(#${u}-k)"/></g>`;
    if (tier === "CHAMPION" || tier === "LEGEND") {
      const dd = Math.round(h * 0.12);
      s += `<path d="M${mx0} ${my0}l${dd} ${dd}M${mx1} ${my0}l${-dd} ${dd}" stroke="currentColor" stroke-opacity=".7" stroke-width="${h >= 56 ? 2 : 1.5}" fill="none" mask="url(#${u}-k)"/>`;
    }
    const frameCls = tier === "STADE" ? "c01-tgalv" : "c01-tframe";
    const feet = my1 - 1; // a pixel of air between the post feet and the painted line
    s += `<path d="M${X0} ${feet}V${Y0}H${X1}V${feet}H${X1 - t}V${my0}H${mx0}V${feet}Z" class="${frameCls}"/>`;
    s += `<rect x="0" y="${YL}" width="${W}" height="${lh}" fill="currentColor"/>`;
    // the club, as a crest sticker on the end post
    const cr = h >= 60 ? 3 : 2.5;
    s += `<circle cx="${X1 - t / 2}" cy="${Math.round(my0 + mh * 0.62)}" r="${cr}" fill="${p.club.primary}" stroke="${p.club.secondary}" stroke-width="1"/>`;
    if (p.founder) {
      const fw = Math.max(5, Math.round(W * 0.08));
      s += `<rect x="${r1(X1 - t / 2 - fw / 2)}" y="${YL - 1}" width="${fw}" height="${h - YL + 1}" class="c01-tconc"/>`;
    }
    if (tier === "LEGEND") {
      const br = Math.max(3, Math.round(h * 0.075));
      const bx = X1 + 1;
      const by = Y0 - 1;
      s +=
        `<path d="M${X1 - br * 2.4} ${Y0}Q${r1(X1 + br * 1.9)} ${r1(Y0 - br * 2.6)} ${X1} ${r1(Y0 + br * 2.4)}" stroke="currentColor" stroke-opacity=".75" stroke-width="1" fill="none"/>` +
        `<circle cx="${bx}" cy="${by}" r="${br}" fill="#ffffff" stroke="currentColor" stroke-width="1"/>`;
    }
    s += `<text x="${tx}" y="${base}" class="c01-t84" style="font-size:${fs}px" text-anchor="end" fill="currentColor">${p.ovr}</text>`;
    return (
      `<span class="c01 c01-tok t-${tk}" dir="ltr" role="img" aria-label="${esc(MC.label(p, o))}" style="width:${W}px;height:${h}px;--c01-club:${p.club.primary}">` +
      `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" aria-hidden="true" focusable="false"><defs>${defs}</defs>${s}</svg></span>`
    );
  }

  /* ---------- registration ---------- */
  let legendPlayed = false;
  const c = {
    id: "c01",
    n: 1,
    slug: "01",
    name: "Lucarne",
    nameAr: "الزاوية العليا",
    category: "safe",
    philosophy:
      "Your season is the shot and your 84 is where it went in: the top corner of a five-a-side goal that you rebuild, tier by tier, from a chalk goal on a breeze-block wall to the floodlit box net that keeps your ball.",
    philosophyAr:
      "موسمك تسديدة، ورقم 84 هو المكان الذي دخلت منه الكرة: الزاوية العليا لمرمى خماسي تعيد بناءه مستوى بعد مستوى، من مرمى مرسوم بالطباشير على جدار من الطوب إلى شباك تحت الأضواء تحتفظ بكرتك.",
    idea: [
      "The card is a five-a-side goal (3 m by 2 m) seen from the penalty spot. The mouth is see-through: the net is drawn as cords over whatever ground the card sits on, so the outline is a Π standing on a goal line that runs the full width of the card, never a filled rectangle. The goal is an object and never mirrors.",
      "The 84 sits where the shot went in, the top corner of the net (la lucarne), in Changa 800, with the cords pulled in around it and a hard 6u clearance round the figures. 'OVR' is not in the artwork; it is in the accessible label. The name (Changa 800) and the tier sit top-start, so the card reads across as 'ALI … 84'; round them the net thins out in one feathered clearing rather than separate plates.",
      "Names are fitted to the space left of the 84, measured from the glyphs: they shrink from 34u to 22u, then break onto two lines at a space, then condense (never below 85%), and only then get smaller. MOHAMMED and ABDELKARIM stay on one condensed line; عبد الكريم breaks onto two, and the tier moves down with the last line.",
      "The four stats are one painted line along the crossbar's front face, CAP 91 · SEL 82 · TRF 86 · CON 78 in Tunnel Navy on the white bar (in chalk at HOMA), at every tier including LEGEND. Below 260px the labels drop and the four values grow.",
      "The manager is the shared hooded figure seen from behind, standing outside the start post and cropped by the left and bottom edges: the back of the hood with its seam, one shoulder, and a rim of light from the goal end. It is dropped at thumbnail size. On the share it stands small in the foreground with both shoulders in frame. The spec's hand-on-hip elbow is not drawn, because the shared figure has no arms.",
      "From PRO up the net is in the club's colour (here the lab's placeholder slate), lifted toward white on the night ground so the cords still read. The club's crest is a sticker wrapped round the end post at every tier.",
    ],
    belonging: [
      "Everyone's first goal was chalked on a wall, so HOMA is drawn fresh: a clean chalk goal on a new breeze-block wall, never a broken one. The ladder is a story the audience has lived: the wall, the galvanised cage of the terrain de proximité, white tubes with a real net, a box goal, and the box goal that kept your ball.",
      "A 15-year-old wants the box net, because everyone knows the sound of a ball hitting a real net. LEGEND is the only goal that keeps the shape of your shot: the ball stays in the corner and its net bag breaks the outline, which still shows at 24px.",
      "Comparing is already in the vocabulary: 'yours is still chalk', 'mine has a net'. From PRO up your club's colour is the net itself, and its sticker is on the post at every tier.",
      "Founders' goals stand in concrete poured in 2026, and the My position card and the share write it the way supporter groups write a founding year: ALI ·26.",
    ],
    founderMark: [
      "A founder's end post stands in a concrete footing, 44u wide, that sticks out 20u below the goal line, so the outline itself is asymmetric under the end post. Set into the concrete is a cast-iron plate with 26 cast in relief (a lit edge, a shadow and an iron face). Later cohorts' posts stand straight on the line.",
      "It never changes with tier: at HOMA the same footing sits at the foot of the chalked post, against the wall.",
      "Tap the crossbar and the card turns over. The back shows the plate in close-up with its edge lettering, FOUNDER 2026 and BOT #004821; the plate is the ID's physical carrier.",
      "Small, it is a block under the end post that breaks the line: 4×3px at 24px, 5–8px wide at 44–80px. The issue ceremony (the plate pressed into wet concrete) is specified but not built in the lab.",
    ],
    small: [
      "44–80px (My position card, hub team card, head-to-head): the Π in the text colour (galvanised grey at STADE) stands a pixel above a painted line that runs past both posts. Only two or three cords run each way, so the mouth stays open. The 84 is in Changa 800 at 0.4 of the height in the top-end corner, with the cords cleared around it. The club's sticker is a dot on the end post, and the founder block sits under it. The net carries the tier: two breeze-block courses at HOMA, sparse chain-link at STADE, a diamond net in club colour at PRO, a square net with depth stays at CHAMPION, and a finer net with the ball bag breaking the top-end corner at LEGEND.",
      "24–32px (inside the ranking row's name cell): a 30×24 Π drawn in the text colour, with a 1px gap above a 2px line. Inside it, the goal's floor: two ground stays run from the post feet back to a short rear ground bar, a trapezoid a screen on a stand never has; it is drawn aliased so it survives 1-bit. The 84 is in Changa 800 at 10px, top-end. The tier is the number of short net cords in club colour, stacked in the free space left of the 84 at its height, well clear of the line: HOMA 0, STADE 1, PRO 2, CHAMPION 3, and LEGEND 3 plus a 4px ball breaking the top-end corner. Founders have a 4×3px block under the end post. At 24px the cords are 4px stubs; at 32px, 9px.",
      "In the 1-bit test the full card reads as a Π, a line and a footing with net hatch. At HOMA (300px and 360px, night ground) the wall stays under the threshold and the chalk Π and the full-width chalk line are the bright edges. The HOMA thumbnail thins its wall further.",
    ],
    rtl: [
      "The goal never mirrors: the 84 stays top-right, which is where Arabic reading starts. The name علي sits top-left in Changa 800 at 34u, right-aligned 12u short of the 84 (x151 for 84; further right for a narrower number such as 71) and fitted inside x58 so it never crosses the start post. A two-word name such as عبد الكريم breaks onto two lines. The tier (محترف, from the app's strings) sits under the last line in Noto Sans Arabic 700 at 13u, below the name's descender (y130 for one line).",
      "The crossbar line reads right to left in Noto Sans Arabic 700: القائد 91 · التشكيلة 82 · الانتقالات 86 · الثبات 78, about 246u on a 268u bar. Figures stay Western and left-to-right, and no Arabic run has letter-spacing.",
      "Tokens never mirror either. In the My position card and the share, the founder year follows the name in reading order (علي ·26). The back of the bar reads المغرب · 2026/27, and the plate's edge reads عضو مؤسس 2026.",
    ],
    tiers: {
      HOMA: "Mur. A goal chalked on a new breeze-block wall laid in running bond, both ends squared with half blocks. One clean 5u chalk line draws the posts and bar down to the wall's foot, and a second chalk line runs the full width of the card on the ground below the wall. The 84 and the name carry an even fine chalk grain that keeps about 98% of the stroke; the tier and the stat line are solid chalk. One street lamp makes a pool of light: the wall fades toward its ends and top (to under 2:1 against the night ground), so the chalk Π stays the outline. Two fresh ball marks sit in the lucarne, clear of the 84, and the club sticker is on the wall. No net.",
      STADE:
        "Cage. Galvanised 12u tubes with spangle and welded joints, and rigid flat chain-link in bare wire at a tight 8u pitch: it does not bulge or sag. Behind it the welded rear frame shows, with a low rear rail, a diagonal brace in each side and weld beads at the joints. The stats are on a white enamel band painted along the bar, and the club's colours are taped round the start post.",
      PRO: "Tube. White-painted steel tubes with a specular streak from an end-side floodlight, and soft nylon: a net of square knots turned 45° in the club's colour, with knots in the club's second colour. It bulges round the 84 and sags between its ties, so the roof droops and the cords curve, the opposite of STADE's rigid cage.",
      CHAMPION:
        "Box. White powder-coated aluminium and a deeper box net receding in perspective (roof and side panels) on 3u stanchions, with a knotted square net and two floodlight glints.",
      LEGEND:
        "Lucarne. The same box goal with the heaviest net of the ladder: a braided cord (1.6u body with a lighter 0.6u strand along it) at a 9.5u pitch with 2.6u knots, in three receding planes plus a ground sheet, so the net is closed all round. Its fold sits low, below every label. The white ball is lodged for good in the top-end corner, and its net bag breaks the Π by 16u: the outline change that shows at 32px. One floodlight off the corner throws three hard-edged steps of light across the net, and the stats are still painted on the bar. No gold, no sparkle.",
    },
    legend: [
      "LEGEND is the goal that remembers your goal: the ball never leaves the top corner, and its net bag is the only place the outline breaks.",
      "The moment plays once, on the first open after the tier-up, and can be replayed from the back of the card ('Revoir le but · إعادة الهدف'). The 84 and the ball's net bag are on the card from the first frame. A ball leaves the ground in front of the manager and curves into the top corner over 520ms, accelerating. Impact is a hard cut: the bag at full stretch, a 240ms hold, one 60ms white flash clipped to the mouth, and one haptic. Then the bag and the net settle over 420ms into their permanent shape. Reduced motion shows only the final frame.",
      "Tap the net and it gives round your finger: the cords re-path and the edges stay tied to the posts. Tap the crossbar to turn the card over.",
    ],
    advantages: [
      "Anyone who has played reads it at a glance: a goal with a number in the top corner needs no caption.",
      "Progression is lived, not a colour change: each tier rebuilds the object in a new material, and every step is a real neighbourhood goal.",
      "The see-through Π holds both grounds: white and galvanised frames on night, and a 1px keyline with one lift shadow on day.",
      "Founders show in the outline itself (the footing under the end post) at every size down to 24px.",
      "There is no FUT skeleton: no portrait slot, no rating column, no stat tiles and no flag.",
      "The small marks stay goals: the open mouth, the floor trapezoid, the gap above the line and the cord count survive at 24px in 1-bit.",
    ],
    risks: [
      "To non-football eyes the Π can read as pi, a torii gate or a table. At 24–28px the line and the side-net stay carry the 'goal' reading, and the mini can still read as a screen on a stand.",
      "A goal suggests goals scored, so the card can read as a striker's rating rather than a manager's.",
      "The ink follows the theme (a navy 84 on day, white on night), so light and dark screenshots differ. The share is always night.",
      "The net shows the placeholder club's slate here. A real club colour (red, green, yellow) changes the whole card, which is the point, but each club needs a contrast check on both grounds.",
      "The manager is a cropped hood and one shoulder. Without the spec's hand-on-hip elbow (the shared figure has no arms) it reads as 'someone watching' rather than a pose.",
      "'Lucarne' as current Moroccan usage is unverified, HOMA is Darija, and 'Revoir le but' is a proposal: all need the owner's sign-off.",
      "The net is generated geometry: about 12 KB (HOMA) to 16 KB (STADE), 50–54 KB (PRO, CHAMPION) and 91 KB (LEGEND, whose braided net and ground sheet are the heaviest) of markup per full card. That is fine for one profile card but heavy for a grid of full cards. Tokens and rows are flat, filter-free and about 1–2 KB.",
      "Very long single-word names (ABDELKARIM) are condensed to 85% and set at about 18u to stay clear of the 84, which is honest but small. The names are measured from the loaded fonts; if a font has not loaded, a conservative estimate is used instead.",
      "HOMA's wall is still a grey panel on the day ground, where only its faded ends and the chalk keep it from reading as a block.",
      "The head-to-head share (a top-down pitch with both goals) is specified but not built, because the lab contract has one share renderer.",
    ],
    gridWidth: 300,
    detailWidth: 460,

    full(p, o = {}) {
      const S = MC.s(o);
      const u = MC.uid("c01");
      const tk = tierOf(p).k;
      const thumb = !!o.thumb;
      const F = { thumb, flat: false };
      const g = goal(u, p, o, F);
      const defs =
        `<defs>${frameDefs(u, tk, F, p)}` +
        `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><rect width="${VW}" height="${VH}" fill="#fff"/>${g.mask}</mask></defs>`;
      const lift = thumb
        ? ""
        : `<rect x="24" y="${LINE.y0 + 2}" width="312" height="7" rx="3.5" class="th-l" fill="#001c49" opacity=".55" filter="url(#${u}-soft)"/>`;
      const front =
        `<svg class="c01-face c01-front" viewBox="0 0 ${VW} ${VH}" width="100%" aria-hidden="true" focusable="false">` +
        defs +
        lift +
        g.svg +
        (thumb ? "" : figure()) +
        `</svg>`;
      return (
        `<div class="c01 c01-card t-${tk}${thumb ? " is-thumb" : ""}" dir="${S.dir}" lang="${MC.isAr(o) ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}" style="--c01-club:${p.club.primary};--c01-club2:${p.club.secondary}">` +
        front +
        (thumb ? "" : backFace(u, p, o, tk)) +
        `</div>`
      );
    },

    token(p, o = {}) {
      const h = Math.max(16, Math.round(o.size || 44));
      return o.mini || h <= 32 ? miniTok(p, o, h) : compactTok(p, o, h);
    },

    /** The "My position" compact card: rank, the 44px goal, name ·26 over tier, points. */
    row(p, o = {}) {
      const S = MC.s(o);
      const tk = tierOf(p).k;
      const tok = compactTok(p, o, 44);
      const founder = p.founder
        ? `<span class="c01-r26">·${MC.ltr(String(p.founder).slice(-2))}</span>`
        : "";
      return (
        `<div class="c01 c01-row t-${tk}${o.me ? " is-me" : ""}" dir="${S.dir}" role="img" aria-label="${esc(`${o.rank}. ${MC.label(p, o)}, ${o.pts} ${S.pts}`)}">` +
        `<span class="c01-rk">${MC.ltr(String(o.rank))}</span>` +
        `<span class="c01-rt">${tok}</span>` +
        `<span class="c01-rn"><b><bdi>${esc(MC.nameOf(p, o))}</bdi>${founder}</b><small>${esc(S.tiers[p.tier])}</small></span>` +
        `<span class="c01-rp"><b>${MC.ltr(String(o.pts))}</b><small>${esc(S.pts)}</small></span>` +
        `</div>`
      );
    },

    share(p, o = {}) {
      const S = MC.s(o);
      const ar = MC.isAr(o);
      const u = MC.uid("c01s");
      const spec = tierOf(p);
      const tk = spec.k;
      // the card's goal, flat, scaled 1.11 so the posts stand at x25 and x335 on the 360×640 story
      const k = 1.11;
      const tx = -19.7;
      const ty = 103.6;
      const fs = r1(150 / k); // the 84 at 150px
      const by = r1(MO.y0 + 9 + fs * 0.7);
      const t84 = `<text x="302" y="${by}" class="c01-84 c01-sh84" text-anchor="end" style="font-size:${fs}px">${p.ovr}</text>`;
      const ko84 = `<text x="302" y="${by}" class="c01-84" text-anchor="end" style="font-size:${fs}px;fill:#000;stroke:#000;stroke-width:12;stroke-linejoin:round">${p.ovr}</text>`;
      const F = {
        flat: true,
        content: { draw: t84, knock: ko84 },
        pk: { x: r1(302 - fs * 0.6), y: r1(by - fs * 0.36) },
      };
      const g = goal(u, p, o, F);
      // turf: horizontal mowing bands, thinner toward the goal line
      let turf = "";
      let y = r1(LINE.y1 * k + ty);
      [8, 10, 13, 16, 20, 25, 31, 38, 47, 60].forEach((hh, i) => {
        if (y >= 640) return;
        const hgt = r1(Math.min(hh, 640 - y));
        turf += `<rect x="0" y="${y}" width="360" height="${hgt}" fill="${i % 2 ? "#0f2547" : "#132c52"}"/>`;
        y = r1(y + hh);
      });
      const lineY = r1(LINE.y0 * k + ty);
      // one floodlight glare, top-end, with two hard-edged steps of light falling across the goal. The beams
      // only show in the haze below the wordmark band (they fade in from y112), so they never pass behind the logo.
      const GX = 344;
      const GY = 34;
      const light =
        `<linearGradient id="${u}-haze" gradientUnits="userSpaceOnUse" x1="0" y1="112" x2="0" y2="196">${stops(
          [
            [0, "#eaf6ff", 0],
            [1, "#eaf6ff", 1],
          ],
        )}</linearGradient>` +
        `<path d="M${GX} ${GY}L36 ${lineY}H236Z" fill="url(#${u}-haze)" opacity=".07"/>` +
        `<path d="M${GX} ${GY}L96 ${lineY}H190Z" fill="url(#${u}-haze)" opacity=".08"/>` +
        `<circle cx="${GX}" cy="${GY}" r="20" fill="#eaf6ff" opacity=".07"/><circle cx="${GX}" cy="${GY}" r="11" fill="#eaf6ff" opacity=".14"/>` +
        `<circle cx="${GX}" cy="${GY}" r="5" fill="#eaf6ff" opacity=".5"/><circle cx="${GX}" cy="${GY}" r="2.4" fill="#ffffff"/>`;
      const logoH = 22;
      const logoW = r1(logoH * MC.LOGO_RATIO.wordmark);
      const logoX = ar ? r1(336 - logoW) : 24;
      const name = MC.nameOf(p, o);
      const founder = p.founder ? ` ·${String(p.founder).slice(-2)}` : "";
      const sample = ar ? "مثال" : "Exemple";
      const handle = "@" + p.name.lat.toLowerCase();
      const text = ar
        ? // Arabic descenders (the dots of ي) reach about 16u below the baseline, so the meta lines sit lower
          arText(336, 484, "c01-sh-name", `${esc(name)}${founder} · ${esc(S.tiers[p.tier])}`) +
          `<text x="336" y="514" class="c01-sh-meta" text-anchor="end">${esc(handle)} · ${esc(p.id)}</text>` +
          arText(336, 530, "c01-sh-meta c01-sh-meta-ar", `${iso(p.season)} · ${sample}`)
        : `<text x="336" y="490" class="c01-sh-name" text-anchor="end">${esc(name)}${founder} · ${esc(S.tiers[p.tier])}</text>` +
          `<text x="336" y="510" class="c01-sh-meta" text-anchor="end">${esc(handle)} · ${esc(p.id)}</text>` +
          `<text x="336" y="525" class="c01-sh-meta" text-anchor="end">${esc(p.season)} · ${sample}</text>`;
      return (
        `<div class="c01 c01-share t-${tk}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" style="--c01-club:${p.club.primary};--c01-club2:${p.club.secondary}">` +
        `<svg viewBox="0 0 360 640" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">` +
        `<defs>${frameDefs(u, tk, F, p)}<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><rect width="${VW}" height="${VH}" fill="#fff"/>${g.mask}</mask></defs>` +
        `<rect width="360" height="640" fill="#001c49"/>` +
        `<rect y="150" width="360" height="${r1(lineY - 150)}" fill="#05193a"/>` +
        turf +
        light +
        `<g transform="translate(${tx} ${ty}) scale(${k})">${g.svg}</g>` +
        `<g transform="translate(${logoX} 83)">${MC.logo("wordmark", { variant: "light", w: logoW, h: logoH, label: false })}</g>` +
        // the manager from behind, both shoulders in frame, small in the foreground, watching the goal
        figure({ x: 8, y: 514, w: 108.3, h: 130 }) +
        text +
        `</svg></div>`
      );
    },

    /** Tap the net: it ripples out from your finger. Tap the crossbar: the card turns to the bar's
        back face and the founder plate. LEGEND: the shot plays once (first open, or "Revoir le but"
        on the back); the 84 and the lodged ball are on the card from the first frame. */
    mount(el, o = {}) {
      if (!el || !el.classList || !el.classList.contains("c01-card") || el.dataset.c01m) return;
      const svg = el.querySelector("svg.c01-front");
      if (!svg) return;
      el.dataset.c01m = "1";
      el.classList.add("is-live");
      const anim = o.motion !== false && !reducedMotion();
      if (!anim) el.classList.add("no-anim");
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
      let pinchId = 0;
      const pinchAnim = (x, y, s, env, dur, steps, done) => {
        const id = ++pinchId;
        let i = 0;
        const tick = () => {
          if (id !== pinchId) return;
          i++;
          const k = env(i / steps);
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
      const settle = (t) => 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.06;
      const highlight = () => {
        el.classList.add("is-hl");
        setTimeout(() => el.classList.remove("is-hl"), 120);
      };

      let busy = false;
      const shoot = () => {
        if (busy || !legend || !anim) return;
        busy = true;
        const bag = svg.querySelector(".c01-bag");
        const still = svg.querySelector(".c01-bag .c01-ball");
        if (still) still.style.opacity = "0";
        const g = document.createElementNS(NS, "g");
        g.style.pointerEvents = "none";
        const shadowEl = document.createElementNS(NS, "ellipse");
        shadowEl.setAttribute("fill", "#000");
        const ball = document.createElementNS(NS, "g");
        ball.innerHTML = ballArt(BALL.r);
        g.appendChild(shadowEl);
        g.appendChild(ball);
        svg.appendChild(g);
        const P0 = [82, 262];
        const P1 = [170, 24];
        const P2 = [BALL.x, BALL.y];
        const t0 = performance.now();
        const fly = (now) => {
          const t = Math.min(1, (now - t0) / 520);
          const e = t * t; // accelerating
          const a = 1 - e;
          const x = a * a * P0[0] + 2 * a * e * P1[0] + e * e * P2[0];
          const y = a * a * P0[1] + 2 * a * e * P1[1] + e * e * P2[1];
          ball.setAttribute(
            "transform",
            `translate(${r1(x)} ${r1(y)}) scale(${r1((1.15 - 0.15 * e) * 100) / 100})`,
          );
          shadowEl.setAttribute("cx", r1(x));
          shadowEl.setAttribute("cy", r1(270 - 26 * e));
          shadowEl.setAttribute("rx", r1(11 * (1 - e) + 1));
          shadowEl.setAttribute("ry", r1(2.8 * (1 - e) + 0.4));
          shadowEl.setAttribute("opacity", r1(0.35 * (1 - e) * 100) / 100);
          if (t < 1) return requestAnimationFrame(fly);
          impact();
        };
        const impact = () => {
          // hard cut: the ball is in the corner, the net at full stretch; hold 240ms, one 60ms flash
          g.remove();
          if (still) still.style.opacity = "";
          const grow = (sc) =>
            bag &&
            bag.setAttribute(
              "transform",
              `translate(${R} ${BAR.y0}) scale(${sc}) translate(${-R} ${-BAR.y0})`,
            );
          grow(1.22);
          repath({ x: 300, y: 70, k: 0.3, s: 54 }, 1.3);
          const flash = document.createElementNS(NS, "rect");
          flash.setAttribute("x", MO.x0);
          flash.setAttribute("y", MO.y0);
          flash.setAttribute("width", MO.x1 - MO.x0);
          flash.setAttribute("height", MO.y1 - MO.y0);
          flash.setAttribute("fill", "#ffffff");
          flash.setAttribute("opacity", ".4");
          flash.style.pointerEvents = "none";
          svg.insertBefore(flash, svg.querySelector(".c01-content"));
          setTimeout(() => flash.remove(), 60);
          if (navigator.vibrate) navigator.vibrate(40);
          setTimeout(() => {
            pinchAnim(
              300,
              70,
              54,
              (t) => 0.3 * (1 - settle(t)),
              420,
              8,
              () => repath(null, 1),
            );
            const s0 = performance.now();
            const back = (now) => {
              const t = Math.min(1, (now - s0) / 420);
              grow(r1((1.22 - 0.22 * settle(t)) * 1000) / 1000);
              if (t < 1) return requestAnimationFrame(back);
              if (bag) bag.removeAttribute("transform");
              busy = false;
            };
            requestAnimationFrame(back);
          }, 240);
        };
        requestAnimationFrame(fly);
      };

      el.addEventListener("click", (e) => {
        if (el.classList.contains("is-flipped")) {
          const replay = e.target && e.target.closest && e.target.closest(".c01-replay");
          el.classList.remove("is-flipped");
          if (replay) setTimeout(shoot, anim ? 680 : 0);
          return;
        }
        const pt = toSvg(e);
        if (!pt) return;
        if (pt.x >= L - 4 && pt.x <= R + 4 && pt.y >= BAR.y0 - 6 && pt.y <= BAR.y1 + 2) {
          el.classList.add("is-flipped");
          return;
        }
        if (pt.x >= MO.x0 && pt.x <= MO.x1 && pt.y >= MO.y0 && pt.y <= MO.y1) {
          if (anim && nets.length)
            pinchAnim(pt.x, pt.y, 34, (t) => 0.18 * Math.sin(Math.PI * t), 420, 8);
          else highlight();
        }
      });
      if (legend && anim && (o.reveal || !legendPlayed)) {
        legendPlayed = true;
        shoot();
      }
    },
  };
  MC.register(c);
})();
