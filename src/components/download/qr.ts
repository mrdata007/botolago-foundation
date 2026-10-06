import { encode } from "uqr";

/**
 * The download page's QR code as drawing instructions: the data modules as
 * one SVG path, the three corner finder patterns drawn apart (they carry the
 * rounded brand shape), and the clear window in the middle where the GO mark
 * sits.
 *
 * Error correction is H, which recovers 30% of the modules; the window
 * removes well under that (`windowShare` is pinned under 10% by the tests).
 * Data modules stay full squares, the shape every phone camera reads best,
 * so the brand lives in the corners and the mark rather than in the dots.
 */
export interface QrDrawing {
  /** Modules per side, without the quiet zone. */
  readonly size: number;
  /** The white margin around the code, in modules (the standard's 4). */
  readonly quiet: number;
  /** One path: every dark data module, merged into horizontal runs. */
  readonly path: string;
  /** Top-left module of each 7×7 finder pattern. */
  readonly finders: ReadonlyArray<readonly [number, number]>;
  /** The cleared window for the mark, in modules. */
  readonly window: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  /** Share of all modules the window clears. */
  readonly windowShare: number;
}

const QUIET = 4;
const FINDER = 7;

export function drawQr(text: string): QrDrawing {
  const { data, size } = encode(text, { ecc: "H", border: 0 });

  // A window as wide as the mark (it is 422×270, about 3:2), centred, with
  // odd sides so it sits on the middle module.
  const w = oddAtLeast(Math.round(size * 0.3));
  const h = oddAtLeast(Math.round(w * 0.66));
  const window = { x: (size - w) / 2, y: (size - h) / 2, w, h };
  const inWindow = (x: number, y: number) =>
    x >= window.x && x < window.x + w && y >= window.y && y < window.y + h;

  const finders: Array<[number, number]> = [
    [0, 0],
    [size - FINDER, 0],
    [0, size - FINDER],
  ];
  const inFinder = (x: number, y: number) =>
    finders.some(([fx, fy]) => x >= fx && x < fx + FINDER && y >= fy && y < fy + FINDER);

  let path = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      const dark = (cx: number) => data[y][cx] && !inFinder(cx, y) && !inWindow(cx, y);
      if (!dark(x)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && dark(x + run)) run++;
      path += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`;
      x += run;
    }
  }

  return {
    size,
    quiet: QUIET,
    path,
    finders,
    window,
    windowShare: (w * h) / (size * size),
  };
}

function oddAtLeast(n: number): number {
  const m = Math.max(n, 5);
  return m % 2 === 1 ? m : m + 1;
}
