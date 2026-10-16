import { describe, expect, test } from "bun:test";
import {
  PINS,
  REPLACED,
  REQUIRED_MIGRATIONS,
  build,
  replacedPins,
} from "./build-apply-20261016180000-fantasy-deadline-lock";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  md5,
  migrationFiles,
  occurrences,
  read,
  statementsOf,
} from "./apply-script-kit";

/**
 * The guarded script that puts 20261016180000 (a manager's change that passed the deadline check cannot
 * commit after the gameweek is locked; audit finding SEC-01, second gap) on production. The migration
 * replaces four functions, so the pins are of three kinds: the md5 of the four as they stand before (the
 * repository's latest definitions; create_fantasy_team as the pilot cap 20261016170000 left it) and after
 * (the migration's), and the md5 of the five existing functions it relies on, all recomputed here from
 * the repository files.
 */

const VERSION = "20261016180000";
const NAME = "fantasy_deadline_mutation_lock";
const SCRIPT_PATH = "scripts/backend/apply-20261016180000-fantasy-deadline-lock.sql";
const RUNBOOK = "docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md";
const script = read(SCRIPT_PATH);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const header = script.slice(0, script.indexOf("\nbegin;\n"));
const preflight = between(script, "do $preflight$", "$preflight$;");
const postflight = between(script, "do $postflight$", "$postflight$;");
const executable = statementsOf(migration);
const MFA = "supabase/migrations/20260926003100_ordinary_account_mfa_step_up.sql";
const LIFECYCLE = "supabase/migrations/20260924200000_fantasy_postponement_and_enrolment.sql";
const PILOT = "supabase/migrations/20261016170000_pilot_cap.sql";

