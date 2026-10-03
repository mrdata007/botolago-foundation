import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260928090000 (exact UTC day bounds for the
 * matches-by-day function) on production. Like the other apply scripts, it
 * records the migration file whole in the history and runs that record only
 * after its sha256 matches the repository file, so the file must be carried
 * byte for byte, once, and the hash it checks must be the file's. It must stay
 * a rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260928090000";
const NAME = "matches_by_date_explicit_utc_bounds";
const script = read(`scripts/backend/apply-${VERSION}-matches-by-date-utc-bounds.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-matches-by-date-utc-bounds.sql`, () => {
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
      "migration 20260924200300 (timezone validation) is not applied yet",
      "app_private.is_valid_timezone is missing",
      "is not the single nine-argument version this update replaces",
      // The version production held on 2026-10-01 (20260924200300), measured read-only there.
      "    <> '233ccaaa12555046280d3fa468c87c08' then",
      // The old answer for one old finished day, kept to compare with the new ones.
      "'botolago.before',",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: one function, still public, the same answer both ways, bad input refused", () => {
    for (const check of [
      "there is not exactly one football_matches_by_date left",
      "visitors can no longer call the matches-by-day function",
      "the date-and-zone way no longer gives the answer it gave before",
      "exact bounds do not give the same answer as the date and zone",
      "bounds with an unknown zone name were refused",
      "an unknown zone name was accepted without bounds",
      "a start without an end was accepted",
      "an end before the start was accepted",
      "a window longer than a day was accepted",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });
});
