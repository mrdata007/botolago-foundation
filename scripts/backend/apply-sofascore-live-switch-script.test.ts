import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts the SofaScore data-source switch and the live
 * snapshot helper (20261011090000, 20261011100000; PR 422) on production. It
 * carries both migrations byte for byte, once, runs each only after its sha256
 * matches, ships as a rehearsal, and checks production before its first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const MIGRATIONS = [
  ["20261011090000", "football_data_source_switch"],
  ["20261011100000", "football_sofascore_live_snapshot"],
] as const;
const script = read("scripts/backend/apply-sofascore-live-switch.sql");

describe("apply-sofascore-live-switch.sql", () => {
  for (const [version, name] of MIGRATIONS) {
    test(`carries ${version} byte for byte and checks it before running it`, () => {
      const migration = read(`supabase/migrations/${version}_${name}.sql`);
      const tag = `$bg_${version}_file$`;
      expect(migration).not.toContain(tag);
      expect(occurrences(script, migration)).toBe(1);
      expect(script).toContain(`  '${version}',\n  '${name}',\n  array[${tag}${migration}${tag}]`);
      expect(script).toContain(
        `if encode(sha256(convert_to(part_${version}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
      );
      expect(occurrences(script, `execute part_${version};`)).toBe(1);
    });
  }

  test("runs the migrations in order", () => {
    expect(script.indexOf("execute part_20261011090000;")).toBeLessThan(
      script.indexOf("execute part_20261011100000;"),
    );
  });

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("checks production before its first write", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    for (const guard of [
      "set local lock_timeout = '5s';",
      "where version in ('20261011090000', '20261011100000')) then",
      "if exists (select 1 from cron.job_run_details run",
      "or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then",
      "to_regclass('app_private.football_data_source_settings') is not null",
      "or to_regprocedure('api.football_sofascore_live_snapshot()') is not null then",
      "an object these migrations depend on is missing",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks the result: default source, definer functions, grants, forced RLS", () => {
    for (const check of [
      "app_private.football_data_source() is distinct from 'sportsmonks'",
      "p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=\"\"']",
      "has_function_privilege('anon', fn, 'execute')",
      "has_function_privilege('authenticated', fn, 'execute')",
      "not has_function_privilege('service_role', fn, 'execute')",
      "relrowsecurity and relforcerowsecurity",
      "has_table_privilege('service_role', 'app_private.football_data_source_settings', 'select')",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });
});
