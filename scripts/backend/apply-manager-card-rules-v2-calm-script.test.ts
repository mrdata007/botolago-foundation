import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner-run production install of the Manager Card "calm scores" ruleset (rules v2) and its
 * migration. It runs as postgres against production, so what it must never do is pinned here: it
 * executes only the reviewed migration bytes, replaces only the reviewed function, requires the
 * writers paused, ships as a rehearsal that ends in rollback, and its v2 config carries exactly
 * the intended differences from the v1 config.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const script = read("scripts/backend/apply-manager-card-rules-v2-calm.sql");
const migration = read(
  "supabase/migrations/20261012170000_manager_card_shrinkage_and_selection.sql",
);
const computeMigration = read("supabase/migrations/20261008123200_manager_card_compute.sql");
const v1Script = read("scripts/backend/apply-manager-card-rules-v1-fixed-scales.sql");

const md5 = (text: string) => createHash("md5").update(text).digest("hex");
/** The text between the first $$ after `signature` and the $$; that closes it (pg_proc.prosrc). */
function bodyOf(source: string, signature: string): string {
  const at = source.indexOf(signature);
  expect(at).toBeGreaterThan(-1);
  const start = source.indexOf("$$", at) + 2;
  return source.slice(start, source.indexOf("$$;", start));
}
const configIn = (sql: string, tag: string) => {
  const match = sql.match(new RegExp(`\\$${tag}\\$(\\{[\\s\\S]*?\\})\\$${tag}\\$`));
  expect(match).not.toBeNull();
  return JSON.parse(match![1]) as Record<string, unknown>;
};

describe("production install of rules v2 (calm scores)", () => {
  test("pins the exact reviewed migration bytes before executing them", () => {
    expect(script.split("$migration$")[1]).toBe(migration);
    const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(createHash("sha256").update(migration).digest("hex"));
    expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      script.indexOf("execute source;"),
    );
    expect(script).toContain("values ('20261012170000', 'manager_card_shrinkage_and_selection'");
  });

  test("checks the replaced function is the reviewed one, and the new body after", () => {
    const before = bodyOf(
      computeMigration,
      "create function app_private.manager_card_evaluate_gameweek(",
    );
    const after = bodyOf(
      migration,
      "create or replace function app_private.manager_card_evaluate_gameweek(",
    );
    const preflight = script.slice(0, script.indexOf("$preflight$;"));
    const verify = script.slice(script.indexOf("do $verify$"));
    expect(preflight).toContain(md5(before));
    expect(preflight).not.toContain(md5(after));
    expect(verify).toContain(md5(after));
    expect(md5(before)).not.toBe(md5(after));
  });

  test("replaces nothing but that function and keeps its permissions", () => {
    expect(migration.match(/create or replace function ([\w.]+)\(/g)).toEqual([
      "create or replace function app_private.manager_card_evaluate_gameweek(",
    ]);
    expect(migration).not.toMatch(/\b(create|alter|drop)\s+table\b/i);
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(script).toContain(
        `has_function_privilege('${role}', 'app_private.manager_card_evaluate_gameweek(uuid,integer)', 'execute')`,
      );
    }
  });

  test("requires the writers paused and drained, and the card lock", () => {
    expect(script).toContain("compute is switched on -- pause it first");
    expect(script).toContain("the manager-card-tick job is active");
    expect(script).toContain("a manager-card-tick run is still in progress");
    expect(script).toContain(
      "pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0))",
    );
    // It never switches anything back on itself.
    const statements = script
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    expect(statements).not.toMatch(/manager_card_configure\(\s*true/);
    expect(statements).not.toMatch(/active\s*:=\s*true/);
    const apply = script.indexOf("execute source;");
    expect(script.indexOf("the manager-card-tick job is active")).toBeLessThan(apply);
  });

  test("the v2 config is v1's plus exactly the intended changes", () => {
    const v1 = configIn(v1Script, "rules_v1_config");
    const v2 = configIn(script, "rules_v2_config");
    const { provisional_below, scales, shrinkage, sel_numerator, ...restV2 } = v2 as Record<
      string,
      unknown
    > & { scales: Record<string, unknown> };
    const {
      provisional_below: v1Provisional,
      scales: v1Scales,
      ...restV1
    } = v1 as Record<string, unknown> & { scales: Record<string, unknown> };
    expect(v1Provisional).toBe(2);
    expect(provisional_below).toBe(5);
    expect(restV2).toEqual(restV1);
    expect(shrinkage).toEqual({ cap: 4, sel: 4, con: 4, trf: 4 });
    expect(sel_numerator).toBe("picked_starters");
    const { sel: v2Sel, ...otherV2Scales } = scales;
    const { sel: v1Sel, ...otherV1Scales } = v1Scales;
    expect(otherV2Scales).toEqual(otherV1Scales);
    expect(v1Sel).toEqual([
      [0.5, 1],
      [1, 99],
    ]);
    expect(v2Sel).toEqual([
      [0.5, 1],
      [0.8, 50],
      [1, 99],
    ]);
    // The migration's keys are the ones the script validates.
    expect(migration).toContain("'shrinkage'");
    expect(migration).toContain("'sel_numerator'");
    expect(migration).toContain("'picked_starters'");
    // The script guards that v2 differs from the stored v1 in these keys only.
    expect(script).toContain("in more than the intended keys");
  });

  test("inserts v2 active, leaves v1 inactive, and is a rehearsal that ends in rollback", () => {
    expect(script).toContain(
      "update app_private.manager_card_rules set active = false where version = 1 and active;",
    );
    expect(script).toContain(
      "values (2, current_setting('manager_card.rules_v2_config')::jsonb, true);",
    );
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script.match(/^\s*commit;/gm)).toBeNull();
    expect(script).toContain("tick answered");
    // Nothing runs after the migration is executed except checks and the rules rows.
    expect(script.indexOf("execute source;")).toBeLessThan(script.indexOf("do $verify$"));
    expect(script.indexOf("do $verify$")).toBeLessThan(
      script.indexOf("insert into app_private.manager_card_rules"),
    );
  });
});
