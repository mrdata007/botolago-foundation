-- BotolaGO Fantasy prizes: a sponsor-funded prize catalog, winner selection on
-- finalized gameweeks, an admin verification workflow, and safe public reads.
--
-- WHAT THIS ADDS (and what it leaves alone)
--
-- New tables only. No existing table is altered. The winner step reads the
-- data the lifecycle already writes -- app.fantasy_team_gameweek_results
-- (final_score is the gameweek score net of transfer hits),
-- app.fantasy_transfer_batches, app.fantasy_teams, app.fantasy_leagues and
-- app.fantasy_league_memberships -- and never writes to any of them.
--
-- TIERS
--
--   gameweek     highest final_score in one finalized gameweek.
--   monthly      "Monthly" in the UI, but NOT a calendar month: the highest total
--                over a block of 4 consecutive gameweeks (GW1-4, GW5-8, ...),
--                cut from gameweek ORDER, never from dates. A leftover of 2 or 3
--                gameweeks is its own final block; a leftover of 1 is merged into
--                the block before it (see app_private.fantasy_prize_block_bounds).
--   season       highest total after the season's last gameweek.
--   mini_league  the leader of each active league with at least
--                mini_league_min_members active members, after the season's
--                last gameweek. Merchandise only: it carries no cash value.
--
-- SEASON LENGTH IS A SETTING, NOT A FACT THE DATABASE HAS
--
-- Gameweeks are staged one round at a time by api.service_sync_fantasy_calendar,
-- and the catalog activation's expected round count describes the staged
-- calendar, not the season. So app.fantasy_prize_settings carries the season's
-- gameweek count (default 30: 16 clubs, double round-robin). Blocks and the
-- season end are computed from it, and the admin setter refuses a change that
-- would move a block that has already been awarded.
--
-- ORDER OF SELECTION
--
--   1. more points in the period;
--   2. fewer transfers made in the period, not counting Wildcard or Free Hit
--      transfers (those are free and unlimited by design);
--   3. earlier fantasy team creation (the "registration" for the season, and
--      the same final key the ranking boards use);
--   4. fantasy team id -- a deterministic last resort that never ties.
--
-- Walking down that order, an account is skipped (and the skip logged in
-- app.fantasy_prize_skips) when it is on the private prize flag list, when it
-- belongs to a staff principal (the Terms exclude staff), when it already holds
-- two live gameweek wins this season (gameweek tier), or when it already holds a
-- live mini-league win this season (mini_league tier). The next eligible
-- account wins. The winner row stores which key separated it from the next
-- eligible account (`tie_break`).
--
-- WHEN IT RUNS
--
-- api.service_evaluate_fantasy_prizes is called by the trusted lifecycle
-- runner right after a gameweek's postwork completes, and again by the
-- hourly orchestrator as a catch-up. It only ever touches gameweeks that are
-- finalized with final points, in sequence order, and records each evaluated
-- gameweek in app_private.fantasy_prize_evaluations so a re-run is a no-op.
-- A finalized gameweek cannot be re-opened by any code path, so an awarded
-- winner is never recomputed; a data error is corrected with the audited admin
-- override. A tier with no active prize awards nothing for that period.
--
-- WHO CAN READ WHAT
--
-- Every table is RLS-forced with all privileges revoked, like every other
-- table here; only schema `api` is exposed. Everyone reads prizes and winners
-- through api.fantasy_prizes / api.fantasy_prize_winners, which return safe
-- fields only: never an email, a display name, a user id or a verification
-- note, and only a masked username. The winners wall shows verified or paid
-- winners only. Every write goes through an api.admin_* function gated on the
-- new `prizes.manage` permission (MFA, recent authentication) and audited in
-- app_private.admin_audit_events.
--
-- The three default prizes are seeded INACTIVE: nothing is shown or awarded
-- until an admin reviews them and switches them on.

create type app.fantasy_prize_tier as enum ('gameweek', 'monthly', 'season', 'mini_league');
create type app.fantasy_prize_winner_status as enum (
  'pending', 'verified', 'paid', 'forfeited', 'overridden'
);
create type app.fantasy_prize_tie_break as enum (
  'outright', 'fewer_transfers', 'earlier_registration', 'final_fallback', 'admin_override'
);
create type app.fantasy_prize_skip_reason as enum (
  'flagged', 'staff', 'gameweek_cap_reached', 'mini_league_cap_reached'
);

-- ---------------------------------------------------------------------------
-- Prize catalog
-- ---------------------------------------------------------------------------

create table app.fantasy_prizes (
  id uuid primary key default gen_random_uuid(),
  tier app.fantasy_prize_tier not null,
  name_fr text not null,
  name_ar text,
  description_fr text not null default '',
  description_ar text,
  estimated_value_mad integer,
  sponsor_name text,
  sponsor_logo_url text,
  image_url text,
  active boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_prizes_name_fr_check check (
    name_fr = btrim(name_fr) and char_length(name_fr) between 2 and 120
  ),
  constraint fantasy_prizes_name_ar_check check (
    name_ar is null or (name_ar = btrim(name_ar) and char_length(name_ar) between 2 and 120)
  ),
  constraint fantasy_prizes_description_fr_check check (
    description_fr = btrim(description_fr) and char_length(description_fr) <= 1000
  ),
  constraint fantasy_prizes_description_ar_check check (
    description_ar is null
    or (description_ar = btrim(description_ar) and char_length(description_ar) between 1 and 1000)
  ),
  -- Mini-league prizes are merchandise: no cash value is stored or shown.
  constraint fantasy_prizes_value_check check (
    (tier = 'mini_league' and estimated_value_mad is null)
    or (tier <> 'mini_league' and estimated_value_mad between 0 and 10000000)
  ),
  constraint fantasy_prizes_sponsor_name_check check (
    sponsor_name is null
    or (sponsor_name = btrim(sponsor_name) and char_length(sponsor_name) between 2 and 120)
  ),
  -- https only, no credentials, no whitespace: these URLs are rendered as <img>
  -- on a public page.
  constraint fantasy_prizes_sponsor_logo_url_check check (
    sponsor_logo_url is null or (
      char_length(sponsor_logo_url) <= 2048
      and sponsor_logo_url ~ '^https://[^[:space:]/@?#]+(/[^[:space:]]*)?$'
    )
  ),
  constraint fantasy_prizes_image_url_check check (
    image_url is null or (
      char_length(image_url) <= 2048
      and image_url ~ '^https://[^[:space:]/@?#]+(/[^[:space:]]*)?$'
    )
  )
);
comment on table app.fantasy_prizes is
  'Sponsor prize catalog. At most one active prize per tier; the active prize of a tier is the one awarded when that tier''s period closes.';
create unique index fantasy_prizes_one_active_per_tier_idx
  on app.fantasy_prizes (tier) where active;
create trigger fantasy_prizes_set_updated_at
before update on app.fantasy_prizes
for each row execute function app_private.set_updated_at();
alter table app.fantasy_prizes enable row level security;
alter table app.fantasy_prizes force row level security;
revoke all on app.fantasy_prizes from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Per-season settings
-- ---------------------------------------------------------------------------

create table app.fantasy_prize_settings (
  fantasy_season_id uuid primary key references app.fantasy_seasons(id) on delete restrict,
  gameweek_count integer not null default 30,
  mini_league_min_members integer not null default 10,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_prize_settings_gameweek_count_check check (gameweek_count between 1 and 1000),
  constraint fantasy_prize_settings_min_members_check check (
    mini_league_min_members between 2 and 100000
  )
);
comment on table app.fantasy_prize_settings is
  'Season length and mini-league threshold for prize selection. A season without a row uses 30 gameweeks and 10 members.';
create trigger fantasy_prize_settings_set_updated_at
before update on app.fantasy_prize_settings
for each row execute function app_private.set_updated_at();
alter table app.fantasy_prize_settings enable row level security;
alter table app.fantasy_prize_settings force row level security;
revoke all on app.fantasy_prize_settings from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Winners
-- ---------------------------------------------------------------------------

