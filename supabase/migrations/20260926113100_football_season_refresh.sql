-- Season fixtures refreshed from the provider every hour by the database, and
-- a stale season that pages.
--
-- Audit 2026-09-26: only the GitHub Fantasy season orchestrator read the
-- season's fixtures beyond tomorrow from SportsMonks, and GitHub started its
-- hourly schedule 3.1 to 6.3 h apart. Meanwhile nothing failed: the watchdog
-- waits 8 h for an orchestrator run, and `provider_refresh` only warned, after
-- 12 h without any fixture refresh, which the live refresh's own three-day
-- runs kept fresh on match days. A kickoff moved or a match postponed at the
-- provider could stay wrong in the app, and in the Fantasy calendar the 5
-- minute lifecycle tick builds from it, for hours behind green checks. On
-- 2026-09-26 at 11:30 UTC production's `provider_refresh` read ok on a last
-- fixture refresh at 07:37 UTC, nearly four hours old.
--
--   * app_private.football_season_refresh_tick() (pg_cron
--     `football-season-refresh`, every 10 minutes) calls the Edge Function
--     football-live-refresh with {"job":"season_fixtures"} once an hour:
--     yesterday to six weeks ahead, the same SportsMonks handler, validation
--     and writes as every other fixture refresh. It runs under the live
--     refresh's switch (app_private.notification_email_settings
--     .football_live_refresh_enabled), so what pauses the live refresh before
--     a write to fixtures pauses it too (AGENTS.md).
--   * One fixture refresh from the database at a time
--     (app_private.football_refresh_invoke): the season call waits while a
--     live call is still running, and the live refresh waits while a season
--     call is (`busy`, tried again at its next tick). A call is running until
--     pg_net holds its answer, other than a timeout (pg_net stops waiting
--     after 60 s, the function may not), or for 150 s at most. Each job keeps
--     its own cadence; app_private.football_live_refresh_tick() is
--     20260925141500's but for that. Every fixture write already takes a lock
--     per fixture and keeps the newest provider version, so an overlap never
--     corrupted a row; this keeps the two jobs from working the same fixtures
--     at once. The GitHub orchestrator's refresh is not dispatched from the
--     database and overlaps as it did before, under the same per-fixture lock.
--   * `provider_refresh`, with that switch on, fails once the season's
--     fixtures (a successful run over a week or more reaching today or later)
--     are 4 h old, and warns at 2 h. It counts from when the hourly refresh
--     started or was switched back on, so turning it on does not page for
--     the hours it was off. Everything else in app_private.ops_health_checks()
--     is 20260926003400's, unchanged.
--
-- Deploy the Edge Function football-live-refresh (with the season_fixtures
-- job) before this runs: an older one refuses the job, and the check then
-- fails after 4 h, as it should.

create table app_private.football_season_refresh_heartbeat (
  id boolean primary key default true check (id),
  counting_from timestamptz not null default statement_timestamp(),
  last_invoked_at timestamptz,
  last_outcome text not null default 'never'
    check (last_outcome in ('never', 'invoked', 'disabled')),
  updated_at timestamptz not null default statement_timestamp()
);
comment on table app_private.football_season_refresh_heartbeat is
  'When the hourly season refresh last called the football-live-refresh Edge Function, and from when `provider_refresh` measures its staleness (installed, or last switched back on).';
alter table app_private.football_season_refresh_heartbeat enable row level security;
alter table app_private.football_season_refresh_heartbeat force row level security;
revoke all on app_private.football_season_refresh_heartbeat from public, anon, authenticated, service_role;
insert into app_private.football_season_refresh_heartbeat (id) values (true);

-- The last fixture refresh the database dispatched, whichever job.
create table app_private.football_refresh_dispatch (
  id boolean primary key default true check (id),
  job text check (job in ('fixtures', 'season_fixtures')),
  request_id bigint,
  dispatched_at timestamptz,
  updated_at timestamptz not null default statement_timestamp()
);
comment on table app_private.football_refresh_dispatch is
  'The last call the database made to the football-live-refresh Edge Function (live or season job), so the two never run at once. Written by app_private.football_refresh_invoke only.';
alter table app_private.football_refresh_dispatch enable row level security;
alter table app_private.football_refresh_dispatch force row level security;
revoke all on app_private.football_refresh_dispatch from public, anon, authenticated, service_role;
insert into app_private.football_refresh_dispatch (id) values (true);

