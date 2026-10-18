import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CREATE_TEAM_HEADER,
  CREATE_TEAM_SIGNATURE,
  NEW_FUNCTIONS,
  REPLACED_FROM,
  REQUIRED_MIGRATIONS,
  build,
  newFunctionPins,
} from "./build-apply-20261016170000-pilot-cap";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  md5,
  migrationFiles,
  occurrences,
  read,
  root,
  statementsOf,
} from "./apply-script-kit";

/**
 * The guarded script that puts 20261016170000 (the pilot cap, shipped OFF) on production. The
 * migration creates a table and two functions and REPLACES one function, api.create_fantasy_team,
 * so the pins are: the md5 of the source of that function as the repository's latest migration
 * defines it (what production must hold before), and the md5 of the three functions after, all
 * recomputed here from the repository files and not from the builder's own output.
 */

const VERSION = "20261016170000";
const NAME = "pilot_cap";
const SCRIPT_PATH = "scripts/backend/apply-20261016170000-pilot-cap.sql";
const RUNBOOK = "docs/production/PILOT_CAP_OWNER_RUNBOOK.md";
const script = read(SCRIPT_PATH);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const header = script.slice(0, script.indexOf("\nbegin;\n"));
const preflight = between(script, "do $preflight$", "$preflight$;");
const postflight = between(script, "do $postflight$", "$postflight$;");
const executable = statementsOf(migration);