create table app.fantasy_prize_winners (
  id uuid primary key default gen_random_uuid(),
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  tier app.fantasy_prize_tier not null,
  -- 'gw:<n>', 'block:<n>', 'season' or 'league:<league id>': one live winner
  -- per (season, tier, period_key).
  period_key text not null,
  gameweek_id uuid references app.fantasy_gameweeks(id) on delete restrict,
  block_number integer,
  first_gameweek_number integer not null,
  last_gameweek_number integer not null,
  league_id uuid references app.fantasy_leagues(id) on delete restrict,
  prize_id uuid not null references app.fantasy_prizes(id) on delete restrict,
  -- Snapshots at award time, so a later catalog edit never rewrites history.
  prize_name_fr text not null,
  prize_name_ar text,
  prize_value_mad integer,
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  user_id uuid not null references app.profiles(id) on delete restrict,
  team_name text not null,
  points integer not null,
  transfers_in_period integer not null,
  team_created_at timestamptz not null,
  tie_break app.fantasy_prize_tie_break not null,
  runner_up_team_id uuid references app.fantasy_teams(id) on delete restrict,
  status app.fantasy_prize_winner_status not null default 'pending',
  verification_notes text,
  verified_at timestamptz,
  verified_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  paid_at timestamptz,
  paid_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  forfeited_at timestamptz,
  forfeited_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  overridden_at timestamptz,
  overridden_by_principal_id uuid references app_private.staff_principals(id) on delete restrict,
  superseded_by_winner_id uuid references app.fantasy_prize_winners(id) on delete restrict,
  override_of_winner_id uuid references app.fantasy_prize_winners(id) on delete restrict,
  override_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_prize_winners_period_check check (
    first_gameweek_number between 1 and last_gameweek_number
    and last_gameweek_number <= 1000
    and (
      (tier = 'gameweek' and gameweek_id is not null and block_number is null and league_id is null
        and first_gameweek_number = last_gameweek_number
        and period_key = 'gw:' || last_gameweek_number::text)
      or (tier = 'monthly' and gameweek_id is null and block_number between 1 and 250
        and league_id is null and period_key = 'block:' || block_number::text)
      or (tier = 'season' and gameweek_id is null and block_number is null and league_id is null
        and first_gameweek_number = 1 and period_key = 'season')
      or (tier = 'mini_league' and gameweek_id is null and block_number is null
        and league_id is not null and first_gameweek_number = 1
        and period_key = 'league:' || league_id::text)
    )
  ),
  constraint fantasy_prize_winners_counts_check check (transfers_in_period >= 0),
  constraint fantasy_prize_winners_notes_check check (
    verification_notes is null or char_length(verification_notes) <= 20000
  ),
  -- Paid only after verified: a paid row must carry both stamps.
  constraint fantasy_prize_winners_status_check check (
    (status = 'pending' and verified_at is null and paid_at is null
      and forfeited_at is null and overridden_at is null)
    or (status = 'verified' and verified_at is not null and paid_at is null
      and forfeited_at is null and overridden_at is null)
    or (status = 'paid' and verified_at is not null and paid_at is not null
      and forfeited_at is null and overridden_at is null)
    or (status = 'forfeited' and forfeited_at is not null and paid_at is null
      and overridden_at is null)
    or (status = 'overridden' and overridden_at is not null and paid_at is null)
  ),
  constraint fantasy_prize_winners_override_check check (
    (tie_break = 'admin_override') = (override_of_winner_id is not null)
    and (override_of_winner_id is null) = (override_reason is null)
    and (override_reason is null or (
      override_reason = btrim(override_reason) and char_length(override_reason) between 8 and 500
    ))
  )
);
comment on table app.fantasy_prize_winners is
  'Prize winners. pending -> verified -> paid, or -> forfeited; an admin override supersedes a row (status overridden) with a new pending row. Verification notes and user ids never leave the database through a public function.';
create unique index fantasy_prize_winners_live_period_idx
  on app.fantasy_prize_winners (fantasy_season_id, tier, period_key)
  where status <> 'overridden';
create index fantasy_prize_winners_user_idx
  on app.fantasy_prize_winners (user_id, fantasy_season_id, tier, status);
create index fantasy_prize_winners_queue_idx
  on app.fantasy_prize_winners (created_at desc, id desc);
create index fantasy_prize_winners_public_idx
  on app.fantasy_prize_winners (created_at desc, id desc)
  where status in ('verified', 'paid');
create index fantasy_prize_winners_prize_idx on app.fantasy_prize_winners (prize_id);
create index fantasy_prize_winners_team_idx on app.fantasy_prize_winners (fantasy_team_id);
create index fantasy_prize_winners_gameweek_idx
  on app.fantasy_prize_winners (gameweek_id) where gameweek_id is not null;
create index fantasy_prize_winners_league_idx
  on app.fantasy_prize_winners (league_id) where league_id is not null;
create index fantasy_prize_winners_runner_up_idx
  on app.fantasy_prize_winners (runner_up_team_id) where runner_up_team_id is not null;
create index fantasy_prize_winners_verified_by_idx
  on app.fantasy_prize_winners (verified_by_principal_id) where verified_by_principal_id is not null;
create index fantasy_prize_winners_paid_by_idx
  on app.fantasy_prize_winners (paid_by_principal_id) where paid_by_principal_id is not null;
create index fantasy_prize_winners_forfeited_by_idx
  on app.fantasy_prize_winners (forfeited_by_principal_id) where forfeited_by_principal_id is not null;
create index fantasy_prize_winners_overridden_by_idx
  on app.fantasy_prize_winners (overridden_by_principal_id) where overridden_by_principal_id is not null;
create index fantasy_prize_winners_superseded_by_idx
  on app.fantasy_prize_winners (superseded_by_winner_id) where superseded_by_winner_id is not null;
create index fantasy_prize_winners_override_of_idx
  on app.fantasy_prize_winners (override_of_winner_id) where override_of_winner_id is not null;
create trigger fantasy_prize_winners_set_updated_at
before update on app.fantasy_prize_winners
for each row execute function app_private.set_updated_at();
alter table app.fantasy_prize_winners enable row level security;
alter table app.fantasy_prize_winners force row level security;
revoke all on app.fantasy_prize_winners from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Skipped accounts
-- ---------------------------------------------------------------------------

create table app.fantasy_prize_skips (
  id uuid primary key default gen_random_uuid(),
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  tier app.fantasy_prize_tier not null,
  period_key text not null,
  league_id uuid references app.fantasy_leagues(id) on delete restrict,
  fantasy_team_id uuid not null references app.fantasy_teams(id) on delete restrict,
  user_id uuid not null references app.profiles(id) on delete restrict,
  points integer not null,
  reason app.fantasy_prize_skip_reason not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint fantasy_prize_skips_period_team_key unique (
    fantasy_season_id, tier, period_key, fantasy_team_id
  )
);
comment on table app.fantasy_prize_skips is
  'Accounts that ranked above a prize winner but were passed over, and why. Only accounts above the winner are logged.';
create index fantasy_prize_skips_team_idx on app.fantasy_prize_skips (fantasy_team_id);
create index fantasy_prize_skips_user_idx on app.fantasy_prize_skips (user_id);
create index fantasy_prize_skips_league_idx
  on app.fantasy_prize_skips (league_id) where league_id is not null;
alter table app.fantasy_prize_skips enable row level security;
alter table app.fantasy_prize_skips force row level security;
revoke all on app.fantasy_prize_skips from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Private flag list (never exposed, never on the profile the owner can read)
-- ---------------------------------------------------------------------------

