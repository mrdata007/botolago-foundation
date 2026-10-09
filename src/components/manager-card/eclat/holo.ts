/**
 * The holographic layer (plan 5.5, revision 3: restrained), CHAMPION and LEGEND only: foil through a
 * mask of the outer edge, the shield band, the tab's rim and the plaque's rim (the tab itself is cut
 * out, so no foil crosses the club disc or the season), LEGEND's second hairline, and two or four
 * glints. The foil is the tier's own narrow palette and it moves with the light. The foil in the
 * honeycomb cells is `field.ts`'s; the foil plaque is `ornament.ts`'s; the sheen and the diffraction
 * are CSS (`eclat.css`). Nothing here touches the number or the plate's text.
 *
 * The foil slides under its fixed mask by up to 50 units across and 30 up or down (`.mc-foil-shift`),
 * so each foil rectangle is cut larger than what its mask shows: after the largest shift it still
 * covers the whole card (`holo.test.ts` checks every one against the shift the stylesheet applies).
 */
import type { Ctx } from "./ctx";
import { moving } from "./field";
import { OUTLINE, POINT_Y, TAB, WINDOW, WINDOW_IN, mirror, star } from "./geometry";
import type { Plaque } from "./plaque";

/** Where the four glints sit: the shield's trailing shoulder, its point, its leading shoulder, the corner. */
const GLINTS: readonly (readonly [number, number])[] = [
  [938, 830],
  [500, POINT_Y],
  [62, 830],
  [1000, 38],
];

/** The holo layer's content, or "" for a tier that has none. */
export function holoLayer(c: Ctx, plaque: Plaque): string {
  const { F, ar } = c.v;
  const H = F.holo;
  if (!H) return "";
  const { id } = c;
  const mask =
    `<mask id="${id}-hm" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1618">` +
    `<g clip-path="url(#${id}-out)"><path d="${OUTLINE}" fill="none" stroke="#fff" stroke-opacity="${H.edge}" stroke-width="22"/></g>` +
    `<path d="${WINDOW}" fill="none" stroke="#fff" stroke-opacity="${H.band}" stroke-width="20"/>` +
    (F.innerFoil
      ? `<path d="${WINDOW_IN}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="3"/>`
      : "") +
    `<path d="${TAB}" fill="#000"/>` +
    `<g clip-path="url(#${id}-tab)"><path d="${TAB}" fill="none" stroke="#fff" stroke-opacity="${H.edge}" stroke-width="16"/></g>` +
    (plaque.path ? `<path d="${plaque.path}" fill="none" stroke="#fff" stroke-width="4"/>` : "") +
    `</mask>`;
  // the glints' opacity follows the light: the first and third brighten as it moves toward them
  const glintOpacity = (i: number): string => {
    if (!c.flat) return "";
    const ax = ar ? -0.24 : 0.24;
    return ` opacity="${(i % 2 ? 0.2 + (1 - ax) * 0.4 : 0.2 + (ax + 1) * 0.4).toFixed(3)}"`;
  };
  const glints = GLINTS.slice(0, H.glints)
    .map(
      ([x, y], i) =>
        `<path class="${i % 2 ? "mc-glint-b" : "mc-glint-a"}" d="${star(x, y, i === 1 ? 20 : 16)}" fill="#fff"${glintOpacity(i)}/>`,
    )
    .join("");
  return mirror(
    `<defs>${mask}</defs><g mask="url(#${id}-hm)"><rect ${moving("foil", c.flat)} x="-62" y="-40" width="1124" height="1698" fill="url(#${id}-foil)"/></g>${glints}`,
    ar,
  );
}
