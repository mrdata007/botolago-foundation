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
import {
  HISTORY_VERSIONS,
  GAMEWEEK_SUMMARY,
  gameweekFix,
  gameweekFixApplySql,
  gameweekFixPreflightSql,
  historyInsertSql,
  historyModel,
  historyVerifySql,
} from "./sofascore-install-catchup";

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
  sofascoreFantasyObservation: "e97f34f2bf5acfc7447b3e9dd35386ac",

  // 20261011130000, the two functions it REPLACES. "Before" is what production
  // holds now (measured by the CI step "SofaScore automatic pre-state md5" on a
  // database reset to version 20261011120000); "after" is the reviewed new
  // definition (CI step "SofaScore automatic post-state md5", full reset).
  supportingStateBefore: "0ef7dfd0a98b3dda7015ea6fc47342c1",
  supportingStateAfter: "b4ff52c3a45e260cdf75f2eb51487189",
  supportingDependencyBefore: "f86e4e6cc17c59f444016b0ddacba9ff",
  supportingDependencyAfter: "5b14152b9e20dcf4923e175038d65115",
  // 20261011130000, the four functions it CREATES (post-state step only).
  matchEnqueue: "f51a0243311a532ad1656daed3bc7402",
  autoMapPlayers: "04d85b5c744e2dbbe1bea10d0e521cf6",
  adminMatchQueue: "85062ca7513d4c9795efc6759ee10237",
  adminResolveMatch: "967114b9fd92243ffcd05ce5606ac34d",

  // 20261011140000, the three functions it CREATES (post-state step only).
  fantasyContext: "bfbdcc58895a89fc2c5b8d069bbee728",
  fantasyNote: "0b5cc256492be22047036de44136abc5",
  fantasyDue: "15f47827acd7f8e6af81c0ac0c9557e1",

  // 20261011150000: the ops health body it PATCHES (pre-state step: before;
  // post-state step: after) and the helper it CREATES.
  opsHealthBefore: "1f584b167e83da8858a1377ee416a5b8",
  opsHealthAfter: "ff9d7ab8c83f656b0279447dcc9c14f0",
  fantasyFixtureHealthReady: "b47ed5fb6d6612206771f806b87f91ad",

  // 20261011180000: the two Fantasy scoring-document functions it PATCHES in
  // place (pre-state step: before; post-state step: after) and the two it
  // CREATES (post-state step only). FILL THESE from the green database-quality
  // run: the CI steps "SofaScore automatic pre-state md5" and "post-state md5".
  scoringDocumentBaseBefore: "8c701cdf882a2076a0eacbefce9b29f7",
  scoringDocumentBaseAfter: "aa25ecdb2ff9f8b1ec814558a19059ee",
  legacyFixtureCheckBefore: "fdb4c8acc52127ffaa4c77dc71828b02",
  legacyFixtureCheckAfter: "587ac0304fed1a557104faedbe634b2f",
  performancesSync: "901f058115adab2e5927f292b3ba1a38",
  performancesSyncFixture: "62892213172afd4630280f04775fcec1",

  // Catch-up migrations (never applied in production: the owner's read-only
  // checks of 2026-10-11). Two kinds of pin below:
  //   *Prosrc  md5(pg_proc.prosrc), the md5 of the function BODY TEXT alone. The
  //            owner measured the "before" ones on production; the "after" ones
  //            are the md5 of the body text in the migration file (the test
  //            recomputes every one of them from the repository).
  //   others   md5(pg_get_functiondef(...)), the whole definition: "before" from
  //            the earlier owner script, "after" printed by the CI step
  //            "SofaScore automatic post-state md5" (FILL THEM).
  //
  // 20260925090500: api.service_fantasy_scoring_league_page(uuid,uuid,integer).
  // Production holds the 20260914200719 version.
  leaguePageBeforeProsrc: "dba725a5659bb5ba9338a00071752b8b",
  leaguePageBeforeDefinition: "021d0a3422cf68d4c213b028974888d2",
  leaguePageAfterProsrc: "86ab0440c3d9d5bea18c438c273e55c6",
  leaguePageAfter: "7f79f52c973b0cf888ee8c6c2b927573",
  // 20261001170000: api.attach_football_team_crest (replaced; production holds
  // the 20260801010200 version) and api.service_set_curated_team_crest (new).
  attachTeamCrestBeforeProsrc: "3d66fd9f11c51899af702952f7b5b46f",
  attachTeamCrestAfterProsrc: "81dc921ebef73b589b09bf3686a4776d",
  attachTeamCrestAfter: "0603b277dc75deada03fb35d849e5c74",
  setCuratedTeamCrestProsrc: "ed3bd7ee85ea78269b50e3ca8c722d0a",
  setCuratedTeamCrest: "50a1e47eda0f6cf04ce5ad373247b5ba",
  // 20261010140000: api.repoint_football_fixture_mapping (new).
  repointFixtureMappingProsrc: "2984ba9c1340feb79b57147c60dc77e6",
  repointFixtureMapping: "912b8719c46b698147f1f51533fa9b25",
  // 20261011170000: api.news_article_detail(text,text) (replaced). "Before" is the
  // 20260924200600 body, the last one any recorded migration set.
  newsArticleDetailBeforeProsrc: "ffafc51e4ce1d02c4225fdf1d8c69861",
  newsArticleDetailAfterProsrc: "b35f060615b912abc90318deb9e8de03",
  newsArticleDetailAfter: "73fdc5b28f6aa2f5ec53e772dcf9a404",
  // api.fantasy_gameweek_summary(uuid): the reviewed body of 20260921200000
  // (md5 of the body text, recomputed by the test). Production's older body is
  // GAMEWEEK_SUMMARY.productionProsrcMd5.
  gameweekSummaryProsrc: "96f6cbe0f8fa40c0ff3d440ce1ef2f09",

  // 20261011160000: the four public ranking readers it REPLACES (pre-state step
  // "SofaScore automatic pre-state md5": before; post-state step: after) and the
  // four functions it CREATES (post-state step only). Production is expected to
  // hold the 20260926003100 definitions; if it holds anything else the script
  // stops before changing anything. FILL THESE from the green database-quality
  // run: each CI line has a `pin` column naming the placeholder it fills.
  fantasyLeaguesBefore: "FILL_FROM_CI_FANTASY_LEAGUES_BEFORE_MD5",
  fantasyLeaguesAfter: "FILL_FROM_CI_FANTASY_LEAGUES_AFTER_MD5",
  fantasyLeagueStandingsBefore: "FILL_FROM_CI_FANTASY_LEAGUE_STANDINGS_BEFORE_MD5",
  fantasyLeagueStandingsAfter: "FILL_FROM_CI_FANTASY_LEAGUE_STANDINGS_AFTER_MD5",
  fantasyOverallStandingsBefore: "FILL_FROM_CI_FANTASY_OVERALL_STANDINGS_BEFORE_MD5",
  fantasyOverallStandingsAfter: "FILL_FROM_CI_FANTASY_OVERALL_STANDINGS_AFTER_MD5",
  predictionsLeaderboardBefore: "FILL_FROM_CI_PREDICTIONS_LEADERBOARD_BEFORE_MD5",
  predictionsLeaderboardAfter: "FILL_FROM_CI_PREDICTIONS_LEADERBOARD_AFTER_MD5",
  fantasyHiddenAhead: "FILL_FROM_CI_FANTASY_HIDDEN_AHEAD_MD5",
  predictionHiddenAhead: "FILL_FROM_CI_PREDICTION_HIDDEN_AHEAD_MD5",
  adminListPublicRankingExclusions: "FILL_FROM_CI_ADMIN_LIST_PUBLIC_RANKING_EXCLUSIONS_MD5",
  adminSetPublicRankingExclusion: "FILL_FROM_CI_ADMIN_SET_PUBLIC_RANKING_EXCLUSION_MD5",
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
type Callable = "service" | "admin" | "nobody" | "not_api" | "any" | "readers";

