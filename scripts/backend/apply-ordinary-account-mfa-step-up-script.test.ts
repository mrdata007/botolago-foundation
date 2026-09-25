import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925210100 (the MFA step-up for ordinary
 * accounts, audit A03 / DB-07) on production. Like the other apply scripts,
 * it records the migration file whole in the history and runs that record
 * only after its sha256 matches the repository file, so the file must be
 * carried byte for byte, once, and the hash it checks must be the file's. It
 * must stay a rehearsal unless edited on purpose, and its checks must not
 * write. It locks and adds triggers to Fantasy, Pronostics and notification
 * tables, so it must refuse while the jobs that write them are on, as
 * AGENTS.md asks, and tell the operator how to pause and restore each.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925210100";
const NAME = "ordinary_account_mfa_step_up";
const script = read(`scripts/backend/apply-${VERSION}-ordinary-account-mfa-step-up.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const leaguePolicyScript = read(
  "scripts/backend/apply-20260925210200-league-policy-and-fk-indexes.sql",
);
/** AGENTS.md with its line wrapping undone (it wraps one of the commands). */
const agents = read("AGENTS.md").replace(/\s+/g, " ");
/** The script's instructions: the comment block before its first statement. */
const header = script.slice(0, script.indexOf("\nbegin;\n"));
/** One `if exists (...) then raise ...; end if;` guard, from its condition to its end. */
const guardBlock = (text: string, condition: string) => {
  const start = text.indexOf(`  if exists (select 1 from ${condition}) then\n`);
  return start === -1
    ? null
    : text.slice(start, text.indexOf("  end if;\n", start) + "  end if;\n".length);
};

describe(`apply-${VERSION}-ordinary-account-mfa-step-up.sql`, () => {
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
      "the MFA step-up already exists, but the migration is not recorded",
      "the database is missing what this update builds on",
      // The three functions it replaces, as production held them on
      // 2026-09-25 (md5 of pg_get_functiondef, read there).
      "    <> '1a1f5fedb7256c03c28305d0cd0ce76a' then",
      "    <> 'b118e6b4b14e793b18532b2abdbc71be' then",
      "    <> '9c655d051942d266429196779a06b160' then",
      // The jobs that write the locked tables (AGENTS.md), paused first.
      "the Fantasy lifecycle tick is on",
      "email is not off",
      "the live score refresh is on",
      "Pronostics scoring is on",
      // Every table that gets a trigger, taken together before any change.
      "  in share row exclusive mode;",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("refuses while a job that writes its tables is on, as the league-policy script does", () => {
    const preflight = script.slice(
      script.indexOf("do $preflight$"),
      script.indexOf("$preflight$;"),
    );
    // The Fantasy tick and email: the same condition and message as
    // apply-20260925210200, character for character.
    for (const condition of [
      "app_private.fantasy_automation_settings where lifecycle_tick_enabled",
      "app_private.notification_email_settings where mode <> 'off'",
    ]) {
      const mine = guardBlock(preflight, condition);
      expect({ condition, mine: mine !== null }).toEqual({ condition, mine: true });
      expect(mine).toBe(guardBlock(leaguePolicyScript, condition));
    }
    // The live score refresh, which AGENTS.md pauses together with email, and
    // Pronostics scoring, which writes only while its mode is not off.
    expect(
      guardBlock(
        preflight,
        "app_private.notification_email_settings where football_live_refresh_enabled",
      ),
    ).toContain("raise exception 'stop: the live score refresh is on");
    expect(
      guardBlock(
        preflight,
        "app_private.prediction_settings where mode <> 'off' and scoring_enabled",
      ),
    ).toContain("raise exception 'stop: Pronostics scoring is on");
    // Every settings table it reads is checked for first.
    for (const table of [
      "app_private.fantasy_automation_settings",
      "app_private.notification_email_settings",
      "app_private.prediction_settings",
    ]) {
      expect(preflight).toContain(`'${table}'`);
    }
  });

  test("tells the operator how to pause each job and put it back, with AGENTS.md's commands", () => {
    expect(header).not.toContain("No job needs pausing");
    for (const pause of [
      "select app_private.fantasy_automation_configure(false);",
      "select app_private.notification_email_configure('off', null, null, false);",
      "select app_private.predictions_configure((select mode from app_private.prediction_settings), false);",
    ]) {
      expect({ pause, inHeader: header.includes(pause) }).toEqual({ pause, inHeader: true });
      expect({ pause, inAgents: agents.includes(pause) }).toEqual({ pause, inAgents: true });
    }
    for (const restore of [
      "select app_private.fantasy_automation_configure(true);",
      "select app_private.notification_email_configure('<email_mode>', null, null, <live_scores>);",
      "select app_private.predictions_configure((select mode from app_private.prediction_settings), true);",
    ]) {
      expect({ restore, inHeader: header.includes(restore) }).toEqual({ restore, inHeader: true });
    }
    // The state to restore is read before anything is paused.
    expect(header.indexOf("e.football_live_refresh_enabled as live_scores")).toBeGreaterThan(0);
    expect(header.indexOf("e.football_live_refresh_enabled as live_scores")).toBeLessThan(
      header.indexOf("select app_private.fantasy_automation_configure(false);"),
    );
  });

  test("locks exactly the tables the migration adds triggers to", () => {
    const triggered = [...migration.matchAll(/before insert or update or delete on ([a-z_.]+)\n/g)]
      .map((match) => match[1])
      .sort();
    expect(triggered).toHaveLength(24);
    const lock = script.slice(
      script.indexOf("lock table\n"),
      script.indexOf("in share row exclusive mode;"),
    );
    const locked = [...lock.matchAll(/(app(?:_private)?\.[a-z_]+)/g)]
      .map((match) => match[1])
      .sort();
    expect(locked).toEqual(triggered);
  });

  test("afterwards: functions private, 24 statement triggers, replacements in place, refusal observed", () => {
    for (const check of [
      "' can run ' || signature",
      "expected 24 enabled per-statement step-up triggers",
      "a replaced function is not the new version",
      "the replaced functions lost or gained a grant",
      "history row missing",
      "an account with no factor was refused: ",
      "an enrolled account at aal1 was not refused with mfa_required",
      "an enrolled account at aal2 was refused: ",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });

  test("the postflight writes nothing: its only table statement matches no row", () => {
    const postflight = script.slice(
      script.indexOf("do $postflight$"),
      script.indexOf("$postflight$;"),
    );
    expect(postflight).not.toMatch(/\binsert\s+into\b|\bdelete\s+from\b/i);
    const updates = [...postflight.matchAll(/\bupdate\s+[a-z_.]+\s+set\b[^;]*;/gi)].map(
      (match) => match[0],
    );
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) expect(update).toEndWith("where false;");
  });
});
