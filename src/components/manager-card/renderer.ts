/**
 * The card renderer interface (plan section 6.3). A direction (Écharpe today) implements it,
 * so the card's design can change without touching the screens.
 */
import type { BeatName, CardLang, CardProfile, CardStrings, CardTheme, TokenSize } from "./types";

export interface RenderOptions {
  strings: CardStrings;
  theme: CardTheme;
  /** One beat, or none. Ignored by tokens. Never animates the number or the serial. */
  beat?: BeatName;
}
export interface TokenOptions {
  strings: CardStrings;
  theme: CardTheme;
  size: TokenSize; // ≤ 32: the mini (row cells); 44–80: the token
}
export interface TextRun {
  text: string;
  /** In the image's coordinate space. */
  x: number;
  y: number;
  size: number;
  weight: 400 | 600 | 700 | 800;
  face: "display" | "body" | "arabic";
  anchor: "start" | "middle" | "end";
  dir: "ltr" | "rtl";
  colour: string;
}
export interface CardImageArt {
  /** Text-free SVG (knitted glyphs are geometry; every <text> is moved to `texts`). */
  svg: string;
  width: number;
  height: number;
  texts: TextRun[];
}
export interface CardRenderer {
  readonly id: string; // "echarpe-v2"
  readonly beats: readonly BeatName[];
  /** One root element: role="img", aria-label from `label`, dir from strings.lang. */
  full(profile: CardProfile, options: RenderOptions): string;
  token(profile: CardProfile, options: TokenOptions): string;
  /** height ÷ width of `full`, computed without the DOM (exact for charted names). */
  aspect(profile: CardProfile, strings: CardStrings): number;
  /** Token box in CSS px for a size: { width, height }. */
  tokenBox(profile: CardProfile, size: TokenSize): { width: number; height: number };
  /** A cropped view of one part of the full card (G2's founder block). */
  detail(profile: CardProfile, part: "founder", options: RenderOptions): string | null;
  /** The share image art (6.7). */
  image(profile: CardProfile, strings: CardStrings): CardImageArt;
  /** The one-sentence accessible name (also used as the root's aria-label). */
  label(profile: CardProfile, strings: CardStrings): string;
  /** Total length of a beat in ms (0 when unsupported). */
  beatMs(beat: BeatName): number;
}
