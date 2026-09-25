-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migrations 20260925090000 to 20260925090400: Pronostics (score
-- predictions, BG-0146), parts 1 to 5, installed switched OFF.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now, and
--      pick a quiet moment: no match being played (the live refresh writes
--      fixtures every 15 minutes during matches), and not at minute 12 of an
--      hour (the Fantasy orchestrator). Not while Fantasy gameweek 1 is being
--      locked or scored: that pipeline's first real run needs a quiet database.
--   2. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   3. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, or on a database missing what Pronostics builds on
--     (football, profiles, Fantasy leagues, the account bans of 20260924160000,
--     pg_cron and pgcrypto);
--   * records the five migration files in supabase_migrations.schema_migrations,
--     each whole as statements[1], as the migration promoter records one;
--   * runs them from that record, in order, once each one's sha256 matches the
--     repository file: the SQL that runs is the SQL recorded, and a copy cut
--     short or changed on the way stops the script before anything runs;
--   * checks the result: the seven tables, their row security and that no
--     client reads them directly; every function and who may call it; the two
--     scheduled jobs; the game left OFF; and one real read, as a visitor.
--
-- AFTER IT
--   Nothing is visible: every read answers "not allowed" and the site shows
--   "Bientôt disponible" until the game is switched on, which is a separate,
--   later step (docs/backend/PREDICTIONS_OPERATIONS_RUNBOOK.md, "The switch").
--   The job predictions-score-tick runs every 5 minutes and does nothing while
--   the game is off; predictions-history-prune runs daily at 03:53 UTC.
--
-- LOCKS
--   The new tables point at fixtures, rounds, seasons, competitions, profiles
--   and Fantasy leagues. Creating those links pauses WRITES to those six tables
--   (never reads) until the end of this transaction, which takes seconds. The
--   lock timeout is short, so it gives up rather than queue behind the live
--   site; if it gives up, run it again a few minutes later.
--
-- It does not apply 20260925090500 (the Fantasy league page): that one has its
-- own script, apply-20260925090500-fantasy-league-page-skip-empty.sql, and
-- waits until Fantasy gameweek 1 has been scored.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Preflight: refuse to run twice or on the wrong database
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  object_name text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where version in (
      '20260925090000', '20260925090100', '20260925090200', '20260925090300', '20260925090400'
    )
  ) then
    raise exception 'stop: a Pronostics migration (20260925090000 to 20260925090400) is already recorded as applied';
  end if;
  if to_regclass('app.predictions') is not null then
    raise exception 'stop: app.predictions already exists, but the migration is not recorded -- find out why before going on';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260924160000'
  ) then
    missing := missing || 'migration 20260924160000 (account bans)'::text;
  end if;
  foreach object_name in array array[
    'app.competitions', 'app.seasons', 'app.rounds', 'app.fixtures', 'app.profiles',
    'app.fantasy_seasons', 'app.fantasy_leagues', 'app.fantasy_league_memberships',
    'app_private.user_bans', 'cron.job', 'cron.job_run_details'
  ] loop
    if to_regclass(object_name) is null then
      missing := missing || object_name;
    end if;
  end loop;
  foreach object_name in array array[
    'app_private.fantasy_kickoff_confirmed(timestamp with time zone)',
    'app_private.fantasy_mask_username(text)',
    'app_private.football_language(text)',
    'app_private.football_team_json(uuid, text)',
    'app_private.refuse_banned_actor()',
    'app_private.set_updated_at()',
    'extensions.digest(bytea, text)',
    'extensions.gen_random_bytes(integer)',
    'cron.schedule(text, text, text)'
  ] loop
    if to_regprocedure(object_name) is null then
      missing := missing || object_name;
    end if;
  end loop;
  if to_regtype('app.fixture_status') is null then
    missing := missing || 'type app.fixture_status'::text;
  end if;
  if cardinality(missing) > 0 then
    raise exception 'stop: the database is missing what this update builds on: %', missing;
  end if;

  if exists (
    select 1 from cron.job where jobname in ('predictions-score-tick', 'predictions-history-prune')
  ) then
    raise exception 'stop: a Pronostics scheduled job already exists, but the migration is not recorded -- find out why before going on';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20260925090000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925090000',
  'predictions_schema',
  array[$bg_20260925090000_file$-- BotolaGO Production V2
-- Pronostics (score predictions), part 1 of 6: the tables.
--
-- A player predicts the exact score of Botola Pro matches. Each prediction
-- locks at its own match's kick-off (no journée-wide deadline), is scored 3/1/0
-- once the match is final, and feeds a journée and a season ranking. Leagues are
-- the existing Fantasy leagues: a player without a Fantasy team joins one for
-- Pronostics only through app.prediction_league_members.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).
--
-- Nothing existing changes here. Every table forces RLS and grants nothing to
-- anon, authenticated or service_role: the only way in is through the api
-- functions of the following migrations (security definer, empty search_path,
-- caller checked), and through app_private functions run by pg_cron or by the
-- owner in the SQL editor.

-- ---------------------------------------------------------------------------
-- app.predictions: one row per player per match
-- ---------------------------------------------------------------------------
create table app.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  fixture_id uuid not null references app.fixtures(id) on delete restrict,
  home_goals smallint not null,
  away_goals smallint not null,
  -- The match's teams when the player last saved. The provider can change a
  -- fixture's teams on any refresh; scoring maps goals by team, so a home/away
  -- swap still scores what the player meant and a different match voids it.
  -- A snapshot, not a link: no foreign key.
  home_team_id uuid not null,
  away_team_id uuid not null,
  origin text not null default 'direct',
  -- Server time of the player's last change. Not updated_at: the shared
  -- set_updated_at trigger also moves updated_at when the scoring job writes
  -- points, and the late rule needs the player's own time.
  submitted_at timestamptz not null default statement_timestamp(),
  points smallint,
  result_kind text,
  rule_version smallint,
  scored_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint predictions_fixture_user_key unique (fixture_id, user_id),
  constraint predictions_goals_check check (
    home_goals between 0 and 20 and away_goals between 0 and 20
  ),
  constraint predictions_teams_check check (home_team_id <> away_team_id),
  constraint predictions_origin_check check (origin in ('direct', 'guest_claim')),
  constraint predictions_result_kind_check check (
    result_kind is null or result_kind in ('exact', 'outcome', 'miss', 'void', 'late')
  ),
  constraint predictions_scored_check check (
    (result_kind is null and points is null and rule_version is null and scored_at is null)
    or (result_kind is not null and points is not null and rule_version is not null
      and scored_at is not null and points >= 0 and rule_version >= 1)
  )
);

comment on table app.predictions is
  'One score prediction per player per match (unique fixture_id, user_id). Written only by api.save_predictions / api.claim_guest_predictions (while the match is open) and scored by app_private.predictions_score_pending.';
comment on column app.predictions.submitted_at is
  'Server time of the player''s last change. The scoring job voids (result_kind = late) a prediction submitted at or after the match''s final kick-off.';

create index predictions_user_submitted_idx on app.predictions (user_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- app.prediction_standings: totals and saved rank per journée and per season
-- ---------------------------------------------------------------------------
-- round_id null = the player's season row. Rebuilt from app.predictions by the
-- scoring job (never incremented), then re-ranked. Ranks are saved because
-- leaderboards are read far more often than they change.
create table app.prediction_standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references app.seasons(id) on delete restrict,
  round_id uuid references app.rounds(id) on delete restrict,
  user_id uuid not null references app.profiles(id) on delete cascade,
  points integer not null default 0,
  exact_count integer not null default 0,
  outcome_count integer not null default 0,
  miss_count integer not null default 0,
  void_count integer not null default 0,
  scored_count integer not null default 0,
  predicted_count integer not null default 0,
  rounds_played integer,
  rank integer,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint prediction_standings_scope_key unique nulls not distinct (season_id, round_id, user_id),
  constraint prediction_standings_counts_check check (
    points >= 0 and exact_count >= 0 and outcome_count >= 0 and miss_count >= 0
    and void_count >= 0 and predicted_count >= 0
    and scored_count = exact_count + outcome_count + miss_count
  ),
  constraint prediction_standings_rounds_played_check check (
    (round_id is null) = (rounds_played is not null) and coalesce(rounds_played, 0) >= 0
  ),
  constraint prediction_standings_rank_check check (rank is null or rank >= 1)
);

comment on table app.prediction_standings is
  'Pronostics totals and saved rank per player: one row per journée played (round_id set) and one season row (round_id null). Written only by the scoring job. Tie-break: points, then exact scores, then a shared rank.';

create index prediction_standings_round_rank_idx
  on app.prediction_standings (round_id, rank, id) where round_id is not null;
create index prediction_standings_season_rank_idx
  on app.prediction_standings (season_id, rank, id) where round_id is null;
create index prediction_standings_user_idx on app.prediction_standings (user_id, season_id);

-- ---------------------------------------------------------------------------
-- app.prediction_league_members: Pronostics-only league membership
-- ---------------------------------------------------------------------------
-- One league, two games. A league is still one app.fantasy_leagues row; its
-- Fantasy members stay in app.fantasy_league_memberships (a Fantasy team is
-- required there) and Pronostics-only members live here. Pronostics never
-- writes Fantasy memberships or member_count. Deleting a league (Fantasy's
-- season clean-up script) deletes its rows here.
create table app.prediction_league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references app.fantasy_leagues(id) on delete cascade,
  user_id uuid not null references app.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz not null default statement_timestamp(),
  left_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint prediction_league_members_league_user_key unique (league_id, user_id),
  constraint prediction_league_members_role_check check (role in ('owner', 'member')),
  constraint prediction_league_members_status_check check (status in ('active', 'left')),
  constraint prediction_league_members_left_check check ((status = 'left') = (left_at is not null)),
  constraint prediction_league_members_owner_check check (role <> 'owner' or status = 'active')
);

comment on table app.prediction_league_members is
  'Pronostics-only members of an existing league (no Fantasy team needed). A league''s Pronostics ranking is its active Fantasy members plus these, each person once.';

create index prediction_league_members_user_idx
  on app.prediction_league_members (user_id, status, joined_at desc);

-- ---------------------------------------------------------------------------
-- app_private.prediction_fixture_scoring: what was scored, per match
-- ---------------------------------------------------------------------------
-- One row per match the job has handled. A match is re-scored whenever its
-- current facts (final or not, void, score, teams, kick-off, journée, operator
-- override) differ from this row, which is how provider corrections are caught.
create table app_private.prediction_fixture_scoring (
  fixture_id uuid primary key references app.fixtures(id) on delete restrict,
  season_id uuid not null references app.seasons(id) on delete restrict,
  round_id uuid references app.rounds(id) on delete restrict,
  state text not null,
  result_home smallint,
  result_away smallint,
  fixture_status text not null,
  fixture_kickoff_at timestamptz not null,
  home_team_id uuid not null,
  away_team_id uuid not null,
  override text,
  override_reason text,
  override_at timestamptz,
  rule_version smallint not null,
  revision integer not null default 1,
  predictions_scored integer not null default 0,
  scored_at timestamptz not null default statement_timestamp(),
  -- Set when a scored result changes to a different scored result (a provider
  -- correction); the match card then says "Résultat corrigé".
  corrected_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint prediction_fixture_scoring_state_check check (state in ('scored', 'void', 'unscored')),
  constraint prediction_fixture_scoring_result_check check (
    (state = 'scored') = (result_home is not null and result_away is not null)
  ),
  constraint prediction_fixture_scoring_override_check check (
    (override is null and override_reason is null and override_at is null)
    or (override = 'void' and override_at is not null
      and char_length(override_reason) between 8 and 500)
  ),
  constraint prediction_fixture_scoring_counts_check check (
    rule_version >= 1 and revision >= 1 and predictions_scored >= 0
  )
);

create index prediction_fixture_scoring_round_idx
  on app_private.prediction_fixture_scoring (round_id) where round_id is not null;
create index prediction_fixture_scoring_season_idx
  on app_private.prediction_fixture_scoring (season_id);

