import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261005140000 (a held push address moves to
 * whoever presents it) on production. Like the other apply scripts, it records
 * the migration file whole in the history and runs that record only after its
 * sha256 matches the repository file. It must stay a rehearsal unless edited on
 * purpose, it must refuse to replace a function that is not the reviewed one, and
 * the migration must replace that one function and nothing else.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261005140000";
const NAME = "notification_device_takeover";
const script = read(`scripts/backend/apply-${VERSION}-notification-device-takeover.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-notification-device-takeover.sql`, () => {
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
      "the tables this builds on are missing",
      "the functions this builds on are missing",
      "api.register_my_notification_device is missing",
      "api.register_my_notification_device already moves a held address",
      "is not the version this replaces",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: the new behaviour, the old checks, and who may call it", () => {
    for (const check of [
      "the function does not move a held address",
      "the function lost one of its checks (second factor, rate limit, lock)",
      "signed-in accounts cannot register a phone",
      "can register a phone",
      "can write the audit directly",
      "history row missing",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });

  test("the migration replaces one function and changes nothing else", () => {
    const code = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(occurrences(code, "create or replace function")).toBe(1);
    expect(code).toContain("create or replace function api.register_my_notification_device(");
    for (const forbidden of [
      /\balter\s+table\b/i,
      /\bdrop\b/i,
      /\bcreate\s+table\b/i,
      /\bgrant\b/i,
      /\brevoke\b/i,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });

  test("the function moves a held address and still checks everything it checked", () => {
    expect(migration).toContain("'notification_device_taken_over'");
    for (const kept of [
      "app_private.assert_mfa_step_up()",
      "app_private.assert_valid_timezone(p_timezone)",
      "app_private.assert_notification_user_rate_limit(",
      "pg_advisory_xact_lock",
      "'notification_device_registered'",
    ]) {
      expect({ kept, present: migration.includes(kept) }).toEqual({ kept, present: true });
    }
  });
});