create table app_private.fantasy_prize_flags (
  user_id uuid primary key references app.profiles(id) on delete cascade,
  reason text not null,
  flagged_by_principal_id uuid not null
    references app_private.staff_principals(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_prize_flags_reason_check check (
    reason = btrim(reason) and char_length(reason) between 8 and 500
  )
);
comment on table app_private.fantasy_prize_flags is
  'Accounts excluded from prizes (suspected multi-accounting, league officials, ...). Kept apart from app.profiles so the owner can never read their own flag.';
create index fantasy_prize_flags_flagged_by_idx
  on app_private.fantasy_prize_flags (flagged_by_principal_id);
create trigger fantasy_prize_flags_set_updated_at
before update on app_private.fantasy_prize_flags
for each row execute function app_private.set_updated_at();
alter table app_private.fantasy_prize_flags enable row level security;
alter table app_private.fantasy_prize_flags force row level security;
revoke all on app_private.fantasy_prize_flags from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Evaluation journal
-- ---------------------------------------------------------------------------

create table app_private.fantasy_prize_evaluations (
  gameweek_id uuid primary key references app.fantasy_gameweeks(id) on delete restrict,
  fantasy_season_id uuid not null references app.fantasy_seasons(id) on delete restrict,
  gameweek_number integer not null,
  season_gameweek_count integer not null,
  outcome jsonb not null,
  evaluated_at timestamptz not null default statement_timestamp(),
  constraint fantasy_prize_evaluations_numbers_check check (
    gameweek_number between 1 and season_gameweek_count
  ),
  constraint fantasy_prize_evaluations_outcome_check check (jsonb_typeof(outcome) = 'object')
);
comment on table app_private.fantasy_prize_evaluations is
  'One row per finalized gameweek whose prizes have been evaluated. Its presence makes a re-run a no-op.';
create index fantasy_prize_evaluations_season_idx
  on app_private.fantasy_prize_evaluations (fantasy_season_id, gameweek_number);
alter table app_private.fantasy_prize_evaluations enable row level security;
alter table app_private.fantasy_prize_evaluations force row level security;
revoke all on app_private.fantasy_prize_evaluations from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin permission
-- ---------------------------------------------------------------------------

insert into app_private.admin_permissions (name, domain, description, requires_recent_auth)
values (
  'prizes.manage', 'prizes',
  'Edits sponsor prizes, verifies and pays prize winners, overrides winners and flags ineligible accounts.',
  true
)
on conflict (name) do nothing;

insert into app_private.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from app_private.admin_roles role
join app_private.admin_permissions permission on permission.name = 'prizes.manage'
where role.name = 'platform_admin'
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------

-- The 4-gameweek block that contains gameweek p_gameweek_number in a season of
-- p_gameweek_count gameweeks. Blocks are cut from gameweek order: 1-4, 5-8,
-- ... A leftover of 2 or 3 is the final block; a leftover of 1 joins the block
-- before it (30 -> ..., 25-28, 29-30; 29 -> ..., 21-24, 25-29).
create function app_private.fantasy_prize_block_bounds(
  p_gameweek_number integer,
  p_gameweek_count integer
)
returns table (block_number integer, first_gameweek_number integer, last_gameweek_number integer)
language plpgsql
immutable
set search_path = ''
as $$
declare full_blocks integer;
declare leftover integer;
declare block_count integer;
declare last_start integer;
begin
  if p_gameweek_count is null or p_gameweek_count not between 1 and 1000
    or p_gameweek_number is null or p_gameweek_number not between 1 and p_gameweek_count then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  full_blocks := p_gameweek_count / 4;
  leftover := p_gameweek_count % 4;
  if leftover = 0 or (leftover = 1 and full_blocks >= 1) then
    block_count := full_blocks;
    last_start := 4 * (full_blocks - 1) + 1;
  else
    block_count := full_blocks + 1;
    last_start := 4 * full_blocks + 1;
  end if;
  if p_gameweek_number >= last_start then
    return query select block_count, last_start, p_gameweek_count;
  else
    return query select (p_gameweek_number - 1) / 4 + 1,
      ((p_gameweek_number - 1) / 4) * 4 + 1,
      ((p_gameweek_number - 1) / 4) * 4 + 4;
  end if;
end;
$$;
revoke all on function app_private.fantasy_prize_block_bounds(integer, integer)
  from public, anon, authenticated, service_role;

-- "hamza_77" -> "h***7". Public surfaces never see more of a username.
create function app_private.fantasy_mask_username(p_username text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_username is null or btrim(p_username) = '' then null
    when char_length(p_username) <= 2 then left(p_username, 1) || '***'
    else left(p_username, 1) || '***' || right(p_username, 1)
  end;
$$;
revoke all on function app_private.fantasy_mask_username(text)
  from public, anon, authenticated, service_role;

-- Staff (active or suspended principals) are excluded from prizes by the Terms.
create function app_private.fantasy_prize_is_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.staff_principals principal
    where principal.auth_user_id = p_user_id
      and principal.status in ('active', 'suspended')
  );
$$;
revoke all on function app_private.fantasy_prize_is_staff(uuid)
  from public, anon, authenticated, service_role;

create function app_private.fantasy_prize_season_settings(p_season_id uuid)
returns table (gameweek_count integer, mini_league_min_members integer, is_default boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(settings.gameweek_count, 30),
    coalesce(settings.mini_league_min_members, 10),
    settings.fantasy_season_id is null
  from (select 1) as one
  left join app.fantasy_prize_settings settings on settings.fantasy_season_id = p_season_id;
$$;
revoke all on function app_private.fantasy_prize_season_settings(uuid)
  from public, anon, authenticated, service_role;

-- The season the admin screens default to: the one open or in play.
create function app_private.fantasy_prize_current_season()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select season.id from app.fantasy_seasons season
  where season.status in ('registration_open', 'active')
  order by season.starts_at desc, season.id desc
  limit 1;
$$;
revoke all on function app_private.fantasy_prize_current_season()
  from public, anon, authenticated, service_role;

-- Points and non-chip transfers of one team over gameweeks [p_first, p_last]
-- of its season (finalized gameweeks only).
create function app_private.fantasy_prize_team_period(
  p_fantasy_team_id uuid,
  p_first integer,
  p_last integer
)
returns table (points integer, transfers integer)
language sql
stable
security definer
set search_path = ''
as $$
  with team as (
    select fantasy_team.id, fantasy_team.fantasy_season_id
    from app.fantasy_teams fantasy_team where fantasy_team.id = p_fantasy_team_id
  ), period_gameweeks as (
    select gameweek.id from app.fantasy_gameweeks gameweek
    join team on team.fantasy_season_id = gameweek.fantasy_season_id
    where gameweek.sequence_number between p_first and p_last
      and gameweek.status in ('finalized', 'corrected') and gameweek.points_state = 'final'
  )
  select
    coalesce((
      select sum(result.final_score)::integer from app.fantasy_team_gameweek_results result
      join period_gameweeks gameweek on gameweek.id = result.gameweek_id
      where result.fantasy_team_id = p_fantasy_team_id and result.state = 'final'
    ), 0),
    coalesce((
      select sum(batch.transfers_count)::integer from app.fantasy_transfer_batches batch
      join period_gameweeks gameweek on gameweek.id = batch.gameweek_id
      where batch.fantasy_team_id = p_fantasy_team_id and batch.status = 'confirmed'
        and (batch.chip_type is null or batch.chip_type not in ('wildcard', 'free_hit'))
    ), 0);
$$;
revoke all on function app_private.fantasy_prize_team_period(uuid, integer, integer)
  from public, anon, authenticated, service_role;

-- Why an account may not win this tier right now, or null when it may.
-- p_ignore_winner_id lets an override ignore the row it is replacing.
create function app_private.fantasy_prize_ineligibility(
  p_season_id uuid,
  p_tier app.fantasy_prize_tier,
  p_user_id uuid,
  p_ignore_winner_id uuid default null
)
returns app.fantasy_prize_skip_reason
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from app_private.fantasy_prize_flags flag where flag.user_id = p_user_id) then
    return 'flagged'::app.fantasy_prize_skip_reason;
  end if;
  if app_private.fantasy_prize_is_staff(p_user_id) then
    return 'staff'::app.fantasy_prize_skip_reason;
  end if;
  if p_tier = 'gameweek' and (
    select count(*) from app.fantasy_prize_winners winner
    where winner.fantasy_season_id = p_season_id and winner.tier = 'gameweek'
      and winner.user_id = p_user_id and winner.status in ('pending', 'verified', 'paid')
      and winner.id is distinct from p_ignore_winner_id
  ) >= 2 then
    return 'gameweek_cap_reached'::app.fantasy_prize_skip_reason;
  end if;
  if p_tier = 'mini_league' and exists (
    select 1 from app.fantasy_prize_winners winner
    where winner.fantasy_season_id = p_season_id and winner.tier = 'mini_league'
      and winner.user_id = p_user_id and winner.status in ('pending', 'verified', 'paid')
      and winner.id is distinct from p_ignore_winner_id
  ) then
    return 'mini_league_cap_reached'::app.fantasy_prize_skip_reason;
  end if;
  return null;
end;
$$;
revoke all on function app_private.fantasy_prize_ineligibility(
  uuid, app.fantasy_prize_tier, uuid, uuid
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Winner selection
-- ---------------------------------------------------------------------------

-- Selects and records the winner of one tier for one period, logging every
-- account passed over on the way down. Returns the outcome for the journal.
create function app_private.fantasy_prize_award(
  p_season_id uuid,
  p_tier app.fantasy_prize_tier,
  p_period_key text,
  p_first integer,
  p_last integer,
  p_gameweek_id uuid,
  p_block_number integer,
  p_league_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prize app.fantasy_prizes%rowtype;
  candidate record;
  skip app.fantasy_prize_skip_reason;
  skipped integer := 0;
  has_winner boolean := false;
  has_runner_up boolean := false;
  winner_team_id uuid;
  winner_user_id uuid;
  winner_team_name text;
  winner_created_at timestamptz;
  winner_points integer;
  winner_transfers integer;
  runner_up_team_id uuid;
  runner_up_created_at timestamptz;
  runner_up_points integer;
  runner_up_transfers integer;
  tie app.fantasy_prize_tie_break;
  new_winner_id uuid;
begin
  if exists (
    select 1 from app.fantasy_prize_winners winner
    where winner.fantasy_season_id = p_season_id and winner.tier = p_tier
      and winner.period_key = p_period_key
  ) then
    return jsonb_build_object('status', 'already_awarded');
  end if;

  select * into prize from app.fantasy_prizes where tier = p_tier and active;
  if not found then
    return jsonb_build_object('status', 'no_active_prize');
  end if;

  for candidate in
    with period_gameweeks as (
      select gameweek.id from app.fantasy_gameweeks gameweek
      where gameweek.fantasy_season_id = p_season_id
        and gameweek.sequence_number between p_first and p_last
        and gameweek.status in ('finalized', 'corrected') and gameweek.points_state = 'final'
    ), period_results as (
      select result.fantasy_team_id, sum(result.final_score)::integer as points
      from app.fantasy_team_gameweek_results result
      join period_gameweeks gameweek on gameweek.id = result.gameweek_id
      where result.state = 'final'
      group by result.fantasy_team_id
    ), period_transfers as (
      select batch.fantasy_team_id, sum(batch.transfers_count)::integer as transfers
      from app.fantasy_transfer_batches batch
      join period_gameweeks gameweek on gameweek.id = batch.gameweek_id
      where batch.status = 'confirmed'
        and (batch.chip_type is null or batch.chip_type not in ('wildcard', 'free_hit'))
      group by batch.fantasy_team_id
    )
    select team.id as team_id, team.user_id, team.name as team_name,
      team.created_at as team_created_at, result.points,
      coalesce(transfer.transfers, 0) as transfers
    from period_results result
    join app.fantasy_teams team on team.id = result.fantasy_team_id
    join app.profiles profile on profile.id = team.user_id
    left join period_transfers transfer on transfer.fantasy_team_id = team.id
    where team.fantasy_season_id = p_season_id
      and team.status = 'active'
      and profile.deleted_at is null
      and (p_league_id is null or exists (
        select 1 from app.fantasy_league_memberships membership
        where membership.league_id = p_league_id
          and membership.fantasy_team_id = team.id and membership.status = 'active'
      ))
    order by result.points desc, coalesce(transfer.transfers, 0) asc,
      team.created_at asc, team.id asc
  loop
    skip := app_private.fantasy_prize_ineligibility(p_season_id, p_tier, candidate.user_id);
    if skip is not null then
      -- Only accounts that would otherwise have won are worth logging.
      if not has_winner then
        insert into app.fantasy_prize_skips (
          fantasy_season_id, tier, period_key, league_id, fantasy_team_id, user_id, points, reason
        ) values (
          p_season_id, p_tier, p_period_key, p_league_id, candidate.team_id, candidate.user_id,
          candidate.points, skip
        ) on conflict (fantasy_season_id, tier, period_key, fantasy_team_id) do nothing;
        skipped := skipped + 1;
      end if;
      continue;
    end if;
    if not has_winner then
      has_winner := true;
      winner_team_id := candidate.team_id;
      winner_user_id := candidate.user_id;
      winner_team_name := candidate.team_name;
      winner_created_at := candidate.team_created_at;
      winner_points := candidate.points;
      winner_transfers := candidate.transfers;
    else
      has_runner_up := true;
      runner_up_team_id := candidate.team_id;
      runner_up_created_at := candidate.team_created_at;
      runner_up_points := candidate.points;
      runner_up_transfers := candidate.transfers;
      exit;
    end if;
  end loop;

  if not has_winner then
    return jsonb_build_object('status', 'no_eligible_candidate', 'skipped', skipped);
  end if;

  tie := (case
    when not has_runner_up or winner_points > runner_up_points then 'outright'
    when winner_transfers < runner_up_transfers then 'fewer_transfers'
    when winner_created_at < runner_up_created_at then 'earlier_registration'
    else 'final_fallback'
  end)::app.fantasy_prize_tie_break;

  insert into app.fantasy_prize_winners (
    fantasy_season_id, tier, period_key, gameweek_id, block_number,
    first_gameweek_number, last_gameweek_number, league_id,
    prize_id, prize_name_fr, prize_name_ar, prize_value_mad,
    fantasy_team_id, user_id, team_name, points, transfers_in_period, team_created_at,
    tie_break, runner_up_team_id
  ) values (
    p_season_id, p_tier, p_period_key, p_gameweek_id, p_block_number,
    p_first, p_last, p_league_id,
    prize.id, prize.name_fr, prize.name_ar, prize.estimated_value_mad,
    winner_team_id, winner_user_id, winner_team_name, winner_points, winner_transfers,
    winner_created_at, tie, runner_up_team_id
  ) returning id into new_winner_id;

  return jsonb_build_object(
    'status', 'awarded', 'winnerId', new_winner_id, 'fantasyTeamId', winner_team_id,
    'points', winner_points, 'tieBreak', tie, 'skipped', skipped
  );
end;
$$;
revoke all on function app_private.fantasy_prize_award(
  uuid, app.fantasy_prize_tier, text, integer, integer, uuid, integer, uuid
) from public, anon, authenticated, service_role;

-- Every tier that closes with this gameweek, then the journal row.
create function app_private.fantasy_prize_evaluate_gameweek(
  p_gameweek_id uuid,
  p_gameweek_count integer,
  p_min_members integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gameweek app.fantasy_gameweeks%rowtype;
  bounds record;
  league record;
  outcome jsonb;
  leagues jsonb := '[]'::jsonb;
begin
  select * into gameweek from app.fantasy_gameweeks where id = p_gameweek_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if gameweek.status not in ('finalized', 'corrected') or gameweek.points_state <> 'final' then
    raise exception using errcode = 'PT409', message = 'gameweek_not_finalized';
  end if;

  outcome := jsonb_build_object('gameweek', app_private.fantasy_prize_award(
    gameweek.fantasy_season_id, 'gameweek', 'gw:' || gameweek.sequence_number::text,
    gameweek.sequence_number, gameweek.sequence_number, gameweek.id, null, null
  ));

  select * into bounds
  from app_private.fantasy_prize_block_bounds(gameweek.sequence_number, p_gameweek_count);
  if bounds.last_gameweek_number = gameweek.sequence_number then
    outcome := outcome || jsonb_build_object('monthly', jsonb_build_object(
      'blockNumber', bounds.block_number,
      'firstGameweekNumber', bounds.first_gameweek_number,
      'lastGameweekNumber', bounds.last_gameweek_number
    ) || app_private.fantasy_prize_award(
      gameweek.fantasy_season_id, 'monthly', 'block:' || bounds.block_number::text,
      bounds.first_gameweek_number, bounds.last_gameweek_number, null, bounds.block_number, null
    ));
  end if;

  if gameweek.sequence_number = p_gameweek_count then
    outcome := outcome || jsonb_build_object('season', app_private.fantasy_prize_award(
      gameweek.fantasy_season_id, 'season', 'season', 1, p_gameweek_count, null, null, null
    ));
    if not exists (select 1 from app.fantasy_prizes prize where prize.tier = 'mini_league' and prize.active) then
      outcome := outcome || jsonb_build_object('miniLeagues', jsonb_build_object('status', 'no_active_prize'));
    else
      -- Oldest league first, so "one merchandise prize per person" resolves the
      -- same way on every run.
      for league in
        select candidate_league.id from app.fantasy_leagues candidate_league
        where candidate_league.fantasy_season_id = gameweek.fantasy_season_id
          and candidate_league.active
          and (
            select count(*) from app.fantasy_league_memberships membership
            join app.fantasy_teams team on team.id = membership.fantasy_team_id
            where membership.league_id = candidate_league.id
              and membership.status = 'active' and team.status = 'active'
          ) >= p_min_members
        order by candidate_league.created_at, candidate_league.id
      loop
        leagues := leagues || jsonb_build_array(
          jsonb_build_object('leagueId', league.id) || app_private.fantasy_prize_award(
            gameweek.fantasy_season_id, 'mini_league', 'league:' || league.id::text,
            1, p_gameweek_count, null, null, league.id
          )
        );
      end loop;
      outcome := outcome || jsonb_build_object('miniLeagues', jsonb_build_object(
        'status', 'evaluated', 'leagues', leagues
      ));
    end if;
  end if;

  insert into app_private.fantasy_prize_evaluations (
    gameweek_id, fantasy_season_id, gameweek_number, season_gameweek_count, outcome
  ) values (
    gameweek.id, gameweek.fantasy_season_id, gameweek.sequence_number, p_gameweek_count, outcome
  );
  return outcome;
end;
$$;
revoke all on function app_private.fantasy_prize_evaluate_gameweek(uuid, integer, integer)
  from public, anon, authenticated, service_role;

-- The trusted worker's entry point: evaluates finalized, not-yet-evaluated
-- gameweeks in sequence order (never skipping ahead of an unfinalized one), at
-- most p_limit per call. Serialized by an advisory lock so the runner and a
-- manual worker can never award the same period twice.
create function api.service_evaluate_fantasy_prizes(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  season record;
  gameweek app.fantasy_gameweeks%rowtype;
  settings record;
  max_finalized integer;
  processed integer := 0;
  has_more boolean := false;
  evaluated jsonb := '[]'::jsonb;
  blocked jsonb := '[]'::jsonb;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('botolago.fantasy_prize_evaluation', 0));

  for season in
    select candidate_season.id
    from app.fantasy_seasons candidate_season
    where exists (
      select 1 from app.fantasy_gameweeks candidate
      where candidate.fantasy_season_id = candidate_season.id
        and candidate.status in ('finalized', 'corrected') and candidate.points_state = 'final'
        and not exists (
          select 1 from app_private.fantasy_prize_evaluations evaluation
          where evaluation.gameweek_id = candidate.id
        )
    )
    order by candidate_season.starts_at, candidate_season.id
  loop
    select * into settings from app_private.fantasy_prize_season_settings(season.id);
    select max(candidate.sequence_number) into max_finalized
    from app.fantasy_gameweeks candidate
    where candidate.fantasy_season_id = season.id
      and candidate.status in ('finalized', 'corrected');
    if max_finalized > settings.gameweek_count then
      -- The season has outgrown its configured length: blocks and the season end
      -- would be wrong. Wait for an admin to correct the setting.
      blocked := blocked || jsonb_build_array(jsonb_build_object(
        'seasonId', season.id, 'reason', 'season_gameweek_count_too_small',
        'gameweekCount', settings.gameweek_count, 'lastFinalizedGameweek', max_finalized
      ));
      continue;
    end if;

    for gameweek in
      select * from app.fantasy_gameweeks candidate
      where candidate.fantasy_season_id = season.id
        and not exists (
          select 1 from app_private.fantasy_prize_evaluations evaluation
          where evaluation.gameweek_id = candidate.id
        )
      order by candidate.sequence_number
    loop
      exit when gameweek.status not in ('finalized', 'corrected') or gameweek.points_state <> 'final';
      if processed >= p_limit then
        has_more := true;
        exit;
      end if;
      evaluated := evaluated || jsonb_build_array(jsonb_build_object(
        'seasonId', season.id,
        'gameweekId', gameweek.id,
        'gameweekNumber', gameweek.sequence_number,
        'outcome', app_private.fantasy_prize_evaluate_gameweek(
          gameweek.id, settings.gameweek_count, settings.mini_league_min_members
        )
      ));
      processed := processed + 1;
    end loop;
    exit when has_more;
  end loop;

  return jsonb_build_object(
    'evaluatedCount', processed, 'evaluated', evaluated, 'blocked', blocked, 'hasMore', has_more
  );
end;
$$;
revoke all on function api.service_evaluate_fantasy_prizes(integer)
  from public, anon, authenticated, service_role;
grant execute on function api.service_evaluate_fantasy_prizes(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Public reads (anon-callable: every parameter is a pg_catalog type)
-- ---------------------------------------------------------------------------

create function api.fantasy_prizes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
      'id', prize.id,
      'tier', prize.tier,
      'name', jsonb_build_object('fr', prize.name_fr, 'ar', coalesce(prize.name_ar, prize.name_fr)),
      'description', jsonb_build_object(
        'fr', prize.description_fr, 'ar', coalesce(prize.description_ar, prize.description_fr)
      ),
      'estimatedValueMad', prize.estimated_value_mad,
      'sponsorName', prize.sponsor_name,
      'sponsorLogoUrl', prize.sponsor_logo_url,
      'imageUrl', prize.image_url
    ) order by array_position(
      array['gameweek', 'monthly', 'season', 'mini_league']::app.fantasy_prize_tier[], prize.tier
    )), '[]'::jsonb))
  from app.fantasy_prizes prize
  where prize.active;
$$;
revoke all on function api.fantasy_prizes() from public, anon, authenticated, service_role;
grant execute on function api.fantasy_prizes() to anon, authenticated, service_role;

-- The winners wall: verified or paid winners of the gameweek, monthly and
-- season tiers, newest first. Team name (as it was when awarded), a masked
-- username and points -- never an email, a display name, a user id or a note.
-- Mini-league winners are left off: private league names are not public.
create function api.fantasy_prize_winners(
  p_limit integer default 20,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  items jsonb;
  last_created timestamptz;
  last_id uuid;
  next_cursor jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50
    or ((p_after_created_at is null) <> (p_after_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  with page as materialized (
    select winner.* from app.fantasy_prize_winners winner
    where winner.status in ('verified', 'paid')
      and winner.tier in ('gameweek', 'monthly', 'season')
      and (p_after_created_at is null
        or (winner.created_at, winner.id) < (p_after_created_at, p_after_id))
    order by winner.created_at desc, winner.id desc
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'tier', page.tier,
      'seasonName', season.name,
      'blockNumber', page.block_number,
      'firstGameweekNumber', page.first_gameweek_number,
      'lastGameweekNumber', page.last_gameweek_number,
      'teamName', page.team_name,
      'maskedUsername', app_private.fantasy_mask_username(profile.username),
      'points', page.points,
      'tieBreak', page.tie_break,
      'prizeName', jsonb_build_object('fr', page.prize_name_fr, 'ar', coalesce(page.prize_name_ar, page.prize_name_fr)),
      'awardedAt', page.created_at
    ) order by page.created_at desc, page.id desc), '[]'::jsonb),
    (array_agg(page.created_at order by page.created_at asc, page.id asc))[1],
    (array_agg(page.id order by page.created_at asc, page.id asc))[1]
  into items, last_created, last_id
  from page
  join app.fantasy_seasons season on season.id = page.fantasy_season_id
  left join app.profiles profile on profile.id = page.user_id and profile.deleted_at is null;

  if last_id is not null and exists (
    select 1 from app.fantasy_prize_winners winner
    where winner.status in ('verified', 'paid')
      and winner.tier in ('gameweek', 'monthly', 'season')
      and (winner.created_at, winner.id) < (last_created, last_id)
  ) then
    next_cursor := jsonb_build_object('createdAt', last_created, 'id', last_id);
  end if;

  return jsonb_build_object('items', items, 'nextCursor', next_cursor);
end;
$$;
revoke all on function api.fantasy_prize_winners(integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function api.fantasy_prize_winners(integer, timestamptz, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin: shared helpers
-- ---------------------------------------------------------------------------

create function app_private.fantasy_prize_assert_reason(p_reason text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or p_reason <> btrim(p_reason) or char_length(p_reason) not between 8 and 500 then
    raise exception using errcode = 'PT400', message = 'prize_reason_invalid';
  end if;
end;
$$;
revoke all on function app_private.fantasy_prize_assert_reason(text)
  from public, anon, authenticated, service_role;

create function app_private.fantasy_prize_admin_json(p_prize app.fantasy_prizes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_prize.id,
    'tier', p_prize.tier,
    'nameFr', p_prize.name_fr,
    'nameAr', p_prize.name_ar,
    'descriptionFr', p_prize.description_fr,
    'descriptionAr', p_prize.description_ar,
    'estimatedValueMad', p_prize.estimated_value_mad,
    'sponsorName', p_prize.sponsor_name,
    'sponsorLogoUrl', p_prize.sponsor_logo_url,
    'imageUrl', p_prize.image_url,
    'active', p_prize.active,
    'updatedAt', p_prize.updated_at
  );
$$;
revoke all on function app_private.fantasy_prize_admin_json(app.fantasy_prizes)
  from public, anon, authenticated, service_role;

create function app_private.fantasy_prize_append_note(
  p_existing text,
  p_label text,
  p_note text
)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(E'\n', p_existing, format(
    '[%s UTC] %s: %s',
    to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), p_label, p_note
  ));
$$;
revoke all on function app_private.fantasy_prize_append_note(text, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin: prizes
-- ---------------------------------------------------------------------------

create function api.admin_list_fantasy_prizes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('prizes.manage', false);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(app_private.fantasy_prize_admin_json(prize) order by array_position(
      array['gameweek', 'monthly', 'season', 'mini_league']::app.fantasy_prize_tier[], prize.tier
    ), prize.active desc, prize.created_at, prize.id)
    from app.fantasy_prizes prize
  ), '[]'::jsonb));
end;
$$;

-- Create (p_prize_id null) or update a prize. The tier is fixed once created.
create function api.admin_save_fantasy_prize(
  p_prize_id uuid,
  p_tier text,
  p_name_fr text,
  p_name_ar text,
  p_description_fr text,
  p_description_ar text,
  p_estimated_value_mad integer,
  p_sponsor_name text,
  p_sponsor_logo_url text,
  p_image_url text,
  p_active boolean,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  existing app.fantasy_prizes%rowtype;
  saved app.fantasy_prizes%rowtype;
  prize_tier app.fantasy_prize_tier;
  url_pattern constant text := '^https://[^[:space:]/@?#]+(/[^[:space:]]*)?$';
  result jsonb;
begin
  actor := app_private.admin_assert_permission('prizes.manage', true);
  perform app_private.fantasy_prize_assert_reason(p_reason);
  if p_tier is null or p_tier not in ('gameweek', 'monthly', 'season', 'mini_league') then
    raise exception using errcode = 'PT400', message = 'prize_tier_invalid';
  end if;
  prize_tier := p_tier::app.fantasy_prize_tier;
  if p_name_fr is null or p_name_fr <> btrim(p_name_fr) or char_length(p_name_fr) not between 2 and 120
    or (p_name_ar is not null and (p_name_ar <> btrim(p_name_ar) or char_length(p_name_ar) not between 2 and 120)) then
    raise exception using errcode = 'PT400', message = 'prize_name_invalid';
  end if;
  if p_description_fr is null or p_description_fr <> btrim(p_description_fr)
    or char_length(p_description_fr) > 1000
    or (p_description_ar is not null and (p_description_ar <> btrim(p_description_ar)
      or char_length(p_description_ar) not between 1 and 1000)) then
    raise exception using errcode = 'PT400', message = 'prize_description_invalid';
  end if;
  if (prize_tier = 'mini_league' and p_estimated_value_mad is not null)
    or (prize_tier <> 'mini_league' and (p_estimated_value_mad is null
      or p_estimated_value_mad not between 0 and 10000000)) then
    raise exception using errcode = 'PT400', message = 'prize_value_invalid';
  end if;
  if p_sponsor_name is not null and (p_sponsor_name <> btrim(p_sponsor_name)
    or char_length(p_sponsor_name) not between 2 and 120) then
    raise exception using errcode = 'PT400', message = 'prize_sponsor_invalid';
  end if;
  if (p_sponsor_logo_url is not null and (char_length(p_sponsor_logo_url) > 2048
      or p_sponsor_logo_url !~ url_pattern))
    or (p_image_url is not null and (char_length(p_image_url) > 2048 or p_image_url !~ url_pattern)) then
    raise exception using errcode = 'PT400', message = 'prize_url_invalid';
  end if;
  if p_active is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  if p_prize_id is not null then
    select * into existing from app.fantasy_prizes where id = p_prize_id for update;
    if not found then
      raise exception using errcode = 'PT404', message = 'prize_not_found';
    end if;
    if existing.tier <> prize_tier then
      raise exception using errcode = 'PT409', message = 'prize_tier_immutable';
    end if;
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'prizes.save_prize', p_idempotency_key,
    jsonb_build_object(
      'prizeId', p_prize_id, 'tier', p_tier, 'nameFr', p_name_fr, 'nameAr', p_name_ar,
      'descriptionFr', p_description_fr, 'descriptionAr', p_description_ar,
      'estimatedValueMad', p_estimated_value_mad, 'sponsorName', p_sponsor_name,
      'sponsorLogoUrl', p_sponsor_logo_url, 'imageUrl', p_image_url, 'active', p_active,
      'reason', p_reason
    )
  );
  if prior is not null then
    return prior;
  end if;

  if p_active and exists (
    select 1 from app.fantasy_prizes other
    where other.tier = prize_tier and other.active and other.id is distinct from p_prize_id
  ) then
    raise exception using errcode = 'PT409', message = 'prize_tier_already_active';
  end if;

  if p_prize_id is null then
    insert into app.fantasy_prizes (
      tier, name_fr, name_ar, description_fr, description_ar, estimated_value_mad,
      sponsor_name, sponsor_logo_url, image_url, active
    ) values (
      prize_tier, p_name_fr, p_name_ar, p_description_fr, p_description_ar, p_estimated_value_mad,
      p_sponsor_name, p_sponsor_logo_url, p_image_url, p_active
    ) returning * into saved;
  else
    update app.fantasy_prizes set
      name_fr = p_name_fr, name_ar = p_name_ar,
      description_fr = p_description_fr, description_ar = p_description_ar,
      estimated_value_mad = p_estimated_value_mad, sponsor_name = p_sponsor_name,
      sponsor_logo_url = p_sponsor_logo_url, image_url = p_image_url, active = p_active
    where id = p_prize_id
    returning * into saved;
  end if;

  perform app_private.write_admin_audit(
    actor, 'prizes.save_prize', 'prizes', saved.id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    case when p_prize_id is null then null
      else jsonb_build_object('status', case when existing.active then 'active' else 'inactive' end) end,
    jsonb_build_object('status', case when saved.active then 'active' else 'inactive' end)
  );

  result := app_private.fantasy_prize_admin_json(saved);
  return app_private.admin_complete_idempotent_operation(
    actor, 'prizes.save_prize', p_idempotency_key, result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: season settings
-- ---------------------------------------------------------------------------

create function app_private.fantasy_prize_settings_json(p_season_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'seasonId', season.id,
    'seasonName', season.name,
    'gameweekCount', settings.gameweek_count,
    'miniLeagueMinMembers', settings.mini_league_min_members,
    'isDefault', settings.is_default,
    'lastFinalizedGameweek', (
      select max(gameweek.sequence_number) from app.fantasy_gameweeks gameweek
      where gameweek.fantasy_season_id = season.id and gameweek.status in ('finalized', 'corrected')
    ),
    'lastEvaluatedGameweek', (
      select max(evaluation.gameweek_number) from app_private.fantasy_prize_evaluations evaluation
      where evaluation.fantasy_season_id = season.id
    ),
    'blocks', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'blockNumber', bounds.block_number,
          'firstGameweekNumber', bounds.first_gameweek_number,
          'lastGameweekNumber', bounds.last_gameweek_number
        ) order by bounds.block_number), '[]'::jsonb)
      from (
        select distinct block.block_number, block.first_gameweek_number, block.last_gameweek_number
        from generate_series(1, settings.gameweek_count) as number
        cross join lateral app_private.fantasy_prize_block_bounds(number, settings.gameweek_count) block
      ) bounds
    )
  )
  from app.fantasy_seasons season
  cross join lateral app_private.fantasy_prize_season_settings(season.id) settings
  where season.id = p_season_id;
