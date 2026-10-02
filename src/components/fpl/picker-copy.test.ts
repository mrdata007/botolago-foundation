import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import type { TranslationKey } from "@/i18n/dictionaries";

import { transferCostLabel } from "./picker-copy";

const fr = (key: TranslationKey) => dictionaries.fr[key];
const ar = (key: TranslationKey) => dictionaries.ar[key];
const n = (value: number) => String(value);

describe("transferCostLabel", () => {
  test("French", () => {
    expect(transferCostLabel(1, 4, "fr", fr, n)).toBe("1 transfert gratuit, ensuite −4 pts");
    expect(transferCostLabel(2, 4, "fr", fr, n)).toBe("2 transferts gratuits, ensuite −4 pts");
    expect(transferCostLabel(0, 4, "fr", fr, n)).toBe(
      "Aucun transfert gratuit : −4 pts par transfert",
    );
  });

  test("Arabic has its own words for 1, 2 and 3 to 10", () => {
    expect(transferCostLabel(1, 4, "ar", ar, n)).toContain("تحويل واحد");
    expect(transferCostLabel(2, 4, "ar", ar, n)).toContain("تحويلان");
    expect(transferCostLabel(5, 4, "ar", ar, n)).toContain("5 تحويلات");
  });
});
