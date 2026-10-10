/**
 * Measuring text for the layout (plan 4, "Measuring"): the width a name takes at a given size, the
 * ink of a number (the fit on the chest), where a line's ink starts and ends (the placement by ink).
 *
 * The browser measures with a canvas, once the faces are loaded (`ready()`); the server and the unit
 * tests have no canvas and read the committed table (`metrics.ts`), which `scripts/measure-faces.ts`
 * generates from the same faces. A rating's ink always comes from the table, so a number is fitted
 * the same everywhere. Every box is returned at size 1 (em): multiply by a font size.
 *
 * Browser only, and only after the faces are in: a result is cached only when the page reports the
 * face ready for that text, so a measurement taken against a fallback face is never kept.
 */
import { ARABIC, GLYPHS, KERN, KNOWN, NUMBERS, type GlyphBox } from "./metrics";

/** d: Changa 800 · dl: Changa 300 · s: Instrument Serif 400 · a: Noto Sans Arabic 700. */
export type FaceId = "d" | "dl" | "s" | "a";

/** A string's box at size 1: advance, ink left and right (from the origin), ink ascent and descent. */
export interface Ink {
  w: number;
  x0: number;
  x1: number;
  a: number;
  d: number;
}

/** What the layout asks for: the box of `text` in `face`, at size 1. */
export type Measure = (text: string, face: FaceId) => Ink;

/** The canvas font of a face at the measuring size (1000 px: canvas rounds an ink box to pixels). */
const SPEC: Readonly<Record<FaceId, string>> = {
  d: '800 1000px "Changa"',
  dl: '300 1000px "Changa"',
  s: '400 1000px "Instrument Serif"',
  a: '700 1000px "Noto Sans Arabic"',
};
const SCALE = 1000;

const fromBox = (b: GlyphBox): Ink => ({
  w: b[0] / 100,
  x0: b[1] / 100,
  x1: b[2] / 100,
  a: b[3] / 100,
  d: b[4] / 100,
});

const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const baseLetter = (ch: string): string => ch.normalize("NFD").charAt(0);

/** The committed table's answer: whole strings first, then the letters with their kerning. */
export function tableInk(text: string, face: FaceId): Ink {
  const known = KNOWN[`${face}|${text}`];
  if (known) return fromBox(known);
  if (face === "d" || face === "dl") {
    const number = NUMBERS[text];
    if (number && face === "d") return fromBox(number);
  }
  if (ARABIC_SCRIPT.test(text)) {
    // joining changes every advance: an average per letter, spaces included in the average
    const a = ARABIC[face === "dl" ? "dl" : "d"];
    const letters = [...text].filter((ch) => ch !== " ").length;
    const w = letters * a.em;
    return { w, x0: 0, x1: w, a: a.ascent, d: a.descent };
  }
  const table = GLYPHS[face === "s" ? "s" : "d"];
  const kern = KERN[face === "s" ? "s" : "d"];
  const fallback = table["N"]!;
  const chars = [...text];
  let pen = 0;
  let x0 = 0;
  let x1 = 0;
  let a = 0;
  let d = 0;
  chars.forEach((ch, i) => {
    const g = table[ch] ?? table[baseLetter(ch)] ?? fallback;
    if (i > 0) pen += kern[baseLetter(chars[i - 1]!) + baseLetter(ch)] ?? 0;
    if (i === 0) x0 = g[1];
    x1 = pen + g[2];
    a = Math.max(a, g[3]);
    d = Math.max(d, g[4]);
    pen += g[0];
  });
  return { w: pen / 100, x0: x0 / 100, x1: x1 / 100, a: a / 100, d: d / 100 };
}

/* ------------------------------------------------------------------------------------------ */
/* The canvas, in a browser                                                                      */
/* ------------------------------------------------------------------------------------------ */

let context: CanvasRenderingContext2D | null | undefined;
function canvas(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  context = null;
  try {
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      context = document.createElement("canvas").getContext("2d");
    }
  } catch {
    context = null;
  }
  return context;
}

const cache = new Map<string, Ink>();

function canvasInk(text: string, face: FaceId): Ink | null {
  const ctx = canvas();
  if (!ctx) return null;
  const key = `${face}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  ctx.font = SPEC[face];
  ctx.textAlign = "left";
  const m = ctx.measureText(text);
  if (!(m.width > 0)) return null;
  const ink: Ink = {
    w: m.width / SCALE,
    x0: -m.actualBoundingBoxLeft / SCALE,
    x1: m.actualBoundingBoxRight / SCALE,
    a: m.actualBoundingBoxAscent / SCALE,
    d: m.actualBoundingBoxDescent / SCALE,
  };
  let loaded = true;
  try {
    loaded = !document.fonts || document.fonts.check(SPEC[face], text);
  } catch {
    loaded = true;
  }
  if (loaded) cache.set(key, ink);
  return ink;
}

/**
 * The default measure: a rating from the table, everything else from the canvas when there is one
 * and the table otherwise.
 */
export const measureText: Measure = (text, face) => {
  if (face === "d" && NUMBERS[text]) return fromBox(NUMBERS[text]);
  return canvasInk(text, face) ?? tableInk(text, face);
};

/** The table alone, for tests and any place that must lay out the same everywhere. */
export const measureTable: Measure = tableInk;

/** Clears the cache and re-reads whether a canvas exists (tests). */
export function resetMeasure(): void {
  cache.clear();
  context = undefined;
}

/* ------------------------------------------------------------------------------------------ */
/* Loading the faces                                                                             */
/* ------------------------------------------------------------------------------------------ */

const SAMPLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÉ0123456789 -'.— ابتثجحخدذرزسشصضطظعغفقكلمنهوي ءأإآؤئةى";
let loading: Promise<void> | null = null;

/**
 * Loads the faces the layout measures (Changa 300 and 800, Instrument Serif, Noto Sans Arabic 700)
 * and Manrope for the figures, within `timeoutMs`; never rejects. `active-renderer.load()` waits
 * for it before it hands the renderer over, so the first card is laid out with the right faces.
 */
export function ready(timeoutMs = 1500): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  const specs = [...Object.values(SPEC), '800 30px "Manrope"', '600 30px "Manrope"'];
  const load = Promise.all(specs.map((spec) => document.fonts.load(spec, SAMPLE).catch(() => [])))
    .then(() => undefined)
    .catch(() => undefined);
  const wait = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  loading = Promise.race([load, wait]);
  return loading;
}
