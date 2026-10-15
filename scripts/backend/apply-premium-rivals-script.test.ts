import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAIN_MIGRATIONS,
  MAIN_SCRIPT_PATH,
  PREREQUISITES,
  TYPE_MIGRATIONS,
  TYPE_SCRIPT_PATH,
  buildMain,
  buildType,
} from "./build-apply-premium-rivals";

const root = join(import.meta.dir, "../..");
const typeScript = readFileSync(join(root, TYPE_SCRIPT_PATH), "utf8");
const mainScript = readFileSync(join(root, MAIN_SCRIPT_PATH), "utf8");
const migrationFile = (version: string, name: string) =>
  readFileSync(join(root, `supabase/migrations/${version}_${name}.sql`), "utf8");

describe("guarded apply scripts for BotolaGO+ Rivaux", () => {
  test("are exactly what the builder produces from the migration files", () => {
    expect(typeScript).toBe(buildType());
    expect(mainScript).toBe(buildMain());
  });

  test("carry each migration byte for byte and pin its sha256 before executing it", () => {
    const pairs = [
      [typeScript, TYPE_MIGRATIONS],
      [mainScript, MAIN_MIGRATIONS],
    ] as const;
    for (const [script, list] of pairs) {
      for (const { version, name } of list) {
        const text = migrationFile(version, name);
        expect(script.split(`$bg_${version}_file$`)[1]).toBe(text);
        const sha = createHash("sha256").update(text).digest("hex");
        expect(script).toContain(`is distinct from '${sha}'`);
        expect(script.indexOf(`is distinct from '${sha}'`)).toBeLessThan(
          script.indexOf(`execute part_${version};`),
        );
      }
    }
  });

  test("the main script runs the migrations in order and refuses without step 1", () => {
    expect(MAIN_MIGRATIONS.map((m) => m.version)).toEqual(["20261015130100", "20261015130200"]);
    expect(mainScript.indexOf("execute part_20261015130100;")).toBeLessThan(
      mainScript.indexOf("execute part_20261015130200;"),
    );
    expect(mainScript).toContain("'20261015130000'");
    expect(mainScript).toContain("step 1 has not saved");
    for (const version of PREREQUISITES) {
      expect(mainScript).toContain(`'${version}'`);
      expect(version < TYPE_MIGRATIONS[0].version).toBe(true);
    }
    expect([...PREREQUISITES].sort()).toEqual([...PREREQUISITES]);
    expect(PREREQUISITES).toContain("20261013100400");
  });

  test("every migration slot is inside the lane's range", () => {
    for (const { version } of [...TYPE_MIGRATIONS, ...MAIN_MIGRATIONS]) {
      expect(version >= "20261015130000" && version <= "20261015130900").toBe(true);
    }
  });

  test("both ship as a rehearsal that raises on purpose, with one commit after it", () => {
    for (const [script, mode] of [
      [typeScript, "bg.rivals_type_mode"],
      [mainScript, "bg.rivals_mode"],
    ] as const) {
      expect(script).toContain(`select set_config('${mode}', 'rehearsal', true);`);
      expect(script).toContain("REHEARSAL PASSED -- nothing was saved");
      expect(script).toContain("is already recorded as applied");
      expect(script).toContain("is not the repository file byte for byte");
      expect(script.match(/^commit;$/gm)?.length).toBe(1);
      expect(script.indexOf("do $finish$")).toBeLessThan(script.indexOf("\ncommit;\n"));
    }
  });

  test("the main script replaces only the two push rules, adds exactly four tables and two jobs, ships off", () => {
    const replaced = [...mainScript.matchAll(/create or replace function ([\w.]+)/gi)].map(
      (m) => m[1],
    );
    expect([...new Set(replaced)].sort()).toEqual([
      "app_private.notification_push_topic",
      "app_private.notification_push_ttl",
    ]);
    expect(mainScript).toContain("the push rules do not answer as expected");
    expect(mainScript).toContain("an existing function changed -- this script replaces none");
    expect(mainScript).toContain("the number of tables did not grow by exactly 4");
    expect(mainScript).toContain("the number of scheduled jobs did not grow by exactly two");
    expect(mainScript).toContain("the tick''s switch is not one row, off");
    expect(mainScript).toContain("the tick does not answer off");
    expect(mainScript).toContain("the read does not answer off while BotolaGO+ is off");
    expect(mainScript).toContain("does not force row security");
    expect(mainScript).toContain("rivals-tick is not scheduled at 7,22,37,52 and active");
  });

  test("the migrations add no ungated writer: the tick is switched off by default", () => {
    const tick = migrationFile("20261015130200", "rivals_tick");
    const base = migrationFile("20261015130100", "rivals");
    expect(base).toContain(
      "insert into app_private.rivals_settings (id, enabled) values (true, false);",
    );
    expect(base).toContain("notify_lead_change boolean not null default false");
    expect(tick).toContain("return jsonb_build_object('outcome', 'off');");
    // The push follows the Manager Card rating change: pending rows for the push claim, which sends
    // them only while the push switch allows.
    expect(tick).toMatch(/'push', device\.id, device\.push_provider::text, 'pending'/);
    expect(tick).toContain("when 'rival_lead_change' then 'fantasy'");
    expect(tick).toContain("when 'rival_lead_change' then interval '12 hours'");
  });
});
