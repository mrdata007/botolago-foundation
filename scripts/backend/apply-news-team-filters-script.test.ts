import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260926130000 (the News club filters stop at
 * each club's first public story) on production. Like the other apply
 * scripts, it records the migration file whole in the history and runs that
 * record only after its sha256 matches the repository file, so the file must
 * be carried byte for byte, once, and the hash it checks must be the file's.
 * It must stay a rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260926130000";
const NAME = "news_team_filters_first_public";
const script = read(`scripts/backend/apply-${VERSION}-news-team-filters.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-news-team-filters.sql`, () => {
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
      // What production held on 2026-09-26, read there.
      "    <> '14622460d141cd263cbdb6a11892f0d9' then",
      "    <> 'd8f9fe167f75fb1a8fb9c68794c0312b' then",
      "lock table app.article_editions, app.stories, app.story_teams, app.teams, app.publishers\n  in share mode;",
      "md5(api.news_team_filters('fr')::text)",
      "md5(api.news_team_filters('ar')::text)",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: new version, still callable, fast, and the same answers", () => {
    for (const check of [
      "the club filters are not the new stop-early version",
      "visitors can no longer call the club filters",
      "if took_ms >= 200 then",
      "answer differs from the old one",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });
});
