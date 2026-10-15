import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "@/i18n/dictionaries";

/**
 * Audit 2026-10-14, LOC-07: "Activée le …" on /profile/security took its date
 * from `toLocaleDateString()`, which answers in the BROWSER's language and
 * time zone (`10/14/2026` for an English browser, inside a French or Arabic
 * page). The formatter itself runs in `src/lib/format-time.test.ts`; the
 * screen needs a router and a session to render, so this pins, at source
 * level, that it asks that formatter with the chosen language.
 */
const source = readFileSync(join(import.meta.dir, "profile.security.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("MFA enrollment date", () => {
  it("never formats in the browser's own locale", () => {
    expect(source).not.toMatch(/toLocale(Date|Time)?String\(/);
    expect(source).not.toMatch(/new Intl\.DateTimeFormat\(\s*\)/);
  });

  it("uses the shared formatter with the chosen language", () => {
    expect(source).toContain("formatMoroccoDate(factors[0].createdAt, lang)");
    expect(source).toMatch(/const \{ t, lang \} = useI18n\(\)/);
  });

  it("keeps the labels the register asks for", () => {
    expect(dictionaries.fr["auth.mfa.enabled_since"]).toBe("Activée le");
    expect(dictionaries.ar["auth.mfa.enabled_since"]).toBe("تم التفعيل في");
  });
});
