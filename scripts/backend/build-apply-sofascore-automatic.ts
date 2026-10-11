/**
 * Builds scripts/backend/apply-sofascore-automatic.sql: the ONE guarded script
 * the owner pastes in the Supabase SQL editor to bring production from "live
 * scores read from SofaScore" to "SofaScore Fantasy scoring installed".
 *
 *   bun scripts/backend/build-apply-sofascore-automatic.ts          # rewrite the script
 *   bun scripts/backend/build-apply-sofascore-automatic.ts --check  # exit 1 if it drifted
 *
 * The script carries each migration file byte for byte, once, and the test
 * (apply-sofascore-automatic-script.test.ts) fails when the committed script
 * differs from what this file builds from the files in supabase/migrations.
 * Rerun this after a migration file or a pin below changes.
 *
 * HOW TO ADD A MIGRATION (mechanical, three edits in this file):
 *   1. Move its entry from RESERVED_SLOTS to STEPS (or add a new STEPS entry),
 *      keeping versions in ascending order.
 *   2. Fill its `pending` guards (what must be true before it runs), its
 *      `verify` checks (what must be true afterwards) and its md5 pins from the
 *      green database-quality run (see the CI step that prints them).
 *   3. Run this file, then the test.
 * While a slot is reserved, or a pin below is still a placeholder, the
 * generated script REFUSES TO RUN, before it changes anything.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const SCRIPT_PATH = "scripts/backend/apply-sofascore-automatic.sql";

/** A pin is a real md5 or one of these markers; a marker stops the script. */
export const PIN_PLACEHOLDER_PREFIX = "FILL_FROM_CI_";
export const isRealMd5 = (pin: string) => /^[0-9a-f]{32}$/.test(pin);

export interface Step {
  version: string;
  name: string;
  /** What this step changes, for the header. */
  summary: string;
  /**
   * plpgsql statements run in the preflight ONLY while this migration is not
   * yet recorded. Raise `stop: ...` exceptions; nothing may be written.
   */
  pending: string;
  /**
   * plpgsql statements run in the postflight for EVERY step, whether it was
   * applied just now or was already recorded: they verify what is installed.
   * Append to `problems` (a text[]); declare any variable in a nested block.
   */
  verify: string;
  /** Every md5 used above, so a placeholder can be refused up front. */
  pins: Record<string, string>;
}

export interface ReservedSlot {
  version: string;
  name: string;
  owner: string;
}

// ---------------------------------------------------------------------------
// Pins. Real values were measured; placeholders stop the script.
// ---------------------------------------------------------------------------
export const PINS = {
  // Production's recorder on 2026-10-04 (before 20261003180000), measured there
  // and on a local database built from main without it.
  recorderBefore: "0e4852a0a3c35bc3332ebd891d2cdf8e",
  // The reviewed new definitions, measured on a local database built from the
  // migrations (see the existing apply-20261003180000 script).
  recorderAfter: "d5c60fc1a8b42f23e91c0db5e321a26d",
  reconciledWrapper: "06104038065b147d0573bbc68f23cfe0",
  // api.football_sofascore_live_snapshot() as 20261011100000 leaves it, and as
  // 20261011110000 leaves it (database-quality run 38122444749).
  snapshotBefore: "e39415311b09f4a5cb29e96897d0d88f",
  snapshotAfter: "c9e9e9dc913d1bf729c7c49bc2f821bc",
  // api.service_record_sofascore_fantasy_observation(): printed by the CI step
  // "SofaScore Fantasy observation md5" in database-quality. FILL THIS.
  sofascoreFantasyObservation: "FILL_FROM_CI_SOFASCORE_FANTASY_OBSERVATION_MD5",

  // 20261011130000, the two functions it REPLACES. "Before" is what production
  // holds now (measured by the CI step "SofaScore automatic pre-state md5" on a
  // database reset to version 20261011120000); "after" is the reviewed new
  // definition (CI step "SofaScore automatic post-state md5", full reset).
  supportingStateBefore: "FILL_FROM_CI_SUPPORTING_STATE_BEFORE_MD5",
  supportingStateAfter: "FILL_FROM_CI_SUPPORTING_STATE_AFTER_MD5",
  supportingDependencyBefore: "FILL_FROM_CI_SUPPORTING_DEPENDENCY_BEFORE_MD5",
  supportingDependencyAfter: "FILL_FROM_CI_SUPPORTING_DEPENDENCY_AFTER_MD5",
  // 20261011130000, the four functions it CREATES (post-state step only).
  matchEnqueue: "FILL_FROM_CI_MATCH_ENQUEUE_MD5",
  autoMapPlayers: "FILL_FROM_CI_AUTO_MAP_PLAYERS_MD5",
  adminMatchQueue: "FILL_FROM_CI_ADMIN_MATCH_QUEUE_MD5",
  adminResolveMatch: "FILL_FROM_CI_ADMIN_RESOLVE_MATCH_MD5",

  // 20261011140000, the three functions it CREATES (post-state step only).
  fantasyContext: "FILL_FROM_CI_FANTASY_CONTEXT_MD5",
  fantasyNote: "FILL_FROM_CI_FANTASY_NOTE_MD5",
  fantasyDue: "FILL_FROM_CI_FANTASY_DUE_MD5",

  // 20261011150000: the ops health body it PATCHES (pre-state step: before;
  // post-state step: after) and the helper it CREATES.
  opsHealthBefore: "FILL_FROM_CI_OPS_HEALTH_BEFORE_MD5",
  opsHealthAfter: "FILL_FROM_CI_OPS_HEALTH_AFTER_MD5",
  fantasyFixtureHealthReady: "FILL_FROM_CI_FANTASY_FIXTURE_HEALTH_READY_MD5",
} as const;

