import { describe, expect, test } from "bun:test";

import { ar } from "@/i18n/dictionary-ar";
import { fr } from "@/i18n/dictionary-fr";
import { playersShowingLabel } from "@/lib/players-count";

const label = (n: number, total: number, lang: "fr" | "ar") =>
  playersShowingLabel(
    n,
    total,
    lang,
    (key) => (lang === "ar" ? ar : fr)[key as keyof typeof fr],
    String,
  );

describe("playersShowingLabel", () => {
  test('French: "1 joueur sur 1", never "1 joueurs"', () => {
    expect(label(1, 1, "fr")).toBe("1 joueur sur 1");
    expect(label(0, 5, "fr")).toBe("0 joueurs sur 5");
  });

  test("French: two and more are plural", () => {
    expect(label(2, 621, "fr")).toBe("2 joueurs sur 621");
    expect(label(25, 621, "fr")).toBe("25 joueurs sur 621");
  });

  test("Arabic: one, two, 3-10 and 11+ each take their own form", () => {
    expect(label(1, 1, "ar")).toBe("لاعب واحد من أصل 1");
    expect(label(2, 9, "ar")).toBe("لاعبان من أصل 9");
    expect(label(5, 621, "ar")).toBe("5 لاعبين من أصل 621");
    expect(label(25, 621, "ar")).toBe("25 لاعباً من أصل 621");
  });
});
