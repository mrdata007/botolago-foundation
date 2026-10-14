-- SofaScore staged statistics (docs/backend/SOFASCORE_STAGED_STATS.md), part 2:
-- the per-match pull schedule and its history. Scores nothing and finalizes
-- nothing; the Fantasy side reads app_private.sofascore_staged_stats (part 3).
--
-- PROVISIONAL -> FINAL | FINAL_LIMITED, decided here (in the database) because
-- it is what lets a gameweek lock:
--   * first pull = the first SofaScore observation (registered by a trigger);
--   * re-pull every 3 days until a pull shows full coverage (rating and
--     totalPass for every player with minutes); one final pull 3 days after full
--     coverage was first seen, then FINAL;
--   * no full coverage 21 days after kickoff (app_private.sofascore_fantasy_hold_window)
--     -> FINAL_LIMITED, listed by api.admin_sofascore_final_limited();
--   * full coverage seen but the final pull still missing 7 days later -> FINAL;
--   * a reviewed correction as the latest observation -> FINAL (the recorder
--     ignores provider data after it).

do $$
begin
  if to_regprocedure('app_private.sofascore_fantasy_hold_window()') is null
    or to_regprocedure('app_private.rapidapi_calls_this_month()') is null
    or to_regclass('app_private.fantasy_staged_stats_policy') is null then
    raise exception 'sofascore_staged_stats_prerequisite_missing: apply 20261013110000, 20261013150100 and 20261013160000 first';
  end if;
end $$;

create table app_private.sofascore_staged_stats (
  fixture_id uuid primary key references app.fixtures(id),
  sofascore_event_id text not null check (sofascore_event_id ~ '^[0-9]{1,20}$'),
  status text not null default 'PROVISIONAL' check (status in ('PROVISIONAL', 'FINAL', 'FINAL_LIMITED')),
  kickoff_at timestamptz not null,
  first_pull_at timestamptz not null,
  last_pull_at timestamptz,
  pull_count integer not null default 1 check (pull_count >= 1),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  coverage text not null check (coverage in ('unknown', 'core', 'full')),
  full_at timestamptz,
  next_pull_at timestamptz,
  settled_at timestamptz,
  settled_reason text check (settled_reason is null or settled_reason ~ '^[a-z0-9_]{1,60}$'),
  created_at timestamptz not null default statement_timestamp(),
  check ((status = 'PROVISIONAL') = (settled_at is null)),
  check (status = 'PROVISIONAL' or next_pull_at is null),
  check (status <> 'FINAL' or full_at is not null or settled_reason = 'reviewed_override'),
  check (status <> 'FINAL_LIMITED' or full_at is null)
);
create index sofascore_staged_stats_due on app_private.sofascore_staged_stats(next_pull_at)
  where status = 'PROVISIONAL';

create table app_private.sofascore_stat_pulls (
  id bigint generated always as identity primary key,
  fixture_id uuid not null references app.fixtures(id),
  pulled_at timestamptz not null default statement_timestamp(),
  outcome text not null check (outcome in ('first', 'pulled', 'regressed', 'error')),
  coverage text check (coverage is null or coverage in ('unknown', 'core', 'full')),
  data_digest text check (data_digest is null or data_digest ~ '^[0-9a-f]{64}$'),
  changed boolean not null default false,
  observation_id bigint references app_private.fantasy_fixture_observations(id),
  requests integer not null default 0 check (requests between 0 and 20),
  error text check (error is null or error ~ '^[a-z0-9_]{1,80}$'),
  -- Trimmed parsed replies, only when the digest changed. Never a raw payload.
  match_data jsonb check (match_data is null or (jsonb_typeof(match_data) = 'object'
    and octet_length(match_data::text) <= 524288))
);
create index sofascore_stat_pulls_fixture on app_private.sofascore_stat_pulls(fixture_id, pulled_at);

alter table app_private.sofascore_staged_stats enable row level security;
alter table app_private.sofascore_stat_pulls enable row level security;
alter table app_private.sofascore_staged_stats force row level security;
alter table app_private.sofascore_stat_pulls force row level security;
revoke all on app_private.sofascore_staged_stats, app_private.sofascore_stat_pulls
  from public, anon, authenticated, service_role;

create function app_private.sofascore_staged_repull_interval()
returns interval language sql immutable set search_path = '' as $$ select interval '3 days' $$;
revoke all on function app_private.sofascore_staged_repull_interval() from public, anon, authenticated, service_role;

