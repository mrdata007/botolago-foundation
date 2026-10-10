/**
 * The frame's materials (plan 3.2, 3.3 and 5.6, revision 3): premium through material, not
 * ornament. The plate in its lacquer with a faded honeycomb emboss; the shield band and the outer
 * edge in the tier's seven-stop metal with a bevel, a lit lip, a shadow lip and a specular streak
 * that travels along the metal; LASTREET's brushing, STADE's gold band; the raised tab with the club
 * disc (or a neutral hexagon with no club); the tier plaque; the founder capsule along the cut
 * corner; grain. Everything is vector, nothing is a raster texture, nothing is `feTurbulence`.
 *
 * Shapes only; the caller mirrors the layer in Arabic. The text that goes with them is `plate.ts`.
 */
import type { Ctx } from "./ctx";
import type { Foil } from "./foil";
import { mix, stops } from "./foil";
import { MASK_BOX, moving } from "./field";
import {
  EDGE_W,
  OUTLINE,
  POINT_Y,
  RING,
  SHIRT,
  TAB,
  WINDOW,
  DISC,
  hexPath,
  JT,
  n2,
} from "./geometry";
import type { Plaque } from "./plaque";

export { POINT_Y, SHIRT, JT };

/** Clip paths, the frame's gradients and masks, the shared filters, grain and brushing. */
export function frameDefs(F: Foil, id: string): string {
  const { metal } = F;
  return `
    <clipPath id="${id}-win"><path d="${WINDOW}"/></clipPath>
    <clipPath id="${id}-out"><path d="${OUTLINE}"/></clipPath>
    <clipPath id="${id}-tab"><path d="${TAB}"/></clipPath>
    <pattern id="${id}-brush" width="240" height="5" patternUnits="userSpaceOnUse"><rect y=".4" width="240" height=".7" fill="#fff" fill-opacity=".1"/><rect x="40" y="2.4" width="200" height=".6" fill="#fff" fill-opacity=".06"/><rect y="3.8" width="170" height=".7" fill="#000" fill-opacity=".14"/></pattern>
    <pattern id="${id}-grain" width="17" height="17" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".9" fill="#fff" fill-opacity=".06"/><circle cx="11" cy="2" r=".7" fill="#000" fill-opacity=".16"/><circle cx="7" cy="12" r=".8" fill="#fff" fill-opacity=".05"/><circle cx="14" cy="10" r=".9" fill="#000" fill-opacity=".12"/></pattern>
    <linearGradient id="${id}-metal" x1="0" y1="0" x2="1000" y2="1618" gradientUnits="userSpaceOnUse">${stops(metal)}</linearGradient>
    <linearGradient id="${id}-bevel" x1="0" y1="0" x2="1000" y2="1618" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>
    <linearGradient id="${id}-spec" x1="0" y1="0" x2="1000" y2="1618" gradientUnits="userSpaceOnUse"><stop offset=".44" stop-color="#000" stop-opacity="0"/><stop offset=".47" stop-color="#000" stop-opacity=".22"/><stop offset=".5" stop-color="${F.spec}" stop-opacity=".85"/><stop offset=".53" stop-color="#000" stop-opacity=".22"/><stop offset=".56" stop-color="#000" stop-opacity="0"/></linearGradient>
    <mask id="${id}-lipWL" ${MASK_BOX}><path d="${WINDOW}" fill="none" stroke="#fff" stroke-width="22"/><path d="${WINDOW}" fill="none" stroke="#000" stroke-width="22" transform="translate(2.4 3.2)"/></mask>
    <mask id="${id}-lipWD" ${MASK_BOX}><path d="${WINDOW}" fill="none" stroke="#fff" stroke-width="22"/><path d="${WINDOW}" fill="none" stroke="#000" stroke-width="22" transform="translate(-2.4 -3.2)"/></mask>
    <mask id="${id}-lipOL" ${MASK_BOX}><path d="${OUTLINE}" fill="none" stroke="#fff" stroke-width="24"/><path d="${OUTLINE}" fill="none" stroke="#000" stroke-width="24" transform="translate(2 2.6)"/></mask>
    <mask id="${id}-lipOD" ${MASK_BOX}><path d="${OUTLINE}" fill="none" stroke="#fff" stroke-width="24"/><path d="${OUTLINE}" fill="none" stroke="#000" stroke-width="24" transform="translate(-2 -2.6)"/></mask>
    <mask id="${id}-metalm" ${MASK_BOX}><path d="${WINDOW}" fill="none" stroke="#fff" stroke-width="22"/><g clip-path="url(#${id}-out)"><path d="${OUTLINE}" fill="none" stroke="#fff" stroke-width="24"/></g></mask>
    <linearGradient id="${id}-plfadeG" x1="0" y1="960" x2="0" y2="1380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".24" stop-color="#fff"/><stop offset=".67" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="${id}-plfade" ${MASK_BOX}><rect width="1000" height="1618" fill="url(#${id}-plfadeG)"/></mask>
    ${F.goldBand ? `<linearGradient id="${id}-goldband" x1="0" y1="1060" x2="0" y2="1260" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.glow}" stop-opacity="0"/><stop offset=".45" stop-color="${F.glow}" stop-opacity=".12"/><stop offset="1" stop-color="${F.glow}" stop-opacity="0"/></linearGradient>` : ""}
    <linearGradient id="${id}-plateG" x1="0" y1="1040" x2="0" y2="1618" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.deep}" stop-opacity=".5"/><stop offset=".45" stop-color="${F.deep}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-capsule" x1="830" y1="1524" x2="914" y2="1440" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.deep}"/><stop offset="1" stop-color="${F.glow}"/></linearGradient>
    <filter id="${id}-b4" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="${id}-b5" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="${id}-b8" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="${id}-b14" x="-40%" y="-10%" width="180%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="${id}-b18" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="18"/></filter>`;
}

