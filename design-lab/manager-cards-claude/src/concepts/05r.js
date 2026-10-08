/* 05 SEMELLE (bold). The manager's identity is the underside of a boot, seen studs up:
   a moulded plate that carries the 84 where a maker moulds the size, the BotolaGO ID as
   the style code, the four decisions as the size row, and the injection-moulding date
   wheel every moulded part carries. The tier is the stud pattern: turf nubs, artificial-
   grass cones, firm-ground blades, screw-in steel, then six machined steel studs that
   break the outline. Latin cards are a RIGHT boot; Arabic cards are the LEFT boot. */
(function () {
  const MC = window.MC;
  const esc = (s) => MC.esc(s);
  const r1 = (n) => Math.round(n * 10) / 10;

  /* ------------------------------------------------------------------ geometry */
  // The right outsole, heel at the top, toe at the bottom, in a 260-wide frame.
  // Forefoot 226 wide, heel 154 (68%), waist 128 (57%), big-toe bulge on the left.
  const MIRROR = 260; // x -> 260 - x gives the left boot
  const START = [136, 14];
  const SEGS = [
    [176, 14, 212, 40, 214, 100],
    [216, 160, 210, 230, 212, 300],
    [214, 370, 240, 410, 242, 470],
    [244, 530, 220, 580, 180, 606],
    [150, 624, 100, 628, 70, 616],
    [34, 600, 16, 556, 16, 500],
    [16, 440, 30, 400, 60, 360],
    [84, 328, 88, 290, 82, 250],
    [76, 200, 58, 160, 60, 100],
    [62, 40, 96, 14, 136, 14],
  ];
  const pathOf = (map) => {
    const m = (x, y) => map(x, y).map(r1).join(" ");
    return "M" + m(START[0], START[1]) + SEGS.map((s) => "C" + m(s[0], s[1]) + " " + m(s[2], s[3]) + " " + m(s[4], s[5])).join("") + "Z";
  };
  const D_SOLE = pathOf((x, y) => [x, y]);
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
  /** [left, right] x of the outline at height y. */
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

  /* Fixed layout (Latin coordinates; the left boot mirrors x). */
  const LAY = {
    wheel: { x: 137, y: 92, r: 23 },
    founderY: 140,
    idY: 156,
    med: { x: 148, y: 262, w: 72, h: 102 },
    countryX: 197,
    nameY: 366,
    sizeY: [393, 411],
    ovrY: 538,
    ovrX: 129,
    tab: "M121 24V-2Q121 -9 128 -9H146Q153 -9 153 -2V24Z",
  };
  // the toe curve the season is moulded along
  const SEASON_PATH = (ar) => (ar ? "M90 590Q130 620 172 592" : "M88 592Q130 620 170 590");
  // the shank plate: a squared oval, the way boot makers frame the midfoot plate
  const lens = (cx, cy, w, h) => {
    const a = w / 2, b = h / 2, k = 0.66;
    return (
      `M${cx} ${cy - b}C${r1(cx + a * k)} ${cy - b} ${cx + a} ${r1(cy - b * k)} ${cx + a} ${cy}` +
      `C${cx + a} ${r1(cy + b * k)} ${r1(cx + a * k)} ${cy + b} ${cx} ${cy + b}` +
      `C${r1(cx - a * k)} ${cy + b} ${cx - a} ${r1(cy + b * k)} ${cx - a} ${cy}` +
      `C${cx - a} ${r1(cy - b * k)} ${r1(cx - a * k)} ${cy - b} ${cx} ${cy - b}Z`
    );
  };

  /* ------------------------------------------------------------------ studs per tier */
  // t: nub | cone | round | blade | chev | steel | big.  dir: apex direction of a chevron.
  const ZONES = [
    [104, 54, 170, 162], // date wheel, founder line, ID
    [104, 196, 192, 330], // medallion
    [186, 224, 208, 302], // country
    [0, 334, 260, 420], // name + size row
    [62, 470, 196, 548], // the 84
    [70, 588, 190, 640], // season
  ];
  const STUDS = {
    HOMA: (() => {
      const out = [];
      const p = 20.5, rr = 5.3;
      for (let row = 0, y = 26; y < 626; row++, y += p * 0.866) {
        for (let x = 14 + (row % 2 ? p / 2 : 0); x < 250; x += p) {
          if (!insideBy(x, y, 12.5)) continue;
          if (ZONES.some((z) => x > z[0] - rr && x < z[2] + rr && y > z[1] - rr && y < z[3] + rr)) continue;
          out.push({ t: "nub", x: r1(x), y: r1(y), r: rr });
        }
      }
      return out;
    })(),
    STADE: [
      [Lx(62, 19), Rx(62, 19), Lx(116, 16), Rx(116, 16), Lx(170, 18), Rx(170, 18)],
      [Lx(312, 15), Rx(312, 15)],
      [Lx(424, 17), Lx(466, 17), Lx(508, 17), Lx(550, 19), Rx(430, 17), Rx(472, 17), Rx(514, 18), Rx(554, 21)],
      [[54, 582], [92, 590], [138, 592], [178, 582]],
    ].flat().map(([x, y]) => ({ t: "cone", x, y, r: 8.2 })),
    PRO: [
      ...[Lx(72, 21), Rx(72, 21), Lx(168, 21), Rx(168, 21)].map(([x, y]) => ({ t: "round", x, y, r: 9.6 })),
      ...[Lx(432, 21), Lx(492, 19), Lx(550, 22), Rx(438, 21), Rx(496, 20), Rx(550, 25), [62, 588], [170, 586]].map(([x, y]) => radial(x, y)),
    ],
    CHAMPION: [
      ...[Lx(78, 22), Rx(78, 22), Lx(440, 23), Rx(446, 23), Lx(552, 26), Rx(548, 30)].map(([x, y]) => ({ t: "steel", x, y, r: 10.6 })),
      ...[Lx(166, 20), Rx(166, 20)].map(([x, y]) => ({ t: "blade", x, y, dir: [0, 1] })),
      ...[Lx(496, 19), Rx(500, 19), [64, 590], [170, 588]].map(([x, y]) => radial(x, y)),
    ],
    LEGEND: [Lx(86, -2), Rx(86, -2), Lx(446, -3), Rx(452, -3), Lx(548, -1), Rx(540, -2)].map(([x, y]) => ({ t: "big", x, y, r: 15.5 })),
  };
  /** A blade whose long axis points at the forefoot pivot (under the 84): a rotational-traction fan. */
  function radial(x, y) {
    return { t: "blade", x, y, dir: [x - 129, y - 500] };
  }

  /* ------------------------------------------------------------------ materials */
  const RIM = "#efe9dc";
  const TIER = {
    HOMA: {
      plate: ["#dfa86c", "#c98b4a", "#a8692f"], ink: "#3a2006", inkTone: "#5c3712", recess: "#9c642c", wheel: "#c78a4b",
      med: ["#d9a265", "#b97a3c"], stud: ["#e8b77d", "#c98b4a", "#94591f"], grain: [0.22, 0.3], gloss: 0.1, part: 0.28, tok: "#c98b4a",
    },
    STADE: {
      plate: ["#2f3238", "#1d1f23", "#111215"], ink: "#f4f1e9", inkTone: "#c9c6bf", recess: "#0b0c0e", wheel: "#26292e",
      med: ["#3a3e45", "#16181b"], stud: ["#8d939d", "#3a3e45", "#0b0c0e"], grain: [0.16, 0.35], gloss: 0.05, part: 0.22, tok: "#1d1f23",
    },
    PRO: {
      plate: ["#2e74ff", "#0151fc", "#0036b8"], ink: "#ffffff", inkTone: "#cfe0ff", recess: "#00308f", wheel: "#0a4fe6",
      med: ["#5a92ff", "#0c4bd8"], stud: ["#6a9dff", "#1259f5", "#002f9e"], grain: [0.08, 0.16], gloss: 0.24, part: 0, tok: "#0151fc",
    },
    CHAMPION: {
      plate: ["#30353d", "#1b1e24", "#0d0f12"], ink: "#f4f1e9", inkTone: "#c3c7cd", recess: "#08090b", wheel: "#22262c",
      med: ["#3b4049", "#15171b"], stud: ["#727a86", "#2b3038", "#08090b"], grain: [0.05, 0.12], gloss: 0.2, part: 0, tok: "#1b1e24",
    },
    LEGEND: {
      plate: ["#ffffff", "#f2f1ed", "#d3d5d6"], ink: "#1b2028", inkTone: "#59606b", recess: "#b4b9be", wheel: "#e6e7e6",
      med: ["#f3f5f7", "#9aa3ad"], stud: ["#ffffff", "#c4cbd3", "#6b7480"], grain: [0.04, 0.08], gloss: 0.3, part: 0, tok: "#f1f1ee",
    },
  };
  const STEEL = [
    [0, "#fbfcfd"], [0.16, "#c9d0d8"], [0.32, "#7f8a97"], [0.47, "#eef2f6"], [0.6, "#aab3bd"], [0.76, "#59636f"], [0.9, "#cfd6dd"], [1, "#f4f6f8"],
  ];
  const BRASS = [
    [0, "#fbefc4"], [0.22, "#e6cf8b"], [0.45, "#b8963f"], [0.62, "#f2dea0"], [0.82, "#a9873a"], [1, "#e9d595"],
  ];
  /** "#rrggbb" -> the three colour rows of an feColorMatrix that floods that colour */
  const rgbF = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round((v / 255) * 1000) / 1000);
    return `${r}  0 0 0 0 ${g}  0 0 0 0 ${b} `;
  };
  const stops = (a, op = 1) => a.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"${op < 1 ? ` stop-opacity="${op}"` : ""}/>`).join("");

  /* ------------------------------------------------------------------ stud drawing */
  // a chevron's apex sits on +y at rotate(0); this gives the rotation for a direction
  const angOf = (v) => r1((Math.atan2(-v[0], v[1]) * 180) / Math.PI);
  // a tapered blade: footprint, lit flank, top face (long axis on y at rotate(0))
  const BLB = "M0 -11.5C7.2 -6 7.2 6 0 11.5C-7.2 6 -7.2 -6 0 -11.5Z";
  const BLM = "M0 -10.2C5.8 -5.2 5.8 5.2 0 10.2C-5.8 5.2 -5.8 -5.2 0 -10.2Z";
  const BLT = "M0 -8.2C3.6 -4.1 3.6 4.1 0 8.2C-3.6 4.1 -3.6 -4.1 0 -8.2Z";
  function stud(u, s, P, full) {
    const { x, y } = s;
    if (s.t === "nub") {
      return (
        `<circle cx="${r1(x + 0.7)}" cy="${r1(y + 1.2)}" r="${s.r}" fill="#2a1503" opacity=".28"/>` +
        `<circle cx="${x}" cy="${y}" r="${s.r}" fill="url(#${u}-nub)"/>` +
        (full ? `<circle cx="${r1(x - s.r * 0.32)}" cy="${r1(y - s.r * 0.36)}" r="${r1(s.r * 0.3)}" fill="#fff4e2" opacity=".55"/>` : "")
      );
    }
    if (s.t === "cone" || s.t === "round") {
      const top = s.r * (s.t === "cone" ? 0.46 : 0.62);
      return (
        `<circle cx="${r1(x + 1)}" cy="${r1(y + 1.8)}" r="${s.r}" fill="#000" opacity=".34"/>` +
        `<circle cx="${x}" cy="${y}" r="${s.r}" fill="url(#${u}-cone)"/>` +
        `<circle cx="${x}" cy="${y}" r="${r1(top)}" fill="${P.stud[1]}"/>` +
        `<circle cx="${x}" cy="${y}" r="${r1(top)}" fill="none" stroke="${P.stud[0]}" stroke-width=".7" stroke-dasharray="${r1(top * 2.4)} ${r1(top * 4)}" stroke-dashoffset="${r1(top * 3.4)}" opacity=".9"/>`
      );
    }
    if (s.t === "blade") {
      const a = angOf(s.dir || [0, 1]);
      const g = (dx, dy, inner) => `<g transform="translate(${r1(x + dx)} ${r1(y + dy)}) rotate(${a})">${inner}</g>`;
      return (
        g(1.3, 2.2, `<path d="${BLB}" fill="#000" opacity=".36"/>`) +
        g(0, 0, `<path d="${BLB}" fill="${P.stud[2]}"/>`) +
        g(-0.6, -0.7, `<path d="${BLM}" fill="${P.stud[0]}"/>`) +
        g(0.3, 0.35, `<path d="${BLT}" fill="${P.stud[1]}"/>`)
      );
    }
    // steel: a screw-in stud on a moulded boss
    const big = s.t === "big";
    const r = s.r;
    const boss = big ? r + 3.6 : r + 2.8;
    let out =
      `<circle cx="${r1(x + 1.4)}" cy="${r1(y + 2.6)}" r="${r1(boss)}" fill="#000" opacity="${big ? 0.32 : 0.4}"/>` +
      `<circle cx="${x}" cy="${y}" r="${r1(boss)}" fill="${big ? "url(#" + u + "-boss)" : P.stud[2]}"/>` +
      `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}-steel)"/>` +
      `<circle cx="${x}" cy="${y}" r="${r1(r * 0.64)}" fill="url(#${u}-face)"/>`;
    if (full) {
      out += `<g fill="none" stroke="#fff" stroke-width=".35" opacity=".35">` + [0.18, 0.3, 0.42, 0.54].map((k) => `<circle cx="${x}" cy="${y}" r="${r1(r * k)}"/>`).join("") + `</g>`;
      out += `<path d="M${r1(x - r * 0.78)} ${r1(y - r * 0.3)}A${r1(r * 0.84)} ${r1(r * 0.84)} 0 0 1 ${r1(x + r * 0.2)} ${r1(y - r * 0.82)}" stroke="#fff" stroke-width="${big ? 1.6 : 1.1}" fill="none" stroke-linecap="round" opacity=".9"/>`;
    }
    out += `<circle cx="${x}" cy="${y}" r="${r1(r * 0.64)}" fill="none" stroke="#3d4650" stroke-width=".6" opacity=".7"/>`;
    return out;
  }

  /* ------------------------------------------------------------------ defs */
  function defs(u, t, P, full, ar) {
    const mcx = ar ? MIRROR - LAY.med.x : LAY.med.x;
    let d =
      `<clipPath id="${u}-cl"><path d="${D_SOLE}"/></clipPath>` +
      `<clipPath id="${u}-mc"><path d="${lens(mcx, LAY.med.y, LAY.med.w, LAY.med.h)}"/></clipPath>` +
      `<linearGradient id="${u}-pl" x1="0" y1="0" x2="1" y2=".32"><stop offset="0" stop-color="${P.plate[0]}"/><stop offset=".5" stop-color="${P.plate[1]}"/><stop offset="1" stop-color="${P.plate[2]}"/></linearGradient>` +
      (t === "LEGEND"
        ? `<linearGradient id="${u}-rim" x1="0" y1="0" x2="1" y2=".4">${stops([[0, "#ffffff"], [0.22, "#b7bfc8"], [0.42, "#f1f4f6"], [0.66, "#8b95a0"], [0.85, "#dfe4e8"], [1, "#a7b0ba"]])}</linearGradient>`
        : `<linearGradient id="${u}-rim" x1="0" y1="0" x2="1" y2=".5"><stop offset="0" stop-color="#fbf8f1"/><stop offset=".55" stop-color="${RIM}"/><stop offset="1" stop-color="#d8cfbc"/></linearGradient>`) +
      `<radialGradient id="${u}-nub" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="${P.stud[0]}"/><stop offset=".55" stop-color="${P.stud[1]}"/><stop offset="1" stop-color="${P.stud[2]}"/></radialGradient>` +
      `<linearGradient id="${u}-cone" x1=".15" y1=".1" x2=".85" y2=".95"><stop offset="0" stop-color="${P.stud[0]}"/><stop offset=".5" stop-color="${P.stud[1]}"/><stop offset="1" stop-color="${P.stud[2]}"/></linearGradient>` +
      `<linearGradient id="${u}-steel" x1="0" y1="0" x2="1" y2="1">${stops(STEEL)}</linearGradient>` +
      `<radialGradient id="${u}-face" cx=".4" cy=".36" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#d3d9df"/><stop offset="1" stop-color="#8f99a5"/></radialGradient>` +
      `<radialGradient id="${u}-boss" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#8a939e"/><stop offset=".7" stop-color="#3c434c"/><stop offset="1" stop-color="#1c2026"/></radialGradient>` +
      `<linearGradient id="${u}-br" x1="0" y1="0" x2="1" y2="1">${stops(BRASS)}</linearGradient>` +
      `<linearGradient id="${u}-med" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="${P.med[0]}"/><stop offset="1" stop-color="${P.med[1]}"/></linearGradient>` +
      `<linearGradient id="${u}-gl" x1="0" y1="0" x2="1" y2=".55"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".26" stop-color="#fff" stop-opacity="${P.gloss}"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset=".66" stop-color="#fff" stop-opacity="${r1(P.gloss * 0.45 * 100) / 100}"/><stop offset=".74" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
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
        `<pattern id="${u}-brush" width="3" height="1.2" patternUnits="userSpaceOnUse"><rect width="3" height=".5" fill="#fff" opacity=".22"/></pattern>`;
    }
    if (full) {
      const cis = ' color-interpolation-filters="sRGB"';
      d +=
        // rubber / TPU grain: light and dark specks from one noise field
        `<filter id="${u}-gr" x="0" y="0" width="1" height="1"${cis}><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" result="n"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -1.7" result="w"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.25" result="k"/>` +
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
        // debossed figure: the avatar's alpha as a recess, shaded by one distant light
        `<filter id="${u}-rl" filterUnits="userSpaceOnUse" x="${mcx - 56}" y="190" width="112" height="146"${cis}><feGaussianBlur in="SourceAlpha" stdDeviation="1.25" result="b"/>` +
        `<feComponentTransfer in="b" result="h"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>` +
        `<feDiffuseLighting in="h" surfaceScale="4.2" diffuseConstant="1" lighting-color="#fff" result="d"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting>` +
        `<feColorMatrix in="d" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -2.6" result="hi"/>` +
        `<feColorMatrix in="d" type="matrix" values="0 0 0 0 ${rgbF(P.recess)}  -1.5 0 0 0 1.15" result="lo"/>` +
        `<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 ${rgbF(P.recess)}  0 0 0 .3 0" result="fl"/>` +
        `<feMerge><feMergeNode in="fl"/><feMergeNode in="lo"/><feMergeNode in="hi"/></feMerge></filter>` +
        `<filter id="${u}-bl" x="-5%" y="-5%" width="110%" height="110%"${cis}><feGaussianBlur stdDeviation="5"/></filter>` +
        // mould parting line, 15 units inside the edge
        `<mask id="${u}-pm" maskUnits="userSpaceOnUse" x="-10" y="-20" width="280" height="680"><path d="${D_SOLE}" fill="none" stroke="#fff" stroke-width="31.2"/><path d="${D_SOLE}" fill="none" stroke="#000" stroke-width="29.6"/></mask>`;
    }
    return `<defs>${d}</defs>`;
  }

  /* ------------------------------------------------------------------ the full sole */
  function wheelDisc(u, P, founder, full) {
    const { x, y, r } = LAY.wheel;
    let s = `<circle cx="${x}" cy="${y}" r="${r + 2.6}" fill="${P.recess}"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${founder ? `url(#${u}-br)` : P.wheel}"/>`;
    const ink = founder ? "#6e5718" : P.ink;
    if (full) {
      // knurled edge of the pressed insert
      let k = "";
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        k += `M${r1(x + Math.cos(a) * (r - 2))} ${r1(y + Math.sin(a) * (r - 2))}L${r1(x + Math.cos(a) * (r - 0.3))} ${r1(y + Math.sin(a) * (r - 0.3))}`;
      }
      s += `<path d="${k}" stroke="${ink}" stroke-width=".55" opacity="${founder ? 0.55 : 0.35}"/>`;
    }
    // twelve month ticks, the arrow points at the sample month (June)
    let tk = "";
    for (let m = 1; m <= 12; m++) {
      const a = ((m * 30 - 90) * Math.PI) / 180;
      const r0 = r * 0.66, rr = r * (m === 6 ? 0.88 : 0.82);
      tk += `M${r1(x + Math.cos(a) * r0)} ${r1(y + Math.sin(a) * r0)}L${r1(x + Math.cos(a) * rr)} ${r1(y + Math.sin(a) * rr)}`;
    }
    s += `<path d="${tk}" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>`;
    s += `<path d="M${x} ${r1(y - r * 0.5)}V${r1(y + r * 0.34)}" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`;
    s += `<path d="M${r1(x - 4.2)} ${r1(y + r * 0.3)}L${x} ${r1(y + r * 0.58)}L${r1(x + 4.2)} ${r1(y + r * 0.3)}Z" fill="${ink}"/>`;
    if (founder && full) s += `<ellipse cx="${x - 7}" cy="${y - 10}" rx="9" ry="4.2" transform="rotate(-38 ${x - 7} ${y - 10})" fill="#fff" opacity=".45"/>`;
    return s;
  }

  /* The shank-plate medallion. Drawn outside the mirrored group (lighting filters and a
     negative scale do not mix), at the mirrored position for the left boot. */
  function avatarRelief(u, P, full, thumb, ar) {
    const { y, w, h } = LAY.med;
    const x = ar ? MIRROR - LAY.med.x : LAY.med.x;
    const dm = lens(x, y, w, h);
    // the figure sits off-centre toward the lateral edge: hood and near shoulder fill the plate
    const off = ar ? -8 : 8;
    const aw = 82, ah = 98;
    const box = { x: x + off - aw / 2, y: y + h / 2 + 7 - ah, w: aw, h: ah };
    const A = MC.AVATAR;
    // only the yoke seam and the hood rim, as moulded lines (the figure itself comes from MC.avatar)
    const seams = (col, sw) =>
      `<svg x="${r1(box.x)}" y="${r1(box.y)}" width="${aw}" height="${ah}" viewBox="${A.viewBox}" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><path d="${A.seam} ${A.hoodRim}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/></svg>`;
    let s = `<path d="${dm}" fill="url(#${u}-med)"/>`;
    s += `<g clip-path="url(#${u}-mc)">`;
    if (full && !thumb) {
      s += `<g filter="url(#${u}-rl)">${MC.avatar({ ...box, torso: "#000", seam: false })}</g>`;
      s += `<g opacity=".45" transform="translate(.5 .8)">${seams("#fff", 2.6)}</g>`;
      s += `<g opacity=".5" transform="translate(-.4 -.5)">${seams(P.recess, 2.6)}</g>`;
    } else {
      s += `<g opacity=".35">${MC.avatar({ ...box, torso: "none", seam: false, stroke: P.ink, strokeWidth: 5 })}</g>`;
    }
    s += `</g>`;
    // the plate's moulded lip
    s += `<path d="${dm}" fill="none" stroke="#000" stroke-opacity=".32" stroke-width="1.6" transform="translate(-.5 -.7)"/>`;
    s += `<path d="${dm}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1" transform="translate(.6 .9)"/>`;
    s += `<path d="${dm}" fill="none" stroke="${P.recess}" stroke-width="1"/>`;
    return s;
  }

  function solid(u, t, P, p, full, thumb) {
    let g = "";
    // club tab (heel pull tab) in the user's club colour
    g += `<path d="${LAY.tab}" fill="${p.club.primary}" stroke="${RIM}" stroke-width="1.6"/>`;
    g += `<rect x="121" y="1" width="32" height="2.2" fill="${p.club.secondary}" opacity=".85"/>`;
    if (t === "LEGEND") {
      // visible thickness: the side wall of the plate
      for (let k = 9; k >= 1; k--) g += `<path d="${D_SOLE}" fill="url(#${u}-wall)" stroke="url(#${u}-wall)" stroke-width="12" transform="translate(${r1(k * 0.45)} ${r1(k * 1.05)})"/>`;
      g += `<path d="${D_SOLE}" fill="none" stroke="#454d57" stroke-width="12.6" transform="translate(4 9.4)"/>`;
    }
    g += `<path d="${D_SOLE}" fill="url(#${u}-pl)"/>`;
    g += `<g clip-path="url(#${u}-cl)">`;
    if (t === "CHAMPION") g += `<rect x="0" y="0" width="260" height="640" fill="url(#${u}-tw)"/>`;
    if (full && !thumb) {
      g += `<rect x="0" y="0" width="260" height="640" filter="url(#${u}-gr)" opacity="${P.grain[1]}"/>`;
      if (P.part) g += `<rect x="0" y="0" width="260" height="640" fill="#fff" opacity="${P.part}" mask="url(#${u}-pm)"/>`;
      g += `<path d="${D_SOLE}" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="30" filter="url(#${u}-bl)"/>`;
    }
    if (t === "HOMA") g += `<ellipse cx="130" cy="480" rx="80" ry="120" fill="#ffd9a3" opacity=".18"/><ellipse cx="136" cy="110" rx="56" ry="70" fill="#ffd9a3" opacity=".14"/>`;
    g += `<rect x="0" y="0" width="260" height="640" fill="url(#${u}-gl)"/>`;
    g += `</g>`;
    // midsole rim: holds the outline on the dark ground; a hairline holds it on the light one
    if (t !== "LEGEND") g += `<path d="${D_SOLE}" fill="none" stroke="#a39a86" stroke-width="13"/>`;
    else g += `<path d="${D_SOLE}" fill="none" stroke="#3f4751" stroke-width="13.4"/>`;
    g += `<path d="${D_SOLE}" fill="none" stroke="url(#${u}-rim)" stroke-width="11"/>`;
    if (full && !thumb) {
      // within-tier wear indicator: four moulded slots on the lateral rim (shown empty: no progress data in the sample)
      let w = "";
      for (const yy of [232, 246, 260, 274]) {
        const s = span(yy);
        w += `M${r1(s[1] - 3.4)} ${yy}H${r1(s[1] + 3.4)}`;
      }
      g += `<path d="${w}" stroke="#b9af99" stroke-width="2.2" stroke-linecap="round"/>`;
    }
    if (t === "LEGEND") {
      // machined toe guard: extends the toe past the outline
      const tg = "M30 572C24 612 66 646 114 646C164 646 206 620 210 578L198 574C192 606 156 630 114 630C74 630 44 608 42 570Z";
      g += `<path d="${tg}" fill="#000" opacity=".3" transform="translate(1.5 3)"/>`;
      g += `<path d="${tg}" fill="url(#${u}-steel)"/>`;
      if (full) g += `<path d="${tg}" fill="url(#${u}-brush)"/>`;
      g += `<path d="${tg}" fill="none" stroke="#4d5662" stroke-width=".8"/>`;
      for (const [sx, sy] of [[52, 616], [114, 638], [180, 616]]) g += `<circle cx="${sx}" cy="${sy}" r="2.4" fill="url(#${u}-face)" stroke="#4d5662" stroke-width=".6"/><path d="M${sx - 1.4} ${sy}H${sx + 1.4}" stroke="#4d5662" stroke-width=".6"/>`;
    }
    g += wheelDisc(u, P, !!p.founder, full && !thumb);
    g += STUDS[t].map((s) => stud(u, s, P, full && !thumb)).join("");
    return g;
  }

  /* ------------------------------------------------------------------ text */
  const CH = { A: 0.64, B: 0.59, C: 0.51, D: 0.65, E: 0.52, F: 0.47, G: 0.57, H: 0.65, I: 0.3, J: 0.39, K: 0.62, L: 0.44, M: 0.81, N: 0.67, O: 0.66, P: 0.59, Q: 0.65, R: 0.62, S: 0.58, T: 0.49, U: 0.63, V: 0.62, W: 0.93, X: 0.63, Y: 0.58, Z: 0.59 };
  const emName = (s, ar) => (ar ? [...s].length * 0.62 : [...s].reduce((a, ch) => a + (CH[ch.toUpperCase()] || 0.6), 0));

  function words(u, p, o, P, full, thumb) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const mx = (x) => (ar ? MIRROR - x : x);
    const dirA = ar ? ' direction="rtl"' : "";
    const md = full && !thumb ? ` filter="url(#${u}-md)"` : "";
    const name = MC.nameOf(p, o);
    let s = "";
    // crest on the heel tab (never mirrored)
    s += `<svg x="${mx(137) - 6}" y="-6.4" width="12" height="14.4" viewBox="0 0 40 48" aria-hidden="true">${MC.crest({ mono: p.club.secondary }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
    // wheel year: the arrow splits the two digits, the way moulds print it
    const { x: wx, y: wy, r: wr } = LAY.wheel;
    const yink = p.founder ? "#5d4812" : P.ink;
    s += `<text class="c05-yr" x="${mx(wx) - 7.6}" y="${wy + 4.6}" font-size="13" fill="${yink}" text-anchor="middle">2</text>`;
    s += `<text class="c05-yr" x="${mx(wx) + 7.6}" y="${wy + 4.6}" font-size="13" fill="${yink}" text-anchor="middle">6</text>`;
    if (!thumb) {
      if (p.founder) {
        const arc = `M${mx(wx) - wr - 9} ${wy}A${wr + 9} ${wr + 9} 0 0 1 ${mx(wx) + wr + 9} ${wy}`;
        s += `<path id="${u}-fa" d="${arc}" fill="none"/>`;
        s +=
          `<text class="c05-fl${ar ? " is-ar" : ""}" font-size="${ar ? 8.4 : 7}" fill="${P.ink}"${dirA}${md}><textPath href="#${u}-fa" startOffset="50%" text-anchor="middle">${esc(S.founderLine)}</textPath></text>`;
        // the written founder form: the year after the name
        s += `<text class="c05-fn" x="${mx(wx)}" y="${LAY.founderY}" font-size="14" fill="${P.ink}" text-anchor="middle"${dirA}${md}>${esc(name)} <tspan class="c05-fy">·${p.founder % 100}</tspan></text>`;
      }
      s += `<text class="c05-id" x="${mx(wx)}" y="${LAY.idY}" font-size="8.2" fill="${P.ink}" text-anchor="middle" direction="ltr" opacity=".88">${esc(p.id)}</text>`;
      // country, along the lateral waist
      const cx = mx(LAY.countryX);
      s += `<text class="c05-ct${ar ? " is-ar" : ""}" x="${cx}" y="${LAY.med.y}" font-size="${ar ? 8.6 : 7}" fill="${P.ink}" text-anchor="middle" transform="rotate(-90 ${cx} ${LAY.med.y})" dominant-baseline="central" opacity=".9"${dirA}>${esc(S.country)}</text>`;
    }
    // name, with the tier inline on the same baseline; a long name keeps its size and the tier drops under it
    const tierTxt = S.tiers[p.tier];
    const tierFs = ar ? 12 : 11;
    const tierW = (ar ? [...tierTxt].length * 0.62 * tierFs : tierTxt.length * 0.74 * tierFs) + 7;
    const sp = span(LAY.nameY - 26), sp2 = span(LAY.nameY);
    const avail = Math.min(sp[1] - sp[0], sp2[1] - sp2[0]) - 24;
    const em = emName(name, ar);
    const inlineFs = Math.min(42, (avail - tierW) / em);
    const stacked = inlineFs < 27;
    const fs = r1(stacked ? Math.min(36, avail / em) : inlineFs);
    const ny = stacked ? LAY.nameY - 12 : LAY.nameY;
    const nx = mx(midX(ny - 10) + 2);
    const tierSpan = `<tspan class="c05-tr${ar ? " is-ar" : ""}" font-size="${tierFs}" fill="${P.inkTone}">${esc(tierTxt)}</tspan>`;
    s +=
      `<text class="c05-nm${ar ? " is-ar" : ""}" x="${r1(nx)}" y="${ny}" fill="${P.ink}" text-anchor="middle"${dirA}${md}>` +
      `<tspan font-size="${fs}">${esc(name)}</tspan>${stacked ? "" : " " + tierSpan}</text>`;
    if (stacked) s += `<text class="c05-nm${ar ? " is-ar" : ""}" x="${r1(nx)}" y="${ny + 15}" text-anchor="middle"${dirA}>${tierSpan}</text>`;
    if (!thumb) {
      // size row: set like UK / EU / US on a real sole, two pairs per line
      const cxs = midX(LAY.sizeY[0]) - 1;
      const cols = ar ? [cxs + 40, cxs - 40] : [cxs - 40, cxs + 40];
      MC.STATS.forEach((k, i) => {
        const x = mx(cols[i % 2]);
        const y = LAY.sizeY[(i / 2) | 0];
        s +=
          `<text x="${r1(x)}" y="${y}" text-anchor="middle" fill="${P.ink}"${dirA}>` +
          `<tspan class="c05-sl${ar ? " is-ar" : ""}" font-size="${ar ? 8.6 : 7.4}">${esc(S.stats[k])}</tspan> <tspan class="c05-sv" font-size="12.5">${p.stats[k]}</tspan></text>`;
      });
      const dx = mx(cxs);
      s += `<path d="M${r1(dx)} ${LAY.sizeY[0] - 11}V${LAY.sizeY[1] + 3}" stroke="${P.ink}" stroke-width=".8" opacity=".55"/>`;
      s += `<path d="M${r1(mx(cxs - 76))} ${LAY.sizeY[0] + 5}H${r1(mx(cxs + 76))}" stroke="${P.ink}" stroke-width=".5" opacity=".35"/>`;
    }
    // the 84, moulded proud in the forefoot: a fixed two-digit slot, centred
    const ovr = String(p.ovr);
    const ofs = ovr.length > 2 ? 74 : 90;
    s += `<text class="c05-ov" x="${mx(LAY.ovrX)}" y="${LAY.ovrY}" font-size="${ofs}" fill="${P.ink}" text-anchor="middle" direction="ltr"${md}>${ovr}</text>`;
    if (!thumb) {
      s += `<path id="${u}-sp" d="${SEASON_PATH(ar)}" fill="none"/>`;
      s += `<text class="c05-se" font-size="7.6" fill="${P.ink}" direction="ltr" opacity=".9"><textPath href="#${u}-sp" startOffset="50%" text-anchor="middle">${esc(p.season)}</textPath></text>`;
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
    const geo = `<g${ar ? ` transform="matrix(-1 0 0 1 ${MIRROR} 0)"` : ""}>${solid(u, t, P, p, true, thumb)}</g>` + avatarRelief(u, P, true, thumb, ar);
    return (
      `<div class="c05 c05-full t-${t.toLowerCase()}${thumb ? " is-thumb" : ""}${o.motion ? " is-motion" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${t}">` +
      `<svg class="c05-svg" viewBox="-10 -14 280 664" aria-hidden="true" focusable="false">` +
      defs(u, t, P, true, ar) +
      geo +
      `<g class="c05-words">${words(u, p, o, P, true, thumb)}</g>` +
      `</svg></div>`
    );
  }

  /* ------------------------------------------------------------------ token */
  // The sole laid horizontal, toe at the inline end. Local (x, y) -> token (y + 14, 262 - x).
  const TH = 276; // token box height in token units (y from -6 to 270)
  const SQ = { a: 200, b: 420, k: 0.45 }; // the mini squeezes the waist: heel + forefoot
  const sq = (y, mini) => (!mini ? y : y <= SQ.a ? y : y >= SQ.b ? y - (SQ.b - SQ.a) * (1 - SQ.k) : SQ.a + (y - SQ.a) * SQ.k);
  const TW = (mini) => r1(sq(648, mini) + 14 + 6);
  const tok = (x, y, mini) => [sq(y, mini) + 14, 262 - x];
  const TOK_D = { full: pathOf((x, y) => tok(x, y, false)), mini: pathOf((x, y) => tok(x, y, true)) };
  const TOK_TAB = (mini) => {
    const m = (x, y) => tok(x, y, mini).map(r1).join(" ");
    return `M${m(112, 26)}L${m(112, -2)}Q${m(112, -14)} ${m(124, -14)}L${m(150, -14)}Q${m(162, -14)} ${m(162, -2)}L${m(162, 26)}Z`;
  };

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const ar = MC.isAr(o);
    const t = TIER[p.tier] ? p.tier : "PRO";
    const P = TIER[t];
    const u = MC.uid("c05t");
    const w = TW(mini);
    const X = (x) => (ar ? w - x : x);
    const D = mini ? TOK_D.mini : TOK_D.full;
    const k = mini ? 1.55 : 1.3; // studs grow as the token shrinks
    let g = "";
    g += `<path d="${TOK_TAB(mini)}" fill="${p.club.primary}" stroke="${RIM}" stroke-width="5"/>`;
    if (t === "LEGEND") g += `<path d="${D}" fill="#7d8792" stroke="#7d8792" stroke-width="14" transform="translate(9 7)"/>`;
    g += `<path d="${D}" fill="url(#${u}-p)"/>`;
    g += `<path d="${D}" fill="none" stroke="${t === "LEGEND" ? "#5f6873" : "#a39a86"}" stroke-width="${mini ? 19 : 16}"/>`;
    g += `<path d="${D}" fill="none" stroke="${RIM}" stroke-width="${mini ? 15 : 12}"/>`;
    if (t === "LEGEND") {
      const m =(x, y) => tok(x, y, mini).map(r1).join(" ");
      g += `<path d="M${m(28, 570)}C${m(20, 618)} ${m(66, 656)} ${m(114, 656)}C${m(166, 656)} ${m(212, 626)} ${m(214, 572)}L${m(196, 568)}C${m(190, 606)} ${m(156, 630)} ${m(114, 630)}C${m(74, 630)} ${m(44, 606)} ${m(44, 566)}Z" fill="url(#${u}-s)" stroke="#4d5662" stroke-width="3"/>`;
    }
    const geo = ar ? `<g transform="matrix(-1 0 0 1 ${w} 0)">${g}</g>` : g;
    // studs, in token space (no rotation of the light)
    const ovC = tok(LAY.ovrX, mini ? 478 : 500, mini);
    const ofs = mini ? 186 : 150;
    const ow = ofs * 1.25;
    const clearOf = (cx, cy, r) => Math.abs(cx - ovC[0]) > ow / 2 + r + 4 || Math.abs(cy - ovC[1]) > ofs * 0.34 + r + 4;
    let st = "";
    for (const s of STUDS[t]) {
      if (mini && t === "HOMA" && (s.x * 7 + s.y) % 3 > 1) continue;
      const [cx0, cy] = tok(s.x, s.y, mini);
      const cx = X(cx0);
      const big = s.t === "big";
      const r = big ? (mini ? 30 : 26) : (s.r || 7) * k * (s.t === "nub" ? 1.15 : 1);
      if (!big && !clearOf(cx, cy, r)) continue;
      if (s.t === "blade") {
        const v = s.dir || [0, 1];
        const tv = [v[1], -v[0]];
        const a = angOf([ar ? -tv[0] : tv[0], tv[1]]);
        st += `<g transform="translate(${r1(cx)} ${r1(cy)}) rotate(${a}) scale(${r1(k * 1.1)})"><path d="${BLB}" fill="${P.stud[2]}"/><path d="${BLT}" fill="${P.stud[0]}"/></g>`;
      } else if (s.t === "steel" || big) {
        st += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r + (big ? 6 : 4))}" fill="${big ? "#2b3138" : P.stud[2]}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="url(#${u}-s)"/>`;
      } else {
        st += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${P.stud[2]}"/><circle cx="${r1(cx - r * 0.15)}" cy="${r1(cy - r * 0.15)}" r="${r1(r * 0.72)}" fill="${P.stud[0]}"/>`;
      }
    }
    // founder ring in the heel: a brass ring, never a dot (it must not read as a stud)
    const wc = tok(LAY.wheel.x, LAY.wheel.y, mini);
    const ring = p.founder
      ? `<circle cx="${r1(X(wc[0]))}" cy="${r1(wc[1])}" r="${mini ? 30 : 30}" fill="${P.recess}" stroke="url(#${u}-b)" stroke-width="${mini ? 16 : 13}"/>`
      : mini ? "" : `<circle cx="${r1(X(wc[0]))}" cy="${r1(wc[1])}" r="26" fill="none" stroke="${P.recess}" stroke-width="7" opacity=".8"/>`;
    const ovr = String(p.ovr);
    const ovText = `<text class="c05-ov" x="${r1(X(ovC[0]))}" y="${r1(ovC[1] + ofs * 0.32)}" font-size="${ovr.length > 2 ? ofs * 0.8 : ofs}" text-anchor="middle" fill="${P.ink}" stroke="${t === "LEGEND" ? "#ffffff" : P.recess}" stroke-width="${mini ? 18 : 14}" paint-order="stroke" stroke-linejoin="round">${ovr}</text>`;
    const vb = `0 -8 ${w} ${TH}`;
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
      geo +
      (t === "CHAMPION" ? `<g clip-path="none" opacity=".55">${ar ? `<g transform="matrix(-1 0 0 1 ${w} 0)">` : "<g>"}<path d="${D}" fill="url(#${u}-tw)"/></g></g>` : "") +
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
      `<span class="c05-rw"><b class="${ar ? "is-ar" : ""}">${esc(MC.nameOf(p, o))}${p.founder ? `<i>${MC.ltr("·" + (p.founder % 100))}</i>` : ""}</b>` +
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
    // the print a sole leaves is its mirror image: the stud marks of the other foot, pressed into the turf
    const sc = 0.8;
    const prMap = (x, y) => [r1((ar ? x : MIRROR - x) * sc), r1(y * sc)];
    const marks = STUDS[t]
      .map((s) => {
        const [x, y] = prMap(s.x, s.y);
        if (s.t === "blade") {
          const v = s.dir || [0, 1];
          const a = angOf([ar ? v[0] : -v[0], v[1]]);
          return (
            `<g transform="translate(${x} ${y}) rotate(${a}) scale(${sc})">` +
            `<path d="${BLB}" fill="#2f6243" opacity=".55" transform="scale(1.3)"/>` +
            `<path d="${BLB}" fill="#010a05"/>` +
            `<path d="M3.4 -6C5 0 4 6 .8 11" stroke="#9ccfa8" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".85"/></g>`
          );
        }
        const r = r1((s.t === "big" ? s.r * 0.8 : s.r || 7) * sc);
        return (
          `<circle cx="${x}" cy="${y}" r="${r1(r + 2.6)}" fill="#2f6243" opacity=".5"/>` +
          `<circle cx="${x}" cy="${y}" r="${r}" fill="#010a05"/>` +
          `<path d="M${r1(x - r * 0.85)} ${r1(y + r * 0.5)}A${r} ${r} 0 0 0 ${r1(x + r * 0.62)} ${r1(y + r * 0.78)}" stroke="#9ccfa8" stroke-width="1.4" fill="none" opacity=".85"/>`
        );
      })
      .join("");
    // grass pressed flat where the plate stood: a faint sheen and a crushed edge
    const outline = `<path d="${D_SOLE}" transform="matrix(${ar ? sc : -sc} 0 0 ${sc} ${ar ? 0 : r1(MIRROR * sc)} 0)" fill="#3c7a52" fill-opacity=".16" stroke="#9ccfa8" stroke-opacity=".22" stroke-width="2.6" stroke-dasharray="3 4"/>`;
    const name = MC.nameOf(p, o);
    return (
      `<div class="c05 c05-share t-${t.toLowerCase()}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg class="c05-sh-bg" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>` +
      `<filter id="${u}-g" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".55 1.9" numOctaves="3" seed="11" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .86  0 0 0 0 .55  2.4 0 0 0 -1.15"/></filter>` +
      `<radialGradient id="${u}-fl" cx="${ar ? 0.15 : 0.85}" cy="0" r="1.05"><stop offset="0" stop-color="#e9f3ff" stop-opacity=".34"/><stop offset=".45" stop-color="#9fd0ff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${u}-vg" cx=".5" cy=".45" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>` +
      `<filter id="${u}-pb" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".45"/></filter>` +
      `</defs>` +
      `<rect width="360" height="640" fill="#0a2416"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect y="${i * 80}" width="360" height="40" fill="#0d2c1b"/>`).join("") +
      `<rect width="360" height="640" filter="url(#${u}-g)" opacity=".38"/>` +
      `<path d="M${ar ? 9 : 351} -10V650" stroke="#e8efe6" stroke-width="7" opacity=".85"/>` +
      `<rect width="360" height="640" filter="url(#${u}-g)" opacity=".22" style="mix-blend-mode:multiply"/>` +
      `<g transform="translate(${ar ? -26 : 178} 6) rotate(${ar ? -10 : 10} 104 256)" filter="url(#${u}-pb)">${outline}${marks}</g>` +
      `<rect width="360" height="640" fill="url(#${u}-fl)"/>` +
      `<rect width="360" height="640" fill="url(#${u}-vg)"/>` +
      `</svg>` +
      `<div class="c05-sh-logo">${MC.logo("wordmark", { variant: "light" })}</div>` +
      `<div class="c05-sh-card">${full(p, { ...o, motion: false })}</div>` +
      `<div class="c05-sh-cap"><b class="${ar ? "is-ar" : ""}">${esc(name)}${p.founder ? `<i>${MC.ltr("·" + (p.founder % 100))}</i>` : ""}</b>` +
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
      "The card is a boot outsole, studs up, heel at the top. The outline is a real sole: the forefoot is the widest part, the heel is about 68% of it and the waist 57%, and the big-toe bulge sits on one side. It is the only object in the set whose silhouette is a body part of the game itself, and nothing in FUT, Sorare or the Codex exploration is shaped like it.",
      "Every element sits where a boot maker would put it. The BotolaGO ID is the moulded style code in the heel. The four decisions are the size row ('CAP 91 | SEL 82', two pairs per line, like UK / EU / US on a real sole), printed white rather than moulded so they read first. The 84 is moulded proud in the forefoot, where the size is. The season follows the toe edge as a second production mark, and MOROCCO runs up the lateral waist.",
      "The manager is the shank-plate medallion: the shared back-view figure is pressed into the plate as a relief (an SVG diffuse-lighting deboss on the avatar's own alpha), never a flat bust. The heel pull tab is the club slot, in the club's colour with the neutral crest.",
      "The tier is the stud pattern, which every five-a-side player in Morocco has lived: turf trainers on the terrain de proximité, moulded cones on artificial grass, firm-ground blades, then screw-in steel for real grass. It reads in black and white, by stud count and size, before colour.",
    ],
    belonging: [
      "Boots are the most coveted object in a young player's football life; nobody needs the ladder explained. 'Mine has steel now' is a sentence a 15-year-old already says about boots.",
      "Comparing two soles is instant and physical: dense nubs against six steel studs. Friends compare stud patterns the way they compare boots in the changing room.",
      "Latin cards are a right boot and Arabic cards a left boot, so two friends in different app languages hold a pair. That small fact is the kind of detail people find and share.",
      "The share image presses the sole's own stud print into a night pitch beside it: 'my mark', a picture worth posting rather than a card on a flat colour.",
    ],
    founderMark: [
      "Every moulded part carries an injection date wheel: twelve ticks, an arrow at the month, the year split by the arrow. Every manager's sole has one (the month the account was created; ALI's June arrow is sample data).",
      "Founder soles have the wheel as a pressed brass insert with a knurled edge, the only precious material in the whole concept, with FOUNDER 2026 moulded around it and the written form 'ALI ·26' under it, the way Moroccan supporter groups carry their founding year.",
      "It changes the object, not a label on it: a non-founder sole has the same wheel moulded in its own plate material. At 24px the founder sign stays a brass ring in the heel (a ring, so it is never mistaken for a stud).",
    ],
    small: [
      "44–80px: the sole lies horizontal, toe at the inline end, with the 84 large in the forefoot, the studs around it, the club tab at the heel end and the founder ring in the heel. The plate material and stud pattern carry the tier: gum and dots, black and cones, blue and blades, carbon and steel, white with six steel studs breaking the edge.",
      "24–32px: the waist is squeezed so the heel and forefoot carry the 84 at about 45% of the token height. It fits a ranking row's name cell at about 50–57px wide. The founder ring stays at least 5px across.",
      "The silhouette (a sole with a heel tab) survives as a solid shape at 28px; LEGEND adds bumps on both edges and a longer toe.",
    ],
    rtl: [
      "Arabic cards show the LEFT boot: the outline, studs and medallion mirror, on purpose, so the two languages make a pair. Text never mirrors: علي is set in Changa 800, the stat labels in Noto Sans Arabic with no letter-spacing, the tier sits after the name in reading order.",
      "Digits stay left to right: the 84, BOT #004821 and 2026/27 are LTR runs; the founder form reads 26· علي with the year on the inside. In the token the toe points left, to the inline end.",
    ],
    tiers: {
      HOMA: "Turf trainer. New honest gum rubber (clean amber, not worn), translucent at its thickest, with a dense field of about 70 small round nubs and a crisp mould parting line. Full outline, raw but new.",
      STADE: "Artificial-grass sole. Matte black rubber with fine grain, 22 conical studs with flat tops, and a sharp mould line 15 units inside the edge.",
      PRO: "Firm-ground TPU plate in Logo Blue with a gloss sweep: four round heel studs and eight chevron blades round the forefoot; white moulded type.",
      CHAMPION: "Soft-ground hybrid. A carbon 2/2 twill plate under clear coat, six screw-in polished steel studs on moulded bosses and six dark blades.",
      LEGEND: "Six large machined steel studs only, set into the edge so they break the outline at heel and forefoot; a pearl plate with a visible steel side wall; a machined toe guard that extends the toe.",
    },
    legend: [
      "LEGEND is the only tier whose black-and-white outline changes: six steel studs stand proud of both edges and a machined toe guard lengthens the toe, so a LEGEND is identifiable as a solid shape at 32px.",
      "It is the fewest, heaviest elements: a pearl plate with real thickness (a steel side wall), mirror-polished studs with lathe rings and a specular crescent, a steel shank plate with the manager pressed into it. Steel, not gold; the only warm metal is the founder's brass wheel. The stats stay on the front.",
    ],
    advantages: [
      "The most ownable silhouette in the slate: a sole is recognisable before anything is read, and no card game, fintech card or Codex concept uses it.",
      "The tier ladder is real-world knowledge, not a colour code: nubs, cones, blades, steel. It reads in monochrome and at token size by stud count and plate material.",
      "Every data item has a physical carrier native to the object (style code, size row, date wheel, toe mark, pull tab), so nothing floats in a corner.",
      "Right/left boot for Latin/Arabic turns right-to-left mirroring into a story instead of a constraint.",
    ],
    risks: [
      "A boot belongs to a player more than to a manager. The concept argues that every manager played first; some users may still read it as a player card.",
      "The token is wide (about 2.4:1) and the mini about 2:1, so it needs a wide slot; in a square avatar circle it does not work at all.",
      "Out of context a sole can read as a footprint, a fitness or hiking icon. The heel tab, the studs and the 84 do the work; without them it is generic.",
      "Stud geometry must stay generic: chevrons, cones and round studs only. Any resemblance to a brand's signature plate would be a legal and credibility problem.",
      "The 84 sits on a busy, studded plate; at 24px the stud cue is mostly the plate colour, and the HOMA nub field becomes a texture rather than countable studs.",
      "Mirroring the boot for Arabic may confuse people who compare cards across languages; it needs one line of explanation in the product.",
    ],
    full,
    token,
    row,
    share,
    mount,
  });
})();
