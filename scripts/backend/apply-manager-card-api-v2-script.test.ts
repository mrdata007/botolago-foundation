import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts the Gradins read API of the Manager Card
 * (BG-0158, four migrations 20261009120000 to 20261009120300) on production,
 * after the five migrations of the 2026-10-08 script. Like the other apply
 * scripts, it records each migration file whole in the history and runs that
 * record only after its sha256 matches the repository file, so each file must
 * be carried byte for byte, once, in order, and the hash it checks must be the
 * file's. It must stay a rehearsal unless edited on purpose, refuse before
 * writing anything unless production is as reviewed (the five earlier
 * migrations recorded and unchanged, the Fantasy durable progression migration
 * 20261009091728 of PR #384 recorded so the migrations go in repository order,
 * none of the four recorded, reads off),
 * never switch anything or insert a rules row, and check the result afterwards.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const MIGRATIONS = [
  { version: "20261009120000", name: "manager_card_moment_acks" },
  { version: "20261009120100", name: "manager_card_read_helpers" },
  { version: "20261009120200", name: "manager_card_api_v2" },
  { version: "20261009120300", name: "manager_card_health" },
].map((m) => ({ ...m, text: read(`supabase/migrations/${m.version}_${m.name}.sql`) }));

const EARLIER = [
  "20261008123000",
  "20261008123100",
  "20261008123200",
  "20261008123300",
  "20261008123400",
];

const script = read("scripts/backend/apply-20261009120000-manager-card-api-v2.sql");
const previous = read("scripts/backend/apply-20261008123000-manager-card.sql");
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

