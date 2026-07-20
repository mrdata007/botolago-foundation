import { describe, expect, test } from "bun:test";
import { FIXTURE_STATUSES } from "../contracts";
import { FootballError } from "../errors";
import { FIXTURE_ADAPTER_STATUS_MAP, mapProviderFixtureStatus } from "./status";

describe("provider fixture status normalization", () => {
  test("maps every fixture-provider status to the closed canonical model", () => {
    expect(Object.values(FIXTURE_ADAPTER_STATUS_MAP).sort()).toEqual([...FIXTURE_STATUSES].sort());
    for (const [raw, expected] of Object.entries(FIXTURE_ADAPTER_STATUS_MAP)) {
      expect(mapProviderFixtureStatus("fixture", raw, FIXTURE_ADAPTER_STATUS_MAP)).toBe(expected);
    }
  });

  test("rejects unknown provider statuses instead of coercing them", () => {
    expect(() =>
      mapProviderFixtureStatus("fixture", "MYSTERY", FIXTURE_ADAPTER_STATUS_MAP),
    ).toThrow(FootballError);
  });
});
