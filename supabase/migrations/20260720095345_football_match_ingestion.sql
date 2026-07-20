-- BotolaGO Production V2
-- Phase 3B: matches, live data, provider identity, and ingestion operations.

create type app.fixture_status as enum (
  'scheduled',
  'not_started',
  'live_first_half',
  'half_time',
  'live_second_half',
  'extra_time',
  'penalties',
  'finished',
  'postponed',
  'cancelled',
  'suspended',
  'delayed',
  'abandoned'
);
create type app.fixture_period as enum ('pre_match', 'first_half', 'half_time', 'second_half', 'extra_time', 'penalties', 'post_match');
create type app.lineup_slot as enum ('starting', 'bench');
create type app.match_event_type as enum (
  'goal',
  'own_goal',
  'penalty_goal',
  'missed_penalty',
  'yellow_card',
  'second_yellow',
  'red_card',
  'substitution',
  'var',
  'injury',
  'period_start',
  'period_end'
);
create type app.statistic_value_type as enum ('integer', 'decimal', 'percentage', 'duration');
create type app.availability_status as enum ('available', 'injured', 'suspended', 'doubtful', 'unknown');
create type app_private.football_entity_type as enum (
  'country',
  'competition',
  'season',
  'round',
  'venue',
  'team',
  'player',
  'fixture',
  'event'
);
create type app_private.ingestion_job_type as enum (
  'competitions',
  'seasons',
  'rounds',
  'teams',
  'players',
  'squads',
  'fixtures',
  'standings',
  'lineups',
  'live_fixtures',
  'match_events',
  'match_statistics',
  'player_availability',
  'finalize_fixtures'
);
create type app_private.ingestion_run_status as enum (
  'pending',
  'running',
  'succeeded',
  'partial',
  'failed',
  'cancelled'
);

create table app.fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references app.competitions(id) on delete restrict,
  season_id uuid not null references app.seasons(id) on delete restrict,
  round_id uuid references app.rounds(id) on delete set null,
  home_team_id uuid not null references app.teams(id) on delete restrict,
  away_team_id uuid not null references app.teams(id) on delete restrict,
  venue_id uuid references app.venues(id) on delete set null,
  kickoff_at timestamptz not null,
  status app.fixture_status not null default 'scheduled',
  period app.fixture_period not null default 'pre_match',
  minute integer,
  added_time integer,
  home_score integer,
  away_score integer,
  half_time_home_score integer,
  half_time_away_score integer,
  extra_time_home_score integer,
  extra_time_away_score integer,
  penalty_home_score integer,
  penalty_away_score integer,
  winner_team_id uuid references app.teams(id) on delete restrict,
  attendance integer,
  provider_updated_at timestamptz not null,
  source_sequence bigint not null default 0,
  source_version text,
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fixtures_teams_differ_check check (home_team_id <> away_team_id),
  constraint fixtures_minute_check check (minute is null or minute between 0 and 180),
  constraint fixtures_added_time_check check (added_time is null or added_time between 0 and 60),
  constraint fixtures_scores_check check (
    (home_score is null or home_score >= 0)
    and (away_score is null or away_score >= 0)
    and (half_time_home_score is null or half_time_home_score >= 0)
    and (half_time_away_score is null or half_time_away_score >= 0)
    and (extra_time_home_score is null or extra_time_home_score >= 0)
    and (extra_time_away_score is null or extra_time_away_score >= 0)
    and (penalty_home_score is null or penalty_home_score >= 0)
    and (penalty_away_score is null or penalty_away_score >= 0)
  ),
  constraint fixtures_score_pair_check check (
    (home_score is null) = (away_score is null)
    and (half_time_home_score is null) = (half_time_away_score is null)
    and (extra_time_home_score is null) = (extra_time_away_score is null)
    and (penalty_home_score is null) = (penalty_away_score is null)
  ),
  constraint fixtures_winner_team_check check (
    winner_team_id is null or winner_team_id in (home_team_id, away_team_id)
  ),
  constraint fixtures_attendance_check check (attendance is null or attendance between 0 and 500000),
  constraint fixtures_source_sequence_check check (source_sequence >= 0),
  constraint fixtures_source_version_check check (
    source_version is null or char_length(source_version) between 1 and 160
  ),
  constraint fixtures_finished_score_check check (
    status <> 'finished' or (home_score is not null and away_score is not null)
  ),
  constraint fixtures_finalized_at_check check (
    finalized_at is null or finalized_at >= kickoff_at
  )
);

