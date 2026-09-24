import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The two guarded scripts that apply PR #194's migrations to production:
 * `apply-20260924180000-news-club-tagging.sql` (the tagger and the feed fix,
 * one transaction) and `apply-20260924180200-news-club-tagging-backfill.sql`
 * (the existing stories, a transaction of its own).
 *
 * Each carries its migration files once, as the history row's statements[1],
 * and runs them from that row after checking its sha256. So the scripts must
 * keep carrying the files byte for byte, the sha256 they check must be the
 * files', and they must stay rehearsals unless someone edits them on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const scripts = [
  {
    path: "scripts/backend/apply-20260924180000-news-club-tagging.sql",
    migrations: [
      { version: "20260924180000", name: "news_story_team_tagging" },
      { version: "20260924180100", name: "news_feed_filters_first" },
    ],
    guards: [
      "set local lock_timeout = '5s';",
      "set local statement_timeout = '60s';",
      "migration 20260924180000 or 20260924180100 is already recorded as applied",
      "app_private.news_team_aliases already exists",
      "app.story_teams.tagged_by already exists",
      "api.news_feed is not the version this update replaces",
      "expected the 21 clubs of the alias list",
    ],
  },
  {
    path: "scripts/backend/apply-20260924180200-news-club-tagging-backfill.sql",
    migrations: [{ version: "20260924180200", name: "news_story_team_backfill" }],
    guards: [
      "set local lock_timeout = '5s';",
      "set local statement_timeout = '300s';",
      "migration 20260924180200 is already recorded as applied",
      "run apply-20260924180000-news-club-tagging.sql (and commit it) first",
      "the tagger or its 21 clubs are missing",
    ],
  },
];

describe("the migrations production recorded", () => {
  // statements[1] of production's history rows, read back after the scripts
  // ran on 2026-09-24 (docs/production/APPLIED_2026_09_24_NEWS_CLUB_TAGGING.md).
  // These files are applied: a change to them is a new migration.
  for (const [file, recorded] of [
    [
      "20260924180000_news_story_team_tagging.sql",
      "9951d07eae04d9a5151e6fb99f6cfd96d2277432413fa882c345f97a220f3abd",
    ],
    [
      "20260924180100_news_feed_filters_first.sql",
      "97d34f464834ee0e34a05e7ec207b731d7703a477d23ec06cb3d06c7a48f35f8",
    ],
    [
      "20260924180200_news_story_team_backfill.sql",
      "33da33e73de411f87b060cf53494447766f09f81920fe6ce1d03ea21b7443b22",
    ],
  ]) {
    test(file, () => {
      expect(sha256(read(`supabase/migrations/${file}`))).toBe(recorded);
    });
  }
});

for (const { path, migrations, guards } of scripts) {
  const script = read(path);

  describe(path, () => {
    for (const { version, name } of migrations) {
      const migration = read(`supabase/migrations/${version}_${name}.sql`);
      const tag = `$bg_${version}_file$`;

      test(`carries ${version} verbatim, once, as the history row it records`, () => {
        expect(migration).not.toContain(tag);
        expect(occurrences(script, migration)).toBe(1);
        expect(script).toContain(
          `'${version}',\n  '${name}',\n  array[${tag}${migration}${tag}]\n);`,
        );
      });

      test(`runs ${version} only once its sha256 is the file's`, () => {
        expect(occurrences(script, `is distinct from '${sha256(migration)}' then`)).toBe(1);
        expect(script).toContain(`raise exception 'stop: ${version} is not the repository file`);
      });
    }

    test("runs the recorded copies after checking them all", () => {
      const lastCheck = script.lastIndexOf("is not the repository file byte for byte");
      const firstExecute = script.indexOf("  execute ");
      expect(lastCheck).toBeGreaterThan(-1);
      expect(firstExecute).toBeGreaterThan(lastCheck);
      for (const { version } of migrations) {
        expect(script.indexOf(`'${version}',\n`)).toBeLessThan(firstExecute);
      }
    });

    test("ships as a rehearsal: one rollback, no commit", () => {
      const lines = script.split("\n").map((line) => line.trim());
      expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
      expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    });

    test("refuses to run twice or out of order, and bounds its locks, before writing anything", () => {
      const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
      expect(firstWrite).toBeGreaterThan(-1);
      for (const guard of guards) {
        const at = script.indexOf(guard);
        expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
        expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
          guard,
          beforeFirstWrite: true,
        });
      }
    });
  });
}