const oldBody = bodyOf(
  read("supabase/migrations/20260926003100_ordinary_account_mfa_step_up.sql"),
  /create or replace function api\.create_fantasy_team\(/,
);
const newBody = bodyOf(migration, /create or replace function api\.create_fantasy_team\(/);
// A later migration that replaces api.create_fantasy_team again (20261016180000, the deadline lock)
// carries the pilot-cap block forward byte for byte; that is the only other place it may appear.
const pilotBlock = newBody.slice(
  newBody.indexOf("  -- 20261016170000: the pilot cap."),
  newBody.indexOf("  perform app_private.fantasy_validate_selection("),
);
const carriesPilotCap = (file: string, needle: string) => {
  if (file.split("_")[0]! <= VERSION) return false;
  const text = read(`supabase/migrations/${file}`);
  if (!/create or replace function api\.create_fantasy_team\(/.test(text)) return false;
  const body = bodyOf(text, /create or replace function api\.create_fantasy_team\(/);
  // The text is in that function only, and there exactly as often as in the pilot block itself.
  return (
    body.includes(pilotBlock) &&
    occurrences(pilotBlock, needle) > 0 &&
    occurrences(body, needle) === occurrences(pilotBlock, needle) &&
    occurrences(text, needle) === occurrences(body, needle)
  );
};

/** The two fragments the migration adds to the function body. */
const ADDED_DECLARATION = "declare pilot app_private.pilot_settings%rowtype;\n";
const addedGuard = () => {
  const start = newBody.indexOf("  -- 20261016170000: the pilot cap.");
  const end = newBody.indexOf("  perform app_private.fantasy_validate_selection(");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return newBody.slice(start, end);
};

describe("apply-20261016170000-pilot-cap.sql", () => {
  commonApplyScriptTests({
    version: VERSION,
    name: NAME,
    scriptPath: SCRIPT_PATH,
    runbook: RUNBOOK,
    guards: [
      "the database is missing the Fantasy tables or functions this update needs",
      "the pilot cap already exists",
      "is not the reviewed one",
      "perform set_config('bg.pcap_team_fn_before'",
      "perform set_config('bg.pcap_functions_before'",
      "perform set_config('bg.pcap_rows_before'",
      "perform set_config('bg.pcap_cron_jobs_before'",
    ],
  });

  test("is exactly what the builder makes from the migration file", () => {
    expect(script).toBe(build());
  });

  test("pins the function it replaces to the repository's latest definition, and checks it before writing", () => {
    expect(CREATE_TEAM_SIGNATURE).toBe("api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)");
    expect(REPLACED_FROM).toBe("20260926003100_ordinary_account_mfa_step_up.sql");
    expect(CREATE_TEAM_HEADER.source).toBe(
      "create or replace function api\\.create_fantasy_team\\(",
    );
    // The latest definer before this migration is the file the pin is taken from; nothing in between.
    expect(lastDefinerBefore(VERSION, /\bfunction\s+api\.create_fantasy_team\s*\(/i)).toBe(
      "20260926003100",
    );
    // Nobody patches it in place (pg_get_functiondef + execute) or alters it by name.
    const patched = migrationFiles().filter((file) => {
      if (file.startsWith(VERSION)) return false;
      const text = statementsOf(read(`supabase/migrations/${file}`));
      return (
        /pg_get_functiondef\([^)]*create_fantasy_team/.test(text) ||
        /\balter\s+function\s+api\.create_fantasy_team\b/i.test(text)
      );
    });
    expect(patched).toEqual([]);
    expect(occurrences(script, `md5(src) <> '${md5(oldBody)}'`)).toBe(1);
    expect(preflight).toContain(`to_regprocedure('${CREATE_TEAM_SIGNATURE}')`);
  });

  test("pins the three functions it leaves behind to the migration, and checks them after", () => {
    expect(NEW_FUNCTIONS.map((fn) => fn.signature)).toEqual([
      "app_private.pilot_configure(boolean,integer)",
      "app_private.pilot_manager_count(uuid)",
      CREATE_TEAM_SIGNATURE,
    ]);
    for (const fn of newFunctionPins(migration)) {
      expect(occurrences(script, `('${fn.signature}', '${fn.md5}')`)).toBe(1);
      expect(md5(bodyOf(migration, fn.header))).toBe(fn.md5);
    }
    expect(md5(newBody)).not.toBe(md5(oldBody));
    expect(postflight).toContain("def.proconfig is distinct from array['search_path=\"\"']");
    expect(postflight).toContain(
      "has_function_privilege(api_role, 'app_private.pilot_configure(boolean,integer)', 'execute')",
    );
    expect(postflight).toContain(
      "has_function_privilege(api_role, 'app_private.pilot_manager_count(uuid)', 'execute')",
    );
    expect(postflight).toContain("array['public', 'anon', 'authenticated', 'service_role']");
  });

  test("the new create_fantasy_team is the old one plus the guard, and nothing else", () => {
    // Taking the two added fragments out gives the old text back, byte for byte.
    expect(occurrences(newBody, ADDED_DECLARATION)).toBe(1);
    const without = newBody.replace(ADDED_DECLARATION, "").replace(addedGuard(), "");
    expect(without).toBe(oldBody);
    // The guard sits after the replay check and the existing-team check, before validation and any write.
    const guardAt = newBody.indexOf(addedGuard());
    expect(newBody.indexOf("return cached_response;")).toBeLessThan(guardAt);
    expect(newBody.indexOf("fantasy_team_already_exists")).toBeLessThan(guardAt);
    expect(newBody.indexOf("insert into app.fantasy_teams")).toBeGreaterThan(guardAt);
    expect(newBody.indexOf("fantasy_validate_selection")).toBeGreaterThan(guardAt);
    // It reads the switch once, does nothing while off, and takes the lock only while on.
    const guard = addedGuard();
    expect(guard).toContain("select * into pilot from app_private.pilot_settings where id;");
    expect(guard).toContain("if pilot.enabled");
    expect(occurrences(guard, "pg_advisory_xact_lock")).toBe(1);
    expect(guard.indexOf("if pilot.enabled")).toBeLessThan(guard.indexOf("pg_advisory_xact_lock"));
    expect(guard.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      guard.indexOf("app_private.pilot_manager_count(season.id) >= pilot.max_managers"),
    );
    // One new typed error, raised the way the function raises its others.
    expect(occurrences(guard, "errcode = 'PT409', message = 'fantasy_pilot_full'")).toBe(1);
    // The signature, language, security mode and search path are the old ones.
    const signature = (text: string) =>
      text.slice(
        text.indexOf("create or replace function api.create_fantasy_team("),
        text.indexOf("as $$", text.indexOf("create or replace function api.create_fantasy_team(")),
      );
    expect(signature(migration)).toBe(
      signature(read("supabase/migrations/20260926003100_ordinary_account_mfa_step_up.sql")),
    );
  });

  test("the count is defined once: active teams of the season, hidden accounts excluded", () => {
    const count = bodyOf(migration, NEW_FUNCTIONS[1].header);
    expect(count).toContain("team.fantasy_season_id = p_season_id");
    expect(count).toContain("team.status = 'active'");
    expect(count).toContain("app_private.public_ranking_exclusions");
    // The guard uses that function, not a second copy of the rule.
    expect(occurrences(migration, "app_private.pilot_manager_count(season.id)")).toBe(1);
    expect(occurrences(statementsOf(migration), "count(*)")).toBe(1);
    // The same two definitions the rest of the code base uses for "an active manager" and "hidden".
    expect(
      read("supabase/migrations/20260924160000_admin_user_moderation_and_analytics.sql"),
    ).toContain("from app.fantasy_teams team where team.status = 'active'");
    expect(read("supabase/migrations/20261011160000_public_ranking_exclusions.sql")).toContain(
      "create table app_private.public_ranking_exclusions",
    );
  });

  test("the migration creates a table and two functions and replaces one function; shipped OFF", () => {
    expect(
      [
        ...executable.matchAll(/\bcreate\s+(?:or\s+replace\s+)?(table|function)\s+([a-z_.]+)/gi),
      ].map((m) => `${m[1]} ${m[2]}`),
    ).toEqual([
      "table app_private.pilot_settings",
      "function app_private.pilot_configure",
      "function app_private.pilot_manager_count",
      "function api.create_fantasy_team",
    ]);
    expect(executable).not.toMatch(/\bdrop\b|\btruncate\b|\bcron\.|\bdelete\s+from\b/i);
    expect(executable).not.toMatch(/\balter\s+(?!table app_private\.pilot_settings\b)/i);
    // One row, and it is OFF.
    expect(executable).toContain("insert into app_private.pilot_settings (id) values (true);");
    expect(executable).toContain("enabled boolean not null default false");
    expect(executable).toContain("max_managers integer not null default 1000");
    expect(migration.replace(/--[^\n]*/g, "")).toContain(
      "counting_rule text not null default 'teams'",
    );
    expect(executable).toContain(
      "alter table app_private.pilot_settings enable row level security;",
    );
    expect(executable).toContain(
      "alter table app_private.pilot_settings force row level security;",
    );
    expect(executable).toContain(
      "revoke all on app_private.pilot_settings from public, anon, authenticated, service_role;",
    );
    // The two new functions are postgres-only, like the other app_private switches.
    for (const signature of [
      "app_private.pilot_configure(boolean, integer)",
      "app_private.pilot_manager_count(uuid)",
    ]) {
      expect(migration).toContain(
        `revoke all on function ${signature}\n  from public, anon, authenticated, service_role;`,
      );
      expect(migration).toContain(`grant execute on function ${signature} to postgres;`);
    }
    // No other function is re-declared and no grant widens.
    expect(executable).not.toMatch(
      /\bgrant\s+execute\b[^;]*\b(anon|authenticated|service_role|public)\b/i,
    );
    // A new typed error, used nowhere else.
    for (const file of migrationFiles()) {
      if (file.startsWith(VERSION) || carriesPilotCap(file, "fantasy_pilot_full")) continue;
      expect({
        file,
        uses: read(`supabase/migrations/${file}`).includes("fantasy_pilot_full"),
      }).toEqual({ file, uses: false });
    }
  });

  test("serialises creators with one transaction advisory lock per season, taken last", () => {
    const code = migration.replace(/--[^\n]*/g, "");
    expect(occurrences(code, "pg_advisory_xact_lock(")).toBe(2); // the user's own lock, and the pilot's
    expect(occurrences(code, "pg_advisory_xact_lock_shared(")).toBe(1);
    expect(code).toContain("hashtextextended('fantasy:pilot-cap:' || season.id::text, 0)");
    // The existing locks (user, then squads shared) come first; the pilot lock last, so no cycle.
    expect(newBody.indexOf("fantasy:create:")).toBeLessThan(newBody.indexOf("fantasy:squads:"));
    expect(newBody.indexOf("fantasy:squads:")).toBeLessThan(newBody.indexOf("fantasy:pilot-cap:"));
    // Nothing else in the repository takes the pilot lock.
    for (const file of migrationFiles()) {
      if (file.startsWith(VERSION) || carriesPilotCap(file, "fantasy:pilot-cap:")) continue;
      expect({
        file,
        takes: read(`supabase/migrations/${file}`).includes("fantasy:pilot-cap:"),
      }).toEqual({ file, takes: false });
    }
    // The function is volatile (the default), so every statement takes a fresh READ COMMITTED snapshot.
    expect(signatureHasNoVolatility(migration)).toBe(true);
  });

  test("names what is paused: nothing, and why; and the script never writes a Fantasy table or sends anything", () => {
    expect(header).toContain("Nothing needs pausing.");
    for (const word of ["pg_cron job", "Edge Function", "capacity and staging seeds"]) {
      expect(header).toContain(word);
    }
    // The AGENTS.md rule is named, and the claim "no job calls it" is true in the repository.
    expect(header).toContain('AGENTS.md, "One writer at a time, per database"');
    // No Edge Function and no workflow creates a team through the function (the claim above is true).
    for (const place of ["supabase/functions", ".github"]) {
      const files = readdirSync(join(root, place), { recursive: true, encoding: "utf8" })
        .map((file) => `${place}/${file}`)
        .filter((file) => /\.(ts|tsx|js|mjs|yml|yaml|sql|py|sh)$/.test(file));
      const callers = files.filter((file) => read(file).includes("create_fantasy_team"));
      expect({ place, callers }).toEqual({ place, callers: [] });
    }
    const outside = statementsOf(script.replace(migration, ""));
    expect(outside).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+app\.fantasy_[a-z_]+\b/i);
    expect(outside).not.toMatch(/\bpilot_configure\s*\(|\bservice_[a-z_]+\s*\(|\bnet\.http/i);
    // The cap is not switched on by the script: only the result text mentions the command.
    expect(script).not.toMatch(/^\s*select app_private\.pilot_configure\(true/m);
  });

  test("tells the owner the cap is still OFF and how to switch it on, as a separate operation", () => {
    const applied = script.slice(script.indexOf("then 'Applied."), script.indexOf("as result;"));
    expect(applied).toContain("The pilot cap exists and is OFF");
    expect(applied).toContain("select app_private.pilot_configure(true, 1000);");
    expect(applied).toContain("select app_private.pilot_configure(false);");
    expect(header).toContain(
      "Switching the cap on is a different operation and needs its own authorisation",
    );
    expect(postflight).toContain("the pilot switch is not one row, OFF, 1000, teams");
  });

  test("requires the migrations whose objects it pins", () => {
    expect(REQUIRED_MIGRATIONS).toEqual(["20260926003100", "20261011160000"]);
    for (const required of REQUIRED_MIGRATIONS) {
      expect(migrationFiles().some((file) => file.startsWith(`${required}_`))).toBe(true);
      expect(preflight).toContain(`'${required}'`);
    }
  });

  test("a runbook, a database test and the front-end mapping ship with it", () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toContain(SCRIPT_PATH);
    expect(runbook).toContain("fantasy_pilot_full");
    expect(runbook).toContain("select app_private.pilot_configure(true, 1000);");
    expect(runbook).toContain("select app_private.pilot_configure(false);");
    expect(runbook).toContain("Owner to confirm Arabic");
    const dbTest = read("supabase/tests/database/pilot_cap.test.sql");
    expect(dbTest).toContain("fantasy_pilot_full");
    expect(dbTest).toContain("holds_pilot_lock");
    expect(read("src/backend/fantasy/errors.ts")).toContain('"fantasy_pilot_full"');
    expect(read("src/services/fantasy-create-service.ts")).toContain(
      "fantasy.create.error.pilot_full",
    );
  });
});

/** The create_fantasy_team declaration carries no volatility keyword: it is VOLATILE, the default. */
function signatureHasNoVolatility(source: string): boolean {
  const at = source.indexOf("create or replace function api.create_fantasy_team(");
  const head = source.slice(at, source.indexOf("as $$", at));
  return !/\b(stable|immutable)\b/i.test(head);
}
