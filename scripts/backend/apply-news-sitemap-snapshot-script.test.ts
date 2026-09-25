import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925180050 (the sitemap served from a
 * snapshot) on production, after 20260925100000. Like the other apply
 * scripts, it records the migration file whole in the history and runs that
 * record only after its sha256 matches the repository file, so the file must
 * be carried byte for byte, once, and the hash it checks must be the file's.
 * It must stay a rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925180050";
const NAME = "news_sitemap_snapshot";
const script = read(`scripts/backend/apply-${VERSION}-news-sitemap-snapshot.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-news-sitemap-snapshot.sql`, () => {
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
      "migration 20260925100000 (the set-based sitemap) is not applied yet",
      "the sitemap snapshot, its refresh or its jobs already exist",
      // What production held on 2026-09-25, read there: the sitemap as
      // 20260925100000 left it, the health checks this extends, and the
      // eligibility helpers whose rules the new computation repeats.
      "    <> '189f5f7b118288532e97d7a6f2829a17' then",
      "    <> 'db2e18de8f09acf2bba050302eb8d6ca' then",
      "      <> 'd8f9fe167f75fb1a8fb9c68794c0312b'",
      "      <> 'fe92e0c1b4bdd8a0014223180de2f200'",
      "      <> '7f415dee75c3c3525296535d6cc37ecc' then",
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

  test("afterwards: snapshot served, jobs on, healthy, private, fast, and the same answer", () => {
    for (const check of [
      "the sitemap is not the new snapshot-serving, set-based version",
      "visitors can no longer call the sitemap",
      "the snapshot, its refresh or its computation is reachable from the API",
      "no snapshot was written",
      "the refresh jobs are not scheduled as expected",
      "the health check news_sitemap is not ok: ",
      "if took_ms >= 500 then",
      "if md5(answer) is distinct from current_setting('botolago.sitemap_before', true) then",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });
});
