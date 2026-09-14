import { describe, expect, it } from "bun:test";
import { isKickoffTimeUnconfirmed } from "./match-kickoff";

describe("unconfirmed provider kickoff presentation", () => {
  it("recognizes the audited UTC-midnight placeholder regardless of offset notation", () => {
    expect(isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "2026-09-24T00:00:00Z" })).toBe(
      true,
    );
    expect(
      isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "2026-09-24T01:00:00+01:00" }),
    ).toBe(true);
  });

  it("preserves explicit kickoff hours and completed match presentation", () => {
    expect(isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "2026-09-24T19:00:00Z" })).toBe(
      false,
    );
    expect(isKickoffTimeUnconfirmed({ status: "finished", kickoff: "2026-09-24T00:00:00Z" })).toBe(
      false,
    );
    expect(isKickoffTimeUnconfirmed({ status: "live", kickoff: "2026-09-24T00:00:00Z" })).toBe(
      false,
    );
    expect(isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "invalid" })).toBe(false);
  });
});
