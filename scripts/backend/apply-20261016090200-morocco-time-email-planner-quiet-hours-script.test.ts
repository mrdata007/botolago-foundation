import { moroccoScriptTests } from "./morocco-time-script-kit";

/**
 * The guarded script that puts migration 20261016090200 on production (Morocco's clock in the database;
 * docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md). The shared checks are in
 * morocco-time-script-kit.ts; the pins are recomputed there from the repository files.
 */
moroccoScriptTests(
  "20261016090200",
  [
    "is not the version this update replaces",
    "the database is missing functions this update calls",
    "perform set_config('bg.morocco_watched_1_before'",
  ],
  ["notification-push-tick", "notification-email-tick", "manager-card-tick", "rivals-tick"],
  ["quiet hours do not follow Morocco''s clock"],
);
