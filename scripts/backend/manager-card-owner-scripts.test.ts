import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The three scripts the owner pastes into the Supabase SQL Editor after the Manager Card
 * backend (BG-0158) is applied: the calibration dry run, the rules v1 template and the founder
 * grant. They run as postgres against production, so what they must never do is pinned here:
 * the dry run saves nothing, the rules template refuses its placeholder and ships as a
 * rehearsal, and the founder grant refuses before the cut-off and ships as a rehearsal whose
 * real section is commented out.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** The statements that actually run: comment lines and trailing comments removed. */
const code = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
const has = (sql: string, pattern: RegExp) => pattern.test(code(sql));

const calibration = read("scripts/backend/manager-card-calibration-dry-run.sql");
const rules = read("scripts/backend/apply-manager-card-rules-v1.sql");
const founder = read("scripts/backend/manager-card-founder-grant.sql");

describe("manager-card-calibration-dry-run.sql", () => {
  test("explains when, how, what it prints and that it saves nothing", () => {
    for (const heading of ["WHEN", "HOW TO RUN", "WHAT IT PRINTS"]) {
      expect(calibration).toContain(heading);
    }
    expect(calibration).toContain("SAVES NOTHING");
    expect(calibration).toContain('text after "calibration result:"');
  });

  test("is one DO block that ends by raising the result, with no commit anywhere", () => {
    expect(has(calibration, /\bcommit\b/i)).toBe(false);
    expect(has(calibration, /\bbegin\s*;/i)).toBe(false);
    expect(has(calibration, /\bsavepoint\b/i)).toBe(false);
    expect(has(calibration, /\brollback\b/i)).toBe(false);
    expect((code(calibration).match(/\bdo \$calibration\$/g) ?? []).length).toBe(1);
    const body = code(calibration).trimEnd();
    expect(body.endsWith("$calibration$;")).toBe(true);
    // The last statement before the end of the block is the deliberate error carrying the JSON.
    const lastRaise = body.lastIndexOf("raise exception");
    expect(body.slice(lastRaise)).toContain("'calibration result: %', text_out");
    expect(body.slice(lastRaise)).not.toContain("if ");
  });

  test("refuses with a different prefix when a rules row exists or compute is on", () => {
    expect(calibration).toContain("raise exception 'stop: a rules row already exists");
    expect(calibration).toContain("raise exception 'stop: compute is switched on");
    expect(calibration).toContain("raise exception 'stop: a card table already holds rows");
    expect(calibration).not.toMatch(/raise exception 'calibration result[^']*'\s*;[\s\S]*stop:/);
  });

  test("measures with the provisional rules the brief asks for, and sets time limits", () => {
    expect(calibration).toContain("temp_version constant integer := 999999");
    expect(calibration).toContain("'minimum_gameweeks', 1");
    expect(calibration).toContain("'provisional_below', 1");
    expect(calibration).toContain("'trf_window_gameweeks', 3");
    expect(calibration).not.toContain("'cap_ignore_deadlines_before',");
    expect(calibration).toContain("set_config('statement_timeout', '10min', true)");
    expect(calibration).toContain("set_config('lock_timeout'");
    // Same evaluable predicate as the tick.
    expect(calibration).toContain(
      "gw.status in ('finalized', 'corrected') and gw.points_state = 'final'",
    );
    expect(calibration).toContain("work.calculation_version = gw.scoring_input_version");
    expect(calibration).toContain(
      "app_private.manager_card_evaluate_gameweek(gameweek.id, temp_version)",
    );
  });

  test("reports aggregates only: no user, team or e-mail column leaves the database", () => {
    const body = code(calibration);
    expect(body).not.toMatch(/jsonb_build_object\([^)]*(user_id|email|display_name|username)/);
    expect(body).not.toMatch(/auth\.users/);
    expect(body).toContain("proposedRulesV1");
    expect(body).toContain("'warnings'");
    expect(body).toContain("percentile_cont");
  });

  test("proposes the config shape the functions read and flags the missing CAP date", () => {
    for (const key of [
      "'minimum_gameweeks', 3",
      "'provisional_below', 5",
      "'trf_window_gameweeks', 3",
      "'batch_size', 2000",
      "'scales', scales",
      "'tiers', tiers",
    ]) {
      expect(calibration).toContain(key);
    }
    expect(calibration).toContain("cap_ignore_deadlines_before is NOT set");
  });
});

