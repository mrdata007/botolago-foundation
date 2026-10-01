import { describe, expect, test } from "bun:test";

import { pointsUnit } from "./points-unit";

const t = (key: string) => key;

describe("pointsUnit", () => {
  test("one point is singular", () => {
    expect(pointsUnit(1, t)).toBe("fantasy.points.unit_one");
    expect(pointsUnit(-1, t)).toBe("fantasy.points.unit_one");
  });

  test("zero, many and unknown are plural", () => {
    for (const n of [0, 2, 12, null, undefined]) {
      expect(pointsUnit(n, t)).toBe("fantasy.points.unit_other");
    }
  });
});
