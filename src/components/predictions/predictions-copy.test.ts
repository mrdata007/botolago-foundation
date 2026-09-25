import { describe, expect, test } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";
import { remainingLabel, shareAfterTemplate } from "./predictions-copy";

const translate = (lang: Language) => (key: TranslationKey) => dictionaries[lang][key];

describe("shareAfterTemplate", () => {
  test("leaves the exact-score clause out when there is none", () => {
    expect(shareAfterTemplate(0, "fr", translate("fr"))).toBe(
      dictionaries.fr["predictions.share.after"],
    );
    expect(shareAfterTemplate(0, "ar", translate("ar"))).toBe(
      dictionaries.ar["predictions.share.after"],
    );
    expect(dictionaries.fr["predictions.share.after"]).not.toContain("exact");
  });

  test("French agrees the noun with the count", () => {
    expect(shareAfterTemplate(1, "fr", translate("fr"))).toContain("dont 1 score exact,");
    const two = shareAfterTemplate(2, "fr", translate("fr")).replace("{exact}", "2");
    expect(two).toContain("dont 2 scores exacts,");
  });

  test("Arabic uses the singular, dual and 3–10 forms", () => {
    expect(shareAfterTemplate(1, "ar", translate("ar"))).toContain("نتيجة دقيقة واحدة");
    expect(shareAfterTemplate(2, "ar", translate("ar"))).toContain("نتيجتان دقيقتان");
    expect(shareAfterTemplate(3, "ar", translate("ar"))).toContain("{exact} نتائج دقيقة");
    expect(shareAfterTemplate(11, "ar", translate("ar"))).toContain("{exact} نتيجة دقيقة");
  });

  test("every form carries the journée and the score", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const exact of [0, 1, 2, 3, 11]) {
        const template = shareAfterTemplate(exact, lang, translate(lang));
        expect(template).toContain("{n}");
        expect(template).toContain("{score}");
      }
    }
  });
});

describe("remainingLabel", () => {
  test("picks the Arabic form by count and keeps Western digits", () => {
    expect(remainingLabel(1, "ar", translate("ar"))).toBe("مباراة واحدة تنتظر توقعك");
    expect(remainingLabel(2, "ar", translate("ar"))).toBe("مباراتان تنتظران توقعك");
    expect(remainingLabel(5, "ar", translate("ar"))).toBe("5 مباريات تنتظر توقعك");
    expect(remainingLabel(5, "fr", translate("fr"))).toBe("5 matchs à pronostiquer");
  });
});