create index fixtures_kickoff_idx on app.fixtures (kickoff_at, id);
create index fixtures_kickoff_desc_idx on app.fixtures (kickoff_at desc, id desc);
create index fixtures_competition_kickoff_idx
  on app.fixtures (competition_id, kickoff_at, id);
create index fixtures_season_round_kickoff_idx
  on app.fixtures (season_id, round_id, kickoff_at, id);
create index fixtures_home_team_kickoff_idx
  on app.fixtures (home_team_id, kickoff_at desc, id desc);
create index fixtures_away_team_kickoff_idx
  on app.fixtures (away_team_id, kickoff_at desc, id desc);
create index fixtures_provider_freshness_idx
  on app.fixtures (provider_updated_at, source_sequence, id);
create index fixtures_live_kickoff_idx
  on app.fixtures (kickoff_at, id)
  include (status, minute, home_score, away_score, provider_updated_at)
  where status in (
    'live_first_half', 'half_time', 'live_second_half', 'extra_time',
    'penalties', 'suspended', 'delayed'
  );

create or replace function app_private.validate_fixture_catalog()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.seasons season
    where season.id = new.season_id and season.competition_id = new.competition_id
  ) then
    raise exception using errcode = '23514', message = 'INVALID_FIXTURE_SEASON';
  end if;

  if new.round_id is not null and not exists (
    select 1 from app.rounds round_row
    where round_row.id = new.round_id and round_row.season_id = new.season_id
  ) then
    raise exception using errcode = '23514', message = 'INVALID_FIXTURE_ROUND';
  end if;

  return new;
end;
$$;

create or replace function app_private.protect_fixture_freshness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  correction_allowed boolean := coalesce(current_setting('app.allow_fixture_correction', true), '') = 'on';
begin
  if new.provider_updated_at < old.provider_updated_at
    or (
      new.provider_updated_at = old.provider_updated_at
      and new.source_sequence < old.source_sequence
    )
  then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;

  if old.status in ('finished', 'cancelled', 'abandoned')
    and new.status <> old.status
    and not correction_allowed
  then
    raise exception using errcode = 'P0001', message = 'INVALID_FIXTURE_STATE';
  end if;

  if old.finalized_at is not null and new.finalized_at is null and not correction_allowed then
    raise exception using errcode = 'P0001', message = 'INVALID_FIXTURE_STATE';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_fixture_catalog()
  from public, anon, authenticated, service_role;
revoke all on function app_private.protect_fixture_freshness()
  from public, anon, authenticated, service_role;
grant execute on function app_private.validate_fixture_catalog() to postgres;
grant execute on function app_private.protect_fixture_freshness() to postgres;

create trigger fixtures_validate_catalog before insert or update on app.fixtures
for each row execute function app_private.validate_fixture_catalog();
create trigger fixtures_protect_freshness before update on app.fixtures
for each row execute function app_private.protect_fixture_freshness();

create table app.lineups (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references app.fixtures(id) on delete cascade,
  team_id uuid not null references app.teams(id) on delete restrict,
  formation text,
  confirmed boolean not null default false,
  published_at timestamptz,
  provider_updated_at timestamptz not null,
  source_sequence bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint lineups_fixture_team_key unique (fixture_id, team_id),
  constraint lineups_formation_check check (
    formation is null or formation ~ '^[1-5](?:-[1-5]){1,4}$'
  ),
  constraint lineups_source_sequence_check check (source_sequence >= 0)
);

create index lineups_fixture_idx on app.lineups (fixture_id, team_id, id);

create table app.lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references app.lineups(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete restrict,
  slot app.lineup_slot not null,
  position app.football_position,
  shirt_number integer,
  display_order integer not null,
  captain boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint lineup_players_lineup_player_key unique (lineup_id, player_id),
  constraint lineup_players_lineup_order_key unique (lineup_id, slot, display_order),
  constraint lineup_players_shirt_number_check check (
    shirt_number is null or shirt_number between 1 and 99
  ),
  constraint lineup_players_display_order_check check (display_order between 1 and 100)
);

create unique index lineup_players_one_captain_key
  on app.lineup_players (lineup_id)
  where captain;
create index lineup_players_player_idx on app.lineup_players (player_id, lineup_id);

create or replace function app_private.validate_fixture_team()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_fixture uuid;
  target_team uuid;
