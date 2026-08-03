-- BotolaGO V2 — production-safe Fantasy catalog staging and registration.
--
-- This migration is additive. It publishes a deterministic initial-pricing
-- model, a read-only catalog preview, and service-role-only transactional
-- stage/open/rollback operations. It creates no season or player row by
-- itself and enables no worker or schedule.

create table app_private.fantasy_initial_price_evidence (
  fantasy_player_id uuid primary key references app.fantasy_players(id) on delete restrict,
  algorithm_code text not null,
  source_rating_season_id uuid references app.seasons(id) on delete restrict,
  source_rating_algorithm text,
  source_rating numeric(3,1) not null,
  source_confidence numeric(6,5) not null,
  calculated_price numeric(8,2) not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_initial_price_evidence_algorithm_check check (
    algorithm_code = 'botolago-initial-price-v1.0'
  ),
  constraint fantasy_initial_price_evidence_source_check check (
    (source_rating_season_id is null and source_rating_algorithm is null)
    or (source_rating_season_id is not null and source_rating_algorithm is not null)
  ),
  constraint fantasy_initial_price_evidence_rating_check check (source_rating between 4 and 10),
  constraint fantasy_initial_price_evidence_confidence_check check (
    source_confidence between 0 and 1
  ),
  constraint fantasy_initial_price_evidence_price_check check (
    calculated_price between 4 and 12.5
  )
);

