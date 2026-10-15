import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, PREREQUISITES, SCRIPT_PATH, build } from "./build-apply-trophies";

const root = join(import.meta.dir, "../..");
const script = readFileSync(join(root, SCRIPT_PATH), "utf8");
const migrationFile = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");

describe("guarded apply script for the BotolaGO+ Trophées backend", () => {
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

  test("runs the migrations in order, inside the slot assigned to this lane", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect([...versions].sort()).toEqual([...versions]);
    for (const version of versions) {
      expect(version >= "20261015150000" && version <= "20261015150900").toBe(true);
    }
    const positions = versions.map((v) => script.indexOf(`execute part_${v};`));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test("refuses unless the foundation and the premium reads are recorded", () => {
    for (const version of PREREQUISITES) expect(script).toContain(`'${version}'`);
    for (const version of PREREQUISITES) expect(version < MIGRATIONS[0].version).toBe(true);
    expect([...PREREQUISITES].sort()).toEqual([...PREREQUISITES]);
    expect(PREREQUISITES).toContain("20261013100400");
    expect(PREREQUISITES).toContain("20261014150000");
    expect(script).toContain("migrations this builds on are not applied yet");
    expect(script).toContain("is already recorded as applied");
    expect(script).toContain("is not the repository file byte for byte");
    expect(script).toContain("a Trophées job is already scheduled");
  });

  test("ships as a rehearsal that raises on purpose, with one commit after it", () => {
    expect(script).toContain("select set_config('bg.trophies_mode', 'rehearsal', true);");
    expect(script).toContain("REHEARSAL PASSED -- nothing was saved");
    expect(script.match(/^commit;$/gm)?.length).toBe(1);
    expect(script.indexOf("do $finish$")).toBeLessThan(script.indexOf("\ncommit;\n"));
  });

  test("replaces nothing, adds exactly two jobs, and checks that it is off and writes nothing", () => {
    // The script's own text replaces nothing; the migration files it carries may use
    // `create or replace` only for functions they create (none do today).
    for (const { version, name } of MIGRATIONS) {
      expect(migrationFile(version, name)).not.toMatch(/create or replace/i);
    }
    expect(script).toContain("an existing function changed -- this script replaces none");
    expect(script).toContain("the number of scheduled jobs did not grow by exactly two");
    expect(script).toContain("the cabinet does not answer off while BotolaGO+ is off");
    expect(script).toContain("the pass does not answer off");
    expect(script).toContain("the evaluator is not switched off");
    expect(script).toContain("the never-taken-back triggers are not both there");
    expect(script).toContain(
      "a trophy, a frame choice or a visibility row exists -- this script adds none",
    );
  });

  test("never evaluates a past season: it grants nothing and checks the evaluator's guard", () => {
    // Outside the carried migration files, the script runs no evaluation (a trophy granted in
    // apply mode would be committed).
    const own = [
      script.split("$bg_20261015150000_file$")[0],
      script.split("$bg_20261015150200_file$")[2] ?? "",
    ].join("\n");
    expect(own).not.toMatch(
      /(select|perform)\s+app_private\.(trophies_evaluate_\w+|trophy_grant)\(/,
    );
    expect(own).toContain(
      "the evaluator does not refuse a past season, or does not wait for the end of the season",
    );
    expect(own).toContain("'currentSeasonOnly', true");
    // the migration itself holds the guard and the wait for the end of the season
    const evaluator = migrationFile("20261015150100", "trophies_evaluator");
    expect(evaluator).toContain("is distinct from app_private.manager_card_fantasy_season()");
    expect(evaluator).toContain("app_private.trophy_season_end(p_season)");
  });

  test("checks the visibility switch and the mates read: step-up trigger, off answers", () => {
    expect(script).toContain("' lacks the step-up trigger'");
    expect(script).toContain("the step-up trigger was not added to exactly two tables");
    expect(script).toContain("the visibility switch does not answer off while BotolaGO+ is off");
    expect(script).toContain("the league mates read does not answer off while BotolaGO+ is off");
  });
});
