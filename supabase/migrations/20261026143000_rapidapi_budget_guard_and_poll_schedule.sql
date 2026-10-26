-- BotolaGO Production V2
-- RapidAPI overspend fix: quota window and budget guard, a fixed back-off for
-- the Fantasy rating polls, a post-match details schedule, and a quieter season
-- refresh. Documentation: docs/backend/SOFASCORE_LIVE_EDGE.md (budget section).
--
-- Why. On 2026-10-25 two matches cost 4,000 calls. Every rating candidate made
-- app_private.football_live_refresh_tick() fire every 60 seconds (polling every
-- 5 minutes for 6 hours, 30 minutes for 2 days, then every 2 hours, whether or
-- not the ratings were already complete), and each of those calls also read the
-- live feed, the details of every fixture finalized in the last 2 hours, and the
-- catch-up fetch of native-rating fixtures that never get an observation.
--
-- What changes:
--   1. app_private.rapidapi_budget_settings: soft limit (default 8,500), hard
--      limit (9,700), the day of the month the plan resets (default 10), a
--      manual offset for calls made but never counted, the seconds between live
--      polls (default 120 until the 10 Nov reset, then 60; allowed 60-300) and the hours between season refreshes near a match
--      (default 1) and on a quiet day (default 3; 0 = the daily pass only). Set with
--      app_private.rapidapi_budget_configure. The Edge client reads them through
--      api.service_rapidapi_budget and refuses calls above the limits. Past the
--      soft limit the live poll is stretched to at least 180 seconds.
--   2. app_private.rapidapi_calls_this_month() (so the rapidapi_budget health
--      check and the staged-stats stop) and api.admin_rapidapi_calls_this_month()
--      count from the most recent reset day, plus the offset.
--   3. app_private.fantasy_api_rating_candidates(): a poll is due at fixed
--      back-off marks after full time (15 min, 1 h, 3 h, 12 h, 24 h, 48 h, 4 d,
--      7 d, 14 d), only while the latest rating source of the fixture is not
--      complete. A failed attempt is retried every 30 minutes for at most 6
--      hours after the mark.
--   4. app_private.football_live_refresh_tick() no longer looks at rating
--      candidates. The new pg_cron job fantasy-rating-polls (every 5 minutes)
--      wakes the Edge Function with {"job":"rating_polls"} only when a poll is
--      due; that job reads no live feed.
--   5. api.service_football_details_schedule(): which finished fixtures are due
--      their +30 min / +90 min details follow-up, and when details were last
--      stored (app_private.football_match_details_syncs).
--   6. app_private.football_season_refresh_tick(): hourly while a fixture is
--      within a day either side of now; otherwise every 3 hours (03:00 UTC is
--      one of them, so the daily full-season pass stays). Six hours would trip
--      the provider_refresh health check, which fails after 4 hours.
--
-- Every replaced body is checked against the digest of production's current
-- body first, and the migration stops if production differs.

do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'app_private.football_live_refresh_tick()'::regprocedure))
       <> '0acfb7f3c2c6123d553da94e2674fc8c'
    or md5((select prosrc from pg_proc where oid = 'app_private.fantasy_api_rating_candidates()'::regprocedure))
       <> '1f82c895a8b4ba951078a8461dde6a34'
    or md5((select prosrc from pg_proc where oid = 'app_private.football_season_refresh_tick()'::regprocedure))
       <> 'a3613767b0c7f4b35ef3be4676461dca'
    or md5((select prosrc from pg_proc where oid = 'app_private.rapidapi_calls_this_month()'::regprocedure))
       <> '562d08db95a860695a4da951fc21a644'
    or md5((select prosrc from pg_proc where oid = 'api.admin_rapidapi_calls_this_month()'::regprocedure))
       <> 'c226a598487114f2a9a5541f1ceb2c1d' then
    raise exception 'rapidapi_budget_unexpected_baseline';
  end if;
end
$guard$;

-- 1. Settings -----------------------------------------------------------------

