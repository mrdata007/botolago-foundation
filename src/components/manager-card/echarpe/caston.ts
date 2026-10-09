/**
 * The cast-on: the five rows at the foot of the scarf. The founder's are cream, with 2026 knitted
 * between two cable twists; everyone else casts on plain, in the ground yarn. All five rows keep
 * one gauge at every tier. Digits are never mirrored.
 *
 * Each row, the cables and the bound loops along the edge are separate groups, so a beat can knit
 * them in turn ("make" and "founder") or knit the loops alone ("castoff").
 */
import { F35 } from "./charts";
import { knit } from "./beats";
import { CAST, FW, X0, X1 } from "./geometry";
import { bmpRects, bw, f2, word } from "./knit";
import { mix, BLUE, type Palette } from "./palette";
import type { BeatName } from "../types";

export interface CastOnIds {
  cast: string;
}

export interface CastOnInput {
  founder: number | null;
  P: Palette;
  ids: CastOnIds;
  ar: boolean;
  /** The y of the first row. */
  y: number;
  beat: BeatName | "";
}

export function castOn(o: CastOnInput): string {
  const { P, ids, ar, y, beat } = o;
  const cc = CAST.c;
  const cols = Math.round(FW / cc);
  const h = CAST.rows * cc;
  const founder = !!o.founder;
  const base = founder ? P.cast : P.G;
  const x0 = X0;
  const x1 = X1;
  const yr = founder ? word(String(o.founder), F35, 1) : null;
  const c0 = yr ? Math.round((cols - bw(yr)) / 2) : 0;
  // "make" knits the rows in at the pace of a first cast-on; "founder" knits them in eight bold steps
  const part = beat === "make" || beat === "founder" ? "cast" : "";
  const coarse = beat === "founder";
  const pat = (y0: number, hh: number) =>
    `<rect x="${f2(x0)}" y="${f2(y0)}" width="${FW}" height="${f2(hh)}" fill="url(#${ids.cast})"/>`;
  let s = "";
  for (let r = 0; r < CAST.rows; r++) {
    const last = r < CAST.rows - 1 ? 0.6 : 0;
    let row = `<rect x="${f2(x0)}" y="${f2(y + r * cc)}" width="${FW}" height="${cc + last}" fill="${base}"/>`;
    if (yr)
      row += `<g fill="${P.castInk}">${bmpRects([yr[r]], x0 + c0 * cc, y + r * cc, cc, cc)}</g>`;
    row += `<rect x="${f2(ar ? x0 : x1 - cc)}" y="${f2(y + r * cc)}" width="${cc}" height="${cc + last}" fill="${BLUE}"/>`;
    row += pat(y + r * cc, cc);
    // the foot is knitted first
    s += knit(beat, part, CAST.rows - 1 - r, `<g class="mc-co-row">${row}</g>`, undefined, coarse);
  }
  // the cable twists come in once the five rows are knitted
  let cables = "";
  if (founder && yr) {
    const ink = mix(P.cast, "#000000", 0.32);
    const cx = [(x0 + cc + x0 + c0 * cc) / 2, (x0 + (c0 + bw(yr)) * cc + x1 - cc) / 2].map(
      Math.round,
    );
    for (const x of cx) {
      const a = `M${x - 4} ${y}C${x - 4} ${y + 7} ${x + 4} ${y + 10} ${x + 4} ${y + 17.5}C${x + 4} ${y + 25} ${x - 4} ${y + 28} ${x - 4} ${y + 35}`;
      const b = `M${x + 4} ${y}C${x + 4} ${y + 7} ${x - 4} ${y + 10} ${x - 4} ${y + 17.5}C${x - 4} ${y + 25} ${x + 4} ${y + 28} ${x + 4} ${y + 35}`;
      cables += `<rect x="${x - 10}" y="${y}" width="20" height="${h}" fill="${ink}" opacity=".2"/>`;
      cables += `<path d="${b}" stroke="${ink}" stroke-width="7.4" fill="none"/><path d="${b}" stroke="${P.cast}" stroke-width="5.2" fill="none"/>`;
      cables += `<path d="${a}" stroke="${ink}" stroke-width="7.4" fill="none"/><path d="${a}" stroke="${P.cast}" stroke-width="5.2" fill="none"/>`;
      cables += `<path d="${a}" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7" transform="translate(-1 -.6)"/>`;
    }
  }
  s += knit(
    beat,
    part,
    beat === "founder" ? CAST.rows - 1 : CAST.rows,
    `<g class="mc-co-after">${cables}</g>`,
    undefined,
    coarse,
  );
  // the bind-off loops along the foot
  let d = "";
  for (let x = x0 + 3.5; x < x1; x += cc)
    d += `M${f2(x - 2.4)} ${f2(y + h - 0.6)}a2.4 1.9 0 0 0 4.8 0`;
  const loops = `<path d="${d}" stroke="${founder ? mix(P.cast, "#000000", 0.32) : P.Gdk}" stroke-width="1" fill="none"/>`;
  const loopsPart = beat === "castoff" ? "loops" : part;
  s += knit(beat, loopsPart, 0, `<g class="mc-loops">${loops}</g>`, undefined, beat === "founder");
  return `<g class="mc-cast${founder ? " mc-cast--founder" : ""}">${s}</g>`;
}
