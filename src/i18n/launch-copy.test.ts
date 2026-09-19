import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "./dictionaries";

/**
 * Fantasy went live in production (BG-0051). Before that, several strings
 * told users Fantasy would "open later" — that claim is now false and must
 * never resurface in copy or metadata. This is a copy-content regression
 * test, not an i18n-shape check (see i18n-gate.test.ts for that).
 */
const STALE_FR = /ouvrira ult[ée]rieurement/i;
const STALE_AR = /ستُ?فتح.*لاحق/i;
const STALE_EN = /(fantasy|it) (will open|opens) later/i;

describe("launch copy: Fantasy is live, not 'opening later'", () => {
  test("no French dictionary string claims Fantasy opens later", () => {
    for (const [key, value] of Object.entries(dictionaries.fr)) {
      expect(STALE_FR.test(value), `fr["${key}"] = ${JSON.stringify(value)}`).toBe(false);
    }
  });

  test("no Arabic dictionary string claims Fantasy opens later", () => {
    for (const [key, value] of Object.entries(dictionaries.ar)) {
      expect(STALE_AR.test(value), `ar["${key}"] = ${JSON.stringify(value)}`).toBe(false);
    }
  });

  test("root route SEO/OG metadata does not claim Fantasy opens later", () => {
    const source = readFileSync(join(import.meta.dir, "../routes/__root.tsx"), "utf8");
    expect(STALE_FR.test(source)).toBe(false);
    expect(STALE_EN.test(source)).toBe(false);
  });
});
