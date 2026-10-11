import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts migration 20261011110000 (home and away team ids
 * on api.football_sofascore_live_snapshot(), for SofaScore match details) on
 * production. It carries the migration byte for byte, once, runs it only after
 * its sha256 matches, ships as a rehearsal, and checks production before its
 * first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261011110000";
const NAME = "football_sofascore_snapshot_teams";
const script = read("scripts/backend/apply-sofascore-match-details.sql");
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe("apply-sofascore-match-details.sql", () => {
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
      "where version = '20261011110000') then",
      "where version in ('20261011090000', '20261011100000')) <> 2 then",
      "if exists (select 1 from cron.job_run_details run",
      "or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then",
      "an object this migration depends on is missing",
      "md5(pg_get_functiondef('api.football_sofascore_live_snapshot()'::regprocedure))",
      "is distinct from 'e39415311b09f4a5cb29e96897d0d88f' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks the result: definer, empty search_path, service role only, new md5", () => {
    for (const check of [
      "p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=\"\"']",
      "has_function_privilege('public', fn, 'execute')",
      "has_function_privilege('anon', fn, 'execute')",
      "has_function_privilege('authenticated', fn, 'execute')",
      "not has_function_privilege('service_role', fn, 'execute')",
      "if md5(pg_get_functiondef(fn)) <> '",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });

  test("the new md5 is a placeholder until the orchestrator fills it from CI", () => {
    const pinned = /if md5\(pg_get_functiondef\(fn\)\) <> '([^']+)' then/.exec(script)?.[1];
    expect(pinned).toBeDefined();
    // Either the marked placeholder or a real md5; never anything else.
    expect(
      pinned === "FILL_FROM_CI_SNAPSHOT_TEAMS_MD5" || /^[0-9a-f]{32}$/.test(pinned ?? ""),
    ).toBe(true);
  });

  test("CI prints the new snapshot md5 for the pin", () => {
    const workflow = read(".github/workflows/backend-quality.yml");
    expect(workflow).toContain("'SofaScore snapshot teams md5' as label");
  });
});
