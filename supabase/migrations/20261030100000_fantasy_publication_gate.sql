-- BotolaGO Production V2
-- Publish a Fantasy journée's points all at once (owner request 2026-10-29).
--
-- Why. Fantasy points are SofaScore ratings, so a match has none while it is
-- played and each player gets points the moment his rating arrives (11 to 38 h
-- after full time). Fans saw some matches with points and others without, and
-- the rankings moved every ten minutes. From Journée 6 a journée's points,
-- rankings and finalization go out together, at one fixed moment, when every
-- rating is in.
--
-- The rule.
--   * publish-not-before: the Moroccan local date of the latest
--     finalized_at among the journée's counted matches, plus two days, at 14:00
--     local time. It is null until every counted match is finished.
--   * the worker (and every database write that publishes) refuses to write
--     points, rank, or finalize a gated journée until BOTH hold: now is at or
--     after publish-not-before AND no rating is pending. The decision is made
--     by api.service_evaluate_fantasy_publication and is recorded
--     (app_private.fantasy_publication_state). If a rating is still pending at a
--     slot, the journée waits for the next 14:00 local slot, whatever happens
--     in between. Once released it stays released, so a pass interrupted
--     halfway resumes. Never half-published.
--   * not gated, so unchanged: the selection close, the next journée's opening,
--     the Free Hit restore, free-transfer rollover and prices
--     (api.service_begin_fantasy_selection_close and the close steps are not
--     touched here), and every journée before the first gated one.
--
-- Nothing in this file changes a scoring rule, a captain, chip or transfer
-- rule, a price, or live match data.
--
-- How it is applied. Functions are wrapped (renamed to *_before_publication,
-- then a function of the old name checks the gate and calls it), the same method
-- as 20260927140000 and 20261018215311, so no reviewed body is copied. The four
-- fan-facing views of 20261018215311 are redefined with one extra condition.
--
-- Readers. A gated journée that is not yet published is hidden from the
-- visible_* views (team results, player points, point events, substitutions),
-- so every reader built on them (points, history, round recap, public recap,
-- top players, briefing) treats it as unpublished. "Published" means the
-- journée was released AND its overall ranking exists, so the few seconds the
-- worker spends writing the results are not shown either.

-- 1. Settings and decisions -----------------------------------------------------

create table app_private.fantasy_publication_settings (
  season_id uuid primary key references app.fantasy_seasons(id),
  first_gameweek integer not null default 6 check (first_gameweek between 1 and 1000),
  updated_at timestamptz not null default statement_timestamp()
);
comment on table app_private.fantasy_publication_settings is
  'Per Fantasy season: the first gameweek sequence whose points are published all at once. A season without a row uses 6. Use 1000 to switch the rule off for a season.';

create table app_private.fantasy_publication_state (
  gameweek_id uuid primary key references app.fantasy_gameweeks(id),
  first_slot_at timestamptz,
  deferred_until timestamptz,
  released_at timestamptz,
  last_evaluated_at timestamptz,
  last_outcome text check (last_outcome in (
    'matches_unfinished', 'before_publish_time', 'gameweek_not_provisional',
    'ratings_pending', 'released'))
);
comment on table app_private.fantasy_publication_state is
  'One row per gated gameweek once the worker looked at it: the first publish-not-before time seen, the next slot after a pending-rating decision (deferred_until), and when it was released.';

alter table app_private.fantasy_publication_settings enable row level security;
alter table app_private.fantasy_publication_settings force row level security;
alter table app_private.fantasy_publication_state enable row level security;
alter table app_private.fantasy_publication_state force row level security;
revoke all on app_private.fantasy_publication_settings, app_private.fantasy_publication_state
  from public, anon, authenticated, service_role;

-- 2. The rule, as functions -------------------------------------------------------

-- Which gameweek sequence a season starts publishing all at once from.
create function app_private.fantasy_publication_first_gameweek(p_season_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select s.first_gameweek from app_private.fantasy_publication_settings s
    where s.season_id = p_season_id), 6);
$$;

