-- BotolaGO Production V2
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
