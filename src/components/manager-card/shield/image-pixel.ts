/**
 * The share art's still of the Pixel edition's field: one frame of what the live card shows. The
 * squares are the card's own (`pixelField` in `editions.ts`: same seed, same tile, same colours), so
 * they sit where they sit in the app; this file only takes that markup apart and puts it back as
 * plain inline attributes, because an SVG drawn as an image loads no stylesheet.
 *
 * The opacity is the stylesheet's resting state, which is also what a reader who asked for reduced
 * motion sees: the layer at 0.3 (`.mc-fx--pixels`) with its three groups all at full strength
 * (`.mc-px`, before the twinkle moves them). No `<text>`, no `<image>`, no reference outside the art.
 */
import { pixelField } from "./editions";

/** `.mc-fx--pixels { opacity: 0.3 }` */
const FIELD_OPACITY = 0.3;

export function pixelStill(): { under: string; over: string } {
  const live = pixelField();
  const defs = /<defs>.*?<\/defs>/s.exec(live)?.[0];
  if (!defs) return { under: "", over: "" };
  // the three full-card rects, each filled with its group's pattern; the classes are dropped
  const rects = [...live.matchAll(/<rect class="mc-px[^"]*" ([^>]*?)\/>/g)]
    .map((m) => `<rect ${m[1]}/>`)
    .join("");
  if (!rects) return { under: "", over: "" };
  return { under: `${defs}<g opacity="${FIELD_OPACITY}">${rects}</g>`, over: "" };
}