$$;
revoke all on function app_private.fantasy_prize_settings_json(uuid)
  from public, anon, authenticated, service_role;

create function api.admin_get_fantasy_prize_settings(p_season_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target uuid;
begin
  perform app_private.admin_assert_permission('prizes.manage', false);
  target := coalesce(p_season_id, app_private.fantasy_prize_current_season());
  if target is null or not exists (select 1 from app.fantasy_seasons where id = target) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;
  return app_private.fantasy_prize_settings_json(target);
end;
$$;

-- A change may not move a block that has already been evaluated, may not make
-- the season shorter than what has been played, and may not move a season end
-- that has already been evaluated.
create function api.admin_save_fantasy_prize_settings(
  p_season_id uuid,
  p_gameweek_count integer,
  p_mini_league_min_members integer,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  current_settings record;
  max_finalized integer;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('prizes.manage', true);
  perform app_private.fantasy_prize_assert_reason(p_reason);
  if p_gameweek_count is null or p_gameweek_count not between 1 and 1000
    or p_mini_league_min_members is null or p_mini_league_min_members not between 2 and 100000 then
    raise exception using errcode = 'PT400', message = 'prize_settings_invalid';
  end if;
  if p_season_id is null or not exists (select 1 from app.fantasy_seasons where id = p_season_id) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'prizes.save_settings', p_idempotency_key,
    jsonb_build_object(
      'seasonId', p_season_id, 'gameweekCount', p_gameweek_count,
      'miniLeagueMinMembers', p_mini_league_min_members, 'reason', p_reason
    )
  );
  if prior is not null then
    return prior;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('botolago.fantasy_prize_evaluation', 0));
  select * into current_settings from app_private.fantasy_prize_season_settings(p_season_id);
  select max(gameweek.sequence_number) into max_finalized
  from app.fantasy_gameweeks gameweek
  where gameweek.fantasy_season_id = p_season_id and gameweek.status in ('finalized', 'corrected');

  -- Checked one after another: once the new length covers every finalized
  -- gameweek, every evaluated gameweek fits in both lengths and the block
  -- comparison below cannot be asked about a gameweek outside the season.
  if p_gameweek_count <> current_settings.gameweek_count then
    if p_gameweek_count < coalesce(max_finalized, 0) then
      raise exception using errcode = 'PT409', message = 'prize_settings_conflict';
    end if;
    if exists (
      select 1 from app_private.fantasy_prize_evaluations evaluation
      where evaluation.fantasy_season_id = p_season_id
        and (evaluation.gameweek_number = current_settings.gameweek_count
          or evaluation.gameweek_number = p_gameweek_count)
    ) then
      raise exception using errcode = 'PT409', message = 'prize_settings_conflict';
    end if;
    if exists (
      select 1 from app_private.fantasy_prize_evaluations evaluation
      cross join lateral app_private.fantasy_prize_block_bounds(
        evaluation.gameweek_number, current_settings.gameweek_count) old_block
      cross join lateral app_private.fantasy_prize_block_bounds(
        evaluation.gameweek_number, p_gameweek_count) new_block
      where evaluation.fantasy_season_id = p_season_id
        and ((old_block.last_gameweek_number = evaluation.gameweek_number)
          <> (new_block.last_gameweek_number = evaluation.gameweek_number)
          or (old_block.last_gameweek_number = evaluation.gameweek_number
            and (old_block.first_gameweek_number, old_block.block_number)
              <> (new_block.first_gameweek_number, new_block.block_number)))
    ) then
      raise exception using errcode = 'PT409', message = 'prize_settings_conflict';
    end if;
  end if;

  insert into app.fantasy_prize_settings (fantasy_season_id, gameweek_count, mini_league_min_members)
  values (p_season_id, p_gameweek_count, p_mini_league_min_members)
  on conflict (fantasy_season_id) do update set
    gameweek_count = excluded.gameweek_count,
    mini_league_min_members = excluded.mini_league_min_members;

  perform app_private.write_admin_audit(
    actor, 'prizes.save_settings', 'prizes', p_season_id, p_reason, p_idempotency_key,
    gen_random_uuid(), null, null, jsonb_build_object('status', 'saved')
  );

  result := app_private.fantasy_prize_settings_json(p_season_id);
  return app_private.admin_complete_idempotent_operation(
    actor, 'prizes.save_settings', p_idempotency_key, result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: winners
-- ---------------------------------------------------------------------------

-- The admin view of a winner. It carries the contact email: verifying and
-- delivering a prize means reaching the winner, and only prizes.manage (MFA)
-- can call it.
create function app_private.fantasy_prize_winner_admin_json(p_winner app.fantasy_prize_winners)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_winner.id,
    'tier', p_winner.tier,
    'seasonId', p_winner.fantasy_season_id,
    'seasonName', season.name,
    'periodKey', p_winner.period_key,
    'blockNumber', p_winner.block_number,
    'firstGameweekNumber', p_winner.first_gameweek_number,
    'lastGameweekNumber', p_winner.last_gameweek_number,
    'leagueId', p_winner.league_id,
    'leagueName', league.name,
    'prizeId', p_winner.prize_id,
    'prizeNameFr', p_winner.prize_name_fr,
    'prizeValueMad', p_winner.prize_value_mad,
    'fantasyTeamId', p_winner.fantasy_team_id,
    'teamName', p_winner.team_name,
    'userId', p_winner.user_id,
    'username', profile.username,
    'displayName', nullif(btrim(profile.display_name), ''),
    'email', auth_user.email,
    'points', p_winner.points,
    'transfersInPeriod', p_winner.transfers_in_period,
    'teamCreatedAt', p_winner.team_created_at,
    'tieBreak', p_winner.tie_break,
    'runnerUpTeamName', runner_up.name,
    'runnerUpUsername', runner_up_profile.username,
    'status', p_winner.status,
    'verificationNotes', p_winner.verification_notes,
    'verifiedAt', p_winner.verified_at,
    'paidAt', p_winner.paid_at,
    'forfeitedAt', p_winner.forfeited_at,
    'overriddenAt', p_winner.overridden_at,
    'supersededByWinnerId', p_winner.superseded_by_winner_id,
    'overrideOfWinnerId', p_winner.override_of_winner_id,
    'overrideReason', p_winner.override_reason,
    'flagged', exists (
      select 1 from app_private.fantasy_prize_flags flag where flag.user_id = p_winner.user_id
    ),
    'skipped', coalesce((
      select jsonb_agg(jsonb_build_object(
          'teamName', skipped_team.name,
          'username', skipped_profile.username,
          'points', skip.points,
          'reason', skip.reason
        ) order by skip.points desc, skip.created_at)
      from app.fantasy_prize_skips skip
      join app.fantasy_teams skipped_team on skipped_team.id = skip.fantasy_team_id
      left join app.profiles skipped_profile on skipped_profile.id = skip.user_id
      where skip.fantasy_season_id = p_winner.fantasy_season_id
        and skip.tier = p_winner.tier and skip.period_key = p_winner.period_key
    ), '[]'::jsonb),
    'createdAt', p_winner.created_at
  )
  from app.fantasy_seasons season
  left join app.fantasy_leagues league on league.id = p_winner.league_id
  left join app.profiles profile on profile.id = p_winner.user_id
  left join auth.users auth_user on auth_user.id = p_winner.user_id
  left join app.fantasy_teams runner_up on runner_up.id = p_winner.runner_up_team_id
  left join app.profiles runner_up_profile on runner_up_profile.id = runner_up.user_id
  where season.id = p_winner.fantasy_season_id;
