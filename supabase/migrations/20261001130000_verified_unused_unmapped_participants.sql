-- BotolaGO Production V2
-- A named substitute whom the provider shows as unused, whom the canonical
-- list cannot place, and whom the OWNER has approved by name for one fixture,
-- no longer blocks that finished fixture.
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
-- signature stands in front of it.
--
-- SCOPE IS EXPLICIT. Nobody is ever found by the database or the importer at run
-- time. The caller declares, in p_coverage -> 'verifiedUnusedSubstitutes', the
-- exact players an owner-reviewed allowlist (a file in the repository, so a
-- reviewed commit) names for THIS fixture: at most 2. The limit applies to that
-- declared list, never to how many substitutes happened to be unused.
--
-- WHAT THE DATABASE CHECKS ITSELF, for every declared player:
--   * the declaration names this fixture, and it carries the facts the importer
--     read from the provider: substitute, official minutes absent or 0, no
--     scoring-relevant statistic with a value, no unknown statistic, no match
--     event naming him (all as empty lists, so each is part of the contract),
--     and a digest of exactly those facts, which the database RECOMPUTES;
--   * the row it was sent for him says the same: not a starter, did not
--     appear, every counted statistic exactly 0 (saves and penalties saved
--     too: an unknown value is not 0), no provider rating;
--   * his club is one of the fixture's two clubs;
--   * the canonical list has NO provider mapping for his provider id at all,
--     active or not;
--   * the fixture's gameweek is not under adaptive scoring (that path is not
--     reviewed for this rule);
--   * the starters in the rows are still the starters the coverage reports and
--     no club has more than 11.
-- If ANY of this fails the fixture is REFUSED (the exception has been approved
-- for a world that is no longer the one the database sees: find out why). It
-- never falls back to ingesting him, and never silently drops him.
--
-- WHAT THE DATABASE CANNOT CHECK, said plainly. It cannot see the provider's
-- payload. That he had no minutes, no statistic and no match event is TRUSTED
-- IMPORTER EVIDENCE: the importer read it from the provider, and the database
-- stores the digest of what the importer said (and checks the digest matches
-- the declaration), so the evidence is bound to the exception and to the
-- coverage's source version; it is not independently re-verified here. Likewise
-- that no canonical or Fantasy record exists for the same real person, which a
-- missing provider mapping does NOT prove, is an OWNER-REVIEWED claim: the
-- digest of the reviewed preflight record is stored with each exclusion.
--
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
  -- Match-event types naming him: always empty, or he is not unused.
  event_type_ids integer[] not null default '{}'::integer[]
    check (event_type_ids = '{}'::integer[]),
  -- What the evidence rests on. The importer read the provider; the database
  -- checked the digest against the declaration and did not see the provider.
  evidence_basis text not null default 'importer_declared_digest_bound'
    check (evidence_basis = 'importer_declared_digest_bound'),
  -- sha256 of the facts above, in the form the migration defines.
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  -- sha256 of the owner-reviewed preflight record (no canonical match, no
  -- Fantasy player, no squad, no locked lineup). Stored, not verifiable here.
  preflight_digest text not null check (preflight_digest ~ '^[0-9a-f]{64}$'),
  provider_observed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (fixture_id, coverage_source_version, external_player_id)
);
comment on table app_private.current_fixture_excluded_participants is
  'Named lineup substitutes the provider showed as unused and the canonical list could not place, approved by the owner for one fixture and left out of its performance rows on purpose (verified, never unknown). Written only by api.ingest_current_player_fixture_performance. The unused facts are trusted importer evidence bound by digest; the no-canonical-record claim is an owner-reviewed preflight, stored by digest.';

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
  team_internal uuid;
  zero_ids text;
  expected_digest text;
  declared_ids text[] := '{}'::text[];
  eligible jsonb := '[]'::jsonb;
  adjusted_rows jsonb;
  adjusted_coverage jsonb;
  result jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  -- No declaration (or an empty one): the existing function, with exactly what
  -- it was given, minus the empty key so the source version is unchanged.
  if jsonb_typeof(p_coverage) is distinct from 'object' or not (p_coverage ? 'verifiedUnusedSubstitutes') then
    return api.ingest_current_player_fixture_performance_before_exclusions(
      p_provider_name, p_season_external_id, p_fixture_external_id, p_rows, p_coverage, p_observed_at);
  end if;
  declaration := p_coverage -> 'verifiedUnusedSubstitutes';
  -- The declaration never reaches the existing function: a fixture that
  -- excludes nobody keeps its source version, whatever was declared.
  stripped := p_coverage - 'verifiedUnusedSubstitutes';
  -- At most 2, counted on the declared (owner-approved) list.
  if jsonb_typeof(declaration) is distinct from 'array' or jsonb_array_length(declaration) > 2
    or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if jsonb_array_length(declaration) = 0 then
    return api.ingest_current_player_fixture_performance_before_exclusions(
      p_provider_name, p_season_external_id, p_fixture_external_id, p_rows, stripped, p_observed_at);
  end if;

  for entry in select value from jsonb_array_elements(declaration) loop
    -- A declaration that is malformed, or that the row sent for the same
    -- player contradicts, is a defect in the caller, never a case to decide.
    if jsonb_typeof(entry) is distinct from 'object'
      or entry ->> 'fixtureExternalId' is distinct from p_fixture_external_id
      or coalesce(entry ->> 'externalPlayerId', '') !~ '^[1-9][0-9]{0,14}$'
      or coalesce(entry ->> 'externalTeamId', '') !~ '^[1-9][0-9]{0,14}$'
      or (entry ->> 'externalPlayerId') = any (declared_ids)
      or entry ->> 'role' is distinct from 'substitute'
      or (entry ? 'officialMinutes' and entry -> 'officialMinutes' not in ('null'::jsonb, '0'::jsonb))
      or jsonb_typeof(entry -> 'scoringStatisticTypeIds') is distinct from 'array'
      or jsonb_array_length(entry -> 'scoringStatisticTypeIds') <> 0
      or jsonb_typeof(entry -> 'unknownStatisticTypeIds') is distinct from 'array'
      or jsonb_array_length(entry -> 'unknownStatisticTypeIds') <> 0
      or jsonb_typeof(entry -> 'eventTypeIds') is distinct from 'array'
      or jsonb_array_length(entry -> 'eventTypeIds') <> 0
      or jsonb_typeof(entry -> 'zeroStatisticTypeIds') is distinct from 'array'
      or exists (select 1 from jsonb_array_elements(entry -> 'zeroStatisticTypeIds') zero_type
        where jsonb_typeof(zero_type) is distinct from 'number' or (zero_type #>> '{}') !~ '^[1-9][0-9]{0,5}$')
      or coalesce(entry ->> 'preflightDigest', '') !~ '^[0-9a-f]{64}$'
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;
    -- The digest the importer sent must be the digest of the facts it declared (a
    -- missing or malformed one is not equal, so it is refused here too).
    select coalesce(string_agg(zero_type #>> '{}', ',' order by (zero_type #>> '{}')::integer), '') into zero_ids
    from jsonb_array_elements(entry -> 'zeroStatisticTypeIds') zero_type;
    expected_digest := encode(extensions.digest(
      'sportsmonks-verified-unused:v1|fixture=' || p_fixture_external_id
      || '|player=' || (entry ->> 'externalPlayerId')
      || '|team=' || (entry ->> 'externalTeamId')
      || '|role=substitute|minutes='
      || case when coalesce(entry -> 'officialMinutes', 'null'::jsonb) = 'null'::jsonb then '-' else '0' end
      || '|scoring=|unknown=|events=|zero=' || zero_ids, 'sha256'), 'hex');
    if expected_digest is distinct from entry ->> 'evidenceDigest' then
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
  end loop;

  -- From here the declaration is well formed. Each condition below is what the
  -- owner's approval assumed about the database; if one does not hold, the
  -- fixture is refused, never ingested around it.
  select fixture.* into target_fixture
  from app_private.football_provider_mappings mapping
  join app.fixtures fixture on fixture.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name and mapping.entity_type = 'fixture'
    and mapping.external_id = p_fixture_external_id and mapping.active;
  if not found then
    raise exception using errcode = '55000', message = 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED',
      detail = 'fixture_not_mapped';
  end if;
  if exists (
    select 1 from app.fantasy_fixture_assignments assignment
    where assignment.fixture_id = target_fixture.id and assignment.superseded_at is null
      and app_private.fantasy_adaptive_enabled(assignment.gameweek_id)) then
    raise exception using errcode = '55000', message = 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED',
      detail = 'adaptive_scoring_not_reviewed';
  end if;
  -- The numbers this rule adjusts must be numbers, and the starters the rows
  -- carry must be the starters the coverage reports, never more than 11 a side.
  if coalesce(stripped ->> 'validPlayerRows', '') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(stripped ->> 'excludedIncompleteRows', '') !~ '^(0|[1-9][0-9]*)$'
    or coalesce(stripped ->> 'identifiedStarterRows', '') !~ '^(0|[1-9][0-9]*)$'
    or (select count(*) from jsonb_array_elements(p_rows) value where value -> 'started' = 'true'::jsonb)
      <> (stripped ->> 'identifiedStarterRows')::integer
    or exists (
      select 1 from jsonb_array_elements(p_rows) value
      where value -> 'started' = 'true'::jsonb
      group by value ->> 'externalTeamId'
      having count(*) > 11) then
    raise exception using errcode = '55000', message = 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED',
      detail = 'starters_not_as_reported';
  end if;

  for entry in select value from jsonb_array_elements(declaration) loop
    select team_map.internal_entity_id into team_internal
    from app_private.football_provider_mappings team_map
    where team_map.provider_name = p_provider_name and team_map.entity_type = 'team'
      and team_map.external_id = entry ->> 'externalTeamId' and team_map.active;
    if team_internal is null or team_internal not in (target_fixture.home_team_id, target_fixture.away_team_id) then
      raise exception using errcode = '55000', message = 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED',
        detail = 'club_not_in_fixture:' || (entry ->> 'externalPlayerId');
    end if;
    -- Any mapping row, active or not, means the canonical list knows (or knew) him.
    if exists (
      select 1 from app_private.football_provider_mappings player_map
      where player_map.provider_name = p_provider_name and player_map.entity_type = 'player'
        and player_map.external_id = entry ->> 'externalPlayerId') then
      raise exception using errcode = '55000', message = 'VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED',
        detail = 'player_already_known:' || (entry ->> 'externalPlayerId');
    end if;
    eligible := eligible || jsonb_build_array(jsonb_build_object(
      'externalPlayerId', entry ->> 'externalPlayerId',
      'externalTeamId', entry ->> 'externalTeamId',
      'teamId', team_internal,
      'role', 'substitute',
      'reason', 'verified_unused_unmapped',
      'officialMinutes', coalesce(entry -> 'officialMinutes', 'null'::jsonb),
      'zeroStatisticTypeIds', entry -> 'zeroStatisticTypeIds',
      'evidenceDigest', entry ->> 'evidenceDigest',
      'preflightDigest', entry ->> 'preflightDigest'));
  end loop;

  select coalesce(jsonb_agg(row_entry.value order by row_entry.ord), '[]'::jsonb) into adjusted_rows
  from jsonb_array_elements(p_rows) with ordinality as row_entry(value, ord)
  where row_entry.value ->> 'externalPlayerId' <> all (declared_ids);
  -- The rows seen stay the same: what leaves the valid rows joins the rows left
  -- out. The evidence is part of the coverage, so the source version binds it.
  adjusted_coverage := stripped || jsonb_build_object(
    'validPlayerRows', (stripped ->> 'validPlayerRows')::integer - cardinality(declared_ids),
    'excludedIncompleteRows', (stripped ->> 'excludedIncompleteRows')::integer + cardinality(declared_ids),
    'verifiedUnusedUnmappedExcluded', eligible);

  result := api.ingest_current_player_fixture_performance_before_exclusions(
    p_provider_name, p_season_external_id, p_fixture_external_id, adjusted_rows, adjusted_coverage, p_observed_at);

  insert into app_private.current_fixture_excluded_participants (
    fixture_id, coverage_source_version, provider_name, external_player_id, external_team_id, team_id,
    participation_role, reason, official_minutes, zero_statistic_type_ids, event_type_ids,
    evidence_digest, preflight_digest, provider_observed_at
  )
  select target_fixture.id, result ->> 'sourceVersion', p_provider_name,
    excluded ->> 'externalPlayerId', excluded ->> 'externalTeamId', (excluded ->> 'teamId')::uuid,
    'substitute', 'verified_unused_unmapped',
    case when excluded -> 'officialMinutes' = 'null'::jsonb then null else (excluded ->> 'officialMinutes')::integer end,
    coalesce((select array_agg((zero_type #>> '{}')::integer order by (zero_type #>> '{}')::integer)
      from jsonb_array_elements(excluded -> 'zeroStatisticTypeIds') zero_type), '{}'::integer[]),
    '{}'::integer[],
    excluded ->> 'evidenceDigest', excluded ->> 'preflightDigest',
    p_observed_at
  from jsonb_array_elements(eligible) excluded
  on conflict do nothing;

  return result || jsonb_build_object('excludedVerifiedUnusedUnmapped', to_jsonb(declared_ids));
end;
$$;

revoke all on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz)
  to service_role;
