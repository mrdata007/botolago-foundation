import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { build } from "./build-apply-fantasy-not-rated";

test("the reviewed Not rated promoter preserves exact bytes and rolls back without activation", () => {
  const source = readFileSync(
    "supabase/migrations/20261019172832_fantasy_not_rated_settlement.sql",
    "utf8",
  );
  const artifact = readFileSync(
    "scripts/backend/apply-20261019172832-fantasy-not-rated.sql",
    "utf8",
  );
  expect(artifact).toBe(build());
  expect(artifact.split(source)).toHaveLength(2);
  expect(artifact).toContain(createHash("sha256").update(source).digest("hex"));
  expect(artifact).toContain("set_config('bg.not_rated_mode','rehearsal',true)");
  expect(artifact).toContain("raise exception 'NOT_RATED_REHEARSAL_PASSED_20261019172832");
  expect(artifact.indexOf("not_rated_already_applied")).toBeLessThan(
    artifact.indexOf("insert into supabase_migrations"),
  );
  expect(artifact).toContain("not_rated_unexpected_data_change");
  expect(artifact).toContain("not_rated_async_writer_active");
  expect(artifact).toContain("not_rated_premature_activation");
  expect(artifact).not.toContain("set enabled=true");
});
