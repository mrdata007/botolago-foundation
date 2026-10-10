import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261005100000 (the push dispatcher's claim) on
 * production. Like the other apply scripts, it records the migration file
 * whole in the history and runs that record only after its sha256 matches the
 * repository file, so the file must be carried byte for byte, once, and the
 * hash it checks must be the file's. It must stay a rehearsal unless edited on
 * purpose, and it must never switch push on: that is a separate, later step.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261005100000";
const NAME = "push_delivery_claim";
const script = read(`scripts/backend/apply-${VERSION}-push-delivery-claim.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

describe(`apply-${VERSION}-push-delivery-claim.sql`, () => {
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

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("checks production is as reviewed before writing anything", () => {
    const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");
    expect(firstWrite).toBeGreaterThan(0);
    for (const guard of [
      "set local lock_timeout = '5s';",
      `migration ${VERSION} is already recorded as applied`,
      "the notification tables this builds on are missing",
      "app_private.is_service_request is missing",
      "app_private.notification_email_event_is_stale is missing",
      "api.service_record_notification_delivery_attempt is missing or has another signature",
      "api.service_invalidate_notification_device is missing",
      "app_private.notification_push_settings already exists",
      "one of the push dispatcher functions already exists",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("afterwards: dispatcher-only claim and release, owner-only switch, off, and a claim while off changes nothing", () => {
    for (const check of [
      "there is not exactly one claim and one release function",
      "the dispatcher (service role) cannot claim or release",
      "something other than the dispatcher can claim or release",
      "push can be switched on by something other than the owner",
      "the push switch is not one row, off",
      "a claim while push is off handed out",
      "a claim while push is off changed deliveries",
      "a claim without the service role was accepted",
    ]) {
      expect({ check, present: script.includes(check) }).toEqual({ check, present: true });
    }
  });

  test("never switches push on, in the script or in the migration", () => {
    // Comments may name the switch; the statements may not use it.
    const code = (text: string) =>
      text
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
    for (const text of [script, migration]) {
      expect(code(text)).not.toMatch(/select\s+app_private\.notification_push_configure\s*\(/i);
      expect(code(text)).not.toMatch(/set\s+mode\s*=\s*'(testers|live)'/i);
    }
    // The only switch the migration creates is the one shipped off.
    expect(migration).toContain("mode text not null default 'off'");
    expect(migration).toContain(
      "insert into app_private.notification_push_settings (id) values (true)",
    );
  });
});
