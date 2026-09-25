import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The two guarded scripts for this season's player list. The first puts
 * 20260925200000 on production: it records the migration file whole in the
 * history and runs that record only after its sha256 matches the repository
 * file. The second applies a reviewed plan, only while the Fantasy tick is
 * paused. Both must stay rehearsals unless edited on purpose, and check before
 * their first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const rehearsalOnly = (script: string) => {
  const lines = script.split("\n").map((line) => line.trim());
  expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
  expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
  expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
};

const VERSION = "20260925200000";
const NAME = "current_player_list_update";
const migrationScript = read(`scripts/backend/apply-${VERSION}-current-player-list-update.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const planScript = read("scripts/backend/apply-current-player-list.sql");

describe(`apply-${VERSION}-current-player-list-update.sql`, () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = `$bg_${VERSION}_file$`;
    expect(migration).not.toContain(tag);
    expect(occurrences(migrationScript, migration)).toBe(1);
    expect(migrationScript).toContain(`array[${tag}${migration}${tag}]`);
    expect(migrationScript).toContain(`  '${VERSION}',\n  '${NAME}',\n  array[${tag}`);
    expect(migrationScript).toContain(
      `if encode(sha256(convert_to(part_${VERSION}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
    );
    expect(occurrences(migrationScript, `execute part_${VERSION};`)).toBe(1);
  });

  test("ships as a rehearsal", () => rehearsalOnly(migrationScript));

  test("checks production before its first write, and the result after", () => {
    const firstWrite = migrationScript.indexOf("insert into supabase_migrations.schema_migrations");
    // Every scheduled job is held off before anything is checked or written.
    const hold = migrationScript.indexOf(
      "  lock table cron.job_run_details in exclusive mode;\nexception when lock_not_available then",
    );
    expect(hold).toBeGreaterThan(migrationScript.indexOf("set local lock_timeout = '5s';"));
    expect(hold).toBeLessThan(migrationScript.indexOf("do $preflight$"));
    for (const guard of [
      `migration ${VERSION} is already recorded as applied`,
      "migration 20260925120000 is not applied",
      "something this migration creates already exists",
      "the database is missing something this migration relies on",
      "if exists (select 1 from cron.job_run_details run\n    where run.status not in ('succeeded', 'failed')) then",
    ]) {
      const at = migrationScript.indexOf(guard);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(firstWrite);
    }
    const postflight = migrationScript.indexOf("do $postflight$");
    expect(postflight).toBeGreaterThan(migrationScript.indexOf(`execute part_${VERSION};`));
    for (const check of [
      "is readable from outside",
      "is callable by the wrong roles",
      "is callable from outside",
      "names are not compared without accents",
      "history row missing",
    ])
      expect(migrationScript.indexOf(check)).toBeGreaterThan(postflight);
  });
});

describe("apply-current-player-list.sql", () => {
  test("ships as a rehearsal, with the plan to fill in once, before the transaction", () => {
    rehearsalOnly(planScript);
    const fill =
      "select set_config('botolago.player_list_observation', 'PASTE-OBSERVATION-ID', false),\n" +
      "  set_config('botolago.player_list_digest', 'PASTE-PLAN-DIGEST', false);";
    expect(occurrences(planScript, "PASTE-OBSERVATION-ID")).toBe(2);
    expect(planScript.indexOf(fill)).toBeGreaterThan(-1);
    expect(planScript.indexOf(fill)).toBeLessThan(planScript.indexOf("\nbegin;\n"));
    // The result row reports the observation filled in, after rollback or commit.
    expect(planScript.indexOf("rollback;")).toBeLessThan(
      planScript.indexOf(
        "where observation.id::text = current_setting('botolago.player_list_observation');",
      ),
    );
  });

  test("checks the plan, the tick and the scheduled jobs before it applies", () => {
    const apply = planScript.indexOf(
      "select api.service_apply_current_player_list(observation_id::uuid, plan_digest)",
    );
    expect(occurrences(planScript, "api.service_apply_current_player_list(")).toBe(1);
    for (const guard of [
      "fill in the plan''s observationId and digest first",
      "migration 20260925200000 is not applied",
      "where lifecycle_tick_enabled) then",
      "if exists (select 1 from cron.job_run_details run",
    ]) {
      const at = planScript.indexOf(guard);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(apply);
    }
    expect(
      planScript.indexOf("the observation still plans changes after the update"),
    ).toBeGreaterThan(apply);
  });
});
