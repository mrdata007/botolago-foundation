import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Audit SEC-06: the hourly budget of browser error kinds must hold when
 * callers arrive together. The budget lives in SQL, and a database cannot be
 * run from here (the pgTAP file supabase/tests/database/
 * client_error_intake_budget.test.sql is CI's check), so this pins the
 * structure that makes the budget atomic in the LATEST definition of
 * `api.report_client_errors`: the lock comes before the count that decides
 * admission, that count comes before the insert, and a refusal is counted.
 */
const migrationsDir = join(import.meta.dir, "../../supabase/migrations");

function latestDefinition(): { file: string; body: string } {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const start = sql.search(/create or replace function api\.report_client_errors\(/i);
    if (start < 0) continue;
    const end = sql.indexOf("\n$$;", start);
    found = { file, body: sql.slice(start, end < 0 ? undefined : end) };
  }
  if (!found) throw new Error("api.report_client_errors is not defined by any migration");
  return found;
}

describe("the browser error intake budget", () => {
  const { body } = latestDefinition();
  const code = body
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  test("admits a new kind of error only under an advisory lock", () => {
    expect(code).toMatch(/pg_advisory_xact_lock\(/);
  });

  test("counts the hour's kinds again after taking the lock, then inserts", () => {
    const lock = code.indexOf("pg_advisory_xact_lock(");
    const insert = code.indexOf("insert into app_private.client_error_counts");
    expect(lock).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(lock);
    const countsAfterLock = [...code.matchAll(/select count\(\*\) into kinds_this_hour/g)]
      .map((match) => match.index ?? -1)
      .filter((index) => index > lock && index < insert);
    expect(countsAfterLock.length).toBeGreaterThan(0);
  });

  test("never decides admission from a count taken only before the loop", () => {
    const loop = code.indexOf("for event in");
    const countsBeforeLoop = [...code.matchAll(/select count\(\*\) into kinds_this_hour/g)]
      .map((match) => match.index ?? -1)
      .filter((index) => index < loop);
    expect(countsBeforeLoop).toHaveLength(0);
  });

  test("keeps the 300-per-hour limit and counts what it refuses", () => {
    expect(code).toMatch(/hourly_kinds constant integer := 300/);
    expect(code).toMatch(/client_error_intake/);
    expect(code).toMatch(/dropped_new_kinds/);
    expect(code).toMatch(/dropped_malformed/);
  });

  test("stays callable by visitors and keeps no personal data", () => {
    const sql = readFileSync(
      join(migrationsDir, "20261015120200_client_error_intake_budget.sql"),
      "utf8",
    );
    expect(sql).toMatch(
      /grant execute on function api\.report_client_errors\(jsonb\) to anon, authenticated/,
    );
    expect(sql).toMatch(
      /revoke all on app_private\.client_error_intake from public, anon, authenticated, service_role/,
    );
    const table = sql.slice(sql.indexOf("create table app_private.client_error_intake"));
    const columns = table.slice(0, table.indexOf(");"));
    expect(columns).not.toMatch(/user|ip |agent|email|query|route|message/i);
  });
});
