import { describe, expect, it } from "bun:test";

import { clampContext, clampStep, DEFAULT_PLUS_STEP } from "./plus-steps";

describe("the offer's address", () => {
  it("opens the short paywall without a step, the story only when asked", () => {
    expect(DEFAULT_PLUS_STEP).toBe(3);
    expect(clampStep(undefined)).toBe(1);
    expect(clampStep(2)).toBe(2);
    expect(clampStep(4)).toBe(4);
  });
  it("reads a context, and nothing for an unknown one", () => {
    expect(clampContext("season")).toBe("season");
    expect(clampContext("duel")).toBe("duel");
    expect(clampContext("career")).toBe("career");
    expect(clampContext("editions")).toBe("editions");
    expect(clampContext("briefing")).toBe("briefing");
    expect(clampContext("profile")).toBeUndefined();
    expect(clampContext(3)).toBeUndefined();
    expect(clampContext(undefined)).toBeUndefined();
  });
});