-- ---------------------------------------------------------------------------
-- app_private.prediction_settings: the switches (one row)
-- ---------------------------------------------------------------------------
-- mode: off (every function refuses or reports "off", the job idles),
-- testers (only tester_user_ids), public. Changed only through
-- app_private.predictions_configure, run by the owner.
create table app_private.prediction_settings (
  id boolean primary key default true,
  mode text not null default 'off',
  scoring_enabled boolean not null default true,
  tester_user_ids uuid[] not null default '{}',
  -- null: the most recent current season. Set it if a second competition ever
  -- has a current season at the same time.
  competition_id uuid references app.competitions(id) on delete restrict,
  rule_version smallint not null default 1,
  max_items_per_save smallint not null default 16,
  max_claim_items smallint not null default 40,
  updated_at timestamptz not null default statement_timestamp(),
  constraint prediction_settings_singleton check (id),
  constraint prediction_settings_mode_check check (mode in ('off', 'testers', 'public')),
  constraint prediction_settings_limits_check check (
    rule_version >= 1 and max_items_per_save between 1 and 50 and max_claim_items between 1 and 100
  )
);

insert into app_private.prediction_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- app_private.prediction_job_runs: runs that did something, operator actions
-- ---------------------------------------------------------------------------
create table app_private.prediction_job_runs (
  id bigint generated always as identity primary key,
  kind text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  outcome text not null,
  fixtures_processed integer not null default 0,
  predictions_updated integer not null default 0,
  standings_updated integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  error text,
  reason text,
  constraint prediction_job_runs_kind_check check (kind in ('tick', 'operator')),
  constraint prediction_job_runs_outcome_check check (outcome in ('succeeded', 'failed', 'applied')),
  constraint prediction_job_runs_counts_check check (
    fixtures_processed >= 0 and predictions_updated >= 0 and standings_updated >= 0
  ),
  constraint prediction_job_runs_error_check check (error is null or char_length(error) <= 600),
  constraint prediction_job_runs_reason_check check (reason is null or char_length(reason) <= 500)
);

create index prediction_job_runs_started_idx on app_private.prediction_job_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- app_private.prediction_guest_claims: one row per guest-to-account import
-- ---------------------------------------------------------------------------
create table app_private.prediction_guest_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references app.profiles(id) on delete cascade,
  claimed_at timestamptz not null default statement_timestamp(),
  submitted integer not null,
  imported integer not null,
  kept_existing integer not null,
  rejected_started integer not null,
  rejected_invalid integer not null,
  constraint prediction_guest_claims_counts_check check (
    submitted >= 0 and imported >= 0 and kept_existing >= 0
    and rejected_started >= 0 and rejected_invalid >= 0
    and imported + kept_existing + rejected_started + rejected_invalid = submitted
  )
);

create index prediction_guest_claims_claimed_idx on app_private.prediction_guest_claims (claimed_at);
create index prediction_guest_claims_user_idx on app_private.prediction_guest_claims (user_id);

-- ---------------------------------------------------------------------------
-- Access: RLS forced everywhere, nothing granted
-- ---------------------------------------------------------------------------
alter table app.predictions enable row level security;
alter table app.predictions force row level security;
alter table app.prediction_standings enable row level security;
alter table app.prediction_standings force row level security;
alter table app.prediction_league_members enable row level security;
alter table app.prediction_league_members force row level security;
alter table app_private.prediction_fixture_scoring enable row level security;
alter table app_private.prediction_fixture_scoring force row level security;
alter table app_private.prediction_settings enable row level security;
alter table app_private.prediction_settings force row level security;
alter table app_private.prediction_job_runs enable row level security;
alter table app_private.prediction_job_runs force row level security;
alter table app_private.prediction_guest_claims enable row level security;
alter table app_private.prediction_guest_claims force row level security;

revoke all on app.predictions, app.prediction_standings, app.prediction_league_members
from public, anon, authenticated, service_role;
revoke all on app_private.prediction_fixture_scoring, app_private.prediction_settings,
  app_private.prediction_job_runs, app_private.prediction_guest_claims
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger predictions_set_updated_at before update on app.predictions
for each row execute function app_private.set_updated_at();
create trigger prediction_standings_set_updated_at before update on app.prediction_standings
for each row execute function app_private.set_updated_at();
create trigger prediction_league_members_set_updated_at before update on app.prediction_league_members
for each row execute function app_private.set_updated_at();
create trigger prediction_fixture_scoring_set_updated_at before update on app_private.prediction_fixture_scoring
for each row execute function app_private.set_updated_at();
create trigger prediction_settings_set_updated_at before update on app_private.prediction_settings
for each row execute function app_private.set_updated_at();

-- A banned account cannot save, import or join (the scoring job has no acting
-- user, so it is never refused).
create trigger predictions_refuse_banned_actor
before insert or update on app.predictions
for each row execute function app_private.refuse_banned_actor();
create trigger prediction_league_members_refuse_banned_actor
before insert or update on app.prediction_league_members
for each row execute function app_private.refuse_banned_actor();
$bg_20260925090000_file$]
);

