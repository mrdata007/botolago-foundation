import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PINS,
  RESERVED_SLOTS,
  SCRIPT_PATH,
  STEPS,
  buildScript,
  isRealMd5,
  tagFor,
} from "./build-apply-sofascore-automatic";

/**
 * The ONE guarded script that installs SofaScore Fantasy scoring on production
 * (20261003180000, 20261011110000, 20261011120000, and the slots reserved for
 * the player auto-map and Lane A). It is generated; this test fails when the
 * committed script drifts from the migration files or from the generator, runs
 * each migration only after its sha256 matches, skips what is already recorded
 * (and verifies it), ships as a rehearsal, and checks production before its
 * first write.
 */

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const script = read(SCRIPT_PATH);
const firstWrite = script.indexOf("insert into supabase_migrations.schema_migrations");

describe("apply-sofascore-automatic.sql", () => {
  test("is exactly what the generator builds (rerun bun scripts/backend/build-apply-sofascore-automatic.ts)", () => {
    expect(script).toBe(buildScript());
  });

  test("steps are in ascending order and every migration file exists", () => {
    const versions = STEPS.map((step) => step.version);
    expect(versions).toEqual([...versions].sort());
    expect(new Set(versions).size).toBe(versions.length);
    for (const step of STEPS) {
      expect(existsSync(join(root, `supabase/migrations/${step.version}_${step.name}.sql`))).toBe(
        true,
      );
    }
  });

  for (const step of STEPS) {
    test(`carries ${step.version} byte for byte, once, and checks it before running it`, () => {
      const migration = read(`supabase/migrations/${step.version}_${step.name}.sql`);
      const tag = tagFor(step.version);
      expect(migration).not.toContain(tag);
      expect(occurrences(script, migration)).toBe(1);
      expect(script).toContain(
        `  '${step.version}',\n  '${step.name}',\n  array[${tag}${migration}${tag}]`,
      );
      expect(script).toContain(
        `if encode(sha256(convert_to(part_${step.version}, 'UTF8')), 'hex')\n    is distinct from '${sha256(migration)}' then`,
      );
      expect(occurrences(script, `execute part_${step.version};`)).toBe(1);
    });

    test(`${step.version} is recorded and run only if it was not recorded at the start`, () => {
      const pending = `exists (select 1 from pg_temp.sofascore_plan where version = '${step.version}' and not was_recorded)`;
      // Once as the guard of its record, once around its pending preflight, and
      // once in its apply block (negated).
      expect(script).toContain(`  array[${tagFor(step.version)}`);
      expect(script).toContain(`where ${pending};`);
      expect(script).toContain(`  if ${pending} then`);
      expect(script).toContain(`  if not ${pending} then\n    return;\n  end if;`);
    });
  }

  test("runs the migrations in order", () => {
    const at = STEPS.map((step) => script.indexOf(`execute part_${step.version};`));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at.every((index) => index > 0)).toBe(true);
  });

  test("ships as a rehearsal: one begin, one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "begin;")).toHaveLength(1);
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("fixes what is recorded once, then takes the observation lock, before anything else", () => {
    const plan = script.indexOf("create temporary table sofascore_plan on commit drop as");
    const lock = script.indexOf(
      "lock table app_private.fantasy_fixture_observations in access exclusive mode;",
    );
    const preflight = script.indexOf("do $preflight$");
    expect(plan).toBeGreaterThan(0);
    expect(plan).toBeLessThan(lock);
    expect(lock).toBeLessThan(preflight);
    expect(script).toContain("exception when lock_not_available then");
  });

  test("checks production before its first write", () => {
    for (const guard of [
      "set local lock_timeout = '5s';",
      "if exists (select 1 from cron.job_run_details run",
      "or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then",
      "from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then",
      "apply scripts/backend/apply-sofascore-live-switch.sql first",
      `<> '${PINS.recorderBefore}' then`,
      `is distinct from '${PINS.snapshotBefore}' then`,
      "an object migration 20261003180000 depends on is missing",
      "an object migration 20261011110000 depends on is missing",
      "an object migration 20261011120000 calls is missing",
      "the provider fixture links table or the reconciled wrapper already exists",
      "api.service_record_sofascore_fantasy_observation already exists",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, found: at !== -1 }).toEqual({ guard, found: true });
      expect({ guard, beforeFirstWrite: at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
  });

  test("the Fantasy tick must be off only when the recorder is about to be replaced", () => {
    const tick = script.indexOf("where lifecycle_tick_enabled) then");
    const pendingFor3180 = script.lastIndexOf(
      "if exists (select 1 from pg_temp.sofascore_plan where version = '20261003180000' and not was_recorded) then",
      tick,
    );
    const nextStep = script.indexOf(
      "-- 20261011110000_football_sofascore_snapshot_teams",
      pendingFor3180,
    );
    expect(pendingFor3180).toBeGreaterThan(0);
    expect(tick).toBeGreaterThan(pendingFor3180);
    expect(tick).toBeLessThan(nextStep);
    expect(occurrences(script, "lifecycle_tick_enabled)")).toBe(1);
  });

  test("verifies every migration after the run, whether applied now or before", () => {
    const postflight = script.slice(
      script.indexOf("do $postflight$"),
      script.lastIndexOf("\nrollback;\n"),
    );
    for (const check of [
      `'${PINS.recorderAfter}'`,
      `'${PINS.reconciledWrapper}'`,
      `'${PINS.snapshotAfter}'`,
      `'${PINS.sofascoreFantasyObservation}'`,
      "p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=\"\"']",
      "has_function_privilege('public', fn, 'execute')",
      "has_function_privilege('anon', fn, 'execute')",
      "has_function_privilege('authenticated', fn, 'execute')",
      "not has_function_privilege('service_role', fn, 'execute')",
      "relrowsecurity and relforcerowsecurity",
      "has_table_privilege('service_role', 'app_private.football_provider_fixture_links', 'select')",
      "not like '%provider-reconciled%'",
      "raise exception 'stop: the update did not check out: %', problems;",
    ]) {
      expect({ check, found: postflight.includes(check) }).toEqual({ check, found: true });
    }
    // No postflight check is conditional on the plan: it runs for skipped steps too.
    expect(postflight).not.toContain("sofascore_plan");
  });

  test("the result row says Installed only when every migration is recorded", () => {
    const tail = script.slice(script.lastIndexOf("\nrollback;\n"));
    expect(tail).toContain(`= ${STEPS.length}\n    then 'Installed and verified.`);
    expect(tail).toContain("else 'Rehearsal passed. Nothing was saved.");
  });

  test("pins are real md5s or marked placeholders, and a placeholder stops the script first", () => {
    const stops = script.slice(script.indexOf("do $preflight$")).split("\n");
    for (const step of STEPS) {
      for (const [key, pin] of Object.entries(step.pins)) {
        expect(isRealMd5(pin) || pin.startsWith("FILL_FROM_CI_")).toBe(true);
        const guard = `the md5 pin ${key} has not been filled from CI yet`;
        const present = stops.some((line) => line.includes(guard));
        expect({ key, stopsWhilePlaceholder: present }).toEqual({
          key,
          stopsWhilePlaceholder: !isRealMd5(pin),
        });
      }
    }
  });

  test("a reserved slot stops the script first; none stops it once filled", () => {
    for (const slot of RESERVED_SLOTS) {
      expect(script).toContain(
        `stop: this script is not final -- migration ${slot.version} (${slot.name}, ${slot.owner}) has not been added to it yet`,
      );
      // The slot is not among the steps, and its migration is not embedded.
      expect(STEPS.map((step) => step.version)).not.toContain(slot.version);
      expect(script).not.toContain(`'${slot.version}',\n  '`);
    }
    if (RESERVED_SLOTS.length === 0) {
      expect(script).not.toContain("this script is not final -- migration");
    }
    // The first statement of the preflight is the first refusal.
    const preflight = script.slice(script.indexOf("do $preflight$"));
    if (RESERVED_SLOTS.length > 0 || Object.values(PINS).some((pin) => !isRealMd5(pin))) {
      expect(preflight.split("\n")[2]).toContain("stop: this script is not final");
    }
  });

  test("the generator refuses an unordered list of steps", () => {
    expect(() => buildScript({ steps: [...STEPS].reverse(), reserved: [] })).toThrow();
  });

  test("an empty reserved list and real pins produce a script with no 'not final' refusal", () => {
    const filled = STEPS.map((step) => ({
      ...step,
      pins: Object.fromEntries(Object.keys(step.pins).map((key) => [key, "0".repeat(32)])),
    }));
    const final = buildScript({ steps: filled, reserved: [] });
    expect(final).not.toContain("this script is not final");
    expect(final).not.toContain("NOT FINAL");
  });

  test("never writes outside what its migrations create: no insert/update/delete on fixtures or Fantasy rows", () => {
    // The only statements the script itself runs besides the migrations are the
    // schema_migrations record, the temporary plan table and the lock.
    const outside = script
      .split(/\$bg_\d+_file\$/)
      .filter((_, index) => index % 2 === 0)
      .join("\n")
      .toLowerCase();
    expect(outside).not.toMatch(/\b(update|delete from)\s+(app|app_private)\./);
    expect(outside).not.toMatch(/\binsert into\s+(app|app_private)\./);
    expect(outside).not.toMatch(/\bconfigure\s*\(/);
  });

  test("CI prints the pins for the new function and the two reconciled ones", () => {
    const workflow = read(".github/workflows/backend-quality.yml");
    expect(workflow).toContain("'SofaScore Fantasy observation md5' as label");
    expect(workflow).toContain(
      "'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure",
    );
  });

  test("the migration files in the chain are the ones the old single-purpose scripts carry", () => {
    // Two scripts already carry 110000 and 3180000; the generator must not
    // diverge from them in the migration text it embeds.
    for (const [path, step] of [
      ["scripts/backend/apply-sofascore-match-details.sql", STEPS[1]!],
      ["scripts/backend/apply-20261003180000-reconciled-provider-observations.sql", STEPS[0]!],
    ] as const) {
      const migration = read(`supabase/migrations/${step.version}_${step.name}.sql`);
      expect(occurrences(read(path), migration)).toBe(1);
    }
  });

  test("lists every migration after 20261003180000 that the runbook accounts for", () => {
    const runbook = read("docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md");
    const migrations = readdirSync(join(root, "supabase/migrations"))
      .map((file) => file.split("_")[0]!)
      .filter((version) => version >= "20261003180000");
    for (const version of migrations) {
      expect({ version, mentioned: runbook.includes(version) }).toEqual({
        version,
        mentioned: true,
      });
    }
  });
});
