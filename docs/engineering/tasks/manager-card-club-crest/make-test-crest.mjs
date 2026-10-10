/**
 * Writes `test-crest.png`: an invented shield marked « TEST », the stand-in crest the screenshots
 * use. The mock football catalogue has no crest images, and no real club's mark is copied here.
 *
 *   node docs/engineering/tasks/manager-card-club-crest/make-test-crest.mjs
 */
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<path d="M128 14 L226 46 V120 C226 182 184 224 128 244 C72 224 30 182 30 120 V46 Z" fill="#0b5e2e" stroke="#063a1c" stroke-width="8"/>
<path d="M128 34 L208 60 V120 C208 170 174 206 128 224 C82 206 48 170 48 120 V60 Z" fill="none" stroke="#ffffff" stroke-width="6"/>
<rect x="48" y="100" width="160" height="36" fill="#ffffff"/>
<text x="128" y="128" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="30" text-anchor="middle" fill="#0b5e2e">TEST</text>
<circle cx="128" cy="178" r="22" fill="#ffffff"/><circle cx="128" cy="178" r="12" fill="#0b5e2e"/>
</svg>`;

await sharp(Buffer.from(svg))
  .png()
  .toFile(fileURLToPath(new URL("./test-crest.png", import.meta.url)));
