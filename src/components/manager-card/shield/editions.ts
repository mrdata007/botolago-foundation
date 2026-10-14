/**
 * The live layers of the paid editions (BotolaGO+): the markup the stylesheet moves. Pure strings,
 * every colour a literal of this file or `metal.ts`; nothing a manager supplies reaches it. The
 * layers are `aria-hidden` and carry no text. Motion is all CSS (`shield.css`, inside
 * `prefers-reduced-motion: no-preference`), so the media query reaches every layer: the crackle is
 * three still copies of the border, filtered with three noise seeds, shown in turn, not SMIL.
 *
 *   holo       prism foil in diagonal bands that drifts with the light, and glints   (under the text)
 *   electric   glints under the text; a border that crackles and glows               (over the lines)
 *   pixel      a field of pixels that twinkles                                        (under the text)
 *   chrome     nothing here: the gloss band sweeps across the frame (the frame's own CSS)
 */
import { SHIELD } from "./geometry";
import { uid } from "./ids";
import type { PaidEdition } from "./metal";

const layer = (cls: string): string => `<span class="mc-fx ${cls}"></span>`;
const under = (inner: string): string =>
  `<span class="mc-sl mc-sl--fx" aria-hidden="true">${inner}</span>`;

/** A small seeded generator, so a card's pixels are the same every time it is drawn. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const PIXEL_COLOURS = ["#e0f2fe", "#7dd3fc", "#86efac"] as const;
const COLS = 13;
const ROWS = 18;
const TILE_W = 50;
const TILE_H = 68.3;

/** The pixel field: one tile of squares in three groups, repeated, each group twinkling on its own. */
export function pixelField(): string {
  const id = uid("mc-px");
  const rnd = seeded(7);
  const cw = TILE_W / COLS;
  const ch = TILE_H / ROWS;
  const groups: string[][] = [[], [], []];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const colour = PIXEL_COLOURS[Math.floor(rnd() * 3)]!;
      const m = 0.4 + rnd() * 0.6;
      const size = Math.min(cw, ch) * 0.5 * m;
      const x = c * cw + (cw - size) / 2;
      const y = r * ch + (ch - size) / 2;
      const g = (c * 7 + r * 3) % 3;
      groups[g]!.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="${colour}"/>`,
      );
    }
  }
  const patterns = groups
    .map(
      (cells, g) =>
        `<pattern id="${id}-${g}" width="${TILE_W}" height="${TILE_H}" patternUnits="userSpaceOnUse">${cells.join("")}</pattern>`,
    )
    .join("");
  const rects = groups
    .map(
      (_cells, g) =>
        `<rect class="mc-px mc-px--${g}" width="100" height="136.6" fill="url(#${id}-${g})"/>`,
    )
    .join("");
  return `<svg class="mc-fx mc-fx--pixels" viewBox="0 0 100 136.6" preserveAspectRatio="none" focusable="false"><defs>${patterns}</defs>${rects}</svg>`;
}

/** One noise filter of the crackle, under `id`. */
function zapFilter(id: string, seed: number, base: number, scale: number): string {
  return (
    `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="turbulence" baseFrequency="${base}" numOctaves="6" seed="${seed}" result="n1"/>` +
    `<feTurbulence type="turbulence" baseFrequency="${base}" numOctaves="6" seed="${seed + 11}" result="n2"/>` +
    `<feComposite in="n1" in2="n2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="c"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="c" scale="${scale}" xChannelSelector="R" yChannelSelector="B"/>` +
    `</filter>`
  );
}

/** The crackling border: three copies of the outline, each through its own noise. */
export function crackle(): string {
  const id = uid("mc-zap");
  const variants: readonly [number, number, number][] = [
    [1, 0.03, 3],
    [2, 0.046, 4.4],
    [3, 0.022, 2.6],
  ];
  const defs = variants.map(([seed, base, scale]) => zapFilter(`${id}-${seed}`, seed, base, scale));
  const groups = variants
    .map(
      ([seed]) =>
        `<g class="mc-zap mc-zap--${seed}" filter="url(#${id}-${seed})">` +
        `<path d="${SHIELD}" fill="none" stroke="#5fe3a1" stroke-width="0.7"/>` +
        `<path d="${SHIELD}" fill="none" stroke="#96f0be" stroke-opacity=".5" stroke-width="1.7" opacity=".6"/>` +
        `</g>`,
    )
    .join("");
  return `<svg class="mc-sl mc-sl--zap" viewBox="0 0 100 136.6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>${defs.join("")}</defs>${groups}</svg>`;
}

/** The layers a paid edition adds under the text and over the frame's lines ("" for the free card). */
export function editionFx(edition: PaidEdition | null): { under: string; over: string } {
  switch (edition) {
    case "holo":
      return { under: under(layer("mc-fx--prism") + layer("mc-fx--spark")), over: "" };
    case "electric":
      return { under: under(layer("mc-fx--spark")), over: crackle() };
    case "pixel":
      return { under: under(pixelField()), over: "" };
    default:
      return { under: "", over: "" };
  }
}