/** Migrations other lanes still have to add. Remove an entry when it moves to STEPS. Empty: every slot is filled. */
export const RESERVED_SLOTS: ReservedSlot[] = [];

const recordedGuard = (versions: string[]) =>
  `(select count(*) from supabase_migrations.schema_migrations where version in (${versions
    .map((v) => `'${v}'`)
    .join(", ")}))`;

// ---------------------------------------------------------------------------
// Building blocks for the `pending` and `verify` text of the steps below.
// ---------------------------------------------------------------------------
type Callable = "service" | "admin" | "nobody" | "not_api";

interface FnCheck {
  /** Signature as to_regprocedure() reads it. */
  sig: string;
  /** Who may execute it: service_role only, authenticated only, no API role at all, or just not the three public-facing ones. */
  callable: Callable;
  /** Key in PINS for the reviewed definition. */
  pin?: keyof typeof PINS;
}

const GRANT_TESTS: Record<Callable, string> = {
  service: `has_function_privilege('public', fn, 'execute')
          or has_function_privilege('anon', fn, 'execute')
          or has_function_privilege('authenticated', fn, 'execute')
          or not has_function_privilege('service_role', fn, 'execute')`,
  admin: `has_function_privilege('public', fn, 'execute')
          or has_function_privilege('anon', fn, 'execute')
          or has_function_privilege('service_role', fn, 'execute')
          or not has_function_privilege('authenticated', fn, 'execute')`,
  nobody: `has_function_privilege('public', fn, 'execute')
          or has_function_privilege('anon', fn, 'execute')
          or has_function_privilege('authenticated', fn, 'execute')
          or has_function_privilege('service_role', fn, 'execute')`,
  not_api: `has_function_privilege('public', fn, 'execute')
          or has_function_privilege('anon', fn, 'execute')
          or has_function_privilege('authenticated', fn, 'execute')`,
};