begin
  if tg_table_name = 'lineups' then
    target_fixture := new.fixture_id;
    target_team := new.team_id;
  elsif tg_table_name = 'fixture_team_statistics' then
    target_fixture := new.fixture_id;
    target_team := new.team_id;
  else
    raise exception using errcode = '22023', message = 'INVALID_FIXTURE_TEAM_TRIGGER';
  end if;

  if not exists (
    select 1 from app.fixtures fixture
    where fixture.id = target_fixture
      and target_team in (fixture.home_team_id, fixture.away_team_id)
  ) then
    raise exception using errcode = '23514', message = 'TEAM_NOT_IN_FIXTURE';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_fixture_team()
  from public, anon, authenticated, service_role;
grant execute on function app_private.validate_fixture_team() to postgres;

create trigger lineups_validate_fixture_team before insert or update on app.lineups
for each row execute function app_private.validate_fixture_team();

create table app.match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references app.fixtures(id) on delete cascade,
  team_id uuid references app.teams(id) on delete restrict,
  player_id uuid references app.players(id) on delete restrict,
  related_player_id uuid references app.players(id) on delete restrict,
  event_type app.match_event_type not null,
  detail text,
  minute integer not null,
  added_time integer not null default 0,
  sequence_number integer not null,
  period app.fixture_period not null,
  idempotency_key text not null,
  provider_event_key text,
  provider_updated_at timestamptz not null,
  source_sequence bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint match_events_fixture_idempotency_key unique (fixture_id, idempotency_key),
  constraint match_events_minute_check check (minute between 0 and 180),
  constraint match_events_added_time_check check (added_time between 0 and 60),
  constraint match_events_sequence_check check (sequence_number between 0 and 10000),
  constraint match_events_detail_check check (
    detail is null or (detail = btrim(detail) and char_length(detail) between 1 and 500)
  ),
  constraint match_events_idempotency_key_check check (
    idempotency_key ~ '^[A-Za-z0-9._:-]{1,200}$'
  ),
  constraint match_events_provider_event_key_check check (
    provider_event_key is null or char_length(provider_event_key) between 1 and 200
  ),
  constraint match_events_source_sequence_check check (source_sequence >= 0),
  constraint match_events_related_player_check check (
    related_player_id is null or related_player_id is distinct from player_id
  )
);

create unique index match_events_provider_event_key
  on app.match_events (fixture_id, provider_event_key)
  where provider_event_key is not null;
create index match_events_timeline_idx
  on app.match_events (fixture_id, period, minute, added_time, sequence_number, id);
create index match_events_player_idx on app.match_events (player_id, fixture_id, id);

create or replace function app_private.validate_match_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.team_id is not null and not exists (
    select 1 from app.fixtures fixture
    where fixture.id = new.fixture_id
      and new.team_id in (fixture.home_team_id, fixture.away_team_id)
  ) then
    raise exception using errcode = '23514', message = 'EVENT_TEAM_NOT_IN_FIXTURE';
  end if;

  if tg_op = 'UPDATE' and (
    new.provider_updated_at < old.provider_updated_at
    or (new.provider_updated_at = old.provider_updated_at and new.source_sequence < old.source_sequence)
  ) then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_match_event()
  from public, anon, authenticated, service_role;
grant execute on function app_private.validate_match_event() to postgres;
create trigger match_events_validate before insert or update on app.match_events
for each row execute function app_private.validate_match_event();

create or replace function app_private.protect_provider_freshness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.provider_updated_at < old.provider_updated_at
    or (
      new.provider_updated_at = old.provider_updated_at
      and new.source_sequence < old.source_sequence
    )
  then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;
  return new;
end;
$$;

revoke all on function app_private.protect_provider_freshness()
  from public, anon, authenticated, service_role;
grant execute on function app_private.protect_provider_freshness() to postgres;

create trigger lineups_protect_freshness before update on app.lineups
for each row execute function app_private.protect_provider_freshness();

create table app.statistic_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  display_name text not null,
  value_type app.statistic_value_type not null,
  unit text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint statistic_definitions_code_key unique (code),
  constraint statistic_definitions_code_check check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint statistic_definitions_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 2 and 100
  ),
  constraint statistic_definitions_unit_check check (
    unit is null or unit in ('count', 'percent', 'seconds', 'minutes')
  ),
  constraint statistic_definitions_display_order_check check (display_order between 0 and 10000)
);

