import { describe, expect, it } from "bun:test";
import { classifyCurrentSeasonReadiness } from "./gate2e-current-season-readiness";

function evidence(rounds: unknown, teams: unknown, fixtureSample: unknown): unknown {
  return {
    verifiedResources: { rounds, teams },
    fixtureSample: { available: fixtureSample },
  };
}

describe("classifyCurrentSeasonReadiness", () => {
  it("returns ready only when every provider resource is published", () => {
    expect(classifyCurrentSeasonReadiness(evidence(1, 16, true))).toEqual({
      ready: true,
      rounds: 1,
      teams: 16,
      fixtureSample: true,
    });
  });

  it("keeps zero rounds, zero teams, and a missing fixture sample launch-blocking", () => {
    expect(classifyCurrentSeasonReadiness(evidence(0, 16, true)).ready).toBe(false);
    expect(classifyCurrentSeasonReadiness(evidence(1, 0, true)).ready).toBe(false);
    expect(classifyCurrentSeasonReadiness(evidence(1, 16, false)).ready).toBe(false);
  });

  it("rejects malformed, Boolean, negative, and fractional counts", () => {
    for (const rounds of [true, "1", -1, 1.5, null]) {
      expect(() => classifyCurrentSeasonReadiness(evidence(rounds, 16, true))).toThrow(
        "INVALID_ROUND_COUNT",
      );
    }
    for (const teams of [false, "16", -1, 1.5, null]) {
      expect(() => classifyCurrentSeasonReadiness(evidence(1, teams, true))).toThrow(
        "INVALID_TEAM_COUNT",
      );
    }
  });

  it("rejects non-Boolean fixture evidence and missing objects", () => {
    expect(() => classifyCurrentSeasonReadiness(evidence(1, 16, "true"))).toThrow(
      "INVALID_FIXTURE_AVAILABILITY",
    );
    expect(() => classifyCurrentSeasonReadiness({})).toThrow("INVALID_VERIFIED_RESOURCES");
    expect(() => classifyCurrentSeasonReadiness(null)).toThrow("INVALID_PROVIDER_EVIDENCE");
  });
});
