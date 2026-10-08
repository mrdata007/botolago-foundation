/* Manager Card lab kit. Fixed fictional data and shared drawing helpers.
   No network, no product imports, no persistence. Every concept registers here. */
(function () {
  const MC = (window.MC = window.MC || {});
  MC.concepts = [];

  /* ---------- fixed sample identity (identical in every concept) ---------- */
  MC.TIERS = ["HOMA", "STADE", "PRO", "CHAMPION", "LEGEND"];
  MC.STATS = ["CAP", "SEL", "TRF", "CON"];

  MC.ALI = Object.freeze({
    key: "ali",
    name: { lat: "ALI", ar: "علي" },
    ovr: 84,
    tier: "PRO",
    country: { lat: "MOROCCO", ar: "المغرب", code: "MAR" },
    season: "2026/27",
    id: "BOT #004821",
    serial: "004821",
    founder: 2026,
    stats: { CAP: 91, SEL: 82, TRF: 86, CON: 78 },
    club: { lat: "CLUB", ar: "النادي", initials: "FC", primary: "#3b4a5e", secondary: "#e9e4d6" },
  });

  /* Fictional managers used only to test leaderboards (tier contrast at small sizes). */
  MC.SAMPLES = [
    { key: "yasmine", name: { lat: "YASMINE", ar: "ياسمين" }, ovr: 92, tier: "LEGEND", founder: 2026, serial: "000317", rank: 1, pts: 1288 },
    { key: "othmane", name: { lat: "OTHMANE", ar: "عثمان" }, ovr: 88, tier: "CHAMPION", founder: null, serial: "011902", rank: 2, pts: 1241 },
    { key: "ali", name: { lat: "ALI", ar: "علي" }, ovr: 84, tier: "PRO", founder: 2026, serial: "004821", rank: 3, pts: 1196, me: true },
    { key: "salma", name: { lat: "SALMA", ar: "سلمى" }, ovr: 77, tier: "STADE", founder: null, serial: "020466", rank: 4, pts: 1150 },
    { key: "hamza", name: { lat: "HAMZA", ar: "حمزة" }, ovr: 63, tier: "HOMA", founder: null, serial: "031115", rank: 5, pts: 1097 },
  ];

  /** A full profile for a sample row (fills ALI's shared fields). */
  MC.sample = (s) =>
    Object.freeze({
      ...MC.ALI,
      key: s.key,
      name: s.name,
      ovr: s.ovr,
      tier: s.tier,
      founder: s.founder,
      serial: s.serial,
      id: "BOT #" + s.serial,
    });

  /** ALI held constant, shown in another tier's material (used for tier previews). */
  MC.withTier = (tier, base = MC.ALI) => Object.freeze({ ...base, tier });

  /* ---------- strings ---------- */
  MC.STR = {
    lat: {
      dir: "ltr",
      ovr: "OVR",
      founder: "FOUNDER",
      founderLine: "FOUNDER 2026",
      manager: "MANAGER",
      season: "SEASON",
      club: "CLUB",
      country: "MOROCCO",
      stats: { CAP: "CAP", SEL: "SEL", TRF: "TRF", CON: "CON" },
      statsLong: { CAP: "Captaincy", SEL: "Selection", TRF: "Transfers", CON: "Consistency" },
      tiers: { HOMA: "HOMA", STADE: "STADE", PRO: "PRO", CHAMPION: "CHAMPION", LEGEND: "LEGEND" },
      rank: "RANK",
      pts: "PTS",
    },
    ar: {
      dir: "rtl",
      ovr: "OVR",
      founder: "عضو مؤسس",
      founderLine: "عضو مؤسس 2026",
      manager: "مدرب",
      season: "الموسم",
      club: "النادي",
      country: "المغرب",
      stats: { CAP: "القائد", SEL: "التشكيلة", TRF: "الانتقالات", CON: "الثبات" },
      statsLong: { CAP: "قرارات القائد", SEL: "اختيار التشكيلة", TRF: "قرارات الانتقالات", CON: "الثبات" },
      tiers: { HOMA: "حومة", STADE: "ملعب", PRO: "محترف", CHAMPION: "بطل", LEGEND: "أسطورة" },
      rank: "الترتيب",
      pts: "نقطة",
    },
  };
  /** Strings for a render: MC.s(o) where o.lang is "lat" (default) or "ar". */
  MC.s = (o = {}) => MC.STR[o.lang === "ar" ? "ar" : "lat"];
  MC.isAr = (o = {}) => o.lang === "ar";
  /** The display name for a profile in the render language. */
  MC.nameOf = (p, o = {}) => (o.lang === "ar" ? p.name.ar : p.name.lat);
  /** Arabic text font stack (Changa has Arabic; Noto Sans Arabic for small text). */
  MC.AR_DISPLAY = '"Changa", "Noto Sans Arabic", sans-serif';
  MC.AR_TEXT = '"Noto Sans Arabic", "Changa", sans-serif';

  /* ---------- helpers ---------- */
  MC.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let serial = 0;
  /** Unique id for SVG defs (several copies of one card appear on a page). */
  MC.uid = (prefix = "mc") => `${prefix}-${++serial}`;
  /** Wraps Latin digits/codes so they stay left-to-right inside Arabic lines (HTML only). */
  MC.ltr = (s) => `<bdi dir="ltr">${MC.esc(s)}</bdi>`;
  /** Accessible summary for the card root (screen readers get one sentence, not SVG fragments). */
  MC.label = (p, o = {}) => {
    const s = MC.s(o);
    return `${MC.nameOf(p, o)}, ${p.ovr} OVR, ${s.tiers[p.tier]}, ${s.country}, ${p.season}, ${p.id}${p.founder ? ", " + s.founderLine : ""}, ${MC.STATS.map((k) => `${s.stats[k]} ${p.stats[k]}`).join(", ")}`;
  };

  /* ---------- the neutral manager avatar (one figure, many treatments) ---------- */
  // viewBox 0 0 200 240. The manager seen from behind, at the touchline, in a bench
  // jacket: faceless by design (not a missing photo), gender- and skin-neutral, and
  // unmistakably football. Parts are separate so concepts can recolour, stencil, stitch,
  // halftone or emboss it; the figure itself is shared by every concept.
  MC.AVATAR = {
    viewBox: "0 0 200 240",
    torso: "M2 240C4 203 26 182 62 174L84 170H116L138 174C174 182 196 203 198 240Z",
    seam: "M22 214C64 199 136 199 178 214M66 176C58 196 50 218 46 240M134 176C142 196 150 218 154 240",
    collar: "M68 168C82 161 118 161 132 168L137 190C118 183 82 183 63 190Z",
    neck: "M85 138H115L117 172C106 168 94 168 83 172Z",
    head: "M64 98C64 62 82 46 100 46C118 46 136 62 136 98C136 126 122 146 100 146C78 146 64 126 64 98Z",
    ears: "M65 94C57 92 55 114 65 118ZM135 94C143 92 145 114 135 118Z",
    hair: "M61 100C57 58 79 38 100 38C121 38 143 58 139 100C138 114 134 124 128 131C120 126 110 131 100 138C90 131 80 126 72 131C66 124 62 114 61 100Z",
    // Hood up (the default): covers head, hair and ears; its peak and centre seam make the
    // figure read as a person in a bench jacket, not the generic "no photo" bust.
    hood: "M52 180C47 150 48 118 58 94C68 72 84 60 100 58C116 60 132 72 142 94C152 118 153 150 148 180C126 171 74 171 52 180Z",
    hoodSeam: "M100 60C100 100 100 140 100 173",
    hoodRim: "M56 178C80 170 120 170 144 178",
  };
  /**
   * Draws the shared avatar as an <svg>. Colours are per part. A part set to false is not drawn;
   * a part set to "none" is drawn without fill (so it shows only when a stroke is set).
   * opts: { x, y, w, h, hood (true = hood up, the default; false = bare head), torso, seam, collar, neck, skin, hair, rim, stroke, strokeWidth, cls, preserve }
   * With the hood up, the hood takes the "torso" colour (or opts.hoodFill) and the seam colour for its centre seam.
   * rim: a colour for a thin lit edge around the whole figure (useful on dark grounds).
   */
  MC.avatar = (opts = {}) => {
    const A = MC.AVATAR;
    const o = {
      hood: true,
      torso: "#1d2f4a",
      seam: "#34507a",
      collar: "#26405f",
      neck: "#a8775a",
      skin: "#b98463",
      hair: "#1b1714",
      rim: "none",
      stroke: "none",
      strokeWidth: 0,
      ...opts,
    };
    const st = o.stroke !== "none" ? ` stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linejoin="round"` : "";
    const part = (d, fill) => (fill === false || (fill === "none" && !st) ? "" : `<path d="${d}" fill="${fill}"${st}/>`);
    const pos = o.x != null ? ` x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}"` : ` width="100%" height="100%"`;
    const rim =
      o.rim !== "none"
        ? `<g fill="none" stroke="${o.rim}" stroke-width="3" opacity=".9"><path d="${A.torso}"/>${o.hood ? `<path d="${A.hood}"/>` : `<path d="${A.hair}"/><path d="${A.ears}"/>`}</g>`
        : "";
    return (
      `<svg${pos} viewBox="${A.viewBox}" preserveAspectRatio="${o.preserve || "xMidYMax meet"}" class="${o.cls || ""}" aria-hidden="true" focusable="false">` +
      rim +
      part(A.torso, o.torso) +
      (o.seam !== "none" && o.seam !== false ? `<path d="${A.seam}" stroke="${o.seam}" stroke-width="2.5" fill="none"/>` : "") +
      (o.hood
        ? part(A.hood, o.hoodFill || o.torso) +
          (o.seam !== "none" && o.seam !== false ? `<path d="${A.hoodSeam}" stroke="${o.seam}" stroke-width="2.5" fill="none"/><path d="${A.hoodRim}" stroke="${o.seam}" stroke-width="2.5" fill="none"/>` : "")
        : part(A.neck, o.neck) + part(A.collar, o.collar) + part(A.ears, o.skin) + part(A.head, o.skin) + part(A.hair, o.hair)) +
      `</svg>`
    );
  };

  /* ---------- neutral placeholder club crest ---------- */
  // viewBox 0 0 40 48: a plain shield with a sash and a ball. Implies no real club.
  MC.CREST = {
    viewBox: "0 0 40 48",
    shield: "M20 1L38 7V22C38 34 30 42 20 47C10 42 2 34 2 22V7Z",
    sash: "M6 10L34 38L31 41L3 13Z",
  };
  MC.crest = (opts = {}) => {
    const o = { fill: "#3b4a5e", sash: "#e9e4d6", ring: "#e9e4d6", mono: null, ...opts };
    const f = o.mono || o.fill;
    const sash = o.mono ? "none" : o.sash;
    return (
      `<svg viewBox="${MC.CREST.viewBox}" width="${o.w || "100%"}" height="${o.h || "100%"}" aria-hidden="true" focusable="false">` +
      `<path d="${MC.CREST.shield}" fill="${o.mono ? "none" : f}" stroke="${o.mono || o.ring}" stroke-width="${o.mono ? 2.4 : 1.6}"/>` +
      (o.mono ? `<path d="M9 13L31 37" stroke="${o.mono}" stroke-width="2.4"/>` : `<path d="${MC.CREST.sash}" fill="${sash}"/>`) +
      `<circle cx="20" cy="22" r="5.2" fill="${o.mono ? "none" : f}" stroke="${o.mono || o.sash}" stroke-width="2"/>` +
      `</svg>`
    );
  };

  /* ---------- Morocco flag (data, used sparingly) ---------- */
  MC.flag = (opts = {}) =>
    `<svg viewBox="0 0 30 20" width="${opts.w || "100%"}" height="${opts.h || "100%"}" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#c1272d"/><path d="M15 5.2 16.9 11 12 7.4H18L13.1 11Z" fill="none" stroke="#006233" stroke-width="1.1" stroke-linejoin="round"/></svg>`;

  /* ---------- BotolaGO logo (from src/assets/brand via tools/gen-brand.mjs) ---------- */
  /**
   * MC.logo(kind, opts): kind "wordmark" | "mark". opts.variant "color" | "light" | "mono".
   * mono recolours the ink with opts.color (and the ball with opts.ball, default same colour).
   * Returns an inline <svg>; size it with opts.w / opts.h or CSS.
   */
  MC.logo = (kind = "wordmark", opts = {}) => {
    const B = window.MC_BRAND;
    const src = kind === "mark" ? B.mark : B.wordmark;
    const variant = opts.variant || "color";
    const ink = variant === "light" ? "#ffffff" : variant === "mono" ? opts.color || "currentColor" : "#0151fc";
    const ball = variant === "mono" ? opts.ball || ink : "#000000";
    const label = opts.label === false ? ' aria-hidden="true"' : ' role="img" aria-label="BotolaGO"';
    return (
      `<svg viewBox="${src.viewBox}" width="${opts.w || "100%"}"${opts.h ? ` height="${opts.h}"` : ""} style="display:block;overflow:visible"${label} focusable="false" class="${opts.cls || ""}">` +
      src.paths.map((p) => `<path d="${p.d}" fill="${p.part === "ink" ? ink : ball}"/>`).join("") +
      `</svg>`
    );
  };
  /** Aspect ratios (width / height) of the logo files. */
  MC.LOGO_RATIO = { wordmark: 1614.8063 / 288.1029, mark: 422 / 270 };

  /* ---------- registry ---------- */
  /**
   * Concept contract (see CONTRACT.md):
   *  { id, n, slug, name, category, philosophy, idea, belonging, founderMark, small, rtl,
   *    tiers:{HOMA..LEGEND}, legend, advantages[], risks[],
   *    full(p,o), token(p,o), row(p,o), share(p,o) }
   */
  MC.register = (c) => {
    MC.concepts = MC.concepts.filter((x) => x.id !== c.id).concat(c);
    MC.concepts.sort((a, b) => a.n - b.n);
  };
})();
