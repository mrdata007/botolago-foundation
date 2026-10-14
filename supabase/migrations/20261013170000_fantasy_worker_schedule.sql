-- Fantasy lifecycle worker on a schedule we control (docs/backend/FANTASY_WORKER_SCHEDULE.md), part 1:
-- the switch, the lease, the run log, the status read and the pg_cron job.
--
-- Measured 2026-10-12: scoring, mode selection, finalization, close/lock and
-- opening the next gameweek's postwork ran only in the GitHub Action
-- `fantasy-season-orchestrator.yml`. GitHub started 5 of the 24 hourly runs in a
-- day, 4 to 11 hours apart; points lagged for hours and a deadline was missed.
-- The database tick `fantasy-lifecycle-tick` (every 5 minutes) only locks, goes
-- live and moves to provisional.
--
-- The same TypeScript worker now also runs in the Edge Function
-- `fantasy-lifecycle-worker`, woken every 10 minutes by pg_cron through pg_net
-- (`fantasy-worker-tick`), and only while a gameweek has work.
--
--   * Gate. The tick calls the function only when BOTH switches are on:
--     app_private.fantasy_automation_settings.lifecycle_tick_enabled (the
--     existing Fantasy switch, so `fantasy_automation_configure(false)` pauses
--     the worker too, as AGENTS.md already says for the Fantasy tick) AND the new
--     lifecycle_worker_enabled, which ships OFF. It also needs functions_base_url
--     (app_private.notification_email_settings) and the scheduler token, like the
--     football ticks.
--   * Work. app_private.fantasy_worker_work_pending() mirrors what the worker
--     would pick (the orchestrator's selectWorkerTargets): a locked, live,
--     provisional or finalizing gameweek, an open one past its deadline, a
--     finalized one whose successor is not opened or whose postwork is owed.
--     No work: nothing is called, and the idle ticks cost one indexed read.
--   * One writer. A lease, app_private.fantasy_worker_lease: one row with a
--     holder, a secret token and an expiry. The Edge Function, the hourly
--     GitHub orchestrator and the manual worker take it through
--     api.service_fantasy_worker_lease_acquire; while it is held and unexpired
--     nobody else can take it; a holder that dies frees it when it expires (420 s
--     by default, extended while it works). The database refuses an `edge:`
--     lease while the worker is switched off, so a stray call to the function
--     does nothing.
--   * Log. app_private.fantasy_worker_runs: one row per Edge pass (outcome,
--     gameweek, worker code, RPC calls, duration), written through
--     api.service_fantasy_worker_record_run; rows older than 30 days are
--     deleted by the same call, so no second cron job is needed.
--   * Status. api.service_fantasy_worker_status tells the GitHub orchestrator
--     whether the database job is on and keeping up; a scheduled GitHub run then
--     leaves the lifecycle to it and only watches.
--
-- SHIPS SWITCHED OFF. Deploy the Edge Function and set BOTOLAGO_SCHEDULER_TOKEN
-- first, then the owner enables it with
--   select app_private.fantasy_worker_configure(true);
-- (a second argument sets the minutes between passes, 10 to 120, default 10).
-- Pause it (before a write to Fantasy tables, AGENTS.md) with
--   select app_private.fantasy_automation_configure(false);
-- which stops the tick and the Fantasy tick together; restore with true. A pass
-- already running keeps its lease until it ends (at most about 8 minutes):
--   select holder, expires_at, released_at from app_private.fantasy_worker_lease;
-- The health check is 20261013170100.

-- ---------------------------------------------------------------------------
-- Switch
-- ---------------------------------------------------------------------------
alter table app_private.fantasy_automation_settings
  add column lifecycle_worker_enabled boolean not null default false,
  -- Minutes between passes while a gameweek has work. The tick wakes every 10
  -- minutes, so 10 is the floor; a live gameweek is re-scored on every pass, so a
  -- large season may prefer 20 or 30.
  add column lifecycle_worker_interval_minutes integer not null default 10
    check (lifecycle_worker_interval_minutes between 10 and 120);

create or replace function app_private.fantasy_worker_configure(
  p_enabled boolean,
  p_interval_minutes integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare settings app_private.fantasy_automation_settings%rowtype;
begin
  if p_enabled is null or (p_interval_minutes is not null and p_interval_minutes not between 10 and 120) then
    raise exception using errcode = '22023', message = 'fantasy_worker_setting_required';
  end if;
  update app_private.fantasy_automation_settings
  set lifecycle_worker_enabled = p_enabled,
      lifecycle_worker_interval_minutes = coalesce(p_interval_minutes, lifecycle_worker_interval_minutes),
      updated_at = statement_timestamp()
  where id
  returning * into settings;
  return jsonb_build_object('lifecycleWorkerEnabled', settings.lifecycle_worker_enabled,
    'intervalMinutes', settings.lifecycle_worker_interval_minutes,
    'lifecycleTickEnabled', settings.lifecycle_tick_enabled, 'updatedAt', settings.updated_at);
end;
$$;
revoke all on function app_private.fantasy_worker_configure(boolean, integer)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_worker_configure(boolean, integer) is
  'Owner switch (database owner only): the Edge lifecycle worker runs only while this and fantasy_automation_configure are both on; optional pass interval in minutes (10-120, default 10). Ships off.';

create or replace function app_private.fantasy_worker_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.lifecycle_tick_enabled and s.lifecycle_worker_enabled
    from app_private.fantasy_automation_settings s where s.id), false);
