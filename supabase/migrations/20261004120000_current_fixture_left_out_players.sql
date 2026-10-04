-- BotolaGO Production V2
-- A finished fixture is no longer held back by lineup players the catalogue
-- cannot place, when leaving them out cannot change any Fantasy team's points.
--
-- OWNER DECISION (2026-10-03, GW1 recovery): "it's okay if we miss some data
-- as long as it won't hurt the scoring ... if there is something that can be
-- skipped skip it, if it hurts the scoring directly no."
--
-- WHY. api.ingest_current_player_fixture_performance refuses a whole fixture
-- at the first lineup player with no provider mapping (PLAYER_MAPPING_NOT_FOUND)
-- or no dated club record at that club (PLAYER_MEMBERSHIP_NOT_FOUND). Five GW1
-- fixtures wait on about 60 such players, and nobody's points depend on any of
-- them: no Fantasy team holds a player the catalogue cannot place.
--
-- WHAT CHANGES. Nothing, unless the importer asks for the rule
-- (p_coverage -> 'leaveOutUnplacedUnheld' = true) on a fixture that is not
-- under adaptive scoring. The existing function is renamed (_v2, the pattern of
-- 20260927094823) and called unchanged in every other case, and also when the
-- rule finds nobody to leave out and nobody to place.
--
-- With the rule, a lineup row is LEFT OUT when its provider id has no active
-- mapping, or maps to a player with no dated club record at the row's club.
-- It is recorded, with its goals and own goals (so the score still adds up),
-- in app_private.current_fixture_left_out_players, bound to the coverage
-- source version, and counted in the coverage row's excluded_mapping_rows.
-- It is NEVER counted as an unnamed starter: that would make every held
-- player at the club "participation unknown" and block finalization.
--
-- THE DATABASE REFUSES (nothing is written) when leaving out could hurt points:
--   * LEAVE_OUT_GAMEWEEK_NOT_LOCKED: a gameweek the fixture counts for is not
--     locked, live or provisional, or has an unlocked lineup, so who is held is
--     not settled yet;
--   * LEFT_OUT_PLAYER_HELD: a left-out row maps to a player some Fantasy team
--     holds in a locked lineup of those gameweeks;
--   * HELD_PLAYER_UNMAPPED: a held player whose Fantasy club is one of the two
--     clubs has no provider mapping, so he could be one of the rows left out
--     (unless the owner declared him absent from the match sheet, below);
--   * LEFT_OUT_ROWS_EXCEEDED: more than 20 rows would be left out in all, or
--     fewer than 22 would remain.
--
-- OWNER DECISIONS the importer may declare (from a reviewed file in the
-- repository), each re-checked here against the world it was made for, or
-- OWNER_DECISION_STALE:
--   * heldPlayersNotInSquad: Fantasy player ids of held, unmapped players at
--     one of the clubs whom the owner confirmed are not on the match sheet;
--   * placeAtFixtureClub: {externalPlayerId, externalTeamId} of a mapped player
--     with no club record at the club he played for; his row is placed there
--     (the scoring document already reads a played match at the fixture club).
--
-- FORWARDS. defensiveUnknownForwards lists starters whose goals conceded the
-- provider could not prove (60-89 minutes, side conceded, no timeline proof).
-- A forward scores nothing for clean sheets or goals conceded, so the importer
-- sends the side's total (no clean sheet). Refused (DEFENSIVE_UNKNOWN_NOT_FORWARD)
-- unless the row is left out, or the player is a canonical forward whom no
-- Fantasy player lists at another position.
--
-- SCORING. The scoring document's fixture check accepts excluded_mapping_rows
-- equal to the recorded left-out rows, and the goal check adds the goals of
-- rows the document does not carry (placed players outside the Fantasy
-- catalogue, and left-out players), which it used to treat as missing.

