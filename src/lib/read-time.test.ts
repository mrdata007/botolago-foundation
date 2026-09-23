import { describe, expect, test } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { readTimeLabel } from "./read-time";

const tFor = (lang: "fr" | "ar") => (key: TranslationKey) =>
  (dictionaries[lang] as Record<string, string>)[key] ?? key;

describe("readTimeLabel", () => {
  test("Arabic: the noun agrees with the number", () => {
    const t = tFor("ar");
    expect(readTimeLabel(1, "ar", t)).toBe("دقيقة للقراءة");
    expect(readTimeLabel(2, "ar", t)).toBe("دقيقتان للقراءة");
    expect(readTimeLabel(3, "ar", t)).toBe("3 دقائق للقراءة");
    expect(readTimeLabel(10, "ar", t)).toBe("10 دقائق للقراءة");
    expect(readTimeLabel(11, "ar", t)).toBe("11 دقيقة للقراءة");
  });

  test("French: one form", () => {
    const t = tFor("fr");
    expect(readTimeLabel(1, "fr", t)).toBe("1 min de lecture");
    expect(readTimeLabel(5, "fr", t)).toBe("5 min de lecture");
  });

  test("a missing or fractional duration still reads as whole minutes", () => {
    const t = tFor("fr");
    expect(readTimeLabel(0, "fr", t)).toBe("1 min de lecture");
    expect(readTimeLabel(4.6, "fr", t)).toBe("5 min de lecture");
  });
});
