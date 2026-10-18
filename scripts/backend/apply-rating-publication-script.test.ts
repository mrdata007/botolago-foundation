import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

test("the production promoter transports exactly the reviewed migration", () => {
  const migration = readFileSync(
    "supabase/migrations/20261018215311_fantasy_publish_available_api_ratings.sql",
    "utf8",
  );
  const operator = readFileSync("scripts/backend/apply-rating-publication.sql", "utf8");
  const digest = createHash("sha256").update(migration).digest("hex");
  expect(operator).toContain(`$rating_publication_source$${migration}$rating_publication_source$`);
  expect(operator).toContain(digest);
  expect(operator).toContain("hold_scheduled_jobs()");
  expect(operator).toContain("lock table app_private.fantasy_worker_lease in exclusive mode");
  expect(operator).toContain("rating_publication_football_running");
  expect(operator).toContain("publication_migration_changed_data");
  expect(operator).toContain("\nrollback;\n");
  expect(operator).not.toContain("\ncommit;\n");
});
