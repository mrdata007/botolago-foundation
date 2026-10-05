import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261005130000 (the remaining push moments: the
 * 1-hour deadline, results, goals and their correction) on production. Like the
 * other apply scripts, it records the migration file whole in the history and
 * runs that record only after its sha256 matches the repository file, so the
 * file must be carried byte for byte, once, and the hash it checks must be the
 * file's. It must stay a rehearsal unless edited on purpose, it must refuse to
 * run while push is switched on or before the steps it builds on are saved, and
 * it must never switch push on itself.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261005130000";
const NAME = "push_remaining_alerts";
const script = read(`scripts/backend/apply-${VERSION}-push-remaining-alerts.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-push-remaining-alerts.sql`, () => {
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
      "the push claim (20261005100000) is not applied yet",
      "the push fan-out and tick (20261005110000) are not applied yet",
      "the goal_cancelled type (20261005120000) is not applied and saved yet",
      "push is switched on; switch it off",
      "the tables this builds on are missing",
      "the functions this builds on are missing",
      "one of the functions this adds already exists",
      "one of the texts this adds already exists",
      "the first goal text is not active in both languages",
      "a goal notification already exists",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: owner-only functions, the new texts, the rules, switch still off, one job a minute, nothing done while off", () => {
    for (const check of [
      " is missing",
      "can run",
      "the six new texts are not all active",
      "the first goal text is still active",
      "goals do not have exactly one active text per language",
      "the push rules for the new type are wrong",
      "the push switch is not one row, off",
      "the notification-push-tick job is not scheduled once a minute",
      "the tick while off answered",
      "the planner failed",
      "the fan-out failed",
      "a fan-out asked to run while off answered",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });

  test("its probes (tick, planner, fan-out) are rolled back, so the check leaves nothing behind", () => {
    expect(occurrences(script, "raise exception 'rollback_probe';")).toBe(3);
    expect(occurrences(script, "if sqlerrm <> 'rollback_probe' then")).toBe(3);
  });

  test("never switches push on, in the script or in the migration", () => {
    // Comments may name the switch; the statements may not use it.
    const code = (text: string) =>
      text
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
    for (const text of [script, migration]) {
      expect(code(text)).not.toMatch(/select\s+app_private\.notification_push_configure\s*\(/i);
      expect(code(text)).not.toMatch(/set\s+mode\s*=\s*'(testers|live)'/i);
    }
  });
});
