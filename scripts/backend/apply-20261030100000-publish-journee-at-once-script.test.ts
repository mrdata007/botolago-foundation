import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261030100000 .. 20261030100300 (a Fantasy
 * journée's points are published all at once, from Journée 6) on production.
 * Like the other apply scripts, it records each migration file whole in the
 * history and runs that record only after its sha256 matches the repository
 * file, so every file must be carried byte for byte, once, in order, and the
 * hash it checks must be the file's. It must stay a rehearsal unless edited on
 * purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const MIGRATIONS = [
  ["20261030100000", "fantasy_publication_gate"],
  ["20261030100100", "selection_close_accepts_moved_match"],
  ["20261030100200", "rating_poll_mark_24h30"],
  ["20261030100300", "ops_health_publication"],
] as const;
const script = read("scripts/backend/apply-20261030100000-publish-journee-at-once.sql");

describe("apply-20261030100000-publish-journee-at-once.sql", () => {
  for (const [version, name] of MIGRATIONS) {
    test(`carries ${version} byte for byte and checks it before running it`, () => {
      const migration = read(`supabase/migrations/${version}_${name}.sql`);
      const tag = `$bg_${version}_file$`;
      expect(migration).not.toContain(tag);
      expect(occurrences(script, migration)).toBe(1);
      expect(script).toContain(`array[${tag}${migration}${tag}]`);
      expect(script).toContain(`  '${version}',\n  '${name}',\n  array[${tag}`);
      expect(script).toContain(
        `if encode(sha256(convert_to(part_${version}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
      );
      expect(occurrences(script, `execute part_${version};`)).toBe(1);
    });
  }

  test("runs the migrations in order", () => {
    const at = MIGRATIONS.map(([version]) => script.indexOf(`execute part_${version};`));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("checks production is as reviewed, and holds the writers, before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "set local timezone = 'UTC';",
      "one of these migrations is already recorded as applied",
      "migration 20261028140000 (the latest on main) is not applied",
      "the Morocco clock helpers (20261016090000) are not installed",
      "the publication gate already exists",
      // The bodies production held on 2026-10-30 (the repository migrations' result).
      "    is distinct from '4a087788345c2eb22f486c57526f1c8a' then",
      "    is distinct from 'a8ff68656a09cf6a52c30197f42c6cc8' then",
      "    is distinct from 'ac72c2f5bc7b1d69ac68d4aea79bfe32' then",
      "    is distinct from '3970fa1249c8cfa72c03701206aaa4e9' then",
      "    is distinct from 'ca709021ea02c00c08d4f35a78f5fb7f' then",
      "select app_private.hold_scheduled_jobs();",
      "lock table app_private.fantasy_worker_lease in exclusive mode;",
      "a Fantasy worker pass holds its lease",
      "an HTTP request is still queued",
    ]) {
      const at = script.indexOf(guard);
      expect(`${guard}: ${at > 0 && at < firstWrite}`).toBe(`${guard}: true`);
    }
  });

  test("pins every function it replaces or wraps", () => {
    for (const signature of [
      "app_private.fantasy_api_rating_candidates()",
      "api.service_begin_fantasy_selection_close(uuid,bigint)",
      "api.service_fantasy_lifecycle_state(uuid)",
      "api.service_prepare_fantasy_live_scoring(uuid)",
      "api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)",
      "api.service_begin_fantasy_finalization(uuid,bigint,text)",
      "api.service_recalculate_fantasy_rankings(uuid,uuid,uuid,bigint)",
      "api.get_my_fantasy_points(uuid,uuid)",
      "api.fantasy_gameweek_summary(uuid)",
      "api.fantasy_gameweeks(uuid,integer,integer)",
      "app_private.ops_health_checks()",
      "app_private.ops_health_checks_before_adaptive()",
      "app_private.fantasy_fixture_health_ready(uuid,uuid,boolean)",
      "app_private.fantasy_fixture_full_stats(uuid,uuid,boolean)",
    ])
      expect(script).toContain(
        `if md5((select prosrc from pg_proc where oid = '${signature}'::regprocedure))`,
      );
  });

  test("its postflight checks the earlier journées, the fan views, the grants and the poll mark", () => {
    for (const check of [
      "a journée before 6 is gated",
      "the fan view of team results changed",
      "the lifecycle state of the latest journée before 6 changed",
      "the gameweek list changed beyond its two new keys",
      "the health checks changed",
      "api.service_evaluate_fantasy_publication is not service-role only",
      "the rating poll schedule lacks the 24 h 30 min mark",
      "the publication slot does not follow the application''s Morocco clock",
    ])
      expect(script).toContain(check);
  });
});
