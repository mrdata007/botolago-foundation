-- Pilot cap: BotolaGO launches as a PILOT capped at 1,000 managers (owner decision, 2026-10-16).
--
-- Until now nothing enforced a cap (docs/production/2026-10-16-capacity-test-run-sheet.md, Q6). This
-- migration builds one and ships it OFF. Applied, it changes nothing until the owner runs, as a
-- separate authorised operation, `select app_private.pilot_configure(true, 1000);`
-- (docs/production/PILOT_CAP_OWNER_RUNBOOK.md).
--
-- THE RULE. While the cap is on, api.create_fantasy_team refuses a NEW Fantasy team with
-- `PT409 fantasy_pilot_full` once the season already has max_managers counted managers. It is the
-- only function that changes behaviour. Existing managers are unaffected: lineup saves, transfers,
-- chips, leagues, reads and sign-in are other functions and are not touched; a manager who already
-- has a team, or who replays a create with the same idempotency key, gets the same answer as
-- before (those checks run before the cap).
--
-- WHAT IS COUNTED. A "manager" is a Fantasy team of the season being joined whose status is
-- 'active' (the definition the rankings, the lifecycle and the admin overview use), except teams of
-- accounts on app_private.public_ranking_exclusions (the test and QA accounts the owner hid from the
-- rankings on 2026-10-11): they do not use up places, and they are not refused by the cap either, so
-- the owner can keep testing a full pilot. Erased accounts have no team row, so their place is
-- free again; a suspended or archived team does not count.
-- Supabase Auth sign-up is NOT touched: anyone can still create an account, read News, use
-- Pronostics and browse. The cap is on teams, not accounts.
--
-- CONCURRENCY. While the cap is on, a creator takes a transaction-level advisory lock for the season
-- (hashtextextended('fantasy:pilot-cap:' || season id, 0)) before it counts, and holds it to commit.
-- Two simultaneous creations at the last place therefore run one after the other, and the second
-- counts after the first has committed (READ COMMITTED, fresh snapshot per statement), so only one
-- gets the place. A counter row was rejected: it would have to be kept in step with account erasure,
-- hidden accounts and suspensions, while the count is always the truth; the lock costs nothing
-- while the cap is off (it is not taken) and serialises about one short transaction per new manager
-- while on. Lock order is the function's existing one (user, then squads shared) and the pilot
-- lock last, and nothing takes the pilot lock elsewhere, so it cannot deadlock.
--
-- WHAT THE MIGRATION CREATES
--   * app_private.pilot_settings: one row, OFF, max_managers 1000, counting_rule 'teams'.
--   * app_private.pilot_configure(p_enabled, p_max_managers): the owner's switch (postgres only).
--   * app_private.pilot_manager_count(p_season_id): the one definition of the count, used by the
--     guard and by the owner to read where the pilot stands (postgres only).
--   * api.create_fantasy_team, replaced: a copy of its latest definition
--     (20260926003100_ordinary_account_mfa_step_up.sql) with the guard added. `create or replace`
--     keeps its owner and grants. Nothing else in it changes.
--
-- The front end maps fantasy_pilot_full to a clear French and Arabic message
-- (src/backend/fantasy/errors.ts, src/services/fantasy-create-service.ts).

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
create table app_private.pilot_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  max_managers integer not null default 1000,
  counting_rule text not null default 'teams',
  updated_at timestamptz not null default statement_timestamp(),
  constraint pilot_settings_singleton check (id),
  constraint pilot_settings_max_check check (max_managers between 1 and 1000000),
  constraint pilot_settings_rule_check check (counting_rule in ('teams'))
);
insert into app_private.pilot_settings (id) values (true);
alter table app_private.pilot_settings enable row level security;
alter table app_private.pilot_settings force row level security;
revoke all on app_private.pilot_settings from public, anon, authenticated, service_role;
comment on table app_private.pilot_settings is
  'The pilot cap, one row, OFF by default. While enabled, api.create_fantasy_team refuses a new team (PT409 fantasy_pilot_full) once the season has max_managers counted managers (counting_rule teams: active teams, hidden test accounts excluded). Changed only by app_private.pilot_configure.';

