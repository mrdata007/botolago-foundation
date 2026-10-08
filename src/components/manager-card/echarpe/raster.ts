/**
 * Arabic names with no hand chart are sampled from Changa 800: the text is drawn on a canvas at a
 * given number of rows and read back one stitch at a time. Browser only: on the server and in tests
 * there is no canvas, so `rasterText` answers null and the scarf knits the charted names only.
 *
 * The sampled face must be the real one. `ready()` asks the page to load Changa 800 (both subsets)
 * and waits for it, within a second and a half; a result is cached only when the font reports ready,
 * so a sample taken against a fallback face is never kept.
 */
import type { RasterText } from "./names";

const SPEC = '800 100px "Changa"';
/** Latin capitals, digits and the Arabic letters: both subsets of the face. */
const SAMPLE = "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ ابتثجحخدذرزسشصضطظعغفقكلمنهوي ءأإآؤئةى";

const cache = new Map<string, { bmp: string[]; base: number }>();

/** True where a canvas can be made (a browser). */
const hasCanvas = (): boolean =>
  typeof document !== "undefined" && typeof document.createElement === "function";

/** Samples `text` at `rows` stitches tall. Returns the bitmap and the baseline's last row. */
export const rasterText: RasterText = (text, rows, thr = 0.45) => {
  if (!hasCanvas()) return null;
  const key = `${text}|${rows}|${thr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = document.createElement("canvas").getContext("2d");
  if (!m) return null;
  m.font = SPEC;
  const mt = m.measureText(text);
  const asc = mt.actualBoundingBoxAscent;
  const hh = asc + mt.actualBoundingBoxDescent;
  const ww = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
  if (!(hh > 0) || !(ww > 0)) return null;
  const cols = Math.max(1, Math.round((ww * rows) / hh));
  const S = 10;
  const cv = document.createElement("canvas");
  cv.width = cols * S;
  cv.height = rows * S;
  const x = cv.getContext("2d");
  if (!x) return null;
  x.scale(cv.width / ww, cv.height / hh);
  x.font = SPEC;
  x.fillText(text, mt.actualBoundingBoxLeft, asc);
  const d = x.getImageData(0, 0, cv.width, cv.height).data;
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      let a = 0;
      for (let yy = 0; yy < S; yy++)
        for (let xx = 0; xx < S; xx++) a += d[((r * S + yy) * cv.width + c * S + xx) * 4 + 3];
      line += a / (S * S * 255) > thr ? "#" : ".";
    }
    out.push(line);
  }
  const res = {
    bmp: out,
    base: Math.max(0, Math.min(rows - 1, Math.round((asc / hh) * rows) - 1)),
  };
  let ok = true;
  try {
    ok = !document.fonts || document.fonts.check(SPEC, text);
  } catch {
    ok = true;
  }
  if (ok) cache.set(key, res);
  return res;
};

let loading: Promise<void> | null = null;

/** Loads the face the sampler reads, within `timeoutMs`; never rejects. */
export function ready(timeoutMs = 1500): Promise<void> {
  if (loading) return loading;
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  const load = document.fonts
    .load(SPEC, SAMPLE)
    .then(() => undefined)
    .catch(() => undefined);
  const wait = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  loading = Promise.race([load, wait]);
  return loading;
}
