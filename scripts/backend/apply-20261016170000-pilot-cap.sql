-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016170000_pilot_cap
-- (the pilot cap, owner decision 2026-10-16; docs/production/PILOT_CAP_OWNER_RUNBOOK.md):
-- BotolaGO launches as a pilot capped at 1,000 managers. This adds the cap and ships it OFF: applied,
-- nothing changes for anyone until the owner switches it on in a SEPARATE authorised operation.
--   * app_private.pilot_settings: one row, enabled = false, max_managers = 1000, counting_rule 'teams';
--   * app_private.pilot_configure(enabled, max_managers): the owner's switch (postgres only);
--   * app_private.pilot_manager_count(season): the one definition of the count (postgres only);
--   * api.create_fantasy_team REPLACED by a copy of its latest definition (20260926003100_ordinary_account_mfa_step_up.sql) plus one
--     guard. While the cap is off the guard reads the settings row and does nothing else. While on, it
--     takes a per-season advisory lock and refuses a NEW team with PT409 fantasy_pilot_full once the
--     season has max_managers counted managers (active teams, minus accounts hidden from the rankings).
--     An existing manager, an idempotent replay, lineups, transfers and sign-in are not affected.
-- Supabase Auth sign-up is not touched: the cap is on teams, not accounts.
--
-- WHEN
--   Any time of day; the statements need well under a second. It needs 20260926003100 and 20261011160000
--   recorded (the script checks). Ordinary traffic is not interrupted: a create already running
--   finishes on the old definition, the next one uses the new one, and with the cap off they behave
--   the same.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing. The script creates one table (with its one row), two functions, and
--   replaces one function, api.create_fantasy_team, plus its own history row in
--   supabase_migrations.schema_migrations. No pg_cron job and no Edge Function creates a Fantasy team
--   or reads any of these objects (the Fantasy, Pépites, Manager Card, Trophées, Rivaux, e-mail, push,
--   news, prediction, account-deletion and ops jobs listed in AGENTS.md never call the function; the
--   capacity and staging seeds insert teams directly, not through it). The only caller is a manager's
--   own browser. Still make sure no other schema change (another apply script, a migration, a deploy)
--   is running right now: a rehearsal that ends in rollback takes locks too. The script compares every
--   other function in the api and app_private schemas, the grants of api.create_fantasy_team, the
--   number of Fantasy teams and the cron job list before and after and stops if they moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run again. The result
--      row should say "Applied". The cap is still OFF.
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--   Switching the cap on is a different operation and needs its own authorisation:
--   select app_private.pilot_configure(true, 1000);   (docs/production/PILOT_CAP_OWNER_RUNBOOK.md)
--   To take it back: switch it off with select app_private.pilot_configure(false); (instant, no deploy).
--   Removing the code is a forward migration that restores api.create_fantasy_team from
--   20260926003100_ordinary_account_mfa_step_up.sql and drops the table and the two functions. Never edit this migration.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or the table or either function already there), before
--     20260926003100 and 20261011160000 are recorded, and where api.create_fantasy_team is not byte
--     for byte the text the repository's latest migration defines (md5 of its source bd51863e984f373aba3b7de44e0f26e5);
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1]
--     (the form the migration promoter and the other apply scripts use), and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: the three functions are the reviewed text with an empty
--     search path (the switch and create_fantasy_team security definer); the two new ones are callable by no API role; create_fantasy_team
--     keeps its owner and its grants (signed-in users and the service, not anon); the settings table is
--     one row, OFF, 1000, 'teams', with row security forced and no API privilege; every other function
--     in api and app_private, the number of Fantasy teams and the cron job list are where they were;
--     the history row is there. It does not insert, update or delete a row of any Fantasy table.
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
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016170000') then
    raise exception 'stop: migration 20261016170000 is already recorded as applied';
  end if;
  for fn in select v.version from unnest(array['20260926003100', '20261011160000']) as v(version) loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = fn.version) then
      raise exception 'stop: migration % is not recorded -- apply it first (this update is written against it)', fn.version;
    end if;
  end loop;
  if to_regclass('app.fantasy_teams') is null
    or to_regclass('app.fantasy_seasons') is null
    or to_regclass('app_private.public_ranking_exclusions') is null
    or to_regprocedure('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)') is null then
    raise exception 'stop: the database is missing the Fantasy tables or functions this update needs';
  end if;

  -- Not here yet.
  if to_regclass('app_private.pilot_settings') is not null
    or to_regprocedure('app_private.pilot_configure(boolean,integer)') is not null
    or to_regprocedure('app_private.pilot_manager_count(uuid)') is not null then
    raise exception 'stop: the pilot cap already exists -- was this applied by another route?';
  end if;

  -- The function this update replaces is the reviewed one: the repository's latest definition.
  select p.prosrc into src from pg_catalog.pg_proc p where p.oid = to_regprocedure('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)');
  if md5(src) <> 'bd51863e984f373aba3b7de44e0f26e5' then
    raise exception 'stop: api.create_fantasy_team(uuid,uuid,text,jsonb,uuid) is not the reviewed one (md5 %, expected bd51863e984f373aba3b7de44e0f26e5) -- the live text differs from 20260926003100_ordinary_account_mfa_step_up.sql; read it with pg_get_functiondef and compare before replacing it', md5(src);
  end if;

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.pcap_team_fn_before',
    (select concat_ws('|', coalesce(p.proacl::text, ''), p.proowner::regrole::text, p.prosecdef::text,
        coalesce(p.proconfig::text, ''), p.prorettype::regtype::text, p.provolatile::text)
     from pg_catalog.pg_proc p where p.oid = to_regprocedure('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)')), true);
  perform set_config('bg.pcap_functions_before',
    (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('api', 'app_private')
       and p.proname not in ('create_fantasy_team', 'pilot_configure', 'pilot_manager_count')), true);
  perform set_config('bg.pcap_rows_before',
    (select jsonb_build_array(
       (select count(*) from app.fantasy_teams),
       (select count(*) from app_private.public_ranking_exclusions))::text), true);
  perform set_config('bg.pcap_cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016170000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016170000',
  'pilot_cap',
  array[$bg_20261016170000_file$-- Pilot cap: BotolaGO launches as a PILOT capped at 1,000 managers (owner decision, 2026-10-16).
--
-- Until now nothing enforced a cap (docs/production/2026-10-16-capacity-test-run-sheet.md, Q6). This
-- migration builds one and ships it OFF. Applied, it changes nothing until the owner runs, as a
-- separate authorised operation, `select app_private.pilot_configure(true, 1000);`
-- (docs/production/PILOT_CAP_OWNER_RUNBOOK.md).
--
-- THE RULE. While the cap is on, api.create_fantasy_team refuses a NEW Fantasy team with
-- `PT409 fantasy_pilot_full` once the season already has max_managers counted managers. It is the
-- only function that changes behaviour. Existing managers are unaffected: lineup saves, transfers,
-- chips, leagues, reads and sign-in are other functions and are not touched; a manager who already
-- has a team, or who replays a create with the same idempotency key, gets the same answer as
-- before (those checks run before the cap).
--
-- WHAT IS COUNTED. A "manager" is a Fantasy team of the season being joined whose status is
-- 'active' (the definition the rankings, the lifecycle and the admin overview use), except teams of
-- accounts on app_private.public_ranking_exclusions (the test and QA accounts the owner hid from the
-- rankings on 2026-10-11): they do not use up places, and they are not refused by the cap either, so
-- the owner can keep testing a full pilot. Erased accounts have no team row, so their place is
-- free again; a suspended or archived team does not count.
-- Supabase Auth sign-up is NOT touched: anyone can still create an account, read News, use
-- Pronostics and browse. The cap is on teams, not accounts.
--
-- CONCURRENCY. While the cap is on, a creator takes a transaction-level advisory lock for the season
-- (hashtextextended('fantasy:pilot-cap:' || season id, 0)) before it counts, and holds it to commit.
-- Two simultaneous creations at the last place therefore run one after the other, and the second
-- counts after the first has committed (READ COMMITTED, fresh snapshot per statement), so only one
-- gets the place. A counter row was rejected: it would have to be kept in step with account erasure,
-- hidden accounts and suspensions, while the count is always the truth; the lock costs nothing
-- while the cap is off (it is not taken) and serialises about one short transaction per new manager
-- while on. Lock order is the function's existing one (user, then squads shared) and the pilot
-- lock last, and nothing takes the pilot lock elsewhere, so it cannot deadlock.
--
-- WHAT THE MIGRATION CREATES
--   * app_private.pilot_settings: one row, OFF, max_managers 1000, counting_rule 'teams'.
--   * app_private.pilot_configure(p_enabled, p_max_managers): the owner's switch (postgres only).
--   * app_private.pilot_manager_count(p_season_id): the one definition of the count, used by the
--     guard and by the owner to read where the pilot stands (postgres only).
--   * api.create_fantasy_team, replaced: a copy of its latest definition
--     (20260926003100_ordinary_account_mfa_step_up.sql) with the guard added. `create or replace`
--     keeps its owner and grants. Nothing else in it changes.
--
-- The front end maps fantasy_pilot_full to a clear French and Arabic message
-- (src/backend/fantasy/errors.ts, src/services/fantasy-create-service.ts).

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
create table app_private.pilot_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  max_managers integer not null default 1000,
  counting_rule text not null default 'teams',
  updated_at timestamptz not null default statement_timestamp(),
  constraint pilot_settings_singleton check (id),
  constraint pilot_settings_max_check check (max_managers between 1 and 1000000),
  constraint pilot_settings_rule_check check (counting_rule in ('teams'))
);
insert into app_private.pilot_settings (id) values (true);
alter table app_private.pilot_settings enable row level security;
alter table app_private.pilot_settings force row level security;
revoke all on app_private.pilot_settings from public, anon, authenticated, service_role;
comment on table app_private.pilot_settings is
  'The pilot cap, one row, OFF by default. While enabled, api.create_fantasy_team refuses a new team (PT409 fantasy_pilot_full) once the season has max_managers counted managers (counting_rule teams: active teams, hidden test accounts excluded). Changed only by app_private.pilot_configure.';

create function app_private.pilot_configure(
  p_enabled boolean default null,
  p_max_managers integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result app_private.pilot_settings%rowtype;
begin
  if p_max_managers is not null and p_max_managers not between 1 and 1000000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- A null leaves that setting as it is.
  update app_private.pilot_settings set
    enabled = coalesce(p_enabled, enabled),
    max_managers = coalesce(p_max_managers, max_managers),
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object(
    'enabled', result.enabled,
    'maxManagers', result.max_managers,
    'countingRule', result.counting_rule
  );
end;
$$;
revoke all on function app_private.pilot_configure(boolean, integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.pilot_configure(boolean, integer) to postgres;
comment on function app_private.pilot_configure(boolean, integer) is
  'Owner-run switch for the pilot cap: (true, 1000) switches it on at 1,000 managers, (false) switches it off, (null, 1500) raises the number and leaves the switch. A null leaves that setting as it is. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- The count
-- ---------------------------------------------------------------------------
create function app_private.pilot_manager_count(p_season_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from app.fantasy_teams team
  where team.fantasy_season_id = p_season_id
    and team.status = 'active'
    and not exists (
      select 1 from app_private.public_ranking_exclusions exclusion
      where exclusion.user_id = team.user_id
    );
$$;
revoke all on function app_private.pilot_manager_count(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.pilot_manager_count(uuid) to postgres;
comment on function app_private.pilot_manager_count(uuid) is
  'How many managers the pilot cap counts in a Fantasy season: its active teams, minus the accounts hidden from the rankings. The one definition, used by api.create_fantasy_team and read by the owner. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
-- As in 20260926003100, with the pilot cap added after the existing-team check.
create or replace function api.create_fantasy_team(
  p_season_id uuid,
  p_gameweek_id uuid,
  p_team_name text,
  p_selection jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare season app.fantasy_seasons%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare requested app.fantasy_gameweeks%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_team_id uuid;
declare pilot app_private.pilot_settings%rowtype;
declare target_lineup_id uuid;
declare squad_cost numeric(10,2);
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  if p_idempotency_key is null or p_team_name is null
    or p_team_name <> btrim(p_team_name) or char_length(p_team_name) not between 3 and 40
    or p_team_name !~ '^[[:alnum:]][[:alnum:] _''.-]{1,38}[[:alnum:]]$'
  then raise exception using errcode = 'PT400', message = 'invalid_team_name'; end if;
  select * into season from app.fantasy_seasons where id = p_season_id and status in ('registration_open','active');
  if not found then raise exception using errcode = 'PT409', message = 'fantasy_season_closed'; end if;
  select * into requested from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if requested.fantasy_season_id <> season.id then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  -- A new team joins the gameweek a squad can still enter. The client names
  -- the one it showed the manager; any other gameweek -- past its deadline,
  -- or no longer the next one -- is refused with the long-standing code.
  gameweek := app_private.fantasy_enrolment_gameweek(season.id);
  if gameweek.id is null or gameweek.id <> requested.id then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(p_team_name, p_gameweek_id, p_selection);
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:create:' || p_season_id::text, 0));
  -- 20260925200000: a new squad is checked against the clubs as they stand
  -- once any player list update has finished, and an update waits for it.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'fantasy:squads:' || season.id::text, 0));
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'create_team'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  if exists (select 1 from app.fantasy_teams where user_id = current_user_id and fantasy_season_id = season.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_team_already_exists';
  end if;
  -- 20261016170000: the pilot cap. While app_private.pilot_settings.enabled is false (the shipped
  -- state) this block reads one row and does nothing else. A replay (the idempotency check
  -- above) and a manager who already has a team (the check above) never reach it, so the cap
  -- only ever refuses a NEW team. A hidden test or QA account (app_private.public_ranking_exclusions)
  -- neither counts toward the cap nor is refused by it.
  select * into pilot from app_private.pilot_settings where id;
  if pilot.enabled
    and not exists (select 1 from app_private.public_ranking_exclusions exclusion
      where exclusion.user_id = current_user_id)
  then
    -- One creator at a time per season while the cap is on. READ COMMITTED takes a fresh
    -- snapshot for the count below, after this lock is granted, so it sees every team the
    -- previous holder committed; the lock is released at commit or rollback.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('fantasy:pilot-cap:' || season.id::text, 0));
    if app_private.pilot_manager_count(season.id) >= pilot.max_managers then
      raise exception using errcode = 'PT409', message = 'fantasy_pilot_full';
    end if;
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  select sum(player.price) into squad_cost
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  if squad_cost > rules.initial_budget then raise exception using errcode = 'PT400', message = 'budget_exceeded'; end if;
  insert into app.fantasy_teams (
    user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
  ) values (
    current_user_id, season.id, gameweek.id, p_team_name,
    rules.initial_budget - squad_cost, squad_cost, rules.initial_free_transfers
  ) returning id into target_team_id;
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  ) select target_team_id, player.id, player.price, player.price, gameweek.id
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (target_team_id, gameweek.id, 1) returning id into target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  cached_response := app_private.fantasy_team_dto(target_team_id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_team', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, resulting_version, idempotency_key,
    safe_metadata
  ) values (current_user_id, target_team_id, 'create_team', true, 1, p_idempotency_key,
    jsonb_build_object('seasonId', season.id, 'gameweekId', gameweek.id));
  return cached_response;
end;
$$;
$bg_20261016170000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016170000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016170000'
  );
begin
  if encode(sha256(convert_to(part_20261016170000, 'UTF8')), 'hex')
    is distinct from '648f3269030d19552420ace25bef7098defc0c1e5daf172236af23307a279ded' then
    raise exception 'stop: 20261016170000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016170000;
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
  settings record;
  api_role text;
begin
  -- The three functions: the reviewed text, security definer, empty search path.
  for fn in
    select * from (values
      ('app_private.pilot_configure(boolean,integer)', '92274d925ac9416e6d4b527c153299bf'),
      ('app_private.pilot_manager_count(uuid)', '79f922d7ac7461776dbf8e3b328e7cb5'),
      ('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'a85ae45fe4a131f754cd98571a8e39ab')
    ) v(sig, md5_src)
  loop
    select p.prosrc, p.prosecdef, p.proconfig, p.provolatile into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' was not created');
    elsif md5(def.prosrc) <> fn.md5_src then
      problems := problems || (fn.sig || ' is not the reviewed text');
    elsif not def.prosecdef and fn.sig <> 'app_private.pilot_manager_count(uuid)' then
      problems := problems || (fn.sig || ' is not security definer');
    elsif def.proconfig is distinct from array['search_path=""'] then
      problems := problems || (fn.sig || ' does not have an empty search_path');
    end if;
  end loop;

  -- The two new functions are callable by no API role.
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(api_role, 'app_private.pilot_configure(boolean,integer)', 'execute')
      or has_function_privilege(api_role, 'app_private.pilot_manager_count(uuid)', 'execute') then
      problems := problems || ('an API role (' || api_role || ') can call the pilot switch or the count');
    end if;
  end loop;

  -- The replaced function keeps its owner, grants, security mode, search path and result type.
  if (select concat_ws('|', coalesce(p.proacl::text, ''), p.proowner::regrole::text, p.prosecdef::text,
        coalesce(p.proconfig::text, ''), p.prorettype::regtype::text, p.provolatile::text)
      from pg_catalog.pg_proc p where p.oid = to_regprocedure('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)'))
    is distinct from current_setting('bg.pcap_team_fn_before', true) then
    problems := problems || 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid) changed its owner, grants or settings'::text;
  end if;
  if not has_function_privilege('authenticated', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
    or has_function_privilege('anon', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
    or has_function_privilege('public', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute') then
    problems := problems || 'api.create_fantasy_team is not callable by signed-in users only (not anon)'::text;
  end if;

  -- Shipped OFF: one row, enabled false, 1000, teams; closed to every API role.
  select s.enabled, s.max_managers, s.counting_rule, (select count(*) from app_private.pilot_settings) as row_count
    into settings from app_private.pilot_settings s;
  if settings.enabled is distinct from false or settings.max_managers is distinct from 1000
    or settings.counting_rule is distinct from 'teams' or settings.row_count <> 1 then
    problems := problems || 'the pilot switch is not one row, OFF, 1000, teams'::text;
  end if;
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('app_private.pilot_settings')) then
    problems := problems || 'row security is not enabled and forced on app_private.pilot_settings'::text;
  end if;
  foreach api_role in array array['public', 'anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(api_role, 'app_private.pilot_settings', 'select')
      or has_table_privilege(api_role, 'app_private.pilot_settings', 'insert')
      or has_table_privilege(api_role, 'app_private.pilot_settings', 'update')
      or has_table_privilege(api_role, 'app_private.pilot_settings', 'delete') then
      problems := problems || ('an API role (' || api_role || ') has a privilege on app_private.pilot_settings');
    end if;
  end loop;

  -- Nothing else moved.
  if (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('api', 'app_private')
        and p.proname not in ('create_fantasy_team', 'pilot_configure', 'pilot_manager_count'))
    is distinct from current_setting('bg.pcap_functions_before', true) then
    problems := problems || 'another function in api or app_private changed'::text;
  end if;
  if (select jsonb_build_array(
        (select count(*) from app.fantasy_teams),
        (select count(*) from app_private.public_ranking_exclusions))::text)
    is distinct from current_setting('bg.pcap_rows_before', true) then
    problems := problems || 'the number of Fantasy teams or of hidden accounts changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.pcap_cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016170000') then
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016170000')
    then 'Applied. The pilot cap exists and is OFF: nothing changes for anyone yet. To switch it on (a separate authorised operation): select app_private.pilot_configure(true, 1000); to read where the pilot stands: select app_private.pilot_manager_count(id), name from app.fantasy_seasons where status in (''registration_open'', ''active''); to switch it off again: select app_private.pilot_configure(false);'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
