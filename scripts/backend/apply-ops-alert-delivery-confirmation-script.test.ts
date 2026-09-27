import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts alert delivery confirmation (20260926113000)
 * on production. It records the migration file whole in the history, then
 * runs that record only after its sha256 matches the repository file. So the
 * file must be carried byte for byte, once, and the hash the script checks
 * must be the file's: a migration edited after the script was built fails
 * here, not on production. The script must stay a rehearsal unless edited on
 * purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260926113000";
const NAME = "ops_alert_delivery_confirmation";
const script = read("scripts/backend/apply-20260926113000-ops-alert-delivery-confirmation.sql");
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe("apply-20260926113000-ops-alert-delivery-confirmation.sql", () => {
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

  test("checks everything before its first write: twice, prerequisites, what it replaces", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "app_private.ops_alert_channels already exists",
      "migration 20260926001000 (ops alert email)",
      "net._http_response",
      "pg_cron job ops-alert-tick",
      "an alert function is not the text this update was written against",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks the result without sending anything", () => {
    expect(script).toContain("a channel did not start from the alert state as it was");
    expect(script).toContain("app_private.ops_alert_channels is readable by an API role");
    expect(script).toContain("an owner-only alert function is callable by an API role");
    expect(script).toContain("alerts were switched on or off by the update");
    expect(script).toContain("the alert address was changed by the update");
    const postflight = script.slice(script.indexOf("do $postflight$"));
    expect(postflight).not.toMatch(/(select|perform) app_private\.ops_alert_(tick|test|send)/);
  });
});
