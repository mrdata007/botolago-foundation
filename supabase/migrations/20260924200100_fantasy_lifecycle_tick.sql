-- Fantasy lifecycle tick: the time-critical, database-only steps of the season
-- on a database clock instead of GitHub's.
--
-- The season orchestrator (fantasy-season-orchestrator.yml) is scheduled
-- hourly, but GitHub actually started it every 3.5-5.5 hours on 23-24 Sep
-- 2026. Everything it does that needs no provider call -- the calendar sync
-- (postponement deferral, deadline realignment, staging the next round) and
-- the lifecycle transitions (lock at the deadline, locked -> live when a
-- counting fixture has started, live -> provisional once every fixture is
-- final) -- now also runs every five minutes from pg_cron. Provider ingestion,
-- scoring and finalisation stay in the orchestrator.
--
-- It calls the same reviewed service functions the orchestrator calls, under
-- the same service claim; their own guards (advisory lock on the calendar,
-- row lock and lock_version on the gameweek) keep the two safe together, and
-- the orchestrator's worker re-reads on `stale_update`.
--
-- SHIPS SWITCHED OFF. The owner enables it with
--   select app_private.fantasy_automation_configure(true);
-- and pauses it (before any manual write to Fantasy tables, per AGENTS.md) with
--   select app_private.fantasy_automation_configure(false);
-- Every run records app_private.fantasy_lifecycle_heartbeat, which the
-- operations health check reads: a tick that errors or stops running raises
-- an alert.

create table app_private.fantasy_automation_settings (
  id boolean primary key default true,
  lifecycle_tick_enabled boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_automation_settings_singleton check (id)
);
insert into app_private.fantasy_automation_settings (id) values (true);
alter table app_private.fantasy_automation_settings enable row level security;
alter table app_private.fantasy_automation_settings force row level security;
revoke all on app_private.fantasy_automation_settings from public, anon, authenticated, service_role;

create table app_private.fantasy_lifecycle_heartbeat (
  id boolean primary key default true,
  last_run_at timestamptz,
  last_outcome text,
  last_error text,
  last_error_at timestamptz,
  consecutive_failures integer not null default 0,
  last_details jsonb not null default '{}'::jsonb,
  constraint fantasy_lifecycle_heartbeat_singleton check (id),
  constraint fantasy_lifecycle_heartbeat_outcome_check check (
    last_outcome is null or last_outcome in ('disabled', 'ok', 'error')
  ),
  constraint fantasy_lifecycle_heartbeat_failures_check check (consecutive_failures >= 0)
);
insert into app_private.fantasy_lifecycle_heartbeat (id) values (true);
alter table app_private.fantasy_lifecycle_heartbeat enable row level security;
alter table app_private.fantasy_lifecycle_heartbeat force row level security;
revoke all on app_private.fantasy_lifecycle_heartbeat from public, anon, authenticated, service_role;

-- Owner switch (database owner only, like notification_email_configure).
create or replace function app_private.fantasy_automation_configure(p_lifecycle_tick_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare settings app_private.fantasy_automation_settings%rowtype;
begin
  if p_lifecycle_tick_enabled is null then
    raise exception using errcode = '22023', message = 'fantasy_automation_setting_required';
  end if;
  update app_private.fantasy_automation_settings
  set lifecycle_tick_enabled = p_lifecycle_tick_enabled, updated_at = statement_timestamp()
  where id
  returning * into settings;
  return jsonb_build_object('lifecycleTickEnabled', settings.lifecycle_tick_enabled,
    'updatedAt', settings.updated_at);
end;
$$;
revoke all on function app_private.fantasy_automation_configure(boolean)
  from public, anon, authenticated, service_role;

create or replace function app_private.fantasy_lifecycle_tick()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled boolean;
  outcome text := 'ok';
  first_error text;
  details jsonb := '{}'::jsonb;
  sync jsonb;
  gameweek record;
  state jsonb;
  attempts integer;
  lifecycle jsonb := '[]'::jsonb;
begin
  -- One tick at a time; a slow tick is simply skipped by the next.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fantasy:lifecycle-tick', 0)) then
    return 'busy';
  end if;
  select lifecycle_tick_enabled into enabled from app_private.fantasy_automation_settings where id;
  if not coalesce(enabled, false) then
    update app_private.fantasy_lifecycle_heartbeat
    set last_run_at = statement_timestamp(), last_outcome = 'disabled'
    where id;
    return 'disabled';
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  if exists (select 1 from app.fantasy_seasons
    where status in ('planned', 'registration_open', 'active')) then
    begin
      sync := api.service_sync_fantasy_calendar(null);
      details := details || jsonb_build_object('calendar', jsonb_build_object(
        'gameweeksCreated', sync -> 'gameweeksCreated',
        'assignmentsDeferred', sync -> 'assignmentsDeferred',
        'assignmentsAdded', sync -> 'assignmentsAdded',
        'deadlineChanges', sync -> 'deadlineChanges'));
    exception when others then
      outcome := 'error';
      first_error := coalesce(first_error, 'calendar: ' || left(sqlerrm, 160));
      details := details || jsonb_build_object('calendar', jsonb_build_object('refused', left(sqlerrm, 160)));
    end;
  end if;

  for gameweek in
    select g.id, g.sequence_number, g.status from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id
    where s.status in ('registration_open', 'active')
      and ((g.status = 'open' and g.deadline_at <= statement_timestamp())
        or g.status in ('locked', 'live'))
    order by g.sequence_number
  loop
    begin
      attempts := 0;
      loop
        state := api.service_advance_fantasy_lifecycle(gameweek.id,
          (select lock_version from app.fantasy_gameweeks where id = gameweek.id), 500);
        attempts := attempts + 1;
        exit when not coalesce((state ->> 'hasMore')::boolean, false) or attempts >= 20;
      end loop;
      lifecycle := lifecycle || jsonb_build_object('gameweek', gameweek.sequence_number,
        'from', gameweek.status, 'to', state ->> 'status',
        'waitingReason', state ->> 'waitingReason');
    exception when others then
      outcome := 'error';
      first_error := coalesce(first_error,
        'gameweek ' || gameweek.sequence_number || ': ' || left(sqlerrm, 160));
      lifecycle := lifecycle || jsonb_build_object('gameweek', gameweek.sequence_number,
        'from', gameweek.status, 'refused', left(sqlerrm, 160));
    end;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  details := details || jsonb_build_object('lifecycle', lifecycle);

  update app_private.fantasy_lifecycle_heartbeat
  set last_run_at = statement_timestamp(),
      last_outcome = outcome,
      last_details = details,
      last_error = case when outcome = 'error' then first_error else last_error end,
      last_error_at = case when outcome = 'error' then statement_timestamp() else last_error_at end,
      consecutive_failures = case when outcome = 'error' then consecutive_failures + 1 else 0 end
  where id;
  return outcome;
end;
$$;
revoke all on function app_private.fantasy_lifecycle_tick()
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_lifecycle_tick() is
  'pg_cron entry point (every 5 minutes, switched by app_private.fantasy_automation_settings): calendar sync, then the lifecycle for every open gameweek past its deadline and every locked or live gameweek. Records app_private.fantasy_lifecycle_heartbeat. Never ingests from the provider, never scores.';

-- The job. cron.schedule with a name replaces a job of that name.
select cron.schedule(
  'fantasy-lifecycle-tick',
  '*/5 * * * *',
  $job$select app_private.fantasy_lifecycle_tick();$job$
);
