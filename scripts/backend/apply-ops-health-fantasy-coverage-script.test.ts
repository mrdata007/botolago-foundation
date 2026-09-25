import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925210400 (the `fantasy_fixture_coverage`
 * and `fantasy_scoring` health checks and app_private.ops_alert_test(), audit
 * A08 / DB-03) on production, after 20260925210050. Like the other apply
 * scripts, it records the migration file whole in the history and runs that
 * record only after its sha256 matches the repository file, so the file must
 * be carried byte for byte, once, and the hash it checks must be the file's.
 * It must stay a rehearsal unless edited on purpose, its checks must not
 * write, and applying it must never send an alert or move the alert switch.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925210400";
const NAME = "ops_health_fantasy_coverage_and_scoring";
const script = read(`scripts/backend/apply-${VERSION}-ops-health-fantasy-coverage.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const between = (start: string, end: string) =>
  script.slice(script.indexOf(start), script.indexOf(end, script.indexOf(start) + start.length));

describe(`apply-${VERSION}-ops-health-fantasy-coverage.sql`, () => {
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

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("checks production is as reviewed before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "migration 20260925210050 (the sitemap snapshot) is not applied yet",
      "the database is missing what this update reads or changes",
      "app_private.ops_alert_test() already exists, but the migration is not recorded",
      // The health function as 20260925210050 installs it (local reset), and
      // the alert path as production held it on 2026-09-25 (read there).
      "    <> '3c9b47ab0e10742ebaf355861006b8bd' then",
      "      <> 'f495986586af20c728d3aa0ce2b44c10'",
      "      <> '26943b55b25673c0ad709af90eaf65fc'",
      "      <> 'cab30565c007fc69d2a9fb168e351e50'",
      "      <> 'dc4a7449a164a586e75ffb04d044c631' then",
      "perform set_config('bg.ops_alerts_enabled_before',",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("the migration changes only what the guards cover", () => {
    const created = [...migration.matchAll(/create or replace function ([a-z_.]+\([^)]*\))/g)].map(
      (match) => match[1],
    );
    expect(created).toEqual(["app_private.ops_health_checks()", "app_private.ops_alert_test()"]);
    // No table, grant to a browser role, Vault or alert-state write, and no
    // schedule: switching alerts and choosing where they go stay the owner's.
    // Comments and string literals (messages, hints) blanked first.
    const statements = migration.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
    expect(statements).not.toMatch(
      /\bcreate\s+table\b|\balter\s+table\b|\bcron\.schedule\b|\bgrant\b|\bvault\.(create|update)_secret\b|\bops_alert_configure\s*\(|\bupdate\s+app_private\.ops_alert_state\b/i,
    );
    expect(
      occurrences(statements, "revoke all on function app_private.ops_health_checks() from"),
    ).toBe(1);
    expect(
      occurrences(statements, "revoke all on function app_private.ops_alert_test() from"),
    ).toBe(1);
  });

  test("afterwards: grants, the untouched alert path and switch, both new checks", () => {
    for (const check of [
      " can run an owner-only health function",
      "api.service_ops_health() is executable by the wrong roles",
      "ops_alert_test() is not SECURITY DEFINER with an empty search_path",
      "the alert path changed",
      "the alert switch moved",
      "the health answer is not what the migration defines",
      "added constant text[] := array['fantasy_fixture_coverage', 'fantasy_scoring'];",
      "history row missing",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
    // Every check the migration defines is either new or among the earlier
    // ones the postflight expects (the deadline watch appears only while a
    // season is planned or running).
    const names = [...migration.matchAll(/jsonb_build_object\('name', '([a-z_]+)'/g)].map(
      (match) => match[1],
    );
    const postflight = between("do $postflight$", "$postflight$;");
    for (const name of new Set(names)) {
      if (name === "fantasy_deadline_watch") continue;
      expect({ name, listed: postflight.includes(`'${name}'`) }).toEqual({ name, listed: true });
    }
  });

  test("the postflight writes nothing and nothing in the script sends an alert", () => {
    const postflight = between("do $postflight$", "$postflight$;");
    expect(postflight.length).toBeGreaterThan(0);
    const statements = postflight.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
    expect(statements).not.toMatch(
      /\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+[a-z_.]+\s+set\b|\bgrant\b|\brevoke\b|\bcreate\b|\bdrop\b|\balter\b/i,
    );
    // Outside the carried migration, the script never calls the functions
    // that post to the webhook or switch it.
    const outside = script.replace(migration, "").replace(/--[^\n]*/g, "");
    expect(outside).not.toMatch(
      /ops_alert_test\s*\(\s*\)\s*;|ops_alert_tick\s*\(\s*\)\s*;|ops_alert_configure\s*\(\s*(true|false)|net\.http_post/,
    );
  });
});
