-- BotolaGO Production V2
-- Pépites, migration 4 of the v1 sequence: the ranking engine.
-- docs/engineering/PEPITES_ARCHITECTURE.md §3.4-3.6 and §4.
--
-- A run ranks the under-23 players of a season as of a round:
--
--   1. gather   copies every input the run uses into three snapshot tables
--               (players, appearances, team fixtures), then seals them;
--   2. score    computes every player's figures, percentiles and score from
--               that snapshot only, with the run's methodology, into
--               app.pepites_player_scores, then seals them.
--
-- A later correction to a match or a date of birth therefore changes future
-- runs, never a past one, and app_private.pepites_replay(run) recomputes a
-- stored run from its snapshot and must find exactly the stored rows.
--
-- Methodology v1 (every number is a parameter in its row):
--
--   pool         weekly: an active membership in a team of the season, born
--                after 1 July (season start year - 23); season_final: any
--                season minutes, same age rule, team = most minutes
--   eligible     minutes >= max(180, 0.30 x 90 x team matches); season_final
--                600
--   rating       average provider rating over 20+ minute appearances; null
--                under 3 rated appearances
--   form         average of the last 6 of those
--   contribution FWD/MID goals+assists per 90; DEF clean sheets per 90; GK
--                mean of the saves-per-90 and clean-sheets-per-90
--                percentiles; each against every player of the position
--                group above the floor, any age; null under 8 of them
--   clean sheet  the team conceded 0 (final score) and he played 60+
--                minutes, goalkeepers and defenders; unknown score: unknown
--   progression  minutes share in the last 3 rounds minus the share before;
--                season_final: second half minus first half; null with
--                fewer than 3 earlier rounds
--   percentile   mid-rank: 100 x (below + 0.5 x equal) / n, over non-null
--   score        sum(weight x P) / sum(weights present); unranked under 0.50
--                of the weight; ties by exact score, minutes, rating, id
--
-- Which matches count: a weekly run takes finished fixtures finalised before
-- its cutoff; a season_final run takes the finished fixtures of a completed
-- season. The 2024-25 and 2025-26 fixtures were backfilled and carry no
-- finalized_at (240 each, checked on production 2026-09-26), so requiring it
-- there would rank nobody.

-- ---------------------------------------------------------------------------
-- Methodologies
-- ---------------------------------------------------------------------------
create table app.pepites_methodologies (
  version text primary key,
  engine_function text not null,
  params jsonb not null,
  description_fr text not null,
  description_ar text not null,
  created_at timestamptz not null default statement_timestamp(),
  frozen_at timestamptz,
  constraint pepites_methodologies_version_check check (version ~ '^v[0-9]{1,3}$'),
  constraint pepites_methodologies_engine_check check (engine_function in ('pepites_score_v1')),
  constraint pepites_methodologies_params_check check (jsonb_typeof(params) = 'object')
);

comment on table app.pepites_methodologies is
  'Versioned ranking methods. Frozen by the first run that uses one: after that no update or delete. A change of weight, floor or logic is a new version.';

alter table app.pepites_methodologies enable row level security;
alter table app.pepites_methodologies force row level security;
revoke all on table app.pepites_methodologies from public, anon, authenticated, service_role;

create function app_private.pepites_methodologies_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using errcode = '55000', message = 'PEPITES_METHODOLOGY_FROZEN';
  end if;
  if old.frozen_at is not null
    or (new.version, new.engine_function, new.params, new.description_fr, new.description_ar,
        new.created_at)
      is distinct from (old.version, old.engine_function, old.params, old.description_fr,
        old.description_ar, old.created_at)
  then
    raise exception using errcode = '55000', message = 'PEPITES_METHODOLOGY_FROZEN';
  end if;
  return new;
end;
$$;

create trigger pepites_methodologies_guard
before update or delete on app.pepites_methodologies
for each row execute function app_private.pepites_methodologies_guard();
create trigger pepites_methodologies_no_truncate
before truncate on app.pepites_methodologies
for each statement execute function app_private.pepites_methodologies_guard();

insert into app.pepites_methodologies (version, engine_function, params, description_fr, description_ar)
values (
  'v1',
  'pepites_score_v1',
  '{
    "age_limit": 23,
    "weights": {"rating": 0.30, "form": 0.20, "contribution": 0.20, "progression": 0.15, "minutes": 0.15},
    "min_weight_sum": 0.50,
    "minutes_floor": {"absolute": 180, "share": 0.30},
    "season_final_minutes": 600,
    "rating_min_minutes": 20,
    "min_rated_appearances": 3,
    "form_window": 6,
    "clean_sheet_min_minutes": 60,
    "contribution_min_reference": 8,
    "progression_recent_rounds": 3,
    "progression_min_earlier_rounds": 3,
    "first_edition_round": 3,
    "min_eligible_for_edition": 10
  }'::jsonb,
  'Classement des joueurs de Botola Pro de moins de 23 ans : note, forme, contribution (buts et passes décisives, clean sheets, arrêts), progression et temps de jeu, comparés en percentiles.',
  'ترتيب لاعبي البطولة الاحترافية دون 23 سنة: التنقيط، الجاهزية، المساهمة (الأهداف والتمريرات الحاسمة، الشباك النظيفة، التصديات)، التطور ودقائق اللعب، مقارنة بالنسب المئوية.'
);

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------
create table app.pepites_runs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references app.seasons(id) on delete restrict,
  kind text not null,
  as_of_round_number integer not null,
  methodology_version text not null references app.pepites_methodologies(version) on delete restrict,
  revision integer not null,
  input_cutoff_at timestamptz not null,
  input_fingerprint text,
  status text not null default 'running',
  attempt integer not null default 1,
  eligible_count integer,
  ranked_count integer,
  activated_at timestamptz,
  started_at timestamptz not null default statement_timestamp(),
  finished_at timestamptz,
  error text,
  constraint pepites_runs_identity_key unique (season_id, kind, as_of_round_number, methodology_version, revision),
  constraint pepites_runs_kind_check check (kind in ('weekly', 'season_final')),
  constraint pepites_runs_round_check check (as_of_round_number between 1 and 60),
  constraint pepites_runs_revision_check check (revision >= 1 and attempt >= 1),
  constraint pepites_runs_status_check check (status in ('running', 'succeeded', 'failed')),
  constraint pepites_runs_finished_check check (
    (status = 'running') = (finished_at is null)
    and (status <> 'succeeded' or (input_fingerprint is not null and eligible_count is not null))
    and (status <> 'failed' or error is not null)
    and (activated_at is null or status = 'succeeded')
  ),
  constraint pepites_runs_fingerprint_check check (
    input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint pepites_runs_error_check check (error is null or char_length(error) <= 2000)
);

