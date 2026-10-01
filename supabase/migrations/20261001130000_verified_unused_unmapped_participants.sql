-- BotolaGO Production V2
-- A named substitute whom the provider proves did not play, and whom the
-- canonical list cannot place, no longer blocks a finished fixture.
--
-- WHY. api.ingest_current_player_fixture_performance (20260925120000, behind
-- the adaptive wrapper of 20260927094823) refuses a fixture when ANY named
-- lineup row has no canonical player (PLAYER_MAPPING_NOT_FOUND). That is right
-- for everybody who played or could score. It also stops a fixture for a
-- substitute who never left the bench when the provider gives that substitute
-- no position: a canonical player cannot be created without a real position
-- (app.players.position is NOT NULL with four values), so the fixture waits
-- for a position nobody has, though the player cannot change a single point.
--
-- WHAT THIS ADDS. Nothing in the existing function changes. It is renamed (the
-- adaptive migration's own pattern) and a new function of the same name and
-- signature stands in front of it. The caller (the importer) may declare, in
-- p_coverage -> 'verifiedUnusedSubstitutes', the named substitutes the PROVIDER
-- showed as unused: no official minutes (absent or 0), and no scoring-relevant
-- statistic with a value, known or unknown. The database then re-checks, for
-- every declared player and independently of the caller:
--   * the row it was sent for him says the same: not a starter, did not
--     appear, every counted statistic exactly 0 (saves and penalties saved
--     too: an unknown value is not 0), no provider rating;
--   * his club is one of the fixture's two clubs;
--   * the canonical list has NO provider mapping for his provider id at all,
--     active or not (one that exists means he is, or was, a known player: the
--     normal rules apply, including their refusals);
--   * the fixture's gameweek is not under adaptive scoring (that path is not
--     reviewed for this rule);
--   * at most 2 players qualify in one fixture (more is a case for a person).
-- A player who passes is left out of the performance rows, counted with the
-- rows left out (excluded_incomplete_rows, as unnamed rows are), and RECORDED,
-- by provider id, in app_private.current_fixture_excluded_participants, bound
-- to the coverage row's source version. The fact that he was on the match
-- sheet, a verified unused substitute, unidentified here, is never dropped.
-- Everyone else, and every fixture that declares nobody, takes the existing
-- function exactly as before, with the same source version.
--
-- WHAT IT DOES NOT CHANGE. A starter, a player with minutes or any statistic,
-- a mapped player, a goalkeeper check, the 11 starters per side, goal
-- reconciliation, goals conceded, and the importer's own checks all stay as
-- they are: none of them is reached by this rule.
--
-- FANTASY. A player who did not appear and carries all-zero statistics scores 0
-- in every category, and the scoring document is built from Fantasy players
-- (a left join to performance rows), so a performance row for a non-Fantasy
-- player is never read. A Fantasy player without a performance row is already
-- scored as one who did not play, exactly what the provider facts say.
--
-- Same signature and grants as before for api.ingest_current_player_fixture_performance.

create table app_private.current_fixture_excluded_participants (
  fixture_id uuid not null references app.fixtures(id) on delete restrict,
  -- The coverage row's source version this record belongs to; a later ingest
  -- of different facts has a different one, so the history is kept.
  coverage_source_version text not null
    check (coverage_source_version ~ '^sportsmonks-current-fixture:[0-9a-f]{64}$'),
  provider_name text not null check (provider_name = 'sportsmonks'),
  external_player_id text not null check (external_player_id ~ '^[1-9][0-9]{0,14}$'),
  external_team_id text not null check (external_team_id ~ '^[1-9][0-9]{0,14}$'),
  team_id uuid not null references app.teams(id) on delete restrict,
  participation_role text not null check (participation_role = 'substitute'),
  reason text not null check (reason = 'verified_unused_unmapped'),
  -- Null: the provider sent no official minutes for him. 0: it sent a zero.
  official_minutes integer check (official_minutes = 0),
  -- Scoring-relevant statistic types the provider sent with an explicit 0.
  zero_statistic_type_ids integer[] not null default '{}'::integer[],
  provider_observed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (fixture_id, coverage_source_version, external_player_id)
);
comment on table app_private.current_fixture_excluded_participants is
  'Named lineup substitutes the provider showed as unused and the canonical list could not place, left out of a certified fixture''s performance rows on purpose (verified, never unknown). Written only by api.ingest_current_player_fixture_performance.';

alter table app_private.current_fixture_excluded_participants enable row level security;
alter table app_private.current_fixture_excluded_participants force row level security;
revoke all on table app_private.current_fixture_excluded_participants from public, anon, authenticated;
grant select, insert on table app_private.current_fixture_excluded_participants to service_role;

