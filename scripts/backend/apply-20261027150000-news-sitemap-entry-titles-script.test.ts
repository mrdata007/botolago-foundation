import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261027150000 (each sitemap entry carries its
 * edition's title, for the Google News sitemap) on production. Like the other
 * apply scripts, it records the migration file whole in the history and runs
 * that record only after its sha256 matches the repository file, so the file
 * must be carried byte for byte, once, and the hash it checks must be the
 * file's. It must stay a rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261027150000";
const NAME = "news_sitemap_entry_titles";
const script = read(`scripts/backend/apply-${VERSION}-news-sitemap-entry-titles.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-news-sitemap-entry-titles.sql`, () => {
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
      "set local timezone = 'UTC';",
      `migration ${VERSION} is already recorded as applied`,
      "migration 20260926003050 (the sitemap snapshot) is not applied",
      // news_sitemap_compute as production held it on 2026-10-27, read there.
      "    is distinct from '89225b852b1e37726a12d49aff9d512d' then",
    ]) {
      const at = script.indexOf(guard);
      expect(`${guard}: ${at > 0 && at < firstWrite}`).toBe(`${guard}: true`);
    }
  });

  test("its postflight pins the new entry shape and the unchanged entries", () => {
    expect(script).toContain(
      "array['contentUpdatedAt', 'id', 'language', 'publishedAt', 'slug', 'title', 'translations', 'updatedAt']",
    );
    expect(script).toContain("jsonb_agg(entry - 'title' order by ordinality)");
    expect(script).toContain("current_setting('botolago.sitemap_before', true)");
  });
});
