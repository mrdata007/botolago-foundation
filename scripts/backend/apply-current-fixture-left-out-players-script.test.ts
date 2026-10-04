import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261004120000 (left-out lineup players) on
 * production. It records the migration file whole in the history and runs
 * that record only after its sha256 matches the repository file, so the file
 * must be carried byte for byte, once. It must stay a rehearsal unless edited
 * on purpose, hold the statistics tables first, and check production is as
 * reviewed before its first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261004120000";
const NAME = "current_fixture_left_out_players";
const script = read(`scripts/backend/apply-${VERSION}-current-fixture-left-out-players.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-current-fixture-left-out-players.sql`, () => {
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
    const hold = script.indexOf(
      "  lock table app_private.historical_performance_fixture_coverage in access exclusive mode;",
    );
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(hold).toBeGreaterThan(script.indexOf("set local lock_timeout = '5s';"));
    expect(hold).toBeLessThan(script.indexOf("do $preflight$"));
    for (const guard of [
      `migration ${VERSION} is already recorded as applied`,
      "part of this update is already in the database",
      "where lifecycle_tick_enabled) then",
      "if exists (select 1 from cron.job_run_details run",
      // Production's three definitions on 2026-10-04, measured there.
      "      <> 'af2210f935c3cf55abbeadd2ee7f199a'",
      "      <> '923fa0363e9e8e0c4f46c12cfb99adfb'",
      "      <> '89e31e1184d3c8ed09aeb4a03413ff87' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks the result after applying", () => {
    const after = script.slice(script.indexOf("do $postflight$"));
    for (const check of [
      "LEFT_OUT_PLAYER_HELD",
      "HELD_PLAYER_UNMAPPED",
      "LEAVE_OUT_GAMEWEEK_NOT_LOCKED",
      "has_function_privilege('service_role', renamed, 'execute')",
      "has_table_privilege('service_role', 'app_private.current_fixture_left_out_players', 'insert')",
      "like '%excluded_mapping_rows = 0%'",
    ])
      expect({ check, present: after.includes(check) }).toEqual({ check, present: true });
  });
});