insert into app.statistic_definitions (code, display_name, value_type, unit, display_order)
values
  ('possession', 'Possession', 'percentage', 'percent', 10),
  ('shots', 'Shots', 'integer', 'count', 20),
  ('shots_on_target', 'Shots on target', 'integer', 'count', 30),
  ('corners', 'Corners', 'integer', 'count', 40),
  ('fouls', 'Fouls', 'integer', 'count', 50),
  ('offsides', 'Offsides', 'integer', 'count', 60),
  ('saves', 'Saves', 'integer', 'count', 70),
  ('passes', 'Passes', 'integer', 'count', 80),
  ('pass_accuracy', 'Pass accuracy', 'percentage', 'percent', 90)
on conflict (code) do nothing;

create table app.fixture_team_statistics (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references app.fixtures(id) on delete cascade,
  team_id uuid not null references app.teams(id) on delete restrict,
  statistic_definition_id uuid not null references app.statistic_definitions(id) on delete restrict,
  numeric_value numeric(14, 4) not null,
  display_value text,
  provider_updated_at timestamptz not null,
  source_sequence bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fixture_team_statistics_key unique (fixture_id, team_id, statistic_definition_id),
  constraint fixture_team_statistics_value_check check (numeric_value >= 0),
  constraint fixture_team_statistics_display_value_check check (
    display_value is null or char_length(display_value) between 1 and 60
  ),
  constraint fixture_team_statistics_source_sequence_check check (source_sequence >= 0)
);

create index fixture_team_statistics_fixture_idx
  on app.fixture_team_statistics (fixture_id, statistic_definition_id, team_id);
create trigger fixture_team_statistics_validate_fixture_team
before insert or update on app.fixture_team_statistics
for each row execute function app_private.validate_fixture_team();
create trigger fixture_team_statistics_protect_freshness
before update on app.fixture_team_statistics
for each row execute function app_private.protect_provider_freshness();

create table app.standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references app.competitions(id) on delete restrict,
  season_id uuid not null references app.seasons(id) on delete cascade,
  group_key text not null default '',
  table_type text not null default 'overall',
  team_id uuid not null references app.teams(id) on delete restrict,
  rank integer not null,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_difference integer generated always as (goals_for - goals_against) stored,
  points integer not null default 0,
  form text,
  qualification_code text,
  provider_updated_at timestamptz not null,
  source_sequence bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint standings_identity_key unique (season_id, group_key, table_type, team_id),
  constraint standings_rank_key unique (season_id, group_key, table_type, rank),
  constraint standings_group_key_check check (group_key ~ '^[A-Za-z0-9._-]{0,80}$'),
  constraint standings_table_type_check check (table_type in ('overall', 'home', 'away', 'group')),
  constraint standings_rank_check check (rank between 1 and 1000),
  constraint standings_counts_check check (
    played >= 0 and won >= 0 and drawn >= 0 and lost >= 0
    and won + drawn + lost <= played
    and goals_for >= 0 and goals_against >= 0 and points >= 0
  ),
  constraint standings_form_check check (form is null or form ~ '^[WDL]{1,10}$'),
  constraint standings_qualification_check check (
    qualification_code is null or qualification_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint standings_source_sequence_check check (source_sequence >= 0)
);

create index standings_order_idx
  on app.standings (season_id, group_key, table_type, rank, team_id);
create index standings_team_idx on app.standings (team_id, season_id, table_type, id);

create or replace function app_private.validate_standing()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.seasons season
    where season.id = new.season_id and season.competition_id = new.competition_id
  ) then
    raise exception using errcode = '23514', message = 'INVALID_STANDING_SEASON';
  end if;

  if tg_op = 'UPDATE' and (
    new.provider_updated_at < old.provider_updated_at
    or (new.provider_updated_at = old.provider_updated_at and new.source_sequence < old.source_sequence)
  ) then
    raise exception using errcode = 'P0001', message = 'STALE_UPDATE';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_standing()
  from public, anon, authenticated, service_role;
grant execute on function app_private.validate_standing() to postgres;
create trigger standings_validate before insert or update on app.standings
for each row execute function app_private.validate_standing();

create table app.player_availability (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references app.players(id) on delete cascade,
  team_id uuid references app.teams(id) on delete set null,
  status app.availability_status not null,
  reason text,
  starts_on date not null,
  expected_return_on date,
  ends_on date,
  provider_updated_at timestamptz not null,
  source_sequence bigint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint player_availability_reason_check check (
    reason is null or (reason = btrim(reason) and char_length(reason) between 1 and 500)
  ),
  constraint player_availability_date_check check (
    (expected_return_on is null or expected_return_on >= starts_on)
    and (ends_on is null or ends_on >= starts_on)
  ),
  constraint player_availability_source_sequence_check check (source_sequence >= 0)
);

