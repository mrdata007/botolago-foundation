import { describe, expect, it } from "vitest";
import { selectFixtureGameweeks } from "./fixture-gameweeks";

describe("fixture gameweek selection", () => {
  it("derives sorted unique columns from backend data", () => {
    expect(selectFixtureGameweeks([18, 16, 17, 16, 19], 17, 3)).toEqual([17, 18, 19]);
  });

  it("uses the available tail when the current gameweek is beyond the dataset", () => {
    expect(selectFixtureGameweeks([30, 31, 32, 33], 40, 3)).toEqual([31, 32, 33]);
  });

  it("returns no fabricated columns when the backend has no fixture data", () => {
    expect(selectFixtureGameweeks([], 14, 6)).toEqual([]);
  });
});
