-- Forward repair for production run 30764205550. Completed-fixture lineup
-- players without a canonical provider mapping are quarantined explicitly;
-- season, fixture, team, and 22-starter reconciliation remain hard gates.

alter table app_private.historical_performance_fixture_coverage
  add column excluded_mapping_rows integer not null default 0;

alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_mapping_exclusions_check
  check (
    excluded_mapping_rows between 0 and excluded_incomplete_rows
    and excluded_mapping_rows <= 20
  );

create or replace function api.ingest_historical_player_fixture_performance(
  p_provider_name text,
  p_season_external_id text,
  p_fixture_external_id text,
  p_source_version text,
  p_rows jsonb,
  p_coverage jsonb,
  p_observed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_season app.seasons%rowtype;
  target_fixture app.fixtures%rowtype;
  target_player app.players%rowtype;
  target_team_id uuid;
  candidate jsonb;
  existing app.player_fixture_performances%rowtype;
  external_player_id text;
  external_team_id text;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  mapping_excluded_count integer := 0;
  provider_excluded_count integer;
  total_excluded_count integer;
  active_count integer;
  starter_count integer;
  team_count integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name <> 'sportsmonks'
    or p_season_external_id !~ '^[1-9][0-9]*$'
    or p_fixture_external_id !~ '^[1-9][0-9]*$'
    or p_source_version !~ '^sportsmonks-fixture:[0-9a-f]{64}$'
    or p_observed_at is null
    or p_observed_at > statement_timestamp() + interval '5 minutes'
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 22 and 100
    or jsonb_typeof(p_coverage) <> 'object'
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  select season.* into target_season
  from app_private.football_provider_mappings mapping
  join app.seasons season on season.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id
    and mapping.active;
  if not found then
    raise exception using errcode = 'P0002', message = 'SEASON_MAPPING_NOT_FOUND';
  end if;
  if target_season.status <> 'completed'
    or target_season.is_current
    or target_season.ends_on >= current_date
  then
    raise exception using errcode = '22023', message = 'COMPLETED_SEASON_REQUIRED';
  end if;

  select fixture.* into target_fixture
  from app_private.football_provider_mappings mapping
  join app.fixtures fixture on fixture.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'fixture'
    and mapping.external_id = p_fixture_external_id
    and mapping.active
  for update of fixture;
  if not found or target_fixture.season_id <> target_season.id
    or target_fixture.status <> 'finished'
  then
    raise exception using errcode = 'P0002', message = 'FIXTURE_MAPPING_NOT_FOUND';
  end if;

  provider_excluded_count := (p_coverage ->> 'excludedIncompleteRows')::integer;
  if (p_coverage ->> 'lineupRowsSeen')::integer not between 22 and 100
    or (p_coverage ->> 'validPlayerRows')::integer <> jsonb_array_length(p_rows)
    or provider_excluded_count not between 0 and 20
    or (p_coverage ->> 'lineupRowsSeen')::integer
      <> (p_coverage ->> 'validPlayerRows')::integer + provider_excluded_count
    or (p_coverage ->> 'starterRows')::integer <> 22
    or (p_coverage ->> 'teamCount')::integer <> 2
    or (p_coverage ->> 'detailRows')::integer < 0
    or (p_coverage ->> 'invalidDetailRows')::integer <> 0
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  update app.player_fixture_performances
  set active = false, updated_at = statement_timestamp()
  where fixture_id = target_fixture.id and active;

  for candidate in select value from jsonb_array_elements(p_rows)
  loop
    external_player_id := candidate ->> 'externalPlayerId';
    external_team_id := candidate ->> 'externalTeamId';
    if external_player_id !~ '^[1-9][0-9]*$'
      or external_team_id !~ '^[1-9][0-9]*$'
      or candidate ->> 'started' not in ('true', 'false')
      or candidate ->> 'appeared' not in ('true', 'false')
      or ((candidate ->> 'started')::boolean and not (candidate ->> 'appeared')::boolean)
      or (candidate ->> 'minutes')::integer not between 0 and 130
      or ((candidate ->> 'minutes')::integer > 0 and not (candidate ->> 'appeared')::boolean)
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
      or (
        candidate ->> 'providerRating' is not null
        and (candidate ->> 'providerRating')::numeric not between 0 and 10
      )
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    select mapping.internal_entity_id into target_team_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'team'
      and mapping.external_id = external_team_id
      and mapping.active;
    if not found or target_team_id not in (target_fixture.home_team_id, target_fixture.away_team_id)
    then
      raise exception using errcode = 'P0002', message = 'TEAM_MAPPING_NOT_FOUND';
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
      mapping_excluded_count := mapping_excluded_count + 1;
      continue;
    end if;

    select * into existing
    from app.player_fixture_performances performance
    where performance.fixture_id = target_fixture.id
      and performance.player_id = target_player.id
      and performance.source_version = p_source_version
    for update;

    if existing.id is null then
      insert into app.player_fixture_performances (
        football_season_id, fixture_id, player_id, team_id, position,
        source_provider, source_version, started, appeared, minutes, goals,
        assists, clean_sheets, goals_conceded, saves, penalties_saved,
        penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
        own_goals, provider_rating, active, provider_observed_at
      ) values (
        target_season.id, target_fixture.id, target_player.id, target_team_id,
        target_player.position, p_provider_name, p_source_version,
        (candidate ->> 'started')::boolean,
        (candidate ->> 'appeared')::boolean,
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
        true, p_observed_at
      );
      inserted_count := inserted_count + 1;
    else
      update app.player_fixture_performances set
        team_id = target_team_id,
        position = target_player.position,
        started = (candidate ->> 'started')::boolean,
        appeared = (candidate ->> 'appeared')::boolean,
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
        active = true,
        provider_observed_at = greatest(provider_observed_at, p_observed_at),
        updated_at = statement_timestamp()
      where id = existing.id;
      if existing.active then
        skipped_count := skipped_count + 1;
      else
        updated_count := updated_count + 1;
      end if;
    end if;
  end loop;

  select
    count(*),
    count(*) filter (where performance.started),
    count(distinct performance.team_id)
  into active_count, starter_count, team_count
  from app.player_fixture_performances performance
  where performance.fixture_id = target_fixture.id and performance.active;
  total_excluded_count := provider_excluded_count + mapping_excluded_count;
  if active_count not between 22 and 100
    or starter_count <> 22
    or team_count <> 2
    or mapping_excluded_count > 20
    or total_excluded_count > 20
    or active_count <> jsonb_array_length(p_rows) - mapping_excluded_count
    or (p_coverage ->> 'lineupRowsSeen')::integer <> active_count + total_excluded_count
  then
    raise exception using errcode = '22023', message = 'PERFORMANCE_RECONCILIATION_FAILED';
  end if;

  insert into app_private.historical_performance_fixture_coverage (
    fixture_id, football_season_id, source_provider, source_version,
    lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
    excluded_mapping_rows, starter_rows, team_count, detail_rows,
    invalid_detail_rows, performance_rows, reconciled, provider_observed_at
  ) values (
    target_fixture.id, target_season.id, p_provider_name, p_source_version,
    (p_coverage ->> 'lineupRowsSeen')::integer,
    active_count, total_excluded_count, mapping_excluded_count,
    starter_count, team_count,
    (p_coverage ->> 'detailRows')::integer,
    (p_coverage ->> 'invalidDetailRows')::integer,
    active_count, true, p_observed_at
  ) on conflict (fixture_id) do update set
    football_season_id = excluded.football_season_id,
    source_provider = excluded.source_provider,
    source_version = excluded.source_version,
    lineup_rows_seen = excluded.lineup_rows_seen,
    valid_player_rows = excluded.valid_player_rows,
    excluded_incomplete_rows = excluded.excluded_incomplete_rows,
    excluded_mapping_rows = excluded.excluded_mapping_rows,
    starter_rows = excluded.starter_rows,
    team_count = excluded.team_count,
    detail_rows = excluded.detail_rows,
    invalid_detail_rows = excluded.invalid_detail_rows,
    performance_rows = excluded.performance_rows,
    reconciled = excluded.reconciled,
    provider_observed_at = greatest(
      app_private.historical_performance_fixture_coverage.provider_observed_at,
      excluded.provider_observed_at
    ),
    updated_at = statement_timestamp();

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'active', active_count,
    'excludedMappingRows', mapping_excluded_count,
    'excludedIncompleteRows', total_excluded_count,
    'reconciled', true
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or not_null_violation or check_violation or unique_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.ingest_historical_player_fixture_performance(
  text, text, text, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function api.ingest_historical_player_fixture_performance(
  text, text, text, text, jsonb, jsonb, timestamptz
) to service_role;

comment on column app_private.historical_performance_fixture_coverage.excluded_mapping_rows is
  'Provider lineup players quarantined because no canonical player mapping existed; included in exact fixture accounting.';