describe("apply-20261009120000-manager-card-api-v2.sql", () => {
  for (const { version, name, text } of MIGRATIONS) {
    test(`carries ${version} byte for byte and checks it before running it`, () => {
      const tag = `$bg_${version}_file$`;
      expect(text).not.toContain(tag);
      expect(occurrences(script, text)).toBe(1);
      expect(script).toContain(`  '${version}',\n  '${name}',\n  array[${tag}${text}${tag}]`);
      expect(script).toContain(
        `if encode(sha256(convert_to(part_${version}, 'UTF8')), 'hex')\n    is distinct from '${sha256(text)}' then`,
      );
      expect(occurrences(script, `execute part_${version};`)).toBe(1);
    });
  }

  test("records and runs the four in order, checking every hash before the first execute", () => {
    const inserts = MIGRATIONS.map((m) => script.indexOf(`  '${m.version}',\n  '${m.name}',`));
    const executes = MIGRATIONS.map((m) => script.indexOf(`execute part_${m.version};`));
    const checks = MIGRATIONS.map((m) =>
      script.indexOf(`if encode(sha256(convert_to(part_${m.version}`),
    );
    for (const list of [inserts, executes, checks]) {
      expect(list.every((at) => at > 0)).toBe(true);
      expect([...list].sort((a, b) => a - b)).toEqual(list);
    }
    expect(Math.max(...inserts)).toBeLessThan(Math.min(...checks));
    expect(Math.max(...checks)).toBeLessThan(Math.min(...executes));
  });

  test("ships as a rehearsal: one begin, one rollback, no commit line outside comments", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    expect(code(script.slice(script.indexOf("$postflight$"))).match(/^\s*commit;\s*$/m)).toBeNull();
    expect(script).toContain("Rehearsal passed");
  });

  test("the header says when, how, what, and to check reads are off first", () => {
    const header = script.slice(0, script.indexOf("begin;"));
    for (const part of ["-- WHEN", "-- HOW TO RUN", "-- WHAT IT DOES", "-- BEFORE YOU RUN IT"]) {
      expect({ part, found: header.includes(part) }).toEqual({ part, found: true });
    }
    expect(header).toContain("select read_enabled from app_private.manager_card_settings;");
    expect(header).toContain("MANAGER_CARD_OPERATIONS_RUNBOOK.md");
    expect(header).toContain("minute 12");
  });

  test("the five earlier hashes in the preflight are those the 2026-10-08 script checks", () => {
    const preflight = script.slice(0, script.indexOf("insert into supabase_migrations"));
    for (const version of EARLIER) {
      const match = previous.match(
        new RegExp(
          `convert_to\\(part_${version}, 'UTF8'\\)\\), 'hex'\\)\\s+is distinct from '([0-9a-f]{64})'`,
        ),
      );
      expect(match).not.toBeNull();
      const hash = match![1];
      expect(hash).toBe(
        sha256(
          read(
            `supabase/migrations/${version}_${
              {
                "20261008123000": "manager_card_schema",
                "20261008123100": "manager_card_erase_lock",
                "20261008123200": "manager_card_compute",
                "20261008123300": "manager_card_api",
                "20261008123400": "manager_card_jobs",
              }[version]
            }.sql`,
          ),
        ),
      );
      expect(preflight).toContain(`version = '${version}'`);
      expect(preflight).toContain(`'${hash}'`);
    }
  });

  test("checks production is as reviewed before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "the five Manager Card migrations 20261008123000 to 20261008123400 are not all applied yet",
      "the Fantasy durable progression migration 20261009091728 is not applied yet",
      "a Gradins read API migration (20261009120000 to 20261009120300) is already recorded as applied",
      "is not the reviewed repository file",
      "the tables this builds on are missing",
      "the functions this builds on are missing",
      "app.manager_card_moment_acks already exists",
      "a function this creates already exists",
      "the Manager Card read switch is on",
      "if switches.read_enabled then",
      "'api.get_my_manager_card()'",
      "'api.get_manager_card(uuid)'",
      "'api.get_manager_cards(uuid[])'",
      "'api.get_my_manager_card_history(integer,integer)'",
      "'app_private.manager_card_json(uuid,uuid)'",
      "'app_private.manager_card_current_season(uuid)'",
      "'app_private.manager_card_minimum()'",
      "'app_private.manager_card_qualifies(integer,smallint)'",
      "'app_private.assert_mfa_step_up()'",
      "'app_private.refuse_unverified_mfa_actor()'",
      "'app_private.ops_health_checks()'",
      "'app_private.ops_health_checks_before_account_deletion()'",
      "'api.manager_card_status()'",
      "'api.ack_manager_card_moments(text[])'",
      "'app_private.ops_health_checks_before_manager_card()'",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
    for (const version of MIGRATIONS.map((m) => m.version)) {
      expect(script.slice(0, firstWrite)).toContain(`'${version}'`);
    }
    // No Fantasy pause is asked for: no Fantasy table is written.
    expect(code(script.slice(0, firstWrite))).not.toContain("lifecycle_tick_enabled");
  });

  test("requires the Fantasy durable progression migration (PR #384) first, in repository order", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    const message =
      "stop: the Fantasy durable progression migration 20261009091728 is not applied yet -- apply it first (scripts/backend/apply-fantasy-durable-progression.sql), so the migrations go in repository order";
    expect(occurrences(script, message)).toBe(1);
    const guard = script.indexOf(
      "if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261009091728') then",
    );
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(firstWrite);
    // The guard raises the message, right after it opens.
    expect(script.slice(guard, guard + 400)).toContain(`raise exception '${message}'`);
    // It sits in the preflight, after the five 2026-10-08 migrations are known to be there.
    expect(
      script.indexOf("the five Manager Card migrations 20261008123000 to 20261008123400"),
    ).toBeLessThan(guard);
    // The migration it names is a repository file, and the script it names applies it.
    expect(readdirSync(join(root, "supabase/migrations"))).toContain(
      "20261009091728_fantasy_durable_progression.sql",
    );
    expect(read("scripts/backend/apply-fantasy-durable-progression.sql")).toContain(
      "version='20261009091728'",
    );
    // Repository order: the migration named here comes before our health wrapper's.
    expect("20261009091728" < "20261009120300").toBe(true);
    // The header says so too.
    const header = script.slice(0, script.indexOf("begin;"));
    expect(header).toContain("20261009091728");
    expect(header).toContain("apply-fantasy-durable-progression.sql");
  });

  test("afterwards: grants, dropped functions, acks table, status, health, unchanged rows", () => {
    const afterwards = script.slice(script.indexOf("$postflight$"));
    for (const check of [
      "'api.manager_card_status()'",
      "'api.get_my_manager_card()'",
      "'api.get_manager_cards(uuid[])'",
      "'api.get_my_manager_card_history(uuid,integer,integer)'",
      "'api.ack_manager_card_moments(text[])'",
      "cannot run",
      "can run",
      "'public can run '",
      "exactly five Manager Card functions",
      "'api.get_manager_card(uuid)'",
      "'api.get_my_manager_card_history(integer,integer)'",
      "'app_private.manager_card_json(uuid,uuid)'",
      "'app_private.manager_card_current_season(uuid)'",
      "still exists",
      "row security is not forced on",
      "has a right on",
      "the acknowledgements guard trigger is missing",
      "manager_card_moment_acks_refuse_unverified_mfa_actor",
      "app.manager_card_moment_acks is not empty",
      `'{"enabled": false, "minRated": null, "minConfirmed": null}'::jsonb`,
      "the status answered",
      "app_private.ops_health_checks() -> 'checks'",
      "'manager_card'",
      "the manager_card health check is not the last check",
      "a Manager Card switch changed",
      "a Manager Card row count changed",
      "a history row is missing",
      "<> 9",
    ]) {
      expect({ check, present: afterwards.includes(check) }).toEqual({ check, present: true });
    }
    for (const version of [...EARLIER, ...MIGRATIONS.map((m) => m.version)]) {
      expect(afterwards).toContain(`'${version}'`);
    }
  });

  test("never switches anything, inserts a rules row or writes a card table", () => {
    const own =
      code(script.slice(0, script.indexOf("insert into supabase_migrations"))) +
      code(script.slice(script.indexOf("$postflight$")));
    expect(own).not.toMatch(/^\s*(perform|select)\s+app_private\.manager_card_configure\s*\(/im);
    expect(own).not.toMatch(/insert\s+into\s+app_private\.manager_card_rules/i);
    expect(own).not.toMatch(/update\s+app_private\.manager_card_settings/i);
    expect(own).not.toMatch(/(compute|read)_enabled\s*=\s*true/i);
    expect(own).not.toMatch(/(insert\s+into|update|delete\s+from)\s+app\.manager_card/i);
    for (const { text } of MIGRATIONS) {
      expect(code(text)).not.toMatch(/select\s+app_private\.manager_card_configure\s*\(/i);
      expect(code(text)).not.toMatch(/insert\s+into\s+app_private\.manager_card_rules/i);
      expect(code(text)).not.toMatch(/(compute|read)_enabled\s*=\s*true/i);
    }
  });
});
