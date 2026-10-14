import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIGRATIONS,
  PREREQUISITES,
  SCRIPT_PATH,
  build,
} from "./build-apply-premium-card-league-context";

const root = join(import.meta.dir, "../..");
const script = readFileSync(join(root, SCRIPT_PATH), "utf8");
const migrationFile = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");

describe("guarded apply script for the BotolaGO+ league context read", () => {
  test("is exactly what the builder produces from the migration file", () => {
    expect(script).toBe(build());
  });

  test("carries the migration byte for byte and pins its sha256 before executing it", () => {
    for (const { version, name } of MIGRATIONS) {
      const text = migrationFile(version, name);
      const tag = `$bg_${version}_file$`;
      expect(script.split(tag)[1]).toBe(text);
      const sha = createHash("sha256").update(text).digest("hex");
      expect(script).toContain(`is distinct from '${sha}'`);
      expect(script.indexOf(`is distinct from '${sha}'`)).toBeLessThan(
        script.indexOf(`execute part_${version};`),
      );
    }
  });

  test("refuses unless the foundation and both card reads are recorded", () => {
    for (const version of PREREQUISITES) expect(script).toContain(`'${version}'`);
    // The prerequisites are older than the migration, in order, and include the premium card reads.
    const newest = MIGRATIONS[0].version;
    for (const version of PREREQUISITES) expect(version < newest).toBe(true);
    expect([...PREREQUISITES].sort()).toEqual([...PREREQUISITES]);
    expect(PREREQUISITES).toContain("20261013100400");
    expect(script).toContain("migrations this builds on are not applied yet");
    expect(script).toContain("is already recorded as applied");
    expect(script).toContain("is not the repository file byte for byte");
  });

  test("ships as a rehearsal that raises on purpose, with one commit after it", () => {
    expect(script).toContain("select set_config('bg.league_context_mode', 'rehearsal', true);");
    expect(script).toContain("REHEARSAL PASSED -- nothing was saved");
    expect(script.match(/^commit;$/gm)?.length).toBe(1);
    expect(script.indexOf("do $finish$")).toBeLessThan(script.indexOf("\ncommit;\n"));
  });

  test("replaces nothing, adds no table or job, and checks that it is off and read-only", () => {
    expect(script).not.toMatch(/create or replace/i);
    expect(script).toContain("an existing premium card read changed -- this script replaces none");
    expect(script).toContain("the number of tables changed -- this script adds none");
    expect(script).toContain("the number of scheduled jobs changed -- this script adds none");
    expect(script).toContain("the read does not answer off while BotolaGO+ is off");
    expect(script).toContain("is not STABLE security definer with an empty search_path");
  });
});
