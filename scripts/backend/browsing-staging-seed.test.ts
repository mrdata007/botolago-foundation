import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The synthetic content seed for the Staging V2 browsing load test. It must
 * refuse to run without the staging guard, stay one transaction, never
 * suppress triggers (which would also skip foreign-key checks), keep its
 * season out of what the e-mail plans and live refresh read, and insert
 * nothing on a re-run.
 */

const script = readFileSync(join(import.meta.dir, "browsing-staging-seed.sql"), "utf8");
const code = script
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const firstWrite = code.search(/\binsert into app\./);

describe("browsing-staging-seed.sql", () => {
  test("checks the staging guard, slugs and triggers before its first write", () => {
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "current_setting('botolago.capacity_environment', true) is distinct from 'staging-v2'",
      "browsing_capacity_seed_slug_taken_by_another_row",
      "browsing_capacity_seed_refuses_current_synthetic_season",
      "browsing_capacity_seed_refuses_side_effect_triggers",
    ]) {
      const at = code.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("is one transaction and leaves triggers on", () => {
    const lines = code.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(1);
    expect(code).not.toMatch(/session_replication_role/);
    expect(code).not.toMatch(/\bdisable trigger\b/i);
  });

  test("never makes its season current", () => {
    expect(code).toMatch(/'active', false, anchor\.at, anchor\.at/);
    expect(code).not.toMatch(/is_current\s*=\s*true/);
  });

  test("every insert is idempotent", () => {
    const statements = code.split(";").filter((statement) => /\binsert into\b/i.test(statement));
    expect(statements.length).toBeGreaterThan(20);
    for (const statement of statements) {
      const table = statement.match(/insert into (\S+)/i)?.[1];
      expect({ table, idempotent: /on conflict do nothing\s*$/i.test(statement.trim()) }).toEqual({
        table,
        idempotent: true,
      });
    }
  });

  test("writes no auth, profile or Fantasy rows and no real-looking addresses", () => {
    expect(code).not.toMatch(/insert into (auth\.|app\.profiles|app\.fantasy_)/i);
    expect(code).not.toMatch(/https?:\/\//);
    expect(code).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(code).not.toMatch(/'breaking'/);
  });

  test("runs without psql meta-commands, so the Management API can run it", () => {
    expect(code.split("\n").filter((line) => line.trimStart().startsWith("\\"))).toHaveLength(0);
  });
});
