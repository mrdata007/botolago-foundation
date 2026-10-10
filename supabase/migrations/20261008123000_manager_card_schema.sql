-- Manager Card (BG-0158), part 1: the tables, the switch, nothing else.
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