$$;
revoke all on function app_private.fantasy_prize_winner_admin_json(app.fantasy_prize_winners)
  from public, anon, authenticated, service_role;

create function api.admin_list_fantasy_prize_winners(
  p_status text default null,
  p_limit integer default 50,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  items jsonb;
  last_created timestamptz;
  last_id uuid;
  next_cursor jsonb;
begin
  perform app_private.admin_assert_permission('prizes.manage', false);
  if (p_status is not null and p_status not in ('pending', 'verified', 'paid', 'forfeited', 'overridden'))
    or p_limit is null or p_limit not between 1 and 100
    or ((p_after_created_at is null) <> (p_after_id is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  with page as materialized (
    select winner as winner_row, winner.created_at, winner.id
    from app.fantasy_prize_winners winner
    where (p_status is null or winner.status = p_status::app.fantasy_prize_winner_status)
      and (p_after_created_at is null
        or (winner.created_at, winner.id) < (p_after_created_at, p_after_id))
    order by winner.created_at desc, winner.id desc
    limit p_limit
  )
  select coalesce(jsonb_agg(app_private.fantasy_prize_winner_admin_json(page.winner_row)
      order by page.created_at desc, page.id desc), '[]'::jsonb),
    (array_agg(page.created_at order by page.created_at asc, page.id asc))[1],
    (array_agg(page.id order by page.created_at asc, page.id asc))[1]
  into items, last_created, last_id
  from page;

  if last_id is not null and exists (
    select 1 from app.fantasy_prize_winners winner
    where (p_status is null or winner.status = p_status::app.fantasy_prize_winner_status)
      and (winner.created_at, winner.id) < (last_created, last_id)
  ) then
    next_cursor := jsonb_build_object('createdAt', last_created, 'id', last_id);
  end if;

  return jsonb_build_object('items', items, 'nextCursor', next_cursor);
end;
$$;

-- pending -> verified -> paid; pending or verified -> forfeited. Paid only after
-- verified. The note is required, appended to the verification notes and used
-- as the audit reason.
create function api.admin_set_fantasy_prize_winner_status(
  p_winner_id uuid,
  p_status text,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  winner app.fantasy_prize_winners%rowtype;
  saved app.fantasy_prize_winners%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('prizes.manage', true);
  perform app_private.fantasy_prize_assert_reason(p_note);
  if p_status is null or p_status not in ('verified', 'paid', 'forfeited') then
    raise exception using errcode = 'PT400', message = 'prize_status_invalid';
  end if;

  select * into winner from app.fantasy_prize_winners where id = p_winner_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'prize_winner_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'prizes.set_winner_status', p_idempotency_key,
    jsonb_build_object('winnerId', p_winner_id, 'status', p_status, 'note', p_note)
  );
  if prior is not null then
    return prior;
  end if;

  if not (
    (winner.status = 'pending' and p_status = 'verified')
    or (winner.status = 'verified' and p_status = 'paid')
    or (winner.status in ('pending', 'verified') and p_status = 'forfeited')
  ) then
    raise exception using errcode = 'PT409', message = 'prize_winner_transition_invalid';
  end if;

  update app.fantasy_prize_winners set
    status = p_status::app.fantasy_prize_winner_status,
    verification_notes = app_private.fantasy_prize_append_note(verification_notes, p_status, p_note),
    verified_at = case when p_status = 'verified' then statement_timestamp() else verified_at end,
    verified_by_principal_id = case when p_status = 'verified' then actor else verified_by_principal_id end,
    paid_at = case when p_status = 'paid' then statement_timestamp() else paid_at end,
    paid_by_principal_id = case when p_status = 'paid' then actor else paid_by_principal_id end,
    forfeited_at = case when p_status = 'forfeited' then statement_timestamp() else forfeited_at end,
    forfeited_by_principal_id = case when p_status = 'forfeited' then actor else forfeited_by_principal_id end
  where id = winner.id
  returning * into saved;

  perform app_private.write_admin_audit(
    actor, 'prizes.set_winner_status', 'prizes', winner.id, p_note, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', winner.status), jsonb_build_object('status', saved.status)
  );

  result := app_private.fantasy_prize_winner_admin_json(saved);
  return app_private.admin_complete_idempotent_operation(
    actor, 'prizes.set_winner_status', p_idempotency_key, result
  );
end;
$$;

create function api.admin_add_fantasy_prize_winner_note(
  p_winner_id uuid,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  saved app.fantasy_prize_winners%rowtype;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('prizes.manage', true);
  perform app_private.fantasy_prize_assert_reason(p_note);
  if not exists (select 1 from app.fantasy_prize_winners where id = p_winner_id) then
    raise exception using errcode = 'PT404', message = 'prize_winner_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'prizes.add_winner_note', p_idempotency_key,
    jsonb_build_object('winnerId', p_winner_id, 'note', p_note)
  );
  if prior is not null then
    return prior;
  end if;

  update app.fantasy_prize_winners set
    verification_notes = app_private.fantasy_prize_append_note(verification_notes, 'note', p_note)
  where id = p_winner_id
  returning * into saved;
  if char_length(saved.verification_notes) > 20000 then
    raise exception using errcode = 'PT400', message = 'prize_notes_too_long';
  end if;

  perform app_private.write_admin_audit(
    actor, 'prizes.add_winner_note', 'prizes', p_winner_id, p_note, p_idempotency_key,
    gen_random_uuid(), null, null, jsonb_build_object('status', saved.status)
  );

  result := app_private.fantasy_prize_winner_admin_json(saved);
  return app_private.admin_complete_idempotent_operation(
    actor, 'prizes.add_winner_note', p_idempotency_key, result
  );
end;
$$;

-- Replace a winner after a data error. The old row is kept (status
-- overridden) and linked to the new pending row; the reason is mandatory and
-- audited. A paid prize cannot be overridden, and the replacement must be
-- eligible under the same rules as automatic selection. The replacement is
-- named by its fantasy team id or by its owner's exact username
-- (case-insensitive) -- exactly one of the two.
create function api.admin_override_fantasy_prize_winner(
  p_winner_id uuid,
  p_fantasy_team_id uuid,
  p_username text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  winner app.fantasy_prize_winners%rowtype;
  team app.fantasy_teams%rowtype;
  replacement app.fantasy_prize_winners%rowtype;
  ineligible app.fantasy_prize_skip_reason;
  period record;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('prizes.manage', true);
  perform app_private.fantasy_prize_assert_reason(p_reason);
  if (p_fantasy_team_id is null) = (p_username is null) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;

  select * into winner from app.fantasy_prize_winners where id = p_winner_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'prize_winner_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'prizes.override_winner', p_idempotency_key,
    jsonb_build_object(
      'winnerId', p_winner_id, 'fantasyTeamId', p_fantasy_team_id, 'username', p_username,
      'reason', p_reason
    )
  );
  if prior is not null then
    return prior;
  end if;

  if winner.status not in ('pending', 'verified', 'forfeited') then
    raise exception using errcode = 'PT409', message = 'prize_winner_not_overridable';
  end if;
  if p_fantasy_team_id is not null then
    select * into team from app.fantasy_teams where id = p_fantasy_team_id;
  else
    select fantasy_team.* into team
    from app.fantasy_teams fantasy_team
    join app.profiles profile on profile.id = fantasy_team.user_id
    where profile.normalized_username = lower(btrim(p_username))
      and fantasy_team.fantasy_season_id = winner.fantasy_season_id;
  end if;
  if not found or team.fantasy_season_id <> winner.fantasy_season_id then
    raise exception using errcode = 'PT404', message = 'prize_override_team_not_found';
  end if;
  if team.id = winner.fantasy_team_id then
    raise exception using errcode = 'PT400', message = 'prize_override_same_team';
  end if;
  if team.status <> 'active'
    or not exists (select 1 from app.profiles profile where profile.id = team.user_id and profile.deleted_at is null)
    or (winner.league_id is not null and not exists (
      select 1 from app.fantasy_league_memberships membership
      where membership.league_id = winner.league_id
        and membership.fantasy_team_id = team.id and membership.status = 'active'
    )) then
    raise exception using errcode = 'PT409', message = 'prize_override_team_ineligible';
  end if;
  ineligible := app_private.fantasy_prize_ineligibility(
    winner.fantasy_season_id, winner.tier, team.user_id, winner.id
  );
  if ineligible is not null then
    raise exception using errcode = 'PT409', message = 'prize_override_team_ineligible',
      detail = ineligible::text;
  end if;

  select * into period from app_private.fantasy_prize_team_period(
    team.id, winner.first_gameweek_number, winner.last_gameweek_number
  );

  update app.fantasy_prize_winners set
    status = 'overridden',
    overridden_at = statement_timestamp(),
    overridden_by_principal_id = actor
  where id = winner.id;

  insert into app.fantasy_prize_winners (
    fantasy_season_id, tier, period_key, gameweek_id, block_number,
    first_gameweek_number, last_gameweek_number, league_id,
    prize_id, prize_name_fr, prize_name_ar, prize_value_mad,
    fantasy_team_id, user_id, team_name, points, transfers_in_period, team_created_at,
    tie_break, override_of_winner_id, override_reason
  ) values (
    winner.fantasy_season_id, winner.tier, winner.period_key, winner.gameweek_id, winner.block_number,
    winner.first_gameweek_number, winner.last_gameweek_number, winner.league_id,
    winner.prize_id, winner.prize_name_fr, winner.prize_name_ar, winner.prize_value_mad,
    team.id, team.user_id, team.name, period.points, period.transfers, team.created_at,
    'admin_override', winner.id, p_reason
  ) returning * into replacement;

  update app.fantasy_prize_winners set superseded_by_winner_id = replacement.id
  where id = winner.id;

  perform app_private.write_admin_audit(
    actor, 'prizes.override_winner', 'prizes', winner.id, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', winner.status), jsonb_build_object('status', 'overridden')
  );

  result := app_private.fantasy_prize_winner_admin_json(replacement);
  return app_private.admin_complete_idempotent_operation(
    actor, 'prizes.override_winner', p_idempotency_key, result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: flagged accounts
-- ---------------------------------------------------------------------------

create function api.admin_list_fantasy_prize_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_assert_permission('prizes.manage', false);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
        'userId', flag.user_id,
        'username', profile.username,
        'displayName', nullif(btrim(profile.display_name), ''),
        'reason', flag.reason,
        'flaggedAt', flag.created_at
      ) order by flag.created_at desc, flag.user_id)
    from app_private.fantasy_prize_flags flag
    left join app.profiles profile on profile.id = flag.user_id
  ), '[]'::jsonb));
