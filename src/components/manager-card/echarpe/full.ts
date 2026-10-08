/**
 * The full card, its share-image art and its founder detail: the parts of the renderer that put a
 * drawing inside the root element a screen mounts.
 */
import { castOn } from "./caston";
import { BEAT_MS } from "./beats";
import { CAST, FW, GAUGE, MAX_STRIPES, VW, X0, X1, hangKey, marksOf } from "./geometry";
import { uid } from "./ids";
import { esc, f2, hashStr } from "./knit";
import { stitchPattern } from "./yarn";
import { drawHanging, layoutHanging, type DrawOptions, type Drawn } from "./hanging";
import { drawLegend, layoutLegend } from "./legend";
import { patchInk } from "./patch";
import { labelAttr, makeView, rimOf, type View } from "./view";
import type { RasterText } from "./names";
import type { CardImageArt, RenderOptions, TextRun } from "../renderer";
import type { BeatName, CardProfile, CardStrings, CardTheme } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The beats a drawing can show, and the cases each one has something to knit in. */
export function appliedBeat(v: View, beat: BeatName | undefined): BeatName | "" {
  if (!beat || !Object.hasOwn(BEAT_MS, beat)) return "";
  const { p } = v;
  if (p.tier === "legend") return beat === "legend" ? "legend" : "";
  switch (beat) {
    case "legend":
      return "";
    case "tier":
      return p.tier ? "tier" : "";
    case "founder":
      return p.founder ? "founder" : "";
    case "first":
    case "tick": {
      const marks = marksOf(p);
      const played = p.counted == null ? 0 : Math.min(p.counted, MAX_STRIPES);
      return (marks ? marks.k > 0 : played > 0) ? beat : "";
    }
    default:
      return beat;
  }
}

function drawCard(v: View, o: DrawOptions): Drawn {
  return v.p.tier === "legend"
    ? drawLegend(v, layoutLegend(v, o.raster), o)
    : drawHanging(v, layoutHanging(v, o.beat, o.raster), o);
}

/** height ÷ width of the full card, from the same layout the drawing uses (no markup is built). */
export function cardAspect(profile: CardProfile, strings: CardStrings, raster: RasterText): number {
  const v = makeView(profile, strings);
  if (v.p.tier === "legend") {
    const L = layoutLegend(v, raster);
    return L.H / L.W;
  }
  return layoutHanging(v, "", raster).H / VW;
}

function rootClass(v: View, theme: CardTheme, beat: BeatName | "", extra = ""): string {
  const parts = [
    "mc-echarpe",
    `mc-echarpe--${v.p.tier ?? "base"}`,
    `mc-echarpe--${theme}`,
    v.P.wool ? "mc-echarpe--wool" : "",
    beat ? `mc-echarpe--beat-${beat}` : "",
    extra,
  ];
  return parts.filter(Boolean).join(" ");
}

const svgRoot = (body: string, w: number, h: number, size = ""): string =>
  `<svg class="mc-svg" xmlns="${SVG_NS}" viewBox="0 0 ${f2(w)} ${f2(h)}"${size} aria-hidden="true" focusable="false" style="direction:ltr">${body}</svg>`;

/** The full card: one root element, role="img", the label, dir from the interface language. */
export function fullCard(profile: CardProfile, options: RenderOptions, raster: RasterText): string {
  const v = makeView(profile, options.strings);
  const beat = appliedBeat(v, options.beat);
  const d = drawCard(v, { theme: options.theme, beat, image: false, raster });
  return (
    `<div class="${rootClass(v, options.theme, beat)}" dir="${v.ar ? "rtl" : "ltr"}" role="img"` +
    ` aria-label="${labelAttr(profile, options.strings)}" data-mc-tier="${v.p.tier ?? "none"}"${beat ? ` data-mc-beat="${beat}"` : ""}>` +
    svgRoot(d.body, d.w, d.h) +
    `</div>`
  );
}

/** The share image's width in image pixels: the card is drawn this wide. */
export const IMAGE_WIDTH = 760;

/** The face a patch line is set in, for the canvas. */
const WEIGHT = { note: 600, k: 600, v: 700, nil: 700, meta: 700, foot: 700 } as const;

