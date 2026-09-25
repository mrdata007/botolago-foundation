import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts the alert emails (20260926001000) on
 * production. It records the migration file whole in the history, then runs
 * that record only after its sha256 matches the repository file. So the file
 * must be carried byte for byte, once, and the hash the script checks must be
 * the file's: a migration edited after the script was built fails here, not
 * on production. The script must stay a rehearsal unless edited on purpose.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20260926001000";
const NAME = "ops_alert_email";
const script = read("scripts/backend/apply-20260926001000-ops-alert-email.sql");
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe("apply-20260926001000-ops-alert-email.sql", () => {
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

  test("checks everything before its first write: twice, prerequisites, the tick", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "migration 20260926001000 is already recorded as applied",
      "app_private.ops_alert_state.email_to already exists",
      "migration 20260924200200 (ops health and alerts)",
      "migration 20260924140100 (notification email delivery)",
      "pg_cron job ops-alert-tick",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("checks the result: the column, who may call what, alerts left as they were", () => {
    expect(script).toContain("app_private.ops_alert_state.email_to is missing");
    expect(script).toContain("api.service_ops_alert_email_target is callable by the wrong roles");
    expect(script).toContain("an owner-only alert function is callable by service_role");
    expect(script).toContain("alerts were switched on or off by the update");
    expect(script).toContain("an alert address is already set");
  });
});