-- Calls football-live-refresh for `p_job` unless the other job's last call
-- is still running: 'invoked', 'busy' or 'not_configured'. A job's calls to
-- itself are paced by its own tick, as before.
create or replace function app_private.football_refresh_invoke(p_functions_base_url text, p_job text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  last_call app_private.football_refresh_dispatch%rowtype;
  new_request bigint;
begin
  if p_job is null or p_job not in ('fixtures', 'season_fixtures') then
    raise exception using errcode = '22023', message = 'football_refresh_job_unknown';
  end if;
  select * into last_call from app_private.football_refresh_dispatch where id for update;
  if last_call.job is distinct from p_job
    and last_call.request_id is not null
    and last_call.dispatched_at > statement_timestamp() - interval '150 seconds'
    and not exists (
      select 1 from net._http_response r
      where r.id = last_call.request_id
        and not coalesce(r.timed_out, false)
        and coalesce(r.error_msg, '') not ilike '%timeout%'
    ) then
    return 'busy';
  end if;
  new_request := app_private.invoke_scheduled_function(
    p_functions_base_url, 'football-live-refresh', jsonb_build_object('job', p_job)
  );
  if new_request is null then
    return 'not_configured';
  end if;
  update app_private.football_refresh_dispatch
  set job = p_job, request_id = new_request, dispatched_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id;
  return 'invoked';
end;
$$;
revoke all on function app_private.football_refresh_invoke(text, text) from public, anon, authenticated, service_role;

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

  -- Once an hour. pg_cron can start a tick a few seconds late; two minutes of
  -- slack keeps the hour from slipping to seventy minutes.
  if beat.last_invoked_at is not null
    and beat.last_invoked_at > now_at - interval '1 hour' + interval '2 minutes' then
    return 'waiting';
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
  'pg_cron entry point (every 10 minutes): once an hour, while the live refresh switch is on, calls the Edge Function football-live-refresh with {"job":"season_fixtures"} (yesterday to six weeks ahead), never while a live call is running (app_private.football_refresh_invoke). Never writes fixtures itself.';

select cron.schedule(
  'football-season-refresh',
  '*/10 * * * *',
  'select app_private.football_season_refresh_tick();'
);

-- The live refresh tick: 20260925141500's, but for dispatching through
-- app_private.football_refresh_invoke, which answers 'busy' while a season
-- call is running (the tick then tries again a minute later).
create or replace function app_private.football_live_refresh_tick()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  beat app_private.football_live_refresh_heartbeat%rowtype;
  now_at timestamptz := statement_timestamp();
  cadence interval;
  outcome text;
begin
  select * into settings from app_private.notification_email_settings where id;
  if not settings.football_live_refresh_enabled or settings.functions_base_url is null then
    return 'disabled';
  end if;

  select case
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
        and (
          -- still being played, delayed or interrupted, however long it takes
          -- (bounded, so a fixture the provider never closes cannot keep the
          -- refresh running for ever)
          (fixture.status in ('delayed', 'live_first_half', 'half_time', 'live_second_half',
              'extra_time', 'penalties', 'suspended')
            and fixture.kickoff_at between now_at - interval '24 hours' and now_at + interval '10 minutes')
          -- started without the provider saying so yet
          or (fixture.status in ('scheduled', 'not_started')
            and fixture.kickoff_at between now_at - interval '3 hours' and now_at)
        )
    ) then interval '2 minutes'
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
        and fixture.status in ('scheduled', 'not_started')
        and fixture.kickoff_at > now_at and fixture.kickoff_at <= now_at + interval '10 minutes'
    ) then interval '5 minutes'
    -- just finalized: the match details settle after the whistle
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where fixture.status = 'finished'
        and fixture.finalized_at >= now_at - interval '2 hours'
    ) then interval '15 minutes'
  end into cadence;

  select * into beat from app_private.football_live_refresh_heartbeat where id for update;

  if cadence is null then
    -- Nothing on: forget the last call, so the next match is refreshed at once.
    if beat.last_invoked_at is not null then
      update app_private.football_live_refresh_heartbeat
      set last_invoked_at = null, last_outcome = 'idle', updated_at = now_at
      where id;
    end if;
    return 'idle';
  end if;

  -- pg_cron can start a tick a few seconds late; 20 seconds of slack keeps a
  -- two-minute cadence from slipping to three.
  if beat.last_invoked_at is not null
    and beat.last_invoked_at > now_at - cadence + interval '20 seconds' then
    return 'waiting';
  end if;

  -- A season call still running: try again at the next minute.
  outcome := app_private.football_refresh_invoke(settings.functions_base_url, 'fixtures');
  if outcome <> 'invoked' then
    return outcome;
  end if;
  update app_private.football_live_refresh_heartbeat
  set last_invoked_at = now_at, last_outcome = 'invoked', updated_at = now_at
  where id;
  return 'invoked';
end;
$$;
revoke all on function app_private.football_live_refresh_tick() from public, anon, authenticated, service_role;

-- Health: 20260926003400's checks, unchanged but for `provider_refresh`.
create or replace function app_private.ops_health_checks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  checks jsonb := '[]'::jsonb;
  now_at timestamptz := statement_timestamp();
  tick app_private.fantasy_lifecycle_heartbeat%rowtype;
  tick_enabled boolean;
  overdue record;
  watch jsonb;
  escalations integer;
  doubled record;
  doubled_label text;
  doubled_status text;
  coverage record;
  watched_seasons integer;
  scoring record;
  held_label text;
  held_remedy text;
  scoring_stage text;
  failed_jobs text;
  news_beat timestamptz;
  sitemap record;
  email app_private.notification_email_settings%rowtype;
  email_beat timestamptz;
  dead_letters integer;
  in_play integer;
  upcoming integer;
  last_fixture_run timestamptz;
  last_fixture_ok timestamptz;
  failed_fixture_runs integer;
  last_season_ok timestamptz;
  season_beat app_private.football_season_refresh_heartbeat%rowtype;
  season_refresh_on boolean;
  season_clock timestamptz;
  failed_news_runs integer;
  browser_errors integer;
  top_browser_error text;
  caller_claims text := current_setting('request.jwt.claims', true);
