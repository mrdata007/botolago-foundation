import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, SCRIPT_PATH, build } from "./build-apply-premium-foundation";

const root = join(import.meta.dir, "../..");
const script = readFileSync(join(root, SCRIPT_PATH), "utf8");
const migrationFile = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");

describe("guarded apply script for the BotolaGO+ backend", () => {
  test("is exactly what the builder produces from the migration files", () => {
    expect(script).toBe(build());
  });

  test("carries each migration byte for byte and pins its sha256 before executing it", () => {
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

  test("runs the migrations in version order", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect([...versions].sort()).toEqual(versions);
    const positions = versions.map((v) => script.indexOf(`execute part_${v};`));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test("ships as a rehearsal that raises on purpose, and refuses when not safe", () => {
    expect(script).toContain("select set_config('bg.premium_mode', 'rehearsal', true);");
    expect(script).toContain("REHEARSAL PASSED -- nothing was saved");
    expect(script).toContain("automatic account deletion is on");
    expect(script).toContain("a BotolaGO+ migration is already recorded as applied");
    expect(script).toContain("is not the repository file byte for byte");
    // The only commit is the one after the rehearsal's deliberate error.
    expect(script.match(/^commit;$/gm)?.length).toBe(1);
    expect(script.indexOf("do $finish$")).toBeLessThan(script.indexOf("\ncommit;\n"));
  });

  test("ships everything off and empty, and checks it", () => {
    expect(script).toContain(
      "premium_settings is not one row with mode off, checkout off and billing not paused",
    );
    expect(script).toContain("plus_monthly/1/true/2000/MAD,plus_yearly/12/false/20000/MAD");
    expect(script).toContain("a member row exists -- none may ship");
    expect(script).toContain("a premium or billing job was scheduled");
  });
});