create table app_private.current_fixture_left_out_players (
  fixture_id uuid not null references app.fixtures(id) on delete restrict,
  coverage_source_version text not null
    check (coverage_source_version ~ '^sportsmonks-current-fixture:[0-9a-f]{64}$'),
  external_player_id text not null check (external_player_id ~ '^[1-9][0-9]{0,14}$'),
  external_team_id text not null check (external_team_id ~ '^[1-9][0-9]{0,14}$'),
  team_id uuid not null references app.teams(id) on delete restrict,
  -- Null when the provider id has no mapping at all.
  player_id uuid references app.players(id) on delete restrict,
  reason text not null check (reason in ('no_provider_mapping', 'no_club_record')),
  started boolean not null,
  minutes integer not null check (minutes between 0 and 130),
  goals integer not null check (goals >= 0),
  own_goals integer not null check (own_goals >= 0),
  provider_observed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (fixture_id, coverage_source_version, external_player_id),
  check ((reason = 'no_provider_mapping') = (player_id is null))
);
comment on table app_private.current_fixture_left_out_players is
  'Lineup players of a finished fixture the catalogue could not place, left out of its performance rows because no Fantasy team holds them (owner decision 2026-10-03). Written only by api.ingest_current_player_fixture_performance; bound to the coverage source version.';
alter table app_private.current_fixture_left_out_players enable row level security;
alter table app_private.current_fixture_left_out_players force row level security;
revoke all on table app_private.current_fixture_left_out_players from public, anon, authenticated, service_role;
grant select on table app_private.current_fixture_left_out_players to service_role;

-- Left-out rows are named rows, never unnamed starters, and are part of the
-- rows left out in all.
alter table app_private.historical_performance_fixture_coverage
  drop constraint current_performance_coverage_complete_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint current_performance_coverage_complete_check check (
    not scoring_statistics_complete or (source_version ~ '^sportsmonks-current-fixture:[0-9a-f]{64}$'
      and reconciled and coverage_outcome = 'accepted'
      and excluded_incomplete_rows >= anonymous_starter_rows + excluded_mapping_rows
      and invalid_detail_rows = 0)
  );

alter function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz)
  rename to ingest_current_player_fixture_performance_v2;