create table app_private.rapidapi_budget_settings (
  id boolean primary key default true check (id),
  soft_limit integer not null default 8500 check (soft_limit between 0 and 1000000),
  hard_limit integer not null default 9700 check (hard_limit between 0 and 1000000),
  -- 1-31; a month with fewer days resets on its last day.
  reset_day_of_month integer not null default 10 check (reset_day_of_month between 1 and 31),
  -- Calls the provider counted that app_private.rapidapi_call_counts did not
  -- (the counter has rows from 2026-10-14 only). Added to every total.
  used_offset integer not null default 0 check (used_offset >= 0),
  -- Seconds between live polls while a match is in play. 120 for the cycle that
  -- ends on the 10 Nov reset; set it back to 60 afterwards.
  live_interval_seconds integer not null default 120 check (live_interval_seconds between 60 and 300),
  -- Hours between season refreshes when no fixture is within a day; 0 = the
  -- daily pass (03:00 UTC) only.
  season_quiet_hours integer not null default 3 check (season_quiet_hours between 0 and 24),
  -- Hours between season refreshes while a fixture is within a day either side.
  season_match_hours integer not null default 1 check (season_match_hours between 1 and 24),
  updated_at timestamptz not null default statement_timestamp(),
  constraint rapidapi_budget_settings_order check (soft_limit <= hard_limit)
);
comment on table app_private.rapidapi_budget_settings is
  'One row. The RapidAPI budget guard: above soft_limit the Edge client sends only the live feed and incidents (and the live poll slows to 180 s or more), at hard_limit nothing. The window starts on reset_day_of_month (UTC) and used_offset is added to the counted calls. live_interval_seconds and season_quiet_hours set the cadences. Written only by app_private.rapidapi_budget_configure.';
alter table app_private.rapidapi_budget_settings enable row level security;
alter table app_private.rapidapi_budget_settings force row level security;
revoke all on app_private.rapidapi_budget_settings from public, anon, authenticated, service_role;
insert into app_private.rapidapi_budget_settings (id) values (true);

-- Owner-run: null leaves a value as it is.
--   select app_private.rapidapi_budget_configure(null, null, 10);        -- reset day
--   select app_private.rapidapi_budget_configure(p_used_offset => 470);   -- uncounted calls
--   select app_private.rapidapi_budget_configure(p_live_interval => 180); -- live poll seconds
--   select app_private.rapidapi_budget_configure(p_season_quiet_hours => 0); -- daily pass only
--   select app_private.rapidapi_budget_configure(p_season_match_hours => 6);  -- near a match
create function app_private.rapidapi_budget_configure(
  p_soft_limit integer default null,
  p_hard_limit integer default null,
  p_reset_day integer default null,
  p_used_offset integer default null,
  p_live_interval integer default null,
  p_season_quiet_hours integer default null,
  p_season_match_hours integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s app_private.rapidapi_budget_settings%rowtype;
begin
  update app_private.rapidapi_budget_settings
  set soft_limit = coalesce(p_soft_limit, soft_limit),
      hard_limit = coalesce(p_hard_limit, hard_limit),
      reset_day_of_month = coalesce(p_reset_day, reset_day_of_month),
      used_offset = coalesce(p_used_offset, used_offset),
      live_interval_seconds = coalesce(p_live_interval, live_interval_seconds),
      season_quiet_hours = coalesce(p_season_quiet_hours, season_quiet_hours),
      season_match_hours = coalesce(p_season_match_hours, season_match_hours),
      updated_at = statement_timestamp()
  where id
  returning * into s;
  return jsonb_build_object('softLimit', s.soft_limit, 'hardLimit', s.hard_limit,
    'resetDayOfMonth', s.reset_day_of_month, 'usedOffset', s.used_offset,
    'liveIntervalSeconds', s.live_interval_seconds, 'seasonQuietHours', s.season_quiet_hours,
    'seasonMatchHours', s.season_match_hours,
    'effectiveLiveIntervalSeconds', app_private.rapidapi_live_interval_seconds(),
    'windowStart', app_private.rapidapi_window_start(), 'used', app_private.rapidapi_calls_this_month());
end;
$$;
revoke all on function app_private.rapidapi_budget_configure(integer, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;

-- 2. The quota window -----------------------------------------------------------

-- The most recent reset day on or before today (UTC).
create function app_private.rapidapi_window_start(p_at timestamptz default statement_timestamp())
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reset integer;
  v_day date := (p_at at time zone 'utc')::date;
  v_month date := date_trunc('month', v_day::timestamp)::date;
  v_start date;
  v_previous date;
begin
  select reset_day_of_month into v_reset from app_private.rapidapi_budget_settings where id;
  v_reset := coalesce(v_reset, 10);
  v_start := v_month + (least(v_reset,
    extract(day from (v_month + interval '1 month' - interval '1 day'))::integer) - 1);
  if v_day >= v_start then
    return v_start;
  end if;
  v_previous := (v_month - interval '1 month')::date;
  return v_previous + (least(v_reset,
    extract(day from (v_previous + interval '1 month' - interval '1 day'))::integer) - 1);
end;
$$;
revoke all on function app_private.rapidapi_window_start(timestamptz)
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_window_start(timestamptz) is
  'First day (UTC) of the RapidAPI quota window containing p_at: the most recent reset_day_of_month, clamped to the last day of a short month.';

create or replace function app_private.rapidapi_calls_this_month()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.calls), 0)::bigint
    + coalesce((select b.used_offset from app_private.rapidapi_budget_settings b where b.id), 0)
  from app_private.rapidapi_call_counts c
  where c.day >= app_private.rapidapi_window_start();
