import { describe, expect, test } from "bun:test";

import { ar } from "@/i18n/dictionary-ar";
import { ARABIC_CATEGORY_LABELS } from "./category-labels";
import { categoryLabel } from "./news-data";

describe("the article pill's Arabic category names", () => {
  test("are exactly the Arabic dictionary's", () => {
    for (const [key, value] of Object.entries(ARABIC_CATEGORY_LABELS)) {
      expect({ key, value }).toEqual({ key, value: ar[key as keyof typeof ar] });
    }
  });

  test("cover every key categoryLabel asks for", () => {
    const asked: string[] = [];
    for (const slug of ["for_you", "latest", "transfers", "analysis", "interviews", "other"]) {
      categoryLabel({ id: slug, slug, name: slug } as never, (key) => {
        asked.push(key);
        return key;
      });
    }
    expect(asked.every((key) => key in ARABIC_CATEGORY_LABELS)).toBe(true);
    expect(asked).toHaveLength(5);
  });
});