-- ---------------------------------------------------------------------------
-- Migration 20260925090100, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925090100',
  'predictions_rules',
  array[$bg_20260925090100_file$-- BotolaGO Production V2
-- Pronostics (score predictions), part 2 of 6: the rules.
--
-- Small, pure or read-only helpers that every later function uses, each taking
-- an explicit "now" so pgTAP can test exact boundaries (the repository's tests
-- never mock the clock). None of them is callable from the API.
--
--   * prediction_points / prediction_result_kind: rule v1, 3 / 1 / 0.
--   * prediction_fixture_open: a match can be predicted only while its status is
--     scheduled or not_started AND the database clock is before its stored
--     kick-off. A provider placeholder kick-off (00:00 UTC, "time not
--     confirmed") therefore locks at the start of match day: always early,
--     never late.
--   * predictions_current_season: the season Pronostics plays.
--   * predictions_access_allowed: the off / testers / public switch.
--   * predictions_current_round: which journée the page opens on.
--   * prediction_round_state: upcoming / in_progress / provisional / completed,
--     derived from the journée's matches (no journée state is stored).
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

-- ---------------------------------------------------------------------------
-- Scoring rule v1
-- ---------------------------------------------------------------------------
create or replace function app_private.prediction_points(
  p_home integer, p_away integer, p_result_home integer, p_result_away integer
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_home = p_result_home and p_away = p_result_away then 3
    when sign(p_home - p_away) = sign(p_result_home - p_result_away) then 1
    else 0
  end;
$$;

comment on function app_private.prediction_points(integer, integer, integer, integer) is
  'Rule v1: exact score 3, right outcome (home win / draw / away win) 1, otherwise 0. Mirrored by src/backend/predictions/scoring.ts; both are tested against the same cases.';

create or replace function app_private.prediction_result_kind(
  p_home integer, p_away integer, p_result_home integer, p_result_away integer
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_home = p_result_home and p_away = p_result_away then 'exact'
    when sign(p_home - p_away) = sign(p_result_home - p_result_away) then 'outcome'
    else 'miss'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The lock
-- ---------------------------------------------------------------------------
create or replace function app_private.prediction_fixture_open(
  p_status app.fixture_status, p_kickoff_at timestamptz, p_now timestamptz
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_status in ('scheduled', 'not_started') and p_now < p_kickoff_at,
    false
  );
$$;

comment on function app_private.prediction_fixture_open(app.fixture_status, timestamptz, timestamptz) is
  'The only definition of "this match can still be predicted": status scheduled/not_started and p_now strictly before the stored kick-off. Every write checks it with statement_timestamp() in the statement that writes.';

-- ---------------------------------------------------------------------------
-- The season and the switch
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_current_season()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select season.id
  from app.seasons season
  cross join app_private.prediction_settings settings
  where settings.id
    and season.is_current
    and (settings.competition_id is null or season.competition_id = settings.competition_id)
  order by season.starts_on desc, season.id desc
  limit 1;
$$;

create or replace function app_private.predictions_access_allowed(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select settings.mode = 'public'
      or (settings.mode = 'testers' and p_user_id is not null
        and p_user_id = any(settings.tester_user_ids))
    from app_private.prediction_settings settings
    where settings.id
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Which journée opens by default
-- ---------------------------------------------------------------------------
-- The journée of the earliest match still open, ignoring
--   * a leftover: a match of an older journée once a later journée has had at
--     least half of its matches kick off (a rescheduled postponement), and
--   * an early bird: a match of a later journée while an earlier journée still
--     has more than half of its matches open (a match brought forward).
-- If nothing qualifies, the journée of the earliest open match; if nothing is
-- open, the journée of the most recent match that kicked off; else the first.
-- Cancelled and abandoned matches are ignored. The Botola calendar moves single
-- matches often (continental fixtures); one moved match must not drag the page
-- to another journée.
create or replace function app_private.predictions_current_round(
  p_season_id uuid, p_now timestamptz
)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with fx as (
    select fixture.round_id, round_row.round_number, fixture.kickoff_at, fixture.status,
      app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, p_now) as is_open,
      (fixture.kickoff_at <= p_now and fixture.status <> 'postponed') as started
    from app.fixtures fixture
    join app.rounds round_row on round_row.id = fixture.round_id
    where fixture.season_id = p_season_id
      and fixture.round_id is not null
      and fixture.status not in ('cancelled', 'abandoned')
  ),
  rounds as (
    select round_id, round_number, count(*) as fixtures,
      count(*) filter (where started) as started_fixtures,
      count(*) filter (where is_open) as open_fixtures
    from fx
    group by round_id, round_number
  ),
  candidate as (
    select fx.round_id
    from fx
    where fx.is_open
      and not exists (
        select 1 from rounds later
        where later.round_number > fx.round_number
          and later.started_fixtures * 2 >= later.fixtures
      )
      and not exists (
        select 1 from rounds earlier
        where earlier.round_number < fx.round_number
          and earlier.open_fixtures * 2 > earlier.fixtures
      )
    order by fx.kickoff_at, fx.round_number
    limit 1
  )
  select coalesce(
    (select round_id from candidate),
    (select fx.round_id from fx where fx.is_open order by fx.kickoff_at, fx.round_number limit 1),
    (select fx.round_id from fx where fx.started order by fx.kickoff_at desc, fx.round_number desc limit 1),
    (select fx.round_id from fx order by fx.round_number, fx.kickoff_at limit 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- A journée's state, derived from its matches
-- ---------------------------------------------------------------------------
--   upcoming     no match has kicked off yet (postponed and void ones aside)
--   completed    every match is final or void
--   provisional  every match is final or void, except postponed ones
--   in_progress  anything else
-- A match is final when status = finished and finalized_at is set; void when
-- cancelled, abandoned, or voided by an operator.
create or replace function app_private.prediction_round_state(
  p_round_id uuid, p_now timestamptz
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with fx as (
    select fixture.status, fixture.kickoff_at,
      (fixture.status = 'finished' and fixture.finalized_at is not null) as is_final,
      -- coalesce: most matches have no scoring row yet, and a null here would
      -- drop them from every count below.
      (fixture.status in ('cancelled', 'abandoned')
        or coalesce(scoring.override = 'void', false)) as is_void
    from app.fixtures fixture
    left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
    where fixture.round_id = p_round_id
  )
  select case
    when count(*) = 0 then 'upcoming'
    when count(*) filter (where is_final or is_void) = count(*) then 'completed'
    when count(*) filter (
      where kickoff_at <= p_now and status <> 'postponed' and not is_void
    ) = 0 then 'upcoming'
    when count(*) filter (where not (is_final or is_void) and status <> 'postponed') = 0
      then 'provisional'
    else 'in_progress'
  end
  from fx;
$$;

-- ---------------------------------------------------------------------------
-- Grants: none to any API role
-- ---------------------------------------------------------------------------
revoke all on function app_private.prediction_points(integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_result_kind(integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_fixture_open(app.fixture_status, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_current_season()
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_access_allowed(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_current_round(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_round_state(uuid, timestamptz)
  from public, anon, authenticated, service_role;
$bg_20260925090100_file$]
);

-- ---------------------------------------------------------------------------
-- Migration 20260925090200, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925090200',
  'predictions_api',
  array[$bg_20260925090200_file$-- BotolaGO Production V2
-- Pronostics (score predictions), part 3 of 6: the functions the app calls.
--
--   api.predictions_round        public   one journée: matches, open/locked state,
--                                          results, the journée switcher
--   api.predictions_leaderboard  public   journée or season ranking, 50 a page
--   api.my_predictions           signed   the caller's predictions and totals
--   api.save_predictions         signed   save up to 16 predictions in one call
--   api.claim_guest_predictions  signed   import predictions made on the phone
--                                          before signing up
--
-- Every function checks the off / testers / public switch itself, so calling it
-- directly gets exactly the rules the app gets. The lock is checked in the same
-- statement that writes, against statement_timestamp(); no function takes a
-- time from the caller. Visitor-callable signatures use pg_catalog types only
-- (anon has no USAGE on schema app; see 20260921120000).
--
-- Error keys: PT401 predictions_unauthenticated, PT403 predictions_unavailable,
-- PT403 account_banned (ban trigger), PT400 predictions_invalid_payload,
-- PT400 validation_failed, PT404 predictions_round_not_found.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

-- ---------------------------------------------------------------------------
-- Internal: resolve a journée of the current season (null = the default one)
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_resolve_round(
  p_season_id uuid, p_round_number integer, p_now timestamptz
)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare target_id uuid;
begin
  if p_season_id is null then
    return null;
  end if;
  if p_round_number is null then
    return app_private.predictions_current_round(p_season_id, p_now);
  end if;
  select round_row.id into target_id
  from app.rounds round_row
  where round_row.season_id = p_season_id and round_row.round_number = p_round_number;
  if not found then
    raise exception using errcode = 'PT404', message = 'predictions_round_not_found';
  end if;
  return target_id;
end;
$$;

revoke all on function app_private.predictions_resolve_round(uuid, integer, timestamptz)
  from public, anon, authenticated, service_role;

-- Internal: validate a list of {fixtureId, home, away[, homeTeamId, awayTeamId]}
create or replace function app_private.predictions_assert_items(p_items jsonb, p_max integer)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and p_max
    or pg_catalog.pg_column_size(p_items) > 16384
  then
    raise exception using errcode = 'PT400', message = 'predictions_invalid_payload';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    -- A missing key makes these tests null, not true: "is distinct from" and
    -- the outer coalesce make anything not proven valid invalid.
    if coalesce(
      jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'fixtureId') is distinct from 'string'
      or (item ->> 'fixtureId') !~ uuid_pattern
      or jsonb_typeof(item -> 'home') is distinct from 'number'
      or (item ->> 'home') !~ '^[0-9]{1,2}$'
      or jsonb_typeof(item -> 'away') is distinct from 'number'
      or (item ->> 'away') !~ '^[0-9]{1,2}$'
      or (item ->> 'home')::integer > 20 or (item ->> 'away')::integer > 20
      or (item ? 'homeTeamId' and ((item ->> 'homeTeamId') is null or (item ->> 'homeTeamId') !~ uuid_pattern))
      or (item ? 'awayTeamId' and ((item ->> 'awayTeamId') is null or (item ->> 'awayTeamId') !~ uuid_pattern)),
      true)
    then
      raise exception using errcode = 'PT400', message = 'predictions_invalid_payload';
    end if;
  end loop;
  if (select count(distinct lower(value ->> 'fixtureId')) from jsonb_array_elements(p_items))
    <> jsonb_array_length(p_items)
  then
    raise exception using errcode = 'PT400', message = 'predictions_invalid_payload';
  end if;
end;
$$;

revoke all on function app_private.predictions_assert_items(jsonb, integer)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- api.predictions_round: one journée, public
-- ---------------------------------------------------------------------------
create or replace function api.predictions_round(
  p_round_number integer default null,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  season app.seasons%rowtype;
  target app.rounds%rowtype;
  target_id uuid;
  fixtures jsonb := '[]'::jsonb;
  rounds jsonb := '[]'::jsonb;
  next_lock timestamptz;
  scoring_version bigint := 0;
  round_state text;
begin
  perform app_private.football_language(p_language);
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    return jsonb_build_object('schemaVersion', 1, 'mode', settings.mode, 'allowed', false,
      'serverTime', now_ts);
  end if;

  select * into season from app.seasons where id = app_private.predictions_current_season();
  if season.id is null then
    return jsonb_build_object('schemaVersion', 1, 'mode', settings.mode, 'allowed', true,
      'serverTime', now_ts, 'season', null, 'round', null,
      'rounds', '[]'::jsonb, 'fixtures', '[]'::jsonb);
  end if;

  target_id := app_private.predictions_resolve_round(season.id, p_round_number, now_ts);
  select * into target from app.rounds where id = target_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'number', round_row.round_number,
      'state', app_private.prediction_round_state(round_row.id, now_ts)
    ) order by round_row.round_number), '[]'::jsonb)
  into rounds
  from app.rounds round_row
  where round_row.season_id = season.id
    and round_row.round_number is not null
    and exists (select 1 from app.fixtures fixture where fixture.round_id = round_row.id);

  if target.id is null then
    return jsonb_build_object('schemaVersion', 1, 'mode', settings.mode, 'allowed', true,
      'serverTime', now_ts, 'season', jsonb_build_object('id', season.id, 'label', season.label),
      'round', null, 'rounds', rounds, 'fixtures', '[]'::jsonb);
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', fixture.id,
      'kickoffAt', fixture.kickoff_at,
      'kickoffConfirmed', app_private.fantasy_kickoff_confirmed(fixture.kickoff_at),
      'status', fixture.status,
      'open', app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts),
      'home', app_private.football_team_json(fixture.home_team_id, p_language),
      'away', app_private.football_team_json(fixture.away_team_id, p_language),
      -- The provider's running score while the match is played. A postponed
      -- match can carry a stored 0-0 (FAR Rabat v Raja, 24 Sept 2026), so no
      -- score is ever shown outside these statuses.
      'live', case
        when fixture.status in ('live_first_half', 'half_time', 'live_second_half',
          'extra_time', 'penalties', 'suspended')
          and fixture.home_score is not null and fixture.away_score is not null
        then jsonb_build_object('home', fixture.home_score, 'away', fixture.away_score)
      end,
      'result', case
        when fixture.status = 'finished' and fixture.finalized_at is not null
          and fixture.home_score is not null and fixture.away_score is not null
        then jsonb_build_object('home', fixture.home_score, 'away', fixture.away_score)
      end,
      'final', (fixture.status = 'finished' and fixture.finalized_at is not null),
      'void', (fixture.status in ('cancelled', 'abandoned') or coalesce(scoring.override = 'void', false)),
      'corrected', (scoring.state = 'scored' and scoring.corrected_at is not null)
    ) order by fixture.kickoff_at, fixture.id), '[]'::jsonb),
    min(fixture.kickoff_at) filter (
      where app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts)
    ),
    coalesce(sum(scoring.revision), 0)
  into fixtures, next_lock, scoring_version
  from app.fixtures fixture
  left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
  where fixture.round_id = target.id;

  round_state := app_private.prediction_round_state(target.id, now_ts);

  return jsonb_build_object(
    'schemaVersion', 1,
    'mode', settings.mode,
    'allowed', true,
    'serverTime', now_ts,
    'season', jsonb_build_object('id', season.id, 'label', season.label),
    'round', jsonb_build_object(
      'id', target.id,
      'number', target.round_number,
      'name', target.name,
      'state', round_state,
      'provisional', round_state <> 'completed',
      'nextLockAt', next_lock,
      'scoringVersion', scoring_version
    ),
    'rounds', rounds,
    'fixtures', fixtures
  );
end;
$$;

comment on function api.predictions_round(integer, text) is
  'Public: one journée of the current season (null = the default journée), with each match''s open/locked state against the database clock, results only when final, and the journée switcher. Returns {allowed:false} while the feature is off for the caller.';

-- ---------------------------------------------------------------------------
-- api.my_predictions: the caller's predictions for a journée or one match
-- ---------------------------------------------------------------------------
create or replace function api.my_predictions(
  p_round_number integer default null,
  p_fixture_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  v_season_id uuid;
  target_id uuid;
  items jsonb := '[]'::jsonb;
  total_fixtures integer := 0;
  round_row app.prediction_standings%rowtype;
  season_row app.prediction_standings%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  v_season_id := app_private.predictions_current_season();
  if v_season_id is null then
    return jsonb_build_object('serverTime', now_ts, 'items', '[]'::jsonb, 'summary', null);
  end if;

  if p_fixture_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'fixtureId', prediction.fixture_id,
        -- In the match's current orientation, as the scoring reads it: a
        -- provider home/away swap after the save still shows the pick
        -- against the teams the player chose.
        'home', case when (prediction.home_team_id, prediction.away_team_id)
            = (fixture.away_team_id, fixture.home_team_id)
          then prediction.away_goals else prediction.home_goals end,
        'away', case when (prediction.home_team_id, prediction.away_team_id)
            = (fixture.away_team_id, fixture.home_team_id)
          then prediction.home_goals else prediction.away_goals end,
        'submittedAt', prediction.submitted_at,
        'points', prediction.points,
        'resultKind', prediction.result_kind
      )), '[]'::jsonb)
    into items
    from app.predictions prediction
    join app.fixtures fixture on fixture.id = prediction.fixture_id
    where prediction.user_id = caller and prediction.fixture_id = p_fixture_id
      and fixture.season_id = v_season_id;
    return jsonb_build_object('serverTime', now_ts, 'items', items, 'summary', null);
  end if;

  target_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  if target_id is null then
    return jsonb_build_object('serverTime', now_ts, 'items', '[]'::jsonb, 'summary', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'fixtureId', prediction.fixture_id,
      'home', case when (prediction.home_team_id, prediction.away_team_id)
          = (fixture.away_team_id, fixture.home_team_id)
        then prediction.away_goals else prediction.home_goals end,
      'away', case when (prediction.home_team_id, prediction.away_team_id)
          = (fixture.away_team_id, fixture.home_team_id)
        then prediction.home_goals else prediction.away_goals end,
      'submittedAt', prediction.submitted_at,
      'points', prediction.points,
      'resultKind', prediction.result_kind
    ) order by fixture.kickoff_at, fixture.id), '[]'::jsonb)
  into items
  from app.predictions prediction
  join app.fixtures fixture on fixture.id = prediction.fixture_id
  where prediction.user_id = caller and fixture.round_id = target_id;

  select count(*) into total_fixtures
  from app.fixtures fixture
  left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
  where fixture.round_id = target_id
    and fixture.status not in ('cancelled', 'abandoned')
    and scoring.override is distinct from 'void';

  select * into round_row from app.prediction_standings standing
  where standing.round_id = target_id and standing.user_id = caller;
  select * into season_row from app.prediction_standings standing
  where standing.season_id = v_season_id and standing.round_id is null and standing.user_id = caller;

  return jsonb_build_object(
    'serverTime', now_ts,
    'items', items,
    'summary', jsonb_build_object(
      'predicted', jsonb_array_length(items),
      'total', total_fixtures,
      'points', coalesce(round_row.points, 0),
      'exact', coalesce(round_row.exact_count, 0),
      'rank', round_row.rank,
      'seasonPoints', coalesce(season_row.points, 0),
      'seasonRank', season_row.rank,
      'roundsPlayed', coalesce(season_row.rounds_played, 0)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- api.save_predictions: save up to max_items_per_save predictions at once
-- ---------------------------------------------------------------------------
-- Per item: saved (written), unchanged (open, same values), locked (the match
-- is no longer open), not_eligible (not a match of the current season's
-- journées). Last write wins. The app sends one request at a time.
create or replace function api.save_predictions(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  results jsonb;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  perform app_private.predictions_assert_items(p_items, settings.max_items_per_save);
  v_season_id := app_private.predictions_current_season();

  with input as (
    select (item.value ->> 'fixtureId')::uuid as fixture_id,
      (item.value ->> 'home')::smallint as home_goals,
      (item.value ->> 'away')::smallint as away_goals,
      item.ordinality as position
    from jsonb_array_elements(p_items) with ordinality as item
  ),
  candidate as (
    select input.*, fixture.home_team_id, fixture.away_team_id,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null, false) as eligible,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null
        and app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts), false)
        as is_open
    from input
    left join app.fixtures fixture on fixture.id = input.fixture_id
  ),
  written as (
    insert into app.predictions as prediction (
      user_id, fixture_id, home_goals, away_goals, home_team_id, away_team_id, origin, submitted_at
    )
    select caller, candidate.fixture_id, candidate.home_goals, candidate.away_goals,
      candidate.home_team_id, candidate.away_team_id, 'direct', now_ts
    from candidate
    where candidate.is_open
    on conflict (fixture_id, user_id) do update set
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      submitted_at = excluded.submitted_at
    where (prediction.home_goals, prediction.away_goals, prediction.home_team_id, prediction.away_team_id)
      is distinct from (excluded.home_goals, excluded.away_goals, excluded.home_team_id, excluded.away_team_id)
    returning prediction.fixture_id, prediction.home_goals, prediction.away_goals, prediction.submitted_at
  )
  select jsonb_agg(jsonb_build_object(
      'fixtureId', candidate.fixture_id,
      'status', case
        when written.fixture_id is not null then 'saved'
        when candidate.is_open then 'unchanged'
        when candidate.eligible then 'locked'
        else 'not_eligible'
      end,
      'home', coalesce(written.home_goals, existing.home_goals),
      'away', coalesce(written.away_goals, existing.away_goals),
      'submittedAt', coalesce(written.submitted_at, existing.submitted_at)
    ) order by candidate.position)
  into results
  from candidate
  left join written on written.fixture_id = candidate.fixture_id
  left join app.predictions existing
    on existing.fixture_id = candidate.fixture_id and existing.user_id = caller;

  return jsonb_build_object('serverTime', now_ts, 'results', results);
