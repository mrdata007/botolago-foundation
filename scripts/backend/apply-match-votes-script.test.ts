import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts the match votes (20260925234000) on production.
 * It records the migration file whole in the history, then runs that record
 * only after its sha256 matches the repository file. So the file must be
 * carried byte for byte, once, and the hash the script checks must be the
 * file's: a migration edited after the script was built fails here, not on
 * production. The script must stay a rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260925234000";
const NAME = "match_votes";
const script = read("scripts/backend/apply-20260925234000-match-votes.sql");
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe("apply-20260925234000-match-votes.sql", () => {
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

  test("ships as a rehearsal: one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
  });

  test("checks everything before its first write: twice, prerequisites, jobs paused, no match on", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "migration 20260925234000 is already recorded as applied",
      "app.match_votes already exists",
      "Pronostics parts 1 to 5 are not applied yet",
      "migration 20260924160000 (account bans)",
      // AGENTS.md's pauses for a write that touches fixture tables.
      "stop: the Fantasy lifecycle tick is on",
      "stop: the live score refresh is on",
      "stop: a match is being played",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks the result: row security, who may call what, and a visitor's read", () => {
    expect(script).toContain("app.match_votes does not force row security");
    expect(script).toContain("api.cast_match_vote is callable by the wrong roles");
    expect(script).toContain("answer := api.match_votes(next_fixture);");
  });
});
