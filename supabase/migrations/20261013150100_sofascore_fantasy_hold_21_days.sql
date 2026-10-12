-- A held SofaScore Fantasy match is retried until 21 days after kickoff, not for 24 tries
-- (docs/backend/SOFASCORE_FANTASY_SIMPLE.md, "Retries").
--
-- WHY. 24 tries at 15 minutes, 1 hour and 6 hours is about 3.5 days. A club plays about once a
-- week, so a match held for an unknown player could be given up before anything linked him, and a
-- person had to ask for a retry. The stats job closes a match for good 21 days after kickoff; the
-- Fantasy path now holds on for the same time, so any link made inside that window (automatic,
-- created, staff or bulk) releases the match.
--
-- WHAT.
--   1. api.service_sofascore_fantasy_due (replaced): a held match with stored replies is retried
--      while kickoff + 21 days has not passed. The attempt count no longer ends the retries:
--      p_max_attempts is still accepted (older callers send it) and ignored. After a reopen (the
--      attempt count is reset to 0) a match past its 21 days still gets three tries, so a link made
--      late is not wasted. The catch-up of never-attempted matches is unchanged (p_hours looks back
--      from finalization; the Edge Function now sends 504 hours = 21 days by default).
--   2. api.service_sofascore_fantasy_note (replaced): a 'held' note on a match whose kickoff + 21
--      days has passed, with at least three attempts counted (since the last reopen), is stored as
--      'gave_up' and drops the stored replies. Everything else is exactly as in 20261011140000.
--   The back-off stays in the Edge Function (15 minutes, 1 hour, then at most 6 hours), so the cost
--   stays bounded; a retry reads the stored replies and costs no SofaScore request.
--
-- Applying it writes no data. Prerequisite: 20261011140000.
do $$
begin
  if to_regprocedure('api.service_sofascore_fantasy_due(integer,integer,integer,integer,integer)') is null
    or to_regprocedure('api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)') is null then
    raise exception 'sofascore_hold_21_days_prerequisite_missing: apply migration 20261011140000 first';
  end if;
end $$;

-- The window, in one place.
create function app_private.sofascore_fantasy_hold_window()
returns interval language sql immutable set search_path = '' as $$ select interval '21 days' $$;
revoke all on function app_private.sofascore_fantasy_hold_window() from public, anon, authenticated, service_role;

create or replace function api.service_sofascore_fantasy_note(
  p_fixture_id uuid, p_event_id text, p_status text, p_outcome text, p_blockers jsonb,
  p_match_data jsonb, p_data_digest text, p_next_retry_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app_private.sofascore_fantasy_attempts%rowtype;
  v_status text := p_status;
  v_kickoff timestamptz;
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
  select kickoff_at into v_kickoff from app.fixtures where id = p_fixture_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'sofascore_fantasy_fixture_not_found'; end if;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = p_fixture_id for update;
  if found and a.status = 'recorded' then
    return jsonb_build_object('status', 'recorded', 'attempts', a.attempts, 'unchanged', true); end if;
  -- Held for good only until kickoff + 21 days; after that, three tries since the last reopen.
  if v_status = 'held' and v_kickoff + app_private.sofascore_fantasy_hold_window() <= statement_timestamp()
     and coalesce(a.attempts, 0) + 1 >= 3 then
    v_status := 'gave_up';
  end if;
  insert into app_private.sofascore_fantasy_attempts as t(
    fixture_id, sofascore_event_id, status, attempts, last_attempt_at, next_retry_at,
    last_outcome, last_blockers, data_digest, match_data, recorded_at)
  values (p_fixture_id, p_event_id, v_status, 1, statement_timestamp(),
    case when v_status = 'held' then p_next_retry_at end, p_outcome,
    coalesce(p_blockers, '[]'::jsonb), p_data_digest,
    case when v_status = 'held' then p_match_data end,
    case when v_status = 'recorded' then statement_timestamp() end)
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

create or replace function api.service_sofascore_fantasy_due(
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
             where a.status = 'held' and a.match_data is not null
               -- p_max_attempts is ignored. Inside the window every try is allowed; after it, three
               -- since the last reopen (a link made late releases a match given up before).
               and (f.kickoff_at + app_private.sofascore_fantasy_hold_window() > statement_timestamp()
                    or a.attempts < 3)
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
