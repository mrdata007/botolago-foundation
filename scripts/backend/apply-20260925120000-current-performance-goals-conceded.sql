-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260925120000_current_performance_goals_conceded_check:
-- the database checks goals conceded, which decide clean sheets, against the
-- final score: a starter with 90 minutes conceded what the side did, and
-- nobody conceded more. The importer change that relies on it (an absent
-- SportsMonks statistic counts as zero; goals conceded follow the final
-- score) comes after this one. Owner decision, 2026-09-25.
--
-- WHEN
--   After the pull request that adds this file is merged, with nothing
--   running under GitHub -> Actions -> "Fantasy season orchestrator" or
--   "Ingest current finished Football performances".
--
--   Those jobs write match statistics, and GitHub can start the orchestrator
--   late, so the clock cannot keep it apart from this script. The script does
--   instead: before anything else it holds the two match statistics tables
--   until it ends (a second or two). A statistics write already under way
--   makes it stop within 5 seconds, saving nothing (run it again when the job
--   has finished); a job that starts meanwhile waits for it.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Check that nothing else is writing, and wait for anything
--      that is (AGENTS.md, "Before writing"). Do this before the rehearsal and
--      again before the real run:
--        * GitHub -> Actions: no run in progress, the two above included (the
--          football recovery also runs on a schedule);
--        * pg_cron: nothing mid-run. This should return no rows:
--            select job.jobname, run.status, run.start_time
--            from cron.job_run_details run join cron.job job using (jobid)
--            where run.status not in ('succeeded', 'failed')
--              and run.start_time > now() - interval '15 minutes';
--        * no other query running (Database -> Query performance).
--   2. Pause the writers whose tables this write touches, as AGENTS.md asks.
--      It changes one function and holds the match statistics tables, which
--      are Fantasy's inputs, so that is the Fantasy lifecycle tick (this
--      script refuses while it is on):
--        select app_private.fantasy_automation_configure(false);
--      AGENTS.md's other switches cover other tables and stay as they are:
--      the email/results jobs (notification-email-tick, football-live-refresh)
--      pause for writes to fixtures or notifications, and predictions scoring
--      pauses for writes to the predictions tables. This write touches none of
--      those, and the hold (see WHEN) keeps any match statistics writer out
--      while it runs.
--   3. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   5. Whatever the result, switch the tick back on:
--        select app_private.fantasy_automation_configure(true);
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * holds the match statistics tables until it ends (see WHEN);
--   * refuses to run twice, before 20260925110000 (the unnamed-starter rule
--     this builds on), while the Fantasy tick is on, or where the statistics
--     import is not the version reviewed (as production held it on
--     2026-09-25 after 20260925110000);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: the import is the new version, with the score check
--     and still the unnamed-starter rule, and only the service role may
--     call it.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Hold the match statistics tables until this transaction ends, so no
-- statistics import can overlap it (AGENTS.md, one writer at a time).
-- ---------------------------------------------------------------------------
do $hold$
begin
  lock table app_private.historical_performance_fixture_coverage in access exclusive mode;
  lock table app.player_fixture_performances in share row exclusive mode;
exception when lock_not_available then
  raise exception 'stop: match statistics are being written right now (most likely by the Fantasy season orchestrator) -- nothing was saved; run this again when it has finished';
