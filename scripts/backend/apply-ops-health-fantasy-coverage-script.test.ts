import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260926003400 (the `fantasy_gameweek_clubs`,
 * `fantasy_fixture_coverage` and `fantasy_scoring` health checks, audit A08 /
 * DB-03) on production, after 20260926003050. Like the other apply
 * scripts, it records the migration file whole in the history and runs that
 * record only after its sha256 matches the repository file, so the file must
 * be carried byte for byte, once, and the hash it checks must be the file's.
 * It must stay a rehearsal unless edited on purpose, its checks must not
 * write, and applying it must never send an alert or move the alert switch.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260926003400";
const NAME = "ops_health_fantasy_coverage_and_scoring";
const script = read(`scripts/backend/apply-${VERSION}-ops-health-fantasy-coverage.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const between = (start: string, end: string) =>
  script.slice(script.indexOf(start), script.indexOf(end, script.indexOf(start) + start.length));

describe(`apply-${VERSION}-ops-health-fantasy-coverage.sql`, () => {
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
      "migration 20260926003050 (the sitemap snapshot) is not applied yet",
      "the database is missing what this update reads or changes",
      // The health function as 20260926003050 installs it (local reset), and
      // the alert path in one of its two reviewed versions (below).
      "    <> '3c9b47ab0e10742ebaf355861006b8bd' then",
      "      <> '26943b55b25673c0ad709af90eaf65fc'\n",
      "      <> 'dc4a7449a164a586e75ffb04d044c631'\n",
      "stop: the alert path is not a version this update was reviewed against",
      "perform set_config('bg.ops_alert_tick_before', tick_md5, true);",
      "perform set_config('bg.ops_alert_configure_before', configure_md5, true);",
      "perform set_config('bg.ops_alerts_enabled_before',",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("the migration changes only what the guards cover", () => {
    const created = [...migration.matchAll(/create or replace function ([a-z_.]+\([^)]*\))/g)].map(
      (match) => match[1],
    );
    expect(created).toEqual(["app_private.ops_health_checks()"]);
    // No table, grant to a browser role, Vault or alert-state write, and no
    // schedule: switching alerts and choosing where they go stay the owner's.
    // Comments and string literals (messages, hints) blanked first.
    const statements = migration.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
    expect(statements).not.toMatch(
      /\bcreate\s+table\b|\balter\s+table\b|\bcron\.schedule\b|\bgrant\b|\bvault\.(create|update)_secret\b|\bops_alert_configure\s*\(|\bupdate\s+app_private\.ops_alert_state\b/i,
    );
    expect(
      occurrences(statements, "revoke all on function app_private.ops_health_checks() from"),
    ).toBe(1);
  });

  test("accepts the alert path in exactly two reviewed versions: before and after the alert emails", () => {
    // 20260926001000 (alert emails) replaces ops_alert_tick and
    // ops_alert_configure and nothing else of the path. Each is accepted in
    // the version 20260924200200 left (webhook only, production's until the
    // alert emails were applied there) or the one 20260926001000 installs
    // (read after a local reset, and on production once it was applied), both
    // of the same version, the second only where 20260926001000 is recorded.
    const alertEmails = read("supabase/migrations/20260926001000_ops_alert_email.sql");
    const defines = (text: string) =>
      [...text.matchAll(/create or replace function ([a-z_.]+)\(/g)].map((match) => match[1]);
    expect(defines(alertEmails)).toContain("app_private.ops_alert_tick");
    expect(defines(alertEmails)).toContain("app_private.ops_alert_configure");
    expect(defines(alertEmails)).not.toContain("app_private.ops_alert_message");
    expect(defines(alertEmails)).not.toContain("api.service_ops_health");

    const preflight = between("do $preflight$", "$preflight$;");
    const webhookOnly = {
      tick: "f495986586af20c728d3aa0ce2b44c10",
      configure: "cab30565c007fc69d2a9fb168e351e50",
    };
    const withEmail = {
      tick: "3e33433056b8b40b5f2c58efe9b53205",
      configure: "3bb66d070f45355a34243dea4b105e98",
    };
    expect(preflight).toContain(
      "      (not alert_emails_recorded\n" +
        `        and tick_md5 = '${webhookOnly.tick}'\n` +
        `        and configure_md5 = '${webhookOnly.configure}')\n`,
    );
    expect(preflight).toContain(
      "      or (alert_emails_recorded\n" +
        `        and tick_md5 = '${withEmail.tick}'\n` +
        `        and configure_md5 = '${withEmail.configure}')\n`,
    );
    // Nothing else: the two functions are compared with these values only,
    // and the preflight holds no other digest than the health function's and
    // the rest of the path's.
    expect(
      [...preflight.matchAll(/tick_md5 = '([0-9a-f]{32})'/g)].map((match) => match[1]).sort(),
    ).toEqual([webhookOnly.tick, withEmail.tick].sort());
    expect(
      [...preflight.matchAll(/configure_md5 = '([0-9a-f]{32})'/g)].map((match) => match[1]).sort(),
    ).toEqual([webhookOnly.configure, withEmail.configure].sort());
    expect(new Set(preflight.match(/'[0-9a-f]{32}'/g))).toEqual(
      new Set(
        [
          "3c9b47ab0e10742ebaf355861006b8bd",
          "26943b55b25673c0ad709af90eaf65fc",
          "dc4a7449a164a586e75ffb04d044c631",
          webhookOnly.tick,
          webhookOnly.configure,
          withEmail.tick,
          withEmail.configure,
        ].map((digest) => `'${digest}'`),
      ),
    );
    expect(preflight).toContain(
      "alert_emails_recorded := exists (\n    select 1 from supabase_migrations.schema_migrations where version = '20260926001000'\n  );",
    );
    // The header gives both versions and why.
    const header = script.slice(0, script.indexOf("\nbegin;\n"));
    for (const digest of [...Object.values(webhookOnly), ...Object.values(withEmail)]) {
      expect(header).toContain(digest);
    }
    expect(header).toContain("THE ALERT PATH: TWO REVIEWED VERSIONS");
    // Afterwards the path must be what the preflight found, not either one.
    const postflight = between("do $postflight$", "$postflight$;");
    expect(postflight).toContain(
      "is distinct from current_setting('bg.ops_alert_tick_before', true)",
    );
    expect(postflight).toContain(
      "is distinct from current_setting('bg.ops_alert_configure_before', true)",
    );
    expect(postflight).not.toMatch(/f4959865|cab30565|3e334330|3bb66d07/);
  });

  test("none of the audit migrations redefines what the alert emails define", () => {
    // 20260926001000 owns the alert functions it defines and the columns it
    // adds to ops_alert_state; a later migration of this branch redefining one
    // would silently undo it.
    const alertEmails = read("supabase/migrations/20260926001000_ops_alert_email.sql");
    const owned = [...alertEmails.matchAll(/create or replace function ([a-z_.]+)\(/g)].map(
      (match) => match[1],
    );
    expect(owned.length).toBeGreaterThanOrEqual(8);
    const audit = readdirSync(join(root, "supabase/migrations")).filter((file) =>
      /^20260926003\d{3}_.+\.sql$/.test(file),
    );
    expect(audit.length).toBeGreaterThanOrEqual(6);
    for (const file of audit) {
      const statements = read(`supabase/migrations/${file}`).replace(/--[^\n]*/g, "");
      for (const name of owned) {
        const redefines = new RegExp(
          `\\b(create(\\s+or\\s+replace)?|alter|drop)\\s+function\\s+${name.replace(".", "\\.")}\\s*\\(`,
          "i",
        ).test(statements);
        expect({ file, name, redefines }).toEqual({ file, name, redefines: false });
      }
      expect({
        file,
        altersState: /alter\s+table\s+app_private\.ops_alert_state\b/i.test(statements),
      }).toEqual({ file, altersState: false });
    }
  });

  test("leaves app_private.ops_alert_test() to the alert-email change", () => {
    // 20260926001000 (alert emails) defines the owner's test message for the
    // webhook and the email. Defining it here as well would overwrite
    // whichever of the two was applied first, so neither the migration nor
    // the script creates, checks or calls it.
    expect(migration).not.toContain("ops_alert_test");
    expect(script).not.toContain("ops_alert_test");
  });

  test("afterwards: grants, the untouched alert path and switch, the three new checks", () => {
    for (const check of [
      " can run an owner-only health function",
      "api.service_ops_health() is executable by the wrong roles",
      "the alert path changed",
      "the alert switch moved",
      "the health answer is not what the migration defines",
      "added constant text[] := array['fantasy_gameweek_clubs', 'fantasy_fixture_coverage', 'fantasy_scoring'];",
      "history row missing",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
    // Every check the migration defines is either new or among the earlier
    // ones the postflight expects (the deadline watch appears only while a
    // season is planned or running).
    const names = [...migration.matchAll(/jsonb_build_object\('name', '([a-z_]+)'/g)].map(
      (match) => match[1],
    );
    const postflight = between("do $postflight$", "$postflight$;");
    for (const name of new Set(names)) {
      if (name === "fantasy_deadline_watch") continue;
      expect({ name, listed: postflight.includes(`'${name}'`) }).toEqual({ name, listed: true });
    }
  });

  test("any counted match not finished once the rules stop keeping it fails the scoring check", () => {
    // FANTASY_RULES_V1.md keeps a counted match in its gameweek for the
    // ruleset's post-lock completion window (48 h) after its frozen kickoff,
    // whatever holds it. The check fails when that window ends for any match
    // still not finished, the moment 20260926003500's tool accepts it, and
    // names the owner's procedure, which must exist; a row that stopped
    // following its match fails earlier, 6 h past its due end.
    const procedure = "scripts/backend/resolve-fantasy-postponed-assignment.sql";
    const folded = migration.replace(/\s+/g, " ");
    expect(migration).toContain(`else '${procedure} takes it out' end;`);
    expect(migration).toContain(`': take it out with ${procedure}'`);
    expect(existsSync(join(root, procedure))).toBe(true);
    expect(folded).toContain(
      "k.hold is not null and (k.hold in ('called_off', 'moved') or k.due_end < now_at - interval '3 hours' or k.resolvable_at <= now_at) as held",
    );
    expect(folded).toContain(
      "k.hold = 'unfinished' and k.due_end < now_at - interval '6 hours' as stale",
    );
    expect(folded).toContain("k.hold is not null and k.resolvable_at <= now_at as past_window");
    expect(folded).toContain("count(*) filter (where m.past_window or m.stale) as stuck");
    // Moved means too late to be completed inside the window, not past the
    // gameweek's own window, which the check no longer reads.
    expect(folded).toContain(
      "when f.kickoff_at > a.assigned_kickoff_at and f.kickoff_at + interval '2 hours' > r.resolvable_at then 'moved'",
    );
    expect(migration).not.toContain("ends_at");
    expect(migration).toContain("coalesce(fixture_rules.post_lock_completion_window_hours, 48)");
    // Where the tool cannot free the gameweek (it refuses the last counted
    // match), the check says a developer is needed instead of naming it.
    expect(folded).toContain("when scoring.past_window < scoring.matches then");
    expect(migration).toContain(
      "': a developer is needed (no tool yet for a gameweek whose every match was called off)'",
    );
    expect(migration).not.toMatch(/no tool (?:does it|applies one|can free)/);
    // The ruleset table the check now reads is checked for before any write.
    expect(script.indexOf("to_regclass('app.fantasy_fixture_rules') is null")).toBeGreaterThan(0);
    expect(script.indexOf("to_regclass('app.fantasy_fixture_rules') is null")).toBeLessThan(
      script.indexOf("insert into supabase_migrations.schema_migrations"),
    );
    // The script says to install that procedure's tool right after this one.
    expect(script).toContain(
      "scripts/backend/apply-20260926003500-fantasy-resolve-postponed-after-lock.sql:\n--   apply that one right after this one.",
    );
  });

  test("a club twice in a gameweek not locked yet warns, and fails within 24 h of its deadline", () => {
    const folded = migration.replace(/\s+/g, " ");
    expect(folded).toContain("'name', 'fantasy_gameweek_clubs'");
    expect(folded).toContain("where g.status in ('scheduled', 'open')");
    expect(folded).toContain("having count(distinct f.id) > 1");
    expect(folded).toContain(
      "case when doubled.imminent > 0 then 'fail' when doubled.clubs > 0 then 'warn' else 'ok' end",
    );
    expect(folded).toContain(
      "count(*) filter (where d.deadline_at <= now_at + interval '24 hours') as imminent",
    );
    expect(folded).toContain("(fantasy_next_calendar_incomplete)");
    // The watchdog reports it by its own name without requiring it.
    const watchdog = read("scripts/ops/watchdog.ts");
    const required = watchdog.slice(
      watchdog.indexOf("export const REQUIRED_DATABASE_CHECKS = ["),
      watchdog.indexOf(
        "] as const;",
        watchdog.indexOf("export const REQUIRED_DATABASE_CHECKS = ["),
      ),
    );
    expect(required.length).toBeGreaterThan(0);
    expect(required).not.toContain("fantasy_gameweek_clubs");
  });

  test("the postflight writes nothing and nothing in the script sends an alert", () => {
    const postflight = between("do $postflight$", "$postflight$;");
    expect(postflight.length).toBeGreaterThan(0);
    const statements = postflight.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
    expect(statements).not.toMatch(
      /\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+[a-z_.]+\s+set\b|\bgrant\b|\brevoke\b|\bcreate\b|\bdrop\b|\balter\b/i,
    );
    // Outside the carried migration, the script never calls the functions
    // that post to the webhook or switch it.
    const outside = script.replace(migration, "").replace(/--[^\n]*/g, "");
    expect(outside).not.toMatch(
      /ops_alert_tick\s*\(\s*\)\s*;|ops_alert_configure\s*\(\s*(true|false)|net\.http_post/,
    );
  });
});
