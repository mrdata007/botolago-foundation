import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261005130000 (opt-in public gameweek recaps)
 * on production, after the migrations written later than it. Like the other
 * apply scripts, it records the migration file whole in the history and runs
 * that record only after its sha256 matches the repository file. It must stay
 * a rehearsal unless edited on purpose, and the migration must only add new
 * objects (applying it late must not undo a later migration).
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261005130000";
const NAME = "fantasy_public_recaps";
const script = read(`scripts/backend/apply-${VERSION}-fantasy-public-recaps.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-fantasy-public-recaps.sql`, () => {
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
      "one of the public recap tables already exists",
      "one of the public recap functions already exists",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: both switches off and the grants as reviewed", () => {
    for (const check of [
      "the public recap switches are not one row, both off",
      "visitors cannot read a public recap",
      "signed-in accounts cannot run ",
      "visitors can run ",
      "can read a public recap table directly",
      "history row missing",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });

  test("the migration only adds objects, so applying it late undoes nothing", () => {
    const code = migration
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/create or replace/i);
    expect(code).not.toMatch(/\bdrop\s/i);
    for (const altered of code.match(/alter table\s+([a-z_.]+)/gi) ?? []) {
      expect(altered).toMatch(/fantasy_public_recap/);
    }
  });
});
