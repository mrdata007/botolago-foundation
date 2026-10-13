/**
 * The name is the card's art: written as an autograph across the face, on one line rising slightly,
 * in a signature script for a Latin name (Mr Dafoe) and in Ruq'ah for an Arabic one (Aref Ruqaa
 * 700). The face follows the name's own script, not the interface's language, so « Sami » is a
 * Latin autograph on an Arabic card and « سامي » a Ruq'ah one on a French card.
 *
 * The fit is computed without the DOM, so the card's markup is the same wherever it is drawn: a
 * width from the canvas where there is one and the faces have loaded, from the committed table
 * otherwise (`metrics.ts`). A name too long for one line at its least size breaks once, at the word
 * boundary that balances the two lines best; a name with no space stays on one line and shrinks.
 */
import { ARABIC_LETTER, ARABIC_SPACE, LATIN_ADVANCE, LATIN_CHARS, LATIN_OVERHANG } from "./metrics";

export type Script = "latin" | "arabic";

const ARABIC = /\p{Script=Arabic}/u;

/** Arabic if the name holds an Arabic letter. */
export const scriptOf = (name: string): Script => (ARABIC.test(name) ? "arabic" : "latin");

/**
 * The name as the autograph writes it: no control, format or direction characters, no emoji or
 * pictographs, no tatweel or harakat (Ruq'ah draws its own), spaces collapsed, at most 48 characters
 * cut at a word. The full name is in the label and in the text the page prints around the card.
 */
export function signatureName(name: string): string {
  const clean = String(name ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}/gu, "")
    .replace(/\u0640|[\u064B-\u065F]|\u0670/g, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (clean.length <= 48) return clean;
  const cut = clean.slice(0, 48);
  const space = cut.lastIndexOf(" ");
  return (space > 12 ? cut.slice(0, space) : cut).trim();
}

/**
 * The monogram: the first letter of the first two words (one word gives one letter), capitals in a
 * Latin name. Digits and marks are skipped; an empty name has none.
 */
export function initialsOf(name: string): string {
  const words = signatureName(name).split(" ").filter(Boolean);
  const letters: string[] = [];
  for (const word of words) {
    const letter = /\p{L}/u.exec(word)?.[0];
    if (letter) letters.push(letter);
    if (letters.length === 2) break;
  }
  return letters.join("").toLocaleUpperCase("fr");
}

/* ---------------------------------------------------------------------------------------------
   Measuring
   --------------------------------------------------------------------------------------------- */

/** The width of a run in em: the canvas when it can measure the loaded face, the table otherwise. */
export type MeasureEm = (text: string, script: Script) => number;

const LATIN_INDEX = new Map<string, number>([...LATIN_CHARS].map((ch, i) => [ch, i]));
/** A letter the table does not hold: the mean of the lower-case letters. */
const LATIN_MEAN =
  [..."abcdefghijklmnopqrstuvwxyz"].reduce(
    (sum, ch) => sum + LATIN_ADVANCE[LATIN_INDEX.get(ch)!]!,
    0,
  ) /
  26 /
  100;

export function tableEm(text: string, script: Script): number {
  if (script === "arabic") {
    let w = 0;
    for (const ch of text) w += ch === " " ? ARABIC_SPACE : ARABIC_LETTER;
    return w;
  }
  let w = 0;
  for (const ch of text) {
    const i = LATIN_INDEX.get(ch);
    w += i === undefined ? LATIN_MEAN : LATIN_ADVANCE[i]! / 100;
  }
  return w;
}

export const FACE_SPEC: Readonly<Record<Script, string>> = {
  latin: '400 100px "Mr Dafoe"',
  arabic: '700 100px "Aref Ruqaa"',
};

let context: CanvasRenderingContext2D | null | undefined;
/** The document the canvas came from: a test that puts a stand-in `document` in place gets its own. */
let contextOf: unknown;
const cache = new Map<string, number>();

