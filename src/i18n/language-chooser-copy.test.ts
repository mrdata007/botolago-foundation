import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ar } from "./dictionary-ar";
import { CHOOSER_ARABIC } from "./language-chooser-copy";

describe("the language chooser's Arabic lines", () => {
  test("are exactly the Arabic dictionary's", () => {
    for (const [key, value] of Object.entries(CHOOSER_ARABIC)) {
      expect({ key, value }).toEqual({ key, value: ar[key as keyof typeof ar] });
    }
  });

  // Audit 2026-09-25, A10: the news that the Arabic dictionary did not arrive
  // cannot come from the Arabic dictionary.
  test("include everything the failed-download path says in Arabic", () => {
    for (const key of [
      "language.arabic_loading",
      "language.arabic_failed",
      "state.retry",
      "toast.close",
    ]) {
      expect(Object.keys(CHOOSER_ARABIC)).toContain(key);
    }
  });

  test("are what that path reads, and nothing on it pulls in the Arabic dictionary", () => {
    const root = join(import.meta.dir, "..", "..");
    const staticArabic =
      /^import\s+(?!type\b)[^;]*from\s+["'](?:\.\/|@\/i18n\/)(?:dictionary-ar|dictionaries)["']/m;
    for (const file of [
      "src/i18n/provider.tsx",
      "src/i18n/language-load-notice.tsx",
      "src/components/shell/FirstLaunchLanguage.tsx",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      expect({ file, imports: staticArabic.test(source) }).toEqual({ file, imports: false });
      if (file !== "src/i18n/provider.tsx") expect(source).toContain("CHOOSER_ARABIC");
    }
  });
});
