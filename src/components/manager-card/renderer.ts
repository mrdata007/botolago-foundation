/**
 * The card renderer interface (plan section 6.3). A card direction (today Éclat) implements it, so
 * the card's design can change without touching the screens.
 */
import type { BeatName, CardLang, CardProfile, CardStrings, CardTheme, TokenSize } from "./types";

export interface RenderOptions {
  strings: CardStrings;
  theme: CardTheme;
  /** One beat, or none. Ignored by tokens. Never animates the number or the serial. */
  beat?: BeatName;
  /**
   * The face-à-face sheet's card (Gradins G4, 136 to 200 px wide): a renderer that has a variant
   * for it draws only what stays legible at that width (Éclat drops the micro text and the stat
   * labels and sets every remaining run at 8 CSS px or more). Others ignore it.
   */
  compact?: boolean;
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
  weight: 300 | 400 | 600 | 700 | 800;
  /**
   * `display` Changa, `body` Manrope, `arabic` Noto Sans Arabic; `serif` Instrument Serif (the
   * second name line) and `displayLight` Changa 300 (the Arabic second name line).
   */
  face: "display" | "body" | "arabic" | "serif" | "displayLight";
  anchor: "start" | "middle" | "end";
  dir: "ltr" | "rtl";
  colour: string;
  /** Letter spacing in the image's units (a Latin run only; Arabic is never tracked). */
  tracking?: number;
  /** Degrees clockwise about (x, y), for a run set along the cut corner. */
  rotate?: number;
  /**
   * The width, in the image's units, the run is fitted to when its natural width is larger: the
   * card's name lines that still overflow at their smallest size are closed up by spacing, never by
   * squeezing the glyphs (`textLength` with `lengthAdjust="spacing"` in the card's SVG). A drawer
   * closes the run's letter spacing to this width, and never opens it.
   */
  fitWidth?: number;
}
export interface CardImageArt {
  /** Text-free SVG (a renderer's own glyphs may be geometry; every <text> is moved to `texts`). */
  svg: string;
  width: number;
  height: number;
  texts: TextRun[];
}
export interface CardRenderer {
  readonly id: string; // "eclat-v1"
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
  /**
   * Optional pointer behaviour for a full card the app has put in the page: the tilt (Éclat turns
   * toward a mouse or pen and floats slowly on a touch-only screen). `el` is the element the markup
   * was inserted into (the card's root is its first element child). Returns the cleanup.
   * `ManagerCard` calls it after inserting the card when the screen asks for it (`tilt`, Gradins'
   * G1 and G2) and the reader has not asked for less motion, and runs the cleanup when the markup
   * changes or the card unmounts.
   */
  mount?(el: HTMLElement): () => void;
}
