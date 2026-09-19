-- BG-0011 option B (identity completeness): a deliberate, scoped RELAXATION of the historical
-- SportsMonks player-performance ingestion rule, not a preservation of the prior invariant.
--
-- OLD rule: exactly 22 *identified* starters (player_id present) required per fixture.
-- NEW rule: exactly 22 *provider-reported* raw starters required (unchanged -- this was already
-- universal, measured 240/240 fixtures), of which at most 4 may be anonymous (missing player_id).
-- A fixture with more than 4 anonymous starters is quarantined ENTIRELY: none of its rows, not
-- even the identified ones, are used for pricing. Anonymous rows are never assigned to any
-- player, never treated as another player's stats, and never recorded as an "observed zero"
-- appearance/minutes for anyone.
--
-- Measured against real production data (BG-0044): 238/240 season-26027 fixtures pass under this
-- rule; fixtures 19596474 (7 anonymous of 22 starters) and 19596475 (8 anonymous of 22) remain
-- quarantined even under the relaxed rule.
--
-- SCOPE (corrected 2026-09-19, second owner correction -- the first cut of this comment was
-- factually wrong and is not repeated here):
-- app_private.historical_performance_fixture_coverage and app.player_fixture_performances are
-- NOT exclusive to this historical path. They are SHARED, at the table level, with the live
-- current-season Fantasy scoring/ingestion path:
--   * 20260914200726_current_finished_fixture_performances.sql ADDS COLUMNS to these same two
--     tables (scoring_statistics_complete, etc.) and its api.ingest_current_player_fixture_performance
--     RPC inserts current-season rows into them directly, distinguished by a
--     'sportsmonks-current-fixture:<sha256>' source_version prefix (vs this historical path's
--     'sportsmonks-fixture:<sha256>').
--   * 20260914200719_fantasy_scoring_worker_contracts.sql's app_private.fantasy_scoring_input_document
--     reads app.player_fixture_performances.active and
--     app_private.historical_performance_fixture_coverage directly for a current-season
--     gameweek's fixtures.
--   * 20260914200730_fantasy_verified_finalization.sql's app_private.fantasy_assert_scoring_snapshot
--     calls that document builder from the live gameweek-finalization path. This is not dead code.
-- What actually keeps this migration's relaxation away from live scoring is NOT table separation.
-- It is:
--   (1) ROW-level scoping: both RPCs this migration adds/changes
--       (api.quarantine_historical_player_fixture_performance,
--       api.ingest_historical_player_fixture_performance) require
--       `target_season.status = 'completed' and not target_season.is_current and
--       target_season.ends_on < current_date` before touching any row -- a live/current season
--       can never reach either RPC.
--   (2) A NEW hard DB-level CHECK constraint (historical_performance_coverage_counts_check, below)
--       tying anonymous_starter_rows > 0 to the 'sportsmonks-fixture:' source_version prefix, so a
--       nonzero anonymous-starter count can never exist on a current-season
--       ('sportsmonks-current-fixture:') row even by accident -- not merely because the
--       current-season RPC happens to never set that column.
--   (3) Column-default compatibility: anonymous_starter_rows/identified_starter_rows/
--       coverage_outcome/quarantine_reason are added with defaults (0/22/'accepted'/null) that
--       exactly match what api.ingest_current_player_fixture_performance's existing, UNMODIFIED
--       insert (which never lists these columns) already produces.
-- See supabase/tests/database/historical_player_performances.test.sql for the regression tests
-- proving (2) and (3) with a real current-season-shaped row, executed against a real local
-- Postgres.

-- ---------------------------------------------------------------------------
-- 1. New columns + relaxed CHECK constraint on the coverage table.
--
-- Single-table design (owner correction 2026-09-19): quarantine is a `coverage_outcome` on THIS
-- table, not a separate table. A separate table would have meant deleting this table's row and
-- replacing it with a thinner one carrying none of lineup_rows_seen / valid_player_rows /
-- excluded_incomplete_rows / detail_rows / invalid_detail_rows / team_count / source_version /
-- provider_observed_at -- a delete-then-reinsert-elsewhere in disguise. Instead, the SAME row a
-- fixture has always had (or its first-ever row, if this is the first processing attempt) is
-- UPSERTed, carrying the full audit trail regardless of outcome.
-- ---------------------------------------------------------------------------

