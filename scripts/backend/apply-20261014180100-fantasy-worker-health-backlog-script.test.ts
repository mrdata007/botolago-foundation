import { describe, expect, test } from "bun:test";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  md5,
  read,
  statementsOf,
} from "./apply-script-kit";

/**
 * The guarded script that puts 20261014180100 (the `fantasy_worker` health
 * check watching the scheduler's whole backlog, audit ASTRA-02) on production,
 * after the SofaScore rating release that carries the function it replaces.
 */

const VERSION = "20261014180100";
const NAME = "fantasy_worker_health_backlog";
const SCRIPT_PATH = `scripts/backend/apply-${VERSION}-fantasy-worker-health-backlog.sql`;
const script = read(SCRIPT_PATH);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const preflight = between(script, "do $preflight$", "$preflight$;");
const postflight = between(script, "do $postflight$", "$postflight$;");

describe(`apply-${VERSION}-fantasy-worker-health-backlog.sql`, () => {
  commonApplyScriptTests({
    version: VERSION,
    name: NAME,
    scriptPath: SCRIPT_PATH,
    guards: [
      "20261013170000 and 20261013170100 are not both applied",
      "scripts/backend/apply-20261014-sofascore-rating-release.sql (committed) first",
      "the database is missing what the new health predicate reads",
      "the database is missing functions this update needs",
      "app_private.fantasy_worker_health() is not the version this update replaces (20261013170100)",
      "app_private.fantasy_worker_health() has attributes other than the reviewed ones",
      "app_private.fantasy_worker_health() is executable by PUBLIC, anon, authenticated or service_role",
      "app_private.fantasy_worker_work_pending() is not the version the new health predicate was copied from (20261013170000)",
      "app_private.ops_health_checks() no longer calls app_private.fantasy_worker_health()",
      "perform set_config('bg.health_checks_before'",
      "perform set_config('bg.fantasy_switches_before'",
      "perform set_config('bg.cron_jobs_before'",
    ],
  });

  test("the old function and the scheduler's predicate are pinned to the repository files", () => {
    const oldBody = bodyOf(
      read("supabase/migrations/20261013170100_ops_health_fantasy_worker.sql"),
      /create function app_private\.fantasy_worker_health\(\)/,
    );
    const pendingBody = bodyOf(
      read("supabase/migrations/20261013170000_fantasy_worker_schedule.sql"),
      /create or replace function app_private\.fantasy_worker_work_pending\(\)/,
    );
    const newBody = bodyOf(
      migration,
      /create or replace function app_private\.fantasy_worker_health\(\)/,
    );
    expect(preflight).toContain(`old_health_md5 constant text := '${md5(oldBody)}';`);
    expect(preflight).toContain(`work_pending_md5 constant text := '${md5(pendingBody)}';`);
    expect(postflight).toContain(`new_health_md5 constant text := '${md5(newBody)}';`);
    // Exactly these three digests, no stale ones.
    expect(new Set(script.match(/'[0-9a-f]{32}'/g))).toEqual(
      new Set([oldBody, pendingBody, newBody].map((body) => `'${md5(body)}'`)),
    );
  });

  test("the function it replaces is the latest definition before this migration", () => {
    expect(
      lastDefinerBefore(VERSION, /\bfunction\s+app_private\.fantasy_worker_health\s*\(/i),
    ).toBe("20261013170100");
    expect(
      lastDefinerBefore(VERSION, /\bfunction\s+app_private\.fantasy_worker_work_pending\s*\(/i),
    ).toBe("20261013170000");
    // Both prerequisites ride in the release bundle the script names, which
    // does not carry this migration itself.
    const release = read("scripts/backend/apply-20261014-sofascore-rating-release.sql");
    expect(release).toContain(
      "insert into supabase_migrations.schema_migrations (version, name, statements)\nvalues ('20261013170000'",
    );
    expect(release).toContain("values ('20261013170100'");
    expect(release).not.toContain(VERSION);
    expect(preflight).toContain("version in ('20261013170000', '20261013170100')");
  });

  test("the migration changes only the one function, and the checks cover what it reads", () => {
    const statements = statementsOf(migration);
    const created = [...statements.matchAll(/create or replace function ([a-z_.]+\([^)]*\))/g)].map(
      (match) => match[1],
    );
    expect(created).toEqual(["app_private.fantasy_worker_health()"]);
    expect(statements).not.toMatch(
      /\bcreate\s+table\b|\balter\s+table\b|\bcron\.|\bgrant\b|\binsert\s+into\b|\bupdate\s+(app|app_private)\b|\bdelete\s+from\b/i,
    );
    // Every table the new function reads, and every function it calls, is
    // checked by the preflight.
    const body = statementsOf(
      bodyOf(migration, /create or replace function app_private\.fantasy_worker_health\(\)/),
    );
    const relations = new Set(
      [...body.matchAll(/\b(?:from|join)\s+((?:app|app_private)\.[a-z_]+)/g)].map((m) => m[1]),
    );
    expect(relations.size).toBeGreaterThanOrEqual(8);
    for (const relation of relations) {
      expect({ relation, checked: preflight.includes(`('${relation}', `) }).toEqual({
        relation,
        checked: true,
      });
    }
    const calls = new Set(
      [...body.matchAll(/\b((?:app|app_private)\.[a-z_]+)\(/g)].map((m) => `${m[1]}(`),
    );
    for (const call of calls) {
      expect({ call, checked: preflight.includes(`('${call}`) }).toEqual({ call, checked: true });
    }
    // The DO guard in the migration itself still names what it needs.
    expect(migration).toContain("apply 20261013170000 and 20261013170100 first");
  });

  test("keeps the health function owner-only and the wrapper intact", () => {
    expect(statementsOf(migration)).toContain(
      "revoke all on function app_private.fantasy_worker_health() from public, anon, authenticated, service_role;",
    );
    expect(postflight).toContain(
      "the health function became executable by PUBLIC, anon, authenticated or service_role",
    );
    expect(postflight).toContain("the list of health checks changed");
    expect(postflight).toContain("fantasy_worker is not listed exactly once");
    expect(postflight).toContain("the Fantasy switches moved");
    expect(postflight).toContain("the cron job list moved");
    // It never calls the alert tick: applying must send nothing.
    expect(statementsOf(script)).not.toMatch(/ops_alert_tick|ops_alert_configure/);
  });

  test("says plainly what to pause: nothing, because it writes no table", () => {
    const header = script.slice(0, script.indexOf("\nbegin;\n"));
    expect(header).toContain("Nothing needs pausing, because this script writes no table at all");
    expect(header).toContain("fantasy_worker_enabled()");
    expect(header).toContain("ops-alert-tick");
    expect(header).toContain("apply-20261014-sofascore-rating-release.sql");
  });
});
