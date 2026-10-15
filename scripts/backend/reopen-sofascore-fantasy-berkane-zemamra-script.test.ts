import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded owner script that reopens the SofaScore Fantasy attempt of RS
 * Berkane - Renaissance Zemamra (17256978) once the own-goal fix is deployed.
 */
const script = readFileSync(
  join(import.meta.dir, "reopen-sofascore-fantasy-berkane-zemamra.sql"),
  "utf8",
);

describe("reopen-sofascore-fantasy-berkane-zemamra.sql", () => {
  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("checks production before its one write, which reopens exactly one row", () => {
    const write = script.indexOf("v_count := app_private.sofascore_fantasy_reopen(null,");
    expect(write).toBeGreaterThan(-1);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "if exists (select 1 from cron.job_run_details run",
      "a match is in play",
      "f.status <> 'finished' or f.finalized_at is null",
      "a.sofascore_event_id <> '17256978'",
      "a.status not in ('gave_up', 'held')",
      "a.match_data is null",
      "m.entity_type = 'fixture'",
      "app_private.fantasy_adaptive_enabled(x.gameweek_id)",
      "interval '504 hours'",
      "an observation is already recorded",
      "g.status in ('finalizing', 'finalized', 'corrected')",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1, beforeWrite: at < write }).toEqual({
        guard,
        found: true,
        beforeWrite: true,
      });
    }
    expect(script).toContain("if v_count <> 1 then");
    expect(script.match(/'f128e41f-e72b-4340-9725-ec4f95432848'/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
  });
});
