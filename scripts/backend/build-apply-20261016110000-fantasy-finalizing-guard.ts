/**
 * Builds scripts/backend/apply-20261016110000-fantasy-finalizing-guard.sql, the guarded owner script
 * that puts migration 20261016110000 (a finalizing gameweek's scoring inputs cannot change underneath
 * it; audit finding SEC-01) on BotolaGO Production V2.
 *
 *   bun scripts/backend/build-apply-20261016110000-fantasy-finalizing-guard.ts           write the script
 *   bun scripts/backend/build-apply-20261016110000-fantasy-finalizing-guard.ts --check   fail if it differs
 *
 * Every pin is computed here from the repository files (never typed in): the sha256 of the migration, the
 * md5 of the source (pg_proc.prosrc) of the six functions this update relies on and does not change, and
 * the md5 of the three functions it creates. The test recomputes them independently.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const md5 = (text: string) => createHash("md5").update(text, "utf8").digest("hex");

export const VERSION = "20261016110000";
export const NAME = "fantasy_finalizing_scoring_inputs_guard";
export const MIGRATION_PATH = `supabase/migrations/${VERSION}_${NAME}.sql`;
export const SCRIPT_PATH = "scripts/backend/apply-20261016110000-fantasy-finalizing-guard.sql";
export const RUNBOOK = "docs/production/FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md";

/** What pg_proc.prosrc holds for the function whose `create [or replace] function` starts at `header`. */
export function bodyOf(source: string, header: RegExp): string {
  const match = header.exec(source);
  if (!match) throw new Error(`definition not found: ${header}`);
  const start = source.indexOf("$$", match.index + match[0].length) + 2;
  const end = source.indexOf("$$", start);
  if (start < 2 || end < 0) throw new Error(`no body for ${header}`);
  return source.slice(start, end);
}

export interface Pin {
  signature: string;
  label: string;
  file: string;
  header: RegExp;
  /** Why the update relies on it, in the script's words. */
  why: string;
}

