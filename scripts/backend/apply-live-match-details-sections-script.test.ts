import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts migration 20261014120000 (match details stored
 * section by section, `hasLineups` on the SofaScore live snapshot) on
 * production. It carries the migration byte for byte, once, runs it only after
 * its sha256 matches, ships as a rehearsal, and checks production before its
 * first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261014120000";
const NAME = "football_match_details_partial_sections";
const script = read("scripts/backend/apply-live-match-details-sections.sql");
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe("apply-live-match-details-sections.sql", () => {
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

  test("checks production before its first write", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    for (const guard of [
      "set local lock_timeout = '5s';",
      `where version = '${VERSION}') then`,
      "where version in ('20260925170000', '20261013190000')) <> 2 then",
      "if exists (select 1 from cron.job_run_details run",
      "or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then",
      "an object this migration depends on is missing",
      "app_private.football_detail_event_ok already exists",
      "is distinct from '768d57f3ed6e95edb024a4cb3453751f' then",
      "is distinct from 'a55adc904e9e9bc34776278d913eb95e' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks the result: definer, empty search_path, service role only, new md5s", () => {
    for (const check of [
      "p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=\"\"']",
      "has_function_privilege('public', fn, 'execute')",
      "has_function_privilege('anon', fn, 'execute')",
      "has_function_privilege('authenticated', fn, 'execute')",
      "not has_function_privilege('service_role', fn, 'execute')",
      "or has_function_privilege('service_role', fn, 'execute') then",
      "if md5(pg_get_functiondef(ingest)) <> '",
      "if md5(pg_get_functiondef(snapshot)) <> '",
      "a row check does not answer as reviewed",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
    const pins = [...script.matchAll(/<> '([0-9a-f]{32})'/g)].map((m) => m[1]);
    expect(pins).toHaveLength(5);
  });
});
