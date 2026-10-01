import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner-run script that puts the player-mapping backend on production as
 * ONE change set in ONE transaction: the provider registration (150000), the
 * workflow tables (160000) and the workflow functions with the resolver guard
 * (161000). Providers must never be registered without the guard, so the three
 * go together or not at all. The script records each migration file whole in
 * the history and runs it only after its sha256 matches the repository file; it
 * must stay a rehearsal unless edited on purpose, must refuse a changed
 * database before writing, and must check the result before it ends.
 */
const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const MIGRATIONS = [
  ["20261001150000", "register_sofascore_flashscore_providers"],
  ["20261001160000", "football_player_mapping_tables"],
  ["20261001161000", "football_player_mapping_functions"],
] as const;
const script = read("scripts/backend/apply-20261001150000-mapping-backend-combined.sql");
const header = script.slice(0, script.indexOf("\nbegin;\n"));
const section = (start: string, end: string) =>
  script.slice(script.indexOf(start), script.indexOf(end, script.indexOf(start) + start.length));
const preflight = section("do $preflight$", "$preflight$;");
const postflight = section("do $postflight$", "$postflight$;");
const tag = (version: string) => `$bg_${version}_file$`;
const embedded = (version: string) => {
  const start = script.indexOf(tag(version)) + tag(version).length;
  return script.slice(start, script.indexOf(tag(version), start));
};

