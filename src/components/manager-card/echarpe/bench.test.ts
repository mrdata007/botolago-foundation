import { describe, expect, it } from "bun:test";

import { echarpeRenderer as R } from "./index";
import { AR, FR, PROFILES } from "./test-data";

/**
 * The renderer budget of plan 6.6, as a guard: `full()` for a charted Latin PRO profile 25 ms,
 * `token()` 3 ms. The medians are measured at about 0.2 ms and 0.03 ms (README), so these hold with
 * two orders of magnitude to spare on a slow runner; a change that makes the drawing a hundred
 * times slower fails here. The sampled Arabic name (a canvas) is measured in the browser, see
 * README.md.
 */
const median = (fn: () => unknown, runs = 30) => {
  for (let i = 0; i < 5; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  return t.sort((x, y) => x - y)[Math.floor(runs / 2)];
};

describe("renderer budget (plan 6.6)", () => {
  it("full(): a charted Latin PRO profile, in either language, within 25 ms", () => {
    expect(median(() => R.full(PROFILES.rated, { strings: FR, theme: "light" }))).toBeLessThan(25);
    expect(median(() => R.full(PROFILES.founder, { strings: AR, theme: "dark" }))).toBeLessThan(25);
    expect(median(() => R.full(PROFILES.legend, { strings: FR, theme: "light" }))).toBeLessThan(25);
  });
  it("a charted Arabic name draws within the same 25 ms", () => {
    expect(
      median(() => R.full(PROFILES.arabicChartedFounder, { strings: AR, theme: "light" })),
    ).toBeLessThan(25);
  });
  it("token(): every size within 3 ms", () => {
    for (const size of [24, 44, 80] as const)
      expect(
        median(() => R.token(PROFILES.rated, { strings: FR, theme: "light", size }), 100),
      ).toBeLessThan(3);
  });
  it("the share art within 25 ms", () => {
    expect(median(() => R.image(PROFILES.rated, FR))).toBeLessThan(25);
  });
});
