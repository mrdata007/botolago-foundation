alter type app_private.ingestion_job_type add value if not exists 'player_ratings';

create table app.player_season_ratings (
  id uuid primary key default gen_random_uuid(),
  football_season_id uuid not null references app.seasons(id) on delete restrict,
  player_id uuid not null references app.players(id) on delete restrict,
  position app.football_position not null,
  source_provider text not null,
  source_version text not null,
  algorithm_version text not null,
  appearances integer not null,
  starts integer not null,
  minutes integer not null,
  goals integer not null,
  assists integer not null,
  clean_sheets integer not null,
  goals_conceded integer not null,
  saves integer not null,
  penalties_saved integer not null,
  penalties_missed integer not null,
  yellow_cards integer not null,
  red_cards integer not null,
  second_yellow_dismissals integer not null,
  own_goals integer not null,
  provider_rating numeric(4,2),
  fantasy_equivalent_points integer not null,
  points_per_90 numeric(8,3) not null,
  confidence numeric(4,3) not null,
  rating numeric(3,1) not null,
  active boolean not null default true,
  source_updated_at timestamptz not null,
  calculated_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint player_season_ratings_identity_key
    unique (football_season_id, player_id, algorithm_version),
  constraint player_season_ratings_provider_check
    check (source_provider ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint player_season_ratings_source_version_check
    check (source_version = btrim(source_version) and char_length(source_version) between 1 and 100),
  constraint player_season_ratings_algorithm_check
    check (algorithm_version ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(algorithm_version) <= 80),
  constraint player_season_ratings_counts_check
    check (
      appearances >= 0 and starts between 0 and appearances and minutes >= 0
      and minutes <= appearances * 130
      and goals >= 0 and assists >= 0 and clean_sheets >= 0
      and goals_conceded >= 0 and saves >= 0
      and penalties_saved >= 0 and penalties_missed >= 0
      and yellow_cards >= 0 and red_cards >= 0
      and second_yellow_dismissals >= 0 and own_goals >= 0
    ),
  constraint player_season_ratings_provider_rating_check
    check (provider_rating is null or provider_rating between 0 and 10),
  constraint player_season_ratings_confidence_check check (confidence between 0 and 1),
  constraint player_season_ratings_rating_check check (rating between 4 and 10)
);

create unique index player_season_ratings_active_key
  on app.player_season_ratings (football_season_id, player_id)
  where active;
create index player_season_ratings_leaderboard_idx
  on app.player_season_ratings (football_season_id, position, rating desc, player_id)
  where active;
create index player_season_ratings_player_idx
  on app.player_season_ratings (player_id, football_season_id desc, calculated_at desc);

alter table app.player_season_ratings enable row level security;
revoke all on table app.player_season_ratings from public, anon, authenticated;
grant select, insert, update on table app.player_season_ratings to service_role;

create or replace function api.begin_football_ingestion(
  p_provider_name text,
  p_job_type text,
  p_target_scope jsonb default '{}'::jsonb,
  p_checkpoint jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare run_id uuid;
begin
  if not exists (
    select 1 from app_private.football_providers provider
    where provider.name = p_provider_name and provider.active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;
  if p_job_type not in (
    'competitions', 'seasons', 'rounds', 'teams', 'players', 'squads',
    'fixtures', 'standings', 'lineups', 'live_fixtures', 'match_events',
    'match_statistics', 'player_availability', 'finalize_fixtures', 'player_ratings'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_INGESTION_JOB';
  end if;
  insert into app_private.football_ingestion_runs (
    provider_name, job_type, target_scope, checkpoint, status, started_at
  ) values (
    p_provider_name,
    p_job_type::app_private.ingestion_job_type,
    coalesce(p_target_scope, '{}'::jsonb),
    coalesce(p_checkpoint, '{}'::jsonb),
    'running',
    statement_timestamp()
  ) returning id into run_id;
  return run_id;
end;
$$;

create or replace function api.football_player_rating_candidates(
  p_provider_name text,
  p_season_external_id text
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_season as (
    select mapping.internal_entity_id as season_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'season'
      and mapping.external_id = p_season_external_id
      and mapping.active
  ), candidates as (
    select distinct
      player_mapping.external_id,
      player.position,
      player.id
    from selected_season season
    join app.team_memberships membership on membership.season_id = season.season_id
    join app.players player on player.id = membership.player_id and player.active
    join app_private.football_provider_mappings player_mapping
      on player_mapping.provider_name = p_provider_name
      and player_mapping.entity_type = 'player'
      and player_mapping.internal_entity_id = player.id
      and player_mapping.active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'externalPlayerId', external_id,
    'position', case position
      when 'goalkeeper' then 'GK'
      when 'defender' then 'DEF'
      when 'midfielder' then 'MID'
      when 'forward' then 'FWD'
    end
  ) order by id), '[]'::jsonb)
  from candidates
$$;

create or replace function api.ingest_player_season_ratings(
  p_provider_name text,
  p_season_external_id text,
  p_algorithm_version text,
  p_rows jsonb,
  p_observed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_season_id uuid;
  candidate jsonb;
  target_player app.players%rowtype;
  external_player_id text;
  expected_position text;
  candidate_source_version text;
  existing app.player_season_ratings%rowtype;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name <> 'sportsmonks'
    or p_algorithm_version <> 'botolago-preseason-rating-v1'
    or p_observed_at is null or p_observed_at > statement_timestamp() + interval '5 minutes'
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 1 and 50
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  select mapping.internal_entity_id into target_season_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id
    and mapping.active;
  if not found then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  for candidate in select value from jsonb_array_elements(p_rows)
  loop
    external_player_id := candidate ->> 'externalPlayerId';
    expected_position := candidate ->> 'position';
    if external_player_id !~ '^[1-9][0-9]*$'
      or expected_position not in ('GK', 'DEF', 'MID', 'FWD')
      or candidate ->> 'algorithmVersion' <> p_algorithm_version
      or (candidate ->> 'appearances')::integer < 0
      or (candidate ->> 'starts')::integer not between 0 and (candidate ->> 'appearances')::integer
      or (candidate ->> 'minutes')::integer not between 0 and (candidate ->> 'appearances')::integer * 130
      or (candidate ->> 'goals')::integer < 0
      or (candidate ->> 'assists')::integer < 0
      or (candidate ->> 'cleanSheets')::integer < 0
      or (candidate ->> 'goalsConceded')::integer < 0
      or (candidate ->> 'saves')::integer < 0
      or (candidate ->> 'penaltiesSaved')::integer < 0
      or (candidate ->> 'penaltiesMissed')::integer < 0
      or (candidate ->> 'yellowCards')::integer < 0
      or (candidate ->> 'redCards')::integer < 0
      or (candidate ->> 'secondYellowDismissals')::integer < 0
      or (candidate ->> 'ownGoals')::integer < 0
      or (candidate ->> 'confidence')::numeric not between 0 and 1
      or (candidate ->> 'rating')::numeric not between 4 and 10
      or (candidate ->> 'providerRating') is not null
         and (candidate ->> 'providerRating')::numeric not between 0 and 10
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    select player.* into target_player
    from app_private.football_provider_mappings mapping
    join app.players player on player.id = mapping.internal_entity_id
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'player'
      and mapping.external_id = external_player_id
      and mapping.active
    for share of player;
    if not found then
      raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
    end if;
    if expected_position <> (case target_player.position
      when 'goalkeeper' then 'GK'
      when 'defender' then 'DEF'
      when 'midfielder' then 'MID'
      when 'forward' then 'FWD'
    end) then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    if not exists (
      select 1 from app.team_memberships membership
      where membership.season_id = target_season_id and membership.player_id = target_player.id
    ) then
      raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
    end if;

    candidate_source_version := 'sportsmonks:' || left(encode(digest(candidate::text, 'sha256'), 'hex'), 64);
    select * into existing from app.player_season_ratings rating
    where rating.football_season_id = target_season_id
      and rating.player_id = target_player.id
      and rating.algorithm_version = p_algorithm_version
    for update;
    if found and existing.source_version = candidate_source_version then
      update app.player_season_ratings
      set source_updated_at = greatest(source_updated_at, p_observed_at),
          updated_at = statement_timestamp(), active = true
      where id = existing.id;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    update app.player_season_ratings
    set active = false, updated_at = statement_timestamp()
    where football_season_id = target_season_id
      and player_id = target_player.id
      and active
      and algorithm_version <> p_algorithm_version;

    if existing.id is null then
      insert into app.player_season_ratings (
        football_season_id, player_id, position, source_provider, source_version,
        algorithm_version, appearances, starts, minutes, goals, assists,
        clean_sheets, goals_conceded, saves, penalties_saved, penalties_missed,
        yellow_cards, red_cards, second_yellow_dismissals, own_goals,
        provider_rating, fantasy_equivalent_points, points_per_90,
        confidence, rating, active, source_updated_at
      ) values (
        target_season_id, target_player.id, target_player.position,
        p_provider_name, candidate_source_version, p_algorithm_version,
        (candidate ->> 'appearances')::integer,
        (candidate ->> 'starts')::integer,
        (candidate ->> 'minutes')::integer,
        (candidate ->> 'goals')::integer,
        (candidate ->> 'assists')::integer,
        (candidate ->> 'cleanSheets')::integer,
        (candidate ->> 'goalsConceded')::integer,
        (candidate ->> 'saves')::integer,
        (candidate ->> 'penaltiesSaved')::integer,
        (candidate ->> 'penaltiesMissed')::integer,
        (candidate ->> 'yellowCards')::integer,
        (candidate ->> 'redCards')::integer,
        (candidate ->> 'secondYellowDismissals')::integer,
        (candidate ->> 'ownGoals')::integer,
        nullif(candidate ->> 'providerRating', '')::numeric,
        (candidate ->> 'fantasyEquivalentPoints')::integer,
        (candidate ->> 'pointsPer90')::numeric,
        (candidate ->> 'confidence')::numeric,
        (candidate ->> 'rating')::numeric,
        true, p_observed_at
      );
      inserted_count := inserted_count + 1;
    else
      update app.player_season_ratings set
        position = target_player.position,
        source_version = candidate_source_version,
        appearances = (candidate ->> 'appearances')::integer,
        starts = (candidate ->> 'starts')::integer,
        minutes = (candidate ->> 'minutes')::integer,
        goals = (candidate ->> 'goals')::integer,
        assists = (candidate ->> 'assists')::integer,
        clean_sheets = (candidate ->> 'cleanSheets')::integer,
        goals_conceded = (candidate ->> 'goalsConceded')::integer,
        saves = (candidate ->> 'saves')::integer,
        penalties_saved = (candidate ->> 'penaltiesSaved')::integer,
        penalties_missed = (candidate ->> 'penaltiesMissed')::integer,
        yellow_cards = (candidate ->> 'yellowCards')::integer,
        red_cards = (candidate ->> 'redCards')::integer,
        second_yellow_dismissals = (candidate ->> 'secondYellowDismissals')::integer,
        own_goals = (candidate ->> 'ownGoals')::integer,
        provider_rating = nullif(candidate ->> 'providerRating', '')::numeric,
        fantasy_equivalent_points = (candidate ->> 'fantasyEquivalentPoints')::integer,
        points_per_90 = (candidate ->> 'pointsPer90')::numeric,
        confidence = (candidate ->> 'confidence')::numeric,
        rating = (candidate ->> 'rating')::numeric,
        active = true,
        source_updated_at = p_observed_at,
        calculated_at = statement_timestamp(),
        updated_at = statement_timestamp()
      where id = existing.id;
      updated_count := updated_count + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count
  );
exception
  when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

create or replace function api.football_player_season_ratings(
  p_season_id uuid,
  p_position text default null,
  p_after_rating numeric default null,
  p_after_player_id uuid default null,
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if p_limit not between 1 and 100
    or ((p_after_rating is null) <> (p_after_player_id is null))
    or (p_position is not null and p_position not in ('GK', 'DEF', 'MID', 'FWD'))
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  with selected as (
    select rating.*, player.display_name, player.full_name
    from app.player_season_ratings rating
    join app.players player on player.id = rating.player_id
    where rating.football_season_id = p_season_id
      and rating.active
      and (p_position is null or p_position = case rating.position
        when 'goalkeeper' then 'GK'
        when 'defender' then 'DEF'
        when 'midfielder' then 'MID'
        when 'forward' then 'FWD'
      end)
      and (p_after_rating is null or (rating.rating, rating.player_id) < (p_after_rating, p_after_player_id))
    order by rating.rating desc, rating.player_id desc
    limit p_limit + 1
  ), page as (
    select * from selected order by rating desc, player_id desc limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'playerId', player_id,
      'name', display_name,
      'fullName', full_name,
      'position', case position
        when 'goalkeeper' then 'GK'
        when 'defender' then 'DEF'
        when 'midfielder' then 'MID'
        when 'forward' then 'FWD'
      end,
      'rating', rating,
      'confidence', confidence,
      'minutes', minutes,
      'fantasyEquivalentPoints', fantasy_equivalent_points,
      'pointsPer90', points_per_90,
      'providerRating', provider_rating,
      'algorithmVersion', algorithm_version,
      'calculatedAt', calculated_at
    ) order by rating desc, player_id desc), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > p_limit then
      (select jsonb_build_object('rating', rating, 'playerId', player_id)
       from page order by rating, player_id limit 1)
      else null end
  ) into result from page;
  return result;
end;
$$;

revoke all on function api.football_player_rating_candidates(text, text) from public, anon, authenticated;
revoke all on function api.ingest_player_season_ratings(text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function api.football_player_rating_candidates(text, text) to service_role;
grant execute on function api.ingest_player_season_ratings(text, text, text, jsonb, timestamptz) to service_role;

revoke all on function api.football_player_season_ratings(uuid, text, numeric, uuid, integer) from public;
grant execute on function api.football_player_season_ratings(uuid, text, numeric, uuid, integer) to anon, authenticated;

comment on table app.player_season_ratings is
  'Versioned preseason player ratings derived from completed-season official provider statistics.';
comment on column app.player_season_ratings.rating is
  '4.0-10.0 position-relative rating; v1 shrinks samples below 900 minutes toward neutral 6.0.';
