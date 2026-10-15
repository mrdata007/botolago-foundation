-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016090300_morocco_time_pepites
-- (Morocco's clock in the database; docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md):
-- Pépites times of day follow Morocco's clock. It replaces FIVE functions, each with only the
-- zone expression changed: pepites_local_at (Monday + local time -> instant), pepites_create_draft
-- (the "Publication prévue" time in the staff notice), pepites_tick_draft (Monday, the draft hour),
-- pepites_tick_daily (the day of the daily sweep) and pepites_tick (the date in an error notice's
-- key). Before: pepites_local_at('2026-10-19', '20:00') = 19:00Z, so the weekly Top 10 went out at
-- 19:00 Moroccan time and the draft at 11:00. After: 20:00 and 12:00. The sealed scoring
-- (pepites_source_players, pepites_compute_v1) is deliberately NOT touched.
--
-- THE RULE. Morocco is UTC+0 all year from 2026-09-20T01:00:00Z (decree n° 2.26.530; IANA tz 2026c),
-- confirmed by the owner on 2026-10-15. The application already follows it
-- (src/lib/morocco-time.ts); this database still carries older time-zone data (UTC+1), so a
-- time the database turns into Moroccan clock time is an hour off from what the person sees.
--
-- WHEN
--   After 20261016090000 (the helpers) is committed. Pépites runs on this database (mode public),
--   so choose a moment that is NOT within an hour of the Monday draft (12:00 Moroccan time) or the
--   Monday publication (20:00) of a week that has an edition drafted or scheduled; the rehearsal's
--   NOTICE lists those. An edition that is already scheduled keeps the scheduled_for it was given;
--   see the runbook. Any other time of day is fine; well under a second.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   Nothing needs pausing: the script only replaces the definition of five functions (pg_proc) and
--   records itself in supabase_migrations.schema_migrations. It writes no Pépites table, no
--   fixture, player or membership row, no setting. The job that CALLS the functions is
--   pepites-tick (every 15 minutes, writes only while pepites_settings.mode is not off): a tick
--   already running finishes on the old text, the next one uses the new. If you prefer, pause it
--   for the minutes the script runs with `select app_private.pepites_configure('off', null);` and
--   restore the previous mode afterwards (AGENTS.md); it is not required. Still make sure no other
--   schema change is running right now. The script compares the Pépites switches, the editions
--   and the cron job list before and after and stops if they moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Read-only pre-checks and post-checks:
--      docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run again. The result
--      row should say "Applied".
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--
-- WHAT IT DOES
--   * refuses to run twice, before the helpers are recorded and working, and where any of the
--     five functions is not byte for byte the text the repository's latest migration defines
--     (md5 of its source), changed attributes, or is callable by anyone but the owner;
--   * records the migration file in supabase_migrations.schema_migrations and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: each source is the new one with no
--     Africa/Casablanca left; attributes, privileges and comments are unchanged;
--     pepites_local_at('2026-10-19', '20:00') = 2026-10-19 20:00Z and ('12:00') = 12:00Z; the
--     Pépites switches, the editions and the cron job list are where they were. It never calls
--     the tick functions (they write).
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
  def record;
  held text[];
  absent text;
  present text;
  baseline text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090300') then
    raise exception 'stop: migration 20261016090300 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090000') then
    raise exception 'stop: 20261016090000 (the Morocco clock helpers) is not recorded -- apply scripts/backend/apply-20261016090000-morocco-time-helpers.sql (committed) first';
  end if;
  -- The helpers are the reviewed ones and answer the application's rule.
  for fn in
    select * from (values
      ('app_private.morocco_permanent_utc_from()', '0121c9157d7d1ff8b631505346c93e8d', 'i'),
      ('app_private.morocco_time_zone_label()', '56f77cbfc332de897228af318427ec73', 'i'),
      ('app_private.morocco_zone_name(timestamp with time zone)', '46d83167cae2e309865addebb8149388', 's'),
      ('app_private.morocco_local(timestamp with time zone)', '2a14d329a546ae4d825a47ae59c184db', 's'),
      ('app_private.morocco_local_date(timestamp with time zone)', 'f506550098a22ea140b464a920c4b53f', 's'),
      ('app_private.morocco_instant(timestamp without time zone)', 'd4876d382d725001a00ec4a5764ea259', 's'),
      ('app_private.morocco_day_start(date)', '01999ac07dbfb139ee662e802ff1d128', 's'),
      ('app_private.morocco_day_end(date)', '6dca44b43ff8863b21ee8bf0052b117b', 's'),
      ('app_private.zone_local(timestamp with time zone,text)', 'd05aeb2e6d7ecccdddc80b0d474f7a2b', 's'),
      ('app_private.zone_instant(timestamp without time zone,text)', '5aff74a376f56524ed8576282086bf1e', 's')
    ) v(sig, md5_src, vol)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig into def
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: helper % does not exist -- apply the helpers first', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.md5_src or def.prosecdef or def.provolatile <> fn.vol
      or def.proconfig is distinct from array['search_path=""'] then
      raise exception 'stop: helper % is not the reviewed one', fn.sig;
    end if;
  end loop;

  if app_private.morocco_local(timestamptz '2026-10-15 12:00+00') is distinct from timestamp '2026-10-15 12:00:00'
    or app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00') is distinct from timestamp '2026-09-20 01:59:59'
    or app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00') is distinct from timestamp '2026-09-20 01:00:00'
    or app_private.morocco_local(timestamptz '2026-03-10 12:00+00') is distinct from timestamp '2026-03-10 12:00:00'
    or app_private.morocco_local(timestamptz '2026-01-15 12:00+00') is distinct from timestamp '2026-01-15 13:00:00'
    or app_private.morocco_local(timestamptz '2027-02-10 12:00+00') is distinct from timestamp '2027-02-10 12:00:00' then
    raise exception 'stop: the Morocco clock helpers do not give the application''s answers';
  end if;
  if app_private.morocco_instant(timestamp '2026-10-15 12:00') is distinct from timestamptz '2026-10-15 12:00+00'
    or app_private.morocco_instant(timestamp '2026-09-20 00:30') is distinct from timestamptz '2026-09-19 23:30+00'
    or app_private.morocco_day_start(date '2026-09-20') is distinct from timestamptz '2026-09-19 23:00+00'
    or app_private.morocco_day_end(date '2026-09-20') is distinct from timestamptz '2026-09-21 00:00+00'
    or app_private.morocco_local_date(timestamptz '2026-10-15 23:30+00') is distinct from date '2026-10-15' then
    raise exception 'stop: the Morocco day helpers do not give the application''s answers';
  end if;
  if app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca') is distinct from timestamp '2026-10-12 18:30:00'
    or app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Europe/Paris') is distinct from timestamp '2026-10-12 20:30:00'
    or app_private.zone_instant(timestamp '2026-10-12 20:00', 'Europe/Paris') is distinct from timestamptz '2026-10-12 18:00+00' then
    raise exception 'stop: the zone helpers do not give the expected answers';
  end if;
  -- Each function this update replaces is exactly what the repository's latest migration defines.
  for fn in
    select * from (values
      ('app_private.pepites_local_at(date,time without time zone)', 'ce0643b1ccdb2057f06a6902a8a5b3ca', '3f87e5890d6daf41cc8f67e73a409b2a', false, 's', 'sql', true, '{}'::text[]),
      ('app_private.pepites_create_draft(uuid,date,uuid)', 'cde742e7e12d1e96068a8a8bafa02241', 'db86e49066825cf790acc52548c38756', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.pepites_tick_draft(uuid,timestamp with time zone)', 'b60594c0e911046b90a09e693191f711', '8f1b6c44e6dd323b8b037f4195f408f9', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.pepites_tick_daily(uuid,timestamp with time zone)', '2c64fe50db39e0dd7319b92fabb3b55a', '7f7bdedbc64c7a54a1171aeada278746', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.pepites_tick(timestamp with time zone)', '783bb9cd9bf6d9364808f7a43c4667fc', 'c8647ef7e6d49e034023e535da7c9cf1', true, 'v', 'plpgsql', true, '{}'::text[])
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.oid, p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      raise exception 'stop: % does not exist on this database', fn.sig;
    end if;
    if md5(def.prosrc) = fn.new_md5 then
      raise exception 'stop: % already has the new text -- was this applied by another route?', fn.sig;
    end if;
    if md5(def.prosrc) <> fn.old_md5 then
      raise exception 'stop: % is not the version this update replaces (md5 %, expected %)', fn.sig, md5(def.prosrc), fn.old_md5;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      raise exception 'stop: % has attributes other than the reviewed ones (security, volatility, language, search_path)', fn.sig;
    end if;
    select coalesce(array_agg(distinct r.name order by r.name), '{}') into held
    from (
      select case when a.grantee = 0 then 'public' else (select rolname from pg_catalog.pg_roles where oid = a.grantee) end as name
      from aclexplode(coalesce(def.proacl, acldefault('f', def.proowner))) a
      where a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
    ) r;
    if held is distinct from fn.holders then
      raise exception 'stop: % is executable by % -- expected %', fn.sig, held, fn.holders;
    end if;
  end loop;

  -- What the new text calls must exist (other than the helpers, checked above).
  select string_agg(v.name, ', ' order by v.name) into absent
  from (values
    ('app_private.data_desk_sweep'),
    ('app_private.expire_player_photo_releases'),
    ('app_private.pepites_current_season'),
    ('app_private.pepites_latest_run'),
    ('app_private.pepites_lock_week'),
    ('app_private.pepites_notify'),
    ('app_private.pepites_replay'),
    ('app_private.pepites_restore_actor'),
    ('app_private.pepites_set_actor'),
    ('app_private.pepites_tick_publish'),
    ('app_private.pepites_tick_runs'),
    ('app_private.pepites_week_monday'),
    ('app_private.pepites_week_number')
  ) v(name)
  where not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname || '.' || p.proname = v.name);
  if absent is not null then
    raise exception 'stop: the database is missing functions this update calls: %', absent;
  end if;

  -- Baseline: the cron job list, the privileges and comments of the functions, the switches.
  select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), '')) into baseline
  from cron.job j;
  perform set_config('bg.morocco_cron_before', baseline, true);
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (to_regprocedure('app_private.pepites_local_at(date,time without time zone)'), to_regprocedure('app_private.pepites_create_draft(uuid,date,uuid)'), to_regprocedure('app_private.pepites_tick_draft(uuid,timestamp with time zone)'), to_regprocedure('app_private.pepites_tick_daily(uuid,timestamp with time zone)'), to_regprocedure('app_private.pepites_tick(timestamp with time zone)'));
  perform set_config('bg.morocco_acl_comment_before', baseline, true);
  baseline := (select coalesce((select md5(to_jsonb(s)::text) from app_private.pepites_settings s limit 1), ''));
  perform set_config('bg.morocco_watched_0_before', baseline, true);
  baseline := (select coalesce((select md5(string_agg(e::text, ',' order by e.id)) from app.pepites_editions e), ''));
  perform set_config('bg.morocco_watched_1_before', baseline, true);
  -- Editions that carry a time already (counts and the nearest one; no ids, no names).
  raise notice 'pepites editions in draft or scheduled: %, next scheduled_for: %',
    (select count(*) from app.pepites_editions where status in ('draft', 'scheduled')),
    (select min(scheduled_for) from app.pepites_editions where status in ('draft', 'scheduled') and scheduled_for > statement_timestamp());
  raise notice 'pepites mode: %', (select mode from app_private.pepites_settings where id);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016090300, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016090300',
  'morocco_time_pepites',
  array[$bg_20261016090300_file$-- Pépites times of day follow Morocco's clock.
--
-- WHAT WAS WRONG. The weekly Top 10 is scheduled for a Moroccan wall-clock time
-- (publication Monday 20:00, the staff draft Monday 12:00 by default) using the
-- database's own `Africa/Casablanca` data, which still say UTC+1 after
-- 2026-09-20 (the app's rule is UTC+0 from 2026-09-20T01:00:00Z, 20261016090000).
-- `pepites_local_at('2026-10-19', '20:00')` returned 19:00Z, so the edition went
-- out at 19:00 Moroccan time instead of 20:00; the draft was made at 11:00, the
-- daily sweep's date rolled over at 23:00, and the staff notice said "20:00" for
-- an instant that was really 19:00.
--
-- WHAT THIS CHANGES. Five functions, each the latest definition (all in
-- 20260926100000) with only the zone expression replaced by the helpers of
-- 20261016090000:
--   * pepites_local_at     Monday + local time -> instant
--   * pepites_create_draft the "Publication prévue" time in the staff notice
--   * pepites_tick_draft   Monday and the draft hour, by Moroccan clock
--   * pepites_tick_daily   the Moroccan date of the daily sweep
--   * pepites_tick         the date in the error notice's de-duplication key
-- Signatures, security attributes, search_path and privileges are unchanged.
--
-- NOT CHANGED, ON PURPOSE. The sealed scoring (pepites_source_players and
-- pepites_compute_v1, 20260926090000) also reads a Moroccan date from a run's
-- cut-off (squad membership validity; age in whole years). Those run under a
-- sealed methodology and are replayed against stored scores; the date only
-- differs for a cut-off between 23:00 and 24:00 UTC and only changes a result on
-- a birthday or a transfer day within that hour. Changing them would risk a
-- spurious "rejeu différent" and belongs to a methodology version, not here.
-- Editions already scheduled keep the `scheduled_for` they were given.
--
-- Depends on 20261016090000 (the helpers).

do $$
begin
  if to_regprocedure('app_private.morocco_instant(timestamp without time zone)') is null
    or to_regprocedure('app_private.morocco_local(timestamp with time zone)') is null
    or to_regprocedure('app_private.morocco_local_date(timestamp with time zone)') is null then
    raise exception 'morocco_time_helpers_missing: apply 20261016090000 first';
  end if;
end $$;

create or replace function app_private.pepites_local_at(p_on date, p_local_time time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select app_private.morocco_instant(p_on + p_local_time);
$$;

create or replace function app_private.pepites_create_draft(p_run_id uuid, p_on date, p_actor uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run app.pepites_runs%rowtype;
  v_params jsonb;
  v_settings app_private.pepites_settings%rowtype;
  v_week integer;
  v_edition_id uuid;
  v_previous_actor text;
begin
  select * into v_run from app.pepites_runs where id = p_run_id;
  if v_run.status is distinct from 'succeeded' or v_run.kind <> 'weekly' then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_RUN_INVALID';
  end if;
  select methodology.params into v_params
  from app.pepites_methodologies methodology where methodology.version = v_run.methodology_version;
  if v_run.as_of_round_number < (v_params ->> 'first_edition_round')::integer then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_TOO_EARLY';
  end if;
  if v_run.ranked_count < (v_params ->> 'min_eligible_for_edition')::integer then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_TOO_FEW_RANKED';
  end if;
  select * into v_settings from app_private.pepites_settings where id;

  v_week := app_private.pepites_week_number(v_run.season_id, p_on);
  if v_week is null or v_week not between 1 and 60 then
    raise exception using errcode = '22023', message = 'PEPITES_EDITION_WEEK_INVALID';
  end if;
  perform app_private.pepites_lock_week(v_run.season_id, v_week);
  if exists (
    select 1 from app.pepites_editions edition
    where edition.season_id = v_run.season_id and edition.week_number = v_week
      and edition.status in ('draft', 'scheduled', 'published')
  ) then
    raise exception using errcode = '23505', message = 'PEPITES_WEEK_TAKEN';
  end if;

  v_previous_actor := app_private.pepites_set_actor(p_actor);
  insert into app.pepites_editions (season_id, week_number, round_number, run_id, scheduled_for, created_by)
  values (v_run.season_id, v_week, v_run.as_of_round_number, v_run.id,
    app_private.pepites_local_at(app_private.pepites_week_monday(v_run.season_id, v_week),
      v_settings.publish_local_time),
    p_actor)
  returning id into v_edition_id;

  insert into app.pepites_edition_entries (edition_id, editorial_rank, player_id, computed_rank, computed_score)
  select v_edition_id, score.rank, score.player_id, score.rank, score.score_exact
  from app.pepites_player_scores score
  where score.run_id = v_run.id and score.rank between 1 and 10;
  perform app_private.pepites_restore_actor(v_previous_actor);

  perform app_private.pepites_notify('draft:' || v_edition_id, 'brouillon prêt',
    format('Le Top 10 de la semaine %s (journée %s) est prêt à relire. Publication prévue : %s.',
      v_week, v_run.as_of_round_number,
      to_char(app_private.morocco_local(app_private.pepites_local_at(app_private.pepites_week_monday(v_run.season_id, v_week),
        v_settings.publish_local_time)), 'YYYY-MM-DD HH24:MI')));
  return v_edition_id;
end;
$$;

create or replace function app_private.pepites_tick_draft(p_season_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings app_private.pepites_settings%rowtype;
  v_local timestamp := app_private.morocco_local(p_now);
  v_week integer;
  v_run app.pepites_runs%rowtype;
  v_params jsonb;
  v_last_round integer;
begin
  select * into v_settings from app_private.pepites_settings where id;
  if extract(isodow from v_local) <> 1 or v_local::time < v_settings.draft_local_time then
    return pg_catalog.jsonb_build_object('draft', 'not_now');
  end if;
  v_week := app_private.pepites_week_number(p_season_id, v_local::date);
  if v_week is null or v_week not between 1 and 60 then
    return pg_catalog.jsonb_build_object('draft', 'outside_season');
  end if;
  if exists (
    select 1 from app.pepites_editions edition
    where edition.season_id = p_season_id and edition.week_number = v_week
  ) then
    return pg_catalog.jsonb_build_object('draft', 'exists');
  end if;
  select * into v_run from app.pepites_runs
  where id = app_private.pepites_latest_run(p_season_id, null);
  if v_run.id is null then
    return pg_catalog.jsonb_build_object('draft', 'no_run');
  end if;
  select max(edition.round_number) into v_last_round
  from app.pepites_editions edition
  where edition.season_id = p_season_id and edition.status in ('published', 'superseded', 'withdrawn');
  if v_run.as_of_round_number <= coalesce(v_last_round, 0) then
    return pg_catalog.jsonb_build_object('draft', 'no_new_round');
  end if;
  select methodology.params into v_params
  from app.pepites_methodologies methodology where methodology.version = v_run.methodology_version;
  if v_run.as_of_round_number < (v_params ->> 'first_edition_round')::integer then
    return pg_catalog.jsonb_build_object('draft', 'too_early');
  end if;
  if v_run.ranked_count < (v_params ->> 'min_eligible_for_edition')::integer then
    perform app_private.pepites_notify('too_few:' || p_season_id || ':' || v_week,
      'pas d''édition cette semaine',
      format('Journée %s : %s joueurs classés, il en faut %s. Pas de Top 10 cette semaine.',
        v_run.as_of_round_number, v_run.ranked_count, v_params ->> 'min_eligible_for_edition'));
    return pg_catalog.jsonb_build_object('draft', 'too_few_ranked');
  end if;
  return pg_catalog.jsonb_build_object('draft', 'created',
    'editionId', app_private.pepites_create_draft(v_run.id, v_local::date, null));
end;
$$;

create or replace function app_private.pepites_tick_daily(p_season_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := app_private.morocco_local_date(p_now);
  v_sweep jsonb;
  v_expired integer;
  v_run_id uuid;
  v_replay jsonb;
begin
  update app_private.pepites_settings set last_daily_on = v_today
  where id and last_daily_on is distinct from v_today;
  if not found then
    return pg_catalog.jsonb_build_object('daily', 'done_today');
  end if;
  v_sweep := app_private.data_desk_sweep(p_season_id);
  v_expired := app_private.expire_player_photo_releases(v_today);
  select run.id into v_run_id
  from app.pepites_runs run
  where run.activated_at is not null
  order by pg_catalog.random()
  limit 1;
  if v_run_id is not null then
    v_replay := app_private.pepites_replay(v_run_id);
    if not (v_replay ->> 'matches')::boolean then
      perform app_private.pepites_notify('replay:' || v_run_id || ':' || v_today, 'rejeu différent',
        format('Le rejeu du calcul %s ne retrouve pas les scores enregistrés : %s', v_run_id, v_replay));
    end if;
  end if;
  return pg_catalog.jsonb_build_object('daily', 'ran', 'sweep', v_sweep, 'photosExpired', v_expired,
    'replayedRunId', v_run_id, 'replay', v_replay);
end;
$$;

create or replace function app_private.pepites_tick(p_now timestamptz default statement_timestamp())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings app_private.pepites_settings%rowtype;
  v_season_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_step jsonb;
  v_previous_actor text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('pepites_tick', 0)) then
    return pg_catalog.jsonb_build_object('outcome', 'busy');
  end if;
  select * into v_settings from app_private.pepites_settings where id;
  if v_settings.mode = 'off' then
    return pg_catalog.jsonb_build_object('outcome', 'off');
  end if;
  v_season_id := app_private.pepites_current_season();
  if v_season_id is null then
    return pg_catalog.jsonb_build_object('outcome', 'no_season');
  end if;
  v_previous_actor := app_private.pepites_set_actor(null);

  -- Each step in its own subtransaction: one failing step does not undo or
  -- block the others; the error is logged and the next tick tries again.
  begin
    v_step := app_private.pepites_tick_runs(v_season_id, p_now);
    v_result := v_result || pg_catalog.jsonb_build_object('runs', v_step);
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'runs', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  begin
    v_step := app_private.pepites_tick_draft(v_season_id, p_now);
    v_result := v_result || v_step;
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'draft', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  begin
    v_step := app_private.pepites_tick_publish(v_season_id, p_now);
    v_result := v_result || v_step;
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'publish', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  begin
    v_step := app_private.pepites_tick_daily(v_season_id, p_now);
    v_result := v_result || v_step;
  exception when others then
    v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step', 'daily', 'error', left(sqlstate || ': ' || sqlerrm, 500)));
  end;
  perform app_private.pepites_restore_actor(v_previous_actor);

  v_result := v_result || pg_catalog.jsonb_build_object('outcome',
    case when jsonb_array_length(v_errors) > 0 then 'partial' else 'ok' end, 'errors', v_errors);
  if jsonb_array_length(v_errors) > 0
    or coalesce(v_result #>> '{runs,run}', 'unchanged') not in ('unchanged', 'gave_up')
    or v_result ->> 'draft' = 'created'
    or jsonb_array_length(coalesce(v_result -> 'publish', '[]'::jsonb)) > 0
    or v_result ->> 'daily' = 'ran'
  then
    insert into app_private.pepites_job_log (kind, outcome, detail, error)
    values ('tick', v_result ->> 'outcome', v_result,
      case when jsonb_array_length(v_errors) > 0 then left(v_errors::text, 2000) end);
  end if;
  if jsonb_array_length(v_errors) > 0 then
    perform app_private.pepites_notify('tick_error:' || app_private.morocco_local_date(p_now),
      'erreur du passage automatique', left(v_errors::text, 3000));
  end if;
  return v_result;
end;
$$;

revoke all on function app_private.pepites_local_at(date, time) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_create_draft(uuid, date, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick_draft(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick_daily(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_tick(timestamptz) from public, anon, authenticated, service_role;
grant execute on function app_private.pepites_tick(timestamptz) to postgres;

comment on function app_private.pepites_tick(timestamptz) is
  'Run every 15 minutes by the pg_cron job pepites-tick. Writes nothing while pepites_settings.mode = off. A second concurrent tick exits at once (outcome busy).';
$bg_20261016090300_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016090300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016090300'
  );
begin
  if encode(sha256(convert_to(part_20261016090300, 'UTF8')), 'hex')
    is distinct from '361d45534508898e4514ddff947f157f24e184426ff96933aab3b57dbec9df34' then
    raise exception 'stop: 20261016090300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016090300;
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
  needle text;
  leaked boolean;
  baseline text;
begin

  -- Each function is the migration's, with the attributes, privileges and comment it had.
  for fn in
    select * from (values
      ('app_private.pepites_local_at(date,time without time zone)', 'ce0643b1ccdb2057f06a6902a8a5b3ca', '3f87e5890d6daf41cc8f67e73a409b2a', false, 's', 'sql', true, '{}'::text[]),
      ('app_private.pepites_create_draft(uuid,date,uuid)', 'cde742e7e12d1e96068a8a8bafa02241', 'db86e49066825cf790acc52548c38756', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.pepites_tick_draft(uuid,timestamp with time zone)', 'b60594c0e911046b90a09e693191f711', '8f1b6c44e6dd323b8b037f4195f408f9', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.pepites_tick_daily(uuid,timestamp with time zone)', '2c64fe50db39e0dd7319b92fabb3b55a', '7f7bdedbc64c7a54a1171aeada278746', true, 'v', 'plpgsql', true, '{}'::text[]),
      ('app_private.pepites_tick(timestamp with time zone)', '783bb9cd9bf6d9364808f7a43c4667fc', 'c8647ef7e6d49e034023e535da7c9cf1', true, 'v', 'plpgsql', true, '{}'::text[])
    ) v(sig, old_md5, new_md5, secdef, vol, lang, search_path_empty, holders)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if md5(def.prosrc) is distinct from fn.new_md5 then
      problems := problems || (fn.sig || ' is not the new source')::text;
    end if;
    if def.prosecdef <> fn.secdef or def.provolatile <> fn.vol or def.lanname <> fn.lang
      or (def.proconfig is not distinct from array['search_path=""']) <> fn.search_path_empty then
      problems := problems || (fn.sig || ' changed its attributes')::text;
    end if;
  end loop;
  for fn in
    select v.sig, v.required, v.forbidden from (values
      ('app_private.pepites_local_at(date,time without time zone)', '["app_private.morocco_instant("]'::jsonb, '["Africa/Casablanca","at time zone"]'::jsonb),
      ('app_private.pepites_create_draft(uuid,date,uuid)', '["app_private.morocco_local("]'::jsonb, '["Africa/Casablanca","at time zone"]'::jsonb),
      ('app_private.pepites_tick_draft(uuid,timestamp with time zone)', '["app_private.morocco_local("]'::jsonb, '["Africa/Casablanca","at time zone"]'::jsonb),
      ('app_private.pepites_tick_daily(uuid,timestamp with time zone)', '["app_private.morocco_local_date("]'::jsonb, '["Africa/Casablanca","at time zone"]'::jsonb),
      ('app_private.pepites_tick(timestamp with time zone)', '["app_private.morocco_local_date("]'::jsonb, '["Africa/Casablanca","at time zone"]'::jsonb)
    ) v(sig, required, forbidden)
  loop
    select p.prosrc into def from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    for needle in select jsonb_array_elements_text(fn.required) loop
      if position(needle in def.prosrc) = 0 then
        problems := problems || (fn.sig || ' no longer contains ' || needle)::text;
      end if;
    end loop;
    for needle in select jsonb_array_elements_text(fn.forbidden) loop
      if position(needle in def.prosrc) > 0 then
        problems := problems || (fn.sig || ' still contains ' || needle)::text;
      end if;
    end loop;
  end loop;
  select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '-') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '-'), ',' order by p.oid::regprocedure::text), '')) into baseline
  from pg_catalog.pg_proc p
  where p.oid in (to_regprocedure('app_private.pepites_local_at(date,time without time zone)'), to_regprocedure('app_private.pepites_create_draft(uuid,date,uuid)'), to_regprocedure('app_private.pepites_tick_draft(uuid,timestamp with time zone)'), to_regprocedure('app_private.pepites_tick_daily(uuid,timestamp with time zone)'), to_regprocedure('app_private.pepites_tick(timestamp with time zone)'));
  if baseline is distinct from current_setting('bg.morocco_acl_comment_before', true) then
    problems := problems || 'the privileges or the comments of a replaced function moved'::text;
  end if;

  if app_private.morocco_local(timestamptz '2026-10-15 12:00+00') is distinct from timestamp '2026-10-15 12:00:00'
    or app_private.morocco_local(timestamptz '2026-09-20 00:59:59+00') is distinct from timestamp '2026-09-20 01:59:59'
    or app_private.morocco_local(timestamptz '2026-09-20 01:00:00+00') is distinct from timestamp '2026-09-20 01:00:00'
    or app_private.morocco_local(timestamptz '2026-03-10 12:00+00') is distinct from timestamp '2026-03-10 12:00:00'
    or app_private.morocco_local(timestamptz '2026-01-15 12:00+00') is distinct from timestamp '2026-01-15 13:00:00'
    or app_private.morocco_local(timestamptz '2027-02-10 12:00+00') is distinct from timestamp '2027-02-10 12:00:00' then
    raise exception 'stop: the Morocco clock helpers do not give the application''s answers';
  end if;
  if app_private.morocco_instant(timestamp '2026-10-15 12:00') is distinct from timestamptz '2026-10-15 12:00+00'
    or app_private.morocco_instant(timestamp '2026-09-20 00:30') is distinct from timestamptz '2026-09-19 23:30+00'
    or app_private.morocco_day_start(date '2026-09-20') is distinct from timestamptz '2026-09-19 23:00+00'
    or app_private.morocco_day_end(date '2026-09-20') is distinct from timestamptz '2026-09-21 00:00+00'
    or app_private.morocco_local_date(timestamptz '2026-10-15 23:30+00') is distinct from date '2026-10-15' then
    raise exception 'stop: the Morocco day helpers do not give the application''s answers';
  end if;
  if app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Africa/Casablanca') is distinct from timestamp '2026-10-12 18:30:00'
    or app_private.zone_local(timestamptz '2026-10-12 18:30+00', 'Europe/Paris') is distinct from timestamp '2026-10-12 20:30:00'
    or app_private.zone_instant(timestamp '2026-10-12 20:00', 'Europe/Paris') is distinct from timestamptz '2026-10-12 18:00+00' then
    raise exception 'stop: the zone helpers do not give the expected answers';
  end if;
  if app_private.pepites_local_at(date '2026-10-19', time '20:00') is distinct from timestamptz '2026-10-19 20:00+00'
    or app_private.pepites_local_at(date '2026-10-19', time '12:00') is distinct from timestamptz '2026-10-19 12:00+00'
    or app_private.pepites_local_at(date '2026-09-14', time '20:00') is distinct from timestamptz '2026-09-14 19:00+00' then
    raise exception 'stop: pepites_local_at does not follow Morocco''s clock';
  end if;

  if (select coalesce((select md5(to_jsonb(s)::text) from app_private.pepites_settings s limit 1), '')) is distinct from current_setting('bg.morocco_watched_0_before', true) then
    problems := problems || 'pepites_settings moved'::text;
  end if;
  if (select coalesce((select md5(string_agg(e::text, ',' order by e.id)) from app.pepites_editions e), '')) is distinct from current_setting('bg.morocco_watched_1_before', true) then
    problems := problems || 'pepites_editions moved'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j) is distinct from current_setting('bg.morocco_cron_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090300') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'after: the Pépites times of day check out';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016090300')
    then 'Applied. Migration 20261016090300 is recorded; morocco time pepites is in place. Run the post-checks in docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md.'
  else 'Rehearsal passed. Nothing was saved.'
      || ' The weekly Top 10 for Monday 2026-10-19 at 20:00 Moroccan time is scheduled for '
      || app_private.pepites_local_at(date '2026-10-19', time '20:00')::text
      || ' by the function as it stands now; the right answer is 2026-10-19 20:00:00+00 (helper: '
      || app_private.morocco_instant(timestamp '2026-10-19 20:00')::text || ').'
      || ' Change rollback; to commit; and run again.'
end as result;
