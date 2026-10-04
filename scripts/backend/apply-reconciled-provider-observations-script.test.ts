import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261003180000 (reconciled provider
 * observations, roadmap step 1) on production. It carries the migration byte for byte, once, runs
 * it only after its sha256 matches, ships as a rehearsal, holds the gameweeks
 * first and checks production is as reviewed before its first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261003180000";
const NAME = "reconciled_provider_observations";
const script = read(`scripts/backend/apply-${VERSION}-reconciled-provider-observations.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-reconciled-provider-observations.sql`, () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = `$bg_${VERSION}_file$`;
    expect(migration).not.toContain(tag);
    expect(occurrences(script, migration)).toBe(1);
    expect(script).toContain(`  '${VERSION}',\n  '${NAME}',\n  array[${tag}${migration}${tag}]`);
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

  test("holds the observations table first, then checks production before its first write", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(
      script.indexOf(
        "  lock table app_private.fantasy_fixture_observations in access exclusive mode;",
      ),
    ).toBeLessThan(script.indexOf("do $preflight$"));
    for (const guard of [
      `migration ${VERSION} is already recorded as applied`,
      "where lifecycle_tick_enabled) then",
      "if exists (select 1 from cron.job_run_details run",
      "or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then",
      "already exists';",
      // Production's recorder on 2026-10-04, measured there and locally.
      "      <> '0e4852a0a3c35bc3332ebd891d2cdf8e' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
    // The result is checked against the definition a local database builds.
    expect(script).toContain("<> 'd5c60fc1a8b42f23e91c0db5e321a26d' then");
    expect(script).toContain("<> '06104038065b147d0573bbc68f23cfe0' then");
  });

  test("the migration adds the source, the links table and a service-only wrapper", () => {
    expect(migration).toContain(
      "check (source in ('sportsmonks', 'reviewed-correction', 'provider-reconciled'));",
    );
    expect(migration).toContain("create table app_private.football_provider_fixture_links (");
    expect(migration).toContain(
      "grant execute on function api.service_record_reconciled_fantasy_observation(uuid, jsonb, boolean) to service_role;",
    );
  });
});