alter table app_private.historical_performance_fixture_coverage
  add column anonymous_starter_rows integer not null default 0;
alter table app_private.historical_performance_fixture_coverage
  add column identified_starter_rows integer not null default 22;
alter table app_private.historical_performance_fixture_coverage
  add column coverage_outcome text not null default 'accepted'
  check (coverage_outcome in ('accepted', 'quarantined'));
alter table app_private.historical_performance_fixture_coverage
  add column quarantine_reason text
  check (quarantine_reason is null or quarantine_reason = 'anonymous_starter_rows_exceeded');
alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_outcome_reason_check
  check ((coverage_outcome = 'quarantined') = (quarantine_reason is not null));

alter table app_private.historical_performance_fixture_coverage
  drop constraint historical_performance_coverage_counts_check;
alter table app_private.historical_performance_fixture_coverage
  add constraint historical_performance_coverage_counts_check check (
    lineup_rows_seen between 22 and 100
    and valid_player_rows between 22 and 100
    and excluded_incomplete_rows between 0 and 20
    and lineup_rows_seen = valid_player_rows + excluded_incomplete_rows
    -- BG-0011 option B: anonymous_starter_rows itself is bounded 0..22 (the raw starter total);
    -- whether that count is TOLERATED (<=4, accepted) or not (>4, quarantined) is enforced by the
    -- coverage_outcome tie below, not by bounding this column to 0..4.
    and anonymous_starter_rows between 0 and 22
    and identified_starter_rows = 22 - anonymous_starter_rows
    and team_count = 2
    and detail_rows >= 0
    and invalid_detail_rows >= 0
    -- coverage_outcome is DERIVED from the measured facts, never an independently settable flag
    -- someone could set inconsistently with anonymous_starter_rows.
    and (coverage_outcome = 'quarantined') = (anonymous_starter_rows > 4)
    -- A quarantined fixture persists NOTHING: forced to zero at the constraint level, not just by
    -- RPC discipline. An accepted fixture's starter_rows (mapped, persisted) can be at most its
    -- identified count, and its performance_rows must equal valid_player_rows exactly (as before
    -- BG-0011; valid_player_rows here stores the post-mapping-exclusion persisted count, the same
    -- value as performance_rows, per the pre-existing insert semantics from
    -- 20260802010200_historical_performance_mapping_quarantine.sql).
    and (case
      when coverage_outcome = 'accepted' then
        starter_rows between 0 and identified_starter_rows
        and performance_rows = valid_player_rows
      else
        starter_rows = 0 and performance_rows = 0
    end)
    -- Hard DB-level scope guarantee (see the header comment's point (2)): only the historical
    -- 'sportsmonks-fixture:' source_version prefix may ever carry a nonzero anonymous-starter
    -- count. A current-season ('sportsmonks-current-fixture:') row is forced to
    -- anonymous_starter_rows = 0 regardless of what any RPC does or does not set.
    and (anonymous_starter_rows = 0 or source_version ~ '^sportsmonks-fixture:[0-9a-f]{64}$')
  );

comment on column app_private.historical_performance_fixture_coverage.anonymous_starter_rows is
  'BG-0011 option B: raw provider starter rows (type_id 11) with no player_id, tolerated up to 4 per fixture (historical source_version prefix only; hard-gated at the CHECK-constraint level). Never assigned to any player.';
comment on column app_private.historical_performance_fixture_coverage.identified_starter_rows is
  'BG-0011 option B: 22 minus anonymous_starter_rows. Distinct from starter_rows, which is further reduced by provider-mapping exclusions and forced to 0 for a quarantined fixture.';
comment on column app_private.historical_performance_fixture_coverage.starter_rows is
  'Mapped, persisted starter rows (identified AND resolved via app_private.football_provider_mappings to a BotolaGO player). Forced to 0 when coverage_outcome = quarantined.';
comment on column app_private.historical_performance_fixture_coverage.coverage_outcome is
  'BG-0011 option B: accepted or quarantined, DERIVED from anonymous_starter_rows > 4 (see historical_performance_coverage_counts_check) -- never an independently settable flag.';
comment on column app_private.historical_performance_fixture_coverage.quarantine_reason is
  'BG-0011 option B: explicit, traceable reason a fixture was quarantined (currently the only possible value is anonymous_starter_rows_exceeded). Null iff coverage_outcome = accepted.';

-- ---------------------------------------------------------------------------
-- 2. api.quarantine_historical_player_fixture_performance: UPSERTs the SAME coverage row a
--    fixture has always had (inserting one for the first time if this is the fixture's first
--    processing attempt) with coverage_outcome = 'quarantined'. Mirrors
--    api.ingest_historical_player_fixture_performance's p_coverage shape exactly (both take
--    p_provider_name/p_season_external_id/p_fixture_external_id/p_source_version/p_coverage/
--    p_observed_at) so the worker builds one coverage object either way. NO DELETE anywhere in
--    this function. Independently re-derives and re-checks anonymous_starter_rows > 4 from
--    p_coverage (never trusts the caller's classification) so a caller bug can never quarantine a
--    fixture that should have been accepted -- and the table's own CHECK constraint above is a
--    second, unconditional backstop against exactly that.
-- ---------------------------------------------------------------------------

create or replace function api.quarantine_historical_player_fixture_performance(
  p_provider_name text,
  p_season_external_id text,
  p_fixture_external_id text,
  p_source_version text,
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
  anonymous_starter_rows integer;
  identified_starter_rows integer;
  lineup_rows_seen integer;
  valid_player_rows integer;
  excluded_incomplete_rows integer;
  team_count integer;
  detail_rows integer;
  invalid_detail_rows integer;
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
    or jsonb_typeof(p_coverage) <> 'object'
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;

  anonymous_starter_rows := (p_coverage ->> 'anonymousStarterRows')::integer;
  identified_starter_rows := (p_coverage ->> 'identifiedStarterRows')::integer;
  lineup_rows_seen := (p_coverage ->> 'lineupRowsSeen')::integer;
  valid_player_rows := (p_coverage ->> 'validPlayerRows')::integer;
  excluded_incomplete_rows := (p_coverage ->> 'excludedIncompleteRows')::integer;
  team_count := (p_coverage ->> 'teamCount')::integer;
  detail_rows := (p_coverage ->> 'detailRows')::integer;
  invalid_detail_rows := (p_coverage ->> 'invalidDetailRows')::integer;

  -- Independent re-check of the classification -- this RPC never quarantines a fixture that
  -- should have been accepted, no matter what the caller believes.
  if anonymous_starter_rows is null or anonymous_starter_rows <= 4 or anonymous_starter_rows > 22
    or identified_starter_rows is null or identified_starter_rows <> 22 - anonymous_starter_rows
    or lineup_rows_seen is null or lineup_rows_seen not between 22 and 100
    or excluded_incomplete_rows is null or excluded_incomplete_rows not between 0 and 20
    or valid_player_rows is null or valid_player_rows <> lineup_rows_seen - excluded_incomplete_rows
    or team_count is null or team_count <> 2
    or detail_rows is null or detail_rows < 0
    or invalid_detail_rows is null or invalid_detail_rows < 0
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

  -- A fixture being (re-)quarantined must not also hold active performance rows from an earlier
  -- accepted attempt (e.g. a corrected provider payload now shows more anonymous starters than a
  -- prior attempt did).
  update app.player_fixture_performances
  set active = false, updated_at = statement_timestamp()
  where fixture_id = target_fixture.id and active;

  insert into app_private.historical_performance_fixture_coverage (
    fixture_id, football_season_id, source_provider, source_version,
    lineup_rows_seen, valid_player_rows, excluded_incomplete_rows, excluded_mapping_rows,
    starter_rows, anonymous_starter_rows, identified_starter_rows,
    team_count, detail_rows, invalid_detail_rows, performance_rows,
    reconciled, coverage_outcome, quarantine_reason, provider_observed_at
  ) values (
    target_fixture.id, target_season.id, p_provider_name, p_source_version,
    lineup_rows_seen, valid_player_rows, excluded_incomplete_rows, 0,
    0, anonymous_starter_rows, identified_starter_rows,
    team_count, detail_rows, invalid_detail_rows, 0,
    -- reconciled = false: the pre-existing (immutable)
    -- historical_performance_coverage_reconciled_check requires
    -- `not reconciled or performance_rows = valid_player_rows`, and a quarantined row's
    -- performance_rows (forced to 0) never equals its audit valid_player_rows. This is correct,
    -- not a weakening: every rating-input query below filters explicitly by
    -- coverage_outcome = 'accepted' (not by reconciled), so a quarantined row's reconciled value
    -- has no bearing on whether it is (correctly) excluded.
    false, 'quarantined', 'anonymous_starter_rows_exceeded', p_observed_at
  ) on conflict (fixture_id) do update set
    football_season_id = excluded.football_season_id,
    source_provider = excluded.source_provider,
    source_version = excluded.source_version,
    lineup_rows_seen = excluded.lineup_rows_seen,
    valid_player_rows = excluded.valid_player_rows,
    excluded_incomplete_rows = excluded.excluded_incomplete_rows,
    excluded_mapping_rows = 0,
    starter_rows = 0,
    anonymous_starter_rows = excluded.anonymous_starter_rows,
    identified_starter_rows = excluded.identified_starter_rows,
    team_count = excluded.team_count,
    detail_rows = excluded.detail_rows,
    invalid_detail_rows = excluded.invalid_detail_rows,
    performance_rows = 0,
    reconciled = false,
    coverage_outcome = 'quarantined',
    quarantine_reason = 'anonymous_starter_rows_exceeded',
    provider_observed_at = greatest(
      app_private.historical_performance_fixture_coverage.provider_observed_at,
      excluded.provider_observed_at
    ),
    updated_at = statement_timestamp();

  return jsonb_build_object(
    'fixtureId', target_fixture.id,
    'coverageOutcome', 'quarantined',
    'quarantineReason', 'anonymous_starter_rows_exceeded',
    'anonymousStarterRows', anonymous_starter_rows,
    'identifiedStarterRows', identified_starter_rows
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or not_null_violation or check_violation or unique_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.quarantine_historical_player_fixture_performance(
  text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function api.quarantine_historical_player_fixture_performance(
  text, text, text, text, jsonb, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- 3. api.ingest_historical_player_fixture_performance: accept anonymousStarterRows/
--    identifiedStarterRows in p_coverage, reject (never partially ingest) when
--    anonymousStarterRows > 4, relax the post-persist starter reconciliation accordingly, and
--    persist the two new columns plus coverage_outcome = 'accepted' / quarantine_reason = null
--    (which naturally flips a fixture back from a prior quarantined state on the SAME row, via
--    the ordinary ON CONFLICT DO UPDATE below -- no DELETE needed or present). Everything else is
--    unchanged from the quarantine migration's version
--    (20260802010200_historical_performance_mapping_quarantine.sql).
-- ---------------------------------------------------------------------------

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
  anonymous_starter_rows integer;
  identified_starter_rows integer;
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

  anonymous_starter_rows := (p_coverage ->> 'anonymousStarterRows')::integer;
  identified_starter_rows := (p_coverage ->> 'identifiedStarterRows')::integer;
  provider_excluded_count := (p_coverage ->> 'excludedIncompleteRows')::integer;
  if (p_coverage ->> 'lineupRowsSeen')::integer not between 22 and 100
    or (p_coverage ->> 'validPlayerRows')::integer <> jsonb_array_length(p_rows)
    or provider_excluded_count not between 0 and 20
    or (p_coverage ->> 'lineupRowsSeen')::integer
      <> (p_coverage ->> 'validPlayerRows')::integer + provider_excluded_count
    or (p_coverage ->> 'teamCount')::integer <> 2
    or (p_coverage ->> 'detailRows')::integer < 0
    or (p_coverage ->> 'invalidDetailRows')::integer <> 0
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  if identified_starter_rows is null or anonymous_starter_rows is null
    or identified_starter_rows <> 22 - anonymous_starter_rows
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  -- BG-0011 option B: reject outright (never partially ingest) before any mutation. The caller
  -- (the worker) is expected to have already routed anonymous_starter_rows > 4 to
  -- api.quarantine_historical_player_fixture_performance instead of calling this RPC at all; this
  -- is defense in depth, not the primary gate. Deliberately checked AFTER the season/fixture
  -- lookups above (a current-season or unmapped-fixture call must still fail with
  -- COMPLETED_SEASON_REQUIRED / *_MAPPING_NOT_FOUND, never with this historical-only code).
  if anonymous_starter_rows > 4 then
    raise exception using errcode = '22023', message = 'HISTORICAL_FIXTURE_ANONYMOUS_STARTERS_EXCEEDED';
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
    -- BG-0011 option B: starter_count (mapped, persisted starters) can be as low as
    -- identified_starter_rows minus whatever mapping additionally excluded among the starters;
    -- it can never exceed identified_starter_rows (mapping only ever removes rows).
    or starter_count > identified_starter_rows
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
    excluded_mapping_rows, starter_rows, anonymous_starter_rows, identified_starter_rows,
    team_count, detail_rows, invalid_detail_rows, performance_rows, reconciled,
    coverage_outcome, quarantine_reason, provider_observed_at
  ) values (
    target_fixture.id, target_season.id, p_provider_name, p_source_version,
    (p_coverage ->> 'lineupRowsSeen')::integer,
    active_count, total_excluded_count, mapping_excluded_count,
    starter_count, anonymous_starter_rows, identified_starter_rows,
    team_count,
    (p_coverage ->> 'detailRows')::integer,
    (p_coverage ->> 'invalidDetailRows')::integer,
    active_count, true, 'accepted', null, p_observed_at
  ) on conflict (fixture_id) do update set
    football_season_id = excluded.football_season_id,
    source_provider = excluded.source_provider,
    source_version = excluded.source_version,
    lineup_rows_seen = excluded.lineup_rows_seen,
    valid_player_rows = excluded.valid_player_rows,
    excluded_incomplete_rows = excluded.excluded_incomplete_rows,
    excluded_mapping_rows = excluded.excluded_mapping_rows,
    starter_rows = excluded.starter_rows,
    anonymous_starter_rows = excluded.anonymous_starter_rows,
    identified_starter_rows = excluded.identified_starter_rows,
    team_count = excluded.team_count,
    detail_rows = excluded.detail_rows,
    invalid_detail_rows = excluded.invalid_detail_rows,
    performance_rows = excluded.performance_rows,
    reconciled = excluded.reconciled,
    -- Accepting a fixture (including one that a corrected payload now brings back within the
    -- anonymous-starter cap) always flips this SAME row back to accepted and clears the
    -- quarantine reason -- no DELETE, no second table, no second row.
    coverage_outcome = 'accepted',
    quarantine_reason = null,
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
    'anonymousStarterRows', anonymous_starter_rows,
    'identifiedStarterRows', identified_starter_rows,
    'mappedStarterRows', starter_count,
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

-- ---------------------------------------------------------------------------
-- 4. api.football_historical_player_rating_inputs: a fixture that is permanently quarantined
--    (more than 4 anonymous starters) must not block the season's rating derivation forever.
--    expected_fixture_count now excludes quarantined fixtures (filtered by coverage_outcome on
--    the SAME table -- no join to a second table); covered_fixture_count must still equal that
--    (adjusted) expectation exactly, and is now also explicitly filtered to accepted rows. The
--    performance_count floor is relaxed from expected_fixture_count * 22 to
--    expected_fixture_count * 18 (22 - the 4-anonymous cap), since an accepted fixture may
--    legitimately persist as few as 18 identified starters plus its bench.
-- ---------------------------------------------------------------------------

create or replace function api.football_historical_player_rating_inputs(
  p_provider_name text,
  p_season_external_id text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_season app.seasons%rowtype;
  expected_fixture_count integer;
  quarantined_fixture_count integer;
  covered_fixture_count integer;
  performance_count integer;
  result jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name <> 'sportsmonks' or p_season_external_id !~ '^[1-9][0-9]*$' then
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
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;
  if target_season.status <> 'completed'
    or target_season.is_current
    or target_season.ends_on >= current_date
  then
    raise exception using errcode = '22023', message = 'COMPLETED_SEASON_REQUIRED';
  end if;

  select count(*) into quarantined_fixture_count
  from app.fixtures fixture
  join app_private.historical_performance_fixture_coverage coverage
    on coverage.fixture_id = fixture.id
  where fixture.season_id = target_season.id
    and fixture.status = 'finished'
    and coverage.football_season_id = target_season.id
    and coverage.source_provider = p_provider_name
    and coverage.coverage_outcome = 'quarantined';

  select count(*) into expected_fixture_count
  from app.fixtures fixture
  where fixture.season_id = target_season.id and fixture.status = 'finished';
  -- BG-0011 option B: quarantined fixtures are excluded from what this season is expected to
  -- cover, so the other accepted fixtures are never blocked by the 2 (measured) permanent
  -- outliers. This never silently accepts a season with MORE incompleteness than the rule
  -- permits: only fixtures with coverage_outcome = 'quarantined' are excluded here, and that
  -- outcome is itself derived from anonymous_starter_rows > 4 by a hard CHECK constraint, not an
  -- independently settable flag.
  expected_fixture_count := expected_fixture_count - quarantined_fixture_count;

  select count(*) into covered_fixture_count
  from app.fixtures fixture
  join app_private.historical_performance_fixture_coverage coverage
    on coverage.fixture_id = fixture.id
  where fixture.season_id = target_season.id
    and fixture.status = 'finished'
    and coverage.football_season_id = target_season.id
    and coverage.source_provider = p_provider_name
    and coverage.coverage_outcome = 'accepted'
    and coverage.reconciled
    and coverage.invalid_detail_rows = 0
    and coverage.performance_rows = (
      select count(*) from app.player_fixture_performances performance
      where performance.fixture_id = coverage.fixture_id and performance.active
    );
  if expected_fixture_count < 1 or covered_fixture_count <> expected_fixture_count then
    raise exception using errcode = '22023', message = 'HISTORICAL_PERFORMANCE_INCOMPLETE';
  end if;

  select count(*) into performance_count
  from app.player_fixture_performances performance
  join app.fixtures fixture on fixture.id = performance.fixture_id
  join app_private.historical_performance_fixture_coverage coverage
    on coverage.fixture_id = fixture.id
    and coverage.reconciled
    and coverage.coverage_outcome = 'accepted'
  where performance.football_season_id = target_season.id
    and fixture.season_id = target_season.id
    and fixture.status = 'finished'
    and performance.active;
  -- Relaxed floor: 18 = 22 - MAX_ANONYMOUS_STARTER_ROWS, the lowest an accepted fixture's
  -- identified-starter count can legitimately be. Bench rows only add to this floor.
  if performance_count < expected_fixture_count * 18 then
    raise exception using errcode = '22023', message = 'HISTORICAL_PERFORMANCE_INCOMPLETE';
  end if;

  with aggregates as (
    select
      performance.player_id,
      performance.position,
      sum(performance.appeared::integer)::integer as appearances,
      sum(performance.started::integer)::integer as starts,
      sum(performance.minutes)::integer as minutes,
      sum(performance.goals)::integer as goals,
      sum(performance.assists)::integer as assists,
      sum(performance.clean_sheets)::integer as clean_sheets,
      sum(performance.goals_conceded)::integer as goals_conceded,
      sum(performance.saves)::integer as saves,
      sum(performance.penalties_saved)::integer as penalties_saved,
      sum(performance.penalties_missed)::integer as penalties_missed,
      sum(performance.yellow_cards)::integer as yellow_cards,
      sum(performance.red_cards)::integer as red_cards,
      sum(performance.second_yellow_dismissals)::integer as second_yellow_dismissals,
      sum(performance.own_goals)::integer as own_goals,
      coalesce(sum(performance.provider_rating * greatest(1, performance.minutes)), 0)::numeric
        as provider_rating_weighted,
      coalesce(sum(greatest(1, performance.minutes)) filter (
        where performance.provider_rating is not null
      ), 0)::integer as provider_rating_minutes
    from app.player_fixture_performances performance
    join app.fixtures fixture on fixture.id = performance.fixture_id
    join app_private.historical_performance_fixture_coverage coverage
      on coverage.fixture_id = fixture.id
      and coverage.reconciled
      and coverage.coverage_outcome = 'accepted'
    where performance.football_season_id = target_season.id
      and fixture.season_id = target_season.id
      and fixture.status = 'finished'
      and performance.active
    group by performance.player_id, performance.position
  ), mapped as (
    select aggregates.*, mapping.external_id
    from aggregates
    join app_private.football_provider_mappings mapping
      on mapping.provider_name = p_provider_name
      and mapping.entity_type = 'player'
      and mapping.internal_entity_id = aggregates.player_id
      and mapping.active
  ), source as (
    select encode(extensions.digest(string_agg(
      coverage.source_version, ',' order by coverage.fixture_id
    ), 'sha256'), 'hex') as version
    from app_private.historical_performance_fixture_coverage coverage
    join app.fixtures fixture on fixture.id = coverage.fixture_id
    where coverage.football_season_id = target_season.id
      and coverage.source_provider = p_provider_name
      and coverage.reconciled
      and coverage.coverage_outcome = 'accepted'
      and fixture.season_id = target_season.id
      and fixture.status = 'finished'
  )
  select jsonb_build_object(
    'seasonExternalId', p_season_external_id,
    'expectedFixtureCount', expected_fixture_count,
    'coveredFixtureCount', covered_fixture_count,
    'quarantinedFixtureCount', quarantined_fixture_count,
    'performanceCount', performance_count,
    'sourceVersion', 'sportsmonks-season-fixtures:' || max(source.version),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'externalPlayerId', mapped.external_id,
      'position', case mapped.position
        when 'goalkeeper' then 'GK'
        when 'defender' then 'DEF'
        when 'midfielder' then 'MID'
        when 'forward' then 'FWD'
      end,
      'appearances', mapped.appearances,
      'starts', mapped.starts,
      'minutes', mapped.minutes,
      'goals', mapped.goals,
      'assists', mapped.assists,
      'cleanSheets', mapped.clean_sheets,
      'goalsConceded', mapped.goals_conceded,
      'saves', mapped.saves,
      'penaltiesSaved', mapped.penalties_saved,
      'penaltiesMissed', mapped.penalties_missed,
      'yellowCards', mapped.yellow_cards,
      'redCards', mapped.red_cards,
      'secondYellowDismissals', mapped.second_yellow_dismissals,
      'ownGoals', mapped.own_goals,
      'providerRatingWeighted', mapped.provider_rating_weighted,
      'providerRatingMinutes', mapped.provider_rating_minutes
    ) order by mapped.player_id), '[]'::jsonb)
  ) into result from mapped cross join source;
  if jsonb_array_length(result -> 'rows') < 1 or jsonb_array_length(result -> 'rows') > 1000 then
    raise exception using errcode = '22023', message = 'HISTORICAL_PERFORMANCE_INCOMPLETE';
  end if;
  return result;
end;
$$;

revoke all on function api.football_historical_player_rating_inputs(text, text)
  from public, anon, authenticated;
grant execute on function api.football_historical_player_rating_inputs(text, text)
  to service_role;

comment on function api.football_historical_player_rating_inputs(text, text) is
  'BG-0011 option B: expected_fixture_count excludes fixtures whose coverage_outcome = quarantined, so 2 permanently-anonymous-heavy fixtures (measured: 19596474, 19596475 for season 26027) do not block the other 238 from being priced.';