/** The tab's disc: the club's colours, or a neutral embossed hexagon (never a logo, never text). */
function tabDisc(c: Ctx): string {
  const { F, p } = c.v;
  const { id } = c;
  const { cx, cy } = DISC;
  const shadow = `<circle cx="${cx}" cy="${cy}" r="56" fill="#000" fill-opacity=".4" transform="translate(0 4)" filter="url(#${id}-b5)"/>`;
  if (p.club) {
    return (
      shadow +
      `<circle cx="${cx}" cy="${cy}" r="54" fill="${p.club.primary}"/><circle cx="${cx}" cy="${cy}" r="54" fill="url(#${id}-rib)" opacity=".5"/><circle cx="${cx}" cy="${cy}" r="51" fill="none" stroke="${p.club.secondary || "#ffffff"}" stroke-opacity="${p.club.secondary ? 1 : 0.5}" stroke-width="6"/>`
    );
  }
  return (
    shadow +
    `<circle cx="${cx}" cy="${cy}" r="54" fill="${F.edgeL}"/><circle cx="${cx}" cy="${cy}" r="54" fill="url(#${id}-rib)" opacity=".5"/><circle cx="${cx}" cy="${cy}" r="51" fill="none" stroke="${F.edgeD}" stroke-opacity=".55" stroke-width="6"/><path d="${hexPath(cx, cy, 22)}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="3" transform="translate(1 1.5)"/><path d="${hexPath(cx, cy, 22)}" fill="none" stroke="${F.light}" stroke-opacity=".5" stroke-width="2"/>`
  );
}

/** The plaque under the shield's point: a dark hexagon in the tier's metal, or LEGEND's moving foil. */
function plaqueShapes(c: Ctx, plaque: Plaque): string {
  if (!plaque.w) return "";
  const { F } = c.v;
  const { id } = c;
  const P = plaque.path;
  const foilFill =
    F.plaqueFoil && plaque.word
      ? `<g clip-path="url(#${id}-plq)"><rect ${moving("foil", c.flat)} x="${n2(plaque.x0 - 60)}" y="1030" width="${n2(plaque.w + 120)}" height="152" fill="url(#${id}-foil)"/></g>`
      : `<path d="${P}" fill="${mix(F.plate, "#000000", 0.35)}"/>`;
  return (
    `<path d="${P}" fill="#000" fill-opacity=".5" transform="translate(0 5)" filter="url(#${id}-b5)"/>` +
    foilFill +
    `<path d="${P}" fill="none" stroke="url(#${id}-metal)" stroke-width="4"/><path d="M${n2(plaque.x0 + 26)} 1075H${n2(plaque.x1 - 26)}" stroke="#fff" stroke-opacity="${F.plaqueFoil ? 0.4 : 0.12}" stroke-width="1.2"/>`
  );
}

/** The founder's capsule along the cut corner (a founder only). */
function capsuleShapes(c: Ctx): string {
  if (!c.v.p.founder) return "";
  const { id } = c;
  return `<g class="mc-capsule" transform="rotate(-45 872 1482)"><rect x="808" y="1458" width="128" height="48" rx="24" fill="#000" fill-opacity=".45" transform="translate(0 3)"/><rect x="808" y="1458" width="128" height="48" rx="24" fill="url(#${id}-capsule)" stroke="url(#${id}-metal)" stroke-width="3" pathLength="1000"/></g>`;
}