interface FnCheck {
  /** Signature as to_regprocedure() reads it. */
  sig: string;
  /** Who may execute it: service_role only, authenticated only, no API role at all, or just not the three public-facing ones. */
  callable: Callable;
  /** Key in PINS for the reviewed definition (md5 of pg_get_functiondef). */
  pin?: keyof typeof PINS;
  /** Key in PINS for the reviewed body text (md5 of pg_proc.prosrc). */
  prosrc?: keyof typeof PINS;
  /** A security INVOKER helper (still with an empty search_path). Default: security definer. */
  invoker?: boolean;
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
  // Not judged here: the step compares the grants with what they were before it ran.
  any: `false`,
  // Every API role but PUBLIC: the anonymous reading API, signed-in readers and the service role.
  readers: `has_function_privilege('public', fn, 'execute')
          or not has_function_privilege('anon', fn, 'execute')
          or not has_function_privilege('authenticated', fn, 'execute')
          or not has_function_privilege('service_role', fn, 'execute')`,
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
            where p.oid = fn and ${f.invoker ? "not p.prosecdef" : "p.prosecdef"} and coalesce(p.proconfig, '{}') && array['search_path=""']) then
          problems := problems || ('${version}: not ${f.invoker ? "security invoker" : "security definer"} with an empty search_path: ' || fn::text);
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
        }${
          f.prosrc
            ? `
        if (select md5(p.prosrc) from pg_proc p where p.oid = fn) <> '${PINS[f.prosrc]}' then
          problems := problems || ('${version}: not the reviewed body text (md5 of prosrc): ' || fn::text);
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

/**
 * plpgsql (preflight, pending only): the function being replaced has the body
 * production was measured to hold. This is md5(pg_proc.prosrc), the md5 of the
 * body text alone (what the owner's read-only check on production printed), not
 * of the whole definition.
 */
const mustMatchProsrc = (version: string, sig: string, pin: string) => `
    if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('${sig}')) is distinct from '${pin}' then
      raise exception 'stop: ${sig} does not have the body text ${version} replaces (md5 of pg_proc.prosrc, the body alone, not the whole definition)';
    end if;`;

/** The 20261011120000 function is installed, or is applied earlier in this same run. */
const needsFantasyObservationFunction = (version: string) => `
    if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null
      and not exists (select 1 from pg_temp.sofascore_plan where version = '20261011120000' and not was_recorded) then
      raise exception 'stop: migration 20261011120000 is neither recorded nor part of this run, but ${version} builds on api.service_record_sofascore_fantasy_observation';
    end if;`;

const LEAGUE_PAGE_SIG = "api.service_fantasy_scoring_league_page(uuid,uuid,integer)";
const ATTACH_CREST_SIG = "api.attach_football_team_crest(text,text,text,text,text,timestamptz)";
const SET_CURATED_CREST_SIG = "api.service_set_curated_team_crest(text,text,text,text)";
const REPOINT_SIG = "api.repoint_football_fixture_mapping(text,uuid,text,text,text)";
const NEWS_DETAIL_SIG = "api.news_article_detail(text,text)";
// 20261011160000: the four readers it replaces, the four functions it creates.
const FANTASY_LEAGUES_SIG = "api.fantasy_leagues(uuid,text,integer)";
const FANTASY_LEAGUE_STANDINGS_SIG = "api.fantasy_league_standings(uuid,uuid,bigint,uuid,integer)";
const FANTASY_OVERALL_STANDINGS_SIG =
  "api.fantasy_overall_standings(uuid,uuid,bigint,uuid,integer)";
const PREDICTIONS_LEADERBOARD_SIG =
  "api.predictions_leaderboard(text,integer,integer,uuid,integer)";
const FANTASY_HIDDEN_AHEAD_SIG = "app_private.fantasy_hidden_ahead(uuid,uuid,uuid,bigint,boolean)";
const PREDICTION_HIDDEN_AHEAD_SIG = "app_private.prediction_hidden_ahead(uuid,uuid,integer)";
const ADMIN_LIST_EXCLUSIONS_SIG = "api.admin_list_public_ranking_exclusions()";
const ADMIN_SET_EXCLUSION_SIG =
  "api.admin_set_public_ranking_exclusion(uuid,text,boolean,text,uuid)";
const RANKING_READER_SIGS = [
  FANTASY_LEAGUES_SIG,
  FANTASY_LEAGUE_STANDINGS_SIG,
  FANTASY_OVERALL_STANDINGS_SIG,
  PREDICTIONS_LEADERBOARD_SIG,
];

export const STEPS: Step[] = [
  {
    version: "20260925090500",
    name: "fantasy_league_page_skip_empty",
    summary:
      "Fantasy scoring worker skips leagues without a Fantasy member: replaces api.service_fantasy_scoring_league_page (same signature, shape and grants; production still holds the 20260914200719 version); changes no data",
    pending: `${mustExist("20260925090500", {
      tables: [
        "app.fantasy_gameweeks",
        "app.fantasy_leagues",
        "app.fantasy_league_memberships",
        "app_private.fantasy_automation_settings",
      ],
      functions: [LEAGUE_PAGE_SIG, "app_private.is_service_request()"],
    })}
    if ${recordedGuard(["20260925090400"])} <> 1 then
      raise exception 'stop: Pronostics parts 1 to 5 (migration 20260925090400) are not recorded -- production is not the state 20260925090500 was written for';
    end if;
    -- The rule this migration was written under: not before Fantasy gameweek 1 is locked and scored.
    if not exists (select 1 from app.fantasy_gameweeks
        where sequence_number = 1 and finalized_at is not null and points_state = 'final') then
      raise exception 'stop: Fantasy gameweek 1 has not been scored yet -- 20260925090500 waits until it is finalized';
    end if;
    -- AGENTS.md: a write that touches Fantasy runs with the Fantasy lifecycle tick paused.
    if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
      raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); (switch it back on afterwards)';
    end if;
    -- It replaces exactly the 20260914200719 version production holds. Two pins:
    -- the body text (md5 of pg_proc.prosrc, measured on production 2026-10-11) and
    -- the whole definition (measured on production 2026-09-24).${mustMatchProsrc(
      "20260925090500",
      LEAGUE_PAGE_SIG,
      PINS.leaguePageBeforeProsrc,
    )}${mustMatchMd5("20260925090500", LEAGUE_PAGE_SIG, PINS.leaguePageBeforeDefinition)}`,
    verify: verifyFunctions("20260925090500", [
      {
        sig: LEAGUE_PAGE_SIG,
        callable: "service",
        pin: "leaguePageAfter",
        prosrc: "leaguePageAfterProsrc",
      },
    ]),
    pins: {
      leaguePageBeforeProsrc: PINS.leaguePageBeforeProsrc,
      leaguePageBeforeDefinition: PINS.leaguePageBeforeDefinition,
      leaguePageAfterProsrc: PINS.leaguePageAfterProsrc,
      leaguePageAfter: PINS.leaguePageAfter,
    },
  },
  {
    version: "20261001170000",
    name: "curated_team_crests",
    summary:
      "club crests supplied by BotolaGO: adds api.service_set_curated_team_crest and replaces api.attach_football_team_crest so the provider sync never repoints a team away from a supplied crest (production still holds the 20260801010200 version); changes no data",
    pending: `${mustNotExist("20261001170000", { functions: [SET_CURATED_CREST_SIG] })}${mustExist(
      "20261001170000",
      {
        tables: ["app_private.football_provider_mappings", "app.teams", "app.media_assets"],
        functions: [ATTACH_CREST_SIG],
      },
    )}
    -- It replaces exactly the 20260801010200 version production holds (md5 of pg_proc.prosrc, the body text, measured on production 2026-10-11).${mustMatchProsrc(
      "20261001170000",
      ATTACH_CREST_SIG,
      PINS.attachTeamCrestBeforeProsrc,
    )}`,
    verify: verifyFunctions("20261001170000", [
      {
        sig: SET_CURATED_CREST_SIG,
        callable: "service",
        pin: "setCuratedTeamCrest",
        prosrc: "setCuratedTeamCrestProsrc",
      },
      {
        sig: ATTACH_CREST_SIG,
        callable: "service",
        pin: "attachTeamCrestAfter",
        prosrc: "attachTeamCrestAfterProsrc",
      },
    ]),
    pins: {
      attachTeamCrestBeforeProsrc: PINS.attachTeamCrestBeforeProsrc,
      attachTeamCrestAfterProsrc: PINS.attachTeamCrestAfterProsrc,
      attachTeamCrestAfter: PINS.attachTeamCrestAfter,
      setCuratedTeamCrestProsrc: PINS.setCuratedTeamCrestProsrc,
      setCuratedTeamCrest: PINS.setCuratedTeamCrest,
    },
  },
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
    version: "20261010140000",
    name: "sofascore_repoint_fixture_mapping",
    summary:
      "a replayed SofaScore match follows its new event id: adds the service-only api.repoint_football_fixture_mapping, which moves one SofaScore fixture mapping in place and audits it (creates no table, changes no existing row)",
    pending: `${mustNotExist("20261010140000", { functions: [REPOINT_SIG] })}${mustExist(
      "20261010140000",
      {
        tables: ["app_private.football_provider_mappings"],
        functions: [
          "app_private.is_service_request()",
          "app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)",
        ],
      },
    )}
    if (select count(*) from pg_attribute a
         where a.attrelid = 'app_private.football_provider_mappings'::regclass and a.attnum > 0 and not a.attisdropped
           and a.attname in ('id', 'active', 'provider_name', 'entity_type', 'external_id',
                             'internal_entity_id', 'last_seen_at', 'source_version')) <> 8 then
      raise exception 'stop: app_private.football_provider_mappings lacks a column migration 20261010140000 uses -- production is not the state it was written for';
    end if;`,
    verify: verifyFunctions("20261010140000", [
      {
        sig: REPOINT_SIG,
        callable: "service",
        pin: "repointFixtureMapping",
        prosrc: "repointFixtureMappingProsrc",
      },
    ]),
    pins: {
      repointFixtureMappingProsrc: PINS.repointFixtureMappingProsrc,
      repointFixtureMapping: PINS.repointFixtureMapping,
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
  {
    version: "20261011160000",
    name: "public_ranking_exclusions",
    summary:
      "test accounts can be hidden from the public rankings: one private list (empty), two staff functions to hide or show an account, the permission rankings.manage (granted to platform_admin), and the four public ranking readers replaced so they skip hidden accounts (same signatures and grants; production still holds the 20260926003100 text); nothing is hidden until the owner does the step of docs/backend/PUBLIC_RANKING_EXCLUSIONS.md, and no existing ranking row changes",
    pending: `${mustNotExist("20261011160000", {
      tables: ["app_private.public_ranking_exclusions"],
      functions: [
        FANTASY_HIDDEN_AHEAD_SIG,
        PREDICTION_HIDDEN_AHEAD_SIG,
        ADMIN_LIST_EXCLUSIONS_SIG,
        ADMIN_SET_EXCLUSION_SIG,
      ],
    })}
    if exists (select 1 from app_private.admin_permissions where name = 'rankings.manage') then
      raise exception 'stop: 20261011160000 is not recorded but the permission rankings.manage it creates already exists -- production is not the state it was written for';
    end if;${mustExist("20261011160000", {
      tables: [
        "app.profiles",
        "app.fantasy_teams",
        "app.fantasy_rankings",
        "app.fantasy_leagues",
        "app.fantasy_league_memberships",
        "app.fantasy_seasons",
        "app.fantasy_gameweeks",
        "app.prediction_standings",
        "app.rounds",
        "app.fixtures",
        "app_private.prediction_settings",
        "app_private.prediction_fixture_scoring",
        "app_private.user_bans",
        "app_private.staff_principals",
        "app_private.admin_permissions",
        "app_private.admin_roles",
        "app_private.admin_role_permissions",
      ],
      functions: [
        "app_private.admin_assert_permission(text,boolean)",
        "app_private.admin_begin_idempotent_operation(uuid,text,uuid,jsonb)",
        "app_private.admin_complete_idempotent_operation(uuid,text,uuid,jsonb)",
        "app_private.write_admin_audit(uuid,text,text,uuid,text,uuid,uuid,uuid,jsonb,jsonb,app_private.admin_audit_outcome,text,boolean)",
        "app_private.assert_mfa_step_up()",
        "app_private.fantasy_mask_username(text)",
        "app_private.predictions_access_allowed(uuid)",
        "app_private.predictions_current_season()",
        "app_private.predictions_resolve_round(uuid,integer,timestamptz)",
        "app_private.prediction_round_state(uuid,timestamptz)",
        ...RANKING_READER_SIGS,
      ],
    })}
    -- The permission is granted to this role; without it nobody could use the staff functions.
    if not exists (select 1 from app_private.admin_roles where name = 'platform_admin') then
      raise exception 'stop: an object migration 20261011160000 depends on is missing (the platform_admin role) -- production is not the state it was written for';
    end if;
    -- It replaces exactly the definitions migration 20260926003100 left.${mustMatchMd5(
      "20261011160000",
      FANTASY_LEAGUES_SIG,
      PINS.fantasyLeaguesBefore,
    )}${mustMatchMd5("20261011160000", FANTASY_LEAGUE_STANDINGS_SIG, PINS.fantasyLeagueStandingsBefore)}${mustMatchMd5(
      "20261011160000",
      FANTASY_OVERALL_STANDINGS_SIG,
      PINS.fantasyOverallStandingsBefore,
    )}${mustMatchMd5("20261011160000", PREDICTIONS_LEADERBOARD_SIG, PINS.predictionsLeaderboardBefore)}
    -- create or replace keeps the grants; remember them to prove it afterwards.
    create temporary table sofascore_ranking_reader_grants on commit drop as
    select f.sig,
           has_function_privilege('public', to_regprocedure(f.sig), 'execute') as public_can,
           has_function_privilege('anon', to_regprocedure(f.sig), 'execute') as anon_can,
           has_function_privilege('authenticated', to_regprocedure(f.sig), 'execute') as authenticated_can,
           has_function_privilege('service_role', to_regprocedure(f.sig), 'execute') as service_can
      from (values ${RANKING_READER_SIGS.map((sig) => `('${sig}')`).join(", ")}) as f(sig);`,
    verify: `${verifyPrivateTables("20261011160000", ["app_private.public_ranking_exclusions"])}
