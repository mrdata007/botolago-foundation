/**
 * The manager's name on the plate (plan 4, revision 3): cleaned, split into the two-face set (the
 * first word in Changa 800 caps over the rest in Instrument Serif caps; Arabic names in Changa 800
 * over Changa 300), fitted to 790 units and placed by its ink so a descender never crosses the rule.
 *
 * Pure: it takes a `measure` (canvas in a browser, the committed table elsewhere) and gives lines
 * with their size and baseline. The full name is always in the label and in the DOM under the card;
 * what is drawn may drop the last words of a very long second line, never a part of a word.
 */
import { LABEL_BUDGET, NAME_BUDGET, POINT_Y, RULE_Y } from "./geometry";
import type { Measure } from "./measure";

/** Particles that take the next word onto the first line (compared after uppercasing). */
export const PARTICLES: ReadonlySet<string> = new Set([
  "LE",
  "LA",
  "LES",
  "EL",
  "AL",
  "DE",
  "DU",
  "DES",
  "ABD",
  "ABOU",
  "ABU",
  "عبد",
  "أبو",
  "ابو",
  "ابن",
  "بن",
]);

const QUOTES = /[‘’ʼ´`′]/gu;
const DASHES = /\p{Pd}/gu;

/**
 * The text that is drawn: trimmed, spaces collapsed, emoji, symbols, control and direction
 * characters dropped (and, in Arabic, tatweel and harakat), uppercased in French (accents kept),
 * apostrophes and hyphens kept. At most 80 characters (the profile's own cut).
 */
export function cleanName(raw: string): string {
  const kept = String(raw ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{M}ـ]/gu, "")
    .replace(QUOTES, "'")
    .replace(DASHES, "-")
    .replace(/[^\p{L}\p{N} '.-]/gu, "")
    .replace(/\s+/gu, " ")
    // a dash set between spaces is a hyphen (never a word of its own), and hyphens do not repeat
    .replace(/ ?-[ -]*/gu, "-")
    .replace(/^[\s-]+|[\s-]+$/gu, "");
  return kept.toLocaleUpperCase("fr").slice(0, 80).trim();
}

export interface NameLine {
  text: string;
  face: "d" | "dl" | "s";
  size: number;
  /** The baseline. */
  y: number;
  /** Set when the line is still wider than the budget at its smallest size: spaced, never squeezed. */
  textLength?: number;
  kind: "1" | "2" | "solo";
}

export interface NameLayout {
  /** The cleaned name is empty: the card draws a rule where the name would be. */
  empty: boolean;
  /** Arabic script: right to left. */
  rtl: boolean;
  lines: NameLine[];
  /** y of the empty name's rule. */
  emptyY: number;
  /** The first line's ink starts less than 20 units below the plaque or the point: a bug in the sizes. */
  tooTall: boolean;
}

export interface NameOptions {
  /** There is a plaque (a tier word or forming marks) between the shield's point and the name. */
  plaque: boolean;
  /** The face-à-face card: the first line keeps 60 at least. */
  compact: boolean;
  measure: Measure;
}

const round1 = (v: number): number => Number(v.toFixed(1));

interface Fitted {
  text: string;
  size: number;
  textLength?: number;
}

/**
 * One line to the budget: at most `max`, shrunk to fit; below `min` the last words go (only when
 * `canDrop`), and a line that still does not fit at `min` is set at `min` with its spacing opened
 * or closed to the budget (`lengthAdjust="spacing"`), never its glyphs.
 */
function fitLine(
  words: readonly string[],
  face: "d" | "dl" | "s",
  max: number,
  min: number,
  canDrop: boolean,
  measure: Measure,
): Fitted {
  const list = [...words];
  for (;;) {
    const text = list.join(" ");
    const w1 = measure(text, face).w;
    const size = Math.min(max, NAME_BUDGET / w1);
    if (size >= min) return { text, size: round1(size) };
    if (canDrop && list.length > 1) {
      list.pop();
      continue;
    }
    return { text, size: min, ...(w1 * min > NAME_BUDGET ? { textLength: NAME_BUDGET } : {}) };
  }
}

export function layoutName(raw: string, o: NameOptions): NameLayout {
  const text = cleanName(raw);
  const words = text.split(" ").filter(Boolean);
  const rtl = /\p{Script=Arabic}/u.test(text);
  const top = o.plaque ? 1142 : POINT_Y;
  const empty = words.length === 0;
  const layout: NameLayout = {
    empty,
    rtl,
    lines: [],
    emptyY: o.plaque ? 1300 : (POINT_Y + RULE_Y) / 2 - 1,
    tooTall: false,
  };
  if (empty) return layout;

  const lines: NameLine[] = [];
  if (words.length === 1) {
    const f = fitLine(words, rtl ? "d" : "s", rtl ? 112 : 144, rtl ? 72 : 64, false, o.measure);
    lines.push({ ...f, face: rtl ? "d" : "s", y: 1316, kind: "solo" });
  } else {
    // a leading particle takes the next word along (three words or more)
    const lead = words.length >= 3 && PARTICLES.has(words[0]!) ? 2 : 1;
    const f1 = fitLine(words.slice(0, lead), "d", 80, o.compact ? 60 : 56, false, o.measure);
    const face2 = rtl ? "dl" : "s";
    const f2 = fitLine(words.slice(lead), face2, rtl ? 92 : 120, rtl ? 72 : 80, true, o.measure);
    lines.push({ ...f1, face: "d", y: 1236, kind: "1" });
    lines.push({ ...f2, face: face2, y: 1342, kind: "2" });
  }

  // placement by ink: the last line's ink ends 14 above the rule, two lines keep 12 between their
  // inks, the first line's ink stays 20 below the plaque (or the point)
  const inkOf = (l: NameLine) => {
    const m = o.measure(l.text, l.face);
    return { a: m.a * l.size, d: m.d * l.size };
  };
  const last = lines[lines.length - 1]!;
  const mL = inkOf(last);
  if (last.y + mL.d > RULE_Y - 14) last.y = RULE_Y - 14 - mL.d;
  if (lines.length === 2) {
    const first = lines[0]!;
    const mF = inkOf(first);
    if (last.y - mL.a - (first.y + mF.d) < 12) first.y = last.y - mL.a - 12 - mF.d;
  }
  if (!o.plaque) {
    // no plaque at all: the block's ink centred between the shield's point and the rule
    const first = lines[0]!;
    const tp = first.y - inkOf(first).a;
    const bt = last.y + mL.d;
    const dy = (top + RULE_Y) / 2 - (tp + bt) / 2;
    for (const l of lines) l.y += dy;
  }
  for (const l of lines) l.y = round1(l.y);
  layout.tooTall = lines[0]!.y - inkOf(lines[0]!).a < top + 20;
  layout.lines = lines;
  return layout;
}

/** The Arabic stat label's size: 34, fitted to the label budget, never below 26. */
export function fitLabel(text: string, measure: Measure): number {
  const w = measure(text, "a").w * 34;
  return w > LABEL_BUDGET ? round1(Math.max((34 * LABEL_BUDGET) / w, 26)) : 34;
}
