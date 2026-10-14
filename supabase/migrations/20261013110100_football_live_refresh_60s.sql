-- Live refresh every 60 seconds while a match is in play.
--
-- 20260926113100's app_private.football_live_refresh_tick() called the Edge
-- Function every 2 minutes while a current-season fixture was in play. Live
-- scores are the product, so this makes it every 60 seconds, and only then:
--
--   60 s    a current-season fixture is live_first_half, half_time,
--           live_second_half, extra_time or penalties (kicked off within the
--           last 24 hours, or within 10 minutes from now: the same bounds as
--           before, so a fixture the provider never closes cannot keep the
--           refresh running for ever).
--   120 s   delayed or suspended (same bounds), or kickoff has passed while the
--           provider still says scheduled / not_started (the last 3 hours): the
--           start is seen within two minutes, as before.
--   300 s   a kickoff within the next 10 minutes. Unchanged.
--   900 s   finalized within the last 2 hours: the post-match refresh of events,
--           lineups and statistics. Unchanged.
--   idle    nothing is called, and the last call is forgotten, so the next
--           match is refreshed at once. Unchanged.
--
-- A fixture leaves the 60 s class when its status becomes finished (or anything
-- that is not play); the 900 s post-final refresh takes over. pg_cron already
-- wakes the tick every minute ('* * * * *', 20260924200500), so the schedule is
-- not touched; only the cadence is. The slack stays 20 seconds, so a tick that
-- pg_cron starts a few seconds late still calls.
--
-- supabase/functions/_shared/football-live-cadence.ts is this decision as a
-- pure function; its tests read this file and fail if the status lists or
-- windows here drift from it.
--
-- Everything else in the function (switch, heartbeat, the 'busy' answer while a
-- season call runs) is 20260926113100's, unchanged. Request cost is bounded in
-- the Edge Function: one live-events request per call, incidents only for a
-- fixture that changed (docs/backend/SOFASCORE_LIVE_EDGE.md).

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
    -- in play: every 60 seconds
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
        and fixture.status in ('live_first_half', 'half_time', 'live_second_half',
          'extra_time', 'penalties')
        and fixture.kickoff_at between now_at - interval '24 hours' and now_at + interval '10 minutes'
    ) then interval '60 seconds'
    -- delayed or interrupted, or started without the provider saying so yet
    when exists (
      select 1 from app.fixtures fixture
      join app.seasons season on season.id = fixture.season_id and season.is_current
      where app_private.fantasy_kickoff_confirmed(fixture.kickoff_at)
        and (
          (fixture.status in ('delayed', 'suspended')
            and fixture.kickoff_at between now_at - interval '24 hours' and now_at + interval '10 minutes')
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
  -- one-minute cadence from slipping to two.
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
comment on function app_private.football_live_refresh_tick() is
  'pg_cron entry point (every minute): calls the Edge Function football-live-refresh every 60 s while a current-season fixture is in play, every 2 minutes for delayed/suspended or just-started-unannounced fixtures, every 5 minutes before a kickoff, every 15 minutes for 2 hours after a final whistle, and not at all otherwise. Never writes fixtures itself.';