begin
  -- Fantasy: the database tick that locks gameweeks on time.
  select lifecycle_tick_enabled into tick_enabled from app_private.fantasy_automation_settings where id;
  select * into tick from app_private.fantasy_lifecycle_heartbeat where id;
  checks := checks || jsonb_build_object('name', 'fantasy_lifecycle_tick', 'status',
    case
      when not coalesce(tick_enabled, false) then 'warn'
      when tick.last_run_at is null or tick.last_run_at < now_at - interval '15 minutes' then 'fail'
      when tick.consecutive_failures >= 3 then 'fail'
      when tick.consecutive_failures >= 1 then 'warn'
      else 'ok' end,
    'detail',
    case
      when not coalesce(tick_enabled, false) then 'switched off: gameweeks lock only when the GitHub orchestrator runs'
      when tick.last_run_at is null or tick.last_run_at < now_at - interval '15 minutes' then 'no tick for over 15 minutes'
      when tick.consecutive_failures >= 1 then tick.consecutive_failures || ' failed tick(s): ' || coalesce(tick.last_error, 'unknown')
      else 'last tick ' || to_char(tick.last_run_at at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- Fantasy: an open gameweek long past its deadline was the 2026-09-24 signal.
  select g.sequence_number, round(extract(epoch from now_at - g.deadline_at) / 60) as minutes
  into overdue
  from app.fantasy_gameweeks g join app.fantasy_seasons s on s.id = g.fantasy_season_id
  where s.status in ('registration_open', 'active') and g.status = 'open'
    and g.deadline_at < now_at - interval '30 minutes'
  order by g.deadline_at limit 1;
  checks := checks || jsonb_build_object('name', 'fantasy_gameweek_lock', 'status',
    case when overdue.sequence_number is null then 'ok' else 'fail' end, 'detail',
    case when overdue.sequence_number is null then 'no open gameweek past its deadline'
      else 'GW' || overdue.sequence_number || ' deadline passed ' || overdue.minutes || ' min ago, still open' end);

  -- Fantasy: the deadline watch (placeholder kickoffs, no playable fixture).
  if exists (select 1 from app.fantasy_seasons where status in ('planned', 'registration_open', 'active')) then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    begin
      watch := api.service_fantasy_deadline_watch(null, 72, 24);
      select count(*) into escalations
      from jsonb_array_elements(watch -> 'gameweeks') entry where entry ->> 'severity' = 'escalate';
      checks := checks || jsonb_build_object('name', 'fantasy_deadline_watch', 'status',
        case when escalations > 0 then 'fail' else 'ok' end, 'detail',
        case when escalations > 0 then escalations || ' gameweek(s) within 24 h of a deadline that is not authoritative'
          else 'no deadline at risk' end);
    exception when others then
      checks := checks || jsonb_build_object('name', 'fantasy_deadline_watch', 'status', 'warn',
        'detail', 'watch unavailable: ' || left(sqlerrm, 120));
    end;
    perform set_config('request.jwt.claims', coalesce(caller_claims, ''), true);
  end if;

  -- Fantasy seasons the three checks below watch. A season has one gameweek
  -- past its lock at a time (fantasy_gameweeks_one_current_idx), so several
  -- gameweeks at once means several competitions: then a gameweek is named
  -- with its season.
  select count(*) into watched_seasons from app.fantasy_seasons where status in ('registration_open', 'active');

  -- Fantasy: a club twice among the counted matches of a gameweek that has
  -- not locked (20260926003400). The next-gameweek opening takes one match
  -- per club (fantasy_next_calendar_incomplete), and an open gameweek locks
  -- with the club playing twice, a double gameweek nobody decided. The
  -- provider moving a match into a round whose gameweek is staged does it:
  -- one taken out of a locked gameweek (20260926003500), or any other. Warn
  -- at once, naming the gameweek and the club; fail within 24 h of its
  -- deadline, the deadline watch's escalation horizon. The earliest deadline
  -- first, then the club's name; its matches are read for that one alone.
  select count(*) as clubs,
    count(*) filter (where d.deadline_at <= now_at + interval '24 hours') as imminent,
    (array_agg(d.gameweek_id order by d.deadline_at, d.sequence_number, d.club))[1] as gameweek_id,
    (array_agg(d.team_id order by d.deadline_at, d.sequence_number, d.club))[1] as team_id
  into doubled
  from (
    select g.id as gameweek_id, g.deadline_at, g.sequence_number, side.team_id, club.short_name as club
    from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id and s.status in ('registration_open', 'active')
    join app.fantasy_fixture_assignments a on a.gameweek_id = g.id
      and a.superseded_at is null and a.counts_points
    join app.fixtures f on f.id = a.fixture_id
    cross join lateral (values (f.home_team_id), (f.away_team_id)) side(team_id)
    join app.teams club on club.id = side.team_id
    where g.status in ('scheduled', 'open')
    group by g.id, g.deadline_at, g.sequence_number, side.team_id, club.short_name
    having count(distinct f.id) > 1
  ) d;
  if doubled.clubs > 0 then
    select case when watched_seasons > 1 then s.name || ' ' else '' end || 'GW' || g.sequence_number
        || ' (' || g.status || ', deadline ' || to_char(g.deadline_at at time zone 'UTC', 'DD Mon HH24:MI')
        || ' UTC) holds ' || club.short_name || ' twice: '
        || string_agg(home.short_name || ' v ' || away.short_name, ', ' order by f.kickoff_at, f.id),
      g.status::text
    into doubled_label, doubled_status
    from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id
    join app.teams club on club.id = doubled.team_id
    join app.fantasy_fixture_assignments a on a.gameweek_id = g.id
      and a.superseded_at is null and a.counts_points
    join app.fixtures f on f.id = a.fixture_id and club.id in (f.home_team_id, f.away_team_id)
    join app.teams home on home.id = f.home_team_id
    join app.teams away on away.id = f.away_team_id
    where g.id = doubled.gameweek_id
    group by g.id, s.name, club.id;
  end if;
  checks := checks || jsonb_build_object('name', 'fantasy_gameweek_clubs', 'status',
    case when doubled.imminent > 0 then 'fail' when doubled.clubs > 0 then 'warn' else 'ok' end,
    'detail',
    case when doubled.clubs = 0 then 'no scheduled or open gameweek holds a club twice'
      else doubled_label || '; '
        || case doubled_status when 'scheduled' then 'it cannot open like this (fantasy_next_calendar_incomplete)'
          else 'it would lock like this, a double gameweek nobody decided' end
        || ', and no tool takes a match out of a gameweek before its lock: a developer is needed'
        || case when doubled.clubs > 1 then ' (+' || (doubled.clubs - 1) || ' more club(s) twice)' else '' end
    end);

  -- Fantasy: player statistics for every finished match that counts for
  -- points (20260926003400). Complete means what the scoring worker requires:
  -- a coverage row certified scoring_statistics_complete and reconciled. The
  -- final whistle is finalized_at, or kickoff + 2 h for a finished row without
  -- one. Warn 6 h after it (GitHub has left 6.3 h between orchestrator runs),
  -- fail 12 h after it. Settled gameweeks are out of scope.
  select
    count(*) filter (where m.complete) as covered,
    count(*) filter (where not m.complete and m.final_at >= now_at - interval '6 hours') as waiting,
    count(*) filter (where not m.complete and m.final_at < now_at - interval '6 hours') as late,
    count(*) filter (where not m.complete and m.final_at < now_at - interval '12 hours') as overdue,
    count(*) filter (where not m.complete and m.partial and m.final_at < now_at - interval '6 hours') as partial,
    min(m.final_at) filter (where not m.complete) as oldest_final,
    (array_agg(m.gameweek order by m.final_at, m.gameweek) filter (where not m.complete))[1]
      as oldest_gameweek
  into coverage
  from (
    select coalesce(f.finalized_at, f.kickoff_at + interval '2 hours') as final_at,
      case when watched_seasons > 1 then s.name || ' ' else '' end || 'GW' || g.sequence_number as gameweek,
      coalesce(c.scoring_statistics_complete and c.reconciled, false) as complete,
      c.fixture_id is not null as partial
    from app.fantasy_fixture_assignments a
    join app.fantasy_seasons s on s.id = a.fantasy_season_id and s.status in ('registration_open', 'active')
    join app.fantasy_gameweeks g on g.id = a.gameweek_id
      and g.status not in ('finalized', 'corrected', 'cancelled')
    join app.fixtures f on f.id = a.fixture_id and f.status = 'finished'
    left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
    where a.superseded_at is null and a.counts_points
  ) m;
  checks := checks || jsonb_build_object('name', 'fantasy_fixture_coverage', 'status',
    case when coverage.overdue > 0 then 'fail' when coverage.late > 0 then 'warn' else 'ok' end,
    'detail',
    case
      when coverage.late > 0 then
        case when coverage.overdue > 0 then coverage.overdue || ' counted match(es) final 12+ h ago'
          else coverage.late || ' counted match(es) final 6+ h ago' end
        || ' without complete player statistics (oldest: ' || coverage.oldest_gameweek || ', final '
        || floor(extract(epoch from now_at - coverage.oldest_final) / 3600) || ' h ago'
        || case when coverage.partial > 0 then '; ' || coverage.partial || ' with partial statistics' else '' end
        || ')' || case when coverage.overdue > 0 then ': their Fantasy points cannot be computed' else '' end
      when coverage.covered + coverage.waiting = 0 then 'no finished match counts for Fantasy points yet'
      else coverage.covered || ' of ' || (coverage.covered + coverage.waiting)
        || ' finished counted match(es) with complete player statistics'
        || case when coverage.waiting > 0 then ' (the others final under 6 h ago)' else '' end
    end);

  -- Fantasy: points for every gameweek past its lock (20260926003400).
  -- An unfinished counted match holds the gameweek; that is play, not a
  -- defect, while the match can still finish on its own (an empty scoring
  -- table then means no points yet, never zero points). The rules keep it in
  -- the gameweek if it is completed within the ruleset's post-lock completion
  -- window of its frozen kickoff (48 h, FANTASY_RULES_V1.md). So it warns at
  -- once for a match postponed, cancelled or abandoned after the lock, or
  -- moved too late to be completed within that window; 3 h after its due end
  -- (kickoff + 2 h) for any other match still not finished, and fails 6 h
  -- after it (`stale`: the row stopped following the match); and it fails
  -- for any match still not finished once that window is over
  -- (`past_window`), whatever its class, the moment the owner's tool accepts
  -- it (scripts/backend/resolve-fantasy-postponed-assignment.sql,
  -- 20260926003500), or says a developer is needed where that tool cannot
  -- free the gameweek (its last counted match; every counted match past its
  -- window). Once every counted match is final: while statistics are
  -- missing, warn from 6 h after the last whistle (fantasy_fixture_coverage
  -- fails for them); once all are certified, warn an hour after the last
  -- certification (a run scores in the pass that certifies, within its 40
  -- minutes) and fail 8 h after it (a manual ingest waits for the next run,
  -- and GitHub has left 6.3 h between runs) while the gameweek is still not
  -- finalized.
  select w.*,
    count(*) filter (where w.verdict in ('stalled', 'fail')) over () as failing,
    exists (select 1 from app_private.fantasy_scoring_snapshots snapshot where snapshot.gameweek_id = w.id)
      as scoring_started
  into scoring
  from (
    select v.*,
      case
        when v.stuck > 0 then 'stalled'
        when v.finished < v.matches and v.held > 0 then 'stalling'
        when v.finished < v.matches then 'in_play'
        when v.without_statistics > 0 then
          case when v.last_final >= now_at - interval '6 hours' then 'due' else 'warn' end
        when v.statistics_since >= now_at - interval '1 hour' then 'due'
        when v.statistics_since >= now_at - interval '8 hours' then 'unscored'
        else 'fail' end as verdict
    from (
      select m.id, m.gameweek, m.deadline_at, m.status,
        count(*) as matches,
        count(*) filter (where m.hold is null) as finished,
        count(*) filter (where m.held) as held,
        count(*) filter (where m.past_window or m.stale) as stuck,
        count(*) filter (where m.past_window) as past_window,
        max(m.final_at) filter (where m.hold is null) as last_final,
        count(*) filter (where not m.complete) as without_statistics,
        max(m.certified_at) as statistics_since,
        (array_agg(jsonb_build_object('fixture', m.fixture_id, 'hold', m.hold, 'status', m.fixture_status,
            'kickoff', m.kickoff_at, 'assigned', m.assigned_kickoff_at, 'window', m.completion_window,
            'resolvable', m.resolvable_at, 'pastWindow', m.past_window)
            order by m.past_window desc, m.stale desc, m.due_end, m.fixture_id)
          filter (where m.held))[1] as held_match
      from (
        select k.*,
          k.hold is not null and (k.hold in ('called_off', 'moved')
            or k.due_end < now_at - interval '3 hours' or k.resolvable_at <= now_at) as held,
          k.hold = 'unfinished' and k.due_end < now_at - interval '6 hours' as stale,
          k.hold is not null and k.resolvable_at <= now_at as past_window
        from (
          select g.id, case when watched_seasons > 1 then s.name || ' ' else '' end || 'GW' || g.sequence_number
              as gameweek, g.deadline_at, g.status::text as status,
            f.id as fixture_id, f.status::text as fixture_status, f.kickoff_at, a.assigned_kickoff_at,
            coalesce(f.finalized_at, f.kickoff_at + interval '2 hours') as final_at,
            coalesce(c.scoring_statistics_complete and c.reconciled, false) as complete,
            case when f.status = 'finished' and c.scoring_statistics_complete and c.reconciled then coalesce(
              (select min(p.created_at) from app.player_fixture_performances p
               where p.fixture_id = f.id and p.active and p.source_version = c.source_version),
              c.updated_at) end as certified_at,
            o.hold,
            case o.hold
              when 'called_off' then a.assigned_kickoff_at + interval '2 hours'
              when 'moved' then a.assigned_kickoff_at + interval '2 hours'
              when 'unfinished' then f.kickoff_at + interval '2 hours' end as due_end,
            r.completion_window, r.resolvable_at
          from app.fantasy_gameweeks g
          join app.fantasy_seasons s on s.id = g.fantasy_season_id and s.status in ('registration_open', 'active')
          left join app.fantasy_fixture_rules fixture_rules on fixture_rules.ruleset_id = s.ruleset_id
          join app.fantasy_fixture_assignments a on a.gameweek_id = g.id
            and a.superseded_at is null and a.counts_points
          join app.fixtures f on f.id = a.fixture_id
          left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
          -- The ruleset's post-lock completion window (48 h in v1.0 and
          -- v1.1; 48 h too for a ruleset without one, which the tool then
          -- refuses with fantasy_fixture_rules_missing), from the kickoff
          -- the gameweek locked with. The tool reads the same value.
          cross join lateral (select coalesce(fixture_rules.post_lock_completion_window_hours, 48)
              as completion_window,
            a.assigned_kickoff_at
              + make_interval(hours => coalesce(fixture_rules.post_lock_completion_window_hours, 48))
              as resolvable_at) r
          -- What holds a match that is not finished, as the tool records it:
          -- called off, moved too late to be completed within the window
          -- (kickoff + 2 h, the earliest it can end, past it), or anything
          -- else unfinished.
          cross join lateral (select case
              when f.status = 'finished' then null
              when f.status in ('postponed', 'cancelled', 'abandoned') then 'called_off'
              when f.kickoff_at > a.assigned_kickoff_at
                and f.kickoff_at + interval '2 hours' > r.resolvable_at then 'moved'
              else 'unfinished' end as hold) o
          where g.status in ('locked', 'live', 'provisional', 'finalizing')
        ) k
      ) m
      group by m.id, m.gameweek, m.deadline_at, m.status
    ) v
  ) w
  order by case w.verdict when 'stalled' then 0 when 'fail' then 0 when 'stalling' then 1 when 'warn' then 1
    when 'unscored' then 1 when 'due' then 2 else 3 end, w.deadline_at, w.id
  limit 1;
  if scoring.verdict in ('stalled', 'stalling') then
    select home.short_name || ' v ' || away.short_name into held_label
    from app.fixtures f
    join app.teams home on home.id = f.home_team_id
    join app.teams away on away.id = f.away_team_id
    where f.id = (scoring.held_match ->> 'fixture')::uuid;
    -- What happens once the rules stop keeping it: the owner's tool takes it
    -- out, but never a gameweek's last counted match.
    held_remedy := case when scoring.matches = 1
      then 'a developer is needed: it is the gameweek''s last counted match, which the tool cannot take out'
      else 'scripts/backend/resolve-fantasy-postponed-assignment.sql takes it out' end;
  end if;
  -- Where a gameweek whose statistics are all certified stopped.
  scoring_stage := case
    when scoring.status in ('locked', 'live') then 'still ' || scoring.status || ', not handed to scoring'
    when scoring.status = 'finalizing' then 'points sealed, finalization not finished'
    when scoring.scoring_started then 'scoring started, not finished'
    else 'no scoring run has stored anything' end;
  checks := checks || jsonb_build_object('name', 'fantasy_scoring', 'status',
    case when scoring.verdict in ('stalled', 'fail') then 'fail'
      when scoring.verdict in ('stalling', 'warn', 'unscored') then 'warn' else 'ok' end,
    'detail',
    case
      when scoring.verdict in ('stalled', 'stalling') then scoring.gameweek || ': counted match '
        || coalesce(held_label, 'fixture ' || left(scoring.held_match ->> 'fixture', 8)) || ' '
        || case scoring.held_match ->> 'hold'
          when 'called_off' then (scoring.held_match ->> 'status') || ' after the lock (due '
            || to_char((scoring.held_match ->> 'assigned')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC)'
          when 'moved' then 'moved to '
            || to_char((scoring.held_match ->> 'kickoff')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI')
            || ' UTC, too late to be completed within ' || (scoring.held_match ->> 'window') || ' h (due '
            || to_char((scoring.held_match ->> 'assigned')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC)'
          else 'still ' || (scoring.held_match ->> 'status') || ' '
            || floor(extract(epoch from now_at - (scoring.held_match ->> 'kickoff')::timestamptz) / 3600)
            || ' h after its kickoff' end
        || case
          -- The rules no longer keep it: the owner takes it out, unless the
          -- tool cannot free the gameweek (no counted match of it left that
          -- is finished or still inside its window).
          when (scoring.held_match ->> 'pastWindow')::boolean then
            '; not completed within the ' || (scoring.held_match ->> 'window') || ' h the rules allow'
            || case
              when scoring.past_window < scoring.matches then
                ': take it out with scripts/backend/resolve-fantasy-postponed-assignment.sql'
              else case when scoring.matches = 1 then ', and it is the gameweek''s last counted match'
                  else ', nor was any other counted match of the gameweek' end
                || ': a developer is needed (no tool yet for a gameweek whose every match was called off)'
              end
          when scoring.held_match ->> 'hold' in ('called_off', 'moved') then
            '; the rules keep it in the gameweek if it is completed within '
            || (scoring.held_match ->> 'window') || ' h, by '
            || to_char((scoring.held_match ->> 'resolvable')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI')
            || ' UTC; after that, this fails and ' || held_remedy
          else '; points wait until it finishes (a provider refresh corrects a stale row); if it is not completed by '
            || to_char((scoring.held_match ->> 'resolvable')::timestamptz at time zone 'UTC', 'DD Mon HH24:MI')
            || ' UTC, ' || held_remedy
          end
        || case when scoring.held > 1 then ' (+' || (scoring.held - 1) || ' more match(es))' else '' end
        || case when scoring.verdict = 'stalled' and scoring.failing > 1
          then ' (+' || (scoring.failing - 1) || ' more gameweek(s))' else '' end
      else case scoring.verdict
        when 'fail' then scoring.gameweek || ': every counted match final for '
          || floor(extract(epoch from now_at - scoring.last_final) / 3600) || ' h, statistics complete for '
          || floor(extract(epoch from now_at - scoring.statistics_since) / 3600) || ' h, no final points: '
          || scoring_stage
          || case when scoring.failing > 1 then ' (+' || (scoring.failing - 1) || ' more gameweek(s))' else '' end
        when 'unscored' then scoring.gameweek || ': statistics complete for '
          || floor(extract(epoch from now_at - scoring.statistics_since) / 3600) || ' h, no final points yet ('
          || scoring_stage || '): only a Fantasy season orchestrator run scores; fails at '
          || to_char((scoring.statistics_since + interval '8 hours') at time zone 'UTC', 'HH24:MI') || ' UTC'
        when 'warn' then scoring.gameweek || ': every counted match final for '
          || floor(extract(epoch from now_at - scoring.last_final) / 3600) || ' h, no points yet: '
          || scoring.without_statistics || ' match(es) still without complete player statistics (fantasy_fixture_coverage)'
        when 'due' then scoring.gameweek || ': every counted match final, points due by '
          || to_char(case when scoring.without_statistics > 0 then scoring.last_final + interval '6 hours'
               else scoring.statistics_since + interval '1 hour' end at time zone 'UTC', 'HH24:MI')
          || ' UTC'
        when 'in_play' then scoring.gameweek || ' ' || scoring.status || ': ' || scoring.finished
          || ' of ' || scoring.matches || ' counted matches final; points come after the last one'
        else 'no gameweek in play or waiting for points' end
    end);

  -- Scheduled database jobs: any failure in the last hour.
  select string_agg(j.jobname || ' x' || f.failures, ', ' order by j.jobname) into failed_jobs
  from (select jobid, count(*) as failures from cron.job_run_details
        where status = 'failed' and start_time > now_at - interval '1 hour' group by jobid) f
  join cron.job j on j.jobid = f.jobid;
  checks := checks || jsonb_build_object('name', 'cron_jobs', 'status',
    case when failed_jobs is null then 'ok' else 'fail' end, 'detail',
    coalesce('failed in the last hour: ' || failed_jobs, 'no failed run in the last hour'));

  -- News: the every-minute publication job keeps a heartbeat.
  select last_run_at into news_beat from app_private.news_schedule_heartbeat where id;
  checks := checks || jsonb_build_object('name', 'news_publication', 'status',
    case when news_beat is null or news_beat < now_at - interval '10 minutes' then 'fail' else 'ok' end,
    'detail', case when news_beat is null then 'never ran'
      else 'last run ' || to_char(news_beat at time zone 'UTC', 'HH24:MI') || ' UTC' end);

  -- News: the sitemap snapshot, refreshed every minute by news-sitemap-refresh.
  -- Past 120 seconds api.news_sitemap_entries computes the archive on every
  -- request instead (correct, but the 2026-09-25 outage was exactly that
  -- query timing out), so warn; past 10 minutes the job is paused or failing,
  -- and a paused job records no failed run for `cron_jobs` to see, so fail.
  -- A refresh taking 1.5 s is half the 3 s a visitor's live read may take.
  select computed_at, compute_ms, entry_count into sitemap
  from app_private.news_sitemap_snapshot where id;
  checks := checks || jsonb_build_object('name', 'news_sitemap', 'status',
    case
      when sitemap.computed_at is null or sitemap.computed_at < now_at - interval '10 minutes' then 'fail'
      when sitemap.computed_at < now_at - interval '120 seconds' then 'warn'
      when sitemap.compute_ms >= 1500 then 'warn'
      else 'ok' end,
    'detail',
    case
      when sitemap.computed_at is null then 'no snapshot: every /sitemap.xml request computes the whole archive'
      when sitemap.computed_at < now_at - interval '120 seconds' then 'last refresh '
        || floor(extract(epoch from now_at - sitemap.computed_at) / 60) || ' min ago (news-sitemap-refresh paused or failing): '
        || 'every /sitemap.xml request computes the whole archive'
      when sitemap.compute_ms >= 1500 then 'a refresh took ' || sitemap.compute_ms
        || ' ms: a live read would be close to the 3 s visitors get'
      else 'last refresh ' || to_char(sitemap.computed_at at time zone 'UTC', 'HH24:MI') || ' UTC, '
        || sitemap.entry_count || ' entries in ' || sitemap.compute_ms || ' ms' end);

  -- News: the licensed import (runs from GitHub) failing within a day.
  select count(*) into failed_news_runs from app_private.news_ingestion_runs
  where status::text = 'failed' and started_at > now_at - interval '24 hours';
  checks := checks || jsonb_build_object('name', 'news_import', 'status',
    case when failed_news_runs > 0 then 'warn' else 'ok' end, 'detail',
    case when failed_news_runs > 0 then failed_news_runs || ' failed import run(s) in 24 h' else 'no failed import in 24 h' end);

  -- Live scores: switched off near a match, or stale during one. The live
  -- refresh calls every 2 minutes during a match and every 5 before it
  -- (20260924200500), so 10 minutes without a fixture run is a stall.
  select * into email from app_private.notification_email_settings where id;
  select count(*) filter (where f.kickoff_at between now_at - interval '3 hours' and now_at
      and f.status not in ('finished', 'postponed', 'cancelled', 'abandoned')),
    count(*) filter (where f.kickoff_at between now_at and now_at + interval '6 hours'
      and f.status in ('scheduled', 'not_started'))
  into in_play, upcoming
  from app.fixtures f join app.seasons s on s.id = f.season_id and s.is_current;
  select max(started_at), max(started_at) filter (where status::text = 'succeeded'),
    count(*) filter (where status::text <> 'succeeded' and started_at > now_at - interval '6 hours'),
    -- Season-wide: a window of a week or more that reaches today or later
    -- (the hourly season refresh, the orchestrator's recovery), not the live
    -- refresh's three days around a match.
    max(started_at) filter (where status::text = 'succeeded' and case
      when target_scope ->> 'from' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and target_scope ->> 'to' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (target_scope ->> 'to')::date - (target_scope ->> 'from')::date >= 7
        and (target_scope ->> 'to')::date >= (now_at at time zone 'UTC')::date
      else false end)
  into last_fixture_run, last_fixture_ok, failed_fixture_runs, last_season_ok
  from app_private.football_ingestion_runs where job_type = 'fixtures';
  checks := checks || jsonb_build_object('name', 'live_scores', 'status',
    case
      when not coalesce(email.football_live_refresh_enabled, false) or email.functions_base_url is null then
        case when in_play + upcoming > 0 then 'warn' else 'ok' end
      when in_play > 0 and (last_fixture_run is null or last_fixture_run < now_at - interval '10 minutes') then 'fail'
      else 'ok' end,
    'detail',
    case
      when not coalesce(email.football_live_refresh_enabled, false) or email.functions_base_url is null then
        'live refresh switched off' || case when in_play + upcoming > 0
          then ' with ' || (in_play + upcoming) || ' match(es) in play or kicking off within 6 h' else '' end
      when in_play > 0 and (last_fixture_run is null or last_fixture_run < now_at - interval '10 minutes') then
        in_play || ' match(es) in play, no fixture refresh for over 10 min'
      else 'live refresh on' end);

  -- Provider refresh: recent failures, and how old the season's fixtures
  -- are. With the database's hourly season refresh on (the live refresh
  -- switch), fixtures a week and more ahead older than 4 h fail: that is
  -- three or four hourly calls missed, not GitHub's schedule running late,
  -- which the check no longer depends on. Counted from when the hourly
  -- refresh started or was switched back on, whichever is later. With it off,
  -- as before: a warning after 12 h without any fixture refresh.
  select * into season_beat from app_private.football_season_refresh_heartbeat where id;
  season_refresh_on := coalesce(email.football_live_refresh_enabled, false) and email.functions_base_url is not null;
  season_clock := greatest(last_season_ok, season_beat.counting_from);
  checks := checks || jsonb_build_object('name', 'provider_refresh', 'status',
    case
      when failed_fixture_runs >= 3 then 'fail'
      when season_refresh_on and (season_clock is null or season_clock < now_at - interval '4 hours') then 'fail'
      when season_refresh_on and season_clock < now_at - interval '2 hours' then 'warn'
      when not season_refresh_on
        and (last_fixture_ok is null or last_fixture_ok < now_at - interval '12 hours') then 'warn'
      else 'ok' end,
    'detail',
    case
      when failed_fixture_runs >= 3 then failed_fixture_runs || ' failed fixture refreshes in 6 h'
      when season_refresh_on and (season_clock is null or season_clock < now_at - interval '2 hours') then
        case when last_season_ok is null then 'no season-wide fixture refresh recorded'
          else 'no season-wide fixture refresh for '
            || round(extract(epoch from now_at - last_season_ok) / 3600) || ' h' end
        || ' (hourly season refresh on, last called '
        || coalesce(to_char(season_beat.last_invoked_at at time zone 'UTC', 'HH24:MI') || ' UTC', 'never')
        || '): kickoff changes and postponements are not reaching the app'
      when not season_refresh_on and last_fixture_ok is null then
        'no successful fixture refresh recorded; hourly season refresh off'
      when not season_refresh_on and last_fixture_ok < now_at - interval '12 hours' then
        'last successful fixture refresh ' || round(extract(epoch from now_at - last_fixture_ok) / 3600)
        || ' h ago; hourly season refresh off'
      when season_refresh_on and last_season_ok is null then 'hourly season refresh on since '
        || to_char(season_beat.counting_from at time zone 'UTC', 'HH24:MI') || ' UTC, no season-wide refresh yet'
      when season_refresh_on then 'last season-wide fixture refresh '
        || to_char(last_season_ok at time zone 'UTC', 'HH24:MI') || ' UTC'
      else 'last successful fixture refresh ' || to_char(last_fixture_ok at time zone 'UTC', 'HH24:MI')
        || ' UTC; hourly season refresh off' end);

  -- Email delivery, when it is on.
  select last_run_at into email_beat from app_private.notification_email_heartbeat where id;
  select count(*) into dead_letters from app_private.notification_dead_letters where resolved_at is null;
  checks := checks || jsonb_build_object('name', 'email_delivery', 'status',
    case
      when email.mode = 'off' then 'ok'
      when email_beat is null or email_beat < now_at - interval '15 minutes' then 'fail'
      when dead_letters > 0 then 'warn'
      else 'ok' end,
    'detail',
    case
      when email.mode = 'off' then 'switched off'
      when email_beat is null or email_beat < now_at - interval '15 minutes' then 'no email tick for over 15 minutes'
      when dead_letters > 0 then dead_letters || ' undelivered email(s) waiting'
      else 'mode ' || email.mode end);

  -- Browser errors nothing caught, this hour and the last. A warning at most:
  -- the reports come from a public endpoint and must not be able to page.
  select coalesce(sum(t.reports), 0)::integer,
    (array_agg(t.code || ' on ' || t.route order by t.reports desc, t.code, t.route))[1]
  into browser_errors, top_browser_error
  from (
    select c.code, c.route, sum(c.reports) as reports
    from app_private.client_error_counts c
    where c.kind = 'unhandled' and c.bucket_hour >= date_trunc('hour', now_at) - interval '1 hour'
    group by c.code, c.route
  ) t;
  checks := checks || jsonb_build_object('name', 'browser_errors', 'status',
    case when browser_errors >= 25 then 'warn' else 'ok' end, 'detail',
    case when browser_errors = 0 then 'no unhandled browser error reported since '
        || to_char((date_trunc('hour', now_at) - interval '1 hour') at time zone 'UTC', 'HH24:MI') || ' UTC'
      else browser_errors || ' unhandled browser error(s) since '
        || to_char((date_trunc('hour', now_at) - interval '1 hour') at time zone 'UTC', 'HH24:MI')
        || ' UTC; most: ' || top_browser_error end);

  return jsonb_build_object(
    'environment', 'production',
    'generatedAt', now_at,
    'status', case
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'fail') then 'fail'
      when exists (select 1 from jsonb_array_elements(checks) c where c ->> 'status' = 'warn') then 'warn'
      else 'ok' end,
    'checks', checks);
end;
$$;
revoke all on function app_private.ops_health_checks() from public, anon, authenticated, service_role;
