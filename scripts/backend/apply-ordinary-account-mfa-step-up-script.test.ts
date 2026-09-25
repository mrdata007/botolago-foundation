import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260926003100 (the MFA step-up for ordinary
 * accounts, audit A03 / DB-07: their reads, writes, views, News card saved
 * mark and avatar image) on production. Like the other apply scripts, it
 * records the migration file whole in the history and runs that record only
 * after its sha256 matches the repository file, so the file must be carried
 * byte for byte, once, and the hash it checks must be the file's. It must stay
 * a rehearsal unless edited on purpose, and its checks must not write. It
 * locks and adds triggers to Fantasy, Pronostics and notification tables, so
 * it must refuse while the jobs that write them are on, as AGENTS.md asks,
 * and tell the operator how to pause and restore each. Everything the
 * migration replaces must be checked against the version production held
 * before it runs, and against that version plus the step-up after.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260926003100";
const NAME = "ordinary_account_mfa_step_up";
const script = read(`scripts/backend/apply-${VERSION}-ordinary-account-mfa-step-up.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const leaguePolicyScript = read(
  "scripts/backend/apply-20260926003200-league-policy-and-fk-indexes.sql",
);
/** The match votes (on production since 2026-09-25), whose two functions this replaces. */
const matchVotes = read("supabase/migrations/20260925234000_match_votes.sql");
const readsTest = read("supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql");
/** Production's md5 of pg_get_functiondef for the two, read there on 2026-09-25. */
const PRODUCTION_VOTE_FUNCTIONS = {
  "api.cast_match_vote(uuid,text,text)": "7c92af729c8b2867049b72034270a053",
  "api.match_votes(uuid)": "0a809ec4cdec458fb0b2a584673098d7",
};
/** One `create or replace function <name>(` statement, through its closing `$$;`. */
const functionStatement = (text: string, name: string) => {
  const start = text.indexOf(`create or replace function ${name}(`);
  return start === -1 ? null : text.slice(start, text.indexOf("\n$$;\n", start) + "\n$$;".length);
};
const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const postflightOf = (text: string) =>
  text.slice(text.indexOf("do $postflight$"), text.indexOf("$postflight$;"));
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
      "migration 20260925234000 (match votes) is not applied",
      "the MFA step-up already exists, but the migration is not recorded",
      "the database is missing what this update builds on",
      "'app.match_votes',",
      // The two match-vote functions, as production holds them.
      ...Object.entries(PRODUCTION_VOTE_FUNCTIONS).map(
        ([signature, digest]) => `"${signature}": "${digest}"`,
      ),
      // The three functions the first version replaced, as production held
      // them on 2026-09-25 (md5 of pg_get_functiondef, read there).
      "    <> '1a1f5fedb7256c03c28305d0cd0ce76a' then",
      "    <> 'b118e6b4b14e793b18532b2abdbc71be' then",
      "    <> '9c655d051942d266429196779a06b160' then",
      // Everything else it replaces: the 49 functions, the News card, the
      // views and the avatar policies, against the list read on production.
      "stop: not the version this update replaces (production on 2026-09-25)",
      "storage.objects has another avatars policy than the four",
      "perform set_config('bg_20260926003100.replaced', replaced::text, true);",
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
    // apply-20260926003200, character for character.
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
    expect(triggered).toHaveLength(25);
    expect(triggered).toContain("app.match_votes");
    const lock = script.slice(
      script.indexOf("lock table\n"),
      script.indexOf("in share row exclusive mode;"),
    );
    const locked = [...lock.matchAll(/(app(?:_private)?\.[a-z_]+)/g)]
      .map((match) => match[1])
      .sort();
    expect(locked).toEqual(triggered);
  });

  test("afterwards: helpers private, 25 statement triggers, replacements in place, refusal observed", () => {
    for (const check of [
      "' can run ' || signature",
      " is not callable by authenticated alone",
      "expected 25 enabled per-statement step-up triggers",
      "a replaced function is not the new version",
      "the replaced functions lost or gained a grant",
      "'not its checked version plus the step-up: ' || fn.signature",
      "api.cast_match_vote is not its checked version plus the step-up",
      "api.match_votes is not its checked version plus the step-up",
      "app_private.news_article_card is not its checked version plus the step-up",
      "'not its checked version plus the step-up: ' || v.name",
      "'not its checked version plus the step-up: ' || p.name",
      "an api function reads the caller without the step-up: ",
      "an api view reads the caller without the step-up: ",
      "history row missing",
      "an account with no factor was not let through",
      "an account with no factor was refused: ",
      "an enrolled account at aal1 was not refused with mfa_required",
      "an enrolled account at aal1 could read its own data",
      "an enrolled account at aal1 could cast a match vote",
      "Storage would serve an enrolled account at aal1",
      "Storage would refuse an enrolled account at aal2",
      "an enrolled account at aal2 was refused: ",
      "an enrolled account at aal2 could not read its own data",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });

  test("the match-vote functions are production's versions plus one line each", () => {
    // Casting a vote runs the step-up first, as the 49 do; the public read
    // shows the caller's own choices only past it, as the News card shows the
    // saved mark, and keeps its totals open to visitors.
    const castLine = "\nbegin\n  perform app_private.assert_mfa_step_up();\n";
    const mineLines =
      "          and caller is not null and vote.user_id = caller\n" +
      "          and app_private.mfa_step_up_satisfied()\n";
    const cast = functionStatement(migration, "api.cast_match_vote");
    const read = functionStatement(migration, "api.match_votes");
    const castBefore = functionStatement(matchVotes, "api.cast_match_vote");
    const readBefore = functionStatement(matchVotes, "api.match_votes");
    expect(cast && read && castBefore && readBefore).toBeTruthy();
    expect(cast!.split(castLine)).toHaveLength(2);
    expect(read!.split(mineLines)).toHaveLength(2);
    expect(read).not.toContain("assert_mfa_step_up");
    expect(cast!.replace(castLine, "\nbegin\n")).toBe(castBefore!);
    expect(read!.replace("\n          and app_private.mfa_step_up_satisfied()", "")).toBe(
      readBefore!,
    );
    // Each is replaced once, and the script checks both against production.
    expect(occurrences(migration, "create or replace function api.cast_match_vote(")).toBe(1);
    expect(occurrences(migration, "create or replace function api.match_votes(")).toBe(1);
    expect(migration).toContain(
      "create trigger match_votes_refuse_unverified_mfa_actor\nbefore insert or update or delete on app.match_votes\n",
    );
  });

  test("the postflight runs the pgTAP completeness checks on the live catalog, word for word", () => {
    const postflight = squash(postflightOf(script));
    const functionsCheck = readsTest.slice(
      readsTest.indexOf("(with recursive fn as (") + 1,
      readsTest.indexOf("   select array_agg(f.proname::text order by f.proname)"),
    );
    const functionsFilter = readsTest.slice(
      readsTest.indexOf("   where f.nspname = 'api'\n     and has_function_privilege"),
      readsTest.indexOf("has_editorial_role)\\('),") + "has_editorial_role)\\('".length,
    );
    const viewsCheck = readsTest.slice(
      readsTest.indexOf("   from pg_class c join pg_namespace n on n.oid = c.relnamespace"),
      readsTest.indexOf("require_mfa_step_up\\(\\)'),") + "require_mfa_step_up\\(\\)'".length,
    );
    for (const [name, part] of Object.entries({ functionsCheck, functionsFilter, viewsCheck })) {
      expect({ name, length: part.length > 80 }).toEqual({ name, length: true });
      expect({ name, inPostflight: postflight.includes(squash(part)) }).toEqual({
        name,
        inPostflight: true,
      });
    }
    // Only the three exceptions the pgTAP names are let through.
    expect(postflight).toContain(
      "and f.proname not in ('get_my_staff_context', 'predictions_round', 'record_session_revocation');",
    );
    for (const exception of [
      "get_my_staff_context",
      "predictions_round",
      "record_session_revocation",
    ]) {
      expect(readsTest).toContain(`    '${exception}'`);
    }
  });

  test("checks everything the migration replaces, and only that, against production's version", () => {
    const preflight = script.slice(
      script.indexOf("do $preflight$"),
      script.indexOf("$preflight$;"),
    );
    const list = JSON.parse(
      preflight.slice(
        preflight.indexOf("$replaced$") + "$replaced$".length,
        preflight.lastIndexOf("$replaced$"),
      ),
    ) as {
      functions: Record<string, string>;
      news_card: string;
      match_votes: Record<string, string>;
      views: Record<string, string>;
      policies: Record<string, string>;
    };
    const name = (signature: string) => signature.slice(0, signature.indexOf("("));
    // Functions: every api function the migration replaces is in the list, is
    // one of the two match-vote functions (checked by their own md5, as
    // production holds them), or is one of the three the first version
    // checked by their own md5.
    const replacedByMigration = [
      ...migration.matchAll(/^create or replace function (api\.[a-z_]+)\(/gm),
    ].map((match) => match[1]);
    const checkedByOwnMd5 = [
      "api.cancel_account_deletion",
      "api.request_account_deletion",
      "api.unsubscribe_notification_email",
    ];
    expect(
      [
        ...Object.keys(list.functions).map(name),
        ...Object.keys(list.match_votes).map(name),
        ...checkedByOwnMd5,
      ].sort(),
    ).toEqual([...replacedByMigration].sort());
    expect(Object.keys(list.functions)).toHaveLength(49);
    expect(list.match_votes).toEqual(PRODUCTION_VOTE_FUNCTIONS);
    for (const digest of [
      ...Object.values(list.functions),
      ...Object.values(list.match_votes),
      list.news_card,
    ]) {
      expect(digest).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(migration).toContain("create or replace function app_private.news_article_card(");
    // Views and policies: the ones the migration replaces.
    expect(Object.keys(list.views).sort()).toEqual(
      [...migration.matchAll(/^create or replace view (api\.[a-z_]+)\n/gm)].map((m) => m[1]).sort(),
    );
    expect(Object.keys(list.policies).sort()).toEqual(
      [...migration.matchAll(/^drop policy ([a-z_]+) on storage\.objects;\ncreate policy \1\n/gm)]
        .map((m) => m[1])
        .sort(),
    );
    // Each of the 49 gains the one line, first in its body.
    const firstStatement = "\nbegin\n  perform app_private.assert_mfa_step_up();\n";
    const apiFunctions = migration
      .split(/\n(?=create or replace function )/)
      .filter((statement) => statement.startsWith("create or replace function api."));
    for (const signature of Object.keys(list.functions)) {
      const statement = apiFunctions.find((text) =>
        text.startsWith(`create or replace function ${name(signature)}(`),
      );
      expect({ signature, guarded: statement?.split(firstStatement).length }).toEqual({
        signature,
        guarded: 2,
      });
    }
  });

  test("the postflight writes nothing: its only table statement matches no row", () => {
    const postflight = postflightOf(script);
    expect(postflight).not.toMatch(/\binsert\s+into\b|\bdelete\s+from\b/i);
    const updates = [...postflight.matchAll(/\bupdate\s+[a-z_.]+\s+set\b[^;]*;/gi)].map(
      (match) => match[0],
    );
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) expect(update).toEndWith("where false;");
    // Its one vote is cast at aal1, where the step-up refuses it, on a match
    // that does not exist; nothing casts one at aal2.
    const vote = "perform api.cast_match_vote(gen_random_uuid(), 'winner', 'home');";
    expect(postflight.match(/\b(?:perform|select)\s+api\.cast_match_vote\(/gi)).toHaveLength(1);
    expect(occurrences(postflight, vote)).toBe(1);
    const aal1 = postflight.indexOf(
      "'role', 'authenticated', 'aal', 'aal1')::text, true);\n    refused_by_helper",
    );
    const aal2 = postflight.indexOf("'role', 'authenticated', 'aal', 'aal2')::text, true);");
    expect(aal1).toBeGreaterThan(0);
    expect(postflight.indexOf(vote)).toBeGreaterThan(aal1);
    expect(postflight.indexOf(vote)).toBeLessThan(aal2);
  });
});
