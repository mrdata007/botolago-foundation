import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260926140000 (Fantasy "selected by" from a
 * 5-minute snapshot) on production. Like the other apply scripts, it records
 * the migration file whole in the history and runs that record only after its
 * sha256 matches the repository file, so the file must be carried byte for
 * byte, once, and the hash it checks must be the file's. It must stay a
 * rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260926140000";
const NAME = "fantasy_ownership_snapshot";
const script = read(`scripts/backend/apply-${VERSION}-fantasy-ownership-snapshot.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-fantasy-ownership-snapshot.sql`, () => {
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

  test("checks production is as reviewed, and keeps the old answers, before writing", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "the ownership snapshot, its refresh or its jobs already exist",
      // What production held on 2026-09-26, read there.
      "    <> '9f9a4ac0d3e8760c7781ac315fb1b903' then",
      "lock table app.fantasy_squad_memberships, app.fantasy_teams in share mode;",
      "md5(api.fantasy_player_season_stats(fantasy_season.id)::text) as before_md5",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: snapshot used, jobs on, private, callable, and the same answers", () => {
    for (const check of [
      "the season stats do not read the ownership snapshot",
      "visitors can no longer call the season stats",
      "the snapshot or its refresh is reachable from the API",
      "the refresh jobs are not scheduled as expected",
      "differs from the old one",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });
});
