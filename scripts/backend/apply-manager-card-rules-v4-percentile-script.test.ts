import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner-run production install of the Manager Card rules v4 (each week ranked among
 * managers, owner decision 2026-10-14) and its migration. It runs as postgres against
 * production, so what it must never do is pinned here: it executes only the reviewed migration
 * bytes, replaces only the reviewed function body, requires the writers paused, ships as a
 * rehearsal that ends in rollback, switches nothing on, and the v4 config differs from v3 only in
 * `normalize` and the CAP, SEL and TRF scales.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

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
/** SQL with comments removed, for "never does X" checks. */
const code = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

const SIGNATURE = "create or replace function app_private.manager_card_evaluate_gameweek(";
const script = read("scripts/backend/apply-manager-card-rules-v4-percentile.sql");
const migration = read("supabase/migrations/20261014160000_manager_card_gameweek_percentile.sql");
const v3Migration = read("supabase/migrations/20261012200100_manager_card_week_one.sql");
const v3Script = read("scripts/backend/apply-manager-card-rules-v3-week-one.sql");

const preflight = script.slice(0, script.indexOf("$preflight$;"));
const verify = script.slice(script.indexOf("do $verify$"), script.indexOf("end $verify$;"));
const postflight = script.slice(script.indexOf("do $postflight$"));

