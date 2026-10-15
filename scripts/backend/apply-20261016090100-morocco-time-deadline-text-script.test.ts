import { moroccoScriptTests } from "./morocco-time-script-kit";

/**
 * The guarded script that puts migration 20261016090100 on production (Morocco's clock in the database;
 * docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md). The shared checks are in
 * morocco-time-script-kit.ts; the pins are recomputed there from the repository files.
 */
moroccoScriptTests(
  "20261016090100",
  [
    "app_private.notification_push_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,text,timestamp with time zone,integer)",
    "app_private.notification_email_fanout(timestamp with time zone,text,uuid[],timestamp with time zone,integer)",
    "is not the version this update replaces",
    "the database is missing functions this update calls",
    "already has the new text -- was this applied by another route?",
    "perform set_config('bg.morocco_watched_0_before'",
  ],
  [
    "notification-push-tick",
    "notification-email-tick",
    "A call already running finishes on the old text",
  ],
  ["the deadline text is not the one the application shows"],
);
