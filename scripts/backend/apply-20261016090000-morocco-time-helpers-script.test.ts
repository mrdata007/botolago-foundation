import { moroccoScriptTests } from "./morocco-time-script-kit";

/**
 * The guarded script that puts migration 20261016090000 on production (Morocco's clock in the database;
 * docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md). The shared checks are in
 * morocco-time-script-kit.ts; the pins are recomputed there from the repository files.
 */
moroccoScriptTests(
  "20261016090000",
  [],
  ["adds ten functions", "nothing calls the new functions yet"],
  [],
);