describe("combined apply script for the player-mapping backend", () => {
  test("carries each migration file byte for byte, exactly once, in order", () => {
    let lastAt = -1;
    for (const [version, name] of MIGRATIONS) {
      expect(script.split(tag(version)).length - 1).toBe(2);
      expect(embedded(version)).toBe(read(`supabase/migrations/${version}_${name}.sql`));
      const at = script.indexOf(`'${version}',\n  '${name}',`);
      expect(at).toBeGreaterThan(lastAt);
      lastAt = at;
    }
  });

  test("checks each file's own sha256 before running it, and runs all three in order in the one apply block", () => {
    const apply = section("do $apply$", "$apply$;");
    let lastAt = -1;
    for (const [version, name] of MIGRATIONS) {
      const hash = sha256(read(`supabase/migrations/${version}_${name}.sql`));
      expect(apply).toContain(`is distinct from '${hash}'`);
      const at = apply.indexOf(`execute part_${version};`);
      expect(at).toBeGreaterThan(apply.indexOf(`is distinct from '${hash}'`));
      expect(at).toBeGreaterThan(lastAt);
      lastAt = at;
    }
  });

  test("is one transaction: one begin, one rollback, no commit, no savepoint of its own, no second transaction", () => {
    const lines = script.split("\n");
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line.trim() === "commit;")).toEqual([]);
    const outside = script
      .replace(embedded("20261001150000"), "")
      .replace(embedded("20261001160000"), "")
      .replace(embedded("20261001161000"), "");
    expect(outside).not.toMatch(/^\s*(commit|savepoint|release savepoint|start transaction)\b/im);
    expect(script.indexOf("\nrollback;\n")).toBeGreaterThan(script.indexOf("$postflight$;"));
  });

  test("none of the three migrations needs a second transaction", () => {
    for (const [version, name] of MIGRATIONS) {
      const sql = read(`supabase/migrations/${version}_${name}.sql`).toLowerCase();
      expect(sql).not.toMatch(/add\s+value/);
      expect(sql).not.toMatch(/concurrently/);
      expect(sql).not.toMatch(/^\s*(commit|vacuum|start transaction|begin;)/m);
    }
  });

  test("production preflight pins everything the owner asked for", () => {
    for (const phrase of [
      "20261001071120", // the latest production migration
      "a staging-only migration is recorded",
      "one of the three migrations is already recorded as applied",
      "expected exactly fixture,sportsmonks",
      "a mapping row already names sofascore or flashscore",
      "84d45fbd1c71c689561c39afe04094c9", // mapping constraints digest
      "5d7ad20856e2bb22e2b7d44741e21be1", // resolver text
      "e0ff799389c935e3844df2620b53ae87", // hold_scheduled_jobs text
      "another database session is working right now",
      "app_private.hold_scheduled_jobs()",
      "a Fantasy gameweek is finalizing right now",
      "the Fantasy lifecycle tick is on",
    ])
      expect(preflight).toContain(phrase);
    expect(preflight.indexOf("hold_scheduled_jobs()'::regprocedure")).toBeLessThan(
      preflight.indexOf("perform app_private.hold_scheduled_jobs()"),
    );
  });

  test("the preflight comes before the first write, the postflight after the last", () => {
    expect(script.indexOf("do $preflight$")).toBeLessThan(
      script.indexOf("insert into supabase_migrations.schema_migrations"),
    );
    expect(script.indexOf("do $apply$")).toBeLessThan(script.indexOf("do $postflight$"));
  });

  test("the rehearsal validates the three migrations together", () => {
    for (const phrase of [
      "sofascore and flashscore must each exist exactly once",
      "a new provider is not active at configuration_version 1",
      "existing football_provider_mappings rows changed",
      "the mapping table''s constraints changed",
      "applying the migrations created a mapping row for a reviewed provider",
      "does not have forced row level security",
      "holds a table privilege on",
      "the set of new functions is not the reviewed set",
      "must be executable by authenticated only",
      "must be executable by service_role only",
      "must have no grant for any API role",
      "PUBLIC holds a grant on a new function",
      "player creation was NOT refused",
      "MAPPING_REVIEW_REQUIRED",
      "the resolver differs from the reviewed text by more than the guard",
      "requested_by <> decided_by is not enforced by the table",
      "an approvals_required-style column exists",
      "the decide function does not refuse self-approval",
      "the execute function does not re-check the approver and the approval age",
      "a schedule was installed or changed",
      "a Fantasy, player, fixture or lineup table changed",
      "an audit event or idempotency key was written",
      "is not empty",
    ])
      expect(postflight).toContain(phrase);
  });

  test("the writing probes of the postflight always roll themselves back", () => {
    const probes =
      postflight.match(/raise exception using errcode = 'P0001', message = 'probe_rollback';/g) ??
      [];
    expect(probes.length).toBe(3);
    expect(postflight).not.toMatch(
      /insert into app_private\.football_provider_mappings|update app_private\.football_provider_mappings/,
    );
  });

  test("the report channel only changes how the report is shown", () => {
    expect(script).toContain("select set_config('botolago.mapping_apply_report', 'notice', true);");
    expect(script.match(/mapping_apply_report/g)?.length).toBe(2);
    expect(postflight.indexOf("cardinality(problems) > 0")).toBeLessThan(
      postflight.indexOf("mapping_apply_report"),
    );
  });

  test("outside the migrations it never writes a mapping, candidate, proposal, Fantasy row or schedule", () => {
    const outside = script
      .replace(embedded("20261001150000"), "")
      .replace(embedded("20261001160000"), "")
      .replace(embedded("20261001161000"), "")
      .toLowerCase();
    for (const write of [
      "insert into app_private.football_provider_mappings",
      "update app_private.football_provider_mappings",
      "delete from app_private.football_provider_mappings",
      "insert into app_private.football_player_mapping",
      "insert into app.fantasy",
      "update app.fantasy",
      "cron.schedule",
      "cron.alter_job",
    ])
      expect(outside).not.toContain(write);
  });

  test("the header explains why the three go together and how to run it", () => {
    expect(header).toContain("ONE transaction");
    expect(header).toContain("all three or none");
    expect(header.replace(/\n--\s*/g, " ")).toContain(
      "change the line `rollback;` near the bottom to `commit;`",
    );
    expect(header).toContain("Do NOT edit a check to make it pass");
  });
});
