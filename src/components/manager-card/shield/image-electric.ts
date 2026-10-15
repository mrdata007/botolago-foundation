/**
 * The share art's still of the Electric edition: one frame of what the live card shows, after
 * `editionFx("electric")` in `editions.ts` and the rules for `.mc-fx--spark`, `.mc-sl--zap` and
 * `.mc-zap` in `shield.css`. The live card moves (twinkling glints, a border that crackles through
 * three noise seeds, a glow that breathes); the picture freezes it where the card rests: the glints
 * at full strength, the first noise seed, the glow at full.
 *
 * Drawn as an SVG image, so inline attributes only: no class, no `<text>`, no `<image>`, no
 * external reference. Every id starts with the drawing's `id`. The filter regions are the art's own
 * view box (`image.ts`: -8 to 108 by -1 to 138.6), so a filter never reaches past the picture.
 */
import { SHIELD } from "./geometry";

/** The card's size in card units, as `shield.css` lays the layers over it. */
const W = 100;
const H = 136.6;

/** The art's view box, in card units; a filter region may not leave it. */
const REGION = 'filterUnits="userSpaceOnUse" x="-8" y="-1" width="116" height="139.6"';

/**
 * The glints, as `.mc-fx--spark` paints them: [x %, y %, colour, core radius, edge radius] in card
 * units (`cqw` is one card unit there), solid to the core, then fading to nothing at the edge.
 */
const GLINTS: readonly (readonly [number, number, string, number, number])[] = [
  [18, 44, "#ffffff", 0.4, 1.1],
  [74, 38, "#ffffff", 0.3, 1.0],
  [58, 52, "#e2fff0", 0.45, 1.2],
  [30, 62, "#dff6ff", 0.3, 1.0],
  [86, 58, "#ffffff", 0.4, 1.1],
];

/** The crackle's first noise (seed, base frequency, displacement), the copy the card shows at rest. */
const NOISE = { seed: 1, base: 0.03, scale: 3 } as const;

export function electricStill(id: string): { under: string; over: string } {
  const spark = (i: number): string => `${id}-ez-spark${i}`;
  const zap = `${id}-ez-zap`;
  const glow = `${id}-ez-glow`;

  const gradients = GLINTS.map(
    ([, , colour, core, edge], i) =>
      `<radialGradient id="${spark(i)}"><stop offset="0" stop-color="${colour}"/>` +
      `<stop offset="${(core / edge).toFixed(3)}" stop-color="${colour}"/>` +
      `<stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`,
  ).join("");
  const glints = GLINTS.map(
    ([x, y, , , edge], i) =>
      `<circle cx="${x}" cy="${((y / 100) * H).toFixed(2)}" r="${edge}" fill="url(#${spark(i)})"/>`,
  ).join("");
  const under = `<defs>${gradients}</defs><g aria-hidden="true">${glints}</g>`;

  // the border through the noise, as `zapFilter` in `editions.ts` makes it
  const noise =
    `<filter id="${zap}" ${REGION} color-interpolation-filters="sRGB">` +
    `<feTurbulence type="turbulence" baseFrequency="${NOISE.base}" numOctaves="6" seed="${NOISE.seed}" result="n1"/>` +
    `<feTurbulence type="turbulence" baseFrequency="${NOISE.base}" numOctaves="6" seed="${NOISE.seed + 11}" result="n2"/>` +
    `<feComposite in="n1" in2="n2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="c"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="c" scale="${NOISE.scale}" xChannelSelector="R" yChannelSelector="B"/>` +
    `</filter>`;
  // the card's `drop-shadow(0 0 0.9cqw rgb(95 227 161 / 0.7))` on the border
  const halo =
    `<filter id="${glow}" ${REGION} color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="0.9" result="b"/>` +
    // tint the blurred outline #5fe3a1 at 0.7 (red .373, green .890, blue .631), then lay the border on it
    `<feColorMatrix in="b" type="matrix" values="0 0 0 0 0.373 0 0 0 0 0.890 0 0 0 0 0.631 0 0 0 0.7 0" result="s"/>` +
    `<feComposite in="SourceGraphic" in2="s" operator="over"/>` +
    `</filter>`;
  const over =
    `<defs>${noise}${halo}</defs>` +
    `<g aria-hidden="true" filter="url(#${glow})"><g filter="url(#${zap})">` +
    `<path d="${SHIELD}" fill="none" stroke="#5fe3a1" stroke-width="0.7"/>` +
    `<path d="${SHIELD}" fill="none" stroke="#96f0be" stroke-opacity=".5" stroke-width="1.7" opacity=".6"/>` +
    `</g></g>`;
  return { under, over };
}
