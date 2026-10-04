import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The two owner-run scripts of roadmap step 5: one installs
 * app_private.fantasy_open_missed_gameweek (migration 20261004150000), the
 * other uses it once for GW2. Both ship as rehearsals.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261004150000";
const NAME = "fantasy_open_missed_gameweek";
const install = read(`scripts/backend/apply-${VERSION}-fantasy-open-missed-gameweek.sql`);
const use = read("scripts/backend/open-missed-fantasy-gameweek.sql");
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

const shipsAsRehearsal = (script: string) => {
  const lines = script.split("\n").map((line) => line.trim());
  expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
  expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
  expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
};

describe(`apply-${VERSION}-fantasy-open-missed-gameweek.sql`, () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = `$bg_${VERSION}_file$`;
    expect(migration).not.toContain(tag);
    expect(occurrences(install, migration)).toBe(1);
    expect(install).toContain(`  '${VERSION}',\n  '${NAME}',\n  array[${tag}${migration}${tag}]`);
    expect(install).toContain(
      `if encode(sha256(convert_to(part_${VERSION}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
    );
    expect(occurrences(install, `execute part_${VERSION};`)).toBe(1);
  });

  test("ships as a rehearsal", () => shipsAsRehearsal(install));

  test("checks production before its first write, and that no API role can call the tool", () => {
    const firstWrite = install.indexOf("insert into supabase_migrations.schema_migrations");
    for (const guard of [
      `migration ${VERSION} is already recorded as applied`,
      "where lifecycle_tick_enabled) then",
      "or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then",
      "app_private.fantasy_open_missed_gameweek already exists",
    ]) {
      const at = install.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
    expect(install).toContain("or has_function_privilege('service_role', tool, 'execute') then");
  });
});

describe("the migration", () => {
  test("adds one owner-only function and changes nothing else", () => {
    expect(occurrences(migration, "create function ")).toBe(1);
    expect(migration).not.toMatch(/create or replace|alter (table|function)|drop /i);
    expect(migration).toContain(
      "revoke all on function app_private.fantasy_open_missed_gameweek(uuid, uuid, bigint, text)\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).not.toMatch(/^grant /im);
  });

  test("runs only for a deadline that has passed, one writer at a time", () => {
    expect(migration).toContain("if next_week.deadline_at > statement_timestamp() then");
    expect(migration).toContain("message = 'fantasy_tick_must_be_paused'");
    expect(migration).toContain("perform app_private.hold_scheduled_jobs();");
  });
});

describe("open-missed-fantasy-gameweek.sql", () => {
  test("ships as a rehearsal", () => shipsAsRehearsal(use));

  test("opens GW2 from GW1 at GW1's final calculation version, once", () => {
    expect(use).toContain("previous_id constant uuid := '7fcb28c5-9b69-4591-bcda-437c6c961c5c';");
    expect(use).toContain("next_id constant uuid := 'd4324127-ce55-4943-973f-4cf2f9a12780';");
    expect(use).toContain("calculation constant bigint := 20;");
    expect(occurrences(use, "app_private.fantasy_open_missed_gameweek(")).toBe(1);
  });

  test("a repeat after the lifecycle moved the gameweek on still checks out", () => {
    expect(use).toContain(
      "not in ('open', 'locked', 'live', 'provisional', 'finalizing', 'finalized')",
    );
    expect(use).not.toMatch(/where id = next_id\) <> 'open'/);
  });

  test("tells the operator to put back what was paused", () => {
    expect(use).toContain("select app_private.fantasy_automation_configure(true);");
    expect(use).toContain("app_private.notification_email_configure(<mode>, null, null, true);");
  });
});
