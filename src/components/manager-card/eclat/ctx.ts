/**
 * What every part of one card's drawing shares: the view, the unique id prefix, the theme, whether
 * this is the face-à-face card, whether the markup is for the share picture (flat: no stylesheet),
 * the text measure and the club's shirt colours.
 */
import type { BeatName, CardTheme } from "../types";
import { shirtColours, type ShirtColours } from "./foil";
import type { Measure } from "./measure";
import type { View } from "./view";

export interface Ctx {
  v: View;
  id: string;
  theme: CardTheme;
  /** The face-à-face card (G4, 136–200 px): micro text and stat labels dropped. */
  compact: boolean;
  /** The travelling parts carry their rest transforms (the share picture has no stylesheet). */
  flat: boolean;
  /** The text is handed back as runs, not drawn as `<text>` (the share picture). */
  runs: boolean;
  measure: Measure;
  colours: ShirtColours;
  /** The beat this render plays: the castoff beat draws its seal line. */
  beat: BeatName | "";
}

export interface CtxOptions {
  id: string;
  theme: CardTheme;
  compact?: boolean;
  flat?: boolean;
  runs?: boolean;
  beat?: BeatName | "";
  measure: Measure;
}

export function makeCtx(v: View, o: CtxOptions): Ctx {
  return {
    v,
    id: o.id,
    theme: o.theme,
    compact: !!o.compact,
    flat: !!o.flat,
    runs: !!o.runs,
    measure: o.measure,
    colours: shirtColours(v.p.club, v.F),
    beat: o.beat ?? "",
  };
}
