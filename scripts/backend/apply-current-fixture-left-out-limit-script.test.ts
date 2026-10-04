import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261004130000 (the raised left-out limits) on
 * production. It carries the migration byte for byte, once, runs it only after
 * its sha256 matches, ships as a rehearsal, holds the statistics tables first
 * and checks production is as reviewed before its first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261004130000";
const NAME = "current_fixture_left_out_limit";
const script = read(`scripts/backend/apply-${VERSION}-current-fixture-left-out-limit.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-current-fixture-left-out-limit.sql`, () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = `$bg_${VERSION}_file$`;
    expect(migration).not.toContain(tag);
    expect(occurrences(script, migration)).toBe(1);
    expect(script).toContain(`  '${VERSION}',\n  '${NAME}',\n  array[${tag}${migration}${tag}]`);
    expect(script).toContain(
      `if encode(sha256(convert_to(part_${VERSION}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
    );
    expect(occurrences(script, `execute part_${VERSION};`)).toBe(1);
  });

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("holds the statistics tables first, then checks production before its first write", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(
      script.indexOf(
        "  lock table app_private.historical_performance_fixture_coverage in access exclusive mode;",
      ),
    ).toBeLessThan(script.indexOf("do $preflight$"));
    for (const guard of [
      `migration ${VERSION} is already recorded as applied`,
      "migration 20261004120000 (the left-out rule) is not applied",
      "where lifecycle_tick_enabled) then",
      "if exists (select 1 from cron.job_run_details run",
      // Production's two definitions on 2026-10-04 after 20261004120000, measured there.
      "      <> 'f4e062c7a04e83a0220bd95b29984bdf'",
      "      <> '3e858d5f672a339509b5c3d257541cf1' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("the migration changes only limits, and stops unless each patch lands exactly once", () => {
    expect(migration).toContain(
      "  old_text := '  if jsonb_array_length(left_out) + unnamed_rows > 20 or jsonb_array_length(placed) < 22 then';",
    );
    expect(migration).toContain(
      "  new_text := '  if jsonb_array_length(left_out) > 40 or jsonb_array_length(placed) < 11 then';",
    );
    expect(occurrences(migration, "/ length(old_text) <> 1 then")).toBe(2);
    expect(migration).not.toMatch(/^\s*(insert|update|delete)\s/im);
  });
});