revoke all on function api.ingest_current_player_fixture_performance_v2(text, text, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

-- The v1 import (20260925120000) with the rule above; everything not named in
-- the header is unchanged from it.
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
  placed jsonb := '[]'::jsonb;
  left_out jsonb := '[]'::jsonb;
  placed_by_decision integer := 0;
  gameweek_ids uuid[];
  normalized_source_version text;
  active_count integer;
  unnamed_starters integer;
  unnamed_rows integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if jsonb_typeof(p_coverage) is distinct from 'object'
    or p_coverage -> 'leaveOutUnplacedUnheld' is distinct from 'true'::jsonb then
    return api.ingest_current_player_fixture_performance_v2(p_provider_name, p_season_external_id,
      p_fixture_external_id, p_rows, p_coverage, p_observed_at);
  end if;
  select fixture.* into target_fixture
  from app_private.football_provider_mappings mapping
  join app.fixtures fixture on fixture.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name and mapping.entity_type = 'fixture'
    and mapping.external_id = p_fixture_external_id and mapping.active;
  -- An unknown fixture, or one under adaptive scoring: the existing path
  -- answers (and refuses) exactly as before.
  if not found or exists (select 1 from app.fantasy_fixture_assignments a
    where a.fixture_id = target_fixture.id and a.superseded_at is null
      and app_private.fantasy_adaptive_enabled(a.gameweek_id)) then
    return api.ingest_current_player_fixture_performance_v2(p_provider_name, p_season_external_id,
      p_fixture_external_id, p_rows, p_coverage, p_observed_at);
  end if;

  -- Payload, coverage and season checks of v1.
  if p_provider_name is distinct from 'sportsmonks' or p_season_external_id is distinct from '28647'
    or p_fixture_external_id is null or p_fixture_external_id !~ '^[1-9][0-9]{0,14}$'
    or p_observed_at is null or p_observed_at > statement_timestamp() + interval '1 minute'
    or p_observed_at < statement_timestamp() - interval '15 minutes'
    or jsonb_typeof(p_rows) is distinct from 'array'
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
  foreach field in array array['anonymousStarterRows','identifiedStarterRows'] loop
    if p_coverage ? field and (jsonb_typeof(p_coverage -> field) is distinct from 'number'
      or (p_coverage ->> field) !~ '^(0|[1-9][0-9]*)$') then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
  end loop;
  -- The three declarations: lists of at most 5, each entry of one exact shape.
  if (p_coverage ? 'heldPlayersNotInSquad' and (jsonb_typeof(p_coverage -> 'heldPlayersNotInSquad') <> 'array'
      or jsonb_array_length(p_coverage -> 'heldPlayersNotInSquad') > 5
      or exists (select 1 from jsonb_array_elements(p_coverage -> 'heldPlayersNotInSquad') entry
        where jsonb_typeof(entry) <> 'string'
          or entry #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')))
    or (p_coverage ? 'placeAtFixtureClub' and (jsonb_typeof(p_coverage -> 'placeAtFixtureClub') <> 'array'
      or jsonb_array_length(p_coverage -> 'placeAtFixtureClub') > 5
      or exists (select 1 from jsonb_array_elements(p_coverage -> 'placeAtFixtureClub') entry
        where jsonb_typeof(entry) <> 'object'
          or (select count(*) from jsonb_object_keys(entry)) <> 2
          or coalesce(entry ->> 'externalPlayerId', '') !~ '^[1-9][0-9]{0,14}$'
          or coalesce(entry ->> 'externalTeamId', '') !~ '^[1-9][0-9]{0,14}$')))
    or (p_coverage ? 'defensiveUnknownForwards' and (jsonb_typeof(p_coverage -> 'defensiveUnknownForwards') <> 'array'
      or jsonb_array_length(p_coverage -> 'defensiveUnknownForwards') > 5
      or exists (select 1 from jsonb_array_elements(p_coverage -> 'defensiveUnknownForwards') entry
        where jsonb_typeof(entry) <> 'string' or entry #>> '{}' !~ '^[1-9][0-9]{0,14}$')))
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  unnamed_starters := coalesce((p_coverage ->> 'anonymousStarterRows')::integer, 0);
  unnamed_rows := (p_coverage ->> 'excludedIncompleteRows')::integer;
  if p_coverage -> 'scoringStatisticsComplete' is distinct from 'true'::jsonb
    or p_coverage ->> 'cleanSheetSource' is distinct from 'official_minutes_and_on_pitch_goals_conceded'
    or p_coverage ->> 'goalkeeperStatistics' is distinct from 'explicit_value_or_null_canonical_position_checked_in_database'
    or (p_coverage ->> 'lineupRowsSeen')::integer <> jsonb_array_length(p_rows) + unnamed_rows
    or (p_coverage ->> 'validPlayerRows')::integer <> jsonb_array_length(p_rows)
    or unnamed_starters > 4
    or unnamed_rows < unnamed_starters or unnamed_rows > 20
    or (p_coverage ->> 'invalidDetailRows')::integer <> 0
    or (p_coverage ->> 'missingStatisticRows')::integer <> 0
    or (p_coverage ->> 'starterRows')::integer <> 22 - unnamed_starters
    or coalesce((p_coverage ->> 'identifiedStarterRows')::integer, 22 - unnamed_starters) <> 22 - unnamed_starters
    or (p_coverage ->> 'teamCount')::integer <> 2
    or (p_coverage ->> 'detailRows')::integer
      < (select count(*) from jsonb_array_elements(p_rows) value where value ->> 'appeared' = 'true')
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
  select fixture.* into target_fixture from app.fixtures fixture where fixture.id = target_fixture.id
  for update of fixture;
  if target_fixture.season_id <> target_season.id or target_fixture.status <> 'finished'
    or target_fixture.kickoff_at > statement_timestamp() then
    raise exception using errcode = '22023', message = 'FINISHED_CURRENT_FIXTURE_REQUIRED';
  end if;
  select * into existing_coverage
  from app_private.historical_performance_fixture_coverage coverage where coverage.fixture_id = target_fixture.id;
  if existing_coverage.provider_observed_at > p_observed_at then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;

  -- Each row as in v1, except that a row the catalogue cannot place is set
  -- aside instead of refusing the fixture.
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
    target_player_id := null;
    select player.id, player.position into target_player_id, target_player_position
    from app_private.football_provider_mappings mapping
    join app.players player on player.id = mapping.internal_entity_id
    where mapping.provider_name = p_provider_name and mapping.entity_type = 'player'
      and mapping.external_id = candidate ->> 'externalPlayerId' and mapping.active
    for share of player;
    if target_player_id is null then
      left_out := left_out || jsonb_build_array(candidate || jsonb_build_object(
        'teamId', target_team_id, 'reason', 'no_provider_mapping'));
    elsif not exists (select 1 from app.team_memberships membership
      where membership.season_id = target_season.id and membership.player_id = target_player_id
        and membership.team_id = target_team_id and membership.valid_from <= target_fixture.kickoff_at::date
        and (membership.valid_to is null or membership.valid_to >= target_fixture.kickoff_at::date))
      and not coalesce(p_coverage -> 'placeAtFixtureClub', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
        'externalPlayerId', candidate ->> 'externalPlayerId', 'externalTeamId', candidate ->> 'externalTeamId')) then
      left_out := left_out || jsonb_build_array(candidate || jsonb_build_object(
        'teamId', target_team_id, 'playerId', target_player_id, 'reason', 'no_club_record'));
    else
      if target_player_position not in ('goalkeeper','defender','midfielder','forward') or
        (target_player_position = 'goalkeeper' and
          (candidate -> 'saves' = 'null'::jsonb or candidate -> 'penaltiesSaved' = 'null'::jsonb)) then
        raise exception using errcode = '22023', message = 'CURRENT_POSITION_STATISTICS_INCOMPLETE';
      end if;
      placed := placed || jsonb_build_array(candidate || jsonb_build_object(
        'teamId', target_team_id, 'playerId', target_player_id, 'position', target_player_position));
    end if;
  end loop;
  -- Starters are counted over every named row, placed or left out, as in v1.
  if (select count(distinct value ->> 'externalPlayerId') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows)
    or (select count(distinct value ->> 'externalTeamId') from jsonb_array_elements(p_rows)) <> 2
    or (select count(*) from jsonb_array_elements(p_rows) value where (value ->> 'started')::boolean)
      <> 22 - unnamed_starters
    or exists (select 1 from jsonb_array_elements(p_rows) value group by value ->> 'externalTeamId'
      having count(*) filter (where (value ->> 'started')::boolean) not between 11 - unnamed_starters and 11) then
    raise exception using errcode = '22023', message = 'CURRENT_PERFORMANCE_INCOMPLETE';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) value
    join app_private.football_provider_mappings team_map
      on team_map.provider_name = p_provider_name and team_map.entity_type = 'team'
      and team_map.external_id = value ->> 'externalTeamId' and team_map.active
    cross join lateral (select case when team_map.internal_entity_id = target_fixture.home_team_id
      then target_fixture.away_score else target_fixture.home_score end as conceded) side
    where (value ->> 'goalsConceded')::integer > side.conceded
      or ((value ->> 'started')::boolean and (value ->> 'minutes')::integer >= 90
        and (value ->> 'goalsConceded')::integer <> side.conceded))
  then
    raise exception using errcode = '22023', message = 'CURRENT_GOALS_CONCEDED_MISMATCH';
  end if;

  -- Forwards whose goals conceded could not be proved: a started row, and a
  -- canonical forward that no Fantasy player lists at another position (a
  -- left-out row scores for nobody).
  if exists (select 1 from jsonb_array_elements(coalesce(p_coverage -> 'defensiveUnknownForwards', '[]'::jsonb)) declared
    where not exists (select 1 from jsonb_array_elements(p_rows) value
        where value ->> 'externalPlayerId' = declared #>> '{}' and (value ->> 'started')::boolean)
      or exists (select 1 from jsonb_array_elements(placed) value
        where value ->> 'externalPlayerId' = declared #>> '{}'
          and (value ->> 'position' <> 'forward' or exists (select 1 from app.fantasy_players fp
            join app.fantasy_positions pos on pos.id = fp.position_id
            where fp.football_player_id = (value ->> 'playerId')::uuid and pos.code <> 'FWD'))))
  then
    raise exception using errcode = '22023', message = 'DEFENSIVE_UNKNOWN_NOT_FORWARD';
  end if;
  -- Every placement and every absence declared by the owner must still
  -- describe this fixture.
  select count(*) into placed_by_decision from jsonb_array_elements(placed) value
  where coalesce(p_coverage -> 'placeAtFixtureClub', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'externalPlayerId', value ->> 'externalPlayerId', 'externalTeamId', value ->> 'externalTeamId'))
    and not exists (select 1 from app.team_memberships membership
      where membership.season_id = target_season.id and membership.player_id = (value ->> 'playerId')::uuid
        and membership.team_id = (value ->> 'teamId')::uuid and membership.valid_from <= target_fixture.kickoff_at::date
        and (membership.valid_to is null or membership.valid_to >= target_fixture.kickoff_at::date));
  if placed_by_decision <> jsonb_array_length(coalesce(p_coverage -> 'placeAtFixtureClub', '[]'::jsonb)) then
    raise exception using errcode = 'P0001', message = 'OWNER_DECISION_STALE';
  end if;

  if jsonb_array_length(left_out) = 0 and placed_by_decision = 0 then
    -- Nobody to leave out and nobody to place: the existing import, unchanged.
    return api.ingest_current_player_fixture_performance_v2(p_provider_name, p_season_external_id,
      p_fixture_external_id, p_rows, p_coverage, p_observed_at);
  end if;

  -- From here a row is left out or placed by decision, and the rule decides
  -- whether that can hurt anybody's points.
  if jsonb_array_length(left_out) + unnamed_rows > 20 or jsonb_array_length(placed) < 22 then
    raise exception using errcode = '22023', message = 'LEFT_OUT_ROWS_EXCEEDED';
  end if;
  select coalesce(array_agg(a.gameweek_id), '{}') into gameweek_ids
  from app.fantasy_fixture_assignments a
  where a.fixture_id = target_fixture.id and a.superseded_at is null and a.counts_points;
  if exists (select 1 from app.fantasy_gameweeks gw where gw.id = any(gameweek_ids)
      and gw.status not in ('locked', 'live', 'provisional'))
    or exists (select 1 from app.fantasy_lineups lineup
      where lineup.gameweek_id = any(gameweek_ids) and lineup.locked_at is null) then
    raise exception using errcode = 'P0001', message = 'LEAVE_OUT_GAMEWEEK_NOT_LOCKED';
  end if;
  -- Held: in a locked lineup of a gameweek the fixture counts for.
  if exists (select 1 from jsonb_array_elements(left_out) value
    join app.fantasy_players fp on fp.football_player_id = (value ->> 'playerId')::uuid
    join app.fantasy_lineup_players lp on lp.fantasy_player_id = fp.id
    join app.fantasy_lineups lineup on lineup.id = lp.lineup_id
    where lineup.gameweek_id = any(gameweek_ids) and lineup.locked_at is not null) then
    raise exception using errcode = 'P0001', message = 'LEFT_OUT_PLAYER_HELD';
  end if;
  -- A declared absence names a held player at one of the clubs with no mapping.
  if exists (select 1 from jsonb_array_elements(coalesce(p_coverage -> 'heldPlayersNotInSquad', '[]'::jsonb)) declared
    where not exists (select 1 from app.fantasy_players fp
      join app.fantasy_lineup_players lp on lp.fantasy_player_id = fp.id
      join app.fantasy_lineups lineup on lineup.id = lp.lineup_id
      where fp.id = (declared #>> '{}')::uuid
        and lineup.gameweek_id = any(gameweek_ids) and lineup.locked_at is not null
        and fp.football_team_id in (target_fixture.home_team_id, target_fixture.away_team_id)
        and not exists (select 1 from app_private.football_provider_mappings mapping
          where mapping.provider_name = p_provider_name and mapping.entity_type = 'player'
            and mapping.internal_entity_id = fp.football_player_id and mapping.active))) then
    raise exception using errcode = 'P0001', message = 'OWNER_DECISION_STALE';
  end if;
  if exists (select 1 from app.fantasy_players fp
    join app.fantasy_lineup_players lp on lp.fantasy_player_id = fp.id
    join app.fantasy_lineups lineup on lineup.id = lp.lineup_id
    where lineup.gameweek_id = any(gameweek_ids) and lineup.locked_at is not null
      and fp.football_team_id in (target_fixture.home_team_id, target_fixture.away_team_id)
      and not exists (select 1 from app_private.football_provider_mappings mapping
        where mapping.provider_name = p_provider_name and mapping.entity_type = 'player'
          and mapping.internal_entity_id = fp.football_player_id and mapping.active)
      and not coalesce(p_coverage -> 'heldPlayersNotInSquad', '[]'::jsonb) ? fp.id::text) then
    raise exception using errcode = 'P0001', message = 'HELD_PLAYER_UNMAPPED';
  end if;

  -- Who is left out is part of the version: the same provider facts imported
  -- again once those players are placed must not inherit this record.
  normalized_source_version := 'sportsmonks-current-fixture:' || encode(extensions.digest(
    jsonb_build_object('fixtureId', target_fixture.id, 'rows', p_rows, 'coverage', p_coverage,
      'leftOut', (select jsonb_agg(jsonb_build_array(value ->> 'externalPlayerId', value ->> 'reason')
        order by value ->> 'externalPlayerId') from jsonb_array_elements(left_out) value))::text, 'sha256'), 'hex');
  if existing_coverage.provider_observed_at = p_observed_at and existing_coverage.source_version <> normalized_source_version then
    raise exception using errcode = 'P0001', message = 'SOURCE_OBSERVATION_CONFLICT';
  end if;
  if existing_coverage.source_version = normalized_source_version and existing_coverage.scoring_statistics_complete
    and existing_coverage.reconciled and (select count(*) from app.player_fixture_performances performance
      where performance.fixture_id = target_fixture.id and performance.active
        and performance.source_version = normalized_source_version) = jsonb_array_length(placed)
    and not exists (select 1 from app.player_fixture_performances performance
      where performance.fixture_id = target_fixture.id and performance.active
        and performance.source_version <> normalized_source_version)
    and (select count(*) from app_private.current_fixture_left_out_players recorded
      where recorded.fixture_id = target_fixture.id
        and recorded.coverage_source_version = normalized_source_version) = jsonb_array_length(left_out)
  then
    update app_private.historical_performance_fixture_coverage
      set provider_observed_at = p_observed_at where fixture_id = target_fixture.id
      and provider_observed_at < p_observed_at;
    return jsonb_build_object('fixtureId', target_fixture.id, 'sourceVersion', normalized_source_version,
      'active', jsonb_array_length(placed), 'leftOut', jsonb_array_length(left_out),
      'placedAtFixtureClub', placed_by_decision, 'reconciled', true, 'scoringStatisticsComplete', true);
  end if;
  update app.player_fixture_performances set active = false
    where fixture_id = target_fixture.id and active;
  insert into app.player_fixture_performances (
    football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
    started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves,
    penalties_saved, penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
    own_goals, provider_rating, active, provider_observed_at
  )
  select target_season.id, target_fixture.id, (value ->> 'playerId')::uuid, (value ->> 'teamId')::uuid,
    (value ->> 'position')::app.football_position, p_provider_name, normalized_source_version,
    (value ->> 'started')::boolean, (value ->> 'appeared')::boolean, (value ->> 'minutes')::integer,
    (value ->> 'goals')::integer, (value ->> 'assists')::integer, (value ->> 'cleanSheets')::integer,
    (value ->> 'goalsConceded')::integer, (value ->> 'saves')::integer,
    (value ->> 'penaltiesSaved')::integer, (value ->> 'penaltiesMissed')::integer,
    (value ->> 'yellowCards')::integer, (value ->> 'redCards')::integer,
    (value ->> 'secondYellowDismissals')::integer, (value ->> 'ownGoals')::integer,
    (value ->> 'providerRating')::numeric, true, p_observed_at
  from jsonb_array_elements(placed) value
  on conflict on constraint player_fixture_performances_source_key do update
    set active = true, provider_observed_at = excluded.provider_observed_at;
  select count(*) into active_count from app.player_fixture_performances performance
    where performance.fixture_id = target_fixture.id and performance.active;
  if active_count <> jsonb_array_length(placed) then
    raise exception using errcode = '22023', message = 'PERFORMANCE_RECONCILIATION_FAILED';
  end if;
  insert into app_private.current_fixture_left_out_players (
    fixture_id, coverage_source_version, external_player_id, external_team_id, team_id, player_id,
    reason, started, minutes, goals, own_goals, provider_observed_at
  )
  select target_fixture.id, normalized_source_version, value ->> 'externalPlayerId', value ->> 'externalTeamId',
    (value ->> 'teamId')::uuid, (value ->> 'playerId')::uuid, value ->> 'reason',
    (value ->> 'started')::boolean, (value ->> 'minutes')::integer, (value ->> 'goals')::integer,
    (value ->> 'ownGoals')::integer, p_observed_at
  from jsonb_array_elements(left_out) value
  on conflict do nothing;
  insert into app_private.historical_performance_fixture_coverage (
    fixture_id, football_season_id, source_provider, source_version, lineup_rows_seen, valid_player_rows,
    excluded_incomplete_rows, excluded_mapping_rows, starter_rows, anonymous_starter_rows,
    identified_starter_rows, team_count, detail_rows,
    invalid_detail_rows, performance_rows, reconciled, provider_observed_at, scoring_statistics_complete
  ) values (
    target_fixture.id, target_season.id, p_provider_name, normalized_source_version,
    active_count + unnamed_rows + jsonb_array_length(left_out), active_count,
    unnamed_rows + jsonb_array_length(left_out), jsonb_array_length(left_out),
    22 - unnamed_starters, unnamed_starters,
    22 - unnamed_starters, 2, (p_coverage ->> 'detailRows')::integer, 0, active_count, true, p_observed_at, true
  ) on conflict (fixture_id) do update set
    football_season_id = excluded.football_season_id, source_provider = excluded.source_provider,
    source_version = excluded.source_version, lineup_rows_seen = excluded.lineup_rows_seen,
    valid_player_rows = excluded.valid_player_rows, excluded_incomplete_rows = excluded.excluded_incomplete_rows,
    excluded_mapping_rows = excluded.excluded_mapping_rows, starter_rows = excluded.starter_rows,
    anonymous_starter_rows = excluded.anonymous_starter_rows,
    identified_starter_rows = excluded.identified_starter_rows,
    coverage_outcome = 'accepted', quarantine_reason = null,
    team_count = 2, detail_rows = excluded.detail_rows, invalid_detail_rows = 0,
    performance_rows = excluded.performance_rows, reconciled = true,
    provider_observed_at = excluded.provider_observed_at, scoring_statistics_complete = true;
  return jsonb_build_object('fixtureId', target_fixture.id, 'sourceVersion', normalized_source_version,
    'active', active_count, 'leftOut', jsonb_array_length(left_out),
    'placedAtFixtureClub', placed_by_decision, 'reconciled', true, 'scoringStatisticsComplete', true);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or unique_violation or not_null_violation then
  raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;
revoke all on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) to service_role;

-- The scoring document's fixture check (20260926094810, renamed _v1 by
-- 20260927094823): unchanged except that excluded_mapping_rows may now equal
-- the left-out rows recorded for the coverage's source version, and they are
-- part of the rows left out in all.
create or replace function app_private.fantasy_validate_scoring_document_v1(p_document jsonb)
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
      -- starters unnamed; the rows left out are the unnamed ones and the
      -- recorded left-out players (20261004120000), at most 20.
      or f#>>'{coverage,coverage_outcome}' is distinct from 'accepted'
      or coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,-1) not between 0 and 4
      or coalesce((f#>>'{coverage,excluded_incomplete_rows}')::integer,-1)
        not between coalesce((f#>>'{coverage,anonymous_starter_rows}')::integer,0)
          + coalesce((f#>>'{coverage,excluded_mapping_rows}')::integer,0) and 20
      or coalesce((f#>>'{coverage,excluded_mapping_rows}')::integer,0)
        <> (select count(*) from app_private.current_fixture_left_out_players recorded
          where recorded.fixture_id=(f->>'fixtureId')::uuid
            and recorded.coverage_source_version=f#>>'{coverage,source_version}')
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
  if app_private.fantasy_goal_reconciliation(p_document) <> '[]'::jsonb then
    raise exception using errcode='PT409',message='fantasy_goal_totals_mismatch';
  end if;
end;
$$;

-- The goal check (20260926101555), unchanged except that goals the document
-- does not carry now count: those of placed players outside the Fantasy
-- catalogue and of recorded left-out players, both for the coverage's source
-- version. They used to make a fixture with a non-catalogue scorer look short.
create or replace function app_private.fantasy_goal_reconciliation(p_document jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  fixture jsonb;
  player_teams jsonb;
  catalogue jsonb;
  attributed_home bigint;
  attributed_away bigint;
  outside_home bigint;
  outside_away bigint;
  result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_document->'fixtures') is distinct from 'array'
    or jsonb_typeof(p_document->'players') is distinct from 'array'
    or jsonb_typeof(p_document->'playerFixtures') is distinct from 'array' then
    return jsonb_build_array(jsonb_build_object('reason', 'scoring_document_incomplete'));
  end if;
  select coalesce(jsonb_object_agg(player->>'fantasyPlayerId', player->>'teamId'), '{}'::jsonb),
    coalesce(jsonb_object_agg(coalesce(player->>'playerId', ''), true), '{}'::jsonb)
    into player_teams, catalogue from jsonb_array_elements(p_document->'players') player;
  for fixture in select value from jsonb_array_elements(p_document->'fixtures') loop
    if fixture->>'status' is distinct from 'finished'
      or (fixture#>>'{assignment,counts_points}')::boolean is distinct from true then
      continue;
    end if;
    if fixture->>'homeScore' is null or fixture->>'awayScore' is null then
      result := result || jsonb_build_array(jsonb_build_object(
        'fixtureId', fixture->>'fixtureId', 'reason', 'final_score_missing'));
      continue;
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_document->'playerFixtures') performance
      where performance->>'fixtureId' = fixture->>'fixtureId'
        and (coalesce(performance->>'fixtureTeamId',
          player_teams->>(performance->>'fantasyPlayerId')) is null
          or jsonb_typeof(performance#>'{stats,goals}') is distinct from 'number'
          or jsonb_typeof(performance#>'{stats,ownGoals}') is distinct from 'number')
    ) then
      result := result || jsonb_build_array(jsonb_build_object(
        'fixtureId', fixture->>'fixtureId', 'reason', 'player_statistics_missing'));
      continue;
    end if;
    select
      coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'homeTeamId'
        then (performance#>>'{stats,goals}')::bigint else 0 end), 0)
      + coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'awayTeamId'
        then (performance#>>'{stats,ownGoals}')::bigint else 0 end), 0),
      coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'awayTeamId'
        then (performance#>>'{stats,goals}')::bigint else 0 end), 0)
      + coalesce(sum(case when coalesce(performance->>'fixtureTeamId',
        player_teams->>(performance->>'fantasyPlayerId')) = fixture->>'homeTeamId'
        then (performance#>>'{stats,ownGoals}')::bigint else 0 end), 0)
      into attributed_home, attributed_away
      from jsonb_array_elements(p_document->'playerFixtures') performance
      where performance->>'fixtureId' = fixture->>'fixtureId';
    select coalesce(sum(case when outside.team_id::text = fixture->>'homeTeamId' then outside.goals
        when outside.team_id::text = fixture->>'awayTeamId' then outside.own_goals else 0 end), 0),
      coalesce(sum(case when outside.team_id::text = fixture->>'awayTeamId' then outside.goals
        when outside.team_id::text = fixture->>'homeTeamId' then outside.own_goals else 0 end), 0)
      into outside_home, outside_away
      from (
        select p.team_id, p.goals, p.own_goals from app.player_fixture_performances p
        where p.fixture_id = (fixture->>'fixtureId')::uuid and p.active
          and p.source_version = fixture#>>'{coverage,source_version}'
          and not catalogue ? p.player_id::text
        union all
        select recorded.team_id, recorded.goals, recorded.own_goals
        from app_private.current_fixture_left_out_players recorded
        where recorded.fixture_id = (fixture->>'fixtureId')::uuid
          and recorded.coverage_source_version = fixture#>>'{coverage,source_version}'
      ) outside;
    attributed_home := attributed_home + outside_home;
    attributed_away := attributed_away + outside_away;
    if attributed_home <> (fixture->>'homeScore')::bigint
      or attributed_away <> (fixture->>'awayScore')::bigint then
      result := result || jsonb_build_array(jsonb_build_object(
        'fixtureId', fixture->>'fixtureId',
        'homeScore', (fixture->>'homeScore')::bigint, 'awayScore', (fixture->>'awayScore')::bigint,
        'homeAttributed', attributed_home, 'awayAttributed', attributed_away));
    end if;
  end loop;
  return result;
end;
$$;
revoke all on function app_private.fantasy_goal_reconciliation(jsonb)
  from public, anon, authenticated, service_role;