function canvasEm(text: string, script: Script): number | null {
  const doc = typeof document === "undefined" ? undefined : document;
  if (doc !== contextOf) {
    context = undefined;
    contextOf = doc;
    cache.clear();
  }
  if (context === undefined) {
    context = null;
    try {
      if (typeof document !== "undefined" && typeof document.createElement === "function") {
        const ctx = document.createElement("canvas").getContext?.("2d") ?? null;
        context = ctx && typeof ctx.measureText === "function" ? ctx : null;
      }
    } catch {
      context = null;
    }
  }
  if (!context) return null;
  const key = `${script}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let loaded = false;
  try {
    loaded = !!document.fonts && document.fonts.check(FACE_SPEC[script], text);
  } catch {
    loaded = false;
  }
  // before the face has loaded the canvas measures a fallback: the table is closer
  if (!loaded) return null;
  context.font = FACE_SPEC[script];
  const width = context.measureText(text).width / 100;
  if (!(width > 0)) return null;
  cache.set(key, width);
  return width;
}

export const measureEm: MeasureEm = (text, script) =>
  canvasEm(text, script) ?? tableEm(text, script);

/** Clears the cache and forgets the canvas (tests). */
export function resetMeasure(): void {
  cache.clear();
  context = undefined;
  contextOf = undefined;
}

/* ---------------------------------------------------------------------------------------------
   The fit
   --------------------------------------------------------------------------------------------- */

/** The width the autograph's ink may take, in percent of the card's width (the line is turned 6 to 7 degrees). */
export const SIG_BOX = 80;
/** One line: the largest size and the least, in percent of the card's width (CSS `cqw`). */
const ONE_LINE = { latin: { max: 30, min: 14 }, arabic: { max: 24, min: 12 } } as const;
/** Two lines: the largest size, and the floor below which a name still shrinks rather than break again. */
const TWO_LINES = { latin: { max: 19, floor: 6 }, arabic: { max: 16, floor: 6 } } as const;

export interface SignatureFit {
  lines: string[];
  script: Script;
  /** The font size in `cqw` (percent of the card's width). */
  size: number;
}

/** The ink's width of a line in em: the advances, plus the slant's overhang for the Latin script. */
const inkEm = (line: string, script: Script, measure: MeasureEm): number =>
  measure(line, script) + (script === "latin" ? LATIN_OVERHANG + 0.12 : 0.2);

const round2 = (v: number): number => Math.round(v * 100) / 100;

export function fitSignature(name: string, measure: MeasureEm = measureEm): SignatureFit | null {
  const text = signatureName(name);
  if (!text) return null;
  const script = scriptOf(text);
  const one = ONE_LINE[script];
  const single = SIG_BOX / inkEm(text, script, measure);
  const words = text.split(" ");
  if (single >= one.min || words.length < 2) {
    return {
      lines: [text],
      script,
      size: round2(Math.max(TWO_LINES[script].floor, Math.min(one.max, single))),
    };
  }
  // the break that makes the longer line shortest
  let best = { at: 1, width: Infinity };
  for (let at = 1; at < words.length; at++) {
    const width = Math.max(
      inkEm(words.slice(0, at).join(" "), script, measure),
      inkEm(words.slice(at).join(" "), script, measure),
    );
    if (width < best.width) best = { at, width };
  }
  const two = TWO_LINES[script];
  return {
    lines: [words.slice(0, best.at).join(" "), words.slice(best.at).join(" ")],
    script,
    size: round2(Math.max(two.floor, Math.min(two.max, SIG_BOX / best.width))),
  };
}

/** The monogram's size in `cqw`: it stands in a box 62 % wide, at most 30 % tall. */
export function monogramSize(initials: string, script: Script): number {
  const count = [...initials].length;
  if (count === 0) return 0;
  if (script === "arabic") return count === 1 ? 30 : 27;
  return count === 1 ? 32 : 28;
}
