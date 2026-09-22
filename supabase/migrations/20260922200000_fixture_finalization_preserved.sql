-- Fixture finalization: store it, and never lose it.
--
-- The Fantasy lifecycle only scores a gameweek once every fixture in it has
-- `app.fixtures.finalized_at` (`api.service_advance_fantasy_lifecycle` waits
-- with `football_not_final`; `app_private.fantasy_validate_scoring_document`
-- raises `fantasy_scoring_coverage_incomplete`). Nothing ever set it: the
-- SportsMonks adapter sent no `finalizedAt`, and this function wrote the
-- incoming value straight over the stored one. Production held 480 finished
-- fixtures and not one finalization time, so GW1 could never be scored.
--
-- The adapter now sends `finalizedAt` for FT / AET / FT_PEN. This
-- migration makes the database hold on to it:
--
--   * `finalized_at = coalesce(existing, incoming)` on update, so the first
--     finalization wins and a later refresh without one cannot erase it (it
--     previously would have tripped `protect_fixture_freshness` with
--     INVALID_FIXTURE_STATE and failed the whole refresh);
--   * a finalization time is accepted only together with status `finished`.
--
-- Same signature, same security definer and search_path, same grants. No
-- table, row or data change: fixtures already stored keep `finalized_at` null
-- until the provider next reports them in a final state.