comment on table app.pepites_runs is
  'One ranking computation. running -> succeeded | failed; after that only activated_at may be set, once. Its inputs are in app_private.pepites_run_* and its results in app.pepites_player_scores, both sealed when it finishes.';

create index pepites_runs_season_idx
  on app.pepites_runs (season_id, kind, as_of_round_number desc, revision desc);

alter table app.pepites_runs enable row level security;
alter table app.pepites_runs force row level security;
revoke all on table app.pepites_runs from public, anon, authenticated, service_role;

create function app_private.pepites_runs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_SEALED';
  end if;
  if (new.id, new.season_id, new.kind, new.as_of_round_number, new.methodology_version,
      new.revision, new.input_cutoff_at, new.started_at)
    is distinct from (old.id, old.season_id, old.kind, old.as_of_round_number,
      old.methodology_version, old.revision, old.input_cutoff_at, old.started_at)
  then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_SEALED';
  end if;
  if old.status = 'running' then
    if new.status not in ('running', 'succeeded', 'failed') or new.activated_at is not null then
      raise exception using errcode = '55000', message = 'PEPITES_RUN_SEALED';
    end if;
    return new;
  end if;
  -- Finished: only activated_at, once, from null.
  if old.activated_at is null and new.activated_at is not null
    and (pg_catalog.to_jsonb(new) - 'activated_at') = (pg_catalog.to_jsonb(old) - 'activated_at')
  then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'PEPITES_RUN_SEALED';
end;
$$;

create trigger pepites_runs_guard
before update or delete on app.pepites_runs
for each row execute function app_private.pepites_runs_guard();
create trigger pepites_runs_no_truncate
before truncate on app.pepites_runs
for each statement execute function app_private.pepites_runs_guard();

-- ---------------------------------------------------------------------------
-- Snapshot tables
-- ---------------------------------------------------------------------------
create table app_private.pepites_run_players (
  run_id uuid not null references app.pepites_runs(id) on delete restrict,
  player_id uuid not null,
  date_of_birth date,
  position_group text not null,
  team_id uuid,
  membership_id uuid,
  in_pool boolean not null,
  primary key (run_id, player_id),
  constraint pepites_run_players_position_check check (position_group in ('GK', 'DEF', 'MID', 'FWD'))
);

create table app_private.pepites_run_appearances (
  run_id uuid not null references app.pepites_runs(id) on delete restrict,
  player_id uuid not null,
  fixture_id uuid not null,
  team_id uuid not null,
  round_number integer not null,
  kickoff_at timestamptz not null,
  minutes integer not null,
  started boolean not null,
  goals integer,
  assists integer,
  saves integer,
  rating numeric,
  team_conceded integer,
  primary key (run_id, player_id, fixture_id)
);

create table app_private.pepites_run_team_fixtures (
  run_id uuid not null references app.pepites_runs(id) on delete restrict,
  team_id uuid not null,
  fixture_id uuid not null,
  round_number integer not null,
  primary key (run_id, team_id, fixture_id)
);

comment on table app_private.pepites_run_players is
  'Snapshot: every player a run considered, with the attributes it used. Written while the run is running, sealed after.';
comment on table app_private.pepites_run_appearances is
  'Snapshot: every appearance of the season up to the run''s cutoff, all ages. Null means the source could not say. Sealed after the run.';
comment on table app_private.pepites_run_team_fixtures is
  'Snapshot: each team''s counted matches, for minutes shares. Sealed after the run.';

alter table app_private.pepites_run_players enable row level security;
alter table app_private.pepites_run_players force row level security;
alter table app_private.pepites_run_appearances enable row level security;
alter table app_private.pepites_run_appearances force row level security;
alter table app_private.pepites_run_team_fixtures enable row level security;
alter table app_private.pepites_run_team_fixtures force row level security;
revoke all on table app_private.pepites_run_players, app_private.pepites_run_appearances,
  app_private.pepites_run_team_fixtures from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scores
