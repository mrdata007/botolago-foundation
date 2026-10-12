import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BEFORE_BODY_MD5,
  MIGRATION_PATH,
  SCRIPT_PATH,
  READBACK_PATH,
  buildScoringSaveInstall,
  buildScoringSaveReadback,
} from "./build-apply-fantasy-scoring-save";

const root = join(import.meta.dir, "../..");
const migration = readFileSync(join(root, MIGRATION_PATH), "utf8");
const prior = readFileSync(
  join(root, "supabase/migrations/20260927140000_incremental_fantasy_points.sql"),
  "utf8",
);
const oldFunction = prior.slice(
  prior.indexOf("create or replace function api.service_persist_fantasy_scoring_results("),
  prior.indexOf("revoke all on function api.service_persist_fantasy_scoring_results"),
);

describe("set-based scoring-save release guards", () => {
  test("baseline body hash matches the immutable prior migration", () => {
    const body = oldFunction.match(/as \$\$([\s\S]*?)\$\$;/)![1]!;
    expect(createHash("md5").update(body).digest("hex")).toBe(BEFORE_BODY_MD5);
  });
  test("team rules and exception translation are byte-for-byte unchanged", () => {
    const marker = "  if (select count(distinct v->>'teamId')";
    expect(
      migration.slice(migration.indexOf(marker), migration.indexOf("revoke all on function")),
    ).toBe(oldFunction.slice(oldFunction.indexOf(marker)));
  });
  test("removes per-snapshot result scans and per-player fixture subqueries", () => {
    expect(migration).not.toContain(
      "select value into result_row from jsonb_array_elements(p_player_results)",
    );
    expect(migration).not.toContain("for input_row in select value");
    expect(migration).toContain("with submitted as materialized");
    expect(migration).toContain("cross join lateral jsonb_array_elements(r.document->'events')");
    expect(migration).toContain("fixture_totals as materialized");
    expect(migration).toContain("event_totals as materialized");
    expect(migration).not.toContain("create temporary table");
  });
  test("keeps scoped categories, range checks, digest CAS and replay checks", () => {
    for (const guard of [
      "fantasy_assert_scoring_snapshot",
      "fantasy_scoring_sealed",
      "fantasy_scoring_replay_conflict",
      "fantasy_player_result_scope_invalid",
      "fantasy_point_event_invalid",
      "fantasy_field_scorable",
      "fantasy_field_certified",
      "not between -100 and 100",
      "source_key like 'fixture-stats:%'",
    ]) {
      expect(migration).toContain(guard);
    }
  });
  test("owner script is generated exactly, pinned, drained and rollback by default", () => {
    const script = readFileSync(join(root, SCRIPT_PATH), "utf8");
    expect(script).toBe(buildScoringSaveInstall(migration));
    expect(script.trimEnd().endsWith("rollback;")).toBe(true);
    expect(script).not.toMatch(/^commit;/m);
    for (const guard of [
      "hold_scheduled_jobs",
      "net.http_request_queue",
      "idle in transaction",
      "lifecycle_tick_enabled",
      "compute_enabled",
      "ai_home_story_jobs",
      "embedded migration differs",
      "data changed",
      "a.grantee=0",
    ])
      expect(script).toContain(guard);
  });
  test("independent readback is generated exactly and is read-only", () => {
    const script = readFileSync(join(root, READBACK_PATH), "utf8");
    expect(script).toBe(buildScoringSaveReadback(migration));
    expect(script).not.toMatch(
      /^(?:insert|update|delete|create|alter|drop|grant|revoke|do|begin|commit)\b/im,
    );
    expect(script).toContain("migration_recorded");
    expect(script).toContain("body_md5");
    expect(script).toContain("data_state");
  });
  test("minutes fetch plan is bounded to the two measured GW3 events", () => {
    const plan = JSON.parse(
      readFileSync(join(root, "tests/fixtures/providers/gw3-held-minutes.json"), "utf8"),
    );
    expect(plan.matches.map((m: { sofascoreId: number }) => m.sofascoreId)).toEqual([
      17256972, 17256968,
    ]);
    expect(plan.matches.every((m: { flashscoreId: unknown }) => m.flashscoreId === null)).toBe(
      true,
    );
  });
});
