-- Current Fantasy facts require explicit scoring-statistic coverage. Historical
-- imports retain their original contracts and cannot assert this new marker.
alter table app_private.historical_performance_fixture_coverage
  add column scoring_statistics_complete boolean not null default false;
alter table app_private.historical_performance_fixture_coverage
  add constraint current_performance_coverage_complete_check check (
    not scoring_statistics_complete or (source_version ~ '^sportsmonks-current-fixture:[0-9a-f]{64}$'
      and reconciled and excluded_incomplete_rows = 0 and excluded_mapping_rows = 0 and invalid_detail_rows = 0)
  );
create function app_private.reset_historical_scoring_coverage() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- A later historical backfill must not inherit a current import's assertion.
  if new.source_version !~ '^sportsmonks-current-fixture:[0-9a-f]{64}$' then
    new.scoring_statistics_complete := false;
  end if;
  return new;
end;
$$;
revoke all on function app_private.reset_historical_scoring_coverage() from public, anon, authenticated, service_role;
create trigger reset_historical_scoring_coverage before insert or update
  on app_private.historical_performance_fixture_coverage
  for each row execute function app_private.reset_historical_scoring_coverage();

-- An absent goalkeeper-only statistic is unknown, never a fabricated zero.
-- Current ingestion accepts null only for a known canonical outfield position.
alter table app.player_fixture_performances alter column saves drop not null;
alter table app.player_fixture_performances alter column penalties_saved drop not null;
alter table app.player_fixture_performances add constraint current_performance_goalkeeper_statistics_check
  check (source_version not like 'sportsmonks-current-fixture:%' or
    (position in ('goalkeeper','defender','midfielder','forward') and
      (position <> 'goalkeeper' or (saves is not null and penalties_saved is not null))));