end;
$$;

comment on function api.save_predictions(jsonb) is
  'Signed-in: save 1 to max_items_per_save predictions [{fixtureId, home, away}]. Only matches still open at statement_timestamp() are written, in the same statement that checks it. Returns a status per item: saved, unchanged, locked or not_eligible.';

-- ---------------------------------------------------------------------------
-- api.claim_guest_predictions: import the phone's predictions after sign-up
-- ---------------------------------------------------------------------------
-- Per item: imported (match still open, nothing on the account yet), kept (the
-- account already has a prediction for that match: the account wins, because a
-- phone's clock cannot be trusted), started (the match is no longer open: no
-- one may "predict" a result after seeing it) or invalid (not a match of the
-- current season, or the teams no longer match). Goals are mapped by team, so a
-- provider home/away swap keeps what the guest meant. Running it again changes
-- nothing. One app_private.prediction_guest_claims row per call.
create or replace function api.claim_guest_predictions(p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  results jsonb;
  imported_count integer;
  kept_count integer;
  started_count integer;
  invalid_count integer;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  perform app_private.predictions_assert_items(p_items, settings.max_claim_items);
  v_season_id := app_private.predictions_current_season();

  -- One statement: every CTE reads the same snapshot, so had_prediction is the
  -- account's state before this call; a concurrent save for the same match is
  -- absorbed by "on conflict do nothing" and reported as kept.
  with input as (
    select (item.value ->> 'fixtureId')::uuid as fixture_id,
      (item.value ->> 'home')::smallint as home_goals,
      (item.value ->> 'away')::smallint as away_goals,
      (item.value ->> 'homeTeamId')::uuid as claimed_home,
      (item.value ->> 'awayTeamId')::uuid as claimed_away,
      item.ordinality as position
    from jsonb_array_elements(p_items) with ordinality as item
  ),
  claim as (
    select input.fixture_id, input.position,
      fixture.home_team_id, fixture.away_team_id,
      -- swapped: the guest saw the teams the other way round (provider swap)
      (input.claimed_home is not null and input.claimed_away is not null
        and (input.claimed_home, input.claimed_away)
          = (fixture.away_team_id, fixture.home_team_id)) as swapped,
      input.home_goals, input.away_goals,
      coalesce(fixture.id is not null and fixture.season_id = v_season_id
        and fixture.round_id is not null
        and (input.claimed_home is null or input.claimed_away is null
          or (input.claimed_home, input.claimed_away)
            in ((fixture.home_team_id, fixture.away_team_id),
                (fixture.away_team_id, fixture.home_team_id))), false) as valid,
      coalesce(app_private.prediction_fixture_open(fixture.status, fixture.kickoff_at, now_ts), false)
        as is_open,
      exists (
        select 1 from app.predictions existing
        where existing.fixture_id = input.fixture_id and existing.user_id = caller
      ) as had_prediction
    from input
    left join app.fixtures fixture on fixture.id = input.fixture_id
  ),
  inserted as (
    insert into app.predictions (
      user_id, fixture_id, home_goals, away_goals, home_team_id, away_team_id, origin, submitted_at
    )
    select caller, claim.fixture_id,
      case when claim.swapped then claim.away_goals else claim.home_goals end,
      case when claim.swapped then claim.home_goals else claim.away_goals end,
      claim.home_team_id, claim.away_team_id, 'guest_claim', now_ts
    from claim
    where claim.valid and claim.is_open and not claim.had_prediction
    on conflict (fixture_id, user_id) do nothing
    returning fixture_id
  ),
  classified as (
    select claim.fixture_id, claim.position,
      case
        when not claim.valid then 'invalid'
        when inserted.fixture_id is not null then 'imported'
        when claim.had_prediction or claim.is_open then 'kept'
        else 'started'
      end as status
    from claim
    left join inserted on inserted.fixture_id = claim.fixture_id
  )
  select
    jsonb_agg(jsonb_build_object('fixtureId', classified.fixture_id, 'status', classified.status)
      order by classified.position),
    count(*) filter (where classified.status = 'imported'),
    count(*) filter (where classified.status = 'kept'),
    count(*) filter (where classified.status = 'started'),
    count(*) filter (where classified.status = 'invalid')
  into results, imported_count, kept_count, started_count, invalid_count
  from classified;

  insert into app_private.prediction_guest_claims (
    user_id, submitted, imported, kept_existing, rejected_started, rejected_invalid
  ) values (
    caller, jsonb_array_length(p_items), imported_count, kept_count, started_count, invalid_count
  );

  return jsonb_build_object(
    'serverTime', now_ts,
    'imported', imported_count,
    'keptExisting', kept_count,
    'started', started_count,
    'invalid', invalid_count,
    'results', results
  );
end;
$$;

comment on function api.claim_guest_predictions(jsonb) is
  'Signed-in: import up to max_claim_items predictions made on the phone before sign-up. Only matches still open are imported; the account''s own prediction always wins; goals are mapped by team. Logged in app_private.prediction_guest_claims.';

-- ---------------------------------------------------------------------------
-- api.predictions_leaderboard: journée or season ranking, public, paged
-- ---------------------------------------------------------------------------
-- Ranks are saved by the scoring job (points, then exact scores, then a shared
-- rank). Pages continue "after (rank, id)"; the cursor never carries a user id.
-- Signed-in viewers see display names; visitors see masked usernames.
--
-- A player banned or deleted after the last scoring run keeps a saved rank
-- until the next run re-ranks that journée or season, so the list itself leaves
-- such players out when read: a ban removes the name at once, and the rank
-- numbers close the gap at the next re-rank.
create or replace function api.predictions_leaderboard(
  p_scope text default 'round',
  p_round_number integer default null,
  p_after_rank integer default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid;
  v_round_id uuid;
  v_round_number integer;
  page_ids uuid[];
  items jsonb := '[]'::jsonb;
  total integer;
  me jsonb;
  last_rank integer;
  last_id uuid;
  round_state text;
  matches_left integer;
  has_more boolean;
begin
  if p_scope is null or p_scope not in ('round', 'season')
    or p_limit is null or p_limit not between 1 and 100
    or ((p_after_rank is null) <> (p_after_id is null))
  then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into settings from app_private.prediction_settings where id;
  if not app_private.predictions_access_allowed(caller) then
    return jsonb_build_object('allowed', false, 'mode', settings.mode);
  end if;
  v_season_id := app_private.predictions_current_season();
  if p_scope = 'round' then
    v_round_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  end if;
  if v_season_id is null or (p_scope = 'round' and v_round_id is null) then
    return jsonb_build_object('allowed', true, 'scope', p_scope, 'items', '[]'::jsonb,
      'total', 0, 'nextCursor', null, 'me', null);
  end if;

  -- The page: one index range per scope (journée rows, or season rows).
  if p_scope = 'round' then
    select round_number into v_round_number from app.rounds where id = v_round_id;
    round_state := app_private.prediction_round_state(v_round_id, now_ts);
    select count(*) into matches_left
    from app.fixtures fixture
    left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
    where fixture.round_id = v_round_id
      and not (fixture.status = 'finished' and fixture.finalized_at is not null)
      and fixture.status not in ('cancelled', 'abandoned')
      and scoring.override is distinct from 'void';

    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.round_id = v_round_id and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank, 'points', standing.points,
        'exact', standing.exact_count)
      into me from app.prediction_standings standing
      where standing.round_id = v_round_id and standing.user_id = caller;
    end if;
  else
    select array_agg(page.id order by page.rank, page.id) into page_ids
    from (
      select standing.id, standing.rank
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and (p_after_rank is null or (standing.rank, standing.id) > (p_after_rank, p_after_id))
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        )
      order by standing.rank, standing.id
      limit p_limit + 1
    ) page;
    if p_after_rank is null then
      select count(*) into total
      from app.prediction_standings standing
      join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.rank is not null
        and not exists (
          select 1 from app_private.user_bans ban
          where ban.user_id = standing.user_id and ban.lifted_at is null
            and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
        );
    end if;
    if caller is not null then
      select jsonb_build_object('rank', standing.rank, 'points', standing.points,
        'exact', standing.exact_count, 'roundsPlayed', standing.rounds_played)
      into me from app.prediction_standings standing
      where standing.season_id = v_season_id and standing.round_id is null
        and standing.user_id = caller;
    end if;
  end if;

  -- One row more than asked says whether another page follows.
  has_more := coalesce(cardinality(page_ids), 0) > p_limit;
  if has_more then
    page_ids := page_ids[1:p_limit];
  end if;

  -- The rows of the page (at most p_limit), with names and ties.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', standing.id,
      'rank', standing.rank,
      -- Two probes so each one stays on its own partial rank index.
      'tied', case
        when standing.round_id is null then exists (
          select 1 from app.prediction_standings other
          where other.season_id = standing.season_id and other.round_id is null
            and other.rank = standing.rank and other.id <> standing.id)
        else exists (
          select 1 from app.prediction_standings other
          where other.round_id = standing.round_id
            and other.rank = standing.rank and other.id <> standing.id)
      end,
      'name', case
        when caller is null then app_private.fantasy_mask_username(profile.username)
        else coalesce(nullif(btrim(profile.display_name), ''),
          app_private.fantasy_mask_username(profile.username))
      end,
      'points', standing.points,
      'exact', standing.exact_count,
      'roundsPlayed', standing.rounds_played,
      'isMe', coalesce(standing.user_id = caller, false)
    ) order by standing.rank, standing.id), '[]'::jsonb),
    (array_agg(standing.rank order by standing.rank desc, standing.id desc))[1],
    (array_agg(standing.id order by standing.rank desc, standing.id desc))[1]
  into items, last_rank, last_id
  from app.prediction_standings standing
  left join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
  where standing.id = any(coalesce(page_ids, '{}'::uuid[]));

  return jsonb_build_object(
    'allowed', true,
    'scope', p_scope,
    'round', v_round_number,
    'provisional', case when p_scope = 'round' then round_state <> 'completed' end,
    'matchesLeft', matches_left,
    'total', total,
    'items', items,
    'nextCursor', case when has_more
      then jsonb_build_object('rank', last_rank, 'id', last_id) end,
    'me', me
  );
