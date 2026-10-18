import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner's switch for the rating rule (docs/backend/FANTASY_RATING_POINTS.md):
 * ships as a rehearsal, pins the reviewed function bodies, refuses unless GW5 is
 * scheduled or open, and proves the documents of GW1-4 did not move.
 */
const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const script = read("scripts/backend/activate-fantasy-rating-points.sql");
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
/** pg_proc.prosrc of the function `signature` creates: the text between its $$ quotes. */
function bodyOf(source: string, signature: string): string {
  const at = source.indexOf(signature);
  expect(at).toBeGreaterThan(-1);
  const start = source.indexOf("$$", at) + 2;
  return source.slice(start, source.indexOf("$$;", start));
}
const SWITCH =
  "select app_private.fantasy_rating_points_configure('5ada3e98-2929-405a-a3f1-a26de8e51933', true, 5) as configured;";
const policy = read("supabase/migrations/20261014090000_fantasy_rating_points.sql");
const actual = read("supabase/migrations/20261018153305_fantasy_require_actual_api_ratings.sql");
const save = read("supabase/migrations/20261014090100_fantasy_rating_points_save.sql");

describe("activate-fantasy-rating-points.sql", () => {
  test("is a rehearsal: one transaction that ends in rollback", () => {
    expect(script.match(/^begin;$/gm)).toHaveLength(1);
    expect(script.trimEnd().endsWith("rollback;")).toBeTrue();
    expect(script).not.toMatch(/^commit;$/m);
  });

  test("switches on the 2026/27 season from gameweek 5, and writes nothing else", () => {
    expect(script.split(SWITCH)).toHaveLength(2);
    const statements = script
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(
      /\b(insert into|update|delete from|alter (table|function)|drop (table|function)|truncate)\b/i,
    );
  });

  test("checks GW5 is scheduled or open and no later gameweek started, before the switch", () => {
    const switchAt = script.indexOf(SWITCH);
    for (const guard of [
      "stop: GW5 is %, the rule can start only at a scheduled or open gameweek",
      "stop: a gameweek after GW5 has already started",
      "stop: adaptive scoring is not on for the season",
      "stop: actual API rating requirement migration 20261018153305 is not applied",
      "stop: migrations 20261014090000 and 20261014090100 are not both applied",
    ]) {
      expect(script.indexOf(guard)).toBeGreaterThan(-1);
      expect(script.indexOf(guard)).toBeLessThan(switchAt);
    }
  });

  test("compares the documents of GW1-4 before and after the switch", () => {
    const switchAt = script.indexOf(SWITCH);
    expect(script.indexOf("create temporary table rating_points_baseline")).toBeLessThan(switchAt);
    expect(script.indexOf("stop: the document of a gameweek before GW5 changed")).toBeGreaterThan(
      switchAt,
    );
  });

  test("pins the bodies the migrations create", () => {
    const pins = [
      [
        "app_private.fantasy_rating_points_configure(uuid,boolean,integer)",
        md5(bodyOf(policy, "create function app_private.fantasy_rating_points_configure(")),
      ],
      [
        "app_private.fantasy_scoring_input_document(uuid)",
        md5(bodyOf(policy, "create function app_private.fantasy_scoring_input_document(")),
      ],
      [
        "api.fantasy_rules(uuid)",
        md5(bodyOf(actual, "create or replace function api.fantasy_rules(")),
      ],
      [
        "api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)",
        md5(
          bodyOf(actual, "create or replace function api.service_persist_fantasy_scoring_results("),
        ),
      ],
    ] as const;
    for (const [fn, hash] of pins) {
      expect(script).toContain(`oid = '${fn}'::regprocedure))\n       is distinct from '${hash}'`);
    }
  });

  test("the save migration replaces only the reviewed 20261013180000 body", () => {
    const previous = read("supabase/migrations/20261013180000_fast_fantasy_points_save.sql");
    const hash = md5(
      bodyOf(previous, "create or replace function api.service_persist_fantasy_scoring_results("),
    );
    expect(save).toContain(`is distinct from '${hash}'`);
  });

  test("the rule migration replaces only the reviewed api.fantasy_rules body", () => {
    const previous = read("supabase/migrations/20260927120659_adaptive_reviewed_estimates.sql");
    const hash = md5(bodyOf(previous, "create or replace function api.fantasy_rules("));
    expect(policy).toContain(`is distinct from '${hash}'`);
    // And keeps it, word for word, ahead of the rating part.
    expect(bodyOf(policy, "create or replace function api.fantasy_rules(")).toContain(
      bodyOf(previous, "create or replace function api.fantasy_rules(").trimEnd().slice(0, -1),
    );
  });
});