create or replace function api.ingest_football_fixture(
  p_provider_name text,
  p_external_id text,
  p_fixture jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  v_competition_id uuid;
  v_season_id uuid;
  v_round_id uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_venue_id uuid;
  v_winner_team_id uuid;
  v_kickoff_at timestamptz;
  normalized_status app.fixture_status;
  normalized_period app.fixture_period;
  v_provider_updated_at timestamptz;
  v_source_sequence bigint;
  v_finalized_at timestamptz;
begin
  if jsonb_typeof(p_fixture) <> 'object' or octet_length(p_fixture::text) > 16384 then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if not exists (
    select 1 from app_private.football_providers
    where name = p_provider_name and active
  ) then
    raise exception using errcode = 'P0002', message = 'PROVIDER_NOT_FOUND';
  end if;

  begin
    v_competition_id := (p_fixture ->> 'competitionId')::uuid;
    v_season_id := (p_fixture ->> 'seasonId')::uuid;
    v_round_id := nullif(p_fixture ->> 'roundId', '')::uuid;
    v_home_team_id := (p_fixture ->> 'homeTeamId')::uuid;
    v_away_team_id := (p_fixture ->> 'awayTeamId')::uuid;
    v_venue_id := nullif(p_fixture ->> 'venueId', '')::uuid;
    v_winner_team_id := nullif(p_fixture ->> 'winnerTeamId', '')::uuid;
    v_kickoff_at := (p_fixture ->> 'kickoffAt')::timestamptz;
    normalized_status := (p_fixture ->> 'status')::app.fixture_status;
    normalized_period := coalesce(p_fixture ->> 'period', 'pre_match')::app.fixture_period;
    v_provider_updated_at := (p_fixture ->> 'providerUpdatedAt')::timestamptz;
    v_source_sequence := coalesce((p_fixture ->> 'sourceSequence')::bigint, 0);
    v_finalized_at := nullif(p_fixture ->> 'finalizedAt', '')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end;

  if v_competition_id is null or v_season_id is null or v_home_team_id is null
    or v_away_team_id is null or v_kickoff_at is null or v_provider_updated_at is null
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  -- Only a finished match can be final. A finalization time sent with any
  -- other status is a provider or adapter error and is not stored.
  if normalized_status <> 'finished' then
    v_finalized_at := null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_name || ':fixture:' || p_external_id, 0)
  );
  select internal_entity_id into target_id
  from app_private.football_provider_mappings
  where provider_name = p_provider_name
    and entity_type = 'fixture'
    and external_id = p_external_id
    and active;

  if target_id is null then
    insert into app.fixtures (
      competition_id, season_id, round_id, home_team_id, away_team_id,
      venue_id, kickoff_at, status, period, minute, added_time,
      home_score, away_score, half_time_home_score, half_time_away_score,
      extra_time_home_score, extra_time_away_score, penalty_home_score,
      penalty_away_score, winner_team_id, attendance, provider_updated_at,
      source_sequence, source_version, finalized_at
    ) values (
      v_competition_id, v_season_id, v_round_id, v_home_team_id, v_away_team_id,
      v_venue_id, v_kickoff_at, normalized_status, normalized_period,
      nullif(p_fixture ->> 'minute', '')::integer,
      nullif(p_fixture ->> 'addedTime', '')::integer,
      nullif(p_fixture ->> 'homeScore', '')::integer,
      nullif(p_fixture ->> 'awayScore', '')::integer,
      nullif(p_fixture ->> 'halfTimeHomeScore', '')::integer,
      nullif(p_fixture ->> 'halfTimeAwayScore', '')::integer,
      nullif(p_fixture ->> 'extraTimeHomeScore', '')::integer,
      nullif(p_fixture ->> 'extraTimeAwayScore', '')::integer,
      nullif(p_fixture ->> 'penaltyHomeScore', '')::integer,
      nullif(p_fixture ->> 'penaltyAwayScore', '')::integer,
      v_winner_team_id,
      nullif(p_fixture ->> 'attendance', '')::integer,
      v_provider_updated_at, v_source_sequence, p_fixture ->> 'sourceVersion',
      v_finalized_at
    ) returning id into target_id;
    perform api.resolve_football_mapping(
      p_provider_name, 'fixture', p_external_id, target_id,
      p_fixture ->> 'sourceVersion', v_provider_updated_at
    );
  else
    update app.fixtures as fixture set
      competition_id = v_competition_id,
      season_id = v_season_id,
      round_id = v_round_id,
      home_team_id = v_home_team_id,
      away_team_id = v_away_team_id,
      venue_id = v_venue_id,
      kickoff_at = v_kickoff_at,
      status = normalized_status,
      period = normalized_period,
      minute = nullif(p_fixture ->> 'minute', '')::integer,
      added_time = nullif(p_fixture ->> 'addedTime', '')::integer,
      home_score = nullif(p_fixture ->> 'homeScore', '')::integer,
      away_score = nullif(p_fixture ->> 'awayScore', '')::integer,
      half_time_home_score = nullif(p_fixture ->> 'halfTimeHomeScore', '')::integer,
      half_time_away_score = nullif(p_fixture ->> 'halfTimeAwayScore', '')::integer,
      extra_time_home_score = nullif(p_fixture ->> 'extraTimeHomeScore', '')::integer,
      extra_time_away_score = nullif(p_fixture ->> 'extraTimeAwayScore', '')::integer,
      penalty_home_score = nullif(p_fixture ->> 'penaltyHomeScore', '')::integer,
      penalty_away_score = nullif(p_fixture ->> 'penaltyAwayScore', '')::integer,
      winner_team_id = v_winner_team_id,
      attendance = nullif(p_fixture ->> 'attendance', '')::integer,
      provider_updated_at = v_provider_updated_at,
      source_sequence = v_source_sequence,
      source_version = p_fixture ->> 'sourceVersion',
      -- The first finalization wins. A later refresh that sends no time (or
      -- a later one) never erases or moves it: once a gameweek has been
      -- scored against a fixture, that fixture stays final. Clearing it is a
      -- deliberate correction, done outside ingestion under
      -- app.allow_fixture_correction.
      finalized_at = coalesce(fixture.finalized_at, v_finalized_at)
    where fixture.id = target_id;
    perform api.resolve_football_mapping(
      p_provider_name, 'fixture', p_external_id, target_id,
      p_fixture ->> 'sourceVersion', v_provider_updated_at
    );
  end if;
  return target_id;
exception
  when foreign_key_violation then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  when check_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.ingest_football_fixture(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function api.ingest_football_fixture(text, text, jsonb) to service_role;
