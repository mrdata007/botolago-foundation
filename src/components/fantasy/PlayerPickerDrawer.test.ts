import { describe, expect, it } from "bun:test";

import { isPlayerIntrinsicallyBlocked } from "./PlayerPickerDrawer";

describe("isPlayerIntrinsicallyBlocked", () => {
  it("blocks backend-ineligible and unavailable players", () => {
    expect(isPlayerIntrinsicallyBlocked({ status: "ineligible" })).toBe(true);
    expect(isPlayerIntrinsicallyBlocked({ status: "unavailable" })).toBe(true);
  });

  it("leaves selectable and flagged statuses to the caller rules", () => {
    expect(isPlayerIntrinsicallyBlocked({ status: "available" })).toBe(false);
    expect(isPlayerIntrinsicallyBlocked({ status: "doubtful" })).toBe(false);
    expect(isPlayerIntrinsicallyBlocked({ status: "injured" })).toBe(false);
    expect(isPlayerIntrinsicallyBlocked({ status: "suspended" })).toBe(false);
  });
});