/** The card as a text-free SVG (no CSS needed) and the text runs it left out, in image pixels. */
export function cardImage(
  profile: CardProfile,
  strings: CardStrings,
  raster: RasterText,
): CardImageArt {
  const v = makeView(profile, strings);
  // the share ground is Tunnel Navy: the card takes its lit edge
  const d = drawCard(v, { theme: "dark", beat: "", image: true, raster });
  const scale = IMAGE_WIDTH / d.w;
  const height = Math.round(d.h * scale);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${IMAGE_WIDTH}" height="${height}" viewBox="0 0 ${f2(d.w)} ${f2(d.h)}">` +
    d.body +
    `</svg>`;
  const texts: TextRun[] = d.texts.map((t) => ({
    text: t.text,
    x: f2(t.x * scale),
    y: f2(t.y * scale),
    size: f2(t.size * scale),
    weight: WEIGHT[t.kind],
    face: t.arabic ? "arabic" : "body",
    anchor: t.anchor,
    dir: t.dir,
    colour: patchInk(t.kind),
  }));
  return { svg, width: IMAGE_WIDTH, height, texts };
}

/**
 * The founder's cast-on, drawn on its own: the five cream rows with 2026 between two cable twists,
 * a little of the ground above them and the bound loops along the edge. The same drawing as the
 * foot of the scarf at every tier (the cast-on keeps one gauge), so the detail is the part of the
 * card the screen shows larger. Null for anyone who is not a founder.
 */
export function founderDetail(profile: CardProfile, options: RenderOptions): string | null {
  const v = makeView(profile, options.strings);
  if (!v.p.founder) return null;
  const { P, ar } = v;
  const beat = options.beat === "founder" ? "founder" : "";
  const key = hangKey(v.p.tier);
  const c = FW / GAUGE[key].cols;
  const u = uid();
  const ids = { cast: `${u}-pc`, base: `${u}-pb`, curl: `${u}-cu`, grain: `${u}-gr` };
  const MARGIN = 6;
  const above = 10;
  const w = FW + 2 * MARGIN;
  const h = above + CAST.rows * CAST.c + 6;
  const defs =
    stitchPattern(ids.base, c, { gap: GAUGE[key].gap, leg: GAUGE[key].leg }) +
    stitchPattern(ids.cast, CAST.c, { gap: 0.18, leg: 0.3, gapC: "#5A4E36" }) +
    `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".06" stop-color="#000" stop-opacity=".06"/>` +
    `<stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>` +
    `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(v.p.serial || "0") % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;
  const yCast = above;
  const foot = yCast + CAST.rows * CAST.c;
  const rim = rimOf(options.theme, P);
  const body =
    `<defs>${defs}</defs>` +
    `<g transform="translate(${MARGIN - X0} 0)">` +
    `<rect x="${X0}" y="0" width="${FW}" height="${above + 0.6}" fill="${P.G}"/>` +
    `<rect x="${X0}" y="0" width="${FW}" height="${above + 0.6}" fill="url(#${ids.base})" pointer-events="none"/>` +
    castOn({ founder: v.p.founder, P, ids, ar, y: yCast, beat }) +
    `<g pointer-events="none"><rect x="${X0}" y="0" width="${FW}" height="${f2(foot)}" fill="url(#${ids.curl})"/>` +
    `<rect x="${X0}" y="0" width="${FW}" height="${f2(foot)}" filter="url(#${ids.grain})" opacity=".5"/></g>` +
    (rim
      ? `<path d="M${X0} 0V${f2(foot)}H${X1}V0" fill="none" stroke="${rim}" stroke-width="1"/>`
      : "") +
    `</g>`;
  return (
    `<div class="${rootClass(v, options.theme, beat, "mc-echarpe--detail")}" dir="${ar ? "rtl" : "ltr"}" role="img"` +
    ` aria-label="${esc(options.strings.founderLine)}" data-mc-tier="${v.p.tier ?? "none"}"${beat ? ` data-mc-beat="${beat}"` : ""}>` +
    svgRoot(body, w, h) +
    `</div>`
  );
}
