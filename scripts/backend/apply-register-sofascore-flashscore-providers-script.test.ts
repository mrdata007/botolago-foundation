import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script the owner runs to put 20261001150000 (registration of the
 * `sofascore` and `flashscore` providers) on production. It records the
 * migration file whole in the history and runs it only after its sha256
 * matches the repository file, so the file must be carried byte for byte. It
 * must stay a rehearsal unless edited on purpose and must check that nothing
 * but the two provider rows changed.
 */
const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const VERSION = "20261001150000";
const script = read(`scripts/backend/apply-${VERSION}-register-sofascore-flashscore-providers.sql`);
const migration = read(
  `supabase/migrations/${VERSION}_register_sofascore_flashscore_providers.sql`,
);
const tag = `$bg_${VERSION}_file$`;
const embedded = script.slice(
  script.indexOf(tag) + tag.length,
  script.indexOf(tag, script.indexOf(tag) + tag.length),
);

describe("apply script for the provider registration", () => {
  test("carries the migration file byte for byte, exactly once", () => {
    expect(script.split(tag).length - 1).toBe(2);
    expect(embedded).toBe(migration);
  });

  test("checks the file's own sha256 before running it", () => {
    expect(script).toContain(`is distinct from '${sha256(migration)}'`);
    expect(script.indexOf("execute part_")).toBeGreaterThan(script.indexOf("is distinct from"));
  });

  test("is a rehearsal as shipped: one rollback, no commit", () => {
    expect(script.split("\n").filter((line) => line === "rollback;")).toHaveLength(1);
    expect(script.split("\n").filter((line) => line.trim() === "commit;")).toEqual([]);
  });

  test("refuses a second run and an already registered provider", () => {
    expect(script).toContain("is already recorded as applied");
    expect(script).toContain("sofascore or flashscore is already registered");
  });

  test("checks that only the two rows were added and nothing else moved", () => {
    for (const phrase of [
      "did not grow by exactly two rows",
      "an earlier provider row changed",
      "the mapping table row count changed",
      "the mapping table constraints changed",
      "a mapping row names a new provider",
      "the history row is missing",
    ])
      expect(script).toContain(phrase);
  });

  test("outside the migration text it never writes to the mapping table", () => {
    const outside = script.replace(embedded, "").toLowerCase();
    for (const write of [
      "insert into app_private.football_provider_mappings",
      "update app_private.football_provider_mappings",
      "delete from app_private.football_provider_mappings",
      "alter table",
    ])
      expect(outside).not.toContain(write);
  });
});
