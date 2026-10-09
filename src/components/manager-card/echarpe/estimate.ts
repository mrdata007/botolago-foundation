/**
 * A cheap estimate of a full card's height ÷ width, to reserve the box before the renderer's chunk
 * has loaded. It uses the same arithmetic as the real drawing (the row plan and the patch box in
 * geometry.ts) and only guesses the one thing that needs the charts: how many rows the name takes,
 * from per-letter widths copied from them (a test pins the copy). The exact `aspect` of the
 * renderer replaces it as soon as the card is drawn.
 *
 * This file must stay free of the charts, the wordmark and the drawing code: it is imported by the
 * main bundle so that the card's box is right at first paint.
 */
import {
  FW,
  GAUGE,
  MAX_STRIPES,
  VW,
  hangKey,
  hangingHeight,
  hangingPatchSpec,
  innerStitches,
  legendFrame,
  LEGEND_INNER,
  marksOf,
  patchBox,
  planHanging,
} from "./geometry";
import { knitName } from "./knit-name";
import type { CardLang, CardProfile } from "../types";

const parse = (spec: string): Readonly<Record<string, number>> => {
  const out: Record<string, number> = { " ": 2 };
  for (const part of spec.trim().split(/\s+/)) out[part[0]] = Number(part.slice(1));
  return out;
};

/** Stitch widths of the Latin capitals at 8, 7 and 6 rows (copied from the charts; tested). */
export const LATIN_WIDTHS: readonly { rows: number; w: Readonly<Record<string, number>> }[] = [
  {
    rows: 8,
    w: parse("A6 B6 C6 D6 E6 F6 G6 H6 I2 J6 K6 L5 M8 N7 O6 P6 Q6 R6 S6 T6 U6 V6 W8 X6 Y6 Z6 -4"),
  },
  {
    rows: 7,
    w: parse("A5 B5 C5 D5 E4 F4 G5 H5 I2 J5 K5 L4 M7 N6 O5 P5 Q5 R5 S5 T6 U5 V5 W7 X5 Y6 Z5 -3"),
  },
  {
    rows: 6,
    w: parse("A5 B5 C4 D5 E4 F4 G5 H5 I2 J5 K5 L4 M7 N6 O5 P5 Q5 R5 S4 T4 U5 V5 W7 X5 Y6 Z4 -3"),
  },
];
/** Rows of the Arabic tier words once trimmed (copied from the charts; tested). */
export const ARABIC_TIER_ROWS = { homa: 7, stade: 8, pro: 8, champion: 8, legend: 8 } as const;
/** Hand-charted Arabic names: [rows, bold width, condensed width] (copied from the charts; tested). */
export const ARABIC_CHARTS: Readonly<Record<string, readonly [number, number, number]>> = {
  علي: [12, 17, 12],
  سلمى: [9, 26, 17],
  ياسمين: [10, 34, 24],
  عثمان: [12, 30, 21],
  حمزة: [10, 25, 18],
};
/** What the year stacked above the end of a name adds to its height, in rows. */
const TUCK_ROWS = 6;
/** The stitches of the tier word LEGEND: Latin on 4 rows, Arabic hand-charted. */
const LEGEND_WORD_WIDTH = { fr: 24, ar: 25 } as const;
/** The year (·26) set after a name: the dot, a stitch, and two 3-wide figures. */
const YEAR_WIDTH = 9;

const width = (text: string, w: Readonly<Record<string, number>>): number =>
  [...text].reduce((a, ch, i) => a + (w[ch] ?? 2) + (i ? 1 : 0), 0);

/**
 * Whether a name sets in `n` lines of one set of capitals. With at least n words the lines are
 * broken at spaces (set greedily); with fewer, the letters are shared out between the lines.
 */
function fitsLines(
  text: string,
  w: Readonly<Record<string, number>>,
  inner: number,
  n: number,
): boolean {
  const words = text.split(" ");
  if (words.length >= n) {
    let lines = 1;
    let used = 0;
    for (const word of words) {
      const ww = width(word, w);
      if (ww > inner) return false;
      if (used && used + 3 + ww > inner) {
        lines++;
        used = ww;
      } else used = used ? used + 3 + ww : ww;
    }
    return lines <= n;
  }
  const letters = [...text.replace(/ /g, "")];
  const stitches = letters.reduce((a, ch) => a + (w[ch] ?? 2), 0) + letters.length - n;
  return Math.ceil(stitches / n) <= inner;
}

