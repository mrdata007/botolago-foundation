import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const script = readFileSync(new URL("./apply-api-rating-recovery.sql", import.meta.url), "utf8");
const source = readFileSync(
  new URL(
    "../../supabase/migrations/20261018173321_fantasy_api_rating_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);
test("native rating promotion executes exactly the canonical migration, pinned by SHA256", () => {
  const embedded = script.split("$native_rating_source$")[1];
  expect(embedded).toBe(source);
  expect(script).toContain(createHash("sha256").update(source).digest("hex"));
});
test("production promotion defaults to rollback and checks writers and score/identity fingerprints", () => {
  expect(script).toContain("select app_private.hold_scheduled_jobs()");
  for (const guard of [
    "worker_lease_not_drained",
    "async_queue_not_drained",
    "migration_changed_scores_or_identities",
    "wrong_production_season",
    "actual_rating_safeguard_required",
  ])
    expect(script).toContain(guard);
  expect(script.trimEnd()).toEndWith(
    "select exists(select 1 from supabase_migrations.schema_migrations where version='20261018173321') as applied;",
  );
  expect(script.slice(script.lastIndexOf("$verify$;"))).toContain("\nrollback;\n");
});
