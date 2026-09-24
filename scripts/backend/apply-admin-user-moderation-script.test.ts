import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `apply-20260924160000-admin-user-moderation.sql` is the guarded script the
 * owner ran in the Supabase SQL editor to apply migration 20260924160000 to
 * production on 2026-09-24. It must keep carrying that migration byte for
 * byte -- both as the SQL it runs and as the history row it records -- and it
 * must stay a rehearsal unless someone edits it on purpose.
 */

const root = join(import.meta.dir, "../..");
const script = readFileSync(
  join(root, "scripts/backend/apply-20260924160000-admin-user-moderation.sql"),
  "utf8",
);
const migration = readFileSync(
  join(root, "supabase/migrations/20260924160000_admin_user_moderation_and_analytics.sql"),
  "utf8",
);

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("the production apply script for 20260924160000", () => {
  test("carries the migration verbatim, once to run and once to record", () => {
    expect(occurrences(script, migration)).toBe(2);
    const tag = "$bg_20260924160000_file$";
    expect(script).toContain(`array[${tag}${migration}${tag}]`);
    expect(migration).not.toContain(tag);
  });

  test("records the history row under the migration's own version and name", () => {
    expect(script).toContain("'20260924160000',\n  'admin_user_moderation_and_analytics',");
  });

  test("the migration is the one production recorded", () => {
    // statements[1] of production's history row, measured when it was applied.
    expect(createHash("sha256").update(migration).digest("hex")).toBe(
      "05ebba0aa0dc69f3abea827b0ac3546cf92b1f12ba8d6fce3810e1ef8b58aad0",
    );
  });

  test("ships as a rehearsal: one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("refuses to run twice and bounds its locks before writing anything", () => {
    const firstWrite = script.indexOf("create table app_private.user_bans");
    for (const guard of [
      "set local lock_timeout = '5s';",
      "set local statement_timeout = '120s';",
      "migration 20260924160000 is already recorded as applied",
      "app_private.user_bans already exists",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });
});
