import { describe, expect, it } from "bun:test";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The compact card is drawn for 136 to 200 px: every text it keeps is 58 units or more, which is 8
 * CSS px at 136 px (eclat/README.md). Narrower, the plate's text is a smear of 6 px, and the owner
 * asked for the micro-details to be hidden at small sizes, not shrunk. A card that small is a
 * `CardToken` (the rating, the tier's identity and the jersey). This reads the sources: no
 * `<ManagerCard compact … width={N}>` with a numeric N under 136.
 */
const ROOT = join(import.meta.dir, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("the compact card's floor", () => {
  it("is never given a literal width under 136 px", () => {
    const found: string[] = [];
    let seen = 0;
    for (const file of sources(ROOT)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<ManagerCard\b[^>]*?\/>/gs)) {
        const block = m[0];
        if (!/\bcompact\b/.test(block)) continue;
        seen++;
        const width = /\bwidth=\{(\d+)\}/.exec(block);
        if (width && Number(width[1]) < 136) found.push(`${file}: width={${width[1]}}`);
      }
    }
    expect(seen, "the face-à-face sheet passes compact").toBeGreaterThan(0);
    expect(found).toEqual([]);
  });
});
