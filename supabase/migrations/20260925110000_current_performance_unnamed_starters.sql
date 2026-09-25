-- BotolaGO Production V2
-- This season's match statistics follow last season's rule for players the
-- provider has not identified (BG-0011 option B). Owner decision, 2026-09-25.
--
-- SportsMonks lists some players without a player_id. Last season's import
-- (20260919120000_historical_anonymous_starter_tolerance) accepts a match when
-- at most 4 of its 22 starters are unnamed: the unnamed rows are skipped,
-- never credited to anyone, and every named player's statistics are used.
-- This season's import accepted none, so the first finished match (fixture
-- 19874708, Amal Tiznit 1-3 Ittihad Tanger: 3 unnamed starters, 4 other
-- unnamed rows) could never be imported and Gameweek 1 could never be scored.
--
-- Now the same rule holds for this season, in the four places that enforced
-- zero:
--   1. historical_performance_coverage_counts_check allowed a nonzero
--      unnamed-starter count only on last season's source prefix; it now
--      also allows this season's. Every other bound is unchanged: at most 4
--      unnamed starters on an accepted row, identified = 22 - unnamed.
--   2. current_performance_coverage_complete_check required no excluded row;
--      a certified row may now leave out its unnamed rows, all of its
--      unnamed starters among them, and must be accepted (so 4 at most).
--   3. api.ingest_current_player_fixture_performance takes the counts from
--      the importer (a caller that sends none reports none, the old rule),
--      checks them against the rows it receives (named starters = 22 minus
--      unnamed, each club 11 minus at most the unnamed), and records them.
--   4. app_private.fantasy_validate_scoring_document scores a match with its
--      named starters (22 minus unnamed, at most 4) instead of exactly 22.
--
-- An unnamed player cannot be in a Fantasy squad: squads are built from the
-- provider's named players. A match with more than 4 unnamed starters still
-- waits, as before. Nothing already stored changes.

alter table app_private.historical_performance_fixture_coverage
  drop constraint historical_performance_coverage_counts_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_counts_check check (
    lineup_rows_seen between 22 and 100
    and valid_player_rows between 22 and 100
    and excluded_incomplete_rows between 0 and 20
    and lineup_rows_seen = valid_player_rows + excluded_incomplete_rows
    and anonymous_starter_rows between 0 and 22
    and identified_starter_rows = 22 - anonymous_starter_rows
    and team_count = 2
    and detail_rows >= 0
    and invalid_detail_rows >= 0
    and (coverage_outcome = 'quarantined') = (anonymous_starter_rows > 4)
    and (case
      when coverage_outcome = 'accepted' then
        starter_rows between 0 and identified_starter_rows
        and performance_rows = valid_player_rows
      else
        starter_rows = 0 and performance_rows = 0
    end)
    -- Was last season's prefix only; this season's too since 20260925110000.
    and (anonymous_starter_rows = 0
      or source_version ~ '^sportsmonks-(current-)?fixture:[0-9a-f]{64}$')
  );

alter table app_private.historical_performance_fixture_coverage
  drop constraint current_performance_coverage_complete_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint current_performance_coverage_complete_check check (
    not scoring_statistics_complete or (source_version ~ '^sportsmonks-current-fixture:[0-9a-f]{64}$'
      and reconciled and coverage_outcome = 'accepted'
      and excluded_incomplete_rows >= anonymous_starter_rows
      and excluded_mapping_rows = 0 and invalid_detail_rows = 0)
  );

comment on column app_private.historical_performance_fixture_coverage.anonymous_starter_rows is
  'BG-0011 option B: raw provider starter rows (type_id 11) with no player_id, tolerated up to 4 per fixture on last season''s and (since 20260925110000) this season''s imports. Never assigned to any player.';

