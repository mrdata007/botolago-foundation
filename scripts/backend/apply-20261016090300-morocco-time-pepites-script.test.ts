import { moroccoScriptTests } from "./morocco-time-script-kit";

/**
 * The guarded script that puts migration 20261016090300 on production (Morocco's clock in the database;
 * docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md). The shared checks are in
 * morocco-time-script-kit.ts; the pins are recomputed there from the repository files.
 */
moroccoScriptTests(
  "20261016090300",
  [
    "is not the version this update replaces",
    "the database is missing functions this update calls",
    "perform set_config('bg.morocco_watched_0_before'",
  ],
  ["pepites-tick", "pepites_configure('off', null)"],
  ["pepites_local_at does not follow Morocco''s clock"],
);
