-- Automatic SofaScore Fantasy observations: the state the Edge Function keeps
-- between ticks (docs/backend/SOFASCORE_FANTASY_SIMPLE.md, "Automatic path").
--
-- football-live-refresh already fetches SofaScore incidents, lineups and
-- statistics for every finished match (to store the match details). The
-- builder turns those same replies into a Fantasy observation, with no extra
-- SofaScore request. Two things need a memory the function does not have:
--
--   * A match held back (an appearing player has no reviewed mapping yet) is
--     retried on later ticks. Stored match details cannot rebuild it: they keep
--     no per-player minutes, assists, saves or coverage marker. So the parsed
--     SofaScore replies are kept here, small and trimmed (lineups with their
--     statistics, incidents, the whole-match statistic lines), and a retry
--     re-reads them: no SofaScore request, only the mapping read again.
--   * The number of attempts, so nothing is retried forever.
--
-- This migration adds one table and three service-role functions. It scores
-- nothing, finalizes nothing and changes no existing object. Observations are
-- still written only by api.service_record_sofascore_fantasy_observation
-- (20261011120000), which this migration does not touch.

do $$
begin
  if to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null then
    raise exception 'sofascore_fantasy_auto_prerequisite_missing: apply migration 20261011120000 first';
  end if;
end $$;

create table app_private.sofascore_fantasy_attempts (
  fixture_id uuid primary key references app.fixtures(id),
  sofascore_event_id text not null check (sofascore_event_id ~ '^[0-9]{1,20}$'),
  status text not null default 'held' check (status in ('held', 'recorded', 'gave_up')),
  attempts integer not null default 0 check (attempts >= 0),
  first_attempt_at timestamptz not null default statement_timestamp(),
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_outcome text check (last_outcome is null or char_length(last_outcome) <= 200),
  last_blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(last_blockers) = 'array'),
  data_digest text check (data_digest is null or data_digest ~ '^[0-9a-f]{64}$'),
  -- Trimmed parsed SofaScore replies; dropped once the observation is recorded
  -- or the fixture is given up.
  match_data jsonb check (match_data is null or (jsonb_typeof(match_data) = 'object'
    and octet_length(match_data::text) <= 524288)),
  recorded_at timestamptz
);
alter table app_private.sofascore_fantasy_attempts enable row level security;
alter table app_private.sofascore_fantasy_attempts force row level security;
revoke all on app_private.sofascore_fantasy_attempts from public, anon, authenticated, service_role;

-- What the function needs to decide for one fixture, in one read: the fixture,
-- its gameweek, whether adaptive scoring is on for it, whether an observation
-- already exists, the stored attempt (with the stored replies), and the
-- SofaScore player mappings for the ids asked about (active or not, reviewed or
-- not: the caller keeps only the usable ones, and the recording function
-- re-checks every one).
create function api.service_sofascore_fantasy_context(
  p_fixture_id uuid, p_player_ids text[] default '{}'::text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  gw app.fantasy_gameweeks%rowtype;
  a app_private.sofascore_fantasy_attempts%rowtype;
  v_event text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_fixture_id is null or p_player_ids is null or cardinality(p_player_ids) > 120 then
    raise exception using errcode = 'PT400', message = 'sofascore_fantasy_context_invalid'; end if;
  select * into f from app.fixtures where id = p_fixture_id;
  if not found then return jsonb_build_object('found', false); end if;
  select m.external_id into v_event from app_private.football_provider_mappings m
   where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
     and m.internal_entity_id = f.id and m.active limit 1;
  select g.* into gw from app.fantasy_fixture_assignments x
    join app.fantasy_gameweeks g on g.id = x.gameweek_id
   where x.fixture_id = f.id and x.superseded_at is null limit 1;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = f.id;
  return jsonb_build_object(
    'found', true,
    'sofascoreEventId', v_event,
    'status', f.status::text,
    'finalized', f.finalized_at is not null,
    'homeScore', f.home_score, 'awayScore', f.away_score,
    'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id,
    'gameweekStatus', gw.status::text,
    'adaptiveEnabled', gw.id is not null and app_private.fantasy_adaptive_enabled(gw.id),
    'observations', (select count(*) from app_private.fantasy_fixture_observations o where o.fixture_id = f.id),
    'attempt', case when a.fixture_id is null then null else jsonb_build_object(
      'status', a.status, 'attempts', a.attempts, 'nextRetryAt', a.next_retry_at,
      'lastOutcome', a.last_outcome, 'dataDigest', a.data_digest,
      'matchData', a.match_data) end,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'externalId', m.external_id, 'appPlayerId', m.internal_entity_id,
        'active', m.active, 'reviewed', m.manually_corrected, 'version', m.source_version,
        'updatedAt', m.updated_at) order by m.external_id), '[]'::jsonb)
      from app_private.football_provider_mappings m
      where m.provider_name = 'sofascore' and m.entity_type = 'player'
        and m.external_id = any(p_player_ids)));