/** Existing functions the update relies on and does not change: reviewed, byte for byte. */
export const PINS: Pin[] = [
  {
    signature: "app_private.fantasy_guard_unfinished_price_catalog()",
    label: "the price-processing guard of finalized gameweeks",
    file: "20261009091728_fantasy_durable_progression.sql",
    header: /create function app_private\.fantasy_guard_unfinished_price_catalog\(\)/,
    why: "stays as it is, and answers first where it applies",
  },
  {
    signature: "app_private.fantasy_guard_unfinished_close_price_catalog()",
    label: "the price-processing guard of closed gameweeks",
    file: "20261013160200_staged_stats_progression.sql",
    header: /create function app_private\.fantasy_guard_unfinished_close_price_catalog\(\)/,
    why: "stays as it is, and answers first where it applies",
  },
  {
    signature: "app_private.fantasy_enforce_player_rules()",
    label: "the Fantasy pool rule trigger (price and position)",
    file: "20260720163222_fantasy_ruleset_v1.sql",
    header: /create or replace function app_private\.fantasy_enforce_player_rules\(\)/,
    why: "keeps answering fantasy_gameweek_locked to a position change, ahead of the new guard",
  },
  {
    signature: "app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text)",
    label: "the scoring snapshot check (fantasy_scoring_input_changed)",
    file: "20260927094823_adaptive_fantasy_scoring.sql",
    header: /create or replace function app_private\.fantasy_assert_scoring_snapshot\(/,
    why: "is the check whose failure the guard prevents; it is not changed",
  },
  {
    signature: "app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)",
    label: "the creation of a catalog player (player, membership, pool entry)",
    file: "20261014170000_sofascore_catalog_aliases.sql",
    header: /create function app_private\.sofascore_create_catalog_player\(/,
    why: "is what the matcher and the staff action call; the guard refuses its pool insert",
  },
  {
    signature: "api.service_sofascore_auto_map_players(uuid,jsonb)",
    label: "the SofaScore player matcher",
    file: "20261014170000_sofascore_catalog_aliases.sql",
    header: /create or replace function api\.service_sofascore_auto_map_players\(/,
    why: "creates a player inside a BEGIN ... EXCEPTION WHEN OTHERS block, so a refusal holds him and does not fail the call",
  },
];

/** The three functions the migration creates. */
export const NEW_FUNCTIONS = [
  {
    signature: "app_private.fantasy_guard_finalizing_player_catalog()",
    header: /create function app_private\.fantasy_guard_finalizing_player_catalog\(\)/,
  },
  {
    signature: "app_private.fantasy_guard_finalizing_squad_membership()",
    header: /create function app_private\.fantasy_guard_finalizing_squad_membership\(\)/,
  },
  {
    signature: "app_private.fantasy_guard_finalizing_lineups()",
    header: /create function app_private\.fantasy_guard_finalizing_lineups\(\)/,
  },
] as const;

/** The three triggers: name, table, tgtype (BEFORE ROW and the events), watched columns. */
export const NEW_TRIGGERS = [
  {
    name: "fantasy_players_guard_finalizing_inputs",
    table: "app.fantasy_players",
    fn: "app_private.fantasy_guard_finalizing_player_catalog()",
    tgtype: 31,
    columns: "id,fantasy_season_id,football_player_id,football_team_id,position_id",
  },
  {
    name: "team_memberships_guard_finalizing_inputs",
    table: "app.team_memberships",
    fn: "app_private.fantasy_guard_finalizing_squad_membership()",
    tgtype: 31,
    columns: "player_id,team_id,season_id,valid_from,valid_to",
  },
  {
    name: "fantasy_lineups_guard_finalizing_inputs",
    table: "app.fantasy_lineups",
    fn: "app_private.fantasy_guard_finalizing_lineups()",
    tgtype: 11,
    columns: "",
  },
] as const;

/** Migrations the update needs recorded (the ones that define what it pins or guards). */
export const REQUIRED_MIGRATIONS = [
  "20260927094823",
  "20261009091728",
  "20261013160200",
  "20261014170000",
];

export function pinsFromRepository() {
  return PINS.map((pin) => ({
    ...pin,
    md5: md5(bodyOf(read(`supabase/migrations/${pin.file}`), pin.header)),
  }));
}

export function newFunctionPins(migration: string) {
  return NEW_FUNCTIONS.map((fn) => ({ ...fn, md5: md5(bodyOf(migration, fn.header)) }));
}

const q = (text: string) => text.replaceAll("'", "''");

export function build(): string {
  const migration = read(MIGRATION_PATH);
  const tag = `$bg_${VERSION}_file$`;
  if (migration.includes(tag)) throw new Error("the migration contains the dollar-quote tag");
  const pins = pinsFromRepository();
  const created = newFunctionPins(migration);
  const pinValues = pins
    .map(
      (pin) =>
        `      ('${pin.signature}', '${pin.md5}', '${q(pin.label)} (${pin.file.split("_")[0]})')`,
    )
    .join(",\n");
  const createdValues = created.map((fn) => `      ('${fn.signature}', '${fn.md5}')`).join(",\n");
  const triggerValues = NEW_TRIGGERS.map(
    (t) => `      ('${t.name}', '${t.table}', '${t.fn}', ${t.tgtype}, '${t.columns}')`,
  ).join(",\n");
  const requiredList = REQUIRED_MIGRATIONS.map((v) => `'${v}'`).join(", ");
  const triggerNames = NEW_TRIGGERS.map((t) => `'${t.name}'`).join(", ");
  const createdSignatures = NEW_FUNCTIONS.map((f) => `'${f.signature}'`).join(", ");
  const sha = sha256(migration);

  return `-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration ${VERSION}_${NAME}
-- (audit finding SEC-01, 2026-10-16; ${RUNBOOK}):
-- While a gameweek of a Fantasy season is FINALIZING, the rows its scoring input document lists can no
-- longer change. Three row triggers refuse, with errcode PT409 and message fantasy_scoring_inputs_frozen:
--   * app.fantasy_players: insert, delete, and a change of season, player, club or position;
--   * app.team_memberships: insert, delete, and a change of player, club, season or dates, for a player
--     who is in that Fantasy season's pool;
--   * app.fantasy_lineups: delete (account erasure; the worker releases the request and retries hourly).
-- Why: the SofaScore matcher (football-live-refresh, every minute, no lease) creates a player nobody had,
-- with his pool entry; that is one more row in the sealed document, so every later finalization pass
-- fails with fantasy_scoring_input_changed and the gameweek can never complete. Price, status, eligible,
-- active, shirt numbers, names, photos, and every write while no gameweek is finalizing, stay as they are.
-- Each trigger first takes FOR KEY SHARE on the season's current gameweek row, which the finalization's
-- FOR UPDATE on the same row conflicts with, so a writer cannot commit after the gameweek has been sealed:
-- it either commits first (the finalization then sees its row) or waits and is refused.
-- The matcher is not changed: it creates a player inside a BEGIN ... EXCEPTION WHEN OTHERS block, so the
-- refusal undoes that one player, counts createFailed, leaves him queued, and the rest of the batch and
-- of the live refresh go on; the next call creates him once the gameweek is no longer finalizing.
-- It adds three functions and three triggers and writes no data. It replaces no function and changes no
-- existing trigger, table, column, setting, job or privilege.
--
-- WHEN
--   Any time of day, once the writers named below are paused; the statements need well under a second.
--   It needs 20260927094823, 20261009091728, 20261013160200 and 20261014170000 recorded (the script
--   checks). A gameweek that is finalizing at the moment this commits is protected from then on: a
--   change made before it committed is NOT undone, so look first (read-only):
--     select g.id, g.sequence_number, g.status from app.fantasy_gameweeks g where g.status = 'finalizing';
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   This changes the guards on app.fantasy_players, app.team_memberships and app.fantasy_lineups, which the
--   Fantasy lifecycle, the SofaScore live refresh and account erasure write. Creating a trigger takes a short lock that
--   waits for them, and the 5 second lock timeout below stops the script instead of queueing behind them.
--   So the script STOPS, before writing anything, unless these three are paused:
--   * the Fantasy lifecycle tick and, with it, the Fantasy worker tick (fantasy-lifecycle-tick,
--     fantasy-worker-tick; they score, lock, finalize and write prices and lineups). First look at
--     select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
--     then pause: select app_private.fantasy_automation_configure(false);
--     Pausing does not stop a pass already started: it keeps its lease for at most about eight minutes,
--     so wait until select holder, expires_at, released_at from app_private.fantasy_worker_lease;
--     shows released_at set or expires_at in the past (the script checks this too);
--   * football-live-refresh (every minute; its SofaScore matcher creates players and memberships). First
--     look at select mode, test_user_ids, football_live_refresh_enabled from
--     app_private.notification_email_settings; then pause:
--     select app_private.notification_email_configure('off', null, null, false);
--     (this also stands down the e-mail and results jobs and the season refresh; write down what the
--     first query showed, it is what you restore).
--   * the account-deletion tick (hourly at minute 23; its erasure deletes lineups, which the new lineup
--     trigger guards, and its lineup deletes would queue behind the trigger's lock). First look at
--     select enabled from app_private.account_deletion_settings;
--     then pause: select app_private.account_deletion_configure(false);
--     (the script checks the switch; a request that falls due meanwhile simply waits).
--   Optional, and why: AGENTS.md also lists Pépites ("a write that touches ... team memberships") and the
--   Manager Card ("a write that touches ... lineups"). This script writes no row of any table: it adds
--   triggers, and both jobs only READ these tables (their own tables are written elsewhere); a new trigger
--   takes a lock that does not block a reader. So they need not be paused. If you prefer the strict
--   reading, the commands are: look at select mode from app_private.pepites_settings; then
--   select app_private.pepites_configure('off', null); and select app_private.manager_card_configure(false, null);
--   and restore the previous Pépites mode and select app_private.manager_card_configure(true, null); only
--   if compute was on. Not needed either: managers' own lineup edits (ordinary traffic, a moment's lock),
--   the Trophées and Rivaux ticks (they read these tables), and the news and prediction jobs (other tables).
--   Restore AFTER the commit, and only what was on: select app_private.fantasy_automation_configure(true);
--   select app_private.account_deletion_configure(true); and
--   select app_private.notification_email_configure('<mode it showed>', null, <test_user_ids it
--   showed, or null>, <football_live_refresh_enabled it showed>);
--   While paused nothing is scored or finalized and no match is recorded; a few minutes is harmless.
--   Still make sure no other schema change (another apply script, a migration, a deploy) is running right
--   now: a rehearsal that ends in rollback takes locks too. The script compares the six functions it
--   relies on, every other trigger on the three tables, the row counts of the three tables and the cron job
--   list before and after and stops if they moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Pause the three writers above first.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line \`rollback;\` near the bottom to \`commit;\` and press Run again. The result
--      row should say "Applied". Then restore what you paused (above).
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--   To take it back: ship a forward migration that drops the three triggers and then the three functions
--   (${RUNBOOK}, "Rolling back"). Never edit this migration.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or any of the three functions or triggers already there), before
--     the four migrations above are recorded, while the Fantasy lifecycle tick, the live refresh or the
--     account-deletion tick is on or the Fantasy worker holds its lease, and where any of the six
--     functions it relies on is not byte for byte the text the repository's latest migration defines (md5 of its source): the two
--     price-processing guards, the pool rule trigger, the snapshot check, the catalog-player creation
--     and the SofaScore matcher;
--   * refuses to run where the scoring input document functions no longer read the Fantasy pool, the
--     club memberships and the lineups, or read another player table this guard does not cover;
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1]
--     (the form the migration promoter and the other apply scripts use), and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: the three functions are the reviewed text, security
--     definer, empty search path, callable by no API role; the three triggers are on the right tables,
--     BEFORE ROW, enabled, on the right events and columns; the six functions, every other trigger on the
--     three tables, the row counts and the cron job list are where they were; the history row is there.
--     It does not insert, update or delete a row of any of the three tables.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  fn record;
  src text;
  document_src text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}') then
    raise exception 'stop: migration ${VERSION} is already recorded as applied';
  end if;
  for fn in select v.version from unnest(array[${requiredList}]) as v(version) loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = fn.version) then
      raise exception 'stop: migration % is not recorded -- apply it first (this update is written against it)', fn.version;
    end if;
  end loop;
  if to_regclass('app.fantasy_players') is null
    or to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app.fantasy_seasons') is null
    or to_regclass('app.team_memberships') is null
    or to_regclass('app.fantasy_lineups') is null
    or to_regclass('app_private.fantasy_automation_settings') is null
    or to_regclass('app_private.notification_email_settings') is null
    or to_regprocedure('app_private.fantasy_scoring_input_document(uuid)') is null then
    raise exception 'stop: the database is missing the Fantasy tables or functions this update needs';
  end if;

  -- Not here yet.
  if to_regprocedure('app_private.fantasy_guard_finalizing_player_catalog()') is not null
    or to_regprocedure('app_private.fantasy_guard_finalizing_squad_membership()') is not null
    or to_regprocedure('app_private.fantasy_guard_finalizing_lineups()') is not null
    or exists (select 1 from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgname in (${triggerNames})) then
    raise exception 'stop: the finalizing guard already exists -- was this applied by another route?';
  end if;

  -- The writers are paused (AGENTS.md): nothing else writes these tables while the triggers are created.
  if exists (select 1 from app_private.fantasy_automation_settings s where s.lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first: select app_private.fantasy_automation_configure(false); (see the header)';
  end if;
  if exists (select 1 from app_private.notification_email_settings s where s.football_live_refresh_enabled) then
    raise exception 'stop: the football live refresh is on -- pause it first: select app_private.notification_email_configure(''off'', null, null, false); (see the header)';
  end if;
  if to_regclass('app_private.account_deletion_settings') is not null
    and exists (select 1 from app_private.account_deletion_settings s where s.enabled) then
    raise exception 'stop: the account-deletion tick is on -- pause it first: select app_private.account_deletion_configure(false); (see the header)';
  end if;
  if to_regclass('app_private.fantasy_worker_lease') is not null
    and exists (select 1 from app_private.fantasy_worker_lease l
                where l.released_at is null and l.expires_at > statement_timestamp()) then
    raise exception 'stop: the Fantasy worker holds its lease -- wait until released_at is set or expires_at has passed (see the header)';
  end if;

  -- The functions this update relies on and does not change are the reviewed ones.
  for fn in
    select * from (values
${pinValues}
    ) v(sig, md5_src, label)
  loop
    select p.prosrc into src from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if src is null then
      raise exception 'stop: % does not exist (%)', fn.sig, fn.label;
    end if;
    if md5(src) <> fn.md5_src then
      raise exception 'stop: % is not the reviewed one (md5 %, expected %) -- %', fn.sig, md5(src), fn.md5_src, fn.label;
    end if;
  end loop;

  -- The scoring input document still lists the pool, the memberships and the lineups, and no other
  -- player table this guard does not cover (the chain: the base document, the adaptive, live and rating
  -- wrappers).
  select string_agg(p.prosrc, E'\\n' order by p.proname) into document_src
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private' and p.proname like 'fantasy\\_scoring\\_input\\_document%';
  select p.prosrc into src from pg_catalog.pg_proc p
  where p.oid = to_regprocedure('app_private.fantasy_scoring_input_document_v1(uuid)');
  if src is null
    or src !~ 'from app\\.fantasy_players fp join app\\.fantasy_positions pos'
    or src !~ 'app\\.fantasy_lineups' then
    raise exception 'stop: the base scoring input document no longer lists the Fantasy pool and the lineups the way this guard covers';
  end if;
  if document_src is null
    or document_src !~ 'from app\\.fantasy_players fp'
    or document_src !~ 'app\\.team_memberships membership'
    or document_src !~ 'app\\.fantasy_lineups'
    or document_src ~ 'app\\.players\\y'
    or document_src ~ 'app\\.fantasy_squad_memberships' then
    raise exception 'stop: the scoring input document no longer reads what this guard covers (the Fantasy pool, the club memberships and the lineups, and no other player table)';
  end if;

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.fgg_functions_before',
    (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), ',' order by p.oid::regprocedure::text), ''))
     from pg_catalog.pg_proc p
     where p.oid in (select to_regprocedure(v.sig) from (values
${PINS.map((pin) => `       ('${pin.signature}')`).join(",\n")}
     ) v(sig))), true);
  perform set_config('bg.fgg_triggers_before',
    (select md5(coalesce(string_agg(t.tgrelid::regclass::text || ':' || t.tgname || ':' || t.tgenabled::text, ',' order by t.tgrelid::regclass::text, t.tgname), ''))
     from pg_catalog.pg_trigger t
     where not t.tgisinternal
       and t.tgrelid in ('app.fantasy_players'::regclass, 'app.team_memberships'::regclass, 'app.fantasy_lineups'::regclass)), true);
  perform set_config('bg.fgg_rows_before',
    (select jsonb_build_array(
       (select count(*) from app.fantasy_players),
       (select count(*) from app.team_memberships),
       (select count(*) from app.fantasy_lineups))::text), true);
  perform set_config('bg.fgg_cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration ${VERSION}, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '${VERSION}',
  '${NAME}',
  array[${tag}${migration}${tag}]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_${VERSION} text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '${VERSION}'
  );
begin
  if encode(sha256(convert_to(part_${VERSION}, 'UTF8')), 'hex')
    is distinct from '${sha}' then
    raise exception 'stop: ${VERSION} is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_${VERSION};
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  def record;
begin
  -- The three functions: the reviewed text, security definer, empty search path, callable by no API role.
  for fn in
    select * from (values
${createdValues}
    ) v(sig, md5_src)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname,
           has_function_privilege('public', p.oid, 'execute') as public_exec,
           has_function_privilege('anon', p.oid, 'execute') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
           has_function_privilege('service_role', p.oid, 'execute') as service_exec
      into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' was not created');
    elsif md5(def.prosrc) <> fn.md5_src or not def.prosecdef or def.provolatile <> 'v'
      or def.lanname <> 'plpgsql' or def.proconfig is distinct from array['search_path=""']
      or def.public_exec or def.anon_exec or def.authenticated_exec or def.service_exec then
      problems := problems || (fn.sig || ' is not the reviewed text, or is not security definer with an empty search_path, or an API role can call it');
    end if;
  end loop;

  -- The three triggers: table, function, BEFORE ROW and events, enabled, watched columns.
  for fn in
    select * from (values
${triggerValues}
    ) v(trigger_name, table_name, function_sig, expected_type, expected_columns)
  loop
    select t.tgtype, t.tgenabled, t.tgfoid = to_regprocedure(fn.function_sig) as right_function,
           coalesce((select string_agg(a.attname::text, ',' order by u.ord)
                     from unnest(t.tgattr::int2[]) with ordinality as u(attnum, ord)
                     join pg_catalog.pg_attribute a on a.attrelid = t.tgrelid and a.attnum = u.attnum), '') as watched_columns,
           t.tgnargs, t.tgqual is null as no_when
      into def
    from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass(fn.table_name) and t.tgname = fn.trigger_name and not t.tgisinternal;
    if def.tgtype is null then
      problems := problems || (fn.trigger_name || ' was not created on ' || fn.table_name);
    elsif def.tgtype <> fn.expected_type or def.tgenabled <> 'O' or not def.right_function
      or def.watched_columns <> fn.expected_columns or def.tgnargs <> 0 or not def.no_when then
      problems := problems || (fn.trigger_name || ' is not a plain enabled BEFORE ROW trigger of the right function, events and columns');
    end if;
  end loop;

  -- Nothing else moved.
  if (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), ',' order by p.oid::regprocedure::text), ''))
      from pg_catalog.pg_proc p
      where p.oid in (select to_regprocedure(v.sig) from (values
${PINS.map((pin) => `       ('${pin.signature}')`).join(",\n")}
      ) v(sig)))
    is distinct from current_setting('bg.fgg_functions_before', true) then
    problems := problems || 'one of the six functions this update relies on changed'::text;
  end if;
  if (select md5(coalesce(string_agg(t.tgrelid::regclass::text || ':' || t.tgname || ':' || t.tgenabled::text, ',' order by t.tgrelid::regclass::text, t.tgname), ''))
      from pg_catalog.pg_trigger t
      where not t.tgisinternal
        and t.tgrelid in ('app.fantasy_players'::regclass, 'app.team_memberships'::regclass, 'app.fantasy_lineups'::regclass)
        and t.tgname not in (${triggerNames}))
    is distinct from current_setting('bg.fgg_triggers_before', true) then
    problems := problems || 'another trigger on the three tables changed'::text;
  end if;
  if (select jsonb_build_array(
        (select count(*) from app.fantasy_players),
        (select count(*) from app.team_memberships),
        (select count(*) from app.fantasy_lineups))::text)
    is distinct from current_setting('bg.fgg_rows_before', true) then
    problems := problems || 'a row count of the three tables changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.fgg_cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '${VERSION}')
    then 'Applied. While a gameweek of a Fantasy season is finalizing, its player pool, the club memberships of its players and its lineups can no longer change (fantasy_scoring_inputs_frozen). Restore what you paused: select app_private.fantasy_automation_configure(true); select app_private.account_deletion_configure(true); and the e-mail and live refresh switch as the first query showed.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
`;
}

if (import.meta.main) {
  const next = build();
  const target = join(root, SCRIPT_PATH);
  if (process.argv.includes("--check")) {
    const current = readFileSync(target, "utf8");
    if (current !== next) {
      console.error(`${SCRIPT_PATH} is not what the builder makes; run the builder.`);
      process.exit(1);
    }
    console.log(`${SCRIPT_PATH} is up to date.`);
  } else {
    writeFileSync(target, next);
    console.log(`wrote ${SCRIPT_PATH}`);
  }
}
