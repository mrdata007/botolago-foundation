import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925180100 (the MFA step-up for ordinary
 * accounts, audit A03 / DB-07) on production. Like the other apply scripts,
 * it records the migration file whole in the history and runs that record
 * only after its sha256 matches the repository file, so the file must be
 * carried byte for byte, once, and the hash it checks must be the file's. It
 * must stay a rehearsal unless edited on purpose, and its checks must not
 * write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925180100";
const NAME = "ordinary_account_mfa_step_up";
const script = read(`scripts/backend/apply-${VERSION}-ordinary-account-mfa-step-up.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-ordinary-account-mfa-step-up.sql`, () => {
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
      "the MFA step-up already exists, but the migration is not recorded",
      "the database is missing what this update builds on",
      // The three functions it replaces, as production held them on
      // 2026-09-25 (md5 of pg_get_functiondef, read there).
      "    <> '1a1f5fedb7256c03c28305d0cd0ce76a' then",
      "    <> 'b118e6b4b14e793b18532b2abdbc71be' then",
      "    <> '9c655d051942d266429196779a06b160' then",
      // Every table that gets a trigger, taken together before any change.
      "  in share row exclusive mode;",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("locks exactly the tables the migration adds triggers to", () => {
    const triggered = [...migration.matchAll(/before insert or update or delete on ([a-z_.]+)\n/g)]
      .map((match) => match[1])
      .sort();
    expect(triggered).toHaveLength(24);
    const lock = script.slice(
      script.indexOf("lock table\n"),
      script.indexOf("in share row exclusive mode;"),
    );
    const locked = [...lock.matchAll(/(app(?:_private)?\.[a-z_]+)/g)]
      .map((match) => match[1])
      .sort();
    expect(locked).toEqual(triggered);
  });

  test("afterwards: functions private, 24 statement triggers, replacements in place, refusal observed", () => {
    for (const check of [
      "' can run ' || signature",
      "expected 24 enabled per-statement step-up triggers",
      "a replaced function is not the new version",
      "the replaced functions lost or gained a grant",
      "history row missing",
      "an account with no factor was refused: ",
      "an enrolled account at aal1 was not refused with mfa_required",
      "an enrolled account at aal2 was refused: ",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });

  test("the postflight writes nothing: its only table statement matches no row", () => {
    const postflight = script.slice(
      script.indexOf("do $postflight$"),
      script.indexOf("$postflight$;"),
    );
    expect(postflight).not.toMatch(/\binsert\s+into\b|\bdelete\s+from\b/i);
    const updates = [...postflight.matchAll(/\bupdate\s+[a-z_.]+\s+set\b[^;]*;/gi)].map(
      (match) => match[0],
    );
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) expect(update).toEndWith("where false;");
  });
});