describe("production install of rules v4 (each week ranked among managers)", () => {
  test("pins the exact reviewed migration bytes before executing them", () => {
    expect(script.split("$migration$")[1]).toBe(migration);
    expect(migration).not.toContain("$migration$");
    const expected = script.match(/encode\(sha256[\s\S]*?is distinct from '([a-f0-9]{64})'/)?.[1];
    expect(expected).toBe(sha256(migration));
    expect(script.indexOf("migration differs from reviewed repository bytes")).toBeLessThan(
      script.indexOf("execute source;"),
    );
    expect(script).toContain("values ('20261014160000', 'manager_card_gameweek_percentile'");
  });

  test("checks the replaced body is rules v3's before, and the new body after", () => {
    const before = bodyOf(v3Migration, SIGNATURE);
    const after = bodyOf(migration, SIGNATURE);
    expect(preflight).toContain(md5(before));
    expect(verify).not.toContain(md5(before));
    expect(verify).toContain(md5(after));
    expect(preflight).not.toContain(md5(after));
    // The v3 script's own "after" pin is this script's "before" pin: they chain.
    expect(v3Script.slice(v3Script.indexOf("do $verify$"))).toContain(md5(before));
  });

  test("the migration replaces only the calculation, and nothing else", () => {
    expect(migration.match(/create or replace function ([\w.]+)\(/g)).toEqual([SIGNATURE]);
    // Outside the body: the function, its comment, and nothing else.
    const outside = code(migration.replace(bodyOf(migration, SIGNATURE), ""));
    expect(outside).not.toMatch(/\bcreate\s+(table|index|view|policy|trigger)\b/i);
    expect(outside).not.toMatch(/\b(alter|drop|grant|revoke|insert|update|delete)\s/i);
    expect(outside.match(/^comment on function [\w.]+/gim)).toEqual([
      "comment on function app_private.manager_card_evaluate_gameweek",
    ]);
    // Inside it, only its own temporary table is dropped, as before.
    const body = code(bodyOf(migration, SIGNATURE));
    expect(body).not.toMatch(/\bdrop\s+(table|function)\s+(?!pg_temp\.mc_chg\b)/i);
    expect(body).not.toMatch(/insert\s+into\s+app_private\.manager_card_rules/i);
    expect(body).not.toMatch(/manager_card_configure\s*\(/i);
  });

  test("the new body is rules v3's plus the normalize key and nothing else", () => {
    const before = bodyOf(v3Migration, SIGNATURE);
    const after = bodyOf(migration, SIGNATURE);
    // A line diff (longest common subsequence): the v3 lines the new body drops
    // are exactly the five it extends; everything else it adds is the key.
    const a = before.split("\n");
    const b = after.split("\n");
    const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        lcs[i]![j] =
          a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
    const removed: string[] = [];
    const added: string[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++;
        j++;
      } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) removed.push(a[i++]!);
      else added.push(b[j++]!);
    }
    removed.push(...a.slice(i));
    added.push(...b.slice(j));
    expect(removed).toEqual([
      "  select ranked.team_id, ranked.gameweek_id, (ranked.above * 2 < ranked.n) as top_half",
      "  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;",
      "  select bt.team_id, tr.id as transfer_id,",
      "  group by bt.team_id, tr.id, bt.point_hit, bt.transfers_count",
      "    select team_id, round(avg(case when top_half then 1 else 0 end), 6) as v, count(*)::integer as n from pg_temp.mc_con group by team_id",
    ]);
    // What it adds touches only the temporary tables and the key; no new write.
    const addedCode = code(added.join("\n"));
    expect(addedCode).not.toMatch(/\b(insert\s+into|delete\s+from)\b/i);
    expect(addedCode.match(/\bupdate\s+([\w.]+)/gi)).toEqual([
      "update pg_temp.mc_cap",
      "update pg_temp.mc_sel",
      "update pg_temp.mc_trf",
    ]);
    expect(after).toContain("cfg ? 'normalize'");
    expect(after).toContain("(cfg ->> 'normalize') not in ('none', 'gameweek_percentile')");
    expect(after).toContain("if normalize = 'gameweek_percentile' then");
    expect(after).toContain("case when $13 = 'gameweek_percentile' then");
  });

  test("requires the writers paused and drained, and the card lock", () => {
    for (const guard of [
      "compute is switched on -- pause it first",
      "the manager-card-tick job is active",
      "a manager-card-tick run is still in progress",
      "background writers are not all paused -- run scripts/backend/sofascore-rating-release-pause.sql",
      "if exists (select 1 from cron.job where active)",
      "or exists (select 1 from app_private.ai_content_settings where enabled) then",
      "another worker has not drained",
      "pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0))",
      "are not all recorded -- run apply-manager-card-rules-v3-week-one.sql first",
      "migration 20261014160000 is already recorded",
      "expected exactly three rules rows, versions 1 and 2 inactive and version 3 active",
    ]) {
      expect({ guard, beforeApply: preflight.includes(guard) }).toEqual({
        guard,
        beforeApply: true,
      });
    }
    const statements = code(script);
    expect(statements).not.toMatch(/manager_card_configure\(\s*true/);
    expect(statements).not.toMatch(/manager_card_notify_configure\s*\(/);
    expect(statements).not.toMatch(/active\s*:=\s*true/);
    expect(statements).not.toMatch(/update\s+app_private\.manager_card_settings/i);
  });

  test("the v4 config is v3's with exactly the intended changes", () => {
    const v3 = configIn(v3Script, "rules_v3_config");
    const v4 = configIn(script, "rules_v4_config");
    const { normalize, scales: v4Scales, ...restV4 } = v4;
    const { scales: v3Scales, ...restV3 } = v3;
    expect(normalize).toBe("gameweek_percentile");
    expect(v3).not.toHaveProperty("normalize");
    expect(restV4).toEqual(restV3);
    const median = [
      [0, 1],
      [0.5, 50],
      [1, 99],
    ];
    expect(v4Scales).toEqual({
      cap: median,
      sel: median,
      trf: median,
      con: (v3Scales as Record<string, unknown>).con,
    });
    expect(v4.tiers).toEqual({ stade: 50, pro: 65, champion: 80, legend: 90 });
    expect(script).toContain("in more than the intended keys");
    // jsonb "->" binds looser than "-": the scales comparison needs its parentheses.
    expect(preflight).toContain(
      "((cfg -> 'scales') - 'cap' - 'sel' - 'trf') is distinct from ((v3 -> 'scales') - 'cap' - 'sel' - 'trf')",
    );
    // The postflight re-checks the values it installs.
    expect(postflight).toContain(`'"gameweek_percentile"'::jsonb`);
    expect(postflight).toContain("'[[0,1],[0.5,50],[1,99]]'::jsonb");
  });

  test("inserts v4 active, leaves v3 inactive, and is a rehearsal that ends in rollback", () => {
    expect(script).toContain(
      "update app_private.manager_card_rules set active = false where version = 3 and active;",
    );
    expect(script).toContain(
      "values (4, current_setting('manager_card.rules_v4_config')::jsonb, true);",
    );
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script.match(/^\s*commit;/gm)).toBeNull();
    expect(script).toContain("tick answered");
    expect(script.indexOf("execute source;")).toBeLessThan(script.indexOf("do $verify$"));
    expect(script.indexOf("do $verify$")).toBeLessThan(
      script.indexOf("insert into app_private.manager_card_rules"),
    );
  });
});
