import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts the hourly season refresh (20260926113100) on
 * production. It records the migration file whole in the history, then
 * runs that record only after its sha256 matches the repository file. So the
 * file must be carried byte for byte, once, and the hash the script checks
 * must be the file's: a migration edited after the script was built fails
 * here, not on production. The script must stay a rehearsal unless edited on
 * purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260926113100";
const NAME = "football_season_refresh";
const script = read("scripts/backend/apply-20260926113100-football-season-refresh.sql");
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe("apply-20260926113100-football-season-refresh.sql", () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = `$bg_${VERSION}_file$`;
    expect(migration).not.toContain(tag);
    expect(occurrences(script, migration)).toBe(1);
    expect(script).toContain(`array[${tag}${migration}${tag}]`);
    expect(script).toContain(`  '${VERSION}',\n  '${NAME}',\n  array[${tag}`);
    expect(script).toContain(
      `if encode(sha256(convert_to(part_${VERSION}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
    );
    expect(occurrences(script, `execute part_${VERSION};`)).toBe(1);
  });

  test("ships as a rehearsal: one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
  });

  test("checks everything before its first write: twice, prerequisites, what it replaces", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "the season refresh already exists, but the migration is not recorded",
      "migration 20260926003400 (ops health, Fantasy coverage and scoring)",
      "pg_cron job football-live-refresh",
      "a function this update replaces or calls is not the text it was written against",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("says to deploy the Edge Function first", () => {
    const deploy = script.indexOf(
      "supabase functions deploy football-live-refresh --project-ref tkewgajrljbwgwedqsxn",
    );
    expect(deploy).toBeGreaterThan(0);
    expect(deploy).toBeLessThan(script.indexOf("HOW TO RUN"));
  });

  test("checks the result without calling anything", () => {
    expect(script).toContain("the football-season-refresh job is not every 10 minutes and active");
    expect(script).toContain("the health checks are not the same set as before");
    expect(script).toContain("a health check has no valid status or no detail");
    expect(script).toContain("the live refresh was switched on or off by the update");
    // Quoted text aside: the job's own command is compared as a string.
    const postflight = script.slice(script.indexOf("do $postflight$")).replace(/'[^']*'/g, "''");
    expect(postflight).not.toContain("football_season_refresh_tick");
    expect(postflight).not.toContain("invoke_scheduled_function");
  });
});
