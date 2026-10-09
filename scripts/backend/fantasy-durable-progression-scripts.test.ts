import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(import.meta.dir, "../..", path), "utf8");
const migration = read("supabase/migrations/20261009091728_fantasy_durable_progression.sql");
const install = read("scripts/backend/apply-fantasy-durable-progression.sql");
const recover = read("scripts/backend/recover-fantasy-gw3.sql");

describe("durable progression production scripts", () => {
  test("promotes the reviewed migration byte-for-byte with its exact history version", () => {
    expect(install.split("$migration$")[1]).toBe(migration);
    expect(install).toContain(createHash("sha256").update(migration).digest("hex"));
    expect(install).toContain("values ('20261009091728','fantasy_durable_progression'");
  });

  for (const [name, script] of [
    ["install", install],
    ["recovery", recover],
  ]) {
    test(`${name} defaults to rollback and restores the prior switch under a cron interlock`, () => {
      expect(script.match(/^rollback;$/gm)).toHaveLength(1);
      expect(script).not.toMatch(/^commit;$/m);
      expect(script.indexOf("select app_private.hold_scheduled_jobs();")).toBeLessThan(
        script.indexOf("select app_private.fantasy_automation_configure(false);"),
      );
      expect(script).toMatch(
        /fantasy_automation_configure\(\(select lifecycle_tick_enabled from fantasy_\w+_settings\)\)/,
      );
    });
  }

  test("recovery targets GW3 from the exact completed GW2 version and locks before commit", () => {
    expect(recover).toContain(
      "previous_id constant uuid := 'd4324127-ce55-4943-973f-4cf2f9a12780'",
    );
    expect(recover).toContain("next_id constant uuid := '0b455d0b-7289-4c93-b237-8f16ce4b159e'");
    expect(recover).toContain("calculation constant bigint := 2;");
    expect(recover).toContain("api.service_advance_fantasy_lifecycle(");
    expect(recover).toContain("raise exception 'stop: an unlocked lineup remains'");
    expect(recover).not.toMatch(/set status\s*=\s*'open'/);
  });
});
