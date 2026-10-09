/**
 * The scarf's geometry: viewBox units, the gauge of each tier, the vertical plan of the hanging
 * scarf and the woven patch's measurements. Pure numbers, no charts and no markup, so a cheap
 * estimate of a card's height can share the exact arithmetic with the real drawing.
 */
import type { CardProfile, TierCode } from "../types";

export const VW = 264;
export const X0 = 26;
export const X1 = 250;
/** The width of the face. */
export const FW = X1 - X0;
export const RAIL_Y = 8;
export const RAIL_H = 14;
/** The fabric's top, turned over the tube. */
export const FT = 2;
/** The founder's cast-on keeps one gauge at every tier. */
export const CAST = { c: 7, rows: 5 } as const;
/** The back drop shows this far beyond the front's inline-start edge. */
export const BACK_DX = 10;
export const TASSELS: Readonly<Record<TierCode, number>> = {
  homa: 2,
  stade: 3,
  pro: 4,
  champion: 5,
  legend: 3,
};
/** Stitches the raised band gives the name. */
export const LEGEND_INNER = 36;
/** The season shows at most this many stripes, so the scarf keeps one height all season. */
export const MAX_STRIPES = 7;

/** The hanging scarf's tiers, and the base scarf before any rating. LEGEND is drawn raised. */
export type HangKey = Exclude<TierCode, "legend"> | "base";

/**
 * Gauge: stitches across the 224u face. HOMA chunky acrylic, STADE machine jacquard, PRO fine
 * (0.81x HOMA's stitch), CHAMPION double-knit. The base scarf (no tier yet) sits between STADE and
 * PRO, so no tier's gauge is claimed.
 */
export const GAUGE: Readonly<Record<HangKey, { cols: number; gap: number; leg: number }>> = {
  homa: { cols: 30, gap: 0.42, leg: 0.34 },
  stade: { cols: 33, gap: 0.3, leg: 0.2 },
  pro: { cols: 37, gap: 0.4, leg: 0.27 },
  champion: { cols: 42, gap: 0.5, leg: 0.36 },
  base: { cols: 36, gap: 0.34, leg: 0.24 },
};
export const FRINGE_LEN: Readonly<Record<HangKey, number>> = {
  homa: 34,
  stade: 37,
  pro: 39,
  champion: 43,
  base: 30,
};
export const TASSEL_W: Readonly<Record<Exclude<HangKey, "base">, number>> = {
  homa: 22,
  stade: 17,
  pro: 15,
  champion: 13,
};

/** The BotolaGO wordmark file's width over its height. */
export const WORDMARK_RATIO = 1614.8063 / 288.1029;

export interface PatchSpec {
  /** Scale: 1 on the hanging scarf, 1.3 on LEGEND's ends. */
  k: number;
  w: number;
  /** How many ratings, and how many columns they sit in. */
  keys: number;
  cols: number;
  head: "logo" | "season";
  footLines: number;
  footFs?: number;
  ar: boolean;
}
export interface PatchBox {
  bdr: number;
  pad: number;
  /** Inner left and right, relative to the patch's own left edge. */
  L: number;
  R: number;
  iw: number;
  lw: number;
  lh: number;
  headY: number;
  headH: number;
  figFs: number;
  labFs: number;
  cellH: number;
  stat0: number;
  footFs: number;
  ruleY: number;
  footY0: number;
  nrow: number;
  /** The patch's height in units. */
  h: number;
}

/** The woven patch's measurements, relative to its top-left corner. */
export function patchBox(s: PatchSpec): PatchBox {
  const k = s.k;
  const nrow = Math.ceil(s.keys / s.cols);
  const bdr = 2.6 * k; // satin border
  const pad = 5.6 * k;
  const L = bdr + pad;
  const R = s.w - bdr - pad;
  const iw = R - L;
  const lw = Math.min(iw * (s.cols > 1 ? 0.3 : 0.8), 52 * k);
  const lh = lw / WORDMARK_RATIO;
  const headY = bdr + pad * 0.85;
  const headH = s.head === "logo" ? lh : 7 * k;
  const figFs = (s.cols > 1 ? 14.5 : 15) * k;
  const labFs = s.ar ? 8.4 * k : 7.6 * k;
  const cellH = labFs * 1.25 + figFs * 1.02;
  const stat0 = headY + headH + 4.5 * k;
  const footFs = (s.footFs ?? 5.6) * k;
  const ruleY = stat0 + nrow * cellH + (nrow - 1) * 4 * k + 3.5 * k;
  const footY0 = ruleY + footFs * 1.4;
  const h = Math.ceil(
    (s.footLines ? footY0 + (s.footLines - 1) * footFs * 1.4 + footFs * 0.55 : ruleY) +
      pad * 0.7 +
      bdr,
  );
  return {
    bdr,
    pad,
    L,
    R,
    iw,
    lw,
    lh,
    headY,
    headH,
    figFs,
    labFs,
    cellH,
    stat0,
    footFs,
    ruleY,
    footY0,
    nrow,
    h,
  };
}

