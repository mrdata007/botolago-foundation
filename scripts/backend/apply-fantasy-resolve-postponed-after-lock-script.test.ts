import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925210500 (the owner's tool that takes a
 * counted match out of a Fantasy gameweek that has locked) on production,
 * after 20260925210400. Like the other apply scripts, it records the
 * migration file whole in the history and runs that record only after its
 * sha256 matches the repository file, so the file must be carried byte for
 * byte, once, and the hash it checks must be the file's. It must stay a
 * rehearsal unless edited on purpose, refuse while the Fantasy tick is on
 * (AGENTS.md), check what the tool builds on before writing, and check the
 * result without resolving anything.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925210500";
const NAME = "fantasy_resolve_postponed_after_lock";
const TOOL = "app_private.fantasy_resolve_frozen_assignment(uuid,text,text)";
const script = read(`scripts/backend/apply-${VERSION}-fantasy-resolve-postponed-after-lock.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const leaguePolicyScript = read(
  "scripts/backend/apply-20260925210200-league-policy-and-fk-indexes.sql",
);
/** AGENTS.md with its line wrapping undone. */
const agents = read("AGENTS.md").replace(/\s+/g, " ");
/** The script's instructions: the comment block before its first statement. */
const header = script.slice(0, script.indexOf("\nbegin;\n"));
const between = (start: string, end: string) =>
  script.slice(script.indexOf(start), script.indexOf(end, script.indexOf(start) + start.length));
/** One `if exists (...) then raise ...; end if;` guard, from its condition to its end. */
const guardBlock = (text: string, condition: string) => {
  const start = text.indexOf(`  if exists (select 1 from ${condition}) then\n`);
  return start === -1
    ? null
    : text.slice(start, text.indexOf("  end if;\n", start) + "  end if;\n".length);
};
/**
 * SQL with its comments dropped and its string literals blanked to `''`, read
 * left to right so that `--` inside a literal and an apostrophe inside a
 * comment are each taken for what they are. Dollar-quoted bodies are kept:
 * they are the statements under test.
 */
const statementsOf = (sql: string) => {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += "''";
      i = j + 1;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
};

describe(`apply-${VERSION}-fantasy-resolve-postponed-after-lock.sql`, () => {
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
      "migration 20260925210400 (the ops checks) is not applied yet",
      "the database is missing what this update builds on",
      "app_private.fantasy_resolve_frozen_assignment already exists, but the migration is not recorded",
      "the Fantasy lifecycle tick is on",
      // The helpers it calls, the checks it writes under, and the functions
      // whose behaviour its rule relies on, as production held them on
      // 2026-09-25 (md5 read there).
      "      <> 'e0ff799389c935e3844df2620b53ae87'",
      "      <> 'a984ded01b8e501ac5264966d05c07fc' then",
      "      is distinct from 'de4222c13d28da1425b2d283c859ead1'",
      "      is distinct from 'd51423a9c9ab0b0b3eaa80b7508c47a2' then",
      "      <> 'b0d020cfeb680f920cf166aa7d001459'",
      "      <> '5eafe7b633373a5001ee0cc8fdece3db'",
      "      <> '9cadeb19011082c929260fc0a5cadd83'",
      "      <> '72e4c37911bac985d08267e430569e4e' then",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("refuses while the Fantasy tick is on, as the league-policy script does, and says how to pause it", () => {
    const preflight = between("do $preflight$", "$preflight$;");
    const condition = "app_private.fantasy_automation_settings where lifecycle_tick_enabled";
    const mine = guardBlock(preflight, condition);
    expect(mine).not.toBeNull();
    expect(mine).toBe(guardBlock(leaguePolicyScript, condition));
    for (const command of [
      "select app_private.fantasy_automation_configure(false);",
      "select app_private.fantasy_automation_configure(true);",
    ]) {
      expect({ command, inHeader: header.includes(command) }).toEqual({ command, inHeader: true });
    }
    expect(agents).toContain("select app_private.fantasy_automation_configure(false);");
    // How the tick stood is read before it is paused, to put it back.
    expect(
      header.indexOf("select lifecycle_tick_enabled from app_private.fantasy_automation_settings;"),
    ).toBeLessThan(header.indexOf("select app_private.fantasy_automation_configure(false);"));
  });

  test("the migration adds the one owner-only tool and changes nothing else", () => {
    const statements = statementsOf(migration);
    const created = [...statements.matchAll(/create (?:or replace )?function ([a-z_.]+)\(/g)].map(
      (match) => match[1],
    );
    expect(created).toEqual(["app_private.fantasy_resolve_frozen_assignment"]);
    expect(statements).not.toMatch(
      /\bcreate\s+table\b|\balter\s+table\b|\bdrop\b|\bcron\.schedule\b|\bgrant\b|\bcreate\s+(?:or\s+replace\s+)?(?:view|trigger|policy)\b/i,
    );
    expect(statements).toContain(
      "revoke all on function app_private.fantasy_resolve_frozen_assignment(uuid, text, text)\n  from public, anon, authenticated, service_role;",
    );
    // It writes the one assignment and the audit row, never points.
    const writes = [
      ...statements.matchAll(/\b(insert\s+into|update|delete\s+from)\s+([a-z_.]+)/gi),
    ].map((match) => `${match[1].toLowerCase()} ${match[2]}`);
    expect(writes).toEqual(["update app.fantasy_fixture_assignments"]);
    expect(statements).toContain("app_private.write_admin_audit(");
  });

  test("checks the ruleset's completion window the tool refuses by is there before writing", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    const preflight = between("do $preflight$", "$preflight$;");
    expect(script.indexOf("do $preflight$")).toBeLessThan(firstWrite);
    for (const needed of [
      "or to_regclass('app.fantasy_fixture_rules') is null",
      "('app.fantasy_seasons'::regclass, 'ruleset_id')",
      "('app.fantasy_fixture_rules'::regclass, 'ruleset_id')",
      "('app.fantasy_fixture_rules'::regclass, 'post_lock_completion_window_hours')",
    ]) {
      expect({ needed, inPreflight: preflight.includes(needed) }).toEqual({
        needed,
        inPreflight: true,
      });
    }
    // The column count it expects is the number of columns it names.
    const columns = between("(attrelid, attname) in (", "  ) <> ");
    const named = columns.match(/\('[a-z_.]+'::regclass, '[a-z_]+'\)/g) ?? [];
    expect(named.length).toBe(21);
    expect(preflight).toContain(`  ) <> ${named.length} then`);
    // The tool reads that window from the season's ruleset and refuses inside it
    // (docs/backend/FANTASY_RULES_V1.md), and the header says so.
    expect(migration).toContain(
      "select fixture_rules.post_lock_completion_window_hours into window_hours",
    );
    expect(migration).toContain("where fixture_rules.ruleset_id = season.ruleset_id;");
    expect(migration).toContain("if statement_timestamp() < resolvable_at then");
    expect(migration).toContain("message = 'fantasy_postponement_window_open: resolvable from '");
    expect(header).toContain("docs/backend/FANTASY_RULES_V1.md");
    expect(header).toContain("(fantasy_postponement_window_open)");
  });

  test("afterwards: the tool's privileges, its refusals, what it builds on, the history row", () => {
    const postflight = between("do $postflight$", "$postflight$;");
    for (const check of [
      "the tool is not SECURITY DEFINER with an empty search_path and its comment",
      " can run the owner-only tool",
      "PUBLIC holds a grant on the tool",
      "an api.* function calls the tool",
      "'22023', 'fantasy_assignment_required'",
      "'22023', 'fantasy_resolution_unsupported'",
      "'fantasy_resolution_reason_required'",
      "'PT404', 'fantasy_assignment_not_found'",
      "what the tool builds on changed",
      "history row missing",
    ]) {
      expect({ check, found: postflight.includes(check) }).toEqual({ check, found: true });
    }
    // Every refusal it probes is one the migration raises.
    for (const code of [
      "fantasy_assignment_required",
      "fantasy_resolution_unsupported",
      "fantasy_resolution_reason_required",
      "fantasy_assignment_not_found",
    ]) {
      expect(migration).toContain(`message = '${code}'`);
    }
    expect(postflight).toContain(TOOL);
  });

  test("the postflight writes nothing and never resolves a real assignment", () => {
    const postflight = statementsOf(between("do $postflight$", "$postflight$;"));
    expect(postflight.length).toBeGreaterThan(0);
    expect(postflight).not.toMatch(
      /\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+[a-z_.]+\s+set\b|\bgrant\b|\brevoke\b|\bcreate\b|\bdrop\b|\balter\b/i,
    );
    // Its probes name no assignment or one that cannot exist (all zeros but
    // the version digit), and each is refused before any row is locked.
    const probes = between("for probe in", "  loop");
    expect(probes.match(/'[0-9a-f-]{36}'::uuid/g)).toEqual([
      "'00000000-0000-4000-8000-000000000000'::uuid",
      "'00000000-0000-4000-8000-000000000000'::uuid",
      "'00000000-0000-4000-8000-000000000000'::uuid",
    ]);
    // Outside the carried migration, the script calls the tool nowhere else.
    const outside = statementsOf(script.replace(migration, ""));
    expect(occurrences(outside, "app_private.fantasy_resolve_frozen_assignment(")).toBe(1);
  });
});