-- A gameweek is gated when its season scores native ratings from it and its
-- sequence is at or past the season's first gated gameweek. A settled
-- gameweek is never gated (its points are out).
create function app_private.fantasy_publication_gated(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from app.fantasy_gameweeks g
    join app_private.fantasy_api_rating_seasons p on p.season_id = g.fantasy_season_id
    where g.id = p_gameweek_id
      and g.status not in ('finalized', 'corrected', 'cancelled')
      and g.sequence_number >= p.from_gameweek
      and g.sequence_number >= app_private.fantasy_publication_first_gameweek(g.fantasy_season_id));
$$;

-- The next 14:00 in Morocco strictly after the given moment. Morocco's clock is
-- read through the helpers of 20261016090000 (the application's rule, whatever
-- time-zone data the database carries), never through the zone name.
create function app_private.fantasy_publication_next_slot(p_after timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select app_private.morocco_instant(
    case when app_private.morocco_local(p_after)::time < time '14:00'
      then app_private.morocco_local_date(p_after) + time '14:00'
      else app_private.morocco_local_date(p_after) + 1 + time '14:00' end);
$$;

-- Publish not before: two Moroccan days after the latest counted match ended,
-- at 14:00 Moroccan time. Null until every counted match is finished.
create function app_private.fantasy_publish_not_before(p_gameweek_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case
    when count(*) = 0 or count(*) filter (where f.status <> 'finished' or f.finalized_at is null) > 0 then null
    else app_private.morocco_instant(app_private.morocco_local_date(max(f.finalized_at)) + 2 + time '14:00')
  end
  from app.fantasy_fixture_assignments a
  join app.fixtures f on f.id = a.fixture_id
  where a.gameweek_id = p_gameweek_id and a.superseded_at is null and a.counts_points;
$$;

-- The publication moment the fans are told: publish-not-before, or the next
-- slot once a decision found a rating pending. Null while it cannot be known.
create function app_private.fantasy_publication_slot(p_gameweek_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case when pnb is null then null
    else greatest(pnb, coalesce((select s.deferred_until from app_private.fantasy_publication_state s
      where s.gameweek_id = p_gameweek_id), pnb)) end
  from (select app_private.fantasy_publish_not_before(p_gameweek_id) as pnb) x;
$$;

-- Published to fans: the journée was released and its overall ranking exists.
create view app_private.fantasy_unpublished_gameweeks with (security_invoker = true) as
select g.id as gameweek_id
from app.fantasy_gameweeks g
where g.status not in ('finalized', 'corrected', 'cancelled')
  and app_private.fantasy_publication_gated(g.id)
  and not exists (
    select 1 from app_private.fantasy_publication_state s
    where s.gameweek_id = g.id and s.released_at is not null
      and exists (select 1 from app.fantasy_rankings k
        where k.gameweek_id = g.id and k.league_id is null));
revoke all on app_private.fantasy_unpublished_gameweeks from public, anon, authenticated, service_role;

-- Were all ratings in at the given moment? Every counted match has a rating
-- source captured at or before it that is ready, and was not made ready only by
-- a Not-rated settlement recorded after it. (A source that is ready now but was
-- captured, or settled, after the moment does not count.)
create function app_private.fantasy_publication_ready_at(p_gameweek_id uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1
    from app.fantasy_fixture_assignments a
    where a.gameweek_id = p_gameweek_id and a.superseded_at is null and a.counts_points
      and not coalesce((
        select src.ready and not exists (
          select 1 from app_private.fantasy_not_rated_settlements n
          where n.source_id = src.id and n.settled_at > p_at)
        from app_private.fantasy_api_rating_sources src
        where src.fixture_id = a.fixture_id and src.captured_at <= p_at
        order by src.id desc limit 1), false));
$$;

-- Decide, and record the decision. p_now is a parameter so the rule can be
-- tested at any moment; the service function passes statement_timestamp().
-- The decision is made at the SLOT, not at the moment the worker happens to
-- look: a journée is released only if every rating was ready at or before a
-- slot that has come (and none is pending now). If the last rating arrived
-- after the slot, the journée waits for the next one; slots already past are
-- walked in order, so a late look cannot release early or skip a day.
create function app_private.fantasy_publication_evaluate_at(p_gameweek_id uuid, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g app.fantasy_gameweeks%rowtype;
  st app_private.fantasy_publication_state%rowtype;
  pnb timestamptz;
  slot timestamptz;
  outcome text;
  guard integer := 0;
begin
  select * into g from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if not app_private.fantasy_publication_gated(g.id) then
    return jsonb_build_object('gated', false, 'released', true, 'held', false);
  end if;
  insert into app_private.fantasy_publication_state(gameweek_id) values (g.id) on conflict do nothing;
  select * into st from app_private.fantasy_publication_state where gameweek_id = g.id for update;
  if st.released_at is not null then
    return jsonb_build_object('gated', true, 'released', true, 'held', false,
      'publishAt', st.released_at, 'outcome', st.last_outcome);
  end if;

  pnb := app_private.fantasy_publish_not_before(g.id);
  if pnb is not null and st.first_slot_at is null then
    update app_private.fantasy_publication_state set first_slot_at = pnb where gameweek_id = g.id;
  end if;

  if pnb is null then
    outcome := 'matches_unfinished';
  else
    slot := greatest(pnb, coalesce(st.deferred_until, pnb));
    if p_now < slot then
      outcome := 'before_publish_time';
    elsif g.status not in ('provisional', 'finalizing') then
      outcome := 'gameweek_not_provisional';
    elsif app_private.fantasy_selection_ratings_pending(g.id) then
      -- Not ready now: the whole journée waits for the next slot, even if the
      -- last rating arrives a minute later. This is checked before anything
      -- that was already written can release it.
      slot := app_private.fantasy_publication_next_slot(p_now);
      update app_private.fantasy_publication_state
      set deferred_until = slot, last_evaluated_at = p_now, last_outcome = 'ratings_pending'
      where gameweek_id = g.id;
      return jsonb_build_object('gated', true, 'released', false, 'held', true,
        'publishNotBefore', pnb, 'publishAt', slot, 'outcome', 'ratings_pending');
    else
      -- Ready now. Was it ready at the slot that has come? Walk the slots that
      -- are past until one found everything ready.
      while slot <= p_now and not app_private.fantasy_publication_ready_at(g.id, slot) and guard < 400 loop
        slot := app_private.fantasy_publication_next_slot(slot);
        guard := guard + 1;
      end loop;
      if slot > p_now then
        update app_private.fantasy_publication_state
        set deferred_until = slot, last_evaluated_at = p_now, last_outcome = 'ratings_pending'
        where gameweek_id = g.id;
        return jsonb_build_object('gated', true, 'released', false, 'held', true,
          'publishNotBefore', pnb, 'publishAt', slot, 'outcome', 'ratings_pending');
      end if;
      update app_private.fantasy_publication_state
      set released_at = p_now, last_evaluated_at = p_now, last_outcome = 'released'
      where gameweek_id = g.id;
      return jsonb_build_object('gated', true, 'released', true, 'held', false,
        'publishNotBefore', pnb, 'publishAt', p_now, 'outcome', 'released');
    end if;
  end if;

  update app_private.fantasy_publication_state
  set last_evaluated_at = p_now, last_outcome = outcome where gameweek_id = g.id;
  return jsonb_build_object('gated', true, 'released', false, 'held', true,
    'publishNotBefore', pnb,
    'publishAt', case when pnb is null then null
      else greatest(pnb, coalesce(st.deferred_until, pnb)) end,
    'outcome', outcome);
end $$;

-- The state the lifecycle state RPC reports, at a given moment.
create function app_private.fantasy_publication_state_json(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not app_private.fantasy_publication_gated(p_gameweek_id) then '{}'::jsonb
    else jsonb_build_object(
      'publicationGated', true,
      'publicationReleased', coalesce(s.released_at is not null, false),
      'publicationHeld', s.released_at is null,
      'publishNotBefore', app_private.fantasy_publish_not_before(p_gameweek_id),
      'publishAt', app_private.fantasy_publication_slot(p_gameweek_id))
    end
  from (select p_gameweek_id as gameweek_id) x
  left join app_private.fantasy_publication_state s on s.gameweek_id = x.gameweek_id;
$$;

-- The write functions call this: a gated journée that was not released refuses.
create function app_private.fantasy_assert_publication_released(p_gameweek_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if app_private.fantasy_publication_gated(p_gameweek_id)
    and not exists (select 1 from app_private.fantasy_publication_state s
      where s.gameweek_id = p_gameweek_id and s.released_at is not null) then
    raise exception using errcode = 'PT409', message = 'fantasy_publication_held';
  end if;
end $$;

revoke all on function app_private.fantasy_publication_first_gameweek(uuid),
  app_private.fantasy_publication_gated(uuid), app_private.fantasy_publication_next_slot(timestamptz),
  app_private.fantasy_publish_not_before(uuid), app_private.fantasy_publication_slot(uuid),
  app_private.fantasy_publication_evaluate_at(uuid, timestamptz), app_private.fantasy_publication_ready_at(uuid, timestamptz),
  app_private.fantasy_publication_state_json(uuid), app_private.fantasy_assert_publication_released(uuid)
  from public, anon, authenticated, service_role;

comment on function app_private.fantasy_publish_not_before(uuid) is
  'Publish not before: the Moroccan date of the latest finalized_at among the counted matches, plus two days, at 14:00 Moroccan time. Null until every counted match is finished.';
comment on function app_private.fantasy_publication_evaluate_at(uuid, timestamptz) is
  'Decides, at the given moment, whether a gated journée may publish: at or after its slot and no rating pending releases it; a pending rating moves the slot to the next 14:00 Moroccan time. Recorded in app_private.fantasy_publication_state.';

-- 3. The service function the worker calls ----------------------------------------

create function api.service_evaluate_fantasy_publication(p_gameweek_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  return app_private.fantasy_publication_evaluate_at(p_gameweek_id, statement_timestamp());
end $$;
revoke all on function api.service_evaluate_fantasy_publication(uuid) from public, anon, authenticated;
grant execute on function api.service_evaluate_fantasy_publication(uuid) to service_role;
comment on function api.service_evaluate_fantasy_publication(uuid) is
  'Service role: decide whether a gated journée may publish its points now (its slot has come and no rating is pending). Returns {gated, released, held, publishAt, outcome}.';

-- 4. The lifecycle state says it ---------------------------------------------------

alter function api.service_fantasy_lifecycle_state(uuid) rename to fantasy_lifecycle_state_before_publication;
alter function api.fantasy_lifecycle_state_before_publication(uuid) set schema app_private;
revoke all on function app_private.fantasy_lifecycle_state_before_publication(uuid)
  from public, anon, authenticated, service_role;
create function api.service_fantasy_lifecycle_state(p_gameweek_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app_private.fantasy_lifecycle_state_before_publication(p_gameweek_id)
    || app_private.fantasy_publication_state_json(p_gameweek_id);
$$;
revoke all on function api.service_fantasy_lifecycle_state(uuid) from public, anon, authenticated;
grant execute on function api.service_fantasy_lifecycle_state(uuid) to service_role;

-- 5. The database refuses to publish before release ------------------------------------

alter function api.service_prepare_fantasy_live_scoring(uuid)
  rename to service_prepare_fantasy_live_scoring_before_publication;
revoke all on function api.service_prepare_fantasy_live_scoring_before_publication(uuid)
  from public, anon, authenticated, service_role;
create function api.service_prepare_fantasy_live_scoring(p_gameweek_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  perform app_private.fantasy_assert_publication_released(p_gameweek_id);
  return api.service_prepare_fantasy_live_scoring_before_publication(p_gameweek_id);
end $$;
revoke all on function api.service_prepare_fantasy_live_scoring(uuid) from public, anon, authenticated;
grant execute on function api.service_prepare_fantasy_live_scoring(uuid) to service_role;

-- The result writer is patched in place (like 20261019172832), so its reviewed
-- body, and the tests that read it, stay where they are: one line is added.
do $persist$
declare
  source text;
  anchor constant text := 'if gw.status<>''provisional'' and not (gw.status=''live'' and (app_private.fantasy_adaptive_enabled(gw.id) or app_private.fantasy_live_scoring_enabled(gw.id))) then raise exception using errcode=''PT409'',message=''gameweek_not_scorable''; end if;';
begin
  if md5((select prosrc from pg_proc
    where oid = 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
    is distinct from 'ac72c2f5bc7b1d69ac68d4aea79bfe32' then
    raise exception 'publication_gate_unexpected_persist_body';
  end if;
  source := pg_get_functiondef('api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure);
  if (length(source) - length(replace(source, anchor, ''))) <> length(anchor) then
    raise exception 'publication_gate_persist_anchor_not_unique';
  end if;
  execute replace(source, anchor,
    'perform app_private.fantasy_assert_publication_released(gw.id);' || E'\n  ' || anchor);
end
$persist$;

alter function api.service_begin_fantasy_finalization(uuid, bigint, text)
  rename to service_begin_fantasy_finalization_before_publication;
revoke all on function api.service_begin_fantasy_finalization_before_publication(uuid, bigint, text)
  from public, anon, authenticated, service_role;
create function api.service_begin_fantasy_finalization(
  p_gameweek_id uuid, p_calculation_version bigint, p_input_digest text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  perform app_private.fantasy_assert_publication_released(p_gameweek_id);
  return api.service_begin_fantasy_finalization_before_publication(
    p_gameweek_id, p_calculation_version, p_input_digest);
end $$;
revoke all on function api.service_begin_fantasy_finalization(uuid, bigint, text) from public, anon, authenticated;
grant execute on function api.service_begin_fantasy_finalization(uuid, bigint, text) to service_role;

-- The overall ranking (no gameweek) only sums what is already published.
alter function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint)
  rename to service_recalculate_fantasy_rankings_before_publication;
revoke all on function api.service_recalculate_fantasy_rankings_before_publication(uuid, uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
create function api.service_recalculate_fantasy_rankings(
  p_season_id uuid, p_gameweek_id uuid default null, p_league_id uuid default null,
  p_calculation_version bigint default 1
) returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_gameweek_id is not null then
    perform app_private.fantasy_assert_publication_released(p_gameweek_id);
  end if;
  return api.service_recalculate_fantasy_rankings_before_publication(
    p_season_id, p_gameweek_id, p_league_id, p_calculation_version);
end $$;
revoke all on function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function api.service_recalculate_fantasy_rankings(uuid, uuid, uuid, bigint) to service_role;

-- 6. Fan readers: an unpublished gated journée is not there ---------------------------

create or replace view app_private.fantasy_visible_team_results with (security_invoker = true) as
select r.* from app.fantasy_team_gameweek_results r
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = r.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_team_gameweek_results, to_jsonb(r) || jsonb_build_object(
 'starting_points', t->'startingPoints', 'bench_points', t->'benchPoints', 'captain_points', t->'captainPoints',
 'transfer_hit', t->'transferHit', 'provisional_score', t->'provisionalScore', 'final_score', null,
 'state', 'provisional', 'finalized_at', null, 'calculation_version', p.calculation_version,
 'scoring_details', t, 'updated_at', p.published_at,
 'rank', (select k.rank from app.fantasy_rankings k where k.gameweek_id = r.gameweek_id and k.league_id is null and k.fantasy_team_id = r.fantasy_team_id),
 'overall_rank', (select k.rank from app.fantasy_rankings k where k.fantasy_season_id = g.fantasy_season_id and k.gameweek_id is null and k.league_id is null and k.fantasy_team_id = r.fantasy_team_id)
))).*
from app.fantasy_team_gameweek_results r join app.fantasy_gameweeks g on g.id = r.gameweek_id
join app_private.fantasy_current_rating_publications p on p.gameweek_id = r.gameweek_id
cross join lateral jsonb_array_elements(p.results->'teamResults') t
where t->>'teamId' = r.fantasy_team_id::text;

create or replace view app_private.fantasy_visible_player_points with (security_invoker = true) as
select r.* from app.fantasy_player_gameweek_points r
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = r.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id)
union all
select c.fantasy_player_id, c.gameweek_id, c.provisional_points, null::integer, c.minutes_played, c.did_play,
 p.calculation_version, c.football_input_version, null::timestamptz, p.published_at, p.published_at
from app_private.fantasy_published_rating_players c
join app_private.fantasy_current_rating_publications p on p.id = c.publication_id;

create or replace view app_private.fantasy_visible_point_events with (security_invoker = true) as
select r.* from app.fantasy_player_point_events r
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = r.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id)
union all
select md5(p.id::text || ':' || c.fantasy_player_id::text || ':' || (ev->>'fixtureId') || ':' || (ev->>'category'))::uuid,
 c.fantasy_player_id, c.gameweek_id, (ev->>'fixtureId')::uuid, null::uuid, ev->>'category', (ev->>'points')::integer,
 'provisional'::app.fantasy_points_state, 3, p.calculation_version, ev->>'sourceKey', null::timestamptz, p.published_at, p.published_at
from app_private.fantasy_published_rating_players c
join app_private.fantasy_current_rating_publications p on p.id = c.publication_id
cross join lateral jsonb_array_elements(c.events) ev;

create or replace view app_private.fantasy_visible_substitutions with (security_invoker = true) as
select r.* from app.fantasy_auto_substitutions r join app.fantasy_lineups l on l.id = r.lineup_id
where not exists (select 1 from app_private.fantasy_current_rating_publications p where p.gameweek_id = l.gameweek_id)
  and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = l.gameweek_id)
union all
select (jsonb_populate_record(null::app.fantasy_auto_substitutions, jsonb_build_object(
 'id', md5(p.id::text || ':' || (t->>'lineupId') || ':' || ord::text)::uuid, 'lineup_id', t->'lineupId',
 'player_out_id', s->'playerOutId', 'player_in_id', s->'playerInId', 'sequence_number', ord,
 'reason', s->'reason', 'calculation_version', p.calculation_version, 'created_at', p.published_at
))).*
from app_private.fantasy_current_rating_publications p
cross join lateral jsonb_array_elements(p.results->'teamResults') t
cross join lateral jsonb_array_elements(t->'substitutions') with ordinality x(s, ord);

-- Standings. A gated journée that is not published has no row of its own, and
-- the season and league totals that were written with it (points can be written
-- before the gate is switched on, or while a release is under way) are shown
-- without it: its score is taken off every total, the ranks are worked out
-- again on what is shown, and the journée's own points column is empty.
create view app_private.fantasy_held_result_seasons with (security_invoker = true) as
select distinct g.fantasy_season_id as season_id
from app_private.fantasy_unpublished_gameweeks h
join app.fantasy_gameweeks g on g.id = h.gameweek_id
where exists (select 1 from app.fantasy_team_gameweek_results r where r.gameweek_id = h.gameweek_id);
revoke all on app_private.fantasy_held_result_seasons from public, anon, authenticated, service_role;

create view app_private.fantasy_visible_rankings with (security_invoker = true) as
select r.* from app.fantasy_rankings r
where (r.gameweek_id is not null
    and not exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = r.gameweek_id))
  or (r.gameweek_id is null
    and r.fantasy_season_id not in (select season_id from app_private.fantasy_held_result_seasons))
union all
select (jsonb_populate_record(null::app.fantasy_rankings, to_jsonb(x) || jsonb_build_object(
  'total_points', x.shown_total, 'gameweek_points', null,
  'rank', rank() over (partition by x.fantasy_season_id, x.league_id order by x.shown_total desc, x.rank, x.fantasy_team_id)
))).*
from (
  select r.*, r.total_points - coalesce((
    select sum(coalesce(t.final_score, t.provisional_score))
    from app.fantasy_team_gameweek_results t
    where t.fantasy_team_id = r.fantasy_team_id
      and t.gameweek_id in (select h.gameweek_id from app_private.fantasy_unpublished_gameweeks h)), 0) as shown_total
  from app.fantasy_rankings r
  where r.gameweek_id is null
    and r.fantasy_season_id in (select season_id from app_private.fantasy_held_result_seasons)
) x;
revoke all on app_private.fantasy_visible_rankings from public, anon, authenticated, service_role;

-- The readers that took standings and journée points straight from the tables
-- read the visible views instead. Patched from pg_get_functiondef; each must
-- change, so nothing is silently left as it was.
do $readers$
declare
  sig text;
  source text;
  changed text;
begin
  foreach sig in array array[
    'api.fantasy_hub(text)',
    'api.fantasy_leagues(uuid,text,integer)',
    'api.fantasy_league_standings(uuid,uuid,bigint,uuid,integer)',
    'api.fantasy_overall_standings(uuid,uuid,bigint,uuid,integer)',
    'api.get_my_rivals(text)',
    'api.get_my_deadline_briefing(uuid)',
    'app_private.fantasy_hidden_ahead(uuid,uuid,uuid,bigint,boolean)',
    'app_private.rivals_pair(uuid,uuid,uuid)',
    'app_private.round_recap_league(uuid,uuid,uuid,uuid,integer,integer)'
  ] loop
    source := pg_get_functiondef(sig::regprocedure);
    changed := regexp_replace(source, '\mapp\.fantasy_rankings\M', 'app_private.fantasy_visible_rankings', 'g');
    changed := regexp_replace(changed, '\mapp\.fantasy_team_gameweek_results\M', 'app_private.fantasy_visible_team_results', 'g');
    if changed = source then
      raise exception 'publication_gate_reader_unchanged: %', sig;
    end if;
    execute changed;
  end loop;
end
$readers$;

-- The owner's points read: say the journée is waiting, and show no rating
-- progress for it (the pending flags come from the live rating document).
alter function api.get_my_fantasy_points(uuid, uuid) rename to get_my_fantasy_points_before_hold;
revoke all on function api.get_my_fantasy_points_before_hold(uuid, uuid) from public, anon, authenticated, service_role;
create function api.get_my_fantasy_points(p_team_id uuid, p_gameweek_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb; held boolean;
begin
  perform app_private.assert_mfa_step_up();
  d := api.get_my_fantasy_points_before_hold(p_team_id, p_gameweek_id);
  held := exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = p_gameweek_id);
  if not held then
    return d;
  end if;
  return (d - 'ratingPublication' - 'incrementalScoring' - 'result' - 'autoSubstitutions' - 'players')
    || jsonb_build_object(
      'result', null,
      'autoSubstitutions', '[]'::jsonb,
      'players', coalesce((select jsonb_agg(player || jsonb_build_object(
          'ratingPending', false, 'provisionalPoints', null, 'finalPoints', null, 'didPlay', null,
          'events', '[]'::jsonb) order by ord)
        from jsonb_array_elements(d->'players') with ordinality x(player, ord)), '[]'::jsonb),
      'pointsState', 'provisional',
      'publicationHeld', true,
      'publishAt', app_private.fantasy_publication_slot(p_gameweek_id));
end $$;
revoke all on function api.get_my_fantasy_points(uuid, uuid) from public, anon;
grant execute on function api.get_my_fantasy_points(uuid, uuid) to authenticated, service_role;

alter function api.fantasy_gameweek_summary(uuid) rename to fantasy_gameweek_summary_before_hold;
revoke all on function api.fantasy_gameweek_summary_before_hold(uuid) from public, anon, authenticated, service_role;
create function api.fantasy_gameweek_summary(p_gameweek_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from app_private.fantasy_unpublished_gameweeks h where h.gameweek_id = p_gameweek_id)
    then (api.fantasy_gameweek_summary_before_hold(p_gameweek_id)
      - 'averagePoints' - 'highestPoints' - 'teamCount' - 'pointsState')
      || jsonb_build_object('averagePoints', null, 'highestPoints', null, 'teamCount', 0,
        'pointsState', 'provisional', 'publicationHeld', true,
        'publishAt', app_private.fantasy_publication_slot(p_gameweek_id))
    else api.fantasy_gameweek_summary_before_hold(p_gameweek_id) end;
$$;
revoke all on function api.fantasy_gameweek_summary(uuid) from public;
grant execute on function api.fantasy_gameweek_summary(uuid) to anon, authenticated, service_role;

-- The gameweek list the screens read says which journées wait, and until when.
create or replace function api.fantasy_gameweeks(p_season_id uuid, p_before_sequence integer default null, p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  with page as (
    select gameweek.id, gameweek.sequence_number, gameweek.name,
      gameweek.deadline_at, gameweek.starts_at, gameweek.ends_at,
      gameweek.status, gameweek.points_state, gameweek.closed_at,
      exists (select 1 from app_private.fantasy_unpublished_gameweeks h
        where h.gameweek_id = gameweek.id) as publication_held
    from app.fantasy_gameweeks gameweek
    where gameweek.fantasy_season_id = p_season_id
      and (p_before_sequence is null or gameweek.sequence_number < p_before_sequence)
    order by gameweek.sequence_number desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'sequence', sequence_number, 'name', name,
      'deadlineAt', deadline_at, 'startsAt', starts_at, 'endsAt', ends_at,
      'status', status, 'pointsState', points_state,
      'closedAt', closed_at,
      'publicationHeld', publication_held,
      'publishAt', case when publication_held then app_private.fantasy_publication_slot(id) end
    ) order by sequence_number desc), '[]'::jsonb),
    'nextCursor', case when count(*) = p_limit then min(sequence_number) else null end
  ) into result from page;
  return result;
end $$;

notify pgrst, 'reload schema';