end;
$$;

-- Flag or clear one account, named by user id (from a winner row) or by exact
-- username (case-insensitive). Exactly one of the two.
create function api.admin_set_fantasy_prize_flag(
  p_user_id uuid,
  p_username text,
  p_flagged boolean,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  prior jsonb;
  target uuid;
  was_flagged boolean;
  result jsonb;
begin
  actor := app_private.admin_assert_permission('prizes.manage', true);
  perform app_private.fantasy_prize_assert_reason(p_reason);
  if p_flagged is null or ((p_user_id is null) = (p_username is null)) then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if p_user_id is not null then
    select profile.id into target from app.profiles profile where profile.id = p_user_id;
  else
    select profile.id into target from app.profiles profile
    where profile.normalized_username = lower(btrim(p_username));
  end if;
  if target is null then
    raise exception using errcode = 'PT404', message = 'prize_account_not_found';
  end if;

  prior := app_private.admin_begin_idempotent_operation(
    actor, 'prizes.set_flag', p_idempotency_key,
    jsonb_build_object('userId', target, 'flagged', p_flagged, 'reason', p_reason)
  );
  if prior is not null then
    return prior;
  end if;

  was_flagged := exists (select 1 from app_private.fantasy_prize_flags flag where flag.user_id = target);
  if p_flagged then
    insert into app_private.fantasy_prize_flags (user_id, reason, flagged_by_principal_id)
    values (target, p_reason, actor)
    on conflict (user_id) do update set
      reason = excluded.reason, flagged_by_principal_id = excluded.flagged_by_principal_id;
  else
    delete from app_private.fantasy_prize_flags where user_id = target;
  end if;

  perform app_private.write_admin_audit(
    actor, 'prizes.set_flag', 'prizes', target, p_reason, p_idempotency_key,
    gen_random_uuid(), null,
    jsonb_build_object('status', case when was_flagged then 'flagged' else 'clear' end),
    jsonb_build_object('status', case when p_flagged then 'flagged' else 'clear' end)
  );

  result := jsonb_build_object('userId', target, 'flagged', p_flagged);
  return app_private.admin_complete_idempotent_operation(
    actor, 'prizes.set_flag', p_idempotency_key, result
  );
end;
$$;

revoke all on function
  api.admin_list_fantasy_prizes(),
  api.admin_save_fantasy_prize(uuid, text, text, text, text, text, integer, text, text, text, boolean, text, uuid),
  api.admin_get_fantasy_prize_settings(uuid),
  api.admin_save_fantasy_prize_settings(uuid, integer, integer, text, uuid),
  api.admin_list_fantasy_prize_winners(text, integer, timestamptz, uuid),
  api.admin_set_fantasy_prize_winner_status(uuid, text, text, uuid),
  api.admin_add_fantasy_prize_winner_note(uuid, text, uuid),
  api.admin_override_fantasy_prize_winner(uuid, uuid, text, text, uuid),
  api.admin_list_fantasy_prize_flags(),
  api.admin_set_fantasy_prize_flag(uuid, text, boolean, text, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  api.admin_list_fantasy_prizes(),
  api.admin_save_fantasy_prize(uuid, text, text, text, text, text, integer, text, text, text, boolean, text, uuid),
  api.admin_get_fantasy_prize_settings(uuid),
  api.admin_save_fantasy_prize_settings(uuid, integer, integer, text, uuid),
  api.admin_list_fantasy_prize_winners(text, integer, timestamptz, uuid),
  api.admin_set_fantasy_prize_winner_status(uuid, text, text, uuid),
  api.admin_add_fantasy_prize_winner_note(uuid, text, uuid),
  api.admin_override_fantasy_prize_winner(uuid, uuid, text, text, uuid),
  api.admin_list_fantasy_prize_flags(),
  api.admin_set_fantasy_prize_flag(uuid, text, boolean, text, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Default prizes (inactive until an admin reviews and switches them on)
-- ---------------------------------------------------------------------------

insert into app.fantasy_prizes (
  id, tier, name_fr, name_ar, description_fr, description_ar,
  estimated_value_mad, sponsor_name, active
) values
  (
    'f7a10000-0000-4000-8000-000000000001', 'gameweek',
    'Recharge inwi + maillot d''un club de la Botola',
    'رصيد inwi + قميص نادٍ من البطولة',
    'Le meilleur score de la journée remporte une recharge inwi et un maillot officiel d''un club de la Botola Pro.',
    'صاحب أعلى نقاط في الجولة يفوز برصيد inwi وقميص رسمي لأحد أندية البطولة الاحترافية.',
    500, 'inwi', false
  ),
  (
    'f7a10000-0000-4000-8000-000000000002', 'monthly',
    'Smartphone',
    'هاتف ذكي',
    'Le meilleur total sur un bloc de 4 journées remporte un smartphone.',
    'صاحب أعلى مجموع نقاط خلال 4 جولات متتالية يفوز بهاتف ذكي.',
    2500, null, false
  ),
  (
    'f7a10000-0000-4000-8000-000000000003', 'season',
    'Voyage pour le derby + smartphone haut de gamme',
    'رحلة لحضور الديربي + هاتف ذكي من الفئة الراقية',
    'Le champion de la saison remporte un voyage pour assister au derby et un smartphone haut de gamme.',
    'بطل الموسم يفوز برحلة لحضور الديربي وهاتف ذكي من الفئة الراقية.',
    25000, null, false
  )
on conflict (id) do nothing;