/** The hanging scarf's patch: the logo, the four ratings in a row, the serial along the foot. */
export const hangingPatchSpec = (c: number, ar: boolean): PatchSpec => ({
  k: 1,
  w: FW - 4 * c,
  keys: 4,
  cols: 4,
  head: "logo",
  footLines: 1,
  ar,
});

/** What the vertical plan of the hanging scarf needs to know. */
export interface PlanInput {
  tier: TierCode | null;
  /** The stitch size in units. */
  c: number;
  nameRows: number;
  /** Rows of the tier word (0 when the card has no tier). */
  tierRows: number;
  marks: { n: number; k: number } | null;
  /** The newest stripe is knitted by a beat: it starts out empty. */
  newStripe: boolean;
  /** Season stripes while no marks are drawn (at most MAX_STRIPES). */
  played: number;
  patchRows: number;
}
export interface Plan {
  /** Per row, from the rail down: the yarn key that replaces the ground ("" is the ground). */
  keys: string[];
  rows: number;
  digits: number;
  carrier: [number, number];
  nameBand: number;
  name: number;
  strip: number;
  tier: number;
  stripEnd: number;
  /** The first row of each counted journée's slot (when marks are drawn). */
  slots: number[];
  /** The first row of the season's stripes (when no marks are drawn). */
  season: number;
  patch: number;
}

/** The rows of the hanging scarf, from the rail down. */
export function planHanging(i: PlanInput): Plan {
  const keys: string[] = [];
  let r = 0;
  const push = (n: number, k = "") => {
    for (let q = 0; q < n; q++) keys.push(k);
    r += n;
  };
  const binding = i.tier === "champion";
  push(Math.ceil((RAIL_Y + RAIL_H + 3 - FT) / i.c));
  const plan: Plan = {
    keys,
    rows: 0,
    digits: 0,
    carrier: [0, 0],
    nameBand: 0,
    name: 0,
    strip: 0,
    tier: 0,
    stripEnd: 0,
    slots: [],
    season: 0,
    patch: 0,
  };
  // the 84 (PRO: on a cream panel; STADE: its one jacquard band under it; CHAMPION: a stripe pair)
  if (i.tier === "pro") {
    plan.digits = r + 1;
    plan.carrier = [r, 15];
    push(15, "C");
    push(1);
  } else {
    plan.digits = r;
    plan.carrier = [r, binding ? 14 : 13];
    push(binding ? 14 : 13);
    push(1);
    if (i.tier === "stade" || binding) {
      push(2, "S");
      push(1);
    }
  }
  // the name band
  plan.nameBand = r;
  plan.name = r + 1;
  push(i.nameRows + 2);
  // the tier strip: a narrow band of the stripe yarn (HOMA: a garter ridge band in the one yarn).
  // The base scarf has none.
  plan.strip = r;
  plan.tier = r + 1;
  if (i.tier) push(i.tierRows + 2, i.tier === "homa" ? "" : "S");
  plan.stripEnd = r;
  // the season and the patch
  if (i.marks) {
    // the counted journées, one stripe each: knitted (two rows of the stripe yarn) or still to
    // come (a one-row tacking line); the patch sits under them, so every stripe shows
    const done = i.marks.k - (i.newStripe ? 1 : 0);
    for (let n = 0; n < i.marks.n; n++) {
      push(n ? 1 : 2);
      plan.slots.push(r);
      push(2, n < done ? "W" : "");
    }
    push(1);
    plan.patch = r;
    push(i.patchRows + 1);
  } else {
    // one stripe per journée counted (a row of the stripe yarn, a row of ground); the patch is sewn
    // over the season after its first two stripes, so the rest run out from under its edges
    plan.season = r;
    for (let gw = 1; gw <= i.played; gw++) {
      push(1);
      push(1, gw === i.played && i.newStripe ? "" : "W");
    }
    plan.patch = plan.season + 4;
    while (r < plan.patch + i.patchRows + 1) push(1);
  }
  plan.rows = r;
  return plan;
}

