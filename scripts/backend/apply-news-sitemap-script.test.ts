import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925100000 (the set-based sitemap, again)
 * on production. Like the other apply scripts, it records the migration file
 * whole in the history and runs that record only after its sha256 matches the
 * repository file, so the file must be carried byte for byte, once, and the
 * hash it checks must be the file's. It must stay a rehearsal unless edited on
 * purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925100000";
const NAME = "news_sitemap_set_based_again";
const script = read(`scripts/backend/apply-${VERSION}-news-sitemap.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-news-sitemap.sql`, () => {
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
      "migration 20260924200600 (truthful article dates) is not applied yet",
      // The version production held on 2026-09-25 (20260924200600), measured there.
      "    <> '66e94c912098137d30f7fd67f9555144' then",
      // No other News writer (the every-minute publisher, the CMS, an import)
      // until it ends: AGENTS.md, one writer at a time.
      "lock table app.article_editions, app.article_revisions, app.stories, app.publishers\n  in share mode;",
      // The old answer, kept to compare with the new one.
      "md5(api.news_sitemap_entries(49990)::text),",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("holds News writes before it takes the old answer", () => {
    const hold = script.indexOf("in share mode;");
    const baseline = script.indexOf("md5(api.news_sitemap_entries(49990)::text),");
    expect(hold).toBeGreaterThan(0);
    expect(hold).toBeLessThan(baseline);
  });

  test("afterwards: set-based, still public, fast, and the same answer", () => {
    expect(script).toContain("the sitemap is not the new set-based version");
    expect(script).toContain("visitors can no longer call the sitemap");
    expect(script).toContain("if took_ms >= 2000 then");
    expect(script).toContain(
      "if md5(answer) is distinct from current_setting('botolago.sitemap_before', true) then",
    );
  });
});
