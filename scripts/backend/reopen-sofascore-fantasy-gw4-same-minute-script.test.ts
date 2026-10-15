import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded owner script that reopens the one GW4 SofaScore Fantasy attempt
 * given up on `timeline_unresolved` (Maghreb Fes - IR Tanger) once the
 * same-minute ordering (owner option A, 2026-10-15) is deployed.
 */
const script = readFileSync(
  join(import.meta.dir, "reopen-sofascore-fantasy-gw4-same-minute.sql"),
  "utf8",
);

describe("reopen-sofascore-fantasy-gw4-same-minute.sql", () => {
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
      "expected exactly one GW4 attempt held or given up on timeline_unresolved",
      "'3c37ffb7-e2c8-4662-a1ee-4a52f76ad1c2'",
      "f.status <> 'finished' or f.finalized_at is null",
      "g.status in ('finalizing', 'finalized', 'corrected')",
      "m.entity_type = 'fixture'",
      "app_private.fantasy_adaptive_enabled(c_gw4)",
      "interval '504 hours'",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1, beforeWrite: at < write }).toEqual({
        guard,
        found: true,
        beforeWrite: true,
      });
    }
    expect(script).toContain("if v_count <> 1 then");
    expect(script).toContain("a.status <> 'held' or a.attempts <> 0");
  });
});
