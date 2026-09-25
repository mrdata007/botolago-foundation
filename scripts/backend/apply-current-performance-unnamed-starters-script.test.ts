import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925110000 (this season's statistics follow
 * last season's unnamed-starter rule, BG-0011 option B) on production. It
 * records the migration file whole in the history and runs that record only
 * after its sha256 matches the repository file, so the file must be carried
 * byte for byte, once. It must stay a rehearsal unless edited on purpose, and
 * refuse while the Fantasy tick could write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925110000";
const NAME = "current_performance_unnamed_starters";
const script = read(`scripts/backend/apply-${VERSION}-current-performance-unnamed-starters.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-current-performance-unnamed-starters.sql`, () => {
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

  test("checks production is as reviewed, and the Fantasy tick is off, before writing", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "migration 20260919120000 (last season''s unnamed-starter rule) is not applied",
      "where lifecycle_tick_enabled) then",
      // Production's versions on 2026-09-25, measured there.
      "  )) <> '6b182b4d22ba0bc70c17063923610dd8' then",
      "    <> '6fe413ab384021291ff203732d7f758d' then",
      "      is distinct from '54f6b72a70939c300b58e256c1b6e0a2'",
      "      is distinct from 'cc407f26b8326f4f7c56b39c86a027af' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: new rules, same callers, 3 unnamed starters scored and 5 refused", () => {
    expect(script).toContain("the coverage table rules are not the new versions");
    expect(script).toContain("the functions are callable by the wrong roles");
    expect(script).toContain("the scoring check refuses a match with 3 unnamed starters");
    expect(script).toContain("the scoring check takes a match with 5 unnamed starters");
  });

  test("the migration touches only the four places that enforced zero", () => {
    const created = migration.match(/^create or replace function [\w.]+/gm) ?? [];
    expect(created).toEqual([
      "create or replace function api.ingest_current_player_fixture_performance",
      "create or replace function app_private.fantasy_validate_scoring_document",
    ]);
    expect(migration.match(/^ {2}add constraint \w+/gm)).toEqual([
      "  add constraint historical_performance_coverage_counts_check",
      "  add constraint current_performance_coverage_complete_check",
    ]);
    // No stored row is changed: outside the function bodies, no data statement.
    const outsideBodies = migration.replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(outsideBodies).not.toMatch(/^\s*(insert|update|delete)\s/im);
  });
});
