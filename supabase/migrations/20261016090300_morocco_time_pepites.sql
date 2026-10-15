-- Pépites times of day follow Morocco's clock.
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