/** plpgsql for the postflight: each function exists, is security definer with an empty search_path, has the right grants and the reviewed md5. */
const verifyFunctions = (version: string, fns: FnCheck[]) => `
    declare
      fn regprocedure;
    begin${fns
      .map(
        (f) => `
      fn := to_regprocedure('${f.sig}');
      if fn is null then
        problems := problems || '${version}: ${f.sig} is missing'::text;
      else
        if not exists (select 1 from pg_proc p
            where p.oid = fn and p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""']) then
          problems := problems || ('${version}: not security definer with an empty search_path: ' || fn::text);
        end if;
        if ${GRANT_TESTS[f.callable]} then
          problems := problems || ('${version}: callable by the wrong roles: ' || fn::text);
        end if;${
          f.pin
            ? `
        if md5(pg_get_functiondef(fn)) <> '${PINS[f.pin]}' then
          problems := problems || ('${version}: not the reviewed definition (md5): ' || fn::text);
        end if;`
            : ""
        }
      end if;`,
      )
      .join("\n")}
    end;`;

/** plpgsql for the postflight: each private table forces row level security and no API role can touch it. */
const verifyPrivateTables = (version: string, tables: string[]) => `
    declare
      t text;
    begin
      foreach t in array array[${tables.map((t) => `'${t}'`).join(", ")}] loop
        if to_regclass(t) is null then
          problems := problems || ('${version}: table is missing: ' || t);
        elsif not (select relrowsecurity and relforcerowsecurity from pg_class where oid = t::regclass)
          or has_table_privilege('anon', t, 'select, insert, update, delete')
          or has_table_privilege('authenticated', t, 'select, insert, update, delete')
          or has_table_privilege('service_role', t, 'select, insert, update, delete') then
          problems := problems || ('${version}: table is readable by an API role or lacks forced RLS: ' || t);
        end if;
      end loop;
    end;`;

/** plpgsql (preflight, pending only): none of these objects may exist yet. */
const mustNotExist = (version: string, objects: { functions?: string[]; tables?: string[] }) => {
  const tests = [
    ...(objects.tables ?? []).map((t) => `to_regclass('${t}') is not null`),
    ...(objects.functions ?? []).map((f) => `to_regprocedure('${f}') is not null`),
  ];
  return `
    if ${tests.join("\n      or ")} then
      raise exception 'stop: ${version} is not recorded but an object it creates already exists -- production is not the state it was written for';
    end if;`;
};

/** plpgsql (preflight, pending only): all of these must exist. */
const mustExist = (version: string, objects: { functions?: string[]; tables?: string[] }) => {
  const tests = [
    ...(objects.tables ?? []).map((t) => `to_regclass('${t}') is null`),
    ...(objects.functions ?? []).map((f) => `to_regprocedure('${f}') is null`),
  ];
  return `
    if ${tests.join("\n      or ")} then
      raise exception 'stop: an object migration ${version} depends on is missing -- production is not the state it was written for';
    end if;`;
};

/** plpgsql (preflight, pending only): the function being replaced is the reviewed one. */
const mustMatchMd5 = (version: string, sig: string, pin: string) => `
    if md5(pg_get_functiondef('${sig}'::regprocedure)) is distinct from '${pin}' then
      raise exception 'stop: ${sig} is not the reviewed version ${version} replaces (md5)';
    end if;`;

/** The 20261011120000 function is installed, or is applied earlier in this same run. */
const needsFantasyObservationFunction = (version: string) => `
    if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null
      and not exists (select 1 from pg_temp.sofascore_plan where version = '20261011120000' and not was_recorded) then
      raise exception 'stop: migration 20261011120000 is neither recorded nor part of this run, but ${version} builds on api.service_record_sofascore_fantasy_observation';
    end if;`;

export const STEPS: Step[] = [
  {
    version: "20261003180000",
    name: "reconciled_provider_observations",
    summary:
      "reconciled provider observations: the 'provider-reconciled' source, app_private.football_provider_fixture_links and a service-only wrapper; replaces the observation recorder with the same function that accepts that source only inside the wrapper",
    pending: `
    -- The Fantasy tick scores from observations; the recorder is replaced here.
    if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
      raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); (switch it back on afterwards)';
    end if;
    if to_regclass('app_private.football_provider_fixture_links') is not null
      or to_regprocedure('api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)') is not null then
      raise exception 'stop: 20261003180000 is not recorded but the provider fixture links table or the reconciled wrapper already exists -- production is not the state it was written for';
    end if;
    if to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
      or to_regprocedure('app_private.is_service_request()') is null
      or to_regclass('app_private.fantasy_fixture_observations') is null
      or to_regclass('app_private.football_provider_mappings') is null then
      raise exception 'stop: an object migration 20261003180000 depends on is missing (the mapping supporting-dependency migration 20261003120000 or the adaptive scoring ones)';
    end if;
    if to_regprocedure('api.service_record_fantasy_observation(uuid,jsonb,text)') is null then
      raise exception 'stop: the observation recorder api.service_record_fantasy_observation is missing -- the adaptive scoring migrations are not applied';
    end if;
    if md5(pg_get_functiondef('api.service_record_fantasy_observation(uuid,jsonb,text)'::regprocedure))
        <> '${PINS.recorderBefore}' then
      raise exception 'stop: the observation recorder is not the version migration 20261003180000 replaces (md5)';
    end if;`,
    verify: `
    declare
      recorder regprocedure := to_regprocedure('api.service_record_fantasy_observation(uuid,jsonb,text)');
      wrapper regprocedure := to_regprocedure('api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)');
      fn regprocedure;
    begin
      if recorder is null or md5(pg_get_functiondef(recorder)) <> '${PINS.recorderAfter}' then
        problems := problems || '20261003180000: the observation recorder is not the reviewed new version'::text;
      end if;
      if wrapper is null or md5(pg_get_functiondef(wrapper)) <> '${PINS.reconciledWrapper}' then
        problems := problems || '20261003180000: the reconciled wrapper is missing or not the reviewed version'::text;
      end if;
      if coalesce((select pg_get_constraintdef(oid) from pg_constraint
            where conname = 'fantasy_fixture_observations_source_check'
              and conrelid = 'app_private.fantasy_fixture_observations'::regclass), '')
          not like '%provider-reconciled%' then
        problems := problems || '20261003180000: the observation source check does not accept provider-reconciled'::text;
      end if;
      if to_regclass('app_private.football_provider_fixture_links') is null then
        problems := problems || '20261003180000: the provider fixture links table is missing'::text;
      elsif not (select relrowsecurity and relforcerowsecurity from pg_class
            where oid = 'app_private.football_provider_fixture_links'::regclass)
        or has_table_privilege('anon', 'app_private.football_provider_fixture_links', 'select')
        or has_table_privilege('authenticated', 'app_private.football_provider_fixture_links', 'select')
        or has_table_privilege('service_role', 'app_private.football_provider_fixture_links', 'select') then
        problems := problems || '20261003180000: the provider fixture links table is readable by an API role or lacks forced RLS'::text;
      end if;
      foreach fn in array array_remove(array[recorder, wrapper], null) loop
        if has_function_privilege('public', fn, 'execute')
          or has_function_privilege('anon', fn, 'execute')
          or has_function_privilege('authenticated', fn, 'execute')
          or not has_function_privilege('service_role', fn, 'execute') then
          problems := problems || ('20261003180000: callable by the wrong roles: ' || fn::text);
        end if;
      end loop;
    end;`,
    pins: {
      recorderBefore: PINS.recorderBefore,
      recorderAfter: PINS.recorderAfter,
      reconciledWrapper: PINS.reconciledWrapper,
    },
  },
  {
    version: "20261011110000",
    name: "football_sofascore_snapshot_teams",
    summary:
      "home and away team ids on api.football_sofascore_live_snapshot() (same signature and grants, pure read), which the SofaScore match-details path needs",
    pending: `
    if ${recordedGuard(["20261011090000", "20261011100000"])} <> 2 then
      raise exception 'stop: migration 20261011090000 or 20261011100000 is not recorded -- apply scripts/backend/apply-sofascore-live-switch.sql first';
    end if;
    if to_regprocedure('api.football_sofascore_live_snapshot()') is null
      or to_regprocedure('app_private.is_service_request()') is null
      or to_regclass('app_private.football_provider_mappings') is null
      or to_regclass('app.fixtures') is null then
      raise exception 'stop: an object migration 20261011110000 depends on is missing -- production is not the state it was written for';
    end if;
    -- It replaces exactly the definition the live-switch release installed.
    if md5(pg_get_functiondef('api.football_sofascore_live_snapshot()'::regprocedure))
        is distinct from '${PINS.snapshotBefore}' then
      raise exception 'stop: api.football_sofascore_live_snapshot() is not the reviewed version 20261011110000 replaces (md5)';
    end if;`,
    verify: `
    declare
      fn regprocedure := to_regprocedure('api.football_sofascore_live_snapshot()');
    begin
      if fn is null then
        problems := problems || '20261011110000: api.football_sofascore_live_snapshot() is missing'::text;
      else
        if not exists (select 1 from pg_proc p
            where p.oid = fn and p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""']) then
          problems := problems || '20261011110000: the snapshot function is not security definer with an empty search_path'::text;
        end if;
        if has_function_privilege('public', fn, 'execute')
          or has_function_privilege('anon', fn, 'execute')
          or has_function_privilege('authenticated', fn, 'execute')
          or not has_function_privilege('service_role', fn, 'execute') then
          problems := problems || '20261011110000: the snapshot function is callable by the wrong roles'::text;
        end if;
        if md5(pg_get_functiondef(fn)) <> '${PINS.snapshotAfter}' then
          problems := problems || '20261011110000: the snapshot function is not the reviewed new version (md5)'::text;
        end if;
      end if;
    end;`,
    pins: { snapshotBefore: PINS.snapshotBefore, snapshotAfter: PINS.snapshotAfter },
  },
  {
    version: "20261011120000",
    name: "sofascore_fantasy_observations",
    summary:
      "api.service_record_sofascore_fantasy_observation(): records a finished SofaScore match as a Fantasy scoring input (service role only; adds one function, changes no data)",
    pending: `
    if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is not null then
      raise exception 'stop: 20261011120000 is not recorded but api.service_record_sofascore_fantasy_observation already exists -- production is not the state it was written for';
    end if;
    -- 20261003180000 is installed, or is applied earlier in this same run.
    if to_regprocedure('api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)') is null
      and not exists (select 1 from pg_temp.sofascore_plan where version = '20261003180000' and not was_recorded) then
      raise exception 'stop: migration 20261003180000 is recorded but api.service_record_reconciled_fantasy_observation is missing -- production is not the state it was recorded as';
    end if;
    if to_regprocedure('app_private.is_service_request()') is null
      or to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
      or to_regprocedure('app_private.fantasy_observation_estimated(jsonb)') is null
      or to_regclass('app_private.football_provider_mappings') is null
      or to_regclass('app.fixtures') is null
      or to_regclass('app.team_memberships') is null then
      raise exception 'stop: an object migration 20261011120000 calls is missing -- production is not the state it was written for';
    end if;`,
    verify: `
    declare
      fn regprocedure := to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)');
    begin
      if fn is null then
        problems := problems || '20261011120000: api.service_record_sofascore_fantasy_observation() is missing'::text;
      else
        if not exists (select 1 from pg_proc p
            where p.oid = fn and p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""']) then
          problems := problems || '20261011120000: the Fantasy observation function is not security definer with an empty search_path'::text;
        end if;
        if has_function_privilege('public', fn, 'execute')
          or has_function_privilege('anon', fn, 'execute')
          or has_function_privilege('authenticated', fn, 'execute')
          or not has_function_privilege('service_role', fn, 'execute') then
          problems := problems || '20261011120000: the Fantasy observation function is callable by the wrong roles'::text;
        end if;
        if md5(pg_get_functiondef(fn)) <> '${PINS.sofascoreFantasyObservation}' then
          problems := problems || '20261011120000: the Fantasy observation function is not the reviewed version (md5)'::text;
        end if;
      end if;
    end;`,
    pins: { sofascoreFantasyObservation: PINS.sofascoreFantasyObservation },
  },
  {
    version: "20261011130000",
    name: "sofascore_player_auto_map",
    summary:
      "automatic SofaScore player matching: two private tables (match log, review queue), the service function that maps the safe cases and queues the rest, the two staff functions for the review list, and the second proof of 'reviewed' (replaces app_private.football_mapping_supporting_state and football_mapping_supporting_dependency); changes no existing row",
    pending: `${mustNotExist("20261011130000", {
      tables: [
        "app_private.sofascore_player_match_log",
        "app_private.sofascore_player_match_queue",
      ],
      functions: [
        "app_private.sofascore_player_match_enqueue(text,uuid,uuid,text,text,text,integer,text,text,uuid[])",
        "api.service_sofascore_auto_map_players(uuid,jsonb)",
        "api.admin_sofascore_player_match_queue()",
        "api.admin_resolve_sofascore_player_match(text,uuid)",
      ],
    })}${mustExist("20261011130000", {
      tables: [
        "app_private.football_provider_mappings",
        "app_private.football_player_mapping_proposals",
        "app_private.staff_principals",
        "app.fixtures",
        "app.players",
        "app.teams",
        "app.team_memberships",
        "auth.users",
      ],
      functions: [
        "app_private.football_mapping_supporting_state(uuid)",
        "app_private.football_mapping_supporting_dependency(text,uuid,uuid)",
        "app_private.person_name_key(text)",
        "app_private.is_service_request()",
        "app_private.admin_assert_principal(boolean,boolean)",
        "app_private.admin_assert_permission(text,boolean)",
        "app_private.admin_payload_fingerprint(jsonb)",
        "app_private.football_mapping_refuse(text)",
        "app_private.football_mapping_require_reader(uuid)",
      ],
    })}${needsFantasyObservationFunction("20261011130000")}
    -- It replaces exactly the definitions migration 20261003120000 left.${mustMatchMd5(
      "20261011130000",
      "app_private.football_mapping_supporting_state(uuid)",
      PINS.supportingStateBefore,
    )}${mustMatchMd5(
      "20261011130000",
      "app_private.football_mapping_supporting_dependency(text,uuid,uuid)",
      PINS.supportingDependencyBefore,
    )}`,
    verify: `${verifyPrivateTables("20261011130000", [
      "app_private.sofascore_player_match_log",
      "app_private.sofascore_player_match_queue",
    ])}
${verifyFunctions("20261011130000", [
  {
    sig: "app_private.football_mapping_supporting_state(uuid)",
    callable: "nobody",
    pin: "supportingStateAfter",
  },
  {
    sig: "app_private.football_mapping_supporting_dependency(text,uuid,uuid)",
    callable: "nobody",
    pin: "supportingDependencyAfter",
  },
  {
    sig: "app_private.sofascore_player_match_enqueue(text,uuid,uuid,text,text,text,integer,text,text,uuid[])",
    callable: "nobody",
    pin: "matchEnqueue",
  },
  {
    sig: "api.service_sofascore_auto_map_players(uuid,jsonb)",
    callable: "service",
    pin: "autoMapPlayers",
  },
  { sig: "api.admin_sofascore_player_match_queue()", callable: "admin", pin: "adminMatchQueue" },
  {
    sig: "api.admin_resolve_sofascore_player_match(text,uuid)",
    callable: "admin",
    pin: "adminResolveMatch",
  },
])}`,
    pins: {
      supportingStateBefore: PINS.supportingStateBefore,
      supportingStateAfter: PINS.supportingStateAfter,
      supportingDependencyBefore: PINS.supportingDependencyBefore,
      supportingDependencyAfter: PINS.supportingDependencyAfter,
      matchEnqueue: PINS.matchEnqueue,
      autoMapPlayers: PINS.autoMapPlayers,
      adminMatchQueue: PINS.adminMatchQueue,
      adminResolveMatch: PINS.adminResolveMatch,
    },
  },
  {
    version: "20261011140000",
    name: "sofascore_fantasy_auto_state",
    summary:
      "the memory of the automatic SofaScore Fantasy path: one private table (attempts, retry time, trimmed SofaScore replies) and three service-only functions (context, note, due); scores nothing and changes no existing object",
    pending: `${mustNotExist("20261011140000", {
      tables: ["app_private.sofascore_fantasy_attempts"],
      functions: [
        "api.service_sofascore_fantasy_context(uuid,text[])",
        "api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)",
        "api.service_sofascore_fantasy_due(integer,integer,integer,integer,integer)",
      ],
    })}${mustExist("20261011140000", {
      tables: [
        "app_private.fantasy_fixture_observations",
        "app_private.football_provider_mappings",
        "app.fixtures",
        "app.fantasy_fixture_assignments",
        "app.fantasy_gameweeks",
      ],
      functions: ["app_private.is_service_request()", "app_private.fantasy_adaptive_enabled(uuid)"],
    })}${needsFantasyObservationFunction("20261011140000")}`,
    verify: `${verifyPrivateTables("20261011140000", ["app_private.sofascore_fantasy_attempts"])}
${verifyFunctions("20261011140000", [
  {
    sig: "api.service_sofascore_fantasy_context(uuid,text[])",
    callable: "service",
    pin: "fantasyContext",
  },
  {
    sig: "api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)",
    callable: "service",
    pin: "fantasyNote",
  },
  {
    sig: "api.service_sofascore_fantasy_due(integer,integer,integer,integer,integer)",
    callable: "service",
    pin: "fantasyDue",
  },
])}`,
    pins: {
      fantasyContext: PINS.fantasyContext,
      fantasyNote: PINS.fantasyNote,
      fantasyDue: PINS.fantasyDue,
    },
  },
  {
    version: "20261011150000",
    name: "ops_health_adaptive_coverage",
    summary:
      "ops health counts SofaScore (adaptive) Fantasy coverage: adds app_private.fantasy_fixture_health_ready and patches the deployed health body app_private.ops_health_checks_before_adaptive in place (same checks, same output shape); changes no row",
    pending: `${mustNotExist("20261011150000", {
      functions: ["app_private.fantasy_fixture_health_ready(uuid,uuid,boolean)"],
    })}${mustExist("20261011150000", {
      tables: [
        "app_private.fantasy_fixture_scoring_modes",
        "app_private.fantasy_fixture_observations",
      ],
      functions: [
        "app_private.ops_health_checks_before_adaptive()",
        "app_private.fantasy_fixture_ready(uuid,uuid,boolean)",
        "app_private.fantasy_adaptive_enabled(uuid)",
      ],
    })}
    -- It patches the text of exactly the health body the adaptive scoring release left.${mustMatchMd5(
      "20261011150000",
      "app_private.ops_health_checks_before_adaptive()",
      PINS.opsHealthBefore,
    )}`,
    verify: `${verifyFunctions("20261011150000", [
      {
        sig: "app_private.fantasy_fixture_health_ready(uuid,uuid,boolean)",
        callable: "nobody",
        pin: "fantasyFixtureHealthReady",
      },
      {
        sig: "app_private.ops_health_checks_before_adaptive()",
        callable: "not_api",
        pin: "opsHealthAfter",
      },
    ])}
    declare
      body text := pg_get_functiondef(to_regprocedure('app_private.ops_health_checks_before_adaptive()'));
    begin
      if body is null or position('app_private.fantasy_fixture_health_ready(g.id,f.id,' in body) = 0 then
        problems := problems || '20261011150000: the health body does not call fantasy_fixture_health_ready'::text;
      end if;
    end;`,
    pins: {
      opsHealthBefore: PINS.opsHealthBefore,
      opsHealthAfter: PINS.opsHealthAfter,
      fantasyFixtureHealthReady: PINS.fantasyFixtureHealthReady,
    },
  },
];

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const migrationPath = (step: { version: string; name: string }) =>
  `supabase/migrations/${step.version}_${step.name}.sql`;
export const readMigration = (step: { version: string; name: string }) =>
  readFileSync(join(root, migrationPath(step)), "utf8");
export const tagFor = (version: string) => `$bg_${version}_file$`;

const planPending = (version: string) =>
  `exists (select 1 from pg_temp.sofascore_plan where version = '${version}' and not was_recorded)`;

export interface BuildOptions {
  steps?: Step[];
  reserved?: ReservedSlot[];
  read?: (step: { version: string; name: string }) => string;
}

export function buildScript(options: BuildOptions = {}): string {
  const steps = options.steps ?? STEPS;
  const reserved = options.reserved ?? RESERVED_SLOTS;
  const read = options.read ?? readMigration;

  const versions = steps.map((s) => s.version);
  for (let i = 1; i < versions.length; i++) {
    if (versions[i - 1]! >= versions[i]!)
      throw new Error("STEPS must be in ascending version order");
  }
  const placeholders = steps.flatMap((s) =>
    Object.entries(s.pins).filter(([, pin]) => !isRealMd5(pin)),
  );

  const header = `-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- ONE script that installs SofaScore Fantasy scoring on production.
-- GENERATED by scripts/backend/build-apply-sofascore-automatic.ts -- do not edit
-- by hand; change the generator or a migration file and rebuild.
-- Runbook: docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md
--
-- It brings production from "live scores read from SofaScore" (migrations
-- 20261011090000 and 20261011100000 recorded) to fully installed, applying in
-- order and SKIPPING any migration already recorded in
-- supabase_migrations.schema_migrations; a skipped one is VERIFIED instead
-- (its functions, grants and md5 pins), never applied twice:
${steps.map((s) => `--   ${s.version}_${s.name}\n--     ${s.summary}`).join("\n")}
--
-- HOW TO RUN
--   Check nothing else is writing (AGENTS.md; the runbook says how). Then run
--   the WHOLE file. As shipped it is a REHEARSAL (rolled back; "Rehearsal
--   passed"). Change \`rollback;\` near the bottom to \`commit;\` and run again
--   ("Installed and verified"). A failed check stops it with nothing saved; do
--   not edit a check to make it pass.
--
-- WHAT IT DOES
--   * works out once, at the start, which of the migrations are already
--     recorded; every later decision uses that, so nothing is applied twice;
--   * refuses (a \`stop:\` message, nothing saved) while a pg_cron job is
--     mid-run, where an object a migration depends on is missing, where an
--     object it creates already exists although it is not recorded, where the
--     function it replaces is not the reviewed version (md5), and, only when
--     20261003180000 has to be applied (it replaces the Fantasy observation
--     recorder), while the Fantasy lifecycle tick is on;
--   * records each missing migration file whole in
--     supabase_migrations.schema_migrations and runs it from that record once
--     its sha256 matches the repository file;
--   * checks the result for every migration, applied now or before: the
--     functions are security definer with an empty search_path, only the
--     intended role may call each one (service role, or signed-in staff for the
--     two review-list functions), every new table forces row level security and
--     is readable by no API role, and each definition is the reviewed one (md5).
--   It writes no fixture, Fantasy, news or user row and pauses nothing: it only
--   creates or replaces functions, creates three empty private tables and one
--   check. The pg_cron jobs
--   AGENTS.md lists therefore stay as they are (the live-switch and
--   match-details releases did the same).
${
  reserved.length > 0
    ? `--
-- NOT FINAL: ${reserved.map((r) => `${r.version} (${r.owner})`).join(", ")} still to be added.
--   Until they are, this script REFUSES TO RUN (first check below).`
    : ""
}${
    placeholders.length > 0
      ? `
--
-- NOT FINAL: md5 pins to fill from the green database-quality run: ${placeholders
          .map(([key]) => key)
          .join(", ")}.
--   Until they are, this script REFUSES TO RUN (first check below).`
      : ""
  }
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- What is recorded right now, fixed once. Every later block asks this table, so
-- a migration this run records is not mistaken for one that was already there.
create temporary table sofascore_plan on commit drop as
select v.version,
       exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version) as was_recorded
  from (values ${versions.map((v) => `('${v}')`).join(", ")}) as v(version);
`;

  const hold = `
-- Replacing the observation recorder: wait for no scoring observation being written.
do $hold$
begin
  if ${planPending("20261003180000")} then
    lock table app_private.fantasy_fixture_observations in access exclusive mode;
  end if;
exception when lock_not_available then
  raise exception 'stop: a scoring observation is being written right now -- nothing was saved; run this again when that has finished';
end
$hold$;
`;

  const unfinished = [
    ...reserved.map(
      (r) =>
        `  raise exception 'stop: this script is not final -- migration ${r.version} (${r.name}, ${r.owner}) has not been added to it yet; nothing was saved';`,
    ),
    ...placeholders.map(
      ([key]) =>
        `  raise exception 'stop: this script is not final -- the md5 pin ${key} has not been filled from CI yet; nothing was saved';`,
    ),
  ].join("\n");

  const preflight = `
do $preflight$
begin
${unfinished ? `${unfinished}\n` : ""}  -- Any run not finished blocks: a recent one, and an older one whose
  -- backend is still alive (a record left behind by a crash does not).
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and (run.start_time > statement_timestamp() - interval '15 minutes'
        or exists (select 1 from pg_stat_activity activity where activity.pid = run.job_pid))) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
${steps
  .map(
    (s) => `
  -- ${s.version}_${s.name}
  if ${planPending(s.version)} then${s.pending}
  end if;`,
  )
  .join("\n")}
end
$preflight$;
`;

  const apply = steps
    .map((s) => {
      const migration = read(s);
      const tag = tagFor(s.version);
      if (migration.includes(tag)) throw new Error(`${s.version} contains its own quote tag`);
      return `
-- ${s.version}_${s.name}: recorded and run only if it was not recorded at the start.
insert into supabase_migrations.schema_migrations (version, name, statements)
select
  '${s.version}',
  '${s.name}',
  array[${tag}${migration}${tag}]
where ${planPending(s.version)};

do $apply_${s.version}$
declare
  part_${s.version} text;
begin
  if not ${planPending(s.version)} then
    return;
  end if;
  part_${s.version} := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${s.version}'
  );
  if encode(sha256(convert_to(part_${s.version}, 'UTF8')), 'hex')
    is distinct from '${sha256(migration)}' then
    raise exception 'stop: ${s.version} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_${s.version};
end
$apply_${s.version}$;
`;
    })
    .join("");

  const postflight = `
do $postflight$
declare
  problems text[] := '{}';
begin
${steps.map((s) => `  -- ${s.version}_${s.name}${s.verify}`).join("\n\n")}
  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;
`;

  const tail = `
-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when ${recordedGuard(versions)} = ${versions.length}
    then 'Installed and verified. Deploy the Edge Function next (runbook, step 3).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result,
(select coalesce(string_agg(version, ', ' order by version), 'none')
   from supabase_migrations.schema_migrations
  where version in (${versions.map((v) => `'${v}'`).join(", ")})) as recorded_now;
`;

  return header + hold + preflight + apply + postflight + tail;
}

if (import.meta.main) {
  const text = buildScript();
  const file = join(root, SCRIPT_PATH);
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(file, "utf8");
    } catch {
      /* missing counts as drift */
    }
    if (current !== text) {
      console.error(
        `${SCRIPT_PATH} is out of date: run bun scripts/backend/build-apply-sofascore-automatic.ts`,
      );
      process.exit(1);
    }
    console.log(`${SCRIPT_PATH} is up to date.`);
  } else {
    writeFileSync(file, text);
    console.log(`Wrote ${SCRIPT_PATH} (${text.length} bytes, sha256 ${sha256(text)}).`);
  }
}
