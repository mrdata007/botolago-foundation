/**
 * The card renderer interface (plan section 6.3). A card direction (today Éclat) implements it, so
 * the card's design can change without touching the screens.
 */
import type {
  BeatName,
  CardLang,
  CardProfile,
  CardStrings,
  CardTheme,
  TierCode,
  TokenSize,
} from "./types";

export interface RenderOptions {
  strings: CardStrings;
  theme: CardTheme;
  /** One beat, or none. Ignored by tokens. Never animates the number or the serial. */
  beat?: BeatName;
  /**
   * The face-à-face sheet's card (Curva G4, 136 to 200 px wide): a renderer that has a variant
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
  /** `clubInitials`: the initials on the club disc, which a drawer leaves out when it draws the crest. */
  part?: "clubInitials";
}
/**
 * The club's crest for the share picture to draw over the art's initials disc, in the image's
 * coordinate space. The art itself never carries it: an SVG drawn as an image loads no picture, and
 * one that did could taint the canvas. The drawer draws it only once the picture has loaded with
 * CORS; otherwise the art's initials disc stays, with its `clubInitials` run.
 */
export interface CardImageCrest {
  href: string;
  cx: number;
  cy: number;
  /** The plate's radius. */
  r: number;
  /** The plate's colour, the club ring's colour, the ring's radius and width. */
  plate: string;
  ring: string;
  ringR: number;
  ringW: number;
  /** The picture's square, and the circle it is clipped to. */
  box: number;
  clipR: number;
}
export interface CardImageArt {
  /** Text-free SVG (a renderer's own glyphs may be geometry; every <text> is moved to `texts`). */
  svg: string;
  width: number;
  height: number;
  texts: TextRun[];
  /** Present when the profile's club has a crest. */
  crest?: CardImageCrest;
}
/**
 * The material a tier is drawn in, for the screens that draw a face of the card in DOM (the stage's
 * back, the tier-up burst): the colours of the direction's own ladder, so no screen holds a palette.
 */
export interface CardPalette {
  /** The dark lacquer and the field above it. */
  plate: string;
  deep: string;
  /** The backlight, and the light of the rim. */
  glow: string;
  light: string;
  /** The small labels, and the tier word. */
  label: string;
  word: string;
  /** The frame's seven stops, light and dark. */
  metal: readonly string[];
  /** The floodlight colour. */
  beam: string;
  /** The holographic stops (CHAMPION, LEGEND), or null. */
  prism: readonly string[] | null;
}

/**
 * What a beat adds to the root element of a card that is already in the page, so the beat can be
 * played on it as it stands: the classes and attributes `full()` would have written on the root.
 * `full()` with the beat and `full()` without it differ in these and in nothing else.
 */
export interface BeatRoot {
  classes: readonly string[];
  attrs: Readonly<Record<string, string>>;
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
  /** The material of a tier (`null`: the base card, which has no tier yet). */
  palette(tier: TierCode | null): CardPalette;
  /** Total length of a beat in ms (0 when unsupported). */
  beatMs(beat: BeatName): number;
  /**
   * Optional. What `beat` adds to the root of the card `full(profile)` drew, when that is all it
   * changes: `ManagerCard` then plays the beat on the card in the page (adds these, takes them off
   * when it ends) instead of drawing the whole card again, twice, which cost a full parse, layout
   * and raster each time (`docs/engineering/CURVA_CARD_SPEED.md`). `null`: the beat changes more
   * than the root (or looks different on a card the tilt has rebuilt), so the card is drawn again.
   * An empty `BeatRoot`: the beat has nothing to light on this card.
   */
  beatRoot?(
    profile: CardProfile,
    options: { strings: CardStrings },
    beat: BeatName,
  ): BeatRoot | null;
  /**
   * Optional pointer behaviour for a full card the app has put in the page: the tilt (Éclat turns
   * toward a mouse or pen and floats slowly on a touch-only screen). `el` is the element the markup
   * was inserted into (the card's root is its first element child). Returns the cleanup.
   * `ManagerCard` calls it after inserting the card when the screen asks for it (`tilt`, Curva'
   * G1 and G2) and the reader has not asked for less motion, and runs the cleanup when the markup
   * changes, when a beat starts or ends on the card, or when the card unmounts.
   */
  mount?(el: HTMLElement): () => void;
}