describe("apply-manager-card-rules-v1.sql", () => {
  test("ships with the placeholder, once, and refuses to run with it", () => {
    expect(rules.split("__RULES_V1_CONFIG_JSON__").length - 1).toBe(1);
    expect(rules).toContain("PUT THE CONFIG HERE");
    expect(rules).toContain("stop: the rules config has not been filled in");
    // The refusal cannot be switched off by replacing the marker everywhere.
    expect(code(rules)).not.toMatch(/position\('__RULES_V1_CONFIG_JSON__'/);
    expect(rules).toContain("position('RULES_V1' || '_CONFIG_JSON' in config_text) > 0");
  });

  test("is a rehearsal by default: begin ... rollback, no active commit", () => {
    expect(has(rules, /^\s*begin;\s*$/im)).toBe(true);
    expect(has(rules, /^\s*rollback;\s*$/im)).toBe(true);
    expect(has(rules, /^\s*commit\s*;\s*$/im)).toBe(false);
    expect(rules).toContain("Change the line `rollback;`");
    expect(rules).toContain("Rehearsal passed");
  });

  test("preflight: card migrations, no rules row, compute off", () => {
    for (const version of [
      "20261008123000",
      "20261008123100",
      "20261008123200",
      "20261008123300",
      "20261008123400",
    ]) {
      expect(rules).toContain(`'${version}'`);
    }
    expect(rules).toContain("stop: a rules row already exists");
    expect(rules).toContain("stop: compute is switched on");
  });

  test("inserts version 1 as the active row, and nothing else is written", () => {
    expect(code(rules)).toMatch(
      /insert into app_private\.manager_card_rules \(version, config, active\)\s+values \(1, /,
    );
    expect(has(rules, /\bupdate\s+app_private/i)).toBe(false);
    expect(has(rules, /\bmanager_card_configure\s*\(/i)).toBe(false);
  });

  test("postflight checks every key, both functions, and that compute is still off", () => {
    for (const key of [
      "minimum_gameweeks",
      "provisional_below",
      "trf_window_gameweeks",
      "batch_size",
    ]) {
      expect(rules).toContain(`'${key}'`);
    }
    for (const stat of ["'cap', 'sel', 'trf', 'con'", "'stade', 'pro', 'champion', 'legend'"]) {
      expect(rules).toContain(stat);
    }
    expect(rules).toContain("the raw values must strictly rise");
    expect(rules).toContain("every score must be between 1 and 99");
    expect(rules).toContain("tiers must rise: stade < pro < champion < legend");
    expect(rules).toContain("app_private.manager_card_scale(lo, cfg -> 'scales' -> stat)");
    expect(rules).toContain("app_private.manager_card_tier(50, cfg -> 'tiers')");
    expect(rules).toContain('ticked is distinct from \'{"outcome": "off"}\'::jsonb');
  });

  test("a filled copy keeps rollback and loses the placeholder", () => {
    const filled = rules.replace("__RULES_V1_CONFIG_JSON__", '{"batch_size":2000}');
    expect(filled).not.toContain("__RULES_V1_CONFIG_JSON__");
    expect(has(filled, /^\s*rollback;\s*$/im)).toBe(true);
    expect(has(filled, /^\s*commit\s*;\s*$/im)).toBe(false);
  });
});

describe("manager-card-founder-grant.sql", () => {
  test("names its inputs clearly: season label, cut-off, cohort, exclusions", () => {
    expect(founder).toContain("season_label constant text := '2026/27'");
    expect(founder).toContain(
      "cutoff constant timestamptz := '2026-11-01 00:00:00 Africa/Casablanca'::timestamptz",
    );
    expect(founder).toContain("cohort constant smallint := 2026");
    expect(founder).toContain("excluded constant uuid[] := '{}'::uuid[]");
    expect(founder).toContain("INPUT 1");
    expect(founder).toContain("INPUT 4");
    expect(founder).toContain("1 November 2026");
  });

  test("no cut-off placeholder is left, and it refuses before the offer closes", () => {
    expect(founder).not.toContain("__FOUNDER_CUTOFF__");
    expect(founder).toContain("if now() < cutoff then");
    expect(founder).toContain("stop: the founder offer is still open until");
  });

  test("refuses when founders already exist for the cohort, or the season is not unique", () => {
    expect(founder).toContain(
      "exists (select 1 from app.manager_cards where founder_cohort = cohort)",
    );
    expect(founder).toContain("stop: founders already exist for cohort");
    expect(founder).toContain("expected exactly one non-cancelled Fantasy season");
  });

  test("the rehearsal calls the grant and ends by raising the count, saving nothing", () => {
    const body = code(founder);
    expect(body).toContain(
      "app_private.manager_card_grant_founder(season_id, cutoff, cohort, excluded)",
    );
    expect(founder).toContain(
      "raise exception 'founder dry run: % managers would be founders (excluded staff and @botolago.com accounts)",
    );
    const dryRun = body.slice(
      body.indexOf("do $founder_dry_run$"),
      body.indexOf("$founder_dry_run$;"),
    );
    expect(dryRun.lastIndexOf("raise exception 'founder dry run")).toBeGreaterThan(
      dryRun.lastIndexOf("grant_founder("),
    );
    expect(has(founder, /\bcommit\b/i)).toBe(false);
    expect(has(founder, /\bbegin\s*;/i)).toBe(false);
  });

  test("the real run is fully commented out, and guarded by the expected count", () => {
    const partThree = founder.slice(founder.indexOf("-- PART 3"));
    expect(partThree).toContain("-- begin;");
    expect(partThree).toContain("-- commit;");
    expect(partThree).toContain("-- do $founder_real$");
    const lines = partThree.split("\n").filter((line) => line.trim() !== "");
    expect(lines.every((line) => line.startsWith("--"))).toBe(true);
    expect(partThree).toContain("expected constant integer := NULL");
    expect(partThree).toContain("stop: type the number from the rehearsal");
    expect(partThree).toContain("if granted <> expected then");
    // Nothing from the real section runs as shipped.
    expect(code(founder)).not.toContain("founder_real");
  });
});
