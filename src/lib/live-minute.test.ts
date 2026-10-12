import { describe, expect, it } from "bun:test";
import { liveMinuteLabel } from "./live-minute";

describe("liveMinuteLabel", () => {
  it("writes the minute as is while a period is running", () => {
    expect(liveMinuteLabel({ minute: 1, period: "first_half" })).toBe("1");
    expect(liveMinuteLabel({ minute: 44, period: "first_half" })).toBe("44");
    expect(liveMinuteLabel({ minute: 46, period: "second_half" })).toBe("46");
    expect(liveMinuteLabel({ minute: 89, period: "second_half" })).toBe("89");
    expect(liveMinuteLabel({ minute: 105, period: "extra_time" })).toBe("105");
    expect(liveMinuteLabel({ minute: 119, period: "extra_time" })).toBe("119");
  });

  it("says 45+ / 90+ / 120+ once the clock stops at the end of the period", () => {
    expect(liveMinuteLabel({ minute: 45, period: "first_half" })).toBe("45+");
    expect(liveMinuteLabel({ minute: 90, period: "second_half" })).toBe("90+");
    expect(liveMinuteLabel({ minute: 120, period: "extra_time" })).toBe("120+");
  });

  it("reads a ticked minute past the end the same way, never 91 or 46", () => {
    expect(liveMinuteLabel({ minute: 46, period: "first_half" })).toBe("45+");
    expect(liveMinuteLabel({ minute: 91, period: "second_half" })).toBe("90+");
    expect(liveMinuteLabel({ minute: 121, period: "extra_time" })).toBe("120+");
  });

  it("does not take 45 in the second half, or 90 in extra time, for stoppage", () => {
    expect(liveMinuteLabel({ minute: 45, period: "second_half" })).toBe("45");
    expect(liveMinuteLabel({ minute: 90, period: "extra_time" })).toBe("90");
  });

  it("shows added minutes only when the provider gave them", () => {
    expect(liveMinuteLabel({ minute: 90, period: "second_half", addedTime: 3 })).toBe("90+3");
    expect(liveMinuteLabel({ minute: 45, period: "first_half", addedTime: 2 })).toBe("45+2");
    expect(liveMinuteLabel({ minute: 45, period: "first_half", addedTime: 0 })).toBe("45+");
    expect(liveMinuteLabel({ minute: 45, period: "first_half", addedTime: null })).toBe("45+");
    // Added time before the clock reaches the end of the period is not used.
    expect(liveMinuteLabel({ minute: 60, period: "second_half", addedTime: 3 })).toBe("60");
  });

  it("invents nothing without a minute", () => {
    expect(liveMinuteLabel({ minute: null, period: "second_half" })).toBeUndefined();
    expect(liveMinuteLabel({ minute: undefined, period: "first_half" })).toBeUndefined();
    expect(liveMinuteLabel({ minute: Number.NaN, period: "first_half" })).toBeUndefined();
    expect(liveMinuteLabel({ minute: -1, period: "first_half" })).toBeUndefined();
    expect(liveMinuteLabel({ period: "second_half", addedTime: 4 })).toBeUndefined();
  });

  it("has no running minute at half-time, in penalties or outside the match", () => {
    for (const period of ["half_time", "penalties", "pre_match", "post_match"] as const) {
      expect(liveMinuteLabel({ minute: 45, period })).toBeUndefined();
    }
  });

  it("falls back to the number when the period is not known", () => {
    expect(liveMinuteLabel({ minute: 63 })).toBe("63");
    expect(liveMinuteLabel({ minute: 63, period: null })).toBe("63");
  });
});
