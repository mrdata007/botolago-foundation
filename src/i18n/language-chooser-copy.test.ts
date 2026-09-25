import { describe, expect, test } from "bun:test";

import { ar } from "./dictionary-ar";
import { CHOOSER_ARABIC } from "./language-chooser-copy";

describe("the language chooser's Arabic lines", () => {
  test("are exactly the Arabic dictionary's", () => {
    for (const [key, value] of Object.entries(CHOOSER_ARABIC)) {
      expect({ key, value }).toEqual({ key, value: ar[key as keyof typeof ar] });
    }
  });
});
