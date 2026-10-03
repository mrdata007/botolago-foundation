import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import type { TranslationKey } from "@/i18n/dictionaries";

import { noMatchLabel, transfersLabel } from "./deadline-card-copy";

const fr = (key: TranslationKey) => dictionaries.fr[key];
const ar = (key: TranslationKey) => dictionaries.ar[key];
const n = (value: number) => String(value);

describe("deadline card copy", () => {
  test("French: one starter, several starters", () => {
    expect(noMatchLabel(1, 2, "fr", fr, n)).toBe("1 titulaire n'a pas de match en J2");
    expect(noMatchLabel(3, 2, "fr", fr, n)).toBe("3 titulaires n'ont pas de match en J2");
  });

  test("French: transfers say exactly 1, exactly 2, and the count otherwise", () => {
    expect(transfersLabel(0, "fr", fr, n)).toBe("Transferts · 0 gratuits");
    expect(transfersLabel(1, "fr", fr, n)).toBe("Transferts · 1 gratuit");
    expect(transfersLabel(2, "fr", fr, n)).toBe("Transferts · 2 gratuits");
  });

  test("Arabic has its own words for 1 and 2, and for 3 to 10", () => {
    expect(transfersLabel(1, "ar", ar, n)).toBe("التحويلات · تحويل واحد مجاني");
    expect(transfersLabel(2, "ar", ar, n)).toBe("التحويلات · تحويلان مجانيان");
    expect(transfersLabel(5, "ar", ar, n)).toBe("التحويلات · 5 تحويلات مجانية");
    expect(noMatchLabel(11, 2, "ar", ar, n)).toContain("11 لاعبًا");
  });
});