$$;
revoke all on function app_private.rapidapi_calls_this_month()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_calls_this_month() is
  'RapidAPI requests counted in the current quota window (since the most recent reset day, UTC), all jobs and endpoints, plus the manual offset in app_private.rapidapi_budget_settings.';

-- The seconds between live polls: the setting, and at least 180 once the
-- counted calls reached the soft limit.
create function app_private.rapidapi_live_interval_seconds()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when app_private.rapidapi_calls_this_month() >= b.soft_limit
      then greatest(b.live_interval_seconds, 180) else b.live_interval_seconds end
  from app_private.rapidapi_budget_settings b where b.id;
$$;
revoke all on function app_private.rapidapi_live_interval_seconds()
  from public, anon, authenticated, service_role;
comment on function app_private.rapidapi_live_interval_seconds() is
  'Seconds between live football polls while a match is in play: live_interval_seconds, and at least 180 once the counted RapidAPI calls reached the soft limit.';

create or replace function api.admin_rapidapi_calls_this_month()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date := app_private.rapidapi_window_start();
  s app_private.rapidapi_budget_settings%rowtype;
begin
  perform app_private.admin_assert_permission('football.read_operations');
  select * into s from app_private.rapidapi_budget_settings where id;
  return jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'windowStart', v_start,
    'windowEnd', app_private.rapidapi_window_start(((v_start + 31)::timestamp at time zone 'utc')),
    'monthlyLimit', 10000,
    'warnAt', 8000,
    'failAt', 9500,
    'softLimit', s.soft_limit,
    'hardLimit', s.hard_limit,
    'usedOffset', s.used_offset,
    'liveIntervalSeconds', s.live_interval_seconds,
    'effectiveLiveIntervalSeconds', app_private.rapidapi_live_interval_seconds(),
    'seasonQuietHours', s.season_quiet_hours,
    'seasonMatchHours', s.season_match_hours,
    'total', app_private.rapidapi_calls_this_month(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('job', r.job, 'endpoint', r.endpoint, 'calls', r.calls)
        order by r.job, r.endpoint)
      from (
        select c.job, c.endpoint, sum(c.calls)::bigint as calls
        from app_private.rapidapi_call_counts c
        where c.day >= v_start
        group by c.job, c.endpoint
      ) r
    ), '[]'::jsonb));
end;
$$;
revoke all on function api.admin_rapidapi_calls_this_month()
  from public, anon, authenticated, service_role;
grant execute on function api.admin_rapidapi_calls_this_month() to authenticated;
comment on function api.admin_rapidapi_calls_this_month() is
  'Staff (football.read_operations), read only: RapidAPI requests counted in the current quota window (since the most recent reset day), in total and by job and endpoint, with the budget guard''s limits.';