-- ---------------------------------------------------------------------------
create table app.pepites_player_scores (
  run_id uuid not null references app.pepites_runs(id) on delete restrict,
  player_id uuid not null references app.players(id) on delete restrict,
  team_id uuid,
  position_group text not null,
  age_years integer,
  apps integer not null,
  starts integer not null,
  minutes integer not null,
  goals integer not null,
  assists integer not null,
  saves integer,
  clean_sheets integer,
  rating_avg numeric(6,4),
  rating_n integer not null,
  form_avg numeric(6,4),
  eligible boolean not null,
  per90 jsonb not null,
  percentiles jsonb not null,
  components jsonb not null,
  flags text[] not null,
  score_exact numeric(7,4),
  score smallint,
  rank integer,
  rank_in_position integer,
  primary key (run_id, player_id),
  constraint pepites_player_scores_score_check check (
    score is null or (score between 0 and 100 and score_exact between 0 and 100)
  ),
  constraint pepites_player_scores_rank_check check (
    (rank is null) = (score is null) and (rank is null or (rank >= 1 and rank_in_position >= 1))
  ),
  constraint pepites_player_scores_position_check check (position_group in ('GK', 'DEF', 'MID', 'FWD'))
);

comment on table app.pepites_player_scores is
  'One row per pool player of a run: figures, percentiles (unrounded), score and rank. Written while the run is running; sealed after, so a succeeded run''s scores never change.';

create index pepites_player_scores_rank_idx
  on app.pepites_player_scores (run_id, rank) where rank is not null;
create index pepites_player_scores_player_idx
  on app.pepites_player_scores (player_id, run_id);

alter table app.pepites_player_scores enable row level security;
alter table app.pepites_player_scores force row level security;
revoke all on table app.pepites_player_scores from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sealing: rows of a run can be written only while it is running
-- ---------------------------------------------------------------------------
create function app_private.pepites_run_rows_sealed()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  if tg_op = 'TRUNCATE' then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_SEALED';
  end if;
  v_run_id := case when tg_op = 'DELETE' then old.run_id else new.run_id end;
  if tg_op = 'UPDATE' and new.run_id is distinct from old.run_id then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_SEALED';
  end if;
  if not exists (
    select 1 from app.pepites_runs run where run.id = v_run_id and run.status = 'running'
  ) then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_SEALED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger pepites_run_players_sealed
before insert or update or delete on app_private.pepites_run_players
for each row execute function app_private.pepites_run_rows_sealed();
create trigger pepites_run_players_no_truncate
before truncate on app_private.pepites_run_players
for each statement execute function app_private.pepites_run_rows_sealed();
create trigger pepites_run_appearances_sealed
before insert or update or delete on app_private.pepites_run_appearances
for each row execute function app_private.pepites_run_rows_sealed();
create trigger pepites_run_appearances_no_truncate
before truncate on app_private.pepites_run_appearances
for each statement execute function app_private.pepites_run_rows_sealed();
create trigger pepites_run_team_fixtures_sealed
before insert or update or delete on app_private.pepites_run_team_fixtures
for each row execute function app_private.pepites_run_rows_sealed();
create trigger pepites_run_team_fixtures_no_truncate
before truncate on app_private.pepites_run_team_fixtures
for each statement execute function app_private.pepites_run_rows_sealed();
create trigger pepites_player_scores_sealed
before insert or update or delete on app.pepites_player_scores
for each row execute function app_private.pepites_run_rows_sealed();
create trigger pepites_player_scores_no_truncate
before truncate on app.pepites_player_scores
for each statement execute function app_private.pepites_run_rows_sealed();

-- ---------------------------------------------------------------------------
-- Small rules, as functions so they can be tested on their own
-- ---------------------------------------------------------------------------
-- Mid-rank percentile of p_value among the non-null p_values: ties share one
-- value. Null for a null value or an empty set.
create function app_private.pepites_percentile(p_value numeric, p_values numeric[])
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or count(v) = 0 then null
    else round(
      100 * (count(v) filter (where v < p_value) + 0.5 * count(v) filter (where v = p_value))
        / count(v),
      4)
  end
  from unnest(p_values) v;
$$;

create function app_private.pepites_position_group(p_position app.football_position)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_position
    when 'goalkeeper' then 'GK'
    when 'defender' then 'DEF'
    when 'midfielder' then 'MID'
    else 'FWD'
  end;
$$;

-- The oldest date of birth that is too old: born after this day is in.
create function app_private.pepites_birth_cutoff(p_season_id uuid, p_age_limit integer)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select make_date(extract(year from season.starts_on)::integer - p_age_limit, 7, 1)
  from app.seasons season
  where season.id = p_season_id;
$$;

