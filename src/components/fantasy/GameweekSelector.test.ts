import { describe, expect, it } from "bun:test";

import { getGameweekNavigation } from "./GameweekSelector";

describe("getGameweekNavigation", () => {
  it("moves only through authoritative gameweek options", () => {
    expect(getGameweekNavigation(3, 1, 30, [1, 3, 8])).toEqual({
      previous: 1,
      next: 8,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it("disables navigation at the authoritative boundaries", () => {
    expect(getGameweekNavigation(1, 1, 30, [1, 3])).toEqual({
      previous: 1,
      next: 3,
      hasPrevious: false,
      hasNext: true,
    });
    expect(getGameweekNavigation(3, 1, 30, [1, 3])).toEqual({
      previous: 1,
      next: 3,
      hasPrevious: true,
      hasNext: false,
    });
  });

  it("keeps the bounded sequential fallback for non-production callers", () => {
    expect(getGameweekNavigation(2, 1, 3)).toEqual({
      previous: 1,
      next: 3,
      hasPrevious: true,
      hasNext: true,
    });
  });
});
