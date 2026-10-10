/* 05 SEMELLE v2 (bold, refined from c05). The manager's identity is the soleplate of a boot,
   shown toe-up the way boots hang on a boot-room rack, and moulded with BotolaGO's own pitch:
   the halfway line is the forefoot flex groove, the centre circle rings the 84, the penalty
   box is the midfoot plate that carries the four decisions. The tier is the stud pattern:
   turf nubs, round cones, firm-ground blades with Logo Blue tips, screw-in steel on carbon,
   then six machined studs that break the outline. Founders carry an injection-moulding year
   clock set in a machined-steel insert ring, its arrow on 26. No gold anywhere.
   Latin cards are a RIGHT boot, Arabic cards the LEFT boot. Light always comes from the
   top-left: the left boot uses mirrored coordinates, never a mirroring transform.

   Onboarding states (CONTRACT.md). A card with no number is the finished plate with its
   number field blank: a moulded dash at the centre spot, and the rounds counted so far as
   tally slots hanging from the halfway groove, raised when counted and engraved empty when
   not (never studs: the studs are the tier). With no tier the plate is the BASE material, a
   raw slate nylon sample plate, with its ten stud mounts bare. The first rating seats the
   tier's studs onto them. The founder clock exists only for a founder. A profile that has
   none of the onboarding fields takes the same path as before, byte for byte. */
