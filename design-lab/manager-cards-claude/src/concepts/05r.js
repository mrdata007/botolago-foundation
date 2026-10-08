/* 05 SEMELLE (bold). The manager's identity is the underside of a boot, seen studs up:
   a moulded plate that carries the 84 where a maker moulds the size, the BotolaGO ID as
   the style code, the four decisions as the size row, and the injection-moulding date
   wheel every moulded part carries. The tier is the stud pattern: turf nubs, artificial-
   grass cones, firm-ground chevron blades, screw-in steel, then six machined steel studs
   that break the outline under a clear "ice" plate. Latin cards are a RIGHT boot; Arabic
   cards are the LEFT boot. Light always comes from the top-left: the left boot is drawn
   with mirrored coordinates, never with a mirroring transform, so shading stays true. */
(function () {
  const MC = window.MC;
  const esc = (s) => MC.esc(s);
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;

  /* ------------------------------------------------------------------ geometry */
  // A right outsole traced from a firm-ground plate, heel at the top, toe at the bottom.
  // Heel: a short egg 141 wide; lateral edge (right) almost straight; medial arch (left)
  // concave to 122 at the waist; ball widest (198) at y 450; the toe tapers over the last
  // third to an off-centre tip on the big-toe side.
  const MIRROR = 255; // x -> 255 - x gives the left boot in the same box
  const START = [134, 14];
  const SEGS = [
    [174, 14, 202, 44, 204, 92],
    [206, 150, 205, 205, 207, 255],
    [209, 320, 224, 368, 226, 420],
    [228, 470, 226, 500, 218, 532],
    [204, 585, 150, 630, 96, 630],
    [58, 630, 36, 598, 34, 556],
    [32, 515, 26, 460, 30, 420],
    [34, 360, 80, 320, 84, 265],
    [88, 215, 64, 170, 63, 118],
    [62, 52, 94, 14, 134, 14],
  ];
  const pathOf = (map) => {
    const m = (x, y) => map(x, y).map(r1).join(" ");
    return "M" + m(START[0], START[1]) + SEGS.map((s) => "C" + m(s[0], s[1]) + " " + m(s[2], s[3]) + " " + m(s[4], s[5])).join("") + "Z";
  };
  const POLY = (() => {
    const pts = [];
    let p0 = START;
    for (const s of SEGS) {
      for (let i = 1; i <= 24; i++) {
        const t = i / 24, mt = 1 - t;
        const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
        pts.push([a * p0[0] + b * s[0] + c * s[2] + d * s[4], a * p0[1] + b * s[1] + c * s[3] + d * s[5]]);
      }
      p0 = [s[4], s[5]];
    }
    return pts;
  })();
  /** [left, right] x of the outline at height y (Latin coordinates). */
  function span(y) {
    const xs = [];
    for (let i = 0; i < POLY.length; i++) {
      const a = POLY[i], b = POLY[(i + 1) % POLY.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
  }
  const midX = (y) => {
    const s = span(y);
    return (s[0] + s[1]) / 2;
  };
  const insideBy = (x, y, m) => [-m, 0, m].every((dy) => {
    const s = span(y + dy);
    return s && x - s[0] >= m && s[1] - x >= m;
  });
  const Lx = (y, i) => [r1(span(y)[0] + i), y];
  const Rx = (y, i) => [r1(span(y)[1] - i), y];
  const polyD = (pts, map) => "M" + pts.map((p) => map(p[0], p[1]).map(r1).join(" ")).join("L");

  // The heel counter: the heel part of the rim, from 10 to 2 o'clock, carries the club colour.
  const HEEL = (() => {
    const lim = 54;
    let i = POLY.length - 1;
    while (POLY[i - 1][1] <= lim) i--;
    let j = 0;
    while (POLY[j + 1][1] <= lim) j++;
    return POLY.slice(i).concat(POLY.slice(0, j + 1));
  })();
  // The toe guard (LEGEND): a 9-unit machined band following the toe, standing 10 units proud at the tip.
  const TOE = (() => {
    const pts = POLY.filter((p) => p[1] > 548);
    // keep the contiguous run around the tip, ordered lateral -> medial
    const idx = POLY.map((p, i) => (p[1] > 548 ? i : -1)).filter((i) => i >= 0);
    const run = idx.map((i) => POLY[i]);
    const n = run.length;
    const outer = [], inner = [];
    run.forEach((p, k) => {
      const a = run[Math.max(0, k - 1)], b = run[Math.min(n - 1, k + 1)];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      if (nx * (p[0] - 128) + ny * (p[1] - 400) < 0) { nx = -nx; ny = -ny; }
      const t = k / (n - 1);
      const off = 1.5 + 9.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.04) / 0.92)));
      outer.push([p[0] + nx * off, p[1] + ny * off]);
      inner.push([p[0] + nx * (off - 9), p[1] + ny * (off - 9)]);
    });
    void pts;
    return { outer, inner, run };
  })();

  /* Per-language geometry: mirrored coordinates for the left boot (light stays top-left). */
  const GEO = {};
  function geo(ar) {
    const key = ar ? "ar" : "lat";
    if (GEO[key]) return GEO[key];
    const X = (x) => (ar ? MIRROR - x : x);
    const map = (x, y) => [X(x), y];
    const G = {
      ar, X, map,
      D: pathOf(map),
      heel: polyD(HEEL, map),
      toe: polyD(TOE.outer, map) + "L" + TOE.inner.slice().reverse().map((p) => map(p[0], p[1]).map(r1).join(" ")).join("L") + "Z",
      toeMid: TOE.outer.map((p, i) => [(p[0] + TOE.inner[i][0]) / 2, (p[1] + TOE.inner[i][1]) / 2]),
    };
    return (GEO[key] = G);
  }

  /* Fixed layout (Latin coordinates; the left boot mirrors x through X()). */
  const LAY = {
    crest: { x: 135, y: 34, w: 11.5 },
    wheel: { x: 134, y: 111, r: 21 },
    idY: 158,
    ctY: 172,
    plate: { x: 145.6, y: 252, w: 100, h: 70 },
    spine: [196, 408],
    nameY: 341,
    tagY: 352,
    sizeY: [398, 416],
    grooves: [430, 439, 448],
    ovr: { x: 126, y: 558, fs: 92 },
    season: "M60 600Q98 628 136 606",
  };

  // A chevron blade: a fat bar bent in a shallow V (about 130 degrees), apex on +x at rotate(0),
  // each arm 11 long and 13 thick, so its footprint is 18 x 33: a moulded blade, as thick as it
  // is long, that never thins into a bracket. It runs along the edge with its bend pointing out.
  const CHEV = "M-2.2 -10L2.6 0L-2.2 10";
  const CHW = 13;
  const OV_C = [126, 528]; // the 84's centre in the full card
  /** The outline's outward normal (deg) nearest to a point: blades follow the edge. */
  const edgeAngle = (x, y) => {
    let bi = 0, bd = 1e9;
    POLY.forEach((p, i) => {
      const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
      if (d < bd) { bd = d; bi = i; }
    });
    const n = POLY.length, a = POLY[(bi - 3 + n) % n], b = POLY[(bi + 3) % n];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    if (nx * (x - 128) + ny * (y - 330) < 0) { nx = -nx; ny = -ny; }
    return r1((Math.atan2(ny, nx) * 180) / Math.PI);
  };
  /** Lean a blade 14 degrees toward the toe, as moulded rotational blades do. */
  const tilt = (a) => r1(a + (Math.abs(a - 90) < 25 ? 0 : 14 * Math.sign(((90 - a + 540) % 360) - 180)));
  /* ------------------------------------------------------------------ studs per tier */
  // t: nub | cone | round | chev | steel | big
  const ZONES = [
    [100, 68, 170, 178], // date wheel, founder arc, style code, country
    [92, 212, 200, 292], // shank plate
    [0, 300, 260, 452], // name, tier tag, size row, flex grooves
    [64, 490, 190, 566], // the 84
    [56, 594, 140, 630], // season
  ];
  const STUDS = {
    HOMA: (() => {
      const out = [];
      const p = 19.5, rr = 5.2;
      for (let row = 0, y = 30; y < 626; row++, y += p * 0.866) {
        for (let x = 20 + (row % 2 ? p / 2 : 0); x < 240; x += p) {
          if (!insideBy(x, y, 12.8)) continue;
          if (ZONES.some((z) => x > z[0] - rr && x < z[2] + rr && y > z[1] - rr && y < z[3] + rr)) continue;
          if (Math.hypot(x - LAY.crest.x, y - LAY.crest.y) < 15) continue;
          out.push({ t: "nub", x: r1(x), y: r1(y), r: rr });
        }
      }
      return out;
    })(),
    STADE: [
      [Lx(52, 23), Rx(52, 23), Lx(96, 18), Rx(96, 18), Lx(140, 18), Rx(140, 18), Lx(190, 20), Rx(190, 20)],
      [Lx(300, 17), Rx(300, 17)],
      [Lx(470, 17), Lx(518, 18), Lx(566, 19), Rx(470, 18), Rx(518, 19), Rx(566, 20)],
      [Lx(330, 24), Rx(330, 22), Lx(430, 18), Rx(430, 18)],
      [[70, 604], [112, 614], [154, 596], [Lx(606, 16)[0], 606]].slice(0, 2),
    ].flat().map(([x, y]) => ({ t: "cone", x, y, r: 9.2 })),
    PRO: [
      ...[Lx(58, 27), Rx(58, 26), Lx(196, 26), Rx(196, 25)].map(([x, y]) => ({ t: "round", x, y, r: 15 })),
      ...[Lx(452, 20), Rx(436, 20), Lx(520, 18), Rx(500, 19), Lx(592, 22), Rx(566, 21)].map(([x, y]) => ({ t: "chev", x, y, a: tilt(edgeAngle(x, y)) })),
    ],
    CHAMPION: [
      ...[Lx(60, 25), Rx(60, 24), Lx(456, 23), Rx(486, 23), Lx(570, 25), Rx(586, 22)].map(([x, y]) => ({ t: "steel", x, y, r: 12.5 })),
      ...[Lx(196, 25), Rx(196, 24), Lx(514, 18), Rx(538, 19)].map(([x, y]) => ({ t: "chev", x, y, a: tilt(edgeAngle(x, y)) })),
    ],
    LEGEND: [Lx(74, -1), Rx(74, -1), Lx(452, -2), Rx(452, -2), Lx(560, 0), Rx(552, 1)].map(([x, y]) => ({ t: "big", x, y, r: 16.5 })),
  };
  STUDS.STADE = STUDS.STADE.filter((s, i, a) => a.findIndex((q) => Math.hypot(q.x - s.x, q.y - s.y) < 1) === i);

  /* ------------------------------------------------------------------ materials */
  const RIM = "#efe9dc";
  // plate gradient, ink (moulded type), inkTone, recess, wheel (non-founder), shank plate,
  // figure, stud [lit, mid, dark], spine, tag, 84 side wall, grain opacity, gloss
  const TIER = {
    HOMA: {
      plate: ["#e3ad70", "#c98b4a", "#a9692e"], ink: "#3a2006", inkTone: "#5c3712", recess: "#8f5a24", wheel: "#c4884a",
      med: ["#f3cf9f", "#a9692e"], figure: ["#3a2006", "#fff1dc", "#1e1003", "#5c3712"], stud: ["#f0c58e", "#cf9354", "#8e561f"], spine: "#cf9556", tag: "#b97a3c", side: "#8f5a24",
      grain: 0.3, gloss: 0.16, part: 0.3, tok: "#c98b4a", topTok: "#f3cf9f",
    },
    STADE: {
      plate: ["#33363c", "#1f2125", "#121316"], ink: "#f4f1e9", inkTone: "#c9c6bf", recess: "#08090a", wheel: "#2a2d32",
      med: ["#7a808a", "#141518"], figure: ["#060708", "#d3d8df", "#000000", "#2a2d32"], stud: ["#b9bec6", "#5a6069", "#141518"], spine: "#2a2c31", tag: "#2d3036", side: "#8d939b",
      grain: 0.32, gloss: 0.08, part: 0.24, tok: "#1f2125", topTok: "#b9bec6",
    },
    PRO: {
      plate: ["#3a7cff", "#0151fc", "#0036b8"], ink: "#ffffff", inkTone: "#d6e4ff", recess: "#002a80", wheel: "#0a4fe6",
      med: ["#8ab6ff", "#0a3fc4"], figure: ["#03174a", "#dfeaff", "#000b26", "#0c2f86"], stud: ["#cfe2ff", "#2f6dff", "#00267a"], spine: "#0c58fd", tag: "#003ab8", side: "#8fb0f2",
      grain: 0.28, gloss: 0.5, part: 0, tok: "#0151fc", topTok: "#e3f1ff",
    },
    CHAMPION: {
      plate: ["#30353d", "#1b1e24", "#0d0f12"], ink: "#f4f1e9", inkTone: "#c3c7cd", recess: "#050607", wheel: "#22262c",
      med: ["#848c97", "#0d0f12"], figure: ["#050607", "#e6eaee", "#000000", "#2b3038"], stud: ["#59616c", "#262a31", "#07080a"], spine: "#23272e", tag: "#2b3038", side: "#9aa1ab",
      grain: 0.14, gloss: 0.32, part: 0, tok: "#1b1e24", topTok: "#59616c",
    },
    LEGEND: {
      plate: ["#6f8996", "#526a76", "#3c525e"], ink: "#0e1620", inkTone: "#26333f", recess: "#0e1620", wheel: "#9fb3bd",
      med: ["#ffffff", "#8f9aa6"], figure: ["#18202a", "#ffffff", "#05080b", "#3a4552"], stud: ["#ffffff", "#c4cbd3", "#5f6874"], spine: "#c9d0d8", tag: "#0e1620", side: "#0e1620",
      grain: 0.1, gloss: 0.42, part: 0, tok: "#8ca5b1", topTok: "#ffffff",
    },
  };
  const STEEL = [
    [0, "#fbfcfd"], [0.16, "#c9d0d8"], [0.32, "#7f8a97"], [0.47, "#eef2f6"], [0.6, "#aab3bd"], [0.76, "#59636f"], [0.9, "#cfd6dd"], [1, "#f4f6f8"],
  ];
  const BRASS = [
    [0, "#fbefc4"], [0.22, "#e6cf8b"], [0.45, "#b8963f"], [0.62, "#f2dea0"], [0.82, "#a9873a"], [1, "#e9d595"],
  ];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
  const stops = (a, op = 1) => a.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"${op < 1 ? ` stop-opacity="${op}"` : ""}/>`).join("");

  /* ------------------------------------------------------------------ stud drawing */
  /**
   * One stud, as three layers: its cast shadow (collected and blurred once), its body
   * (a side wall built from stacked copies, then the lit top face) and its detail.
   */
  function stud(u, s, P, X, full) {
    const x = r1(X(s.x)), y = s.y;
    const ar = X(0) !== 0;
    const sh = [], body = [];
    const walls = (n, shape) => {
      for (let i = n; i >= 1; i--) body.push(shape(r1(0.6 * i), r1(1.0 * i), mix(P.stud[2], "#000000", 0.08 * i)));
    };
    if (s.t === "nub") {
      sh.push(`<circle cx="${r1(x + 3)}" cy="${r1(y + 5)}" r="${s.r}"/>`);
      if (full) walls(3, (dx, dy, c) => `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${s.r}" fill="${c}"/>`);
      body.push(`<circle cx="${x}" cy="${y}" r="${s.r}" fill="url(#${u}-nub)"/>`);
      if (full) body.push(`<circle cx="${r1(x - s.r * 0.34)}" cy="${r1(y - s.r * 0.38)}" r="${r1(s.r * 0.3)}" fill="#fff6e6" opacity=".6"/>`);
      return { sh, body };
    }
    if (s.t === "cone" || s.t === "round") {
      const cone = s.t === "cone";
      const top = s.r * (cone ? 0.52 : 0.8);
      sh.push(`<circle cx="${r1(x + 3)}" cy="${r1(y + 5)}" r="${s.r}"/>`);
      if (full) walls(4, (dx, dy, c) => `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${s.r}" fill="${c}"/>`);
      body.push(`<circle cx="${x}" cy="${y}" r="${s.r}" fill="url(#${u}-cone)"/>`);
      body.push(`<circle cx="${r1(x - 0.5)}" cy="${r1(y - 0.8)}" r="${r1(top)}" fill="url(#${u}-top)"/>`);
      if (full) {
        body.push(`<circle cx="${r1(x - 0.5)}" cy="${r1(y - 0.8)}" r="${r1(top)}" fill="none" stroke="#fff" stroke-width=".9" stroke-dasharray="${r1(top * 1.6)} ${r1(top * 6)}" stroke-dashoffset="${r1(top * 2.9)}" opacity=".85"/>`);
        if (!cone) body.push(`<circle cx="${r1(x - 0.5)}" cy="${r1(y - 0.8)}" r="${r1(top * 0.34)}" fill="${P.stud[1]}" opacity=".55"/>`);
      }
      return { sh, body };
    }
    if (s.t === "chev") {
      // apex points away from the 84; the left boot mirrors the angle, not the light
      const a = ar ? 180 - s.a : s.a;
      const g = (dx, dy, stroke, w) => `<path d="${CHEV}" transform="translate(${r1(x + dx)} ${r1(y + dy)}) rotate(${a})" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
      sh.push(g(3, 5, "#000", CHW));
      if (full) walls(4, (dx, dy, c) => g(dx, dy, c, CHW));
      body.push(g(0, 0, P.stud[1], CHW));
      body.push(g(-0.6, -0.9, `url(#${u}-chv)`, 7.4));
      if (full) body.push(g(-2.2, -2.8, "#fff", 1.3).replace("/>", ' opacity=".5"/>'));
      return { sh, body };
    }
    // steel: a screw-in stud on a moulded boss
    const big = s.t === "big";
    const r = s.r;
    const boss = r + (big ? 4 : 3.2);
    sh.push(`<circle cx="${r1(x + 3)}" cy="${r1(y + 5)}" r="${r1(boss)}"/>`);
    body.push(`<circle cx="${x}" cy="${y}" r="${r1(boss)}" fill="${big ? `url(#${u}-boss)` : P.stud[2]}"/>`);
    if (full) for (let i = 4; i >= 1; i--) body.push(`<circle cx="${r1(x + 0.6 * i)}" cy="${r1(y + 1.0 * i)}" r="${r}" fill="${mix("#59636f", "#000000", 0.1 * i)}"/>`);
    body.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}-steel)"/>`);
    body.push(`<circle cx="${x}" cy="${y}" r="${r1(r * 0.64)}" fill="url(#${u}-face)"/>`);
    if (full) {
      body.push(`<g fill="none" stroke="#fff" stroke-width=".35" opacity=".4">` + [0.2, 0.32, 0.44, 0.56].map((k) => `<circle cx="${x}" cy="${y}" r="${r1(r * k)}"/>`).join("") + `</g>`);
      body.push(`<path d="M${r1(x - r * 0.78)} ${r1(y - r * 0.3)}A${r1(r * 0.84)} ${r1(r * 0.84)} 0 0 1 ${r1(x + r * 0.2)} ${r1(y - r * 0.82)}" stroke="#fff" stroke-width="${big ? 1.8 : 1.3}" fill="none" stroke-linecap="round" opacity=".95"/>`);
    }
    body.push(`<circle cx="${x}" cy="${y}" r="${r1(r * 0.64)}" fill="none" stroke="#3d4650" stroke-width=".6" opacity=".7"/>`);
    body.push(`<circle cx="${r1(x - r * 0.3)}" cy="${r1(y - r * 0.32)}" r="${r1(r * 0.16)}" fill="#fff"/>`);
    return { sh, body };
  }

  /* ------------------------------------------------------------------ defs */
  function defs(u, t, P, G, full) {
    const pl = G.X(LAY.plate.x);
    let d =
      `<clipPath id="${u}-cl"><path d="${G.D}"/></clipPath>` +
      `<clipPath id="${u}-mc"><path d="${platePath(pl, LAY.plate.y, LAY.plate.w, LAY.plate.h)}"/></clipPath>` +
      `<linearGradient id="${u}-pl" x1="0" y1="0" x2="1" y2=".32"><stop offset="0" stop-color="${P.plate[0]}"/><stop offset=".5" stop-color="${P.plate[1]}"/><stop offset="1" stop-color="${P.plate[2]}"/></linearGradient>` +
      (t === "LEGEND"
        ? `<linearGradient id="${u}-rim" x1="0" y1="0" x2="1" y2=".4">${stops([[0, "#ffffff"], [0.22, "#b7bfc8"], [0.42, "#f1f4f6"], [0.66, "#8b95a0"], [0.85, "#dfe4e8"], [1, "#a7b0ba"]])}</linearGradient>`
        : `<linearGradient id="${u}-rim" x1="0" y1="0" x2="1" y2=".5"><stop offset="0" stop-color="#fbf8f1"/><stop offset=".55" stop-color="${RIM}"/><stop offset="1" stop-color="#d8cfbc"/></linearGradient>`) +
      `<radialGradient id="${u}-nub" cx=".36" cy=".32" r=".72"><stop offset="0" stop-color="${P.stud[0]}"/><stop offset=".6" stop-color="${P.stud[1]}"/><stop offset="1" stop-color="${mix(P.stud[1], P.stud[2], 0.5)}"/></radialGradient>` +
      `<linearGradient id="${u}-cone" x1=".1" y1=".05" x2=".85" y2=".95"><stop offset="0" stop-color="${mix(P.stud[0], P.stud[1], 0.35)}"/><stop offset=".55" stop-color="${P.stud[1]}"/><stop offset="1" stop-color="${P.stud[2]}"/></linearGradient>` +
      `<radialGradient id="${u}-top" cx=".38" cy=".34" r=".8"><stop offset="0" stop-color="${mix(P.stud[0], P.stud[1], 0.25)}"/><stop offset="1" stop-color="${mix(P.stud[0], P.stud[1], 0.7)}"/></radialGradient>` +
      `<linearGradient id="${u}-chv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(P.stud[0], "#ffffff", 0.15)}"/><stop offset="1" stop-color="${mix(P.stud[0], P.stud[1], 0.4)}"/></linearGradient>` +
      `<linearGradient id="${u}-steel" x1="0" y1="0" x2="1" y2="1">${stops(STEEL)}</linearGradient>` +
      `<radialGradient id="${u}-face" cx=".4" cy=".36" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#d3d9df"/><stop offset="1" stop-color="#8f99a5"/></radialGradient>` +
      `<radialGradient id="${u}-boss" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#8a939e"/><stop offset=".7" stop-color="#3c434c"/><stop offset="1" stop-color="#1c2026"/></radialGradient>` +
      `<linearGradient id="${u}-br" x1="0" y1="0" x2="1" y2="1">${stops(BRASS)}</linearGradient>` +
      `<radialGradient id="${u}-med" cx="${G.ar ? 0.3 : 0.7}" cy="0" r="1.1"><stop offset="0" stop-color="${P.med[0]}"/><stop offset="1" stop-color="${P.med[1]}"/></radialGradient>` +
      `<linearGradient id="${u}-ov" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${mix(P.ink, "#ffffff", 0.2)}"/><stop offset="1" stop-color="${mix(P.ink, P.plate[1], 0.1)}"/></linearGradient>` +
      // a specular that follows the plate's curvature: bright on the upper-left edge, gone by the middle
      `<linearGradient id="${u}-sp" x1="0" y1="0" x2="1" y2=".7"><stop offset="0" stop-color="#fff" stop-opacity="${P.gloss}"/><stop offset=".42" stop-color="#fff" stop-opacity="${r2(P.gloss * 0.3)}"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    if (t === "CHAMPION") {
      // 2/2 twill: each 2.6-unit cell is a tow running across or along; the step makes the diagonal
      let cells = "";
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const across = (c + r) % 4 < 2;
          cells += `<rect x="${c * 2.6}" y="${r * 2.6}" width="2.6" height="2.6" fill="url(#${u}-${across ? "th" : "tv"})"/>`;
        }
      d +=
        `<linearGradient id="${u}-th" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121418"/><stop offset=".5" stop-color="#3b414b"/><stop offset="1" stop-color="#121418"/></linearGradient>` +
        `<linearGradient id="${u}-tv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0c0d10"/><stop offset=".5" stop-color="#262a31"/><stop offset="1" stop-color="#0c0d10"/></linearGradient>` +
        `<pattern id="${u}-tw" width="10.4" height="10.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">${cells}</pattern>`;
    }
    if (t === "LEGEND") {
      d +=
        `<linearGradient id="${u}-wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b949e"/><stop offset=".35" stop-color="#d9dee3"/><stop offset=".6" stop-color="#6f7984"/><stop offset="1" stop-color="#b9c1c9"/></linearGradient>` +
        `<pattern id="${u}-brush" width="40" height="1.3" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><rect width="40" height=".45" fill="#fff" opacity=".32"/><rect y=".8" width="40" height=".3" fill="#2a3138" opacity=".18"/></pattern>`;
    }
    if (t === "PRO" || t === "CHAMPION") {
      // moulded traction texture: fine ribs at 1.6-unit pitch, outside the type zones
      d += `<pattern id="${u}-mt" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(52)"><rect width="1.6" height=".62" fill="${t === "PRO" ? "#001a66" : "#000"}" opacity="${t === "PRO" ? 0.5 : 0.55}"/></pattern>`;
    }
    if (full) {
      const cis = ' color-interpolation-filters="sRGB"';
      const X = G.X;
      d +=
        // rubber / TPU grain: light and dark specks from one noise field
        `<filter id="${u}-gr" x="0" y="0" width="1" height="1"${cis}><feTurbulence type="fractalNoise" baseFrequency="1.05" numOctaves="2" seed="5" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -1.62" result="w"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.3" result="k"/>` +
        `<feMerge><feMergeNode in="k"/><feMergeNode in="w"/></feMerge></filter>` +
        // moulded type: lit from the top-left, a soft drop to the bottom-right
        `<filter id="${u}-md" x="-8%" y="-25%" width="116%" height="150%"${cis}><feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="b"/>` +
        `<feDiffuseLighting in="b" surfaceScale="2" diffuseConstant="1.3" lighting-color="#fff" result="d"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting>` +
        `<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1" result="lit"/>` +
        `<feSpecularLighting in="b" surfaceScale="2" specularConstant=".55" specularExponent="18" lighting-color="#fff" result="s"><feDistantLight azimuth="225" elevation="50"/></feSpecularLighting>` +
        `<feComposite in="s" in2="SourceAlpha" operator="in" result="si"/>` +
        `<feOffset in="SourceAlpha" dx=".8" dy="1.5" result="o"/><feGaussianBlur in="o" stdDeviation=".8" result="ob"/>` +
        `<feFlood flood-color="#000" flood-opacity=".5"/><feComposite in2="ob" operator="in" result="sh"/>` +
        `<feMerge><feMergeNode in="sh"/><feMergeNode in="lit"/><feMergeNode in="si"/></feMerge></filter>` +
        `<filter id="${u}-bl" x="-5%" y="-5%" width="110%" height="110%"${cis}><feGaussianBlur stdDeviation="5"/></filter>` +
        `<filter id="${u}-sb" x="-5%" y="-5%" width="110%" height="110%"${cis}><feGaussianBlur stdDeviation="2"/></filter>` +
        `<filter id="${u}-s1" x="-5%" y="-5%" width="110%" height="110%"${cis}><feGaussianBlur stdDeviation="1.6"/></filter>` +
        // mould parting line, 15 units inside the edge
        `<mask id="${u}-pm" maskUnits="userSpaceOnUse" x="-10" y="-20" width="280" height="690"><path d="${G.D}" fill="none" stroke="#fff" stroke-width="31.2"/><path d="${G.D}" fill="none" stroke="#000" stroke-width="29.6"/></mask>` +
        // LEGEND: the refraction line of a thick clear plate, 1.2 units wide, inset from the darkened edge
        `<mask id="${u}-rf" maskUnits="userSpaceOnUse" x="-10" y="-20" width="280" height="690"><path d="${G.D}" fill="none" stroke="#fff" stroke-width="23.4"/><path d="${G.D}" fill="none" stroke="#000" stroke-width="21"/></mask>` +
        // texture zones: the plate outside the type
        `<filter id="${u}-zf" x="-10%" y="-10%" width="120%" height="120%"${cis}><feGaussianBlur stdDeviation="3"/></filter>` +
        `<mask id="${u}-tz" maskUnits="userSpaceOnUse" x="-10" y="-20" width="280" height="690"><path d="${G.D}" fill="#fff"/><g fill="#000" filter="url(#${u}-zf)">` +
        `<circle cx="${X(LAY.wheel.x)}" cy="${LAY.wheel.y}" r="44"/>` +
        `<rect x="${r1(X(134) - 44)}" y="140" width="88" height="40" rx="10"/>` +
        `<rect x="${r1(X(LAY.plate.x) - 58)}" y="206" width="116" height="92" rx="16"/>` +
        `<rect x="0" y="300" width="260" height="128" rx="18"/>` +
        `<rect x="${r1(X(LAY.ovr.x) - 70)}" y="486" width="140" height="86" rx="18"/>` +
        `<rect x="${r1(X(98) - 44)}" y="592" width="88" height="40" rx="12"/>` +
        `</g></mask>`;
    }
    return `<defs>${d}</defs>`;
  }

  /* The shank plate: a horizontal TPU stiffener, a rounded rectangle whose long edges dip
     slightly toward the middle, as a moulded plate across the narrowest part of the sole. */
  function platePath(cx, cy, w, h) {
    const a = w / 2, b = h / 2, r = 15, dip = 5;
    const L = cx - a, R = cx + a, T = cy - b, B = cy + b;
    return (
      `M${r1(L + r)} ${T}Q${cx} ${T + dip} ${r1(R - r)} ${T}Q${R} ${T} ${R} ${T + r}` +
      `V${B - r}Q${R} ${B} ${r1(R - r)} ${B}Q${cx} ${B - dip} ${r1(L + r)} ${B}Q${L} ${B} ${L} ${B - r}V${T + r}Q${L} ${T} ${r1(L + r)} ${T}Z`
    );
  }

  /* ------------------------------------------------------------------ the full sole */
  function wheelDisc(u, P, G, founder, full) {
    const { y, r } = LAY.wheel;
    const x = G.X(LAY.wheel.x);
    let s = `<circle cx="${x}" cy="${y}" r="${r + 2.6}" fill="${P.recess}" opacity="${founder ? 1 : 0.3}"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${founder ? `url(#${u}-br)` : P.wheel}"/>`;
    const ink = founder ? "#5d4812" : P.ink;
    if (full && founder) {
      // knurled edge of the pressed brass insert (a non-founder wheel is moulded flat, no knurl)
      let k = "";
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        k += `M${r1(x + Math.cos(a) * (r - 2))} ${r1(y + Math.sin(a) * (r - 2))}L${r1(x + Math.cos(a) * (r - 0.3))} ${r1(y + Math.sin(a) * (r - 0.3))}`;
      }
      s += `<path d="${k}" stroke="${ink}" stroke-width=".55" opacity=".55"/>`;
    }
    // twelve month ticks; the arrow points at the sample month (June)
    let tk = "";
    for (let m = 1; m <= 12; m++) {
      const a = ((m * 30 - 90) * Math.PI) / 180;
      const r0 = r * 0.66, rr = r * (m === 6 ? 0.88 : 0.82);
      tk += `M${r1(x + Math.cos(a) * r0)} ${r1(y + Math.sin(a) * r0)}L${r1(x + Math.cos(a) * rr)} ${r1(y + Math.sin(a) * rr)}`;
    }
    s += `<path d="${tk}" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" opacity="${founder ? 0.85 : 0.35}"/>`;
    s += `<path d="M${x} ${r1(y - r * 0.5)}V${r1(y + r * 0.34)}" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" opacity="${founder ? 1 : 0.7}"/>`;
    s += `<path d="M${r1(x - 4.2)} ${r1(y + r * 0.3)}L${x} ${r1(y + r * 0.58)}L${r1(x + 4.2)} ${r1(y + r * 0.3)}Z" fill="${ink}" opacity="${founder ? 1 : 0.7}"/>`;
    if (founder && full) s += `<ellipse cx="${x - 7}" cy="${y - 9}" rx="8.5" ry="3.8" transform="rotate(-38 ${x - 7} ${y - 9})" fill="#fff" opacity=".5"/>`;
    return s;
  }

  /* The shank plate carries the manager: the shared figure seen from behind (back of the head,
     ears, collar, the bench jacket's yoke seam), standing against the floodlit plate, offset
     toward the outer edge and cut across the back by the plate's lower edge. It is raised: a
     cast shadow, a lit rim on its upper-left edge, a dark edge at the lower-right. (With the
     hood up the figure reads as a dome at this size; the kit's bare-head option reads as a person.) */
  function shankPlate(u, P, G, full, thumb) {
    const { y, w, h } = LAY.plate;
    const x = G.X(LAY.plate.x);
    const dm = platePath(x, y, w, h);
    const A = MC.AVATAR;
    const k = 0.42;
    const aw = 200 * k, ah = 240 * k;
    const sg = G.ar ? -1 : 1;
    const off = 21 * sg; // toward the lateral edge: the outer shoulder runs off the plate
    const box = { x: r1(x + off - aw / 2), y: r1(y - h / 2 + 5 - 38 * k), w: r1(aw), h: r1(ah) };
    const F = P.figure;
    const fig = (col, dx, dy, extra = "", rim = "none", collar = col) =>
      `<g transform="translate(${dx} ${dy})"${extra}>${MC.avatar({ ...box, hood: false, torso: col, seam: false, collar, neck: col, skin: col, hair: col, rim, preserve: "xMidYMin meet" })}</g>`;
    let s = "";
    // the plate stands up from the sole: a cast shadow and a short side wall
    s += `<path d="${dm}" fill="#000" opacity=".3" transform="translate(1.6 2.6)"${full && !thumb ? ` filter="url(#${u}-s1)"` : ""}/>`;
    s += `<path d="${dm}" fill="${P.recess}" transform="translate(.7 1.2)"/>`;
    s += `<path d="${dm}" fill="url(#${u}-med)"/>`;
    s += `<g clip-path="url(#${u}-mc)">`;
    if (full && !thumb) {
      s += fig("#000", 2, 3, ` opacity=".4" filter="url(#${u}-s1)"`);
      s += fig(F[2], 0.9, 1.2);
      s += fig(F[0], 0, 0, "", F[1], F[3]);
      // the yoke seam across the jacket's back, stitched
      s += `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${A.viewBox}" preserveAspectRatio="xMidYMin meet" aria-hidden="true"><path d="${A.seam}" fill="none" stroke="${F[1]}" stroke-width="3" stroke-dasharray="7 6" opacity=".7"/></svg>`;
    } else {
      s += fig(F[0], 0, 0, "", F[1], F[3]);
    }
    s += `</g>`;
    // the plate's moulded lip: lit top-left, dark bottom-right
    s += `<path d="${dm}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.1" transform="translate(-.5 -.6)" clip-path="url(#${u}-mc)"/>`;
    s += `<path d="${dm}" fill="none" stroke="${P.recess}" stroke-width=".9"/>`;
    return s;
  }

  /** A tapered spindle along the sole's centre line: outline, and its two crown lines. */
  function spindle(G, y0, y1, hw) {
    const L = [], R = [], cl = [], cr = [];
    for (let i = 0; i <= 16; i++) {
      const y = y0 + ((y1 - y0) * i) / 16;
      const w = hw * (0.62 + 0.38 * Math.sin((Math.PI * i) / 16));
      const m = midX(y) - 1;
      L.push([m - w, y]);
      R.push([m + w, y]);
      if (i >= 2 && i <= 14) {
        cl.push([m - w * 0.55, y]);
        cr.push([m + w * 0.55, y]);
      }
    }
    const pts = L.concat(R.reverse());
    return { d: polyD(pts, G.map) + "Z", l: polyD(cl, G.map), r: polyD(cr, G.map) };
  }

  /* LEGEND's machined chassis: brushed steel under the clear plate (spine, heel cup, stud bosses). */
  function chassis(u, G, full) {
    const X = G.X;
    const sp = spindle(G, 150, 470, 24);
    // struts from the spine's ends out to each stud boss: a machined skeleton
    const a = [midX(166), 166], b = [midX(448), 448];
    let struts = "";
    STUDS.LEGEND.forEach((st, i) => {
      const o = i < 2 ? a : b;
      struts += `M${r1(X(o[0]))} ${o[1]}L${r1(X(st.x))} ${st.y}`;
    });
    const bosses = STUDS.LEGEND.map((st) => `<circle cx="${r1(X(st.x))}" cy="${st.y}" r="${st.r + 9}"/>`).join("");
    let s = "";
    s += `<g opacity=".55" transform="translate(2 3.5)"><path d="${struts}" stroke="#16202a" stroke-width="13" stroke-linecap="round" fill="none"/><path d="${sp.d}" fill="#16202a"/><g fill="#16202a">${bosses}</g></g>`;
    s += `<path d="${struts}" stroke="url(#${u}-steel)" stroke-width="11" stroke-linecap="round" fill="none"/>`;
    s += `<path d="${sp.d}" fill="url(#${u}-steel)"/>`;
    s += `<g fill="url(#${u}-steel)">${bosses}</g>`;
    if (full) {
      s += `<g fill="url(#${u}-brush)"><path d="${sp.d}"/>${bosses}</g>`;
      s += `<path d="${struts}" stroke="url(#${u}-brush)" stroke-width="11" stroke-linecap="round" fill="none"/>`;
      s += `<path d="${sp.l}" stroke="#fff" stroke-width="2" opacity=".7" fill="none"/><path d="${sp.r}" stroke="#46505b" stroke-width="2" opacity=".6" fill="none"/>`;
    }
    return s;
  }

  function solid(u, t, P, p, G, full, thumb) {
    const X = G.X;
    const det = full && !thumb;
    let g = "";
    if (t === "LEGEND") {
      // visible thickness: the side wall of the plate, lit from the top-left
      for (let k = 9; k >= 1; k--) g += `<path d="${G.D}" fill="url(#${u}-wall)" stroke="url(#${u}-wall)" stroke-width="12" transform="translate(${r1(k * 0.45)} ${r1(k * 1.05)})"/>`;
      g += `<path d="${G.D}" fill="none" stroke="#3a424b" stroke-width="12.6" transform="translate(4 9.4)"/>`;
    }
    g += `<path d="${G.D}" fill="url(#${u}-pl)"/>`;
    g += `<g clip-path="url(#${u}-cl)">`;
    if (t === "CHAMPION") g += `<rect x="0" y="0" width="260" height="660" fill="url(#${u}-tw)"/>`;
    if (t === "LEGEND") {
      g += chassis(u, G, det);
      // the smoked "ice" plate over the chassis, with the hard reflections of thick clear plastic
      g += `<path d="${G.D}" fill="#9fb8c4" fill-opacity=".45"/>`;
      g += `<path d="M-20 360L280 150L280 182L-20 392Z" fill="#fff" opacity=".13"/><path d="M-20 404L280 194L280 202L-20 412Z" fill="#fff" opacity=".1"/><path d="M-20 600L280 470L280 482L-20 612Z" fill="#fff" opacity=".07"/>`;
    }
    if (det) {
      g += `<rect x="0" y="0" width="260" height="660" filter="url(#${u}-gr)" opacity="${P.grain}"/>`;
      if (P.part) g += `<rect x="0" y="0" width="260" height="660" fill="#fff" opacity="${P.part}" mask="url(#${u}-pm)"/>`;
      if (t === "PRO" || t === "CHAMPION") g += `<rect x="0" y="0" width="260" height="660" fill="url(#${u}-mt)" mask="url(#${u}-tz)"/>`;
      g += `<path d="${G.D}" fill="none" stroke="#000" stroke-opacity="${t === "LEGEND" ? 0.22 : 0.38}" stroke-width="30" filter="url(#${u}-bl)"/>`;
    }
    if (t === "HOMA") g += `<ellipse cx="${X(128)}" cy="490" rx="78" ry="118" fill="#ffd9a3" opacity=".18"/><ellipse cx="${X(136)}" cy="112" rx="54" ry="66" fill="#ffd9a3" opacity=".14"/>`;
    if (t !== "LEGEND") {
      // the raised chassis: a spine through the waist that forks to the heel studs and to the ball,
      // with a lit edge and a shadow edge (the moulded version of LEGEND's steel skeleton)
      const sp = spindle(G, LAY.spine[0], LAY.spine[1], 13);
      const hf = [midX(222), 222], bf = [midX(392), 392];
      const fork = [[hf, Lx(192, 36)], [hf, Rx(192, 36)], [bf, Lx(452, 34)], [bf, Rx(440, 34)]]
        .map(([a, b]) => `M${r1(X(a[0]))} ${a[1]}L${r1(X(b[0]))} ${b[1]}`).join("");
      const ch = (col, extra) => `<g${extra}><path d="${sp.d}" fill="${col}" stroke="${col}" stroke-width="6" stroke-linejoin="round"/><path d="${fork}" stroke="${col}" stroke-width="11" stroke-linecap="round" fill="none"/></g>`;
      if (det) g += ch("#000", ` opacity=".3" transform="translate(1.6 2.4)" filter="url(#${u}-s1)"`);
      g += ch(mix(P.spine, "#000000", 0.45), ` transform="translate(1 1.4)" opacity=".7"`);
      g += ch(mix(P.spine, "#ffffff", 0.3), ` transform="translate(-1 -1)" opacity=".6"`);
      g += ch(P.spine, "");
      if (det && P.gloss > 0.3) {
        // two 3-unit specular edges along the spine's crown (TPU catches the light along its ridges)
        g += `<path d="${sp.l}" stroke="#fff" stroke-opacity="${r2(P.gloss * 0.75)}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        g += `<path d="${sp.r}" stroke="#fff" stroke-opacity="${r2(P.gloss * 0.35)}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      }
      // three transverse flex grooves behind the forefoot studs, along the ball line
      let fg = "", fl = "";
      for (const yy of LAY.grooves) {
        const a = [X(72), yy + 6], b = [X(188), yy - 6];
        fg += `M${r1(a[0])} ${a[1]}L${r1(b[0])} ${b[1]}`;
        fl += `M${r1(a[0])} ${a[1] + 1.4}L${r1(b[0])} ${b[1] + 1.4}`;
      }
      g += `<path d="${fg}" stroke="${mix(P.plate[2], "#000000", 0.45)}" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>`;
      g += `<path d="${fl}" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity="${t === "HOMA" ? 0.35 : 0.28}"/>`;
    }
    // the plate's curvature catching the light along its upper-left edge
    if (full) g += `<path d="${G.D}" fill="none" stroke="url(#${u}-sp)" stroke-width="${thumb ? 18 : 16}"${det ? ` filter="url(#${u}-s1)"` : ""}/>`;
    if (t === "LEGEND") {
      // thick clear plastic darkens at its edge; a refraction line runs just inside it
      g += `<path d="${G.D}" fill="none" stroke="#5d6f7a" stroke-width="15"/>`;
      if (det) g += `<rect x="0" y="0" width="260" height="660" fill="#effdff" opacity=".75" mask="url(#${u}-rf)"/>`;
    }
    g += `</g>`;
    // midsole rim: holds the outline on the dark ground; a darker outer line holds it on the light one
    g += `<path d="${G.D}" fill="none" stroke="${t === "LEGEND" ? "#3a424b" : "#a39a86"}" stroke-width="13.4"/>`;
    g += `<path d="${G.D}" fill="none" stroke="url(#${u}-rim)" stroke-width="11"/>`;
    // the heel counter in the club's colour, keylined in its second colour
    g += `<path d="${G.heel}" fill="none" stroke="${p.club.secondary}" stroke-width="11" stroke-linecap="butt"/>`;
    g += `<path d="${G.heel}" fill="none" stroke="${p.club.primary}" stroke-width="9.4" stroke-linecap="butt"/>`;
    if (det) {
      // within-tier wear indicator: four 2-unit notches moulded inside the lateral rim (empty: no progress data in the sample)
      let w = "";
      for (const yy of [236, 246, 256, 266]) {
        const s = span(yy);
        w += `M${r1(X(s[1] - 1))} ${yy}H${r1(X(s[1] + 1))}`;
      }
      g += `<path d="${w}" stroke="#b9af99" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    if (t === "LEGEND") {
      // the slim machined toe guard: 9 units, standing about 10 past the toe, two screws
      g += `<path d="${G.toe}" fill="#000" opacity=".32" transform="translate(1.5 3)"/>`;
      g += `<path d="${G.toe}" fill="url(#${u}-steel)"/>`;
      if (det) g += `<path d="${G.toe}" fill="url(#${u}-brush)"/>`;
      g += `<path d="${G.toe}" fill="none" stroke="#3d4650" stroke-width=".8"/>`;
      const tm = G.toeMid;
      for (const f of [0.34, 0.66]) {
        const [sx, sy] = G.map(...tm[Math.round(f * (tm.length - 1))]);
        g += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="2.6" fill="url(#${u}-face)" stroke="#3d4650" stroke-width=".6"/><path d="M${r1(sx - 1.5)} ${r1(sy - 0.6)}L${r1(sx + 1.5)} ${r1(sy + 0.6)}" stroke="#3d4650" stroke-width=".7"/>`;
      }
    }
    g += wheelDisc(u, P, G, !!p.founder, det);
    // studs: every cast shadow in one blurred layer, then the bodies
    const parts = STUDS[t].map((s) => stud(u, s, P, X, det));
    g += det
      ? `<g filter="url(#${u}-sb)" opacity=".38">${parts.map((q) => q.sh.join("")).join("")}</g>`
      : `<g opacity=".3">${parts.map((q) => q.sh.join("")).join("")}</g>`;
    g += parts.map((q) => q.body.join("")).join("");
    return g;
  }

  /* ------------------------------------------------------------------ text */
  const CH = { A: 0.64, B: 0.59, C: 0.51, D: 0.65, E: 0.52, F: 0.47, G: 0.57, H: 0.65, I: 0.3, J: 0.39, K: 0.62, L: 0.44, M: 0.81, N: 0.67, O: 0.66, P: 0.59, Q: 0.65, R: 0.62, S: 0.58, T: 0.49, U: 0.63, V: 0.62, W: 0.93, X: 0.63, Y: 0.58, Z: 0.59 };
  const emName = (s, ar) => (ar ? [...s].length * 0.62 : [...s].reduce((a, ch) => a + (CH[ch.toUpperCase()] || 0.6), 0));

  function words(u, p, o, P, G, full, thumb) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const X = G.X;
    const dirA = ar ? ' direction="rtl"' : "";
    const md = full && !thumb ? ` filter="url(#${u}-md)"` : "";
    const name = MC.nameOf(p, o);
    const legend = p.tier === "LEGEND";
    let s = "";
    // the club crest, stamped inside the heel at 12 o'clock (never mirrored)
    const cw = LAY.crest.w;
    s += `<svg x="${r1(X(LAY.crest.x) - cw / 2)}" y="${r1(LAY.crest.y - cw * 0.6)}" width="${cw}" height="${r1(cw * 1.2)}" viewBox="0 0 40 48" aria-hidden="true" opacity=".9">${MC.crest({ mono: P.ink }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
    // wheel year: the arrow splits the two digits, the way moulds print it
    const { y: wy, r: wr } = LAY.wheel;
    const wx = X(LAY.wheel.x);
    const yink = p.founder ? "#4f3d0d" : P.ink;
    s += `<text class="c05-yr" x="${r1(wx - 7.4)}" y="${wy + 4.6}" font-size="13" fill="${yink}" text-anchor="middle">2</text>`;
    s += `<text class="c05-yr" x="${r1(wx + 7.4)}" y="${wy + 4.6}" font-size="13" fill="${yink}" text-anchor="middle">6</text>`;
    if (!thumb) {
      if (p.founder) {
        const R = wr + 11;
        const arc = `M${r1(wx - R)} ${wy}A${R} ${R} 0 0 1 ${r1(wx + R)} ${wy}`;
        s += `<path id="${u}-fa" d="${arc}" fill="none"/>`;
        s += `<text class="c05-fl${ar ? " is-ar" : ""}" font-size="${ar ? 10.5 : 9.5}" fill="${P.ink}"${dirA}${md}><textPath href="#${u}-fa" startOffset="50%" text-anchor="middle">${esc(S.founderLine)}</textPath></text>`;
      }
      // the style code: the BotolaGO ID moulded under the wheel, and the country under it
      s += `<text class="c05-id" x="${wx}" y="${LAY.idY}" font-size="8.4" fill="${P.ink}" text-anchor="middle" direction="ltr" opacity=".92">${esc(p.id)}</text>`;
      s += `<text class="c05-ct${ar ? " is-ar" : ""}" x="${wx}" y="${LAY.ctY}" font-size="${ar ? 9.4 : 8.5}" fill="${P.ink}" text-anchor="middle"${dirA} opacity=".86">${esc(S.country)}</text>`;
    }
    // the name, with the founder year after it in pressed brass (ALI ·26)
    const fy = p.founder ? `·${p.founder % 100}` : "";
    const sp = span(LAY.nameY - 24), sp2 = span(LAY.nameY);
    const avail = Math.min(sp[1] - sp[0], sp2[1] - sp2[0]) - 30;
    const em = emName(name, ar) + (fy ? 0.26 + 0.62 * 1.47 : 0);
    const fs = r1(Math.min(42, avail / em));
    const ny = LAY.nameY - (ar ? 4 : 0) - (fs < 34 ? r1((34 - fs) * 0.25) : 0);
    const nx = X(midX(ny - 12));
    const brass = fy ? `<tspan class="c05-fy" font-size="${r1(fs * 0.62)}" fill="url(#${u}-br)" stroke="#2e2306" stroke-width=".6" paint-order="stroke"${ar ? "" : ' direction="ltr" unicode-bidi="embed"'}>${fy}</tspan>` : "";
    s += `<text class="c05-nm${ar ? " is-ar" : ""}" x="${r1(nx)}" y="${r1(ny)}" fill="${P.ink}" text-anchor="middle"${dirA}${md}><tspan font-size="${fs}">${esc(name)}</tspan>${brass ? " " + brass : ""}</text>`;
    // the tier, as a moulded tag of its own under the name
    const tierTxt = S.tiers[p.tier];
    const tfs = ar ? 12 : 10.5;
    const tw = r1((ar ? [...tierTxt].length * 0.62 * tfs : tierTxt.length * (0.68 + 0.14) * tfs) + 14);
    const th = ar ? 21 : 17;
    const ty = LAY.tagY + (ar ? 7 : 0); // Arabic: a 22-unit gap under the name's descenders
    const tx = X(midX(ty + th / 2));
    if (!thumb) {
    s += `<g class="c05-tag">`;
    s += `<rect x="${r1(tx - tw / 2 + 0.8)}" y="${r1(ty + 1.2)}" width="${tw}" height="${th}" rx="${r1(th / 2)}" fill="#000" opacity=".35"/>`;
    s += `<rect x="${r1(tx - tw / 2)}" y="${ty}" width="${tw}" height="${th}" rx="${r1(th / 2)}" fill="${P.tag}"/>`;
    s += `<rect x="${r1(tx - tw / 2 + 0.6)}" y="${r1(ty + 0.6)}" width="${r1(tw - 1.2)}" height="${r1(th - 1.2)}" rx="${r1(th / 2 - 0.6)}" fill="none" stroke="#fff" stroke-opacity="${legend ? 0.25 : 0.4}" stroke-width=".8" stroke-dasharray="${r1(tw * 0.7)} ${r1(tw * 3)}" stroke-dashoffset="${r1(tw * 0.15)}"/>`;
    s += `<text class="c05-tr${ar ? " is-ar" : ""}" x="${r1(tx + (ar ? 0 : tfs * 0.07))}" y="${r1(ty + th / 2 + tfs * (ar ? 0.36 : 0.36))}" font-size="${tfs}" fill="${legend ? "#ffffff" : P.inkTone}" text-anchor="middle"${dirA}>${esc(tierTxt)}</text>`;
    s += `</g>`;
    }
    if (!thumb) {
      // size row: set like UK / EU / US on a real sole, two pairs per line; CAP sits at the reading start
      const cxs = midX(LAY.sizeY[0]) - 1;
      const cols = [cxs - 42, cxs + 42];
      MC.STATS.forEach((k, i) => {
        const x = X(cols[i % 2]);
        const y = LAY.sizeY[(i / 2) | 0];
        s +=
          `<text x="${r1(x)}" y="${y}" text-anchor="middle" fill="${P.ink}"${dirA}>` +
          `<tspan class="c05-sl${ar ? " is-ar" : ""}" font-size="${ar ? 9 : 7.6}">${esc(S.stats[k])}</tspan> <tspan class="c05-sv" font-size="13" direction="ltr" unicode-bidi="embed">${p.stats[k]}</tspan></text>`;
      });
      const dx = X(cxs);
      s += `<path d="M${r1(dx)} ${LAY.sizeY[0] - 12}V${LAY.sizeY[1] + 3}" stroke="${P.ink}" stroke-width=".8" opacity=".5"/>`;
      s += `<path d="M${r1(X(cxs - 78))} ${LAY.sizeY[0] + 5}H${r1(X(cxs + 78))}" stroke="${P.ink}" stroke-width=".5" opacity=".32"/>`;
    }
    // the 84, moulded proud in the forefoot: a fixed two-digit slot, centred; a side wall, a lit edge, a recess line
    const ovr = String(p.ovr);
    const ofs = ovr.length > 2 ? 68 : LAY.ovr.fs;
    const ox = r1(X(LAY.ovr.x)), oy = LAY.ovr.y;
    const ot = (dx, dy, fill, extra = "") => `<text class="c05-ov" x="${r1(ox + dx)}" y="${r1(oy + dy)}" font-size="${ofs}" fill="${fill}" text-anchor="middle" direction="ltr"${extra}>${ovr}</text>`;
    const top = legend ? "#ffffff" : P.ink;
    s += `<g class="c05-84">`;
    s += ot(0, 0, P.recess, ` stroke="${P.recess}" stroke-width="${legend ? 4.4 : 3}" stroke-linejoin="round" opacity="${legend ? 1 : 0.85}"`);
    if (!thumb) for (let i = 3; i >= 1; i--) s += ot(r1(0.5 * i), r1(0.8 * i), mix(P.side, "#000000", 0.1 * i));
    s += ot(-0.9, -0.9, legend ? "#ffffff" : mix(top, "#ffffff", 0.6));
    s += ot(0, 0, legend ? "#f3f6f8" : `url(#${u}-ov)`);
    s += `</g>`;
    if (!thumb) {
      // mirrored for the left boot and re-drawn left to right, so the year never runs upside down
      const pts = LAY.season.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const q = [[pts[0], pts[1]], [pts[2], pts[3]], [pts[4], pts[5]]].map(([a, b]) => [r1(X(a)), b]);
      if (ar) q.reverse();
      const sp3 = `M${q[0][0]} ${q[0][1]}Q${q[1][0]} ${q[1][1]} ${q[2][0]} ${q[2][1]}`;
      s += `<path id="${u}-se" d="${sp3}" fill="none"/>`;
      s += `<text class="c05-se" font-size="8.4" fill="${P.ink}" direction="ltr" opacity=".9"><textPath href="#${u}-se" startOffset="50%" text-anchor="middle">${esc(p.season)}</textPath></text>`;
    }
    return s;
  }

  function full(p, o = {}) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const t = TIER[p.tier] ? p.tier : "PRO";
    const P = TIER[t];
    const u = MC.uid("c05");
    const thumb = !!o.thumb;
    const G = geo(ar);
    return (
      `<div class="c05 c05-full t-${t.toLowerCase()}${thumb ? " is-thumb" : ""}${o.motion ? " is-motion" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${t}">` +
      `<svg class="c05-svg" viewBox="2 -4 252 662" aria-hidden="true" focusable="false">` +
      defs(u, t, P, G, true) +
      solid(u, t, P, p, G, true, thumb) +
      shankPlate(u, P, G, true, thumb) +
      `<g class="c05-words">${words(u, p, o, P, G, true, thumb)}</g>` +
      `</svg></div>`
    );
  }

  /* ------------------------------------------------------------------ token */
  // The sole laid horizontal, toe at the inline end. Card (x, y) -> token (y - 4, 252 - x).
  // The mini squeezes the waist so the heel and the forefoot carry it.
  const SQ = { a: 200, b: 372, k: 0.5 };
  const sq = (y, mini) => (!mini ? y : y <= SQ.a ? y : y >= SQ.b ? y - (SQ.b - SQ.a) * (1 - SQ.k) : SQ.a + (y - SQ.a) * SQ.k);
  const tok = (x, y, mini) => [sq(y, mini) - 4, 252 - x];
  const TW = (mini) => r1(sq(648, mini) - 4 + 4);
  const TY0 = -14, TH = 280; // token box height in token units (y from -14 to 266)
  const TOK = {};
  function tokGeo(mini) {
    const k = mini ? "m" : "f";
    if (TOK[k]) return TOK[k];
    const m = (x, y) => tok(x, y, mini);
    return (TOK[k] = {
      D: pathOf(m),
      heel: polyD(HEEL, m),
      toe: polyD(TOE.outer, m) + "L" + TOE.inner.slice().reverse().map((p) => m(p[0], p[1]).map(r1).join(" ")).join("L") + "Z",
    });
  }
  // the 84 sits across the ball of the foot, the widest part; stud emblems sit around its box, never under it
  const TSTUD = {
    f: {
      HOMA: null, // a nub field, computed
      STADE: [[96, 52], [176, 52], [96, 178], [176, 178], [60, 388], [60, 548], [196, 392], [196, 538], [92, 598], [150, 596]].map(([x, y]) => ({ t: "cone", x, y, r: 16 })),
      PRO: [
        ...[[60, 404], [56, 476], [66, 548], [198, 406], [200, 476], [190, 546]].map(([x, y]) => ({ t: "chev", x, y, a: tilt(edgeAngle(x, y)) })),
        ...[[100, 182], [172, 182]].map(([x, y]) => ({ t: "round", x, y, r: 19 })),
      ],
      CHAMPION: [[96, 182], [174, 182], [60, 356], [204, 360], [98, 596], [160, 586]].map(([x, y]) => ({ t: "steel", x, y, r: 23 })),
      LEGEND: [[64, 74], [205, 74], [26, 452], [229, 452], [34, 562], [212, 556]].map(([x, y]) => ({ t: "big", x, y, r: 26 })),
    },
    m: {
      HOMA: null,
      STADE: [[96, 60], [176, 60], [58, 588], [150, 600], [64, 340], [194, 340]].map(([x, y]) => ({ t: "cone", x, y, r: 21 })),
      PRO: [
        ...[[62, 588], [192, 560], [70, 332], [190, 334]].map(([x, y]) => ({ t: "chev", x, y, a: tilt(edgeAngle(x, y)) })),
        ...[[134, 178]].map(([x, y]) => ({ t: "round", x, y, r: 24 })),
      ],
      CHAMPION: [[98, 180], [172, 180], [72, 598], [150, 600]].map(([x, y]) => ({ t: "steel", x, y, r: 30 })),
      LEGEND: [[64, 74], [205, 74], [26, 452], [229, 452], [34, 562], [212, 556]].map(([x, y]) => ({ t: "big", x, y, r: 30 })),
    },
  };
  const OVC = { f: { x: 128, y: 470, fs: 136 }, m: { x: 128, y: 466, fs: 176 } };
  // HOMA's even nub field, built once per size
  function nubField(mini) {
    const out = [];
    const p = mini ? 44 : 30, r = mini ? 13 : 10;
    const c = OVC[mini ? "m" : "f"];
    const [ocx, ocy] = tok(c.x, c.y, mini);
    const hw = c.fs * 0.64 + 10, hh = c.fs * 0.34 + 10;
    const [wcx, wcy] = tok(LAY.wheel.x, 104, mini);
    for (let row = 0, y = 26; y < 630; row++, y += p * 0.866) {
      for (let x = 30 + (row % 2 ? p / 2 : 0); x < 232; x += p) {
        if (!insideBy(x, y, r + 12)) continue;
        const [tx, ty] = tok(x, y, mini);
        if (Math.abs(tx - ocx) < hw + r && Math.abs(ty - ocy) < hh + r) continue;
        if (Math.hypot(tx - wcx, ty - wcy) < 36 + r) continue;
        out.push({ t: "nub", x, y, r });
      }
    }
    return out;
  }
  const NUBS = { f: null, m: null };

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const ar = MC.isAr(o);
    const t = TIER[p.tier] ? p.tier : "PRO";
    const P = TIER[t];
    const u = MC.uid("c05t");
    const w = TW(mini);
    const X = (x) => (ar ? w - x : x);
    const K = mini ? "m" : "f";
    const TG = tokGeo(mini);
    const rimW = mini ? 20 : 15;
    const mir = (inner) => (ar ? `<g transform="matrix(-1 0 0 1 ${w} 0)">${inner}</g>` : inner);
    let shape = "";
    // LEGEND's steel side wall, always toward the lower-right (inside the mirror, x flips)
    if (t === "LEGEND") shape += `<path d="${TG.D}" fill="#6f7984" stroke="#6f7984" stroke-width="${rimW}" transform="translate(${ar ? -8 : 8} 9)"/>`;
    shape += `<path d="${TG.D}" fill="url(#${u}-p)"/>`;
    if (t === "CHAMPION") shape += `<path d="${TG.D}" fill="url(#${u}-tw)" opacity=".6"/>`;
    if (t === "LEGEND") shape += `<path d="${TG.D}" fill="#9fb8c4" fill-opacity=".45"/>`;
    shape += `<path d="${TG.D}" fill="none" stroke="${t === "LEGEND" ? "#3a424b" : "#a39a86"}" stroke-width="${rimW + 4}"/>`;
    shape += `<path d="${TG.D}" fill="none" stroke="${t === "LEGEND" ? `url(#${u}-s)` : RIM}" stroke-width="${rimW}"/>`;
    // the heel counter in the club colour (rule 8: visible on the 44px token), keylined
    shape += `<path d="${TG.heel}" fill="none" stroke="${p.club.secondary}" stroke-width="${rimW + 10}" stroke-linecap="round"/>`;
    shape += `<path d="${TG.heel}" fill="none" stroke="${p.club.primary}" stroke-width="${rimW + 2}" stroke-linecap="round"/>`;
    if (t === "LEGEND") shape += `<path d="${TG.toe}" fill="url(#${u}-s)" stroke="#3d4650" stroke-width="${mini ? 4 : 3}"/>`;
    const g = mir(shape);
    // the 84's slot across the ball
    const oc = OVC[K];
    const [ocx0, ocy] = tok(oc.x, oc.y, mini);
    const ocx = X(ocx0);
    // studs: emblems in token space (the light never rotates)
    let list = TSTUD[K][t];
    if (t === "HOMA") list = NUBS[K] || (NUBS[K] = nubField(mini));
    let sh = "", st = "";
    for (const s of list) {
      const [cx0, cy] = tok(s.x, s.y, mini);
      const cx = X(cx0);
      const r = s.r;
      if (s.t === "nub") {
        st += `<circle cx="${r1(cx + 1.6)}" cy="${r1(cy + 2.6)}" r="${r}" fill="${P.stud[2]}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="${P.topTok}"/>`;
      } else if (s.t === "cone" || s.t === "round") {
        sh += `<circle cx="${r1(cx + 4)}" cy="${r1(cy + 6)}" r="${r}"/>`;
        st += `<circle cx="${r1(cx + 2.4)}" cy="${r1(cy + 4)}" r="${r}" fill="${P.stud[2]}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="${P.stud[1]}"/><circle cx="${r1(cx - 1)}" cy="${r1(cy - 1.4)}" r="${r1(r * (s.t === "cone" ? 0.56 : 0.74))}" fill="${P.topTok}"/>`;
      } else if (s.t === "chev") {
        // chevrons follow the edge: the card's angle turned with the sole (and mirrored for the left boot)
        const a = ar ? 180 - (s.a - 90) : s.a - 90;
        const sc = mini ? 2.5 : 2.1;
        const c = (dx, dy, col, sw) => `<path d="${CHEV}" transform="translate(${r1(cx + dx)} ${r1(cy + dy)}) rotate(${a}) scale(${sc})" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
        sh += c(4, 6, "#000", CHW);
        st += c(2.4, 4, P.stud[2], CHW) + c(0, 0, P.stud[1], CHW) + c(-0.6, -1, P.topTok, 7);
      } else {
        const big = s.t === "big";
        sh += `<circle cx="${r1(cx + 4)}" cy="${r1(cy + 6)}" r="${r + 4}"/>`;
        st += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r + (big ? 6 : 4))}" fill="${big ? "#262b31" : P.stud[2]}"/><circle cx="${r1(cx + 2)}" cy="${r1(cy + 3)}" r="${r}" fill="#454d57"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="url(#${u}-s)"/><circle cx="${r1(cx - r * 0.3)}" cy="${r1(cy - r * 0.32)}" r="${r1(r * 0.24)}" fill="#fff"/>`;
      }
    }
    // the founder sign: a filled brass disc in the heel with the date wheel's arrow cut in (no stud is brass)
    const wc = tok(LAY.wheel.x, 104, mini);
    const R = mini ? 33 : 29;
    const fx = r1(X(wc[0])), fy = r1(wc[1]);
    const dir = ar ? -1 : 1; // the arrow points at the toe
    const ring = p.founder
      ? `<circle cx="${r1(fx + 2)}" cy="${r1(fy + 3)}" r="${R + 4}" fill="${P.recess}" opacity=".7"/><circle cx="${fx}" cy="${fy}" r="${R + 3}" fill="${P.recess}"/><circle cx="${fx}" cy="${fy}" r="${R}" fill="url(#${u}-b)"/>` +
        `<path d="M${r1(fx - dir * R * 0.5)} ${fy}H${r1(fx + dir * R * 0.2)}" stroke="#3f300a" stroke-width="${mini ? 9 : 7}" stroke-linecap="round"/>` +
        `<path d="M${r1(fx + dir * R * 0.12)} ${r1(fy - R * 0.42)}L${r1(fx + dir * R * 0.66)} ${fy}L${r1(fx + dir * R * 0.12)} ${r1(fy + R * 0.42)}Z" fill="#3f300a"/>`
      : mini
        ? ""
        : `<circle cx="${fx}" cy="${fy}" r="24" fill="none" stroke="${P.recess}" stroke-width="5" opacity=".55"/>`;
    // the 84, centred in its slot across the ball
    const ovr = String(p.ovr);
    const ofs = ovr.length > 2 ? oc.fs * 0.8 : oc.fs;
    const legend = t === "LEGEND";
    const ovText =
      `<text class="c05-ov" x="${r1(ocx + (mini ? 4 : 3))}" y="${r1(ocy + ofs * 0.32 + (mini ? 6 : 5))}" font-size="${ofs}" text-anchor="middle" fill="${mix(P.side, "#000000", 0.25)}">${ovr}</text>` +
      `<text class="c05-ov" x="${r1(ocx)}" y="${r1(ocy + ofs * 0.32)}" font-size="${ofs}" text-anchor="middle" fill="${legend ? "#ffffff" : P.ink}" stroke="${P.recess}" stroke-width="${mini ? 16 : 12}" paint-order="stroke" stroke-linejoin="round">${ovr}</text>`;
    const vb = `0 ${TY0} ${w} ${TH}`;
    const hpx = size;
    const wpx = r1((w / TH) * size);
    return (
      `<span class="c05 c05-tok t-${t.toLowerCase()}${mini ? " is-mini" : ""}" style="width:${wpx}px;height:${hpx}px" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg viewBox="${vb}" width="${wpx}" height="${hpx}" aria-hidden="true" focusable="false"><defs>` +
      `<linearGradient id="${u}-p" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="${P.plate[0]}"/><stop offset=".55" stop-color="${P.plate[1]}"/><stop offset="1" stop-color="${P.plate[2]}"/></linearGradient>` +
      `<linearGradient id="${u}-s" x1="0" y1="0" x2="1" y2="1">${stops(STEEL)}</linearGradient>` +
      `<linearGradient id="${u}-b" x1="0" y1="0" x2="1" y2="1">${stops(BRASS)}</linearGradient>` +
      (t === "CHAMPION"
        ? `<pattern id="${u}-tw" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#1b1e24"/><rect width="11" height="11" fill="#2e333b"/><rect x="11" y="11" width="11" height="11" fill="#2e333b"/></pattern>`
        : "") +
      `</defs>` +
      g +
      `<g fill="#000" opacity=".3">${sh}</g>` +
      st +
      ring +
      ovText +
      `</svg></span>`
    );
  }

  /* ------------------------------------------------------------------ row */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const t = TIER[p.tier] ? p.tier : "PRO";
    return (
      `<div class="c05 c05-row t-${t.toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}">` +
      `<span class="c05-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c05-rt">${token(p, { ...o, size: 44, mini: false })}</span>` +
      `<span class="c05-rw"><b class="${ar ? "is-ar" : ""}">${esc(MC.nameOf(p, o))}${p.founder ? `<i>${ar ? esc("·" + (p.founder % 100)) : MC.ltr("·" + (p.founder % 100))}</i>` : ""}</b>` +
      `<small><em>${esc(S.tiers[t])}</em> ${MC.ltr(p.ovr + " " + S.ovr)}</small></span>` +
      `<span class="c05-rp">${MC.ltr(o.pts != null ? o.pts : "")}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ share */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const t = TIER[p.tier] ? p.tier : "PRO";
    const u = MC.uid("c05s");
    // the print a sole leaves is its mirror image: the stud marks of this boot, pressed into the turf
    const sc = 0.62;
    const pw = 260 * sc;
    const ox = ar ? 14 : 360 - 14 - pw + 6, oy = 116;
    const prMap = (x, y) => [r1(ox + (ar ? x : MIRROR - x) * sc), r1(oy + y * sc)];
    const pit = "#010a05", lip = "#9ccfa8";
    const marks = STUDS[t]
      .map((s) => {
        const [x, y] = prMap(s.x, s.y);
        if (s.t === "chev") {
          const a = ar ? s.a : 180 - s.a;
          const c = (col, sw, dx = 0, dy = 0, op = 1) => `<path d="${CHEV}" transform="translate(${r1(x + dx)} ${r1(y + dy)}) rotate(${a}) scale(${sc})" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
          // torn turf flecks thrown off the blade ends
          const ends = [[-9.7, -15.4], [-9.7, 15.4]].map(([ex, ey]) => {
            const rad = (a * Math.PI) / 180;
            const px = x + (ex * Math.cos(rad) - ey * Math.sin(rad)) * sc, py = y + (ex * Math.sin(rad) + ey * Math.cos(rad)) * sc;
            return `<circle cx="${r1(px - 2.4)}" cy="${r1(py + 1.2)}" r="1.1" fill="${lip}"/><circle cx="${r1(px + 1.8)}" cy="${r1(py - 2.6)}" r=".8" fill="#5f9c70"/><path d="M${r1(px)} ${r1(py)}l-3.4 2.2" stroke="#6fae80" stroke-width=".9" stroke-linecap="round"/>`;
          });
          return c(lip, 12.5, -0.6, -0.8) + c(pit, 9.5, 0, 0, 0.9) + ends.join("");
        }
        const r = r1((s.t === "big" ? s.r : s.r || 7) * sc);
        return (
          `<circle cx="${r1(x - 0.5)}" cy="${r1(y - 0.7)}" r="${r1(r + 1.6)}" fill="${lip}"/>` +
          `<circle cx="${x}" cy="${y}" r="${r}" fill="${pit}" opacity=".9"/>` +
          (s.t === "nub" ? "" : `<circle cx="${r1(x + r + 1.6)}" cy="${r1(y + 1)}" r=".9" fill="${lip}"/><circle cx="${r1(x - r)}" cy="${r1(y + r + 1.2)}" r=".7" fill="#6fae80"/>`)
        );
      })
      .join("");
    // grass pressed flat where the plate stood: a faint sheen and a crushed edge
    const outline = `<path d="${pathOf((x, y) => prMap(x, y))}" fill="#4f8f63" fill-opacity=".26" stroke="${lip}" stroke-opacity=".6" stroke-width="2.2" stroke-dasharray="2.5 3"/>`;
    const name = MC.nameOf(p, o);
    // a chalk touchline in perspective across the lower third
    const tl = ar ? "M360 540L0 470" : "M0 540L360 470";
    return (
      `<div class="c05 c05-share t-${t.toLowerCase()}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg class="c05-sh-bg" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>` +
      `<filter id="${u}-g" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".55 1.9" numOctaves="3" seed="11" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .86  0 0 0 0 .55  2.4 0 0 0 -1.15"/></filter>` +
      `<filter id="${u}-ch" x="-2%" y="-20%" width="104%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="3" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.62" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>` +
      `<radialGradient id="${u}-fl" cx="${ar ? 0.15 : 0.85}" cy="0" r="1.05"><stop offset="0" stop-color="#e9f3ff" stop-opacity=".34"/><stop offset=".45" stop-color="#9fd0ff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${u}-vg" cx=".5" cy=".45" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".66"/></radialGradient>` +
      `<filter id="${u}-pb" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".35"/></filter>` +
      `</defs>` +
      `<rect width="360" height="640" fill="#0a2416"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect y="${i * 80}" width="360" height="40" fill="#0d2c1b"/>`).join("") +
      `<rect width="360" height="640" filter="url(#${u}-g)" opacity=".38"/>` +
      `<path d="${tl}" stroke="#eef3ea" stroke-width="5.5" opacity=".92" filter="url(#${u}-ch)"/>` +
      `<rect width="360" height="640" filter="url(#${u}-g)" opacity=".2" style="mix-blend-mode:multiply"/>` +
      `<g filter="url(#${u}-pb)">${outline}${marks}</g>` +
      `<rect width="360" height="640" fill="url(#${u}-fl)"/>` +
      `<rect width="360" height="640" fill="url(#${u}-vg)"/>` +
      `</svg>` +
      `<div class="c05-sh-logo">${MC.logo("wordmark", { variant: "light" })}</div>` +
      `<div class="c05-sh-card">${full(p, { ...o, motion: false })}</div>` +
      `<div class="c05-sh-cap"><b class="${ar ? "is-ar" : ""}">${esc(name)}${p.founder ? `<i>${ar ? esc("·" + (p.founder % 100)) : MC.ltr("·" + (p.founder % 100))}</i>` : ""}</b>` +
      `<span><em>${esc(S.tiers[t])}</em> ${MC.ltr(p.season)}</span></div>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ tilt (detail only) */
  function mount(el) {
    if (!el || el.__c05 || !el.classList || !el.classList.contains("c05-full")) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.__c05 = true;
    el.classList.add("is-live");
    const set = (rx, ry) => {
      el.style.setProperty("--c05-rx", rx + "deg");
      el.style.setProperty("--c05-ry", ry + "deg");
    };
    el.addEventListener("pointermove", (e) => {
      const b = el.getBoundingClientRect();
      const nx = (e.clientX - b.left) / b.width - 0.5;
      const ny = (e.clientY - b.top) / b.height - 0.5;
      set(r1(-ny * 14), r1(nx * 18));
    });
    el.addEventListener("pointerleave", () => set(0, 0));
  }

  MC.register({
    id: "c05",
    n: 5,
    name: "Semelle",
    nameAr: "النعل",
    category: "bold",
    philosophy: "Your BotolaGO identity is the underside of your boot: the stud pattern is your tier, and the 84 is moulded where a maker moulds the size.",
    philosophyAr: "هويتك في BotolaGO هي نعل حذائك: نمط المسامير يدل على مستواك، والرقم 84 مصبوب حيث يصب الصانع المقاس.",
    gridWidth: 170,
    detailWidth: 260,
    idea: [
      "The card is a boot outsole, studs up, heel at the top, traced from a real firm-ground plate: a short egg-shaped heel, an almost straight outer edge, a deep concave arch on the big-toe side, the ball as the widest line, and a toe that tapers to an off-centre tip. It is the only object in the set whose silhouette is a part of the game itself; nothing in FUT, Sorare or the Codex exploration is shaped like it.",
      "Every element sits where a boot maker would put it. The BotolaGO ID is the moulded style code in the heel, with the country under it. The four decisions are the size row ('CAP 91 | SEL 82', two pairs per line, like UK / EU / US on a real sole). The 84 is moulded proud in the forefoot, where the size is. The season follows the toe as a second production mark. The club is the heel counter, the part of the rim that wraps the heel, in the club's own colours with its crest stamped inside.",
      "The manager sits on the shank plate, the TPU stiffener across the waist: the shared figure seen from behind (back of the head, collar, the bench jacket's stitched yoke seam), raised and rim-lit against a floodlit plate, offset toward the outer edge and cut across the back by the plate's lower edge. A moulded chassis runs through the waist and forks to the heel studs and to the ball, and three flex grooves cross the ball line.",
      "The tier is the stud pattern, which every five-a-side player in Morocco has lived: turf trainers on the terrain de proximité, moulded cones on artificial grass, firm-ground chevron blades, then screw-in steel for real grass. Every stud stands up from the plate with its own side wall and cast shadow, and the ladder reads in black and white, by stud count and size, before colour.",
    ],
    belonging: [
      "Boots are the most coveted object in a young player's football life; nobody needs the ladder explained. 'Mine has steel now' is a sentence a 15-year-old already says about boots.",
      "Comparing two soles is instant and physical: dense nubs against six steel studs. Friends compare stud patterns the way they compare boots in the changing room.",
      "Latin cards are a right boot and Arabic cards a left boot, so two friends in different app languages hold a pair. That small fact is the kind of detail people find and share.",
      "The share image stages the sole on a night pitch beside the print it left in the turf, stud by stud: 'my mark', a picture worth posting rather than a card on a flat colour.",
    ],
    founderMark: [
      "Every moulded part carries an injection date wheel: twelve ticks, an arrow at the month, the year split by the arrow. Every manager's sole has one (the month the account was created; ALI's June arrow is sample data).",
      "Founder soles have the wheel as a pressed brass insert with a knurled edge, the only precious material in the whole concept, with FOUNDER 2026 moulded round it, large enough to read at arm's length. The written form follows the name in the same brass: 'ALI ·26', the way Moroccan supporter groups carry their founding year.",
      "It changes the object, not a label on it: a non-founder sole has the same wheel moulded flat in its own plate material, without the knurl. On the token the founder sign is a filled brass disc in the heel with the wheel's arrow cut into it, at least 5px across at 24px; no stud is ever brass, so it cannot be mistaken for one.",
    ],
    small: [
      "44–80px: the sole lies horizontal, toe at the inline end, with the 84 large across the ball and the tier's studs set round it as emblems, never under it: an even nub field, eight grey cones, three pale chevrons on each edge, six bright steel studs, or six big steel studs that break the edge. The heel counter carries the club colour and the heel carries the brass founder disc.",
      "24–32px: the waist is squeezed so the heel and the forefoot carry the token at about 1.8:1, with fewer, larger studs (four steel studs for CHAMPION, two chevrons a side for PRO) and the 84 at about 40% of the height. It fits a ranking row's name cell at about 44–50px wide.",
      "As a solid shape the outline is a sole, heel to toe, with the arch cut on one side; LEGEND adds steel bumps on both edges and a toe guard.",
    ],
    rtl: [
      "Arabic cards show the LEFT boot: the outline, the studs and the shank plate are drawn mirrored, on purpose, so the two languages make a pair. The light is not mirrored: it still comes from the top-left. Text never mirrors: علي is set in Changa 800, the stat labels in Noto Sans Arabic with no letter-spacing, and the size row starts with القائد on the right.",
      "Digits stay left to right: the 84, BOT #004821, the stat values and 2026/27 are LTR runs; the founder form reads علي ·26 with the year after the name in reading order. In the token the toe points left, to the inline end.",
    ],
    tiers: {
      HOMA: "Turf trainer. New, honest gum rubber (clean amber, not worn), with a dense field of small round nubs that each stand up from the plate, and a crisp mould parting line. Full outline, raw but new.",
      STADE: "Artificial-grass sole. Matte black rubber with fine grain, conical studs with flat grey tops and real height, and a sharp mould line inside the edge.",
      PRO: "Firm-ground TPU plate in Logo Blue: four round heel studs and six fat chevron blades along the forefoot edge, staggered, each standing up with its side wall and cast shadow; a forked moulded chassis with two specular edges, flex grooves across the ball, a fine moulded traction texture outside the type, and white moulded type.",
      CHAMPION: "Soft-ground hybrid. A carbon 2/2 twill plate under clear coat, six screw-in polished steel studs on moulded bosses and four dark chevron blades.",
      LEGEND: "A smoked clear 'ice' plate over a machined steel chassis you can see through it, with a darkened edge and a refraction line like thick clear plastic. Six large mirror-steel studs set into the edge so they break the outline, and a slim machined toe guard with two screws that lengthens the toe.",
    },
    legend: [
      "LEGEND is the only tier whose black-and-white outline changes: six steel studs stand proud of both edges and a slim machined toe guard lengthens the toe, so a LEGEND is identifiable as a solid shape at 32px.",
      "It is the fewest, heaviest elements: a clear smoked plate with real thickness (a steel side wall), the brushed chassis visible underneath, mirror-polished studs with lathe rings and a specular crescent. Steel and clear plastic, not gold; the only warm metal is the founder's brass. The stats stay on the front.",
    ],
    advantages: [
      "The most ownable silhouette in the slate: a sole is recognisable before anything is read, and no card game, fintech card or Codex concept uses it.",
      "The tier ladder is real-world knowledge, not a colour code: nubs, cones, blades, steel. It reads in monochrome and at token size by stud count and shape.",
      "Every data item has a physical carrier native to the object (style code, size row, date wheel, toe mark, heel counter, shank plate), so nothing floats in a corner.",
      "Right/left boot for Latin/Arabic turns right-to-left mirroring into a story instead of a constraint.",
    ],
    risks: [
      "A boot belongs to a player more than to a manager. The concept argues that every manager played first; some users may still read it as a player card.",
      "The token is wide (about 2.3:1) and the mini about 1.8:1, so it needs a wide slot; in a square avatar circle it does not work at all.",
      "Out of context a sole can read as a footprint, a fitness or hiking icon. The studs, the heel counter and the 84 do the work; without them it is generic.",
      "Stud geometry must stay generic: chevrons, cones and round studs only. Any resemblance to a brand's signature plate would be a legal and credibility problem.",
      "At 24px the tiers are told apart by stud shape and plate together; HOMA's nub field becomes a texture rather than countable studs.",
      "Mirroring the boot for Arabic may confuse people who compare cards across languages; it needs one line of explanation in the product.",
      "The shank plate shows the shared figure with the kit's bare-head option: with the hood up it read as a dome, an arch or a bell at this size. A head-and-shoulders figure in a rounded window can still read as an ID-photo slot; the floodlit plate, the rim light and the off-centre crop are what keep it a manager at the touchline.",
    ],
    full,
    token,
    row,
    share,
    mount,
  });
})();