/** Rows the name takes on the scarf, and the stitches it needs on its widest line. */
function nameBox(
  p: Pick<CardProfile, "name" | "founder">,
  ar: boolean,
  inner: number,
): { rows: number; width: number } {
  const k = knitName(p.name);
  if (k.script === "none") return { rows: ar ? 12 : 8, width: 0 };
  const year = p.founder ? YEAR_WIDTH + 1 : 0;
  if (k.script === "arabic") {
    const chart = ARABIC_CHARTS[k.text];
    if (chart) {
      const [rows, bold, thin] = chart;
      for (const w of [bold, thin]) if (w + year <= inner) return { rows, width: w + year };
      for (const w of [bold, thin])
        if (w <= inner) return { rows: rows + (p.founder ? TUCK_ROWS : 0), width: w };
    }
    // a sampled name steps down from 12 rows as it lengthens
    const letters = k.text.replace(/\s+/g, "").length;
    for (const rows of [12, 11, 10, 9, 8, 7, 6]) {
      const cols = Math.round(letters * 0.62 * rows);
      if (cols + year <= inner) return { rows, width: cols + year };
    }
    return { rows: 9 * 2 + 2, width: inner };
  }
  // the ladder, as names.ts climbs it, on the name and then on the name less its last words
  const words = k.text.split(" ");
  let lastRows = 0;
  for (let n = words.length; n >= 1; n--) {
    const text = words.slice(0, n).join(" ");
    for (const F of LATIN_WIDTHS) {
      const w = width(text, F.w);
      if (w + year <= inner) return { rows: F.rows, width: w + year };
    }
    // the year stacked above the end of the name, still on one line
    for (const F of LATIN_WIDTHS) {
      const w = width(text, F.w);
      if (w <= inner) return { rows: F.rows + (p.founder ? TUCK_ROWS : 0), width: w };
    }
    // two lines, then three or four, in the 7-row capitals, else the 6-row ones
    for (let lines = 2; lines <= 4; lines++)
      for (const F of LATIN_WIDTHS.slice(1)) {
        if (!fitsLines(text, F.w, inner, lines)) continue;
        // a year that does not fit after the last line takes a line of its own: half the time
        return { rows: lines * F.rows + (lines - 1) + (p.founder ? 3 : 0), width: inner };
      }
    lastRows = 6 * 7 + 5;
  }
  return { rows: Math.min(lastRows, 6 * 7 + 5), width: inner };
}

/**
 * Height ÷ width of the full card, from the profile alone. The interface language only changes the
 * tier word's script (Arabic is taller) and the patch's label size; it defaults to French.
 */
export function estimateAspect(profile: CardProfile, lang: CardLang = "fr"): number {
  const ar = lang === "ar";
  const tier = profile.tier;
  const nm = nameBox(profile, ar, tier === "legend" ? LEGEND_INNER : innerStitches(tier));
  if (tier === "legend") {
    const tierRows = ar ? ARABIC_TIER_ROWS.legend : 4;
    const digits =
      profile.ovr == null
        ? 14
        : String(profile.ovr).length * 9 + (String(profile.ovr).length - 1) * 2;
    const content = Math.max(digits + 1, nm.width, LEGEND_WORD_WIDTH[lang]);
    const f = legendFrame(nm.rows, tierRows, content);
    return f.H / f.W;
  }
  const key = hangKey(tier);
  const c = FW / GAUGE[key].cols;
  const marks = marksOf(profile);
  const played = profile.counted == null ? 0 : Math.max(0, Math.min(profile.counted, MAX_STRIPES));
  const patchRows = Math.ceil((patchBox(hangingPatchSpec(c, ar)).h + 2) / c);
  const plan = planHanging({
    tier,
    c,
    nameRows: nm.rows,
    tierRows: tier ? (ar ? ARABIC_TIER_ROWS[tier] : 4) : 0,
    marks,
    newStripe: false,
    played: marks ? 0 : played,
    patchRows,
  });
  return hangingHeight(plan, c, key) / VW;
}