create function api.football_current_performance_fixture_batch(
  p_provider_name text,
  p_season_external_id text,
  p_after_fixture_external_id text default null,
  p_limit integer default 5
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target_season_id uuid;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name is distinct from 'sportsmonks' or p_season_external_id is distinct from '28647'
    or p_limit is null or p_limit not between 1 and 10
    or (p_after_fixture_external_id is not null and p_after_fixture_external_id !~ '^[1-9][0-9]{0,14}$')
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  select season.id into target_season_id
  from app_private.football_provider_mappings mapping
  join app.seasons season on season.id = mapping.internal_entity_id
  join app_private.football_provider_mappings competition
    on competition.provider_name = p_provider_name and competition.entity_type = 'competition'
    and competition.external_id = '860' and competition.internal_entity_id = season.competition_id and competition.active
  where mapping.provider_name = p_provider_name and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id and mapping.active
    and season.is_current and season.label = '2026/2027' and season.status in ('planned', 'active');
  if not found then
    raise exception using errcode = '22023', message = 'CURRENT_SEASON_REQUIRED';
  end if;
  with scope as (
    select mapping.external_id, fixture.kickoff_at
    from app.fixtures fixture
    join app_private.football_provider_mappings mapping
      on mapping.provider_name = p_provider_name and mapping.entity_type = 'fixture'
      and mapping.internal_entity_id = fixture.id and mapping.active
    where fixture.season_id = target_season_id and fixture.status = 'finished'
      and fixture.kickoff_at <= statement_timestamp()
      and mapping.external_id ~ '^[1-9][0-9]{0,14}$'
      and (p_after_fixture_external_id is null or mapping.external_id::bigint > p_after_fixture_external_id::bigint)
  ), selected as (
    select * from scope order by external_id::bigint limit p_limit + 1
  ), page as (
    select * from selected order by external_id::bigint limit p_limit
  )
  select jsonb_build_object(
    'seasonExternalId', p_season_external_id,
    'items', coalesce(jsonb_agg(jsonb_build_object('externalFixtureId', external_id, 'kickoffAt', kickoff_at)
      order by external_id::bigint), '[]'::jsonb),
    'hasMore', (select count(*) from selected) > p_limit,
    'nextCursor', case when (select count(*) from selected) > p_limit
      then (select external_id from page order by external_id::bigint desc limit 1) else null end
  ) into result from page;
  return result;
end;
$$;

create function api.ingest_current_player_fixture_performance(
  p_provider_name text,
  p_season_external_id text,
  p_fixture_external_id text,
  p_rows jsonb,
  p_coverage jsonb,
  p_observed_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target_season app.seasons%rowtype;
  target_fixture app.fixtures%rowtype;
  existing_coverage app_private.historical_performance_fixture_coverage%rowtype;
  candidate jsonb;
  field text;
  target_player_id uuid;
  target_player_position app.football_position;
  target_team_id uuid;
  mapped_count integer := 0;
  normalized_source_version text;
  active_count integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name is distinct from 'sportsmonks' or p_season_external_id is distinct from '28647'
    or p_fixture_external_id is null or p_fixture_external_id !~ '^[1-9][0-9]{0,14}$'
    or p_observed_at is null or p_observed_at > statement_timestamp() + interval '1 minute'
    or p_observed_at < statement_timestamp() - interval '15 minutes'
    or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_typeof(p_coverage) is distinct from 'object'
    or octet_length(p_rows::text) > 1048576
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if jsonb_array_length(p_rows) not between 22 and 100 then
    raise exception using errcode = '22023', message = 'CURRENT_PERFORMANCE_INCOMPLETE';
  end if;
  foreach field in array array['lineupRowsSeen','validPlayerRows','excludedIncompleteRows','starterRows','teamCount','detailRows','invalidDetailRows','missingStatisticRows'] loop
    if jsonb_typeof(p_coverage -> field) is distinct from 'number' or (p_coverage ->> field) !~ '^(0|[1-9][0-9]*)$' then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
  end loop;
  if p_coverage -> 'scoringStatisticsComplete' is distinct from 'true'::jsonb
    or p_coverage ->> 'cleanSheetSource' is distinct from 'official_minutes_and_on_pitch_goals_conceded'
    or p_coverage ->> 'goalkeeperStatistics' is distinct from 'explicit_value_or_null_canonical_position_checked_in_database'
    or (p_coverage ->> 'lineupRowsSeen')::integer <> jsonb_array_length(p_rows)
    or (p_coverage ->> 'validPlayerRows')::integer <> jsonb_array_length(p_rows)
    or (p_coverage ->> 'excludedIncompleteRows')::integer <> 0
    or (p_coverage ->> 'invalidDetailRows')::integer <> 0
    or (p_coverage ->> 'missingStatisticRows')::integer <> 0
    or (p_coverage ->> 'starterRows')::integer <> 22
    or (p_coverage ->> 'teamCount')::integer <> 2
    or (p_coverage ->> 'detailRows')::integer < jsonb_array_length(p_rows)
  then
    raise exception using errcode = '22023', message = 'CURRENT_PERFORMANCE_INCOMPLETE';
  end if;
  select season.* into target_season
  from app_private.football_provider_mappings mapping
  join app.seasons season on season.id = mapping.internal_entity_id
  join app_private.football_provider_mappings competition
    on competition.provider_name = p_provider_name and competition.entity_type = 'competition'
    and competition.external_id = '860' and competition.internal_entity_id = season.competition_id and competition.active
  where mapping.provider_name = p_provider_name and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id and mapping.active
    and season.is_current and season.label = '2026/2027' and season.status in ('planned', 'active');
  if not found then
    raise exception using errcode = '22023', message = 'CURRENT_SEASON_REQUIRED';
  end if;
  -- Scoring commits acquire FOR SHARE on the same fixture before checking their
  -- input digest. Coverage and statistics cannot change under that commit.
  select fixture.* into target_fixture
  from app_private.football_provider_mappings mapping
  join app.fixtures fixture on fixture.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name and mapping.entity_type = 'fixture'
    and mapping.external_id = p_fixture_external_id and mapping.active
  for update of fixture;
  if not found or target_fixture.season_id <> target_season.id or target_fixture.status <> 'finished'
    or target_fixture.kickoff_at > statement_timestamp() then
    raise exception using errcode = '22023', message = 'FINISHED_CURRENT_FIXTURE_REQUIRED';
  end if;
  select * into existing_coverage
  from app_private.historical_performance_fixture_coverage coverage where coverage.fixture_id = target_fixture.id;
  if existing_coverage.provider_observed_at > p_observed_at then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;
  for candidate in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(candidate) is distinct from 'object'
      or coalesce(candidate ->> 'externalPlayerId', '') !~ '^[1-9][0-9]{0,14}$'
      or coalesce(candidate ->> 'externalTeamId', '') !~ '^[1-9][0-9]{0,14}$'
      or jsonb_typeof(candidate -> 'started') is distinct from 'boolean'
      or jsonb_typeof(candidate -> 'appeared') is distinct from 'boolean'
    then raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD'; end if;
    foreach field in array array['minutes','goals','assists','cleanSheets','goalsConceded','penaltiesMissed','yellowCards','redCards','secondYellowDismissals','ownGoals'] loop
      if jsonb_typeof(candidate -> field) is distinct from 'number' or (candidate ->> field) !~ '^(0|[1-9][0-9]*)$' then
        raise exception using errcode = '22023', message = 'CURRENT_PERFORMANCE_INCOMPLETE';
      end if;
    end loop;
    foreach field in array array['saves','penaltiesSaved'] loop
      if not candidate ? field or (candidate -> field <> 'null'::jsonb and
        (jsonb_typeof(candidate -> field) is distinct from 'number' or (candidate ->> field) !~ '^(0|[1-9][0-9]*)$')) then
        raise exception using errcode = '22023', message = 'CURRENT_PERFORMANCE_INCOMPLETE';
      end if;
    end loop;
    if (candidate ->> 'minutes')::integer > 130
      or (candidate ->> 'cleanSheets')::integer <> (case
        when (candidate ->> 'minutes')::integer >= 60 and (candidate ->> 'goalsConceded')::integer = 0 then 1 else 0 end)
      or ((candidate ->> 'started')::boolean and not (candidate ->> 'appeared')::boolean)
      or ((candidate ->> 'minutes')::integer > 0 and not (candidate ->> 'appeared')::boolean)
      or (candidate -> 'providerRating' is not null and candidate -> 'providerRating' <> 'null'::jsonb
        and (jsonb_typeof(candidate -> 'providerRating') <> 'number' or (candidate ->> 'providerRating')::numeric not between 0 and 10))
    then raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD'; end if;
    select mapping.internal_entity_id into target_team_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name and mapping.entity_type = 'team'
      and mapping.external_id = candidate ->> 'externalTeamId' and mapping.active;
    if not found or target_team_id not in (target_fixture.home_team_id, target_fixture.away_team_id) then
      raise exception using errcode = 'P0002', message = 'TEAM_MAPPING_NOT_FOUND';
    end if;
    select player.id, player.position into target_player_id, target_player_position
    from app_private.football_provider_mappings mapping
    join app.players player on player.id = mapping.internal_entity_id
    where mapping.provider_name = p_provider_name and mapping.entity_type = 'player'
      and mapping.external_id = candidate ->> 'externalPlayerId' and mapping.active
    for share of player;
    if not found then
      raise exception using errcode = 'P0002', message = 'PLAYER_MAPPING_NOT_FOUND';
    end if;
    if target_player_position not in ('goalkeeper','defender','midfielder','forward') or
      (target_player_position = 'goalkeeper' and
        (candidate -> 'saves' = 'null'::jsonb or candidate -> 'penaltiesSaved' = 'null'::jsonb)) then
      raise exception using errcode = '22023', message = 'CURRENT_POSITION_STATISTICS_INCOMPLETE';
    end if;
    if not exists (select 1 from app.team_memberships membership
      where membership.season_id = target_season.id and membership.player_id = target_player_id
        and membership.team_id = target_team_id and membership.valid_from <= target_fixture.kickoff_at::date
        and (membership.valid_to is null or membership.valid_to >= target_fixture.kickoff_at::date)) then
      raise exception using errcode = 'P0002', message = 'PLAYER_MEMBERSHIP_NOT_FOUND';
    end if;
    mapped_count := mapped_count + 1;
  end loop;
  if (select count(distinct value ->> 'externalPlayerId') from jsonb_array_elements(p_rows)) <> mapped_count
    or (select count(distinct value ->> 'externalTeamId') from jsonb_array_elements(p_rows)) <> 2
    or exists (select 1 from jsonb_array_elements(p_rows) value group by value ->> 'externalTeamId'
      having count(*) filter (where (value ->> 'started')::boolean) <> 11) then
    raise exception using errcode = '22023', message = 'CURRENT_PERFORMANCE_INCOMPLETE';
  end if;
  -- Compute the immutable version from the actual normalized payload in SQL.
  normalized_source_version := 'sportsmonks-current-fixture:' || encode(extensions.digest(
    jsonb_build_object('fixtureId', target_fixture.id, 'rows', p_rows, 'coverage', p_coverage)::text, 'sha256'), 'hex');
  if existing_coverage.provider_observed_at = p_observed_at and existing_coverage.source_version <> normalized_source_version then
    raise exception using errcode = 'P0001', message = 'SOURCE_OBSERVATION_CONFLICT';
  end if;
  if existing_coverage.source_version = normalized_source_version and existing_coverage.scoring_statistics_complete
    and existing_coverage.reconciled and (select count(*) from app.player_fixture_performances performance
      where performance.fixture_id = target_fixture.id and performance.active
        and performance.source_version = normalized_source_version) = mapped_count
    and not exists (select 1 from app.player_fixture_performances performance
      where performance.fixture_id = target_fixture.id and performance.active
        and performance.source_version <> normalized_source_version)
  then
    -- Advance only the stale-observation watermark. Identical facts retain their
    -- row timestamps; scoring digests exclude this observational watermark.
    update app_private.historical_performance_fixture_coverage
      set provider_observed_at = p_observed_at where fixture_id = target_fixture.id
      and provider_observed_at < p_observed_at;
    return jsonb_build_object('fixtureId', target_fixture.id, 'sourceVersion', normalized_source_version,
      'active', mapped_count, 'reconciled', true, 'scoringStatisticsComplete', true);
  end if;
  update app.player_fixture_performances set active = false
    where fixture_id = target_fixture.id and active;
  insert into app.player_fixture_performances (
    football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
    started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves,
    penalties_saved, penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
    own_goals, provider_rating, active, provider_observed_at
  )
  select target_season.id, target_fixture.id, player.id, team_map.internal_entity_id,
    player.position, p_provider_name, normalized_source_version,
    (value ->> 'started')::boolean, (value ->> 'appeared')::boolean, (value ->> 'minutes')::integer,
    (value ->> 'goals')::integer, (value ->> 'assists')::integer, (value ->> 'cleanSheets')::integer,
    (value ->> 'goalsConceded')::integer, (value ->> 'saves')::integer,
    (value ->> 'penaltiesSaved')::integer, (value ->> 'penaltiesMissed')::integer,
    (value ->> 'yellowCards')::integer, (value ->> 'redCards')::integer,
    (value ->> 'secondYellowDismissals')::integer, (value ->> 'ownGoals')::integer,
    (value ->> 'providerRating')::numeric, true, p_observed_at
  from jsonb_array_elements(p_rows) value
  join app_private.football_provider_mappings player_map on player_map.provider_name = p_provider_name
    and player_map.entity_type = 'player' and player_map.external_id = value ->> 'externalPlayerId' and player_map.active
  join app.players player on player.id = player_map.internal_entity_id
  join app_private.football_provider_mappings team_map on team_map.provider_name = p_provider_name
    and team_map.entity_type = 'team' and team_map.external_id = value ->> 'externalTeamId' and team_map.active
  on conflict on constraint player_fixture_performances_source_key do update
    set active = true, provider_observed_at = excluded.provider_observed_at;
  select count(*) into active_count from app.player_fixture_performances performance
    where performance.fixture_id = target_fixture.id and performance.active;
  if active_count <> mapped_count then
    raise exception using errcode = '22023', message = 'PERFORMANCE_RECONCILIATION_FAILED';
  end if;
  insert into app_private.historical_performance_fixture_coverage (
    fixture_id, football_season_id, source_provider, source_version, lineup_rows_seen, valid_player_rows,
    excluded_incomplete_rows, excluded_mapping_rows, starter_rows, team_count, detail_rows,
    invalid_detail_rows, performance_rows, reconciled, provider_observed_at, scoring_statistics_complete
  ) values (
    target_fixture.id, target_season.id, p_provider_name, normalized_source_version, active_count, active_count,
    0, 0, 22, 2, (p_coverage ->> 'detailRows')::integer, 0, active_count, true, p_observed_at, true
  ) on conflict (fixture_id) do update set
    football_season_id = excluded.football_season_id, source_provider = excluded.source_provider,
    source_version = excluded.source_version, lineup_rows_seen = excluded.lineup_rows_seen,
    valid_player_rows = excluded.valid_player_rows, excluded_incomplete_rows = 0, excluded_mapping_rows = 0,
    starter_rows = 22, team_count = 2, detail_rows = excluded.detail_rows, invalid_detail_rows = 0,
    performance_rows = excluded.performance_rows, reconciled = true,
    provider_observed_at = excluded.provider_observed_at, scoring_statistics_complete = true;
  return jsonb_build_object('fixtureId', target_fixture.id, 'sourceVersion', normalized_source_version,
    'active', active_count, 'reconciled', true, 'scoringStatisticsComplete', true);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or unique_violation or not_null_violation then
  raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.football_current_performance_fixture_batch(text, text, text, integer) from public, anon, authenticated;
revoke all on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function api.football_current_performance_fixture_batch(text, text, text, integer) to service_role;
grant execute on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) to service_role;
comment on column app_private.historical_performance_fixture_coverage.scoring_statistics_complete is
  'Only strict current finished-fixture ingestion can certify all scoring statistics; historical default-zero and quarantined coverage remains false.';