end;
$$;

comment on function api.predictions_leaderboard(text, integer, integer, uuid, integer) is
  'Public: the saved journée (scope round) or season ranking, p_limit (1-100) rows after (p_after_rank, p_after_id). Shared ranks carry tied=true. Display names for signed-in viewers, masked usernames for visitors.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function api.predictions_round(integer, text) from public;
revoke all on function api.predictions_leaderboard(text, integer, integer, uuid, integer) from public;
revoke all on function api.my_predictions(integer, uuid) from public;
revoke all on function api.save_predictions(jsonb) from public;
revoke all on function api.claim_guest_predictions(jsonb) from public;

grant execute on function api.predictions_round(integer, text) to anon, authenticated, service_role;
grant execute on function api.predictions_leaderboard(text, integer, integer, uuid, integer)
  to anon, authenticated, service_role;
grant execute on function api.my_predictions(integer, uuid) to authenticated, service_role;
grant execute on function api.save_predictions(jsonb) to authenticated, service_role;
grant execute on function api.claim_guest_predictions(jsonb) to authenticated, service_role;
$bg_20260925090200_file$]
);

-- ---------------------------------------------------------------------------
-- Migration 20260925090300, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925090300',
  'predictions_leagues',
  array[$bg_20260925090300_file$-- BotolaGO Production V2
-- Pronostics (score predictions), part 4 of 6: leagues.
--
-- One league, two games. A league stays one app.fantasy_leagues row (one name,
-- one owner, one invite code). Fantasy players are in it through
-- app.fantasy_league_memberships as today; anyone with an account can now also
-- join it for Pronostics only, without a Fantasy team, through
-- app.prediction_league_members. A league's Pronostics ranking is both sets of
-- active members, each person once.
--
--   api.join_prediction_league              join with the league's invite code
--   api.leave_prediction_league             leave a Pronostics-only membership
--   api.my_prediction_leagues               the caller's leagues, both kinds
--   api.predictions_league_standings        a league's Pronostics ranking
--   api.create_prediction_league            create a league without a Fantasy team
--   api.reset_prediction_league_invite_code the owner mints a new code
--
-- Fantasy is not changed: nothing here writes app.fantasy_league_memberships
-- or member_count (which stay Fantasy-only, and feed Fantasy prizes). A league
-- created here is an ordinary private league with member_count = 0, so a
-- Fantasy player can also join it through api.join_fantasy_league with the same
-- code. Invite codes are minted and fingerprinted exactly like
-- api.create_fantasy_league / api.join_fantasy_league: only a sha256 digest and
-- the last 4 characters are stored, the full code is returned once.
--
-- Limits: 50 active leagues per player, 500 Pronostics-only members per
-- league, 5 active leagues owned per player per season.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_current_fantasy_season()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select fantasy_season.id
  from app.fantasy_seasons fantasy_season
  where fantasy_season.football_season_id = app_private.predictions_current_season()
    and fantasy_season.status in ('registration_open', 'active')
  order by fantasy_season.starts_at desc, fantasy_season.id desc
  limit 1;
$$;

create or replace function app_private.prediction_league_is_member(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_user_id is not null and (
    exists (
      select 1 from app.fantasy_league_memberships membership
      where membership.league_id = p_league_id and membership.user_id = p_user_id
        and membership.status = 'active'
    )
    or exists (
      select 1 from app.prediction_league_members member
      where member.league_id = p_league_id and member.user_id = p_user_id
        and member.status = 'active'
    )
  );
$$;

create or replace function app_private.prediction_league_count_for(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer from (
    select membership.league_id
    from app.fantasy_league_memberships membership
    join app.fantasy_leagues league on league.id = membership.league_id and league.active
    where membership.user_id = p_user_id and membership.status = 'active'
    union
    select member.league_id
    from app.prediction_league_members member
    join app.fantasy_leagues league on league.id = member.league_id and league.active
    where member.user_id = p_user_id and member.status = 'active'
  ) leagues;
$$;

-- The same code format api.create_fantasy_league mints: 16 random bytes, hex,
-- upper case. Spaces and dashes a reader typed are removed first.
create or replace function app_private.prediction_invite_code_digest(p_invite_code text)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare normalized text;
begin
  normalized := upper(regexp_replace(coalesce(p_invite_code, ''), '[[:space:]-]', '', 'g'));
  if normalized !~ '^[0-9A-F]{32}$' then
    return null;
  end if;
  return encode(extensions.digest(convert_to(normalized, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function app_private.predictions_current_fantasy_season()
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_league_is_member(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_league_count_for(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.prediction_invite_code_digest(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- api.join_prediction_league
-- ---------------------------------------------------------------------------
create or replace function api.join_prediction_league(p_invite_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  code_digest text;
  target app.fantasy_leagues%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  if p_invite_code is null then
    raise exception using errcode = 'PT400', message = 'invite_code_invalid';
  end if;

  code_digest := app_private.prediction_invite_code_digest(p_invite_code);
  if code_digest is not null then
    select * into target from app.fantasy_leagues league
    where league.invite_code_digest = code_digest
      and league.visibility = 'private'
      and league.active
      and league.fantasy_season_id = app_private.predictions_current_fantasy_season();
  end if;
  -- The same answer for a malformed code, an unknown one, an archived league
  -- and another season's league.
  if target.id is null then
    raise exception using errcode = 'PT404', message = 'invite_code_invalid';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('predictions:league:' || target.id::text, 0));

  if exists (
    select 1 from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.user_id = caller
      and membership.status = 'active'
  ) then
    return jsonb_build_object('leagueId', target.id, 'name', target.name,
      'joined', false, 'via', 'fantasy');
  end if;
  if exists (
    select 1 from app.prediction_league_members member
    where member.league_id = target.id and member.user_id = caller and member.status = 'active'
  ) then
    return jsonb_build_object('leagueId', target.id, 'name', target.name,
      'joined', false, 'via', 'predictions');
  end if;

  if app_private.prediction_league_count_for(caller) >= 50 then
    raise exception using errcode = 'PT409', message = 'league_limit_reached';
  end if;
  if (
    select count(*) from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ) >= 500 then
    raise exception using errcode = 'PT409', message = 'league_full';
  end if;

  insert into app.prediction_league_members as member (league_id, user_id)
  values (target.id, caller)
  on conflict (league_id, user_id) do update set
    status = 'active', left_at = null, joined_at = statement_timestamp()
  where member.status = 'left';

  return jsonb_build_object('leagueId', target.id, 'name', target.name,
    'joined', true, 'via', 'predictions');
end;
$$;

comment on function api.join_prediction_league(text) is
  'Signed-in: join a private league of the current season for Pronostics only, with its invite code (the same code Fantasy players use). A wrong code, an archived league and another season''s league all answer PT404 invite_code_invalid.';

-- ---------------------------------------------------------------------------
-- api.leave_prediction_league
-- ---------------------------------------------------------------------------
create or replace function api.leave_prediction_league(p_league_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  membership app.prediction_league_members%rowtype;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into membership from app.prediction_league_members member
  where member.league_id = p_league_id and member.user_id = caller and member.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'league_membership_not_found';
  end if;
  if membership.role = 'owner' then
    raise exception using errcode = 'PT409', message = 'league_owner_cannot_leave';
  end if;
  update app.prediction_league_members
  set status = 'left', left_at = statement_timestamp()
  where id = membership.id;
  return jsonb_build_object('leagueId', p_league_id, 'left', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- api.my_prediction_leagues
-- ---------------------------------------------------------------------------
create or replace function api.my_prediction_leagues()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_fantasy_season_id uuid;
  v_season_id uuid;
  items jsonb := '[]'::jsonb;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  v_fantasy_season_id := app_private.predictions_current_fantasy_season();
  v_season_id := app_private.predictions_current_season();
  if v_fantasy_season_id is null then
    return jsonb_build_object('items', items);
  end if;

  with mine as (
    select membership.league_id, 'fantasy'::text as via
    from app.fantasy_league_memberships membership
    where membership.user_id = caller and membership.status = 'active'
    union all
    select member.league_id, 'predictions'::text
    from app.prediction_league_members member
    where member.user_id = caller and member.status = 'active'
  ),
  leagues as (
    select distinct on (mine.league_id) mine.league_id, mine.via
    from mine
    order by mine.league_id, (mine.via = 'fantasy') desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'leagueId', league.id,
      'name', league.name,
      'via', leagues.via,
      'role', case when league.owner_user_id = caller then 'owner' else 'member' end,
      'members', (
        select count(*) from (
          select membership.user_id from app.fantasy_league_memberships membership
          where membership.league_id = league.id and membership.status = 'active'
          union
          select member.user_id from app.prediction_league_members member
          where member.league_id = league.id and member.status = 'active'
        ) everyone
      ),
      'inviteCodeHint', case when league.owner_user_id = caller then league.invite_code_hint end,
      'seasonPoints', coalesce((
        select standing.points from app.prediction_standings standing
        where standing.user_id = caller and standing.season_id = v_season_id
          and standing.round_id is null
      ), 0)
    ) order by league.name, league.id), '[]'::jsonb)
  into items
  from leagues
  join app.fantasy_leagues league on league.id = leagues.league_id
  where league.active and league.fantasy_season_id = v_fantasy_season_id;

  return jsonb_build_object('items', items);
end;
$$;

-- ---------------------------------------------------------------------------
-- api.predictions_league_standings
-- ---------------------------------------------------------------------------
-- p_round_number null = the season ranking; otherwise that journée's. Ranked
-- when read (a league is small): points, then exact scores, then a shared rank.
-- Members who have no scored prediction yet are counted in notPlayed.
create or replace function api.predictions_league_standings(
  p_league_id uuid,
  p_round_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  now_ts timestamptz := statement_timestamp();
  target app.fantasy_leagues%rowtype;
  v_season_id uuid;
  v_round_id uuid;
  items jsonb := '[]'::jsonb;
  member_total integer := 0;
  ranked_total integer := 0;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into target from app.fantasy_leagues league
  where league.id = p_league_id and league.active;
  if target.id is null or not app_private.prediction_league_is_member(target.id, caller) then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  v_season_id := app_private.predictions_current_season();
  if p_round_number is not null then
    v_round_id := app_private.predictions_resolve_round(v_season_id, p_round_number, now_ts);
  end if;

  with members as (
    select membership.user_id from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.status = 'active'
    union
    select member.user_id from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ),
  scored as (
    select standing.user_id, standing.points, standing.exact_count, standing.rounds_played
    from members
    join app.prediction_standings standing on standing.user_id = members.user_id
    join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
    where standing.scored_count > 0
      and (
        (v_round_id is not null and standing.round_id = v_round_id)
        or (v_round_id is null and standing.season_id = v_season_id and standing.round_id is null)
      )
      and not exists (
        select 1 from app_private.user_bans ban
        where ban.user_id = standing.user_id and ban.lifted_at is null
          and ban.starts_at <= now_ts and (ban.ends_at is null or ban.ends_at > now_ts)
      )
  ),
  ranked as (
    select scored.*,
      rank() over (order by scored.points desc, scored.exact_count desc) as position,
      count(*) over (partition by scored.points, scored.exact_count) > 1 as tied
    from scored
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rank', ranked.position,
      'tied', ranked.tied,
      'name', coalesce(nullif(btrim(profile.display_name), ''),
        app_private.fantasy_mask_username(profile.username)),
      'points', ranked.points,
      'exact', ranked.exact_count,
      'roundsPlayed', ranked.rounds_played,
      'isMe', ranked.user_id = caller
    ) order by ranked.position, ranked.user_id), '[]'::jsonb),
    count(*)
  into items, ranked_total
  from ranked
  join app.profiles profile on profile.id = ranked.user_id;

  select count(*) into member_total from (
    select membership.user_id from app.fantasy_league_memberships membership
    where membership.league_id = target.id and membership.status = 'active'
    union
    select member.user_id from app.prediction_league_members member
    where member.league_id = target.id and member.status = 'active'
  ) everyone;

  return jsonb_build_object(
    'league', jsonb_build_object('id', target.id, 'name', target.name,
      'isOwner', target.owner_user_id = caller,
      'inviteCodeHint', case when target.owner_user_id = caller then target.invite_code_hint end),
    'scope', case when v_round_id is null then 'season' else 'round' end,
    'round', p_round_number,
    'items', items,
    'members', member_total,
    'notPlayed', greatest(member_total - ranked_total, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- api.create_prediction_league
-- ---------------------------------------------------------------------------
create or replace function api.create_prediction_league(p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_fantasy_season_id uuid;
  existing_id uuid;
  new_id uuid;
  invite_code text;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  if p_name is null or p_name <> btrim(p_name) or char_length(p_name) not between 3 and 80 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  v_fantasy_season_id := app_private.predictions_current_fantasy_season();
  if v_fantasy_season_id is null then
    raise exception using errcode = 'PT409', message = 'predictions_leagues_unavailable';
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text || ':predictions:create_league', 0)
  );
  -- A double tap within a minute returns the league already created. Its code
  -- is not repeated (only the digest is stored); the owner can reset it.
  select league.id into existing_id
  from app.fantasy_leagues league
  where league.owner_user_id = caller and league.fantasy_season_id = v_fantasy_season_id
    and league.name = p_name and league.active
    and league.created_at > statement_timestamp() - interval '60 seconds'
  order by league.created_at desc
  limit 1;
  if existing_id is not null then
    return jsonb_build_object('leagueId', existing_id, 'name', p_name,
      'inviteCode', null, 'created', false);
  end if;

  if (
    select count(*) from app.fantasy_leagues league
    where league.owner_user_id = caller and league.fantasy_season_id = v_fantasy_season_id
      and league.active
  ) >= 5 then
    raise exception using errcode = 'PT409', message = 'league_create_limit_reached';
  end if;
  if app_private.prediction_league_count_for(caller) >= 50 then
    raise exception using errcode = 'PT409', message = 'league_limit_reached';
  end if;

  invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  insert into app.fantasy_leagues (
    fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint,
    member_count
  ) values (
    v_fantasy_season_id, caller, p_name, 'private',
    encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex'),
    right(invite_code, 4), 0
  )
  returning id into new_id;

  insert into app.prediction_league_members (league_id, user_id, role)
  values (new_id, caller, 'owner');

  return jsonb_build_object('leagueId', new_id, 'name', p_name,
    'inviteCode', invite_code, 'created', true);
end;
$$;

comment on function api.create_prediction_league(text) is
  'Signed-in: create a private league of the current season without a Fantasy team. The caller is its owner (a Pronostics member); member_count stays 0 because it counts Fantasy members only. The invite code is returned once.';

-- ---------------------------------------------------------------------------
-- api.reset_prediction_league_invite_code
-- ---------------------------------------------------------------------------
create or replace function api.reset_prediction_league_invite_code(p_league_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target app.fantasy_leagues%rowtype;
  invite_code text;
begin
  if caller is null then
    raise exception using errcode = 'PT401', message = 'predictions_unauthenticated';
  end if;
  if not app_private.predictions_access_allowed(caller) then
    raise exception using errcode = 'PT403', message = 'predictions_unavailable';
  end if;
  select * into target from app.fantasy_leagues league
  where league.id = p_league_id and league.owner_user_id = caller
    and league.visibility = 'private' and league.active
  for update;
  if target.id is null then
    raise exception using errcode = 'PT403', message = 'league_access_denied';
  end if;
  invite_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  update app.fantasy_leagues set
    invite_code_digest = encode(extensions.digest(convert_to(invite_code, 'UTF8'), 'sha256'), 'hex'),
    invite_code_hint = right(invite_code, 4)
  where id = target.id;
  return jsonb_build_object('leagueId', target.id, 'inviteCode', invite_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: signed-in players only
-- ---------------------------------------------------------------------------
revoke all on function api.join_prediction_league(text) from public;
revoke all on function api.leave_prediction_league(uuid) from public;
revoke all on function api.my_prediction_leagues() from public;
revoke all on function api.predictions_league_standings(uuid, integer) from public;
revoke all on function api.create_prediction_league(text) from public;
revoke all on function api.reset_prediction_league_invite_code(uuid) from public;

grant execute on function api.join_prediction_league(text) to authenticated, service_role;
grant execute on function api.leave_prediction_league(uuid) to authenticated, service_role;
grant execute on function api.my_prediction_leagues() to authenticated, service_role;
grant execute on function api.predictions_league_standings(uuid, integer) to authenticated, service_role;
grant execute on function api.create_prediction_league(text) to authenticated, service_role;
grant execute on function api.reset_prediction_league_invite_code(uuid) to authenticated, service_role;
$bg_20260925090300_file$]
);

-- ---------------------------------------------------------------------------
-- Migration 20260925090400, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925090400',
  'predictions_scoring',
  array[$bg_20260925090400_file$-- BotolaGO Production V2
-- Pronostics (score predictions), part 5 of 6: scoring.
--
-- A pg_cron job, predictions-score-tick, runs app_private.predictions_score_tick()
-- every 5 minutes inside the database (no Edge Function, no secret):
--
--   1. While the switch is off (mode = off) or scoring is paused, it returns at
--      once and writes nothing.
--   2. It takes a non-blocking lock, so two overlapping runs cannot both work.
--   3. It picks at most 4 matches whose current facts differ from what was last
--      scored (app_private.prediction_fixture_scoring): newly final, voided,
--      corrected score, changed teams, kick-off or journée, operator override.
--      A match is final when status = finished AND finalized_at is set; the
--      provider stores scores for matches that were never played (a postponed
--      match and a not-yet-started one both carried 0-0 in production on
--      24 Sept 2026), so nothing else is ever scored.
--   4. For each: one update sets points / result_kind on all its predictions.
--      Goals are mapped by team (a home/away swap scores the player's intent; a
--      different match is void). A prediction submitted at or after the match's
--      final kick-off scores nothing (result_kind = late): it covers a kick-off
--      moved earlier that the database learned about late.
--   5. The journée and season rows of every player concerned are rebuilt from
--      their predictions (never incremented), then every affected journée and
--      season is re-ranked (points, then exact scores, then a shared rank;
--      banned and deleted accounts are unranked). Only rows that change are
--      written.
--   6. One app_private.prediction_job_runs row when anything happened; a failed
--      run is rolled back and logged, and the next run retries.
--
-- Running it again with nothing new changes nothing. It never writes
-- app.fixtures, and no trigger is added to app.fixtures: ingestion and Fantasy
-- are unaffected if this job fails.
--
-- Operator functions (postgres only, SQL editor), each logged with its reason:
--   app_private.predictions_configure(mode, scoring_enabled, tester_user_ids, competition_id)
--   app_private.predictions_void_fixture(fixture_id, reason)
--   app_private.predictions_unvoid_fixture(fixture_id, reason)
--   app_private.predictions_rescore_fixture(fixture_id, reason)
--   app_private.predictions_status()
--
-- Pause everything: select app_private.predictions_configure('off');
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- The scoring pass
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_score_pending(
  p_now timestamptz default statement_timestamp(),
  p_limit integer default 4
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.prediction_settings%rowtype;
  run_started timestamptz := clock_timestamp();
  batch_size integer := least(greatest(coalesce(p_limit, 4), 1), 50);
  work record;
  rule smallint;
  processed integer := 0;
  predictions_updated integer := 0;
  standings_updated integer := 0;
  n integer;
  fixture_ids uuid[] := '{}'::uuid[];
  affected_users uuid[] := '{}'::uuid[];
  affected_rounds uuid[] := '{}'::uuid[];
  affected_seasons uuid[] := '{}'::uuid[];
begin
  select * into settings from app_private.prediction_settings where id;
  if settings.mode = 'off' or not settings.scoring_enabled then
    return jsonb_build_object('outcome', 'disabled');
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:predictions-score', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  for work in
    with candidate as (
      select fixture.id as fixture_id, fixture.season_id, fixture.round_id,
        fixture.status::text as status, fixture.kickoff_at,
        fixture.home_team_id, fixture.away_team_id, fixture.home_score, fixture.away_score,
        scoring.fixture_id is not null as has_record,
        scoring.state as record_state, scoring.result_home as record_home,
        scoring.result_away as record_away, scoring.fixture_kickoff_at as record_kickoff,
        scoring.home_team_id as record_home_team, scoring.away_team_id as record_away_team,
        scoring.round_id as record_round_id, scoring.season_id as record_season_id,
        scoring.rule_version as record_rule,
        case
          when scoring.override = 'void' then 'void'
          when fixture.status in ('cancelled', 'abandoned') then 'void'
          when fixture.status = 'finished' and fixture.finalized_at is not null
            and fixture.home_score is not null and fixture.away_score is not null then 'scored'
          else 'unscored'
        end as desired_state
      from app.fixtures fixture
      left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
      where scoring.fixture_id is not null
        or exists (select 1 from app.predictions prediction where prediction.fixture_id = fixture.id)
    ),
    desired as (
      select candidate.*,
        case when desired_state = 'scored' then home_score end as desired_home,
        case when desired_state = 'scored' then away_score end as desired_away
      from candidate
    )
    select desired.*
    from desired
    where (not has_record and desired_state <> 'unscored')
      or (has_record and (
        record_state is distinct from desired_state
        or record_home is distinct from desired_home
        or record_away is distinct from desired_away
        or record_kickoff is distinct from kickoff_at
        or record_home_team is distinct from home_team_id
        or record_away_team is distinct from away_team_id
        or record_round_id is distinct from round_id
        or record_season_id is distinct from season_id
      ))
    order by kickoff_at, fixture_id
    limit batch_size
  loop
    -- A match keeps the rule it was first scored with; an operator re-score
    -- (predictions_rescore_fixture) applies the current one.
    rule := coalesce(work.record_rule, settings.rule_version);

    update app.predictions prediction set
      points = scored.points,
      result_kind = scored.result_kind,
      rule_version = scored.rule_version,
      scored_at = scored.scored_at
    from (
      select mapped.id,
        case
          when work.desired_state = 'unscored' then null
          when work.desired_state = 'void' or mapped.late or mapped.home is null then 0
          else app_private.prediction_points(mapped.home, mapped.away, work.desired_home, work.desired_away)
        end as points,
        case
          when work.desired_state = 'unscored' then null
          when work.desired_state = 'void' or mapped.home is null then 'void'
          when mapped.late then 'late'
          else app_private.prediction_result_kind(mapped.home, mapped.away, work.desired_home, work.desired_away)
        end as result_kind,
        case when work.desired_state = 'unscored' then null else rule end as rule_version,
        case when work.desired_state = 'unscored' then null else p_now end as scored_at
      from (
        select existing.id,
          existing.submitted_at >= work.kickoff_at as late,
          case
            when (existing.home_team_id, existing.away_team_id) = (work.home_team_id, work.away_team_id)
              then existing.home_goals::integer
            when (existing.home_team_id, existing.away_team_id) = (work.away_team_id, work.home_team_id)
              then existing.away_goals::integer
          end as home,
          case
            when (existing.home_team_id, existing.away_team_id) = (work.home_team_id, work.away_team_id)
              then existing.away_goals::integer
            when (existing.home_team_id, existing.away_team_id) = (work.away_team_id, work.home_team_id)
              then existing.home_goals::integer
          end as away
        from app.predictions existing
        where existing.fixture_id = work.fixture_id
      ) mapped
    ) scored
    where prediction.id = scored.id
      and (prediction.points, prediction.result_kind, prediction.rule_version)
        is distinct from (scored.points::smallint, scored.result_kind, scored.rule_version);
    get diagnostics n = row_count;
    predictions_updated := predictions_updated + n;

    insert into app_private.prediction_fixture_scoring as scoring (
      fixture_id, season_id, round_id, state, result_home, result_away, fixture_status,
      fixture_kickoff_at, home_team_id, away_team_id, rule_version, revision,
      predictions_scored, scored_at
    ) values (
      work.fixture_id, work.season_id, work.round_id, work.desired_state,
      work.desired_home, work.desired_away, work.status, work.kickoff_at,
      work.home_team_id, work.away_team_id, rule, 1,
      (select count(*) from app.predictions counted where counted.fixture_id = work.fixture_id),
      p_now
    )
    on conflict (fixture_id) do update set
      season_id = excluded.season_id,
      round_id = excluded.round_id,
      state = excluded.state,
      result_home = excluded.result_home,
      result_away = excluded.result_away,
      fixture_status = excluded.fixture_status,
      fixture_kickoff_at = excluded.fixture_kickoff_at,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      rule_version = excluded.rule_version,
      revision = scoring.revision + 1,
      predictions_scored = excluded.predictions_scored,
      scored_at = excluded.scored_at,
      corrected_at = case
        when scoring.state = 'scored' and excluded.state = 'scored'
          and (scoring.result_home, scoring.result_away)
            is distinct from (excluded.result_home, excluded.result_away)
        then excluded.scored_at
        else scoring.corrected_at
      end;

    fixture_ids := fixture_ids || work.fixture_id;
    affected_users := affected_users || array(
      select counted.user_id from app.predictions counted where counted.fixture_id = work.fixture_id
    );
    affected_rounds := affected_rounds || array_remove(array[work.round_id, work.record_round_id], null);
    affected_seasons := affected_seasons || array_remove(array[work.season_id, work.record_season_id], null);
    processed := processed + 1;
  end loop;

  if processed = 0 then
    return jsonb_build_object('outcome', 'idle');
  end if;

  affected_users := array(select distinct unnest(affected_users));
  affected_rounds := array(select distinct unnest(affected_rounds));
  affected_seasons := array(select distinct unnest(affected_seasons));

  -- Journée rows of the players concerned, rebuilt from their predictions.
  with totals as (
    select fixture.season_id, fixture.round_id, prediction.user_id,
      coalesce(sum(prediction.points), 0)::integer as points,
      count(*) filter (where prediction.result_kind = 'exact')::integer as exact_count,
      count(*) filter (where prediction.result_kind = 'outcome')::integer as outcome_count,
      count(*) filter (where prediction.result_kind = 'miss')::integer as miss_count,
      count(*) filter (where prediction.result_kind in ('void', 'late'))::integer as void_count,
      count(*)::integer as predicted_count
    from app.predictions prediction
    join app.fixtures fixture on fixture.id = prediction.fixture_id
    where prediction.user_id = any(affected_users)
      and fixture.round_id = any(affected_rounds)
    group by fixture.season_id, fixture.round_id, prediction.user_id
  )
  insert into app.prediction_standings as standing (
    season_id, round_id, user_id, points, exact_count, outcome_count, miss_count,
    void_count, scored_count, predicted_count
  )
  select totals.season_id, totals.round_id, totals.user_id, totals.points, totals.exact_count,
    totals.outcome_count, totals.miss_count, totals.void_count,
    totals.exact_count + totals.outcome_count + totals.miss_count, totals.predicted_count
  from totals
  on conflict (season_id, round_id, user_id) do update set
    points = excluded.points,
    exact_count = excluded.exact_count,
    outcome_count = excluded.outcome_count,
    miss_count = excluded.miss_count,
    void_count = excluded.void_count,
    scored_count = excluded.scored_count,
    predicted_count = excluded.predicted_count
  where (standing.points, standing.exact_count, standing.outcome_count, standing.miss_count,
      standing.void_count, standing.scored_count, standing.predicted_count)
    is distinct from (excluded.points, excluded.exact_count, excluded.outcome_count,
      excluded.miss_count, excluded.void_count, excluded.scored_count, excluded.predicted_count);
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  -- A journée row left without predictions (its match moved to another
  -- journée) is removed.
  delete from app.prediction_standings standing
  where standing.round_id = any(affected_rounds)
    and standing.user_id = any(affected_users)
    and not exists (
      select 1 from app.predictions prediction
      join app.fixtures fixture on fixture.id = prediction.fixture_id
      where prediction.user_id = standing.user_id and fixture.round_id = standing.round_id
    );
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  -- Season rows of the players concerned, rebuilt from their journée rows.
  with totals as (
    select standing.season_id, standing.user_id,
      sum(standing.points)::integer as points,
      sum(standing.exact_count)::integer as exact_count,
      sum(standing.outcome_count)::integer as outcome_count,
      sum(standing.miss_count)::integer as miss_count,
      sum(standing.void_count)::integer as void_count,
      sum(standing.scored_count)::integer as scored_count,
      sum(standing.predicted_count)::integer as predicted_count,
      (count(*) filter (where standing.scored_count > 0))::integer as rounds_played
    from app.prediction_standings standing
    where standing.round_id is not null
      and standing.user_id = any(affected_users)
      and standing.season_id = any(affected_seasons)
    group by standing.season_id, standing.user_id
  )
  insert into app.prediction_standings as standing (
    season_id, round_id, user_id, points, exact_count, outcome_count, miss_count,
    void_count, scored_count, predicted_count, rounds_played
  )
  select totals.season_id, null, totals.user_id, totals.points, totals.exact_count,
    totals.outcome_count, totals.miss_count, totals.void_count, totals.scored_count,
    totals.predicted_count, totals.rounds_played
  from totals
  on conflict (season_id, round_id, user_id) do update set
    points = excluded.points,
    exact_count = excluded.exact_count,
    outcome_count = excluded.outcome_count,
    miss_count = excluded.miss_count,
    void_count = excluded.void_count,
    scored_count = excluded.scored_count,
    predicted_count = excluded.predicted_count,
    rounds_played = excluded.rounds_played
  where (standing.points, standing.exact_count, standing.outcome_count, standing.miss_count,
      standing.void_count, standing.scored_count, standing.predicted_count, standing.rounds_played)
    is distinct from (excluded.points, excluded.exact_count, excluded.outcome_count,
      excluded.miss_count, excluded.void_count, excluded.scored_count, excluded.predicted_count,
      excluded.rounds_played);
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  delete from app.prediction_standings standing
  where standing.round_id is null
    and standing.season_id = any(affected_seasons)
    and standing.user_id = any(affected_users)
    and not exists (
      select 1 from app.prediction_standings journee
      where journee.user_id = standing.user_id and journee.season_id = standing.season_id
        and journee.round_id is not null
    );
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  -- Re-rank every affected journée and season. Ranked: at least one scored
  -- prediction, a live profile, no active ban.
  with eligible as (
    select standing.id,
      rank() over (
        partition by standing.season_id, standing.round_id
        order by standing.points desc, standing.exact_count desc
      ) as position
    from app.prediction_standings standing
    join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
    where standing.scored_count > 0
      and (standing.round_id = any(affected_rounds)
        or (standing.round_id is null and standing.season_id = any(affected_seasons)))
      and not exists (
        select 1 from app_private.user_bans ban
        where ban.user_id = standing.user_id and ban.lifted_at is null
          and ban.starts_at <= p_now and (ban.ends_at is null or ban.ends_at > p_now)
      )
  ),
  target as (
    select standing.id, eligible.position
    from app.prediction_standings standing
    left join eligible on eligible.id = standing.id
    where standing.round_id = any(affected_rounds)
      or (standing.round_id is null and standing.season_id = any(affected_seasons))
  )
  update app.prediction_standings standing
  set rank = target.position
  from target
  where standing.id = target.id and standing.rank is distinct from target.position;
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  insert into app_private.prediction_job_runs (
    kind, started_at, finished_at, outcome, fixtures_processed, predictions_updated,
    standings_updated, detail
  ) values (
    'tick', run_started, clock_timestamp(), 'succeeded', processed, predictions_updated,
    standings_updated, jsonb_build_object('fixtureIds', to_jsonb(fixture_ids))
  );

  return jsonb_build_object(
    'outcome', 'succeeded',
    'fixtures', processed,
    'predictionsUpdated', predictions_updated,
    'standingsUpdated', standings_updated,
    'fixtureIds', to_jsonb(fixture_ids)
  );
end;
$$;

comment on function app_private.predictions_score_pending(timestamptz, integer) is
  'Scores (or re-scores, voids, un-scores) at most p_limit matches whose facts differ from app_private.prediction_fixture_scoring, rebuilds the concerned players'' standings and re-ranks. Idempotent. Does nothing while mode = off or scoring is paused.';

create or replace function app_private.predictions_score_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  run_started timestamptz := clock_timestamp();
  result jsonb;
begin
  begin
    result := app_private.predictions_score_pending(statement_timestamp(), 4);
  exception when others then
    insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, error)
    values ('tick', run_started, clock_timestamp(), 'failed',
      left(format('%s: %s', sqlstate, sqlerrm), 600));
    return jsonb_build_object('outcome', 'failed');
  end;
  return result;
end;
$$;

comment on function app_private.predictions_score_tick() is
  'Run every 5 minutes by the pg_cron job predictions-score-tick. A failed pass is rolled back and logged in app_private.prediction_job_runs; the next run retries.';

-- ---------------------------------------------------------------------------
-- Operator functions (postgres only)
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_configure(
  p_mode text,
  p_scoring_enabled boolean default null,
  p_tester_user_ids uuid[] default null,
  p_competition_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result app_private.prediction_settings%rowtype;
begin
  if p_mode is null or p_mode not in ('off', 'testers', 'public') then
    raise exception using errcode = '22023', message = 'predictions_mode_invalid';
  end if;
  update app_private.prediction_settings set
    mode = p_mode,
    scoring_enabled = coalesce(p_scoring_enabled, scoring_enabled),
    tester_user_ids = coalesce(p_tester_user_ids, tester_user_ids),
    competition_id = coalesce(p_competition_id, competition_id)
  where id
  returning * into result;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied', jsonb_build_object(
    'action', 'configure', 'mode', result.mode, 'scoringEnabled', result.scoring_enabled,
    'testers', cardinality(result.tester_user_ids), 'competitionId', result.competition_id));
  return jsonb_build_object('mode', result.mode, 'scoringEnabled', result.scoring_enabled,
    'testers', cardinality(result.tester_user_ids), 'competitionId', result.competition_id,
    'ruleVersion', result.rule_version);
end;
$$;

create or replace function app_private.predictions_assert_reason(p_reason text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 8 and 500 then
    raise exception using errcode = '22023', message = 'predictions_reason_invalid';
  end if;
  return btrim(p_reason);
end;
$$;

-- Void a match for Pronostics (a walkover, an awarded result, a match that
-- will never be played). Takes effect on the next scoring run.
create or replace function app_private.predictions_void_fixture(p_fixture_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reason text := app_private.predictions_assert_reason(p_reason);
  target app.fixtures%rowtype;
  settings app_private.prediction_settings%rowtype;
begin
  select * into target from app.fixtures where id = p_fixture_id;
  if target.id is null then
    raise exception using errcode = 'P0002', message = 'predictions_fixture_not_found';
  end if;
  select * into settings from app_private.prediction_settings where id;
  insert into app_private.prediction_fixture_scoring as scoring (
    fixture_id, season_id, round_id, state, fixture_status, fixture_kickoff_at,
    home_team_id, away_team_id, rule_version, predictions_scored,
    override, override_reason, override_at
  ) values (
    target.id, target.season_id, target.round_id, 'unscored', target.status::text,
    target.kickoff_at, target.home_team_id, target.away_team_id, settings.rule_version, 0,
    'void', reason, statement_timestamp()
  )
  on conflict (fixture_id) do update set
    override = 'void', override_reason = excluded.override_reason, override_at = excluded.override_at;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail, reason)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied',
    jsonb_build_object('action', 'void_fixture', 'fixtureId', target.id), reason);
  return jsonb_build_object('fixtureId', target.id, 'override', 'void');
end;
$$;

create or replace function app_private.predictions_unvoid_fixture(p_fixture_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare reason text := app_private.predictions_assert_reason(p_reason);
begin
  update app_private.prediction_fixture_scoring
  set override = null, override_reason = null, override_at = null
  where fixture_id = p_fixture_id and override is not null;
  if not found then
    raise exception using errcode = 'P0002', message = 'predictions_override_not_found';
  end if;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail, reason)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied',
    jsonb_build_object('action', 'unvoid_fixture', 'fixtureId', p_fixture_id), reason);
  return jsonb_build_object('fixtureId', p_fixture_id, 'override', null);
end;
$$;

-- Force a match to be scored again on the next run, with the current rule.
create or replace function app_private.predictions_rescore_fixture(p_fixture_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reason text := app_private.predictions_assert_reason(p_reason);
  settings app_private.prediction_settings%rowtype;
begin
  select * into settings from app_private.prediction_settings where id;
  update app_private.prediction_fixture_scoring set
    state = 'unscored', result_home = null, result_away = null,
    rule_version = settings.rule_version
  where fixture_id = p_fixture_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'predictions_fixture_not_scored';
  end if;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail, reason)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied',
    jsonb_build_object('action', 'rescore_fixture', 'fixtureId', p_fixture_id), reason);
  return jsonb_build_object('fixtureId', p_fixture_id, 'queued', true);
end;
$$;

-- One read for the owner: the switch, the job, each journée of the current
-- season, matches waiting too long for a final result, recent runs.
create or replace function app_private.predictions_status(p_now timestamptz default statement_timestamp())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid := app_private.predictions_current_season();
begin
  select * into settings from app_private.prediction_settings where id;
  return jsonb_build_object(
    'mode', settings.mode,
    'scoringEnabled', settings.scoring_enabled,
    'testers', cardinality(settings.tester_user_ids),
    'ruleVersion', settings.rule_version,
    'jobActive', exists (select 1 from cron.job where jobname = 'predictions-score-tick' and active),
    'seasonId', v_season_id,
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round', round_row.round_number,
        'state', app_private.prediction_round_state(round_row.id, p_now),
        'fixtures', (select count(*) from app.fixtures fixture where fixture.round_id = round_row.id),
        'scored', (select count(*) from app_private.prediction_fixture_scoring scoring
          where scoring.round_id = round_row.id and scoring.state = 'scored'),
        'void', (select count(*) from app_private.prediction_fixture_scoring scoring
          where scoring.round_id = round_row.id and scoring.state = 'void'),
        'players', (select count(distinct prediction.user_id) from app.predictions prediction
          join app.fixtures fixture on fixture.id = prediction.fixture_id
          where fixture.round_id = round_row.id),
        'predictions', (select count(*) from app.predictions prediction
          join app.fixtures fixture on fixture.id = prediction.fixture_id
          where fixture.round_id = round_row.id)
      ) order by round_row.round_number)
      from app.rounds round_row
      where round_row.season_id = v_season_id
        and exists (select 1 from app.fixtures fixture where fixture.round_id = round_row.id)
    ), '[]'::jsonb),
    'waitingForFinal', coalesce((
      select jsonb_agg(jsonb_build_object('fixtureId', fixture.id, 'kickoffAt', fixture.kickoff_at,
        'status', fixture.status) order by fixture.kickoff_at)
      from app.fixtures fixture
      where fixture.status = 'finished' and fixture.finalized_at is null
        and fixture.kickoff_at < p_now - interval '6 hours'
        and exists (select 1 from app.predictions prediction where prediction.fixture_id = fixture.id)
    ), '[]'::jsonb),
    'recentRuns', coalesce((
      select jsonb_agg(jsonb_build_object('kind', run.kind, 'startedAt', run.started_at,
        'outcome', run.outcome, 'fixtures', run.fixtures_processed, 'error', run.error,
        'reason', run.reason, 'detail', run.detail) order by run.started_at desc)
      from (select * from app_private.prediction_job_runs order by started_at desc limit 10) run
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function app_private.predictions_score_pending(timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_score_tick()
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_configure(text, boolean, uuid[], uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_assert_reason(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_void_fixture(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_unvoid_fixture(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_rescore_fixture(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_status(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function app_private.predictions_score_tick() to postgres;

-- ---------------------------------------------------------------------------
-- The job. Idle (no writes) while mode = off.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'predictions-score-tick',
  '*/5 * * * *',
  'select app_private.predictions_score_tick();'
);

select cron.schedule(
  'predictions-history-prune',
  '53 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'predictions-score-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.prediction_job_runs
    where started_at < now() - interval '90 days';
  $prune$
);
$bg_20260925090400_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, in order, once each is the repository file byte
-- for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925090000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925090000'
  );
  part_20260925090100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925090100'
  );
  part_20260925090200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925090200'
  );
  part_20260925090300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925090300'
  );
  part_20260925090400 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925090400'
  );
begin
  if encode(sha256(convert_to(part_20260925090000, 'UTF8')), 'hex')
    is distinct from 'f2305e528d89ac03e2e179d7384a16831014adb352e796922520d2b90944bac6' then
    raise exception 'stop: 20260925090000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20260925090100, 'UTF8')), 'hex')
    is distinct from '27d8b9ae10d117d867b1a28652b21476c4db5accc03330f68fddf2222d048a1a' then
    raise exception 'stop: 20260925090100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20260925090200, 'UTF8')), 'hex')
    is distinct from '104a1a1d8ee64471618b675c2b420267e3786044862fbc92e68051172182cfdb' then
    raise exception 'stop: 20260925090200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20260925090300, 'UTF8')), 'hex')
    is distinct from '9428249f3ae77e4bcd453e6f13f671515360052012161d9bd02996b3ebb3629a' then
    raise exception 'stop: 20260925090300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20260925090400, 'UTF8')), 'hex')
    is distinct from 'ed83856e1f1fca1c9c1e184d43fe887c1fda9000d66deda1a41a0c950e15bda8' then
    raise exception 'stop: 20260925090400 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925090000;
  execute part_20260925090100;
  execute part_20260925090200;
  execute part_20260925090300;
  execute part_20260925090400;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  object_name text;
  signature regprocedure;
  answer jsonb;
  status jsonb;
  tables constant text[] := array[
    'app.predictions', 'app.prediction_standings', 'app.prediction_league_members',
    'app_private.prediction_fixture_scoring', 'app_private.prediction_settings',
    'app_private.prediction_job_runs', 'app_private.prediction_guest_claims'
  ];
  -- Readable by anyone, signed in or not: the journée and the rankings.
  public_reads constant text[] := array[
    'api.predictions_round(integer, text)',
    'api.predictions_leaderboard(text, integer, integer, uuid, integer)'
  ];
  -- Signed-in players only.
  player_calls constant text[] := array[
    'api.save_predictions(jsonb)',
    'api.my_predictions(integer, uuid)',
    'api.claim_guest_predictions(jsonb)',
    'api.create_prediction_league(text)',
    'api.join_prediction_league(text)',
    'api.leave_prediction_league(uuid)',
    'api.my_prediction_leagues()',
    'api.predictions_league_standings(uuid, integer)',
    'api.reset_prediction_league_invite_code(uuid)'
  ];
  -- Inside the database only: no client role may call them.
  internal constant text[] := array[
    'app_private.prediction_fixture_open(app.fixture_status, timestamp with time zone, timestamp with time zone)',
    'app_private.prediction_invite_code_digest(text)',
    'app_private.prediction_league_count_for(uuid)',
    'app_private.prediction_league_is_member(uuid, uuid)',
    'app_private.prediction_points(integer, integer, integer, integer)',
    'app_private.prediction_result_kind(integer, integer, integer, integer)',
    'app_private.prediction_round_state(uuid, timestamp with time zone)',
    'app_private.predictions_access_allowed(uuid)',
    'app_private.predictions_assert_items(jsonb, integer)',
    'app_private.predictions_assert_reason(text)',
    'app_private.predictions_configure(text, boolean, uuid[], uuid)',
    'app_private.predictions_current_fantasy_season()',
    'app_private.predictions_current_round(uuid, timestamp with time zone)',
    'app_private.predictions_current_season()',
    'app_private.predictions_rescore_fixture(uuid, text)',
    'app_private.predictions_resolve_round(uuid, integer, timestamp with time zone)',
    'app_private.predictions_score_pending(timestamp with time zone, integer)',
    'app_private.predictions_score_tick()',
    'app_private.predictions_status(timestamp with time zone)',
    'app_private.predictions_unvoid_fixture(uuid, text)',
    'app_private.predictions_void_fixture(uuid, text)'
  ];
begin
  foreach object_name in array tables loop
    if to_regclass(object_name) is null then
      problems := problems || ('missing table ' || object_name);
      continue;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_class
      where oid = to_regclass(object_name) and relrowsecurity and relforcerowsecurity
    ) then
      problems := problems || ('row security is not on and forced for ' || object_name);
    end if;
    if has_table_privilege('anon', object_name, 'select, insert, update, delete')
      or has_table_privilege('authenticated', object_name, 'select, insert, update, delete') then
      problems := problems || ('a client can reach ' || object_name || ' directly');
    end if;
  end loop;

  foreach object_name in array public_reads loop
    signature := to_regprocedure(object_name);
    if signature is null then
      problems := problems || ('missing ' || object_name);
    elsif not has_function_privilege('anon', signature, 'execute')
      or not has_function_privilege('authenticated', signature, 'execute') then
      problems := problems || ('not readable by visitors: ' || object_name);
    end if;
  end loop;
  foreach object_name in array player_calls loop
    signature := to_regprocedure(object_name);
    if signature is null then
      problems := problems || ('missing ' || object_name);
    elsif has_function_privilege('anon', signature, 'execute')
      or not has_function_privilege('authenticated', signature, 'execute') then
      problems := problems || ('wrong callers for ' || object_name);
    end if;
  end loop;
  foreach object_name in array internal loop
    signature := to_regprocedure(object_name);
    if signature is null then
      problems := problems || ('missing ' || object_name);
    elsif has_function_privilege('anon', signature, 'execute')
      or has_function_privilege('authenticated', signature, 'execute')
      or has_function_privilege('service_role', signature, 'execute') then
      problems := problems || ('callable from outside the database: ' || object_name);
    end if;
  end loop;

  if (
    select count(*) from cron.job
    where jobname = 'predictions-score-tick' and schedule = '*/5 * * * *' and active
  ) <> 1 then
    problems := problems || 'job predictions-score-tick is not scheduled every 5 minutes'::text;
  end if;
  if (
    select count(*) from cron.job
    where jobname = 'predictions-history-prune' and schedule = '53 3 * * *' and active
  ) <> 1 then
    problems := problems || 'job predictions-history-prune is not scheduled daily at 03:53'::text;
  end if;

  if (select count(*) from app_private.prediction_settings) <> 1
    or (select mode from app_private.prediction_settings) is distinct from 'off' then
    problems := problems || 'the game is not installed switched off'::text;
  end if;

  if (
    select count(*) from supabase_migrations.schema_migrations
    where version in (
      '20260925090000', '20260925090100', '20260925090200', '20260925090300', '20260925090400'
    )
  ) <> 5 then
    problems := problems || 'history rows missing'::text;
  end if;

  -- One real read, as a visitor: the game answers that it is off.
  perform set_config('request.jwt.claims', '', true);
  answer := api.predictions_round(null, 'fr');
  if answer ->> 'allowed' is distinct from 'false' or answer ->> 'mode' is distinct from 'off' then
    problems := problems || ('unexpected answer from the journée read: ' || answer::text);
  end if;
  status := app_private.predictions_status(statement_timestamp());
  if status ->> 'jobActive' is distinct from 'true' then
    problems := problems || ('unexpected status: ' || status::text);
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- Tell the API about the new functions (delivered only on commit).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260925090400')
    then 'Applied. Pronostics is installed and switched off.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
