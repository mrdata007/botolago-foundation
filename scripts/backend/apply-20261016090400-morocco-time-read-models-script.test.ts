import { moroccoScriptTests } from "./morocco-time-script-kit";

/**
 * The guarded script that puts migration 20261016090400 on production (Morocco's clock in the database;
 * docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md). The shared checks are in
 * morocco-time-script-kit.ts; the pins are recomputed there from the repository files.
 */
moroccoScriptTests(
  "20261016090400",
  [
    "is not the version this update replaces",
    "the database is missing functions this update calls",
  ],
  ["No cron job", "calls these reads"],
  [
    "api.football_season_catalog does not answer an array",
    "api.football_matches_by_date does not answer",
  ],
);
