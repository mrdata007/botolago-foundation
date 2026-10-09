import { describe, expect, it } from "bun:test";

import {
  CAST_Z,
  FOLLOW,
  RIM_PLANE,
  castDelta,
  depth,
  follow,
  glintA,
  glintB,
  num,
  parallax,
  restLight,
  rim,
  rimRest,
  shift,
  shadow,
  tilt,
} from "./pose";

const xy = (s: string): [number, number] => {
  const m = [...s.matchAll(/-?\d*\.?\d+/g)].map((x) => Number(x[0]));
  return [m[0]!, m[1]!];
};

describe("the pose: numbers and transform strings the tilt writes (plan 8.2, 8.3)", () => {
  it("writes numbers with three decimals at most, no trailing zeros and never -0", () => {
    expect(num(1)).toBe("1");
    expect(num(0.1234567)).toBe("0.123");
    expect(num(-0.0004)).toBe("0");
    expect(num(-0)).toBe("0");
    expect(num(2.5)).toBe("2.5");
    expect(shift([-0.0001, 0.0001])).toBe("translate(0cqw, 0cqw)");
  });

  it("turns and lifts as the stylesheet's first version did, at every light", () => {
    for (const [ax, ay, t] of [
      [0.3, -0.8, 1],
      [-1, 1, 0.5],
      [0.24, 0.64, 0],
    ] as const) {
      expect(tilt([ax, ay], t)).toBe(
        `rotateX(${num(ay * 7 * t)}deg) rotateY(${num(ax * 9 * t)}deg)`,
      );
    }
    expect(depth(5, 1)).toBe("translateZ(5cqw) scale(0.983333)");
    expect(depth(5, 0.5)).toBe("translateZ(2.5cqw) scale(0.991667)");
  });

  it("slides the shadow opposite the light: 5 across, 3 down from 3", () => {
    expect(shadow([1, 1])).toBe("translate(-5cqw, 6cqw)");
    expect(shadow([-1, -1])).toBe("translate(5cqw, 0cqw)");
    expect(shadow(restLight(true))).toBe("translate(1.2cqw, 4.92cqw)");
  });

  it("gives a part the parallax of its height over the plane it is drawn in: the card's own turn", () => {
    // pointing right and up: a part in front of the plane moves right and up on the screen
    const [x, y] = parallax(3, [1, 1]);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeLessThan(0);
    // none when the card is not turned, and none for no height
    expect(parallax(3, [0, 0])).toEqual([0, -0]);
    expect(parallax(0, [1, 1])).toEqual([0, -0]);
    // opposite heights, opposite offsets
    const behind = parallax(-3, [0.4, -0.7]);
    const front = parallax(3, [0.4, -0.7]);
    expect(behind[0]).toBeCloseTo(-front[0], 9);
    expect(behind[1]).toBeCloseTo(-front[1], 9);
  });

  it("walks the rims from a 2D step at rest to the parallax of each wall's height in depth", () => {
    // wall k at rest steps down and away from the light by 0.12 cqw for every step of 8 - k
    for (let k = 1; k <= 7; k++) {
      const [x, y] = xy(rimRest(k, false));
      expect(x).toBeCloseTo((8 - k) * 0.12, 9);
      expect(y).toBeCloseTo((8 - k) * 0.12, 9);
      expect(xy(rimRest(k, true))[0]).toBeCloseTo(-x, 9);
    }
    // in depth the walls fan out about the group's plane: the one at the plane stays, those behind
    // and in front go opposite ways
    const at = xy(rim(RIM_PLANE, [1, 0.5]));
    expect(at).toEqual([0, 0]);
    expect(xy(rim(RIM_PLANE - 1, [1, 0]))[0]).toBeLessThan(0);
    expect(xy(rim(RIM_PLANE + 1, [1, 0]))[0]).toBeGreaterThan(0);
  });

  it("follows the light inside a layer as the stylesheet's rules do, mirrored where the group is", () => {
    const L = [0.5, -0.5] as const;
    expect(follow("foil", L, false)).toBe("translate(25px, 15px)");
    expect(follow("foil", L, true)).toBe("translate(-25px, 15px)");
    expect(follow("spec", L, false)).toBe("translate(80px, 50px)");
    expect(follow("light", L, true)).toBe("translate(-130px, 110px)");
    // the cast shadow runs opposite the light
    expect(follow("cast", L, false)).toBe("translate(-7px, -5px)");
    expect(follow("cast", L, true)).toBe("translate(7px, -5px)");
    // the number's shade and highlight are not in a mirrored group's frame: no flip in Arabic
    for (const part of ["hi", "sh"] as const)
      expect(follow(part, L, true)).toBe(follow(part, L, false));
    expect(follow("hi", L, false)).toBe("translate(2px, 0px)");
    expect(follow("sh", L, false)).toBe("translate(-3px, 2px)");
  });

  it("brightens the first glint as the light moves right and the second as it moves left", () => {
    expect(glintA([1, 0])).toBeCloseTo(1, 9);
    expect(glintA([-1, 0])).toBeCloseTo(0.2, 9);
    expect(glintB([1, 0])).toBeCloseTo(0.2, 9);
    expect(glintB([-1, 0])).toBeCloseTo(1, 9);
    expect(glintA([0.3, 0]) + glintB([0.3, 0])).toBeCloseTo(1.2, 9);
  });

  it("moves the cast shadow's layer by the light's travel and the parallax of its height", () => {
    const rest = restLight(false);
    // at the rest light the travel is nothing: only the parallax of the shadow's height is left
    const [px, py] = parallax(CAST_Z - RIM_PLANE, rest);
    const [dx0, dy0] = xy(castDelta(rest, rest));
    expect(dx0).toBeCloseTo(px, 3);
    expect(dy0).toBeCloseTo(py, 3);
    // the light moving right by 1 moves the shadow left by FOLLOW.cast.x / 10 cqw, on top of that
    const light = [rest[0] + 1, rest[1]] as const;
    const [dx1] = xy(castDelta(light, rest));
    const [qx] = parallax(CAST_Z - RIM_PLANE, light);
    expect(dx1 - qx).toBeCloseTo(FOLLOW.cast.x / 10, 2);
    // the same in Arabic: the light's travel is in screen space
    const ar = restLight(true);
    const [ax1] = xy(castDelta([ar[0] + 1, ar[1]], ar));
    const [qa] = parallax(CAST_Z - RIM_PLANE, [ar[0] + 1, ar[1]]);
    expect(ax1 - qa).toBeCloseTo(FOLLOW.cast.x / 10, 2);
  });
});