(function () {
  const MC = window.MC;
  const esc = (s) => MC.esc(s);
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const D2R = Math.PI / 180;
  // the material key: no tier is the base plate, an unknown tier keeps its old fallback (PRO)
  const tierKey = (p) => (p.tier === null ? "BASE" : TIER[p.tier] ? p.tier : "PRO");
  // true for a profile that carries any onboarding field or state; the gallery's never does
  const onbMode = (p) =>
    p.counted != null ||
    p.minRated != null ||
    p.provisional != null ||
    p.statReason != null ||
    p.ovr == null ||
    p.tier === null ||
    p.name == null ||
    p.club == null ||
    p.serial == null ||
    p.id == null;
  // the tally: how many rounds are drawn and how many of them are counted (only while forming)
  const tallyOf = (p) => {
    const n = p.ovr == null ? Math.min(9, Math.max(0, p.minRated | 0)) : 0;
    return { n, k: Math.min(n, Math.max(0, p.counted | 0)) };
  };
  const PROV = { lat: "Provisoire", ar: "مبدئي" };

  /* ------------------------------------------------------------------ geometry */
  // A right soleplate seen from below, toe up. The toe is a boot's toe, not a foot's: a
  // tight tip pushed toward the big toe (medial, on the right), with the little-toe side raked
  // back from it in a long, almost straight line. The lateral edge (left) runs nearly straight
  // from the ball to the heel; the medial arch is cut in (waist about 64% of the forefoot);
  // the heel is a squared counter cup about 69% of the forefoot.
  const MIRROR = 263; // x -> 263 - x gives the left boot in the same box
  const START = [166, 6];
  const SEGS = [
    [184, 6, 204, 16, 218, 38], // medial toe: the tip turns fast toward the big toe
    [234, 64, 241, 118, 241, 168], // the big-toe bulge
    [241, 202, 238, 224, 232, 244], // medial ball, the widest line
    [224, 298, 198, 340, 194, 400], // medial arch, concave
    [191, 456, 201, 494, 203, 538], // heel front, medial
    [205, 584, 205, 614, 190, 632], // heel side into the squared corner
    [174, 646, 88, 646, 70, 632], // the counter cup: a flat back
    [56, 616, 55, 580, 57, 540], // lateral heel side
    [59, 470, 48, 380, 36, 300], // lateral edge, nearly straight
    [27, 244, 22, 196, 23, 160], // little-toe ball
    [24, 126, 32, 98, 52, 72], // little-toe side
    [78, 36, 136, 6, 166, 6], // the lateral toe, raked back in a long line to the tip
  ];
  const pathOf = (map) => {
    const m = (x, y) => map(x, y).map(r1).join(" ");
    return (
      "M" +
      m(START[0], START[1]) +
      SEGS.map((s) => "C" + m(s[0], s[1]) + " " + m(s[2], s[3]) + " " + m(s[4], s[5])).join("") +
      "Z"
    );
  };
  const POLY = (() => {
    const pts = [];
    let p0 = START;
    for (const s of SEGS) {
      for (let i = 1; i <= 24; i++) {
        const t = i / 24,
          mt = 1 - t;
        const a = mt * mt * mt,
          b = 3 * mt * mt * t,
          c = 3 * mt * t * t,
          d = t * t * t;
        pts.push([
          a * p0[0] + b * s[0] + c * s[2] + d * s[4],
          a * p0[1] + b * s[1] + c * s[3] + d * s[5],
        ]);
      }
      p0 = [s[4], s[5]];
    }
    return pts;
  })();
  /** [left, right] x of the outline at height y (Latin coordinates). */
  function span(y) {
    const xs = [];
    for (let i = 0; i < POLY.length; i++) {
      const a = POLY[i],
        b = POLY[(i + 1) % POLY.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
  }
  const midX = (y) => {
    const s = span(y);
    return (s[0] + s[1]) / 2;
  };
  const insideBy = (x, y, m) =>
    [-m, 0, m].every((dy) => {
      const s = span(y + dy);
      return s && x - s[0] >= m && s[1] - x >= m;
    });
  const Lx = (y, i) => [r1(span(y)[0] + i), y];
  const Rx = (y, i) => [r1(span(y)[1] - i), y];
  const polyD = (pts, map) => "M" + pts.map((p) => map(p[0], p[1]).map(r1).join(" ")).join("L");
  /** A contiguous run of the outline (wrapping through the start), as points. */
  const run = (test) => {
    const n = POLY.length;
    let i0 = POLY.findIndex((p, i) => test(p) && !test(POLY[(i - 1 + n) % n]));
    const out = [];
    for (let k = 0; k < n && test(POLY[(i0 + k) % n]); k++) out.push(POLY[(i0 + k) % n]);
    return out;
  };
  /** Offset a run outward by off(t) (t 0..1 along the run). */
  const offsetRun = (pts, off, c = [131, 300]) =>
    pts.map((p, k) => {
      const a = pts[Math.max(0, k - 1)],
        b = pts[Math.min(pts.length - 1, k + 1)];
      let nx = b[1] - a[1],
        ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (nx * (p[0] - c[0]) + ny * (p[1] - c[1]) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const o = off(k / (pts.length - 1));
      return [p[0] + nx * o, p[1] + ny * o];
    });

  // The heel counter: the back of the cup carries the club colour.
  const HEEL = run((p) => p[1] >= 598);
  // LEGEND's machined toe guard: a 9-unit band that follows the toe and stands 10 proud at the tip.
  const TOE = (() => {
    const pts = run((p) => p[1] < 46);
    const bump = (t) => 1.5 + 9.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.04) / 0.92)));
    return { outer: offsetRun(pts, bump), inner: offsetRun(pts, (t) => bump(t) - 9) };
  })();
  // Toe spring: the tip of the plate curls away from the viewer, so its wrapped edge shows as a
  // short lip beyond the rim, deepest at the tip (part of the outline, not only shading).
  const LIP = (() => {
    const pts = run((p) => p[1] < 30);
    const bump = (t) => Math.sin(Math.PI * t) ** 0.7;
    return {
      outer: offsetRun(pts, (t) => 6.1 + 4.8 * bump(t)),
      inner: offsetRun(pts, (t) => 6.1 - 2.6 * bump(t)),
    }; // both edges meet at the ends: no seam
  })();
  // The mini: the forefoot alone, a toe-cap shield. Its base is cut in a shallow, uneven V
  // (the big-toe joint sits ahead of the little-toe joint) to a point under the 84, where the
  // founder's steel dot sits like the spot on a halfway line. Never a symmetric arch.
  const CUT = { l: 222, m: 198, apex: [131, 250] };
  const CAPLOOP = (() => {
    const pts = run((p) => p[1] <= (p[0] < CUT.apex[0] ? CUT.l : CUT.m));
    return [[span(CUT.l)[0], CUT.l], ...pts, [span(CUT.m)[1], CUT.m], CUT.apex];
  })();

  /* Per-language geometry: mirrored coordinates for the left boot (light stays top-left). */
  const GEO = {};
  function geo(ar) {
    const key = ar ? "ar" : "lat";
    if (GEO[key]) return GEO[key];
    const X = (x) => (ar ? MIRROR - x : x);
    const map = (x, y) => [X(x), y];
    const G = {
      ar,
      X,
      map,
      D: pathOf(map),
      heel: polyD(HEEL, map),
      toe:
        polyD(TOE.outer, map) +
        "L" +
        TOE.inner
          .slice()
          .reverse()
          .map((p) => map(p[0], p[1]).map(r1).join(" "))
          .join("L") +
        "Z",
      toeMid: TOE.outer.map((p, i) => [(p[0] + TOE.inner[i][0]) / 2, (p[1] + TOE.inner[i][1]) / 2]),
      lip:
        polyD(LIP.outer, map) +
        "L" +
        LIP.inner
          .slice()
          .reverse()
          .map((p) => map(p[0], p[1]).map(r1).join(" "))
          .join("L") +
        "Z",
      lipEdge: polyD(LIP.outer, map),
    };
    return (GEO[key] = G);
  }

  /* Fixed layout (Latin coordinates; the left boot mirrors x through X()). Top to bottom:
     the 84 in the centre circle, the name across the ball, the box plate with the stats, the
     hood in the shank, the year clock and the style code in the heel. The 84, the name, the
     tier tag and the box plate share one axis: the centre spot. */
  const RIMIN = 13; // keep-out inside the outline (the midsole rim)
  const LAY = (() => {
    const cy = 142;
    const ax = r1(midX(cy));
    // the box plate is centred on the axis; it is lifted and kept short rather than slid sideways
    const box = { y: 273, h: 52 };
    let half = 1e9;
    for (let y = box.y - 10; y <= box.y + box.h; y += 1) {
      const s = span(y);
      half = Math.min(half, ax - (s[0] + RIMIN), s[1] - RIMIN - ax);
    }
    box.w = r1(2 * half - 2);
    box.x = r1(ax - box.w / 2);
    return {
      ax,
      cir: { x: ax, y: cy, r: 70 },
      ovr: { fs: 92 },
      // no number yet: the dash sits above the groove when the tally hangs under it (up), else on
      // the centre spot; the tally hangs from the halfway groove: y below it, then slot and pitch
      dash: { w: 66, h: 14, r: 3.5, up: -20 },
      tally: { y: 6, h: 24, w: 9.5, pitch: 21 },
      nameY: 242,
      tagY: 246,
      tagH: 13,
      box,
      dR: 15,
      // the hood: scale, hood top, and its centre, off the axis toward the arch so only the far
      // shoulder goes under the arch rim; the shank step (the heel plate's front edge) runs
      // across below it and the torso tucks under it
      hood: { k: 0.64, top: 336, x: 140 },
      step: { y: 453, mid: 445 },
      wheel: { x: r1(midX(512)), y: 512, r: 18.5, ro: 25 },
      idY: 556,
      ctY: 568,
      crest: { x: r1(midX(600)), y: 601, w: 10.5 },
      season: [
        [134, 35],
        [164, 22],
        [194, 31],
      ],
    };
  })();

  /* ------------------------------------------------------------------ studs per tier */
  // The tangent of the outline nearest a point, in degrees (blades run along the edge).
  const edgeTangent = (x, y) => {
    let bi = 0,
      bd = 1e9;
    POLY.forEach((p, i) => {
      const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const n = POLY.length,
      a = POLY[(bi - 3 + n) % n],
      b = POLY[(bi + 3) % n];
    // the tangent that points toward the toe (up): the blade's narrow end leads
    let deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (Math.sin(deg * D2R) > 0) deg -= 180;
    if (deg < -180) deg += 360;
    return r1(deg);
  };
  const blade = ([x, y], i = 0) => ({ t: "blade", x, y, a: r1(edgeTangent(x, y) + i) });
  // keep-out zones for HOMA's nub field: [x0, y0, x1, y1]
  const ZONES = [
    [44, 210, 222, 264], // name and tier tag
    [LAY.box.x - 6, LAY.box.y - LAY.dR + 2, LAY.box.x + LAY.box.w + 6, LAY.box.y + LAY.box.h + 6], // box plate
    [LAY.hood.x - 68, 330, 230, 452], // hood in the shank
    [20, 436, 240, 464], // the shank step
    [88, 548, 170, 574], // style code and country
    [126, 12, 204, 42], // season mark
  ];
  const STUDS = {
    HOMA: (() => {
      const out = [];
      const p = 19.5,
        rr = 6;
      for (let row = 0, y = 26; y < 640; row++, y += p * 0.866) {
        for (let x = 18 + (row % 2 ? p / 2 : 0); x < 250; x += p) {
          if (!insideBy(x, y, 13)) continue;
          if (ZONES.some((z) => x > z[0] - rr && x < z[2] + rr && y > z[1] - rr && y < z[3] + rr))
            continue;
          if (Math.hypot(x - LAY.cir.x, y - LAY.cir.y) < LAY.cir.r + 8) continue;
          if (Math.hypot(x - LAY.wheel.x, y - LAY.wheel.y) < 46) continue;
          if (Math.hypot(x - LAY.crest.x, y - LAY.crest.y) < 13) continue;
          out.push({ t: "nub", x: r1(x), y: r1(y), r: rr });
        }
      }
      return out;
    })(),
    STADE: [
      Lx(50, 20),
      Rx(42, 24),
      Lx(62, 21),
      Lx(112, 16),
      Lx(162, 15),
      Lx(214, 16),
      Rx(68, 21),
      Rx(118, 16),
      Rx(168, 15),
      Rx(220, 16),
      Lx(244, 15),
      Rx(250, 15),
      Lx(530, 22),
      Rx(530, 22),
      Lx(604, 22),
      Rx(604, 22),
      [LAY.crest.x, 628],
    ].map(([x, y], i) => ({ t: "cone", x, y, r: i === 16 ? 8 : 9.2 })),
    PRO: [
      ...[Lx(72, 21), Lx(152, 17), Lx(232, 17), Rx(78, 21), Rx(158, 17), Rx(238, 17)].map((q) =>
        blade(q),
      ),
      ...[Lx(528, 24), Rx(528, 24), Lx(604, 24), Rx(604, 24)].map((q) => blade(q, 0)),
    ],
    CHAMPION: [
      ...[Lx(70, 23), Rx(76, 23), Lx(230, 21), Rx(236, 21), Lx(606, 27), Rx(606, 27)].map(
        ([x, y]) => ({ t: "steel", x, y, r: 11.5 }),
      ),
      ...[Lx(150, 16), Rx(156, 16), Lx(528, 24), Rx(528, 24)].map((q) => ({
        ...blade(q),
        steel: true,
      })),
    ],
    LEGEND: [Lx(84, -2), Rx(90, -2), Lx(236, -1), Rx(240, -1), Lx(584, 0), Rx(584, 0)].map(
      ([x, y]) => ({ t: "big", x, y, r: 16.5 }),
    ),
    // no tier yet: the plate's ten stud mounts, bare. Six in the forefoot, four in the heel.
    BASE: [
      Lx(72, 21),
      Lx(152, 17),
      Lx(232, 17),
      Rx(78, 21),
      Rx(158, 17),
      Rx(238, 17),
      Lx(528, 24),
      Rx(528, 24),
      Lx(604, 24),
      Rx(604, 24),
    ].map(([x, y]) => ({ t: "socket", x, y, r: 10.5 })),
  };

  /* ------------------------------------------------------------------ materials */
  const RIM = "#efe9dc";
  const NAVY = "#0c3164";
  const LOGO = "#0151fc";
  // plate gradient, ink (moulded type), inkTone, recess, stud [lit, mid, dark], tip (stud
  // face; null = stud colour), side (84 side wall), grain, gloss, part (mould line), tag,
  // yr (the ·26 after the name), tok/topTok (token plate and stud tops), seas (the season mark's
  // ink where the type ink would fall under 3:1 on the plate's dark edge: HOMA only; default: ink)
  const TIER = {
    HOMA: {
      // new gum rubber: honey, translucent, a crisp moulded edge
      plate: ["#d99a55", "#b8722f", "#86491a"],
      ink: "#2c1603",
      inkTone: "#4f2c0c",
      recess: "#5a2f08",
      stud: ["#efbd7a", "#c6843f", "#7c4515"],
      tip: null,
      side: "#6a3c10",
      grain: 0.2,
      gloss: 0.24,
      part: 0.34,
      tag: "#97571f",
      yr: "#5a2f08",
      seas: "#fff1d6",
      hi: "#ffeccc",
      tok: "#b8722f",
      topTok: "#eab774",
    },
    STADE: {
      // matte moulded rubber, round cones
      plate: ["#303338", "#1f2125", "#131417"],
      ink: "#ecebe6",
      inkTone: "#c4c2bc",
      recess: "#050506",
      stud: ["#aab0b8", "#555b63", "#15171a"],
      tip: null,
      side: "#8a9098",
      grain: 0.36,
      gloss: 0.03,
      part: 0.2,
      tag: "#2b2e33",
      yr: RIM,
      hi: "#ffffff",
      tok: "#202226",
      topTok: "#b3b9c1",
    },
    PRO: {
      // smoked translucent TPU: Logo Blue pulled 35% toward navy, frosted; Logo Blue only on the blade tips
      plate: ["#2d5bbd", "#0c3c98", "#061e55"],
      ink: "#f2f6ff",
      inkTone: "#c8d7ff",
      recess: "#020f33",
      stud: ["#3f66bb", "#0a2e7c", "#03153f"],
      tip: LOGO,
      side: "#7d9de6",
      grain: 0.26,
      gloss: 0.12,
      part: 0,
      tag: "#06276a",
      yr: RIM,
      hi: "#ffffff",
      tok: "#0c3c98",
      topTok: LOGO,
    },
    CHAMPION: {
      // carbon twill under clear coat, steel-tipped blades and screw-in steel
      plate: ["#30353d", "#1b1e24", "#0c0e11"],
      ink: "#f2f4f6",
      inkTone: "#c3c8ce",
      recess: "#040506",
      stud: ["#4a5059", "#22262c", "#07080a"],
      tip: "steel",
      side: "#9aa1ab",
      grain: 0.1,
      gloss: 0.46,
      part: 0,
      tag: "#2b3038",
      yr: RIM,
      hi: "#ffffff",
      tok: "#1b1e24",
      topTok: "#dfe4e8",
    },
    LEGEND: {
      // smoked clear plate over a machined steel pitch
      plate: ["#7590a0", "#566f7c", "#3e5561"],
      ink: "#0e1620",
      inkTone: "#26333f",
      recess: "#0e1620",
      stud: ["#ffffff", "#c4cbd3", "#5f6874"],
      tip: null,
      side: "#0e1620",
      grain: 0.08,
      gloss: 0.42,
      part: 0,
      tag: "#0e1620",
      yr: "#24313d",
      hi: "#ffffff",
      tok: "#8ca5b1",
      topTok: "#ffffff",
    },
    BASE: {
      // the raw sample plate before any rating: unpainted slate nylon, matte, a fine tooth. It
      // is no tier's material (the ladder runs honey, black, blue, carbon, ice), and it carries
      // no tier word. Its stud mounts are bare bosses in the plate's own tone.
      plate: ["#738395", "#505f70", "#36424f"],
      ink: "#f5f8fb",
      inkTone: "#d6dee7",
      recess: "#141d28",
      stud: ["#8a9aab", "#62738a", "#2b3541"],
      tip: null,
      side: "#9fb0c2",
      grain: 0.3,
      gloss: 0.08,
      part: 0,
      tag: "#3a4755",
      yr: "#f5f8fb",
      hi: "#ffffff",
      tok: "#505f70",
      topTok: "#8798a9",
    },
  };
  const STEEL = [
    [0, "#fbfcfd"],
    [0.16, "#c9d0d8"],
    [0.32, "#7f8a97"],
    [0.47, "#eef2f6"],
    [0.6, "#aab3bd"],
    [0.76, "#59636f"],
    [0.9, "#cfd6dd"],
    [1, "#f4f6f8"],
  ];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) =>
    "#" +
    hex(a)
      .map((v, i) =>
        Math.round(v + (hex(b)[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const stops = (a, op = 1) =>
    a
      .map(
        ([o, c]) =>
          `<stop offset="${o}" stop-color="${c}"${op < 1 ? ` stop-opacity="${op}"` : ""}/>`,
      )
      .join("");

  // A precomputed fine grain (frost on TPU, tooth on rubber): two seeded dot tiles of
  // different sizes laid over each other so the repeat never lines up. No noise filter.
  const GRAIN = (() => {
    let s = 20261;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const tile = (w, n) => {
      let lt = "",
        dk = "";
      for (let i = 0; i < n; i++) {
        const c = `<circle cx="${r1(rnd() * w)}" cy="${r1(rnd() * w)}" r="${r2(0.14 + rnd() * 0.22)}"/>`;
        if (i % 2) lt += c;
        else dk += c;
      }
      return { lt, dk, w };
    };
    return [tile(13, 64), tile(9.1, 30)];
  })();

  /** Delays (ms) that seat a list of studs one by one from the toe to the heel (by height on the
      plate), spread over `spread` ms in all. */
  const seatDelays = (list, spread = 380) => {
    const d = [];
    list
      .map((q, i) => [q.y, q.x, i])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .forEach((q, k) => (d[q[2]] = Math.round((k * spread) / Math.max(1, list.length - 1))));
    return d;
  };

  /* ------------------------------------------------------------------ stud drawing */
  // A firm-ground blade: a tapered bar, 25 long, 8.4 wide at the heel end, 5.2 at the toe end.
  const BLADE = "M-13.7 -5L10.6 -3.1Q14.9 0 10.6 3.1L-13.7 5Q-16.8 0 -13.7 -5Z";
  const BLADE_TOP = "M-11.8 -3L9.1 -1.7Q11.8 0 9.1 1.7L-11.8 3Q-13.9 0 -11.8 -3Z";
  /**
   * One stud, as two layers: its cast shadow (collected and blurred once) and its body (a side
   * wall from stacked copies, then the lit top face).
   */
  function stud(u, s, P, X, det) {
    const x = r1(X(s.x)),
      y = s.y;
    const ar = X(0) !== 0;
    const sh = [],
      body = [];
    const walls = (n, shape) => {
      for (let i = n; i >= 1; i--)
        body.push(shape(r1(0.6 * i), r1(1.0 * i), mix(P.stud[2], "#000000", 0.08 * i)));
    };
    if (s.t === "nub") {
      sh.push(`<circle cx="${r1(x + 2.4)}" cy="${r1(y + 4)}" r="${s.r}"/>`);
      if (det)
        walls(
          3,
          (dx, dy, c) => `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${s.r}" fill="${c}"/>`,
        );
      body.push(`<circle cx="${x}" cy="${y}" r="${s.r}" fill="url(#${u}-nub)"/>`);
      if (det)
        body.push(
          `<circle cx="${r1(x - 0.4)}" cy="${r1(y - 0.6)}" r="${r1(s.r * 0.5)}" fill="${P.stud[0]}" opacity=".8"/><circle cx="${r1(x - s.r * 0.36)}" cy="${r1(y - s.r * 0.4)}" r="${r1(s.r * 0.26)}" fill="#fff8ea" opacity=".75"/>`,
        );
      return { sh, body };
    }
    if (s.t === "cone" || s.t === "round") {
      const cone = s.t === "cone";
      const top = s.r * (cone ? 0.5 : 0.78);
      sh.push(`<circle cx="${r1(x + 3)}" cy="${r1(y + 5)}" r="${s.r}"/>`);
      if (det)
        walls(
          4,
          (dx, dy, c) => `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${s.r}" fill="${c}"/>`,
        );
      body.push(`<circle cx="${x}" cy="${y}" r="${s.r}" fill="url(#${u}-cone)"/>`);
      body.push(
        `<circle cx="${r1(x - 0.5)}" cy="${r1(y - 0.8)}" r="${r1(top)}" fill="${P.tip ? P.tip : `url(#${u}-top)`}"/>`,
      );
      if (det)
        body.push(
          `<path d="M${r1(x - 0.5 - top * 0.8)} ${r1(y - 0.8 - top * 0.1)}A${r1(top * 0.82)} ${r1(top * 0.82)} 0 0 1 ${r1(x - 0.5 + top * 0.1)} ${r1(y - 0.8 - top * 0.8)}" stroke="#fff" stroke-width=".8" fill="none" stroke-linecap="round" opacity="${cone ? 0.45 : 0.7}"/>`,
        );
      return { sh, body };
    }
    if (s.t === "blade") {
      const a = ar ? 180 - s.a : s.a; // the left boot mirrors the angle, not the light
      const g = (d, dx, dy, fill, extra = "") =>
        `<path d="${d}" transform="translate(${r1(x + dx)} ${r1(y + dy)}) rotate(${a})" fill="${fill}"${extra}/>`;
      sh.push(g(BLADE, 3, 5, "#000"));
      if (det) walls(4, (dx, dy, c) => g(BLADE, dx, dy, c));
      body.push(g(BLADE, 0, 0, `url(#${u}-cone)`));
      body.push(g(BLADE_TOP, -0.5, -0.8, s.steel ? `url(#${u}-steel)` : P.tip || `url(#${u}-top)`));
      if (det)
        body.push(
          g(
            BLADE_TOP,
            -0.9,
            -1.3,
            "none",
            ` stroke="#fff" stroke-width=".7" opacity="${s.steel ? 0.8 : 0.6}"`,
          ),
        );
      return { sh, body };
    }
    if (s.t === "socket") {
      // a bare mount: a low boss in the plate's own tone with its bore open and nothing fitted
      const r = s.r;
      const ring = (a0, a1, k) =>
        `M${r1(x + Math.cos(a0 * D2R) * r * k)} ${r1(y + Math.sin(a0 * D2R) * r * k)}A${r1(r * k)} ${r1(r * k)} 0 0 1 ${r1(x + Math.cos(a1 * D2R) * r * k)} ${r1(y + Math.sin(a1 * D2R) * r * k)}`;
      sh.push(`<circle cx="${r1(x + 2.2)}" cy="${r1(y + 3.4)}" r="${r}"/>`);
      if (det)
        walls(
          2,
          (dx, dy, c) => `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${r}" fill="${c}"/>`,
        );
      body.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}-nub)"/>`);
      body.push(
        `<path d="${ring(190, 280, 0.82)}" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round" opacity=".5"/>`,
      );
      body.push(
        `<circle cx="${x}" cy="${y}" r="${r1(r * 0.5)}" fill="${P.recess}"/><path d="${ring(20, 100, 0.5)}" stroke="#fff" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".35"/>`,
      );
      return { sh, body };
    }
    // steel: a screw-in stud on a moulded boss
    const big = s.t === "big";
    const r = s.r;
    const boss = r + (big ? 4 : 3.2);
    sh.push(`<circle cx="${r1(x + 3)}" cy="${r1(y + 5)}" r="${r1(boss)}"/>`);
    body.push(
      `<circle cx="${x}" cy="${y}" r="${r1(boss)}" fill="${big ? `url(#${u}-boss)` : P.stud[2]}"/>`,
    );
    if (det)
      for (let i = 4; i >= 1; i--)
        body.push(
          `<circle cx="${r1(x + 0.6 * i)}" cy="${r1(y + 1.0 * i)}" r="${r}" fill="${mix("#59636f", "#000000", 0.1 * i)}"/>`,
        );
    body.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}-steel)"/>`);
    body.push(`<circle cx="${x}" cy="${y}" r="${r1(r * 0.64)}" fill="url(#${u}-face)"/>`);
    if (det) {
      body.push(
        `<g fill="none" stroke="#fff" stroke-width=".35" opacity=".4">` +
          [0.2, 0.32, 0.44, 0.56]
            .map((k) => `<circle cx="${x}" cy="${y}" r="${r1(r * k)}"/>`)
            .join("") +
          `</g>`,
      );
      body.push(
        `<path d="M${r1(x - r * 0.78)} ${r1(y - r * 0.3)}A${r1(r * 0.84)} ${r1(r * 0.84)} 0 0 1 ${r1(x + r * 0.2)} ${r1(y - r * 0.82)}" stroke="#fff" stroke-width="${big ? 1.8 : 1.3}" fill="none" stroke-linecap="round" opacity=".95"/>`,
      );
    }
    body.push(
      `<circle cx="${x}" cy="${y}" r="${r1(r * 0.64)}" fill="none" stroke="#3d4650" stroke-width=".6" opacity=".7"/>`,
    );
    body.push(
      `<circle cx="${r1(x - r * 0.3)}" cy="${r1(y - r * 0.32)}" r="${r1(r * 0.16)}" fill="#fff"/>`,
    );
    return { sh, body };
  }

  /* ------------------------------------------------------------------ defs */
  function defs(u, t, P, G, det) {
    const cis = ' color-interpolation-filters="sRGB"';
    let d =
      `<clipPath id="${u}-cl"><path d="${G.D}"/></clipPath>` +
      `<linearGradient id="${u}-lip" gradientUnits="userSpaceOnUse" x1="0" y1="-6" x2="0" y2="22"><stop offset="0" stop-color="${t === "HOMA" ? "#b88f5a" : "#b3a78d"}"/><stop offset="1" stop-color="#ebe3d1"/></linearGradient>` +
      `<linearGradient id="${u}-pl" x1="0" y1="0" x2="1" y2=".32"><stop offset="0" stop-color="${P.plate[0]}"/><stop offset=".5" stop-color="${P.plate[1]}"/><stop offset="1" stop-color="${P.plate[2]}"/></linearGradient>` +
      (t === "LEGEND"
        ? `<linearGradient id="${u}-rim" x1="0" y1="0" x2="1" y2=".4">${stops([
            [0, "#ffffff"],
            [0.22, "#b7bfc8"],
            [0.42, "#f1f4f6"],
            [0.66, "#8b95a0"],
            [0.85, "#dfe4e8"],
            [1, "#a7b0ba"],
          ])}</linearGradient>`
        : `<linearGradient id="${u}-rim" x1="0" y1="0" x2="1" y2=".5"><stop offset="0" stop-color="#fbf8f1"/><stop offset=".55" stop-color="${RIM}"/><stop offset="1" stop-color="#d8cfbc"/></linearGradient>`) +
      `<radialGradient id="${u}-nub" cx=".36" cy=".32" r=".72"><stop offset="0" stop-color="${P.stud[0]}"/><stop offset=".6" stop-color="${P.stud[1]}"/><stop offset="1" stop-color="${mix(P.stud[1], P.stud[2], 0.5)}"/></radialGradient>` +
      `<linearGradient id="${u}-cone" x1=".1" y1=".05" x2=".85" y2=".95"><stop offset="0" stop-color="${mix(P.stud[0], P.stud[1], 0.35)}"/><stop offset=".55" stop-color="${P.stud[1]}"/><stop offset="1" stop-color="${P.stud[2]}"/></linearGradient>` +
      `<radialGradient id="${u}-top" cx=".38" cy=".34" r=".8"><stop offset="0" stop-color="${mix(P.stud[0], P.stud[1], 0.25)}"/><stop offset="1" stop-color="${mix(P.stud[0], P.stud[1], 0.7)}"/></radialGradient>` +
      `<linearGradient id="${u}-steel" x1="0" y1="0" x2="1" y2="1">${stops(STEEL)}</linearGradient>` +
      `<radialGradient id="${u}-face" cx=".4" cy=".36" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#d3d9df"/><stop offset="1" stop-color="#8f99a5"/></radialGradient>` +
      `<radialGradient id="${u}-boss" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#8a939e"/><stop offset=".7" stop-color="#3c434c"/><stop offset="1" stop-color="#1c2026"/></radialGradient>` +
      `<radialGradient id="${u}-dial" cx=".38" cy=".34" r=".8"><stop offset="0" stop-color="${mix(P.plate[0], P.plate[1], 0.3)}"/><stop offset="1" stop-color="${mix(P.plate[1], P.plate[2], 0.35)}"/></radialGradient>` +
      `<linearGradient id="${u}-ov" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${mix(P.ink, "#ffffff", 0.2)}"/><stop offset="1" stop-color="${mix(P.ink, P.plate[1], 0.1)}"/></linearGradient>` +
      // the plate's curvature catching the light along its upper-left edge
      `<linearGradient id="${u}-sp" x1="0" y1="0" x2="1" y2=".7"><stop offset="0" stop-color="#fff" stop-opacity="${P.gloss}"/><stop offset=".42" stop-color="#fff" stop-opacity="${r2(P.gloss * 0.3)}"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      // toe spring: the toe curls away from the viewer, so it darkens toward the tip
      `<linearGradient id="${u}-ts" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="96"><stop offset="0" stop-color="#000" stop-opacity="${t === "LEGEND" ? 0.18 : 0.3}"/><stop offset=".55" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      GRAIN.map(
        (g, i) =>
          `<pattern id="${u}-g${i}" width="${g.w}" height="${g.w}" patternUnits="userSpaceOnUse"${i ? ' patternTransform="rotate(31)"' : ""}><g fill="#fff" opacity=".7">${g.lt}</g><g fill="#000" opacity=".8">${g.dk}</g></pattern>`,
      ).join("");
    if (t === "CHAMPION") {
      // 2/2 twill: each 3-unit cell is a tow running across or along; the step makes the diagonal
      let cells = "";
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const across = (c + r) % 4 < 2;
          cells += `<rect x="${c * 3}" y="${r * 3}" width="3" height="3" fill="url(#${u}-${across ? "th" : "tv"})"/>`;
        }
      d +=
        `<linearGradient id="${u}-th" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101216"/><stop offset=".5" stop-color="#3d434d"/><stop offset="1" stop-color="#101216"/></linearGradient>` +
        `<linearGradient id="${u}-tv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0b0e"/><stop offset=".5" stop-color="#272b32"/><stop offset="1" stop-color="#0a0b0e"/></linearGradient>` +
        `<pattern id="${u}-tw" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">${cells}</pattern>`;
    }
    if (t === "LEGEND") {
      d +=
        `<linearGradient id="${u}-ch" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".42" stop-color="#c9d0d8"/><stop offset=".7" stop-color="#7f8a97"/><stop offset="1" stop-color="#3d4650"/></linearGradient>` +
        `<linearGradient id="${u}-nf" x1="0" y1="0" x2=".18" y2="1"><stop offset="0" stop-color="#f6f8fa"/><stop offset=".4" stop-color="#dde2e7"/><stop offset=".52" stop-color="#a9b3bd"/><stop offset=".6" stop-color="#e9edf1"/><stop offset="1" stop-color="#c2c9d1"/></linearGradient>` +
        (det
          ? `<filter id="${u}-ns" x="-15%" y="-15%" width="130%" height="140%"${cis}><feGaussianBlur stdDeviation="1.8"/></filter>`
          : "") +
        `<linearGradient id="${u}-wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b949e"/><stop offset=".35" stop-color="#d9dee3"/><stop offset=".6" stop-color="#6f7984"/><stop offset="1" stop-color="#b9c1c9"/></linearGradient>` +
        `<pattern id="${u}-brush" width="40" height="1.3" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><rect width="40" height=".45" fill="#fff" opacity=".32"/><rect y=".8" width="40" height=".3" fill="#2a3138" opacity=".18"/></pattern>`;
    }
    if (det) {
      d +=
        `<filter id="${u}-bl" x="-5%" y="-5%" width="110%" height="110%"${cis}><feGaussianBlur stdDeviation="5"/></filter>` +
        `<filter id="${u}-sb" x="-5%" y="-5%" width="110%" height="110%"${cis}><feGaussianBlur stdDeviation="2"/></filter>` +
        `<filter id="${u}-s1" x="-5%" y="-5%" width="110%" height="110%"${cis}><feGaussianBlur stdDeviation="1.4"/></filter>` +
        // mould parting line, 15 units inside the edge
        `<mask id="${u}-pm" maskUnits="userSpaceOnUse" x="-10" y="-20" width="290" height="690"><path d="${G.D}" fill="none" stroke="#fff" stroke-width="31.2"/><path d="${G.D}" fill="none" stroke="#000" stroke-width="29.6"/></mask>` +
        // the band of a clear plate's thickness seen through its edge (PRO TPU, LEGEND ice)
        `<mask id="${u}-rf" maskUnits="userSpaceOnUse" x="-10" y="-20" width="290" height="690"><path d="${G.D}" fill="none" stroke="#fff" stroke-width="${t === "PRO" ? 22 : 23.4}"/><path d="${G.D}" fill="none" stroke="#000" stroke-width="${t === "PRO" ? 20.4 : 21}"/></mask>`;
    }
    return `<defs>${d}</defs>`;
  }

  /* ------------------------------------------------------------------ pitch geometry */
  /** The engraved pitch: centre circle, halfway line (the flex groove), the box's D. LEGEND
      draws the same lines as a machined steel chassis seen through the clear plate. */
  function pitchLines(G) {
    const X = G.X;
    const { x: cx, y: cy, r } = LAY.cir;
    const hs = span(cy);
    const b = LAY.box;
    const bx = X(b.x + b.w / 2);
    const dr = LAY.dR;
    // the D: the part of a circle round the penalty spot that sits outside the box
    const dy = b.y + 7; // the spot sits just inside the box edge
    const half = Math.sqrt(dr * dr - (dy - b.y) ** 2);
    return {
      circle: `M${r1(X(cx) - r)} ${cy}A${r} ${r} 0 1 0 ${r1(X(cx) + r)} ${cy}A${r} ${r} 0 1 0 ${r1(X(cx) - r)} ${cy}Z`,
      half: `M${r1(X(hs[0] + 4))} ${cy}L${r1(X(hs[1] - 4))} ${cy}`,
      d: `M${r1(bx - half)} ${b.y}A${dr} ${dr} 0 0 1 ${r1(bx + half)} ${b.y}`,
      box: `M${r1(X(b.x))} ${b.y}H${r1(X(b.x + b.w))}V${b.y + b.h}H${r1(X(b.x))}Z`,
    };
  }

  /** The blank number field: until a rating exists the centre circle is a shallow dish, its
      upper-left wall in shadow and its lower-right wall lit, waiting for the figure. */
  function numberField(u, P, G, det, t) {
    const { x, y, r } = LAY.cir;
    const cx = G.X(x);
    const rr = r - 5;
    const arc = (a0, a1) =>
      `M${r1(cx + Math.cos(a0 * D2R) * rr)} ${r1(y + Math.sin(a0 * D2R) * rr)}A${rr} ${rr} 0 0 1 ${r1(cx + Math.cos(a1 * D2R) * rr)} ${r1(y + Math.sin(a1 * D2R) * rr)}`;
    let s = `<circle cx="${cx}" cy="${y}" r="${rr}" fill="${P.recess}" opacity="${det ? 0.22 : 0.18}"/>`;
    s += `<path d="${arc(196, 286)}" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" opacity=".3"/>`;
    s += `<path d="${arc(16, 106)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="${t === "HOMA" ? 0.5 : 0.24}"/>`;
    return s;
  }

  function grooves(u, P, G, det, t) {
    const L = pitchLines(G);
    const dk = t === "HOMA" ? mix(P.plate[2], "#000000", 0.35) : mix(P.recess, "#000000", 0.2);
    const lt = t === "HOMA" ? "#ffe2b0" : "#ffffff";
    const lo = t === "HOMA" ? 0.5 : t === "STADE" ? 0.16 : 0.24;
    const g = (d, w) =>
      `<path d="${d}" fill="none" stroke="${lt}" stroke-width="${w}" opacity="${lo}" transform="translate(.6 .9)"/>` +
      `<path d="${d}" fill="none" stroke="${dk}" stroke-width="${w}" opacity=".85"/>`;
    // the halfway line runs edge to edge through the forefoot, exactly where the plate flexes
    return `<g clip-path="url(#${u}-cl)" stroke-linecap="round">${g(L.half, 2.6)}${g(L.circle, 2.2)}${g(L.d, 2)}</g>`;
  }

  /** The box: a raised moulded plate in the plate's own material, its pitch line engraved. */
  function boxPlate(u, P, G, det, t) {
    const L = pitchLines(G);
    const b = LAY.box;
    const x = r1(G.X(G.ar ? b.x + b.w : b.x));
    const rr = `x="${x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3"`;
    let s = "";
    s += `<rect ${rr} fill="#000" opacity="${t === "HOMA" ? 0.18 : 0.35}" transform="translate(1.1 1.7)"${det ? ` filter="url(#${u}-s1)"` : ""}/>`;
    s += `<rect ${rr} fill="${mix(P.plate[1], P.plate[0], t === "STADE" ? 0.25 : 0.12)}"/>`;
    if (t === "CHAMPION") s += `<rect ${rr} fill="url(#${u}-tw)" opacity=".85"/>`;
    s += `<rect ${rr} fill="url(#${u}-g0)" opacity="${r2(P.grain * 0.8)}"/>`;
    // 1-unit lit edge top-left, dark edge bottom-right
    s += `<path d="M${x} ${b.y + b.h}V${b.y + 3}Q${x} ${b.y} ${r1(x + 3)} ${b.y}H${r1(x + b.w - 3)}" fill="none" stroke="#fff" stroke-width=".9" opacity="${t === "HOMA" ? 0.55 : 0.3}"/>`;
    s += `<path d="M${r1(x + b.w)} ${b.y + 3}V${b.y + b.h - 3}Q${r1(x + b.w)} ${b.y + b.h} ${r1(x + b.w - 3)} ${b.y + b.h}H${x}" fill="none" stroke="#000" stroke-width=".9" opacity=".45"/>`;
    // the white pitch line, engraved round the plate 3 units in
    const inner = `x="${r1(x + 3.2)}" y="${b.y + 3.2}" width="${r1(b.w - 6.4)}" height="${r1(b.h - 6.4)}" rx="1"`;
    const dk = t === "HOMA" ? mix(P.plate[2], "#000000", 0.35) : mix(P.recess, "#000000", 0.2);
    s += `<rect ${inner} fill="none" stroke="${t === "HOMA" ? "#ffe2b0" : "#fff"}" stroke-width="1.4" opacity="${t === "HOMA" ? 0.5 : 0.2}" transform="translate(.5 .7)"/>`;
    s += `<rect ${inner} fill="none" stroke="${dk}" stroke-width="1.4" opacity=".7"/>`;
    void L;
    return s;
  }

  /* LEGEND's chassis: the same pitch, machined in brushed steel, under the smoked clear plate. */
  function chassis(u, G, det, clock) {
    const L = pitchLines(G);
    const b = LAY.box;
    const bx = r1(G.X(G.ar ? b.x + b.w : b.x));
    const bosses = STUDS.LEGEND.map(
      (st) => `<circle cx="${r1(G.X(st.x))}" cy="${st.y}" r="${st.r + 9}"/>`,
    ).join("");
    const wh = `<circle cx="${G.X(LAY.wheel.x)}" cy="${LAY.wheel.y}" r="${LAY.wheel.ro + 9}" fill="none" stroke-width="7"/>`;
    const lines = (stroke, extra = "") =>
      `<g fill="none" stroke="${stroke}" stroke-linecap="round"${extra}>` +
      `<path d="${L.half}" stroke-width="9"/><path d="${L.circle}" stroke-width="7"/>` +
      // the box frame and its D hold the stats; the thumb drops the stats, so it drops the frame too
      (det
        ? `<path d="${L.d}" stroke-width="5"/><rect x="${bx}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" stroke-width="6"/>`
        : "") +
      (clock ? wh.replace(' fill="none"', "") : "") +
      `</g>`;
    let s = "";
    s += `<g opacity=".5" transform="translate(2 3.5)">${lines("#16202a")}<g fill="#16202a">${bosses}</g></g>`;
    s += lines(`url(#${u}-steel)`);
    s += `<g fill="url(#${u}-steel)">${bosses}</g>`;
    if (det) {
      s += lines(`url(#${u}-brush)`);
      s += `<g fill="url(#${u}-brush)">${bosses}</g>`;
      s += `<path d="${L.half}" stroke="#fff" stroke-width="1.6" opacity=".55" transform="translate(0 -2.6)"/>`;
    }
    return s;
  }

  /* ------------------------------------------------------------------ founder year clock */
  /* An injection-moulding date clock, as every moulded part carries: a dial raised 1.5 in the
     plate's own material, the years of the mould round it from 26, an arrow on the year the
     account was made. A founder's clock is set in a machined steel insert ring. */
  function yearClock(u, P, G, founder, det, t) {
    const { y, r, ro } = LAY.wheel;
    const x = G.X(LAY.wheel.x);
    const ink = P.ink;
    let s = "";
    if (founder) {
      const rm = (ro + r) / 2;
      s += `<circle cx="${x}" cy="${y}" r="${ro + 1.6}" fill="${P.recess}" opacity=".85"/>`;
      s += `<circle cx="${r1(x + 1)}" cy="${r1(y + 1.6)}" r="${ro}" fill="#000" opacity=".45"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${r2(rm)}" fill="none" stroke="url(#${u}-steel)" stroke-width="${r2(ro - r)}"/>`;
      if (det) {
        s +=
          `<g fill="none" stroke-width=".3">` +
          [1.3, 2.5, 3.7, 4.9]
            .map(
              (k, i) =>
                `<circle cx="${x}" cy="${y}" r="${r2(r + k)}" stroke="${i % 2 ? "#2a3138" : "#fff"}" opacity="${i % 2 ? 0.25 : 0.45}"/>`,
            )
            .join("") +
          `</g>`;
        const a0 = 200 * D2R,
          a1 = 258 * D2R;
        s += `<path d="M${r1(x + Math.cos(a0) * rm)} ${r1(y + Math.sin(a0) * rm)}A${r2(rm)} ${r2(rm)} 0 0 1 ${r1(x + Math.cos(a1) * rm)} ${r1(y + Math.sin(a1) * rm)}" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      }
      s += `<circle cx="${x}" cy="${y}" r="${ro}" fill="none" stroke="#3d4650" stroke-width=".6"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${r + 0.3}" fill="none" stroke="#2a3038" stroke-width=".9"/>`;
    } else {
      s += `<circle cx="${x}" cy="${y}" r="${r + 2.4}" fill="none" stroke="${P.recess}" stroke-width="1.6" opacity=".55"/>`;
    }
    // the dial, raised 1.5: its cast edge, its face, a 1-unit lit rim at the upper-left
    s += `<circle cx="${r1(x + 0.9)}" cy="${r1(y + 1.3)}" r="${r}" fill="${P.recess}" opacity=".85"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}-dial)"/>`;
    if (t === "CHAMPION")
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${u}-tw)" opacity=".5"/>`;
    const b0 = 185 * D2R,
      b1 = 290 * D2R,
      rh = r - 0.6;
    s += `<path d="M${r1(x + Math.cos(b0) * rh)} ${r1(y + Math.sin(b0) * rh)}A${rh} ${rh} 0 0 1 ${r1(x + Math.cos(b1) * rh)} ${r1(y + Math.sin(b1) * rh)}" stroke="${P.hi}" stroke-width=".9" fill="none" stroke-linecap="round" opacity="${t === "HOMA" ? 0.7 : 0.45}"/>`;
    // the mould's years round the dial, 26 at the top (toward the toe), clockwise
    if (det) {
      let yrs = "";
      for (let k = 0; k < 6; k++) {
        const a = (-90 + k * 60) * D2R;
        const nx = r1(x + Math.cos(a) * r * 0.68),
          ny = r1(y + Math.sin(a) * r * 0.68 + 1.9);
        yrs += `<text x="${nx}" y="${ny}" font-size="${k ? 4.9 : 5.6}" text-anchor="middle" direction="ltr" fill="${ink}" opacity="${k ? 0.55 : 1}" class="c05v2-yr">${26 + k}</text>`;
      }
      s += yrs;
    } else {
      for (let k = 1; k < 6; k++) {
        const a = (-90 + k * 60) * D2R;
        s += `<circle cx="${r1(x + Math.cos(a) * r * 0.68)}" cy="${r1(y + Math.sin(a) * r * 0.68)}" r="1.1" fill="${ink}" opacity=".5"/>`;
      }
    }
    // the arrow, raised, on 26
    const tip = y - r * 0.36,
      tail = y + r * 0.46;
    const arrow = (dx, dy, col, op) =>
      `<g transform="translate(${dx} ${dy})" opacity="${op}"><path d="M${x} ${r1(tail)}V${r1(tip + 3.4)}" stroke="${col}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M${r1(x - 3.4)} ${r1(tip + 4.2)}L${x} ${r1(tip)}L${r1(x + 3.4)} ${r1(tip + 4.2)}Z" fill="${col}"/><circle cx="${x}" cy="${y}" r="2.6" fill="${col}"/></g>`;
    if (det) s += arrow(0.5, 0.8, P.recess, 0.6);
    s += arrow(0, 0, ink, 1);
    if (det)
      s += `<circle cx="${r1(x - 0.6)}" cy="${r1(y - 0.7)}" r=".9" fill="${P.hi}" opacity=".7"/>`;
    return s;
  }

  /* ------------------------------------------------------------------ the hood in the shank */
  /* The shared figure, hood up, moulded into the arch shank as low relief in the plate's own
     material: 12% darker, a lit rim at the upper-left, a shadow edge at the lower-right, the hood
     seam and the jacket's yoke seams pressed in. It stands off the axis toward the arch: the
     whole hood, its peak and its centre seam stay inside the plate, and only the far shoulder
     runs under the arch rim. Below it the shank steps up to the heel plate, and the torso tucks
     under that moulded ledge. It is part of the plate surface, so it is drawn before the rim. */
  const stepCurve = (G) => {
    const { y, mid } = LAY.step;
    const sp = span(y);
    const l = sp[0] - 4,
      r = sp[1] + 4;
    const X = G.X;
    return {
      y,
      d: `M${r1(X(l))} ${y}Q${r1(X((l + r) / 2))} ${2 * mid - y} ${r1(X(r))} ${y}`,
      above: `M${r1(X(l))} ${y}Q${r1(X((l + r) / 2))} ${2 * mid - y} ${r1(X(r))} ${y}V290H${r1(X(l))}Z`,
    };
  };
  function hoodRelief(u, P, G, det, t) {
    const h = LAY.hood;
    const k = h.k;
    const aw = 200 * k,
      ah = 240 * k;
    const bx = r1(G.X(h.x) - aw / 2);
    const by = r1(h.top - 58 * k);
    const fill = mix(P.plate[1], "#000000", 0.12);
    const fig = (col, seam, dx = 0, dy = 0, op = 1) =>
      `<g transform="translate(${dx} ${dy})" opacity="${op}">${MC.avatar({ x: bx, y: by, w: r1(aw), h: r1(ah), hood: true, torso: col, hoodFill: col, seam, preserve: "xMidYMin meet" })}</g>`;
    const st = stepCurve(G);
    const homa = t === "HOMA";
    let s = `<clipPath id="${u}-hc"><path d="${st.above}"/></clipPath>`;
    s += `<g clip-path="url(#${u}-hc)">`;
    // the lit rim (upper-left), the shadow edge (lower-right), the 12% darker body, the seams
    s += fig(P.hi, false, -0.9, -1.1, homa ? 0.78 : 0.62);
    s += fig(P.recess, false, 0.9, 1.2, homa ? 0.5 : 0.65);
    s += fig(fill, det ? mix(fill, "#000000", homa ? 0.3 : 0.45) : false);
    if (det) s += fig("none", mix(fill, "#ffffff", homa ? 0.35 : 0.28), 0.5, 0.7, 0.55);
    s += `</g>`;
    // the shank step: a soft occlusion where the torso goes under, the crease, the lit face of
    // the heel plate rising toward the light
    s += `<path d="${st.d}" fill="none" stroke="#000" stroke-width="7" opacity="${homa ? 0.07 : 0.12}" transform="translate(0 -3.2)"/>`;
    s += `<path d="${st.d}" fill="none" stroke="#000" stroke-width="3.4" opacity="${homa ? 0.1 : 0.16}" transform="translate(0 -1.5)"/>`;
    s += `<path d="${st.d}" fill="none" stroke="${P.recess}" stroke-width="1.5" opacity=".9"/>`;
    s += `<path d="${st.d}" fill="none" stroke="${P.hi}" stroke-width="2.2" opacity="${homa ? 0.55 : t === "STADE" ? 0.22 : 0.34}" transform="translate(0 1.7)"/>`;
    return s;
  }

  /* ------------------------------------------------------------------ the sole */
  function solid(u, t, P, p, G, full, thumb, beat) {
    const X = G.X;
    const det = full && !thumb;
    let g = "";
    if (t === "LEGEND") {
      // visible thickness: the side wall of the plate, lit from the top-left
      for (let k = 9; k >= 1; k--)
        g += `<path d="${G.D}" fill="url(#${u}-wall)" stroke="url(#${u}-wall)" stroke-width="12" transform="translate(${r1(k * 0.45)} ${r1(k * 1.05)})"/>`;
      g += `<path d="${G.D}" fill="none" stroke="#3a424b" stroke-width="12.6" transform="translate(4 9.4)"/>`;
    }
    if (t === "PRO" && det) {
      // the TPU plate's own thickness, seen at the lower-right edge
      for (let k = 4; k >= 1; k--)
        g += `<path d="${G.D}" fill="${mix("#052a74", "#000000", 0.1 * k)}" transform="translate(${r1(k * 0.3)} ${r1(k * 0.6)})"/>`;
    }
    g += `<path d="${G.D}" fill="url(#${u}-pl)"/>`;
    g += `<g clip-path="url(#${u}-cl)">`;
    if (t === "CHAMPION") {
      g += `<rect x="0" y="0" width="270" height="660" fill="url(#${u}-tw)"/>`;
      // the clear coat's gloss: one broad diagonal sheen and a thin echo
      g += `<path d="M-20 300L290 40L290 110L-20 370Z" fill="#fff" opacity=".07"/><path d="M-20 392L290 132L290 140L-20 400Z" fill="#fff" opacity=".09"/>`;
    }
    if (t === "LEGEND") {
      // the chassis ring is the founder clock's seat: only a founder's plate (or the gallery's) has it
      g += chassis(u, G, det, p.founder || !onbMode(p));
      // the smoked "ice" plate over the chassis, with the hard reflections of thick clear plastic
      g += `<path d="${G.D}" fill="#9fb8c4" fill-opacity=".42"/>`;
      g += `<path d="M-20 330L290 110L290 142L-20 362Z" fill="#fff" opacity=".12"/><path d="M-20 374L290 154L290 162L-20 382Z" fill="#fff" opacity=".09"/><path d="M-20 610L290 470L290 482L-20 622Z" fill="#fff" opacity=".07"/>`;
    }
    // grain: frost on TPU, tooth on rubber, almost nothing under clear coat
    g += `<rect x="-10" y="-10" width="290" height="670" fill="url(#${u}-g0)" opacity="${P.grain}"/>`;
    if (det)
      g += `<rect x="-10" y="-10" width="290" height="670" fill="url(#${u}-g1)" opacity="${r2(P.grain * 0.7)}"/>`;
    if (t === "PRO") g += `<path d="${G.D}" fill="#cfe0ff" opacity=".05"/>`; // the frost on smoked TPU
    if (t === "HOMA") {
      // gum rubber is translucent: it glows where it is thick and darkens at the edge
      g += `<ellipse cx="${X(131)}" cy="190" rx="90" ry="150" fill="#ffd690" opacity=".2"/><ellipse cx="${X(129)}" cy="540" rx="60" ry="80" fill="#ffd690" opacity=".14"/>`;
    }
    // the hood relief and the shank step are moulded into the plate surface, under the rim
    if (!thumb) g += hoodRelief(u, P, G, det, t);
    if (det) {
      if (P.part)
        g += `<rect x="-10" y="-10" width="290" height="670" fill="#fff" opacity="${P.part}" mask="url(#${u}-pm)"/>`;
      g += `<path d="${G.D}" fill="none" stroke="#000" stroke-opacity="${t === "LEGEND" ? 0.22 : t === "HOMA" ? 0.3 : 0.38}" stroke-width="30" filter="url(#${u}-bl)"/>`;
      if (t === "PRO")
        g += `<rect x="-10" y="-10" width="290" height="670" fill="#6f98f0" opacity=".55" mask="url(#${u}-rf)"/>`;
    }
    // toe spring
    g += `<rect x="-10" y="-10" width="290" height="120" fill="url(#${u}-ts)"/>`;
    if (det)
      g += `<path d="M${X(34)} 92Q${X(131)} 62 ${X(232)} 86" fill="none" stroke="#fff" stroke-width="5" opacity="${r2(0.05 + P.gloss * 0.12)}" filter="url(#${u}-s1)"/>`;
    if (p.ovr == null && t !== "LEGEND") g += numberField(u, P, G, det, t);
    if (t !== "LEGEND") g += grooves(u, P, G, det, t);
    // the plate's curvature catching the light along its upper-left edge
    if (full)
      g += `<path d="${G.D}" fill="none" stroke="url(#${u}-sp)" stroke-width="${thumb ? 18 : 16}"${det ? ` filter="url(#${u}-s1)"` : ""}/>`;
    if (t === "LEGEND") {
      // thick clear plastic darkens at its edge; a refraction line runs just inside it
      g += `<path d="${G.D}" fill="none" stroke="#5d6f7a" stroke-width="15"/>`;
      if (det)
        g += `<rect x="-10" y="-10" width="290" height="670" fill="#effdff" opacity=".75" mask="url(#${u}-rf)"/>`;
    }
    if (t === "PRO") g += `<path d="${G.D}" fill="none" stroke="${LOGO}" stroke-width="15.4"/>`; // 1-unit Logo Blue edge inside the rim
    g += `</g>`;
    // midsole rim: holds the outline on the dark ground; a darker outer line holds it on the light one
    g += `<path d="${G.D}" fill="none" stroke="${t === "LEGEND" ? "#3a424b" : t === "HOMA" ? "#8a5a1e" : "#a39a86"}" stroke-width="13.4"/>`;
    g += `<path d="${G.D}" fill="none" stroke="url(#${u}-rim)" stroke-width="11"/>`;
    if (t === "HOMA" && det) {
      // the crisp moulded edge where the gum meets the rim
      g += `<g clip-path="url(#${u}-cl)"><path d="${G.D}" fill="none" stroke="#5e3409" stroke-width="13.8" opacity=".55"/><path d="${G.D}" fill="none" stroke="#ffe0a6" stroke-width="16" opacity=".35" transform="translate(-.4 -.5)"/></g>`;
      g += `<path d="${G.D}" fill="none" stroke="url(#${u}-rim)" stroke-width="11"/>`;
    }
    // toe spring: the wrapped tip of the plate, curling away, shows as a short lip past the rim
    if (t !== "LEGEND") {
      // keylined on its outer edge only, so it runs out into the rim with no seam at its ends
      g += `<path d="${G.lip}" fill="url(#${u}-lip)"/>`;
      g += `<path d="${G.lipEdge}" fill="none" stroke="${t === "HOMA" ? "#8a5a1e" : "#a39a86"}" stroke-width="1.2" stroke-linecap="round"/>`;
      if (det)
        g += `<path d="${G.lipEdge}" fill="none" stroke="#fffaf0" stroke-width=".8" opacity=".75" transform="translate(-.3 .5)"/>`;
    }
    // the heel counter in the club's colour, keylined in its second colour; with no club it is
    // the plate's own material, keylined in the rim's tone, and carries no disc
    const hc = p.club || { primary: mix(P.plate[1], "#000000", 0.3), secondary: "#cfc6b2" };
    g += `<path d="${G.heel}" fill="none" stroke="${hc.secondary}" stroke-width="11" stroke-linecap="butt"/>`;
    g += `<path d="${G.heel}" fill="none" stroke="${hc.primary}" stroke-width="9.4" stroke-linecap="butt"/>`;
    if (det) {
      // within-tier wear indicator: four notches moulded into the lateral rim (empty: no progress data in the sample)
      let w = "";
      for (const yy of [396, 406, 416, 426]) {
        const s = span(yy);
        w += `M${r1(X(s[0] - 1))} ${yy}H${r1(X(s[0] + 1))}`;
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
      for (const f of [0.3, 0.7]) {
        const [sx, sy] = G.map(...tm[Math.round(f * (tm.length - 1))]);
        g += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="2.6" fill="url(#${u}-face)" stroke="#3d4650" stroke-width=".6"/><path d="M${r1(sx - 1.5)} ${r1(sy - 0.6)}L${r1(sx + 1.5)} ${r1(sy + 0.6)}" stroke="#3d4650" stroke-width=".7"/>`;
      }
    }
    if (!thumb) g += boxPlate(u, P, G, det, t);
    if (p.founder || !onbMode(p)) g += yearClock(u, P, G, !!p.founder, det, t);
    // studs: every cast shadow in one blurred layer, then the bodies. On the first-rating beat
    // each stud is wrapped so it can seat itself (the wrappers draw nothing).
    const parts = STUDS[t].map((s) => stud(u, s, P, X, det));
    // one by one, toe to heel: each stud's delay spreads the whole run over 380ms
    const dly = beat === "first" ? seatDelays(STUDS[t]) : [];
    const seat = (q, i, cls) =>
      beat === "first" ? `<g class="c05v2-seat ${cls}" style="--d:${dly[i]}ms">${q}</g>` : q;
    // the press leaves a ring in the plate round each seat (a few studs only; invisible at rest)
    const rings = beat === "first" && parts.length <= 12;
    const shadows = parts.map((q, i) => seat(q.sh.join(""), i, "is-sh")).join("");
    g += det
      ? `<g filter="url(#${u}-sb)" opacity=".38">${shadows}</g>`
      : `<g opacity=".3">${shadows}</g>`;
    if (rings)
      g += STUDS[t]
        .map(
          (s, i) =>
            `<g class="c05v2-seat-ring" style="--d:${dly[i]}ms"><circle cx="${r1(X(s.x))}" cy="${s.y}" r="${s.t === "blade" ? 9 : s.r}" fill="none" stroke="${P.recess}" stroke-width="1.6"/></g>`,
        )
        .join("");
    g += parts.map((q, i) => seat(q.body.join(""), i, "is-body")).join("");
    return g;
  }

  /* ------------------------------------------------------------------ text */
  const CH = {
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
  };
  // advance widths of the stat labels in em, measured in Chromium with the lab's faces
  // (Manrope 600 at 0.06em tracking; Noto Sans Arabic 600)
  const LABEL_EM = {
    lat: { CAP: 2.176, SEL: 1.929, TRF: 1.951, CON: 2.357 },
    ar: { CAP: 2.222, SEL: 3.653, TRF: 4.016, CON: 2.627 },
  };
  const emName = (s, ar) =>
    ar ? [...s].length * 0.6 : [...s].reduce((a, ch) => a + (CH[ch.toUpperCase()] || 0.6), 0);

  /** Raised moulded type: a 1-unit shadow below-right, a lit edge above-left, then the face. */
  const raised = (attrs, body, P, det, k = 1) =>
    (det
      ? `<text ${attrs} fill="${P.recess}" opacity=".7" transform="translate(${r2(0.5 * k)} ${r2(0.75 * k)})">${body}</text>` +
        `<text ${attrs} fill="${P.hi}" opacity="${P.ink === "#2c1603" ? 0.55 : 0.32}" transform="translate(${r2(-0.35 * k)} ${r2(-0.5 * k)})">${body}</text>`
      : "") + `<text ${attrs} fill="${P.ink}">${body}</text>`;

  /** A small moulded dash, a figure with no value yet: shadow below-right, lit edge above-left, face. */
  const moulded = (cx, cy, w, h, P, det, k = 1) => {
    const rect = (dx, dy, fill, op) =>
      `<rect x="${r1(cx - w / 2 + dx)}" y="${r1(cy - h / 2 + dy)}" width="${w}" height="${h}" rx="${r1(h / 2)}" fill="${fill}"${op ? ` opacity="${op}"` : ""}/>`;
    return (
      (det
        ? rect(0.5 * k, 0.75 * k, P.recess, 0.7) +
          rect(-0.35 * k, -0.5 * k, P.hi, P.ink === "#2c1603" ? 0.55 : 0.32)
        : "") + rect(0, 0, P.ink)
    );
  };

  /** The name carrier with no name: a blank engraving field where the name will be moulded. */
  function nameField(P, nx, ny, det) {
    const w = 120,
      h = 25;
    const x = r1(nx - w / 2),
      y = r1(ny - h + 3);
    const rr = `x="${x}" y="${y}" width="${w}" height="${h}" rx="5"`;
    return (
      `<g class="c05v2-name-void">` +
      `<rect ${rr} fill="#fff" opacity=".2" transform="translate(.6 .9)"/>` +
      `<rect ${rr} fill="${P.recess}" opacity=".5"/>` +
      (det
        ? `<path d="M${x + 0.6} ${y + h - 4}V${y + 5}Q${x + 0.6} ${y + 0.6} ${x + 5} ${y + 0.6}H${r1(x + w - 5)}" fill="none" stroke="#000" stroke-width="1.2" opacity=".4"/>`
        : "") +
      `</g>`
    );
  }

  /** The rounds counted so far, as slots hanging from the halfway groove under the dash: a raised
      bar in the number's own ink where a round is counted, an engraved empty slot where not. They
      fill from the inline start (the left on the French boot, the right on the mirrored Arabic
      one). Slots, never studs: the studs are the tier. */
  function tally(u, p, P, G, tl, det, legend, thumb, tick) {
    const T = LAY.tally;
    const pitch = Math.min(T.pitch, 100 / tl.n);
    const w = r1(Math.min(T.w, pitch * 0.46));
    const y = r1(LAY.cir.y + T.y);
    const face = legend ? `url(#${u}-nf)` : `url(#${u}-ov)`;
    let out = `<g class="c05v2-tally">`;
    for (let i = 0; i < tl.n; i++) {
      const x = r1(G.X(LAY.cir.x + (i - (tl.n - 1) / 2) * pitch) - w / 2);
      const bar = (dx, dy, fill, extra = "") =>
        `<rect${dx || dy ? "" : ` class="c05v2-mark ${i < tl.k ? "is-on" : "is-off"}"`} x="${r1(x + dx)}" y="${r1(y + dy)}" width="${w}" height="${T.h}" rx="2.2" fill="${fill}"${extra}/>`;
      if (i < tl.k) {
        // the newest counted round, on the tick beat: its mark presses into the groove
        const press = tick && i === tl.k - 1;
        const mx = r1(x + w / 2);
        if (press)
          out += `<path class="c05v2-glint" d="M${r1(mx - 15)} ${LAY.cir.y}H${r1(mx + 15)}" stroke="${P.hi}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
        out += press
          ? `<g class="c05v2-press is-sh">${bar(1, 1.5, P.recess, ' opacity=".7"')}</g><g class="c05v2-press is-body">`
          : bar(1, 1.5, P.recess, ' opacity=".7"');
        if (!thumb) out += bar(-0.4, -0.55, P.hi, ' opacity=".4"');
        out += bar(0, 0, face);
        if (press) out += `</g>`;
      } else {
        out += bar(0.6, 0.9, "#fff", ` opacity="${p.tier === "HOMA" ? 0.5 : 0.3}"`);
        // an engraved empty slot with a lit rim, so it reads as hollow against the plate
        out += bar(
          0,
          0,
          P.recess,
          ` opacity=".92" stroke="${legend ? "#ffffff" : P.ink}" stroke-width="1.3" stroke-opacity=".85"`,
        );
      }
    }
    return out + `</g>`;
  }

  function words(u, p, o, P, G, full, thumb, beat) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const X = G.X;
    const det = full && !thumb;
    const dirA = ar ? ' direction="rtl"' : "";
    const name = MC.nameOf(p, o);
    const legend = p.tier === "LEGEND";
    let s = "";

    // 1. the 84, moulded proud at the centre spot, inside the centre circle. With no number yet
    //    the same moulding, in the same layers and ink, is a dash (the tally hangs under it).
    const nullNum = p.ovr == null;
    const tl = tallyOf(p);
    const ovr = String(p.ovr);
    const ofs = ovr.length > 2 ? 66 : LAY.ovr.fs;
    const ox = r1(X(LAY.cir.x)),
      oy = r1(LAY.cir.y + ofs * 0.32);
    const dsh = LAY.dash;
    const dy0 = r1(LAY.cir.y + (tl.n ? dsh.up : 0) - dsh.h / 2);
    const ot = nullNum
      ? (dx, dy, fill, extra = "") =>
          `<rect class="c05v2-dash" x="${r1(ox - dsh.w / 2 + dx)}" y="${r1(dy0 + dy)}" width="${dsh.w}" height="${dsh.h}" rx="${dsh.r}" fill="${fill}"${extra}/>`
      : (dx, dy, fill, extra = "") =>
          `<text class="c05v2-ov" x="${r1(ox + dx)}" y="${r1(oy + dy)}" font-size="${ofs}" fill="${fill}" text-anchor="middle" direction="ltr"${extra}>${ovr}</text>`;
    s += `<g class="c05v2-84">`;
    if (legend) {
      // machined numerals: a soft cast shadow, a short side wall in dark steel, a thin chamfer lit
      // from the top-left, and a polished face. No outline stroke.
      s += ot(1.8, 2.8, "#0e1620", ` opacity=".34"${det ? ` filter="url(#${u}-ns)"` : ""}`);
      for (let i = thumb ? 2 : 4; i >= 1; i--)
        s += ot(r1(0.45 * i), r1(0.7 * i), mix("#4b5560", "#0e1620", 0.14 * i));
      s += ot(
        0,
        0,
        `url(#${u}-ch)`,
        ` stroke="url(#${u}-ch)" stroke-width="2.4" stroke-linejoin="round"`,
      );
      s += ot(0, 0, `url(#${u}-nf)`);
      if (det)
        s += ot(
          0,
          0,
          "none",
          ` stroke="#ffffff" stroke-width=".5" opacity=".55" transform="translate(-.5 -.6)"`,
        );
    } else {
      s += ot(
        0,
        0,
        P.recess,
        ` stroke="${P.recess}" stroke-width="3" stroke-linejoin="round" opacity=".85"`,
      );
      if (!thumb)
        for (let i = 3; i >= 1; i--)
          s += ot(r1(0.5 * i), r1(0.8 * i), mix(P.side, "#000000", 0.1 * i));
      s += ot(-0.9, -0.9, mix(P.ink, "#ffffff", 0.6));
      s += ot(0, 0, `url(#${u}-ov)`);
    }
    s += `</g>`;
    if (tl.n) s += tally(u, p, P, G, tl, det, legend, thumb, beat === "tick");

    // 2. the name across the ball, the founder year after it in the plate's own material (ALI ·26)
    const fy = p.founder && name ? `·${p.founder % 100}` : "";
    const ax = LAY.ax;
    const sp = span(LAY.nameY - 22),
      sp2 = span(LAY.nameY);
    const avail = 2 * Math.min(ax - sp[0], sp[1] - ax, ax - sp2[0], sp2[1] - ax) - 2 * RIMIN - 48;
    const em = emName(name, ar) + (fy ? 0.18 + 0.62 * 1.45 : 0);
    // Arabic is capped lower: the two dots under a final ya (علي) hang about 0.35em below the
    // baseline and must clear the tier tag
    const fs = r1(Math.min(ar ? 30 : 34, avail / em));
    const ny = LAY.nameY - (ar ? 3 : 0);
    const nx = X(ax); // on the axis of the centre spot
    const yr = fy
      ? `<tspan class="c05v2-fy" font-size="${r1(fs * 0.62)}" fill="${P.yr}"${ar ? "" : ' direction="ltr" unicode-bidi="embed"'}>${fy}</tspan>`
      : "";
    const nameBody = `<tspan font-size="${fs}">${esc(name)}</tspan>${yr ? " " + yr : ""}`;
    const nattr = `class="c05v2-nm${ar ? " is-ar" : ""}" x="${r1(nx)}" y="${r1(ny)}" text-anchor="middle"${dirA}`;
    if (!name) {
      // a guest before naming: the name carrier, drawn empty (a blank engraving field, no text)
      s += nameField(P, nx, ny, det);
    } else {
      if (det) {
        s += `<text ${nattr} fill="${P.recess}" opacity=".75" transform="translate(.8 1.2)">${nameBody.replace(/ fill="[^"]*"/, "")}</text>`;
        s += `<text ${nattr} fill="${P.hi}" opacity="${t0(P)}" transform="translate(-.5 -.6)">${nameBody.replace(/ fill="[^"]*"/, "")}</text>`;
      }
      s += `<text ${nattr} fill="${legend ? P.ink : P.ink}">${nameBody}</text>`;
    }

    // 3. the tier, a moulded tag of its own under the name (none before a rating: no tier word)
    if (!thumb && p.tier !== null) {
      const tierTxt = S.tiers[p.tier];
      const tfs = ar ? 10.5 : 8.6;
      const tw = r1(
        (ar ? [...tierTxt].length * 0.6 * tfs : tierTxt.length * (0.7 + 0.14) * tfs) + 14,
      );
      const th = LAY.tagH + (ar ? 1 : 0);
      const ty = LAY.tagY + (ar ? 10 : 0);
      const tx = X(ax);
      s += `<g class="c05v2-tag">`;
      s += `<rect x="${r1(tx - tw / 2 + 0.7)}" y="${r1(ty + 1.1)}" width="${tw}" height="${th}" rx="3" fill="#000" opacity=".35"/>`;
      s += `<rect x="${r1(tx - tw / 2)}" y="${ty}" width="${tw}" height="${th}" rx="3" fill="${P.tag}"/>`;
      s += `<path d="M${r1(tx - tw / 2 + 0.6)} ${r1(ty + th - 2)}V${r1(ty + 3)}Q${r1(tx - tw / 2 + 0.6)} ${r1(ty + 0.6)} ${r1(tx - tw / 2 + 3)} ${r1(ty + 0.6)}H${r1(tx + tw / 2 - 3)}" fill="none" stroke="#fff" stroke-opacity="${legend ? 0.22 : 0.32}" stroke-width=".8"/>`;
      s += `<text class="c05v2-tr${ar ? " is-ar" : ""}" x="${r1(tx + (ar ? 0 : tfs * 0.07))}" y="${r1(ty + th / 2 + tfs * 0.36)}" font-size="${tfs}" fill="${legend ? "#ffffff" : p.tier === "HOMA" ? "#fff6e2" : P.inkTone}" text-anchor="middle"${dirA}>${esc(tierTxt)}</text>`;
      s += `</g>`;
    }

    // 4. the four decisions on the box plate, 2 x 2. Each figure sits 5 units after its label, so
    //    label and figure read as a pair; the widest label of a column sets where its figures
    //    start, so the figures align. The pairs keep 9.5 units off the plate's frame and the
    //    gutter between them (at least twice the label-figure gap) carries a moulded rib. Arabic
    //    mirrors the label side only: the label opens each pair on the right, the figures stay
    //    left to right.
    if (!thumb) {
      const b = LAY.box;
      const bl = ar ? MIRROR - b.x - b.w : b.x; // the box's visual left edge
      const br = bl + b.w;
      const pad = 9.5,
        gap = 5;
      const vfs = 13.5,
        lfs = ar ? 6.9 : 7.6;
      const vw = 1.24 * vfs; // two tabular figures, Manrope 700 (measured)
      const lw = (k) => LABEL_EM[ar ? "ar" : "lat"][k] * lfs;
      const cl = [Math.max(lw("CAP"), lw("TRF")), Math.max(lw("SEL"), lw("CON"))];
      const base = [r1(b.y + 11 + vfs * 0.72), r1(b.y + b.h - 11)];
      // per column: [label x, label anchor, value x, value anchor]
      const cols = ar
        ? [
            [br - pad, "end", br - pad - cl[0] - gap, "end"],
            [bl + pad + vw + gap + cl[1], "end", bl + pad, "start"],
          ]
        : [
            [bl + pad, "start", bl + pad + cl[0] + gap, "start"],
            [br - pad - vw - gap - cl[1], "start", br - pad - vw, "start"],
          ];
      const innerL = ar ? bl + pad + vw + gap + cl[1] : bl + pad + cl[0] + gap + vw;
      const innerR = ar ? br - pad - cl[0] - gap - vw : br - pad - vw - gap - cl[1];
      const rx = r1((innerL + innerR) / 2);
      // the rib: raised, lit on its left side
      s += `<path d="M${r1(rx + 0.6)} ${b.y + 9}V${b.y + b.h - 9}" stroke="${P.recess}" stroke-width="1.2" opacity=".75" stroke-linecap="round"/>`;
      s += `<path d="M${rx} ${b.y + 9}V${b.y + b.h - 9}" stroke="${t0(P) > 0.4 ? "#ffe2b0" : "#ffffff"}" stroke-width=".9" opacity="${t0(P) > 0.4 ? 0.6 : 0.3}" stroke-linecap="round"/>`;
      MC.STATS.forEach((k, i) => {
        const [lx, la, vx, va] = cols[i % 2];
        const y = base[(i / 2) | 0];
        const lab = `class="c05v2-sl${ar ? " is-ar" : ""}" x="${r1(lx)}" y="${y}" font-size="${lfs}" text-anchor="${la}" direction="ltr"`;
        const val = `class="c05v2-sv" x="${r1(vx)}" y="${y}" font-size="${vfs}" text-anchor="${va}" direction="ltr"`;
        const sv = p.stats ? p.stats[k] : undefined;
        // a stat with no value yet is a dash in its figure's place, centred in the figure's slot
        const figure =
          sv == null
            ? moulded(
                r1(va === "start" ? vx + vw / 2 : vx - vw / 2),
                r1(y - vfs * 0.36),
                9,
                2.4,
                P,
                det,
              )
            : raised(val, String(sv), P, det, 1);
        // the label is the figure's name: full ink (a 0.7 veil put it at 2.9:1 on the honey plate)
        s += raised(lab, esc(S.stats[k]), P, det, 0.8) + figure;
      });
    }

    if (!thumb) {
      // 5. FOUNDER 2026 moulded round the top of the year clock
      const { y: wy, ro } = LAY.wheel;
      const wx = X(LAY.wheel.x);
      if (p.founder) {
        const R = ro + 7.6;
        const arc = `M${r1(wx - R)} ${wy}A${R} ${R} 0 0 1 ${r1(wx + R)} ${wy}`;
        s += `<path id="${u}-fa" d="${arc}" fill="none"/>`;
        const fl = `class="c05v2-fl${ar ? " is-ar" : ""}" font-size="${ar ? 9 : 7.8}"${dirA}`;
        // the year is its own left-to-right run inside the Arabic line, so its digits cannot reorder
        const line = ar
          ? `${esc(S.founder)} <tspan direction="ltr" unicode-bidi="embed">${esc(p.founder)}</tspan>`
          : esc(S.founderLine);
        const fb = `<textPath href="#${u}-fa" startOffset="50%" text-anchor="middle">${line}</textPath>`;
        s += raised(fl, fb, P, det, 0.9);
      }
      // 6. the style code: the BotolaGO ID moulded under the clock, the country under it. With no
      //    ID yet the carrier holds a dash (no sentence, no placeholder text).
      s +=
        p.id == null
          ? moulded(wx, LAY.idY - 2.9, 16, 2.6, P, det, 0.8)
          : raised(
              `class="c05v2-id" x="${wx}" y="${LAY.idY}" font-size="7.8" text-anchor="middle" direction="ltr"`,
              esc(p.id),
              P,
              det,
              0.8,
            );
      s += `<g opacity=".8">${raised(`class="c05v2-ct${ar ? " is-ar" : ""}" x="${wx}" y="${LAY.ctY}" font-size="${ar ? 8.4 : 6.8}" text-anchor="middle"${dirA}`, esc(S.country), P, det, 0.7)}</g>`;
      // 7. the club crest, stamped inside the heel cup (no club, no crest)
      const cw2 = LAY.crest.w;
      if (p.club !== null)
        s += `<svg x="${r1(X(LAY.crest.x) - cw2 / 2)}" y="${r1(LAY.crest.y - cw2 * 0.6)}" width="${cw2}" height="${r1(cw2 * 1.2)}" viewBox="0 0 40 48" aria-hidden="true" opacity=".85">${MC.crest({ mono: P.ink }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
      // 8. the season, a second production mark following the toe (re-drawn left to right in Arabic)
      const q = LAY.season.map(([a, b2]) => [r1(X(a)), b2]);
      if (ar) q.reverse();
      s += `<path id="${u}-se" d="M${q[0][0]} ${q[0][1]}Q${q[1][0]} ${q[1][1]} ${q[2][0]} ${q[2][1]}" fill="none"/>`;
      // full ink on the plate's dark rim: a 0.78 veil took the season to 1.9:1 on the honey gum
      s += raised(
        `class="c05v2-se" font-size="7" direction="ltr"`,
        `<textPath href="#${u}-se" startOffset="50%" text-anchor="middle">${esc(p.season)}</textPath>`,
        P.seas ? { ...P, ink: P.seas } : P,
        det,
        0.7,
      );
    }
    return s;
  }
  // the lit edge of the name: stronger on light gum, softer on dark plates
  const t0 = (P) => (P.ink === "#2c1603" ? 0.6 : 0.3);

  function full(p, o = {}) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const t = tierKey(p);
    const P = TIER[t];
    const u = MC.uid("c05v2");
    const thumb = !!o.thumb;
    const G = geo(ar);
    // one optional beat (CSS only, off under reduced motion): "make" hangs the plate, "first"
    // seats the tier's studs, "tick" presses the newest counted round into the groove
    const beat = ["make", "first", "tick"].includes(o.beat) && !thumb ? o.beat : "";
    return (
      `<div class="c05v2 c05v2-full t-${t.toLowerCase()}${thumb ? " is-thumb" : ""}${o.motion ? " is-motion" : ""}${beat ? " is-beat-" + beat : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${t}">` +
      `<svg class="c05v2-svg" viewBox="0 -8 263 666" aria-hidden="true" focusable="false">` +
      defs(u, t, P, G, !thumb) +
      solid(u, t, P, p, G, true, thumb, beat) +
      `<g class="c05v2-words">${words(u, p, o, P, G, true, thumb, beat)}</g>` +
      `</svg></div>`
    );
  }

  /* ------------------------------------------------------------------ token (44–80px) */
  // The whole sole laid horizontal, toe at the inline end, the arch along the bottom. The
  // midfoot is shortened so the token stays about 2.1:1. Card (x, y) -> token (TL - sq(y), x).
  const SQ = { a: 300, b: 470, k: 0.5 };
  const sq = (y) =>
    y <= SQ.a ? y : y >= SQ.b ? y - (SQ.b - SQ.a) * (1 - SQ.k) : SQ.a + (y - SQ.a) * SQ.k;
  const TL = r1(sq(660));
  const tokP = (x, y) => [TL - sq(y), x];
  const TW = r1(TL + 14);
  const TY0 = -14,
    TH = 290;
  let TOKG = null;
  const tokGeo = () =>
    TOKG ||
    (TOKG = {
      D: pathOf(tokP),
      heel: polyD(HEEL, tokP),
      toe:
        polyD(TOE.outer, tokP) +
        "L" +
        TOE.inner
          .slice()
          .reverse()
          .map((q) => tokP(q[0], q[1]).map(r1).join(" "))
          .join("L") +
        "Z",
    });
  // the 84 across the forefoot; studs around it, never under it
  const TOVR = { x: 131, y: 150, fs: 162 };
  const TSTUD = {
    STADE: [
      Lx(44, 30),
      Rx(52, 30),
      Lx(262, 24),
      Rx(266, 24),
      Lx(390, 22),
      Rx(380, 20),
      Lx(604, 30),
      Rx(604, 30),
    ].map(([x, y]) => ({ t: "cone", x, y, r: 20 })),
    PRO: [
      ...[Lx(70, 28), Lx(236, 26), Rx(76, 28), Rx(240, 26)].map((q) => ({ ...blade(q), sc: 1.8 })),
      ...[Lx(600, 34), Rx(600, 34)].map((q) => ({ ...blade(q), sc: 1.8 })),
    ],
    CHAMPION: [Lx(60, 30), Rx(66, 30), Lx(254, 28), Rx(258, 28), Lx(604, 32), Rx(604, 32)].map(
      ([x, y]) => ({ t: "steel", x, y, r: 20 }),
    ),
    LEGEND: [Lx(84, -2), Rx(90, -2), Lx(236, -1), Rx(240, -1), Lx(584, 0), Rx(584, 0)].map(
      ([x, y]) => ({ t: "big", x, y, r: 25 }),
    ),
    // the base plate's bare mounts: the forefoot six at token scale and the heel pair
    BASE: [
      Lx(70, 28),
      Lx(236, 26),
      Rx(76, 28),
      Rx(240, 26),
      Lx(150, 22),
      Rx(156, 22),
      Lx(600, 34),
      Rx(600, 34),
    ].map(([x, y]) => ({ t: "socket", x, y, r: 19 })),
  };
  let TNUBS = null;
  function tokNubs() {
    if (TNUBS) return TNUBS;
    const out = [];
    const pch = 31,
      r = 9.5;
    const [ocx, ocy] = tokP(TOVR.x, TOVR.y);
    const hw = TOVR.fs * 0.6 + 8,
      hh = TOVR.fs * 0.32 + 8;
    const [wcx, wcy] = tokP(LAY.wheel.x, LAY.wheel.y);
    for (let row = 0, y = 24; y < 640; row++, y += pch * 0.866) {
      for (let x = 30 + (row % 2 ? pch / 2 : 0); x < 236; x += pch) {
        if (!insideBy(x, y, r + 13)) continue;
        const [tx, ty] = tokP(x, y);
        if (Math.abs(tx - ocx) < hw + r && Math.abs(ty - ocy) < hh + r) continue;
        if (Math.hypot(tx - wcx, ty - wcy) < 44 + r) continue;
        out.push({ t: "nub", x, y, r });
      }
    }
    return (TNUBS = out);
  }

  /** Stud emblems in token or mini space (flat, two-tone, lit from the top-left). */
  function emblem(s, cx, cy, P, u, ar, rot, px = 6) {
    const r = s.r;
    if (s.t === "nub")
      return {
        sh: "",
        st: `<circle cx="${r1(cx + 1.8)}" cy="${r1(cy + 2.8)}" r="${r}" fill="${P.stud[2]}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="${P.topTok}"/>`,
      };
    if (s.t === "cone" || s.t === "round")
      return {
        sh: `<circle cx="${r1(cx + 4)}" cy="${r1(cy + 6)}" r="${r}"/>`,
        st: `<circle cx="${r1(cx + 2.4)}" cy="${r1(cy + 4)}" r="${r}" fill="${P.stud[2]}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="${P.stud[1]}"/><circle cx="${r1(cx - 1)}" cy="${r1(cy - 1.4)}" r="${r1(r * (s.t === "cone" ? 0.54 : 0.74))}" fill="${P.topTok}"/>`,
      };
    if (s.t === "blade") {
      const a = ar ? 180 - (s.a + rot) : s.a + rot;
      const sc = s.sc || 2;
      const c = (d, dx, dy, fill) =>
        `<path d="${d}" transform="translate(${r1(cx + dx)} ${r1(cy + dy)}) rotate(${a}) scale(${sc})" fill="${fill}"/>`;
      // a 1px light specular edge on the upper-left of the tip (px = viewBox units per CSS pixel),
      // so a Logo Blue tip still reads on the smoked navy plate in a 44px row
      const spec = s.steel ? "" : c(BLADE_TOP, r1(-0.8 - px * 0.7), r1(-1.2 - px * 0.9), "#e3ecff");
      return {
        sh: c(BLADE, 4, 6, "#000"),
        st:
          c(BLADE, 2.4, 4, P.stud[2]) +
          c(BLADE, 0, 0, P.stud[1]) +
          spec +
          c(BLADE_TOP, -0.8, -1.2, s.steel ? `url(#${u}-s)` : P.topTok) +
          c(BLADE_TOP, -1.8, -2.4, "none").replace(
            "/>",
            ' stroke="#fff" stroke-width=".9" opacity=".7"/>',
          ),
      };
    }
    if (s.t === "socket")
      return {
        sh: `<circle cx="${r1(cx + 3)}" cy="${r1(cy + 5)}" r="${r}"/>`,
        st: `<circle cx="${r1(cx + 1.8)}" cy="${r1(cy + 2.8)}" r="${r}" fill="${P.stud[2]}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="${P.topTok}"/><circle cx="${r1(cx + 0.8)}" cy="${r1(cy + 1.2)}" r="${r1(r * 0.48)}" fill="${P.recess}"/>`,
      };
    if (s.t === "ring")
      return {
        sh: `<circle cx="${r1(cx + 3)}" cy="${r1(cy + 4)}" r="${r}"/>`,
        st: `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r - r * 0.22)}" fill="none" stroke="url(#${u}-s)" stroke-width="${r1(r * 0.44)}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.5)}" fill="#14171b"/>`,
      };
    const big = s.t === "big";
    return {
      sh: `<circle cx="${r1(cx + 4)}" cy="${r1(cy + 6)}" r="${r + 4}"/>`,
      st: `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r + (big ? 6 : 4))}" fill="${big ? "#262b31" : P.stud[2]}"/><circle cx="${r1(cx + 2)}" cy="${r1(cy + 3)}" r="${r}" fill="#454d57"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="url(#${u}-s)"/><circle cx="${r1(cx - r * 0.3)}" cy="${r1(cy - r * 0.32)}" r="${r1(r * 0.24)}" fill="#fff"/>`,
    };
  }

  const tokDefs = (u, t, P, cell) =>
    `<linearGradient id="${u}-p" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="${P.plate[0]}"/><stop offset=".55" stop-color="${P.plate[1]}"/><stop offset="1" stop-color="${P.plate[2]}"/></linearGradient>` +
    `<linearGradient id="${u}-s" x1="0" y1="0" x2="1" y2="1">${stops(STEEL)}</linearGradient>` +
    // CHAMPION: a twill big enough to read as weave in a 44px row (cells about 3px)
    (t === "CHAMPION"
      ? `<pattern id="${u}-tw" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${cell * 2}" height="${cell * 2}" fill="#16191e"/><rect width="${cell}" height="${cell}" fill="#3a4049"/><rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#3a4049"/></pattern>`
      : "");

  /** The token's number carrier with no number: the moulded dash, and the tally of counted rounds
      hanging under it (same marks as the card, fatter for 44-80px). Token space, upright. */
  function tokenBlank(p, P, t, cx, cy, ar, tl, tick) {
    const legend = t === "LEGEND";
    const ink = legend ? "#ffffff" : P.ink;
    const D = { w: 100, h: 26, r: 6 };
    const dcy = cy + (tl.n ? -33 : 0);
    const rect = (x, y, w, h, r, fill, extra = "", cls = "") =>
      `<rect${cls ? ` class="${cls}"` : ""} x="${r1(x)}" y="${r1(y)}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${extra}/>`;
    let out =
      rect(cx - D.w / 2 + 3, dcy - D.h / 2 + 5, D.w, D.h, D.r, mix(P.side, "#000000", 0.25)) +
      rect(
        cx - D.w / 2,
        dcy - D.h / 2,
        D.w,
        D.h,
        D.r,
        ink,
        ` stroke="${P.recess}" stroke-width="12" paint-order="stroke" stroke-linejoin="round"`,
        "c05v2-dash",
      );
    if (tl.n) {
      const pitch = Math.min(36, 190 / tl.n);
      const w = r1(Math.min(24, pitch * 0.62)),
        h = 46,
        y = cy + 4;
      for (let i = 0; i < tl.n; i++) {
        const x = cx + (ar ? -1 : 1) * (i - (tl.n - 1) / 2) * pitch - w / 2;
        if (i < tl.k) {
          const press = tick && i === tl.k - 1;
          const sh = rect(x + 2.4, y + 4, w, h, 4, P.recess, ' opacity=".7"');
          const face = rect(
            x,
            y,
            w,
            h,
            4,
            ink,
            ` stroke="${P.recess}" stroke-width="6" paint-order="stroke" stroke-linejoin="round"`,
            "c05v2-mark is-on",
          );
          out += press
            ? `<g class="c05v2-press is-sh">${sh}</g><g class="c05v2-press is-body">${face}</g>`
            : sh + face;
        } else {
          out +=
            rect(x + 2, y + 3, w, h, 4, "#ffffff", ' opacity=".3"') +
            rect(
              x,
              y,
              w,
              h,
              4,
              P.recess,
              ` opacity=".92" stroke="${ink}" stroke-width="4.5" stroke-opacity=".75"`,
              "c05v2-mark is-off",
            );
        }
      }
    }
    return out;
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    if (mini) return miniToken(p, o, size);
    const ar = MC.isAr(o);
    const t = tierKey(p);
    const P = TIER[t];
    const u = MC.uid("c05v2t");
    const beat = ["first", "tick"].includes(o.beat) ? o.beat : "";
    const w = TW;
    const X = (x) => (ar ? w - x : x);
    const TG = tokGeo();
    const rimW = 15;
    const mir = (inner) => (ar ? `<g transform="matrix(-1 0 0 1 ${w} 0)">${inner}</g>` : inner);
    const cell = r1((TH / size) * 3); // 3px twill cells at any size
    let shape = "";
    // LEGEND's steel side wall, always toward the lower-right (inside the mirror, x flips)
    if (t === "LEGEND")
      shape += `<path d="${TG.D}" fill="#6f7984" stroke="#6f7984" stroke-width="${rimW}" transform="translate(${ar ? -8 : 8} 9)"/>`;
    shape += `<path d="${TG.D}" fill="url(#${u}-p)"/>`;
    if (t === "CHAMPION")
      shape += `<path d="${TG.D}" fill="url(#${u}-tw)" opacity=".75"/><path d="${TG.D}" fill="#fff" opacity=".08"/>`;
    if (t === "LEGEND") shape += `<path d="${TG.D}" fill="#9fb8c4" fill-opacity=".45"/>`;
    shape += `<path d="${TG.D}" fill="none" stroke="${t === "LEGEND" ? "#3a424b" : t === "HOMA" ? "#8a5a1e" : "#a39a86"}" stroke-width="${rimW + 4}"/>`;
    shape += `<path d="${TG.D}" fill="none" stroke="${t === "LEGEND" ? `url(#${u}-s)` : RIM}" stroke-width="${rimW}"/>`;
    // the heel counter in the club colour (rule 8: visible on the 44px token), keylined; with no
    // club it is the plate's own material and carries no disc
    const hc = p.club || { primary: mix(P.plate[1], "#000000", 0.3), secondary: "#cfc6b2" };
    shape += `<path d="${TG.heel}" fill="none" stroke="${hc.secondary}" stroke-width="${rimW + 10}" stroke-linecap="round"/>`;
    shape += `<path d="${TG.heel}" fill="none" stroke="${hc.primary}" stroke-width="${rimW + 2}" stroke-linecap="round"/>`;
    if (t === "LEGEND")
      shape += `<path d="${TG.toe}" fill="url(#${u}-s)" stroke="#3d4650" stroke-width="3"/>`;
    const g = mir(shape);
    // studs: emblems in token space (the light never rotates)
    const list = t === "HOMA" ? tokNubs() : TSTUD[t];
    let sh = "",
      st = "";
    const dly = beat === "first" ? seatDelays(list) : [];
    list.forEach((s, i) => {
      const [cx0, cy] = tokP(s.x, s.y);
      const e = emblem(s, X(cx0), cy, P, u, ar, 90, TH / size);
      sh += e.sh;
      // the first-rating beat seats the studs one by one, toe to heel (a few emblems only)
      st +=
        beat === "first" && list.length <= 12
          ? `<g class="c05v2-seat is-body" style="--d:${dly[i]}ms">${e.st}</g>`
          : e.st;
    });
    // the founder sign: the machined steel insert ring and its dial in the heel
    const [wx0, wy] = tokP(LAY.wheel.x, LAY.wheel.y);
    const fx = r1(X(wx0)),
      fy = r1(wy);
    const R = 36,
      rD = 23;
    const ring = p.founder
      ? `<circle cx="${r1(fx + 2)}" cy="${r1(fy + 3)}" r="${R + 3}" fill="#000" opacity=".4"/><circle cx="${fx}" cy="${fy}" r="${r2((R + rD) / 2)}" fill="none" stroke="url(#${u}-s)" stroke-width="${R - rD}"/>` +
        `<circle cx="${fx}" cy="${fy}" r="${rD}" fill="${P.plate[1]}"/><circle cx="${fx}" cy="${fy}" r="${R}" fill="none" stroke="#3d4650" stroke-width="2"/>` +
        // the dial's arrow points at the toe, where 26 sits
        `<path d="M${r1(fx - (ar ? -1 : 1) * 11)} ${fy}H${r1(fx + (ar ? -1 : 1) * 6)}" stroke="${P.ink}" stroke-width="6" stroke-linecap="round"/><path d="M${r1(fx + (ar ? -1 : 1) * 3)} ${r1(fy - 9)}L${r1(fx + (ar ? -1 : 1) * 15)} ${fy}L${r1(fx + (ar ? -1 : 1) * 3)} ${r1(fy + 9)}Z" fill="${P.ink}"/>`
      : onbMode(p)
        ? ""
        : `<circle cx="${fx}" cy="${fy}" r="${rD + 3}" fill="none" stroke="${P.recess}" stroke-width="5" opacity=".5"/>`;
    // the 84 across the forefoot
    const ovr = String(p.ovr);
    const ofs = ovr.length > 2 ? TOVR.fs * 0.78 : TOVR.fs;
    const [ocx0, ocy] = tokP(TOVR.x, TOVR.y);
    const ocx = X(ocx0);
    const legend = t === "LEGEND";
    const ovText =
      `<text class="c05v2-ov" x="${r1(ocx + 3)}" y="${r1(ocy + ofs * 0.32 + 5)}" font-size="${ofs}" text-anchor="middle" fill="${mix(P.side, "#000000", 0.25)}">${ovr}</text>` +
      `<text class="c05v2-ov" x="${r1(ocx)}" y="${r1(ocy + ofs * 0.32)}" font-size="${ofs}" text-anchor="middle" fill="${legend ? "#ffffff" : P.ink}" stroke="${t === "HOMA" ? "#f7deb2" : P.recess}" stroke-width="12" paint-order="stroke" stroke-linejoin="round">${ovr}</text>`;
    const wpx = r1((w / TH) * size);
    // no number yet: a dash across the forefoot with the rounds counted hanging under it
    const num =
      p.ovr == null ? tokenBlank(p, P, t, X(ocx0), ocy, ar, tallyOf(p), beat === "tick") : ovText;
    return (
      `<span class="c05v2 c05v2-tok t-${t.toLowerCase()}${beat ? " is-beat-" + beat : ""}" style="width:${wpx}px;height:${size}px${beat ? `;--c05v2-k:${r1((TH / size) * 0.76)}` : ""}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg viewBox="0 ${TY0} ${w} ${TH}" width="${wpx}" height="${size}" aria-hidden="true" focusable="false"><defs>${tokDefs(u, t, P, cell)}</defs>` +
      g +
      `<g fill="#000" opacity=".3">${sh}</g>` +
      st +
      ring +
      num +
      `</svg></span>`
    );
  }

  /* ------------------------------------------------------------------ mini (24–28px) */
  // The forefoot alone, toe up: a toe-cap shield no wider than its height, carrying the 84,
  // ringed by the tier's stud signature (6 nubs, 4 cones, 3 blades, 4 screw-in rings, or
  // LEGEND's studs breaking the outline), with a steel dot on the cut for the founder clock.
  // The studs sit clear of the 84 (at least 1px at 28px): a pair in the toe above it, a pair on
  // the rim beside it or a pair in the cut below it.
  const MSTUD = (() => {
    const toe = [Lx(56, 17), Rx(50, 17)];
    const low = [Lx(200, 16), Rx(194, 18)];
    return {
      HOMA: [...toe, Lx(130, 8), Rx(126, 8), ...low].map(([x, y]) => ({ t: "nub", x, y, r: 12 })),
      STADE: [...toe, ...low].map(([x, y]) => ({ t: "cone", x, y, r: 16 })),
      PRO: [
        { ...blade(Lx(40, 20)), sc: 2.2 },
        { ...blade(Lx(142, 9)), sc: 2.2 },
        { ...blade(Rx(142, 9)), sc: 2.2 },
      ],
      CHAMPION: [...toe, ...low].map(([x, y]) => ({ t: "ring", x, y, r: 16 })),
      LEGEND: [Lx(52, -3), Rx(52, -3), Lx(204, -3), Rx(188, -3)].map(([x, y]) => ({
        t: "big",
        x,
        y,
        r: 19,
      })),
      // no tier: four bare mounts, the toe pair and the cut pair
      BASE: [...toe, ...low].map(([x, y]) => ({ t: "socket", x, y, r: 15 })),
    };
  })();
  const MBOX = { x0: 0, y0: -12, w: 263, h: 274 };
  let MINIG = null;
  const miniGeo = () => {
    if (MINIG) return MINIG;
    const D = (map) => "M" + CAPLOOP.map((q) => map(q[0], q[1]).map(r1).join(" ")).join("L") + "Z";
    const TOEm =
      polyD(TOE.outer, (x, y) => [x, y]) +
      "L" +
      TOE.inner
        .slice()
        .reverse()
        .map((q) => [q[0], q[1]].map(r1).join(" "))
        .join("L") +
      "Z";
    return (MINIG = { lat: D((x, y) => [x, y]), ar: D((x, y) => [MIRROR - x, y]), toeLat: TOEm });
  };

  function miniToken(p, o, size) {
    const ar = MC.isAr(o);
    const t = tierKey(p);
    const P = TIER[t];
    const u = MC.uid("c05v2m");
    const X = (x) => (ar ? MIRROR - x : x);
    const MG = miniGeo();
    const D = ar ? MG.ar : MG.lat;
    const rimW = r1((1.6 * MBOX.h) / size); // a 1.6px cream rim at any size
    const cell = r1((MBOX.h / size) * 3);
    let g = "";
    if (t === "LEGEND")
      g += `<path d="${D}" fill="#6f7984" stroke="#6f7984" stroke-width="${rimW}" transform="translate(5 7)"/>`;
    g += `<path d="${D}" fill="url(#${u}-p)"/>`;
    if (t === "CHAMPION") g += `<path d="${D}" fill="url(#${u}-tw)" opacity=".75"/>`;
    if (t === "LEGEND") g += `<path d="${D}" fill="#9fb8c4" fill-opacity=".45"/>`;
    g += `<path d="${D}" fill="none" stroke="${t === "LEGEND" ? "#3a424b" : t === "HOMA" ? "#8a5a1e" : "#a39a86"}" stroke-width="${r1(rimW + 4)}" stroke-linejoin="round"/>`;
    g += `<path d="${D}" fill="none" stroke="${t === "LEGEND" ? `url(#${u}-s)` : RIM}" stroke-width="${rimW}" stroke-linejoin="round"/>`;
    if (t === "LEGEND")
      g += `<g${ar ? ` transform="matrix(-1 0 0 1 ${MIRROR} 0)"` : ""}><path d="${MG.toeLat}" fill="url(#${u}-s)" stroke="#3d4650" stroke-width="4"/></g>`;
    let sh = "",
      st = "";
    for (const s of MSTUD[t]) {
      const e = emblem(s, X(s.x), s.y, P, u, ar, 0, MBOX.h / size);
      sh += e.sh;
      st += e.st;
    }
    // the 84
    const ovr = String(p.ovr);
    const ofs = ovr.length > 2 ? 84 : 109; // 88% of the first pass, so the studs clear the digits
    const ox = r1(X(132)),
      oy = r1(129 + ofs * 0.32);
    const legend = t === "LEGEND";
    // no number yet: the dash stays (the tally drops out at this size)
    const dw = 84,
      dh = 28,
      dx = r1(ox - dw / 2),
      dyy = r1(129 - dh / 2);
    const ovText =
      p.ovr == null
        ? `<rect x="${r1(dx + 4)}" y="${r1(dyy + 6)}" width="${dw}" height="${dh}" rx="7" fill="${mix(P.side, "#000000", 0.25)}"/>` +
          `<rect class="c05v2-dash" x="${dx}" y="${dyy}" width="${dw}" height="${dh}" rx="7" fill="${legend ? "#ffffff" : P.ink}" stroke="${P.recess}" stroke-width="16" paint-order="stroke" stroke-linejoin="round"/>`
        : `<text class="c05v2-ov" x="${r1(ox + 4)}" y="${r1(oy + 6)}" font-size="${ofs}" text-anchor="middle" fill="${mix(P.side, "#000000", 0.25)}">${ovr}</text>` +
          `<text class="c05v2-ov" x="${ox}" y="${oy}" font-size="${ofs}" text-anchor="middle" fill="${legend ? "#ffffff" : P.ink}" stroke="${t === "HOMA" ? "#f7deb2" : P.recess}" stroke-width="16" paint-order="stroke" stroke-linejoin="round">${ovr}</text>`;
    // founder: a steel dot (at least 3px) sitting on the cut, like the centre spot on the halfway line
    const fr = r1((1.75 * MBOX.h) / size);
    // the bead sits in a dark socket ring, so it holds on LEGEND's light steel as well as on navy
    const fx = X(CUT.apex[0]),
      fyy = CUT.apex[1] - 13;
    const sock = r1((0.9 * MBOX.h) / size);
    const fd = p.founder
      ? `<circle cx="${r1(fx + 2)}" cy="${fyy + 3}" r="${r1(fr + sock)}" fill="#000" opacity=".35"/><circle cx="${fx}" cy="${fyy}" r="${r1(fr + sock)}" fill="#0e1620"/><circle cx="${fx}" cy="${fyy}" r="${fr}" fill="url(#${u}-s)"/><circle cx="${r1(fx - fr * 0.3)}" cy="${r1(fyy - fr * 0.32)}" r="${r1(fr * 0.3)}" fill="#fff"/>`
      : "";
    const wpx = r1((MBOX.w / MBOX.h) * size);
    return (
      `<span class="c05v2 c05v2-tok is-mini t-${t.toLowerCase()}" style="width:${wpx}px;height:${size}px" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg viewBox="${MBOX.x0} ${MBOX.y0} ${MBOX.w} ${MBOX.h}" width="${wpx}" height="${size}" aria-hidden="true" focusable="false"><defs>${tokDefs(u, t, P, cell)}</defs>` +
      g +
      `<g fill="#000" opacity=".3">${sh}</g>` +
      st +
      ovText +
      fd +
      `</svg></span>`
    );
  }

  /* The founder year after the name in HTML (row, share): the year in the name's own ink and
     weight, the dot a steel bead in a dark socket (the clock's insert ring, in miniature). The
     dot stays in the text as "·" for copy and screen readers; the bead draws it. */
  const founderYear = (p) =>
    p.founder ? `<i><span class="c05v2-bead">·</span>${MC.ltr(String(p.founder % 100))}</i>` : "";

  /* ------------------------------------------------------------------ row */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const t = tierKey(p);
    const yr = founderYear(p);
    const name = MC.nameOf(p, o);
    // under the name: tier and number, or, while forming, « en formation k/N » in the number's place
    const sub =
      p.ovr == null
        ? `${esc(MC.onbStr(o).forming)}${p.minRated ? ` <em>${MC.ltr((p.counted | 0) + "/" + p.minRated)}</em>` : ""}`
        : `${p.tier === null ? "" : `<em>${esc(S.tiers[t])}</em> `}${MC.ltr(p.ovr + " " + S.ovr)}`;
    return (
      `<div class="c05v2 c05v2-row t-${t.toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}">` +
      `<span class="c05v2-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c05v2-rt">${token(p, { ...o, size: 44, mini: false })}</span>` +
      `<span class="c05v2-rw">${name ? `<b class="${ar ? "is-ar" : ""}">${esc(name)}${yr}</b>` : `<b class="is-void" aria-hidden="true"></b>`}` +
      `<small>${sub}</small></span>` +
      `<span class="c05v2-rp">${MC.ltr(o.pts != null ? o.pts : "")}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ share */
  // The sole lies on the turf, toe up, beside the print it just left: "my mark". The studs face
  // the camera, as they do on every render; the framing is a boot put down after a match, never
  // a sole raised at someone.
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const t = tierKey(p);
    const u = MC.uid("c05v2s");
    // the print a sole leaves is its mirror image: the stud marks of this boot, pressed into the turf
    // the print keeps the story's 24px margin on its outer side
    const sc = 0.56;
    const ox = ar ? r1(25 - 22 * sc) : r1(335 - 241 * sc),
      oy = 136;
    const prMap = (x, y) => [r1(ox + (ar ? x : MIRROR - x) * sc), r1(oy + y * sc)];
    const pit = "#010a05",
      lip = "#9ccfa8";
    const marks = STUDS[t]
      .map((s) => {
        const [x, y] = prMap(s.x, s.y);
        if (s.t === "blade") {
          const a = ar ? s.a : 180 - s.a;
          const c = (col, dx, dy, op, k) =>
            `<path d="${BLADE}" transform="translate(${r1(x + dx)} ${r1(y + dy)}) rotate(${a}) scale(${r2(sc * k)})" fill="${col}" opacity="${op}"/>`;
          return (
            c(lip, -0.6, -0.8, 1, 1.18) +
            c(pit, 0, 0, 0.9, 1) +
            `<circle cx="${r1(x + 7)}" cy="${r1(y - 4)}" r=".9" fill="${lip}"/><circle cx="${r1(x - 6)}" cy="${r1(y + 5)}" r=".7" fill="#6fae80"/>`
          );
        }
        const r = r1((s.r || 7) * sc);
        return (
          `<circle cx="${r1(x - 0.5)}" cy="${r1(y - 0.7)}" r="${r1(r + 1.6)}" fill="${lip}"/>` +
          `<circle cx="${x}" cy="${y}" r="${r}" fill="${pit}" opacity=".9"/>` +
          (s.t === "nub"
            ? ""
            : `<circle cx="${r1(x + r + 1.6)}" cy="${r1(y + 1)}" r=".9" fill="${lip}"/><circle cx="${r1(x - r)}" cy="${r1(y + r + 1.2)}" r=".7" fill="#6fae80"/>`)
        );
      })
      .join("");
    // grass pressed flat where the plate stood, and the centre circle the plate printed into it
    const outline = `<path d="${pathOf((x, y) => prMap(x, y))}" fill="#4f8f63" fill-opacity=".24" stroke="${lip}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="2.5 3"/>`;
    const [ccx, ccy] = prMap(LAY.cir.x, LAY.cir.y);
    const circ = `<circle cx="${ccx}" cy="${ccy}" r="${r1(LAY.cir.r * sc)}" fill="none" stroke="${lip}" stroke-opacity=".5" stroke-width="1.6"/>`;
    const name = MC.nameOf(p, o);
    // a chalk touchline in perspective across the lower third
    const tl = ar ? "M360 548L0 482" : "M0 548L360 482";
    return (
      `<div class="c05v2 c05v2-share t-${t.toLowerCase()}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg class="c05v2-sh-bg" viewBox="0 0 360 640" width="360" height="640" aria-hidden="true" focusable="false"><defs>` +
      `<filter id="${u}-g" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".55 1.9" numOctaves="3" seed="11" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .86  0 0 0 0 .55  2.4 0 0 0 -1.15"/></filter>` +
      `<filter id="${u}-ch" x="-2%" y="-20%" width="104%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="3" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.62" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>` +
      `<radialGradient id="${u}-fl" cx="${ar ? 0.15 : 0.85}" cy="0" r="1.05"><stop offset="0" stop-color="#e9f3ff" stop-opacity=".34"/><stop offset=".45" stop-color="#9fd0ff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="${u}-vg" cx=".5" cy=".45" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".66"/></radialGradient>` +
      `<filter id="${u}-pb" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".35"/></filter>` +
      `</defs>` +
      `<rect width="360" height="640" fill="#0a2416"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7]
        .map((i) => `<rect y="${i * 80}" width="360" height="40" fill="#0d2c1b"/>`)
        .join("") +
      `<rect width="360" height="640" filter="url(#${u}-g)" opacity=".38"/>` +
      `<path d="${tl}" stroke="#eef3ea" stroke-width="5.5" opacity=".92" filter="url(#${u}-ch)"/>` +
      `<rect width="360" height="640" filter="url(#${u}-g)" opacity=".2" style="mix-blend-mode:multiply"/>` +
      `<g filter="url(#${u}-pb)">${outline}${circ}${marks}</g>` +
      `<rect width="360" height="640" fill="url(#${u}-fl)"/>` +
      `<rect width="360" height="640" fill="url(#${u}-vg)"/>` +
      `</svg>` +
      `<div class="c05v2-sh-logo">${MC.logo("wordmark", { variant: "light" })}</div>` +
      `<div class="c05v2-sh-card">${full(p, { ...o, motion: false, beat: undefined })}</div>` +
      `<div class="c05v2-sh-cap">${name ? `<b class="${ar ? "is-ar" : ""}">${esc(name)}${founderYear(p)}</b>` : `<b class="is-void" aria-hidden="true"></b>`}` +
      `<span>${p.tier === null ? "" : `<em>${esc(S.tiers[t])}</em> `}${MC.ltr(p.season)}</span>` +
      // a provisional number says so on the image itself, in text
      (p.provisional ? `<span class="c05v2-sh-prov">${PROV[ar ? "ar" : "lat"]}</span>` : "") +
      `</div>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ tilt (detail only) */
  function mount(el) {
    if (!el || el.__c05v2 || !el.classList || !el.classList.contains("c05v2-full")) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.__c05v2 = true;
    el.classList.add("is-live");
    const set = (rx, ry) => {
      el.style.setProperty("--c05v2-rx", rx + "deg");
      el.style.setProperty("--c05v2-ry", ry + "deg");
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
    id: "c05-v2",
    n: 5,
    refinedFrom: "c05",
    name: "Semelle",
    nameAr: "النعل",
    category: "bold",
    philosophy:
      "Your BotolaGO identity is the soleplate of your boot: the stud pattern is your tier, and BotolaGO's pitch is moulded into it, with the 84 at the centre spot.",
    philosophyAr:
      "هويتك في BotolaGO هي نعل حذائك: نمط المسامير يدل على مستواك، وملعب BotolaGO مصبوب فيه، والرقم 84 في نقطة الوسط.",
    gridWidth: 170,
    detailWidth: 260,
    idea: [
      "The card is a right football-boot soleplate shown toe-up, the way boots hang studs-out on a boot-room rack: a tight toe tip pushed toward the big toe, with the little-toe side raked back from it in a long line; a short lip where toe spring wraps the tip of the plate past the rim; an outer edge that runs almost straight; an arch cut in on the big-toe side (the waist is about 64% of the forefoot); and a squared heel-counter cup. That asymmetry is what makes it a boot plate rather than an insole, a flip-flop or a footprint.",
      "BotolaGO's own pitch is moulded into the plate, which keeps it out of any bootmaker's territory. The halfway line is the forefoot flex groove, running edge to edge exactly where the plate bends; the centre circle rings the 84, which sits on the centre spot; the penalty box is the raised midfoot plate that carries the four decisions, its D facing the halfway line.",
      "It reads top to bottom in order of importance: the 84; then ALI ·26 and the tier tag across the ball; then the decisions on the box plate; then the hood in the arch; then the founder year clock, the BOT #004821 style code and the country in the heel. The 84, the name, the tier tag and the box plate share one axis through the centre spot. The season follows the toe as a second production mark, and the club is the heel counter in its own colours with the crest stamped inside the cup.",
      "The manager is the shared hooded figure moulded into the arch shank as low relief in the plate's own material: 12% darker, a lit rim at the upper-left, the hood and yoke seams pressed in. It stands off the axis toward the arch, so the whole hood, its peak and its centre seam stay on the plate and only the far shoulder runs under the arch rim. Below it the shank steps up to the heel plate, and the torso tucks under that moulded ledge. There is no window and no photo slot.",
      "The tier is the stud pattern, which every five-a-side player in Morocco has lived: turf nubs, round moulded cones, firm-ground blades, screw-in steel, then six machined studs. The surface climbs with it: new gum rubber, matte moulded rubber, smoked frosted TPU, carbon twill under clear coat, and a smoked clear plate over a steel chassis.",
    ],
    belonging: [
      "Boots are the most coveted object in a young player's football life, and nobody needs the ladder explained. 'Mine has steel now' is a sentence a 15-year-old already says about boots.",
      "Comparing two soles is instant and physical: a gum nub field against six steel studs. Friends compare stud patterns the way they compare boots in the changing room, and the 84 at the centre spot is the first thing either of them sees.",
      "Latin cards are a right boot and Arabic cards a left boot, so two friends in different app languages hold a pair: a small fact people find and share.",
      "The share image lays the sole on a night pitch beside the print it just left in the turf, stud by stud and with the centre circle pressed into the grass: 'my mark', a picture worth posting rather than a card on a flat colour.",
      "A founder's clock points at 26, the first year the mould ever carried. Everyone who joins later has an arrow further round the dial.",
    ],
    founderMark: [
      "Every moulded part carries an injection-moulding date clock. Here the dial is raised 1.5 units in the plate's own material with a lit rim, carries the mould's years 26 to 31 round its edge, and its arrow points at the year the account was made: 26 for ALI, the first number on the mould.",
      "A founder's clock is set in a machined steel insert ring, with lathe rings and a specular arc, and FOUNDER 2026 moulded round its top. On the card the name carries the year as 'ALI ·26' in cream or the plate's own ink. In the ranking row and the share image the year takes the name's own ink and weight, and its dot is a small steel bead in a dark socket, the clock's insert ring in miniature, so it reads as a founder mark rather than a muted suffix or an age. There is no gold, brass or champagne anywhere: steel is the concept's one precious material.",
      "A non-founder has the same clock moulded flat into the plate, without the ring or the arc. On the 44–80px token the founder sign is the steel ring and the dial's arrow in the heel; on the 24–28px mini it is a steel bead of at least 3px in a dark socket ring at the shield's point, so it holds on LEGEND's light steel as well as on navy.",
    ],
    small: [
      "44–80px: the whole sole lies horizontal, toe at the inline end and arch along the bottom, with the 84 across the forefoot and the tier's studs round it: a gum nub field, eight grey cones, blades with Logo Blue tips and a 1px light specular edge, six steel screw-ins on a 3px carbon twill, or six machined studs breaking the edge. The heel counter carries the club colour (rule 8) and the heel carries the founder's steel ring.",
      "24–28px: a dedicated mini of the forefoot alone, a toe-cap shield about 27px wide at 28px tall that leaves most of the 91px name cell free. Its base is cut to a soft, uneven point, so it is never a plain arch. It carries the 84, and the tier's stud signature sits at least 1px clear of the digits: six turf nubs, four cones, three blades, four screw-in steel rings, or four machined studs that break the outline. The founder's steel bead sits in a dark socket at the point.",
      "As a solid shape the card is a boot plate: a raked, pointed toe with a toe-spring lip, a straight outer edge, a cut-in arch and a squared heel cup. LEGEND adds steel bumps on both edges and a toe guard.",
    ],
    rtl: [
      "Arabic cards show the LEFT boot: the outline, studs, hood relief and pitch are drawn with mirrored coordinates, on purpose, so the two languages make a pair. The light is not mirrored and still comes from the top-left. Text never mirrors: علي is set in Changa 800, labels in Noto Sans Arabic with no letter-spacing.",
      "On the box plate Arabic mirrors only the label side: القائد opens the first row on the right, each label opens its pair and its figure follows 5 units to its left, the figures stay left to right, and the same moulded rib separates the two pairs. 84, BOT #004821, the clock's years and 2026/27 are LTR runs, and the founder form reads علي ·26 with the year after the name in reading order.",
    ],
    tiers: {
      HOMA: "Turf trainer in new gum rubber: honey-brown, translucent where it is thick, with a crisp moulded edge and a parting line, and a field of round turf nubs, each with its own side wall. Full outline, raw but new.",
      STADE:
        "Artificial-grass sole in matte moulded rubber: a fine dry tooth, no sheen, and round conical studs with flat grey tops and real height.",
      PRO: "Firm-ground smoked TPU: Logo Blue pulled about 35% toward navy and smoked, frosted with a precomputed fine grain, its thickness visible at the edge. Ten tapered blades whose tips are the only full-strength Logo Blue, plus a 1-unit Logo Blue edge inside the rim.",
      CHAMPION:
        "Soft-ground hybrid on a visible carbon twill under a gloss clear coat: six screw-in polished steel studs on moulded bosses, and four blades with steel tips.",
      LEGEND:
        "A smoked clear plate over a machined steel chassis that is the pitch itself (halfway bar, centre-circle ring, box frame and the clock's ring), with visible thickness and a refraction line. The 84 is machined steel numerals: a polished face, a thin chamfer and a short side wall, with no outline. Six machined studs set into the edge break the outline, and a slim steel toe guard lengthens the toe.",
    },
    legend: [
      "LEGEND is the only tier whose black-and-white outline changes: six steel studs stand proud of both edges and a machined toe guard extends the toe, so it reads as a solid shape at 32px and on the mini.",
      "Its precious moment is machined steel, not gold. The pitch lines that are engraved grooves on every other tier become a brushed-steel skeleton seen through the clear plate, and the 84 is cut from the same steel. It has the fewest, heaviest elements, and the stats stay on the front.",
    ],
    advantages: [
      "The pitch moulded into the plate (halfway flex groove, centre circle round the 84, box plate for the stats) is BotolaGO's own geometry. It keeps the object out of Nike, Adidas and Puma territory and makes the hierarchy read like a match: the kick-off number comes first.",
      "The tier ladder is real-world knowledge and reads in monochrome: nubs, cones, blades, steel. STADE and CHAMPION now differ by surface as well (matte rubber against carbon twill with steel), so they separate in a 44px row.",
      "Every data item has a physical carrier native to the object: the style code and clock in the heel, the decisions on the box plate, the season on the toe and the club on the heel counter.",
      "The mini is a dedicated toe-cap shield about as wide as it is tall, so it fits the ranking row's name cell without eating it.",
      "Right and left boots for Latin and Arabic turn mirroring into a story instead of a constraint.",
    ],
    risks: [
      "Cultural risk, stated first and untested: showing someone the sole of a shoe is an insult in Morocco, and a critic's cousin made the joke at once. The studded underside faces the viewer on every render, so the sole is always shown to whoever is looking. The mitigation is framing, not orientation: it hangs toe-up like a boot on a boot-room rack, a sole is never pointed at an opponent (head-to-head minis sit side by side, parallel and toe-up), and the share image lays it on the turf beside its print. Whether that framing is enough is unknown. It needs testing with 5–8 Moroccan teenagers and adults before the direction goes any further.",
      "A boot belongs to a player more than to a manager, and an older Fantasy user may find a sole a gimmicky identity.",
      "The hood relief reads as a hooded figure seen from behind at 260px and up. In the 180–200px tier strip it is small and low in contrast, faintest on HOMA's honey gum. If testing finds it unclear, keep the figure in the share image only, as the refinement brief allows.",
      "As a bare silhouette at 120px the raked toe and the cut-in arch make it a sole, but without its studs it can still pass for a generic shoe sole rather than specifically a football boot.",
      "The 44–80px token is about 2:1 wide and cannot sit in a square avatar circle; the mini shield covers that case.",
      "Stud geometry must stay generic (round nubs, cones, tapered blades, screw-ins) so that no brand's signature plate is evoked.",
      "Mirroring the boot for Arabic may confuse people who compare cards across languages; it needs one line of explanation in the product.",
      "The mould's years 26–31 round the clock are fine print, about 5px on a 260px card. They are texture; the arrow and the steel ring carry the meaning.",
    ],
    refinementNotes: [
      {
        title: "Silhouette",
        items: [
          "Redrawn as a real right-foot soleplate: a tight toe tip pushed toward the big toe, with the little-toe side raked back from it in a long line; toe spring built into the outline as a short lip where the plate wraps past the rim at the tip; an almost straight outer edge; the arch eased to a 64% waist so it reads as a plate rather than a footprint; and a squared heel-counter cup. The bowling-pin waist, the round heel and the domed, insole-like toe are gone.",
          "Turned toe-up, like a boot hung on a rack, so the forefoot leads.",
        ],
      },
      {
        title: "Hierarchy and pitch geometry",
        items: [
          "It now reads 84, then ALI ·26 and the tier, then the stats, then the hood, then the founder clock and BOT ID. v1 put the founder wheel and ID first and the rating last.",
          "The 84, the name, the tier tag and the box plate share one axis through the centre spot. The box plate is lifted and kept short so that it centres there, instead of sliding toward the lateral edge.",
          "The halfway line is moulded as the forefoot flex groove, the centre circle rings the 84, and the penalty box with its D is the raised plate for the stats. The chevron/X chassis and the swoosh-like flex lines are gone.",
        ],
      },
      {
        title: "Founder mark and materials",
        items: [
          "The brass wheel is now an injection-moulding year clock in the plate's own material: raised 1.5 with a lit rim, years 26–31, the arrow on 26, set in a machined-steel insert ring. There is no gold anywhere.",
          "The ·26 after the name is cream or plate ink on the card. In the row and the share image the year takes the name's own ink at weight 800, and its dot is a steel bead in a dark socket, so the year reads as a founder mark and not as a muted suffix or an age.",
          "LEGEND's 84 is machined steel numerals (a polished face, a thin chamfer, a short dark-steel side wall and a soft shadow) instead of a white numeral with a heavy black outline. The LEGEND thumb drops the empty box frame along with the stats.",
          "PRO is smoked frosted TPU (Logo Blue about 35% toward navy) with a precomputed fine grain instead of the noise filter that read as denim. Full Logo Blue appears only on the blade tips and a 1-unit edge.",
          "HOMA is honey-brown gum rubber with a crisp moulded edge, no longer a plaster. STADE is matte rubber with round cones; CHAMPION is visible carbon twill with a gloss sheen and steel-tipped blades.",
        ],
      },
      {
        title: "Avatar",
        items: [
          "The rectangular photo window and its centred solid bust are removed. The hooded figure is low relief in the plate's material: 12% darker, a lit rim strong enough to read, and the seams pressed in.",
          "It stands off the axis toward the arch, so the whole hood, its peak and its centre seam stay on the plate and only the far shoulder runs under the arch rim. The torso tucks under the shank step, a moulded ledge, instead of being cut off flat.",
        ],
      },
      {
        title: "Stats and typography",
        items: [
          "A 2×2 grid on the box plate: values in Manrope 700 tabular, labels in Manrope 600 caps at 70%, with raised lettering (a 1-unit lit edge and a shadow).",
          "Each figure sits 5 units after its label, so each row reads as two label–figure pairs. The pairs keep 9.5 units off the plate's frame, and the gutter between them (at least twice the label–figure gap, in both scripts) carries a moulded rib. Arabic mirrors only the label side.",
          "Moulded type uses offset highlight and shadow copies instead of a lighting filter, which is crisper at small sizes and cheaper to render.",
        ],
      },
      {
        title: "Small sizes and share",
        items: [
          "A new 24–28px mini: a toe-cap shield about 27px wide at 28px. It carries the 84 at 88% of the first pass's size, and the tier's stud signature (6 nubs, 4 cones, 3 blades, 4 steel rings, or LEGEND's studs off the edge) sits at least 1px clear of the digits. The founder sign is a steel bead of at least 3px in a dark socket ring, visible on LEGEND's light steel too. v1's wide pill ate the 91px name cell.",
          "The 44–80px token keeps the whole horizontal sole, with the club primary on the heel counter and the founder's steel ring in the heel. PRO's Logo Blue blade tips carry a 1px light specular edge, so they read on the smoked plate in a 44px row. CHAMPION's twill is drawn at 3px cells so it separates from STADE.",
          "In the share image the sole and its print keep the story's 24px margin, matching the logo and the headline.",
        ],
      },
    ],
    full,
    token,
    row,
    share,
    mount,
  });
})();