end
$hold$;

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925120000') then
    raise exception 'stop: migration 20260925120000 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925110000') then
    raise exception 'stop: migration 20260925110000 (the unnamed-starter rule) is not applied -- this update builds on it';
  end if;
  if to_regprocedure('api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)') is null
    or to_regclass('app_private.fantasy_automation_settings') is null then
    raise exception 'stop: the database is missing the statistics import this update changes';
  end if;

  -- AGENTS.md: nothing else writes Fantasy's inputs while this runs.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;

  if md5(pg_get_functiondef(
    'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)'::regprocedure
  )) <> '9b0c8142476872f853e06ce730fa68f8' then
    raise exception 'stop: api.ingest_current_player_fixture_performance is not the version this update replaces (20260925110000)';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20260925120000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925120000',
  'current_performance_goals_conceded_check',
  array[$bg_20260925120000_file$-- BotolaGO Production V2
-- Goals conceded, which decide clean sheets, are checked against the final
-- score before this season's statistics are imported. Owner decision,
-- 2026-09-25 ("you decide", on how an absent SportsMonks statistic counts).
--
-- SportsMonks sends a statistic only when it is not zero. On the season's
-- first finished match (fixture 19874708, 24 September) only the 3 scorers
-- carried goals, only the players who came on carried minutes, and 9 of the
-- 28 named players carried no goals conceded; last season's accepted fixtures
-- average about 2 statistic rows per player out of the 13 requested. The
-- importer required all nine on every player, so it refused every real match
-- (current_statistics_incomplete) and Gameweek 1 could not be scored.
--
-- The importer (scripts/backend/current-season-performances.ts) is changed to
-- count an absent statistic as zero, as last season's import always has. But
-- SportsMonks' goals conceded are not reliable on their own. In last season's
-- 238 matches, 40 of the 327 goalkeepers who played a whole match for a side
-- that conceded carried fewer than the score says, and 3 matches had players
-- carrying more. Counted as they come, that hands out clean sheets nobody
-- kept (60 minutes or more with none conceded). So the importer takes the
-- final score as the truth. A starter with 90 minutes (where SportsMonks
-- stops counting) was on from kick-off to at least the 90th minute and
-- conceded what the side did, and nobody conceded more than that. Anyone
-- else keeps SportsMonks' own figure, since only it knows when they were on
-- the pitch: a substitute can reach 90 minutes after an early goal (16 did).
--
-- One case this counts against the player: a starter substituted in stoppage
-- time just before a stoppage-time goal is credited that goal. Minutes cannot
-- tell that exit apart, and SportsMonks' own figure, which could, is the one
-- that is missing or short above. Last season at most 11 of the 2,243 such
-- starters on sides that conceded look like that exit (a substitute on for a
-- minute or less carries the difference), and 8 of them would lose a clean
-- sheet. Of the other 74 shortfalls, 53 carried none at all, 37 of them
-- goalkeepers: each a clean sheet nobody kept. Substitution events would
-- settle it exactly.
--
-- api.ingest_current_player_fixture_performance now checks that against the
-- final score held here, and refuses a mismatch with
-- CURRENT_GOALS_CONCEDED_MISMATCH: one of the two scores is not final yet, so
-- the match waits and the hourly run tries again. Only a finished match gets
-- this far, and a finished match always has its final score
-- (fixtures_finished_score_check). This ships before the importer change, so
-- no match is imported under the new rule without it.
--
-- Everything else in the function is 20260925110000's text, unchanged. Same
-- signature and grants.

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
  -- SportsMonks sends a statistic only when it is not zero, so the importer
  -- counts an absent one as zero (20260925120000). Its goals conceded are not
  -- reliable on their own and they decide clean sheets, so the importer takes
  -- them from the final score for a starter with 90 minutes (where
  -- SportsMonks stops counting) and caps everyone's at it. Checked here
  -- against the score this database holds: a mismatch means one of the two
  -- is not final yet, and the match waits.
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

-- Same grants as before; restated so this file stands on its own.
revoke all on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function api.ingest_current_player_fixture_performance(text, text, text, jsonb, jsonb, timestamptz) to service_role;
$bg_20260925120000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925120000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925120000'
  );
begin
  if encode(sha256(convert_to(part_20260925120000, 'UTF8')), 'hex')
    is distinct from '40cef0bc1072403b3872b238cf4cc3c8fa72d4957aaa50020db73099ac7d4111' then
    raise exception 'stop: 20260925120000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925120000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  ingest constant regprocedure :=
    'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)'::regprocedure;
  definition text := pg_get_functiondef(ingest);
begin
  if definition not like '%message = ''CURRENT_GOALS_CONCEDED_MISMATCH''%'
    or definition not like '%or ((value ->> ''started'')::boolean and (value ->> ''minutes'')::integer >= 90%'
    or definition not like '%unnamed_starters := coalesce((p_coverage ->> ''anonymousStarterRows'')::integer, 0);%' then
    problems := problems || 'the statistics import is not the new version'::text;
  end if;
  if has_function_privilege('anon', ingest, 'execute')
    or has_function_privilege('authenticated', ingest, 'execute')
    or not has_function_privilege('service_role', ingest, 'execute') then
    problems := problems || 'the statistics import is callable by the wrong roles'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925120000') then
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260925120000')
    then 'Applied. Goals conceded are now checked against the final score. Switch the Fantasy tick back on.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again. Then switch the Fantasy tick back on.'
end as result;