/** The height of the hanging scarf's viewBox for a plan. */
export function hangingHeight(plan: Plan, c: number, key: HangKey): number {
  const yFab = FT + plan.rows * c;
  return Math.ceil(yFab + CAST.rows * CAST.c + FRINGE_LEN[key] + 8);
}

/** The hanging scarf's key for a tier (the base scarf has none; LEGEND never hangs). */
export const hangKey = (tier: TierCode | null): HangKey =>
  tier === null ? "base" : tier === "legend" ? "champion" : tier;

/** Stitches the name may use: the face less the selvedges or bound edges, and a stitch each side. */
export const innerStitches = (tier: TierCode | null): number => {
  const cols = GAUGE[hangKey(tier)].cols;
  const reserve = tier === "champion" ? 4 : tier === "stade" || tier === "pro" ? 2 : 1;
  return cols - reserve - 2;
};

/** No scarf carries more slots than this, whatever the data says. */
export const MAX_MARKS = 12;

/**
 * Which counted journées are drawn on the object: n slots (the minimum) with k knitted. Only while
 * the number is null or just reached (counted is at most n); later the season's stripes carry it.
 */
export function marksOf(
  p: Pick<CardProfile, "ovr" | "counted" | "minRated">,
): { n: number; k: number } | null {
  if (!(p.minRated != null && p.minRated > 0) || p.counted == null) return null;
  if (p.ovr != null && p.counted > p.minRated) return null;
  const n = Math.min(Math.floor(p.minRated), MAX_MARKS);
  return { n, k: Math.max(0, Math.min(Math.floor(p.counted), n)) };
}

/** LEGEND's raised band and the figure holding it: every number the portrait is laid out from. */
export const LGC = 8;
export const LG_PAD = 6;
export const LG_END_W = 90;
export const LG_GATHER = 18;
export const LG_BY = 14;

export interface LegendFrame {
  /** Rows across the band: selvedge, the 84, the name, the tier strip, selvedge. */
  nRows: number;
  rows: { digits: number; name: number; strip: number };
  BH: number;
  mid: number;
  fa: number;
  fb: number;
  xs: number;
  xe: number;
  bandCols: number;
  W: number;
  H: number;
  avS: number;
  shY: number;
  railY: number;
}

/**
 * The portrait's frame. `content` is the widest of the 84, the name and the tier word, in
 * stitches. The supporter is drawn from behind, the hood about half the span between the fists,
 * the arms raised straight, about 2.4 hood-heights long, in a V to the fists. Portrait, about
 * 1:1.45, and taller when a two-line name deepens the band.
 */
export function legendFrame(nameRows: number, tierRows: number, content: number): LegendFrame {
  // cream selvedge, a blank row, the 84 (14 rows), a blank, the name, a blank, the tier strip,
  // Logo Blue selvedge
  const digits = 2;
  const name = digits + 14 + 1;
  const strip = name + nameRows + 1;
  const nRows = strip + tierRows + 2 + 1;
  const BH = nRows * LGC;
  const mid = LG_BY + BH / 2;
  const fa = LG_PAD + LG_END_W + 4;
  const xs = fa + LG_GATHER;
  const bandCols = content + 4;
  const xe = xs + bandCols * LGC;
  const fb = xe + LG_GATHER;
  const W = fb + 4 + LG_END_W + LG_PAD;
  const avS = ((fb - fa) * 0.5) / 96;
  const armLen = 2.4 * 115 * avS;
  const shDx = fa - (W / 2 - 64 * avS);
  const shY = mid + Math.sqrt(Math.max(0, armLen * armLen - shDx * shDx));
  const railY = shY + 44 * avS;
  const H = Math.max(Math.round(W * 1.45), Math.round(railY + 72));
  return {
    nRows,
    rows: { digits, name, strip },
    BH,
    mid,
    fa,
    fb,
    xs,
    xe,
    bandCols,
    W,
    H,
    avS,
    shY,
    railY,
  };
}
