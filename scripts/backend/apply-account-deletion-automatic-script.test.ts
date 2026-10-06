import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261006143700 (automatic account deletion) on
 * production. Like the other apply scripts, it records the migration file
 * whole in the history and runs that record only after its sha256 matches the
 * repository file, so the file must be carried byte for byte, once, and the
 * hash it checks must be the file's. It must stay a rehearsal unless edited on
 * purpose, it must refuse to run while a deletion request is pending (the
 * migration would close that account at once), and it must never switch the
 * erasure on itself.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261006143700";
const NAME = "account_deletion_automatic";
const script = read(`scripts/backend/apply-${VERSION}-account-deletion-automatic.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-account-deletion-automatic.sql`, () => {
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
      "migration 20261005140000 (the last one before this) is not applied yet",
      "the tables this builds on are missing",
      "the functions this builds on are missing",
      "a column this adds already exists",
      "one of the account deletion tables already exists",
      "one of the account deletion functions already exists",
      "an account-deletion job already exists",
      "account deletion request(s) are pending",
      "a prize winner or league already lacks its account",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: owner-only and service-only functions, switch off, two jobs, a quiet tick", () => {
    for (const check of [
      " is missing",
      "can run",
      "service_role cannot run",
      "signed-in accounts lost the right to ask for deletion",
      "the account deletion switch is not one row, off",
      "the account-deletion jobs are not scheduled as reviewed",
      "the tick while off answered",
      "the tick wrote while off",
      "the account_deletion health check answered",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });

  test("never switches the erasure on, in the script or in the migration", () => {
    // Comments may name the switch; the statements may not use it.
    const code = (text: string) =>
      text
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
    for (const text of [script, migration]) {
      expect(code(text)).not.toMatch(/select\s+app_private\.account_deletion_configure\s*\(/i);
      expect(code(text)).not.toMatch(/set\s+enabled\s*=\s*true/i);
    }
  });

  test("the migration states the same hold the app states", () => {
    expect(migration).toContain("select interval '7 days';");
  });
});
