import { describe, expect, test } from "bun:test";
import { parseCsv, positionBucket } from "./analyze-search-console";

describe("Search Console analysis", () => {
  test("parses French semicolon-delimited exports and quoted values", () => {
    expect(
      parseCsv('Requetes;Clics;Impressions;CTR;Position\n"fantasy, botola";12;450;2,67%;9,4\n'),
    ).toEqual([
      {
        requetes: "fantasy, botola",
        clics: "12",
        impressions: "450",
        ctr: "2,67%",
        position: "9,4",
      },
    ]);
  });

  test("does not treat missing positions as top-ranking pages", () => {
    expect(positionBucket(0)).toBeNull();
    expect(positionBucket(1)).toBe("1");
    expect(positionBucket(3)).toBe("2-3");
    expect(positionBucket(5)).toBe("4-5");
    expect(positionBucket(6)).toBeNull();
  });
});
