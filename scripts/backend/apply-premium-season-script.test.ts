import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIGRATIONS,
  NEW_API,
  NEW_HELPERS,
  PREREQUISITES,
  REPLACED,
  SCRIPT_PATH,
  build,
} from "./build-apply-premium-season";

const root = join(import.meta.dir, "../..");
const script = readFileSync(join(root, SCRIPT_PATH), "utf8");
const migrationFile = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");

describe("guarded apply script for BotolaGO+ Saison", () => {
  test("is exactly what the builder produces from the migration files", () => {
    expect(script).toBe(build());
  });

  test("carries both migrations byte for byte and pins each sha256 before executing it", () => {
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
    // The schema runs before the API that reads it.
    expect(script.indexOf("execute part_20261016150000;")).toBeLessThan(
      script.indexOf("execute part_20261016150100;"),
    );
  });

  test("refuses unless the foundation, the API, the erasure and the prizes are recorded", () => {
    for (const version of PREREQUISITES) expect(script).toContain(`'${version}'`);
    const oldest = MIGRATIONS[0].version;
    for (const version of PREREQUISITES) expect(version < oldest).toBe(true);
    expect([...PREREQUISITES].sort()).toEqual([...PREREQUISITES]);
    expect(PREREQUISITES).toContain("20261013100200");
    expect(PREREQUISITES).toContain("20260924120000");
    expect(script).toContain("migrations this builds on are not applied yet");
    expect(script).toContain("is already recorded as applied");
    expect(script).toContain("one of the Saison objects already exists");
    expect(script).toContain("is not the repository file byte for byte");
  });

  test("ships as a rehearsal that raises on purpose, with one commit after it", () => {
    expect(script).toContain("select set_config('bg.premium_season_mode', 'rehearsal', true);");
    expect(script).toContain("REHEARSAL PASSED -- nothing was saved");
    expect(script.match(/^commit;$/gm)?.length).toBe(1);
    expect(script.indexOf("do $finish$")).toBeLessThan(script.indexOf("\ncommit;\n"));
  });

  test("checks that no grant or product row is lost and the old products are inactive, not deleted", () => {
    expect(script).toContain("a grant was lost or added");
    expect(script).toContain("an entitlement changed");
    expect(script).toContain("a billing event was lost or added");
    expect(script).toContain("the product rows are not the old ones plus plus_season");
    expect(script).toContain("plus_monthly or plus_yearly changed in more than its active flag");
    expect(script).toContain("'plus_monthly:false,plus_season:true,plus_yearly:false'");
    expect(script).toContain("an earlier grant carries a payment record");
  });

  test("checks the new objects, what it replaces, and that it is off and adds no job", () => {
    expect(NEW_API).toHaveLength(6);
    for (const signature of [...NEW_API, ...NEW_HELPERS, ...REPLACED]) {
      expect(script).toContain(`'${signature}'`);
    }
    expect(script).toContain("the payment details are not one empty row");
    expect(script).toContain("does not have forced row security");
    expect(script).toContain("was not replaced");
    expect(script).toContain("who may run a replaced function changed");
    expect(script).toContain("the BotolaGO+ switch changed -- this script does not touch it");
    expect(script).toContain("the reads do not answer off while BotolaGO+ is off");
    expect(script).toContain("is not security definer with an empty search_path");
    expect(script).toContain("the number of scheduled jobs changed -- this script adds none");
    expect(script).toContain("the number of tables is not the old one plus two");
  });

  test("never deletes a row or drops an object", () => {
    // The only text allowed to say "delete" or "drop" is the migration files' own comments and
    // the table-level rights; the script's own statements have none.
    const own = script
      .split(/\$bg_\d+_file\$/)
      .filter((_, index) => index % 2 === 0)
      .join("\n");
    expect(own).not.toMatch(/^\s*(delete from|drop |truncate )/im);
  });
});
