import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner-run production install of the Manager Card "week one" ruleset (rules v3), its
 * notification type and its migration. Both run as postgres against production, so what they
 * must never do is pinned here: they execute only the reviewed migration bytes, replace only the
 * reviewed function bodies, require the writers paused, ship as rehearsals that end in rollback,
 * switch nothing on, and the v3 config carries exactly the intended differences from v2.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** The text between the first $$ after `signature` and the $$; that closes it (pg_proc.prosrc). */
function bodyOf(source: string, signature: string): string {
  const at = source.indexOf(signature);
  expect(at).toBeGreaterThan(-1);
  const start = source.indexOf("$$", at) + 2;
  return source.slice(start, source.indexOf("$$;", start));
}
const configIn = (sql: string, tag: string) => {
  const match = sql.match(new RegExp(`\\$${tag}\\$(\\{[\\s\\S]*?\\})\\$${tag}\\$`));
  expect(match).not.toBeNull();
  return JSON.parse(match![1]) as Record<string, unknown>;
};

const script = read("scripts/backend/apply-manager-card-rules-v3-week-one.sql");
const typeScript = read("scripts/backend/apply-20261012200000-manager-card-ovr-change-type.sql");
const migration = read("supabase/migrations/20261012200100_manager_card_week_one.sql");
const typeMigration = read("supabase/migrations/20261012200000_manager_card_ovr_change_type.sql");
const v2Migration = read(
  "supabase/migrations/20261012170000_manager_card_shrinkage_and_selection.sql",
);
const apiV2 = read("supabase/migrations/20261010120200_manager_card_api_v2.sql");
const push = read("supabase/migrations/20261005135000_push_remaining_alerts.sql");
const v2Script = read("scripts/backend/apply-manager-card-rules-v2-calm.sql");

const preflight = script.slice(0, script.indexOf("$preflight$;"));
const verify = script.slice(script.indexOf("do $verify$"), script.indexOf("end $verify$;"));

describe("production install of the manager_card_ovr_change type", () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = "$bg_20261012200000_file$";
    expect(typeMigration).not.toContain(tag);
    expect(occurrences(typeScript, typeMigration)).toBe(1);
    expect(typeScript).toContain(`array[${tag}${typeMigration}${tag}]`);
    expect(typeScript).toContain(
      `if encode(sha256(convert_to(part_20261012200000, 'UTF8')), 'hex')\n    is distinct from '${sha256(typeMigration)}' then`,
    );
    expect(occurrences(typeScript, "execute part_20261012200000;")).toBe(1);
  });

  test("ships as a rehearsal and refuses to run twice", () => {
    const lines = typeScript.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    expect(typeScript).toContain("migration 20261012200000 is already recorded as applied");
    expect(typeScript).toContain("already has the value manager_card_ovr_change");
  });

  test("the type migration only adds the one value", () => {
    const code = typeMigration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--") && line.trim() !== "")
      .join("\n");
    expect(code).toBe(
      "alter type app.notification_type add value if not exists 'manager_card_ovr_change';",
    );
  });
});

