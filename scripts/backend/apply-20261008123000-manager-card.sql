-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply the Manager Card backend (BG-0158), migrations 20261008123000 to
-- 20261008123400: a manager's football identity built from their Fantasy
-- play (overall rating, tier, four stats, a permanent number, an optional
-- founder mark). It adds three app tables (app.manager_cards,
-- app.manager_card_seasons, app.manager_card_gameweeks), five app_private
-- tables (the two switches, the rules, the calculation ledger, the job log,
-- the retired numbers), the calculation and the founder-grant functions, four
-- read functions in the api schema, a one-line change to the account erasure
-- (it now also waits for the card's lock), and two pg_cron jobs
-- (manager-card-tick, manager-card-history-prune).
--
-- IT SHIPS OFF AND EMPTY. Both switches are false and no rules row exists, so
-- nothing is calculated and every read function refuses with manager_card_off.
-- Calibration, the first rules, the founder grant and the switches are later,
-- separate steps (docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md).
--
-- WHEN
--   After the pull request that adds this file is merged. Production must
--   already have 20261005130000 (public recaps) and 20261006143700
--   (automatic account deletion); the script refuses otherwise. Any quiet
--   moment; not at minute 12 of an hour (the Fantasy season orchestrator).
--   It takes short locks on app.profiles, the Fantasy tables its foreign keys
--   point at, and replaces app_private.account_deletion_erase.
--
-- BEFORE YOU RUN IT (AGENTS.md, "Before writing")
--   * Pause the Fantasy lifecycle tick, then switch it back on afterwards:
--       select app_private.fantasy_automation_configure(false);
--     The script refuses while it is on.
--   * Make sure nothing else is writing to this database: no GitHub Actions
--     run in progress, no pg_cron job mid-run, no other query running. The
--     other scheduled jobs are listed in AGENTS.md.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query.
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
--   * refuses to run twice, or where any Manager Card object already exists,
--     or where 20261005130000 or 20261006143700 is not recorded, or where the
--     tables and functions it builds on are missing, or while the Fantasy
--     lifecycle tick is switched on;
--   * records each of the five migration files in
--     supabase_migrations.schema_migrations, whole as statements[1], and runs
--     them in order from those records once each one's sha256 matches the
--     repository file;
--   * checks the result without saving anything: both switches are false, no
--     rules row exists, the settings table has one row, the four read
--     functions answer authenticated and service_role only, everything in
--     app_private answers postgres only, the erasure holds the card's lock,
--     both jobs are scheduled, the tick answers {"outcome":"off"} and wrote
--     nothing.
--   Switching anything on is separate and later: see the runbook.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  missing text[] := '{}';
  needed text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261005130000') then
    raise exception 'stop: migration 20261005130000 (public recaps) is not applied yet';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261006143700') then
    raise exception 'stop: migration 20261006143700 (automatic account deletion) is not applied yet';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
    where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400')) then
    raise exception 'stop: a Manager Card migration is already recorded as applied';
  end if;
  foreach needed in array array[
    'app.profiles', 'app.fantasy_seasons', 'app.fantasy_teams', 'app.fantasy_gameweeks',
    'app.fantasy_team_gameweek_results', 'app.fantasy_player_gameweek_points',
    'app.fantasy_lineups', 'app.fantasy_lineup_players', 'app.fantasy_transfer_batches',
    'app.fantasy_transfers', 'app.fantasy_position_rules', 'app.user_preferences',
    'app.teams', 'app.team_translations', 'app.seasons',
    'app_private.fantasy_gameweek_postwork', 'app_private.fantasy_automation_settings',
    'app_private.staff_principals', 'app_private.account_deletion_settings',
    'auth.users', 'cron.job'
  ] loop
    if to_regclass(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the tables this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app_private.assert_mfa_step_up()',
    'app_private.account_deletion_erase(uuid,integer)',
    'app_private.account_deletion_tick()'
  ] loop
    if to_regprocedure(needed) is null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: the functions this builds on are missing: %', missing;
  end if;
  foreach needed in array array[
    'app.manager_cards', 'app.manager_card_seasons', 'app.manager_card_gameweeks',
    'app_private.manager_card_settings', 'app_private.manager_card_rules',
    'app_private.manager_card_retired_serials', 'app_private.manager_card_evaluations',
    'app_private.manager_card_job_log'
  ] loop
    if to_regclass(needed) is not null then missing := missing || needed; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'stop: a Manager Card table already exists: %', missing;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname in ('app_private', 'api') and p.proname like '%manager\_card%')) then
    raise exception 'stop: a Manager Card function already exists';
  end if;
  if exists (select 1 from cron.job
    where jobname in ('manager-card-tick', 'manager-card-history-prune')) then
    raise exception 'stop: a manager-card job already exists';
  end if;
  -- AGENTS.md: a write that touches Fantasy runs with the Fantasy lifecycle
  -- tick paused. The erasure function this replaces reads Fantasy tables.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The five migrations, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261008123000',
  'manager_card_schema',
  array[$bg_20261008123000_file$-- Manager Card (BG-0158), part 1: the tables, the switch, nothing else.
--
-- The Manager Card is a manager's football identity built from their Fantasy
-- play: an overall rating (OVR), a tier, four stats (CAP captain choices, SEL
-- team selection, TRF transfers, CON consistency), a permanent number
-- (`BOT #004821`), an optional FOUNDER mark. The design and the owner's answers
-- (D1-D20, 2026-10-08) are in docs/backend/MANAGER_CARD_DOMAIN_PLAN.md; the
-- build order and the names shared between lanes are in
-- docs/engineering/tasks/BG-0158/IMPLEMENTATION_PLAN.md.
--
-- DISPLAY ONLY. Nothing here is read by a prize, ranking, league or Fantasy
-- rule, and nothing here writes a Fantasy table. The card reads Fantasy data;
-- the Fantasy rules never read the card.
--
-- SHIPS OFF. app_private.manager_card_settings has one row with both switches
-- false, and NO ruleset row is inserted: the scales and tier cut-offs are
-- calibrated on real 2026/27 data first, then inserted by a reviewed script
-- (rules v1). Until then the tick answers `off` / `no_rules` and writes
-- nothing. This migration adds tables and one switch function only; no
-- existing table, function or row changes. The calculation, the read API and
-- the scheduled jobs follow in 20261008123200, 20261008123300 and
-- 20261008123400; 20261008123100 teaches the account erasure to hold this
-- feature's advisory lock.
--
-- DELETION. Every card row hangs off app.profiles by cascade (cards from the
-- profile; seasons and gameweek history from the card), so erasing an account
-- (app_private.account_deletion_erase, 20261006143700) removes them with the
-- Auth user. The permanent number is not reusable (D14, D15): an AFTER DELETE
-- trigger on app.manager_cards copies the serial, and only the serial, to
-- app_private.manager_card_retired_serials, which holds no user id and is the
-- one thing that outlives the account. Founder status goes with the account.
--
-- CATALOGUE ROLLBACK. Season-, team- and gameweek-keyed rows cascade from
-- their Fantasy parent (on delete cascade), so api.service_rollback_fantasy_catalog
-- (20260918170000) and the restage maintenance script can still delete a
-- season, gameweeks or teams without tripping over a card row.
--
-- Every table: row security enabled and forced, all rights revoked from
-- public, anon, authenticated and service_role, no policy, an index on every
-- foreign-key column. Reads go through api functions (20261008123300).

-- ---------------------------------------------------------------------------
-- The switch: one row, both off, changed only by app_private.manager_card_configure
-- ---------------------------------------------------------------------------
create table app_private.manager_card_settings (
  id boolean primary key default true,
  compute_enabled boolean not null default false,
  read_enabled boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  constraint manager_card_settings_singleton check (id)
);
insert into app_private.manager_card_settings (id) values (true);
alter table app_private.manager_card_settings enable row level security;
alter table app_private.manager_card_settings force row level security;
revoke all on app_private.manager_card_settings from public, anon, authenticated, service_role;
comment on table app_private.manager_card_settings is
  'The Manager Card switches, one row, both off by default. compute_enabled lets the tick write cards; read_enabled lets the api functions answer. Changed only by app_private.manager_card_configure.';

create function app_private.manager_card_configure(
  p_compute boolean default null,
  p_read boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result app_private.manager_card_settings%rowtype;
begin
  -- A null leaves that switch as it is.
  update app_private.manager_card_settings set
    compute_enabled = coalesce(p_compute, compute_enabled),
    read_enabled = coalesce(p_read, read_enabled),
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object(
    'computeEnabled', result.compute_enabled,
    'readEnabled', result.read_enabled
  );
end;
$$;
revoke all on function app_private.manager_card_configure(boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function app_private.manager_card_configure(boolean, boolean) to postgres;
comment on function app_private.manager_card_configure(boolean, boolean) is
  'Owner-run switch for the Manager Card: (compute, read); null leaves a switch as it is. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- Rules: versioned, one active, immutable once inserted. No row ships.
-- ---------------------------------------------------------------------------
create table app_private.manager_card_rules (
  version integer primary key,
  created_at timestamptz not null default statement_timestamp(),
  config jsonb not null,
  active boolean not null default false,
  constraint manager_card_rules_version_check check (version > 0),
  constraint manager_card_rules_config_check check (jsonb_typeof(config) = 'object')
);
create unique index manager_card_rules_one_active_idx
  on app_private.manager_card_rules (active) where active;
alter table app_private.manager_card_rules enable row level security;
alter table app_private.manager_card_rules force row level security;
revoke all on app_private.manager_card_rules from public, anon, authenticated, service_role;
comment on table app_private.manager_card_rules is
  'Versioned scales, tier cut-offs, windows and minimums (config jsonb). At most one active row; config and version never change once inserted: a new formula is a new version. No row ships (calibration first).';

create function app_private.manager_card_rules_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.config is distinct from old.config or new.version is distinct from old.version then
    raise exception using errcode = 'PT409', message = 'manager_card_rules_immutable';
  end if;
  return new;
end;
$$;
create trigger manager_card_rules_immutable
before update on app_private.manager_card_rules
for each row execute function app_private.manager_card_rules_immutable();

-- ---------------------------------------------------------------------------
-- Retired numbers: the serial alone, no user id
-- ---------------------------------------------------------------------------
create table app_private.manager_card_retired_serials (
  serial text primary key,
  retired_at timestamptz not null default statement_timestamp(),
  constraint manager_card_retired_serials_serial_check check (serial ~ '^[1-9][0-9]{5}$')
);
alter table app_private.manager_card_retired_serials enable row level security;
alter table app_private.manager_card_retired_serials force row level security;
revoke all on app_private.manager_card_retired_serials from public, anon, authenticated, service_role;
comment on table app_private.manager_card_retired_serials is
  'Card numbers of erased accounts, never issued again. Holds no user id: filled by the AFTER DELETE trigger on app.manager_cards.';

-- ---------------------------------------------------------------------------
-- The card: one row per manager
-- ---------------------------------------------------------------------------
create table app.manager_cards (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  serial text,
  founder_cohort smallint,
  founder_granted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint manager_cards_serial_key unique (serial),
  constraint manager_cards_serial_check check (serial is null or serial ~ '^[1-9][0-9]{5}$'),
  constraint manager_cards_founder_check check (
    (founder_cohort is null) = (founder_granted_at is null)
    and (founder_cohort is null or founder_cohort > 0)
  )
);
comment on table app.manager_cards is
  'One Manager Card per manager (display only). serial is assigned once and never changes or returns; founder_* is set once by the owner''s grant script. Row security forced, no policy: read through api functions.';
create trigger manager_cards_set_updated_at
before update on app.manager_cards
for each row execute function app_private.set_updated_at();

create function app_private.manager_cards_guard_serial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception using errcode = 'PT409', message = 'manager_card_user_immutable';
    end if;
    -- null -> value once; never changed or cleared after.
    if old.serial is not null and new.serial is distinct from old.serial then
      raise exception using errcode = 'PT409', message = 'manager_card_serial_immutable';
    end if;
    if new.serial is null or new.serial is not distinct from old.serial then
      return new;
    end if;
  end if;
  -- A number that belonged to an erased account is never issued again.
  if new.serial is not null and exists (
    select 1 from app_private.manager_card_retired_serials retired
    where retired.serial = new.serial
  ) then
    raise exception using errcode = 'PT409', message = 'manager_card_serial_retired';
  end if;
  return new;
end;
$$;
create trigger manager_cards_guard_serial
before insert or update on app.manager_cards
for each row execute function app_private.manager_cards_guard_serial();

create function app_private.manager_cards_retire_serial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.serial is not null then
    insert into app_private.manager_card_retired_serials (serial)
    values (old.serial)
    on conflict (serial) do nothing;
  end if;
  return old;
end;
$$;
create trigger manager_cards_retire_serial
after delete on app.manager_cards
for each row execute function app_private.manager_cards_retire_serial();

alter table app.manager_cards enable row level security;
alter table app.manager_cards force row level security;
revoke all on app.manager_cards from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The season card: one row per manager per Fantasy season
-- ---------------------------------------------------------------------------
create table app.manager_card_seasons (
  user_id uuid not null references app.manager_cards(user_id) on delete cascade,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete cascade,
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete cascade,
  ovr smallint,
  tier text,
  cap smallint,
  sel smallint,
  trf smallint,
  con smallint,
  cap_raw numeric,
  sel_raw numeric,
  trf_raw numeric,
  con_raw numeric,
  gameweeks_counted integer not null default 0,
  provisional boolean not null default true,
  rules_version integer not null,
  through_gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete cascade,
  calculated_at timestamptz not null default statement_timestamp(),
  constraint manager_card_seasons_pkey primary key (user_id, fantasy_season_id),
  constraint manager_card_seasons_figures_check check (
    (ovr is null or ovr between 1 and 99)
    and (cap is null or cap between 1 and 99)
    and (sel is null or sel between 1 and 99)
    and (trf is null or trf between 1 and 99)
    and (con is null or con between 1 and 99)
  ),
  constraint manager_card_seasons_tier_check check (
    tier is null or tier in ('homa', 'stade', 'pro', 'champion', 'legend')
  ),
  constraint manager_card_seasons_counted_check check (gameweeks_counted >= 0),
  constraint manager_card_seasons_rules_version_check check (rules_version > 0)
);
create index manager_card_seasons_season_idx on app.manager_card_seasons (fantasy_season_id);
create index manager_card_seasons_team_idx on app.manager_card_seasons (fantasy_team_id);
create index manager_card_seasons_through_gameweek_idx on app.manager_card_seasons (through_gameweek_id);
comment on table app.manager_card_seasons is
  'A manager''s card figures for one Fantasy season, as of through_gameweek_id. Recomputed from every final row, never by deltas. Display only. Cascades from the card, the season, the team and the gameweek.';
alter table app.manager_card_seasons enable row level security;
alter table app.manager_card_seasons force row level security;
revoke all on app.manager_card_seasons from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The history: the same figures as of each evaluated gameweek
-- ---------------------------------------------------------------------------
create table app.manager_card_gameweeks (
  user_id uuid not null references app.manager_cards(user_id) on delete cascade,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete cascade,
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete cascade,
  ovr smallint,
  tier text,
  cap smallint,
  sel smallint,
  trf smallint,
  con smallint,
  cap_raw numeric,
  sel_raw numeric,
  trf_raw numeric,
  con_raw numeric,
  gameweeks_counted integer not null default 0,
  provisional boolean not null default true,
  rules_version integer not null,
  calculated_at timestamptz not null default statement_timestamp(),
  constraint manager_card_gameweeks_pkey primary key (user_id, gameweek_id),
  constraint manager_card_gameweeks_figures_check check (
    (ovr is null or ovr between 1 and 99)
    and (cap is null or cap between 1 and 99)
    and (sel is null or sel between 1 and 99)
    and (trf is null or trf between 1 and 99)
    and (con is null or con between 1 and 99)
  ),
  constraint manager_card_gameweeks_tier_check check (
    tier is null or tier in ('homa', 'stade', 'pro', 'champion', 'legend')
  ),
  constraint manager_card_gameweeks_counted_check check (gameweeks_counted >= 0),
  constraint manager_card_gameweeks_rules_version_check check (rules_version > 0)
);
create index manager_card_gameweeks_season_idx on app.manager_card_gameweeks (fantasy_season_id);
create index manager_card_gameweeks_gameweek_idx on app.manager_card_gameweeks (gameweek_id);
comment on table app.manager_card_gameweeks is
  'One history row per manager per evaluated gameweek: the card''s figures as of that gameweek. Display only. Cascades from the card, the season and the gameweek.';
alter table app.manager_card_gameweeks enable row level security;
alter table app.manager_card_gameweeks force row level security;
revoke all on app.manager_card_gameweeks from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The ledger and the job log
-- ---------------------------------------------------------------------------
create table app_private.manager_card_evaluations (
  gameweek_id uuid not null references app.fantasy_gameweeks(id) on delete cascade,
  rules_version integer not null references app_private.manager_card_rules(version) on delete restrict,
  scoring_input_version bigint not null,
  evaluated_at timestamptz not null default statement_timestamp(),
  cards_written integer not null default 0,
  constraint manager_card_evaluations_pkey primary key (gameweek_id, rules_version),
  constraint manager_card_evaluations_cards_check check (cards_written >= 0)
);
create index manager_card_evaluations_rules_version_idx
  on app_private.manager_card_evaluations (rules_version);
comment on table app_private.manager_card_evaluations is
  'Which gameweek was evaluated under which rules version and which scoring_input_version. A gameweek whose current version has no matching row is evaluated again, with every later one.';
alter table app_private.manager_card_evaluations enable row level security;
alter table app_private.manager_card_evaluations force row level security;
revoke all on app_private.manager_card_evaluations from public, anon, authenticated, service_role;

create table app_private.manager_card_job_log (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default statement_timestamp(),
  finished_at timestamptz,
  outcome text not null,
  detail jsonb not null default '{}'::jsonb,
  constraint manager_card_job_log_outcome_check check (outcome ~ '^[a-z0-9_]{1,40}$'),
  constraint manager_card_job_log_detail_check check (
    jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096
  )
);
create index manager_card_job_log_started_idx on app_private.manager_card_job_log (started_at);
comment on table app_private.manager_card_job_log is
  'One row per tick that did work: counts only, no user id. Pruned after 180 days by manager-card-history-prune.';
alter table app_private.manager_card_job_log enable row level security;
alter table app_private.manager_card_job_log force row level security;
revoke all on app_private.manager_card_job_log from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger functions are not callable by any API role
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.manager_card_rules_immutable(),
  app_private.manager_cards_guard_serial(),
  app_private.manager_cards_retire_serial()
from public, anon, authenticated, service_role;
$bg_20261008123000_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261008123100',
  'manager_card_erase_lock',
  array[$bg_20261008123100_file$-- Manager Card (BG-0158), part 2: the account erasure holds the card's lock.
--
-- app_private.account_deletion_erase (20261006143700) takes, without waiting,
-- the advisory lock of every tick that writes rows it erases, and refuses
-- (account_deletion_writer_busy) when one is running. The Manager Card tick
-- (20261008123200) writes app.manager_cards and its season and history rows,
-- which the erasure removes by cascade, so it takes the same kind of lock:
--
--   pg_try_advisory_xact_lock(hashtextextended('botolago:manager-card', 0))
--
-- This migration adds that lock to the erasure, in the same condition and with
-- the same failure behaviour as the four existing ones (the worker releases
-- the request for the next hourly run). The function is patched in place: its
-- exact text is replaced once, and the migration stops if the anchor is not
-- found exactly once or if the definition would not change. CREATE OR REPLACE
-- keeps the function's owner and grants.

do $lock$
declare
  definition text;
  old_text text;
  new_text text;
begin
  definition := pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure);
  old_text := '    or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(''botolago.fantasy_prize_evaluation'', 0))
';
  new_text := old_text
    || '    or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(''botolago:manager-card'', 0))
';
  if (length(definition) - length(replace(definition, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'manager card erase lock: the erasure is not the 20261006143700 version';
  end if;
  if replace(definition, old_text, new_text) = definition then
    raise exception 'manager card erase lock: the definition would not change';
  end if;
  execute replace(definition, old_text, new_text);
end;
$lock$;
$bg_20261008123100_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261008123200',
  'manager_card_compute',
  array[$bg_20261008123200_file$-- Manager Card (BG-0158), part 3: the calculation, the tick, the number and the
-- founder grant.
--
-- WHAT THIS ADDS. Functions only, all in app_private, all security definer with
-- search_path = '', owned by postgres and executable by postgres alone (no
-- public, anon, authenticated or service_role grant). No table, row, trigger or
-- schedule is created here: the tables are 20261008123000, the scheduled jobs
-- 20261008123400. Nothing here runs until the owner switches compute on
-- (app_private.manager_card_configure) AND inserts an active ruleset row; until
-- then the tick answers `off` / `no_rules` and writes nothing.
--
-- DISPLAY ONLY, READ ONLY TOWARDS FANTASY. The functions read Fantasy tables and
-- write only app.manager_cards, app.manager_card_seasons,
-- app.manager_card_gameweeks, app_private.manager_card_evaluations and
-- app_private.manager_card_job_log. They never write a Fantasy table, and no
-- Fantasy, prize, league or ranking function calls them.
--
-- THE CALCULATION (docs/backend/MANAGER_CARD_DOMAIN_PLAN.md section 3).
--   evaluable gameweek: status in ('finalized','corrected'), points_state =
--     'final', and the postwork row for its CURRENT scoring_input_version has
--     completed_at set. Cancelled gameweeks never count.
--   evaluate_gameweek(G, rules_version) takes every evaluable gameweek of G's
--     season up to and including G, and recomputes each team's figures from all
--     of those rows (never by deltas), for the active teams that have a final
--     result in G and whose profile is not marked deleted:
--     CAP  captain's final points / best starter's final points, per week;
--          the vice counts only when the captain played 0 minutes; both 0 or
--          best <= 0 skips the week; a scoring_details effectiveCaptainId that
--          disagrees skips the week and is counted in the result; weeks whose
--          deadline precedes config.cap_ignore_deadlines_before are skipped.
--     SEL  starting_points / best legal eleven from the lineup's fifteen
--          (formations from fantasy_position_rules), Bench Boost weeks and
--          optimum <= 0 skipped, clamped to 0..1.
--     TRF  per transfer of a confirmed, non-Free-Hit batch: in-player points
--          minus out-player points over the batch's window of
--          config.trf_window_gameweeks non-cancelled gameweeks, minus
--          point_hit / transfers_count. A batch counts once its whole window is
--          evaluable, or once the season's last gameweek is; no batch: null.
--     CON  share of weeks in the top half of all ACTIVE teams' final results
--          that gameweek (ties in the manager's favour).
--     Each raw figure goes through its piecewise-linear scale to 1..99; OVR is
--     the rounded mean of the non-null stats (null under three); the tier
--     comes from the cut-offs. Under config.minimum_gameweeks counted weeks
--     everything is null; under config.provisional_below the card is
--     provisional. Every threshold is read from the ruleset's config.
--   The scoring_input_version of the season's gameweeks is fingerprinted before
--     and after the calculation; if it moved, nothing is written and the answer
--     is `version_changed`. The ledger row stores the version that was read, so
--     any change that slips past is evaluated again on the next tick.
--   Idempotent: rows are rewritten only when a figure differs, so a second run
--     leaves every row, calculated_at included, as it was.
--
-- LOAD. Recomputing from all rows costs O(teams x gameweeks so far) per
-- evaluated gameweek. A gameweek is never split; config.batch_size is the
-- number of teams after which the tick starts no further gameweek (the first is
-- always evaluated). Size it on a large fixture before switching on.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app_private.manager_card_config_number(p_config jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_config is null or jsonb_typeof(p_config -> p_key) is distinct from 'number' then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  return (p_config ->> p_key)::numeric;
end;
$$;

-- Piecewise-linear scale: p_points is [[raw, score], ...]; values outside the
-- first and last raw are clamped; the result is rounded and kept in 1..99.
create function app_private.manager_card_scale(p_raw numeric, p_points jsonb)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  lo_x numeric; lo_y numeric; hi_x numeric; hi_y numeric; result numeric;
begin
  if p_raw is null then
    return null;
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points) < 2
    or exists (
      select 1 from jsonb_array_elements(p_points) point
      where jsonb_typeof(point) is distinct from 'array'
        or jsonb_array_length(point) <> 2
        or jsonb_typeof(point -> 0) is distinct from 'number'
        or jsonb_typeof(point -> 1) is distinct from 'number'
    ) then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  select (point ->> 0)::numeric, (point ->> 1)::numeric into lo_x, lo_y
  from jsonb_array_elements(p_points) point
  where (point ->> 0)::numeric <= p_raw
  order by (point ->> 0)::numeric desc, (point ->> 1)::numeric desc limit 1;
  select (point ->> 0)::numeric, (point ->> 1)::numeric into hi_x, hi_y
  from jsonb_array_elements(p_points) point
  where (point ->> 0)::numeric > p_raw
  order by (point ->> 0)::numeric asc, (point ->> 1)::numeric asc limit 1;
  if lo_x is null then
    result := hi_y;
  elsif hi_x is null then
    result := lo_y;
  else
    result := lo_y + (hi_y - lo_y) * (p_raw - lo_x) / (hi_x - lo_x);
  end if;
  return least(99, greatest(1, round(result)))::smallint;
end;
$$;

-- Tier from OVR: p_tiers is {"stade": n, "pro": n, "champion": n, "legend": n}
-- (the lowest OVR of each tier); everything below stade is homa.
create function app_private.manager_card_tier(p_ovr integer, p_tiers jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  legend numeric := app_private.manager_card_config_number(p_tiers, 'legend');
  champion numeric := app_private.manager_card_config_number(p_tiers, 'champion');
  pro numeric := app_private.manager_card_config_number(p_tiers, 'pro');
  stade numeric := app_private.manager_card_config_number(p_tiers, 'stade');
begin
  if p_ovr is null then
    return null;
  end if;
  return case
    when p_ovr >= legend then 'legend'
    when p_ovr >= champion then 'champion'
    when p_ovr >= pro then 'pro'
    when p_ovr >= stade then 'stade'
    else 'homa'
  end;
end;
$$;

-- A fingerprint of everything that decides whether a gameweek is evaluable and
-- which scoring it was evaluated on, for one season.
create function app_private.manager_card_season_fingerprint(p_fantasy_season_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(md5(string_agg(
    gameweek.id::text || ':' || gameweek.status::text || ':' || gameweek.points_state::text
      || ':' || gameweek.scoring_input_version::text || ':' || coalesce(work.completed_at::text, ''),
    ',' order by gameweek.id
  )), '')
  from app.fantasy_gameweeks gameweek
  left join app_private.fantasy_gameweek_postwork work
    on work.gameweek_id = gameweek.id and work.calculation_version = gameweek.scoring_input_version
  where gameweek.fantasy_season_id = p_fantasy_season_id;
$$;

-- ---------------------------------------------------------------------------
-- The permanent number: random 100000-999999, unused, never retired
-- ---------------------------------------------------------------------------
create function app_private.manager_card_assign_serial(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_serial text;
  candidate text;
  bytes bytea;
  attempt integer := 0;
begin
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- The card row is created here when it does not exist yet.
  insert into app.manager_cards (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select card.serial into current_serial from app.manager_cards card where card.user_id = p_user_id;
  if current_serial is not null then
    return current_serial;
  end if;
  loop
    attempt := attempt + 1;
    if attempt > 100 then
      raise exception using errcode = 'PT409', message = 'manager_card_serial_unavailable';
    end if;
    bytes := extensions.gen_random_bytes(4);
    candidate := (
      100000 + (
        (get_byte(bytes, 0)::bigint * 16777216 + get_byte(bytes, 1)::bigint * 65536
          + get_byte(bytes, 2)::bigint * 256 + get_byte(bytes, 3)::bigint) % 900000
      )
    )::text;
    if exists (select 1 from app.manager_cards card where card.serial = candidate)
      or exists (select 1 from app_private.manager_card_retired_serials retired where retired.serial = candidate) then
      continue;
    end if;
    begin
      update app.manager_cards set serial = candidate
      where user_id = p_user_id and serial is null;
      select card.serial into current_serial from app.manager_cards card where card.user_id = p_user_id;
      return current_serial;
    exception when unique_violation then
      -- Another writer took the number between the check and the write: draw again.
      null;
    end;
  end loop;
  return current_serial;
end;
$$;

-- Drops the calculation's temporary tables. Dynamic because they exist only at
-- run time (the static checks cannot see them).
create function app_private.manager_card_drop_temp()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  execute 'drop table if exists pg_temp.mc_gws, pg_temp.mc_all, pg_temp.mc_teams, pg_temp.mc_res, pg_temp.mc_pts, '
    'pg_temp.mc_lp, pg_temp.mc_cap, pg_temp.mc_form, pg_temp.mc_lpos, pg_temp.mc_best, pg_temp.mc_sel, '
    'pg_temp.mc_con, pg_temp.mc_trf, pg_temp.mc_fig';
end;
$$;

-- ---------------------------------------------------------------------------
-- Evaluate one gameweek
-- ---------------------------------------------------------------------------
create function app_private.manager_card_evaluate_gameweek(p_gameweek_id uuid, p_rules_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  gw app.fantasy_gameweeks%rowtype;
  season app.fantasy_seasons%rowtype;
  rules app_private.manager_card_rules%rowtype;
  cfg jsonb;
  min_weeks integer;
  provisional_below integer;
  trf_window integer;
  cap_ignore timestamptz;
  scales jsonb;
  tiers jsonb;
  fingerprint_before text;
  fingerprint_after text;
  last_seq integer;
  team_count integer;
  mismatch_count integer;
  season_changed integer;
  history_changed integer;
  new_user uuid;
begin
  if p_gameweek_id is null or p_rules_version is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Same key as the tick (re-entrant inside the tick's own transaction).
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  select * into rules from app_private.manager_card_rules where version = p_rules_version;
  if not found then
    raise exception using errcode = 'PT404', message = 'manager_card_rules_not_found';
  end if;
  cfg := rules.config;
  min_weeks := app_private.manager_card_config_number(cfg, 'minimum_gameweeks')::integer;
  provisional_below := app_private.manager_card_config_number(cfg, 'provisional_below')::integer;
  trf_window := app_private.manager_card_config_number(cfg, 'trf_window_gameweeks')::integer;
  if trf_window < 1 then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  scales := cfg -> 'scales';
  tiers := cfg -> 'tiers';
  if jsonb_typeof(scales) is distinct from 'object' or jsonb_typeof(tiers) is distinct from 'object'
    or jsonb_typeof(scales -> 'cap') is distinct from 'array' or jsonb_typeof(scales -> 'sel') is distinct from 'array'
    or jsonb_typeof(scales -> 'trf') is distinct from 'array' or jsonb_typeof(scales -> 'con') is distinct from 'array' then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  cap_ignore := case when jsonb_typeof(cfg -> 'cap_ignore_deadlines_before') = 'string'
    then (cfg ->> 'cap_ignore_deadlines_before')::timestamptz end;

  select * into gw from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  select * into season from app.fantasy_seasons where id = gw.fantasy_season_id;

  if not (
    gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
    and exists (
      select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
        and work.completed_at is not null
    )
  ) then
    return jsonb_build_object('outcome', 'not_evaluable', 'gameweekId', gw.id);
  end if;

  fingerprint_before := app_private.manager_card_season_fingerprint(season.id);

  -- Evaluable gameweeks of the season up to and including this one.
  execute pg_catalog.concat($q$
  create temp table mc_gws on commit drop as
  select g.id as gameweek_id, g.sequence_number as seq, g.deadline_at
  from app.fantasy_gameweeks g
  where g.fantasy_season_id = $1
    and g.sequence_number <= $3
    and g.status in ('finalized', 'corrected') and g.points_state = 'final'
    and exists (
      select 1 from app_private.fantasy_gameweek_postwork work
      where work.gameweek_id = g.id and work.calculation_version = g.scoring_input_version
        and work.completed_at is not null
    )
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_gws_idx on pg_temp.mc_gws (gameweek_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Every non-cancelled gameweek of the season (the TRF windows walk these).
  execute pg_catalog.concat($q$
  create temp table mc_all on commit drop as
  select g.id as gameweek_id, g.sequence_number as seq
  from app.fantasy_gameweeks g
  where g.fantasy_season_id = $1 and g.status <> 'cancelled'
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_all_idx on pg_temp.mc_all (seq)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  select max(seq)  from pg_temp.mc_all
  $q$, '') into last_seq using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The managers rated by this run: active teams with a final result in this
  -- gameweek whose profile is not marked for deletion.
  execute pg_catalog.concat($q$
  create temp table mc_teams on commit drop as
  select t.id as team_id, t.user_id
  from app.fantasy_teams t
  join app.profiles p on p.id = t.user_id and p.deleted_at is null
  join app.fantasy_team_gameweek_results r
    on r.fantasy_team_id = t.id and r.gameweek_id = $2 and r.state = 'final'
  where t.fantasy_season_id = $1 and t.status = 'active'
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_teams_idx on pg_temp.mc_teams (team_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Their final results in every evaluable gameweek so far.
  execute pg_catalog.concat($q$
  create temp table mc_res on commit drop as
  select r.fantasy_team_id as team_id, r.gameweek_id, g.seq, g.deadline_at, r.final_score,
    r.starting_points, r.chip_type, r.scoring_details, l.id as lineup_id
  from pg_temp.mc_teams t
  join app.fantasy_team_gameweek_results r on r.fantasy_team_id = t.team_id and r.state = 'final'
  join pg_temp.mc_gws g on g.gameweek_id = r.gameweek_id
  left join app.fantasy_lineups l on l.fantasy_team_id = t.team_id and l.gameweek_id = r.gameweek_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_res_idx on pg_temp.mc_res (team_id, gameweek_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create index mc_res_lineup_idx on pg_temp.mc_res (lineup_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Every player's points in those gameweeks (owned or not).
  execute pg_catalog.concat($q$
  create temp table mc_pts on commit drop as
  select p.fantasy_player_id, p.gameweek_id, coalesce(p.final_points, 0) as pts, p.minutes_played as mins
  from app.fantasy_player_gameweek_points p
  join pg_temp.mc_gws g on g.gameweek_id = p.gameweek_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create unique index mc_pts_idx on pg_temp.mc_pts (fantasy_player_id, gameweek_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The locked lineups of those results, with each player's week.
  execute pg_catalog.concat($q$
  create temp table mc_lp on commit drop as
  select r.team_id, r.gameweek_id, r.lineup_id, lp.fantasy_player_id, lp.slot, lp.captain, lp.vice_captain,
    fp.position_id, coalesce(pp.pts, 0) as pts, coalesce(pp.mins, 0) as mins
  from pg_temp.mc_res r
  join app.fantasy_lineup_players lp on lp.lineup_id = r.lineup_id
  join app.fantasy_players fp on fp.id = lp.fantasy_player_id
  left join pg_temp.mc_pts pp on pp.fantasy_player_id = lp.fantasy_player_id and pp.gameweek_id = r.gameweek_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create index mc_lp_idx on pg_temp.mc_lp (lineup_id)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_res
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_pts
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_lp
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- CAP: one ratio per team-week, null when the week is skipped.
  execute pg_catalog.concat($q$
  create temp table mc_cap on commit drop as
  with per_lineup as (
    select lp.lineup_id,
      max(lp.pts) filter (where lp.slot = 'starter') as best,
      (array_agg(lp.fantasy_player_id) filter (where lp.captain))[1] as cap_id,
      coalesce(max(lp.mins) filter (where lp.captain), 0) as cap_mins,
      coalesce(max(lp.pts) filter (where lp.captain), 0) as cap_pts,
      (array_agg(lp.fantasy_player_id) filter (where lp.vice_captain))[1] as vice_id,
      coalesce(max(lp.mins) filter (where lp.vice_captain), 0) as vice_mins,
      coalesce(max(lp.pts) filter (where lp.vice_captain), 0) as vice_pts
    from pg_temp.mc_lp lp
    group by lp.lineup_id
  ), effective as (
    select pl.lineup_id, pl.best,
      case when pl.cap_id is null then null
           when pl.cap_mins > 0 then pl.cap_id
           when pl.vice_id is not null and pl.vice_mins > 0 then pl.vice_id end as eff_id,
      case when pl.cap_id is null then null
           when pl.cap_mins > 0 then pl.cap_pts
           when pl.vice_id is not null and pl.vice_mins > 0 then pl.vice_pts end as eff_pts
    from per_lineup pl
  )
  select r.team_id, r.gameweek_id,
    ($5 is not null and r.deadline_at < $5) as ignored,
    (e.eff_id is not null
      and r.scoring_details is not null and r.scoring_details ? 'effectiveCaptainId'
      and (r.scoring_details ->> 'effectiveCaptainId') is distinct from e.eff_id::text) as mismatch,
    case
      when $5 is not null and r.deadline_at < $5 then null
      when e.eff_id is null or e.best is null or e.best <= 0 then null
      when r.scoring_details is not null and r.scoring_details ? 'effectiveCaptainId'
        and (r.scoring_details ->> 'effectiveCaptainId') is distinct from e.eff_id::text then null
      else greatest(0, e.eff_pts::numeric / e.best)
    end as ratio
  from pg_temp.mc_res r
  left join effective e on e.lineup_id = r.lineup_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  select count(*)  from pg_temp.mc_cap where mismatch and not ignored
  $q$, '') into mismatch_count using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- SEL: the legal formations from the season's ruleset, then the best eleven
  -- the lineup's fifteen could have produced.
  execute pg_catalog.concat($q$
  create temp table mc_form on commit drop as
  with recursive pr as (
    select rule.position_id, rule.starting_minimum as mn, rule.starting_maximum as mx,
      row_number() over (order by rule.position_id) as rn
    from app.fantasy_position_rules rule
    where rule.ruleset_id = $4
  ), xis as (
    select distinct s.n from (
      select lineup_id, count(*)::integer as n from pg_temp.mc_lp where slot = 'starter' group by lineup_id
    ) s
  ), f(xi, rn, total, ns) as (
    select xis.n, 0::integer, 0::integer, array[]::integer[] from xis
    union all
    select f.xi, pr.rn::integer, f.total + k, f.ns || k
    from f
    join pr on pr.rn = f.rn + 1
    cross join lateral generate_series(pr.mn, least(pr.mx, f.xi - f.total)) as k
  ), forms as (
    select row_number() over (order by f.xi, f.ns) as fid, f.xi, f.ns
    from f
    where f.rn = (select max(rn) from pr) and f.total = f.xi
  )
  select forms.fid, forms.xi, pr.position_id, forms.ns[pr.rn] as n
  from forms cross join pr
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  create temp table mc_lpos on commit drop as
  select ranked.lineup_id, ranked.position_id, ranked.k,
    sum(ranked.pts) over (
      partition by ranked.lineup_id, ranked.position_id order by ranked.k rows unbounded preceding
    ) as cs
  from (
    select lp.lineup_id, lp.position_id, lp.pts,
      row_number() over (
        partition by lp.lineup_id, lp.position_id order by lp.pts desc, lp.fantasy_player_id
      ) as k
    from pg_temp.mc_lp lp
  ) ranked
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  create index mc_lpos_idx on pg_temp.mc_lpos (lineup_id, position_id, k)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_lpos
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  create temp table mc_best on commit drop as
  select scored.lineup_id, max(scored.total) as best
  from (
    select l.lineup_id, f.fid, sum(coalesce(c.cs, 0)) as total,
      bool_and(f.n = 0 or c.k is not null) as ok
    from (
      select lineup_id, count(*) filter (where slot = 'starter') as xi
      from pg_temp.mc_lp group by lineup_id
    ) l
    join pg_temp.mc_form f on f.xi = l.xi
    left join pg_temp.mc_lpos c
      on c.lineup_id = l.lineup_id and c.position_id = f.position_id and c.k = f.n
    group by l.lineup_id, f.fid
  ) scored
  where scored.ok
  group by scored.lineup_id
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  create temp table mc_sel on commit drop as
  select r.team_id, r.gameweek_id,
    least(1, greatest(0, r.starting_points::numeric / b.best)) as ratio
  from pg_temp.mc_res r
  join pg_temp.mc_best b on b.lineup_id = r.lineup_id
  where r.chip_type is distinct from 'bench_boost' and b.best > 0
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- CON: rank every active team's final result of each evaluable gameweek.
  execute pg_catalog.concat($q$
  create temp table mc_con on commit drop as
  select ranked.team_id, ranked.gameweek_id, (ranked.above * 2 < ranked.n) as top_half
  from (
    select r.fantasy_team_id as team_id, r.gameweek_id,
      rank() over (partition by r.gameweek_id order by r.final_score desc) - 1 as above,
      count(*) over (partition by r.gameweek_id) as n
    from app.fantasy_team_gameweek_results r
    join app.fantasy_teams t
      on t.id = r.fantasy_team_id and t.fantasy_season_id = $1 and t.status = 'active'
    join pg_temp.mc_gws g on g.gameweek_id = r.gameweek_id
    where r.state = 'final'
  ) ranked
  where ranked.team_id in (select team_id from pg_temp.mc_teams)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- TRF: confirmed, non-Free-Hit batches whose window is evaluable.
  execute pg_catalog.concat($q$
  create temp table mc_trf on commit drop as
  with batches as (
    select b.id as batch_id, b.fantasy_team_id as team_id, b.point_hit, b.transfers_count,
      bg.sequence_number as b_seq
    from app.fantasy_transfer_batches b
    join pg_temp.mc_teams t on t.team_id = b.fantasy_team_id
    join app.fantasy_gameweeks bg on bg.id = b.gameweek_id
    where b.status = 'confirmed' and b.chip_type is distinct from 'free_hit'
  ), win as (
    select bt.batch_id, a.gameweek_id, a.seq,
      row_number() over (partition by bt.batch_id order by a.seq) as rn
    from batches bt
    join pg_temp.mc_all a on a.seq >= bt.b_seq
  ), win_w as (
    select * from win where rn <= $6
  ), ready as (
    select ww.batch_id
    from win_w ww
    left join pg_temp.mc_gws g on g.gameweek_id = ww.gameweek_id
    group by ww.batch_id
    having bool_and(g.gameweek_id is not null)
      or exists (select 1 from pg_temp.mc_gws lg where lg.seq = $7)
  ), used as (
    select ww.batch_id, ww.gameweek_id
    from win_w ww
    join ready on ready.batch_id = ww.batch_id
    join pg_temp.mc_gws g on g.gameweek_id = ww.gameweek_id
  )
  select bt.team_id, tr.id as transfer_id,
    coalesce(sum(case when p.fantasy_player_id = tr.player_in_id then p.pts else -p.pts end), 0)
      - bt.point_hit::numeric / bt.transfers_count as value
  from batches bt
  join ready on ready.batch_id = bt.batch_id
  join app.fantasy_transfers tr on tr.transfer_batch_id = bt.batch_id
  left join used u on u.batch_id = bt.batch_id
  left join pg_temp.mc_pts p
    on p.gameweek_id = u.gameweek_id and p.fantasy_player_id in (tr.player_in_id, tr.player_out_id)
  group by bt.team_id, tr.id, bt.point_hit, bt.transfers_count
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  analyze pg_temp.mc_teams
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_cap
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_sel
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_con
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  analyze pg_temp.mc_trf
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The figures.
  execute pg_catalog.concat($q$
  create temp table mc_fig on commit drop as
  with counted as (
    select team_id, count(*)::integer as counted from pg_temp.mc_res group by team_id
  ), cap_avg as (
    select team_id, round(avg(ratio), 6) as v from pg_temp.mc_cap where ratio is not null group by team_id
  ), sel_avg as (
    select team_id, round(avg(ratio), 6) as v from pg_temp.mc_sel group by team_id
  ), trf_avg as (
    select team_id, round(avg(value), 6) as v from pg_temp.mc_trf group by team_id
  ), con_avg as (
    select team_id, round(avg(case when top_half then 1 else 0 end), 6) as v from pg_temp.mc_con group by team_id
  ), raw as (
    select t.team_id, t.user_id, coalesce(c.counted, 0) as counted,
      cap_avg.v as cap_raw, sel_avg.v as sel_raw, trf_avg.v as trf_raw, con_avg.v as con_raw
    from pg_temp.mc_teams t
    left join counted c on c.team_id = t.team_id
    left join cap_avg on cap_avg.team_id = t.team_id
    left join sel_avg on sel_avg.team_id = t.team_id
    left join trf_avg on trf_avg.team_id = t.team_id
    left join con_avg on con_avg.team_id = t.team_id
  ), gated as (
    select raw.team_id, raw.user_id, raw.counted,
      case when raw.counted >= $8 then raw.cap_raw end as cap_raw,
      case when raw.counted >= $8 then raw.sel_raw end as sel_raw,
      case when raw.counted >= $8 then raw.trf_raw end as trf_raw,
      case when raw.counted >= $8 then raw.con_raw end as con_raw
    from raw
  ), scaled as (
    select g.*,
      app_private.manager_card_scale(g.cap_raw, $10 -> 'cap') as cap,
      app_private.manager_card_scale(g.sel_raw, $10 -> 'sel') as sel,
      app_private.manager_card_scale(g.trf_raw, $10 -> 'trf') as trf,
      app_private.manager_card_scale(g.con_raw, $10 -> 'con') as con
    from gated g
  ), rated as (
    select s.*,
      case when (s.cap is not null)::integer + (s.sel is not null)::integer
        + (s.trf is not null)::integer + (s.con is not null)::integer >= 3
      then round((coalesce(s.cap, 0) + coalesce(s.sel, 0) + coalesce(s.trf, 0) + coalesce(s.con, 0))::numeric
        / ((s.cap is not null)::integer + (s.sel is not null)::integer
          + (s.trf is not null)::integer + (s.con is not null)::integer))::smallint
      end as ovr
    from scaled s
  )
  select r.team_id, r.user_id, r.counted, r.cap_raw, r.sel_raw, r.trf_raw, r.con_raw,
    r.cap, r.sel, r.trf, r.con, r.ovr,
    app_private.manager_card_tier(r.ovr, $11) as tier,
    (r.counted < $9) as provisional
  from rated r
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  select count(*)  from pg_temp.mc_fig
  $q$, '') into team_count using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The scoring may have moved while this ran: write nothing.
  fingerprint_after := app_private.manager_card_season_fingerprint(season.id);
  if fingerprint_after is distinct from fingerprint_before then
    perform app_private.manager_card_drop_temp();
    return jsonb_build_object('outcome', 'version_changed', 'gameweekId', gw.id);
  end if;
  -- Writes: the card, its number, the history row, the season row, the ledger.
  execute pg_catalog.concat($q$
  insert into app.manager_cards (user_id)
  select f.user_id from pg_temp.mc_fig f
  on conflict (user_id) do nothing
  $q$, '');

  for new_user in execute pg_catalog.concat(
    'select card.user_id from app.manager_cards card
     where card.serial is null and card.user_id in (select user_id from pg_temp.mc_fig)
     order by card.user_id', '')
  loop
    perform app_private.manager_card_assign_serial(new_user);
  end loop;

  execute pg_catalog.concat($q$
  with written as (
    insert into app.manager_card_gameweeks as h (
      user_id, fantasy_season_id, gameweek_id, ovr, tier, cap, sel, trf, con,
      cap_raw, sel_raw, trf_raw, con_raw, gameweeks_counted, provisional, rules_version
    )
    select f.user_id, $1, $2, f.ovr, f.tier, f.cap, f.sel, f.trf, f.con,
      f.cap_raw, f.sel_raw, f.trf_raw, f.con_raw, f.counted, f.provisional, $12
    from pg_temp.mc_fig f
    on conflict (user_id, gameweek_id) do update set
      fantasy_season_id = excluded.fantasy_season_id, ovr = excluded.ovr, tier = excluded.tier,
      cap = excluded.cap, sel = excluded.sel, trf = excluded.trf, con = excluded.con,
      cap_raw = excluded.cap_raw, sel_raw = excluded.sel_raw, trf_raw = excluded.trf_raw,
      con_raw = excluded.con_raw, gameweeks_counted = excluded.gameweeks_counted,
      provisional = excluded.provisional, rules_version = excluded.rules_version,
      calculated_at = statement_timestamp()
    where (h.fantasy_season_id, h.ovr, h.tier, h.cap, h.sel, h.trf, h.con, h.cap_raw, h.sel_raw, h.trf_raw,
        h.con_raw, h.gameweeks_counted, h.provisional, h.rules_version)
      is distinct from
      (excluded.fantasy_season_id, excluded.ovr, excluded.tier, excluded.cap, excluded.sel, excluded.trf,
        excluded.con, excluded.cap_raw, excluded.sel_raw, excluded.trf_raw, excluded.con_raw,
        excluded.gameweeks_counted, excluded.provisional, excluded.rules_version)
    returning 1
  )
  select count(*)::integer from written
  $q$, '') into history_changed using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  execute pg_catalog.concat($q$
  with written as (
    insert into app.manager_card_seasons as s (
      user_id, fantasy_season_id, fantasy_team_id, ovr, tier, cap, sel, trf, con,
      cap_raw, sel_raw, trf_raw, con_raw, gameweeks_counted, provisional, rules_version, through_gameweek_id
    )
    select f.user_id, $1, f.team_id, f.ovr, f.tier, f.cap, f.sel, f.trf, f.con,
      f.cap_raw, f.sel_raw, f.trf_raw, f.con_raw, f.counted, f.provisional, $12, $2
    from pg_temp.mc_fig f
    on conflict (user_id, fantasy_season_id) do update set
      fantasy_team_id = excluded.fantasy_team_id, ovr = excluded.ovr, tier = excluded.tier,
      cap = excluded.cap, sel = excluded.sel, trf = excluded.trf, con = excluded.con,
      cap_raw = excluded.cap_raw, sel_raw = excluded.sel_raw, trf_raw = excluded.trf_raw,
      con_raw = excluded.con_raw, gameweeks_counted = excluded.gameweeks_counted,
      provisional = excluded.provisional, rules_version = excluded.rules_version,
      through_gameweek_id = excluded.through_gameweek_id, calculated_at = statement_timestamp()
    -- An older gameweek never pulls the season row back: during a correction
    -- the row keeps its figures until the re-evaluation reaches the latest week.
    where (select through.sequence_number from app.fantasy_gameweeks through
           where through.id = s.through_gameweek_id) <= $3
      and (s.fantasy_team_id, s.ovr, s.tier, s.cap, s.sel, s.trf, s.con, s.cap_raw, s.sel_raw, s.trf_raw,
        s.con_raw, s.gameweeks_counted, s.provisional, s.rules_version, s.through_gameweek_id)
      is distinct from
      (excluded.fantasy_team_id, excluded.ovr, excluded.tier, excluded.cap, excluded.sel, excluded.trf,
        excluded.con, excluded.cap_raw, excluded.sel_raw, excluded.trf_raw, excluded.con_raw,
        excluded.gameweeks_counted, excluded.provisional, excluded.rules_version, excluded.through_gameweek_id)
    returning 1
  )
  select count(*)::integer  from written
  $q$, '') into season_changed using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The ledger keeps the version that was read at the start, and when (the
  -- real clock, so gameweeks evaluated in one tick are ordered): a gameweek
  -- whose entry is older than an earlier gameweek's is evaluated again, which
  -- lets a correction's cascade resume if a tick stopped part-way.
  insert into app_private.manager_card_evaluations as e
    (gameweek_id, rules_version, scoring_input_version, evaluated_at, cards_written)
  values (gw.id, p_rules_version, gw.scoring_input_version, clock_timestamp(), season_changed)
  on conflict (gameweek_id, rules_version) do update set
    scoring_input_version = excluded.scoring_input_version,
    evaluated_at = excluded.evaluated_at,
    cards_written = excluded.cards_written;

  perform app_private.manager_card_drop_temp();

  return jsonb_build_object(
    'outcome', 'evaluated',
    'gameweekId', gw.id,
    'rulesVersion', p_rules_version,
    'teams', team_count,
    'cardsWritten', season_changed,
    'historyWritten', history_changed,
    'capMismatches', mismatch_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The tick
-- ---------------------------------------------------------------------------
create function app_private.manager_card_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.manager_card_settings%rowtype;
  rules app_private.manager_card_rules%rowtype;
  started timestamptz := statement_timestamp();
  batch_size integer;
  stale record;
  outcome jsonb;
  blocked uuid[] := array[]::uuid[];
  gameweeks integer := 0;
  teams integer := 0;
  cards integer := 0;
  history integer := 0;
  mismatches integer := 0;
  failed integer := 0;
  skipped integer := 0;
  more boolean := false;
  last_state text;
  result_outcome text;
  detail jsonb;
begin
  -- None of the first three answers writes anything, the job log included.
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;
  select * into settings from app_private.manager_card_settings where id;
  if not found or not settings.compute_enabled then
    return jsonb_build_object('outcome', 'off');
  end if;
  select * into rules from app_private.manager_card_rules where active;
  if not found then
    return jsonb_build_object('outcome', 'no_rules');
  end if;
  batch_size := app_private.manager_card_config_number(rules.config, 'batch_size')::integer;

  -- Evaluable gameweeks with no ledger row for the active rules and their
  -- current scoring_input_version, every later evaluable gameweek of the same
  -- season (a correction re-evaluates that gameweek and all after it), and any
  -- gameweek whose ledger entry is older than an earlier gameweek's (a cascade
  -- a previous tick left unfinished).
  for stale in
    select marked.gameweek_id, marked.fantasy_season_id
    from (
      select gw.id as gameweek_id, gw.fantasy_season_id, gw.sequence_number, season.starts_at,
        bool_or(ledger.gameweek_id is null) over (
          partition by gw.fantasy_season_id order by gw.sequence_number
        ) or coalesce(max(ledger.evaluated_at) over (
          partition by gw.fantasy_season_id order by gw.sequence_number
          rows between unbounded preceding and 1 preceding
        ) > ledger.evaluated_at, false) as is_stale
      from app.fantasy_gameweeks gw
      join app.fantasy_seasons season on season.id = gw.fantasy_season_id and season.status <> 'cancelled'
      left join app_private.manager_card_evaluations ledger
        on ledger.gameweek_id = gw.id and ledger.rules_version = rules.version
          and ledger.scoring_input_version = gw.scoring_input_version
      where gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
        and exists (
          select 1 from app_private.fantasy_gameweek_postwork work
          where work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
            and work.completed_at is not null
        )
    ) marked
    where marked.is_stale
    order by marked.starts_at, marked.fantasy_season_id, marked.sequence_number
  loop
    if stale.fantasy_season_id = any (blocked) then
      continue;
    end if;
    if teams >= batch_size then
      more := true;
      exit;
    end if;
    begin
      outcome := app_private.manager_card_evaluate_gameweek(stale.gameweek_id, rules.version);
    exception when others then
      failed := failed + 1;
      last_state := sqlstate;
      blocked := blocked || stale.fantasy_season_id;
      continue;
    end;
    if outcome ->> 'outcome' = 'evaluated' then
      gameweeks := gameweeks + 1;
      teams := teams + (outcome ->> 'teams')::integer;
      cards := cards + (outcome ->> 'cardsWritten')::integer;
      history := history + (outcome ->> 'historyWritten')::integer;
      mismatches := mismatches + (outcome ->> 'capMismatches')::integer;
    else
      skipped := skipped + 1;
      last_state := outcome ->> 'outcome';
      blocked := blocked || stale.fantasy_season_id;
    end if;
  end loop;

  if gameweeks = 0 and failed = 0 and skipped = 0 then
    return jsonb_build_object('outcome', 'idle');
  end if;

  result_outcome := case
    when failed > 0 then 'error'
    when skipped > 0 then 'skipped'
    when more then 'more_pending'
    else 'evaluated'
  end;
  detail := jsonb_build_object(
    'rulesVersion', rules.version,
    'gameweeks', gameweeks,
    'teams', teams,
    'cardsWritten', cards,
    'historyWritten', history,
    'capMismatches', mismatches,
    'failed', failed,
    'skipped', skipped,
    'morePending', more
  );
  if last_state is not null then
    detail := detail || jsonb_build_object('lastState', last_state);
  end if;
  insert into app_private.manager_card_job_log (started_at, finished_at, outcome, detail)
  values (started, statement_timestamp(), result_outcome, detail);
  return jsonb_build_object('outcome', result_outcome) || detail;
end;
$$;

-- ---------------------------------------------------------------------------
-- The founder grant: once, run by the owner, never overwrites a founder
-- ---------------------------------------------------------------------------
create function app_private.manager_card_grant_founder(
  p_fantasy_season_id uuid,
  p_cutoff timestamptz,
  p_cohort smallint,
  p_excluded_user_ids uuid[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  granted_ids uuid[];
  granted_count integer;
  one_id uuid;
begin
  if p_fantasy_season_id is null or p_cutoff is null or p_cohort is null or p_cohort < 1 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not exists (select 1 from app.fantasy_seasons season where season.id = p_fantasy_season_id) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    raise exception using errcode = 'PT409', message = 'manager_card_busy';
  end if;

  with eligible as (
    select distinct team.user_id
    from app.fantasy_teams team
    join app.profiles profile on profile.id = team.user_id and profile.deleted_at is null
    where team.fantasy_season_id = p_fantasy_season_id
      and team.created_at < p_cutoff
      and exists (
        select 1 from app.fantasy_team_gameweek_results result
        where result.fantasy_team_id = team.id and result.state = 'final'
      )
      and team.user_id <> all (coalesce(p_excluded_user_ids, '{}'::uuid[]))
      and not exists (
        select 1 from app_private.staff_principals principal where principal.auth_user_id = team.user_id
      )
      and not exists (
        select 1 from auth.users account
        where account.id = team.user_id and lower(coalesce(account.email, '')) like '%@botolago.com'
      )
  ), granted as (
    insert into app.manager_cards as card (user_id, founder_cohort, founder_granted_at)
    select eligible.user_id, p_cohort, statement_timestamp() from eligible
    on conflict (user_id) do update set
      founder_cohort = excluded.founder_cohort,
      founder_granted_at = excluded.founder_granted_at
    where card.founder_cohort is null
    returning card.user_id
  )
  select coalesce(array_agg(granted.user_id), '{}'::uuid[]), count(*)::integer
  into granted_ids, granted_count
  from granted;

  foreach one_id in array granted_ids loop
    perform app_private.manager_card_assign_serial(one_id);
  end loop;
  return granted_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owned by postgres, executable by postgres only
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.manager_card_config_number(jsonb, text),
  app_private.manager_card_scale(numeric, jsonb),
  app_private.manager_card_tier(integer, jsonb),
  app_private.manager_card_season_fingerprint(uuid),
  app_private.manager_card_drop_temp(),
  app_private.manager_card_assign_serial(uuid),
  app_private.manager_card_evaluate_gameweek(uuid, integer),
  app_private.manager_card_tick(),
  app_private.manager_card_grant_founder(uuid, timestamptz, smallint, uuid[])
from public, anon, authenticated, service_role;
grant execute on function
  app_private.manager_card_config_number(jsonb, text),
  app_private.manager_card_scale(numeric, jsonb),
  app_private.manager_card_tier(integer, jsonb),
  app_private.manager_card_season_fingerprint(uuid),
  app_private.manager_card_drop_temp(),
  app_private.manager_card_assign_serial(uuid),
  app_private.manager_card_evaluate_gameweek(uuid, integer),
  app_private.manager_card_tick(),
  app_private.manager_card_grant_founder(uuid, timestamptz, smallint, uuid[])
to postgres;

comment on function app_private.manager_card_scale(numeric, jsonb) is
  'Piecewise-linear scale ([[raw, score], ...], clamped outside the first and last raw) rounded into 1..99. Null raw gives null.';
comment on function app_private.manager_card_tier(integer, jsonb) is
  'Tier from OVR and the ruleset''s cut-offs {stade, pro, champion, legend}; below stade is homa; null OVR gives null.';
comment on function app_private.manager_card_assign_serial(uuid) is
  'Gives a card its permanent number (random 100000-999999, unused, never retired), creating the card row if needed. Returns the existing number when there is one.';
comment on function app_private.manager_card_evaluate_gameweek(uuid, integer) is
  'Recomputes the Manager Card figures of the active teams with a final result in the gameweek, from every evaluable gameweek of the season up to it. Writes only card tables and the ledger; writes nothing when the scoring version moved during the run. Idempotent.';
comment on function app_private.manager_card_tick() is
  'Every 15 minutes (manager-card-tick): busy, off or no_rules answer without writing; otherwise evaluates the stale evaluable gameweeks in order up to the ruleset''s batch_size teams and logs one job-log row when it did something.';
comment on function app_private.manager_card_grant_founder(uuid, timestamptz, smallint, uuid[]) is
  'Owner-run, once: marks teams of the season created before the cut-off with a final result as founders of the cohort, excluding the given users, staff and @botolago.com accounts. Never overwrites a founder. Returns how many were granted.';
$bg_20261008123200_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261008123300',
  'manager_card_api',
  array[$bg_20261008123300_file$-- Manager Card (BG-0158), part 3: the read API.
--
-- Four signed-in reads over the tables of 20261008123000. The calculation that
-- fills those tables is 20261008123200; this file only reads them, and depends
-- on neither it nor the jobs (20261008123400).
--
--   api.get_my_manager_card()                       the caller's card
--   api.get_manager_card(p_fantasy_team_id)         one card, by Fantasy team
--   api.get_manager_cards(p_fantasy_team_ids)       up to 100, for ranking rows
--   api.get_my_manager_card_history(after, limit)   the caller's card over time
--
-- DISPLAY ONLY, SIGNED-IN ONLY (D19). Every function runs the MFA step-up as
-- its first statement, requires a caller (PT401), is refused while
-- app_private.manager_card_settings.read_enabled is false (PT403
-- manager_card_off), is granted to authenticated and service_role and never to
-- anon. A card is looked up by Fantasy team, never by user id, and no function
-- returns a user id or an e-mail. A profile with deleted_at set (an account
-- waiting to be erased) has no card: the single reads answer null, the batch
-- read leaves it out, the caller's own history is empty.
--
-- WHICH SEASON'S CARD (D7)
--
--   A season "qualifies" when its row has gameweeks_counted >= the minimum in
--   the active rules (config->>'minimum_gameweeks'). With no active rules row
--   the minimum is unknown, and a season qualifies when it has an OVR.
--
--   api.get_my_manager_card and the history read choose the caller's most
--   recent season (fantasy_seasons.starts_at, then id) that qualifies. When the
--   latest season is still under the minimum, that is last season's card, with
--   last season's label. When no season qualifies, the card is the latest
--   season's row with its figures null (a manager with a number and no rating
--   yet). When the caller has no manager_card_seasons row at all there is
--   nothing to show and the answer is null (a card row with no season has no
--   team to name).
--
--   api.get_manager_card and api.get_manager_cards answer for the season the
--   asked-for team belongs to. The D7 fallback is NOT applied to other
--   people's cards: a team under the minimum shows its season with null
--   figures, so a ranking row never shows a figure from another season.
--
-- WHAT A CARD SAYS
--
--   name   the profile display name when it is not blank, else the Fantasy
--          team name (the rule of api.fantasy_overall_standings, 20260921180000;
--          here the reader is always signed in, so the display name may be
--          shown).
--   handle the username or null. serial is the six-digit number as a string
--          (100000-999999), or null before one is assigned.
--   club   from user_preferences.favorite_team_id: id, code, shortName in both
--          languages (translation, else the Latin short name) and the two
--          colours; null when no favourite club is set. Colours are null when
--          the catalogue has none.
--   figures (ovr, tier, the four stats) are null while the season is under the
--          minimum, whatever the row holds.
--
-- Helpers live in app_private, are not granted to any API role and do not read
-- the caller; the api functions own the caller, the step-up and the switch.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The active rules' minimum number of gameweeks, or null (no active rules, or
-- no usable minimum).
create function app_private.manager_card_minimum()
returns integer
language sql
stable
set search_path = ''
as $$
  select (rules.config ->> 'minimum_gameweeks')::integer
  from app_private.manager_card_rules rules
  where rules.active and (rules.config ->> 'minimum_gameweeks') ~ '^[0-9]{1,6}$';
$$;
revoke all on function app_private.manager_card_minimum()
  from public, anon, authenticated, service_role;

-- Does a season row count? Under the minimum it does not; with no known
-- minimum it counts when it has an OVR.
create function app_private.manager_card_qualifies(p_gameweeks_counted integer, p_ovr smallint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_gameweeks_counted >= app_private.manager_card_minimum(), p_ovr is not null);
$$;
revoke all on function app_private.manager_card_qualifies(integer, smallint)
  from public, anon, authenticated, service_role;

-- The season whose card a manager's own reads show (D7): the latest qualifying
-- season, else the latest season. Null when the manager has no season row.
create function app_private.manager_card_current_season(p_user_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select cs.fantasy_season_id
  from app.manager_card_seasons cs
  join app.fantasy_seasons fs on fs.id = cs.fantasy_season_id
  where cs.user_id = p_user_id
  order by not app_private.manager_card_qualifies(cs.gameweeks_counted, cs.ovr),
    fs.starts_at desc, fs.id desc
  limit 1;
$$;
revoke all on function app_private.manager_card_current_season(uuid)
  from public, anon, authenticated, service_role;

-- One card as the API shows it, or null: no card row, no row for that season,
-- or a profile waiting to be erased. No user id, no e-mail.
create function app_private.manager_card_json(p_user_id uuid, p_fantasy_season_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'fantasyTeamId', cs.fantasy_team_id,
    'name', coalesce(nullif(btrim(profile.display_name), ''), team.name),
    'handle', profile.username,
    'serial', card.serial,
    'founderCohort', card.founder_cohort,
    'season', jsonb_build_object('id', cs.fantasy_season_id, 'label', season.label),
    'ovr', case when qualified.ok then cs.ovr end,
    'tier', case when qualified.ok then cs.tier end,
    'stats', jsonb_build_object(
      'cap', case when qualified.ok then cs.cap end,
      'sel', case when qualified.ok then cs.sel end,
      'trf', case when qualified.ok then cs.trf end,
      'con', case when qualified.ok then cs.con end
    ),
    'provisional', cs.provisional,
    'gameweeksCounted', cs.gameweeks_counted,
    'rulesVersion', cs.rules_version,
    'club', case when club.id is null then null else jsonb_build_object(
      'id', club.id,
      'code', club.code,
      'shortName', jsonb_build_object(
        'fr', coalesce(club_fr.short_name, club.short_name),
        'ar', coalesce(club_ar.short_name, club.short_name)
      ),
      'primaryColor', club.primary_color,
      'secondaryColor', club.secondary_color
    ) end
  )
  from app.manager_card_seasons cs
  join app.manager_cards card on card.user_id = cs.user_id
  join app.profiles profile on profile.id = cs.user_id and profile.deleted_at is null
  join app.fantasy_teams team on team.id = cs.fantasy_team_id
  join app.fantasy_seasons fs on fs.id = cs.fantasy_season_id
  join app.seasons season on season.id = fs.football_season_id
  left join app.user_preferences preference on preference.user_id = cs.user_id
  left join app.teams club on club.id = preference.favorite_team_id
  left join app.team_translations club_fr
    on club_fr.team_id = club.id and club_fr.language = 'fr'
  left join app.team_translations club_ar
    on club_ar.team_id = club.id and club_ar.language = 'ar'
  cross join lateral (
    select app_private.manager_card_qualifies(cs.gameweeks_counted, cs.ovr) as ok
  ) qualified
  where cs.user_id = p_user_id and cs.fantasy_season_id = p_fantasy_season_id;
$$;
revoke all on function app_private.manager_card_json(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card
-- ---------------------------------------------------------------------------
create function api.get_my_manager_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  return app_private.manager_card_json(actor, app_private.manager_card_current_season(actor));
end;
$$;
revoke all on function api.get_my_manager_card() from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card() to authenticated, service_role;
comment on function api.get_my_manager_card() is
  'The caller''s Manager Card (latest qualifying season, else the latest season with null figures), or null. Signed-in, step-up, refused with manager_card_off while the switch is off.';

-- ---------------------------------------------------------------------------
-- api.get_manager_card
-- ---------------------------------------------------------------------------
create function api.get_manager_card(p_fantasy_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target app.fantasy_teams%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  if p_fantasy_team_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  select * into target from app.fantasy_teams team where team.id = p_fantasy_team_id;
  if not found then
    return null;
  end if;
  return app_private.manager_card_json(target.user_id, target.fantasy_season_id);
end;
$$;
revoke all on function api.get_manager_card(uuid) from public, anon, authenticated, service_role;
grant execute on function api.get_manager_card(uuid) to authenticated, service_role;
comment on function api.get_manager_card(uuid) is
  'One manager''s card for the season of the given Fantasy team, or null (unknown team, no card, profile waiting to be erased). No fallback to another season. Signed-in, step-up, manager_card_off while the switch is off.';

-- ---------------------------------------------------------------------------
-- api.get_manager_cards
-- ---------------------------------------------------------------------------
create function api.get_manager_cards(p_fantasy_team_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  if p_fantasy_team_ids is null
    or (select count(distinct asked.id) from unnest(p_fantasy_team_ids) as asked(id)) > 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- Stable order: the order each team was first asked for. Unknown teams,
  -- teams without a card and hidden profiles are left out.
  select coalesce(jsonb_agg(found.card order by found.position), '[]'::jsonb)
  into result
  from (
    select asked.position, built.card
    from (
      select t.id, min(t.position) as position
      from unnest(p_fantasy_team_ids) with ordinality as t(id, position)
      where t.id is not null
      group by t.id
    ) asked
    join app.fantasy_teams team on team.id = asked.id
    cross join lateral (
      select app_private.manager_card_json(team.user_id, team.fantasy_season_id) as card
    ) built
    where built.card is not null
  ) found;
  return result;
end;
$$;
revoke all on function api.get_manager_cards(uuid[]) from public, anon, authenticated, service_role;
grant execute on function api.get_manager_cards(uuid[]) to authenticated, service_role;
comment on function api.get_manager_cards(uuid[]) is
  'Cards for up to 100 distinct Fantasy teams, in the order first asked; teams without a visible card are omitted. Signed-in, step-up, manager_card_off while the switch is off.';

-- ---------------------------------------------------------------------------
-- api.get_my_manager_card_history
-- ---------------------------------------------------------------------------
create function api.get_my_manager_card_history(
  p_after_gameweek_sequence integer default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  card_season uuid;
  page_items jsonb;
  last_sequence integer;
  more boolean;
begin
  perform app_private.assert_mfa_step_up();
  if actor is null then
    raise exception using errcode = 'PT401', message = 'authentication_required';
  end if;
  if not coalesce((select read_enabled from app_private.manager_card_settings where id), false) then
    raise exception using errcode = 'PT403', message = 'manager_card_off';
  end if;
  if p_limit is null or p_limit not between 1 and 50
    or (p_after_gameweek_sequence is not null and p_after_gameweek_sequence < 1) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  card_season := app_private.manager_card_current_season(actor);
  if card_season is null or not exists (
    select 1 from app.profiles profile where profile.id = actor and profile.deleted_at is null
  ) then
    return jsonb_build_object('items', '[]'::jsonb, 'nextAfter', null);
  end if;

  -- One row more than asked for says whether there is another page.
  with page as (
    select gameweek.sequence_number, history.ovr, history.tier, history.cap,
      history.sel, history.trf, history.con, history.provisional,
      app_private.manager_card_qualifies(history.gameweeks_counted, history.ovr) as ok,
      row_number() over (order by gameweek.sequence_number desc) as position
    from app.manager_card_gameweeks history
    join app.fantasy_gameweeks gameweek on gameweek.id = history.gameweek_id
    where history.user_id = actor
      and history.fantasy_season_id = card_season
      and (p_after_gameweek_sequence is null
        or gameweek.sequence_number < p_after_gameweek_sequence)
    order by gameweek.sequence_number desc
    limit p_limit + 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'gameweekSequence', page.sequence_number,
      'ovr', case when page.ok then page.ovr end,
      'tier', case when page.ok then page.tier end,
      'stats', jsonb_build_object(
        'cap', case when page.ok then page.cap end,
        'sel', case when page.ok then page.sel end,
        'trf', case when page.ok then page.trf end,
        'con', case when page.ok then page.con end
      ),
      'provisional', page.provisional
    ) order by page.sequence_number desc) filter (where page.position <= p_limit), '[]'::jsonb),
    min(page.sequence_number) filter (where page.position <= p_limit),
    coalesce(bool_or(page.position > p_limit), false)
  into page_items, last_sequence, more
  from page;

  return jsonb_build_object(
    'items', page_items,
    'nextAfter', case when more then last_sequence else null end
  );
end;
$$;
revoke all on function api.get_my_manager_card_history(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function api.get_my_manager_card_history(integer, integer)
  to authenticated, service_role;
comment on function api.get_my_manager_card_history(integer, integer) is
  'The caller''s card history for the season shown by get_my_manager_card, newest gameweek first, keyset by gameweek sequence (limit 1..50). Returns {items, nextAfter}. Signed-in, step-up, manager_card_off while the switch is off.';
$bg_20261008123300_file$]
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261008123400',
  'manager_card_jobs',
  array[$bg_20261008123400_file$-- Manager Card (BG-0158), part 5: the two scheduled jobs.
--
-- Both are scheduled but do nothing until the owner switches compute on and
-- inserts an active ruleset: manager_card_tick() answers `off` / `no_rules`
-- without writing. cron.schedule with a name replaces a job of that name, so
-- this file can be applied again.
--
-- manager-card-tick runs every 15 minutes with its own statement timeout (10 minutes: a gameweek is never split, and the calculation reads every week of the season so far).
-- manager-card-history-prune runs daily at 03:47 UTC, whatever the switch says:
-- it deletes only this tick's cron.job_run_details rows older than 7 days and
-- the job-log rows older than 180 days. It never touches app.* card tables.

select cron.schedule(
  'manager-card-tick',
  '*/15 * * * *',
  $job$set local statement_timeout = '10min'; select app_private.manager_card_tick();$job$
);

select cron.schedule(
  'manager-card-history-prune',
  '47 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'manager-card-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.manager_card_job_log
    where started_at < now() - interval '180 days';
  $prune$
);
$bg_20261008123400_file$]
);

-- ---------------------------------------------------------------------------
-- Run them, in order, from the history once each is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261008123000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261008123000'
  );
  part_20261008123100 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261008123100'
  );
  part_20261008123200 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261008123200'
  );
  part_20261008123300 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261008123300'
  );
  part_20261008123400 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261008123400'
  );
begin
  if encode(sha256(convert_to(part_20261008123000, 'UTF8')), 'hex')
    is distinct from '681c670f3994c4038c950ee54be58887628f6681d825940f20be00db9a2d3e23' then
    raise exception 'stop: 20261008123000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261008123100, 'UTF8')), 'hex')
    is distinct from '7455c4d7cce3759b590ac6a462e308a7127dea57b74852b21af03838ab9e3890' then
    raise exception 'stop: 20261008123100 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261008123200, 'UTF8')), 'hex')
    is distinct from '2db758f1ada9ce07ad3aa335afc698f48b65343f48a7922c80e89cf1b2bcfce8' then
    raise exception 'stop: 20261008123200 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261008123300, 'UTF8')), 'hex')
    is distinct from '556fcb7d3c26106d6905b24aac012f22366d96f338c0cf8d816e67eb5ea33f36' then
    raise exception 'stop: 20261008123300 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;
  if encode(sha256(convert_to(part_20261008123400, 'UTF8')), 'hex')
    is distinct from '75f37a8486bd729296ccc64d0cc0aee9a9bbd2a7aaab464ff1abf8f9ada99918' then
    raise exception 'stop: 20261008123400 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261008123000;
  execute part_20261008123100;
  execute part_20261008123200;
  execute part_20261008123300;
  execute part_20261008123400;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn text;
  who text;
  tbl text;
  ticked jsonb;
  rec record;
begin
  -- The switches: one row, both off; no rules row.
  if (select count(*) from app_private.manager_card_settings) <> 1
    or exists (select 1 from app_private.manager_card_settings
      where compute_enabled is distinct from false or read_enabled is distinct from false) then
    problems := problems || 'the Manager Card settings are not one row with both switches off'::text;
  end if;
  if (select count(*) from app_private.manager_card_rules) <> 0 then
    problems := problems || 'a Manager Card rules row exists -- none may ship'::text;
  end if;

  -- The four read functions: signed-in accounts and the service role only.
  foreach fn in array array[
    'api.get_my_manager_card()',
    'api.get_manager_card(uuid)',
    'api.get_manager_cards(uuid[])',
    'api.get_my_manager_card_history(integer,integer)'
  ] loop
    if to_regprocedure(fn) is null then
      problems := problems || (fn || ' is missing');
      continue;
    end if;
    foreach who in array array['authenticated', 'service_role'] loop
      if not has_function_privilege(who, to_regprocedure(fn), 'execute') then
        problems := problems || (who || ' cannot run ' || fn);
      end if;
    end loop;
    foreach who in array array['anon', 'public'] loop
      if has_function_privilege(who, to_regprocedure(fn), 'execute') then
        problems := problems || (who || ' can run ' || fn);
      end if;
    end loop;
  end loop;

  -- Every Manager Card function in app_private: postgres only.
  for rec in
    select p.oid::regprocedure::text as signature, p.oid as oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname like '%manager\_card%'
  loop
    foreach who in array array['anon', 'authenticated', 'service_role', 'public'] loop
      if has_function_privilege(who, rec.oid, 'execute') then
        problems := problems || (who || ' can run ' || rec.signature);
      end if;
    end loop;
  end loop;
  foreach fn in array array[
    'app_private.manager_card_configure(boolean,boolean)',
    'app_private.manager_card_tick()',
    'app_private.manager_card_evaluate_gameweek(uuid,integer)',
    'app_private.manager_card_assign_serial(uuid)',
    'app_private.manager_card_grant_founder(uuid,timestamptz,smallint,uuid[])'
  ] loop
    if to_regprocedure(fn) is null then
      problems := problems || (fn || ' is missing');
    elsif not has_function_privilege('postgres', to_regprocedure(fn), 'execute') then
      problems := problems || ('postgres cannot run ' || fn);
    end if;
  end loop;

  -- Every Manager Card table: no right for any API role.
  foreach tbl in array array[
    'app.manager_cards', 'app.manager_card_seasons', 'app.manager_card_gameweeks',
    'app_private.manager_card_settings', 'app_private.manager_card_rules',
    'app_private.manager_card_retired_serials', 'app_private.manager_card_evaluations',
    'app_private.manager_card_job_log'
  ] loop
    foreach who in array array['anon', 'authenticated', 'service_role'] loop
      if has_any_column_privilege(who, tbl::regclass, 'select,insert,update,references')
        or has_table_privilege(who, tbl::regclass, 'delete,truncate,trigger') then
        problems := problems || (who || ' has a right on ' || tbl);
      end if;
    end loop;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid = tbl::regclass) then
      problems := problems || ('row security is not forced on ' || tbl);
    end if;
  end loop;

  -- The account erasure now holds the card's lock.
  if position('botolago:manager-card' in coalesce(
      pg_get_functiondef('app_private.account_deletion_erase(uuid,integer)'::regprocedure), '')) = 0 then
    problems := problems || 'the account erasure does not take the manager-card lock'::text;
  end if;

  -- The two jobs.
  if (select count(*) from cron.job where jobname = 'manager-card-tick' and schedule = '*/15 * * * *'
      and command like '%app_private.manager_card_tick()%') <> 1
    or (select count(*) from cron.job where jobname = 'manager-card-history-prune'
      and schedule = '47 3 * * *') <> 1 then
    problems := problems || 'the manager-card jobs are not scheduled as reviewed'::text;
  end if;

  -- All five migrations are in the history.
  if (select count(*) from supabase_migrations.schema_migrations
    where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400')) <> 5 then
    problems := problems || 'a history row is missing'::text;
  end if;

  -- Off means off: the tick answers so and writes nothing.
  ticked := app_private.manager_card_tick();
  if ticked is distinct from '{"outcome": "off"}'::jsonb then
    problems := problems || ('the tick while off answered ' || coalesce(ticked::text, 'nothing'));
  end if;
  if (select count(*) from app_private.manager_card_job_log) <> 0
    or (select count(*) from app_private.manager_card_evaluations) <> 0
    or (select count(*) from app.manager_cards) <> 0
    or (select count(*) from app.manager_card_seasons) <> 0
    or (select count(*) from app.manager_card_gameweeks) <> 0
    or (select count(*) from app_private.manager_card_retired_serials) <> 0 then
    problems := problems || 'the tick wrote while off'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
  raise notice 'manager card: tables and functions in place, both switches off, no rules, erasure holds the lock, two jobs scheduled, the tick does nothing while off';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261008123000')
    then 'Applied. The Manager Card is in place and OFF: both switches false, no rules row. Next: docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
