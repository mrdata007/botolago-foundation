/* 04 POCHOIR (bold). The spray stencil used to number tournament bibs and mark
   neighbourhood walls, going from hand-cut cardboard to laser-cut brass. The card is
   the TOOL, not the print: the 84, the name, the crate-mark stats and the manager are
   cut through the plate, so whatever sits behind the card shows through your number.
   Holes are real transparency (an SVG mask), never white shapes. */
(function () {
  const MC = window.MC;
  const BLUE = "#0151fc";
  const NAVY = "#0c3164";
  const PLATE = "M3 0H324L360 36V237A3 3 0 0 1 357 240H3A3 3 0 0 1 0 237V3A3 3 0 0 1 3 0Z";
  const FIG = "translate(236 80) scale(.46)";
  const r2 = (n) => Math.round(n * 100) / 100;

  /* Material, cut and finish per tier. bw = bridge width (u), wall = cut-wall depth. */
  const TIER = {
    HOMA: { bw: 5, wall: 2.4, wallC: "url(#FLUTE)", lipC: "#ead8b2", ink: "#1a1a1a", spray: 0.5, sd: 7, rough: 2.5, thick: 0 },
    STADE: { bw: 3.5, wall: 1, wallC: "#5d7590", lipC: "#ffffff", ink: NAVY, spray: 0.62, sd: 5, rough: 0, thick: 0 },
    PRO: { bw: 3, wall: 2, wallC: "#4a3517", lipC: "#f6e9c9", ink: NAVY, spray: 0.55, sd: 6, rough: 0, thick: 0 },
    CHAMPION: { bw: 2.5, wall: 0, wallC: "#6e521c", lipC: "#fff0c2", ink: "#4a3510", spray: 0.55, sd: 5, rough: 0, thick: 1.6, edge: "#7a5c22" },
    LEGEND: { bw: 0, wall: 0, wallC: "#6e521c", lipC: "#fff3cf", ink: "#4a3510", spray: 0.42, sd: 3.2, rough: 0, thick: 3, edge: "#6e521c" },
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

  const esc = (s) => MC.esc(s);
  const latinNameFs = (n) => Math.min(38, (38 * 4) / Math.max(4, n.length));

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
    const name = MC.nameOf(p, o);

    /* ---- cut shapes (fill is inherited from each <use>) ---- */
    const cutFace = legend ? `font-family="Changa" font-weight="800"` : `font-family="Saira Stencil One"`;
    const n84 = legend
      ? `<text x="15.1" y="158" ${cutFace} font-size="163.6">${p.ovr}</text>`
      : `<text x="13.9" y="158" ${cutFace} font-size="153">${p.ovr}</text>`;
    const A = MC.AVATAR;
    const figure = `<g transform="${FIG}"><path d="${A.torso}"/><path d="${A.collar}"/><path d="${A.neck}"/><path d="${A.head}"/><path d="${A.hair}"/><path d="${A.ears}"/></g>`;
    const k = 1 / 0.46;
    const bwA = t.bw * k;
    const figBridges = legend
      ? /* bridgeless: the yoke seam and the collar line float, held only by the screen mesh */
        `<g transform="${FIG}" fill="none" stroke="#000" stroke-linecap="round"><path d="M36 210C72 198 128 198 164 210" stroke-width="${2.4 * k}"/><path d="M74 187C90 181 110 181 126 187" stroke-width="${1.6 * k}"/></g>`
      : `<g transform="${FIG}"><rect x="30" y="${r2(149.5 - bwA / 2)}" width="140" height="${r2(bwA)}" fill="#000"/><path d="M-8 220C48 196 152 196 208 220" fill="none" stroke="#000" stroke-width="${r2(bwA)}"/></g>`;

    // name line: the name is cut; crest is cut; country is stamped ink.
    let nameCut, crestX, countryInk;
    const crestY = 176.5;
    if (ar) {
      const fs = 40;
      nameCut = `<text x="214" y="196" text-anchor="end" font-family="Reem Kufi" font-weight="700" font-size="${fs}">${esc(name)}</text>`;
      const nw = Math.max(40, name.length * 0.52 * fs);
      crestX = 214 - nw - 26;
      countryInk = `<text x="${r2(crestX - 7)}" y="195" text-anchor="end" font-family="Noto Sans Arabic" font-weight="700" font-size="10.5">${esc(S.country)}</text>`;
    } else {
      const fs = legend ? 42 : latinNameFs(name);
      nameCut = legend
        ? `<text x="19" y="200" font-family="Changa" font-weight="800" font-size="${fs}">${esc(name)}</text>`
        : `<text x="20" y="200" font-family="Saira Stencil One" font-size="${r2(fs)}">${esc(name)}</text>`;
      const nw = name.length * (legend ? 0.46 : 0.5) * fs;
      crestX = 20 + nw + 12;
      countryInk = `<text x="${r2(crestX + 26)}" y="196" font-family="Manrope" font-weight="800" font-size="8" letter-spacing="1.3">${esc(S.country)}</text>`;
    }
    const crestT = `translate(${r2(crestX)} ${crestY}) scale(.45)`;
    const crestCut = thumb ? "" : `<g transform="${crestT}"><path d="${MC.CREST.shield}"/></g>`;
    const crestBridges = thumb ? "" : `<g transform="${crestT}" fill="#000"><path d="${MC.CREST.sash}"/><circle cx="20" cy="22" r="5.6"/></g>`;
    // Arabic name: hand-placed bridges (stencil logic for the counter of ع and the join to ي).
    const arBridges =
      ar && !legend && name === "علي"
        ? `<g fill="#000"><rect x="186.2" y="184" width="${r2(Math.max(2.2, t.bw * 0.8))}" height="16"/><rect x="196" y="181.4" width="18" height="${r2(Math.max(2, t.bw * 0.7))}"/></g>`
        : "";

    const pins = metal ? `<circle cx="348" cy="104" r="2.6"/><circle cx="348" cy="226" r="2.6"/>` : "";

    const statsStr = MC.STATS.map((key) => `${S.stats[key]} ${p.stats[key]}`).join("   ");
    const stats = thumb
      ? ""
      : ar
        ? `<text x="340" y="229" direction="rtl" text-anchor="start" font-family="Reem Kufi" font-weight="600" font-size="15" style="white-space:pre">${esc(statsStr)}</text>`
        : legend
          ? `<text x="19.5" y="229" font-family="Changa" font-weight="700" font-size="15.5" letter-spacing=".6" style="white-space:pre">${esc(MC.STATS.map((key) => `${S.stats[key]} ${p.stats[key]}`).join("  "))}</text>`
          : `<text x="20" y="228" font-family="Saira Stencil One" font-size="16" letter-spacing=".64" style="white-space:pre">${esc(MC.STATS.map((key) => `${S.stats[key]} ${p.stats[key]}`).join("  "))}</text>`;

    const perfin = !p.founder
      ? ""
      : thumb
        ? `<circle cx="341" cy="55" r="4"/>`
        : punch(p.founder, 284.2, 44, 2.6, 0.82, 16.4) + punch(p.serial, 286.5, 63.5, 1.6, 0.52, 9.8);

    const rough = t.rough ? ` filter="${url("rough")}"` : "";
    const h1 = `<g id="${u("h1")}"${rough}>${n84}<g mask="${url("fb")}">${figure}</g></g>`;
    const h2 = `<g id="${u("h2")}"${rough}><g mask="${url("fb")}">${nameCut}${crestCut}</g>${pins}</g>`;
    const h3 = `<g id="${u("h3")}"${rough}>${stats}</g>`;
    const h4 = `<g id="${u("h4")}">${perfin}</g>`;
    const use = (h, fill, extra = "") => `<use href="#${u(h)}" fill="${fill}"${extra}/>`;
    const allHoles = (fill) => use("h1", fill) + use("h2", fill) + use("h3", fill) + use("h4", fill);

    /* ---- material defs ---- */
    const BOX = `filterUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288" color-interpolation-filters="sRGB"`;
    let defs = "";
    defs += `<mask id="${u("fb")}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="380" height="260"><rect x="-10" y="-10" width="380" height="260" fill="#fff"/>${figBridges}${crestBridges}${arBridges}</mask>`;
    defs += h1 + h2 + h3 + h4;
    if (t.rough)
      defs += `<filter id="${u("rough")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="${t.rough}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    defs += `<mask id="${u("M")}" maskUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288"><path d="${PLATE}" fill="#fff"${rough}/>${allHoles("#000")}</mask>`;
    if (legend || t.wall) {
      defs += `<mask id="${u("MH")}" maskUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288">${allHoles("#fff")}</mask>`;
    }
    if (t.wall) {
      const w = t.wall;
      defs +=
        `<mask id="${u("wm")}" maskUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288">` +
        use("h1", "#fff") + use("h1", "#000", ` transform="translate(${w} ${w})"`) +
        use("h2", "#fff") + use("h2", "#000", ` transform="translate(${r2(w * 0.6)} ${r2(w * 0.6)})"`) +
        use("h3", "#fff") + use("h3", "#000", ` transform="translate(${r2(w * 0.32)} ${r2(w * 0.32)})"`) +
        `</mask>` +
        `<mask id="${u("lm")}" maskUnits="userSpaceOnUse" x="-24" y="-24" width="408" height="288">` +
        use("h1", "#fff") + use("h1", "#000", ` transform="translate(-1 -1)"`) +
        use("h2", "#fff") + use("h2", "#000", ` transform="translate(-.7 -.7)"`) +
        `</mask>`;
    }
    defs += `<g id="${u("hs")}">${use("h1", "#000")}${use("h2", "#000")}${use("h3", "#000")}</g>`;
    // overspray: blurred cut shapes, dithered against noise into spray dots, plus a haze
    defs += `<filter id="${u("spray")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation="${t.sd}" result="b"/><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="${tierKey.length * 7}" result="n"/><feComposite in="b" in2="n" operator="arithmetic" k1="0" k2="2.5" k3="-1" k4="-.08" result="d"/><feComponentTransfer in="d" result="dots"><feFuncA type="linear" slope="2.4"/></feComponentTransfer><feComponentTransfer in="b" result="haze"><feFuncA type="linear" slope=".55"/></feComponentTransfer><feMerge result="m"><feMergeNode in="haze"/><feMergeNode in="dots"/></feMerge><feFlood flood-color="${BLUE}" flood-opacity="${t.spray}"/><feComposite in2="m" operator="in"/></filter>`;
    defs += `<filter id="${u("sh")}" ${BOX}><feGaussianBlur stdDeviation="${legend ? 7 : 4.5}"/></filter>`;

    /* plate face per tier */
    let face = "";
    if (tierKey === "HOMA") {
      defs +=
        `<pattern id="${u("FLUTE")}" width="3.2" height="10" patternUnits="userSpaceOnUse"><rect width="3.2" height="10" fill="#3a2a12"/><rect width="1.1" height="10" fill="#7a6040"/></pattern>` +
        `<filter id="${u("kb")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="3" seed="11"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .3  0 0 0 0 .18  0 0 0 2.3 -1.02"/></filter>` +
        `<filter id="${u("kf")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".55 .9" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .27  0 0 0 0 .19  0 0 0 0 .1  0 0 0 3.6 -1.95"/></filter>` +
        `<filter id="${u("kl")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="21"/><feColorMatrix values="0 0 0 0 .95  0 0 0 0 .89  0 0 0 0 .77  0 0 0 4 -2.35"/></filter>` +
        `<pattern id="${u("crepe")}" width="6" height="1.4" patternUnits="userSpaceOnUse"><rect width="6" height=".5" fill="#b9a978"/></pattern>` +
        `<filter id="${u("tb")}" ${BOX}><feGaussianBlur stdDeviation="1.2"/></filter>`;
      face =
        `<rect x="-6" y="-6" width="372" height="252" fill="#b59b78"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("kb")}"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("kf")}" opacity=".9"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("kl")}" opacity=".7"/>` +
        `<path d="M0 0" /><g opacity=".07" stroke="#2b1d0b" stroke-width="1.2">${Array.from({ length: 46 }, (_, i) => `<path d="M${4 + i * 7.8} 0V240"/>`).join("")}</g>`;
    } else if (tierKey === "STADE") {
      defs +=
        `<linearGradient id="${u("sheen")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<filter id="${u("frost")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.72"/></filter>`;
      face =
        `<rect x="-6" y="-6" width="372" height="252" fill="#cfdbe5" class="c04-film"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("frost")}" opacity=".35"/>` +
        `<g transform="rotate(-58 200 120)"><rect x="132" y="-120" width="14" height="480" fill="url(#${u("sheen")})" opacity=".85"/><rect x="152" y="-120" width="3" height="480" fill="url(#${u("sheen")})" opacity=".7"/></g>`;
    } else if (tierKey === "PRO") {
      defs +=
        `<filter id="${u("oil")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .46  0 0 0 0 .31  0 0 0 0 .09  0 0 0 2.6 -1.12"/></filter>` +
        `<filter id="${u("mf")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".7 1.1" numOctaves="2" seed="8"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .36  0 0 0 0 .16  0 0 0 3 -1.66"/></filter>` +
        `<linearGradient id="${u("wax")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#5a3c10" stop-opacity=".12"/></linearGradient>` +
        `<filter id="${u("bev")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation=".9" result="b"/><feSpecularLighting in="b" surfaceScale="2.2" specularConstant=".55" specularExponent="12" lighting-color="#fff4dc" result="s"><feDistantLight azimuth="225" elevation="42"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>`;
      face =
        `<rect x="-6" y="-6" width="372" height="252" fill="#c9a266"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("oil")}"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("mf")}" opacity=".55"/>` +
        `<rect x="-6" y="-6" width="372" height="252" fill="url(#${u("wax")})"/>`;
    } else if (tierKey === "CHAMPION") {
      defs +=
        `<linearGradient id="${u("br")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6c983"/><stop offset=".2" stop-color="#c99f4f"/><stop offset=".44" stop-color="#a87c31"/><stop offset=".63" stop-color="#dcbb69"/><stop offset=".82" stop-color="#b68b3d"/><stop offset="1" stop-color="#8e6a28"/></linearGradient>` +
        `<filter id="${u("brL")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".003 .75" numOctaves="2" seed="13"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .8  0 0 0 2.4 -1.1"/></filter>` +
        `<filter id="${u("brD")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".004 .9" numOctaves="2" seed="29"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .24  0 0 0 0 .06  0 0 0 2.4 -1.12"/></filter>` +
        `<filter id="${u("bev")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="b"/><feSpecularLighting in="b" surfaceScale="3.4" specularConstant="1" specularExponent="22" lighting-color="#fff2cc" result="s"><feDistantLight azimuth="225" elevation="36"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>`;
      face =
        `<rect x="-6" y="-6" width="372" height="252" fill="url(#${u("br")})"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("brL")}" opacity=".55"/>` +
        `<rect x="-6" y="-6" width="372" height="252" filter="${url("brD")}" opacity=".5"/>`;
    } else {
      defs +=
        `<linearGradient id="${u("pol")}" x1="0" y1="0" x2="1" y2=".9"><stop offset="0" stop-color="#f8e5ad"/><stop offset=".13" stop-color="#e3c27a"/><stop offset=".29" stop-color="#9f7329"/><stop offset=".37" stop-color="#c89a46"/><stop offset=".49" stop-color="#fff2c8"/><stop offset=".57" stop-color="#e6c57c"/><stop offset=".73" stop-color="#94681f"/><stop offset=".85" stop-color="#d7b463"/><stop offset="1" stop-color="#f4daa0"/></linearGradient>` +
        `<radialGradient id="${u("hot")}" cx=".3" cy=".18" r=".55"><stop offset="0" stop-color="#fffbe8" stop-opacity=".55"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></radialGradient>` +
        `<pattern id="${u("mesh")}" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".5" height="2.4" fill="#2b1d08"/></pattern>` +
        `<filter id="${u("bev")}" ${BOX}><feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="b"/><feSpecularLighting in="b" surfaceScale="4.2" specularConstant="1.25" specularExponent="30" lighting-color="#fff8e0" result="s"><feDistantLight azimuth="225" elevation="34"/></feSpecularLighting><feComposite in="s" in2="SourceAlpha" operator="in"/></filter>`;
      face =
        `<rect x="-6" y="-6" width="372" height="252" fill="url(#${u("pol")})"/>` +
        `<rect x="-6" y="-6" width="372" height="252" fill="url(#${u("hot")})"/>`;
    }

    /* ---- ink on the plate (header, origin, founder caption, OVR) ---- */
    let inkFilter = "";
    if (tierKey === "PRO") {
      defs += `<filter id="${u("stamp")}" ${BOX}><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="6" result="n"/><feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4.4 3.05" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`;
      inkFilter = ` filter="${url("stamp")}" opacity=".86"`;
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
      const lx = homa ? 42 : 20;
      const logo = MC.logo("wordmark", { variant: "mono", color: t.ink, w: 78.5, h: 14, label: false });
      const tierX = lx + 78.5 + 11;
      const tierWord = S.tiers[tierKey];
      let head;
      if (ar) {
        head =
          `<text x="${tierX}" y="24.5" font-family="Noto Sans Arabic" font-weight="700" font-size="10.5">${esc(tierWord)}</text>` +
          `<text x="${tierX + 42}" y="24" font-family="Manrope" font-weight="600" font-size="9" letter-spacing=".3">${esc(p.season)}</text>`;
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
          ? `<text x="314" y="85" text-anchor="middle" font-family="Noto Sans Arabic" font-weight="700" font-size="7.5">${esc(S.founder)}</text>`
          : `<text x="314" y="83" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="6.2" letter-spacing="1.5">${esc(S.founder)}</text>`
        : "";
      let extra = "";
      if (tierKey === "STADE")
        extra = `<g fill="none" stroke="${NAVY}" stroke-width=".55" opacity=".8">${[104, 226].map((y) => `<circle cx="348" cy="${y}" r="3.1"/><path d="M342.5 ${y}H353.5M348 ${y - 5.5}V${y + 5.5}"/>`).join("")}</g>`;
      if (tierKey === "CHAMPION")
        extra = `<path d="M326.5 27.5L335.5 18.5M330.2 18.5H335.5V23.8" fill="none" stroke="${t.ink}" stroke-width="1.5" stroke-linecap="square"/>`;
      if (legend) extra = `<g fill="none" stroke="#fff6d6" stroke-opacity=".75" stroke-width="1.1"><circle cx="348" cy="104" r="4.4"/><circle cx="348" cy="226" r="4.4"/></g>`;
      ink =
        `<g fill="${t.ink}"${inkFilter}>` +
        `<g transform="translate(${lx} 11.5)${homa ? " rotate(-1.2)" : ""}">${logo}</g>` +
        head +
        idText +
        ovr +
        countryInk +
        founderCap +
        extra +
        `</g>`;
    }

    /* ---- assemble the plate ---- */
    const shadow = thumb || legend ? "" : `<g filter="${url("sh")}" class="c04-sh${tierKey === "STADE" ? " c04-sh--film" : ""}"><rect x="-6" y="-6" width="372" height="252" mask="${url("M")}" transform="translate(0 6)"/></g>`;
    const body = t.thick
      ? `<g mask="${url("M")}" transform="translate(${r2(t.thick * 0.35)} ${t.thick})"><rect x="-6" y="-6" width="372" height="252" fill="${t.edge}"/></g>`
      : "";
    const bevel = metal || tierKey === "PRO" ? `<g filter="${url("bev")}"${metal ? "" : ' opacity=".8"'}><rect x="-6" y="-6" width="372" height="252" mask="${url("M")}"/></g>` : "";
    const spray = `<use href="#${u("hs")}" filter="${url("spray")}"/>`;
    const walls = t.wall
      ? `<rect x="-6" y="-6" width="372" height="252" fill="${t.wallC === "url(#FLUTE)" ? `url(#${u("FLUTE")})` : t.wallC}" mask="${url("wm")}"/>` +
        `<rect x="-6" y="-6" width="372" height="252" fill="${t.lipC}" mask="${url("lm")}" opacity="${tierKey === "STADE" ? 0.9 : 0.75}"/>`
      : "";
    const mesh = legend ? `<rect x="-6" y="-6" width="372" height="252" fill="url(#${u("mesh")})" opacity=".25" mask="${url("MH")}"/>` : "";
    const edge = `<path d="${PLATE}" fill="none" class="c04-edge${tierKey === "STADE" ? " c04-edge--film" : ""}" stroke-width="${tierKey === "STADE" ? 1.2 : 0.9}"${rough}/>`;
    const tape =
      tierKey === "HOMA"
        ? (() => {
            const d = "M-37 -7.6H35.5L33.4 -4.6 35.9 -1.6 33.5 1.4 36 4.4 33.6 7.6H-37L-34.8 4.6-37.4 1.8-35 -1.2-37.3-4.4Z";
            return `<g transform="translate(13 16) rotate(-31)"><path d="${d}" fill="#2b1d0b" opacity=".28" transform="translate(.6 1.8)" filter="${url("tb")}"/><path d="${d}" fill="#e8ddbf" opacity=".95"/><path d="${d}" fill="url(#${u("crepe")})" opacity=".45"/><path d="M-37 -7.6H35.5" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/></g>`;
          })()
        : "";

    const plateSvg =
      `<svg class="c04-svg" viewBox="0 0 360 240" aria-hidden="true" focusable="false">` +
      `<defs>${defs}</defs>` +
      shadow +
      body +
      `<g mask="${url("M")}">${face}${spray}${bevel}${ink}</g>` +
      walls +
      mesh +
      edge +
      tape +
      `</svg>`;

    let print = "";
    if (legend) {
      // the print beneath the lifted plate: the same cut shapes, sprayed crisp in Logo Blue
      print =
        `<div class="c04-print"><svg class="c04-svg" viewBox="0 0 360 240" aria-hidden="true" focusable="false">` +
        `<defs><filter id="${u("ps")}" ${BOX}><feGaussianBlur stdDeviation="9"/></filter><filter id="${u("pb")}" ${BOX}><feGaussianBlur stdDeviation="1.6"/></filter>` +
        `<linearGradient id="${u("pg")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs>` +
        `<rect x="22" y="40" width="316" height="206" rx="6" class="c04-sh c04-sh--lift" filter="${url("ps")}"/>` +
        `<g transform="translate(18 24) scale(.9)">` +
        `<rect x="2" y="10" width="356" height="228" class="c04-paper"/>` +
        `<use href="#${u("hs")}" fill="${BLUE}" opacity=".35" filter="${url("pb")}"/>` +
        `<use href="#${u("hs")}" fill="${BLUE}"/>` +
        `<rect x="2" y="10" width="356" height="228" fill="url(#${u("pg")})"/>` +
        `</g></svg></div>`;
    }

    const cls = `c04 c04--${tierKey.toLowerCase()}${thumb ? " c04--thumb" : ""}${o.motion && legend ? " c04--motion" : ""}`;
    const style = o._onLight ? ` style="--c04-edge:rgba(74,53,23,.55);--c04-shc:#0c1e3d;--c04-sho:.32;--c04-film:.8;--c04-filmedge:#6f86a0;--c04-print:#ffffff"` : "";
    return (
      `<div class="${cls}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tierKey}"${style}>` +
      print +
      `<div class="c04-plate">${plateSvg}</div>` +
      `</div>`
    );
  }

  /* ------------------------------------------------------------------ token */
  function roughPath(vw, vh, cc, seed) {
    // knife-cut edge: deterministic jitter along the outline
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.9;
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
    const plate =
      tierKey === "HOMA"
        ? roughPath(vw, vh, cc, 17 + vw)
        : `M${rr} 0H${vw - cc}L${vw} ${cc}V${vh - rr}A${rr} ${rr} 0 0 1 ${vw - rr} ${vh}H${rr}A${rr} ${rr} 0 0 1 0 ${vh - rr}V${rr}A${rr} ${rr} 0 0 1 ${rr} 0Z`;
    const saira = !mini && size >= 40 && !legend;
    const fs = saira ? 33 : mini ? 22 : 36;
    const cx = mini ? (p.founder ? 16 : 17) : p.founder ? 29 : 30.5;
    const by = saira ? 31.6 : mini ? 19.1 : 32;
    const font = saira ? `font-family="Saira Stencil One"` : `font-family="Changa" font-weight="800"`;
    const num = (extra = "") => `<text x="${cx}" y="${by}" text-anchor="middle" ${font} font-size="${fs}"${extra}>${p.ovr}</text>`;
    const pin = p.founder ? `<circle cx="${mini ? 32.4 : 58}" cy="${mini ? 10.4 : 14}" r="${mini ? 1.05 : 1.45}"/>` : "";
    const thick = tierKey === "LEGEND" ? (mini ? 2.2 : 2.6) : tierKey === "CHAMPION" ? (mini ? 0 : 1.4) : 0;
    const padB = 3;
    const hpx = mini ? Math.round(size * 0.8) : size;
    const wpx = r2((hpx * (vw + 2)) / (vh + 1 + padB));

    let fill;
    let defs = `<mask id="${u("M")}" maskUnits="userSpaceOnUse" x="-4" y="-4" width="${vw + 8}" height="${vh + 8}"><path d="${plate}" fill="#fff"/><g fill="#000">${num()}${pin}</g></mask>`;
    defs += `<filter id="${u("b")}" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="${mini ? 0.9 : 1.3}"/></filter>`;
    if (tierKey === "HOMA") fill = "#b59b78";
    else if (tierKey === "STADE") fill = "#cfdbe5";
    else if (tierKey === "PRO") {
      defs += `<linearGradient id="${u("g")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4b075"/><stop offset="1" stop-color="#bd9455"/></linearGradient>`;
      fill = `url(#${u("g")})`;
    } else if (tierKey === "CHAMPION") {
      defs += `<linearGradient id="${u("g")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6c983"/><stop offset=".45" stop-color="#a87c31"/><stop offset=".7" stop-color="#dcbb69"/><stop offset="1" stop-color="#9a7430"/></linearGradient>`;
      fill = `url(#${u("g")})`;
    } else {
      defs += `<linearGradient id="${u("g")}" x1="0" y1="0" x2="1" y2=".9"><stop offset="0" stop-color="#f8e5ad"/><stop offset=".3" stop-color="#a87b2e"/><stop offset=".5" stop-color="#fff2c8"/><stop offset=".75" stop-color="#9a6e24"/><stop offset="1" stop-color="#f1d596"/></linearGradient>`;
      fill = `url(#${u("g")})`;
    }
    const sw = mini ? 2.6 : 3.4;
    const halo = mini
      ? `<g fill="none" stroke="${BLUE}" stroke-linejoin="round">${num(` stroke-width="${sw}" opacity=".85"`)}</g>`
      : `<g fill="none" stroke="${BLUE}" stroke-linejoin="round">${num(` stroke-width="${sw * 2.6}" opacity=".32" filter="url(#${u("b")})"`)}${num(` stroke-width="${sw}" opacity=".72"`)}</g>`;
    let extra = "";
    if (tierKey === "STADE" && !mini) extra = `<path d="M${vw * 0.62} ${vh + 2}L${vw * 0.86} -2" stroke="#fff" stroke-opacity=".6" stroke-width="2.4"/>`;
    if (tierKey === "CHAMPION")
      extra = `<path d="M${rr + 1.2} ${vh - 1.2}V${rr + 1.2}H${vw - cc - 0.6}" fill="none" stroke="#fff3cf" stroke-opacity=".7" stroke-width="${mini ? 0.8 : 0.9}"/>`;
    if (legend) extra = `<path d="M${rr + 0.8} ${vh - 1}V${rr + 0.8}H${vw - cc - 0.4}" fill="none" stroke="#fffbe8" stroke-opacity=".9" stroke-width="${mini ? 0.9 : 1}"/>`;
    const wallW = mini ? 0.7 : 1;
    const wall =
      `<mask id="${u("w")}" maskUnits="userSpaceOnUse" x="-4" y="-4" width="${vw + 8}" height="${vh + 8}"><g fill="#fff">${num()}${pin}</g><g fill="#000" transform="translate(${wallW} ${wallW})">${num()}${pin}</g></mask>` +
      `<rect x="-4" y="-4" width="${vw + 8}" height="${vh + 8}" fill="${legend || tierKey === "CHAMPION" ? "#6e521c" : tierKey === "STADE" ? "#5d7590" : "#4a3517"}" mask="url(#${u("w")})"/>`;
    const tape =
      tierKey === "HOMA" && !mini
        ? `<g transform="translate(4 4.5) rotate(-31)"><rect x="-9" y="-2.6" width="18" height="5.2" fill="#e8ddbf" opacity=".95"/></g>`
        : "";
    const body = thick ? `<g mask="url(#${u("M")})" transform="translate(${r2(thick * 0.3)} ${thick})"><rect x="-4" y="-4" width="${vw + 8}" height="${vh + 8}" fill="#6e521c"/></g>` : "";
    const film = tierKey === "STADE" ? ` class="c04-film"` : "";
    const S = MC.s(o);
    return (
      `<span class="c04-tok c04-tok--${tierKey.toLowerCase()}${mini ? " c04-tok--mini" : ""}" role="img" aria-label="${esc(`${p.ovr} ${S.ovr}, ${S.tiers[tierKey]}${p.founder ? ", " + S.founderLine : ""}`)}">` +
      `<svg width="${wpx}" height="${hpx}" viewBox="-1 -1 ${vw + 2} ${vh + 1 + padB}" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
      body +
      `<g mask="url(#${u("M")})"><rect x="-4" y="-4" width="${vw + 8}" height="${vh + 8}" fill="${fill}"${film}/>${halo}${extra}</g>` +
      wall +
      `<path d="${plate}" fill="none" class="c04-edge${tierKey === "STADE" ? " c04-edge--film" : ""}" stroke-width="${mini ? 0.9 : 0.8}"/>` +
      tape +
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
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const id = MC.uid("c04s");
    const name = MC.nameOf(p, o);
    const X = (x) => (ar ? 360 - x : x);
    const steps = [
      [30, 0.06],
      [19, 0.1],
      [10, 0.17],
    ];
    const sprayed = (attrs, content) =>
      steps.map(([w, a]) => `<text ${attrs} fill="none" stroke="${BLUE}" stroke-width="${w}" stroke-linejoin="round" opacity="${a}">${content}</text>`).join("") +
      `<text ${attrs} fill="${BLUE}">${content}</text>`;
    const big = sprayed(`x="${ar ? 340.4 : 16.7}" y="236" text-anchor="${ar ? "end" : "start"}" font-family="Saira Stencil One" font-size="183"`, p.ovr);
    const nm = ar
      ? sprayed(`x="336" y="314" text-anchor="end" font-family="Reem Kufi" font-weight="700" font-size="66"`, esc(name))
      : sprayed(`x="24" y="314" font-family="Saira Stencil One" font-size="64"`, esc(name));
    const tierWord = S.tiers[p.tier] || p.tier;
    const tierSpray = ar
      ? sprayed(`x="24" y="58" font-family="Changa" font-weight="700" font-size="26"`, esc(tierWord))
      : sprayed(`x="336" y="58" text-anchor="end" font-family="Saira Stencil One" font-size="28"`, esc(tierWord));
    const bg =
      `<svg class="c04-sh-bg" viewBox="0 0 360 640" aria-hidden="true" focusable="false">` +
      `<defs><linearGradient id="${id}-fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d0d8"/><stop offset=".12" stop-color="#d5dbe2"/><stop offset="1" stop-color="#dde2e8"/></linearGradient></defs>` +
      `<rect width="360" height="640" fill="#e5e8ec"/>` +
      `<rect y="506" width="360" height="134" fill="url(#${id}-fl)"/>` +
      `<path d="M0 506H360" stroke="#f7f9fb" stroke-width="1.5"/>` +
      big +
      nm +
      tierSpray +
      `<text x="${X(336)}" y="78" text-anchor="${ar ? "start" : "end"}" font-family="Manrope" font-weight="700" font-size="11" fill="${NAVY}" letter-spacing=".4" direction="ltr">${esc(p.season)}</text>` +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "mono", color: NAVY, w: 124, label: false });
    const card = full(p, { ...o, thumb: false, motion: false, _onLight: true });
    const handle = "@" + String(p.name.lat).toLowerCase();
    return (
      `<div class="c04-share" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      bg +
      `<div class="c04-sh-logo">${logo}</div>` +
      `<div class="c04-sh-cast">${card}</div>` +
      `<div class="c04-sh-plate">${card}</div>` +
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
      el.style.setProperty("--c04-lift", `${r2(-18 - 34 * (1 - y))}deg`);
    };
    el.addEventListener("pointermove", set);
    el.addEventListener("pointerleave", () => el.style.removeProperty("--c04-lift"));
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
      "A landscape plate (3:2) with one 45° clipped corner, the way real brass stencils mark which way is up. Everything that identifies the manager is cut through it: the 84 in Saira Stencil, the name, the crest, the manager seen from behind and one crate-mark line of stats. The cuts are real transparency, so the plate is the only identity in the set whose outline states its rating.",
      "Three devices keep the holes legible on any ground: a cut wall (the plate's thickness, dark on the top and start edges of each hole), a lit lip on the bottom and end edges, and a Logo-Blue overspray halo that builds up around every cut the way paint does on a used stencil. Ink is only used for what a workshop would stamp or write: the BotolaGO wordmark, the tier, the season, the ID, the origin and the founder caption.",
      "The sample plate carries one coat of overspray because ALI is in his first season. The system adds one coat per completed season (Logo Blue, then navy, then the club colour), never cleaned, so an old plate looks veteran without a single extra badge.",
    ],
    belonging: [
      "It is a tool you own and use, not a certificate someone issued you. The paint on it is your seasons; the material is how far you have climbed. A three-season plate looks lived-in in a way a fresh account cannot copy.",
      "The leaderboard flex is literal: your own highlighted row shows through your number, because the 84 is a hole. Nobody else's row does that for you.",
      "The ladder reads instantly to a teenager (cardboard is where everyone starts, brass is what you want), and the LEGEND plate is quiet enough that an adult Fantasy player is not embarrassed to post it.",
      "The share image is the print the plate makes, not a screenshot of a card, so posting it feels like showing your work.",
    ],
    founderMark: [
      "A perfin: 2026 pin-punched through the plate as a 5×7 dot matrix, with the BotolaGO ID punched below in smaller holes, under the clipped corner. Like the 84, you see through it; it is never painted, and the overspray never fills it.",
      "It does not upgrade. It is the same pattern on cardboard and on brass, only cleaner on metal, so it reads as the one thing on the plate that was there from day one.",
      "At token size it collapses to a single pinhole beside the clipped corner — 'the founder hole' — visible in every ranking and comment. Later cohorts would get their own year in a different punch pattern, so 2026 is first in a series, with no edition count invented.",
    ],
    small: [
      "44–80px: a 64×40 plate with the clipped corner and the OVR knocked out (Saira Stencil at 40px and above). The row's own background shows through the number, and a one-coat Logo-Blue halo keeps the cut defined on a white row.",
      "24–32px: a 36×24 plate with the OVR cut in Changa 800 (Saira's bridges clog below 40px), the clipped corner and the founder pinhole. The tier is told by the plate itself — rough kraft edge, translucent film, solid manila, brass with a bevel line, polished brass with an extruded edge — so HOMA and LEGEND never look the same in a comment line.",
    ],
    rtl: [
      "The plate never mirrors: it is a physical tool with a fixed orientation corner, so the corner stays top-right and the 84 stays cut on the left in both languages. What mirrors is the content of each line: in Arabic the name علي is cut flush to the end of the number column, followed by the crest and المغرب, and the crate-mark line runs right to left from the end edge.",
      "علي is cut from Reem Kufi 700 with hand-placed bridges across the counter of ع and at the ل–ي join; Arabic stat labels are cut from Reem Kufi 600. No tracking on Arabic, Western digits kept left to right, and the share image mirrors fully (logo at the top right, the plate leaning on the left).",
    ],
    tiers: {
      HOMA: "Kraft cardboard cut with a utility knife: wobbling edges, fat 5u bridges, corrugation visible inside every cut, a strip of masking tape across the top corner and the header written in marker. One soft coat soaks into the board.",
      STADE: "Frosted acetate film. The plate tints whatever is behind it, the cuts are crisp with a bright cut edge, one diagonal sheen line, printed registration marks where the pin holes will later be punched, and a printed header.",
      PRO: "Oiled manila board: warm, mottled, slightly waxy, with clean cuts, a rubber-stamped header and the first even coat of Logo Blue.",
      CHAMPION: "Brushed brass with a visible 1.6u edge thickness, light catching every cut edge, two registration pin holes punched through, an engraved header and an engraved orientation arrow in the clipped corner.",
      LEGEND: "Thick polished brass with a 3u extruded edge and no bridges at all: the counters of the 8 and the 4 float, held by a fine screen mesh visible only inside the holes. The plate rests half-lifted on its bottom hinge, so its own print — the 84 sprayed in Logo Blue on white — shows through the cuts.",
    },
    legend: [
      "The lift. On reveal, one spray pass, then the plate peels up from its bottom edge (rotateX 0 → −62°, settle ease) and shows the 84 sprayed crisp in Logo Blue on the print beneath, then settles half-lifted at −18°. It never loops; under reduced motion it simply rests half-lifted.",
      "In the profile the lift follows the pointer, so the plate can be peeled off its print by hand.",
    ],
    advantages: [
      "The silhouette contains the rating: in the solid-colour test the plate still says 84. No other outline in either exploration does this.",
      "It adapts to both themes by construction, because the ground is literally part of the number.",
      "Tier progression is a change of material and cut quality (cardboard → film → board → brass → polished brass, knife → laser, bridges → bridgeless), not a recolour.",
      "The share image is a natural social format: the print and the tool together.",
    ],
    risks: [
      "Stencil type carries military crate-marking and graffiti connotations; the restraint (no drips, no tags, no ultras names) has to hold in every future asset.",
      "Arabic has no stencil face here: bridges are hand-placed per name, which does not scale to every user's name without a real Arabic stencil design or an automatic bridging rule.",
      "The holes depend on the cut wall and the halo to read; on the light ground the kraft and acetate tiers are the weakest, and the stat line at 200px is small.",
      "Kraft at HOMA could read as 'poor' rather than 'origin'. The landscape format is also wider than every portrait card in a mixed collection grid.",
      "The SVG is filter-heavy (turbulence, lighting, masks); a production version would need pre-rendered textures for long leaderboards.",
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