describe("production install of rules v3 (week one)", () => {
  test("pins the exact reviewed migration bytes before executing them", () => {
    expect(script.split("$migration$")[1]).toBe(migration);
    expect(migration).not.toContain("$migration$");
    const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(sha256(migration));
    expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      script.indexOf("execute source;"),
    );
    expect(script).toContain("values ('20261012200100', 'manager_card_week_one'");
  });

  test("checks each replaced function is the reviewed one before, and each body after", () => {
    const before = [
      bodyOf(v2Migration, "create or replace function app_private.manager_card_evaluate_gameweek("),
      bodyOf(apiV2, "create or replace function api.get_my_manager_card("),
      bodyOf(apiV2, "create function api.ack_manager_card_moments("),
      bodyOf(push, "create or replace function app_private.notification_push_topic("),
      bodyOf(push, "create or replace function app_private.notification_push_ttl("),
    ];
    const after = [
      "create or replace function app_private.manager_card_evaluate_gameweek(",
      "create function app_private.manager_card_notify_ovr_changes(",
      "create function app_private.manager_card_ovr_moments(",
      "create function app_private.manager_card_notify_configure(",
      "create or replace function api.get_my_manager_card(",
      "create or replace function api.ack_manager_card_moments(",
      "create or replace function app_private.notification_push_topic(",
      "create or replace function app_private.notification_push_ttl(",
    ].map((signature) => bodyOf(migration, signature));
    for (const body of before) {
      expect(preflight).toContain(md5(body));
      expect(verify).not.toContain(md5(body));
    }
    for (const body of after) {
      expect(verify).toContain(md5(body));
      expect(preflight).not.toContain(md5(body));
    }
    // The v2 script's own "after" pin is this script's "before" pin: they chain.
    expect(v2Script).toContain(md5(before[0]!));
  });

  test("replaces exactly the reviewed functions and nothing else", () => {
    expect(migration.match(/create or replace function ([\w.]+)\(/g)).toEqual([
      "create or replace function app_private.notification_push_topic(",
      "create or replace function app_private.notification_push_ttl(",
      "create or replace function app_private.manager_card_evaluate_gameweek(",
      "create or replace function api.get_my_manager_card(",
      "create or replace function api.ack_manager_card_moments(",
    ]);
    expect(migration.match(/create function ([\w.]+)\(/g)).toEqual([
      "create function app_private.manager_card_notify_configure(",
      "create function app_private.manager_card_notify_ovr_changes(",
      "create function app_private.manager_card_ovr_moments(",
    ]);
    expect(migration.match(/create table ([\w.]+)/g)).toEqual([
      "create table app.manager_card_ovr_changes",
    ]);
    // Only its own temporary table is dropped.
    expect(migration).not.toMatch(/\bdrop\s+(table|function)\s+(?!pg_temp\.mc_chg\b)/i);
  });

  test("requires the writers paused and drained, push off, and the card lock", () => {
    for (const guard of [
      "compute is switched on -- pause it first",
      "the manager-card-tick job is active",
      "a manager-card-tick run is still in progress",
      "a statement mentioning the Manager Card is running",
      "push is switched on",
      "pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0))",
      "the notification type manager_card_ovr_change is not saved",
      "are not all recorded -- run apply-manager-card-rules-v2-calm.sql first",
    ]) {
      expect({ guard, beforeApply: preflight.includes(guard) }).toEqual({
        guard,
        beforeApply: true,
      });
    }
    const statements = script
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    expect(statements).not.toMatch(/manager_card_configure\(\s*true/);
    expect(statements).not.toMatch(/manager_card_notify_configure\(\s*true/);
    expect(statements).not.toMatch(/active\s*:=\s*true/);
  });

  test("the v3 config is v2's with exactly the intended changes", () => {
    const v2 = configIn(v2Script, "rules_v2_config");
    const v3 = configIn(script, "rules_v3_config");
    const { minimum_gameweeks, ovr_min_stats, empty_stat_neutral, ...restV3 } = v3;
    const {
      minimum_gameweeks: v2Minimum,
      cap_ignore_deadlines_before: v2CapCutOff,
      ...restV2
    } = v2;
    expect(v2Minimum).toBe(2);
    expect(v2CapCutOff).toBe("2026-10-10T12:38:05Z");
    expect(minimum_gameweeks).toBe(1);
    expect(ovr_min_stats).toBe(1);
    expect(empty_stat_neutral).toBe(true);
    expect(v3).not.toHaveProperty("cap_ignore_deadlines_before");
    expect(restV3).toEqual(restV2);
    expect(v3.provisional_below).toBe(5);
    // The migration reads the keys the script installs.
    expect(migration).toContain("cfg ? 'ovr_min_stats'");
    expect(migration).toContain("cfg ? 'empty_stat_neutral'");
    expect(script).toContain("in more than the intended keys");
  });

  test("inserts v3 active, leaves v2 inactive, and is a rehearsal that ends in rollback", () => {
    expect(script).toContain(
      "update app_private.manager_card_rules set active = false where version = 2 and active;",
    );
    expect(script).toContain(
      "values (3, current_setting('manager_card.rules_v3_config')::jsonb, true);",
    );
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script.match(/^\s*commit;/gm)).toBeNull();
    expect(script).toContain("tick answered");
    expect(script.indexOf("execute source;")).toBeLessThan(script.indexOf("do $verify$"));
    expect(script.indexOf("do $verify$")).toBeLessThan(
      script.indexOf("insert into app_private.manager_card_rules"),
    );
  });

  test("the notification ships off and the text carries no authorship notice", () => {
    expect(migration).toContain("add column notify_ovr_changes boolean not null default false;");
    const templates = migration.slice(
      migration.indexOf("insert into app.notification_templates"),
      migration.indexOf("create or replace function app_private.notification_push_topic"),
    );
    expect(templates).toContain("Votre note Curva monte à {{ovr}} (+{{delta}}) 📈");
    expect(templates).toContain("Votre note Curva descend à {{ovr}} (−{{delta}})");
    expect(templates).not.toMatch(/\bIA\b|intelligence artificielle|AI|ذكاء اصطناعي/i);
  });
});