$$;
revoke all on function app_private.fantasy_worker_enabled() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lease, run log, tick bookkeeping
-- ---------------------------------------------------------------------------
create table app_private.fantasy_worker_lease (
  id boolean primary key default true check (id),
  holder text,
  token uuid,
  acquired_at timestamptz,
  expires_at timestamptz,
  released_at timestamptz
);
comment on table app_private.fantasy_worker_lease is
  'The single lifecycle lease: whoever holds an unexpired, unreleased token is the only Fantasy lifecycle writer (Edge function, GitHub orchestrator, manual worker). The token is never returned to anyone but the holder.';
alter table app_private.fantasy_worker_lease enable row level security;
alter table app_private.fantasy_worker_lease force row level security;
revoke all on app_private.fantasy_worker_lease from public, anon, authenticated, service_role;
insert into app_private.fantasy_worker_lease (id) values (true);

create table app_private.fantasy_worker_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null default statement_timestamp(),
  holder text not null check (holder ~ '^(edge|github|manual):[A-Za-z0-9._-]{1,64}$'),
  outcome text not null check (outcome in ('ok', 'partial', 'failed', 'lease_held')),
  gameweek_id uuid,
  gameweek_sequence integer,
  worker_code text check (worker_code is null or worker_code ~ '^[a-z][a-z0-9_]{2,100}$'),
  calls integer not null default 0 check (calls >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  detail jsonb not null default '{}'::jsonb
);
comment on table app_private.fantasy_worker_runs is
  'One row per pass of the Edge lifecycle worker: outcome (ok, partial = stopped on its budget, failed, lease_held), the gameweek, the worker code, RPC calls and duration. Rows older than 30 days are deleted by api.service_fantasy_worker_record_run.';
alter table app_private.fantasy_worker_runs enable row level security;
alter table app_private.fantasy_worker_runs force row level security;
revoke all on app_private.fantasy_worker_runs from public, anon, authenticated, service_role;
create index fantasy_worker_runs_finished_idx on app_private.fantasy_worker_runs (finished_at desc);
create index fantasy_worker_runs_ok_idx on app_private.fantasy_worker_runs (finished_at desc)
  where outcome = 'ok';

create table app_private.fantasy_worker_dispatch (
  id boolean primary key default true check (id),
  last_invoked_at timestamptz,
  last_outcome text not null default 'never'
    check (last_outcome in ('never', 'disabled', 'idle', 'invoked', 'busy', 'waiting', 'not_configured')),
  -- From when `fantasy_worker` measures staleness: switched on (or back on), or
  -- the work appeared, whichever is later. Hours it was off or idle are not its fault.
  counting_from timestamptz not null default statement_timestamp(),
  pending_since timestamptz,
  updated_at timestamptz not null default statement_timestamp()
);
comment on table app_private.fantasy_worker_dispatch is
  'When the fantasy-worker-tick last called the Edge function, its last answer, and the instants the fantasy_worker health check counts from.';
alter table app_private.fantasy_worker_dispatch enable row level security;
alter table app_private.fantasy_worker_dispatch force row level security;
revoke all on app_private.fantasy_worker_dispatch from public, anon, authenticated, service_role;
insert into app_private.fantasy_worker_dispatch (id) values (true);

