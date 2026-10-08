import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts the Manager Card backend (BG-0158, five
 * migrations 20261008123000 to 20261008123400) on production. Like the other
 * apply scripts, it records each migration file whole in the history and runs
 * that record only after its sha256 matches the repository file, so each file
 * must be carried byte for byte, once, in order, and the hash it checks must be
 * the file's. It must stay a rehearsal unless edited on purpose, refuse before
 * writing anything unless production is as reviewed, never switch the card on
 * or insert a rules row, and check the result afterwards.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const MIGRATIONS = [
  { version: "20261008123000", name: "manager_card_schema" },
  { version: "20261008123100", name: "manager_card_erase_lock" },
  { version: "20261008123200", name: "manager_card_compute" },
  { version: "20261008123300", name: "manager_card_api" },
  { version: "20261008123400", name: "manager_card_jobs" },
].map((m) => ({ ...m, text: read(`supabase/migrations/${m.version}_${m.name}.sql`) }));

const script = read("scripts/backend/apply-20261008123000-manager-card.sql");
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

describe("apply-20261008123000-manager-card.sql", () => {
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

  test("records and runs the five in order, checking every hash before the first execute", () => {
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

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    expect(script).toContain("Rehearsal passed");
  });

  test("the header says when, how, what, and to pause the Fantasy tick first", () => {
    const header = script.slice(0, script.indexOf("begin;"));
    for (const part of ["-- WHEN", "-- HOW TO RUN", "-- WHAT IT DOES", "-- BEFORE YOU RUN IT"]) {
      expect({ part, found: header.includes(part) }).toEqual({ part, found: true });
    }
    expect(header).toContain("select app_private.fantasy_automation_configure(false);");
    expect(header).toContain("MANAGER_CARD_OPERATIONS_RUNBOOK.md");
  });

  test("checks production is as reviewed before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "migration 20261005130000 (public recaps) is not applied yet",
      "migration 20261006143700 (automatic account deletion) is not applied yet",
      "a Manager Card migration is already recorded as applied",
      "the tables this builds on are missing",
      "the functions this builds on are missing",
      "a Manager Card table already exists",
      "a Manager Card function already exists",
      "a manager-card job already exists",
      "the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false);",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
    expect(script).toContain("where lifecycle_tick_enabled");
    for (const table of [
      "app.manager_cards",
      "app.manager_card_seasons",
      "app.manager_card_gameweeks",
      "app_private.manager_card_settings",
      "app_private.manager_card_rules",
      "app_private.manager_card_retired_serials",
      "app_private.manager_card_evaluations",
      "app_private.manager_card_job_log",
    ]) {
      expect(occurrences(script.slice(0, firstWrite), `'${table}'`)).toBe(1);
    }
  });

  test("afterwards: switches off, no rules, grants, erase lock, jobs, a quiet tick", () => {
    const afterwards = script.slice(script.indexOf("$postflight$"));
    for (const check of [
      "the Manager Card settings are not one row with both switches off",
      "a Manager Card rules row exists -- none may ship",
      "api.get_my_manager_card()",
      "api.get_manager_card(uuid)",
      "api.get_manager_cards(uuid[])",
      "api.get_my_manager_card_history(integer,integer)",
      "cannot run",
      "can run",
      "has a right on",
      "row security is not forced on",
      "the account erasure does not take the manager-card lock",
      "botolago:manager-card",
      "the manager-card jobs are not scheduled as reviewed",
      "'*/15 * * * *'",
      "'47 3 * * *'",
      "a history row is missing",
      "the tick while off answered",
      `'{"outcome": "off"}'::jsonb`,
      "the tick wrote while off",
    ]) {
      expect({ check, present: afterwards.includes(check) }).toEqual({ check, present: true });
    }
    expect(afterwards.indexOf("app_private.manager_card_tick()")).toBeGreaterThan(0);
  });

  test("never switches the card on or inserts a rules row, in the script or the migrations", () => {
    for (const text of [script, ...MIGRATIONS.map((m) => m.text)]) {
      expect(code(text)).not.toMatch(/select\s+app_private\.manager_card_configure\s*\(/i);
      expect(code(text)).not.toMatch(/insert\s+into\s+app_private\.manager_card_rules/i);
      expect(code(text)).not.toMatch(/(compute|read)_enabled\s*=\s*true/i);
    }
  });
});
