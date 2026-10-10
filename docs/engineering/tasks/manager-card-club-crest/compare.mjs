/**
 * Pixel comparison of the before/after stage screenshots: how many pixels differ, and the box they
 * lie in as fractions of the image (the tab's disc is at the top inline-start corner).
 *
 *   node docs/engineering/tasks/manager-card-club-crest/compare.mjs
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const dir = fileURLToPath(new URL("./screenshots/", import.meta.url));
const read = async (file) => {
  const { data, info } = await sharp(dir + file)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

const rows = [];
for (const width of [390, 1440])
  for (const theme of ["light", "dark"])
    for (const lang of ["fr", "ar"])
      for (const after of ["ok", "broken"]) {
        const a = `before-ok-rated-${width}-${lang}-${theme}.png`;
        const b = `after-${after}-rated-${width}-${lang}-${theme}.png`;
        if (!existsSync(dir + a) || !existsSync(dir + b)) continue;
        const [A, B] = await Promise.all([read(a), read(b)]);
        if (A.w !== B.w || A.h !== B.h) {
          rows.push({ pair: b, sizeDiffers: [A.w, A.h, B.w, B.h] });
          continue;
        }
        let n = 0;
        let [x0, y0, x1, y1] = [A.w, A.h, -1, -1];
        for (let y = 0; y < A.h; y++)
          for (let x = 0; x < A.w; x++) {
            const i = (y * A.w + x) * 3;
            const d =
              Math.abs(A.data[i] - B.data[i]) +
              Math.abs(A.data[i + 1] - B.data[i + 1]) +
              Math.abs(A.data[i + 2] - B.data[i + 2]);
            if (d > 6) {
              n++;
              x0 = Math.min(x0, x);
              y0 = Math.min(y0, y);
              x1 = Math.max(x1, x);
              y1 = Math.max(y1, y);
            }
          }
        const f = (v, t) => Math.round((v / t) * 1000) / 1000;
        rows.push({
          pair: b,
          differing: n,
          box: n ? [f(x0, A.w), f(y0, A.h), f(x1 + 1, A.w), f(y1 + 1, A.h)] : null,
        });
      }
console.log(JSON.stringify(rows, null, 1));
