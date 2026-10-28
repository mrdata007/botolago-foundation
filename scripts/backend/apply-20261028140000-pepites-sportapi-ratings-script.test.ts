import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261028140000 (Pépites ranks this season's
 * players from SportAPI's ratings) on production. Like the other apply
 * scripts, it records the migration file whole in the history and runs that
 * record only after its sha256 matches the repository file, so the file must
 * be carried byte for byte, once, and the hash it checks must be the file's.
 * It must stay a rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261028140000";
const NAME = "pepites_sportapi_ratings";
const script = read(`scripts/backend/apply-${VERSION}-pepites-sportapi-ratings.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-pepites-sportapi-ratings.sql`, () => {
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

  test("checks production is as reviewed, and holds the tick's lock, before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "set local timezone = 'UTC';",
      `migration ${VERSION} is already recorded as applied`,
      "migration 20260926212632 (Pépites frozen stats) is not applied",
      // pepites_source_appearances as production held it on 2026-10-28, read there.
      "    is distinct from '4a6a9066e1c45684c5a7e647e9aac14a' then",
      "pg_try_advisory_xact_lock(pg_catalog.hashtextextended('pepites_tick', 0))",
    ]) {
      const at = script.indexOf(guard);
      expect(`${guard}: ${at > 0 && at < firstWrite}`).toBe(`${guard}: true`);
    }
  });

  test("its postflight pins the 2025-26 final ranking's inputs and one row per player and match", () => {
    expect(script).toContain("current_setting('botolago.pepites_final_before', true)");
    expect(script).toContain("count(distinct (a.player_id, a.fixture_id))");
    expect(script).toContain("~ 'fantasy_api_rating_sources'");
  });
});
