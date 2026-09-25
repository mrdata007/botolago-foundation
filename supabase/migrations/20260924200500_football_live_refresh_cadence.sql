-- Live scores at a football pace.
--
-- The live refresh (20260924140100) was woken every 15 minutes, so a goal or a
-- final whistle reached the app up to a quarter of an hour late. It keeps its
-- switch (`football_live_refresh_enabled`, off in production), its Edge
-- Function and its guard; only when it calls the provider changes:
--
--   a match in play, delayed or suspended, or past its kick-off without the
--   provider saying so yet ................................ every 2 minutes
--   a kick-off within the next 10 minutes ................... every 5 minutes
--   nothing on (finished, postponed, cancelled, no match) ... never
--
-- pg_cron now wakes the tick every minute; the tick remembers when it last
-- called and calls again only when the cadence above is due. One call is one
-- SportsMonks request (yesterday to tomorrow, one page), so a two-hour match
-- costs about 60 requests, and a day without a match costs none.

create table app_private.football_live_refresh_heartbeat (
  id boolean primary key default true check (id),
  last_invoked_at timestamptz,
  last_outcome text not null default 'never'
    check (last_outcome in ('never', 'invoked', 'idle')),
  updated_at timestamptz not null default statement_timestamp()
);
comment on table app_private.football_live_refresh_heartbeat is
  'When the live refresh last called the football-live-refresh Edge Function; cleared when no match is on.';
alter table app_private.football_live_refresh_heartbeat enable row level security;
alter table app_private.football_live_refresh_heartbeat force row level security;
revoke all on app_private.football_live_refresh_heartbeat from public, anon, authenticated, service_role;
insert into app_private.football_live_refresh_heartbeat (id) values (true);

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

  if app_private.invoke_scheduled_function(
    settings.functions_base_url, 'football-live-refresh', '{"job":"fixtures"}'::jsonb
  ) is null then
    return 'not_configured';
  end if;
  update app_private.football_live_refresh_heartbeat
  set last_invoked_at = now_at, last_outcome = 'invoked', updated_at = now_at
  where id;
  return 'invoked';
end;
$$;

-- cron.schedule with a name replaces the job of that name.
select cron.schedule(
  'football-live-refresh',
  '* * * * *',
  'select app_private.football_live_refresh_tick();'
);
