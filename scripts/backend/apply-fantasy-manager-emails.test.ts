import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { build } from "./build-apply-fantasy-manager-emails";

describe("reviewed manager email promotion artifacts", () => {
  for (const [stage, version, name] of [
    [0, "20261019111026", "fantasy_manager_email_event_type"],
    [1, "20261019111217", "fantasy_manager_email_automation"],
  ] as const) {
    test(`${version}: exact migration bytes, verified checksum and rollback by default`, () => {
      const source = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
      const artifact = readFileSync(
        `scripts/backend/apply-${version}-fantasy-manager-emails.sql`,
        "utf8",
      );
      expect(artifact).toBe(build(stage));
      expect(artifact.split(source)).toHaveLength(2);
      expect(artifact).toContain(createHash("sha256").update(source).digest("hex"));
      expect(artifact).toContain("set_config('bg.manager_email_mode','rehearsal',true)");
      expect(artifact).toContain(`raise exception 'MANAGER_EMAIL_REHEARSAL_PASSED_${version}`);
      expect(artifact.indexOf("manager_email_already_applied")).toBeLessThan(
        artifact.indexOf("insert into supabase_migrations"),
      );
      expect(artifact).not.toContain("notification_email_configure('live'");
      expect(artifact).toContain("manager_email_unexpected_data_change");
    });
  }
  test("dependent automation requires a previously committed enum and drained writers", () => {
    const artifact = build(1);
    expect(artifact).not.toContain("alter type app.notification_type");
    for (const refusal of [
      "manager_email_enum_must_be_committed_first",
      "manager_email_staleness_baseline_changed",
      "manager_email_pause_relevant_writers_first",
      "manager_email_scoring_worker_active",
      "manager_email_delivery_worker_active",
      "manager_email_async_queue_active",
      "manager_email_historical_opening_backfill",
      "manager_email_service_grants_invalid",
    ])
      expect(artifact).toContain(refusal);
  });
});
