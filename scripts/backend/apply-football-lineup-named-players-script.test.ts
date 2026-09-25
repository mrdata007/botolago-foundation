import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script the owner runs in the Supabase SQL editor to put the
 * named lineup players (20260925170000) on production: the migration carried
 * byte for byte and run only once its sha256 matches, each replaced function
 * checked by the md5 of its source before and after. It must stay a
 * rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925170000";
const NAME = "football_lineup_named_players";
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const script = read(`scripts/backend/apply-${VERSION}-football-lineup-named-players.sql`);

/** The text between `as $$` and `$$;` of one function in a migration: what `prosrc` holds. */
function source(sql: string, signature: string): string {
  const start = sql.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThan(-1);
  const body = sql.indexOf("as $$", start) + "as $$".length;
  return sql.slice(body, sql.indexOf("$$;", body));
}

const SIGNATURES = [
  "api.ingest_football_match_details(",
  "api.service_football_match_details_due(",
  "api.football_match_lineups(",
] as const;

describe(`apply-${VERSION}-football-lineup-named-players.sql`, () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = `$bg_${VERSION}_file$`;
    expect(migration).not.toContain(tag);
    expect(occurrences(script, migration)).toBe(1);
    expect(script).toContain(`  '${VERSION}',\n  '${NAME}',\n  array[${tag}${migration}${tag}]`);
    expect(script).toContain(
      `if encode(sha256(convert_to(part_${VERSION}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
    );
    expect(occurrences(script, `execute part_${VERSION};`)).toBe(1);
  });

  test("ships as a rehearsal: one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
  });

  test("refuses to replace a function that is not the one it was written against", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    const previous = read(
      "supabase/migrations/20260925141500_football_match_details_ingestion.sql",
    );
    const security = read("supabase/migrations/20260720095354_football_api_security.sql");
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "the match details (20260925141500) are not applied yet",
      "app.lineup_players.player_name already exists",
      `<> '${md5(source(previous, SIGNATURES[0]))}' then`,
      `<> '${md5(source(previous, SIGNATURES[1]))}' then`,
      `<> '${md5(source(security, SIGNATURES[2]))}' then`,
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        found: true,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks every new function body is the migration's, and who may call it", () => {
    for (const [signature, variable] of [
      [SIGNATURES[0], "ingest"],
      [SIGNATURES[1], "due"],
      [SIGNATURES[2], "lineups"],
    ] as const) {
      expect(script).toContain(
        `md5((select prosrc from pg_proc where oid = ${variable})) <> '${md5(source(migration, signature))}'`,
      );
    }
    expect(script).toContain("a function is callable by the wrong roles");
    expect(script).toContain("app.lineup_players is not as the migration leaves it");
    expect(script).toContain("a stored lineup row changed");
    expect(script).toContain("a done mark was left");
  });
});