create function app_private.pilot_configure(
  p_enabled boolean default null,
  p_max_managers integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result app_private.pilot_settings%rowtype;
begin
  if p_max_managers is not null and p_max_managers not between 1 and 1000000 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- A null leaves that setting as it is.
  update app_private.pilot_settings set
    enabled = coalesce(p_enabled, enabled),
    max_managers = coalesce(p_max_managers, max_managers),
    updated_at = statement_timestamp()
  where id
  returning * into result;
  return jsonb_build_object(
    'enabled', result.enabled,
    'maxManagers', result.max_managers,
    'countingRule', result.counting_rule
  );
end;
$$;
revoke all on function app_private.pilot_configure(boolean, integer)
  from public, anon, authenticated, service_role;
grant execute on function app_private.pilot_configure(boolean, integer) to postgres;
comment on function app_private.pilot_configure(boolean, integer) is
  'Owner-run switch for the pilot cap: (true, 1000) switches it on at 1,000 managers, (false) switches it off, (null, 1500) raises the number and leaves the switch. A null leaves that setting as it is. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- The count
-- ---------------------------------------------------------------------------
create function app_private.pilot_manager_count(p_season_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from app.fantasy_teams team
  where team.fantasy_season_id = p_season_id
    and team.status = 'active'
    and not exists (
      select 1 from app_private.public_ranking_exclusions exclusion
      where exclusion.user_id = team.user_id
    );
$$;
revoke all on function app_private.pilot_manager_count(uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.pilot_manager_count(uuid) to postgres;
comment on function app_private.pilot_manager_count(uuid) is
  'How many managers the pilot cap counts in a Fantasy season: its active teams, minus the accounts hidden from the rankings. The one definition, used by api.create_fantasy_team and read by the owner. Executable by postgres only.';

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
-- As in 20260926003100, with the pilot cap added after the existing-team check.
create or replace function api.create_fantasy_team(
  p_season_id uuid,
  p_gameweek_id uuid,
  p_team_name text,
  p_selection jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare season app.fantasy_seasons%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare requested app.fantasy_gameweeks%rowtype;
declare rules app.fantasy_rulesets%rowtype;
declare request_hash text;
declare existing_hash text;
declare cached_response jsonb;
declare target_team_id uuid;
declare pilot app_private.pilot_settings%rowtype;
declare target_lineup_id uuid;
declare squad_cost numeric(10,2);
begin
  perform app_private.assert_mfa_step_up();
  if current_user_id is null then raise exception using errcode = 'PT401', message = 'fantasy_team_not_found'; end if;
  if p_idempotency_key is null or p_team_name is null
    or p_team_name <> btrim(p_team_name) or char_length(p_team_name) not between 3 and 40
    or p_team_name !~ '^[[:alnum:]][[:alnum:] _''.-]{1,38}[[:alnum:]]$'
  then raise exception using errcode = 'PT400', message = 'invalid_team_name'; end if;
  select * into season from app.fantasy_seasons where id = p_season_id and status in ('registration_open','active');
  if not found then raise exception using errcode = 'PT409', message = 'fantasy_season_closed'; end if;
  select * into requested from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found'; end if;
  if requested.fantasy_season_id <> season.id then raise exception using errcode = 'PT400', message = 'invalid_squad'; end if;
  -- A new team joins the gameweek a squad can still enter. The client names
  -- the one it showed the manager; any other gameweek -- past its deadline,
  -- or no longer the next one -- is refused with the long-standing code.
  gameweek := app_private.fantasy_enrolment_gameweek(season.id);
  if gameweek.id is null or gameweek.id <> requested.id then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  select * into rules from app.fantasy_rulesets where id = season.ruleset_id;
  request_hash := app_private.fantasy_selection_hash(p_team_name, p_gameweek_id, p_selection);
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text || ':fantasy:create:' || p_season_id::text, 0));
  -- 20260925200000: a new squad is checked against the clubs as they stand
  -- once any player list update has finished, and an update waits for it.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'fantasy:squads:' || season.id::text, 0));
  select fantasy_idempotency.request_hash, fantasy_idempotency.response_body
  into existing_hash, cached_response
  from app_private.fantasy_idempotency_keys fantasy_idempotency
  where fantasy_idempotency.user_id = current_user_id
    and fantasy_idempotency.operation = 'create_team'
    and fantasy_idempotency.idempotency_key = p_idempotency_key;
  if found then
    if existing_hash <> request_hash then raise exception using errcode = 'PT409', message = 'idempotency_conflict'; end if;
    return cached_response;
  end if;
  if exists (select 1 from app.fantasy_teams where user_id = current_user_id and fantasy_season_id = season.id) then
    raise exception using errcode = 'PT409', message = 'fantasy_team_already_exists';
  end if;
  -- 20261016170000: the pilot cap. While app_private.pilot_settings.enabled is false (the shipped
  -- state) this block reads one row and does nothing else. A replay (the idempotency check
  -- above) and a manager who already has a team (the check above) never reach it, so the cap
  -- only ever refuses a NEW team. A hidden test or QA account (app_private.public_ranking_exclusions)
  -- neither counts toward the cap nor is refused by it.
  select * into pilot from app_private.pilot_settings where id;
  if pilot.enabled
    and not exists (select 1 from app_private.public_ranking_exclusions exclusion
      where exclusion.user_id = current_user_id)
  then
    -- One creator at a time per season while the cap is on. READ COMMITTED takes a fresh
    -- snapshot for the count below, after this lock is granted, so it sees every team the
    -- previous holder committed; the lock is released at commit or rollback.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('fantasy:pilot-cap:' || season.id::text, 0));
    if app_private.pilot_manager_count(season.id) >= pilot.max_managers then
      raise exception using errcode = 'PT409', message = 'fantasy_pilot_full';
    end if;
  end if;
  perform app_private.fantasy_validate_selection(season.id, season.ruleset_id, p_selection);
  select sum(player.price) into squad_cost
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  if squad_cost > rules.initial_budget then raise exception using errcode = 'PT400', message = 'budget_exceeded'; end if;
  insert into app.fantasy_teams (
    user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
  ) values (
    current_user_id, season.id, gameweek.id, p_team_name,
    rules.initial_budget - squad_cost, squad_cost, rules.initial_free_transfers
  ) returning id into target_team_id;
  insert into app.fantasy_squad_memberships (
    fantasy_team_id, fantasy_player_id, purchase_price, current_sale_price, acquired_gameweek_id
  ) select target_team_id, player.id, player.price, player.price, gameweek.id
  from jsonb_to_recordset(p_selection) as item(fantasy_player_id uuid)
  join app.fantasy_players player on player.id = item.fantasy_player_id;
  insert into app.fantasy_lineups (fantasy_team_id, gameweek_id, team_version)
  values (target_team_id, gameweek.id, 1) returning id into target_lineup_id;
  insert into app.fantasy_lineup_players (
    lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, multiplier, snapshot_price
  ) select target_lineup_id, item.fantasy_player_id, item.slot, item.slot_order,
    item.captain, item.vice_captain,
    case when item.captain then rules.captain_multiplier else 1 end, player.price
  from jsonb_to_recordset(p_selection) as item(
    fantasy_player_id uuid, slot app.fantasy_lineup_slot, slot_order integer,
    captain boolean, vice_captain boolean
  ) join app.fantasy_players player on player.id = item.fantasy_player_id;
  cached_response := app_private.fantasy_team_dto(target_team_id);
  insert into app_private.fantasy_idempotency_keys (
    user_id, operation, idempotency_key, request_hash, response_body, expires_at
  ) values (current_user_id, 'create_team', p_idempotency_key, request_hash, cached_response, statement_timestamp() + interval '7 days');
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, resulting_version, idempotency_key,
    safe_metadata
  ) values (current_user_id, target_team_id, 'create_team', true, 1, p_idempotency_key,
    jsonb_build_object('seasonId', season.id, 'gameweekId', gameweek.id));
  return cached_response;
end;
$$;
