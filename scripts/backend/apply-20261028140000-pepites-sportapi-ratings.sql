-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261028140000_pepites_sportapi_ratings: Pépites ranks this season's
-- players from SportAPI's ratings (owner request, 2026-10-28).
--
-- WHEN
--   Any time after the pull request that adds this file is merged. It only
--   re-creates app_private.pepites_source_appearances and writes no Pépites
--   table. It holds the `pepites_tick` lock for its length, so a tick that
--   starts meanwhile exits at once and the next one (within 15 minutes) reads
--   the new source; if a tick is running when it starts, it stops: run it
--   again a minute later.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      applied inside one transaction, checked, then ROLLED BACK. The result
--      row should say "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and run again.
--      The result row should say "Applied".
--   If a check fails the script stops with a message and nothing is saved. Do
--   not edit a check to make it pass.
--
-- WHAT IT DOES
--   * refuses to run twice, before 20260926212632, while a Pépites tick runs,
--     or where pepites_source_appearances is not the version 20260926090000
--     left (md5 of its definition as production held it on 2026-10-28);
--   * keeps the input fingerprint of the activated season-final run (the
--     2025-26 final ranking);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: the function reads the SportAPI captures, visitors
--     still cannot call it, the season-final inputs are unchanged, and the
--     current season's appearances have one row per player and match.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local timezone = 'UTC';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261028140000') then
    raise exception 'stop: migration 20261028140000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926212632') then
    raise exception 'stop: migration 20260926212632 (Pépites frozen stats) is not applied -- this update follows it';
  end if;
  if to_regprocedure('app_private.pepites_source_appearances(uuid,text,integer,timestamptz)') is null then
    raise exception 'stop: app_private.pepites_source_appearances does not exist';
  end if;
  if md5(pg_get_functiondef('app_private.pepites_source_appearances(uuid,text,integer,timestamptz)'::regprocedure))
    is distinct from '4a6a9066e1c45684c5a7e647e9aac14a' then
    raise exception 'stop: app_private.pepites_source_appearances is not the version 20260926090000 left -- something changed it since';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('pepites_tick', 0)) then
    raise exception 'stop: a Pépites tick is running right now -- run this again in a minute';
  end if;
end
$preflight$;

-- The 2025-26 final ranking's inputs as the current version gathers them.
select set_config(
  'botolago.pepites_final_before',
  coalesce((
    select app_private.pepites_input_fingerprint(run.season_id, run.kind, run.as_of_round_number,
      run.input_cutoff_at, (methodology.params ->> 'age_limit')::integer)
    from app.pepites_runs run
    join app.pepites_methodologies methodology on methodology.version = run.methodology_version
    where run.kind = 'season_final' and run.activated_at is not null
    order by run.activated_at desc limit 1), 'none'),
  true
);

-- ---------------------------------------------------------------------------
-- Migration 20261028140000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261028140000',
  'pepites_sportapi_ratings',
  array[$bg_20261028140000_file$-- Pépites ranks this season's players from SportAPI's ratings.
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
$bg_20261028140000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261028140000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261028140000'
  );
begin
  if encode(sha256(convert_to(part_20261028140000, 'UTF8')), 'hex')
    is distinct from 'd618e67800ffc3c522d9901a3858b610680444c0a0496006b6169c232600f9c9' then
    raise exception 'stop: 20261028140000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261028140000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  source constant regprocedure := 'app_private.pepites_source_appearances(uuid,text,integer,timestamptz)'::regprocedure;
  final_after text;
  season uuid;
  latest_round integer;
  appearances integer;
  pairs integer;
  from_captures integer;
begin
  if pg_get_functiondef(source) !~ 'fantasy_api_rating_sources' then
    problems := problems || 'the source does not read the SportAPI captures'::text;
  end if;
  if has_function_privilege('anon', source, 'execute')
    or has_function_privilege('authenticated', source, 'execute')
    or has_function_privilege('service_role', source, 'execute') then
    problems := problems || 'the source is reachable from the API'::text;
  end if;

  select coalesce((
    select app_private.pepites_input_fingerprint(run.season_id, run.kind, run.as_of_round_number,
      run.input_cutoff_at, (methodology.params ->> 'age_limit')::integer)
    from app.pepites_runs run
    join app.pepites_methodologies methodology on methodology.version = run.methodology_version
    where run.kind = 'season_final' and run.activated_at is not null
    order by run.activated_at desc limit 1), 'none') into final_after;
  if final_after is distinct from current_setting('botolago.pepites_final_before', true) then
    problems := problems || 'the 2025-26 final ranking''s inputs changed'::text;
  end if;

  select run.season_id, max(run.as_of_round_number) into season, latest_round
  from app.pepites_runs run
  join app.seasons s on s.id = run.season_id and s.is_current
  where run.kind = 'weekly' and run.status = 'succeeded'
  group by run.season_id;
  if season is not null then
    select count(*), count(distinct (a.player_id, a.fixture_id)),
      count(*) filter (where exists (
        select 1 from app_private.fantasy_api_rating_sources s where s.fixture_id = a.fixture_id and s.ready))
    into appearances, pairs, from_captures
    from app_private.pepites_source_appearances(season, 'weekly', latest_round, statement_timestamp()) a;
    if appearances <> pairs then
      problems := problems || ('the current season has ' || appearances - pairs || ' duplicate player-match rows');
    end if;
    raise notice 'pepites: round % of the current season, % appearances, % from SportAPI-rated matches',
      latest_round, appearances, from_captures;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261028140000') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261028140000')
    then 'Applied. The next pepites-tick run (within 15 minutes) scores a new revision from SportAPI''s ratings.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
