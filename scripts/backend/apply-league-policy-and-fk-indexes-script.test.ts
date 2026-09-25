import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20260925210200 (the private-league policy,
 * audit A14 / DB-06) and 20260925210300 (two foreign-key indexes, audit
 * A13 / DB-05) on production. Like the other apply scripts, it records each
 * migration file whole in the history and runs that record only after its
 * sha256 matches the repository file. So each file must be carried byte for
 * byte, once, and each hash it checks must be that file's. It must stay a
 * rehearsal unless edited on purpose, and its checks must not write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const script = read("scripts/backend/apply-20260925210200-league-policy-and-fk-indexes.sql");
const MIGRATIONS = [
  { version: "20260925210200", name: "fantasy_league_visibility_policy" },
  { version: "20260925210300", name: "foreign_key_delete_path_indexes" },
].map((entry) => ({
  ...entry,
  body: read(`supabase/migrations/${entry.version}_${entry.name}.sql`),
}));

describe("apply-20260925210200-league-policy-and-fk-indexes.sql", () => {
  for (const { version, name, body } of MIGRATIONS) {
    test(`carries ${version} byte for byte and checks it before running it`, () => {
      const tag = `$bg_${version}_file$`;
      expect(body).not.toContain(tag);
      expect(occurrences(script, body)).toBe(1);
      expect(script).toContain(`array[${tag}${body}${tag}]`);
      expect(script).toContain(`  '${version}',\n  '${name}',\n  array[${tag}`);
      expect(script).toContain(
        `if encode(sha256(convert_to(part_${version}, 'UTF8')), 'hex')\n    is distinct from '${sha256(body)}' then`,
      );
      expect(occurrences(script, `execute part_${version};`)).toBe(1);
      expect(script).toContain(`migration ${version} is already recorded as applied`);
    });
  }

  test("runs the two parts in version order", () => {
    expect(script.indexOf("execute part_20260925210200;")).toBeLessThan(
      script.indexOf("execute part_20260925210300;"),
    );
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
      "the database is missing what this update changes",
      "part of this update already exists, but the migrations are not recorded",
      "the Fantasy lifecycle tick is on",
      "email is not off",
      // The two league policies as production held them on 2026-09-25
      // (md5 of pg_policies.qual, read there).
      "is distinct from '4e1d4decf045c301202afc6beb178f67 PERMISSIVE SELECT {authenticated}' then",
      "is distinct from '69775893ada04e934d9530fdd6c67840 PERMISSIVE SELECT {authenticated}' then",
      "the league tables carry policies this update does not know about",
      "lock table app.fantasy_leagues in access exclusive mode;",
      "lock table app.stories, app_private.notification_email_unsubscribe_tokens in share mode;",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("locks exactly the tables the migrations change", () => {
    const policyTables = [
      ...MIGRATIONS[0].body.matchAll(/(?:drop|create) policy [a-z_]+ on ([a-z_.]+)/g),
    ].map((match) => match[1]);
    const indexTables = [
      ...MIGRATIONS[1].body.matchAll(/create index [a-z_]+\n {2}on ([a-z_.]+) /g),
    ].map((match) => match[1]);
    expect([...new Set(policyTables)]).toEqual(["app.fantasy_leagues"]);
    expect(indexTables.sort()).toEqual([
      "app.stories",
      "app_private.notification_email_unsubscribe_tokens",
    ]);
  });

  test("afterwards: helper private to the policy, policy fixed, no recursion, indexes as reviewed", () => {
    for (const check of [
      "the helper is not SECURITY DEFINER with an empty search_path",
      "the helper is executable by the wrong roles",
      " gained access it must not have",
      "fantasy_leagues_visible_select is not the new version",
      "the league policies still recurse",
      "authenticated can read app.fantasy_leagues directly",
      "the helper says no for an active member",
      "the helper says yes for a league that does not exist",
      "the helper says yes for another account",
      "an index is missing or not the reviewed definition",
      "an index is not valid",
      "history rows missing",
    ]) {
      expect({ check, found: script.includes(check) }).toEqual({ check, found: true });
    }
  });

  test("the postflight's index definitions are the ones the migration creates", () => {
    for (const [index, table, column] of [
      ["stories_import_converted_by_idx", "app.stories", "import_converted_by"],
      [
        "notification_email_unsubscribe_tokens_delivery_idx",
        "app_private.notification_email_unsubscribe_tokens",
        "delivery_id",
      ],
    ]) {
      expect(MIGRATIONS[1].body).toContain(
        `create index ${index}\n  on ${table} (${column})\n  where ${column} is not null;`,
      );
      expect(script).toContain(
        `'CREATE INDEX ${index} ON ${table} USING btree (${column}) WHERE (${column} IS NOT NULL)'`,
      );
    }
  });

  test("the postflight writes nothing", () => {
    const postflight = script.slice(
      script.indexOf("do $postflight$"),
      script.indexOf("$postflight$;"),
    );
    expect(postflight.length).toBeGreaterThan(0);
    // Statements only: string literals (the expected index definitions) and
    // comments are blanked first.
    const statements = postflight.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
    expect(statements).not.toMatch(
      /\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+[a-z_.]+\s+set\b|\bgrant\b|\brevoke\b|\bcreate\b|\bdrop\b|\balter\b/i,
    );
    // The one role switch is made inside a block that always ends in an
    // exception, so PostgreSQL undoes it with the block.
    const roleSwitch = postflight.indexOf("perform set_config('role', 'authenticated', true);");
    expect(roleSwitch).toBeGreaterThan(0);
    const block = postflight.slice(roleSwitch, postflight.indexOf("end;", roleSwitch));
    expect(block).toContain(
      "raise exception using errcode = 'P0001', message = 'direct_read_allowed';",
    );
    expect(block).toContain("when insufficient_privilege then null;");
  });
});