create function app_private.pepites_minutes_floor(
  p_params jsonb,
  p_kind text,
  p_team_matches integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'season_final' then (p_params ->> 'season_final_minutes')::integer
    else greatest(
      (p_params #>> '{minutes_floor,absolute}')::integer,
      ceil((p_params #>> '{minutes_floor,share}')::numeric * 90 * coalesce(p_team_matches, 0))::integer
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- Sources: what a run would gather, read from the live tables
-- ---------------------------------------------------------------------------
-- The fixtures a run counts, per team.
create function app_private.pepites_source_team_fixtures(
  p_season_id uuid,
  p_kind text,
  p_round integer,
  p_cutoff timestamptz
)
returns table (team_id uuid, fixture_id uuid, round_number integer, kickoff_at timestamptz,
  home boolean, team_conceded integer)
language sql
stable
security definer
set search_path = ''
as $$
  select side.team_id, fixture.id, round.round_number, fixture.kickoff_at, side.home,
    case when side.home then fixture.away_score else fixture.home_score end
  from app.fixtures fixture
  join app.rounds round on round.id = fixture.round_id
  cross join lateral (values
    (fixture.home_team_id, true), (fixture.away_team_id, false)
  ) side(team_id, home)
  where fixture.season_id = p_season_id
    and fixture.status = 'finished'
    and round.round_number <= p_round
    and (
      (p_kind = 'weekly' and fixture.finalized_at is not null and fixture.finalized_at < p_cutoff)
      or (p_kind = 'season_final' and fixture.kickoff_at < p_cutoff)
    );
$$;

create function app_private.pepites_source_appearances(
  p_season_id uuid,
  p_kind text,
  p_round integer,
  p_cutoff timestamptz
)
returns table (player_id uuid, fixture_id uuid, team_id uuid, round_number integer,
  kickoff_at timestamptz, minutes integer, started boolean, goals integer, assists integer,
  saves integer, rating numeric, team_conceded integer)
language sql
stable
security definer
set search_path = ''
as $$
  select performance.player_id, performance.fixture_id, performance.team_id, counted.round_number,
    counted.kickoff_at, performance.minutes, performance.started, performance.goals,
    performance.assists, performance.saves, performance.provider_rating, counted.team_conceded
  from app.player_fixture_performances performance
  join app_private.pepites_source_team_fixtures(p_season_id, p_kind, p_round, p_cutoff) counted
    on counted.fixture_id = performance.fixture_id and counted.team_id = performance.team_id
  where performance.football_season_id = p_season_id
    and performance.active
    and performance.minutes > 0;
$$;

-- Every player with an appearance, plus (weekly) every player in a squad of
-- the season. Pool: the age rule, and for weekly runs an active membership.
create function app_private.pepites_source_players(
  p_season_id uuid,
  p_kind text,
  p_round integer,
  p_cutoff timestamptz,
  p_age_limit integer
)
returns table (player_id uuid, date_of_birth date, position_group text, team_id uuid,
  membership_id uuid, in_pool boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with appeared as (
    select appearance.player_id, appearance.team_id, sum(appearance.minutes) as minutes,
      max(appearance.kickoff_at) as last_kickoff
    from app_private.pepites_source_appearances(p_season_id, p_kind, p_round, p_cutoff) appearance
    group by appearance.player_id, appearance.team_id
  ),
  main_team as (
    select distinct on (appeared.player_id) appeared.player_id, appeared.team_id
    from appeared
    order by appeared.player_id, appeared.minutes desc, appeared.last_kickoff desc, appeared.team_id
  ),
  membership as (
    -- Valid on the cutoff's day in Morocco, as the membership read path
    -- counts validity: a future-dated squad place, or one that ended, does
    -- not put the player in this run's pool under that team.
    select distinct on (member.player_id) member.player_id, member.team_id, member.id
    from app.team_memberships member
    where p_kind = 'weekly' and member.season_id = p_season_id and member.active
      and member.valid_from <= (p_cutoff at time zone 'Africa/Casablanca')::date
      and (member.valid_to is null
        or member.valid_to >= (p_cutoff at time zone 'Africa/Casablanca')::date)
    order by member.player_id, member.valid_from desc, member.id
  ),
  candidates as (
    select main_team.player_id from main_team
    union
    select membership.player_id from membership
  )
  select player.id, player.date_of_birth, app_private.pepites_position_group(player.position),
    coalesce(membership.team_id, main_team.team_id), membership.id,
    player.date_of_birth is not null
      and player.date_of_birth > app_private.pepites_birth_cutoff(p_season_id, p_age_limit)
      and (p_kind = 'season_final' or membership.id is not null)
  from candidates
  join app.players player on player.id = candidates.player_id
  left join membership on membership.player_id = candidates.player_id
  left join main_team on main_team.player_id = candidates.player_id;
$$;

-- The fingerprint of the inputs a run would gather now. Rows are rendered and
-- ordered the same way as app_private.pepites_snapshot_fingerprint, so a run
-- gathered from unchanged data has the same fingerprint. Dates and times are
-- rendered without the session's DateStyle or TimeZone, so two sessions agree.
create function app_private.pepites_input_fingerprint(
  p_season_id uuid,
  p_kind text,
  p_round integer,
  p_cutoff timestamptz,
  p_age_limit integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(
    coalesce((select string_agg(
      format('P|%s|%s|%s|%s|%s|%s', source.player_id, to_char(source.date_of_birth, 'YYYY-MM-DD'), source.position_group,
        source.team_id, source.membership_id, source.in_pool), E'\n' order by source.player_id)
      from app_private.pepites_source_players(p_season_id, p_kind, p_round, p_cutoff, p_age_limit) source), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('A|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', source.player_id, source.fixture_id,
        source.team_id, source.round_number, extract(epoch from source.kickoff_at), source.minutes, source.started,
        source.goals, source.assists, source.saves, source.rating, source.team_conceded),
      E'\n' order by source.player_id, source.fixture_id)
      from app_private.pepites_source_appearances(p_season_id, p_kind, p_round, p_cutoff) source), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('T|%s|%s|%s', source.team_id, source.fixture_id, source.round_number),
      E'\n' order by source.team_id, source.fixture_id)
      from app_private.pepites_source_team_fixtures(p_season_id, p_kind, p_round, p_cutoff) source), ''),
    'sha256'), 'hex');
$$;

create function app_private.pepites_snapshot_fingerprint(p_run_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(
    coalesce((select string_agg(
      format('P|%s|%s|%s|%s|%s|%s', snapshot.player_id, to_char(snapshot.date_of_birth, 'YYYY-MM-DD'), snapshot.position_group,
        snapshot.team_id, snapshot.membership_id, snapshot.in_pool), E'\n' order by snapshot.player_id)
      from app_private.pepites_run_players snapshot where snapshot.run_id = p_run_id), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('A|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', snapshot.player_id, snapshot.fixture_id,
        snapshot.team_id, snapshot.round_number, extract(epoch from snapshot.kickoff_at), snapshot.minutes, snapshot.started,
        snapshot.goals, snapshot.assists, snapshot.saves, snapshot.rating, snapshot.team_conceded),
      E'\n' order by snapshot.player_id, snapshot.fixture_id)
      from app_private.pepites_run_appearances snapshot where snapshot.run_id = p_run_id), '')
    || E'\n#\n' ||
    coalesce((select string_agg(
      format('T|%s|%s|%s', snapshot.team_id, snapshot.fixture_id, snapshot.round_number),
      E'\n' order by snapshot.team_id, snapshot.fixture_id)
      from app_private.pepites_run_team_fixtures snapshot where snapshot.run_id = p_run_id), ''),
    'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Gather
-- ---------------------------------------------------------------------------
create function app_private.pepites_gather(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run app.pepites_runs%rowtype;
  v_age_limit integer;
  v_fingerprint text;
begin
  select * into v_run from app.pepites_runs where id = p_run_id;
  if not found or v_run.status <> 'running' then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_NOT_RUNNING';
  end if;
  select (methodology.params ->> 'age_limit')::integer into v_age_limit
  from app.pepites_methodologies methodology where methodology.version = v_run.methodology_version;

  insert into app_private.pepites_run_team_fixtures (run_id, team_id, fixture_id, round_number)
  select p_run_id, source.team_id, source.fixture_id, source.round_number
  from app_private.pepites_source_team_fixtures(v_run.season_id, v_run.kind,
    v_run.as_of_round_number, v_run.input_cutoff_at) source;

  insert into app_private.pepites_run_appearances (
    run_id, player_id, fixture_id, team_id, round_number, kickoff_at, minutes, started,
    goals, assists, saves, rating, team_conceded
  )
  select p_run_id, source.player_id, source.fixture_id, source.team_id, source.round_number,
    source.kickoff_at, source.minutes, source.started, source.goals, source.assists,
    source.saves, source.rating, source.team_conceded
  from app_private.pepites_source_appearances(v_run.season_id, v_run.kind,
    v_run.as_of_round_number, v_run.input_cutoff_at) source;

  insert into app_private.pepites_run_players (
    run_id, player_id, date_of_birth, position_group, team_id, membership_id, in_pool
  )
  select p_run_id, source.player_id, source.date_of_birth, source.position_group,
    source.team_id, source.membership_id, source.in_pool
  from app_private.pepites_source_players(v_run.season_id, v_run.kind,
    v_run.as_of_round_number, v_run.input_cutoff_at, v_age_limit) source;

  v_fingerprint := app_private.pepites_snapshot_fingerprint(p_run_id);
  update app.pepites_runs set input_fingerprint = v_fingerprint where id = p_run_id;
  return v_fingerprint;
end;
$$;

-- ---------------------------------------------------------------------------
-- Score, methodology v1: a pure function of the run's snapshot and params
-- ---------------------------------------------------------------------------
create function app_private.pepites_compute_v1(p_run_id uuid)
returns table (
  player_id uuid, team_id uuid, position_group text, age_years integer,
  apps integer, starts integer, minutes integer, goals integer, assists integer,
  saves integer, clean_sheets integer, rating_avg numeric, rating_n integer, form_avg numeric,
  eligible boolean, per90 jsonb, percentiles jsonb, components jsonb, flags text[],
  score_exact numeric, score smallint, rank integer, rank_in_position integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with run as (
    select run.*, methodology.params
    from app.pepites_runs run
    join app.pepites_methodologies methodology on methodology.version = run.methodology_version
    where run.id = p_run_id
  ),
  prm as (
    select run.kind, run.as_of_round_number as as_of_round, run.input_cutoff_at, run.params,
      (run.params #>> '{weights,rating}')::numeric as w_rating,
      (run.params #>> '{weights,form}')::numeric as w_form,
      (run.params #>> '{weights,contribution}')::numeric as w_contribution,
      (run.params #>> '{weights,progression}')::numeric as w_progression,
      (run.params #>> '{weights,minutes}')::numeric as w_minutes,
      (run.params ->> 'min_weight_sum')::numeric as min_weight_sum,
      (run.params ->> 'rating_min_minutes')::integer as rating_min_minutes,
      (run.params ->> 'min_rated_appearances')::integer as min_rated,
      (run.params ->> 'form_window')::integer as form_window,
      (run.params ->> 'clean_sheet_min_minutes')::integer as cs_min_minutes,
      (run.params ->> 'contribution_min_reference')::integer as min_reference,
      (run.params ->> 'progression_recent_rounds')::integer as recent_rounds,
      (run.params ->> 'progression_min_earlier_rounds')::integer as min_earlier_rounds
    from run
  ),
  team_matches as (
    select tf.team_id, count(*)::integer as matches
    from app_private.pepites_run_team_fixtures tf
    where tf.run_id = p_run_id
    group by tf.team_id
  ),
  last_round as (
    select coalesce(max(tf.round_number), 0) as value
    from app_private.pepites_run_team_fixtures tf where tf.run_id = p_run_id
  ),
  -- Round spans for progression: recent and earlier (weekly), second and
  -- first half (season_final).
  spans as (
    select
      case when prm.kind = 'weekly' then prm.as_of_round - prm.recent_rounds + 1
        else (last_round.value / 2) + 1 end as recent_from,
      case when prm.kind = 'weekly' then prm.as_of_round else last_round.value end as recent_to
    from prm cross join last_round
  ),
  team_spans as (
    select tf.team_id,
      count(*) filter (where tf.round_number between spans.recent_from and spans.recent_to) as recent_matches,
      count(*) filter (where tf.round_number < spans.recent_from) as earlier_matches,
      count(distinct tf.round_number) filter (where tf.round_number < spans.recent_from) as earlier_rounds
    from app_private.pepites_run_team_fixtures tf cross join spans
    where tf.run_id = p_run_id
    group by tf.team_id
  ),
  appearance as (
    select a.*, player.position_group
    from app_private.pepites_run_appearances a
    join app_private.pepites_run_players player
      on player.run_id = a.run_id and player.player_id = a.player_id
    where a.run_id = p_run_id
  ),
  agg as (
    select player.player_id, player.team_id, player.position_group, player.in_pool,
      player.date_of_birth,
      count(a.fixture_id)::integer as apps,
      (count(a.fixture_id) filter (where a.started))::integer as starts,
      coalesce(sum(a.minutes), 0)::integer as minutes,
      coalesce(sum(a.goals), 0)::integer as goals,
      coalesce(sum(a.assists), 0)::integer as assists,
      case when player.position_group = 'GK' then coalesce(sum(a.saves), 0)::integer end as saves,
      bool_or(a.saves is null) filter (where player.position_group = 'GK') as saves_unknown,
      (count(*) filter (where a.minutes >= prm.cs_min_minutes and a.team_conceded = 0))::integer as cs_known,
      coalesce(bool_or(a.minutes >= prm.cs_min_minutes and a.team_conceded is null), false) as cs_unknown,
      round(avg(a.rating) filter (where a.minutes >= prm.rating_min_minutes and a.rating is not null), 4) as rating_avg,
      (count(*) filter (where a.minutes >= prm.rating_min_minutes and a.rating is not null))::integer as rating_n,
      coalesce(sum(a.minutes) filter (where a.round_number between spans.recent_from and spans.recent_to), 0) as recent_minutes,
      coalesce(sum(a.minutes) filter (where a.round_number < spans.recent_from), 0) as earlier_minutes
    from app_private.pepites_run_players player
    cross join prm
    cross join spans
    left join app_private.pepites_run_appearances a
      on a.run_id = player.run_id and a.player_id = player.player_id
    where player.run_id = p_run_id
    group by player.player_id, player.team_id, player.position_group, player.in_pool,
      player.date_of_birth, prm.cs_min_minutes, prm.rating_min_minutes
  ),
  form as (
    select ranked.player_id, round(avg(ranked.rating), 4) as form_avg
    from (
      select a.player_id, a.rating,
        row_number() over (partition by a.player_id order by a.kickoff_at desc, a.fixture_id desc) as n
      from appearance a cross join prm
      where a.minutes >= prm.rating_min_minutes and a.rating is not null
    ) ranked
    cross join prm
    where ranked.n <= prm.form_window
    group by ranked.player_id
  ),
  figures as (
    select agg.*,
      case when agg.position_group in ('GK', 'DEF') and not agg.cs_unknown then agg.cs_known end as clean_sheets,
      app_private.pepites_minutes_floor(prm.params, prm.kind, team_matches.matches) as floor_minutes,
      agg.minutes >= app_private.pepites_minutes_floor(prm.params, prm.kind, team_matches.matches) as above_floor,
      case when agg.rating_n >= prm.min_rated then agg.rating_avg end as rating_value,
      case when agg.rating_n >= prm.min_rated then form.form_avg end as form_value,
      case when agg.minutes > 0 then round((agg.goals + agg.assists) * 90.0 / agg.minutes, 4) end as ga90,
      case when agg.minutes > 0 and agg.position_group in ('GK', 'DEF') and not agg.cs_unknown
        then round(agg.cs_known * 90.0 / agg.minutes, 4) end as cs90,
      case when agg.minutes > 0 and agg.position_group = 'GK' and not coalesce(agg.saves_unknown, false)
        then round(agg.saves * 90.0 / agg.minutes, 4) end as sv90,
      case when coalesce(team_spans.earlier_rounds, 0) >= prm.min_earlier_rounds
          and coalesce(team_spans.recent_matches, 0) > 0 and coalesce(team_spans.earlier_matches, 0) > 0
        then round(agg.recent_minutes / (90.0 * team_spans.recent_matches)
          - agg.earlier_minutes / (90.0 * team_spans.earlier_matches), 4) end as progression_value,
      coalesce(team_spans.earlier_rounds, 0) >= prm.min_earlier_rounds as progression_possible,
      extract(year from age((prm.input_cutoff_at at time zone 'Africa/Casablanca')::date, agg.date_of_birth))::integer as age_years
    from agg
    cross join prm
    left join form on form.player_id = agg.player_id
    left join team_matches on team_matches.team_id = agg.team_id
    left join team_spans on team_spans.team_id = agg.team_id
  ),
  -- The contribution reference: every player of the group above the floor.
  reference as (
    select figures.position_group,
      count(*)::integer as size,
      array_agg(figures.ga90) as ga90s,
      array_agg(figures.cs90) as cs90s,
      array_agg(figures.sv90) as sv90s
    from figures
    where figures.above_floor
    group by figures.position_group
  ),
  eligible as (
    select figures.*, figures.in_pool and figures.above_floor as is_eligible
    from figures
  ),
  pool_sets as (
    select
      array_agg(eligible.rating_value) filter (where eligible.is_eligible) as ratings,
      array_agg(eligible.form_value) filter (where eligible.is_eligible) as forms,
      array_agg(eligible.progression_value) filter (where eligible.is_eligible) as progressions,
      array_agg(eligible.minutes::numeric) filter (where eligible.is_eligible) as minutes
    from eligible
  ),
  percentiled as (
    select eligible.*,
      coalesce(reference.size, 0) as reference_size,
      case when eligible.is_eligible then app_private.pepites_percentile(eligible.rating_value, pool_sets.ratings) end as p_rating,
      case when eligible.is_eligible then app_private.pepites_percentile(eligible.form_value, pool_sets.forms) end as p_form,
      case when eligible.is_eligible then app_private.pepites_percentile(eligible.progression_value, pool_sets.progressions) end as p_progression,
      case when eligible.is_eligible then app_private.pepites_percentile(eligible.minutes::numeric, pool_sets.minutes) end as p_minutes,
      case
        when not eligible.is_eligible or coalesce(reference.size, 0) < prm.min_reference then null
        when eligible.position_group in ('FWD', 'MID') then app_private.pepites_percentile(eligible.ga90, reference.ga90s)
        when eligible.position_group = 'DEF' then app_private.pepites_percentile(eligible.cs90, reference.cs90s)
        else round((app_private.pepites_percentile(eligible.sv90, reference.sv90s)
          + app_private.pepites_percentile(eligible.cs90, reference.cs90s)) / 2, 4)
      end as p_contribution
    from eligible
    cross join pool_sets
    cross join prm
    left join reference on reference.position_group = eligible.position_group
  ),
  scored as (
    select percentiled.*,
      (case when percentiled.p_rating is not null then prm.w_rating else 0 end
        + case when percentiled.p_form is not null then prm.w_form else 0 end
        + case when percentiled.p_contribution is not null then prm.w_contribution else 0 end
        + case when percentiled.p_progression is not null then prm.w_progression else 0 end
        + case when percentiled.p_minutes is not null then prm.w_minutes else 0 end) as weight_sum,
      (coalesce(prm.w_rating * percentiled.p_rating, 0)
        + coalesce(prm.w_form * percentiled.p_form, 0)
        + coalesce(prm.w_contribution * percentiled.p_contribution, 0)
        + coalesce(prm.w_progression * percentiled.p_progression, 0)
        + coalesce(prm.w_minutes * percentiled.p_minutes, 0)) as weighted
    from percentiled cross join prm
  ),
  final as (
    select scored.*,
      case when scored.is_eligible and scored.weight_sum >= prm.min_weight_sum
        then round(scored.weighted / scored.weight_sum, 4) end as score_exact_value
    from scored cross join prm
  ),
  ranked as (
    select final.*,
      case when final.score_exact_value is not null then
        rank() over (partition by final.score_exact_value is not null
          order by final.score_exact_value desc, final.minutes desc,
            final.rating_value desc nulls last, final.player_id) end as overall_rank,
      case when final.score_exact_value is not null then
        rank() over (partition by final.score_exact_value is not null, final.position_group
          order by final.score_exact_value desc, final.minutes desc,
            final.rating_value desc nulls last, final.player_id) end as position_rank
    from final
  )
  select ranked.player_id, ranked.team_id, ranked.position_group, ranked.age_years,
    ranked.apps, ranked.starts, ranked.minutes, ranked.goals, ranked.assists,
    ranked.saves, ranked.clean_sheets, ranked.rating_avg, ranked.rating_n, ranked.form_value,
    ranked.is_eligible,
    pg_catalog.jsonb_build_object('goalsAssists', ranked.ga90, 'cleanSheets', ranked.cs90,
      'saves', ranked.sv90),
    pg_catalog.jsonb_build_object('rating', ranked.p_rating, 'form', ranked.p_form,
      'contribution', ranked.p_contribution, 'progression', ranked.p_progression,
      'minutes', ranked.p_minutes),
    pg_catalog.jsonb_build_object('rating', ranked.rating_value, 'form', ranked.form_value,
      'progression', ranked.progression_value, 'minutes', ranked.minutes,
      'minutesFloor', ranked.floor_minutes, 'referenceSize', ranked.reference_size,
      'weightSum', round(ranked.weight_sum, 4)),
    array_remove(array[
      case when not ranked.above_floor then 'below_minutes_floor' end,
      case when ranked.rating_n < prm.min_rated then 'low_rating_sample' end,
      case when ranked.is_eligible and ranked.reference_size < prm.min_reference then 'small_reference' end,
      case when ranked.cs_unknown and ranked.position_group in ('GK', 'DEF') then 'unknown_clean_sheet' end,
      case when not ranked.progression_possible then 'no_progression_yet' end,
      case when ranked.is_eligible and ranked.weight_sum < prm.min_weight_sum then 'insufficient_data' end
    ], null),
    ranked.score_exact_value,
    round(ranked.score_exact_value)::smallint,
    ranked.overall_rank::integer,
    ranked.position_rank::integer
  from ranked
  cross join prm
  where ranked.in_pool;
$$;

-- The engine a methodology names.
create function app_private.pepites_compute(p_run_id uuid)
returns setof app.pepites_player_scores
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_engine text;
begin
  select methodology.engine_function into v_engine
  from app.pepites_runs run
  join app.pepites_methodologies methodology on methodology.version = run.methodology_version
  where run.id = p_run_id;
  if v_engine = 'pepites_score_v1' then
    -- Explicit casts: the table's numeric(6,4) and numeric(7,4) typmods must
    -- match for RETURN QUERY.
    return query
      select p_run_id, computed.player_id, computed.team_id, computed.position_group,
        computed.age_years, computed.apps, computed.starts, computed.minutes, computed.goals,
        computed.assists, computed.saves, computed.clean_sheets,
        computed.rating_avg::numeric(6,4), computed.rating_n, computed.form_avg::numeric(6,4),
        computed.eligible, computed.per90, computed.percentiles, computed.components,
        computed.flags, computed.score_exact::numeric(7,4), computed.score, computed.rank,
        computed.rank_in_position
      from app_private.pepites_compute_v1(p_run_id) computed;
  else
    raise exception using errcode = '22023', message = 'PEPITES_ENGINE_UNKNOWN';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A run, start to finish
-- ---------------------------------------------------------------------------
-- Creates the next revision for (season, kind, round, methodology), gathers,
-- scores and seals it. A failure inside marks the run failed with the error
-- (its partial snapshot is rolled back with it) and returns it.
create function app_private.pepites_start_run(
  p_season_id uuid,
  p_kind text,
  p_round integer,
  p_cutoff timestamptz,
  p_methodology text default 'v1'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_revision integer;
  v_eligible integer;
  v_ranked integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pepites_run:' || p_season_id || ':' || p_kind || ':' || p_round, 0)
  );
  update app.pepites_methodologies set frozen_at = statement_timestamp()
  where version = p_methodology and frozen_at is null;

  select coalesce(max(run.revision), 0) + 1 into v_revision
  from app.pepites_runs run
  where run.season_id = p_season_id and run.kind = p_kind
    and run.as_of_round_number = p_round and run.methodology_version = p_methodology;

  insert into app.pepites_runs (season_id, kind, as_of_round_number, methodology_version,
    revision, input_cutoff_at)
  values (p_season_id, p_kind, p_round, p_methodology, v_revision, p_cutoff)
  returning id into v_run_id;

  begin
    perform app_private.pepites_gather(v_run_id);
    insert into app.pepites_player_scores
    select * from app_private.pepites_compute(v_run_id);
    select count(*) filter (where score.eligible), count(*) filter (where score.rank is not null)
    into v_eligible, v_ranked
    from app.pepites_player_scores score where score.run_id = v_run_id;
    update app.pepites_runs
    set status = 'succeeded', finished_at = clock_timestamp(),
      eligible_count = v_eligible, ranked_count = v_ranked
    where id = v_run_id;
  exception when others then
    update app.pepites_runs
    set status = 'failed', finished_at = clock_timestamp(), error = left(sqlerrm, 2000)
    where id = v_run_id;
  end;
  return v_run_id;
end;
$$;

-- The frozen ranking of a completed season, as of its last round.
create function app_private.pepites_run_season_final(
  p_season_id uuid,
  p_methodology text default 'v1'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_round integer;
begin
  select max(round.round_number) into v_last_round
  from app.fixtures fixture
  join app.rounds round on round.id = fixture.round_id
  where fixture.season_id = p_season_id and fixture.status = 'finished';
  if v_last_round is null then
    raise exception using errcode = 'P0002', message = 'PEPITES_SEASON_WITHOUT_MATCHES';
  end if;
  return app_private.pepites_start_run(p_season_id, 'season_final', v_last_round,
    statement_timestamp(), p_methodology);
end;
$$;

-- ---------------------------------------------------------------------------
-- Replay: recompute a stored run from its snapshot and compare
-- ---------------------------------------------------------------------------
create function app_private.pepites_replay(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing integer;
  v_extra integer;
  v_fingerprint_ok boolean;
begin
  if not exists (select 1 from app.pepites_runs where id = p_run_id and status = 'succeeded') then
    raise exception using errcode = '55000', message = 'PEPITES_RUN_NOT_SUCCEEDED';
  end if;
  select count(*) into v_missing from (
    select * from app.pepites_player_scores where run_id = p_run_id
    except
    select * from app_private.pepites_compute(p_run_id)
  ) stored_only;
  select count(*) into v_extra from (
    select * from app_private.pepites_compute(p_run_id)
    except
    select * from app.pepites_player_scores where run_id = p_run_id
  ) computed_only;
  select run.input_fingerprint = app_private.pepites_snapshot_fingerprint(p_run_id)
  into v_fingerprint_ok
  from app.pepites_runs run where run.id = p_run_id;
  return pg_catalog.jsonb_build_object(
    'matches', v_missing = 0 and v_extra = 0 and v_fingerprint_ok,
    'storedOnly', v_missing, 'computedOnly', v_extra, 'snapshotIntact', v_fingerprint_ok
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app_private.pepites_methodologies_guard() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_runs_guard() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_run_rows_sealed() from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_percentile(numeric, numeric[]) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_position_group(app.football_position) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_birth_cutoff(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_minutes_floor(jsonb, text, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_source_team_fixtures(uuid, text, integer, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_source_appearances(uuid, text, integer, timestamptz) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_source_players(uuid, text, integer, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_input_fingerprint(uuid, text, integer, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_snapshot_fingerprint(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_gather(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_compute_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_compute(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_start_run(uuid, text, integer, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_run_season_final(uuid, text) from public, anon, authenticated, service_role;
revoke all on function app_private.pepites_replay(uuid) from public, anon, authenticated, service_role;