-- What the Edge client reads once per run.
create function api.service_rapidapi_budget()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s app_private.rapidapi_budget_settings%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into s from app_private.rapidapi_budget_settings where id;
  return jsonb_build_object('used', app_private.rapidapi_calls_this_month(),
    'softLimit', s.soft_limit, 'hardLimit', s.hard_limit,
    'liveIntervalSeconds', app_private.rapidapi_live_interval_seconds(),
    'windowStart', app_private.rapidapi_window_start());
end;
$$;
revoke all on function api.service_rapidapi_budget() from public, anon, authenticated;
grant execute on function api.service_rapidapi_budget() to service_role;
comment on function api.service_rapidapi_budget() is
  'Service role: calls counted in the current RapidAPI quota window (plus the manual offset), the soft and the hard limit, the effective live poll interval and the window start. Read by the Edge client''s budget guard.';

-- 3. Rating polls on a fixed back-off ---------------------------------------------

-- Same joins and gameweek rules as before. New: the poll is due at the latest
-- back-off mark that has passed if nothing was fetched since that mark, and
-- never once the fixture's latest rating source is complete. A failed attempt is
-- retried every 30 minutes, for 6 hours after the mark at most.
create or replace function app_private.fantasy_api_rating_candidates()
returns table(id uuid, external_id text, finalized_at timestamptz, last_attempt_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
 select e.id,e.external_id,e.finalized_at,e.last_attempt_at from (
 select distinct f.id,m.external_id,f.finalized_at,poll.last_fetched_at,poll.last_attempt_at,
 (select max(mark.step) from unnest(array[interval '15 minutes',interval '1 hour',interval '3 hours',
   interval '12 hours',interval '24 hours',interval '48 hours',interval '4 days',interval '7 days',
   interval '14 days']) as mark(step)
  where f.finalized_at+mark.step<=statement_timestamp()) as due_mark
 from app.fixtures f join app.fantasy_fixture_assignments a on a.fixture_id=f.id and a.superseded_at is null
 join app.fantasy_gameweeks g on g.id=a.gameweek_id
 left join app_private.fantasy_api_rating_seasons p on p.season_id=g.fantasy_season_id
 join app_private.football_provider_mappings m on m.provider_name='sofascore' and m.entity_type='fixture' and m.active and m.internal_entity_id=f.id
 left join app_private.fantasy_api_rating_polls poll on poll.fixture_id=f.id
 where f.status='finished' and f.finalized_at is not null and (
  (g.status in ('live','provisional')and p.season_id is not null and g.sequence_number>=p.from_gameweek)
  or(g.status in ('finalized','corrected')and exists(
   select 1 from app_private.fantasy_current_rating_publications publication
   where publication.gameweek_id=g.id and not publication.complete)))
 and not coalesce((select latest.ready from app_private.fantasy_api_rating_sources latest
  where latest.fixture_id=f.id order by latest.id desc limit 1),false)
 ) e where e.due_mark is not null
 and statement_timestamp()<e.finalized_at+e.due_mark+interval '6 hours'
 and (e.last_fetched_at is null or e.last_fetched_at<e.finalized_at+e.due_mark)
 and (e.last_attempt_at is null or e.last_attempt_at<statement_timestamp()-interval '30 minutes');
$$;
revoke all on function app_private.fantasy_api_rating_candidates() from public,anon,authenticated,service_role;
comment on function app_private.fantasy_api_rating_candidates() is
  'Finished Fantasy fixtures whose rating poll is due: a fixed back-off after full time (15 min, 1 h, 3 h, 12 h, 24 h, 48 h, 4 d, 7 d, 14 d), none once the latest rating source is complete, failed attempts retried every 30 minutes for 6 hours after a mark.';

-- 4. The live tick stops listening to rating candidates -----------------------------

do $patch$
declare
  source text;
begin
  source := pg_get_functiondef('app_private.football_live_refresh_tick()'::regprocedure);
  if position('select case when exists(select 1 from app_private.fantasy_api_rating_candidates()) then interval ''60 seconds''' in source) = 0 then
    raise exception 'rapidapi_budget_tick_anchor_missing';
  end if;
  source := replace(source,
    'select case when exists(select 1 from app_private.fantasy_api_rating_candidates()) then interval ''60 seconds''',
    'select case');
  if position('fantasy_api_rating_candidates' in source) <> 0
    or (length(source) - length(replace(source, 'then interval ''60 seconds''', ''))) <> length('then interval ''60 seconds''') then
    raise exception 'rapidapi_budget_tick_patch_incomplete';
  end if;
  -- The in play clause is the one 60 second cadence left.
  source := replace(source, 'then interval ''60 seconds''',
    'then make_interval(secs => app_private.rapidapi_live_interval_seconds())');
  execute source;
end
$patch$;
comment on function app_private.football_live_refresh_tick() is
  'Live-football cadence and guards: every live_interval_seconds (120 for now, 60 normally; 180 or more past the soft limit) in play, 2 min when delayed or just kicked off, 5 min before kick-off, 30 min for 2 hours after full time. Rating polls no longer wake it (fantasy-rating-polls does).';

create or replace function app_private.fantasy_rating_polls_tick()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  request bigint;
begin
  select * into settings from app_private.notification_email_settings where id;
  if not coalesce(settings.football_live_refresh_enabled, false) or settings.functions_base_url is null then
    return 'disabled';
  end if;
  if app_private.football_data_source() <> 'sofascore' then
    return 'skipped_source';
  end if;
  if not exists (select 1 from app_private.fantasy_api_rating_candidates()) then
    return 'idle';
  end if;
  request := app_private.invoke_scheduled_function(
    settings.functions_base_url, 'football-live-refresh', jsonb_build_object('job', 'rating_polls')
  );
  if request is null then
    return 'not_configured';
  end if;
  return 'invoked';
end;
$$;
revoke all on function app_private.fantasy_rating_polls_tick()
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_rating_polls_tick() is
  'pg_cron entry point (every 5 minutes): while the live refresh switch is on and the data source is sofascore, calls the Edge Function football-live-refresh with {"job":"rating_polls"} only when a rating poll is due. That job reads no live feed. Writes nothing itself.';

select cron.schedule(
  'fantasy-rating-polls',
  '*/5 * * * *',
  'select app_private.fantasy_rating_polls_tick();'
);

-- 5. Post-match details schedule ------------------------------------------------------

-- followUps: finished fixtures whose +30 min or +90 min mark has passed with no
-- details stored since that mark (within 3 hours of full time).
-- lastStored: when details were last stored, for fixtures in play or finished
-- within 3 hours, by SofaScore event id.
create function api.service_football_details_schedule()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return jsonb_build_object(
    'followUps', (
      select coalesce(jsonb_agg(x.external_id order by x.external_id), '[]'::jsonb)
      from (
        select m.external_id,
          (select max(mark.step) from (values (interval '30 minutes'), (interval '90 minutes')) as mark(step)
            where f.finalized_at + mark.step <= v_now) as due_mark,
          sync.last_stored_at, f.finalized_at
        from app.fixtures f
        join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
          and m.entity_type = 'fixture' and m.active and m.internal_entity_id = f.id
        left join app_private.football_match_details_syncs sync on sync.fixture_id = f.id
        where f.status = 'finished' and f.finalized_at is not null
          and f.finalized_at > v_now - interval '3 hours'
      ) x
      where x.due_mark is not null
        and (x.last_stored_at is null or x.last_stored_at < x.finalized_at + x.due_mark)
    ),
    'lastStored', (
      select coalesce(jsonb_object_agg(m.external_id, sync.last_stored_at), '{}'::jsonb)
      from app.fixtures f
      join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
        and m.entity_type = 'fixture' and m.active and m.internal_entity_id = f.id
      join app_private.football_match_details_syncs sync on sync.fixture_id = f.id
      where f.status in ('live_first_half', 'half_time', 'live_second_half', 'extra_time', 'penalties')
         or (f.status = 'finished' and f.finalized_at > v_now - interval '3 hours')
    ));
end;
$$;
revoke all on function api.service_football_details_schedule() from public, anon, authenticated;
grant execute on function api.service_football_details_schedule() to service_role;
comment on function api.service_football_details_schedule() is
  'Service role: SofaScore event ids of finished fixtures due their +30 min / +90 min details follow-up, and when details were last stored for fixtures in play or finished within 3 hours. Read by the live refresh.';

-- 6. Season refresh: hourly near a match, every 3 hours otherwise -----------------------

create or replace function app_private.football_season_refresh_tick()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  beat app_private.football_season_refresh_heartbeat%rowtype;
  now_at timestamptz := statement_timestamp();
  match_near boolean;
  quiet_hours integer;
  match_hours integer;
  outcome text;
begin
  select * into settings from app_private.notification_email_settings where id;
  select * into beat from app_private.football_season_refresh_heartbeat where id for update;
  if not coalesce(settings.football_live_refresh_enabled, false) or settings.functions_base_url is null then
    if beat.last_outcome <> 'disabled' then
      update app_private.football_season_refresh_heartbeat
      set last_invoked_at = null, last_outcome = 'disabled', updated_at = now_at
      where id;
    end if;
    return 'disabled';
  end if;

  -- Every season_match_hours (once an hour by default) while a fixture of the
  -- current season is within a day either side of now. pg_cron can start a tick a few seconds late; two minutes of
  -- slack keeps the hour from slipping to seventy minutes.
  select exists (
    select 1 from app.fixtures fixture
    join app.seasons season on season.id = fixture.season_id and season.is_current
    where fixture.kickoff_at between now_at - interval '1 day' and now_at + interval '1 day'
  ) into match_near;
  if match_near then
    select season_match_hours into match_hours from app_private.rapidapi_budget_settings where id;
    match_hours := coalesce(match_hours, 1);
    if beat.last_invoked_at is not null
      and beat.last_invoked_at > now_at - match_hours * interval '1 hour' + interval '2 minutes' then
      return 'waiting';
    end if;
  else
    -- Otherwise every season_quiet_hours (3 by default) at 00, 03, 06 ... UTC,
    -- never closer than half an hour less than that to the last call, and always
    -- at 03:00 UTC, which carries the daily full-season pass. 0 means that
    -- daily pass only. Not six hours: the provider_refresh health check fails
    -- after four without a season refresh.
    select season_quiet_hours into quiet_hours from app_private.rapidapi_budget_settings where id;
    quiet_hours := coalesce(quiet_hours, 3);
    -- Never called yet, or just switched back on: call at once.
    if beat.last_invoked_at is not null and not (
      (extract(hour from now_at at time zone 'utc')::integer = 3
        and (beat.last_invoked_at is null or beat.last_invoked_at <= now_at - interval '2 hours'))
      or (quiet_hours > 0
        and extract(hour from now_at at time zone 'utc')::integer % quiet_hours = 0
        and (beat.last_invoked_at is null
          or beat.last_invoked_at <= now_at - (quiet_hours * interval '1 hour' - interval '30 minutes')))
    ) then
      return 'waiting';
    end if;
  end if;

  -- A live call still running: try again at the next tick, 10 minutes on.
  outcome := app_private.football_refresh_invoke(settings.functions_base_url, 'season_fixtures');
  if outcome <> 'invoked' then
    return outcome;
  end if;
  update app_private.football_season_refresh_heartbeat
  set last_invoked_at = now_at, last_outcome = 'invoked',
      -- Switched back on: the hours it was off are not the refresh's fault.
      counting_from = case when beat.last_outcome = 'disabled' then now_at else beat.counting_from end,
      updated_at = now_at
  where id;
  return 'invoked';
end;
$$;
revoke all on function app_private.football_season_refresh_tick() from public, anon, authenticated, service_role;
comment on function app_private.football_season_refresh_tick() is
  'pg_cron entry point (every 10 minutes): while the live refresh switch is on, calls the Edge Function football-live-refresh with {"job":"season_fixtures"} (yesterday to six weeks ahead) every season_match_hours (hourly by default) when a fixture is within a day either side of now, otherwise every season_quiet_hours (3 by default; 0 = the 03:00 UTC daily pass only), never while a live call is running (app_private.football_refresh_invoke). Never writes fixtures itself.';
