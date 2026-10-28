import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guarded script that puts 20261028100000 (the RapidAPI budget counted per
 * provider host, for the SportAPI plan) on production. Like the other apply
 * scripts, it records the migration file whole in the history and runs that
 * record only after its sha256 matches the repository file, so the file must be
 * carried byte for byte, once, and the hash it checks must be the file's. It must
 * stay a rehearsal unless edited on purpose, and the md5 pins of the seven
 * functions it replaces must be those the earlier migrations define.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION = "20261028100000";
const NAME = "rapidapi_budget_per_host";
const script = read(`scripts/backend/apply-${VERSION}-rapidapi-budget-per-host.sql`);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);

/** The body (between the first pair of $$) of a function as one migration defines it. */
function bodyOf(file: string, qualified: string): string {
  const sql = read(`supabase/migrations/${file}`);
  const start = new RegExp(
    `create (?:or replace )?function ${qualified.replace(".", "\\.")}\\(`,
  ).exec(sql);
  if (!start) throw new Error(`${qualified} not in ${file}`);
  const open = sql.indexOf("$$", start.index + start[0].length);
  const close = sql.indexOf("$$", open + 2);
  return sql.slice(open + 2, close);
}

describe(`apply-${VERSION}-rapidapi-budget-per-host.sql`, () => {
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
      "set local timezone = 'UTC';",
      `migration ${VERSION} is already recorded as applied`,
      "migration 20261027100000 (the provider quota floor) is not applied",
      "a per-host budget already exists",
    ]) {
      const at = script.indexOf(guard);
      expect(`${guard}: ${at > 0 && at < firstWrite}`).toBe(`${guard}: true`);
    }
  });

  test("pins the body of every function it replaces to the last repository definition", () => {
    const pins: [string, string, string][] = [
      [
        "app_private.rapidapi_calls_this_month()",
        "20261027100000_rapidapi_provider_quota_floor.sql",
        "app_private.rapidapi_calls_this_month",
      ],
      [
        "app_private.rapidapi_live_interval_seconds()",
        "20261026143000_rapidapi_budget_guard_and_poll_schedule.sql",
        "app_private.rapidapi_live_interval_seconds",
      ],
      [
        "app_private.rapidapi_budget_health()",
        "20261013110000_rapidapi_call_budget.sql",
        "app_private.rapidapi_budget_health",
      ],
      [
        "api.admin_rapidapi_calls_this_month()",
        "20261026143000_rapidapi_budget_guard_and_poll_schedule.sql",
        "api.admin_rapidapi_calls_this_month",
      ],
      [
        "api.service_rapidapi_budget()",
        "20261026143000_rapidapi_budget_guard_and_poll_schedule.sql",
        "api.service_rapidapi_budget",
      ],
      [
        "api.service_record_rapidapi_calls(text, jsonb)",
        "20261013110000_rapidapi_call_budget.sql",
        "api.service_record_rapidapi_calls",
      ],
      [
        "api.service_record_rapidapi_quota(integer, integer, timestamptz)",
        "20261027100000_rapidapi_provider_quota_floor.sql",
        "api.service_record_rapidapi_quota",
      ],
    ];
    const pinned = script.slice(
      0,
      script.indexOf("insert into supabase_migrations.schema_migrations"),
    );
    for (const [signature, file, name] of pins) {
      expect(pinned).toContain(`oid = '${signature}'::regprocedure`);
      expect(pinned).toContain(`is distinct from '${md5(bodyOf(file, name))}' then`);
    }
    // Method check: this reproduces the pins production gave 20261026143000.
    expect(
      md5(
        bodyOf("20261013110000_rapidapi_call_budget.sql", "app_private.rapidapi_calls_this_month"),
      ),
    ).toBe("562d08db95a860695a4da951fc21a644");
    expect(
      md5(bodyOf("20261013110000_rapidapi_call_budget.sql", "api.admin_rapidapi_calls_this_month")),
    ).toBe("c226a598487114f2a9a5541f1ceb2c1d");
  });

  test("its postflight pins the Sofascore plan as unchanged and the SportAPI plan as seeded", () => {
    expect(script).toContain("the Sofascore count changed");
    expect(script).toContain("the Sofascore budget answer changed");
    expect(script).toContain("the live interval changed");
    expect(script).toContain(
      '{"host":"sportapi7.p.rapidapi.com","quota_limit":15000,"soft_limit":13500,"hard_limit":14700,"reset_day_of_month":27,"used_offset":0}',
    );
    expect(script).toContain("the new service functions are not service-role only");
  });
});
