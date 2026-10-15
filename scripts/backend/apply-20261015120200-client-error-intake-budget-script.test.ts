import { describe, expect, test } from "bun:test";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  md5,
  migrationFiles,
  read,
  statementsOf,
} from "./apply-script-kit";

/**
 * The guarded script that puts 20261015120200 (the browser error intake keeps
 * its hourly budget of 300 kinds exactly and counts what it refuses, audit
 * SEC-06) on production, after 20260924200200 (ops health and alerts).
 */

const VERSION = "20261015120200";
const NAME = "client_error_intake_budget";
const SCRIPT_PATH = `scripts/backend/apply-${VERSION}-client-error-intake-budget.sql`;
const script = read(SCRIPT_PATH);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const preflight = between(script, "do $preflight$", "$preflight$;");
const postflight = between(script, "do $postflight$", "$postflight$;");

describe(`apply-${VERSION}-client-error-intake-budget.sql`, () => {
  commonApplyScriptTests({
    version: VERSION,
    name: NAME,
    scriptPath: SCRIPT_PATH,
    guards: [
      "migration 20260924200200 (ops health and alerts) is not applied yet",
      "stop: app_private.client_error_intake already exists",
      "stop: the database is missing roles",
      "app_private.client_error_counts is missing columns (or has other types)",
      "the database is missing functions this update needs",
      "api.report_client_errors(jsonb) is not the version this update replaces (20260924200200)",
      "api.report_client_errors(jsonb) has attributes other than the reviewed ones",
      "api.report_client_errors(jsonb) is not callable by exactly anon and authenticated",
      "other functions write the error tables",
      "cron jobs mention the error tables",
      "perform set_config('bg.report_privs_before'",
      "perform set_config('bg.ops_health_before'",
      "perform set_config('bg.cron_jobs_before'",
    ],
  });

  test("the endpoint it replaces is pinned to the repository files", () => {
    const oldBody = bodyOf(
      read("supabase/migrations/20260924200200_ops_health_and_alerts.sql"),
      /create or replace function api\.report_client_errors\(p_events jsonb\)/,
    );
    const newBody = bodyOf(
      migration,
      /create or replace function api\.report_client_errors\(p_events jsonb\)/,
    );
    expect(oldBody).not.toBe(newBody);
    expect(preflight).toContain(`old_report_md5 constant text := '${md5(oldBody)}';`);
    expect(postflight).toContain(`new_report_md5 constant text := '${md5(newBody)}';`);
    expect(new Set(script.match(/'[0-9a-f]{32}'/g))).toEqual(
      new Set([oldBody, newBody].map((body) => `'${md5(body)}'`)),
    );
    // Nothing between 20260924200200 and this migration redefines it.
    expect(lastDefinerBefore(VERSION, /\bfunction\s+api\.report_client_errors\s*\(/i)).toBe(
      "20260924200200",
    );
  });

  test("the migration adds one table and replaces one function, nothing else", () => {
    const statements = statementsOf(migration);
    expect(
      [...statements.matchAll(/create or replace function ([a-z_.]+\([^)]*\))/g)].map((m) => m[1]),
    ).toEqual(["api.report_client_errors(p_events jsonb)"]);
    expect([...statements.matchAll(/create table ([a-z_.]+)/g)].map((m) => m[1])).toEqual([
      "app_private.client_error_intake",
    ]);
    // Who may call the endpoint is re-stated as it was.
    expect(statements).toContain(
      "revoke all on function api.report_client_errors(jsonb) from public;",
    );
    expect(statements).toContain(
      "grant execute on function api.report_client_errors(jsonb) to anon, authenticated;",
    );
    expect(statements).not.toMatch(
      /\bcron\.|\bops_health_checks\b|\balter\s+table\s+app_private\.client_error_counts/i,
    );
    // The script's expectations match: RLS on and forced, nobody but the owner.
    expect(statements).toContain(
      "alter table app_private.client_error_intake enable row level security;",
    );
    expect(statements).toContain(
      "alter table app_private.client_error_intake force row level security;",
    );
    expect(statements).toContain(
      "revoke all on app_private.client_error_intake from public, anon, authenticated, service_role;",
    );
    expect(postflight).toContain("row level security is not on and forced on the new table");
    expect(postflight).toContain(
      "the new table is accessible to PUBLIC, anon, authenticated or service_role",
    );
    expect(postflight).toContain("ops_health_checks() or service_ops_health() changed");
  });

  test("the preflight covers every column of client_error_counts the new function reads", () => {
    const body = statementsOf(
      bodyOf(migration, /create or replace function api\.report_client_errors\(p_events jsonb\)/),
    );
    for (const column of [
      "bucket_hour",
      "kind",
      "area",
      "code",
      "route",
      "release",
      "sample",
      "reports",
      "first_at",
      "last_at",
    ]) {
      expect({ column, read: new RegExp(`\\b${column}\\b`).test(body) }).toEqual({
        column,
        read: true,
      });
      expect({ column, checked: preflight.includes(`('${column}', `) }).toEqual({
        column,
        checked: true,
      });
    }
    for (const helper of [
      "app_private.client_error_route(text)",
      "app_private.client_error_sample(jsonb)",
    ]) {
      expect(preflight).toContain(`('${helper}')`);
    }
  });

  test("nothing but the endpoint writes the error tables, so nothing needs pausing", () => {
    // The claim in the header, checked against the sources: across every
    // migration, only the original endpoint and this change insert into,
    // update or delete from the two tables, and no cron job names them.
    const writers = migrationFiles().filter((file) =>
      /\b(insert\s+into|update|delete\s+from)\s+app_private\.client_error_(counts|intake)\b/i.test(
        read(`supabase/migrations/${file}`).replace(/--[^\n]*/g, ""),
      ),
    );
    expect(writers).toEqual(["20260924200200_ops_health_and_alerts.sql", `${VERSION}_${NAME}.sql`]);
    for (const file of migrationFiles()) {
      const text = read(`supabase/migrations/${file}`).replace(/--[^\n]*/g, "");
      for (const schedule of text.matchAll(/cron\.schedule\s*\([^;]*?\)\s*;/gis)) {
        expect({ file, mentionsErrorTables: /client_error/i.test(schedule[0]) }).toEqual({
          file,
          mentionsErrorTables: false,
        });
      }
    }
    const header = script.slice(0, script.indexOf("\nbegin;\n"));
    expect(header).toContain(
      "Nothing needs pausing, and nothing could stop the real writers anyway",
    );
    expect(header).toContain("ordinary visitors' browsers");
    // The preflight proves the same on the live database.
    expect(preflight).toContain(
      "(insert\\s+into|update|delete\\s+from)\\s+app_private\\.client_error_(counts|intake)",
    );
    expect(preflight).toContain("from cron.job j where j.command ~* 'client_error'");
  });

  test("never calls the endpoint: a report would be a write", () => {
    expect(statementsOf(script.replace(migration, ""))).not.toMatch(
      /\bapi\.report_client_errors\s*\(\s*[^)]/,
    );
  });
});