-- The records that describe a fixture's CURRENT coverage row.
create view app_private.current_fixture_verified_unused_participants
with (security_invoker = true) as
select participant.*
from app_private.current_fixture_excluded_participants participant
join app_private.historical_performance_fixture_coverage coverage
  on coverage.fixture_id = participant.fixture_id
  and coverage.source_version = participant.coverage_source_version;
revoke all on table app_private.current_fixture_verified_unused_participants from public, anon, authenticated;
grant select on table app_private.current_fixture_verified_unused_participants to service_role;

alter function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz)
  rename to ingest_current_player_fixture_performance_before_exclusions;
revoke all on function api.ingest_current_player_fixture_performance_before_exclusions(text, text, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

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
  declaration jsonb;
  stripped jsonb;
  target_fixture app.fixtures%rowtype;
  entry jsonb;
  candidate_row jsonb;
  field text;
  team_internal uuid;
  declared_ids text[] := '{}'::text[];
  eligible jsonb := '[]'::jsonb;
  eligible_ids text[] := '{}'::text[];
  adjusted_rows jsonb;
  adjusted_coverage jsonb;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  -- No declaration: the existing function, with exactly what it was given.
  if jsonb_typeof(p_coverage) is distinct from 'object' or not (p_coverage ? 'verifiedUnusedSubstitutes') then
    return api.ingest_current_player_fixture_performance_before_exclusions(
      p_provider_name, p_season_external_id, p_fixture_external_id, p_rows, p_coverage, p_observed_at);
  end if;
  declaration := p_coverage -> 'verifiedUnusedSubstitutes';
  -- The declaration never reaches the existing function: a fixture that
  -- excludes nobody keeps its source version, whatever was declared.
  stripped := p_coverage - 'verifiedUnusedSubstitutes';
  if jsonb_typeof(declaration) is distinct from 'array' or jsonb_array_length(declaration) > 40
    or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  select fixture.* into target_fixture
  from app_private.football_provider_mappings mapping
  join app.fixtures fixture on fixture.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name and mapping.entity_type = 'fixture'
    and mapping.external_id = p_fixture_external_id and mapping.active;
  if not found
    -- Adaptive scoring has its own participation evidence and is not reviewed for this rule.
    or exists (
      select 1 from app.fantasy_fixture_assignments assignment
      where assignment.fixture_id = target_fixture.id and assignment.superseded_at is null
        and app_private.fantasy_adaptive_enabled(assignment.gameweek_id))
    -- The numbers this rule adjusts must be numbers (the existing function refuses them otherwise).
    or coalesce(stripped ->> 'validPlayerRows', '') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(stripped ->> 'excludedIncompleteRows', '') !~ '^(0|[1-9][0-9]*)$'
  then
    return api.ingest_current_player_fixture_performance_before_exclusions(
      p_provider_name, p_season_external_id, p_fixture_external_id, p_rows, stripped, p_observed_at);
  end if;

  for entry in select value from jsonb_array_elements(declaration) loop
    -- A declaration that is malformed, or that the row sent for the same
    -- player contradicts, is a defect in the caller, never a case to decide.
    if jsonb_typeof(entry) is distinct from 'object'
      or coalesce(entry ->> 'externalPlayerId', '') !~ '^[1-9][0-9]{0,14}$'
      or coalesce(entry ->> 'externalTeamId', '') !~ '^[1-9][0-9]{0,14}$'
      or (entry ->> 'externalPlayerId') = any (declared_ids)
      or entry ->> 'role' is distinct from 'substitute'
      or (entry ? 'officialMinutes' and entry -> 'officialMinutes' not in ('null'::jsonb, '0'::jsonb))
      or jsonb_typeof(entry -> 'scoringStatisticTypeIds') is distinct from 'array'
      or jsonb_array_length(entry -> 'scoringStatisticTypeIds') <> 0
      or jsonb_typeof(entry -> 'unknownStatisticTypeIds') is distinct from 'array'
      or jsonb_array_length(entry -> 'unknownStatisticTypeIds') <> 0
      or jsonb_typeof(entry -> 'zeroStatisticTypeIds') is distinct from 'array'
      or exists (select 1 from jsonb_array_elements(entry -> 'zeroStatisticTypeIds') zero_type
        where jsonb_typeof(zero_type) is distinct from 'number' or (zero_type #>> '{}') !~ '^[1-9][0-9]{0,5}$')
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    declared_ids := declared_ids || (entry ->> 'externalPlayerId');
    if (select count(*) from jsonb_array_elements(p_rows) value
        where value ->> 'externalPlayerId' = entry ->> 'externalPlayerId') <> 1 then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    select value into candidate_row from jsonb_array_elements(p_rows) value
      where value ->> 'externalPlayerId' = entry ->> 'externalPlayerId';
    if candidate_row ->> 'externalTeamId' is distinct from entry ->> 'externalTeamId'
      or candidate_row -> 'started' is distinct from 'false'::jsonb
      or candidate_row -> 'appeared' is distinct from 'false'::jsonb
      or (candidate_row ? 'providerRating' and candidate_row -> 'providerRating' <> 'null'::jsonb)
      or exists (
        select 1 from unnest(array['minutes','goals','assists','cleanSheets','goalsConceded','saves',
          'penaltiesSaved','penaltiesMissed','yellowCards','redCards','secondYellowDismissals','ownGoals']) counted
        where candidate_row -> counted is distinct from '0'::jsonb)
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    -- From here the facts hold; whether the DATABASE can leave him out is the
    -- question, and "no" is not an error: his row simply goes the normal way.
    select team_map.internal_entity_id into team_internal
    from app_private.football_provider_mappings team_map
    where team_map.provider_name = p_provider_name and team_map.entity_type = 'team'
      and team_map.external_id = entry ->> 'externalTeamId' and team_map.active;
    if team_internal is null or team_internal not in (target_fixture.home_team_id, target_fixture.away_team_id) then
      continue;
    end if;
    -- Any mapping row, active or not, means the canonical list knows (or knew) him.
    if exists (
      select 1 from app_private.football_provider_mappings player_map
      where player_map.provider_name = p_provider_name and player_map.entity_type = 'player'
        and player_map.external_id = entry ->> 'externalPlayerId') then
      continue;
    end if;
    eligible := eligible || jsonb_build_array(jsonb_build_object(
      'externalPlayerId', entry ->> 'externalPlayerId',
      'externalTeamId', entry ->> 'externalTeamId',
      'teamId', team_internal,
      'role', 'substitute',
      'reason', 'verified_unused_unmapped',
      'officialMinutes', coalesce(entry -> 'officialMinutes', 'null'::jsonb),
      'zeroStatisticTypeIds', entry -> 'zeroStatisticTypeIds'));
    eligible_ids := eligible_ids || (entry ->> 'externalPlayerId');
  end loop;

  -- More than 2 in one fixture is not this rule's case: nobody is left out.
  if cardinality(eligible_ids) = 0 or cardinality(eligible_ids) > 2 then
    return api.ingest_current_player_fixture_performance_before_exclusions(
      p_provider_name, p_season_external_id, p_fixture_external_id, p_rows, stripped, p_observed_at);
  end if;

  select coalesce(jsonb_agg(row_entry.value order by row_entry.ord), '[]'::jsonb) into adjusted_rows
  from jsonb_array_elements(p_rows) with ordinality as row_entry(value, ord)
  where row_entry.value ->> 'externalPlayerId' <> all (eligible_ids);
  -- The rows seen stay the same: what leaves the valid rows joins the rows left
  -- out. The evidence is part of the coverage, so the source version binds it.
  adjusted_coverage := stripped || jsonb_build_object(
    'validPlayerRows', (stripped ->> 'validPlayerRows')::integer - cardinality(eligible_ids),
    'excludedIncompleteRows', (stripped ->> 'excludedIncompleteRows')::integer + cardinality(eligible_ids),
    'verifiedUnusedUnmappedExcluded', eligible);

  result := api.ingest_current_player_fixture_performance_before_exclusions(
    p_provider_name, p_season_external_id, p_fixture_external_id, adjusted_rows, adjusted_coverage, p_observed_at);

  insert into app_private.current_fixture_excluded_participants (
    fixture_id, coverage_source_version, provider_name, external_player_id, external_team_id, team_id,
    participation_role, reason, official_minutes, zero_statistic_type_ids, provider_observed_at
  )
  select target_fixture.id, result ->> 'sourceVersion', p_provider_name,
    excluded ->> 'externalPlayerId', excluded ->> 'externalTeamId', (excluded ->> 'teamId')::uuid,
    'substitute', 'verified_unused_unmapped',
    case when excluded -> 'officialMinutes' = 'null'::jsonb then null else (excluded ->> 'officialMinutes')::integer end,
    coalesce((select array_agg((zero_type #>> '{}')::integer order by (zero_type #>> '{}')::integer)
      from jsonb_array_elements(excluded -> 'zeroStatisticTypeIds') zero_type), '{}'::integer[]),
    p_observed_at
  from jsonb_array_elements(eligible) excluded
  on conflict do nothing;

  return result || jsonb_build_object('excludedVerifiedUnusedUnmapped', to_jsonb(eligible_ids));
end;
$$;

revoke all on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz)
  to service_role;