end $$;
revoke all on function api.service_sofascore_fantasy_context(uuid, text[]) from public, anon, authenticated;
grant execute on function api.service_sofascore_fantasy_context(uuid, text[]) to service_role;

-- Records the outcome of one attempt. 'held' keeps the stored replies (new ones
-- replace them when given); 'recorded' and 'gave_up' drop them. A recorded
-- fixture stays recorded.
create function api.service_sofascore_fantasy_note(
  p_fixture_id uuid, p_event_id text, p_status text, p_outcome text, p_blockers jsonb,
  p_match_data jsonb, p_data_digest text, p_next_retry_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a app_private.sofascore_fantasy_attempts%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_fixture_id is null or coalesce(p_event_id, '') !~ '^[0-9]{1,20}$'
    or p_status is null or p_status not in ('held', 'recorded', 'gave_up')
    or p_outcome is null or char_length(p_outcome) not between 1 and 200
    or jsonb_typeof(coalesce(p_blockers, '[]'::jsonb)) is distinct from 'array'
    or (p_match_data is not null and (jsonb_typeof(p_match_data) is distinct from 'object'
        or octet_length(p_match_data::text) > 524288))
    or (p_data_digest is not null and p_data_digest !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = 'PT400', message = 'sofascore_fantasy_note_invalid'; end if;
  if not exists(select 1 from app.fixtures where id = p_fixture_id) then
    raise exception using errcode = 'PT404', message = 'sofascore_fantasy_fixture_not_found'; end if;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = p_fixture_id for update;
  if found and a.status = 'recorded' then
    return jsonb_build_object('status', 'recorded', 'attempts', a.attempts, 'unchanged', true); end if;
  insert into app_private.sofascore_fantasy_attempts as t(
    fixture_id, sofascore_event_id, status, attempts, last_attempt_at, next_retry_at,
    last_outcome, last_blockers, data_digest, match_data, recorded_at)
  values (p_fixture_id, p_event_id, p_status, 1, statement_timestamp(),
    case when p_status = 'held' then p_next_retry_at end, p_outcome,
    coalesce(p_blockers, '[]'::jsonb), p_data_digest,
    case when p_status = 'held' then p_match_data end,
    case when p_status = 'recorded' then statement_timestamp() end)
  on conflict (fixture_id) do update set
    sofascore_event_id = excluded.sofascore_event_id,
    status = excluded.status,
    attempts = t.attempts + 1,
    last_attempt_at = excluded.last_attempt_at,
    next_retry_at = excluded.next_retry_at,
    last_outcome = excluded.last_outcome,
    last_blockers = excluded.last_blockers,
    data_digest = coalesce(excluded.data_digest, t.data_digest),
    match_data = case when excluded.status = 'held' then coalesce(excluded.match_data, t.match_data) end,
    recorded_at = excluded.recorded_at
  returning * into a;
  return jsonb_build_object('status', a.status, 'attempts', a.attempts, 'unchanged', false);
end $$;
revoke all on function api.service_sofascore_fantasy_note(uuid, text, text, text, jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function api.service_sofascore_fantasy_note(uuid, text, text, text, jsonb, jsonb, text, timestamptz)
  to service_role;

-- Fixtures the tick should look at, besides the ones it just fetched:
--   retry    held fixtures with stored replies whose retry time has come
--            (no SofaScore request);
--   catchUp  finished and finalized fixtures of the last p_hours with no
--            observation and no usable attempt (their replies were never kept):
--            the caller fetches at most p_catchup_limit of them (3 requests each).
-- Only fixtures whose gameweek has adaptive scoring on and is not yet
-- finalizing, and which have no observation, are listed.
create function api.service_sofascore_fantasy_due(
  p_retry_limit integer, p_catchup_limit integer, p_hours integer, p_max_attempts integer,
  p_fetch_max_attempts integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_retry_limit is null or p_retry_limit not between 0 and 50
    or p_catchup_limit is null or p_catchup_limit not between 0 and 10
    or p_hours is null or p_hours not between 1 and 720
    or p_max_attempts is null or p_max_attempts not between 1 and 500
    or p_fetch_max_attempts is null or p_fetch_max_attempts not between 1 and 500 then
    raise exception using errcode = 'PT400', message = 'sofascore_fantasy_due_invalid'; end if;
  return jsonb_build_object(
    'retry', (
      select coalesce(jsonb_agg(x.fixture_id order by x.next_retry_at, x.fixture_id), '[]'::jsonb)
      from (select a.fixture_id, a.next_retry_at
              from app_private.sofascore_fantasy_attempts a
              join app.fixtures f on f.id = a.fixture_id
             where a.status = 'held' and a.match_data is not null and a.attempts < p_max_attempts
               and (a.next_retry_at is null or a.next_retry_at <= statement_timestamp())
               and f.status = 'finished' and f.finalized_at is not null
               and not exists(select 1 from app_private.fantasy_fixture_observations o where o.fixture_id = f.id)
             order by a.next_retry_at nulls first, a.fixture_id
             limit p_retry_limit) x),
    'catchUp', (
      select coalesce(jsonb_agg(jsonb_build_object('fixtureId', x.id, 'eventId', x.external_id)
        order by x.finalized_at, x.id), '[]'::jsonb)
      from (select f.id, m.external_id, f.finalized_at
              from app.fixtures f
              join app_private.football_provider_mappings m on m.provider_name = 'sofascore'
                and m.entity_type = 'fixture' and m.internal_entity_id = f.id and m.active
              join app.fantasy_fixture_assignments asg on asg.fixture_id = f.id and asg.superseded_at is null
              join app.fantasy_gameweeks g on g.id = asg.gameweek_id
              left join app_private.sofascore_fantasy_attempts a on a.fixture_id = f.id
             where f.status = 'finished' and f.finalized_at is not null
               and f.finalized_at > statement_timestamp() - make_interval(hours => p_hours)
               and g.status not in ('finalizing', 'finalized', 'corrected')
               and app_private.fantasy_adaptive_enabled(g.id)
               and not exists(select 1 from app_private.fantasy_fixture_observations o where o.fixture_id = f.id)
               and (a.fixture_id is null
                    or (a.status = 'held' and a.match_data is null and a.attempts < p_fetch_max_attempts
                        and (a.next_retry_at is null or a.next_retry_at <= statement_timestamp())))
             order by f.finalized_at, f.id
             limit p_catchup_limit) x));
end $$;
revoke all on function api.service_sofascore_fantasy_due(integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function api.service_sofascore_fantasy_due(integer, integer, integer, integer, integer) to service_role;

comment on table app_private.sofascore_fantasy_attempts is
  'Per-fixture state of the automatic SofaScore Fantasy path: attempts, next retry, last outcome and the trimmed SofaScore replies kept for a retry without a request. Written only through api.service_sofascore_fantasy_note.';