create or replace function api.ingest_current_player_fixture_performance(
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
  unnamed_starters integer;
  excluded_rows integer;
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
  -- BG-0011 option B, this season too (owner decision 2026-09-25): up to 4 of
  -- the 22 starters may be unnamed. A caller that does not say is taken to
  -- report none, which is the rule it was written under.
  foreach field in array array['anonymousStarterRows','identifiedStarterRows'] loop
    if p_coverage ? field and (jsonb_typeof(p_coverage -> field) is distinct from 'number'
      or (p_coverage ->> field) !~ '^(0|[1-9][0-9]*)$') then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
  end loop;
  unnamed_starters := coalesce((p_coverage ->> 'anonymousStarterRows')::integer, 0);
  excluded_rows := (p_coverage ->> 'excludedIncompleteRows')::integer;
  if p_coverage -> 'scoringStatisticsComplete' is distinct from 'true'::jsonb
    or p_coverage ->> 'cleanSheetSource' is distinct from 'official_minutes_and_on_pitch_goals_conceded'
    or p_coverage ->> 'goalkeeperStatistics' is distinct from 'explicit_value_or_null_canonical_position_checked_in_database'
    or (p_coverage ->> 'lineupRowsSeen')::integer <> jsonb_array_length(p_rows) + excluded_rows
    or (p_coverage ->> 'validPlayerRows')::integer <> jsonb_array_length(p_rows)
    -- Only unnamed rows are left out: every unnamed starter among them, and
    -- no more than 20 in all (the historical bound).
    or unnamed_starters > 4
    or excluded_rows < unnamed_starters or excluded_rows > 20
    or (p_coverage ->> 'invalidDetailRows')::integer <> 0
    or (p_coverage ->> 'missingStatisticRows')::integer <> 0
    or (p_coverage ->> 'starterRows')::integer <> 22 - unnamed_starters
    or coalesce((p_coverage ->> 'identifiedStarterRows')::integer, 22 - unnamed_starters) <> 22 - unnamed_starters
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
    or (select count(*) from jsonb_array_elements(p_rows) value where (value ->> 'started')::boolean)
      <> 22 - unnamed_starters
    or exists (select 1 from jsonb_array_elements(p_rows) value group by value ->> 'externalTeamId'
      having count(*) filter (where (value ->> 'started')::boolean) not between 11 - unnamed_starters and 11) then
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
    excluded_incomplete_rows, excluded_mapping_rows, starter_rows, anonymous_starter_rows,
    identified_starter_rows, team_count, detail_rows,
    invalid_detail_rows, performance_rows, reconciled, provider_observed_at, scoring_statistics_complete
  ) values (
    target_fixture.id, target_season.id, p_provider_name, normalized_source_version,
    active_count + excluded_rows, active_count,
    excluded_rows, 0, 22 - unnamed_starters, unnamed_starters,
    22 - unnamed_starters, 2, (p_coverage ->> 'detailRows')::integer, 0, active_count, true, p_observed_at, true
  ) on conflict (fixture_id) do update set
    football_season_id = excluded.football_season_id, source_provider = excluded.source_provider,
    source_version = excluded.source_version, lineup_rows_seen = excluded.lineup_rows_seen,
    valid_player_rows = excluded.valid_player_rows, excluded_incomplete_rows = excluded.excluded_incomplete_rows,
    excluded_mapping_rows = 0, starter_rows = excluded.starter_rows,
    anonymous_starter_rows = excluded.anonymous_starter_rows,
    identified_starter_rows = excluded.identified_starter_rows,
    coverage_outcome = 'accepted', quarantine_reason = null,
    team_count = 2, detail_rows = excluded.detail_rows, invalid_detail_rows = 0,
    performance_rows = excluded.performance_rows, reconciled = true,
    provider_observed_at = excluded.provider_observed_at, scoring_statistics_complete = true;
  return jsonb_build_object('fixtureId', target_fixture.id, 'sourceVersion', normalized_source_version,
    'active', active_count, 'reconciled', true, 'scoringStatisticsComplete', true);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or unique_violation or not_null_violation then
  raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

create or replace function app_private.fantasy_validate_scoring_document(p_document jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare f jsonb;
begin
  if p_document is null or jsonb_array_length(p_document->'fixtures') not between 1 and 64
    or jsonb_array_length(p_document->'players') not between 1 and 2000
    or jsonb_array_length(p_document->'playerFixtures') not between 1 and 10000
    or pg_column_size(p_document)>16777216 then
    raise exception using errcode='PT409',message='fantasy_scoring_input_incomplete';
  end if;
  if p_document->'features' is null or p_document->'features'='null'::jsonb
    or (p_document#>>'{features,bonus_points_enabled}')::boolean
    or (p_document#>>'{features,player_of_match_enabled}')::boolean then
    raise exception using errcode='PT409',message='fantasy_scoring_feature_unsupported';
  end if;
  if exists(select 1 from jsonb_array_elements(p_document->'playerFixtures') row_input
    where (row_input->>'statisticsComplete')::boolean is distinct from true) then
    raise exception using errcode='PT409',message='fantasy_scoring_coverage_incomplete'; end if;
  for f in select value from jsonb_array_elements(p_document->'fixtures') loop
    if f->>'status'<>'finished' or f->>'finalizedAt' is null
      or f->>'seasonId'<>p_document->>'footballSeasonId'
      or f#>>'{assignment,frozen_at}' is null
      or (f#>>'{assignment,counts_points}')::boolean is distinct from true
      or f#>>'{assignment,assignment_status}' not in ('assigned','confirmed','reassigned')
      or (f#>>'{coverage,reconciled}')::boolean is distinct from true
      or (f#>>'{coverage,scoring_statistics_complete}')::boolean is distinct from true
      or (f#>>'{coverage,invalid_detail_rows}')::integer is distinct from 0
      -- BG-0011 option B (owner decision 2026-09-25): up to 4 of the 22
      -- starters unnamed; the rows left out are the unnamed ones, at most 20.
      or f#>>'{coverage,coverage_outcome}' is distinct from 'accepted'
      or coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,-1) not between 0 and 4
      or coalesce((f#>>'{coverage,excluded_incomplete_rows}')::integer,-1)
        not between coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,0) and 20
      or coalesce((f#>>'{coverage,excluded_mapping_rows}')::integer,0)<>0
      or (f#>>'{coverage,starter_rows}')::integer is distinct from
        22-coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,0)
      or (f#>>'{coverage,team_count}')::integer is distinct from 2
      or (f#>>'{coverage,performance_rows}')::integer is distinct from (f->>'activePerformanceCount')::integer
      or f#>>'{coverage,football_season_id}' is distinct from p_document->>'footballSeasonId'
      or exists (select 1 from app.player_fixture_performances p where p.fixture_id=(f->>'fixtureId')::uuid and p.active
        and (p.source_version is distinct from f#>>'{coverage,source_version}' or p.football_season_id::text<>p_document->>'footballSeasonId')) then
      raise exception using errcode='PT409',message='fantasy_scoring_coverage_incomplete';
    end if;
  end loop;
end;
$$;

-- Same grants as before; restated so this file stands on its own.
revoke all on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) to service_role;
revoke all on function app_private.fantasy_validate_scoring_document(jsonb) from public, anon, authenticated, service_role;
