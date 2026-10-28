-- Pépites ranks this season's players from SportAPI's ratings.
--
-- Owner request 2026-10-28: "use sports API ratings to rank the players".
--
-- Why: after round 4 of 2026-27 no edition could be made. Nine finished
-- matches (four of round 4, five of round 5) had no rows in
-- app.player_fixture_performances and two more had one side only, so the
-- young players' minutes were undercounted: 9 were ranked, and an edition
-- needs 10. SportAPI (RapidAPI, Sofascore's data) has a complete capture of
-- every one of those matches in app_private.fantasy_api_rating_sources, the
-- feed Fantasy already scores from: minutes, start and rating for each
-- player. Read on production the same day, it makes 21 under-23 players
-- reach 180 minutes after round 4 instead of 10.
--
-- What changes: app_private.pepites_source_appearances, the one reader every
-- Pépites input goes through (gather, fingerprint, frozen stats). For a
-- weekly run, a counted match whose newest SportAPI capture is ready (no
-- uncertain player, every player who appeared rated) and was stored before
-- the run's cutoff gives:
--   - minutes, started and rating: from the capture, for every player whose
--     SportAPI id maps to one of ours (active `sofascore` player mapping);
--   - goals, assists and saves: from the performance row when the match has
--     one (unchanged), otherwise goals and assists from the match events and
--     saves unknown (NULL, which the engine treats as unknown, not 0).
-- A player the capture does not name with one of our identities keeps his
-- performance row for that match. Every other match reads
-- app.player_fixture_performances exactly as before.
-- Season-final runs (the 2025-26 final ranking) are untouched.
--
-- Sealed runs keep their snapshot, so published editions, the 2025-26 final
-- ranking and pepites_replay are unchanged. The next tick sees a new
-- fingerprint for the latest completed round and scores a new revision.

do $$
begin
  if to_regprocedure('app_private.pepites_source_appearances(uuid,text,integer,timestamptz)') is null
    or to_regclass('app_private.fantasy_api_rating_sources') is null
    or to_regclass('app_private.football_provider_mappings') is null
    or to_regclass('app.match_events') is null then
    raise exception 'pepites_sportapi_ratings_missing_dependency';
  end if;
end $$;

create or replace function app_private.pepites_source_appearances(
  p_season_id uuid,
  p_kind text,
  p_round integer,
  p_cutoff timestamptz
)
returns table (player_id uuid, fixture_id uuid, team_id uuid, round_number integer,
  kickoff_at timestamptz, minutes integer, started boolean, goals integer, assists integer,
  saves integer, rating numeric, team_conceded integer)
language sql
stable
security definer
set search_path = ''
as $$
  with counted as (
    select counted.*
    from app_private.pepites_source_team_fixtures(p_season_id, p_kind, p_round, p_cutoff) counted
  ),
  -- The newest SportAPI capture of each counted match stored before the
  -- cutoff, used only when it is complete. A match whose newest capture is
  -- not ready yet falls back to the performance rows below.
  latest as (
    select distinct on (source.fixture_id) source.fixture_id, source.players, source.ready
    from app_private.fantasy_api_rating_sources source
    where p_kind = 'weekly'
      and source.created_at < p_cutoff
      and source.fixture_id in (select counted.fixture_id from counted)
    order by source.fixture_id, source.id desc
  ),
  rated as (
    select latest.fixture_id, latest.players from latest where latest.ready
  ),
  captured as (
    -- Every player of a ready capture with one of our identities, whether
    -- he played or not. One row per player and match: two SportAPI ids
    -- never map to one player today, and if they did the longer appearance
    -- would count.
    select distinct on (rated.fixture_id, mapping.internal_entity_id)
      rated.fixture_id, mapping.internal_entity_id as player_id,
      (entry ->> 'side') = 'home' as home,
      coalesce((entry ->> 'minutes')::integer, 0) as minutes,
      coalesce((entry ->> 'starter')::boolean, false) as started,
      (entry ->> 'rating')::numeric as rating
    from rated
    cross join lateral jsonb_array_elements(rated.players) entry
    join app_private.football_provider_mappings mapping
      on mapping.provider_name = 'sofascore' and mapping.entity_type = 'player'
      and mapping.active and mapping.external_id = entry ->> 'externalId'
    order by rated.fixture_id, mapping.internal_entity_id,
      coalesce((entry ->> 'minutes')::integer, 0) desc
  ),
  api_rows as (
    select captured.* from captured where captured.minutes > 0
  ),
  scored as (
    select event.fixture_id, event.player_id, count(*)::integer as goals
    from app.match_events event
    where event.fixture_id in (select rated.fixture_id from rated)
      and event.event_type in ('goal', 'penalty_goal') and event.player_id is not null
    group by event.fixture_id, event.player_id
  ),
  assisted as (
    select event.fixture_id, event.related_player_id as player_id, count(*)::integer as assists
    from app.match_events event
    where event.fixture_id in (select rated.fixture_id from rated)
      and event.event_type in ('goal', 'penalty_goal') and event.related_player_id is not null
    group by event.fixture_id, event.related_player_id
  )
  select api.player_id, api.fixture_id, counted.team_id, counted.round_number,
    counted.kickoff_at, api.minutes, api.started,
    case when performance.id is not null then performance.goals else coalesce(scored.goals, 0) end,
    case when performance.id is not null then performance.assists else coalesce(assisted.assists, 0) end,
    performance.saves, api.rating, counted.team_conceded
  from api_rows api
  join counted on counted.fixture_id = api.fixture_id and counted.home = api.home
  left join app.player_fixture_performances performance
    on performance.fixture_id = api.fixture_id and performance.player_id = api.player_id
    and performance.football_season_id = p_season_id and performance.active
  left join scored on scored.fixture_id = api.fixture_id and scored.player_id = api.player_id
  left join assisted on assisted.fixture_id = api.fixture_id and assisted.player_id = api.player_id

  union all

  select performance.player_id, performance.fixture_id, performance.team_id, counted.round_number,
    counted.kickoff_at, performance.minutes, performance.started, performance.goals,
    performance.assists, performance.saves, performance.provider_rating, counted.team_conceded
  from app.player_fixture_performances performance
  join counted
    on counted.fixture_id = performance.fixture_id and counted.team_id = performance.team_id
  where performance.football_season_id = p_season_id
    and performance.active
    and performance.minutes > 0
    -- A rated match's rows stay for a player the capture does not name with
    -- one of our identities, so his minutes there are not lost.
    and not exists (
      select 1 from captured
      where captured.fixture_id = performance.fixture_id
        and captured.player_id = performance.player_id
    );
$$;

revoke all on function app_private.pepites_source_appearances(uuid, text, integer, timestamptz)
  from public, anon, authenticated, service_role;