create table app_private.fantasy_catalog_activation_runs (
  id uuid primary key,
  football_season_id uuid not null references app.seasons(id) on delete restrict,
  fantasy_season_id uuid not null,
  ruleset_id uuid not null references app.fantasy_rulesets(id) on delete restrict,
  source_digest text not null,
  initial_price_algorithm text not null,
  expected_team_count integer not null,
  expected_round_count integer not null,
  expected_fixture_count integer not null,
  minimum_player_count integer not null,
  maximum_player_count integer not null,
  player_count integer not null,
  gameweek_count integer not null,
  fixture_count integer not null,
  staged_at timestamptz not null default statement_timestamp(),
  opened_at timestamptz,
  rolled_back_at timestamptz,
  constraint fantasy_catalog_activation_runs_fantasy_season_key unique (fantasy_season_id),
  constraint fantasy_catalog_activation_runs_digest_check check (
    source_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint fantasy_catalog_activation_runs_algorithm_check check (
    initial_price_algorithm = 'botolago-initial-price-v1.0'
  ),
  constraint fantasy_catalog_activation_runs_expected_check check (
    expected_team_count between 2 and 100 and mod(expected_team_count, 2) = 0
    and expected_round_count between 1 and 1000
    and expected_fixture_count between 1 and 10000
    and minimum_player_count between 1 and maximum_player_count
    and maximum_player_count <= 5000
  ),
  constraint fantasy_catalog_activation_runs_actual_check check (
    player_count between minimum_player_count and maximum_player_count
    and gameweek_count = expected_round_count
    and fixture_count = expected_fixture_count
  ),
  constraint fantasy_catalog_activation_runs_lifecycle_check check (
    opened_at is null or opened_at >= staged_at
  ),
  constraint fantasy_catalog_activation_runs_rollback_check check (
    rolled_back_at is null or rolled_back_at >= staged_at
  )
);

create table app_private.fantasy_registration_activation_runs (
  id uuid primary key,
  catalog_activation_id uuid not null references app_private.fantasy_catalog_activation_runs(id)
    on delete restrict,
  fantasy_season_id uuid not null,
  source_digest text not null,
  first_gameweek_id uuid not null,
  opened_at timestamptz not null default statement_timestamp(),
  constraint fantasy_registration_activation_runs_season_key unique (fantasy_season_id),
  constraint fantasy_registration_activation_runs_digest_check check (
    source_digest ~ '^[0-9a-f]{64}$'
  )
);

comment on table app_private.fantasy_initial_price_evidence is
  'Immutable opening-price evidence. Missing history is represented explicitly by rating 6.0 and confidence 0.';
comment on table app_private.fantasy_catalog_activation_runs is
  'Service-controlled Fantasy catalog activation journal. A rollback retains this row and stamps rolled_back_at.';
comment on table app_private.fantasy_registration_activation_runs is
  'Service-controlled journal for the separate registration-opening transition.';

create index fantasy_initial_price_evidence_source_idx
  on app_private.fantasy_initial_price_evidence (
    source_rating_season_id, source_rating_algorithm, fantasy_player_id
  );
create index fantasy_catalog_activation_runs_staged_idx
  on app_private.fantasy_catalog_activation_runs (staged_at desc, id desc);
create index fantasy_catalog_activation_runs_ruleset_idx
  on app_private.fantasy_catalog_activation_runs (ruleset_id, id);
create unique index fantasy_catalog_activation_runs_active_season_key
  on app_private.fantasy_catalog_activation_runs (football_season_id)
  where rolled_back_at is null;
create index fantasy_registration_activation_runs_catalog_idx
  on app_private.fantasy_registration_activation_runs (catalog_activation_id, id);

alter table app_private.fantasy_initial_price_evidence enable row level security;
alter table app_private.fantasy_initial_price_evidence force row level security;
alter table app_private.fantasy_catalog_activation_runs enable row level security;
alter table app_private.fantasy_catalog_activation_runs force row level security;
alter table app_private.fantasy_registration_activation_runs enable row level security;
alter table app_private.fantasy_registration_activation_runs force row level security;

revoke all on table app_private.fantasy_initial_price_evidence
  from public, anon, authenticated, service_role;
revoke all on table app_private.fantasy_catalog_activation_runs
  from public, anon, authenticated, service_role;
revoke all on table app_private.fantasy_registration_activation_runs
  from public, anon, authenticated, service_role;

create or replace function app_private.fantasy_initial_price_v1(
  p_position_code text,
  p_rating numeric,
  p_confidence numeric
)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare minimum_price numeric;
declare maximum_price numeric;
declare adjusted_rating numeric;
begin
  if p_rating is null or p_rating not between 4 and 10
    or p_confidence is null or p_confidence not between 0 and 1 then
    raise exception using errcode = 'PT400', message = 'invalid_initial_price_input';
  end if;

  select bounds.minimum_price, bounds.maximum_price
  into minimum_price, maximum_price
  from (values
    ('GK'::text, 4.0::numeric, 6.5::numeric),
    ('DEF'::text, 4.0::numeric, 7.0::numeric),
    ('MID'::text, 4.5::numeric, 12.5::numeric),
    ('FWD'::text, 4.5::numeric, 12.5::numeric)
  ) as bounds(position_code, minimum_price, maximum_price)
  where bounds.position_code = p_position_code;

  if not found then
    raise exception using errcode = 'PT400', message = 'invalid_initial_price_input';
  end if;

  adjusted_rating := 6 + (p_rating - 6) * p_confidence;
  return round((minimum_price + ((adjusted_rating - 4) / 6)
    * (maximum_price - minimum_price)) * 10) / 10;
end;
$$;

create or replace function app_private.fantasy_catalog_candidates(
  p_football_season_id uuid
)
returns table (
  football_player_id uuid,
  football_team_id uuid,
  fantasy_position_id uuid,
  position_code text,
  source_rating_season_id uuid,
  source_rating_algorithm text,
  source_rating numeric,
  source_confidence numeric,
  initial_price numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with target_season as (
    select season.* from app.seasons season where season.id = p_football_season_id
  ), candidates as (
    select
      player.id as football_player_id,
      membership.team_id as football_team_id,
      fantasy_position.id as fantasy_position_id,
      fantasy_position.code as position_code,
      rating.football_season_id as source_rating_season_id,
      rating.algorithm_version as source_rating_algorithm,
      coalesce(rating.rating, 6.0::numeric) as source_rating,
      coalesce(rating.confidence, 0.0::numeric) as source_confidence
    from target_season target
    join app.team_memberships membership
      on membership.season_id = target.id and membership.active
    join app.players player on player.id = membership.player_id and player.active
    join app.teams team on team.id = membership.team_id and team.active
    join app.fantasy_positions fantasy_position on fantasy_position.code = case player.position
      when 'goalkeeper' then 'GK'
      when 'defender' then 'DEF'
      when 'midfielder' then 'MID'
      when 'forward' then 'FWD'
    end
    left join lateral (
      select player_rating.football_season_id, player_rating.algorithm_version,
        player_rating.rating, player_rating.confidence
      from app.player_season_ratings player_rating
      join app.seasons rating_season on rating_season.id = player_rating.football_season_id
      where player_rating.player_id = player.id
        and player_rating.active
        and rating_season.competition_id = target.competition_id
        and rating_season.ends_on < target.starts_on
        and rating_season.status = 'completed'
      order by rating_season.ends_on desc, player_rating.calculated_at desc,
        player_rating.id desc
      limit 1
    ) rating on true
  )
  select candidates.football_player_id, candidates.football_team_id,
    candidates.fantasy_position_id, candidates.position_code,
    candidates.source_rating_season_id, candidates.source_rating_algorithm,
    candidates.source_rating, candidates.source_confidence,
    app_private.fantasy_initial_price_v1(
      candidates.position_code, candidates.source_rating, candidates.source_confidence
    ) as initial_price
  from candidates;
$$;

create or replace function app_private.fantasy_catalog_source_digest(
  p_football_season_id uuid,
  p_ruleset_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(E'\n--\n',
    coalesce((
      select concat_ws('|', season.id, season.competition_id, season.label,
        season.starts_on, season.ends_on, season.status, season.is_current,
        season.updated_at)
      from app.seasons season where season.id = p_football_season_id
    ), ''),
    coalesce((
      select concat_ws('|', rules.id, rules.ruleset_code, rules.version,
        rules.minor_version, rules.published_at, rules.updated_at)
      from app.fantasy_rulesets rules where rules.id = p_ruleset_id
    ), ''),
    coalesce((
      select string_agg(concat_ws('|', candidate.football_player_id,
        candidate.football_team_id, candidate.position_code,
        candidate.source_rating_season_id, candidate.source_rating_algorithm,
        candidate.source_rating, candidate.source_confidence,
        candidate.initial_price), E'\n' order by candidate.football_player_id)
      from app_private.fantasy_catalog_candidates(p_football_season_id) candidate
    ), ''),
    coalesce((
      select string_agg(concat_ws('|', round_row.id, round_row.round_number,
        round_row.name, round_row.updated_at), E'\n'
        order by round_row.round_number, round_row.id)
      from app.rounds round_row where round_row.season_id = p_football_season_id
    ), ''),
    coalesce((
      select string_agg(concat_ws('|', fixture.id, fixture.round_id,
        fixture.home_team_id, fixture.away_team_id, fixture.kickoff_at,
        fixture.status, fixture.source_sequence, fixture.source_version,
        fixture.provider_updated_at), E'\n' order by fixture.id)
      from app.fixtures fixture
      where fixture.season_id = p_football_season_id
        and fixture.status not in ('cancelled', 'abandoned')
    ), '')
  ), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function app_private.fantasy_catalog_activation_preview(
  p_football_season_id uuid,
  p_ruleset_code text,
  p_expected_team_count integer,
  p_expected_round_count integer,
  p_expected_fixture_count integer,
  p_minimum_player_count integer,
  p_maximum_player_count integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_season app.seasons%rowtype;
declare target_competition app.competitions%rowtype;
declare target_ruleset app.fantasy_rulesets%rowtype;
declare team_count integer;
declare round_count integer;
declare fixture_count integer;
declare player_count integer;
declare rated_player_count integer;
declare goalkeeper_count integer;
declare defender_count integer;
declare midfielder_count integer;
declare forward_count integer;
declare duplicate_player_count integer;
declare incomplete_team_count integer;
declare invalid_round_count integer;
declare unassigned_fixture_count integer;
declare price_minimum numeric;
declare price_maximum numeric;
declare earliest_kickoff timestamptz;
declare source_digest text;
declare blockers text[] := array[]::text[];
begin
  if p_football_season_id is null or p_ruleset_code is null
    or p_ruleset_code !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'
    or p_expected_team_count not between 2 and 100
    or mod(p_expected_team_count, 2) <> 0
    or p_expected_round_count not between 1 and 1000
    or p_expected_fixture_count not between 1 and 10000
    or p_minimum_player_count < 1
    or p_maximum_player_count < p_minimum_player_count
    or p_maximum_player_count > 5000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target_season from app.seasons where id = p_football_season_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'football_season_not_found';
  end if;
  select * into target_competition from app.competitions
  where id = target_season.competition_id;
  select * into target_ruleset from app.fantasy_rulesets
  where ruleset_code = p_ruleset_code and active and published_at is not null;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_ruleset_not_found';
  end if;

  select count(distinct candidate.football_team_id), count(*),
    count(*) filter (where candidate.source_rating_season_id is not null),
    count(*) filter (where candidate.position_code = 'GK'),
    count(*) filter (where candidate.position_code = 'DEF'),
    count(*) filter (where candidate.position_code = 'MID'),
    count(*) filter (where candidate.position_code = 'FWD'),
    min(candidate.initial_price), max(candidate.initial_price)
  into team_count, player_count, rated_player_count, goalkeeper_count,
    defender_count, midfielder_count, forward_count, price_minimum, price_maximum
  from app_private.fantasy_catalog_candidates(p_football_season_id) candidate;

  select count(*) into round_count from app.rounds round_row
  where round_row.season_id = p_football_season_id;
  select count(*), min(fixture.kickoff_at)
  into fixture_count, earliest_kickoff
  from app.fixtures fixture
  where fixture.season_id = p_football_season_id
    and fixture.status not in ('cancelled', 'abandoned');
  select count(*) into unassigned_fixture_count
  from app.fixtures fixture
  where fixture.season_id = p_football_season_id
    and fixture.status not in ('cancelled', 'abandoned')
    and fixture.round_id is null;

  select count(*) into incomplete_team_count
  from (
    select candidate.football_team_id
    from app_private.fantasy_catalog_candidates(p_football_season_id) candidate
    group by candidate.football_team_id
    having count(*) < 7
      or count(*) filter (where candidate.position_code = 'GK') < 1
      or count(*) filter (where candidate.position_code = 'DEF') < 3
      or count(*) filter (where candidate.position_code = 'MID') < 2
      or count(*) filter (where candidate.position_code = 'FWD') < 1
  ) incomplete;

  select count(*) into duplicate_player_count
  from (
    select candidate.football_player_id
    from app_private.fantasy_catalog_candidates(p_football_season_id) candidate
    group by candidate.football_player_id
    having count(*) <> 1
  ) duplicate_player;

  -- Every league round must contain exactly one fixture participation per
  -- expected team. Count distinct fixtures because the participant expansion
  -- intentionally emits one row for the home and away team.
  select count(*) into invalid_round_count
  from app.rounds round_row
  left join lateral (
    select count(distinct fixture.id) as fixture_count,
      count(distinct participant.team_id) as participant_count
    from app.fixtures fixture
    cross join lateral (values (fixture.home_team_id), (fixture.away_team_id)) participant(team_id)
    where fixture.season_id = p_football_season_id
      and fixture.round_id = round_row.id
      and fixture.status not in ('cancelled', 'abandoned')
  ) topology on true
  where round_row.season_id = p_football_season_id
    and (round_row.round_number is null
      or topology.fixture_count <> p_expected_team_count / 2
      or topology.participant_count <> p_expected_team_count);

  if not target_competition.active then
    blockers := array_append(blockers, 'competition_inactive');
  end if;
  if not target_season.is_current then
    blockers := array_append(blockers, 'season_not_current');
  end if;
  if target_season.status not in ('planned', 'active') then
    blockers := array_append(blockers, 'season_status_invalid');
  end if;
  if target_season.ends_on < current_date then
    blockers := array_append(blockers, 'season_ended');
  end if;
  if team_count <> p_expected_team_count then
    blockers := array_append(blockers, 'team_count_mismatch');
  end if;
  if player_count not between p_minimum_player_count and p_maximum_player_count then
    blockers := array_append(blockers, 'player_count_out_of_range');
  end if;
  if goalkeeper_count < p_expected_team_count * 2 then
    blockers := array_append(blockers, 'goalkeeper_pool_incomplete');
  end if;
  if defender_count < p_expected_team_count * 5 then
    blockers := array_append(blockers, 'defender_pool_incomplete');
  end if;
  if midfielder_count < p_expected_team_count * 5 then
    blockers := array_append(blockers, 'midfielder_pool_incomplete');
  end if;
  if forward_count < p_expected_team_count * 3 then
    blockers := array_append(blockers, 'forward_pool_incomplete');
  end if;
  if incomplete_team_count > 0 then
    blockers := array_append(blockers, 'team_squad_incomplete');
  end if;
  if duplicate_player_count > 0 then
    blockers := array_append(blockers, 'duplicate_player_membership');
  end if;
  if round_count <> p_expected_round_count then
    blockers := array_append(blockers, 'round_count_mismatch');
  end if;
  if fixture_count <> p_expected_fixture_count then
    blockers := array_append(blockers, 'fixture_count_mismatch');
  end if;
  if unassigned_fixture_count > 0 then
    blockers := array_append(blockers, 'fixture_round_missing');
  end if;
  if invalid_round_count > 0 then
    blockers := array_append(blockers, 'round_topology_invalid');
  end if;
  if earliest_kickoff is null or earliest_kickoff <= statement_timestamp() + interval '24 hours' then
    blockers := array_append(blockers, 'activation_window_closed');
  end if;
  if price_minimum is null or price_minimum < 4 or price_maximum > 12.5 then
    blockers := array_append(blockers, 'initial_price_invalid');
  end if;

  source_digest := app_private.fantasy_catalog_source_digest(
    p_football_season_id, target_ruleset.id
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'mode', 'fantasy_catalog_activation_preview',
    'ready', cardinality(blockers) = 0,
    'blockers', to_jsonb(blockers),
    'footballSeasonId', target_season.id,
    'footballCompetitionId', target_competition.id,
    'seasonLabel', target_season.label,
    'rulesetId', target_ruleset.id,
    'rulesetCode', target_ruleset.ruleset_code,
    'initialPriceAlgorithm', 'botolago-initial-price-v1.0',
    'sourceDigest', source_digest,
    'counts', jsonb_build_object(
      'teams', team_count, 'rounds', round_count, 'fixtures', fixture_count,
      'players', player_count, 'ratedPlayers', rated_player_count,
      'fallbackPlayers', player_count - rated_player_count,
      'incompleteTeams', incomplete_team_count,
      'duplicatePlayers', duplicate_player_count,
      'invalidRounds', invalid_round_count,
      'unassignedFixtures', unassigned_fixture_count
    ),
    'positions', jsonb_build_object(
      'GK', goalkeeper_count, 'DEF', defender_count,
      'MID', midfielder_count, 'FWD', forward_count
    ),
    'priceRange', jsonb_build_object('minimum', price_minimum, 'maximum', price_maximum),
    'earliestKickoff', earliest_kickoff
  );
end;
$$;

create or replace function api.preview_fantasy_catalog_activation(
  p_football_season_id uuid,
  p_ruleset_code text default 'botolago-fantasy-v1.1',
  p_expected_team_count integer default 16,
  p_expected_round_count integer default 30,
  p_expected_fixture_count integer default 240,
  p_minimum_player_count integer default 240,
  p_maximum_player_count integer default 800
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  return app_private.fantasy_catalog_activation_preview(
    p_football_season_id, p_ruleset_code, p_expected_team_count,
    p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  );
end;
$$;

create or replace function app_private.fantasy_catalog_stage_dto(
  p_activation app_private.fantasy_catalog_activation_runs
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'activationId', p_activation.id,
    'footballSeasonId', p_activation.football_season_id,
    'fantasySeasonId', p_activation.fantasy_season_id,
    'rulesetId', p_activation.ruleset_id,
    'sourceDigest', p_activation.source_digest,
    'initialPriceAlgorithm', p_activation.initial_price_algorithm,
    'playerCount', p_activation.player_count,
    'gameweekCount', p_activation.gameweek_count,
    'fixtureCount', p_activation.fixture_count,
    'stagedAt', p_activation.staged_at,
    'openedAt', p_activation.opened_at,
    'rolledBackAt', p_activation.rolled_back_at
  );
$$;

create or replace function api.service_stage_fantasy_catalog(
  p_football_season_id uuid,
  p_ruleset_code text,
  p_expected_source_digest text,
  p_idempotency_key uuid,
  p_expected_team_count integer,
  p_expected_round_count integer,
  p_expected_fixture_count integer,
  p_minimum_player_count integer,
  p_maximum_player_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare preview jsonb;
declare target_season app.seasons%rowtype;
declare target_competition app.competitions%rowtype;
declare target_ruleset app.fantasy_rulesets%rowtype;
declare target_fantasy_competition_id uuid;
declare target_fantasy_season_id uuid;
declare existing_run app_private.fantasy_catalog_activation_runs%rowtype;
declare player_count integer;
declare gameweek_count integer;
declare fixture_count integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_idempotency_key is null or p_expected_source_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into target_ruleset from app.fantasy_rulesets
  where ruleset_code = p_ruleset_code and active and published_at is not null;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_ruleset_not_found';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || p_football_season_id::text, 0
  ));

  select * into existing_run from app_private.fantasy_catalog_activation_runs
  where id = p_idempotency_key;
  if found then
    if existing_run.football_season_id <> p_football_season_id
      or existing_run.source_digest <> p_expected_source_digest
      or existing_run.ruleset_id <> target_ruleset.id
      or existing_run.expected_team_count <> p_expected_team_count
      or existing_run.expected_round_count <> p_expected_round_count
      or existing_run.expected_fixture_count <> p_expected_fixture_count
      or existing_run.minimum_player_count <> p_minimum_player_count
      or existing_run.maximum_player_count <> p_maximum_player_count then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return app_private.fantasy_catalog_stage_dto(existing_run);
  end if;

  if exists (select 1 from app_private.fantasy_catalog_activation_runs run
    where run.football_season_id = p_football_season_id and run.rolled_back_at is null) then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_already_staged';
  end if;
  if exists (select 1 from app.fantasy_seasons fantasy_season
    where fantasy_season.football_season_id = p_football_season_id) then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_already_staged';
  end if;

  preview := app_private.fantasy_catalog_activation_preview(
    p_football_season_id, p_ruleset_code, p_expected_team_count,
    p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count
  );
  if not (preview ->> 'ready')::boolean then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_not_ready',
      detail = (preview -> 'blockers')::text;
  end if;
  if preview ->> 'sourceDigest' <> p_expected_source_digest then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;

  select * into target_season from app.seasons where id = p_football_season_id;
  select * into target_competition from app.competitions
  where id = target_season.competition_id;
  select competition.id into target_fantasy_competition_id
  from app.fantasy_competitions competition
  where competition.football_competition_id = target_competition.id;
  if not found then
    insert into app.fantasy_competitions (
      football_competition_id, slug, name, active
    ) values (
      target_competition.id, target_competition.slug,
      target_competition.name || ' Fantasy', false
    ) returning id into target_fantasy_competition_id;
  end if;

  insert into app.fantasy_seasons (
    fantasy_competition_id, football_season_id, ruleset_id, name, status,
    starts_at, ends_at, wildcard_split_gameweek
  ) values (
    target_fantasy_competition_id, target_season.id, target_ruleset.id,
    target_season.label, 'planned', target_season.starts_on::timestamptz,
    (target_season.ends_on + 1)::timestamptz - interval '1 microsecond',
    ceil(p_expected_round_count / 2.0)::integer
  ) returning id into target_fantasy_season_id;

  insert into app.fantasy_gameweeks (
    fantasy_season_id, football_round_id, sequence_number, name,
    deadline_at, starts_at, ends_at, status, points_state
  )
  select target_fantasy_season_id, round_row.id, round_row.round_number,
    round_row.name,
    app_private.fantasy_calculate_deadline(target_ruleset.id, min(fixture.kickoff_at)),
    min(fixture.kickoff_at), max(fixture.kickoff_at) + interval '6 hours',
    'scheduled', 'provisional'
  from app.rounds round_row
  join app.fixtures fixture on fixture.round_id = round_row.id
    and fixture.season_id = target_season.id
    and fixture.status not in ('cancelled', 'abandoned')
  where round_row.season_id = target_season.id
  group by round_row.id, round_row.round_number, round_row.name
  order by round_row.round_number;

  insert into app.fantasy_players (
    fantasy_season_id, football_player_id, football_team_id, position_id,
    price, status, eligible, active
  )
  select target_fantasy_season_id, candidate.football_player_id,
    candidate.football_team_id, candidate.fantasy_position_id,
    candidate.initial_price, 'available', true, true
  from app_private.fantasy_catalog_candidates(target_season.id) candidate;

  insert into app_private.fantasy_initial_price_evidence (
    fantasy_player_id, algorithm_code, source_rating_season_id,
    source_rating_algorithm, source_rating, source_confidence, calculated_price
  )
  select fantasy_player.id, 'botolago-initial-price-v1.0',
    candidate.source_rating_season_id, candidate.source_rating_algorithm,
    candidate.source_rating, candidate.source_confidence, candidate.initial_price
  from app.fantasy_players fantasy_player
  join app_private.fantasy_catalog_candidates(target_season.id) candidate
    on candidate.football_player_id = fantasy_player.football_player_id
  where fantasy_player.fantasy_season_id = target_fantasy_season_id;

  insert into app.fantasy_player_price_history (
    fantasy_player_id, gameweek_id, old_price, new_price, reason,
    effective_at, source_version, movement
  )
  select fantasy_player.id, null, null, fantasy_player.price,
    'initial_catalog_v1', statement_timestamp(), 1, 0
  from app.fantasy_players fantasy_player
  where fantasy_player.fantasy_season_id = target_fantasy_season_id;

  insert into app.fantasy_fixture_assignments (
    fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
    original_kickoff_at, assigned_kickoff_at, assignment_status,
    counts_points, source_version
  )
  select target_fantasy_season_id, fixture.id, gameweek.id, gameweek.id,
    fixture.kickoff_at, fixture.kickoff_at, 'assigned', true,
    greatest(1, fixture.source_sequence)
  from app.fixtures fixture
  join app.fantasy_gameweeks gameweek
    on gameweek.fantasy_season_id = target_fantasy_season_id
    and gameweek.football_round_id = fixture.round_id
  where fixture.season_id = target_season.id
    and fixture.status not in ('cancelled', 'abandoned');

  select count(*) into player_count from app.fantasy_players
  where fantasy_players.fantasy_season_id = target_fantasy_season_id;
  select count(*) into gameweek_count from app.fantasy_gameweeks
  where fantasy_gameweeks.fantasy_season_id = target_fantasy_season_id;
  select count(*) into fixture_count from app.fantasy_fixture_assignments
  where fantasy_fixture_assignments.fantasy_season_id = target_fantasy_season_id
    and superseded_at is null;

  if player_count <> (preview -> 'counts' ->> 'players')::integer
    or gameweek_count <> p_expected_round_count
    or fixture_count <> p_expected_fixture_count then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_integrity_failed';
  end if;

  insert into app_private.fantasy_catalog_activation_runs (
    id, football_season_id, fantasy_season_id, ruleset_id, source_digest,
    initial_price_algorithm, expected_team_count, expected_round_count,
    expected_fixture_count, minimum_player_count, maximum_player_count,
    player_count, gameweek_count, fixture_count
  ) values (
    p_idempotency_key, target_season.id, target_fantasy_season_id, target_ruleset.id,
    p_expected_source_digest, 'botolago-initial-price-v1.0',
    p_expected_team_count, p_expected_round_count, p_expected_fixture_count,
    p_minimum_player_count, p_maximum_player_count,
    player_count, gameweek_count, fixture_count
  ) returning * into existing_run;

  return app_private.fantasy_catalog_stage_dto(existing_run);
end;
$$;

create or replace function api.service_open_fantasy_registration(
  p_catalog_activation_id uuid,
  p_expected_source_digest text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare catalog_run app_private.fantasy_catalog_activation_runs%rowtype;
declare existing_open app_private.fantasy_registration_activation_runs%rowtype;
declare first_gameweek app.fantasy_gameweeks%rowtype;
declare ruleset_code text;
declare preview jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_idempotency_key is null or p_expected_source_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into catalog_run from app_private.fantasy_catalog_activation_runs
  where id = p_catalog_activation_id;
  if not found or catalog_run.rolled_back_at is not null then
    raise exception using errcode = 'PT404', message = 'fantasy_catalog_not_found';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:registration:' || catalog_run.fantasy_season_id::text, 0
  ));

  select * into existing_open from app_private.fantasy_registration_activation_runs
  where id = p_idempotency_key;
  if found then
    if existing_open.catalog_activation_id <> p_catalog_activation_id
      or existing_open.source_digest <> p_expected_source_digest then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'activationId', existing_open.id,
      'fantasySeasonId', existing_open.fantasy_season_id,
      'firstGameweekId', existing_open.first_gameweek_id,
      'sourceDigest', existing_open.source_digest,
      'openedAt', existing_open.opened_at
    );
  end if;
  if exists (select 1 from app_private.fantasy_registration_activation_runs run
    where run.fantasy_season_id = catalog_run.fantasy_season_id) then
    raise exception using errcode = 'PT409', message = 'fantasy_registration_already_open';
  end if;
  if catalog_run.source_digest <> p_expected_source_digest then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;

  select rules.ruleset_code into ruleset_code from app.fantasy_rulesets rules
  where rules.id = catalog_run.ruleset_id;
  preview := app_private.fantasy_catalog_activation_preview(
    catalog_run.football_season_id, ruleset_code, catalog_run.expected_team_count,
    catalog_run.expected_round_count, catalog_run.expected_fixture_count,
    catalog_run.minimum_player_count, catalog_run.maximum_player_count
  );
  if not (preview ->> 'ready')::boolean
    or preview ->> 'sourceDigest' <> p_expected_source_digest then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_stale';
  end if;
  if exists (select 1 from app.fantasy_teams team
    where team.fantasy_season_id = catalog_run.fantasy_season_id) then
    raise exception using errcode = 'PT409', message = 'fantasy_registration_conflict';
  end if;

  select * into first_gameweek from app.fantasy_gameweeks gameweek
  where gameweek.fantasy_season_id = catalog_run.fantasy_season_id
    and gameweek.status = 'scheduled'
  order by gameweek.sequence_number
  limit 1;
  if not found or first_gameweek.deadline_at <= statement_timestamp() + interval '24 hours' then
    raise exception using errcode = 'PT409', message = 'fantasy_activation_window_closed';
  end if;

  update app.fantasy_competitions competition set active = true
  from app.fantasy_seasons season
  where season.id = catalog_run.fantasy_season_id
    and competition.id = season.fantasy_competition_id;
  update app.fantasy_seasons set status = 'registration_open'
  where id = catalog_run.fantasy_season_id and status = 'planned';
  if not found then
    raise exception using errcode = 'PT409', message = 'fantasy_registration_conflict';
  end if;
  update app.fantasy_gameweeks set status = 'open'
  where id = first_gameweek.id and status = 'scheduled';
  if not found then
    raise exception using errcode = 'PT409', message = 'fantasy_registration_conflict';
  end if;

  insert into app_private.fantasy_registration_activation_runs (
    id, catalog_activation_id, fantasy_season_id, source_digest, first_gameweek_id
  ) values (
    p_idempotency_key, catalog_run.id, catalog_run.fantasy_season_id,
    p_expected_source_digest, first_gameweek.id
  ) returning * into existing_open;
  update app_private.fantasy_catalog_activation_runs set opened_at = existing_open.opened_at
  where id = catalog_run.id;

  return jsonb_build_object(
    'activationId', existing_open.id,
    'fantasySeasonId', existing_open.fantasy_season_id,
    'firstGameweekId', existing_open.first_gameweek_id,
    'sourceDigest', existing_open.source_digest,
    'openedAt', existing_open.opened_at
  );
end;
$$;

create or replace function api.service_rollback_fantasy_catalog(
  p_catalog_activation_id uuid,
  p_expected_source_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare catalog_run app_private.fantasy_catalog_activation_runs%rowtype;
declare fantasy_competition_id uuid;
declare removed_players integer;
declare removed_gameweeks integer;
declare removed_fixtures integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into catalog_run from app_private.fantasy_catalog_activation_runs
  where id = p_catalog_activation_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_catalog_not_found';
  end if;
  if catalog_run.source_digest <> p_expected_source_digest then
    raise exception using errcode = 'PT409', message = 'stale_update';
  end if;
  if catalog_run.rolled_back_at is not null then
    return jsonb_build_object(
      'activationId', catalog_run.id, 'fantasySeasonId', catalog_run.fantasy_season_id,
      'rolledBackAt', catalog_run.rolled_back_at, 'alreadyRolledBack', true
    );
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fantasy:catalog:' || catalog_run.football_season_id::text, 0
  ));
  if exists (select 1 from app.fantasy_teams team
    where team.fantasy_season_id = catalog_run.fantasy_season_id) then
    raise exception using errcode = 'PT409', message = 'fantasy_catalog_in_use';
  end if;

  select season.fantasy_competition_id into fantasy_competition_id
  from app.fantasy_seasons season where season.id = catalog_run.fantasy_season_id;

  select count(*) into removed_fixtures from app.fantasy_fixture_assignments
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_fixture_assignments
  where fantasy_season_id = catalog_run.fantasy_season_id;

  delete from app.fantasy_player_price_history history
  using app.fantasy_players player
  where player.fantasy_season_id = catalog_run.fantasy_season_id
    and history.fantasy_player_id = player.id;
  delete from app_private.fantasy_initial_price_evidence evidence
  using app.fantasy_players player
  where player.fantasy_season_id = catalog_run.fantasy_season_id
    and evidence.fantasy_player_id = player.id;
  select count(*) into removed_players from app.fantasy_players
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_players
  where fantasy_season_id = catalog_run.fantasy_season_id;

  select count(*) into removed_gameweeks from app.fantasy_gameweeks
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_gameweeks
  where fantasy_season_id = catalog_run.fantasy_season_id;
  delete from app.fantasy_seasons where id = catalog_run.fantasy_season_id;
  update app.fantasy_competitions competition set active = false
  where competition.id = fantasy_competition_id
    and not exists (select 1 from app.fantasy_seasons season
      where season.fantasy_competition_id = competition.id);
  delete from app.fantasy_competitions competition
  where competition.id = fantasy_competition_id
    and not exists (select 1 from app.fantasy_seasons season
      where season.fantasy_competition_id = competition.id)
    and not exists (select 1 from app.fantasy_rulesets rules
      where rules.fantasy_competition_id = competition.id);

  update app_private.fantasy_catalog_activation_runs
  set rolled_back_at = statement_timestamp()
  where id = catalog_run.id
  returning * into catalog_run;

  return jsonb_build_object(
    'activationId', catalog_run.id,
    'fantasySeasonId', catalog_run.fantasy_season_id,
    'rolledBackAt', catalog_run.rolled_back_at,
    'alreadyRolledBack', false,
    'removed', jsonb_build_object(
      'players', removed_players,
      'gameweeks', removed_gameweeks,
      'fixtures', removed_fixtures
    )
  );
end;
$$;

revoke all on function app_private.fantasy_initial_price_v1(text, numeric, numeric)
  from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_catalog_candidates(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_catalog_source_digest(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_catalog_activation_preview(
  uuid, text, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function app_private.fantasy_catalog_stage_dto(
  app_private.fantasy_catalog_activation_runs
) from public, anon, authenticated, service_role;

revoke all on function api.preview_fantasy_catalog_activation(
  uuid, text, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function api.service_stage_fantasy_catalog(
  uuid, text, text, uuid, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function api.service_open_fantasy_registration(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function api.service_rollback_fantasy_catalog(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function api.preview_fantasy_catalog_activation(
  uuid, text, integer, integer, integer, integer, integer
) to service_role;
grant execute on function api.service_stage_fantasy_catalog(
  uuid, text, text, uuid, integer, integer, integer, integer, integer
) to service_role;
grant execute on function api.service_open_fantasy_registration(uuid, text, uuid)
  to service_role;
grant execute on function api.service_rollback_fantasy_catalog(uuid, text)
  to service_role;