${verifyFunctions("20261011160000", [
  {
    sig: FANTASY_HIDDEN_AHEAD_SIG,
    callable: "nobody",
    pin: "fantasyHiddenAhead",
    invoker: true,
  },
  {
    sig: PREDICTION_HIDDEN_AHEAD_SIG,
    callable: "nobody",
    pin: "predictionHiddenAhead",
    invoker: true,
  },
  {
    sig: ADMIN_LIST_EXCLUSIONS_SIG,
    callable: "admin",
    pin: "adminListPublicRankingExclusions",
  },
  {
    sig: ADMIN_SET_EXCLUSION_SIG,
    callable: "admin",
    pin: "adminSetPublicRankingExclusion",
  },
  { sig: FANTASY_LEAGUES_SIG, callable: "any", pin: "fantasyLeaguesAfter" },
  { sig: FANTASY_LEAGUE_STANDINGS_SIG, callable: "any", pin: "fantasyLeagueStandingsAfter" },
  { sig: FANTASY_OVERALL_STANDINGS_SIG, callable: "any", pin: "fantasyOverallStandingsAfter" },
  { sig: PREDICTIONS_LEADERBOARD_SIG, callable: "any", pin: "predictionsLeaderboardAfter" },
])}
    declare
      reader_sig text;
    begin
      -- The remembered grants exist only when this run applied the migration.
      if to_regclass('pg_temp.sofascore_ranking_reader_grants') is not null then
        foreach reader_sig in array array[${RANKING_READER_SIGS.map((s) => `'${s}'`).join(", ")}] loop
          if to_regprocedure(reader_sig) is not null and exists (select 1 from pg_temp.sofascore_ranking_reader_grants g
            where g.sig = reader_sig
              and (g.public_can is distinct from has_function_privilege('public', to_regprocedure(reader_sig), 'execute')
                or g.anon_can is distinct from has_function_privilege('anon', to_regprocedure(reader_sig), 'execute')
                or g.authenticated_can is distinct from has_function_privilege('authenticated', to_regprocedure(reader_sig), 'execute')
                or g.service_can is distinct from has_function_privilege('service_role', to_regprocedure(reader_sig), 'execute'))) then
            problems := problems || ('20261011160000: the grants of a ranking reader changed: ' || reader_sig);
          end if;
        end loop;
      end if;
    end;
    declare
      ranking_permission uuid;
    begin
      -- The permission row and its grant to platform_admin (the only data this migration writes).
      select p.id into ranking_permission from app_private.admin_permissions p
       where p.name = 'rankings.manage' and p.domain = 'rankings' and p.active and p.requires_mfa and p.requires_recent_auth;
      if ranking_permission is null then
        problems := problems || '20261011160000: the permission rankings.manage is missing or not active, with a second factor and a recent sign-in required'::text;
      elsif not exists (select 1 from app_private.admin_role_permissions rp
          join app_private.admin_roles r on r.id = rp.role_id
         where rp.permission_id = ranking_permission and r.name = 'platform_admin') then
        problems := problems || '20261011160000: the permission rankings.manage is not granted to platform_admin'::text;
      end if;
      -- The list: its reason check and its two links (account, staff principal).
      if to_regclass('app_private.public_ranking_exclusions') is not null then
        if not exists (select 1 from pg_constraint
            where conrelid = 'app_private.public_ranking_exclusions'::regclass
              and conname = 'public_ranking_exclusions_reason_check') then
          problems := problems || '20261011160000: the exclusion list lacks its reason check'::text;
        end if;
        if (select count(*) from pg_constraint
             where conrelid = 'app_private.public_ranking_exclusions'::regclass and contype = 'f') <> 2 then
          problems := problems || '20261011160000: the exclusion list does not have its two foreign keys (profile, staff principal)'::text;
        end if;
      end if;
    end;`,
    pins: {
      fantasyLeaguesBefore: PINS.fantasyLeaguesBefore,
      fantasyLeaguesAfter: PINS.fantasyLeaguesAfter,
      fantasyLeagueStandingsBefore: PINS.fantasyLeagueStandingsBefore,
      fantasyLeagueStandingsAfter: PINS.fantasyLeagueStandingsAfter,
      fantasyOverallStandingsBefore: PINS.fantasyOverallStandingsBefore,
      fantasyOverallStandingsAfter: PINS.fantasyOverallStandingsAfter,
      predictionsLeaderboardBefore: PINS.predictionsLeaderboardBefore,
      predictionsLeaderboardAfter: PINS.predictionsLeaderboardAfter,
      fantasyHiddenAhead: PINS.fantasyHiddenAhead,
      predictionHiddenAhead: PINS.predictionHiddenAhead,
      adminListPublicRankingExclusions: PINS.adminListPublicRankingExclusions,
      adminSetPublicRankingExclusion: PINS.adminSetPublicRankingExclusion,
    },
  },
  {
    version: "20261011170000",
    name: "news_article_detail_other_language_id",
    summary:
      "an article opened by an edition id from the other language resolves to the reader's own language edition instead of answering 404: replaces api.news_article_detail (same signature; grants preserved by create or replace); changes no data",
    pending: `${mustExist("20261011170000", {
      tables: [
        "app.article_editions",
        "app.story_taxonomies",
        "app.taxonomies",
        "app.taxonomy_translations",
        "app.story_competitions",
        "app.competitions",
        "app.story_teams",
        "app.teams",
        "app.story_players",
        "app.players",
      ],
      functions: [
        NEWS_DETAIL_SIG,
        "app_private.news_language(text)",
        "app_private.news_is_public(app.article_editions)",
        "app_private.news_article_card(app.article_editions,app.placement_type)",
        "app_private.news_content_updated_at(app.article_editions)",
      ],
    })}
    -- It replaces exactly the 20260924200600 body (md5 of pg_proc.prosrc, the body text; the body is also checked
    -- by the migration-history check when 20260922180200 is missing from the history).${mustMatchProsrc(
      "20261011170000",
      NEWS_DETAIL_SIG,
      PINS.newsArticleDetailBeforeProsrc,
    )}
    -- create or replace keeps the grants; remember them to prove it afterwards.
    create temporary table sofascore_news_detail_grants on commit drop as
    select has_function_privilege('public', fn, 'execute') as public_can,
           has_function_privilege('anon', fn, 'execute') as anon_can,
           has_function_privilege('authenticated', fn, 'execute') as authenticated_can,
           has_function_privilege('service_role', fn, 'execute') as service_can
      from (select to_regprocedure('${NEWS_DETAIL_SIG}') as fn) f;`,
    verify: `${verifyFunctions("20261011170000", [
      {
        sig: NEWS_DETAIL_SIG,
        callable: "any",
        pin: "newsArticleDetailAfter",
        prosrc: "newsArticleDetailAfterProsrc",
      },
    ])}
    declare
      fn regprocedure := to_regprocedure('${NEWS_DETAIL_SIG}');
    begin
      -- The remembered grants exist only when this run applied the migration.
      if fn is not null and to_regclass('pg_temp.sofascore_news_detail_grants') is not null then
        if exists (select 1 from pg_temp.sofascore_news_detail_grants g
          where g.public_can is distinct from has_function_privilege('public', fn, 'execute')
             or g.anon_can is distinct from has_function_privilege('anon', fn, 'execute')
             or g.authenticated_can is distinct from has_function_privilege('authenticated', fn, 'execute')
             or g.service_can is distinct from has_function_privilege('service_role', fn, 'execute')) then
          problems := problems || '20261011170000: the grants of api.news_article_detail changed'::text;
        end if;
      end if;
    end;`,
    pins: {
      newsArticleDetailBeforeProsrc: PINS.newsArticleDetailBeforeProsrc,
      newsArticleDetailAfterProsrc: PINS.newsArticleDetailAfterProsrc,
      newsArticleDetailAfter: PINS.newsArticleDetailAfter,
    },
  },
  {
    version: "20261011180000",
    name: "sofascore_player_performances",
    summary:
      "Pépites feed: api.service_sync_sofascore_player_performances() derives app.player_fixture_performances rows from the SofaScore Fantasy observation already recorded (no new request; unknown assists, penalties and saves are NULL, never zero); assists and penalties_missed may now be NULL; patches the two Fantasy scoring-document functions in place so a SofaScore row never moves a scoring input digest; changes no existing row",
    pending: `${mustNotExist("20261011180000", {
      functions: [
        "api.service_sync_sofascore_player_performances(uuid,integer,jsonb)",
        "app_private.sofascore_sync_fixture_performances(uuid,jsonb)",
      ],
    })}${mustExist("20261011180000", {
      tables: [
        "app.player_fixture_performances",
        "app.players",
        "app.fixtures",
        "app_private.fantasy_fixture_observations",
        "app_private.football_provider_fixture_links",
        "app_private.football_provider_mappings",
      ],
      functions: [
        "app_private.is_service_request()",
        "app_private.football_mapping_supporting_state(uuid)",
        "app_private.fantasy_scoring_input_document_v1(uuid)",
        "app_private.fantasy_validate_scoring_document_v1(jsonb)",
      ],
    })}${needsFantasyObservationFunction("20261011180000")}
    -- The Fantasy scoring input digests are unchanged only while no SofaScore row exists.
    if exists (select 1 from app.player_fixture_performances where source_provider = 'sofascore') then
      raise exception 'stop: 20261011180000 is not recorded but a SofaScore performance row exists -- production is not the state it was written for';
    end if;
    -- It patches the text of exactly the two definitions the Fantasy migrations left.${mustMatchMd5(
      "20261011180000",
      "app_private.fantasy_scoring_input_document_v1(uuid)",
      PINS.scoringDocumentBaseBefore,
    )}${mustMatchMd5(
      "20261011180000",
      "app_private.fantasy_validate_scoring_document_v1(jsonb)",
      PINS.legacyFixtureCheckBefore,
    )}`,
    verify: `${verifyFunctions("20261011180000", [
      {
        sig: "api.service_sync_sofascore_player_performances(uuid,integer,jsonb)",
        callable: "service",
        pin: "performancesSync",
      },
      {
        sig: "app_private.sofascore_sync_fixture_performances(uuid,jsonb)",
        callable: "nobody",
        pin: "performancesSyncFixture",
      },
      {
        sig: "app_private.fantasy_scoring_input_document_v1(uuid)",
        callable: "nobody",
        pin: "scoringDocumentBaseAfter",
      },
      {
        sig: "app_private.fantasy_validate_scoring_document_v1(jsonb)",
        callable: "nobody",
        pin: "legacyFixtureCheckAfter",
      },
    ])}
    declare
      base text := pg_get_functiondef(to_regprocedure('app_private.fantasy_scoring_input_document_v1(uuid)'));
      legacy text := pg_get_functiondef(to_regprocedure('app_private.fantasy_validate_scoring_document_v1(jsonb)'));
      marker constant text := 'p.source_provider is distinct from ''sofascore''';
    begin
      if base is null or (length(base) - length(replace(base, marker, ''))) / length(marker) <> 3 then
        problems := problems || '20261011180000: the base scoring document does not ignore SofaScore rows in its three places'::text;
      end if;
      if legacy is null or (length(legacy) - length(replace(legacy, marker, ''))) / length(marker) <> 1 then
        problems := problems || '20261011180000: the legacy fixture check does not ignore SofaScore rows'::text;
      end if;
      if (select a.attnotnull from pg_attribute a
           where a.attrelid = 'app.player_fixture_performances'::regclass and a.attname = 'assists')
        or (select a.attnotnull from pg_attribute a
           where a.attrelid = 'app.player_fixture_performances'::regclass and a.attname = 'penalties_missed') then
        problems := problems || '20261011180000: assists or penalties_missed is still NOT NULL'::text;
      end if;
    end;`,
    pins: {
      scoringDocumentBaseBefore: PINS.scoringDocumentBaseBefore,
      scoringDocumentBaseAfter: PINS.scoringDocumentBaseAfter,
      legacyFixtureCheckBefore: PINS.legacyFixtureCheckBefore,
      legacyFixtureCheckAfter: PINS.legacyFixtureCheckAfter,
      performancesSync: PINS.performancesSync,
      performancesSyncFixture: PINS.performancesSyncFixture,
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
  // Catch-up: migrations whose objects are already in production (history rows
  // only, after a check), and the gameweek summary body fix.
  const history = historyModel(root);
  const fix = gameweekFix(root);
  const allVersions = [...versions, ...HISTORY_VERSIONS];
  if (fix.prosrcMd5 !== PINS.gameweekSummaryProsrc) {
    throw new Error(
      "PINS.gameweekSummaryProsrc is not the md5 of the repository body of 20260921200000",
    );
  }

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
-- It also catches the migration history up. On 2026-10-11 the owner's read-only
-- checks found ${history.rows.length + 3} repository versions missing from the history that were
-- not all "never applied":
--   * ${history.rows.length} migrations (${history.rows[0]!.version} to ${history.rows[history.rows.length - 1]!.version}) whose objects
--     ARE in production, applied by another path: only their history row is
--     missing. The script writes the row only after it has checked, at run
--     time, what the migration created (the body of every function by md5 of
--     pg_proc.prosrc against the repository body, tables, enum types and
--     labels, and the rows two of them seed). The files are NOT run again;
--   * api.fantasy_gameweek_summary(uuid), whose production body differs from
--     the reviewed one (md5 of prosrc ${GAMEWEEK_SUMMARY.productionProsrcMd5}), is first brought to the reviewed
--     body of 20260921200000 (create or replace; the script stops if the body
--     is neither that older production body nor the reviewed one);
--   * the three catch-up steps above (20260925090500, 20261001170000,
--     20261010140000) and 20261011170000 are applied as full steps, and so is
--     20261011160000 (test accounts can be hidden from the public rankings).
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
--     function it replaces is not the reviewed version (md5), where an object a
--     migration missing from the history created is absent or different, and,
--     only when 20261003180000 or 20260925090500 has to be applied (each
--     replaces a Fantasy function), while the Fantasy lifecycle tick is on;
--   * records each missing migration file whole in
--     supabase_migrations.schema_migrations and runs it from that record once
--     its sha256 matches the repository file;
--   * checks the result for every migration, applied now or before: the
--     functions are security definer with an empty search_path, only the
--     intended role may call each one (service role, or signed-in staff for the
--     two review-list functions), every new table forces row level security and
--     is readable by no API role, and each definition is the reviewed one (md5).
--   It writes no fixture, Fantasy, news or user row and pauses nothing: it only
--   creates or replaces functions, creates four empty private tables and one
--   check, lets two columns of app.player_fixture_performances (assists,
--   penalties_missed) be NULL, adds one admin permission row (rankings.manage)
--   with its grant to platform_admin (20261011160000; it hides no account), and
--   writes history rows. The pg_cron jobs
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
  from (values ${allVersions.map((v) => `('${v}')`).join(", ")}) as v(version);
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
${gameweekFixPreflightSql(fix)}
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
${historyVerifySql(history)}`;

  const catchUp = `${gameweekFixApplySql(fix)}${historyInsertSql(history)}`;

  const apply =
    catchUp +
    steps
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

  -- ${GAMEWEEK_SUMMARY.version}: api.fantasy_gameweek_summary has the reviewed body${verifyFunctions(
    GAMEWEEK_SUMMARY.version,
    [
      {
        sig: GAMEWEEK_SUMMARY.signature,
        callable: "readers",
        prosrc: "gameweekSummaryProsrc",
      },
    ],
  )}
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
  when ${recordedGuard(allVersions)} = ${allVersions.length}
    then 'Installed and verified. Deploy the Edge Function next (runbook, step 3).'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result,
(select coalesce(string_agg(version, ', ' order by version), 'none')
   from supabase_migrations.schema_migrations
  where version in (${versions.map((v) => `'${v}'`).join(", ")})) as recorded_now,
(select count(*) from supabase_migrations.schema_migrations
  where version in (${HISTORY_VERSIONS.map((v) => `'${v}'`).join(", ")})) as history_rows_recorded_now;
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
