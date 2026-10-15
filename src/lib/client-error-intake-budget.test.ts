import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Audit SEC-06: the hourly budget of browser error kinds must hold when
 * callers arrive together, and a flood must not slow the endpoint down. The
 * budget lives in SQL; a database cannot be run from here, so this pins the
 * structure that makes it atomic in the LATEST definition of
 * `api.report_client_errors`. It is a guard against regressions, not a proof:
 * the behaviour itself is covered by the pgTAP file supabase/tests/database/
 * client_error_intake_budget.test.sql (CI's database-quality job) and was
 * measured with parallel clients on a throwaway Postgres.
 */
const migrationsDir = join(import.meta.dir, "../../supabase/migrations");
const NEW_MIGRATION = "20261015120200_client_error_intake_budget.sql";

function latestDefinition(): string {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let body: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const start = sql.search(/create or replace function api\.report_client_errors\(/i);
    if (start < 0) continue;
    const end = sql.indexOf("\n$$;", start);
    body = sql.slice(start, end < 0 ? undefined : end);
  }
  if (!body) throw new Error("api.report_client_errors is not defined by any migration");
  return body;
}

function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("the browser error intake budget", () => {
  const code = withoutComments(latestDefinition());
  const lock = code.search(/pg_advisory_xact_lock\(/);

  test("admits a new kind of error only under an advisory lock", () => {
    expect(lock).toBeGreaterThan(-1);
  });

  test("takes the lock before any row of the call is touched (no lock-order deadlock)", () => {
    const firstRowWrite = code.search(
      /(update|insert into|delete from)\s+app_private\.client_error_counts/i,
    );
    expect(firstRowWrite).toBeGreaterThan(lock);
  });

  test("handles a call's series in a fixed order", () => {
    expect(code).toMatch(
      /jsonb_agg\([\s\S]*?order by[\s\S]*?kind[\s\S]*?area[\s\S]*?code[\s\S]*?route[\s\S]*?release/i,
    );
  });

  test("counts the hour's kinds under the lock, before the insert", () => {
    const insert = code.search(/insert into app_private\.client_error_counts/i);
    const countAfterLock = code.slice(lock, insert).search(/select count\(\*\) into \w+/i);
    expect(insert).toBeGreaterThan(lock);
    expect(countAfterLock).toBeGreaterThan(-1);
  });

  test("never decides admission from a count taken only before the loop", () => {
    // A count that is not followed by the lock would be the original race.
    const loop = code.search(/\bfor\s+\w+\s+in\b[\s\S]*?\bloop\b/i);
    const countsIntoVariable = [...code.matchAll(/select count\(\*\) into \w+/gi)].map(
      (match) => match.index ?? -1,
    );
    expect(countsIntoVariable.length).toBeGreaterThan(0);
    for (const index of countsIntoVariable) expect(index).toBeGreaterThan(lock);
    expect(loop).toBeGreaterThan(-1);
  });

  test("keeps the limit of 300 and counts what it refuses, cheaply", () => {
    expect(code).toMatch(/hourly_kinds constant integer := 300/);
    expect(code).toMatch(/client_error_intake/);
    expect(code).toMatch(/shard/);
    expect(code).toMatch(/set local synchronous_commit = off/);
  });
});

describe("the migration that fixes it", () => {
  const sql = readFileSync(join(migrationsDir, NEW_MIGRATION), "utf8");
  const code = withoutComments(sql);

  test("does not schema-qualify the SQL keyword functions (a syntax error)", () => {
    // EXTRACT(x FROM y), SUBSTRING, POSITION, OVERLAY and TRIM have their own
    // grammar: `pg_catalog.extract(epoch from t)` does not parse. This went
    // unnoticed once because nothing here runs SQL.
    expect(code).not.toMatch(/pg_catalog\.(extract|substring|position|overlay|trim)\s*\(/i);
  });

  test("stays callable by visitors and keeps no personal data", () => {
    expect(code).toMatch(
      /grant execute on function api\.report_client_errors\(jsonb\) to anon, authenticated/,
    );
    expect(code).toMatch(
      /revoke all on app_private\.client_error_intake from public, anon, authenticated, service_role/,
    );
    const table = code.slice(code.indexOf("create table app_private.client_error_intake"));
    const columns = table.slice(0, table.indexOf(");"));
    expect(columns).not.toMatch(/user|\bip\b|agent|email|query|route|message/i);
  });
});