/**
 * The frame layer's shapes, bottom to top (plan 3.2): the plate, its gradient, grain, brushing,
 * faded emboss and gold band; the shield band (inner shadow, metal, bevel, lips); the outer edge;
 * the travelling specular streak; the tab with its disc; the plaque; the capsule; the theme edge
 * (`EDGE_W`, the line that separates the card from the page, which the holo layer keeps clear).
 */
export function frameShapes(c: Ctx, plaque: Plaque): string {
  const { F } = c.v;
  const { id, compact, theme } = c;
  const edge = theme === "dark" ? F.edgeD : F.edgeL;
  const brushed = F.brushed;
  const ring = (fill: string): string => `<path d="${RING}" fill-rule="evenodd" fill="${fill}"/>`;
  return `
    ${ring(F.plate)}
    ${ring(`url(#${id}-plateG)`)}
    ${compact ? "" : ring(`url(#${id}-grain)`)}
    ${brushed ? ring(`url(#${id}-brush)`) : ""}
    <g mask="url(#${id}-plfade)" opacity=".22">${ring(`url(#${id}-hexD)`)}${ring(`url(#${id}-hexL)`)}</g>
    ${F.goldBand ? ring(`url(#${id}-goldband)`) : ""}
    <g clip-path="url(#${id}-win)"><path d="${WINDOW}" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="44" filter="url(#${id}-b8)"/></g>
    <path d="${WINDOW}" fill="none" stroke="url(#${id}-metal)" stroke-width="22"/>
    ${brushed ? `<path d="${WINDOW}" fill="none" stroke="url(#${id}-brush)" stroke-width="22"/>` : ""}
    <path d="${WINDOW}" fill="none" stroke="url(#${id}-bevel)" stroke-width="22"/>
    <path d="${WINDOW}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="22" mask="url(#${id}-lipWL)"/>
    <path d="${WINDOW}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="22" mask="url(#${id}-lipWD)"/>
    <g clip-path="url(#${id}-out)">
      <path d="${OUTLINE}" fill="none" stroke="url(#${id}-metal)" stroke-width="24"/>
      ${brushed ? `<path d="${OUTLINE}" fill="none" stroke="url(#${id}-brush)" stroke-width="24"/>` : ""}
      <path d="${OUTLINE}" fill="none" stroke="url(#${id}-bevel)" stroke-width="24"/>
      <path d="${OUTLINE}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="24" mask="url(#${id}-lipOL)"/>
      <path d="${OUTLINE}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="24" mask="url(#${id}-lipOD)"/>
    </g>
    <g mask="url(#${id}-metalm)"><rect ${moving("spec", c.flat)} width="1000" height="1618" fill="url(#${id}-spec)"/></g>
    <path d="${TAB}" fill="#000" fill-opacity=".45" transform="translate(0 6)" filter="url(#${id}-b5)"/>
    <path d="${TAB}" fill="${F.plate}"/>
    ${compact ? "" : `<path d="${TAB}" fill="url(#${id}-grain)"/>`}
    <g clip-path="url(#${id}-tab)"><path d="${TAB}" fill="none" stroke="url(#${id}-metal)" stroke-width="16"/><path d="${TAB}" fill="none" stroke="url(#${id}-bevel)" stroke-width="16"/></g>
    ${tabDisc(c)}
    ${plaqueShapes(c, plaque)}
    ${capsuleShapes(c)}
    <path d="${OUTLINE}" fill="none" stroke="${edge}" stroke-width="${EDGE_W}"/>
    ${c.beat === "castoff" ? `<path class="mc-seal" d="${WINDOW}" fill="none" stroke="${F.light}" stroke-width="2" pathLength="1000"/>` : ""}
    ${theme === "dark" ? `<path d="${OUTLINE}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.5" transform="translate(-1.5 -1.5) scale(1.003)"/>` : ""}`;
}

/** The plaque's clip (LEGEND's foil plaque), in the frame layer's own defs. */
export const plaqueClip = (c: Ctx, plaque: Plaque): string =>
  c.v.F.plaqueFoil && plaque.w && plaque.word
    ? `<defs><clipPath id="${c.id}-plq"><path d="${plaque.path}"/></clipPath></defs>`
    : "";