-- Registers a fixture from a SofaScore observation (idempotent). Coverage from
-- the observation is trusted only when the staged policy was already on for the
-- fixture's season at that moment (the coverage definition changed with it);
-- otherwise it is 'unknown' and the fixture is pulled again at once.
create function app_private.sofascore_staged_register(p_fixture_id uuid, p_observation_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  o app_private.fantasy_fixture_observations%rowtype;
  f app.fixtures%rowtype;
  v_event text; v_cov text; v_trusted boolean;
begin
  select * into o from app_private.fantasy_fixture_observations where id = p_observation_id and fixture_id = p_fixture_id;
  if not found then return false; end if;
  v_event := o.payload #>> '{sourceRefs,sofascoreEventId}';
  if v_event is null or v_event !~ '^[0-9]{1,20}$' then return false; end if;
  if exists(select 1 from app_private.sofascore_staged_stats where fixture_id = p_fixture_id) then return false; end if;
  select * into f from app.fixtures where id = p_fixture_id;
  if not found then return false; end if;
  select exists(select 1 from app_private.fantasy_staged_stats_policy p
      join app.fantasy_seasons s on s.id = p.season_id
      join app.fantasy_gameweeks g on g.fantasy_season_id = s.id
      join app.fantasy_fixture_assignments a on a.gameweek_id = g.id and a.fixture_id = f.id and a.superseded_at is null
     where p.enabled and p.activated_at <= o.observed_at)
    into v_trusted;
  v_cov := case when not v_trusted then 'unknown'
                when o.payload #>> '{sourceRefs,coverage}' = 'full' then 'full' else 'core' end;
  insert into app_private.sofascore_staged_stats(fixture_id, sofascore_event_id, kickoff_at, first_pull_at,
    last_pull_at, coverage, full_at, next_pull_at)
  values (f.id, v_event, f.kickoff_at, o.observed_at, o.observed_at, v_cov,
    case when v_cov = 'full' then o.observed_at end,
    case when v_cov = 'unknown' then statement_timestamp()
         else o.observed_at + app_private.sofascore_staged_repull_interval() end);
  insert into app_private.sofascore_stat_pulls(fixture_id, pulled_at, outcome, coverage, data_digest, changed, observation_id)
  values (f.id, o.observed_at, 'first', v_cov, o.digest, true, o.id);
  return true;
end $$;
revoke all on function app_private.sofascore_staged_register(uuid, bigint) from public, anon, authenticated, service_role;

create function app_private.sofascore_staged_observation_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform app_private.sofascore_staged_register(new.fixture_id, new.id);
  exception when others then
    -- Registration must never stop an observation; the due list registers late.
    raise warning 'sofascore_staged_register_failed %', sqlstate;
  end;
  return new;
end $$;
revoke all on function app_private.sofascore_staged_observation_trigger() from public, anon, authenticated, service_role;
create trigger sofascore_staged_observation after insert on app_private.fantasy_fixture_observations
  for each row when (new.payload #>> '{sourceRefs,sofascoreEventId}' is not null)
  execute function app_private.sofascore_staged_observation_trigger();

-- Time based settling. Independent of whether a fetch worked.
create function app_private.sofascore_staged_settle_due(p_now timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; k integer;
begin
  update app_private.sofascore_staged_stats s set status = 'FINAL', settled_at = p_now,
    settled_reason = 'reviewed_override', next_pull_at = null
   where s.status = 'PROVISIONAL' and (
     select o.source from app_private.fantasy_fixture_observations o
      where o.fixture_id = s.fixture_id order by o.observed_at desc, o.id desc limit 1) = 'reviewed-correction';
  get diagnostics k = row_count; n := n + k;
  update app_private.sofascore_staged_stats s set status = 'FINAL_LIMITED', settled_at = p_now,
    settled_reason = 'no_full_coverage_21d', next_pull_at = null
   where s.status = 'PROVISIONAL' and s.full_at is null
     and s.kickoff_at + app_private.sofascore_fantasy_hold_window() <= p_now;
  get diagnostics k = row_count; n := n + k;
  update app_private.sofascore_staged_stats s set status = 'FINAL', settled_at = p_now,
    settled_reason = 'final_pull_missing', next_pull_at = null
   where s.status = 'PROVISIONAL' and s.full_at is not null
     and s.kickoff_at + app_private.sofascore_fantasy_hold_window() + interval '7 days' <= p_now;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke all on function app_private.sofascore_staged_settle_due(timestamptz) from public, anon, authenticated, service_role;

-- One pull's outcome. p_pull:
--   outcome  'pulled' | 'error'
--   coverage 'core' | 'full'            (pulled)
--   regressed boolean                   (coverage worse than the recorded one: stored, not recorded)
--   dataDigest sha256, matchData object (trimmed parsed replies), observationId, requests, error
create function api.service_sofascore_staged_record_pull(p_fixture_id uuid, p_pull jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s app_private.sofascore_staged_stats%rowtype;
  v_now timestamptz := statement_timestamp();
  v_outcome text := p_pull->>'outcome';
  v_cov text := p_pull->>'coverage';
  v_regressed boolean := coalesce((p_pull->>'regressed')::boolean, false);
  v_digest text := p_pull->>'dataDigest';
  v_obs bigint := nullif(p_pull->>'observationId', '')::bigint;
  v_changed boolean := false; v_prev text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_fixture_id is null or jsonb_typeof(p_pull) is distinct from 'object'
    or v_outcome not in ('pulled', 'error')
    or (v_outcome = 'pulled' and v_cov not in ('core', 'full'))
    or (v_digest is not null and v_digest !~ '^[0-9a-f]{64}$')
    or (p_pull ? 'matchData' and jsonb_typeof(p_pull->'matchData') not in ('object', 'null'))
    or coalesce((p_pull->>'requests')::integer, 0) not between 0 and 20
    or (p_pull ? 'error' and coalesce(p_pull->>'error', '') !~ '^[a-z0-9_]{1,80}$') then
    raise exception using errcode = 'PT400', message = 'sofascore_staged_pull_invalid'; end if;
  select * into s from app_private.sofascore_staged_stats where fixture_id = p_fixture_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'sofascore_staged_fixture_not_registered'; end if;
  if s.status <> 'PROVISIONAL' then
    return jsonb_build_object('status', s.status, 'settled', true, 'ignored', true); end if;

  if v_outcome = 'error' then
    insert into app_private.sofascore_stat_pulls(fixture_id, outcome, error, requests)
    values (s.fixture_id, 'error', p_pull->>'error', coalesce((p_pull->>'requests')::integer, 0));
    update app_private.sofascore_staged_stats set failed_attempts = failed_attempts + 1,
      next_pull_at = v_now + interval '3 hours' where fixture_id = s.fixture_id;
  else
    select data_digest into v_prev from app_private.sofascore_stat_pulls
     where fixture_id = s.fixture_id and data_digest is not null order by pulled_at desc, id desc limit 1;
    v_changed := v_digest is not null and v_prev is distinct from v_digest;
    insert into app_private.sofascore_stat_pulls(fixture_id, outcome, coverage, data_digest, changed,
      observation_id, requests, match_data)
    values (s.fixture_id, case when v_regressed then 'regressed' else 'pulled' end, v_cov, v_digest, v_changed,
      v_obs, coalesce((p_pull->>'requests')::integer, 0),
      case when v_changed and jsonb_typeof(p_pull->'matchData') = 'object' then p_pull->'matchData' end);
    if v_regressed then
      update app_private.sofascore_staged_stats set last_pull_at = v_now, pull_count = pull_count + 1,
        failed_attempts = 0, next_pull_at = v_now + app_private.sofascore_staged_repull_interval()
       where fixture_id = s.fixture_id;
    elsif v_cov = 'full' and s.full_at is null then
      update app_private.sofascore_staged_stats set last_pull_at = v_now, pull_count = pull_count + 1,
        failed_attempts = 0, coverage = 'full', full_at = v_now,
        next_pull_at = v_now + app_private.sofascore_staged_repull_interval()
       where fixture_id = s.fixture_id;
    elsif v_cov = 'full' and v_now >= s.full_at + app_private.sofascore_staged_repull_interval() then
      update app_private.sofascore_staged_stats set last_pull_at = v_now, pull_count = pull_count + 1,
        failed_attempts = 0, coverage = 'full', status = 'FINAL', settled_at = v_now,
        settled_reason = 'final_pull_done', next_pull_at = null
       where fixture_id = s.fixture_id;
    elsif v_cov = 'full' then
      -- An extra pull before the final one is due: keep the final pull's time.
      update app_private.sofascore_staged_stats set last_pull_at = v_now, pull_count = pull_count + 1,
        failed_attempts = 0, coverage = 'full',
        next_pull_at = s.full_at + app_private.sofascore_staged_repull_interval()
       where fixture_id = s.fixture_id;
    else
      update app_private.sofascore_staged_stats set last_pull_at = v_now, pull_count = pull_count + 1,
        failed_attempts = 0, coverage = case when full_at is null then 'core' else coverage end,
        next_pull_at = v_now + app_private.sofascore_staged_repull_interval()
       where fixture_id = s.fixture_id;
    end if;
  end if;
  perform app_private.sofascore_staged_settle_due(v_now);
  select * into s from app_private.sofascore_staged_stats where fixture_id = p_fixture_id;
  return jsonb_build_object('status', s.status, 'coverage', s.coverage, 'nextPullAt', s.next_pull_at,
    'settledReason', s.settled_reason, 'pullCount', s.pull_count, 'changed', v_changed);
end $$;
revoke all on function api.service_sofascore_staged_record_pull(uuid, jsonb) from public, anon, authenticated;
grant execute on function api.service_sofascore_staged_record_pull(uuid, jsonb) to service_role;

-- Fixtures to pull now. Settles by time first, registers fixtures that have a
-- SofaScore observation but no row (recorded before this migration), and stays
-- empty when the month's counted RapidAPI calls reached p_budget_stop.
create function api.service_sofascore_staged_due(p_limit integer, p_budget_stop integer default 9000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := statement_timestamp(); r record; v_calls bigint;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_limit is null or p_limit not between 0 and 20 or p_budget_stop is null or p_budget_stop not between 0 and 100000 then
    raise exception using errcode = 'PT400', message = 'sofascore_staged_due_invalid'; end if;
  for r in
    select distinct on (o.fixture_id) o.fixture_id, o.id
      from app_private.fantasy_fixture_observations o
      join app.fixtures f on f.id = o.fixture_id
     where o.payload #>> '{sourceRefs,sofascoreEventId}' is not null
       and f.kickoff_at + app_private.sofascore_fantasy_hold_window() > v_now
       and not exists(select 1 from app_private.sofascore_staged_stats s where s.fixture_id = o.fixture_id)
     order by o.fixture_id, o.observed_at, o.id
     limit 50 loop
    perform app_private.sofascore_staged_register(r.fixture_id, r.id);
  end loop;
  perform app_private.sofascore_staged_settle_due(v_now);
  v_calls := app_private.rapidapi_calls_this_month();
  if v_calls >= p_budget_stop or p_limit = 0 then
    return jsonb_build_object('due', '[]'::jsonb, 'budgetStopped', v_calls >= p_budget_stop, 'calls', v_calls);
  end if;
  return jsonb_build_object('budgetStopped', false, 'calls', v_calls, 'due', (
    select coalesce(jsonb_agg(jsonb_build_object('fixtureId', x.fixture_id, 'eventId', x.sofascore_event_id,
      'coverage', x.coverage, 'finalPull', x.full_at is not null, 'pullCount', x.pull_count)
      order by x.next_pull_at, x.fixture_id), '[]'::jsonb)
    from (select s.* from app_private.sofascore_staged_stats s
           join app.fixtures f on f.id = s.fixture_id and f.status = 'finished'
          where s.status = 'PROVISIONAL' and s.next_pull_at <= v_now
            and exists(select 1 from app.fantasy_fixture_assignments a
                         join app.fantasy_gameweeks g on g.id = a.gameweek_id
                        where a.fixture_id = s.fixture_id and a.superseded_at is null
                          and app_private.fantasy_staged_enabled(g.id)
                          and g.status not in ('finalizing', 'finalized', 'corrected'))
            and exists(select 1 from app_private.football_provider_mappings m
                        where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
                          and m.internal_entity_id = s.fixture_id and m.external_id = s.sofascore_event_id and m.active)
          order by s.next_pull_at, s.fixture_id limit p_limit) x));
end $$;
revoke all on function api.service_sofascore_staged_due(integer, integer) from public, anon, authenticated;
grant execute on function api.service_sofascore_staged_due(integer, integer) to service_role;

-- Staff read: matches that ended without full statistics (FINAL_LIMITED), and
-- how many are still provisional. Read only.
create function api.admin_sofascore_final_limited()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.admin_assert_permission('football.read_operations');
  return jsonb_build_object(
    'provisional', (select count(*) from app_private.sofascore_staged_stats where status = 'PROVISIONAL'),
    'final', (select count(*) from app_private.sofascore_staged_stats where status = 'FINAL'),
    'finalLimited', (select count(*) from app_private.sofascore_staged_stats where status = 'FINAL_LIMITED'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'fixtureId', s.fixture_id, 'sofascoreEventId', s.sofascore_event_id, 'kickoffAt', s.kickoff_at,
        'settledAt', s.settled_at, 'reason', s.settled_reason, 'pullCount', s.pull_count,
        'gameweek', (select g.sequence_number from app.fantasy_fixture_assignments a
                       join app.fantasy_gameweeks g on g.id = a.gameweek_id
                      where a.fixture_id = s.fixture_id and a.superseded_at is null limit 1))
        order by s.settled_at desc)
      from app_private.sofascore_staged_stats s where s.status = 'FINAL_LIMITED'), '[]'::jsonb));
end $$;
revoke all on function api.admin_sofascore_final_limited() from public, anon;
grant execute on function api.admin_sofascore_final_limited() to authenticated;

comment on table app_private.sofascore_staged_stats is
  'Per-match state of the staged SofaScore statistics: PROVISIONAL -> FINAL | FINAL_LIMITED, next pull time, coverage. Written only by api.service_sofascore_staged_record_pull and the observation trigger.';
comment on table app_private.sofascore_stat_pulls is
  'One row per SofaScore pull of a finished match with its time, digest and coverage; trimmed parsed data only when the digest changed. No raw payload.';
