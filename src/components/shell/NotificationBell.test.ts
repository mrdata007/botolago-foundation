import { describe, expect, it } from "bun:test";

import { bellBadgeText } from "./NotificationBell";

describe("bellBadgeText", () => {
  it("shows the count up to nine, then 9+", () => {
    expect(bellBadgeText(1)).toBe("1");
    expect(bellBadgeText(9)).toBe("9");
    expect(bellBadgeText(10)).toBe("9+");
    expect(bellBadgeText(250)).toBe("9+");
  });
});
