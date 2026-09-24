import { describe, expect, test } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { ChipKey } from "@/lib/fantasy-engine";
import { chipDescription } from "./chip-copy";

const CHIPS: ChipKey[] = ["bench_boost", "free_hit", "triple_captain", "wildcard"];

describe("chipDescription", () => {
  for (const lang of ["fr", "ar"] as const) {
    test(`gives each chip its own line in ${lang}`, () => {
      const t = (key: TranslationKey) => dictionaries[lang][key];
      const lines = CHIPS.map((chip) => chipDescription(chip, t));
      for (const line of lines) expect(line?.trim()).toBeTruthy();
      expect(new Set(lines).size).toBe(CHIPS.length);
    });
  }
});