const assertHeader = /create or replace function app_private\.fantasy_assert_mutable_gameweek\(/;
const createHeader = /create or replace function api\.create_fantasy_team\(/;
const activateHeader = /create or replace function api\.activate_fantasy_chip\(/;
const cancelHeader = /create or replace function api\.cancel_fantasy_chip\(/;

const pinsByHand: Record<string, { file: string; header: RegExp }> = {
  "api.save_fantasy_lineup(uuid,uuid,jsonb,bigint,uuid)": {
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.save_fantasy_lineup\(/,
  },
  "api.preview_fantasy_transfers(uuid,uuid,jsonb,bigint,app.fantasy_chip_type)": {
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.preview_fantasy_transfers\(/,
  },
  "api.confirm_fantasy_transfers(uuid,uuid,jsonb,bigint,uuid,app.fantasy_chip_type)": {
    file: "20260926003100_ordinary_account_mfa_step_up.sql",
    header: /create or replace function api\.confirm_fantasy_transfers\(/,
  },
  "app_private.fantasy_enrolment_gameweek(uuid)": {
    file: "20260924200000_fantasy_postponement_and_enrolment.sql",
    header: /create or replace function app_private\.fantasy_enrolment_gameweek\(/,
  },
  "api.service_advance_fantasy_lifecycle(uuid,bigint,integer)": {
    file: "20260924200000_fantasy_postponement_and_enrolment.sql",
    header: /create or replace function api\.service_advance_fantasy_lifecycle\(/,
  },
};

const nameOf = (signature: string) =>
  signature.slice(signature.indexOf(".") + 1, signature.indexOf("("));
const definerOf = (signature: string, before = "99999999999999") =>
  lastDefinerBefore(
    before,
    new RegExp(`\\bfunction\\s+${signature.split(".")[0]}\\.${nameOf(signature)}\\s*\\(`, "i"),
  );

describe("apply-20261016180000-fantasy-deadline-lock.sql", () => {
  commonApplyScriptTests({
    version: VERSION,
    name: NAME,
    scriptPath: SCRIPT_PATH,
    runbook: RUNBOOK,
    pauseText: "so the script STOPS, before writing anything, unless it is paused",
    guards: [
      "the Fantasy lifecycle tick is on -- pause it first",
      "the Fantasy worker holds its lease",
      "deadline is less than 30 minutes away",
      "'20261016170000'",
      "the database is missing the Fantasy tables this update needs",
      "is not the reviewed one this update replaces",
      "is not the reviewed one (md5",
      "perform set_config('bg.fdl_other_functions_before'",
      "perform set_config('bg.fdl_replaced_acl_before'",
      "perform set_config('bg.fdl_cron_jobs_before'",
    ],
  });

  test("is exactly what the builder makes from the migration file", () => {
    expect(script).toBe(build());
  });

  test("pins the four functions it replaces, before (latest definition) and after (the migration)", () => {
    expect(REPLACED.map((fn) => fn.signature)).toEqual([
      "app_private.fantasy_assert_mutable_gameweek(uuid)",
      "api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)",
      "api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)",
      "api.cancel_fantasy_chip(uuid,uuid,bigint)",
    ]);
    const before = {
      "app_private.fantasy_assert_mutable_gameweek(uuid)": md5(
        bodyOf(read("supabase/migrations/20260720141854_fantasy_api_security.sql"), assertHeader),
      ),
      "api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)": md5(bodyOf(read(PILOT), createHeader)),
      "api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)": md5(
        bodyOf(read(MFA), activateHeader),
      ),
      "api.cancel_fantasy_chip(uuid,uuid,bigint)": md5(bodyOf(read(MFA), cancelHeader)),
    };
    const after = {
      "app_private.fantasy_assert_mutable_gameweek(uuid)": md5(bodyOf(migration, assertHeader)),
      "api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)": md5(bodyOf(migration, createHeader)),
      "api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)": md5(
        bodyOf(migration, activateHeader),
      ),
      "api.cancel_fantasy_chip(uuid,uuid,bigint)": md5(bodyOf(migration, cancelHeader)),
    };
    // The review's independent merge of the pilot cap and this lock (2026-10-16).
    expect(before["api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)"]).toBe(
      "a85ae45fe4a131f754cd98571a8e39ab",
    );
    expect(after["api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)"]).toBe(
      "a5426f18d5a7d3f691b9e12befb79f06",
    );
    for (const fn of replacedPins(migration)) {
      const signature = fn.signature as keyof typeof before;
      expect(fn.before).toBe(before[signature]);
      expect(fn.after).toBe(after[signature]);
      expect(fn.before).not.toBe(fn.after);
      expect(occurrences(preflight, `('${fn.signature}', '${fn.before}',`)).toBe(1);
      expect(occurrences(postflight, `('${fn.signature}', '${fn.after}')`)).toBe(1);
      // The pinned "before" is the latest definition: this migration is the next one to define it.
      expect({ signature, definer: definerOf(signature, VERSION) }).toEqual({
        signature,
        definer: fn.file.split("_")[0],
      });
      expect({ signature, definer: definerOf(signature) }).toEqual({ signature, definer: VERSION });
    }
    // The assert was never redefined after 20260720141854 (only called).
    expect(definerOf("app_private.fantasy_assert_mutable_gameweek(uuid)", VERSION)).toBe(
      "20260720141854",
    );
  });

  test("pins the five functions it relies on to the repository's latest definitions", () => {
    expect(PINS.map((pin) => pin.signature).sort()).toEqual(Object.keys(pinsByHand).sort());
    for (const [signature, pin] of Object.entries(pinsByHand)) {
      const sourceMd5 = md5(bodyOf(read(`supabase/migrations/${pin.file}`), pin.header));
      expect(occurrences(preflight, `('${signature}', '${sourceMd5}',`)).toBe(1);
      expect({ signature, definer: definerOf(signature) }).toEqual({
        signature,
        definer: pin.file.split("_")[0],
      });
    }
    // None of them, nor the four it replaces, is patched in place by a later migration.
    const names = [...Object.keys(pinsByHand), ...REPLACED.map((fn) => fn.signature)].map(nameOf);
    const patched = migrationFiles().filter((file) =>
      names.some((name) =>
        new RegExp(`pg_get_functiondef\\([^)]*${name}`).test(read(`supabase/migrations/${file}`)),
      ),
    );
    expect(patched).toEqual([]);
  });

  test("create_fantasy_team is the 20261016170000 definition byte for byte plus one block", () => {
    const old = bodyOf(read(PILOT), createHeader);
    const next = bodyOf(migration, createHeader);
    const anchor =
      "  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(\n    'fantasy:squads:' || season.id::text, 0));\n";
    expect(occurrences(old, anchor)).toBe(1);
    const at = old.indexOf(anchor) + anchor.length;
    expect(next.startsWith(old.slice(0, at))).toBe(true);
    expect(next.endsWith(old.slice(at))).toBe(true);
    const added = next.slice(at, next.length - (old.length - at));
    const code = added.replace(/^\s*--[^\n]*\n/gm, "");
    expect(code).toBe(
      "  perform 1 from app.fantasy_gameweeks where id = gameweek.id for key share;\n" +
        "  gameweek := app_private.fantasy_enrolment_gameweek(season.id);\n" +
        "  if gameweek.id is null or gameweek.id <> requested.id then\n" +
        "    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';\n" +
        "  end if;\n",
    );
    // The same refusal as the check at the top of the function, which stays.
    expect(old).toContain(
      "  gameweek := app_private.fantasy_enrolment_gameweek(season.id);\n  if gameweek.id is null or gameweek.id <> requested.id then\n    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';",
    );
    // The declaration (signature, language, security, search path) is the same text.
    const declaration = (text: string) => {
      const start = createHeader.exec(text)!.index;
      return text.slice(start, text.indexOf("$$", start));
    };
    expect(declaration(migration)).toBe(declaration(read(PILOT)));
    // Lock order: the user lock, the player-list lock, the gameweek KEY SHARE, then the pilot lock.
    const order = [
      "':fantasy:create:'",
      "'fantasy:squads:'",
      "for key share",
      "'fantasy:pilot-cap:'",
    ].map((needle) => next.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the chip functions are the 20260926003100 definitions plus one check after the team lock", () => {
    const anchor =
      "  select * into team from app.fantasy_teams\n  where id = p_team_id and user_id = current_user_id for update;\n";
    for (const fnHeader of [activateHeader, cancelHeader]) {
      const old = bodyOf(read(MFA), fnHeader);
      const next = bodyOf(migration, fnHeader);
      expect(occurrences(old, anchor)).toBe(1);
      const at = old.indexOf(anchor) + anchor.length;
      expect(next.startsWith(old.slice(0, at))).toBe(true);
      expect(next.endsWith(old.slice(at))).toBe(true);
      const added = next.slice(at, next.length - (old.length - at));
      expect(added.replace(/^\s*--[^\n]*\n/gm, "")).toBe(
        "  if exists (select 1 from app.fantasy_lineups lineup\n" +
          "    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id\n" +
          "      and lineup.locked_at is not null) then\n" +
          "    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';\n" +
          "  end if;\n",
      );
      // The mutability check still comes first (before the team lock).
      expect(
        next.indexOf("app_private.fantasy_assert_mutable_gameweek(p_gameweek_id)"),
      ).toBeLessThan(next.indexOf(anchor));
      const declaration = (text: string) => {
        const start = fnHeader.exec(text)!.index;
        return text.slice(start, text.indexOf("$$", start));
      };
      expect(declaration(migration)).toBe(declaration(read(MFA)));
    }
  });

  test("the check refuses before any lock, skips it read-only, then locks FOR KEY SHARE and checks again", () => {
    const old = bodyOf(
      read("supabase/migrations/20260720141854_fantasy_api_security.sql"),
      assertHeader,
    );
    const next = bodyOf(migration, assertHeader);
    const code = next.replace(/^\s*--[^\n]*\n/gm, "");
    const check =
      "  if not found then\n    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';\n  end if;\n  if target.status <> 'open' or statement_timestamp() >= target.deadline_at then\n    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';\n  end if;\n";
    // The old check, unchanged, appears twice: before the lock and after it.
    expect(old).toContain(check);
    expect(occurrences(code, check)).toBe(2);
    const unlocked = code.indexOf(
      "select * into target from app.fantasy_gameweeks where id = p_gameweek_id;\n",
    );
    const readOnly = code.indexOf(
      "if pg_catalog.current_setting('transaction_read_only') = 'on' then\n    return target;\n  end if;",
    );
    const locked = code.indexOf(
      "select * into target from app.fantasy_gameweeks where id = p_gameweek_id for key share;\n",
    );
    expect(unlocked).toBeGreaterThan(-1);
    expect(code.indexOf(check)).toBeGreaterThan(unlocked);
    expect(readOnly).toBeGreaterThan(code.indexOf(check));
    expect(locked).toBeGreaterThan(readOnly);
    expect(code.lastIndexOf(check)).toBeGreaterThan(locked);
    // VOLATILE now (STABLE before), same return type, security definer and search path.
    const declaration = (text: string) => {
      const start = assertHeader.exec(text)!.index;
      return text.slice(start, text.indexOf("$$", start));
    };
    expect(
      declaration(read("supabase/migrations/20260720141854_fantasy_api_security.sql")).replace(
        "\nstable\n",
        "\nvolatile\n",
      ),
    ).toBe(declaration(migration));
  });

  test("the migration replaces only those four functions and writes no data", () => {
    expect(
      [
        ...executable.matchAll(
          /\bcreate\s+(or\s+replace\s+)?(function|trigger|table|view|index)\s+([a-z_.]+)/gi,
        ),
      ].map((m) => `${m[2]} ${m[3]}`),
    ).toEqual([
      "function app_private.fantasy_assert_mutable_gameweek",
      "function api.create_fantasy_team",
      "function api.activate_fantasy_chip",
      "function api.cancel_fantasy_chip",
    ]);
    // Outside the function bodies (and the read-only prerequisite check) nothing writes.
    const outsideBodies = executable.replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
    expect(outsideBodies).not.toMatch(
      /\binsert\s+into\b|\bupdate\s+(app|app_private|api)\.|\bdelete\s+from\b|\bdrop\b|\balter\b|\bgrant\b|\brevoke\b|\btruncate\b|\bcron\./i,
    );
    expect(occurrences(outsideBodies, "comment on function")).toBe(1);
    // The new check writes nothing either; the new squad block adds no write.
    expect(statementsOf(bodyOf(migration, assertHeader))).not.toMatch(
      /\b(insert|update|delete)\b/i,
    );
    // The only new row lock is FOR KEY SHARE on the gameweek row, twice (the check, the squad); the
    // only FOR UPDATE are the chip functions' existing team-row locks.
    expect(occurrences(executable, "for key share")).toBe(2);
    const forUpdate = (text: string) => [...text.matchAll(/\bfor\s+update\b/gi)].length;
    expect(forUpdate(executable)).toBe(
      forUpdate(statementsOf(bodyOf(read(MFA), activateHeader))) +
        forUpdate(statementsOf(bodyOf(read(MFA), cancelHeader))) +
        forUpdate(statementsOf(bodyOf(read(PILOT), createHeader))),
    );
    expect(executable).not.toMatch(/\bfor\s+(no\s+key\s+update|share)\b/i);
  });

  test("the lock step it serialises with takes the gameweek row FOR UPDATE before the lineups", () => {
    const advance = bodyOf(
      read(LIFECYCLE),
      /create or replace function api\.service_advance_fantasy_lifecycle\(/,
    );
    const rowLock = advance.indexOf(
      "select * into target from app.fantasy_gameweeks where id = p_gameweek_id for update;",
    );
    expect(rowLock).toBeGreaterThan(-1);
    expect(rowLock).toBeLessThan(
      advance.indexOf("update app.fantasy_lineups lineup set locked_at"),
    );
    expect(advance).toContain("next_status := 'locked'");
    // Every manager write reaches the check before its first write: the save, the chips, and the
    // transfers through the preview.
    const mfa = read(MFA);
    for (const [fn, firstWrite] of [
      [/create or replace function api\.save_fantasy_lineup\(/, "insert into app.fantasy_lineups"],
      [
        /create or replace function api\.activate_fantasy_chip\(/,
        "insert into app.fantasy_chip_uses",
      ],
      [/create or replace function api\.cancel_fantasy_chip\(/, "update app.fantasy_chip_uses"],
      [
        /create or replace function api\.confirm_fantasy_transfers\(/,
        "insert into app.fantasy_free_hit_snapshots",
      ],
    ] as const) {
      const body = bodyOf(mfa, fn);
      const check = Math.max(
        body.indexOf("app_private.fantasy_assert_mutable_gameweek(p_gameweek_id)"),
        body.indexOf("api.preview_fantasy_transfers("),
      );
      expect(check).toBeGreaterThan(-1);
      expect(check).toBeLessThan(body.indexOf(firstWrite));
    }
    const preview = bodyOf(mfa, /create or replace function api\.preview_fantasy_transfers\(/);
    expect(preview).toContain(
      "gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);",
    );
    // The preview is STABLE, which is why the check takes no lock in a read-only transaction.
    expect(
      mfa.slice(
        mfa.indexOf("create or replace function api.preview_fantasy_transfers("),
        mfa.indexOf(preview),
      ),
    ).toContain("\nstable\n");
    // The callers of the check: defined last in 20260926003100, the chip functions again here.
    const callers = migrationFiles().filter((file) =>
      statementsOf(read(`supabase/migrations/${file}`)).includes(
        "app_private.fantasy_assert_mutable_gameweek(p_gameweek_id)",
      ),
    );
    expect(callers.slice(-2)).toEqual([
      "20260926003100_ordinary_account_mfa_step_up.sql",
      `${VERSION}_${NAME}.sql`,
    ]);
    // In this migration only the two chip functions call it.
    expect(
      occurrences(executable, "app_private.fantasy_assert_mutable_gameweek(p_gameweek_id)"),
    ).toBe(2);
  });

  test("pauses the Fantasy lifecycle, copied from AGENTS.md, and refuses while it runs", () => {
    const agents = read("AGENTS.md");
    for (const command of [
      "select app_private.fantasy_automation_configure(false);",
      "select holder, expires_at, released_at from app_private.fantasy_worker_lease",
    ]) {
      expect(agents).toContain(command);
      expect(header).toContain(command);
    }
    expect(header).toContain("select app_private.fantasy_automation_configure(true);");
    expect(header).toContain("fantasy-lifecycle-tick");
    expect(header).toContain("fantasy-worker-tick");
    expect(preflight).toContain(
      "from app_private.fantasy_automation_settings s where s.lifecycle_tick_enabled",
    );
    expect(preflight).toContain("l.released_at is null and l.expires_at > statement_timestamp()");
    expect(preflight).toContain(
      "g.status = 'open' and g.deadline_at > statement_timestamp()\n               and g.deadline_at < statement_timestamp() + interval '30 minutes'",
    );
    const applied = script.slice(script.indexOf("then 'Applied."), script.indexOf("as result;"));
    expect(applied).toContain("select app_private.fantasy_automation_configure(true);");
  });

  test("checks the result: text, volatility, owner and grants, nothing else moved", () => {
    expect(postflight).toContain("def.provolatile <> 'v'");
    expect(postflight).toContain("def.proconfig is distinct from array['search_path=\"\"']");
    expect(postflight).toContain("current_setting('bg.fdl_replaced_acl_before', true)");
    expect(postflight).toContain("current_setting('bg.fdl_other_functions_before', true)");
    expect(postflight).toContain("current_setting('bg.fdl_cron_jobs_before', true)");
    expect(postflight).toContain("where n.nspname in ('api', 'app_private')");
  });

  test("requires the migrations whose objects it replaces or pins", () => {
    expect(REQUIRED_MIGRATIONS).toEqual([
      "20260720141854",
      "20260924200000",
      "20260926003100",
      "20261016170000",
    ]);
    // The migration's own prerequisite check knows the pilot cap.
    expect(migration).toContain("to_regclass('app_private.pilot_settings') is null");
    for (const required of REQUIRED_MIGRATIONS) {
      expect(migrationFiles().some((file) => file.startsWith(`${required}_`))).toBe(true);
      expect(preflight).toContain(`'${required}'`);
    }
  });

  test("never writes a Fantasy table, calls a worker, or sends anything", () => {
    const outside = statementsOf(script.replace(migration, ""));
    expect(outside).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+app\./i);
    expect(outside).not.toMatch(
      /\bfantasy_(worker_tick|lifecycle_tick)\s*\(|\bservice_[a-z_]+\s*\(|\bnet\.http/i,
    );
  });

  test("a runbook and a database test ship with it", () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toContain(SCRIPT_PATH);
    expect(runbook).toContain("fantasy_lineup_not_locked");
    expect(runbook).toContain("Rolling back");
    expect(runbook).toContain("select app_private.fantasy_automation_configure(false);");
    const test = read("supabase/tests/database/fantasy_deadline_mutation_lock.test.sql");
    expect(test).toContain("for key share");
    expect(test).toContain("transaction_read_only");
    // The finalizing guard's runbook no longer calls the gap unproven.
    const guard = read("docs/production/FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md");
    expect(guard).not.toContain("not proven;");
    expect(guard).toContain(RUNBOOK);
  });
});
