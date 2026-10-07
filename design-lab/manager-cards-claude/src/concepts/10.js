/* 10 QUATRE OMBRES (wildcard).
   Under four floodlights every player casts four shadows. Here the manager's four
   decision stats ARE those shadows: length = value, cast from one hub, toward the four
   lamp towers. A founder casts a fifth, short shadow from the first light.
   The tier is carried by the quality of the light, never by a colour swatch. */
(function () {
  const MC = window.MC;
  const esc = MC.esc;
  const f = (n) => Math.round(n * 100) / 100;

  const C = {
    night: "#0B1A33",
    tunnel: "#001C49",
    logo: "#0151FC",
    shadow: "#0C3164",
    muted: "#4E5661",
    meta: "#A9B2BE",
    lens: "#F4FBFF",
    sodium: "#FFA23A",
    first: "#FFF1D2",
  };

  /* ---------- the light, per tier ---------- */
  // blur = shadow penumbra per stat (user units), fill/op = shadow ink, lamp = head type,
  // cells = lamps per head [rows, cols], rim = lit edge on the figure.
  const TIER = {
    HOMA: {
      ground: "concrete", base: "#C9B59A", stripe: null, hubGlow: 0,
      blur: { CAP: 3.2, TRF: 3.2, SEL: 3.2, CON: 3.2 },
      fill: { CAP: "#2C241D", TRF: "#2C241D", SEL: "#2C241D", CON: "#2C241D" },
      op: 0.6, lamp: "sodium", rim: null, rimW: 0, bloom: C.sodium, bloomOp: 0.55,
      tok: { hub: "#F4E3C8", base: "#C9B59A", blurPx: 1.5 },
    },
    STADE: {
      ground: "synthetic", base: "#B9C7D2", stripe: null, hubGlow: 0,
      blur: { CAP: 0.5, CON: 0.5, SEL: 2.4, TRF: 2.4 },
      fill: { CAP: "#0A2650", CON: "#0A2650", SEL: "#302822", TRF: "#302822" },
      op: 0.7, lamp: "mixed", rim: "#FFE7C4", rimW: 5, rimOp: 0.55, bloom: C.lens, bloomOp: 0.45,
      tok: { hub: "#EEF3F7", base: "#B9C7D2", blurPx: 0.9 },
    },
    PRO: {
      ground: "grass", base: "#CFDDE6", stripe: "#C2D3DE", hubGlow: 0.18,
      blur: { CAP: 0.6, TRF: 0.6, SEL: 0.6, CON: 0.6 },
      fill: { CAP: C.shadow, TRF: C.shadow, SEL: C.shadow, CON: C.shadow },
      op: 0.78, lamp: "led", rim: "#FFFFFF", rimW: 6, rimOp: 0.85, bloom: C.lens, bloomOp: 0.55,
      tok: { hub: "#F3F8FB", base: "#CFDDE6", blurPx: 0.45 },
    },
    CHAMPION: {
      ground: "wet", base: "#BCCDD9", stripe: "#ACC0CF", hubGlow: 0.2,
      blur: { CAP: 0.3, TRF: 0.3, SEL: 0.3, CON: 0.3 },
      fill: { CAP: "#061D44", TRF: "#061D44", SEL: "#061D44", CON: "#061D44" },
      op: 0.88, lamp: "flood", rim: "#FFFFFF", rimW: 6.5, rimOp: 0.95, bloom: C.lens, bloomOp: 0.6, sheen: true,
      tok: { hub: "#F4F9FC", base: "#BCCDD9", blurPx: 0 },
    },
    LEGEND: {
      ground: "pristine", base: "#D5E2EA", stripe: "#C6D6E1", hubGlow: 0.95,
      blur: { CAP: 0, TRF: 0, SEL: 0, CON: 0 },
      fill: { CAP: C.shadow, TRF: C.shadow, SEL: C.shadow, CON: C.shadow },
      op: 0.84, lamp: "tower", rim: "#FFFFFF", rimW: 8, rimOp: 1, bloom: C.lens, bloomOp: 0.8, glare: true,
      tok: { hub: "#FFFFFF", base: "#D9E5EC", blurPx: 0 },
    },
  };
  const tierOf = (p) => TIER[p.tier] || TIER.PRO;

  /* ---------- geometry ---------- */
  const STATS = ["CAP", "TRF", "SEL", "CON"];
  const CORNER_OF = { CAP: "TL", TRF: "TR", SEL: "BL", CON: "BR" };
  // each shadow is cast by the lamp in the opposite corner
  const LAMP_OF = { CAP: "BR", TRF: "BL", SEL: "TR", CON: "TL" };
  // relight order (CAP, SEL, TRF, CON), founder light last
  const STEP = { CAP: 1, SEL: 2, TRF: 3, CON: 4 };
  const STEP_LAMP = { BR: 1, TR: 2, BL: 3, TL: 4 };

  /** Shadow directions and lengths for a scene: F = feet point, corners, reach trim. */
  function rig(F, corners, trim, p) {
    const out = {};
    for (const k of STATS) {
      const [cx, cy] = corners[CORNER_OF[k]];
      const dx = cx - F[0], dy = cy - F[1];
      const dist = Math.hypot(dx, dy);
      const reach = dist - (dy < 0 ? trim[0] : trim[1]);
      const L = (p.stats[k] / 100) * reach;
      const ux = dx / dist, uy = dy / dist;
      out[k] = { ang: (Math.atan2(dy, dx) * 180) / Math.PI, L, ux, uy, head: [F[0] + ux * (L - 8), F[1] + uy * (L - 8)] };
    }
    return out;
  }

  /** Catmull-Rom through points, as cubic segments (no leading M). */
  function spline(pts) {
    let d = "";
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }

  /** A human shadow lying along +x from the feet (0,0): legs, hips, shoulders, head. */
  function shadowShape(L, s = 1) {
    const Lb = L - 15 * s;
    const half = [[0.02, 3.2], [0.1, 4.6], [0.42, 7.4], [0.56, 7], [0.8, 11], [0.9, 9.6], [0.985, 3.6]].map(([t, w]) => [t * Lb, w * s]);
    const top = half.map(([x, w]) => [x, -w]).concat([[Lb + 2 * s, -3 * s]]);
    const bot = [[Lb + 2 * s, 3 * s]].concat(half.slice().reverse());
    const outer = top.concat(bot);
    const body = `M0 ${f(-1.2 * s)}L${f(outer[0][0])} ${f(outer[0][1])}${spline(outer)}L0 ${f(1.2 * s)}L${f(0.4 * Lb)} 0Z`;
    const hx = L - 8.5 * s, rx = 8.5 * s, ry = 6.5 * s;
    const head = `M${f(hx - rx)} 0A${f(rx)} ${f(ry)} 0 1 0 ${f(hx + rx)} 0A${f(rx)} ${f(ry)} 0 1 0 ${f(hx - rx)} 0Z`;
    return { body, head, d: body + head };
  }

  /* ---------- text measurement (Changa digits are proportional) ---------- */
  const inkCache = new Map();
  function ink(text, font) {
    const key = text + "|" + font;
    if (inkCache.has(key)) return inkCache.get(key);
    let r = { dx: 0, half: 0.55 * text.length * 0.5, asc: 0.64 };
    try {
      const cv = ink.cv || (ink.cv = document.createElement("canvas").getContext("2d"));
      cv.font = font;
      const m = cv.measureText(text);
      r = {
        dx: -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 200,
        half: (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 200,
        asc: m.actualBoundingBoxAscent / 100,
      };
      if (document.fonts && document.fonts.check(font)) inkCache.set(key, r);
    } catch (e) {
      /* measurement unavailable: centre on the advance */
    }
    return r;
  }

  /* ---------- shared defs ---------- */
  function defs(u, T, box, F) {
    const { x, y, w, h } = box;
    let d = "";
    d += `<clipPath id="${u}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>`;
    d += `<filter id="${u}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${box.soft || 6}"/></filter>`;
    d += `<mask id="${u}-lit" maskUnits="userSpaceOnUse" x="0" y="0" width="${x * 2 + w}" height="${y * 2 + h + 20}"><rect x="${box.lit[0]}" y="${box.lit[1]}" width="${box.lit[2]}" height="${box.lit[3]}" rx="12" fill="#fff" filter="url(#${u}-soft)"/></mask>`;
    // light pool: brightest at the hub, settling toward the edge
    d += `<radialGradient id="${u}-pool" gradientUnits="userSpaceOnUse" cx="${F[0]}" cy="${F[1]}" r="${box.poolR || 230}"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="${C.night}" stop-opacity=".22"/></radialGradient>`;
    d += `<radialGradient id="${u}-hub" gradientUnits="userSpaceOnUse" cx="${F[0]}" cy="${F[1]}" r="${box.hubR || 120}"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".35" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    // steel for lamp casings (rotates with each head)
    d += `<linearGradient id="${u}-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A7480"/><stop offset=".3" stop-color="#C9D0D7"/><stop offset=".55" stop-color="#8F99A3"/><stop offset="1" stop-color="#4C5560"/></linearGradient>`;
    d += `<radialGradient id="${u}-lens" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="${C.lens}"/><stop offset="1" stop-color="#B9CBD8"/></radialGradient>`;
    d += `<radialGradient id="${u}-sod" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#FFF0D0"/><stop offset=".45" stop-color="#FFC06A"/><stop offset="1" stop-color="${C.sodium}"/></radialGradient>`;
    d += `<radialGradient id="${u}-firstlens" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${C.first}"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloom"><stop offset="0" stop-color="${T.bloom}" stop-opacity="${T.bloomOp}"/><stop offset=".35" stop-color="${T.bloom}" stop-opacity="${f(T.bloomOp * 0.35)}"/><stop offset="1" stop-color="${T.bloom}" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloomS"><stop offset="0" stop-color="${C.sodium}" stop-opacity=".6"/><stop offset=".4" stop-color="${C.sodium}" stop-opacity=".2"/><stop offset="1" stop-color="${C.sodium}" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-bloomF"><stop offset="0" stop-color="${C.first}" stop-opacity=".75"/><stop offset=".4" stop-color="${C.first}" stop-opacity=".2"/><stop offset="1" stop-color="${C.first}" stop-opacity="0"/></radialGradient>`;
    d += `<radialGradient id="${u}-spike"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    d += `<linearGradient id="${u}-figlight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    // painted marks: grass blades break the paint
    d += `<filter id="${u}-paint" x="-4%" y="-20%" width="108%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.3 0.55" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="dsp"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 2.2" result="m"/><feComposite in="dsp" in2="m" operator="in"/></filter>`;
    d += `<filter id="${u}-contact" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="2.6"/></filter>`;
    return d;
  }

  /** Grain filter: dark and light specks from one noise field. */
  function grainFilter(id, freq, oct, seed, dark, kd, kl) {
    return (
      `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}" stitchTiles="stitch" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 ${dark[0]}  0 0 0 0 ${dark[1]}  0 0 0 0 ${dark[2]}  ${kd[0]} 0 0 0 ${kd[1]}" result="dk"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${kl[0]} 0 0 0 ${kl[1]}" result="lt"/>` +
      `<feMerge><feMergeNode in="dk"/><feMergeNode in="lt"/></feMerge></filter>`
    );
  }

  /** The lit ground for a tier, drawn inside the lit mask. */
  function ground(u, T, box, F, band) {
    const { x, y, w, h } = box;
    const R = `x="${x}" y="${y}" width="${w}" height="${h}"`;
    let d = "", g = "";
    g += `<rect ${R} fill="${T.base}"/>`;
    if (T.ground === "grass" || T.ground === "wet" || T.ground === "pristine") {
      d += `<pattern id="${u}-mowV" patternUnits="userSpaceOnUse" x="${F[0] - band / 2}" y="0" width="${band * 2}" height="40"><rect width="${band}" height="40" fill="${T.stripe}"/></pattern>`;
      d += `<filter id="${u}-mowsoft" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="1.2"/></filter>`;
      g += `<rect ${R} fill="url(#${u}-mowV)" filter="url(#${u}-mowsoft)"/>`;
      if (T.ground === "pristine") {
        // stadium checkerboard: a second cut across the first
        d += `<pattern id="${u}-mowH" patternUnits="userSpaceOnUse" x="0" y="${F[1] - band / 2}" width="40" height="${band * 2}"><rect width="40" height="${band}" fill="${T.stripe}"/></pattern>`;
        g += `<rect ${R} fill="url(#${u}-mowH)" opacity=".7" filter="url(#${u}-mowsoft)"/>`;
      }
      d += grainFilter(`${u}-grain`, "0.95 0.3", 3, 7, [0.06, 0.13, 0.24], [3.1, -1.42], [-3, 1.25]);
      g += `<rect ${R} filter="url(#${u}-grain)" opacity="${T.ground === "pristine" ? 0.38 : 0.6}"/>`;
    }
    if (T.ground === "wet") {
      // wet blades catch the lamps: specular glints, then four reflections of the heads
      d += `<filter id="${u}-wet" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.55 0.22" numOctaves="2" seed="4" result="n"/><feSpecularLighting in="n" surfaceScale="4" specularConstant="1.15" specularExponent="26" lighting-color="#ffffff" result="s"><fePointLight x="${F[0]}" y="${y - 160}" z="160"/></feSpecularLighting><feColorMatrix in="s" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.4 0.4 0.4 0 -0.3"/></filter>`;
      g += `<rect ${R} filter="url(#${u}-wet)" opacity=".75"/>`;
      d += `<radialGradient id="${u}-refl"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        const a = (Math.atan2(F[1] - cy, F[0] - cx) * 180) / Math.PI;
        g += `<ellipse cx="${f(cx + Math.cos((a * Math.PI) / 180) * 58)}" cy="${f(cy + Math.sin((a * Math.PI) / 180) * 58)}" rx="54" ry="7" fill="url(#${u}-refl)" transform="rotate(${f(a)} ${f(cx + Math.cos((a * Math.PI) / 180) * 58)} ${f(cy + Math.sin((a * Math.PI) / 180) * 58)})"/>`;
      }
    }
    if (T.ground === "concrete") {
      d += grainFilter(`${u}-grain`, "0.8", 4, 3, [0.16, 0.12, 0.09], [3.4, -1.55], [-3.4, 1.3]);
      d += grainFilter(`${u}-stain`, "0.012", 3, 9, [0.25, 0.2, 0.15], [2.2, -0.9], [0, 0]);
      g += `<rect ${R} filter="url(#${u}-stain)" opacity=".7"/>`;
      g += `<rect ${R} filter="url(#${u}-grain)" opacity=".85"/>`;
      // slab joints, saw-cut into the lot
      const j = `stroke="#6F6254" stroke-width="1.3" opacity=".75"`;
      const jl = `stroke="#F1E3CC" stroke-width=".6" opacity=".5"`;
      for (const jx of [x + w * 0.34, x + w * 0.67]) g += `<path d="M${f(jx)} ${y}V${y + h}" ${j}/><path d="M${f(jx + 1)} ${y}V${y + h}" ${jl}/>`;
      for (const jy of [y + h * 0.4, y + h * 0.78]) g += `<path d="M${x} ${f(jy)}H${x + w}" ${j}/><path d="M${x} ${f(jy + 1)}H${x + w}" ${jl}/>`;
      // a hairline crack
      g += `<path d="M${x + w * 0.08} ${y + h * 0.58}l14 -3 9 6 12 -2 7 5" fill="none" stroke="#5C5045" stroke-width=".7" opacity=".6"/>`;
      // sodium pools under each street lamp
      d += `<radialGradient id="${u}-sodpool"><stop offset="0" stop-color="${C.sodium}" stop-opacity=".42"/><stop offset="1" stop-color="${C.sodium}" stop-opacity="0"/></radialGradient>`;
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) g += `<circle cx="${cx}" cy="${cy}" r="${f(w * 0.48)}" fill="url(#${u}-sodpool)"/>`;
    }
    if (T.ground === "synthetic") {
      // terrain de proximité: fibres plus rubber crumb
      d += grainFilter(`${u}-grain`, "1.5 0.42", 2, 5, [0.05, 0.1, 0.18], [3.4, -1.5], [-3.2, 1.25]);
      d += `<filter id="${u}-crumb" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="21" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .07  0 0 0 0 .07  0 0 0 0 .08  9 0 0 0 -5.6"/></filter>`;
      g += `<rect ${R} filter="url(#${u}-grain)" opacity=".75"/>`;
      g += `<rect ${R} filter="url(#${u}-crumb)" opacity=".9"/>`;
      // the small pitch's painted line, worn
      g += `<path d="M${x} ${f(F[1] + 0.5)}H${x + w}" stroke="#F4F7FA" stroke-width="2.2" opacity=".7" filter="url(#${u}-paint)"/>`;
    }
    g += `<rect ${R} fill="url(#${u}-pool)"/>`;
    return { defs: d, g };
  }

  /* ---------- lamp heads ---------- */
  /** A lamp head in its own frame: +y points into the scene. kind: sodium | strip | led | flood | tower | first */
  function lampHead(u, kind, cx, cy, rot, sc = 1, cls = "") {
    let s = `<g class="c10-lamp ${cls}" transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)}) scale(${sc})">`;
    const edge = `stroke="${C.night}" stroke-width=".9"`;
    if (kind === "sodium") {
      s += `<rect x="-1.6" y="-16" width="3.2" height="12" rx="1.2" fill="url(#${u}-steel)" ${edge}/>`;
      s += `<path d="M-12 .5C-12 -4.5 -6.5 -6.8 0 -6.8C6.5 -6.8 12 -4.5 12 .5C12 4 7 6 0 6C-7 6 -12 4 -12 .5Z" fill="url(#${u}-steel)" ${edge}/>`;
      s += `<ellipse class="c10-lens" cx="0" cy="1.8" rx="8.4" ry="3" fill="url(#${u}-sod)"/>`;
      s += `<circle class="c10-lens" cx="0" cy="1.8" r="1.6" fill="#FFF6E4"/>`;
      return s + "</g>";
    }
    const spec = {
      strip: { w: 26, h: 12, rows: 1, cols: 4, r: 1.5 },
      led: { w: 32, h: 15, rows: 2, cols: 3, r: 1.9 },
      flood: { w: 33, h: 16, rows: 2, cols: 4, r: 1.7 },
      tower: { w: 38, h: 19, rows: 2, cols: 5, r: 1.8 },
      first: { w: 26, h: 12, rows: 1, cols: 3, r: 1.5 },
    }[kind];
    const { w, h, rows, cols, r } = spec;
    if (kind === "tower") s += `<rect x="-4.5" y="${f(-h / 2 - 8)}" width="9" height="10" rx="1.5" fill="url(#${u}-steel)" ${edge}/>`;
    if (kind === "flood" || kind === "tower") s += `<path d="M${f(-w / 2 - 2.5)} 2V${f(-h / 2 - 2)}H${f(w / 2 + 2.5)}V2" fill="none" stroke="#5B6470" stroke-width="2.2"/><path d="M${f(-w / 2 - 2.5)} 2V${f(-h / 2 - 2)}H${f(w / 2 + 2.5)}V2" fill="none" stroke="#C9D0D7" stroke-width=".7"/>`;
    s += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${kind === "first" ? h / 2 : 2.6}" fill="url(#${u}-steel)" ${edge}/>`;
    s += `<rect x="${-w / 2 + 1.2}" y="${f(-h / 2 + 0.9)}" width="${w - 2.4}" height=".9" rx=".45" fill="#fff" opacity=".55"/>`;
    const lx = -w / 2 + 2.4, ly = -h / 2 + 3.4, lw = w - 4.8, lh = h - 5.2;
    const lensFill = kind === "first" ? `url(#${u}-firstlens)` : `url(#${u}-lens)`;
    s += `<rect class="c10-lens" x="${f(lx)}" y="${f(ly)}" width="${f(lw)}" height="${f(lh)}" rx="${kind === "first" ? f(lh / 2) : 1.3}" fill="${lensFill}"/>`;
    const cw = lw / cols, ch = lh / rows;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++)
        s += `<circle class="c10-lens" cx="${f(lx + cw * (j + 0.5))}" cy="${f(ly + ch * (i + 0.5))}" r="${r}" fill="#fff" stroke="#9FB3C3" stroke-width=".45"/>`;
    return s + "</g>";
  }

  /** Lamp kinds per corner for a tier. */
  function lampKind(T, corner) {
    if (T.lamp === "mixed") return corner === "BR" || corner === "TL" ? "strip" : "sodium";
    return { sodium: "sodium", led: "led", flood: "flood", tower: "tower" }[T.lamp];
  }

  /* ---------- the figure ---------- */
  function figure(u, T, F, wFig) {
    const hFig = wFig * 1.2;
    const box = { x: F[0] - wFig / 2, y: F[1] - hFig, w: wFig, h: hFig };
    const club = MC.ALI.club;
    let s = `<g transform="translate(${F[0]} ${F[1]}) scale(1 .75) translate(${-F[0]} ${-F[1]})">`;
    if (T.rim)
      s += `<g opacity="${T.rimOp}">${MC.avatar({ ...box, torso: T.rim, seam: false, collar: T.rim, neck: T.rim, skin: T.rim, hair: T.rim, stroke: T.rim, strokeWidth: T.rimW })}</g>`;
    s += MC.avatar({ ...box, torso: "#2F3D51", seam: club.secondary, collar: "#1E2A3B", neck: "#4A3B33", skin: "#5A483F", hair: "#10151F" });
    s += MC.avatar({ ...box, torso: `url(#${u}-figlight)`, seam: false, collar: false, neck: false, skin: false, hair: `url(#${u}-figlight)` });
    return s + "</g>";
  }

  /* ---------- the four shadows (+ the founder's fifth) ---------- */
  function shadows(u, T, F, G, opts = {}) {
    const s = opts.scale || 1;
    let d = "", g = "";
    STATS.forEach((k, i) => {
      const b = T.blur[k] * (opts.blurScale || 1);
      if (b > 0) d += `<filter id="${u}-b${i}" filterUnits="userSpaceOnUse" x="-30" y="-40" width="${f(G[k].L + 60)}" height="80"><feGaussianBlur stdDeviation="${b}"/></filter>`;
    });
    g += `<g class="c10-shadows" style="mix-blend-mode:multiply">`;
    STATS.forEach((k, i) => {
      const sh = shadowShape(G[k].L, s);
      const b = T.blur[k];
      g +=
        `<g data-c10-sh="${k}" class="c10-tilt">` +
        `<g class="c10-cast c10-k${STEP[k]}">` +
        `<g transform="translate(${F[0]} ${F[1]}) rotate(${f(G[k].ang)})" fill="${T.fill[k]}" opacity="${T.op}"${b > 0 ? ` filter="url(#${u}-b${i})"` : ""}>` +
        `<path d="${sh.body}"/><path d="${sh.head}"/></g></g></g>`;
    });
    g += `</g>`;
    if (T.sheen) {
      // wet edge: a reflected line inside one edge of each shadow
      STATS.forEach((k, i) => {
        const sh = shadowShape(G[k].L, s);
        d += `<clipPath id="${u}-sc${i}"><path d="${sh.d}"/></clipPath>`;
        g += `<g data-c10-sh="${k}" class="c10-tilt"><g class="c10-cast c10-k${STEP[k]}"><g transform="translate(${F[0]} ${F[1]}) rotate(${f(G[k].ang)})"><path d="${sh.d}" transform="translate(0 ${f(-1.5 * s)})" fill="none" stroke="#DCEBF5" stroke-width="${f(0.9 * s)}" opacity=".75" clip-path="url(#${u}-sc${i})"/></g></g></g>`;
      });
    }
    return { defs: d, g };
  }

  function founderShadow(F, tipY, wFoot, wTip, text, fs, o, s = 1) {
    const x0 = F[0];
    let g = `<g class="c10-first c10-k5">`;
    g += `<path d="M${f(x0 - wFoot / 2)} ${F[1]}L${f(x0 - wTip / 2)} ${f(tipY + wTip / 2)}Q${x0} ${f(tipY - 1)} ${f(x0 + wTip / 2)} ${f(tipY + wTip / 2)}L${f(x0 + wFoot / 2)} ${F[1]}Z" fill="${C.shadow}" opacity=".9"/>`;
    if (text) {
      const ar = MC.isAr(o);
      const cy = tipY + (text.span || 0) / 2 + 6 * s;
      g += `<text x="0" y="0" transform="translate(${f(x0 + fs * 0.36)} ${f(cy)}) rotate(-90)" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" font-family="${ar ? "Noto Sans Arabic, Changa, sans-serif" : "Manrope, sans-serif"}" font-weight="800" font-size="${fs}" fill="#fff"${ar ? "" : ` letter-spacing="${f(fs * 0.08)}"`}>${text.html}</text>`;
    }
    return g + `</g>`;
  }

  /* ---------- the stat at each shadow's head ---------- */
  function statText(k, v, x, y, side, o, sz) {
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const anchor = ar ? (side === "L" ? "end" : "start") : side === "L" ? "start" : "end";
    const lab = ar
      ? `<tspan font-family="Noto Sans Arabic, sans-serif" font-weight="700" font-size="${sz.lab * 1.12}" fill="${C.muted}">${esc(S.stats[k])}</tspan>`
      : `<tspan font-family="Manrope, sans-serif" font-weight="700" font-size="${sz.lab}" fill="${C.muted}" letter-spacing="${f(sz.lab * 0.08)}">${esc(S.stats[k])}</tspan>`;
    const val = `<tspan dx="${f(sz.val * 0.22)}" direction="ltr" unicode-bidi="embed" font-family="Manrope, sans-serif" font-weight="800" font-size="${sz.val}" fill="${C.tunnel}" style="font-variant-numeric:tabular-nums">${v}</tspan>`;
    return `<text class="c10-val c10-k${STEP[k]}" x="${x}" y="${y}" text-anchor="${anchor}" direction="${ar ? "rtl" : "ltr"}">${lab}${val}</text>`;
  }

  /* ================= full card ================= */
  const BOX = { x: 16, y: 16, w: 288, h: 368, lit: [22, 22, 276, 336], soft: 6, poolR: 230, hubR: 115 };
  const CORNERS = { TL: [16, 16], TR: [304, 16], BL: [16, 384], BR: [304, 384] };
  const F_CARD = [160, 214];

  function lampsFor(u, T, corners, F, sc, founderAt) {
    let blooms = "", heads = "";
    for (const c of ["TL", "TR", "BL", "BR"]) {
      const kind = lampKind(T, c);
      const big = kind === "tower" ? 3.5 * sc : 0;
      const [x0, y0] = corners[c];
      const a = Math.atan2(F[1] - y0, F[0] - x0);
      const cx = x0 + Math.cos(a) * big, cy = y0 + Math.sin(a) * big;
      const rot = (a * 180) / Math.PI - 90;
      const bx = cx + Math.cos(a) * 6 * sc, by = cy + Math.sin(a) * 6 * sc;
      const bloomId = kind === "sodium" ? `${u}-bloomS` : `${u}-bloom`;
      blooms += `<circle class="c10-bloom c10-k${STEP_LAMP[c]}" cx="${f(bx)}" cy="${f(by)}" r="${f((kind === "tower" ? 58 : kind === "sodium" ? 44 : 40) * sc)}" fill="url(#${bloomId})"/>`;
      heads += `<g class="c10-lit c10-k${STEP_LAMP[c]}">${lampHead(u, kind, cx, cy, rot, sc)}</g>`;
      if (T.glare) {
        const L = 34 * sc;
        heads += `<g class="c10-glare c10-k${STEP_LAMP[c]}" style="mix-blend-mode:screen"><ellipse cx="${f(bx)}" cy="${f(by)}" rx="${f(L)}" ry="${f(1.1 * sc)}" fill="url(#${u}-spike)"/><ellipse cx="${f(bx)}" cy="${f(by)}" rx="${f(1.1 * sc)}" ry="${f(L)}" fill="url(#${u}-spike)"/><circle cx="${f(bx)}" cy="${f(by)}" r="${f(5 * sc)}" fill="#fff" opacity=".85"/></g>`;
      }
    }
    if (founderAt) {
      const [fx, fy] = founderAt;
      blooms += `<circle class="c10-bloom c10-k5" cx="${fx}" cy="${fy - 4 * sc}" r="${f(36 * sc)}" fill="url(#${u}-bloomF)"/>`;
      heads += `<g class="c10-lit c10-k5">${lampHead(u, "first", fx, fy + 3 * sc, 180, sc)}</g>`;
    }
    return { blooms, heads };
  }

  function full(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const T = tierOf(p);
    const u = MC.uid("c10");
    const F = F_CARD;
    const G = rig(F, CORNERS, [40, 40], p);
    const thumb = !!o.thumb;
    const gr = ground(u, T, BOX, F, 24);
    const sh = shadows(u, T, F, G);
    const lamps = lampsFor(u, T, CORNERS, F, 1, p.founder ? [160, 384] : null);

    // the 84, painted on the turf, ink-centred in its slot (x114-206)
    const ovrFont = "800 100px Changa";
    const ovrSize = thumb ? 92 : 80;
    const m = ink(String(p.ovr), ovrFont);
    const ovrX = 160 + m.dx * ovrSize;
    const ovrY = thumb ? 352 : 346;
    const unitX = ar ? 160 - m.half * ovrSize - 6 : 160 + m.half * ovrSize + 6;

    let txt = "";
    if (!thumb) {
      // name + tier, painted
      const name = esc(MC.nameOf(p, o));
      const tierWord = esc(S.tiers[p.tier]);
      txt +=
        `<text class="c10-name" x="160" y="${ar ? 72 : 70}" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" filter="url(#${u}-paint)">` +
        `<tspan font-family="Changa, sans-serif" font-weight="800" font-size="${ar ? 27 : 27}" fill="${C.logo}">${name}</tspan>` +
        `<tspan dx="7" font-family="${ar ? "Changa, Noto Sans Arabic, sans-serif" : "Changa, sans-serif"}" font-weight="700" font-size="${ar ? 15 : 14}" fill="${C.tunnel}"${ar ? "" : ` letter-spacing="1.1"`}>${tierWord}</tspan></text>`;
      // stat values just past each head
      const sz = { lab: 8.6, val: 17 };
      txt += statText("CAP", p.stats.CAP, 36, 46, "L", o, sz);
      txt += statText("TRF", p.stats.TRF, 284, 46, "R", o, sz);
      txt += statText("SEL", p.stats.SEL, 36, 352, "L", o, sz);
      txt += statText("CON", p.stats.CON, 284, 352, "R", o, sz);
      // a tapped shadow explains itself here
      txt += `<text class="c10-meaning" x="160" y="${ar ? 94 : 90}" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" font-family="${ar ? "Noto Sans Arabic, sans-serif" : "Manrope, sans-serif"}" font-weight="700" font-size="${ar ? 10 : 9}" fill="${C.tunnel}"></text>`;
    }
    txt += `<text class="c10-ovr" x="${f(ovrX)}" y="${ovrY}" direction="ltr" text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="${ovrSize}" fill="${C.tunnel}" filter="url(#${u}-paint)">${p.ovr}</text>`;
    if (!thumb)
      txt += `<text x="${f(unitX)}" y="${ovrY}" direction="ltr" text-anchor="${ar ? "end" : "start"}" font-family="Manrope, sans-serif" font-weight="800" font-size="10" letter-spacing=".9" fill="${C.muted}">${S.ovr}</text>`;

    // founder: fifth shadow, razor-sharp, straight up from the feet
    let first = "";
    if (p.founder) {
      const lab = ar ? `${esc(S.founder)} <tspan direction="ltr" unicode-bidi="embed">${p.founder}</tspan>` : `${esc(S.founder)} ${p.founder}`;
      first = founderShadow(F, 90, 16, 10.5, thumb ? null : { html: lab, span: 66 }, ar ? 7.6 : 7.4, o);
    }

    // meta strip in the night margin
    let meta = "";
    if (!thumb) {
      const mf = `font-family="Manrope, sans-serif" font-weight="700" font-size="8.4" fill="${C.meta}"`;
      const crest = (cx) => `<svg x="${cx}" y="367" width="9" height="11" viewBox="0 0 40 48" aria-hidden="true">${MC.crest({ mono: C.meta }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
      if (!ar) {
        meta += crest(30) + `<text x="43" y="376.5" ${mf} letter-spacing=".5" style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>`;
        meta += `<text x="290" y="376.5" text-anchor="end" ${mf} letter-spacing=".5">${esc(S.country)}<tspan dx="6" style="font-variant-numeric:tabular-nums">${esc(p.season)}</tspan></text>`;
      } else {
        meta += crest(281) + `<text x="277" y="376.5" text-anchor="end" direction="ltr" ${mf} style="font-variant-numeric:tabular-nums">${esc(p.id)}</text>`;
        meta += `<text x="30" y="377" text-anchor="end" direction="rtl" font-family="Noto Sans Arabic, sans-serif" font-weight="700" font-size="9" fill="${C.meta}">${esc(S.country)}<tspan dx="6" direction="ltr" unicode-bidi="embed" font-family="Manrope, sans-serif" font-size="8.4">${esc(p.season)}</tspan></text>`;
      }
    }

    const svg =
      `<svg class="c10-scene" viewBox="0 0 320 400" aria-hidden="true" focusable="false">` +
      `<defs>${defs(u, T, BOX, F)}${gr.defs}${sh.defs}</defs>` +
      `<g clip-path="url(#${u}-clip)">` +
      `<rect x="16" y="16" width="288" height="368" fill="${C.night}"/>` +
      `<g class="c10-turf" mask="url(#${u}-lit)">${gr.g}` +
      (T.hubGlow ? `<circle cx="${F[0]}" cy="${F[1]}" r="${BOX.hubR}" fill="url(#${u}-hub)" opacity="${T.hubGlow}"/>` : "") +
      `</g>` +
      `<g class="c10-paint">${txt}</g>` +
      sh.g +
      first +
      `<ellipse cx="${F[0]}" cy="${F[1] - 2}" rx="27" ry="6.5" fill="#06142B" opacity=".55" filter="url(#${u}-contact)"/>` +
      figure(u, T, F, 60) +
      `<g style="mix-blend-mode:screen">${lamps.blooms}</g>` +
      `</g>` +
      `<rect class="c10-rim" x="16.5" y="16.5" width="287" height="367" rx="3" fill="none" vector-effect="non-scaling-stroke"/>` +
      lamps.heads +
      meta +
      `</svg>`;
    return (
      `<div class="c10 c10--card t-${p.tier}${o.motion ? " c10-relight" : ""}${thumb ? " is-thumb" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${p.tier}">` +
      svg +
      `</div>`
    );
  }

  /* ================= token ================= */
  function token(p, o = {}) {
    const S = MC.s(o);
    const T = tierOf(p);
    const size = o.size || 44;
    const mini = !!o.mini || size <= 32;
    const glyph = size <= 26;
    const big = size >= 56;
    const u = MC.uid("c10t");
    const px = 100 / size; // user units per css px
    const P0 = 12, P1 = 88, c = 50;
    let d = "", g = "";
    // ground: night tile, lit square pool with soft edges
    const edge = Math.max(5, 2.2 * px);
    d += `<filter id="${u}-s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f(Math.max(2.2, 1.1 * px))}"/></filter>`;
    d += `<mask id="${u}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="${f(P0 + edge)}" y="${f(P0 + edge)}" width="${f(P1 - P0 - 2 * edge)}" height="${f(P1 - P0 - 2 * edge)}" rx="6" fill="#fff" filter="url(#${u}-s)"/></mask>`;
    d += `<radialGradient id="${u}-h" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="${glyph ? 26 : 30}"><stop offset="0" stop-color="${T.tok.hub}"/><stop offset=".55" stop-color="${T.tok.hub}" stop-opacity=".75"/><stop offset="1" stop-color="${T.tok.hub}" stop-opacity="0"/></radialGradient>`;
    d += `<linearGradient id="${u}-st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A7480"/><stop offset=".3" stop-color="#C9D0D7"/><stop offset=".6" stop-color="#8F99A3"/><stop offset="1" stop-color="#4C5560"/></linearGradient>`;
    g += `<rect x="${P0}" y="${P0}" width="${P1 - P0}" height="${P1 - P0}" rx="3" fill="${C.night}"/>`;
    let turf = `<rect x="${P0}" y="${P0}" width="${P1 - P0}" height="${P1 - P0}" fill="${T.tok.base}"/>`;
    if (T.ground === "grass" || T.ground === "wet" || T.ground === "pristine") {
      const bw = 76 / 6;
      for (let i = 1; i < 6; i += 2) turf += `<rect x="${f(P0 + bw * i)}" y="${P0}" width="${f(bw)}" height="76" fill="${T.stripe}"/>`;
      if (T.ground === "pristine") for (let i = 1; i < 6; i += 2) turf += `<rect x="${P0}" y="${f(P0 + bw * i)}" width="76" height="${f(bw)}" fill="${T.stripe}" opacity=".6"/>`;
    }
    if (T.ground === "concrete") turf += `<path d="M38 12V88M64 12V88M12 44H88" stroke="#7A6B5B" stroke-width="${f(Math.max(0.8, 0.5 * px))}" opacity=".6"/><circle cx="14" cy="14" r="40" fill="${C.sodium}" opacity=".18"/><circle cx="86" cy="86" r="40" fill="${C.sodium}" opacity=".18"/>`;
    if (T.ground === "synthetic" && big) turf += `<path d="M12 56H88" stroke="#F4F7FA" stroke-width="1.6" opacity=".6"/>`;
    turf += `<circle cx="50" cy="50" r="${glyph ? 26 : 30}" fill="url(#${u}-h)"/>`;
    g += `<g mask="url(#${u}-m)">${turf}</g>`;

    // the X: four shadows, lengths from the stats (exaggerated so ranks read at small sizes)
    const fs = glyph ? 0 : mini ? 37 : big ? 31 : 33;
    const r0 = glyph ? 8.5 : fs * 0.5 + 5;
    const reachMax = 49 - r0;
    const wpx = big ? 4.2 : mini ? 2.1 : 2.4;
    const w0 = (wpx * px) / 2;
    const sig = { HOMA: 1.4, STADE: 0, PRO: 0.45, CHAMPION: 0, LEGEND: 0 }[p.tier] || 0;
    const sigMixed = { CAP: 0.25, CON: 0.25, SEL: 1.1, TRF: 1.1 };
    let sh = `<g style="mix-blend-mode:multiply">`;
    const dirs = { CAP: [-1, -1], TRF: [1, -1], SEL: [-1, 1], CON: [1, 1] };
    STATS.forEach((k, i) => {
      const v = p.stats[k];
      const m = Math.max(0.3, Math.min(1, (v - 35) / 60));
      const L = reachMax * m;
      const ang = (Math.atan2(dirs[k][1], dirs[k][0]) * 180) / Math.PI;
      const sgPx = p.tier === "STADE" ? sigMixed[k] : sig;
      if (sgPx > 0) d += `<filter id="${u}-b${i}" filterUnits="userSpaceOnUse" x="-10" y="-20" width="80" height="40"><feGaussianBlur stdDeviation="${f(sgPx * px)}"/></filter>`;
      let shape = `M${f(r0)} ${f(-w0)}L${f(r0 + L)} ${f(-w0 * 0.55)}L${f(r0 + L)} ${f(w0 * 0.55)}L${f(r0)} ${f(w0)}Z`;
      if (big) shape += `M${f(r0 + L - 4)} 0a4.6 4.1 0 1 0 9.2 0a4.6 4.1 0 1 0 -9.2 0Z`;
      sh += `<path d="${shape}" transform="translate(50 50) rotate(${f(ang)})" fill="${T.fill[k]}" opacity="${f(Math.min(1, T.op + 0.12))}"${sgPx > 0 ? ` filter="url(#${u}-b${i})"` : ""}/>`;
      if (T.sheen && !glyph) sh += `<path d="M${f(r0 + 1)} ${f(-w0 * 0.25)}L${f(r0 + L - 1)} ${f(-w0 * 0.15)}" transform="translate(50 50) rotate(${f(ang)})" stroke="#E6F2FA" stroke-width="${f(0.5 * px)}" opacity=".9"/>`;
    });
    sh += `</g>`;
    g += `<g mask="url(#${u}-m)">${sh}</g>`;
    // founder stub: straight up, razor
    if (p.founder) {
      const y0 = glyph ? 50 - r0 : 50 - fs * 0.36 - 3.5;
      const y1 = P0 + edge * 0.9;
      const fw = Math.max(1.4 * px, glyph ? 6 : 5) / 2;
      g += `<path d="M${f(50 - fw)} ${f(y0)}L${f(50 - fw * 0.7)} ${f(y1)}H${f(50 + fw * 0.7)}L${f(50 + fw)} ${f(y0)}Z" fill="${C.shadow}" opacity=".92"/>`;
    }
    // the hub: the 84, or (24px) the manager seen from above
    if (glyph) {
      g += `<circle cx="50" cy="50" r="${f(Math.max(6.5, 1.6 * px))}" fill="${C.night}"/>`;
      if (p.tier === "LEGEND" || p.tier === "CHAMPION") g += `<circle cx="50" cy="50" r="${f(Math.max(9.5, 2.4 * px))}" fill="none" stroke="#fff" stroke-width="${f(0.8 * px)}"/>`;
    } else {
      if (p.tier === "LEGEND") g += `<circle cx="50" cy="50" r="${f(r0 - 1)}" fill="none" stroke="#fff" stroke-width="${f(Math.max(1.4, 0.8 * px))}" opacity=".95"/>`;
      const m = ink(String(p.ovr), "800 100px Changa");
      g += `<text x="${f(50 + m.dx * fs)}" y="${f(50 + (m.asc * fs) / 2)}" text-anchor="middle" direction="ltr" font-family="Changa, sans-serif" font-weight="800" font-size="${fs}" fill="${C.tunnel}">${p.ovr}</text>`;
    }
    // rim + lamp ears (the outline: a tile with four towers, a fifth for founders)
    g += `<rect class="c10-rim" x="${P0 + 0.5}" y="${P0 + 0.5}" width="${P1 - P0 - 1}" height="${P1 - P0 - 1}" rx="3" fill="none" vector-effect="non-scaling-stroke"/>`;
    const ear = { HOMA: [15, 7.5], STADE: [17, 8], PRO: [20, 9], CHAMPION: [21, 9.5], LEGEND: [24, 11] }[p.tier] || [20, 9];
    const lensC = p.tier === "HOMA" ? "#FFC06A" : C.lens;
    for (const [cx, cy, rot] of [[P0 + 1, P0 + 1, -45], [P1 - 1, P0 + 1, 45], [P0 + 1, P1 - 1, -135], [P1 - 1, P1 - 1, 135]]) {
      const lensClr = p.tier === "STADE" && (rot === 45 || rot === -135) ? "#FFC06A" : lensC;
      g += `<g transform="translate(${cx} ${cy}) rotate(${rot})"><rect x="${-ear[0] / 2}" y="${-ear[1] / 2}" width="${ear[0]}" height="${ear[1]}" rx="${p.tier === "HOMA" ? ear[1] / 2 : 1.6}" fill="url(#${u}-st)" stroke="${C.night}" stroke-width="${f(Math.max(0.8, 0.5 * px))}"/><rect x="${f(-ear[0] / 2 + 2)}" y="${f(-ear[1] / 2 + 3)}" width="${ear[0] - 4}" height="${f(ear[1] - 4.4)}" rx="1" fill="${lensClr}"/></g>`;
    }
    if (p.founder) g += `<g transform="translate(50 ${P1 + 1})"><rect x="-8" y="-4" width="16" height="8" rx="4" fill="url(#${u}-st)" stroke="${C.night}" stroke-width="${f(Math.max(0.8, 0.5 * px))}"/><rect x="-5" y="-3" width="10" height="2.6" rx="1.3" fill="${C.first}"/></g>`;
    return (
      `<span class="c10 c10--tok t-${p.tier}${mini ? " is-mini" : ""}" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(MC.label(p, o))}">` +
      `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" focusable="false"><defs>${d}</defs>${g}</svg></span>`
    );
  }

  /* ================= row ================= */
  function row(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const me = !!o.me;
    return (
      `<div class="c10 c10--row t-${p.tier}${me ? " is-me" : ""}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc((o.rank ? o.rank + ". " : "") + MC.label(p, o) + (o.pts != null ? ", " + o.pts + " " + S.pts : ""))}">` +
      `<span class="c10r-rank">${MC.ltr(o.rank ?? "")}</span>` +
      `<span class="c10r-tok">${token(p, { ...o, size: 48, mini: false })}</span>` +
      `<span class="c10r-id"><b>${esc(MC.nameOf(p, o))}</b><small>${esc(S.tiers[p.tier])}${p.founder ? `<i>${ar ? esc(S.founder) : "FOUNDER"}</i>` : ""}</small></span>` +
      `<span class="c10r-ovr">${MC.ltr(p.ovr)}</span>` +
      `<span class="c10r-pts">${MC.ltr(o.pts ?? "")}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ================= share (360x640) ================= */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const T = tierOf(p);
    const u = MC.uid("c10s");
    const F = [180, 250];
    const box = { x: 0, y: 0, w: 360, h: 640, lit: [12, 10, 336, 572], soft: 11, poolR: 330, hubR: 150 };
    const corners = { TL: [0, 0], TR: [360, 0], BL: [0, 640], BR: [360, 640] };
    const G = rig(F, corners, [113, 175], p);
    const gr = ground(u, T, box, F, 34);
    const sh = shadows(u, T, F, G, { scale: 1.35, blurScale: 1.3 });
    const lamps = lampsFor(u, T, { TL: [10, 10], TR: [350, 10], BL: [10, 630], BR: [350, 630] }, F, 1.9, null);
    const m = ink(String(p.ovr), "800 100px Changa");
    const ovrSize = 112;
    let txt = "";
    const sz = { lab: 11.5, val: 27 };
    txt += statText("CAP", p.stats.CAP, 24, 92, "L", o, sz);
    txt += statText("TRF", p.stats.TRF, 336, 92, "R", o, sz);
    txt += statText("SEL", p.stats.SEL, 24, 486, "L", o, sz);
    txt += statText("CON", p.stats.CON, 336, 486, "R", o, sz);
    const ovrY = 556;
    txt += `<text x="${f(180 + m.dx * ovrSize)}" y="${ovrY}" direction="ltr" text-anchor="middle" font-family="Changa, sans-serif" font-weight="800" font-size="${ovrSize}" fill="${C.tunnel}" filter="url(#${u}-paint)">${p.ovr}</text>`;
    const ux = ar ? 180 - m.half * ovrSize - 7 : 180 + m.half * ovrSize + 7;
    txt += `<text x="${f(ux)}" y="${ovrY}" direction="ltr" text-anchor="${ar ? "end" : "start"}" font-family="Manrope, sans-serif" font-weight="800" font-size="13" letter-spacing="1.2" fill="${C.muted}">${S.ovr}</text>`;
    let first = "";
    if (p.founder) {
      const lab = ar ? `${esc(S.founder)} <tspan direction="ltr" unicode-bidi="embed">${p.founder}</tspan>` : `${esc(S.founder)} ${p.founder}`;
      first = founderShadow(F, 98, 22, 15, { html: lab, span: 74 }, ar ? 10.4 : 10, o, 1.35);
    }
    const svg =
      `<svg class="c10-share-scene" viewBox="0 0 360 640" aria-hidden="true" focusable="false">` +
      `<defs>${defs(u, T, box, F)}${gr.defs}${sh.defs}</defs>` +
      `<g clip-path="url(#${u}-clip)">` +
      `<rect width="360" height="640" fill="${C.night}"/>` +
      `<g mask="url(#${u}-lit)">${gr.g}${T.hubGlow ? `<circle cx="${F[0]}" cy="${F[1]}" r="${box.hubR}" fill="url(#${u}-hub)" opacity="${T.hubGlow}"/>` : ""}</g>` +
      txt +
      sh.g +
      first +
      `<ellipse cx="${F[0]}" cy="${F[1] - 3}" rx="40" ry="9" fill="#06142B" opacity=".55" filter="url(#${u}-contact)"/>` +
      figure(u, T, F, 86) +
      `<g style="mix-blend-mode:screen">${lamps.blooms}</g>` +
      lamps.heads +
      `</g></svg>`;
    const sample = ar ? "مثال" : "Exemple";
    return (
      `<div class="c10 c10--share t-${p.tier}" dir="${S.dir}" lang="${ar ? "ar" : "en"}" role="img" aria-label="${esc(MC.label(p, o))}">` +
      svg +
      `<div class="c10s-logo">${MC.logo("wordmark", { variant: "color", label: false })}</div>` +
      `<div class="c10s-foot">` +
      `<p class="c10s-who"><b>${esc(MC.nameOf(p, o))}</b><span>${esc(S.tiers[p.tier])}</span><bdi dir="ltr">@${esc(p.name.lat.toLowerCase())}</bdi></p>` +
      `<p class="c10s-meta">${MC.ltr(p.id)}<span>${MC.ltr(p.season)}</span><span>${esc(sample)}</span></p>` +
      `</div></div>`
    );
  }

  /* ================= interaction ================= */
  function mount(el, o = {}) {
    if (!el || !el.classList || !el.classList.contains("c10--card") || el.dataset.c10Mounted) return;
    el.dataset.c10Mounted = "1";
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = MC.s(o);
    const tilts = el.querySelectorAll(".c10-tilt");
    const F = F_CARD;
    let target = 0, cur = 0, raf = 0;
    const apply = () => {
      cur += (target - cur) * 0.18;
      tilts.forEach((t) => t.setAttribute("transform", `rotate(${f(cur)} ${F[0]} ${F[1]})`));
      raf = Math.abs(target - cur) > 0.02 ? requestAnimationFrame(apply) : 0;
    };
    const go = (deg) => {
      target = Math.max(-6, Math.min(6, deg));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    if (!reduce) {
      // the lights swing as you move; lengths and numbers never change
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        go(((e.clientX - r.left) / r.width - 0.5) * 12);
      });
      el.addEventListener("pointerleave", () => go(0));
    }
    // tap a shadow: it darkens and names its decision
    const meaning = el.querySelector(".c10-meaning");
    el.addEventListener("click", (e) => {
      const hit = e.target.closest && e.target.closest("[data-c10-sh]");
      const k = hit && hit.getAttribute("data-c10-sh");
      el.querySelectorAll("[data-c10-sh]").forEach((n) => n.classList.toggle("is-focus", !!k && n.getAttribute("data-c10-sh") === k));
      el.classList.toggle("has-focus", !!k);
      if (meaning) meaning.textContent = k ? `${S.statsLong[k]} ${el.querySelector(`.c10-val.c10-k${STEP[k]} tspan:last-child`)?.textContent || ""}` : "";
    });
  }

  MC.register({
    id: "c10",
    n: 10,
    slug: "10",
    name: "Quatre Ombres",
    nameAr: "أربعة ظلال",
    category: "wildcard",
    philosophy: "Under four floodlights every player casts four shadows; on BotolaGO your four decisions are the shadows you cast.",
    philosophyAr: "تحت أربعة أضواء كاشفة يُلقي كل لاعب أربعة ظلال، وفي BotolaGO تصبح قراراتك الأربعة هي الظلال التي تُلقيها.",
    idea: [
      "The identity is not an object you hold but a shape you cast. The card is a patch of floodlit turf seen from the broadcast camera high above the stand, with the manager at its centre and four lamp heads biting out of its corners. Each of the four stats is drawn as one of the manager's own shadows, thrown toward a corner: CAP top-left, TRF top-right, SEL bottom-left, CON bottom-right. Length is the value. Nothing else on the card is a chart.",
      "The shadows are human — legs, hips, shoulders, a head — not spokes, and they are the figure's own body stretched along the four directions of light. That is the whole trick: the figure and its stats are literally the same shape. Every manager casts the same kind of X; no two cast the same one.",
      "Everything else is quiet on purpose. The 84 is painted on the turf in Tunnel Navy, like a pitch marking, with the grass breaking the paint; the name is painted in Logo Blue line paint. The outline — a lit panel with four towers at its corners and a fifth for founders — is constant, so the container carries recognition while the X inside is personal.",
    ],
    belonging: [
      "Your shadow is yours alone. It is built from your own decisions, and it visibly changes when you play better: a good month of captaincy literally lengthens the CAP shadow. Friends compare shapes as much as numbers — 'ton ombre CAP est plus longue que la mienne'.",
      "It is a picture of something every Moroccan player has stood in: a night match on a terrain de proximité or a Ramadan tournament after iftar, under four poles of light, four shadows at your feet. The reference is the light, not a decoration.",
      "The fifth shadow becomes the story people ask about — 'why does Ali have five shadows?' — and the answer cannot be bought or earned again. A 15-year-old wants the razor-sharp LEGEND light; an adult reads the shape as a record of a season.",
    ],
    founderMark: [
      "A fifth light. Founders get a fifth lamp at the bottom-centre edge — a warm-white capsule head that changes the outline itself — and it throws a fifth shadow straight up the card from the feet, past the head.",
      "That shadow is razor-sharp at every tier, always the same length, and carries FOUNDER 2026 set inside it in white, like an engraving in the dark. It never changes with stats or tier, and when you tilt the card the four tower shadows swing while the founder's shadow alone stays put.",
      "In the token it survives as a fifth stub pointing up out of the X, plus the fifth ear on the outline: founder status reads at 24px without a single letter.",
    ],
    small: [
      "44–80px: the token is the card reduced to its grammar — a night tile with four lamp ears, a lit pool, the 84 painted at the hub and four shadow strokes running out toward the towers. At 56px and up the strokes get heads; at 44 they are tapered rays. Ray lengths are exaggerated (value 35→100 mapped to 30→100% of the reach) so that differences between managers read at that size.",
      "32px: the 84 stays at about 12px on the hub, rays thin to 2px, no heads. 24px: the glyph alone — a navy hub dot (the manager seen from above), four rays, the founder stub and the four ears; the OVR moves into the row text beside it.",
      "Tier survives small as light quality, not colour: HOMA rays are visibly soft under amber sodium, STADE has two sharp and two soft, PRO is near-crisp on striped grass, CHAMPION is crisp with a wet highlight, LEGEND is razor-sharp with a white ring around the hub and bigger tower ears.",
    ],
    rtl: [
      "The X never mirrors. CAP is always top-left, so a manager's mark is the same shape in French and Arabic — a mirrored shadow would be a different person.",
      "Everything that is text does follow the language: علي is set in Changa 800 in line paint with no tracking, the tier word becomes محترف, the corner labels become MSA proposals (القائد، الاختيار، الانتقالات، الثبات) in Noto Sans Arabic 700, each aligned to its own corner, and the meta strip and OVR unit swap sides.",
      "Digits stay left-to-right everywhere (the 84, the stat values, 2026, 2026/27, BOT #004821). The founder line inside the fifth shadow reads عضو مؤسس with the year kept LTR. Arabic labels and the term عضو مؤسس need MSA review before they ship.",
    ],
    tiers: {
      HOMA: "A concrete lot at night under four sodium street lamps: warm aggregate speckle, saw-cut slab joints and a crack, amber pools at the corners, round cobra-head lamps on short arms. Shadows soft (3u penumbra) and warm-brown. No rim on the figure.",
      STADE: "The synthetic turf of a terrain de proximité — fibres and rubber crumb, one worn white line. Mixed light: two LED strip heads throw two crisp, cool shadows (CAP, CON); two sodium heads throw two soft, warm ones (SEL, TRF). A faint warm rim on the figure.",
      PRO: "Real grass with mowing stripes and blade grain, four LED floodlight heads with a 2×3 lamp grid, four near-crisp shadows (0.6u blur) and a white rim on the figure from the four lights.",
      CHAMPION: "Wet grass after rain: darker turf, specular glints on the blades, the four flood heads (2×4 lamps, steel yoke) reflected as streaks on the ground. Shadows darker and crisp, each with a thin reflected highlight inside one edge.",
      LEGEND: "Stadium perfection: a checkerboard cut, razor-sharp shadows with no penumbra, the hub washed white at the feet, and the four heads grown into full tower floodlights (2×5 lamps on a mast) with camera glare stars — the outline itself gets bigger ears.",
    },
    legend: [
      "A dark screen with the manager alone. The four towers catch one at a time with the splash screen's hard stepped flicker; as each one lights, its shadow snaps out from the feet and the number appears at its head — CAP, SEL, TRF, then CON. For founders the fifth light catches last, from behind, and the FOUNDER 2026 shadow falls straight up. Then everything is still. It never loops; under reduced motion the final frame shows.",
      "At LEGEND the light itself is the reward: razor shadows, white hub, tower heads with glare. Nothing on the card turns gold.",
    ],
    advantages: [
      "The most ownable mark in the set: a glyph only BotolaGO can produce, rooted in the brand's own north star ('club colours under floodlights') and in the splash screen's floodlight ceremony.",
      "Personal and comparable at the same time: the container is constant (recognition), the X inside is unique (identity), and the shape changes as you play (progression without a progress bar).",
      "Tiers are carried by real, drawable light quality — sodium, mixed, crisp, wet, razor — so they are materially different without a colour ladder, and HOMA has its own dignity instead of being the 'grey' tier.",
      "Founder status is in the outline (a fifth ear) and in the scene (a fifth shadow), not on a sticker.",
    ],
    risks: [
      "Closeness to a radar chart and to the Pépites wheel: it only works while the shadows stay human-shaped and there is no polygon, axis or ring joining the heads. Any 'simplification' toward spokes kills it.",
      "Stat differences are small (78–91), so at full size the four shadows look similar in length; the token has to exaggerate the mapping, which is honest only if it is the same mapping for everyone.",
      "At 24px an X can read as 'close' or as a bug; the hub dot and lamp ears are carrying a lot of weight there, and it is untested with real users.",
      "A mark generated per manager can read as generative NFT art if it is ever sold, minted or numbered for scarcity. It must stay a picture of play.",
      "It is abstract and needs one line of explanation the first time ('your four decisions are your four shadows'). The fifth-light myth only works if the community tells it.",
      "Heavy SVG filters (turbulence, lighting) per card: fine for a profile and a share image, needs a flattened bitmap for long lists.",
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