create index player_availability_current_idx
  on app.player_availability (player_id, active, starts_on desc, id);
create index player_availability_team_idx
  on app.player_availability (team_id, active, starts_on desc, id);
create trigger player_availability_protect_freshness
before update on app.player_availability
for each row execute function app_private.protect_provider_freshness();

create table app_private.football_providers (
  name text primary key,
  display_name text not null,
  active boolean not null default true,
  configuration_version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_providers_name_check check (name ~ '^[a-z][a-z0-9_-]{1,63}$'),
  constraint football_providers_display_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 2 and 100
  ),
  constraint football_providers_configuration_version_check check (configuration_version >= 1)
);

insert into app_private.football_providers (name, display_name)
values ('fixture', 'Deterministic fixture provider')
on conflict (name) do nothing;

create table app_private.football_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null references app_private.football_providers(name) on delete restrict,
  entity_type app_private.football_entity_type not null,
  external_id text not null,
  internal_entity_id uuid not null,
  source_version text,
  last_seen_at timestamptz not null,
  active boolean not null default true,
  manually_corrected boolean not null default false,
  correction_reason text,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_provider_mappings_external_key unique (provider_name, entity_type, external_id),
  constraint football_provider_mappings_internal_key unique (provider_name, entity_type, internal_entity_id),
  constraint football_provider_mappings_external_id_check check (
    external_id = btrim(external_id) and char_length(external_id) between 1 and 200
  ),
  constraint football_provider_mappings_source_version_check check (
    source_version is null or char_length(source_version) between 1 and 160
  ),
  constraint football_provider_mappings_correction_check check (
    (
      not manually_corrected
      and correction_reason is null
      and corrected_by is null
      and corrected_at is null
    )
    or (
      manually_corrected
      and correction_reason is not null
      and corrected_by is not null
      and corrected_at is not null
    )
  ),
  constraint football_provider_mappings_correction_reason_check check (
    correction_reason is null
    or (correction_reason = btrim(correction_reason) and char_length(correction_reason) between 10 and 500)
  )
);

create index football_provider_mappings_internal_lookup_idx
  on app_private.football_provider_mappings (entity_type, internal_entity_id, provider_name)
  where active;
create index football_provider_mappings_last_seen_idx
  on app_private.football_provider_mappings (provider_name, entity_type, last_seen_at, id)
  where active;

create or replace function app_private.validate_provider_mapping_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_exists boolean := false;
begin
  case new.entity_type
    when 'country' then select exists(select 1 from app.countries where id = new.internal_entity_id) into target_exists;
    when 'competition' then select exists(select 1 from app.competitions where id = new.internal_entity_id) into target_exists;
    when 'season' then select exists(select 1 from app.seasons where id = new.internal_entity_id) into target_exists;
    when 'round' then select exists(select 1 from app.rounds where id = new.internal_entity_id) into target_exists;
    when 'venue' then select exists(select 1 from app.venues where id = new.internal_entity_id) into target_exists;
    when 'team' then select exists(select 1 from app.teams where id = new.internal_entity_id) into target_exists;
    when 'player' then select exists(select 1 from app.players where id = new.internal_entity_id) into target_exists;
    when 'fixture' then select exists(select 1 from app.fixtures where id = new.internal_entity_id) into target_exists;
    when 'event' then select exists(select 1 from app.match_events where id = new.internal_entity_id) into target_exists;
  end case;

  if not target_exists then
    raise exception using errcode = '23503', message = 'MAPPING_TARGET_NOT_FOUND';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_provider_mapping_target()
  from public, anon, authenticated, service_role;
grant execute on function app_private.validate_provider_mapping_target() to postgres;
create trigger football_provider_mappings_validate_target
before insert or update on app_private.football_provider_mappings
for each row execute function app_private.validate_provider_mapping_target();