-- ---------------------------------------------------------------------------
-- Is there work for the worker? (selectWorkerTargets, in SQL)
-- ---------------------------------------------------------------------------
create or replace function app_private.fantasy_worker_work_pending()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.fantasy_gameweeks g
    join app.fantasy_seasons s on s.id = g.fantasy_season_id
    where s.status in ('registration_open', 'active')
      and (
        g.status in ('locked', 'live', 'provisional', 'finalizing')
        or (g.status = 'open' and g.deadline_at <= statement_timestamp())
        or (g.status = 'finalized' and (
          -- the successor is staged but not opened
          (exists (select 1 from app.fantasy_gameweeks nx
              where nx.fantasy_season_id = g.fantasy_season_id
                and nx.sequence_number = g.sequence_number + 1)
            and not exists (select 1 from app_private.fantasy_gameweek_progressions pr
              where pr.previous_gameweek_id = g.id and pr.opened_at is not null))
          -- or it closed early and its postwork is still owed
          or (g.closed_at is not null and not exists (
              select 1 from app_private.fantasy_gameweek_postwork w
              where w.gameweek_id = g.id and w.calculation_version = g.scoring_input_version
                and w.completed_at is not null))
        ))
      )
  );
$$;
revoke all on function app_private.fantasy_worker_work_pending() from public, anon, authenticated, service_role;
comment on function app_private.fantasy_worker_work_pending() is
  'True when the lifecycle worker would pick at least one gameweek: locked/live/provisional/finalizing, open past its deadline, or finalized with its successor unopened or its postwork owed. Reads only.';

