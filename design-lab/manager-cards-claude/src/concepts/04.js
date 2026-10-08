/* 04 POCHOIR (bold). The spray stencil used to number tournament bibs and mark
   neighbourhood walls, going from hand-cut cardboard to laser-cut brass. The card is
   the TOOL, not the print: the 84, the name, the stats and the manager are cut through
   the plate, so whatever sits behind the card shows through your number.
   Holes are real transparency (an SVG mask), never white shapes. */
(function () {
  const MC = window.MC;
  const BLUE = "#0151fc";
  const NAVY = "#0c3164";
  const FS = 0.56;
  const FIG = `translate(230 80) scale(${FS})`;
  const r2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => MC.esc(s);

  /* The plate outline. Founder plates carry a punched half-round notch in the bottom edge,
     under the perfin column: the same notch is the founder mark on the token. */
  const NOTCH = { x: 314, r: 5 };
  const plateD = (founder) =>
    "M3 0H324L360 36V237A3 3 0 0 1 357 240" +
    (founder ? `H${NOTCH.x + NOTCH.r}A${NOTCH.r} ${NOTCH.r} 0 0 0 ${NOTCH.x - NOTCH.r} 240` : "") +
    "H3A3 3 0 0 1 0 237V3A3 3 0 0 1 3 0Z";
  // the print sheet under the LEGEND plate: the plate's outline with a 14u top margin
  const SHEET = "M3 -14H324L360 22V237A3 3 0 0 1 357 240H3A3 3 0 0 1 0 237V-11A3 3 0 0 1 3 -14Z";

  /* Material, cut and finish per tier. bw = bridge width (u), wall = cut-wall depth,
     base = plate colour, mesh = screen-mesh thread colour (holds floating counters). */
  const TIER = {
    HOMA: { bw: 5, wall: 2.4, wallC: "FLUTE", lipC: "#ead8b2", ink: "#1f1b17", spray: 0.45, sd: 8.5, rough: 2.5, thick: 0, base: "#bda27d", mesh: "#8e7350", tight: 0.95 },
    STADE: { bw: 3.5, wall: 1, wallC: "#5d7590", lipC: "#ffffff", ink: "currentColor", spray: 0.55, sd: 6, rough: 0, thick: 0, base: "#cfdbe5", mesh: "#9fb3c8", tight: 0.95 },
    PRO: { bw: 3, wall: 2, wallC: "#3a2006", lipC: "#f2c47e", ink: "#08162e", spray: 0.5, sd: 7.5, rough: 0, thick: 0, base: "#a9692a", mesh: "#d9a35a", tight: 0.95 },
    CHAMPION: { bw: 2.5, wall: 0, wallC: "#6e521c", lipC: "#fff0c2", ink: "#3d2c08", spray: 0.5, sd: 6, rough: 0, thick: 1.6, edge: "#7a5c22", base: "#c9a84a", mesh: "#e2c773", tight: 0.9 },
    LEGEND: { bw: 0, wall: 3, wallC: "#6e521c", lipC: "#fff3cf", ink: "#3d2c08", spray: 0.42, sd: 3.2, rough: 0, thick: 3, edge: "#6e521c", base: "#e3c27a", mesh: "#d8b868", tight: 0.8 },
  };

  /* 5×7 punch matrix for the perfin (founder year and BotolaGO ID). */
  const DOT = {
    0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
    4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  };
  function punch(str, x, y, pitch, r, adv) {
    let s = "";
    [...String(str)].forEach((ch, i) => {
      const g = DOT[ch];
      if (!g) return;
      g.forEach((row, ry) =>
        [...row].forEach((b, rx) => {
          if (b === "1") s += `<circle cx="${r2(x + i * adv + rx * pitch)}" cy="${r2(y + ry * pitch)}" r="${r}"/>`;
        }),
      );
    });
    return s;
  }

  /* Text measuring: names are cut in Changa 800 into a fixed 170u box, so the width is
     measured once the face is loaded (an estimate stands in until then). */
  try {
    if (document.fonts && document.fonts.load) ["800 40px Changa", "700 15px Changa"].forEach((f) => (document.fonts.load(f, "AZ"), document.fonts.load(f, "علي")));
  } catch (e) {
    /* measuring falls back to the estimate */
  }
  let ctx2d = null;
  function textW(font, text, est) {
    try {
      if (document.fonts && document.fonts.check(font, text)) {
        ctx2d = ctx2d || document.createElement("canvas").getContext("2d");
        ctx2d.font = font;
        return ctx2d.measureText(text).width;
      }
    } catch (e) {
      /* fall through */
    }
    return est;
  }
  const NAME_BOX = 170;
  function nameFit(name, ar) {
    const w40 = textW("800 40px Changa", name, name.length * (ar ? 0.5 : 0.62) * 40);
    const fs = Math.max(22, Math.min(40, (40 * NAME_BOX) / Math.max(1, w40)));
    return { fs: r2(fs), fit: (w40 * fs) / 40 > NAME_BOX + 0.5 };
  }

  /* ------------------------------------------------------------ the cut shapes */
  // Everything that is cut through the plate, as inner SVG for four groups:
  // h1 the 84 and the figure, h2 the name and the crest (and metal pin holes), h3 the stat
  // line, h4 the perfin. fb is the bridge mask (where plate material stays inside a cut).
  function cutShapes(p, o, tierKey, thumb, u) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const t = TIER[tierKey];
    const legend = tierKey === "LEGEND";
    const metal = tierKey === "CHAMPION" || legend;
    const name = MC.nameOf(p, o);

    // the 84: Saira Stencil's own bridges; LEGEND is laser-cut Changa with floating counters
    const n84 = legend
      ? `<text x="15.1" y="158" font-family="Changa" font-weight="800" font-size="163.6">${p.ovr}</text>`
      : `<text x="13.9" y="158" font-family="Saira Stencil One" font-size="153">${p.ovr}</text>`;

    // the manager seen from behind, hood up (the shared figure's default), cut as negative space
    const A = MC.AVATAR;
    const k = 1 / FS;
    const bwA = r2(t.bw * k);
    const yoke = "M-8 220C48 196 152 196 208 220";
    let figure, figBridges;
    if (A.hood) {
      figure = `<g transform="${FIG}"><path d="${A.torso}"/><path d="${A.collar}"/><path d="${A.hood}"/></g>`;
      // the hood stays one clean hole that flows into the shoulders (a seam down it, or a rim
      // all the way across, reads as a dome or a bell); a short bridge marks the back of the
      // hood's rim, and the jacket keeps its yoke and centre-back seams
      const rim = "M78 164C90 160.5 110 160.5 122 164";
      figBridges = legend
        ? /* bridgeless: the rim and the seams float as islands, held only by the screen mesh */
          `<g transform="${FIG}" fill="none" stroke="#000" stroke-linecap="round"><path d="M80 164C90 161 110 161 120 164" stroke-width="${r2(1.6 * k)}"/><path d="M30 211C70 198 130 198 170 211" stroke-width="${r2(1.8 * k)}"/><path d="M100 213V234" stroke-width="${r2(1.6 * k)}"/></g>`
        : `<g transform="${FIG}" fill="none" stroke="#000"><path d="${rim}" stroke-width="${bwA}" stroke-linecap="round"/>` +
          `<path d="${yoke}" stroke-width="${bwA}"/><path d="M100 205V246" stroke-width="${bwA}"/></g>`;
    } else {
      // older kit without the hood: bare head, nape and collar bridges
      figure = `<g transform="${FIG}"><path d="${A.torso}"/><path d="${A.neck}"/><path d="${A.head}"/><path d="${A.hair}"/><path d="${A.ears}"/></g>`;
      const nape = "M72 131C80 126 90 131 100 138C110 131 120 126 128 131";
      figBridges = legend
        ? `<g transform="${FIG}" fill="none" stroke="#000" stroke-linecap="round"><path d="${nape}" stroke-width="${r2(1.5 * k)}"/><path d="M30 211C70 198 130 198 170 211" stroke-width="${r2(1.8 * k)}"/></g>`
        : `<g transform="${FIG}" fill="none" stroke="#000"><path d="${nape}" stroke-width="${bwA}"/><path d="M68 168C82 161 118 161 132 168" stroke-width="${bwA}"/><path d="${yoke}" stroke-width="${bwA}"/><path d="M100 205V246" stroke-width="${bwA}"/></g>`;
    }

    // the name: Changa 800 in a fixed box (Latin x20–190, Arabic x44–214), crest in a fixed slot
    const nf = nameFit(name, ar);
    const fit = nf.fit ? ` textLength="${NAME_BOX}" lengthAdjust="spacingAndGlyphs"` : "";
    const nameCut = ar
      ? `<text x="214" y="${r2(186 + 0.25 * nf.fs)}" text-anchor="start" direction="rtl" font-family="Changa" font-weight="800" font-size="${nf.fs}"${fit}>${esc(name)}</text>`
      : `<text x="20" y="${r2(186 + 0.35 * nf.fs)}" font-family="Changa" font-weight="800" font-size="${nf.fs}"${fit}>${esc(name)}</text>`;
    const crestT = `translate(${ar ? 20 : 196} 175.5) scale(.45)`;
    const crestCut = thumb ? "" : `<g transform="${crestT}"><path d="${MC.CREST.shield}"/></g>`;
    const crestBridges = thumb ? "" : `<g transform="${crestT}" fill="#000"><path d="${MC.CREST.sash}"/><circle cx="20" cy="22" r="5.6"/></g>`;

    const pins = metal ? `<circle cx="348" cy="104" r="2.6"/><circle cx="348" cy="226" r="2.6"/>` : "";

    // one stat line, cut: Changa 700 15u, right to left in Arabic, digits stay LTR
    const stats = thumb
      ? ""
      : ar
        ? `<text x="340" y="229" direction="rtl" text-anchor="start" font-family="Changa" font-weight="700" font-size="15" style="white-space:pre">${esc(MC.STATS.map((key) => `${S.stats[key]} ${p.stats[key]}`).join("   "))}</text>`
        : `<text x="20" y="229" font-family="Changa" font-weight="700" font-size="15" letter-spacing=".45" style="white-space:pre">${esc(MC.STATS.map((key) => `${S.stats[key]} ${p.stats[key]}`).join("   "))}</text>`;

    const perfin = !p.founder ? "" : thumb ? `<circle cx="341" cy="55" r="4"/>` : punch(p.founder, 284.2, 44, 2.6, 0.82, 16.4) + punch(p.serial, 286.5, 63.5, 1.6, 0.52, 9.8);

    const rough = t.rough ? ` filter="url(#${u("rough")})"` : "";
    return {
      fb: `<mask id="${u("fb")}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="380" height="260"><rect x="-10" y="-10" width="380" height="260" fill="#fff"/>${figBridges}${crestBridges}</mask>`,
      rough: t.rough ? `<filter id="${u("rough")}" filterUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="${t.rough}" xChannelSelector="R" yChannelSelector="G"/></filter>` : "",
      roughAttr: rough,
      h1: `<g id="${u("h1")}"${rough}>${n84}<g mask="url(#${u("fb")})">${figure}</g></g>`,
      h2: `<g id="${u("h2")}"${rough}><g mask="url(#${u("fb")})">${nameCut}${crestCut}</g>${pins}</g>`,
      h3: `<g id="${u("h3")}"${rough}>${stats}</g>`,
      h4: `<g id="${u("h4")}">${perfin}</g>`,
      // the name and stat lettering alone (for the screen mesh that holds their counters)
      lettering: `<g${rough}>${nameCut}</g>`,
      statText: `<g${rough}>${stats}</g>`,
    };
  }

  /* ------------------------------------------------------------------ full card */
  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tierKey = TIER[p.tier] ? p.tier : "PRO";
    const t = TIER[tierKey];
    const legend = tierKey === "LEGEND";
    const metal = tierKey === "CHAMPION" || legend;
    const thumb = !!o.thumb;
    const id = MC.uid("c04");
    const u = (k) => `${id}-${k}`;
    const url = (k) => `url(#${u(k)})`;
    const PLATE = plateD(p.founder);
    const C = cutShapes(p, o, tierKey, thumb, u);
    const use = (h, fill, extra = "") => `<use href="#${u(h)}" fill="${fill}"${extra}/>`;
    const allHoles = (fill) => use("h1", fill) + use("h2", fill) + use("h3", fill) + use("h4", fill);
    const BOX = `filterUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288" color-interpolation-filters="sRGB"`;
    const MBOX = `maskUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288"`;
    const R = (fill, extra = "") => `<rect x="-6" y="-6" width="372" height="252" fill="${fill}"${extra}/>`;

    /* ---- masks ---- */
    let defs = C.fb + C.rough + C.h1 + C.h2 + C.h3 + C.h4;
    defs += `<mask id="${u("M")}" ${MBOX}><path d="${PLATE}" fill="#fff"${C.roughAttr}/>${allHoles("#000")}</mask>`;
    defs += `<mask id="${u("MH")}" ${MBOX}>${allHoles("#fff")}</mask>`;
    if (!thumb && !legend) defs += `<mask id="${u("MT")}" ${MBOX}><g fill="#fff">${C.lettering}</g><g fill="#8a8a8a">${C.statText}</g></mask>`;
    if (t.wall) {
      const w = t.wall;
      defs +=
        `<mask id="${u("wm")}" ${MBOX}>` +
        use("h1", "#fff") + use("h1", "#000", ` transform="translate(${w} ${w})"`) +
        use("h2", "#fff") + use("h2", "#000", ` transform="translate(${r2(w * 0.6)} ${r2(w * 0.6)})"`) +
        use("h3", "#fff") + use("h3", "#000", ` transform="translate(${r2(w * 0.32)} ${r2(w * 0.32)})"`) +
        use("h4", "#fff") + use("h4", "#000", ` transform="translate(.55 .55)"`) +
        `</mask>` +
        `<mask id="${u("lm")}" ${MBOX}>` +
        use("h1", "#fff") + use("h1", "#000", ` transform="translate(-1 -1)"`) +
        use("h2", "#fff") + use("h2", "#000", ` transform="translate(-.7 -.7)"`) +
        `</mask>`;
    }
    // light ground only: a firm 1.4u wall on the stat line so small lettering keeps its edge
    if (!thumb) defs += `<mask id="${u("w3")}" ${MBOX}>${use("h3", "#fff")}${use("h3", "#000", ` transform="translate(1.4 1.4)"`)}</mask>`;
    defs += `<g id="${u("hs")}">${use("h1", "#000")}${use("h2", "#000")}${use("h3", "#000")}</g>`;

    /* ---- paint: a wide overspray coat, plus a tight rim pass on the small lettering ---- */
    defs += `<filter id="${u("spray")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation="${t.sd}" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".95" numOctaves="1" seed="${tierKey.length * 7}" result="n"/><feComposite in="b" in2="n" operator="arithmetic" k1="0" k2="2.4" k3="-1" k4="-.06" result="d"/><feComponentTransfer in="d" result="dots"><feFuncA type="linear" slope="2.6"/></feComponentTransfer><feComponentTransfer in="b" result="haze"><feFuncA type="linear" slope=".8"/></feComponentTransfer><feFlood flood-color="${BLUE}" flood-opacity="${t.spray}"/><feComposite in2="haze" operator="in" result="hz"/><feFlood flood-color="${BLUE}" flood-opacity=".9"/><feComposite in2="dots" operator="in" result="dt"/><feMerge><feMergeNode in="hz"/><feMergeNode in="dt"/></feMerge></filter>`;
    defs += `<filter id="${u("tight")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation="1.3"/><feComponentTransfer result="a"><feFuncA type="linear" slope="3.2"/></feComponentTransfer><feFlood flood-color="${BLUE}" flood-opacity="${t.tight}"/><feComposite in2="a" operator="in"/></filter>`;
    defs += `<filter id="${u("sh")}" ${BOX}><feGaussianBlur stdDeviation="4.5"/></filter>`;
    const mesh2 = (c, w) => `<pattern id="${u("mesh")}" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${w}" height="2.4" fill="${c}"/><rect width="2.4" height="${w}" fill="${c}"/></pattern>`;
    if (!thumb || legend) defs += mesh2(t.mesh, legend ? 0.42 : 0.45);

    /* ---- plate face per tier ---- */
    let face = "";
    let over = ""; // on the face, above the paint (rims, guide lines, overcuts)
    if (tierKey === "HOMA") {
      // matte kraft: directional fibres, a little soaking, corrugation where the liner tore
      defs +=
        `<pattern id="${u("FLUTE")}" width="3.2" height="10" patternUnits="userSpaceOnUse"><rect width="3.2" height="10" fill="#3a2a12"/><rect width="1.1" height="10" fill="#7a6040"/></pattern>` +
        `<pattern id="${u("ridge")}" width="3.2" height="10" patternUnits="userSpaceOnUse"><rect width="3.2" height="10" fill="#6c5434"/><rect x=".5" width="1.7" height="10" fill="#c7ad84"/><rect x=".9" width=".5" height="10" fill="#e1caa1"/></pattern>` +
        `<filter id="${u("kb")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="3" seed="11"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .3  0 0 0 0 .18  0 0 0 2.3 -1.02"/></filter>` +
        `<filter id="${u("fib")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".9 .04" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .22  0 0 0 0 .12  0 0 0 2.6 -1.05"/></filter>` +
        `<filter id="${u("fibL")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".75 .03" numOctaves="2" seed="17"/><feColorMatrix values="0 0 0 0 .93  0 0 0 0 .86  0 0 0 0 .72  0 0 0 2.6 -1.1"/></filter>`;
      const torn = "M98 0H268L265 2.6 259 4.3 254 3.4 248 6.1 241 5.2 235 7.4 227 6.3 219 8.1 212 6.6 204 7.6 196 6 189 7.3 181 5.7 173 6.9 165 6.2 157 7.7 149 6.4 141 5.1 133 6 125 4.3 117 4.9 110 3 104 2.2Z";
      face =
        R(t.base) +
        R("#000", ` filter="${url("kb")}" opacity=".1"`) +
        R("#000", ` filter="${url("fib")}" opacity=".13"`) +
        R("#000", ` filter="${url("fibL")}" opacity=".1"`) +
        `<g opacity=".05" stroke="#2b1d0b" stroke-width="1.2">${Array.from({ length: 46 }, (_, i) => `<path d="M${4 + i * 7.8} 0V240"/>`).join("")}</g>` +
        `<path d="${torn}" fill="url(#${u("ridge")})"/><path d="${torn.replace(/^M98 0H268/, "M268 0").replace(/Z$/, "")}" fill="none" stroke="#efe0bf" stroke-width=".7" stroke-opacity=".9"/>`;
      // pencil guide lines and knife overcuts: the layout was drawn by hand, then cut
      if (!thumb)
        over =
          `<g stroke="#3d3a36" stroke-width=".45" stroke-opacity=".5" fill="none" stroke-linecap="round">` +
          `<path d="M10 48.6H222M10 158H222M10 ${ar ? 196 : 200}H226M10 229H${ar ? 344 : 236}M20 34V236M214 40V214"/>` +
          `<path d="M330 40V78" stroke-dasharray="2 2.4"/></g>` +
          `<g stroke="#241708" stroke-width=".6" stroke-opacity=".75" stroke-linecap="round" fill="none">` +
          `<path d="M200.6 145.4l6.8 0M174.2 158.2l0 5.6M200.6 158.3l0 5.2M20.6 52l-4.4-3.6M284 220.6l0 4.8M234 214.4l-4.6 0M338 214.4l4.8 0"/></g>`;
    } else if (tierKey === "STADE") {
      // frosted acetate: the plate tints the ground; frost only near the edges, no sheen
      defs +=
        `<filter id="${u("frost")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.72"/></filter>` +
        `<filter id="${u("fe")}" ${BOX}><feGaussianBlur stdDeviation="5"/></filter>` +
        `<mask id="${u("edgeband")}" ${MBOX}><path d="${PLATE}" fill="none" stroke="#fff" stroke-width="30" filter="${url("fe")}"/></mask>`;
      face =
        R(t.base, ` class="c04-film"`) +
        `<g mask="${url("edgeband")}">${R("#fff", ` filter="${url("frost")}" opacity=".7"`)}${R("#fff", ` class="c04-frostwash"`)}</g>`;
    } else if (tierKey === "PRO") {
      // oiled stencil board: translucent amber, oil mottling, a lit rim 4u inside the edge
      defs +=
        `<filter id="${u("oil")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .16  0 0 0 0 .03  0 0 0 1.6 -.62"/></filter>` +
        `<filter id="${u("mf")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".7 1.1" numOctaves="2" seed="8"/><feColorMatrix values="0 0 0 0 .86  0 0 0 0 .6  0 0 0 0 .3  0 0 0 3 -1.7"/></filter>` +
        `<linearGradient id="${u("wax")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".2"/><stop offset=".45" stop-color="#ffd9a0" stop-opacity="0"/><stop offset="1" stop-color="#2a1500" stop-opacity=".18"/></linearGradient>` +
        `<filter id="${u("bev")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation=".9" result="b"/><feSpecularLighting in="b" surfaceScale="2.2" specularConstant=".5" specularExponent="12" lighting-color="#ffe2b4" result="s"><feDistantLight azimuth="225" elevation="42"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>`;
      face =
        R(t.base, ` class="c04-amber"`) +
        R("#000", ` filter="${url("oil")}" opacity=".7"`) +
        R("#000", ` filter="${url("mf")}" opacity=".35"`) +
        R(`url(#${u("wax")})`);
      over =
        `<path d="${PLATE}" fill="none" stroke="#d9a35a" stroke-width="8" stroke-opacity=".5"/>` +
        `<path d="M7 4H322.34L356 37.66V233A3 3 0 0 1 353 236H7A3 3 0 0 1 4 233V7A3 3 0 0 1 7 4Z" fill="none" stroke="#f6cf8f" stroke-width=".8" stroke-opacity=".75"/>`;
    } else if (tierKey === "CHAMPION") {
      // cool yellow brass, crisply brushed
      defs +=
        `<linearGradient id="${u("br")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4cc7c"/><stop offset=".22" stop-color="#c9a84a"/><stop offset=".46" stop-color="#a88a34"/><stop offset=".64" stop-color="#dbc26c"/><stop offset=".84" stop-color="#bc9d43"/><stop offset="1" stop-color="#8d7228"/></linearGradient>` +
        `<filter id="${u("brL")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".0015 1.25" numOctaves="1" seed="13"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .97  0 0 0 0 .84  0 0 0 3.4 -1.75"/></filter>` +
        `<filter id="${u("brD")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".002 1.4" numOctaves="1" seed="29"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .23  0 0 0 0 .05  0 0 0 3.4 -1.78"/></filter>` +
        `<filter id="${u("bev")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="b"/><feSpecularLighting in="b" surfaceScale="3.4" specularConstant="1" specularExponent="22" lighting-color="#fff4cf" result="s"><feDistantLight azimuth="225" elevation="36"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>`;
      face = R(`url(#${u("br")})`) + R("#000", ` filter="${url("brL")}" opacity=".6"`) + R("#000", ` filter="${url("brD")}" opacity=".55"`);
    } else {
      // polished thick brass: a flat bright face and two hard reflection bands
      defs +=
        `<filter id="${u("bev")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="b"/><feSpecularLighting in="b" surfaceScale="3.2" specularConstant=".85" specularExponent="34" lighting-color="#fff8e0" result="s"><feDistantLight azimuth="225" elevation="38"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>` +
        `<linearGradient id="${u("gl")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffbe8" stop-opacity="0"/><stop offset=".5" stop-color="#fffbe8" stop-opacity=".85"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></linearGradient>`;
      face =
        R(t.base) +
        `<rect x="-6" y="166" width="372" height="80" fill="#b8913f" opacity=".42"/>` + `<rect x="-6" y="166" width="372" height=".8" fill="#fff6d6" opacity=".7"/>` +
        `<rect x="-6" y="66" width="372" height="10" fill="#fff2c8" opacity=".55"/>` +
        `<rect x="-6" y="82" width="372" height="3" fill="#fff2c8" opacity=".55"/>`;
      if (!thumb) over = `<g class="c04-glint"><rect x="-70" y="-20" width="46" height="290" fill="url(#${u("gl")})" transform="skewX(-18)"/></g>`;
    }

    /* ---- ink on the plate (header, origin, founder caption, OVR) ---- */
    let inkFilter = "";
    if (tierKey === "PRO") {
      defs += `<filter id="${u("stamp")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="6" result="n"/><feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4.4 3.05" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`;
      inkFilter = ` filter="${url("stamp")}" opacity=".9"`;
    } else if (tierKey === "HOMA") {
      defs += `<filter id="${u("marker")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="1" seed="2"/><feDisplacementMap in="SourceGraphic" scale="1.1" xChannelSelector="R" yChannelSelector="G"/></filter>`;
      inkFilter = ` filter="${url("marker")}" opacity=".9"`;
    } else if (metal) {
      defs += `<filter id="${u("engr")}" ${BOX}><feOffset in="SourceAlpha" dx="0" dy=".7" result="o"/><feFlood flood-color="#fff3cf" flood-opacity=".8"/><feComposite in2="o" operator="in" result="hi"/><feMerge><feMergeNode in="hi"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
      inkFilter = ` filter="${url("engr")}"`;
    }

    let ink = "";
    if (!thumb) {
      const homa = tierKey === "HOMA";
      const lx = 20;
      const logo = MC.logo("wordmark", { variant: "mono", color: t.ink, w: 78.5, h: 14, label: false });
      const tierX = lx + 78.5 + 11;
      const tierWord = S.tiers[tierKey];
      let head;
      if (ar) {
        head =
          `<text x="${tierX}" y="24.5" font-family="Noto Sans Arabic" font-weight="700" font-size="10.5">${esc(tierWord)}</text>` +
          `<text x="${tierX + 44}" y="24" font-family="Manrope" font-weight="600" font-size="9" letter-spacing=".3">${esc(p.season)}</text>`;
      } else if (homa) {
        head = `<text x="${tierX}" y="24.5" font-family="Changa" font-weight="600" font-size="11.5" letter-spacing=".4" transform="rotate(-1.6 ${tierX} 20)">${esc(tierWord)}<tspan dx="7" font-size="10.5">${esc(p.season)}</tspan></text>`;
      } else {
        head = `<text x="${tierX}" y="24" font-family="Manrope" font-weight="800" font-size="10" letter-spacing="1.1">${esc(tierWord)}<tspan dx="7" font-weight="600" font-size="9" letter-spacing=".3">${esc(p.season)}</tspan></text>`;
      }
      const idText = homa
        ? `<text x="318" y="24.5" text-anchor="end" font-family="Changa" font-weight="600" font-size="9.5" transform="rotate(-1 300 20)">${esc(p.id)}</text>`
        : `<text x="318" y="24" text-anchor="end" font-family="Manrope" font-weight="700" font-size="8.5" letter-spacing=".35" style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>`;
      const ovr = `<text transform="translate(228.5 157) rotate(-90)" font-family="Manrope" font-weight="800" font-size="7.5" letter-spacing="2.4">${esc(S.ovr)}</text>`;
      const founderCap = p.founder
        ? ar
          ? `<text x="314" y="82.5" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="8.5">${esc(S.founder)}</text>`
          : `<text x="314" y="81" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="6.2" letter-spacing="1.5">${esc(S.founder)}</text>`
        : "";
      // origin, stamped in the free space under the perfin column (the same spot for everyone)
      const country = ar
        ? `<text x="314" y="${p.founder ? 93.5 : 82.5}" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="600" font-size="8">${esc(S.country)}</text>`
        : `<text x="314" y="${p.founder ? 91 : 81}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="6.5" letter-spacing="1.2">${esc(S.country)}</text>`;
      let extra = "";
      if (tierKey === "STADE")
        extra = `<g fill="none" stroke="currentColor" stroke-width=".55" opacity=".8">${[104, 226].map((y) => `<circle cx="348" cy="${y}" r="3.1"/><path d="M342.5 ${y}H353.5M348 ${y - 5.5}V${y + 5.5}"/>`).join("")}</g>`;
      if (tierKey === "CHAMPION")
        extra = `<path d="M326.5 27.5L335.5 18.5M330.2 18.5H335.5V23.8" fill="none" stroke="${t.ink}" stroke-width="1.5" stroke-linecap="square"/>`;
      if (legend) extra = `<g fill="none" stroke="#fff6d6" stroke-opacity=".75" stroke-width="1.1"><circle cx="348" cy="104" r="4.4"/><circle cx="348" cy="226" r="4.4"/></g>`;
      ink =
        `<g fill="${t.ink}"${inkFilter}${tierKey === "STADE" ? ' class="c04-filmink"' : ""}>` +
        `<g transform="translate(${lx} 11.5)${homa ? " rotate(-1.2)" : ""}">${logo}</g>` +
        head +
        idText +
        ovr +
        country +
        founderCap +
        extra +
        `</g>`;
    }

    /* ---- assemble the plate ---- */
    const shadow = thumb ? "" : `<g filter="${url("sh")}" class="c04-sh${tierKey === "STADE" ? " c04-sh--film" : ""}"><rect x="-6" y="-6" width="372" height="252" mask="${url("M")}" transform="translate(0 6)"/></g>`;
    // the plate's thickness: the body shows below the plate and at the top of each large cut;
    // the stat line is counter-shifted so a thick plate never swallows small lettering
    const tx = r2(t.thick * 0.35);
    if (t.thick)
      defs += `<mask id="${u("MB")}" ${MBOX}><path d="${PLATE}" fill="#fff"/>${use("h1", "#000")}${use("h2", "#000")}${use("h4", "#000")}${use("h3", "#000", ` transform="translate(${-tx} ${-t.thick})"`)}</mask>`;
    const body = t.thick ? `<g mask="${url("MB")}" transform="translate(${tx} ${t.thick})">${R(t.edge)}</g>` : "";
    const bevel = metal || tierKey === "PRO" ? `<g filter="${url("bev")}"${metal ? "" : ' opacity=".7"'}><rect x="-6" y="-6" width="372" height="252" mask="${url("M")}"/></g>` : "";
    const spray = `<use href="#${u("hs")}" filter="${url("spray")}"/>`;
    const tight = thumb ? "" : `<g filter="${url("tight")}">${use("h2", "#000")}${use("h3", "#000")}</g>`;
    const walls = t.wall
      ? R(t.wallC === "FLUTE" ? `url(#${u("FLUTE")})` : t.wallC, ` mask="${url("wm")}"`) +
        R(t.lipC, ` mask="${url("lm")}" opacity="${tierKey === "STADE" ? 0.9 : 0.75}"`)
      : "";
    const wall3 = thumb ? "" : R("#2f220c", ` mask="${url("w3")}" class="c04-w3l"`);
    const mesh = legend
      ? R(`url(#${u("mesh")})`, ` opacity=".5" mask="${url("MH")}"`)
      : thumb
        ? ""
        : R(`url(#${u("mesh")})`, ` opacity=".42" mask="${url("MT")}"`);
    const edge = `<path d="${PLATE}" fill="none" class="c04-edge${tierKey === "STADE" ? " c04-edge--film" : ""}" stroke-width="${tierKey === "STADE" ? 1.2 : 0.9}"${C.roughAttr}/>`;

    const plateSvg =
      `<svg class="c04-svg" viewBox="0 0 360 240" aria-hidden="true" focusable="false">` +
      `<defs>${defs}</defs>` +
      shadow +
      body +
      `<g mask="${url("M")}">${face}${spray}${tight}${bevel}${over}${ink}</g>` +
      walls +
      wall3 +
      mesh +
      edge +
      `</svg>`;

    let print = "";
    if (legend && !thumb) {
      // the print beneath: the plate's own cuts sprayed crisp in Logo Blue on a white sheet.
      // Hidden at rest (the cuts show the ground, like every tier); it appears only while the
      // plate is peeled up, under a hard cast shadow that is darkest at the hinge.
      print =
        `<div class="c04-print"><svg class="c04-svg" viewBox="0 0 360 240" aria-hidden="true" focusable="false">` +
        `<defs><linearGradient id="${u("cast")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>` +
        `<path d="${SHEET}" class="c04-paper"/>` +
        use("h1", BLUE) +
        use("h2", BLUE) +
        `<path d="M0 36H360V240H0Z" fill="url(#${u("cast")})"/>` +
        `</svg></div>`;
    }

    const cls = `c04 c04--${tierKey.toLowerCase()}${thumb ? " c04--thumb" : ""}${o.motion && legend && !thumb ? " c04--motion" : ""}`;
    const style = o._onLight ? ` style="${LIGHT_VARS}"` : "";
    return (
      `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tierKey}"${style}>` +
      print +
      `<div class="c04-plate">${plateSvg}</div>` +
      `</div>`
    );
  }
  // the light-ground values, inlined where a card is rendered on a known light surface (share)
  const LIGHT_VARS =
    "--c04-edge:rgba(74,53,23,.55);--c04-shc:#0c1e3d;--c04-sho:.32;--c04-film:.92;--c04-filmc:#b3c3d2;--c04-filmedge:#5d7590;--c04-filmink:#0c3164;--c04-frost:.25;--c04-w3l:1;--c04-print:#ffffff";

  /* ------------------------------------------------------------------ token */
  function tokenPlate(vw, vh, cc, rr, notch, rough, seed) {
    if (!rough) {
      return (
        `M${rr} 0H${vw - cc}L${vw} ${cc}V${vh - rr}A${rr} ${rr} 0 0 1 ${vw - rr} ${vh}` +
        (notch ? `H${r2(notch.x + notch.r)}A${notch.r} ${notch.r} 0 0 0 ${r2(notch.x - notch.r)} ${vh}` : "") +
        `H${rr}A${rr} ${rr} 0 0 1 0 ${vh - rr}V${rr}A${rr} ${rr} 0 0 1 ${rr} 0Z`
      );
    }
    // knife-cut edge: deterministic jitter along the outline
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.9;
    let d = "";
    const pts = [];
    const seg = (x1, y1, x2, y2, n) => {
      for (let i = 0; i < n; i++) {
        const tt = i / n;
        pts.push([x1 + (x2 - x1) * tt + rnd() * 0.5, y1 + (y2 - y1) * tt + rnd()]);
      }
    };
    seg(0.4, 0.2, vw - cc, 0, 7);
    seg(vw - cc, 0, vw, cc, 2);
    seg(vw, cc, vw - 0.3, vh, 5);
    if (notch) {
      seg(vw - 0.3, vh, notch.x + notch.r, vh - 0.2, 2);
      d = "M" + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L");
      d += `L${r2(notch.x + notch.r)} ${vh}A${notch.r} ${notch.r} 0 0 0 ${r2(notch.x - notch.r)} ${vh}`;
      pts.length = 0;
      seg(notch.x - notch.r, vh, 0, vh - 0.3, 5);
      seg(0, vh - 0.3, 0.4, 0.2, 5);
      return d + "L" + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L") + "Z";
    }
    seg(vw - 0.3, vh, 0, vh - 0.3, 7);
    seg(0, vh - 0.3, 0.4, 0.2, 5);
    return "M" + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L") + "Z";
  }

  function token(p, o = {}) {
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const tierKey = TIER[p.tier] ? p.tier : "PRO";
    const legend = tierKey === "LEGEND";
    const id = MC.uid("c04t");
    const u = (k) => `${id}-${k}`;
    const vw = mini ? 36 : 64;
    const vh = mini ? 24 : 40;
    const cc = mini ? 5 : 8;
    const rr = mini ? 1 : 1.5;
    // founder: a half-round notch punched into the bottom edge (changes the outline itself)
    const notch = p.founder ? { x: vw - 14, r: mini ? 2.5 : 3.5 } : null;
    const plate = tokenPlate(vw, vh, cc, rr, notch, tierKey === "HOMA", 17 + vw);
    const saira = !mini && size >= 40 && !legend;
    const fs = saira ? 33 : mini ? 22 : 36;
    const cx = mini ? 16.5 : 30;
    const by = saira ? 31.6 : mini ? 19.1 : 32;
    const font = saira ? `font-family="Saira Stencil One"` : `font-family="Changa" font-weight="800"`;
    const num = (extra = "") => `<text x="${cx}" y="${by}" text-anchor="middle" ${font} font-size="${fs}"${extra}>${p.ovr}</text>`;
    const thick = legend ? (mini ? 2.2 : 2.6) : tierKey === "CHAMPION" ? (mini ? 0 : 1.4) : 0;
    const padB = 3;
    const hpx = mini ? Math.round(size * 0.8) : size;
    const wpx = r2((hpx * (vw + 2)) / (vh + 1 + padB));
    const B = `x="-4" y="-4" width="${vw + 8}" height="${vh + 8}"`;

    let fill;
    let defs = `<mask id="${u("M")}" maskUnits="userSpaceOnUse" ${B}><path d="${plate}" fill="#fff"/><g fill="#000">${num()}</g></mask>`;
    if (!mini) defs += `<filter id="${u("b")}" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="1.3"/></filter>`;
    if (tierKey === "HOMA") fill = "#bda27d";
    else if (tierKey === "STADE") fill = "#cfdbe5";
    else if (tierKey === "PRO") fill = "#a9692a";
    else if (tierKey === "CHAMPION") {
      defs += `<linearGradient id="${u("g")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4cc7c"/><stop offset=".45" stop-color="#a88a34"/><stop offset=".7" stop-color="#dbc26c"/><stop offset="1" stop-color="#8d7228"/></linearGradient>`;
      fill = `url(#${u("g")})`;
    } else fill = "#e3c27a";
    const sw = mini ? 2.6 : 3.4;
    const halo = mini
      ? `<g fill="none" stroke="${BLUE}" stroke-linejoin="round">${num(` stroke-width="${sw}" opacity=".85"`)}</g>`
      : `<g fill="none" stroke="${BLUE}" stroke-linejoin="round">${num(` stroke-width="${sw * 2.6}" opacity=".32" filter="url(#${u("b")})"`)}${num(` stroke-width="${sw}" opacity=".72"`)}</g>`;
    let extra = "";
    if (tierKey === "PRO") extra = `<path d="${plate}" fill="none" stroke="#d9a35a" stroke-width="${mini ? 2 : 2.6}" stroke-opacity=".55"/>`;
    if (tierKey === "CHAMPION")
      extra = `<path d="M${rr + 1.2} ${vh - 1.2}V${rr + 1.2}H${vw - cc - 0.6}" fill="none" stroke="#fff3cf" stroke-opacity=".7" stroke-width="${mini ? 0.8 : 0.9}"/>`;
    if (legend)
      extra =
        `<rect x="-4" y="${r2(vh * 0.27)}" width="${vw + 8}" height="${r2(vh * 0.13)}" fill="#fff2c8" opacity=".6"/>` +
        `<rect x="-4" y="${r2(vh * 0.46)}" width="${vw + 8}" height="${r2(vh * 0.04)}" fill="#fff2c8" opacity=".6"/>` +
        `<path d="M${rr + 0.8} ${vh - 1}V${rr + 0.8}H${vw - cc - 0.4}" fill="none" stroke="#fffbe8" stroke-opacity=".9" stroke-width="${mini ? 0.9 : 1}"/>`;
    const wallW = mini ? 0.7 : 1;
    const wall =
      `<mask id="${u("w")}" maskUnits="userSpaceOnUse" ${B}><g fill="#fff">${num()}</g><g fill="#000" transform="translate(${wallW} ${wallW})">${num()}</g></mask>` +
      `<rect ${B} fill="${legend || tierKey === "CHAMPION" ? "#6e521c" : tierKey === "STADE" ? "#5d7590" : tierKey === "PRO" ? "#3a2006" : "#4a3517"}" mask="url(#${u("w")})"/>`;
    // LEGEND: the print shows only as a hairline of Logo Blue along the lower inside edge of the cut
    const sx = mini ? 0.55 : 0.8;
    const sy = mini ? 0.7 : 1;
    const sliver = legend
      ? `<mask id="${u("sl")}" maskUnits="userSpaceOnUse" ${B}><g fill="#fff">${num()}</g><g fill="#000" transform="translate(${-sx} ${-sy})">${num()}</g></mask><rect ${B} fill="${BLUE}" mask="url(#${u("sl")})"/>`
      : "";
    const body = thick ? `<g mask="url(#${u("M")})" transform="translate(${r2(thick * 0.3)} ${thick})"><rect ${B} fill="#6e521c"/></g>` : "";
    const film = tierKey === "STADE" ? ` class="c04-film"` : "";
    // your own row: the earned spring→sky gradient sits behind the plate, so only your number glows
    let me = "";
    if (o.me) {
      defs += `<linearGradient id="${u("me")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="c04-me0" stop-color="#60fa97"/><stop offset="1" class="c04-me1" stop-color="#73edfa"/></linearGradient>`;
      me = `<g fill="url(#${u("me")})">${num()}</g>`;
    }
    const S = MC.s(o);
    return (
      `<span class="c04-tok c04-tok--${tierKey.toLowerCase()}${mini ? " c04-tok--mini" : ""}" role="img" aria-label="${esc(`${p.ovr} ${S.ovr}, ${S.tiers[tierKey]}${p.founder ? ", " + S.founderLine : ""}`)}">` +
      `<svg width="${wpx}" height="${hpx}" viewBox="-1 -1 ${vw + 2} ${vh + 1 + padB}" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      me +
      body +
      `<g mask="url(#${u("M")})"><rect ${B} fill="${fill}"${film}/>${halo}${extra}</g>` +
      wall +
      sliver +
      `<path d="${plate}" fill="none" class="c04-edge${tierKey === "STADE" ? " c04-edge--film" : ""}" stroke-width="${mini ? 0.9 : 0.8}"/>` +
      `</svg></span>`
    );
  }

  /* ------------------------------------------------------------------ row */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const tierKey = TIER[p.tier] ? p.tier : "PRO";
    const perf = `<svg class="c04-perf" viewBox="0 0 9 9" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="1.5" cy="1.5" r="1.1"/><circle cx="4.5" cy="1.5" r="1.1"/><circle cx="7.5" cy="1.5" r="1.1"/><circle cx="1.5" cy="4.5" r="1.1"/><circle cx="1.5" cy="7.5" r="1.1"/><circle cx="4.5" cy="7.5" r="1.1"/><circle cx="7.5" cy="7.5" r="1.1"/><circle cx="7.5" cy="4.5" r="1.1"/></g></svg>`;
    return (
      `<div class="c04-row${o.me ? " is-me" : ""}" dir="${S.dir}">` +
      `<span class="c04-rk">${MC.ltr(o.rank != null ? o.rank : "")}</span>` +
      `<span class="c04-rtok">${token(p, { ...o, size: 40, mini: false })}</span>` +
      `<span class="c04-who"><b${ar ? ' class="ar"' : ""}>${esc(MC.nameOf(p, o))}</b>` +
      `<small><span class="c04-tier">${esc(S.tiers[tierKey])}</span>${p.founder ? `<span class="c04-fd">${perf}${MC.ltr(p.founder)}</span>` : ""}</small></span>` +
      `<span class="c04-pts"><b>${MC.ltr(o.pts != null ? o.pts : "")}</b><small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ share */
  // The print the plate makes, on a tournament training bib, with the plate lifted off it.
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid("c04s");
    const u = (k) => `${id}-${k}`;
    const tierKey = TIER[p.tier] ? p.tier : "PRO";
    const C = cutShapes(p, o, tierKey, false, u);
    const PLATE = plateD(p.founder);
    const use = (h, extra = "") => `<use href="#${u(h)}"${extra}/>`;
    const cuts = use("h1") + use("h2") + use("h3");
    // knit mesh of the bib: pointy-top hexagons, threads lighter than the gaps
    const a = 2.3;
    const hw = r2(Math.sqrt(3) * a);
    const hex = `M${r2(hw / 2)} 0L${hw} ${r2(a / 2)}V${r2(1.5 * a)}L${r2(hw / 2)} ${r2(2 * a)}L0 ${r2(1.5 * a)}V${r2(a / 2)}ZM${r2(hw / 2)} ${r2(2 * a)}V${r2(3 * a)}`;
    const tierWord = S.tiers[tierKey] || tierKey;
    const hem = (y, flip) =>
      `<rect y="${y}" width="360" height="18" fill="#d6dce4"/>` +
      `<path d="M0 ${flip ? y : y + 18}H360" stroke="#f7f9fb" stroke-width="1.2"/>` +
      `<path d="M0 ${y + 6}H360M0 ${y + 12}H360" stroke="#9aa6b4" stroke-width=".9" stroke-dasharray="3.2 2.2"/>`;
    const PX = 15;
    const PY = 112;
    const sc = r2(330 / 360);
    const bg =
      `<svg class="c04-sh-bg" viewBox="0 0 360 640" aria-hidden="true" focusable="false"><defs>` +
      `<pattern id="${u("knit")}" width="${hw}" height="${r2(3 * a)}" patternUnits="userSpaceOnUse"><path d="${hex}" fill="none" stroke="#eef1f4" stroke-width="1"/></pattern>` +
      C.fb + C.rough + C.h1 + C.h2 + C.h3 +
      `<mask id="${u("out")}" maskUnits="userSpaceOnUse" x="-40" y="-40" width="440" height="320"><rect x="-40" y="-40" width="440" height="320" fill="#fff"/><path d="${PLATE}" fill="#000"/></mask>` +
      `</defs>` +
      `<rect width="360" height="640" fill="#e3e8ee"/>` +
      `<g transform="translate(${PX} ${PY}) scale(${sc})">` +
      // overspray mist that stopped at the plate's edge: the outline prints as a clean shape
      `<g mask="url(#${u("out")})" fill="none" stroke="${BLUE}" stroke-linejoin="round"><path d="${PLATE}" stroke-width="40" opacity=".045"/><path d="${PLATE}" stroke-width="20" opacity=".045"/></g>` +
      `<g opacity=".18" fill="${BLUE}" stroke="${BLUE}" stroke-width="8" stroke-linejoin="round">${cuts}</g>` +
      `<g fill="${BLUE}">${cuts}</g>` +
      `</g>` +
      `<rect width="360" height="640" fill="url(#${u("knit")})" opacity=".5"/>` +
      hem(0, false) +
      hem(622, true) +
      `<text x="${ar ? 24 : 336}" y="52" text-anchor="${ar ? "start" : "end"}" font-family="${ar ? "Noto Sans Arabic" : "Manrope"}" font-weight="800" font-size="${ar ? 13 : 12}" fill="${NAVY}"${ar ? "" : ' letter-spacing="1.4"'}>${esc(tierWord)}</text>` +
      `<text x="${ar ? 24 : 336}" y="70" text-anchor="${ar ? "start" : "end"}" font-family="Manrope" font-weight="700" font-size="11" fill="#3b4a5e" letter-spacing=".4" direction="ltr">${esc(p.season)}</text>` +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "mono", color: NAVY, w: 120, label: false });
    const card = full(p, { ...o, thumb: false, motion: false, _onLight: true });
    const handle = "@" + String(p.name.lat).toLowerCase();
    const cast = `<svg viewBox="0 0 360 240" aria-hidden="true" focusable="false"><path d="${PLATE}" fill="#000"/></svg>`;
    return (
      `<div class="c04-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c04-sh-logo">${logo}</div>` +
      `<div class="c04-sh-lift"><div class="c04-sh-cast"><div>${cast}</div></div><div class="c04-sh-plate">${card}</div></div>` +
      `<div class="c04-sh-meta"><b>${MC.ltr(handle)}</b>` +
      (p.founder ? `<span class="c04-sh-fd">${esc(S.founderLine)}</span>` : "") +
      `<span class="c04-sh-id">${MC.ltr(p.id)}<i></i>${ar ? "مثال" : "Sample"}</span></div>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ mount */
  function mount(el) {
    if (!el || !el.classList || !el.classList.contains("c04--legend")) return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // the lift follows the pointer: the higher you point, the further the plate peels off its print
    const set = (e) => {
      const r = el.getBoundingClientRect();
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const lift = -45 * (1 - y);
      el.classList.add("c04--hover");
      el.classList.toggle("c04--lifted", lift < -8);
      el.style.setProperty("--c04-lift", `${r2(lift)}deg`);
    };
    el.addEventListener("pointermove", set);
    el.addEventListener("pointerleave", () => {
      el.classList.remove("c04--lifted", "c04--hover");
      el.style.removeProperty("--c04-lift");
    });
  }

  MC.register({
    id: "c04",
    n: 4,
    slug: "04",
    name: "Pochoir",
    nameAr: "الإستنسل",
    category: "bold",
    philosophy: "Your card is the stencil, not the print: the 84 is cut through it, so whatever sits behind it shows through your number.",
    philosophyAr: "بطاقتك هي القالب لا المطبوعة: الرقم 84 مقصوص فيها، فيظهر من خلاله كل ما يقع خلفها.",
    idea: [
      "A landscape plate (3:2) with one 45° clipped corner, the way real stencils mark which way is up. Everything that identifies the manager is cut through it: the 84 in Saira Stencil, the name in Changa, the crest, the manager seen from behind and one line of stats. The cuts are real transparency, so the plate is the only identity in the set whose outline states its rating.",
      "Three devices keep the holes legible on any ground: a cut wall (the plate's thickness, dark on the top and start edges of each hole), a lit lip on the bottom and end edges, and Logo-Blue overspray that builds up around every cut the way paint does on a used stencil, with a tight second pass that rims the small lettering. Lettering without bridges keeps its counters on a fine screen mesh, the way sign-makers hold the middle of an O. Ink is only used for what a workshop would stamp or write: the wordmark, the tier, the season, the ID, the origin and the founder caption.",
      "The sample plate carries one coat of overspray because ALI is in his first season. The system adds one coat per completed season (Logo Blue, then navy, then the club colour), never cleaned, so an old plate looks veteran without a single extra badge.",
    ],
    belonging: [
      "It is a tool you own and use, not a certificate someone issued you. The paint on it is your seasons; the material is how far you have climbed. A three-season plate looks lived-in in a way a fresh account cannot copy.",
      "The leaderboard flex is literal: your number is a hole, and on your own row the app's spring-to-sky 'you are here' colour glows through it. Nobody else's number lights up for you.",
      "The ladder reads instantly to a teenager (cardboard is where everyone starts, brass is what you want), and the LEGEND plate is quiet enough that an adult Fantasy player is not embarrassed to post it.",
      "The share image is the print the plate makes, on a tournament bib, with the plate lifted off it: posting it feels like showing your work.",
    ],
    founderMark: [
      "A perfin: 2026 pin-punched through the plate as a 5×7 dot matrix, with the BotolaGO ID punched below in smaller holes, under the clipped corner. Like the 84, you see through it; it is never painted, and the overspray never fills it.",
      "A half-round notch is punched into the bottom edge under the perfin column. It changes the outline itself, so a founder plate is a different silhouette from every later plate.",
      "It does not upgrade: the same pattern on cardboard and on brass, only cleaner on metal. At token size the notch is all that remains, still in the outline, visible in every ranking and comment. Later cohorts would get their own year in a different punch pattern, so 2026 is first in a series, with no edition count invented.",
    ],
    small: [
      "44–80px: a 64×40 plate with the clipped corner and the OVR knocked out (Saira Stencil at 40px and above). The row's own background shows through the number, a one-coat Logo-Blue halo keeps the cut defined on a white row, and founders carry the punched notch in the bottom edge.",
      "24–32px: a 36×24 plate with the OVR cut in Changa 800 (Saira's bridges clog below 40px), the clipped corner and the founder notch. The tier is told by the plate itself — rough kraft edge, translucent film, dark amber board with a lit rim, brushed brass with a bevel line, polished brass with a mirror band and an extruded edge — so HOMA and LEGEND never look the same in a comment line.",
    ],
    rtl: [
      "The plate never mirrors: it is a physical tool with a fixed orientation corner, so the corner stays top-right and the 84 stays cut on the left in both languages. What mirrors is the content of each line: in Arabic the name is cut in Changa 800 flush to the end of the number column with the crest at the start, and the stat line runs right to left from the end edge.",
      "Arabic names and labels are cut in Changa (no tracking, Western digits kept left to right); their floating counters and dots are held by the screen mesh, so any name cuts without hand-placed bridges. The share image mirrors fully (logo top right, the plate lifting from the other corner).",
    ],
    tiers: {
      HOMA: "Matte kraft cardboard cut with a utility knife: wobbling edges, fat 5u bridges, corrugation inside every cut and along a torn top edge, the pencil guide lines and knife overcuts left from cutting, and the header written in marker. One soft coat soaks into the board.",
      STADE: "Clear acetate film. The plate tints whatever is behind it, frost gathers only near its edges, the cuts are crisp with a bright edge, and the header and registration marks are printed on it.",
      PRO: "Oiled stencil board: translucent dark amber with oil mottling and a lit rim inside the edge, clean cuts, a rubber-stamped header and the first even coat of Logo Blue.",
      CHAMPION: "Cool, crisply brushed brass with a visible 1.6u edge thickness, light catching every cut edge, two pin holes punched through, an engraved header and an engraved orientation arrow in the clipped corner.",
      LEGEND: "Thick polished brass: a flat bright face with two hard reflection bands, a 3u extruded edge and deep walls in every cut, and no bridges at all. The counters of the 8 and the 4 and the pieces of the figure hang on a lit bronze screen mesh visible only inside the holes.",
    },
    legend: [
      "The lift. On reveal, one glint sweeps the polished face; then the plate peels up from its bottom hinge (rotateX 0 → −55°) and shows the 84 and the name sprayed crisp in Logo Blue on the white sheet beneath, under a hard shadow, before it lays back down. It never loops, and under reduced motion the plate simply rests flat.",
      "At rest the LEGEND cuts show the ground, like every other tier. In the profile the lift follows the pointer, so the plate can be peeled off its print by hand.",
    ],
    advantages: [
      "The silhouette contains the rating: in the solid-colour test the plate still says 84. No other outline in either exploration does this.",
      "It adapts to both themes by construction, because the ground is literally part of the number.",
      "Tier progression is a change of material and cut quality (cardboard → film → oiled board → brass → polished brass, knife → laser, bridges → bridgeless), separated by value and finish rather than by colour alone.",
      "The share image is a natural social format: the print and the tool together.",
    ],
    risks: [
      "Stencil lettering carries crate-marking and graffiti connotations; the name and stats are now in Changa to keep it a sports object, and the restraint (no drips, no tags, no ultras names) has to hold in every future asset.",
      "The screen mesh that holds floating counters is fine detail; below about 200px it reads as a tint inside the holes rather than as a mesh.",
      "The holes depend on the cut wall and the overspray to read; on the light ground the kraft and film tiers stay the weakest, and the stat line at 200px is small.",
      "Kraft at HOMA could read as 'poor' rather than 'origin'. The landscape format is also wider than every portrait card in a mixed collection grid.",
      "The SVG is filter-heavy (turbulence, lighting, masks); a production version would need pre-rendered textures for long leaderboards. The tokens use no turbulence.",
    ],
    gridWidth: 300,
    detailWidth: 460,
    full,
    token,
    row,
    share,
    mount,
  });
})();