create table app_private.football_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null references app_private.football_providers(name) on delete restrict,
  job_type app_private.ingestion_job_type not null,
  target_scope jsonb not null default '{}'::jsonb,
  status app_private.ingestion_run_status not null default 'pending',
  checkpoint jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  records_fetched integer not null default 0,
  records_validated integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  records_rejected integer not null default 0,
  retry_count integer not null default 0,
  error_code text,
  error_summary text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_ingestion_runs_target_scope_check check (
    jsonb_typeof(target_scope) = 'object' and octet_length(target_scope::text) <= 4096
  ),
  constraint football_ingestion_runs_checkpoint_check check (
    jsonb_typeof(checkpoint) = 'object' and octet_length(checkpoint::text) <= 8192
  ),
  constraint football_ingestion_runs_timestamp_check check (
    completed_at is null or (started_at is not null and completed_at >= started_at)
  ),
  constraint football_ingestion_runs_counts_check check (
    records_fetched >= 0 and records_validated >= 0 and records_inserted >= 0
    and records_updated >= 0 and records_skipped >= 0 and records_rejected >= 0
    and retry_count >= 0
  ),
  constraint football_ingestion_runs_error_code_check check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint football_ingestion_runs_error_summary_check check (
    error_summary is null or char_length(error_summary) between 1 and 1000
  )
);

create index football_ingestion_runs_status_idx
  on app_private.football_ingestion_runs (status, created_at, id);
create index football_ingestion_runs_provider_job_idx
  on app_private.football_ingestion_runs (provider_name, job_type, created_at desc, id);

create table app_private.football_ingestion_rejections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app_private.football_ingestion_runs(id) on delete cascade,
  entity_type app_private.football_entity_type,
  external_id text,
  payload_fingerprint text not null,
  error_code text not null,
  validation_issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint football_ingestion_rejections_fingerprint_check check (
    payload_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint football_ingestion_rejections_external_id_check check (
    external_id is null or char_length(external_id) between 1 and 200
  ),
  constraint football_ingestion_rejections_error_code_check check (
    error_code ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint football_ingestion_rejections_issues_check check (
    jsonb_typeof(validation_issues) = 'array'
    and octet_length(validation_issues::text) <= 8192
  )
);

create unique index football_ingestion_rejections_run_fingerprint_key
  on app_private.football_ingestion_rejections (run_id, payload_fingerprint, error_code);

-- All canonical and operational tables are deny-by-default. Trusted server
-- writes rely on server context; browser roles receive no policies or grants.
alter table app.fixtures enable row level security;
alter table app.fixtures force row level security;
alter table app.lineups enable row level security;
alter table app.lineups force row level security;
alter table app.lineup_players enable row level security;
alter table app.lineup_players force row level security;
alter table app.match_events enable row level security;
alter table app.match_events force row level security;
alter table app.statistic_definitions enable row level security;
alter table app.statistic_definitions force row level security;
alter table app.fixture_team_statistics enable row level security;
alter table app.fixture_team_statistics force row level security;
alter table app.standings enable row level security;
alter table app.standings force row level security;
alter table app.player_availability enable row level security;
alter table app.player_availability force row level security;
alter table app_private.football_providers enable row level security;
alter table app_private.football_providers force row level security;
alter table app_private.football_provider_mappings enable row level security;
alter table app_private.football_provider_mappings force row level security;
alter table app_private.football_ingestion_runs enable row level security;
alter table app_private.football_ingestion_runs force row level security;
alter table app_private.football_ingestion_rejections enable row level security;
alter table app_private.football_ingestion_rejections force row level security;

create trigger fixtures_set_updated_at before update on app.fixtures
for each row execute function app_private.set_updated_at();
create trigger lineups_set_updated_at before update on app.lineups
for each row execute function app_private.set_updated_at();
create trigger lineup_players_set_updated_at before update on app.lineup_players
for each row execute function app_private.set_updated_at();
create trigger match_events_set_updated_at before update on app.match_events
for each row execute function app_private.set_updated_at();
create trigger statistic_definitions_set_updated_at before update on app.statistic_definitions
for each row execute function app_private.set_updated_at();
create trigger fixture_team_statistics_set_updated_at before update on app.fixture_team_statistics
for each row execute function app_private.set_updated_at();
create trigger standings_set_updated_at before update on app.standings
for each row execute function app_private.set_updated_at();
create trigger player_availability_set_updated_at before update on app.player_availability
for each row execute function app_private.set_updated_at();
create trigger football_providers_set_updated_at before update on app_private.football_providers
for each row execute function app_private.set_updated_at();
create trigger football_provider_mappings_set_updated_at before update on app_private.football_provider_mappings
for each row execute function app_private.set_updated_at();
create trigger football_ingestion_runs_set_updated_at before update on app_private.football_ingestion_runs
for each row execute function app_private.set_updated_at();
