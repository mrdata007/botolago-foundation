-- Normalized, replay-safe player performances from completed SportsMonks
-- fixtures. These facts are historical input only; they do not activate a
-- current Fantasy season or make a completed fixture live.

create table app.player_fixture_performances (
  id uuid primary key default gen_random_uuid(),
  football_season_id uuid not null references app.seasons(id) on delete restrict,
  fixture_id uuid not null references app.fixtures(id) on delete restrict,
  player_id uuid not null references app.players(id) on delete restrict,
  team_id uuid not null references app.teams(id) on delete restrict,
  position app.football_position not null,
  source_provider text not null,
  source_version text not null,
  started boolean not null,
  appeared boolean not null,
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
  active boolean not null default true,
  provider_observed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint player_fixture_performances_source_key
    unique (fixture_id, player_id, source_version),
  constraint player_fixture_performances_provider_check
    check (source_provider ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint player_fixture_performances_source_version_check
    check (source_version ~ '^[a-z0-9-]+:[0-9a-f]{64}$' and char_length(source_version) <= 100),
  constraint player_fixture_performances_participation_check
    check (not started or appeared),
  constraint player_fixture_performances_counts_check
    check (
      minutes between 0 and 130
      and (minutes = 0 or appeared)
      and goals >= 0 and assists >= 0 and clean_sheets >= 0
      and goals_conceded >= 0 and saves >= 0
      and penalties_saved >= 0 and penalties_missed >= 0
      and yellow_cards >= 0 and red_cards >= 0
      and second_yellow_dismissals >= 0 and own_goals >= 0
    ),
  constraint player_fixture_performances_rating_check
    check (provider_rating is null or provider_rating between 0 and 10)
);

create unique index player_fixture_performances_active_key
  on app.player_fixture_performances (fixture_id, player_id)
  where active;
create index player_fixture_performances_season_player_idx
  on app.player_fixture_performances (football_season_id, player_id, fixture_id)
  where active;
create index player_fixture_performances_fixture_idx
  on app.player_fixture_performances (fixture_id, team_id, player_id)
  where active;

create table app_private.historical_performance_fixture_coverage (
  fixture_id uuid primary key references app.fixtures(id) on delete restrict,
  football_season_id uuid not null references app.seasons(id) on delete restrict,
  source_provider text not null,
  source_version text not null,
  lineup_rows_seen integer not null,
  valid_player_rows integer not null,
  excluded_incomplete_rows integer not null,
  starter_rows integer not null,
  team_count integer not null,
  detail_rows integer not null,
  invalid_detail_rows integer not null,
  performance_rows integer not null,
  reconciled boolean not null,
  provider_observed_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint historical_performance_coverage_provider_check
    check (source_provider ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint historical_performance_coverage_source_version_check
    check (source_version ~ '^[a-z0-9-]+:[0-9a-f]{64}$' and char_length(source_version) <= 100),
  constraint historical_performance_coverage_counts_check check (
    lineup_rows_seen between 22 and 100
    and valid_player_rows between 22 and 100
    and excluded_incomplete_rows between 0 and 20
    and lineup_rows_seen = valid_player_rows + excluded_incomplete_rows
    and starter_rows = 22
    and team_count = 2
    and detail_rows >= 0
    and invalid_detail_rows >= 0
    and performance_rows = valid_player_rows
  ),
  constraint historical_performance_coverage_reconciled_check check (
    not reconciled or (invalid_detail_rows = 0 and performance_rows = valid_player_rows)
  )
);

create index historical_performance_coverage_season_idx
  on app_private.historical_performance_fixture_coverage
    (football_season_id, reconciled, fixture_id);

alter table app.player_fixture_performances enable row level security;
alter table app.player_fixture_performances force row level security;
alter table app_private.historical_performance_fixture_coverage enable row level security;
alter table app_private.historical_performance_fixture_coverage force row level security;

revoke all on table app.player_fixture_performances from public, anon, authenticated;
revoke all on table app_private.historical_performance_fixture_coverage
  from public, anon, authenticated;
grant select, insert, update on table app.player_fixture_performances to service_role;
grant select, insert, update on table app_private.historical_performance_fixture_coverage
  to service_role;

create trigger player_fixture_performances_set_updated_at
before update on app.player_fixture_performances
for each row execute function app_private.set_updated_at();
create trigger historical_performance_fixture_coverage_set_updated_at
before update on app_private.historical_performance_fixture_coverage
for each row execute function app_private.set_updated_at();

create or replace function api.begin_historical_performance_ingestion(
  p_provider_name text,
  p_season_external_id text,
  p_target_scope jsonb default '{}'::jsonb,
  p_checkpoint jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_season app.seasons%rowtype;
  run_id uuid;
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
    or jsonb_typeof(coalesce(p_target_scope, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_checkpoint, '{}'::jsonb)) <> 'object'
  then
    raise exception using errcode = '22023', message = 'COMPLETED_SEASON_REQUIRED';
  end if;
  insert into app_private.football_ingestion_runs (
    provider_name, job_type, target_scope, checkpoint, status, started_at
  ) values (
    p_provider_name,
    'player_fixture_performances',
    coalesce(p_target_scope, '{}'::jsonb),
    coalesce(p_checkpoint, '{}'::jsonb),
    'running',
    statement_timestamp()
  ) returning id into run_id;
  return run_id;
end;
$$;

create or replace function api.football_historical_performance_fixture_batch(
  p_provider_name text,
  p_season_external_id text,
  p_after_fixture_external_id text default null,
  p_limit integer default 5
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_season app.seasons%rowtype;
  result jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name <> 'sportsmonks'
    or p_season_external_id !~ '^[1-9][0-9]*$'
    or p_limit not between 1 and 10
    or (p_after_fixture_external_id is not null and p_after_fixture_external_id !~ '^[1-9][0-9]*$')
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
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;
  if target_season.status <> 'completed'
    or target_season.is_current
    or target_season.ends_on >= current_date
  then
    raise exception using errcode = '22023', message = 'COMPLETED_SEASON_REQUIRED';
  end if;

  with fixture_scope as (
    select mapping.external_id, fixture.id, fixture.kickoff_at
    from app.fixtures fixture
    join app_private.football_provider_mappings mapping
      on mapping.provider_name = p_provider_name
      and mapping.entity_type = 'fixture'
      and mapping.internal_entity_id = fixture.id
      and mapping.active
    where fixture.season_id = target_season.id
      and fixture.status = 'finished'
      and mapping.external_id ~ '^[1-9][0-9]*$'
      and (
        p_after_fixture_external_id is null
        or mapping.external_id::bigint > p_after_fixture_external_id::bigint
      )
  ), selected as (
    select * from fixture_scope
    order by external_id::bigint
    limit p_limit + 1
  ), page as (
    select * from selected order by external_id::bigint limit p_limit
  )
  select jsonb_build_object(
    'seasonExternalId', p_season_external_id,
    'expectedFixtureCount', (
      select count(*) from app.fixtures fixture
      where fixture.season_id = target_season.id and fixture.status = 'finished'
    ),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'externalFixtureId', external_id,
      'kickoffAt', kickoff_at
    ) order by external_id::bigint), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > p_limit
      then (select external_id from page order by external_id::bigint desc limit 1)
      else null end,
    'hasMore', (select count(*) from selected) > p_limit
  ) into result from page;
  return result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

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
  active_count integer;
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
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
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
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  if (p_coverage ->> 'lineupRowsSeen')::integer not between 22 and 100
    or (p_coverage ->> 'validPlayerRows')::integer <> jsonb_array_length(p_rows)
    or (p_coverage ->> 'excludedIncompleteRows')::integer not between 0 and 20
    or (p_coverage ->> 'lineupRowsSeen')::integer
      <> (p_coverage ->> 'validPlayerRows')::integer
        + (p_coverage ->> 'excludedIncompleteRows')::integer
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

    select player.* into target_player
    from app_private.football_provider_mappings mapping
    join app.players player on player.id = mapping.internal_entity_id
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'player'
      and mapping.external_id = external_player_id
      and mapping.active;
    if not found then
      raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
    end if;
    select mapping.internal_entity_id into target_team_id
    from app_private.football_provider_mappings mapping
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'team'
      and mapping.external_id = external_team_id
      and mapping.active;
    if not found or target_team_id not in (target_fixture.home_team_id, target_fixture.away_team_id)
      or not exists (
        select 1 from app.team_memberships membership
        where membership.season_id = target_season.id
          and membership.player_id = target_player.id
          and membership.team_id = target_team_id
          and target_fixture.kickoff_at::date >= membership.valid_from
          and (membership.valid_to is null or target_fixture.kickoff_at::date <= membership.valid_to)
      )
    then
      raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
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

  select count(*) into active_count
  from app.player_fixture_performances performance
  where performance.fixture_id = target_fixture.id and performance.active;
  if active_count <> jsonb_array_length(p_rows) then
    raise exception using errcode = '22023', message = 'PERFORMANCE_RECONCILIATION_FAILED';
  end if;

  insert into app_private.historical_performance_fixture_coverage (
    fixture_id, football_season_id, source_provider, source_version,
    lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
    starter_rows, team_count, detail_rows, invalid_detail_rows,
    performance_rows, reconciled, provider_observed_at
  ) values (
    target_fixture.id, target_season.id, p_provider_name, p_source_version,
    (p_coverage ->> 'lineupRowsSeen')::integer,
    (p_coverage ->> 'validPlayerRows')::integer,
    (p_coverage ->> 'excludedIncompleteRows')::integer,
    (p_coverage ->> 'starterRows')::integer,
    (p_coverage ->> 'teamCount')::integer,
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
    'reconciled', true
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or not_null_violation or check_violation or unique_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

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

  select count(*) into expected_fixture_count
  from app.fixtures fixture
  where fixture.season_id = target_season.id and fixture.status = 'finished';
  select count(*) into covered_fixture_count
  from app.fixtures fixture
  join app_private.historical_performance_fixture_coverage coverage
    on coverage.fixture_id = fixture.id
  where fixture.season_id = target_season.id
    and fixture.status = 'finished'
    and coverage.football_season_id = target_season.id
    and coverage.source_provider = p_provider_name
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
    on coverage.fixture_id = fixture.id and coverage.reconciled
  where performance.football_season_id = target_season.id
    and fixture.season_id = target_season.id
    and fixture.status = 'finished'
    and performance.active;
  if performance_count < expected_fixture_count * 22 then
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
      on coverage.fixture_id = fixture.id and coverage.reconciled
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
      and fixture.season_id = target_season.id
      and fixture.status = 'finished'
  )
  select jsonb_build_object(
    'seasonExternalId', p_season_external_id,
    'expectedFixtureCount', expected_fixture_count,
    'coveredFixtureCount', covered_fixture_count,
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

create or replace function api.ingest_historical_player_season_ratings(
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
  active_count integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'football_service_role_required';
  end if;
  if p_provider_name <> 'sportsmonks'
    or p_algorithm_version <> 'botolago-preseason-rating-v2-fixture-performance'
    or p_observed_at is null or p_observed_at > statement_timestamp() + interval '5 minutes'
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 1 and 1000
  then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
  end if;
  select mapping.internal_entity_id into target_season_id
  from app_private.football_provider_mappings mapping
  join app.seasons season on season.id = mapping.internal_entity_id
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = 'season'
    and mapping.external_id = p_season_external_id
    and mapping.active
    and season.status = 'completed'
    and not season.is_current
    and season.ends_on < current_date;
  if not found then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  update app.player_season_ratings
  set active = false, updated_at = statement_timestamp()
  where football_season_id = target_season_id and active;

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
      or (
        candidate ->> 'providerRating' is not null
        and (candidate ->> 'providerRating')::numeric not between 0 and 10
      )
    then
      raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
    end if;

    select player.* into target_player
    from app_private.football_provider_mappings mapping
    join app.players player on player.id = mapping.internal_entity_id
    where mapping.provider_name = p_provider_name
      and mapping.entity_type = 'player'
      and mapping.external_id = external_player_id
      and mapping.active;
    if not found then
      raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
    end if;
    if not exists (
      select 1 from app.player_fixture_performances performance
      where performance.football_season_id = target_season_id
        and performance.player_id = target_player.id
        and performance.active
    ) then
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

    candidate_source_version := 'sportsmonks-fixtures:'
      || encode(extensions.digest(candidate::text, 'sha256'), 'hex');
    select * into existing from app.player_season_ratings rating
    where rating.football_season_id = target_season_id
      and rating.player_id = target_player.id
      and rating.algorithm_version = p_algorithm_version
    for update;

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
      if existing.source_version = candidate_source_version then
        skipped_count := skipped_count + 1;
      else
        updated_count := updated_count + 1;
      end if;
    end if;
  end loop;

  select count(*) into active_count
  from app.player_season_ratings rating
  where rating.football_season_id = target_season_id and rating.active;
  if active_count <> jsonb_array_length(p_rows) then
    raise exception using errcode = '22023', message = 'RATING_RECONCILIATION_FAILED';
  end if;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'active', active_count
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or not_null_violation or check_violation or unique_violation then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYLOAD';
end;
$$;

revoke all on function api.football_historical_performance_fixture_batch(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function api.begin_historical_performance_ingestion(text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function api.ingest_historical_player_fixture_performance(
  text, text, text, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function api.football_historical_player_rating_inputs(text, text)
  from public, anon, authenticated;
revoke all on function api.ingest_historical_player_season_ratings(
  text, text, text, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function api.football_historical_performance_fixture_batch(text, text, text, integer)
  to service_role;
grant execute on function api.begin_historical_performance_ingestion(text, text, jsonb, jsonb)
  to service_role;
grant execute on function api.ingest_historical_player_fixture_performance(
  text, text, text, text, jsonb, jsonb, timestamptz
) to service_role;
grant execute on function api.football_historical_player_rating_inputs(text, text)
  to service_role;
grant execute on function api.ingest_historical_player_season_ratings(
  text, text, text, jsonb, timestamptz
) to service_role;

comment on table app.player_fixture_performances is
  'Normalized player facts from completed provider fixtures; historical input only, never a live-state signal.';
comment on table app_private.historical_performance_fixture_coverage is
  'Exact per-fixture reconciliation gate for completed-season player-performance backfills.';
