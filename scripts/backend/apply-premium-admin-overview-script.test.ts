import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIGRATIONS,
  PREREQUISITES,
  SCRIPT_PATH,
  build,
} from "./build-apply-premium-admin-overview";

const root = join(import.meta.dir, "../..");
const script = readFileSync(join(root, SCRIPT_PATH), "utf8");

describe("guarded apply script for the BotolaGO+ admin overview by product", () => {
  test("is exactly what the builder produces from the migration file", () => {
    expect(script).toBe(build());
  });

  test("carries the migration byte for byte and pins its sha256 before executing it", () => {
    const { version, name } = MIGRATIONS[0];
    const text = readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");
    expect(script.split(`$bg_${version}_file$`)[1]).toBe(text);
    const sha = createHash("sha256").update(text).digest("hex");
    expect(script.indexOf(`is distinct from '${sha}'`)).toBeGreaterThan(0);
    expect(script.indexOf(`is distinct from '${sha}'`)).toBeLessThan(
      script.indexOf(`execute part_${version};`),
    );
  });

  test("refuses unless the foundation is recorded, and refuses a second run", () => {
    for (const version of PREREQUISITES) {
      expect(script).toContain(`'${version}'`);
      expect(version < MIGRATIONS[0].version).toBe(true);
    }
    expect(script).toContain("migrations this builds on are not applied yet");
    expect(script).toContain("is already recorded as applied");
    expect(script).toContain("already counts members by product");
  });

  test("ships as a rehearsal that raises on purpose, with one commit after it", () => {
    expect(script).toContain("select set_config('bg.premium_overview_mode', 'rehearsal', true);");
    expect(script).toContain("REHEARSAL PASSED -- nothing was saved");
    expect(script.match(/^commit;$/gm)?.length).toBe(1);
    expect(script.indexOf("do $finish$")).toBeLessThan(script.indexOf("\ncommit;\n"));
  });

  test("replaces one function and checks it added nothing", () => {
    const migration = readFileSync(
      join(root, "supabase/migrations/20261013100500_premium_admin_overview_by_product.sql"),
      "utf8",
    );
    expect(migration.match(/create or replace function/gi)?.length).toBe(1);
    expect(migration).not.toMatch(/create (table|function|trigger|index)/i);
    expect(script).toContain("the number of api functions changed -- this script adds none");
    expect(script).toContain("the number of scheduled jobs changed -- this script adds none");
  });
});