-- ---------------------------------------------------------------------------
-- Service API: lease, status, run log
-- ---------------------------------------------------------------------------
create or replace function api.service_fantasy_worker_lease_acquire(
  p_holder text,
  p_ttl_seconds integer default 420
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lease app_private.fantasy_worker_lease%rowtype;
  now_at timestamptz := statement_timestamp();
  new_token uuid := gen_random_uuid();
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_holder is null or p_holder !~ '^(edge|github|manual):[A-Za-z0-9._-]{1,64}$'
    or p_ttl_seconds is null or p_ttl_seconds < 30 or p_ttl_seconds > 900 then
    raise exception using errcode = '22023', message = 'fantasy_worker_lease_invalid';
  end if;
  -- Defence in depth: the tick does not call while the worker is off, and the
  -- database refuses the Edge function's lease too. GitHub and manual runs are
  -- the owner's own and are never refused here.
  if p_holder like 'edge:%' and not app_private.fantasy_worker_enabled() then
    return jsonb_build_object('acquired', false, 'reason', 'disabled');
  end if;
  select * into lease from app_private.fantasy_worker_lease where id for update;
  if lease.token is not null and lease.released_at is null and lease.expires_at > now_at then
    return jsonb_build_object('acquired', false, 'reason', 'held',
      'holder', lease.holder, 'expiresAt', lease.expires_at);
  end if;
  update app_private.fantasy_worker_lease
  set holder = p_holder, token = new_token, acquired_at = now_at,
      expires_at = now_at + pg_catalog.make_interval(secs => p_ttl_seconds), released_at = null
  where id;
  return jsonb_build_object('acquired', true, 'token', new_token, 'holder', p_holder,
    'expiresAt', now_at + pg_catalog.make_interval(secs => p_ttl_seconds));
end;
$$;
revoke all on function api.service_fantasy_worker_lease_acquire(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_fantasy_worker_lease_acquire(text, integer) to service_role;
comment on function api.service_fantasy_worker_lease_acquire(text, integer) is
  'Service role: takes the single Fantasy lifecycle lease (holder edge:*, github:* or manual:*; 30-900 s) unless another unexpired one is held; an edge: holder is refused while the worker is switched off. Returns the secret token to the holder only.';

create or replace function api.service_fantasy_worker_lease_extend(
  p_token uuid,
  p_ttl_seconds integer default 420
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare now_at timestamptz := statement_timestamp(); found_row boolean;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_token is null or p_ttl_seconds is null or p_ttl_seconds < 30 or p_ttl_seconds > 900 then
    raise exception using errcode = '22023', message = 'fantasy_worker_lease_invalid';
  end if;
  update app_private.fantasy_worker_lease
  set expires_at = now_at + pg_catalog.make_interval(secs => p_ttl_seconds)
  where id and token = p_token and released_at is null and expires_at > now_at;
  found_row := found;
  return jsonb_build_object('extended', found_row);
end;
$$;
revoke all on function api.service_fantasy_worker_lease_extend(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_fantasy_worker_lease_extend(uuid, integer) to service_role;
comment on function api.service_fantasy_worker_lease_extend(uuid, integer) is
  'Service role: pushes the holder''s lease expiry out; false when the lease expired or was taken (the holder must stop).';

create or replace function api.service_fantasy_worker_lease_release(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare found_row boolean;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_token is null then
    raise exception using errcode = '22023', message = 'fantasy_worker_lease_invalid';
  end if;
  update app_private.fantasy_worker_lease
  set released_at = statement_timestamp()
  where id and token = p_token and released_at is null;
  found_row := found;
  return jsonb_build_object('released', found_row);
end;
$$;
revoke all on function api.service_fantasy_worker_lease_release(uuid)
  from public, anon, authenticated, service_role;
grant execute on function api.service_fantasy_worker_lease_release(uuid) to service_role;
comment on function api.service_fantasy_worker_lease_release(uuid) is
  'Service role: frees the holder''s lease at the end of a pass.';

create or replace function api.service_fantasy_worker_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  last_ok timestamptz;
  pending boolean := app_private.fantasy_worker_work_pending();
  enabled boolean := app_private.fantasy_worker_enabled();
  lease app_private.fantasy_worker_lease%rowtype;
  interval_minutes integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into settings from app_private.notification_email_settings where id;
  select lifecycle_worker_interval_minutes into interval_minutes
  from app_private.fantasy_automation_settings where id;
  select max(finished_at) into last_ok from app_private.fantasy_worker_runs where outcome = 'ok';
  select * into lease from app_private.fantasy_worker_lease where id;
  return jsonb_build_object(
    'enabled', enabled,
    -- "On and keeping up": switched on, reachable, and either nothing to do or an
    -- ok pass within the last 30 minutes (twice the interval, if longer). A scheduled GitHub run leaves the lifecycle
    -- to the database job exactly then.
    'databaseWorkerActive', enabled and settings.functions_base_url is not null
      and (not pending or coalesce(last_ok > statement_timestamp()
        - pg_catalog.make_interval(mins => greatest(30, 2 * interval_minutes)), false)),
    'workPending', pending,
    'lastOkAt', last_ok,
    'leaseHeld', lease.token is not null and lease.released_at is null
      and lease.expires_at > statement_timestamp()
  );
end;
$$;
revoke all on function api.service_fantasy_worker_status() from public, anon, authenticated, service_role;
grant execute on function api.service_fantasy_worker_status() to service_role;
comment on function api.service_fantasy_worker_status() is
  'Service role: whether the database lifecycle worker is on and keeping up (databaseWorkerActive), whether a gameweek has work, the last ok pass and whether a lease is held. Reads only.';

create or replace function api.service_fantasy_worker_record_run(p_run jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_started timestamptz;
  v_gameweek uuid;
  v_detail jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_run is null or jsonb_typeof(p_run) <> 'object'
    or coalesce(p_run ->> 'holder', '') !~ '^(edge|github|manual):[A-Za-z0-9._-]{1,64}$'
    or coalesce(p_run ->> 'outcome', '') not in ('ok', 'partial', 'failed', 'lease_held') then
    raise exception using errcode = '22023', message = 'fantasy_worker_run_invalid';
  end if;
  begin
    v_started := (p_run ->> 'startedAt')::timestamptz;
  exception when others then
    v_started := null;
  end;
  begin
    v_gameweek := (p_run ->> 'gameweekId')::uuid;
  exception when others then
    v_gameweek := null;
  end;
  v_detail := coalesce(p_run -> 'detail', '{}'::jsonb);
  if jsonb_typeof(v_detail) <> 'object' or pg_column_size(v_detail) > 16000 then
    v_detail := jsonb_build_object('truncated', true);
  end if;
  insert into app_private.fantasy_worker_runs (
    started_at, holder, outcome, gameweek_id, gameweek_sequence, worker_code, calls, duration_ms, detail)
  values (
    coalesce(v_started, statement_timestamp()),
    p_run ->> 'holder',
    p_run ->> 'outcome',
    v_gameweek,
    case when jsonb_typeof(p_run -> 'gameweekSequence') = 'number'
      then least(greatest((p_run ->> 'gameweekSequence')::numeric, 0), 100000)::integer end,
    case when p_run ->> 'workerCode' ~ '^[a-z][a-z0-9_]{2,100}$' then p_run ->> 'workerCode' end,
    case when jsonb_typeof(p_run -> 'calls') = 'number'
      then least(greatest((p_run ->> 'calls')::numeric, 0), 1000000)::integer else 0 end,
    case when jsonb_typeof(p_run -> 'durationMs') = 'number'
      then least(greatest((p_run ->> 'durationMs')::numeric, 0), 3600000)::integer else 0 end,
    v_detail)
  returning id into v_id;
  delete from app_private.fantasy_worker_runs
  where finished_at < statement_timestamp() - interval '30 days';
  return v_id;
end;
$$;
revoke all on function api.service_fantasy_worker_record_run(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.service_fantasy_worker_record_run(jsonb) to service_role;
comment on function api.service_fantasy_worker_record_run(jsonb) is
  'Service role: logs one pass of the Edge lifecycle worker (holder, outcome, gameweek, worker code, calls, duration, detail) and deletes log rows older than 30 days.';

-- ---------------------------------------------------------------------------
-- The tick
-- ---------------------------------------------------------------------------
create or replace function app_private.fantasy_worker_tick()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.notification_email_settings%rowtype;
  beat app_private.fantasy_worker_dispatch%rowtype;
  lease app_private.fantasy_worker_lease%rowtype;
  now_at timestamptz := statement_timestamp();
  request bigint;
  counting timestamptz;
  interval_minutes integer;
begin
  select * into settings from app_private.notification_email_settings where id;
  select lifecycle_worker_interval_minutes into interval_minutes
  from app_private.fantasy_automation_settings where id;
  select * into beat from app_private.fantasy_worker_dispatch where id for update;

  if not app_private.fantasy_worker_enabled() then
    if beat.last_outcome <> 'disabled' then
      update app_private.fantasy_worker_dispatch
      set last_invoked_at = null, last_outcome = 'disabled', pending_since = null, updated_at = now_at
      where id;
    end if;
    return 'disabled';
  end if;
  -- Switched back on: the hours it was off are not the worker's fault.
  counting := case when beat.last_outcome = 'disabled' then now_at else beat.counting_from end;

  if settings.functions_base_url is null then
    update app_private.fantasy_worker_dispatch
    set last_outcome = 'not_configured', counting_from = counting, updated_at = now_at where id;
    return 'not_configured';
  end if;

  if not app_private.fantasy_worker_work_pending() then
    update app_private.fantasy_worker_dispatch
    set last_outcome = 'idle', counting_from = counting, pending_since = null, updated_at = now_at
    where id;
    return 'idle';
  end if;
  -- Work has just appeared: staleness counts from now, not from the last pass days ago.
  if beat.pending_since is null then
    update app_private.fantasy_worker_dispatch set pending_since = now_at where id;
  end if;

  -- A pass still holds the lease (this worker's, or the GitHub orchestrator's):
  -- do not wake the function just to be turned away.
  select * into lease from app_private.fantasy_worker_lease where id;
  if lease.token is not null and lease.released_at is null and lease.expires_at > now_at then
    update app_private.fantasy_worker_dispatch
    set last_outcome = 'busy', counting_from = counting, updated_at = now_at where id;
    return 'busy';
  end if;

  -- Every `interval_minutes` (10 by default). pg_cron can start a tick a little
  -- late; two minutes of slack keep the cadence from slipping a whole tick.
  if beat.last_invoked_at is not null
    and beat.last_invoked_at > now_at - pg_catalog.make_interval(mins => interval_minutes - 2) then
    update app_private.fantasy_worker_dispatch
    set last_outcome = 'waiting', counting_from = counting, updated_at = now_at where id;
    return 'waiting';
  end if;

  request := app_private.invoke_scheduled_function(
    settings.functions_base_url, 'fantasy-lifecycle-worker', jsonb_build_object('job', 'lifecycle')
  );
  if request is null then
    update app_private.fantasy_worker_dispatch
    set last_outcome = 'not_configured', counting_from = counting, updated_at = now_at where id;
    return 'not_configured';
  end if;
  update app_private.fantasy_worker_dispatch
  set last_invoked_at = now_at, last_outcome = 'invoked', counting_from = counting, updated_at = now_at
  where id;
  return 'invoked';
end;
$$;
revoke all on function app_private.fantasy_worker_tick() from public, anon, authenticated, service_role;
comment on function app_private.fantasy_worker_tick() is
  'pg_cron entry point (every 10 minutes): while fantasy_automation_configure and fantasy_worker_configure are both on, a gameweek has work and no lease is held, calls the Edge Function fantasy-lifecycle-worker. Writes only its own bookkeeping.';

select cron.schedule(
  'fantasy-worker-tick',
  '*/10 * * * *',
  'select app_private.fantasy_worker_tick();'
);
