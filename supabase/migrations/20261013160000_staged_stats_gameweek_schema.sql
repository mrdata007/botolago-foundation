-- SofaScore staged statistics (docs/backend/SOFASCORE_STAGED_STATS.md), part 1:
-- the Fantasy-side schema. Additive. Nothing changes until the owner switches a
-- season on with app_private.fantasy_staged_stats_configure (default: off).
--
-- A gameweek whose counted matches all have core data is "closed provisional":
-- it stays status 'provisional' (so every scoring function keeps working) and
-- gets closed_at. The "one current gameweek" index no longer counts it, so the
-- next gameweek can open while its points are still provisional.

alter table app.fantasy_gameweeks
  add column closed_at timestamptz,
  add column closed_calculation_version bigint;
alter table app.fantasy_gameweeks add constraint fantasy_gameweeks_closed_check check (
  (closed_at is null and closed_calculation_version is null)
  or (closed_at is not null and closed_calculation_version > 0 and status <> 'scheduled' and status <> 'open'));

drop index app.fantasy_gameweeks_one_current_idx;
create unique index fantasy_gameweeks_one_current_idx
  on app.fantasy_gameweeks (fantasy_season_id)
  where status in ('open', 'locked', 'live', 'provisional', 'finalizing') and closed_at is null;

create table app_private.fantasy_staged_stats_policy (
  season_id uuid primary key references app.fantasy_seasons(id),
  enabled boolean not null default false,
  from_gameweek integer not null check (from_gameweek > 0),
  activated_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

-- What closing a gameweek did: the price pass the next gameweek needs. Same
-- cohort and cursor guards as app_private.fantasy_gameweek_postwork.
create table app_private.fantasy_gameweek_close (
  gameweek_id uuid primary key references app.fantasy_gameweeks(id) on delete restrict,
  calculation_version bigint not null check (calculation_version > 0),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  closed_at timestamptz not null default statement_timestamp(),
  price_source_version bigint not null check (price_source_version > 0),
  price_player_ids uuid[] not null,
  price_after_player_id uuid,
  price_last_request_after uuid,
  price_last_response jsonb check (price_last_response is null or jsonb_typeof(price_last_response) = 'object'),
  prices_completed_at timestamptz,
  completed_at timestamptz,
  check (completed_at is null or prices_completed_at is not null)
);

-- A fixture's scoring mode going from simple to full when full coverage arrives.
create table app_private.fantasy_fixture_mode_changes (
  id bigint generated always as identity primary key,
  gameweek_id uuid not null references app.fantasy_gameweeks(id),
  fixture_id uuid not null references app.fixtures(id),
  from_mode text not null check (from_mode in ('simple', 'full')),
  to_mode text not null check (to_mode in ('simple', 'full')),
  observation_id bigint references app_private.fantasy_fixture_observations(id),
  changed_at timestamptz not null default statement_timestamp()
);
create index fantasy_fixture_mode_changes_fixture on app_private.fantasy_fixture_mode_changes(fixture_id, changed_at);

alter table app_private.fantasy_staged_stats_policy enable row level security;
alter table app_private.fantasy_gameweek_close enable row level security;
alter table app_private.fantasy_fixture_mode_changes enable row level security;
alter table app_private.fantasy_staged_stats_policy force row level security;
alter table app_private.fantasy_gameweek_close force row level security;
alter table app_private.fantasy_fixture_mode_changes force row level security;
revoke all on app_private.fantasy_staged_stats_policy, app_private.fantasy_gameweek_close,
  app_private.fantasy_fixture_mode_changes from public, anon, authenticated, service_role;

create function app_private.fantasy_staged_enabled(p_gameweek_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from app.fantasy_gameweeks g
    join app_private.fantasy_staged_stats_policy p on p.season_id = g.fantasy_season_id
   where g.id = p_gameweek_id and p.enabled and g.sequence_number >= p.from_gameweek);
$$;
revoke all on function app_private.fantasy_staged_enabled(uuid) from public, anon, authenticated, service_role;

-- Owner-run switch. Refuses unless the layers it stands on are on: adaptive
-- scoring (modes) and fixture-ready live scoring (new calculation versions).
create function app_private.fantasy_staged_stats_configure(
  p_season_id uuid, p_enabled boolean, p_from_gameweek integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_season_id is null or p_enabled is null or p_from_gameweek is null or p_from_gameweek < 1 then
    raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  if not exists(select 1 from app.fantasy_seasons where id = p_season_id) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found'; end if;
  if p_enabled and (
    not exists(select 1 from app_private.fantasy_adaptive_policy a where a.season_id = p_season_id and not a.paused)
    or not exists(select 1 from app_private.fantasy_live_scoring_policy l where l.season_id = p_season_id and l.enabled)) then
    raise exception using errcode = 'PT409', message = 'fantasy_staged_stats_prerequisites_missing'; end if;
  insert into app_private.fantasy_staged_stats_policy(season_id, enabled, from_gameweek)
  values (p_season_id, p_enabled, p_from_gameweek)
  on conflict (season_id) do update set enabled = excluded.enabled,
    from_gameweek = excluded.from_gameweek, updated_at = statement_timestamp();
  return jsonb_build_object('seasonId', p_season_id, 'enabled', p_enabled, 'fromGameweek', p_from_gameweek);
end $$;
revoke all on function app_private.fantasy_staged_stats_configure(uuid, boolean, integer)
  from public, anon, authenticated, service_role;

comment on table app_private.fantasy_staged_stats_policy is
  'Per-season switch for staged SofaScore statistics: close a gameweek on core data, refine on later pulls, lock when every match is FINAL or FINAL_LIMITED. Default off.';
comment on column app.fantasy_gameweeks.closed_at is
  'Set when the gameweek closed on provisional points (next gameweek opened); the gameweek stays provisional until locked.';
