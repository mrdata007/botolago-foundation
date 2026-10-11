import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PINS } from "./build-apply-sofascore-automatic";

/**
 * The guarded script that puts 20261011190000 (the SofaScore Fantasy recorder
 * accepts confirmed unknown substitutes) on production. Like the other apply
 * scripts, it records the migration file whole in the history and runs that
 * record only after its sha256 matches the repository file. It must stay a
 * rehearsal unless edited on purpose, and it replaces only the recorder it was
 * reviewed against.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261011190000";
const NAME = "sofascore_unmapped_substitutes";
const script = read(`scripts/backend/apply-${VERSION}-sofascore-unmapped-substitutes.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-sofascore-unmapped-substitutes.sql`, () => {
  test("carries the migration byte for byte and checks it before running it", () => {
    const tag = `$bg_${VERSION}_file$`;
    expect(migration).not.toContain(tag);
    expect(occurrences(script, migration)).toBe(1);
    expect(script).toContain(`array[${tag}${migration}${tag}]`);
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

  test("replaces only the recorder reviewed in the automatic release (its md5 pin)", () => {
    expect(script).toContain(`'${PINS.sofascoreFantasyObservation}'`);
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "are not both recorded",
      "is not the reviewed version this script replaces",
      "the recorder is running right now",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, beforeFirstWrite: at !== -1 && at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: the new text, only the service role may call it, the history row", () => {
    for (const check of [
      "the recorder is not the new text",
      "visitors or signed-in users can call the recorder",
      "the service role cannot call the recorder",
      "history row missing",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });

  test("the migration replaces one function and keeps its grants", () => {
    const creates = migration.match(/^create (or replace )?function /gm) ?? [];
    expect(creates).toEqual(["create or replace function "]);
    expect(migration).toContain(
      "revoke all on function api.service_record_sofascore_fantasy_observation(uuid, jsonb, boolean) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function api.service_record_sofascore_fantasy_observation(uuid, jsonb, boolean) to service_role;",
    );
  });
});
