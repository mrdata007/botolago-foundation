import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script the owner runs in the Supabase SQL editor to put the
 * match-details ingestion (20260925141500) on production.
 *
 * It records the migration file whole in the history, then runs that record
 * only after its sha256 matches the repository file, and checks each new
 * function body by the md5 of its source. So the file must be carried byte for
 * byte, once, and every hash must be the current file's: a migration edited
 * after the script was built fails here, not on production. It must stay a
 * rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925141500";
const NAME = "football_match_details_ingestion";
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const script = read(`scripts/backend/apply-${VERSION}-football-match-details.sql`);

/** The text between `as $$` and `$$;` of one function in a migration: what `prosrc` holds. */
function source(sql: string, signature: string): string {
  const start = sql.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThan(-1);
  const body = sql.indexOf("as $$", start) + "as $$".length;
  return sql.slice(body, sql.indexOf("$$;", body));
}

describe(`apply-${VERSION}-football-match-details.sql`, () => {
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

  test("refuses to run twice, or over a tick it does not know, before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    const cadence = read("supabase/migrations/20260924200500_football_live_refresh_cadence.sql");
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "the live-refresh cadence (20260924200500) is not applied yet",
      "a match-details function or table already exists",
      // The tick as 20260924200500 wrote it, which production held on 2026-09-25.
      `<> '${md5(source(cadence, "app_private.football_live_refresh_tick()"))}' then`,
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
      ["api.ingest_football_match_details(", "ingest"],
      ["api.service_football_match_details_due(", "due"],
      ["api.football_match_pressure(", "pressure"],
      ["api.football_match_absences(", "absences"],
      ["app_private.football_live_refresh_tick()", "tick"],
    ] as const) {
      expect(script).toContain(
        `md5((select prosrc from pg_proc where oid = ${variable})) <> '${md5(source(migration, signature))}'`,
      );
    }
    expect(script).toContain("a function is callable by the wrong roles");
    expect(script).toContain("a new table is open to an API role");
    expect(script).toContain("the xG statistics are not defined");
    expect(script).toContain(
      "answer := api.service_football_match_details_due('sportsmonks', '28647', 'backfill', 10);",
    );
  });
});
