import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925120000 (goals conceded checked against
 * the final score, now that an absent SportsMonks statistic counts as zero)
 * on production. It records the migration file whole in the history and runs
 * that record only after its sha256 matches the repository file, so the file
 * must be carried byte for byte, once. It must stay a rehearsal unless edited
 * on purpose, hold the statistics tables first, and refuse while the Fantasy
 * tick is on.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925120000";
const NAME = "current_performance_goals_conceded_check";
const script = read(`scripts/backend/apply-${VERSION}-current-performance-goals-conceded.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-current-performance-goals-conceded.sql`, () => {
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

  test("holds the statistics tables first, then checks production is as reviewed", () => {
    const hold = script.indexOf(
      "  lock table app_private.historical_performance_fixture_coverage in access exclusive mode;\n" +
        "  lock table app.player_fixture_performances in share row exclusive mode;\n" +
        "exception when lock_not_available then",
    );
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(hold).toBeGreaterThan(script.indexOf("set local lock_timeout = '5s';"));
    expect(hold).toBeLessThan(script.indexOf("do $preflight$"));
    for (const guard of [
      `migration ${VERSION} is already recorded as applied`,
      "migration 20260925110000 (the unnamed-starter rule) is not applied",
      "where lifecycle_tick_enabled) then",
      // Production's version on 2026-09-25 after 20260925110000, measured there.
      "  )) <> '9b0c8142476872f853e06ce730fa68f8' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("the migration changes only the statistics import, adding the score check", () => {
    expect(migration.match(/^create or replace function [\w.]+/gm)).toEqual([
      "create or replace function api.ingest_current_player_fixture_performance",
    ]);
    expect(migration).toContain("message = 'CURRENT_GOALS_CONCEDED_INCOMPLETE'");
    const outsideBodies = migration.replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(outsideBodies).not.toMatch(/^\s*(insert|update|delete|alter)\s/im);
  });

  test("the new import is 20260925110000's plus the score check, nothing else", () => {
    const body = (text: string) => {
      const start = text.indexOf(
        "create or replace function api.ingest_current_player_fixture_performance(",
      );
      return text.slice(start, text.indexOf("\n$$;", start) + 4);
    };
    const before = body(
      read("supabase/migrations/20260925110000_current_performance_unnamed_starters.sql"),
    );
    const after = body(migration);
    const added = after.slice(
      after.indexOf("  -- SportsMonks sends a statistic only when it is not zero"),
      after.indexOf(
        "  -- Compute the immutable version from the actual normalized payload in SQL.",
      ),
    );
    expect(added).toContain("CURRENT_GOALS_CONCEDED_INCOMPLETE");
    expect(after.replace(added, "")).toBe(before);
  });
});
