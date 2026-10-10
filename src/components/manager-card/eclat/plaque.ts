/**
 * The tier plaque under the shield's point (plan 3.3): an elongated hexagon sized to the tier word,
 * or, on a base card that is still forming, to its forming marks (confirmer fix: the marks leave the
 * shirt and fill the plaque, where a rated card prints its tier word). A base card with no marks
 * has no plaque at all and its name is centred between the shield's point and the rule.
 */
import type { Ctx } from "./ctx";
import { tierWord } from "./foil";
import { n2 } from "./geometry";

export interface Plaque {
  /** The tier word, or null (a base card). */
  word: string | null;
  /** A Latin word (also LASTREET in the Arabic interface): left to right, tracked. */
  latin: boolean;
  /** The word's size: 44, 60 on the face-à-face card. */
  fs: number;
  /** The forming marks: how many, and the size of each. */
  marksN: number;
  mw: number;
  mh: number;
  mg: number;
  marksW: number;
  /** 0 when there is no plaque. */
  w: number;
  x0: number;
  x1: number;
  path: string;
}

/** The most marks drawn; a minimum above this is spoken in the label, not drawn. */
const MAX_MARKS = 12;
/** The widest the marks may run before they are drawn narrower. */
const MARKS_BUDGET = 560;

export function plaqueOf(c: Ctx): Plaque {
  const { p, s } = c.v;
  const { measure, compact } = c;
  const word = p.ovr != null && p.tier ? tierWord(p.tier, s) : null;
  const latin = word != null && !/\p{Script=Arabic}/u.test(word);
  const fs = compact ? 60 : 44;
  let wordW = 0;
  if (word) {
    const m = measure(word, "d");
    wordW = (m.x1 - m.x0) * fs + (latin ? 0.22 * fs * (word.length - 1) : 0);
  }
  // the marks of a base card still forming
  const forming =
    word == null &&
    p.ovr == null &&
    p.counted != null &&
    p.minRated != null &&
    p.counted < p.minRated;
  const marksN = forming ? Math.min(p.minRated!, MAX_MARKS) : 0;
  const mh = compact ? 28 : 22;
  let mw = compact ? 72 : 60;
  let mg = compact ? 22 : 18;
  if (marksN && marksN * mw + (marksN - 1) * mg > MARKS_BUDGET) {
    const k = MARKS_BUDGET / (marksN * mw + (marksN - 1) * mg);
    mw = Math.max(14, Math.floor(mw * k));
    mg = Math.max(4, Math.floor(mg * k));
  }
  const marksW = marksN ? marksN * mw + (marksN - 1) * mg : 0;
  const w = word ? Math.max(240, wordW + 104) : marksN ? Math.max(240, marksW + 104) : 0;
  const x0 = 500 - w / 2;
  const x1 = 500 + w / 2;
  const path = w
    ? `M${n2(x0)} 1106L${n2(x0 + 24)} 1070H${n2(x1 - 24)}L${n2(x1)} 1106L${n2(x1 - 24)} 1142H${n2(x0 + 24)}Z`
    : "";
  return { word, latin, fs, marksN, mw, mh, mg, marksW, w, x0, x1, path };
}
