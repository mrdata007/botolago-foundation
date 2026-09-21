import { describe, expect, test } from "bun:test";

import { FantasyError } from "@/backend/fantasy/errors";
import { toRepoError } from "@/services/fantasy-errors";
import { classifyRepoError } from "@/services/fantasy-mutation-controller";

describe("toRepoError — backend FantasyError codes", () => {
  test("a passed deadline maps to gameweek_locked and classifies as locked", () => {
    const err = toRepoError(new FantasyError("fantasy_gameweek_locked", "Gameweek is locked."));
    expect(err.code).toBe("gameweek_locked");
    expect(classifyRepoError(err).isLocked).toBe(true);
    expect(classifyRepoError(err).isConflict).toBe(false);
  });

  test("a stale team version maps to version_conflict", () => {
    const err = toRepoError(
      new FantasyError("version_conflict", "Your Fantasy team changed elsewhere."),
    );
    expect(err.code).toBe("version_conflict");
    expect(classifyRepoError(err).isConflict).toBe(true);
  });

  test("a closed season maps to season_closed", () => {
    expect(toRepoError(new FantasyError("fantasy_season_closed", "closed")).code).toBe(
      "season_closed",
    );
  });

  test("rule violations map to validation", () => {
    for (const code of ["budget_exceeded", "club_limit_exceeded", "invalid_squad"] as const) {
      expect(toRepoError(new FantasyError(code, code)).code).toBe("validation");
    }
  });

  test("unknown backend failures stay unknown", () => {
    expect(toRepoError(new FantasyError("data_unavailable", "down")).code).toBe("unknown");
  });
});
