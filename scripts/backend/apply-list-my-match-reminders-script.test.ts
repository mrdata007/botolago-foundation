import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261002110000 (the match-reminders read) on
 * production. Like the other apply scripts, it records the migration file
 * whole in the history and runs that record only after its sha256 matches the
 * repository file, so the file must be carried byte for byte, once, and the
 * hash it checks must be the file's. It must stay a rehearsal unless edited on
 * purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261002110000";
const NAME = "list_my_match_reminders";
const script = read(`scripts/backend/apply-${VERSION}-list-my-match-reminders.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-list-my-match-reminders.sql`, () => {
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
      "migration 20260720121729 (notification API) is not applied yet",
      "app_private.assert_mfa_step_up is missing",
      "app.notification_subscriptions is missing",
      "api.list_my_match_reminders already exists",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: one function, signed-in accounts only, empty for a stranger, refused for nobody", () => {
    for (const check of [
      "there is not exactly one list_my_match_reminders",
      "signed-in accounts cannot call it",
      "something other than signed-in accounts can call it",
      "an account with no reminder read",
      "a call with nobody signed in was accepted",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });
});
